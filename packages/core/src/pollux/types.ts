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

/**
 * Live observer + fusion configuration (`experimental.pollux.detector`).
 * @see docs/core/pollux/DETECTOR_IMPLEMENTATION_PLAN.md §4
 */
export interface PolluxDetectorConfig {
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

export type PolluxAdvisorTriggerMode =
  | 'executor_request'
  | 'detector'
  | 'hybrid';

export type PolluxAdvisorBudgetMode = 'fixed' | 'adaptive';

export type PolluxAdvisorExecutorProfile =
  | 'default'
  | 'flash_lite'
  | 'strict_fd';

export interface PolluxLongTaskHeuristicConfig {
  readonly minToolCalls: number;
  readonly minPromptChars: number;
  readonly anchoredMutation: boolean;
}

export type PolluxDiagnosticTraceThoughtMode = 'summary' | 'raw_model_exposed';

export type PolluxDiagnosticTraceToolResultMode =
  | 'none'
  | 'summary'
  | 'snippet';

export interface PolluxDiagnosticTraceConfig {
  readonly enabled: boolean;
  readonly outputPath: string | null;
  readonly includeModelThoughts: PolluxDiagnosticTraceThoughtMode;
  readonly includeAdvisorGuidanceText: boolean;
  readonly includeExecutorText: boolean;
  readonly includeToolCalls: boolean;
  readonly includeToolResults: PolluxDiagnosticTraceToolResultMode;
  readonly includeObserverSignals: boolean;
  readonly maxTextCharsPerEvent: number;
  readonly redactSensitiveText: boolean;
}

export type AdvisorConsultationMode =
  | 'compact'
  | 'constraint_audit'
  | 'final_audit';

/**
 * Lower bound for merged {@link PolluxDetectorConfig.fusion.sameTurnAbsoluteFloor}.
 * Prevents `0` from silently removing the emphatic same-turn floor (plan §2a.2).
 */
export const POLLUX_MIN_SAME_TURN_ABSOLUTE_FLOOR = 1;

export const DEFAULT_POLLUX_DETECTOR_CONFIG = {
  riskGate: { enabled: false, mode: 'blocklist', denyPatterns: [] },
  observer: {
    enabled: false,
    maxThoughtWindowChars: 16384,
    maxToolEventWindow: 64,
    decayHalfLifeMs: 15000,
  },
  selfReport: { enabled: false, promptPrimingEnabled: false },
  fusion: {
    targetEscalationRate: 0.05,
    requireComposite: true,
    lowPrecisionFloor: 0.5,
    sameTurnThresholdMultiplier: 1.5,
    sameTurnAbsoluteFloor: 3.5,
  },
  timing: { sameTurnEnabled: true, maxSameTurnEscalationsPerTurn: 1 },
} as const satisfies PolluxDetectorConfig;

/**
 * Deterministic, stable reason tokens for escalation decisions (POLLUX_SPEC §7.2).
 * Additional codes may be added; tests should treat unknown strings as opaque.
 */
export const PolluxEscalationReasonCode = {
  NONE: 'pollux.escalation.none',
  CONFIG_DISABLED: 'pollux.escalation.config_disabled',
  BUDGET_EXHAUSTED: 'pollux.escalation.budget_exhausted',
  DEFERRED_SURFACE: 'pollux.escalation.deferred_surface',
  FAIL_OPEN: 'pollux.escalation.fail_open',
  /**
   * New live-observer reason codes (DETECTOR_IMPLEMENTATION_PLAN §2a.3).
   * Timing metadata lives in {@link POLLUX_ESCALATION_TIMING} and is enforced
   * by invariant I10.
   */
  LIVE_OBSERVER_MATCH: 'pollux.escalation.live_observer_match',
  RISK_GATE_BLOCK: 'pollux.escalation.risk_gate_block',
  HARD_LOOP: 'pollux.escalation.hard_loop',
  SELF_REPORT_STUCK: 'pollux.escalation.self_report_stuck',
  EXECUTOR_ADVISOR_REQUEST: 'pollux.escalation.executor_advisor_request',
  EXECUTOR_CHECKPOINT_REQUEST: 'pollux.escalation.executor_checkpoint_request',
  PRE_MUTATION_REVIEW: 'pollux.escalation.pre_mutation_review',
  FINAL_CONSTRAINT_AUDIT: 'pollux.escalation.final_constraint_audit',
  FUSION_COMPOSITE: 'pollux.escalation.fusion_composite',
  FUSION_COMPOSITE_EMPHATIC: 'pollux.escalation.fusion_composite_emphatic',
  FUSION_BUDGET_TARGET: 'pollux.escalation.fusion_budget_target',
} as const;

export type PolluxEscalationReasonCode =
  (typeof PolluxEscalationReasonCode)[keyof typeof PolluxEscalationReasonCode];

/** Same-turn vs next-turn timing for an escalation (DETECTOR_IMPLEMENTATION_PLAN §2a.3). */
export type PolluxEscalationTiming = 'same_turn' | 'next_turn';

/**
 * Canonical timing for every {@link PolluxEscalationReasonCode}.
 *
 * Invariant I10: every enum value has a key here; exhaustiveness is asserted
 * by a snapshot test in `types.test.ts`.
 */
export const POLLUX_ESCALATION_TIMING: Readonly<
  Record<PolluxEscalationReasonCode, PolluxEscalationTiming>
> = {
  [PolluxEscalationReasonCode.NONE]: 'next_turn',
  [PolluxEscalationReasonCode.CONFIG_DISABLED]: 'next_turn',
  [PolluxEscalationReasonCode.BUDGET_EXHAUSTED]: 'next_turn',
  [PolluxEscalationReasonCode.DEFERRED_SURFACE]: 'next_turn',
  [PolluxEscalationReasonCode.FAIL_OPEN]: 'next_turn',
  [PolluxEscalationReasonCode.LIVE_OBSERVER_MATCH]: 'next_turn',
  [PolluxEscalationReasonCode.RISK_GATE_BLOCK]: 'same_turn',
  [PolluxEscalationReasonCode.HARD_LOOP]: 'same_turn',
  [PolluxEscalationReasonCode.SELF_REPORT_STUCK]: 'same_turn',
  [PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST]: 'same_turn',
  [PolluxEscalationReasonCode.EXECUTOR_CHECKPOINT_REQUEST]: 'same_turn',
  [PolluxEscalationReasonCode.PRE_MUTATION_REVIEW]: 'same_turn',
  [PolluxEscalationReasonCode.FINAL_CONSTRAINT_AUDIT]: 'same_turn',
  [PolluxEscalationReasonCode.FUSION_COMPOSITE]: 'next_turn',
  [PolluxEscalationReasonCode.FUSION_COMPOSITE_EMPHATIC]: 'same_turn',
  [PolluxEscalationReasonCode.FUSION_BUDGET_TARGET]: 'next_turn',
} as const;

/** Lower bound for {@link PolluxExperimentalConfig.advisorRequestTimeoutMs} after merge. */
export const POLLUX_MIN_ADVISOR_TIMEOUT_MS = 1000;

/** Lower bound for per-turn/session advisor call budgets. */
export const POLLUX_MIN_ADVISOR_CALLS = 1;

/**
 * experimental.pollux.* shape (POLLUX_SPEC §8.2).
 * Wired through CLI schema / ConfigParameters in later tasks (P1-03, P1-04).
 */
export interface PolluxExperimentalConfig {
  readonly enabled: boolean;
  readonly executorModel: string;
  readonly advisorModel: string;
  readonly advisorFallbackModel: string | null;
  readonly advisorExecutorProfile: PolluxAdvisorExecutorProfile;
  readonly maxAdvisorCallsPerTurn: number;
  readonly maxAdvisorCallsPerSession: number;
  readonly advisorTriggerMode: PolluxAdvisorTriggerMode;
  readonly advisorBudgetMode: PolluxAdvisorBudgetMode;
  readonly maxAdvisorCallsShortTask: number;
  readonly maxAdvisorCallsLongTask: number;
  readonly longTaskHeuristic: PolluxLongTaskHeuristicConfig;
  readonly advisorShamEnabled: boolean;
  readonly advisorShamGuidance: string;
  readonly emitAdvisorDebug: boolean;
  readonly diagnosticTrace: PolluxDiagnosticTraceConfig;
  readonly executorCheckpoints: PolluxExecutorCheckpointConfig;
  /**
   * Max time to wait for an advisor model response before fail-open (ms).
   * P1-07; enforced by runtime integration in later phases.
   */
  readonly advisorRequestTimeoutMs: number;
  readonly detector: PolluxDetectorConfig;
}

export interface PolluxExecutorCheckpointConfig {
  readonly enabled: boolean;
  readonly requiredReasons: readonly string[];
  readonly enforceRequired: boolean;
  readonly reserveRequiredPrimarySlots: boolean;
  readonly minGuidanceWords: number;
  readonly rejectTruncatedGuidance: boolean;
  readonly requireStructuredGuidance: boolean;
  readonly finalGate: boolean;
}

/** Deep-partial merge input for `experimental.pollux.detector` (settings JSON). */
export type PolluxDetectorConfigMergeInput = Partial<{
  riskGate: Partial<PolluxDetectorConfig['riskGate']>;
  observer: Partial<PolluxDetectorConfig['observer']>;
  selfReport: Partial<PolluxDetectorConfig['selfReport']>;
  fusion: Partial<PolluxDetectorConfig['fusion']>;
  timing: Partial<PolluxDetectorConfig['timing']>;
}>;

/** Merge input for `experimental.pollux` including nested detector overrides. */
export type PolluxExperimentalConfigMergeInput = Partial<
  Omit<
    PolluxExperimentalConfig,
    | 'detector'
    | 'longTaskHeuristic'
    | 'advisorTriggerMode'
    | 'advisorBudgetMode'
    | 'advisorExecutorProfile'
    | 'diagnosticTrace'
  >
> & {
  advisorTriggerMode?: unknown;
  advisorBudgetMode?: unknown;
  advisorExecutorProfile?: unknown;
  detector?: PolluxDetectorConfigMergeInput;
  longTaskHeuristic?: Partial<PolluxLongTaskHeuristicConfig>;
  diagnosticTrace?: Partial<PolluxDiagnosticTraceConfig>;
  executorCheckpoints?: Partial<PolluxExecutorCheckpointConfig>;
};

/**
 * Phase 1 default feature flag: Pollux off for baseline-identical behavior
 * (POLLUX_SPEC §15.1, P0-03 flag-first strategy). Other fields match §8.2
 * illustrative values for stable merge defaults when Pollux is enabled.
 */
export const DEFAULT_POLLUX_EXPERIMENTAL_CONFIG = {
  enabled: false,
  executorModel: 'gemini-2.5-flash',
  advisorModel: 'gemini-3.1-pro-preview',
  advisorFallbackModel: 'gemini-2.5-pro',
  advisorExecutorProfile: 'default',
  maxAdvisorCallsPerTurn: 2,
  maxAdvisorCallsPerSession: 20,
  advisorTriggerMode: 'hybrid',
  advisorBudgetMode: 'adaptive',
  maxAdvisorCallsShortTask: 1,
  maxAdvisorCallsLongTask: 2,
  longTaskHeuristic: {
    minToolCalls: 4,
    minPromptChars: 1200,
    anchoredMutation: true,
  },
  advisorShamEnabled: false,
  advisorShamGuidance:
    '1. Continue with the best supported plan. 2. Verify with the existing oracle.',
  emitAdvisorDebug: false,
  diagnosticTrace: {
    enabled: false,
    outputPath: null,
    includeModelThoughts: 'summary',
    includeAdvisorGuidanceText: false,
    includeExecutorText: true,
    includeToolCalls: true,
    includeToolResults: 'summary',
    includeObserverSignals: true,
    maxTextCharsPerEvent: 4000,
    redactSensitiveText: true,
  },
  executorCheckpoints: {
    enabled: false,
    requiredReasons: [],
    enforceRequired: false,
    reserveRequiredPrimarySlots: false,
    minGuidanceWords: 20,
    rejectTruncatedGuidance: false,
    requireStructuredGuidance: false,
    finalGate: false,
  },
  advisorRequestTimeoutMs: 120_000,
  detector: DEFAULT_POLLUX_DETECTOR_CONFIG,
} as const satisfies PolluxExperimentalConfig;

function mergePolluxDetectorConfig(
  partial: PolluxDetectorConfigMergeInput | undefined,
): PolluxDetectorConfig {
  const d = DEFAULT_POLLUX_DETECTOR_CONFIG;
  const p = partial;
  const risk = p?.riskGate;
  const mode =
    risk?.mode === 'allowlist' || risk?.mode === 'blocklist'
      ? risk.mode
      : d.riskGate.mode;
  const denyPatterns =
    Array.isArray(risk?.denyPatterns) &&
    risk.denyPatterns.every((x) => typeof x === 'string')
      ? Object.freeze([...risk.denyPatterns])
      : d.riskGate.denyPatterns;

  const obs = p?.observer;
  const self = p?.selfReport;
  const fusion = p?.fusion;
  const timing = p?.timing;

  return {
    riskGate: {
      enabled: risk?.enabled ?? d.riskGate.enabled,
      mode,
      denyPatterns,
    },
    observer: {
      enabled: obs?.enabled ?? d.observer.enabled,
      maxThoughtWindowChars: Math.max(
        1024,
        polluxFiniteNumber(
          obs?.maxThoughtWindowChars,
          d.observer.maxThoughtWindowChars,
        ),
      ),
      maxToolEventWindow: Math.max(
        1,
        polluxFiniteNumber(
          obs?.maxToolEventWindow,
          d.observer.maxToolEventWindow,
        ),
      ),
      decayHalfLifeMs: Math.max(
        1000,
        polluxFiniteNumber(obs?.decayHalfLifeMs, d.observer.decayHalfLifeMs),
      ),
    },
    selfReport: {
      enabled: self?.enabled ?? d.selfReport.enabled,
      promptPrimingEnabled:
        self?.promptPrimingEnabled ?? d.selfReport.promptPrimingEnabled,
    },
    fusion: {
      targetEscalationRate: polluxFiniteNumberInRange(
        fusion?.targetEscalationRate,
        d.fusion.targetEscalationRate,
        { min: 0, max: 1 },
      ),
      requireComposite: fusion?.requireComposite ?? d.fusion.requireComposite,
      lowPrecisionFloor: polluxFiniteNumberInRange(
        fusion?.lowPrecisionFloor,
        d.fusion.lowPrecisionFloor,
        { min: 0, max: 1 },
      ),
      sameTurnThresholdMultiplier: Math.max(
        1,
        polluxFiniteNumber(
          fusion?.sameTurnThresholdMultiplier,
          d.fusion.sameTurnThresholdMultiplier,
        ),
      ),
      sameTurnAbsoluteFloor: Math.max(
        POLLUX_MIN_SAME_TURN_ABSOLUTE_FLOOR,
        polluxFiniteNumber(
          fusion?.sameTurnAbsoluteFloor,
          d.fusion.sameTurnAbsoluteFloor,
        ),
      ),
    },
    timing: {
      sameTurnEnabled: timing?.sameTurnEnabled ?? d.timing.sameTurnEnabled,
      maxSameTurnEscalationsPerTurn: Math.max(
        POLLUX_MIN_ADVISOR_CALLS,
        polluxFiniteNumber(
          timing?.maxSameTurnEscalationsPerTurn,
          d.timing.maxSameTurnEscalationsPerTurn,
        ),
      ),
    },
  };
}

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

function mergePolluxDiagnosticTraceConfig(
  partial: Partial<PolluxDiagnosticTraceConfig> | undefined,
): PolluxDiagnosticTraceConfig {
  const d = DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.diagnosticTrace;
  const includeModelThoughts =
    partial?.includeModelThoughts === 'raw_model_exposed' ||
    partial?.includeModelThoughts === 'summary'
      ? partial.includeModelThoughts
      : d.includeModelThoughts;
  const includeToolResults =
    partial?.includeToolResults === 'none' ||
    partial?.includeToolResults === 'summary' ||
    partial?.includeToolResults === 'snippet'
      ? partial.includeToolResults
      : d.includeToolResults;

  return {
    enabled: partial?.enabled ?? d.enabled,
    outputPath:
      typeof partial?.outputPath === 'string' &&
      partial.outputPath.trim().length > 0
        ? partial.outputPath
        : d.outputPath,
    includeModelThoughts,
    includeAdvisorGuidanceText:
      partial?.includeAdvisorGuidanceText ?? d.includeAdvisorGuidanceText,
    includeExecutorText: partial?.includeExecutorText ?? d.includeExecutorText,
    includeToolCalls: partial?.includeToolCalls ?? d.includeToolCalls,
    includeToolResults,
    includeObserverSignals:
      partial?.includeObserverSignals ?? d.includeObserverSignals,
    maxTextCharsPerEvent: polluxFiniteNumberInRange(
      partial?.maxTextCharsPerEvent,
      d.maxTextCharsPerEvent,
      { min: 128, max: 64_000 },
    ),
    redactSensitiveText: partial?.redactSensitiveText ?? d.redactSensitiveText,
  };
}

/**
 * Merge CLI/settings partial values with Pollux defaults (P1-04, P0-03).
 * Unknown / non-finite numeric fields fall back to defaults. Numeric fields
 * with policy-safety ranges are clamped to safe bounds. Legacy detector
 * surface keys removed in Phase I are silently ignored — they are not part
 * of `PolluxExperimentalConfigMergeInput` and never reach this merger.
 */
export function mergePolluxExperimentalConfig(
  partial?: PolluxExperimentalConfigMergeInput | undefined,
): PolluxExperimentalConfig {
  const d = DEFAULT_POLLUX_EXPERIMENTAL_CONFIG;
  const executorModel = partial?.executorModel ?? d.executorModel;
  const advisorExecutorProfile =
    partial?.advisorExecutorProfile === 'default' ||
    partial?.advisorExecutorProfile === 'flash_lite' ||
    partial?.advisorExecutorProfile === 'strict_fd'
      ? partial.advisorExecutorProfile
      : executorModel.toLowerCase().includes('flash-lite')
        ? 'flash_lite'
        : d.advisorExecutorProfile;

  return {
    enabled: partial?.enabled ?? d.enabled,
    executorModel,
    advisorModel: partial?.advisorModel ?? d.advisorModel,
    advisorFallbackModel:
      partial?.advisorFallbackModel === undefined
        ? d.advisorFallbackModel
        : partial.advisorFallbackModel,
    advisorExecutorProfile,
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
    advisorTriggerMode:
      partial?.advisorTriggerMode === 'executor_request' ||
      partial?.advisorTriggerMode === 'detector' ||
      partial?.advisorTriggerMode === 'hybrid'
        ? partial.advisorTriggerMode
        : d.advisorTriggerMode,
    advisorBudgetMode:
      partial?.advisorBudgetMode === 'fixed' ||
      partial?.advisorBudgetMode === 'adaptive'
        ? partial.advisorBudgetMode
        : d.advisorBudgetMode,
    maxAdvisorCallsShortTask: polluxFiniteNumberInRange(
      partial?.maxAdvisorCallsShortTask,
      d.maxAdvisorCallsShortTask,
      { min: POLLUX_MIN_ADVISOR_CALLS },
    ),
    maxAdvisorCallsLongTask: polluxFiniteNumberInRange(
      partial?.maxAdvisorCallsLongTask,
      d.maxAdvisorCallsLongTask,
      { min: POLLUX_MIN_ADVISOR_CALLS },
    ),
    longTaskHeuristic: {
      minToolCalls: polluxFiniteNumberInRange(
        partial?.longTaskHeuristic?.minToolCalls,
        d.longTaskHeuristic.minToolCalls,
        { min: 1 },
      ),
      minPromptChars: polluxFiniteNumberInRange(
        partial?.longTaskHeuristic?.minPromptChars,
        d.longTaskHeuristic.minPromptChars,
        { min: 1 },
      ),
      anchoredMutation:
        partial?.longTaskHeuristic?.anchoredMutation ??
        d.longTaskHeuristic.anchoredMutation,
    },
    advisorShamEnabled: partial?.advisorShamEnabled ?? d.advisorShamEnabled,
    advisorShamGuidance:
      typeof partial?.advisorShamGuidance === 'string' &&
      partial.advisorShamGuidance.trim().length > 0
        ? partial.advisorShamGuidance
        : d.advisorShamGuidance,
    emitAdvisorDebug: partial?.emitAdvisorDebug ?? d.emitAdvisorDebug,
    diagnosticTrace: mergePolluxDiagnosticTraceConfig(partial?.diagnosticTrace),
    executorCheckpoints: {
      enabled:
        partial?.executorCheckpoints?.enabled ?? d.executorCheckpoints.enabled,
      requiredReasons: Array.isArray(
        partial?.executorCheckpoints?.requiredReasons,
      )
        ? partial.executorCheckpoints.requiredReasons.filter(
            (reason): reason is string =>
              typeof reason === 'string' && reason.trim().length > 0,
          )
        : d.executorCheckpoints.requiredReasons,
      enforceRequired:
        partial?.executorCheckpoints?.enforceRequired ??
        d.executorCheckpoints.enforceRequired,
      reserveRequiredPrimarySlots:
        partial?.executorCheckpoints?.reserveRequiredPrimarySlots ??
        d.executorCheckpoints.reserveRequiredPrimarySlots,
      minGuidanceWords: polluxFiniteNumberInRange(
        partial?.executorCheckpoints?.minGuidanceWords,
        d.executorCheckpoints.minGuidanceWords,
        { min: 1 },
      ),
      rejectTruncatedGuidance:
        partial?.executorCheckpoints?.rejectTruncatedGuidance ??
        d.executorCheckpoints.rejectTruncatedGuidance,
      requireStructuredGuidance:
        partial?.executorCheckpoints?.requireStructuredGuidance ??
        d.executorCheckpoints.requireStructuredGuidance,
      finalGate:
        partial?.executorCheckpoints?.finalGate ??
        d.executorCheckpoints.finalGate,
    },
    advisorRequestTimeoutMs: Math.max(
      POLLUX_MIN_ADVISOR_TIMEOUT_MS,
      polluxFiniteNumber(
        partial?.advisorRequestTimeoutMs,
        d.advisorRequestTimeoutMs,
      ),
    ),
    detector: mergePolluxDetectorConfig(partial?.detector),
  };
}

/**
 * Maximum characters included in `PolluxTurnContext.userContentDigest` and
 * `PolluxTurnContext.pendingToolContext`.
 *
 * The redesigned detector is observer-backed, but advisor prompts still benefit
 * from a bounded, stable digest of the user's request and pending tool context.
 */
export const POLLUX_TURN_DIGEST_MAX_CHARS = 4096;

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
  /** Prompt contract variant for the stronger advisor. */
  readonly mode?: AdvisorConsultationMode;
  /** Executor-specific contract variant for shaping advisor output. */
  readonly advisorExecutorProfile?: PolluxAdvisorExecutorProfile;
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
