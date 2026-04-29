/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '../../core/turn.js';
import { LoopType } from '../../telemetry/types.js';
import {
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  PolluxEscalationReasonCode,
  mergePolluxExperimentalConfig,
} from '../types.js';
import {
  createLiveExecutorObserver,
  ingestPolluxAfterLoopCheckFailOpen,
  ingestPolluxObserverFailOpen,
  LIVE_EXECUTOR_OBSERVER_NO_OP,
} from './observer.js';

describe('pollux/observer', () => {
  it('I1: returns the shared no-op when Pollux experimental is disabled', () => {
    const obs = createLiveExecutorObserver(DEFAULT_POLLUX_EXPERIMENTAL_CONFIG);
    expect(obs).toBe(LIVE_EXECUTOR_OBSERVER_NO_OP);
    expect(createLiveExecutorObserver(DEFAULT_POLLUX_EXPERIMENTAL_CONFIG)).toBe(
      LIVE_EXECUTOR_OBSERVER_NO_OP,
    );
  });

  it('peekSameTurnIntent and consumePendingNextTurnIntent are undefined; ingest does not throw', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({ enabled: true }),
    );
    obs.beginTurn();
    expect(obs.peekSameTurnIntent()).toBeUndefined();
    expect(obs.consumeSameTurnIntent()).toBeUndefined();
    expect(obs.consumePendingNextTurnIntent()).toBeUndefined();
    const loopEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.LoopDetected,
    };
    expect(() => obs.ingest(loopEvent)).not.toThrow();
    expect(() => obs.ingestAfterLoopCheck(loopEvent)).not.toThrow();
  });

  it('returns no-op when Pollux is on but detector.observer.enabled is false', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: { observer: { enabled: false } },
      }),
    );
    expect(obs).toBe(LIVE_EXECUTOR_OBSERVER_NO_OP);
  });

  it('creates loop bridge observer when observer.enabled with loopDetection (Phase C)', () => {
    const peekState = vi.fn().mockReturnValue({
      loopDetected: true,
      lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
      detail: 'Repeated tool call',
    });
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          observer: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
      { peekState },
    );
    expect(obs).not.toBe(LIVE_EXECUTOR_OBSERVER_NO_OP);
    obs.beginTurn();
    const contentEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.Content,
      value: 'x',
    };
    obs.ingestAfterLoopCheck(contentEvent);
    expect(obs.peekSameTurnIntent()).toEqual(
      expect.objectContaining({
        timing: 'same_turn',
        pauseBoundary: 'post_event',
        reasonCode: PolluxEscalationReasonCode.HARD_LOOP,
      }),
    );
  });

  it('loop bridge does not emit same-turn HARD_LOOP when sameTurnEnabled is false', () => {
    const peekState = vi.fn().mockReturnValue({
      loopDetected: true,
      lastLoopType: LoopType.LLM_DETECTED_LOOP,
      detail: 'analysis',
    });
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          observer: { enabled: true },
          timing: { sameTurnEnabled: false, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
      { peekState },
    );
    obs.beginTurn();
    obs.ingestAfterLoopCheck({
      type: GeminiEventType.Content,
      value: 'y',
    });
    expect(obs.peekSameTurnIntent()).toBeUndefined();
  });

  it('creates a live risk-gate observer when detector.riskGate.enabled is true', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: { riskGate: { enabled: true } },
      }),
    );
    expect(obs).not.toBe(LIVE_EXECUTOR_OBSERVER_NO_OP);
  });

  it('creates a live observer when selfReport.enabled is true (Phase E)', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: { selfReport: { enabled: true } },
      }),
    );
    expect(obs).not.toBe(LIVE_EXECUTOR_OBSERVER_NO_OP);
  });

  it('self-report status tag produces a post-event same-turn intent', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          selfReport: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn();

    obs.ingest({
      type: GeminiEventType.Content,
      value:
        'x <pollux:status stuck_on="ci fails on windows" next="inspect logs"/> y',
    });

    expect(obs.peekSameTurnIntent()).toEqual(
      expect.objectContaining({
        timing: 'same_turn',
        pauseBoundary: 'post_event',
        reasonCode: PolluxEscalationReasonCode.SELF_REPORT_STUCK,
      }),
    );
  });

  it('self-report status tag split across content chunks still produces a same-turn intent', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          selfReport: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn();

    obs.ingest({
      type: GeminiEventType.Content,
      value: 'x <pollux:status stuck_on="ci fails',
    });
    expect(obs.peekSameTurnIntent()).toBeUndefined();

    obs.ingest({
      type: GeminiEventType.Content,
      value: ' on windows" next="inspect logs"/> y',
    });

    expect(obs.peekSameTurnIntent()).toEqual(
      expect.objectContaining({
        timing: 'same_turn',
        pauseBoundary: 'post_event',
        reasonCode: PolluxEscalationReasonCode.SELF_REPORT_STUCK,
      }),
    );
  });

  it('self-report status tag split inside stuck_on still produces a same-turn intent', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          selfReport: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn();

    obs.ingest({
      type: GeminiEventType.Content,
      value: '<pollux:status stuck',
    });
    expect(obs.peekSameTurnIntent()).toBeUndefined();

    obs.ingest({
      type: GeminiEventType.Content,
      value: '_on="drafting memo" next="write preview"/>',
    });

    expect(obs.peekSameTurnIntent()).toEqual(
      expect.objectContaining({
        timing: 'same_turn',
        pauseBoundary: 'post_event',
        reasonCode: PolluxEscalationReasonCode.SELF_REPORT_STUCK,
      }),
    );
  });

  it('does not treat malformed no-space status near-misses as self-report escalation', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          selfReport: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn();

    obs.ingest({
      type: GeminiEventType.Content,
      value:
        '<pollux:statusstuck_on="ci fails on windows" next="inspect logs"/>',
    });

    expect(obs.peekSameTurnIntent()).toBeUndefined();
  });

  it('executor advisor request tag produces a same-turn advisor-request intent', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        advisorTriggerMode: 'executor_request',
        detector: {
          selfReport: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn();

    obs.ingest({
      type: GeminiEventType.Content,
      value:
        '<pollux:advisor_request reason="need alias map before editing" timing="now"/>',
    });

    expect(obs.peekSameTurnIntent()).toEqual(
      expect.objectContaining({
        timing: 'same_turn',
        pauseBoundary: 'post_event',
        reasonCode: PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST,
        contributingSignalIds: ['self.advisor_request'],
      }),
    );
  });

  it('executor_request mode ignores detector-only status tags', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        advisorTriggerMode: 'executor_request',
        detector: {
          selfReport: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn();

    obs.ingest({
      type: GeminiEventType.Content,
      value:
        '<pollux:status stuck_on="ordinary self report" next="inspect logs"/>',
    });

    expect(obs.peekSameTurnIntent()).toBeUndefined();
  });

  it('emits a pre-tool same-turn intent for high-risk shell commands', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: { riskGate: { enabled: true } },
      }),
    );
    obs.beginTurn();

    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'call-1',
        name: 'run_shell_command',
        args: { command: 'rm -rf /tmp/*' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    };

    obs.ingest(event);
    const intent = obs.peekSameTurnIntent();
    expect(intent).toEqual(
      expect.objectContaining({
        timing: 'same_turn',
        pauseBoundary: 'pre_tool',
        reasonCode: PolluxEscalationReasonCode.RISK_GATE_BLOCK,
        contributingSignalAttributions: expect.arrayContaining([
          expect.stringMatching(/^generic_shell:built_in:/),
        ]),
      }),
    );
    expect(obs.consumeSameTurnIntent()).toEqual(intent);
  });

  it('emits a pre-tool same-turn intent for prompt-protected test/docs edits', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: { riskGate: { enabled: true } },
      }),
    );
    obs.beginTurn(
      'Fix src/tax.ts only. The discount must apply before tax, and tests/tax.test.ts plus docs/tax.md are protected.',
    );

    obs.ingest({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'call-protected-doc',
        name: 'replace',
        args: {
          file_path: 'docs/tax.md',
          old_string: 'Apply discount before computing tax.',
          new_string: 'Apply tax before discount.',
        },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    });

    expect(obs.peekSameTurnIntent()).toEqual(
      expect.objectContaining({
        timing: 'same_turn',
        pauseBoundary: 'pre_tool',
        reasonCode: PolluxEscalationReasonCode.RISK_GATE_BLOCK,
        contributingSignalAttributions: expect.arrayContaining([
          'prompt_protected_path:docs/tax.md',
        ]),
      }),
    );
  });

  it('queues pre-mutation review before public-interface source repair', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          observer: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn(
      'Fix the transitive import/export mismatch so view.ts uses the canonical createStableLabel implementation through the public index. Do not change src/labels.ts behavior or tests/view.test.ts.',
    );

    for (const [callId, filePath] of [
      ['read-0', 'src/index.ts'],
      ['read-1', 'src/labels.ts'],
      ['read-2', 'src/view.ts'],
      ['read-3', 'tests/view.test.ts'],
    ] as const) {
      obs.ingest({
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId,
          name: 'read_file',
          args: { file_path: filePath },
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
      });
    }

    obs.ingest({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'mut-1',
        name: 'replace',
        args: {
          file_path: 'src/view.ts',
          old_string: 'createLabel',
          new_string: 'createStableLabel',
        },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    });
    obs.ingest({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'mut-2',
        name: 'replace',
        args: {
          file_path: 'src/index.ts',
          old_string: 'createLabel',
          new_string: 'createStableLabel',
        },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    });

    const reviewIntent =
      obs.peekSameTurnIntent() ?? obs.consumePendingNextTurnIntent();

    expect(reviewIntent).toEqual(
      expect.objectContaining({
        reasonCode: PolluxEscalationReasonCode.PRE_MUTATION_REVIEW,
        contributingSignalIds: expect.arrayContaining([
          'tool.pre_mutation_advisor',
        ]),
      }),
    );
  });

  it('queues pre-mutation review for protected-anchor source repair without protected mutation', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          observer: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn(
      'Fix src/csv.ts so it satisfies the parser edge cases expressed by tests/csv.test.ts. Do not weaken or edit the test or README. Create m3-done.txt containing exactly done.',
    );

    for (const [callId, filePath] of [
      ['read-src', 'src/csv.ts'],
      ['read-test', 'tests/csv.test.ts'],
      ['read-readme', 'README.md'],
    ] as const) {
      obs.ingest({
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId,
          name: 'read_file',
          args: { file_path: filePath },
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
      });
    }

    obs.ingest({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'write-src',
        name: 'write_file',
        args: {
          file_path: 'src/csv.ts',
          content: 'export function parseCsvLine(line: string) { return []; }',
        },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    });

    const reviewIntent =
      obs.peekSameTurnIntent() ?? obs.consumePendingNextTurnIntent();
    expect(reviewIntent).toEqual(
      expect.objectContaining({
        reasonCode: PolluxEscalationReasonCode.PRE_MUTATION_REVIEW,
        contributingSignalIds: expect.arrayContaining([
          'tool.pre_mutation_advisor',
        ]),
      }),
    );
  });

  it('keeps straightforward refactor controls quiet', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          observer: { enabled: true },
          riskGate: { enabled: true },
        },
      }),
    );
    obs.beginTurn('Rename helper in src/app.ts and create m3-done.txt.');

    obs.ingest({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'read-app',
        name: 'read_file',
        args: { file_path: 'src/app.ts' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    });
    obs.ingest({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'write-app',
        name: 'replace',
        args: {
          file_path: 'src/app.ts',
          old_string: 'oldName',
          new_string: 'newName',
        },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    });

    expect(obs.peekSameTurnIntent()).toBeUndefined();
    expect(obs.consumePendingNextTurnIntent()).toBeUndefined();
  });

  it('composite: risk pre_tool then HARD_LOOP post_event from loop bridge', () => {
    const peekState = vi.fn().mockReturnValue({
      loopDetected: true,
      lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
      detail: 'loop',
    });
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          riskGate: { enabled: true },
          observer: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
      { peekState },
    );
    obs.beginTurn();

    const toolEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'call-1',
        name: 'run_shell_command',
        args: { command: 'rm -rf /tmp/*' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    };
    obs.ingest(toolEvent);
    expect(obs.peekSameTurnIntent()?.reasonCode).toBe(
      PolluxEscalationReasonCode.RISK_GATE_BLOCK,
    );
    obs.consumeSameTurnIntent();

    obs.ingestAfterLoopCheck({
      type: GeminiEventType.Content,
      value: 'chunk',
    });
    expect(obs.peekSameTurnIntent()).toEqual(
      expect.objectContaining({
        reasonCode: PolluxEscalationReasonCode.HARD_LOOP,
        pauseBoundary: 'post_event',
      }),
    );
  });

  it('I11: after one same-turn escalation in a turn, later high-risk events downgrade to next-turn', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          riskGate: { enabled: true },
          timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
        },
      }),
    );
    obs.beginTurn();

    const highRiskEvent = (callId: string): ServerGeminiStreamEvent => ({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId,
        name: 'run_shell_command',
        args: { command: 'git push --force origin main' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    });

    obs.ingest(highRiskEvent('call-1'));
    expect(obs.consumeSameTurnIntent()).toBeDefined();

    obs.ingest(highRiskEvent('call-2'));
    expect(obs.peekSameTurnIntent()).toBeUndefined();
    expect(obs.consumePendingNextTurnIntent()).toEqual(
      expect.objectContaining({
        timing: 'next_turn',
        reasonCode: PolluxEscalationReasonCode.RISK_GATE_BLOCK,
      }),
    );
  });

  it('I3 / TG-11: ingestPolluxObserverFailOpen swallows observer ingest errors', () => {
    const throwing = {
      ingest(): void {
        throw new Error('synthetic sensor throw');
      },
    };
    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.LoopDetected,
    };
    expect(() => ingestPolluxObserverFailOpen(throwing, event)).not.toThrow();
  });

  it('I3: ingestPolluxAfterLoopCheckFailOpen swallows ingestAfterLoopCheck errors', () => {
    const throwing = {
      ingestAfterLoopCheck(): void {
        throw new Error('synthetic loop bridge throw');
      },
    };
    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.Content,
      value: 'z',
    };
    expect(() =>
      ingestPolluxAfterLoopCheckFailOpen(throwing, event),
    ).not.toThrow();
  });

  it('bounded: evicts oldest thought entries when maxThoughtWindowChars is exceeded (FIFO)', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          // mergePolluxDetectorConfig enforces a minimum maxThoughtWindowChars of 1024.
          observer: { enabled: true, maxThoughtWindowChars: 1024 },
        },
      }),
    );
    obs.beginTurn();

    const thought = (
      subject: string,
      description: string,
    ): ServerGeminiStreamEvent => ({
      type: GeminiEventType.Thought,
      value: { subject, description },
    });

    const chunk = (ch: string, size: number) => ch.repeat(size);
    obs.ingest(thought('s1', chunk('a', 400)));
    obs.ingest(thought('s2', chunk('b', 400)));
    obs.ingest(thought('s3', chunk('c', 400))); // pushes over 1024 -> evict oldest

    const window = (
      obs as unknown as {
        thoughtWindow?: {
          entries: Array<{ subject: string; description: string }>;
        };
      }
    ).thoughtWindow?.entries;
    expect(window).toBeDefined();
    expect(window!.map((entry) => entry.subject)).toEqual(['s2', 's3']);
  });

  it('bounded: tool event window keeps only the last maxToolEventWindow events (FIFO)', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: {
          observer: { enabled: true, maxToolEventWindow: 3 },
        },
      }),
    );
    obs.beginTurn();

    const request = (callId: string): ServerGeminiStreamEvent => ({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId,
        name: 'run_shell_command',
        args: { command: 'ls' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    });

    // Each request adds one ToolEventRecord; ingest 5 -> keep last 3.
    obs.ingest(request('c1'));
    obs.ingest(request('c2'));
    obs.ingest(request('c3'));
    obs.ingest(request('c4'));
    obs.ingest(request('c5'));

    const toolWindow = (
      obs as unknown as {
        toolEventWindow?: Array<{ callId?: string }>;
      }
    ).toolEventWindow;
    expect(toolWindow).toBeDefined();
    expect(toolWindow!.map((entry) => entry.callId)).toEqual([
      'c3',
      'c4',
      'c5',
    ]);
  });
});
