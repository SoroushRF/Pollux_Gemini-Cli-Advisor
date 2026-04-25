/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildPolluxRealAcceptanceSummary,
  buildPolluxRealM2AcceptanceThresholds,
} from './pollux-real-acceptance.js';
import type { RealBenchmarkCampaignSummary } from './pollux-real-types.js';

function buildCampaignSummary(
  campaignId: string,
  overrides: Partial<RealBenchmarkCampaignSummary> = {},
): RealBenchmarkCampaignSummary {
  return {
    generatedAt: '2026-04-24T00:00:00.000Z',
    manifest: {
      campaignId,
      mode: 'pilot',
      runVenue: 'local',
      authIsolationMode: 'single_account',
      repeatsPerCell: 3,
      conditions: [
        {
          id: 'F',
          executorModel: 'gemini-3-flash-preview',
          advisorModel: 'gemini-3.1-pro-preview',
          advisorFallbackModel: 'gemini-2.5-pro',
          polluxEnabled: true,
          settingsOverrides: {},
          authProfile: 'pollux',
          publishableEligible: true,
        },
      ],
      canonicalSurface: 'headless_non_interactive_cli',
      selectedTaskIds: ['CAL-BM-04-ESCALATING'],
    },
    corpusSha: 'corpus',
    sampleCount: 6,
    validSampleCount: 6,
    invalidSampleCount: 0,
    conditionSummaries: [],
    laneConditionSummaries: [
      {
        lane: 'core',
        conditionId: 'F',
        sampleCount: 0,
        validSamples: 0,
        invalidSamples: 0,
        oraclePassCount: 0,
        desiredOutcomeSatisfiedCount: 0,
        desiredOutcomeSatisfactionRate: 0,
        advisorCalls: 0,
        escalationAttempts: 0,
        totalTokens: 0,
        advisorTokens: 0,
        executorTokens: 0,
        meanWallClockMs: 0,
        meanServiceLatencyMs: 0,
      },
    ],
    canaryConsultSummary: {
      expectedPositiveSampleCount: 6,
      validExpectedPositiveSampleCount: 6,
      attempted: 6,
      consulted: 6,
      failOpen: 0,
      budgetExhausted: 0,
      policyDenied: 0,
      notAttempted: 0,
      consultSuccessRate: 1,
      consultSuccessWilson95: {
        n: 6,
        proportion: 1,
        lower: 0.61,
        upper: 1,
      },
    },
    repeatSummaries: [],
    cellAggregateSummaries: [],
    canaryReliabilitySummary: {
      expectedPositiveSampleCount: 6,
      validExpectedPositiveSampleCount: 6,
      consultedCount: 6,
      failOpenCount: 0,
      parseErrorCount: 0,
      falseNegativeCount: 0,
      budgetExhaustedCount: 0,
      consultSuccessRate: 1,
      consultSuccessWilson95: {
        n: 6,
        proportion: 1,
        lower: 0.61,
        upper: 1,
      },
      attemptPathCounts: {
        primarySuccess: 4,
        repairRetrySuccess: 1,
        fallbackSuccess: 1,
        finalFailOpen: 0,
      },
      failureKindCounts: {},
    },
    stressSummary: {
      sampleCount: 0,
      validSampleCount: 0,
      invalidSampleCount: 0,
      modelCallCeilingExceededCount: 0,
      invalidationReasonCounts: {},
      meanModelResponseCount: 0,
      meanTotalTokens: 0,
    },
    escalation: {
      includedSampleCount: 6,
      predictedPositive: 6,
      expectedPositive: 6,
      truePositive: 6,
      falsePositive: 0,
      falseNegative: 0,
      trueNegative: 0,
      precision: 1,
      recall: 1,
      exclusionCounts: {
        budgetExhausted: 0,
        failOpen: 0,
      },
    },
    escalationTiming: [],
    reasonCodeCounts: {},
    runDiagnostics: [],
    buildFreshness: undefined,
    publishabilityBlockers: [],
    ...overrides,
  };
}

describe('buildPolluxRealAcceptanceSummary', () => {
  it('passes when pooled canary reliability clears the M2 thresholds', () => {
    const summary = buildPolluxRealAcceptanceSummary({
      acceptanceId: 'm2-pass',
      campaignSummaries: [
        buildCampaignSummary('c01'),
        buildCampaignSummary('c02'),
        buildCampaignSummary('c03'),
        buildCampaignSummary('c04'),
        buildCampaignSummary('c05'),
      ],
      thresholds: {
        campaignCount: 5,
        repeatsPerCampaign: 3,
        expectedPositiveValidSampleCount: 30,
        minConsultSuccessRate: 0.9,
        minConsultSuccessWilson95LowerBound: 0.75,
        maxParseErrorCount: 0,
        maxFalseNegativeCount: 0,
        maxBudgetExhaustedCount: 0,
      },
    });

    expect(summary.pass).toBe(true);
    expect(summary.failedThresholds).toEqual([]);
    expect(summary.aggregateCanaryReliability.consultedCount).toBe(30);
  });

  it('fails when parse errors and false negatives breach the contract', () => {
    const summary = buildPolluxRealAcceptanceSummary({
      acceptanceId: 'm2-fail',
      campaignSummaries: [
        buildCampaignSummary('c01'),
        buildCampaignSummary('c02', {
          canaryReliabilitySummary: {
            ...buildCampaignSummary('tmp').canaryReliabilitySummary,
            consultedCount: 4,
            parseErrorCount: 2,
            falseNegativeCount: 1,
            consultSuccessRate: 4 / 6,
            consultSuccessWilson95: {
              n: 6,
              proportion: 4 / 6,
              lower: 0.3,
              upper: 0.9,
            },
            attemptPathCounts: {
              primarySuccess: 2,
              repairRetrySuccess: 1,
              fallbackSuccess: 1,
              finalFailOpen: 2,
            },
            failureKindCounts: { parse_error: 2 },
          },
        }),
        buildCampaignSummary('c03'),
        buildCampaignSummary('c04'),
        buildCampaignSummary('c05'),
      ],
      thresholds: {
        campaignCount: 5,
        repeatsPerCampaign: 3,
        expectedPositiveValidSampleCount: 30,
        minConsultSuccessRate: 0.9,
        minConsultSuccessWilson95LowerBound: 0.75,
        maxParseErrorCount: 0,
        maxFalseNegativeCount: 0,
        maxBudgetExhaustedCount: 0,
      },
    });

    expect(summary.pass).toBe(false);
    expect(summary.failedThresholds.join('\n')).toContain('parse_error count');
    expect(summary.failedThresholds.join('\n')).toContain(
      'false_negative count',
    );
  });

  it('scales expected-positive sample thresholds for shorter paced runs', () => {
    expect(
      buildPolluxRealM2AcceptanceThresholds({
        campaignCount: 3,
        repeatsPerCampaign: 2,
        expectedPositiveCanaryTasksPerRepeat: 2,
      }).expectedPositiveValidSampleCount,
    ).toBe(12);
  });
});
