# Pollux Doc Corrections Ledger

Version: 1.0 Date: 2026-04-17 Status: Active Purpose: Track all required
spec/plan/doc corrections that must stay aligned with implementation.

---

## 1) Usage contract

This file is the governance ledger for Pollux documentation correctness.

Rules:

1. Every correction item must map to an implementation change or an explicit
   non-goal decision.
2. An item cannot move to Done without verification evidence.
3. If code behavior changes and invalidates a doc claim, add a new item
   immediately.

---

## 2) Critical corrections

| ID   | Area          | Issue                                                       | Required correction                                       | Owner | Status | Verification                |
| ---- | ------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ----- | ------ | --------------------------- |
| C-01 | Runtime seams | Single-seam assumptions were unsafe                         | Keep per-surface interceptor matrix in spec and plan      | 02    | Done   | POLLUX_SPEC.md Appendix A   |
| C-02 | Policy        | advisor_consultation could default-deny in headless mode    | Require packaged default ALLOW rule and ACP-safe behavior | 09    | Open   | Policy tests + ACP tests    |
| C-03 | Telemetry     | New token sink proposal would duplicate existing accounting | Keep role-based extension of existing sink only           | 11    | Done   | POLLUX_SPEC.md section 9    |
| C-04 | Benchmarking  | Baselines could include hidden utility call noise           | Enforce fairness pins and invalid-run rules               | 14    | Done   | POLLUX_SPEC.md section 10   |
| C-05 | Settings      | Silent mapping drift between schema and core config         | Keep experimental.pollux path + schema/config CI checks   | 06    | Open   | schema and invariant tests  |
| C-06 | Commands      | /pollux could be available only on one command surface      | Require multi-surface registration contract               | 05    | Open   | command parity tests        |
| C-07 | Governance    | Spec/plan drift risk due weak ownership controls            | Keep versioned plan/spec and correction ledger workflow   | 16    | Done   | CODEOWNERS + ledger process |

---

## 3) Medium corrections

| ID   | Area                | Issue                                       | Required correction                            | Owner | Status | Verification                      |
| ---- | ------------------- | ------------------------------------------- | ---------------------------------------------- | ----- | ------ | --------------------------------- |
| M-01 | A2A                 | Phase 1 coverage ambiguity                  | Keep explicit deferred scope with bypass tests | 13    | Done   | POLLUX_SPEC.md section 3          |
| M-02 | GeminiChat guidance | Absolute prohibition language was too broad | Keep no-external-mutation contract wording     | 02    | Done   | plan decision D7 + spec section 4 |
| M-03 | Stream protocol     | Unnecessary event taxonomy expansion risk   | Reuse existing tool_use/tool_result first      | 12    | Done   | POLLUX_SPEC.md section 11         |
| M-04 | Release safety      | Pollux regressions could miss PR path       | Require Pollux-scoped binary/perf workflows    | 15    | Open   | CI workflow checks                |

---

## 4) Open deliverables

| Item | Description                                               | Owner    | Due phase |
| ---- | --------------------------------------------------------- | -------- | --------- |
| D-01 | Packaged advisor ALLOW rule implementation (P1-08)        | 09       | Phase 1   |
| D-02 | schema:settings CI guard wired as required PR job (P1-09) | 06/15    | Phase 1   |
| D-03 | Pollux command registration map and tests                 | 05/12/13 | Phase 5   |

Note: D-01 and D-02 were originally scoped as Phase 0 deliverables but are
implementation items. Phase 0 contract lock (G2, G3) is achieved by the
corresponding P0-02 and P0-03 control artifacts; the runtime/CI landings are
carried into Phase 1 per IMPLEMENTATION_PLAN.md section 3 "Implementation
carry-over".

## 4a) Completed deliverables

| Item | Description                           | Owner | Closed     | Verification                                                                           |
| ---- | ------------------------------------- | ----- | ---------- | -------------------------------------------------------------------------------------- |
| D-05 | A2A deferred-scope documentation note | 13/16 | 2026-04-17 | docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md §2 row D6 + BP-06 deferred bypass. |

---

## 5) Correction ledger operating process (P0-06)

This process is mandatory for any PR that touches Pollux runtime or governance
surfaces.

1. Intake:
   - If a PR changes Pollux behavior or invalidates a documented claim, add or
     update one ledger item before merge.
2. Ownership:
   - The PR author assigns the item owner to the compartment owner defined in
     IMPLEMENTATION_PLAN.md.
3. Evidence:
   - Each status change to Done must include verification evidence
     (test/report/artifact reference).
4. Review path:
   - POLLUX\_\*.md, IMPLEMENTATION_PLAN.md, and
     docs/repo-compartment-analysis/\*\* changes require CODEOWNERS review.
5. Closure rule:
   - A correction item may be closed only when both documentation text and
     implementation evidence align.
6. Drift response:
   - If post-merge drift is found, reopen the correction item immediately and
     link the follow-up PR.

---

## 6) Change log

## 2026-04-17

1. Added initial correction ledger.
2. Recorded critical correction set C-01 through C-07.
3. Recorded medium correction set M-01 through M-04.
4. Added open deliverables for governance and CI closure.
5. Closed C-07 after landing explicit CODEOWNERS coverage for Pollux governance
   docs.
6. Added mandatory correction-ledger operating process for Pollux PRs.
7. Closed D-05 after landing A2A deferred-scope documentation in
   docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md §2 (row D6) and BP-06.
8. Re-scoped D-01 and D-02 Due phase from Phase 0 to Phase 1 to match the Phase
   0 contract-lock scope of G2 and G3 in IMPLEMENTATION_PLAN.md.
9. Pinned D-01 to Phase 1 task P1-08 and D-02 to Phase 1 task P1-09 in
   IMPLEMENTATION_PLAN.md and docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md.
   Added copy-paste-ready issue bodies for P1-01..P1-09 under
   docs/core/pollux/P0-08_PHASE1_ISSUE_DRAFTS.md. Filed automated pre-review
   signoff for compartments 01/02/06/09/14/16; human countersign still required
   before any Phase 1 task may move from not_started.
