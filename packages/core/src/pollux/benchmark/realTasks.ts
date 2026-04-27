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
const DOC_M3_HARD_TASK_FACTORY =
  'docs/core/pollux/P4-18_MILESTONE_3_HARD_TASK_FACTORY_GUIDE.md';

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
  // Real benchmark corpus entries intentionally reuse the base CAL task
  // definitions from tasks.ts and layer real-run metadata on top here.
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
      // Structured self-report tasks are detector/semantics fixtures, so they
      // default into the canary lane rather than the M3 value subset.
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

function matchesExactText(
  actualText: string | null,
  expectedText: string,
): boolean {
  return (
    actualText !== null &&
    normalizeOracleText(actualText) === normalizeOracleText(expectedText)
  );
}

function createExactFileOracle(
  fileName: string,
  expectedText: string,
): BenchmarkTask['oracle'] {
  return (_stdout, workspaceDir) => {
    const content = readWorkspaceFile(workspaceDir, fileName);
    return matchesExactText(content, expectedText);
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
    difficulty: 'moderate',
    description:
      'Moderate multi-file refactor that renames two helpers and updates the import surface across three files.',
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
    difficulty: 'moderate',
    description:
      'Moderate code search and summarize task that synthesizes multi-file signals into a concise report.',
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
    difficulty: 'simple',
    description:
      'Simple file authoring task that writes an exact documentation summary marker.',
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
    difficulty: 'moderate',
    description:
      'Moderate JSON to YAML transformation that flips one runtime flag while preserving the rest of the pipeline shape.',
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
        !(
          (normalized.includes('routing') && normalized.includes('pricing')) ||
          normalized.includes('telemetry owned archive') ||
          normalized.includes('release owned sample team')
        )
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
        matchesExactText(names, 'alpha\nbeta\ndelta\ngamma') &&
        matchesExactText(count, 'unique=4 total=6') &&
        matchesExactText(marker, 'done')
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
      const legacyAdapter = readWorkspaceFile(
        workspaceDir,
        'src/adapters/legacy.ts',
      );
      const stableAdapter = readWorkspaceFile(
        workspaceDir,
        'src/adapters/stable.ts',
      );
      const registry = readWorkspaceFile(workspaceDir, 'src/registry.ts');
      const docs = readWorkspaceFile(workspaceDir, 'docs/migration.md');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      const hasLegacyAdapter = legacyAdapter !== null;
      const hasStableAdapter = stableAdapter !== null;
      const inPlaceMigration =
        hasLegacyAdapter &&
        !hasStableAdapter &&
        legacyAdapter.includes('"stable"') &&
        !legacyAdapter.includes('"legacy"');
      const renamedMigration =
        !hasLegacyAdapter &&
        hasStableAdapter &&
        stableAdapter.includes('"stable"') &&
        !stableAdapter.includes('"legacy"');
      return (
        (inPlaceMigration || renamedMigration) &&
        registry !== null &&
        docs !== null &&
        marker !== null &&
        registry.includes('"stable"') &&
        !registry.includes('"legacy"') &&
        docs.includes('legacy adapter naming') &&
        matchesExactText(marker, 'done')
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
  {
    id: 'M3-BM-13-CASCADE-CONTRACT-REPAIR',
    difficulty: 'complex',
    description:
      'Brutal M3 task requiring a cascade repair across parser, normalizer, renderer, and protected tests.',
    files: {
      'src/parser.ts':
        'export function parseRecord(raw: string) {\n  const [kind, id, status] = raw.split(":");\n  return { kind, id, status };\n}\n',
      'src/normalizer.ts':
        'import { parseLine } from "./parser.js";\n\nexport function normalizeRecord(raw: string) {\n  const [id, status] = raw.split(":").slice(1);\n  return { id, status };\n}\n',
      'src/renderer.ts':
        'import { normalizeRecord } from "./normalizer.js";\n\nexport function renderUser(raw: string) {\n  const record = normalizeRecord(raw);\n  return `user=${record.id} status=${record.status}`;\n}\n',
      'tests/render.test.ts':
        'import { renderUser } from "../src/renderer.js";\n\nif (renderUser("user:ada:ACTIVE") !== "user=ADA status=active") {\n  throw new Error("render contract mismatch");\n}\n',
    },
    prompt:
      'Repair the cascade contract so parser.ts remains the canonical raw-record parser, normalizer.ts uses that parser, and renderer.ts preserves the existing render contract. Do not edit tests/render.test.ts. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-13`,
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const parser = readWorkspaceFile(workspaceDir, 'src/parser.ts');
      const normalizer = readWorkspaceFile(workspaceDir, 'src/normalizer.ts');
      const renderer = readWorkspaceFile(workspaceDir, 'src/renderer.ts');
      const test = readWorkspaceFile(workspaceDir, 'tests/render.test.ts');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      const combinedRepairSurface = `${normalizer ?? ''}\n${renderer ?? ''}`;
      return (
        parser !== null &&
        normalizer !== null &&
        renderer !== null &&
        matchesExactText(
          test,
          'import { renderUser } from "../src/renderer.js";\n\nif (renderUser("user:ada:ACTIVE") !== "user=ADA status=active") {\n  throw new Error("render contract mismatch");\n}\n',
        ) &&
        matchesExactText(marker, 'done') &&
        /export function parseRecord/.test(parser) &&
        /\{\s*kind,\s*id,\s*status\s*\}/.test(parser) &&
        /parseRecord/.test(normalizer) &&
        !/raw\.split/.test(normalizer) &&
        /normalizeRecord/.test(renderer) &&
        /user=\$\{.+\} status=\$\{.+\}/.test(renderer) &&
        /(toUpperCase\(\)|user=.+ADA)/.test(combinedRepairSurface) &&
        /(toLowerCase\(\)|status=.+active)/.test(combinedRepairSurface) &&
        !/return\s+"user=ADA status=active"/.test(combinedRepairSurface)
      );
    },
  },
  {
    id: 'M3-BM-14-PRIORITY-MATRIX-CONFLICT',
    difficulty: 'complex',
    description:
      'Brutal M3 task requiring precedence-matrix reasoning across conflicting policy sources.',
    files: {
      'docs/runtime.md':
        'Runtime mode for the north region is archive with guard relaxed.\n',
      'plans/release.md':
        'Release plan says the north region should use warmup mode with guard review.\n',
      'config/environment.json':
        '{\n  "region": "north",\n  "mode": "live",\n  "guard": "strict"\n}\n',
      'rules/precedence.md':
        'When docs, plans, and environment disagree, environment overrides plans and plans override docs.\n',
      'src/decision.ts':
        'export const runtimeDecision = { region: "north", mode: "warmup", guard: "review" };\n',
    },
    prompt:
      'Resolve the runtime conflict using rules/precedence.md. Update src/decision.ts and create decision.txt with the final region, mode, and guard. Do not edit docs/runtime.md, plans/release.md, config/environment.json, or rules/precedence.md. Create m3-done.txt containing exactly done.',
    domain: 'code_search_summarize',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-14`,
    },
    escalationSignalClass: 'fusion_composite',
    oracle: (_stdout, workspaceDir) => {
      const docs = readWorkspaceFile(workspaceDir, 'docs/runtime.md');
      const plan = readWorkspaceFile(workspaceDir, 'plans/release.md');
      const config = readWorkspaceFile(workspaceDir, 'config/environment.json');
      const rules = readWorkspaceFile(workspaceDir, 'rules/precedence.md');
      const decisionSource = readWorkspaceFile(workspaceDir, 'src/decision.ts');
      const decision = readWorkspaceFile(workspaceDir, 'decision.txt');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        matchesExactText(
          docs,
          'Runtime mode for the north region is archive with guard relaxed.\n',
        ) &&
        matchesExactText(
          plan,
          'Release plan says the north region should use warmup mode with guard review.\n',
        ) &&
        matchesExactText(
          config,
          '{\n  "region": "north",\n  "mode": "live",\n  "guard": "strict"\n}\n',
        ) &&
        matchesExactText(
          rules,
          'When docs, plans, and environment disagree, environment overrides plans and plans override docs.\n',
        ) &&
        decisionSource !== null &&
        matchesExactText(decision, 'region=north mode=live guard=strict') &&
        matchesExactText(marker, 'done') &&
        /region:\s*"north"/.test(decisionSource) &&
        /mode:\s*"live"/.test(decisionSource) &&
        /guard:\s*"strict"/.test(decisionSource) &&
        !/warmup|archive|review|relaxed/.test(decisionSource)
      );
    },
  },
  {
    id: 'M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR',
    difficulty: 'complex',
    description:
      'Brutal M3 task requiring state-machine invariant repair while preserving terminal-state constraints.',
    files: {
      'src/flow.ts':
        'const allowedTransitions: Record<string, string[]> = {\n  queued: ["running", "done"],\n  running: ["done"],\n  failed: ["running"],\n  done: ["running"],\n};\n\nexport function canTransition(from: string, to: string) {\n  return allowedTransitions[from]?.includes(to) ?? false;\n}\n',
      'tests/flow.test.ts':
        'import { canTransition } from "../src/flow.js";\n\nif (!canTransition("queued", "running")) throw new Error("queued should start");\nif (!canTransition("running", "done")) throw new Error("running should finish");\nif (!canTransition("running", "failed")) throw new Error("running should fail");\nif (canTransition("queued", "done")) throw new Error("queued cannot skip running");\nif (canTransition("done", "running")) throw new Error("done is terminal");\nif (canTransition("failed", "running")) throw new Error("failed is terminal");\n',
      'docs/states.md':
        'Terminal states are done and failed. Queued work must enter running before it can finish.\n',
    },
    prompt:
      'Repair src/flow.ts by encoding the allowed transition map correctly. Preserve terminal-state behavior and do not edit tests/flow.test.ts or docs/states.md. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-15`,
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const flow = readWorkspaceFile(workspaceDir, 'src/flow.ts');
      const test = readWorkspaceFile(workspaceDir, 'tests/flow.test.ts');
      const docs = readWorkspaceFile(workspaceDir, 'docs/states.md');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        flow !== null &&
        matchesExactText(
          test,
          'import { canTransition } from "../src/flow.js";\n\nif (!canTransition("queued", "running")) throw new Error("queued should start");\nif (!canTransition("running", "done")) throw new Error("running should finish");\nif (!canTransition("running", "failed")) throw new Error("running should fail");\nif (canTransition("queued", "done")) throw new Error("queued cannot skip running");\nif (canTransition("done", "running")) throw new Error("done is terminal");\nif (canTransition("failed", "running")) throw new Error("failed is terminal");\n',
        ) &&
        matchesExactText(
          docs,
          'Terminal states are done and failed. Queued work must enter running before it can finish.\n',
        ) &&
        matchesExactText(marker, 'done') &&
        /queued:\s*\[\s*"running"\s*\]/.test(flow) &&
        /running:\s*\[\s*"done"\s*,\s*"failed"\s*\]/.test(flow) &&
        /failed:\s*\[\s*\]/.test(flow) &&
        /done:\s*\[\s*\]/.test(flow) &&
        /includes\(to\)/.test(flow)
      );
    },
  },
  {
    id: 'M3-BM-16-COMPATIBLE-ADAPTER-MIGRATION',
    difficulty: 'complex',
    description:
      'Brutal M3 task requiring an internal adapter migration while preserving the legacy public facade.',
    files: {
      'src/adapters/v1.ts':
        'export function buildPayload(input: string) {\n  return { version: "legacy-v1", value: input.trim() };\n}\n',
      'src/adapters/v2.ts':
        'export function createStablePayload(input: string) {\n  return { version: "stable-v2", value: input.trim().toUpperCase() };\n}\n',
      'src/registry.ts':
        'import { buildPayload } from "./adapters/v1.js";\n\nexport const defaultAdapter = "legacy-v1";\nexport const adapter = buildPayload;\n',
      'src/client.ts':
        'import { adapter } from "./registry.js";\n\nexport function send(value: string) {\n  return adapter(value);\n}\n',
      'docs/migration.md':
        'Move internal callers to stable-v2. Keep buildPayload available for external compatibility until the next major release.\n',
    },
    prompt:
      'Migrate internal adapter usage to stable-v2 while keeping the legacy buildPayload facade available for external callers. Update source files only, do not edit docs/migration.md, and create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-16`,
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const v1 = readWorkspaceFile(workspaceDir, 'src/adapters/v1.ts');
      const v2 = readWorkspaceFile(workspaceDir, 'src/adapters/v2.ts');
      const registry = readWorkspaceFile(workspaceDir, 'src/registry.ts');
      const client = readWorkspaceFile(workspaceDir, 'src/client.ts');
      const docs = readWorkspaceFile(workspaceDir, 'docs/migration.md');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        v1 !== null &&
        v2 !== null &&
        registry !== null &&
        client !== null &&
        matchesExactText(
          docs,
          'Move internal callers to stable-v2. Keep buildPayload available for external compatibility until the next major release.\n',
        ) &&
        matchesExactText(marker, 'done') &&
        /export function buildPayload/.test(v1) &&
        /createStablePayload/.test(v1) &&
        !/legacy-v1/.test(v1) &&
        /export function createStablePayload/.test(v2) &&
        /stable-v2/.test(v2) &&
        /createStablePayload/.test(registry) &&
        /defaultAdapter\s*=\s*"stable-v2"/.test(registry) &&
        !/buildPayload/.test(registry) &&
        /adapter/.test(client)
      );
    },
  },
  {
    id: 'M3-BM-17-TRANSITIVE-IMPORT-SOURCE-FIX',
    difficulty: 'complex',
    description:
      'M3 hard task requiring a transitive import repair while preserving the canonical implementation contract.',
    files: {
      'src/labels.ts':
        'export function createStableLabel(value: string) {\n  return `stable:${value.toLowerCase()}`;\n}\n',
      'src/index.ts': 'export { createLabel } from "./labels.js";\n',
      'src/view.ts':
        'import { createLabel } from "./index.js";\n\nexport const label = createLabel("POLLUX");\n',
      'tests/view.test.ts':
        'import { label } from "../src/view.js";\n\nif (label !== "stable:pollux") {\n  throw new Error("label contract mismatch");\n}\n',
    },
    prompt:
      'Fix the transitive import/export mismatch so view.ts uses the canonical createStableLabel implementation through the public index. Do not change src/labels.ts behavior or tests/view.test.ts. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-17`,
    },
    escalationSignalClass: 'fusion_composite',
    oracle: createMultiFileRefactorOracle({
      fileChecks: [
        {
          fileName: 'src/labels.ts',
          required: [
            /createStableLabel/,
            /stable:\$\{value\.toLowerCase\(\)\}/,
          ],
          forbidden: [/createLabel/],
        },
        {
          fileName: 'src/index.ts',
          required: [/createStableLabel/],
          forbidden: [/createLabel/],
        },
        {
          fileName: 'src/view.ts',
          required: [/createStableLabel/, /stable/i],
          forbidden: [/createLabel/],
        },
        {
          fileName: 'tests/view.test.ts',
          required: [/stable:pollux/],
        },
      ],
      markerFileName: 'm3-done.txt',
      markerText: 'done',
    }),
  },
  {
    id: 'M3-BM-18-TEST-INTENT-PARSER-EDGE',
    difficulty: 'complex',
    description:
      'M3 hard task requiring parser edge-case repair from test intent without weakening the test.',
    files: {
      'src/csv.ts':
        'export function parseCsvLine(line: string) {\n  return line.split(",");\n}\n',
      'tests/csv.test.ts':
        'import { parseCsvLine } from "../src/csv.js";\n\nconst parsed = parseCsvLine(\'alpha,"beta,gamma",,delta\');\nif (parsed.length !== 4) throw new Error("field count mismatch");\nif (parsed[1] !== "beta,gamma") throw new Error("quoted comma mismatch");\nif (parsed[2] !== "") throw new Error("empty field mismatch");\n',
      'README.md':
        'CSV parsing must preserve empty fields and keep commas inside quoted fields.\n',
    },
    prompt:
      'Fix src/csv.ts so it satisfies the parser edge cases expressed by tests/csv.test.ts. Do not weaken or edit the test or README. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-18`,
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const parser = readWorkspaceFile(workspaceDir, 'src/csv.ts');
      const test = readWorkspaceFile(workspaceDir, 'tests/csv.test.ts');
      const readme = readWorkspaceFile(workspaceDir, 'README.md');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        parser !== null &&
        matchesExactText(
          test,
          'import { parseCsvLine } from "../src/csv.js";\n\nconst parsed = parseCsvLine(\'alpha,"beta,gamma",,delta\');\nif (parsed.length !== 4) throw new Error("field count mismatch");\nif (parsed[1] !== "beta,gamma") throw new Error("quoted comma mismatch");\nif (parsed[2] !== "") throw new Error("empty field mismatch");\n',
        ) &&
        matchesExactText(
          readme,
          'CSV parsing must preserve empty fields and keep commas inside quoted fields.\n',
        ) &&
        matchesExactText(marker, 'done') &&
        /quote|inQuotes|quoted/i.test(parser) &&
        !/line\.split\(","\)/.test(parser) &&
        !/beta,gamma/.test(parser)
      );
    },
  },
  {
    id: 'M3-BM-19-POLICY-SOURCE-OF-TRUTH',
    difficulty: 'complex',
    description:
      'M3 hard task requiring a runtime policy update from config while preserving conflicting documentation.',
    files: {
      'config/policy.json':
        '{\n  "mode": "strict",\n  "retentionDays": 30,\n  "rollout": "stable"\n}\n',
      'docs/policy.md':
        'Legacy docs still say mode is loose, retention is 7 days, and rollout is canary.\n',
      'src/policy.ts':
        'export const policy = { mode: "loose", retentionDays: 7, rollout: "canary" };\n',
    },
    prompt:
      'Update src/policy.ts so runtime policy follows config/policy.json as the source of truth. Do not edit config/policy.json or docs/policy.md. Create m3-done.txt containing exactly done.',
    domain: 'code_search_summarize',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-19`,
    },
    escalationSignalClass: 'fusion_composite',
    oracle: (_stdout, workspaceDir) => {
      const config = readWorkspaceFile(workspaceDir, 'config/policy.json');
      const docs = readWorkspaceFile(workspaceDir, 'docs/policy.md');
      const policy = readWorkspaceFile(workspaceDir, 'src/policy.ts');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        matchesExactText(
          config,
          '{\n  "mode": "strict",\n  "retentionDays": 30,\n  "rollout": "stable"\n}\n',
        ) &&
        matchesExactText(
          docs,
          'Legacy docs still say mode is loose, retention is 7 days, and rollout is canary.\n',
        ) &&
        policy !== null &&
        matchesExactText(marker, 'done') &&
        /mode:\s*"strict"/.test(policy) &&
        /retentionDays:\s*30/.test(policy) &&
        /rollout:\s*"stable"/.test(policy) &&
        !/loose|canary/.test(policy)
      );
    },
  },
  {
    id: 'M3-BM-20-GUARDED-REGISTRY-RENAME',
    difficulty: 'complex',
    description:
      'M3 hard task requiring a guarded source rename across registry and consumers while preserving compatibility docs.',
    files: {
      'src/flags.ts':
        'export function legacyGate(user: { beta: boolean }) {\n  return user.beta === true;\n}\n',
      'src/registry.ts':
        'import { legacyGate } from "./flags.js";\n\nexport const gates = { legacyGate };\n',
      'src/app.ts':
        'import { gates } from "./registry.js";\n\nexport const enabled = gates.legacyGate({ beta: true });\n',
      'docs/compat.md':
        'External integrations may still mention legacyGate until the public API migration is announced.\n',
    },
    prompt:
      'Rename the source-level gate from legacyGate to stableGate across source files only. Preserve behavior and do not edit docs/compat.md. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-20`,
    },
    escalationSignalClass: 'risk_gate',
    oracle: createMultiFileRefactorOracle({
      fileChecks: [
        {
          fileName: 'src/flags.ts',
          required: [/stableGate/, /user\.beta\s*===\s*true/],
          forbidden: [/legacyGate/],
        },
        {
          fileName: 'src/registry.ts',
          required: [/stableGate/, /gates/],
          forbidden: [/legacyGate/],
        },
        {
          fileName: 'src/app.ts',
          required: [/stableGate/],
          forbidden: [/legacyGate/],
        },
        {
          fileName: 'docs/compat.md',
          required: [/legacyGate/, /public API migration/],
        },
      ],
      markerFileName: 'm3-done.txt',
      markerText: 'done',
    }),
  },
  {
    id: 'M3-BM-21-MULTI-OUTPUT-CONSISTENCY',
    difficulty: 'complex',
    description:
      'M3 hard task requiring the same derived decision to be reflected across source, registry, and summary artifacts.',
    files: {
      'data/candidates.json':
        '[\n  { "key": "zephyr", "score": 91, "enabled": false, "channel": "stable" },\n  { "key": "atlas", "score": 88, "enabled": true, "channel": "stable" },\n  { "key": "ember", "score": 93, "enabled": true, "channel": "experimental" }\n]\n',
      'rules/selection.md':
        'Select the highest scoring candidate that is both enabled and on the stable channel.\n',
      'src/launch.ts': 'export const launchKey = "zephyr";\n',
      'registry.json': '{\n  "launchKey": "zephyr"\n}\n',
    },
    prompt:
      'Apply the selection rule to data/candidates.json, then update src/launch.ts, registry.json, and launch-summary.txt so they all use the same selected key. Do not edit data/candidates.json or rules/selection.md. Create m3-done.txt containing exactly done.',
    domain: 'read_then_write',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-21`,
    },
    escalationSignalClass: 'fusion_composite',
    oracle: (_stdout, workspaceDir) => {
      const candidates = readWorkspaceFile(
        workspaceDir,
        'data/candidates.json',
      );
      const rules = readWorkspaceFile(workspaceDir, 'rules/selection.md');
      const source = readWorkspaceFile(workspaceDir, 'src/launch.ts');
      const registry = readWorkspaceFile(workspaceDir, 'registry.json');
      const summary = readWorkspaceFile(workspaceDir, 'launch-summary.txt');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        matchesExactText(
          candidates,
          '[\n  { "key": "zephyr", "score": 91, "enabled": false, "channel": "stable" },\n  { "key": "atlas", "score": 88, "enabled": true, "channel": "stable" },\n  { "key": "ember", "score": 93, "enabled": true, "channel": "experimental" }\n]\n',
        ) &&
        matchesExactText(
          rules,
          'Select the highest scoring candidate that is both enabled and on the stable channel.\n',
        ) &&
        source !== null &&
        registry !== null &&
        summary !== null &&
        matchesExactText(marker, 'done') &&
        /launchKey\s*=\s*"atlas"/.test(source) &&
        /"launchKey"\s*:\s*"atlas"/.test(registry) &&
        summary.toLowerCase().includes('atlas') &&
        !/zephyr|ember/.test(source) &&
        !/zephyr|ember/.test(registry)
      );
    },
  },
  {
    id: 'M3-BM-22-NEGATIVE-SPACE-PRESERVE',
    difficulty: 'complex',
    description:
      'M3 hard task where the correct implementation repair requires avoiding attractive edits to docs and tests.',
    files: {
      'src/tax.ts':
        'export function totalWithTax(subtotal: number, discount: number, taxRate: number) {\n  return subtotal + subtotal * taxRate - discount;\n}\n',
      'tests/tax.test.ts':
        'import { totalWithTax } from "../src/tax.js";\n\nif (totalWithTax(100, 20, 0.1) !== 88) {\n  throw new Error("discount must apply before tax");\n}\n',
      'docs/tax.md':
        'Apply discount before computing tax. Do not change the customer-facing formula.\n',
    },
    prompt:
      'Fix the tax calculation in src/tax.ts only. The discount must apply before tax, and tests/tax.test.ts plus docs/tax.md are protected. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-22`,
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const tax = readWorkspaceFile(workspaceDir, 'src/tax.ts');
      const test = readWorkspaceFile(workspaceDir, 'tests/tax.test.ts');
      const docs = readWorkspaceFile(workspaceDir, 'docs/tax.md');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        tax !== null &&
        matchesExactText(
          test,
          'import { totalWithTax } from "../src/tax.js";\n\nif (totalWithTax(100, 20, 0.1) !== 88) {\n  throw new Error("discount must apply before tax");\n}\n',
        ) &&
        matchesExactText(
          docs,
          'Apply discount before computing tax. Do not change the customer-facing formula.\n',
        ) &&
        matchesExactText(marker, 'done') &&
        /\(subtotal\s*-\s*discount\)\s*\*\s*\(\s*1\s*\+\s*taxRate\s*\)/.test(
          tax,
        ) &&
        !/subtotal\s*\+\s*subtotal\s*\*\s*taxRate\s*-\s*discount/.test(tax)
      );
    },
  },
  {
    id: 'M3-BM-23-DERIVED-CONFIG-MERGE',
    difficulty: 'complex',
    description:
      'M3 hard task requiring a derived config merge with precedence, denial, and order constraints.',
    files: {
      'config/defaults.json':
        '{\n  "mode": "observe",\n  "features": ["alpha", "beta", "gamma"]\n}\n',
      'config/override.json':
        '{\n  "mode": "enforce",\n  "addFeatures": ["delta"],\n  "disableFeatures": ["beta"]\n}\n',
      'config/denylist.txt': 'gamma\n',
      'rules/merge.md':
        'Use override.mode. Start with default features in order, remove disabled and denylisted features, then append added features that are not denied.\n',
    },
    prompt:
      'Create effective-config.json by applying rules/merge.md to the config files. Preserve the input files and create m3-done.txt containing exactly done.',
    domain: 'read_then_write',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-23`,
    },
    escalationSignalClass: 'fusion_composite',
    oracle: (_stdout, workspaceDir) => {
      const defaults = readWorkspaceFile(workspaceDir, 'config/defaults.json');
      const override = readWorkspaceFile(workspaceDir, 'config/override.json');
      const denylist = readWorkspaceFile(workspaceDir, 'config/denylist.txt');
      const rules = readWorkspaceFile(workspaceDir, 'rules/merge.md');
      const effective = readWorkspaceFile(
        workspaceDir,
        'effective-config.json',
      );
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      if (
        !matchesExactText(
          defaults,
          '{\n  "mode": "observe",\n  "features": ["alpha", "beta", "gamma"]\n}\n',
        ) ||
        !matchesExactText(
          override,
          '{\n  "mode": "enforce",\n  "addFeatures": ["delta"],\n  "disableFeatures": ["beta"]\n}\n',
        ) ||
        !matchesExactText(denylist, 'gamma\n') ||
        !matchesExactText(
          rules,
          'Use override.mode. Start with default features in order, remove disabled and denylisted features, then append added features that are not denied.\n',
        ) ||
        !matchesExactText(marker, 'done') ||
        effective === null
      ) {
        return false;
      }

      try {
        const parsed: unknown = JSON.parse(effective);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !('mode' in parsed) ||
          !('features' in parsed)
        ) {
          return false;
        }
        const { mode, features } = parsed;
        return (
          mode === 'enforce' &&
          Array.isArray(features) &&
          features.length === 2 &&
          features[0] === 'alpha' &&
          features[1] === 'delta'
        );
      } catch {
        return false;
      }
    },
  },
  {
    id: 'M3-BM-24-ALIAS-PRESERVING-RENAME',
    difficulty: 'complex',
    description:
      'M3 hard task requiring a canonical symbol rename while preserving an external compatibility alias.',
    files: {
      'src/color.ts':
        'export function formatShade(name: string) {\n  return `shade:${name.toLowerCase()}`;\n}\n',
      'src/theme.ts':
        'import { formatShade } from "./color.js";\n\nexport const primaryShade = formatShade("COBALT");\n',
      'tests/color.test.ts':
        'import { formatShade, renderShade } from "../src/color.js";\n\nif (renderShade("COBALT") !== "shade:cobalt") throw new Error("canonical shade mismatch");\nif (formatShade("COBALT") !== "shade:cobalt") throw new Error("compat alias mismatch");\n',
    },
    prompt:
      'Rename the canonical shade formatter to renderShade and update internal source usage to that name, but keep formatShade exported as a compatibility alias. Do not edit tests/color.test.ts. Create m3-done.txt containing exactly done.',
    domain: 'multi_file_refactor',
    provenance: {
      sourceType: 'writeup',
      sourceRef: `${DOC_M3_HARD_TASK_FACTORY}#m3-bm-24`,
    },
    escalationSignalClass: 'risk_gate',
    oracle: (_stdout, workspaceDir) => {
      const color = readWorkspaceFile(workspaceDir, 'src/color.ts');
      const theme = readWorkspaceFile(workspaceDir, 'src/theme.ts');
      const test = readWorkspaceFile(workspaceDir, 'tests/color.test.ts');
      const marker = readWorkspaceFile(workspaceDir, 'm3-done.txt');
      return (
        color !== null &&
        theme !== null &&
        matchesExactText(
          test,
          'import { formatShade, renderShade } from "../src/color.js";\n\nif (renderShade("COBALT") !== "shade:cobalt") throw new Error("canonical shade mismatch");\nif (formatShade("COBALT") !== "shade:cobalt") throw new Error("compat alias mismatch");\n',
        ) &&
        matchesExactText(marker, 'done') &&
        /export function renderShade/.test(color) &&
        /formatShade\s*=\s*renderShade/.test(color) &&
        /shade:\$\{name\.toLowerCase\(\)\}/.test(color) &&
        /renderShade/.test(theme) &&
        !/formatShade/.test(theme)
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
