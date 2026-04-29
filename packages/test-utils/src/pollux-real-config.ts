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
  RealBenchmarkConditionId,
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

const HYBRID_ADVISOR_SETTINGS: Record<string, unknown> = {
  advisorTriggerMode: 'hybrid',
  advisorBudgetMode: 'adaptive',
  maxAdvisorCallsShortTask: 1,
  maxAdvisorCallsLongTask: 2,
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
};

const SHAM_ADVISOR_SETTINGS: Record<string, unknown> = {
  ...HYBRID_ADVISOR_SETTINGS,
  advisorShamEnabled: true,
  advisorShamGuidance:
    '1. Continue with the best supported plan. 2. Verify with the existing oracle.',
};

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
    advisorFallbackModel: null,
    polluxEnabled: true,
    authProfile: 'pollux-advisor',
    publishableEligible: true,
    settingsOverrides: HYBRID_ADVISOR_SETTINGS,
  },
  {
    id: 'L',
    executorModel: 'gemini-3.1-flash-lite-preview',
    polluxEnabled: false,
    authProfile: 'lite-executor',
    publishableEligible: true,
    settingsOverrides: {},
  },
  {
    id: 'LF',
    executorModel: 'gemini-3.1-flash-lite-preview',
    advisorModel: 'gemini-3.1-pro-preview',
    advisorFallbackModel: null,
    polluxEnabled: true,
    authProfile: 'lite-advisor',
    publishableEligible: true,
    settingsOverrides: HYBRID_ADVISOR_SETTINGS,
  },
  {
    id: 'FS',
    executorModel: 'gemini-3-flash-preview',
    advisorModel: 'gemini-3.1-pro-preview',
    advisorFallbackModel: null,
    polluxEnabled: true,
    authProfile: 'sham-advisor',
    publishableEligible: false,
    settingsOverrides: SHAM_ADVISOR_SETTINGS,
  },
];

const POLLUX_REAL_CORE_CONDITION_IDS: RealBenchmarkConditionId[] = [
  'A',
  'E',
  'F',
  'L',
  'LF',
];

export function getPolluxRealConditionsById(
  ids: RealBenchmarkConditionId[],
): RealBenchmarkConditionProfile[] {
  return ids.map((id) => {
    const condition = POLLUX_REAL_CONDITIONS.find((entry) => entry.id === id);
    if (!condition) {
      throw new Error(`Unknown Pollux real benchmark condition: ${id}`);
    }
    return condition;
  });
}

export function buildRealBenchmarkSettings(
  condition: RealBenchmarkConditionProfile,
  telemetryPath: string,
): Record<string, unknown> & BenchmarkSettingsOverrides {
  const advisorTriggerMode = condition.settingsOverrides['advisorTriggerMode'];
  const advisorBudgetMode = condition.settingsOverrides['advisorBudgetMode'];
  const advisorShamEnabled = condition.settingsOverrides['advisorShamEnabled'];
  const advisorShamGuidance =
    condition.settingsOverrides['advisorShamGuidance'];
  const maxAdvisorCallsShortTask =
    condition.settingsOverrides['maxAdvisorCallsShortTask'];
  const maxAdvisorCallsLongTask =
    condition.settingsOverrides['maxAdvisorCallsLongTask'];
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
        advisorFallbackModel: condition.polluxEnabled
          ? condition.advisorFallbackModel === undefined
            ? condition.executorModel
            : condition.advisorFallbackModel
          : null,
        advisorTriggerMode:
          advisorTriggerMode === 'executor_request' ||
          advisorTriggerMode === 'detector' ||
          advisorTriggerMode === 'hybrid'
            ? advisorTriggerMode
            : undefined,
        advisorBudgetMode:
          advisorBudgetMode === 'fixed' || advisorBudgetMode === 'adaptive'
            ? advisorBudgetMode
            : undefined,
        maxAdvisorCallsShortTask:
          typeof maxAdvisorCallsShortTask === 'number'
            ? maxAdvisorCallsShortTask
            : undefined,
        maxAdvisorCallsLongTask:
          typeof maxAdvisorCallsLongTask === 'number'
            ? maxAdvisorCallsLongTask
            : undefined,
        advisorShamEnabled:
          typeof advisorShamEnabled === 'boolean'
            ? advisorShamEnabled
            : undefined,
        advisorShamGuidance:
          typeof advisorShamGuidance === 'string'
            ? advisorShamGuidance
            : undefined,
        ...(detector ? { detector } : {}),
      },
    },
  };
}

export function buildDefaultCampaignManifest(
  campaignId: string,
  taskIds: string[],
  conditionIds?: RealBenchmarkConditionId[],
): RealBenchmarkCampaignManifest {
  return {
    campaignId,
    mode: 'pilot',
    runVenue: 'local',
    authIsolationMode: 'single_account',
    repeatsPerCell: 3,
    conditions: conditionIds
      ? getPolluxRealConditionsById(conditionIds)
      : getPolluxRealConditionsById(POLLUX_REAL_CORE_CONDITION_IDS),
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
