/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiEventType } from '../../../core/turn.js';
import { describe, expect, it } from 'vitest';
import type { SensorInput, ToolEventRecord } from './base.js';
import { SELF_ADVISOR_REQUEST_SIGNAL_ID } from './advisorRequest.js';
import {
  LONGITUDINAL_M3_ANCHOR_PRESSURE_SIGNAL_ID,
  TOOL_EXECUTOR_CHECKPOINT_ADVISOR_SIGNAL_ID,
  TOOL_FINALIZATION_AUDIT_SIGNAL_ID,
  TOOL_ANCHOR_GUIDED_MUTATION_SIGNAL_ID,
  TOOL_ANCHOR_TEST_FAILURE_SIGNAL_ID,
  TOOL_CROSS_SURFACE_DRIFT_SIGNAL_ID,
  TOOL_EXIT_REGRESSION_SIGNAL_ID,
  TOOL_FAILURE_CASCADE_SIGNAL_ID,
  TOOL_IDENTICAL_REPEAT_SIGNAL_ID,
  TOOL_LOCAL_PATCH_RETRY_SIGNAL_ID,
  TOOL_PATTERN_SENSOR_ID,
  TOOL_PRE_MUTATION_ADVISOR_SIGNAL_ID,
  TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID,
  TOOL_TOKEN_BURN_SIGNAL_ID,
  ToolPatternSensor,
} from './toolPattern.js';
import { parsePromptConstraintSummary } from '../promptConstraints.js';

function requestEvent(
  name: string,
  argsHash: string,
  readOnly: boolean,
  mutation: boolean,
  args: Record<string, unknown> = { file_path: `${argsHash}.ts` },
): ToolEventRecord {
  return {
    tsMs: Date.now(),
    callId: `${argsHash}-call`,
    name,
    argsHash,
    readOnly,
    mutation,
    phase: 'request',
    request: {
      callId: `${argsHash}-call`,
      name,
      args,
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    },
  };
}

function responseEvent(
  name: string,
  exitCode?: number,
  schemaError?: boolean,
  callId = `${name}-call`,
): ToolEventRecord {
  return {
    tsMs: Date.now(),
    callId,
    name,
    argsHash: `${name}:h`,
    readOnly: false,
    mutation: false,
    phase: 'response',
    exitCode,
    schemaError,
  };
}

const strictExecutorCheckpoints = {
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
};

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

  it('emits tool.local_patch_retry for repeated anchored mutation churn', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-7',
            name: 'replace',
            args: {
              file_path: 'src/index.ts',
              old_string: 'createLabel',
              new_string: 'createStableLabel',
            },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Fix the transitive import/export mismatch so view.ts uses the canonical createStableLabel implementation through the public index. Do not change src/labels.ts behavior or tests/view.test.ts.',
        ),
        toolEventWindow: [
          requestEvent('read_file', 'read-labels', true, false, {
            file_path: 'src/labels.ts',
          }),
          requestEvent('read_file', 'read-view', true, false, {
            file_path: 'src/view.ts',
          }),
          requestEvent('replace', 'mut-1', false, true, {
            file_path: 'src/index.ts',
            old_string: 'createLabel',
            new_string: 'createStableLabel',
          }),
          requestEvent('replace', 'mut-2', false, true, {
            file_path: 'src/index.ts',
            old_string: 'createLabel',
            new_string: 'createStableLabel',
          }),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_LOCAL_PATCH_RETRY_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('emits tool.cross_surface_drift after multi-surface reads collapse into a single mutation surface', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-8',
            name: 'replace',
            args: {
              file_path: 'src/view.ts',
              old_string: 'createLabel',
              new_string: 'createStableLabel',
            },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Fix the transitive import/export mismatch so view.ts uses the canonical createStableLabel implementation through the public index. Do not change src/labels.ts behavior or tests/view.test.ts.',
        ),
        toolEventWindow: [
          requestEvent('read_file', 'read-labels', true, false, {
            file_path: 'src/labels.ts',
          }),
          requestEvent('read_file', 'read-view', true, false, {
            file_path: 'src/view.ts',
          }),
          requestEvent('read_file', 'read-test', true, false, {
            file_path: 'tests/view.test.ts',
          }),
          requestEvent('replace', 'mut-view-1', false, true, {
            file_path: 'src/view.ts',
            old_string: 'createLabel',
            new_string: 'createStableLabel',
          }),
          requestEvent('replace', 'mut-view-2', false, true, {
            file_path: 'src/view.ts',
            old_string: 'createLabel',
            new_string: 'createStableLabel',
          }),
        ],
      }),
    );
    expect(out.some((s) => s.id === TOOL_CROSS_SURFACE_DRIFT_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('emits M3 anchor pressure plus cross-surface drift for public-index source repair', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-m3-17',
            name: 'replace',
            args: {
              file_path: 'src/view.ts',
              old_string: 'createLabel',
              new_string: 'createStableLabel',
            },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Fix the transitive import/export mismatch so view.ts uses the canonical createStableLabel implementation through the public index. Do not change src/labels.ts behavior or tests/view.test.ts. Create m3-done.txt containing exactly done.',
        ),
        toolEventWindow: [
          requestEvent('read_file', 'read-index', true, false, {
            file_path: 'src/index.ts',
          }),
          requestEvent('read_file', 'read-labels', true, false, {
            file_path: 'src/labels.ts',
          }),
          requestEvent('read_file', 'read-test', true, false, {
            file_path: 'tests/view.test.ts',
          }),
          requestEvent('replace', 'mut-index', false, true, {
            file_path: 'src/index.ts',
            old_string: 'createLabel',
            new_string: 'createStableLabel',
          }),
          requestEvent('replace', 'mut-view', false, true, {
            file_path: 'src/view.ts',
            old_string: 'createLabel',
            new_string: 'createStableLabel',
          }),
        ],
      }),
    );

    expect(
      out.some((s) => s.id === LONGITUDINAL_M3_ANCHOR_PRESSURE_SIGNAL_ID),
    ).toBe(true);
    expect(out.some((s) => s.id === TOOL_CROSS_SURFACE_DRIFT_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('emits guided mutation for protected test/readme source repair', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-m3-18',
            name: 'write_file',
            args: {
              file_path: 'src/csv.ts',
              content:
                'export function parseCsvLine(line: string) { return []; }',
            },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Fix src/csv.ts so it satisfies the parser edge cases expressed by tests/csv.test.ts. Do not weaken or edit the test or README. Create m3-done.txt containing exactly done.',
        ),
        toolEventWindow: [
          requestEvent('read_file', 'read-src', true, false, {
            file_path: 'src/csv.ts',
          }),
          requestEvent('read_file', 'read-test', true, false, {
            file_path: 'tests/csv.test.ts',
          }),
          requestEvent('read_file', 'read-readme', true, false, {
            file_path: 'README.md',
          }),
          requestEvent('write_file', 'mut-src', false, true, {
            file_path: 'src/csv.ts',
            content:
              'export function parseCsvLine(line: string) { return []; }',
          }),
        ],
      }),
    );

    expect(
      out.some((s) => s.id === LONGITUDINAL_M3_ANCHOR_PRESSURE_SIGNAL_ID),
    ).toBe(true);
    expect(
      out.some((s) => s.id === TOOL_ANCHOR_GUIDED_MUTATION_SIGNAL_ID),
    ).toBe(true);
  });

  it('emits constraint-aware pre-mutation advisor signal for detector mode', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        advisorTriggerMode: 'detector',
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'mut-flow',
            name: 'write_file',
            args: {
              file_path: 'src/flow.ts',
              content: 'export const transitions = {};',
            },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Repair src/flow.ts and tests/flow.test.ts so the state machine transition map preserves terminal-state behavior. The done and failed states must remain explicit entries with empty arrays.',
        ),
        toolEventWindow: [
          requestEvent('read_file', 'read-flow', true, false, {
            file_path: 'src/flow.ts',
          }),
          requestEvent('write_file', 'mut-flow', false, true, {
            file_path: 'src/flow.ts',
            content: 'export const transitions = {};',
          }),
        ],
      }),
    );

    expect(out.some((s) => s.id === TOOL_PRE_MUTATION_ADVISOR_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('uses executor checkpoint signal instead of detector pre-mutation in executor-request mode', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        advisorTriggerMode: 'executor_request',
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'mut-flow',
            name: 'write_file',
            args: {
              file_path: 'src/flow.ts',
              content: 'export const transitions = {};',
            },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Repair src/flow.ts and tests/flow.test.ts so the state machine transition map preserves terminal-state behavior. The done and failed states must remain explicit entries with empty arrays.',
        ),
        toolEventWindow: [
          requestEvent('read_file', 'read-flow', true, false, {
            file_path: 'src/flow.ts',
          }),
          requestEvent('write_file', 'mut-flow', false, true, {
            file_path: 'src/flow.ts',
            content: 'export const transitions = {};',
          }),
        ],
      }),
    );

    expect(
      out.some((s) => s.id === TOOL_EXECUTOR_CHECKPOINT_ADVISOR_SIGNAL_ID),
    ).toBe(true);
    expect(out.some((s) => s.id === TOOL_PRE_MUTATION_ADVISOR_SIGNAL_ID)).toBe(
      false,
    );
  });

  it('strict checkpoints request contract extraction before first Go source mutation', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        advisorTriggerMode: 'hybrid',
        executorCheckpoints: strictExecutorCheckpoints,
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'write-snapshot',
            name: 'write_file',
            args: {
              file_path: 'experimental/snapshot/snapshot.go',
              content: 'package snapshot',
            },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        toolEventWindow: [
          requestEvent('write_file', 'write-snapshot', false, true, {
            file_path: 'experimental/snapshot/snapshot.go',
            content: 'package snapshot',
          }),
        ],
      }),
    );

    expect(out).toContainEqual(
      expect.objectContaining({
        id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
        attribution: expect.stringContaining(
          'advisor_request reason="contract extraction before source edit"',
        ),
      }),
    );
  });

  it('strict checkpoints request mid-run review on second source mutation', () => {
    const sensor = new ToolPatternSensor();

    sensor.observe(
      makeInput({
        advisorTriggerMode: 'hybrid',
        executorCheckpoints: strictExecutorCheckpoints,
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'write-one',
            name: 'write_file',
            args: { file_path: 'experimental/snapshot/snapshot.go' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        toolEventWindow: [
          requestEvent('write_file', 'write-one', false, true, {
            file_path: 'experimental/snapshot/snapshot.go',
          }),
        ],
      }),
    );

    const out = sensor.observe(
      makeInput({
        advisorTriggerMode: 'hybrid',
        executorCheckpoints: strictExecutorCheckpoints,
        currentTurnAdvisorSuccessWithinTurn: true,
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'write-two',
            name: 'replace',
            args: { file_path: 'experimental/experimental.go' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        toolEventWindow: [
          requestEvent('write_file', 'write-one', false, true, {
            file_path: 'experimental/snapshot/snapshot.go',
          }),
          requestEvent('replace', 'write-two', false, true, {
            file_path: 'experimental/experimental.go',
          }),
        ],
      }),
    );

    expect(out).toContainEqual(
      expect.objectContaining({
        id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
        attribution: expect.stringContaining(
          'advisor_request reason="mid-run risk review after edits or failed tests"',
        ),
      }),
    );
  });

  it('strict checkpoints request mid-run review after failed focused test', () => {
    const sensor = new ToolPatternSensor();
    const testRequest = requestEvent(
      'run_shell_command',
      'test-run',
      false,
      false,
      {
        command: 'go test ./experimental/snapshot/...',
      },
    );
    const out = sensor.observe(
      makeInput({
        advisorTriggerMode: 'hybrid',
        executorCheckpoints: strictExecutorCheckpoints,
        event: {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: testRequest.callId!,
            responseParts: [{ text: 'exit code: 1' }],
            resultDisplay: 'go test failed',
            error: undefined,
            errorType: undefined,
          },
        },
        toolEventWindow: [
          requestEvent('write_file', 'write-one', false, true, {
            file_path: 'experimental/snapshot/snapshot.go',
          }),
          testRequest,
          responseEvent('run_shell_command', 1, false, testRequest.callId),
        ],
      }),
    );

    expect(out).toContainEqual(
      expect.objectContaining({
        id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
        attribution: expect.stringContaining(
          'advisor_request reason="mid-run risk review after edits or failed tests"',
        ),
      }),
    );
  });

  it('emits finalization audit after high-risk source mutation before m3 marker', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        advisorTriggerMode: 'detector',
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'done',
            name: 'write_file',
            args: { file_path: 'm3-done.txt', content: 'done' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Repair src/flow.ts so the state machine transition map preserves terminal-state behavior. done and failed must remain explicit entries.',
        ),
        toolEventWindow: [
          requestEvent('read_file', 'read-flow', true, false, {
            file_path: 'src/flow.ts',
          }),
          requestEvent('write_file', 'mut-flow', false, true, {
            file_path: 'src/flow.ts',
            content: 'export const transitions = { queued: [] };',
          }),
          requestEvent('write_file', 'done', false, true, {
            file_path: 'm3-done.txt',
            content: 'done',
          }),
        ],
      }),
    );

    expect(out.some((s) => s.id === TOOL_FINALIZATION_AUDIT_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('strict checkpoints request final diff audit before completion marker', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        advisorTriggerMode: 'hybrid',
        executorCheckpoints: strictExecutorCheckpoints,
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'done',
            name: 'write_file',
            args: { file_path: 'm3-done.txt', content: 'done' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        toolEventWindow: [
          requestEvent('write_file', 'write-source', false, true, {
            file_path: 'experimental/snapshot/snapshot.go',
          }),
          requestEvent('write_file', 'done', false, true, {
            file_path: 'm3-done.txt',
            content: 'done',
          }),
        ],
      }),
    );

    expect(out).toContainEqual(
      expect.objectContaining({
        id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
        attribution: expect.stringContaining(
          'advisor_request reason="final diff audit before completion"',
        ),
      }),
    );
  });

  it('strict final gate requests final diff audit on Finished after source mutations', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        advisorTriggerMode: 'hybrid',
        executorCheckpoints: strictExecutorCheckpoints,
        event: {
          type: GeminiEventType.Finished,
          value: {
            reason: undefined,
            usageMetadata: undefined,
          },
        },
        toolEventWindow: [
          requestEvent('write_file', 'write-source', false, true, {
            file_path: 'experimental/snapshot/snapshot.go',
          }),
        ],
      }),
    );

    expect(out).toContainEqual(
      expect.objectContaining({
        id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
        attribution: expect.stringContaining(
          'advisor_request reason="final diff audit before completion"',
        ),
      }),
    );
  });

  it('emits anchor test failure after protected anchors are inspected', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'test-call',
            responseParts: [{ text: 'Exit Code: 1' }],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Fix src/tax.ts only. The discount must apply before tax, and tests/tax.test.ts plus docs/tax.md are protected. Create m3-done.txt containing exactly done.',
        ),
        toolEventWindow: [
          requestEvent('read_file', 'read-src', true, false, {
            file_path: 'src/tax.ts',
          }),
          requestEvent('read_file', 'read-test', true, false, {
            file_path: 'tests/tax.test.ts',
          }),
          requestEvent('read_file', 'read-docs', true, false, {
            file_path: 'docs/tax.md',
          }),
          responseEvent('run_shell_command', 1),
        ],
      }),
    );

    expect(out.some((s) => s.id === TOOL_ANCHOR_TEST_FAILURE_SIGNAL_ID)).toBe(
      true,
    );
  });

  it('emits alias-preservation fusion signals after source search and source mutation', () => {
    const sensor = new ToolPatternSensor();
    const out = sensor.observe(
      makeInput({
        event: {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'mut-theme',
            name: 'replace',
            args: {
              file_path: 'src/theme.ts',
              old_string: 'formatShade',
              new_string: 'renderShade',
            },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        promptConstraintSummary: parsePromptConstraintSummary(
          'Rename formatShade to renderShade across src/color.ts and src/theme.ts while preserving the old alias for compatibility. Do not edit tests/color.test.ts.',
        ),
        toolEventWindow: [
          requestEvent('grep_search', 'search-src', true, false, {
            pattern: 'formatShade',
            dir_path: 'src',
          }),
          requestEvent('replace', 'mut-color', false, true, {
            file_path: 'src/color.ts',
            old_string: 'formatShade',
            new_string: 'renderShade',
          }),
          requestEvent('replace', 'mut-theme', false, true, {
            file_path: 'src/theme.ts',
            old_string: 'formatShade',
            new_string: 'renderShade',
          }),
        ],
      }),
    );

    expect(
      out.some((s) => s.id === LONGITUDINAL_M3_ANCHOR_PRESSURE_SIGNAL_ID),
    ).toBe(true);
    expect(
      out.some((s) => s.id === TOOL_ANCHOR_GUIDED_MUTATION_SIGNAL_ID),
    ).toBe(true);
    expect(out.some((s) => s.id === TOOL_CROSS_SURFACE_DRIFT_SIGNAL_ID)).toBe(
      true,
    );
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
