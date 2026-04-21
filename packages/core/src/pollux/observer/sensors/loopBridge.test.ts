/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { GeminiEventType } from '../../../core/turn.js';
import type { ServerGeminiStreamEvent } from '../../../core/turn.js';
import { LoopType } from '../../../telemetry/types.js';
import {
  LOOP_HARD_CONFIRMED_SIGNAL_ID,
  LOOP_HARD_CONFIRMED_PRECISION_PRIOR,
  LOOP_HARD_CONFIRMED_WEIGHT,
  LoopBridgeSensor,
} from './loopBridge.js';

const dummyEvent = {
  type: GeminiEventType.Content,
  value: 'x',
} as const satisfies ServerGeminiStreamEvent;

describe('LoopBridgeSensor', () => {
  it('emits loop.hard_confirmed once when peekState first reports a loop', () => {
    const peekState = vi
      .fn()
      .mockReturnValueOnce({
        loopDetected: true,
        lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
        detail: 'Repeated tool call',
      })
      .mockReturnValue({
        loopDetected: true,
        lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
        detail: 'Repeated tool call',
      });

    const sensor = new LoopBridgeSensor({ peekState });

    const first = sensor.onStreamEvent(dummyEvent);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: LOOP_HARD_CONFIRMED_SIGNAL_ID,
      weight: LOOP_HARD_CONFIRMED_WEIGHT,
      precisionPrior: LOOP_HARD_CONFIRMED_PRECISION_PRIOR,
      category: 'tool',
      hardPrecision: true,
      attribution: 'Repeated tool call',
    });
    expect(first[0].tsMs).toBeTypeOf('number');

    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);
    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);
    expect(peekState).toHaveBeenCalledTimes(3);
  });

  it('emits nothing while idle', () => {
    const peekState = vi.fn().mockReturnValue({
      loopDetected: false,
      lastLoopType: undefined,
      detail: undefined,
      confirmedByModel: undefined,
    });
    const sensor = new LoopBridgeSensor({ peekState });
    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);
    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);
  });

  it('emits again after loopDetected drops to false then true', () => {
    const snapshot = {
      loopDetected: false,
      lastLoopType: undefined as LoopType | undefined,
      detail: undefined as string | undefined,
    };
    const peekState = vi.fn(() => ({
      loopDetected: snapshot.loopDetected,
      lastLoopType: snapshot.lastLoopType,
      detail: snapshot.detail,
      confirmedByModel: undefined as string | undefined,
    }));

    const sensor = new LoopBridgeSensor({ peekState });

    snapshot.loopDetected = true;
    snapshot.lastLoopType = LoopType.LLM_DETECTED_LOOP;
    snapshot.detail = 'analysis';
    expect(sensor.onStreamEvent(dummyEvent)).toHaveLength(1);
    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);

    snapshot.loopDetected = false;
    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);

    snapshot.loopDetected = true;
    snapshot.detail = 'again';
    const secondWave = sensor.onStreamEvent(dummyEvent);
    expect(secondWave).toHaveLength(1);
    expect(secondWave[0]?.attribution).toBe('again');
    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);
  });

  it('fail-open: peekState throws yields empty signals', () => {
    const peekState = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const sensor = new LoopBridgeSensor({ peekState });
    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);
  });

  it('resetEdgeTracking allows a second emission without an idle peek', () => {
    const peekState = vi.fn().mockReturnValue({
      loopDetected: true,
      lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
      detail: 'x',
    });
    const sensor = new LoopBridgeSensor({ peekState });
    expect(sensor.onStreamEvent(dummyEvent)).toHaveLength(1);
    expect(sensor.onStreamEvent(dummyEvent)).toEqual([]);
    sensor.resetEdgeTracking();
    expect(sensor.onStreamEvent(dummyEvent)).toHaveLength(1);
  });
});
