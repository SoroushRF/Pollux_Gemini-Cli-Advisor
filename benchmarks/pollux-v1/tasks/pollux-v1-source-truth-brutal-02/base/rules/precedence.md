environment overrides release plan. release plan overrides defaults. defaults
override docs. docs are explanatory only and may be stale. For missing values,
fall back to the next lower source. resolveRuntimeDecision(optionalSources) must
apply the same precedence to injected sources when provided. If optionalSources
is omitted, it must read repository config files.
