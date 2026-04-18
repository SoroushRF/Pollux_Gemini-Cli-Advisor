/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  POLLUX_SMOKE_ARTIFACT_PATH,
  POLLUX_SMOKE_CONDITIONS,
  renderPolluxSmokeBenchmarkReport,
  runPolluxSmokeBenchmark,
} from './pollux-benchmark-smoke.js';

describe('Pollux smoke benchmark reproducibility', () => {
  it('keeps the stable projection identical across repeated runs and exercises the advisor pipeline', async () => {
    const report = await runPolluxSmokeBenchmark();

    writeFileSync(
      POLLUX_SMOKE_ARTIFACT_PATH,
      renderPolluxSmokeBenchmarkReport(report),
      'utf8',
    );

    expect(report.reproducible).toBe(true);
    // 3 tasks (SIMPLE, MODERATE, ESCALATING) x 3 conditions (A, D, E) = 9 cells.
    expect(report.cells).toHaveLength(3 * POLLUX_SMOKE_CONDITIONS.length);
    expect(report.cells.every((cell) => cell.reproducible)).toBe(true);

    for (const cell of report.cells) {
      expect(cell.runs).toHaveLength(2);
      expect(cell.runs[0]!.valid).toBe(true);
      expect(cell.runs[1]!.valid).toBe(true);
      expect(cell.runs[0]!.metrics.accuracyPass).toBe(
        cell.runs[1]!.metrics.accuracyPass,
      );
      expect(cell.runs[0]!.metrics.tokens).toEqual(
        cell.runs[1]!.metrics.tokens,
      );
      expect(cell.runs[0]!.metrics.observedAdvisorCalls).toBe(
        cell.runs[1]!.metrics.observedAdvisorCalls,
      );
    }

    // P4-03 senior review fix: smoke gate MUST exercise the advisor
    // pipeline at least once. Otherwise the smoke matrix is just an
    // executor reproducibility check and provides no Pollux coverage.
    expect(report.advisorPipelineExercised).toBe(true);

    // Specifically: ESCALATING under D (hybrid) must observe at least one
    // advisor call; ESCALATING under A and E (Pollux off) must observe
    // none. This pins the matrix-relevant property in addition to the
    // aggregate flag.
    const escDCell = report.cells.find(
      (c) => c.taskId === 'CAL-BM-04-ESCALATING' && c.conditionId === 'D',
    );
    const escACell = report.cells.find(
      (c) => c.taskId === 'CAL-BM-04-ESCALATING' && c.conditionId === 'A',
    );
    const escECell = report.cells.find(
      (c) => c.taskId === 'CAL-BM-04-ESCALATING' && c.conditionId === 'E',
    );
    expect(escDCell?.maxObservedAdvisorCalls).toBeGreaterThan(0);
    expect(escACell?.maxObservedAdvisorCalls).toBe(0);
    expect(escECell?.maxObservedAdvisorCalls).toBe(0);

    // Non-escalating tasks must NEVER trigger the advisor in any
    // condition. This guards against the detector accidentally firing on
    // SIMPLE / MODERATE prompts after a future refactor.
    for (const cell of report.cells) {
      if (cell.taskId === 'CAL-BM-04-ESCALATING') continue;
      expect(cell.maxObservedAdvisorCalls).toBe(0);
    }
  }, 240000);
});
