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
  getRealBenchmarkTasksByIds,
} from '../../core/src/pollux/benchmark/realTasks.js';
import { getPolluxV1BenchmarkTasksByIds } from '../../core/src/pollux/benchmark/polluxV1Tasks.js';
import {
  POLLUX_REAL_ARTIFACT_ROOT,
  POLLUX_REAL_REPO_ROOT,
  buildDefaultCampaignManifest,
} from './pollux-real-config.js';
import { PolluxLiveRunRig } from './pollux-live-run-rig.js';
import {
  buildRealBenchmarkPreflightReport,
  computeCorpusSha,
  loadPricingSnapshotFromPath,
  renderRealBenchmarkPreflightReport,
} from './pollux-real-preflight.js';
import {
  buildRealBenchmarkCampaignSummary,
  renderRealBenchmarkCampaignReport,
} from './pollux-real-report.js';
import type { RealBenchmarkRunRecord } from './pollux-real-types.js';
import type { RealBenchmarkConditionId } from './pollux-real-types.js';
import type { RealBenchmarkTaskSpec } from '../../core/src/pollux/benchmark/realTypes.js';

function parseEntrypointPreference(
  value: string | undefined,
): 'auto' | 'bundle' | 'dev_script' | undefined {
  if (value === 'auto' || value === 'bundle' || value === 'dev_script') {
    return value;
  }
  return undefined;
}

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function parseConditionIdsArg(
  flag: string,
): RealBenchmarkConditionId[] | undefined {
  const raw = parseArg(flag);
  if (!raw) {
    return undefined;
  }
  const conditionIds = raw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is RealBenchmarkConditionId => value.length > 0);
  return conditionIds.length > 0 ? conditionIds : undefined;
}

function parsePositiveNumberArg(flag: string): number | undefined {
  const raw = parseArg(flag);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

function getSelectedTasks(taskIds: string[]): RealBenchmarkTaskSpec[] {
  const polluxV1TaskIds = taskIds.filter((taskId) =>
    taskId.startsWith('pollux-v1-'),
  );
  const realTaskIds = taskIds.filter(
    (taskId) => !taskId.startsWith('pollux-v1-'),
  );

  const selectedTasks = [
    ...getRealBenchmarkTasksByIds(realTaskIds),
    ...getPolluxV1BenchmarkTasksByIds(polluxV1TaskIds),
  ];
  const tasksById = new Map<string, RealBenchmarkTaskSpec>();
  for (const task of selectedTasks) {
    tasksById.set(task.id, task);
  }

  return taskIds.map((taskId) => {
    const task = tasksById.get(taskId);
    if (task === undefined) {
      throw new Error(`Selected benchmark task not found: ${taskId}`);
    }
    return task;
  });
}

export async function runPolluxRealCampaign(params: {
  campaignId: string;
  repeats: number;
  taskIds: string[];
  pricingSnapshotPath?: string;
  binaryPath?: string;
  entrypointPreference?: 'auto' | 'bundle' | 'dev_script';
  keepScratchDirectories?: boolean;
  maxWallClockMs?: number;
  maxModelResponsesPerSample?: number;
  fMaxModelResponsesPerSample?: number;
  artifactRoot?: string;
  allowOverwrite?: boolean;
  conditionIds?: RealBenchmarkConditionId[];
  diagnosticTrace?: {
    enabled?: boolean;
    includeAdvisorGuidanceText?: boolean;
    includeModelThoughts?: 'summary' | 'raw_model_exposed';
  };
}) {
  const selectedTasks = getSelectedTasks(params.taskIds);
  const pricingSnapshot = loadPricingSnapshotFromPath(
    params.pricingSnapshotPath,
  );
  const manifest = buildDefaultCampaignManifest(
    params.campaignId,
    params.taskIds,
    params.conditionIds,
  );
  manifest.repeatsPerCell = params.repeats;
  if (params.pricingSnapshotPath) {
    manifest.pricingSnapshotPath = params.pricingSnapshotPath;
  }

  const preflight = buildRealBenchmarkPreflightReport(
    manifest,
    REAL_BENCHMARK_SEED_CORPUS,
    pricingSnapshot,
    params.binaryPath,
    params.entrypointPreference,
  );
  if (preflight.runBlockers.length > 0) {
    throw new Error(
      `Real benchmark pilot preflight failed:\n- ${preflight.runBlockers.join('\n- ')}`,
    );
  }

  const artifactRoot =
    params.artifactRoot ??
    path.join(POLLUX_REAL_ARTIFACT_ROOT, params.campaignId);
  if (fs.existsSync(artifactRoot)) {
    if (!params.allowOverwrite) {
      throw new Error(
        `Artifact root already exists: ${artifactRoot}. Pass --allow-overwrite true or choose a new campaign id.`,
      );
    }
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(artifactRoot, { recursive: true });

  writeJson(path.join(artifactRoot, 'manifest.json'), manifest);
  writeJson(path.join(artifactRoot, 'conditions.json'), manifest.conditions);
  writeJson(path.join(artifactRoot, 'preflight.json'), preflight);
  fs.writeFileSync(
    path.join(artifactRoot, 'preflight.md'),
    renderRealBenchmarkPreflightReport(preflight),
  );
  if (pricingSnapshot) {
    writeJson(
      path.join(artifactRoot, 'pricing-snapshot.json'),
      pricingSnapshot,
    );
  }

  const corpusSha = computeCorpusSha(selectedTasks);
  writeJson(path.join(artifactRoot, 'corpus-lock.json'), {
    corpusSha,
    taskIds: selectedTasks.map((task) => task.id),
    taskCount: selectedTasks.length,
  });

  const rig = new PolluxLiveRunRig({
    manifest,
    tasks: selectedTasks,
    artifactRoot,
    pricingSnapshot,
    binaryPath: params.binaryPath,
    entrypointPreference: params.entrypointPreference,
    keepScratchDirectories: params.keepScratchDirectories ?? true,
    maxWallClockMs: params.maxWallClockMs,
    maxModelResponsesPerSample: params.maxModelResponsesPerSample,
    fMaxModelResponsesPerSample: params.fMaxModelResponsesPerSample,
    diagnosticTrace: params.diagnosticTrace,
    repoRoot: POLLUX_REAL_REPO_ROOT,
  });

  console.log(`\nPollux benchmark campaign: ${params.campaignId}`);
  console.log(
    `Workload: ${manifest.conditions.length} conditions x ${selectedTasks.length} tasks x ${params.repeats} repeats = ${manifest.conditions.length * selectedTasks.length * params.repeats} samples\n`,
  );

  const runs: RealBenchmarkRunRecord[] = [];
  for (const [conditionIndex, condition] of manifest.conditions.entries()) {
    console.log(
      `\n[Condition ${conditionIndex + 1}/${manifest.conditions.length}] ${condition.id} (Executor: ${condition.executorModel}${condition.polluxEnabled ? ` + Advisor: ${condition.advisorModel}` : ''})`,
    );

    for (const [taskIndex, task] of selectedTasks.entries()) {
      const runRoot = path.join(artifactRoot, 'raw', condition.id, task.id);
      fs.mkdirSync(runRoot, { recursive: true });

      for (
        let sampleIndex = 1;
        sampleIndex <= params.repeats;
        sampleIndex += 1
      ) {
        console.log(
          `  [Task ${taskIndex + 1}/${selectedTasks.length}] Running ${task.id} (Sample ${sampleIndex}/${params.repeats})...`,
        );
        const record = await rig.runSample(
          task,
          condition,
          sampleIndex,
          corpusSha,
        );
        runs.push(record);
        writeJson(
          path.join(
            runRoot,
            `run-${String(sampleIndex).padStart(3, '0')}.json`,
          ),
          record,
        );
      }
    }
  }

  console.log('\nBenchmark execution complete. Generating report...');

  const summary = buildRealBenchmarkCampaignSummary(
    manifest,
    corpusSha,
    runs,
    preflight.publishabilityBlockers,
  );
  writeJson(path.join(artifactRoot, 'summary.json'), summary);
  fs.writeFileSync(
    path.join(artifactRoot, 'report.md'),
    renderRealBenchmarkCampaignReport(summary),
  );

  if (params.repeats > 1) {
    const repeatsRoot = path.join(artifactRoot, 'repeats');
    fs.mkdirSync(repeatsRoot, { recursive: true });
    for (let sampleIndex = 1; sampleIndex <= params.repeats; sampleIndex += 1) {
      const repeatRuns = runs.filter((run) => run.sampleIndex === sampleIndex);
      const repeatSummary = buildRealBenchmarkCampaignSummary(
        manifest,
        corpusSha,
        repeatRuns,
        preflight.publishabilityBlockers,
        { includeRepeatSummaries: false },
      );
      writeJson(
        path.join(
          repeatsRoot,
          `repeat-${String(sampleIndex).padStart(3, '0')}.summary.json`,
        ),
        repeatSummary,
      );
      fs.writeFileSync(
        path.join(
          repeatsRoot,
          `repeat-${String(sampleIndex).padStart(3, '0')}.report.md`,
        ),
        renderRealBenchmarkCampaignReport(repeatSummary),
      );
    }
  }

  return { artifactRoot, summary, preflight, runs, manifest, corpusSha };
}

export async function runPolluxRealPilot() {
  const campaignId =
    parseArg('--campaign-id') ??
    `pilot-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const requestedRepeats = Number(parseArg('--repeats') ?? '3');
  const repeats =
    Number.isFinite(requestedRepeats) && requestedRepeats > 0
      ? Math.floor(requestedRepeats)
      : 3;
  const taskIds = parseArg('--task-ids')
    ?.split(',')
    .map((value) => value.trim()) ?? [...PILOT_SENTINEL_TASK_IDS];

  await runPolluxRealCampaign({
    campaignId,
    repeats,
    taskIds,
    pricingSnapshotPath: parseArg('--pricing-snapshot'),
    binaryPath: parseArg('--binary-path'),
    entrypointPreference: parseEntrypointPreference(parseArg('--entrypoint')),
    keepScratchDirectories: parseBooleanArg('--keep-scratch-directories', true),
    maxWallClockMs: parsePositiveNumberArg('--max-wall-clock-ms'),
    maxModelResponsesPerSample: parsePositiveNumberArg('--max-model-responses'),
    fMaxModelResponsesPerSample: parsePositiveNumberArg(
      '--f-max-model-responses',
    ),
    diagnosticTrace: {
      enabled: parseBooleanArg('--pollux-diagnostic-trace', false),
      includeAdvisorGuidanceText: parseBooleanArg(
        '--pollux-diagnostic-trace-guidance',
        false,
      ),
      includeModelThoughts:
        parseArg('--pollux-diagnostic-trace-thoughts') === 'raw_model_exposed'
          ? 'raw_model_exposed'
          : 'summary',
    },
    allowOverwrite: parseBooleanArg('--allow-overwrite', false),
    conditionIds: parseConditionIdsArg('--condition-ids'),
  });
}

const currentFilePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (currentFilePath === invokedPath) {
  runPolluxRealPilot().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
