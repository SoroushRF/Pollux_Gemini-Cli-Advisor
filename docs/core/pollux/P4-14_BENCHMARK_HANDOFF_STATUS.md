# P4-14 Benchmark Handoff Status

Version: 1.2 Date: 2026-04-24 Status: Agent handoff snapshot after Milestone 2
pilot-reliability implementation Repo commit: `e605d02f9`

Update note: the live pilot lane now also records advisor-attempt telemetry,
bounded repair/fallback recovery paths, repeat-sliced reports, pooled
cell-aggregate statistics, canary reliability summaries, and a dedicated
Milestone 2 acceptance runner.

---

## 1) Purpose

This document is the benchmark handoff artifact for a follow-on agent.

It is meant to answer:

1. what benchmark systems already exist
2. what each system is for
3. which files define the current implementation
4. what is proven vs not proven
5. what still blocks a publishable real-model benchmark
6. where the next agent should look first

This is not a replacement for the main spec or implementation plan. It is a
navigation map into them.

---

## 2) High-level benchmark state

Pollux now has **three benchmark lanes**:

1. **Synthetic regression lane**
2. **Live pilot lane**
3. **Publishable real-model lane**

Only the first two are implemented enough to run.

The third lane is **not** complete enough for repo-grade claims.

The correct mental model is:

- Lane A verifies plumbing, fairness, telemetry, and reproducibility.
- Lane B runs real models through the real CLI path, but only for local
  pilot-grade evidence.
- Lane C is the final methodology-complete campaign shape, and still has major
  gaps.

Primary doctrine reference:

- `docs/core/pollux/P4-08_REAL_BENCHMARK_DOCTRINE.md`

Primary methodology reference:

- `docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md`

Primary repo/global references:

- `IMPLEMENTATION_PLAN.md`
- `POLLUX_SPEC.md`

---

## 3) Lane-by-lane status

### 3.1 Lane A: Synthetic regression lane

Purpose:

1. verify fairness pins
2. verify synthetic reproducibility
3. verify token reconciliation
4. verify advisor telemetry presence where expected

Current artifact set:

1. `docs/core/pollux/P4-03_SMOKE_BENCHMARK_REPRODUCIBILITY.md`
2. `docs/core/pollux/P4-04_FULL_BENCHMARK_CHECKPOINT_RESUME.md`
3. `docs/core/pollux/P4-05_BENCHMARK_METRICS_REPORT.md`
4. `docs/core/pollux/P4-06_FAIRNESS_AUDIT_LOG.md`

Core implementation files:

1. `packages/test-utils/src/benchmark-harness.ts`
2. `packages/test-utils/src/pollux-benchmark-smoke.ts`
3. `packages/test-utils/src/pollux-benchmark-full.ts`
4. `packages/test-utils/src/pollux-benchmark-report.ts`
5. `packages/test-utils/src/pollux-benchmark-fairness-audit.ts`
6. `packages/test-utils/src/test-rig.ts`
7. `packages/core/src/pollux/benchmark/tasks.ts`

Important note:

The synthetic lane is **not** real-model evidence. It uses the real CLI path but
synthetic/fake response fixtures.

This distinction is explicitly required by:

- `docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md`

### 3.2 Lane B: Live pilot lane

Purpose:

1. validate a standalone live runner
2. validate real CLI execution in isolated homes/workspaces
3. validate telemetry capture and raw artifact bundling
4. validate token, latency, and advisor-call accounting on live runs
5. validate task ergonomics before any publishable campaign

Current implementation exists in:

1. `packages/test-utils/src/pollux-real-types.ts`
2. `packages/test-utils/src/pollux-real-config.ts`
3. `packages/test-utils/src/pollux-live-run-rig.ts`
4. `packages/test-utils/src/pollux-real-preflight.ts`
5. `packages/test-utils/src/pollux-real-report.ts`
6. `packages/test-utils/src/pollux-real-pilot.ts`
7. `packages/test-utils/src/pollux-real-preflight.test.ts`

Current task seed layer exists in:

1. `packages/core/src/pollux/benchmark/realTypes.ts`
2. `packages/core/src/pollux/benchmark/realTasks.ts`
3. `packages/core/src/pollux/benchmark/realTasks.test.ts`

Current docs/templates exist in:

1. `docs/core/pollux/P4-08_REAL_BENCHMARK_DOCTRINE.md`
2. `docs/core/pollux/P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md`
3. `docs/core/pollux/P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md`
4. `docs/core/pollux/P4-11_REAL_BENCHMARK_PREREGISTRATION_TEMPLATE.md`
5. `docs/core/pollux/P4-12_REAL_BENCHMARK_POWER_ANALYSIS_TEMPLATE.md`
6. `docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_TEMPLATE.json`

CLI commands added at repo root:

1. `npm run benchmark:pollux:real:preflight`
2. `npm run benchmark:pollux:real:pilot`
3. `npm run benchmark:pollux:real:acceptance`

Important note:

The live pilot lane is **real** but **non-publishable** by design.

Why:

1. it currently supports `single_account` pilot mode via auth seeding from
   `~/.gemini`
2. the task corpus is still far below methodology minimums
3. Milestone 2 acceptance is scoped to the current pilot pair rather than a
   model-independent publishable claim

### 3.3 Lane C: Publishable real-model lane

Status:

Not fully implemented. The repo now has doctrine/runbook/spec/templates and a
live pilot foundation, but not the full publishable campaign implementation.

The gaps are real and intentional. Do not overstate this lane.

---

## 4) Current live pilot behavior

The live pilot system works like this:

1. pick a task from the real seed corpus
2. pick a condition (`A`, `E`, `F`)
3. create isolated workspace/home dirs
4. seed auth files from the local user home for pilot mode
5. write benchmark-owned Pollux settings to both workspace and home
6. run the real CLI headlessly with `--prompt`
7. parse the telemetry log
8. compute role-tagged token usage, latency, advisor call count, prompt ids,
   response ids
9. evaluate fairness pins using the same fairness logic used by the synthetic
   harness
10. run the task oracle
11. classify invalidations with structured process-error evidence
12. apply bounded advisor recovery: one repair retry for parse/empty responses
    and one fallback-model retry for timeout/capacity/quota failures
13. emit one raw JSON file per sample plus pooled summary/report artifacts
14. when repeats are greater than one, emit one full summary/report pair per
    repeat index
15. aggregate canary reliability and cell-level distribution stats across the
    pooled campaign

Key code paths:

1. entrypoint and conditions: `packages/test-utils/src/pollux-real-config.ts`
2. live runner: `packages/test-utils/src/pollux-live-run-rig.ts`
3. preflight and block analysis:
   `packages/test-utils/src/pollux-real-preflight.ts`
4. campaign summary/report aggregation:
   `packages/test-utils/src/pollux-real-report.ts`
5. pilot campaign executor: `packages/test-utils/src/pollux-real-pilot.ts`
6. Milestone 2 acceptance aggregation/execution:
   `packages/test-utils/src/pollux-real-acceptance.ts`

The runner is intentionally CLI-centered and does **not** call detector helpers
or advisor helpers directly.

That aligns with the runtime-authenticity requirement in:

1. `docs/core/pollux/P4-08_REAL_BENCHMARK_DOCTRINE.md`
2. `POLLUX_SPEC.md`

---

## 5) Current real benchmark condition matrix

Current live conditions are:

### A

1. Pollux disabled
2. executor-only baseline
3. executor model `gemini-3-flash-preview`

### E

1. Pollux disabled
2. stronger executor-only baseline
3. executor model `gemini-3.1-pro-preview`

### F

1. Pollux enabled
2. executor model `gemini-3-flash-preview`
3. advisor model `gemini-3.1-pro-preview`
4. advisor fallback model `gemini-3-flash-preview`
5. observer/fusion detector enabled with current repo-era thresholds

Definition location:

- `packages/test-utils/src/pollux-real-config.ts`

Important note:

The real benchmark deliberately keeps the current A/E/F matrix only. It does not
try to revive historical B/C/D condition semantics from the pre-observer era.

Milestone 2 reliability claims are scoped to this pilot pair only. The repo
should not generalize acceptance results beyond this pair without a fresh
acceptance contract.

---

## 6) Current real seed corpus state

The live pilot seed corpus currently contains **24 tasks**:

1.  **4** benchmark seeds adapted from the existing synthetic corpus.
2.  **20** additional pilot tasks.

Current file:

- `packages/core/src/pollux/benchmark/realTasks.ts`

Current shape:

1.  `8 simple`
2.  `8 moderate`
3.  `8 complex`
4.  `8 escalating`
5.  `16 non-escalating`

Current domain coverage (**Complete**):

1.  `file_authoring`
2.  `json_yaml_transform`
3.  `multi_file_refactor`
4.  `read_then_write`
5.  `shell_tool_chain`
6.  `code_search_summarize`

Current status of methodology-required scale:

1.  ✅ **24 tasks reached.**
2.  ✅ **8 simple reached.**
3.  ✅ **8 moderate reached.**
4.  ✅ **8 complex reached.**
5.  ✅ **8 escalating reached.**
6.  ✅ **16 non-escalating reached.**

The prior scale/domain blockers reported by preflight are now resolved in the
code.

This gap is not theoretical; the live preflight artifact already reports it.

---

## 7) Current preflight status snapshot

The agent ran a smoke preflight campaign:

- `artifacts/pollux/real-runs/foundation-smoke/preflight.md`
- `artifacts/pollux/real-runs/foundation-smoke/preflight.json`

What that preflight proved:

1. there are **no run blockers** for the live pilot lane
2. the CLI bundle entrypoint exists
3. auth seed files exist in the local user home
4. the current repo is pilot-runnable

What that preflight also correctly reported as publishability blockers:

1. ✅ **Corpus scale met (24 tasks)**
2. ✅ **Difficulty stratification met**
3. ✅ **Escalation/non-escalation counts met**
4. ✅ **Domain coverage complete**
5. **Positive fixture coverage missing** (most tasks use shared placeholders)
6. **Negative fixture coverage missing** (most tasks use shared placeholders)
7. **Frozen pricing snapshot missing**
8. publishability still depends on campaign-summary evidence checks that verify
   escalation telemetry is present and well-formed (reason/timing populated for
   consult-related outcomes)

This artifact is an important “truth check” for any follow-on agent: the repo
now has a live benchmark foundation, but it is **not** ready for formal real
benchmark claims.

---

## 8) Telemetry and fairness design decisions already made

These are important. A follow-on agent should preserve them unless the spec is
explicitly changed.

### 8.1 Existing telemetry is the source of truth

The live lane must continue reusing:

1. `api_request`
2. `api_response`
3. `LlmRole.UTILITY_ADVISOR`

Relevant files:

1. `packages/core/src/telemetry/types.ts`
2. `packages/core/src/core/loggingContentGenerator.ts`
3. `packages/core/src/telemetry/llmRole.ts`

Do **not** add a second benchmark-only token ledger if the same information can
be extended from existing telemetry.

### 8.2 Existing fairness pins are inherited

The live lane reuses the fairness pin semantics from:

- `docs/core/pollux/P0-05_BENCHMARK_FAIRNESS_HARNESS_CONTRACT.md`

The current live runner evaluates fairness via the same helper used by the
synthetic harness:

- `evaluatePerRunPins` in `packages/test-utils/src/benchmark-harness.ts`

This preserves:

1. router pinning
2. loop-detector suppression
3. availability reset evidence
4. fixed dynamic config
5. session isolation
6. sandbox/process isolation posture

### 8.3 Canonical surface is headless non-interactive CLI

This is a deliberate design choice, not an omission.

Cross-surface parity is already governed by:

- `docs/core/pollux/P2-07_CROSS_SURFACE_INTEGRATION_MATRIX.md`

So real benchmarking should remain one-surface measurement unless the spec is
explicitly expanded.

---

## 9) What is implemented vs not implemented

### Implemented now

1. doctrine for synthetic vs pilot vs publishable lanes
2. operator playbook
3. measurement spec
4. preregistration template
5. power analysis template
6. pricing snapshot template
7. seed real benchmark corpus
8. standalone live runner
9. preflight command with build-freshness and self-report smoke checks
10. pilot command with wall-clock and model-response ceilings
11. raw artifact bundle shape
12. per-sample diagnostics for false negatives, malformed tags, and tool errors
13. focused tests for seed corpus, preflight/telemetry summary logic, and report
    truthfulness gates

### Not yet implemented

1. full methodology-minimum corpus
2. positive/negative oracle fixture packs for all real tasks
3. isolated benchmark credentials/projects
4. publishable campaign automation path
5. campaign-scale validation of reason/timing evidence quality across larger
   runs (instrumentation and blockers exist; now needs operational hardening)
6. final publishable statistical layer (`N >= 30 per cell`, prereg complete,
   power analysis complete, Wilson interval gate, etc.)
7. full dress-rehearsal and publishable campaign scripts

---

## 10) Most important open problem areas

If a follow-on agent is picking this up, the most important unresolved areas
are:

### Model guidance

Use this as the default model split for follow-on implementation work:

1. **Use `GPT-5.4 mini` for:**
   - repo navigation and code reading
   - corpus expansion mechanics
   - fixture/oracle scaffolding
   - report/template/doc updates
   - straightforward runner and artifact plumbing
   - preflight and validation rule implementation
2. **Use `GPT-5.4` for:**
   - telemetry contract changes
   - reason-code and timing-capture design
   - methodology or publishability gate decisions
   - fairness-contract changes
   - tricky architecture changes touching multiple benchmark lanes
   - review passes where subtle mistakes would poison benchmark claims

Practical rule:

1. start with `GPT-5.4 mini` unless the task changes benchmark meaning,
   telemetry truth, fairness validity, or publishability conclusions
2. escalate to `GPT-5.4` when the task could create a false benchmark claim or
   silently bias evaluation behavior

### A. Corpus expansion

Where to work:

1. `packages/core/src/pollux/benchmark/realTasks.ts`
2. likely adjacent fixture/oracle additions under benchmark-related dirs

Goal:

Reach the methodology minimums in
`docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md`.

Recommended model:

- `GPT-5.4 mini` for adding tasks, balancing domains, and wiring deterministic
  oracles
- `GPT-5.4` only if redefining corpus policy, acceptance rules, or evaluation
  methodology

### B. Live reason-code and timing evidence hardening

Why it matters:

The methodology requires reason-code and timing breakdowns, and the artifact
bundle now captures them. The remaining risk is ensuring campaigns fail
publication when evidence is missing or malformed.

Where to investigate:

1. `packages/core/src/utils/events.ts`
2. `packages/core/src/core/client.ts`
3. `packages/core/src/pollux/types.ts`
4. `packages/test-utils/src/pollux-live-run-rig.ts`
5. `packages/test-utils/src/pollux-real-report.ts`

Notes:

The repo now emits `gemini_cli.pollux_escalation` telemetry and aggregates
reason/timing data into campaign summaries. The report now includes per-sample
expected/predicted escalation labels, false-negative blockers, malformed
status-tag blockers, and a `missing_event` timing bucket. Follow-on work should
focus on large-run validation and reducing real-model flake, not redefining
reason/timing enums.

Recommended model:

- **Start with `GPT-5.4`**

Reason:

This work touches the semantics of why and when Pollux escalated. A subtle
mistake here can make a live report look more informative than it really is, so
this is one of the highest-risk open areas.

### C. Pricing snapshot completion

Current template:

- `docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_TEMPLATE.json`

Need:

1. real frozen rates
2. real capture date
3. real source URL
4. non-template validation behavior

Recommended model:

- `GPT-5.4 mini`

Use `GPT-5.4` only if changing how pricing validity gates publication rather
than just filling or validating the snapshot.

### D. Isolated auth for publishable campaigns

Current live pilot mode seeds auth from:

- `C:\Users\sorou\.gemini`

This is acceptable for pilot work only.

The publishable lane still needs isolated benchmark credentials or equivalent
quota-window isolation.

Recommended model:

- `GPT-5.4 mini` for implementation and manifest/plumbing updates
- `GPT-5.4` for policy decisions about what counts as sufficient isolation or
  for designing hard publish gates

---

## 11) Commands that work now

### Synthetic checks

The repo already supports:

```powershell
npx vitest run packages/test-utils/src/pollux-benchmark-smoke.test.ts --reporter=dot
npx vitest run packages/test-utils/src/pollux-benchmark-full.test.ts --reporter=dot
npx vitest run packages/test-utils/src/pollux-benchmark-report.test.ts --reporter=dot
npx vitest run packages/test-utils/src/pollux-benchmark-fairness-audit.test.ts --reporter=dot
```

### Live pilot preflight

```powershell
npm run benchmark:pollux:real:preflight -- --campaign-id pilot-local-001
```

### Live pilot run

```powershell
npm run benchmark:pollux:real:pilot -- --campaign-id pilot-local-001 --repeats 1
```

Important warning:

The live pilot command uses real models and can spend real quota.

---

## 12) Suggested investigation order for the next agent

If picking this up fresh, the recommended order is:

1. Read:
   - `docs/core/pollux/P4-08_REAL_BENCHMARK_DOCTRINE.md`
   - `docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md`
   - `docs/core/pollux/P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md`
2. Inspect:
   - `packages/test-utils/src/pollux-real-config.ts`
   - `packages/test-utils/src/pollux-live-run-rig.ts`
   - `packages/test-utils/src/pollux-real-preflight.ts`
   - `packages/test-utils/src/pollux-real-report.ts`
   - `packages/core/src/pollux/benchmark/realTasks.ts`
3. Read the generated preflight smoke artifact:
   - `artifacts/pollux/real-runs/foundation-smoke/preflight.md`
4. Decide whether the next task is:
   - corpus expansion
   - live reason-code/timing capture
   - pricing snapshot completion
   - isolated-auth publishable lane work
5. Pick the default model before starting:
   - `GPT-5.4 mini` for most code/doc/plumbing tasks
   - `GPT-5.4` for reason/timing capture, fairness changes, telemetry-contract
     changes, and publishability decisions

This order gets a new agent to the actual blockers quickly without wasting time
re-deriving the synthetic lane or Phase 2 parity work.

---

## 13) Bottom line

The repo is now:

1. **synthetic-benchmark ready**
2. **live-pilot ready**
3. **not yet publishable-real-benchmark ready**

That is the correct current benchmark situation, and any future agent should
preserve that distinction unless the methodology blockers are actually closed.
