/**
 * Usage-based API billing.
 *
 * Rates are USD per 1 million tokens. Keep these aligned with the provider's
 * official pricing pages. Input/output usage is taken from each API response;
 * cached input tokens are priced separately where supported.
 *
 * This is a billing snapshot, not a live pricing feed. Review rates when
 * providers change pricing or model IDs.
 */

const MODEL_RATES = {
  // xAI / Grok: input, cached input, output (USD per 1M tokens)
  'grok-4.7': { input: 2.00, cachedInput: 0.50, output: 6.00 },
  'grok-4.6': { input: 2.00, cachedInput: 0.50, output: 6.00 },
  'grok-4.5': { input: 2.00, cachedInput: 0.30, output: 6.00 },
  'grok-4.3': { input: 1.25, cachedInput: 0.20, output: 2.50 },
  // This legacy ID redirects to Grok 4.3 on xAI's API.
  'grok-4-1-fast-reasoning': { input: 1.25, cachedInput: 0.20, output: 2.50 },

  'grok-4.20-0309-reasoning': { input: 1.25, cachedInput: 0.20, output: 2.50 },
  'grok-4.20-0309-non-reasoning': { input: 1.25, cachedInput: 0.20, output: 2.50 },
  'grok-4.20-multi-agent-0309': { input: 1.25, cachedInput: 0.20, output: 2.50 },

  // OpenAI: input, cached input, output (USD per 1M tokens)
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10.00 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2.00 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.40 },
  'gpt-4.1': { input: 2.00, cachedInput: 0.50, output: 8.00 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.60 }
};

const LEGACY_RATE_PER_100_PER_MODEL = 0.005;
const LEGACY_MIN_PER_MODEL = 0.005;

function roundUsd(value) {
  return Math.round((value + Number.EPSILON) * 1e8) / 1e8;
}

// Apply one tiered markup to provider API cost for estimates and final charges:
// 20% when the raw total API cost is under $1.00; otherwise 10%.
export function getMarkupPercent(apiCost) {
  return Math.max(0, Number(apiCost) || 0) < 1 ? 20 : 10;
}

export function calculateCustomerPrice(apiCost) {
  const rawCost = Math.max(0, Number(apiCost) || 0);
  return roundUsd(rawCost * (1 + getMarkupPercent(rawCost) / 100));
}

/**
 * usage shape: { input_tokens, cached_input_tokens, output_tokens }
 * Cached input tokens are a subset of input_tokens, not additional tokens.
 */
export function calculateModelUsageCost(modelId, usage) {
  const rates = MODEL_RATES[modelId];
  if (!rates) {
    throw new Error(`No API billing rates configured for model: ${modelId}`);
  }

  const inputTokens = Math.max(0, Number(usage?.input_tokens) || 0);
  const cachedInputTokens = Math.min(
    inputTokens,
    Math.max(0, Number(usage?.cached_input_tokens) || 0)
  );
  const outputTokens = Math.max(0, Number(usage?.output_tokens) || 0);

  const regularInputTokens = inputTokens - cachedInputTokens;
  const cost =
    (regularInputTokens * rates.input +
      cachedInputTokens * rates.cachedInput +
      outputTokens * rates.output) /
    1_000_000;

  return roundUsd(cost);
}

export function calculateUsageCost(usageByModel) {
  const apiModelCosts = {};
  let apiTotal = 0;

  for (const [modelId, usage] of Object.entries(usageByModel || {})) {
    const cost = calculateModelUsageCost(modelId, usage);
    apiModelCosts[modelId] = cost;
    apiTotal += cost;
  }

  const apiCost = roundUsd(apiTotal);
  const customerModelCosts = Object.fromEntries(
    Object.entries(apiModelCosts).map(([modelId, cost]) => [
      modelId,
      calculateCustomerPrice(cost)
    ])
  );

  return {
    api_cost_usd: apiCost,
    cost_usd: calculateCustomerPrice(apiCost),
    api_model_costs_usd: apiModelCosts,
    model_costs_usd: customerModelCosts
  };
}

/**
 * Preflight estimate for the three-stage evaluation pipeline. This estimate is
 * deliberately separate from final billing: final charges use provider usage.
 * It includes a safety multiplier because claim/evidence output length varies.
 */
export function estimateRequestCost(characterCount, modelIds = []) {
  const chars = Math.max(1, Number(characterCount) || 1);
  const estimatedAnswerTokens = Math.ceil(chars / 4);
  const estimatedInputTokens = Math.ceil(estimatedAnswerTokens * 2.5 + 900);
  const estimatedOutputTokens = Math.ceil(estimatedAnswerTokens * 0.75 + 500);
  const safetyMultiplier = 1.5;

  const total = modelIds.reduce((sum, modelId) => {
    const rates = MODEL_RATES[modelId];
    if (!rates) {
      throw new Error(`No API billing rates configured for model: ${modelId}`);
    }

    const estimatedModelCost =
      (estimatedInputTokens * rates.input +
        estimatedOutputTokens * rates.output) /
      1_000_000;
    return sum + estimatedModelCost * safetyMultiplier;
  }, 0);

  return calculateCustomerPrice(total);
}

/**
 * Legacy rough estimate retained for compatibility with older callers.
 */
export function calculateCostPerModel(characterCount) {
  const count = Number(characterCount);
  if (!Number.isFinite(count) || count <= 0) return LEGACY_MIN_PER_MODEL;

  const raw = (count / 100) * LEGACY_RATE_PER_100_PER_MODEL;
  return Math.max(LEGACY_MIN_PER_MODEL, Math.round(raw * 10000) / 10000);
}

export function calculateInputCost(characterCount, modelCount = 2) {
  const models = Math.max(1, Number(modelCount) || 1);
  return Math.round(calculateCostPerModel(characterCount) * models * 10000) / 10000;
}

export function calculateLegacyInputCost(characterCount) {
  return calculateInputCost(characterCount, 2);
}
