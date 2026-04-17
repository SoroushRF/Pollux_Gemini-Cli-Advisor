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

This section is intentionally execution-oriented: each phase has entry criteria,
task IDs, owners, deliverables, and explicit dependencies.

### Cross-phase operating rules

1. No task starts unless dependencies are complete and linked.
2. Every task must map to at least one test gate (TG-1..TG-10).
3. Runtime behavior changes must ship behind feature flags first.
4. Any upstream-sync conflict on Pollux seams requires a dedicated conflict PR.
5. No mixed-purpose PRs (one PR should contain one coherent phase task).

## Phase 0: Contracts and control plane (Week 1)

Goal: close systemic blockers before runtime implementation.

Entry criteria:

- Current spec and plan are merged.
- Tier summaries and synthesis are accepted as source of architectural truth.

Task breakdown:

| ID    | Task                                                                            | Owner         | Deliverable                                                                                 | Depends on   |
| ----- | ------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- | ------------ |
| P0-01 | [Done 2026-04-17] Publish driver/interceptor matrix for all in-scope surfaces   | 02 + 01/03/12 | Matrix doc + seam ownership map -> docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md      | G0           |
| P0-02 | [Done 2026-04-17] Lock advisor policy decision path, including ACP behavior     | 09 + 04/12    | Policy design note + acceptance tests list -> docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md | P0-01        |
| P0-03 | Define settings strategy (experimental.pollux.\* + promotion path)              | 06            | Settings contract note                                                                      | G0           |
| P0-04 | Define mandatory CI gates and branch protections                                | 15            | CI checklist + required jobs                                                                | P0-02/P0-03  |
| P0-05 | Define benchmark fairness controls (router/loop/availability/session isolation) | 14 + 07/10    | Fairness checklist + harness contract                                                       | G0           |
| P0-06 | Land governance controls (CODEOWNERS + correction ledger process)               | 16 + 15       | Governance PR + review ownership map                                                        | G5           |
| P0-07 | Create implementation PR template keyed to TGs                                  | 16            | PR template with TG mapping                                                                 | P0-04        |
| P0-08 | Produce Phase 1 execution board (task issue list with owners)                   | PM/16         | Tracked issue set                                                                           | P0-01..P0-07 |

### Phase 0 completion notes (persistent evidence)

#### P0-01 (Done 2026-04-17)

Summary:

1. Published the driver/interceptor matrix for all in-scope drivers (D1-D5) and
   explicit deferred A2A bypass (D6).
2. Documented seam ownership and approval/change-control map.
3. Added integration test blueprints BP-01 through BP-06 with TG mappings.

Pointer:

1. Canonical artifact: docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md
2. Pointer stub:
   docs/repo-compartment-analysis/P0-01_DRIVER_INTERCEPTOR_MATRIX.md

Citations and references:

1. POLLUX_SPEC.md Appendix A (driver/interceptor expectations and A2A deferred
   behavior).
2. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-1 and NA-1
   per-driver matrix requirement).
3. docs/repo-compartment-analysis/reports/01-cli-runtime-surface/report.md
4. docs/repo-compartment-analysis/reports/03-agent-runtime-and-modes/report.md
5. docs/repo-compartment-analysis/reports/12-output-protocol-and-acp-adapters/report.md
6. docs/repo-compartment-analysis/reports/13-integration-products-sdk-vscode-a2a-devtools/report.md

Change record:

1. Commit 190ffcc9e: created P0-01 matrix artifact.
2. Commit 548672c52: relocated artifact to docs/core/pollux and added pointer
   stub.

#### P0-02 (Done 2026-04-17)

Summary:

1. Published the advisor policy-channel lock contract for advisor_consultation.
2. Defined packaged default ALLOW behavior under pollux.enabled and ACP
   permission-safe constraints.
3. Added acceptance test list mapped to TG-3 and TG-8.

Pointer:

1. Canonical artifact: docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md
2. Pointer stub: docs/repo-compartment-analysis/P0-02_POLICY_CHANNEL_LOCK.md

Citations and references:

1. POLLUX_SPEC.md section 6 (advisor invocation and policy contract).
2. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-5 and NA-3
   policy mitigation).
3. docs/repo-compartment-analysis/reports/09-policy-trust-and-safety-engine/report.md
4. docs/repo-compartment-analysis/reports/12-output-protocol-and-acp-adapters/report.md
5. docs/repo-compartment-analysis/reports/04-tools-and-mcp-platform/report.md

Change record:

1. Commit reference recorded in task completion report and linked in git
   history.

Exit criteria:

- Gates G0-G5 are complete.
- Compartment signoff from 01/02/06/09/14/16.
- All Phase 1 tasks have issue IDs and owners.

## Phase 1: Foundation implementation (Week 2)

Goal: implement low-risk Pollux primitives and plumbing with no runtime behavior
changes.

Entry criteria:

- Phase 0 exit criteria met.
- Feature flag defaults defined.

Task breakdown:

| ID    | Task                                                                              | Owner   | Deliverable                         | Depends on  | TG mapping |
| ----- | --------------------------------------------------------------------------------- | ------- | ----------------------------------- | ----------- | ---------- |
| P1-01 | Define types and interfaces (turn context, detector contracts, advisor contracts) | 02      | types.ts + unit tests               | P0-08       | TG-6       |
| P1-02 | Implement model registry and alias resolver contract                              | 07 + 02 | models.ts + validation tests        | P1-01       | TG-6       |
| P1-03 | Add experimental.pollux.\* to CLI settings schema and loader                      | 06      | settings schema + loader mapping    | P0-03       | TG-5       |
| P1-04 | Map config into core ConfigParameters and accessors                               | 06 + 02 | config mapping + invariant tests    | P1-03       | TG-5       |
| P1-05 | Add LlmRole.UTILITY_ADVISOR and role-plumb through existing telemetry path        | 11 + 02 | role enum + wiring tests            | P1-01       | TG-4       |
| P1-06 | Implement advisor prompt builder/parser with strict schema validation             | 02      | prompts/advisor parser + unit tests | P1-01       | TG-6       |
| P1-07 | Add fail-open defaults and max-call budget configs                                | 02 + 09 | config defaults + safeguards        | P1-04/P1-06 | TG-3/TG-6  |

Exit criteria:

- TG-5 green (schema/config invariants).
- Foundation tests green with Pollux disabled and enabled (no runtime
  integration yet).

## Phase 2: Runtime integration by surface (Weeks 3-4)

Goal: integrate Pollux across in-scope surfaces without violating stream or
policy invariants.

Entry criteria:

- Phase 1 exit criteria met.
- P0 policy and seam contracts signed off.

Task breakdown:

| ID    | Task                                                                  | Owner            | Deliverable                         | Depends on   | TG mapping |
| ----- | --------------------------------------------------------------------- | ---------------- | ----------------------------------- | ------------ | ---------- |
| P2-01 | Integrate legacy interactive path (processTurn seam)                  | 02 + 01          | integration code + regression tests | P1-01..P1-07 | TG-2/TG-6  |
| P2-02 | Integrate legacy non-interactive path and output stability checks     | 02 + 01          | non-interactive parity tests        | P2-01        | TG-2       |
| P2-03 | Integrate interactive agent-session path and parity assertions        | 03 + 01          | adapter parity tests                | P2-01        | TG-2       |
| P2-04 | Integrate non-interactive agent-session path and parity assertions    | 03 + 01          | agent-session non-interactive tests | P2-03        | TG-2       |
| P2-05 | Implement ACP advisor semantics without unexpected permission prompts | 12 + 09/02       | ACP integration + permission tests  | P0-02/P2-01  | TG-3/TG-8  |
| P2-06 | Add explicit A2A deferred-scope assertions and docs                   | 13 + 16          | bypass tests + docs notes           | P0-01        | TG-10      |
| P2-07 | Run cross-surface integration matrix and compare observable behavior  | 14 + 01/02/03/12 | matrix report artifact              | P2-01..P2-05 | TG-2/TG-6  |

Exit criteria:

- TG-2, TG-3, TG-6, TG-8 green.
- No event ordering or continuation regressions in any in-scope surface.

## Phase 3: Escalation and advisor hardening (Week 5)

Goal: make escalation robust, measurable, and safe under failure.

Entry criteria:

- Phase 2 exit criteria met.

Task breakdown:

| ID    | Task                                                            | Owner   | Deliverable                      | Depends on   | TG mapping |
| ----- | --------------------------------------------------------------- | ------- | -------------------------------- | ------------ | ---------- |
| P3-01 | Implement heuristic detector and deterministic reason codes     | 02 + 07 | detector module + tests          | P2-07        | TG-6       |
| P3-02 | Implement structured detector with confidence tag stripping     | 02      | structured detector + leak tests | P3-01        | TG-6       |
| P3-03 | Implement hybrid detector precedence and tie-break semantics    | 02      | hybrid policy + tests            | P3-01/P3-02  | TG-6       |
| P3-04 | Implement advisor timeout/malformed response fail-open behavior | 02 + 09 | fail-open runtime tests          | P3-02        | TG-3/TG-6  |
| P3-05 | Add escalation calibration set and threshold tuning guide       | 14 + 02 | calibration report               | P3-01..P3-04 | TG-6       |
| P3-06 | Verify telemetry reconciliation under escalation load           | 11 + 02 | reconciliation test report       | P3-04        | TG-4       |

Exit criteria:

- Detector calibration and fail-open behavior documented.
- TG-4 and TG-6 green under stress scenarios.

## Phase 4: Benchmarking and evaluation (Weeks 6-7)

Goal: produce reproducible A-E benchmark results with valid fairness controls.

Entry criteria:

- Phase 3 exit criteria met.
- Fairness controls contract from P0-05 implemented.

Task breakdown:

| ID    | Task                                                                    | Owner      | Deliverable               | Depends on | TG mapping |
| ----- | ----------------------------------------------------------------------- | ---------- | ------------------------- | ---------- | ---------- |
| P4-01 | Finalize benchmark task corpus with oracle reliability checks           | 14         | task corpus + oracle docs | P0-05      | TG-1       |
| P4-02 | Implement benchmark harness controls (router/loop/availability/session) | 14 + 07/10 | benchmark harness code    | P4-01      | TG-1       |
| P4-03 | Run smoke benchmark (small matrix) and validate reproducibility         | 14         | smoke run artifact        | P4-02      | TG-1       |
| P4-04 | Run full five-condition benchmark with checkpoint/resume                | 14         | full run artifacts        | P4-03      | TG-1       |
| P4-05 | Publish token/latency/accuracy report with CIs and escalation stats     | 14 + 11    | benchmark report          | P4-04      | TG-1/TG-4  |
| P4-06 | Validate fairness-pin audit trail for each run                          | 14         | fairness audit log        | P4-04      | TG-1       |

Exit criteria:

- TG-1 green.
- Benchmark outputs reproducible from checkpoints with fairness audit trail.

## Phase 5: Command surface, docs, and ship readiness (Week 8)

Goal: finalize user surface, governance, and release safety.

Entry criteria:

- Phase 4 exit criteria met.

Task breakdown:

| ID    | Task                                                            | Owner      | Deliverable                   | Depends on   | TG mapping |
| ----- | --------------------------------------------------------------- | ---------- | ----------------------------- | ------------ | ---------- |
| P5-01 | Register /pollux command on required command surfaces           | 05 + 12/13 | command registrations + tests | P2-07        | TG-7       |
| P5-02 | Add minimal UX indicators and optional debug detail output      | 01 + 12    | UX behavior tests             | P5-01        | TG-7       |
| P5-03 | Finalize docs/spec/plan alignment and correction ledger updates | 16         | docs sync PR                  | P5-01/P4-05  | TG-10      |
| P5-04 | Enable Pollux-scoped binary, perf, and memory CI workflows      | 15         | CI workflow PR                | P0-04        | TG-9       |
| P5-05 | Release readiness review (risk closure + rollback plan)         | 15 + 16    | ship-readiness decision log   | P5-01..P5-04 | TG-9/TG-10 |

Exit criteria:

- TG-7, TG-9, TG-10 green.
- Release board signoff with rollback plan attached.

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
