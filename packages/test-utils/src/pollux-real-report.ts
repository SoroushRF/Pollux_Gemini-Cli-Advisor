/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  RealBenchmarkCampaignManifest,
  RealBenchmarkCampaignSummary,
  RealBenchmarkConditionId,
  RealBenchmarkConditionSummary,
  RealBenchmarkRunRecord,
} from './pollux-real-types.js';

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length !== values.length) {
    return null;
  }
  return present.reduce((sum, value) => sum + value, 0);
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
    totalTokens: validRuns.reduce((sum, run) => sum + run.tokens.total, 0),
    advisorTokens: validRuns.reduce((sum, run) => sum + run.tokens.advisor, 0),
    executorTokens: validRuns.reduce(
      (sum, run) => sum + run.tokens.executor,
      0,
    ),
    totalCostUsd: sumNullable(validRuns.map((run) => run.costUsd.total)),
    meanWallClockMs: mean(validRuns.map((run) => run.wallClockMs)),
    meanServiceLatencyMs: mean(serviceLatencies),
  };
}

export function buildRealBenchmarkCampaignSummary(
  manifest: RealBenchmarkCampaignManifest,
  corpusSha: string,
  runs: RealBenchmarkRunRecord[],
  publishabilityBlockers: string[],
): RealBenchmarkCampaignSummary {
  return {
    generatedAt: new Date().toISOString(),
    manifest,
    corpusSha,
    sampleCount: runs.length,
    validSampleCount: runs.filter((run) => !run.invalidated).length,
    invalidSampleCount: runs.filter((run) => run.invalidated).length,
    conditionSummaries: manifest.conditions.map((condition) =>
      buildConditionSummary(
        condition.id,
        runs.filter((run) => run.conditionId === condition.id),
      ),
    ),
    publishabilityBlockers,
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatNullableCurrency(value: number | null): string {
  return value === null ? 'n/a' : `$${value.toFixed(4)}`;
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
  lines.push('');
  lines.push('## 2) Condition summaries');
  lines.push('');
  lines.push(
    '| Condition | Samples | Valid | Invalid | Accuracy | Advisor calls | Total tokens | Advisor tokens | Executor tokens | Estimated cost | Mean wall ms | Mean service ms |',
  );
  lines.push(
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const condition of summary.conditionSummaries) {
    lines.push(
      `| ${condition.conditionId} | ${condition.sampleCount} | ${condition.validSamples} | ${condition.invalidSamples} | ${(condition.accuracy * 100).toFixed(1)}% | ${condition.advisorCalls} | ${condition.totalTokens} | ${condition.advisorTokens} | ${condition.executorTokens} | ${formatNullableCurrency(condition.totalCostUsd)} | ${formatNumber(condition.meanWallClockMs)} | ${formatNumber(condition.meanServiceLatencyMs)} |`,
    );
  }
  lines.push('');
  lines.push('## 3) Publishability verdict');
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
