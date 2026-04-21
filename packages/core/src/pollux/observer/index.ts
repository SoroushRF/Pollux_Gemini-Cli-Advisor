/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  createLiveExecutorObserver,
  ingestPolluxObserverFailOpen,
  LIVE_EXECUTOR_OBSERVER_NO_OP,
} from './observer.js';
export type { LiveExecutorObserver } from './observer.js';

export type {
  BaseEscalationIntent,
  EscalationIntent,
  NextTurnIntent,
  PolluxObserverPauseBoundary,
  PolluxSensorSignalCategory,
  SameTurnIntent,
  SensorSignal,
} from './types.js';

export { FusionLayer } from './fusion.js';
export { OBSERVER_CALIBRATION_STUB } from './calibration.js';

export type { PolluxObserverSensor } from './sensors/base.js';

export { THOUGHT_SENSOR_ID } from './sensors/thought.js';
export { TOOL_PATTERN_SENSOR_ID } from './sensors/toolPattern.js';
export { SELF_REPORT_SENSOR_ID } from './sensors/selfReport.js';
export { LOOP_BRIDGE_SENSOR_ID } from './sensors/loopBridge.js';
export { RISK_GATE_SENSOR_ID } from './sensors/riskGate.js';
