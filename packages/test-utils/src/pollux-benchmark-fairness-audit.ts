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
    audits.push({
      taskId: cell.taskId,
      conditionId: cell.conditionId,
      phase: 'initial',
      valid: cell.initialRun.valid,
      invalidationReason: cell.initialRun.invalidationReason ?? null,
      fairnessPins: { ...cell.initialRun.fairnessPins },
    });

    audits.push({
      taskId: cell.taskId,
      conditionId: cell.conditionId,
      phase: 'resume',
      valid: cell.resumedRun.valid,
      invalidationReason: cell.resumedRun.invalidationReason ?? null,
      fairnessPins: { ...cell.resumedRun.fairnessPins },
    });
  }

  return audits;
}

function fraction(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
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
  lines.push('Version: 1.0');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('Status: Done');
  lines.push('TG mapping: TG-1');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Scope');
  lines.push('');
  lines.push(
    'This artifact validates the fairness-pin audit trail for every run in the full A-E benchmark matrix (initial + checkpoint/resume) and records machine-auditable pin status and run validity.',
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
  lines.push('## 4) Run validity summary');
  lines.push('');
  lines.push(`- Valid runs: ${report.validRunCount}/${report.runCount}`);
  lines.push(`- Invalid runs: ${report.invalidRunCount}/${report.runCount}`);
  lines.push(
    `- Checkpoint/resume fairness consistency: ${report.checkpointResumeFairnessConsistent ? 'passed' : 'failed'}`,
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

  lines.push('## 5) Per-run fairness audit trail');
  lines.push('');
  lines.push(
    '| Task | Condition | Phase | Valid | Invalidation reason | FP-01 | FP-02 | FP-03 | FP-04 | FP-05 | FP-06 |',
  );
  lines.push(
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );

  for (const run of report.runAudits) {
    lines.push(
      `| ${run.taskId} | ${run.conditionId} | ${run.phase} | ${run.valid ? 'yes' : 'no'} | ${run.invalidationReason ?? 'none'} | ${run.fairnessPins.routerPinned ? 'pass' : 'fail'} | ${run.fairnessPins.loopDetectionDisabled ? 'pass' : 'fail'} | ${run.fairnessPins.availabilityReset ? 'pass' : 'fail'} | ${run.fairnessPins.dynamicConfigFixed ? 'pass' : 'fail'} | ${run.fairnessPins.sessionIsolated ? 'pass' : 'fail'} | ${run.fairnessPins.sandboxIsolated ? 'pass' : 'fail'} |`,
    );
  }

  lines.push('');
  lines.push('## 6) Conclusion');
  lines.push('');
  lines.push(
    report.allPinsPassAllRuns && report.invalidRunCount === 0
      ? 'Fairness audit passed for every run. FP-01 through FP-06 are recorded and passing across initial and resumed executions.'
      : 'Fairness audit found one or more failures. Review per-run audit rows before using the benchmark outputs for comparison.',
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
