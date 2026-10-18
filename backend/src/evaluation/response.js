
function isScore(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

export function buildEvaluationResponse({ trustScore, providers }) {
  if (!isScore(trustScore)) {
    throw new Error('A valid Trust Score is required.');
  }

  if (!providers || typeof providers !== 'object') {
    throw new Error('Provider results are required.');
  }

  const keys = Object.keys(providers);

  if (keys.length === 0) {
    throw new Error('At least one provider result is required.');
  }

  const normalized = {};

  for (const key of keys) {
    const result = providers[key];

    if (
      !result ||
      !isScore(result.confidenceScore) ||
      !isScore(result.evidenceScore) ||
      !Array.isArray(result.evidence)
    ) {
      throw new Error(`Invalid results for ${key}.`);
    }

    normalized[key] = {
      modelId: result.modelId || key,
      name: result.name || key,
      family: result.family || '',
      confidenceScore: result.confidenceScore,
      evidenceScore: result.evidenceScore,
      evidence: result.evidence
    };
  }

  return {
    trustScore,
    providers: normalized
  };
}
