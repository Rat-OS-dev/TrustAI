/**
 * Available fact-check models.
 * id = API model string
 * provider = which API to call
 */
export const MODEL_CATALOG = [
  // xAI / Grok
  {
    id: 'grok-4.7',
    name: 'Grok 4.7',
    provider: 'xai',
    family: 'xAI',
    description: 'Flagship Grok model'
  },
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    provider: 'xai',
    family: 'xAI',
    description: 'Previous flagship Grok'
  },
  {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    provider: 'xai',
    family: 'xAI',
    description: 'Strong general Grok model'
  },
  {
    id: 'grok-4.3',
    name: 'Grok 4.3',
    provider: 'xai',
    family: 'xAI',
    description: 'Long-context Grok model'
  },
  {
    id: 'grok-4-1-fast-reasoning',
    name: 'Grok 4 Fast',
    provider: 'xai',
    family: 'xAI',
    description: 'Fast, lower-cost Grok'
  },
  // OpenAI
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'openai',
    family: 'OpenAI',
    description: 'Flagship GPT-5'
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 mini',
    provider: 'openai',
    family: 'OpenAI',
    description: 'Faster, cheaper GPT-5'
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 nano',
    provider: 'openai',
    family: 'OpenAI',
    description: 'Smallest GPT-5 tier'
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    family: 'OpenAI',
    description: 'Strong GPT-4.1 model'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'openai',
    family: 'OpenAI',
    description: 'Fast, affordable GPT-4o'
  }

  // Anthropic / Claude
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'anthropic', family: 'Anthropic', description: 'Flagship Claude model' },
  { id: 'claude-opus-5', name: 'Claude Opus 5', provider: 'anthropic', family: 'Anthropic', description: 'Advanced reasoning model' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'anthropic', family: 'Anthropic', description: 'Balanced high-performance model' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic', family: 'Anthropic', description: 'Previous Sonnet generation' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', provider: 'anthropic', family: 'Anthropic', description: 'Fast, lower-cost Claude model' },
];

export const MODEL_BY_ID = Object.fromEntries(
  MODEL_CATALOG.map((m) => [m.id, m])
);

export const MIN_MODELS = 2;
export const MAX_MODELS = 10;

export function getModelOrThrow(id) {
  const model = MODEL_BY_ID[id];
  if (!model) {
    throw new Error(`Unknown model: ${id}`);
  }
  return model;
}
