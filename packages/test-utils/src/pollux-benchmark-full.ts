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
import type {
  BenchmarkCondition,
  BenchmarkRunMetadata,
} from './benchmark-harness.js';
import { BenchmarkHarness } from './benchmark-harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const fixtureDirectory = join(__dirname, 'fixtures', 'pollux-benchmark');

// Note: filename retained from the original P4-04 deliverable
// ("checkpoint/resume") to avoid churning external references; the document
// title and scope have been corrected to "session-resume continuity" per the
// senior review. See section 1 of the rendered report for the rationale.
export const POLLUX_FULL_ARTIFACT_PATH = join(
  repoRoot,
  'docs',
  'core',
  'pollux',
  'P4-04_FULL_BENCHMARK_CHECKPOINT_RESUME.md',
);

const FULL_CONDITIONS: BenchmarkCondition[] = [
  {
    id: 'A',
    executorModel: 'gemini-2.5-flash',
  },
  {
    id: 'B',
    executorModel: 'gemini-2.5-flash',
    advisorModel: 'gemini-3-pro-preview',
    strategy: 'heuristic',
  },
  {
    id: 'C',
    executorModel: 'gemini-2.5-flash',
    advisorModel: 'gemini-3-pro-preview',
    strategy: 'structured',
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

const FULL_FIXTURES: Record<string, string> = {
  'CAL-BM-01-SIMPLE': join(fixtureDirectory, 'CAL-BM-01-SIMPLE.full.responses'),
  'CAL-BM-02-MODERATE': join(
    fixtureDirectory,
    'CAL-BM-02-MODERATE.full.responses',
  ),
  'CAL-BM-03-COMPLEX': join(
    fixtureDirectory,
    'CAL-BM-03-COMPLEX.full.responses',
  ),
  'CAL-BM-04-ESCALATING': join(
    fixtureDirectory,
    'CAL-BM-04-ESCALATING.full.responses',
  ),
};

/**
 * Pollux-enabled fixture overrides for the full benchmark. See the smoke
 * benchmark for the rationale: tasks that escalate the detector under
 * advisor-enabled conditions need an advisor-shaped fixture so the
 * Pollux runtime can consume the advisor JSON via `generateContent`
 * BEFORE the executor consumes the streamed responses.
 */
const FULL_FIXTURES_ADVISOR: Record<string, string> = {
  'CAL-BM-04-ESCALATING': join(
    fixtureDirectory,
    'CAL-BM-04-ESCALATING.full.advisor.responses',
  ),
};

function resolveFullFixturePath(
  task: BenchmarkTask,
  condition: BenchmarkCondition,
): string {
  if (
    task.escalates === true &&
    condition.advisorModel !== undefined &&
    FULL_FIXTURES_ADVISOR[task.id]
  ) {
    return FULL_FIXTURES_ADVISOR[task.id]!;
  }
  const baseline = FULL_FIXTURES[task.id];
  if (!baseline) {
    throw new Error(
      `Missing full benchmark fixture mapping for task: ${task.id}`,
    );
  }
  return baseline;
}

export interface PolluxFullCellRun {
  taskId: string;
  taskEscalates: boolean;
  conditionId: string;
  executorModel: string;
  advisorModel: string | null;
  strategy: string | null;
  fakeResponsesPath: string;
  initialRun: BenchmarkRunMetadata;
  resumedRun: BenchmarkRunMetadata;
  initialFingerprint: string;
  resumedFingerprint: string;
  fairnessStateConsistent: boolean;
  checkpointResumeConsistent: boolean;
}

export interface PolluxFullBenchmarkReport {
  generatedAt: string;
  cells: PolluxFullCellRun[];
  allValid: boolean;
  /**
   * Per-cell session-resume continuity flag. The original P4-04 deliverable
   * was titled "checkpoint/resume" but the harness does not implement
   * partial-run state persistence; what it does implement and what this flag
   * captures is "the resume CLI subprocess produces a fairness-consistent
   * stable projection identical in shape to the initial subprocess."
   */
  checkpointResumeConsistent: boolean;
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
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizeRun(result)))
    .digest('hex');
}

function getBenchmarkTask(taskId: string): BenchmarkTask {
  const task = BENCHMARK_CORPUS.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Benchmark task not found: ${taskId}`);
  }
  return task;
}

export async function runPolluxFullBenchmark(
  resumePrompt?: string,
): Promise<PolluxFullBenchmarkReport> {
  const cells: PolluxFullCellRun[] = [];

  for (const taskEntry of BENCHMARK_CORPUS) {
    const task = getBenchmarkTask(taskEntry.id);

    for (const condition of FULL_CONDITIONS) {
      const fakeResponsesPath = resolveFullFixturePath(task, condition);

      if (!existsSync(fakeResponsesPath)) {
        throw new Error(
          `Missing full benchmark response fixture: ${fakeResponsesPath}`,
        );
      }

      const harness = new BenchmarkHarness();
      const result = await harness.runBenchmarkWithCheckpointResume(
        task,
        condition,
        {
          fakeResponsesPath,
          // Pass the caller's override only when supplied; otherwise let the
          // harness honor `task.resumePrompt` (e.g. the ESCALATING task
          // overrides with an escalating resume prompt so the resume turn
          // exercises the same advisor pipeline as the initial turn).
          ...(resumePrompt !== undefined ? { resumePrompt } : {}),
        },
      );

      const initialFingerprint = fingerprintRun(result.initialRun);
      const resumedFingerprint = fingerprintRun(result.resumedRun);
      const checkpointResumeConsistent =
        result.fairnessStateConsistent &&
        result.initialRun.valid &&
        result.resumedRun.valid;

      cells.push({
        taskId: task.id,
        taskEscalates: task.escalates === true,
        conditionId: condition.id,
        executorModel: condition.executorModel,
        advisorModel: condition.advisorModel ?? null,
        strategy: condition.strategy ?? null,
        fakeResponsesPath,
        initialRun: result.initialRun,
        resumedRun: result.resumedRun,
        initialFingerprint,
        resumedFingerprint,
        fairnessStateConsistent: result.fairnessStateConsistent,
        checkpointResumeConsistent,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    cells,
    allValid: cells.every(
      (cell) => cell.initialRun.valid && cell.resumedRun.valid,
    ),
    checkpointResumeConsistent: cells.every(
      (cell) => cell.checkpointResumeConsistent,
    ),
  };
}

export function renderPolluxFullBenchmarkReport(
  report: PolluxFullBenchmarkReport,
): string {
  const lines: string[] = [];

  lines.push('# P4-04 Full Benchmark Session-Resume Continuity Report');
  lines.push('');
  lines.push('Version: 2.0');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('Status: Done');
  lines.push('TG mapping: TG-1');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Scope and naming');
  lines.push('');
  lines.push(
    'This artifact records the full Pollux benchmark matrix across conditions A-E for all corpus tasks. The harness invokes the CLI twice per cell — an initial subprocess and a resume subprocess (`--resume latest --prompt <resumePrompt>`) — and asserts that both subprocesses produce a stable, fairness-pin-consistent projection.',
  );
  lines.push('');
  lines.push(
    '**Naming clarification (P4-04 senior review fix):** the original deliverable was titled "checkpoint/resume", which implied mid-run state persistence. The harness does not implement partial-run persistence; the resume subprocess is a fresh process that re-reads the saved chat session via the CLI `--resume` flag and replays the fake-response fixture from index 0. This is correctly described as **session-resume continuity**, not checkpoint/resume. See `docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md` for the contract a real model-run benchmark would have to satisfy.',
  );
  lines.push('');
  lines.push('## 2) Condition matrix');
  lines.push('');
  lines.push('| Condition | Executor | Advisor | Strategy |');
  lines.push('| --- | --- | --- | --- |');
  for (const condition of FULL_CONDITIONS) {
    lines.push(
      `| ${condition.id} | ${condition.executorModel} | ${condition.advisorModel ?? 'none'} | ${condition.strategy ?? 'none'} |`,
    );
  }
  lines.push('');
  lines.push('## 3) Full run summary');
  lines.push('');
  lines.push(
    '| Task | Esc? | Cond | Init valid | Resume valid | Fair consistent | Continuity pass | Init tokens | Resume tokens | Init advisor calls | Resume advisor calls |',
  );
  lines.push(
    '| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |',
  );
  for (const cell of report.cells) {
    lines.push(
      `| ${cell.taskId} | ${cell.taskEscalates ? 'yes' : 'no'} | ${cell.conditionId} | ${cell.initialRun.valid ? 'yes' : 'no'} | ${cell.resumedRun.valid ? 'yes' : 'no'} | ${cell.fairnessStateConsistent ? 'yes' : 'no'} | ${cell.checkpointResumeConsistent ? 'yes' : 'no'} | ${cell.initialRun.metrics.tokens.total} | ${cell.resumedRun.metrics.tokens.total} | ${cell.initialRun.metrics.observedAdvisorCalls} | ${cell.resumedRun.metrics.observedAdvisorCalls} |`,
    );
  }
  lines.push('');
  lines.push('## 4) Continuity details');
  lines.push('');
  for (const cell of report.cells) {
    lines.push(`### ${cell.taskId} / ${cell.conditionId}`);
    lines.push('');
    lines.push(`- Fake responses: ${cell.fakeResponsesPath}`);
    lines.push(
      `- Initial run: valid=${cell.initialRun.valid}, accuracy=${cell.initialRun.metrics.accuracyPass}, advisorCalls=${cell.initialRun.metrics.observedAdvisorCalls}, fingerprint=${cell.initialFingerprint}`,
    );
    lines.push(
      `- Resumed run: valid=${cell.resumedRun.valid}, accuracy=${cell.resumedRun.metrics.accuracyPass}, advisorCalls=${cell.resumedRun.metrics.observedAdvisorCalls}, fingerprint=${cell.resumedFingerprint}`,
    );
    lines.push(
      `- Fairness pin consistency across resume: ${cell.fairnessStateConsistent ? 'passed' : 'failed'}`,
    );
    if (cell.initialRun.invalidationReason) {
      lines.push(
        `- Initial invalidation reason: ${cell.initialRun.invalidationReason}`,
      );
    }
    if (cell.resumedRun.invalidationReason) {
      lines.push(
        `- Resume invalidation reason: ${cell.resumedRun.invalidationReason}`,
      );
    }
    lines.push('');
  }

  lines.push('## 5) Conclusion');
  lines.push('');
  lines.push(
    report.checkpointResumeConsistent
      ? 'Session-resume continuity validation passed for all A-E cells. Fairness pins remained consistent and runs stayed valid across resume boundaries.'
      : 'Session-resume continuity validation failed for one or more A-E cells. Review run details before using these outputs for comparison.',
  );
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const report = await runPolluxFullBenchmark();
  const artifact = renderPolluxFullBenchmarkReport(report);

  mkdirSync(dirname(POLLUX_FULL_ARTIFACT_PATH), { recursive: true });
  writeFileSync(POLLUX_FULL_ARTIFACT_PATH, artifact, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${POLLUX_FULL_ARTIFACT_PATH}`);
  // eslint-disable-next-line no-console
  console.log(
    report.checkpointResumeConsistent
      ? 'Full benchmark session-resume continuity: PASS'
      : 'Full benchmark session-resume continuity: FAIL',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  void main();
}

export const POLLUX_FULL_CONDITIONS = FULL_CONDITIONS;
