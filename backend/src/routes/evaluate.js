import { Router } from 'express';

import { queryGrok } from '../providers/xai.js';
import { queryOpenAI } from '../providers/openai.js';

import { extractClaims } from '../evaluation/claims.js';
import { verifyEvidence } from '../evaluation/evidence.js';
import { buildEvaluationResponse } from '../evaluation/response.js';

import {
  calculateTrustScore,
  calculateEvidenceScore
} from '../scoring/trustScore.js';

const router = Router();

const PROVIDERS = ['grok', 'openai'];

const queryFunctions = {
  grok: queryGrok,
  openai: queryOpenAI
};

async function getConfidenceScore(answer, queryProvider) {
  const prompt = `
Assess your confidence in the factual reliability of the answer below.

Consider the accuracy of its factual claims, specificity, uncertainty,
and limitations. Do not assume claims are true merely because they are stated.
Do not claim to have independently verified sources unless you have.

Return ONLY a valid JSON object:
{"confidenceScore": 75}

confidenceScore must be a number from 0 to 100.
Do not include markdown or other text.

Answer to assess:
${answer}
`;

  const result = await queryProvider(prompt);

  let parsed;

  try {
    parsed = JSON.parse(result);
  } catch {
    throw new Error('A provider returned an invalid confidence response.');
  }

  const score = parsed?.confidenceScore;

  if (
    typeof score !== 'number' ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    throw new Error('A provider returned an invalid confidence score.');
  }

  return score;
}

function validateRequest(answer, weights) {
  if (typeof answer !== 'string' || !answer.trim()) {
    return 'Please provide an answer to evaluate.';
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

router.post('/', async (req, res) => {
  const { answer, weights } = req.body ?? {};

  const validationError = validateRequest(answer, weights);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const providerEntries = await Promise.all(
      PROVIDERS.map(async (provider) => {
        const queryProvider = queryFunctions[provider];

        const confidenceScore = await getConfidenceScore(
          answer,
          queryProvider
        );

        const claims = await extractClaims(answer, queryProvider);

        const evidence = await verifyEvidence(
          claims,
          queryProvider
        );

        const evidenceScore = calculateEvidenceScore(evidence);

        if (evidenceScore === null) {
          throw new Error(
            `No checkable evidence results were returned for ${provider}.`
          );
        }

        return [
          provider,
          {
            confidenceScore,
            evidenceScore,
            evidence
          }
        ];
      })
    );

    const providerResults = Object.fromEntries(providerEntries);

    const evidenceScores = Object.fromEntries(
      PROVIDERS.map((provider) => [
        provider,
        providerResults[provider].evidenceScore
      ])
    );

    const trustScore = calculateTrustScore(
      weights,
      evidenceScores
    );

    const responseData = buildEvaluationResponse({
      trustScore,
      providers: providerResults
    });

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Trust AI evaluation failed:', error.message);

    return res.status(502).json({
      error:
        'Evaluation failed because a provider or evaluation step returned an error. Please try again later.'
    });
  }
});

export default router;
