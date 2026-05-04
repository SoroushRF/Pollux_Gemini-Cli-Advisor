/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzePatch,
  buildEntrypointMetadata,
  buildSweBenchmarkSettings,
  classifyRunResult,
  parseRunnerArgs,
  resolveCliEntrypoint,
  summarizeRecords,
} from './pollux-swebench-runner-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const benchmarkRoot = path.join(
  repoRoot,
  'evaluation_results',
  'pollux-swe-lite-15',
);
const selectedInstancesPath = path.join(
  benchmarkRoot,
  'selected-instances.json',
);
const authSeedFiles = [
  'oauth_creds.json',
  'google_accounts.json',
  'projects.json',
  'state.json',
  'installation_id',
];

const detectorSettings = {
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

const conditions = {
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
      ...detectorSettings,
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveRunnerInputPath(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(repoRoot, inputPath);
}

function execFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({ code, stdout, stderr });
      } else {
        const error = new Error(
          `${command} ${args.join(' ')} failed with code ${code}\n${stderr}`,
        );
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

function runGemini(args, options) {
  return new Promise((resolve) => {
    let child;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    try {
      child = spawn(
        options.entrypoint.command,
        [...options.entrypoint.initialArgs, ...args],
        {
          cwd: options.cwd,
          env: buildCleanGeminiEnv(options.homeDir),
          shell: options.entrypoint.shell === true,
          windowsHide: true,
        },
      );
    } catch (error) {
      resolve({
        code: null,
        stdout,
        stderr: `${stderr}\n${error instanceof Error ? error.stack : String(error)}`,
        timedOut,
      });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
    }, options.timeoutMs);
    const responseLimitTimer =
      Number.isFinite(options.maxApiResponses) && options.maxApiResponses >= 0
        ? setInterval(() => {
            if (
              options.telemetryPath &&
              fs.existsSync(options.telemetryPath) &&
              summarizeTelemetry(options.telemetryPath).apiResponses >=
                options.maxApiResponses
            ) {
              timedOut = true;
              child.kill('SIGTERM');
              setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
            }
          }, 2_000)
        : undefined;
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (responseLimitTimer) {
        clearInterval(responseLimitTimer);
      }
      resolve({ code, stdout, stderr, timedOut });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (responseLimitTimer) {
        clearInterval(responseLimitTimer);
      }
      resolve({ code: null, stdout, stderr: `${stderr}\n${error}`, timedOut });
    });
  });
}

function buildCleanGeminiEnv(homeDir) {
  const cleanEnv = { ...process.env };
  for (const key of Object.keys(cleanEnv)) {
    if (
      (key.startsWith('GEMINI_') || key.startsWith('GOOGLE_GEMINI_')) &&
      key !== 'GEMINI_API_KEY' &&
      key !== 'GOOGLE_API_KEY' &&
      key !== 'GEMINI_DEBUG'
    ) {
      delete cleanEnv[key];
    }
  }
  cleanEnv.CI = '1';
  cleanEnv.NO_COLOR = '1';
  cleanEnv.GEMINI_CLI_HOME = homeDir;
  cleanEnv.GEMINI_PTY_INFO = 'child_process';
  return cleanEnv;
}

async function ensureBareRepo(instance) {
  const repoKey = instance.repo.replace(/[\\/]/g, '__');
  const bareDir = path.join(benchmarkRoot, 'repos-full', `${repoKey}.git`);
  if (!fs.existsSync(bareDir)) {
    ensureDir(path.dirname(bareDir));
    await execFile('git', [
      'clone',
      '--bare',
      `https://github.com/${instance.repo}.git`,
      bareDir,
    ]);
  }
  await execFile('git', ['fetch', 'origin', instance.base_commit], {
    cwd: bareDir,
    allowFailure: true,
  });
  return bareDir;
}

async function createWorktree(instance, conditionId, runDir) {
  const bareDir = await ensureBareRepo(instance);
  const workDir = path.join(
    runDir,
    'workspaces',
    conditionId,
    instance.instance_id,
  );
  if (fs.existsSync(workDir)) {
    throw new Error(`Workspace already exists: ${workDir}`);
  }
  ensureDir(path.dirname(workDir));
  await execFile('git', [
    '-c',
    'core.autocrlf=false',
    'clone',
    '--no-checkout',
    bareDir,
    workDir,
  ]);
  await execFile(
    'git',
    ['-c', 'core.autocrlf=false', 'checkout', instance.base_commit],
    {
      cwd: workDir,
    },
  );
  await execFile('git', ['config', 'core.autocrlf', 'false'], { cwd: workDir });
  await assertUsableCheckout(workDir);
  return workDir;
}

async function assertUsableCheckout(workDir) {
  const status = await execFile('git', ['status', '--porcelain'], {
    cwd: workDir,
  });
  const badLines = status.stdout
    .split(/\r?\n/g)
    .filter((line) => line.startsWith('D ') || line.startsWith(' D'));
  if (badLines.length > 0) {
    throw new Error(
      `Checkout has deleted tracked files before model run: ${badLines
        .slice(0, 5)
        .join(', ')}`,
    );
  }
  const files = await execFile('git', ['ls-files'], { cwd: workDir });
  if (files.stdout.trim().length === 0) {
    throw new Error(`Checkout has no tracked files: ${workDir}`);
  }
}

function buildSettings(condition, telemetryPath, tracePath) {
  return buildSweBenchmarkSettings(
    condition,
    telemetryPath,
    tracePath,
    args.maxSessionTurns,
  );
}

function seedAuthFiles(homeGeminiDir) {
  const sourceGeminiDir = path.join(process.env.USERPROFILE ?? '', '.gemini');
  if (!sourceGeminiDir || !fs.existsSync(sourceGeminiDir)) {
    return;
  }
  for (const fileName of authSeedFiles) {
    const sourcePath = path.join(sourceGeminiDir, fileName);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    fs.copyFileSync(sourcePath, path.join(homeGeminiDir, fileName));
  }
}

function buildPrompt(instance) {
  return [
    'You are fixing a SWE-bench Lite issue in this repository.',
    '',
    'Goal:',
    '- Make the smallest source-code change that resolves the issue.',
    '- Preserve existing behavior outside the issue.',
    '- Do not edit tests, documentation, lockfiles, or metadata unless the issue explicitly requires it.',
    '- Do not commit changes.',
    '- You may inspect files and run focused tests if useful, but avoid broad expensive test suites.',
    '- You may create temporary reproduction or diagnostic scripts while working, but remove them before finishing unless they are production source required by the issue.',
    '- Do not finish with only a reproduction, diagnostic, or demo script; the final diff must contain the actual repair.',
    '- When done, leave the working tree with only the intended patch.',
    '',
    `Repository: ${instance.repo}`,
    `Instance: ${instance.instance_id}`,
    `Base commit: ${instance.base_commit}`,
    '',
    'Issue:',
    instance.problem_statement,
  ].join('\n');
}

function parseJsonObjects(text) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start < 0) {
      if (ch === '{') {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          objects.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // Telemetry parsing is best-effort.
        }
        start = -1;
      }
    }
  }
  return objects;
}

function summarizeTelemetry(telemetryPath) {
  if (!fs.existsSync(telemetryPath)) {
    return {
      apiResponses: 0,
      executorTokens: 0,
      advisorTokens: 0,
      totalTokens: 0,
      advisorCalls: 0,
    };
  }
  const objects = parseJsonObjects(fs.readFileSync(telemetryPath, 'utf8'));
  const summary = {
    apiResponses: 0,
    executorTokens: 0,
    advisorTokens: 0,
    totalTokens: 0,
    advisorCalls: 0,
  };
  for (const object of objects) {
    const attrs = object.attributes ?? {};
    if (
      typeof object._body === 'string' &&
      object._body.startsWith('API response from') &&
      typeof attrs.total_token_count === 'number'
    ) {
      summary.apiResponses++;
      summary.totalTokens += attrs.total_token_count;
      if (attrs.role === 'utility_advisor') {
        summary.advisorTokens += attrs.total_token_count;
        summary.advisorCalls++;
      } else {
        summary.executorTokens += attrs.total_token_count;
      }
    }
  }
  return summary;
}

async function collectPatch(workDir) {
  await execFile('git', ['add', '-N', '.'], {
    cwd: workDir,
    allowFailure: true,
  });
  const diff = await execFile(
    'git',
    ['diff', '--binary', '--', '.', ':(exclude).gemini'],
    { cwd: workDir },
  );
  return diff.stdout;
}

function readPackageVersion() {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function readGeneratedGitCommit(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return /GIT_COMMIT_INFO\s*=\s*['"]([^'"]+)['"]/.exec(content)?.[1] ?? null;
}

async function collectEntrypointMetadata(cliEntrypoint) {
  const gitHeadResult = await execFile(
    'git',
    ['rev-parse', '--short=9', 'HEAD'],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  );
  const dirtyStatusResult = await execFile('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    allowFailure: true,
  });
  const cliSourceGitCommit = readGeneratedGitCommit(
    path.join('packages', 'cli', 'src', 'generated', 'git-commit.ts'),
  );
  const cliDistGitCommit = readGeneratedGitCommit(
    path.join('packages', 'cli', 'dist', 'src', 'generated', 'git-commit.js'),
  );
  const coreSourceGitCommit = readGeneratedGitCommit(
    path.join('packages', 'core', 'src', 'generated', 'git-commit.ts'),
  );
  const coreDistGitCommit = readGeneratedGitCommit(
    path.join('packages', 'core', 'dist', 'src', 'generated', 'git-commit.js'),
  );
  const gitHead = gitHeadResult.code === 0 ? gitHeadResult.stdout.trim() : null;
  return buildEntrypointMetadata({
    entrypoint: cliEntrypoint,
    packageVersion: readPackageVersion(),
    gitHead,
    gitDirty:
      dirtyStatusResult.code === 0
        ? dirtyStatusResult.stdout.trim().length > 0
        : null,
    bundleFresh: {
      bundleExists: fs.existsSync(path.join(repoRoot, 'bundle', 'gemini.js')),
      cliSourceGitCommit,
      cliDistGitCommit,
      coreSourceGitCommit,
      coreDistGitCommit,
      sourceCommitsMatchHead:
        gitHead !== null &&
        cliSourceGitCommit === gitHead &&
        coreSourceGitCommit === gitHead,
      distCommitsMatchSource:
        cliSourceGitCommit !== null &&
        cliSourceGitCommit === cliDistGitCommit &&
        coreSourceGitCommit !== null &&
        coreSourceGitCommit === coreDistGitCommit,
    },
  });
}

async function assertFakeResponsesSupported(cliEntrypoint) {
  if (!args.fakeResponsesPath || cliEntrypoint.kind !== 'binary') {
    return;
  }
  const help = await execFile(
    cliEntrypoint.command,
    [...cliEntrypoint.initialArgs, '--help'],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  );
  const helpText = `${help.stdout}\n${help.stderr}`;
  if (!/--fake-responses\b/.test(helpText)) {
    throw new Error(
      [
        `External binary does not advertise --fake-responses: ${cliEntrypoint.path}`,
        'Refusing to run a fake-response canary through this binary because it may spend real model tokens.',
        'Use the repo bundle/dev_script for fake-response checks, or run external E trials manually without --fake-responses.',
      ].join('\n'),
    );
  }
}

async function runOne(instance, condition, runDir) {
  const rawDir = path.join(runDir, 'raw', condition.id, instance.instance_id);
  ensureDir(rawDir);
  const homeDir = path.join(rawDir, 'home');
  const homeGeminiDir = path.join(homeDir, '.gemini');
  const telemetryPath = path.join(rawDir, 'telemetry.log');
  const tracePath = path.join(rawDir, 'pollux-trace.jsonl');
  const workDir = await createWorktree(instance, condition.id, runDir);
  const geminiDir = path.join(workDir, '.gemini');
  ensureDir(geminiDir);
  ensureDir(homeGeminiDir);
  seedAuthFiles(homeGeminiDir);
  fs.writeFileSync(
    path.join(homeGeminiDir, 'settings.json'),
    `${JSON.stringify(buildSettings(condition, telemetryPath, tracePath), null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(homeGeminiDir, 'state.json'),
    `${JSON.stringify({ terminalSetupPromptShown: true }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(geminiDir, 'settings.json'),
    `${JSON.stringify(buildSettings(condition, telemetryPath, tracePath), null, 2)}\n`,
  );

  const prompt = buildPrompt(instance);
  fs.writeFileSync(path.join(rawDir, 'prompt.txt'), prompt);
  const baseRecord = {
    instance_id: instance.instance_id,
    repo: instance.repo,
    condition: condition.id,
    model_name_or_path: `pollux-${condition.id.toLowerCase()}-${condition.modelName}`,
    entrypoint_kind: entrypoint.kind,
    entrypoint_path: entrypoint.path,
    score_policy: args.scorePolicy,
    fake_responses_requested: args.fakeResponsesPath !== undefined,
  };
  if (args.prepareOnly) {
    const files = await execFile('git', ['ls-files'], { cwd: workDir });
    const status = await execFile('git', ['status', '--porcelain'], {
      cwd: workDir,
    });
    const record = {
      ...baseRecord,
      model_patch: '',
      prepared_only: true,
      tracked_files: files.stdout.trim().split(/\r?\n/g).filter(Boolean).length,
      status_lines: status.stdout.trim().split(/\r?\n/g).filter(Boolean),
      timed_out: false,
      exit_code: 0,
      patch_chars: 0,
      apiResponses: 0,
      executorTokens: 0,
      advisorTokens: 0,
      totalTokens: 0,
      advisorCalls: 0,
      valid_for_score: false,
      invalidation_reason: 'prepare_only',
      provider_failure_kind: null,
      tool_policy_failure: null,
      score_bucket: 'incomplete',
      patch_stats: analyzePatch(''),
    };
    fs.writeFileSync(
      path.join(rawDir, 'run.json'),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  }
  if (args.goldPatchMode || args.nullPatchMode) {
    const patch = args.goldPatchMode ? instance.patch : '';
    fs.writeFileSync(path.join(rawDir, 'model.patch'), patch);
    const record = {
      ...baseRecord,
      model_patch: patch,
      patch_mode: args.goldPatchMode ? 'gold' : 'null',
      timed_out: false,
      exit_code: 0,
      patch_chars: patch.length,
      apiResponses: 0,
      executorTokens: 0,
      advisorTokens: 0,
      totalTokens: 0,
      advisorCalls: 0,
      valid_for_score: true,
      invalidation_reason: null,
      provider_failure_kind: null,
      tool_policy_failure: null,
      score_bucket: 'unresolved',
      patch_stats: analyzePatch(patch),
    };
    fs.writeFileSync(
      path.join(rawDir, 'run.json'),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  }
  const geminiArgs = [
    '--approval-mode',
    'yolo',
    '--output-format',
    'text',
    '--prompt',
    prompt,
  ];
  if (args.fakeResponsesPath) {
    geminiArgs.push(
      '--fake-responses',
      resolveRunnerInputPath(args.fakeResponsesPath),
    );
  }
  const result = await runGemini(geminiArgs, {
    cwd: workDir,
    homeDir,
    entrypoint,
    timeoutMs: Number.isFinite(args.timeoutMs) ? args.timeoutMs : 900_000,
    telemetryPath,
    maxApiResponses: Number.isFinite(args.maxApiResponses)
      ? args.maxApiResponses
      : -1,
  });
  fs.writeFileSync(path.join(rawDir, 'stdout.txt'), result.stdout);
  fs.writeFileSync(path.join(rawDir, 'stderr.txt'), result.stderr);

  let patch = '';
  let patchCollectionFailed = false;
  try {
    patch = await collectPatch(workDir);
  } catch (error) {
    patchCollectionFailed = true;
    fs.writeFileSync(
      path.join(rawDir, 'patch-collection-error.txt'),
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
  }
  fs.writeFileSync(path.join(rawDir, 'model.patch'), patch);
  const telemetry = summarizeTelemetry(telemetryPath);
  const responseCeilingExceeded =
    Number.isFinite(args.maxApiResponses) &&
    args.maxApiResponses >= 0 &&
    telemetry.apiResponses > args.maxApiResponses;
  const classification = classifyRunResult({
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    exitCode: result.code,
    patch,
    patchCollectionFailed,
    responseCeilingExceeded,
    scorePolicy: args.scorePolicy,
  });
  const record = {
    ...baseRecord,
    model_patch: patch,
    timed_out: result.timedOut,
    exit_code: result.code,
    patch_chars: patch.length,
    ...telemetry,
    ...classification,
  };
  fs.writeFileSync(
    path.join(rawDir, 'run.json'),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  return record;
}

const args = parseRunnerArgs(process.argv.slice(2));
const entrypoint = resolveCliEntrypoint({
  repoRoot,
  entrypoint: args.entrypoint,
  binaryPath: args.binaryPath,
});
await assertFakeResponsesSupported(entrypoint);
const entrypointMetadata = await collectEntrypointMetadata(entrypoint);
const allInstances = JSON.parse(fs.readFileSync(selectedInstancesPath, 'utf8'));
const selected = allInstances.slice(
  args.offset,
  args.limit === undefined ? undefined : args.offset + args.limit,
);
const selectedConditions = args.conditions.map((id) => {
  if (!conditions[id]) {
    throw new Error(`Unknown condition ${id}`);
  }
  return conditions[id];
});
const runDir = path.join(benchmarkRoot, 'runs', args.runId);
ensureDir(runDir);
fs.writeFileSync(
  path.join(runDir, 'manifest.json'),
  `${JSON.stringify(
    {
      runId: args.runId,
      offset: args.offset,
      limit: args.limit ?? null,
      conditions: selectedConditions.map((condition) => condition.id),
      instances: selected.map((instance) => instance.instance_id),
      timeoutMs: args.timeoutMs,
      maxSessionTurns: args.maxSessionTurns,
      maxApiResponses: args.maxApiResponses,
      prepareOnly: args.prepareOnly,
      entrypoint: args.entrypoint,
      binaryPath: args.binaryPath ?? null,
      fakeResponsesPath: resolveRunnerInputPath(args.fakeResponsesPath) ?? null,
      fakeResponsesSupport:
        args.fakeResponsesPath === undefined
          ? 'not_requested'
          : entrypoint.kind === 'binary'
            ? 'external_binary_support_unverified'
            : 'repo_cli_fake_responses_flag',
      goldPatchMode: args.goldPatchMode,
      nullPatchMode: args.nullPatchMode,
      scorePolicy: args.scorePolicy,
      entrypointMetadata,
    },
    null,
    2,
  )}\n`,
);

const byCondition = new Map(
  selectedConditions.map((condition) => [condition.id, []]),
);

for (const instance of selected) {
  for (const condition of selectedConditions) {
    console.log(`[swebench] ${condition.id} ${instance.instance_id}`);
    const record = await runOne(instance, condition, runDir);
    byCondition.get(condition.id).push(record);
    const predictionPath = path.join(
      runDir,
      `${condition.id}.predictions.jsonl`,
    );
    fs.writeFileSync(
      predictionPath,
      byCondition
        .get(condition.id)
        .map((entry) =>
          JSON.stringify({
            instance_id: entry.instance_id,
            model_name_or_path: entry.model_name_or_path,
            model_patch: entry.model_patch,
          }),
        )
        .join('\n') + '\n',
    );
    fs.writeFileSync(
      path.join(runDir, `${condition.id}.summary.json`),
      `${JSON.stringify(byCondition.get(condition.id), null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(runDir, `${condition.id}.score-summary.json`),
      `${JSON.stringify(
        summarizeRecords(byCondition.get(condition.id)),
        null,
        2,
      )}\n`,
    );
  }
}

console.log(`[swebench] wrote ${runDir}`);
