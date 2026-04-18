/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  POLLUX_P406_ARTIFACT_PATH,
  renderPolluxP406FairnessAuditReport,
  runPolluxP406FairnessAudit,
} from './pollux-benchmark-fairness-audit.js';

describe('Pollux P4-06 fairness pin audit', () => {
  it('records a full per-run fairness-pin audit trail for A-E benchmark runs', async () => {
    const report = await runPolluxP406FairnessAudit();

    writeFileSync(
      POLLUX_P406_ARTIFACT_PATH,
      renderPolluxP406FairnessAuditReport(report),
      'utf8',
    );

    expect(report.runCount).toBeGreaterThan(0);
    expect(report.validRunCount).toBe(report.runCount);
    expect(report.invalidRunCount).toBe(0);
    expect(report.checkpointResumeFairnessConsistent).toBe(true);
    expect(report.allPinsPassAllRuns).toBe(true);

    for (const run of report.runAudits) {
      expect(run.valid).toBe(true);
      expect(run.fairnessPins.routerPinned).toBe(true);
      expect(run.fairnessPins.loopDetectionDisabled).toBe(true);
      expect(run.fairnessPins.availabilityReset).toBe(true);
      expect(run.fairnessPins.dynamicConfigFixed).toBe(true);
      expect(run.fairnessPins.sessionIsolated).toBe(true);
      expect(run.fairnessPins.sandboxIsolated).toBe(true);
    }
  }, 480000);
});
