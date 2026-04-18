/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  ADVISOR_CONSULTATION_TOOL_NAME,
  AdvisorConsultationStatus,
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
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
    });
  });

  describe('PolluxEscalationReasonCode', () => {
    it('uses unique string values', () => {
      const values = Object.values(PolluxEscalationReasonCode);
      expect(new Set(values).size).toBe(values.length);
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
