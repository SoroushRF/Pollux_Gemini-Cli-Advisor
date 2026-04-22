/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiEventType } from '../../../core/turn.js';
import {
  extractPolluxConfidenceTagValues,
  parsePolluxStatusTag,
} from '../../prompts.js';
import type { Sensor, SensorInput, SensorSignal } from './base.js';

/** Structured self-report sensor slot (Phase E). */
export const SELF_REPORT_SENSOR_ID = 'sensor.self_report' as const;

export const SELF_STRUCTURED_STATUS_STUCK_SIGNAL_ID =
  'self.structured_status_stuck' as const;
export const SELF_CONFIDENCE_LOW_SIGNAL_ID = 'self.confidence_low' as const;

export const SELF_STRUCTURED_STATUS_STUCK_WEIGHT = 3;
export const SELF_STRUCTURED_STATUS_STUCK_PRECISION_PRIOR = 0.95;

export const SELF_CONFIDENCE_LOW_WEIGHT = 2;
export const SELF_CONFIDENCE_LOW_PRECISION_PRIOR = 0.85;

const NON_TRIVIAL_STUCK_TOKENS = 2;
const TRIVIAL_STUCK_VALUES = new Set(['nothing', 'n/a', 'no', 'none']);

function tokenCount(text: string): number {
  return text
    .trim()
    .split(/\s+/g)
    .filter((t) => t.length > 0).length;
}

function isNonTrivialStuckValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const normalized = trimmed.toLowerCase();
  if (TRIVIAL_STUCK_VALUES.has(normalized)) return false;
  return tokenCount(trimmed) >= NON_TRIVIAL_STUCK_TOKENS;
}

function extractInspectableText(input: SensorInput): string | undefined {
  if (input.event.type === GeminiEventType.Thought) {
    const entry = input.event.value;
    return `${entry.subject}\n${entry.description}`.trim();
  }
  if (input.event.type === GeminiEventType.Content) {
    return String(input.event.value ?? '').trim();
  }
  return undefined;
}

export class SelfReportSensor implements Sensor {
  readonly id = SELF_REPORT_SENSOR_ID;

  observe(input: SensorInput): readonly SensorSignal[] {
    try {
      const text = extractInspectableText(input);
      if (!text) return [];

      const nowMs = Date.now();
      const out: SensorSignal[] = [];

      const statusTags = parsePolluxStatusTag(text);
      for (const tag of statusTags) {
        if (
          typeof tag.stuckOn === 'string' &&
          isNonTrivialStuckValue(tag.stuckOn)
        ) {
          out.push({
            id: SELF_STRUCTURED_STATUS_STUCK_SIGNAL_ID,
            weight: SELF_STRUCTURED_STATUS_STUCK_WEIGHT,
            precisionPrior: SELF_STRUCTURED_STATUS_STUCK_PRECISION_PRIOR,
            category: 'self',
            hardPrecision: true,
            tsMs: nowMs,
            attribution: `self_report stuck_on="${tag.stuckOn.trim()}"`,
          });
          break;
        }
      }

      const confidences = extractPolluxConfidenceTagValues(text);
      if (confidences.some((value) => Number.isFinite(value) && value <= 3)) {
        out.push({
          id: SELF_CONFIDENCE_LOW_SIGNAL_ID,
          weight: SELF_CONFIDENCE_LOW_WEIGHT,
          precisionPrior: SELF_CONFIDENCE_LOW_PRECISION_PRIOR,
          category: 'self',
          hardPrecision: false,
          tsMs: nowMs,
          attribution: 'pollux:confidence<=3',
        });
      }

      return out;
    } catch {
      return [];
    }
  }
}
