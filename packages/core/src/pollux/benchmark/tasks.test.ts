/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BENCHMARK_CORPUS, type BenchmarkTask } from './tasks.js';

/**
 * P4-01 oracle reliability checks.
 *
 * The corpus oracles are the entire accuracy contract for the Pollux
 * benchmark. If they accept wrong outputs as success the resulting
 * "accuracy=100%" reports are vacuous, and if they reject correct outputs
 * the comparison across A-E conditions is invalid. These tests pin the
 * oracle decision boundaries with positive and negative fixtures rather
 * than relying on the model harness to discover oracle bugs at runtime.
 */
describe('Pollux benchmark corpus oracle reliability', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'pollux-corpus-oracle-'));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  function task(id: string): BenchmarkTask {
    const found = BENCHMARK_CORPUS.find((entry) => entry.id === id);
    if (!found) {
      throw new Error(`corpus task missing: ${id}`);
    }
    return found;
  }

  // Oracles return `boolean | Promise<boolean>`. Wrap in `Promise.resolve` so
  // the test assertions work uniformly on either return shape and we don't
  // assume one specific implementation strategy in the corpus.
  function evalOracle(t: BenchmarkTask): Promise<boolean> {
    return Promise.resolve(t.oracle('', workspaceDir));
  }

  describe('CAL-BM-01-SIMPLE', () => {
    const target = () => task('CAL-BM-01-SIMPLE');

    it('passes when hello.sh contains the required string', async () => {
      writeFileSync(
        join(workspaceDir, 'hello.sh'),
        '#!/usr/bin/env bash\necho "Hello Benchmark"\n',
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(true);
    });

    it('fails when hello.sh is missing', async () => {
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when hello.sh exists but lacks the marker string', async () => {
      writeFileSync(
        join(workspaceDir, 'hello.sh'),
        '#!/usr/bin/env bash\necho "wrong text"\n',
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });
  });

  describe('CAL-BM-02-MODERATE', () => {
    const target = () => task('CAL-BM-02-MODERATE');

    it('passes for valid 2-row JSON with the expected schema', async () => {
      writeFileSync(
        join(workspaceDir, 'data.json'),
        JSON.stringify([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ]),
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(true);
    });

    it('fails when data.json is missing', async () => {
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when data.json is not valid JSON', async () => {
      writeFileSync(join(workspaceDir, 'data.json'), 'not json {{', 'utf8');
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when data.json is not an array', async () => {
      writeFileSync(
        join(workspaceDir, 'data.json'),
        JSON.stringify({ name: 'Alice', age: 30 }),
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when row count is wrong', async () => {
      writeFileSync(
        join(workspaceDir, 'data.json'),
        JSON.stringify([{ name: 'Alice', age: 30 }]),
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when first row name is wrong', async () => {
      writeFileSync(
        join(workspaceDir, 'data.json'),
        JSON.stringify([
          { name: 'Carol', age: 30 },
          { name: 'Bob', age: 25 },
        ]),
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });
  });

  describe('CAL-BM-03-COMPLEX', () => {
    const target = () => task('CAL-BM-03-COMPLEX');

    function writeRefactor(legacyContent: string, marker: string) {
      mkdirSync(join(workspaceDir, 'src'), { recursive: true });
      writeFileSync(
        join(workspaceDir, 'src', 'legacy_app.js'),
        legacyContent,
        'utf8',
      );
      writeFileSync(join(workspaceDir, 'test-result.txt'), marker, 'utf8');
    }

    it('passes for a clean refactor and a true marker', async () => {
      writeRefactor(
        'function oldAlgo() { return { status: 200, message: "OK" }; }\nmodule.exports = oldAlgo;\n',
        'true\n',
      );
      await expect(evalOracle(target())).resolves.toBe(true);
    });

    it('fails when test-result.txt is missing', async () => {
      mkdirSync(join(workspaceDir, 'src'), { recursive: true });
      writeFileSync(
        join(workspaceDir, 'src', 'legacy_app.js'),
        'function oldAlgo() { return { status: 200, message: "OK" }; }\nmodule.exports = oldAlgo;\n',
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when legacy_app.js is missing', async () => {
      writeFileSync(join(workspaceDir, 'test-result.txt'), 'true', 'utf8');
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when status remains 500 (regression detection)', async () => {
      writeRefactor(
        'function oldAlgo() { return { status: 500, message: "OK" }; }\nmodule.exports = oldAlgo;\n',
        'true',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when "Deprecation block" is still present (regression detection)', async () => {
      writeRefactor(
        'function oldAlgo() { return { status: 200, message: "OK" }; }\n// Deprecation block remains\nmodule.exports = oldAlgo;\n',
        'true',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when message is not "OK"', async () => {
      writeRefactor(
        'function oldAlgo() { return { status: 200, message: "Done" }; }\nmodule.exports = oldAlgo;\n',
        'true',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when the marker is not exactly "true"', async () => {
      writeRefactor(
        'function oldAlgo() { return { status: 200, message: "OK" }; }\nmodule.exports = oldAlgo;\n',
        'maybe',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });
  });

  describe('CAL-BM-04-ESCALATING', () => {
    const target = () => task('CAL-BM-04-ESCALATING');

    it('is marked as an escalating task and exposes a custom resume prompt', () => {
      const t = target();
      expect(t.escalates).toBe(true);
      expect(typeof t.resumePrompt).toBe('string');
      expect(t.resumePrompt!.length).toBeGreaterThan(0);
    });

    it('passes when escalation-marker.txt contains exactly "advised"', async () => {
      writeFileSync(
        join(workspaceDir, 'escalation-marker.txt'),
        'advised\n',
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(true);
    });

    it('fails when the marker file is missing', async () => {
      await expect(evalOracle(target())).resolves.toBe(false);
    });

    it('fails when the marker contents do not match exactly', async () => {
      writeFileSync(
        join(workspaceDir, 'escalation-marker.txt'),
        'something else',
        'utf8',
      );
      await expect(evalOracle(target())).resolves.toBe(false);
    });
  });
});
