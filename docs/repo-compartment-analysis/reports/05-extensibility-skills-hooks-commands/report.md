# Compartment Report: 05 — Extensibility (Skills, Hooks, Commands, Extensions)

## Metadata

- **Compartment**: 05 — Extensibility (Skills, Hooks, Commands, Extensions)
- **Tier**: T3
- **Guideline file**: `05-extensibility-skills-hooks-commands.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: c8127045c5832b0e66cb1efd04e0dd6800ce78e7
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                 | Exists? | Notes (only if material) |
| ---------------------------------------------------- | ------- | ------------------------ |
| `packages/core/src/skills/skillManager.ts`           | yes     |                          |
| `packages/core/src/skills/skillLoader.ts`            | yes     |                          |
| `packages/core/src/hooks/hookSystem.ts`              | yes     |                          |
| `packages/core/src/hooks/hookRegistry.ts`            | yes     |                          |
| `packages/core/src/hooks/hookPlanner.ts`             | yes     |                          |
| `packages/core/src/hooks/hookRunner.ts`              | yes     |                          |
| `packages/core/src/hooks/types.ts`                   | yes     |                          |
| `packages/core/src/hooks/trustedHooks.ts`            | yes     |                          |
| `packages/cli/src/services/BuiltinCommandLoader.ts`  | yes     |                          |
| `packages/cli/src/services/FileCommandLoader.ts`     | yes     |                          |
| `packages/cli/src/services/SkillCommandLoader.ts`    | yes     |                          |
| `packages/cli/src/services/McpPromptLoader.ts`       | yes     |                          |
| `packages/cli/src/services/SlashCommandResolver.ts`  | yes     |                          |
| `packages/cli/src/config/extension-manager.ts`       | yes     |                          |
| `packages/cli/src/config/extension.ts`               | yes     |                          |
| `packages/cli/src/config/extensionRegistryClient.ts` | yes     |                          |

## 1. Scope and Boundary

This compartment covers the four mechanisms that let users and extensions inject
behavior without editing core: skills (markdown-as-prompt), hooks (lifecycle
event handlers), slash commands (built-in / file / skill / MCP-prompt sources),
and extensions (the package manager that ships all of the above). Each has its
own registry, loader chain, and trust gate; together they define the user-facing
surface area for Pollux's planned `/pollux` slash command and any future advisor
hooks.

Explicitly handed off: tool runtime details (compartment 04), settings schema
and merge order (compartment 06), and the policy decisions that gate
hooks/extensions (compartment 09). Interactive mode selection between
agent-session and legacy stream is owned by compartment 03.

## 2. Runtime Flow Summary

### Skill discovery and slash binding

1. `SkillManager.discoverSkills` walks built-in dir, active extension `skills`,
   user dirs, then trusted workspace dirs:
   `packages/core/src/skills/skillManager.ts:47-91`.
2. `loadSkillsFromDir` globs `SKILL.md` and `*/SKILL.md`, parses frontmatter
   into `SkillDefinition`: `packages/core/src/skills/skillLoader.ts:115-187`.
3. `SkillCommandLoader` wraps each definition into a `SlashCommand` with
   `kind: SKILL`, `autoExecute: true`, `toolName: ACTIVATE_SKILL_TOOL_NAME`:
   `packages/cli/src/services/SkillCommandLoader.ts:24-51`.

### Hook lifecycle (per event)

1. Event fired into `HookSystem` which composes registry → planner → runner →
   aggregator → handler: `packages/core/src/hooks/hookSystem.ts:151-169`.
2. `HookPlanner.createExecutionPlan` reads matching entries from `HookRegistry`,
   dedupes by hook key, sets `sequential` if any entry requests it:
   `packages/core/src/hooks/hookPlanner.ts:28-99`.
3. `HookEventHandler.executeHooks` runs the plan via `executeHooksSequential` or
   `executeHooksParallel`, then aggregates:
   `packages/core/src/hooks/hookEventHandler.ts:283-335`.
4. Project-sourced hooks blocked at runtime if the workspace is not trusted:
   `packages/core/src/hooks/hookRunner.ts:64-79`.

### Slash command resolution (interactive)

1. `slashCommandProcessor` constructs the loader chain
   `Builtin → Skill → McpPrompt → File`:
   `packages/cli/src/ui/hooks/slashCommandProcessor.ts:326-332`.
2. `CommandService.create` runs loaders in parallel, concatenates results, then
   calls `SlashCommandResolver.resolve`:
   `packages/cli/src/services/CommandService.ts:44-81`.
3. `SlashCommandResolver` keeps built-in names; extension-file and
   skill-with-extension always prefixed; collisions rename non-built-ins by
   source prefix: `packages/cli/src/services/SlashCommandResolver.ts:46-204`.

### Slash command resolution (non-interactive)

1. `handleSlashCommand` constructs only `Builtin → McpPrompt → File` —
   `SkillCommandLoader` is omitted:
   `packages/cli/src/nonInteractiveCliCommands.ts:43-48`.

### Extension load

1. Install requires workspace trust prompt:
   `packages/cli/src/config/extension-manager.ts:217-232`.
2. Allowlist + git-block gates remote source: `:183-210`, `:730-754`.
3. Extension hooks are wired only if `settings.hooksConfig.enabled`: `:883-889`.
4. MCP servers stripped if admin-disabled, then allowlist-filtered: `:826-857`.
5. Hydration walks `gemini-extension.json`, hook payloads, and skill objects:
   `:875-925`, `:1029-1087`.

## 3. Key Files and Citations

| Path                                                 | Role                            | Notes                                                   |
| ---------------------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| `packages/core/src/skills/skillManager.ts`           | skill discovery orchestrator    | Trust-gates workspace/agent skills                      |
| `packages/core/src/hooks/hookSystem.ts`              | hook composition root           | Wires registry → planner → runner                       |
| `packages/core/src/hooks/types.ts`                   | hook event taxonomy             | 11 event names; PreCompress, BeforeModel, etc.          |
| `packages/cli/src/services/SlashCommandResolver.ts`  | slash command conflict resolver | Built-in always wins; collisions force prefix on others |
| `packages/cli/src/services/SkillCommandLoader.ts`    | skill→slash adapter             | Only wired in interactive mode                          |
| `packages/cli/src/nonInteractiveCliCommands.ts`      | non-interactive slash chain     | Omits SkillCommandLoader                                |
| `packages/cli/src/config/extension-manager.ts`       | extension lifecycle             | Install/trust/allowlist/hydration                       |
| `packages/cli/src/config/extensionRegistryClient.ts` | remote registry fetcher         | Default URL + private-IP block + cache                  |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-05.1** — `HookEventName` enumerates 11 events: `BeforeTool`, `AfterTool`,
  `BeforeAgent`, `Notification`, `AfterAgent`, `SessionStart`, `SessionEnd`,
  `PreCompress`, `BeforeModel`, `AfterModel`, `BeforeToolSelection`.
  - Primary: `packages/core/src/hooks/types.ts:43-55`
  - Confidence: high
- **VT-05.2** — Project-sourced hooks are double-gated: registration is skipped
  when the workspace is not trusted, and runtime execution returns failure for
  the same condition.
  - Primary: `packages/core/src/hooks/hookRegistry.ts:172-187`
  - Supporting: `packages/core/src/hooks/hookRunner.ts:64-79` (runtime block)
  - Confidence: high
- **VT-05.3** — Interactive slash chain is `Builtin → Skill → McpPrompt → File`;
  non-interactive omits `SkillCommandLoader`.
  - Primary: `packages/cli/src/ui/hooks/slashCommandProcessor.ts:326-332`
  - Supporting: `packages/cli/src/nonInteractiveCliCommands.ts:43-48`
    (non-interactive)
  - Confidence: high
- **VT-05.4** — `SlashCommandResolver` always preserves built-in command names;
  extension-file and skill-with-extension commands are always prefixed; runtime
  collisions force renaming via `getPrefix`.
  - Primary: `packages/cli/src/services/SlashCommandResolver.ts:46-204`
  - Supporting: `packages/cli/src/services/SlashCommandResolver.test.ts` (test)
  - Confidence: high
- **VT-05.5** — Extension installation requires workspace trust before
  proceeding; remote sources are gated by an `allowedExtensions` regex and a
  `blockGitExtensions` rule.
  - Primary: `packages/cli/src/config/extension-manager.ts:217-232`
  - Supporting: `packages/cli/src/config/extension-manager.ts:183-210`
    (allowlist + git block)
  - Confidence: high
- **VT-05.6** — Extension hooks are loaded only when
  `settings.hooksConfig.enabled` is true; the hook payload is then
  string-hydrated through `recursivelyHydrateStrings` before registration.
  - Primary: `packages/cli/src/config/extension-manager.ts:883-889`
  - Supporting: `packages/cli/src/config/extension-manager.ts:1029-1087`
    (hydration)
  - Confidence: high

**Contradictions or ambiguities**

- **C-05.1** — Non-interactive `handleSlashCommand` omits `SkillCommandLoader`
  while interactive includes it; the forensic note (`POLLUX_FORENSIC §3.4`)
  flagged this as possibly unintentional. Evidence:
  `packages/cli/src/nonInteractiveCliCommands.ts:43-48`,
  `packages/cli/src/ui/hooks/slashCommandProcessor.ts:326-332`. Resolution:
  deferred — confirm intent with maintainers (handoff to 01).
- **C-05.2** — No `pollux` identifier exists anywhere under `packages/cli/src`
  today, despite spec §10 Phase 7 claiming a `/pollux` command. Evidence:
  `rg pollux packages/cli/src` returns no source matches; `POLLUX_SPEC.md §10`.
  Resolution: unresolved — Phase 7 is not yet implemented.

## 5. Risks and Open Questions

**Risks**

- **R-05.1** — A `/pollux` command added only to `BuiltinCommandLoader` would be
  invisible to ACP clients (which use a separate registry — see compartment 12).
  Severity: medium. Mitigating test: `no test`. Suggested guard: register
  `/pollux` in both `BuiltinCommandLoader` and
  `packages/cli/src/acp/commands/commandRegistry.ts`.
- **R-05.2** — A `/pollux` shipped via extension would silently miss
  non-interactive runs because skills are also dropped there; ensure `/pollux`
  is a built-in or `.toml` file command, not a skill. Severity: medium.
  Mitigating test: `packages/cli/src/services/SkillCommandLoader.test.ts`.
  Suggested guard: integration test in non-interactive mode asserting
  `/pollux help` works.
- **R-05.3** — Pollux advisor escalations could be implemented as a new
  `BeforeModel`/`AfterModel` hook, but extension hooks are off by default until
  `hooksConfig.enabled = true`. Severity: low. Mitigating test:
  `integration-tests/hooks-system.test.ts:29-70`. Suggested guard: surface a
  clear error when Pollux is enabled but `hooksConfig.enabled` is false.
- **R-05.4** — `extensions-reload.test.ts` is currently `skipped` with TODO;
  reload semantics for Pollux-modified extension state are unverified. Severity:
  low. Mitigating test: `no test` (skipped). Suggested guard: re-enable the
  integration test before any reload-dependent Pollux feature ships.

**Open questions**

- [ ] **OQ-05.1** — Is the non-interactive `SkillCommandLoader` omission
      intentional? Escalate to compartment 01.
- [ ] **OQ-05.2** — Should Pollux ship as a built-in command, a file command, or
      an extension? Escalate to compartment 16 (governance).

## 6. Test and Observability Coverage

- **Tests**:
  - `packages/core/src/hooks/{hookEventHandler,hookRegistry,hookRunner,hookPlanner,hookSystem,hookAggregator,hookTranslator}.test.ts`:
    hook lifecycle and trust paths.
  - `packages/cli/src/services/SlashCommandResolver.test.ts`: name conflict
    resolution.
  - `packages/cli/src/services/SkillCommandLoader.test.ts`: skill→slash binding.
  - `packages/core/src/skills/{skillLoader,skillManager,skillManagerAlias}.test.ts`:
    discovery and aliasing.
  - `integration-tests/hooks-system.test.ts`: end-to-end blocking BeforeTool
    scenarios.
  - `integration-tests/extensions-install.test.ts`: install/list/update local
    extension.
  - `integration-tests/extensions-reload.test.ts`: **skipped** with TODO
    (R-05.4).
- **Observability signals**: hook events from `HookEventName`; `HookSystem` log
  lines; `extension-manager` install/error logs.
- **Coverage gaps**:
  - Non-interactive `/pollux` reachability untested (R-05.2).
  - Extension reload semantics (R-05.4).
  - No assertion that `/pollux` registration is parallel between CLI and ACP
    (R-05.1).

## 7. Definition of Done

- [x] All extension points are enumerated and scoped.
- [x] Hook lifecycle and command precedence are evidence-backed.
- [x] Extension manager trust/scope behavior is documented.
- [x] Test-backed guardrails are explicitly listed.
- [x] Safe extension recipe is publish-ready (built-in or file command, not
      skill, for `/pollux`).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Sidecar populated at
      `reports/05-extensibility-skills-hooks-commands/report.json`.
- [x] `INDEX.md` row 05 flipped to `done`.

## 8. Handoffs

- **Depends on**: 04, 06
- **Affects**: 09, 12, 13
- **Escalated to**: 01 — non-interactive SkillCommandLoader omission (OQ-05.1);
  16 — `/pollux` packaging recommendation (OQ-05.2).
