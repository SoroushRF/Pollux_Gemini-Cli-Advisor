/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  PILOT_SENTINEL_TASK_IDS,
  REAL_BENCHMARK_SEED_CORPUS,
} from '../../core/src/pollux/benchmark/realTasks.js';
import { buildDefaultCampaignManifest } from './pollux-real-config.js';
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

    expect(stats.totalTasks).toBe(24);
    expect(stats.difficultyCounts).toEqual({
      simple: 8,
      moderate: 8,
      complex: 8,
    });
    expect(stats.escalatingCount).toBe(8);
    expect(stats.nonEscalatingCount).toBe(16);
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
    ]);

    expect(summary.promptIds).toEqual(['prompt-1']);
    expect(summary.responseIds).toEqual(['response-1']);
    expect(summary.advisorCalls).toBe(1);
    expect(summary.tokens).toEqual({
      total: 380,
      advisor: 80,
      executor: 300,
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
  });
});
