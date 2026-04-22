/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('Pollux legacy detector guard', () => {
  it('rejects reintroduction of legacy detector surface symbols', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const script = path.join(repoRoot, 'scripts', 'pollux-legacy-guard.js');

    expect(() => {
      execFileSync(process.execPath, [script], {
        cwd: repoRoot,
        stdio: 'pipe',
        env: process.env,
      });
    }).not.toThrow();
  });
});
