/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { checkPolluxEligibility } from './eligibility.js';
import {
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  PolluxEscalationReasonCode,
  PolluxRuntimeSurface,
  mergePolluxExperimentalConfig,
} from '../types.js';

describe('pollux/observer/eligibility', () => {
  it('returns CONFIG_DISABLED when Pollux is off', () => {
    const r = checkPolluxEligibility({
      runtimeSurface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
      experimental: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
      callsCompletedThisTurn: 0,
      callsCompletedThisSession: 0,
    });
    expect(r).toEqual({
      eligible: false,
      reasonCode: PolluxEscalationReasonCode.CONFIG_DISABLED,
      blockReason: 'config_disabled',
    });
  });

  it('returns DEFERRED_SURFACE for A2A surface even when Pollux is enabled', () => {
    const exp = mergePolluxExperimentalConfig({ enabled: true });
    const r = checkPolluxEligibility({
      runtimeSurface: PolluxRuntimeSurface.A2A_DEFERRED,
      experimental: exp,
      callsCompletedThisTurn: 0,
      callsCompletedThisSession: 0,
    });
    expect(r).toEqual({
      eligible: false,
      reasonCode: PolluxEscalationReasonCode.DEFERRED_SURFACE,
      blockReason: 'deferred_surface',
    });
  });

  it('returns BUDGET_EXHAUSTED when the budget caps are reached', () => {
    const exp = mergePolluxExperimentalConfig({
      enabled: true,
      maxAdvisorCallsPerTurn: 1,
      maxAdvisorCallsPerSession: 1,
    });
    const r = checkPolluxEligibility({
      runtimeSurface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
      experimental: exp,
      callsCompletedThisTurn: 1,
      callsCompletedThisSession: 0,
    });
    expect(r).toEqual({
      eligible: false,
      reasonCode: PolluxEscalationReasonCode.BUDGET_EXHAUSTED,
      blockReason: 'budget',
    });
  });
});
