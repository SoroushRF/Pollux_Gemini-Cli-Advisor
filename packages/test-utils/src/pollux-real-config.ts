/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchmarkSettingsOverrides } from './benchmark-harness.js';
import type {
  RealBenchmarkCampaignManifest,
  RealBenchmarkBuildFreshness,
  RealBenchmarkConditionProfile,
  RealBenchmarkEntrypointPreference,
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
    executorModel: 'gemini-3-flash-preview',
    polluxEnabled: false,
    authProfile: 'baseline-executor',
    publishableEligible: true,
    settingsOverrides: {},
  },
  {
    id: 'E',
    executorModel: 'gemini-3.1-pro-preview',
    polluxEnabled: false,
    authProfile: 'stronger-executor',
    publishableEligible: true,
    settingsOverrides: {},
  },
  {
    id: 'F',
    executorModel: 'gemini-3-flash-preview',
    advisorModel: 'gemini-3.1-pro-preview',
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

function getDirtyStatus(repoRoot: string): string[] {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return output
      .split(/\r?\n/g)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function hasDirtyWorktree(repoRoot: string): boolean {
  return getDirtyStatus(repoRoot).length > 0;
}

function getGitHead(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function readGeneratedGitCommit(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath, 'utf8');
  return /GIT_COMMIT_INFO\s*=\s*['"]([^'"]+)['"]/.exec(content)?.[1] ?? null;
}

export function collectRealBenchmarkBuildFreshness(
  repoRoot: string = POLLUX_REAL_REPO_ROOT,
): RealBenchmarkBuildFreshness {
  const gitHead = getGitHead(repoRoot);
  const dirtyStatus = getDirtyStatus(repoRoot);
  const cliSourceGitCommit = readGeneratedGitCommit(
    join(repoRoot, 'packages', 'cli', 'src', 'generated', 'git-commit.ts'),
  );
  const cliDistGitCommit = readGeneratedGitCommit(
    join(
      repoRoot,
      'packages',
      'cli',
      'dist',
      'src',
      'generated',
      'git-commit.js',
    ),
  );
  const coreSourceGitCommit = readGeneratedGitCommit(
    join(repoRoot, 'packages', 'core', 'src', 'generated', 'git-commit.ts'),
  );
  const coreDistGitCommit = readGeneratedGitCommit(
    join(
      repoRoot,
      'packages',
      'core',
      'dist',
      'src',
      'generated',
      'git-commit.js',
    ),
  );

  return {
    gitHead,
    repoDirty: dirtyStatus.length > 0,
    dirtyStatus,
    cliSourceGitCommit,
    cliDistGitCommit,
    coreSourceGitCommit,
    coreDistGitCommit,
    sourceCommitsMatchHead:
      cliSourceGitCommit === gitHead && coreSourceGitCommit === gitHead,
    distCommitsMatchSource:
      cliSourceGitCommit !== null &&
      cliSourceGitCommit === cliDistGitCommit &&
      coreSourceGitCommit !== null &&
      coreSourceGitCommit === coreDistGitCommit,
  };
}

function pickEntrypointPreference(
  preference: RealBenchmarkEntrypointPreference | undefined,
): RealBenchmarkEntrypointPreference {
  if (
    preference === 'bundle' ||
    preference === 'dev_script' ||
    preference === 'auto'
  ) {
    return preference;
  }
  return 'auto';
}

export function resolveCliEntrypoint(
  explicitBinaryPath?: string,
  preference?: RealBenchmarkEntrypointPreference,
): {
  kind: 'bundle' | 'binary' | 'dev_script';
  command: string;
  initialArgs: string[];
  path: string;
  publishableEligible: boolean;
} {
  const normalizedPreference = pickEntrypointPreference(preference);
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

  const startScriptPath = join(POLLUX_REAL_REPO_ROOT, 'scripts', 'start.js');
  const bundlePath = join(POLLUX_REAL_REPO_ROOT, 'bundle', 'gemini.js');
  const bundleExists = existsSync(bundlePath);
  const preferDevScript =
    normalizedPreference === 'dev_script' ||
    (normalizedPreference === 'auto' &&
      bundleExists &&
      hasDirtyWorktree(POLLUX_REAL_REPO_ROOT));

  if (preferDevScript && existsSync(startScriptPath)) {
    return {
      kind: 'dev_script',
      command: 'node',
      initialArgs: [startScriptPath],
      path: startScriptPath,
      publishableEligible: false,
    };
  }

  if (bundleExists) {
    return {
      kind: 'bundle',
      command: 'node',
      initialArgs: [bundlePath],
      path: bundlePath,
      publishableEligible: true,
    };
  }

  return {
    kind: 'dev_script',
    command: 'node',
    initialArgs: [startScriptPath],
    path: startScriptPath,
    publishableEligible: false,
  };
}
