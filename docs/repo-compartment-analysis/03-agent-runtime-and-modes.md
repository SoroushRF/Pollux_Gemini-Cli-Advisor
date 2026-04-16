# Compartment 03: Agent Runtime and Modes

## Purpose

Analyze agent orchestration behavior, including session implementations,
agent-type dispatch, scheduling, local/remote invocation, and mode-dependent
branching.

This compartment explains how the system moves beyond a single chat loop into
specialized and delegated agent behavior.

## Boundary

In scope:

- agent session implementations,
- legacy and current session mode differences,
- agent registry and scheduler,
- local and remote agent invocation,
- role-specific agent modules.

Primary paths:

- `packages/core/src/agent`
- `packages/core/src/agents`
- `packages/cli/src/nonInteractiveCliAgentSession.ts`
- `packages/cli/src/nonInteractiveCliAgentSession.test.ts`
- `packages/cli/src/ui/hooks/useAgentStream.ts`

Out of scope:

- generic turn internals (`packages/core/src/core`),
- non-agent tool internals (`packages/core/src/tools`),
- CLI command parsing details (`packages/cli/src/services`).

## Key Questions To Answer

1. What modes are supported for agent sessions?
2. How does legacy agent session differ from current branch behavior?
3. How are agent types discovered and dispatched?
4. How are remote invocations handled and what are failure boundaries?
5. Which agent capabilities are stable vs experimental?

## Data Gathering Checklist

1. Read both agent session implementations.
2. Identify where CLI selects agent session paths.
3. Analyze agent registry, loader, and scheduler.
4. Trace local vs remote invocation modules.
5. Inspect representative built-in agents.
6. Verify with session and registry tests.

## Step-by-Step Analysis Recipe

### Step 1: Analyze session implementations

Read:

- `packages/core/src/agent/agent-session.ts`
- `packages/core/src/agent/legacy-agent-session.ts`
- `packages/core/src/agent/event-translator.ts`

Capture:

- session lifecycle,
- event translation semantics,
- compatibility handling.

### Step 2: Map mode selection points

Read:

- `packages/cli/src/ui/AppContainer.tsx`
- `packages/cli/src/nonInteractiveCliAgentSession.ts`

Capture:

- when agent-session mode is enabled,
- branch-specific behavior and gating conditions.

### Step 3: Inspect registry and scheduling

Read:

- `packages/core/src/agents/registry.ts`
- `packages/core/src/agents/agentLoader.ts`
- `packages/core/src/agents/agent-scheduler.ts`

Capture:

- registration mechanism,
- lifecycle of agent execution,
- concurrency controls and sequencing.

### Step 4: Trace invocation paths

Read:

- `packages/core/src/agents/local-invocation.ts`
- `packages/core/src/agents/remote-invocation.ts`
- `packages/core/src/agents/local-executor.ts`

Capture:

- invocation protocol,
- payload contracts,
- retry/error behavior.

### Step 5: Characterize built-in agent roles

Read representative modules:

- `packages/core/src/agents/generalist-agent.ts`
- `packages/core/src/agents/codebase-investigator.ts`
- `packages/core/src/agents/cli-help-agent.ts`
- `packages/core/src/agents/memory-manager-agent.ts`

Capture each agent's purpose, constraints, and expected invocation context.

### Step 6: Validate with tests

Correlate claims with:

- `packages/core/src/agent/agent-session.test.ts`
- `packages/core/src/agent/legacy-agent-session.test.ts`
- `packages/core/src/agents/*.test.ts`
- `packages/cli/src/nonInteractiveCliAgentSession.test.ts`

### Step 7: Produce mode matrix

Build matrix across:

- interactive standard stream,
- interactive agent-session branch,
- non-interactive standard,
- non-interactive agent-session.

### Step 8: Report risk and maturity

Call out:

- deprecated or legacy branch risk,
- remote invocation reliability concerns,
- scheduler contention points,
- mode-specific regressions.

## What Good Output Looks Like

1. Agent runtime topology diagram.
2. Branch matrix with explicit entry conditions.
3. Local vs remote invocation comparison.
4. Registry and scheduler constraints.
5. Verified risk list with tests/citations.

## Do and Do Not

Do:

- treat legacy and current branches as distinct systems,
- include CLI branch selectors in evidence,
- verify scheduling claims with tests.

Do not:

- assume all agents share identical lifecycle logic,
- conflate agent execution with tool execution,
- ignore remote invocation error boundaries.

## Common Failure Modes While Analyzing

- Reading only agent modules without session path context.
- Missing branch behavior in `AppContainer`.
- Overlooking scheduler constraints when discussing concurrency.
- Presenting agent role intentions without code evidence.

## Handoffs To Other Compartments

- Core turn lifecycle -> `02-core-turn-engine.md`
- Tools/MCP invocation -> `04-tools-and-mcp-platform.md`
- Integration products (A2A/SDK/VS Code) ->
  `13-integration-products-sdk-vscode-a2a-devtools.md`

## Definition of Done

This compartment is complete when:

1. All active agent session paths are mapped.
2. Legacy/current differences are explicitly documented.
3. Registry, loader, scheduler, and invocation paths are analyzed.
4. Mode matrix is evidence-backed.
5. Agent-specific risk surfaces are enumerated.
