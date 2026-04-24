/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '../../../core/turn.js';
import { SelfReportSensor } from './selfReport.js';

function inputForEvent(event: ServerGeminiStreamEvent) {
  return {
    event,
    turnElapsedMs: 0,
    toolEventWindow: [],
    thoughtWindow: [],
  } as const;
}

function inputForContentChunk(value: string, currentTurnModelOutput: string) {
  return {
    event: {
      type: GeminiEventType.Content,
      value,
    } as ServerGeminiStreamEvent,
    turnElapsedMs: 0,
    toolEventWindow: [],
    thoughtWindow: [],
    currentTurnModelOutput,
  } as const;
}

describe('pollux/observer/sensors/selfReport', () => {
  it('emits no stuck signal when stuck_on is trivial (nothing)', () => {
    const sensor = new SelfReportSensor();
    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.Content,
      value: '<pollux:status stuck_on="nothing" next="continue"/>',
    };
    const signals = sensor.observe(inputForEvent(event));
    expect(signals.some((s) => s.id === 'self.structured_status_stuck')).toBe(
      false,
    );
  });

  it('emits hard-precision stuck signal for non-trivial stuck_on', () => {
    const sensor = new SelfReportSensor();
    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.Content,
      value:
        '<pollux:status stuck_on="ci fails on windows" next="inspect logs"/>',
    };
    const signals = sensor.observe(inputForEvent(event));
    const stuck = signals.find((s) => s.id === 'self.structured_status_stuck');
    expect(stuck).toBeDefined();
    expect(stuck?.hardPrecision).toBe(true);
  });

  it('detects non-trivial stuck_on when the status tag is split across content chunks', () => {
    const sensor = new SelfReportSensor();
    expect(
      sensor.observe(
        inputForContentChunk(
          '<pollux:status stuck_on="ci fails',
          '<pollux:status stuck_on="ci fails',
        ),
      ),
    ).toEqual([]);

    const signals = sensor.observe(
      inputForContentChunk(
        ' on windows" next="inspect logs"/>',
        '<pollux:status stuck_on="ci fails on windows" next="inspect logs"/>',
      ),
    );
    const stuck = signals.find((s) => s.id === 'self.structured_status_stuck');
    expect(stuck).toBeDefined();
    expect(stuck?.hardPrecision).toBe(true);
  });

  it('detects non-trivial stuck_on when the stream splits inside the attribute name', () => {
    const sensor = new SelfReportSensor();
    const signals = sensor.observe(
      inputForContentChunk(
        '_on="drafting memo" next="write preview"/>',
        '<pollux:status stuck_on="drafting memo" next="write preview"/>',
      ),
    );
    const stuck = signals.find((s) => s.id === 'self.structured_status_stuck');
    expect(stuck).toBeDefined();
    expect(stuck?.attribution).toBe('self_report stuck_on="drafting memo"');
  });

  it('does not emit duplicate stuck signals for the same tag within a turn', () => {
    const sensor = new SelfReportSensor();
    const input = inputForContentChunk(
      '<pollux:status stuck_on="ci fails on windows" next="inspect logs"/>',
      '<pollux:status stuck_on="ci fails on windows" next="inspect logs"/>',
    );
    expect(
      sensor
        .observe(input)
        .some((s) => s.id === 'self.structured_status_stuck'),
    ).toBe(true);
    expect(
      sensor
        .observe(input)
        .some((s) => s.id === 'self.structured_status_stuck'),
    ).toBe(false);

    sensor.beginTurn();
    expect(
      sensor
        .observe(input)
        .some((s) => s.id === 'self.structured_status_stuck'),
    ).toBe(true);
  });

  it('does not emit confidence-low when confidence is high', () => {
    const sensor = new SelfReportSensor();
    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.Content,
      value: 'ok <!-- pollux:confidence:9 -->',
    };
    const signals = sensor.observe(inputForEvent(event));
    expect(signals.some((s) => s.id === 'self.confidence_low')).toBe(false);
  });

  it('emits confidence-low when confidence <= 3', () => {
    const sensor = new SelfReportSensor();
    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.Content,
      value: 'hmm <!-- pollux:confidence:2 -->',
    };
    const signals = sensor.observe(inputForEvent(event));
    const low = signals.find((s) => s.id === 'self.confidence_low');
    expect(low).toBeDefined();
    expect(low?.hardPrecision).toBe(false);
  });

  it('fail-open: malformed content does not throw', () => {
    const sensor = new SelfReportSensor();
    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.Thought,
      // @ts-expect-error synthetic malformed payload for fail-open
      value: undefined,
    };
    expect(() => sensor.observe(inputForEvent(event))).not.toThrow();
  });
});
