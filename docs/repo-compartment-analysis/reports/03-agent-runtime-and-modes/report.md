## Metadata

- **Compartment**: 03 — Agent Runtime and Modes
- **Tier**: T2
- **Guideline file**: `03-agent-runtime-and-modes.md`
- **Owner**: gemini-3.1-pro
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: HEAD
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                     | Exists? | Notes (only if material) |
| -------------------------------------------------------- | ------- | ------------------------ |
| `packages/core/src/agent`                                | yes     |                          |
| `packages/core/src/agents`                               | yes     |                          |
| `packages/cli/src/nonInteractiveCliAgentSession.ts`      | yes     |                          |
| `packages/cli/src/nonInteractiveCliAgentSession.test.ts` | yes     |                          |
| `packages/cli/src/ui/hooks/useAgentStream.ts`            | yes     |                          |

## 1. Scope and Boundary

This compartment analyzes agent orchestration behavior, including session
implementations, agent-type dispatch, scheduling, local/remote invocation, and
mode-dependent branching. It explains how the system moves beyond a single chat
loop into specialized and delegated agent behavior.

Explicitly handed off: core turn lifecycle, tools/MCP invocation, and
integration products (A2A/SDK/VS Code).

## 2. Runtime Flow Summary

### Interactive Mode Selection

1. Entry: `packages/cli/src/ui/AppContainer.tsx:1178-1184` determines if
   `AgentSessionInteractiveEnabled` is true.
2. Branch A: If true, instantiates `LegacyAgentProtocol` and calls
   `useAgentStream`.
3. Branch B: If false, falls back to `useGeminiStream`.

### Agent Registration and Loading

1. Entry: `packages/core/src/agents/registry.ts:60-70` initializes the registry.
2. Built-in: `packages/core/src/agents/registry.ts:265-304` registers built-in
   agents (CodebaseInvestigator, Generalist, Browser, MemoryManager).
3. User/Project: `packages/core/src/agents/registry.ts:130-234` loads agents
   from user and project directories.
4. Extensions: `packages/core/src/agents/registry.ts:236-256` loads agents from
   active extensions.

### Local Agent Invocation

1. Entry: `packages/core/src/agents/local-invocation.ts:108-111` executes the
   subagent.
2. Bridge: `packages/core/src/agents/local-invocation.ts:127-275` streams
   activity (thoughts, tool calls) to the UI.
3. Execute: `packages/core/src/agents/local-invocation.ts:277-283` creates and
   runs `LocalAgentExecutor`.

### Remote Agent Invocation

1. Entry: `packages/core/src/agents/remote-invocation.ts:129-135` bypasses local
   executor.
2. Auth: `packages/core/src/agents/remote-invocation.ts:161-169` retrieves or
   creates an authentication handler.
3. Stream: `packages/core/src/agents/remote-invocation.ts:173-181` sends the
   message stream via `A2AClientManager`.

## 3. Key Files and Citations

| Path                                              | Role            | Notes                                         |
| ------------------------------------------------- | --------------- | --------------------------------------------- |
| `packages/cli/src/ui/AppContainer.tsx`            | mode selection  | Branches between agent and legacy streams     |
| `packages/core/src/agent/legacy-agent-session.ts` | session adapter | Adapts Gemini client to AgentProtocol         |
| `packages/core/src/agents/registry.ts`            | agent registry  | Discovers and registers all agent definitions |
| `packages/core/src/agents/local-invocation.ts`    | local executor  | Runs local subagents                          |
| `packages/core/src/agents/remote-invocation.ts`   | remote executor | Proxies to A2A agents                         |
| `packages/core/src/agents/agent-scheduler.ts`     | scheduler       | Provides isolated tool registries for agents  |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-03.1** — The system supports two primary interactive stream modes: legacy
  Gemini stream and the new AgentProtocol-backed stream.
  - Primary: `packages/cli/src/ui/AppContainer.tsx:1180-1196`
  - Confidence: high
- **VT-03.2** — `LegacyAgentSession` adapts the existing Gemini client and
  scheduler loop to the `AgentProtocol` interface using an event translator.
  - Primary: `packages/core/src/agent/legacy-agent-session.ts:8-10`
  - Supporting: `packages/core/src/agent/legacy-agent-session.test.ts:9` (test)
  - Confidence: high
- **VT-03.3** — `AgentRegistry` discovers and loads built-in, user-level,
  project-level, and extension-provided agents.
  - Primary: `packages/core/src/agents/registry.ts:117-263`
  - Supporting: `packages/core/src/agents/registry.test.ts:109-120` (test)
  - Confidence: high
- **VT-03.4** — `LocalSubagentInvocation` executes local agents using
  `LocalAgentExecutor` and bridges their streaming activity to the tool's
  output.
  - Primary: `packages/core/src/agents/local-invocation.ts:40-49`
  - Supporting: `packages/core/src/agents/local-invocation.test.ts:25-33` (test)
  - Confidence: high
- **VT-03.5** — `RemoteAgentInvocation` bypasses the local executor loop and
  directly invokes remote A2A agents via `A2AClientManager`.
  - Primary: `packages/core/src/agents/remote-invocation.ts:35-40`
  - Supporting: `packages/core/src/agents/remote-invocation.test.ts:17` (test)
  - Confidence: high
- **VT-03.6** — Agent scheduling uses a subagent-specific context, including
  isolated `ToolRegistry` and `PromptRegistry` instances.
  - Primary: `packages/core/src/agents/agent-scheduler.ts:67-76`
  - Supporting: `packages/core/src/agents/agent-scheduler.test.ts:84` (test)
  - Confidence: high

## 5. Risks and Open Questions

**Risks**

- **R-03.1** — `LegacyAgentSession` is a temporary adapter that may diverge from
  the pure `AgentProtocol` semantics over time. Severity: medium. Mitigating
  test: `packages/core/src/agent/legacy-agent-session.test.ts:9`. Suggested
  guard: Ensure all new session features are tested against both
  implementations.
- **R-03.2** — Remote invocation relies on network stability and A2A auth, which
  can fail mid-stream. Severity: medium. Mitigating test:
  `packages/core/src/agents/remote-invocation.test.ts:17`. Suggested guard:
  Implement robust retry and fallback mechanisms for remote agents.
- **R-03.3** — Subagent tool registries are isolated, but resource contention
  might occur if multiple agents access the same underlying resources
  concurrently. Severity: low. Mitigating test:
  `packages/core/src/agents/local-executor.test.ts:3618`. Suggested guard:
  Monitor resource locks in subagent executions.

**Open questions**

- [ ] **OQ-03.1** — When will `LegacyAgentSession` be fully deprecated in favor
      of a native `AgentSession` implementation? Escalate to compartment 02.

## 6. Test and Observability Coverage

- **Tests**:
  - `packages/core/src/agent/legacy-agent-session.test.ts`: Verifies legacy
    session adapter behavior.
  - `packages/core/src/agents/registry.test.ts`: Validates agent discovery and
    registration.
  - `packages/core/src/agents/local-invocation.test.ts`: Tests local subagent
    execution and streaming.
  - `packages/core/src/agents/remote-invocation.test.ts`: Verifies A2A proxying
    for remote agents.
  - `packages/cli/src/nonInteractiveCliAgentSession.test.ts`: Tests the
    non-interactive agent loop.
- **Observability signals**:
  - `CoreEvent.AgentsDiscovered`: Emitted when new agents are found.
  - `CoreEvent.AgentsRefreshed`: Emitted after agent registry reload.
  - `MessageBusType.SUBAGENT_ACTIVITY`: Published during subagent execution for
    UI streaming.
- **Coverage gaps**:
  - `LegacyAgentSession` deprecation timeline (OQ-03.1).

## 7. Definition of Done

- [x] All active agent session paths are mapped.
- [x] Legacy/current differences are explicitly documented.
- [x] Registry, loader, scheduler, and invocation paths are analyzed.
- [x] Mode matrix is evidence-backed.
- [x] Agent-specific risk surfaces are enumerated.
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row flipped to `done`.

## 8. Handoffs

- **Depends on**: 02, 04
- **Affects**: 13
- **Escalated to**: 02 — LegacyAgentSession deprecation timeline.
