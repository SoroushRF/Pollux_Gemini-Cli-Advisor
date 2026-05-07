createStableLabel is the canonical label formatter. createLabel remains a public
compatibility alias. src/view.mjs should use the canonical formatter through
src/index.mjs.

src/audit.mjs must export auditLabels(value), returning an object with exactly
these public fields:

- canonical: the createStableLabel(value) result
- compat: the createLabel(value) compatibility result

Labels normalize input by trimming whitespace and lowercasing.
