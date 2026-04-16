# Compartment Reports

This directory holds the output of compartment analyses.

## Folder and filename conventions

One folder per compartment. Folder name matches the guideline filename without
`.md`.

```
reports/
  01-cli-runtime-surface/
    report.md
    report.json
  02-core-turn-engine/
    report.md
    report.json
  ...
  SYNTHESIS/
    report.md
    report.json
```

Each compartment folder contains exactly two files:

- `report.md` — the Markdown report.
- `report.json` — the structured sidecar conforming to
  `../_TEMPLATES/report-sidecar-schema.json`.

Tier-1 summary and cross-compartment synthesis live at the top level:

- `TIER1_SUMMARY.md` — condensed view of all Tier-1 compartment reports.
- `SYNTHESIS/report.md` + `SYNTHESIS/report.json` — capstone produced once ≥ 12
  compartments are done.

## Template by tier

Pick the template based on `POLLUX_PRIORITY.md` tier. Sizes are ceilings, not
targets to fill.

| Tier | Template                                | Markdown lines | Sidecar lines |
| ---- | --------------------------------------- | -------------- | ------------- |
| T1   | `../_TEMPLATES/report-template.md`      | 400–900        | full          |
| T2   | `../_TEMPLATES/report-template-lite.md` | 250–400        | 150–250       |
| T3   | `../_TEMPLATES/report-template-lite.md` | 200–300        | 100–180       |
| T4   | `../_TEMPLATES/report-template-lite.md` | 150–250        | 80–150        |

The lite template drops Section 10 (Evidence Matrix — it duplicates Section 4),
shrinks Key Files to 5–10 rows, merges Risks + Open Questions, and forbids
appendices and most code quotes.

JSON sidecars are required for every tier. The synthesis capstone
(`_TEMPLATES/cross-compartment-synthesis.md` Step 1) parses sidecars
programmatically; dropping them breaks the capstone.

## Rules

- One compartment, one folder, exactly two files.
- `report.json` must validate against
  `../_TEMPLATES/report-sidecar-schema.json`.
- `report.md` must follow the tier-appropriate template.
- Every report must also update the compartment's row in `../INDEX.md`.

## Reading order

For a new reader:

1. Open `../INDEX.md` to see what is done.
2. Read `TIER1_SUMMARY.md` for the critical-path picture.
3. Read `SYNTHESIS/report.md` if it exists.
4. Drill into individual compartment folders as needed.

## Stale reports

If an upstream merge invalidates a report:

1. Mark the compartment `stale` in `../INDEX.md`.
2. Keep the old report file (do not delete).
3. Re-run the guideline and overwrite both files in the same folder, bumping the
   `repoCommit` in the sidecar.
