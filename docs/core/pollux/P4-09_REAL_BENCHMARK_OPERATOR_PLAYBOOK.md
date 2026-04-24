# P4-09 Real Benchmark Operator Playbook

Version: 1.0 Date: 2026-04-22 Status: Foundation ready for live pilot use

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
12. renders `summary.json` and `report.md`

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
5. `expectedEscalation`, `predictedEscalation`, and `confusionOutcome`
6. `stdoutStatusTagCount`, `malformedStatusTagCount`, `nearMissStatusTagCount`,
   and `toolErrorCount`
7. `tokens.total`, `tokens.advisor`, `tokens.executor`
8. fairness pins
9. `entrypointKind`, `entrypointPath`, and `buildFreshness`
10. `structuredErrorEvidence`
11. `stdoutPath`, `stderrPath`, `telemetryPath`

In `report.md`, always inspect the per-sample diagnostics table before trusting
the aggregate rates. A `missing_event` timing row is the expected place for
valid false negatives: it means Pollux should have escalated for the task and
condition, but no consult-related telemetry appeared.

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
