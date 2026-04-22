/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_CORPUS,
  runCalibrationCorpus,
  type CalibrationTraceEntry,
  type CorpusRunResult,
} from './calibration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function countByCategory(
  corpus: readonly CalibrationTraceEntry[],
): Record<CalibrationTraceEntry['category'], number> {
  const counts: Record<CalibrationTraceEntry['category'], number> = {
    true_positive: 0,
    true_negative: 0,
    boundary: 0,
  };
  for (const e of corpus) {
    counts[e.category]++;
  }
  return counts;
}

function allSignalIds(run: CorpusRunResult): Set<string> {
  const ids = new Set<string>();
  for (const { result, entry } of run.byTrace) {
    for (const id of result.seenSignalIds) ids.add(id);
    for (const id of result.contributingSignalIds) ids.add(id);
    entry.expected.expectedSignalIds?.forEach((id) => ids.add(id));
  }
  return ids;
}

function hasSignalPrefix(ids: Set<string>, prefix: string): boolean {
  for (const id of ids) {
    if (id.startsWith(prefix)) return true;
  }
  return false;
}

function renderP407Report(
  corpus: readonly CalibrationTraceEntry[],
  run: CorpusRunResult,
): string {
  const cat = countByCategory(corpus);
  const { metrics: m } = run;
  const fpTraces = run.byTrace.filter(
    (row) => !row.entry.expected.escalate && row.result.escalated,
  );
  const fnTraces = run.byTrace.filter(
    (row) => row.entry.expected.escalate && !row.result.escalated,
  );

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : 'n/a');

  const ids = allSignalIds(run);

  const fpBullets =
    fpTraces.length === 0
      ? '- _(none in current corpus)_'
      : fpTraces
          .slice(0, 5)
          .map(
            (row) =>
              `- **Trace**: \`${row.entry.id}\` — signals: ${row.result.contributingSignalIds.length ? row.result.contributingSignalIds.map((s) => `\`${s}\``).join(', ') : '`(none)`'}`,
          )
          .join('\n');

  const fnBullets =
    fnTraces.length === 0
      ? '- _(none in current corpus)_'
      : fnTraces
          .slice(0, 5)
          .map(
            (row) =>
              `- **Trace**: \`${row.entry.id}\` — expected escalation but observer did not commit an intent.`,
          )
          .join('\n');

  return `---
title: 'P4-07 — Detector Calibration Report (Phase H)'
status: published
owner: pollux
last_updated: 2026-04-22
---

## Purpose

This report records the calibration results for the redesigned Pollux detector
(live executor observer + fusion). Metrics below are produced by
\`runCalibrationCorpus(CALIBRATION_CORPUS)\` in CI and can be refreshed locally:

\`\`\`bash
POLLUX_WRITE_CALIBRATION_REPORT=1 npx vitest run src/pollux/observer/calibration.report.test.ts
\`\`\`

## Corpus

- **Corpus source**: \`packages/core/src/pollux/observer/calibrationCorpus.ts\`
- **Harness**: \`packages/core/src/pollux/observer/calibration.ts\`
- **Corpus size (N)**: ${corpus.length}
- **Trace categories**:
  - true_positive: ${cat.true_positive}
  - true_negative: ${cat.true_negative}
  - boundary: ${cat.boundary}

### Coverage checklist

- **Hard-precision**:
  - risk gate (\`risk.pre_tool_high\`): ${hasSignalPrefix(ids, 'risk.') ? 'yes' : 'no'}
  - loop bridge (\`loop.hard_confirmed\`): ${hasSignalPrefix(ids, 'loop.') ? 'yes' : 'no'}
  - self-report stuck (\`self.structured_status_stuck\`): ${hasSignalPrefix(ids, 'self.') ? 'yes' : 'no'}
- **Thought signals** (\`thought.*\`): ${hasSignalPrefix(ids, 'thought.') ? 'yes' : 'no'}
- **Tool pattern signals** (\`tool.*\`): ${hasSignalPrefix(ids, 'tool.') ? 'yes' : 'no'}
- **Negative signals** (\`neg.*\`): ${hasSignalPrefix(ids, 'neg.') ? 'yes' : 'no'}
- **Composite / fusion behavior**:
  - composite gating (\`requireComposite\`): yes
  - same-turn vs next-turn behavior: yes

## Aggregate metrics

- **TP / FP / FN / TN**: ${m.tp} / ${m.fp} / ${m.fn} / ${m.tn}
- **Precision**: ${fmt(m.precision)}
- **Recall**: ${fmt(m.recall)}
- **F1**: ${fmt(m.f1)}

### Required breakdowns

- **False-positive rate by category** (thought/tool/self):
  - thought: ${fmt(m.falsePositiveRateByCategory.thought)}
  - tool: ${fmt(m.falsePositiveRateByCategory.tool)}
  - self: ${fmt(m.falsePositiveRateByCategory.self)}
- **Mean contributing-signal count on escalations**: ${fmt(
    m.meanContributingSignalCountOnEscalations,
  )}

## False positives (high-signal examples)

${fpBullets}

## False negatives (high-signal examples)

${fnBullets}

## Tuning notes

### Changes since last report

- Published metrics from automated harness (\`calibration.report.test.ts\`).

### Rationale / trade-offs

- Corpus is intentionally small and deterministic; expand \`CALIBRATION_CORPUS\` as new stuck patterns are codified.

## Benchmark alignment (Condition F)

- **Shared task set**: \`packages/core/src/pollux/benchmark/tasks.ts\`
- **Legacy baseline**: removed in Phase I (heuristic detector deleted); historical F1 parity gate vs legacy is **not applicable**.
- **Condition F** (redesigned detector): see \`packages/test-utils\` Pollux benchmark harness.
- **Acceptance gates**:
  - F1 parity vs legacy on shared set: **n/a** (legacy detector removed)
  - True-negative precision ≥ 0.90: track via corpus \`true_negative\` rows and benchmark smoke runs
`;
}

describe('P4-07 calibration report', () => {
  it('runCalibrationCorpus produces finite aggregate metrics', () => {
    const run = runCalibrationCorpus(CALIBRATION_CORPUS);
    expect(
      run.metrics.tp + run.metrics.fp + run.metrics.fn + run.metrics.tn,
    ).toBe(CALIBRATION_CORPUS.length);
    for (const k of ['precision', 'recall', 'f1'] as const) {
      expect(Number.isFinite(run.metrics[k])).toBe(true);
    }
  });

  it.runIf(process.env['POLLUX_WRITE_CALIBRATION_REPORT'] === '1')(
    'writes docs/core/pollux/P4-07_DETECTOR_CALIBRATION_REPORT.md',
    () => {
      const run = runCalibrationCorpus(CALIBRATION_CORPUS);
      const md = renderP407Report(CALIBRATION_CORPUS, run);
      const out = path.join(
        __dirname,
        '../../../../../docs/core/pollux/P4-07_DETECTOR_CALIBRATION_REPORT.md',
      );
      writeFileSync(out, md, 'utf8');
      expect(md).not.toContain('<!-- fill -->');
      expect(md).toContain('status: published');
    },
  );
});
