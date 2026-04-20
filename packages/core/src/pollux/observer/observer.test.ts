/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '../../core/turn.js';
import {
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  mergePolluxExperimentalConfig,
} from '../types.js';
import {
  createLiveExecutorObserver,
  ingestPolluxObserverFailOpen,
  LIVE_EXECUTOR_OBSERVER_NO_OP,
} from './observer.js';

describe('pollux/observer', () => {
  it('I1: returns the shared no-op when Pollux experimental is disabled', () => {
    const obs = createLiveExecutorObserver(DEFAULT_POLLUX_EXPERIMENTAL_CONFIG);
    expect(obs).toBe(LIVE_EXECUTOR_OBSERVER_NO_OP);
    expect(createLiveExecutorObserver(DEFAULT_POLLUX_EXPERIMENTAL_CONFIG)).toBe(
      LIVE_EXECUTOR_OBSERVER_NO_OP,
    );
  });

  it('peekSameTurnIntent and consumePendingNextTurnIntent are undefined; ingest does not throw', () => {
    const obs = createLiveExecutorObserver(
      mergePolluxExperimentalConfig({ enabled: true }),
    );
    expect(obs.peekSameTurnIntent()).toBeUndefined();
    expect(obs.consumePendingNextTurnIntent()).toBeUndefined();
    const loopEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.LoopDetected,
    };
    expect(() => obs.ingest(loopEvent)).not.toThrow();
  });

  it('I3 / TG-11: ingestPolluxObserverFailOpen swallows observer ingest errors', () => {
    const throwing = {
      ingest(): void {
        throw new Error('synthetic sensor throw');
      },
    };
    const event: ServerGeminiStreamEvent = {
      type: GeminiEventType.LoopDetected,
    };
    expect(() => ingestPolluxObserverFailOpen(throwing, event)).not.toThrow();
  });
});
