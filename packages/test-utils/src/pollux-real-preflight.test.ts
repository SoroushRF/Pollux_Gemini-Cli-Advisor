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
import { summarizeRealBenchmarkTelemetry } from './pollux-live-run-rig.js';

describe('buildRealBenchmarkCorpusStats', () => {
  it('captures the seed-corpus methodology gaps honestly', () => {
    const stats = buildRealBenchmarkCorpusStats(REAL_BENCHMARK_SEED_CORPUS);

    expect(stats.totalTasks).toBe(6);
    expect(stats.difficultyCounts).toEqual({
      simple: 2,
      moderate: 2,
      complex: 2,
    });
    expect(stats.escalatingCount).toBe(2);
    expect(stats.nonEscalatingCount).toBe(4);
    expect(stats.tasksMissingPositiveFixtures.length).toBeGreaterThan(0);
    expect(stats.tasksMissingNegativeFixtures.length).toBeGreaterThan(0);
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
    expect(report.publishabilityBlockers.join('\n')).toContain(
      'Corpus currently has 6 tasks',
    );
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
    ]);

    expect(summary.promptIds).toEqual(['prompt-1']);
    expect(summary.responseIds).toEqual(['response-1']);
    expect(summary.advisorCalls).toBe(1);
    expect(summary.tokens).toEqual({
      total: 380,
      advisor: 80,
      executor: 300,
    });
  });
});
