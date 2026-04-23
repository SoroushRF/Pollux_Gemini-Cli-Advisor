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

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function getSelectedTasks(taskIds: string[]) {
  const tasks = REAL_BENCHMARK_SEED_CORPUS.filter((task) =>
    taskIds.includes(task.id),
  );
  if (tasks.length !== taskIds.length) {
    const foundIds = new Set(tasks.map((task) => task.id));
    const missing = taskIds.filter((taskId) => !foundIds.has(taskId));
    throw new Error(`Unknown pilot task ids: ${missing.join(', ')}`);
  }
  return tasks;
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
  const selectedTasks = getSelectedTasks(taskIds);
  const pricingSnapshotPath = parseArg('--pricing-snapshot');
  const pricingSnapshot = loadPricingSnapshotFromPath(pricingSnapshotPath);
  const binaryPath = parseArg('--binary-path');

  const manifest = buildDefaultCampaignManifest(campaignId, taskIds);
  manifest.repeatsPerCell = repeats;
  if (pricingSnapshotPath) {
    manifest.pricingSnapshotPath = pricingSnapshotPath;
  }

  const preflight = buildRealBenchmarkPreflightReport(
    manifest,
    selectedTasks,
    pricingSnapshot,
    binaryPath,
  );
  if (preflight.runBlockers.length > 0) {
    throw new Error(
      `Real benchmark pilot preflight failed:\n- ${preflight.runBlockers.join('\n- ')}`,
    );
  }

  const artifactRoot = path.join(POLLUX_REAL_ARTIFACT_ROOT, campaignId);
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
    binaryPath,
    keepScratchDirectories:
      (parseArg('--keep-scratch-directories') ?? 'true') !== 'false',
    repoRoot: POLLUX_REAL_REPO_ROOT,
  });

  const runs: RealBenchmarkRunRecord[] = [];
  for (const condition of manifest.conditions) {
    for (const task of selectedTasks) {
      const runRoot = path.join(artifactRoot, 'raw', condition.id, task.id);
      fs.mkdirSync(runRoot, { recursive: true });
      for (let sampleIndex = 1; sampleIndex <= repeats; sampleIndex += 1) {
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
}

const currentFilePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (currentFilePath === invokedPath) {
  runPolluxRealPilot().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
