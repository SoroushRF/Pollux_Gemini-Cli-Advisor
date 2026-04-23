/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  REAL_BENCHMARK_SEED_CORPUS,
  PILOT_SENTINEL_TASK_IDS,
} from './realTasks.js';

describe('REAL_BENCHMARK_SEED_CORPUS', () => {
  it('provides a balanced six-task pilot sentinel subset', () => {
    expect(PILOT_SENTINEL_TASK_IDS).toHaveLength(6);

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
      simple: 2,
      moderate: 2,
      complex: 2,
    });
  });

  it('contains at least two escalating and two non-escalating tasks for pilot work', () => {
    const escalating = REAL_BENCHMARK_SEED_CORPUS.filter(
      (task) => task.escalates === true,
    );
    const nonEscalating = REAL_BENCHMARK_SEED_CORPUS.filter(
      (task) => task.escalates !== true,
    );

    expect(escalating.length).toBeGreaterThanOrEqual(2);
    expect(nonEscalating.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps provenance and detector-signal metadata populated for every task', () => {
    for (const task of REAL_BENCHMARK_SEED_CORPUS) {
      expect(task.domain.length).toBeGreaterThan(0);
      expect(task.provenance.sourceRef.length).toBeGreaterThan(0);
      expect(task.provenance.sourceType.length).toBeGreaterThan(0);
      expect(typeof task.oracle).toBe('function');
    }
  });
});
