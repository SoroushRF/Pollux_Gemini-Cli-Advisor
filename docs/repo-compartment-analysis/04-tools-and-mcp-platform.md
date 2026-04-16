# Compartment 04: Tools and MCP Platform

## Purpose

Analyze how tools are declared, registered, selected, executed, and integrated
with MCP servers.

This compartment defines the capability surface that turns model output into
real system actions.

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/04-tools-and-mcp-platform.report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/04-tools-and-mcp-platform.report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Template**: `_TEMPLATES/report-template.md`
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 04 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- tool registry and tool definitions,
- built-in tool categories (file, shell, web, memory, search, tasks),
- MCP client/manager transport and tool proxy behavior,
- confirmation and invocation policy touchpoints at tool layer.

Primary paths:

- `packages/core/src/tools`
- `packages/core/src/tools/tool-registry.ts`
- `packages/core/src/tools/tools.ts`
- `packages/core/src/tools/mcp-client-manager.ts`
- `packages/core/src/tools/mcp-client.ts`
- `packages/core/src/tools/mcp-tool.ts`
- `packages/core/src/mcp`

Out of scope:

- CLI slash command parser internals,
- policy engine implementation internals,
- core turn lifecycle internals.

## Key Questions To Answer

1. How are tool definitions declared and surfaced to models?
2. How are tools registered and versioned at runtime?
3. How are MCP-backed tools discovered and invoked?
4. Where are invocation confirmation and safety checks enforced?
5. How do tool errors propagate to upstream runtime layers?

## Data Gathering Checklist

1. Read registry implementation and declaration assembly.
2. Categorize built-in tools by responsibility.
3. Trace one local tool call and one MCP tool call.
4. Identify invocation context and confirmation policy interactions.
5. Verify error handling contracts and test coverage.

## Search Commands

```bash
rg -n "class ToolRegistry|registerTool|getTool|getDeclarations" packages/core/src/tools
rg -n "class .*Tool|abstract class Base" packages/core/src/tools
rg -n "McpClientManager|McpClient|mcp-tool|connectServer" packages/core/src/tools packages/core/src/mcp
rg -n "shouldConfirmExecute|confirmation-policy|ToolConfirmation" packages/core/src/tools
rg --files packages/core/src/tools
rg --files packages/core/src/mcp
rg --files -g "*.test.ts" packages/core/src/tools
```

PowerShell fallback:

```powershell
Select-String -Path "packages/core/src/tools/**/*.ts","packages/core/src/mcp/**/*.ts" -Pattern "ToolRegistry|registerTool|McpClient|shouldConfirmExecute"
```

## Step-by-Step Analysis Recipe

### Step 1: Analyze registry architecture

Read:

- `packages/core/src/tools/tool-registry.ts`
- `packages/core/src/tools/tools.ts`
- `packages/core/src/tools/tool-names.ts`

Capture:

- registration lifecycle,
- declaration generation,
- capability filtering/model sensitivity behavior.

### Step 2: Analyze built-in tool families

Inspect representative tools:

- file: `read-file.ts`, `write-file.ts`, `glob.ts`, `ls.ts`
- search: `ripGrep.ts`, `grep.ts`, `read-many-files.ts`
- shell: `shell.ts`, `shellBackgroundTools.ts`
- web: `web-search.ts`, `web-fetch.ts`
- memory/todo: `memoryTool.ts`, `write-todos.ts`

Capture each tool's input contract, side effects, and safety expectations.

### Step 3: Trace MCP tool pathway

Read:

- `packages/core/src/tools/mcp-client-manager.ts`
- `packages/core/src/tools/mcp-client.ts`
- `packages/core/src/tools/mcp-tool.ts`
- `packages/core/src/mcp/*`

Capture:

- server connection lifecycle,
- schema and declaration mapping,
- invocation transport and error mapping.

### Step 4: Analyze confirmation and policy touchpoints

Read:

- `packages/core/src/tools/confirmation-policy.test.ts`
- `packages/core/src/tools/base-tool-invocation.test.ts`
- related policy integration references in tool code.

Capture where decision boundaries are enforced and where bypass is impossible.

### Step 5: Validate propagation behavior

Trace one complete tool error path from tool layer back to caller and user
output layer, citing relevant files.

### Step 6: Confirm with tests

Use:

- `packages/core/src/tools/*.test.ts`
- MCP-specific tests in `mcp-client*.test.ts`, `mcp-tool.test.ts`
- shell background integration tests.

### Step 7: Build capability inventory

Produce:

- tool category list,
- high-risk tools,
- tools requiring explicit confirmation,
- MCP-dependent capabilities.

### Step 8: Report extension guidance

Specify where and how new tools should be added, tested, and declared safely.

## What Good Output Looks Like

1. Tool architecture map (definition -> registry -> execution).
2. Built-in tool taxonomy with risk levels.
3. MCP lifecycle summary and failure boundaries.
4. Confirmation/policy enforcement matrix.
5. Extension checklist for adding new tools safely.

## Do and Do Not

Do:

- separate local and MCP tool pathways,
- verify declaration behavior against runtime registration,
- include error propagation and confirmation flows.

Do not:

- treat tool docs as implementation proof,
- claim tool availability without registry evidence,
- ignore MCP transport edge cases.

## Common Failure Modes While Analyzing

- Reading only tool handlers and skipping registry semantics.
- Missing model-sensitive declaration logic.
- Ignoring background shell behavior and long-running task semantics.
- Treating MCP tools as equivalent to local tools without transport analysis.

## Handoffs To Other Compartments

- Core event loop integration -> `02-core-turn-engine.md`
- Policy decisions -> `09-policy-trust-and-safety-engine.md`
- Sandbox execution internals -> `10-sandbox-shell-and-filesystem-substrate.md`

## Definition of Done

- [ ] Registration and declaration pipeline is fully mapped.
- [ ] Local and MCP tool execution paths are both documented.
- [ ] Safety/confirmation touchpoints are explicit.
- [ ] Error propagation is traced end-to-end.
- [ ] Extension guidance is concrete and test-backed.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 04 flipped to `done`.
