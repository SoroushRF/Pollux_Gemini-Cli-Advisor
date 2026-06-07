/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import picomatch from 'picomatch';
import type { BenchmarkDifficulty } from './tasks.js';
import type {
  RealBenchmarkDomain,
  RealBenchmarkTaskSpec,
} from './realTypes.js';

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

export type PolluxV1RubricLevel = 'low' | 'moderate' | 'high';
export type PolluxV1BiasRisk = 'low' | 'medium' | 'high';

export interface PolluxV1DifficultyRubric {
  primaryFilesOrArtifactsTouched: number;
  requiresCrossFileReasoning: boolean;
  hasSourceOfTruthConflict: boolean;
  hiddenEdgeCaseDepth: PolluxV1RubricLevel;
  hasCompatibilityConstraint: boolean;
  hasRegressionTrap: boolean;
  generalizationRequired: PolluxV1RubricLevel;
  solutionSpaceAmbiguity: PolluxV1RubricLevel;
  protectedFileConstraintStrength: PolluxV1RubricLevel;
}

export interface PolluxV1TaskReview {
  reviewer: string;
  reviewDate: string;
  clarity: 'pass';
  oracleValidity: 'pass';
  difficultyIntent: PolluxV1Difficulty;
  knownAcceptableSolutionShapes: string[];
  knownInvalidShortcuts: string[];
  biasRisk: PolluxV1BiasRisk;
  biasMitigation: string;
  difficultyRubric: PolluxV1DifficultyRubric;
  difficultyRationale: string;
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

function readJsonRecord(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`pollux-v1 JSON file must contain an object: ${filePath}`);
  }
  return parsed;
}

function assertRubricLevel(value: unknown, field: string): PolluxV1RubricLevel {
  if (value === 'low' || value === 'moderate' || value === 'high') {
    return value;
  }
  throw new Error(`pollux-v1 review field ${field} has invalid level`);
}

function assertBiasRisk(value: unknown, field: string): PolluxV1BiasRisk {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  throw new Error(`pollux-v1 review field ${field} has invalid bias risk`);
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`pollux-v1 review field ${field} must be boolean`);
  }
  return value;
}

function assertPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(
      `pollux-v1 review field ${field} must be a positive integer`,
    );
  }
  return value;
}

function assertPass(value: unknown, field: string): 'pass' {
  if (value !== 'pass') {
    throw new Error(`pollux-v1 review field ${field} must be pass`);
  }
  return 'pass';
}

function rubricLevelScore(level: PolluxV1RubricLevel): number {
  switch (level) {
    case 'high':
      return 2;
    case 'moderate':
      return 1;
    case 'low':
      return 0;
    default:
      throw new Error(`Unsupported pollux-v1 rubric level: ${level}`);
  }
}

function difficultyRubricScore(rubric: PolluxV1DifficultyRubric): number {
  return (
    Math.max(0, rubric.primaryFilesOrArtifactsTouched - 1) +
    (rubric.requiresCrossFileReasoning ? 1 : 0) +
    (rubric.hasSourceOfTruthConflict ? 1 : 0) +
    rubricLevelScore(rubric.hiddenEdgeCaseDepth) +
    (rubric.hasCompatibilityConstraint ? 1 : 0) +
    (rubric.hasRegressionTrap ? 1 : 0) +
    rubricLevelScore(rubric.generalizationRequired) +
    rubricLevelScore(rubric.solutionSpaceAmbiguity) +
    rubricLevelScore(rubric.protectedFileConstraintStrength)
  );
}

function assertRubricConsistentWithDifficulty(
  taskId: string,
  difficulty: PolluxV1Difficulty,
  rubric: PolluxV1DifficultyRubric,
): void {
  const score = difficultyRubricScore(rubric);
  if (difficulty === 'easy_control' && score > 4) {
    throw new Error(
      `pollux-v1 review rubric over-scores easy task ${taskId}: ${score}`,
    );
  }
  if (difficulty === 'medium' && (score < 2 || score > 7)) {
    throw new Error(
      `pollux-v1 review rubric mis-scores medium task ${taskId}: ${score}`,
    );
  }
  if (difficulty === 'hard' && score < 5) {
    throw new Error(
      `pollux-v1 review rubric under-scores hard task ${taskId}: ${score}`,
    );
  }
}

export function loadPolluxV1TaskReview(
  task: Pick<PolluxV1TaskSpec, 'id' | 'difficulty' | 'reviewPath'>,
): PolluxV1TaskReview {
  const raw = readJsonRecord(task.reviewPath);
  const rubricRaw = raw['difficultyRubric'];
  if (!isRecord(rubricRaw)) {
    throw new Error(
      `pollux-v1 review missing difficultyRubric for task ${task.id}`,
    );
  }

  const difficultyRubric: PolluxV1DifficultyRubric = {
    primaryFilesOrArtifactsTouched: assertPositiveInteger(
      rubricRaw['primaryFilesOrArtifactsTouched'],
      'difficultyRubric.primaryFilesOrArtifactsTouched',
    ),
    requiresCrossFileReasoning: assertBoolean(
      rubricRaw['requiresCrossFileReasoning'],
      'difficultyRubric.requiresCrossFileReasoning',
    ),
    hasSourceOfTruthConflict: assertBoolean(
      rubricRaw['hasSourceOfTruthConflict'],
      'difficultyRubric.hasSourceOfTruthConflict',
    ),
    hiddenEdgeCaseDepth: assertRubricLevel(
      rubricRaw['hiddenEdgeCaseDepth'],
      'difficultyRubric.hiddenEdgeCaseDepth',
    ),
    hasCompatibilityConstraint: assertBoolean(
      rubricRaw['hasCompatibilityConstraint'],
      'difficultyRubric.hasCompatibilityConstraint',
    ),
    hasRegressionTrap: assertBoolean(
      rubricRaw['hasRegressionTrap'],
      'difficultyRubric.hasRegressionTrap',
    ),
    generalizationRequired: assertRubricLevel(
      rubricRaw['generalizationRequired'],
      'difficultyRubric.generalizationRequired',
    ),
    solutionSpaceAmbiguity: assertRubricLevel(
      rubricRaw['solutionSpaceAmbiguity'],
      'difficultyRubric.solutionSpaceAmbiguity',
    ),
    protectedFileConstraintStrength: assertRubricLevel(
      rubricRaw['protectedFileConstraintStrength'],
      'difficultyRubric.protectedFileConstraintStrength',
    ),
  };

  const difficultyIntent = assertDifficulty(raw['difficultyIntent']);
  if (difficultyIntent !== task.difficulty) {
    throw new Error(
      `pollux-v1 review difficultyIntent mismatch for ${task.id}: ${difficultyIntent}`,
    );
  }
  assertRubricConsistentWithDifficulty(
    task.id,
    difficultyIntent,
    difficultyRubric,
  );

  return {
    reviewer: assertString(raw['reviewer'], 'reviewer'),
    reviewDate: assertString(raw['reviewDate'], 'reviewDate'),
    clarity: assertPass(raw['clarity'], 'clarity'),
    oracleValidity: assertPass(raw['oracleValidity'], 'oracleValidity'),
    difficultyIntent,
    knownAcceptableSolutionShapes: assertStringArray(
      raw['knownAcceptableSolutionShapes'],
      'knownAcceptableSolutionShapes',
    ),
    knownInvalidShortcuts: assertStringArray(
      raw['knownInvalidShortcuts'],
      'knownInvalidShortcuts',
    ),
    biasRisk: assertBiasRisk(raw['biasRisk'], 'biasRisk'),
    biasMitigation: assertString(raw['biasMitigation'], 'biasMitigation'),
    difficultyRubric,
    difficultyRationale: assertString(
      raw['difficultyRationale'],
      'difficultyRationale',
    ),
  };
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

  const task = {
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
  loadPolluxV1TaskReview(task);
  return task;
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

function readFilesAsBenchmarkMap(rootDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const filePath of listFilesRecursive(rootDir)) {
    const relativePath = normalizeRelativePath(
      path.relative(rootDir, filePath),
    );
    files[relativePath] = fs.readFileSync(filePath, 'utf8');
  }
  return files;
}

function mapPolluxV1Difficulty(
  difficulty: PolluxV1Difficulty,
): BenchmarkDifficulty {
  switch (difficulty) {
    case 'easy_control':
      return 'simple';
    case 'medium':
      return 'moderate';
    case 'hard':
      return 'complex';
    default:
      throw new Error(`Unsupported pollux-v1 difficulty: ${difficulty}`);
  }
}

function mapPolluxV1Domain(family: PolluxV1TaskFamily): RealBenchmarkDomain {
  switch (family) {
    case 'cross_file_contract_repair':
    case 'test_intent_edge_bugfix':
    case 'guarded_migration_compatibility':
      return 'multi_file_refactor';
    case 'source_of_truth_conflict_resolution':
      return 'code_search_summarize';
    case 'multi_artifact_consistency':
      return 'read_then_write';
    default:
      throw new Error(`Unsupported pollux-v1 task family: ${family}`);
  }
}

export function adaptPolluxV1TaskToRealBenchmark(
  task: PolluxV1TaskSpec,
): RealBenchmarkTaskSpec {
  return {
    id: task.id,
    difficulty: mapPolluxV1Difficulty(task.difficulty),
    description: `Pollux v1 ${task.difficulty} task in ${task.family}.`,
    files: readFilesAsBenchmarkMap(task.baseDir),
    prompt: task.prompt,
    domain: mapPolluxV1Domain(task.family),
    escalates: task.difficulty === 'hard',
    provenance: {
      sourceType: task.source.startsWith('rewritten_') ? 'adapter' : 'writeup',
      sourceRef: normalizeRelativePath(
        path.relative(REPO_ROOT, path.join(task.taskDir, 'task.yaml')),
      ),
    },
    escalationSignalClass: task.difficulty === 'hard' ? 'risk_gate' : 'none',
    expectedEscalationSignalClasses:
      task.difficulty === 'hard'
        ? ['risk_gate', 'fusion_composite']
        : undefined,
    benchmarkLane: task.difficulty === 'hard' ? 'stress' : 'core',
    positiveFixturePaths: [
      normalizeRelativePath(path.relative(REPO_ROOT, task.solutionPatchPath)),
    ],
    negativeFixturePaths: [
      normalizeRelativePath(path.relative(REPO_ROOT, task.baseDir)),
      normalizeRelativePath(
        path.relative(REPO_ROOT, path.join(task.testsDir, 'fail_to_pass')),
      ),
      normalizeRelativePath(
        path.relative(REPO_ROOT, path.join(task.testsDir, 'pass_to_pass')),
      ),
    ],
    oracle: async (_stdout, workspaceDir) =>
      verifyPolluxV1TaskWorkspaceIsolated(task, workspaceDir).success,
  };
}

export function getPolluxV1BenchmarkTasksByIds(
  taskIds: readonly string[],
): RealBenchmarkTaskSpec[] {
  return taskIds.map((taskId) =>
    adaptPolluxV1TaskToRealBenchmark(loadPolluxV1Task(taskId)),
  );
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

export function verifyPolluxV1TaskWorkspaceIsolated(
  task: PolluxV1TaskSpec,
  candidateWorkspaceDir: string,
  outputDir?: string,
): PolluxV1VerifierResult {
  const verifierWorkspaceDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `${task.id}-verify-`),
  );
  try {
    copyDirectoryContents(candidateWorkspaceDir, verifierWorkspaceDir);
    return verifyPolluxV1TaskWorkspace(task, verifierWorkspaceDir, outputDir);
  } finally {
    fs.rmSync(verifierWorkspaceDir, { recursive: true, force: true });
  }
}
