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
  collectRealBenchmarkBuildFreshness,
  getDefaultGeminiHome,
  resolveCliEntrypoint,
} from './pollux-real-config.js';
import type {
  RealBenchmarkAdvisorAttemptRecord,
  PolluxRealPilotOptions,
  RealBenchmarkAdvisorConsultOutcome,
  RealBenchmarkConditionProfile,
  RealBenchmarkConfusionOutcome,
  RealBenchmarkDesiredOutcomeReasonCode,
  RealBenchmarkEscalationEvent,
  RealBenchmarkInvalidationReason,
  RealBenchmarkPricingSnapshot,
  RealBenchmarkRunRecord,
  RealBenchmarkStructuredErrorEvidence,
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
  timedOut: boolean;
}

const CONSULT_ATTEMPT_OUTCOMES = new Set([
  'consulted',
  'fail_open',
  'budget_exhausted',
  'policy_denied',
  'deferred_next_turn',
]);

function countEscalationAttempts(
  escalationEvents: readonly RealBenchmarkEscalationEvent[],
): number {
  return escalationEvents.filter(
    (event): boolean =>
      event.outcome !== null && CONSULT_ATTEMPT_OUTCOMES.has(event.outcome),
  ).length;
}

function countStatusTagsInText(text: string): number {
  const matches = text.match(/<pollux:status\b[^>]*\/?>/gi);
  return matches?.length ?? 0;
}

function countStatusNearMissesInText(text: string): number {
  const allStatusPrefixes = text.match(/<pollux:status[^>]*(?:>|$)/gi) ?? [];
  const validStatusTags = text.match(/<pollux:status\b[^>]*\/?>/gi) ?? [];
  return Math.max(0, allStatusPrefixes.length - validStatusTags.length);
}

function countWorkspacePathViolations(stderr: string): number {
  const matches = stderr.match(/Path not in workspace/gi);
  return matches?.length ?? 0;
}

function countToolErrors(stderr: string): number {
  const patterns = [
    /Path not in workspace/gi,
    /Parameter name '[^']+' is ambiguous/gi,
    /Error executing tool/gi,
    /Command failed/gi,
    /exited with code:\s*(?!0\b)-?\d+/gi,
  ];
  return patterns.reduce(
    (sum, pattern) => sum + (stderr.match(pattern)?.length ?? 0),
    0,
  );
}

function formatExitCodeHex(exitCode: number | null): string | null {
  if (exitCode === null) {
    return null;
  }
  return `0x${(exitCode >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

function truncateForEvidence(text: string): string | null {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : null;
}

function extractStructuredErrorEvidence(
  exitCode: number | null,
  stderr: string,
): RealBenchmarkStructuredErrorEvidence | null {
  if (exitCode === 0 && stderr.trim().length === 0) {
    return null;
  }

  const statusMatch = /(?:status|code)[^\d]{0,10}(429|401|403|500|503)/i.exec(
    stderr,
  );
  const reasonMatch =
    /\b(MODEL_CAPACITY_EXHAUSTED|RESOURCE_EXHAUSTED|RATE_LIMIT_EXCEEDED|QUOTA_EXCEEDED|UNAUTHENTICATED|PERMISSION_DENIED)\b/i.exec(
      stderr,
    );
  const codeMatch = /\b(429|401|403|500|503)\b/.exec(stderr);

  return {
    source: stderr.trim().length > 0 ? 'stderr' : 'process',
    exitCode,
    exitCodeHex: formatExitCodeHex(exitCode),
    matchedStatus: statusMatch
      ? Number.parseInt(statusMatch[1], 10)
      : codeMatch
        ? Number.parseInt(codeMatch[1], 10)
        : null,
    matchedReason: reasonMatch?.[1] ?? null,
    matchedCode: codeMatch?.[1] ?? null,
    messageSnippet: truncateForEvidence(stderr),
  };
}

function classifyInvalidationFromEvidence(
  evidence: RealBenchmarkStructuredErrorEvidence | null,
  stderr: string,
): RealBenchmarkInvalidationReason {
  const reason = evidence?.matchedReason?.toUpperCase() ?? '';
  if (
    reason === 'MODEL_CAPACITY_EXHAUSTED' ||
    reason === 'RESOURCE_EXHAUSTED' ||
    /model_capacity_exhausted|resource_exhausted|no capacity available/i.test(
      stderr,
    )
  ) {
    return 'model_capacity_exhausted';
  }
  if (
    evidence?.matchedStatus === 429 ||
    reason === 'RATE_LIMIT_EXCEEDED' ||
    reason === 'QUOTA_EXCEEDED' ||
    /rate.?limit|quota/i.test(stderr)
  ) {
    return 'rate_limit_contamination';
  }
  if (
    reason === 'UNAUTHENTICATED' ||
    reason === 'PERMISSION_DENIED' ||
    /auth|login|credential/i.test(stderr)
  ) {
    return 'auth_failure';
  }
  return 'cli_exit_nonzero';
}

export function classifyRealBenchmarkProcessFailure(
  exitCode: number | null,
  stderr: string,
): {
  reason: RealBenchmarkInvalidationReason;
  evidence: RealBenchmarkStructuredErrorEvidence | null;
} {
  const evidence = extractStructuredErrorEvidence(exitCode, stderr);
  return {
    reason: classifyInvalidationFromEvidence(evidence, stderr),
    evidence,
  };
}

function computeExpectedEscalation(
  task: RealBenchmarkTaskSpec,
  condition: RealBenchmarkConditionProfile,
): boolean {
  return task.escalates === true && condition.polluxEnabled;
}

function computePredictedEscalation(
  telemetry: RealBenchmarkTelemetrySummary,
): boolean {
  return telemetry.escalationAttemptCount > 0 || telemetry.advisorCalls > 0;
}

function computeAdvisorConsultOutcome(params: {
  expectedEscalation: boolean;
  escalationEvents: readonly RealBenchmarkEscalationEvent[];
}): RealBenchmarkAdvisorConsultOutcome {
  if (!params.expectedEscalation) {
    return 'not_expected';
  }

  for (const event of params.escalationEvents) {
    if (
      event.outcome === 'consulted' ||
      event.outcome === 'fail_open' ||
      event.outcome === 'budget_exhausted' ||
      event.outcome === 'policy_denied'
    ) {
      return event.outcome;
    }
  }

  return 'not_attempted';
}

function computeAdvisorFailureKind(
  escalationEvents: readonly RealBenchmarkEscalationEvent[],
): string | null {
  for (let index = escalationEvents.length - 1; index >= 0; index -= 1) {
    const failureKind = escalationEvents[index].failureKind;
    if (failureKind) {
      return failureKind;
    }
  }
  return null;
}

function computeDesiredOutcome(params: {
  benchmarkLane: RealBenchmarkTaskSpec['benchmarkLane'];
  invalidated: boolean;
  oraclePass: boolean;
  expectedEscalation: boolean;
  predictedEscalation: boolean;
  advisorConsultOutcome: RealBenchmarkAdvisorConsultOutcome;
}): {
  satisfied: boolean;
  reasonCode: RealBenchmarkDesiredOutcomeReasonCode;
} {
  if (params.benchmarkLane === 'core') {
    if (params.invalidated) {
      return { satisfied: false, reasonCode: 'core.invalidated' };
    }
    if (!params.oraclePass) {
      return { satisfied: false, reasonCode: 'core.oracle_failed' };
    }
    return { satisfied: true, reasonCode: 'core.oracle_pass' };
  }

  if (params.benchmarkLane === 'stress') {
    if (params.invalidated) {
      return { satisfied: false, reasonCode: 'stress.invalidated' };
    }
    if (!params.oraclePass) {
      return { satisfied: false, reasonCode: 'stress.oracle_failed' };
    }
    return { satisfied: true, reasonCode: 'stress.oracle_pass' };
  }

  if (params.invalidated) {
    return { satisfied: false, reasonCode: 'canary.invalidated' };
  }
  if (!params.oraclePass) {
    return { satisfied: false, reasonCode: 'canary.oracle_failed' };
  }
  if (!params.expectedEscalation && !params.predictedEscalation) {
    return { satisfied: true, reasonCode: 'canary.true_negative' };
  }
  if (!params.expectedEscalation && params.predictedEscalation) {
    return { satisfied: false, reasonCode: 'canary.unexpected_escalation' };
  }
  if (params.expectedEscalation && !params.predictedEscalation) {
    return { satisfied: false, reasonCode: 'canary.missed_escalation' };
  }

  if (params.advisorConsultOutcome === 'consulted') {
    return { satisfied: true, reasonCode: 'canary.consulted_true_positive' };
  }
  if (params.advisorConsultOutcome === 'fail_open') {
    return { satisfied: false, reasonCode: 'canary.fail_open' };
  }
  if (params.advisorConsultOutcome === 'budget_exhausted') {
    return { satisfied: false, reasonCode: 'canary.budget_exhausted' };
  }
  if (params.advisorConsultOutcome === 'policy_denied') {
    return { satisfied: false, reasonCode: 'canary.policy_denied' };
  }

  return {
    satisfied: false,
    reasonCode: 'canary.predicted_without_consult',
  };
}

function computeConfusionOutcome(params: {
  expected: boolean;
  predicted: boolean;
  invalidated: boolean;
  excludedFromConfusion: RealBenchmarkRunRecord['excludedFromConfusion'];
}): RealBenchmarkConfusionOutcome {
  if (params.invalidated || params.excludedFromConfusion !== null) {
    return 'excluded';
  }
  if (params.expected && params.predicted) {
    return 'true_positive';
  }
  if (!params.expected && params.predicted) {
    return 'false_positive';
  }
  if (params.expected && !params.predicted) {
    return 'false_negative';
  }
  return 'true_negative';
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function positiveNumberOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

function parseAdvisorAttemptTelemetryEvents(
  events: ParsedTelemetryLog[],
): RealBenchmarkAdvisorAttemptRecord[] {
  const parsed: RealBenchmarkAdvisorAttemptRecord[] = [];
  for (const [eventIndex, event] of events.entries()) {
    const attributes = event.attributes;
    const eventName = getStringAttribute(attributes, 'event.name');
    if (eventName !== 'gemini_cli.pollux_advisor_attempt') {
      continue;
    }

    const escalationTiming = getStringAttribute(
      attributes,
      'escalation_timing',
    );
    const attemptKind = getStringAttribute(attributes, 'attempt_kind');
    const parserOutcome = getStringAttribute(attributes, 'parser_outcome');
    const outcome = getStringAttribute(attributes, 'outcome');

    parsed.push({
      turnId: getStringAttribute(attributes, 'turn_id') ?? null,
      reasonCode: getStringAttribute(attributes, 'reason_code') ?? null,
      escalationTiming:
        escalationTiming === 'same_turn' || escalationTiming === 'next_turn'
          ? escalationTiming
          : null,
      attemptIndex: getNumberAttribute(attributes, 'attempt_index'),
      attemptKind:
        attemptKind === 'primary' ||
        attemptKind === 'repair_retry' ||
        attemptKind === 'fallback'
          ? attemptKind
          : 'primary',
      model: getStringAttribute(attributes, 'model') ?? null,
      parserOutcome:
        parserOutcome === 'direct' ||
        parserOutcome === 'recovered_fence' ||
        parserOutcome === 'recovered_substring' ||
        parserOutcome === 'parse_error' ||
        parserOutcome === 'malformed_json' ||
        parserOutcome === 'schema' ||
        parserOutcome === 'empty_response' ||
        parserOutcome === 'timeout' ||
        parserOutcome === 'capacity_exhausted' ||
        parserOutcome === 'quota_exhausted'
          ? parserOutcome
          : null,
      outcome:
        outcome === 'consulted' ||
        outcome === 'parse_error' ||
        outcome === 'empty_response' ||
        outcome === 'timeout' ||
        outcome === 'capacity_exhausted' ||
        outcome === 'quota_exhausted'
          ? outcome
          : null,
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
  const advisorAttempts = parseAdvisorAttemptTelemetryEvents(events);
  const escalationAttemptCount = countEscalationAttempts(escalationEvents);

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
    advisorAttempts,
    escalationAttemptCount,
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
  timeoutMs: number,
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let settled = false;
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      env: buildCleanEnv(homeDir),
      stdio: 'pipe',
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

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
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
        wallClockMs: Date.now() - startedAt,
        timedOut,
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
  private readonly entrypointPreference?: PolluxRealPilotOptions['entrypointPreference'];
  private readonly keepScratchDirectories: boolean;
  private readonly maxWallClockMs: number;
  private readonly maxModelResponsesPerSample: number;

  constructor(options: PolluxRealPilotOptions & { repoRoot: string }) {
    this.repoRoot = options.repoRoot;
    this.artifactRoot = options.artifactRoot;
    this.manifest = options.manifest;
    this.pricingSnapshot = options.pricingSnapshot;
    this.binaryPath = options.binaryPath;
    this.entrypointPreference = options.entrypointPreference;
    this.keepScratchDirectories = options.keepScratchDirectories ?? true;
    this.maxWallClockMs = positiveNumberOrFallback(
      options.maxWallClockMs ??
        Number(process.env['POLLUX_REAL_SAMPLE_TIMEOUT_MS'] ?? 600_000),
      600_000,
    );
    this.maxModelResponsesPerSample = positiveNumberOrFallback(
      options.maxModelResponsesPerSample ??
        Number(process.env['POLLUX_REAL_MAX_MODEL_RESPONSES'] ?? 6),
      6,
    );
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

    const entrypoint = resolveCliEntrypoint(
      this.binaryPath,
      this.entrypointPreference,
    );
    const buildFreshness = collectRealBenchmarkBuildFreshness(this.repoRoot);
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
      this.maxWallClockMs,
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
    const stdoutStatusTagCount = countStatusTagsInText(result.stdout);
    const nearMissStatusTagCount = countStatusNearMissesInText(result.stdout);
    const malformedStatusTagCount = nearMissStatusTagCount;
    const stderrWorkspacePathViolationCount = countWorkspacePathViolations(
      result.stderr,
    );
    const toolErrorCount = countToolErrors(result.stderr);
    const oraclePass = await task.oracle(result.stdout, workspaceDir);
    const fairnessPins = evaluatePerRunPins(settings as FairnessPinSettings, {
      sessionId: sampleId,
      workspaceDir,
      homeDir,
      utilityRoleCounts: telemetry.utilityRoleCounts,
    });

    const structuredErrorEvidence = extractStructuredErrorEvidence(
      result.exitCode,
      result.stderr,
    );
    const invalidationReason = this.computeInvalidationReason(
      result.exitCode,
      result.timedOut,
      telemetryEvents,
      telemetry,
      fairnessPins,
      structuredErrorEvidence,
      result.stderr,
    );
    const expectedEscalation = computeExpectedEscalation(task, condition);
    const predictedEscalation = computePredictedEscalation(telemetry);
    const excludedFromConfusion = deriveConfusionExclusion(
      telemetry.escalationEvents,
    );
    const advisorConsultOutcome = computeAdvisorConsultOutcome({
      expectedEscalation,
      escalationEvents: telemetry.escalationEvents,
    });
    const advisorFailureKind = computeAdvisorFailureKind(
      telemetry.escalationEvents,
    );
    const desiredOutcome = computeDesiredOutcome({
      benchmarkLane: task.benchmarkLane,
      invalidated: invalidationReason !== undefined,
      oraclePass,
      expectedEscalation,
      predictedEscalation,
      advisorConsultOutcome,
    });

    const record: RealBenchmarkRunRecord = {
      campaignId: this.manifest.campaignId,
      sampleId,
      taskId: task.id,
      conditionId: condition.id,
      sampleIndex,
      benchmarkLane: task.benchmarkLane,
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
      observedAdvisorCalls: Math.max(
        telemetry.advisorCalls,
        telemetry.advisorAttempts.length,
      ),
      observedEscalationAttempts: telemetry.escalationAttemptCount,
      polluxEscalationTelemetryCount: telemetry.escalationEvents.length,
      stdoutStatusTagCount,
      malformedStatusTagCount,
      nearMissStatusTagCount,
      stderrWorkspacePathViolationCount,
      toolErrorCount,
      advisorAttempts: telemetry.advisorAttempts,
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
      excludedFromConfusion,
      fairnessPins,
      oraclePass,
      invalidated: invalidationReason !== undefined,
      invalidationReason,
      structuredErrorEvidence,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      modelResponseCount: telemetry.responseIds.length,
      expectedEscalation,
      predictedEscalation,
      confusionOutcome: computeConfusionOutcome({
        expected: expectedEscalation,
        predicted: predictedEscalation,
        invalidated: invalidationReason !== undefined,
        excludedFromConfusion,
      }),
      desiredOutcomeSatisfied: desiredOutcome.satisfied,
      desiredOutcomeReasonCode: desiredOutcome.reasonCode,
      advisorConsultOutcome,
      advisorFailureKind,
      entrypointKind: entrypoint.kind,
      entrypointPath: entrypoint.path,
      buildFreshness,
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
    timedOut: boolean,
    telemetryEvents: ParsedTelemetryLog[],
    telemetry: RealBenchmarkTelemetrySummary,
    fairnessPins: RealBenchmarkRunRecord['fairnessPins'],
    structuredErrorEvidence: RealBenchmarkStructuredErrorEvidence | null,
    stderr: string,
  ): RealBenchmarkInvalidationReason | undefined {
    if (timedOut) {
      return 'run_timeout';
    }

    if (exitCode !== 0) {
      return classifyInvalidationFromEvidence(structuredErrorEvidence, stderr);
    }

    if (telemetry.responseIds.length > this.maxModelResponsesPerSample) {
      return 'model_call_ceiling_exceeded';
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
