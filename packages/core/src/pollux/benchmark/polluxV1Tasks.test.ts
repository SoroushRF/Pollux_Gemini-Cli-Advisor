/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  POLLUX_V1_DIFFICULTIES,
  POLLUX_V1_TASK_FAMILIES,
  copyPolluxV1SolutionFiles,
  loadPolluxV1SelectedTaskSet,
  loadPolluxV1Tasks,
  preparePolluxV1Workspace,
  verifyPolluxV1TaskWorkspace,
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

  it('fails fail-to-pass tests on every unmodified base workspace', () => {
    for (const task of loadPolluxV1Tasks()) {
      const workspaceDir = makeWorkspace();
      preparePolluxV1Workspace(task, workspaceDir);

      const result = verifyPolluxV1TaskWorkspace(task, workspaceDir);

      expect(result.success).toBe(false);
      expect(result.failToPassPassed).toBe(false);
    }
  });

  it('passes fail/pass and protected-hash checks for every reference solution', () => {
    for (const task of loadPolluxV1Tasks()) {
      const workspaceDir = makeWorkspace();
      preparePolluxV1Workspace(task, workspaceDir);
      copyPolluxV1SolutionFiles(task, workspaceDir);

      const result = verifyPolluxV1TaskWorkspace(task, workspaceDir);

      expect(result.success).toBe(true);
      expect(result.failToPassPassed).toBe(true);
      expect(result.passToPassPassed).toBe(true);
      expect(result.protectedHashesPassed).toBe(true);
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
