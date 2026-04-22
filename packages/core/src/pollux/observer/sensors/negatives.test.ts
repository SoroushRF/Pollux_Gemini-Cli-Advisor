/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiEventType } from '../../../core/turn.js';
import { describe, expect, it } from 'vitest';
import type { SensorInput } from './base.js';
import {
  NEGATIVE_SENSOR_ID,
  NEG_CONFIDENT_CLOSE_SIGNAL_ID,
  NEG_CONCRETE_SUBJECT_SIGNAL_ID,
  NEG_EARLY_TURN_SIGNAL_ID,
  NEG_EXIT_ZERO_SIGNAL_ID,
  NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID,
  NegativeSignalsSensor,
} from './negatives.js';

function makeInput(partial: Partial<SensorInput>): SensorInput {
  return {
    event: { type: GeminiEventType.Content, value: 'chunk' },
    turnElapsedMs: 10_000,
    toolEventWindow: [],
    thoughtWindow: [],
    ...partial,
  };
}

describe('pollux/observer/sensors/negatives', () => {
  it('exports stable sensor id', () => {
    expect(NEGATIVE_SENSOR_ID).toBe('sensor.negatives');
  });

  it('emits neg.exit_zero when last tool exit is 0', () => {
    const sensor = new NegativeSignalsSensor();
    const out = sensor.observe(
      makeInput({
        toolEventWindow: [
          {
            tsMs: Date.now(),
            name: 'run_shell_command',
            argsHash: 'h',
            readOnly: false,
            mutation: false,
            phase: 'response',
            exitCode: 0,
          },
        ],
      }),
    );
    expect(out.some((s) => s.id === NEG_EXIT_ZERO_SIGNAL_ID)).toBe(true);
  });

  it('does not emit neg.exit_zero when last tool exit is non-zero', () => {
    const sensor = new NegativeSignalsSensor();
    const out = sensor.observe(
      makeInput({
        toolEventWindow: [
          {
            tsMs: Date.now(),
            name: 'run_shell_command',
            argsHash: 'h',
            readOnly: false,
            mutation: false,
            phase: 'response',
            exitCode: 1,
          },
        ],
      }),
    );
    expect(out.some((s) => s.id === NEG_EXIT_ZERO_SIGNAL_ID)).toBe(false);
  });

  it('emits neg.concrete_subject for action-like thought subject', () => {
    const sensor = new NegativeSignalsSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [{ subject: 'editing config', description: 'done' }],
      }),
    );
    expect(out.some((s) => s.id === NEG_CONCRETE_SUBJECT_SIGNAL_ID)).toBe(true);
  });

  it('does not emit neg.concrete_subject for abstract subject', () => {
    const sensor = new NegativeSignalsSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [
          { subject: 'considering strategy', description: 'done' },
        ],
      }),
    );
    expect(out.some((s) => s.id === NEG_CONCRETE_SUBJECT_SIGNAL_ID)).toBe(
      false,
    );
  });

  it('emits neg.confident_close for long non-hedged output', () => {
    const sensor = new NegativeSignalsSensor();
    const longText = new Array(90).fill('concrete').join(' ');
    const out = sensor.observe(
      makeInput({
        currentTurnModelOutput: longText,
      }),
    );
    expect(out.some((s) => s.id === NEG_CONFIDENT_CLOSE_SIGNAL_ID)).toBe(true);
  });

  it('does not emit neg.confident_close when hedges are present', () => {
    const sensor = new NegativeSignalsSensor();
    const longText = `${new Array(90).fill('token').join(' ')} maybe`;
    const out = sensor.observe(
      makeInput({
        currentTurnModelOutput: longText,
      }),
    );
    expect(out.some((s) => s.id === NEG_CONFIDENT_CLOSE_SIGNAL_ID)).toBe(false);
  });

  it('emits neg.recent_advisor_success when recent success flag is true', () => {
    const sensor = new NegativeSignalsSensor();
    const out = sensor.observe(
      makeInput({
        recentAdvisorSuccessWithinTurns: true,
      }),
    );
    expect(out.some((s) => s.id === NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('emits neg.early_turn when fewer than 2 tool calls were made', () => {
    const sensor = new NegativeSignalsSensor();
    const out = sensor.observe(
      makeInput({
        turnToolCallCount: 1,
      }),
    );
    expect(out.some((s) => s.id === NEG_EARLY_TURN_SIGNAL_ID)).toBe(true);
  });

  it('does not emit neg.early_turn when turn has >=2 tool calls', () => {
    const sensor = new NegativeSignalsSensor();
    const out = sensor.observe(
      makeInput({
        turnToolCallCount: 2,
      }),
    );
    expect(out.some((s) => s.id === NEG_EARLY_TURN_SIGNAL_ID)).toBe(false);
  });

  it('fail-open: malformed input returns an array', () => {
    const sensor = new NegativeSignalsSensor();
    const out = sensor.observe(
      makeInput({
         
        toolEventWindow: null as never,
      }),
    );
    expect(Array.isArray(out)).toBe(true);
  });
});
