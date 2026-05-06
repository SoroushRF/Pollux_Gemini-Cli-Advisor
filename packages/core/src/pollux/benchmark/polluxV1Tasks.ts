/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import picomatch from 'picomatch';

export const POLLUX_V1_BENCHMARK_ID = 'pollux-v1';

export const POLLUX_V1_TASK_FAMILIES = [
  'cross_file_contract_repair',
  'test_intent_edge_bugfix',
  'guarded_migration_compatibility',
  'source_of_truth_conflict_resolution',
  'multi_artifact_consistency',
] as const;

export type PolluxV1TaskFamily = (typeof POLLUX_V1_TASK_FAMILIES)[number];

export const POLLUX_V1_DIFFICULTIES = [
  'easy_control',
  'medium',
  'hard',
] as const;

export type PolluxV1Difficulty = (typeof POLLUX_V1_DIFFICULTIES)[number];

export interface PolluxV1TaskSpec {
  id: string;
  family: PolluxV1TaskFamily;
  difficulty: PolluxV1Difficulty;
  source: string;
  prompt: string;
  timeoutSec: number;
  protectedFiles: string[];
  visibleFiles: string[];
  failToPassCommand: string[];
  passToPassCommand: string[];
  tags: string[];
  taskDir: string;
  baseDir: string;
  testsDir: string;
  solutionDir: string;
  solutionPatchPath: string;
  reviewPath: string;
  notesPath: string;
}

export interface PolluxV1SelectedTaskSet {
  benchmarkId: string;
  status: 'frozen';
  frozenAt: string;
  taskCount: number;
  families: number;
  difficultyLevels: PolluxV1Difficulty[];
  repeatsPerTrack: number;
  tracks: string[];
  taskIds: string[];
}

export interface PolluxV1CommandResult {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface PolluxV1VerifierResult {
  taskId: string;
  success: boolean;
  failToPassPassed: boolean;
  passToPassPassed: boolean;
  protectedHashesPassed: boolean;
  failToPass: PolluxV1CommandResult;
  passToPass: PolluxV1CommandResult;
  changedProtectedFiles: string[];
  durationMs: number;
  stdoutPath?: string;
  stderrPath?: string;
}

interface RawPolluxV1TaskYaml {
  id?: unknown;
  family?: unknown;
  difficulty?: unknown;
  source?: unknown;
  prompt?: unknown;
  timeout_sec?: unknown;
  protected_files?: unknown;
  visible_files?: unknown;
  hidden_tests?: unknown;
  success?: unknown;
  tags?: unknown;
}

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '..', '..', '..', '..', '..');
export const DEFAULT_POLLUX_V1_ROOT = path.join(
  REPO_ROOT,
  'benchmarks',
  POLLUX_V1_BENCHMARK_ID,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`pollux-v1 task field ${field} must be a non-empty string`);
  }
  return value;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!isUnknownArray(value) || value.length === 0) {
    throw new Error(
      `pollux-v1 task field ${field} must be a non-empty string array`,
    );
  }

  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(
        `pollux-v1 task field ${field} must be a non-empty string array`,
      );
    }
    strings.push(entry);
  }
  return strings;
}

function isPolluxV1TaskFamily(value: string): value is PolluxV1TaskFamily {
  return POLLUX_V1_TASK_FAMILIES.some((family) => family === value);
}

function isPolluxV1Difficulty(value: string): value is PolluxV1Difficulty {
  return POLLUX_V1_DIFFICULTIES.some((difficulty) => difficulty === value);
}

function assertTaskFamily(value: unknown): PolluxV1TaskFamily {
  if (typeof value !== 'string' || !isPolluxV1TaskFamily(value)) {
    throw new Error(`pollux-v1 task family is invalid: ${String(value)}`);
  }
  return value;
}

function assertDifficulty(value: unknown): PolluxV1Difficulty {
  if (typeof value !== 'string' || !isPolluxV1Difficulty(value)) {
    throw new Error(`pollux-v1 task difficulty is invalid: ${String(value)}`);
  }
  return value;
}

function assertDifficultyArray(
  value: unknown,
  field: string,
): PolluxV1Difficulty[] {
  const entries = assertStringArray(value, field);
  return entries.map((entry) => assertDifficulty(entry));
}

function readYaml(filePath: string): RawPolluxV1TaskYaml {
  const parsed = loadYaml(fs.readFileSync(filePath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error(`pollux-v1 task yaml is not an object: ${filePath}`);
  }
  return parsed;
}

function readCommand(raw: RawPolluxV1TaskYaml, key: string): string[] {
  if (!isRecord(raw.hidden_tests)) {
    throw new Error('pollux-v1 task hidden_tests must be an object');
  }
  const command = raw.hidden_tests[key];
  return assertStringArray(command, `hidden_tests.${key}`);
}

function assertRequiredPath(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`pollux-v1 ${label} is missing: ${filePath}`);
  }
}

export function loadPolluxV1Task(
  taskId: string,
  rootDir = DEFAULT_POLLUX_V1_ROOT,
): PolluxV1TaskSpec {
  const taskDir = path.join(rootDir, 'tasks', taskId);
  const taskYamlPath = path.join(taskDir, 'task.yaml');
  const baseDir = path.join(taskDir, 'base');
  const testsDir = path.join(taskDir, 'tests');
  const solutionDir = path.join(taskDir, 'solution');
  const solutionPatchPath = path.join(taskDir, 'solution.patch');
  const reviewPath = path.join(taskDir, 'review.json');
  const notesPath = path.join(taskDir, 'notes.md');

  assertRequiredPath(taskYamlPath, 'task.yaml');
  assertRequiredPath(baseDir, 'base directory');
  assertRequiredPath(path.join(testsDir, 'fail_to_pass'), 'fail_to_pass tests');
  assertRequiredPath(path.join(testsDir, 'pass_to_pass'), 'pass_to_pass tests');
  assertRequiredPath(solutionDir, 'solution directory');
  assertRequiredPath(solutionPatchPath, 'solution.patch');
  assertRequiredPath(reviewPath, 'review.json');
  assertRequiredPath(notesPath, 'notes.md');

  const raw = readYaml(taskYamlPath);
  const id = assertString(raw.id, 'id');
  if (id !== taskId) {
    throw new Error(
      `pollux-v1 task id mismatch: expected ${taskId}, got ${id}`,
    );
  }

  const timeoutSec = raw.timeout_sec;
  if (typeof timeoutSec !== 'number' || timeoutSec <= 0) {
    throw new Error('pollux-v1 task timeout_sec must be a positive number');
  }

  return {
    id,
    family: assertTaskFamily(raw.family),
    difficulty: assertDifficulty(raw.difficulty),
    source: assertString(raw.source, 'source'),
    prompt: assertString(raw.prompt, 'prompt'),
    timeoutSec,
    protectedFiles: assertStringArray(raw.protected_files, 'protected_files'),
    visibleFiles: assertStringArray(raw.visible_files, 'visible_files'),
    failToPassCommand: readCommand(raw, 'fail_to_pass_command'),
    passToPassCommand: readCommand(raw, 'pass_to_pass_command'),
    tags: assertStringArray(raw.tags, 'tags'),
    taskDir,
    baseDir,
    testsDir,
    solutionDir,
    solutionPatchPath,
    reviewPath,
    notesPath,
  };
}

export function loadPolluxV1SelectedTaskSet(
  rootDir = DEFAULT_POLLUX_V1_ROOT,
): PolluxV1SelectedTaskSet {
  const selectedPath = path.join(rootDir, 'selected-task-set.json');
  const parsed = JSON.parse(fs.readFileSync(selectedPath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('pollux-v1 selected-task-set.json must be an object');
  }
  const taskIds = assertStringArray(parsed['taskIds'], 'taskIds');
  return {
    benchmarkId: assertString(parsed['benchmarkId'], 'benchmarkId'),
    status:
      parsed['status'] === 'frozen'
        ? 'frozen'
        : (() => {
            throw new Error('pollux-v1 selected task set must be frozen');
          })(),
    frozenAt: assertString(parsed['frozenAt'], 'frozenAt'),
    taskCount: Number(parsed['taskCount']),
    families: Number(parsed['families']),
    difficultyLevels: assertDifficultyArray(
      parsed['difficultyLevels'],
      'difficultyLevels',
    ),
    repeatsPerTrack: Number(parsed['repeatsPerTrack']),
    tracks: assertStringArray(parsed['tracks'], 'tracks'),
    taskIds,
  };
}

export function loadPolluxV1Tasks(
  rootDir = DEFAULT_POLLUX_V1_ROOT,
): PolluxV1TaskSpec[] {
  const selected = loadPolluxV1SelectedTaskSet(rootDir);
  return selected.taskIds.map((taskId) => loadPolluxV1Task(taskId, rootDir));
}

function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  for (const sourceFile of listFilesRecursive(sourceDir)) {
    const relativePath = path.relative(sourceDir, sourceFile);
    const targetFile = path.join(targetDir, relativePath);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }
}

export function preparePolluxV1Workspace(
  task: PolluxV1TaskSpec,
  workspaceDir: string,
): void {
  copyDirectoryContents(task.baseDir, workspaceDir);
}

export function copyPolluxV1HiddenTests(
  task: PolluxV1TaskSpec,
  workspaceDir: string,
): void {
  copyDirectoryContents(task.testsDir, path.join(workspaceDir, 'tests'));
}

export function copyPolluxV1SolutionFiles(
  task: PolluxV1TaskSpec,
  workspaceDir: string,
): void {
  copyDirectoryContents(task.solutionDir, workspaceDir);
}

function hashFile(filePath: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function protectedFileHashes(task: PolluxV1TaskSpec): Map<string, string> {
  const matchers = task.protectedFiles.map((pattern) =>
    picomatch(pattern, { dot: true }),
  );
  const hashes = new Map<string, string>();
  for (const filePath of listFilesRecursive(task.baseDir)) {
    const relativePath = normalizeRelativePath(
      path.relative(task.baseDir, filePath),
    );
    if (matchers.some((matcher) => matcher(relativePath))) {
      hashes.set(relativePath, hashFile(filePath));
    }
  }
  return hashes;
}

function runCommand(
  command: string[],
  workspaceDir: string,
  timeoutSec: number,
): PolluxV1CommandResult {
  const executable = command[0] === 'node' ? process.execPath : command[0];
  const result = spawnSync(executable, command.slice(1), {
    cwd: workspaceDir,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
  });
  return {
    command,
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function verifyPolluxV1TaskWorkspace(
  task: PolluxV1TaskSpec,
  workspaceDir: string,
  outputDir?: string,
): PolluxV1VerifierResult {
  const startMs = Date.now();
  copyPolluxV1HiddenTests(task, workspaceDir);

  const expectedProtectedHashes = protectedFileHashes(task);
  const failToPass = runCommand(
    task.failToPassCommand,
    workspaceDir,
    task.timeoutSec,
  );
  const passToPass = runCommand(
    task.passToPassCommand,
    workspaceDir,
    task.timeoutSec,
  );

  const changedProtectedFiles: string[] = [];
  for (const [relativePath, expectedHash] of expectedProtectedHashes) {
    const workspaceFile = path.join(workspaceDir, relativePath);
    if (
      !fs.existsSync(workspaceFile) ||
      hashFile(workspaceFile) !== expectedHash
    ) {
      changedProtectedFiles.push(relativePath);
    }
  }

  const stdout = [failToPass.stdout, passToPass.stdout].join('\n');
  const stderr = [failToPass.stderr, passToPass.stderr].join('\n');

  let stdoutPath: string | undefined;
  let stderrPath: string | undefined;
  if (outputDir !== undefined) {
    fs.mkdirSync(outputDir, { recursive: true });
    stdoutPath = path.join(outputDir, 'verifier.stdout.log');
    stderrPath = path.join(outputDir, 'verifier.stderr.log');
    fs.writeFileSync(stdoutPath, stdout, 'utf8');
    fs.writeFileSync(stderrPath, stderr, 'utf8');
  }

  const failToPassPassed = failToPass.exitCode === 0;
  const passToPassPassed = passToPass.exitCode === 0;
  const protectedHashesPassed = changedProtectedFiles.length === 0;

  return {
    taskId: task.id,
    success: failToPassPassed && passToPassPassed && protectedHashesPassed,
    failToPassPassed,
    passToPassPassed,
    protectedHashesPassed,
    failToPass,
    passToPass,
    changedProtectedFiles,
    durationMs: Date.now() - startMs,
    stdoutPath,
    stderrPath,
  };
}
