/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PILOT_SENTINEL_TASK_IDS,
  REAL_BENCHMARK_SEED_CORPUS,
  SHARED_REAL_NEGATIVE_FIXTURE_PATHS,
  SHARED_REAL_POSITIVE_FIXTURE_PATH,
  getRealBenchmarkSeedTask,
} from './realTasks.js';
import { REAL_BENCHMARK_REQUIRED_DOMAINS } from './realTypes.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '..', '..', '..', '..', '..');

function resolveFixturePath(relativePath: string): string {
  return path.resolve(REPO_ROOT, relativePath);
}

function writeWorkspaceFile(
  workspaceDir: string,
  relativePath: string,
  contents: string,
): void {
  const filePath = path.join(workspaceDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
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

  it('provides the expanded 48-task corpus with the M3 hard-task pack', () => {
    expect(REAL_BENCHMARK_SEED_CORPUS).toHaveLength(48);

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
      simple: 9,
      moderate: 14,
      complex: 25,
    });
  });

  it('keeps difficulty labels and leading description wording aligned', () => {
    const mismatchedTasks = REAL_BENCHMARK_SEED_CORPUS.filter((task) => {
      const leadingDifficulty = /^(Simple|Moderate|Complex)\b/.exec(
        task.description,
      )?.[1];
      return (
        leadingDifficulty !== undefined &&
        leadingDifficulty.toLowerCase() !== task.difficulty
      );
    });

    expect(mismatchedTasks).toEqual([]);
  });

  it('keeps the escalation split on both sides of the minimum threshold', () => {
    const escalating = REAL_BENCHMARK_SEED_CORPUS.filter(
      (task) => task.escalates === true,
    );
    const nonEscalating = REAL_BENCHMARK_SEED_CORPUS.filter(
      (task) => task.escalates !== true,
    );

    expect(escalating).toHaveLength(8);
    expect(nonEscalating).toHaveLength(40);
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

  it('treats BOM and CRLF differences as equivalent for exact-file oracles', async () => {
    const task = getRealBenchmarkSeedTask('PILOT-BM-08-SHELL-PIPE');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      fs.writeFileSync(
        path.join(workspaceDir, 'sorted.txt'),
        '\uFEFFalpha\r\nbeta\r\ngamma\r\n',
        'utf8',
      );

      expect(await task.oracle('', workspaceDir)).toBe(true);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('accepts CRLF output for the sorted unique report task oracle', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-09-SORTED-UNIQUE-REPORT');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      fs.writeFileSync(
        path.join(workspaceDir, 'unique-names.txt'),
        'alpha\r\nbeta\r\ndelta\r\ngamma\r\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'count.txt'),
        'unique=4 total=6\r\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'm3-done.txt'),
        'done\r\n',
        'utf8',
      );

      expect(await task.oracle('', workspaceDir)).toBe(true);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('accepts the partial migration guard task when the adapter file is renamed to stable.ts', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-11-PARTIAL-MIGRATION-GUARD');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      fs.mkdirSync(path.join(workspaceDir, 'src', 'adapters'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(workspaceDir, 'docs'), { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, 'src', 'adapters', 'stable.ts'),
        'export const adapterName = "stable";\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'src', 'registry.ts'),
        'export const adapters = ["stable"];\nexport const defaultAdapter = "stable";\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'docs', 'migration.md'),
        'Migrate legacy adapter naming to stable adapter naming everywhere in source files.\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'm3-done.txt'),
        'done\n',
        'utf8',
      );

      expect(await task.oracle('', workspaceDir)).toBe(true);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('accepts the partial migration guard task when the adapter is migrated in place', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-11-PARTIAL-MIGRATION-GUARD');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      fs.mkdirSync(path.join(workspaceDir, 'src', 'adapters'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(workspaceDir, 'docs'), { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, 'src', 'adapters', 'legacy.ts'),
        'export const adapterName = "stable";\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'src', 'registry.ts'),
        'export const adapters = ["stable"];\nexport const defaultAdapter = "stable";\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'docs', 'migration.md'),
        'Migrate legacy adapter naming to stable adapter naming everywhere in source files.\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'm3-done.txt'),
        'done\n',
        'utf8',
      );

      expect(await task.oracle('', workspaceDir)).toBe(true);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('rejects the partial migration guard task when both legacy.ts and stable.ts exist', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-11-PARTIAL-MIGRATION-GUARD');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      fs.mkdirSync(path.join(workspaceDir, 'src', 'adapters'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(workspaceDir, 'docs'), { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, 'src', 'adapters', 'legacy.ts'),
        'export const adapterName = "stable";\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'src', 'adapters', 'stable.ts'),
        'export const adapterName = "stable";\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'src', 'registry.ts'),
        'export const adapters = ["stable"];\nexport const defaultAdapter = "stable";\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'docs', 'migration.md'),
        'Migrate legacy adapter naming to stable adapter naming everywhere in source files.\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(workspaceDir, 'm3-done.txt'),
        'done\n',
        'utf8',
      );

      expect(await task.oracle('', workspaceDir)).toBe(false);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('accepts the distractor notes summary when it mentions stale archive context but keeps the right owners', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-03-DISTRACTOR-NOTES-SUMMARY');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      for (const [relativePath, contents] of Object.entries(task.files)) {
        writeWorkspaceFile(workspaceDir, relativePath, contents);
      }
      writeWorkspaceFile(
        workspaceDir,
        'ownership-summary.txt',
        'The archive notes are stale. Current ownership is adapter/runtime, pricing/measurement, and fairness/harness.\n',
      );
      writeWorkspaceFile(workspaceDir, 'm3-done.txt', 'done\n');

      expect(await task.oracle('', workspaceDir)).toBe(true);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('rejects the distractor notes summary when it repeats stale owner mappings', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-03-DISTRACTOR-NOTES-SUMMARY');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      for (const [relativePath, contents] of Object.entries(task.files)) {
        writeWorkspaceFile(workspaceDir, relativePath, contents);
      }
      writeWorkspaceFile(
        workspaceDir,
        'ownership-summary.txt',
        'The archive notes are stale, but they claim routing owned pricing while the current owners are adapter/runtime, pricing/measurement, and fairness/harness.\n',
      );
      writeWorkspaceFile(workspaceDir, 'm3-done.txt', 'done\n');

      expect(await task.oracle('', workspaceDir)).toBe(false);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('accepts the cascade contract repair task when all cross-file constraints are satisfied', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-13-CASCADE-CONTRACT-REPAIR');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      for (const [relativePath, contents] of Object.entries(task.files)) {
        writeWorkspaceFile(workspaceDir, relativePath, contents);
      }
      writeWorkspaceFile(
        workspaceDir,
        'src/normalizer.ts',
        'import { parseRecord } from "./parser.js";\n\nexport function normalizeRecord(raw: string) {\n  return parseRecord(raw);\n}\n',
      );
      writeWorkspaceFile(
        workspaceDir,
        'src/renderer.ts',
        'import { normalizeRecord } from "./normalizer.js";\n\nexport function renderUser(raw: string) {\n  const record = normalizeRecord(raw);\n  return `user=${record.id.toUpperCase()} status=${record.status.toLowerCase()}`;\n}\n',
      );
      writeWorkspaceFile(workspaceDir, 'm3-done.txt', '\uFEFFdone\r\n');

      expect(await task.oracle('', workspaceDir)).toBe(true);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('rejects the cascade contract repair task when the normalizer bypasses the parser and hardcodes output', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-13-CASCADE-CONTRACT-REPAIR');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      for (const [relativePath, contents] of Object.entries(task.files)) {
        writeWorkspaceFile(workspaceDir, relativePath, contents);
      }
      writeWorkspaceFile(
        workspaceDir,
        'src/normalizer.ts',
        'export function normalizeRecord(raw: string) {\n  const [id, status] = raw.split(":").slice(1);\n  return { id, status };\n}\n',
      );
      writeWorkspaceFile(
        workspaceDir,
        'src/renderer.ts',
        'import { normalizeRecord } from "./normalizer.js";\n\nexport function renderUser(raw: string) {\n  normalizeRecord(raw);\n  return "user=ADA status=active";\n}\n',
      );
      writeWorkspaceFile(workspaceDir, 'm3-done.txt', 'done\n');

      expect(await task.oracle('', workspaceDir)).toBe(false);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('rejects the priority matrix task when the stale lower-priority source wins', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-14-PRIORITY-MATRIX-CONFLICT');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      for (const [relativePath, contents] of Object.entries(task.files)) {
        writeWorkspaceFile(workspaceDir, relativePath, contents);
      }
      writeWorkspaceFile(
        workspaceDir,
        'src/decision.ts',
        'export const runtimeDecision = { region: "north", mode: "warmup", guard: "review" };\n',
      );
      writeWorkspaceFile(
        workspaceDir,
        'decision.txt',
        'region=north mode=warmup guard=review\n',
      );
      writeWorkspaceFile(workspaceDir, 'm3-done.txt', 'done\n');

      expect(await task.oracle('', workspaceDir)).toBe(false);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('rejects the state-machine task when a terminal state can restart', async () => {
    const task = getRealBenchmarkSeedTask(
      'M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR',
    );
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      for (const [relativePath, contents] of Object.entries(task.files)) {
        writeWorkspaceFile(workspaceDir, relativePath, contents);
      }
      writeWorkspaceFile(
        workspaceDir,
        'src/flow.ts',
        'const allowedTransitions: Record<string, string[]> = {\n  queued: ["running"],\n  running: ["done", "failed"],\n  failed: ["running"],\n  done: [],\n};\n\nexport function canTransition(from: string, to: string) {\n  return allowedTransitions[from]?.includes(to) ?? false;\n}\n',
      );
      writeWorkspaceFile(workspaceDir, 'm3-done.txt', 'done\n');

      expect(await task.oracle('', workspaceDir)).toBe(false);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('accepts the compatible adapter migration when internals move to stable-v2 and the facade remains', async () => {
    const task = getRealBenchmarkSeedTask(
      'M3-BM-16-COMPATIBLE-ADAPTER-MIGRATION',
    );
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      for (const [relativePath, contents] of Object.entries(task.files)) {
        writeWorkspaceFile(workspaceDir, relativePath, contents);
      }
      writeWorkspaceFile(
        workspaceDir,
        'src/adapters/v1.ts',
        'import { createStablePayload } from "./v2.js";\n\nexport function buildPayload(input: string) {\n  return createStablePayload(input);\n}\n',
      );
      writeWorkspaceFile(
        workspaceDir,
        'src/registry.ts',
        'import { createStablePayload } from "./adapters/v2.js";\n\nexport const defaultAdapter = "stable-v2";\nexport const adapter = createStablePayload;\n',
      );
      writeWorkspaceFile(workspaceDir, 'm3-done.txt', 'done\n');

      expect(await task.oracle('', workspaceDir)).toBe(true);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('rejects guarded implementation repairs when protected docs are edited', async () => {
    const task = getRealBenchmarkSeedTask('M3-BM-22-NEGATIVE-SPACE-PRESERVE');
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pollux-real-tasks-'),
    );

    try {
      for (const [relativePath, contents] of Object.entries(task.files)) {
        writeWorkspaceFile(workspaceDir, relativePath, contents);
      }
      writeWorkspaceFile(
        workspaceDir,
        'src/tax.ts',
        'export function totalWithTax(subtotal: number, discount: number, taxRate: number) {\n  return (subtotal - discount) * (1 + taxRate);\n}\n',
      );
      writeWorkspaceFile(
        workspaceDir,
        'docs/tax.md',
        'Changed docs to match an implementation-only repair.\n',
      );
      writeWorkspaceFile(workspaceDir, 'm3-done.txt', 'done\n');

      expect(await task.oracle('', workspaceDir)).toBe(false);
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
