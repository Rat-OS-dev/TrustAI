
import { Router } from 'express';

import { queryGrok } from '../providers/xai.js';
import { queryOpenAI } from '../providers/openai.js';
import { queryGemini } from '../providers/gemini.js';

import { extractClaims } from '../evaluation/claims.js';
import { verifyEvidence } from '../evaluation/evidence.js';
import { buildEvaluationResponse } from '../evaluation/response.js';

import {
  calculateTrustScore,
  calculateEvidenceScore
} from '../scoring/trustScore.js';

const router = Router();

const PROVIDERS = ['grok', 'openai', 'gemini'];

const queryFunctions = {
  grok: queryGrok,
  openai: queryOpenAI,
  gemini: queryGemini
};

async function getConfidenceScore(answer, queryProvider) {
  const prompt = `
Assess your confidence in the factual reliability of the answer below.

Consider the accuracy of its factual claims, the specificity of its
statements, and any uncertainty or limitations.

Do not assume a claim is true merely because it is stated.
Do not claim to have independently verified sources unless you have.
Your score is your own confidence assessment, not an evidence score.

Return ONLY a valid JSON object in this exact format:
{"confidenceScore": 75}

The score must be a number from 0 to 100.
Do not include markdown or any other text.

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

  if (answer.length > 15000) {
    return 'The answer is too long. Please keep it under 15,000 characters.';
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
    return 'Each model weight must be 5–100%, and the total must equal 100%.';
  }

  return null;
}

router.post('/', async (req, res) => {
  const { answer, weights } = req.body ?? {};

  const validationError = validateRequest(answer, weights);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  try {
    const providerEntries = await Promise.all(
      PROVIDERS.map(async (provider) => {
        const queryProvider = queryFunctions[provider];

        // Obtain this provider's own confidence assessment.
        const confidenceScore = await getConfidenceScore(
          answer,
          queryProvider
        );

        // Extract checkable claims using this provider.
        const claims = await extractClaims(answer, queryProvider);

        // Assess the available evidence for those claims.
        const evidence = await verifyEvidence(
          claims,
          queryProvider
        );

        // Calculate a separate evidence score.
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

    // The overall Trust Score uses the weighted Evidence Scores.
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
    // Keep detailed errors in the server logs, not in the public response.
    console.error('Trust AI evaluation failed:', error.message);

    return res.status(502).json({
      error:
        'Evaluation failed because a provider or evaluation step returned an error. Please try again later.'
    });
  }
});

export default router;
