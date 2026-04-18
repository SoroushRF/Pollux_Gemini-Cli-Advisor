/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'node:fs';
import { BENCHMARK_CORPUS } from '@google/gemini-cli-core';
import { describe, expect, it } from 'vitest';
import {
  POLLUX_FULL_ARTIFACT_PATH,
  POLLUX_FULL_CONDITIONS,
  renderPolluxFullBenchmarkReport,
  runPolluxFullBenchmark,
} from './pollux-benchmark-full.js';

describe('Pollux full benchmark session-resume continuity', () => {
  it('runs the full A-E matrix and preserves fairness state across resume', async () => {
    const report = await runPolluxFullBenchmark();

    writeFileSync(
      POLLUX_FULL_ARTIFACT_PATH,
      renderPolluxFullBenchmarkReport(report),
      'utf8',
    );

    expect(report.cells).toHaveLength(
      BENCHMARK_CORPUS.length * POLLUX_FULL_CONDITIONS.length,
    );
    expect(report.allValid).toBe(true);
    expect(report.checkpointResumeConsistent).toBe(true);

    for (const cell of report.cells) {
      expect(cell.initialRun.valid).toBe(true);
      expect(cell.resumedRun.valid).toBe(true);
      expect(cell.fairnessStateConsistent).toBe(true);
      expect(cell.checkpointResumeConsistent).toBe(true);
    }

    // P4-04 senior review: at least one cell must observe a
    // `utility_advisor` telemetry event, otherwise the entire benchmark
    // collapsed to the executor path. Specifically the ESCALATING task
    // under conditions B/C/D (Pollux on, prompt trips detector) must
    // produce non-zero advisor calls; the same task under A/E (Pollux
    // off) must produce zero.
    const escalatingPolluxOnCells = report.cells.filter(
      (c) => c.taskEscalates && ['B', 'C', 'D'].includes(c.conditionId),
    );
    expect(escalatingPolluxOnCells.length).toBeGreaterThan(0);
    for (const cell of escalatingPolluxOnCells) {
      expect(cell.initialRun.metrics.observedAdvisorCalls).toBeGreaterThan(0);
      expect(cell.resumedRun.metrics.observedAdvisorCalls).toBeGreaterThan(0);
    }

    const escalatingPolluxOffCells = report.cells.filter(
      (c) => c.taskEscalates && ['A', 'E'].includes(c.conditionId),
    );
    for (const cell of escalatingPolluxOffCells) {
      expect(cell.initialRun.metrics.observedAdvisorCalls).toBe(0);
      expect(cell.resumedRun.metrics.observedAdvisorCalls).toBe(0);
    }

    // Non-escalating tasks must NEVER fire the advisor — the prompts are
    // intentionally crafted to stay below the detector threshold under
    // any strategy. This guards against accidental false positives if
    // the detector defaults are ever loosened.
    const nonEscalating = report.cells.filter((c) => !c.taskEscalates);
    for (const cell of nonEscalating) {
      expect(cell.initialRun.metrics.observedAdvisorCalls).toBe(0);
      expect(cell.resumedRun.metrics.observedAdvisorCalls).toBe(0);
    }
  }, 600000);
});
