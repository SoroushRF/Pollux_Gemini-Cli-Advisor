/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { GeminiEventType } from '../../../core/turn.js';
import type { SensorInput } from './base.js';
import {
  ThoughtSensor,
  THOUGHT_ENTROPY_SPIKE_SIGNAL_ID,
  THOUGHT_HEDGE_DENSITY_SIGNAL_ID,
  THOUGHT_SELF_CONTRADICTION_SIGNAL_ID,
  THOUGHT_STALL_SIGNAL_ID,
  THOUGHT_SUBJECT_LOOP_SIGNAL_ID,
} from './thought.js';

function makeInput(
  partial: Partial<SensorInput> & {
    thoughtWindow: SensorInput['thoughtWindow'];
  },
): SensorInput {
  const { thoughtWindow, ...rest } = partial;
  return {
    event: {
      type: GeminiEventType.Thought,
      value: thoughtWindow.at(-1) ?? { subject: '', description: '' },
    },
    turnElapsedMs: 120_000,
    toolEventWindow: [],
    thoughtWindow,
    ...rest,
  };
}

describe('pollux/observer/sensors/thought', () => {
  it('emits thought.subject_loop when similar subject appears >=3 times', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [
          { subject: 'Fix tests', description: 'start' },
          { subject: 'fix test', description: 'retry' },
          { subject: 'Fix tesst', description: 'still trying' },
        ],
      }),
    );
    expect(out.some((s) => s.id === THOUGHT_SUBJECT_LOOP_SIGNAL_ID)).toBe(true);
  });

  it('does not emit thought.subject_loop with fewer than 3 occurrences', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [
          { subject: 'Fix tests', description: 'start' },
          { subject: 'Implement feature', description: 'different' },
        ],
      }),
    );
    expect(out.some((s) => s.id === THOUGHT_SUBJECT_LOOP_SIGNAL_ID)).toBe(
      false,
    );
  });

  it('emits thought.hedge_density when hedge ratio is high', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [
          {
            subject: 'Maybe fix',
            description: 'maybe perhaps i think this might work, wait maybe',
          },
        ],
      }),
    );
    expect(out.some((s) => s.id === THOUGHT_HEDGE_DENSITY_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('does not emit thought.hedge_density when hedge ratio is low', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [
          {
            subject: 'Run command',
            description:
              'collect logs and summarize concrete failures with paths and line numbers',
          },
        ],
      }),
    );
    expect(out.some((s) => s.id === THOUGHT_HEDGE_DENSITY_SIGNAL_ID)).toBe(
      false,
    );
  });

  it('emits thought.self_contradiction on contradiction phrase', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [
          {
            subject: 'Approach',
            description: "wait that's wrong, scratch that and retry",
          },
        ],
      }),
    );
    expect(out.some((s) => s.id === THOUGHT_SELF_CONTRADICTION_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('emits thought.stall when same subject grows in length', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [
          { subject: 'Edit config', description: 'update field' },
          {
            subject: 'Edit config',
            description:
              'update field and retry a second variant with additional detail',
          },
        ],
      }),
    );
    expect(out.some((s) => s.id === THOUGHT_STALL_SIGNAL_ID)).toBe(true);
  });

  it('does not emit thought.stall when same subject shrinks', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [
          {
            subject: 'Edit config',
            description: 'long first explanation with many details',
          },
          { subject: 'Edit config', description: 'short' },
        ],
      }),
    );
    expect(out.some((s) => s.id === THOUGHT_STALL_SIGNAL_ID)).toBe(false);
  });

  it('emits thought.entropy_spike when distinct subject rate exceeds 2x baseline', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        turnElapsedMs: 60_000,
        sessionMedianDistinctSubjectsPerMinute: 1,
        thoughtWindow: [
          { subject: 'A', description: '' },
          { subject: 'B', description: '' },
          { subject: 'C', description: '' },
        ],
      }),
    );
    expect(out.some((s) => s.id === THOUGHT_ENTROPY_SPIKE_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('returns no signals for non-thought events', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe({
      ...makeInput({ thoughtWindow: [{ subject: 'x', description: 'y' }] }),
      event: { type: GeminiEventType.Content, value: 'text' },
    });
    expect(out).toEqual([]);
  });

  it('fail-open: malformed thoughtWindow returns empty signals', () => {
    const sensor = new ThoughtSensor();
    const out = sensor.observe(
      makeInput({
        thoughtWindow: [{ subject: 'x', description: 'y' }],
         
        event: { type: GeminiEventType.Thought, value: null } as never,
      }),
    );
    expect(Array.isArray(out)).toBe(true);
  });
});
