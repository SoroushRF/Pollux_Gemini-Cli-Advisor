/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { PolluxCommand } from './pollux.js';
import type { CommandContext } from './types.js';

function buildContext(overrides?: {
  enabled?: boolean;
  resolvedExecutor?: string;
  configuredExecutor?: string;
}): CommandContext {
  return {
    agentContext: {
      config: {
        getModel: () => overrides?.resolvedExecutor ?? 'gemini-2.5-flash',
        getPolluxExperimentalConfig: () => ({
          enabled: overrides?.enabled ?? true,
          executorModel: overrides?.configuredExecutor ?? 'gemini-2.5-flash',
          advisorModel: 'gemini-3.1-pro-preview',
          strategy: 'hybrid',
          maxAdvisorCallsPerTurn: 2,
          maxAdvisorCallsPerSession: 20,
          confidenceThreshold: 6,
          emitAdvisorDebug: false,
          advisorRequestTimeoutMs: 120000,
        }),
      },
    },
  } as unknown as CommandContext;
}

describe('ACP PolluxCommand', () => {
  it('exposes the same name and description used by the legacy slash command', () => {
    const cmd = new PolluxCommand();
    expect(cmd.name).toBe('pollux');
    expect(cmd.description).toContain('Pollux');
  });

  it('rejects unknown subcommands with the same usage text as the legacy surface', async () => {
    const cmd = new PolluxCommand();
    const result = await cmd.execute(buildContext(), ['foo']);
    expect(result).toEqual({
      name: 'pollux',
      data: 'Usage: /pollux [status]',
    });
  });

  it('returns the formatted status snapshot for status / no-arg invocations', async () => {
    const cmd = new PolluxCommand();
    const result = await cmd.execute(buildContext({ enabled: true }), [
      'status',
    ]);

    expect(result.name).toBe('pollux');
    expect(typeof result.data).toBe('string');
    const data = result.data as string;
    expect(data).toContain('Pollux is enabled.');
    expect(data).toContain('Executor model (resolved): gemini-2.5-flash');
    expect(data).toContain('Advisor model: gemini-3.1-pro-preview');
    expect(data).toContain('Detector strategy: hybrid');
    expect(data).toContain('Settings path: experimental.pollux.*');
  });

  it('reports disabled status when Pollux is off', async () => {
    const cmd = new PolluxCommand();
    const result = await cmd.execute(buildContext({ enabled: false }), []);
    expect(result.data).toContain('Pollux is disabled.');
  });
});
