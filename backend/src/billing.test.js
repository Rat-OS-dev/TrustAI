import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateModelUsageCost,
  calculateUsageCost,
  calculateCustomerPrice,
  estimateRequestCost
} from './billing.js';

test('calculates token costs using input and output rates', () => {
  const cost = calculateModelUsageCost('gpt-5', {
    input_tokens: 1000,
    cached_input_tokens: 200,
    output_tokens: 500
  });

  // 800 uncached input × $1.25/M + 200 cached × $0.125/M + 500 output × $10/M
  assert.equal(cost, 0.006025);
});

test('cached input tokens cannot exceed total input tokens', () => {
  const cost = calculateModelUsageCost('gpt-5-mini', {
    input_tokens: 100,
    cached_input_tokens: 1000,
    output_tokens: 0
  });

  assert.equal(cost, 0.0000025);
});

test('sums actual usage costs across selected models', () => {
  const result = calculateUsageCost({
    'gpt-5': { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100 },
    'gpt-5-mini': { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100 }
  });

  assert.equal(result.api_model_costs_usd['gpt-5'], 0.00225);
  assert.equal(result.api_model_costs_usd['gpt-5-mini'], 0.00045);
  assert.equal(result.api_cost_usd, 0.0027);
  assert.equal(result.cost_usd, calculateCustomerPrice(0.0027));
  assert.ok(result.cost_usd > result.api_cost_usd);
});

test('preflight estimate is model-specific and positive', () => {
  const expensive = estimateRequestCost(500, ['gpt-5']);
  const cheaper = estimateRequestCost(500, ['gpt-5-nano']);

  assert.ok(expensive > 0);
  assert.ok(cheaper > 0);
  assert.ok(expensive > cheaper);
});

test('fails closed if a model has no configured billing rates', () => {
  assert.throws(
    () => calculateModelUsageCost('unknown-model', { input_tokens: 1, output_tokens: 1 }),
    /No API billing rates configured/
  );
});

test('applies one 20% markup when raw API cost is under $1', () => {
  assert.equal(calculateCustomerPrice(0.5), 0.6);
  assert.equal(calculateCustomerPrice(0.99), 1.188);
});

test('applies one 10% markup when raw API cost is $1 or more', () => {
  assert.equal(calculateCustomerPrice(1), 1.1);
  assert.equal(calculateCustomerPrice(2), 2.2);
});

test('preflight estimate applies the correct single tiered markup', () => {
  const estimate = estimateRequestCost(500, ['gpt-5']);
  assert.ok(estimate > 0);
  assert.ok(estimate / 1.2 > 0);
});
