/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestRig } from './test-rig.js';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ROUTER_TELEMETRY_ROLE,
  LOOP_DETECTOR_TELEMETRY_ROLE,
  ADVISOR_TELEMETRY_ROLE,
  evaluatePerRunPins,
} from './benchmark-fairness-pins.js';

// Define localized types to avoid deep imports breaking the test-utils build
export type BenchmarkDifficulty = 'simple' | 'moderate' | 'complex';

export interface BenchmarkTask {
  id: string;
  difficulty: BenchmarkDifficulty;
  description: string;
  files: Record<string, string>;
  prompt: string;
  /**
   * Marks tasks specifically crafted to trip the Pollux escalation detector
   * (heuristic, structured, or hybrid). The aggregator uses this flag to
   * compute the escalation confusion matrix in P4-05: a sample becomes an
   * "expected positive" only when its task is `escalates: true` AND its
   * condition has Pollux enabled. Defaults to `false`.
   */
  escalates?: boolean;
  /**
   * Optional task-specific resume prompt. Tasks that intend to exercise the
   * advisor on every turn (e.g. ESCALATING) override the default resume
   * prompt with one that also trips the detector so the resume CLI
   * subprocess consumes the same fixture sequence as the initial run.
   */
  resumePrompt?: string;
  oracle: (stdout: string, workspaceDir: string) => boolean | Promise<boolean>;
}

export interface BenchmarkCondition {
  id: string; // e.g. 'A', 'B', 'C', 'D', 'E'
  executorModel: string;
  advisorModel?: string; // Not present in baseline conditions
  advisorFallbackModel?: string | null;
  /**
   * Optional observer-detector overrides for condition F (redesigned detector).
   * Typed locally to avoid importing deep core config surfaces into test-utils.
   */
  detector?: {
    riskGate?: {
      enabled?: boolean;
      mode?: 'allowlist' | 'blocklist';
      denyPatterns?: string[];
    };
    observer?: {
      enabled?: boolean;
      maxThoughtWindowChars?: number;
      maxToolEventWindow?: number;
      decayHalfLifeMs?: number;
    };
    selfReport?: { enabled?: boolean; promptPrimingEnabled?: boolean };
    fusion?: {
      targetEscalationRate?: number;
      requireComposite?: boolean;
      lowPrecisionFloor?: number;
      sameTurnThresholdMultiplier?: number;
      sameTurnAbsoluteFloor?: number;
    };
    timing?: {
      sameTurnEnabled?: boolean;
      maxSameTurnEscalationsPerTurn?: number;
    };
  };
}

export interface BenchmarkRunOptions {
  fakeResponsesPath?: string;
}

export interface BenchmarkCheckpointResumeOptions extends BenchmarkRunOptions {
  resumePrompt?: string;
}

/**
 * Runtime observables captured from the CLI subprocess that backs a single
 * benchmark cell. These are the inputs to the per-run fairness pin
 * evaluation (see {@link evaluatePerRunPins}).
 *
 * Critically: this struct intentionally exposes the CLI's actual observed
 * behavior (utility role telemetry counts, isolated paths) and not just an
 * echo of the requested settings. Phase 3 of the harness review found that
 * `_computeFairnessPins` had hardcoded `availabilityReset`, `sessionIsolated`,
 * and `sandboxIsolated` to the constant `true`, which made the audit
 * evidentially hollow. The revised contract is: every pin must be either (a)
 * derived from a runtime observable here, or (b) marked as a documented
 * settings-derived limitation.
 */
export interface BenchmarkRunObservables {
  /**
   * Session identifier injected into the CLI's TestRig setup name. Used by
   * the aggregator to verify cross-run session isolation (FP-05). Always
   * non-empty; aggregator confirms uniqueness across the matrix.
   */
  sessionId: string;
  /**
   * Absolute path of the per-run isolated workspace directory created by
   * TestRig. Used by the aggregator to verify cross-run sandbox isolation
   * (FP-06). Always non-empty; aggregator confirms uniqueness.
   */
  workspaceDir: string;
  /**
   * Absolute path of the per-run isolated home directory created by TestRig.
   * This is where telemetry.log and per-process state (availability cache,
   * loop-detector windows) live. Used by the aggregator to verify cross-run
   * availability state reset (FP-03). Always non-empty; aggregator confirms
   * uniqueness.
   */
  homeDir: string;
  /**
   * Counts of api_response telemetry events keyed by `LlmRole`. Drives the
   * AC-03 baseline utility-suppression check: a routerPinned run MUST NOT
   * emit any `utility_router` events at runtime; a loopDetectionDisabled
   * run MUST NOT emit any `utility_loop_detector` events at runtime. Empty
   * when the CLI emitted no api_response events.
   */
  utilityRoleCounts: Readonly<Record<string, number>>;
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
  /**
   * Runtime evidence captured from the CLI subprocess that backs this run.
   * Exposed so downstream aggregators (full benchmark + fairness audit) can
   * verify cross-run uniqueness and re-derive pin truths from observable
   * behavior rather than from settings echoes alone.
   */
  observables: BenchmarkRunObservables;
  metrics: {
    accuracyPass: boolean;
    latencyMs: number;
    tokens: {
      total: number;
      advisor: number;
      executor: number;
    };
    /**
     * Number of advisor (LlmRole.UTILITY_ADVISOR) responses observed in
     * telemetry for this run. The escalation confusion matrix in P4-05
     * derives TP/FP/FN purely from this counter and the task's
     * `escalates` flag.
     */
    observedAdvisorCalls: number;
  };
}

export interface BenchmarkCheckpointResumeMetadata {
  initialRun: BenchmarkRunMetadata;
  resumedRun: BenchmarkRunMetadata;
  fairnessStateConsistent: boolean;
}

export interface BenchmarkSettingsOverrides {
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
      advisorFallbackModel?: string | null;
      advisorExecutorProfile?: 'default' | 'flash_lite';
      advisorTriggerMode?: 'executor_request' | 'detector' | 'hybrid';
      advisorBudgetMode?: 'fixed' | 'adaptive';
      maxAdvisorCallsShortTask?: number;
      maxAdvisorCallsLongTask?: number;
      advisorShamEnabled?: boolean;
      advisorShamGuidance?: string;
      diagnosticTrace?: {
        enabled?: boolean;
        outputPath?: string | null;
        includeModelThoughts?: 'summary' | 'raw_model_exposed';
        includeAdvisorGuidanceText?: boolean;
      };
      longTaskHeuristic?: {
        minToolCalls?: number;
        minPromptChars?: number;
        anchoredMutation?: boolean;
      };
      detector?: BenchmarkCondition['detector'];
    };
  };
}

const BENCHMARK_ENV = {
  GEMINI_API_KEY: 'fake-key',
  GOOGLE_API_KEY: 'fake-key',
} as const;

/**
 * Re-export the standalone fairness-pin evaluator and telemetry role
 * constants from benchmark-fairness-pins.ts. This preserves backward
 * compatibility for consumers that already import these symbols from
 * benchmark-harness. Non-vitest entrypoints (e.g. pollux-real-pilot.ts)
 * should import directly from benchmark-fairness-pins.ts to avoid the
 * transitive vitest dependency through test-rig.ts.
 */
export {
  ROUTER_TELEMETRY_ROLE,
  LOOP_DETECTOR_TELEMETRY_ROLE,
  ADVISOR_TELEMETRY_ROLE,
  evaluatePerRunPins,
};

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
        sessionId,
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
        sessionId,
        {
          args: ['--prompt', task.prompt],
        },
        0,
      );

      // Per-task escalating prompts (e.g. CAL-BM-04-ESCALATING) are honored
      // here so the resume turn lands on the same detector path as the
      // initial turn and therefore consumes the same fixture sequence (the
      // CLI subprocess is fresh and replays fixtures from index 0). Without
      // this hook, an escalating task's resume turn would silently consume
      // an advisor-shaped fixture as if it were an executor response and
      // would never observe a `utility_advisor` telemetry event.
      const resumePrompt =
        options.resumePrompt ??
        task.resumePrompt ??
        'Confirm benchmark completion.';

      const resumedRun = await this._executeRun(
        task,
        settingsOverrides,
        sessionId,
        {
          args: ['--resume', 'latest', '--prompt', resumePrompt],
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
          advisorFallbackModel: condition.advisorModel
            ? (condition.advisorFallbackModel ?? condition.executorModel)
            : null,
          detector: condition.detector,
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

  private async _executeRun(
    task: BenchmarkTask,
    settingsOverrides: BenchmarkSettingsOverrides,
    sessionId: string,
    runOptions: {
      args?: string[];
      stdin?: string;
    },
    telemetryStartIndex: number,
  ): Promise<{ metadata: BenchmarkRunMetadata; nextTelemetryIndex: number }> {
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
    const utilityRoleCounts: Record<string, number> = {};
    let observedAdvisorCalls = 0;
    for (const response of runTelemetry) {
      const roleAttr = response.attributes?.['role'];
      const role = typeof roleAttr === 'string' ? roleAttr : undefined;
      const usageTokens =
        (response.attributes?.['total_token_count'] as number | undefined) ?? 0;
      tokens.total += usageTokens;
      if (role === ADVISOR_TELEMETRY_ROLE) {
        tokens.advisor += usageTokens;
        observedAdvisorCalls += 1;
      } else {
        tokens.executor += usageTokens;
      }
      if (role !== undefined) {
        utilityRoleCounts[role] = (utilityRoleCounts[role] ?? 0) + 1;
      }
    }

    const observables: BenchmarkRunObservables = {
      sessionId,
      workspaceDir: this.rig.testDir ?? '',
      homeDir: this.rig.homeDir ?? '',
      utilityRoleCounts,
    };

    const fairnessPins = evaluatePerRunPins(settingsOverrides, observables);

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
        observables,
        metrics: {
          accuracyPass,
          latencyMs,
          tokens,
          observedAdvisorCalls,
        },
      },
      nextTelemetryIndex: telemetry.length,
    };
  }
}
