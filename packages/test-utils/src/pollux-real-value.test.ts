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
import { parseRealBenchmarkConditionIds } from './pollux-real-value.js';
import type {
  RealBenchmarkAdvisorTriggerMode,
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
  advisorTriggerMode?: RealBenchmarkAdvisorTriggerMode;
  invalidated?: boolean;
}): RealBenchmarkRunRecord {
  const advisorTriggerMode =
    params.advisorTriggerMode ??
    (params.conditionId === 'FR' || params.conditionId === 'LFR'
      ? 'executor_request'
      : params.conditionId === 'FD' || params.conditionId === 'LFD'
        ? 'detector'
        : 'hybrid');
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
    advisorGuidanceInjected: (params.advisorCalls ?? 0) > 0,
    advisorGuidanceInjectionCount: (params.advisorCalls ?? 0) > 0 ? 1 : 0,
    advisorGuidanceChars: (params.advisorCalls ?? 0) > 0 ? 32 : 0,
    advisorGuidanceWords: (params.advisorCalls ?? 0) > 0 ? 5 : 0,
    advisorParserOutcomes: (params.advisorCalls ?? 0) > 0 ? ['direct'] : [],
    advisorTriggerModes:
      (params.advisorCalls ?? 0) > 0 ? [advisorTriggerMode] : [],
    advisorTriggerSources: (params.advisorCalls ?? 0) > 0 ? ['fusion'] : [],
    advisorInjectionTimings:
      (params.advisorCalls ?? 0) > 0 ? ['next_turn'] : [],
    firstAdvisorGuidanceInjectionEventIndex:
      (params.advisorCalls ?? 0) > 0 ? 2 : null,
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
    detectorOpportunity:
      params.conditionId === 'F'
        ? {
            signalClass: 'fusion_composite',
            expectedSignalClasses: ['fusion_composite'],
            expectedForM3: true,
            observedReasonCodes:
              (params.advisorCalls ?? 0) > 0
                ? ['pollux.escalation.fusion_composite']
                : [],
            observedSignalIds:
              (params.advisorCalls ?? 0) > 0
                ? ['longitudinal.m3_anchor_pressure']
                : [],
            observedSignalAttributions: [],
            matchedExpectedSignalClass: (params.advisorCalls ?? 0) > 0,
            matchedExpectedSignalEvidence:
              (params.advisorCalls ?? 0) > 0
                ? 'fusion_composite:pollux.escalation.fusion_composite'
                : null,
          }
        : undefined,
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
  it('parses opt-in condition IDs for trigger-mode comparison runs', () => {
    expect(parseRealBenchmarkConditionIds(undefined)).toBeUndefined();
    expect(parseRealBenchmarkConditionIds('A,FR,E,L,LFR')).toEqual([
      'A',
      'FR',
      'E',
      'L',
      'LFR',
    ]);
  });

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
    expect(
      summary.conditionValueSummaries.find(
        (condition) => condition.conditionId === 'F',
      ),
    ).toMatchObject({
      advisorGuidanceInjectionCount: 1,
      advisorGuidanceInjectionRate: 1,
      avgAdvisorTokensPerInjectedConsultation: 50,
      costPerPassWithInjectedGuidanceUsd: 0.05,
    });
    expect(summary.fAdvisorEvidencePresent).toBe(true);
    expect(summary.fM3AlignedAdvisorEvidencePresent).toBe(true);
    expect(summary.fConsultedSampleCount).toBe(1);
    expect(summary.fM3AlignedConsultedSampleCount).toBe(1);
    expect(summary.fTasksWithAdvisorEvidence).toEqual([
      'M3-BM-01-CROSS-FILE-EXPORT-FIX',
    ]);
    expect(summary.fTasksWithM3AlignedAdvisorEvidence).toEqual([
      'M3-BM-01-CROSS-FILE-EXPORT-FIX',
    ]);
    expect(summary.diagnosticOnly).toBe(false);
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

  it('renders requested trigger-mode lanes dynamically', () => {
    const conditionIds: RealBenchmarkConditionId[] = [
      'A',
      'F',
      'FR',
      'FD',
      'E',
      'L',
      'LF',
      'LFR',
      'LFD',
    ];
    const summary = buildRealBenchmarkM3ValueSummary({
      valueBatchId: 'm3-value-unit',
      selectedTaskSetPath: 'selected-task-set.json',
      selectedTaskSet,
      corpusSha: 'corpus',
      thresholds,
      conditionIds,
      runs: [
        buildRun({
          conditionId: 'A',
          sampleIndex: 1,
          oraclePass: false,
          totalCostUsd: 0.01,
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
        buildRun({
          conditionId: 'FR',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: 0.052,
          totalTokens: 180,
          advisorTokens: 40,
          advisorCalls: 1,
        }),
        buildRun({
          conditionId: 'FD',
          sampleIndex: 1,
          oraclePass: false,
          totalCostUsd: 0.045,
          totalTokens: 170,
          advisorTokens: 35,
          advisorCalls: 1,
        }),
        buildRun({
          conditionId: 'E',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: 0.1,
        }),
        buildRun({
          conditionId: 'L',
          sampleIndex: 1,
          oraclePass: false,
          totalCostUsd: 0.005,
        }),
        buildRun({
          conditionId: 'LF',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: 0.04,
          totalTokens: 190,
          advisorTokens: 45,
          advisorCalls: 1,
        }),
        buildRun({
          conditionId: 'LFR',
          sampleIndex: 1,
          oraclePass: true,
          totalCostUsd: 0.038,
          totalTokens: 170,
          advisorTokens: 38,
          advisorCalls: 1,
        }),
        buildRun({
          conditionId: 'LFD',
          sampleIndex: 1,
          oraclePass: false,
          totalCostUsd: 0.03,
          totalTokens: 160,
          advisorTokens: 30,
          advisorCalls: 1,
        }),
      ],
    });

    expect(summary.conditionIds).toEqual(conditionIds);
    expect(
      summary.conditionValueSummaries.map((condition) => [
        condition.conditionId,
        condition.advisorTriggerMode,
      ]),
    ).toEqual([
      ['A', null],
      ['F', 'hybrid'],
      ['FR', 'executor_request'],
      ['FD', 'detector'],
      ['E', null],
      ['L', null],
      ['LF', 'hybrid'],
      ['LFR', 'executor_request'],
      ['LFD', 'detector'],
    ]);
    expect(summary.triggerModeComparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baselineConditionId: 'F',
          comparisonConditionId: 'FR',
          comparisonKind: 'executor_request',
        }),
        expect.objectContaining({
          baselineConditionId: 'F',
          comparisonConditionId: 'FD',
          comparisonKind: 'detector',
        }),
        expect.objectContaining({
          baselineConditionId: 'LF',
          comparisonConditionId: 'LFR',
          comparisonKind: 'executor_request',
        }),
        expect.objectContaining({
          baselineConditionId: 'LF',
          comparisonConditionId: 'LFD',
          comparisonKind: 'detector',
        }),
      ]),
    );

    const markdown = renderRealBenchmarkM3ValueReport(summary);
    expect(markdown).toContain('Trigger-Mode Diagnostics');
    expect(markdown).toContain('Trigger mode');
    expect(markdown).toContain('FR pass');
    expect(markdown).toContain('LFD invalid');
  });

  it('marks the value suite as diagnostic-only when F has zero advisor evidence', () => {
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
          advisorCalls: 0,
          advisorTokens: 0,
        }),
      ],
    });

    expect(summary.pass).toBe(false);
    expect(summary.diagnosticOnly).toBe(true);
    expect(summary.fAdvisorEvidencePresent).toBe(false);
    expect(summary.fM3AlignedAdvisorEvidencePresent).toBe(false);
    expect(summary.failedThresholds.join('\n')).toContain(
      'zero advisor evidence',
    );

    const markdown = renderRealBenchmarkM3ValueReport(summary);
    expect(markdown).toContain('Diagnostic-only: yes');
    expect(markdown).toContain(
      'detector-miss diagnostic evidence, not valid Pollux product-value evidence',
    );
  });

  it('marks the value suite as diagnostic-only when F advisor evidence is not M3-aligned', () => {
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
        {
          ...buildRun({
            conditionId: 'F',
            sampleIndex: 1,
            oraclePass: true,
            totalCostUsd: 0.05,
            totalTokens: 200,
            advisorTokens: 50,
            advisorCalls: 1,
          }),
          detectorOpportunity: {
            signalClass: 'risk_gate',
            expectedSignalClasses: ['risk_gate', 'fusion_composite'],
            expectedForM3: true,
            observedReasonCodes: ['pollux.escalation.risk_gate_block'],
            observedSignalIds: ['risk.pre_tool_high'],
            observedSignalAttributions: ['generic_shell:built_in:rm\\s+-rf'],
            matchedExpectedSignalClass: false,
            matchedExpectedSignalEvidence: null,
          },
        },
      ],
    });

    expect(summary.fAdvisorEvidencePresent).toBe(true);
    expect(summary.fM3AlignedAdvisorEvidencePresent).toBe(false);
    expect(summary.diagnosticOnly).toBe(true);
    expect(summary.failedThresholds.join('\n')).toContain(
      'zero M3-aligned advisor evidence',
    );

    const markdown = renderRealBenchmarkM3ValueReport(summary);
    expect(markdown).toContain(
      'detector-alignment diagnostic evidence, not valid Pollux product-value evidence',
    );
  });
});
