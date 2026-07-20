/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TARGET_REPEATS,
  cellKey,
  countCredited,
  createSeededLedger,
  mergeSampleIntoLedger,
  rebuildLedgerFromDisk,
  targetTotal,
  updateLedgerFromSample,
} from '../pollux-deepswe-ledger-lib.mjs';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return { ...actual, default: actual };
});
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return { ...actual, default: actual };
});

const tempRoots = [];

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-ledger-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'artifacts', 'pollux', 'deepswe-runs'), {
    recursive: true,
  });
  return root;
}

function writeRunCampaign(repoRoot, runId, { ledgerCredit, records }) {
  const runDir = path.join(
    repoRoot,
    'artifacts',
    'pollux',
    'deepswe-runs',
    runId,
  );
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'manifest.json'),
    `${JSON.stringify(
      {
        runId,
        ledgerCredit: ledgerCredit === true,
        conditions: ['E'],
        taskIds: ['ofetch-per-origin-circuit-breaker'],
        mode: 'run',
      },
      null,
      2,
    )}\n`,
  );
  for (const record of records) {
    const rawDir = path.join(
      runDir,
      'raw',
      record.condition,
      record.task_id,
      record.sample_id,
    );
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(
      path.join(rawDir, 'run.json'),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  }
  return runDir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('pollux-deepswe-ledger-lib', () => {
  it('seeds Fresh5 FD to 10 credited (~8% of 120)', () => {
    const ledger = createSeededLedger();
    const { credited, resolved } = countCredited(ledger);
    expect(credited).toBe(10);
    expect(resolved).toBe(4);
    expect(targetTotal(ledger)).toBe(120);
    expect(Math.round((credited / 120) * 100)).toBe(8);

    const wazero = ledger.cells[cellKey('wazero-multi-module-snapshots', 'FD')];
    expect(wazero.credited).toHaveLength(2);
    expect(wazero.credited.every((r) => r.source === 'fresh5-seed')).toBe(true);
    expect(wazero.credited.filter((r) => r.resolved).length).toBe(2);

    const aCell = ledger.cells[cellKey('wazero-multi-module-snapshots', 'A')];
    expect(aCell.credited).toHaveLength(0);
  });

  it('does not credit invalid samples toward n', () => {
    const ledger = createSeededLedger();
    const before = countCredited(ledger).credited;
    mergeSampleIntoLedger(
      ledger,
      {
        task_id: 'ofetch-per-origin-circuit-breaker',
        condition: 'A',
        sample_id: 'A__ofetch__r01',
        repeat: 1,
        valid_for_score: false,
        score_bucket: 'invalid',
        invalidation_reason: 'runner_exception',
        resolved: false,
      },
      { runId: 'new-run', allowCredit: true },
    );
    expect(countCredited(ledger).credited).toBe(before);
    const cell =
      ledger.cells[cellKey('ofetch-per-origin-circuit-breaker', 'A')];
    expect(cell.invalid).toHaveLength(1);
    expect(cell.credited).toHaveLength(0);
  });

  it('sends surplus past n=4 to attempts', () => {
    const ledger = createSeededLedger();
    const taskId = 'ofetch-per-origin-circuit-breaker';
    for (let i = 1; i <= TARGET_REPEATS + 2; i++) {
      mergeSampleIntoLedger(
        ledger,
        {
          task_id: taskId,
          condition: 'A',
          sample_id: `A__ofetch__r${String(i).padStart(2, '0')}`,
          repeat: i,
          valid_for_score: true,
          score_bucket: 'unresolved',
          resolved: false,
        },
        { runId: 'forward-run', allowCredit: true },
      );
    }
    const cell = ledger.cells[cellKey(taskId, 'A')];
    expect(cell.credited).toHaveLength(4);
    expect(cell.attempts.filter((a) => a.surplus)).toHaveLength(2);
  });

  it('rebuild lists historical campaigns but does not auto-credit them', () => {
    const repoRoot = makeTempRepo();
    writeRunCampaign(repoRoot, 'old-historical-E', {
      ledgerCredit: false,
      records: [
        {
          task_id: 'ofetch-per-origin-circuit-breaker',
          condition: 'E',
          sample_id: 'E__ofetch__r01',
          repeat: 1,
          valid_for_score: true,
          score_bucket: 'resolved',
          resolved: true,
        },
      ],
    });

    const ledger = rebuildLedgerFromDisk(repoRoot);
    expect(countCredited(ledger).credited).toBe(10);
    expect(ledger.campaigns.some((c) => c.runId === 'old-historical-E')).toBe(
      true,
    );
    const cell =
      ledger.cells[cellKey('ofetch-per-origin-circuit-breaker', 'E')];
    expect(cell.credited).toHaveLength(0);
  });

  it('rebuild credits valid samples from ledgerCredit campaigns', () => {
    const repoRoot = makeTempRepo();
    writeRunCampaign(repoRoot, 'new-forward-E', {
      ledgerCredit: true,
      records: [
        {
          task_id: 'ofetch-per-origin-circuit-breaker',
          condition: 'E',
          sample_id: 'E__ofetch__r01',
          repeat: 1,
          valid_for_score: true,
          score_bucket: 'resolved',
          resolved: true,
        },
        {
          task_id: 'ofetch-per-origin-circuit-breaker',
          condition: 'E',
          sample_id: 'E__ofetch__r02',
          repeat: 2,
          valid_for_score: false,
          score_bucket: 'invalid',
          invalidation_reason: 'patch_apply_failed',
          resolved: false,
        },
      ],
    });

    const ledger = rebuildLedgerFromDisk(repoRoot);
    expect(countCredited(ledger).credited).toBe(11);
    const cell =
      ledger.cells[cellKey('ofetch-per-origin-circuit-breaker', 'E')];
    expect(cell.credited).toHaveLength(1);
    expect(cell.credited[0].resolved).toBe(true);
    expect(cell.invalid).toHaveLength(1);
  });

  it('updateLedgerFromSample is idempotent and persists', () => {
    const repoRoot = makeTempRepo();
    const record = {
      task_id: 'ytt-jsonpath-query-api',
      condition: 'A',
      sample_id: 'A__ytt__r01',
      repeat: 1,
      valid_for_score: true,
      score_bucket: 'unresolved',
      resolved: false,
    };
    updateLedgerFromSample(repoRoot, record, {
      runId: 'live-1',
      allowCredit: true,
    });
    updateLedgerFromSample(repoRoot, record, {
      runId: 'live-1',
      allowCredit: true,
    });
    const ledger = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'artifacts', 'pollux', 'deepswe-ledger.json'),
        'utf8',
      ),
    );
    const cell = ledger.cells[cellKey('ytt-jsonpath-query-api', 'A')];
    expect(cell.credited).toHaveLength(1);
    expect(countCredited(ledger).credited).toBe(11);
  });
});
