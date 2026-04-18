/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Escalation calibration set and threshold analysis utilities (P3-05,
 * POLLUX_SPEC §7.2 / §10.4).
 *
 * This module provides:
 *
 *   1. A curated calibration set of 21 labeled turn contexts covering
 *      true-positive, true-negative, boundary, and cross-strategy divergence
 *      scenarios.
 *   2. Evaluation helpers that run calibration entries through the raw signal
 *      evaluators and expose full breakdowns for analysis.
 *   3. Threshold sweep utilities for analyzing how escalation rates change
 *      as `minScore` (heuristic) and `confidenceThreshold` (structured/hybrid)
 *      are varied.
 *
 * Design constraints:
 *
 *   - Pure functions only; no I/O or LLM calls.
 *   - Deterministic: same calibration set => same results.
 *   - Ground-truth expectations are pinned at default thresholds
 *     (`minScore=2`, `confidenceThreshold=6`).
 *   - Rule tuning and threshold sweeps intentionally deferred from P3-01
 *     to this task.
 */

import type { PolluxTurnContext } from './types.js';
import {
  PolluxRuntimeSurface,
  mergePolluxExperimentalConfig,
} from './types.js';
import {
  evaluateHeuristicSignals,
  evaluateStructuredConfidenceSignal,
  evaluateHybridSignals,
  type HeuristicEvaluation,
  type StructuredConfidenceEvaluation,
  type HybridEvaluation,
} from './detector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Category label for each calibration entry. Categories exist for reporting
 * and for verifying coverage across the calibration set.
 *
 *   - `true_positive`: inputs that SHOULD escalate under at least one strategy
 *     at default thresholds.
 *   - `true_negative`: inputs that should NOT escalate under any strategy.
 *   - `boundary`: inputs at or near the escalation threshold boundary.
 *   - `cross_strategy`: inputs designed to expose divergent behavior across
 *     strategies (heuristic-only, structured-only, tie, etc.).
 */
export type CalibrationCategory =
  | 'true_positive'
  | 'true_negative'
  | 'boundary'
  | 'cross_strategy';

/** Expected escalation outcome for a single strategy at default thresholds. */
export interface CalibrationExpectation {
  readonly shouldEscalate: boolean;
}

/**
 * A single labeled calibration entry with ground-truth expectations at default
 * thresholds (`minScore=2`, `confidenceThreshold=6`).
 */
export interface CalibrationEntry {
  readonly id: string;
  readonly category: CalibrationCategory;
  readonly description: string;
  readonly input: {
    readonly userContentDigest: string;
    readonly pendingToolContext: string;
  };
  /**
   * Expected outcomes when each strategy is individually active and all other
   * config values use defaults from `mergePolluxExperimentalConfig`.
   */
  readonly expectedAtDefaults: {
    readonly heuristic: CalibrationExpectation;
    readonly structured: CalibrationExpectation;
    readonly hybrid: CalibrationExpectation;
  };
}

/** Full evaluation breakdown for a single calibration entry. */
export interface CalibrationEvaluation {
  readonly entryId: string;
  readonly heuristic: HeuristicEvaluation;
  readonly structured: StructuredConfidenceEvaluation;
  readonly hybrid: HybridEvaluation;
}

/** One row in a threshold sweep result table. */
export interface ThresholdSweepRow {
  readonly threshold: number;
  readonly escalationCount: number;
  readonly totalEntries: number;
  readonly escalationRate: number;
}

// ---------------------------------------------------------------------------
// Calibration data set — 21 labeled entries
// ---------------------------------------------------------------------------

/**
 * Curated calibration set for detector threshold analysis (P3-05).
 *
 * Categories:
 *   - 6 true positives (TP-01..TP-06)
 *   - 6 true negatives (TN-01..TN-06)
 *   - 5 boundary cases (BD-01..BD-05)
 *   - 4 cross-strategy divergence cases (CS-01..CS-04)
 *
 * Ground truth was derived by manual rule-trace against
 * {@link DEFAULT_HEURISTIC_RULES} and the structured confidence extraction
 * pipeline, then validated against the evaluation functions in
 * `calibration.test.ts`.
 */
export const CALIBRATION_SET: readonly CalibrationEntry[] = [
  // -------------------------------------------------------------------------
  // True positives — inputs that should escalate at default thresholds
  // -------------------------------------------------------------------------
  {
    id: 'CAL-TP-01',
    category: 'true_positive',
    description:
      'Explicit stuck + error output (EXPLICIT_BLOCKED + ERROR_MARKER, score=4)',
    input: {
      userContentDigest:
        "I'm stuck on this test failure and can't figure out what's wrong.",
      pendingToolContext:
        'error: TypeError: Cannot read properties of undefined\nexit code 1',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-TP-02',
    category: 'true_positive',
    description:
      'Retry loop with traceback (RETRY_LOOP + ERROR_MARKER, score=4)',
    input: {
      userContentDigest:
        "I've tried several times but the build keeps failing with the same error.",
      pendingToolContext:
        'Traceback (most recent call last):\n  File "build.py", line 42\nTypeError: missing required argument',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-TP-03',
    category: 'true_positive',
    description:
      'Debug request with stack trace (HELP_REQUEST + DEBUG_INTENT + ERROR_MARKER, score=4)',
    input: {
      userContentDigest:
        'Can you help me debug this? I need to find the root cause of the crash.',
      pendingToolContext:
        'stderr: segmentation fault (core dumped)\nexit code 139',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-TP-04',
    category: 'true_positive',
    description:
      'Help + complexity + blocked (HELP_REQUEST + COMPLEXITY + EXPLICIT_BLOCKED, score=4)',
    input: {
      userContentDigest:
        "I need help with this architecture. I'm blocked on a design decision about the database trade-offs.",
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-TP-05',
    category: 'true_positive',
    description:
      'High structured confidence only (confidence=9, no heuristic match)',
    input: {
      userContentDigest:
        '<!-- pollux:confidence:9 --> How should I approach this migration?',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: true },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-TP-06',
    category: 'true_positive',
    description: 'Error marker only from tool context (ERROR_MARKER, score=2)',
    input: {
      userContentDigest: '',
      pendingToolContext:
        'error: ENOENT: no such file or directory\nexit code 1',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },

  // -------------------------------------------------------------------------
  // True negatives — inputs that should NOT escalate under any strategy
  // -------------------------------------------------------------------------
  {
    id: 'CAL-TN-01',
    category: 'true_negative',
    description: 'Simple code generation request',
    input: {
      userContentDigest:
        'Write a function that reverses a string in TypeScript.',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: false },
    },
  },
  {
    id: 'CAL-TN-02',
    category: 'true_negative',
    description: 'Documentation question with no failure language',
    input: {
      userContentDigest:
        'Explain the difference between Promise.all and Promise.allSettled.',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: false },
    },
  },
  {
    id: 'CAL-TN-03',
    category: 'true_negative',
    description: 'File creation request',
    input: {
      userContentDigest:
        'Create a new file called utils.ts and add a helper for date formatting.',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: false },
    },
  },
  {
    id: 'CAL-TN-04',
    category: 'true_negative',
    description: 'Low structured confidence below threshold (confidence=3 < 6)',
    input: {
      userContentDigest:
        '<!-- pollux:confidence:3 --> Just update the README with the new API docs.',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: false },
    },
  },
  {
    id: 'CAL-TN-05',
    category: 'true_negative',
    description: 'Successful tool output (exit code 0 is not an error marker)',
    input: {
      userContentDigest: 'Run the test suite.',
      pendingToolContext: 'All 42 tests passed\nexit code 0',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: false },
    },
  },
  {
    id: 'CAL-TN-06',
    category: 'true_negative',
    description: 'Code review request without distress signals',
    input: {
      userContentDigest: 'Review this pull request and suggest improvements.',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: false },
    },
  },

  // -------------------------------------------------------------------------
  // Boundary cases — inputs at or near threshold boundaries
  // -------------------------------------------------------------------------
  {
    id: 'CAL-BD-01',
    category: 'boundary',
    description:
      'Single weak signal below threshold (HELP_REQUEST only, score=1 < 2)',
    input: {
      userContentDigest: 'Please help me understand this API.',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: false },
    },
  },
  {
    id: 'CAL-BD-02',
    category: 'boundary',
    description:
      'Two weak signals accumulating to exact threshold (HELP_REQUEST + COMPLEXITY, score=2)',
    input: {
      userContentDigest: 'I need advice on this design decision.',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-BD-03',
    category: 'boundary',
    description:
      'Structured confidence at exact threshold (confidence=6 = threshold)',
    input: {
      userContentDigest:
        '<!-- pollux:confidence:6 --> Should I use a queue or pub-sub here?',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: true },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-BD-04',
    category: 'boundary',
    description:
      'Structured confidence just below threshold (confidence=5 < 6)',
    input: {
      userContentDigest:
        '<!-- pollux:confidence:5 --> Should I use a queue or pub-sub here?',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: false },
    },
  },
  {
    id: 'CAL-BD-05',
    category: 'boundary',
    description:
      'Error marker alone reaches threshold from tool context (exception, score=2)',
    input: {
      userContentDigest: 'What happened?',
      pendingToolContext: 'exception in thread main: NullPointerException',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },

  // -------------------------------------------------------------------------
  // Cross-strategy divergence cases
  // -------------------------------------------------------------------------
  {
    id: 'CAL-CS-01',
    category: 'cross_strategy',
    description:
      'Heuristic-only escalation (EXPLICIT_BLOCKED + RETRY_LOOP, no tag)',
    input: {
      userContentDigest: "I'm completely blocked and it keeps failing.",
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-CS-02',
    category: 'cross_strategy',
    description:
      'Structured-only escalation (confidence=8, no heuristic match)',
    input: {
      userContentDigest:
        '<!-- pollux:confidence:8 --> Implement pagination for the API endpoint.',
      pendingToolContext: '',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: false },
      structured: { shouldEscalate: true },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-CS-03',
    category: 'cross_strategy',
    description:
      'Both strategies agree — hybrid tie, structured wins (score=6, confidence=7)',
    input: {
      userContentDigest:
        "I'm stuck <!-- pollux:confidence:7 --> and need help to debug this crash.",
      pendingToolContext: 'error: segmentation fault',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: true },
      hybrid: { shouldEscalate: true },
    },
  },
  {
    id: 'CAL-CS-04',
    category: 'cross_strategy',
    description:
      'Low structured + high heuristic — heuristic wins in hybrid (score=6, confidence=4 < 6)',
    input: {
      userContentDigest:
        "I'm stuck <!-- pollux:confidence:4 --> and it keeps failing.",
      pendingToolContext: 'error: timeout',
    },
    expectedAtDefaults: {
      heuristic: { shouldEscalate: true },
      structured: { shouldEscalate: false },
      hybrid: { shouldEscalate: true },
    },
  },
];

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Builds a {@link PolluxTurnContext} from a calibration entry with default
 * Pollux settings (`enabled=true`, `strategy=hybrid` by default) and no
 * budget pressure. The context is suitable for raw signal evaluation —
 * detector factory tests should override `strategy` per their path.
 */
export function buildCalibrationContext(
  entry: CalibrationEntry,
  overrides?: Partial<PolluxTurnContext>,
): PolluxTurnContext {
  return {
    surface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
    sessionId: 'calibration-session',
    turnId: `calibration-${entry.id}`,
    experimental: mergePolluxExperimentalConfig({ enabled: true }),
    advisorCallsThisTurn: 0,
    advisorCallsThisSession: 0,
    userContentDigest: entry.input.userContentDigest,
    pendingToolContext: entry.input.pendingToolContext,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

/**
 * Evaluates a single calibration entry against all three raw signal evaluators.
 *
 * This function is strategy-agnostic: it runs heuristic rule matching,
 * structured confidence extraction, and hybrid resolution regardless of the
 * context's active strategy. Use this for analysis and calibration reports
 * rather than for testing detector gating behavior.
 */
export function evaluateCalibrationEntry(
  entry: CalibrationEntry,
): CalibrationEvaluation {
  const ctx = buildCalibrationContext(entry);
  return {
    entryId: entry.id,
    heuristic: evaluateHeuristicSignals(ctx),
    structured: evaluateStructuredConfidenceSignal(ctx),
    hybrid: evaluateHybridSignals(ctx),
  };
}

/**
 * Evaluates all entries in the calibration set and returns full breakdowns.
 */
export function evaluateFullCalibrationSet(
  entries: readonly CalibrationEntry[] = CALIBRATION_SET,
): readonly CalibrationEvaluation[] {
  return entries.map(evaluateCalibrationEntry);
}

// ---------------------------------------------------------------------------
// Threshold sweep utilities
// ---------------------------------------------------------------------------

/**
 * Sweeps heuristic `minScore` across a range and reports how many calibration
 * entries would escalate at each threshold. The sweep evaluates the raw
 * heuristic signals once per entry and compares against each threshold —
 * no detector factory instantiation is needed.
 *
 * Monotonicity property: escalation count is non-increasing as `minScore`
 * increases. Violations indicate a bug in rule evaluation or scoring.
 */
export function sweepHeuristicMinScores(
  entries: readonly CalibrationEntry[] = CALIBRATION_SET,
  minScoreRange: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8],
): readonly ThresholdSweepRow[] {
  const evaluations = entries.map((entry) => ({
    entry,
    score: evaluateHeuristicSignals(buildCalibrationContext(entry)).score,
  }));

  return minScoreRange.map((threshold) => {
    const escalationCount = evaluations.filter(
      (e) => e.score >= threshold,
    ).length;
    return {
      threshold,
      escalationCount,
      totalEntries: entries.length,
      escalationRate: entries.length > 0 ? escalationCount / entries.length : 0,
    };
  });
}

/**
 * Sweeps structured `confidenceThreshold` across 1–10 and reports how many
 * calibration entries would escalate at each threshold. Only entries with
 * valid confidence tags are considered escalation candidates.
 *
 * Monotonicity property: escalation count is non-increasing as
 * `confidenceThreshold` increases.
 */
export function sweepStructuredThresholds(
  entries: readonly CalibrationEntry[] = CALIBRATION_SET,
  thresholdRange: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
): readonly ThresholdSweepRow[] {
  const evaluations = entries.map((entry) => ({
    entry,
    confidence: evaluateStructuredConfidenceSignal(
      buildCalibrationContext(entry),
    ).structuredConfidence,
  }));

  return thresholdRange.map((threshold) => {
    const escalationCount = evaluations.filter(
      (e) => e.confidence !== undefined && e.confidence >= threshold,
    ).length;
    return {
      threshold,
      escalationCount,
      totalEntries: entries.length,
      escalationRate: entries.length > 0 ? escalationCount / entries.length : 0,
    };
  });
}

/**
 * Returns category distribution counts for the calibration set.
 * Useful for verifying coverage balance in reports.
 */
export function getCalibrationCategoryDistribution(
  entries: readonly CalibrationEntry[] = CALIBRATION_SET,
): Record<CalibrationCategory, number> {
  const counts: Record<CalibrationCategory, number> = {
    true_positive: 0,
    true_negative: 0,
    boundary: 0,
    cross_strategy: 0,
  };
  for (const entry of entries) {
    counts[entry.category]++;
  }
  return counts;
}
