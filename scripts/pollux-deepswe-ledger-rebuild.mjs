/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rebuild DeepSWE matrix ledger from seed + disk (forward-credit only).
 *
 * Usage:
 *   node scripts/pollux-deepswe-ledger-rebuild.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countCredited,
  rebuildLedgerFromDisk,
  targetTotal,
  writeLedger,
} from './pollux-deepswe-ledger-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const ledger = rebuildLedgerFromDisk(repoRoot);
const ledgerPath = writeLedger(repoRoot, ledger);
const { credited, resolved } = countCredited(ledger);
const total = targetTotal(ledger);
const pct = total > 0 ? Math.round((credited / total) * 100) : 0;

console.log(`[deepswe-ledger] wrote ${ledgerPath}`);
console.log(
  `[deepswe-ledger] credited ${credited}/${total} (${pct}%), resolved ${resolved}/${credited || 0}`,
);
console.log(
  `[deepswe-ledger] campaigns indexed: ${ledger.campaigns.length}`,
);
