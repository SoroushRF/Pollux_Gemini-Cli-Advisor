/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  analyzeApprovalModeContamination,
  analyzeContractChecklistHazards,
  auditStrictFdCheckpointTrace,
  buildDeepSweConditions,
  buildDeepSweContractChecklist,
  buildDeepSwePrompt,
  buildDependencyPreflightDockerArgs,
  buildPreflightReport,
  buildProjectDependencyInstallDockerArgs,
  buildVerifierDockerArgs,
  classifyVerifierBaselinePreflight,
  classifyVerifierResult,
  copyDirectoryNormalizedForVerifier,
  deepsweConditions,
  detectApprovalModeContamination,
  finalVerifierNetworkPolicy,
  inspectNonInteractiveAuthReadiness,
  inferDependencyPreflight,
  loadDeepSweManifest,
  loadDeepSweTask,
  normalizeTextForVerifier,
  parseDeepSweRunnerArgs,
  parseSimpleToml,
  selectDeepSweTasks,
  STRICT_FD_CHECKPOINT_REASONS,
  summarizeDeepSweRecords,
} from '../pollux-deepswe-runner-lib.mjs';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return { ...actual, default: actual };
});
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return { ...actual, default: actual };
});

describe('pollux DeepSWE runner library', () => {
  it('parses DeepSWE runner defaults for the top-10 lane', () => {
    const args = parseDeepSweRunnerArgs(
      ['--run-id', 'top10', '--limit', '2', '--conditions', 'E,FD'],
      new Date('2026-06-04T00:00:00.000Z'),
    );

    expect(args).toMatchObject({
      mode: 'run',
      runId: 'top10',
      limit: 2,
      conditions: ['E', 'FD'],
      repeats: 1,
      maxApiResponses: 150,
      timeoutMs: 7_200_000,
      entrypoint: 'bundle',
      fdProfile: 'strict',
    });
  });

  it('rejects invalid condition and patch-mode combinations', () => {
    expect(() => parseDeepSweRunnerArgs(['--conditions', 'NOPE'])).toThrow(
      /unknown deepswe condition/i,
    );
    expect(() => parseDeepSweRunnerArgs(['--fd-profile', 'NOPE'])).toThrow(
      /fd-profile/i,
    );
    expect(() =>
      parseDeepSweRunnerArgs(['--gold-patch-mode', '--null-patch-mode']),
    ).toThrow(/only one/i);
    expect(() =>
      parseDeepSweRunnerArgs(['--gold-patch-mode', '--fake-responses', 'x']),
    ).toThrow(/cannot be combined/i);
    expect(() => parseDeepSweRunnerArgs(['--mode', 'rescore'])).toThrow(
      /source-run/i,
    );
    expect(() =>
      parseDeepSweRunnerArgs([
        '--mode',
        'rescore',
        '--source-run',
        'old-run',
        '--gold-patch-mode',
      ]),
    ).toThrow(/cannot be combined/i);
  });

  it('parses rescore inputs without enabling model patch modes', () => {
    expect(
      parseDeepSweRunnerArgs([
        '--mode',
        'rescore',
        '--source-run',
        'deepswe-top3-a-r1',
        '--conditions',
        'A',
        '--task-ids',
        'wazero-multi-module-snapshots,ts-pattern-match-each',
      ]),
    ).toMatchObject({
      mode: 'rescore',
      sourceRun: 'deepswe-top3-a-r1',
      conditions: ['A'],
      taskIds: ['wazero-multi-module-snapshots', 'ts-pattern-match-each'],
      goldPatchMode: false,
      nullPatchMode: false,
    });
  });

  it('loads the pinned official top-10 manifest', () => {
    const manifest = loadDeepSweManifest(
      path.resolve('evaluation_results/deepswe-top20-gemini-3.1-pro.json'),
    );
    const selected = selectDeepSweTasks(
      manifest,
      parseDeepSweRunnerArgs(['--limit', '10']),
    );

    expect(manifest.officialSources.tasksArtifact.sha256).toBe(
      'b0d25ec0e566c0391e4385a63343b92d5371b67f052e1c9062c9d226d9d18dd1',
    );
    expect(selected).toHaveLength(10);
    expect(selected[0]).toMatchObject({
      taskId: 'wazero-multi-module-snapshots',
      geminiPassedTrials: 4,
      maxAgentSteps: 45,
    });
    expect(selected.every((task) => task.maxAgentSteps <= 150)).toBe(true);
  });

  it('parses the DeepSWE task.toml fields the adapter needs', () => {
    const toml = parseSimpleToml(`
schema_version = "1.1"
[metadata]
task_id = "wazero-multi-module-snapshots"
repository_url = "https://github.com/wazero/wazero.git"
base_commit_hash = "abc123"
language = "go"
[agent]
timeout_sec = 5400.0
[verifier]
timeout_sec = 1800.0
[environment]
docker_image = "public.ecr.aws/example/image:tag"
allow_internet = false
`);

    expect(toml.metadata).toMatchObject({
      task_id: 'wazero-multi-module-snapshots',
      repository_url: 'https://github.com/wazero/wazero.git',
      base_commit_hash: 'abc123',
      language: 'go',
    });
    expect(toml.agent.timeout_sec).toBe(5400);
    expect(toml.verifier.timeout_sec).toBe(1800);
    expect(toml.environment).toMatchObject({
      docker_image: 'public.ecr.aws/example/image:tag',
      allow_internet: false,
    });
  });

  it('loads a Harbor-shaped DeepSWE task fixture', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepswe-task-'));
    const taskDir = path.join(root, 'tasks', 'demo-task');
    fs.mkdirSync(path.join(taskDir, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(taskDir, 'solution'), { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, 'task.toml'),
      [
        '[metadata]',
        'task_id = "demo-task"',
        'display_title = "Demo"',
        'repository_url = "https://github.com/acme/demo.git"',
        'base_commit_hash = "abc123"',
        'language = "typescript"',
        '[environment]',
        'docker_image = "example/demo:latest"',
        '[verifier]',
        'timeout_sec = 42.0',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(taskDir, 'instruction.md'), 'Build the thing.');
    fs.writeFileSync(path.join(taskDir, 'tests', 'test.sh'), '#!/bin/bash\n');
    fs.writeFileSync(path.join(taskDir, 'tests', 'test.patch'), '');

    const task = loadDeepSweTask(taskDir);

    expect(task).toMatchObject({
      taskId: 'demo-task',
      repository: 'acme/demo',
      baseCommitHash: 'abc123',
      dockerImage: 'example/demo:latest',
      verifierTimeoutSec: 42,
    });
    expect(buildDeepSwePrompt(task)).toContain('DeepSWE instruction:');
  });

  it('builds Docker verifier arguments matching the Pier verifier contract', () => {
    const args = buildVerifierDockerArgs({
      dockerImage: 'example/demo:latest',
      workDir: '/work/demo',
      testsDir: '/deep-swe/tasks/demo/tests',
      verifierLogDir: '/logs/verifier',
      artifactDir: '/logs/artifacts',
      timeoutSec: 1800,
    });

    expect(args).toEqual([
      'run',
      '--rm',
      '--network',
      'none',
      '--workdir',
      '/app',
      '-v',
      '/work/demo:/app',
      '-v',
      '/deep-swe/tasks/demo/tests:/tests:ro',
      '-v',
      '/logs/verifier:/logs/verifier',
      '-v',
      '/logs/artifacts:/logs/artifacts',
      'example/demo:latest',
      'bash',
      '-lc',
      'timeout 1800s bash /tests/test.sh',
    ]);
  });

  it('infers dependency preflight commands from verifier scripts', () => {
    expect(
      inferDependencyPreflight('npm exec jest tests/foo.test.ts'),
    ).toMatchObject({
      kind: 'npm',
      required: true,
      command: expect.stringContaining('jest'),
    });
    expect(inferDependencyPreflight('npx vitest run')).toMatchObject({
      kind: 'npm',
      command: expect.stringContaining('vitest'),
    });
    expect(inferDependencyPreflight('go test ./...')).toMatchObject({
      kind: 'go',
      required: false,
    });
    expect(
      inferDependencyPreflight('bash /app/test.sh base', {
        language: 'typescript',
        taskId: 'ts-pattern-match-each',
        repository: 'gvergnaud/ts-pattern',
        testPatchText: '+  npx jest --no-coverage tests/foo.test.ts',
      }),
    ).toMatchObject({
      kind: 'npm',
      required: true,
      command: expect.stringContaining('jest'),
      warmupCommand: expect.stringContaining('npm exec --yes --package jest'),
      extraWarmupPackages: ['@unrs/resolver-binding-linux-x64-gnu@1.11.1'],
    });
    expect(
      inferDependencyPreflight('bash /app/test.sh base && npx vitest run', {
        language: 'typescript',
        taskId: 'true-myth-iterable-collection-combinators',
        repository: 'true-myth/true-myth',
      }),
    ).toMatchObject({
      kind: 'npm',
      warmupCommand: expect.stringContaining('vitest'),
      extraWarmupPackages: [],
    });
  });

  it('builds network-controlled dependency preflight Docker arguments', () => {
    expect(
      buildDependencyPreflightDockerArgs({
        dockerImage: 'example/demo:latest',
        testsDir: '/tests',
        command: 'npm view jest version --prefer-online',
        networked: true,
      }),
    ).toEqual([
      'run',
      '--rm',
      '--network',
      'bridge',
      '--workdir',
      '/app',
      '-v',
      '/tests:/tests:ro',
      'example/demo:latest',
      'bash',
      '-lc',
      'npm view jest version --prefer-online',
    ]);
    expect(
      buildDependencyPreflightDockerArgs({
        dockerImage: 'example/demo:latest',
        testsDir: '/tests',
        command: 'npm exec --yes --package vitest vitest -- --version',
        networked: true,
        cacheDir: '/cache/task-a',
      }),
    ).toContain('/cache/task-a:/dependency-cache');
  });

  it('builds verifier preflight args that can warm dependencies online', () => {
    const args = buildVerifierDockerArgs({
      dockerImage: 'example/demo:latest',
      workDir: '/work',
      testsDir: '/tests',
      verifierLogDir: '/logs/verifier',
      artifactDir: '/logs/artifacts',
      dependencyCacheDir: '/cache/task-a',
      dependencyOffline: false,
      network: 'bridge',
    });
    expect(args).toContain('bridge');
    expect(args).toContain('/cache/task-a:/dependency-cache');
    expect(args).toContain('npm_config_prefer_offline=true');
    expect(args).not.toContain('npm_config_offline=true');
  });

  it('builds project dependency install args for verifier containers', () => {
    const args = buildProjectDependencyInstallDockerArgs({
      dockerImage: 'example/demo:latest',
      workDir: '/work',
      dependencyCacheDir: '/cache/task-a',
      dependencyOffline: false,
      network: 'bridge',
    });
    expect(args).toContain('/work:/app');
    expect(args).toContain('/cache/task-a:/dependency-cache');
    expect(args).toContain('bridge');
    expect(args.at(-1)).toContain('pnpm install --frozen-lockfile');
    expect(args.at(-1)).not.toContain(
      'pnpm install --frozen-lockfile --prefer-online',
    );
    expect(args.at(-1)).toContain(
      '[pollux] node_modules already present; skipping verifier dependency install',
    );
    expect(args.at(-1)).toContain('allowBuilds');
    expect(args.at(-1)).toContain('esbuild: true');
    expect(args.at(-1)).toContain('export NODE_ENV=development');
    expect(args.at(-1)).toContain('export npm_config_production=false');
    expect(args.at(-1)).toContain('npm ci --prefer-online --include=dev');
    expect(args.at(-1)).toContain('npm install --prefer-online --include=dev');
    expect(args.at(-1)).toContain(
      'yarn install --frozen-lockfile --production=false',
    );
    expect(args).not.toContain('npm_config_offline=true');

    const offlineArgs = buildProjectDependencyInstallDockerArgs({
      dockerImage: 'example/demo:latest',
      workDir: '/work',
      dependencyCacheDir: '/cache/task-a',
      dependencyOffline: true,
    });
    expect(offlineArgs).toContain('npm_config_offline=true');
    expect(offlineArgs.at(-1)).toContain(
      'pnpm install --frozen-lockfile --offline',
    );
    expect(offlineArgs.at(-1)).toContain(
      'npm ci --prefer-offline --include=dev',
    );
  });

  it('normalizes verifier text files to LF before Docker mounts them', () => {
    expect(normalizeTextForVerifier('#!/usr/bin/env bash\r\nset -e\r\n')).toBe(
      '#!/usr/bin/env bash\nset -e\n',
    );

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepswe-crlf-'));
    const source = path.join(root, 'source-tests');
    const target = path.join(root, 'target-tests');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'test.sh'), 'set -euo pipefail\r\n');
    fs.writeFileSync(path.join(source, 'binary.bin'), Buffer.from([13, 10, 0]));

    copyDirectoryNormalizedForVerifier(source, target);

    expect(fs.readFileSync(path.join(target, 'test.sh'), 'utf8')).toBe(
      'set -euo pipefail\n',
    );
    expect([...fs.readFileSync(path.join(target, 'binary.bin'))]).toEqual([
      13, 10, 0,
    ]);
  });

  it('classifies verifier reward and infra states', () => {
    const verifierLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-'));
    fs.writeFileSync(path.join(verifierLogDir, 'reward.txt'), '1\n');
    expect(
      classifyVerifierResult({
        exitCode: 0,
        verifierLogDir,
        scorePolicy: 'strict',
        stdout:
          '[verifier] Baseline exit code: 0\n[verifier] New tests exit code: 0\n',
      }),
    ).toMatchObject({ score_bucket: 'resolved', resolved: true });

    fs.writeFileSync(path.join(verifierLogDir, 'reward.txt'), '0\n');
    expect(
      classifyVerifierResult({
        exitCode: 0,
        verifierLogDir,
        scorePolicy: 'strict',
        stdout:
          '[verifier] Baseline exit code: 0\n--- FAIL: TestThing\n[verifier] New tests exit code: 1\n',
      }),
    ).toMatchObject({
      score_bucket: 'unresolved',
      resolved: false,
      verifier_baseline_exit_code: 0,
      verifier_new_tests_exit_code: 1,
      verifier_failure_kind: 'new_tests_failed',
    });

    fs.rmSync(path.join(verifierLogDir, 'reward.txt'));
    expect(
      classifyVerifierResult({
        exitCode: 7,
        verifierLogDir,
        scorePolicy: 'strict',
      }),
    ).toMatchObject({
      score_bucket: 'invalid',
      verifier_invalidation_reason: 'verifier_infra_failure',
    });
  });

  it('classifies dependency and baseline verifier failures as infra failures', () => {
    const verifierLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-'));
    fs.writeFileSync(path.join(verifierLogDir, 'reward.txt'), '0\n');

    expect(
      classifyVerifierResult({
        exitCode: 0,
        verifierLogDir,
        scorePolicy: 'strict',
        stdout:
          '[verifier] Baseline exit code: 1\n[verifier] New tests exit code: 1\n',
        stderr:
          'npm error code EAI_AGAIN\nrequest to https://registry.npmjs.org/jest failed',
      }),
    ).toMatchObject({
      score_bucket: 'invalid',
      verifier_invalidation_reason: 'verifier_infra_failure',
      verifier_dependency_failure: true,
      verifier_baseline_exit_code: 1,
      verifier_new_tests_exit_code: 1,
    });

    expect(
      classifyVerifierResult({
        exitCode: 0,
        verifierLogDir,
        scorePolicy: 'strict',
        stdout:
          '[verifier] Baseline exit code: 1\n[verifier] New tests exit code: 1\n',
        stderr:
          'npm error code ENOTCACHED\nrequest to https://registry.npmjs.org/vitest failed: no cached response available',
      }),
    ).toMatchObject({
      score_bucket: 'invalid',
      verifier_invalidation_reason: 'verifier_infra_failure',
      verifier_dependency_failure: true,
      verifier_failure_kind: 'dependency_failure',
    });

    expect(
      classifyVerifierResult({
        exitCode: 0,
        verifierLogDir,
        scorePolicy: 'strict',
        stdout:
          '[verifier] Baseline exit code: 0\n[verifier] New tests exit code: 1\n',
        stderr: 'npm ERR! Test failed. See above for more details.',
      }),
    ).toMatchObject({
      score_bucket: 'unresolved',
      resolved: false,
      verifier_failure_kind: 'new_tests_failed',
      verifier_dependency_failure: false,
    });
    expect(
      classifyVerifierResult({
        exitCode: 0,
        verifierLogDir,
        scorePolicy: 'strict',
        stdout:
          '[verifier] Baseline exit code: 0\n[verifier] New tests exit code: 1\n',
        stderr: 'npm ERR! Test failed. See above for more details.',
      }).verifier_invalidation_reason,
    ).toBeUndefined();

    expect(
      classifyVerifierResult({
        exitCode: 1,
        verifierLogDir,
        scorePolicy: 'strict',
        stdout: '[verifier] Baseline exit code: 1\n',
      }),
    ).toMatchObject({
      verifier_failure_kind: 'baseline_failure',
      verifier_invalidation_reason: 'verifier_infra_failure',
    });
  });

  it('treats native optional package verifier failures as dependency infra', () => {
    const verifierLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-'));
    fs.writeFileSync(path.join(verifierLogDir, 'reward.txt'), '0\n');

    expect(
      classifyVerifierResult({
        exitCode: 0,
        verifierLogDir,
        scorePolicy: 'strict',
        stdout: '[verifier] Baseline exit code: 1\n',
        stderr:
          'Error: Cannot find module @rollup/rollup-linux-x64-gnu. npm has a bug related to optional dependencies.',
      }),
    ).toMatchObject({
      score_bucket: 'invalid',
      verifier_failure_kind: 'dependency_failure',
      verifier_dependency_failure: true,
      verifier_invalidation_reason: 'verifier_infra_failure',
    });
  });

  it('classifies baseline verifier preflight without requiring hidden new tests to pass', () => {
    expect(
      classifyVerifierBaselinePreflight({
        exitCode: 0,
        stdout:
          '[verifier] Baseline exit code: 0\n[verifier] New tests exit code: 1\n',
        stderr: '',
      }),
    ).toMatchObject({
      ok: true,
      verifier_baseline_exit_code: 0,
      verifier_new_tests_exit_code: 1,
      failure_kind: null,
    });

    expect(
      classifyVerifierBaselinePreflight({
        exitCode: 0,
        stdout: '[verifier] Baseline exit code: 1\n',
        stderr:
          'Cannot find module @rollup/rollup-linux-x64-gnu. npm has a bug related to optional dependencies.',
      }),
    ).toMatchObject({
      ok: false,
      dependency_failure: true,
      failure_kind: 'dependency_failure',
    });

    expect(
      classifyVerifierBaselinePreflight({
        exitCode: 0,
        stdout: '[verifier] Baseline exit code: 1\n',
        stderr: 'AssertionError: expected baseline fixture to pass',
      }),
    ).toMatchObject({
      ok: false,
      dependency_failure: false,
      failure_kind: 'baseline_failure',
    });
  });

  it('detects non-interactive auth readiness from env or seeded Gemini files', () => {
    expect(
      inspectNonInteractiveAuthReadiness({
        GEMINI_API_KEY: 'test-key',
      }),
    ).toMatchObject({ ok: true, hasApiKey: true });

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-auth-'));
    fs.mkdirSync(path.join(root, '.gemini'), { recursive: true });
    fs.writeFileSync(path.join(root, '.gemini', 'oauth_creds.json'), '{}\n');
    expect(
      inspectNonInteractiveAuthReadiness({
        HOME: root,
      }),
    ).toMatchObject({ ok: true, hasOauthCreds: true });

    expect(
      inspectNonInteractiveAuthReadiness({ HOME: root + '-missing' }),
    ).toMatchObject({
      ok: false,
      failure_kind: 'noninteractive_auth_missing',
    });
  });

  it('keeps DeepSWE condition semantics aligned with Pollux A/FD/E', () => {
    expect(deepsweConditions.A.pollux.enabled).toBe(false);
    expect(deepsweConditions.E.modelName).toBe('gemini-3.1-pro-preview');
    expect(deepsweConditions.FD.pollux).toMatchObject({
      enabled: true,
      executorModel: 'gemini-3-flash-preview',
      advisorModel: 'gemini-3.1-pro-preview',
      advisorTriggerMode: 'hybrid',
      advisorExecutorProfile: 'strict_fd',
      maxAdvisorCallsPerTurn: 3,
      maxAdvisorCallsPerSession: 6,
      executorCheckpoints: {
        enabled: true,
        enforceRequired: true,
        reserveRequiredPrimarySlots: true,
        minGuidanceWords: 24,
        rejectTruncatedGuidance: true,
        requireStructuredGuidance: true,
        finalGate: true,
        requiredReasons: [
          'contract extraction before source edit',
          'final diff audit before completion',
        ],
      },
      detector: {
        selfReport: { enabled: false, promptPrimingEnabled: false },
      },
    });
    expect(buildDeepSweConditions('detector').FD.pollux).toMatchObject({
      advisorTriggerMode: 'detector',
      maxAdvisorCallsShortTask: 1,
      executorCheckpoints: undefined,
    });
  });

  it('treats networked verifier preflight as a baseline verifier preflight gate', () => {
    expect(
      parseDeepSweRunnerArgs(['--networked-verifier-preflight']),
    ).toMatchObject({
      networkedVerifierPreflight: true,
      baselineVerifierPreflight: true,
    });
    expect(
      parseDeepSweRunnerArgs([
        '--networked-verifier-preflight',
        '--no-baseline-verifier-preflight',
      ]),
    ).toMatchObject({
      networkedVerifierPreflight: true,
      baselineVerifierPreflight: false,
    });
  });

  it('keeps final verifier tests offline while allowing networked dependency install', () => {
    expect(finalVerifierNetworkPolicy({})).toEqual({
      dependencyOffline: true,
      dependencyInstallNetwork: 'none',
      verifierNetwork: 'none',
    });
    expect(
      finalVerifierNetworkPolicy({ networkedVerifierPreflight: true }),
    ).toEqual({
      dependencyOffline: false,
      dependencyInstallNetwork: 'bridge',
      verifierNetwork: 'none',
    });
  });

  it('adds FD execution notes without model-visible checkpoint choreography', () => {
    const task = {
      taskId: 'demo-task',
      repository: 'acme/demo',
      baseCommitHash: 'abc123',
      language: 'typescript',
      instruction: 'Add demo(). It must throw on invalid input.',
    };
    const checklist = buildDeepSweContractChecklist(task);

    expect(
      buildDeepSwePrompt(task, {
        conditionId: 'A',
        contractChecklist: checklist,
      }),
    ).not.toContain('Pollux Flash-plus-advisor execution notes');
    expect(
      buildDeepSwePrompt(task, {
        conditionId: 'FD',
        contractChecklist: checklist,
      }),
    ).toContain('Pollux Flash-plus-advisor execution notes');
    expect(
      buildDeepSwePrompt(task, {
        conditionId: 'FD',
        contractChecklist: checklist,
      }),
    ).toContain('Work normally: inspect, edit, and verify');
    expect(
      buildDeepSwePrompt(task, {
        conditionId: 'FD',
        contractChecklist: checklist,
      }),
    ).toContain('Do not create implementation-plan files or enter Plan Mode');
    expect(
      buildDeepSwePrompt(task, {
        conditionId: 'FD',
        contractChecklist: checklist,
      }),
    ).not.toContain('<pollux:advisor_request');
    expect(
      buildDeepSwePrompt(task, {
        conditionId: 'FD',
        contractChecklist: checklist,
      }),
    ).not.toContain('ADVISOR_REQUEST');
    expect(
      buildDeepSwePrompt(
        { ...task, language: 'go' },
        {
          conditionId: 'FD',
          contractChecklist: checklist,
        },
      ),
    ).toContain(
      'FD means Flash-plus-advisor in this benchmark, not file descriptors',
    );
    expect(
      buildDeepSwePrompt(
        { ...task, language: 'go' },
        {
          conditionId: 'FD',
          contractChecklist: checklist,
        },
      ),
    ).toContain('run `gofmt` on modified Go files and a focused `go test`');
    expect(
      buildDeepSwePrompt(task, {
        conditionId: 'FD',
        contractChecklist: checklist,
      }),
    ).toContain('For JavaScript/TypeScript tasks');
    expect(
      buildDeepSwePrompt(task, {
        conditionId: 'FD',
        contractChecklist: checklist,
      }),
    ).toContain('npx tsc --noEmit');
  });

  it('audits complete strict FD checkpoint traces', () => {
    const trace = [
      {
        type: 'executor_text_delta',
        payload: {
          text: '<pollux:advisor_request reason="contract extraction before source edit" timing="now"/>',
        },
      },
      {
        type: 'observer_decision',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          contributingSignalAttributions: [
            'advisor_request reason="contract extraction before source edit"',
          ],
        },
      },
      {
        type: 'advisor_attempt',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          checkpointReason: 'contract extraction before source edit',
          checkpointConsultedGood: true,
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      },
      {
        type: 'executor_text_delta',
        payload: {
          text: 'ADVISOR_REQUEST: mid-run risk review after edits or failed tests',
        },
      },
      {
        type: 'observer_decision',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          contributingSignalAttributions: [
            'advisor_request reason="mid-run risk review after edits or failed tests"',
          ],
        },
      },
      {
        type: 'advisor_attempt',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          checkpointReason: 'mid-run risk review after edits or failed tests',
          checkpointConsultedGood: true,
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      },
      {
        type: 'executor_text_delta',
        payload: {
          text: '<pollux:advisor_request reason="final diff audit before completion" timing="now"/>',
        },
      },
      {
        type: 'observer_decision',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          contributingSignalAttributions: [
            'advisor_request reason="final diff audit before completion"',
          ],
        },
      },
      {
        type: 'advisor_attempt',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          checkpointReason: 'final diff audit before completion',
          checkpointConsultedGood: true,
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      },
      {
        type: 'tool_call_request',
        payload: {
          name: 'run_shell_command',
          args: {
            command: 'go test ./experimental/...',
          },
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: true,
      consulted: [
        'contract extraction before source edit',
        'mid-run risk review after edits or failed tests',
        'final diff audit before completion',
      ],
      consulted_good: [
        'contract extraction before source edit',
        'mid-run risk review after edits or failed tests',
        'final diff audit before completion',
      ],
      requested_but_not_consulted: [],
      missing: [],
      final_verification_observed: true,
      final_verification_command: expect.stringContaining(
        'go test ./experimental/...',
      ),
    });
  });

  it('keeps r4-style all-consulted-good traces incomplete without final verification', () => {
    const trace = [
      ...STRICT_FD_CHECKPOINT_REASONS.flatMap((reason) => [
        {
          type: 'checkpoint_state',
          payload: {
            reason,
            status: 'consulted_good',
            attemptKind: 'primary',
            outcome: 'consulted',
          },
        },
      ]),
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: false,
      consulted_good: STRICT_FD_CHECKPOINT_REASONS,
      final_verification_observed: false,
      final_verification_missing: true,
      diagnostic_reason: 'final_verification_missing',
    });
  });

  it('does not keep stale final_verification_missing after later verification', () => {
    const trace = [
      ...STRICT_FD_CHECKPOINT_REASONS.map((reason) => ({
        type: 'checkpoint_state',
        payload: {
          reason,
          status: 'consulted_good',
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      })),
      {
        type: 'checkpoint_state',
        payload: {
          reason: 'final diff audit before completion',
          status: 'final_verification_missing',
          failureKind: 'final_verification_missing',
          mutationCount: 0,
        },
      },
      {
        type: 'tool_call_request',
        payload: {
          name: 'run_shell_command',
          args: {
            command:
              'gofmt -w experimental/snapshot/snapshot.go && go test -v ./experimental/snapshot/...',
          },
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    const audit = auditStrictFdCheckpointTrace(trace);

    expect(audit).toMatchObject({
      complete: true,
      final_verification_observed: true,
      final_verification_missing: false,
      final_verification_after_latest_mutation: true,
      diagnostic_reason: undefined,
    });
    expect(audit.failed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failure_kind: 'final_verification_missing',
        }),
      ]),
    );
  });

  it('treats JavaScript and TypeScript test/build commands as final verification', () => {
    const trace = [
      ...STRICT_FD_CHECKPOINT_REASONS.map((reason) => ({
        type: 'checkpoint_state',
        payload: {
          reason,
          status: 'consulted_good',
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      })),
      {
        type: 'tool_call_request',
        payload: {
          name: 'run_shell_command',
          args: {
            command: 'npx tsc --noEmit && npx jest tests/matchEach.test.ts',
          },
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: true,
      final_verification_observed: true,
      final_verification_missing: false,
      final_verification_after_latest_mutation: true,
      final_verification_command: expect.stringContaining('npx tsc --noEmit'),
    });
  });

  it('keeps final verification incomplete when a later source mutation happens', () => {
    const trace = [
      ...STRICT_FD_CHECKPOINT_REASONS.map((reason) => ({
        type: 'checkpoint_state',
        payload: {
          reason,
          status: 'consulted_good',
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      })),
      {
        type: 'tool_call_request',
        payload: {
          name: 'run_shell_command',
          args: { command: 'go test ./experimental/snapshot/...' },
        },
      },
      {
        type: 'tool_call_request',
        payload: {
          name: 'replace',
          args: { file_path: 'experimental/snapshot/snapshot.go' },
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: false,
      final_verification_observed: true,
      final_verification_missing: true,
      final_verification_after_latest_mutation: false,
      post_final_audit_mutation_count: 1,
      diagnostic_reason: 'final_verification_missing',
    });
  });

  it('detects Plan Mode contamination in benchmark artifacts', () => {
    const text = [
      '# Active Approval Mode: Plan',
      'You are operating in **Plan Mode**.',
      'Error executing tool write_file: Tool execution denied by policy. You are in Plan Mode and cannot modify source code.',
    ].join('\n');

    expect(detectApprovalModeContamination(text)).toBe(true);
    expect(auditStrictFdCheckpointTrace(text)).toMatchObject({
      complete: false,
      approval_mode_contamination: true,
      diagnostic_reason: 'approval_mode_contamination',
    });
  });

  it('does not treat recovered Plan Mode as score contamination', () => {
    const trace = [
      {
        type: 'tool_call_request',
        payload: {
          name: 'enter_plan_mode',
          args: { reason: 'design implementation' },
        },
      },
      {
        type: 'tool_call_request',
        payload: {
          name: 'write_file',
          args: { file_path: 'experimental/snapshot/snapshot.go' },
        },
      },
      {
        type: 'tool_call_request',
        payload: {
          name: 'exit_plan_mode',
          args: { plan_filename: 'implementation.md' },
        },
      },
      {
        type: 'tool_call_request',
        payload: {
          name: 'write_file',
          args: { file_path: 'experimental/snapshot/snapshot.go' },
        },
      },
      ...STRICT_FD_CHECKPOINT_REASONS.map((reason) => ({
        type: 'checkpoint_state',
        payload: {
          reason,
          status: 'consulted_good',
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      })),
      {
        type: 'tool_call_request',
        payload: {
          name: 'run_shell_command',
          args: { command: 'go test -v ./experimental/snapshot' },
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(detectApprovalModeContamination(trace)).toBe(false);
    expect(analyzeApprovalModeContamination(trace)).toMatchObject({
      approval_mode_observed: true,
      approval_mode_recovered: true,
      approval_mode_active_at_end: false,
      approval_mode_contamination: false,
      approval_mode_source_write_attempted: true,
      approval_mode_execution_after_exit: true,
    });
    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: true,
      approval_mode_observed: true,
      approval_mode_recovered: true,
      approval_mode_contamination: false,
      diagnostic_reason: undefined,
    });
  });

  it('treats unrecovered Plan Mode as contamination', () => {
    const trace = [
      {
        type: 'tool_call_request',
        payload: {
          name: 'enter_plan_mode',
          args: { reason: 'design implementation' },
        },
      },
      ...STRICT_FD_CHECKPOINT_REASONS.map((reason) => ({
        type: 'checkpoint_state',
        payload: {
          reason,
          status: 'consulted_good',
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      })),
      {
        type: 'tool_call_request',
        payload: {
          name: 'run_shell_command',
          args: { command: 'go test -v ./experimental/snapshot' },
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(analyzeApprovalModeContamination(trace)).toMatchObject({
      approval_mode_observed: true,
      approval_mode_recovered: false,
      approval_mode_active_at_end: true,
      approval_mode_contamination: true,
    });
    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: false,
      approval_mode_contamination: true,
      diagnostic_reason: 'approval_mode_contamination',
    });
  });

  it('records off-domain strict FD guidance as failed audit evidence', () => {
    const trace = [
      {
        type: 'advisor_attempt',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          checkpointReason: 'mid-run risk review after edits or failed tests',
          checkpointConsultedGood: false,
          strictCheckpointFailureKind: 'off_domain_guidance',
          attemptKind: 'primary',
          parserOutcome: 'parse_error',
          outcome: 'parse_error',
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    const audit = auditStrictFdCheckpointTrace(trace);

    expect(audit).toMatchObject({
      complete: false,
      off_domain_guidance: true,
      diagnostic_reason: 'off_domain_guidance',
    });
    expect(audit.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'mid-run risk review after edits or failed tests',
          failure_kind: 'off_domain_guidance',
        }),
      ]),
    );
  });

  it('audits requested-but-not-consulted and missing strict FD checkpoints', () => {
    const trace = [
      {
        type: 'executor_text_delta',
        payload: {
          text: '<pollux:advisor_request reason="contract extraction before source edit" timing="now"/>',
        },
      },
      {
        type: 'observer_decision',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          contributingSignalAttributions: [
            'advisor_request reason="contract extraction before source edit"',
          ],
        },
      },
      {
        type: 'advisor_attempt',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          checkpointReason: 'contract extraction before source edit',
          checkpointConsultedGood: true,
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      },
      {
        type: 'executor_text_delta',
        payload: {
          text: '<pollux:advisor_request reason="final diff audit before completion" timing="now"/>',
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: false,
      consulted: ['contract extraction before source edit'],
      requested_but_not_consulted: ['final diff audit before completion'],
      missing: [],
    });
  });

  it('audits r2-style checkpoint request text in tool call args', () => {
    const trace = [
      {
        type: 'tool_call_request',
        payload: {
          name: 'run_shell_command',
          args: {
            description: 'Request advisor contract extraction.',
            command: 'echo "Requesting advisor contract extraction"',
          },
        },
      },
      {
        type: 'tool_call_request',
        payload: {
          name: 'run_shell_command',
          args: {
            description: 'Request mid-run risk review.',
            command: 'echo "Requesting mid-run risk review"',
          },
        },
      },
      {
        type: 'executor_text_delta',
        payload: {
          text: '<pollux:advisor_request reason="final diff audit before completion" timing="now"/>',
        },
      },
      {
        type: 'observer_decision',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          contributingSignalAttributions: [
            'advisor_request reason="final diff audit before completion"',
          ],
        },
      },
      {
        type: 'advisor_attempt',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          checkpointReason: 'final diff audit before completion',
          checkpointConsultedGood: true,
          attemptKind: 'primary',
          outcome: 'consulted',
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: false,
      consulted: ['final diff audit before completion'],
      requested_but_not_consulted: ['contract extraction before source edit'],
      missing: [],
    });
  });

  it('audits r3-style weak, failed, and budget-blocked checkpoints honestly', () => {
    const trace = [
      {
        type: 'observer_decision',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          contributingSignalAttributions: [
            'advisor_request reason="contract extraction before source edit"',
          ],
        },
      },
      {
        type: 'advisor_attempt',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          checkpointReason: 'contract extraction before source edit',
          checkpointConsultedGood: false,
          strictCheckpointFailureKind: 'truncated_guidance',
          attemptKind: 'primary',
          parserOutcome: 'plain_text_fallback',
          outputFinishReason: 'MAX_TOKENS',
          truncated: true,
          outcome: 'consulted',
        },
      },
      {
        type: 'observer_decision',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          contributingSignalAttributions: [
            'advisor_request reason="mid-run risk review after edits or failed tests"',
          ],
        },
      },
      {
        type: 'advisor_attempt',
        payload: {
          reasonCode: 'pollux.escalation.executor_advisor_request',
          checkpointReason: 'mid-run risk review after edits or failed tests',
          checkpointConsultedGood: false,
          attemptKind: 'primary',
          parserOutcome: 'empty_response',
          outputFinishReason: 'MAX_TOKENS',
          outcome: 'empty_response',
        },
      },
      {
        type: 'checkpoint_state',
        payload: {
          reason: 'final diff audit before completion',
          status: 'budget_blocked',
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');

    expect(auditStrictFdCheckpointTrace(trace)).toMatchObject({
      complete: false,
      requested: [
        'contract extraction before source edit',
        'mid-run risk review after edits or failed tests',
        'final diff audit before completion',
      ],
      primary_attempted: [
        'contract extraction before source edit',
        'mid-run risk review after edits or failed tests',
      ],
      consulted: ['contract extraction before source edit'],
      consulted_good: [],
      requested_but_not_consulted: [
        'contract extraction before source edit',
        'final diff audit before completion',
      ],
      missing: [],
    });
    const audit = auditStrictFdCheckpointTrace(trace);
    expect(audit.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'contract extraction before source edit',
          failure_kind: 'truncated_guidance',
          finish_reason: 'MAX_TOKENS',
        }),
        expect.objectContaining({
          reason: 'mid-run risk review after edits or failed tests',
          outcome: 'empty_response',
        }),
      ]),
    );
    expect(audit.budget_blocked).toEqual([
      expect.objectContaining({
        reason: 'final diff audit before completion',
        outcome: 'budget_exhausted',
      }),
    ]);
  });

  it('extracts wazero contract hints and flags forbidden restore memory growth', () => {
    const checklist = buildDeepSweContractChecklist({
      taskId: 'wazero-multi-module-snapshots',
      instruction: 'Restore snapshots and return insufficient_memory errors.',
    });

    expect(checklist.forbiddenBehaviors.join('\n')).toContain(
      'Do not grow target module memory',
    );
    expect(checklist.verificationFocus.join('\n')).toContain(
      'receiver.Compare(other) means the receiver is the old/base snapshot',
    );
    expect(
      analyzeContractChecklistHazards(
        'func restore(mem api.Memory) { mem.Grow(1) }',
        checklist,
      ),
    ).toMatchObject([
      {
        id: 'wazero_restore_mem_grow',
      },
    ]);
  });

  it('summarizes resolved, unresolved, invalid, and incomplete records', () => {
    expect(
      summarizeDeepSweRecords([
        { valid_for_score: true, score_bucket: 'resolved' },
        {
          valid_for_score: true,
          score_bucket: 'unresolved',
          warnings: ['model_capacity_retry'],
        },
        {
          valid_for_score: false,
          score_bucket: 'invalid',
          invalidation_reason: 'provider_failure',
        },
        {
          valid_for_score: false,
          score_bucket: 'invalid',
          invalidation_reason: 'patch_apply_failed',
        },
        {
          valid_for_score: false,
          score_bucket: 'invalid',
          verifier_invalidation_reason: 'verifier_infra_failure',
        },
        {
          valid_for_score: true,
          score_bucket: 'unresolved',
          verifier_invalidation_reason: 'verifier_infra_failure',
        },
        { valid_for_score: false, score_bucket: 'incomplete' },
      ]),
    ).toMatchObject({
      total: 7,
      valid_for_score: 3,
      resolved: 1,
      unresolved: 1,
      invalid: 3,
      incomplete: 1,
      invalidation_reasons: {
        provider_failure: 1,
        patch_apply_failed: 1,
        verifier_infra_failure: 2,
      },
      warnings: { model_capacity_retry: 1 },
      verifier_infra_failures: 2,
      patch_apply_failures: 1,
    });
  });

  it('emits preflight checks without requiring side effects', () => {
    const report = buildPreflightReport({
      taskManifest: path.resolve(
        'evaluation_results/deepswe-top20-gemini-3.1-pro.json',
      ),
      deepsweRepo: path.resolve('missing-deep-swe'),
      scratchRoot: path.join(os.tmpdir(), 'pollux-deepswe'),
      allowNonWsl: true,
    });

    expect(report.checks.map((check) => check.id)).toContain('task_manifest');
    expect(report.checks.map((check) => check.id)).toContain('deepswe_repo');
    expect(report.checks.find((check) => check.id === 'task_manifest').ok).toBe(
      true,
    );
  });
});
