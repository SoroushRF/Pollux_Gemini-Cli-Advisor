# Compartment Reports

This directory holds the output of compartment analyses.

## Filename conventions

- Markdown report: `NN-<slug>.report.md`
- JSON sidecar: `NN-<slug>.report.json`
- Synthesis: `SYNTHESIS.report.md` and `SYNTHESIS.report.json`

Where `NN-<slug>` matches the guideline filename without `.md`.

Examples:

- `02-core-turn-engine.report.md`
- `02-core-turn-engine.report.json`
- `07-routing-availability-loop-and-pollux.report.md`
- `07-routing-availability-loop-and-pollux.report.json`

## Rules

- One compartment, one pair of files. Do not fuse compartments.
- The JSON sidecar must validate against
  `../_TEMPLATES/report-sidecar-schema.json`.
- The Markdown report must follow `../_TEMPLATES/report-template.md`.
- Every report must also update the compartment's row in `../INDEX.md`.

## Reading order

For a new reader:

1. Open `../INDEX.md` to see what is done.
2. Read `SYNTHESIS.report.md` if it exists.
3. Drill into individual compartment reports as needed.

## Stale reports

If an upstream merge invalidates a report:

1. Mark the compartment `stale` in `../INDEX.md`.
2. Keep the old report file (do not delete).
3. Re-run the guideline and overwrite both files, bumping the `repoCommit` in
   the sidecar.
