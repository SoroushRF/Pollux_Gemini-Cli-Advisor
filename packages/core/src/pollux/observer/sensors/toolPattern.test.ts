/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiEventType } from '../../../core/turn.js';
import { describe, expect, it } from 'vitest';
import type { SensorInput, ToolEventRecord } from './base.js';
import {
  TOOL_EXIT_REGRESSION_SIGNAL_ID,
  TOOL_FAILURE_CASCADE_SIGNAL_ID,
  TOOL_IDENTICAL_REPEAT_SIGNAL_ID,
  TOOL_PATTERN_SENSOR_ID,
  TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID,
  TOOL_TOKEN_BURN_SIGNAL_ID,
  ToolPatternSensor,
} from './toolPattern.js';

function requestEvent(
  name: string,
  argsHash: string,
  readOnly: boolean,
  mutation: boolean,
): ToolEventRecord {
  return {
    tsMs: Date.now(),
    name,
    argsHash,
    readOnly,
    mutation,
    phase: 'request',
  };
}

function responseEvent(
  name: string,
  exitCode?: number,
  schemaError?: boolean,
): ToolEventRecord {
  return {
    tsMs: Date.now(),
    name,
    argsHash: `${name}:h`,
    readOnly: false,
    mutation: false,
    phase: 'response',
    exitCode,
    schemaError,
  };
}

function makeInput(partial: Partial<SensorInput>): SensorInput {
  return {
    event: {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'call-1',
        name: 'run_shell_command',
        args: { command: 'ls' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    },
    turnElapsedMs: 60_000,
    toolEventWindow: [],
    thoughtWindow: [],
    ...partial,
  };
}

describe('pollux/observer/sensors/toolPattern', () => {
  it('exports stable sensor id', () => {
    expect(TOOL_PATTERN_SENSOR_ID).toBe('sensor.tool_pattern');
  });

  it('emits tool.identical_repeat at >=3 matching request tuples', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-3',
            name: 'read_file',
            args: { file_path: 'a.ts' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        toolEventWindow: [
          requestEvent('read_file', 'abc', true, false),
          requestEvent('read_file', 'abc', true, false),
          requestEvent('read_file', 'abc', true, false),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_IDENTICAL_REPEAT_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('does not emit tool.identical_repeat below threshold', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        toolEventWindow: [
          requestEvent('read_file', 'abc', true, false),
          requestEvent('read_file', 'abc', true, false),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_IDENTICAL_REPEAT_SIGNAL_ID)).toBe(
      false,
    );
  });

  it('emits tool.exit_regression for 1,0,1,0 shell oscillation', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-4',
            responseParts: [{ text: 'Exit Code: 0' }],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        toolEventWindow: [
          responseEvent('run_shell_command', 1),
          responseEvent('run_shell_command', 0),
          responseEvent('run_shell_command', 1),
          responseEvent('run_shell_command', 0),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_EXIT_REGRESSION_SIGNAL_ID)).toBe(true);
  });

  it('emits tool.failure_cascade for >=3 consecutive failures', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-5',
            responseParts: [{ text: 'Exit Code: 1' }],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        toolEventWindow: [
          responseEvent('run_shell_command', 1),
          responseEvent('run_shell_command', 2),
          responseEvent('run_shell_command', 1),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_FAILURE_CASCADE_SIGNAL_ID)).toBe(true);
  });

  it('emits tool.failure_cascade for schema-error cascade', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-6',
            responseParts: [{ text: '' }],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        toolEventWindow: [
          responseEvent('edit', undefined, true),
          responseEvent('edit', undefined, true),
          responseEvent('edit', undefined, true),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_FAILURE_CASCADE_SIGNAL_ID)).toBe(true);
  });

  it('emits tool.search_without_decide for read-only burst on non-exploratory prompt', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        userPromptText: 'fix this and make it work',
        toolEventWindow: [
          requestEvent('read_file', '1', true, false),
          requestEvent('read_file', '2', true, false),
          requestEvent('read_file', '3', true, false),
          requestEvent('read_file', '4', true, false),
          requestEvent('read_file', '5', true, false),
          requestEvent('read_file', '6', true, false),
          requestEvent('read_file', '7', true, false),
          requestEvent('read_file', '8', true, false),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('does not emit tool.search_without_decide for exploratory prompt', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        userPromptText: 'explore the repository first',
        toolEventWindow: [
          requestEvent('read_file', '1', true, false),
          requestEvent('read_file', '2', true, false),
          requestEvent('read_file', '3', true, false),
          requestEvent('read_file', '4', true, false),
          requestEvent('read_file', '5', true, false),
          requestEvent('read_file', '6', true, false),
          requestEvent('read_file', '7', true, false),
          requestEvent('read_file', '8', true, false),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID)).toBe(
      false,
    );
  });

  it('emits tool.token_burn above 2x session median', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        currentTurnTokenCount: 401,
        sessionMedianSuccessfulTurnTokens: 200,
      }),
    );
    expect(out.some((s) => s.id === TOOL_TOKEN_BURN_SIGNAL_ID)).toBe(true);
  });

  it('does not emit tool.token_burn below threshold', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        currentTurnTokenCount: 350,
        sessionMedianSuccessfulTurnTokens: 200,
      }),
    );
    expect(out.some((s) => s.id === TOOL_TOKEN_BURN_SIGNAL_ID)).toBe(false);
  });

  it('fail-open: malformed input returns empty or valid signal array', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
         
        event: { type: GeminiEventType.ToolCallResponse, value: null } as never,
      }),
    );
    expect(Array.isArray(out)).toBe(true);
  });
});
