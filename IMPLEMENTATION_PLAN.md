# Pollux Implementation Plan (Start-Ready)

Version: 2.0 Date: 2026-04-17 Status: Conditionally ready. Implementation starts
only after Gates G0-G5 are complete. Primary references: Tier summaries and
synthesis under docs/repo-compartment-analysis/reports/

---

## 1) Why this revision exists

This revision replaces an implementation-heavy but architecture-light plan with
an execution plan that is safe against known systemic failures:

- Pollux must cover multiple runtime surfaces, not just one seam.
- Advisor policy behavior must be non-interactive-safe by default.
- Benchmark baselines must suppress hidden utility LLM calls.
- Token accounting must extend existing sinks, not fork new ones.
- Settings, docs, and CI must be wired before runtime work begins.

This plan is written as a delivery contract, not a concept document.

---

## 2) Scope and boundaries

### Phase 1 in-scope surfaces (required)

| Surface                       | Current path                                        | Pollux requirement                    | Owner |
| ----------------------------- | --------------------------------------------------- | ------------------------------------- | ----- |
| Interactive legacy            | useGeminiStream -> GeminiClient.sendMessageStream   | Full Pollux behavior                  | 01/02 |
| Non-interactive legacy        | runNonInteractive -> GeminiClient.sendMessageStream | Full Pollux behavior                  | 01/02 |
| Interactive agent-session     | useAgentStream -> LegacyAgentSession                | Pollux parity with legacy             | 01/03 |
| Non-interactive agent-session | runNonInteractiveAgentSession -> LegacyAgentSession | Pollux parity with legacy             | 01/03 |
| ACP                           | GeminiAgent.prompt                                  | Pollux-aware advisor/policy semantics | 12/02 |

### Explicitly out of scope for Phase 1

- A2A CoderAgentExecutor runtime interception.

### Phase 1 out-of-scope control

- A2A path must be explicitly documented as non-Pollux in spec and plan.
- A2A tests must assert expected bypass behavior with a clear reason.

---

## 3) Start gates (hard blockers)

All gates are mandatory. No Pollux runtime code should land before all gates are
green.

### G0: Spec-plan contract lock

Done criteria:

- POLLUX_SPEC.md and this plan use consistent seam language.
- Contradictory guidance removed (single seam assumptions, duplicate logger
  assumptions).
- Version headers added to both documents.

Owner: 16

### G1: Driver/interceptor matrix locked

Done criteria:

- Interceptor contract documented per in-scope surface.
- Explicit no-op/bypass behavior documented for out-of-scope A2A.
- One integration test blueprint exists per in-scope surface.

Owner: 02, with 01/03/12 support

### G2: Advisor policy channel locked

Done criteria:

- advisor_consultation has packaged default ALLOW rule behind Pollux flag.
- Non-interactive default behavior cannot silently DENY advisor path.
- ACP path does not trigger unexpected permission prompt for advisor
  consultation.

Owner: 09, with 04/12 support

### G3: Settings pipeline locked

Done criteria:

- experimental.pollux.\* added to CLI schema and loader path.
- Core ConfigParameters mapping implemented and tested.
- CI gate added for schema generation check.

Owner: 06, with 15 support

### G4: Benchmark fairness harness locked

Done criteria:

- Dedicated benchmark harness wraps TestRig.
- Router and loop detector controls pinned per fairness contract.
- Availability state reset and session isolation strategy documented.

Owner: 14, with 07/10 support

### G5: Governance/doc correction lock

Done criteria:

- Pollux doc correction checklist exists and is tracked.
- CODEOWNERS explicitly covers POLLUX\_\*.md and repo-compartment-analysis docs.
- Unimplemented sections marked as such.

Owner: 16, with 15 support

---

## 4) Locked architecture decisions

### D1: Interceptor coverage strategy

- Pollux behavior is defined per surface, not assumed globally.
- processTurn integration is necessary but not sufficient.

### D2: Advisor invocation strategy

- Preferred: advisor_consultation synthetic tool path routed through scheduler
  policy checks.
- Allowed fallback: synthetic message injection only for fail-open recovery, not
  primary behavior.

### D3: Telemetry/token accounting strategy

- Extend existing pipeline using LlmRole.UTILITY_ADVISOR.
- Do not introduce a parallel token sink.

### D4: Settings strategy

- Start at experimental.pollux.\*.
- Promote to top-level pollux.\* after stability and migration readiness.

### D5: Benchmark fairness strategy

- Conditions A-E only valid with fairness pins active.
- If pins are not active, run is invalid for comparison.

### D6: Command registration strategy

- /pollux must be registered in all required command surfaces for in-scope
  runtime paths.
- Shipping a single registration point is considered incomplete.

### D7: GeminiChat access constraint

- Read access may occur through existing core flows where already established.
- External mutation of GeminiChat history outside controlled services is
  prohibited.

---

## 5) Delivery plan by phase

## Phase 0: Contracts and control plane (Week 1)

Goal: clear systemic blockers before runtime coding.

Tasks:

1. Publish driver/interceptor matrix and ownership.
2. Finalize advisor policy channel and ACP behavior contract.
3. Land settings schema path and CI guard.
4. Land benchmark harness scaffold with fairness pins.
5. Land governance corrections and ownership controls.

Exit criteria:

- Gates G0-G5 complete.
- PR-level signoff from compartments 01/02/06/09/14/16.

## Phase 1: Foundation implementation (Week 2)

Goal: establish core Pollux primitives without behavior risk.

Tasks:

1. Define types and runtime configuration contracts.
2. Add model registry and advisor model aliasing contract.
3. Extend telemetry role taxonomy with UTILITY_ADVISOR.
4. Implement advisor prompting/parsing modules behind feature flags.

Exit criteria:

- Unit tests pass for types, parsing, and role tagging.
- Pollux disabled mode remains behavior-identical.

## Phase 2: Runtime integration by surface (Weeks 3-4)

Goal: integrate Pollux safely across all in-scope surfaces.

Tasks:

1. Integrate legacy interactive and non-interactive paths.
2. Integrate agent-session interactive and non-interactive parity behavior.
3. Integrate ACP advisor semantics.
4. Add explicit A2A bypass assertions and documentation.

Exit criteria:

- TG-2 parity tests pass across all in-scope surfaces.
- No event-ordering regressions.

## Phase 3: Escalation and advisor behavior hardening (Week 5)

Goal: ensure escalation is useful, deterministic, and recoverable.

Tasks:

1. Implement heuristic detector.
2. Implement structured detector with safe tag stripping.
3. Implement hybrid precedence rules.
4. Add fail-open handling for malformed advisor responses/timeouts.

Exit criteria:

- Detector precision/recall thresholds measured and documented.
- No confidence-tag leakage into user-visible output.

## Phase 4: Benchmarking and evaluation (Weeks 6-7)

Goal: produce valid, reproducible A-E benchmark results.

Tasks:

1. Implement benchmark task corpus and oracle reliability checks.
2. Run five-condition harness with checkpoint/resume.
3. Validate fairness pins were active for every run.
4. Publish token/latency/accuracy report with confidence intervals.

Exit criteria:

- TG-1 benchmark fairness gate passes.
- Results reproducible from checkpointed data.

## Phase 5: Command surface and docs rollout (Week 8)

Goal: complete product and governance surfaces.

Tasks:

1. Register /pollux across required command registries.
2. Add minimal UX signals and debug mode output.
3. Finalize docs, correction ledger, and ownership coverage.
4. Add PR narrative and rollout guidance.

Exit criteria:

- TG-23/TG-25 command parity checks pass.
- Docs and plan/spec remain mutually consistent.

---

## 6) Mandatory test gates

These are release blockers, not optional tests.

| Gate  | Description                                                | Owner    | Required by   |
| ----- | ---------------------------------------------------------- | -------- | ------------- |
| TG-1  | Harness suppresses router/loop utility noise for fairness  | 14/07    | Phase 4 start |
| TG-2  | Cross-surface behavior parity (legacy, agent-session, ACP) | 01/03/12 | Phase 2 exit  |
| TG-3  | Advisor policy path avoids double prompt                   | 09/12    | Phase 2 exit  |
| TG-4  | token usage metrics match conversation totals              | 11/02    | Phase 4 exit  |
| TG-5  | Schema-to-ConfigParameters mapping invariant test          | 06       | Phase 1 exit  |
| TG-6  | Pollux-specific integration tests exist and are green      | 02/14    | Phase 2 exit  |
| TG-7  | /pollux command reachability across in-scope surfaces      | 05/12/13 | Phase 5 exit  |
| TG-8  | ACP advisor flow regression test                           | 12       | Phase 2 exit  |
| TG-9  | Binary build smoke test for Pollux-touching PRs            | 15       | Phase 5 exit  |
| TG-10 | Doc/spec drift check for Pollux files                      | 16       | Phase 5 exit  |

---

## 7) CI and release gates

Required CI updates:

1. schema:settings check required in PR.
2. Pollux-scoped benchmark dispatch workflow.
3. Pollux-scoped binary build workflow.
4. Pollux-scoped perf/memory workflow.

Release policy:

- No promote/latest without TG-1 through TG-10 green.

---

## 8) Deliverables

Engineering deliverables:

1. Pollux runtime modules under packages/core/src/pollux/.
2. Benchmark harness and report artifacts.
3. Command surface registrations.
4. Test suites and CI workflows.

Governance deliverables:

1. Updated POLLUX_SPEC.md.
2. Updated IMPLEMENTATION_PLAN.md.
3. Pollux doc corrections ledger.
4. CODEOWNERS updates.

---

## 9) Critical risk register

| Risk                              | Impact                                   | Mitigation      |
| --------------------------------- | ---------------------------------------- | --------------- |
| Seam coverage incomplete          | Silent behavior drift by surface         | Gate G1 + TG-2  |
| Advisor denied in non-interactive | Silent failure in CI/headless            | Gate G2 + TG-3  |
| Biased baseline metrics           | Invalid benchmark claims                 | Gate G4 + TG-1  |
| Token sink divergence             | Inconsistent cost accounting             | D3 + TG-4       |
| Settings drift                    | Feature misconfiguration in production   | Gate G3 + TG-5  |
| Command fragmentation             | /pollux works only in subset of paths    | D6 + TG-7       |
| Doc governance drift              | Spec no longer reflects shipped behavior | Gate G5 + TG-10 |

---

## 10) Definition of done

Pollux is done only when all of the following are true:

1. Gates G0-G5 are complete.
2. TG-1 through TG-10 are green.
3. Pollux-off behavior matches baseline behavior.
4. Pollux-on behavior is parity-verified across all in-scope surfaces.
5. Benchmark report is reproducible, fairness-validated, and reviewable.
6. Spec, plan, and docs are aligned and ownership-protected.

---

## 11) First 72-hour execution checklist

1. Lock and merge G0/G1 documents.
2. Land policy defaults and ACP behavior contract (G2).
3. Land settings schema + CI check (G3).
4. Land benchmark fairness harness scaffold (G4).
5. Land doc governance controls (G5).

No runtime feature code before checklist completion.
