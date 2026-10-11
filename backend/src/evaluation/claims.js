
const FACTUAL_CLAIM_PROMPT = `
You are analyzing an answer for factual reliability.

Extract the distinct, checkable factual claims from the answer.
Include claims about people, dates, events, statistics, science, and history.
Do not treat opinions, preferences, or recommendations as factual claims.
Keep each claim faithful to the original wording.
Do not decide whether a claim is true without evidence.

Return ONLY a valid JSON array of strings.
If there are no checkable factual claims, return [].
Do not include markdown or other text.
`;

export async function extractClaims(answer, queryProvider) {
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('A non-empty answer is required.');
  }

  const response = await queryProvider(
    `${FACTUAL_CLAIM_PROMPT}\n\nAnswer to analyze:\n${answer}`
  );

  let claims;

  try {
    claims = JSON.parse(response);
  } catch {
    throw new Error('Claim extraction returned invalid JSON.');
  }

  if (
    !Array.isArray(claims) ||
    !claims.every(
      (claim) => typeof claim === 'string' && claim.trim().length > 0
    )
  ) {
    throw new Error('Claim extraction returned an invalid claim list.');
  }

  const uniqueClaims = [
    ...new Set(claims.map((claim) => claim.trim()))
  ];

  if (uniqueClaims.length === 0) {
    console.warn(
      'Claim extraction returned no claims; using the submitted text as a fallback claim.'
    );

    return [answer.trim()];
  }

  return uniqueClaims;
}
