/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_POLLUX_V1_ROOT,
  POLLUX_V1_DIFFICULTIES,
  POLLUX_V1_TASK_FAMILIES,
  adaptPolluxV1TaskToRealBenchmark,
  copyPolluxV1SolutionFiles,
  loadPolluxV1Task,
  loadPolluxV1TaskReview,
  loadPolluxV1SelectedTaskSet,
  loadPolluxV1Tasks,
  preparePolluxV1Workspace,
  verifyPolluxV1TaskWorkspace,
  verifyPolluxV1TaskWorkspaceIsolated,
  type PolluxV1TaskSpec,
} from './polluxV1Tasks.js';

const tempDirs: string[] = [];

function makeWorkspace(): string {
  const workspaceDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pollux-v1-task-'),
  );
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir !== undefined) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

function countBy<T extends string>(
  tasks: PolluxV1TaskSpec[],
  read: (task: PolluxV1TaskSpec) => T,
): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const task of tasks) {
    const key = read(task);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function loadV12TaskIds(): string[] {
  return loadTaskIdsFromSelectedSet('selected-task-set.v1.2.json');
}

function loadV13TaskIds(): string[] {
  return loadTaskIdsFromSelectedSet('selected-task-set.v1.3.json');
}

function loadTaskIdsFromSelectedSet(fileName: string): string[] {
  const selectedPath = path.join(DEFAULT_POLLUX_V1_ROOT, fileName);
  const parsed = JSON.parse(fs.readFileSync(selectedPath, 'utf8')) as {
    taskIds: string[];
  };
  return parsed.taskIds;
}

function loadV12Tasks(): PolluxV1TaskSpec[] {
  return loadV12TaskIds().map((taskId) => loadPolluxV1Task(taskId));
}

function loadV13Tasks(): PolluxV1TaskSpec[] {
  return loadV13TaskIds().map((taskId) => loadPolluxV1Task(taskId));
}

function readSelectedSetStatus(fileName: string): string {
  const selectedPath = path.join(DEFAULT_POLLUX_V1_ROOT, fileName);
  const parsed = JSON.parse(fs.readFileSync(selectedPath, 'utf8')) as {
    status: string;
  };
  return parsed.status;
}

describe('pollux-v1 stratified benchmark corpus', () => {
  it('loads the frozen 15-task A/E/FD selected set', () => {
    const selected = loadPolluxV1SelectedTaskSet();
    expect(selected.benchmarkId).toBe('pollux-v1');
    expect(selected.status).toBe('frozen');
    expect(selected.taskCount).toBe(15);
    expect(selected.repeatsPerTrack).toBe(5);
    expect(selected.tracks).toEqual(['A', 'E', 'FD']);
    expect(selected.taskIds).toHaveLength(15);
    expect(selected.taskIds).not.toContain('PILOT-BM-19-MULTI-REFACTOR');
  });

  it('keeps exactly one easy, medium, and hard task in each family', () => {
    const tasks = loadPolluxV1Tasks();
    expect(tasks).toHaveLength(15);

    expect(countBy(tasks, (task) => task.family)).toEqual({
      cross_file_contract_repair: 3,
      test_intent_edge_bugfix: 3,
      guarded_migration_compatibility: 3,
      source_of_truth_conflict_resolution: 3,
      multi_artifact_consistency: 3,
    });

    expect(countBy(tasks, (task) => task.difficulty)).toEqual({
      easy_control: 5,
      medium: 5,
      hard: 5,
    });

    for (const family of POLLUX_V1_TASK_FAMILIES) {
      const familyDifficulties = tasks
        .filter((task) => task.family === family)
        .map((task) => task.difficulty)
        .sort();
      expect(familyDifficulties).toEqual([...POLLUX_V1_DIFFICULTIES].sort());
    }
  });

  it('keeps task artifacts complete for every final task', () => {
    for (const task of loadPolluxV1Tasks()) {
      expect(fs.existsSync(path.join(task.taskDir, 'task.yaml'))).toBe(true);
      expect(fs.existsSync(task.baseDir)).toBe(true);
      expect(fs.existsSync(path.join(task.testsDir, 'fail_to_pass'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(task.testsDir, 'pass_to_pass'))).toBe(
        true,
      );
      expect(fs.existsSync(task.solutionDir)).toBe(true);
      expect(fs.existsSync(task.solutionPatchPath)).toBe(true);
      expect(fs.existsSync(task.reviewPath)).toBe(true);
      expect(fs.existsSync(task.notesPath)).toBe(true);
      expect(task.prompt).not.toMatch(/Pollux|advisor|FD|Flash|Pro/);
    }
  });

  it('validates rubric metadata for every final task review', () => {
    for (const task of loadPolluxV1Tasks()) {
      const review = loadPolluxV1TaskReview(task);

      expect(review.difficultyIntent).toBe(task.difficulty);
      expect(review.difficultyRationale.length).toBeGreaterThan(20);
      expect(
        review.difficultyRubric.primaryFilesOrArtifactsTouched,
      ).toBeGreaterThan(0);
    }
  });

  it('rejects malformed review rubric metadata', () => {
    const task = loadPolluxV1Tasks()[0];
    const review = loadPolluxV1TaskReview(task);
    const reviewPath = path.join(makeWorkspace(), 'review.json');
    fs.writeFileSync(
      reviewPath,
      JSON.stringify({
        ...review,
        difficultyRationale: '',
        difficultyRubric: {
          ...review.difficultyRubric,
          hiddenEdgeCaseDepth: 'extreme',
        },
      }),
    );

    expect(() =>
      loadPolluxV1TaskReview({
        id: task.id,
        difficulty: task.difficulty,
        reviewPath,
      }),
    ).toThrow(/invalid level|difficultyRationale/);
  });

  it('prepares agent workspaces without hidden tests', () => {
    const task = loadPolluxV1Tasks()[0];
    const workspaceDir = makeWorkspace();

    preparePolluxV1Workspace(task, workspaceDir);

    expect(fs.existsSync(path.join(workspaceDir, 'tests'))).toBe(false);
  });

  it('fails fail-to-pass tests on every unmodified base workspace', () => {
    for (const task of loadPolluxV1Tasks()) {
      const workspaceDir = makeWorkspace();
      preparePolluxV1Workspace(task, workspaceDir);

      const result = verifyPolluxV1TaskWorkspace(task, workspaceDir);

      expect(result.success).toBe(false);
      expect(result.failToPassPassed).toBe(false);
    }
  });

  it('isolated verifier does not copy hidden tests into the candidate workspace', () => {
    const task = loadPolluxV1Tasks()[0];
    const workspaceDir = makeWorkspace();
    preparePolluxV1Workspace(task, workspaceDir);

    const result = verifyPolluxV1TaskWorkspaceIsolated(task, workspaceDir);

    expect(result.success).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, 'tests'))).toBe(false);
  });

  it('adapted real-benchmark oracle keeps hidden tests out of the live workspace', async () => {
    const task = loadPolluxV1Tasks()[0];
    const workspaceDir = makeWorkspace();
    preparePolluxV1Workspace(task, workspaceDir);
    copyPolluxV1SolutionFiles(task, workspaceDir);
    const adapted = adaptPolluxV1TaskToRealBenchmark(task);

    await expect(adapted.oracle('', workspaceDir)).resolves.toBe(true);
    expect(fs.existsSync(path.join(workspaceDir, 'tests'))).toBe(false);
  });

  it('passes fail/pass and protected-hash checks for every reference solution', () => {
    for (const task of loadPolluxV1Tasks()) {
      const workspaceDir = makeWorkspace();
      preparePolluxV1Workspace(task, workspaceDir);
      copyPolluxV1SolutionFiles(task, workspaceDir);

      const result = verifyPolluxV1TaskWorkspace(task, workspaceDir);

      if (!result.success) {
        throw new Error(
          [
            `${task.id} reference solution failed`,
            `failToPass=${result.failToPassPassed}`,
            `passToPass=${result.passToPassPassed}`,
            `protectedHashes=${result.protectedHashesPassed}`,
            result.failToPass.stderr,
            result.passToPass.stderr,
          ].join('\n'),
        );
      }
      expect(result.success).toBe(true);
      expect(result.failToPassPassed).toBe(true);
      expect(result.passToPassPassed).toBe(true);
      expect(result.protectedHashesPassed).toBe(true);
    }
  });

  it('isolated verifier passes every reference solution without mutating it', () => {
    for (const task of loadPolluxV1Tasks()) {
      const workspaceDir = makeWorkspace();
      preparePolluxV1Workspace(task, workspaceDir);
      copyPolluxV1SolutionFiles(task, workspaceDir);

      const result = verifyPolluxV1TaskWorkspaceIsolated(task, workspaceDir);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(workspaceDir, 'tests'))).toBe(false);
    }
  });

  it('fails protected-hash checks when a protected input changes', () => {
    const task = loadPolluxV1Tasks().find(
      (entry) => entry.id === 'pollux-v1-source-truth-easy-01',
    );
    if (task === undefined) {
      throw new Error('pollux-v1-source-truth-easy-01 fixture is missing');
    }
    const workspaceDir = makeWorkspace();
    preparePolluxV1Workspace(task, workspaceDir);
    copyPolluxV1SolutionFiles(task, workspaceDir);
    fs.writeFileSync(
      path.join(workspaceDir, 'docs', 'runtime.md'),
      'Runtime mode is live now.\n',
      'utf8',
    );

    const result = verifyPolluxV1TaskWorkspace(task, workspaceDir);

    expect(result.failToPassPassed).toBe(true);
    expect(result.passToPassPassed).toBe(false);
    expect(result.protectedHashesPassed).toBe(false);
    expect(result.changedProtectedFiles).toContain('docs/runtime.md');
  });
});

describe('pollux-v1.2 repaired benchmark candidate set', () => {
  it('defines 15 calibration candidates with brutal hard slots replacing weak hard tasks', () => {
    const tasks = loadV12Tasks();

    expect(tasks).toHaveLength(15);
    expect(countBy(tasks, (task) => task.family)).toEqual({
      cross_file_contract_repair: 3,
      test_intent_edge_bugfix: 3,
      guarded_migration_compatibility: 3,
      source_of_truth_conflict_resolution: 3,
      multi_artifact_consistency: 3,
    });
    expect(countBy(tasks, (task) => task.difficulty)).toEqual({
      easy_control: 5,
      medium: 5,
      hard: 5,
    });
    expect(
      tasks.filter((task) => task.difficulty === 'hard').map((task) => task.id),
    ).toEqual([
      'pollux-v1-cross-contract-brutal-01',
      'pollux-v1-test-intent-brutal-01',
      'pollux-v1-guarded-migration-brutal-01',
      'pollux-v1-source-truth-brutal-01',
      'pollux-v1-multi-artifact-brutal-01',
    ]);
  });

  it('keeps v1.2 live workspaces task-local for npm test', () => {
    for (const task of loadV12Tasks()) {
      expect(fs.existsSync(path.join(task.baseDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(task.baseDir, 'tests_public'))).toBe(true);

      const workspaceDir = makeWorkspace();
      preparePolluxV1Workspace(task, workspaceDir);
      const prefix = spawnSync(
        process.platform === 'win32' ? 'cmd.exe' : 'npm',
        process.platform === 'win32'
          ? ['/d', '/s', '/c', 'npm.cmd prefix']
          : ['prefix'],
        {
          cwd: workspaceDir,
          encoding: 'utf8',
        },
      );

      expect(prefix.status).toBe(0);
      expect(path.resolve(prefix.stdout.trim())).toBe(
        path.resolve(workspaceDir),
      );
    }
  });

  it('fails all brutal hard base workspaces and passes their reference solutions', () => {
    const brutalTasks = loadV12Tasks().filter((task) =>
      task.id.endsWith('-brutal-01'),
    );
    expect(brutalTasks).toHaveLength(5);

    for (const task of brutalTasks) {
      const baseWorkspace = makeWorkspace();
      preparePolluxV1Workspace(task, baseWorkspace);
      const baseResult = verifyPolluxV1TaskWorkspace(task, baseWorkspace);
      expect(baseResult.success).toBe(false);
      expect(baseResult.failToPassPassed).toBe(false);

      const solutionWorkspace = makeWorkspace();
      preparePolluxV1Workspace(task, solutionWorkspace);
      copyPolluxV1SolutionFiles(task, solutionWorkspace);
      const solutionResult = verifyPolluxV1TaskWorkspace(
        task,
        solutionWorkspace,
      );

      if (!solutionResult.success) {
        throw new Error(
          [
            `${task.id} brutal reference solution failed`,
            `failToPass=${solutionResult.failToPassPassed}`,
            `passToPass=${solutionResult.passToPassPassed}`,
            `protectedHashes=${solutionResult.protectedHashesPassed}`,
            solutionResult.failToPass.stderr,
            solutionResult.passToPass.stderr,
          ].join('\n'),
        );
      }
      expect(solutionResult.success).toBe(true);
    }
  });

  it('rejects fixture-specific CSV shortcuts on the brutal parser task', () => {
    const task = loadPolluxV1Task('pollux-v1-test-intent-brutal-01');
    const workspaceDir = makeWorkspace();
    preparePolluxV1Workspace(task, workspaceDir);
    fs.writeFileSync(
      path.join(workspaceDir, 'src', 'csv.mjs'),
      [
        'export function parseCsvLine(line) {',
        "  if (line === 'alpha,\"beta,gamma\",,delta') return ['alpha', 'beta,gamma', '', 'delta'];",
        '  return line.split(",");',
        '}',
        '',
      ].join('\n'),
    );

    const result = verifyPolluxV1TaskWorkspace(task, workspaceDir);

    expect(result.success).toBe(false);
  });
});

describe('pollux-v1.3 hardened medium/hard candidate set', () => {
  const retiredV12MediumHardIds = [
    'pollux-v1-cross-contract-medium-01',
    'pollux-v1-test-intent-medium-01',
    'pollux-v1-guarded-migration-medium-01',
    'pollux-v1-source-truth-medium-01',
    'pollux-v1-multi-artifact-medium-01',
    'pollux-v1-cross-contract-brutal-01',
    'pollux-v1-test-intent-brutal-01',
    'pollux-v1-guarded-migration-brutal-01',
    'pollux-v1-source-truth-brutal-01',
    'pollux-v1-multi-artifact-brutal-01',
  ];

  it('defines a pending 15-task v1.3 set with new medium/hard IDs', () => {
    expect(readSelectedSetStatus('selected-task-set.v1.3.json')).toBe(
      'pending_ae_calibration',
    );

    const tasks = loadV13Tasks();
    const taskIds = tasks.map((task) => task.id);

    expect(tasks).toHaveLength(15);
    expect(countBy(tasks, (task) => task.family)).toEqual({
      cross_file_contract_repair: 3,
      test_intent_edge_bugfix: 3,
      guarded_migration_compatibility: 3,
      source_of_truth_conflict_resolution: 3,
      multi_artifact_consistency: 3,
    });
    expect(countBy(tasks, (task) => task.difficulty)).toEqual({
      easy_control: 5,
      medium: 5,
      hard: 5,
    });

    for (const retiredTaskId of retiredV12MediumHardIds) {
      expect(taskIds).not.toContain(retiredTaskId);
    }
    expect(
      taskIds.filter((taskId) => taskId.endsWith('-medium-02')),
    ).toHaveLength(5);
    expect(
      taskIds.filter((taskId) => taskId.endsWith('-brutal-02')),
    ).toHaveLength(5);
  });

  it('keeps every v1.3 task task-local with public tests and real medium/hard patches', () => {
    for (const task of loadV13Tasks()) {
      expect(fs.existsSync(path.join(task.baseDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(task.baseDir, 'tests_public'))).toBe(true);

      if (task.difficulty !== 'easy_control') {
        const patch = fs.readFileSync(task.solutionPatchPath, 'utf8');
        expect(patch).toContain('diff --git');
        expect(patch).not.toMatch(/placeholder/i);
      }

      const workspaceDir = makeWorkspace();
      preparePolluxV1Workspace(task, workspaceDir);
      const prefix = spawnSync(
        process.platform === 'win32' ? 'cmd.exe' : 'npm',
        process.platform === 'win32'
          ? ['/d', '/s', '/c', 'npm.cmd prefix']
          : ['prefix'],
        {
          cwd: workspaceDir,
          encoding: 'utf8',
        },
      );

      expect(prefix.status).toBe(0);
      expect(path.resolve(prefix.stdout.trim())).toBe(
        path.resolve(workspaceDir),
      );
      expect(fs.existsSync(path.join(workspaceDir, 'tests'))).toBe(false);
    }
  });

  it('fails every v1.3 base workspace and passes every reference solution', () => {
    for (const task of loadV13Tasks()) {
      const baseWorkspace = makeWorkspace();
      preparePolluxV1Workspace(task, baseWorkspace);
      const baseResult = verifyPolluxV1TaskWorkspace(task, baseWorkspace);
      expect(baseResult.success).toBe(false);
      expect(baseResult.failToPassPassed).toBe(false);

      const solutionWorkspace = makeWorkspace();
      preparePolluxV1Workspace(task, solutionWorkspace);
      copyPolluxV1SolutionFiles(task, solutionWorkspace);
      const solutionResult = verifyPolluxV1TaskWorkspace(
        task,
        solutionWorkspace,
      );

      if (!solutionResult.success) {
        throw new Error(
          [
            `${task.id} v1.3 reference solution failed`,
            `failToPass=${solutionResult.failToPassPassed}`,
            `passToPass=${solutionResult.passToPassPassed}`,
            `protectedHashes=${solutionResult.protectedHashesPassed}`,
            solutionResult.failToPass.stderr,
            solutionResult.passToPass.stderr,
          ].join('\n'),
        );
      }
      expect(solutionResult.success).toBe(true);
    }
  });

  it('requires v1.3 medium/hard tasks to include hidden generalization checks', () => {
    const mediumHardTasks = loadV13Tasks().filter(
      (task) => task.difficulty !== 'easy_control',
    );
    expect(mediumHardTasks).toHaveLength(10);

    for (const task of mediumHardTasks) {
      const failToPass = fs.readFileSync(
        path.join(task.testsDir, 'fail_to_pass', 'check.mjs'),
        'utf8',
      );
      expect(failToPass).toMatch(
        /custom|fixture|second|auditLabels|explainTransition|compatLegacyGate|compatibilityAliases|resolvePolicy|mergeConfig|normalizeRecord|parseRecordLine|selectLaunchCandidate/,
      );
    }
  });

  it('keeps hard public smoke tests from revealing avoidable hidden answers', () => {
    for (const task of loadV13Tasks().filter(
      (entry) => entry.difficulty === 'hard',
    )) {
      const publicTests = listFilesRecursive(
        path.join(task.baseDir, 'tests_public'),
      )
        .map((filePath) => fs.readFileSync(filePath, 'utf8'))
        .join('\n');

      if (task.id === 'pollux-v1-multi-artifact-brutal-02') {
        expect(publicTests).not.toContain('atlas');
      }
      if (task.id === 'pollux-v1-cross-contract-brutal-02') {
        expect(publicTests).not.toContain('usr:');
        expect(publicTests).not.toContain('member:');
      }
      if (task.id === 'pollux-v1-test-intent-brutal-02') {
        expect(publicTests).not.toContain('ada\\|lovelace');
      }
    }
  });
});

function listFilesRecursive(dir: string): string[] {
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
