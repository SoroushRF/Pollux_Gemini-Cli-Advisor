# Compartment 07: Routing, Availability, Loop Controls, and Pollux

## Purpose

Analyze how model selection and fallback decisions are made, how loop detection
interacts with runtime behavior, and how Pollux fits (currently scaffolded) into
this decision space.

This is the core compartment for cost/latency/accuracy trade-off analysis.

## Boundary

In scope:

- model router service and routing strategies,
- model availability/fallback behavior,
- loop detection triggers and utility-model checks,
- routing-related config and precedence,
- Pollux scaffold status and integration readiness.

Primary paths:

- `packages/core/src/routing`
- `packages/core/src/routing/modelRouterService.ts`
- `packages/core/src/routing/routingStrategy.ts`
- `packages/core/src/routing/strategies`
- `packages/core/src/availability`
- `packages/core/src/services/loopDetectionService.ts`
- `packages/core/src/config/models.ts`
- `packages/core/src/config/defaultModelConfigs.ts`
- `packages/core/src/pollux/index.ts`
- `packages/core/src/pollux/benchmark`

Out of scope:

- full turn event lifecycle,
- CLI rendering details,
- benchmark test framework internals.

## Key Questions To Answer

1. Where are routing decisions made and consumed?
2. What fallback/availability logic is active today?
3. How can loop detection add additional model calls?
4. Which claims about single-model behavior are outdated?
5. What Pollux components are implemented vs scaffold-only?

## Data Gathering Checklist

1. Trace router call path from core client into routing service.
2. Analyze routing strategy interface and concrete strategies.
3. Inspect availability service and policy decisions.
4. Inspect loop detection thresholds and utility model usage.
5. Verify Pollux directory contents and exports.
6. Validate documentation claims against runtime code.

## Step-by-Step Analysis Recipe

### Step 1: Trace routing consumption in core client

Read:

- `packages/core/src/core/client.ts`
- `packages/core/src/routing/modelRouterService.ts`

Capture:

- decision request timing,
- selected model propagation,
- fallback behavior entry points.

### Step 2: Analyze routing strategy model

Read:

- `packages/core/src/routing/routingStrategy.ts`
- `packages/core/src/routing/strategies/*`

Capture:

- strategy contract,
- policy decision dimensions,
- override and extensibility behavior.

### Step 3: Analyze model availability semantics

Read:

- `packages/core/src/availability/*`
- model routing docs under `docs/cli/model-routing.md`

Capture:

- availability state transitions,
- user-prompted vs silent fallback behavior,
- utility fallback chains.

### Step 4: Analyze loop detection interactions

Read:

- `packages/core/src/services/loopDetectionService.ts`

Capture:

- hard thresholds,
- utility model consultation points,
- emitted events and stop/recovery behavior.

### Step 5: Verify model registry constants and defaults

Read:

- `packages/core/src/config/models.ts`
- `packages/core/src/config/defaultModelConfigs.ts`

Capture:

- supported model IDs,
- default model behaviors,
- compatibility and constraints.

### Step 6: Audit Pollux implementation status

Read:

- `packages/core/src/pollux/index.ts`
- list `packages/core/src/pollux/benchmark`

Capture:

- what exists,
- what is exported,
- what is still planned only.

### Step 7: Build truth table for routing behavior

Document:

- explicit model via flags/env/settings,
- router-selected model,
- fallback behavior under failure,
- loop detection side effects.

### Step 8: Publish benchmark fairness notes

Include controls required to isolate experimental features from existing routing
and loop-check behavior.

## What Good Output Looks Like

1. Routing decision flow map.
2. Availability and fallback behavior summary.
3. Loop detection interaction summary.
4. Pollux maturity status (implemented vs not implemented).
5. Benchmark control recommendations.

## Do and Do Not

Do:

- verify runtime routing in code before citing docs,
- include loop-detection side effects in cost/latency analysis,
- clearly label Pollux scaffold vs runtime integration.

Do not:

- assume single-model baseline without current code evidence,
- treat planned Pollux modules as implemented,
- ignore silent utility-model fallback paths.

## Common Failure Modes While Analyzing

- Reading only docs and missing current router behavior.
- Ignoring loop detection utility checks during benchmark planning.
- Treating Pollux design documents as implementation status.
- Reporting model support without checking registry constants.

## Handoffs To Other Compartments

- Config precedence -> `06-settings-schema-and-config-plumbing.md`
- Core turn integration -> `02-core-turn-engine.md`
- Benchmark harness implementation ->
  `14-testing-and-evaluation-architecture.md`

## Definition of Done

This compartment is complete when:

1. Routing and fallback flow is evidence-backed.
2. Loop detection interactions are documented.
3. Model registry and default behavior are verified.
4. Pollux implementation status is accurately classified.
5. Benchmark control guidance is explicit and actionable.
