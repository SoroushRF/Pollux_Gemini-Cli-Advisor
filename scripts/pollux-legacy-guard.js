#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const ROOTS = ['packages', 'docs'].map((p) => path.join(REPO_ROOT, p));

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.cursor',
  '.turbo',
]);

const INCLUDE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.cjs',
  '.mjs',
  '.md',
  '.json',
  '.snap',
]);

const FORBIDDEN = [
  'PolluxDetectorStrategy',
  'HEURISTIC_MATCH',
  'STRUCTURED_TAG',
  'HYBRID_RESOLUTION',
  'experimental.pollux.strategy',
  'confidenceThreshold',
  // Legacy detector module surfaces.
  'pollux/detector',
  '/pollux/detector',
  'from "../pollux/detector',
  "from '../pollux/detector",
];

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      walk(full, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name);
    if (!INCLUDE_EXT.has(ext)) continue;
    out.push(full);
  }
}

function scanFile(filePath) {
  const stat = fs.statSync(filePath);
  // Skip very large files.
  if (stat.size > 2_000_000) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const hits = [];
  for (const token of FORBIDDEN) {
    const idx = content.indexOf(token);
    if (idx === -1) continue;
    const line = content.slice(0, idx).split(/\r?\n/).length;
    hits.push({ token, line });
  }
  return hits;
}

function main() {
  const files = [];
  for (const root of ROOTS) {
    if (fs.existsSync(root)) {
      walk(root, files);
    }
  }

  const failures = [];
  for (const f of files) {
    const hits = scanFile(f);
    for (const h of hits) {
      failures.push({ file: f, ...h });
    }
  }

  if (failures.length === 0) {
    process.exitCode = 0;
    return;
  }

   
  console.error('Pollux legacy detector guard failed. Forbidden tokens found:');
  for (const f of failures) {
    const rel = path.relative(REPO_ROOT, f.file);
     
    console.error(`- ${rel}:${f.line} contains ${JSON.stringify(f.token)}`);
  }
  process.exitCode = 1;
}

main();
