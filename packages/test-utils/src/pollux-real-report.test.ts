/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildRealBenchmarkCampaignSummary,
  buildRealBenchmarkPolluxV1CalibrationSummary,
  buildRealBenchmarkPolluxV1LabelReview,
  renderRealBenchmarkPolluxV1CalibrationReport,
  renderRealBenchmarkCampaignReport,
} from './pollux-real-report.js';
import type {
  RealBenchmarkCampaignManifest,
  RealBenchmarkRunRecord,
} from './pollux-real-types.js';

const manifest: RealBenchmarkCampaignManifest = {
  campaignId: 'unit-campaign',
  mode: 'pilot',
  runVenue: 'local',
  authIsolationMode: 'single_account',
  repeatsPerCell: 1,
  conditions: [
    {
      id: 'A',
      executorModel: 'gemini-2.5-flash',
      polluxEnabled: false,
      settingsOverrides: {},
      authProfile: 'baseline',
      publishableEligible: true,
    },
    {
      id: 'F',
      executorModel: 'gemini-2.5-flash',
      advisorModel: 'gemini-3-pro-preview',
      polluxEnabled: true,
      settingsOverrides: {},
      authProfile: 'pollux',
      publishableEligible: true,
    },
  ],
  canonicalSurface: 'headless_non_interactive_cli',
  selectedTaskIds: ['TASK-1'],
};

function buildRun(
  partial: Partial<RealBenchmarkRunRecord>,
): RealBenchmarkRunRecord {
  return {
    campaignId: 'unit-campaign',
    sampleId: 'sample-1',
    taskId: 'TASK-1',
    conditionId: 'F',
    sampleIndex: 1,
    benchmarkLane: 'canary',
    gitSha: 'sha',
    lockfileHash: 'lock',
    corpusSha: 'corpus',
    promptId: 'prompt',
    responseIds: ['response'],
    wallClockMs: 100,
    serviceLatencyMs: [80],
    tokens: { total: 100, advisor: 30, executor: 70 },
    costUsd: {
      total: null,
      advisor: null,
      executor: null,
      pricingSnapshotId: null,
    },
    observedAdvisorCalls: 1,
    escalationEvents: [
      {
        turnId: 'prompt:1',
        reasonCode: 'pollux.escalation.self_report_stuck',
        escalationTiming: 'same_turn',
        outcome: 'consulted',
        sameTurnDowngraded: false,
        pauseBoundary: 'post_event',
        contributingSignalIds: ['self.structured_status_stuck'],
        failureKind: null,
        eventIndex: 1,
      },
    ],
    escalationTiming: ['same_turn'],
    reasonCodes: ['pollux.escalation.self_report_stuck'],
    excludedFromConfusion: null,
    fairnessPins: {
      routerPinned: true,
      loopDetectionDisabled: true,
      availabilityReset: true,
      dynamicConfigFixed: true,
      sessionIsolated: true,
      sandboxIsolated: true,
    },
    oraclePass: true,
    invalidated: false,
    exitCode: 0,
    taskEscalates: true,
    workspaceDir: 'workspace',
    homeDir: 'home',
    telemetryPath: 'telemetry.log',
    stdoutPath: 'stdout.txt',
    stderrPath: 'stderr.txt',
    ...partial,
    observedEscalationAttempts:
      partial.observedEscalationAttempts ??
      partial.escalationEvents?.length ??
      1,
    polluxEscalationTelemetryCount:
      partial.polluxEscalationTelemetryCount ??
      partial.escalationEvents?.length ??
      1,
    stdoutStatusTagCount: partial.stdoutStatusTagCount ?? 0,
    malformedStatusTagCount: partial.malformedStatusTagCount ?? 0,
    nearMissStatusTagCount: partial.nearMissStatusTagCount ?? 0,
    stderrWorkspacePathViolationCount:
      partial.stderrWorkspacePathViolationCount ?? 0,
    toolErrorCount: partial.toolErrorCount ?? 0,
    advisorAttempts: partial.advisorAttempts ?? [],
    structuredErrorEvidence: partial.structuredErrorEvidence ?? null,
    timedOut: partial.timedOut ?? false,
    modelResponseCount: partial.modelResponseCount ?? 1,
    expectedEscalation:
      partial.expectedEscalation ??
      ((partial.taskEscalates ?? true) && (partial.conditionId ?? 'F') === 'F'),
    predictedEscalation:
      partial.predictedEscalation ??
      ((partial.observedEscalationAttempts ??
        partial.escalationEvents?.length ??
        1) > 0 ||
        (partial.observedAdvisorCalls ?? 1) > 0),
    confusionOutcome: partial.confusionOutcome ?? 'true_positive',
    desiredOutcomeSatisfied: partial.desiredOutcomeSatisfied ?? true,
    desiredOutcomeReasonCode:
      partial.desiredOutcomeReasonCode ?? 'canary.consulted_true_positive',
    advisorConsultOutcome: partial.advisorConsultOutcome ?? 'consulted',
    advisorFailureKind: partial.advisorFailureKind ?? null,
    entrypointKind: partial.entrypointKind ?? 'binary',
    entrypointPath: partial.entrypointPath ?? process.execPath,
    buildFreshness: partial.buildFreshness ?? {
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
  };
}

describe('buildRealBenchmarkCampaignSummary', () => {
  it('excludes fail_open and budget_exhausted runs from confusion counts', () => {
    const runs: RealBenchmarkRunRecord[] = [
      buildRun({ sampleId: 'tp', conditionId: 'F', taskEscalates: true }),
      buildRun({
        sampleId: 'tn',
        conditionId: 'A',
        taskEscalates: false,
        observedAdvisorCalls: 0,
        tokens: { total: 70, advisor: 0, executor: 70 },
        escalationEvents: [],
        escalationTiming: [],
        reasonCodes: [],
      }),
      buildRun({
        sampleId: 'budget',
        excludedFromConfusion: 'budget_exhausted',
        observedAdvisorCalls: 0,
        escalationEvents: [
          {
            turnId: 'prompt:2',
            reasonCode: 'pollux.escalation.risk_gate_block',
            escalationTiming: 'next_turn',
            outcome: 'budget_exhausted',
            sameTurnDowngraded: true,
            pauseBoundary: null,
            contributingSignalIds: ['risk_gate.command_block'],
            failureKind: null,
            eventIndex: 2,
          },
        ],
        escalationTiming: ['next_turn'],
        reasonCodes: ['pollux.escalation.risk_gate_block'],
      }),
      buildRun({
        sampleId: 'fail-open',
        excludedFromConfusion: 'fail_open',
        escalationEvents: [
          {
            turnId: 'prompt:3',
            reasonCode: 'pollux.escalation.fusion_composite',
            escalationTiming: 'next_turn',
            outcome: 'fail_open',
            sameTurnDowngraded: false,
            pauseBoundary: null,
            contributingSignalIds: ['fusion.composite'],
            failureKind: 'timeout',
            eventIndex: 3,
          },
        ],
        escalationTiming: ['next_turn'],
        reasonCodes: ['pollux.escalation.fusion_composite'],
      }),
    ];

    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      runs,
      [],
    );

    expect(summary.escalation.includedSampleCount).toBe(2);
    expect(summary.escalation.truePositive).toBe(1);
    expect(summary.escalation.trueNegative).toBe(1);
    expect(summary.escalation.falsePositive).toBe(0);
    expect(summary.escalation.falseNegative).toBe(0);
    expect(summary.escalation.exclusionCounts).toEqual({
      budgetExhausted: 1,
      failOpen: 1,
    });
    expect(summary.escalation.precision).toBe(1);
    expect(summary.escalation.recall).toBe(1);
    expect(summary.reasonCodeCounts).toEqual({
      'pollux.escalation.fusion_composite': 1,
      'pollux.escalation.risk_gate_block': 1,
      'pollux.escalation.self_report_stuck': 1,
    });
  });

  it('adds instrumentation blockers when escalation evidence is missing', () => {
    const runs: RealBenchmarkRunRecord[] = [
      buildRun({
        sampleId: 'missing-events',
        observedAdvisorCalls: 1,
        escalationEvents: [],
        escalationTiming: [],
        reasonCodes: [],
      }),
      buildRun({
        sampleId: 'missing-reason',
        observedAdvisorCalls: 1,
        escalationEvents: [
          {
            turnId: 'prompt:4',
            reasonCode: null,
            escalationTiming: 'same_turn',
            outcome: 'consulted',
            sameTurnDowngraded: false,
            pauseBoundary: null,
            contributingSignalIds: [],
            failureKind: null,
            eventIndex: 4,
          },
        ],
        escalationTiming: ['same_turn'],
        reasonCodes: [],
      }),
    ];

    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      runs,
      [],
    );

    expect(summary.publishabilityBlockers.join('\n')).toContain(
      'no pollux escalation telemetry events were captured',
    );
    expect(summary.publishabilityBlockers.join('\n')).toContain(
      'missing reason_code or escalation_timing',
    );
  });

  it('surfaces false negatives in blockers and the missing_event timing bucket', () => {
    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      [
        buildRun({
          sampleId: 'fn',
          conditionId: 'F',
          taskEscalates: true,
          observedAdvisorCalls: 0,
          observedEscalationAttempts: 0,
          polluxEscalationTelemetryCount: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
          predictedEscalation: false,
        }),
      ],
      [],
    );

    expect(summary.escalation.falseNegative).toBe(1);
    expect(
      summary.escalationTiming.find((entry) => entry.timing === 'missing_event')
        ?.falseNegative,
    ).toBe(1);
    expect(summary.publishabilityBlockers.join('\n')).toContain(
      'false negatives',
    );
    expect(summary.runDiagnostics[0]).toMatchObject({
      sampleId: 'fn',
      confusionOutcome: 'false_negative',
      primaryTiming: 'missing_event',
    });
  });

  it('blocks silent F runs that miss M3 detector opportunities', () => {
    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      [
        buildRun({
          sampleId: 'm3-silent',
          conditionId: 'F',
          benchmarkLane: 'core',
          taskEscalates: false,
          expectedEscalation: false,
          observedAdvisorCalls: 0,
          observedEscalationAttempts: 0,
          polluxEscalationTelemetryCount: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
          predictedEscalation: false,
          confusionOutcome: 'true_negative',
          advisorConsultOutcome: 'not_expected',
          actualAdvisorConsultOutcome: 'not_attempted',
          tokens: { total: 100, advisor: 0, executor: 100 },
          detectorOpportunity: {
            signalClass: 'risk_gate',
            expectedForM3: true,
            observedReasonCodes: [],
            matchedExpectedSignalClass: false,
          },
        }),
      ],
      [],
    );

    expect(summary.escalation.trueNegative).toBe(1);
    expect(summary.publishabilityBlockers.join('\n')).toContain(
      'M3 detector opportunities',
    );
    expect(summary.publishabilityBlockers.join('\n')).toContain('m3-silent');
  });

  it('blocks generic safety advisor evidence that does not match M3 detector evidence', () => {
    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      [
        buildRun({
          sampleId: 'm3-generic-risk-only',
          conditionId: 'F',
          benchmarkLane: 'core',
          taskEscalates: false,
          expectedEscalation: false,
          observedAdvisorCalls: 1,
          observedEscalationAttempts: 1,
          polluxEscalationTelemetryCount: 1,
          predictedEscalation: true,
          confusionOutcome: 'false_positive',
          advisorConsultOutcome: 'not_expected',
          actualAdvisorConsultOutcome: 'consulted',
          tokens: { total: 150, advisor: 40, executor: 110 },
          escalationEvents: [
            {
              turnId: 'prompt:1',
              reasonCode: 'pollux.escalation.risk_gate_block',
              escalationTiming: 'same_turn',
              outcome: 'consulted',
              sameTurnDowngraded: false,
              pauseBoundary: 'pre_tool',
              contributingSignalIds: ['risk.pre_tool_high'],
              contributingSignalAttributions: [
                'generic_shell:built_in:rm\\s+-rf(?:\\s|$)',
              ],
              failureKind: null,
              eventIndex: 1,
            },
          ],
          escalationTiming: ['same_turn'],
          reasonCodes: ['pollux.escalation.risk_gate_block'],
          detectorOpportunity: {
            signalClass: 'risk_gate',
            expectedSignalClasses: ['risk_gate', 'fusion_composite'],
            expectedForM3: true,
            observedReasonCodes: ['pollux.escalation.risk_gate_block'],
            observedSignalIds: ['risk.pre_tool_high'],
            observedSignalAttributions: [
              'generic_shell:built_in:rm\\s+-rf(?:\\s|$)',
            ],
            matchedExpectedSignalClass: false,
            matchedExpectedSignalEvidence: null,
          },
        }),
      ],
      [],
    );

    expect(summary.publishabilityBlockers.join('\n')).toContain(
      'no M3-aligned escalation evidence',
    );
    expect(summary.publishabilityBlockers.join('\n')).toContain(
      'm3-generic-risk-only',
    );
  });

  it('adds blockers for malformed status near-misses and tool errors', () => {
    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      [
        buildRun({
          sampleId: 'dirty-evidence',
          malformedStatusTagCount: 1,
          nearMissStatusTagCount: 1,
          toolErrorCount: 2,
        }),
      ],
      [],
    );

    expect(summary.publishabilityBlockers.join('\n')).toContain(
      'malformed pollux:status near-misses',
    );
    expect(summary.publishabilityBlockers.join('\n')).toContain(
      'tool/shell errors',
    );
  });

  it('emits core, stress, and canary lane summaries with milestone semantics', () => {
    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      [
        buildRun({
          sampleId: 'core-pass',
          taskId: 'CAL-BM-01-SIMPLE',
          conditionId: 'A',
          benchmarkLane: 'core',
          taskEscalates: false,
          observedAdvisorCalls: 0,
          observedEscalationAttempts: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
          expectedEscalation: false,
          predictedEscalation: false,
        }),
        buildRun({
          sampleId: 'stress-invalid',
          taskId: 'CAL-BM-03-COMPLEX',
          conditionId: 'A',
          benchmarkLane: 'stress',
          taskEscalates: false,
          observedAdvisorCalls: 0,
          observedEscalationAttempts: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
          expectedEscalation: false,
          predictedEscalation: false,
          invalidated: true,
          invalidationReason: 'model_call_ceiling_exceeded',
          confusionOutcome: 'excluded',
        }),
        buildRun({
          sampleId: 'canary-fail-open',
          taskId: 'CAL-BM-04-ESCALATING',
          benchmarkLane: 'canary',
          excludedFromConfusion: 'fail_open',
          escalationEvents: [
            {
              turnId: 'prompt:3',
              reasonCode: 'pollux.escalation.self_report_stuck',
              escalationTiming: 'same_turn',
              outcome: 'fail_open',
              sameTurnDowngraded: false,
              pauseBoundary: 'post_event',
              contributingSignalIds: ['self.structured_status_stuck'],
              failureKind: 'timeout',
              eventIndex: 3,
            },
          ],
          escalationTiming: ['same_turn'],
          reasonCodes: ['pollux.escalation.self_report_stuck'],
        }),
      ],
      [],
    );

    expect(summary.laneConditionSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lane: 'core',
          conditionId: 'A',
          sampleCount: 1,
          desiredOutcomeSatisfiedCount: 1,
        }),
        expect.objectContaining({
          lane: 'stress',
          conditionId: 'A',
          sampleCount: 1,
          desiredOutcomeSatisfiedCount: 0,
        }),
        expect.objectContaining({
          lane: 'canary',
          conditionId: 'F',
          sampleCount: 1,
          desiredOutcomeSatisfiedCount: 0,
        }),
      ]),
    );
    expect(summary.canaryConsultSummary).toMatchObject({
      expectedPositiveSampleCount: 1,
      validExpectedPositiveSampleCount: 1,
      attempted: 1,
      failOpen: 1,
      consulted: 0,
    });
    expect(summary.canaryConsultSummary.consultSuccessWilson95).toMatchObject({
      n: 1,
      proportion: 0,
    });
    expect(summary.repeatSummaries).toEqual([
      expect.objectContaining({
        sampleIndex: 1,
        sampleCount: 3,
      }),
    ]);
    expect(summary.cellAggregateSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cellKey: 'CAL-BM-03-COMPLEX::A',
          lane: 'stress',
        }),
        expect.objectContaining({
          cellKey: 'CAL-BM-04-ESCALATING::F',
          lane: 'canary',
          parseErrorCount: 0,
        }),
      ]),
    );
    expect(summary.canaryReliabilitySummary).toMatchObject({
      expectedPositiveSampleCount: 1,
      validExpectedPositiveSampleCount: 1,
      failOpenCount: 1,
      attemptPathCounts: {
        primarySuccess: 0,
        repairRetrySuccess: 0,
        fallbackSuccess: 0,
        finalFailOpen: 1,
      },
    });
    expect(summary.stressSummary).toMatchObject({
      sampleCount: 1,
      invalidSampleCount: 1,
      modelCallCeilingExceededCount: 1,
      invalidationReasonCounts: {
        model_call_ceiling_exceeded: 1,
      },
    });
    expect(summary.runDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sampleId: 'core-pass',
          benchmarkLane: 'core',
          desiredOutcomeSatisfied: true,
          desiredOutcomeReasonCode: 'core.oracle_pass',
        }),
        expect.objectContaining({
          sampleId: 'stress-invalid',
          benchmarkLane: 'stress',
          desiredOutcomeSatisfied: false,
          desiredOutcomeReasonCode: 'stress.invalidated',
        }),
        expect.objectContaining({
          sampleId: 'canary-fail-open',
          benchmarkLane: 'canary',
          desiredOutcomeSatisfied: false,
          desiredOutcomeReasonCode: 'canary.fail_open',
          advisorConsultOutcome: 'fail_open',
          advisorFailureKind: 'timeout',
        }),
      ]),
    );
  });

  it('keeps valid-only metrics strict while surfacing all-sample F ceiling diagnostics', () => {
    const runs: RealBenchmarkRunRecord[] = [
      buildRun({
        sampleId: 'f-ceiling-1',
        taskId: 'M3-BM-20-GUARDED-REGISTRY-RENAME',
        conditionId: 'F',
        benchmarkLane: 'core',
        taskEscalates: false,
        expectedEscalation: false,
        oraclePass: true,
        invalidated: true,
        invalidationReason: 'model_call_ceiling_exceeded',
        desiredOutcomeSatisfied: false,
        desiredOutcomeReasonCode: 'core.invalidated',
        tokens: { total: 1000, advisor: 200, executor: 800 },
        costUsd: {
          total: 0.1234,
          advisor: 0.05,
          executor: 0.0734,
          pricingSnapshotId: 'unit-pricing',
        },
        observedAdvisorCalls: 1,
        modelResponseCount: 9,
        responseCeiling: {
          maxModelResponsesPerSample: 6,
          countedModelResponses: 9,
          overflowBy: 3,
          invalidatedByCeiling: true,
          ceilingScope: 'all_model_responses',
        },
        actualAdvisorConsultOutcome: 'consulted',
        polluxTimingDiagnostics: {
          firstAdvisorCallEventIndex: 14,
          firstAdvisorCallModelResponseOrdinal: 8,
          executorResponsesBeforeFirstAdvisor: 7,
          executorResponsesAfterFirstAdvisor: 1,
          firstEscalationReasonCode: 'pollux.escalation.risk_gate_block',
          firstEscalationTiming: 'next_turn',
          firstEscalationOutcome: 'consulted',
          firstEscalationPauseBoundary: 'pre_tool',
          firstEscalationSignalIds: ['risk_gate.command_block'],
        },
        detectorOpportunity: {
          signalClass: 'risk_gate',
          expectedForM3: true,
          observedReasonCodes: ['pollux.escalation.risk_gate_block'],
          matchedExpectedSignalClass: true,
        },
        escalationEvents: [
          {
            turnId: 'prompt:1',
            reasonCode: 'pollux.escalation.risk_gate_block',
            escalationTiming: 'next_turn',
            outcome: 'consulted',
            sameTurnDowngraded: false,
            pauseBoundary: 'pre_tool',
            contributingSignalIds: ['risk_gate.command_block'],
            failureKind: null,
            eventIndex: 14,
          },
        ],
        escalationTiming: ['next_turn'],
        reasonCodes: ['pollux.escalation.risk_gate_block'],
        advisorConsultOutcome: 'not_expected',
      }),
    ];

    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      runs,
      [],
    );

    const condition = summary.conditionSummaries.find(
      (entry) => entry.conditionId === 'F',
    );
    expect(condition).toMatchObject({
      validSamples: 0,
      totalTokens: 0,
      advisorCalls: 0,
      allSamples: {
        totalTokens: 1000,
        advisorTokens: 200,
        totalCostUsd: 0.1234,
        advisorCalls: 1,
        escalationAttempts: 1,
        rawOraclePasses: 1,
        ceilingInvalidations: 1,
        meanModelResponses: 9,
      },
    });
    expect(summary.invalidationSummary.byCondition['F']).toEqual({
      model_call_ceiling_exceeded: 1,
    });
    expect(summary.runDiagnostics[0]).toMatchObject({
      sampleId: 'f-ceiling-1',
      actualAdvisorConsultOutcome: 'consulted',
      advisorConsultOutcome: 'consulted',
      signalClass: 'risk_gate',
      m3Opportunity: true,
      firstAdvisorCallModelResponseOrdinal: 8,
      executorResponsesBeforeFirstAdvisor: 7,
      executorResponsesAfterFirstAdvisor: 1,
    });

    const markdown = renderRealBenchmarkCampaignReport(summary);
    expect(markdown).toContain('All-sample condition diagnostics');
    expect(markdown).toContain('model_call_ceiling_exceeded=1');
    expect(markdown).toContain(
      '| F | 1 | 1 | 1 | 0 | 0 | 1000 | 200 | $0.1234 | 1 | 1 | 9 |',
    );
    expect(markdown).toContain('| F | core | M3-BM-20-GUARDED-REGISTRY-RENAME');
    expect(markdown).toContain(
      '| 9 | 6 | 3 | 1000 | 200 | $0.1234 | 1 | 1 | risk_gate | yes | 8 | 7/1 | consulted |',
    );
  });
});

describe('buildRealBenchmarkPolluxV1CalibrationSummary', () => {
  it('rejects FD-containing calibration inputs', () => {
    expect(() =>
      buildRealBenchmarkPolluxV1CalibrationSummary({
        calibrationId: 'pollux-v1_1-calibration-unit',
        corpusSha: 'corpus',
        taskIds: ['pollux-v1-cross-contract-easy-01'],
        runs: [
          buildRun({
            taskId: 'pollux-v1-cross-contract-easy-01',
            conditionId: 'FD',
          }),
        ],
      }),
    ).toThrow(/only accepts A\/E runs/);
  });

  it('flags cheap A-pass hard tasks for label review', () => {
    const taskId = 'pollux-v1-test-intent-hard-01';
    const summary = buildRealBenchmarkPolluxV1CalibrationSummary({
      calibrationId: 'pollux-v1_1-calibration-unit',
      corpusSha: 'corpus',
      taskIds: [taskId],
      runs: [
        buildRun({
          taskId,
          conditionId: 'A',
          taskEscalates: false,
          observedAdvisorCalls: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
          tokens: { total: 10_000, advisor: 0, executor: 10_000 },
          modelResponseCount: 2,
        }),
        buildRun({
          taskId,
          conditionId: 'E',
          taskEscalates: false,
          observedAdvisorCalls: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
          tokens: { total: 12_000, advisor: 0, executor: 12_000 },
          modelResponseCount: 2,
        }),
      ],
    });

    expect(summary.taskSummaries[0].verdict).toBe('too_easy');
    expect(buildRealBenchmarkPolluxV1LabelReview(summary)).toHaveLength(1);
  });

  it('flags E failures on easy controls as flakiness or ambiguity risk', () => {
    const taskId = 'pollux-v1-cross-contract-easy-01';
    const summary = buildRealBenchmarkPolluxV1CalibrationSummary({
      calibrationId: 'pollux-v1_1-calibration-unit',
      corpusSha: 'corpus',
      taskIds: [taskId],
      runs: [
        buildRun({
          taskId,
          conditionId: 'A',
          taskEscalates: false,
          observedAdvisorCalls: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
        }),
        buildRun({
          taskId,
          conditionId: 'E',
          taskEscalates: false,
          observedAdvisorCalls: 0,
          oraclePass: false,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
        }),
      ],
    });

    expect(summary.taskSummaries[0].verdict).toBe('flaky_or_invalid');
  });

  it('renders summary markdown for fixture run records', () => {
    const taskId = 'pollux-v1-source-truth-easy-01';
    const summary = buildRealBenchmarkPolluxV1CalibrationSummary({
      calibrationId: 'pollux-v1_1-calibration-unit',
      corpusSha: 'corpus',
      taskIds: [taskId],
      runs: [
        buildRun({
          taskId,
          conditionId: 'A',
          taskEscalates: false,
          observedAdvisorCalls: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
        }),
        buildRun({
          taskId,
          conditionId: 'E',
          taskEscalates: false,
          observedAdvisorCalls: 0,
          escalationEvents: [],
          escalationTiming: [],
          reasonCodes: [],
        }),
      ],
    });

    const markdown = renderRealBenchmarkPolluxV1CalibrationReport(summary);

    expect(summary.verdictCounts.label_confirmed).toBe(1);
    expect(markdown).toContain('# Pollux v1.1 A/E Calibration Report');
    expect(markdown).toContain(taskId);
  });
});

describe('renderRealBenchmarkCampaignReport', () => {
  it('renders escalation sections in markdown', () => {
    const summary = buildRealBenchmarkCampaignSummary(
      manifest,
      'corpus',
      [buildRun({ sampleId: 'render' })],
      [],
    );

    const markdown = renderRealBenchmarkCampaignReport(summary);
    expect(markdown).toContain('## 3) Core lane');
    expect(markdown).toContain('## 4) Stress lane');
    expect(markdown).toContain('## 5) Canary lane');
    expect(markdown).toContain('## 6) Canary reliability');
    expect(markdown).toContain('## 9) Escalation confusion matrix');
    expect(markdown).toContain('## 10) Escalation timing split');
    expect(markdown).toContain('## 11) Per-sample diagnostics');
    expect(markdown).toContain('Desired outcome');
    expect(markdown).toContain('Consult outcome');
  });
});
