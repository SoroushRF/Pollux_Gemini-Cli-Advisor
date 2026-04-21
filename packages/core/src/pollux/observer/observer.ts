/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '../../core/turn.js';
import type { LoopDetectionService } from '../../services/loopDetectionService.js';
import {
  PolluxEscalationReasonCode,
  type PolluxExperimentalConfig,
} from '../types.js';
import type { NextTurnIntent, SameTurnIntent } from './types.js';
import {
  classifyToolCallRisk,
  RISK_PRE_TOOL_HIGH_SIGNAL_ID,
  RISK_PRE_TOOL_HIGH_SIGNAL_PRECISION,
  RISK_PRE_TOOL_HIGH_SIGNAL_WEIGHT,
} from './sensors/riskGate.js';
import {
  LOOP_HARD_CONFIRMED_PRECISION_PRIOR,
  LOOP_HARD_CONFIRMED_SIGNAL_ID,
  LOOP_HARD_CONFIRMED_WEIGHT,
  LoopBridgeSensor,
} from './sensors/loopBridge.js';

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

function buildPolluxHardLoopSameTurnIntent(
  queuedAtMs: number = Date.now(),
): SameTurnIntent {
  return {
    timing: 'same_turn',
    reasonCode: PolluxEscalationReasonCode.HARD_LOOP,
    pauseBoundary: 'post_event',
    netScore: LOOP_HARD_CONFIRMED_WEIGHT * LOOP_HARD_CONFIRMED_PRECISION_PRIOR,
    contributingSignalIds: [LOOP_HARD_CONFIRMED_SIGNAL_ID],
    queuedAtMs,
  };
}

/** Live stream observer — ingestion and escalation intents (DETECTOR_IMPLEMENTATION_PLAN §3). */
export interface LiveExecutorObserver {
  beginTurn(): void;
  ingest(event: ServerGeminiStreamEvent): void;
  /**
   * Invoked after `LoopDetectionService.addAndCheck` on the same stream event
   * so `peekState()` reflects the detection outcome (Phase C loop bridge).
   */
  ingestAfterLoopCheck(event: ServerGeminiStreamEvent): void;
  peekSameTurnIntent(): SameTurnIntent | undefined;
  consumeSameTurnIntent(): SameTurnIntent | undefined;
  consumePendingNextTurnIntent(): NextTurnIntent | undefined;
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
};

class RiskGateLiveObserver implements LiveExecutorObserver {
  private pendingSameTurnIntent: SameTurnIntent | undefined;
  private pendingNextTurnIntent: NextTurnIntent | undefined;
  private sameTurnEscalationsThisTurn = 0;

  constructor(
    private readonly experimental: Readonly<PolluxExperimentalConfig>,
  ) {}

  beginTurn(): void {
    this.sameTurnEscalationsThisTurn = 0;
    this.pendingSameTurnIntent = undefined;
  }

  ingest(event: ServerGeminiStreamEvent): void {
    if (!this.experimental.detector.riskGate.enabled) {
      return;
    }
    if (event.type !== GeminiEventType.ToolCallRequest) {
      return;
    }

    const classification = classifyToolCallRisk(
      event.value,
      this.experimental.detector.riskGate,
    );
    if (classification.risk !== 'high') {
      return;
    }

    const queuedAtMs = Date.now();
    const baseIntent = {
      reasonCode: PolluxEscalationReasonCode.RISK_GATE_BLOCK,
      netScore:
        RISK_PRE_TOOL_HIGH_SIGNAL_WEIGHT * RISK_PRE_TOOL_HIGH_SIGNAL_PRECISION,
      contributingSignalIds: [RISK_PRE_TOOL_HIGH_SIGNAL_ID],
      queuedAtMs,
    } as const;

    const sameTurnAllowed =
      this.experimental.detector.timing.sameTurnEnabled &&
      this.sameTurnEscalationsThisTurn <
        this.experimental.detector.timing.maxSameTurnEscalationsPerTurn &&
      this.pendingSameTurnIntent === undefined;

    if (sameTurnAllowed) {
      this.pendingSameTurnIntent = {
        ...baseIntent,
        timing: 'same_turn',
        pauseBoundary: 'pre_tool',
        pendingTool: event.value,
      };
      return;
    }

    this.pendingNextTurnIntent = {
      ...baseIntent,
      timing: 'next_turn',
    };
  }

  ingestAfterLoopCheck(_event: ServerGeminiStreamEvent): void {}

  peekSameTurnIntent(): SameTurnIntent | undefined {
    return this.pendingSameTurnIntent;
  }

  consumeSameTurnIntent(): SameTurnIntent | undefined {
    const intent = this.pendingSameTurnIntent;
    this.pendingSameTurnIntent = undefined;
    if (intent) {
      this.sameTurnEscalationsThisTurn++;
    }
    return intent;
  }

  consumePendingNextTurnIntent(): NextTurnIntent | undefined {
    const intent = this.pendingNextTurnIntent;
    this.pendingNextTurnIntent = undefined;
    return intent;
  }
}

/**
 * LoopDetectionService bridge: `LoopBridgeSensor` + HARD_LOOP same-turn intent
 * (DETECTOR_IMPLEMENTATION_PLAN §C.2.2–C.2.3).
 */
class LoopHardLiveObserver implements LiveExecutorObserver {
  private readonly loopSensor: LoopBridgeSensor;
  private pendingSameTurnIntent: SameTurnIntent | undefined;
  private sameTurnEscalationsThisTurn = 0;

  constructor(
    private readonly experimental: Readonly<PolluxExperimentalConfig>,
    loopDetection: Pick<LoopDetectionService, 'peekState'>,
  ) {
    this.loopSensor = new LoopBridgeSensor(loopDetection);
  }

  beginTurn(): void {
    this.sameTurnEscalationsThisTurn = 0;
    this.pendingSameTurnIntent = undefined;
    this.loopSensor.resetEdgeTracking();
  }

  ingest(_event: ServerGeminiStreamEvent): void {}

  ingestAfterLoopCheck(event: ServerGeminiStreamEvent): void {
    if (!this.experimental.detector.observer.enabled) {
      return;
    }
    try {
      const signals = this.loopSensor.onStreamEvent(event);
      const hard = signals.find(
        (s) =>
          s.id === LOOP_HARD_CONFIRMED_SIGNAL_ID &&
          s.hardPrecision === true &&
          s.precisionPrior >= 0.85,
      );
      if (!hard) {
        return;
      }

      const sameTurnAllowed =
        this.experimental.detector.timing.sameTurnEnabled &&
        this.sameTurnEscalationsThisTurn <
          this.experimental.detector.timing.maxSameTurnEscalationsPerTurn &&
        this.pendingSameTurnIntent === undefined;

      if (sameTurnAllowed) {
        this.pendingSameTurnIntent = buildPolluxHardLoopSameTurnIntent(
          Date.now(),
        );
      }
    } catch {
      /* fail-open (I3) */
    }
  }

  peekSameTurnIntent(): SameTurnIntent | undefined {
    return this.pendingSameTurnIntent;
  }

  consumeSameTurnIntent(): SameTurnIntent | undefined {
    const intent = this.pendingSameTurnIntent;
    this.pendingSameTurnIntent = undefined;
    if (intent) {
      this.sameTurnEscalationsThisTurn++;
    }
    return intent;
  }

  consumePendingNextTurnIntent(): NextTurnIntent | undefined {
    return undefined;
  }
}

class CompositePolluxLiveObserver implements LiveExecutorObserver {
  constructor(
    private readonly risk: RiskGateLiveObserver,
    private readonly loop: LoopHardLiveObserver,
  ) {}

  beginTurn(): void {
    this.risk.beginTurn();
    this.loop.beginTurn();
  }

  ingest(event: ServerGeminiStreamEvent): void {
    this.risk.ingest(event);
  }

  ingestAfterLoopCheck(event: ServerGeminiStreamEvent): void {
    this.loop.ingestAfterLoopCheck(event);
  }

  peekSameTurnIntent(): SameTurnIntent | undefined {
    return this.risk.peekSameTurnIntent() ?? this.loop.peekSameTurnIntent();
  }

  consumeSameTurnIntent(): SameTurnIntent | undefined {
    if (this.risk.peekSameTurnIntent()) {
      return this.risk.consumeSameTurnIntent();
    }
    return this.loop.consumeSameTurnIntent();
  }

  consumePendingNextTurnIntent(): NextTurnIntent | undefined {
    return (
      this.risk.consumePendingNextTurnIntent() ??
      this.loop.consumePendingNextTurnIntent()
    );
  }
}

/**
 * Factory for the live executor observer (Phase B risk gate + Phase C loop
 * bridge).
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

  if (!riskOn && !observerOn) {
    return LIVE_EXECUTOR_OBSERVER_NO_OP;
  }

  if (riskOn && observerOn) {
    if (!loopDetection) {
      return LIVE_EXECUTOR_OBSERVER_NO_OP;
    }
    return new CompositePolluxLiveObserver(
      new RiskGateLiveObserver(experimental),
      new LoopHardLiveObserver(experimental, loopDetection),
    );
  }

  if (riskOn) {
    return new RiskGateLiveObserver(experimental);
  }

  if (!loopDetection) {
    return LIVE_EXECUTOR_OBSERVER_NO_OP;
  }
  return new LoopHardLiveObserver(experimental, loopDetection);
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
