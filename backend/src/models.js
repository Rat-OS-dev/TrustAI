/**
 * Available fact-check models.
 * id = API model string
 * provider = which API to call
 */
export const MODEL_CATALOG = [
  // xAI / Grok
  { id: 'grok-4.7', name: 'Grok 4.7', provider: 'xai', family: 'xAI', description: 'Flagship Grok model' },
  { id: 'grok-4.6', name: 'Grok 4.6', provider: 'xai', family: 'xAI', description: 'Previous flagship Grok' },
  { id: 'grok-4.5', name: 'Grok 4.5', provider: 'xai', family: 'xAI', description: 'Strong general Grok model' },
  { id: 'grok-4.3', name: 'Grok 4.3', provider: 'xai', family: 'xAI', description: 'Long-context Grok model' },
  { id: 'grok-4-1-fast-reasoning', name: 'Grok 4 Fast', provider: 'xai', family: 'xAI', description: 'Fast, lower-cost Grok' },

  // OpenAI
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai', family: 'OpenAI', description: 'Flagship GPT-5' },
  { id: 'gpt-5-mini', name: 'GPT-5 mini', provider: 'openai', family: 'OpenAI', description: 'Faster, cheaper GPT-5' },
  { id: 'gpt-5-nano', name: 'GPT-5 nano', provider: 'openai', family: 'OpenAI', description: 'Smallest GPT-5 tier' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', family: 'OpenAI', description: 'Strong GPT-4.1 model' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', family: 'OpenAI', description: 'Fast, affordable GPT-4o' },

  // Google Gemini — selected for factual evaluation, reasoning, and cost options
  { id: 'gemini-4-argon', name: 'Gemini 4 Argon', provider: 'google', family: 'Google Gemini', description: 'Flagship reasoning model' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'google', family: 'Google Gemini', description: 'Strong all-rounder for evaluation' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', provider: 'google', family: 'Google Gemini', description: 'Balanced speed and reasoning' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'google', family: 'Google Gemini', description: 'High-capability general model' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'google', family: 'Google Gemini', description: 'Advanced reasoning; preview model' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', provider: 'google', family: 'Google Gemini', description: 'Cost-efficient model for repeated checks' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', provider: 'google', family: 'Google Gemini', description: 'Fast, lower-cost evaluation option' }
];

export const MODEL_BY_ID = Object.fromEntries(
  MODEL_CATALOG.map((m) => [m.id, m])
);

export const MIN_MODELS = 2;
// Keep the user-facing selection cap at 10 even though more than 10 models are available.
export const MAX_MODELS = 10;

export function getModelOrThrow(id) {
  const model = MODEL_BY_ID[id];
  if (!model) {
    throw new Error(`Unknown model: ${id}`);
  }
  return model;
}
