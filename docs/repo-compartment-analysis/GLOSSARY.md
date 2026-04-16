# Glossary

Canonical definitions for terms that recur across compartment reports. When a
report uses any of these terms, it may link here instead of re-defining them.
Update here first, not in compartment files.

Every term should cite at least one canonical code location where it is defined
or most clearly used.

---

## A

**ACP (Agent Client Protocol)** Command protocol used by external clients (e.g.,
IDE integrations) to drive the CLI. Handled in `packages/cli/src/acp/`. Distinct
from the direct CLI stream path.

**Advisor** Pollux-specific term. The secondary (typically Pro-tier) model
consulted on escalation. Not yet integrated into the turn pipeline at the time
these guidelines were written — see
`07-routing-availability-loop-and-pollux.md`.

## B

**BaseLlmClient** Low-level request layer wrapping model API calls, retries, and
network errors. Sits under `ContentGenerator`. See
`packages/core/src/core/baseLlmClient.ts`.

## C

**ContentGenerator** Adapter layer that prepares prompts and streams model
responses. Consumed by `GeminiChat` and ultimately `Turn`. See
`packages/core/src/core/contentGenerator.ts`.

**Compression (history compression)** Reduction of long conversation history
into a summary to stay under token limits. Triggered at a threshold during turn
setup. Distinct from context trimming by the caller.

## E

**Escalation (Pollux)** A decision to consult the advisor model during an
executor turn. Driven by one of three strategies: heuristic, structured, hybrid.

**Event (turn event)** A discrete unit emitted by `Turn.run()` — e.g., content,
thought, tool request, error, completion. Consumed by CLI stream hooks and SDK.

## G

**GeminiChat** Conversation state and history manager. Owns history compression
and usage metadata capture. Not the place to add new features — work through
`GeminiClient` instead.

**GeminiClient** High-level turn orchestrator. Constructs `Turn` objects, wires
routing and loop detection, and exposes the `processTurn`-style entrypoint.
Primary integration surface.

## H

**Headless / non-interactive mode** CLI runtime mode that does not render an
interactive UI. Entry: `packages/cli/src/nonInteractiveCli.ts`. Different
continuation semantics than interactive mode.

**Heuristic detector** Pollux escalation strategy based on observable failure
signals (loops, error-then-uncertainty, turn overflow). No extra API call.

**Hybrid detector** Pollux escalation strategy composing heuristic + structured.
Either signal triggers escalation.

## I

**Interactive mode** CLI runtime mode rendering a React-based terminal UI.
Entry: `packages/cli/src/interactiveCli.tsx`. Uses `useGeminiStream` and related
hooks for stream consumption.

**Interceptor (Pollux)** Planned orchestration layer that sits between
`GeminiClient` and the model call to trigger escalation. Not implemented at
guideline authoring time.

## L

**Loop detection** Service that identifies pathological repeat behavior in a
turn and may consult a utility model to decide on stop/recover. See
`packages/core/src/services/loopDetectionService.ts`.

## M

**MCP (Model Context Protocol)** External tool/server protocol allowing
third-party capabilities to be exposed as tools. Tool platform layer covers both
built-in tools and MCP tools.

**Model Router** Service that selects the model for a turn given config,
availability, and strategy. See
`packages/core/src/routing/modelRouterService.ts`.

## P

**Policy engine** Trust and safety decision layer. Gates tool execution and
sensitive operations. Under `packages/core/src/policy/`.

**Pollux** This project. Adaptive advisor layer that augments the single-model
turn pipeline with a second-tier model consulted on escalation.

**processTurn** Canonical turn entrypoint method (or equivalent) on
`GeminiClient`. Where routing decisions are consumed.

## R

**Routing strategy** Policy that maps a request + context to a model id.
Strategies live in `packages/core/src/routing/strategies/`.

## S

**Sandbox** Process isolation substrate for shell and filesystem operations. See
`packages/core/src/services/shellExecutionService.ts` and related.

**Skill** Reusable instruction pack loaded on demand. Discovered from local
filesystem. Scoped to extensibility, not core runtime.

**Stream hook** React hook in `packages/cli/src/ui/hooks/` that consumes core
events and updates UI state. `useGeminiStream` is the standard path.

**Structured detector** Pollux escalation strategy that injects a confidence tag
into Flash's output and parses it live. No extra API call, but reliability
depends on model tag compliance.

**Synthesis (cross-compartment)** Capstone report merging findings across all 16
compartments. See `_TEMPLATES/cross-compartment-synthesis.md`.

## T

**Tool** Callable capability with a schema and executor. Built-in tools live in
`packages/core/src/tools/`. External tools are MCP-backed.

**Tool call (tool request event)** Event emitted by the model during a turn
asking the runtime to execute a tool. Continuation after tool execution is
mode-specific.

**Turn** A single model generation cycle, including any in-turn tool execution.
Defined in `packages/core/src/core/turn.ts`.

## U

**useGeminiStream** Primary CLI stream hook. Consumer of turn events, dispatcher
of tool continuations. See `packages/cli/src/ui/hooks/useGeminiStream.ts`.

---

## Term Hygiene Rules

- Prefer **turn** over "request" when referring to a single generation cycle.
- Prefer **executor/advisor** over "Flash/Pro" in Pollux docs — models change,
  roles do not.
- Prefer **interactive / non-interactive** over "UI / headless" unless
  specifically talking about UI rendering.
- When using "stream", always specify: model stream, event stream, or output
  stream. Never ambiguous.
