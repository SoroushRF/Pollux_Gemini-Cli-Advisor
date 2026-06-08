/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { GeminiEventType } from '../../../core/turn.js';
import type { SensorInput } from './base.js';
import {
  AdvisorRequestSensor,
  SELF_ADVISOR_REQUEST_SIGNAL_ID,
} from './advisorRequest.js';

function makeInput(text: string): SensorInput {
  return {
    event: { type: GeminiEventType.Content, value: text },
    turnElapsedMs: 0,
    toolEventWindow: [],
    thoughtWindow: [],
    currentTurnModelOutput: text,
  };
}

function makeToolInput(command: string, description = ''): SensorInput {
  return {
    event: {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'tool-1',
        name: 'run_shell_command',
        args: { command, description },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    },
    turnElapsedMs: 0,
    toolEventWindow: [],
    thoughtWindow: [],
    executorCheckpoints: {
      enabled: true,
      requiredReasons: [
        'contract extraction before source edit',
        'mid-run risk review after edits or failed tests',
        'final diff audit before completion',
      ],
      enforceRequired: true,
      reserveRequiredPrimarySlots: true,
      minGuidanceWords: 40,
      rejectTruncatedGuidance: true,
      requireStructuredGuidance: true,
      finalGate: true,
    },
  };
}

describe('pollux/observer/sensors/advisorRequest', () => {
  it('emits hard-precision signal for forgiving advisor request line', () => {
    const sensor = new AdvisorRequestSensor();
    const signals = sensor.observe(
      makeInput(
        'ADVISOR_REQUEST: verify terminal-state invariant before editing',
      ),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
      hardPrecision: true,
      category: 'self',
    });
  });

  it('uses strong self-status uncertainty as advisor request evidence', () => {
    const sensor = new AdvisorRequestSensor();
    const signals = sensor.observe(
      makeInput(
        '<pollux:status stuck_on="risky terminal state invariant" next="need review before edit"/>',
      ),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].attribution).toContain('terminal state invariant');
  });

  it('ignores trivial request reasons', () => {
    const sensor = new AdvisorRequestSensor();
    expect(sensor.observe(makeInput('ADVISOR_REQUEST: unsure'))).toEqual([]);
  });

  it('emits later distinct requests from accumulated output', () => {
    const sensor = new AdvisorRequestSensor();
    const first =
      '<pollux:advisor_request reason="contract extraction before source edit" timing="now"/>';
    const second =
      '<pollux:advisor_request reason="final diff audit before completion" timing="now"/>';

    expect(sensor.observe(makeInput(first))).toHaveLength(1);
    const signals = sensor.observe(makeInput(`${first}\n${second}`));

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
      attribution:
        'advisor_request reason="final diff audit before completion"',
    });
  });

  it('dedupes repeated request reasons in alternate request forms', () => {
    const sensor = new AdvisorRequestSensor();

    expect(
      sensor.observe(makeInput('advisor_request now: final diff audit')),
    ).toHaveLength(1);
    expect(
      sensor.observe(
        makeInput(
          'advisor_request now: final diff audit\nADVISOR_REQUEST: final diff audit',
        ),
      ),
    ).toEqual([]);
  });

  it('maps strict checkpoint shell request text to contract extraction', () => {
    const sensor = new AdvisorRequestSensor();
    const signals = sensor.observe(
      makeToolInput('echo "Requesting advisor contract extraction"'),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
      attribution:
        'advisor_request reason="contract extraction before source edit"',
    });
  });

  it('maps strict checkpoint shell request text to mid-run review', () => {
    const sensor = new AdvisorRequestSensor();
    const signals = sensor.observe(
      makeToolInput('echo "Requesting mid-run risk review"'),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].attribution).toBe(
      'advisor_request reason="mid-run risk review after edits or failed tests"',
    );
  });

  it('ignores generic shell echoes that are not strict checkpoint aliases', () => {
    const sensor = new AdvisorRequestSensor();

    expect(sensor.observe(makeToolInput('echo "Requesting status"'))).toEqual(
      [],
    );
  });
});
