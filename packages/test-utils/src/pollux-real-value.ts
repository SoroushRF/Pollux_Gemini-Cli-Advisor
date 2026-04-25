/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRealBenchmarkTasksByIds } from '../../core/src/pollux/benchmark/realTasks.js';
import { POLLUX_REAL_ARTIFACT_ROOT } from './pollux-real-config.js';
import { computeCorpusSha } from './pollux-real-preflight.js';
import { runPolluxRealCampaign } from './pollux-real-pilot.js';
import {
  buildRealBenchmarkM3ValueSummary,
  renderRealBenchmarkM3ValueReport,
} from './pollux-real-report.js';
import type {
  RealBenchmarkEntrypointPreference,
  RealBenchmarkM3SelectedTaskSet,
  RealBenchmarkM3ValueThresholds,
} from './pollux-real-types.js';

export const POLLUX_REAL_M3_DEFAULT_VALUE_THRESHOLDS: RealBenchmarkM3ValueThresholds =
  {
    minFOverAAbsolute: 0.1,
    maxFCostPerTaskVsE: 0.7,
    maxFCostPerSuccessVsE: 0.7,
    maxInvalidRate: 0.2,
    minSelectedTaskCount: 8,
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

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function loadSelectedTaskSet(
  selectedTaskSetPath: string,
): RealBenchmarkM3SelectedTaskSet {
  if (!fs.existsSync(selectedTaskSetPath)) {
    throw new Error(`Selected task set does not exist: ${selectedTaskSetPath}`);
  }
  return JSON.parse(
    fs.readFileSync(selectedTaskSetPath, 'utf8'),
  ) as RealBenchmarkM3SelectedTaskSet;
}

export async function runPolluxRealM3Value(params: {
  valueId: string;
  selectedTaskSetPath: string;
  repeats: number;
  pricingSnapshotPath?: string;
  binaryPath?: string;
  entrypointPreference?: RealBenchmarkEntrypointPreference;
  keepScratchDirectories?: boolean;
  maxWallClockMs?: number;
  maxModelResponsesPerSample?: number;
  allowOverwrite?: boolean;
  thresholds?: RealBenchmarkM3ValueThresholds;
}) {
  const thresholds =
    params.thresholds ?? POLLUX_REAL_M3_DEFAULT_VALUE_THRESHOLDS;
  const selectedTaskSet = loadSelectedTaskSet(params.selectedTaskSetPath);
  const selectedTasks = getRealBenchmarkTasksByIds(
    selectedTaskSet.selectedTaskIds,
  );
  const valueRoot = path.join(POLLUX_REAL_ARTIFACT_ROOT, params.valueId);
  if (fs.existsSync(valueRoot)) {
    if (!params.allowOverwrite) {
      throw new Error(
        `M3 value root already exists: ${valueRoot}. Pass --allow-overwrite true or choose a new value id.`,
      );
    }
    fs.rmSync(valueRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(valueRoot, { recursive: true });
  writeJson(path.join(valueRoot, 'selected-task-set.json'), selectedTaskSet);

  const result = await runPolluxRealCampaign({
    campaignId: `${params.valueId}-value`,
    repeats: params.repeats,
    taskIds: selectedTaskSet.selectedTaskIds,
    conditionIds: ['A', 'E', 'F'],
    pricingSnapshotPath: params.pricingSnapshotPath,
    binaryPath: params.binaryPath,
    entrypointPreference: params.entrypointPreference,
    keepScratchDirectories: params.keepScratchDirectories,
    maxWallClockMs: params.maxWallClockMs,
    maxModelResponsesPerSample: params.maxModelResponsesPerSample,
    artifactRoot: path.join(valueRoot, 'value-campaign'),
    allowOverwrite: false,
  });
  const corpusSha = computeCorpusSha(selectedTasks);
  const summary = buildRealBenchmarkM3ValueSummary({
    valueBatchId: params.valueId,
    selectedTaskSetPath: params.selectedTaskSetPath,
    selectedTaskSet,
    corpusSha,
    runs: result.runs,
    thresholds,
  });

  writeJson(path.join(valueRoot, 'value-summary.json'), summary);
  fs.writeFileSync(
    path.join(valueRoot, 'value-report.md'),
    renderRealBenchmarkM3ValueReport(summary),
  );

  return { valueRoot, summary, campaign: result, selectedTaskSet };
}

export async function runPolluxRealM3ValueCli() {
  const selectedTaskSetPath = parseArg('--selected-task-set');
  if (!selectedTaskSetPath) {
    throw new Error('--selected-task-set is required.');
  }
  const valueId =
    parseArg('--value-id') ??
    `m3-value-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const thresholds: RealBenchmarkM3ValueThresholds = {
    ...POLLUX_REAL_M3_DEFAULT_VALUE_THRESHOLDS,
    minFOverAAbsolute: parseRateArg(
      '--min-f-over-a-absolute',
      POLLUX_REAL_M3_DEFAULT_VALUE_THRESHOLDS.minFOverAAbsolute,
    ),
    maxFCostPerTaskVsE: parseRateArg(
      '--max-f-cost-per-task-vs-e',
      POLLUX_REAL_M3_DEFAULT_VALUE_THRESHOLDS.maxFCostPerTaskVsE,
    ),
    maxFCostPerSuccessVsE: parseRateArg(
      '--max-f-cost-per-success-vs-e',
      POLLUX_REAL_M3_DEFAULT_VALUE_THRESHOLDS.maxFCostPerSuccessVsE,
    ),
  };

  await runPolluxRealM3Value({
    valueId,
    selectedTaskSetPath,
    repeats: parsePositiveIntegerArg('--repeats', 3),
    pricingSnapshotPath: parseArg('--pricing-snapshot'),
    binaryPath: parseArg('--binary-path'),
    entrypointPreference: parseEntrypointPreference(parseArg('--entrypoint')),
    keepScratchDirectories: parseBooleanArg('--keep-scratch-directories', true),
    maxWallClockMs: parsePositiveNumberArg('--max-wall-clock-ms'),
    maxModelResponsesPerSample: parsePositiveNumberArg('--max-model-responses'),
    allowOverwrite: parseBooleanArg('--allow-overwrite', false),
    thresholds,
  });
}

const currentFilePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (currentFilePath === invokedPath) {
  runPolluxRealM3ValueCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
