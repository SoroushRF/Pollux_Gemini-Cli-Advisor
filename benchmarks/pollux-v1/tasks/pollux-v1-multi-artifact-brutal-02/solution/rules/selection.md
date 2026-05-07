Candidate must be enabled. Candidate channel must match rollout.channel.
Candidate region must match rollout.primaryRegion. Adjusted score starts at
score. Subtract penalty.highRisk if risk is high. Subtract
penalty.migrationRequired if migration is required. If candidate requires
migration and rollout.freezeMigrations is true, exclude it. Tie-breaker:
lexicographically smallest key. selectLaunchCandidate(candidates, rollout)
returns { key, adjustedScore, reason }. src/launch.mjs exports launchDecision
and launchKey. registry.json and launch-summary.txt must agree with
launchDecision.
