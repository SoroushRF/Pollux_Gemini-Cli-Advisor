/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  M3_VALUE_CANDIDATE_TASK_IDS,
  PILOT_SENTINEL_TASK_IDS,
  REAL_BENCHMARK_SEED_CORPUS,
} from '../../core/src/pollux/benchmark/realTasks.js';
import {
  buildDefaultCampaignManifest,
  buildRealBenchmarkSettings,
  getPolluxRealConditionsById,
} from './pollux-real-config.js';
import {
  buildRealBenchmarkCorpusStats,
  buildRealBenchmarkPreflightReport,
} from './pollux-real-preflight.js';
import {
  classifyRealBenchmarkProcessFailure,
  summarizeRealBenchmarkTelemetry,
} from './pollux-live-run-rig.js';

describe('buildRealBenchmarkCorpusStats', () => {
  it('captures the seed-corpus methodology gaps honestly', () => {
    const stats = buildRealBenchmarkCorpusStats(REAL_BENCHMARK_SEED_CORPUS);

    expect(M3_VALUE_CANDIDATE_TASK_IDS).toHaveLength(42);
    expect(stats.totalTasks).toBe(48);
    expect(stats.difficultyCounts).toEqual({
      simple: 9,
      moderate: 14,
      complex: 25,
    });
    expect(stats.escalatingCount).toBe(8);
    expect(stats.nonEscalatingCount).toBe(40);
    expect(stats.tasksMissingPositiveFixtures).toEqual([]);
    expect(stats.tasksMissingNegativeFixtures).toEqual([]);
  });
});

describe('buildRealBenchmarkPreflightReport', () => {
  it('keeps pilot runs runnable while still flagging publishability blockers', () => {
    const manifest = buildDefaultCampaignManifest('pilot-check', [
      ...PILOT_SENTINEL_TASK_IDS,
    ]);

    const report = buildRealBenchmarkPreflightReport(
      manifest,
      REAL_BENCHMARK_SEED_CORPUS,
      undefined,
      process.execPath,
    );

    expect(report.runBlockers).toHaveLength(0);
    expect(report.publishabilityBlockers.length).toBeGreaterThan(0);
    expect(report.publishabilityBlockers.join('\n')).not.toContain(
      'Corpus currently has 6 tasks',
    );
    expect(report.publishabilityBlockers.join('\n')).not.toContain(
      'Corpus is missing required domains',
    );
    expect(report.publishabilityBlockers.join('\n')).not.toContain(
      'Tasks missing positive fixtures',
    );
    expect(report.publishabilityBlockers.join('\n')).not.toContain(
      'Tasks missing the required three negative fixtures',
    );
    expect(report.publishabilityBlockers.join('\n')).toContain(
      'A frozen pricing snapshot is required before reporting real-model USD costs.',
    );
    expect(report.publishabilityBlockers.join('\n')).not.toContain(
      'reason-code and timing breakdowns',
    );
    expect(report.selfReportSmokeTest).toEqual({
      validStatusTagParsed: true,
      malformedStatusTagRejected: true,
      validStatusTagStripped: true,
    });
  });
});

describe('classifyRealBenchmarkProcessFailure', () => {
  it('classifies capacity exhaustion before generic OAuth/auth stack text', () => {
    const classified = classifyRealBenchmarkProcessFailure(
      3221225786,
      'OAuth2Client.requestAsync failed: 429 RESOURCE_EXHAUSTED MODEL_CAPACITY_EXHAUSTED No capacity available for model gemini-2.5-flash',
    );

    expect(classified.reason).toBe('model_capacity_exhausted');
    expect(classified.evidence).toMatchObject({
      exitCode: 3221225786,
      exitCodeHex: '0xC000013A',
      matchedReason: 'RESOURCE_EXHAUSTED',
    });
  });

  it('classifies plain credential failures as auth failures', () => {
    expect(
      classifyRealBenchmarkProcessFailure(
        1,
        'Please login again: credential expired',
      ).reason,
    ).toBe('auth_failure');
  });
});

describe('summarizeRealBenchmarkTelemetry', () => {
  it('reuses role-tagged telemetry for advisor/executor separation', () => {
    const summary = summarizeRealBenchmarkTelemetry([
      {
        attributes: {
          'event.name': 'gemini_cli.api_request',
          prompt_id: 'prompt-1',
        },
      },
      {
        attributes: {
          'event.name': 'gemini_cli.api_response',
          prompt_id: 'prompt-1',
          model: 'gemini-2.5-flash',
          role: 'main',
          duration_ms: 120,
          total_token_count: 300,
          input_token_count: 200,
          output_token_count: 100,
          cached_content_token_count: 0,
        },
      },
      {
        attributes: {
          'event.name': 'gemini_cli.api_response',
          prompt_id: 'prompt-1',
          model: 'gemini-3-pro-preview',
          role: 'utility_advisor',
          duration_ms: 90,
          total_token_count: 80,
          input_token_count: 50,
          output_token_count: 30,
          cached_content_token_count: 0,
        },
      },
      {
        attributes: {
          'event.name': 'gen_ai.client.inference.operation.details',
          'gen_ai.response.id': 'response-1',
        },
      },
      {
        attributes: {
          'event.name': 'gemini_cli.pollux_escalation',
          turn_id: 'prompt-1:1',
          reason_code: 'pollux.escalation.self_report_stuck',
          escalation_timing: 'same_turn',
          outcome: 'consulted',
          same_turn_downgraded: false,
          pause_boundary: 'post_event',
          contributing_signal_ids: '["self.structured_status_stuck"]',
        },
      },
      {
        attributes: {
          'event.name': 'gemini_cli.pollux_advisor_attempt',
          turn_id: 'prompt-1:1',
          reason_code: 'pollux.escalation.self_report_stuck',
          escalation_timing: 'same_turn',
          attempt_index: 1,
          attempt_kind: 'primary',
          model: 'gemini-3-pro-preview',
          parser_outcome: 'direct',
          outcome: 'consulted',
          advisor_executor_profile: 'flash_lite',
          output_finish_reason: 'MAX_TOKENS',
          visible_output_tokens: 12,
          thought_tokens: 68,
          truncated: true,
          guidance_too_short: true,
        },
      },
      {
        attributes: {
          'event.name': 'gemini_cli.pollux_advisor_guidance',
          turn_id: 'prompt-1:1',
          reason_code: 'pollux.escalation.self_report_stuck',
          escalation_timing: 'same_turn',
          injection_timing: 'same_turn_next_continuation',
          guidance_chars: 32,
          guidance_words: 5,
          parser_outcome: 'direct',
          advisor_trigger_mode: 'hybrid',
          advisor_trigger_source: 'self_status',
          model: 'gemini-3-pro-preview',
          attempt_kind: 'primary',
          advisor_executor_profile: 'flash_lite',
          guidance_quality: 'too_short',
        },
      },
    ]);

    expect(summary.promptIds).toEqual(['prompt-1']);
    expect(summary.responseIds).toEqual(['response-1']);
    expect(summary.advisorCalls).toBe(1);
    expect(summary.advisorAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attemptIndex: 1,
          attemptKind: 'primary',
          parserOutcome: 'direct',
          outcome: 'consulted',
          advisorExecutorProfile: 'flash_lite',
          outputFinishReason: 'MAX_TOKENS',
          visibleOutputTokens: 12,
          thoughtTokens: 68,
          truncated: true,
          guidanceTooShort: true,
        }),
      ]),
    );
    expect(summary.tokens).toEqual({
      total: 380,
      advisor: 80,
      executor: 300,
    });
    expect(summary.modelCallBreakdown).toEqual({
      totalApiResponses: 2,
      totalResponseIds: 1,
      byRole: {
        main: 1,
        utility_advisor: 1,
      },
      tokensByRole: {
        main: 300,
        utility_advisor: 80,
      },
      byModel: {
        'gemini-2.5-flash': 1,
        'gemini-3-pro-preview': 1,
      },
      tokensByModel: {
        'gemini-2.5-flash': 300,
        'gemini-3-pro-preview': 80,
      },
    });
    expect(summary.escalationEvents).toHaveLength(1);
    expect(summary.escalationEvents[0]).toMatchObject({
      turnId: 'prompt-1:1',
      reasonCode: 'pollux.escalation.self_report_stuck',
      escalationTiming: 'same_turn',
      outcome: 'consulted',
      pauseBoundary: 'post_event',
      contributingSignalIds: ['self.structured_status_stuck'],
    });
    expect(summary.advisorGuidanceEvents).toEqual([
      expect.objectContaining({
        guidanceChars: 32,
        guidanceWords: 5,
        parserOutcome: 'direct',
        advisorTriggerMode: 'hybrid',
        advisorTriggerSource: 'self_status',
        injectionTiming: 'same_turn_next_continuation',
        advisorExecutorProfile: 'flash_lite',
        guidanceQuality: 'too_short',
      }),
    ]);
  });

  it('reports official estimated cost with thinking tokens while preserving legacy cost', () => {
    const summary = summarizeRealBenchmarkTelemetry(
      [
        {
          attributes: {
            'event.name': 'gemini_cli.api_response',
            prompt_id: 'prompt-1',
            model: 'gemini-3.1-flash-lite-preview',
            role: 'main',
            duration_ms: 120,
            total_token_count: 200,
            input_token_count: 100,
            output_token_count: 40,
            thoughts_token_count: 60,
            cached_content_token_count: 0,
          },
        },
      ],
      {
        id: 'unit-lite-pricing',
        capturedAt: '2026-04-30T00:00:00.000Z',
        sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
        models: {
          'gemini-3.1-flash-lite-preview': {
            inputUsdPerMillion: 0.25,
            outputUsdPerMillion: 1.5,
            cachedInputUsdPerMillion: 0.025,
          },
        },
      },
    );

    expect(summary.costUsd.total).toBeCloseTo(0.000175, 12);
    expect(summary.costUsd.executor).toBeCloseTo(0.000175, 12);
    expect(summary.costUsd.benchmarkLegacyTotal).toBeCloseTo(0.000085, 12);
    expect(summary.costUsd.officialEstimatedTotal).toBeCloseTo(
      summary.costUsd.total ?? 0,
      12,
    );
  });
});

describe('Pollux real benchmark sham controls', () => {
  it('exposes FS as a non-publishable sham advisor control lane', () => {
    const [condition] = getPolluxRealConditionsById(['FS']);
    expect(condition).toMatchObject({
      id: 'FS',
      executorModel: 'gemini-3-flash-preview',
      advisorModel: 'gemini-3.1-pro-preview',
      advisorFallbackModel: null,
      polluxEnabled: true,
      publishableEligible: false,
    });

    const settings = buildRealBenchmarkSettings(condition, 'telemetry.jsonl');
    expect(settings.experimental.pollux).toMatchObject({
      enabled: true,
      advisorTriggerMode: 'hybrid',
      advisorShamEnabled: true,
      advisorShamGuidance:
        '1. Continue with the best supported plan. 2. Verify with the existing oracle.',
    });
  });
});

describe('Pollux real benchmark trigger-mode diagnostics', () => {
  it('exposes executor-request and detector-only advisor lanes as opt-in diagnostics', () => {
    const conditions = getPolluxRealConditionsById(['FR', 'FD', 'LFR', 'LFD']);

    expect(conditions).toEqual([
      expect.objectContaining({
        id: 'FR',
        executorModel: 'gemini-3-flash-preview',
        advisorModel: 'gemini-3.1-pro-preview',
        advisorFallbackModel: null,
        polluxEnabled: true,
        publishableEligible: false,
      }),
      expect.objectContaining({
        id: 'FD',
        executorModel: 'gemini-3-flash-preview',
        advisorModel: 'gemini-3.1-pro-preview',
        advisorFallbackModel: null,
        polluxEnabled: true,
        publishableEligible: false,
      }),
      expect.objectContaining({
        id: 'LFR',
        executorModel: 'gemini-3.1-flash-lite-preview',
        advisorModel: 'gemini-3.1-pro-preview',
        advisorFallbackModel: 'gemini-3-flash-preview',
        polluxEnabled: true,
        publishableEligible: false,
      }),
      expect.objectContaining({
        id: 'LFD',
        executorModel: 'gemini-3.1-flash-lite-preview',
        advisorModel: 'gemini-3.1-pro-preview',
        advisorFallbackModel: 'gemini-3-flash-preview',
        polluxEnabled: true,
        publishableEligible: false,
      }),
    ]);

    expect(
      conditions.map(
        (condition) =>
          buildRealBenchmarkSettings(condition, 'telemetry.jsonl').experimental
            .pollux.advisorTriggerMode,
      ),
    ).toEqual(['executor_request', 'detector', 'executor_request', 'detector']);
    expect(
      conditions.map(
        (condition) =>
          buildRealBenchmarkSettings(condition, 'telemetry.jsonl').experimental
            .pollux.advisorExecutorProfile,
      ),
    ).toEqual([undefined, undefined, 'flash_lite', 'flash_lite']);
  });

  it('keeps trigger-mode diagnostics out of the default manifest', () => {
    const manifest = buildDefaultCampaignManifest('default-check', [
      'M3-BM-01-CROSS-FILE-EXPORT-FIX',
    ]);

    expect(manifest.conditions.map((condition) => condition.id)).toEqual([
      'A',
      'E',
      'F',
      'L',
      'LF',
    ]);
  });
});
