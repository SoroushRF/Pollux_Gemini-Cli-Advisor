/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fail-open defaults and advisor call budgets (P1-07, POLLUX_SPEC §5.2, P0-02
 * §2.3). Pure functions — safe to call from scheduler/interceptor code later.
 */

import type { PolluxExperimentalConfig } from './types.js';
import {
  PolluxEscalationReasonCode,
  POLLUX_MIN_ADVISOR_TIMEOUT_MS,
} from './types.js';

export { POLLUX_MIN_ADVISOR_TIMEOUT_MS };

export type AdvisorBudgetBlockReason =
  | 'pollux_disabled'
  | 'turn_limit'
  | 'session_limit';

export type AdvisorBudgetCheck =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly blockReason: AdvisorBudgetBlockReason;
      readonly reasonCode:
        | typeof PolluxEscalationReasonCode.BUDGET_EXHAUSTED
        | typeof PolluxEscalationReasonCode.CONFIG_DISABLED;
    };

/**
 * Returns whether another advisor invocation is allowed under configured
 * per-turn and per-session caps. When Pollux is disabled, advisor calls are
 * not allowed (executor path should run unchanged).
 */
export function checkAdvisorInvocationBudget(
  experimental: Readonly<PolluxExperimentalConfig>,
  counts: {
    readonly callsCompletedThisTurn: number;
    readonly callsCompletedThisSession: number;
  },
): AdvisorBudgetCheck {
  if (!experimental.enabled) {
    return {
      allowed: false,
      blockReason: 'pollux_disabled',
      reasonCode: PolluxEscalationReasonCode.CONFIG_DISABLED,
    };
  }
  if (counts.callsCompletedThisTurn >= experimental.maxAdvisorCallsPerTurn) {
    return {
      allowed: false,
      blockReason: 'turn_limit',
      reasonCode: PolluxEscalationReasonCode.BUDGET_EXHAUSTED,
    };
  }
  if (
    counts.callsCompletedThisSession >= experimental.maxAdvisorCallsPerSession
  ) {
    return {
      allowed: false,
      blockReason: 'session_limit',
      reasonCode: PolluxEscalationReasonCode.BUDGET_EXHAUSTED,
    };
  }
  return { allowed: true };
}

export type AdvisorPathFailureKind =
  | 'parse_error'
  | 'timeout'
  | 'empty_response';

/**
 * Observable fail-open outcome when the advisor path cannot return guidance
 * (malformed model output, timeout, etc.). Callers should continue the executor
 * model without treating this as a policy denial (P0-02 §2.3).
 */
export interface FailOpenAdvisorOutcome {
  readonly continueWithExecutor: true;
  readonly reasonCode: typeof PolluxEscalationReasonCode.FAIL_OPEN;
  readonly failureKind: AdvisorPathFailureKind;
}

/**
 * Maps advisor-path failures to a single fail-open signal for logging and UI.
 * Does not encode policy DENY — that remains the policy engine’s decision.
 */
export function resolveAdvisorPathFailure(
  failureKind: AdvisorPathFailureKind,
): FailOpenAdvisorOutcome {
  return {
    continueWithExecutor: true,
    reasonCode: PolluxEscalationReasonCode.FAIL_OPEN,
    failureKind,
  };
}

/**
 * Effective timeout (ms) from merged config, clamped to a safe minimum.
 */
export function getAdvisorRequestTimeoutMs(
  experimental: Readonly<PolluxExperimentalConfig>,
): number {
  return Math.max(
    POLLUX_MIN_ADVISOR_TIMEOUT_MS,
    experimental.advisorRequestTimeoutMs,
  );
}
