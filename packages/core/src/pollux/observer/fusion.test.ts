/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { PolluxEscalationReasonCode } from '../types.js';
import { LOOP_HARD_CONFIRMED_SIGNAL_ID } from './sensors/loopBridge.js';
import { RISK_PRE_TOOL_HIGH_SIGNAL_ID } from './sensors/riskGate.js';
import { FusionLayer, type FusionConfig } from './fusion.js';
import type { SensorSignal } from './sensors/base.js';

const BASE_CONFIG: FusionConfig = {
  decayHalfLifeMs: 15_000,
  targetEscalationRate: 0.05,
  requireComposite: true,
  lowPrecisionFloor: 0.5,
  sameTurnThresholdMultiplier: 1.5,
  sameTurnAbsoluteFloor: 3.5,
  minAbsoluteThreshold: 1,
  maxAbsoluteThreshold: 10,
};

function signal(partial: Partial<SensorSignal> & { id: string }): SensorSignal {
  return {
    id: partial.id,
    weight: partial.weight ?? 1,
    precisionPrior: partial.precisionPrior ?? 0.8,
    category: partial.category ?? 'tool',
    hardPrecision: partial.hardPrecision,
    tsMs: partial.tsMs ?? Date.now(),
    attribution: partial.attribution,
  };
}

describe('pollux/observer/fusion', () => {
  it('hard-precision short-circuits to risk gate reason', () => {
    const fusion = new FusionLayer();
    const out = fusion.evaluate({
      signals: [
        signal({
          id: RISK_PRE_TOOL_HIGH_SIGNAL_ID,
          hardPrecision: true,
          weight: 3,
          precisionPrior: 0.95,
          category: 'risk',
        }),
      ],
      config: BASE_CONFIG,
      nowMs: Date.now(),
    });
    expect(out.escalate).toBe(true);
    expect(out.reasonCode).toBe(PolluxEscalationReasonCode.RISK_GATE_BLOCK);
  });

  it('hard-precision short-circuits to hard-loop reason', () => {
    const fusion = new FusionLayer();
    const out = fusion.evaluate({
      signals: [
        signal({
          id: LOOP_HARD_CONFIRMED_SIGNAL_ID,
          hardPrecision: true,
          weight: 3,
          precisionPrior: 0.85,
          category: 'tool',
        }),
      ],
      config: BASE_CONFIG,
      nowMs: Date.now(),
    });
    expect(out.escalate).toBe(true);
    expect(out.reasonCode).toBe(PolluxEscalationReasonCode.HARD_LOOP);
  });

  it('drops lone low-precision positive below floor', () => {
    const fusion = new FusionLayer();
    const out = fusion.evaluate({
      signals: [
        signal({
          id: 'thought.hedge_density',
          precisionPrior: 0.4,
          category: 'thought',
        }),
      ],
      config: BASE_CONFIG,
      nowMs: Date.now(),
    });
    expect(out.escalate).toBe(false);
  });

  it('keeps low-precision positive if category has a high-precision sibling', () => {
    const fusion = new FusionLayer();
    const out = fusion.evaluate({
      signals: [
        signal({
          id: 'tool.low',
          category: 'tool',
          precisionPrior: 0.4,
          weight: 2,
        }),
        signal({
          id: 'tool.high',
          category: 'tool',
          precisionPrior: 0.9,
          weight: 2,
        }),
        signal({
          id: 'thought.high',
          category: 'thought',
          precisionPrior: 0.9,
          weight: 2,
        }),
      ],
      config: BASE_CONFIG,
      nowMs: Date.now(),
    });
    expect(out.escalate).toBe(true);
  });

  it('requires distinct categories when composite gate is enabled', () => {
    const fusion = new FusionLayer();
    const out = fusion.evaluate({
      signals: [
        signal({ id: 'tool.a', category: 'tool', weight: 2 }),
        signal({ id: 'tool.b', category: 'tool', weight: 2 }),
      ],
      config: BASE_CONFIG,
      nowMs: Date.now(),
    });
    expect(out.escalate).toBe(false);
  });

  it('decays old signals and blocks escalation when score falls below threshold', () => {
    const fusion = new FusionLayer();
    const now = Date.now();
    const out = fusion.evaluate({
      signals: [
        signal({
          id: 'tool.old',
          category: 'tool',
          weight: 3,
          precisionPrior: 0.9,
          tsMs: now - 120_000,
        }),
        signal({
          id: 'thought.old',
          category: 'thought',
          weight: 2,
          precisionPrior: 0.8,
          tsMs: now - 120_000,
        }),
      ],
      config: BASE_CONFIG,
      nowMs: now,
    });
    expect(out.escalate).toBe(false);
  });

  it('subtracts negatives from net score', () => {
    const fusion = new FusionLayer();
    const out = fusion.evaluate({
      signals: [
        signal({
          id: 'tool.pos',
          category: 'tool',
          weight: 2,
          precisionPrior: 1,
        }),
        signal({
          id: 'thought.pos',
          category: 'thought',
          weight: 2,
          precisionPrior: 1,
        }),
        signal({
          id: 'neg.exit_zero',
          category: 'tool',
          weight: -2,
          precisionPrior: 1,
        }),
      ],
      config: BASE_CONFIG,
      nowMs: Date.now(),
    });
    expect(out.netScore).toBeLessThan(4);
  });

  it('returns FUSION_COMPOSITE when above threshold but below emphatic threshold', () => {
    const fusion = new FusionLayer();
    const out = fusion.evaluate({
      signals: [
        signal({
          id: 'tool.a',
          category: 'tool',
          weight: 1.5,
          precisionPrior: 0.8,
        }),
        signal({
          id: 'thought.a',
          category: 'thought',
          weight: 1.2,
          precisionPrior: 0.8,
        }),
      ],
      config: {
        ...BASE_CONFIG,
        sameTurnAbsoluteFloor: 10,
      },
      nowMs: Date.now(),
    });
    expect(out.escalate).toBe(true);
    expect(out.reasonCode).toBe(PolluxEscalationReasonCode.FUSION_COMPOSITE);
  });

  it('returns FUSION_BUDGET_TARGET when the auto-calibrated threshold was recently lowered', () => {
    const fusion = new FusionLayer();

    // Establish a high baseline threshold.
    for (const score of [10, 10, 10, 10, 10, 10]) {
      fusion.recordCompletedTurn(score);
    }
    // First evaluate computes a high threshold and caches it.
    fusion.evaluate({
      signals: [
        signal({
          id: 'tool.a',
          category: 'tool',
          weight: 1,
          precisionPrior: 1,
        }),
        signal({
          id: 'thought.a',
          category: 'thought',
          weight: 1,
          precisionPrior: 1,
        }),
      ],
      config: { ...BASE_CONFIG, targetEscalationRate: 0.5 },
      nowMs: Date.now(),
    });

    // Add low scores to push the quantile (and thus threshold) down.
    for (const score of [0, 0, 0, 0, 0, 0, 0, 0]) {
      fusion.recordCompletedTurn(score);
    }

    const out = fusion.evaluate({
      signals: [
        signal({
          id: 'tool.b',
          category: 'tool',
          weight: 4,
          precisionPrior: 1,
        }),
        signal({
          id: 'thought.b',
          category: 'thought',
          weight: 4,
          precisionPrior: 1,
        }),
      ],
      config: {
        ...BASE_CONFIG,
        targetEscalationRate: 0.5,
        // Ensure we exercise the non-emphatic composite path so the budget-target
        // reason can surface.
        sameTurnThresholdMultiplier: 10,
        sameTurnAbsoluteFloor: 999,
      },
      nowMs: Date.now(),
    });

    expect(out.escalate).toBe(true);
    expect(out.reasonCode).toBe(
      PolluxEscalationReasonCode.FUSION_BUDGET_TARGET,
    );
  });

  it('returns FUSION_COMPOSITE_EMPHATIC when above same-turn threshold', () => {
    const fusion = new FusionLayer();
    const out = fusion.evaluate({
      signals: [
        signal({
          id: 'tool.a',
          category: 'tool',
          weight: 4,
          precisionPrior: 1,
        }),
        signal({
          id: 'thought.a',
          category: 'thought',
          weight: 4,
          precisionPrior: 1,
        }),
      ],
      config: BASE_CONFIG,
      nowMs: Date.now(),
    });
    expect(out.escalate).toBe(true);
    expect(out.reasonCode).toBe(
      PolluxEscalationReasonCode.FUSION_COMPOSITE_EMPHATIC,
    );
  });

  it('uses rolling quantile threshold from completed turns and clamps bounds', () => {
    const fusion = new FusionLayer();
    for (const score of [0.5, 1.5, 2, 3, 4, 8]) {
      fusion.recordCompletedTurn(score);
    }
    const out = fusion.evaluate({
      signals: [
        signal({
          id: 'tool.a',
          category: 'tool',
          weight: 2,
          precisionPrior: 1,
        }),
        signal({
          id: 'thought.a',
          category: 'thought',
          weight: 2,
          precisionPrior: 1,
        }),
      ],
      config: {
        ...BASE_CONFIG,
        targetEscalationRate: 0.5,
        minAbsoluteThreshold: 1,
        maxAbsoluteThreshold: 3,
      },
      nowMs: Date.now(),
    });
    expect(out.threshold).toBeGreaterThanOrEqual(1);
    expect(out.threshold).toBeLessThanOrEqual(3);
  });
});
