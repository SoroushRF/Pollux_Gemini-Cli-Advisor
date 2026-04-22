/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export function tokenCosineSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = buildFreq(tokensA);
  const freqB = buildFreq(tokensB);

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of Object.values(freqA)) {
    normA += value * value;
  }
  for (const value of Object.values(freqB)) {
    normB += value * value;
  }
  if (normA === 0 || normB === 0) return 0;

  for (const [token, countA] of Object.entries(freqA)) {
    const countB = freqB[token];
    if (countB) {
      dot += countA * countB;
    }
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/g)
    .filter((t) => t.length > 0);
}

function buildFreq(tokens: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const token of tokens) {
    out[token] = (out[token] ?? 0) + 1;
  }
  return out;
}
