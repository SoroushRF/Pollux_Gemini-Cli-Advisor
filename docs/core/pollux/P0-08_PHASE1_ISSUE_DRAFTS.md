# P0-08 Phase 1 Issue Drafts

Version: 1.0 Date: 2026-04-17 Status: Canonical draft source until real tracker
issues are opened. Purpose: Provide copy-paste-ready issue bodies for each Phase
1 board row in P0-08_PHASE1_EXECUTION_BOARD.md.

---

## 1) Usage

1. When opening the real tracker issue (GitHub Issues or equivalent), copy the
   title and body from the matching section below.
2. After the tracker issue is opened, replace the `Draft: ...` pointer in the
   External issue/PR column of P0-08_PHASE1_EXECUTION_BOARD.md §3 with the real
   issue URL.
3. Any scope or owner change agreed in the tracker must be back-propagated here
   and to the execution board. This file and the board must not disagree.

---

## 2) Draft issues

### POLLUX-P1-01

Title: [POLLUX-P1-01] Define Pollux types and interfaces (turn context, detector
contracts, advisor contracts)

Labels: pollux, phase-1, tg-6, compartment-02

Body:

```
## Summary
Define the core Pollux type surface used by the detector and advisor paths:
turn context, detector contracts, and advisor contracts.

## Plan task ID
P1-01 (IMPLEMENTATION_PLAN.md Phase 1 task breakdown)

## Owners
02 (primary)

## Dependencies
- P0-08 (this board must be open and issue IDs in use)

## TG mapping
- TG-6 Pollux-specific integration tests exist and are green.

## Deliverables
- packages/core/src/pollux/types.ts
- Unit tests exercising the type surface against fixture inputs.

## Acceptance criteria
- Types compile cleanly and export a single canonical surface.
- No runtime behavior changes are introduced.
- Feature flag defaults match IMPLEMENTATION_PLAN.md Phase 1 entry criteria.

## References
- docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md (seam S1).
- POLLUX_SPEC.md sections 4, 5, 7.
```

---

### POLLUX-P1-02

Title: [POLLUX-P1-02] Implement model registry and alias resolver contract

Labels: pollux, phase-1, tg-6, compartment-07, compartment-02

Body:

```
## Summary
Implement a model registry and alias resolver so Pollux can reference
executor and advisor models by stable alias, not hard-coded IDs.

## Plan task ID
P1-02

## Owners
07 (primary), 02 (support)

## Dependencies
- P1-01 (types)

## TG mapping
- TG-6 Pollux integration tests exist.

## Deliverables
- packages/core/src/pollux/models.ts
- Validation tests for alias resolution and collisions.

## Acceptance criteria
- Registry rejects duplicate aliases.
- Resolver falls back deterministically when an alias is absent.
- No behavior change when Pollux is disabled.

## References
- docs/repo-compartment-analysis/reports/07-routing-availability-loop-and-pollux/report.md
```

---

### POLLUX-P1-03

Title: [POLLUX-P1-03] Add experimental.pollux.\* to CLI settings schema and
loader

Labels: pollux, phase-1, tg-5, compartment-06

Body:

```
## Summary
Introduce the experimental.pollux.* settings block in the CLI schema and
loader per P0-03 mapping contract. No runtime behavior change.

## Plan task ID
P1-03

## Owners
06

## Dependencies
- P0-03 (settings strategy contract)

## TG mapping
- TG-5 Schema-to-ConfigParameters mapping invariant test.

## Deliverables
- SETTINGS_SCHEMA update (experimental.pollux.*).
- schemas/settings.schema.json regenerated via npm run schema:settings.
- Settings docs regenerated via npm run docs:settings.

## Acceptance criteria
- Precedence argv > env > settings > defaults is preserved for Pollux keys.
- Array/record fields declare explicit mergeStrategy.
- Docs output aligns with schema (no drift).

## References
- docs/core/pollux/P0-03_SETTINGS_STRATEGY.md §2-§5.
- docs/repo-compartment-analysis/reports/06-settings-schema-and-config-plumbing/report.md
  Appendix B recipe.
```

---

### POLLUX-P1-04

Title: [POLLUX-P1-04] Map Pollux config into core ConfigParameters and accessors

Labels: pollux, phase-1, tg-5, compartment-06, compartment-02

Body:

```
## Summary
Extend ConfigParameters with the Pollux fields and wire them through
loadCliConfig. Core remains a pure consumer of resolved values.

## Plan task ID
P1-04

## Owners
06 (primary), 02 (support)

## Dependencies
- P1-03 (schema + loader).

## TG mapping
- TG-5 Schema-to-ConfigParameters mapping invariant.

## Deliverables
- ConfigParameters extension.
- loadCliConfig mapping for every Pollux field.
- Invariant test asserting every schema field maps to a ConfigParameters
  field.

## Acceptance criteria
- No required Pollux field is missing from loadCliConfig mapping.
- Config does not read settings files directly.
- Mapping test fails loudly on drift.

## References
- docs/core/pollux/P0-03_SETTINGS_STRATEGY.md §3.
```

---

### POLLUX-P1-05

Title: [POLLUX-P1-05] Add LlmRole.UTILITY_ADVISOR and plumb through existing
telemetry path

Labels: pollux, phase-1, tg-4, compartment-11, compartment-02

Body:

```
## Summary
Add a new role value for advisor calls and plumb it through the existing
telemetry / token-accounting pipeline. Do not introduce a parallel sink.

## Plan task ID
P1-05

## Owners
11 (primary), 02 (support)

## Dependencies
- P1-01 (types).

## TG mapping
- TG-4 Token usage metrics match conversation totals.

## Deliverables
- LlmRole enum extension.
- Telemetry wiring tests.

## Acceptance criteria
- Role-tagged token usage flows through the existing sink only.
- Conversation totals still reconcile with per-role sums.

## References
- POLLUX_SPEC.md section 9.
- docs/repo-compartment-analysis/reports/11-telemetry-observability-and-billing-signals/report.md
```

---

### POLLUX-P1-06

Title: [POLLUX-P1-06] Implement advisor prompt builder and parser with strict
schema validation

Labels: pollux, phase-1, tg-6, compartment-02

Body:

```
## Summary
Build the advisor prompt and parser with strict schema validation so
advisor output cannot leak unstructured text into the executor path.

## Plan task ID
P1-06

## Owners
02

## Dependencies
- P1-01 (types).

## TG mapping
- TG-6 Pollux integration tests.

## Deliverables
- Prompt builder.
- Structured parser with schema validation.
- Unit tests for malformed/edge-case input.

## Acceptance criteria
- Parser fails closed on malformed input.
- Confidence tags are stripped before downstream use.
- No parser state leaks across turns.

## References
- POLLUX_SPEC.md section 7.
```

---

### POLLUX-P1-07

Title: [POLLUX-P1-07] Add fail-open defaults and max-call budget configs

Labels: pollux, phase-1, tg-3, tg-6, compartment-02, compartment-09

Body:

```
## Summary
Define fail-open defaults for advisor failures and a max-call budget to
bound cost under pathological loops.

## Plan task ID
P1-07

## Owners
02 (primary), 09 (support)

## Dependencies
- P1-04 (config plumbing), P1-06 (parser).

## TG mapping
- TG-3 Advisor policy path avoids double prompt.
- TG-6 Pollux integration tests.

## Deliverables
- Config defaults.
- Budget safeguards.
- Tests covering timeout, malformed response, and budget exhaustion paths.

## Acceptance criteria
- Advisor failure falls open to executor path observably.
- Max-call budget is enforced per turn and per session.
- No silent DENY under non-interactive mode.

## References
- docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md §2.3.
```

---

### POLLUX-P1-08

Title: [POLLUX-P1-08] Land packaged default ALLOW rule for advisor_consultation
(closes ledger D-01)

Labels: pollux, phase-1, tg-3, tg-8, compartment-09, compartment-16

Body:

```
## Summary
Ship the packaged built-in default policy rule that auto-allows
advisor_consultation when pollux.enabled is true, so non-interactive
headless and ACP modes do not silently deny the advisor path.

## Plan task ID
P1-08 (closes POLLUX_DOC_CORRECTIONS.md D-01; implements G2 carry-over)

## Owners
09 (primary), 16 (support)

## Dependencies
- P0-02 (policy channel lock contract).

## TG mapping
- TG-3 Advisor policy path avoids double prompt.
- TG-8 ACP advisor flow regression test.

## Deliverables
- Packaged default rule in the built-in policy scope.
- AT-01..AT-05 acceptance tests from P0-02 §4.

## Acceptance criteria
- AT-01 packaged rule activation passes (allow under pollux.enabled=true,
  no unintended allow when disabled).
- AT-02 non-interactive advisor allow path passes.
- AT-03 ACP permission behavior passes (no redundant requestPermission).
- AT-04 no double-prompt passes.
- AT-05 policy decision type invariants pass (allow/deny/ask_user only).
- Rule source is traceable to built-in default scope (not extension).

## References
- docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md.
- POLLUX_DOC_CORRECTIONS.md D-01.
```

---

### POLLUX-P1-09

Title: [POLLUX-P1-09] Wire schema:settings --check as a required PR CI job
(closes ledger D-02, CG-02)

Labels: pollux, phase-1, tg-5, compartment-06, compartment-15, ci

Body:

```
## Summary
Add `npm run schema:settings -- --check` as a required status check on all
PRs so schema artifacts cannot drift from the source schema.

## Plan task ID
P1-09 (closes POLLUX_DOC_CORRECTIONS.md D-02; implements G3 CI-gate
carry-over; satisfies CG-02 in P0-04)

## Owners
06 (primary), 15 (support)

## Dependencies
- P1-03 (schema introduced), P1-04 (mapping implemented).

## TG mapping
- TG-5 Schema-to-ConfigParameters mapping invariant test.

## Deliverables
- Workflow update that runs the schema check on PRs.
- Required status check entry added to branch protection request
  (documented; branch-protection edits land via maintainer action).
- Drift test proving the CI job fails when schema artifacts are stale.

## Acceptance criteria
- CI fails on a PR that edits SETTINGS_SCHEMA without regenerating
  schemas/settings.schema.json.
- Workflow runs on all PRs touching CLI settings paths (at minimum).
- Existing PR CI aggregate still green.

## References
- docs/core/pollux/P0-04_CI_GATES_BRANCH_PROTECTIONS.md §3 CG-02.
- POLLUX_DOC_CORRECTIONS.md D-02.
- IMPLEMENTATION_PLAN.md section 7 required CI updates.
```

---

## 3) Promotion tracker

When a draft is promoted to a real tracker issue, record the promotion here and
in the execution board.

| Draft ID     | Promoted to URL | Promoted on | Notes |
| ------------ | --------------- | ----------- | ----- |
| POLLUX-P1-01 | pending         | -           | -     |
| POLLUX-P1-02 | pending         | -           | -     |
| POLLUX-P1-03 | pending         | -           | -     |
| POLLUX-P1-04 | pending         | -           | -     |
| POLLUX-P1-05 | pending         | -           | -     |
| POLLUX-P1-06 | pending         | -           | -     |
| POLLUX-P1-07 | pending         | -           | -     |
| POLLUX-P1-08 | pending         | -           | -     |
| POLLUX-P1-09 | pending         | -           | -     |
