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

export const STRICT_FD_CHECKPOINT_REASONS = [
  'contract extraction before source edit',
  'mid-run risk review after edits or failed tests',
  'final diff audit before completion',
];

export const STRICT_FD_REQUIRED_CHECKPOINT_REASONS = [
  'contract extraction before source edit',
  'final diff audit before completion',
];

export const strictFdSettings = {
  advisorTriggerMode: 'hybrid',
  advisorBudgetMode: 'fixed',
  advisorExecutorProfile: 'strict_fd',
  maxAdvisorCallsPerTurn: 3,
  maxAdvisorCallsPerSession: 6,
  maxAdvisorCallsShortTask: 3,
  maxAdvisorCallsLongTask: 5,
  executorCheckpoints: {
    enabled: true,
    requiredReasons: STRICT_FD_REQUIRED_CHECKPOINT_REASONS,
    enforceRequired: true,
    reserveRequiredPrimarySlots: true,
    minGuidanceWords: 24,
    rejectTruncatedGuidance: true,
    requireStructuredGuidance: true,
    finalGate: true,
  },
  detector: {
    ...detectorSettings.detector,
    selfReport: { enabled: false, promptPrimingEnabled: false },
    timing: {
      sameTurnEnabled: true,
      maxSameTurnEscalationsPerTurn: 2,
    },
  },
};

export const VALID_DEEPSWE_FD_PROFILES = new Set(['detector', 'strict']);

const STRICT_FD_FINAL_VERIFICATION_COMMAND_RE =
  /\b(?:gofmt|go\s+test(?:\s|$)|go\s+vet|npm\s+(?:run\s+)?(?:test|build|typecheck)|npm\s+test|npx\s+(?:jest|vitest|tsc)|pnpm\s+(?:test|run\s+test|run\s+build|run\s+typecheck|exec\s+(?:jest|vitest|tsc))|yarn\s+(?:test|build|typecheck)|jest(?:\s|$)|vitest(?:\s|$)|tsc\s+--noEmit)/i;

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
        executorCheckpoints: undefined,
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

export function resolveDeepSweEphemeralWorkspacesRoot(scratchRoot, runId) {
  return path.join(scratchRoot, 'workspaces', runId);
}

export function resolveDeepSweVerifierWorkspaceRoot(
  scratchRoot,
  sampleId,
) {
  return path.join(scratchRoot, 'verifier-workspaces', sampleId);
}

export function shouldStageDeepSweVerifierCheckout(
  platform = process.platform,
) {
  return platform === 'win32';
}

export function resolveDeepSweDependencyCacheDir(scratchRoot, taskId) {
  return path.join(scratchRoot, 'dependency-cache', taskId);
}

/**
 * Ephemeral task checkouts are pruned after scoring by default.
 * Keep them for --mode prepare and when --keep-workspaces is set.
 * Telemetry under raw/ is never pruned by this policy.
 */
export function shouldRetainDeepSweWorkspace(args) {
  return args?.keepWorkspaces === true || args?.mode === 'prepare';
}

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
    baselineVerifierPreflight: false,
    fdProfile: 'strict',
    // Default false: prune ephemeral git worktrees after each sample.
    // Telemetry under raw/ is always retained.
    keepWorkspaces: false,
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
      out.baselineVerifierPreflight = true;
    } else if (arg === '--baseline-verifier-preflight') {
      out.baselineVerifierPreflight = true;
    } else if (arg === '--no-baseline-verifier-preflight') {
      out.baselineVerifierPreflight = false;
    } else if (arg === '--fd-profile' && next) {
      out.fdProfile = next;
      i++;
    } else if (arg === '--keep-workspaces') {
      out.keepWorkspaces = true;
    } else if (arg === '--no-keep-workspaces') {
      out.keepWorkspaces = false;
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
      'receiver.Compare(other) means the receiver is the old/base snapshot and the argument is the new/changed snapshot.',
      'DiffEntry.OldValue must come from receiver data; DiffEntry.NewValue must come from other.',
      'Diff entries must be grouped by module capture order with offsets ascending within each module.',
      'Incremental snapshots, including incremental-from-incremental snapshots, must reconstruct complete memory from Data().',
      'Summarize(incremental).ModifiedBytes must match the changed-byte count.',
      'Restoring into nil or undersized memory must fail with insufficient_memory.',
      'RestoreSnapshot must not grow target memory.',
    );
    checklist.finalDiffHazards.push({
      id: 'wazero_compare_old_new_inversion',
      pattern:
        'OldValue\\s*:\\s*[^\\n,]*other|NewValue\\s*:\\s*[^\\n,]*(?:base|old|receiver)',
      message:
        'Patch may invert Compare old/new values; receiver.Compare(other) means OldValue comes from receiver and NewValue comes from other.',
    });
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

function normalizeFdCheckpointReason(reason) {
  return typeof reason === 'string'
    ? reason.trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
}

function checkpointReasonFromAttribution(attribution) {
  if (typeof attribution !== 'string') {
    return undefined;
  }
  const match = /\badvisor_request reason="([^"]+)"/i.exec(attribution);
  return match?.[1];
}

function checkpointReasonsFromText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  const out = [];
  for (const match of text.matchAll(
    /<pollux:advisor_request\b[^>]*\breason="([^"]+)"[^>]*\/?>/gi,
  )) {
    out.push(match[1]);
  }
  for (const match of text.matchAll(
    /^[ \t]*ADVISOR_REQUEST(?:\s+(?:now|next))?\s*:\s*(.+)$/gim,
  )) {
    out.push(match[1].trim());
  }
  for (const match of text.matchAll(
    /\badvisor_request(?:\s+(?:now|next))?\s*:\s*([^\n\r<]+)/gi,
  )) {
    out.push(match[1].trim());
  }
  if (/\brequest(?:ing)?\s+(?:advisor\s+)?contract\s+extraction\b/i.test(text)) {
    out.push('contract extraction before source edit');
  }
  if (
    /\brequest(?:ing)?\s+(?:advisor\s+)?(?:mid[-\s]?run\s+)?risk\s+review\b/i.test(
      text,
    )
  ) {
    out.push('mid-run risk review after edits or failed tests');
  }
  if (/\brequest(?:ing)?\s+(?:advisor\s+)?final\s+diff\s+audit\b/i.test(text)) {
    out.push('final diff audit before completion');
  }
  return out;
}

function uniqueKnownFdCheckpointReasons(reasons) {
  const requiredByKey = new Map(
    STRICT_FD_CHECKPOINT_REASONS.map((reason) => [
      normalizeFdCheckpointReason(reason),
      reason,
    ]),
  );
  const out = [];
  const seen = new Set();
  for (const reason of reasons) {
    const canonical = requiredByKey.get(normalizeFdCheckpointReason(reason));
    if (!canonical || seen.has(canonical)) {
      continue;
    }
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

function isSourceMutationRequestText(requestText) {
  return (
    /\b(?:write_file|replace|edit|modify|patch)\b/i.test(requestText) &&
    /\.(?:go|ts|tsx|js|jsx|py|rs|java|c|cc|cpp|h|hpp|cs|rb|php|swift|kt|kts)\b|(?:^|[\\/])(?:src|lib|packages|internal|cmd|experimental)[\\/]/i.test(
      requestText,
    )
  );
}

function isExecutionRequestText(requestText) {
  return (
    isSourceMutationRequestText(requestText) ||
    /\b(?:run_shell_command|shell_command)\b/i.test(requestText)
  );
}

export function analyzeApprovalModeContamination(text) {
  const value = String(text ?? '');
  let hasStructuredEvents = false;
  let planModeActive = false;
  let enterCount = 0;
  let exitCount = 0;
  let lastEnterLine = 0;
  let lastExitLine = 0;
  let sourceMutationAttemptedInPlanMode = false;
  let sourceMutationAfterLatestExit = false;
  let executionAfterLatestExit = false;
  let lineNumber = 0;

  for (const rawLine of value.split(/\r?\n/g)) {
    lineNumber += 1;
    if (!rawLine.trim()) {
      continue;
    }
    let event;
    try {
      event = JSON.parse(rawLine);
    } catch {
      continue;
    }
    hasStructuredEvents = true;
    if (event?.type !== 'tool_call_request') {
      continue;
    }
    const payload = event.payload ?? {};
    const toolName = String(payload.name ?? '');
    const requestText = [
      toolName,
      payload.args ? JSON.stringify(payload.args) : '',
    ].join('\n');
    if (toolName === 'enter_plan_mode') {
      planModeActive = true;
      enterCount += 1;
      lastEnterLine = lineNumber;
      sourceMutationAfterLatestExit = false;
      executionAfterLatestExit = false;
      continue;
    }
    if (toolName === 'exit_plan_mode') {
      planModeActive = false;
      exitCount += 1;
      lastExitLine = lineNumber;
      sourceMutationAfterLatestExit = false;
      executionAfterLatestExit = false;
      continue;
    }
    if (planModeActive && isSourceMutationRequestText(requestText)) {
      sourceMutationAttemptedInPlanMode = true;
    }
    if (!planModeActive && lastExitLine > lastEnterLine) {
      if (isSourceMutationRequestText(requestText)) {
        sourceMutationAfterLatestExit = true;
      }
      if (isExecutionRequestText(requestText)) {
        executionAfterLatestExit = true;
      }
    }
  }

  const textualPlanMode = (
    /Active Approval Mode:\s*Plan/i.test(value) ||
    /You are operating in \*\*Plan Mode\*\*/i.test(value) ||
    /ONLY FOR PLANS/i.test(value) ||
    /Tool execution denied by policy\.[^\n\r]*You are in Plan Mode/i.test(
      value,
    ) ||
    (/implementation plan/i.test(value) &&
      /\.gemini[\\/]+tmp[\\/].*?[\\/]+plans[\\/]/i.test(value))
  );
  const textualWriteDenied =
    /Tool execution denied by policy\.[^\n\r]*You are in Plan Mode/i.test(
      value,
    );

  if (!hasStructuredEvents) {
    return {
      approval_mode_observed: textualPlanMode,
      approval_mode_recovered: false,
      approval_mode_active_at_end: textualPlanMode,
      approval_mode_enter_count: 0,
      approval_mode_exit_count: 0,
      approval_mode_source_write_attempted: textualWriteDenied,
      approval_mode_source_mutation_after_exit: false,
      approval_mode_execution_after_exit: false,
      approval_mode_contamination: textualPlanMode,
    };
  }

  const approvalModeObserved = enterCount > 0 || textualPlanMode;
  const activeAtEnd =
    enterCount > 0 && (planModeActive || lastEnterLine > lastExitLine);
  const recovered = enterCount > 0 && !activeAtEnd && exitCount > 0;
  return {
    approval_mode_observed: approvalModeObserved,
    approval_mode_recovered: recovered,
    approval_mode_active_at_end: activeAtEnd,
    approval_mode_enter_count: enterCount,
    approval_mode_exit_count: exitCount,
    approval_mode_source_write_attempted:
      sourceMutationAttemptedInPlanMode || textualWriteDenied,
    approval_mode_source_mutation_after_exit: sourceMutationAfterLatestExit,
    approval_mode_execution_after_exit: executionAfterLatestExit,
    approval_mode_contamination: activeAtEnd,
  };
}

export function detectApprovalModeContamination(text) {
  return analyzeApprovalModeContamination(text).approval_mode_contamination;
}

export function auditStrictFdCheckpointTrace(traceText) {
  const requested = [];
  const primaryAttempted = [];
  const consulted = [];
  const consultedGood = [];
  const failed = [];
  const budgetBlocked = [];
  const pendingDecisionReasons = [];
  const approvalModeAnalysis = analyzeApprovalModeContamination(traceText);
  const approvalModeContamination =
    approvalModeAnalysis.approval_mode_contamination;
  let finalAuditConsultedGoodSeen = false;
  let finalAuditConsultedGoodCount = 0;
  let finalAuditMutationCount = undefined;
  let finalVerificationObserved = false;
  let finalVerificationCommand = undefined;
  let finalVerificationObservedAtMutationCount = undefined;
  let offDomainGuidance = false;
  let finalVerificationMissingEvents = 0;
  let sourceMutationCount = 0;
  let postFinalAuditMutationCount = 0;
  const canonicalReason = (reason) =>
    uniqueKnownFdCheckpointReasons([reason])[0];
  const addReason = (list, reason) => {
    const canonical = canonicalReason(reason);
    if (canonical && !list.includes(canonical)) {
      list.push(canonical);
    }
    return canonical;
  };
  const addFailure = (reason, details = {}) => {
    const canonical = canonicalReason(reason);
    if (!canonical) {
      return;
    }
    failed.push({
      reason: canonical,
      ...details,
    });
  };
  const addBudgetBlocked = (reason, details = {}) => {
    const canonical = canonicalReason(reason);
    if (!canonical) {
      return;
    }
    budgetBlocked.push({
      reason: canonical,
      ...details,
    });
  };
  const noteFinalAuditConsultedGood = () => {
    finalAuditConsultedGoodSeen = true;
    finalAuditConsultedGoodCount += 1;
    finalAuditMutationCount = sourceMutationCount;
  };

  for (const rawLine of String(traceText ?? '').split(/\r?\n/g)) {
    if (!rawLine.trim()) {
      continue;
    }
    let event;
    try {
      event = JSON.parse(rawLine);
    } catch {
      continue;
    }
    const payload = event?.payload ?? {};
    const textFragments = [payload.text];
    if (payload.args && typeof payload.args === 'object') {
      for (const key of ['description', 'command', 'instruction']) {
        if (typeof payload.args[key] === 'string') {
          textFragments.push(payload.args[key]);
        }
      }
    }
    for (const reason of checkpointReasonsFromText(textFragments.join('\n'))) {
      addReason(requested, reason);
    }

    if (event?.type === 'checkpoint_state') {
      const reason = addReason(requested, payload.reason);
      if (!reason) {
        continue;
      }
      if (payload.attemptKind === 'primary') {
        addReason(primaryAttempted, reason);
      }
      if (payload.status === 'consulted_good') {
        addReason(consulted, reason);
        addReason(consultedGood, reason);
        if (reason === 'final diff audit before completion') {
          noteFinalAuditConsultedGood();
        }
      } else if (
        payload.status === 'final_verification_observed' &&
        reason === 'final diff audit before completion'
      ) {
        finalVerificationObserved = true;
        if (typeof payload.command === 'string') {
          finalVerificationCommand = payload.command;
        }
        if (Number.isFinite(payload.mutationCount)) {
          finalVerificationObservedAtMutationCount = payload.mutationCount;
        } else {
          finalVerificationObservedAtMutationCount = sourceMutationCount;
        }
      } else if (
        payload.status === 'final_verification_missing' &&
        reason === 'final diff audit before completion'
      ) {
        finalVerificationMissingEvents += 1;
      } else if (
        payload.status === 'consulted_weak' ||
        payload.status === 'failed' ||
        payload.status === 'repair_skipped_reserved_checkpoint_slot' ||
        payload.status === 'fallback_skipped_reserved_checkpoint_slot'
      ) {
        addFailure(reason, {
          status: payload.status,
          outcome: payload.outcome,
          attempt_kind: payload.attemptKind,
          finish_reason: payload.finishReason,
          parser_outcome: payload.parserOutcome,
          truncated: payload.truncated,
          failure_kind: payload.failureKind,
        });
        if (payload.failureKind === 'off_domain_guidance') {
          offDomainGuidance = true;
        }
      } else if (payload.status === 'budget_blocked') {
        addBudgetBlocked(reason, {
          status: payload.status,
          outcome: 'budget_exhausted',
        });
      }
    }

    if (
      event?.type === 'observer_decision' &&
      payload.reasonCode === 'pollux.escalation.executor_advisor_request'
    ) {
      for (const attribution of payload.contributingSignalAttributions ?? []) {
        const reason = checkpointReasonFromAttribution(attribution);
        if (reason) {
          addReason(requested, reason);
          pendingDecisionReasons.push(reason);
        }
      }
    }
    if (
      event?.type === 'advisor_attempt' &&
      payload.reasonCode === 'pollux.escalation.executor_advisor_request'
    ) {
      const reason = payload.checkpointReason ?? pendingDecisionReasons.shift();
      if (reason) {
        addReason(requested, reason);
        if (payload.attemptKind === 'primary') {
          addReason(primaryAttempted, reason);
        }
        if (payload.outcome === 'consulted') {
          addReason(consulted, reason);
          if (payload.checkpointConsultedGood === true) {
            addReason(consultedGood, reason);
            if (reason === 'final diff audit before completion') {
              noteFinalAuditConsultedGood();
            }
          } else {
            const failureKind =
              payload.strictCheckpointFailureKind ?? 'weak_guidance';
            addFailure(reason, {
              outcome: payload.outcome,
              attempt_kind: payload.attemptKind,
              finish_reason: payload.outputFinishReason,
              parser_outcome: payload.parserOutcome,
              truncated: payload.truncated,
              failure_kind: failureKind,
            });
            if (failureKind === 'off_domain_guidance') {
              offDomainGuidance = true;
            }
          }
        } else {
          const failureKind =
            payload.strictCheckpointFailureKind ?? payload.failureKind;
          addFailure(reason, {
            outcome: payload.outcome,
            attempt_kind: payload.attemptKind,
            finish_reason: payload.outputFinishReason,
            parser_outcome: payload.parserOutcome,
            truncated: payload.truncated,
            failure_kind: failureKind,
          });
          if (failureKind === 'off_domain_guidance') {
            offDomainGuidance = true;
          }
        }
      }
    }

    if (event?.type === 'tool_call_request') {
      const commandText = textFragments.join('\n');
      const requestText = [
        payload.name,
        commandText,
        payload.args ? JSON.stringify(payload.args) : '',
      ].join('\n');
      const sourceMutation = isSourceMutationRequestText(requestText);
      if (sourceMutation) {
        sourceMutationCount += 1;
        if (finalAuditConsultedGoodSeen) {
          postFinalAuditMutationCount += 1;
        }
      }
      if (
        finalAuditConsultedGoodSeen &&
        STRICT_FD_FINAL_VERIFICATION_COMMAND_RE.test(commandText)
      ) {
        finalVerificationObserved = true;
        finalVerificationCommand = commandText;
        finalVerificationObservedAtMutationCount = sourceMutationCount;
      }
    }
  }

  const canonicalRequested = uniqueKnownFdCheckpointReasons(requested);
  const canonicalPrimaryAttempted =
    uniqueKnownFdCheckpointReasons(primaryAttempted);
  const canonicalConsulted = uniqueKnownFdCheckpointReasons(consulted);
  const canonicalConsultedGood = uniqueKnownFdCheckpointReasons(consultedGood);
  const consultedGoodSet = new Set(canonicalConsultedGood);
  const requestedSet = new Set(canonicalRequested);
  const observedSet = new Set([
    ...canonicalRequested,
    ...canonicalPrimaryAttempted,
    ...canonicalConsulted,
    ...canonicalConsultedGood,
    ...failed.map((entry) => entry.reason),
    ...budgetBlocked.map((entry) => entry.reason),
  ]);
  const requiredReasons = STRICT_FD_REQUIRED_CHECKPOINT_REASONS;
  const missing = requiredReasons.filter(
    (reason) => !observedSet.has(reason),
  );
  const requestedButNotConsulted = requiredReasons.filter(
    (reason) => requestedSet.has(reason) && !consultedGoodSet.has(reason),
  );
  const hasAllRequiredConsultedGood = requiredReasons.every(
    (reason) => consultedGoodSet.has(reason),
  );
  const finalVerificationAfterLatestMutation =
    finalVerificationObserved &&
    finalVerificationObservedAtMutationCount !== undefined &&
    finalVerificationObservedAtMutationCount >= sourceMutationCount;
  const finalVerificationMissing =
    hasAllRequiredConsultedGood && !finalVerificationAfterLatestMutation;
  if (
    requiredReasons.every((reason) => consultedGoodSet.has(reason)) &&
    finalVerificationMissing
  ) {
    addFailure('final diff audit before completion', {
      status: 'final_verification_missing',
      failure_kind: 'final_verification_missing',
      observed_events: finalVerificationMissingEvents,
    });
  }
  const diagnosticReason = approvalModeContamination
    ? 'approval_mode_contamination'
    : offDomainGuidance
    ? 'off_domain_guidance'
    : finalVerificationMissing
      ? 'final_verification_missing'
      : missing.length > 0 || requestedButNotConsulted.length > 0
        ? 'fd_checkpoint_incomplete'
        : undefined;
  const complete =
    hasAllRequiredConsultedGood &&
    !approvalModeContamination &&
    !offDomainGuidance &&
    finalVerificationAfterLatestMutation &&
    diagnosticReason === undefined;

  return {
    required: requiredReasons,
    recognized: STRICT_FD_CHECKPOINT_REASONS,
    requested: canonicalRequested,
    primary_attempted: canonicalPrimaryAttempted,
    consulted: canonicalConsulted,
    consulted_good: canonicalConsultedGood,
    failed,
    budget_blocked: budgetBlocked,
    requested_but_not_consulted: requestedButNotConsulted,
    missing,
    final_verification_observed: finalVerificationObserved,
    final_verification_command: finalVerificationCommand,
    off_domain_guidance: offDomainGuidance,
    final_verification_missing: finalVerificationMissing,
    approval_mode_contamination: approvalModeContamination,
    approval_mode_observed: approvalModeAnalysis.approval_mode_observed,
    approval_mode_recovered: approvalModeAnalysis.approval_mode_recovered,
    approval_mode_active_at_end: approvalModeAnalysis.approval_mode_active_at_end,
    approval_mode_enter_count: approvalModeAnalysis.approval_mode_enter_count,
    approval_mode_exit_count: approvalModeAnalysis.approval_mode_exit_count,
    approval_mode_source_write_attempted:
      approvalModeAnalysis.approval_mode_source_write_attempted,
    approval_mode_execution_after_exit:
      approvalModeAnalysis.approval_mode_execution_after_exit,
    final_audit_repeated_count: Math.max(0, finalAuditConsultedGoodCount - 1),
    post_final_audit_mutation_count: postFinalAuditMutationCount,
    final_verification_after_latest_mutation:
      finalVerificationAfterLatestMutation,
    diagnostic_reason: diagnosticReason,
    complete,
  };
}

export function buildDeepSwePrompt(task, options = {}) {
  const conditionId = options.condition?.id ?? options.conditionId;
  const checklist = options.contractChecklist;
  const fdLines =
    conditionId === 'FD'
      ? [
          '',
          'Pollux Flash-plus-advisor execution notes:',
          '- FD means Flash-plus-advisor in this benchmark, not file descriptors.',
          '- Work normally: inspect, edit, and verify the repository directly. Do not create implementation-plan files or enter Plan Mode.',
          '- Hidden advisor checks may provide guidance automatically; apply any guidance you receive without mentioning Pollux in the final answer.',
          '- For Go tasks: before final completion, run `gofmt` on modified Go files and a focused `go test` for the touched package unless impossible; if impossible, explain the blocker.',
          '- For JavaScript/TypeScript tasks: before final completion, run a focused project check such as `npm test`, `npx jest`, `npx tsc --noEmit`, `npm run build`, or the repository equivalent unless impossible; if impossible, explain the blocker.',
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
    const dependencyOffline = params.dependencyOffline !== false;
    args.push(
      '-v',
      `${params.dependencyCacheDir}:/dependency-cache`,
      '-e',
      'npm_config_cache=/dependency-cache/npm',
      '-e',
      'npm_config_prefer_offline=true',
      '-e',
      'YARN_CACHE_FOLDER=/dependency-cache/yarn',
      '-e',
      'PNPM_HOME=/dependency-cache/pnpm-home',
    );
    if (dependencyOffline) {
      args.push('-e', 'npm_config_offline=true');
    }
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

export function buildProjectDependencyInstallDockerArgs(params) {
  if (!params.dockerImage) {
    throw new Error(
      'DeepSWE task.toml did not specify environment.docker_image.',
    );
  }
  const dependencyOffline = params.dependencyOffline === true;
  const npmPreferMode = dependencyOffline ? '--prefer-offline' : '--prefer-online';
  const pnpmPreferMode = dependencyOffline ? '--offline' : '';
  const pnpmAllowEsbuildScript =
    'node -e "const fs=require(\'fs\'); const p=\'pnpm-workspace.yaml\'; let s=fs.existsSync(p)?fs.readFileSync(p,\'utf8\'):\'\'; if (/esbuild:\\s*(set this to true or false|false)/.test(s)) { s=s.replace(/esbuild:\\s*(set this to true or false|false)/g, \'esbuild: true\'); } else if (!/^\\s*esbuild:/m.test(s)) { if (/^allowBuilds:\\s*$/m.test(s)) { s=s.replace(/^allowBuilds:\\s*$/m, \'allowBuilds:\\n  esbuild: true\'); } else { s=s.trimEnd()+(s.trim()?\'\\\\n\':\'\')+\'allowBuilds:\\n  esbuild: true\\n\'; } } fs.writeFileSync(p,s);"';
  const installCommand = [
    'set -e',
    'export NODE_ENV=development',
    'export npm_config_production=false',
    'export npm_config_omit=',
    'export YARN_PRODUCTION=false',
    'mkdir -p /dependency-cache/npm /dependency-cache/yarn /dependency-cache/pnpm-home /dependency-cache/pnpm-store /dependency-cache/corepack',
    'if [ -d node_modules ]; then',
    '  echo "[pollux] node_modules already present; skipping verifier dependency install"',
    '  exit 0',
    'fi',
    'if [ -f pnpm-lock.yaml ]; then',
    '  export PATH="/dependency-cache/pnpm-home:$PATH"',
    '  corepack enable >/dev/null 2>&1 || true',
    '  if ! command -v pnpm >/dev/null 2>&1; then npm install -g pnpm --no-audit --progress=false; fi',
    '  pnpm config set store-dir /dependency-cache/pnpm-store >/dev/null 2>&1 || true',
    `  ${pnpmAllowEsbuildScript}`,
    `  pnpm install --frozen-lockfile ${pnpmPreferMode}`.trimEnd() +
      ` || pnpm install --no-frozen-lockfile ${pnpmPreferMode}`.trimEnd(),
    'elif [ -f yarn.lock ]; then',
    '  corepack enable >/dev/null 2>&1 || true',
    `  yarn install --frozen-lockfile --production=false ${dependencyOffline ? '--offline' : ''}`,
    'elif [ -f package-lock.json ]; then',
    `  npm ci ${npmPreferMode} --include=dev --no-audit --progress=false`,
    'elif [ -f package.json ]; then',
    `  npm install ${npmPreferMode} --include=dev --no-audit --progress=false`,
    'else',
    '  true',
    'fi',
  ].join('\n');
  const args = [
    'run',
    '--rm',
    '--network',
    params.network ?? 'none',
    '--workdir',
    '/app',
    '-v',
    `${params.workDir}:/app`,
  ];
  if (params.dependencyCacheDir) {
    args.push(
      '-v',
      `${params.dependencyCacheDir}:/dependency-cache`,
      '-e',
      'npm_config_cache=/dependency-cache/npm',
      '-e',
      'npm_config_prefer_offline=true',
      '-e',
      'YARN_CACHE_FOLDER=/dependency-cache/yarn',
      '-e',
      'PNPM_HOME=/dependency-cache/pnpm-home',
      '-e',
      'COREPACK_HOME=/dependency-cache/corepack',
    );
    if (dependencyOffline) {
      args.push('-e', 'npm_config_offline=true');
    }
  }
  args.push(params.dockerImage, 'bash', '-lc', installCommand);
  return args;
}

export function finalVerifierNetworkPolicy(args = {}) {
  const networkedDependencyInstall =
    args.networkedVerifierPreflight === true;
  return {
    dependencyOffline: !networkedDependencyInstall,
    dependencyInstallNetwork: networkedDependencyInstall ? 'bridge' : 'none',
    verifierNetwork: 'none',
  };
}

export function inferDependencyPreflight(testScriptText, options = {}) {
  const language = options.language?.toLowerCase?.() ?? '';
  const text = `${testScriptText}\n${options.testPatchText ?? ''}`.toLowerCase();
  const extraNpmPackages = inferExtraNpmWarmupPackages({
    taskId: options.taskId,
    repository: options.repository,
    text,
  });
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
    const extraWarmup =
      extraNpmPackages.length > 0
        ? ` && npm install --prefer-online --no-audit --progress=false --no-save ${extraNpmPackages.join(' ')}`
        : '';
    return {
      kind: 'npm',
      required: true,
      command: pkg
        ? `npm --version && npm view ${pkg} version --prefer-online`
        : 'npm --version && npm ping',
      warmupCommand: pkg
        ? `npm --version && npm exec --yes --package ${pkg} ${pkg} -- --version${extraWarmup}`
        : `npm --version && npm ping${extraWarmup}`,
      extraWarmupPackages: extraNpmPackages,
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

function inferExtraNpmWarmupPackages(params) {
  const taskId = params.taskId ?? '';
  const repository = params.repository ?? '';
  const text = params.text ?? '';
  const packages = [];
  const add = (pkg) => {
    if (!packages.includes(pkg)) {
      packages.push(pkg);
    }
  };
  if (
    taskId === 'ts-pattern-match-each' ||
    /gvergnaud\/ts-pattern/i.test(repository) ||
    /@unrs\/resolver-binding/i.test(text)
  ) {
    add('@unrs/resolver-binding-linux-x64-gnu@1.11.1');
  }
  if (
    taskId === 'true-myth-iterable-collection-combinators' ||
    /true-myth\/true-myth/i.test(repository) ||
    /@rollup\/rollup-linux-x64-gnu/i.test(text)
  ) {
    // Rollup's platform-native optional package is installed reliably by the
    // project-level pnpm/npm install inside the verifier container. Installing
    // the native package standalone has hit npm resolver bugs, so do not add it
    // to the generic package warmup command.
  }
  return packages;
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
    /Cannot find module ['"]?@rollup\/rollup-[\w-]+/i,
    /Cannot find module ['"]?@unrs\/resolver-binding-[\w-]+/i,
    /npm has a bug related to optional dependencies/i,
    /Preset ts-jest not found relative to rootDir/i,
  ];
  return dependencyFailurePatterns.some((pattern) =>
    pattern.test(text),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePatchFile(file) {
  return String(file ?? '').replace(/\\/g, '/').replace(/^\.?\//, '');
}

function outputReferencesPatchedFile(outputText, patchStats) {
  const files = Array.isArray(patchStats?.files) ? patchStats.files : [];
  const normalizedOutput = String(outputText ?? '').replace(/\\/g, '/');
  return files.some((file) => {
    const normalized = normalizePatchFile(file);
    if (!normalized) {
      return false;
    }
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_./-])${escapeRegExp(normalized)}(?=$|[:\\s"'\\)\\]])`,
      'i',
    );
    return pattern.test(normalizedOutput);
  });
}

function verifierOutputLooksLikeBuildFailure(outputText) {
  return /\b(build failed|failed to compile|compilation failed|compile error|syntax\s*error|SyntaxError|undefined:|imported and not used|cannot find name|TS\d{4}|error\[E\d+\])\b/i.test(
    outputText,
  );
}

export function classifyVerifierBaselineFailure(params) {
  const outputText = `${params.stdout ?? ''}\n${params.stderr ?? ''}`;
  if (!outputReferencesPatchedFile(outputText, params.patchStats)) {
    return {
      verifier_failure_kind: 'baseline_failure',
      verifier_model_failure: false,
      verifier_invalidation_reason: 'verifier_infra_failure',
    };
  }
  return {
    verifier_failure_kind: verifierOutputLooksLikeBuildFailure(outputText)
      ? 'model_build_failure'
      : 'baseline_model_failure',
    verifier_model_failure: true,
    verifier_invalidation_reason: null,
  };
}

export function classifyVerifierBaselinePreflight(params) {
  const outputText = `${params.stdout ?? ''}\n${params.stderr ?? ''}`;
  const phaseExitCodes = parseVerifierPhaseExitCodes(outputText);
  const dependencyFailure =
    params.dependencyPreflightFailed === true ||
    isVerifierDependencyFailure(outputText);
  const testPatchApplied =
    /Applying test\.patch\b/i.test(outputText) &&
    !/test\.patch failed to apply/i.test(outputText);
  const verifierCompleted =
    params.exitCode === 0 &&
    /===== grade =====/i.test(outputText) &&
    /reward\.json=/i.test(outputText);
  const repositoryFailure =
    /fatal:\s+not a git repository|test\.patch failed to apply/i.test(
      outputText,
    );
  // DeepSWE v1.1 task verifiers do not uniformly emit the legacy
  // "Baseline exit code" / "New tests exit code" markers. A pristine
  // no-solution preflight can legitimately build-fail the new tests and still
  // be a valid infrastructure smoke test when the verifier applies the test
  // patch, grades, and emits reward.json successfully.
  if (
    !dependencyFailure &&
    testPatchApplied &&
    verifierCompleted &&
    !repositoryFailure
  ) {
    return {
      ok: true,
      required: true,
      exitCode: params.exitCode ?? null,
      verifier_baseline_exit_code: phaseExitCodes.baseline,
      verifier_new_tests_exit_code: phaseExitCodes.newTests,
      dependency_failure: false,
      test_patch_applied: true,
      verifier_completed: true,
      failure_kind: null,
    };
  }
  const baselineMissing = phaseExitCodes.baseline === null;
  const baselineFailed =
    phaseExitCodes.baseline !== null && phaseExitCodes.baseline !== 0;
  const infraExit =
    params.exitCode !== 0 && baselineMissing && phaseExitCodes.newTests === null;
  const ok = !dependencyFailure && !baselineMissing && !baselineFailed && !infraExit;
  return {
    ok,
    required: true,
    exitCode: params.exitCode ?? null,
    verifier_baseline_exit_code: phaseExitCodes.baseline,
    verifier_new_tests_exit_code: phaseExitCodes.newTests,
    dependency_failure: dependencyFailure,
    test_patch_applied: testPatchApplied,
    verifier_completed: verifierCompleted,
    failure_kind: ok
      ? null
      : dependencyFailure
        ? 'dependency_failure'
        : baselineFailed
          ? 'baseline_failure'
          : baselineMissing
            ? 'baseline_not_observed'
            : 'infra_failure',
  };
}

function resolveWellKnownAdcPath(env = process.env) {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  if (env.APPDATA) {
    return path.join(
      env.APPDATA,
      'gcloud',
      'application_default_credentials.json',
    );
  }
  const home = env.HOME || env.USERPROFILE || '';
  if (!home) {
    return null;
  }
  return path.join(
    home,
    '.config',
    'gcloud',
    'application_default_credentials.json',
  );
}

/**
 * Non-interactive auth preflight for Pollux runners.
 * Vertex AI (current default) needs project + location and ADC or a Vertex API key.
 * Legacy Gemini API key / OAuth seed files remain accepted for local debugging.
 */
export function inspectNonInteractiveAuthReadiness(env = process.env, homeDir) {
  const sourceGeminiDir =
    env.GEMINI_CLI_HOME ??
    path.join(env.USERPROFILE ?? env.HOME ?? '', '.gemini');
  const hasGeminiApiKey = Boolean(env.GEMINI_API_KEY);
  const hasGoogleApiKey = Boolean(env.GOOGLE_API_KEY);
  const hasApiKey = hasGeminiApiKey || hasGoogleApiKey;
  const adcPath = resolveWellKnownAdcPath(env);
  const hasAdcEnv = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);
  const hasAdcFile = Boolean(adcPath) && fs.existsSync(adcPath);
  const hasAdc = hasAdcEnv || hasAdcFile;
  const hasOauthCreds =
    Boolean(sourceGeminiDir) &&
    fs.existsSync(path.join(sourceGeminiDir, 'oauth_creds.json'));
  const hasGoogleAccounts =
    Boolean(sourceGeminiDir) &&
    fs.existsSync(path.join(sourceGeminiDir, 'google_accounts.json'));
  const cloudProject =
    env.GOOGLE_CLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT_ID || '';
  const cloudLocation = env.GOOGLE_CLOUD_LOCATION || '';
  const hasVertexProjectLocation = Boolean(cloudProject && cloudLocation);
  const vertexReady =
    hasVertexProjectLocation && (hasAdc || hasGoogleApiKey);
  const legacyReady = hasGeminiApiKey || hasOauthCreds || hasGoogleAccounts;
  const ok = vertexReady || legacyReady;
  let failure_kind = null;
  if (!ok) {
    if (hasVertexProjectLocation && !hasAdc && !hasGoogleApiKey) {
      failure_kind = 'noninteractive_vertex_adc_missing';
    } else if (!hasVertexProjectLocation && (hasAdc || hasGoogleApiKey)) {
      failure_kind = 'noninteractive_vertex_project_location_missing';
    } else {
      failure_kind = 'noninteractive_auth_missing';
    }
  }
  return {
    ok,
    authMode: vertexReady ? 'vertex-ai' : legacyReady ? 'legacy' : null,
    sourceGeminiDir,
    checkedHomeDir: homeDir ?? null,
    hasApiKey,
    hasGeminiApiKey,
    hasGoogleApiKey,
    hasAdc,
    hasAdcEnv,
    hasAdcFile,
    adcPath: adcPath || null,
    hasOauthCreds,
    hasGoogleAccounts,
    hasVertexProjectLocation,
    googleCloudProject: cloudProject || null,
    googleCloudLocation: cloudLocation || null,
    failure_kind,
  };
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
    const baselineFailure = baselineFailed
      ? classifyVerifierBaselineFailure({
          stdout: params.stdout,
          stderr: params.stderr,
          patchStats: params.patchStats,
        })
      : null;
    const verifierFailureKind = dependencyFailure
      ? 'dependency_failure'
      : baselineFailed
        ? baselineFailure.verifier_failure_kind
        : 'infra_failure';
    const verifierInvalidationReason = dependencyFailure
      ? 'verifier_infra_failure'
      : baselineFailed
        ? baselineFailure.verifier_invalidation_reason
        : 'verifier_infra_failure';
    return {
      verifier_skipped: false,
      verifier_reward: null,
      score_bucket:
        verifierInvalidationReason === null
          ? 'unresolved'
          : params.scorePolicy === 'diagnostic'
            ? 'unresolved'
            : 'invalid',
      resolved: false,
      verifier_baseline_exit_code: phaseExitCodes.baseline,
      verifier_new_tests_exit_code: phaseExitCodes.newTests,
      verifier_failure_kind: verifierFailureKind,
      verifier_dependency_failure: dependencyFailure,
      verifier_model_failure:
        !dependencyFailure && baselineFailed
          ? baselineFailure.verifier_model_failure
          : false,
      ...(verifierInvalidationReason
        ? { verifier_invalidation_reason: verifierInvalidationReason }
        : {}),
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
