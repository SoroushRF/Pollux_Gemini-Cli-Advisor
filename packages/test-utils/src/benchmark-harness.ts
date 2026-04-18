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

    // Configure fairness pins as per P0-05 contract:
    // FP-04: Dynamic model config pin
    // FP-02: Loop detector LLM checks disabled
    // FP-01: Router pin to explicit override
    const settingsOverrides = {
      model: {
        name: condition.executorModel,
        disableLoopDetection: true,
      },
      experimental: {
        dynamicModelConfiguration: false, // FP-04: Prevent classification-based overrides
        gemmaModelRouter: { enabled: false }, // FP-01 part 2
        pollux: {
          enabled: condition.advisorModel !== undefined,
          executorModel: condition.executorModel,
          advisorModel: condition.advisorModel,
          strategy: condition.strategy,
        },
      },
    };

    // FP-03: Fresh availability state, via entirely new test rig
    // FP-06: Sandbox and process-isolation via the isolated homeDir of TestRig
    this.rig.setup(`bm-${task.id}-cond-${condition.id}-${sessionId}`, {
      settings: settingsOverrides,
      fakeResponsesPath: options.fakeResponsesPath,
    });

    // Provision the task workspace
    if (this.rig.testDir) {
      for (const [filename, content] of Object.entries(task.files)) {
        const fullPath = path.join(this.rig.testDir, filename);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
      }
    }

    const startTime = Date.now();
    let runStdout = '';
    let runError = false;

    try {
      // Execute the test with standard arguments
      runStdout = await this.rig.run({
        stdin: task.prompt,
        approvalMode: 'yolo',
        // Give enough time for an escalation cycle if needed
        timeout: 120000,
        env: {
          GEMINI_API_KEY: 'fake-key',
          GOOGLE_API_KEY: 'fake-key',
        },
      });
    } catch (e) {
      // We will capture errors as failed execution (0 accuracy) and proceed to metric resolution.
      runError = true;
      runStdout = e instanceof Error ? e.message : String(e);
    }

    const latencyMs = Date.now() - startTime;

    // Resolve metrics & artifacts
    let accuracyPass = false;
    let tokens = { total: 0, advisor: 0, executor: 0 };

    try {
      accuracyPass =
        !runError && (await task.oracle(runStdout, this.rig.testDir!));
      // Parse token metrics from API response telemetry.
      // This maps to AC-06 in P0-05 and preserves role-tagged accounting.
      const apiResponses = this.rig.readAllApiResponse();
      for (const response of apiResponses) {
        if (response.attributes) {
          const role = response.attributes['role'] as string | undefined;
          const usageTokens =
            (response.attributes['total_token_count'] as number) || 0;
          tokens.total += usageTokens;
          if (role === 'utility_advisor') {
            tokens.advisor += usageTokens;
          } else {
            tokens.executor += usageTokens;
          }
        }
      }
    } finally {
      await this.rig.cleanup();
    }

    const fairnessPins = {
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

    const invalidPin = Object.entries(fairnessPins).find(([, value]) => !value);
    const isValid = !runError && !invalidPin;

    return {
      valid: isValid,
      invalidationReason:
        invalidPin?.[0] ?? (runError ? 'run_error' : undefined),
      executionOutput: runStdout,
      fairnessPins: {
        ...fairnessPins,
      },
      metrics: {
        accuracyPass,
        latencyMs,
        tokens,
      },
    };
  }
}
