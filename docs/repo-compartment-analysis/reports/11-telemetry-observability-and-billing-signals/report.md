# Compartment Report (Lite): 11 — Telemetry, Observability, and Billing Signals

## Metadata

- **Compartment**: 11 — Telemetry, Observability, and Billing Signals
- **Tier**: T2
- **Guideline file**: `11-telemetry-observability-and-billing-signals.md`
- **Owner**: gemini-3.1-pro
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: `c8127045c5832b0e66cb1efd04e0dd6800ce78e7`
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                 | Exists? | Notes (only if material)                                   |
| ---------------------------------------------------- | ------- | ---------------------------------------------------------- |
| `packages/core/src/telemetry`                        | yes     |                                                            |
| `packages/core/src/telemetry/trace.ts`               | yes     |                                                            |
| `packages/core/src/telemetry/metrics.ts`             | yes     |                                                            |
| `packages/core/src/telemetry/loggers.ts`             | yes     |                                                            |
| `packages/core/src/telemetry/billingEvents.ts`       | yes     |                                                            |
| `packages/core/src/telemetry/activity-monitor.ts`    | yes     |                                                            |
| `packages/core/src/telemetry/activity-detector.ts`   | yes     | session idle/active state for memory monitoring gate       |
| `packages/core/src/core/geminiChat.ts`               | yes     | per-chunk token capture at `:915-921`                      |
| `packages/core/src/services/chatRecordingService.ts` | yes     | persistent token sink: `recordMessageTokens` at `:486-515` |
| `scripts/telemetry.js`                               | yes     |                                                            |
| `scripts/telemetry_gcp.js`                           | yes     |                                                            |
| `docs/local-development.md`                          | yes     |                                                            |

## 1. Scope and Boundary

In scope: telemetry config and initialization, tracing and span metadata,
metrics/logging/exporters, activity detection and billing events, and local and
cloud telemetry workflows. Token capture is scoped here to assess the Pollux
"TurnLog" proposal against what is already captured.

Out of scope: business logic internals of turn/tool execution (02), policy
decisions (09), and CI pipeline behavior (15). Routing and cost behavior are
handed off to compartment 07. Performance and memory instrumentation validation
are handed off to compartment 14.

## 2. Runtime Flow Summary

1. Entry: `packages/core/src/telemetry/config.ts:49-123` resolves telemetry
   settings from argv, env, and settings.
2. Initialization: `packages/core/src/telemetry/sdk.ts:165-391` initializes
   OpenTelemetry SDK, exporters, and processors based on config.
3. Metrics Init: `packages/core/src/telemetry/metrics.ts:840-866` initializes
   core counters and histograms.
4. Tracing: `packages/core/src/telemetry/trace.ts:123-225` wraps operations in
   `runInDevTraceSpan`, setting attributes and handling async iterables.
5. Activity detection: `packages/core/src/telemetry/activity-detector.ts:10-70`
   tracks user idle/active state and exposes `isUserActive()`.
6. Activity monitoring: `packages/core/src/telemetry/activity-monitor.ts:73-94`
   starts global activity monitoring when performance monitoring is active.
7. Per-chunk token capture: `packages/core/src/core/geminiChat.ts:915-921`
   forwards each chunk's `usageMetadata` to
   `chatRecordingService.recordMessageTokens(...)`.
8. Persistent token record:
   `packages/core/src/services/chatRecordingService.ts:486-515` writes
   input/output/cached/thoughts/tool/total token counts onto the last gemini
   message in the conversation file.
9. Metric Recording: `packages/core/src/telemetry/metrics.ts:868-1788` records
   specific events (e.g., token usage, tool calls, routing).
10. Billing Events: `packages/core/src/telemetry/billingEvents.ts:27-256`
    defines specific billing events (overage, credit purchase, etc.) which are
    logged.
11. Shutdown: `packages/core/src/telemetry/sdk.ts:416-463` flushes exporters and
    shuts down the SDK on process exit.

## 3. Key Files and Citations

| Path                                                 | Role                  | Notes                                              |
| ---------------------------------------------------- | --------------------- | -------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                 | primary entrypoint    | Initializes OpenTelemetry SDK and exporters.       |
| `packages/core/src/telemetry/config.ts`              | config resolution     | Resolves telemetry settings from multiple sources. |
| `packages/core/src/telemetry/trace.ts`               | tracing model         | Manages spans and attribute truncation.            |
| `packages/core/src/telemetry/metrics.ts`             | metrics registry      | Defines and records all counters and histograms.   |
| `packages/core/src/telemetry/billingEvents.ts`       | billing signals       | Strongly typed billing telemetry events.           |
| `packages/core/src/telemetry/sanitize.ts`            | sanitization logic    | Sanitizes hook names and commands.                 |
| `packages/core/src/telemetry/activity-detector.ts`   | idle/active state     | Global detector used by `memory-monitor.ts`.       |
| `packages/core/src/services/chatRecordingService.ts` | persistent token sink | Canonical per-message token capture.               |
| `scripts/telemetry_gcp.js`                           | local GCP workflow    | Local collector script for GCP exporting.          |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-11.1** — Telemetry configuration is resolved via a strict precedence of
  argv, environment variables, and then `settings.json`.
  - Primary: `packages/core/src/telemetry/config.ts:49-123`
  - Confidence: high
- **VT-11.2** — OpenTelemetry SDK initialization supports multiple exporter
  targets including direct GCP, OTLP HTTP/gRPC, file, and console.
  - Primary: `packages/core/src/telemetry/sdk.ts:268-333`
  - Confidence: high
- **VT-11.3** — Tracing uses `runInDevTraceSpan` which automatically truncates
  large input/output payloads to 10,000 characters.
  - Primary: `packages/core/src/telemetry/trace.ts:55-78`
  - Confidence: high
- **VT-11.4** — Hook names are always sanitized before being recorded in metrics
  to prevent leaking sensitive paths or arguments.
  - Primary: `packages/core/src/telemetry/metrics.ts:1572-1578`
  - Supporting: `packages/core/src/telemetry/sanitize.ts:26-52`
  - Confidence: high
- **VT-11.5** — Billing events are strongly typed classes that serialize to both
  OpenTelemetry attributes and log bodies.
  - Primary: `packages/core/src/telemetry/billingEvents.ts:27-256`
  - Confidence: high
- **VT-11.6** — Activity monitoring buffers up to 100 recent events and triggers
  memory snapshots based on specific activity types.
  - Primary: `packages/core/src/telemetry/activity-monitor.ts:45-56`
  - Confidence: high
- **VT-11.7** — Telemetry initialization is deferred if CLI authentication is
  required but no credentials are provided yet.
  - Primary: `packages/core/src/telemetry/sdk.ts:194-212`
  - Confidence: high
- **VT-11.8** — Per-chunk token capture already exists: `GeminiChat` forwards
  each chunk's `usageMetadata` to
  `chatRecordingService.recordMessageTokens(...)`, which writes input, output,
  cached, thoughts, tool, and total token counts onto the last gemini message in
  the conversation file.
  - Primary: `packages/core/src/core/geminiChat.ts:915-921`
  - Supporting: `packages/core/src/services/chatRecordingService.ts:486-515`
    (other)
  - Confidence: high

**Contradictions or ambiguities**

- **C-11.1** — Pollux spec §8 "TurnLog" proposes a per-turn token logger as a
  new component. Forensic F-10 flags this as a duplicate of existing capture;
  VT-11.8 shows per-chunk usage is already persisted by
  `chatRecordingService.recordMessageTokens` via `GeminiChat`. A Pollux TurnLog
  should extend this sink, not replace it. Evidence:
  `packages/core/src/core/geminiChat.ts:915-921`,
  `packages/core/src/services/chatRecordingService.ts:486-515`. Resolution:
  deferred (escalate to compartment 16 for doc correction; to compartment 02 for
  TurnLog integration point).

## 5. Risks and Open Questions

**Risks**

- **R-11.1** — Telemetry buffer could lose events if the process crashes before
  `flushTelemetryBuffer` completes. Severity: low. Mitigating test: `no test`.
  Suggested guard: ensure critical events bypass buffer or flush synchronously.
- **R-11.2** — Memory monitoring snapshots triggered by activity events could
  cause performance degradation if `snapshotThrottleMs` is too low. Severity:
  medium. Mitigating test: `no test`. Suggested guard: enforce a hard lower
  bound on throttle interval.
- **R-11.3** — If a Pollux TurnLog writes to a parallel sink instead of
  `chatRecordingService`, per-turn totals will drift from the persisted
  conversation record and from `gemini_cli.token.usage` counters. Severity:
  medium. Mitigating test: `no test`. Suggested guard: route advisor-turn token
  deltas through `recordMessageTokens` (extended if needed) and assert the
  conversation-file totals match the metric export in an integration test.

**Open questions**

- [ ] **OQ-11.1** — How are performance and memory metrics validated for
      accuracy? Escalate to compartment 14.
- [ ] **OQ-11.2** — Should the Pollux advisor turn extend `chatRecordingService`
      with an `advisor` message type, or reuse `gemini` with a role tag?
      Escalate to compartment 02.

## 6. Test and Observability Coverage

- **Tests**:
  - `packages/core/src/telemetry/sdk.test.ts`: tests SDK initialization and
    exporter config.
  - `packages/core/src/telemetry/trace.test.ts`: tests span creation and
    attribute truncation.
  - `packages/core/src/telemetry/metrics.test.ts`: tests metric recording and
    sanitization.
  - `packages/core/src/telemetry/sanitize.test.ts`: tests hook name sanitization
    edge cases.
  - `packages/core/src/telemetry/activity-detector.test.ts`: tests the global
    activity detector.
  - `packages/core/src/telemetry/activity-monitor.test.ts`: tests activity
    monitor lifecycle and listeners.
  - `packages/core/src/services/chatRecordingService.test.ts`: tests
    `recordMessageTokens` and conversation persistence.
- **Observability signals**:
  - `gemini_cli.tool.call.count`: counts tool calls and success rate.
  - `gemini_cli.api.request.count`: counts API requests by model and status.
  - `gemini_cli.token.usage`: tracks token consumption.
  - `gemini_cli.overage_option_selected`: tracks billing overage decisions.
- **Coverage gaps**:
  - No tests found for activity monitor memory snapshot throttling (R-11.2).
  - No integration test asserts `gemini_cli.token.usage` totals match
    conversation-file totals (R-11.3).

## 7. Definition of Done

- [x] Trace/metric/log architecture is mapped.
- [x] Billing/activity signal pathways are documented.
- [x] Sanitization guarantees and limits are clear.
- [x] Operational telemetry workflows are validated.
- [x] Observability gaps are prioritized.
- [x] Pre-flight path validation recorded in Section 0.
- [x] Sidecar populated at
      `reports/11-telemetry-observability-and-billing-signals/report.json`.
- [x] `INDEX.md` row flipped to `done`.

## 8. Handoffs

- **Depends on**: 02
- **Affects**: 07
- **Escalated to**: 14 — validate perf/memory metrics accuracy (OQ-11.1); 02 —
  TurnLog integration point (C-11.1, OQ-11.2); 16 — doc correction for Pollux
  spec §8 duplicate token logger (C-11.1).
