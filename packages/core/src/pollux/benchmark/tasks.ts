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
    oracle: (stdout, workspaceDir) => {
      const targetFilePath = path.join(workspaceDir, 'test-result.txt');
      if (!fs.existsSync(targetFilePath)) return false;

      const legacyPath = path.join(workspaceDir, 'src', 'legacy_app.js');
      if (!fs.existsSync(legacyPath)) return false;
      const legacyContent = fs.readFileSync(legacyPath, 'utf8');
      const refactoredCorrectly =
        legacyContent.includes('200') && legacyContent.includes('OK');

      const content = fs.readFileSync(targetFilePath, 'utf8');
      return content.trim().toLowerCase() === 'true' && refactoredCorrectly;
    },
  },
];
