
const PROVIDERS = ['grok', 'openai', 'gemini'];

function validScore(value) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100;
}

function validateWeights(weights) {
  if (!weights || typeof weights !== 'object') {
    throw new Error('Model weights are required.');
  }

  for (const provider of PROVIDERS) {
    if (
      !validScore(weights[provider]) ||
      weights[provider] < 5
    ) {
      throw new Error(
        `Invalid weight for ${provider}. Each weight must be 5–100%.`
      );
    }
  }

  const total = PROVIDERS.reduce(
    (sum, provider) => sum + weights[provider],
    0
  );

  if (Math.abs(total - 100) > 0.000001) {
    throw new Error('Model weights must total exactly 100%.');
  }
}

export function calculateTrustScore(weights, evidenceScores) {
  validateWeights(weights);

  if (!evidenceScores || typeof evidenceScores !== 'object') {
    throw new Error('Evidence scores are required.');
  }

  for (const provider of PROVIDERS) {
    if (!validScore(evidenceScores[provider])) {
      throw new Error(
        `A valid evidence score for ${provider} is required.`
      );
    }
  }

  const weightedTotal = PROVIDERS.reduce(
    (sum, provider) =>
      sum + weights[provider] * evidenceScores[provider],
    0
  );

  return Math.round(weightedTotal / 100);
}

export function calculateEvidenceScore(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return null;
  }

  const points = {
    supported: 100,
    contradicted: 0,
    unverified: 50
  };

  const total = evidence.reduce((sum, item) => {
    if (!item || !(item.status in points)) {
      throw new Error('Evidence contains an invalid status.');
    }

    return sum + points[item.status];
  }, 0);

  return Math.round(total / evidence.length);
}
