/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '../../core/turn.js';
import {
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  PolluxEscalationReasonCode,
  mergePolluxExperimentalConfig,
} from '../types.js';
import {
  createLiveExecutorObserver,
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

  it('returns no-op singleton when observer.enabled is true until real observer ships', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({
        enabled: true,
        detector: { observer: { enabled: true } },
      }),
    );
    expect(obs).toBe(LIVE_EXECUTOR_OBSERVER_NO_OP);
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
      }),
    );
    expect(obs.consumeSameTurnIntent()).toEqual(intent);
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
});
