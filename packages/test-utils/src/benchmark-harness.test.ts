/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  evaluatePerRunPins,
  ADVISOR_TELEMETRY_ROLE,
  LOOP_DETECTOR_TELEMETRY_ROLE,
  ROUTER_TELEMETRY_ROLE,
  type BenchmarkRunObservables,
  type BenchmarkSettingsOverrides,
} from './benchmark-harness.js';

/**
 * P4-02 (harness fairness pin enforcement) AND P4-06 AC-02 (invalid-run
 * rejection) coverage.
 *
 * Each scenario constructs a paired (settings, observables) input and
 * asserts that {@link evaluatePerRunPins} computes the expected pin truth
 * table. The senior-review feedback was that the previous harness
 * hard-coded `availabilityReset`, `sessionIsolated`, and `sandboxIsolated`
 * to the constant `true` — meaning the audit could never detect a
 * regression. These tests pin the new contract: every pin is derived from
 * either the requested settings OR the captured runtime observable, and a
 * deliberate violation of any pin produces `false`.
 */
describe('evaluatePerRunPins (P4-02 + P4-06 AC-02)', () => {
  function validSettings(): BenchmarkSettingsOverrides {
    return {
      model: { name: 'gemini-2.5-flash', disableLoopDetection: true },
      experimental: {
        dynamicModelConfiguration: false,
        gemmaModelRouter: { enabled: false },
        pollux: {
          enabled: false,
          executorModel: 'gemini-2.5-flash',
        },
      },
    };
  }

  function validObservables(): BenchmarkRunObservables {
    return {
      sessionId: 'sess-abc-123',
      workspaceDir: '/tmp/ws-abc-123',
      homeDir: '/tmp/home-abc-123',
      utilityRoleCounts: {},
    };
  }

  it('all six pins pass for valid settings + clean telemetry', () => {
    const pins = evaluatePerRunPins(validSettings(), validObservables());
    expect(pins).toEqual({
      routerPinned: true,
      loopDetectionDisabled: true,
      availabilityReset: true,
      dynamicConfigFixed: true,
      sessionIsolated: true,
      sandboxIsolated: true,
    });
  });

  it('does not count advisor telemetry against router or loop detector pins', () => {
    // Pollux advisor calls are an INTENDED utility role in B/C/D conditions.
    // They must not invalidate the router or loop-detector pins.
    const observables = validObservables();
    (observables.utilityRoleCounts as Record<string, number>)[
      ADVISOR_TELEMETRY_ROLE
    ] = 5;
    const pins = evaluatePerRunPins(validSettings(), observables);
    expect(pins.routerPinned).toBe(true);
    expect(pins.loopDetectionDisabled).toBe(true);
  });

  describe('FP-01 routerPinned negative cases (AC-02)', () => {
    it('fails when settings name is "auto"', () => {
      const s = validSettings();
      s.model.name = 'auto';
      expect(evaluatePerRunPins(s, validObservables()).routerPinned).toBe(
        false,
      );
    });

    it('fails when gemmaModelRouter is enabled', () => {
      const s = validSettings();
      s.experimental.gemmaModelRouter.enabled = true;
      expect(evaluatePerRunPins(s, validObservables()).routerPinned).toBe(
        false,
      );
    });

    it('fails when telemetry shows utility_router api_response events (TG-1 AC-03)', () => {
      const obs = validObservables();
      (obs.utilityRoleCounts as Record<string, number>)[ROUTER_TELEMETRY_ROLE] =
        1;
      expect(evaluatePerRunPins(validSettings(), obs).routerPinned).toBe(false);
    });
  });

  describe('FP-02 loopDetectionDisabled negative cases (AC-02)', () => {
    it('fails when settings do not disable loop detection', () => {
      const s = validSettings();
      s.model.disableLoopDetection = false;
      expect(
        evaluatePerRunPins(s, validObservables()).loopDetectionDisabled,
      ).toBe(false);
    });

    it('fails when telemetry shows utility_loop_detector api_response events (TG-1 AC-03)', () => {
      const obs = validObservables();
      (obs.utilityRoleCounts as Record<string, number>)[
        LOOP_DETECTOR_TELEMETRY_ROLE
      ] = 1;
      expect(
        evaluatePerRunPins(validSettings(), obs).loopDetectionDisabled,
      ).toBe(false);
    });
  });

  describe('FP-03 availabilityReset negative cases (AC-02)', () => {
    it('fails when homeDir is empty', () => {
      const obs = validObservables();
      obs.homeDir = '';
      expect(evaluatePerRunPins(validSettings(), obs).availabilityReset).toBe(
        false,
      );
    });
  });

  describe('FP-04 dynamicConfigFixed negative cases (AC-02)', () => {
    it('fails when dynamicModelConfiguration is enabled', () => {
      const s = validSettings();
      s.experimental.dynamicModelConfiguration = true;
      expect(evaluatePerRunPins(s, validObservables()).dynamicConfigFixed).toBe(
        false,
      );
    });
  });

  describe('FP-05 sessionIsolated negative cases (AC-02)', () => {
    it('fails when sessionId is empty', () => {
      const obs = validObservables();
      obs.sessionId = '';
      expect(evaluatePerRunPins(validSettings(), obs).sessionIsolated).toBe(
        false,
      );
    });
  });

  describe('FP-06 sandboxIsolated negative cases (AC-02)', () => {
    it('fails when workspaceDir is empty', () => {
      const obs = validObservables();
      obs.workspaceDir = '';
      expect(evaluatePerRunPins(validSettings(), obs).sandboxIsolated).toBe(
        false,
      );
    });

    it('fails when workspaceDir equals homeDir (no sandbox isolation)', () => {
      const obs = validObservables();
      obs.workspaceDir = obs.homeDir;
      expect(evaluatePerRunPins(validSettings(), obs).sandboxIsolated).toBe(
        false,
      );
    });
  });
});
