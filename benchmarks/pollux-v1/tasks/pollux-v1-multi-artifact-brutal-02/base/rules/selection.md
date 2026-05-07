Candidate must be enabled. Candidate channel must match rollout.channel.
Candidate region must match rollout.primaryRegion. Adjusted score starts at
score. Subtract penalty.highRisk if risk is high. Subtract
penalty.migrationRequired if migration is required. If candidate requires
migration and rollout.freezeMigrations is true, exclude it. Tie-breaker:
lexicographically smallest key. selectLaunchCandidate(candidates, rollout)
returns { key, adjustedScore, reason, channel, region, source }. src/launch.mjs
exports launchDecision and launchKey. registry.json must include launchKey and a
launchDecision object matching the runtime decision. launch-summary.txt must
include the selected key, adjusted score, channel/region, and formatted reason.
