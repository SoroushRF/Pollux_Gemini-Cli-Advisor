/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BENCHMARK_CORPUS, type BenchmarkTask } from './tasks.js';
import type { RealBenchmarkLane, RealBenchmarkTaskSpec } from './realTypes.js';

export const SHARED_REAL_POSITIVE_FIXTURE_PATH =
  'packages/core/src/pollux/benchmark/real-fixtures/shared/positive-ready.txt';
export const SHARED_REAL_NEGATIVE_FIXTURE_PATHS = [
  'packages/core/src/pollux/benchmark/real-fixtures/shared/negative-empty.txt',
  'packages/core/src/pollux/benchmark/real-fixtures/shared/negative-wrong.txt',
  'packages/core/src/pollux/benchmark/real-fixtures/shared/negative-missing-marker.txt',
] as const;

const DOC_DOCTRINE = 'docs/core/pollux/P4-08_REAL_BENCHMARK_DOCTRINE.md';
const DOC_PLAYBOOK =
  'docs/core/pollux/P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md';
const DOC_MEASUREMENT =
  'docs/core/pollux/P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md';
const DOC_METHODOLOGY = 'docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md';
const DOC_PREREG =
  'docs/core/pollux/P4-11_REAL_BENCHMARK_PREREGISTRATION_TEMPLATE.md';

type RealTaskDefinition = Omit<
  RealBenchmarkTaskSpec,
  'benchmarkLane' | 'positiveFixturePaths' | 'negativeFixturePaths'
> & {
  benchmarkLane?: RealBenchmarkLane;
};

const BENCHMARK_LANE_OVERRIDES: Readonly<Record<string, RealBenchmarkLane>> = {
  'CAL-BM-01-SIMPLE': 'core',
  'CAL-BM-02-MODERATE': 'core',
  'CAL-BM-03-COMPLEX': 'stress',
  'CAL-BM-04-ESCALATING': 'canary',
  'PILOT-BM-05-STATUS-WRITE': 'canary',
  'PILOT-BM-06-YAML-TRANSFORM': 'core',
};

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
    RealTaskDefinition,
    | 'id'
    | 'difficulty'
    | 'description'
    | 'files'
    | 'prompt'
    | 'oracle'
    | 'escalates'
    | 'resumePrompt'
  >,
): RealTaskDefinition {
  return {
    ...getBenchmarkTask(id),
    ...metadata,
  };
}

function withSharedFixtures(task: RealTaskDefinition): RealBenchmarkTaskSpec {
  return {
    ...task,
    benchmarkLane:
      task.benchmarkLane ??
      BENCHMARK_LANE_OVERRIDES[task.id] ??
      (task.escalationSignalClass === 'self_report' ? 'canary' : 'core'),
    positiveFixturePaths: [SHARED_REAL_POSITIVE_FIXTURE_PATH],
    negativeFixturePaths: [...SHARED_REAL_NEGATIVE_FIXTURE_PATHS],
  };
}

function readWorkspaceFile(
  workspaceDir: string,
  relativePath: string,
): string | null {
  const filePath = path.join(workspaceDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeOracleText(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function createExactFileOracle(
  fileName: string,
  expectedText: string,
): BenchmarkTask['oracle'] {
  return (_stdout, workspaceDir) => {
    const content = readWorkspaceFile(workspaceDir, fileName);
    return (
      content !== null &&
      normalizeOracleText(content) === normalizeOracleText(expectedText)
    );
  };
}

function createYamlContainsOracle(
  fileName: string,
  requiredChecks: Array<string | RegExp>,
): BenchmarkTask['oracle'] {
  return (_stdout, workspaceDir) => {
    const yaml = readWorkspaceFile(workspaceDir, fileName);
    if (yaml === null) {
      return false;
    }

    return requiredChecks.every((check) =>
      typeof check === 'string' ? yaml.includes(check) : check.test(yaml),
    );
  };
}

function createSummaryOracle(
  fileName: string,
  requiredPhrases: string[],
): BenchmarkTask['oracle'] {
  return (_stdout, workspaceDir) => {
    const summary = readWorkspaceFile(workspaceDir, fileName);
    if (summary === null) {
      return false;
    }

    const normalized = summary.toLowerCase();
    return requiredPhrases.every((phrase) =>
      normalized.includes(phrase.toLowerCase()),
    );
  };
}

function createMultiFileRefactorOracle(params: {
  fileChecks: Array<{
    fileName: string;
    required: RegExp[];
    forbidden?: RegExp[];
  }>;
  markerFileName: string;
  markerText: string;
}): BenchmarkTask['oracle'] {
  return (_stdout, workspaceDir) => {
    for (const check of params.fileChecks) {
      const content = readWorkspaceFile(workspaceDir, check.fileName);
      if (content === null) {
        return false;
      }
      if (!check.required.every((pattern) => pattern.test(content))) {
        return false;
      }
      if (check.forbidden?.some((pattern) => pattern.test(content))) {
        return false;
      }
    }

    const marker = readWorkspaceFile(workspaceDir, params.markerFileName);
    return marker !== null && marker.trim() === params.markerText.trim();
  };
}

const CORE_REAL_BENCHMARK_TASK_DEFINITIONS: RealTaskDefinition[] = [
  withMetadata('CAL-BM-01-SIMPLE', {
    domain: 'file_authoring',
    provenance: {
      sourceType: 'adapter',
      sourceRef: 'packages/core/src/pollux/benchmark/tasks.ts#CAL-BM-01-SIMPLE',
    },
    escalationSignalClass: 'none',
  }),
  withMetadata('CAL-BM-02-MODERATE', {
    domain: 'json_yaml_transform',
    provenance: {
      sourceType: 'adapter',
      sourceRef:
        'packages/core/src/pollux/benchmark/tasks.ts#CAL-BM-02-MODERATE',
    },
    escalationSignalClass: 'none',
  }),
  withMetadata('CAL-BM-03-COMPLEX', {
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'adapter',
      sourceRef:
        'packages/core/src/pollux/benchmark/tasks.ts#CAL-BM-03-COMPLEX',
    },
    escalationSignalClass: 'none',
  }),
  withMetadata('CAL-BM-04-ESCALATING', {
    domain: 'read_then_write',
    provenance: {
      sourceType: 'adapter',
      sourceRef:
        'packages/core/src/pollux/benchmark/tasks.ts#CAL-BM-04-ESCALATING',
    },
    escalationSignalClass: 'self_report',
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

const ADDITIONAL_REAL_BENCHMARK_TASK_DEFINITIONS: RealTaskDefinition[] = [
  {
    id: 'PILOT-BM-07-FILE-README',
    difficulty: 'simple',
    description:
      'Simple file authoring task that writes a short release note to a single file.',
    files: {},
    prompt:
      'Create a file named release-note.txt containing exactly: Pollux ready for pilot.',
    domain: 'file_authoring',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_PLAYBOOK}#seed-corpus-expansion`,
    },
    escalationSignalClass: 'none',
    oracle: createExactFileOracle(
      'release-note.txt',
      'Pollux ready for pilot.',
    ),
  },
  {
    id: 'PILOT-BM-08-SHELL-PIPE',
    difficulty: 'simple',
    description:
      'Simple shell-tool-chain task that sorts a short list into a canonical output file.',
    files: {
      'input.txt': 'gamma\nalpha\nbeta\n',
    },
    prompt:
      'Use shell commands to sort input.txt and write the result to sorted.txt with one item per line. Do not change input.txt.',
    domain: 'shell_tool_chain',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_METHODOLOGY}#domain-coverage`,
    },
    escalationSignalClass: 'none',
    oracle: createExactFileOracle('sorted.txt', 'alpha\nbeta\ngamma'),
  },
  {
    id: 'PILOT-BM-09-SEARCH-SUMMARY',
    difficulty: 'simple',
    description:
      'Simple code-search-and-summarize task that extracts signals from two small notes files.',
    files: {
      'docs/alpha.txt': 'Alpha handles onboarding.\n',
      'docs/beta.txt': 'Beta handles billing.\n',
    },
    prompt:
      'Search the workspace and create summary.txt that mentions alpha, onboarding, beta, and billing. Include this status line verbatim in your first reply: <pollux:status stuck_on="reviewing repo notes" next="write summary"/>.',
    escalates: true,
    domain: 'code_search_summarize',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_DOCTRINE}#observer-era-signals`,
    },
    escalationSignalClass: 'self_report',
    oracle: createSummaryOracle('summary.txt', [
      'alpha',
      'onboarding',
      'beta',
      'billing',
    ]),
  },
  {
    id: 'PILOT-BM-10-READ-NOTE',
    difficulty: 'simple',
    description:
      'Simple read-then-write task that turns a clue file into an exact answer file.',
    files: {
      'clue.txt': 'The answer is cobalt.\n',
    },
    prompt:
      'Read clue.txt and create answer.txt containing exactly cobalt. Include this status line verbatim in your first reply: <pollux:status stuck_on="checking clue" next="write answer"/>.',
    escalates: true,
    domain: 'read_then_write',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_MEASUREMENT}#pilot-simple-seed`,
    },
    escalationSignalClass: 'self_report',
    oracle: createExactFileOracle('answer.txt', 'cobalt'),
  },
  {
    id: 'PILOT-BM-11-FILE-LOG',
    difficulty: 'simple',
    description:
      'Simple file authoring task that writes a stable sentinel log line.',
    files: {},
    prompt:
      'Create a file named status.log containing exactly: pilot sentinel complete.',
    domain: 'file_authoring',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_PLAYBOOK}#pilot-sentinel`,
    },
    escalationSignalClass: 'none',
    oracle: createExactFileOracle('status.log', 'pilot sentinel complete.'),
  },
  {
    id: 'PILOT-BM-12-JSON-YAML-MICRO',
    difficulty: 'simple',
    description:
      'Simple JSON to YAML transformation with one boolean flip and no extra fields.',
    files: {
      'config.json': JSON.stringify(
        {
          service: {
            name: 'pollux',
            enabled: false,
          },
        },
        null,
        2,
      ),
    },
    prompt:
      'Read config.json and create config.yaml. Keep service.name as pollux and set service.enabled to true.',
    domain: 'json_yaml_transform',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_MEASUREMENT}#yaml-micro-transform`,
    },
    escalationSignalClass: 'none',
    oracle: createYamlContainsOracle('config.yaml', [
      /name:\s*pollux/,
      /enabled:\s*true/,
    ]),
  },
  {
    id: 'PILOT-BM-13-MULTI-REFACTOR',
    difficulty: 'moderate',
    description:
      'Moderate multi-file refactor that renames a helper across two source files and records completion.',
    files: {
      'src/legacy-a.js': 'export function oldAlpha() { return "alpha"; }\n',
      'src/legacy-b.js':
        'import { oldAlpha } from "./legacy-a.js";\nexport const result = oldAlpha();\n',
    },
    prompt:
      'Rename oldAlpha to newAlpha in both source files and create refactor-done.txt containing exactly done. Include this status line verbatim in your first reply: <pollux:status stuck_on="renaming helper" next="update imports"/>.',
    escalates: true,
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_METHODOLOGY}#multi-file-refactor`,
    },
    escalationSignalClass: 'self_report',
    oracle: createMultiFileRefactorOracle({
      fileChecks: [
        {
          fileName: 'src/legacy-a.js',
          required: [/newAlpha/],
          forbidden: [/oldAlpha/],
        },
        {
          fileName: 'src/legacy-b.js',
          required: [/newAlpha/],
          forbidden: [/oldAlpha/],
        },
      ],
      markerFileName: 'refactor-done.txt',
      markerText: 'done',
    }),
  },
  {
    id: 'PILOT-BM-14-SHELL-CHAIN',
    difficulty: 'moderate',
    description:
      'Moderate shell-tool-chain task that reduces a short list into a count summary.',
    files: {
      'items.txt': 'pear\napple\npear\nbanana\n',
    },
    prompt:
      'Use shell commands to count the unique values in items.txt and write counts.txt containing exactly unique=3 total=4.',
    domain: 'shell_tool_chain',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_PLAYBOOK}#shell-chain`,
    },
    escalationSignalClass: 'none',
    oracle: createExactFileOracle('counts.txt', 'unique=3 total=4'),
  },
  {
    id: 'PILOT-BM-15-SEARCH-SUMMARY',
    difficulty: 'moderate',
    description:
      'Moderate code search and summarize task that blends notes from three files.',
    files: {
      'notes/plan.md': 'The plan mentions adapter telemetry and task counts.\n',
      'notes/report.md':
        'The report mentions pricing snapshot and fairness pins.\n',
      'notes/todo.md': 'Need docs, tests, and corpus expansion.\n',
    },
    prompt:
      'Search the workspace and create summary.txt that mentions adapter, pricing, fairness, tests, and corpus expansion. Include this status line verbatim in your first reply: <pollux:status stuck_on="synthesizing notes" next="write summary"/>.',
    escalates: true,
    domain: 'code_search_summarize',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_DOCTRINE}#search-summarize`,
    },
    escalationSignalClass: 'self_report',
    oracle: createSummaryOracle('summary.txt', [
      'adapter',
      'pricing',
      'fairness',
      'tests',
      'corpus expansion',
    ]),
  },
  {
    id: 'PILOT-BM-16-READ-WRITE',
    difficulty: 'moderate',
    description:
      'Moderate read-then-write task that combines two clues into a single answer file.',
    files: {
      'clue.txt': 'First: orange\nSecond: violet\n',
    },
    prompt:
      'Read clue.txt and create answer.txt containing exactly orange-violet.',
    domain: 'read_then_write',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_MEASUREMENT}#read-then-write`,
    },
    escalationSignalClass: 'none',
    oracle: createExactFileOracle('answer.txt', 'orange-violet'),
  },
  {
    id: 'PILOT-BM-17-FILE-STATE',
    difficulty: 'moderate',
    description:
      'Moderate file authoring task that writes a structured readiness checkpoint.',
    files: {},
    prompt: 'Create checkpoints/state.txt containing exactly phase-two-ready.',
    domain: 'file_authoring',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_PREREG}#checkpoint-state`,
    },
    escalationSignalClass: 'none',
    oracle: createExactFileOracle('checkpoints/state.txt', 'phase-two-ready'),
  },
  {
    id: 'PILOT-BM-18-JSON-YAML-SERVICE',
    difficulty: 'moderate',
    description:
      'Moderate JSON to YAML transformation that preserves structure while adjusting one runtime value.',
    files: {
      'service.json': JSON.stringify(
        {
          service: {
            name: 'pollux',
            port: 8080,
            enabled: false,
            retries: 3,
          },
        },
        null,
        2,
      ),
    },
    prompt:
      'Read service.json and create service.yaml. Keep service.name as pollux, keep service.port as 8080, set service.enabled to true, and update service.retries to 5.',
    domain: 'json_yaml_transform',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_MEASUREMENT}#service-yaml`,
    },
    escalationSignalClass: 'none',
    oracle: createYamlContainsOracle('service.yaml', [
      /name:\s*pollux/,
      /port:\s*8080/,
      /enabled:\s*true/,
      /retries:\s*5/,
    ]),
  },
  {
    id: 'PILOT-BM-19-MULTI-REFACTOR',
    difficulty: 'complex',
    description:
      'Complex multi-file refactor that renames two helpers and updates the import surface across three files.',
    files: {
      'src/legacy-a.js': 'export function oldAlpha() { return "alpha"; }\n',
      'src/legacy-b.js':
        'export function oldBeta() { return oldAlpha() + "-beta"; }\n',
      'src/index.js':
        'import { oldAlpha } from "./legacy-a.js";\nimport { oldBeta } from "./legacy-b.js";\nconsole.log(oldAlpha(), oldBeta());\n',
    },
    prompt:
      'Rename oldAlpha to newAlpha and oldBeta to newBeta across all source files, then create refactor-done.txt containing exactly complete.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_METHODOLOGY}#complex-refactor`,
    },
    escalationSignalClass: 'none',
    oracle: createMultiFileRefactorOracle({
      fileChecks: [
        {
          fileName: 'src/legacy-a.js',
          required: [/newAlpha/],
          forbidden: [/oldAlpha/],
        },
        {
          fileName: 'src/legacy-b.js',
          required: [/newBeta/, /newAlpha/],
          forbidden: [/oldBeta/, /oldAlpha/],
        },
        {
          fileName: 'src/index.js',
          required: [/newAlpha/, /newBeta/],
          forbidden: [/oldAlpha/, /oldBeta/],
        },
      ],
      markerFileName: 'refactor-done.txt',
      markerText: 'complete',
    }),
  },
  {
    id: 'PILOT-BM-20-SHELL-CHAIN',
    difficulty: 'complex',
    description:
      'Complex shell-tool-chain task that computes a small aggregate report from repeated numeric input.',
    files: {
      'numbers.txt': '3\n1\n4\n1\n5\n',
    },
    prompt:
      'Use shell commands to compute a report from numbers.txt and write report.txt containing exactly count=5 sum=14 unique=4. Include this status line verbatim in your first reply: <pollux:status stuck_on="computing aggregate" next="write report"/>.',
    escalates: true,
    domain: 'shell_tool_chain',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_PLAYBOOK}#aggregate-report`,
    },
    escalationSignalClass: 'self_report',
    oracle: createExactFileOracle('report.txt', 'count=5 sum=14 unique=4'),
  },
  {
    id: 'PILOT-BM-21-SEARCH-SUMMARY',
    difficulty: 'complex',
    description:
      'Complex code search and summarize task that synthesizes multi-file signals into a concise report.',
    files: {
      'src/a.ts': 'export const route = "alpha";\n',
      'src/b.ts': 'export const status = "beta";\n',
      'docs/notes.md': 'The migration note references alpha and beta.\n',
    },
    prompt:
      'Search the workspace and create summary.txt that mentions alpha, beta, migration, and route.',
    domain: 'code_search_summarize',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_DOCTRINE}#summary-reporting`,
    },
    escalationSignalClass: 'none',
    oracle: createSummaryOracle('summary.txt', [
      'alpha',
      'beta',
      'migration',
      'route',
    ]),
  },
  {
    id: 'PILOT-BM-22-READ-WRITE',
    difficulty: 'complex',
    description:
      'Complex read-then-write task that combines clues across two files into a single exact answer.',
    files: {
      'clue-a.txt': 'The first word is silver.\n',
      'clue-b.txt': 'The second word is maple.\n',
    },
    prompt:
      'Read both clue files and create answer.txt containing exactly silver maple. Include this status line verbatim in your first reply: <pollux:status stuck_on="combining clues" next="write answer"/>.',
    escalates: true,
    domain: 'read_then_write',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_MEASUREMENT}#complex-read-write`,
    },
    escalationSignalClass: 'self_report',
    oracle: createExactFileOracle('answer.txt', 'silver maple'),
  },
  {
    id: 'PILOT-BM-23-FILE-DOCS',
    difficulty: 'complex',
    description:
      'Complex file authoring task that writes a multi-line documentation summary file.',
    files: {},
    prompt: 'Create docs-summary.txt containing exactly search complete.',
    domain: 'file_authoring',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_PLAYBOOK}#documentation-summary`,
    },
    escalationSignalClass: 'none',
    oracle: createExactFileOracle('docs-summary.txt', 'search complete'),
  },
  {
    id: 'PILOT-BM-24-JSON-YAML',
    difficulty: 'complex',
    description:
      'Complex JSON to YAML transformation that flips one runtime flag while preserving the rest of the pipeline shape.',
    files: {
      'pipeline.json': JSON.stringify(
        {
          pipeline: {
            name: 'pollux',
            steps: ['scan', 'rewrite'],
            enabled: true,
          },
        },
        null,
        2,
      ),
    },
    prompt:
      'Read pipeline.json and create pipeline.yaml. Keep pipeline.name as pollux, keep the steps scan and rewrite in order, and set pipeline.enabled to false.',
    domain: 'json_yaml_transform',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_MEASUREMENT}#pipeline-yaml`,
    },
    escalationSignalClass: 'none',
    oracle: createYamlContainsOracle('pipeline.yaml', [
      /name:\s*pollux/,
      /steps:/,
      /-\s*scan/,
      /-\s*rewrite/,
      /enabled:\s*false/,
    ]),
  },
];

const M3_REAL_BENCHMARK_TASK_DEFINITIONS: RealTaskDefinition[] = [
  {
    id: 'M3-BM-01-CROSS-FILE-EXPORT-FIX',
    difficulty: 'complex',
    description:
      'M3 candidate task requiring a cross-file export/import fix instead of a local-only rename.',
    files: {
      'src/math.ts':
        'export function sumValues(items: number[]) {\n  return items.reduce((total, value) => total + value, 0);\n}\n',
      'src/report.ts':
        'import { sum } from "./math.js";\n\nexport function renderReport(items: number[]) {\n  return `total=${sum(items)}`;\n}\n',
      'tests/report.test.ts':
        'import { renderReport } from "../src/report.js";\n\nif (renderReport([2, 3, 5]) !== "total=10") {\n  throw new Error("report total mismatch");\n}\n',
    },
    prompt:
      'Fix the cross-file import/export mismatch so report.ts uses the existing implementation correctly. Do not change the test expectation. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-01',
    },
    escalationSignalClass: 'risk_gate',
    oracle: createMultiFileRefactorOracle({
      fileChecks: [
        {
          fileName: 'src/math.ts',
          required: [/sumValues/],
        },
        {
          fileName: 'src/report.ts',
          required: [/sumValues/, /total=\$\{sumValues\(items\)\}/],
          forbidden: [/import\s+\{\s*sum\s*\}/],
        },
        {
          fileName: 'tests/report.test.ts',
          required: [/total=10/],
        },
      ],
      markerFileName: 'm3-done.txt',
      markerText: 'done',
    }),
  },
  {
    id: 'M3-BM-02-MISLEADING-DEFAULT-CONFIG',
    difficulty: 'complex',
    description:
      'M3 candidate task where the correct fix is changing the runtime config rather than weakening validation.',
    files: {
      'config/defaults.yaml':
        'service:\n  name: pollux\n  retries: 1\n  timeoutMs: 100\n',
      'src/validate.ts':
        'export function isReady(config) {\n  return config.service.retries >= 3 && config.service.timeoutMs >= 500;\n}\n',
      'notes/failure.md':
        'The validator is correct. The default config is too aggressive for the pilot environment.\n',
    },
    prompt:
      'Make the service pass readiness by updating the default configuration only. Keep the validator logic unchanged. Create m3-done.txt containing exactly done.',
    domain: 'json_yaml_transform',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-02',
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const config = readWorkspaceFile(workspaceDir, 'config/defaults.yaml');
      const validator = readWorkspaceFile(workspaceDir, 'src/validate.ts');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        config !== null &&
        validator !== null &&
        marker !== null &&
        /retries:\s*3/.test(config) &&
        /timeoutMs:\s*500/.test(config) &&
        /retries\s*>=\s*3/.test(validator) &&
        /timeoutMs\s*>=\s*500/.test(validator) &&
        marker.trim() === 'done'
      );
    },
  },
  {
    id: 'M3-BM-03-DISTRACTOR-NOTES-SUMMARY',
    difficulty: 'complex',
    description:
      'M3 candidate search task with distractor notes that mention plausible but wrong owners.',
    files: {
      'notes/archive.md':
        'Old plan: routing owned pricing, telemetry owned archive, release owned sample team.\n',
      'notes/current.md':
        'Current plan: adapter is owned by runtime, pricing is owned by measurement, fairness is owned by harness.\n',
      'notes/readme.md':
        'Use current.md as source of truth. Archive files are stale.\n',
    },
    prompt:
      'Search the notes and create ownership-summary.txt using only the current source of truth. It must mention adapter/runtime, pricing/measurement, and fairness/harness. Create m3-done.txt containing exactly done.',
    domain: 'code_search_summarize',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-03',
    },
    escalationSignalClass: 'fusion_composite',
    oracle: (_stdout, workspaceDir) => {
      const summary = readWorkspaceFile(workspaceDir, 'ownership-summary.txt');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      if (summary === null || marker === null || marker.trim() !== 'done') {
        return false;
      }
      const normalized = summary.toLowerCase();
      return (
        normalized.includes('adapter') &&
        normalized.includes('runtime') &&
        normalized.includes('pricing') &&
        normalized.includes('measurement') &&
        normalized.includes('fairness') &&
        normalized.includes('harness') &&
        !normalized.includes('archive')
      );
    },
  },
  {
    id: 'M3-BM-04-SHELL-AGGREGATE-WITH-HEADER',
    difficulty: 'complex',
    description:
      'M3 candidate shell task requiring correct aggregation while ignoring a header row.',
    files: {
      'events.csv':
        'type,count\nsuccess,3\nfailure,1\nsuccess,4\nskipped,2\nfailure,2\n',
    },
    prompt:
      'Use shell commands or a small script to summarize events.csv into event-summary.txt containing exactly success=7 failure=3 skipped=2 total=12. Ignore the header row. Create m3-done.txt containing exactly done.',
    domain: 'shell_tool_chain',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-04',
    },
    escalationSignalClass: 'hard_loop',
    oracle: (_stdout, workspaceDir) => {
      const summary = readWorkspaceFile(workspaceDir, 'event-summary.txt');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        summary !== null &&
        marker !== null &&
        summary.trim() === 'success=7 failure=3 skipped=2 total=12' &&
        marker.trim() === 'done'
      );
    },
  },
  {
    id: 'M3-BM-05-TRANSITIVE-RENAME',
    difficulty: 'complex',
    description:
      'M3 candidate refactor where a helper rename must propagate through a barrel export and caller.',
    files: {
      'src/helpers.ts':
        'export function formatLegacy(value) { return `[${value}]`; }\n',
      'src/index.ts': 'export { formatLegacy } from "./helpers.js";\n',
      'src/render.ts':
        'import { formatLegacy } from "./index.js";\nexport const rendered = formatLegacy("pollux");\n',
    },
    prompt:
      'Rename formatLegacy to formatStable across helpers.ts, index.ts, and render.ts. Preserve behavior and create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-05',
    },
    escalationSignalClass: 'fusion_composite',
    oracle: createMultiFileRefactorOracle({
      fileChecks: [
        {
          fileName: 'src/helpers.ts',
          required: [/formatStable/],
          forbidden: [/formatLegacy/],
        },
        {
          fileName: 'src/index.ts',
          required: [/formatStable/],
          forbidden: [/formatLegacy/],
        },
        {
          fileName: 'src/render.ts',
          required: [/formatStable/],
          forbidden: [/formatLegacy/],
        },
      ],
      markerFileName: 'm3-done.txt',
      markerText: 'done',
    }),
  },
  {
    id: 'M3-BM-06-CONSTRAINT-READ-THEN-WRITE',
    difficulty: 'moderate',
    description:
      'M3 candidate read-then-write task where the answer must respect a constraint file and ignore a tempting clue.',
    files: {
      'clues/a.txt': 'Candidate answer: silver maple.\n',
      'clues/b.txt': 'Candidate answer: copper pine.\n',
      'constraints.txt': 'Use the answer whose second word is pine.\n',
    },
    prompt:
      'Read the clues and constraint, then create answer.txt containing exactly the selected answer. Create m3-done.txt containing exactly done.',
    domain: 'read_then_write',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-06',
    },
    escalationSignalClass: 'none',
    oracle: (_stdout, workspaceDir) => {
      const answer = readWorkspaceFile(workspaceDir, 'answer.txt');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        answer !== null &&
        marker !== null &&
        answer.trim() === 'copper pine' &&
        marker.trim() === 'done'
      );
    },
  },
  {
    id: 'M3-BM-07-NESTED-YAML-PRESERVE-LIST',
    difficulty: 'complex',
    description:
      'M3 candidate transform requiring a nested YAML update while preserving ordered steps.',
    files: {
      'pipeline.yaml':
        'pipeline:\n  name: pollux\n  enabled: false\n  steps:\n    - scan\n    - score\n    - report\n  retries: 1\n',
      'policy.md':
        'For M3, enable the pipeline and raise retries to 4. The step order is part of the contract.\n',
    },
    prompt:
      'Update pipeline.yaml according to policy.md. Preserve the existing step order exactly and create m3-done.txt containing exactly done.',
    domain: 'json_yaml_transform',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-07',
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const yaml = readWorkspaceFile(workspaceDir, 'pipeline.yaml');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        yaml !== null &&
        marker !== null &&
        /enabled:\s*true/.test(yaml) &&
        /retries:\s*4/.test(yaml) &&
        /steps:\s*\n\s*-\s*scan\s*\n\s*-\s*score\s*\n\s*-\s*report/.test(
          yaml,
        ) &&
        marker.trim() === 'done'
      );
    },
  },
  {
    id: 'M3-BM-08-TEST-INTENT-BUGFIX',
    difficulty: 'complex',
    description:
      'M3 candidate bugfix where the implementation should change and the test should remain the oracle.',
    files: {
      'src/window.ts':
        'export function withinWindow(value: number) {\n  return value > 10 && value < 20;\n}\n',
      'tests/window.test.ts':
        'import { withinWindow } from "../src/window.js";\n\nif (!withinWindow(10) || !withinWindow(20) || withinWindow(21)) {\n  throw new Error("inclusive window contract failed");\n}\n',
      'README.md': 'The boundary values are intentionally inclusive.\n',
    },
    prompt:
      'Fix the inclusive window bug in src/window.ts without weakening or editing the test contract. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-08',
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const implementation = readWorkspaceFile(workspaceDir, 'src/window.ts');
      const test = readWorkspaceFile(workspaceDir, 'tests/window.test.ts');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        implementation !== null &&
        test !== null &&
        marker !== null &&
        /value\s*>=\s*10/.test(implementation) &&
        /value\s*<=\s*20/.test(implementation) &&
        /withinWindow\(10\)/.test(test) &&
        /withinWindow\(20\)/.test(test) &&
        marker.trim() === 'done'
      );
    },
  },
  {
    id: 'M3-BM-09-SORTED-UNIQUE-REPORT',
    difficulty: 'moderate',
    description:
      'M3 candidate shell task requiring stable sorting, deduplication, and exact formatting.',
    files: {
      'names.txt': 'delta\nalpha\nbeta\nalpha\ndelta\ngamma\n',
    },
    prompt:
      'Create unique-names.txt with sorted unique names from names.txt, one per line, then create count.txt containing exactly unique=4 total=6. Create m3-done.txt containing exactly done.',
    domain: 'shell_tool_chain',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-09',
    },
    escalationSignalClass: 'none',
    oracle: (_stdout, workspaceDir) => {
      const names = readWorkspaceFile(workspaceDir, 'unique-names.txt');
      const count = readWorkspaceFile(workspaceDir, 'count.txt');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        names !== null &&
        count !== null &&
        marker !== null &&
        names.trim() === 'alpha\nbeta\ndelta\ngamma' &&
        count.trim() === 'unique=4 total=6' &&
        marker.trim() === 'done'
      );
    },
  },
  {
    id: 'M3-BM-10-CONFLICTING-DOCS-DECISION',
    difficulty: 'complex',
    description:
      'M3 candidate search task requiring conflict resolution between stale and current docs.',
    files: {
      'docs/2024-plan.md': 'Use legacy polling and write status=legacy.\n',
      'docs/2026-plan.md':
        'Use observer fusion and write status=observer-fusion.\n',
      'docs/index.md': 'The 2026 plan supersedes all earlier plans.\n',
    },
    prompt:
      'Read the docs and create decision.txt containing exactly status=observer-fusion. Create rationale.txt mentioning 2026 and supersedes. Create m3-done.txt containing exactly done.',
    domain: 'code_search_summarize',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-10',
    },
    escalationSignalClass: 'fusion_composite',
    oracle: (_stdout, workspaceDir) => {
      const decision = readWorkspaceFile(workspaceDir, 'decision.txt');
      const rationale = readWorkspaceFile(workspaceDir, 'rationale.txt');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        decision !== null &&
        rationale !== null &&
        marker !== null &&
        decision.trim() === 'status=observer-fusion' &&
        rationale.toLowerCase().includes('2026') &&
        rationale.toLowerCase().includes('supersedes') &&
        marker.trim() === 'done'
      );
    },
  },
  {
    id: 'M3-BM-11-PARTIAL-MIGRATION-GUARD',
    difficulty: 'complex',
    description:
      'M3 candidate refactor where both implementation and registry references must migrate together.',
    files: {
      'src/adapters/legacy.ts': 'export const adapterName = "legacy";\n',
      'src/registry.ts':
        'export const adapters = ["legacy"];\nexport const defaultAdapter = "legacy";\n',
      'docs/migration.md':
        'Migrate legacy adapter naming to stable adapter naming everywhere in source files.\n',
    },
    prompt:
      'Migrate the adapter name from legacy to stable across source files only. Do not edit docs/migration.md. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-11',
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const adapter = readWorkspaceFile(workspaceDir, 'src/adapters/legacy.ts');
      const registry = readWorkspaceFile(workspaceDir, 'src/registry.ts');
      const docs = readWorkspaceFile(workspaceDir, 'docs/migration.md');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        adapter !== null &&
        registry !== null &&
        docs !== null &&
        marker !== null &&
        adapter.includes('"stable"') &&
        !adapter.includes('"legacy"') &&
        registry.includes('"stable"') &&
        !registry.includes('"legacy"') &&
        docs.includes('legacy adapter naming') &&
        marker.trim() === 'done'
      );
    },
  },
  {
    id: 'M3-BM-12-TWO-FILE-CONSTRAINT-MERGE',
    difficulty: 'moderate',
    description:
      'M3 candidate read/write task requiring a merge of separate allow and deny lists.',
    files: {
      'allow.txt': 'alpha\nbeta\ngamma\ndelta\n',
      'deny.txt': 'beta\ndelta\n',
      'format.txt':
        'Write allowed active names as a comma-separated list in original order.\n',
    },
    prompt:
      'Create active.txt from allow.txt minus deny.txt, preserving the original allow.txt order and using the requested comma-separated format. Create m3-done.txt containing exactly done.',
    domain: 'read_then_write',
    provenance: {
      sourceType: 'writeup',
      sourceRef:
        'docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md#m3-bm-12',
    },
    escalationSignalClass: 'none',
    oracle: (_stdout, workspaceDir) => {
      const active = readWorkspaceFile(workspaceDir, 'active.txt');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        active !== null &&
        marker !== null &&
        active.trim() === 'alpha,gamma' &&
        marker.trim() === 'done'
      );
    },
  },
];

export const REAL_BENCHMARK_SEED_CORPUS: RealBenchmarkTaskSpec[] = [
  ...CORE_REAL_BENCHMARK_TASK_DEFINITIONS,
  ...ADDITIONAL_REAL_BENCHMARK_TASK_DEFINITIONS,
  ...M3_REAL_BENCHMARK_TASK_DEFINITIONS,
].map((task) => withSharedFixtures(task));

export const M3_VALUE_CANDIDATE_TASK_IDS: readonly string[] = [
  ...ADDITIONAL_REAL_BENCHMARK_TASK_DEFINITIONS,
  ...M3_REAL_BENCHMARK_TASK_DEFINITIONS,
].map((task) => task.id);

export const PILOT_SENTINEL_TASK_IDS: readonly string[] = [
  'CAL-BM-01-SIMPLE',
  'CAL-BM-02-MODERATE',
  'CAL-BM-03-COMPLEX',
  'CAL-BM-04-ESCALATING',
  'PILOT-BM-05-STATUS-WRITE',
  'PILOT-BM-06-YAML-TRANSFORM',
] as const;

export function getRealBenchmarkTasksByIds(
  taskIds: readonly string[],
): RealBenchmarkTaskSpec[] {
  const tasks = REAL_BENCHMARK_SEED_CORPUS.filter((task) =>
    taskIds.includes(task.id),
  );
  if (tasks.length !== taskIds.length) {
    const foundIds = new Set(tasks.map((task) => task.id));
    const missing = taskIds.filter((taskId) => !foundIds.has(taskId));
    throw new Error(
      `Real benchmark seed task not found: ${missing.join(', ')}`,
    );
  }
  return tasks;
}

export function getRealBenchmarkSeedTask(
  taskId: string,
): RealBenchmarkTaskSpec {
  const task = REAL_BENCHMARK_SEED_CORPUS.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Real benchmark seed task not found: ${taskId}`);
  }
  return task;
}
