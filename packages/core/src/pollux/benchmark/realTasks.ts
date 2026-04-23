/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BENCHMARK_CORPUS, type BenchmarkTask } from './tasks.js';
import type { RealBenchmarkTaskSpec } from './realTypes.js';

function getBenchmarkTask(id: string): BenchmarkTask {
  const task = BENCHMARK_CORPUS.find((entry) => entry.id === id);
  if (!task) {
    throw new Error(`Benchmark task not found: ${id}`);
  }
  return task;
}

function withMetadata(
  id: string,
  metadata: Omit<
    RealBenchmarkTaskSpec,
    | 'id'
    | 'difficulty'
    | 'description'
    | 'files'
    | 'prompt'
    | 'oracle'
    | 'escalates'
    | 'resumePrompt'
  >,
): RealBenchmarkTaskSpec {
  return {
    ...getBenchmarkTask(id),
    ...metadata,
  };
}

export const REAL_BENCHMARK_SEED_CORPUS: RealBenchmarkTaskSpec[] = [
  withMetadata('CAL-BM-01-SIMPLE', {
    domain: 'file_authoring',
    provenance: {
      sourceType: 'adapter',
      sourceRef: 'packages/core/src/pollux/benchmark/tasks.ts#CAL-BM-01-SIMPLE',
    },
    escalationSignalClass: 'none',
    positiveFixturePaths: [],
    negativeFixturePaths: [],
  }),
  withMetadata('CAL-BM-02-MODERATE', {
    domain: 'json_yaml_transform',
    provenance: {
      sourceType: 'adapter',
      sourceRef:
        'packages/core/src/pollux/benchmark/tasks.ts#CAL-BM-02-MODERATE',
    },
    escalationSignalClass: 'none',
    positiveFixturePaths: [],
    negativeFixturePaths: [],
  }),
  withMetadata('CAL-BM-03-COMPLEX', {
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'adapter',
      sourceRef:
        'packages/core/src/pollux/benchmark/tasks.ts#CAL-BM-03-COMPLEX',
    },
    escalationSignalClass: 'none',
    positiveFixturePaths: [],
    negativeFixturePaths: [],
  }),
  withMetadata('CAL-BM-04-ESCALATING', {
    domain: 'read_then_write',
    provenance: {
      sourceType: 'adapter',
      sourceRef:
        'packages/core/src/pollux/benchmark/tasks.ts#CAL-BM-04-ESCALATING',
    },
    escalationSignalClass: 'self_report',
    positiveFixturePaths: [],
    negativeFixturePaths: [],
  }),
  {
    id: 'PILOT-BM-05-STATUS-WRITE',
    difficulty: 'simple',
    description:
      'Simple self-report seed task for the live pilot lane. Designed to exercise the current observer-era self-report sensor without changing the production path.',
    files: {},
    prompt:
      'Create a file named advisor-preview.txt containing exactly the word ready. Include this status line verbatim in your first reply: <pollux:status stuck_on="drafting memo" next="write preview"/>.',
    escalates: true,
    domain: 'file_authoring',
    provenance: {
      sourceType: 'writeup',
      sourceRef: 'docs/core/pollux/P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md',
    },
    escalationSignalClass: 'self_report',
    positiveFixturePaths: [],
    negativeFixturePaths: [],
    oracle: (_stdout, workspaceDir) => {
      const previewPath = path.join(workspaceDir, 'advisor-preview.txt');
      if (!fs.existsSync(previewPath)) {
        return false;
      }
      return fs.readFileSync(previewPath, 'utf8').trim() === 'ready';
    },
  },
  {
    id: 'PILOT-BM-06-YAML-TRANSFORM',
    difficulty: 'moderate',
    description:
      'Moderate live-pilot seed task for deterministic JSON to YAML transformation without relying on subjective scoring.',
    files: {
      'service.json': JSON.stringify(
        {
          service: {
            name: 'pollux',
            port: 8080,
            enabled: false,
          },
        },
        null,
        2,
      ),
    },
    prompt:
      'Read service.json and create a file named service.yaml. The YAML must keep service.name as pollux, keep service.port as 8080, and set service.enabled to true. Do not modify service.json.',
    domain: 'json_yaml_transform',
    provenance: {
      sourceType: 'writeup',
      sourceRef: 'docs/core/pollux/P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md',
    },
    escalationSignalClass: 'none',
    positiveFixturePaths: [],
    negativeFixturePaths: [],
    oracle: (_stdout, workspaceDir) => {
      const targetFilePath = path.join(workspaceDir, 'service.yaml');
      if (!fs.existsSync(targetFilePath)) {
        return false;
      }

      const yaml = fs.readFileSync(targetFilePath, 'utf8');
      return (
        /name:\s*pollux/.test(yaml) &&
        /port:\s*8080/.test(yaml) &&
        /enabled:\s*true/.test(yaml)
      );
    },
  },
];

export const PILOT_SENTINEL_TASK_IDS: readonly string[] =
  REAL_BENCHMARK_SEED_CORPUS.map((task) => task.id);

export function getRealBenchmarkSeedTask(
  taskId: string,
): RealBenchmarkTaskSpec {
  const task = REAL_BENCHMARK_SEED_CORPUS.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Real benchmark seed task not found: ${taskId}`);
  }
  return task;
}
