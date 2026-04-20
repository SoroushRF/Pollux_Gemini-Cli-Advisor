/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  ADVISOR_CONSULTATION_TOOL_NAME,
  AdvisorConsultationStatus,
  DEFAULT_POLLUX_DETECTOR_CONFIG,
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  mergePolluxExperimentalConfig,
  POLLUX_ESCALATION_TIMING,
  PolluxDetectorStrategy,
  PolluxEscalationReasonCode,
  PolluxRuntimeSurface,
  type AdvisorConsultationInput,
  type AdvisorConsultationResult,
  type PolluxAdvisor,
  type PolluxDetector,
  type PolluxExperimentalConfig,
  type PolluxTurnContext,
  type ShouldEscalateResult,
} from './types.js';

describe('pollux/types', () => {
  describe('mergePolluxExperimentalConfig', () => {
    it('fills defaults for empty partial', () => {
      expect(mergePolluxExperimentalConfig({})).toEqual({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
      });
    });

    it('falls back numeric fields when non-finite', () => {
      expect(
        mergePolluxExperimentalConfig({
          maxAdvisorCallsPerTurn: Number.NaN,
          confidenceThreshold: Number.POSITIVE_INFINITY,
        }).maxAdvisorCallsPerTurn,
      ).toBe(DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.maxAdvisorCallsPerTurn);
      expect(
        mergePolluxExperimentalConfig({
          confidenceThreshold: Number.NaN,
        }).confidenceThreshold,
      ).toBe(DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.confidenceThreshold);
      expect(
        mergePolluxExperimentalConfig({
          advisorRequestTimeoutMs: Number.NaN,
        }).advisorRequestTimeoutMs,
      ).toBe(DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.advisorRequestTimeoutMs);
    });

    it('clamps bounded numeric fields to safe ranges', () => {
      const clampedLow = mergePolluxExperimentalConfig({
        maxAdvisorCallsPerTurn: -5,
        maxAdvisorCallsPerSession: 0,
        confidenceThreshold: -1,
      });
      expect(clampedLow.maxAdvisorCallsPerTurn).toBe(1);
      expect(clampedLow.maxAdvisorCallsPerSession).toBe(1);
      expect(clampedLow.confidenceThreshold).toBe(1);

      const clampedHigh = mergePolluxExperimentalConfig({
        confidenceThreshold: 99,
      });
      expect(clampedHigh.confidenceThreshold).toBe(10);
    });

    it('clamps advisorRequestTimeoutMs to minimum', () => {
      expect(
        mergePolluxExperimentalConfig({
          advisorRequestTimeoutMs: 100,
        }).advisorRequestTimeoutMs,
      ).toBe(1000);
    });

    it('merges nested detector subtree with defaults', () => {
      const merged = mergePolluxExperimentalConfig({
        detector: {
          riskGate: { enabled: true, denyPatterns: ['rm\\s+-rf'] },
          observer: { maxThoughtWindowChars: 800 },
        },
      });
      expect(merged.detector.riskGate.enabled).toBe(true);
      expect(merged.detector.riskGate.mode).toBe('blocklist');
      expect(merged.detector.riskGate.denyPatterns).toEqual(['rm\\s+-rf']);
      expect(merged.detector.observer.enabled).toBe(false);
      expect(merged.detector.observer.maxThoughtWindowChars).toBe(1024);
      expect(merged.detector.timing.sameTurnEnabled).toBe(true);
    });

    it('rejects invalid riskGate.mode by falling back to default', () => {
      const merged = mergePolluxExperimentalConfig({
        detector: {
          riskGate: { mode: 'invalid' as 'allowlist' },
        },
      });
      expect(merged.detector.riskGate.mode).toBe('blocklist');
    });
  });

  describe('DEFAULT_POLLUX_EXPERIMENTAL_CONFIG', () => {
    it('matches POLLUX_SPEC §8.2 field set with safe feature default', () => {
      const cfg: PolluxExperimentalConfig = {
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
      };
      expect(cfg.enabled).toBe(false);
      expect(cfg.executorModel).toBe('gemini-2.5-flash');
      expect(cfg.advisorModel).toBe('gemini-3.1-pro-preview');
      expect(cfg.strategy).toBe(PolluxDetectorStrategy.HYBRID);
      expect(cfg.maxAdvisorCallsPerTurn).toBe(2);
      expect(cfg.maxAdvisorCallsPerSession).toBe(20);
      expect(cfg.confidenceThreshold).toBe(6);
      expect(cfg.emitAdvisorDebug).toBe(false);
      expect(cfg.advisorRequestTimeoutMs).toBe(120_000);
      expect(cfg.detector).toEqual(DEFAULT_POLLUX_DETECTOR_CONFIG);
    });
  });

  describe('PolluxEscalationReasonCode', () => {
    it('uses unique string values', () => {
      const values = Object.values(PolluxEscalationReasonCode);
      expect(new Set(values).size).toBe(values.length);
    });

    // Invariant I10 (DETECTOR_IMPLEMENTATION_PLAN §2a.3): every reason code
    // must have a canonical same_turn/next_turn mapping.
    it('I10: POLLUX_ESCALATION_TIMING covers every reason code and matches §2a.3', () => {
      const values = Object.values(PolluxEscalationReasonCode);
      for (const code of values) {
        expect(POLLUX_ESCALATION_TIMING[code]).toMatch(
          /^(same_turn|next_turn)$/,
        );
      }
      expect(Object.keys(POLLUX_ESCALATION_TIMING).sort()).toEqual(
        [...values].sort(),
      );
      expect(POLLUX_ESCALATION_TIMING).toMatchInlineSnapshot(`
        {
          "pollux.escalation.budget_exhausted": "next_turn",
          "pollux.escalation.config_disabled": "next_turn",
          "pollux.escalation.deferred_surface": "next_turn",
          "pollux.escalation.fail_open": "next_turn",
          "pollux.escalation.fusion_budget_target": "next_turn",
          "pollux.escalation.fusion_composite": "next_turn",
          "pollux.escalation.fusion_composite_emphatic": "same_turn",
          "pollux.escalation.hard_loop": "same_turn",
          "pollux.escalation.heuristic_match": "next_turn",
          "pollux.escalation.hybrid_resolution": "next_turn",
          "pollux.escalation.live_observer_match": "next_turn",
          "pollux.escalation.none": "next_turn",
          "pollux.escalation.risk_gate_block": "same_turn",
          "pollux.escalation.self_report_stuck": "same_turn",
          "pollux.escalation.structured_tag": "next_turn",
        }
      `);
    });
  });

  describe('PolluxRuntimeSurface', () => {
    it('covers POLLUX_SPEC §3 matrix plus deferred A2A', () => {
      const surfaces = new Set(Object.values(PolluxRuntimeSurface));
      expect(surfaces.has(PolluxRuntimeSurface.LEGACY_INTERACTIVE)).toBe(true);
      expect(surfaces.has(PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE)).toBe(
        true,
      );
      expect(surfaces.has(PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE)).toBe(
        true,
      );
      expect(
        surfaces.has(PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE),
      ).toBe(true);
      expect(surfaces.has(PolluxRuntimeSurface.ACP)).toBe(true);
      expect(surfaces.has(PolluxRuntimeSurface.A2A_DEFERRED)).toBe(true);
    });
  });

  describe('fixture typing', () => {
    it('accepts a PolluxTurnContext and detector/advisor implementations', async () => {
      const ctx: PolluxTurnContext = {
        surface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        sessionId: 'sess-1',
        turnId: 'turn-1',
        experimental: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        advisorCallsThisTurn: 0,
        advisorCallsThisSession: 0,
        userContentDigest: 'sha256:fixture',
      };

      const detector: PolluxDetector = {
        async shouldEscalate(): Promise<ShouldEscalateResult> {
          return {
            escalate: false,
            reasonCode: PolluxEscalationReasonCode.CONFIG_DISABLED,
            strategy: PolluxDetectorStrategy.HEURISTIC,
          };
        },
      };

      const advisor: PolluxAdvisor = {
        async consult(
          input: AdvisorConsultationInput,
        ): Promise<AdvisorConsultationResult> {
          expect(input.toolName).toBe(ADVISOR_CONSULTATION_TOOL_NAME);
          return {
            status: AdvisorConsultationStatus.FAIL_OPEN,
            reasonCode: PolluxEscalationReasonCode.FAIL_OPEN,
          };
        },
      };

      const escalation = await detector.shouldEscalate(ctx);
      expect(escalation.escalate).toBe(false);

      const input: AdvisorConsultationInput = {
        context: ctx,
        toolName: ADVISOR_CONSULTATION_TOOL_NAME,
        body: 'Summarize next step.',
      };
      const out = await advisor.consult(input);
      expect(out.status).toBe(AdvisorConsultationStatus.FAIL_OPEN);
    });
  });
});
