# P4-09 Real Benchmark Operator Playbook

Version: 1.2 Date: 2026-04-26 Status: Milestone 2 reliability runner plus M3
staged-calibration operator contract

---

## 1) What this playbook is for

This is the operator-facing runbook for the real-model benchmark lane.

It turns the methodology contract into a practical sequence an engineer can
follow without improvising process.

This playbook is intentionally conservative:

1. it lets us run a live pilot now
2. it does not pretend the repo is publishable-ready yet

---

## 2) Current commands

From repo root:

```powershell
npm run benchmark:pollux:real:preflight -- --campaign-id pilot-local-001
```

```powershell
npm run benchmark:pollux:real:pilot -- --campaign-id pilot-local-001 --repeats 3
```

```powershell
npm run benchmark:pollux:real:acceptance -- --acceptance-id m2-acceptance-001 --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_TEMPLATE.json
```

For targeted debugging, constrain runaway samples explicitly:

```powershell
npm run benchmark:pollux:real:pilot -- --campaign-id pilot-debug-001 --repeats 1 --task-ids CAL-BM-04-ESCALATING,PILOT-BM-05-STATUS-WRITE,PILOT-BM-06-YAML-TRANSFORM --max-wall-clock-ms 600000 --max-model-responses 6
```

Optional:

```powershell
npm run benchmark:pollux:real:preflight -- --campaign-id pilot-local-001 --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_TEMPLATE.json
```

```powershell
npm run benchmark:pollux:real:pilot -- --campaign-id pilot-local-001 --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_TEMPLATE.json
```

Artifacts are written under:

`artifacts/pollux/real-runs/<campaign-id>/`

Acceptance artifacts are written under:

`artifacts/pollux/real-runs/<acceptance-id>/`

For Milestone 3 product-value work, the operator contract is now staged:

1. run a full `A` screen on the candidate pool
2. drop only pre-registered `easy` and `flaky` tasks
3. run a full `E` confirmation pass on the survivors
4. freeze the selected task set from `A` and `E` evidence only
5. run a separate final `A` / `E` / `F` value campaign on the frozen subset

Do not reuse calibration-stage `A` or `E` measurements as the final value-suite
`A` or `E` estimates.

---

## 3) Pilot pre-run checklist

Run this before every live pilot:

1. Confirm the current branch/build is the one you want to measure.
2. Confirm the synthetic benchmark lane is green on this build.
3. Confirm the repo has a usable CLI entrypoint:
   - preferred: `bundle/gemini.js`
   - acceptable for pilot only: `scripts/start.js` fallback
4. Confirm the local auth seed exists in `~/.gemini/` if using single-account
   pilot mode.
5. Freeze or at least record the intended task subset and repeat count.
6. Freeze or at least record the pricing snapshot path if you want cost output.
7. Inspect preflight build freshness: publishable runs require a clean worktree,
   generated source commit metadata matching HEAD, and dist commit metadata
   matching source metadata.
8. Inspect the self-report smoke result: valid `<pollux:status .../>` tags must
   parse and strip, and malformed near-misses such as
   `<pollux:statusstuck_on=...>` must be rejected.
9. If using `--repeats > 1`, choose a fresh campaign id or pass
   `--allow-overwrite true` deliberately. The runner now fails fast on duplicate
   artifact roots.

---

## 4) What preflight does

The preflight command checks six things:

1. the CLI entrypoint exists
2. the selected task set exists
3. auth seed files exist for single-account pilot mode
4. publishability blockers are surfaced honestly
5. build freshness metadata is recorded
6. the synthetic self-report parser/stripper smoke check passes

Read:

1. `preflight.json`
2. `preflight.md`

Do not skip this step. If preflight says a campaign is not publishable, treat
that as a feature, not as noise.

---

## 5) What the pilot runner does

The pilot runner:

1. creates an artifact directory for the campaign
2. writes `manifest.json`, `conditions.json`, `corpus-lock.json`
3. creates isolated home/workspace dirs per sample
4. copies auth seed files into the isolated home in pilot mode
5. writes benchmark-owned Pollux settings into the isolated workspace and home
6. runs the real CLI headlessly with `--prompt`
7. parses the real telemetry file
8. evaluates fairness pins using the same pin semantics as the synthetic lane
9. runs the task oracle
10. enforces per-sample wall-clock and model-response ceilings
11. writes one raw JSON record per sample
12. renders pooled `summary.json` and `report.md`
13. when `--repeats > 1`, also renders one full summary/report pair per repeat
14. for Pollux-enabled runs, records one benchmark-visible advisor-attempt event
    per real advisor model call

---

## 6) Expected artifact bundle

For a successful pilot you should expect:

1. `manifest.json`
2. `conditions.json`
3. `corpus-lock.json`
4. `preflight.json`
5. `preflight.md`
6. `pricing-snapshot.json` if provided
7. `raw/<condition>/<task>/run-001.json`
8. `summary.json`
9. `report.md`
10. `repeats/repeat-001.summary.json` when repeats are greater than one
11. `repeats/repeat-001.report.md` when repeats are greater than one

Scratch workspaces/homes are also kept by default so failed samples are easier
to inspect.

---

## 7) What to inspect after a pilot

Start with:

1. `report.md`
2. `summary.json`

Then inspect raw samples for:

1. `invalidated` and `invalidationReason`
2. `promptId`
3. `responseIds`
4. `observedAdvisorCalls`
5. `advisorAttempts`
6. `expectedEscalation`, `predictedEscalation`, and `confusionOutcome`
7. `stdoutStatusTagCount`, `malformedStatusTagCount`, `nearMissStatusTagCount`,
   and `toolErrorCount`
8. `tokens.total`, `tokens.advisor`, `tokens.executor`
9. fairness pins
10. `entrypointKind`, `entrypointPath`, and `buildFreshness`
11. `structuredErrorEvidence`
12. `stdoutPath`, `stderrPath`, `telemetryPath`

In `report.md`, always inspect the per-sample diagnostics table before trusting
the aggregate rates. A `missing_event` timing row is the expected place for
valid false negatives: it means Pollux should have escalated for the task and
condition, but no consult-related telemetry appeared.

For repeat-aware campaigns, read the artifacts in two passes:

1. use top-level `summary.json` and `report.md` for pooled rates across all
   repeats
2. use `repeats/repeat-00N.*` to inspect each repeat as a standalone campaign
3. use `cellAggregateSummaries` and the report's cell-aggregate section to see
   mean/median/stddev behavior by `task x condition`

For canary interpretation, inspect:

1. `canaryConsultSummary` for top-line consult/fail-open counts
2. `canaryReliabilitySummary` for expected-positive consult success, Wilson 95%
   interval, and recovery-path counts
3. `advisorAttempts` in raw samples to see whether success happened on the
   primary attempt, repair retry, or fallback model
4. `advisorFailureKind` only after checking the underlying attempt records

If a task is flaky, fix the task or oracle before increasing repeat counts.

---

## 8) Hard stop rules

Do not publish results if any of these are true:

1. auth isolation is `single_account`
2. preregistration is missing
3. power analysis is missing
4. pricing snapshot is missing
5. corpus minimums are not met
6. required domains are missing
7. required fixture coverage is missing
8. synthetic self-test is not green on the same build
9. live artifact bundle cannot provide the methodology-required evidence
10. build freshness is stale, dirty, or dist/source commit metadata disagrees
11. malformed Pollux status near-misses or unexplained tool errors appear in
    valid samples
12. model-capacity, timeout, or model-call-ceiling invalidations are not
    disclosed separately from task/oracle failures

For Milestone 2 acceptance, also stop if any of these are true:

1. the run is not scoped to the current pilot pair:
   `executor=gemini-3-flash-preview`, `advisor=gemini-3.1-pro-preview`,
   `fallback=gemini-2.5-pro`
2. fewer than `5 campaigns x 3 repeats` are present
3. valid expected-positive canaries are not exactly `30`
4. canary consult success is below `0.90`
5. Wilson 95% lower bound for consult success is below `0.75`
6. any expected-positive canary ends with `parse_error`
7. any expected-positive canary is a false negative
8. any expected-positive canary ends with `budget_exhausted`
9. any core-lane desired outcome fails in the same acceptance batch
10. acceptance used a dirty worktree, dev-script entrypoint, mismatched dist, or
    no frozen pricing snapshot

For quota-sensitive diagnostic reruns, the acceptance command may be paced with
`--campaign-delay-ms <ms>` and may be shortened with `--campaigns <n>` /
`--repeats <n>`. Treat the default `5 campaigns x 3 repeats` as the formal M2
claim run unless a shorter run is explicitly labeled diagnostic.

---

## 9) Transition from pilot to publishable

Use the live pilot lane to answer:

1. Does the runner work end to end?
2. Do the tasks behave consistently?
3. Are invalidation rules sensible?
4. Is the artifact bundle sufficient?
5. What budget do full runs imply?

Only after those answers are boring and stable should we move to:

1. isolated benchmark credentials
2. preregistration
3. power analysis
4. dress rehearsal
5. publishable campaign

For Milestone 3 specifically, treat the selection/evaluation split as part of
publishability:

1. A-screen and E-confirmation are calibration evidence
2. the frozen selected task set is the handoff boundary
3. the final `A` / `E` / `F` value campaign is evaluation evidence
