/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * DeepSWE eval-matrix ledger: Fresh5 seed + forward-credit merge + rebuild.
 */

import * as fs from 'node:fs';
import path from 'node:path';

export const LEDGER_SCHEMA_VERSION = 1;
export const TARGET_REPEATS = 4;
export const MIN_REPEATS = 3;

export const DEEPSWE_PRIMARY_TASKS = [
  'wazero-multi-module-snapshots',
  'ts-pattern-match-each',
  'true-myth-iterable-collection-combinators',
  'testem-per-launcher-reports',
  'opa-rego-rule-profiling',
  'ofetch-per-origin-circuit-breaker',
  'psd-tools-blend-range-api',
  'ipython-session-bundle-replay',
  'ytt-jsonpath-query-api',
  'kombu-single-active-consumer-priority',
];

export const DEEPSWE_CONDITIONS = ['A', 'E', 'FD'];

export const FRESH5_TASKS = DEEPSWE_PRIMARY_TASKS.slice(0, 5);

/** Fresh5 FD credited baseline (audited). */
export const FRESH5_FD_SEED = {
  'wazero-multi-module-snapshots': { n: 2, resolved: 2 },
  'ts-pattern-match-each': { n: 2, resolved: 1 },
  'true-myth-iterable-collection-combinators': { n: 2, resolved: 0 },
  'testem-per-launcher-reports': { n: 2, resolved: 0 },
  'opa-rego-rule-profiling': { n: 2, resolved: 1 },
};

export function cellKey(taskId, condition) {
  return `${taskId}|${condition}`;
}

export function resolveDeepSweLedgerPath(repoRoot) {
  return path.join(repoRoot, 'artifacts', 'pollux', 'deepswe-ledger.json');
}

export function resolveDeepSweRunsRoot(repoRoot) {
  return path.join(repoRoot, 'artifacts', 'pollux', 'deepswe-runs');
}

export function emptyCell() {
  return { credited: [], attempts: [], invalid: [] };
}

export function ensureCell(ledger, taskId, condition) {
  const key = cellKey(taskId, condition);
  if (!ledger.cells[key]) {
    ledger.cells[key] = emptyCell();
  }
  return ledger.cells[key];
}

function emptyCells() {
  const cells = {};
  for (const taskId of DEEPSWE_PRIMARY_TASKS) {
    for (const condition of DEEPSWE_CONDITIONS) {
      cells[cellKey(taskId, condition)] = emptyCell();
    }
  }
  return cells;
}

/**
 * Build seed credited rows for Fresh5 FD.
 */
export function buildFresh5FdSeedEntries() {
  const entries = [];
  for (const taskId of FRESH5_TASKS) {
    const seed = FRESH5_FD_SEED[taskId];
    if (!seed) continue;
    for (let repeat = 1; repeat <= seed.n; repeat++) {
      entries.push({
        taskId,
        condition: 'FD',
        entry: {
          repeat,
          resolved: repeat <= seed.resolved,
          source: 'fresh5-seed',
          runId: null,
          sampleId: null,
        },
      });
    }
  }
  return entries;
}

export function createEmptyLedger(now = new Date()) {
  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    targetRepeats: TARGET_REPEATS,
    minRepeats: MIN_REPEATS,
    tasks: [...DEEPSWE_PRIMARY_TASKS],
    conditions: [...DEEPSWE_CONDITIONS],
    seed: {
      kind: 'fresh5-fd',
      validSamples: 10,
      resolvedSamples: 4,
    },
    cells: emptyCells(),
    campaigns: [],
  };
}

export function applyFresh5Seed(ledger) {
  for (const { taskId, condition, entry } of buildFresh5FdSeedEntries()) {
    const cell = ensureCell(ledger, taskId, condition);
    const exists = cell.credited.some(
      (row) => row.source === 'fresh5-seed' && row.repeat === entry.repeat,
    );
    if (!exists) {
      cell.credited.push({ ...entry });
    }
  }
  return ledger;
}

export function createSeededLedger(now = new Date()) {
  return applyFresh5Seed(createEmptyLedger(now));
}

export function countCredited(ledger) {
  let credited = 0;
  let resolved = 0;
  for (const cell of Object.values(ledger.cells ?? {})) {
    for (const row of cell.credited ?? []) {
      credited++;
      if (row.resolved) resolved++;
    }
  }
  return { credited, resolved };
}

export function targetTotal(ledger = null) {
  const tasks = ledger?.tasks?.length ?? DEEPSWE_PRIMARY_TASKS.length;
  const conditions = ledger?.conditions?.length ?? DEEPSWE_CONDITIONS.length;
  const repeats = ledger?.targetRepeats ?? TARGET_REPEATS;
  return tasks * conditions * repeats;
}

/**
 * Classify a run.json-like record for ledger merge.
 */
export function classifySampleForLedger(record) {
  if (!record || typeof record !== 'object') {
    return { kind: 'skip', reason: 'missing_record' };
  }
  if (record.valid_for_score === true) {
    return {
      kind: 'valid',
      resolved: record.resolved === true || record.score_bucket === 'resolved',
    };
  }
  const bucket = record.score_bucket ?? 'incomplete';
  if (bucket === 'invalid' || record.invalidation_reason) {
    return { kind: 'invalid' };
  }
  return { kind: 'attempt' };
}

function sampleIdentity(entry) {
  if (entry.sampleId) return `sample:${entry.sampleId}`;
  if (entry.source === 'fresh5-seed') {
    return `seed:${entry.repeat}`;
  }
  if (entry.runId != null && entry.repeat != null) {
    return `run:${entry.runId}:r${entry.repeat}`;
  }
  return null;
}

function alreadyHasIdentity(list, entry) {
  const id = sampleIdentity(entry);
  if (!id) return false;
  return list.some((row) => sampleIdentity(row) === id);
}

/**
 * Merge one sample into a ledger (mutates). Idempotent by sampleId / seed repeat.
 *
 * @param {object} options
 * @param {boolean} [options.allowCredit=true] When false, valid samples go to attempts only
 *   (used when live-updating without forward credit — prefer true for ledgerCredit campaigns).
 */
export function mergeSampleIntoLedger(ledger, record, meta = {}) {
  const {
    runId = null,
    allowCredit = true,
    source = 'run',
  } = meta;

  const taskId = record.task_id ?? record.taskId;
  const condition = record.condition;
  if (!taskId || !condition) {
    return { merged: false, reason: 'missing_task_or_condition' };
  }
  if (!DEEPSWE_PRIMARY_TASKS.includes(taskId)) {
    return { merged: false, reason: 'unknown_task' };
  }
  if (!DEEPSWE_CONDITIONS.includes(condition)) {
    return { merged: false, reason: 'unknown_condition' };
  }

  const cell = ensureCell(ledger, taskId, condition);
  const classification = classifySampleForLedger(record);
  const entry = {
    repeat: record.repeat ?? null,
    resolved: classification.resolved === true,
    source,
    runId,
    sampleId: record.sample_id ?? record.sampleId ?? null,
    score_bucket: record.score_bucket ?? null,
    invalidation_reason:
      record.invalidation_reason ??
      record.verifier_invalidation_reason ??
      null,
    totalTokens: record.totalTokens ?? null,
    verifier_exit_code: record.verifier_exit_code ?? null,
    workspace_retained: record.workspace_retained ?? null,
    verifier_workspace_staged: record.verifier_workspace_staged ?? null,
  };

  if (classification.kind === 'skip') {
    return { merged: false, reason: classification.reason };
  }

  if (classification.kind === 'invalid') {
    if (!alreadyHasIdentity(cell.invalid, entry)) {
      cell.invalid.push(entry);
    }
    touchLedger(ledger);
    return { merged: true, bucket: 'invalid' };
  }

  if (classification.kind === 'attempt' || !allowCredit) {
    if (!alreadyHasIdentity(cell.attempts, entry) && !alreadyHasIdentity(cell.credited, entry)) {
      cell.attempts.push(entry);
    }
    touchLedger(ledger);
    return { merged: true, bucket: 'attempts' };
  }

  // valid + allowCredit
  if (alreadyHasIdentity(cell.credited, entry) || alreadyHasIdentity(cell.attempts, entry)) {
    return { merged: false, reason: 'duplicate' };
  }

  if (cell.credited.length < TARGET_REPEATS) {
    // Prefer next repeat slot for display if missing
    if (entry.repeat == null) {
      entry.repeat = cell.credited.length + 1;
    }
    cell.credited.push(entry);
    touchLedger(ledger);
    return { merged: true, bucket: 'credited' };
  }

  cell.attempts.push({ ...entry, surplus: true });
  touchLedger(ledger);
  return { merged: true, bucket: 'attempts' };
}

export function touchLedger(ledger, now = new Date()) {
  ledger.updatedAt = now.toISOString();
  return ledger;
}

export function upsertCampaign(ledger, campaign) {
  if (!campaign?.runId) return ledger;
  const idx = ledger.campaigns.findIndex((c) => c.runId === campaign.runId);
  if (idx >= 0) {
    ledger.campaigns[idx] = { ...ledger.campaigns[idx], ...campaign };
  } else {
    ledger.campaigns.push(campaign);
  }
  touchLedger(ledger);
  return ledger;
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function walkRunJsonFiles(rawRoot, out = []) {
  if (!fs.existsSync(rawRoot)) return out;
  const entries = fs.readdirSync(rawRoot, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rawRoot, entry.name);
    if (entry.isDirectory()) {
      walkRunJsonFiles(full, out);
    } else if (entry.isFile() && entry.name === 'run.json') {
      out.push(full);
    }
  }
  return out;
}

function campaignRelativePath(repoRoot, runDir) {
  return path
    .relative(repoRoot, runDir)
    .split(path.sep)
    .join('/');
}

/**
 * Build campaign summary from a run directory (does not credit cells).
 */
export function buildCampaignFromRunDir(repoRoot, runDir) {
  const runId = path.basename(runDir);
  const manifest = readJsonIfExists(path.join(runDir, 'manifest.json')) ?? {};
  const summary = readJsonIfExists(path.join(runDir, 'summary.json'));
  const auth = readJsonIfExists(path.join(runDir, 'auth-preflight.json'));
  const baseline = readJsonIfExists(
    path.join(runDir, 'baseline-verifier-preflight.json'),
  );
  const preflight = readJsonIfExists(path.join(runDir, 'preflight.json'));
  const runJsonPaths = walkRunJsonFiles(path.join(runDir, 'raw'));
  let sampleCount = runJsonPaths.length;
  if (summary?.total != null) sampleCount = summary.total;

  return {
    runId,
    startedAt: manifest.startedAt ?? null,
    finishedAt: summary ? (manifest.finishedAt ?? null) : null,
    conditions: manifest.conditions ?? [],
    taskIds: manifest.taskIds ?? manifest.taskIdsFilter ?? [],
    sampleCount,
    path: campaignRelativePath(repoRoot, runDir),
    ledgerCredit: manifest.ledgerCredit === true,
    mode: manifest.mode ?? null,
    summary: summary
      ? {
          total: summary.total,
          valid_for_score: summary.valid_for_score,
          resolved: summary.resolved,
          invalid: summary.invalid,
          unresolved: summary.unresolved,
        }
      : null,
    authOk: auth?.ok ?? null,
    baselinePreflightOk: baseline?.ok ?? null,
    preflightOk: preflight?.ok ?? null,
  };
}

/**
 * Rebuild ledger from disk: seed + campaigns listing + credit only ledgerCredit runs.
 */
export function rebuildLedgerFromDisk(repoRoot, now = new Date()) {
  const ledger = createSeededLedger(now);
  const runsRoot = resolveDeepSweRunsRoot(repoRoot);
  if (!fs.existsSync(runsRoot)) {
    return ledger;
  }

  const runDirs = fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(runsRoot, d.name))
    .sort();

  for (const runDir of runDirs) {
    const campaign = buildCampaignFromRunDir(repoRoot, runDir);
    upsertCampaign(ledger, campaign);

    if (!campaign.ledgerCredit) {
      continue;
    }

    const runJsonPaths = walkRunJsonFiles(path.join(runDir, 'raw'));
    for (const runJsonPath of runJsonPaths) {
      const record = readJsonIfExists(runJsonPath);
      if (!record) continue;
      mergeSampleIntoLedger(ledger, record, {
        runId: campaign.runId,
        allowCredit: true,
        source: 'run',
      });
    }
  }

  touchLedger(ledger, now);
  return ledger;
}

/**
 * Live update after a sample is written. Credits when allowCredit is true.
 */
export function updateLedgerFromSample(repoRoot, record, meta = {}) {
  const ledgerPath = resolveDeepSweLedgerPath(repoRoot);
  let ledger;
  if (fs.existsSync(ledgerPath)) {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    if (!ledger.cells) ledger.cells = emptyCells();
    if (!ledger.campaigns) ledger.campaigns = [];
  } else {
    ledger = createSeededLedger();
  }

  const runId = meta.runId ?? null;
  const allowCredit = meta.allowCredit !== false;

  mergeSampleIntoLedger(ledger, record, {
    runId,
    allowCredit,
    source: meta.source ?? 'run',
  });

  if (runId && meta.campaign) {
    upsertCampaign(ledger, meta.campaign);
  } else if (runId && meta.runDir) {
    upsertCampaign(ledger, buildCampaignFromRunDir(repoRoot, meta.runDir));
  }

  writeLedger(repoRoot, ledger);
  return ledger;
}

export function writeLedger(repoRoot, ledger) {
  const ledgerPath = resolveDeepSweLedgerPath(repoRoot);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  touchLedger(ledger);
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledgerPath;
}

export function readLedger(repoRoot) {
  const ledgerPath = resolveDeepSweLedgerPath(repoRoot);
  if (!fs.existsSync(ledgerPath)) return null;
  return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
}

/**
 * Safe wrapper for runner: never throws into scoring path.
 */
export function tryUpdateLedgerFromSample(repoRoot, record, meta = {}) {
  try {
    return {
      ok: true,
      ledger: updateLedgerFromSample(repoRoot, record, meta),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
