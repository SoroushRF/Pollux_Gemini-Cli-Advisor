/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type BenchmarkDifficulty = 'simple' | 'moderate' | 'complex';

export interface BenchmarkTask {
  id: string;
  difficulty: BenchmarkDifficulty;
  description: string;
  files: Record<string, string>;
  prompt: string;
  /**
   * Whether this task is intentionally crafted to trip the Pollux escalation
   * detector (heuristic, structured, or hybrid). Used by the benchmark runner
   * to compute the escalation confusion matrix in P4-05: a sample is an
   * "expected positive" only when its task is `escalates: true` AND its
   * condition has Pollux enabled (B/C/D). Defaults to `false`.
   */
  escalates?: boolean;
  /**
   * Optional task-specific resume prompt used by
   * `BenchmarkHarness.runBenchmarkWithCheckpointResume`. Tasks that intend to
   * exercise the advisor on every turn (e.g. ESCALATING) override the default
   * resume prompt with one that also trips the detector so the resume CLI
   * subprocess consumes the same fixture sequence as the initial run.
   */
  resumePrompt?: string;
  oracle: (stdout: string, workspaceDir: string) => boolean | Promise<boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const BENCHMARK_CORPUS: BenchmarkTask[] = [
  {
    id: 'CAL-BM-01-SIMPLE',
    difficulty: 'simple',
    description:
      'Verify basic code generation without complex reasoning or tools.',
    files: {},
    prompt:
      'Write a bash script named hello.sh that prints "Hello Benchmark". Do not execute it.',
    oracle: (stdout, workspaceDir) => {
      const targetFilePath = path.join(workspaceDir, 'hello.sh');
      if (!fs.existsSync(targetFilePath)) return false;
      const content = fs.readFileSync(targetFilePath, 'utf8');
      return content.includes('Hello Benchmark');
    },
  },
  {
    id: 'CAL-BM-02-MODERATE',
    difficulty: 'moderate',
    description:
      'Read an existing file and apply a specific transformation using file edits.',
    files: {
      'data.csv': 'name,age\nAlice,30\nBob,25\n',
    },
    prompt:
      'Read data.csv and create a new file data.json containing an array of objects for each row where keys are the column headers.',
    oracle: (stdout, workspaceDir) => {
      const targetFilePath = path.join(workspaceDir, 'data.json');
      if (!fs.existsSync(targetFilePath)) return false;
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(targetFilePath, 'utf8'),
        );
        if (!Array.isArray(parsed) || parsed.length !== 2) {
          return false;
        }

        const firstRow = parsed[0] as unknown;
        if (!isRecord(firstRow)) {
          return false;
        }

        return firstRow['name'] === 'Alice';
      } catch {
        return false;
      }
    },
  },
  {
    id: 'CAL-BM-03-COMPLEX',
    difficulty: 'complex',
    description:
      'Multi-step task requiring exploration, tool chains, and logical deduction which executor models may fail without the advisor.',
    files: {
      'src/legacy_app.js': `function oldAlgo() { return {status: 500, message: "Deprecation block"}; }\nmodule.exports = oldAlgo;`,
    },
    prompt:
      'Refactor legacy_app.js in the src folder so that oldAlgo returns status 200 and message "OK". Write true into a file named test-result.txt if you successfully completed the refactoring.',
    // Tightened over the original P4-01 oracle: the previous version only
    // checked for substrings "200" and "OK" anywhere in the file, which
    // accepted a "fix" that left the original `status: 500, "Deprecation
    // block"` payload intact. The refactor must (a) return status 200, (b)
    // return message "OK", (c) drop the original 500 status, and (d) drop the
    // "Deprecation block" message.
    oracle: (stdout, workspaceDir) => {
      const targetFilePath = path.join(workspaceDir, 'test-result.txt');
      if (!fs.existsSync(targetFilePath)) return false;

      const legacyPath = path.join(workspaceDir, 'src', 'legacy_app.js');
      if (!fs.existsSync(legacyPath)) return false;
      const legacyContent = fs.readFileSync(legacyPath, 'utf8');

      const hasStatus200 = /\bstatus\s*:\s*200\b/.test(legacyContent);
      const hasMessageOk = /\bmessage\s*:\s*["']OK["']/.test(legacyContent);
      const stillHasStatus500 = /\bstatus\s*:\s*500\b/.test(legacyContent);
      const stillHasDeprecation = /Deprecation block/.test(legacyContent);
      const refactoredCorrectly =
        hasStatus200 &&
        hasMessageOk &&
        !stillHasStatus500 &&
        !stillHasDeprecation;

      const content = fs.readFileSync(targetFilePath, 'utf8');
      return content.trim().toLowerCase() === 'true' && refactoredCorrectly;
    },
  },
  {
    id: 'CAL-BM-04-ESCALATING',
    difficulty: 'complex',
    description:
      'Escalation-shaped task for benchmark matrices: the executor fixture emits a `<pollux:status stuck_on="…"/>` line so the live observer SelfReportSensor trips hard-precision `self.structured_status_stuck` under condition **F** (observer + fusion). That invokes the advisor path (TG-3) instead of collapsing the matrix to executor-only replays.',
    files: {},
    // Phase I removed the legacy heuristic / structured keyword + confidence
    // comment detector. Escalation for this task is driven by model-visible
    // status tags replayed from `CAL-BM-04-ESCALATING*.responses` fixtures
    // (see first `generateContentStream` chunk text parts).
    prompt:
      'Please write a file named escalation-marker.txt containing the single word `advised` and nothing else. Include this status line verbatim in your first reply: <pollux:status stuck_on="refactor strategy" next="write marker"/>.',
    escalates: true,
    resumePrompt:
      'Please rewrite escalation-marker.txt with the single word `advised` and nothing else. Include this status line verbatim in your first reply: <pollux:status stuck_on="refactor strategy" next="rewrite marker"/>.',
    oracle: (stdout, workspaceDir) => {
      const markerPath = path.join(workspaceDir, 'escalation-marker.txt');
      if (!fs.existsSync(markerPath)) return false;
      const content = fs.readFileSync(markerPath, 'utf8');
      return content.trim() === 'advised';
    },
  },
];
