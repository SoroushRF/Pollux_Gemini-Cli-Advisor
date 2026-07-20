/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  M3_VALUE_CANDIDATE_TASK_IDS,
  getRealBenchmarkTasksByIds,
} from '../../core/src/pollux/benchmark/realTasks.js';
import { POLLUX_REAL_ARTIFACT_ROOT } from './pollux-real-config.js';
import { computeCorpusSha } from './pollux-real-preflight.js';
import { runPolluxRealCampaign } from './pollux-real-pilot.js';
import {
  buildRealBenchmarkM3CalibrationSummary,
  buildRealBenchmarkM3SelectedTaskSet,
  buildRealBenchmarkTemporaryFlashOnlySelectedTaskSet,
  buildRealBenchmarkTemporaryFlashOnlySummary,
  renderRealBenchmarkM3CalibrationReport,
  renderRealBenchmarkTemporaryFlashOnlyReport,
} from './pollux-real-report.js';
import type {
  RealBenchmarkEntrypointPreference,
  RealBenchmarkM3CalibrationThresholds,
} from './pollux-real-types.js';

export const POLLUX_REAL_M3_DEFAULT_CALIBRATION_THRESHOLDS: RealBenchmarkM3CalibrationThresholds =
  {
    maxFlashPassRateForDiscriminative: 0.5,
    minProPassRateForDiscriminative: 0.67,
    maxInvalidRateForStableTask: 0.2,
    minSelectedTaskCount: 8,
    maxSelectedTaskCount: 15,
  };

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function parseEntrypointPreference(
  value: string | undefined,
): RealBenchmarkEntrypointPreference | undefined {
  if (value === 'auto' || value === 'bundle' || value === 'dev_script') {
    return value;
  }
  return undefined;
}

function parsePositiveIntegerArg(flag: string, fallback: number): number {
  const raw = parseArg(flag);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parsePositiveNumberArg(flag: string): number | undefined {
  const raw = parseArg(flag);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number.`);
  }
  return parsed;
}

function parseRateArg(flag: string, fallback: number): number {
  const raw = parseArg(flag);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flag} must be a rate between 0 and 1.`);
  }
  return parsed;
}

function parseBooleanArg(flag: string, fallback: boolean): boolean {
  const raw = parseArg(flag);
  if (raw === undefined) {
    return fallback;
  }
  return raw.toLowerCase() !== 'false';
}

function parseTaskIds(): string[] {
  return (
    parseArg('--task-ids')
      ?.split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0) ?? [...M3_VALUE_CANDIDATE_TASK_IDS]
  );
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export async function runPolluxRealM3Calibration(params: {
  batchId: string;
  taskIds: string[];
  repeats: number;
  pricingSnapshotPath?: string;
  binaryPath?: string;
  entrypointPreference?: RealBenchmarkEntrypointPreference;
  keepScratchDirectories?: boolean;
  maxWallClockMs?: number;
  maxModelResponsesPerSample?: number;
  allowOverwrite?: boolean;
  thresholds?: RealBenchmarkM3CalibrationThresholds;
  temporaryFlashOnly?: boolean;
}) {
  const thresholds =
    params.thresholds ?? POLLUX_REAL_M3_DEFAULT_CALIBRATION_THRESHOLDS;
  const selectedTasks = getRealBenchmarkTasksByIds(params.taskIds);
  const batchRoot = path.join(POLLUX_REAL_ARTIFACT_ROOT, params.batchId);
  if (fs.existsSync(batchRoot)) {
    if (!params.allowOverwrite) {
      throw new Error(
        `M3 calibration root already exists: ${batchRoot}. Pass --allow-overwrite true or choose a new batch id.`,
      );
    }
    fs.rmSync(batchRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(batchRoot, { recursive: true });

  const result = await runPolluxRealCampaign({
    campaignId: params.temporaryFlashOnly
      ? `${params.batchId}-temporary-flash-only`
      : `${params.batchId}-calibration`,
    repeats: params.repeats,
    taskIds: params.taskIds,
    conditionIds: params.temporaryFlashOnly ? ['A'] : ['A', 'E'],
    pricingSnapshotPath: params.pricingSnapshotPath,
    binaryPath: params.binaryPath,
    entrypointPreference: params.entrypointPreference,
    keepScratchDirectories: params.keepScratchDirectories,
    maxWallClockMs: params.maxWallClockMs,
    maxModelResponsesPerSample: params.maxModelResponsesPerSample,
    artifactRoot: path.join(
      batchRoot,
      params.temporaryFlashOnly
        ? 'temporary-flash-only-campaign'
        : 'calibration-campaign',
    ),
    allowOverwrite: false,
  });
  const corpusSha = computeCorpusSha(selectedTasks);
  if (params.temporaryFlashOnly) {
    const temporarySummary = buildRealBenchmarkTemporaryFlashOnlySummary({
      calibrationBatchId: params.batchId,
      corpusSha,
      taskIds: params.taskIds,
      runs: result.runs,
      thresholds,
    });
    const temporarySelectedTaskSet =
      buildRealBenchmarkTemporaryFlashOnlySelectedTaskSet(temporarySummary);

    writeJson(
      path.join(batchRoot, 'temporary-flash-only-summary.json'),
      temporarySummary,
    );
    fs.writeFileSync(
      path.join(batchRoot, 'temporary-flash-only-report.md'),
      renderRealBenchmarkTemporaryFlashOnlyReport(temporarySummary),
    );
    writeJson(
      path.join(batchRoot, 'temporary-selected-task-set.json'),
      temporarySelectedTaskSet,
    );

    return {
      batchRoot,
      summary: temporarySummary,
      selectedTaskSet: temporarySelectedTaskSet,
      campaign: result,
    };
  }

  const summary = buildRealBenchmarkM3CalibrationSummary({
    calibrationBatchId: params.batchId,
    corpusSha,
    taskIds: params.taskIds,
    runs: result.runs,
    thresholds,
  });
  const selectedTaskSet = buildRealBenchmarkM3SelectedTaskSet(summary);

  writeJson(path.join(batchRoot, 'calibration-summary.json'), summary);
  fs.writeFileSync(
    path.join(batchRoot, 'calibration-report.md'),
    renderRealBenchmarkM3CalibrationReport(summary),
  );
  writeJson(path.join(batchRoot, 'selected-task-set.json'), selectedTaskSet);

  return { batchRoot, summary, selectedTaskSet, campaign: result };
}

export async function runPolluxRealM3CalibrationCli() {
  const batchId =
    parseArg('--batch-id') ??
    `m3-calibration-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const thresholds: RealBenchmarkM3CalibrationThresholds = {
    ...POLLUX_REAL_M3_DEFAULT_CALIBRATION_THRESHOLDS,
    maxFlashPassRateForDiscriminative: parseRateArg(
      '--max-flash-pass-rate',
      POLLUX_REAL_M3_DEFAULT_CALIBRATION_THRESHOLDS.maxFlashPassRateForDiscriminative,
    ),
    minProPassRateForDiscriminative: parseRateArg(
      '--min-pro-pass-rate',
      POLLUX_REAL_M3_DEFAULT_CALIBRATION_THRESHOLDS.minProPassRateForDiscriminative,
    ),
    maxInvalidRateForStableTask: parseRateArg(
      '--max-invalid-rate',
      POLLUX_REAL_M3_DEFAULT_CALIBRATION_THRESHOLDS.maxInvalidRateForStableTask,
    ),
  };
  const temporaryFlashOnly = parseBooleanArg('--temporary-flash-only', false);

  await runPolluxRealM3Calibration({
    batchId,
    taskIds: parseTaskIds(),
    repeats: parsePositiveIntegerArg('--repeats', 3),
    pricingSnapshotPath: parseArg('--pricing-snapshot'),
    binaryPath: parseArg('--binary-path'),
    entrypointPreference: parseEntrypointPreference(parseArg('--entrypoint')),
    keepScratchDirectories: parseBooleanArg(
      '--keep-scratch-directories',
      false,
    ),
    maxWallClockMs: parsePositiveNumberArg('--max-wall-clock-ms'),
    maxModelResponsesPerSample: parsePositiveNumberArg('--max-model-responses'),
    allowOverwrite: parseBooleanArg('--allow-overwrite', false),
    thresholds,
    temporaryFlashOnly,
  });
}

const currentFilePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (currentFilePath === invokedPath) {
  runPolluxRealM3CalibrationCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
