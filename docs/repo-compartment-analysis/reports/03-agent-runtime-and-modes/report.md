# Compartment Report (Lite): 03 — Agent Runtime and Modes

## Metadata

- **Compartment**: 03 — Agent Runtime and Modes
- **Tier**: T2
- **Guideline file**: `03-agent-runtime-and-modes.md`
- **Owner**: gemini-3.1-pro
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: `c8127045c5832b0e66cb1efd04e0dd6800ce78e7`
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                     | Exists? | Notes (only if material)                        |
| -------------------------------------------------------- | ------- | ----------------------------------------------- |
| `packages/core/src/agent`                                | yes     |                                                 |
| `packages/core/src/agents`                               | yes     |                                                 |
| `packages/cli/src/nonInteractiveCliAgentSession.ts`      | yes     |                                                 |
| `packages/cli/src/nonInteractiveCliAgentSession.test.ts` | yes     |                                                 |
| `packages/cli/src/ui/hooks/useAgentStream.ts`            | yes     |                                                 |
| `packages/cli/src/ui/AppContainer.tsx`                   | yes     | interactive mode selector lives at `:1178-1216` |
| `packages/cli/src/nonInteractiveCli.ts`                  | yes     | non-interactive selector at `:62-65`            |
| `packages/core/src/agent/legacy-agent-session.ts`        | yes     | adapter used by both agent-session drivers      |

## 1. Scope and Boundary

In scope: agent orchestration behavior, session implementations, agent-type
dispatch, scheduling, local/remote invocation, and mode-dependent branching.
Explains how the system moves beyond a single chat loop into specialized and
delegated agent behavior.

Out of scope (handed off): generic turn internals (02), non-agent tool internals
(04), CLI command parsing details (01), A2A/SDK/VS Code integration products
(13).

## 2. Runtime Flow Summary

### Interactive Mode Selection

1. Entry: `packages/cli/src/ui/AppContainer.tsx:1178-1184` constructs
   `streamAgent` as a `LegacyAgentProtocol` iff
   `config.getAgentSessionInteractiveEnabled()` is true.
2. Dispatch: `packages/cli/src/ui/AppContainer.tsx:1186-1216` calls
   `useAgentStream` when `streamAgent` is defined, else `useGeminiStream`;
   `rules-of-hooks` is disabled at this site.
3. Agent-session stream: `packages/cli/src/ui/hooks/useAgentStream.ts:82-136`
   subscribes to `AgentEvent` from `LegacyAgentProtocol`.

### Non-interactive Mode Selection

1. Entry: `packages/cli/src/nonInteractiveCli.ts:62-65` branches to
   `runNonInteractiveAgentSession` when
   `config.getAgentSessionNoninteractiveEnabled()` is true.
2. Agent-session driver:
   `packages/cli/src/nonInteractiveCliAgentSession.ts:290-416` instantiates
   `LegacyAgentSession.send(...)` and iterates `session.stream(...)`.

### Agent Registration and Loading

1. Entry: `packages/core/src/agents/registry.ts:60-70` initializes the registry.
2. Built-in: `packages/core/src/agents/registry.ts:265-304` registers built-in
   agents (CodebaseInvestigator, Generalist, Browser, MemoryManager).
3. User/Project: `packages/core/src/agents/registry.ts:130-234` loads agents
   from user and project directories.
4. Extensions: `packages/core/src/agents/registry.ts:236-256` loads agents from
   active extensions.

### Subagent Invocation

1. Local: `packages/core/src/agents/local-invocation.ts:108-111` executes the
   subagent and `:277-283` drives `LocalAgentExecutor`.
2. Remote: `packages/core/src/agents/remote-invocation.ts:129-181` bypasses the
   local executor and proxies to A2A via `A2AClientManager`.
3. Isolation: `packages/core/src/agents/agent-scheduler.ts:67-76` hands each
   subagent a fresh `ToolRegistry` + `PromptRegistry`.

## 3. Key Files and Citations

| Path                                                | Role                          | Notes                                            |
| --------------------------------------------------- | ----------------------------- | ------------------------------------------------ |
| `packages/cli/src/ui/AppContainer.tsx`              | interactive mode selector     | Branches between agent and legacy streams        |
| `packages/cli/src/nonInteractiveCli.ts`             | non-interactive mode selector | Branches to agent-session driver via config flag |
| `packages/cli/src/nonInteractiveCliAgentSession.ts` | non-interactive agent driver  | Drives `LegacyAgentSession` event loop           |
| `packages/core/src/agent/legacy-agent-session.ts`   | adapter                       | Adapts Gemini client to `AgentProtocol`          |
| `packages/core/src/agents/registry.ts`              | agent registry                | Discovers and registers all agent definitions    |
| `packages/core/src/agents/local-invocation.ts`      | local subagent executor       | Runs local subagents                             |
| `packages/core/src/agents/remote-invocation.ts`     | remote subagent executor      | Proxies to A2A agents                            |
| `packages/core/src/agents/agent-scheduler.ts`       | scheduler                     | Provides isolated tool registries for agents     |

## 4. Mode Matrix

The CLI has **four distinct turn drivers**; agent-session gating is orthogonal
to interactivity. Cross-reference with compartment 01 verified truths (tier-1).

| Driver                        | Trigger                                   | Entry                                                                     | Stream source                                        | Agent-session flag |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------ |
| Interactive legacy            | `!getAgentSessionInteractiveEnabled()`    | `AppContainer.tsx:1196-1216`                                              | `useGeminiStream` → `geminiClient.sendMessageStream` | off                |
| Interactive agent-session     | `getAgentSessionInteractiveEnabled()`     | `AppContainer.tsx:1186-1194`                                              | `useAgentStream` → `LegacyAgentProtocol`             | on                 |
| Non-interactive legacy        | `!getAgentSessionNoninteractiveEnabled()` | `nonInteractiveCli.ts:67-...`                                             | `geminiClient.sendMessageStream` loop                | off                |
| Non-interactive agent-session | `getAgentSessionNoninteractiveEnabled()`  | `nonInteractiveCli.ts:62-65` → `nonInteractiveCliAgentSession.ts:290-416` | `LegacyAgentSession.stream()`                        | on                 |

ACP is a fifth driver but it bypasses both `GeminiClient.sendMessageStream` and
`Turn` (see tier-1 `reports/01-cli-runtime-surface/report.md` §2.1 and
`reports/02-core-turn-engine/report.md`); it is handed off to compartment 01,
not re-verified here.

## 5. Verified Truths and Contradictions

**Verified truths**

- **VT-03.1** — The CLI has two interactive stream sources: legacy Gemini stream
  and the `AgentProtocol`-backed stream, selected by
  `getAgentSessionInteractiveEnabled()` at mount time.
  - Primary: `packages/cli/src/ui/AppContainer.tsx:1178-1216`
  - Confidence: high
- **VT-03.2** — The CLI has two non-interactive stream sources: legacy
  `runNonInteractive` and `runNonInteractiveAgentSession`, selected by
  `getAgentSessionNoninteractiveEnabled()` before the prompt loop starts.
  - Primary: `packages/cli/src/nonInteractiveCli.ts:62-65`
  - Supporting: `packages/cli/src/nonInteractiveCliAgentSession.ts:290-313`
    (other)
  - Confidence: high
- **VT-03.3** — `LegacyAgentSession` adapts the existing Gemini client and
  scheduler loop to the `AgentProtocol` interface using an event translator; the
  same adapter is used by both interactive and non-interactive agent-session
  drivers.
  - Primary: `packages/core/src/agent/legacy-agent-session.ts:8-10`
  - Supporting: `packages/core/src/agent/legacy-agent-session.test.ts:9` (test)
  - Confidence: high
- **VT-03.4** — `AgentRegistry` discovers and loads built-in, user-level,
  project-level, and extension-provided agents in that order.
  - Primary: `packages/core/src/agents/registry.ts:117-263`
  - Supporting: `packages/core/src/agents/registry.test.ts:109-120` (test)
  - Confidence: high
- **VT-03.5** — `LocalSubagentInvocation` executes local agents using
  `LocalAgentExecutor` and bridges their streaming activity to the tool's
  output.
  - Primary: `packages/core/src/agents/local-invocation.ts:40-49`
  - Supporting: `packages/core/src/agents/local-invocation.test.ts:25-33` (test)
  - Confidence: high
- **VT-03.6** — `RemoteAgentInvocation` bypasses the local executor loop and
  directly invokes remote A2A agents via `A2AClientManager`.
  - Primary: `packages/core/src/agents/remote-invocation.ts:35-40`
  - Supporting: `packages/core/src/agents/remote-invocation.test.ts:17` (test)
  - Confidence: high
- **VT-03.7** — Agent scheduling uses a subagent-specific context, including
  isolated `ToolRegistry` and `PromptRegistry` instances.
  - Primary: `packages/core/src/agents/agent-scheduler.ts:67-76`
  - Supporting: `packages/core/src/agents/agent-scheduler.test.ts:84` (test)
  - Confidence: high

**Contradictions or ambiguities**

- **C-03.1** — Pollux spec/forensic assume a single interceptor between
  `GeminiClient` and `Turn` is sufficient. Only two of the four drivers in the
  mode matrix (interactive legacy, non-interactive legacy) flow through
  `GeminiClient.sendMessageStream`; both agent-session drivers route through
  `LegacyAgentSession` + `LegacyAgentProtocol` and ACP bypasses the client
  entirely (handed off to 01/02). Evidence:
  `packages/cli/src/ui/AppContainer.tsx:1186-1194`,
  `packages/cli/src/nonInteractiveCli.ts:62-65`,
  `packages/core/src/agent/legacy-agent-session.ts:8-10`. Resolution: deferred
  (escalate to compartment 02 for interceptor placement).

## 6. Risks and Open Questions

**Risks**

- **R-03.1** — `LegacyAgentSession` is a temporary adapter and may diverge from
  pure `AgentProtocol` semantics over time; Pollux behavior parity across legacy
  vs agent-session drivers is not test-enforced. Severity: medium. Mitigating
  test: `packages/core/src/agent/legacy-agent-session.test.ts:9`. Suggested
  guard: assert every new Pollux event round-trips through both adapters.
- **R-03.2** — Remote invocation relies on network stability and A2A auth and
  can fail mid-stream. Severity: medium. Mitigating test:
  `packages/core/src/agents/remote-invocation.test.ts:17`. Suggested guard:
  retry/fallback path gated by `ModelAvailabilityService` snapshot.
- **R-03.3** — Subagent tool registries are isolated, but concurrent subagents
  against the same workspace resource can still contend. Severity: low.
  Mitigating test: `packages/core/src/agents/local-executor.test.ts:3618`.
  Suggested guard: workspace-level lock or per-tool serialization.
- **R-03.4** — `AppContainer.tsx:1186-1216` disables `rules-of-hooks` to switch
  between `useAgentStream` and `useGeminiStream`; if the flag flips mid-session
  React state corrupts. Severity: high for Pollux (feature-flag toggle is the
  canonical Pollux path). Mitigating test: `no test`. Suggested guard: forbid
  runtime flag changes and verify in CLI startup.

**Open questions**

- [ ] **OQ-03.1** — When will `LegacyAgentSession` be fully deprecated in favor
      of a native `AgentSession` implementation? Escalate to compartment 02.
- [ ] **OQ-03.2** — Does a Pollux interceptor attached at `GeminiClient` reach
      the agent-session drivers via `LegacyAgentSession`'s internal use of the
      client, or must it be re-attached per driver? Escalate to compartment 02.

## 7. Test and Observability Coverage

- **Tests**:
  - `packages/core/src/agent/legacy-agent-session.test.ts` (verifies legacy
    session adapter behavior)
  - `packages/core/src/agents/registry.test.ts` (validates agent discovery and
    registration)
  - `packages/core/src/agents/local-invocation.test.ts` (tests local subagent
    execution and streaming)
  - `packages/core/src/agents/remote-invocation.test.ts` (verifies A2A proxying
    for remote agents)
  - `packages/cli/src/nonInteractiveCliAgentSession.test.ts` (tests the
    non-interactive agent loop)
- **Observability signals**:
  - `CoreEvent.AgentsDiscovered` (emitted when new agents are found)
  - `CoreEvent.AgentsRefreshed` (emitted after agent registry reload)
  - `MessageBusType.SUBAGENT_ACTIVITY` (published during subagent execution for
    UI streaming)
- **Coverage gaps**:
  - No test asserts Pollux-event parity across the four drivers (R-03.1).
  - No test guards against mid-session flip of agent-session flag (R-03.4).

## 8. Definition of Done

- [x] All active agent session paths are mapped.
- [x] Legacy/current differences are explicitly documented.
- [x] Registry, loader, scheduler, and invocation paths are analyzed.
- [x] Mode matrix is evidence-backed (Section 4).
- [x] Agent-specific risk surfaces are enumerated.
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row flipped to `done`.

## 9. Handoffs

- **Depends on**: 01, 02, 04
- **Affects**: 11, 12, 13
- **Escalated to**: 02 — `LegacyAgentSession` deprecation timeline (OQ-03.1);
  interceptor placement across four drivers (C-03.1, OQ-03.2).
