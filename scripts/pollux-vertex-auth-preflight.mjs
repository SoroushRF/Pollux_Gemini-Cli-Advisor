/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Preflight-only Vertex AI auth + model reachability check for Pollux.
 * Does not run benchmarks. Makes two tiny generateContent calls.
 *
 * Usage:
 *   node scripts/pollux-vertex-auth-preflight.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';
import {
  applyPolluxVertexEnv,
  buildSweBenchmarkSettings,
  loadPolluxDotEnvFile,
  POLLUX_BENCHMARK_AUTH_TYPE,
  resolvePolluxVertexEnv,
} from './pollux-swebench-runner-lib.mjs';
import { inspectNonInteractiveAuthReadiness } from './pollux-deepswe-runner-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const outDir = path.join(
  repoRoot,
  'evaluation_results',
  'pollux-vertex-auth-preflight',
);

const MODELS = ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fail(message, details) {
  const err = new Error(message);
  err.details = details;
  throw err;
}

async function getAccessToken() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token =
    typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    fail('Failed to obtain ADC access token for Vertex AI.');
  }
  return token;
}

async function pingModel({ project, location, model, token }) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const started = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: ok' }] }],
      generationConfig: { maxOutputTokens: 16, temperature: 0 },
    }),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return {
    model,
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - started,
    preview:
      json?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter(Boolean)
        .join('')
        ?.slice(0, 120) ?? null,
    error:
      response.ok
        ? null
        : json?.error?.message || text.slice(0, 400) || `HTTP ${response.status}`,
  };
}

async function main() {
  loadPolluxDotEnvFile(path.join(repoRoot, '.env'));
  // Prefer Vertex over any lingering Gemini Developer API key in the shell.
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENAI_USE_GCA;
  applyPolluxVertexEnv(process.env);

  ensureDir(outDir);
  const readiness = inspectNonInteractiveAuthReadiness(process.env);
  const vertexEnv = resolvePolluxVertexEnv(process.env);
  const settingsSample = buildSweBenchmarkSettings(
    {
      id: 'A',
      modelName: 'gemini-3-flash-preview',
      pollux: {
        enabled: false,
        executorModel: 'gemini-3-flash-preview',
        advisorModel: undefined,
        advisorFallbackModel: null,
      },
    },
    path.join(outDir, 'telemetry.log'),
    path.join(outDir, 'trace.jsonl'),
    1,
  );

  const report = {
    timestamp: new Date().toISOString(),
    authTypeExpected: POLLUX_BENCHMARK_AUTH_TYPE,
    authTypeInSettings: settingsSample.security?.auth?.selectedType ?? null,
    vertexEnv,
    readiness,
    modelPings: [],
  };

  fs.writeFileSync(
    path.join(outDir, 'auth-preflight.json'),
    `${JSON.stringify(readiness, null, 2)}\n`,
  );

  if (settingsSample.security.auth.selectedType !== POLLUX_BENCHMARK_AUTH_TYPE) {
    fail('Benchmark settings still not pinned to vertex-ai.', report);
  }
  if (!readiness.ok || readiness.authMode !== 'vertex-ai') {
    fail('Vertex auth readiness failed.', report);
  }
  if (!vertexEnv.GOOGLE_CLOUD_PROJECT || vertexEnv.GOOGLE_CLOUD_LOCATION !== 'global') {
    fail('Vertex project/location misconfigured (need project + location=global).', report);
  }

  const token = await getAccessToken();
  for (const model of MODELS) {
    const result = await pingModel({
      project: vertexEnv.GOOGLE_CLOUD_PROJECT,
      location: vertexEnv.GOOGLE_CLOUD_LOCATION,
      model,
      token,
    });
    report.modelPings.push(result);
    if (!result.ok) {
      fs.writeFileSync(
        path.join(outDir, 'preflight-report.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      fail(`Vertex model ping failed for ${model}: ${result.error}`, report);
    }
  }

  report.ok = true;
  fs.writeFileSync(
    path.join(outDir, 'preflight-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        authMode: readiness.authMode,
        project: vertexEnv.GOOGLE_CLOUD_PROJECT,
        location: vertexEnv.GOOGLE_CLOUD_LOCATION,
        settingsAuth: settingsSample.security.auth.selectedType,
        models: report.modelPings.map((ping) => ({
          model: ping.model,
          status: ping.status,
          latencyMs: ping.latencyMs,
        })),
        reportPath: path.join(outDir, 'preflight-report.json'),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
        details: error.details ?? null,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
