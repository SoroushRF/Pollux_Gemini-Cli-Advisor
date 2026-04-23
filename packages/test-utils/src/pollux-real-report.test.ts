/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildRealBenchmarkCampaignSummary,
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
    expect(markdown).toContain('## 3) Escalation confusion matrix');
    expect(markdown).toContain('## 4) Escalation timing split');
    expect(markdown).toContain('## 5) Reason-code distribution');
  });
});
