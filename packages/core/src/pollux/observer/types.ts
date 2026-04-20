/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PolluxEscalationReasonCode } from '../types.js';
import type { ToolCallRequestInfo } from '../../scheduler/types.js';

/**
 * Fusion input from a single sensor activation (Phase D).
 * Stub shape for Phase A skeleton wiring.
 */
export interface SensorSignal {
  readonly signalId: string;
  readonly weight: number;
  readonly hardPrecision?: boolean;
  readonly precisionPrior?: number;
}

export interface BaseEscalationIntent {
  readonly reasonCode: PolluxEscalationReasonCode;
  readonly netScore: number;
  readonly contributingSignalIds: readonly string[];
  readonly queuedAtMs: number;
}

export interface SameTurnIntent extends BaseEscalationIntent {
  readonly timing: 'same_turn';
  readonly pauseBoundary: 'pre_tool' | 'post_event';
  readonly pendingTool?: ToolCallRequestInfo;
}

export interface NextTurnIntent extends BaseEscalationIntent {
  readonly timing: 'next_turn';
}

export type EscalationIntent = SameTurnIntent | NextTurnIntent;
