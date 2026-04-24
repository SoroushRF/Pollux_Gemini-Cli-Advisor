/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  checkAdvisorInvocationBudget,
  getAdvisorRequestTimeoutMs,
  resolveAdvisorPathFailure,
} from './safeguards.js';
import {
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  mergePolluxExperimentalConfig,
  PolluxEscalationReasonCode,
} from './types.js';

const enabled = mergePolluxExperimentalConfig({ enabled: true });

describe('pollux/safeguards', () => {
  describe('checkAdvisorInvocationBudget', () => {
    it('blocks when Pollux is disabled', () => {
      const r = checkAdvisorInvocationBudget(
        DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        {
          callsCompletedThisTurn: 0,
          callsCompletedThisSession: 0,
        },
      );
      expect(r).toEqual({
        allowed: false,
        blockReason: 'pollux_disabled',
        reasonCode: PolluxEscalationReasonCode.CONFIG_DISABLED,
      });
    });

    it('allows when under turn and session caps', () => {
      const r = checkAdvisorInvocationBudget(enabled, {
        callsCompletedThisTurn: 0,
        callsCompletedThisSession: 0,
      });
      expect(r).toEqual({ allowed: true });
    });

    it('blocks when turn budget is exhausted', () => {
      const r = checkAdvisorInvocationBudget(enabled, {
        callsCompletedThisTurn: enabled.maxAdvisorCallsPerTurn,
        callsCompletedThisSession: 0,
      });
      expect(r).toEqual({
        allowed: false,
        blockReason: 'turn_limit',
        reasonCode: PolluxEscalationReasonCode.BUDGET_EXHAUSTED,
      });
    });

    it('blocks when session budget is exhausted', () => {
      const r = checkAdvisorInvocationBudget(enabled, {
        callsCompletedThisTurn: 0,
        callsCompletedThisSession: enabled.maxAdvisorCallsPerSession,
      });
      expect(r).toEqual({
        allowed: false,
        blockReason: 'session_limit',
        reasonCode: PolluxEscalationReasonCode.BUDGET_EXHAUSTED,
      });
    });

    it('normalizes invalid finite budget settings before evaluating limits', () => {
      const normalized = mergePolluxExperimentalConfig({
        enabled: true,
        maxAdvisorCallsPerTurn: -1,
        maxAdvisorCallsPerSession: -1,
      });

      const r = checkAdvisorInvocationBudget(normalized, {
        callsCompletedThisTurn: 0,
        callsCompletedThisSession: 0,
      });

      expect(normalized.maxAdvisorCallsPerTurn).toBe(1);
      expect(normalized.maxAdvisorCallsPerSession).toBe(1);
      expect(r).toEqual({ allowed: true });
    });
  });

  describe('resolveAdvisorPathFailure', () => {
    it('returns fail-open for advisor path failure kinds', () => {
      for (const kind of [
        'parse_error',
        'timeout',
        'empty_response',
        'capacity_exhausted',
        'quota_exhausted',
      ] as const) {
        const o = resolveAdvisorPathFailure(kind);
        expect(o.continueWithExecutor).toBe(true);
        expect(o.reasonCode).toBe(PolluxEscalationReasonCode.FAIL_OPEN);
        expect(o.failureKind).toBe(kind);
      }
    });
  });

  describe('getAdvisorRequestTimeoutMs', () => {
    it('clamps merged config to minimum', () => {
      const low = mergePolluxExperimentalConfig({
        enabled: true,
        advisorRequestTimeoutMs: 100,
      });
      expect(getAdvisorRequestTimeoutMs(low)).toBe(1000);
    });
  });
});
