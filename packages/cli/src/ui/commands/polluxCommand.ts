/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';
import type {
  MessageActionReturn,
  PolluxExperimentalConfig,
} from '@google/gemini-cli-core';

export const POLLUX_USAGE = 'Usage: /pollux [status] [--debug]';

type PolluxCommandOptions = {
  showDebugDetails: boolean;
};

export function parsePolluxCommandArgs(
  tokens: readonly string[],
): PolluxCommandOptions | null {
  let sawStatus = false;
  let showDebugDetails = false;

  for (const token of tokens) {
    if (token === 'status') {
      if (sawStatus) {
        return null;
      }
      sawStatus = true;
      continue;
    }

    if (token === '--debug') {
      if (showDebugDetails) {
        return null;
      }
      showDebugDetails = true;
      continue;
    }

    return null;
  }

  return { showDebugDetails };
}

/**
 * Read-only Pollux status command. Emits the active Pollux experimental
 * config snapshot so users can verify which executor / advisor models, which
 * detector flags, and which advisor-call budget the runtime is using.
 *
 * Pollux contract reference: POLLUX_SPEC.md sections 6 (advisor call), 7
 * (detector strategy), 8 (settings). This command intentionally does not
 * mutate any state; toggle / interactive UX is P5-02 work.
 *
 * Multi-surface registration is required by the Pollux command parity
 * contract (POLLUX_DOC_CORRECTIONS.md C-06, D-03). The matching ACP
 * implementation lives at packages/cli/src/acp/commands/pollux.ts and shares
 * the `formatPolluxStatus` formatter so the human-readable output is
 * byte-identical across surfaces.
 */
export const polluxCommand: SlashCommand = {
  name: 'pollux',
  description: 'Show the active Pollux advisor-path configuration',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const tokens = (args ?? '')
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 0);
    const parsedArgs = parsePolluxCommandArgs(tokens);
    if (!parsedArgs) {
      return {
        type: 'message',
        messageType: 'error',
        content: POLLUX_USAGE,
      };
    }

    const config = context.services.agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Pollux: config not loaded.',
      };
    }

    const pollux = config.getPolluxExperimentalConfig();
    const resolvedExecutor = config.getModel?.() ?? pollux.executorModel;
    return {
      type: 'message',
      messageType: 'info',
      content: formatPolluxStatus(pollux, resolvedExecutor, parsedArgs),
    };
  },
};

/**
 * Format the Pollux experimental config as a human-readable status block.
 * `resolvedExecutor` is the model the router will actually use for the
 * executor turn (see PRE-5-01: when Pollux is enabled, this is the merged
 * `pollux.executorModel`; when disabled, it falls back to the global
 * `settings.model.name`). Exported for cross-surface parity with the ACP
 * implementation.
 */
export function formatPolluxStatus(
  pollux: PolluxExperimentalConfig,
  resolvedExecutor: string,
  options: PolluxCommandOptions = { showDebugDetails: false },
): string {
  const lines: string[] = [];
  const statusIndicator = pollux.enabled ? '[ENABLED]' : '[DISABLED]';
  const alignmentIndicator =
    resolvedExecutor === pollux.executorModel ? '[MATCH]' : '[DRIFT]';

  if (pollux.enabled) {
    lines.push(`Pollux is enabled. ${statusIndicator}`);
  } else {
    lines.push(`Pollux is disabled. ${statusIndicator}`);
  }
  lines.push(`Executor alignment: ${alignmentIndicator}`);
  lines.push(`Executor model (resolved): ${resolvedExecutor}`);
  lines.push(`Executor model (configured): ${pollux.executorModel}`);
  lines.push(`Advisor model: ${pollux.advisorModel}`);
  lines.push(
    `Detector flags: riskGate=${pollux.detector.riskGate.enabled ? 'on' : 'off'} observer=${pollux.detector.observer.enabled ? 'on' : 'off'} selfReport=${pollux.detector.selfReport.enabled ? 'on' : 'off'} sameTurn=${pollux.detector.timing.sameTurnEnabled ? 'on' : 'off'}`,
  );
  lines.push(
    `Advisor call budget: ${pollux.maxAdvisorCallsPerTurn}/turn, ${pollux.maxAdvisorCallsPerSession}/session`,
  );
  lines.push(`Advisor request timeout (ms): ${pollux.advisorRequestTimeoutMs}`);
  lines.push(`Emit advisor debug telemetry: ${pollux.emitAdvisorDebug}`);

  if (options.showDebugDetails) {
    lines.push('Debug details:');
    lines.push(`- status_indicator=${statusIndicator}`);
    lines.push(`- executor_alignment=${alignmentIndicator}`);
    lines.push(
      `- raw_snapshot=${JSON.stringify({
        enabled: pollux.enabled,
        executorModel: pollux.executorModel,
        advisorModel: pollux.advisorModel,
        maxAdvisorCallsPerTurn: pollux.maxAdvisorCallsPerTurn,
        maxAdvisorCallsPerSession: pollux.maxAdvisorCallsPerSession,
        emitAdvisorDebug: pollux.emitAdvisorDebug,
        advisorRequestTimeoutMs: pollux.advisorRequestTimeoutMs,
        detector: pollux.detector,
      })}`,
    );
  }

  lines.push('Settings path: experimental.pollux.*');
  return lines.join('\n');
}
