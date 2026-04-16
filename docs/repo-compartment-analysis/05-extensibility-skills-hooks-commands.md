# Compartment 05: Extensibility (Skills, Hooks, Commands, Extensions)

## Purpose

Analyze extensibility mechanisms that allow Gemini CLI behavior to be customized
without rewriting core runtime internals.

This includes skill loading, hook execution, custom command discovery, and
extension management surfaces.

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/05-extensibility-skills-hooks-commands.report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/05-extensibility-skills-hooks-commands.report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Template**: `_TEMPLATES/report-template.md`
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 05 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- skill subsystem,
- hook subsystem and lifecycle events,
- custom command loading and resolution,
- extension manager behavior and registry integration.

Primary paths:

- `packages/core/src/skills`
- `packages/core/src/hooks`
- `packages/core/src/commands`
- `packages/cli/src/services/*CommandLoader*.ts`
- `packages/cli/src/services/SlashCommandResolver.ts`
- `packages/cli/src/config/extension-manager.ts`
- `packages/cli/src/commands/extensions.tsx`

Out of scope:

- base tool internals,
- core turn state machine,
- policy engine internals (except where hooks/extensions are gated).

## Key Questions To Answer

1. What extension points exist and when do they execute?
2. How are skills discovered, loaded, and selected?
3. How are hook events translated and sequenced?
4. How are slash command conflicts resolved across built-in/custom/MCP sources?
5. What trust/permission constraints affect extensibility?

## Data Gathering Checklist

1. Read skill loader and manager modules.
2. Read hook registry/planner/runner modules.
3. Map slash command loader chain.
4. Inspect extension manager for scope/hydration behavior.
5. Validate with integration tests covering hooks and command conflicts.

## Search Commands

```bash
rg -n "skillLoader|skillManager|SkillRegistry" packages/core/src/skills
rg -n "hookSystem|hookRegistry|hookPlanner|hookRunner|hookTranslator" packages/core/src/hooks
rg -n "CommandLoader|SlashCommandResolver|McpPromptLoader" packages/cli/src/services
rg -n "extension-manager|extensionRegistryClient|loadExtensions" packages/cli/src/config
rg --files packages/core/src/skills
rg --files packages/core/src/hooks
rg --files -g "*extension*.ts" packages/cli/src/config
```

PowerShell fallback:

```powershell
Select-String -Path "packages/core/src/skills/**/*.ts","packages/core/src/hooks/**/*.ts","packages/cli/src/services/**/*.ts" -Pattern "skillLoader|hookSystem|CommandLoader|extension-manager"
```

## Step-by-Step Analysis Recipe

### Step 1: Analyze skill lifecycle

Read:

- `packages/core/src/skills/skillLoader.ts`
- `packages/core/src/skills/skillManager.ts`
- `packages/core/src/skills/builtin`

Capture:

- discovery and load rules,
- activation semantics,
- alias and conflict handling.

### Step 2: Analyze hook execution system

Read:

- `packages/core/src/hooks/hookSystem.ts`
- `packages/core/src/hooks/hookRegistry.ts`
- `packages/core/src/hooks/hookPlanner.ts`
- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/hookTranslator.ts`

Capture:

- event taxonomy,
- ordering guarantees,
- failure handling and fallback behavior.

### Step 3: Analyze command extensibility chain

Read:

- `packages/cli/src/services/BuiltinCommandLoader.ts`
- `packages/cli/src/services/FileCommandLoader.ts`
- `packages/cli/src/services/SkillCommandLoader.ts`
- `packages/cli/src/services/McpPromptLoader.ts`
- `packages/cli/src/services/SlashCommandResolver.ts`

Capture:

- source precedence,
- conflict resolution,
- discoverability and reload behavior.

### Step 4: Analyze extension manager and policy coupling

Read:

- `packages/cli/src/config/extension-manager.ts`
- `packages/cli/src/config/extension.ts`
- `packages/cli/src/config/extensionRegistryClient.ts`

Capture:

- extension scope rules,
- permission and hydration behavior,
- update lifecycle.

### Step 5: Validate with tests and integration artifacts

Use:

- `packages/core/src/skills/*.test.ts`
- `packages/core/src/hooks/*.test.ts`
- `packages/cli/src/config/extension-manager*.test.ts`
- `integration-tests/hooks-system.test.ts`
- `integration-tests/extensions-install.test.ts`
- `integration-tests/extensions-reload.test.ts`

### Step 6: Produce extension-point matrix

For each extension point, document:

- trigger event,
- execution context,
- ordering semantics,
- trust/policy constraints,
- recommended test path.

### Step 7: Report guardrails

Define safe extension patterns and anti-patterns using code evidence.

## What Good Output Looks Like

1. Extensibility surface catalog (skills/hooks/commands/extensions).
2. Hook event lifecycle and ordering summary.
3. Slash command precedence model.
4. Trust/policy boundaries impacting extensibility.
5. Safe extension implementation checklist.

## Do and Do Not

Do:

- separate skill lifecycle from hook lifecycle,
- include precedence rules for command resolution,
- verify behavior with hook and extension integration tests.

Do not:

- assume extension loading is always global,
- ignore trust/permission constraints,
- treat command source conflicts as edge cases.

## Common Failure Modes While Analyzing

- Focusing only on skills and missing hooks/commands.
- Reading loader files without resolver behavior.
- Ignoring extension scope and hydration semantics.
- Reporting hook guarantees without test confirmation.

## Handoffs To Other Compartments

- Tool runtime details -> `04-tools-and-mcp-platform.md`
- Settings ownership -> `06-settings-schema-and-config-plumbing.md`
- Policy constraints -> `09-policy-trust-and-safety-engine.md`

## Definition of Done

- [ ] All extension points are enumerated and scoped.
- [ ] Hook lifecycle and command precedence are evidence-backed.
- [ ] Extension manager trust/scope behavior is documented.
- [ ] Test-backed guardrails are explicitly listed.
- [ ] Safe extension recipe is publish-ready.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 05 flipped to `done`.
