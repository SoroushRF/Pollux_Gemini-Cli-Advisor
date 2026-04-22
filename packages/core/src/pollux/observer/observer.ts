/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '../../core/turn.js';
import type { LoopDetectionService } from '../../services/loopDetectionService.js';
import { partToString } from '../../utils/partUtils.js';
import {
  POLLUX_ESCALATION_TIMING,
  PolluxEscalationReasonCode,
  type PolluxEscalationReasonCode as PolluxEscalationReasonCodeValue,
  type PolluxExperimentalConfig,
} from '../types.js';
import { FusionLayer } from './fusion.js';
import { NegativeSignalsSensor } from './sensors/negatives.js';
import { SelfReportSensor } from './sensors/selfReport.js';
import {
  type Sensor,
  type SensorInput,
  type SensorSignal,
  type ToolEventRecord,
} from './sensors/base.js';
import {
  LOOP_HARD_CONFIRMED_PRECISION_PRIOR,
  LOOP_HARD_CONFIRMED_SIGNAL_ID,
  LOOP_HARD_CONFIRMED_WEIGHT,
  LoopBridgeSensor,
} from './sensors/loopBridge.js';
import {
  RiskGateSensor,
  RISK_PRE_TOOL_HIGH_SIGNAL_ID,
} from './sensors/riskGate.js';
import { ThoughtSensor } from './sensors/thought.js';
import { ToolPatternSensor } from './sensors/toolPattern.js';
import type { NextTurnIntent, SameTurnIntent } from './types.js';

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

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function stableArgsHash(args: Record<string, unknown>): string {
  const stable = stableStringify(args) ?? JSON.stringify(args);
  return createHash('sha256').update(stable).digest('hex');
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

function hardPrecisionReasonForSignal(
  signalId: string,
): PolluxEscalationReasonCodeValue | undefined {
  if (signalId === RISK_PRE_TOOL_HIGH_SIGNAL_ID) {
    return PolluxEscalationReasonCode.RISK_GATE_BLOCK;
  }
  if (signalId === LOOP_HARD_CONFIRMED_SIGNAL_ID) {
    return PolluxEscalationReasonCode.HARD_LOOP;
  }
  if (signalId === 'self.structured_status_stuck') {
    return PolluxEscalationReasonCode.SELF_REPORT_STUCK;
  }
  return undefined;
}

/** Same netScore / ids as {@link LoopBridgeSensor} hard-loop signal (DETECTOR_IMPLEMENTATION_PLAN §C.2). */
export function buildPolluxHardLoopNextTurnIntent(
  queuedAtMs: number = Date.now(),
): NextTurnIntent {
  return {
    timing: 'next_turn',
    reasonCode: PolluxEscalationReasonCode.HARD_LOOP,
    netScore: LOOP_HARD_CONFIRMED_WEIGHT * LOOP_HARD_CONFIRMED_PRECISION_PRIOR,
    contributingSignalIds: [LOOP_HARD_CONFIRMED_SIGNAL_ID],
    queuedAtMs,
  };
}

/** Live stream observer - ingestion and escalation intents (DETECTOR_IMPLEMENTATION_PLAN §3). */
export interface LiveExecutorObserver {
  beginTurn(userPromptText?: string): void;
  ingest(event: ServerGeminiStreamEvent): void;
  /**
   * Invoked after `LoopDetectionService.addAndCheck` on the same stream event
   * so `peekState()` reflects the detection outcome (Phase C loop bridge).
   */
  ingestAfterLoopCheck(event: ServerGeminiStreamEvent): void;
  peekSameTurnIntent(): SameTurnIntent | undefined;
  consumeSameTurnIntent(): SameTurnIntent | undefined;
  consumePendingNextTurnIntent(): NextTurnIntent | undefined;
  noteAdvisorSuccess(success: boolean): void;
}

/**
 * Shared no-op observer (I1: no per-call allocations when Pollux is disabled or
 * both detector risk gate and observer subsystems are off).
 */
export const LIVE_EXECUTOR_OBSERVER_NO_OP: LiveExecutorObserver = {
  beginTurn(): void {},
  ingest(): void {},
  ingestAfterLoopCheck(): void {},
  peekSameTurnIntent(): undefined {
    return undefined;
  },
  consumeSameTurnIntent(): undefined {
    return undefined;
  },
  consumePendingNextTurnIntent(): undefined {
    return undefined;
  },
  noteAdvisorSuccess(): void {},
};

class PolluxLiveExecutorObserver implements LiveExecutorObserver {
  private readonly streamSensors: Sensor[];
  private readonly loopSensor: LoopBridgeSensor | undefined;
  private readonly fusionLayer = new FusionLayer();
  private pendingSameTurnIntent: SameTurnIntent | undefined;
  private pendingNextTurnIntent: NextTurnIntent | undefined;
  private readonly sameTurnEscalationsByReason = new Map<
    PolluxEscalationReasonCodeValue,
    number
  >();
  private thoughtWindow: {
    entries: SensorInput['thoughtWindow'];
    chars: number;
  } = {
    entries: [],
    chars: 0,
  };
  private toolEventWindow: ToolEventRecord[] = [];
  private readonly pendingToolRequests = new Map<
    string,
    { name: string; argsHash: string; readOnly: boolean; mutation: boolean }
  >();
  private activeSignals = new Map<string, SensorSignal>();
  private turnStartedAtMs = Date.now();
  private userPromptText = '';
  private currentTurnTokenCount = 0;
  private currentTurnModelOutput = '';
  private currentTurnToolCallCount = 0;
  private currentTurnAdvisorSuccess = false;
  private fusionEscalatedThisTurn = false;
  private readonly successfulTurnTokenHistory: number[] = [];
  private readonly distinctSubjectRateHistory: number[] = [];
  private readonly advisorSuccessByTurn: boolean[] = [];

  constructor(
    private readonly experimental: Readonly<PolluxExperimentalConfig>,
    loopDetection?: Pick<LoopDetectionService, 'peekState'>,
  ) {
    this.streamSensors = [];
    if (this.experimental.detector.riskGate.enabled) {
      this.streamSensors.push(
        new RiskGateSensor(this.experimental.detector.riskGate),
      );
    }
    if (this.experimental.detector.selfReport.enabled) {
      this.streamSensors.push(new SelfReportSensor());
    }
    if (this.experimental.detector.observer.enabled) {
      this.streamSensors.push(
        new ThoughtSensor(),
        new ToolPatternSensor(),
        new NegativeSignalsSensor(),
      );
      if (loopDetection) {
        this.loopSensor = new LoopBridgeSensor(loopDetection);
      }
    }
  }

  beginTurn(userPromptText = ''): void {
    this.pendingSameTurnIntent = undefined;
    this.sameTurnEscalationsByReason.clear();
    this.thoughtWindow = { entries: [], chars: 0 };
    this.toolEventWindow = [];
    this.pendingToolRequests.clear();
    this.activeSignals.clear();
    this.turnStartedAtMs = Date.now();
    this.userPromptText = userPromptText;
    this.currentTurnTokenCount = 0;
    this.currentTurnModelOutput = '';
    this.currentTurnToolCallCount = 0;
    this.currentTurnAdvisorSuccess = false;
    this.fusionEscalatedThisTurn = false;
    this.loopSensor?.resetEdgeTracking();
  }

  ingest(event: ServerGeminiStreamEvent): void {
    this.updateObserverWindows(event);
    if (this.streamSensors.length === 0) {
      return;
    }
    const input = this.buildSensorInput(event);
    const newSignals = this.collectSignals(this.streamSensors, input);
    this.recordSignals(newSignals);
    this.maybeQueueHardPrecisionSignals(newSignals, event);
    this.evaluateFusion(event);
    if (event.type === GeminiEventType.Finished) {
      this.recordCompletedTurn();
    }
  }

  ingestAfterLoopCheck(event: ServerGeminiStreamEvent): void {
    if (!this.loopSensor) {
      return;
    }
    const newSignals = this.collectSignals(
      this.loopSensor,
      this.buildSensorInput(event),
    );
    this.recordSignals(newSignals);
    this.maybeQueueHardPrecisionSignals(newSignals, event);
    this.evaluateFusion(event);
  }

  peekSameTurnIntent(): SameTurnIntent | undefined {
    return this.pendingSameTurnIntent;
  }

  consumeSameTurnIntent(): SameTurnIntent | undefined {
    const intent = this.pendingSameTurnIntent;
    this.pendingSameTurnIntent = undefined;
    if (intent) {
      const count =
        this.sameTurnEscalationsByReason.get(intent.reasonCode) ?? 0;
      this.sameTurnEscalationsByReason.set(intent.reasonCode, count + 1);
    }
    return intent;
  }

  consumePendingNextTurnIntent(): NextTurnIntent | undefined {
    const intent = this.pendingNextTurnIntent;
    this.pendingNextTurnIntent = undefined;
    return intent;
  }

  noteAdvisorSuccess(success: boolean): void {
    this.currentTurnAdvisorSuccess = this.currentTurnAdvisorSuccess || success;
  }

  private buildSensorInput(event: ServerGeminiStreamEvent): SensorInput {
    return {
      event,
      turnElapsedMs: Math.max(0, Date.now() - this.turnStartedAtMs),
      toolEventWindow: this.toolEventWindow,
      thoughtWindow: this.thoughtWindow.entries,
      userPromptText: this.userPromptText,
      currentTurnTokenCount: this.currentTurnTokenCount,
      sessionMedianSuccessfulTurnTokens: median(
        this.successfulTurnTokenHistory,
      ),
      sessionMedianDistinctSubjectsPerMinute: median(
        this.distinctSubjectRateHistory,
      ),
      currentTurnModelOutput: this.currentTurnModelOutput,
      recentAdvisorSuccessWithinTurns: this.advisorSuccessByTurn
        .slice(-3)
        .some(Boolean),
      turnToolCallCount: this.currentTurnToolCallCount,
    };
  }

  private updateObserverWindows(event: ServerGeminiStreamEvent): void {
    switch (event.type) {
      case GeminiEventType.Thought: {
        const entry = event.value;
        const entryChars =
          entry.subject.trim().length + entry.description.trim().length;
        this.thoughtWindow.entries = [...this.thoughtWindow.entries, entry];
        this.thoughtWindow.chars += entryChars;
        const maxChars =
          this.experimental.detector.observer.maxThoughtWindowChars;
        while (
          this.thoughtWindow.entries.length > 0 &&
          this.thoughtWindow.chars > maxChars
        ) {
          const removed = this.thoughtWindow.entries[0];
          this.thoughtWindow.entries = this.thoughtWindow.entries.slice(1);
          this.thoughtWindow.chars -=
            removed.subject.trim().length + removed.description.trim().length;
        }
        break;
      }
      case GeminiEventType.ToolCallRequest: {
        const argsHash = stableArgsHash(event.value.args);
        const { readOnly, mutation } = classifyToolCallMutability(
          event.value.name,
          event.value.args,
        );
        this.currentTurnToolCallCount++;
        this.pendingToolRequests.set(event.value.callId, {
          name: event.value.name,
          argsHash,
          readOnly,
          mutation,
        });
        this.pushToolEvent({
          tsMs: Date.now(),
          callId: event.value.callId,
          name: event.value.name,
          argsHash,
          readOnly,
          mutation,
          phase: 'request',
          request: event.value,
        });
        break;
      }
      case GeminiEventType.ToolCallResponse: {
        const previous = this.pendingToolRequests.get(event.value.callId);
        const name = previous?.name ?? 'unknown_tool';
        const argsHash = previous?.argsHash ?? stableArgsHash({});
        const responseText = partToString(event.value.responseParts);
        const exitCode = parseExitCode(responseText);
        const schemaError = event.value.errorType !== undefined;
        this.pushToolEvent({
          tsMs: Date.now(),
          callId: event.value.callId,
          name,
          argsHash,
          readOnly: previous?.readOnly ?? false,
          mutation: previous?.mutation ?? false,
          phase: 'response',
          response: event.value,
          exitCode,
          schemaError,
        });
        break;
      }
      case GeminiEventType.Content: {
        this.currentTurnModelOutput =
          `${this.currentTurnModelOutput}\n${event.value}`.trim();
        break;
      }
      case GeminiEventType.Finished: {
        const usageMetadata = event.value.usageMetadata;
        const explicitTotal = usageMetadata?.totalTokenCount;
        const estimatedTotal =
          (usageMetadata?.promptTokenCount ?? 0) +
          (usageMetadata?.candidatesTokenCount ?? 0);
        this.currentTurnTokenCount =
          explicitTotal ?? (estimatedTotal > 0 ? estimatedTotal : 0);
        break;
      }
      default:
        break;
    }
  }

  private pushToolEvent(entry: ToolEventRecord): void {
    this.toolEventWindow = [...this.toolEventWindow, entry];
    const maxWindow = this.experimental.detector.observer.maxToolEventWindow;
    if (this.toolEventWindow.length > maxWindow) {
      this.toolEventWindow = this.toolEventWindow.slice(
        this.toolEventWindow.length - maxWindow,
      );
    }
  }

  private collectSignals(
    sensors: readonly Sensor[] | Sensor,
    input: SensorInput,
  ): SensorSignal[] {
    const out: SensorSignal[] = [];
    const sensorList = Array.isArray(sensors) ? sensors : [sensors];
    for (const sensor of sensorList) {
      try {
        out.push(...sensor.observe(input));
      } catch {
        // fail-open (I3)
      }
    }
    return out;
  }

  private recordSignals(signals: readonly SensorSignal[]): void {
    for (const signal of signals) {
      this.activeSignals.set(signal.id, signal);
    }
  }

  private maybeQueueHardPrecisionSignals(
    signals: readonly SensorSignal[],
    event: ServerGeminiStreamEvent,
  ): void {
    for (const signal of signals) {
      if (
        !(
          signal.hardPrecision &&
          signal.weight > 0 &&
          signal.precisionPrior >= 0.85
        )
      ) {
        continue;
      }
      const reasonCode = hardPrecisionReasonForSignal(signal.id);
      if (!reasonCode) {
        continue;
      }
      this.queueIntent({
        reasonCode,
        netScore: signal.weight * signal.precisionPrior,
        contributingSignalIds: [signal.id],
        preferSameTurn: true,
        pauseBoundary:
          event.type === GeminiEventType.ToolCallRequest &&
          reasonCode === PolluxEscalationReasonCode.RISK_GATE_BLOCK
            ? 'pre_tool'
            : 'post_event',
        pendingTool:
          event.type === GeminiEventType.ToolCallRequest &&
          reasonCode === PolluxEscalationReasonCode.RISK_GATE_BLOCK
            ? event.value
            : undefined,
      });
    }
  }

  private evaluateFusion(event: ServerGeminiStreamEvent): void {
    if (!this.experimental.detector.observer.enabled) {
      return;
    }
    const output = this.fusionLayer.evaluate({
      signals: [...this.activeSignals.values()],
      config: {
        decayHalfLifeMs: this.experimental.detector.observer.decayHalfLifeMs,
        targetEscalationRate:
          this.experimental.detector.fusion.targetEscalationRate,
        requireComposite: this.experimental.detector.fusion.requireComposite,
        lowPrecisionFloor: this.experimental.detector.fusion.lowPrecisionFloor,
        sameTurnThresholdMultiplier:
          this.experimental.detector.fusion.sameTurnThresholdMultiplier,
        sameTurnAbsoluteFloor:
          this.experimental.detector.fusion.sameTurnAbsoluteFloor,
        minAbsoluteThreshold: 1,
        maxAbsoluteThreshold: 10,
      },
      nowMs: Date.now(),
    });

    const hardPrecisionReasonCodes = new Set<PolluxEscalationReasonCodeValue>([
      PolluxEscalationReasonCode.RISK_GATE_BLOCK,
      PolluxEscalationReasonCode.HARD_LOOP,
      PolluxEscalationReasonCode.SELF_REPORT_STUCK,
    ]);
    if (output.escalate && !hardPrecisionReasonCodes.has(output.reasonCode)) {
      if (!this.fusionEscalatedThisTurn) {
        const sameTurnPreferred =
          output.reasonCode ===
          PolluxEscalationReasonCode.FUSION_COMPOSITE_EMPHATIC;
        this.queueIntent({
          reasonCode: output.reasonCode,
          netScore: output.netScore,
          contributingSignalIds: output.contributingSignalIds,
          preferSameTurn: sameTurnPreferred,
          pauseBoundary: sameTurnPreferred ? 'post_event' : undefined,
        });
        this.fusionEscalatedThisTurn = true;
      }
    }

    if (event.type === GeminiEventType.Finished) {
      this.fusionLayer.recordCompletedTurn(output.netScore);
    }
  }

  private queueIntent(params: {
    reasonCode: PolluxEscalationReasonCodeValue;
    netScore: number;
    contributingSignalIds: readonly string[];
    preferSameTurn: boolean;
    pauseBoundary?: 'pre_tool' | 'post_event';
    pendingTool?: SameTurnIntent['pendingTool'];
  }): void {
    const queuedAtMs = Date.now();
    const sameTurnAllowed =
      params.preferSameTurn &&
      this.experimental.detector.timing.sameTurnEnabled &&
      (this.sameTurnEscalationsByReason.get(params.reasonCode) ?? 0) <
        this.experimental.detector.timing.maxSameTurnEscalationsPerTurn &&
      this.pendingSameTurnIntent === undefined;
    if (sameTurnAllowed && params.pauseBoundary) {
      this.pendingSameTurnIntent = {
        timing: 'same_turn',
        reasonCode: params.reasonCode,
        pauseBoundary: params.pauseBoundary,
        pendingTool: params.pendingTool,
        netScore: params.netScore,
        contributingSignalIds: params.contributingSignalIds,
        queuedAtMs,
      };
      return;
    }

    const timing = POLLUX_ESCALATION_TIMING[params.reasonCode];
    const nextTurnIntent: NextTurnIntent = {
      timing: 'next_turn',
      reasonCode: params.reasonCode,
      netScore: params.netScore,
      contributingSignalIds: params.contributingSignalIds,
      queuedAtMs,
    };
    if (
      this.pendingNextTurnIntent === undefined ||
      nextTurnIntent.netScore >= this.pendingNextTurnIntent.netScore ||
      timing === 'same_turn'
    ) {
      this.pendingNextTurnIntent = nextTurnIntent;
    }
  }

  private recordCompletedTurn(): void {
    if (this.currentTurnTokenCount > 0) {
      this.successfulTurnTokenHistory.push(this.currentTurnTokenCount);
      if (this.successfulTurnTokenHistory.length > 200) {
        this.successfulTurnTokenHistory.splice(
          0,
          this.successfulTurnTokenHistory.length - 200,
        );
      }
    }
    const distinctSubjects = new Set(
      this.thoughtWindow.entries
        .map((entry) => entry.subject.toLowerCase().trim())
        .filter((subject) => subject.length > 0),
    ).size;
    const elapsedMinutes = Math.max(
      1,
      (Date.now() - this.turnStartedAtMs) / 60_000,
    );
    if (distinctSubjects > 0) {
      this.distinctSubjectRateHistory.push(distinctSubjects / elapsedMinutes);
      if (this.distinctSubjectRateHistory.length > 200) {
        this.distinctSubjectRateHistory.splice(
          0,
          this.distinctSubjectRateHistory.length - 200,
        );
      }
    }
    this.advisorSuccessByTurn.push(this.currentTurnAdvisorSuccess);
    if (this.advisorSuccessByTurn.length > 20) {
      this.advisorSuccessByTurn.splice(
        0,
        this.advisorSuccessByTurn.length - 20,
      );
    }
  }
}

/**
 * Factory for the live executor observer (Phase B risk gate + Phase C loop
 * bridge + Phase D fusion/sensors).
 */
export function createLiveExecutorObserver(
  experimental: Readonly<PolluxExperimentalConfig>,
  loopDetection?: Pick<LoopDetectionService, 'peekState'>,
): LiveExecutorObserver {
  if (!experimental.enabled) {
    return LIVE_EXECUTOR_OBSERVER_NO_OP;
  }
  const riskOn = experimental.detector.riskGate.enabled;
  const observerOn = experimental.detector.observer.enabled;
  const selfReportOn = experimental.detector.selfReport.enabled;
  if (!riskOn && !observerOn && !selfReportOn) {
    return LIVE_EXECUTOR_OBSERVER_NO_OP;
  }
  return new PolluxLiveExecutorObserver(experimental, loopDetection);
}

/**
 * Invokes {@link LiveExecutorObserver.ingest} inside a try/catch (invariant I3,
 * TG-11). Call sites that pump stream events into the observer MUST use this
 * (or equivalent) so sensor errors never abort the executor turn.
 */
export function ingestPolluxObserverFailOpen(
  observer: Pick<LiveExecutorObserver, 'ingest'>,
  event: ServerGeminiStreamEvent,
): void {
  try {
    observer.ingest(event);
  } catch {
    /* fail-open */
  }
}

export function ingestPolluxAfterLoopCheckFailOpen(
  observer: Pick<LiveExecutorObserver, 'ingestAfterLoopCheck'>,
  event: ServerGeminiStreamEvent,
): void {
  try {
    observer.ingestAfterLoopCheck(event);
  } catch {
    /* fail-open */
  }
}
