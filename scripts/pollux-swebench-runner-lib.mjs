/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VALID_ENTRYPOINTS = new Set([
  'auto',
  'bundle',
  'dev_script',
  'binary',
]);

export const VALID_SCORE_POLICIES = new Set(['strict', 'diagnostic']);

export function parseRunnerArgs(argv, now = new Date()) {
  const out = {
    conditions: ['A', 'FD', 'E'],
    limit: undefined,
    offset: 0,
    runId: `run-${now.toISOString().replace(/[:.]/g, '-')}`,
    timeoutMs: 15 * 60 * 1000,
    maxSessionTurns: -1,
    maxApiResponses: -1,
    prepareOnly: false,
    entrypoint: 'bundle',
    binaryPath: undefined,
    fakeResponsesPath: undefined,
    goldPatchMode: false,
    nullPatchMode: false,
    scorePolicy: 'strict',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--conditions' && next) {
      out.conditions = next.split(',').map((value) => value.trim());
      i++;
    } else if (arg === '--limit' && next) {
      out.limit = Number(next);
      i++;
    } else if (arg === '--offset' && next) {
      out.offset = Number(next);
      i++;
    } else if (arg === '--run-id' && next) {
      out.runId = next;
      i++;
    } else if (arg === '--timeout-ms' && next) {
      out.timeoutMs = Number(next);
      i++;
    } else if (arg === '--max-session-turns' && next) {
      out.maxSessionTurns = Number(next);
      i++;
    } else if (arg === '--max-api-responses' && next) {
      out.maxApiResponses = Number(next);
      i++;
    } else if (arg === '--entrypoint' && next) {
      out.entrypoint = next;
      i++;
    } else if (arg === '--binary-path' && next) {
      out.binaryPath = next;
      i++;
    } else if (arg === '--fake-responses' && next) {
      out.fakeResponsesPath = next;
      i++;
    } else if (arg === '--score-policy' && next) {
      out.scorePolicy = next;
      i++;
    } else if (arg === '--prepare-only') {
      out.prepareOnly = true;
    } else if (arg === '--gold-patch-mode') {
      out.goldPatchMode = true;
    } else if (arg === '--null-patch-mode') {
      out.nullPatchMode = true;
    }
  }

  if (!VALID_ENTRYPOINTS.has(out.entrypoint)) {
    throw new Error(
      `Invalid --entrypoint ${out.entrypoint}. Expected one of ${[
        ...VALID_ENTRYPOINTS,
      ].join(', ')}.`,
    );
  }
  if (!VALID_SCORE_POLICIES.has(out.scorePolicy)) {
    throw new Error(
      `Invalid --score-policy ${out.scorePolicy}. Expected strict or diagnostic.`,
    );
  }
  if (out.goldPatchMode && out.nullPatchMode) {
    throw new Error('Use only one of --gold-patch-mode or --null-patch-mode.');
  }
  if ((out.goldPatchMode || out.nullPatchMode) && out.fakeResponsesPath) {
    throw new Error(
      '--fake-responses cannot be combined with patch-emission modes.',
    );
  }
  return out;
}

export function resolveCliEntrypoint(options) {
  const repoRoot = options.repoRoot;
  const entrypoint = options.entrypoint ?? 'bundle';
  const env = options.env ?? process.env;
  const exists = options.existsSync ?? fs.existsSync;
  const explicitBinaryPath =
    options.binaryPath ?? env['POLLUX_SWEBENCH_CLI_BINARY_PATH'];
  const bundlePath = path.join(repoRoot, 'bundle', 'gemini.js');
  const devScriptPath = path.join(repoRoot, 'scripts', 'start.js');

  if (entrypoint === 'binary') {
    if (!explicitBinaryPath) {
      throw new Error(
        '--entrypoint binary requires --binary-path or POLLUX_SWEBENCH_CLI_BINARY_PATH.',
      );
    }
    if (!exists(explicitBinaryPath)) {
      throw new Error(`CLI binary path does not exist: ${explicitBinaryPath}`);
    }
    const isWindowsCommandShim =
      process.platform === 'win32' && /\.(bat|cmd)$/i.test(explicitBinaryPath);
    return {
      kind: 'binary',
      command: isWindowsCommandShim
        ? (process.env['ComSpec'] ?? 'cmd.exe')
        : explicitBinaryPath,
      initialArgs: isWindowsCommandShim
        ? ['/d', '/s', '/c', explicitBinaryPath]
        : [],
      path: explicitBinaryPath,
      publishableEligible: false,
    };
  }

  if (entrypoint === 'dev_script') {
    if (!exists(devScriptPath)) {
      throw new Error(`Dev script entrypoint does not exist: ${devScriptPath}`);
    }
    return {
      kind: 'dev_script',
      command: process.execPath,
      initialArgs: [devScriptPath],
      path: devScriptPath,
      publishableEligible: false,
    };
  }

  if (entrypoint === 'auto' && explicitBinaryPath) {
    return resolveCliEntrypoint({
      ...options,
      entrypoint: 'binary',
      binaryPath: explicitBinaryPath,
    });
  }

  if (entrypoint === 'bundle' || entrypoint === 'auto') {
    if (exists(bundlePath)) {
      return {
        kind: 'bundle',
        command: process.execPath,
        initialArgs: [bundlePath],
        path: bundlePath,
        publishableEligible: true,
      };
    }
    if (entrypoint === 'bundle') {
      throw new Error(`Bundle entrypoint does not exist: ${bundlePath}`);
    }
  }

  if (!exists(devScriptPath)) {
    throw new Error(`No usable CLI entrypoint found under ${repoRoot}`);
  }
  return {
    kind: 'dev_script',
    command: process.execPath,
    initialArgs: [devScriptPath],
    path: devScriptPath,
    publishableEligible: false,
  };
}

/** Auth type written into isolated benchmark settings.json. */
export const POLLUX_BENCHMARK_AUTH_TYPE = 'vertex-ai';

/**
 * Load KEY=VALUE pairs from a `.env` file without overriding existing process env.
 * Returns the parsed map (including keys already present in `env`).
 */
export function loadPolluxDotEnvFile(envPath, env = process.env) {
  const parsed = {};
  if (!envPath || !fs.existsSync(envPath)) {
    return parsed;
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
    }
  }
  return parsed;
}

/**
 * Resolve Vertex env for Pollux benchmark child processes.
 * Prefers already-set process env; falls back to repo `.env` values when provided.
 */
export function resolvePolluxVertexEnv(env = process.env, defaults = {}) {
  const project =
    env.GOOGLE_CLOUD_PROJECT ||
    env.GOOGLE_CLOUD_PROJECT_ID ||
    defaults.GOOGLE_CLOUD_PROJECT ||
    '';
  const location =
    env.GOOGLE_CLOUD_LOCATION || defaults.GOOGLE_CLOUD_LOCATION || 'global';
  return {
    GOOGLE_CLOUD_PROJECT: project,
    GOOGLE_CLOUD_LOCATION: location,
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
}

/**
 * Apply Vertex AI auth env onto a cleaned child-process env.
 * Unsets Gemini Developer API key so Vertex/ADC is not shadowed.
 */
export function applyPolluxVertexEnv(cleanEnv, options = {}) {
  const defaults = options.defaults ?? {};
  const vertex = resolvePolluxVertexEnv(cleanEnv, defaults);
  if (vertex.GOOGLE_CLOUD_PROJECT) {
    cleanEnv.GOOGLE_CLOUD_PROJECT = vertex.GOOGLE_CLOUD_PROJECT;
  }
  cleanEnv.GOOGLE_CLOUD_LOCATION = vertex.GOOGLE_CLOUD_LOCATION;
  cleanEnv.GOOGLE_GENAI_USE_VERTEXAI = 'true';
  // Prefer Vertex ADC / GOOGLE_API_KEY over Gemini Developer API key.
  delete cleanEnv.GEMINI_API_KEY;
  delete cleanEnv.GOOGLE_GENAI_USE_GCA;
  return cleanEnv;
}

export function buildSweBenchmarkSettings(
  condition,
  telemetryPath,
  tracePath,
  maxSessionTurns,
) {
  return {
    telemetry: {
      enabled: true,
      target: 'local',
      otlpEndpoint: '',
      outfile: telemetryPath,
    },
    security: {
      auth: { selectedType: POLLUX_BENCHMARK_AUTH_TYPE },
      folderTrust: { enabled: false },
    },
    ui: { useAlternateBuffer: true },
    ide: { enabled: false, hasSeenNudge: true },
    sandbox: false,
    plan: false,
    planSettings: { modelRouting: false },
    model: {
      name: condition.modelName,
      disableLoopDetection: true,
      maxSessionTurns: Number.isFinite(maxSessionTurns) ? maxSessionTurns : -1,
    },
    experimental: {
      dynamicModelConfiguration: false,
      gemmaModelRouter: { enabled: false },
      pollux: {
        ...condition.pollux,
        diagnosticTrace: condition.pollux.enabled
          ? {
              enabled: true,
              outputPath: tracePath,
              includeAdvisorGuidanceText: true,
              includeModelThoughts: 'summary',
            }
          : undefined,
      },
    },
  };
}

export function classifyProviderFailure(stdout, stderr) {
  const text = `${stdout}\n${stderr}`;
  if (
    /MODEL_CAPACITY_EXHAUSTED|No capacity available|RESOURCE_EXHAUSTED/i.test(
      text,
    )
  ) {
    return 'model_capacity_exhausted';
  }
  if (
    /QUOTA_EXHAUSTED|QUOTA_EXCEEDED|exhausted your capacity|quota will reset/i.test(
      text,
    )
  ) {
    return 'quota_exhausted';
  }
  if (
    /rateLimitExceeded|RATE_LIMIT_EXCEEDED|too many requests|status\s*[:=]\s*429|code["']?\s*:\s*429|\b429\b/i.test(
      text,
    )
  ) {
    return 'rate_limited';
  }
  if (
    /\b(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ECONNREFUSED)\b|getaddrinfo|fetch failed|network is unreachable|Temporary failure in name resolution|cloudcode-pa\.googleapis\.com/i.test(
      text,
    )
  ) {
    return 'provider_network_failure';
  }
  return null;
}

export function extractProviderFailureDetails(stdout, stderr) {
  const text = `${stdout ?? ''}\n${stderr ?? ''}`;
  const kind = classifyProviderFailure(stdout ?? '', stderr ?? '');
  if (!kind) {
    return null;
  }
  const modelMatch =
    text.match(/\bmodel\s+([A-Za-z0-9._-]+)\b/i) ??
    text.match(/["']model["']\s*:\s*["']([^"']+)["']/i);
  const statusMatch =
    text.match(/\bstatus\s*[:=]\s*(\d{3})\b/i) ??
    text.match(/["']code["']\s*:\s*(\d{3})/i);
  const reasonMatch = text.match(
    /\b(MODEL_CAPACITY_EXHAUSTED|RESOURCE_EXHAUSTED|RATE_LIMIT_EXCEEDED|QUOTA_EXHAUSTED|QUOTA_EXCEEDED)\b/i,
  );
  const backendMatch = text.match(
    /\b(cloudcode-pa\.googleapis\.com|generativelanguage\.googleapis\.com)\b/i,
  );
  return {
    kind,
    model: modelMatch?.[1] ?? null,
    status: statusMatch ? Number(statusMatch[1]) : null,
    reason: reasonMatch?.[1]?.toUpperCase() ?? null,
    backend: backendMatch?.[1] ?? null,
    account_quota_signal:
      /\b(QUOTA_EXHAUSTED|QUOTA_EXCEEDED)\b|exhausted your capacity|quota will reset/i.test(
        text,
      ),
  };
}

export function classifyToolPolicyFailure(stdout, stderr) {
  const text = `${stdout}\n${stderr}`;
  return /requires user confirmation|confirmation required|requires approval|not supported in non-interactive mode/i.test(
    text,
  )
    ? 'non_interactive_confirmation_required'
    : null;
}

function hasUsablePatch(params, patchStats) {
  return (
    !params.patchCollectionFailed &&
    typeof params.patch === 'string' &&
    params.patch.trim().length > 0 &&
    patchStats.files.length > 0
  );
}

export function analyzePatch(patchText) {
  const files = [];
  for (const match of patchText.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
    files.push(match[2]);
  }
  const stats = {
    files,
    sourceFiles: 0,
    testFiles: 0,
    docFiles: 0,
    tempFiles: 0,
    reproductionFiles: 0,
  };
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    const base = path.basename(normalized).toLowerCase();
    const isReproduction =
      /(^|\/)(repro|reproduce|diagnostic|debug|scratch)[^/]*\.(py|js|ts|mjs|txt)$/i.test(
        normalized,
      );
    const isDoc =
      /\.(md|rst|txt)$/i.test(normalized) || normalized.startsWith('docs/');
    const isTest =
      /(^|\/)(test|tests|testing)(\/|$)/i.test(normalized) ||
      /test_.*\.py$|\.test\.[jt]sx?$|_test\.[jt]sx?$/i.test(normalized);
    const isTemp =
      normalized.startsWith('.tmp/') ||
      normalized.startsWith('tmp/') ||
      normalized.includes('/tmp/') ||
      base.endsWith('.log') ||
      base.endsWith('.tmp');
    const isSource = /\.(py|js|ts|tsx|mjs|c|cc|cpp|h|hpp|java|go|rs)$/i.test(
      normalized,
    );
    if (isReproduction) {
      stats.reproductionFiles++;
    }
    if (isDoc) {
      stats.docFiles++;
    } else if (isTest) {
      stats.testFiles++;
    } else if (isSource && !isReproduction && !isTemp) {
      stats.sourceFiles++;
    }
    if (isTemp) {
      stats.tempFiles++;
    }
  }
  return stats;
}

export function classifyRunResult(params) {
  const rawProviderFailureKind = classifyProviderFailure(
    params.stdout ?? '',
    params.stderr ?? '',
  );
  const providerFailureDetails = extractProviderFailureDetails(
    params.stdout ?? '',
    params.stderr ?? '',
  );
  const rawToolPolicyFailure = classifyToolPolicyFailure(
    params.stdout ?? '',
    params.stderr ?? '',
  );
  const patchStats = params.patchStats ?? analyzePatch(params.patch ?? '');
  const usablePatch = hasUsablePatch(params, patchStats);
  const runCompleted =
    params.exitCode === 0 &&
    !params.timedOut &&
    !params.responseCeilingExceeded &&
    !params.patchCollectionFailed;
  const warnings = [];
  let invalidationReason = null;
  let providerFailureKind = rawProviderFailureKind;
  let toolPolicyFailure = rawToolPolicyFailure;

  if (rawProviderFailureKind && runCompleted && usablePatch) {
    warnings.push(
      rawProviderFailureKind === 'model_capacity_exhausted'
        ? 'model_capacity_retry'
        : `${rawProviderFailureKind}_recovered`,
    );
    providerFailureKind = null;
  }
  if (rawToolPolicyFailure && runCompleted && usablePatch) {
    warnings.push('tool_policy_confirmation_recovered');
    toolPolicyFailure = null;
  }

  if (providerFailureKind) {
    invalidationReason = 'provider_failure';
  } else if (toolPolicyFailure) {
    invalidationReason = 'tool_policy_failure';
  } else if (params.responseCeilingExceeded) {
    invalidationReason = 'model_response_ceiling_exceeded';
  } else if (params.timedOut) {
    invalidationReason = 'timeout';
  } else if (params.patchCollectionFailed) {
    invalidationReason = 'patch_collection_failed';
  } else if (params.exitCode !== 0 && params.exitCode !== undefined) {
    invalidationReason = 'cli_crash';
  } else if (
    params.scorePolicy === 'strict' &&
    patchStats.files.length > 0 &&
    patchStats.sourceFiles === 0 &&
    patchStats.reproductionFiles > 0
  ) {
    invalidationReason = 'patch_hygiene';
  }

  const validForScore = invalidationReason === null;
  const scoreBucket = validForScore ? 'unresolved' : 'invalid';

  return {
    valid_for_score: validForScore,
    invalidation_reason: invalidationReason,
    provider_failure_kind: providerFailureKind,
    provider_failure_details: providerFailureKind
      ? providerFailureDetails
      : null,
    provider_failure_warning: providerFailureKind
      ? null
      : (rawProviderFailureKind ?? null),
    provider_failure_warning_details:
      providerFailureKind || !rawProviderFailureKind
        ? null
        : providerFailureDetails,
    tool_policy_failure: toolPolicyFailure,
    tool_policy_warning: toolPolicyFailure ? null : (rawToolPolicyFailure ?? null),
    warnings,
    score_bucket: scoreBucket,
    patch_stats: patchStats,
  };
}

export function summarizeRecords(records) {
  const summary = {
    total: records.length,
    valid_for_score: 0,
    score_denominator: 0,
    invalid: 0,
    incomplete: 0,
    resolved: 0,
    unresolved: 0,
    invalidation_reasons: {},
  };
  for (const record of records) {
    if (record.valid_for_score) {
      summary.valid_for_score++;
      summary.score_denominator++;
    }
    const bucket = record.score_bucket ?? 'incomplete';
    if (bucket in summary) {
      summary[bucket]++;
    }
    if (record.invalidation_reason) {
      summary.invalidation_reasons[record.invalidation_reason] =
        (summary.invalidation_reasons[record.invalidation_reason] ?? 0) + 1;
    }
  }
  return summary;
}

export function buildEntrypointMetadata(params) {
  return {
    ...params.entrypoint,
    packageVersion: params.packageVersion ?? null,
    gitHead: params.gitHead ?? null,
    gitDirty: params.gitDirty ?? null,
    bundleFresh: params.bundleFresh ?? null,
    nodeVersion: process.version,
    platform: `${os.platform()}-${os.arch()}`,
  };
}
