import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

import { queryGrok } from '../providers/xai.js';
import { queryOpenAI } from '../providers/openai.js';

import { extractClaims } from '../evaluation/claims.js';
import { verifyEvidence } from '../evaluation/evidence.js';
import { buildEvaluationResponse } from '../evaluation/response.js';

import {
  calculateTrustScore,
  calculateEvidenceScore
} from '../scoring/trustScore.js';

import { calculateInputCost } from '../billing.js';

const router = Router();

const PROVIDERS = ['grok', 'openai'];

const queryFunctions = {
  grok: queryGrok,
  openai: queryOpenAI
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SECRET_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;

async function getEvaluatorScores(answer, evidence, queryProvider) {
  const prompt = `
You are evaluating the factual reliability of submitted text.

Return TWO DIFFERENT scores.

SCORE 1: trustScore
This estimates the factual reliability of the submitted text,
considering the evidence, your knowledge, and the claims evaluated.

Rules for trustScore:
- Return an INTEGER from 1 to 99.
- Do NOT return 0.
- Do NOT return 50.
- Scores 1-49 indicate that the text appears more likely to be
  unreliable than reliable.
- Scores 51-99 indicate that the text appears more likely to be
  reliable than unreliable.
- Use the available evidence carefully.
- If evidence is incomplete, make your best directional judgment,
  but do not pretend that an unsupported judgment is a proven fact.
- Lack of supplied sources alone does not prove that a claim is false.
- Consider the accuracy and importance of the claims, not just their tone.

SCORE 2: confidenceScore
This measures how confident you are that YOUR OWN EVALUATION
and its conclusions are well-supported.

Rules for confidenceScore:
- Return an INTEGER from 0 to 100.
- This is NOT the factual reliability score of the submitted text.
- Consider the quality and relevance of the evidence, source reliability,
  completeness of the review, and remaining uncertainty.
- You can be highly confident that a claim is false.
- You can have low confidence in an evaluation even when a claim seems plausible.
- Do not inflate confidence when evidence is missing or weak.

Submitted text:
${answer}

Evidence gathered during the evaluation:
${JSON.stringify(evidence)}

Return ONLY one valid JSON object in this exact format:
{"trustScore": 72, "confidenceScore": 88}

Do not include markdown or any text outside the JSON object.
`;

  const result = await queryProvider(prompt);

  let parsed;

  try {
    parsed = JSON.parse(result);
  } catch {
    throw new Error(
      'A provider returned an invalid evaluation scores response.'
    );
  }

  const trustScore = parsed?.trustScore;
  const confidenceScore = parsed?.confidenceScore;

  if (
    !Number.isInteger(trustScore) ||
    trustScore < 1 ||
    trustScore > 99 ||
    trustScore === 50
  ) {
    throw new Error(
      'A provider returned an invalid Trust Score. It must be 1-99, excluding 50.'
    );
  }

  if (
    !Number.isInteger(confidenceScore) ||
    confidenceScore < 0 ||
    confidenceScore > 100
  ) {
    throw new Error(
      'A provider returned an invalid Evaluator Confidence score.'
    );
  }

  return {
    trustScore,
    confidenceScore
  };
}

function getNonNeutralTrustScore(weights, providerResults) {
  const providerTrustScores = Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      providerResults[provider].trustScore
    ])
  );

  const rawScore = calculateTrustScore(
    weights,
    providerTrustScores
  );

  if (
    typeof rawScore !== 'number' ||
    !Number.isFinite(rawScore)
  ) {
    throw new Error('The combined Trust Score calculation failed.');
  }

  const roundedScore = Math.round(rawScore);

  if (roundedScore !== 50) {
    return roundedScore;
  }

  if (rawScore < 50) {
    return 49;
  }

  if (rawScore > 50) {
    return 51;
  }

  let supportedWeight = 0;
  let contradictedWeight = 0;

  for (const provider of PROVIDERS) {
    const weight = weights[provider];
    const evidence = providerResults[provider].evidence;

    for (const item of evidence) {
      const status =
        typeof item?.status === 'string'
          ? item.status.toLowerCase()
          : '';

      if (status === 'supported') {
        supportedWeight += weight;
      } else if (status === 'contradicted') {
        contradictedWeight += weight;
      }
    }
  }

  if (supportedWeight > contradictedWeight) {
    return 51;
  }

  if (contradictedWeight > supportedWeight) {
    return 49;
  }

  const confidenceDirection = PROVIDERS.reduce(
    (total, provider) => {
      const result = providerResults[provider];

      return total +
        weights[provider] *
        result.confidenceScore *
        (result.trustScore - 50);
    },
    0
  );

  if (confidenceDirection > 0) {
    return 51;
  }

  if (confidenceDirection < 0) {
    return 49;
  }

  return 49;
}

function validateRequest(answer, weights) {
  if (typeof answer !== 'string' || !answer.trim()) {
    return 'Please provide text to fact-check.';
  }

  if (answer.length > 1000) {
    return 'Text must be 1,000 characters or fewer.';
  }

  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    return 'Please provide model weights.';
  }

  const validWeights = PROVIDERS.every(
    (provider) =>
      typeof weights[provider] === 'number' &&
      Number.isFinite(weights[provider]) &&
      weights[provider] >= 5 &&
      weights[provider] <= 100
  );

  const total = PROVIDERS.reduce(
    (sum, provider) => sum + weights[provider],
    0
  );

  if (!validWeights || Math.abs(total - 100) > 0.000001) {
    return 'Grok and OpenAI weights must each be 5–100%, and total 100%.';
  }

  return null;
}

/**
 * Check balance and charge after a successful evaluation.
 * Returns { charged, cost, balance_usd } or throws / returns an error response shape.
 */
async function chargeUserForInput(userId, characterCount) {
  if (!supabaseAdmin) {
    throw new Error('Billing is not configured on the server.');
  }

  const cost = calculateInputCost(characterCount);

  const { data: wallet, error: walletError } = await supabaseAdmin
    .from('wallets')
    .select('balance_usd')
    .eq('user_id', userId)
    .maybeSingle();

  if (walletError || !wallet) {
    throw new Error('Could not load your wallet balance.');
  }

  const currentBalance = Number(wallet.balance_usd) || 0;

  if (currentBalance < cost) {
    const err = new Error(
      `Insufficient balance. This fact-check costs $${cost.toFixed(4)}. Your balance is $${currentBalance.toFixed(4)}.`
    );
    err.statusCode = 402;
    err.cost = cost;
    err.balance_usd = currentBalance;
    throw err;
  }

  const newBalance = Math.round((currentBalance - cost) * 10000) / 10000;

  const { error: updateError } = await supabaseAdmin
    .from('wallets')
    .update({ balance_usd: newBalance })
    .eq('user_id', userId);

  if (updateError) {
    throw new Error('Could not deduct the evaluation cost from your wallet.');
  }

  return {
    charged: true,
    cost_usd: cost,
    balance_usd: newBalance
  };
}

router.post('/', async (req, res) => {
  const { answer, weights } = req.body ?? {};

  const validationError = validateRequest(answer, weights);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const userId = req.authUser?.id;

  if (!userId) {
    return res.status(401).json({
      error: 'Please sign in to your Trust AI account.'
    });
  }

  // Pre-check balance before spending API credits (same formula, no deduction yet)
  const inputLength = answer.trim().length;
  const estimatedCost = calculateInputCost(inputLength);

  try {
    if (supabaseAdmin) {
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from('wallets')
        .select('balance_usd')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletError || !wallet) {
        return res.status(500).json({
          error: 'Could not load your wallet balance.'
        });
      }

      const currentBalance = Number(wallet.balance_usd) || 0;

      if (currentBalance < estimatedCost) {
        return res.status(402).json({
          error: `Insufficient balance. This fact-check costs $${estimatedCost.toFixed(4)}. Your balance is $${currentBalance.toFixed(4)}.`,
          cost_usd: estimatedCost,
          balance_usd: currentBalance
        });
      }
    }

    const providerEntries = await Promise.all(
      PROVIDERS.map(async (provider) => {
        const queryProvider = queryFunctions[provider];

        const claims = await extractClaims(answer, queryProvider);
        const evidence = await verifyEvidence(claims, queryProvider);
        const evidenceScore = calculateEvidenceScore(evidence);

        if (evidenceScore === null) {
          throw new Error(
            `No checkable evidence results were returned for ${provider}.`
          );
        }

        const evaluationScores = await getEvaluatorScores(
          answer,
          evidence,
          queryProvider
        );

        return [
          provider,
          {
            trustScore: evaluationScores.trustScore,
            confidenceScore: evaluationScores.confidenceScore,
            evidenceScore,
            evidence
          }
        ];
      })
    );

    const providerResults = Object.fromEntries(providerEntries);

    const trustScore = getNonNeutralTrustScore(
      weights,
      providerResults
    );

    // Charge only after a successful evaluation
    let billing = {
      charged: false,
      cost_usd: estimatedCost,
      balance_usd: null
    };

    try {
      billing = await chargeUserForInput(userId, inputLength);
    } catch (chargeError) {
      // Evaluation succeeded but charge failed — still return results,
      // but surface the billing problem.
      console.error(
        'Post-evaluation charge failed:',
        chargeError instanceof Error ? chargeError.message : chargeError
      );

      if (chargeError.statusCode === 402) {
        return res.status(402).json({
          error: chargeError.message,
          cost_usd: chargeError.cost,
          balance_usd: chargeError.balance_usd
        });
      }
    }

    const responseData = buildEvaluationResponse({
      trustScore,
      providers: providerResults
    });

    responseData.billing = {
      cost_usd: billing.cost_usd,
      balance_usd: billing.balance_usd,
      charged: billing.charged
    };

    return res.status(200).json(responseData);
  } catch (error) {
    console.error(
      'Trust AI evaluation failed:',
      error instanceof Error ? error.message : error
    );

    return res.status(502).json({
      error:
        'Evaluation failed because a provider or evaluation step returned an error. Please try again later.'
    });
  }
});

export default router;
