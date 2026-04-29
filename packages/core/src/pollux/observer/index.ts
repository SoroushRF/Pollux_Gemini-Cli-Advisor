/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  buildPolluxHardLoopNextTurnIntent,
  createLiveExecutorObserver,
  ingestPolluxAfterLoopCheckFailOpen,
  ingestPolluxObserverFailOpen,
  LIVE_EXECUTOR_OBSERVER_NO_OP,
} from './observer.js';
export type { LiveExecutorObserver } from './observer.js';

export {
  checkPolluxEligibility,
  isPolluxRuntimeSurfaceSupported,
  type PolluxEligibilityResult,
} from './eligibility.js';

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
export {
  CALIBRATION_CORPUS,
  KNOWN_SIGNAL_IDS,
  runCalibrationCorpus,
  runCalibrationTrace,
} from './calibration.js';

export type { PolluxObserverSensor } from './sensors/base.js';

export { THOUGHT_SENSOR_ID } from './sensors/thought.js';
export { TOOL_PATTERN_SENSOR_ID } from './sensors/toolPattern.js';
export { SELF_REPORT_SENSOR_ID } from './sensors/selfReport.js';
export {
  ADVISOR_REQUEST_SENSOR_ID,
  SELF_ADVISOR_REQUEST_SIGNAL_ID,
} from './sensors/advisorRequest.js';
export { NEGATIVE_SENSOR_ID } from './sensors/negatives.js';
export {
  LOOP_BRIDGE_SENSOR_ID,
  LOOP_HARD_CONFIRMED_SIGNAL_ID,
  LOOP_HARD_CONFIRMED_PRECISION_PRIOR,
  LOOP_HARD_CONFIRMED_WEIGHT,
  createLoopBridgeSensor,
  LoopBridgeSensor,
} from './sensors/loopBridge.js';
export { RISK_GATE_SENSOR_ID } from './sensors/riskGate.js';
