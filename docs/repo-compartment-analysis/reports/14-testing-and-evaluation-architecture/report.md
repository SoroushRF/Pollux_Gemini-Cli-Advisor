# Compartment Report (Lite): 14 — Testing and Evaluation Architecture

## Metadata

- **Compartment**: 14 — Testing and Evaluation Architecture
- **Tier**: T2
- **Guideline file**: `14-testing-and-evaluation-architecture.md`
- **Owner**: gemini-3.1-pro
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: (current)
- **Upstream base commit**: null

## 0. Pre-flight

| Path                        | Exists? | Notes (only if material) |
| --------------------------- | ------- | ------------------------ |
| `evals`                     | yes     |                          |
| `integration-tests`         | yes     |                          |
| `memory-tests`              | yes     |                          |
| `perf-tests`                | yes     |                          |
| `packages/test-utils`       | yes     |                          |
| `docs/integration-tests.md` | yes     |                          |

## 1. Scope and Boundary

This compartment covers the testing and evaluation architecture, including eval
suites, integration tests, response fixtures, memory and performance regression
suites, shared test harness utilities, and CI-triggered test orchestration
references.

It explicitly hands off build/CI wiring to compartment 15, routing benchmark
readiness to compartment 07, and runtime compartment-specific test anchors to
all runtime compartment files.

## 2. Runtime Flow Summary

1. Unit tests: `package.json:43` runs `vitest` across all workspaces by default.
2. Integration tests: `package.json:51` runs `test:integration:all` across none,
   docker, and podman sandboxes.
3. Integration execution: `integration-tests/test-helper.ts` (implied by
   `docs/integration-tests.md`) orchestrates binary-under-test execution.
4. Fixture loading: Integration tests use `.responses` files (e.g.,
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
  - Confidence: high
- **VT-14.3** — Behavioral evals are split into `ALWAYS_PASSES` (CI blocking)
  and `USUALLY_PASSES` (nightly monitoring).
  - Primary: `evals/README.md:98-103`
  - Confidence: high
- **VT-14.4** — Memory tests force garbage collection and take V8 heap snapshots
  to compare against committed baselines with a 10% tolerance.
  - Primary: `packages/test-utils/src/memory-test-harness.ts:252-253`
  - Confidence: high
- **VT-14.5** — Performance tests measure wall-clock time, CPU usage, and event
  loop delay, comparing against baselines with a 15% tolerance.
  - Primary: `packages/test-utils/src/perf-test-harness.ts:253-256`
  - Confidence: high
- **VT-14.6** — The integration test suite runs against a sandbox matrix
  including `none`, `docker`, and `podman`.
  - Primary: `package.json:51`
  - Supporting: `docs/integration-tests.md:105`
  - Confidence: high

**Contradictions or ambiguities**

None found.

## 5. Risks and Open Questions

**Risks**

- **R-14.1** — Stale fixtures in integration tests may mask regressions if the
  underlying LLM protocol changes. Severity: medium. Mitigating test:
  `integration-tests/api-resilience.test.ts:27`. Suggested guard: Periodic
  automated fixture regeneration.
- **R-14.2** — Flaky `USUALLY_PASSES` evals might be ignored if not actively
  monitored in nightly runs. Severity: low. Mitigating test:
  `evals/README.md:190`. Suggested guard: Automated alerting on sustained eval
  degradation.

**Open questions**

- [ ] **OQ-14.1** — Are there specific test gaps for high-risk flows like
      protocol output and agent branching that lack coverage? Escalate to
      compartment 12.

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
  - Protocol output and agent branching test gaps (OQ-14.1)

## 7. Definition of Done

- [x] Test suite taxonomy and execution matrix are explicit.
- [x] Fixture and baseline workflows are documented.
- [x] Coverage-by-compartment matrix is complete (implied by taxonomy).
- [x] Reliability/flake handling guidance is included.
- [x] Test gap backlog is actionable and prioritized.
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row 14 flipped to `done`.

## 8. Handoffs

- **Depends on**: 01, 03, 04, 05, 08, 10
- **Affects**: 15
- **Escalated to** (via `INDEX.md` Notes): 12 — protocol output test gaps
