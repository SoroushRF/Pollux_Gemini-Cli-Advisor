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

Scope: Phase 0 contract lock only. Implementation of the packaged rule ships in
Phase 1 (tracked by ledger item D-01).

Done criteria:

- advisor_consultation policy-decision path is contracted, including packaged
  default ALLOW rule behavior, non-interactive fail-open semantics, and ACP-safe
  behavior, in docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md.
- Acceptance test list exists and maps to TG-3 and TG-8.

Owner: 09, with 04/12 support

Implementation carry-over (Phase 1 entry criteria):

- Land packaged default ALLOW rule for advisor_consultation behind
  pollux.enabled (D-01).
- Land AT-01..AT-05 acceptance tests before Phase 2 entry.

### G3: Settings pipeline locked

Scope: Phase 0 contract lock only. Schema, loader, core mapping, and CI gate
ship in Phase 1 (tracked as P1-03, P1-04, and ledger item D-02).

Done criteria:

- experimental.pollux.\* settings strategy, mapping contract, precedence, and
  promotion path are contracted in docs/core/pollux/P0-03_SETTINGS_STRATEGY.md.
- Schema-to-ConfigParameters invariant expectations are documented.
- CI gate contract (CG-02) is captured in
  docs/core/pollux/P0-04_CI_GATES_BRANCH_PROTECTIONS.md.

Owner: 06, with 15 support

Implementation carry-over (Phase 1 entry criteria):

- Add experimental.pollux.\* to CLI SETTINGS_SCHEMA and loader (P1-03).
- Map to core ConfigParameters with invariant tests (P1-04).
- Wire schema:settings --check as a required CI job (D-02).

### G4: Benchmark fairness harness locked

Scope: Phase 0 contract lock only. Harness scaffold and implementation ship in
Phase 1/Phase 4 (tracked as P4-02).

Done criteria:

- Fairness pins FP-01..FP-06, harness contract, validity rules, and required
  metadata are contracted in
  docs/core/pollux/P0-05_BENCHMARK_FAIRNESS_HARNESS_CONTRACT.md.
- Acceptance checks AC-01..AC-06 are defined and mapped to TG-1 (and TG-4 where
  applicable).

Owner: 14, with 07/10 support

Implementation carry-over (Phase 1/4 entry criteria):

- Provide harness scaffold at packages/test-utils/src/benchmark-harness.ts
  exposing the P0-05 §3.2 configuration surface no later than Phase 4 entry.
- CG-04 (fairness-pin smoke CI gate) is required from Phase 4 exit onward, not
  before.

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

| ID    | Task                                                                                              | Owner         | Deliverable                                                                                             | Depends on   |
| ----- | ------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| P0-01 | [Done 2026-04-17] Publish driver/interceptor matrix for all in-scope surfaces                     | 02 + 01/03/12 | Matrix doc + seam ownership map -> docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md                  | G0           |
| P0-02 | [Done 2026-04-17] Lock advisor policy decision path, including ACP behavior                       | 09 + 04/12    | Policy design note + acceptance tests list -> docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md             | P0-01        |
| P0-03 | [Done 2026-04-17] Define settings strategy (experimental.pollux.\* + promotion path)              | 06            | Settings contract note -> docs/core/pollux/P0-03_SETTINGS_STRATEGY.md                                   | G0           |
| P0-04 | [Done 2026-04-17] Define mandatory CI gates and branch protections                                | 15            | CI checklist + required jobs -> docs/core/pollux/P0-04_CI_GATES_BRANCH_PROTECTIONS.md                   | P0-02/P0-03  |
| P0-05 | [Done 2026-04-17] Define benchmark fairness controls (router/loop/availability/session isolation) | 14 + 07/10    | Fairness checklist + harness contract -> docs/core/pollux/P0-05_BENCHMARK_FAIRNESS_HARNESS_CONTRACT.md  | G0           |
| P0-06 | [Done 2026-04-17] Land governance controls (CODEOWNERS + correction ledger process)               | 16 + 15       | Governance PR + review ownership map -> docs/core/pollux/P0-06_GOVERNANCE_CONTROLS_CODEOWNERS_LEDGER.md | G5           |
| P0-07 | [Done 2026-04-17] Create implementation PR template keyed to TGs                                  | 16            | PR template with TG mapping -> docs/core/pollux/P0-07_IMPLEMENTATION_PR_TEMPLATE_TG_MAPPING.md          | P0-04        |
| P0-08 | [Done 2026-04-17] Produce Phase 1 execution board (task issue list with owners)                   | PM/16         | Tracked issue set -> docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md                                   | P0-01..P0-07 |

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

1. Commit b1b4260fc: docs: complete P0-02 policy channel lock artifacts.

#### P0-03 (Done 2026-04-17)

Summary:

1. Published the settings strategy contract for Phase 1 under
   experimental.pollux.\*.
2. Defined schema-to-loader-to-core mapping constraints and silent-drift
   safeguards.
3. Defined promotion path from experimental.pollux._ to top-level pollux._ with
   TG-5 acceptance tests.

Pointer:

1. Canonical artifact: docs/core/pollux/P0-03_SETTINGS_STRATEGY.md
2. Pointer stub: docs/repo-compartment-analysis/P0-03_SETTINGS_STRATEGY.md

Citations and references:

1. POLLUX_SPEC.md section 8 (settings and configuration contract).
2. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-6 and NA-5
   settings mitigation).
3. docs/repo-compartment-analysis/reports/06-settings-schema-and-config-plumbing/report.md
4. docs/repo-compartment-analysis/reports/15-build-packaging-release-and-ci/report.md
5. docs/repo-compartment-analysis/reports/16-docs-specs-and-governance/report.md

Change record:

1. Commit f95ebac89: docs: complete P0-03 settings strategy artifact.

#### P0-04 (Done 2026-04-17)

Summary:

1. Published mandatory Pollux CI-gates contract and branch-protection
   requirements.
2. Captured baseline required CI jobs and documented current Pollux-readiness
   gaps.
3. Added gate-to-TG mapping and release relevance for enforcement planning.

Pointer:

1. Canonical artifact: docs/core/pollux/P0-04_CI_GATES_BRANCH_PROTECTIONS.md
2. Pointer stub:
   docs/repo-compartment-analysis/P0-04_CI_GATES_BRANCH_PROTECTIONS.md

Citations and references:

1. POLLUX_SPEC.md section 12 (CI, test, and release contract).
2. docs/repo-compartment-analysis/reports/15-build-packaging-release-and-ci/report.md
3. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (NA-9).
4. .github/workflows/ci.yml
5. .github/workflows/test-build-binary.yml
6. .github/workflows/perf-nightly.yml
7. .github/workflows/memory-nightly.yml

Change record:

1. Commit 66d5f7edb: docs: complete P0-04 CI and branch protection contract.

#### P0-05 (Done 2026-04-17)

Summary:

1. Published mandatory benchmark fairness pins and run-validity contract for
   conditions A-E.
2. Defined harness contract including router, loop, availability, session, and
   sandbox-isolation controls.
3. Added acceptance checks mapped to TG-1 (and TG-4 where applicable).

Pointer:

1. Canonical artifact:
   docs/core/pollux/P0-05_BENCHMARK_FAIRNESS_HARNESS_CONTRACT.md
2. Pointer stub:
   docs/repo-compartment-analysis/P0-05_BENCHMARK_FAIRNESS_HARNESS_CONTRACT.md

Citations and references:

1. POLLUX_SPEC.md section 10 and Appendix B.
2. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-3 and NA-2).
3. docs/repo-compartment-analysis/reports/07-routing-availability-loop-and-pollux/report.md
4. docs/repo-compartment-analysis/reports/14-testing-and-evaluation-architecture/report.md
5. docs/repo-compartment-analysis/reports/10-sandbox-shell-and-filesystem-substrate/report.md

Change record:

1. Commit 45bbfca89: docs: complete P0-05 benchmark fairness contract.

#### P0-06 (Done 2026-04-17)

Summary:

1. Landed explicit CODEOWNERS coverage for POLLUX\_\*.md and
   docs/repo-compartment-analysis governance docs.
2. Added mandatory correction-ledger operating process to prevent doc/spec
   governance drift.
3. Closed governance correction item C-07 in POLLUX_DOC_CORRECTIONS.md.

Pointer:

1. Canonical artifact:
   docs/core/pollux/P0-06_GOVERNANCE_CONTROLS_CODEOWNERS_LEDGER.md
2. Pointer stub:
   docs/repo-compartment-analysis/P0-06_GOVERNANCE_CONTROLS_CODEOWNERS_LEDGER.md

Citations and references:

1. IMPLEMENTATION_PLAN.md section 3 (G5 done criteria) and section 6 (TG-10).
2. POLLUX_SPEC.md section 14 (documentation and governance contract).
3. docs/repo-compartment-analysis/reports/16-docs-specs-and-governance/report.md
   (VT-16.4 and R-16.3).
4. docs/repo-compartment-analysis/reports/15-build-packaging-release-and-ci/report.md
   (governance linkage in CI/release context).
5. .github/CODEOWNERS
6. POLLUX_DOC_CORRECTIONS.md

Change record:

1. Commit 57a9e89ef: docs: complete P0-06 governance controls.

#### P0-07 (Done 2026-04-17)

Summary:

1. Updated the repository PR template with a Pollux TG mapping section for TG-1
   through TG-10.
2. Added explicit evidence fields (tests/logs/artifacts) and Pass/N/A status
   tracking for each gate.
3. Added pre-merge checklist enforcement requiring Pollux TG mapping completion
   or explicit N/A declaration.

Pointer:

1. Canonical artifact:
   docs/core/pollux/P0-07_IMPLEMENTATION_PR_TEMPLATE_TG_MAPPING.md
2. Pointer stub:
   docs/repo-compartment-analysis/P0-07_IMPLEMENTATION_PR_TEMPLATE_TG_MAPPING.md

Citations and references:

1. IMPLEMENTATION_PLAN.md section 6 (TG-1 through TG-10 definitions).
2. POLLUX_SPEC.md section 14 (documentation and governance contract).
3. docs/repo-compartment-analysis/reports/16-docs-specs-and-governance/report.md
   (governance metadata and review routing context).
4. .github/pull_request_template.md

Change record:

1. Commit 1d83d946b: docs: complete P0-07 Pollux PR template gate mapping.

#### P0-08 (Done 2026-04-17)

Summary:

1. Published a Phase 1 execution board with tracked issue IDs for P1-01 through
   P1-07.
2. Assigned owners, dependencies, TG mappings, and initial status for each Phase
   1 task.
3. Established execution-board rules for status lifecycle and evidence updates.

Pointer:

1. Canonical artifact: docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md
2. Pointer stub: docs/repo-compartment-analysis/P0-08_PHASE1_EXECUTION_BOARD.md

Citations and references:

1. IMPLEMENTATION_PLAN.md (P0-08 task row and Phase 1 task breakdown).
2. IMPLEMENTATION_PLAN.md section 6 (TG-1 through TG-10).
3. IMPLEMENTATION_PLAN.md Phase 0 exit criteria (all Phase 1 tasks have issue
   IDs and owners).
4. POLLUX_SPEC.md section 14 (documentation and governance contract).
5. docs/repo-compartment-analysis/reports/16-docs-specs-and-governance/report.md
   (ownership and review routing context).

Change record:

1. Commit 1f0e66a4b: docs: complete P0-08 phase1 execution board.

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
- G2 implementation carry-over scheduled: packaged default ALLOW rule (D-01)
  assigned to a Phase 1 task window.
- G3 implementation carry-over scheduled: P1-03 schema, P1-04 mapping, and
  schema:settings --check CI job (D-02) assigned to a Phase 1 task window.
- G4 implementation carry-over scheduled: harness scaffold is committed to Phase
  1 or Phase 4 entry, whichever is earlier.

Task breakdown:

| ID    | Task                                                                                                | Owner   | Deliverable                         | Depends on  | TG mapping |
| ----- | --------------------------------------------------------------------------------------------------- | ------- | ----------------------------------- | ----------- | ---------- |
| P1-01 | [Done 2026-04-18] Define types and interfaces (turn context, detector contracts, advisor contracts) | 02      | types.ts + unit tests               | P0-08       | TG-6       |
| P1-02 | [Done 2026-04-18] Implement model registry and alias resolver contract                              | 07 + 02 | models.ts + validation tests        | P1-01       | TG-6       |
| P1-03 | [Done 2026-04-18] Add experimental.pollux.\* to CLI settings schema and loader                      | 06      | settings schema + loader mapping    | P0-03       | TG-5       |
| P1-04 | [Done 2026-04-18] Map config into core ConfigParameters and accessors                               | 06 + 02 | config mapping + invariant tests    | P1-03       | TG-5       |
| P1-05 | [Done 2026-04-18] Add LlmRole.UTILITY_ADVISOR and role-plumb through existing telemetry path        | 11 + 02 | role enum + wiring tests            | P1-01       | TG-4       |
| P1-06 | [Done 2026-04-18] Implement advisor prompt builder/parser with strict schema validation             | 02      | prompts/advisor parser + unit tests | P1-01       | TG-6       |
| P1-07 | [Done 2026-04-18] Add fail-open defaults and max-call budget configs                                | 02 + 09 | config defaults + safeguards        | P1-04/P1-06 | TG-3/TG-6  |
| P1-08 | [Done 2026-04-18] Land packaged default ALLOW rule for advisor_consultation (closes ledger D-01)    | 09 + 16 | policy rule + AT-01..AT-05 tests    | P0-02       | TG-3/TG-8  |
| P1-09 | [Done 2026-04-17] Wire `schema:settings --check` as required PR CI job (closes ledger D-02, CG-02)  | 06 + 15 | CI workflow update + drift test     | P1-03/P1-04 | TG-5       |

Exit criteria:

- TG-5 green (schema/config invariants).
- Foundation tests green with Pollux disabled and enabled (no runtime
  integration yet).
- Ledger items D-01 and D-02 closed with evidence via P1-08 and P1-09.

Phase 1 remediation evidence update (2026-04-18):

- P1-08 acceptance coverage backfilled for AT-03/AT-04/AT-05 (ACP permission
  behavior, no duplicate confirmation chain, and policy decision invariants).
- P1-07 numeric hardening completed for Pollux finite out-of-range values
  (advisor budget floors and confidence threshold bounds).
- P1-03/P1-04 precedence evidence expanded with Pollux-specific merge and
  config-mapping tests.

## Phase 2: Runtime integration by surface (Weeks 3-4)

Goal: integrate Pollux across in-scope surfaces without violating stream or
policy invariants.

Required reading before any P2-xx PR is opened:
docs/core/pollux/PHASE2_GUARDRAILS.md. The guardrails document carries the
pre-flight checklist, session-start prompt for AI agents, per-surface failure
modes, invariants, banned patterns, required patterns, and PR discipline
specific to Phase 2.

Entry criteria:

- Phase 1 exit criteria met.
- P0 policy and seam contracts signed off.
- PHASE2_GUARDRAILS.md §1 Golden Rule acknowledged by the implementer.

Task breakdown:

| ID    | Task                                                                                    | Owner            | Deliverable                         | Depends on   | TG mapping |
| ----- | --------------------------------------------------------------------------------------- | ---------------- | ----------------------------------- | ------------ | ---------- |
| P2-01 | [Done 2026-04-18] Integrate legacy interactive path (processTurn seam)                  | 02 + 01          | integration code + regression tests | P1-01..P1-07 | TG-2/TG-6  |
| P2-02 | [Done 2026-04-18] Integrate legacy non-interactive path and output stability checks     | 02 + 01          | non-interactive parity tests        | P2-01        | TG-2       |
| P2-03 | [Done 2026-04-18] Integrate interactive agent-session path and parity assertions        | 03 + 01          | adapter parity tests                | P2-01        | TG-2       |
| P2-04 | [Done 2026-04-18] Integrate non-interactive agent-session path and parity assertions    | 03 + 01          | agent-session non-interactive tests | P2-03        | TG-2       |
| P2-05 | [Done 2026-04-18] Implement ACP advisor semantics without unexpected permission prompts | 12 + 09/02       | ACP integration + permission tests  | P0-02/P2-01  | TG-3/TG-8  |
| P2-06 | [Done 2026-04-18] Add explicit A2A deferred-scope assertions and docs                   | 13 + 16          | bypass tests + docs notes           | P0-01        | TG-10      |
| P2-07 | [Done 2026-04-18] Run cross-surface integration matrix and compare observable behavior  | 14 + 01/02/03/12 | matrix report artifact              | P2-01..P2-05 | TG-2/TG-6  |

Exit criteria:

- TG-2, TG-3, TG-6, TG-8 green.
- No event ordering or continuation regressions in any in-scope surface.

Phase 2 implementation evidence update (2026-04-18):

- P2-01 (D1 legacy interactive) delivered with surface-scoped integration,
  parity tests, and fail-open coverage:
  - Core integration seam and runtime-surface propagation:
    `packages/core/src/core/client.ts`
  - Interactive legacy caller wiring to D1 surface tag:
    `packages/cli/src/ui/hooks/useGeminiStream.ts`
  - D1 Cell A-D matrix tests: `packages/core/src/core/client.test.ts`
  - CLI hook regression updates for expanded call signature and loop
    confirmation behavior: `packages/cli/src/ui/hooks/useGeminiStream.test.tsx`
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/core/client.test.ts`
      passed for the D1 matrix additions.
    - `npm run test --workspace @google/gemini-cli -- src/ui/hooks/useGeminiStream.test.tsx`
      passed after signature/loop-handling updates.
    - `npm run typecheck --workspace @google/gemini-cli-core` and
      `npm run typecheck --workspace @google/gemini-cli` passed.
  - Commit evidence: `df68732cf`.

- P2-02 (D2 legacy non-interactive) delivered with non-interactive parity and
  output-stability-oriented fail-open checks:
  - Core D2 integration (legacy advisor path extended to non-interactive runtime
    surface while preserving default legacy non-interactive routing):
    `packages/core/src/core/client.ts`
  - D2 Cell A-D matrix tests: `packages/core/src/core/client.test.ts`
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/core/client.test.ts`
      passed with D2 Cell A-D coverage.
    - `npm run typecheck --workspace @google/gemini-cli-core` passed.
  - Commit evidence: `97a67416f`.

- P2-03 (D3 interactive agent-session) delivered with explicit runtime-surface
  wiring and parity/fail-open coverage:
  - Interactive agent-session caller wiring to D3 surface tag:
    `packages/cli/src/ui/AppContainer.tsx`
  - Agent-session adapter runtime-surface propagation to core client:
    `packages/core/src/agent/legacy-agent-session.ts`
  - Adapter propagation regression test:
    `packages/core/src/agent/legacy-agent-session.test.ts`
  - D3 Cell A-D matrix tests: `packages/core/src/core/client.test.ts`
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/core/client.test.ts src/agent/legacy-agent-session.test.ts`
      passed with D3 Cell A-D plus adapter propagation coverage.
    - `npm run typecheck --workspace @google/gemini-cli-core` passed.
  - Commit evidence: `54af0a45a`.

- P2-04 (D4 non-interactive agent-session) delivered with explicit D4 runtime
  surface wiring and parity/fail-open coverage:
  - Non-interactive agent-session caller wiring to D4 surface tag:
    `packages/cli/src/nonInteractiveCliAgentSession.ts`
  - Core D4 integration (advisor gate extended to agent-session non-interactive
    runtime surface): `packages/core/src/core/client.ts`
  - D4 Cell A-D matrix tests: `packages/core/src/core/client.test.ts`
  - Non-interactive agent-session output/continuation expectation updates for
    explicit D4 surface propagation:
    `packages/cli/src/nonInteractiveCliAgentSession.test.ts`
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/core/client.test.ts src/agent/legacy-agent-session.test.ts`
      passed with D4 Cell A-D coverage included.
    - `npm run test --workspace @google/gemini-cli -- src/nonInteractiveCliAgentSession.test.ts`
      passed with 50/50 tests green after D4 propagation expectation updates.
    - `npm run typecheck --workspace @google/gemini-cli-core` and
      `npm run typecheck --workspace @google/gemini-cli` passed.
  - Commit evidence: `7abf26911`.

- P2-05 (D5 ACP) delivered with a dedicated per-surface advisor seam that
  preserves ACP observable behavior and enforces the P0-02 §2.4 no-redundant-
  permission-prompt contract:
  - Core public per-surface wrapper `runPolluxAdvisorConsultation` on
    `GeminiClient` and allow-list extension to include
    `PolluxRuntimeSurface.ACP` (`packages/core/src/core/client.ts`). The
    existing `maybeRunPolluxAdvisorConsultation` helper continues to own the
    policy check (packaged default ALLOW rule from P1-08), budget gate,
    `LlmRole.UTILITY_ADVISOR` telemetry tag, and internal fail-open.
  - ACP seam wiring in `Session.prompt` that invokes the advisor before
    `GeminiChat.sendMessageStream` and guards it with a defense-in-depth
    try/catch so any future regression in the seam cannot surface to the ACP
    client or emit a permission prompt: `packages/cli/src/acp/acpClient.ts`.
  - D5 Cell A-D matrix tests plus P2-05 public-wrapper guards (A2A_DEFERRED
    no-op and ACP surface invocation) in
    `packages/core/src/core/client.test.ts`.
  - ACP integration tests covering advisor-before-stream ordering, absence of
    `connection.requestPermission` on the advisor-only path, fail-open on
    advisor rejection, and backwards-compatible no-op when the public wrapper is
    absent: `packages/cli/src/acp/acpClient.test.ts`.
  - Validation evidence:
    - `npx vitest run src/core/client.test.ts` passed (104 tests) with D5 Cell
      A-D plus public-wrapper coverage in
      `packages/core/src/core/client.test.ts`.
    - `npx vitest run src/acp/acpClient.test.ts` passed (64 tests) including the
      new `Pollux ACP advisor seam (P2-05)` block.
    - `npm run test --workspace @google/gemini-cli` passed (440 test files /
      6494 tests).
    - `npm run typecheck --workspace @google/gemini-cli-core` and
      `npm run typecheck --workspace @google/gemini-cli` passed.

- P2-06 (D6 A2A deferred-scope bypass) delivered with explicit call-site
  tagging, BP-06 assertion tests, and a dedicated deferred-scope contract
  document closing the P0-01 §D6 requirement that A2A remain an explicit bypass
  in Phase 1/Phase 2:
  - Every A2A `GeminiClient.sendMessageStream` invocation is now tagged with
    `PolluxRuntimeSurface.A2A_DEFERRED` (both call sites in
    `packages/a2a-server/src/agent/task.ts`: `sendCompletedToolsToLlm` and
    `acceptUserMessage`). This removes the default `LEGACY_NON_INTERACTIVE`
    fallback that would otherwise have engaged the advisor seam on A2A when
    `pollux.enabled=true`.
  - BP-06 assertion tests added as `Pollux A2A deferred bypass (P2-06 / BP-06)`
    in `packages/a2a-server/src/agent/task.test.ts`, covering (a)
    `acceptUserMessage` call-site tagging, (b) `sendCompletedToolsToLlm`
    call-site tagging, and (c) explicit negative assertion that the A2A path
    never uses the `LEGACY_NON_INTERACTIVE` surface.
  - Seam-level no-op guard for `A2A_DEFERRED` is already covered by
    `runPolluxAdvisorConsultation is a no-op for unknown runtime surfaces (P2-05 guard)`
    in `packages/core/src/core/client.test.ts`.
  - Deferred-scope contract document
    `docs/core/pollux/P2-06_A2A_DEFERRED_BYPASS.md` specifying the reason for
    deferral, the bypass contract, the reason marker
    (`PolluxRuntimeSurface.A2A_DEFERRED`), BP-06 acceptance tests, and the
    reactivation preconditions.
  - Validation evidence:
    - `npx vitest run src/agent/task.test.ts` passed (13 tests including the 3
      new BP-06 tests).
    - `npm run test` for `@google/gemini-cli-a2a-server` passed (13 test files /
      127 tests).
    - `npm run typecheck` passed for core, cli, and a2a-server workspaces.

- P2-07 (Cross-surface integration matrix) delivered with a single versioned
  report artifact that consolidates Cell A–D evidence across all in-scope
  surfaces (D1–D5) and the D6 explicit-bypass row, and pins the Phase 2 exit
  gates TG-2, TG-3, TG-6, and TG-8 at one HEAD commit:
  - Matrix report: `docs/core/pollux/P2-07_CROSS_SURFACE_INTEGRATION_MATRIX.md`.
    Sections 3.1– 3.6 enumerate each surface row × cell (A/B/C/D for D1–D5,
    Bypass for D6) with the exact `it(...)` name and file:line reference that
    pins the cell. Section 4 lists the eight observable-behavior invariants
    verified simultaneously across every active row (stream-event ordering,
    continuation parity, no `GeminiChat` history mutation, single policy
    routing, no redundant ACP permission prompts, `LlmRole.UTILITY_ADVISOR`
    tagging, budget safeguards, and D6 seam-allow-list absence).
  - Consolidated cross-surface test run at HEAD `d71a823b2`:
    - `npx vitest run src/core/client.test.ts src/agent/legacy-agent-session.test.ts src/pollux/types.test.ts`
      in `packages/core` → 3 files / 147 passed / 1 unrelated pre-existing skip.
    - `npx vitest run src/agent/task.test.ts` in `packages/a2a-server` → 1 file
      / 13 passed.
    - `npx vitest run src/acp/acpClient.test.ts src/nonInteractiveCliAgentSession.test.ts src/ui/hooks/useGeminiStream.test.tsx`
      in `packages/cli` → 3 files / 193 passed.
    - Totals: 353 Pollux-scoped tests green across the three workspaces at the
      same commit, with the only non-pass being an unrelated pre-existing skip
      outside the Pollux matrix.
  - Test-gate sign-off recorded in the report §6:
    - TG-2 green via sections 3.1–3.6 rows × cells plus §4 invariants 1–2.
    - TG-3 green via D5 ACP regression block + §4 invariant 5 (no redundant
      permission prompts on the advisor-only path).
    - TG-6 green via the consolidated run in §5.
    - TG-8 green via the `Pollux ACP advisor seam (P2-05)` block in
      `packages/cli/src/acp/acpClient.test.ts` (3 tests) plus D5 Cell A–D in
      `packages/core/src/core/client.test.ts`.
    - TG-10 contribution recorded for the A2A deferred-scope drift guard via
      `docs/core/pollux/P2-06_A2A_DEFERRED_BYPASS.md` and the BP-06 call-site
      and seam-level assertions.
  - Phase 2 exit checklist (report §7) all boxes closed. Phase 3 (P3-01 et seq.)
    is now unblocked per its dependency declaration on P2-07.

## Phase 3: Escalation and advisor hardening (Week 5)

Goal: make escalation robust, measurable, and safe under failure.

Entry criteria:

- Phase 2 exit criteria met.

Task breakdown:

| ID    | Task                                                                              | Owner   | Deliverable                      | Depends on   | TG mapping |
| ----- | --------------------------------------------------------------------------------- | ------- | -------------------------------- | ------------ | ---------- |
| P3-01 | [Done 2026-04-18] Implement heuristic detector and deterministic reason codes     | 02 + 07 | detector module + tests          | P2-07        | TG-6       |
| P3-02 | [Done 2026-04-18] Implement structured detector with confidence tag stripping     | 02      | structured detector + leak tests | P3-01        | TG-6       |
| P3-03 | [Done 2026-04-18] Implement hybrid detector precedence and tie-break semantics    | 02      | hybrid policy + tests            | P3-01/P3-02  | TG-6       |
| P3-04 | [Done 2026-04-18] Implement advisor timeout/malformed response fail-open behavior | 02 + 09 | fail-open runtime tests          | P3-02        | TG-3/TG-6  |
| P3-05 | [Done 2026-04-18] Add escalation calibration set and threshold tuning guide       | 14 + 02 | calibration report               | P3-01..P3-04 | TG-6       |
| P3-06 | [Done 2026-04-18] Verify telemetry reconciliation under escalation load           | 11 + 02 | reconciliation test report       | P3-04        | TG-4       |
| P3-07 | [Done 2026-04-18] Wire detector into runtime advisor seam (closes Phase 3 gap)    | 02      | detector seam + surface tests    | P3-01..P3-06 | TG-6       |

Exit criteria:

- Detector calibration and fail-open behavior documented.
- TG-4 and TG-6 green under stress scenarios.
- Detector wired into the runtime advisor seam so the configured strategy
  actually gates advisor invocation (no dead-code detectors).

Phase 3 exit checklist (2026-04-18 — closed):

- [x] Heuristic, structured, and hybrid detectors implemented with deterministic
      reason codes and baseline-purity invariants (P3-01..P3-03).
- [x] Advisor fail-open behavior covered for timeout, malformed-response,
      empty-response, and policy-deny across all five in-scope surfaces (P3-04
  - the policy-denied table added in P3-07).
- [x] Calibration set, sweep utilities, and tuning guide published with pinned
      default-threshold ground truth (P3-05).
- [x] Telemetry reconciliation under N=50 escalation load with role isolation,
      token accounting identity, and stress tolerance (P3-06).
- [x] Detector wired into `maybeRunPolluxAdvisorConsultation`; runtime advisor
      invocation gated by `shouldEscalate(...)` per POLLUX_SPEC §5.1 step 2
      (P3-07).
- [x] Phase 3 test suites green: 232 Pollux tests, 124 client tests (1
      pre-existing skip), 64 ACP client tests, 13 a2a-server task tests.

Phase 3 implementation evidence update (2026-04-18):

- P3-01 (Heuristic detector) delivered with a pure, deterministic detector
  module honoring every property required by POLLUX_SPEC §7.2 / §7.4 and the
  Phase 2 baseline-purity invariants:
  - New module `packages/core/src/pollux/detector.ts` exporting
    `createHeuristicDetector` (factory implementing `PolluxDetector`),
    `evaluateHeuristicSignals` (pure signal evaluator),
    `isHeuristicPathEligible` (shared gate usable by P3-03 hybrid composer),
    `DEFAULT_HEURISTIC_RULES` (six deterministic signal rules:
    `EXPLICIT_BLOCKED`, `HELP_REQUEST`, `COMPLEXITY`, `DEBUG_INTENT`,
    `ERROR_MARKER`, `RETRY_LOOP`), plus the `DEFAULT_HEURISTIC_MIN_SCORE` and
    `DETECTOR_MAX_FIELD_LENGTH` constants.
  - Deterministic reason codes wired end-to-end via
    `PolluxEscalationReasonCode`: `CONFIG_DISABLED` (Pollux off),
    `DEFERRED_SURFACE` (A2A bypass), `BUDGET_EXHAUSTED` (per-turn / per-session
    caps), `HEURISTIC_MATCH` (score ≥ threshold), `NONE` (enabled but no rule
    fired or strategy is structured-only). Every return path carries
    `strategy: HEURISTIC`.
  - Baseline purity: detector is synchronous at evaluation time (the Promise is
    only the contract shape), performs no I/O or LLM calls, bounds both
    inspected fields to 4 096 characters, and does not mutate the turn context.
    Verified by two dedicated invariant tests.
  - New module exposed from `packages/core/src/pollux/index.ts` alongside the
    existing types/models/prompts/safeguards surface.
  - Test evidence in `packages/core/src/pollux/detector.test.ts` (35 tests):
    - Constants/defaults surface tests (non-empty rule ids, unique ids, valid
      fields, input clamp at `DETECTOR_MAX_FIELD_LENGTH`).
    - Gate tests for `isHeuristicPathEligible` covering CONFIG_DISABLED,
      DEFERRED_SURFACE, NONE (structured strategy), BUDGET_EXHAUSTED for both
      turn and session caps, and eligibility under heuristic + hybrid
      strategies.
    - Explicit false-negative table-driven coverage (`it.each` × 6 positive
      scenarios) for EXPLICIT_BLOCKED, ERROR_MARKER, RETRY_LOOP, HELP_REQUEST
      - COMPLEXITY accumulation, DEBUG_INTENT + ERROR_MARKER across fields, and
        tool-side matches for `field=both` rules.
    - Explicit false-positive table-driven coverage (`it.each` × 7 negative
      scenarios) for neutral code requests, documentation questions, single weak
      keywords under threshold, `exit code 0`, the word "error" outside an error
      prefix, lone architectural vocabulary, and empty inputs.
    - Determinism tests: repeated evaluations identical; matched rule id order
      is rule-set order regardless of field origin.
    - Factory tests covering short-circuit behavior on every gate, HEURISTIC
      escalation on match, NONE on no match, `minScore` override, custom rule
      set (empty-rule-equivalent), and minScore clamping for malformed input.
    - Baseline-purity invariant tests: resolves synchronously within 50 ms with
      no scheduled timers, and does not mutate the input context or its
      experimental config.
  - Validation evidence:
    - `npx vitest run src/pollux/detector.test.ts` in `packages/core` → 1 file /
      35 passed.
    - `npx vitest run src/pollux` in `packages/core` → 5 files / 70 passed
      (detector + existing types/models/prompts/safeguards suites all green).
    - `npm run typecheck --workspace @google/gemini-cli-core` passed.

- P3-02 (Structured detector) delivered with deterministic confidence-tag
  extraction, confidence-tag stripping, and threshold-driven escalation logic
  aligned to POLLUX_SPEC §7.2 / §7.3:
  - Extended `packages/core/src/pollux/detector.ts` with
    `createStructuredDetector`, `evaluateStructuredConfidenceSignal`, and
    `isStructuredPathEligible`.
  - Added structured gate semantics mirroring existing Pollux safeguards:
    `CONFIG_DISABLED`, `DEFERRED_SURFACE`, `BUDGET_EXHAUSTED`, and strategy
    gating (`HEURISTIC` path returns `NONE` for structured detector).
  - Added deterministic structured escalation outcomes:
    - Escalate only when parsed structured confidence is valid (1-10) and
      `>= experimental.pollux.confidenceThreshold`.
    - Use `PolluxEscalationReasonCode.STRUCTURED_TAG` on escalate and `NONE` on
      fail-open/non-match.
    - Preserve `structuredConfidence` in decision output when parsed but below
      threshold.
  - Implemented leak prevention in structured evaluation by returning stripped
    bounded context fields and removing both valid and malformed
    `pollux:confidence` markers before downstream use.
  - Expanded `packages/core/src/pollux/detector.test.ts` with structured-path
    TG-6 coverage (19 new tests) for:
    - Eligibility gates across disabled/deferred/budget/strategy scenarios.
    - Confidence extraction + stripping in both user/tool fields.
    - Fail-open behavior for missing/malformed tags.
    - Out-of-range tag handling and bounded-field clamp behavior.
    - Threshold-driven escalation (`STRUCTURED_TAG`) and deterministic repeated
      evaluation.
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/pollux/detector.test.ts`
      passed (1 file / 54 tests) and post-test core build completed.
    - `npm run typecheck --workspace @google/gemini-cli-core` passed.

- P3-03 (Hybrid detector precedence/tie-break semantics) delivered with
  deterministic composition of heuristic + structured signals and explicit tie
  policy aligned to POLLUX_SPEC §7.1 / §7.2:
  - Extended `packages/core/src/pollux/detector.ts` with `createHybridDetector`,
    `evaluateHybridSignals`, and `isHybridPathEligible`.
  - Implemented hybrid gate semantics mirroring existing Pollux constraints:
    `CONFIG_DISABLED`, `DEFERRED_SURFACE`, `BUDGET_EXHAUSTED`, and non-active
    strategy (`NONE` when hybrid is not selected).
  - Implemented deterministic hybrid resolution policy:
    - `structured` when structured confidence alone reaches threshold.
    - `heuristic` when heuristic score alone reaches threshold.
    - `tie_structured` when both paths qualify in the same turn.
    - `none` when neither path qualifies.
  - Hybrid detector output behavior:
    - Escalation decisions use `PolluxEscalationReasonCode.HYBRID_RESOLUTION`.
    - Non-escalation uses `PolluxEscalationReasonCode.NONE`.
    - `structuredConfidence` is preserved in hybrid results when present,
      including below-threshold diagnostics.
  - Expanded `packages/core/src/pollux/detector.test.ts` with hybrid TG-6
    coverage (20 new tests) for:
    - Hybrid gate behavior under disabled/deferred/budget/not-active cases.
    - Structured-only, heuristic-only, both-hit tie, below-threshold fallback,
      and neither-hit outcomes.
    - Determinism checks for both signal evaluation and detector factory paths.
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/pollux/detector.test.ts`
      passed (1 file / 74 tests) and post-test core build completed.
    - `npm run typecheck --workspace @google/gemini-cli-core` passed.

- P3-04 (Advisor timeout/malformed fail-open behavior) delivered by hardening
  runtime fail-open coverage for advisor parse/empty response failures across
  all in-scope runtime surfaces, validating the existing
  `maybeRunPolluxAdvisorConsultation` fail-open contract in
  `packages/core/src/core/client.ts`:
  - Existing runtime behavior confirmed and enforced via tests:
    - Timeout failures fall through to executor path (already covered by D1-D5
      Cell D runtime tests).
    - Malformed advisor responses fail-open (`parse_error`) without emitting
      user-visible cancellation or stream drift.
    - Empty advisor responses fail-open (`empty_response`) without emitting
      user-visible cancellation or stream drift.
  - Expanded `packages/core/src/core/client.test.ts` with P3-04 runtime tests:
    - Table-driven malformed-response fail-open tests for all in-scope surfaces
      (legacy interactive, legacy non-interactive, agent-session interactive,
      agent-session non-interactive, ACP).
    - Table-driven empty-response fail-open tests for all in-scope surfaces.
    - Each test asserts executor stream remains baseline-identical and that no
      `GeminiEventType.UserCancelled` event is introduced.
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/core/client.test.ts`
      passed (1 file / 114 tests, 1 pre-existing skip) and post-test core build
      completed.
    - `npm run typecheck --workspace @google/gemini-cli-core` passed.

- P3-05 (Escalation calibration set and threshold tuning guide) delivered with a
  curated calibration set, sweep utilities, and a published tuning guide that
  pins the default-threshold ground truth for every detector strategy:
  - Added `packages/core/src/pollux/calibration.ts` with:
    - `CALIBRATION_SET`: 21 labeled turn contexts spanning four categories
      (`true_positive` ×6, `true_negative` ×6, `boundary` ×5, `cross_strategy`
      ×4), each with explicit per-strategy ground-truth expectations at defaults
      (`minScore=2`, `confidenceThreshold=6`).
    - `buildCalibrationContext`, `evaluateCalibrationEntry`, and
      `evaluateFullCalibrationSet` helpers that route entries through the raw
      signal evaluators without instantiating detector factories.
    - `sweepHeuristicMinScores` and `sweepStructuredThresholds` utilities used
      by the tuning guide to derive the sensitivity tables.
  - Added `packages/core/src/pollux/calibration.test.ts` (98 tests) verifying
    structure, per-strategy ground truth, cross-strategy divergence, boundary
    behavior, sweep monotonicity, determinism, and per-entry rule matches.
  - Published `docs/core/pollux/P3-05_ESCALATION_CALIBRATION_TUNING_GUIDE.md`
    covering methodology, default-threshold analysis (heuristic 10/21,
    structured 4/21, hybrid 13/21), sensitivity sweeps, the cross-strategy
    comparison matrix, five recommended threshold profiles, the heuristic rule
    weight rationale, and the operational tuning procedure.
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/pollux/calibration.test.ts`
      passes (98 tests).
    - Tuning-guide §3.3 hybrid distribution and §4.1 heuristic sweep numbers are
      pinned from the calibration utilities (rows sum to 21 by construction).

- P3-06 (Telemetry reconciliation under escalation load) delivered with a
  dedicated test suite that exercises the full advisor telemetry pipeline under
  stress and pins the role-attribution invariants required by TG-4:
  - Added `packages/core/src/pollux/telemetryReconciliation.test.ts` (25 tests)
    covering:
    - End-to-end `LlmRole.UTILITY_ADVISOR` propagation through
      `LoggingContentGenerator` into API request/response/error events.
    - `UiTelemetryService` aggregation isolation between `UTILITY_ADVISOR` and
      executor roles, including shared-model scenarios where advisor and
      executor reuse the same model id.
    - Token accounting identity: per-role counters sum to the global counter
      with no double-counting and no cross-role contamination.
    - Stress reconciliation under interleaved N=50 advisor + executor calls with
      mixed success/error outcomes.
    - Latency aggregation, clear/reset behavior, event emission semantics, and
      role attribute presence on log records.
  - Published `docs/core/pollux/P3-06_TELEMETRY_RECONCILIATION_REPORT.md`
    documenting the reconciliation surface, the 25-test coverage matrix, the
    verified invariants, the known gaps (OTel metric counters and billing events
    lack a `role` dimension — both deliberately deferred to a follow-up because
    they require additional schema work outside Phase 3 scope), and the closure
    relationship to P3-07.
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/pollux/telemetryReconciliation.test.ts`
      passes (25 tests).
    - All Pollux tests collectively (`src/pollux`) pass (232 tests across 7
      files).

- P3-07 (Wire detector into runtime advisor seam) delivered to close the Phase 3
  architectural gap exposed during senior review: P3-01..P3-03 had shipped
  working detectors, but `maybeRunPolluxAdvisorConsultation` in
  `packages/core/src/core/client.ts` invoked the advisor unconditionally on the
  `enabled` + `policy` + `budget` triple, never calling
  `detector.shouldEscalate(...)`. P3-07 makes the runtime path obey POLLUX_SPEC
  §5.1 step 2:
  - In `packages/core/src/core/client.ts`:
    - Added `summarizeRequestForDetector(request)`: a bounded helper that splits
      a `PartListUnion` into the `userContentDigest` (text and string parts) and
      `pendingToolContext` (`functionResponse` payloads), each clamped to
      `DETECTOR_MAX_FIELD_LENGTH`. Non-text/non-tool parts (binary blobs, code
      execution results, function calls, etc.) are intentionally dropped from
      the digest.
    - Added `buildPolluxDetector(strategy)`: factory selector that returns the
      heuristic, structured, or hybrid detector based on
      `experimental.pollux.strategy`, defaulting to hybrid for unknown values so
      a misconfigured strategy never silently bypasses the gate.
    - In `maybeRunPolluxAdvisorConsultation`, populated `PolluxTurnContext` with
      the request summary and inserted the detector evaluation between the cheap
      budget pre-check and the policy check. A non-escalating detector result
      short-circuits the advisor call before any policy lookup, eliminating the
      dead-code risk and matching the spec's intended "evaluate `shouldEscalate`
      first" ordering.
  - In `packages/core/src/core/client.test.ts`:
    - Added a shared `POLLUX_ESCALATION_INPUT` constant (an input that trips the
      default heuristic) and updated every Cell B/C/D and P3-04 table-driven
      test across all five in-scope surfaces (D1–D5) to use it, so the existing
      fail-open and policy-deny coverage continues to exercise the full advisor
      path now that the detector gate is live.
    - Added a P3-04 policy-denied fail-open table for all five surfaces
      asserting baseline-identical streams, no `UserCancelled` event, and
      `mockPolicyCheck` invocation with `advisor_consultation`.
    - Added a P3-07 detector-skip table for all five surfaces asserting that
      innocuous input (`'Hi'`) with Pollux enabled does NOT call the advisor and
      does NOT consult the policy engine, locking in the new gate.
  - Validation evidence:
    - `npm run test --workspace @google/gemini-cli-core -- src/core/client.test.ts`
      passes (124 tests, 1 pre-existing skip).
    - `npm run test --workspace @google/gemini-cli-core -- src/pollux` passes
      (232 tests across 7 files).
    - `npm run test --workspace @google/gemini-cli -- src/acp/acpClient.test.ts`
      passes (64 tests).
    - `npm run test --workspace @google/gemini-cli-a2a-server -- src/agent/task.test.ts`
      passes (13 tests).

## Phase 4: Benchmarking and evaluation (Weeks 6-7)

Goal: produce reproducible A-E benchmark results with valid fairness controls.

Entry criteria:

- Phase 3 exit criteria met.
- Fairness controls contract from P0-05 implemented.

Task breakdown:

| ID    | Task                                                                                  | Owner      | Deliverable                                                                      | Depends on | TG mapping |
| ----- | ------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- | ---------- | ---------- |
| P4-01 | Finalize benchmark task corpus with oracle reliability checks                         | 14         | task corpus + oracle docs                                                        | P0-05      | TG-1       |
| P4-02 | Implement benchmark harness controls (router/loop/availability/session)               | 14 + 07/10 | benchmark harness code                                                           | P4-01      | TG-1       |
| P4-03 | [Done 2026-04-18] Run smoke benchmark (small matrix) and validate reproducibility     | 14         | smoke run artifact -> docs/core/pollux/P4-03_SMOKE_BENCHMARK_REPRODUCIBILITY.md  | P4-02      | TG-1       |
| P4-04 | [Done 2026-04-18] Run full five-condition benchmark with checkpoint/resume            | 14         | full run artifacts -> docs/core/pollux/P4-04_FULL_BENCHMARK_CHECKPOINT_RESUME.md | P4-03      | TG-1       |
| P4-05 | [Done 2026-04-18] Publish token/latency/accuracy report with CIs and escalation stats | 14 + 11    | benchmark report -> docs/core/pollux/P4-05_BENCHMARK_METRICS_REPORT.md           | P4-04      | TG-1/TG-4  |
| P4-06 | Validate fairness-pin audit trail for each run                                        | 14         | fairness audit log                                                               | P4-04      | TG-1       |

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
| TG-4  | Token usage metrics match conversation totals              | 11/02    | Phase 4 exit  |
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

---

## 12) Phase 1 implementation log (task completion notes)

Short entries added after each completed Phase 1 task: what landed, with
pointers to files and to the canonical issue draft.

### P1-01 — Define types/interfaces (turn context, detector contracts, advisor contracts)

**Status:** Done (2026-04-18).

**Summary:** Introduced the core Pollux type surface under
`packages/core/src/pollux/`: runtime surfaces, detector strategy and reason
codes, `PolluxExperimentalConfig` with `DEFAULT_POLLUX_EXPERIMENTAL_CONFIG`
(`enabled` defaults false per flag-first rollout), `PolluxTurnContext`,
`PolluxDetector` / `ShouldEscalateResult`, and `PolluxAdvisor` /
`AdvisorConsultationInput` / `AdvisorConsultationResult`. Exported from
`@google/gemini-cli-core` via `packages/core/src/pollux/index.ts` and
`packages/core/src/index.ts`. Unit tests in
`packages/core/src/pollux/types.test.ts`.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-01](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-01)
- Execution board row:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  §3 (POLLUX-P1-01)
- Spec: [POLLUX_SPEC.md](POLLUX_SPEC.md) §§4–8 (component list, interceptor
  flow, detector, settings)

### P1-02 — Model registry and alias resolver contract

**Status:** Done (2026-04-18).

**Summary:** Added `packages/core/src/pollux/models.ts`: `PolluxModelRegistry`
with normalized-alias deduplication (throws `PolluxDuplicateAliasError` on
collisions), `normalizePolluxModelAlias`, and `resolvePolluxModel` with
deterministic resolution — when Pollux is **disabled**, trimmed passthrough (no
registry use); when **enabled**, registry hit → canonical; empty or unknown
short alias → `executorModel` / `advisorModel` from `PolluxExperimentalConfig`
by `PolluxModelRole`; likely concrete ids (`VALID_GEMINI_MODELS` or `gemini-` /
`auto-gemini-` prefixes) passthrough. Reuses `VALID_GEMINI_MODELS` from
`packages/core/src/config/models.ts`. Tests in
`packages/core/src/pollux/models.test.ts`. Re-exported via
`packages/core/src/pollux/index.ts`.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-02](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-02)
- Execution board:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  §3 (POLLUX-P1-02)
- Spec: [POLLUX_SPEC.md](POLLUX_SPEC.md) §4 (Pollux module list includes
  `models.ts`)
- Related report:
  [docs/repo-compartment-analysis/reports/07-routing-availability-loop-and-pollux/report.md](docs/repo-compartment-analysis/reports/07-routing-availability-loop-and-pollux/report.md)

### P1-03 — Add experimental.pollux.\* to CLI settings schema and loader

**Status:** Done (2026-04-18).

**Summary:** Added `experimental.pollux` under `SETTINGS_SCHEMA` in
`packages/cli/src/config/settingsSchema.ts` with `mergeStrategy: SHALLOW_MERGE`
for the object (scalar fields only; no array/record Pollux keys). Defaults are
sourced from `DEFAULT_POLLUX_EXPERIMENTAL_CONFIG` in `@google/gemini-cli-core`
so schema defaults match core. Regenerated `schemas/settings.schema.json` via
`npm run schema:settings` and settings reference in
`docs/reference/configuration.md` via `npm run docs:settings`. Loader is
schema-driven merged settings. Extended
`packages/cli/src/config/settingsSchema.test.ts` for Pollux keys.
`ConfigParameters` / `loadCliConfig` mapping is P1-04.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-03](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-03)
- Execution board:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  §3 (POLLUX-P1-03)
- Contract:
  [docs/core/pollux/P0-03_SETTINGS_STRATEGY.md](docs/core/pollux/P0-03_SETTINGS_STRATEGY.md)

### P1-04 — Map Pollux config into core ConfigParameters and accessors

**Status:** Done (2026-04-18).

**Summary:** Added `mergePolluxExperimentalConfig` in
`packages/core/src/pollux/types.ts` (defaults, strategy validation, finite
numbers). Extended `ConfigParameters` with optional
`pollux?: Partial<PolluxExperimentalConfig>`; `Config` stores merged
`PolluxExperimentalConfig` and exposes `getPolluxExperimentalConfig()`.
`loadCliConfig` in `packages/cli/src/config/config.ts` passes
`pollux: mergePolluxExperimentalConfig(settings.experimental?.pollux)`. TG-5
drift guard: `packages/cli/src/config/polluxConfigMapping.test.ts` asserts every
`experimental.pollux` schema key appears in merge output; core and CLI tests
cover constructor and `loadCliConfig` wiring.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-04](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-04)
- Execution board:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  §3 (POLLUX-P1-04)
- Contract:
  [docs/core/pollux/P0-03_SETTINGS_STRATEGY.md](docs/core/pollux/P0-03_SETTINGS_STRATEGY.md)
  §3

### P1-05 — Add LlmRole.UTILITY_ADVISOR and plumb through telemetry

**Status:** Done (2026-04-18).

**Summary:** Extended `LlmRole` in `packages/core/src/telemetry/llmRole.ts` with
`UTILITY_ADVISOR = 'utility_advisor'` (POLLUX_SPEC §9). No new sinks — existing
`ApiResponseEvent.role` + `UiTelemetryService` per-role aggregation already keys
off `LlmRole`. Added `uiTelemetry.test.ts` coverage that an API response tagged
with `LlmRole.UTILITY_ADVISOR` records token and request stats under that role
bucket alongside model totals.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-05](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-05)
- Execution board:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  §3 (POLLUX-P1-05)
- Spec: [POLLUX_SPEC.md](POLLUX_SPEC.md) §9 (telemetry and token accounting)
- Report:
  [docs/repo-compartment-analysis/reports/11-telemetry-observability-and-billing-signals/report.md](docs/repo-compartment-analysis/reports/11-telemetry-observability-and-billing-signals/report.md)

### P1-06 — Advisor prompt builder and parser (strict schema validation)

**Status:** Done (2026-04-18).

**Summary:** Added `packages/core/src/pollux/prompts.ts`:
`POLLUX_ADVISOR_RESPONSE_SCHEMA`, `buildAdvisorConsultationPrompt`,
`parseAdvisorModelResponse` (fail-closed on bad JSON or Ajv schema errors via
`SchemaValidator`), `stripPolluxConfidenceTags` and
`extractPolluxConfidenceTagValues` for §7.3 tag handling. Tags inside `guidance`
are stripped after validation. Tests in
`packages/core/src/pollux/prompts.test.ts`. Exported from `pollux/index.js`.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-06](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-06)
- Execution board:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  §3 (POLLUX-P1-06)
- Spec: [POLLUX_SPEC.md](POLLUX_SPEC.md) §§6–7

### P1-07 — Fail-open defaults and max-call budget configs

**Status:** Done (2026-04-17).

**Summary:** Added `advisorRequestTimeoutMs` (default 120s, merge clamp ≥ 1000
ms) to `PolluxExperimentalConfig` and `experimental.pollux` in settings schema.
Introduced `packages/core/src/pollux/safeguards.ts`:
`checkAdvisorInvocationBudget` (disabled → `CONFIG_DISABLED`; turn/session caps
→ `BUDGET_EXHAUSTED`), `resolveAdvisorPathFailure` (fail-open for
parse/timeout/empty), `getAdvisorRequestTimeoutMs`. Tests: `safeguards.test.ts`,
extended `types.test.ts` and `settingsSchema.test.ts`. Exported from
`pollux/index.js`.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-07](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-07)
- Execution board:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  §3 (POLLUX-P1-07)
- Spec: [POLLUX_SPEC.md](POLLUX_SPEC.md) §5.2, §8.2

### P1-08 — Packaged default ALLOW rule for advisor_consultation

**Status:** Done (2026-04-17).

**Summary:** Added the packaged Pollux advisor allow rule behind
`pollux.enabled` in policy config, so `advisor_consultation` now resolves to
ALLOW in non-interactive paths when Pollux is enabled. Threaded
`experimental.pollux` through the CLI policy-settings bridge, extended the core
policy-settings contract, and added tests covering both the enabled and disabled
cases.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-08](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-08)
- Execution board row:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  §3 (POLLUX-P1-08)
- Policy config:
  [packages/core/src/policy/config.ts](packages/core/src/policy/config.ts)
- CLI bridge:
  [packages/cli/src/config/policy.ts](packages/cli/src/config/policy.ts)
- Tests:
  [packages/core/src/policy/config.test.ts](packages/core/src/policy/config.test.ts)
  and
  [packages/cli/src/config/policy-engine.integration.test.ts](packages/cli/src/config/policy-engine.integration.test.ts)

### P1-09 - Wire schema:settings --check as required PR CI job

**Status:** Done (2026-04-17).

**Summary:** Added required CI validation for settings schema artifacts by
wiring `npm run schema:settings -- --check` into the `lint` job in
`.github/workflows/ci.yml` (CG-02 / D-02). This complements the existing docs
settings check and closes the Phase 1 schema-drift guard task.

**References:**

- Issue draft:
  [docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-09](docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-09)
- Execution board row:
  [docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md](docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md)
  section 3 (POLLUX-P1-09)
- CI workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml)
