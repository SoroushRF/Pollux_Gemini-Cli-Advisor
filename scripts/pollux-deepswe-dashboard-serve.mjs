/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Serve the DeepSWE matrix dashboard + ledger JSON locally.
 *
 * Usage:
 *   node scripts/pollux-deepswe-dashboard-serve.mjs
 *   # open http://127.0.0.1:8787/
 */

import * as fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDeepSweLedgerPath } from './pollux-deepswe-ledger-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const dashboardDir = path.join(
  repoRoot,
  'docs',
  'core',
  'pollux',
  'deepswe-dashboard',
);
const PORT = Number(process.env.POLLUX_DEEPSWE_DASHBOARD_PORT ?? 8787);
const HOST = process.env.POLLUX_DEEPSWE_DASHBOARD_HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function send(res, status, body, contentType, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const cleaned = decoded.replace(/^\/+/, '');
  const full = path.normalize(path.join(root, cleaned));
  if (!full.startsWith(root)) {
    return null;
  }
  return full;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

  if (url.pathname === '/deepswe-ledger.json') {
    const ledgerPath = resolveDeepSweLedgerPath(repoRoot);
    if (!fs.existsSync(ledgerPath)) {
      send(
        res,
        404,
        JSON.stringify({
          error: 'ledger_missing',
          hint: 'node scripts/pollux-deepswe-ledger-rebuild.mjs',
          path: ledgerPath,
        }),
        'application/json; charset=utf-8',
      );
      return;
    }
    send(
      res,
      200,
      fs.readFileSync(ledgerPath),
      'application/json; charset=utf-8',
    );
    return;
  }

  let requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = safeJoin(dashboardDir, requestPath);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, fs.readFileSync(filePath), MIME[ext] ?? 'application/octet-stream');
});

server.listen(PORT, HOST, () => {
  console.log(`[deepswe-dashboard] serving ${dashboardDir}`);
  console.log(`[deepswe-dashboard] ledger ${resolveDeepSweLedgerPath(repoRoot)}`);
  console.log(`[deepswe-dashboard] open http://${HOST}:${PORT}/`);
});
