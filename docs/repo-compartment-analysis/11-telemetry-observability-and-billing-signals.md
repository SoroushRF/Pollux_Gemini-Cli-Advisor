# Compartment 11: Telemetry, Observability, and Billing Signals

## Purpose

Analyze how runtime behavior is observed and measured through traces, metrics,
logs, activity monitors, and billing-related events.

This compartment supports forensic debugging, operational confidence, and cost
analysis.

## Boundary

In scope:

- telemetry config and initialization,
- tracing and span metadata,
- metrics/logging/exporters,
- activity detection and billing events,
- local and cloud telemetry workflows.

Primary paths:

- `packages/core/src/telemetry`
- `packages/core/src/telemetry/trace.ts`
- `packages/core/src/telemetry/metrics.ts`
- `packages/core/src/telemetry/loggers.ts`
- `packages/core/src/telemetry/billingEvents.ts`
- `packages/core/src/telemetry/activity-monitor.ts`
- `scripts/telemetry.js`
- `scripts/telemetry_gcp.js`
- `docs/local-development.md`

Out of scope:

- business logic internals of turn/tool execution,
- policy decisions,
- CI pipeline behavior.

## Key Questions To Answer

1. What telemetry is emitted and from where?
2. How are traces and metrics configured by environment?
3. What fields are sanitized or redacted?
4. How are billing/activity signals generated and consumed?
5. Where are observability gaps for debugging incidents?

## Data Gathering Checklist

1. Inspect telemetry initialization/config modules.
2. Map span/metric/log APIs and callsites.
3. Inspect exporters (file/local/gcp).
4. Inspect sanitization and data handling constraints.
5. Verify with telemetry tests and local-development docs.

## Step-by-Step Analysis Recipe

### Step 1: Analyze telemetry bootstrapping

Read:

- `packages/core/src/telemetry/config.ts`
- `packages/core/src/telemetry/index.ts`
- `packages/core/src/telemetry/telemetry-utils.ts`

Capture:

- enable/disable behavior,
- environment-driven config,
- initialization order.

### Step 2: Analyze tracing model

Read:

- `packages/core/src/telemetry/trace.ts`
- `packages/core/src/telemetry/sdk.ts`
- callsite examples in core/tool modules.

Capture:

- span naming conventions,
- attribute strategy,
- error/exception recording behavior.

### Step 3: Analyze metrics and logging

Read:

- `packages/core/src/telemetry/metrics.ts`
- `packages/core/src/telemetry/loggers.ts`
- `packages/core/src/telemetry/file-exporters.ts`
- `packages/core/src/telemetry/gcp-exporters.ts`

Capture:

- metric dimensions,
- log transport paths,
- failure behavior when exporters are unavailable.

### Step 4: Analyze activity and billing signals

Read:

- `packages/core/src/telemetry/activity-detector.ts`
- `packages/core/src/telemetry/activity-monitor.ts`
- `packages/core/src/telemetry/billingEvents.ts`

Capture:

- event triggers,
- aggregation semantics,
- potential over/under counting risks.

### Step 5: Analyze sanitization and privacy controls

Read:

- `packages/core/src/telemetry/sanitize.ts`
- tests around sanitization and semantic payload handling.

Capture data handling guarantees and known limitations.

### Step 6: Verify operational workflows

Read:

- `docs/local-development.md`
- telemetry scripts under `scripts/telemetry*.js`

Capture:

- local trace inspection workflow,
- gcp workflow,
- troubleshooting entrypoints.

### Step 7: Validate with tests

Use:

- `packages/core/src/telemetry/*.test.ts`
- integration tests with telemetry assertions,
- CLI config tests related to telemetry settings.

### Step 8: Publish observability scorecard

Include:

- coverage strengths,
- weakly instrumented paths,
- recommended additions for high-risk compartments.

## What Good Output Looks Like

1. Telemetry architecture map (traces/metrics/logs).
2. Environment target matrix (local, collector, gcp).
3. Billing/activity signal behavior summary.
4. Sanitization and privacy controls summary.
5. Observability gap and improvement list.

## Do and Do Not

Do:

- confirm telemetry behavior in code and scripts,
- include sanitization behavior in all reporting,
- relate instrumentation to concrete runtime flows.

Do not:

- assume every important event is already instrumented,
- treat config docs as instrumentation proof,
- ignore exporter failure modes.

## Common Failure Modes While Analyzing

- Focusing only on trace spans and missing metrics/logs.
- Ignoring sanitization behavior and data handling constraints.
- Missing activity/billing event semantics.
- Not validating local and cloud workflows separately.

## Handoffs To Other Compartments

- Core runtime callsites -> `02-core-turn-engine.md`
- Routing/cost behavior -> `07-routing-availability-loop-and-pollux.md`
- Perf/memory instrumentation validation ->
  `14-testing-and-evaluation-architecture.md`

## Definition of Done

This compartment is complete when:

1. Trace/metric/log architecture is mapped.
2. Billing/activity signal pathways are documented.
3. Sanitization guarantees and limits are clear.
4. Operational telemetry workflows are validated.
5. Observability gaps are prioritized.
