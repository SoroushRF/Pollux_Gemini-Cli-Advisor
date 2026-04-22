/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import levenshtein from 'fast-levenshtein';
import { GeminiEventType } from '../../../core/turn.js';
import type { Sensor, SensorInput, SensorSignal } from './base.js';

/** Thought-stream sensor slot (Phase D). */
export const THOUGHT_SENSOR_ID = 'sensor.thought' as const;

export const THOUGHT_SUBJECT_LOOP_SIGNAL_ID = 'thought.subject_loop' as const;
export const THOUGHT_HEDGE_DENSITY_SIGNAL_ID = 'thought.hedge_density' as const;
export const THOUGHT_SELF_CONTRADICTION_SIGNAL_ID =
  'thought.self_contradiction' as const;
export const THOUGHT_STALL_SIGNAL_ID = 'thought.stall' as const;
export const THOUGHT_ENTROPY_SPIKE_SIGNAL_ID = 'thought.entropy_spike' as const;

const HEDGE_PATTERNS = [
  /\bmaybe\b/i,
  /\bperhaps\b/i,
  /\bi think\b/i,
  /\bmight\b/i,
  /\blet me try\b/i,
  /\bactually\b/i,
  /\bwait\b/i,
  /\bhmm\b/i,
] as const;

const SELF_CONTRADICTION_RE =
  /\b(actually no|wait that'?s wrong|scratch that|on second thought)\b/i;
const HEDGE_DENSITY_THRESHOLD = 0.06;
const SUBJECT_LOOP_MIN_OCCURRENCES = 3;
const STALL_DESCRIPTION_DELTA = 8;

function normalizeSubject(subject: string): string {
  return subject.toLowerCase().trim().replace(/\s+/g, ' ');
}

function countTokens(text: string): number {
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

function countHedgeMatches(text: string): number {
  let count = 0;
  for (const pattern of HEDGE_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags + 'g'));
    count += matches?.length ?? 0;
  }
  return count;
}

function areSubjectsSimilar(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  return levenshtein.get(a, b) <= 3;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export class ThoughtSensor implements Sensor {
  readonly id = THOUGHT_SENSOR_ID;

  observe(input: SensorInput): readonly SensorSignal[] {
    try {
      if (input.event.type !== GeminiEventType.Thought) {
        return [];
      }
      const window = input.thoughtWindow;
      if (window.length === 0) {
        return [];
      }
      const nowMs = Date.now();
      const signals: SensorSignal[] = [];
      const latest = window[window.length - 1];
      const latestNormalizedSubject = normalizeSubject(latest.subject);

      if (latestNormalizedSubject.length > 0) {
        const similarCount = window
          .map((entry) => normalizeSubject(entry.subject))
          .filter((subject) =>
            areSubjectsSimilar(subject, latestNormalizedSubject),
          ).length;
        if (similarCount >= SUBJECT_LOOP_MIN_OCCURRENCES) {
          signals.push({
            id: THOUGHT_SUBJECT_LOOP_SIGNAL_ID,
            weight: 2,
            precisionPrior: 0.75,
            category: 'thought',
            tsMs: nowMs,
            attribution: `subject "${latestNormalizedSubject}" repeated ${similarCount} times`,
          });
        }
      }

      const thoughtCorpus = window
        .map((entry) => `${entry.subject} ${entry.description}`.trim())
        .join(' ');
      const hedgeCount = countHedgeMatches(thoughtCorpus);
      const tokenCount = Math.max(1, countTokens(thoughtCorpus));
      const hedgeDensity = hedgeCount / tokenCount;
      if (hedgeDensity >= HEDGE_DENSITY_THRESHOLD) {
        signals.push({
          id: THOUGHT_HEDGE_DENSITY_SIGNAL_ID,
          weight: 1,
          precisionPrior: 0.4,
          category: 'thought',
          tsMs: nowMs,
          attribution: `hedge density ${(hedgeDensity * 100).toFixed(1)}%`,
        });
      }

      const latestText = `${latest.subject} ${latest.description}`.trim();
      if (SELF_CONTRADICTION_RE.test(latestText)) {
        signals.push({
          id: THOUGHT_SELF_CONTRADICTION_SIGNAL_ID,
          weight: 1,
          precisionPrior: 0.55,
          category: 'thought',
          tsMs: nowMs,
          attribution: 'self-contradiction phrase detected',
        });
      }

      if (latestNormalizedSubject.length > 0 && window.length >= 2) {
        const previousSame = [...window]
          .slice(0, -1)
          .reverse()
          .find(
            (entry) =>
              normalizeSubject(entry.subject) === latestNormalizedSubject,
          );
        if (previousSame) {
          const previousLength = previousSame.description.trim().length;
          const latestLength = latest.description.trim().length;
          if (latestLength >= previousLength + STALL_DESCRIPTION_DELTA) {
            signals.push({
              id: THOUGHT_STALL_SIGNAL_ID,
              weight: 1,
              precisionPrior: 0.5,
              category: 'thought',
              tsMs: nowMs,
              attribution: `same subject expanded without progress (${previousLength}→${latestLength} chars)`,
            });
          }
        }
      }

      const normalizedSubjects = window
        .map((entry) => normalizeSubject(entry.subject))
        .filter((subject) => subject.length > 0);
      const distinctSubjects = new Set(normalizedSubjects).size;
      const elapsedMinutes = Math.max(1, input.turnElapsedMs / 60_000);
      const distinctRate = distinctSubjects / elapsedMinutes;
      const fallbackMedian = median(
        [input.sessionMedianDistinctSubjectsPerMinute ?? 0, 0].filter(
          (v) => v > 0,
        ),
      );
      const baseline = fallbackMedian > 0 ? fallbackMedian : 1;
      if (distinctRate >= baseline * 2) {
        signals.push({
          id: THOUGHT_ENTROPY_SPIKE_SIGNAL_ID,
          weight: 1,
          precisionPrior: 0.45,
          category: 'thought',
          tsMs: nowMs,
          attribution: `distinct-subject rate ${distinctRate.toFixed(2)}/min vs baseline ${baseline.toFixed(2)}/min`,
        });
      }

      return signals;
    } catch {
      return [];
    }
  }
}
