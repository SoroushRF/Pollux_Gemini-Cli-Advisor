# Compartment 10: Sandbox, Shell, and File System Substrate

## Purpose

Analyze the execution substrate where commands and file operations run,
including sandbox mode behavior across platforms.

This compartment explains how the runtime safely executes high-impact actions.

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/10-sandbox-shell-and-filesystem-substrate.report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/10-sandbox-shell-and-filesystem-substrate.report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Template**: `_TEMPLATES/report-template.md`
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 10 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- sandbox manager and backend selection,
- shell execution services and background process behavior,
- filesystem service abstractions,
- platform-specific sandbox artifacts and policies.

Primary paths:

- `packages/core/src/sandbox`
- `packages/core/src/services/sandboxManager.ts`
- `packages/core/src/services/sandboxManagerFactory.ts`
- `packages/core/src/services/shellExecutionService.ts`
- `packages/core/src/services/fileSystemService.ts`
- `packages/core/src/services/sandboxedFileSystemService.ts`
- `bundle/sandbox-*.sb`

Out of scope:

- policy decision semantics,
- CLI command parsing,
- telemetry exporter internals.

## Key Questions To Answer

1. How is sandbox mode selected and initialized?
2. What platform-specific behaviors exist?
3. How do shell and background tasks execute and get managed?
4. How do filesystem operations differ in sandboxed vs unsandboxed modes?
5. Where are execution lifecycle guarantees and cleanup behaviors enforced?

## Data Gathering Checklist

1. Read sandbox manager and factory modules.
2. Inspect platform sandbox implementations under `src/sandbox/*`.
3. Trace shell execution service, including background behavior.
4. Trace filesystem service abstraction boundaries.
5. Validate with sandbox and shell integration tests.

## Search Commands

```bash
rg -n "sandboxManager|sandboxManagerFactory|SANDBOX_MODE" packages/core/src/services packages/core/src/sandbox
rg -n "shellExecutionService|shellBackgroundTools|spawn" packages/core/src
rg -n "fileSystemService|sandboxedFileSystemService|readFile|writeFile" packages/core/src/services
rg -n "executionLifecycleService|cancel|cleanup" packages/core/src/services
rg --files packages/core/src/sandbox
rg --files bundle -g "*.sb"
```

PowerShell fallback:

```powershell
Select-String -Path "packages/core/src/services/*.ts","packages/core/src/sandbox/**/*.ts" -Pattern "sandboxManager|shellExecutionService|fileSystemService|executionLifecycle"
```

## Step-by-Step Analysis Recipe

### Step 1: Analyze sandbox architecture

Read:

- `packages/core/src/services/sandboxManager.ts`
- `packages/core/src/services/sandboxManagerFactory.ts`
- `packages/core/src/sandbox/*`

Capture:

- mode selection (`none`, `docker`, `podman`, etc.),
- lifecycle hooks,
- initialization and teardown behavior.

### Step 2: Analyze platform-specific logic

Inspect:

- `packages/core/src/sandbox/macos`
- `packages/core/src/sandbox/linux`
- `packages/core/src/sandbox/windows`

Capture differences in permissions, startup strategy, and constraints.

### Step 3: Analyze shell execution pathway

Read:

- `packages/core/src/services/shellExecutionService.ts`
- `packages/core/src/tools/shell.ts`
- `packages/core/src/tools/shellBackgroundTools.ts`

Capture:

- command execution semantics,
- streaming/stdout/stderr handling,
- background task lifecycle and termination behavior.

### Step 4: Analyze filesystem service boundaries

Read:

- `packages/core/src/services/fileSystemService.ts`
- `packages/core/src/services/sandboxedFileSystemService.ts`
- file tools under `packages/core/src/tools/*file*.ts`

Capture:

- path validation,
- read/write restrictions,
- sandbox-aware behavior differences.

### Step 5: Validate lifecycle behavior

Read:

- `packages/core/src/services/executionLifecycleService.ts`

Capture:

- cancellation propagation,
- cleanup guarantees,
- failure and timeout semantics.

### Step 6: Verify with tests

Use:

- `packages/core/src/services/sandboxManager*.test.ts`
- `packages/core/src/services/shellExecutionService.test.ts`
- `packages/core/src/tools/shell*.test.ts`
- integration sandbox matrix tests.

### Step 7: Build execution risk matrix

Classify risks by:

- sandbox mode,
- platform,
- command type,
- filesystem side effects.

### Step 8: Publish operational guidance

Document debugging steps for sandbox failures, hanging shells, and filesystem
permission errors.

## What Good Output Looks Like

1. Sandbox mode selection and lifecycle diagram.
2. Platform-difference summary.
3. Shell and background execution semantics.
4. Filesystem boundary and restriction model.
5. Operational troubleshooting checklist.

## Do and Do Not

Do:

- analyze shell and filesystem paths together,
- include platform-specific differences,
- validate cleanup/cancellation semantics with tests.

Do not:

- treat sandboxing as purely Docker behavior,
- ignore background task lifecycle,
- conflate policy denial with substrate/runtime failure.

## Common Failure Modes While Analyzing

- Missing platform-specific branches.
- Ignoring execution lifecycle cleanup behavior.
- Reporting shell behavior without background tools.
- Skipping integration tests across sandbox modes.

## Handoffs To Other Compartments

- Policy controls -> `09-policy-trust-and-safety-engine.md`
- Tool abstractions -> `04-tools-and-mcp-platform.md`
- Performance and reliability tests ->
  `14-testing-and-evaluation-architecture.md`

## Definition of Done

- [ ] Sandbox architecture is mapped across modes and platforms.
- [ ] Shell/background and filesystem pathways are documented.
- [ ] Lifecycle and cleanup semantics are evidence-backed.
- [ ] Execution risk matrix is published.
- [ ] Troubleshooting guidance is actionable.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 10 flipped to `done`.
