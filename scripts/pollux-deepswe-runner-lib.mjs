/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_DEEPSWE_MANIFEST = path.join(
  'evaluation_results',
  'deepswe-top20-gemini-3.1-pro.json',
);

export const DEFAULT_DEEPSWE_REPO = path.join(os.homedir(), 'deep-swe');
export const DEFAULT_SCRATCH_ROOT = path.join(os.homedir(), 'pollux-deepswe');

export const VALID_DEEPSWE_MODES = new Set([
  'preflight',
  'prepare',
  'smoke',
  'run',
  'rescore',
  'summarize',
]);

export const VALID_DEEPSWE_SCORE_POLICIES = new Set(['strict', 'diagnostic']);

export const detectorSettings = {
  advisorTriggerMode: 'detector',
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

export const strictFdSettings = {
  advisorTriggerMode: 'hybrid',
  advisorBudgetMode: 'fixed',
  maxAdvisorCallsPerTurn: 3,
  maxAdvisorCallsPerSession: 8,
  maxAdvisorCallsShortTask: 3,
  maxAdvisorCallsLongTask: 5,
  detector: {
    ...detectorSettings.detector,
    timing: {
      sameTurnEnabled: true,
      maxSameTurnEscalationsPerTurn: 3,
    },
  },
};

export const VALID_DEEPSWE_FD_PROFILES = new Set(['detector', 'strict']);

export function buildDeepSweConditions(fdProfile = 'strict') {
  if (!VALID_DEEPSWE_FD_PROFILES.has(fdProfile)) {
    throw new Error(
      `Invalid FD profile ${fdProfile}. Expected detector or strict.`,
    );
  }
  const fdSettings =
    fdProfile === 'strict' ? strictFdSettings : detectorSettings;
  return {
    A: deepsweConditions.A,
    FD: {
      ...deepsweConditions.FD,
      pollux: {
        ...deepsweConditions.FD.pollux,
        ...fdSettings,
      },
    },
    E: deepsweConditions.E,
  };
}

export const deepsweConditions = {
  A: {
    id: 'A',
    modelName: 'gemini-3-flash-preview',
    pollux: {
      enabled: false,
      executorModel: 'gemini-3-flash-preview',
      advisorModel: undefined,
      advisorFallbackModel: null,
    },
  },
  FD: {
    id: 'FD',
    modelName: 'gemini-3-flash-preview',
    pollux: {
      enabled: true,
      executorModel: 'gemini-3-flash-preview',
      advisorModel: 'gemini-3.1-pro-preview',
      advisorFallbackModel: null,
      ...strictFdSettings,
    },
  },
  E: {
    id: 'E',
    modelName: 'gemini-3.1-pro-preview',
    pollux: {
      enabled: false,
      executorModel: 'gemini-3.1-pro-preview',
      advisorModel: undefined,
      advisorFallbackModel: null,
    },
  },
};

export function parseDeepSweRunnerArgs(argv, now = new Date()) {
  const out = {
    mode: 'run',
    taskManifest: DEFAULT_DEEPSWE_MANIFEST,
    deepsweRepo: process.env.POLLUX_DEEPSWE_REPO ?? DEFAULT_DEEPSWE_REPO,
    scratchRoot:
      process.env.POLLUX_DEEPSWE_SCRATCH_ROOT ?? DEFAULT_SCRATCH_ROOT,
    conditions: ['E', 'FD', 'A'],
    limit: undefined,
    offset: 0,
    repeats: 1,
    runId: `deepswe-${now.toISOString().replace(/[:.]/g, '-')}`,
    timeoutMs: 7_200_000,
    maxSessionTurns: -1,
    maxApiResponses: 150,
    prepareOnly: false,
    preflightOnly: false,
    entrypoint: 'bundle',
    binaryPath: undefined,
    fakeResponsesPath: undefined,
    sourceRun: undefined,
    taskIds: undefined,
    goldPatchMode: false,
    nullPatchMode: false,
    scorePolicy: 'strict',
    dockerCommand: process.env.POLLUX_DEEPSWE_DOCKER ?? 'docker',
    allowNonWsl: false,
    verifierOnly: false,
    noVerifier: false,
    dependencyPreflight: false,
    dependencyWarmup: false,
    networkedVerifierPreflight: false,
    fdProfile: 'strict',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--mode' && next) {
      out.mode = next;
      i++;
    } else if (arg === '--task-manifest' && next) {
      out.taskManifest = next;
      i++;
    } else if (arg === '--deepswe-repo' && next) {
      out.deepsweRepo = next;
      i++;
    } else if (arg === '--scratch-root' && next) {
      out.scratchRoot = next;
      i++;
    } else if (arg === '--conditions' && next) {
      out.conditions = splitCsv(next);
      i++;
    } else if (arg === '--limit' && next) {
      out.limit = Number(next);
      i++;
    } else if (arg === '--offset' && next) {
      out.offset = Number(next);
      i++;
    } else if (arg === '--repeats' && next) {
      out.repeats = Number(next);
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
    } else if (arg === '--source-run' && next) {
      out.sourceRun = next;
      i++;
    } else if (arg === '--task-ids' && next) {
      out.taskIds = splitCsv(next);
      i++;
    } else if (arg === '--score-policy' && next) {
      out.scorePolicy = next;
      i++;
    } else if (arg === '--docker-command' && next) {
      out.dockerCommand = next;
      i++;
    } else if (arg === '--prepare-only') {
      out.prepareOnly = true;
    } else if (arg === '--preflight-only') {
      out.preflightOnly = true;
      out.mode = 'preflight';
    } else if (arg === '--gold-patch-mode') {
      out.goldPatchMode = true;
    } else if (arg === '--null-patch-mode') {
      out.nullPatchMode = true;
    } else if (arg === '--allow-non-wsl') {
      out.allowNonWsl = true;
    } else if (arg === '--verifier-only') {
      out.verifierOnly = true;
    } else if (arg === '--no-verifier') {
      out.noVerifier = true;
    } else if (arg === '--dependency-preflight') {
      out.dependencyPreflight = true;
    } else if (arg === '--dependency-warmup') {
      out.dependencyWarmup = true;
      out.dependencyPreflight = true;
    } else if (arg === '--networked-verifier-preflight') {
      out.networkedVerifierPreflight = true;
    } else if (arg === '--fd-profile' && next) {
      out.fdProfile = next;
      i++;
    }
  }

  if (out.prepareOnly) {
    out.mode = 'prepare';
  }
  if (!VALID_DEEPSWE_MODES.has(out.mode)) {
    throw new Error(
      `Invalid --mode ${out.mode}. Expected one of ${[
        ...VALID_DEEPSWE_MODES,
      ].join(', ')}.`,
    );
  }
  if (!VALID_DEEPSWE_SCORE_POLICIES.has(out.scorePolicy)) {
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
  if (out.noVerifier && out.verifierOnly) {
    throw new Error('Use only one of --no-verifier or --verifier-only.');
  }
  if (out.mode === 'rescore' && !out.sourceRun) {
    throw new Error('--mode rescore requires --source-run.');
  }
  if (out.mode === 'rescore' && (out.goldPatchMode || out.nullPatchMode)) {
    throw new Error('--mode rescore cannot be combined with patch-emission modes.');
  }
  for (const condition of out.conditions) {
    if (!deepsweConditions[condition]) {
      throw new Error(`Unknown DeepSWE condition ${condition}.`);
    }
  }
  if (!VALID_DEEPSWE_FD_PROFILES.has(out.fdProfile)) {
    throw new Error(
      `Invalid --fd-profile ${out.fdProfile}. Expected detector or strict.`,
    );
  }
  for (const key of [
    'offset',
    'repeats',
    'timeoutMs',
    'maxSessionTurns',
    'maxApiResponses',
  ]) {
    if (!Number.isFinite(out[key])) {
      throw new Error(`Invalid numeric value for ${key}: ${out[key]}`);
    }
  }
  if (out.limit !== undefined && !Number.isFinite(out.limit)) {
    throw new Error(`Invalid numeric value for limit: ${out.limit}`);
  }
  if (out.repeats < 1) {
    throw new Error('--repeats must be at least 1.');
  }
  return out;
}

function splitCsv(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function resolveRepoPath(repoRoot, inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(repoRoot, inputPath);
}

export function loadDeepSweManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.kind !== 'pollux-deepswe-task-selection') {
    throw new Error(`Not a Pollux DeepSWE manifest: ${manifestPath}`);
  }
  if (
    !Array.isArray(manifest.primaryTasks) ||
    manifest.primaryTasks.length === 0
  ) {
    throw new Error(`DeepSWE manifest has no primaryTasks: ${manifestPath}`);
  }
  return manifest;
}

export function selectDeepSweTasks(manifest, args) {
  let tasks = manifest.primaryTasks.slice(
    args.offset,
    args.limit === undefined ? undefined : args.offset + args.limit,
  );
  if (args.taskIds?.length > 0) {
    const wanted = new Set(args.taskIds);
    tasks = tasks.filter((task) => wanted.has(task.taskId));
  }
  const repeated = [];
  for (let repeat = 1; repeat <= args.repeats; repeat++) {
    for (const task of tasks) {
      repeated.push({ ...task, repeat });
    }
  }
  return repeated;
}

export function resolveDeepSweTaskDir(deepsweRepo, taskId) {
  return path.join(deepsweRepo, 'tasks', taskId);
}

export function validateDeepSweTaskDir(taskDir) {
  const required = [
    'task.toml',
    'instruction.md',
    path.join('tests', 'test.sh'),
    path.join('tests', 'test.patch'),
  ];
  const missing = required.filter((relativePath) => {
    return !fs.existsSync(path.join(taskDir, relativePath));
  });
  if (missing.length > 0) {
    throw new Error(
      `DeepSWE task is missing ${missing.join(', ')}: ${taskDir}`,
    );
  }
}

export function loadDeepSweTask(taskDir, manifestTask = {}) {
  validateDeepSweTaskDir(taskDir);
  const tomlText = fs.readFileSync(path.join(taskDir, 'task.toml'), 'utf8');
  const taskToml = parseSimpleToml(tomlText);
  const metadata = taskToml.metadata ?? {};
  const environment = taskToml.environment ?? {};
  const agent = taskToml.agent ?? {};
  const verifier = taskToml.verifier ?? {};
  const taskId =
    metadata.task_id ?? manifestTask.taskId ?? path.basename(taskDir);
  return {
    taskId,
    taskDir,
    taskToml,
    instruction: fs.readFileSync(path.join(taskDir, 'instruction.md'), 'utf8'),
    testsDir: path.join(taskDir, 'tests'),
    solutionDir: path.join(taskDir, 'solution'),
    solutionPatchPath: path.join(taskDir, 'solution', 'solution.patch'),
    repository:
      manifestTask.repository ??
      repositorySlugFromUrl(metadata.repository_url ?? ''),
    repositoryUrl: metadata.repository_url ?? manifestTask.repositoryUrl,
    language: metadata.language ?? manifestTask.language,
    problemTitle:
      metadata.display_title ??
      metadata.original_title ??
      manifestTask.problemTitle,
    baseCommitHash: metadata.base_commit_hash ?? manifestTask.baseCommitHash,
    dockerImage: environment.docker_image,
    agentTimeoutSec: Number(agent.timeout_sec ?? 0) || null,
    verifierTimeoutSec: Number(verifier.timeout_sec ?? 0) || null,
    metadata,
  };
}

const NORMALIZED_TEXT_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.go',
  '.h',
  '.hpp',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.patch',
  '.py',
  '.rs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function shouldNormalizeTextFile(filePath) {
  const base = path.basename(filePath).toLowerCase();
  return base === 'test.sh' || NORMALIZED_TEXT_EXTENSIONS.has(path.extname(base));
}

export function normalizeTextForVerifier(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function copyDirectoryNormalizedForVerifier(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryNormalizedForVerifier(sourcePath, targetPath);
    } else if (entry.isFile()) {
      if (shouldNormalizeTextFile(sourcePath)) {
        fs.writeFileSync(
          targetPath,
          normalizeTextForVerifier(fs.readFileSync(sourcePath, 'utf8')),
        );
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
      try {
        fs.chmodSync(targetPath, fs.statSync(sourcePath).mode);
      } catch {
        // Windows checkouts may not expose POSIX mode bits; bash invokes test.sh directly.
      }
    }
  }
}

export function parseSimpleToml(text) {
  const result = {};
  let section = [];
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line) {
      continue;
    }
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].split('.');
      ensureTomlObject(result, section);
      continue;
    }
    const assignmentMatch = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignmentMatch) {
      continue;
    }
    const target = ensureTomlObject(result, section);
    target[assignmentMatch[1]] = parseTomlValue(assignmentMatch[2].trim());
  }
  return result;
}

function ensureTomlObject(root, section) {
  let cursor = root;
  for (const part of section) {
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  return cursor;
}

function parseTomlValue(value) {
  if (/^".*"$/.test(value)) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === '[]') {
    return [];
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function repositorySlugFromUrl(repositoryUrl) {
  return repositoryUrl
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/\.git$/, '');
}

function sentenceSnippets(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildDeepSweContractChecklist(task) {
  const instruction = task.instruction ?? '';
  const lower = instruction.toLowerCase();
  const snippets = sentenceSnippets(instruction);
  const explicitErrorConditions = snippets
    .filter((line) => /\berror|throw|fail|invalid|insufficient|mismatch/i.test(line))
    .slice(0, 6);
  const requiredApis = [
    ...new Set(
      [...instruction.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)]
        .map((match) => match[1])
        .filter((name) => !['if', 'for', 'while', 'switch', 'return'].includes(name))
        .slice(0, 10),
    ),
  ];
  const checklist = {
    taskId: task.taskId,
    requiredApis,
    explicitErrorConditions,
    forbiddenBehaviors: [],
    verificationFocus: snippets.slice(0, 5),
    finalDiffHazards: [],
  };

  if (task.taskId === 'wazero-multi-module-snapshots') {
    checklist.requiredApis.push('ErrorCode');
    checklist.explicitErrorConditions.push(
      'RestoreSnapshot must return an error whose ErrorCode(err) is insufficient_memory when target memory is too small.',
    );
    checklist.forbiddenBehaviors.push(
      'Do not grow target module memory during RestoreSnapshot.',
      'Do not treat smaller restore target memory as success.',
    );
    checklist.verificationFocus.push(
      'Restoring into nil or undersized memory must fail with insufficient_memory.',
    );
    checklist.finalDiffHazards.push({
      id: 'wazero_restore_mem_grow',
      pattern: '\\bmem\\.Grow\\s*\\(\\s*(?!0\\s*\\))',
      message:
        'Patch grows memory during restore; for this task restore target memory must already be large enough. mem.Grow(0) size checks are okay.',
    });
  }

  if (/must|should|required|exactly|all|never|not/i.test(instruction)) {
    checklist.verificationFocus.push(
      'Re-read every MUST/SHOULD/NEVER clause before finalizing.',
    );
  }
  if (lower.includes('do not') || lower.includes('never')) {
    checklist.forbiddenBehaviors.push(
      'Do not violate explicit negative requirements from the instruction.',
    );
  }
  return checklist;
}

export function analyzeContractChecklistHazards(patch, checklist) {
  const hazards = [];
  for (const hazard of checklist?.finalDiffHazards ?? []) {
    const pattern = new RegExp(hazard.pattern, 'i');
    if (pattern.test(patch)) {
      hazards.push({
        id: hazard.id,
        message: hazard.message,
      });
    }
  }
  return hazards;
}

function formatChecklistForPrompt(checklist) {
  if (!checklist) {
    return [];
  }
  const lines = ['Task contract checklist:'];
  if (checklist.requiredApis.length > 0) {
    lines.push(`- Required APIs/symbols: ${checklist.requiredApis.join(', ')}`);
  }
  for (const condition of checklist.explicitErrorConditions) {
    lines.push(`- Error condition: ${condition}`);
  }
  for (const behavior of checklist.forbiddenBehaviors) {
    lines.push(`- Forbidden behavior: ${behavior}`);
  }
  for (const focus of checklist.verificationFocus.slice(0, 6)) {
    lines.push(`- Verify: ${focus}`);
  }
  return lines;
}

export function buildDeepSwePrompt(task, options = {}) {
  const conditionId = options.condition?.id ?? options.conditionId;
  const checklist = options.contractChecklist;
  const fdLines =
    conditionId === 'FD'
      ? [
          '',
          'Pollux FD steering requirements:',
          '- Before the first source edit, request advisor contract extraction with exactly: <pollux:advisor_request reason="contract extraction before source edit" timing="now"/>',
          '- After substantial source edits or repeated failed tests, request advisor risk review with: <pollux:advisor_request reason="mid-run risk review after edits or failed tests" timing="now"/>',
          '- Before final completion, request final diff audit with: <pollux:advisor_request reason="final diff audit before completion" timing="now"/>',
          '- Treat advisor guidance as hidden implementation constraints; do not mention Pollux in the final answer.',
        ]
      : [];
  return [
    'You are fixing a DeepSWE long-horizon engineering task in this repository.',
    '',
    'Work rules:',
    '- Make the smallest source-code change that satisfies the task.',
    '- Preserve existing behavior outside the requested feature or fix.',
    '- Do not commit changes.',
    '- You may inspect files and run focused tests if useful.',
    '- Avoid broad expensive test suites unless the task requires them.',
    '- Do not edit verifier tests, benchmark metadata, or generated artifacts.',
    '- When done, leave the working tree with only the intended solution patch.',
    '',
    `Repository: ${task.repository}`,
    `Task: ${task.taskId}`,
    `Base commit: ${task.baseCommitHash}`,
    `Language: ${task.language}`,
    '',
    ...formatChecklistForPrompt(checklist),
    ...(checklist ? [''] : []),
    ...fdLines,
    ...(fdLines.length > 0 ? [''] : []),
    'DeepSWE instruction:',
    task.instruction.trim(),
    '',
  ].join('\n');
}

export function buildVerifierDockerArgs(params) {
  const {
    dockerImage,
    workDir,
    testsDir,
    verifierLogDir,
    artifactDir,
    timeoutSec,
  } = params;
  if (!dockerImage) {
    throw new Error(
      'DeepSWE task.toml did not specify environment.docker_image.',
    );
  }
  const args = [
    'run',
    '--rm',
    '--network',
    params.network ?? 'none',
    '--workdir',
    '/app',
    '-v',
    `${workDir}:/app`,
    '-v',
    `${testsDir}:/tests:ro`,
    '-v',
    `${verifierLogDir}:/logs/verifier`,
    '-v',
    `${artifactDir}:/logs/artifacts`,
  ];
  if (params.dependencyCacheDir) {
    args.push(
      '-v',
      `${params.dependencyCacheDir}:/dependency-cache`,
      '-e',
      'npm_config_cache=/dependency-cache/npm',
      '-e',
      'npm_config_offline=true',
      '-e',
      'npm_config_prefer_offline=true',
      '-e',
      'YARN_CACHE_FOLDER=/dependency-cache/yarn',
      '-e',
      'PNPM_HOME=/dependency-cache/pnpm-home',
    );
  }
  args.push(
    dockerImage,
    'bash',
    '-lc',
    timeoutSec
      ? `timeout ${Math.ceil(timeoutSec)}s bash /tests/test.sh`
      : 'bash /tests/test.sh',
  );
  return args;
}

export function inferDependencyPreflight(testScriptText, options = {}) {
  const language = options.language?.toLowerCase?.() ?? '';
  const text = `${testScriptText}\n${options.testPatchText ?? ''}`.toLowerCase();
  if (/\b(pnpm|pnpm dlx)\b/.test(text)) {
    const pkg = text.includes('vitest')
      ? 'vitest'
      : text.includes('jest')
        ? 'jest'
        : null;
    return {
      kind: 'pnpm',
      required: true,
      command: pkg
        ? `pnpm --version && pnpm view ${pkg} version`
        : 'pnpm --version',
      warmupCommand: pkg
        ? `pnpm --version && pnpm dlx ${pkg} --version`
        : 'pnpm --version',
    };
  }
  if (/\byarn\b/.test(text)) {
    const pkg = text.includes('vitest')
      ? 'vitest'
      : text.includes('jest')
        ? 'jest'
        : null;
    return {
      kind: 'yarn',
      required: true,
      command: pkg
        ? `yarn --version && yarn info ${pkg} version`
        : 'yarn --version',
      warmupCommand: pkg
        ? `yarn --version && yarn dlx ${pkg} --version`
        : 'yarn --version',
    };
  }
  if (/\b(npm|npx|jest|vitest)\b/.test(text)) {
    const pkg = text.includes('vitest')
      ? 'vitest'
      : text.includes('jest')
        ? 'jest'
        : null;
    return {
      kind: 'npm',
      required: true,
      command: pkg
        ? `npm --version && npm view ${pkg} version --prefer-online`
        : 'npm --version && npm ping',
      warmupCommand: pkg
        ? `npm --version && npm exec --yes --package ${pkg} ${pkg} -- --version`
        : 'npm --version && npm ping',
    };
  }
  if (/\b(uv|pip|pip3|python -m pip|python3 -m pip)\b/.test(text)) {
    return {
      kind: text.includes('uv') ? 'uv' : 'pip',
      required: true,
      command: text.includes('uv')
        ? 'uv --version'
        : 'python3 -m pip --version || python -m pip --version',
      warmupCommand: text.includes('uv')
        ? 'uv --version'
        : 'python3 -m pip --version || python -m pip --version',
    };
  }
  if (
    /\bgo\s+test\b|\bgo\s+run\b|\bgo\s+build\b/.test(text) ||
    language === 'go'
  ) {
    return {
      kind: 'go',
      required: false,
      command: 'go version',
      warmupCommand: 'go version',
    };
  }
  return {
    kind: 'none',
    required: false,
    command: 'true',
    warmupCommand: 'true',
  };
}

export function buildDependencyPreflightDockerArgs(params) {
  if (!params.dockerImage) {
    throw new Error(
      'DeepSWE task.toml did not specify environment.docker_image.',
    );
  }
  const args = [
    'run',
    '--rm',
    '--network',
    params.networked ? 'bridge' : 'none',
    '--workdir',
    '/app',
    '-v',
    `${params.testsDir}:/tests:ro`,
  ];
  if (params.cacheDir) {
    args.push(
      '-v',
      `${params.cacheDir}:/dependency-cache`,
      '-e',
      'npm_config_cache=/dependency-cache/npm',
      '-e',
      'npm_config_prefer_offline=true',
      '-e',
      'YARN_CACHE_FOLDER=/dependency-cache/yarn',
      '-e',
      'PNPM_HOME=/dependency-cache/pnpm-home',
    );
  }
  args.push(params.dockerImage, 'bash', '-lc', params.command);
  return args;
}

export function parseVerifierPhaseExitCodes(text) {
  const baselineMatch = /Baseline exit code:\s*(-?\d+)/i.exec(text);
  const newTestsMatch = /New tests exit code:\s*(-?\d+)/i.exec(text);
  return {
    baseline:
      baselineMatch && Number.isFinite(Number(baselineMatch[1]))
        ? Number(baselineMatch[1])
        : null,
    newTests:
      newTestsMatch && Number.isFinite(Number(newTestsMatch[1]))
        ? Number(newTestsMatch[1])
        : null,
  };
}

export function isVerifierDependencyFailure(text) {
  const dependencyFailurePatterns = [
    /\bEAI_AGAIN\b/i,
    /\bENOTCACHED\b/i,
    /\bENOTFOUND\b/i,
    /\bECONNRESET\b/i,
    /\bETIMEDOUT\b/i,
    /\bEHOSTUNREACH\b/i,
    /getaddrinfo/i,
    /registry\.npmjs\.org/i,
    /Could not resolve host/i,
    /Temporary failure in name resolution/i,
    /network is unreachable/i,
    /i\/o timeout/i,
    /TLS handshake timeout/i,
    /no cached response/i,
    /not in cache/i,
    /offline cache/i,
    /cache mode is ['"]?only-if-cached['"]?/i,
    /pip .*((timed? ?out)|connection|index)/i,
    /uv .*((timed? ?out)|connection|index)/i,
    /git (clone|fetch).*failed/i,
  ];
  return dependencyFailurePatterns.some((pattern) =>
    pattern.test(text),
  );
}

export function classifyVerifierResult(params) {
  const rewardPath = path.join(params.verifierLogDir, 'reward.txt');
  const reward = fs.existsSync(rewardPath)
    ? fs.readFileSync(rewardPath, 'utf8').trim()
    : null;
  const outputText = `${params.stdout ?? ''}\n${params.stderr ?? ''}`;
  const phaseExitCodes = parseVerifierPhaseExitCodes(outputText);
  const dependencyFailure =
    params.dependencyPreflightFailed === true ||
    isVerifierDependencyFailure(outputText);
  const baselineFailed =
    phaseExitCodes.baseline !== null && phaseExitCodes.baseline !== 0;
  const missingMeaningfulPhase =
    phaseExitCodes.baseline === null && phaseExitCodes.newTests === null;
  if (params.skipped) {
    return {
      verifier_skipped: true,
      verifier_reward: null,
      score_bucket: 'unresolved',
      resolved: false,
      verifier_baseline_exit_code: phaseExitCodes.baseline,
      verifier_new_tests_exit_code: phaseExitCodes.newTests,
      verifier_failure_kind: null,
      verifier_dependency_failure: dependencyFailure,
    };
  }
  if (dependencyFailure || baselineFailed || (params.exitCode !== 0 && missingMeaningfulPhase)) {
    return {
      verifier_skipped: false,
      verifier_reward: null,
      score_bucket:
        params.scorePolicy === 'diagnostic' ? 'unresolved' : 'invalid',
      resolved: false,
      verifier_baseline_exit_code: phaseExitCodes.baseline,
      verifier_new_tests_exit_code: phaseExitCodes.newTests,
      verifier_failure_kind: dependencyFailure
        ? 'dependency_failure'
        : baselineFailed
          ? 'baseline_failure'
          : 'infra_failure',
      verifier_dependency_failure: dependencyFailure,
      verifier_invalidation_reason: 'verifier_infra_failure',
    };
  }
  if (params.exitCode === 0 && reward === '1') {
    return {
      verifier_skipped: false,
      verifier_reward: 1,
      score_bucket: 'resolved',
      resolved: true,
      verifier_baseline_exit_code: phaseExitCodes.baseline,
      verifier_new_tests_exit_code: phaseExitCodes.newTests,
      verifier_failure_kind: null,
      verifier_dependency_failure: false,
    };
  }
  if (reward === '0') {
    return {
      verifier_skipped: false,
      verifier_reward: 0,
      score_bucket: 'unresolved',
      resolved: false,
      verifier_baseline_exit_code: phaseExitCodes.baseline,
      verifier_new_tests_exit_code: phaseExitCodes.newTests,
      verifier_failure_kind: 'new_tests_failed',
      verifier_dependency_failure: false,
    };
  }
  return {
    verifier_skipped: false,
    verifier_reward: null,
    score_bucket:
      params.scorePolicy === 'diagnostic' ? 'unresolved' : 'invalid',
    resolved: false,
    verifier_baseline_exit_code: phaseExitCodes.baseline,
    verifier_new_tests_exit_code: phaseExitCodes.newTests,
    verifier_failure_kind: 'infra_failure',
    verifier_dependency_failure: false,
    verifier_invalidation_reason: 'verifier_infra_failure',
  };
}

export function buildPreflightReport(params) {
  const checks = [];
  const add = (id, ok, detail = null, required = true) => {
    checks.push({ id, ok, required, detail });
  };
  const platform = `${os.platform()}-${os.arch()}`;
  const isWsl =
    os.platform() === 'linux' &&
    (fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop') ||
      /microsoft/i.test(readFileIfExists('/proc/version')));
  add('platform', isWsl || params.allowNonWsl, {
    platform,
    isWsl,
    expected: 'WSL2 Ubuntu is recommended for real DeepSWE runs.',
  });
  add('task_manifest', fs.existsSync(params.taskManifest), params.taskManifest);
  add(
    'deepswe_repo',
    fs.existsSync(params.deepsweRepo),
    {
      path: params.deepsweRepo,
      behavior: 'The runner will clone datacurve-ai/deep-swe here if missing.',
    },
    false,
  );
  add(
    'deepswe_tasks_dir',
    fs.existsSync(path.join(params.deepsweRepo, 'tasks')),
    path.join(params.deepsweRepo, 'tasks'),
    false,
  );
  const tasksDir = path.join(params.deepsweRepo, 'tasks');
  const crlfScripts = [];
  if (fs.existsSync(tasksDir)) {
    for (const taskName of fs.readdirSync(tasksDir).slice(0, 25)) {
      const testScript = path.join(tasksDir, taskName, 'tests', 'test.sh');
      if (
        fs.existsSync(testScript) &&
        fs.readFileSync(testScript, 'utf8').includes('\r\n')
      ) {
        crlfScripts.push(path.join(taskName, 'tests', 'test.sh'));
      }
    }
  }
  add(
    'deepswe_verifier_scripts_lf',
    crlfScripts.length === 0,
    {
      checkedTasks: fs.existsSync(tasksDir)
        ? Math.min(fs.readdirSync(tasksDir).length, 25)
        : 0,
      crlfScripts: crlfScripts.slice(0, 10),
      behavior: 'The runner normalizes verifier inputs before Docker even when this check warns.',
    },
    false,
  );
  add('scratch_root_parent', fs.existsSync(path.dirname(params.scratchRoot)), {
    scratchRoot: params.scratchRoot,
    parent: path.dirname(params.scratchRoot),
  });
  add('node_version', Number(process.versions.node.split('.')[0]) >= 20, {
    node: process.version,
  });
  add('outside_onedrive', !/onedrive/i.test(params.scratchRoot), {
    scratchRoot: params.scratchRoot,
  });
  return {
    generatedAt: new Date().toISOString(),
    checks,
    ok: checks.every((check) => check.ok || !check.required),
  };
}

function readFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function summarizeDeepSweRecords(records) {
  const summary = {
    total: records.length,
    valid_for_score: 0,
    invalid: 0,
    incomplete: 0,
    resolved: 0,
    unresolved: 0,
    invalidation_reasons: {},
    warnings: {},
    verifier_infra_failures: 0,
    patch_apply_failures: 0,
  };
  for (const record of records) {
    if (record.valid_for_score) {
      summary.valid_for_score++;
    }
    const bucket = record.score_bucket ?? 'incomplete';
    const isVerifierInfra =
      record.verifier_invalidation_reason === 'verifier_infra_failure';
    if (bucket in summary && !(bucket === 'unresolved' && isVerifierInfra)) {
      summary[bucket]++;
    }
    const reason =
      record.invalidation_reason ?? record.verifier_invalidation_reason;
    if (reason) {
      summary.invalidation_reasons[reason] =
        (summary.invalidation_reasons[reason] ?? 0) + 1;
    }
    for (const warning of record.warnings ?? []) {
      summary.warnings[warning] = (summary.warnings[warning] ?? 0) + 1;
    }
    if (isVerifierInfra) {
      summary.verifier_infra_failures++;
    }
    if (record.invalidation_reason === 'patch_apply_failed') {
      summary.patch_apply_failures++;
    }
  }
  return summary;
}
