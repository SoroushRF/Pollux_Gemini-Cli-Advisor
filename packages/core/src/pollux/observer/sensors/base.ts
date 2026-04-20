/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerGeminiStreamEvent } from '../../../core/turn.js';
import type { SensorSignal } from '../types.js';

/** Observer sensor contract (DETECTOR_IMPLEMENTATION_PLAN §3.2). */
export interface PolluxObserverSensor {
  readonly id: string;
  onStreamEvent(event: ServerGeminiStreamEvent): readonly SensorSignal[];
}
