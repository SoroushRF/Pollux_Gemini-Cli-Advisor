/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerGeminiStreamEvent } from '../../core/turn.js';
import type { PolluxExperimentalConfig } from '../types.js';
import type { NextTurnIntent, SameTurnIntent } from './types.js';

/** Live stream observer — ingestion and escalation intents (DETECTOR_IMPLEMENTATION_PLAN §3). */
export interface LiveExecutorObserver {
  ingest(event: ServerGeminiStreamEvent): void;
  peekSameTurnIntent(): SameTurnIntent | undefined;
  consumePendingNextTurnIntent(): NextTurnIntent | undefined;
}

/**
 * Shared no-op observer (I1: no per-call allocations when Pollux is disabled).
 * Also returned while Pollux is on but observer phases are not yet wired.
 */
export const LIVE_EXECUTOR_OBSERVER_NO_OP: LiveExecutorObserver = {
  ingest(): void {},
  peekSameTurnIntent(): undefined {
    return undefined;
  },
  consumePendingNextTurnIntent(): undefined {
    return undefined;
  },
};

/**
 * Factory for the live executor observer. Phase A returns {@link LIVE_EXECUTOR_OBSERVER_NO_OP}.
 * When `experimental.enabled` is false, returns the shared no-op without allocating.
 */
export function createLiveExecutorObserver(
  experimental: Readonly<PolluxExperimentalConfig>,
): LiveExecutorObserver {
  if (!experimental.enabled) {
    return LIVE_EXECUTOR_OBSERVER_NO_OP;
  }
  return LIVE_EXECUTOR_OBSERVER_NO_OP;
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
