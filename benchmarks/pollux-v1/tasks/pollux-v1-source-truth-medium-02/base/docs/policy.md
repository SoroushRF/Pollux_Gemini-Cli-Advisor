Legacy docs still say mode is loose, retention is 7 days, rollout is canary, and
guard is open.

The runtime resolver must use config/policy.json for explicit policy fields,
config/defaults.json for missing fields, and config/environment.json for
environment overrides. Environment rollout overrides policy rollout when
present. If environment.disableStrict is true, strict mode is downgraded to
observe. resolvePolicy({ policy, defaults, environment }) must support injected
source objects for the same precedence behavior.
