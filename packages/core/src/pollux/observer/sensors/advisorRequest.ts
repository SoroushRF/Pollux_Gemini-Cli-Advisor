/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  parsePolluxAdvisorRequestTag,
  parsePolluxStatusTag,
} from '../../prompts.js';
import type { Sensor, SensorInput, SensorSignal } from './base.js';
import { extractInspectableText } from './selfReport.js';

export const ADVISOR_REQUEST_SENSOR_ID = 'sensor.advisor_request' as const;
export const SELF_ADVISOR_REQUEST_SIGNAL_ID = 'self.advisor_request' as const;

const TRIVIAL_REASONS = new Set([
  'n/a',
  'na',
  'none',
  'nothing',
  'unknown',
  'unsure',
  'help',
]);

const STATUS_ADVISOR_HINT_RE =
  /\b(stuck|unsure|risky|invariant|cannot determine|need review|preserve|terminal|alias|state machine|negative space|compatibility)\b/i;

function isNonTrivialAdvisorReason(
  reason: string | undefined,
): reason is string {
  if (typeof reason !== 'string') {
    return false;
  }
  const normalized = reason.trim().toLowerCase();
  if (normalized.length < 6 || TRIVIAL_REASONS.has(normalized)) {
    return false;
  }
  return /[a-z0-9]/i.test(normalized);
}

export class AdvisorRequestSensor implements Sensor {
  readonly id = ADVISOR_REQUEST_SENSOR_ID;
  private readonly emittedReasons = new Set<string>();

  beginTurn(): void {
    this.emittedReasons.clear();
  }

  observe(input: SensorInput): readonly SensorSignal[] {
    try {
      const text = extractInspectableText(input);
      if (!text) {
        return [];
      }
      const candidates = [
        ...parsePolluxAdvisorRequestTag(text),
        ...parsePolluxStatusTag(text).map((status) => {
          const reason = [status.stuckOn, status.next]
            .filter((entry): entry is string => typeof entry === 'string')
            .join(' ');
          return STATUS_ADVISOR_HINT_RE.test(reason)
            ? ({
                reason,
                timing: 'now',
                sourceFormat: 'status',
              } as const)
            : undefined;
        }),
      ];
      const tag = candidates.find((candidate) => {
        if (!isNonTrivialAdvisorReason(candidate?.reason)) {
          return false;
        }
        const dedupeKey = candidate.reason.trim().toLowerCase();
        return !this.emittedReasons.has(dedupeKey);
      });
      if (!tag?.reason) {
        return [];
      }
      const reason = tag.reason.trim();
      const dedupeKey = reason.toLowerCase();
      if (this.emittedReasons.has(dedupeKey)) {
        return [];
      }
      this.emittedReasons.add(dedupeKey);
      return [
        {
          id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
          weight: 3,
          precisionPrior: 0.95,
          category: 'self',
          hardPrecision: true,
          tsMs: Date.now(),
          attribution: `advisor_request reason="${reason}"`,
        },
      ];
    } catch {
      return [];
    }
  }
}
