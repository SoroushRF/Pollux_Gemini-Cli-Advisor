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
  taskEscalates: boolean;
  conditionId: string;
  fakeResponsesPath: string;
  runs: BenchmarkRunMetadata[];
  stableFingerprint: string;
  reproducible: boolean;
  /**
   * Maximum observed advisor call count across the repeated runs in this
   * cell. Non-zero values prove the advisor pipeline was actually invoked
   * by the smoke matrix (P4-03 senior review fix: the old smoke matrix
   * deliberately excluded advisor-enabled conditions and could never
   * exercise utility_advisor telemetry). Reproducibility requires this
   * value to be identical across all repeats.
   */
  maxObservedAdvisorCalls: number;
}

export interface PolluxSmokeBenchmarkReport {
  generatedAt: string;
  repeatCount: number;
  cells: PolluxSmokeCellRun[];
  reproducible: boolean;
  /** True when at least one cell observed an advisor call (TG-3 evidence). */
  advisorPipelineExercised: boolean;
}

// Smoke matrix is intentionally minimal but MUST exercise both the
// Pollux-off baseline (A) and at least one Pollux-on hybrid path (D) so the
// advisor pipeline is actually verified by the smoke gate. Including the
// ESCALATING task ensures the D cell observes a non-zero
// `utility_advisor` telemetry count (P4-03 senior review fix).
const SMOKE_TASK_IDS = [
  'CAL-BM-01-SIMPLE',
  'CAL-BM-02-MODERATE',
  'CAL-BM-04-ESCALATING',
] as const;

const SMOKE_CONDITIONS: BenchmarkCondition[] = [
  {
    id: 'A',
    executorModel: 'gemini-2.5-flash',
  },
  {
    id: 'D',
    executorModel: 'gemini-2.5-flash',
    advisorModel: 'gemini-3-pro-preview',
    strategy: 'hybrid',
  },
  {
    id: 'E',
    executorModel: 'gemini-3-pro-preview',
  },
];

const SMOKE_FIXTURES: Record<string, string> = {
  'CAL-BM-01-SIMPLE': join(fixtureDirectory, 'CAL-BM-01-SIMPLE.responses'),
  'CAL-BM-02-MODERATE': join(fixtureDirectory, 'CAL-BM-02-MODERATE.responses'),
  'CAL-BM-04-ESCALATING': join(
    fixtureDirectory,
    'CAL-BM-04-ESCALATING.responses',
  ),
};

/**
 * Pollux-enabled fixture overrides. When a smoke condition has an advisor
 * model configured AND the task escalates the detector, the harness must
 * replay an advisor `generateContent` response BEFORE the executor's
 * `generateContentStream` responses, otherwise the executor consumes the
 * advisor JSON as plain text and the run silently degrades to the
 * Pollux-off path. Only the ESCALATING task currently needs this override
 * because no other smoke task trips the detector.
 */
const SMOKE_FIXTURES_ADVISOR: Record<string, string> = {
  'CAL-BM-04-ESCALATING': join(
    fixtureDirectory,
    'CAL-BM-04-ESCALATING.advisor.responses',
  ),
};

function resolveSmokeFixturePath(
  task: BenchmarkTask,
  condition: BenchmarkCondition,
): string {
  if (
    task.escalates === true &&
    condition.advisorModel !== undefined &&
    SMOKE_FIXTURES_ADVISOR[task.id]
  ) {
    return SMOKE_FIXTURES_ADVISOR[task.id]!;
  }
  const baseline = SMOKE_FIXTURES[task.id];
  if (!baseline) {
    throw new Error(`Missing smoke fixture mapping for task: ${task.id}`);
  }
  return baseline;
}

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
    observedAdvisorCalls: result.metrics.observedAdvisorCalls,
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

    for (const condition of SMOKE_CONDITIONS) {
      const fakeResponsesPath = resolveSmokeFixturePath(task, condition);

      if (!existsSync(fakeResponsesPath)) {
        throw new Error(`Missing smoke response fixture: ${fakeResponsesPath}`);
      }

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
        taskEscalates: task.escalates === true,
        conditionId: condition.id,
        fakeResponsesPath,
        runs,
        stableFingerprint: fingerprintRun(runs[0]!),
        reproducible,
        maxObservedAdvisorCalls: runs.reduce(
          (max, run) => Math.max(max, run.metrics.observedAdvisorCalls),
          0,
        ),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    repeatCount,
    cells,
    reproducible: cells.every((cell) => cell.reproducible),
    advisorPipelineExercised: cells.some(
      (cell) => cell.maxObservedAdvisorCalls > 0,
    ),
  };
}

export function renderPolluxSmokeBenchmarkReport(
  report: PolluxSmokeBenchmarkReport,
): string {
  const lines: string[] = [];
  lines.push('# P4-03 Smoke Benchmark Reproducibility Report');
  lines.push('');
  lines.push('Version: 2.0');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('Status: Done');
  lines.push('TG mapping: TG-1, TG-3');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Scope');
  lines.push('');
  lines.push(
    'This artifact records the P4-03 smoke benchmark over a small A / D / E matrix using deterministic fake responses. The matrix MUST include at least one Pollux-enabled condition (D, hybrid strategy) and at least one task whose prompt deliberately trips the detector (`CAL-BM-04-ESCALATING`) so the smoke gate actually exercises the advisor pipeline (TG-3) and not just the executor path.',
  );
  lines.push('');
  lines.push('## 2) Smoke matrix');
  lines.push('');
  lines.push(
    '| Task | Esc? | Cond | Repeats | Reproducible | Advisor calls (max) | Stable fingerprint |',
  );
  lines.push('| --- | --- | --- | ---: | --- | ---: | --- |');
  for (const cell of report.cells) {
    lines.push(
      `| ${cell.taskId} | ${cell.taskEscalates ? 'yes' : 'no'} | ${cell.conditionId} | ${cell.runs.length} | ${cell.reproducible ? 'yes' : 'no'} | ${cell.maxObservedAdvisorCalls} | ${cell.stableFingerprint} |`,
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
    lines.push(`- Max observed advisor calls: ${cell.maxObservedAdvisorCalls}`);
    cell.runs.forEach((run, index) => {
      lines.push(
        `- Run ${index + 1}: valid=${run.valid}, accuracy=${run.metrics.accuracyPass}, tokens(total/advisor/executor)=${run.metrics.tokens.total}/${run.metrics.tokens.advisor}/${run.metrics.tokens.executor}, advisorCalls=${run.metrics.observedAdvisorCalls}, latencyMs=${run.metrics.latencyMs.toFixed(1)}`,
      );
    });
    lines.push('');
  }
  lines.push('## 4) Conclusion');
  lines.push('');
  lines.push(
    report.reproducible
      ? 'The smoke matrix is reproducible: every repeated run produced the same stable projection for validity, fairness pins, accuracy, token accounting, and observed advisor call count.'
      : 'The smoke matrix is not reproducible: at least one cell changed its stable projection across repeated executions.',
  );
  lines.push('');
  lines.push(
    report.advisorPipelineExercised
      ? 'Advisor pipeline exercised: at least one Pollux-enabled cell observed a `utility_advisor` telemetry event (TG-3 evidence).'
      : 'WARNING: advisor pipeline NOT exercised. Every cell observed zero advisor telemetry events; the smoke gate is collapsing to an executor-only test and provides no Pollux coverage.',
  );
  lines.push('');
  lines.push('## 5) Reproducibility rule');
  lines.push('');
  lines.push(
    'Stable projection = valid flag, invalidation reason, fairness pins, accuracy result, token totals, and observed advisor call count. Latency is recorded for observability but excluded from reproducibility comparison because it is expected to vary.',
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
