/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Canonical Pollux type surface: turn context, detector contracts, and advisor
 * contracts (POLLUX_SPEC §§4–7, P0-08 POLLUX-P1-01).
 *
 * No runtime behavior — types and defaults only.
 */

/** Synthetic tool routed through scheduler policy (POLLUX_SPEC §6, P0-02). */
export const ADVISOR_CONSULTATION_TOOL_NAME = 'advisor_consultation' as const;

/**
 * Runtime entry alignment with POLLUX_SPEC §3 and P0-01 driver matrix.
 * Includes deferred A2A for explicit bypass contracts/tests.
 */
export const PolluxRuntimeSurface = {
  LEGACY_INTERACTIVE: 'legacy_interactive',
  LEGACY_NON_INTERACTIVE: 'legacy_non_interactive',
  AGENT_SESSION_INTERACTIVE: 'agent_session_interactive',
  AGENT_SESSION_NON_INTERACTIVE: 'agent_session_non_interactive',
  ACP: 'acp',
  A2A_DEFERRED: 'a2a_deferred',
} as const;

export type PolluxRuntimeSurface =
  (typeof PolluxRuntimeSurface)[keyof typeof PolluxRuntimeSurface];

/** Escalation detector strategies (POLLUX_SPEC §7.1). */
export const PolluxDetectorStrategy = {
  HEURISTIC: 'heuristic',
  STRUCTURED: 'structured',
  HYBRID: 'hybrid',
} as const;

export type PolluxDetectorStrategy =
  (typeof PolluxDetectorStrategy)[keyof typeof PolluxDetectorStrategy];

/**
 * Which detector pipeline runs (`experimental.pollux.detectorVersion`).
 * @see docs/core/pollux/DETECTOR_V2_IMPLEMENTATION_PLAN.md §4
 */
export const PolluxDetectorVersion = {
  V1: 'v1',
  V2: 'v2',
} as const;

export type PolluxDetectorVersion =
  (typeof PolluxDetectorVersion)[keyof typeof PolluxDetectorVersion];

/**
 * Opt-in subtree for live observer + fusion (v2). Merge defaults and
 * `PolluxExperimentalConfig` wiring ship in a follow-up task.
 */
export interface PolluxV2Config {
  readonly enabled: boolean;
  readonly riskGate: {
    readonly enabled: boolean;
    readonly mode: 'allowlist' | 'blocklist';
    readonly denyPatterns: readonly string[];
  };
  readonly observer: {
    readonly enabled: boolean;
    readonly maxThoughtWindowChars: number;
    readonly maxToolEventWindow: number;
    readonly decayHalfLifeMs: number;
  };
  readonly selfReport: {
    readonly enabled: boolean;
    readonly promptPrimingEnabled: boolean;
  };
  readonly fusion: {
    readonly targetEscalationRate: number;
    readonly requireComposite: boolean;
    readonly lowPrecisionFloor: number;
    readonly sameTurnThresholdMultiplier: number;
    readonly sameTurnAbsoluteFloor: number;
  };
  readonly timing: {
    readonly sameTurnEnabled: boolean;
    readonly maxSameTurnEscalationsPerTurn: number;
  };
}

/**
 * Deterministic, stable reason tokens for escalation decisions (POLLUX_SPEC §7.2).
 * Additional codes may be added; tests should treat unknown strings as opaque.
 */
export const PolluxEscalationReasonCode = {
  NONE: 'pollux.escalation.none',
  CONFIG_DISABLED: 'pollux.escalation.config_disabled',
  BUDGET_EXHAUSTED: 'pollux.escalation.budget_exhausted',
  HEURISTIC_MATCH: 'pollux.escalation.heuristic_match',
  STRUCTURED_TAG: 'pollux.escalation.structured_tag',
  HYBRID_RESOLUTION: 'pollux.escalation.hybrid_resolution',
  DEFERRED_SURFACE: 'pollux.escalation.deferred_surface',
  FAIL_OPEN: 'pollux.escalation.fail_open',
} as const;

export type PolluxEscalationReasonCode =
  (typeof PolluxEscalationReasonCode)[keyof typeof PolluxEscalationReasonCode];

/** Lower bound for {@link PolluxExperimentalConfig.advisorRequestTimeoutMs} after merge. */
export const POLLUX_MIN_ADVISOR_TIMEOUT_MS = 1000;

/** Lower bound for per-turn/session advisor call budgets. */
export const POLLUX_MIN_ADVISOR_CALLS = 1;

/** Lower and upper bounds for structured confidence threshold (1-10). */
export const POLLUX_MIN_CONFIDENCE_THRESHOLD = 1;
export const POLLUX_MAX_CONFIDENCE_THRESHOLD = 10;

/**
 * experimental.pollux.* shape (POLLUX_SPEC §8.2).
 * Wired through CLI schema / ConfigParameters in later tasks (P1-03, P1-04).
 */
export interface PolluxExperimentalConfig {
  readonly enabled: boolean;
  readonly executorModel: string;
  readonly advisorModel: string;
  readonly strategy: PolluxDetectorStrategy;
  readonly maxAdvisorCallsPerTurn: number;
  readonly maxAdvisorCallsPerSession: number;
  /**
   * Minimum structured confidence (1–10) required before escalation on the
   * structured/hybrid paths (POLLUX_SPEC §7.3, example threshold 6 in §8.2).
   */
  readonly confidenceThreshold: number;
  readonly emitAdvisorDebug: boolean;
  /**
   * Max time to wait for an advisor model response before fail-open (ms).
   * P1-07; enforced by runtime integration in later phases.
   */
  readonly advisorRequestTimeoutMs: number;
}

/**
 * Phase 1 default feature flag: Pollux off for baseline-identical behavior
 * (POLLUX_SPEC §15.1, P0-03 flag-first strategy). Other fields match §8.2
 * illustrative values for stable merge defaults when Pollux is enabled.
 */
export const DEFAULT_POLLUX_EXPERIMENTAL_CONFIG = {
  enabled: false,
  executorModel: 'gemini-2.5-flash',
  advisorModel: 'gemini-3.1-pro-preview',
  strategy: PolluxDetectorStrategy.HYBRID,
  maxAdvisorCallsPerTurn: 2,
  maxAdvisorCallsPerSession: 20,
  confidenceThreshold: 6,
  emitAdvisorDebug: false,
  advisorRequestTimeoutMs: 120_000,
} as const satisfies PolluxExperimentalConfig;

function polluxFiniteNumber(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function polluxFiniteNumberInRange(
  value: number | undefined,
  fallback: number,
  bounds: { min?: number; max?: number },
): number {
  const numeric = polluxFiniteNumber(value, fallback);
  let bounded = numeric;
  if (typeof bounds.min === 'number') {
    bounded = Math.max(bounds.min, bounded);
  }
  if (typeof bounds.max === 'number') {
    bounded = Math.min(bounds.max, bounded);
  }
  return bounded;
}

/**
 * Merge CLI/settings partial values with Pollux defaults (P1-04, P0-03).
 * Invalid `strategy` or non-finite numbers fall back to defaults. Numeric
 * fields with policy-safety ranges are clamped to safe bounds.
 */
export function mergePolluxExperimentalConfig(
  partial?: Partial<PolluxExperimentalConfig> | undefined,
): PolluxExperimentalConfig {
  const d = DEFAULT_POLLUX_EXPERIMENTAL_CONFIG;
  const s = partial?.strategy;
  const strategy: PolluxDetectorStrategy =
    s === PolluxDetectorStrategy.HEURISTIC ||
    s === PolluxDetectorStrategy.STRUCTURED ||
    s === PolluxDetectorStrategy.HYBRID
      ? s
      : d.strategy;

  return {
    enabled: partial?.enabled ?? d.enabled,
    executorModel: partial?.executorModel ?? d.executorModel,
    advisorModel: partial?.advisorModel ?? d.advisorModel,
    strategy,
    maxAdvisorCallsPerTurn: polluxFiniteNumberInRange(
      partial?.maxAdvisorCallsPerTurn,
      d.maxAdvisorCallsPerTurn,
      { min: POLLUX_MIN_ADVISOR_CALLS },
    ),
    maxAdvisorCallsPerSession: polluxFiniteNumberInRange(
      partial?.maxAdvisorCallsPerSession,
      d.maxAdvisorCallsPerSession,
      { min: POLLUX_MIN_ADVISOR_CALLS },
    ),
    confidenceThreshold: polluxFiniteNumberInRange(
      partial?.confidenceThreshold,
      d.confidenceThreshold,
      {
        min: POLLUX_MIN_CONFIDENCE_THRESHOLD,
        max: POLLUX_MAX_CONFIDENCE_THRESHOLD,
      },
    ),
    emitAdvisorDebug: partial?.emitAdvisorDebug ?? d.emitAdvisorDebug,
    advisorRequestTimeoutMs: Math.max(
      POLLUX_MIN_ADVISOR_TIMEOUT_MS,
      polluxFiniteNumber(
        partial?.advisorRequestTimeoutMs,
        d.advisorRequestTimeoutMs,
      ),
    ),
  };
}

/**
 * Bounded context passed to shouldEscalate and advisor consultation
 * (POLLUX_SPEC §5.1–5.2 interceptor flow).
 */
export interface PolluxTurnContext {
  readonly surface: PolluxRuntimeSurface;
  readonly sessionId: string;
  readonly turnId: string;
  readonly experimental: Readonly<PolluxExperimentalConfig>;
  readonly advisorCallsThisTurn: number;
  readonly advisorCallsThisSession: number;
  /**
   * Optional digest for heuristics — must not embed raw secrets or full logs.
   */
  readonly userContentDigest?: string;
  readonly pendingToolContext?: string;
}

/** Outcome of shouldEscalate (detector contract). */
export interface ShouldEscalateResult {
  readonly escalate: boolean;
  readonly reasonCode: PolluxEscalationReasonCode;
  readonly strategy: PolluxDetectorStrategy;
  /** 1–10 when the structured or hybrid path evaluated a confidence tag. */
  readonly structuredConfidence?: number;
}

/** Detector contract (POLLUX_SPEC §7). */
export interface PolluxDetector {
  shouldEscalate(context: PolluxTurnContext): Promise<ShouldEscalateResult>;
}

/**
 * Policy decisions for advisor routing (POLLUX_SPEC §6.2, P0-02).
 * Intentionally aligned with {@link PolicyDecision} in policy/types.ts.
 */
export type PolluxPolicyDecision = 'allow' | 'deny' | 'ask_user';

/** Request payload for a synthetic advisor_consultation (POLLUX_SPEC §6.1). */
export interface AdvisorConsultationInput {
  readonly context: PolluxTurnContext;
  /** Same tool name as scheduler policy match. */
  readonly toolName: typeof ADVISOR_CONSULTATION_TOOL_NAME;
  /** Bounded natural-language or structured summary for the advisor model. */
  readonly body: string;
}

/** Terminal states for an advisor round-trip (fail-open semantics, POLLUX_SPEC §5.2). */
export const AdvisorConsultationStatus = {
  COMPLETED: 'completed',
  FAIL_OPEN: 'fail_open',
  POLICY_BLOCKED: 'policy_blocked',
  MALFORMED: 'malformed',
  TIMEOUT: 'timeout',
} as const;

export type AdvisorConsultationStatus =
  (typeof AdvisorConsultationStatus)[keyof typeof AdvisorConsultationStatus];

/** Result of advisor consultation (advisor contract). */
export interface AdvisorConsultationResult {
  readonly status: AdvisorConsultationStatus;
  /** Executor-facing guidance when status is completed. */
  readonly guidanceText?: string;
  readonly reasonCode?: PolluxEscalationReasonCode;
  /** Last known policy decision when routed through scheduler policy. */
  readonly policyDecision?: PolluxPolicyDecision;
}

/** Advisor contract. */
export interface PolluxAdvisor {
  consult(
    input: AdvisorConsultationInput,
    options?: { signal?: AbortSignal },
  ): Promise<AdvisorConsultationResult>;
}
