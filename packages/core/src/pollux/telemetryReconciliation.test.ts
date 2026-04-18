/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P3-06: Telemetry reconciliation under escalation load.
 *
 * Verifies that LlmRole.UTILITY_ADVISOR tagged events flow correctly
 * through the telemetry pipeline: UiTelemetryService role-based
 * aggregation, log record role attribute inclusion, token accounting
 * isolation, error attribution, and multi-escalation stress invariants.
 *
 * TG mapping: TG-4 (telemetry reconciliation)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UiTelemetryService } from '../telemetry/uiTelemetry.js';
import {
  ApiResponseEvent,
  ApiErrorEvent,
  EVENT_API_RESPONSE,
  EVENT_API_ERROR,
  type GenAIUsageDetails,
} from '../telemetry/types.js';
import { LlmRole } from '../telemetry/llmRole.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADVISOR_MODEL = 'gemini-3.1-pro-advisor';
const EXECUTOR_MODEL = 'gemini-2.5-flash';

/** Create a minimal ApiResponseEvent-shaped UiEvent for the UI service. */
function fakeApiResponse(
  model: string,
  role: LlmRole | undefined,
  usage: Partial<GenAIUsageDetails> = {},
  durationMs = 100,
) {
  return {
    'event.name': EVENT_API_RESPONSE as typeof EVENT_API_RESPONSE,
    model,
    duration_ms: durationMs,
    role,
    usage: {
      input_token_count: usage.input_token_count ?? 10,
      output_token_count: usage.output_token_count ?? 20,
      total_token_count: usage.total_token_count ?? 30,
      cached_content_token_count: usage.cached_content_token_count ?? 0,
      thoughts_token_count: usage.thoughts_token_count ?? 0,
      tool_token_count: usage.tool_token_count ?? 0,
    },
  } as ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE };
}

/** Create a minimal ApiErrorEvent-shaped UiEvent for the UI service. */
function fakeApiError(
  model: string,
  role: LlmRole | undefined,
  durationMs = 50,
) {
  return {
    'event.name': EVENT_API_ERROR as typeof EVENT_API_ERROR,
    model,
    duration_ms: durationMs,
    error: 'Advisor timeout',
    role,
  } as unknown as ApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('P3-06 telemetry reconciliation: UTILITY_ADVISOR role', () => {
  let service: UiTelemetryService;

  beforeEach(() => {
    service = new UiTelemetryService();
  });

  // -------------------------------------------------------------------------
  // Single advisor response — role isolation
  // -------------------------------------------------------------------------

  describe('single advisor response', () => {
    it('creates role metrics under the correct model', () => {
      service.addEvent(fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR));

      const metrics = service.getMetrics();
      const modelMetrics = metrics.models[ADVISOR_MODEL];
      expect(modelMetrics).toBeDefined();
      expect(modelMetrics.roles[LlmRole.UTILITY_ADVISOR]).toBeDefined();
    });

    it('records correct token attribution in role metrics', () => {
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
          input_token_count: 15,
          output_token_count: 25,
          total_token_count: 40,
          cached_content_token_count: 5,
          thoughts_token_count: 3,
          tool_token_count: 2,
        }),
      );

      const roleMetrics =
        service.getMetrics().models[ADVISOR_MODEL].roles[
          LlmRole.UTILITY_ADVISOR
        ]!;

      expect(roleMetrics.tokens.prompt).toBe(15);
      expect(roleMetrics.tokens.candidates).toBe(25);
      expect(roleMetrics.tokens.total).toBe(40);
      expect(roleMetrics.tokens.cached).toBe(5);
      expect(roleMetrics.tokens.thoughts).toBe(3);
      expect(roleMetrics.tokens.tool).toBe(2);
      expect(roleMetrics.tokens.input).toBe(10); // 15 - 5 cached
    });

    it('records correct API stats in role metrics', () => {
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {}, 120),
      );

      const roleMetrics =
        service.getMetrics().models[ADVISOR_MODEL].roles[
          LlmRole.UTILITY_ADVISOR
        ]!;

      expect(roleMetrics.totalRequests).toBe(1);
      expect(roleMetrics.totalErrors).toBe(0);
      expect(roleMetrics.totalLatencyMs).toBe(120);
    });

    it('advisor tokens also aggregate into model-level totals', () => {
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
          input_token_count: 10,
          output_token_count: 20,
          total_token_count: 30,
        }),
      );

      const modelMetrics = service.getMetrics().models[ADVISOR_MODEL];
      expect(modelMetrics.tokens.total).toBe(30);
      expect(modelMetrics.api.totalRequests).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Advisor error — role-based error attribution
  // -------------------------------------------------------------------------

  describe('advisor error attribution', () => {
    it('records error under UTILITY_ADVISOR role', () => {
      service.addEvent(
        fakeApiError(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, 75),
      );

      const modelMetrics = service.getMetrics().models[ADVISOR_MODEL];
      expect(modelMetrics.api.totalRequests).toBe(1);
      expect(modelMetrics.api.totalErrors).toBe(1);
      expect(modelMetrics.api.totalLatencyMs).toBe(75);

      const roleMetrics = modelMetrics.roles[LlmRole.UTILITY_ADVISOR]!;
      expect(roleMetrics.totalRequests).toBe(1);
      expect(roleMetrics.totalErrors).toBe(1);
      expect(roleMetrics.totalLatencyMs).toBe(75);
    });

    it('advisor error does not contaminate executor role metrics', () => {
      service.addEvent(
        fakeApiResponse(EXECUTOR_MODEL, LlmRole.MAIN, {
          total_token_count: 100,
        }),
      );
      service.addEvent(fakeApiError(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR));

      const executorMetrics = service.getMetrics().models[EXECUTOR_MODEL];
      expect(executorMetrics.api.totalErrors).toBe(0);
      expect(executorMetrics.roles[LlmRole.UTILITY_ADVISOR]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Cross-role isolation: executor vs advisor on different models
  // -------------------------------------------------------------------------

  describe('cross-role isolation', () => {
    it('executor and advisor metrics are tracked on separate models', () => {
      service.addEvent(
        fakeApiResponse(EXECUTOR_MODEL, LlmRole.MAIN, {
          total_token_count: 100,
        }),
      );
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
          total_token_count: 40,
        }),
      );

      const metrics = service.getMetrics();
      expect(metrics.models[EXECUTOR_MODEL]).toBeDefined();
      expect(metrics.models[ADVISOR_MODEL]).toBeDefined();
      expect(metrics.models[EXECUTOR_MODEL].tokens.total).toBe(100);
      expect(metrics.models[ADVISOR_MODEL].tokens.total).toBe(40);
    });

    it('roles do not cross-contaminate within a model', () => {
      // Simulate advisor using the same model as executor
      const SHARED_MODEL = 'gemini-2.5-pro';
      service.addEvent(
        fakeApiResponse(SHARED_MODEL, LlmRole.MAIN, {
          total_token_count: 200,
        }),
      );
      service.addEvent(
        fakeApiResponse(SHARED_MODEL, LlmRole.UTILITY_ADVISOR, {
          total_token_count: 40,
        }),
      );

      const modelMetrics = service.getMetrics().models[SHARED_MODEL];
      // Model-level aggregates both
      expect(modelMetrics.tokens.total).toBe(240);
      expect(modelMetrics.api.totalRequests).toBe(2);

      // Role-level isolates correctly
      expect(modelMetrics.roles[LlmRole.MAIN]!.tokens.total).toBe(200);
      expect(modelMetrics.roles[LlmRole.UTILITY_ADVISOR]!.tokens.total).toBe(
        40,
      );
    });

    it('no role specified does not create a role entry', () => {
      service.addEvent(
        fakeApiResponse(EXECUTOR_MODEL, undefined, {
          total_token_count: 50,
        }),
      );

      const modelMetrics = service.getMetrics().models[EXECUTOR_MODEL];
      expect(Object.keys(modelMetrics.roles)).toHaveLength(0);
      expect(modelMetrics.tokens.total).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-escalation stress
  // -------------------------------------------------------------------------

  describe('multi-escalation stress (N=50)', () => {
    const N = 50;

    it('accumulates N advisor responses without data loss', () => {
      for (let i = 0; i < N; i++) {
        service.addEvent(
          fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
            input_token_count: 10,
            output_token_count: 20,
            total_token_count: 30,
          }),
        );
      }

      const modelMetrics = service.getMetrics().models[ADVISOR_MODEL];
      expect(modelMetrics.api.totalRequests).toBe(N);
      expect(modelMetrics.tokens.total).toBe(30 * N);
      expect(modelMetrics.tokens.prompt).toBe(10 * N);
      expect(modelMetrics.tokens.candidates).toBe(20 * N);

      const roleMetrics = modelMetrics.roles[LlmRole.UTILITY_ADVISOR]!;
      expect(roleMetrics.totalRequests).toBe(N);
      expect(roleMetrics.tokens.total).toBe(30 * N);
    });

    it('interleaved executor + advisor calls maintain accurate counts', () => {
      for (let i = 0; i < N; i++) {
        // Executor turn
        service.addEvent(
          fakeApiResponse(EXECUTOR_MODEL, LlmRole.MAIN, {
            total_token_count: 100,
          }),
        );
        // Advisor consultation
        service.addEvent(
          fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
            total_token_count: 30,
          }),
        );
      }

      const metrics = service.getMetrics();
      expect(metrics.models[EXECUTOR_MODEL].api.totalRequests).toBe(N);
      expect(metrics.models[EXECUTOR_MODEL].tokens.total).toBe(100 * N);
      expect(metrics.models[ADVISOR_MODEL].api.totalRequests).toBe(N);
      expect(metrics.models[ADVISOR_MODEL].tokens.total).toBe(30 * N);

      expect(
        metrics.models[EXECUTOR_MODEL].roles[LlmRole.MAIN]!.totalRequests,
      ).toBe(N);
      expect(
        metrics.models[ADVISOR_MODEL].roles[LlmRole.UTILITY_ADVISOR]!
          .totalRequests,
      ).toBe(N);
    });

    it('mixed success/error advisor events maintain separate counts', () => {
      for (let i = 0; i < N; i++) {
        if (i % 3 === 0) {
          // Every 3rd call is an error
          service.addEvent(
            fakeApiError(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR),
          );
        } else {
          service.addEvent(
            fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
              total_token_count: 30,
            }),
          );
        }
      }

      const errorCount = Math.ceil(N / 3); // 17 errors for N=50
      const successCount = N - errorCount; // 33 successes

      const modelMetrics = service.getMetrics().models[ADVISOR_MODEL];
      expect(modelMetrics.api.totalRequests).toBe(N);
      expect(modelMetrics.api.totalErrors).toBe(errorCount);
      expect(modelMetrics.tokens.total).toBe(30 * successCount);

      const roleMetrics = modelMetrics.roles[LlmRole.UTILITY_ADVISOR]!;
      expect(roleMetrics.totalRequests).toBe(N);
      expect(roleMetrics.totalErrors).toBe(errorCount);
      expect(roleMetrics.tokens.total).toBe(30 * successCount);
    });
  });

  // -------------------------------------------------------------------------
  // Latency aggregation
  // -------------------------------------------------------------------------

  describe('latency aggregation', () => {
    it('accumulates latency separately per role', () => {
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {}, 100),
      );
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {}, 200),
      );
      service.addEvent(
        fakeApiError(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, 50),
      );

      const roleMetrics =
        service.getMetrics().models[ADVISOR_MODEL].roles[
          LlmRole.UTILITY_ADVISOR
        ]!;
      expect(roleMetrics.totalLatencyMs).toBe(350); // 100 + 200 + 50
      expect(roleMetrics.totalRequests).toBe(3);

      // Model-level latency also aggregates
      const modelMetrics = service.getMetrics().models[ADVISOR_MODEL];
      expect(modelMetrics.api.totalLatencyMs).toBe(350);
    });
  });

  // -------------------------------------------------------------------------
  // Clear/reset behavior
  // -------------------------------------------------------------------------

  describe('clear resets advisor metrics', () => {
    it('clear() removes all advisor role metrics', () => {
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
          total_token_count: 30,
        }),
      );
      expect(
        service.getMetrics().models[ADVISOR_MODEL]?.roles[
          LlmRole.UTILITY_ADVISOR
        ],
      ).toBeDefined();

      service.clear();

      expect(service.getMetrics().models).toEqual({});
    });

    it('new events after clear() start from zero', () => {
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
          total_token_count: 30,
        }),
      );
      service.clear();
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
          total_token_count: 10,
        }),
      );

      const roleMetrics =
        service.getMetrics().models[ADVISOR_MODEL].roles[
          LlmRole.UTILITY_ADVISOR
        ]!;
      expect(roleMetrics.totalRequests).toBe(1);
      expect(roleMetrics.tokens.total).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Update event emission
  // -------------------------------------------------------------------------

  describe('update event emission', () => {
    it('emits an update event for each advisor response', () => {
      const spy = vi.fn();
      service.on('update', spy);

      service.addEvent(fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR));

      expect(spy).toHaveBeenCalledOnce();
      const { metrics } = spy.mock.calls[0][0];
      expect(
        metrics.models[ADVISOR_MODEL].roles[LlmRole.UTILITY_ADVISOR],
      ).toBeDefined();
    });

    it('emits an update event for each advisor error', () => {
      const spy = vi.fn();
      service.on('update', spy);

      service.addEvent(fakeApiError(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR));

      expect(spy).toHaveBeenCalledOnce();
      const { metrics } = spy.mock.calls[0][0];
      expect(
        metrics.models[ADVISOR_MODEL].roles[LlmRole.UTILITY_ADVISOR]
          ?.totalErrors,
      ).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Token accounting invariants
  // -------------------------------------------------------------------------

  describe('token accounting invariants', () => {
    it('role token total equals model token total for single-role model', () => {
      for (let i = 0; i < 10; i++) {
        service.addEvent(
          fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
            input_token_count: 10 + i,
            output_token_count: 20 + i,
            total_token_count: 30 + 2 * i,
            cached_content_token_count: i,
          }),
        );
      }

      const modelMetrics = service.getMetrics().models[ADVISOR_MODEL];
      const roleMetrics = modelMetrics.roles[LlmRole.UTILITY_ADVISOR]!;

      // When a model is used exclusively for one role, totals must match
      expect(roleMetrics.tokens.total).toBe(modelMetrics.tokens.total);
      expect(roleMetrics.tokens.prompt).toBe(modelMetrics.tokens.prompt);
      expect(roleMetrics.tokens.candidates).toBe(
        modelMetrics.tokens.candidates,
      );
      expect(roleMetrics.tokens.cached).toBe(modelMetrics.tokens.cached);
    });

    it('input = prompt - cached for advisor role metrics', () => {
      service.addEvent(
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
          input_token_count: 100,
          cached_content_token_count: 30,
          output_token_count: 50,
          total_token_count: 150,
        }),
      );

      const roleMetrics =
        service.getMetrics().models[ADVISOR_MODEL].roles[
          LlmRole.UTILITY_ADVISOR
        ]!;
      expect(roleMetrics.tokens.input).toBe(
        roleMetrics.tokens.prompt - roleMetrics.tokens.cached,
      );
      expect(roleMetrics.tokens.input).toBe(70); // 100 - 30
    });

    it('multi-role model totals equal sum of all role totals', () => {
      const SHARED = 'gemini-2.5-pro';

      // 3 MAIN responses
      for (let i = 0; i < 3; i++) {
        service.addEvent(
          fakeApiResponse(SHARED, LlmRole.MAIN, {
            total_token_count: 100,
          }),
        );
      }
      // 2 UTILITY_ADVISOR responses
      for (let i = 0; i < 2; i++) {
        service.addEvent(
          fakeApiResponse(SHARED, LlmRole.UTILITY_ADVISOR, {
            total_token_count: 40,
          }),
        );
      }

      const modelMetrics = service.getMetrics().models[SHARED];
      const mainTotal = modelMetrics.roles[LlmRole.MAIN]!.tokens.total;
      const advisorTotal =
        modelMetrics.roles[LlmRole.UTILITY_ADVISOR]!.tokens.total;

      expect(mainTotal + advisorTotal).toBe(modelMetrics.tokens.total);
      expect(mainTotal).toBe(300);
      expect(advisorTotal).toBe(80);
      expect(modelMetrics.tokens.total).toBe(380);
    });
  });

  // -------------------------------------------------------------------------
  // ApiResponseEvent role attribute in log records
  // -------------------------------------------------------------------------

  describe('ApiResponseEvent role attribute propagation', () => {
    it('includes role in toLogRecord when UTILITY_ADVISOR is set', () => {
      const event = new ApiResponseEvent(
        ADVISOR_MODEL,
        100,
        {
          prompt_id: 'test-prompt',
          contents: [],
        },
        {},
        undefined,
        undefined,
        undefined,
        LlmRole.UTILITY_ADVISOR,
      );

      // The role field is set on the event
      expect(event.role).toBe(LlmRole.UTILITY_ADVISOR);
    });

    it('omits role when not provided', () => {
      const event = new ApiResponseEvent(
        EXECUTOR_MODEL,
        100,
        {
          prompt_id: 'test-prompt',
          contents: [],
        },
        {},
      );

      expect(event.role).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // ApiErrorEvent role attribute in log records
  // -------------------------------------------------------------------------

  describe('ApiErrorEvent role attribute propagation', () => {
    it('includes role in constructor when UTILITY_ADVISOR is set', () => {
      const event = new ApiErrorEvent(
        ADVISOR_MODEL,
        'timeout',
        100,
        {
          prompt_id: 'test-prompt',
          contents: [],
        },
        undefined,
        undefined,
        undefined,
        LlmRole.UTILITY_ADVISOR,
      );

      expect(event.role).toBe(LlmRole.UTILITY_ADVISOR);
    });

    it('omits role when not provided', () => {
      const event = new ApiErrorEvent(EXECUTOR_MODEL, 'network error', 100, {
        prompt_id: 'test-prompt',
        contents: [],
      });

      expect(event.role).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Determinism under repeated reconciliation
  // -------------------------------------------------------------------------

  describe('determinism', () => {
    it('produces identical metrics for identical event sequences', () => {
      const events = [
        fakeApiResponse(EXECUTOR_MODEL, LlmRole.MAIN, {
          total_token_count: 100,
        }),
        fakeApiResponse(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR, {
          total_token_count: 30,
        }),
        fakeApiError(ADVISOR_MODEL, LlmRole.UTILITY_ADVISOR),
        fakeApiResponse(EXECUTOR_MODEL, LlmRole.MAIN, {
          total_token_count: 200,
        }),
      ];

      const service1 = new UiTelemetryService();
      const service2 = new UiTelemetryService();

      for (const event of events) {
        service1.addEvent(event);
        service2.addEvent(event);
      }

      expect(service1.getMetrics()).toEqual(service2.getMetrics());
    });
  });
});
