# Compartment 08: Context, Memory, and Compression

## Purpose

Analyze how conversation/context data is shaped, compressed, summarized, masked,
and persisted to stay within token/quality constraints.

This compartment governs answer quality under long sessions and large codebase
inputs.

## Boundary

In scope:

- context compression and chat compression,
- tool output distillation and masking,
- truncation policies and profiles,
- memory services and memory tool integration,
- session summary behavior.

Primary paths:

- `packages/core/src/context`
- `packages/core/src/context/contextCompressionService.ts`
- `packages/core/src/context/chatCompressionService.ts`
- `packages/core/src/context/toolDistillationService.ts`
- `packages/core/src/context/toolOutputMaskingService.ts`
- `packages/core/src/context/truncation.ts`
- `packages/core/src/services/sessionSummaryService.ts`
- `packages/core/src/services/memoryService.ts`
- `packages/core/src/tools/memoryTool.ts`

Out of scope:

- policy persistence rules,
- telemetry exporter internals,
- full CLI presentation logic.

## Key Questions To Answer

1. How and when is context compressed or summarized?
2. What information is masked or distilled before model calls?
3. How are token and truncation constraints enforced?
4. How does memory persistence interact with context construction?
5. What quality risks are introduced by compression/distillation?

## Data Gathering Checklist

1. Read context services and profile definitions.
2. Trace call sites from core client into context services.
3. Inspect tool output masking/distillation logic.
4. Analyze memory service and memory tool behavior.
5. Verify with context and memory tests.

## Step-by-Step Analysis Recipe

### Step 1: Map context service architecture

Read:

- `packages/core/src/context/types.ts`
- `packages/core/src/context/profiles.ts`
- `packages/core/src/context/agentHistoryProvider.ts`

Capture:

- available context profiles,
- expected inputs/outputs,
- service composition.

### Step 2: Analyze compression services

Read:

- `packages/core/src/context/contextCompressionService.ts`
- `packages/core/src/context/chatCompressionService.ts`

Capture:

- trigger conditions,
- algorithm behavior,
- failure/fallback semantics.

### Step 3: Analyze truncation and token pressure handling

Read:

- `packages/core/src/context/truncation.ts`
- `packages/core/src/core/tokenLimits.ts`

Capture:

- truncation thresholds,
- ordering of truncation operations,
- deterministic vs adaptive behaviors.

### Step 4: Analyze tool output shaping

Read:

- `packages/core/src/context/toolDistillationService.ts`
- `packages/core/src/context/toolOutputMaskingService.ts`

Capture:

- what is removed or condensed,
- safety/privacy implications,
- effects on downstream model reasoning.

### Step 5: Analyze memory pathways

Read:

- `packages/core/src/services/memoryService.ts`
- `packages/core/src/tools/memoryTool.ts`
- `packages/core/src/context/memoryContextManager.ts`

Capture:

- memory read/write lifecycle,
- compartment scope behavior,
- lifecycle and retention boundaries.

### Step 6: Verify with tests

Use:

- `packages/core/src/context/*.test.ts`
- `packages/core/src/services/memoryService.test.ts`
- `packages/core/src/tools/memoryTool.test.ts`
- memory regression tests in `memory-tests`.

### Step 7: Build quality-risk matrix

Classify risks for:

- over-truncation,
- stale summaries,
- lost tool evidence,
- memory drift.

### Step 8: Publish tuning guidance

Document which knobs can be tuned safely and which require broader validation.

## What Good Output Looks Like

1. Context assembly and compression pipeline map.
2. Truncation policy summary with constraints.
3. Memory lifecycle and scope model.
4. Distillation/masking impact analysis.
5. Risk matrix plus verification guidance.

## Do and Do Not

Do:

- distinguish compression from masking from memory persistence,
- include token-limit and truncation interactions,
- validate long-session behavior with memory/perf tests.

Do not:

- treat memory tools as the entire memory system,
- assume compression is always lossless,
- ignore edge cases where summaries become stale.

## Common Failure Modes While Analyzing

- Mixing memory persistence and context compression concerns.
- Missing tool-output shaping effects on model behavior.
- Skipping truncation logic while discussing token budgets.
- Ignoring regression tests for memory growth.

## Handoffs To Other Compartments

- Core event timing -> `02-core-turn-engine.md`
- Telemetry impact and metrics ->
  `11-telemetry-observability-and-billing-signals.md`
- Memory regression suite -> `14-testing-and-evaluation-architecture.md`

## Definition of Done

This compartment is complete when:

1. Context construction pipeline is fully mapped.
2. Compression/truncation/masking logic is documented distinctly.
3. Memory lifecycle and scope semantics are evidence-backed.
4. Quality-risk matrix is published.
5. Tuning and validation guidance is actionable.
