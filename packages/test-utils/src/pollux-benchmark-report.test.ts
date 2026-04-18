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

    // P4-05 senior review fix: confusion matrix must now include real
    // expected positives drawn from the ESCALATING task under
    // Pollux-enabled conditions (B/C/D), and recall MUST be non-null
    // and strictly positive. Previously this test only required
    // expectedPositive > 0 which was satisfied by the
    // advisorEnabled-as-positive bug.
    expect(report.escalation.expectedPositive).toBeGreaterThan(0);
    expect(report.escalation.recall).not.toBeNull();
    expect(report.escalation.truePositive).toBeGreaterThan(0);
    expect(report.escalation.recall!.value).toBeGreaterThan(0);

    // Also pin: the precision matrix counts every observed advisor call
    // as a predicted positive. With the new corpus and confusion-matrix
    // semantics, advisor calls only occur for ESCALATING task under B/C/D
    // (true positives), so precision should be 100%.
    expect(report.escalation.falsePositive).toBe(0);
    expect(report.escalation.precision).not.toBeNull();
    expect(report.escalation.precision!.value).toBe(1);
  }, 600000);
});
