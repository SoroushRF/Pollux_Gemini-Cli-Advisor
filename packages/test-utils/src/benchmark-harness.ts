/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestRig } from './test-rig.js';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Define localized types to avoid deep imports breaking the test-utils build
export type BenchmarkDifficulty = 'simple' | 'moderate' | 'complex';

export interface BenchmarkTask {
  id: string;
  difficulty: BenchmarkDifficulty;
  description: string;
  files: Record<string, string>;
  prompt: string;
  oracle: (stdout: string, workspaceDir: string) => boolean | Promise<boolean>;
}

export interface BenchmarkCondition {
  id: string; // e.g. 'A', 'B', 'C', 'D', 'E'
  executorModel: string;
  advisorModel?: string; // Not present in baseline conditions
  strategy?: 'heuristic' | 'structured' | 'hybrid';
}

export interface BenchmarkRunOptions {
  fakeResponsesPath?: string;
}

export interface BenchmarkCheckpointResumeOptions extends BenchmarkRunOptions {
  resumePrompt?: string;
}

export interface BenchmarkRunMetadata {
  valid: boolean;
  invalidationReason?: string;
  executionOutput?: string;
  fairnessPins: {
    routerPinned: boolean;
    loopDetectionDisabled: boolean;
    availabilityReset: boolean;
    dynamicConfigFixed: boolean;
    sessionIsolated: boolean;
    sandboxIsolated: boolean;
  };
  metrics: {
    accuracyPass: boolean;
    latencyMs: number;
    tokens: {
      total: number;
      advisor: number;
      executor: number;
    };
  };
}

export interface BenchmarkCheckpointResumeMetadata {
  initialRun: BenchmarkRunMetadata;
  resumedRun: BenchmarkRunMetadata;
  fairnessStateConsistent: boolean;
}

interface BenchmarkSettingsOverrides {
  model: {
    name: string;
    disableLoopDetection: boolean;
  };
  experimental: {
    dynamicModelConfiguration: boolean;
    gemmaModelRouter: {
      enabled: boolean;
    };
    pollux: {
      enabled: boolean;
      executorModel: string;
      advisorModel?: string;
      strategy?: 'heuristic' | 'structured' | 'hybrid';
    };
  };
}

const BENCHMARK_ENV = {
  GEMINI_API_KEY: 'fake-key',
  GOOGLE_API_KEY: 'fake-key',
} as const;

/**
 * Benchmark Harness for Pollux
 *
 * Enforces fairness pins FP-01 to FP-06 required for comparable
 * A-E benchmark conditions.
 */
export class BenchmarkHarness {
  private rig: TestRig;

  constructor() {
    this.rig = new TestRig();
  }

  /**
   * Executes a benchmark task under a specific condition, strictly enforcing fairness pins.
   */
  async runBenchmark(
    task: BenchmarkTask,
    condition: BenchmarkCondition,
    options: BenchmarkRunOptions = {},
  ): Promise<BenchmarkRunMetadata> {
    const sessionId = crypto.randomUUID(); // FP-05: Session isolation pin
    const settingsOverrides = this._createSettingsOverrides(condition);

    // FP-03: Fresh availability state, via entirely new test rig
    // FP-06: Sandbox and process-isolation via the isolated homeDir of TestRig
    this._setupRun(task, condition, sessionId, settingsOverrides, options);

    try {
      const singleRun = await this._executeRun(
        task,
        settingsOverrides,
        {
          stdin: task.prompt,
        },
        0,
      );

      return singleRun.metadata;
    } finally {
      await this.rig.cleanup();
    }
  }

  async runBenchmarkWithCheckpointResume(
    task: BenchmarkTask,
    condition: BenchmarkCondition,
    options: BenchmarkCheckpointResumeOptions = {},
  ): Promise<BenchmarkCheckpointResumeMetadata> {
    const sessionId = crypto.randomUUID();
    const settingsOverrides = this._createSettingsOverrides(condition);

    this._setupRun(task, condition, sessionId, settingsOverrides, options);

    try {
      const initialRun = await this._executeRun(
        task,
        settingsOverrides,
        {
          args: ['--prompt', task.prompt],
        },
        0,
      );

      const resumedRun = await this._executeRun(
        task,
        settingsOverrides,
        {
          args: [
            '--resume',
            'latest',
            '--prompt',
            options.resumePrompt ?? 'Confirm benchmark completion.',
          ],
        },
        initialRun.nextTelemetryIndex,
      );

      return {
        initialRun: initialRun.metadata,
        resumedRun: resumedRun.metadata,
        fairnessStateConsistent:
          JSON.stringify(initialRun.metadata.fairnessPins) ===
          JSON.stringify(resumedRun.metadata.fairnessPins),
      };
    } finally {
      await this.rig.cleanup();
    }
  }

  private _setupRun(
    task: BenchmarkTask,
    condition: BenchmarkCondition,
    sessionId: string,
    settingsOverrides: BenchmarkSettingsOverrides,
    options: BenchmarkRunOptions,
  ) {
    this.rig.setup(`bm-${task.id}-cond-${condition.id}-${sessionId}`, {
      settings: settingsOverrides as unknown as Record<string, unknown>,
      fakeResponsesPath: options.fakeResponsesPath,
    });
    this._provisionTaskWorkspace(task);
  }

  private _createSettingsOverrides(
    condition: BenchmarkCondition,
  ): BenchmarkSettingsOverrides {
    // Configure fairness pins as per P0-05 contract:
    // FP-04: Dynamic model config pin
    // FP-02: Loop detector LLM checks disabled
    // FP-01: Router pin to explicit override
    return {
      model: {
        name: condition.executorModel,
        disableLoopDetection: true,
      },
      experimental: {
        dynamicModelConfiguration: false,
        gemmaModelRouter: { enabled: false },
        pollux: {
          enabled: condition.advisorModel !== undefined,
          executorModel: condition.executorModel,
          advisorModel: condition.advisorModel,
          strategy: condition.strategy,
        },
      },
    };
  }

  private _provisionTaskWorkspace(task: BenchmarkTask) {
    if (!this.rig.testDir) {
      return;
    }

    for (const [filename, content] of Object.entries(task.files)) {
      const fullPath = path.join(this.rig.testDir, filename);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }

  private _computeFairnessPins(
    settingsOverrides: BenchmarkSettingsOverrides,
  ): BenchmarkRunMetadata['fairnessPins'] {
    return {
      routerPinned:
        settingsOverrides.model.name !== 'auto' &&
        settingsOverrides.experimental.gemmaModelRouter.enabled === false,
      loopDetectionDisabled:
        settingsOverrides.model.disableLoopDetection === true,
      availabilityReset: true,
      dynamicConfigFixed:
        settingsOverrides.experimental.dynamicModelConfiguration === false,
      sessionIsolated: true,
      sandboxIsolated: true,
    };
  }

  private async _executeRun(
    task: BenchmarkTask,
    settingsOverrides: BenchmarkSettingsOverrides,
    runOptions: {
      args?: string[];
      stdin?: string;
    },
    telemetryStartIndex: number,
  ): Promise<{ metadata: BenchmarkRunMetadata; nextTelemetryIndex: number }> {
    const fairnessPins = this._computeFairnessPins(settingsOverrides);
    const startTime = Date.now();

    let runStdout = '';
    let runError = false;

    try {
      runStdout = await this.rig.run({
        args: runOptions.args,
        stdin: runOptions.stdin,
        approvalMode: 'yolo',
        timeout: 120000,
        env: BENCHMARK_ENV,
      });
    } catch (e) {
      runError = true;
      runStdout = e instanceof Error ? e.message : String(e);
    }

    const latencyMs = Date.now() - startTime;
    const telemetry = this.rig.readAllApiResponse();
    const runTelemetry = telemetry.slice(telemetryStartIndex);

    const tokens = { total: 0, advisor: 0, executor: 0 };
    for (const response of runTelemetry) {
      const role = response.attributes?.['role'];
      const usageTokens = response.attributes?.['total_token_count'] || 0;
      tokens.total += usageTokens;
      if (role === 'utility_advisor') {
        tokens.advisor += usageTokens;
      } else {
        tokens.executor += usageTokens;
      }
    }

    const accuracyPass =
      !runError && this.rig.testDir
        ? await task.oracle(runStdout, this.rig.testDir)
        : false;

    const invalidPin = Object.entries(fairnessPins).find(([, value]) => !value);
    const isValid = !runError && !invalidPin;

    return {
      metadata: {
        valid: isValid,
        invalidationReason:
          invalidPin?.[0] ?? (runError ? 'run_error' : undefined),
        executionOutput: runStdout,
        fairnessPins,
        metrics: {
          accuracyPass,
          latencyMs,
          tokens,
        },
      },
      nextTelemetryIndex: telemetry.length,
    };
  }
}
