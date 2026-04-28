/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRealBenchmarkSeedTask } from '../../core/src/pollux/benchmark/realTasks.js';
import type {
  RealBenchmarkAdvisorConsultOutcome,
  RealBenchmarkAdvisorAttemptRecord,
  RealBenchmarkCanaryReliabilitySummary,
  RealBenchmarkCampaignManifest,
  RealBenchmarkCampaignSummary,
  RealBenchmarkCellAggregateSummary,
  RealBenchmarkConditionId,
  RealBenchmarkConditionSummary,
  RealBenchmarkConfusionOutcome,
  RealBenchmarkDesiredOutcomeReasonCode,
  RealBenchmarkEscalationTimingBucket,
  RealBenchmarkEscalationTimingSummary,
  RealBenchmarkLaneConditionSummary,
  RealBenchmarkM3CalibrationSummary,
  RealBenchmarkM3CalibrationThresholds,
  RealBenchmarkM3ConditionTaskStats,
  RealBenchmarkM3ConditionValueSummary,
  RealBenchmarkM3SelectedTaskSet,
  RealBenchmarkM3TaskCalibrationSummary,
  RealBenchmarkM3TaskValueSummary,
  RealBenchmarkM3ValueSummary,
  RealBenchmarkM3ValueThresholds,
  RealBenchmarkNumericStats,
  RealBenchmarkRateInterval,
  RealBenchmarkRepeatSummary,
  RealBenchmarkRunRecord,
  RealBenchmarkRunDiagnosticSummary,
  RealBenchmarkStressSummary,
  RealBenchmarkTemporaryFlashOnlySelectedTaskSet,
  RealBenchmarkTemporaryFlashOnlySummary,
  RealBenchmarkTemporaryFlashOnlyTaskSummary,
} from './pollux-real-types.js';
import type {
  RealBenchmarkEscalationSignalClass,
  RealBenchmarkLane,
} from '../../core/src/pollux/benchmark/realTypes.js';

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function stddev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function buildNumericStats(values: number[]): RealBenchmarkNumericStats {
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    stddev: stddev(values),
  };
}

function buildWilsonInterval(
  successCount: number,
  sampleCount: number,
): RealBenchmarkRateInterval {
  if (sampleCount <= 0) {
    return {
      n: sampleCount,
      proportion: null,
      lower: null,
      upper: null,
    };
  }

  const z = 1.959963984540054;
  const p = successCount / sampleCount;
  const denom = 1 + z ** 2 / sampleCount;
  const center = p + z ** 2 / (2 * sampleCount);
  const margin =
    z *
    Math.sqrt((p * (1 - p)) / sampleCount + z ** 2 / (4 * sampleCount ** 2));

  return {
    n: sampleCount,
    proportion: p,
    lower: Math.max(0, (center - margin) / denom),
    upper: Math.min(1, (center + margin) / denom),
  };
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length !== values.length) {
    return null;
  }
  return present.reduce((sum, value) => sum + value, 0);
}

function divideOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function buildAllSampleUsageSummary(runs: RealBenchmarkRunRecord[]) {
  return {
    totalTokens: runs.reduce((sum, run) => sum + run.tokens.total, 0),
    advisorTokens: runs.reduce((sum, run) => sum + run.tokens.advisor, 0),
    executorTokens: runs.reduce((sum, run) => sum + run.tokens.executor, 0),
    totalCostUsd: sumNullable(runs.map((run) => run.costUsd.total)),
    advisorCalls: runs.reduce((sum, run) => sum + run.observedAdvisorCalls, 0),
    escalationAttempts: runs.reduce(
      (sum, run) => sum + getObservedEscalationAttempts(run),
      0,
    ),
    rawOraclePasses: runs.filter((run) => run.oraclePass).length,
    ceilingInvalidations: runs.filter(
      (run) => run.invalidationReason === 'model_call_ceiling_exceeded',
    ).length,
    meanModelResponses: mean(runs.map((run) => run.modelResponseCount)),
    meanWallClockMs: mean(runs.map((run) => run.wallClockMs)),
  };
}

function getEscalationEvents(run: RealBenchmarkRunRecord) {
  return run.escalationEvents ?? [];
}

function getAdvisorAttempts(
  run: RealBenchmarkRunRecord,
): RealBenchmarkAdvisorAttemptRecord[] {
  return run.advisorAttempts ?? [];
}

function getExcludedFromConfusion(run: RealBenchmarkRunRecord) {
  return run.excludedFromConfusion ?? null;
}

const CONSULT_ATTEMPT_OUTCOMES = new Set([
  'consulted',
  'fail_open',
  'budget_exhausted',
  'policy_denied',
  'deferred_next_turn',
]);

function getObservedEscalationAttempts(run: RealBenchmarkRunRecord): number {
  if (typeof run.observedEscalationAttempts === 'number') {
    return run.observedEscalationAttempts;
  }
  return getEscalationEvents(run).filter(
    (event): boolean =>
      event.outcome !== null && CONSULT_ATTEMPT_OUTCOMES.has(event.outcome),
  ).length;
}

function getPolluxEscalationTelemetryCount(
  run: RealBenchmarkRunRecord,
): number {
  if (typeof run.polluxEscalationTelemetryCount === 'number') {
    return run.polluxEscalationTelemetryCount;
  }
  return getEscalationEvents(run).length;
}

function getStdoutStatusTagCount(run: RealBenchmarkRunRecord): number {
  return typeof run.stdoutStatusTagCount === 'number'
    ? run.stdoutStatusTagCount
    : 0;
}

function getStderrWorkspacePathViolationCount(
  run: RealBenchmarkRunRecord,
): number {
  return typeof run.stderrWorkspacePathViolationCount === 'number'
    ? run.stderrWorkspacePathViolationCount
    : 0;
}

function getToolErrorCount(run: RealBenchmarkRunRecord): number {
  return typeof run.toolErrorCount === 'number' ? run.toolErrorCount : 0;
}

function getMalformedStatusTagCount(run: RealBenchmarkRunRecord): number {
  return typeof run.malformedStatusTagCount === 'number'
    ? run.malformedStatusTagCount
    : 0;
}

function getNearMissStatusTagCount(run: RealBenchmarkRunRecord): number {
  return typeof run.nearMissStatusTagCount === 'number'
    ? run.nearMissStatusTagCount
    : 0;
}

function getActualAdvisorConsultOutcome(
  run: RealBenchmarkRunRecord,
): RealBenchmarkAdvisorConsultOutcome {
  if (run.actualAdvisorConsultOutcome) {
    return run.actualAdvisorConsultOutcome;
  }
  for (const event of getEscalationEvents(run)) {
    if (
      event.outcome === 'consulted' ||
      event.outcome === 'fail_open' ||
      event.outcome === 'budget_exhausted' ||
      event.outcome === 'policy_denied'
    ) {
      return event.outcome;
    }
  }
  return run.advisorConsultOutcome ?? 'not_attempted';
}

function getSignalClass(
  run: RealBenchmarkRunRecord,
): RealBenchmarkEscalationSignalClass | null {
  if (run.detectorOpportunity?.signalClass) {
    return run.detectorOpportunity.signalClass;
  }
  try {
    return getRealBenchmarkSeedTask(run.taskId).escalationSignalClass;
  } catch {
    return null;
  }
}

function getM3Opportunity(run: RealBenchmarkRunRecord): boolean | null {
  if (run.detectorOpportunity) {
    return run.detectorOpportunity.expectedForM3;
  }
  const signalClass = getSignalClass(run);
  if (signalClass === null) {
    return null;
  }
  return (
    run.conditionId === 'F' &&
    signalClass !== 'none' &&
    (signalClass === 'risk_gate' ||
      signalClass === 'hard_loop' ||
      signalClass === 'fusion_composite' ||
      signalClass === 'self_report')
  );
}

function formatNullableNumber(value: number | null | undefined): string {
  return typeof value === 'number' ? formatNumber(value) : 'n/a';
}

function getBenchmarkLane(run: RealBenchmarkRunRecord): RealBenchmarkLane {
  if (run.benchmarkLane) {
    return run.benchmarkLane;
  }
  try {
    return getRealBenchmarkSeedTask(run.taskId).benchmarkLane;
  } catch {
    return run.taskEscalates ? 'canary' : 'core';
  }
}

function getAdvisorConsultOutcome(
  run: RealBenchmarkRunRecord,
  expectedEscalation: boolean,
): RealBenchmarkAdvisorConsultOutcome {
  for (const event of getEscalationEvents(run)) {
    if (
      event.outcome === 'consulted' ||
      event.outcome === 'fail_open' ||
      event.outcome === 'budget_exhausted' ||
      event.outcome === 'policy_denied'
    ) {
      return event.outcome;
    }
  }

  if (run.advisorConsultOutcome) {
    return run.advisorConsultOutcome;
  }
  if (!expectedEscalation) {
    return 'not_expected';
  }

  return 'not_attempted';
}

function getAdvisorFailureKind(run: RealBenchmarkRunRecord): string | null {
  if (
    'advisorFailureKind' in run &&
    typeof run.advisorFailureKind === 'string'
  ) {
    return run.advisorFailureKind;
  }
  for (
    let index = getEscalationEvents(run).length - 1;
    index >= 0;
    index -= 1
  ) {
    const failureKind = getEscalationEvents(run)[index]?.failureKind;
    if (failureKind) {
      return failureKind;
    }
  }
  for (let index = getAdvisorAttempts(run).length - 1; index >= 0; index -= 1) {
    const failureKind = getAdvisorAttempts(run)[index]?.failureKind;
    if (failureKind) {
      return failureKind;
    }
  }
  return null;
}

function computeDesiredOutcome(params: {
  run: RealBenchmarkRunRecord;
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>;
}): {
  lane: RealBenchmarkLane;
  expectedEscalation: boolean;
  predictedEscalation: boolean;
  advisorConsultOutcome: RealBenchmarkAdvisorConsultOutcome;
  satisfied: boolean;
  reasonCode: RealBenchmarkDesiredOutcomeReasonCode;
} {
  const lane = getBenchmarkLane(params.run);
  const expectedEscalation = computeExpectedEscalation(
    params.run,
    params.polluxEnabledByCondition,
  );
  const predictedEscalation = computePredictedEscalation(params.run);
  const advisorConsultOutcome = getAdvisorConsultOutcome(
    params.run,
    expectedEscalation,
  );

  if (lane === 'core') {
    if (params.run.invalidated) {
      return {
        lane,
        expectedEscalation,
        predictedEscalation,
        advisorConsultOutcome,
        satisfied: false,
        reasonCode: 'core.invalidated',
      };
    }
    if (!params.run.oraclePass) {
      return {
        lane,
        expectedEscalation,
        predictedEscalation,
        advisorConsultOutcome,
        satisfied: false,
        reasonCode: 'core.oracle_failed',
      };
    }
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: true,
      reasonCode: 'core.oracle_pass',
    };
  }

  if (lane === 'stress') {
    if (params.run.invalidated) {
      return {
        lane,
        expectedEscalation,
        predictedEscalation,
        advisorConsultOutcome,
        satisfied: false,
        reasonCode: 'stress.invalidated',
      };
    }
    if (!params.run.oraclePass) {
      return {
        lane,
        expectedEscalation,
        predictedEscalation,
        advisorConsultOutcome,
        satisfied: false,
        reasonCode: 'stress.oracle_failed',
      };
    }
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: true,
      reasonCode: 'stress.oracle_pass',
    };
  }

  if (params.run.invalidated) {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: false,
      reasonCode: 'canary.invalidated',
    };
  }
  if (!params.run.oraclePass) {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: false,
      reasonCode: 'canary.oracle_failed',
    };
  }
  if (!expectedEscalation && !predictedEscalation) {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: true,
      reasonCode: 'canary.true_negative',
    };
  }
  if (!expectedEscalation && predictedEscalation) {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: false,
      reasonCode: 'canary.unexpected_escalation',
    };
  }
  if (expectedEscalation && !predictedEscalation) {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: false,
      reasonCode: 'canary.missed_escalation',
    };
  }
  if (advisorConsultOutcome === 'consulted') {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: true,
      reasonCode: 'canary.consulted_true_positive',
    };
  }
  if (advisorConsultOutcome === 'fail_open') {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: false,
      reasonCode: 'canary.fail_open',
    };
  }
  if (advisorConsultOutcome === 'budget_exhausted') {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: false,
      reasonCode: 'canary.budget_exhausted',
    };
  }
  if (advisorConsultOutcome === 'policy_denied') {
    return {
      lane,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
      satisfied: false,
      reasonCode: 'canary.policy_denied',
    };
  }

  return {
    lane,
    expectedEscalation,
    predictedEscalation,
    advisorConsultOutcome,
    satisfied: false,
    reasonCode: 'canary.predicted_without_consult',
  };
}

function computeExpectedEscalation(
  run: RealBenchmarkRunRecord,
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>,
): boolean {
  return typeof run.expectedEscalation === 'boolean'
    ? run.expectedEscalation
    : run.taskEscalates && polluxEnabledByCondition[run.conditionId];
}

function computePredictedEscalation(run: RealBenchmarkRunRecord): boolean {
  return typeof run.predictedEscalation === 'boolean'
    ? run.predictedEscalation
    : getObservedEscalationAttempts(run) > 0 || run.observedAdvisorCalls > 0;
}

function computeConfusionOutcome(params: {
  run: RealBenchmarkRunRecord;
  expected: boolean;
  predicted: boolean;
}): RealBenchmarkConfusionOutcome {
  if (params.run.invalidated || getExcludedFromConfusion(params.run) !== null) {
    return 'excluded';
  }
  if (params.expected && params.predicted) {
    return 'true_positive';
  }
  if (!params.expected && params.predicted) {
    return 'false_positive';
  }
  if (params.expected && !params.predicted) {
    return 'false_negative';
  }
  return 'true_negative';
}

function buildConditionSummary(
  conditionId: RealBenchmarkConditionId,
  runs: RealBenchmarkRunRecord[],
): RealBenchmarkConditionSummary {
  const validRuns = runs.filter((run) => !run.invalidated);
  const serviceLatencies = validRuns.flatMap((run) => run.serviceLatencyMs);

  return {
    conditionId,
    sampleCount: runs.length,
    validSamples: validRuns.length,
    invalidSamples: runs.length - validRuns.length,
    accuracy:
      validRuns.length === 0
        ? 0
        : validRuns.filter((run) => run.oraclePass).length / validRuns.length,
    advisorCalls: validRuns.reduce(
      (sum, run) => sum + run.observedAdvisorCalls,
      0,
    ),
    escalationAttempts: validRuns.reduce(
      (sum, run) => sum + getObservedEscalationAttempts(run),
      0,
    ),
    totalTokens: validRuns.reduce((sum, run) => sum + run.tokens.total, 0),
    advisorTokens: validRuns.reduce((sum, run) => sum + run.tokens.advisor, 0),
    executorTokens: validRuns.reduce(
      (sum, run) => sum + run.tokens.executor,
      0,
    ),
    totalCostUsd: sumNullable(validRuns.map((run) => run.costUsd.total)),
    meanWallClockMs: mean(validRuns.map((run) => run.wallClockMs)),
    meanServiceLatencyMs: mean(serviceLatencies),
    allSamples: buildAllSampleUsageSummary(runs),
  };
}

function buildLaneConditionSummaries(params: {
  conditions: ReadonlyArray<{ id: RealBenchmarkConditionId }>;
  runs: RealBenchmarkRunRecord[];
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>;
}): RealBenchmarkLaneConditionSummary[] {
  const lanes: RealBenchmarkLane[] = ['core', 'stress', 'canary'];
  const summaries: RealBenchmarkLaneConditionSummary[] = [];

  for (const lane of lanes) {
    for (const condition of params.conditions) {
      const laneRuns = params.runs.filter(
        (run) =>
          run.conditionId === condition.id && getBenchmarkLane(run) === lane,
      );
      const validRuns = laneRuns.filter((run) => !run.invalidated);
      const serviceLatencies = validRuns.flatMap((run) => run.serviceLatencyMs);
      const desiredOutcomeSatisfiedCount = laneRuns.filter(
        (run) =>
          computeDesiredOutcome({
            run,
            polluxEnabledByCondition: params.polluxEnabledByCondition,
          }).satisfied,
      ).length;

      summaries.push({
        lane,
        conditionId: condition.id,
        sampleCount: laneRuns.length,
        validSamples: validRuns.length,
        invalidSamples: laneRuns.length - validRuns.length,
        oraclePassCount: validRuns.filter((run) => run.oraclePass).length,
        desiredOutcomeSatisfiedCount,
        desiredOutcomeSatisfactionRate:
          divideOrNull(desiredOutcomeSatisfiedCount, laneRuns.length) ?? 0,
        advisorCalls: validRuns.reduce(
          (sum, run) => sum + run.observedAdvisorCalls,
          0,
        ),
        escalationAttempts: validRuns.reduce(
          (sum, run) => sum + getObservedEscalationAttempts(run),
          0,
        ),
        totalTokens: validRuns.reduce((sum, run) => sum + run.tokens.total, 0),
        advisorTokens: validRuns.reduce(
          (sum, run) => sum + run.tokens.advisor,
          0,
        ),
        executorTokens: validRuns.reduce(
          (sum, run) => sum + run.tokens.executor,
          0,
        ),
        meanWallClockMs: mean(validRuns.map((run) => run.wallClockMs)),
        meanServiceLatencyMs: mean(serviceLatencies),
        allSamples: buildAllSampleUsageSummary(laneRuns),
      });
    }
  }

  return summaries;
}

function buildCanaryConsultSummary(params: {
  runs: RealBenchmarkRunRecord[];
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>;
}) {
  const expectedPositiveRuns = params.runs.filter((run) => {
    const desired = computeDesiredOutcome({
      run,
      polluxEnabledByCondition: params.polluxEnabledByCondition,
    });
    return desired.lane === 'canary' && desired.expectedEscalation;
  });
  const validExpectedPositiveRuns = expectedPositiveRuns.filter(
    (run) => !run.invalidated,
  );
  const consultOutcomes = validExpectedPositiveRuns.map(
    (run) =>
      computeDesiredOutcome({
        run,
        polluxEnabledByCondition: params.polluxEnabledByCondition,
      }).advisorConsultOutcome,
  );

  const consulted = consultOutcomes.filter(
    (outcome) => outcome === 'consulted',
  ).length;

  return {
    expectedPositiveSampleCount: expectedPositiveRuns.length,
    validExpectedPositiveSampleCount: validExpectedPositiveRuns.length,
    attempted: consultOutcomes.filter(
      (outcome) =>
        outcome === 'consulted' ||
        outcome === 'fail_open' ||
        outcome === 'budget_exhausted' ||
        outcome === 'policy_denied',
    ).length,
    consulted,
    failOpen: consultOutcomes.filter((outcome) => outcome === 'fail_open')
      .length,
    budgetExhausted: consultOutcomes.filter(
      (outcome) => outcome === 'budget_exhausted',
    ).length,
    policyDenied: consultOutcomes.filter(
      (outcome) => outcome === 'policy_denied',
    ).length,
    notAttempted: consultOutcomes.filter(
      (outcome) => outcome === 'not_attempted',
    ).length,
    consultSuccessRate: divideOrNull(
      consulted,
      validExpectedPositiveRuns.length,
    ),
    consultSuccessWilson95: buildWilsonInterval(
      consulted,
      validExpectedPositiveRuns.length,
    ),
  };
}

function buildStressSummary(params: {
  runs: RealBenchmarkRunRecord[];
}): RealBenchmarkStressSummary {
  const stressRuns = params.runs.filter(
    (run) => getBenchmarkLane(run) === 'stress',
  );
  const invalidationReasonCounts = new Map<string, number>();

  for (const run of stressRuns) {
    if (run.invalidationReason) {
      invalidationReasonCounts.set(
        run.invalidationReason,
        (invalidationReasonCounts.get(run.invalidationReason) ?? 0) + 1,
      );
    }
  }

  return {
    sampleCount: stressRuns.length,
    validSampleCount: stressRuns.filter((run) => !run.invalidated).length,
    invalidSampleCount: stressRuns.filter((run) => run.invalidated).length,
    modelCallCeilingExceededCount: stressRuns.filter(
      (run) => run.invalidationReason === 'model_call_ceiling_exceeded',
    ).length,
    invalidationReasonCounts: Object.fromEntries(
      [...invalidationReasonCounts.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
    meanModelResponseCount: mean(
      stressRuns.map((run) => run.modelResponseCount),
    ),
    meanTotalTokens: mean(stressRuns.map((run) => run.tokens.total)),
  };
}

function incrementInvalidationCount(
  target: Record<string, Record<string, number>>,
  group: string,
  reason: string,
): void {
  target[group] = target[group] ?? {};
  target[group][reason] = (target[group][reason] ?? 0) + 1;
}

function buildInvalidationSummary(runs: RealBenchmarkRunRecord[]) {
  const byCondition: Record<string, Record<string, number>> = {};
  const byLane: Record<string, Record<string, number>> = {};
  const byCell: Record<string, Record<string, number>> = {};
  for (const run of runs) {
    if (!run.invalidationReason) {
      continue;
    }
    incrementInvalidationCount(
      byCondition,
      run.conditionId,
      run.invalidationReason,
    );
    incrementInvalidationCount(
      byLane,
      getBenchmarkLane(run),
      run.invalidationReason,
    );
    incrementInvalidationCount(
      byCell,
      `${run.conditionId}/${run.taskId}`,
      run.invalidationReason,
    );
  }
  return { byCondition, byLane, byCell };
}

function buildRepeatSummaries(params: {
  manifest: RealBenchmarkCampaignManifest;
  corpusSha: string;
  runs: RealBenchmarkRunRecord[];
  publishabilityBlockers: string[];
}): RealBenchmarkRepeatSummary[] {
  const summaries: RealBenchmarkRepeatSummary[] = [];
  const sampleIndexes = [
    ...new Set(params.runs.map((run) => run.sampleIndex).sort((a, b) => a - b)),
  ];

  for (const sampleIndex of sampleIndexes) {
    const repeatRuns = params.runs.filter(
      (run) => run.sampleIndex === sampleIndex,
    );
    const repeatSummary = buildRealBenchmarkCampaignSummary(
      params.manifest,
      params.corpusSha,
      repeatRuns,
      params.publishabilityBlockers,
      { includeRepeatSummaries: false },
    );
    summaries.push({
      sampleIndex,
      sampleCount: repeatSummary.sampleCount,
      validSampleCount: repeatSummary.validSampleCount,
      invalidSampleCount: repeatSummary.invalidSampleCount,
      canaryConsultSummary: repeatSummary.canaryConsultSummary,
      escalation: repeatSummary.escalation,
      publishabilityBlockers: repeatSummary.publishabilityBlockers,
      summaryPath: `repeats/repeat-${String(sampleIndex).padStart(3, '0')}.summary.json`,
      reportPath: `repeats/repeat-${String(sampleIndex).padStart(3, '0')}.report.md`,
    });
  }

  return summaries;
}

function buildCellAggregateSummaries(
  runs: RealBenchmarkRunRecord[],
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>,
): RealBenchmarkCellAggregateSummary[] {
  const cells = new Map<string, RealBenchmarkRunRecord[]>();
  for (const run of runs) {
    const key = `${run.taskId}::${run.conditionId}`;
    const existing = cells.get(key) ?? [];
    existing.push(run);
    cells.set(key, existing);
  }

  return [...cells.entries()]
    .map(([cellKey, cellRuns]) => {
      const validRuns = cellRuns.filter((run) => !run.invalidated);
      const desiredSatisfiedCount = cellRuns.filter(
        (run) =>
          computeDesiredOutcome({
            run,
            polluxEnabledByCondition,
          }).satisfied,
      ).length;
      const consultSuccessCount = validRuns.filter(
        (run) =>
          computeDesiredOutcome({
            run,
            polluxEnabledByCondition,
          }).advisorConsultOutcome === 'consulted',
      ).length;
      const lane = getBenchmarkLane(cellRuns[0]);
      const parseErrorCount = validRuns.filter((run) =>
        getAdvisorAttempts(run).some(
          (attempt) => attempt.outcome === 'parse_error',
        ),
      ).length;

      return {
        cellKey,
        taskId: cellRuns[0].taskId,
        conditionId: cellRuns[0].conditionId,
        lane,
        repeatCount: cellRuns.length,
        sampleCount: cellRuns.length,
        validSampleCount: validRuns.length,
        invalidSampleCount: cellRuns.length - validRuns.length,
        desiredOutcomeSatisfiedCount: desiredSatisfiedCount,
        desiredOutcomeSatisfactionRate:
          divideOrNull(desiredSatisfiedCount, cellRuns.length) ?? 0,
        desiredOutcomeWilson95: buildWilsonInterval(
          desiredSatisfiedCount,
          cellRuns.length,
        ),
        consultSuccessCount,
        consultSuccessRate: divideOrNull(consultSuccessCount, validRuns.length),
        consultSuccessWilson95: buildWilsonInterval(
          consultSuccessCount,
          validRuns.length,
        ),
        failOpenCount: validRuns.filter(
          (run) =>
            computeDesiredOutcome({
              run,
              polluxEnabledByCondition,
            }).advisorConsultOutcome === 'fail_open',
        ).length,
        parseErrorCount,
        wallClockMs: buildNumericStats(validRuns.map((run) => run.wallClockMs)),
        totalTokens: buildNumericStats(
          validRuns.map((run) => run.tokens.total),
        ),
        advisorTokens: buildNumericStats(
          validRuns.map((run) => run.tokens.advisor),
        ),
        allSamples: buildAllSampleUsageSummary(cellRuns),
      };
    })
    .sort(
      (a, b) =>
        a.conditionId.localeCompare(b.conditionId) ||
        a.taskId.localeCompare(b.taskId),
    );
}

function buildCanaryReliabilitySummary(params: {
  runs: RealBenchmarkRunRecord[];
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>;
}): RealBenchmarkCanaryReliabilitySummary {
  const expectedPositiveRuns = params.runs.filter((run) => {
    const desired = computeDesiredOutcome({
      run,
      polluxEnabledByCondition: params.polluxEnabledByCondition,
    });
    return desired.lane === 'canary' && desired.expectedEscalation;
  });
  const validRuns = expectedPositiveRuns.filter((run) => !run.invalidated);
  const consultedCount = validRuns.filter(
    (run) =>
      computeDesiredOutcome({
        run,
        polluxEnabledByCondition: params.polluxEnabledByCondition,
      }).advisorConsultOutcome === 'consulted',
  ).length;
  const failOpenCount = validRuns.filter(
    (run) =>
      computeDesiredOutcome({
        run,
        polluxEnabledByCondition: params.polluxEnabledByCondition,
      }).advisorConsultOutcome === 'fail_open',
  ).length;
  const falseNegativeCount = validRuns.filter((run) => {
    const desired = computeDesiredOutcome({
      run,
      polluxEnabledByCondition: params.polluxEnabledByCondition,
    });
    return desired.expectedEscalation && !desired.predictedEscalation;
  }).length;

  const failureKindCounts = new Map<string, number>();
  let primarySuccess = 0;
  let repairRetrySuccess = 0;
  let fallbackSuccess = 0;
  let parseErrorCount = 0;

  for (const run of validRuns) {
    const attempts = [...getAdvisorAttempts(run)].sort(
      (a, b) => a.attemptIndex - b.attemptIndex || a.eventIndex - b.eventIndex,
    );
    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt?.outcome === 'consulted') {
      if (lastAttempt.attemptKind === 'primary') {
        primarySuccess += 1;
      } else if (lastAttempt.attemptKind === 'repair_retry') {
        repairRetrySuccess += 1;
      } else if (lastAttempt.attemptKind === 'fallback') {
        fallbackSuccess += 1;
      }
    }

    for (const attempt of attempts) {
      if (attempt.outcome === 'parse_error') {
        parseErrorCount += 1;
      }
      if (attempt.failureKind) {
        failureKindCounts.set(
          attempt.failureKind,
          (failureKindCounts.get(attempt.failureKind) ?? 0) + 1,
        );
      }
    }
  }

  return {
    expectedPositiveSampleCount: expectedPositiveRuns.length,
    validExpectedPositiveSampleCount: validRuns.length,
    consultedCount,
    failOpenCount,
    parseErrorCount,
    falseNegativeCount,
    budgetExhaustedCount: validRuns.filter(
      (run) =>
        computeDesiredOutcome({
          run,
          polluxEnabledByCondition: params.polluxEnabledByCondition,
        }).advisorConsultOutcome === 'budget_exhausted',
    ).length,
    consultSuccessRate: divideOrNull(consultedCount, validRuns.length),
    consultSuccessWilson95: buildWilsonInterval(
      consultedCount,
      validRuns.length,
    ),
    attemptPathCounts: {
      primarySuccess,
      repairRetrySuccess,
      fallbackSuccess,
      finalFailOpen: failOpenCount,
    },
    failureKindCounts: Object.fromEntries(
      [...failureKindCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

function buildConfusionCounts(params: {
  runs: RealBenchmarkRunRecord[];
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>;
}) {
  let predictedPositive = 0;
  let expectedPositive = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;

  for (const run of params.runs) {
    const predicted = computePredictedEscalation(run);
    const expected = computeExpectedEscalation(
      run,
      params.polluxEnabledByCondition,
    );

    if (predicted) {
      predictedPositive += 1;
    }
    if (expected) {
      expectedPositive += 1;
    }

    if (predicted && expected) {
      truePositive += 1;
    } else if (predicted && !expected) {
      falsePositive += 1;
    } else if (!predicted && expected) {
      falseNegative += 1;
    } else {
      trueNegative += 1;
    }
  }

  return {
    predictedPositive,
    expectedPositive,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: divideOrNull(truePositive, predictedPositive),
    recall: divideOrNull(truePositive, expectedPositive),
  };
}

function getPrimaryTiming(
  run: RealBenchmarkRunRecord,
): RealBenchmarkEscalationTimingBucket {
  const consultRelated = new Set([
    'consulted',
    'fail_open',
    'budget_exhausted',
    'policy_denied',
    'deferred_next_turn',
  ]);
  const primary = getEscalationEvents(run).find(
    (event) =>
      event.outcome !== null &&
      consultRelated.has(event.outcome) &&
      event.escalationTiming !== null,
  );
  if (primary?.escalationTiming) {
    return primary.escalationTiming;
  }
  return 'missing_event';
}

function buildTimingBreakdown(params: {
  runs: RealBenchmarkRunRecord[];
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>;
}): RealBenchmarkEscalationTimingSummary[] {
  const timingValues: RealBenchmarkEscalationTimingBucket[] = [
    'same_turn',
    'next_turn',
    'missing_event',
  ];
  const breakdown: RealBenchmarkEscalationTimingSummary[] = [];

  for (const timing of timingValues) {
    const timingRuns = params.runs.filter(
      (run) => getPrimaryTiming(run) === timing,
    );
    const confusion = buildConfusionCounts({
      runs: timingRuns,
      polluxEnabledByCondition: params.polluxEnabledByCondition,
    });
    breakdown.push({
      timing,
      includedSampleCount: timingRuns.length,
      predictedPositive: confusion.predictedPositive,
      expectedPositive: confusion.expectedPositive,
      truePositive: confusion.truePositive,
      falsePositive: confusion.falsePositive,
      falseNegative: confusion.falseNegative,
      trueNegative: confusion.trueNegative,
      precision: confusion.precision,
      recall: confusion.recall,
    });
  }

  return breakdown;
}

function buildReasonCodeCounts(
  runs: RealBenchmarkRunRecord[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const run of runs) {
    for (const event of getEscalationEvents(run)) {
      if (!event.reasonCode) {
        continue;
      }
      counts.set(event.reasonCode, (counts.get(event.reasonCode) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

function buildRunDiagnostics(
  runs: RealBenchmarkRunRecord[],
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>,
): RealBenchmarkRunDiagnosticSummary[] {
  return runs
    .map((run) => {
      const desired = computeDesiredOutcome({
        run,
        polluxEnabledByCondition,
      });
      return {
        sampleId: run.sampleId,
        taskId: run.taskId,
        conditionId: run.conditionId,
        benchmarkLane: desired.lane,
        valid: !run.invalidated,
        oraclePass: run.oraclePass,
        desiredOutcomeSatisfied: desired.satisfied,
        desiredOutcomeReasonCode: desired.reasonCode,
        expectedEscalation: desired.expectedEscalation,
        predictedEscalation: desired.predictedEscalation,
        advisorConsultOutcome: desired.advisorConsultOutcome,
        advisorFailureKind: getAdvisorFailureKind(run),
        confusionOutcome: computeConfusionOutcome({
          run,
          expected: desired.expectedEscalation,
          predicted: desired.predictedEscalation,
        }),
        primaryTiming: getPrimaryTiming(run),
        reasonCodes: run.reasonCodes ?? [],
        invalidationReason: run.invalidationReason ?? null,
        modelResponseCount: run.modelResponseCount,
        responseCeiling: run.responseCeiling ?? null,
        totalTokens: run.tokens.total,
        advisorTokens: run.tokens.advisor,
        totalCostUsd: run.costUsd.total,
        advisorCalls: run.observedAdvisorCalls,
        escalationAttempts: getObservedEscalationAttempts(run),
        signalClass: getSignalClass(run),
        m3Opportunity: getM3Opportunity(run),
        firstAdvisorCallModelResponseOrdinal:
          run.polluxTimingDiagnostics?.firstAdvisorCallModelResponseOrdinal ??
          null,
        executorResponsesBeforeFirstAdvisor:
          run.polluxTimingDiagnostics?.executorResponsesBeforeFirstAdvisor ??
          null,
        executorResponsesAfterFirstAdvisor:
          run.polluxTimingDiagnostics?.executorResponsesAfterFirstAdvisor ??
          null,
        actualAdvisorConsultOutcome: getActualAdvisorConsultOutcome(run),
        toolErrorCount: getToolErrorCount(run),
        stdoutStatusTagCount: getStdoutStatusTagCount(run),
        malformedStatusTagCount: getMalformedStatusTagCount(run),
        nearMissStatusTagCount: getNearMissStatusTagCount(run),
      };
    })
    .sort(
      (a, b) =>
        a.conditionId.localeCompare(b.conditionId) ||
        a.taskId.localeCompare(b.taskId) ||
        a.sampleId.localeCompare(b.sampleId),
    );
}

function buildEscalationEvidenceBlockers(
  runs: RealBenchmarkRunRecord[],
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>,
): string[] {
  const validRuns = runs.filter((run) => !run.invalidated);
  const blockers: string[] = [];

  const hasAdvisorWithoutEscalationEvidence = validRuns.some(
    (run) =>
      run.observedAdvisorCalls > 0 && getEscalationEvents(run).length === 0,
  );
  if (hasAdvisorWithoutEscalationEvidence) {
    blockers.push(
      'Advisor calls were observed in valid samples, but no pollux escalation telemetry events were captured for at least one such sample.',
    );
  }

  const consultRelated = new Set([
    'consulted',
    'fail_open',
    'budget_exhausted',
    'policy_denied',
    'deferred_next_turn',
  ]);
  const hasMissingReasonOrTiming = validRuns.some((run) =>
    getEscalationEvents(run).some(
      (event) =>
        event.outcome !== null &&
        consultRelated.has(event.outcome) &&
        (event.reasonCode === null || event.escalationTiming === null),
    ),
  );
  if (hasMissingReasonOrTiming) {
    blockers.push(
      'Escalation telemetry is present, but at least one consult-related escalation event is missing reason_code or escalation_timing.',
    );
  }

  const hasStatusTagWithoutEscalationTelemetry = validRuns.some(
    (run) =>
      computeExpectedEscalation(run, polluxEnabledByCondition) &&
      getStdoutStatusTagCount(run) > 0 &&
      getPolluxEscalationTelemetryCount(run) === 0,
  );
  if (hasStatusTagWithoutEscalationTelemetry) {
    blockers.push(
      'At least one Pollux-eligible escalating sample emitted a pollux:status tag but recorded zero pollux escalation telemetry events.',
    );
  }

  const falseNegativeSamples = validRuns.filter((run) => {
    const expected = computeExpectedEscalation(run, polluxEnabledByCondition);
    const predicted = computePredictedEscalation(run);
    return expected && !predicted && getExcludedFromConfusion(run) === null;
  });
  if (falseNegativeSamples.length > 0) {
    blockers.push(
      `Observed ${falseNegativeSamples.length} valid Pollux-eligible escalating samples with no advisor/escalation evidence (false negatives): ${falseNegativeSamples.map((run) => run.sampleId).join(', ')}.`,
    );
  }

  const malformedStatusTagCount = validRuns.reduce(
    (sum, run) => sum + getMalformedStatusTagCount(run),
    0,
  );
  if (malformedStatusTagCount > 0) {
    blockers.push(
      `Observed ${malformedStatusTagCount} malformed pollux:status near-misses in stdout across valid samples; malformed tags are diagnostics, not valid escalation signals.`,
    );
  }

  const workspacePathViolationCount = validRuns.reduce(
    (sum, run) => sum + getStderrWorkspacePathViolationCount(run),
    0,
  );
  if (workspacePathViolationCount > 0) {
    blockers.push(
      `Observed ${workspacePathViolationCount} workspace path-violation tool errors ("Path not in workspace") across valid samples; this can mask escalation behavior.`,
    );
  }

  const toolErrorCount = validRuns.reduce(
    (sum, run) => sum + getToolErrorCount(run),
    0,
  );
  if (toolErrorCount > 0) {
    blockers.push(
      `Observed ${toolErrorCount} tool/shell errors across valid samples; inspect stderr before using the run as clean behavioral evidence.`,
    );
  }

  return blockers;
}

export function buildRealBenchmarkCampaignSummary(
  manifest: RealBenchmarkCampaignManifest,
  corpusSha: string,
  runs: RealBenchmarkRunRecord[],
  publishabilityBlockers: string[],
  options?: { includeRepeatSummaries?: boolean },
): RealBenchmarkCampaignSummary {
  const validRuns = runs.filter((run) => !run.invalidated);
  const includedRuns = validRuns.filter(
    (run) => getExcludedFromConfusion(run) === null,
  );
  const polluxEnabledByCondition = Object.fromEntries(
    manifest.conditions.map((condition) => [
      condition.id,
      condition.polluxEnabled,
    ]),
  ) as Readonly<Record<RealBenchmarkConditionId, boolean>>;
  const confusion = buildConfusionCounts({
    runs: includedRuns,
    polluxEnabledByCondition,
  });
  const evidenceBlockers = buildEscalationEvidenceBlockers(
    runs,
    polluxEnabledByCondition,
  );
  const runDiagnostics = buildRunDiagnostics(runs, polluxEnabledByCondition);
  const laneConditionSummaries = buildLaneConditionSummaries({
    conditions: manifest.conditions,
    runs,
    polluxEnabledByCondition,
  });
  const canaryConsultSummary = buildCanaryConsultSummary({
    runs,
    polluxEnabledByCondition,
  });
  const repeatSummaries =
    options?.includeRepeatSummaries === false
      ? []
      : buildRepeatSummaries({
          manifest,
          corpusSha,
          runs,
          publishabilityBlockers,
        });
  const cellAggregateSummaries = buildCellAggregateSummaries(
    runs,
    polluxEnabledByCondition,
  );
  const canaryReliabilitySummary = buildCanaryReliabilitySummary({
    runs,
    polluxEnabledByCondition,
  });
  const stressSummary = buildStressSummary({ runs });
  const invalidationSummary = buildInvalidationSummary(runs);

  return {
    generatedAt: new Date().toISOString(),
    manifest,
    corpusSha,
    sampleCount: runs.length,
    validSampleCount: validRuns.length,
    invalidSampleCount: runs.filter((run) => run.invalidated).length,
    conditionSummaries: manifest.conditions.map((condition) =>
      buildConditionSummary(
        condition.id,
        runs.filter((run) => run.conditionId === condition.id),
      ),
    ),
    laneConditionSummaries,
    canaryConsultSummary,
    repeatSummaries,
    cellAggregateSummaries,
    canaryReliabilitySummary,
    stressSummary,
    invalidationSummary,
    escalation: {
      includedSampleCount: includedRuns.length,
      predictedPositive: confusion.predictedPositive,
      expectedPositive: confusion.expectedPositive,
      truePositive: confusion.truePositive,
      falsePositive: confusion.falsePositive,
      falseNegative: confusion.falseNegative,
      trueNegative: confusion.trueNegative,
      precision: confusion.precision,
      recall: confusion.recall,
      exclusionCounts: {
        budgetExhausted: validRuns.filter(
          (run) => getExcludedFromConfusion(run) === 'budget_exhausted',
        ).length,
        failOpen: validRuns.filter(
          (run) => getExcludedFromConfusion(run) === 'fail_open',
        ).length,
      },
    },
    escalationTiming: buildTimingBreakdown({
      runs: includedRuns,
      polluxEnabledByCondition,
    }),
    reasonCodeCounts: buildReasonCodeCounts(validRuns),
    runDiagnostics,
    buildFreshness: runs.find((run) => run.buildFreshness)?.buildFreshness,
    publishabilityBlockers: [
      ...new Set([...publishabilityBlockers, ...evidenceBlockers]),
    ],
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatNullableCurrency(value: number | null): string {
  return value === null ? 'n/a' : `$${value.toFixed(4)}`;
}

function formatRate(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  return value ? 'yes' : 'no';
}

function formatAdvisorSplit(
  before: number | null,
  after: number | null,
): string {
  return before === null || after === null ? 'n/a' : `${before}/${after}`;
}

function formatReasonEntries(entries: Record<string, number>): string {
  const pairs = Object.entries(entries);
  if (pairs.length === 0) {
    return 'none';
  }
  return pairs.map(([reason, count]) => `${reason}=${count}`).join(', ');
}

function formatWilsonInterval(interval: RealBenchmarkRateInterval): string {
  if (
    interval.proportion === null ||
    interval.lower === null ||
    interval.upper === null
  ) {
    return 'n/a';
  }
  return `${formatRate(interval.proportion)} [${formatRate(interval.lower)}, ${formatRate(interval.upper)}]`;
}

function appendLaneSection(
  lines: string[],
  summary: RealBenchmarkCampaignSummary,
  lane: RealBenchmarkLane,
  heading: string,
): void {
  const laneRows = summary.laneConditionSummaries.filter(
    (entry) => entry.lane === lane,
  );
  const totalSamples = laneRows.reduce(
    (sum, entry) => sum + entry.sampleCount,
    0,
  );
  const satisfiedCount = laneRows.reduce(
    (sum, entry) => sum + entry.desiredOutcomeSatisfiedCount,
    0,
  );

  lines.push(heading);
  lines.push('');
  lines.push(`- Samples: ${totalSamples}`);
  lines.push(`- Desired outcomes satisfied: ${satisfiedCount}/${totalSamples}`);
  if (lane === 'stress') {
    lines.push(
      `- Stress invalidations: ${summary.stressSummary.invalidSampleCount} (model_call_ceiling_exceeded=${summary.stressSummary.modelCallCeilingExceededCount})`,
    );
    lines.push(
      `- Mean responses/tokens: ${formatNumber(summary.stressSummary.meanModelResponseCount)} / ${formatNumber(summary.stressSummary.meanTotalTokens)}`,
    );
  }
  if (lane === 'canary') {
    lines.push(
      `- Expected-positive canaries: ${summary.canaryConsultSummary.expectedPositiveSampleCount} total, ${summary.canaryConsultSummary.validExpectedPositiveSampleCount} valid`,
    );
    lines.push(
      `- Consult outcomes: attempted=${summary.canaryConsultSummary.attempted}, consulted=${summary.canaryConsultSummary.consulted}, fail_open=${summary.canaryConsultSummary.failOpen}, budget_exhausted=${summary.canaryConsultSummary.budgetExhausted}, policy_denied=${summary.canaryConsultSummary.policyDenied}, not_attempted=${summary.canaryConsultSummary.notAttempted}`,
    );
    lines.push(
      `- Consult success: ${formatWilsonInterval(summary.canaryConsultSummary.consultSuccessWilson95)}`,
    );
  }
  lines.push('');
  lines.push(
    '| Condition | Samples | Valid | Invalid | Oracle passes | Desired outcomes satisfied | Satisfaction | Advisor calls | Escalation attempts | Total tokens | Advisor tokens | Executor tokens | Mean wall ms | Mean service ms |',
  );
  lines.push(
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const entry of laneRows) {
    lines.push(
      `| ${entry.conditionId} | ${entry.sampleCount} | ${entry.validSamples} | ${entry.invalidSamples} | ${entry.oraclePassCount} | ${entry.desiredOutcomeSatisfiedCount} | ${formatRate(entry.desiredOutcomeSatisfactionRate)} | ${entry.advisorCalls} | ${entry.escalationAttempts} | ${entry.totalTokens} | ${entry.advisorTokens} | ${entry.executorTokens} | ${formatNumber(entry.meanWallClockMs)} | ${formatNumber(entry.meanServiceLatencyMs)} |`,
    );
  }
  lines.push('');
  lines.push('All-sample lane diagnostics include invalidated samples.');
  lines.push('');
  lines.push(
    '| Condition | Raw oracle passes | Ceiling invalidations | All tokens | All advisor tokens | All cost | All advisor calls | All escalation attempts | Mean responses | Mean wall ms |',
  );
  lines.push(
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const entry of laneRows) {
    const all = entry.allSamples;
    lines.push(
      `| ${entry.conditionId} | ${all.rawOraclePasses} | ${all.ceilingInvalidations} | ${all.totalTokens} | ${all.advisorTokens} | ${formatNullableCurrency(all.totalCostUsd)} | ${all.advisorCalls} | ${all.escalationAttempts} | ${formatNumber(all.meanModelResponses)} | ${formatNumber(all.meanWallClockMs)} |`,
    );
  }
  lines.push('');
}

function appendInvalidationSummarySection(
  lines: string[],
  summary: RealBenchmarkCampaignSummary,
): void {
  const conditionEntries = Object.entries(
    summary.invalidationSummary.byCondition,
  );
  const cellEntries = Object.entries(summary.invalidationSummary.byCell);
  if (conditionEntries.length === 0 && cellEntries.length === 0) {
    return;
  }

  lines.push('### Invalidation summary');
  lines.push('');
  lines.push(
    '`model_call_ceiling_exceeded` is the benchmark response-count ceiling, not provider quota; it counts all model responses in the sample.',
  );
  lines.push('');
  if (conditionEntries.length > 0) {
    lines.push('| Condition | Reasons |');
    lines.push('| --- | --- |');
    for (const [conditionId, reasons] of conditionEntries) {
      lines.push(`| ${conditionId} | ${formatReasonEntries(reasons)} |`);
    }
    lines.push('');
  }

  const ceilingCells = cellEntries
    .map(([cell, reasons]) => ({
      cell,
      count: reasons['model_call_ceiling_exceeded'] ?? 0,
    }))
    .filter((entry) => entry.count > 0);
  if (ceilingCells.length > 0) {
    lines.push('| Cell | Ceiling invalidations |');
    lines.push('| --- | ---: |');
    for (const entry of ceilingCells) {
      lines.push(`| ${entry.cell} | ${entry.count} |`);
    }
    lines.push('');
  }
}

function appendFDiagnosticCeilingNote(
  lines: string[],
  summary: RealBenchmarkCampaignSummary,
): void {
  const fCeilings = new Set<number>();
  const nonFCeilings = new Set<number>();
  for (const run of summary.runDiagnostics) {
    const ceiling = run.responseCeiling?.maxModelResponsesPerSample;
    if (ceiling === undefined) {
      continue;
    }
    if (run.conditionId === 'F') {
      fCeilings.add(ceiling);
    } else {
      nonFCeilings.add(ceiling);
    }
  }
  if (fCeilings.size !== 1) {
    return;
  }
  const [fCeiling] = [...fCeilings];
  const nonFCeiling = nonFCeilings.size === 1 ? [...nonFCeilings][0] : null;
  if ((nonFCeiling === null && fCeiling === 6) || fCeiling === nonFCeiling) {
    return;
  }
  const aeCeilingText =
    nonFCeiling === null
      ? 'A/E use the global/default ceiling'
      : `A/E observed ceiling = ${nonFCeiling}`;
  lines.push(
    `- F diagnostic ceiling override active: F max responses = ${fCeiling}; ${aeCeilingText}.`,
  );
  lines.push('');
}

export function renderRealBenchmarkCampaignReport(
  summary: RealBenchmarkCampaignSummary,
): string {
  const lines: string[] = [];

  lines.push('# Pollux Real-Model Benchmark Campaign Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Campaign: ${summary.manifest.campaignId}`);
  lines.push(`Mode: ${summary.manifest.mode}`);
  lines.push(`Venue: ${summary.manifest.runVenue}`);
  lines.push(`Auth isolation: ${summary.manifest.authIsolationMode}`);
  lines.push(
    `Canonical surface: ${summary.manifest.canonicalSurface.replaceAll('_', ' ')}`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Overall status');
  lines.push('');
  lines.push(`- Samples collected: ${summary.sampleCount}`);
  lines.push(`- Valid samples: ${summary.validSampleCount}`);
  lines.push(`- Invalid samples: ${summary.invalidSampleCount}`);
  lines.push(`- Corpus SHA: \`${summary.corpusSha}\``);
  if (summary.buildFreshness) {
    lines.push(`- Git HEAD: \`${summary.buildFreshness.gitHead}\``);
    lines.push(
      `- Build freshness: dirty=${summary.buildFreshness.repoDirty ? 'yes' : 'no'}, sourceMatchesHead=${summary.buildFreshness.sourceCommitsMatchHead ? 'yes' : 'no'}, distMatchesSource=${summary.buildFreshness.distCommitsMatchSource ? 'yes' : 'no'}`,
    );
  }
  lines.push('');
  lines.push('## 2) Condition summaries');
  lines.push('');
  lines.push(
    'Condition summary fields are valid-only unless shown under All-sample diagnostics.',
  );
  lines.push('');
  appendFDiagnosticCeilingNote(lines, summary);
  lines.push(
    '| Condition | Samples | Valid | Invalid | Accuracy | Advisor calls | Escalation attempts | Total tokens | Advisor tokens | Executor tokens | Estimated cost | Mean wall ms | Mean service ms |',
  );
  lines.push(
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const condition of summary.conditionSummaries) {
    lines.push(
      `| ${condition.conditionId} | ${condition.sampleCount} | ${condition.validSamples} | ${condition.invalidSamples} | ${(condition.accuracy * 100).toFixed(1)}% | ${condition.advisorCalls} | ${condition.escalationAttempts} | ${condition.totalTokens} | ${condition.advisorTokens} | ${condition.executorTokens} | ${formatNullableCurrency(condition.totalCostUsd)} | ${formatNumber(condition.meanWallClockMs)} | ${formatNumber(condition.meanServiceLatencyMs)} |`,
    );
  }
  lines.push('');
  lines.push('### All-sample condition diagnostics');
  lines.push('');
  lines.push(
    '| Condition | Raw oracle passes | Ceiling invalidations | All tokens | All advisor tokens | All cost | All advisor calls | All escalation attempts | Mean responses | Mean wall ms |',
  );
  lines.push(
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const condition of summary.conditionSummaries) {
    const all = condition.allSamples;
    lines.push(
      `| ${condition.conditionId} | ${all.rawOraclePasses} | ${all.ceilingInvalidations} | ${all.totalTokens} | ${all.advisorTokens} | ${formatNullableCurrency(all.totalCostUsd)} | ${all.advisorCalls} | ${all.escalationAttempts} | ${formatNumber(all.meanModelResponses)} | ${formatNumber(all.meanWallClockMs)} |`,
    );
  }
  lines.push('');
  appendInvalidationSummarySection(lines, summary);
  appendLaneSection(lines, summary, 'core', '## 3) Core lane');
  appendLaneSection(lines, summary, 'stress', '## 4) Stress lane');
  if (Object.keys(summary.stressSummary.invalidationReasonCounts).length > 0) {
    lines.push('| Stress invalidation reason | Count |');
    lines.push('| --- | ---: |');
    for (const [reason, count] of Object.entries(
      summary.stressSummary.invalidationReasonCounts,
    )) {
      lines.push(`| ${reason} | ${count} |`);
    }
    lines.push('');
  }
  appendLaneSection(lines, summary, 'canary', '## 5) Canary lane');
  lines.push('## 6) Canary reliability');
  lines.push('');
  lines.push(
    `- Success rate: ${formatWilsonInterval(summary.canaryReliabilitySummary.consultSuccessWilson95)}`,
  );
  lines.push(
    `- Expected-positive canaries: ${summary.canaryReliabilitySummary.expectedPositiveSampleCount} total, ${summary.canaryReliabilitySummary.validExpectedPositiveSampleCount} valid`,
  );
  lines.push(
    `- Outcomes: consulted=${summary.canaryReliabilitySummary.consultedCount}, fail_open=${summary.canaryReliabilitySummary.failOpenCount}, parse_error=${summary.canaryReliabilitySummary.parseErrorCount}, false_negative=${summary.canaryReliabilitySummary.falseNegativeCount}, budget_exhausted=${summary.canaryReliabilitySummary.budgetExhaustedCount}`,
  );
  lines.push(
    `- Recovery paths: primary_success=${summary.canaryReliabilitySummary.attemptPathCounts.primarySuccess}, repair_retry_success=${summary.canaryReliabilitySummary.attemptPathCounts.repairRetrySuccess}, fallback_success=${summary.canaryReliabilitySummary.attemptPathCounts.fallbackSuccess}, final_fail_open=${summary.canaryReliabilitySummary.attemptPathCounts.finalFailOpen}`,
  );
  if (
    Object.keys(summary.canaryReliabilitySummary.failureKindCounts).length > 0
  ) {
    lines.push('');
    lines.push('| Failure kind | Count |');
    lines.push('| --- | ---: |');
    for (const [failureKind, count] of Object.entries(
      summary.canaryReliabilitySummary.failureKindCounts,
    )) {
      lines.push(`| ${failureKind} | ${count} |`);
    }
  }
  lines.push('');
  if (summary.repeatSummaries.length > 0) {
    lines.push('## 7) Repeat summaries');
    lines.push('');
    lines.push(
      '| Repeat | Samples | Valid | Invalid | Canary consult success | Escalation precision | Escalation recall | Summary | Report |',
    );
    lines.push('| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | --- |');
    for (const repeat of summary.repeatSummaries) {
      lines.push(
        `| ${repeat.sampleIndex} | ${repeat.sampleCount} | ${repeat.validSampleCount} | ${repeat.invalidSampleCount} | ${formatWilsonInterval(repeat.canaryConsultSummary.consultSuccessWilson95)} | ${formatRate(repeat.escalation.precision)} | ${formatRate(repeat.escalation.recall)} | ${repeat.summaryPath} | ${repeat.reportPath} |`,
      );
    }
    lines.push('');
  }
  if (summary.cellAggregateSummaries.length > 0) {
    lines.push('## 8) Cell aggregates');
    lines.push('');
    lines.push(
      '| Cell | Lane | Repeats | Valid | Invalid | Desired outcome | Consult success | Fail-open | Parse error | Wall ms (mean/median/stddev) | Total tokens (mean/median/stddev) | Advisor tokens (mean/median/stddev) | All raw oracle | All ceiling invalid | All tokens | All advisor tokens | All mean responses |',
    );
    lines.push(
      '| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
    );
    for (const cell of summary.cellAggregateSummaries) {
      lines.push(
        `| ${cell.conditionId}/${cell.taskId} | ${cell.lane} | ${cell.repeatCount} | ${cell.validSampleCount} | ${cell.invalidSampleCount} | ${formatWilsonInterval(cell.desiredOutcomeWilson95)} | ${formatWilsonInterval(cell.consultSuccessWilson95)} | ${cell.failOpenCount} | ${cell.parseErrorCount} | ${formatNumber(cell.wallClockMs.mean)}/${formatNumber(cell.wallClockMs.median)}/${formatNumber(cell.wallClockMs.stddev)} | ${formatNumber(cell.totalTokens.mean)}/${formatNumber(cell.totalTokens.median)}/${formatNumber(cell.totalTokens.stddev)} | ${formatNumber(cell.advisorTokens.mean)}/${formatNumber(cell.advisorTokens.median)}/${formatNumber(cell.advisorTokens.stddev)} | ${cell.allSamples.rawOraclePasses} | ${cell.allSamples.ceilingInvalidations} | ${cell.allSamples.totalTokens} | ${cell.allSamples.advisorTokens} | ${formatNumber(cell.allSamples.meanModelResponses)} |`,
      );
    }
    lines.push('');
  }
  lines.push('## 9) Escalation confusion matrix');
  lines.push('');
  lines.push(
    `- Included samples: ${summary.escalation.includedSampleCount} (excluded fail_open=${summary.escalation.exclusionCounts.failOpen}, budget_exhausted=${summary.escalation.exclusionCounts.budgetExhausted})`,
  );
  lines.push(
    `- Confusion counts: TP=${summary.escalation.truePositive}, FP=${summary.escalation.falsePositive}, FN=${summary.escalation.falseNegative}, TN=${summary.escalation.trueNegative}`,
  );
  lines.push(
    `- Precision: ${formatRate(summary.escalation.precision)} (${summary.escalation.truePositive}/${summary.escalation.predictedPositive})`,
  );
  lines.push(
    `- Recall: ${formatRate(summary.escalation.recall)} (${summary.escalation.truePositive}/${summary.escalation.expectedPositive})`,
  );
  lines.push('');
  lines.push('## 10) Escalation timing split');
  lines.push('');
  lines.push('| Timing | Included | TP | FP | FN | TN | Precision | Recall |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const timing of summary.escalationTiming) {
    lines.push(
      `| ${timing.timing} | ${timing.includedSampleCount} | ${timing.truePositive} | ${timing.falsePositive} | ${timing.falseNegative} | ${timing.trueNegative} | ${formatRate(timing.precision)} | ${formatRate(timing.recall)} |`,
    );
  }
  lines.push('');
  lines.push('## 11) Per-sample diagnostics');
  lines.push('');
  if (summary.runDiagnostics.length === 0) {
    lines.push('- No run diagnostics were captured.');
  } else {
    lines.push(
      '| Condition | Lane | Task | Sample | Valid | Oracle | Responses | Ceiling | Over | Tokens | Advisor tokens | Cost | Advisor calls | Esc attempts | Signal class | M3 opportunity | First advisor at | Before/after advisor | Actual consult | Desired outcome | Desired reason | Expected escalation | Predicted escalation | Consult outcome | Advisor failure | Confusion | Timing | Reasons | Invalidation | Tool errors | Status tags | Malformed/near-miss tags |',
    );
    lines.push(
      '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |',
    );
    for (const run of summary.runDiagnostics) {
      const ceiling = run.responseCeiling;
      lines.push(
        `| ${run.conditionId} | ${run.benchmarkLane} | ${run.taskId} | ${run.sampleId} | ${run.valid ? 'yes' : 'no'} | ${run.oraclePass ? 'pass' : 'fail'} | ${run.modelResponseCount} | ${ceiling?.maxModelResponsesPerSample ?? 'n/a'} | ${ceiling?.overflowBy ?? 'n/a'} | ${run.totalTokens} | ${run.advisorTokens} | ${formatNullableCurrency(run.totalCostUsd)} | ${run.advisorCalls} | ${run.escalationAttempts} | ${run.signalClass ?? 'n/a'} | ${formatBoolean(run.m3Opportunity)} | ${formatNullableNumber(run.firstAdvisorCallModelResponseOrdinal)} | ${formatAdvisorSplit(run.executorResponsesBeforeFirstAdvisor, run.executorResponsesAfterFirstAdvisor)} | ${run.actualAdvisorConsultOutcome} | ${run.desiredOutcomeSatisfied ? 'yes' : 'no'} | ${run.desiredOutcomeReasonCode} | ${run.expectedEscalation ? 'yes' : 'no'} | ${run.predictedEscalation ? 'yes' : 'no'} | ${run.advisorConsultOutcome} | ${run.advisorFailureKind ?? 'none'} | ${run.confusionOutcome} | ${run.primaryTiming} | ${run.reasonCodes.length > 0 ? run.reasonCodes.join(', ') : 'none'} | ${run.invalidationReason ?? 'none'} | ${run.toolErrorCount} | ${run.stdoutStatusTagCount} | ${run.malformedStatusTagCount}/${run.nearMissStatusTagCount} |`,
      );
    }
  }
  lines.push('');
  lines.push('## 12) Reason-code distribution');
  lines.push('');
  const reasonEntries = Object.entries(summary.reasonCodeCounts);
  if (reasonEntries.length === 0) {
    lines.push('- No reason-code telemetry events were captured.');
  } else {
    lines.push('| Reason code | Count |');
    lines.push('| --- | ---: |');
    for (const [reasonCode, count] of reasonEntries) {
      lines.push(`| ${reasonCode} | ${count} |`);
    }
  }
  lines.push('');
  lines.push('## 13) Publishability verdict');
  lines.push('');
  if (summary.publishabilityBlockers.length === 0) {
    lines.push(
      'This campaign has no tracked publishability blockers at the artifact layer. Publication still depends on satisfying the broader methodology and release process.',
    );
  } else {
    lines.push(
      'This campaign is not publishable yet. The blockers below must be cleared before any real-model benchmark claim is treated as repo-grade evidence.',
    );
    lines.push('');
    for (const blocker of summary.publishabilityBlockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return lines.join('\n');
}

function buildM3ConditionTaskStats(
  taskId: string,
  conditionId: RealBenchmarkConditionId,
  runs: RealBenchmarkRunRecord[],
): RealBenchmarkM3ConditionTaskStats {
  const taskRuns = runs.filter(
    (run) => run.taskId === taskId && run.conditionId === conditionId,
  );
  const validRuns = taskRuns.filter((run) => !run.invalidated);
  const passCount = validRuns.filter((run) => run.oraclePass).length;

  return {
    conditionId,
    sampleCount: taskRuns.length,
    validSamples: validRuns.length,
    invalidSamples: taskRuns.length - validRuns.length,
    passCount,
    passRate: divideOrNull(passCount, validRuns.length),
    invalidRate:
      divideOrNull(taskRuns.length - validRuns.length, taskRuns.length) ?? 0,
    totalCostUsd: sumNullable(validRuns.map((run) => run.costUsd.total)),
    meanWallClockMs: mean(validRuns.map((run) => run.wallClockMs)),
    totalTokens: validRuns.reduce((sum, run) => sum + run.tokens.total, 0),
  };
}

function getDifficultyRank(difficulty: string): number {
  if (difficulty === 'complex') {
    return 3;
  }
  if (difficulty === 'moderate') {
    return 2;
  }
  return 1;
}

function buildM3CalibrationTaskSummary(params: {
  taskId: string;
  runs: RealBenchmarkRunRecord[];
  thresholds: RealBenchmarkM3CalibrationThresholds;
}): RealBenchmarkM3TaskCalibrationSummary {
  const task = getRealBenchmarkSeedTask(params.taskId);
  const flash = buildM3ConditionTaskStats(params.taskId, 'A', params.runs);
  const pro = buildM3ConditionTaskStats(params.taskId, 'E', params.runs);
  const maxInvalidRate = Math.max(flash.invalidRate, pro.invalidRate);
  const flashPassRate = flash.passRate ?? 0;
  const proPassRate = pro.passRate ?? 0;

  if (maxInvalidRate > params.thresholds.maxInvalidRateForStableTask) {
    return {
      taskId: params.taskId,
      domain: task.domain,
      difficulty: task.difficulty,
      label: 'flaky',
      rationale: `Invalid rate ${formatRate(maxInvalidRate)} exceeds stable-task limit ${formatRate(params.thresholds.maxInvalidRateForStableTask)}.`,
      flash,
      pro,
    };
  }

  if (flashPassRate > params.thresholds.maxFlashPassRateForDiscriminative) {
    return {
      taskId: params.taskId,
      domain: task.domain,
      difficulty: task.difficulty,
      label: 'easy',
      rationale: `A pass rate ${formatRate(flashPassRate)} exceeds discriminative ceiling ${formatRate(params.thresholds.maxFlashPassRateForDiscriminative)}.`,
      flash,
      pro,
    };
  }

  if (proPassRate < params.thresholds.minProPassRateForDiscriminative) {
    return {
      taskId: params.taskId,
      domain: task.domain,
      difficulty: task.difficulty,
      label: 'impossible_or_noisy',
      rationale: `E pass rate ${formatRate(proPassRate)} is below solvability floor ${formatRate(params.thresholds.minProPassRateForDiscriminative)}.`,
      flash,
      pro,
    };
  }

  return {
    taskId: params.taskId,
    domain: task.domain,
    difficulty: task.difficulty,
    label: 'discriminative',
    rationale: `A pass rate ${formatRate(flashPassRate)} <= ${formatRate(params.thresholds.maxFlashPassRateForDiscriminative)} and E pass rate ${formatRate(proPassRate)} >= ${formatRate(params.thresholds.minProPassRateForDiscriminative)}; invalid rate ${formatRate(maxInvalidRate)} <= ${formatRate(params.thresholds.maxInvalidRateForStableTask)}.`,
    flash,
    pro,
  };
}

function selectM3DiscriminativeTasks(
  taskSummaries: RealBenchmarkM3TaskCalibrationSummary[],
  maxSelectedTaskCount: number,
): string[] {
  const candidates = taskSummaries
    .filter((summary) => summary.label === 'discriminative')
    .sort((left, right) => {
      const leftInvalid = Math.max(
        left.flash.invalidRate,
        left.pro.invalidRate,
      );
      const rightInvalid = Math.max(
        right.flash.invalidRate,
        right.pro.invalidRate,
      );
      if (leftInvalid !== rightInvalid) {
        return leftInvalid - rightInvalid;
      }
      const leftGap = (left.pro.passRate ?? 0) - (left.flash.passRate ?? 0);
      const rightGap = (right.pro.passRate ?? 0) - (right.flash.passRate ?? 0);
      if (leftGap !== rightGap) {
        return rightGap - leftGap;
      }
      const difficultyDelta =
        getDifficultyRank(right.difficulty) -
        getDifficultyRank(left.difficulty);
      if (difficultyDelta !== 0) {
        return difficultyDelta;
      }
      return left.taskId.localeCompare(right.taskId);
    });
  const selected: RealBenchmarkM3TaskCalibrationSummary[] = [];
  const usedDomains = new Set<string>();

  for (const candidate of candidates) {
    if (selected.length >= maxSelectedTaskCount) {
      break;
    }
    if (!usedDomains.has(candidate.domain)) {
      selected.push(candidate);
      usedDomains.add(candidate.domain);
    }
  }

  for (const candidate of candidates) {
    if (selected.length >= maxSelectedTaskCount) {
      break;
    }
    if (!selected.includes(candidate)) {
      selected.push(candidate);
    }
  }

  return selected.map((summary) => summary.taskId);
}

export function buildRealBenchmarkM3CalibrationSummary(params: {
  calibrationBatchId: string;
  corpusSha: string;
  taskIds: string[];
  runs: RealBenchmarkRunRecord[];
  thresholds: RealBenchmarkM3CalibrationThresholds;
}): RealBenchmarkM3CalibrationSummary {
  const taskSummaries = params.taskIds.map((taskId) =>
    buildM3CalibrationTaskSummary({
      taskId,
      runs: params.runs,
      thresholds: params.thresholds,
    }),
  );
  const selectedTaskIds = selectM3DiscriminativeTasks(
    taskSummaries,
    params.thresholds.maxSelectedTaskCount,
  );
  const rejectedTaskIds = params.taskIds.filter(
    (taskId) => !selectedTaskIds.includes(taskId),
  );
  const labelCounts = {
    easy: 0,
    discriminative: 0,
    impossible_or_noisy: 0,
    flaky: 0,
  };
  for (const taskSummary of taskSummaries) {
    labelCounts[taskSummary.label] += 1;
  }

  const failedThresholds: string[] = [];
  if (selectedTaskIds.length < params.thresholds.minSelectedTaskCount) {
    failedThresholds.push(
      `selected tasks ${selectedTaskIds.length} < ${params.thresholds.minSelectedTaskCount}`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    calibrationBatchId: params.calibrationBatchId,
    corpusSha: params.corpusSha,
    thresholds: params.thresholds,
    candidateTaskCount: params.taskIds.length,
    selectedTaskCount: selectedTaskIds.length,
    labelCounts,
    taskSummaries,
    selectedTaskIds,
    rejectedTaskIds,
    pass: failedThresholds.length === 0,
    failedThresholds,
  };
}

export function buildRealBenchmarkM3SelectedTaskSet(
  summary: RealBenchmarkM3CalibrationSummary,
): RealBenchmarkM3SelectedTaskSet {
  return {
    generatedAt: summary.generatedAt,
    calibrationBatchId: summary.calibrationBatchId,
    corpusSha: summary.corpusSha,
    thresholds: summary.thresholds,
    selectedTaskIds: summary.selectedTaskIds,
    rejectedTaskIds: summary.rejectedTaskIds,
    taskSummaries: summary.taskSummaries,
  };
}

export function renderRealBenchmarkM3CalibrationReport(
  summary: RealBenchmarkM3CalibrationSummary,
): string {
  const lines: string[] = [];
  lines.push('# Pollux M3 Calibration Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Batch: ${summary.calibrationBatchId}`);
  lines.push(`Corpus SHA: \`${summary.corpusSha}\``);
  lines.push('');
  lines.push('## 1) Decision');
  lines.push('');
  lines.push(`- Pass: ${summary.pass ? 'yes' : 'no'}`);
  lines.push(`- Candidate tasks: ${summary.candidateTaskCount}`);
  lines.push(`- Selected tasks: ${summary.selectedTaskCount}`);
  lines.push(
    `- Labels: discriminative=${summary.labelCounts.discriminative}, easy=${summary.labelCounts.easy}, impossible_or_noisy=${summary.labelCounts.impossible_or_noisy}, flaky=${summary.labelCounts.flaky}`,
  );
  if (summary.failedThresholds.length > 0) {
    lines.push('');
    lines.push('Failed thresholds:');
    for (const failure of summary.failedThresholds) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push('');
  lines.push('## 2) Thresholds');
  lines.push('');
  lines.push(
    `- A pass-rate ceiling: ${formatRate(summary.thresholds.maxFlashPassRateForDiscriminative)}`,
  );
  lines.push(
    `- E pass-rate floor: ${formatRate(summary.thresholds.minProPassRateForDiscriminative)}`,
  );
  lines.push(
    `- Stable invalid-rate ceiling: ${formatRate(summary.thresholds.maxInvalidRateForStableTask)}`,
  );
  lines.push(
    `- Selected task target: ${summary.thresholds.minSelectedTaskCount}-${summary.thresholds.maxSelectedTaskCount}`,
  );
  lines.push('');
  lines.push('## 3) Task Calibration');
  lines.push('');
  lines.push(
    '| Task | Domain | Difficulty | A pass | E pass | Invalid max | Label | Rationale |',
  );
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- | --- |');
  for (const task of summary.taskSummaries) {
    lines.push(
      `| ${task.taskId} | ${task.domain} | ${task.difficulty} | ${formatRate(task.flash.passRate)} | ${formatRate(task.pro.passRate)} | ${formatRate(Math.max(task.flash.invalidRate, task.pro.invalidRate))} | ${task.label} | ${task.rationale} |`,
    );
  }
  lines.push('');
  lines.push('## 4) Selected Task Set');
  lines.push('');
  if (summary.selectedTaskIds.length === 0) {
    lines.push('- None');
  } else {
    for (const taskId of summary.selectedTaskIds) {
      lines.push(`- ${taskId}`);
    }
  }
  lines.push('');
  lines.push(
    'Calibration selects a frozen value subset. It is not final product-value evidence until the value suite runs A, E, and F on this selected set.',
  );
  return lines.join('\n');
}

function buildTemporaryFlashOnlyTaskSummary(params: {
  taskId: string;
  runs: RealBenchmarkRunRecord[];
  thresholds: RealBenchmarkM3CalibrationThresholds;
}): RealBenchmarkTemporaryFlashOnlyTaskSummary {
  const task = getRealBenchmarkSeedTask(params.taskId);
  const flash = buildM3ConditionTaskStats(params.taskId, 'A', params.runs);
  const flashRuns = params.runs.filter(
    (run) => run.taskId === params.taskId && run.conditionId === 'A',
  );
  const invalidFlashRuns = flashRuns.filter((run) => run.invalidated);
  const onlyCeilingInvalidations =
    invalidFlashRuns.length > 0 &&
    invalidFlashRuns.every(
      (run) => run.invalidationReason === 'model_call_ceiling_exceeded',
    );
  const observedOraclePassUnderCeilingPressure = flashRuns.some(
    (run) => run.oraclePass,
  );
  if (flash.invalidRate > params.thresholds.maxInvalidRateForStableTask) {
    if (onlyCeilingInvalidations && observedOraclePassUnderCeilingPressure) {
      return {
        taskId: params.taskId,
        domain: task.domain,
        difficulty: task.difficulty,
        group: 'temporary_ceiling_sensitive_candidate',
        rationale:
          'Temporary Flash-only triage: invalid samples were ceiling-only and Flash still produced at least one oracle-passing run. Carry this task forward for E confirmation instead of treating it as generic flake noise.',
        flash,
      };
    }

    return {
      taskId: params.taskId,
      domain: task.domain,
      difficulty: task.difficulty,
      group: 'temporary_flash_flaky',
      rationale: `Temporary Flash-only triage: invalid rate ${formatRate(flash.invalidRate)} exceeds stable-task limit ${formatRate(params.thresholds.maxInvalidRateForStableTask)}.`,
      flash,
    };
  }

  if (
    (flash.passRate ?? 0) > params.thresholds.maxFlashPassRateForDiscriminative
  ) {
    return {
      taskId: params.taskId,
      domain: task.domain,
      difficulty: task.difficulty,
      group: 'temporary_easy_for_flash',
      rationale: `Temporary Flash-only triage: A pass rate ${formatRate(flash.passRate)} exceeds easy-task ceiling ${formatRate(params.thresholds.maxFlashPassRateForDiscriminative)}.`,
      flash,
    };
  }

  return {
    taskId: params.taskId,
    domain: task.domain,
    difficulty: task.difficulty,
    group: 'temporary_hard_candidate',
    rationale:
      'Temporary Flash-only triage: Flash did not clear the easy-task ceiling and stayed under the invalid-rate cap. This is a provisional hard-task candidate until E can confirm solvability.',
    flash,
  };
}

function selectTemporaryFlashOnlyTasks(
  taskSummaries: RealBenchmarkTemporaryFlashOnlyTaskSummary[],
  maxSelectedTaskCount: number,
): string[] {
  return taskSummaries
    .filter(
      (summary) =>
        summary.group === 'temporary_hard_candidate' ||
        summary.group === 'temporary_ceiling_sensitive_candidate',
    )
    .sort((left, right) => {
      const leftGroupRank = left.group === 'temporary_hard_candidate' ? 0 : 1;
      const rightGroupRank = right.group === 'temporary_hard_candidate' ? 0 : 1;
      if (leftGroupRank !== rightGroupRank) {
        return leftGroupRank - rightGroupRank;
      }
      if (left.flash.invalidRate !== right.flash.invalidRate) {
        return left.flash.invalidRate - right.flash.invalidRate;
      }
      const leftPassRate = left.flash.passRate ?? 0;
      const rightPassRate = right.flash.passRate ?? 0;
      if (leftPassRate !== rightPassRate) {
        return leftPassRate - rightPassRate;
      }
      const difficultyDelta =
        getDifficultyRank(right.difficulty) -
        getDifficultyRank(left.difficulty);
      if (difficultyDelta !== 0) {
        return difficultyDelta;
      }
      return left.taskId.localeCompare(right.taskId);
    })
    .slice(0, maxSelectedTaskCount)
    .map((summary) => summary.taskId);
}

export function buildRealBenchmarkTemporaryFlashOnlySummary(params: {
  calibrationBatchId: string;
  corpusSha: string;
  taskIds: string[];
  runs: RealBenchmarkRunRecord[];
  thresholds: RealBenchmarkM3CalibrationThresholds;
}): RealBenchmarkTemporaryFlashOnlySummary {
  const taskSummaries = params.taskIds.map((taskId) =>
    buildTemporaryFlashOnlyTaskSummary({
      taskId,
      runs: params.runs,
      thresholds: params.thresholds,
    }),
  );
  const selectedTaskIds = selectTemporaryFlashOnlyTasks(
    taskSummaries,
    params.thresholds.maxSelectedTaskCount,
  );
  const rejectedTaskIds = params.taskIds.filter(
    (taskId) => !selectedTaskIds.includes(taskId),
  );
  const groupCounts = {
    temporary_easy_for_flash: 0,
    temporary_hard_candidate: 0,
    temporary_ceiling_sensitive_candidate: 0,
    temporary_flash_flaky: 0,
  };
  for (const taskSummary of taskSummaries) {
    groupCounts[taskSummary.group] += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    calibrationBatchId: params.calibrationBatchId,
    provisional: true,
    provisionalReason:
      'Temporary Flash-only triage while E is unavailable or quota-contaminated. Do not treat this as the final frozen M3 value subset.',
    corpusSha: params.corpusSha,
    thresholds: {
      maxFlashPassRateForDiscriminative:
        params.thresholds.maxFlashPassRateForDiscriminative,
      maxInvalidRateForStableTask:
        params.thresholds.maxInvalidRateForStableTask,
      maxSelectedTaskCount: params.thresholds.maxSelectedTaskCount,
    },
    candidateTaskCount: params.taskIds.length,
    selectedTaskCount: selectedTaskIds.length,
    groupCounts,
    taskSummaries,
    selectedTaskIds,
    rejectedTaskIds,
  };
}

export function buildRealBenchmarkTemporaryFlashOnlySelectedTaskSet(
  summary: RealBenchmarkTemporaryFlashOnlySummary,
): RealBenchmarkTemporaryFlashOnlySelectedTaskSet {
  return {
    generatedAt: summary.generatedAt,
    calibrationBatchId: summary.calibrationBatchId,
    provisional: true,
    provisionalReason: summary.provisionalReason,
    corpusSha: summary.corpusSha,
    thresholds: summary.thresholds,
    selectedTaskIds: summary.selectedTaskIds,
    rejectedTaskIds: summary.rejectedTaskIds,
    taskSummaries: summary.taskSummaries,
  };
}

export function renderRealBenchmarkTemporaryFlashOnlyReport(
  summary: RealBenchmarkTemporaryFlashOnlySummary,
): string {
  const lines: string[] = [];
  lines.push('# Pollux Temporary Flash-Only Triage Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Batch: ${summary.calibrationBatchId}`);
  lines.push(`Corpus SHA: \`${summary.corpusSha}\``);
  lines.push('');
  lines.push('## 1) Temporary Status');
  lines.push('');
  lines.push('- This is temporary triage output.');
  lines.push(`- Candidate tasks: ${summary.candidateTaskCount}`);
  lines.push(
    `- Temporary carry-forward candidates: ${summary.selectedTaskCount}`,
  );
  lines.push(
    `- Groups: hard_candidate=${summary.groupCounts.temporary_hard_candidate}, ceiling_sensitive_candidate=${summary.groupCounts.temporary_ceiling_sensitive_candidate}, easy_for_flash=${summary.groupCounts.temporary_easy_for_flash}, flash_flaky=${summary.groupCounts.temporary_flash_flaky}`,
  );
  lines.push(`- Provisional note: ${summary.provisionalReason}`);
  lines.push('');
  lines.push('## 2) Temporary Thresholds');
  lines.push('');
  lines.push(
    `- A pass-rate ceiling for easy tasks: ${formatRate(summary.thresholds.maxFlashPassRateForDiscriminative)}`,
  );
  lines.push(
    `- Stable invalid-rate ceiling: ${formatRate(summary.thresholds.maxInvalidRateForStableTask)}`,
  );
  lines.push(
    `- Maximum temporary carry-forward candidates: ${summary.thresholds.maxSelectedTaskCount}`,
  );
  lines.push('');
  lines.push('## 3) Temporary Flash-Only Task Groups');
  lines.push('');
  lines.push(
    '| Task | Domain | Difficulty | A pass | A invalid | Temporary group | Rationale |',
  );
  lines.push('| --- | --- | --- | ---: | ---: | --- | --- |');
  for (const task of summary.taskSummaries) {
    lines.push(
      `| ${task.taskId} | ${task.domain} | ${task.difficulty} | ${formatRate(task.flash.passRate)} | ${formatRate(task.flash.invalidRate)} | ${task.group} | ${task.rationale} |`,
    );
  }
  lines.push('');
  lines.push('## 4) Temporary Carry-Forward Set');
  lines.push('');
  if (summary.selectedTaskIds.length === 0) {
    lines.push('- None');
  } else {
    for (const taskId of summary.selectedTaskIds) {
      lines.push(`- ${taskId}`);
    }
  }
  lines.push('');
  lines.push(
    'Temporary Flash-only triage is for narrowing the candidate pool while E is unavailable. Re-run full calibration with A and E before freezing the real M3 value subset.',
  );
  return lines.join('\n');
}

function buildM3ConditionValueSummary(
  conditionId: RealBenchmarkConditionId,
  runs: RealBenchmarkRunRecord[],
): RealBenchmarkM3ConditionValueSummary {
  const conditionRuns = runs.filter((run) => run.conditionId === conditionId);
  const validRuns = conditionRuns.filter((run) => !run.invalidated);
  const passCount = validRuns.filter((run) => run.oraclePass).length;
  const totalCostUsd = sumNullable(validRuns.map((run) => run.costUsd.total));
  const serviceLatencies = validRuns.flatMap((run) => run.serviceLatencyMs);
  const totalTokens = validRuns.reduce((sum, run) => sum + run.tokens.total, 0);
  const advisorTokens = validRuns.reduce(
    (sum, run) => sum + run.tokens.advisor,
    0,
  );

  return {
    conditionId,
    sampleCount: conditionRuns.length,
    validSamples: validRuns.length,
    invalidSamples: conditionRuns.length - validRuns.length,
    passCount,
    passRate: divideOrNull(passCount, validRuns.length),
    passRateWilson95: buildWilsonInterval(passCount, validRuns.length),
    totalCostUsd,
    meanCostPerTaskUsd:
      totalCostUsd === null
        ? null
        : divideOrNull(totalCostUsd, validRuns.length),
    costPerSuccessUsd:
      totalCostUsd === null ? null : divideOrNull(totalCostUsd, passCount),
    meanWallClockMs: mean(validRuns.map((run) => run.wallClockMs)),
    meanServiceLatencyMs: mean(serviceLatencies),
    totalTokens,
    executorTokens: validRuns.reduce(
      (sum, run) => sum + run.tokens.executor,
      0,
    ),
    advisorTokens,
    advisorCallRate: divideOrNull(
      validRuns.reduce((sum, run) => sum + run.observedAdvisorCalls, 0),
      validRuns.length,
    ),
    advisorTokenShare: divideOrNull(advisorTokens, totalTokens),
    invalidRate:
      divideOrNull(
        conditionRuns.length - validRuns.length,
        conditionRuns.length,
      ) ?? 0,
    allSamples: buildAllSampleUsageSummary(conditionRuns),
  };
}

function buildM3TaskValueSummaries(
  selectedTaskIds: string[],
  runs: RealBenchmarkRunRecord[],
): RealBenchmarkM3TaskValueSummary[] {
  return selectedTaskIds.map((taskId) => {
    const passByCondition: Partial<
      Record<RealBenchmarkConditionId, number | null>
    > = {};
    const validByCondition: Partial<Record<RealBenchmarkConditionId, number>> =
      {};
    const invalidByCondition: Partial<
      Record<RealBenchmarkConditionId, number>
    > = {};
    for (const conditionId of ['A', 'E', 'F'] as const) {
      const conditionRuns = runs.filter(
        (run) => run.taskId === taskId && run.conditionId === conditionId,
      );
      const validRuns = conditionRuns.filter((run) => !run.invalidated);
      validByCondition[conditionId] = validRuns.length;
      invalidByCondition[conditionId] = conditionRuns.length - validRuns.length;
      passByCondition[conditionId] = divideOrNull(
        validRuns.filter((run) => run.oraclePass).length,
        validRuns.length,
      );
    }
    return {
      taskId,
      passByCondition,
      validByCondition,
      invalidByCondition,
    };
  });
}

function findM3ConditionValueSummary(
  summaries: RealBenchmarkM3ConditionValueSummary[],
  conditionId: RealBenchmarkConditionId,
): RealBenchmarkM3ConditionValueSummary | undefined {
  return summaries.find((summary) => summary.conditionId === conditionId);
}

export function buildRealBenchmarkM3ValueSummary(params: {
  valueBatchId: string;
  selectedTaskSetPath: string;
  selectedTaskSet: RealBenchmarkM3SelectedTaskSet;
  corpusSha: string;
  runs: RealBenchmarkRunRecord[];
  thresholds: RealBenchmarkM3ValueThresholds;
}): RealBenchmarkM3ValueSummary {
  const conditionValueSummaries = (['A', 'E', 'F'] as const).map(
    (conditionId) => buildM3ConditionValueSummary(conditionId, params.runs),
  );
  const taskValueSummaries = buildM3TaskValueSummaries(
    params.selectedTaskSet.selectedTaskIds,
    params.runs,
  );
  const a = findM3ConditionValueSummary(conditionValueSummaries, 'A');
  const e = findM3ConditionValueSummary(conditionValueSummaries, 'E');
  const f = findM3ConditionValueSummary(conditionValueSummaries, 'F');
  const absoluteFOverA =
    f?.passRate !== null &&
    f?.passRate !== undefined &&
    a?.passRate !== null &&
    a?.passRate !== undefined
      ? f.passRate - a.passRate
      : null;
  const eMinusA =
    e?.passRate !== null &&
    e?.passRate !== undefined &&
    a?.passRate !== null &&
    a?.passRate !== undefined
      ? e.passRate - a.passRate
      : null;
  const gapClosedByF =
    absoluteFOverA !== null && eMinusA !== null && eMinusA > 0
      ? absoluteFOverA / eMinusA
      : null;
  const fCostPerTaskVsE =
    f?.meanCostPerTaskUsd !== null &&
    f?.meanCostPerTaskUsd !== undefined &&
    e?.meanCostPerTaskUsd !== null &&
    e?.meanCostPerTaskUsd !== undefined &&
    e.meanCostPerTaskUsd > 0
      ? f.meanCostPerTaskUsd / e.meanCostPerTaskUsd
      : null;
  const fCostPerSuccessVsE =
    f?.costPerSuccessUsd !== null &&
    f?.costPerSuccessUsd !== undefined &&
    e?.costPerSuccessUsd !== null &&
    e?.costPerSuccessUsd !== undefined &&
    e.costPerSuccessUsd > 0
      ? f.costPerSuccessUsd / e.costPerSuccessUsd
      : null;

  const failedThresholds: string[] = [];
  if (
    params.selectedTaskSet.selectedTaskIds.length <
    params.thresholds.minSelectedTaskCount
  ) {
    failedThresholds.push(
      `selected tasks ${params.selectedTaskSet.selectedTaskIds.length} < ${params.thresholds.minSelectedTaskCount}`,
    );
  }
  if (
    absoluteFOverA === null ||
    absoluteFOverA < params.thresholds.minFOverAAbsolute
  ) {
    failedThresholds.push(
      `F over A absolute uplift ${absoluteFOverA === null ? 'n/a' : absoluteFOverA.toFixed(3)} < ${params.thresholds.minFOverAAbsolute.toFixed(3)}`,
    );
  }
  if (
    fCostPerTaskVsE === null ||
    fCostPerTaskVsE > params.thresholds.maxFCostPerTaskVsE
  ) {
    failedThresholds.push(
      `F/E cost per task ${fCostPerTaskVsE === null ? 'n/a' : fCostPerTaskVsE.toFixed(3)} > ${params.thresholds.maxFCostPerTaskVsE.toFixed(3)}`,
    );
  }
  if (
    fCostPerSuccessVsE === null ||
    fCostPerSuccessVsE > params.thresholds.maxFCostPerSuccessVsE
  ) {
    failedThresholds.push(
      `F/E cost per success ${fCostPerSuccessVsE === null ? 'n/a' : fCostPerSuccessVsE.toFixed(3)} > ${params.thresholds.maxFCostPerSuccessVsE.toFixed(3)}`,
    );
  }
  for (const condition of conditionValueSummaries) {
    if (condition.invalidRate > params.thresholds.maxInvalidRate) {
      failedThresholds.push(
        `${condition.conditionId} invalid rate ${condition.invalidRate.toFixed(3)} > ${params.thresholds.maxInvalidRate.toFixed(3)}`,
      );
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    valueBatchId: params.valueBatchId,
    selectedTaskSetPath: params.selectedTaskSetPath,
    corpusSha: params.corpusSha,
    thresholds: params.thresholds,
    selectedTaskIds: params.selectedTaskSet.selectedTaskIds,
    conditionValueSummaries,
    taskValueSummaries,
    uplift: {
      absoluteFOverA,
      gapClosedByF,
    },
    economics: {
      fCostPerTaskVsE,
      fCostPerSuccessVsE,
      fCheaperThanE:
        fCostPerTaskVsE !== null &&
        fCostPerSuccessVsE !== null &&
        fCostPerTaskVsE <= params.thresholds.maxFCostPerTaskVsE &&
        fCostPerSuccessVsE <= params.thresholds.maxFCostPerSuccessVsE,
    },
    advisorTokenShareF: f?.advisorTokenShare ?? null,
    pass: failedThresholds.length === 0,
    failedThresholds,
  };
}

export function renderRealBenchmarkM3ValueReport(
  summary: RealBenchmarkM3ValueSummary,
): string {
  const lines: string[] = [];
  lines.push('# Pollux M3 Value Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Value batch: ${summary.valueBatchId}`);
  lines.push(`Selected task set: \`${summary.selectedTaskSetPath}\``);
  lines.push(`Corpus SHA: \`${summary.corpusSha}\``);
  lines.push('');
  lines.push('## 1) Product-Value Decision');
  lines.push('');
  lines.push(`- Pass: ${summary.pass ? 'yes' : 'no'}`);
  lines.push(`- Selected tasks: ${summary.selectedTaskIds.length}`);
  lines.push(`- F over A: ${formatRate(summary.uplift.absoluteFOverA)}`);
  lines.push(`- Gap closed by F: ${formatRate(summary.uplift.gapClosedByF)}`);
  lines.push(
    `- F/E cost per task: ${summary.economics.fCostPerTaskVsE === null ? 'n/a' : summary.economics.fCostPerTaskVsE.toFixed(3)}`,
  );
  lines.push(
    `- F/E cost per success: ${summary.economics.fCostPerSuccessVsE === null ? 'n/a' : summary.economics.fCostPerSuccessVsE.toFixed(3)}`,
  );
  lines.push(
    `- F advisor token share: ${formatRate(summary.advisorTokenShareF)}`,
  );
  if (summary.failedThresholds.length > 0) {
    lines.push('');
    lines.push('Failed thresholds:');
    for (const failure of summary.failedThresholds) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push('');
  lines.push('## 2) Condition Economics');
  lines.push('');
  lines.push(
    'Condition economics are valid-only; All-sample columns include invalidated runs for diagnostics.',
  );
  lines.push('');
  lines.push(
    '| Condition | Valid | Invalid | Pass rate | Cost/task | Cost/success | Tokens | Advisor tokens | Advisor calls/run | Wall ms | Service ms | All raw oracle | All ceiling invalid | All tokens | All advisor tokens | All cost | All mean responses |',
  );
  lines.push(
    '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const condition of summary.conditionValueSummaries) {
    const all = condition.allSamples;
    lines.push(
      `| ${condition.conditionId} | ${condition.validSamples} | ${condition.invalidSamples} | ${formatWilsonInterval(condition.passRateWilson95)} | ${formatNullableCurrency(condition.meanCostPerTaskUsd)} | ${formatNullableCurrency(condition.costPerSuccessUsd)} | ${condition.totalTokens} | ${condition.advisorTokens} | ${condition.advisorCallRate === null ? 'n/a' : condition.advisorCallRate.toFixed(2)} | ${formatNumber(condition.meanWallClockMs)} | ${formatNumber(condition.meanServiceLatencyMs)} | ${all.rawOraclePasses} | ${all.ceilingInvalidations} | ${all.totalTokens} | ${all.advisorTokens} | ${formatNullableCurrency(all.totalCostUsd)} | ${formatNumber(all.meanModelResponses)} |`,
    );
  }
  lines.push('');
  lines.push('## 3) Per-Task Outcomes');
  lines.push('');
  lines.push(
    '| Task | A pass | E pass | F pass | A invalid | E invalid | F invalid |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const task of summary.taskValueSummaries) {
    lines.push(
      `| ${task.taskId} | ${formatRate(task.passByCondition.A ?? null)} | ${formatRate(task.passByCondition.E ?? null)} | ${formatRate(task.passByCondition.F ?? null)} | ${task.invalidByCondition.A ?? 0} | ${task.invalidByCondition.E ?? 0} | ${task.invalidByCondition.F ?? 0} |`,
    );
  }
  lines.push('');
  lines.push('## 4) Interpretation');
  lines.push('');
  lines.push('- A is the cheap weak-executor baseline.');
  lines.push('- E is the strong-model-only ceiling and cost reference.');
  lines.push(
    '- F is the Pollux product-value condition: weak executor plus stronger advisor.',
  );
  lines.push(
    '- This report is M3 pilot evidence unless publishability requirements are separately satisfied.',
  );
  return lines.join('\n');
}

export function loadRealBenchmarkRuns(
  artifactRoot: string,
): RealBenchmarkRunRecord[] {
  const rawRoot = path.join(artifactRoot, 'raw');
  if (!fs.existsSync(rawRoot)) {
    return [];
  }

  const runs: RealBenchmarkRunRecord[] = [];
  const conditionDirs = fs.readdirSync(rawRoot);
  for (const conditionDir of conditionDirs) {
    const taskRoot = path.join(rawRoot, conditionDir);
    if (!fs.statSync(taskRoot).isDirectory()) {
      continue;
    }
    const taskDirs = fs.readdirSync(taskRoot);
    for (const taskDir of taskDirs) {
      const runRoot = path.join(taskRoot, taskDir);
      if (!fs.statSync(runRoot).isDirectory()) {
        continue;
      }
      const files = fs
        .readdirSync(runRoot)
        .filter((entry) => entry.endsWith('.json'))
        .sort();
      for (const fileName of files) {
        const record = JSON.parse(
          fs.readFileSync(path.join(runRoot, fileName), 'utf8'),
        ) as RealBenchmarkRunRecord;
        runs.push(record);
      }
    }
  }

  return runs;
}
