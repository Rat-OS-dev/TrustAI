import { getModelOrThrow } from '../models.js';

const SYSTEM_PROMPT =
  'Review the supplied answer for factual reliability. Identify claims that need verification and provide supporting sources where possible. Do not assume a claim is true merely because it appears in the answer.';

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;

  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens);

  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
    return null;
  }

  const promptDetails = usage.prompt_tokens_details || usage.input_tokens_details || {};
  const cachedTokens = Number(
    promptDetails.cached_tokens ??
    promptDetails.cache_read_input_tokens ??
    usage.cached_input_tokens ??
    0
  );

  return {
    input_tokens: Math.max(0, inputTokens),
    cached_input_tokens: Math.max(0, Number.isFinite(cachedTokens) ? cachedTokens : 0),
    output_tokens: Math.max(0, outputTokens)
  };
}

function addUsage(total, usage) {
  const normalized = normalizeUsage(usage);
  if (!normalized) {
    total.complete = false;
    return;
  }

  total.input_tokens += normalized.input_tokens;
  total.cached_input_tokens += normalized.cached_input_tokens;
  total.output_tokens += normalized.output_tokens;
  total.requests += 1;
}

async function callXai(modelId, prompt, systemPrompt = SYSTEM_PROMPT, maxOutputTokens) {
  const apiKey = process.env.XAI_API_KEY;

  if (!apiKey) {
    throw new Error('XAI_API_KEY is not configured.');
  }

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      ...(Number.isInteger(maxOutputTokens) ? { max_tokens: maxOutputTokens } : {})
    })
  });

  if (!response.ok) {
    throw new Error(`xAI API request failed for ${modelId} (${response.status}).`);
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;

  if (typeof result !== 'string' || !result.trim()) {
    throw new Error(`${modelId} returned an empty response.`);
  }

  return { result, usage: data.usage };
}

async function callOpenAI(modelId, prompt, systemPrompt = SYSTEM_PROMPT, maxOutputTokens) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      ...(Number.isInteger(maxOutputTokens) ? { max_completion_tokens: maxOutputTokens } : {})
    })
  });

  const responseText = await response.text();
  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data?.error?.message || responseText || 'No error details returned.';
    console.error(`OpenAI API error for ${modelId} (${response.status}): ${detail}`);
    throw new Error(`OpenAI API request failed for ${modelId} (${response.status}).`);
  }

  const result = data?.choices?.[0]?.message?.content;

  if (typeof result !== 'string' || !result.trim()) {
    throw new Error(`${modelId} returned an empty response.`);
  }

  return { result, usage: data?.usage };
}


async function callAnthropic(modelId, prompt, systemPrompt = SYSTEM_PROMPT, maxOutputTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: Number.isInteger(maxOutputTokens) ? maxOutputTokens : 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const responseText = await response.text();
  let data;
  try { data = JSON.parse(responseText); } catch { data = null; }

  if (!response.ok) {
    const detail = data?.error?.message || responseText || 'No error details returned.';
    console.error(`Anthropic API error for ${modelId} (${response.status}): ${detail}`);
    throw new Error(`Anthropic API request failed for ${modelId} (${response.status}).`);
  }

  const result = Array.isArray(data?.content)
    ? data.content.filter(block => block?.type === 'text').map(block => block.text || '').join('\n')
    : '';

  if (!result.trim()) {
    throw new Error(`${modelId} returned an empty response.`);
  }

  return { result, usage: data?.usage };
}

/**
 * Query a catalog model. The returned function preserves the existing string
 * response contract while exposing aggregate provider usage for billing.
 */
export function makeQueryFunction(modelId) {
  const model = getModelOrThrow(modelId);
  const usageTotals = {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    requests: 0,
    complete: true
  };

  async function queryModel(prompt, options = {}) {
    let response;
    const systemPrompt = typeof options.systemPrompt === 'string' && options.systemPrompt.trim()
      ? options.systemPrompt.trim()
      : SYSTEM_PROMPT;
    const maxOutputTokens = Number.isInteger(options.maxOutputTokens) && options.maxOutputTokens > 0
      ? options.maxOutputTokens
      : undefined;

    if (model.provider === 'xai') {
      response = await callXai(model.id, prompt, systemPrompt, maxOutputTokens);
    } else if (model.provider === 'openai') {
      response = await callOpenAI(model.id, prompt, systemPrompt, maxOutputTokens);
    } else if (model.provider === 'anthropic') {
      response = await callAnthropic(model.id, prompt, systemPrompt, maxOutputTokens);
    } else {
      throw new Error(`Unsupported provider: ${model.provider}`);
    }

    addUsage(usageTotals, response.usage);
    return response.result;
  }

  queryModel.getUsage = () => ({ ...usageTotals });
  return queryModel;
}

// Keep simple exports for any legacy imports
export async function queryGrok(prompt) {
  return makeQueryFunction('grok-4.7')(prompt);
}

export async function queryOpenAI(prompt) {
  return makeQueryFunction('gpt-5')(prompt);
}
