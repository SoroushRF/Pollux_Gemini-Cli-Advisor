/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PolluxEscalationReasonCode,
  PolluxRuntimeSurface,
  type PolluxExperimentalConfig,
} from '../types.js';
import { checkAdvisorInvocationBudget } from '../safeguards.js';

export type PolluxEligibilityResult =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reasonCode: PolluxEscalationReasonCode;
      readonly blockReason: 'config_disabled' | 'deferred_surface' | 'budget';
    };

export function isPolluxRuntimeSurfaceSupported(
  runtimeSurface: PolluxRuntimeSurface,
): boolean {
  return (
    runtimeSurface === PolluxRuntimeSurface.LEGACY_INTERACTIVE ||
    runtimeSurface === PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE ||
    runtimeSurface === PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE ||
    runtimeSurface === PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE ||
    runtimeSurface === PolluxRuntimeSurface.ACP
  );
}

export function checkPolluxEligibility(params: {
  readonly runtimeSurface: PolluxRuntimeSurface;
  readonly experimental: Readonly<PolluxExperimentalConfig>;
  readonly callsCompletedThisTurn: number;
  readonly callsCompletedThisSession: number;
}): PolluxEligibilityResult {
  if (!params.experimental.enabled) {
    return {
      eligible: false,
      reasonCode: PolluxEscalationReasonCode.CONFIG_DISABLED,
      blockReason: 'config_disabled',
    };
  }

  if (!isPolluxRuntimeSurfaceSupported(params.runtimeSurface)) {
    return {
      eligible: false,
      reasonCode: PolluxEscalationReasonCode.DEFERRED_SURFACE,
      blockReason: 'deferred_surface',
    };
  }

  const budgetCheck = checkAdvisorInvocationBudget(params.experimental, {
    callsCompletedThisTurn: params.callsCompletedThisTurn,
    callsCompletedThisSession: params.callsCompletedThisSession,
  });
  if (!budgetCheck.allowed) {
    return {
      eligible: false,
      reasonCode: budgetCheck.reasonCode,
      blockReason: 'budget',
    };
  }

  return { eligible: true };
}
