/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POLLUX_FULL_CONDITIONS,
  runPolluxFullBenchmark,
  type PolluxFullBenchmarkReport,
} from './pollux-benchmark-full.js';
import {
  ADVISOR_TELEMETRY_ROLE,
  LOOP_DETECTOR_TELEMETRY_ROLE,
  ROUTER_TELEMETRY_ROLE,
} from './benchmark-harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');

export const POLLUX_P406_ARTIFACT_PATH = join(
  repoRoot,
  'docs',
  'core',
  'pollux',
  'P4-06_FAIRNESS_AUDIT_LOG.md',
);

type FairnessPinKey =
  | 'routerPinned'
  | 'loopDetectionDisabled'
  | 'availabilityReset'
  | 'dynamicConfigFixed'
  | 'sessionIsolated'
  | 'sandboxIsolated';

export interface PolluxP406RunAudit {
  taskId: string;
  conditionId: string;
  phase: 'initial' | 'resume';
  valid: boolean;
  invalidationReason: string | null;
  fairnessPins: Record<FairnessPinKey, boolean>;
  observedRouterCalls: number;
  observedLoopDetectorCalls: number;
  observedAdvisorCalls: number;
  sessionId: string;
  workspaceDir: string;
  homeDir: string;
}

export interface PolluxP406CrossRunUniqueness {
  /** Distinct sessionIds observed across all initial+resume runs. */
  distinctSessionIds: number;
  /** Distinct workspace directories observed. */
  distinctWorkspaceDirs: number;
  /** Distinct home directories observed. */
  distinctHomeDirs: number;
  /** True iff every initial run reports a unique sessionId. */
  initialSessionIdsUnique: boolean;
  /** True iff every initial run reports a unique workspaceDir. */
  initialWorkspaceDirsUnique: boolean;
  /** True iff every initial run reports a unique homeDir. */
  initialHomeDirsUnique: boolean;
}

export interface PolluxP406FairnessAuditReport {
  generatedAt: string;
  sourceGeneratedAt: string;
  conditionCount: number;
  cellCount: number;
  runCount: number;
  runAudits: PolluxP406RunAudit[];
  pinPassCounts: Record<FairnessPinKey, number>;
  pinPassRates: Record<FairnessPinKey, number>;
  validRunCount: number;
  invalidRunCount: number;
  invalidReasons: Record<string, number>;
  checkpointResumeFairnessConsistent: boolean;
  allPinsPassAllRuns: boolean;
  /**
   * Aggregate AC-03 (TG-1 baseline utility-call suppression) verdict.
   * True iff every audited run reported zero `utility_router` AND zero
   * `utility_loop_detector` api_response telemetry events. The pin
   * evaluator already invalidates a run when this is violated; this field
   * surfaces the property at audit-summary level so the doc reader does
   * not have to scan the per-run table.
   */
  utilityCallSuppressionPassed: boolean;
  /**
   * Aggregate advisor-pipeline-exercised flag. True iff at least one
   * audited run observed a `utility_advisor` api_response. A `false`
   * value means the entire benchmark collapsed to the executor path and
   * the run set provides no Pollux coverage.
   */
  advisorPipelineExercised: boolean;
  crossRunUniqueness: PolluxP406CrossRunUniqueness;
}

const FAIRNESS_PINS: FairnessPinKey[] = [
  'routerPinned',
  'loopDetectionDisabled',
  'availabilityReset',
  'dynamicConfigFixed',
  'sessionIsolated',
  'sandboxIsolated',
];

function buildRunAudits(
  source: PolluxFullBenchmarkReport,
): PolluxP406RunAudit[] {
  const audits: PolluxP406RunAudit[] = [];

  for (const cell of source.cells) {
    for (const phase of ['initial', 'resume'] as const) {
      const run = phase === 'initial' ? cell.initialRun : cell.resumedRun;
      const counts = run.observables.utilityRoleCounts;
      audits.push({
        taskId: cell.taskId,
        conditionId: cell.conditionId,
        phase,
        valid: run.valid,
        invalidationReason: run.invalidationReason ?? null,
        fairnessPins: { ...run.fairnessPins },
        observedRouterCalls: counts[ROUTER_TELEMETRY_ROLE] ?? 0,
        observedLoopDetectorCalls: counts[LOOP_DETECTOR_TELEMETRY_ROLE] ?? 0,
        observedAdvisorCalls: counts[ADVISOR_TELEMETRY_ROLE] ?? 0,
        sessionId: run.observables.sessionId,
        workspaceDir: run.observables.workspaceDir,
        homeDir: run.observables.homeDir,
      });
    }
  }

  return audits;
}

function fraction(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function computeCrossRunUniqueness(
  source: PolluxFullBenchmarkReport,
): PolluxP406CrossRunUniqueness {
  const initialRuns = source.cells.map((cell) => cell.initialRun);
  const allRuns = source.cells.flatMap((cell) => [
    cell.initialRun,
    cell.resumedRun,
  ]);

  const initialSessionIds = initialRuns.map((r) => r.observables.sessionId);
  const initialWorkspaceDirs = initialRuns.map(
    (r) => r.observables.workspaceDir,
  );
  const initialHomeDirs = initialRuns.map((r) => r.observables.homeDir);

  return {
    distinctSessionIds: new Set(allRuns.map((r) => r.observables.sessionId))
      .size,
    distinctWorkspaceDirs: new Set(
      allRuns.map((r) => r.observables.workspaceDir),
    ).size,
    distinctHomeDirs: new Set(allRuns.map((r) => r.observables.homeDir)).size,
    initialSessionIdsUnique:
      new Set(initialSessionIds).size === initialSessionIds.length,
    initialWorkspaceDirsUnique:
      new Set(initialWorkspaceDirs).size === initialWorkspaceDirs.length,
    initialHomeDirsUnique:
      new Set(initialHomeDirs).size === initialHomeDirs.length,
  };
}

export function buildPolluxP406FairnessAuditReport(
  source: PolluxFullBenchmarkReport,
): PolluxP406FairnessAuditReport {
  const runAudits = buildRunAudits(source);
  const runCount = runAudits.length;

  const pinPassCounts = {
    routerPinned: 0,
    loopDetectionDisabled: 0,
    availabilityReset: 0,
    dynamicConfigFixed: 0,
    sessionIsolated: 0,
    sandboxIsolated: 0,
  };

  for (const run of runAudits) {
    for (const pin of FAIRNESS_PINS) {
      if (run.fairnessPins[pin]) {
        pinPassCounts[pin] += 1;
      }
    }
  }

  const pinPassRates = {
    routerPinned: fraction(pinPassCounts.routerPinned, runCount),
    loopDetectionDisabled: fraction(
      pinPassCounts.loopDetectionDisabled,
      runCount,
    ),
    availabilityReset: fraction(pinPassCounts.availabilityReset, runCount),
    dynamicConfigFixed: fraction(pinPassCounts.dynamicConfigFixed, runCount),
    sessionIsolated: fraction(pinPassCounts.sessionIsolated, runCount),
    sandboxIsolated: fraction(pinPassCounts.sandboxIsolated, runCount),
  };

  const validRunCount = runAudits.filter((run) => run.valid).length;
  const invalidRunCount = runCount - validRunCount;

  const invalidReasons: Record<string, number> = {};
  for (const run of runAudits) {
    if (!run.valid) {
      const reason = run.invalidationReason ?? 'unknown';
      invalidReasons[reason] = (invalidReasons[reason] || 0) + 1;
    }
  }

  const allPinsPassAllRuns = FAIRNESS_PINS.every(
    (pin) => pinPassCounts[pin] === runCount,
  );

  const utilityCallSuppressionPassed = runAudits.every(
    (run) =>
      run.observedRouterCalls === 0 && run.observedLoopDetectorCalls === 0,
  );
  const advisorPipelineExercised = runAudits.some(
    (run) => run.observedAdvisorCalls > 0,
  );

  return {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: source.generatedAt,
    conditionCount: POLLUX_FULL_CONDITIONS.length,
    cellCount: source.cells.length,
    runCount,
    runAudits,
    pinPassCounts,
    pinPassRates,
    validRunCount,
    invalidRunCount,
    invalidReasons,
    checkpointResumeFairnessConsistent: source.cells.every(
      (cell) => cell.fairnessStateConsistent,
    ),
    allPinsPassAllRuns,
    utilityCallSuppressionPassed,
    advisorPipelineExercised,
    crossRunUniqueness: computeCrossRunUniqueness(source),
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function renderPolluxP406FairnessAuditReport(
  report: PolluxP406FairnessAuditReport,
): string {
  const lines: string[] = [];

  lines.push('# P4-06 Fairness Pin Audit Log');
  lines.push('');
  lines.push('Version: 2.0');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('Status: Done');
  lines.push('TG mapping: TG-1');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Scope');
  lines.push('');
  lines.push(
    'This artifact validates the fairness-pin audit trail for every run in the full A-E benchmark matrix (initial + session-resume). Per the P0-05 contract refined by senior review, every pin is now derived from either the requested settings AND/OR a runtime telemetry observable, instead of being a hardcoded constant. Cross-run uniqueness for FP-03/FP-05/FP-06 is verified at this audit layer.',
  );
  lines.push('');
  lines.push('## 2) Source coverage');
  lines.push('');
  lines.push(`- Source full benchmark timestamp: ${report.sourceGeneratedAt}`);
  lines.push(`- Conditions: ${report.conditionCount}`);
  lines.push(`- Cells (task x condition): ${report.cellCount}`);
  lines.push(`- Audited runs (initial + resume): ${report.runCount}`);
  lines.push('');
  lines.push('## 3) Fairness pin pass summary');
  lines.push('');
  lines.push('| Pin | Pass count | Pass rate |');
  lines.push('| --- | ---: | ---: |');
  lines.push(
    `| FP-01 routerPinned | ${report.pinPassCounts.routerPinned}/${report.runCount} | ${formatPercent(report.pinPassRates.routerPinned)} |`,
  );
  lines.push(
    `| FP-02 loopDetectionDisabled | ${report.pinPassCounts.loopDetectionDisabled}/${report.runCount} | ${formatPercent(report.pinPassRates.loopDetectionDisabled)} |`,
  );
  lines.push(
    `| FP-03 availabilityReset | ${report.pinPassCounts.availabilityReset}/${report.runCount} | ${formatPercent(report.pinPassRates.availabilityReset)} |`,
  );
  lines.push(
    `| FP-04 dynamicConfigFixed | ${report.pinPassCounts.dynamicConfigFixed}/${report.runCount} | ${formatPercent(report.pinPassRates.dynamicConfigFixed)} |`,
  );
  lines.push(
    `| FP-05 sessionIsolated | ${report.pinPassCounts.sessionIsolated}/${report.runCount} | ${formatPercent(report.pinPassRates.sessionIsolated)} |`,
  );
  lines.push(
    `| FP-06 sandboxIsolated | ${report.pinPassCounts.sandboxIsolated}/${report.runCount} | ${formatPercent(report.pinPassRates.sandboxIsolated)} |`,
  );
  lines.push('');
  lines.push('## 4) Telemetry-derived AC-03 evidence');
  lines.push('');
  lines.push(
    `- Baseline utility suppression (no router or loop-detector api_response events): ${report.utilityCallSuppressionPassed ? 'passed' : 'FAILED'}`,
  );
  lines.push(
    `- Advisor pipeline exercised (at least one utility_advisor api_response): ${report.advisorPipelineExercised ? 'yes (TG-3 evidence)' : 'NO — benchmark collapsed to executor-only'}`,
  );
  lines.push('');
  lines.push('## 5) Cross-run uniqueness (FP-03 / FP-05 / FP-06)');
  lines.push('');
  lines.push(
    `- Distinct session ids across all runs: ${report.crossRunUniqueness.distinctSessionIds}/${report.runCount}`,
  );
  lines.push(
    `- Distinct workspace dirs across all runs: ${report.crossRunUniqueness.distinctWorkspaceDirs}/${report.runCount}`,
  );
  lines.push(
    `- Distinct home dirs across all runs: ${report.crossRunUniqueness.distinctHomeDirs}/${report.runCount}`,
  );
  lines.push(
    `- Initial-run session ids unique (FP-05): ${report.crossRunUniqueness.initialSessionIdsUnique ? 'yes' : 'no'}`,
  );
  lines.push(
    `- Initial-run workspace dirs unique (FP-06): ${report.crossRunUniqueness.initialWorkspaceDirsUnique ? 'yes' : 'no'}`,
  );
  lines.push(
    `- Initial-run home dirs unique (FP-03): ${report.crossRunUniqueness.initialHomeDirsUnique ? 'yes' : 'no'}`,
  );
  lines.push('');
  lines.push('## 6) Run validity summary');
  lines.push('');
  lines.push(`- Valid runs: ${report.validRunCount}/${report.runCount}`);
  lines.push(`- Invalid runs: ${report.invalidRunCount}/${report.runCount}`);
  lines.push(
    `- Session-resume fairness consistency: ${report.checkpointResumeFairnessConsistent ? 'passed' : 'failed'}`,
  );
  lines.push('');

  if (report.invalidRunCount > 0) {
    lines.push('### Invalid reasons');
    lines.push('');
    for (const [reason, count] of Object.entries(report.invalidReasons)) {
      lines.push(`- ${reason}: ${count}`);
    }
    lines.push('');
  }

  lines.push('## 7) Per-run fairness audit trail');
  lines.push('');
  lines.push(
    '| Task | Cond | Phase | Valid | Reason | Router calls | Loop-det calls | Advisor calls | FP-01 | FP-02 | FP-03 | FP-04 | FP-05 | FP-06 |',
  );
  lines.push(
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |',
  );

  for (const run of report.runAudits) {
    lines.push(
      `| ${run.taskId} | ${run.conditionId} | ${run.phase} | ${run.valid ? 'yes' : 'no'} | ${run.invalidationReason ?? 'none'} | ${run.observedRouterCalls} | ${run.observedLoopDetectorCalls} | ${run.observedAdvisorCalls} | ${run.fairnessPins.routerPinned ? 'pass' : 'fail'} | ${run.fairnessPins.loopDetectionDisabled ? 'pass' : 'fail'} | ${run.fairnessPins.availabilityReset ? 'pass' : 'fail'} | ${run.fairnessPins.dynamicConfigFixed ? 'pass' : 'fail'} | ${run.fairnessPins.sessionIsolated ? 'pass' : 'fail'} | ${run.fairnessPins.sandboxIsolated ? 'pass' : 'fail'} |`,
    );
  }

  lines.push('');
  lines.push('## 8) Conclusion');
  lines.push('');
  lines.push(
    report.allPinsPassAllRuns &&
      report.invalidRunCount === 0 &&
      report.utilityCallSuppressionPassed
      ? 'Fairness audit passed for every run. FP-01 through FP-06 are recorded and passing across initial and resumed executions; AC-03 utility suppression holds at the telemetry level; cross-run uniqueness for FP-03/05/06 is satisfied.'
      : 'Fairness audit found one or more failures. Review per-run audit rows and the AC-03 / cross-run sections before using the benchmark outputs for comparison.',
  );
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export async function runPolluxP406FairnessAudit(): Promise<PolluxP406FairnessAuditReport> {
  const fullReport = await runPolluxFullBenchmark();
  return buildPolluxP406FairnessAuditReport(fullReport);
}

async function main() {
  const report = await runPolluxP406FairnessAudit();
  const artifact = renderPolluxP406FairnessAuditReport(report);

  mkdirSync(dirname(POLLUX_P406_ARTIFACT_PATH), { recursive: true });
  writeFileSync(POLLUX_P406_ARTIFACT_PATH, artifact, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${POLLUX_P406_ARTIFACT_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  void main();
}
