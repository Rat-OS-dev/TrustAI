import { getModelOrThrow } from '../models.js';

const SYSTEM_PROMPT =
  'Review the supplied answer for factual reliability. Identify claims that need verification and provide supporting sources where possible. Do not assume a claim is true merely because it appears in the answer.';

async function callXai(modelId, prompt) {
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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      temperature: 0
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

  return result;
}

async function callOpenAI(modelId, prompt) {
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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
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

  return result;
}


/**
 * Query a model from the catalog by id.
 * Returns a function (prompt) => Promise<string> for use in evaluation steps.
 */
export function makeQueryFunction(modelId) {
  const model = getModelOrThrow(modelId);

  return async function queryModel(prompt) {
    if (model.provider === 'xai') {
      return callXai(model.id, prompt);
    }

    if (model.provider === 'openai') {
      return callOpenAI(model.id, prompt);
    }


    throw new Error(`Unsupported provider: ${model.provider}`);
  };
}

// Keep simple exports for any legacy imports
export async function queryGrok(prompt) {
  return makeQueryFunction('grok-4.7')(prompt);
}

export async function queryOpenAI(prompt) {
  return makeQueryFunction('gpt-5')(prompt);
}
