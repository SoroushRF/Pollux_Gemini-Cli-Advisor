/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_CORPUS,
  KNOWN_SIGNAL_IDS,
  runCalibrationCorpus,
  runCalibrationTrace,
} from './calibration.js';

describe('Pollux observer calibration corpus (Phase H)', () => {
  it('contains at least 60 traces', () => {
    expect(CALIBRATION_CORPUS.length).toBeGreaterThanOrEqual(60);
  });

  it('is deterministic (same corpus run -> identical metrics)', () => {
    const run1 = runCalibrationCorpus(CALIBRATION_CORPUS);
    const run2 = runCalibrationCorpus(CALIBRATION_CORPUS);
    expect(run1.metrics).toEqual(run2.metrics);
  });

  it('covers every known signal id at least once', () => {
    const run = runCalibrationCorpus(CALIBRATION_CORPUS);
    const seen = new Set<string>();
    for (const { result } of run.byTrace) {
      for (const id of result.seenSignalIds) {
        seen.add(id);
      }
    }
    for (const id of KNOWN_SIGNAL_IDS) {
      expect(seen.has(id), `missing signal coverage: ${id}`).toBe(true);
    }
  });

  it('matches per-trace escalation expectations', () => {
    const run = runCalibrationCorpus(CALIBRATION_CORPUS);
    const failures: string[] = [];
    for (const { entry, result } of run.byTrace) {
      if (result.escalated !== entry.expected.escalate) {
        failures.push(
          `${entry.id}: expected=${entry.expected.escalate} actual=${result.escalated} signals=${result.seenSignalIds.join(',')}`,
        );
      }
      if (entry.expected.expectedSignalIds) {
        for (const id of entry.expected.expectedSignalIds) {
          if (!result.seenSignalIds.includes(id)) {
            failures.push(`${entry.id}: missing expected signal id ${id}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('meets true-negative precision threshold (≥ 0.90)', () => {
    const run = runCalibrationCorpus(CALIBRATION_CORPUS);
    const trueNegativePrecision =
      run.metrics.tn + run.metrics.fp === 0
        ? 1
        : run.metrics.tn / (run.metrics.tn + run.metrics.fp);
    expect(trueNegativePrecision).toBeGreaterThanOrEqual(0.9);
  });

  it('single-trace runner is stable for a fixed baseNowMs', () => {
    const entry = CALIBRATION_CORPUS[0];
    const a = runCalibrationTrace(entry, { baseNowMs: 12345 });
    const b = runCalibrationTrace(entry, { baseNowMs: 12345 });
    expect(a).toEqual(b);
  });
});
