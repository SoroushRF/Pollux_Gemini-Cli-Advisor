/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerGeminiStreamEvent } from '../../../core/turn.js';
import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../../../scheduler/types.js';
import type { ThoughtSummary } from '../../../utils/thoughtUtils.js';
import type { PolluxExecutorCheckpointConfig } from '../../types.js';

/** Sensor taxonomy for composite-evidence gates (DETECTOR_IMPLEMENTATION_PLAN §D.2). */
export type PolluxSensorSignalCategory =
  | 'thought'
  | 'tool'
  | 'self'
  | 'longitudinal'
  | 'risk';

export interface ToolEventRecord {
  readonly tsMs: number;
  readonly callId?: string;
  readonly name: string;
  readonly argsHash: string;
  readonly readOnly: boolean;
  readonly mutation: boolean;
  readonly phase: 'request' | 'response';
  readonly request?: ToolCallRequestInfo;
  readonly response?: ToolCallResponseInfo;
  readonly exitCode?: number;
  readonly schemaError?: boolean;
}

export interface PromptConstraintSummary {
  readonly mutationProtectedPaths: readonly string[];
  readonly behaviorAnchorPaths: readonly string[];
  readonly sourceOfTruthPaths: readonly string[];
  readonly referencedPaths: readonly string[];
  readonly hasProtectedTestsOrDocs: boolean;
  readonly hasPublicInterfaceConstraint: boolean;
  readonly hasBehaviorPreservationConstraint: boolean;
  readonly hasCrossFileRepairConstraint: boolean;
  readonly hasCompatibilityAliasConstraint: boolean;
  readonly hasNegativeSpaceConstraint: boolean;
  readonly hasExplicitCompletenessConstraint: boolean;
  readonly hasStateMachineConstraint: boolean;
  readonly hasTerminalStateConstraint: boolean;
  readonly hasStructuredMapConstraint: boolean;
  readonly hasForbiddenBehaviorConstraint: boolean;
}

/**
 * Canonical sensor input contract from Phase D §D.2.
 * Additional optional fields are observer-owned, derived context used by
 * specific sensors while preserving pure sensor behavior.
 */
export interface SensorInput {
  readonly event: ServerGeminiStreamEvent;
  readonly turnElapsedMs: number;
  readonly toolEventWindow: readonly ToolEventRecord[];
  readonly thoughtWindow: readonly ThoughtSummary[];
  readonly userPromptText?: string;
  readonly promptConstraintSummary?: PromptConstraintSummary;
  readonly currentTurnTokenCount?: number;
  readonly sessionMedianSuccessfulTurnTokens?: number;
  readonly sessionMedianDistinctSubjectsPerMinute?: number;
  readonly currentTurnModelOutput?: string;
  readonly currentTurnAdvisorSuccessWithinTurn?: boolean;
  readonly recentAdvisorSuccessWithinTurns?: boolean;
  readonly turnToolCallCount?: number;
  readonly loopBridgeLoopDetected?: boolean;
  readonly loopBridgeAttribution?: string;
  readonly advisorTriggerMode?: 'executor_request' | 'detector' | 'hybrid';
  readonly executorCheckpoints?: PolluxExecutorCheckpointConfig;
}

export interface SensorSignal {
  readonly id: string;
  readonly weight: number;
  readonly precisionPrior: number;
  readonly category: PolluxSensorSignalCategory;
  readonly hardPrecision?: boolean;
  readonly tsMs: number;
  readonly attribution?: string;
}

/** Observer sensor contract (DETECTOR_IMPLEMENTATION_PLAN §D.2). */
export interface Sensor {
  readonly id: string;
  beginTurn?(): void;
  observe(input: SensorInput): readonly SensorSignal[];
}

/** Back-compat alias for phase A/B/C references. */
export type PolluxObserverSensor = Sensor;
