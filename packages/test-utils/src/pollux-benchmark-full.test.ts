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

describe('Pollux full benchmark checkpoint/resume', () => {
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
  }, 480000);
});
