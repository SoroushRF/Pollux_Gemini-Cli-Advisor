/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GEMINI_DIR } from '@google/gemini-cli-core';
import type { RealBenchmarkTaskSpec } from '../../core/src/pollux/benchmark/realTypes.js';
import {
  ADVISOR_TELEMETRY_ROLE,
  evaluatePerRunPins,
  type FairnessPinSettings,
} from './benchmark-fairness-pins.js';
import {
  POLLUX_REAL_AUTH_SEED_FILES,
  buildRealBenchmarkSettings,
  getDefaultGeminiHome,
  resolveCliEntrypoint,
} from './pollux-real-config.js';
import type {
  PolluxRealPilotOptions,
  RealBenchmarkConditionProfile,
  RealBenchmarkEscalationEvent,
  RealBenchmarkPricingSnapshot,
  RealBenchmarkRunRecord,
  RealBenchmarkTelemetrySummary,
} from './pollux-real-types.js';

interface ParsedTelemetryLog {
  attributes?: Record<string, unknown>;
  body?: string;
}

interface RunProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  wallClockMs: number;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function removeDirIfExists(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function parseTelemetryLogContent(content: string): ParsedTelemetryLog[] {
  return content
    .split(/}\r?\n{/)
    .map((objectText, index, objects) => {
      let normalized = objectText.trim();
      if (index > 0) {
        normalized = '{' + normalized;
      }
      if (index < objects.length - 1) {
        normalized = normalized + '}';
      }
      return normalized;
    })
    .filter((objectText) => objectText.length > 0)
    .flatMap((objectText) => {
      try {
        return [JSON.parse(objectText) as ParsedTelemetryLog];
      } catch {
        return [];
      }
    });
}

function getStringAttribute(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getNumberAttribute(
  attributes: Record<string, unknown> | undefined,
  key: string,
): number {
  const value = attributes?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function getBooleanAttribute(
  attributes: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = attributes?.[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }
  return undefined;
}

function parseJsonStringArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((entry): entry is string => typeof entry === 'string')
        .filter((entry) => entry.length > 0);
    }
  } catch {
    return [];
  }
  return [];
}

function parseEscalationTelemetryEvents(
  events: ParsedTelemetryLog[],
): RealBenchmarkEscalationEvent[] {
  const parsed: RealBenchmarkEscalationEvent[] = [];
  for (const [eventIndex, event] of events.entries()) {
    const attributes = event.attributes;
    const eventName = getStringAttribute(attributes, 'event.name');
    if (eventName !== 'gemini_cli.pollux_escalation') {
      continue;
    }

    const escalationTiming = getStringAttribute(
      attributes,
      'escalation_timing',
    );
    const outcome = getStringAttribute(attributes, 'outcome');
    const pauseBoundary = getStringAttribute(attributes, 'pause_boundary');

    parsed.push({
      turnId: getStringAttribute(attributes, 'turn_id') ?? null,
      reasonCode: getStringAttribute(attributes, 'reason_code') ?? null,
      escalationTiming:
        escalationTiming === 'same_turn' || escalationTiming === 'next_turn'
          ? escalationTiming
          : null,
      outcome:
        outcome === 'consulted' ||
        outcome === 'fail_open' ||
        outcome === 'budget_exhausted' ||
        outcome === 'policy_denied' ||
        outcome === 'deferred_next_turn' ||
        outcome === 'skipped'
          ? outcome
          : null,
      sameTurnDowngraded:
        getBooleanAttribute(attributes, 'same_turn_downgraded') === true,
      pauseBoundary:
        pauseBoundary === 'pre_tool' || pauseBoundary === 'post_event'
          ? pauseBoundary
          : null,
      contributingSignalIds: parseJsonStringArray(
        getStringAttribute(attributes, 'contributing_signal_ids'),
      ),
      failureKind: getStringAttribute(attributes, 'failure_kind') ?? null,
      eventIndex,
    });
  }
  return parsed;
}

function deriveConfusionExclusion(
  escalationEvents: RealBenchmarkEscalationEvent[],
): RealBenchmarkRunRecord['excludedFromConfusion'] {
  if (escalationEvents.some((event) => event.outcome === 'fail_open')) {
    return 'fail_open';
  }
  if (escalationEvents.some((event) => event.outcome === 'budget_exhausted')) {
    return 'budget_exhausted';
  }
  return null;
}

function computeEventCostUsd(
  model: string | undefined,
  attributes: Record<string, unknown> | undefined,
  pricingSnapshot?: RealBenchmarkPricingSnapshot,
): number | null {
  if (!pricingSnapshot || !model) {
    return null;
  }

  const pricing = pricingSnapshot.models[model];
  if (!pricing) {
    return null;
  }

  const inputTokens = getNumberAttribute(attributes, 'input_token_count');
  const outputTokens = getNumberAttribute(attributes, 'output_token_count');
  const cachedInputTokens = getNumberAttribute(
    attributes,
    'cached_content_token_count',
  );

  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const cachedInputCost =
    ((pricing.cachedInputUsdPerMillion ?? pricing.inputUsdPerMillion) *
      cachedInputTokens) /
    1_000_000;
  const inputCost =
    (pricing.inputUsdPerMillion * uncachedInputTokens) / 1_000_000;
  const outputCost = (pricing.outputUsdPerMillion * outputTokens) / 1_000_000;

  return inputCost + cachedInputCost + outputCost;
}

export function summarizeRealBenchmarkTelemetry(
  events: ParsedTelemetryLog[],
  pricingSnapshot?: RealBenchmarkPricingSnapshot,
): RealBenchmarkTelemetrySummary {
  const promptIds = new Set<string>();
  const responseIds = new Set<string>();
  const serviceLatencyMs: number[] = [];
  const utilityRoleCounts = new Map<string, number>();

  let totalTokens = 0;
  let advisorTokens = 0;
  let executorTokens = 0;
  let advisorCalls = 0;

  let totalCost = 0;
  let advisorCost = 0;
  let executorCost = 0;
  let hasAnyCost = false;

  const escalationEvents = parseEscalationTelemetryEvents(events);

  for (const event of events) {
    const attributes = event.attributes;
    const eventName = getStringAttribute(attributes, 'event.name');
    const promptId = getStringAttribute(attributes, 'prompt_id');
    if (promptId) {
      promptIds.add(promptId);
    }

    if (eventName === 'gemini_cli.api_response') {
      const role = getStringAttribute(attributes, 'role') ?? 'main';
      const total = getNumberAttribute(attributes, 'total_token_count');
      const durationMs = getNumberAttribute(attributes, 'duration_ms');
      const model = getStringAttribute(attributes, 'model');
      const eventCostUsd = computeEventCostUsd(
        model,
        attributes,
        pricingSnapshot,
      );

      totalTokens += total;
      serviceLatencyMs.push(durationMs);
      utilityRoleCounts.set(role, (utilityRoleCounts.get(role) ?? 0) + 1);

      if (role === ADVISOR_TELEMETRY_ROLE) {
        advisorCalls += 1;
        advisorTokens += total;
        if (eventCostUsd !== null) {
          advisorCost += eventCostUsd;
          totalCost += eventCostUsd;
          hasAnyCost = true;
        }
      } else if (role === 'main') {
        executorTokens += total;
        if (eventCostUsd !== null) {
          executorCost += eventCostUsd;
          totalCost += eventCostUsd;
          hasAnyCost = true;
        }
      } else if (eventCostUsd !== null) {
        totalCost += eventCostUsd;
        hasAnyCost = true;
      }
    }

    if (eventName === 'gen_ai.client.inference.operation.details') {
      const responseId =
        getStringAttribute(attributes, 'gen_ai.response.id') ??
        getStringAttribute(attributes, 'response_id');
      if (responseId) {
        responseIds.add(responseId);
      }
    }
  }

  return {
    promptIds: [...promptIds],
    responseIds: [...responseIds],
    serviceLatencyMs,
    advisorCalls,
    escalationEvents,
    tokens: {
      total: totalTokens,
      advisor: advisorTokens,
      executor: executorTokens,
    },
    costUsd: {
      total: hasAnyCost ? totalCost : null,
      advisor: hasAnyCost ? advisorCost : null,
      executor: hasAnyCost ? executorCost : null,
      pricingSnapshotId: pricingSnapshot?.id ?? null,
    },
    utilityRoleCounts: Object.fromEntries(utilityRoleCounts),
  };
}

function computeHashForFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return 'missing';
  }
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function getGitSha(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function buildCleanEnv(homeDir: string): NodeJS.ProcessEnv {
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };

  for (const key of Object.keys(cleanEnv)) {
    if (
      (key.startsWith('GEMINI_') || key.startsWith('GOOGLE_GEMINI_')) &&
      key !== 'GEMINI_API_KEY' &&
      key !== 'GOOGLE_API_KEY' &&
      key !== 'GEMINI_DEBUG'
    ) {
      delete cleanEnv[key];
    }
  }

  cleanEnv['GEMINI_CLI_HOME'] = homeDir;
  cleanEnv['GEMINI_PTY_INFO'] = 'child_process';

  return cleanEnv;
}

async function runHeadlessCli(
  command: string,
  args: string[],
  cwd: string,
  homeDir: string,
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env: buildCleanEnv(homeDir),
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (exitCode) => {
      resolve({
        exitCode,
        stdout,
        stderr,
        wallClockMs: Date.now() - startedAt,
      });
    });
  });
}

export class PolluxLiveRunRig {
  private readonly repoRoot: string;
  private readonly artifactRoot: string;
  private readonly manifest: PolluxRealPilotOptions['manifest'];
  private readonly pricingSnapshot?: RealBenchmarkPricingSnapshot;
  private readonly binaryPath?: string;
  private readonly keepScratchDirectories: boolean;

  constructor(options: PolluxRealPilotOptions & { repoRoot: string }) {
    this.repoRoot = options.repoRoot;
    this.artifactRoot = options.artifactRoot;
    this.manifest = options.manifest;
    this.pricingSnapshot = options.pricingSnapshot;
    this.binaryPath = options.binaryPath;
    this.keepScratchDirectories = options.keepScratchDirectories ?? true;
  }

  async runSample(
    task: RealBenchmarkTaskSpec,
    condition: RealBenchmarkConditionProfile,
    sampleIndex: number,
    corpusSha: string,
  ): Promise<RealBenchmarkRunRecord> {
    const sampleId = sanitizeSegment(
      `${condition.id}-${task.id.toLowerCase()}-run-${String(sampleIndex).padStart(3, '0')}`,
    );
    const sampleRoot = path.join(this.artifactRoot, 'scratch', sampleId);
    const workspaceDir = path.join(sampleRoot, 'workspace');
    const homeDir = path.join(sampleRoot, 'home');
    const telemetryPath = path.join(homeDir, 'telemetry.log');
    const stdoutPath = path.join(sampleRoot, 'stdout.txt');
    const stderrPath = path.join(sampleRoot, 'stderr.txt');
    const homeGeminiDir = path.join(homeDir, GEMINI_DIR);
    const workspaceGeminiDir = path.join(workspaceDir, GEMINI_DIR);

    removeDirIfExists(sampleRoot);
    ensureDir(workspaceDir);
    ensureDir(homeGeminiDir);
    ensureDir(workspaceGeminiDir);

    this.seedWorkspaceFiles(task, workspaceDir);
    this.seedAuthFiles(homeGeminiDir);

    const settings = buildRealBenchmarkSettings(condition, telemetryPath);
    writeJson(path.join(homeGeminiDir, 'settings.json'), settings);
    writeJson(path.join(workspaceGeminiDir, 'settings.json'), settings);
    writeJson(path.join(homeGeminiDir, 'state.json'), {
      terminalSetupPromptShown: true,
    });

    const entrypoint = resolveCliEntrypoint(this.binaryPath);
    const result = await runHeadlessCli(
      entrypoint.command,
      [
        ...entrypoint.initialArgs,
        '--approval-mode=yolo',
        '--prompt',
        task.prompt,
      ],
      workspaceDir,
      homeDir,
    );

    fs.writeFileSync(stdoutPath, result.stdout);
    fs.writeFileSync(stderrPath, result.stderr);

    const telemetryEvents = fs.existsSync(telemetryPath)
      ? parseTelemetryLogContent(fs.readFileSync(telemetryPath, 'utf8'))
      : [];
    const telemetry = summarizeRealBenchmarkTelemetry(
      telemetryEvents,
      this.pricingSnapshot,
    );
    const oraclePass = await task.oracle(result.stdout, workspaceDir);
    const fairnessPins = evaluatePerRunPins(settings as FairnessPinSettings, {
      sessionId: sampleId,
      workspaceDir,
      homeDir,
      utilityRoleCounts: telemetry.utilityRoleCounts,
    });

    const invalidationReason = this.computeInvalidationReason(
      result.exitCode,
      result.stderr,
      telemetryEvents,
      telemetry,
      fairnessPins,
    );

    const record: RealBenchmarkRunRecord = {
      campaignId: this.manifest.campaignId,
      sampleId,
      taskId: task.id,
      conditionId: condition.id,
      sampleIndex,
      gitSha: getGitSha(this.repoRoot),
      lockfileHash: computeHashForFile(
        path.join(this.repoRoot, 'package-lock.json'),
      ),
      corpusSha,
      promptId: telemetry.promptIds[0] ?? null,
      responseIds: telemetry.responseIds,
      wallClockMs: result.wallClockMs,
      serviceLatencyMs: telemetry.serviceLatencyMs,
      tokens: telemetry.tokens,
      costUsd: telemetry.costUsd,
      observedAdvisorCalls: telemetry.advisorCalls,
      escalationEvents: telemetry.escalationEvents,
      escalationTiming: [
        ...new Set(
          telemetry.escalationEvents
            .map((event) => event.escalationTiming)
            .filter(
              (timing): timing is 'same_turn' | 'next_turn' =>
                timing === 'same_turn' || timing === 'next_turn',
            ),
        ),
      ],
      reasonCodes: [
        ...new Set(
          telemetry.escalationEvents
            .map((event) => event.reasonCode)
            .filter((reasonCode): reasonCode is string => reasonCode !== null),
        ),
      ],
      excludedFromConfusion: deriveConfusionExclusion(
        telemetry.escalationEvents,
      ),
      fairnessPins,
      oraclePass,
      invalidated: invalidationReason !== undefined,
      invalidationReason,
      exitCode: result.exitCode,
      taskEscalates: task.escalates === true,
      workspaceDir,
      homeDir,
      telemetryPath,
      stdoutPath,
      stderrPath,
    };

    if (!this.keepScratchDirectories) {
      removeDirIfExists(sampleRoot);
    }

    return record;
  }

  private seedWorkspaceFiles(
    task: RealBenchmarkTaskSpec,
    workspaceDir: string,
  ) {
    for (const [relativePath, content] of Object.entries(task.files)) {
      const targetPath = path.join(workspaceDir, relativePath);
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, content);
    }
  }

  private seedAuthFiles(homeGeminiDir: string): void {
    if (this.manifest.authIsolationMode !== 'single_account') {
      return;
    }

    const sourceGeminiDir = getDefaultGeminiHome();
    for (const fileName of POLLUX_REAL_AUTH_SEED_FILES) {
      const sourcePath = path.join(sourceGeminiDir, fileName);
      if (!fs.existsSync(sourcePath)) {
        continue;
      }
      const destinationPath = path.join(homeGeminiDir, fileName);
      ensureDir(path.dirname(destinationPath));
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }

  private computeInvalidationReason(
    exitCode: number | null,
    stderr: string,
    telemetryEvents: ParsedTelemetryLog[],
    telemetry: RealBenchmarkTelemetrySummary,
    fairnessPins: RealBenchmarkRunRecord['fairnessPins'],
  ): string | undefined {
    if (exitCode !== 0) {
      if (/auth|login|credential/i.test(stderr)) {
        return 'auth_failure';
      }
      if (/rate.?limit|quota/i.test(stderr)) {
        return 'rate_limit_contamination';
      }
      return 'cli_exit_nonzero';
    }

    if (telemetryEvents.length === 0) {
      return 'missing_telemetry';
    }

    if (telemetry.promptIds.length === 0) {
      return 'missing_prompt_id';
    }

    if (telemetry.responseIds.length === 0) {
      return 'missing_response_id';
    }

    if (Object.values(fairnessPins).some((value) => value !== true)) {
      return 'fairness_pin_failure';
    }

    return undefined;
  }
}
