# Cross-Compartment Synthesis Recipe

The capstone activity after >= 12 of 16 compartment reports are `done`. The
output is `reports/SYNTHESIS.report.md` plus `reports/SYNTHESIS.report.json`.

The synthesis does **not** repeat compartment content. It composes.

---

## Inputs

- Every `reports/NN-<slug>.report.md`
- Every `reports/NN-<slug>.report.json`
- `INDEX.md`
- `GLOSSARY.md`

## Non-goals

- Do not re-verify compartment claims. Trust their citations unless a
  contradiction surfaces across compartments.
- Do not propose code changes in the synthesis. Findings only.

## Workflow

### Step 1 — Load all sidecars

Parse every `reports/NN-*.report.json`. Concatenate their `evidence`,
`contradictions`, `risks`, and `handoffs` arrays into four global lists tagged
with compartment number.

### Step 2 — Build the integration map

Produce a diagram (Mermaid or ASCII) showing:

- compartments as nodes,
- declared `dependsOn` / `affects` edges from each sidecar,
- any edges that are asserted in one direction but not the reverse (these are
  integration ambiguities).

### Step 3 — Cross-check contradictions

For each contradiction in any compartment sidecar, check whether evidence in
another compartment's sidecar resolves or deepens it. Move resolved items to
"Resolved by synthesis".

### Step 4 — Identify systemic risks

A systemic risk is one that appears (by similar description) in 3+ compartments.
Surface these explicitly.

### Step 5 — Pollux integration readiness table

Answer for each of the Pollux touchpoints in `IMPLEMENTATION_PLAN.md`:

| Pollux requirement           | Target compartment | Status | Blocking issues |
| ---------------------------- | ------------------ | ------ | --------------- |
| Interceptor in `processTurn` | 02                 | ...    | ...             |
| Advisor as synthetic tool    | 04                 | ...    | ...             |
| Escalation detectors         | 07                 | ...    | ...             |
| Token logging extension      | 02, 11             | ...    | ...             |
| Benchmark harness            | 14                 | ...    | ...             |
| Settings schema block        | 06                 | ...    | ...             |

Each row must cite at least one compartment report.

### Step 6 — Upstream drift register

List every `stale_path` from any compartment sidecar. Group by directory. This
is the maintenance debt after the last upstream merge.

### Step 7 — Test gap register

Aggregate every "no test coverage" note from all compartments. Rank by severity
of the uncovered behavior.

### Step 8 — Open question triage

Aggregate `openQuestions` from all sidecars. Cluster by theme. Propose owners
(by compartment number) and a resolution path.

### Step 9 — Produce the synthesis artifacts

Write:

- `reports/SYNTHESIS.report.md` with the sections below.
- `reports/SYNTHESIS.report.json` mirroring the structured data.

Update `INDEX.md` synthesis rows to `done`.

---

## SYNTHESIS report structure

```
1. Executive summary (<= 1 page)
2. Integration map (diagram + narrative)
3. Cross-compartment contradictions (resolved + unresolved)
4. Systemic risks (3+ compartment recurrence)
5. Pollux integration readiness table
6. Upstream drift register
7. Test gap register
8. Open question triage
9. Recommended next actions (ranked, evidence-linked)
```

Every section must cite compartment reports (e.g., "see
`02-core-turn-engine.report.md` §4").

## SYNTHESIS sidecar structure

Use the same sidecar schema as per-compartment reports, with these differences:

- `compartment.number` = 0 (reserved for synthesis).
- `compartment.slug` = `synthesis`.
- `evidence` entries cite compartment reports instead of code directly.
- Add top-level `integrationMap` object:

```json
{
  "integrationMap": {
    "edges": [
      { "from": 1, "to": 2, "kind": "dependsOn" },
      { "from": 2, "to": 7, "kind": "affects" }
    ]
  }
}
```

## Quality bar

- [ ] > = 12 of 16 compartments referenced.
- [ ] Every systemic risk has >= 3 compartment citations.
- [ ] Every Pollux readiness row has a compartment citation.
- [ ] Upstream drift register is non-empty or explicitly "no drift detected".
- [ ] `INDEX.md` synthesis rows updated.

## What NOT to do

- Do not re-analyze code. Synthesis reads reports, not source.
- Do not silently edit compartment reports to resolve contradictions. Flag and
  let compartment owners resolve.
- Do not propose implementation work. That belongs in `IMPLEMENTATION_PLAN.md`,
  not here.
