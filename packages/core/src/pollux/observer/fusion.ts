/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PolluxEscalationReasonCode,
  type PolluxEscalationReasonCode as PolluxEscalationReasonCodeValue,
} from '../types.js';
import { LOOP_HARD_CONFIRMED_SIGNAL_ID } from './sensors/loopBridge.js';
import { RISK_PRE_TOOL_HIGH_SIGNAL_ID } from './sensors/riskGate.js';
import type { SensorSignal } from './sensors/base.js';

export interface FusionConfig {
  readonly decayHalfLifeMs: number;
  readonly targetEscalationRate: number;
  readonly requireComposite: boolean;
  readonly lowPrecisionFloor: number;
  readonly sameTurnThresholdMultiplier: number;
  readonly sameTurnAbsoluteFloor: number;
  readonly minAbsoluteThreshold: number;
  readonly maxAbsoluteThreshold: number;
}

export interface FusionInput {
  readonly signals: readonly SensorSignal[];
  readonly config: FusionConfig;
  readonly nowMs: number;
}

export interface FusionOutput {
  readonly escalate: boolean;
  readonly reasonCode: PolluxEscalationReasonCodeValue;
  readonly netScore: number;
  readonly threshold: number;
  readonly contributingSignalIds: readonly string[];
}

const LOG_2 = Math.log(2);
const MAX_HISTORY = 200;

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const clampedQ = Math.max(0, Math.min(1, q));
  const position = clampedQ * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function reasonForHardPrecisionSignal(
  signalId: string,
): PolluxEscalationReasonCodeValue {
  if (signalId === RISK_PRE_TOOL_HIGH_SIGNAL_ID) {
    return PolluxEscalationReasonCode.RISK_GATE_BLOCK;
  }
  if (signalId === LOOP_HARD_CONFIRMED_SIGNAL_ID) {
    return PolluxEscalationReasonCode.HARD_LOOP;
  }
  if (signalId === 'self.structured_status_stuck') {
    return PolluxEscalationReasonCode.SELF_REPORT_STUCK;
  }
  return PolluxEscalationReasonCode.LIVE_OBSERVER_MATCH;
}

function applyDecay(
  signal: SensorSignal,
  nowMs: number,
  halfLifeMs: number,
): number {
  if (signal.hardPrecision) {
    return signal.weight;
  }
  const ageMs = Math.max(0, nowMs - signal.tsMs);
  const factor = Math.exp((-LOG_2 * ageMs) / Math.max(1, halfLifeMs));
  return signal.weight * factor;
}

export class FusionLayer {
  private readonly completedTurnNetScores: number[] = [];
  private lastComputedThreshold: number | undefined;
  private thresholdLoweredSinceLastEscalation = false;

  reset(): void {
    this.completedTurnNetScores.length = 0;
    this.lastComputedThreshold = undefined;
    this.thresholdLoweredSinceLastEscalation = false;
  }

  recordCompletedTurn(netScore: number): void {
    this.completedTurnNetScores.push(netScore);
    if (this.completedTurnNetScores.length > MAX_HISTORY) {
      this.completedTurnNetScores.splice(
        0,
        this.completedTurnNetScores.length - MAX_HISTORY,
      );
    }
  }

  evaluate(input: FusionInput): FusionOutput {
    const threshold = this.computeThreshold(input.config);
    this.noteThresholdAdjustment(threshold);
    const weighted = input.signals.map((signal) => ({
      signal,
      decayedWeight: applyDecay(
        signal,
        input.nowMs,
        input.config.decayHalfLifeMs,
      ),
    }));
    const hardPositives = weighted
      .filter((entry) => entry.signal.hardPrecision && entry.decayedWeight > 0)
      .sort(
        (a, b) =>
          b.decayedWeight * b.signal.precisionPrior -
          a.decayedWeight * a.signal.precisionPrior,
      );
    if (hardPositives.length > 0) {
      const strongest = hardPositives[0].signal;
      const netScore = hardPositives.reduce(
        (sum, entry) => sum + entry.decayedWeight * entry.signal.precisionPrior,
        0,
      );
      return {
        escalate: true,
        reasonCode: reasonForHardPrecisionSignal(strongest.id),
        netScore,
        threshold,
        contributingSignalIds: hardPositives.map((entry) => entry.signal.id),
      };
    }

    const positives = weighted.filter((entry) => entry.decayedWeight > 0);
    const negatives = weighted.filter((entry) => entry.decayedWeight < 0);

    const highPrecisionByCategory = new Set(
      positives
        .filter(
          (entry) =>
            entry.signal.precisionPrior >= input.config.lowPrecisionFloor,
        )
        .map((entry) => entry.signal.category),
    );
    const survivingPositives = positives.filter(
      (entry) =>
        entry.signal.precisionPrior >= input.config.lowPrecisionFloor ||
        highPrecisionByCategory.has(entry.signal.category),
    );

    const categories = new Set(
      survivingPositives.map((entry) => entry.signal.category),
    );
    const positiveScore = survivingPositives.reduce(
      (sum, entry) => sum + entry.decayedWeight * entry.signal.precisionPrior,
      0,
    );
    const negativeScore = negatives.reduce(
      (sum, entry) => sum + Math.abs(entry.decayedWeight),
      0,
    );
    const netScore = positiveScore - negativeScore;
    if (input.config.requireComposite && categories.size < 2) {
      return {
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.NONE,
        netScore,
        threshold,
        contributingSignalIds: [],
      };
    }
    if (netScore < threshold) {
      return {
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.NONE,
        netScore,
        threshold,
        contributingSignalIds: [],
      };
    }

    const sameTurnThreshold = Math.max(
      threshold * input.config.sameTurnThresholdMultiplier,
      input.config.sameTurnAbsoluteFloor,
    );
    const contributingSignalIds = survivingPositives
      .sort(
        (a, b) =>
          b.decayedWeight * b.signal.precisionPrior -
          a.decayedWeight * a.signal.precisionPrior,
      )
      .map((entry) => entry.signal.id);

    // Always consume the budget-target latch on composite escalation so a
    // prior emphatic composite cannot leave `thresholdLoweredSinceLastEscalation`
    // set and mis-attribute the next composite as FUSION_BUDGET_TARGET.
    const budgetTargetAttribution = this.consumeBudgetTargetFlag();
    const compositeReason =
      netScore >= sameTurnThreshold
        ? PolluxEscalationReasonCode.FUSION_COMPOSITE_EMPHATIC
        : budgetTargetAttribution
          ? PolluxEscalationReasonCode.FUSION_BUDGET_TARGET
          : PolluxEscalationReasonCode.FUSION_COMPOSITE;
    return {
      escalate: true,
      reasonCode: compositeReason,
      netScore,
      threshold,
      contributingSignalIds,
    };
  }

  private noteThresholdAdjustment(threshold: number): void {
    const previous = this.lastComputedThreshold;
    this.lastComputedThreshold = threshold;
    if (previous === undefined) {
      return;
    }
    // If the auto-calibrated threshold drops (even slightly), remember that the
    // next composite escalation was influenced by the budget target.
    if (threshold < previous - 0.05) {
      this.thresholdLoweredSinceLastEscalation = true;
    }
  }

  private consumeBudgetTargetFlag(): boolean {
    if (!this.thresholdLoweredSinceLastEscalation) {
      return false;
    }
    this.thresholdLoweredSinceLastEscalation = false;
    return true;
  }

  private computeThreshold(config: FusionConfig): number {
    const baseline =
      this.completedTurnNetScores.length > 0
        ? quantile(this.completedTurnNetScores, 1 - config.targetEscalationRate)
        : config.minAbsoluteThreshold;
    return Math.max(
      config.minAbsoluteThreshold,
      Math.min(config.maxAbsoluteThreshold, baseline),
    );
  }
}
