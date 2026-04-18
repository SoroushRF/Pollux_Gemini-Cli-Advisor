/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  CALIBRATION_SET,
  buildCalibrationContext,
  evaluateCalibrationEntry,
  evaluateFullCalibrationSet,
  sweepHeuristicMinScores,
  sweepStructuredThresholds,
  getCalibrationCategoryDistribution,
  type CalibrationEntry,
} from './calibration.js';
import {
  createHeuristicDetector,
  createStructuredDetector,
  createHybridDetector,
  evaluateHybridSignals,
  DEFAULT_HEURISTIC_MIN_SCORE,
} from './detector.js';
import {
  PolluxDetectorStrategy,
  mergePolluxExperimentalConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const enabledHeuristic = mergePolluxExperimentalConfig({
  enabled: true,
  strategy: PolluxDetectorStrategy.HEURISTIC,
});

const enabledStructured = mergePolluxExperimentalConfig({
  enabled: true,
  strategy: PolluxDetectorStrategy.STRUCTURED,
});

const enabledHybrid = mergePolluxExperimentalConfig({
  enabled: true,
  strategy: PolluxDetectorStrategy.HYBRID,
});

// ---------------------------------------------------------------------------
// Calibration set structural validation
// ---------------------------------------------------------------------------

describe('P3-05 calibration set structure', () => {
  it('contains 21 labeled entries', () => {
    expect(CALIBRATION_SET.length).toBe(21);
  });

  it('has unique entry IDs', () => {
    const ids = CALIBRATION_SET.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all four categories', () => {
    const dist = getCalibrationCategoryDistribution();
    expect(dist.true_positive).toBe(6);
    expect(dist.true_negative).toBe(6);
    expect(dist.boundary).toBe(5);
    expect(dist.cross_strategy).toBe(4);
  });

  it('every entry has non-empty description and valid expectations', () => {
    for (const entry of CALIBRATION_SET) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.expectedAtDefaults.heuristic.shouldEscalate).toBe(
        'boolean',
      );
      expect(typeof entry.expectedAtDefaults.structured.shouldEscalate).toBe(
        'boolean',
      );
      expect(typeof entry.expectedAtDefaults.hybrid.shouldEscalate).toBe(
        'boolean',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Heuristic strategy — ground truth verification
// ---------------------------------------------------------------------------

describe('P3-05 calibration: heuristic strategy at default thresholds', () => {
  const detector = createHeuristicDetector();

  it.each(CALIBRATION_SET.map((e) => [e.id, e] as [string, CalibrationEntry]))(
    '%s matches expected heuristic outcome',
    async (_id, entry) => {
      const ctx = buildCalibrationContext(entry, {
        experimental: enabledHeuristic,
      });
      const result = await detector.shouldEscalate(ctx);
      expect(result.escalate).toBe(
        entry.expectedAtDefaults.heuristic.shouldEscalate,
      );
      expect(result.strategy).toBe(PolluxDetectorStrategy.HEURISTIC);
    },
  );
});

// ---------------------------------------------------------------------------
// Structured strategy — ground truth verification
// ---------------------------------------------------------------------------

describe('P3-05 calibration: structured strategy at default thresholds', () => {
  const detector = createStructuredDetector();

  it.each(CALIBRATION_SET.map((e) => [e.id, e] as [string, CalibrationEntry]))(
    '%s matches expected structured outcome',
    async (_id, entry) => {
      const ctx = buildCalibrationContext(entry, {
        experimental: enabledStructured,
      });
      const result = await detector.shouldEscalate(ctx);
      expect(result.escalate).toBe(
        entry.expectedAtDefaults.structured.shouldEscalate,
      );
      expect(result.strategy).toBe(PolluxDetectorStrategy.STRUCTURED);
    },
  );
});

// ---------------------------------------------------------------------------
// Hybrid strategy — ground truth verification
// ---------------------------------------------------------------------------

describe('P3-05 calibration: hybrid strategy at default thresholds', () => {
  const detector = createHybridDetector();

  it.each(CALIBRATION_SET.map((e) => [e.id, e] as [string, CalibrationEntry]))(
    '%s matches expected hybrid outcome',
    async (_id, entry) => {
      const ctx = buildCalibrationContext(entry, {
        experimental: enabledHybrid,
      });
      const result = await detector.shouldEscalate(ctx);
      expect(result.escalate).toBe(
        entry.expectedAtDefaults.hybrid.shouldEscalate,
      );
      expect(result.strategy).toBe(PolluxDetectorStrategy.HYBRID);
    },
  );
});

// ---------------------------------------------------------------------------
// Cross-strategy divergence assertions
// ---------------------------------------------------------------------------

describe('P3-05 calibration: cross-strategy divergence', () => {
  it('CAL-CS-01: heuristic-only escalation — no structured tag present', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-CS-01')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.score).toBeGreaterThanOrEqual(
      DEFAULT_HEURISTIC_MIN_SCORE,
    );
    expect(evaluation.structured.structuredConfidence).toBeUndefined();
    expect(evaluation.hybrid.decision).toBe('heuristic');
  });

  it('CAL-CS-02: structured-only escalation — no heuristic match', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-CS-02')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.score).toBeLessThan(
      DEFAULT_HEURISTIC_MIN_SCORE,
    );
    expect(evaluation.structured.structuredConfidence).toBeGreaterThanOrEqual(
      6,
    );
    expect(evaluation.hybrid.decision).toBe('structured');
  });

  it('CAL-CS-03: both strategies agree — hybrid resolves to tie_structured', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-CS-03')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.score).toBeGreaterThanOrEqual(
      DEFAULT_HEURISTIC_MIN_SCORE,
    );
    expect(evaluation.structured.structuredConfidence).toBeGreaterThanOrEqual(
      6,
    );
    expect(evaluation.hybrid.decision).toBe('tie_structured');
  });

  it('CAL-CS-04: high heuristic, low structured — hybrid resolves to heuristic', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-CS-04')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.score).toBeGreaterThanOrEqual(
      DEFAULT_HEURISTIC_MIN_SCORE,
    );
    expect(evaluation.structured.structuredConfidence).toBeLessThan(6);
    expect(evaluation.hybrid.decision).toBe('heuristic');
  });
});

// ---------------------------------------------------------------------------
// Boundary case signal-level assertions
// ---------------------------------------------------------------------------

describe('P3-05 calibration: boundary signal-level verification', () => {
  it('CAL-BD-01: single weak heuristic signal scores exactly 1', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-BD-01')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.score).toBe(1);
    expect(evaluation.heuristic.matchedRuleIds).toEqual(['HELP_REQUEST']);
  });

  it('CAL-BD-02: two weak signals accumulate to exact threshold (score=2)', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-BD-02')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.score).toBe(DEFAULT_HEURISTIC_MIN_SCORE);
    expect(evaluation.heuristic.matchedRuleIds).toContain('HELP_REQUEST');
    expect(evaluation.heuristic.matchedRuleIds).toContain('COMPLEXITY');
  });

  it('CAL-BD-03: structured confidence exactly at threshold (6)', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-BD-03')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.structured.structuredConfidence).toBe(6);
  });

  it('CAL-BD-04: structured confidence just below threshold (5)', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-BD-04')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.structured.structuredConfidence).toBe(5);
  });

  it('CAL-BD-05: error marker alone from tool context scores exactly 2', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-BD-05')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.score).toBe(2);
    expect(evaluation.heuristic.matchedRuleIds).toEqual(['ERROR_MARKER']);
  });
});

// ---------------------------------------------------------------------------
// Threshold sweep monotonicity
// ---------------------------------------------------------------------------

describe('P3-05 calibration: threshold sweep monotonicity', () => {
  it('heuristic escalation count is non-increasing as minScore increases', () => {
    const sweep = sweepHeuristicMinScores();
    for (let i = 1; i < sweep.length; i++) {
      expect(sweep[i].escalationCount).toBeLessThanOrEqual(
        sweep[i - 1].escalationCount,
      );
    }
  });

  it('structured escalation count is non-increasing as confidenceThreshold increases', () => {
    const sweep = sweepStructuredThresholds();
    for (let i = 1; i < sweep.length; i++) {
      expect(sweep[i].escalationCount).toBeLessThanOrEqual(
        sweep[i - 1].escalationCount,
      );
    }
  });

  it('heuristic sweep at default minScore=2 matches expected true-positive count', () => {
    const sweep = sweepHeuristicMinScores();
    const atDefault = sweep.find((r) => r.threshold === 2);
    expect(atDefault).toBeDefined();
    // At minScore=2: TP-01..04,06 + BD-02,05 + CS-01,03,04 = 10 entries escalate
    expect(atDefault!.escalationCount).toBe(10);
  });

  it('structured sweep at default confidenceThreshold=6 matches expected count', () => {
    const sweep = sweepStructuredThresholds();
    const atDefault = sweep.find((r) => r.threshold === 6);
    expect(atDefault).toBeDefined();
    // At threshold=6: TP-05(9), BD-03(6), CS-02(8), CS-03(7) = 4 entries escalate
    expect(atDefault!.escalationCount).toBe(4);
  });

  it('heuristic sweep produces zero escalations at very high thresholds', () => {
    const sweep = sweepHeuristicMinScores(CALIBRATION_SET, [7, 8]);
    for (const row of sweep) {
      expect(row.escalationCount).toBe(0);
    }
  });

  it('structured sweep produces zero escalations at threshold=10', () => {
    const sweep = sweepStructuredThresholds(CALIBRATION_SET, [10]);
    expect(sweep[0].escalationCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('P3-05 calibration: determinism', () => {
  it('evaluateFullCalibrationSet returns identical results on repeated runs', () => {
    const first = evaluateFullCalibrationSet();
    const second = evaluateFullCalibrationSet();
    expect(first).toEqual(second);
  });

  it('detector factories return identical results for repeated calibration runs', async () => {
    const heuristicDet = createHeuristicDetector();
    const structuredDet = createStructuredDetector();
    const hybridDet = createHybridDetector();

    for (const entry of CALIBRATION_SET) {
      const hCtx = buildCalibrationContext(entry, {
        experimental: enabledHeuristic,
      });
      const sCtx = buildCalibrationContext(entry, {
        experimental: enabledStructured,
      });
      const yCtx = buildCalibrationContext(entry, {
        experimental: enabledHybrid,
      });

      const [h1, h2] = [
        await heuristicDet.shouldEscalate(hCtx),
        await heuristicDet.shouldEscalate(hCtx),
      ];
      const [s1, s2] = [
        await structuredDet.shouldEscalate(sCtx),
        await structuredDet.shouldEscalate(sCtx),
      ];
      const [y1, y2] = [
        await hybridDet.shouldEscalate(yCtx),
        await hybridDet.shouldEscalate(yCtx),
      ];

      expect(h1).toEqual(h2);
      expect(s1).toEqual(s2);
      expect(y1).toEqual(y2);
    }
  });
});

// ---------------------------------------------------------------------------
// True-positive rule-match detail verification
// ---------------------------------------------------------------------------

describe('P3-05 calibration: true-positive rule match details', () => {
  it('CAL-TP-01 matches EXPLICIT_BLOCKED + ERROR_MARKER', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-TP-01')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.matchedRuleIds).toContain('EXPLICIT_BLOCKED');
    expect(evaluation.heuristic.matchedRuleIds).toContain('ERROR_MARKER');
    expect(evaluation.heuristic.score).toBeGreaterThanOrEqual(4);
  });

  it('CAL-TP-02 matches RETRY_LOOP + ERROR_MARKER', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-TP-02')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.matchedRuleIds).toContain('RETRY_LOOP');
    expect(evaluation.heuristic.matchedRuleIds).toContain('ERROR_MARKER');
    expect(evaluation.heuristic.score).toBeGreaterThanOrEqual(4);
  });

  it('CAL-TP-03 matches HELP_REQUEST + DEBUG_INTENT + ERROR_MARKER', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-TP-03')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.matchedRuleIds).toContain('HELP_REQUEST');
    expect(evaluation.heuristic.matchedRuleIds).toContain('DEBUG_INTENT');
    expect(evaluation.heuristic.matchedRuleIds).toContain('ERROR_MARKER');
    expect(evaluation.heuristic.score).toBeGreaterThanOrEqual(4);
  });

  it('CAL-TP-04 matches HELP_REQUEST + COMPLEXITY + EXPLICIT_BLOCKED', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-TP-04')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.matchedRuleIds).toContain('HELP_REQUEST');
    expect(evaluation.heuristic.matchedRuleIds).toContain('COMPLEXITY');
    expect(evaluation.heuristic.matchedRuleIds).toContain('EXPLICIT_BLOCKED');
    expect(evaluation.heuristic.score).toBeGreaterThanOrEqual(4);
  });

  it('CAL-TP-05 has structured confidence 9', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-TP-05')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.score).toBe(0);
    expect(evaluation.structured.structuredConfidence).toBe(9);
  });

  it('CAL-TP-06 matches ERROR_MARKER from empty-user tool-only input', () => {
    const entry = CALIBRATION_SET.find((e) => e.id === 'CAL-TP-06')!;
    const evaluation = evaluateCalibrationEntry(entry);
    expect(evaluation.heuristic.matchedRuleIds).toEqual(['ERROR_MARKER']);
    expect(evaluation.heuristic.score).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// True-negative zero-score verification
// ---------------------------------------------------------------------------

describe('P3-05 calibration: true-negative zero-score verification', () => {
  const trueNegatives = CALIBRATION_SET.filter(
    (e) => e.category === 'true_negative',
  );

  it.each(trueNegatives.map((e) => [e.id, e] as [string, CalibrationEntry]))(
    '%s has heuristic score 0',
    (_id, entry) => {
      const evaluation = evaluateCalibrationEntry(entry);
      expect(evaluation.heuristic.score).toBe(0);
      expect(evaluation.heuristic.matchedRuleIds).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Hybrid evaluation detail sweep
// ---------------------------------------------------------------------------

describe('P3-05 calibration: hybrid evaluation detail', () => {
  it('all true-negative entries produce hybrid decision=none', () => {
    const trueNegatives = CALIBRATION_SET.filter(
      (e) => e.category === 'true_negative',
    );
    for (const entry of trueNegatives) {
      const evaluation = evaluateCalibrationEntry(entry);
      expect(evaluation.hybrid.decision).toBe('none');
    }
  });

  it('threshold sweep: hybrid escalation count is non-increasing with rising confidenceThreshold', () => {
    // Vary the confidenceThreshold and count entries where hybrid detector
    // would escalate. The total count should be non-increasing because
    // raising the threshold removes structured-path contributions without
    // adding any.
    const thresholds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const counts = thresholds.map((threshold) => {
      let count = 0;
      for (const entry of CALIBRATION_SET) {
        const ctx = buildCalibrationContext(entry, {
          experimental: mergePolluxExperimentalConfig({
            enabled: true,
            strategy: PolluxDetectorStrategy.HYBRID,
            confidenceThreshold: threshold,
          }),
        });
        const evaluation = evaluateHybridSignals(ctx);
        if (evaluation.decision !== 'none') {
          count++;
        }
      }
      return count;
    });

    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });
});
