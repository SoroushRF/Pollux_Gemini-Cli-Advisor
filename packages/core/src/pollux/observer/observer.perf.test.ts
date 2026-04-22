/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '../../core/turn.js';
import { mergePolluxExperimentalConfig } from '../types.js';
import { createLiveExecutorObserver } from './observer.js';

function buildSyntheticTurnEvents(): ServerGeminiStreamEvent[] {
  const events: ServerGeminiStreamEvent[] = [];

  // 10 thought events.
  for (let i = 0; i < 10; i++) {
    events.push({
      type: GeminiEventType.Thought,
      value: {
        subject: `subject-${i % 3}`,
        description: `thinking-${i}`.repeat(20),
      },
    });
  }

  // 20 content chunks.
  for (let i = 0; i < 20; i++) {
    events.push({ type: GeminiEventType.Content, value: `chunk-${i}` });
  }

  // 10 tool calls (request/response pairs = 20 events).
  for (let i = 0; i < 10; i++) {
    const callId = `call-${i}`;
    events.push({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId,
        name: 'run_shell_command',
        args: { command: 'ls' },
        isClientInitiated: false,
        prompt_id: 'perf',
      },
    });
    events.push({
      type: GeminiEventType.ToolCallResponse,
      value: {
        callId,
        responseParts: [{ text: 'ok\nExit Code: 0\n' }],
        resultDisplay: undefined,
        error: undefined,
        errorType: undefined,
      },
    });
  }

  // Total = 10 + 20 + 20 = 50.
  expect(events).toHaveLength(50);
  return events;
}

describe('pollux/observer/perf', () => {
  it('processes a 50-event synthetic turn within a small mean budget', () => {
    const observer = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: { observer: { enabled: true } },
      }),
    );

    const events = buildSyntheticTurnEvents();
    const iterations = 500;
    const warmup = 50;

    for (let i = 0; i < warmup; i++) {
      observer.beginTurn('perf');
      for (const event of events) {
        observer.ingest(event);
      }
      observer.ingest({
        type: GeminiEventType.Finished,
        value: {
          reason: undefined,
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        },
      });
    }

    const samplesMs: number[] = [];
    for (let i = 0; i < iterations; i++) {
      observer.beginTurn('perf');
      const start = performance.now();
      for (const event of events) {
        observer.ingest(event);
      }
      observer.ingest({
        type: GeminiEventType.Finished,
        value: {
          reason: undefined,
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        },
      });
      samplesMs.push(performance.now() - start);
    }

    const meanMs =
      samplesMs.reduce((sum, value) => sum + value, 0) / samplesMs.length;
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const p95Ms = sorted[Math.floor(sorted.length * 0.95)];

    // Benchmark-style guardrail: buffered for dev machines / Windows + coverage
    // runs (still catches order-of-magnitude regressions vs ~1–3ms healthy mean).
    const maxMeanMs = 18;
    expect({ meanMs, p95Ms }).toEqual({
      meanMs: expect.any(Number),
      p95Ms: expect.any(Number),
    });
    expect(meanMs).toBeLessThan(maxMeanMs);
  });
});
