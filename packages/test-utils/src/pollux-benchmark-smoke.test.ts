/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  POLLUX_SMOKE_ARTIFACT_PATH,
  renderPolluxSmokeBenchmarkReport,
  runPolluxSmokeBenchmark,
} from './pollux-benchmark-smoke.js';

describe('Pollux smoke benchmark reproducibility', () => {
  it('keeps the stable projection identical across repeated runs', async () => {
    const report = await runPolluxSmokeBenchmark();

    writeFileSync(
      POLLUX_SMOKE_ARTIFACT_PATH,
      renderPolluxSmokeBenchmarkReport(report),
      'utf8',
    );

    expect(report.reproducible).toBe(true);
    expect(report.cells).toHaveLength(4);
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
    }
  }, 120000);
});
