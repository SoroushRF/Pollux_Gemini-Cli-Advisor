# Compartment 02: Core Turn Engine

## Purpose

Analyze the core execution spine that transforms a request into streamed events,
model/tool interactions, and turn completion behavior.

This is the highest-value runtime compartment because nearly every product
surface (CLI, SDK, A2A, VS Code integration) depends on this path.

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/02-core-turn-engine/report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/02-core-turn-engine/report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Tier / Template**: **T1** — `_TEMPLATES/report-template.md` (400–900 md
  lines, 5–15 code quotes). See `AGENT_RUNBOOK.md` §2.
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 02 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- client turn orchestration,
- turn event generation,
- content generator chain behavior,
- request/retry and turn lifecycle semantics,
- token/usage capture in the core stream layer.

Primary paths:

- `packages/core/src/core/client.ts`
- `packages/core/src/core/turn.ts`
- `packages/core/src/core/contentGenerator.ts`
- `packages/core/src/core/geminiChat.ts`
- `packages/core/src/core/baseLlmClient.ts`
- `packages/core/src/core/tokenLimits.ts`

Out of scope (handoff):

- CLI stream rendering (`packages/cli/src/ui/hooks`),
- full tool implementation details (`packages/core/src/tools`),
- policy decision internals (`packages/core/src/policy`).

## Key Questions To Answer

1. What is the exact turn lifecycle from request entry to terminal event?
2. Where are model routing decisions consumed during turn execution?
3. How are tool calls surfaced and resumed in the core stream?
4. What error and retry behavior exists at core level?
5. Where is token usage captured and exposed?

## Data Gathering Checklist

1. Locate turn entrypoint in `client.ts`.
2. Follow construction and execution of turn objects.
3. Trace emitted event types in `turn.ts`.
4. Track integration points to model router, loop detection, and services.
5. Identify where token metadata is attached/recorded.
6. Verify with `client.test.ts`, `turn.test.ts`, `geminiChat.test.ts`.

## Search Commands

```bash
rg -n "class GeminiClient|processTurn|runTurn|submitQuery" packages/core/src/core
rg -n "class Turn|Turn\.run|emit\(|ServerGeminiEventType" packages/core/src/core
rg -n "ContentGenerator|generateContent|generateContentStream" packages/core/src/core
rg -n "class GeminiChat|addHistory|compressHistory|usageMetadata" packages/core/src/core
rg -n "baseLlmClient|retry|network" packages/core/src/core
rg --files packages/core/src/core
rg --files -g "*.test.ts" packages/core/src/core
```

PowerShell fallback:

```powershell
Select-String -Path "packages/core/src/core/**/*.ts" -Pattern "class GeminiClient|class Turn|processTurn|generateContentStream|usageMetadata"
```

## Step-by-Step Analysis Recipe

### Step 1: Identify turn entry and high-level orchestration

Read:

- `packages/core/src/core/client.ts`

Capture:

- request ingress,
- `processTurn`-style orchestration boundary,
- turn construction and stream invocation points.

### Step 2: Enumerate event model

Read:

- `packages/core/src/core/turn.ts`

Capture:

- event types and semantics,
- generator ordering,
- where errors and tool requests are emitted.

### Step 3: Trace model request layer

Read:

- `packages/core/src/core/contentGenerator.ts`
- `packages/core/src/core/geminiChat.ts`
- `packages/core/src/core/baseLlmClient.ts`

Capture:

- how prompts/history are prepared,
- how streamed model chunks are transformed,
- retry/network handling layers.

### Step 4: Identify service integrations

From `client.ts`, trace calls into:

- routing service,
- loop detection service,
- sandbox/file/shell services,
- chat recording/service hooks.

Capture which integrations are synchronous gates vs best-effort side channels.

### Step 5: Analyze token and usage accounting

Read:

- `packages/core/src/core/geminiChat.ts`
- `packages/core/src/services/chatRecordingService.ts`

Capture:

- source of usage metadata,
- where attribution can be extended,
- current persistence behavior.

### Step 6: Verify lifecycle guarantees with tests

Correlate with:

- `packages/core/src/core/client.test.ts`
- `packages/core/src/core/turn.test.ts`
- `packages/core/src/core/geminiChat.test.ts`
- `packages/core/src/core/geminiChat_network_retry.test.ts`

### Step 7: Build a timeline diagram (recommended)

Create an explicit timeline:

1. request accepted,
2. routing/selection,
3. turn starts,
4. model stream events,
5. tool request emission,
6. continuation integration,
7. finalization and recording.

### Step 8: Report risk surfaces

Highlight:

- event ordering fragility,
- retry/idempotency risks,
- coupling to external services,
- divergence between intended and observed behavior.

## What Good Output Looks Like

Include:

1. Precise turn state machine summary.
2. Event taxonomy and ordering constraints.
3. Integration points to routing/loop detection/tools.
4. Error and retry semantics.
5. Token capture reality and extension points.

## Do and Do Not

Do:

- anchor claims to concrete `client.ts` and `turn.ts` paths,
- separate invariant behavior from mode-specific behavior,
- verify with tests before calling guarantees "stable".

Do not:

- infer stream guarantees from CLI behavior alone,
- mix tool execution details into core lifecycle narrative,
- claim no-op changes without checking emitted event order.

## Common Failure Modes While Analyzing

- Skipping `turn.ts` and relying only on `client.ts`.
- Missing side-service effects in the lifecycle summary.
- Failing to distinguish recoverable vs terminal failures.
- Ignoring token metadata path when discussing telemetry/cost.

## Handoffs To Other Compartments

- CLI rendering and continuation -> `01-cli-runtime-surface.md`
- Routing specifics -> `07-routing-availability-loop-and-pollux.md`
- Tool internals -> `04-tools-and-mcp-platform.md`
- Telemetry details -> `11-telemetry-observability-and-billing-signals.md`

### Boundary with 07 (Routing)

Compartment 02 owns the **turn lifecycle** and **where** model selection is
consumed. Compartment 07 owns **how** the model is selected (router, strategies,
availability, fallback). If a claim is about "what happens when routing returns
X", that belongs in 07; if it is about "where the selected model is applied to a
turn", that belongs in 02. Cite the other compartment when crossing this line,
do not duplicate.

### Boundary with 11 (Telemetry)

Compartment 02 cites where `usageMetadata` and turn-level spans are produced;
compartment 11 owns the telemetry architecture that consumes, samples, and
exports them. Token capture origin = 02. Exporter and sanitization = 11.

## Definition of Done

- [ ] Turn lifecycle is fully mapped from entry to completion.
- [ ] Event model and ordering are documented with evidence.
- [ ] Integrations to routing/tools/loop detection are explicit.
- [ ] Retry and failure semantics are verified in code/tests.
- [ ] Token usage path is documented with extension implications.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 02 flipped to `done`.
