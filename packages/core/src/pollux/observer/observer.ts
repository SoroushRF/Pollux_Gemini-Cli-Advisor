/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '../../core/turn.js';
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

/** Live stream observer — ingestion and escalation intents (DETECTOR_IMPLEMENTATION_PLAN §3). */
export interface LiveExecutorObserver {
  beginTurn(): void;
  ingest(event: ServerGeminiStreamEvent): void;
  peekSameTurnIntent(): SameTurnIntent | undefined;
  consumeSameTurnIntent(): SameTurnIntent | undefined;
  consumePendingNextTurnIntent(): NextTurnIntent | undefined;
}

/**
 * Shared no-op observer (I1: no per-call allocations when Pollux is disabled or
 * `experimental.pollux.detector.observer.enabled` is false).
 * Also returned while Pollux and the observer flag are on but the real observer
 * is not yet wired (Phases A–C).
 */
export const LIVE_EXECUTOR_OBSERVER_NO_OP: LiveExecutorObserver = {
  beginTurn(): void {},
  ingest(): void {},
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
 * Factory for the live executor observer. Phases A–C return
 * {@link LIVE_EXECUTOR_OBSERVER_NO_OP}.
 *
 * Returns the shared singleton (no allocation) when Pollux is off, when the
 * live observer subsystem is off, or until a real implementation is registered
 * (Phase D+).
 */
export function createLiveExecutorObserver(
  experimental: Readonly<PolluxExperimentalConfig>,
): LiveExecutorObserver {
  if (!experimental.enabled || !experimental.detector.riskGate.enabled) {
    return LIVE_EXECUTOR_OBSERVER_NO_OP;
  }
  return new RiskGateLiveObserver(experimental);
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
