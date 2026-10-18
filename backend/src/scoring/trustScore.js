
function validScore(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

function validateWeights(weights, scoreKeys) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    throw new Error('Model weights are required.');
  }

  if (!Array.isArray(scoreKeys) || scoreKeys.length === 0) {
    throw new Error('At least one model score is required.');
  }

  for (const key of scoreKeys) {
    if (
      typeof weights[key] !== 'number' ||
      !Number.isFinite(weights[key]) ||
      weights[key] < 0
    ) {
      throw new Error(`Invalid weight for ${key}.`);
    }
  }

  const total = scoreKeys.reduce((sum, key) => sum + weights[key], 0);

  if (Math.abs(total - 100) > 0.000001) {
    throw new Error('Model weights must total 100%.');
  }
}

export function calculateTrustScore(weights, evidenceScores) {
  if (
    !evidenceScores ||
    typeof evidenceScores !== 'object' ||
    Array.isArray(evidenceScores)
  ) {
    throw new Error('Evidence scores are required.');
  }

  const scoreKeys = Object.keys(evidenceScores);

  validateWeights(weights, scoreKeys);

  for (const key of scoreKeys) {
    if (!validScore(evidenceScores[key])) {
      throw new Error(`A valid evidence score for ${key} is required.`);
    }
  }

  const weightedTotal = scoreKeys.reduce(
    (sum, key) => sum + weights[key] * evidenceScores[key],
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
    if (
      !item ||
      typeof item.status !== 'string' ||
      !Object.prototype.hasOwnProperty.call(points, item.status)
    ) {
      throw new Error('Evidence contains an invalid status.');
    }

    return sum + points[item.status];
  }, 0);

  return Math.round(total / evidence.length);
}
