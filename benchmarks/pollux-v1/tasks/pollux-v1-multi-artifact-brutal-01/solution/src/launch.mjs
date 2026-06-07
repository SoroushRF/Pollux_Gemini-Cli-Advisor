import { readFileSync } from 'node:fs';

function adjustedScore(candidate) {
  return candidate.score - (candidate.risk === 'high' ? 10 : 0) - (candidate.migration === 'required' ? 3 : 0);
}

export function selectLaunchCandidate(candidates, rollout) {
  const primaryRegion = rollout?.primaryRegion ?? JSON.parse(readFileSync('data/rollout.json', 'utf8')).primaryRegion;
  const eligible = candidates.filter(
    (candidate) => candidate.enabled && candidate.channel === 'stable' && candidate.region === primaryRegion,
  );
  eligible.sort((a, b) => adjustedScore(b) - adjustedScore(a) || a.key.localeCompare(b.key));
  return eligible[0].key;
}

const candidates = JSON.parse(readFileSync('data/candidates.json', 'utf8'));
const rollout = JSON.parse(readFileSync('data/rollout.json', 'utf8'));
export const launchKey = selectLaunchCandidate(candidates, rollout);
