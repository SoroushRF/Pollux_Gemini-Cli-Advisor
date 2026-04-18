# P0-08 Phase 1 Execution Board (Task Issue List and Owners)

Version: 1.0 Date: 2026-04-17 Status: Draft for Phase 0 task closure Purpose:
Phase 0 deliverable for P0-08 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This execution board provides the tracked issue set for all Phase 1 tasks.

It covers:

1. Stable issue IDs for P1-01 through P1-09.
2. Owner assignment for each Phase 1 task.
3. TG mapping, dependency chain, and execution status.

This board is the control record for Phase 1 readiness planning.

---

## 2) Issue ID policy

1. Board issue IDs are the canonical tracker IDs for Phase 1 execution.
2. Every Phase 1 task must have one unique board issue ID and owner.
3. External issue/PR references can be linked as they are opened.
4. A task may move from not_started only after dependency and TG scope are
   confirmed.

Issue ID namespace:

1. POLLUX-P1-01 through POLLUX-P1-09.

---

## 3) Phase 1 tracked issue set

| Board issue ID | Plan task ID | Task summary                                                                  | Owner   | TG mapping | Depends on  | Status      | External issue/PR                                | Notes                                                        |
| -------------- | ------------ | ----------------------------------------------------------------------------- | ------- | ---------- | ----------- | ----------- | ------------------------------------------------ | ------------------------------------------------------------ |
| POLLUX-P1-01   | P1-01        | Define types/interfaces (turn context, detector contracts, advisor contracts) | 02      | TG-6       | P0-08       | done        | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-01 | Done; see IMPLEMENTATION_PLAN.md section 12 (P1-01)          |
| POLLUX-P1-02   | P1-02        | Implement model registry and alias resolver contract                          | 07 + 02 | TG-6       | P1-01       | done        | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-02 | Done; see IMPLEMENTATION_PLAN.md section 12 (P1-02)          |
| POLLUX-P1-03   | P1-03        | Add experimental.pollux.\* to CLI settings schema and loader                  | 06      | TG-5       | P0-03       | done        | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-03 | Done; see IMPLEMENTATION_PLAN.md section 12 (P1-03)          |
| POLLUX-P1-04   | P1-04        | Map config into core ConfigParameters and accessors                           | 06 + 02 | TG-5       | P1-03       | done        | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-04 | Done; see IMPLEMENTATION_PLAN.md section 12 (P1-04)          |
| POLLUX-P1-05   | P1-05        | Add LlmRole.UTILITY_ADVISOR telemetry role plumb                              | 11 + 02 | TG-4       | P1-01       | done        | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-05 | Done; see IMPLEMENTATION_PLAN.md section 12 (P1-05)          |
| POLLUX-P1-06   | P1-06        | Implement advisor prompt builder/parser with strict schema validation         | 02      | TG-6       | P1-01       | done        | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-06 | Done; see IMPLEMENTATION_PLAN.md section 12 (P1-06)          |
| POLLUX-P1-07   | P1-07        | Add fail-open defaults and max-call budget configs                            | 02 + 09 | TG-3/TG-6  | P1-04/P1-06 | done        | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-07 | Done; see IMPLEMENTATION_PLAN.md section 12 (P1-07)          |
| POLLUX-P1-08   | P1-08        | Land packaged default ALLOW rule for advisor_consultation (closes D-01)       | 09 + 16 | TG-3/TG-8  | P0-02       | done        | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-08 | G2 carry-over closed; see IMPLEMENTATION_PLAN.md §12 (P1-08) |
| POLLUX-P1-09   | P1-09        | Wire `schema:settings --check` as required PR CI job (closes D-02, CG-02)     | 06 + 15 | TG-5       | P1-03/P1-04 | not_started | Draft: P0-08_PHASE1_ISSUE_DRAFTS.md#POLLUX-P1-09 | G3 implementation carry-over; closes D-02                    |

Draft-to-tracker promotion rule: as each GitHub Issue (or equivalent tracker
ticket) is opened, replace the `Draft: ...` pointer in the External column with
the real issue URL. Until that happens, the draft file is the canonical source
for the issue body.

---

## 4) Execution rules

1. Owner listed above is accountable for progress and evidence updates.
2. Any owner change must be recorded in this board.
3. Status values: not_started, in_progress, blocked, done.
4. TG evidence must be linked before status can move to done.
5. Blockers must include a one-line unblock condition in Notes.

---

## 4a) Phase 0 compartment signoff register

IMPLEMENTATION_PLAN.md section 5 Phase 0 exit criteria requires signoff from
compartments 01, 02, 06, 09, 14, 16. Two signoff classes are tracked:

- **Automated pre-review**: evidence-based verification by the automated SWE
  that the Phase 0 artifact is internally consistent and cross-references the
  source reports correctly. This is an advisory pre-check, not a
  merge-authorizing signoff.
- **Human countersign**: explicit approval by the compartment owner (named
  reviewer or PR-review approval). This is the merge-authorizing signoff
  required by the plan.

Rule: Phase 1 tasks may not move from `not_started` in section 3 until **both**
the automated pre-review and the human countersign rows are filled for every
gating compartment.

### Automated pre-review (advisory)

| Compartment                            | Signoff on                          | Pre-reviewer           | Date       |
| -------------------------------------- | ----------------------------------- | ---------------------- | ---------- |
| 01 CLI runtime surface                 | P0-01 matrix, seam S2               | automated-swe (cursor) | 2026-04-17 |
| 02 Core turn engine                    | P0-01 seam S1, P0-02 touchpoints    | automated-swe (cursor) | 2026-04-17 |
| 06 Settings schema and config plumbing | P0-03 strategy, P0-04 CG-02         | automated-swe (cursor) | 2026-04-17 |
| 09 Policy, trust, and safety engine    | P0-02 policy channel lock           | automated-swe (cursor) | 2026-04-17 |
| 14 Testing and evaluation architecture | P0-05 fairness harness contract     | automated-swe (cursor) | 2026-04-17 |
| 16 Docs, specs, and governance         | P0-06 governance, P0-07 PR template | automated-swe (cursor) | 2026-04-17 |

Pre-review evidence summary:

1. **01 CLI runtime surface**: P0-01 §2 rows D1/D2 cite driver paths
   (`useGeminiStream`, `runNonInteractive`) that are verifiable in report 01
   `cli-runtime-surface/report.md` and in source under
   `packages/cli/src/ui/hooks/` and `packages/cli/src/nonInteractiveCli.ts`.
2. **02 Core turn engine**: P0-01 §3 seam S1 cites
   `packages/core/src/core/client.ts` and `turn.ts`, consistent with plan §4 D7
   GeminiChat access constraint. P0-02 §5 touchpoints list real policy,
   scheduler, and confirmation-bus paths.
3. **06 Settings schema and config plumbing**: P0-03 §2 mapping contract
   (SETTINGS_SCHEMA → loadSettings → loadCliConfig → ConfigParameters → Config)
   matches report 06 Appendix B recipe. P0-04 §2.2 correctly flags
   `schema:settings` as a current gap tracked as CG-02 and ledger D-02.
4. **09 Policy, trust, and safety engine**: P0-02 §2 policy contract preserves
   allow/deny/ask_user decision set (no new types introduced); §2.4 ACP
   requestPermission-safe behavior aligns with SR-5 and NA-3 in SYNTHESIS
   report.
5. **14 Testing and evaluation architecture**: P0-05 §2 fairness pins
   FP-01..FP-06 match SR-3 and NA-2 in SYNTHESIS report. §3 harness contract
   scopes to `packages/test-utils/src/benchmark-harness.ts` as planned location,
   consistent with report 14 §3 C-14.1.
6. **16 Docs, specs, and governance**: CODEOWNERS lines 19-23 cover
   `POLLUX_*.md`, `IMPLEMENTATION_PLAN.md`, `docs/repo-compartment-analysis/`,
   `docs/core/pollux/`. PR template TG-1..TG-10 table matches plan section 6
   after TG-4 label normalization.

Automated pre-review scope and limits:

1. The automated pre-review verifies cross-reference integrity, seam path
   plausibility against report content, and internal consistency between
   IMPLEMENTATION_PLAN.md, POLLUX_SPEC.md, the P0-XX artifacts, CODEOWNERS, PR
   template, and POLLUX_DOC_CORRECTIONS.md.
2. The automated pre-review does NOT substitute for compartment-owner
   accountability, runtime verification, or code-level seam validation.
3. If a human countersign contradicts an automated pre-review, the human
   countersign wins and this register must be updated accordingly.

### Human countersign (merge-authorizing)

| Compartment                            | Signoff on                          | Countersigner | Date | Gates Phase 1 task |
| -------------------------------------- | ----------------------------------- | ------------- | ---- | ------------------ |
| 01 CLI runtime surface                 | P0-01 matrix, seam S2               | REQUIRED      | TBD  | P1-01              |
| 02 Core turn engine                    | P0-01 seam S1, P0-02 touchpoints    | REQUIRED      | TBD  | P1-01              |
| 06 Settings schema and config plumbing | P0-03 strategy, P0-04 CG-02         | REQUIRED      | TBD  | P1-03 / P1-09      |
| 09 Policy, trust, and safety engine    | P0-02 policy channel lock           | REQUIRED      | TBD  | P1-07 / P1-08      |
| 14 Testing and evaluation architecture | P0-05 fairness harness contract     | REQUIRED      | TBD  | P4-02              |
| 16 Docs, specs, and governance         | P0-06 governance, P0-07 PR template | REQUIRED      | TBD  | P1-01              |

Countersign format: GitHub handle or PR-review URL plus date. Replace `REQUIRED`
with the real signer and `TBD` with the date when recorded.

---

## 5) P0-08 acceptance checklist

P0-08 is complete when:

1. All Phase 1 tasks P1-01..P1-09 have issue IDs.
2. All Phase 1 tasks have owners assigned.
3. Dependency and TG mapping are captured in the board.
4. The board is linked from IMPLEMENTATION_PLAN.md P0-08 row.

---

## 6) Implementation record

Files changed by this task:

1. docs/core/pollux/P0-08_PHASE1_EXECUTION_BOARD.md
2. docs/repo-compartment-analysis/P0-08_PHASE1_EXECUTION_BOARD.md
3. IMPLEMENTATION_PLAN.md

---

## 7) References

1. IMPLEMENTATION_PLAN.md (P0-08 task, Phase 1 task table, and Phase 0 exit
   criteria).
2. IMPLEMENTATION_PLAN.md section 6 (TG-1 through TG-10).
3. POLLUX_SPEC.md section 14 (documentation and governance contract).
4. docs/repo-compartment-analysis/reports/16-docs-specs-and-governance/report.md
   (ownership and review-routing context).
