/**
 * Pricing: $0.01 per 100 characters of input (pro-rated).
 * Minimum charge: $0.01.
 * Output is free.
 *
 * Examples:
 *   50 chars  → $0.01
 *   100 chars → $0.01
 *   250 chars → $0.025
 *   1000 chars → $0.10
 */
export function calculateInputCost(characterCount) {
  const count = Number(characterCount);

  if (!Number.isFinite(count) || count <= 0) {
    return 0.01;
  }

  const raw = (count / 100) * 0.01;
  const cost = Math.max(0.01, raw);

  // Keep money math to 4 decimal places (e.g. 0.0250)
  return Math.round(cost * 10000) / 10000;
}
