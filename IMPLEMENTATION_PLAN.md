# Pollux — Detailed Implementation Plan (Revised)

This plan is updated to match the current gemini-cli architecture validated in
the forensic audit.

Key realities this revision assumes:

- The runtime already performs model routing in core.
- Settings ownership is CLI-first (schema, validation, merge), then mapped into
  core config.
- Pollux integration must work across interactive and non-interactive loops.
- An agent-session interactive branch exists and must be validated.
- Existing token and loop-detection systems already affect cost/latency behavior
  and benchmark fidelity.

---

## Epic 1: Foundations, Baseline Controls, and Config Plumbing

**Goal:** Establish a router-aware, benchmark-safe Pollux foundation.

### Phase 0: Environment Setup and Baseline Characterization (Day 1)

**Objective:** Ensure baseline repo health and establish reproducible baseline
behavior before adding Pollux logic.

- **Task 0.1: Repository Initialization**
  - [x] **Step 1:** Fork/clone the `gemini-cli` repository.
  - [x] **Step 2:** Run `npm install` and verify the base build.
  - [x] **Step 3:** Confirm dev workflow works and CLI is operational.

- **Task 0.2: Pollux Scaffolding**
  - [x] **Step 1:** Create `packages/core/src/pollux/`.
  - [x] **Step 2:** Create `packages/core/src/pollux/benchmark/`.
  - [x] **Step 3:** Initialize `packages/core/src/pollux/index.ts`.

- **Task 0.3: Baseline Architecture Mapping (Completed)**
  - [x] **Step 1:** Confirm core turn entry points and stream surfaces.
  - [x] **Step 2:** Confirm settings ownership in CLI schema/loader.
  - [x] **Step 3:** Confirm existing model router, loop detector, and token
        accounting paths.

- **Task 0.4: Benchmark Control Strategy**
  - [ ] **Step 1:** Define how each benchmark condition controls model routing
        behavior.
  - [ ] **Step 2:** Define how loop-detection utility checks are normalized
        across conditions.
  - [ ] **Step 3:** Document baseline control knobs before writing harness code.

---

### Phase 1: Type System and Config Integration (Days 2-4)

**Objective:** Create Pollux primitives and wire configuration through canonical
paths.

- **Task 1.1: Type System Definition (`types.ts`)**
  - [ ] **Step 1:** Define `TurnContext` with fields needed by detector,
        advisor, and logger.
  - [ ] **Step 2:** Define `EscalationDecision`, `EscalationDetector`, and
        strategy enum/type contracts.
  - [ ] **Step 3:** Define `AdvisorPlan`, `PolluxConfig`, and `TurnLog`
        structures. **Notes:** Mandatory first coding task for Pollux modules.

- **Task 1.2: Model Registry (`models.ts`)**
  - [ ] **Step 1:** Define executor/advisor model sets using currently valid
        model IDs.
  - [ ] **Step 2:** Add metadata for benchmark reporting (tier, nominal prices,
        aliases).
  - [ ] **Step 3:** Add guardrails for invalid pairings and unsupported models.

- **Task 1.3: CLI Settings Schema Integration (`settingsSchema.ts`)**
  - [ ] **Step 1:** Add `pollux` block to
        `packages/cli/src/config/settingsSchema.ts`.
  - [ ] **Step 2:** Include fields: enabled, executorModel, advisorModel,
        escalationStrategy, thresholds, logging flags, and limits.
  - [ ] **Step 3:** Add defaults and descriptions suitable for docs generation.

- **Task 1.4: Settings Validation and Merge (`settings.ts`)**
  - [ ] **Step 1:** Ensure `pollux` is parsed and validated by existing settings
        validation flow.
  - [ ] **Step 2:** Confirm user/workspace/system merge behavior for `pollux`.
  - [ ] **Step 3:** Add tests for invalid values and precedence behavior.

- **Task 1.5: Core Config Mapping (`config.ts`)**
  - [ ] **Step 1:** Map merged CLI `pollux` settings into core `Config`
        construction params.
  - [ ] **Step 2:** Add core getters/accessors for Pollux runtime use.
  - [ ] **Step 3:** Ensure defaults preserve baseline behavior when Pollux is
        disabled.

---

## Epic 2: Advisor and Escalation Intelligence

**Goal:** Implement advisor consultation and escalation decisions with strong
testability.

### Phase 2: Advisor Client and Prompting (Days 5-7)

**Objective:** Implement a stateless advisor path and stable injection strategy.

- **Task 2.1: Prompting and Context Formatter (`prompts.ts`)**
  - [ ] **Step 1:** Implement advisor system prompt and strict JSON response
        contract.
  - [ ] **Step 2:** Implement context compaction/trimming for long histories.
  - [ ] **Step 3:** Add deterministic formatting helpers for easier tests.

- **Task 2.2: Advisor Client (`advisor.ts`)**
  - [ ] **Step 1:** Implement `consult()` for single-shot advisor request.
  - [ ] **Step 2:** Parse and validate advisor JSON response.
  - [ ] **Step 3:** Return normalized `AdvisorPlan` with telemetry payload.

- **Task 2.3: Guidance Injection Strategy**
  - [ ] **Step 1:** Implement v1 injection path aligned with existing runtime
        patterns (synthetic history/tool-result semantics).
  - [ ] **Step 2:** Optionally implement registry-backed `advisor_consultation`
        tool path if needed for clearer traceability.
  - [ ] **Step 3:** Add tests to verify the executor consumes advisor guidance
        predictably.

- **Task 2.4: Advisor Isolation Tests**
  - [ ] **Step 1:** Golden tests for prompt formatting.
  - [ ] **Step 2:** Parse-failure and schema-violation tests.
  - [ ] **Step 3:** Timeout and fallback behavior tests.

---

### Phase 3: Escalation Detectors (Days 8-10)

**Objective:** Implement detector strategies that complement existing loop
systems and avoid duplicate logic.

- **Task 3.1: Heuristic Detector (`detector.ts`)**
  - [ ] **Step 1:** Implement tool-loop and repeated-failure triggers.
  - [ ] **Step 2:** Implement confusion/uncertainty trigger logic.
  - [ ] **Step 3:** Implement turn overflow and retry pressure triggers.
  - [ ] **Step 4:** Define interaction boundaries with existing
        `LoopDetectionService` to avoid double-triggering.

- **Task 3.2: Structured Detector**
  - [ ] **Step 1:** Implement confidence-tag instruction injection.
  - [ ] **Step 2:** Implement extraction/stripping parser for
        `<pollux_confidence>`.
  - [ ] **Step 3:** Add fallback logic when tags are missing or malformed.

- **Task 3.3: Hybrid Detector**
  - [ ] **Step 1:** Compose heuristic + structured detectors.
  - [ ] **Step 2:** Define deterministic precedence and reason labeling.

- **Task 3.4: Detector Unit Tests**
  - [ ] **Step 1:** Mocked-context tests for all trigger paths.
  - [ ] **Step 2:** False-positive suppression tests.
  - [ ] **Step 3:** Boundary tests for threshold tuning.

---

## Epic 3: Runtime Integration Across All Execution Paths

**Goal:** Integrate Pollux safely without stream regressions.

### Phase 4: Interceptor and Multi-Path Integration (Days 11-14)

**Objective:** Wire Pollux in core and validate behavior in every active runtime
surface.

- **Task 4.1: Interceptor Core (`interceptor.ts`)**
  - [ ] **Step 1:** Implement orchestration pipeline:
        `shouldEscalate -> consult -> inject`.
  - [ ] **Step 2:** Add max-advisor-calls-per-turn safety and fail-open
        behavior.
  - [ ] **Step 3:** Add reason codes and event payloads for telemetry/logging.

- **Task 4.2: Core Client Wiring (`client.ts`)**
  - [ ] **Step 1:** Integrate Pollux orchestration into `processTurn()`.
  - [ ] **Step 2:** Ensure disabled mode is a no-op with identical baseline
        behavior.
  - [ ] **Step 3:** Ensure routing and Pollux controls do not conflict.

- **Task 4.3: Interactive CLI Path Validation (`useGeminiStream.ts`)**
  - [ ] **Step 1:** Verify tool-call continuation remains ordered with Pollux
        escalations.
  - [ ] **Step 2:** Verify confidence-tag stripping never leaks to UI.
  - [ ] **Step 3:** Validate client-initiated and model-initiated tool paths
        remain stable.

- **Task 4.4: Non-Interactive CLI Path Validation (`nonInteractiveCli.ts`)**
  - [ ] **Step 1:** Verify Pollux escalation works in non-interactive turn
        loops.
  - [ ] **Step 2:** Verify JSON/text output modes remain stable.
  - [ ] **Step 3:** Verify cancellation and error handling semantics are
        unchanged.

- **Task 4.5: Agent-Session Interactive Branch Validation**
  - [ ] **Step 1:** Validate behavior when agent-session interactive mode is on.
  - [ ] **Step 2:** Validate behavior when standard Gemini stream mode is on.
  - [ ] **Step 3:** Confirm no branch-specific regressions.

- **Task 4.6: Integration Test Matrix**
  - [ ] **Step 1:** Pollux off baseline parity tests.
  - [ ] **Step 2:** Pollux on escalation path tests.
  - [ ] **Step 3:** Regression tests for event ordering and tool continuation.

---

## Epic 4: Logging, Benchmarking, and Evaluation

**Goal:** Produce trustworthy accuracy/cost/latency comparisons.

### Phase 5: Logging and Harness Implementation (Days 15-18)

**Objective:** Build Pollux-specific observability on top of existing telemetry
primitives and run controls.

- **Task 5.1: Pollux Logger (`logger.ts`)**
  - [ ] **Step 1:** Reuse existing usage metadata capture instead of duplicating
        token extraction logic.
  - [ ] **Step 2:** Add Pollux attribution fields: executor/advisor token split,
        escalation reason, advisor latency, call count.
  - [ ] **Step 3:** Emit JSONL with stable schema for analytics.

- **Task 5.2: Benchmark Task Suite (`benchmark/tasks.ts`)**
  - [ ] **Step 1:** Define 30 tasks across easy/medium/hard.
  - [ ] **Step 2:** Implement deterministic pass/fail oracles.
  - [ ] **Step 3:** Tag tasks for failure mode analysis (loop-prone, multi-file,
        etc.).

- **Task 5.3: Benchmark Runner (`benchmark/runner.ts`)**
  - [ ] **Step 1:** Implement five benchmark conditions.
  - [ ] **Step 2:** Add checkpointing and idempotent resume.
  - [ ] **Step 3:** Add rate limiting (1 req/sec) and robust backoff.
  - [ ] **Step 4:** Add explicit controls for existing model routing and loop
        detection side effects per condition.

- **Task 5.4: Reporting (`benchmark/report.ts`)**
  - [ ] **Step 1:** Aggregate JSONL into markdown tables.
  - [ ] **Step 2:** Compute accuracy, token stats, and latency metrics.
  - [ ] **Step 3:** Compute escalation precision/recall and confidence
        intervals.

---

### Phase 6: Full Benchmark Execution (Days 19-20)

**Objective:** Execute the full run and validate data integrity.

- **Task 6.1: Full Trial Execution**
  - [ ] **Step 1:** Run 450 trials (30 tasks x 5 conditions x 3 trials).
  - [ ] **Step 2:** Monitor run health and resume from checkpoints as needed.
  - [ ] **Step 3:** Validate run completeness and schema consistency.

- **Task 6.2: Data Quality Gate**
  - [ ] **Step 1:** Identify flaky oracle outcomes and mark exclusions.
  - [ ] **Step 2:** Verify baseline controls actually held during runs.
  - [ ] **Step 3:** Generate final clean dataset for publication.

---

## Epic 5: Productization and Documentation

**Goal:** Ship a demonstrable Pollux feature set with accurate architecture
documentation.

### Phase 7: UX and Docs (Days 21-22)

**Objective:** Add runtime controls and publish the final technical story.

- **Task 7.1: Runtime Controls**
  - [ ] **Step 1:** Implement `/pollux` slash command for runtime toggling.
  - [ ] **Step 2:** Ensure command respects config precedence and session mode.

- **Task 7.2: Minimal UX Signals**
  - [ ] **Step 1:** Add concise indicator when advisor is consulted.
  - [ ] **Step 2:** Add optional verbose debugging view for escalation reasons.

- **Task 7.3: Documentation Alignment**
  - [ ] **Step 1:** Update architecture docs to reflect router-aware baseline.
  - [ ] **Step 2:** Document settings ownership (CLI schema -> loader -> core
        config mapping).
  - [ ] **Step 3:** Document multi-path integration (interactive,
        non-interactive, agent-session branch).

- **Task 7.4: PR and Demo Readiness**
  - [ ] **Step 1:** Prepare final benchmark summary and reproducibility notes.
  - [ ] **Step 2:** Prepare PR narrative with risk mitigations and test
        evidence.

---

## Architecture-Specific Guardrails (Must Keep)

1. **Pollux off means true no-op:** disabled mode must not change output,
   ordering, or model behavior.
2. **Do not bypass CLI settings schema:** all user-facing settings must be
   defined in CLI schema and validated in CLI loader.
3. **No stream corruption:** event ordering and tool continuation must remain
   stable in both interactive and non-interactive paths.
4. **Benchmark fairness first:** isolate Pollux effect from existing router and
   loop-detection utility checks.
5. **Leverage existing telemetry:** extend current token/usage capture, do not
   duplicate it.

---

## Definition of Done

Pollux implementation is complete when:

1. Pollux can be enabled/disabled via settings and runtime command.
2. Escalation strategies run reliably and are unit/integration tested.
3. Interactive, non-interactive, and agent-session interactive paths all pass
   regression tests.
4. Benchmark harness produces reproducible, checkpointed runs and valid reports.
5. Documentation reflects actual architecture and measured outcomes.
