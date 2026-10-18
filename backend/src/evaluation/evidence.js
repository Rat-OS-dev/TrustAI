
const EVIDENCE_PROMPT = `
You are a factual evidence reviewer for a fact-checking product.

For every factual claim provided, decide one status:
- "supported" — the claim is true based on well-established knowledge and/or real sources
- "contradicted" — the claim is false based on well-established knowledge and/or real sources
- "unverified" — you genuinely cannot determine truth or falsity with reasonable confidence

Important rules:
1. You MAY use your own established world knowledge for widely known, non-controversial facts
   (for example: capitals of countries, basic science, well-documented history).
2. Do NOT invent sources, URLs, quotations, or citations. Only list sources when a real URL is known.
3. If a claim is clearly true from established knowledge but the user supplied no source,
   mark it "supported" and explain that it is established knowledge (not that "no evidence exists").
4. If a claim is clearly false from established knowledge, mark it "contradicted".
5. Use "unverified" only when the claim is genuinely uncertain, speculative, or not checkable.
6. Never say "no evidence was supplied so it is unverified" for basic true facts.
7. Keep explanations short and specific.

Return ONLY a valid JSON array. Each item must have:
- claim: string
- status: "supported", "contradicted", or "unverified"
- explanation: string
- sources: array of objects with "title" and "url" strings (use [] if none)

Do not invent sources. Empty sources array is fine when relying on established knowledge.
`;

function parseJsonResponse(response) {
  if (typeof response !== 'string') {
    throw new Error('Evidence review response was not text.');
  }

  const trimmed = response.trim();
  const withoutFence = trimmed
    .replace(/^\u0060\u0060\u0060(?:json)?\s*/i, '')
    .replace(/\s*\u0060\u0060\u0060$/, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // Some models add a short preamble. Only parse a complete outer JSON array.
    const start = withoutFence.indexOf('[');
    const end = withoutFence.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        // Fall through to a safe, non-content-revealing error.
      }
    }
    throw new Error('Evidence review returned invalid JSON.');
  }
}

export async function verifyEvidence(claims, queryProvider) {
  if (!Array.isArray(claims)) {
    throw new Error('Claims must be an array.');
  }

  if (claims.length === 0) {
    return [];
  }

  const response = await queryProvider(
    `${EVIDENCE_PROMPT}\n\nClaims to review:\n${JSON.stringify(claims)}`
  );

  const evidence = parseJsonResponse(response);

  const validStatuses = new Set([
    'supported',
    'contradicted',
    'unverified'
  ]);

  if (
    !Array.isArray(evidence) ||
    !evidence.every(
      (item) =>
        item &&
        typeof item.claim === 'string' &&
        validStatuses.has(item.status) &&
        typeof item.explanation === 'string' &&
        Array.isArray(item.sources) &&
        item.sources.every(
          (source) =>
            source &&
            typeof source.title === 'string' &&
            typeof source.url === 'string'
        )
    )
  ) {
    throw new Error('Evidence review returned an invalid structure.');
  }

  if (evidence.length === 0) {
    console.warn(
      `Evidence review returned no results for ${claims.length} claim(s); marking them unverified.`
    );

    return claims.map((claim) => ({
      claim,
      status: 'unverified',
      explanation:
        'The provider returned no evidence assessment for this claim, so it remains unverified.',
      sources: []
    }));
  }

  return evidence;
}
