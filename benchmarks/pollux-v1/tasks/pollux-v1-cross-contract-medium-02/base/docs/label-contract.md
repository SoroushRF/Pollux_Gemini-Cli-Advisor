createStableLabel is the canonical label formatter. createLabel remains a public
compatibility alias. src/view.mjs should use the canonical formatter through
src/index.mjs. src/audit.mjs should expose both canonical and compatibility
labels for external checks. Labels normalize input by trimming whitespace and
lowercasing.
