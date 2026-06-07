/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzePatch,
  buildEntrypointMetadata,
  buildSweBenchmarkSettings,
  classifyRunResult,
  resolveCliEntrypoint,
} from './pollux-swebench-runner-lib.mjs';
import {
  analyzeContractChecklistHazards,
  auditStrictFdCheckpointTrace,
  buildDeepSweConditions,
  buildDeepSweContractChecklist,
  buildDeepSwePrompt,
  buildDependencyPreflightDockerArgs,
  buildPreflightReport,
  buildVerifierDockerArgs,
  classifyVerifierResult,
  copyDirectoryNormalizedForVerifier,
  inferDependencyPreflight,
  loadDeepSweManifest,
  loadDeepSweTask,
  normalizeTextForVerifier,
  parseDeepSweRunnerArgs,
  resolveDeepSweTaskDir,
  resolveRepoPath,
  selectDeepSweTasks,
  summarizeDeepSweRecords,
} from './pollux-deepswe-runner-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const authSeedFiles = [
  'oauth_creds.json',
  'google_accounts.json',
  'projects.json',
  'state.json',
  'installation_id',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let child;
    let stdout = '';
    let stderr = '';
    try {
      child = spawn(command, args, {
        cwd: options.cwd ?? repoRoot,
        env: options.env ?? process.env,
        shell: options.shell === true,
        windowsHide: true,
      });
    } catch (error) {
      if (options.allowFailure) {
        resolve({
          code: null,
          stdout,
          stderr: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      reject(error);
      return;
    }
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (options.allowFailure) {
        resolve({
          code: null,
          stdout,
          stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`,
        });
      } else {
        reject(error);
      }
    });
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

async function gitConfig(args, options = {}) {
  const safeDirectory = options.safeDirectory ?? options.cwd;
  const gitArgs = safeDirectory
    ? ['-c', `safe.directory=${path.resolve(safeDirectory)}`, 'config', ...args]
    : ['config', ...args];
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await execFile('git', gitArgs, {
      ...options,
      allowFailure: true,
    });
    if (result.code === 0) {
      return result;
    }
    const retryableLock =
      /could not lock config file .*File exists/i.test(result.stderr) ||
      /config\.lock/i.test(result.stderr);
    if (!retryableLock || attempt === 4) {
      if (options.allowFailure) {
        return result;
      }
      throw new Error(
        `git config ${args.join(' ')} failed with code ${result.code}\n${result.stderr}`,
      );
    }
    await sleep(250 * (attempt + 1));
  }
  throw new Error(`git config ${args.join(' ')} failed after retries`);
}

function runGemini(args, options) {
  return new Promise((resolve) => {
    let child;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let terminationReason = null;
    let terminating = false;
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
        terminationReason,
      });
      return;
    }

    function terminateProcessTree(reason) {
      timedOut = true;
      terminationReason ??= reason;
      if (terminating) {
        return;
      }
      terminating = true;
      if (process.platform === 'win32' && child?.pid) {
        spawn(
          process.env.ComSpec ?? 'cmd.exe',
          ['/d', '/s', '/c', 'taskkill', '/PID', String(child.pid), '/T', '/F'],
          { windowsHide: true },
        );
        return;
      }
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
    }

    const timer = setTimeout(() => {
      terminateProcessTree('timeout');
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
              terminateProcessTree('model_response_ceiling_exceeded');
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
      resolve({ code, stdout, stderr, timedOut, terminationReason });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (responseLimitTimer) {
        clearInterval(responseLimitTimer);
      }
      resolve({
        code: null,
        stdout,
        stderr: `${stderr}\n${error}`,
        timedOut,
        terminationReason,
      });
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

function seedAuthFiles(homeGeminiDir) {
  const sourceGeminiDir =
    process.env.GEMINI_CLI_HOME ??
    path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.gemini');
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

function buildSettings(condition, telemetryPath, tracePath, maxSessionTurns) {
  return buildSweBenchmarkSettings(
    condition,
    telemetryPath,
    tracePath,
    maxSessionTurns,
  );
}

async function ensureDeepSweRepo(deepsweRepo) {
  if (fs.existsSync(path.join(deepsweRepo, 'tasks'))) {
    await gitConfig(['core.autocrlf', 'false'], {
      cwd: deepsweRepo,
      allowFailure: true,
    });
    await gitConfig(['core.eol', 'lf'], {
      cwd: deepsweRepo,
      allowFailure: true,
    });
    await execFile(
      'git',
      [
        '-c',
        `safe.directory=${path.resolve(deepsweRepo)}`,
        'rev-parse',
        '--short=12',
        'HEAD',
      ],
      {
        cwd: deepsweRepo,
        allowFailure: true,
      },
    );
    return;
  }
  ensureDir(path.dirname(deepsweRepo));
  await execFile('git', [
    '-c',
    'core.autocrlf=false',
    '-c',
    'core.eol=lf',
    'clone',
    'https://github.com/datacurve-ai/deep-swe.git',
    deepsweRepo,
  ]);
  await gitConfig(['core.autocrlf', 'false'], {
    cwd: deepsweRepo,
  });
  await gitConfig(['core.eol', 'lf'], { cwd: deepsweRepo });
}

async function readGitSha(cwd) {
  const result = await execFile(
    'git',
    ['-c', `safe.directory=${path.resolve(cwd)}`, 'rev-parse', 'HEAD'],
    {
      cwd,
      allowFailure: true,
    },
  );
  return result.code === 0 ? result.stdout.trim() : null;
}

async function ensureBareRepo(task, scratchRoot) {
  const repoKey = task.repository.replace(/[\\/]/g, '__');
  const bareDir = path.join(scratchRoot, 'repos', `${repoKey}.git`);
  if (!fs.existsSync(bareDir)) {
    ensureDir(path.dirname(bareDir));
    await execFile('git', [
      '-c',
      'core.longpaths=true',
      'clone',
      '--bare',
      task.repositoryUrl,
      bareDir,
    ]);
  }
  await gitConfig(['core.longpaths', 'true'], {
    cwd: bareDir,
    allowFailure: true,
  });
  await execFile(
    'git',
    [
      '-c',
      `safe.directory=${path.resolve(bareDir)}`,
      'fetch',
      'origin',
      task.baseCommitHash,
    ],
    {
      cwd: bareDir,
      allowFailure: true,
    },
  );
  return bareDir;
}

async function createWorktree(task, sampleId, runDir, scratchRoot) {
  const bareDir = await ensureBareRepo(task, scratchRoot);
  const workDir = path.join(runDir, 'workspaces', sampleId);
  if (fs.existsSync(workDir)) {
    throw new Error(`Workspace already exists: ${workDir}`);
  }
  ensureDir(path.dirname(workDir));
  await execFile('git', [
    '-c',
    `safe.directory=${path.resolve(bareDir)}`,
    '-c',
    'core.autocrlf=false',
    '-c',
    'core.longpaths=true',
    'clone',
    '--no-checkout',
    bareDir,
    workDir,
  ]);
  await execFile(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.longpaths=true',
      'checkout',
      task.baseCommitHash,
    ],
    { cwd: workDir },
  );
  await gitConfig(['core.autocrlf', 'false'], { cwd: workDir });
  await gitConfig(['core.eol', 'lf'], { cwd: workDir });
  await gitConfig(['core.longpaths', 'true'], { cwd: workDir });
  await assertUsableCheckout(workDir);
  return workDir;
}

async function assertUsableCheckout(workDir) {
  const files = await execFile('git', ['ls-files'], { cwd: workDir });
  if (files.stdout.trim().length === 0) {
    throw new Error(`Checkout has no tracked files: ${workDir}`);
  }
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
}

async function applySolutionPatch(task, workDir) {
  if (!fs.existsSync(task.solutionPatchPath)) {
    throw new Error(
      `DeepSWE solution patch not found: ${task.solutionPatchPath}`,
    );
  }
  const normalizedPatchPath = path.join(
    workDir,
    '.git',
    'pollux-normalized-solution.patch',
  );
  fs.writeFileSync(
    normalizedPatchPath,
    normalizeTextForVerifier(fs.readFileSync(task.solutionPatchPath, 'utf8')),
  );
  await execFile(
    'git',
    ['apply', '--whitespace=nowarn', normalizedPatchPath],
    { cwd: workDir },
  );
}

async function applyModelPatch(patchPath, workDir) {
  const normalizedPatchPath = path.join(
    workDir,
    '.git',
    'pollux-normalized-model.patch',
  );
  fs.writeFileSync(
    normalizedPatchPath,
    normalizeTextForVerifier(fs.readFileSync(patchPath, 'utf8')),
  );
  return execFile('git', ['apply', '--whitespace=nowarn', normalizedPatchPath], {
    cwd: workDir,
    allowFailure: true,
  });
}

function prepareVerifierTests(task, rawDir) {
  const verifierInputDir = path.join(rawDir, 'verifier-input');
  const normalizedTestsDir = path.join(verifierInputDir, 'tests');
  copyDirectoryNormalizedForVerifier(task.testsDir, normalizedTestsDir);
  return normalizedTestsDir;
}

function dependencyPreflightRecordForTask(dependencyPreflight, taskId) {
  return dependencyPreflight?.tasks?.find((entry) => entry.taskId === taskId);
}

function dependencyPreflightFailed(dependencyPreflight, taskId) {
  const record = dependencyPreflightRecordForTask(dependencyPreflight, taskId);
  return record?.ok === false && record?.required !== false;
}

function dependencyPreflightCacheDir(dependencyPreflight, taskId) {
  const record = dependencyPreflightRecordForTask(dependencyPreflight, taskId);
  return record?.cacheDir ?? null;
}

async function runVerifier(task, workDir, rawDir, args, options = {}) {
  if (args.noVerifier) {
    return {
      result: { code: 0, stdout: '', stderr: '' },
      classification: classifyVerifierResult({
        skipped: true,
        verifierLogDir: path.join(rawDir, 'verifier'),
        scorePolicy: args.scorePolicy,
      }),
    };
  }
  if (options.dependencyPreflightFailed) {
    return {
      result: { code: null, stdout: '', stderr: '' },
      classification: classifyVerifierResult({
        exitCode: null,
        skipped: false,
        verifierLogDir: path.join(rawDir, 'verifier'),
        scorePolicy: args.scorePolicy,
        dependencyPreflightFailed: true,
      }),
    };
  }
  const verifierLogDir = path.join(rawDir, 'verifier');
  const artifactDir = path.join(rawDir, 'artifacts');
  ensureDir(verifierLogDir);
  ensureDir(artifactDir);
  const testsDir = prepareVerifierTests(task, rawDir);
  const dockerArgs = buildVerifierDockerArgs({
    dockerImage: task.dockerImage,
    workDir,
    testsDir,
    verifierLogDir,
    artifactDir,
    timeoutSec: task.verifierTimeoutSec,
    dependencyCacheDir: options.dependencyCacheDir,
  });
  fs.writeFileSync(
    path.join(rawDir, 'verifier-command.json'),
    `${JSON.stringify({ command: args.dockerCommand, args: dockerArgs }, null, 2)}\n`,
  );
  const result = await execFile(args.dockerCommand, dockerArgs, {
    cwd: workDir,
    allowFailure: true,
  });
  fs.writeFileSync(path.join(rawDir, 'verifier-stdout.txt'), result.stdout);
  fs.writeFileSync(path.join(rawDir, 'verifier-stderr.txt'), result.stderr);
  const classification = classifyVerifierResult({
    exitCode: result.code,
    verifierLogDir,
    scorePolicy: args.scorePolicy,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return { result, classification };
}

async function runDependencyPreflightForTasks(params) {
  const { args, runDir, selected } = params;
  const dependencyRoot = path.join(runDir, 'dependency-preflight');
  ensureDir(dependencyRoot);
  const tasks = [];
  for (const taskEntry of selected) {
    const taskDir = resolveDeepSweTaskDir(args.deepsweRepo, taskEntry.taskId);
    const task = loadDeepSweTask(taskDir, taskEntry);
    const rawDir = path.join(dependencyRoot, task.taskId);
    ensureDir(rawDir);
    const testsDir = prepareVerifierTests(task, rawDir);
    const testScript = fs.readFileSync(path.join(testsDir, 'test.sh'), 'utf8');
    const testPatchPath = path.join(testsDir, 'test.patch');
    const testPatchText = fs.existsSync(testPatchPath)
      ? fs.readFileSync(testPatchPath, 'utf8')
      : '';
    const spec = inferDependencyPreflight(testScript, {
      language: task.language,
      testPatchText,
    });
    const cacheDir = path.join(rawDir, 'dependency-cache');
    ensureDir(cacheDir);
    const command =
      args.dependencyWarmup && spec.warmupCommand
        ? spec.command === spec.warmupCommand
          ? spec.warmupCommand
          : `${spec.command} && ${spec.warmupCommand}`
        : spec.command;
    const record = {
      taskId: task.taskId,
      kind: spec.kind,
      required: spec.required,
      command,
      preflightCommand: spec.command,
      warmupCommand: spec.warmupCommand,
      cacheDir,
      networked: args.networkedVerifierPreflight,
      ok: true,
      exitCode: 0,
      stdoutPath: path.join(rawDir, 'dependency-preflight-stdout.txt'),
      stderrPath: path.join(rawDir, 'dependency-preflight-stderr.txt'),
    };
    if (spec.kind !== 'none') {
      const dockerArgs = buildDependencyPreflightDockerArgs({
        dockerImage: task.dockerImage,
        testsDir,
        command,
        networked: args.networkedVerifierPreflight,
        cacheDir,
      });
      fs.writeFileSync(
        path.join(rawDir, 'dependency-preflight-command.json'),
        `${JSON.stringify({ command: args.dockerCommand, args: dockerArgs }, null, 2)}\n`,
      );
      const result = await execFile(args.dockerCommand, dockerArgs, {
        allowFailure: true,
      });
      record.ok = result.code === 0;
      record.exitCode = result.code;
      fs.writeFileSync(record.stdoutPath, result.stdout);
      fs.writeFileSync(record.stderrPath, result.stderr);
    } else {
      fs.writeFileSync(record.stdoutPath, '');
      fs.writeFileSync(record.stderrPath, '');
    }
    tasks.push(record);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    networked: args.networkedVerifierPreflight,
    warmup: args.dependencyWarmup,
    ok: tasks.every((task) => task.ok || task.required === false),
    tasks,
  };
  fs.writeFileSync(
    path.join(runDir, 'dependency-preflight.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function resolveRunDir(input) {
  if (!input) {
    return input;
  }
  if (path.isAbsolute(input)) {
    return input;
  }
  const direct = path.resolve(repoRoot, input);
  if (fs.existsSync(direct)) {
    return direct;
  }
  return path.join(repoRoot, 'artifacts', 'pollux', 'deepswe-runs', input);
}

function sourceRawDirForRecord(sourceRunDir, record) {
  return path.join(
    sourceRunDir,
    'raw',
    record.condition,
    record.task_id,
    record.sample_id,
  );
}

function sourceRecordKey(conditionId, taskId, repeat) {
  return [conditionId, taskId, `r${repeat}`].join('\0');
}

function buildSourceRecordMap(records) {
  const map = new Map();
  for (const record of records) {
    map.set(
      sourceRecordKey(record.condition, record.task_id, record.repeat ?? 1),
      record,
    );
  }
  return map;
}

function telemetryFieldsFromSource(record) {
  return {
    apiResponses: record.apiResponses ?? 0,
    executorTokens: record.executorTokens ?? 0,
    advisorTokens: record.advisorTokens ?? 0,
    totalTokens: record.totalTokens ?? 0,
    advisorCalls: record.advisorCalls ?? 0,
  };
}

async function collectEntrypointMetadata(cliEntrypoint) {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageVersion = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
    : null;
  const gitHeadResult = await execFile(
    'git',
    ['rev-parse', '--short=9', 'HEAD'],
    { cwd: repoRoot, allowFailure: true },
  );
  const dirtyStatusResult = await execFile('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    allowFailure: true,
  });
  return buildEntrypointMetadata({
    entrypoint: cliEntrypoint,
    packageVersion,
    gitHead: gitHeadResult.code === 0 ? gitHeadResult.stdout.trim() : null,
    gitDirty:
      dirtyStatusResult.code === 0
        ? dirtyStatusResult.stdout.trim().length > 0
        : null,
    bundleFresh: {
      bundleExists: fs.existsSync(path.join(repoRoot, 'bundle', 'gemini.js')),
    },
  });
}

async function assertFakeResponsesSupported(args, cliEntrypoint) {
  if (!args.fakeResponsesPath || cliEntrypoint.kind !== 'binary') {
    return;
  }
  const help = await execFile(
    cliEntrypoint.command,
    [...cliEntrypoint.initialArgs, '--help'],
    { cwd: repoRoot, allowFailure: true },
  );
  const helpText = `${help.stdout}\n${help.stderr}`;
  if (!/--fake-responses\b/.test(helpText)) {
    throw new Error(
      [
        `External binary does not advertise --fake-responses: ${cliEntrypoint.path}`,
        'Refusing to run fake-response smoke through this binary because it may spend real model tokens.',
      ].join('\n'),
    );
  }
}

async function addCommandPreflightChecks(report, args, entrypoint) {
  const npmCommand =
    process.platform === 'win32'
      ? {
          id: 'npm',
          command: process.env.ComSpec ?? 'cmd.exe',
          args: ['/d', '/s', '/c', 'npm.cmd', '--version'],
          required: true,
        }
      : { id: 'npm', command: 'npm', args: ['--version'], required: true };
  const commands = [
    { id: 'git', command: 'git', args: ['--version'], required: true },
    {
      id: args.dockerCommand,
      command: args.dockerCommand,
      args: ['version'],
      required: true,
    },
    { id: 'go', command: 'go', args: ['version'], required: false },
    { id: 'node', command: 'node', args: ['--version'], required: true },
    npmCommand,
    { id: 'python3', command: 'python3', args: ['--version'], required: false },
    { id: 'make', command: 'make', args: ['--version'], required: false },
  ];
  for (const commandSpec of commands) {
    const result = await execFile(commandSpec.command, commandSpec.args, {
      allowFailure: true,
    });
    report.checks.push({
      id: `command:${commandSpec.id}`,
      ok: result.code === 0,
      required: commandSpec.required,
      detail:
        result.code === 0
          ? firstLine(`${result.stdout}\n${result.stderr}`)
          : firstLine(result.stderr || result.stdout || 'not available'),
    });
  }
  report.checks.push({
    id: 'gemini_entrypoint',
    ok: fs.existsSync(entrypoint.path),
    required: true,
    detail: entrypoint,
  });
  report.ok = report.checks.every((check) => check.ok || !check.required);
  return report;
}

function firstLine(text) {
  return (
    text
      .split(/\r?\n/g)
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
}

function strictFdCheckpointAuditForTrace(tracePath, condition, args) {
  if (condition.id !== 'FD' || args.fdProfile !== 'strict') {
    return null;
  }
  const traceText = fs.existsSync(tracePath)
    ? fs.readFileSync(tracePath, 'utf8')
    : '';
  return auditStrictFdCheckpointTrace(traceText);
}

function mergeWarnings(...warningLists) {
  return [
    ...new Set(
      warningLists
        .flat()
        .filter((warning) => typeof warning === 'string' && warning.length > 0),
    ),
  ];
}

async function runOne(params) {
  const { args, condition, entrypoint, runDir, taskEntry, task } = params;
  const sampleId = [
    condition.id,
    task.taskId,
    `r${String(taskEntry.repeat).padStart(2, '0')}`,
  ].join('__');
  const rawDir = path.join(runDir, 'raw', condition.id, task.taskId, sampleId);
  ensureDir(rawDir);
  const homeDir = path.join(rawDir, 'home');
  const homeGeminiDir = path.join(homeDir, '.gemini');
  const telemetryPath = path.join(rawDir, 'telemetry.log');
  const tracePath = path.join(rawDir, 'pollux-trace.jsonl');
  const workDir = await createWorktree(
    task,
    sampleId,
    runDir,
    resolveRepoPath(repoRoot, args.scratchRoot),
  );
  const geminiDir = path.join(workDir, '.gemini');
  ensureDir(geminiDir);
  ensureDir(homeGeminiDir);
  seedAuthFiles(homeGeminiDir);
  const settings = buildSettings(
    condition,
    telemetryPath,
    tracePath,
    args.maxSessionTurns,
  );
  fs.writeFileSync(
    path.join(homeGeminiDir, 'settings.json'),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(homeGeminiDir, 'state.json'),
    `${JSON.stringify({ terminalSetupPromptShown: true }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(geminiDir, 'settings.json'),
    `${JSON.stringify(settings, null, 2)}\n`,
  );

  const contractChecklist = buildDeepSweContractChecklist(task);
  fs.writeFileSync(
    path.join(rawDir, 'contract-checklist.json'),
    `${JSON.stringify(contractChecklist, null, 2)}\n`,
  );
  const prompt = buildDeepSwePrompt(task, {
    condition,
    contractChecklist,
  });
  fs.writeFileSync(path.join(rawDir, 'prompt.txt'), prompt);
  const baseRecord = {
    task_id: task.taskId,
    sample_id: sampleId,
    repeat: taskEntry.repeat,
    repo: task.repository,
    condition: condition.id,
    benchmark: 'DeepSWE',
    lane: 'secondary',
    model_name_or_path: `pollux-${condition.id.toLowerCase()}-${condition.modelName}`,
    entrypoint_kind: entrypoint.kind,
    entrypoint_path: entrypoint.path,
    score_policy: args.scorePolicy,
    max_api_responses: args.maxApiResponses,
    fake_responses_requested: args.fakeResponsesPath !== undefined,
  };

  if (args.mode === 'prepare') {
    const files = await execFile('git', ['ls-files'], { cwd: workDir });
    const record = {
      ...baseRecord,
      model_patch: '',
      prepared_only: true,
      work_dir: workDir,
      tracked_files: files.stdout.trim().split(/\r?\n/g).filter(Boolean).length,
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
      score_bucket: 'incomplete',
      patch_stats: analyzePatch(''),
    };
    fs.writeFileSync(
      path.join(rawDir, 'run.json'),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  }

  let result = {
    code: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    terminationReason: null,
  };
  if (!args.verifierOnly) {
    if (args.goldPatchMode) {
      await applySolutionPatch(task, workDir);
    } else if (!args.nullPatchMode) {
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
          resolveRepoPath(repoRoot, args.fakeResponsesPath),
        );
      }
      result = await runGemini(geminiArgs, {
        cwd: workDir,
        homeDir,
        entrypoint,
        timeoutMs: args.timeoutMs,
        telemetryPath,
        maxApiResponses: args.maxApiResponses,
      });
      fs.writeFileSync(path.join(rawDir, 'stdout.txt'), result.stdout);
      fs.writeFileSync(path.join(rawDir, 'stderr.txt'), result.stderr);
    }
  }

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
  const contractHazards = analyzeContractChecklistHazards(
    patch,
    contractChecklist,
  );

  const telemetry = summarizeTelemetry(telemetryPath);
  const responseCeilingExceeded =
    result.terminationReason === 'model_response_ceiling_exceeded' ||
    (Number.isFinite(args.maxApiResponses) &&
      args.maxApiResponses >= 0 &&
      telemetry.apiResponses > args.maxApiResponses);
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
  if (contractHazards.length > 0) {
    classification.warnings = [
      ...new Set([
        ...(classification.warnings ?? []),
        'contract_forbidden_pattern',
      ]),
    ];
  }
  const fdCheckpointAudit = strictFdCheckpointAuditForTrace(
    tracePath,
    condition,
    args,
  );
  if (fdCheckpointAudit && !fdCheckpointAudit.complete) {
    classification.warnings = mergeWarnings(
      classification.warnings ?? [],
      ['fd_checkpoint_incomplete'],
    );
  }

  let verifier = null;
  let verifierClassification = {};
  if (
    classification.valid_for_score ||
    args.goldPatchMode ||
    args.nullPatchMode
  ) {
    verifier = await runVerifier(task, workDir, rawDir, args, {
      dependencyPreflightFailed: dependencyPreflightFailed(
        params.dependencyPreflight,
        task.taskId,
      ),
      dependencyCacheDir: dependencyPreflightCacheDir(
        params.dependencyPreflight,
        task.taskId,
      ),
    });
    verifierClassification = verifier.classification;
  }

  const record = {
    ...baseRecord,
    model_patch: patch,
    patch_mode: args.goldPatchMode
      ? 'gold'
      : args.nullPatchMode
        ? 'null'
        : null,
    work_dir: workDir,
    timed_out: result.timedOut,
    termination_reason: result.terminationReason,
    exit_code: result.code,
    patch_chars: patch.length,
    contract_checklist: contractChecklist,
    contract_hazards: contractHazards,
    ...(fdCheckpointAudit ? { fd_checkpoint_audit: fdCheckpointAudit } : {}),
    ...telemetry,
    ...classification,
    verifier_exit_code: verifier?.result.code ?? null,
    ...verifierClassification,
  };
  if (record.valid_for_score && verifierClassification.score_bucket) {
    record.score_bucket = verifierClassification.score_bucket;
  }
  if (verifierClassification.verifier_invalidation_reason) {
    record.valid_for_score = args.scorePolicy === 'diagnostic';
    record.invalidation_reason ??=
      verifierClassification.verifier_invalidation_reason;
  }
  fs.writeFileSync(
    path.join(rawDir, 'run.json'),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  return record;
}

async function rescoreOne(params) {
  const {
    args,
    condition,
    runDir,
    sourceRunDir,
    sourceRecord,
    taskEntry,
    task,
  } = params;
  const sampleId = [
    condition.id,
    task.taskId,
    `r${String(taskEntry.repeat).padStart(2, '0')}`,
  ].join('__');
  const rawDir = path.join(runDir, 'raw', condition.id, task.taskId, sampleId);
  ensureDir(rawDir);
  const contractChecklist = buildDeepSweContractChecklist(task);
  fs.writeFileSync(
    path.join(rawDir, 'contract-checklist.json'),
    `${JSON.stringify(contractChecklist, null, 2)}\n`,
  );

  const sourceRawDir = sourceRawDirForRecord(sourceRunDir, sourceRecord);
  const sourcePatchPath = path.join(sourceRawDir, 'model.patch');
  const sourceStdoutPath = path.join(sourceRawDir, 'stdout.txt');
  const sourceStderrPath = path.join(sourceRawDir, 'stderr.txt');
  const sourceTracePath = path.join(sourceRawDir, 'pollux-trace.jsonl');
  const fdCheckpointAudit = strictFdCheckpointAuditForTrace(
    sourceTracePath,
    condition,
    args,
  );
  const sourceWarnings = mergeWarnings(
    sourceRecord.warnings ?? [],
    fdCheckpointAudit && !fdCheckpointAudit.complete
      ? ['fd_checkpoint_incomplete']
      : [],
  );
  const sourceStdout = fs.existsSync(sourceStdoutPath)
    ? fs.readFileSync(sourceStdoutPath, 'utf8')
    : '';
  const sourceStderr = fs.existsSync(sourceStderrPath)
    ? fs.readFileSync(sourceStderrPath, 'utf8')
    : '';
  const patch = fs.existsSync(sourcePatchPath)
    ? fs.readFileSync(sourcePatchPath, 'utf8')
    : '';
  fs.writeFileSync(path.join(rawDir, 'model.patch'), patch);
  const contractHazards = analyzeContractChecklistHazards(
    patch,
    contractChecklist,
  );

  const baseRecord = {
    task_id: task.taskId,
    sample_id: sampleId,
    repeat: taskEntry.repeat,
    repo: task.repository,
    condition: condition.id,
    benchmark: 'DeepSWE',
    lane: 'secondary',
    model_name_or_path: sourceRecord.model_name_or_path,
    entrypoint_kind: sourceRecord.entrypoint_kind ?? null,
    entrypoint_path: sourceRecord.entrypoint_path ?? null,
    score_policy: args.scorePolicy,
    max_api_responses: sourceRecord.max_api_responses ?? args.maxApiResponses,
    fake_responses_requested: sourceRecord.fake_responses_requested ?? false,
    rescore_only: true,
    model_reused_from_run: path.basename(sourceRunDir),
    source_sample_id: sourceRecord.sample_id,
    source_run_dir: sourceRunDir,
    source_raw_dir: sourceRawDir,
    ...telemetryFieldsFromSource(sourceRecord),
  };

  const patchStats = analyzePatch(patch);
  if (!fs.existsSync(sourcePatchPath) || patch.trim().length === 0) {
    const record = {
      ...baseRecord,
      model_patch: patch,
      patch_apply_status: 'patch_missing',
      work_dir: null,
      timed_out: false,
      termination_reason: null,
      exit_code: 0,
      patch_chars: patch.length,
      contract_checklist: contractChecklist,
      contract_hazards: contractHazards,
      valid_for_score: false,
      invalidation_reason: 'patch_missing',
      score_bucket: 'invalid',
      patch_stats: patchStats,
      warnings: sourceWarnings,
      ...(fdCheckpointAudit ? { fd_checkpoint_audit: fdCheckpointAudit } : {}),
      verifier_exit_code: null,
      verifier_skipped: true,
      resolved: false,
    };
    fs.writeFileSync(
      path.join(rawDir, 'run.json'),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  }

  const workDir = await createWorktree(
    task,
    sampleId,
    runDir,
    resolveRepoPath(repoRoot, args.scratchRoot),
  );
  const applyResult = await applyModelPatch(
    path.join(rawDir, 'model.patch'),
    workDir,
  );
  fs.writeFileSync(path.join(rawDir, 'patch-apply-stdout.txt'), applyResult.stdout);
  fs.writeFileSync(path.join(rawDir, 'patch-apply-stderr.txt'), applyResult.stderr);
  if (applyResult.code !== 0) {
    const record = {
      ...baseRecord,
      model_patch: patch,
      patch_apply_status: 'patch_apply_failed',
      work_dir: workDir,
      timed_out: false,
      termination_reason: null,
      exit_code: 0,
      patch_chars: patch.length,
      contract_checklist: contractChecklist,
      contract_hazards: contractHazards,
      valid_for_score: false,
      invalidation_reason: 'patch_apply_failed',
      score_bucket: 'invalid',
      patch_stats: patchStats,
      warnings: sourceWarnings,
      ...(fdCheckpointAudit ? { fd_checkpoint_audit: fdCheckpointAudit } : {}),
      verifier_exit_code: null,
      verifier_skipped: true,
      resolved: false,
    };
    fs.writeFileSync(
      path.join(rawDir, 'run.json'),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  }

  const classification = classifyRunResult({
    stdout: sourceStdout,
    stderr: sourceStderr,
    timedOut: false,
    exitCode: 0,
    patch,
    patchStats,
    patchCollectionFailed: false,
    responseCeilingExceeded: false,
    scorePolicy: args.scorePolicy,
  });
  const mergedWarnings = mergeWarnings(
    sourceWarnings,
    classification.warnings ?? [],
    contractHazards.length > 0 ? ['contract_forbidden_pattern'] : [],
  );
  const verifier = classification.valid_for_score
    ? await runVerifier(task, workDir, rawDir, args, {
        dependencyPreflightFailed: dependencyPreflightFailed(
          params.dependencyPreflight,
          task.taskId,
        ),
        dependencyCacheDir: dependencyPreflightCacheDir(
          params.dependencyPreflight,
          task.taskId,
        ),
      })
    : null;
  const verifierClassification = verifier?.classification ?? {};
  const record = {
    ...baseRecord,
    model_patch: patch,
    patch_apply_status: 'applied',
    work_dir: workDir,
    timed_out: false,
    termination_reason: null,
    exit_code: 0,
    patch_chars: patch.length,
    contract_checklist: contractChecklist,
    contract_hazards: contractHazards,
    ...(fdCheckpointAudit ? { fd_checkpoint_audit: fdCheckpointAudit } : {}),
    ...classification,
    warnings: mergedWarnings,
    verifier_exit_code: verifier?.result.code ?? null,
    ...verifierClassification,
  };
  if (record.valid_for_score && verifierClassification.score_bucket) {
    record.score_bucket = verifierClassification.score_bucket;
  }
  if (verifierClassification.verifier_invalidation_reason) {
    record.valid_for_score = args.scorePolicy === 'diagnostic';
    record.invalidation_reason ??=
      verifierClassification.verifier_invalidation_reason;
  }
  fs.writeFileSync(
    path.join(rawDir, 'run.json'),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  return record;
}

function writeConditionArtifacts(runDir, conditionId, records) {
  fs.writeFileSync(
    path.join(runDir, `${conditionId}.predictions.jsonl`),
    records
      .map((entry) =>
        JSON.stringify({
          instance_id: entry.task_id,
          task_id: entry.task_id,
          sample_id: entry.sample_id,
          model_name_or_path: entry.model_name_or_path,
          model_patch: entry.model_patch,
        }),
      )
      .join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(runDir, `${conditionId}.summary.json`),
    `${JSON.stringify(records, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(runDir, `${conditionId}.score-summary.json`),
    `${JSON.stringify(summarizeDeepSweRecords(records), null, 2)}\n`,
  );
}

function readRunRecords(runDir) {
  const records = [];
  const rawRoot = path.join(runDir, 'raw');
  if (!fs.existsSync(rawRoot)) {
    return records;
  }
  const stack = [rawRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.name === 'run.json') {
        records.push(JSON.parse(fs.readFileSync(entryPath, 'utf8')));
      }
    }
  }
  return records;
}

async function main() {
  const args = parseDeepSweRunnerArgs(process.argv.slice(2));
  args.taskManifest = resolveRepoPath(repoRoot, args.taskManifest);
  args.deepsweRepo = resolveRepoPath(repoRoot, args.deepsweRepo);
  args.scratchRoot = resolveRepoPath(repoRoot, args.scratchRoot);
  args.sourceRun = args.sourceRun ? resolveRunDir(args.sourceRun) : undefined;

  const entrypoint = resolveCliEntrypoint({
    repoRoot,
    entrypoint: args.entrypoint,
    binaryPath: args.binaryPath,
  });
  await assertFakeResponsesSupported(args, entrypoint);
  let preflight = buildPreflightReport({
    taskManifest: args.taskManifest,
    deepsweRepo: args.deepsweRepo,
    scratchRoot: args.scratchRoot,
    allowNonWsl: args.allowNonWsl,
  });
  preflight = await addCommandPreflightChecks(preflight, args, entrypoint);

  const runDir = path.join(
    repoRoot,
    'artifacts',
    'pollux',
    'deepswe-runs',
    args.runId,
  );
  ensureDir(runDir);

  if (args.mode === 'summarize') {
    const records = readRunRecords(runDir);
    const byCondition = new Map();
    for (const record of records) {
      const condition = record.condition ?? 'unknown';
      byCondition.set(condition, [
        ...(byCondition.get(condition) ?? []),
        record,
      ]);
    }
    for (const [condition, conditionRecords] of byCondition) {
      writeConditionArtifacts(runDir, condition, conditionRecords);
    }
    fs.writeFileSync(
      path.join(runDir, 'summary.json'),
      `${JSON.stringify(summarizeDeepSweRecords(records), null, 2)}\n`,
    );
    console.log(`[deepswe] summarized ${records.length} records in ${runDir}`);
    return;
  }

  fs.writeFileSync(
    path.join(runDir, 'preflight.json'),
    `${JSON.stringify(preflight, null, 2)}\n`,
  );

  if (args.mode === 'preflight' && !args.dependencyPreflight) {
    console.log(`[deepswe] preflight ${preflight.ok ? 'ok' : 'failed'}`);
    console.log(`[deepswe] wrote ${path.join(runDir, 'preflight.json')}`);
    if (!preflight.ok) {
      process.exitCode = 1;
    }
    return;
  }

  await ensureDeepSweRepo(args.deepsweRepo);
  const manifest = loadDeepSweManifest(args.taskManifest);
  const sourceRecords =
    args.mode === 'rescore' ? readRunRecords(args.sourceRun) : [];
  let selected = selectDeepSweTasks(manifest, args);
  const activeConditions = buildDeepSweConditions(args.fdProfile);
  const selectedConditions = args.conditions.map((id) => activeConditions[id]);
  if (
    args.mode === 'rescore' &&
    !args.taskIds &&
    args.limit === undefined
  ) {
    const sourceKeys = new Set(
      sourceRecords.map((record) =>
        sourceRecordKey(record.condition, record.task_id, record.repeat ?? 1),
      ),
    );
    selected = selected.filter((taskEntry) =>
      selectedConditions.some((condition) =>
        sourceKeys.has(
          sourceRecordKey(condition.id, taskEntry.taskId, taskEntry.repeat),
        ),
      ),
    );
  }
  if (args.mode === 'rescore' && selected.length === 0) {
    throw new Error(
      `No DeepSWE source records matched ${args.sourceRun} for conditions ${args.conditions.join(',')}.`,
    );
  }
  const dependencyPreflight =
    args.dependencyPreflight || args.dependencyWarmup
      ? await runDependencyPreflightForTasks({ args, runDir, selected })
      : null;
  if (args.mode === 'preflight') {
    const dependencyOk = dependencyPreflight?.ok ?? true;
    console.log(
      `[deepswe] preflight ${preflight.ok && dependencyOk ? 'ok' : 'failed'}`,
    );
    console.log(`[deepswe] wrote ${path.join(runDir, 'preflight.json')}`);
    if (dependencyPreflight) {
      console.log(
        `[deepswe] wrote ${path.join(runDir, 'dependency-preflight.json')}`,
      );
    }
    if (!preflight.ok || !dependencyOk) {
      process.exitCode = 1;
    }
    return;
  }
  if (
    dependencyPreflight &&
    !dependencyPreflight.ok &&
    args.mode !== 'rescore'
  ) {
    throw new Error(
      `Dependency preflight failed. See ${path.join(runDir, 'dependency-preflight.json')}.`,
    );
  }
  const deepsweGitSha = await readGitSha(args.deepsweRepo);
  const entrypointMetadata = await collectEntrypointMetadata(entrypoint);
  fs.writeFileSync(
    path.join(runDir, 'manifest.json'),
    `${JSON.stringify(
      {
        runId: args.runId,
        benchmark: 'DeepSWE',
        lane: 'secondary',
        taskManifest: args.taskManifest,
        deepsweRepo: args.deepsweRepo,
        deepsweGitSha,
        scratchRoot: args.scratchRoot,
        mode: args.mode,
        offset: args.offset,
        limit: args.limit ?? null,
        repeats: args.repeats,
        conditions: selectedConditions.map((condition) => condition.id),
        taskIds: selected.map((task) => task.taskId),
        timeoutMs: args.timeoutMs,
        maxSessionTurns: args.maxSessionTurns,
        maxApiResponses: args.maxApiResponses,
        fdProfile: args.fdProfile,
        dependencyPreflight: args.dependencyPreflight,
        dependencyWarmup: args.dependencyWarmup,
        networkedVerifierPreflight: args.networkedVerifierPreflight,
        entrypoint: args.entrypoint,
        binaryPath: args.binaryPath ?? null,
        fakeResponsesPath:
          resolveRepoPath(repoRoot, args.fakeResponsesPath) ?? null,
        sourceRun: args.sourceRun ?? null,
        taskIdsFilter: args.taskIds ?? null,
        goldPatchMode: args.goldPatchMode,
        nullPatchMode: args.nullPatchMode,
        verifierOnly: args.verifierOnly,
        noVerifier: args.noVerifier,
        scorePolicy: args.scorePolicy,
        entrypointMetadata,
        officialSources: manifest.officialSources,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(runDir, 'task-selection.json'),
    `${JSON.stringify(selected, null, 2)}\n`,
  );

  const byCondition = new Map(
    selectedConditions.map((condition) => [condition.id, []]),
  );
  const sourceRecordMap =
    args.mode === 'rescore'
      ? buildSourceRecordMap(sourceRecords)
      : null;
  for (const taskEntry of selected) {
    const taskDir = resolveDeepSweTaskDir(args.deepsweRepo, taskEntry.taskId);
    const task = loadDeepSweTask(taskDir, taskEntry);
    for (const condition of selectedConditions) {
      console.log(
        `[deepswe] ${condition.id} ${task.taskId} r${taskEntry.repeat}`,
      );
      const sourceRecord = sourceRecordMap?.get(
        sourceRecordKey(condition.id, task.taskId, taskEntry.repeat),
      );
      const record =
        args.mode === 'rescore'
          ? sourceRecord
            ? await rescoreOne({
                args,
                condition,
                runDir,
                sourceRunDir: args.sourceRun,
                sourceRecord,
                taskEntry,
                task,
                dependencyPreflight,
              })
            : {
                task_id: task.taskId,
                sample_id: [
                  condition.id,
                  task.taskId,
                  `r${String(taskEntry.repeat).padStart(2, '0')}`,
                ].join('__'),
                repeat: taskEntry.repeat,
                repo: task.repository,
                condition: condition.id,
                benchmark: 'DeepSWE',
                lane: 'secondary',
                rescore_only: true,
                model_reused_from_run: path.basename(args.sourceRun),
                source_sample_id: null,
                model_patch: '',
                patch_apply_status: 'source_record_missing',
                valid_for_score: false,
                invalidation_reason: 'source_record_missing',
                score_bucket: 'invalid',
                patch_stats: analyzePatch(''),
                warnings: [],
              }
          : await runOne({
              args,
              condition,
              entrypoint,
              runDir,
              taskEntry,
              task,
              dependencyPreflight,
            });
      if (args.mode === 'rescore' && !sourceRecord) {
        const rawDir = path.join(
          runDir,
          'raw',
          condition.id,
          task.taskId,
          record.sample_id,
        );
        ensureDir(rawDir);
        fs.writeFileSync(
          path.join(rawDir, 'run.json'),
          `${JSON.stringify(record, null, 2)}\n`,
        );
      }
      byCondition.get(condition.id).push(record);
      writeConditionArtifacts(
        runDir,
        condition.id,
        byCondition.get(condition.id),
      );
    }
  }

  const allRecords = [...byCondition.values()].flat();
  fs.writeFileSync(
    path.join(runDir, 'summary.json'),
    `${JSON.stringify(summarizeDeepSweRecords(allRecords), null, 2)}\n`,
  );
  console.log(`[deepswe] wrote ${runDir}`);
}

await main();
