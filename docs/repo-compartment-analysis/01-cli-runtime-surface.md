# Compartment 01: CLI Runtime Surface

## Purpose

Analyze how user input enters the CLI and is transformed into runtime actions in
interactive and non-interactive modes.

This compartment focuses on the presentation/orchestration layer in
`packages/cli/src` and does not claim core model/tool behavior unless traced
into core with citations.

## Boundary

In scope:

- interactive shell lifecycle,
- input pipelines and slash command processing,
- stream consumption and UI state transitions,
- non-interactive/headless execution and output behavior,
- ACP client command handling surfaces.

Primary paths:

- `packages/cli/src/interactiveCli.tsx`
- `packages/cli/src/nonInteractiveCli.ts`
- `packages/cli/src/nonInteractiveCliAgentSession.ts`
- `packages/cli/src/ui/AppContainer.tsx`
- `packages/cli/src/ui/hooks/useGeminiStream.ts`
- `packages/cli/src/ui/hooks/useAgentStream.ts`
- `packages/cli/src/commands`
- `packages/cli/src/acp`

Out of scope (handoff):

- core turn internals (`packages/core/src/core`),
- tool execution internals (`packages/core/src/tools`),
- policy engine internals (`packages/core/src/policy`).

## Key Questions To Answer

1. How does input dispatch differ between interactive and non-interactive modes?
2. Where are continuation loops controlled after tool calls?
3. Where are command parsing and resolution rules defined?
4. How are UI states and events synchronized with streamed core events?
5. What branch points exist (agent-session mode, ACP mode, output mode)?

## Data Gathering Checklist

1. Read CLI entrypoints and mode split files.
2. Map top-level call graph into stream hooks and command services.
3. Identify state containers and reducers in UI hooks.
4. Trace tool-call continuation paths.
5. Trace cancellation and error propagation behavior.
6. Identify where output formatting mode is selected.
7. Verify claims using corresponding tests near each hook/service.

## Step-by-Step Analysis Recipe

### Step 1: Inventory runtime entrypoints

Read:

- `packages/cli/src/interactiveCli.tsx`
- `packages/cli/src/nonInteractiveCli.ts`
- `packages/cli/src/nonInteractiveCliAgentSession.ts`

Capture:

- startup sequence,
- runtime mode flags,
- initial dependency wiring.

### Step 2: Map interactive orchestration shell

Read:

- `packages/cli/src/ui/App.tsx`
- `packages/cli/src/ui/AppContainer.tsx`

Capture:

- session init,
- event wiring,
- mode switches (standard stream vs agent session branch).

### Step 3: Trace stream consumption behavior

Read deeply:

- `packages/cli/src/ui/hooks/useGeminiStream.ts`
- `packages/cli/src/ui/hooks/useAgentStream.ts`

Capture:

- event handling order,
- tool call queueing/continuation,
- retry and cancellation semantics,
- UI update points for content/thought/tool events.

### Step 4: Trace non-interactive execution

Read:

- `packages/cli/src/nonInteractiveCli.ts`

Capture:

- text/json/stream-json output branching,
- loop and continuation semantics,
- return codes and failure surfaces.

### Step 5: Analyze command path

Read:

- `packages/cli/src/services/SlashCommandResolver.ts`
- `packages/cli/src/services/CommandService.ts`
- `packages/cli/src/commands/*.ts`

Capture:

- command discovery,
- conflict resolution,
- execution order.

### Step 6: Analyze ACP path

Read:

- `packages/cli/src/acp/acpClient.ts`
- `packages/cli/src/acp/commandHandler.ts`
- `packages/cli/src/acp/commands`

Capture:

- ACP-specific command behavior,
- differences from standard CLI command flow,
- state synchronization assumptions.

### Step 7: Verify with tests

Correlate claims with:

- `packages/cli/src/gemini.test.tsx`
- `packages/cli/src/nonInteractiveCli.test.ts`
- `packages/cli/src/nonInteractiveCliAgentSession.test.ts`
- `packages/cli/src/ui/hooks/*.test.tsx`
- `packages/cli/src/acp/*.test.ts`

### Step 8: Produce final compartment verdict

Include:

- validated runtime flow,
- branch matrix,
- high-risk regression points,
- unresolved ambiguities.

## What Good Output Looks Like

Your final CLI compartment report should include:

1. Mode matrix (interactive, non-interactive, ACP, agent-session branch).
2. Event timeline for one representative turn.
3. Tool continuation sequence details in both interactive and non-interactive
   paths.
4. List of stateful hooks and their responsibilities.
5. Error/cancellation behavior summary.

## Do and Do Not

Do:

- document interactive and headless modes separately before comparing,
- validate event ordering assumptions with tests,
- call out branch-specific logic in `AppContainer` and stream hooks,
- track where user-visible output differs by output mode.

Do not:

- assume interactive behavior equals non-interactive behavior,
- attribute core runtime logic to CLI code,
- ignore ACP command handler divergences,
- claim strict ordering without event-path evidence.

## Common Failure Modes While Analyzing

- Treating hook names as behavior evidence without reading implementation.
- Missing continuation behavior because only one stream hook was inspected.
- Forgetting non-interactive agent-session path.
- Ignoring output mode branching when reporting behavior.

## Handoffs To Other Compartments

- Core turn internals -> `02-core-turn-engine.md`
- Tool internals -> `04-tools-and-mcp-platform.md`
- Output formatter internals -> `12-output-protocol-and-acp-adapters.md`
- Settings impacts -> `06-settings-schema-and-config-plumbing.md`

## Definition of Done

This compartment is complete when:

1. The end-to-end CLI call flow is mapped for all runtime modes.
2. Tool continuation behavior is verified for interactive and headless paths.
3. Command path and ACP path are both documented.
4. Branch-specific risks are identified with citations.
5. At least one representative event timeline is evidence-backed.
