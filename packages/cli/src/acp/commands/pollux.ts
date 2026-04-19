/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';
import { formatPolluxStatus } from '../../ui/commands/polluxCommand.js';

/**
 * ACP-side counterpart of the legacy `/pollux` slash command. Emits the
 * active Pollux experimental config snapshot through the ACP command
 * channel. Multi-surface registration is required by the Pollux command
 * parity contract (POLLUX_DOC_CORRECTIONS.md C-06, D-03); the legacy /
 * agent-session implementation lives at
 * packages/cli/src/ui/commands/polluxCommand.ts and shares the same
 * `formatPolluxStatus` formatter so the human-readable output is
 * byte-identical across surfaces.
 */
export class PolluxCommand implements Command {
  readonly name = 'pollux';
  readonly description = 'Show the active Pollux advisor-path configuration';

  async execute(
    context: CommandContext,
    args: string[] = [],
  ): Promise<CommandExecutionResponse> {
    const sub = (args[0] ?? '').trim();
    if (sub !== '' && sub !== 'status') {
      return {
        name: this.name,
        data: 'Usage: /pollux [status]',
      };
    }

    const config = context.agentContext.config;
    const pollux = config.getPolluxExperimentalConfig();
    const resolvedExecutor = config.getModel?.() ?? pollux.executorModel;
    return {
      name: this.name,
      data: formatPolluxStatus(pollux, resolvedExecutor),
    };
  }
}
