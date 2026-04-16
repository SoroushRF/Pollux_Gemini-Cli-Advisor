# Pollux Repository Compartment Analysis Guide

This folder is a structured playbook for analyzing the Gemini CLI monorepo in
clean, non-overlapping compartments.

The goal is not to rewrite architecture docs. The goal is to produce repeatable,
forensic-grade analysis outputs for each subsystem: what it does, how it works,
where it integrates, what can regress, and how to verify claims with code
citations.

## Why This Multi-File Structure Is Better

For this codebase, splitting analysis into multiple files is better than one
mega-document because:

- ownership boundaries are clearer (CLI vs Core vs SDK vs tests vs CI),
- updates become localized (change one compartment file, not one giant report),
- citation density stays high without becoming unreadable,
- teams can review compartment files in parallel,
- new contributors can onboard section-by-section.

## Compartment Map

Each file below is a deep recipe for one compartment.

1. `01-cli-runtime-surface.md`
2. `02-core-turn-engine.md`
3. `03-agent-runtime-and-modes.md`
4. `04-tools-and-mcp-platform.md`
5. `05-extensibility-skills-hooks-commands.md`
6. `06-settings-schema-and-config-plumbing.md`
7. `07-routing-availability-loop-and-pollux.md`
8. `08-context-memory-and-compression.md`
9. `09-policy-trust-and-safety-engine.md`
10. `10-sandbox-shell-and-filesystem-substrate.md`
11. `11-telemetry-observability-and-billing-signals.md`
12. `12-output-protocol-and-acp-adapters.md`
13. `13-integration-products-sdk-vscode-a2a-devtools.md`
14. `14-testing-and-evaluation-architecture.md`
15. `15-build-packaging-release-and-ci.md`
16. `16-docs-specs-and-governance.md`

## Shared Analysis Workflow (Applies To Every Compartment)

Use this flow every time.

1. Define boundary and non-goals.
2. Inventory files and entrypoints.
3. Trace runtime flow (input -> processing -> output).
4. Map cross-compartment dependencies.
5. Verify claims with line-level citations.
6. Identify risks, contradictions, and test gaps.
7. Produce a concise verdict + evidence matrix.

## Data Gathering Standards

Use primary evidence first:

1. Runtime TypeScript source under `packages/*/src`.
2. Tests near code (`*.test.ts`, integration suites).
3. Package manifests (`package.json`) for ownership and publish surfaces.
4. Build scripts and CI workflows for delivery behavior.
5. Markdown docs/specs only after code confirms behavior.

Treat docs/specs as intent until code validates them.

## Command Strategy

Preferred search commands:

```bash
rg "processTurn|useGeminiStream|modelRouterService" packages
rg --files packages/core/src
```

Windows fallback when `rg` is unavailable:

```powershell
Get-ChildItem -Recurse packages | Select-Object -ExpandProperty FullName
Select-String -Path "packages/**/*.ts" -Pattern "processTurn|useGeminiStream|modelRouterService"
```

Use broad scans first, then narrow to exact files.

## Citation Standard

Each major claim should cite:

- one primary runtime file,
- one supporting file (test/config/doc),
- optional line anchors when precision matters.

Example citation shape:

- `packages/core/src/core/client.ts` (primary behavior)
- `packages/cli/src/ui/hooks/useGeminiStream.ts` (interactive continuation)
- `packages/cli/src/nonInteractiveCli.ts` (headless continuation)

## Global Do and Do Not

Do:

- keep compartments mutually exclusive by default,
- document explicit handoff surfaces between compartments,
- distinguish implemented behavior from planned behavior,
- confirm negative claims with repo-wide search,
- include a "Definition of Done" for each analysis run.

Do not:

- infer runtime behavior from folder names alone,
- rely on one mode only (interactive or headless),
- skip tests when declaring behavior certainty,
- merge policy/config/runtime concerns into one blurry section,
- present roadmap text as implemented fact.

## Global Output Template

Use this mini-template in every compartment report:

1. Scope and boundary.
2. Runtime flow summary.
3. Key files and citations.
4. Verified truths.
5. Contradictions or ambiguities.
6. Risks/regression hotspots.
7. Test and observability coverage.
8. Open questions.
9. Definition of done.

## How To Use This Folder

- Start with this README.
- Pick one compartment file.
- Execute the recipe exactly.
- Publish a compartment report with citations.
- Move to the next compartment.
- Finish by writing a short cross-compartment synthesis.

This gives a full technical picture while preserving clarity and traceability.
