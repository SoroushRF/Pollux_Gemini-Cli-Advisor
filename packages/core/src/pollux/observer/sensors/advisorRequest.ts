/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  parsePolluxAdvisorRequestTag,
  parsePolluxStatusTag,
} from '../../prompts.js';
import { GeminiEventType } from '../../../core/turn.js';
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

const CHECKPOINT_ALIAS_PATTERNS = [
  {
    reason: 'contract extraction before source edit',
    pattern: /\brequest(?:ing)?\s+(?:advisor\s+)?contract\s+extraction\b/i,
  },
  {
    reason: 'mid-run risk review after edits or failed tests',
    pattern:
      /\brequest(?:ing)?\s+(?:advisor\s+)?(?:mid[-\s]?run\s+)?risk\s+review\b/i,
  },
  {
    reason: 'final diff audit before completion',
    pattern: /\brequest(?:ing)?\s+(?:advisor\s+)?final\s+diff\s+audit\b/i,
  },
] as const;

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

function canonicalCheckpointReason(
  reason: string,
  requiredReasons: readonly string[],
): string | undefined {
  const normalized = reason.trim().replace(/\s+/g, ' ').toLowerCase();
  return requiredReasons.find(
    (candidate) =>
      candidate.trim().replace(/\s+/g, ' ').toLowerCase() === normalized,
  );
}

function extractStrictCheckpointToolText(input: SensorInput): string {
  if (input.event.type !== GeminiEventType.ToolCallRequest) {
    return '';
  }
  const request = input.event.value;
  const pieces = [request.name];
  const args = request.args;
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    for (const key of ['description', 'command', 'instruction']) {
      const value = (args)[key];
      if (typeof value === 'string') {
        pieces.push(value);
      }
    }
  }
  return pieces.join('\n');
}

function strictCheckpointToolCandidates(input: SensorInput) {
  const checkpoints = input.executorCheckpoints;
  if (!checkpoints?.enabled || checkpoints.requiredReasons.length === 0) {
    return [];
  }
  const text = extractStrictCheckpointToolText(input);
  if (!text) {
    return [];
  }
  return CHECKPOINT_ALIAS_PATTERNS.flatMap(({ reason, pattern }) => {
    if (!pattern.test(text)) {
      return [];
    }
    const canonical = canonicalCheckpointReason(
      reason,
      checkpoints.requiredReasons,
    );
    return canonical
      ? [{ reason: canonical, timing: 'now', sourceFormat: 'tool_request' }]
      : [];
  });
}

export class AdvisorRequestSensor implements Sensor {
  readonly id = ADVISOR_REQUEST_SENSOR_ID;
  private readonly emittedReasons = new Set<string>();

  beginTurn(): void {
    this.emittedReasons.clear();
  }

  observe(input: SensorInput): readonly SensorSignal[] {
    try {
      const text = extractInspectableText(input) ?? '';
      const toolCandidates = strictCheckpointToolCandidates(input);
      if (!text && toolCandidates.length === 0) {
        return [];
      }
      const candidates = [
        ...parsePolluxAdvisorRequestTag(text),
        ...toolCandidates,
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
