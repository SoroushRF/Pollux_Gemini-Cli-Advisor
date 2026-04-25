/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildRealBenchmarkM3CalibrationSummary,
  buildRealBenchmarkM3SelectedTaskSet,
  renderRealBenchmarkM3CalibrationReport,
} from './pollux-real-report.js';
import type {
  RealBenchmarkConditionId,
  RealBenchmarkM3CalibrationThresholds,
  RealBenchmarkRunRecord,
} from './pollux-real-types.js';

const thresholds: RealBenchmarkM3CalibrationThresholds = {
  maxFlashPassRateForDiscriminative: 0.5,
  minProPassRateForDiscriminative: 0.67,
  maxInvalidRateForStableTask: 0.2,
  minSelectedTaskCount: 1,
  maxSelectedTaskCount: 15,
};

function buildRun(params: {
  taskId: string;
  conditionId: RealBenchmarkConditionId;
  sampleIndex: number;
  oraclePass: boolean;
  invalidated?: boolean;
}): RealBenchmarkRunRecord {
  return {
    campaignId: 'm3-calibration-unit',
    sampleId: `${params.conditionId}-${params.taskId}-${params.sampleIndex}`,
    taskId: params.taskId,
    conditionId: params.conditionId,
    sampleIndex: params.sampleIndex,
    benchmarkLane: 'core',
    gitSha: 'sha',
    lockfileHash: 'lock',
    corpusSha: 'corpus',
    promptId: 'prompt',
    responseIds: ['response'],
    wallClockMs: 100,
    serviceLatencyMs: [80],
    tokens: { total: 100, advisor: 0, executor: 100 },
    costUsd: {
      total: 0.01,
      advisor: 0,
      executor: 0.01,
      pricingSnapshotId: 'pricing',
    },
    observedAdvisorCalls: 0,
    observedEscalationAttempts: 0,
    polluxEscalationTelemetryCount: 0,
    stdoutStatusTagCount: 0,
    malformedStatusTagCount: 0,
    nearMissStatusTagCount: 0,
    stderrWorkspacePathViolationCount: 0,
    toolErrorCount: 0,
    advisorAttempts: [],
    escalationEvents: [],
    escalationTiming: [],
    reasonCodes: [],
    excludedFromConfusion: null,
    fairnessPins: {
      routerPinned: true,
      loopDetectionDisabled: true,
      availabilityReset: true,
      dynamicConfigFixed: true,
      sessionIsolated: true,
      sandboxIsolated: true,
    },
    oraclePass: params.oraclePass,
    invalidated: params.invalidated ?? false,
    invalidationReason: params.invalidated ? 'run_timeout' : undefined,
    structuredErrorEvidence: null,
    exitCode: params.invalidated ? null : 0,
    timedOut: params.invalidated ?? false,
    modelResponseCount: 1,
    expectedEscalation: false,
    predictedEscalation: false,
    confusionOutcome: params.invalidated ? 'excluded' : 'true_negative',
    desiredOutcomeSatisfied: !params.invalidated && params.oraclePass,
    desiredOutcomeReasonCode: params.invalidated
      ? 'core.invalidated'
      : params.oraclePass
        ? 'core.oracle_pass'
        : 'core.oracle_failed',
    advisorConsultOutcome: 'not_expected',
    advisorFailureKind: null,
    entrypointKind: 'binary',
    entrypointPath: process.execPath,
    buildFreshness: {
      gitHead: 'sha',
      repoDirty: false,
      dirtyStatus: [],
      cliSourceGitCommit: 'sha',
      cliDistGitCommit: 'sha',
      coreSourceGitCommit: 'sha',
      coreDistGitCommit: 'sha',
      sourceCommitsMatchHead: true,
      distCommitsMatchSource: true,
    },
    taskEscalates: false,
    workspaceDir: 'workspace',
    homeDir: 'home',
    telemetryPath: 'telemetry.log',
    stdoutPath: 'stdout.txt',
    stderrPath: 'stderr.txt',
  };
}

function runsForRates(
  taskId: string,
  flashPasses: boolean[],
  proPasses: boolean[],
): RealBenchmarkRunRecord[] {
  return [
    ...flashPasses.map((oraclePass, index) =>
      buildRun({
        taskId,
        conditionId: 'A',
        sampleIndex: index + 1,
        oraclePass,
      }),
    ),
    ...proPasses.map((oraclePass, index) =>
      buildRun({
        taskId,
        conditionId: 'E',
        sampleIndex: index + 1,
        oraclePass,
      }),
    ),
  ];
}

describe('buildRealBenchmarkM3CalibrationSummary', () => {
  it('labels a task easy when Flash passes too often', () => {
    const summary = buildRealBenchmarkM3CalibrationSummary({
      calibrationBatchId: 'batch',
      corpusSha: 'corpus',
      taskIds: ['M3-BM-01-CROSS-FILE-EXPORT-FIX'],
      runs: runsForRates(
        'M3-BM-01-CROSS-FILE-EXPORT-FIX',
        [true, true],
        [true, true],
      ),
      thresholds,
    });

    expect(summary.taskSummaries[0].label).toBe('easy');
  });

  it('labels a task discriminative when Flash is weak and Pro is strong', () => {
    const summary = buildRealBenchmarkM3CalibrationSummary({
      calibrationBatchId: 'batch',
      corpusSha: 'corpus',
      taskIds: ['M3-BM-02-MISLEADING-DEFAULT-CONFIG'],
      runs: runsForRates(
        'M3-BM-02-MISLEADING-DEFAULT-CONFIG',
        [false, true],
        [true, true, true],
      ),
      thresholds,
    });

    expect(summary.taskSummaries[0].label).toBe('discriminative');
    expect(summary.selectedTaskIds).toEqual([
      'M3-BM-02-MISLEADING-DEFAULT-CONFIG',
    ]);
  });

  it('labels a task impossible_or_noisy when Pro is not strong enough', () => {
    const summary = buildRealBenchmarkM3CalibrationSummary({
      calibrationBatchId: 'batch',
      corpusSha: 'corpus',
      taskIds: ['M3-BM-03-DISTRACTOR-NOTES-SUMMARY'],
      runs: runsForRates(
        'M3-BM-03-DISTRACTOR-NOTES-SUMMARY',
        [false, false],
        [true, false, false],
      ),
      thresholds,
    });

    expect(summary.taskSummaries[0].label).toBe('impossible_or_noisy');
  });

  it('labels a task flaky when invalidation exceeds the stable threshold', () => {
    const taskId = 'M3-BM-04-SHELL-AGGREGATE-WITH-HEADER';
    const summary = buildRealBenchmarkM3CalibrationSummary({
      calibrationBatchId: 'batch',
      corpusSha: 'corpus',
      taskIds: [taskId],
      runs: [
        buildRun({
          taskId,
          conditionId: 'A',
          sampleIndex: 1,
          oraclePass: false,
          invalidated: true,
        }),
        buildRun({
          taskId,
          conditionId: 'E',
          sampleIndex: 1,
          oraclePass: true,
        }),
      ],
      thresholds,
    });

    expect(summary.taskSummaries[0].label).toBe('flaky');
  });

  it('emits a frozen selected task manifest and markdown report', () => {
    const summary = buildRealBenchmarkM3CalibrationSummary({
      calibrationBatchId: 'batch',
      corpusSha: 'corpus',
      taskIds: ['M3-BM-05-TRANSITIVE-RENAME'],
      runs: runsForRates(
        'M3-BM-05-TRANSITIVE-RENAME',
        [false, false],
        [true, true],
      ),
      thresholds,
    });
    const selectedTaskSet = buildRealBenchmarkM3SelectedTaskSet(summary);
    const markdown = renderRealBenchmarkM3CalibrationReport(summary);

    expect(selectedTaskSet.selectedTaskIds).toEqual([
      'M3-BM-05-TRANSITIVE-RENAME',
    ]);
    expect(markdown).toContain('Pollux M3 Calibration Report');
    expect(markdown).toContain('Task Calibration');
  });
});
