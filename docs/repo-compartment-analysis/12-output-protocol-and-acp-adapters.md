# Compartment 12: Output, Protocol, and ACP Adapters

## Purpose

Analyze how internal runtime events are transformed into external output
contracts across CLI text/json/stream-json modes and ACP protocol integrations.

This compartment is critical for automation and integration reliability.

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/12-output-protocol-and-acp-adapters/report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/12-output-protocol-and-acp-adapters/report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Tier / Template**: **T3** — `_TEMPLATES/report-template-lite.md` (200–300 md
  lines, 0 code quotes, ≥4 verified truths). See `AGENT_RUNBOOK.md` §2.
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 12 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- output formatter logic and output schemas,
- non-interactive output mode behavior,
- ACP protocol adapters and command handlers,
- event-to-protocol translation contracts.

Primary paths:

- `packages/core/src/output`
- `packages/core/src/output/json-formatter.ts`
- `packages/core/src/output/stream-json-formatter.ts`
- `packages/cli/src/nonInteractiveCli.ts`
- `packages/cli/src/acp`
- `packages/cli/src/acp/acpClient.ts`
- `packages/cli/src/acp/commandHandler.ts`

Out of scope:

- UI rendering in interactive mode,
- internal turn generation semantics,
- tool implementation details.

## Key Questions To Answer

1. What are the exact output contracts for each mode?
2. How are runtime events translated into output records?
3. What error handling differences exist across output modes?
4. How does ACP command handling align/diverge from standard CLI output paths?
5. What compatibility guarantees are test-backed?

## Data Gathering Checklist

1. Read output formatter types and implementations.
2. Trace non-interactive mode branching for output format selection.
3. Read ACP client/command handler and ACP command modules.
4. Inspect tests and integration artifacts for output compatibility.
5. Build a schema-level contract summary for each mode.

## Search Commands

```bash
rg -n "json-formatter|stream-json-formatter|OutputFormatter" packages/core/src/output
rg -n "OUTPUT_FORMAT|--output-format|text|json|stream-json" packages/cli/src
rg -n "acpClient|commandHandler|ACP" packages/cli/src/acp
rg --files packages/core/src/output
rg --files packages/cli/src/acp
rg --files -g "*output*.test.ts" packages integration-tests
```

PowerShell fallback:

```powershell
Select-String -Path "packages/core/src/output/**/*.ts","packages/cli/src/acp/**/*.ts","packages/cli/src/nonInteractiveCli.ts" -Pattern "json-formatter|stream-json|acpClient|OUTPUT_FORMAT"
```

## Step-by-Step Analysis Recipe

### Step 1: Analyze formatter implementations

Read:

- `packages/core/src/output/types.ts`
- `packages/core/src/output/json-formatter.ts`
- `packages/core/src/output/stream-json-formatter.ts`

Capture:

- output structures,
- event mapping,
- error representation.

### Step 2: Analyze non-interactive output branching

Read:

- `packages/cli/src/nonInteractiveCli.ts`

Capture:

- selection logic for text/json/stream-json,
- mode-specific buffering/streaming behavior,
- exit semantics.

### Step 3: Analyze ACP adaptation layer

Read:

- `packages/cli/src/acp/acpClient.ts`
- `packages/cli/src/acp/commandHandler.ts`
- `packages/cli/src/acp/commands/*`

Capture:

- protocol message model,
- command dispatch semantics,
- differences from native CLI path.

### Step 4: Validate output compatibility with tests

Use:

- `packages/cli/src/nonInteractiveCli.test.ts`
- `integration-tests/json-output.test.ts`
- `integration-tests/stdout-stderr-output.test.ts`
- ACP-specific tests in `packages/cli/src/acp/*.test.ts`

### Step 5: Build output contract matrix

For each mode, document:

- data format,
- event granularity,
- error format,
- stability expectations,
- intended consumers.

### Step 6: Build ACP compatibility matrix

Document command-level behavior and known protocol caveats.

### Step 7: Report migration and stability risks

Call out fields and message patterns likely to break external tooling if
changed.

### Step 8: Publish validation checklist

Provide test/assertion checklist for future output contract changes.

## What Good Output Looks Like

1. Output mode contract definitions.
2. Event translation mapping table.
3. ACP behavior summary and divergences.
4. Backward compatibility risk list.
5. Contract-change validation checklist.

## Do and Do Not

Do:

- treat output schemas as API contracts,
- verify behavior with integration tests,
- document ACP and non-ACP paths separately.

Do not:

- assume textual output and JSON output share semantics,
- change formatter behavior without compatibility analysis,
- ignore error payload structure in contract summaries.

## Common Failure Modes While Analyzing

- Ignoring stream-json event ordering details.
- Missing ACP-specific command behavior.
- Treating integration snapshots as optional.
- Reporting output guarantees without schema-level evidence.

## Handoffs To Other Compartments

- Core event generation -> `02-core-turn-engine.md`
- CLI runtime branching -> `01-cli-runtime-surface.md`
- Integration product consumers ->
  `13-integration-products-sdk-vscode-a2a-devtools.md`

## Definition of Done

- [ ] Output contracts for all modes are explicit.
- [ ] Event-to-output translation is evidence-backed.
- [ ] ACP adaptation behavior is mapped.
- [ ] Compatibility risks are documented.
- [ ] Contract-change verification checklist is complete.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 12 flipped to `done`.
