/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PILOT_SENTINEL_TASK_IDS,
  REAL_BENCHMARK_SEED_CORPUS,
  SHARED_REAL_NEGATIVE_FIXTURE_PATHS,
  SHARED_REAL_POSITIVE_FIXTURE_PATH,
} from './realTasks.js';
import { REAL_BENCHMARK_REQUIRED_DOMAINS } from './realTypes.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '..', '..', '..', '..', '..');

function resolveFixturePath(relativePath: string): string {
  return path.resolve(REPO_ROOT, relativePath);
}

describe('REAL_BENCHMARK_SEED_CORPUS', () => {
  it('keeps the pilot sentinel subset fixed to the smoke-task cohort', () => {
    expect(PILOT_SENTINEL_TASK_IDS).toEqual([
      'CAL-BM-01-SIMPLE',
      'CAL-BM-02-MODERATE',
      'CAL-BM-03-COMPLEX',
      'CAL-BM-04-ESCALATING',
      'PILOT-BM-05-STATUS-WRITE',
      'PILOT-BM-06-YAML-TRANSFORM',
    ]);
  });

  it('provides the methodology-sized 24-task corpus', () => {
    expect(REAL_BENCHMARK_SEED_CORPUS).toHaveLength(24);

    const counts = REAL_BENCHMARK_SEED_CORPUS.reduce<
      Record<'simple' | 'moderate' | 'complex', number>
    >(
      (accumulator, task) => {
        accumulator[task.difficulty] += 1;
        return accumulator;
      },
      {
        simple: 0,
        moderate: 0,
        complex: 0,
      },
    );

    expect(counts).toEqual({
      simple: 8,
      moderate: 8,
      complex: 8,
    });
  });

  it('keeps the escalation split on both sides of the minimum threshold', () => {
    const escalating = REAL_BENCHMARK_SEED_CORPUS.filter(
      (task) => task.escalates === true,
    );
    const nonEscalating = REAL_BENCHMARK_SEED_CORPUS.filter(
      (task) => task.escalates !== true,
    );

    expect(escalating).toHaveLength(8);
    expect(nonEscalating).toHaveLength(16);
  });

  it('covers every required domain exactly once or more', () => {
    const domainCoverage = [
      ...new Set(REAL_BENCHMARK_SEED_CORPUS.map((task) => task.domain)),
    ].sort();

    expect(domainCoverage).toEqual([...REAL_BENCHMARK_REQUIRED_DOMAINS].sort());
  });

  it('keeps provenance and oracle metadata populated for every task', () => {
    for (const task of REAL_BENCHMARK_SEED_CORPUS) {
      expect(['core', 'stress', 'canary']).toContain(task.benchmarkLane);
      expect(task.domain.length).toBeGreaterThan(0);
      expect(task.provenance.sourceRef.length).toBeGreaterThan(0);
      expect(task.provenance.sourceType.length).toBeGreaterThan(0);
      expect(typeof task.oracle).toBe('function');
    }
  });

  it('assigns the milestone 1 lane mapping to the sentinel cohort', () => {
    const laneByTaskId = Object.fromEntries(
      REAL_BENCHMARK_SEED_CORPUS.map((task) => [task.id, task.benchmarkLane]),
    );

    expect(laneByTaskId['CAL-BM-01-SIMPLE']).toBe('core');
    expect(laneByTaskId['CAL-BM-02-MODERATE']).toBe('core');
    expect(laneByTaskId['CAL-BM-03-COMPLEX']).toBe('stress');
    expect(laneByTaskId['CAL-BM-04-ESCALATING']).toBe('canary');
    expect(laneByTaskId['PILOT-BM-05-STATUS-WRITE']).toBe('canary');
    expect(laneByTaskId['PILOT-BM-06-YAML-TRANSFORM']).toBe('core');
  });

  it('defaults self-report tasks to canary and non-self-report tasks to core unless explicitly overridden', () => {
    const selfReportTask = REAL_BENCHMARK_SEED_CORPUS.find(
      (task) => task.id === 'PILOT-BM-09-SEARCH-SUMMARY',
    );
    const nonSelfReportTask = REAL_BENCHMARK_SEED_CORPUS.find(
      (task) => task.id === 'PILOT-BM-07-FILE-README',
    );
    const explicitStressTask = REAL_BENCHMARK_SEED_CORPUS.find(
      (task) => task.id === 'CAL-BM-03-COMPLEX',
    );

    expect(selfReportTask?.escalationSignalClass).toBe('self_report');
    expect(selfReportTask?.benchmarkLane).toBe('canary');
    expect(nonSelfReportTask?.escalationSignalClass).toBe('none');
    expect(nonSelfReportTask?.benchmarkLane).toBe('core');
    expect(explicitStressTask?.benchmarkLane).toBe('stress');
  });

  it('attaches one positive fixture and three negative fixtures to every task', () => {
    for (const task of REAL_BENCHMARK_SEED_CORPUS) {
      expect(task.positiveFixturePaths).toHaveLength(1);
      expect(task.negativeFixturePaths).toHaveLength(3);

      for (const fixturePath of [
        ...task.positiveFixturePaths,
        ...task.negativeFixturePaths,
      ]) {
        expect(fixturePath.length).toBeGreaterThan(0);
        expect(fs.existsSync(resolveFixturePath(fixturePath))).toBe(true);
      }
    }

    expect(
      fs.existsSync(resolveFixturePath(SHARED_REAL_POSITIVE_FIXTURE_PATH)),
    ).toBe(true);
    for (const fixturePath of SHARED_REAL_NEGATIVE_FIXTURE_PATHS) {
      expect(fs.existsSync(resolveFixturePath(fixturePath))).toBe(true);
    }
  });
});
