# P3-06: Telemetry Reconciliation Test Report

Version: 1.0 Date: 2026-04-18 Status: Verified — all reconciliation tests green
TG mapping: TG-4 (telemetry reconciliation under escalation load)

---

## 1) Purpose

This report documents the verification that `LlmRole.UTILITY_ADVISOR` tagged API
events are correctly reconciled across all telemetry sinks when Pollux
escalation is active. It satisfies the P3-06 deliverable from the
IMPLEMENTATION_PLAN Phase 3.

References:

- POLLUX_SPEC §9 (LlmRole.UTILITY_ADVISOR tagging)
- IMPLEMENTATION_PLAN P3-06 task definition
- `packages/core/src/pollux/telemetryReconciliation.test.ts` (test source)

---

## 2) Reconciliation Surface

The Pollux advisor integration touches the telemetry pipeline at three layers:

### 2.1 Event Construction

`ApiResponseEvent` and `ApiErrorEvent` both accept an optional `role?: LlmRole`
parameter. When the advisor is consulted via `client.ts`, the call passes
`LlmRole.UTILITY_ADVISOR` which flows through:

```
client.generateContent(..., LlmRole.UTILITY_ADVISOR)
  → LoggingContentGenerator.generateContent(req, promptId, role)
    → LoggingContentGenerator._logApiResponse(..., role)
      → new ApiResponseEvent(..., role)
        → logApiResponse(config, event)
```

### 2.2 UiTelemetryService Aggregation

The `UiTelemetryService` dispatches events through `processApiResponse` and
`processApiError`, which:

1. **Model-level aggregation**: Always increments `models[model].api.*` and
   `models[model].tokens.*` regardless of role.
2. **Role-level aggregation**: When `event.role` is set, creates/increments
   `models[model].roles[role].*` with per-role request counts, error counts,
   latency, and token breakdowns.

### 2.3 Log Record Attributes

Both `ApiResponseEvent.toLogRecord()` and `ApiErrorEvent.toLogRecord()`
conditionally include `attributes['role'] = this.role` when the role is set.
This ensures OTel log records and Clearcut events carry the advisor tag for
downstream filtering.

---

## 3) Test Coverage

The reconciliation test suite (`telemetryReconciliation.test.ts`) contains 25
tests organized into 9 describe blocks:

| Category                         | Tests | What is verified                                                             |
| -------------------------------- | ----- | ---------------------------------------------------------------------------- |
| Single advisor response          | 4     | Role metrics creation, token attribution, API stats, model-level aggregation |
| Advisor error attribution        | 2     | Error counted under UTILITY_ADVISOR role, no executor contamination          |
| Cross-role isolation             | 3     | Separate models, shared model multi-role, undefined role behavior            |
| Multi-escalation stress (N=50)   | 3     | 50 responses, 50 interleaved, 50 mixed success/error                         |
| Latency aggregation              | 1     | Per-role latency accumulation                                                |
| Clear/reset behavior             | 2     | Metrics zeroed after clear(), fresh accumulation                             |
| Update event emission            | 2     | EventEmitter fires for advisor response and error                            |
| Token accounting invariants      | 3     | Single-role total match, input=prompt-cached, multi-role sum                 |
| Event role attribute propagation | 4     | ApiResponseEvent.role, ApiErrorEvent.role constructor behavior               |
| Determinism                      | 1     | Identical event sequences produce identical metrics                          |

---

## 4) Key Invariants Verified

### 4.1 No cross-role contamination

When executor (MAIN) and advisor (UTILITY_ADVISOR) events are emitted on
different models, the advisor's tokens, errors, and latency never appear in the
executor's model metrics, and vice versa.

### 4.2 Shared model isolation

When both roles use the same model (e.g., `gemini-2.5-pro`), model-level totals
are the sum of all role totals, and each role's metrics are independently
tracked.

### 4.3 Token accounting identity

For any model used exclusively by one role:

- `roleMetrics.tokens.total === modelMetrics.tokens.total`
- `roleMetrics.tokens.input === roleMetrics.tokens.prompt - roleMetrics.tokens.cached`

For multi-role models:

- `Σ roleMetrics[r].tokens.total === modelMetrics.tokens.total`

### 4.4 Stress tolerance

50 interleaved executor + advisor calls maintain exact counts with zero drift.
Mixed success/error sequences correctly separate error and token accounting.

### 4.5 Clear safety

After `service.clear()`, all advisor role metrics are removed. New events after
clear start from zero with no residual state.

---

## 5) Reconciliation Gaps and Mitigations

### 5.1 OpenTelemetry metrics layer

The `metrics.ts` module records `apiRequestCounter`, `tokenUsageCounter`, and
`apiRequestLatencyHistogram` without a role attribute dimension. This means OTel
metric backends cannot currently filter advisor-specific request counts or token
usage.

**Mitigation**: The `logApiResponse`/`logApiError` log records DO include the
role attribute, so log-based dashboards can filter by `role=utility_advisor`.
Adding a `role` dimension to OTel counters is a future enhancement (post-Phase
3).

### 5.2 Billing events

The `billingEvents.ts` module (CreditsUsedEvent, etc.) does not carry a role
field. Advisor API calls that consume credits are attributed to the model but
not distinguished from executor calls in billing metrics.

**Mitigation**: Since the advisor model is typically a different model than the
executor, credit attribution is implicitly separated by model name. If both
roles share a model, credit attribution would need a role dimension on
`CreditsUsedEvent` (future work).

---

## 6) File References

| File                                                       | Purpose                                          |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `packages/core/src/pollux/telemetryReconciliation.test.ts` | TG-4 reconciliation tests                        |
| `packages/core/src/telemetry/uiTelemetry.ts`               | Role-based metrics aggregation                   |
| `packages/core/src/telemetry/types.ts`                     | ApiResponseEvent / ApiErrorEvent with role field |
| `packages/core/src/telemetry/loggers.ts`                   | Logger dispatch pipeline                         |
| `packages/core/src/telemetry/llmRole.ts`                   | LlmRole.UTILITY_ADVISOR enum                     |
| `packages/core/src/core/client.ts`                         | Advisor call site (line 723)                     |
| `packages/core/src/core/loggingContentGenerator.ts`        | Role propagation through telemetry               |

---

## 7) Phase 3 Exit Criteria Contribution

This report satisfies P3-06:

- ✅ Telemetry reconciliation verified under escalation load (N=50 stress).
- ✅ TG-4 test assertions are green.
- ✅ Cross-role isolation confirmed.
- ✅ Token accounting invariants proven.
- ✅ Known gaps documented with mitigations.

P3-06 is the last of the original Phase 3 task list (P3-01..P3-06) to land.
Phase 3 is closed in conjunction with P3-07 (detector wired into the runtime
seam in `client.ts`), which removes the dead-code risk of having the detectors
implemented in P3-01..P3-03 without any runtime gate, and re-uses the telemetry
attribution invariants documented here for every advisor call that the detector
gate now actually authorizes.
