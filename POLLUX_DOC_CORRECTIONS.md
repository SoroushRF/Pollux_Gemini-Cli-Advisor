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

| ID   | Area          | Issue                                                       | Required correction                                       | Owner | Status | Verification                 |
| ---- | ------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ----- | ------ | ---------------------------- |
| C-01 | Runtime seams | Single-seam assumptions were unsafe                         | Keep per-surface interceptor matrix in spec and plan      | 02    | Done   | POLLUX_SPEC.md Appendix A    |
| C-02 | Policy        | advisor_consultation could default-deny in headless mode    | Require packaged default ALLOW rule and ACP-safe behavior | 09    | Open   | Policy tests + ACP tests     |
| C-03 | Telemetry     | New token sink proposal would duplicate existing accounting | Keep role-based extension of existing sink only           | 11    | Done   | POLLUX_SPEC.md section 9     |
| C-04 | Benchmarking  | Baselines could include hidden utility call noise           | Enforce fairness pins and invalid-run rules               | 14    | Done   | POLLUX_SPEC.md section 10    |
| C-05 | Settings      | Silent mapping drift between schema and core config         | Keep experimental.pollux path + schema/config CI checks   | 06    | Open   | schema and invariant tests   |
| C-06 | Commands      | /pollux could be available only on one command surface      | Require multi-surface registration contract               | 05    | Open   | command parity tests         |
| C-07 | Governance    | Spec/plan drift risk due weak ownership controls            | Keep versioned plan/spec and correction ledger workflow   | 16    | Open   | CODEOWNERS and review policy |

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

| Item | Description                                     | Owner    | Due phase |
| ---- | ----------------------------------------------- | -------- | --------- |
| D-01 | Packaged advisor ALLOW rule implementation note | 09       | Phase 0   |
| D-02 | schema:settings CI guard update                 | 06/15    | Phase 0   |
| D-03 | Pollux command registration map and tests       | 05/12/13 | Phase 5   |
| D-04 | Pollux doc ownership updates                    | 16/15    | Phase 0   |
| D-05 | A2A deferred-scope documentation note           | 13/16    | Phase 0   |

---

## 5) Change log

## 2026-04-17

1. Added initial correction ledger.
2. Recorded critical correction set C-01 through C-07.
3. Recorded medium correction set M-01 through M-04.
4. Added open deliverables for governance and CI closure.
