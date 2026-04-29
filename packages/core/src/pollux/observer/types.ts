/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Escalation intent types for the live executor observer
 * (`DETECTOR_IMPLEMENTATION_PLAN.md` §6.A.1 task 6).
 */

import type { ToolCallRequestInfo } from '../../scheduler/types.js';
import type { PolluxEscalationReasonCode } from '../types.js';
import type {
  PolluxSensorSignalCategory,
  SensorSignal,
} from './sensors/base.js';

/** Where a same-turn pause may occur relative to stream dispatch (§2a.4). */
export type PolluxObserverPauseBoundary = 'pre_tool' | 'post_event';

export type { PolluxSensorSignalCategory, SensorSignal };

/** Fields shared by same-turn and next-turn escalation intents. */
export interface BaseEscalationIntent {
  readonly reasonCode: PolluxEscalationReasonCode;
  readonly netScore: number;
  readonly contributingSignalIds: readonly string[];
  readonly contributingSignalAttributions?: readonly string[];
  readonly queuedAtMs: number;
}

/** Same-turn escalation: pause at a safe boundary, then invoke advisor. */
export interface SameTurnIntent extends BaseEscalationIntent {
  readonly timing: 'same_turn';
  readonly pauseBoundary: PolluxObserverPauseBoundary;
  /**
   * When `pauseBoundary` is `'pre_tool'`, the observer may carry the pending
   * tool request so the advisor can reason about the specific action being
   * gated.
   */
  readonly pendingTool?: ToolCallRequestInfo;
}

/** Next-turn escalation: intent consumed at the start of the following turn. */
export interface NextTurnIntent extends BaseEscalationIntent {
  readonly timing: 'next_turn';
}

export type EscalationIntent = SameTurnIntent | NextTurnIntent;
