import { readFileSync } from 'node:fs';

export function selectLaunchCandidate(candidates, rollout) {
  const scored = candidates
    .filter((candidate) => candidate.enabled)
    .filter((candidate) => candidate.channel === rollout.channel)
    .filter((candidate) => candidate.region === rollout.primaryRegion)
    .filter((candidate) => !(rollout.freezeMigrations && candidate.migration === 'required'))
    .map((candidate) => {
      let adjustedScore = candidate.score;
      const reasons = [];
      if (candidate.risk === 'high') {
        adjustedScore -= rollout.penalty.highRisk;
        reasons.push('high risk penalty');
      }
      if (candidate.migration === 'required') {
        adjustedScore -= rollout.penalty.migrationRequired;
        reasons.push('migration penalty');
      }
      if (reasons.length === 0) reasons.push('no penalty');
      return { key: candidate.key, adjustedScore, reason: reasons.join(', ') };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore || a.key.localeCompare(b.key));
  if (scored.length === 0) {
    throw new Error('no eligible launch candidate');
  }
  return scored[0];
}

const candidates = JSON.parse(readFileSync('data/candidates.json', 'utf8'));
const rollout = JSON.parse(readFileSync('data/rollout.json', 'utf8'));
export const launchDecision = selectLaunchCandidate(candidates, rollout);
export const launchKey = launchDecision.key;
