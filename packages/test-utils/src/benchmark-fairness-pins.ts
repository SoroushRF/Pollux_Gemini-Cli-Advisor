/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standalone fairness-pin evaluation module.
 *
 * Extracted from benchmark-harness.ts so that non-vitest entrypoints
 * (e.g. pollux-real-pilot.ts run via tsx) can import fairness-pin
 * logic without transitively pulling in test-rig.ts → vitest.
 */

/**
 * Minimal settings shape required by the pin evaluator. This mirrors
 * the `BenchmarkSettingsOverrides` interface in benchmark-harness.ts
 * without depending on it to avoid the transitive vitest import.
 */
export interface FairnessPinSettings {
  model: {
    name: string;
    disableLoopDetection: boolean;
  };
  experimental: {
    dynamicModelConfiguration: boolean;
    gemmaModelRouter: {
      enabled: boolean;
    };
  };
}

/**
 * Runtime observables captured from the CLI subprocess for a single
 * benchmark run, used by the pin evaluator.
 */
export interface FairnessPinObservables {
  sessionId: string;
  workspaceDir: string;
  homeDir: string;
  utilityRoleCounts: Readonly<Record<string, number>>;
}

/**
 * The per-run fairness pin truth table (FP-01–FP-06).
 */
export interface FairnessPinResult {
  routerPinned: boolean;
  loopDetectionDisabled: boolean;
  availabilityReset: boolean;
  dynamicConfigFixed: boolean;
  sessionIsolated: boolean;
  sandboxIsolated: boolean;
}

/**
 * Telemetry roles that, if observed during a benchmark run, prove a
 * fairness pin was NOT enforced at runtime regardless of the settings file.
 * Used by AC-03 (TG-1 baseline utility-call suppression).
 */
export const ROUTER_TELEMETRY_ROLE = 'utility_router';
export const LOOP_DETECTOR_TELEMETRY_ROLE = 'utility_loop_detector';
export const ADVISOR_TELEMETRY_ROLE = 'utility_advisor';

/**
 * Pure pin evaluator: given the requested settings AND the runtime
 * observables captured from the CLI subprocess, return the per-run pin
 * truth table.
 *
 * Per-pin derivation rules (P0-05 contract refined by senior review):
 *
 *   - FP-01 routerPinned: requested settings PIN router off AND telemetry
 *     contains zero `utility_router` api_response events.
 *   - FP-02 loopDetectionDisabled: requested settings disable loop detection
 *     AND telemetry contains zero `utility_loop_detector` api_response
 *     events.
 *   - FP-03 availabilityReset: this run reports a non-empty isolated home
 *     directory. Cross-run uniqueness is the aggregator's responsibility
 *     (see `pollux-benchmark-fairness-audit.ts`).
 *   - FP-04 dynamicConfigFixed: requested settings disable dynamic model
 *     configuration. Pure settings-derived; documented limitation.
 *   - FP-05 sessionIsolated: this run reports a non-empty unique session id.
 *     Cross-run uniqueness is the aggregator's responsibility.
 *   - FP-06 sandboxIsolated: this run reports a non-empty workspace
 *     directory distinct from the home directory. Cross-run uniqueness is
 *     the aggregator's responsibility.
 */
export function evaluatePerRunPins(
  settings: FairnessPinSettings,
  observables: FairnessPinObservables,
): FairnessPinResult {
  const routerSettingsOk =
    settings.model.name !== 'auto' &&
    settings.experimental.gemmaModelRouter.enabled === false;
  const observedRouterCalls =
    observables.utilityRoleCounts[ROUTER_TELEMETRY_ROLE] ?? 0;
  const observedLoopDetectorCalls =
    observables.utilityRoleCounts[LOOP_DETECTOR_TELEMETRY_ROLE] ?? 0;

  return {
    routerPinned: routerSettingsOk && observedRouterCalls === 0,
    loopDetectionDisabled:
      settings.model.disableLoopDetection === true &&
      observedLoopDetectorCalls === 0,
    availabilityReset:
      typeof observables.homeDir === 'string' && observables.homeDir.length > 0,
    dynamicConfigFixed:
      settings.experimental.dynamicModelConfiguration === false,
    sessionIsolated:
      typeof observables.sessionId === 'string' &&
      observables.sessionId.length > 0,
    sandboxIsolated:
      typeof observables.workspaceDir === 'string' &&
      observables.workspaceDir.length > 0 &&
      observables.workspaceDir !== observables.homeDir,
  };
}
