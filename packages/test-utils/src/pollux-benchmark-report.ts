/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POLLUX_FULL_CONDITIONS,
  runPolluxFullBenchmark,
  type PolluxFullBenchmarkReport,
} from './pollux-benchmark-full.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');

export const POLLUX_P405_ARTIFACT_PATH = join(
  repoRoot,
  'docs',
  'core',
  'pollux',
  'P4-05_BENCHMARK_METRICS_REPORT.md',
);

interface RateWithCi {
  value: number;
  low: number;
  high: number;
  n: number;
  successes: number;
}

interface MeanWithCi {
  mean: number;
  low: number;
  high: number;
  n: number;
}

interface BenchmarkSample {
  conditionId: string;
  advisorEnabled: boolean;
  accuracyPass: boolean;
  latencyMs: number;
  tokensTotal: number;
  tokensAdvisor: number;
  tokensExecutor: number;
  escalated: boolean;
  tokenReconciled: boolean;
}

export interface PolluxP405ConditionSummary {
  conditionId: string;
  sampleCount: number;
  accuracy: RateWithCi;
  totalTokens: MeanWithCi;
  advisorTokens: MeanWithCi;
  executorTokens: MeanWithCi;
  latencyMs: MeanWithCi;
  escalationRate: RateWithCi;
}

export interface PolluxP405TokenReconciliation {
  sampleCount: number;
  passCount: number;
  passRate: RateWithCi;
}

export interface PolluxP405EscalationSummary {
  sampleCount: number;
  predictedPositive: number;
  expectedPositive: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: RateWithCi | null;
  recall: RateWithCi | null;
}

export interface PolluxP405BenchmarkReport {
  generatedAt: string;
  sourceGeneratedAt: string;
  sourceCellCount: number;
  sampleCount: number;
  conditionSummaries: PolluxP405ConditionSummary[];
  overallAccuracy: RateWithCi;
  tokenReconciliation: PolluxP405TokenReconciliation;
  escalation: PolluxP405EscalationSummary;
}

const T95_BY_DF: Record<number, number> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
  15: 2.131,
  16: 2.12,
  17: 2.11,
  18: 2.101,
  19: 2.093,
  20: 2.086,
  21: 2.08,
  22: 2.074,
  23: 2.069,
  24: 2.064,
  25: 2.06,
  26: 2.056,
  27: 2.052,
  28: 2.048,
  29: 2.045,
  30: 2.042,
};

function tCritical95(df: number): number {
  if (df <= 0) {
    return 1.96;
  }
  if (df in T95_BY_DF) {
    return T95_BY_DF[df]!;
  }
  return 1.96;
}

function wilsonInterval(
  successes: number,
  n: number,
  z = 1.96,
): { low: number; high: number } {
  if (n === 0) {
    return { low: 0, high: 0 };
  }

  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denominator;

  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

function buildRateWithCi(successes: number, n: number): RateWithCi {
  const interval = wilsonInterval(successes, n);
  return {
    value: n > 0 ? successes / n : 0,
    low: interval.low,
    high: interval.high,
    n,
    successes,
  };
}

function buildMeanWithCi(values: number[]): MeanWithCi {
  if (values.length === 0) {
    return {
      mean: 0,
      low: 0,
      high: 0,
      n: 0,
    };
  }

  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;

  if (n === 1) {
    return {
      mean,
      low: mean,
      high: mean,
      n,
    };
  }

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const standardDeviation = Math.sqrt(variance);
  const margin = (tCritical95(n - 1) * standardDeviation) / Math.sqrt(n);

  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    n,
  };
}

function flattenSamples(source: PolluxFullBenchmarkReport): BenchmarkSample[] {
  const samples: BenchmarkSample[] = [];

  for (const cell of source.cells) {
    const advisorEnabled = cell.advisorModel !== null;

    for (const run of [cell.initialRun, cell.resumedRun]) {
      const tokens = run.metrics.tokens;
      samples.push({
        conditionId: cell.conditionId,
        advisorEnabled,
        accuracyPass: run.metrics.accuracyPass,
        latencyMs: run.metrics.latencyMs,
        tokensTotal: tokens.total,
        tokensAdvisor: tokens.advisor,
        tokensExecutor: tokens.executor,
        escalated: tokens.advisor > 0,
        tokenReconciled: tokens.total === tokens.advisor + tokens.executor,
      });
    }
  }

  return samples;
}

export function buildPolluxP405BenchmarkReport(
  source: PolluxFullBenchmarkReport,
): PolluxP405BenchmarkReport {
  const samples = flattenSamples(source);

  const conditionSummaries: PolluxP405ConditionSummary[] =
    POLLUX_FULL_CONDITIONS.map((condition) => {
      const conditionSamples = samples.filter(
        (sample) => sample.conditionId === condition.id,
      );
      const accuracySuccesses = conditionSamples.filter(
        (sample) => sample.accuracyPass,
      ).length;
      const escalations = conditionSamples.filter(
        (sample) => sample.escalated,
      ).length;

      return {
        conditionId: condition.id,
        sampleCount: conditionSamples.length,
        accuracy: buildRateWithCi(accuracySuccesses, conditionSamples.length),
        totalTokens: buildMeanWithCi(
          conditionSamples.map((sample) => sample.tokensTotal),
        ),
        advisorTokens: buildMeanWithCi(
          conditionSamples.map((sample) => sample.tokensAdvisor),
        ),
        executorTokens: buildMeanWithCi(
          conditionSamples.map((sample) => sample.tokensExecutor),
        ),
        latencyMs: buildMeanWithCi(
          conditionSamples.map((sample) => sample.latencyMs),
        ),
        escalationRate: buildRateWithCi(escalations, conditionSamples.length),
      };
    });

  const overallAccuracySuccesses = samples.filter(
    (sample) => sample.accuracyPass,
  ).length;

  const tokenReconciliationPassCount = samples.filter(
    (sample) => sample.tokenReconciled,
  ).length;

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;

  for (const sample of samples) {
    if (sample.escalated && sample.advisorEnabled) {
      truePositive += 1;
    } else if (sample.escalated && !sample.advisorEnabled) {
      falsePositive += 1;
    } else if (!sample.escalated && sample.advisorEnabled) {
      falseNegative += 1;
    } else {
      trueNegative += 1;
    }
  }

  const predictedPositive = truePositive + falsePositive;
  const expectedPositive = truePositive + falseNegative;

  return {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: source.generatedAt,
    sourceCellCount: source.cells.length,
    sampleCount: samples.length,
    conditionSummaries,
    overallAccuracy: buildRateWithCi(overallAccuracySuccesses, samples.length),
    tokenReconciliation: {
      sampleCount: samples.length,
      passCount: tokenReconciliationPassCount,
      passRate: buildRateWithCi(tokenReconciliationPassCount, samples.length),
    },
    escalation: {
      sampleCount: samples.length,
      predictedPositive,
      expectedPositive,
      truePositive,
      falsePositive,
      falseNegative,
      trueNegative,
      precision:
        predictedPositive > 0
          ? buildRateWithCi(truePositive, predictedPositive)
          : null,
      recall:
        expectedPositive > 0
          ? buildRateWithCi(truePositive, expectedPositive)
          : null,
    },
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatRateWithCi(rate: RateWithCi): string {
  return `${formatPercent(rate.value)} (${formatPercent(rate.low)} to ${formatPercent(rate.high)})`;
}

function formatMeanWithCi(mean: MeanWithCi): string {
  return `${mean.mean.toFixed(1)} (${mean.low.toFixed(1)} to ${mean.high.toFixed(1)})`;
}

export function renderPolluxP405BenchmarkReport(
  report: PolluxP405BenchmarkReport,
): string {
  const lines: string[] = [];

  lines.push('# P4-05 Benchmark Metrics Report (Token/Latency/Accuracy + CIs)');
  lines.push('');
  lines.push('Version: 1.0');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('Status: Done');
  lines.push('TG mapping: TG-1, TG-4');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Scope');
  lines.push('');
  lines.push(
    'This artifact publishes condition-level and overall benchmark metrics from the full A-E checkpoint/resume run, including 95% confidence intervals and escalation statistics.',
  );
  lines.push('');
  lines.push('## 2) Source data');
  lines.push('');
  lines.push(`- Source full benchmark timestamp: ${report.sourceGeneratedAt}`);
  lines.push(`- Source cells: ${report.sourceCellCount}`);
  lines.push(`- Run samples (initial + resumed): ${report.sampleCount}`);
  lines.push('');
  lines.push('## 3) Condition metrics (95% CI)');
  lines.push('');
  lines.push(
    '| Condition | N | Accuracy | Total tokens mean | Advisor tokens mean | Executor tokens mean | Latency ms mean | Escalation rate |',
  );
  lines.push('| --- | ---: | --- | --- | --- | --- | --- | --- |');

  for (const summary of report.conditionSummaries) {
    lines.push(
      `| ${summary.conditionId} | ${summary.sampleCount} | ${formatRateWithCi(summary.accuracy)} | ${formatMeanWithCi(summary.totalTokens)} | ${formatMeanWithCi(summary.advisorTokens)} | ${formatMeanWithCi(summary.executorTokens)} | ${formatMeanWithCi(summary.latencyMs)} | ${formatRateWithCi(summary.escalationRate)} |`,
    );
  }

  lines.push('');
  lines.push('## 4) Overall accuracy and token reconciliation');
  lines.push('');
  lines.push(
    `- Overall accuracy: ${formatRateWithCi(report.overallAccuracy)} (successes ${report.overallAccuracy.successes}/${report.overallAccuracy.n})`,
  );
  lines.push(
    `- Token reconciliation (total = advisor + executor): ${formatRateWithCi(report.tokenReconciliation.passRate)} (passes ${report.tokenReconciliation.passCount}/${report.tokenReconciliation.sampleCount})`,
  );
  lines.push('');
  lines.push('## 5) Escalation statistics');
  lines.push('');
  lines.push(
    `- Confusion counts (advisor-enabled condition as expected positive): TP=${report.escalation.truePositive}, FP=${report.escalation.falsePositive}, FN=${report.escalation.falseNegative}, TN=${report.escalation.trueNegative}`,
  );
  lines.push(
    `- Precision: ${report.escalation.precision ? formatRateWithCi(report.escalation.precision) : 'N/A (no predicted positives)'}`,
  );
  lines.push(
    `- Recall: ${report.escalation.recall ? formatRateWithCi(report.escalation.recall) : 'N/A (no expected positives)'}`,
  );
  lines.push('');
  lines.push('## 6) Conclusion');
  lines.push('');
  lines.push(
    'The P4-05 benchmark metrics report is complete, with confidence intervals for accuracy, token usage, and latency, plus escalation precision/recall and TG-4 token reconciliation evidence.',
  );
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export async function runPolluxP405BenchmarkReport(): Promise<PolluxP405BenchmarkReport> {
  const fullReport = await runPolluxFullBenchmark();
  return buildPolluxP405BenchmarkReport(fullReport);
}

async function main() {
  const report = await runPolluxP405BenchmarkReport();
  const artifact = renderPolluxP405BenchmarkReport(report);

  mkdirSync(dirname(POLLUX_P405_ARTIFACT_PATH), { recursive: true });
  writeFileSync(POLLUX_P405_ARTIFACT_PATH, artifact, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${POLLUX_P405_ARTIFACT_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  void main();
}
