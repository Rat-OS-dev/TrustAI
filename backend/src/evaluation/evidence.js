
const EVIDENCE_PROMPT = `
You are a factual evidence reviewer.

For every factual claim provided:
1. Assess whether the supplied information supports, contradicts, or fails to establish the claim.
2. Distinguish verifiable evidence from unsupported assertions.
3. Include source URLs only when they are actually provided and identifiable.
4. Never invent sources, URLs, quotations, or citations.
5. If you cannot verify a claim, say so clearly.

Return ONLY a valid JSON array. Each item must have:
- claim: string
- status: "supported", "contradicted", or "unverified"
- explanation: string
- sources: array of objects with "title" and "url" strings

Do not claim that a source was independently checked unless it was actually checked.
`;

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

  let evidence;

  try {
    evidence = JSON.parse(response);
  } catch {
    throw new Error('Evidence review returned invalid JSON.');
  }

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
