import { readFileSync } from 'node:fs';

export function selectLaunchCandidate(candidates) {
  return candidates
    .filter((candidate) => candidate.enabled)
    .sort((a, b) => b.score - a.score)[0].key;
}

const candidates = JSON.parse(readFileSync('data/candidates.json', 'utf8'));
export const launchKey = selectLaunchCandidate(candidates);
