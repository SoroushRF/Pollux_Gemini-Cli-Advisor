/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Scripted-trace calibration harness for the observer (Phase H).
 *
 * A calibration trace is a deterministic replay of `ServerGeminiStreamEvent`
 * events through the live observer (`createLiveExecutorObserver`). The harness
 * runs under a fake clock so decay and timing logic are stable in CI.
 *
 * This module is intentionally pure and side-effect free: it does not read
 * files, does not call models, and does not touch any external telemetry sinks.
 */

import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { type ServerGeminiStreamEvent } from '../../core/turn.js';
import type { GenerateContentResponseUsageMetadata } from '@google/genai';
import type { PolluxExperimentalConfig } from '../types.js';
import { DEFAULT_POLLUX_EXPERIMENTAL_CONFIG } from '../types.js';
import type { LoopDetectionPeekState } from '../../services/loopDetectionService.js';
import type { LoopType } from '../../telemetry/types.js';
import type { ThoughtSummary } from '../../utils/thoughtUtils.js';
import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../../scheduler/types.js';
import { createLiveExecutorObserver } from './observer.js';
import type { PolluxSensorSignalCategory } from './types.js';
import type { Sensor, SensorInput, ToolEventRecord } from './sensors/base.js';
import { NegativeSignalsSensor } from './sensors/negatives.js';
import { SelfReportSensor } from './sensors/selfReport.js';
import { LoopBridgeSensor } from './sensors/loopBridge.js';
import { RiskGateSensor } from './sensors/riskGate.js';
import { ThoughtSensor } from './sensors/thought.js';
import { ToolPatternSensor } from './sensors/toolPattern.js';

export type CalibrationStreamEvent =
  | { readonly type: 'thought'; readonly value: ThoughtSummary }
  | { readonly type: 'content'; readonly value: string }
  | { readonly type: 'tool_call_request'; readonly value: ToolCallRequestInfo }
  | {
      readonly type: 'tool_call_response';
      readonly value: ToolCallResponseInfo;
    }
  | {
      readonly type: 'finished';
      readonly value: {
        readonly reason?: string;
        readonly usageMetadata?: GenerateContentResponseUsageMetadata;
      };
    };

export interface CalibrationTraceEntry {
  readonly id: string;
  readonly category: 'true_positive' | 'true_negative' | 'boundary';
  readonly description: string;
  readonly userPrompt: string;
  readonly events: readonly ScriptedEvent[];
  readonly expected: {
    readonly escalate: boolean;
    readonly expectedSignalIds?: readonly string[];
  };
}

type LoopStateMutable = {
  loopDetected: boolean;
  lastLoopType?: LoopType;
  detail?: string;
  confirmedByModel?: string;
};

export type ScriptedEvent =
  | {
      readonly atMs: number;
      readonly kind: 'begin_turn';
      readonly userPromptText?: string;
    }
  | {
      readonly atMs: number;
      readonly kind: 'stream';
      readonly event: CalibrationStreamEvent;
    }
  | {
      readonly atMs: number;
      readonly kind: 'set_loop_state';
      readonly state: LoopStateMutable;
    }
  | {
      readonly atMs: number;
      readonly kind: 'note_advisor_success';
      readonly success: boolean;
    };

export interface TraceRunResult {
  readonly id: string;
  readonly escalated: boolean;
  readonly escalationTiming?: 'same_turn' | 'next_turn';
  readonly contributingSignalIds: readonly string[];
  readonly seenSignalIds: readonly string[];
  readonly seenSignalCategories: readonly PolluxSensorSignalCategory[];
}

export interface CorpusRunMetrics {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
  readonly tn: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly falsePositiveRateByCategory: Readonly<
    Record<'thought' | 'tool' | 'self', number>
  >;
  readonly meanContributingSignalCountOnEscalations: number;
}

export interface CorpusRunResult {
  readonly byTrace: ReadonlyArray<{
    readonly entry: CalibrationTraceEntry;
    readonly result: TraceRunResult;
  }>;
  readonly metrics: CorpusRunMetrics;
}

function withFakeNowMs<T>(nowMs: number, fn: () => T): T {
  const original = Date.now;

  Date.now = () => nowMs;
  try {
    return fn();
  } finally {
    Date.now = original;
  }
}

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function computeF1(precision: number, recall: number): number {
  return precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
}

function buildCalibrationExperimentalConfig(): PolluxExperimentalConfig {
  return {
    ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
    enabled: true,
    detector: {
      ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
      riskGate: {
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
        enabled: true,
      },
      observer: {
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
        enabled: true,
      },
      selfReport: {
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.selfReport,
        enabled: true,
      },
      // Keep fusion defaults, but ensure same-turn is permitted so emphatic
      // composite traces can validate same-turn behavior.
      timing: {
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
        sameTurnEnabled: true,
      },
    },
  };
}

function stableArgsHash(args: Record<string, unknown>): string {
  const stable = stableStringify(args) ?? JSON.stringify(args);
  return createHash('sha256').update(stable).digest('hex');
}

const READ_ONLY_TOOL_NAMES = new Set([
  'read_file',
  'read_many_files',
  'list_directory',
  'glob',
  'grep',
  'ripgrep',
  'search',
  'web_fetch',
  'get_file_info',
  'git_status',
  'git_log',
]);

const MUTATION_TOOL_NAMES = new Set([
  'write_file',
  'edit',
  'replace',
  'delete_file',
  'remove_file',
  'unlink_file',
  'rename_file',
  'move_file',
  'create_directory',
  'mkdir',
]);

const SHELL_READ_ONLY_RE =
  /^\s*(ls|pwd|cat|head|tail|grep|rg|find|git\s+(status|log|diff|show|branch)|npm\s+test|pnpm\s+test|yarn\s+test|node\s+--version|python\s+--version|echo)\b/i;
const SHELL_MUTATION_RE =
  /\b(rm|mv|cp|chmod|chown|git\s+push|npm\s+install|npm\s+ci|apply_patch|sed\s+-i|tee\s+.+>)\b/i;

function classifyToolCallMutability(
  toolName: string,
  args: Record<string, unknown>,
): { readOnly: boolean; mutation: boolean } {
  const normalized = toolName.trim().toLowerCase();
  if (MUTATION_TOOL_NAMES.has(normalized)) {
    return { readOnly: false, mutation: true };
  }
  if (READ_ONLY_TOOL_NAMES.has(normalized)) {
    return { readOnly: true, mutation: false };
  }
  if (normalized === 'run_shell_command') {
    const command = args['command'];
    if (typeof command === 'string' && command.trim().length > 0) {
      if (SHELL_MUTATION_RE.test(command)) {
        return { readOnly: false, mutation: true };
      }
      if (SHELL_READ_ONLY_RE.test(command)) {
        return { readOnly: true, mutation: false };
      }
    }
  }
  return { readOnly: false, mutation: false };
}

function parseExitCode(responseText: string): number | undefined {
  const match =
    /Exit Code:\s*(-?\d+)/i.exec(responseText) ??
    /exited with code:\s*(-?\d+)/i.exec(responseText);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function runCalibrationTrace(
  entry: CalibrationTraceEntry,
  options?: {
    readonly baseNowMs?: number;
    readonly experimentalOverride?: Partial<PolluxExperimentalConfig>;
  },
): TraceRunResult {
  const baseNowMs = options?.baseNowMs ?? 1_700_000_000_000;
  const loopState: LoopStateMutable = { loopDetected: false };
  const experimental: PolluxExperimentalConfig = {
    ...buildCalibrationExperimentalConfig(),
    ...(options?.experimentalOverride ?? {}),
  };

  const observer = createLiveExecutorObserver(experimental, {
    peekState: (): LoopDetectionPeekState => ({ ...loopState }),
  });

  // Mirror windows to collect all signals (including negatives), without
  // reaching into private observer state. Sensors are contractually pure.
  const sensors: Sensor[] = [];
  if (experimental.detector.riskGate.enabled) {
    sensors.push(new RiskGateSensor(experimental.detector.riskGate));
  }
  if (experimental.detector.selfReport.enabled) {
    sensors.push(new SelfReportSensor());
  }
  if (experimental.detector.observer.enabled) {
    sensors.push(
      new ThoughtSensor(),
      new ToolPatternSensor(),
      new NegativeSignalsSensor(),
    );
    sensors.push(
      new LoopBridgeSensor({
        peekState: (): LoopDetectionPeekState => ({ ...loopState }),
      }),
    );
  }

  let thoughtWindow: SensorInput['thoughtWindow'] = [];
  let toolEventWindow: ToolEventRecord[] = [];
  const pendingToolRequests = new Map<
    string,
    { name: string; argsHash: string; readOnly: boolean; mutation: boolean }
  >();
  let turnStartedAtMs = baseNowMs;
  let currentTurnTokenCount = 0;
  let currentTurnModelOutput = '';
  let turnToolCallCount = 0;
  let recentAdvisorSuccessWithinTurns = false;

  const seenSignalIds: string[] = [];
  const seenSignalCategories: PolluxSensorSignalCategory[] = [];
  const contributingSignalIds = new Set<string>();

  const sorted = [...entry.events].sort((a, b) => a.atMs - b.atMs);
  let escalated = false;
  let escalationTiming: 'same_turn' | 'next_turn' | undefined;

  for (const step of sorted) {
    const nowMs = baseNowMs + step.atMs;
    withFakeNowMs(nowMs, () => {
      switch (step.kind) {
        case 'begin_turn': {
          observer.beginTurn(step.userPromptText ?? entry.userPrompt);
          thoughtWindow = [];
          toolEventWindow = [];
          pendingToolRequests.clear();
          turnStartedAtMs = nowMs;
          currentTurnTokenCount = 0;
          currentTurnModelOutput = '';
          turnToolCallCount = 0;
          // Mirror a small rolling window: tests can explicitly toggle this via
          // `note_advisor_success` scripted steps.
          recentAdvisorSuccessWithinTurns = false;
          break;
        }
        case 'set_loop_state': {
          loopState.loopDetected = step.state.loopDetected;
          loopState.lastLoopType = step.state.lastLoopType;
          loopState.detail = step.state.detail;
          loopState.confirmedByModel = step.state.confirmedByModel;
          break;
        }
        case 'note_advisor_success': {
          observer.noteAdvisorSuccess(step.success);
          recentAdvisorSuccessWithinTurns =
            recentAdvisorSuccessWithinTurns || step.success;
          break;
        }
        case 'stream': {
          // This harness stores stream events as string-literal types to avoid
          // runtime coupling to enum exports in test mode. We cast exactly once
          // at the observer boundary.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const runtimeEvent = step.event as unknown as ServerGeminiStreamEvent;
          const streamEvent = step.event;
          // Update mirrored windows first (so sensors see the same view as the observer).
          switch (streamEvent.type) {
            case 'thought':
              thoughtWindow = [...thoughtWindow, streamEvent.value];
              break;
            case 'tool_call_request': {
              const request = streamEvent.value;
              const argsHash = stableArgsHash(request.args);
              const { readOnly, mutation } = classifyToolCallMutability(
                request.name,
                request.args,
              );
              turnToolCallCount++;
              pendingToolRequests.set(request.callId, {
                name: request.name,
                argsHash,
                readOnly,
                mutation,
              });
              toolEventWindow = [
                ...toolEventWindow,
                {
                  tsMs: nowMs,
                  callId: request.callId,
                  name: request.name,
                  argsHash,
                  readOnly,
                  mutation,
                  phase: 'request',
                  request,
                },
              ];
              break;
            }
            case 'tool_call_response': {
              const response = streamEvent.value;
              const previous = pendingToolRequests.get(response.callId);
              const name = previous?.name ?? 'unknown_tool';
              const argsHash = previous?.argsHash ?? stableArgsHash({});
              const responseText = response.responseParts
                .map((p: { text?: unknown }) =>
                  typeof p.text === 'string' ? p.text : '',
                )
                .join('\n');
              toolEventWindow = [
                ...toolEventWindow,
                {
                  tsMs: nowMs,
                  callId: response.callId,
                  name,
                  argsHash,
                  readOnly: previous?.readOnly ?? false,
                  mutation: previous?.mutation ?? false,
                  phase: 'response',
                  response,
                  exitCode: parseExitCode(responseText),
                  schemaError: response.errorType !== undefined,
                },
              ];
              break;
            }
            case 'content':
              currentTurnModelOutput += streamEvent.value;
              break;
            case 'finished': {
              const usageMetadata = streamEvent.value.usageMetadata;
              const explicitTotal = usageMetadata?.totalTokenCount;
              const estimatedTotal =
                (usageMetadata?.promptTokenCount ?? 0) +
                (usageMetadata?.candidatesTokenCount ?? 0);
              currentTurnTokenCount =
                explicitTotal ?? (estimatedTotal > 0 ? estimatedTotal : 0);
              break;
            }
            default:
              break;
          }

          const sensorInput: SensorInput = {
            event: runtimeEvent,
            turnElapsedMs: Math.max(0, nowMs - turnStartedAtMs),
            toolEventWindow,
            thoughtWindow,
            userPromptText: entry.userPrompt,
            currentTurnTokenCount,
            // Provide stable baselines so signals like `tool.token_burn` and
            // `thought.entropy_spike` can trigger deterministically.
            sessionMedianSuccessfulTurnTokens: 100,
            sessionMedianDistinctSubjectsPerMinute: 1,
            currentTurnModelOutput,
            recentAdvisorSuccessWithinTurns,
            turnToolCallCount,
          };

          for (const sensor of sensors) {
            try {
              const signals = sensor.observe(sensorInput);
              for (const s of signals) {
                seenSignalIds.push(s.id);
                seenSignalCategories.push(s.category);
              }
            } catch {
              // fail-open
            }
          }

          observer.ingest(runtimeEvent);
          // Mirror client integration: loop sensor runs after the loop check.
          observer.ingestAfterLoopCheck(runtimeEvent);

          const sameTurn = observer.peekSameTurnIntent();
          if (sameTurn) {
            escalated = true;
            escalationTiming = 'same_turn';
            sameTurn.contributingSignalIds.forEach((id) =>
              contributingSignalIds.add(id),
            );
            // Consume to mirror the real single-shot accounting.
            observer.consumeSameTurnIntent();
          }

          // Opportunistically record the active signal inventory by observing
          // intents' `contributingSignalIds`. This is the stable, public signal
          // attribution surface we expect Phase H users to care about.
          //
          // Note: we intentionally do not introspect private observer state.
          if (sameTurn?.contributingSignalIds) {
            seenSignalIds.push(...sameTurn.contributingSignalIds);
          }

          // Best-effort category extraction for FP-rate breakdown. This is
          // derived from signal id prefixes (stable across the plan docs).
          for (const id of [...(sameTurn?.contributingSignalIds ?? [])]) {
            if (id.startsWith('thought.')) seenSignalCategories.push('thought');
            else if (id.startsWith('tool.') || id.startsWith('neg.exit_zero'))
              seenSignalCategories.push('tool');
            else if (id.startsWith('self.')) seenSignalCategories.push('self');
          }

          break;
        }
        default: {
          const unreachable: never = step;
          return unreachable;
        }
      }
    });
  }

  const finalIntent = withFakeNowMs(
    baseNowMs + (sorted.at(-1)?.atMs ?? 0),
    () => observer.consumePendingNextTurnIntent(),
  );
  if (finalIntent) {
    escalated = true;
    if (!escalationTiming) {
      escalationTiming = 'next_turn';
    }
    finalIntent.contributingSignalIds.forEach((id) =>
      contributingSignalIds.add(id),
    );
    seenSignalIds.push(...finalIntent.contributingSignalIds);
    for (const id of finalIntent.contributingSignalIds) {
      if (id.startsWith('thought.')) seenSignalCategories.push('thought');
      else if (id.startsWith('tool.') || id.startsWith('neg.exit_zero'))
        seenSignalCategories.push('tool');
      else if (id.startsWith('self.')) seenSignalCategories.push('self');
    }
  }

  return {
    id: entry.id,
    escalated,
    escalationTiming,
    contributingSignalIds: [...contributingSignalIds],
    seenSignalIds,
    seenSignalCategories,
  };
}

export function runCalibrationCorpus(
  corpus: readonly CalibrationTraceEntry[],
): CorpusRunResult {
  const byTrace = corpus.map((entry) => ({
    entry,
    result: runCalibrationTrace(entry),
  }));

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  let fpThought = 0;
  let fpTool = 0;
  let fpSelf = 0;

  let contributingCountSum = 0;
  let escalationCount = 0;

  for (const { entry, result } of byTrace) {
    const expected = entry.expected.escalate;
    const actual = result.escalated;
    if (expected && actual) tp++;
    else if (!expected && actual) {
      fp++;
      if (result.seenSignalCategories.includes('thought')) fpThought++;
      if (result.seenSignalCategories.includes('tool')) fpTool++;
      if (result.seenSignalCategories.includes('self')) fpSelf++;
    } else if (expected && !actual) fn++;
    else tn++;

    if (actual) {
      escalationCount++;
      contributingCountSum += result.contributingSignalIds.length;
    }
  }

  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const f1 = computeF1(precision, recall);

  return {
    byTrace,
    metrics: {
      tp,
      fp,
      fn,
      tn,
      precision,
      recall,
      f1,
      falsePositiveRateByCategory: {
        thought: safeDiv(fpThought, Math.max(1, fp)),
        tool: safeDiv(fpTool, Math.max(1, fp)),
        self: safeDiv(fpSelf, Math.max(1, fp)),
      },
      meanContributingSignalCountOnEscalations: safeDiv(
        contributingCountSum,
        Math.max(1, escalationCount),
      ),
    },
  };
}

export function makeScriptedThought(
  atMs: number,
  subject: string,
  description: string,
): ScriptedEvent {
  return {
    atMs,
    kind: 'stream',
    event: {
      type: 'thought',
      value: { subject, description },
    },
  };
}

export function makeScriptedContent(atMs: number, text: string): ScriptedEvent {
  return {
    atMs,
    kind: 'stream',
    event: {
      type: 'content',
      value: text,
    },
  };
}

export { CALIBRATION_CORPUS, KNOWN_SIGNAL_IDS } from './calibrationCorpus.js';
