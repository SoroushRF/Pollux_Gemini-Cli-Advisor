# P0-08 Phase 1 Execution Board (Task Issue List and Owners)

Version: 1.0 Date: 2026-04-17 Status: Draft for Phase 0 task closure Purpose:
Phase 0 deliverable for P0-08 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This execution board provides the tracked issue set for all Phase 1 tasks.

It covers:

1. Stable issue IDs for P1-01 through P1-07.
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

1. POLLUX-P1-01 through POLLUX-P1-07.

---

## 3) Phase 1 tracked issue set

| Board issue ID | Plan task ID | Task summary                                                                  | Owner   | TG mapping | Depends on  | Status      | External issue/PR | Notes                                |
| -------------- | ------------ | ----------------------------------------------------------------------------- | ------- | ---------- | ----------- | ----------- | ----------------- | ------------------------------------ |
| POLLUX-P1-01   | P1-01        | Define types/interfaces (turn context, detector contracts, advisor contracts) | 02      | TG-6       | P0-08       | not_started | TBD               | Phase 1 entry task                   |
| POLLUX-P1-02   | P1-02        | Implement model registry and alias resolver contract                          | 07 + 02 | TG-6       | P1-01       | not_started | TBD               | Follows type contracts               |
| POLLUX-P1-03   | P1-03        | Add experimental.pollux.\* to CLI settings schema and loader                  | 06      | TG-5       | P0-03       | not_started | TBD               | Settings pipeline lock-in            |
| POLLUX-P1-04   | P1-04        | Map config into core ConfigParameters and accessors                           | 06 + 02 | TG-5       | P1-03       | not_started | TBD               | Requires schema/loader output        |
| POLLUX-P1-05   | P1-05        | Add LlmRole.UTILITY_ADVISOR telemetry role plumb                              | 11 + 02 | TG-4       | P1-01       | not_started | TBD               | Reuse existing token accounting path |
| POLLUX-P1-06   | P1-06        | Implement advisor prompt builder/parser with strict schema validation         | 02      | TG-6       | P1-01       | not_started | TBD               | Parser contracts gated by tests      |
| POLLUX-P1-07   | P1-07        | Add fail-open defaults and max-call budget configs                            | 02 + 09 | TG-3/TG-6  | P1-04/P1-06 | not_started | TBD               | Depends on config + parser           |

---

## 4) Execution rules

1. Owner listed above is accountable for progress and evidence updates.
2. Any owner change must be recorded in this board.
3. Status values: not_started, in_progress, blocked, done.
4. TG evidence must be linked before status can move to done.
5. Blockers must include a one-line unblock condition in Notes.

---

## 5) P0-08 acceptance checklist

P0-08 is complete when:

1. All Phase 1 tasks P1-01..P1-07 have issue IDs.
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
