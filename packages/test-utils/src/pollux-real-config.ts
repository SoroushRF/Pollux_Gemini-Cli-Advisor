/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchmarkSettingsOverrides } from './benchmark-harness.js';
import type {
  RealBenchmarkCampaignManifest,
  RealBenchmarkConditionProfile,
} from './pollux-real-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const POLLUX_REAL_REPO_ROOT = resolve(__dirname, '..', '..', '..');
export const POLLUX_REAL_ARTIFACT_ROOT = join(
  POLLUX_REAL_REPO_ROOT,
  'artifacts',
  'pollux',
  'real-runs',
);
export const POLLUX_REAL_DEFAULT_PREREGISTRATION_PATH = join(
  POLLUX_REAL_REPO_ROOT,
  'docs',
  'core',
  'pollux',
  'P4-11_REAL_BENCHMARK_PREREGISTRATION_TEMPLATE.md',
);
export const POLLUX_REAL_DEFAULT_POWER_ANALYSIS_PATH = join(
  POLLUX_REAL_REPO_ROOT,
  'docs',
  'core',
  'pollux',
  'P4-12_REAL_BENCHMARK_POWER_ANALYSIS_TEMPLATE.md',
);
export const POLLUX_REAL_DEFAULT_PRICING_TEMPLATE_PATH = join(
  POLLUX_REAL_REPO_ROOT,
  'docs',
  'core',
  'pollux',
  'P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_TEMPLATE.json',
);

export const POLLUX_REAL_AUTH_SEED_FILES = [
  'oauth_creds.json',
  'google_accounts.json',
  'projects.json',
  'state.json',
  'installation_id',
] as const;

export const POLLUX_REAL_CONDITIONS: RealBenchmarkConditionProfile[] = [
  {
    id: 'A',
    executorModel: 'gemini-2.5-flash',
    polluxEnabled: false,
    authProfile: 'baseline-executor',
    publishableEligible: true,
    settingsOverrides: {},
  },
  {
    id: 'E',
    executorModel: 'gemini-3-pro-preview',
    polluxEnabled: false,
    authProfile: 'stronger-executor',
    publishableEligible: true,
    settingsOverrides: {},
  },
  {
    id: 'F',
    executorModel: 'gemini-2.5-flash',
    advisorModel: 'gemini-3-pro-preview',
    polluxEnabled: true,
    authProfile: 'pollux-advisor',
    publishableEligible: true,
    settingsOverrides: {
      detector: {
        riskGate: { enabled: true },
        observer: { enabled: true },
        selfReport: { enabled: true, promptPrimingEnabled: true },
        fusion: {
          requireComposite: true,
          targetEscalationRate: 0.05,
          lowPrecisionFloor: 0.5,
          sameTurnThresholdMultiplier: 1.5,
          sameTurnAbsoluteFloor: 3.5,
        },
        timing: {
          sameTurnEnabled: true,
          maxSameTurnEscalationsPerTurn: 1,
        },
      },
    },
  },
];

export function buildRealBenchmarkSettings(
  condition: RealBenchmarkConditionProfile,
  telemetryPath: string,
): Record<string, unknown> & BenchmarkSettingsOverrides {
  const detector =
    (condition.settingsOverrides['detector'] as Record<string, unknown>) ??
    undefined;

  return {
    general: {
      enableAutoUpdate: false,
    },
    telemetry: {
      enabled: true,
      target: 'local',
      otlpEndpoint: '',
      outfile: telemetryPath,
    },
    security: {
      auth: {
        selectedType: 'oauth-personal',
      },
      folderTrust: {
        enabled: false,
      },
    },
    ui: {
      useAlternateBuffer: true,
    },
    ide: {
      enabled: false,
      hasSeenNudge: true,
    },
    sandbox: false,
    model: {
      name: condition.executorModel,
      disableLoopDetection: true,
    },
    experimental: {
      dynamicModelConfiguration: false,
      gemmaModelRouter: {
        enabled: false,
      },
      pollux: {
        enabled: condition.polluxEnabled,
        executorModel: condition.executorModel,
        advisorModel: condition.advisorModel,
        ...(detector ? { detector } : {}),
      },
    },
  };
}

export function buildDefaultCampaignManifest(
  campaignId: string,
  taskIds: string[],
): RealBenchmarkCampaignManifest {
  return {
    campaignId,
    mode: 'pilot',
    runVenue: 'local',
    authIsolationMode: 'single_account',
    repeatsPerCell: 3,
    conditions: POLLUX_REAL_CONDITIONS,
    pricingSnapshotPath: POLLUX_REAL_DEFAULT_PRICING_TEMPLATE_PATH,
    preregistrationPath: POLLUX_REAL_DEFAULT_PREREGISTRATION_PATH,
    powerAnalysisPath: POLLUX_REAL_DEFAULT_POWER_ANALYSIS_PATH,
    canonicalSurface: 'headless_non_interactive_cli',
    selectedTaskIds: taskIds,
  };
}

export function getDefaultGeminiHome(): string {
  return join(homedir(), '.gemini');
}

export function resolveCliEntrypoint(explicitBinaryPath?: string): {
  kind: 'bundle' | 'binary' | 'dev_script';
  command: string;
  initialArgs: string[];
  path: string;
  publishableEligible: boolean;
} {
  const envBinaryPath = process.env['POLLUX_REAL_BENCHMARK_BINARY_PATH'];
  const binaryPath = explicitBinaryPath ?? envBinaryPath;
  if (binaryPath) {
    return {
      kind: 'binary',
      command: binaryPath,
      initialArgs: [],
      path: binaryPath,
      publishableEligible: true,
    };
  }

  const bundlePath = join(POLLUX_REAL_REPO_ROOT, 'bundle', 'gemini.js');
  if (existsSync(bundlePath)) {
    return {
      kind: 'bundle',
      command: 'node',
      initialArgs: [bundlePath],
      path: bundlePath,
      publishableEligible: true,
    };
  }

  const startScriptPath = join(POLLUX_REAL_REPO_ROOT, 'scripts', 'start.js');
  return {
    kind: 'dev_script',
    command: 'node',
    initialArgs: [startScriptPath],
    path: startScriptPath,
    publishableEligible: false,
  };
}
