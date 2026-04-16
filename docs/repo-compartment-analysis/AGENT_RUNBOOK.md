# Agent Runbook — Executing One Compartment

This is the single executable contract for any AI agent (or human) analyzing one
compartment of the Pollux / gemini-cli repo. Follow it exactly.

If you are synthesizing multiple compartments instead of analyzing one, see
`_TEMPLATES/cross-compartment-synthesis.md`.

---

## 0. Prerequisites

- You have read `README.md` in this folder.
- You have read `CITATION_STANDARD.md`.
- You have skimmed `GLOSSARY.md` for recurring terms.
- You have checked `POLLUX_PRIORITY.md` if you are choosing which compartment to
  run next. (You are not required to follow the tier order, but if multiple
  compartments are unclaimed, prefer the highest tier.)
- You are operating in **read-only analysis mode**. Do not modify runtime source
  code as part of analysis. Writing reports under
  `docs/repo-compartment-analysis/reports/` is allowed and expected.

## 1. Inputs

- One compartment guideline file from this folder, e.g.
  `02-core-turn-engine.md`.
- A working checkout of the repo at the current commit.
- `rg` (ripgrep) available; PowerShell fallback available on Windows.

## 2. Output contract (non-negotiable)

Each compartment run produces exactly two artifacts:

1. A Markdown report at:
   `docs/repo-compartment-analysis/reports/NN-<slug>.report.md` where
   `NN-<slug>` matches the guideline filename (e.g. `02-core-turn-engine`).
2. A JSON sidecar at:
   `docs/repo-compartment-analysis/reports/NN-<slug>.report.json` conforming to
   `_TEMPLATES/report-sidecar-schema.json`.

Both files must be present for the compartment to be marked `done`.

## 3. Execution steps

Execute in this exact order. Do not skip steps.

### Step A — Claim the compartment

1. Open `INDEX.md`.
2. Find the row for your compartment.
3. Set `Status` to `in_progress` and fill `Owner` (agent id or human name) and
   `Started` (ISO date).
4. Save `INDEX.md`.

Skip this step only if running in a pure readonly evaluation harness.

### Step B — Pre-flight path validation

1. Open the compartment guideline file.
2. For every path listed under "Primary paths", confirm it exists.
3. Record any missing paths in the "Contradictions or ambiguities" section of
   your report. Do **not** abort — stale paths are findings.

Validation command (PowerShell):

```powershell
Get-Content docs/repo-compartment-analysis/NN-<slug>.md |
  Select-String -Pattern '^- `([^`]+)`' |
  ForEach-Object { $_.Matches.Groups[1].Value } |
  ForEach-Object { if (-not (Test-Path $_)) { "MISSING: $_" } else { "OK: $_" } }
```

### Step C — Execute the guideline recipe

1. Work through the numbered steps in the guideline's "Step-by-Step Analysis
   Recipe" section.
2. For each step, use the commands from the "Search Commands" block at the top
   of the recipe. Prefer `rg` first; PowerShell is a fallback.
3. Read minimally, cite maximally. Do **not** dump full files into your report.
   Quote only the lines needed to support a claim.
4. Enforce a reading budget: skip deep reads on any single file > 1500 lines
   unless a specific claim requires it. Use `rg -n` to locate targeted line
   ranges first.
5. Capture findings directly into the report template while you work. Do not
   wait until the end.

### Step D — Verify claims with tests

1. For every "Verified truth" claim, cite at least one test file or assert "no
   test found" explicitly.
2. Uncited claims are downgraded to "Open questions".

### Step E — Fill the report

1. Copy `_TEMPLATES/report-template.md` to `reports/NN-<slug>.report.md`.
2. Fill every section. Sections must not be deleted; if not applicable, write
   "N/A" with a one-sentence justification.
3. Every major claim must carry at least one citation per
   `CITATION_STANDARD.md`.

### Step F — Fill the JSON sidecar

1. Copy `_TEMPLATES/report-sidecar-schema.json` mental shape into a new file at
   `reports/NN-<slug>.report.json`.
2. Populate the evidence matrix as structured data (claims, citations,
   confidence, test coverage).
3. Validate the JSON parses (`Get-Content ... | ConvertFrom-Json`).

### Step G — Update the status tracker

1. Open `INDEX.md`.
2. Flip `Status` to `done`, fill `Finished` (ISO date), and add the link to the
   report file.
3. Note any unresolved "Open questions" count in the `Notes` column.

### Step H — Hand off

1. List the compartments your report depends on but did not cover. These are the
   "Handoffs to other compartments" in the guideline.
2. If your analysis uncovered a contradiction that affects another compartment,
   add a note in the target compartment's row under `Notes` in `INDEX.md`.

## 4. Quality bar (Definition of Done)

The compartment is `done` only when all the following are true:

- [ ] Report Markdown exists at the canonical path and uses the template.
- [ ] JSON sidecar exists and parses cleanly.
- [ ] Every "Verified truth" has >= 1 primary code citation.
- [ ] Every behavioral guarantee has >= 1 test citation or an explicit "no test
      coverage" note.
- [ ] Pre-flight path validation is recorded (pass/fail per path).
- [ ] All 8 guideline steps have a corresponding entry or explicit "N/A" with
      justification.
- [ ] Definition of Done checklist in the guideline is checked off.
- [ ] `INDEX.md` updated.

## 5. Readonly discipline

- Do not edit `packages/**` source code as part of analysis.
- Do not run the build or tests as part of analysis unless a specific claim
  requires runtime confirmation; if you do, record command and outcome verbatim
  in the report.
- Do not invent paths. If you cannot locate a file, record it as a
  contradiction.

## 6. Failure handling

- If a primary path is missing: record as a contradiction, continue.
- If a search returns 0 hits for an expected symbol: widen the query, record
  both attempts in the report.
- If you are blocked by a dependency on another compartment: set status to
  `blocked` in `INDEX.md` and list the blocking compartment.
- If your report would exceed ~2000 lines: you are over-reading. Prune.

## 7. Commit convention (optional)

If committing reports:

```
docs(analysis): compartment NN-<slug> report
```

One commit per compartment. Do not batch multiple compartments in one commit —
it breaks the per-compartment review model.

## 8. Parallel execution safety

- Multiple agents may run different compartments in parallel.
- Two agents must never claim the same compartment; `INDEX.md` is the single
  source of truth for claims.
- If you see an `in_progress` row older than 24h with no activity, you may
  re-claim it; record the takeover in `Notes`.

---

**TL;DR** — Claim in `INDEX.md`, pre-flight paths, execute the recipe with
rg-first commands, fill the template + sidecar, cite everything, flip status to
`done`.
