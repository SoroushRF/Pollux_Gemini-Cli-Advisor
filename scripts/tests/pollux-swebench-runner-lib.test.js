/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzePatch,
  buildEntrypointMetadata,
  buildSweBenchmarkSettings,
  classifyProviderFailure,
  classifyRunResult,
  classifyToolPolicyFailure,
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

  it('classifies quota, capacity, rate-limit, and tool-policy failures', () => {
    expect(classifyProviderFailure('', 'QUOTA_EXHAUSTED')).toBe(
      'quota_exhausted',
    );
    expect(classifyProviderFailure('No capacity available', '')).toBe(
      'model_capacity_exhausted',
    );
    expect(classifyProviderFailure('', 'status: 429')).toBe('rate_limited');
    expect(
      classifyToolPolicyFailure(
        '',
        'Shell tool requires user confirmation, which is not supported in non-interactive mode.',
      ),
    ).toBe('non_interactive_confirmation_required');
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
