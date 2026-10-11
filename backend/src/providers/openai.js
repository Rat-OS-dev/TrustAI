
export async function queryOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const response = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-6-sol',
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
        ]
      })
    }
  );

  // Read the response once so errors can be inspected in Render logs.
  const responseText = await response.text();

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data?.error?.message ||
      responseText ||
      'No error details returned by OpenAI.';

    console.error(
      `OpenAI API error (${response.status}): ${detail}`
    );

    // Keep the error sent to the website generic.
    throw new Error(
      `OpenAI API request failed (${response.status}).`
    );
  }

  const result = data?.choices?.[0]?.message?.content;

  if (typeof result !== 'string' || !result.trim()) {
    console.error(
      'OpenAI returned no message content:',
      JSON.stringify(data)
    );

    throw new Error('OpenAI returned an empty response.');
  }

  return result;
}
