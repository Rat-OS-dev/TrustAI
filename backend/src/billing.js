/**
 * Pricing (multi-model):
 * - $0.005 per model for up to 100 characters (minimum per model)
 * - Above 100 characters: $0.005 per 100 characters per model (pro-rated)
 * - Must select at least 2 models → minimum total charge $0.01
 *
 * Examples (2 models):
 *   50 chars  → 2 × $0.005 = $0.01
 *   100 chars → 2 × $0.005 = $0.01
 *   250 chars → 2 × $0.0125 = $0.025
 *
 * Examples (5 models, 100 chars):
 *   5 × $0.005 = $0.025
 */

const RATE_PER_100_PER_MODEL = 0.005;
const MIN_PER_MODEL = 0.005;

export function calculateCostPerModel(characterCount) {
  const count = Number(characterCount);

  if (!Number.isFinite(count) || count <= 0) {
    return MIN_PER_MODEL;
  }

  const raw = (count / 100) * RATE_PER_100_PER_MODEL;
  const cost = Math.max(MIN_PER_MODEL, raw);
  return Math.round(cost * 10000) / 10000;
}

export function calculateInputCost(characterCount, modelCount = 2) {
  const models = Math.max(1, Number(modelCount) || 1);
  const perModel = calculateCostPerModel(characterCount);
  const total = perModel * models;
  return Math.round(total * 10000) / 10000;
}

// Back-compat alias if anything still calls the old name with one arg
export function calculateLegacyInputCost(characterCount) {
  return calculateInputCost(characterCount, 2);
}
