/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  RealBenchmarkCampaignManifest,
  RealBenchmarkCampaignSummary,
  RealBenchmarkConditionId,
  RealBenchmarkConditionSummary,
  RealBenchmarkEscalationTiming,
  RealBenchmarkEscalationTimingSummary,
  RealBenchmarkRunRecord,
} from './pollux-real-types.js';

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length !== values.length) {
    return null;
  }
  return present.reduce((sum, value) => sum + value, 0);
}

function divideOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function getEscalationEvents(run: RealBenchmarkRunRecord) {
  return run.escalationEvents ?? [];
}

function getExcludedFromConfusion(run: RealBenchmarkRunRecord) {
  return run.excludedFromConfusion ?? null;
}

function buildConditionSummary(
  conditionId: RealBenchmarkConditionId,
  runs: RealBenchmarkRunRecord[],
): RealBenchmarkConditionSummary {
  const validRuns = runs.filter((run) => !run.invalidated);
  const serviceLatencies = validRuns.flatMap((run) => run.serviceLatencyMs);

  return {
    conditionId,
    sampleCount: runs.length,
    validSamples: validRuns.length,
    invalidSamples: runs.length - validRuns.length,
    accuracy:
      validRuns.length === 0
        ? 0
        : validRuns.filter((run) => run.oraclePass).length / validRuns.length,
    advisorCalls: validRuns.reduce(
      (sum, run) => sum + run.observedAdvisorCalls,
      0,
    ),
    totalTokens: validRuns.reduce((sum, run) => sum + run.tokens.total, 0),
    advisorTokens: validRuns.reduce((sum, run) => sum + run.tokens.advisor, 0),
    executorTokens: validRuns.reduce(
      (sum, run) => sum + run.tokens.executor,
      0,
    ),
    totalCostUsd: sumNullable(validRuns.map((run) => run.costUsd.total)),
    meanWallClockMs: mean(validRuns.map((run) => run.wallClockMs)),
    meanServiceLatencyMs: mean(serviceLatencies),
  };
}

function buildConfusionCounts(params: {
  runs: RealBenchmarkRunRecord[];
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>;
}) {
  let predictedPositive = 0;
  let expectedPositive = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;

  for (const run of params.runs) {
    const predicted = run.observedAdvisorCalls > 0;
    const expected =
      run.taskEscalates && params.polluxEnabledByCondition[run.conditionId];

    if (predicted) {
      predictedPositive += 1;
    }
    if (expected) {
      expectedPositive += 1;
    }

    if (predicted && expected) {
      truePositive += 1;
    } else if (predicted && !expected) {
      falsePositive += 1;
    } else if (!predicted && expected) {
      falseNegative += 1;
    } else {
      trueNegative += 1;
    }
  }

  return {
    predictedPositive,
    expectedPositive,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: divideOrNull(truePositive, predictedPositive),
    recall: divideOrNull(truePositive, expectedPositive),
  };
}

function getPrimaryTiming(
  run: RealBenchmarkRunRecord,
): RealBenchmarkEscalationTiming | null {
  const consultRelated = new Set([
    'consulted',
    'fail_open',
    'budget_exhausted',
    'policy_denied',
    'deferred_next_turn',
  ]);
  const primary = getEscalationEvents(run).find(
    (event) =>
      event.outcome !== null &&
      consultRelated.has(event.outcome) &&
      event.escalationTiming !== null,
  );
  return primary?.escalationTiming ?? null;
}

function buildTimingBreakdown(params: {
  runs: RealBenchmarkRunRecord[];
  polluxEnabledByCondition: Readonly<Record<RealBenchmarkConditionId, boolean>>;
}): RealBenchmarkEscalationTimingSummary[] {
  const timingValues: RealBenchmarkEscalationTiming[] = [
    'same_turn',
    'next_turn',
  ];
  const breakdown: RealBenchmarkEscalationTimingSummary[] = [];

  for (const timing of timingValues) {
    const timingRuns = params.runs.filter(
      (run) => getPrimaryTiming(run) === timing,
    );
    const confusion = buildConfusionCounts({
      runs: timingRuns,
      polluxEnabledByCondition: params.polluxEnabledByCondition,
    });
    breakdown.push({
      timing,
      includedSampleCount: timingRuns.length,
      predictedPositive: confusion.predictedPositive,
      expectedPositive: confusion.expectedPositive,
      truePositive: confusion.truePositive,
      falsePositive: confusion.falsePositive,
      falseNegative: confusion.falseNegative,
      trueNegative: confusion.trueNegative,
      precision: confusion.precision,
      recall: confusion.recall,
    });
  }

  return breakdown;
}

function buildReasonCodeCounts(
  runs: RealBenchmarkRunRecord[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const run of runs) {
    for (const event of getEscalationEvents(run)) {
      if (!event.reasonCode) {
        continue;
      }
      counts.set(event.reasonCode, (counts.get(event.reasonCode) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

function buildEscalationEvidenceBlockers(
  runs: RealBenchmarkRunRecord[],
): string[] {
  const validRuns = runs.filter((run) => !run.invalidated);
  const blockers: string[] = [];

  const hasAdvisorWithoutEscalationEvidence = validRuns.some(
    (run) =>
      run.observedAdvisorCalls > 0 && getEscalationEvents(run).length === 0,
  );
  if (hasAdvisorWithoutEscalationEvidence) {
    blockers.push(
      'Advisor calls were observed in valid samples, but no pollux escalation telemetry events were captured for at least one such sample.',
    );
  }

  const consultRelated = new Set([
    'consulted',
    'fail_open',
    'budget_exhausted',
    'policy_denied',
    'deferred_next_turn',
  ]);
  const hasMissingReasonOrTiming = validRuns.some((run) =>
    getEscalationEvents(run).some(
      (event) =>
        event.outcome !== null &&
        consultRelated.has(event.outcome) &&
        (event.reasonCode === null || event.escalationTiming === null),
    ),
  );
  if (hasMissingReasonOrTiming) {
    blockers.push(
      'Escalation telemetry is present, but at least one consult-related escalation event is missing reason_code or escalation_timing.',
    );
  }

  return blockers;
}

export function buildRealBenchmarkCampaignSummary(
  manifest: RealBenchmarkCampaignManifest,
  corpusSha: string,
  runs: RealBenchmarkRunRecord[],
  publishabilityBlockers: string[],
): RealBenchmarkCampaignSummary {
  const validRuns = runs.filter((run) => !run.invalidated);
  const includedRuns = validRuns.filter(
    (run) => getExcludedFromConfusion(run) === null,
  );
  const polluxEnabledByCondition = Object.fromEntries(
    manifest.conditions.map((condition) => [
      condition.id,
      condition.polluxEnabled,
    ]),
  ) as Readonly<Record<RealBenchmarkConditionId, boolean>>;
  const confusion = buildConfusionCounts({
    runs: includedRuns,
    polluxEnabledByCondition,
  });
  const evidenceBlockers = buildEscalationEvidenceBlockers(runs);

  return {
    generatedAt: new Date().toISOString(),
    manifest,
    corpusSha,
    sampleCount: runs.length,
    validSampleCount: validRuns.length,
    invalidSampleCount: runs.filter((run) => run.invalidated).length,
    conditionSummaries: manifest.conditions.map((condition) =>
      buildConditionSummary(
        condition.id,
        runs.filter((run) => run.conditionId === condition.id),
      ),
    ),
    escalation: {
      includedSampleCount: includedRuns.length,
      predictedPositive: confusion.predictedPositive,
      expectedPositive: confusion.expectedPositive,
      truePositive: confusion.truePositive,
      falsePositive: confusion.falsePositive,
      falseNegative: confusion.falseNegative,
      trueNegative: confusion.trueNegative,
      precision: confusion.precision,
      recall: confusion.recall,
      exclusionCounts: {
        budgetExhausted: validRuns.filter(
          (run) => getExcludedFromConfusion(run) === 'budget_exhausted',
        ).length,
        failOpen: validRuns.filter(
          (run) => getExcludedFromConfusion(run) === 'fail_open',
        ).length,
      },
    },
    escalationTiming: buildTimingBreakdown({
      runs: includedRuns,
      polluxEnabledByCondition,
    }),
    reasonCodeCounts: buildReasonCodeCounts(validRuns),
    publishabilityBlockers: [
      ...new Set([...publishabilityBlockers, ...evidenceBlockers]),
    ],
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatNullableCurrency(value: number | null): string {
  return value === null ? 'n/a' : `$${value.toFixed(4)}`;
}

function formatRate(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
}

export function renderRealBenchmarkCampaignReport(
  summary: RealBenchmarkCampaignSummary,
): string {
  const lines: string[] = [];

  lines.push('# Pollux Real-Model Benchmark Campaign Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Campaign: ${summary.manifest.campaignId}`);
  lines.push(`Mode: ${summary.manifest.mode}`);
  lines.push(`Venue: ${summary.manifest.runVenue}`);
  lines.push(`Auth isolation: ${summary.manifest.authIsolationMode}`);
  lines.push(
    `Canonical surface: ${summary.manifest.canonicalSurface.replaceAll('_', ' ')}`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Overall status');
  lines.push('');
  lines.push(`- Samples collected: ${summary.sampleCount}`);
  lines.push(`- Valid samples: ${summary.validSampleCount}`);
  lines.push(`- Invalid samples: ${summary.invalidSampleCount}`);
  lines.push(`- Corpus SHA: \`${summary.corpusSha}\``);
  lines.push('');
  lines.push('## 2) Condition summaries');
  lines.push('');
  lines.push(
    '| Condition | Samples | Valid | Invalid | Accuracy | Advisor calls | Total tokens | Advisor tokens | Executor tokens | Estimated cost | Mean wall ms | Mean service ms |',
  );
  lines.push(
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const condition of summary.conditionSummaries) {
    lines.push(
      `| ${condition.conditionId} | ${condition.sampleCount} | ${condition.validSamples} | ${condition.invalidSamples} | ${(condition.accuracy * 100).toFixed(1)}% | ${condition.advisorCalls} | ${condition.totalTokens} | ${condition.advisorTokens} | ${condition.executorTokens} | ${formatNullableCurrency(condition.totalCostUsd)} | ${formatNumber(condition.meanWallClockMs)} | ${formatNumber(condition.meanServiceLatencyMs)} |`,
    );
  }
  lines.push('');
  lines.push('## 3) Escalation confusion matrix');
  lines.push('');
  lines.push(
    `- Included samples: ${summary.escalation.includedSampleCount} (excluded fail_open=${summary.escalation.exclusionCounts.failOpen}, budget_exhausted=${summary.escalation.exclusionCounts.budgetExhausted})`,
  );
  lines.push(
    `- Confusion counts: TP=${summary.escalation.truePositive}, FP=${summary.escalation.falsePositive}, FN=${summary.escalation.falseNegative}, TN=${summary.escalation.trueNegative}`,
  );
  lines.push(
    `- Precision: ${formatRate(summary.escalation.precision)} (${summary.escalation.truePositive}/${summary.escalation.predictedPositive})`,
  );
  lines.push(
    `- Recall: ${formatRate(summary.escalation.recall)} (${summary.escalation.truePositive}/${summary.escalation.expectedPositive})`,
  );
  lines.push('');
  lines.push('## 4) Escalation timing split');
  lines.push('');
  lines.push('| Timing | Included | TP | FP | FN | TN | Precision | Recall |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const timing of summary.escalationTiming) {
    lines.push(
      `| ${timing.timing} | ${timing.includedSampleCount} | ${timing.truePositive} | ${timing.falsePositive} | ${timing.falseNegative} | ${timing.trueNegative} | ${formatRate(timing.precision)} | ${formatRate(timing.recall)} |`,
    );
  }
  lines.push('');
  lines.push('## 5) Reason-code distribution');
  lines.push('');
  const reasonEntries = Object.entries(summary.reasonCodeCounts);
  if (reasonEntries.length === 0) {
    lines.push('- No reason-code telemetry events were captured.');
  } else {
    lines.push('| Reason code | Count |');
    lines.push('| --- | ---: |');
    for (const [reasonCode, count] of reasonEntries) {
      lines.push(`| ${reasonCode} | ${count} |`);
    }
  }
  lines.push('');
  lines.push('## 6) Publishability verdict');
  lines.push('');
  if (summary.publishabilityBlockers.length === 0) {
    lines.push(
      'This campaign has no tracked publishability blockers at the artifact layer. Publication still depends on satisfying the broader methodology and release process.',
    );
  } else {
    lines.push(
      'This campaign is not publishable yet. The blockers below must be cleared before any real-model benchmark claim is treated as repo-grade evidence.',
    );
    lines.push('');
    for (const blocker of summary.publishabilityBlockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return lines.join('\n');
}

export function loadRealBenchmarkRuns(
  artifactRoot: string,
): RealBenchmarkRunRecord[] {
  const rawRoot = path.join(artifactRoot, 'raw');
  if (!fs.existsSync(rawRoot)) {
    return [];
  }

  const runs: RealBenchmarkRunRecord[] = [];
  const conditionDirs = fs.readdirSync(rawRoot);
  for (const conditionDir of conditionDirs) {
    const taskRoot = path.join(rawRoot, conditionDir);
    if (!fs.statSync(taskRoot).isDirectory()) {
      continue;
    }
    const taskDirs = fs.readdirSync(taskRoot);
    for (const taskDir of taskDirs) {
      const runRoot = path.join(taskRoot, taskDir);
      if (!fs.statSync(runRoot).isDirectory()) {
        continue;
      }
      const files = fs
        .readdirSync(runRoot)
        .filter((entry) => entry.endsWith('.json'))
        .sort();
      for (const fileName of files) {
        const record = JSON.parse(
          fs.readFileSync(path.join(runRoot, fileName), 'utf8'),
        ) as RealBenchmarkRunRecord;
        runs.push(record);
      }
    }
  }

  return runs;
}
