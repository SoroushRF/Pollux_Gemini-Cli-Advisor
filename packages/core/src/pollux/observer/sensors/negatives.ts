/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Sensor, SensorInput, SensorSignal } from './base.js';

export const NEGATIVE_SENSOR_ID = 'sensor.negatives' as const;

export const NEG_EXIT_ZERO_SIGNAL_ID = 'neg.exit_zero' as const;
export const NEG_CONCRETE_SUBJECT_SIGNAL_ID = 'neg.concrete_subject' as const;
export const NEG_CONFIDENT_CLOSE_SIGNAL_ID = 'neg.confident_close' as const;
export const NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID =
  'neg.recent_advisor_success' as const;
export const NEG_EARLY_TURN_SIGNAL_ID = 'neg.early_turn' as const;

const ACTION_SUBJECT_RE = /\b(editing|writing|running|applied)\b/i;
const HEDGE_RE =
  /\b(maybe|perhaps|i think|might|let me try|actually|wait|hmm)\b/i;

function tokenCount(text: string): number {
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

export class NegativeSignalsSensor implements Sensor {
  readonly id = NEGATIVE_SENSOR_ID;

  observe(input: SensorInput): readonly SensorSignal[] {
    try {
      const nowMs = Date.now();
      const out: SensorSignal[] = [];
      const lastToolResponse = [...input.toolEventWindow]
        .reverse()
        .find((entry) => entry.phase === 'response');
      if (lastToolResponse?.exitCode === 0) {
        out.push({
          id: NEG_EXIT_ZERO_SIGNAL_ID,
          weight: -1,
          precisionPrior: 1,
          category: 'tool',
          tsMs: nowMs,
          attribution: 'last tool exit was zero',
        });
      }

      const lastThought = input.thoughtWindow.at(-1);
      if (lastThought && ACTION_SUBJECT_RE.test(lastThought.subject)) {
        out.push({
          id: NEG_CONCRETE_SUBJECT_SIGNAL_ID,
          weight: -1,
          precisionPrior: 1,
          category: 'thought',
          tsMs: nowMs,
          attribution: `thought subject="${lastThought.subject}"`,
        });
      }

      const modelOutput = input.currentTurnModelOutput ?? '';
      if (tokenCount(modelOutput) > 80 && !HEDGE_RE.test(modelOutput)) {
        out.push({
          id: NEG_CONFIDENT_CLOSE_SIGNAL_ID,
          weight: -2,
          precisionPrior: 1,
          category: 'thought',
          tsMs: nowMs,
          attribution: 'long confident output without hedges',
        });
      }

      if (input.recentAdvisorSuccessWithinTurns) {
        out.push({
          id: NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID,
          weight: -1,
          precisionPrior: 1,
          category: 'longitudinal',
          tsMs: nowMs,
          attribution: 'recent advisor consultation ended successfully',
        });
      }

      if ((input.turnToolCallCount ?? 0) < 2) {
        out.push({
          id: NEG_EARLY_TURN_SIGNAL_ID,
          weight: -1,
          precisionPrior: 1,
          category: 'longitudinal',
          tsMs: nowMs,
          attribution: 'fewer than two tool calls this turn',
        });
      }

      return out;
    } catch {
      return [];
    }
  }
}
