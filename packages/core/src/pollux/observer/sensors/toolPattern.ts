/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiEventType } from '../../../core/turn.js';
import { SHELL_TOOL_NAME } from '../../../tools/definitions/base-declarations.js';
import type { Sensor, SensorInput, SensorSignal } from './base.js';

/** Tool-pattern sensor slot (Phase D). */
export const TOOL_PATTERN_SENSOR_ID = 'sensor.tool_pattern' as const;

export const TOOL_IDENTICAL_REPEAT_SIGNAL_ID = 'tool.identical_repeat' as const;
export const TOOL_EXIT_REGRESSION_SIGNAL_ID = 'tool.exit_regression' as const;
export const TOOL_FAILURE_CASCADE_SIGNAL_ID = 'tool.failure_cascade' as const;
export const TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID =
  'tool.search_without_decide' as const;
export const TOOL_TOKEN_BURN_SIGNAL_ID = 'tool.token_burn' as const;

const NON_EXPLORATORY_PROMPT_RE = /\b(fix|implement|add|make.*work)\b/i;
const EXPLORATORY_PROMPT_RE =
  /\b(explore|investigate|inspect|research|look into|analyze|learn)\b/i;

function isNonExploratoryPrompt(prompt: string): boolean {
  if (prompt.trim().length === 0) {
    return false;
  }
  if (EXPLORATORY_PROMPT_RE.test(prompt)) {
    return false;
  }
  return NON_EXPLORATORY_PROMPT_RE.test(prompt);
}

export class ToolPatternSensor implements Sensor {
  readonly id = TOOL_PATTERN_SENSOR_ID;

  observe(input: SensorInput): readonly SensorSignal[] {
    try {
      const nowMs = Date.now();
      const out: SensorSignal[] = [];
      const requestEvents = input.toolEventWindow.filter(
        (entry) => entry.phase === 'request',
      );
      const responseEvents = input.toolEventWindow.filter(
        (entry) => entry.phase === 'response',
      );

      if (input.event.type === GeminiEventType.ToolCallRequest) {
        const latest = requestEvents.at(-1);
        if (latest) {
          const repeats = requestEvents.filter(
            (entry) =>
              entry.name === latest.name && entry.argsHash === latest.argsHash,
          ).length;
          if (repeats >= 3) {
            out.push({
              id: TOOL_IDENTICAL_REPEAT_SIGNAL_ID,
              weight: 2,
              precisionPrior: 0.75,
              category: 'tool',
              tsMs: nowMs,
              attribution: `${latest.name} repeated ${repeats} times`,
            });
          }
        }
      }

      if (input.event.type === GeminiEventType.ToolCallResponse) {
        const shellExitCodes = responseEvents
          .filter(
            (entry) =>
              entry.name === SHELL_TOOL_NAME && entry.exitCode !== undefined,
          )
          .map((entry) => entry.exitCode!);
        const last4 = shellExitCodes.slice(-4);
        if (
          last4.length === 4 &&
          last4[0] === 1 &&
          last4[1] === 0 &&
          last4[2] === 1 &&
          last4[3] === 0
        ) {
          out.push({
            id: TOOL_EXIT_REGRESSION_SIGNAL_ID,
            weight: 1,
            precisionPrior: 0.5,
            category: 'tool',
            tsMs: nowMs,
            attribution: 'shell exit oscillation 1→0→1→0',
          });
        }

        let failureCascadeCount = 0;
        for (let i = responseEvents.length - 1; i >= 0; i--) {
          const entry = responseEvents[i];
          const isFailure =
            entry.schemaError === true ||
            (entry.exitCode !== undefined && entry.exitCode !== 0);
          if (!isFailure) {
            break;
          }
          failureCascadeCount++;
        }
        if (failureCascadeCount >= 3) {
          out.push({
            id: TOOL_FAILURE_CASCADE_SIGNAL_ID,
            weight: 2,
            precisionPrior: 0.8,
            category: 'tool',
            tsMs: nowMs,
            attribution: `${failureCascadeCount} consecutive failures`,
          });
        }
      }

      if (requestEvents.length >= 8) {
        const readOnlyCalls = requestEvents.filter(
          (entry) => entry.readOnly,
        ).length;
        const mutationCalls = requestEvents.filter(
          (entry) => entry.mutation,
        ).length;
        if (
          readOnlyCalls >= 8 &&
          mutationCalls === 0 &&
          isNonExploratoryPrompt(input.userPromptText ?? '')
        ) {
          out.push({
            id: TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID,
            weight: 1,
            precisionPrior: 0.45,
            category: 'tool',
            tsMs: nowMs,
            attribution: `${readOnlyCalls} read-only calls without mutation`,
          });
        }
      }

      const medianSuccessfulTurnTokens =
        input.sessionMedianSuccessfulTurnTokens ?? 0;
      const currentTurnTokens = input.currentTurnTokenCount ?? 0;
      if (
        currentTurnTokens > 0 &&
        medianSuccessfulTurnTokens > 0 &&
        currentTurnTokens > medianSuccessfulTurnTokens * 2
      ) {
        out.push({
          id: TOOL_TOKEN_BURN_SIGNAL_ID,
          weight: 1,
          precisionPrior: 0.55,
          category: 'tool',
          tsMs: nowMs,
          attribution: `${currentTurnTokens} tokens vs median ${medianSuccessfulTurnTokens}`,
        });
      }

      return out;
    } catch {
      return [];
    }
  }
}
