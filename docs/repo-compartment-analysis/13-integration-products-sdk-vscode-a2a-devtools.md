# Compartment 13: Integration Products (SDK, VS Code Companion, A2A, Devtools)

## Purpose

Analyze packaged integration surfaces that expose Gemini CLI capabilities beyond
the primary terminal UI.

This compartment is product-facing and contract-heavy, with independent release
and compatibility implications.

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/13-integration-products-sdk-vscode-a2a-devtools.report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/13-integration-products-sdk-vscode-a2a-devtools.report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Template**: `_TEMPLATES/report-template.md`
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 13 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- SDK package API and session/tool abstractions,
- VS Code companion extension architecture,
- A2A server runtime and transport model,
- devtools package and client bridge behavior,
- package-level dependency and publish boundaries.

Primary paths:

- `packages/sdk`
- `packages/vscode-ide-companion`
- `packages/a2a-server`
- `packages/devtools`
- package manifests in each directory.

Out of scope:

- internal core turn internals except where needed for integration mapping,
- CI/release pipeline internals,
- generic CLI presentation behavior.

## Key Questions To Answer

1. What public contracts does each integration product expose?
2. What internal dependencies are shared across products?
3. What lifecycle and transport assumptions exist per product?
4. Which compatibility surfaces are most break-sensitive?
5. What test coverage exists per integration product?

## Data Gathering Checklist

1. Read each package `README.md` and `package.json`.
2. Map each product's entrypoints and core modules.
3. Trace dependency on `@google/gemini-cli-core`.
4. Inspect extension/server command and protocol layers.
5. Verify with product-specific tests.

## Search Commands

```bash
rg --files packages/sdk/src
rg --files packages/vscode-ide-companion/src
rg --files packages/a2a-server/src
rg --files packages/devtools
rg -n "export|createSession|GeminiSDK" packages/sdk/src
rg -n "activate|registerCommand|ideServer" packages/vscode-ide-companion/src
rg -n "http/server|http/app|agent|commands" packages/a2a-server/src
rg -n "\"dependencies\"|\"peerDependencies\"" packages/*/package.json
```

PowerShell fallback:

```powershell
Get-ChildItem -Recurse packages/sdk/src, packages/vscode-ide-companion/src, packages/a2a-server/src, packages/devtools | Select-Object FullName
Select-String -Path "packages/sdk/src/**/*.ts" -Pattern "export|createSession"
```

## Step-by-Step Analysis Recipe

### Step 1: Analyze SDK surface

Read:

- `packages/sdk/README.md`
- `packages/sdk/SDK_DESIGN.md`
- `packages/sdk/src/index.ts`
- `packages/sdk/src/types.ts`

Capture:

- primary classes/functions,
- streaming and session contract,
- schema typing and validation strategy.

### Step 2: Analyze VS Code companion

Read:

- `packages/vscode-ide-companion/package.json`
- `packages/vscode-ide-companion/src/extension.ts`
- `packages/vscode-ide-companion/src/ide-server.ts`
- `packages/vscode-ide-companion/src/diff-manager.ts`

Capture:

- activation model,
- command surface,
- IDE context bridge and diff workflow.

### Step 3: Analyze A2A server

Read:

- `packages/a2a-server/README.md`
- `packages/a2a-server/src/http/server.ts`
- `packages/a2a-server/src/http/app.ts`
- `packages/a2a-server/src/agent/*`
- `packages/a2a-server/src/commands/*`

Capture:

- transport model,
- command/task lifecycle,
- persistence and auth coupling.

### Step 4: Analyze devtools package

Read:

- `packages/devtools/src/index.ts`
- `packages/devtools/src/types.ts`
- `packages/devtools/client/src`

Capture:

- runtime role,
- client-server boundaries,
- artifact/build coupling.

### Step 5: Build cross-product dependency map

Capture shared dependencies and coupling points (especially on core and protocol
contracts).

### Step 6: Validate with tests

Use:

- `packages/sdk/*.test.ts`
- `packages/vscode-ide-companion/src/*.test.ts`
- `packages/a2a-server/src/**/*.test.ts`
- any integration tests that exercise these products.

### Step 7: Build compatibility risk matrix

For each product, list:

- public API/protocol surface,
- likely breaking-change vectors,
- recommended contract tests.

### Step 8: Publish integration hardening guidance

Provide release checklist and compatibility test recommendations per product.

## What Good Output Looks Like

1. Per-product architecture summaries.
2. Public contract inventory by product.
3. Shared dependency/coupling map.
4. Compatibility risk matrix.
5. Product-specific hardening checklist.

## Do and Do Not

Do:

- analyze each product as a separate deployable artifact,
- include package manifest evidence for boundaries,
- identify contract-change risk before implementation changes.

Do not:

- treat all integration products as one runtime surface,
- ignore extension and server protocol details,
- skip product-specific tests when making stability claims.

## Common Failure Modes While Analyzing

- Overfocusing on core internals and under-documenting product contracts.
- Missing extension command/activation behavior in VS Code companion.
- Ignoring A2A transport and persistence details.
- Treating SDK as a thin wrapper without checking actual APIs.

## Handoffs To Other Compartments

- Core runtime behavior -> `02-core-turn-engine.md`
- Output/protocol contracts -> `12-output-protocol-and-acp-adapters.md`
- Build/release implications -> `15-build-packaging-release-and-ci.md`

## Definition of Done

- [ ] All integration products have independent architecture summaries.
- [ ] Public contracts are explicitly inventoried.
- [ ] Shared dependencies and coupling are mapped.
- [ ] Compatibility risks are ranked.
- [ ] Product hardening guidance is actionable.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 13 flipped to `done`.
