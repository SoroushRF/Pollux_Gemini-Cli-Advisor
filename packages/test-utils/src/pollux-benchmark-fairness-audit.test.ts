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

    // AC-03 telemetry-derived utility suppression: the router and
    // loop-detector LLM utility paths must produce ZERO api_response
    // events under the benchmark settings. This is the "TG-1 baseline
    // utility-call suppression" property the previous audit could not
    // verify because it derived FP-01/FP-02 from settings echoes alone.
    expect(report.utilityCallSuppressionPassed).toBe(true);

    // Advisor pipeline must be exercised at least once across the matrix
    // so the audit covers the Pollux happy path, not just the executor.
    expect(report.advisorPipelineExercised).toBe(true);

    // Cross-run uniqueness for FP-03/05/06 — the audit-layer guarantee
    // that sessionId / workspaceDir / homeDir are NOT reused across the
    // matrix. This is what the old hardcoded `availabilityReset = true`
    // pin claimed to enforce but never verified.
    expect(report.crossRunUniqueness.initialSessionIdsUnique).toBe(true);
    expect(report.crossRunUniqueness.initialWorkspaceDirsUnique).toBe(true);
    expect(report.crossRunUniqueness.initialHomeDirsUnique).toBe(true);

    for (const run of report.runAudits) {
      expect(run.valid).toBe(true);
      expect(run.fairnessPins.routerPinned).toBe(true);
      expect(run.fairnessPins.loopDetectionDisabled).toBe(true);
      expect(run.fairnessPins.availabilityReset).toBe(true);
      expect(run.fairnessPins.dynamicConfigFixed).toBe(true);
      expect(run.fairnessPins.sessionIsolated).toBe(true);
      expect(run.fairnessPins.sandboxIsolated).toBe(true);
      expect(run.observedRouterCalls).toBe(0);
      expect(run.observedLoopDetectorCalls).toBe(0);
      expect(run.sessionId.length).toBeGreaterThan(0);
      expect(run.workspaceDir.length).toBeGreaterThan(0);
      expect(run.homeDir.length).toBeGreaterThan(0);
    }
  }, 600000);
});
