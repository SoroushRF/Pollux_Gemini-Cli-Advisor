/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerGeminiStreamEvent } from '../../../core/turn.js';
import type { LoopDetectionService } from '../../../services/loopDetectionService.js';
import type {
  SensorInput,
  SensorSignal,
  PolluxObserverSensor,
} from './base.js';

/** Observer sensor id for the loop bridge (module slot). */
export const LOOP_BRIDGE_SENSOR_ID = 'sensor.loop_bridge' as const;

/**
 * Canonical hard-loop signal id (`DETECTOR_IMPLEMENTATION_PLAN.md` §C.2.2).
 * Precision prior 0.85 per §2a.3 trigger matrix (`HARD_LOOP`).
 */
export const LOOP_HARD_CONFIRMED_SIGNAL_ID = 'loop.hard_confirmed' as const;

/** Weight aligned with redesign fusion table (`DETECTOR_REDESIGN_BRAINSTORM.md` §2.1). */
export const LOOP_HARD_CONFIRMED_WEIGHT = 3;

export const LOOP_HARD_CONFIRMED_PRECISION_PRIOR = 0.85;

/**
 * Polls {@link LoopDetectionService.peekState} on each stream event and emits
 * `loop.hard_confirmed` once per confirmed-loop episode. While
 * `loopDetected` stays true, subsequent polls emit nothing; when
 * {@link LoopDetectionService.clearDetection} clears the flag, internal tracking
 * resets so a later loop can emit again.
 */
export class LoopBridgeSensor implements PolluxObserverSensor {
  readonly id = LOOP_BRIDGE_SENSOR_ID;

  /** True while the last peek saw `loopDetected === true`. */
  private sawLoopDetectedHigh = false;

  constructor(
    private readonly loopDetection: Pick<LoopDetectionService, 'peekState'>,
  ) {}

  observe(input: SensorInput): readonly SensorSignal[] {
    return this.onStreamEvent(input.event);
  }

  onStreamEvent(_event: ServerGeminiStreamEvent): readonly SensorSignal[] {
    try {
      const state = this.loopDetection.peekState();
      if (!state.loopDetected) {
        this.sawLoopDetectedHigh = false;
        return [];
      }
      if (this.sawLoopDetectedHigh) {
        return [];
      }
      this.sawLoopDetectedHigh = true;

      const tsMs = Date.now();
      return [
        {
          id: LOOP_HARD_CONFIRMED_SIGNAL_ID,
          weight: LOOP_HARD_CONFIRMED_WEIGHT,
          precisionPrior: LOOP_HARD_CONFIRMED_PRECISION_PRIOR,
          category: 'tool',
          hardPrecision: true,
          tsMs,
          attribution: state.detail ?? state.lastLoopType,
        },
      ];
    } catch {
      return [];
    }
  }

  /** For tests or a new executor turn when the same service instance is reused. */
  resetEdgeTracking(): void {
    this.sawLoopDetectedHigh = false;
  }
}

export function createLoopBridgeSensor(
  loopDetection: Pick<LoopDetectionService, 'peekState'>,
): PolluxObserverSensor {
  return new LoopBridgeSensor(loopDetection);
}
