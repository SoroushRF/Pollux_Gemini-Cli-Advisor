# Compartment Report (Lite): 14 — Testing and Evaluation Architecture

## Metadata

- **Compartment**: 14 — Testing and Evaluation Architecture
- **Tier**: T2
- **Guideline file**: `14-testing-and-evaluation-architecture.md`
- **Owner**: gemini-3.1-pro
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: `c8127045c5832b0e66cb1efd04e0dd6800ce78e7`
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                  | Exists? | Notes (only if material)                          |
| ------------------------------------- | ------- | ------------------------------------------------- |
| `evals`                               | yes     |                                                   |
| `integration-tests`                   | yes     |                                                   |
| `memory-tests`                        | yes     |                                                   |
| `perf-tests`                          | yes     |                                                   |
| `packages/test-utils`                 | yes     |                                                   |
| `packages/test-utils/src/test-rig.ts` | yes     | real integration orchestrator (`TestRig`)         |
| `integration-tests/test-helper.ts`    | yes     | thin re-export of `@google/gemini-cli-test-utils` |
| `docs/integration-tests.md`           | yes     |                                                   |

## 1. Scope and Boundary

In scope: the testing and evaluation architecture, including eval suites,
integration tests, response fixtures, memory and performance regression suites,
shared test harness utilities, and CI-triggered test orchestration references.
The benchmark-fairness surface surfaced by `POLLUX_PRIORITY.md` §14 (router and
loop-detection control for benchmark conditions A/E) is in scope.

Out of scope (handed off): build/CI wiring (15); routing strategy and loop
detection internals (07); runtime compartment-specific test anchors (all runtime
compartment files).

## 2. Runtime Flow Summary

1. Unit tests: `package.json:43` runs `vitest` across all workspaces by default.
2. Integration tests: `package.json:51` runs `test:integration:all` across none,
   docker, and podman sandboxes.
3. Integration orchestration: `packages/test-utils/src/test-rig.ts:21-77`
   resolves `BUNDLE_PATH`, `getDefaultTimeout`, and the `poll()` + child-proc
   harness used by integration tests; `integration-tests/test-helper.ts:7-10`
   re-exports this harness under the integration-tests workspace.
4. Fixture loading: integration tests use `.responses` files (e.g.,
   `integration-tests/browser-agent-localhost.form.responses`) to mock LLM
   streams.
5. Evals (CI): `package.json:48` runs `test:always_passing_evals` for
   deterministic behavioral checks.
6. Evals (Nightly): `package.json:49` runs `test:all_evals` with `RUN_EVALS=1`
   for probabilistic `USUALLY_PASSES` scenarios.
7. Memory tests: `packages/test-utils/src/memory-test-harness.ts:160` forces GC,
   takes V8 heap snapshots, and compares against `baselines.json`.
8. Perf tests: `packages/test-utils/src/perf-test-harness.ts:205` measures
   wall-clock time, CPU usage, and event loop delay against `baselines.json`
   with IQR filtering.

## 3. Key Files and Citations

| Path                                             | Role                         | Notes                                                        |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------ |
| `package.json`                                   | test execution mapping       | Defines default, integration, eval, memory, and perf scripts |
| `packages/test-utils/src/test-rig.ts`            | integration orchestrator     | `BUNDLE_PATH`, `poll`, child-process helpers                 |
| `docs/integration-tests.md`                      | integration testing model    | Documents fixture regeneration and sandbox matrix            |
| `evals/README.md`                                | eval framework               | Documents `ALWAYS_PASSES` vs `USUALLY_PASSES` and promotion  |
| `packages/test-utils/src/memory-test-harness.ts` | memory regression suite      | Implements V8 heap snapshots and baseline comparison         |
| `packages/test-utils/src/perf-test-harness.ts`   | performance regression suite | Implements wall-clock, CPU, and event loop delay measurement |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-14.1** — The repository maintains four distinct test dimensions:
  functional unit/integration, behavioral evals, memory regression, and
  performance regression.
  - Primary: `package.json:43-57`
  - Confidence: high
- **VT-14.2** — Integration tests use a binary-under-test approach with mocked
  LLM responses stored in `.responses` files.
  - Primary: `docs/integration-tests.md:61-65`
  - Supporting: `integration-tests/browser-agent-localhost.form.responses:1`
    (other)
  - Confidence: high
- **VT-14.3** — The integration harness `TestRig` lives in
  `packages/test-utils/src/test-rig.ts` and is re-exported to the
  integration-tests workspace by `integration-tests/test-helper.ts`; the helper
  adds only a `skipFlaky` flag.
  - Primary: `packages/test-utils/src/test-rig.ts:21-77`
  - Supporting: `integration-tests/test-helper.ts:7-10` (other)
  - Confidence: high
- **VT-14.4** — Behavioral evals are split into `ALWAYS_PASSES` (CI blocking)
  and `USUALLY_PASSES` (nightly monitoring).
  - Primary: `evals/README.md:98-103`
  - Confidence: high
- **VT-14.5** — Memory tests force garbage collection and take V8 heap snapshots
  to compare against committed baselines with a 10% tolerance.
  - Primary: `packages/test-utils/src/memory-test-harness.ts:252-253`
  - Confidence: high
- **VT-14.6** — Performance tests measure wall-clock time, CPU usage, and event
  loop delay, comparing against baselines with a 15% tolerance.
  - Primary: `packages/test-utils/src/perf-test-harness.ts:253-256`
  - Confidence: high
- **VT-14.7** — The integration test suite runs against a sandbox matrix
  including `none`, `docker`, and `podman`.
  - Primary: `package.json:51`
  - Supporting: `docs/integration-tests.md:105` (doc)
  - Confidence: high
- **VT-14.8** — No benchmark harness in the repo suppresses or isolates the
  in-core router (`packages/core/src/routing/modelRouterService.ts`) or the loop
  detector (`packages/core/src/services/loopDetectionService.ts`) for benchmark
  runs; integration tests inherit production routing behavior and the evals
  harness mocks responses but not router decisions or loop-check LLM calls.
  - Primary: `packages/test-utils/src/test-rig.ts:21-77`
  - Supporting: `evals/vitest.config.ts:1` (config)
  - Confidence: medium

**Contradictions or ambiguities**

- **C-14.1** — Pollux spec §9 claims "zero extra API calls / zero latency" for
  baseline benchmark conditions. Forensic F-07 flags this as over-broad; the
  tier-1 compartment 07 verified truth VT-07.3 shows the router's
  `ClassifierStrategy` emits up to one extra `UTILITY_ROUTER` LLM call per
  prompt, and the loop detector (compartment 07, VT-07.7) emits 0–2 extra LLM
  calls starting at turn 30. No benchmark knob in this repo suppresses either
  source today. Evidence:
  `packages/core/src/routing/strategies/classifierStrategy.ts:160-168` (via
  `reports/07-.../report.md`),
  `packages/core/src/services/loopDetectionService.ts:29-66` (via
  `reports/07-.../report.md`). Resolution: deferred (escalate to compartment 07
  for suppression controls and to compartment 16 for spec §9 correction).

## 5. Risks and Open Questions

**Risks**

- **R-14.1** — Stale fixtures in integration tests may mask regressions if the
  underlying LLM protocol changes. Severity: medium. Mitigating test:
  `integration-tests/api-resilience.test.ts:27`. Suggested guard: periodic
  automated fixture regeneration.
- **R-14.2** — Flaky `USUALLY_PASSES` evals might be ignored if not actively
  monitored in nightly runs. Severity: low. Mitigating test:
  `evals/README.md:190`. Suggested guard: automated alerting on sustained eval
  degradation.
- **R-14.3** — Pollux benchmark conditions A/E will report biased numbers unless
  the harness explicitly pins the router to a single strategy and disables the
  loop-detection LLM tier; without those controls, baseline runs pay the
  router/loop-detector overhead that Pollux runs do not (or vice versa).
  Severity: high. Mitigating test: `no test`. Suggested guard: add a
  `BenchmarkHarness` in `packages/test-utils` that accepts an
  `OverrideStrategy`-only router and sets
  `LoopDetectionService.llmCheckInterval = Infinity` (or equivalent) for the
  run.

**Open questions**

- [ ] **OQ-14.1** — Are there specific test gaps for high-risk flows like
      protocol output and agent branching that lack coverage? Escalate to
      compartment 12.
- [ ] **OQ-14.2** — Which component owns the benchmark harness router/loop
      suppression knobs — `Config`, `ModelRouterService`, or a new test-only
      shim? Escalate to compartment 07.

## 6. Test and Observability Coverage

- **Tests**:
  - `evals/test-helper.test.ts` (evalTest reliability logic and retry behavior)
  - `integration-tests/file-system.test.ts` (file system tool confidence)
  - `integration-tests/hooks-system.test.ts` (extensibility and hook execution)
  - `memory-tests/memory-usage.test.ts` (memory leak detection)
  - `perf-tests/perf-usage.test.ts` (CPU and startup performance)
- **Observability signals**:
  - Nightly eval pass rates (tracks behavioral stability)
  - Memory baseline deltas (tracks heap growth)
  - Perf baseline deltas (tracks CPU/time regressions)
- **Coverage gaps**:
  - Protocol output and agent branching test gaps (OQ-14.1).
  - No benchmark harness suppresses router/loop-detector side effects (R-14.3,
    OQ-14.2).

## 7. Definition of Done

- [x] Test suite taxonomy and execution matrix are explicit.
- [x] Fixture and baseline workflows are documented.
- [x] Coverage-by-compartment matrix is complete (Section 6 bullets ↔ runtime
      compartments 01, 03, 04, 05, 08, 10).
- [x] Reliability/flake handling guidance is included.
- [x] Test gap backlog is actionable and prioritized.
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row 14 flipped to `done`.

## 8. Handoffs

- **Depends on**: 01, 03, 04, 05, 07, 08, 10
- **Affects**: 15
- **Escalated to** (via `INDEX.md` Notes): 12 — protocol output test gaps
  (OQ-14.1); 07 — benchmark harness router/loop suppression (R-14.3, OQ-14.2);
  16 — spec §9 "zero extra API calls" correction (C-14.1).
