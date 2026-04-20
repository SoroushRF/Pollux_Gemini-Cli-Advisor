/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_POLLUX_EXPERIMENTAL_CONFIG } from '@google/gemini-cli-core';
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
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
          enabled: overrides?.enabled ?? true,
          executorModel: overrides?.configuredExecutor ?? 'gemini-2.5-flash',
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
      data: 'Usage: /pollux [status] [--debug]',
    });
  });

  it('rejects extra arguments after status for parity with legacy parsing', async () => {
    const cmd = new PolluxCommand();
    const result = await cmd.execute(buildContext(), ['status', 'extra']);
    expect(result).toEqual({
      name: 'pollux',
      data: 'Usage: /pollux [status] [--debug]',
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
    expect(data).toContain('Pollux is enabled. [ENABLED]');
    expect(data).toContain('Executor alignment: [MATCH]');
    expect(data).toContain('Executor model (resolved): gemini-2.5-flash');
    expect(data).toContain('Advisor model: gemini-3.1-pro-preview');
    expect(data).toContain('Detector strategy: hybrid');
    expect(data).toContain('Settings path: experimental.pollux.*');
  });

  it('reports disabled status when Pollux is off', async () => {
    const cmd = new PolluxCommand();
    const result = await cmd.execute(buildContext({ enabled: false }), []);
    expect(result.data).toContain('Pollux is disabled. [DISABLED]');
  });

  it('emits optional debug detail block when --debug is present', async () => {
    const cmd = new PolluxCommand();
    const result = await cmd.execute(buildContext(), ['status', '--debug']);

    expect(result.name).toBe('pollux');
    expect(result.data).toContain('Debug details:');
    expect(result.data).toContain('- status_indicator=[ENABLED]');
    expect(result.data).toContain('- executor_alignment=[MATCH]');
    expect(result.data).toContain('- raw_snapshot={');
  });
});
