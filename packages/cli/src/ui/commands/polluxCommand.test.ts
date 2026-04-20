/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_POLLUX_EXPERIMENTAL_CONFIG } from '@google/gemini-cli-core';
import { polluxCommand, formatPolluxStatus } from './polluxCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';

function buildContext(overrides?: {
  enabled?: boolean;
  resolvedExecutor?: string;
  configuredExecutor?: string;
}): CommandContext {
  return createMockCommandContext({
    services: {
      agentContext: {
        config: {
          getModel: () => overrides?.resolvedExecutor ?? 'gemini-2.5-flash',
          getPolluxExperimentalConfig: () => ({
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
            enabled: overrides?.enabled ?? true,
            executorModel: overrides?.configuredExecutor ?? 'gemini-2.5-flash',
          }),
        },
      },
    },
  } as unknown as CommandContext);
}

describe('polluxCommand', () => {
  it('rejects unknown subcommands with a usage error', async () => {
    const context = buildContext();
    const result = await polluxCommand.action!(context, 'foo');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /pollux [status] [--debug]',
    });
  });

  it('rejects extra arguments after status', async () => {
    const context = buildContext();
    const result = await polluxCommand.action!(context, 'status extra');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /pollux [status] [--debug]',
    });
  });

  it('returns an error when config is not available', async () => {
    const context = createMockCommandContext({
      services: { agentContext: null },
    });

    const result = await polluxCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Pollux: config not loaded.',
    });
  });

  it('returns enabled-status snapshot with both resolved and configured executor models', async () => {
    const context = buildContext({
      enabled: true,
      resolvedExecutor: 'gemini-2.5-flash',
      configuredExecutor: 'gemini-2.5-flash',
    });

    const result = await polluxCommand.action!(context, 'status');
    expect(result).toMatchObject({
      type: 'message',
      messageType: 'info',
    });

    if (result?.type === 'message') {
      expect(result.content).toContain('Pollux is enabled. [ENABLED]');
      expect(result.content).toContain('Executor alignment: [MATCH]');
      expect(result.content).toContain(
        'Executor model (resolved): gemini-2.5-flash',
      );
      expect(result.content).toContain(
        'Executor model (configured): gemini-2.5-flash',
      );
      expect(result.content).toContain('Advisor model: gemini-3.1-pro-preview');
      expect(result.content).toContain('Detector strategy: hybrid');
      expect(result.content).toContain('Confidence threshold: 6');
      expect(result.content).toContain(
        'Advisor call budget: 2/turn, 20/session',
      );
      expect(result.content).toContain('Advisor request timeout (ms): 120000');
      expect(result.content).toContain('Settings path: experimental.pollux.*');
    }
  });

  it('reports disabled status without losing the snapshot', async () => {
    const context = buildContext({ enabled: false });
    const result = await polluxCommand.action!(context, '');

    expect(result?.type).toBe('message');
    if (result?.type === 'message') {
      expect(result.content).toContain('Pollux is disabled. [DISABLED]');
      expect(result.content).toContain('Settings path: experimental.pollux.*');
    }
  });

  it('flags executor drift when resolved differs from configured executor', async () => {
    const context = buildContext({
      enabled: true,
      resolvedExecutor: 'gemini-3.1-pro-preview',
      configuredExecutor: 'gemini-2.5-flash',
    });

    const result = await polluxCommand.action!(context, '');
    if (result?.type === 'message') {
      expect(result.content).toContain('Executor alignment: [DRIFT]');
      expect(result.content).toContain(
        'Executor model (resolved): gemini-3.1-pro-preview',
      );
      expect(result.content).toContain(
        'Executor model (configured): gemini-2.5-flash',
      );
    }
  });

  it('emits optional debug detail block when --debug is provided', async () => {
    const context = buildContext();
    const result = await polluxCommand.action!(context, 'status --debug');

    expect(result?.type).toBe('message');
    if (result?.type === 'message') {
      expect(result.content).toContain('Debug details:');
      expect(result.content).toContain('- status_indicator=[ENABLED]');
      expect(result.content).toContain('- executor_alignment=[MATCH]');
      expect(result.content).toContain('- raw_snapshot={');
    }
  });

  it('formatPolluxStatus is exported for cross-surface parity', () => {
    const formatted = formatPolluxStatus(
      {
        enabled: true,
        executorModel: 'gemini-2.5-flash',
        advisorModel: 'gemini-3.1-pro-preview',
        strategy: 'hybrid',
        maxAdvisorCallsPerTurn: 2,
        maxAdvisorCallsPerSession: 20,
        confidenceThreshold: 6,
        emitAdvisorDebug: false,
        advisorRequestTimeoutMs: 120000,
      } as Parameters<typeof formatPolluxStatus>[0],
      'gemini-2.5-flash',
    );
    expect(formatted).toContain('Pollux is enabled.');
    expect(formatted).toContain('Settings path: experimental.pollux.*');
  });
});
