import { readFileSync } from 'node:fs';

export function selectLaunchCandidate(candidates) {
  const top = candidates.filter((candidate) => candidate.enabled).sort((a, b) => b.score - a.score)[0];
  return { key: top.key, adjustedScore: top.score, reason: 'highest raw score' };
}

const candidates = JSON.parse(readFileSync('data/candidates.json', 'utf8'));
export const launchDecision = selectLaunchCandidate(candidates);
export const launchKey = launchDecision.key;
