/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildRealBenchmarkM3ValueSummary,
  renderRealBenchmarkM3ValueReport,
} from './pollux-real-report.js';
import type {
  RealBenchmarkConditionId,
  RealBenchmarkM3SelectedTaskSet,
  RealBenchmarkM3ValueThresholds,
  RealBenchmarkRunRecord,
} from './pollux-real-types.js';

const thresholds: RealBenchmarkM3ValueThresholds = {
  minFOverAAbsolute: 0.1,
  maxFCostPerTaskVsE: 0.7,
  maxFCostPerSuccessVsE: 0.7,
  maxInvalidRate: 0.2,
  minSelectedTaskCount: 1,
};

const selectedTaskSet: RealBenchmarkM3SelectedTaskSet = {
  generatedAt: '2026-04-25T00:00:00.000Z',
  calibrationBatchId: 'm3-calibration-unit',
  corpusSha: 'corpus',
  thresholds: {
    maxFlashPassRateForDiscriminative: 0.5,
    minProPassRateForDiscriminative: 0.67,
    maxInvalidRateForStableTask: 0.2,
    minSelectedTaskCount: 1,
    maxSelectedTaskCount: 15,
  },
  selectedTaskIds: ['M3-BM-01-CROSS-FILE-EXPORT-FIX'],
  rejectedTaskIds: [],
  taskSummaries: [],
};

function buildRun(params: {
  conditionId: RealBenchmarkConditionId;
  sampleIndex: number;
  oraclePass: boolean;
  totalCostUsd: number | null;
  totalTokens?: number;
  advisorTokens?: number;
  advisorCalls?: number;
  invalidated?: boolean;
}): RealBenchmarkRunRecord {
  return {
    campaignId: 'm3-value-unit',
    sampleId: `${params.conditionId}-${params.sampleIndex}`,
    taskId: 'M3-BM-01-CROSS-FILE-EXPORT-FIX',
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
    tokens: {
      total: params.totalTokens ?? 100,
      advisor: params.advisorTokens ?? 0,
      executor: (params.totalTokens ?? 100) - (params.advisorTokens ?? 0),
    },
    costUsd: {
      total: params.totalCostUsd,
      advisor: params.totalCostUsd === null ? null : params.totalCostUsd * 0.25,
      executor:
        params.totalCostUsd === null ? null : params.totalCostUsd * 0.75,
      pricingSnapshotId: params.totalCostUsd === null ? null : 'pricing',
    },
    observedAdvisorCalls: params.advisorCalls ?? 0,
    observedEscalationAttempts: params.advisorCalls ?? 0,
    polluxEscalationTelemetryCount: params.advisorCalls ?? 0,
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
    predictedEscalation: (params.advisorCalls ?? 0) > 0,
    confusionOutcome: params.invalidated ? 'excluded' : 'true_negative',
    desiredOutcomeSatisfied: !params.invalidated && params.oraclePass,
    desiredOutcomeReasonCode: params.invalidated
      ? 'core.invalidated'
      : params.oraclePass
        ? 'core.oracle_pass'
        : 'core.oracle_failed',
    advisorConsultOutcome:
      (params.advisorCalls ?? 0) > 0 ? 'consulted' : 'not_expected',
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

describe('buildRealBenchmarkM3ValueSummary', () => {
  it('computes uplift, gap closure, cost ratios, and advisor token share', () => {
    const summary = buildRealBenchmarkM3ValueSummary({
      valueBatchId: 'm3-value-unit',
      selectedTaskSetPath: 'selected-task-set.json',
      selectedTaskSet,
      corpusSha: 'corpus',
      thresholds,
      runs: [
        buildRun({
          conditionId: 'A',
          sampleIndex: 1,
          oraclePass: false,
          totalCostUsd: 0.01,
        }),
        buildRun({
          conditionId: 'E',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: 0.1,
        }),
        buildRun({
          conditionId: 'F',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: 0.05,
          totalTokens: 200,
          advisorTokens: 50,
          advisorCalls: 1,
        }),
      ],
    });

    expect(summary.uplift.absoluteFOverA).toBe(1);
    expect(summary.uplift.gapClosedByF).toBe(1);
    expect(summary.economics.fCostPerTaskVsE).toBe(0.5);
    expect(summary.economics.fCostPerSuccessVsE).toBe(0.5);
    expect(summary.advisorTokenShareF).toBe(0.25);
    expect(summary.pass).toBe(true);
  });

  it('fails when pricing is missing for economic thresholds', () => {
    const summary = buildRealBenchmarkM3ValueSummary({
      valueBatchId: 'm3-value-unit',
      selectedTaskSetPath: 'selected-task-set.json',
      selectedTaskSet,
      corpusSha: 'corpus',
      thresholds,
      runs: [
        buildRun({
          conditionId: 'A',
          sampleIndex: 1,
          oraclePass: false,
          totalCostUsd: null,
        }),
        buildRun({
          conditionId: 'E',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: null,
        }),
        buildRun({
          conditionId: 'F',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: null,
          advisorCalls: 1,
        }),
      ],
    });

    expect(summary.pass).toBe(false);
    expect(summary.failedThresholds.join('\n')).toContain(
      'F/E cost per task n/a',
    );
  });

  it('fails when the selected set is too small', () => {
    const summary = buildRealBenchmarkM3ValueSummary({
      valueBatchId: 'm3-value-unit',
      selectedTaskSetPath: 'selected-task-set.json',
      selectedTaskSet: {
        ...selectedTaskSet,
        selectedTaskIds: [],
      },
      corpusSha: 'corpus',
      thresholds: {
        ...thresholds,
        minSelectedTaskCount: 1,
      },
      runs: [],
    });

    expect(summary.pass).toBe(false);
    expect(summary.failedThresholds.join('\n')).toContain('selected tasks 0');
  });

  it('renders a value report with condition economics and task outcomes', () => {
    const summary = buildRealBenchmarkM3ValueSummary({
      valueBatchId: 'm3-value-unit',
      selectedTaskSetPath: 'selected-task-set.json',
      selectedTaskSet,
      corpusSha: 'corpus',
      thresholds,
      runs: [
        buildRun({
          conditionId: 'A',
          sampleIndex: 1,
          oraclePass: false,
          totalCostUsd: 0.01,
        }),
        buildRun({
          conditionId: 'E',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: 0.1,
        }),
        buildRun({
          conditionId: 'F',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: 0.05,
          advisorCalls: 1,
        }),
      ],
    });
    const markdown = renderRealBenchmarkM3ValueReport(summary);

    expect(markdown).toContain('Pollux M3 Value Report');
    expect(markdown).toContain('Condition Economics');
    expect(markdown).toContain('Per-Task Outcomes');
  });
});
