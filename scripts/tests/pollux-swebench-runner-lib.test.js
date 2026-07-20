/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzePatch,
  applyPolluxVertexEnv,
  buildEntrypointMetadata,
  buildSweBenchmarkSettings,
  extractProviderFailureDetails,
  classifyProviderFailure,
  classifyRunResult,
  classifyToolPolicyFailure,
  loadPolluxDotEnvFile,
  parseRunnerArgs,
  resolveCliEntrypoint,
  summarizeRecords,
} from '../pollux-swebench-runner-lib.mjs';

describe('pollux SWE benchmark runner library', () => {
  it('parses reliability-mode arguments without consuming model tokens', () => {
    const args = parseRunnerArgs(
      [
        '--conditions',
        'E,FD',
        '--limit',
        '3',
        '--entrypoint',
        'binary',
        '--binary-path',
        '/tmp/gemini',
        '--fake-responses',
        '/tmp/fake.json',
        '--score-policy',
        'diagnostic',
      ],
      new Date('2026-05-03T00:00:00.000Z'),
    );

    expect(args).toMatchObject({
      conditions: ['E', 'FD'],
      limit: 3,
      entrypoint: 'binary',
      binaryPath: '/tmp/gemini',
      fakeResponsesPath: '/tmp/fake.json',
      scorePolicy: 'diagnostic',
      runId: 'run-2026-05-03T00-00-00-000Z',
    });
  });

  it('rejects ambiguous no-token patch modes', () => {
    expect(() =>
      parseRunnerArgs(['--gold-patch-mode', '--null-patch-mode']),
    ).toThrow(/only one/i);
    expect(() =>
      parseRunnerArgs(['--gold-patch-mode', '--fake-responses', 'fake.json']),
    ).toThrow(/cannot be combined/i);
  });

  it('resolves explicit binary entrypoints only when the path exists', () => {
    expect(() =>
      resolveCliEntrypoint({
        repoRoot: '/repo',
        entrypoint: 'binary',
        existsSync: () => false,
      }),
    ).toThrow(/requires --binary-path/i);

    const binaryPath = path.join('/tools', 'gemini');
    expect(
      resolveCliEntrypoint({
        repoRoot: '/repo',
        entrypoint: 'binary',
        binaryPath,
        existsSync: (candidate) => candidate === binaryPath,
      }),
    ).toMatchObject({
      kind: 'binary',
      command: binaryPath,
      initialArgs: [],
      path: binaryPath,
      publishableEligible: false,
    });
  });

  it('launches Windows command shims through cmd.exe', () => {
    const binaryPath = 'C:\\Users\\sorou\\AppData\\Roaming\\npm\\gemini.cmd';
    const entrypoint = resolveCliEntrypoint({
      repoRoot: 'C:\\repo',
      entrypoint: 'binary',
      binaryPath,
      existsSync: (candidate) => candidate === binaryPath,
    });

    if (process.platform === 'win32') {
      expect(entrypoint.command.toLowerCase()).toContain('cmd');
      expect(entrypoint.initialArgs).toEqual(['/d', '/s', '/c', binaryPath]);
    } else {
      expect(entrypoint.command).toBe(binaryPath);
      expect(entrypoint.initialArgs).toEqual([]);
    }
  });

  it('resolves bundle, dev_script, and auto entrypoints predictably', () => {
    const repoRoot = path.join('/repo', 'pollux');
    const bundlePath = path.join(repoRoot, 'bundle', 'gemini.js');
    const devScriptPath = path.join(repoRoot, 'scripts', 'start.js');

    expect(
      resolveCliEntrypoint({
        repoRoot,
        entrypoint: 'bundle',
        existsSync: (candidate) => candidate === bundlePath,
      }),
    ).toMatchObject({
      kind: 'bundle',
      path: bundlePath,
      publishableEligible: true,
    });

    expect(
      resolveCliEntrypoint({
        repoRoot,
        entrypoint: 'auto',
        existsSync: (candidate) => candidate === devScriptPath,
      }),
    ).toMatchObject({
      kind: 'dev_script',
      path: devScriptPath,
      publishableEligible: false,
    });
  });

  it('builds A/FD/E settings with the Pollux fairness pins', () => {
    const settings = buildSweBenchmarkSettings(
      {
        id: 'FD',
        modelName: 'gemini-3-flash-preview',
        pollux: {
          enabled: true,
          executorModel: 'gemini-3-flash-preview',
          advisorModel: 'gemini-3.1-pro-preview',
          advisorFallbackModel: null,
        },
      },
      '/tmp/telemetry.log',
      '/tmp/trace.jsonl',
      12,
    );

    expect(settings.sandbox).toBe(false);
    expect(settings.plan).toBe(false);
    expect(settings.security.auth.selectedType).toBe('vertex-ai');
    expect(settings.planSettings).toEqual({ modelRouting: false });
    expect(settings.model).toMatchObject({
      name: 'gemini-3-flash-preview',
      disableLoopDetection: true,
      maxSessionTurns: 12,
    });
    expect(settings.experimental.dynamicModelConfiguration).toBe(false);
    expect(settings.experimental.gemmaModelRouter.enabled).toBe(false);
    expect(settings.experimental.pollux).toMatchObject({
      enabled: true,
      executorModel: 'gemini-3-flash-preview',
      advisorModel: 'gemini-3.1-pro-preview',
      advisorFallbackModel: null,
      diagnosticTrace: {
        enabled: true,
        outputPath: '/tmp/trace.jsonl',
        includeAdvisorGuidanceText: true,
        includeModelThoughts: 'summary',
      },
    });
  });

  it('loads .env values and applies Vertex child env without Gemini API key shadowing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-dotenv-'));
    const envPath = path.join(tmp, '.env');
    fs.writeFileSync(
      envPath,
      'GOOGLE_CLOUD_PROJECT=proj-from-file\nGOOGLE_CLOUD_LOCATION=global\n',
    );
    const env = {};
    loadPolluxDotEnvFile(envPath, env);
    expect(env.GOOGLE_CLOUD_PROJECT).toBe('proj-from-file');
    const clean = applyPolluxVertexEnv({
      GEMINI_API_KEY: 'should-be-removed',
      GOOGLE_CLOUD_PROJECT: 'proj-from-file',
      GOOGLE_CLOUD_LOCATION: 'global',
    });
    expect(clean.GOOGLE_GENAI_USE_VERTEXAI).toBe('true');
    expect(clean.GOOGLE_CLOUD_LOCATION).toBe('global');
    expect(clean.GEMINI_API_KEY).toBeUndefined();
  });

  it('classifies quota, capacity, rate-limit, and tool-policy failures', () => {
    expect(classifyProviderFailure('', 'QUOTA_EXHAUSTED')).toBe(
      'quota_exhausted',
    );
    expect(
      classifyProviderFailure(
        '',
        'You have exhausted your capacity. MODEL_CAPACITY_EXHAUSTED. No capacity available for model gemini-3-flash-preview on the server.',
      ),
    ).toBe('model_capacity_exhausted');
    expect(classifyProviderFailure('No capacity available', '')).toBe(
      'model_capacity_exhausted',
    );
    expect(classifyProviderFailure('', 'status: 429')).toBe('rate_limited');
    expect(
      classifyProviderFailure(
        '',
        'request to https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse failed, reason: getaddrinfo ENOTFOUND cloudcode-pa.googleapis.com',
      ),
    ).toBe('provider_network_failure');
    expect(
      classifyToolPolicyFailure(
        '',
        'Shell tool requires user confirmation, which is not supported in non-interactive mode.',
      ),
    ).toBe('non_interactive_confirmation_required');

    expect(
      extractProviderFailureDetails(
        '',
        'Attempt 1 failed: No capacity available for model gemini-3.1-pro-preview on the server. status: 429 MODEL_CAPACITY_EXHAUSTED cloudcode-pa.googleapis.com',
      ),
    ).toMatchObject({
      kind: 'model_capacity_exhausted',
      model: 'gemini-3.1-pro-preview',
      status: 429,
      reason: 'MODEL_CAPACITY_EXHAUSTED',
      backend: 'cloudcode-pa.googleapis.com',
      account_quota_signal: false,
    });
  });

  it('marks provider and policy failures invalid instead of unresolved', () => {
    expect(
      classifyRunResult({
        stdout: '',
        stderr: 'MODEL_CAPACITY_EXHAUSTED',
        exitCode: 1,
        timedOut: false,
        patch: '',
        scorePolicy: 'strict',
      }),
    ).toMatchObject({
      valid_for_score: false,
      invalidation_reason: 'provider_failure',
      provider_failure_kind: 'model_capacity_exhausted',
      score_bucket: 'invalid',
    });

    expect(
      classifyRunResult({
        stdout: '',
        stderr:
          'Tool requires user confirmation, which is not supported in non-interactive mode.',
        exitCode: 1,
        timedOut: false,
        patch: '',
        scorePolicy: 'strict',
      }),
    ).toMatchObject({
      valid_for_score: false,
      invalidation_reason: 'tool_policy_failure',
      tool_policy_failure: 'non_interactive_confirmation_required',
      score_bucket: 'invalid',
    });

    expect(
      classifyRunResult({
        stdout: '',
        stderr:
          'FetchError: request to https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse failed, reason: getaddrinfo ENOTFOUND cloudcode-pa.googleapis.com',
        exitCode: 3221225794,
        timedOut: false,
        patch: '',
        patchCollectionFailed: true,
        scorePolicy: 'strict',
      }),
    ).toMatchObject({
      valid_for_score: false,
      invalidation_reason: 'provider_failure',
      provider_failure_kind: 'provider_network_failure',
      score_bucket: 'invalid',
    });
  });

  it('keeps recovered provider retry text scoreable when a patch exists', () => {
    const patch = [
      'diff --git a/src/file.ts b/src/file.ts',
      '--- a/src/file.ts',
      '+++ b/src/file.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    expect(
      classifyRunResult({
        stdout: '',
        stderr:
          'Attempt 1 failed: You have exhausted your capacity. MODEL_CAPACITY_EXHAUSTED. No capacity available for model gemini-3-flash-preview on the server.',
        exitCode: 0,
        timedOut: false,
        patch,
        scorePolicy: 'strict',
      }),
    ).toMatchObject({
      valid_for_score: true,
      invalidation_reason: null,
      provider_failure_kind: null,
      provider_failure_warning: 'model_capacity_exhausted',
      provider_failure_warning_details: {
        kind: 'model_capacity_exhausted',
        model: 'gemini-3-flash-preview',
        reason: 'MODEL_CAPACITY_EXHAUSTED',
      },
      warnings: ['model_capacity_retry'],
      score_bucket: 'unresolved',
    });
  });

  it('keeps recovered tool policy text scoreable when a patch exists', () => {
    const patch = [
      'diff --git a/src/file.ts b/src/file.ts',
      '--- a/src/file.ts',
      '+++ b/src/file.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    expect(
      classifyRunResult({
        stdout: '',
        stderr:
          'Tool execution for "Shell" requires user confirmation, which is not supported in non-interactive mode.',
        exitCode: 0,
        timedOut: false,
        patch,
        scorePolicy: 'strict',
      }),
    ).toMatchObject({
      valid_for_score: true,
      invalidation_reason: null,
      tool_policy_failure: null,
      tool_policy_warning: 'non_interactive_confirmation_required',
      warnings: ['tool_policy_confirmation_recovered'],
      score_bucket: 'unresolved',
    });
  });

  it('invalidates runs that exceed the model response ceiling', () => {
    expect(
      classifyRunResult({
        stdout: '',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        patch: 'diff --git a/file.py b/file.py\n--- a/file.py\n+++ b/file.py\n',
        responseCeilingExceeded: true,
        scorePolicy: 'strict',
      }),
    ).toMatchObject({
      valid_for_score: false,
      invalidation_reason: 'model_response_ceiling_exceeded',
      score_bucket: 'invalid',
    });

    expect(
      classifyRunResult({
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: true,
        patch: 'diff --git a/file.py b/file.py\n--- a/file.py\n+++ b/file.py\n',
        responseCeilingExceeded: true,
        scorePolicy: 'strict',
      }),
    ).toMatchObject({
      valid_for_score: false,
      invalidation_reason: 'model_response_ceiling_exceeded',
      score_bucket: 'invalid',
    });
  });

  it('flags reproduction-only patches under strict scoring', () => {
    const patch = [
      'diff --git a/repro_issue.py b/repro_issue.py',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/repro_issue.py',
      '@@ -0,0 +1 @@',
      '+print("repro")',
      '',
    ].join('\n');

    expect(analyzePatch(patch)).toMatchObject({
      files: ['repro_issue.py'],
      sourceFiles: 0,
      reproductionFiles: 1,
    });
    expect(
      classifyRunResult({
        stdout: '',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        patch,
        scorePolicy: 'strict',
        patchStats: {
          files: ['repro_issue.py'],
          sourceFiles: 0,
          testFiles: 0,
          docFiles: 0,
          tempFiles: 0,
          reproductionFiles: 1,
        },
      }),
    ).toMatchObject({
      valid_for_score: false,
      invalidation_reason: 'patch_hygiene',
      score_bucket: 'invalid',
    });
  });

  it('summarizes valid, invalid, incomplete, and unresolved buckets separately', () => {
    expect(
      summarizeRecords([
        { valid_for_score: true, score_bucket: 'unresolved' },
        {
          valid_for_score: false,
          score_bucket: 'invalid',
          invalidation_reason: 'provider_failure',
        },
        { valid_for_score: true, score_bucket: 'incomplete' },
      ]),
    ).toMatchObject({
      total: 3,
      valid_for_score: 2,
      score_denominator: 2,
      invalid: 1,
      incomplete: 1,
      unresolved: 1,
      invalidation_reasons: { provider_failure: 1 },
    });
  });

  it('records manifest entrypoint metadata shape', () => {
    expect(
      buildEntrypointMetadata({
        entrypoint: {
          kind: 'bundle',
          command: process.execPath,
          initialArgs: ['/repo/bundle/gemini.js'],
          path: '/repo/bundle/gemini.js',
          publishableEligible: true,
        },
        packageVersion: '0.39.0-test',
        gitHead: 'abc123456',
        gitDirty: true,
        bundleFresh: {
          bundleExists: true,
          distCommitsMatchSource: false,
        },
      }),
    ).toMatchObject({
      kind: 'bundle',
      path: '/repo/bundle/gemini.js',
      packageVersion: '0.39.0-test',
      gitHead: 'abc123456',
      gitDirty: true,
      bundleFresh: {
        bundleExists: true,
        distCommitsMatchSource: false,
      },
      nodeVersion: process.version,
    });
  });
});
