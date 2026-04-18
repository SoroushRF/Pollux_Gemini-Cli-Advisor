/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { BENCHMARK_CORPUS, type BenchmarkTask } from '@google/gemini-cli-core';
import type { BenchmarkCondition } from './benchmark-harness.js';
import {
  BenchmarkHarness,
  type BenchmarkRunMetadata,
} from './benchmark-harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const fixtureDirectory = join(__dirname, 'fixtures', 'pollux-benchmark');
export const POLLUX_SMOKE_ARTIFACT_PATH = join(
  repoRoot,
  'docs',
  'core',
  'pollux',
  'P4-03_SMOKE_BENCHMARK_REPRODUCIBILITY.md',
);

export interface PolluxSmokeCellRun {
  taskId: string;
  conditionId: string;
  fakeResponsesPath: string;
  runs: BenchmarkRunMetadata[];
  stableFingerprint: string;
  reproducible: boolean;
}

export interface PolluxSmokeBenchmarkReport {
  generatedAt: string;
  repeatCount: number;
  cells: PolluxSmokeCellRun[];
  reproducible: boolean;
}

const SMOKE_TASK_IDS = ['CAL-BM-01-SIMPLE', 'CAL-BM-02-MODERATE'] as const;

const SMOKE_CONDITIONS: BenchmarkCondition[] = [
  {
    id: 'A',
    executorModel: 'gemini-2.5-flash',
  },
  {
    id: 'E',
    executorModel: 'gemini-3-pro-preview',
  },
];

const SMOKE_FIXTURES: Record<string, string> = {
  'CAL-BM-01-SIMPLE': join(fixtureDirectory, 'CAL-BM-01-SIMPLE.responses'),
  'CAL-BM-02-MODERATE': join(fixtureDirectory, 'CAL-BM-02-MODERATE.responses'),
};

function getSmokeTask(taskId: string): BenchmarkTask {
  const task = BENCHMARK_CORPUS.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Smoke benchmark task not found: ${taskId}`);
  }
  return task;
}

function normalizeRun(result: BenchmarkRunMetadata) {
  return {
    valid: result.valid,
    invalidationReason: result.invalidationReason ?? null,
    fairnessPins: result.fairnessPins,
    accuracyPass: result.metrics.accuracyPass,
    tokens: result.metrics.tokens,
  };
}

function fingerprintRun(result: BenchmarkRunMetadata): string {
  const normalized = normalizeRun(result);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

function compareStableRuns(
  first: BenchmarkRunMetadata,
  second: BenchmarkRunMetadata,
): boolean {
  return fingerprintRun(first) === fingerprintRun(second);
}

export async function runPolluxSmokeBenchmark(
  repeatCount = 2,
): Promise<PolluxSmokeBenchmarkReport> {
  const cells: PolluxSmokeCellRun[] = [];

  for (const taskId of SMOKE_TASK_IDS) {
    const task = getSmokeTask(taskId);
    const fakeResponsesPath = SMOKE_FIXTURES[task.id];

    if (!existsSync(fakeResponsesPath)) {
      throw new Error(`Missing smoke response fixture: ${fakeResponsesPath}`);
    }

    for (const condition of SMOKE_CONDITIONS) {
      const runs: BenchmarkRunMetadata[] = [];

      for (let index = 0; index < repeatCount; index++) {
        const harness = new BenchmarkHarness();
        const result = await harness.runBenchmark(task, condition, {
          fakeResponsesPath,
        });
        runs.push(result);
      }

      const reproducible =
        runs.length >= 2 &&
        runs
          .slice(1)
          .every((result, index) => compareStableRuns(runs[index]!, result));

      cells.push({
        taskId: task.id,
        conditionId: condition.id,
        fakeResponsesPath,
        runs,
        stableFingerprint: fingerprintRun(runs[0]!),
        reproducible,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    repeatCount,
    cells,
    reproducible: cells.every((cell) => cell.reproducible),
  };
}

export function renderPolluxSmokeBenchmarkReport(
  report: PolluxSmokeBenchmarkReport,
): string {
  const lines: string[] = [];
  lines.push('# P4-03 Smoke Benchmark Reproducibility Report');
  lines.push('');
  lines.push('Version: 1.0');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('Status: Done');
  lines.push('TG mapping: TG-1');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Scope');
  lines.push('');
  lines.push(
    'This artifact records the P4-03 smoke benchmark run over a small A/E matrix using deterministic fake responses. The benchmark validates reproducibility by comparing stable run projections across repeated executions.',
  );
  lines.push('');
  lines.push('## 2) Smoke matrix');
  lines.push('');
  lines.push(
    '| Task | Condition | Repeats | Reproducible | Stable fingerprint |',
  );
  lines.push('| --- | --- | ---: | --- | --- |');
  for (const cell of report.cells) {
    lines.push(
      `| ${cell.taskId} | ${cell.conditionId} | ${cell.runs.length} | ${cell.reproducible ? 'yes' : 'no'} | ${cell.stableFingerprint} |`,
    );
  }
  lines.push('');
  lines.push('## 3) Run details');
  lines.push('');
  for (const cell of report.cells) {
    lines.push(`### ${cell.taskId} / ${cell.conditionId}`);
    lines.push('');
    lines.push(`- Fake responses: ${cell.fakeResponsesPath}`);
    lines.push(
      `- Stable reproducibility: ${cell.reproducible ? 'passed' : 'failed'}`,
    );
    cell.runs.forEach((run, index) => {
      lines.push(
        `- Run ${index + 1}: valid=${run.valid}, accuracy=${run.metrics.accuracyPass}, tokens(total/advisor/executor)=${run.metrics.tokens.total}/${run.metrics.tokens.advisor}/${run.metrics.tokens.executor}, latencyMs=${run.metrics.latencyMs.toFixed(1)}`,
      );
    });
    lines.push('');
  }
  lines.push('## 4) Conclusion');
  lines.push('');
  lines.push(
    report.reproducible
      ? 'The smoke matrix is reproducible: every repeated run produced the same stable projection for validity, fairness pins, accuracy, and token accounting.'
      : 'The smoke matrix is not reproducible: at least one cell changed its stable projection across repeated executions.',
  );
  lines.push('');
  lines.push('## 5) Reproducibility rule');
  lines.push('');
  lines.push(
    'Stable projection = valid flag, invalidation reason, fairness pins, accuracy result, and token totals. Latency is recorded for observability but excluded from reproducibility comparison because it is expected to vary.',
  );
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const report = await runPolluxSmokeBenchmark();
  const artifact = renderPolluxSmokeBenchmarkReport(report);

  mkdirSync(dirname(POLLUX_SMOKE_ARTIFACT_PATH), { recursive: true });
  writeFileSync(POLLUX_SMOKE_ARTIFACT_PATH, artifact, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${POLLUX_SMOKE_ARTIFACT_PATH}`);
  // eslint-disable-next-line no-console
  console.log(
    report.reproducible
      ? 'Smoke benchmark reproducibility: PASS'
      : 'Smoke benchmark reproducibility: FAIL',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  void main();
}

export const POLLUX_SMOKE_CONDITIONS = SMOKE_CONDITIONS;
