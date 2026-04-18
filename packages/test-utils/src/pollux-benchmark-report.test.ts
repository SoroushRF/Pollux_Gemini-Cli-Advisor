/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POLLUX_FULL_CONDITIONS } from './pollux-benchmark-full.js';
import {
  POLLUX_P405_ARTIFACT_PATH,
  renderPolluxP405BenchmarkReport,
  runPolluxP405BenchmarkReport,
} from './pollux-benchmark-report.js';

describe('Pollux P4-05 benchmark metrics report', () => {
  it('publishes token, latency, and accuracy metrics with CIs and escalation stats', async () => {
    const report = await runPolluxP405BenchmarkReport();

    writeFileSync(
      POLLUX_P405_ARTIFACT_PATH,
      renderPolluxP405BenchmarkReport(report),
      'utf8',
    );

    expect(report.conditionSummaries).toHaveLength(
      POLLUX_FULL_CONDITIONS.length,
    );
    expect(report.sampleCount).toBeGreaterThan(0);
    expect(report.overallAccuracy.n).toBe(report.sampleCount);
    expect(report.tokenReconciliation.passCount).toBe(report.sampleCount);
    expect(report.tokenReconciliation.passRate.value).toBe(1);
    expect(report.escalation.expectedPositive).toBeGreaterThan(0);
    expect(report.escalation.recall).not.toBeNull();
  }, 480000);
});
