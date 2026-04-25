/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILOT_SENTINEL_TASK_IDS,
  REAL_BENCHMARK_SEED_CORPUS,
} from '../../core/src/pollux/benchmark/realTasks.js';
import {
  POLLUX_REAL_ARTIFACT_ROOT,
  buildDefaultCampaignManifest,
  collectRealBenchmarkBuildFreshness,
  resolveCliEntrypoint,
} from './pollux-real-config.js';
import {
  buildRealBenchmarkPreflightReport,
  loadPricingSnapshotFromPath,
} from './pollux-real-preflight.js';
import { runPolluxRealCampaign } from './pollux-real-pilot.js';
import type {
  RealBenchmarkAcceptanceSummary,
  RealBenchmarkAcceptanceThresholds,
  RealBenchmarkCampaignSummary,
  RealBenchmarkCanaryReliabilitySummary,
  RealBenchmarkStressSummary,
} from './pollux-real-types.js';

export const POLLUX_REAL_M2_ACCEPTANCE_THRESHOLDS: RealBenchmarkAcceptanceThresholds =
  buildPolluxRealM2AcceptanceThresholds();

export function buildPolluxRealM2AcceptanceThresholds(
  params: {
    campaignCount?: number;
    repeatsPerCampaign?: number;
    expectedPositiveCanaryTasksPerRepeat?: number;
  } = {},
): RealBenchmarkAcceptanceThresholds {
  const campaignCount = params.campaignCount ?? 5;
  const repeatsPerCampaign = params.repeatsPerCampaign ?? 3;
  const expectedPositiveCanaryTasksPerRepeat =
    params.expectedPositiveCanaryTasksPerRepeat ?? 2;
  return {
    campaignCount,
    repeatsPerCampaign,
    expectedPositiveValidSampleCount:
      campaignCount * repeatsPerCampaign * expectedPositiveCanaryTasksPerRepeat,
    minConsultSuccessRate: 0.9,
    minConsultSuccessWilson95LowerBound: 0.75,
    maxParseErrorCount: 0,
    maxFalseNegativeCount: 0,
    maxBudgetExhaustedCount: 0,
  };
}

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function parsePositiveIntegerArg(...flags: string[]): number | undefined {
  for (const flag of flags) {
    const rawValue = parseArg(flag);
    if (rawValue === undefined) {
      continue;
    }
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`${flag} must be a positive integer.`);
    }
    return parsed;
  }
  return undefined;
}

function parseNonNegativeIntegerArg(...flags: string[]): number {
  for (const flag of flags) {
    const rawValue = parseArg(flag);
    if (rawValue === undefined) {
      continue;
    }
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${flag} must be a non-negative integer.`);
    }
    return parsed;
  }
  return 0;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function mergeFailureKindCounts(
  summaries: RealBenchmarkCanaryReliabilitySummary[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    for (const [failureKind, count] of Object.entries(
      summary.failureKindCounts,
    )) {
      counts.set(failureKind, (counts.get(failureKind) ?? 0) + count);
    }
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

function aggregateStressSummary(
  summaries: RealBenchmarkCampaignSummary[],
): RealBenchmarkStressSummary {
  const invalidationReasonCounts = new Map<string, number>();
  let sampleCount = 0;
  let validSampleCount = 0;
  let invalidSampleCount = 0;
  let modelCallCeilingExceededCount = 0;
  let meanModelResponseNumerator = 0;
  let meanTotalTokensNumerator = 0;

  for (const summary of summaries) {
    sampleCount += summary.stressSummary.sampleCount;
    validSampleCount += summary.stressSummary.validSampleCount;
    invalidSampleCount += summary.stressSummary.invalidSampleCount;
    modelCallCeilingExceededCount +=
      summary.stressSummary.modelCallCeilingExceededCount;
    meanModelResponseNumerator +=
      summary.stressSummary.meanModelResponseCount *
      summary.stressSummary.sampleCount;
    meanTotalTokensNumerator +=
      summary.stressSummary.meanTotalTokens * summary.stressSummary.sampleCount;
    for (const [reason, count] of Object.entries(
      summary.stressSummary.invalidationReasonCounts,
    )) {
      invalidationReasonCounts.set(
        reason,
        (invalidationReasonCounts.get(reason) ?? 0) + count,
      );
    }
  }

  return {
    sampleCount,
    validSampleCount,
    invalidSampleCount,
    modelCallCeilingExceededCount,
    invalidationReasonCounts: Object.fromEntries(
      [...invalidationReasonCounts.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
    meanModelResponseCount:
      sampleCount > 0 ? meanModelResponseNumerator / sampleCount : 0,
    meanTotalTokens:
      sampleCount > 0 ? meanTotalTokensNumerator / sampleCount : 0,
  };
}

export function buildPolluxRealAcceptanceSummary(params: {
  acceptanceId: string;
  campaignSummaries: RealBenchmarkCampaignSummary[];
  thresholds: RealBenchmarkAcceptanceThresholds;
}): RealBenchmarkAcceptanceSummary {
  const canarySummaries = params.campaignSummaries.map(
    (summary) => summary.canaryReliabilitySummary,
  );
  const aggregateExpectedPositive = canarySummaries.reduce(
    (sum, summary) => sum + summary.expectedPositiveSampleCount,
    0,
  );
  const aggregateValidExpectedPositive = canarySummaries.reduce(
    (sum, summary) => sum + summary.validExpectedPositiveSampleCount,
    0,
  );
  const aggregateConsulted = canarySummaries.reduce(
    (sum, summary) => sum + summary.consultedCount,
    0,
  );
  const aggregateFailOpen = canarySummaries.reduce(
    (sum, summary) => sum + summary.failOpenCount,
    0,
  );
  const aggregateParseError = canarySummaries.reduce(
    (sum, summary) => sum + summary.parseErrorCount,
    0,
  );
  const aggregateFalseNegative = canarySummaries.reduce(
    (sum, summary) => sum + summary.falseNegativeCount,
    0,
  );
  const aggregateBudgetExhausted = canarySummaries.reduce(
    (sum, summary) => sum + summary.budgetExhaustedCount,
    0,
  );
  const aggregateConsultSuccessRate =
    aggregateValidExpectedPositive > 0
      ? aggregateConsulted / aggregateValidExpectedPositive
      : null;
  const z = 1.959963984540054;
  const p = aggregateConsultSuccessRate ?? 0;
  const n = aggregateValidExpectedPositive;
  const denom = n > 0 ? 1 + z ** 2 / n : 0;
  const center = n > 0 ? p + z ** 2 / (2 * n) : 0;
  const margin =
    n > 0 ? z * Math.sqrt((p * (1 - p)) / n + z ** 2 / (4 * n ** 2)) : 0;
  const aggregateCanaryReliability: RealBenchmarkCanaryReliabilitySummary = {
    expectedPositiveSampleCount: aggregateExpectedPositive,
    validExpectedPositiveSampleCount: aggregateValidExpectedPositive,
    consultedCount: aggregateConsulted,
    failOpenCount: aggregateFailOpen,
    parseErrorCount: aggregateParseError,
    falseNegativeCount: aggregateFalseNegative,
    budgetExhaustedCount: aggregateBudgetExhausted,
    consultSuccessRate: aggregateConsultSuccessRate,
    consultSuccessWilson95: {
      n,
      proportion: aggregateConsultSuccessRate,
      lower: n > 0 ? Math.max(0, (center - margin) / denom) : null,
      upper: n > 0 ? Math.min(1, (center + margin) / denom) : null,
    },
    attemptPathCounts: {
      primarySuccess: canarySummaries.reduce(
        (sum, summary) => sum + summary.attemptPathCounts.primarySuccess,
        0,
      ),
      repairRetrySuccess: canarySummaries.reduce(
        (sum, summary) => sum + summary.attemptPathCounts.repairRetrySuccess,
        0,
      ),
      fallbackSuccess: canarySummaries.reduce(
        (sum, summary) => sum + summary.attemptPathCounts.fallbackSuccess,
        0,
      ),
      finalFailOpen: canarySummaries.reduce(
        (sum, summary) => sum + summary.attemptPathCounts.finalFailOpen,
        0,
      ),
    },
    failureKindCounts: mergeFailureKindCounts(canarySummaries),
  };

  const aggregateCoreDesiredOutcomeFailures = params.campaignSummaries.reduce(
    (sum, summary) =>
      sum +
      summary.laneConditionSummaries
        .filter((laneSummary) => laneSummary.lane === 'core')
        .reduce(
          (laneSum, laneSummary) =>
            laneSum +
            (laneSummary.sampleCount -
              laneSummary.desiredOutcomeSatisfiedCount),
          0,
        ),
    0,
  );

  const failedThresholds: string[] = [];
  if (params.campaignSummaries.length !== params.thresholds.campaignCount) {
    failedThresholds.push(
      `campaign count ${params.campaignSummaries.length}/${params.thresholds.campaignCount}`,
    );
  }
  if (
    aggregateValidExpectedPositive !==
    params.thresholds.expectedPositiveValidSampleCount
  ) {
    failedThresholds.push(
      `valid expected-positive canaries ${aggregateValidExpectedPositive}/${params.thresholds.expectedPositiveValidSampleCount}`,
    );
  }
  if (
    (aggregateConsultSuccessRate ?? 0) < params.thresholds.minConsultSuccessRate
  ) {
    failedThresholds.push(
      `consult success rate ${(aggregateConsultSuccessRate ?? 0).toFixed(3)} < ${params.thresholds.minConsultSuccessRate.toFixed(3)}`,
    );
  }
  if (
    (aggregateCanaryReliability.consultSuccessWilson95.lower ?? 0) <
    params.thresholds.minConsultSuccessWilson95LowerBound
  ) {
    failedThresholds.push(
      `Wilson lower bound ${(aggregateCanaryReliability.consultSuccessWilson95.lower ?? 0).toFixed(3)} < ${params.thresholds.minConsultSuccessWilson95LowerBound.toFixed(3)}`,
    );
  }
  if (aggregateParseError > params.thresholds.maxParseErrorCount) {
    failedThresholds.push(
      `parse_error count ${aggregateParseError} > ${params.thresholds.maxParseErrorCount}`,
    );
  }
  if (aggregateFalseNegative > params.thresholds.maxFalseNegativeCount) {
    failedThresholds.push(
      `false_negative count ${aggregateFalseNegative} > ${params.thresholds.maxFalseNegativeCount}`,
    );
  }
  if (aggregateBudgetExhausted > params.thresholds.maxBudgetExhaustedCount) {
    failedThresholds.push(
      `budget_exhausted count ${aggregateBudgetExhausted} > ${params.thresholds.maxBudgetExhaustedCount}`,
    );
  }
  if (aggregateCoreDesiredOutcomeFailures > 0) {
    failedThresholds.push(
      `core desired-outcome failures ${aggregateCoreDesiredOutcomeFailures} > 0`,
    );
  }

  const conditionF = params.campaignSummaries[0]?.manifest.conditions.find(
    (condition) => condition.id === 'F',
  );

  return {
    generatedAt: new Date().toISOString(),
    acceptanceId: params.acceptanceId,
    pilotPair: {
      executorModel: conditionF?.executorModel ?? 'unknown',
      advisorModel: conditionF?.advisorModel ?? 'unknown',
      advisorFallbackModel: conditionF?.advisorFallbackModel ?? null,
    },
    thresholds: params.thresholds,
    campaignCount: params.campaignSummaries.length,
    campaigns: params.campaignSummaries.map((summary) => ({
      campaignId: summary.manifest.campaignId,
      sampleCount: summary.sampleCount,
      validSampleCount: summary.validSampleCount,
      canaryConsultSummary: summary.canaryConsultSummary,
      canaryReliabilitySummary: summary.canaryReliabilitySummary,
      publishabilityBlockers: summary.publishabilityBlockers,
    })),
    aggregateCanaryReliability,
    aggregateCoreDesiredOutcomeFailures,
    aggregateStressSummary: aggregateStressSummary(params.campaignSummaries),
    pass: failedThresholds.length === 0,
    failedThresholds,
  };
}

function renderAcceptanceReport(
  summary: RealBenchmarkAcceptanceSummary,
  campaignSummaries: RealBenchmarkCampaignSummary[],
): string {
  const lines: string[] = [];
  lines.push('# Pollux Milestone 2 Acceptance Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Acceptance id: ${summary.acceptanceId}`);
  lines.push(
    `Pilot pair: executor=${summary.pilotPair.executorModel}, advisor=${summary.pilotPair.advisorModel}, fallback=${summary.pilotPair.advisorFallbackModel ?? 'none'}`,
  );
  lines.push('');
  lines.push('## 1) Aggregate decision');
  lines.push('');
  lines.push(`- Pass: ${summary.pass ? 'yes' : 'no'}`);
  lines.push(
    `- Valid expected-positive canaries: ${summary.aggregateCanaryReliability.validExpectedPositiveSampleCount}`,
  );
  lines.push(
    `- Consult success rate: ${((summary.aggregateCanaryReliability.consultSuccessRate ?? 0) * 100).toFixed(1)}%`,
  );
  lines.push(
    `- Wilson lower bound: ${((summary.aggregateCanaryReliability.consultSuccessWilson95.lower ?? 0) * 100).toFixed(1)}%`,
  );
  lines.push(
    `- Parse errors: ${summary.aggregateCanaryReliability.parseErrorCount}`,
  );
  lines.push(
    `- False negatives: ${summary.aggregateCanaryReliability.falseNegativeCount}`,
  );
  lines.push(
    `- Budget exhausted: ${summary.aggregateCanaryReliability.budgetExhaustedCount}`,
  );
  lines.push(
    `- Core desired-outcome failures: ${summary.aggregateCoreDesiredOutcomeFailures}`,
  );
  if (summary.failedThresholds.length > 0) {
    lines.push('');
    lines.push('Failed thresholds:');
    for (const failure of summary.failedThresholds) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push('');
  lines.push('## 2) Per-campaign canary reliability');
  lines.push('');
  lines.push(
    '| Campaign | Samples | Valid | Consulted | Fail-open | Parse error | False negative |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const campaign of summary.campaigns) {
    lines.push(
      `| ${campaign.campaignId} | ${campaign.sampleCount} | ${campaign.validSampleCount} | ${campaign.canaryReliabilitySummary.consultedCount} | ${campaign.canaryReliabilitySummary.failOpenCount} | ${campaign.canaryReliabilitySummary.parseErrorCount} | ${campaign.canaryReliabilitySummary.falseNegativeCount} |`,
    );
  }
  lines.push('');
  lines.push('## 3) Per-repeat canary results');
  lines.push('');
  lines.push(
    '| Campaign | Repeat | Consulted | Fail-open | Precision | Recall |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const campaignSummary of campaignSummaries) {
    for (const repeat of campaignSummary.repeatSummaries) {
      lines.push(
        `| ${campaignSummary.manifest.campaignId} | ${repeat.sampleIndex} | ${repeat.canaryConsultSummary.consulted} | ${repeat.canaryConsultSummary.failOpen} | ${((repeat.escalation.precision ?? 0) * 100).toFixed(1)}% | ${((repeat.escalation.recall ?? 0) * 100).toFixed(1)}% |`,
      );
    }
  }
  return lines.join('\n');
}

export async function runPolluxRealAcceptance() {
  const acceptanceId =
    parseArg('--acceptance-id') ??
    `m2-acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const taskIds = parseArg('--task-ids')
    ?.split(',')
    .map((value) => value.trim()) ?? [...PILOT_SENTINEL_TASK_IDS];
  const pricingSnapshotPath = parseArg('--pricing-snapshot');
  const binaryPath = parseArg('--binary-path');
  const campaignCount =
    parsePositiveIntegerArg('--campaigns', '--campaign-count') ??
    POLLUX_REAL_M2_ACCEPTANCE_THRESHOLDS.campaignCount;
  const repeatsPerCampaign =
    parsePositiveIntegerArg('--repeats', '--repeats-per-campaign') ??
    POLLUX_REAL_M2_ACCEPTANCE_THRESHOLDS.repeatsPerCampaign;
  const campaignDelayMs = parseNonNegativeIntegerArg(
    '--campaign-delay-ms',
    '--delay-ms-between-campaigns',
  );
  const entrypointPreference =
    parseArg('--entrypoint') === 'bundle' ||
    parseArg('--entrypoint') === 'dev_script' ||
    parseArg('--entrypoint') === 'auto'
      ? (parseArg('--entrypoint') as 'auto' | 'bundle' | 'dev_script')
      : undefined;

  const manifest = buildDefaultCampaignManifest(
    `${acceptanceId}-preflight`,
    taskIds,
  );
  manifest.repeatsPerCell = repeatsPerCampaign;
  if (pricingSnapshotPath) {
    manifest.pricingSnapshotPath = pricingSnapshotPath;
  }
  const selectedTasks = REAL_BENCHMARK_SEED_CORPUS.filter((task) =>
    taskIds.includes(task.id),
  );
  const expectedPositiveCanaryTasksPerRepeat = selectedTasks.filter(
    (task) => task.benchmarkLane === 'canary' && task.escalates,
  ).length;
  const thresholds = buildPolluxRealM2AcceptanceThresholds({
    campaignCount,
    repeatsPerCampaign,
    expectedPositiveCanaryTasksPerRepeat,
  });
  const pricingSnapshot = loadPricingSnapshotFromPath(pricingSnapshotPath);
  const preflight = buildRealBenchmarkPreflightReport(
    manifest,
    selectedTasks,
    pricingSnapshot,
    binaryPath,
    entrypointPreference,
  );
  const buildFreshness = collectRealBenchmarkBuildFreshness();
  const entrypoint = resolveCliEntrypoint(binaryPath, entrypointPreference);
  const blockers: string[] = [];
  if (buildFreshness.repoDirty) {
    blockers.push('Acceptance runs require a clean git worktree.');
  }
  if (entrypoint.kind === 'dev_script') {
    blockers.push('Acceptance runs require a built bundle or explicit binary.');
  }
  if (!buildFreshness.distCommitsMatchSource) {
    blockers.push('Acceptance runs require dist commits to match source.');
  }
  if (!pricingSnapshotPath || pricingSnapshot === undefined) {
    blockers.push('Acceptance runs require a frozen pricing snapshot path.');
  }
  if (preflight.runBlockers.length > 0) {
    blockers.push(...preflight.runBlockers);
  }
  if (blockers.length > 0) {
    throw new Error(`Acceptance preflight failed:\n- ${blockers.join('\n- ')}`);
  }

  const acceptanceRoot = path.join(POLLUX_REAL_ARTIFACT_ROOT, acceptanceId);
  if (fs.existsSync(acceptanceRoot)) {
    throw new Error(`Acceptance root already exists: ${acceptanceRoot}`);
  }
  fs.mkdirSync(path.join(acceptanceRoot, 'campaigns'), { recursive: true });

  const campaignSummaries: RealBenchmarkCampaignSummary[] = [];
  for (let index = 1; index <= thresholds.campaignCount; index += 1) {
    const campaignId = `${acceptanceId}-c${String(index).padStart(2, '0')}`;
    const result = await runPolluxRealCampaign({
      campaignId,
      repeats: thresholds.repeatsPerCampaign,
      taskIds,
      pricingSnapshotPath,
      binaryPath,
      entrypointPreference,
      artifactRoot: path.join(acceptanceRoot, 'campaigns', campaignId),
      allowOverwrite: false,
    });
    campaignSummaries.push(result.summary);
    if (campaignDelayMs > 0 && index < thresholds.campaignCount) {
      // eslint-disable-next-line no-console
      console.log(
        `[Pollux acceptance] Waiting ${campaignDelayMs}ms before campaign ${String(index + 1).padStart(2, '0')}...`,
      );
      await sleep(campaignDelayMs);
    }
  }

  const summary = buildPolluxRealAcceptanceSummary({
    acceptanceId,
    campaignSummaries,
    thresholds,
  });
  writeJson(path.join(acceptanceRoot, 'aggregate-summary.json'), summary);
  fs.writeFileSync(
    path.join(acceptanceRoot, 'aggregate-report.md'),
    renderAcceptanceReport(summary, campaignSummaries),
  );
}

const currentFilePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (currentFilePath === invokedPath) {
  runPolluxRealAcceptance().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
