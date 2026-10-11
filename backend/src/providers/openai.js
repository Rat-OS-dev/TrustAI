
export async function queryOpenAI(prompt) {
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
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Review the supplied answer for factual reliability. Identify claims that need verification and provide supporting sources where possible. Do not assume a claim is true merely because it appears in the answer.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API request failed (${response.status}).`);
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;

  if (typeof result !== 'string' || !result.trim()) {
    throw new Error('OpenAI returned an empty response.');
  }

  return result;
}
