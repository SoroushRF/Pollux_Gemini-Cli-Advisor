/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Heuristic escalation detector (POLLUX_SPEC §7.1 strategy 1 / §7.2 detector
 * properties / §7.4 baseline purity / P3-01).
 *
 * Design constraints from the spec and Phase 2 guardrails:
 *
 *   1. Pure and synchronous at evaluation time. The detector MUST NOT perform
 *      any I/O or LLM call. The `shouldEscalate` return is wrapped in a
 *      `Promise.resolve` only to satisfy the `PolluxDetector` interface; there
 *      is no asynchronous work.
 *   2. Deterministic: same input ⇒ same output. Matched rule ids and the total
 *      score are exposed verbatim so hybrid precedence (P3-03) and calibration
 *      (P3-05) can reason about decisions without re-running the detector.
 *   3. Reason codes come from `PolluxEscalationReasonCode` only — no ad-hoc
 *      strings. Each early-exit gate maps to a specific code.
 *   4. Baseline purity: when `experimental.enabled=false` OR the surface is
 *      the deferred A2A surface, the detector returns `{escalate:false}` with
 *      no rule evaluation. This preserves Pollux-off observable behavior and
 *      the P2-06 deferred-bypass contract.
 *   5. Budget-aware: exhausted per-turn / per-session budgets short-circuit
 *      evaluation to keep detector output consistent with
 *      `checkAdvisorInvocationBudget` (P1-07 / safeguards.ts).
 *   6. Explicit false-positive and false-negative coverage lives in
 *      `detector.test.ts`.
 *
 * Rule tuning, calibration sets, and threshold sweeps are intentionally out
 * of scope for P3-01 and are handled by P3-05.
 */

import type {
  PolluxDetector,
  PolluxTurnContext,
  ShouldEscalateResult,
} from './types.js';
import {
  PolluxDetectorStrategy,
  PolluxEscalationReasonCode,
  POLLUX_MAX_CONFIDENCE_THRESHOLD,
  POLLUX_MIN_CONFIDENCE_THRESHOLD,
  PolluxRuntimeSurface,
} from './types.js';
import {
  extractPolluxConfidenceTagValues,
  stripPolluxConfidenceTags,
} from './prompts.js';
import { checkAdvisorInvocationBudget } from './safeguards.js';

const CONFIDENCE_COMMENT_ANY_RE = /<!--\s*pollux:confidence:[\s\S]*?-->/gi;
const CONFIDENCE_XML_ANY_RE = /<\/?pollux:confidence\b[^>]*\/?\s*>/gi;

/**
 * Field of {@link PolluxTurnContext} a heuristic rule inspects.
 *
 *   - `'user'`: the bounded `userContentDigest` produced by the caller.
 *   - `'tool'`: the bounded `pendingToolContext` produced by the caller.
 *   - `'both'`: either field — the rule matches if its regex matches in
 *     at least one field.
 */
export type HeuristicRuleField = 'user' | 'tool' | 'both';

/**
 * Single deterministic heuristic rule. The regex is evaluated against the
 * digest/tool-context strings after they have been length-bounded by the
 * detector (see {@link DETECTOR_MAX_FIELD_LENGTH}). Rules MUST be `/i` and
 * MUST NOT use the `/g` flag because the detector consumes only a boolean
 * `test()` result per rule.
 */
export interface HeuristicSignalRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly weight: number;
  readonly field: HeuristicRuleField;
  readonly description: string;
}

/** Evaluation breakdown exposed for tests and for P3-05 calibration work. */
export interface HeuristicEvaluation {
  readonly score: number;
  readonly matchedRuleIds: readonly string[];
}

/**
 * Output of structured confidence extraction.
 *
 * `structuredConfidence` is present only when at least one valid (1-10)
 * confidence tag was found. Both text fields are always returned in stripped
 * form so tag markers can never leak to downstream callers.
 */
export interface StructuredConfidenceEvaluation {
  readonly structuredConfidence?: number;
  readonly strippedUserContentDigest: string;
  readonly strippedPendingToolContext: string;
}

/** Maximum characters inspected per field, regardless of caller digest size. */
export const DETECTOR_MAX_FIELD_LENGTH = 4096;

/** Minimum score required for the heuristic detector to escalate by default. */
export const DEFAULT_HEURISTIC_MIN_SCORE = 2;

/**
 * Default heuristic signal rule set.
 *
 * The rule set is intentionally small and conservative. Each rule has a short
 * id so matched rules can be logged deterministically (P3-05 calibration) and
 * asserted from tests. Weights are chosen so that:
 *
 *   - A single high-signal rule (`EXPLICIT_BLOCKED`, `ERROR_MARKER`,
 *     `RETRY_LOOP`) reaches the default `minScore` of 2 on its own.
 *   - Multiple weak keywords (help request plus complexity) can accumulate to
 *     the threshold without a high-signal hit.
 *   - Isolated neutral language ("write a function", "explain this pattern")
 *     does not cross the threshold — verified by the false-positive tests.
 */
export const DEFAULT_HEURISTIC_RULES: readonly HeuristicSignalRule[] = [
  {
    id: 'EXPLICIT_BLOCKED',
    pattern:
      /\b(?:stuck|blocked|unable to (?:proceed|fix|resolve)|cannot (?:figure out|resolve|fix)|can't (?:figure out|resolve|fix))\b/i,
    weight: 2,
    field: 'both',
    description:
      'Explicit mention of being stuck/blocked on the task or unable to resolve a failure.',
  },
  {
    id: 'HELP_REQUEST',
    pattern:
      /\b(?:please help|help me (?:debug|fix|with)|need (?:help|advice))\b/i,
    weight: 1,
    field: 'user',
    description:
      'Explicit help request phrased as a direct appeal from the user.',
  },
  {
    id: 'COMPLEXITY',
    pattern:
      /\b(?:refactor|architecture|design decision|trade-?offs?|strategy|plan)\b/i,
    weight: 1,
    field: 'user',
    description:
      'Architectural or strategic vocabulary suggesting multi-step reasoning.',
  },
  {
    id: 'DEBUG_INTENT',
    pattern:
      /\b(?:debug|trace|stack\s*trace|root cause|why (?:is|does) (?:this|it) (?:fail|failing|break|broken))\b/i,
    weight: 1,
    field: 'user',
    description: 'User language indicating an active debugging session.',
  },
  {
    id: 'ERROR_MARKER',
    pattern: /(?:error:|exception\b|stderr\b|traceback\b|exit code\s*[1-9])/i,
    weight: 2,
    field: 'tool',
    description:
      'Error output captured from the prior tool run (non-zero exit, exception, etc.).',
  },
  {
    id: 'RETRY_LOOP',
    pattern:
      /\b(?:tried (?:again|multiple|several)|keeps failing|same error|still (?:broken|not working|fails))\b/i,
    weight: 2,
    field: 'both',
    description:
      'Signals a repeated failure loop where the executor should consider escalating.',
  },
];

/** Options accepted by {@link createHeuristicDetector}. */
export interface HeuristicDetectorOptions {
  /** Minimum accumulated score (inclusive) to escalate. */
  readonly minScore?: number;
  /** Override rule set. When omitted, {@link DEFAULT_HEURISTIC_RULES} is used. */
  readonly rules?: readonly HeuristicSignalRule[];
  /** Override per-field clamp. Primarily for tests. */
  readonly maxFieldLength?: number;
}

/** Resolved detector options after defaults have been applied. */
export interface ResolvedHeuristicDetectorOptions {
  readonly minScore: number;
  readonly rules: readonly HeuristicSignalRule[];
  readonly maxFieldLength: number;
}

/** Options accepted by {@link createStructuredDetector}. */
export interface StructuredDetectorOptions {
  /** Override per-field clamp. Primarily for tests. */
  readonly maxFieldLength?: number;
}

interface ResolvedStructuredDetectorOptions {
  readonly maxFieldLength: number;
}

function resolveFiniteInt(
  value: number | undefined,
  fallback: number,
  minimum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.floor(value));
}

function resolveOptions(
  options?: HeuristicDetectorOptions,
): ResolvedHeuristicDetectorOptions {
  const minScore = resolveFiniteInt(
    options?.minScore,
    DEFAULT_HEURISTIC_MIN_SCORE,
    1,
  );
  const rules =
    options?.rules && options.rules.length > 0
      ? options.rules
      : DEFAULT_HEURISTIC_RULES;
  const maxFieldLength = resolveFiniteInt(
    options?.maxFieldLength,
    DETECTOR_MAX_FIELD_LENGTH,
    1,
  );
  return { minScore, rules, maxFieldLength };
}

function resolveStructuredOptions(
  options?: StructuredDetectorOptions,
): ResolvedStructuredDetectorOptions {
  return {
    maxFieldLength: resolveFiniteInt(
      options?.maxFieldLength,
      DETECTOR_MAX_FIELD_LENGTH,
      1,
    ),
  };
}

function clamp(value: string | undefined, maxLength: number): string {
  if (!value) {
    return '';
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function clampStructuredConfidence(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (
    rounded < POLLUX_MIN_CONFIDENCE_THRESHOLD ||
    rounded > POLLUX_MAX_CONFIDENCE_THRESHOLD
  ) {
    return undefined;
  }
  return rounded;
}

function resolveStructuredThreshold(rawThreshold: number): number {
  const threshold = resolveFiniteInt(
    rawThreshold,
    POLLUX_MIN_CONFIDENCE_THRESHOLD,
    POLLUX_MIN_CONFIDENCE_THRESHOLD,
  );
  return Math.min(POLLUX_MAX_CONFIDENCE_THRESHOLD, threshold);
}

function stripStructuredConfidenceTags(value: string): string {
  return stripPolluxConfidenceTags(value)
    .replace(CONFIDENCE_COMMENT_ANY_RE, '')
    .replace(CONFIDENCE_XML_ANY_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function firstStructuredConfidence(
  values: readonly number[],
): number | undefined {
  for (const value of values) {
    const bounded = clampStructuredConfidence(value);
    if (bounded !== undefined) {
      return bounded;
    }
  }
  return undefined;
}

/**
 * Runs the default (or provided) rule set against the bounded digest / tool
 * context. Returns an evaluation breakdown even when the score is zero so
 * that calibration tooling (P3-05) can compare rule-match distributions.
 *
 * Pure: no side effects and no I/O. Each rule is tested with `RegExp#test`.
 */
export function evaluateHeuristicSignals(
  context: PolluxTurnContext,
  options?: HeuristicDetectorOptions,
): HeuristicEvaluation {
  const resolved = resolveOptions(options);
  const user = clamp(context.userContentDigest, resolved.maxFieldLength);
  const tool = clamp(context.pendingToolContext, resolved.maxFieldLength);

  if (user.length === 0 && tool.length === 0) {
    return { score: 0, matchedRuleIds: [] };
  }

  let score = 0;
  const matched: string[] = [];
  for (const rule of resolved.rules) {
    let hit = false;
    try {
      if (rule.field === 'user' || rule.field === 'both') {
        if (user.length > 0 && rule.pattern.test(user)) {
          hit = true;
        }
      }
      if (
        !hit &&
        (rule.field === 'tool' || rule.field === 'both') &&
        tool.length > 0 &&
        rule.pattern.test(tool)
      ) {
        hit = true;
      }
    } catch {
      // Defensive: a malformed regex must not throw out of the detector. Fail
      // closed for that single rule (do not escalate on a broken pattern).
      hit = false;
    }
    if (hit) {
      score += rule.weight;
      matched.push(rule.id);
    }
  }
  return { score, matchedRuleIds: matched };
}

function disabled(
  code:
    | typeof PolluxEscalationReasonCode.CONFIG_DISABLED
    | typeof PolluxEscalationReasonCode.DEFERRED_SURFACE
    | typeof PolluxEscalationReasonCode.BUDGET_EXHAUSTED
    | typeof PolluxEscalationReasonCode.NONE,
  strategy: PolluxDetectorStrategy,
  structuredConfidence?: number,
): ShouldEscalateResult {
  if (structuredConfidence !== undefined) {
    return {
      escalate: false,
      reasonCode: code,
      strategy,
      structuredConfidence,
    };
  }
  return {
    escalate: false,
    reasonCode: code,
    strategy,
  };
}

/**
 * Gate evaluation shared by {@link createHeuristicDetector} and consumers
 * (e.g. the hybrid detector in P3-03) that need to know whether the heuristic
 * path is eligible on a given turn without running rule evaluation.
 */
export function isHeuristicPathEligible(
  context: PolluxTurnContext,
): ShouldEscalateResult | null {
  if (!context.experimental.enabled) {
    return disabled(
      PolluxEscalationReasonCode.CONFIG_DISABLED,
      PolluxDetectorStrategy.HEURISTIC,
    );
  }
  if (context.surface === PolluxRuntimeSurface.A2A_DEFERRED) {
    return disabled(
      PolluxEscalationReasonCode.DEFERRED_SURFACE,
      PolluxDetectorStrategy.HEURISTIC,
    );
  }
  if (context.experimental.strategy === PolluxDetectorStrategy.STRUCTURED) {
    // The heuristic detector is not the active strategy; return a non-match
    // with the NONE code so callers can compose it with the structured path
    // (P3-02/P3-03) without misreporting a disabled state.
    return disabled(
      PolluxEscalationReasonCode.NONE,
      PolluxDetectorStrategy.HEURISTIC,
    );
  }
  const budget = checkAdvisorInvocationBudget(context.experimental, {
    callsCompletedThisTurn: context.advisorCallsThisTurn,
    callsCompletedThisSession: context.advisorCallsThisSession,
  });
  if (!budget.allowed) {
    return disabled(budget.reasonCode, PolluxDetectorStrategy.HEURISTIC);
  }
  return null;
}

/**
 * Evaluates structured confidence tags from bounded context fields.
 *
 * Extraction order is deterministic and stable:
 *
 *   1. `userContentDigest` tags in appearance order.
 *   2. `pendingToolContext` tags in appearance order.
 *
 * Missing or malformed tags fail-open by returning
 * `structuredConfidence: undefined`.
 */
export function evaluateStructuredConfidenceSignal(
  context: PolluxTurnContext,
  options?: StructuredDetectorOptions,
): StructuredConfidenceEvaluation {
  const resolved = resolveStructuredOptions(options);
  const userRaw = clamp(context.userContentDigest, resolved.maxFieldLength);
  const toolRaw = clamp(context.pendingToolContext, resolved.maxFieldLength);

  const strippedUserContentDigest = stripStructuredConfidenceTags(userRaw);
  const strippedPendingToolContext = stripStructuredConfidenceTags(toolRaw);

  const structuredConfidence = firstStructuredConfidence([
    ...extractPolluxConfidenceTagValues(userRaw),
    ...extractPolluxConfidenceTagValues(toolRaw),
  ]);

  return {
    structuredConfidence,
    strippedUserContentDigest,
    strippedPendingToolContext,
  };
}

/**
 * Gate evaluation for the structured detector path.
 *
 * Returns `null` when the path is eligible. Returns a deterministic disabled
 * result when Pollux is off, runtime surface is out of scope, budget is
 * exhausted, or heuristic-only mode is active.
 */
export function isStructuredPathEligible(
  context: PolluxTurnContext,
): ShouldEscalateResult | null {
  if (!context.experimental.enabled) {
    return disabled(
      PolluxEscalationReasonCode.CONFIG_DISABLED,
      PolluxDetectorStrategy.STRUCTURED,
    );
  }
  if (context.surface === PolluxRuntimeSurface.A2A_DEFERRED) {
    return disabled(
      PolluxEscalationReasonCode.DEFERRED_SURFACE,
      PolluxDetectorStrategy.STRUCTURED,
    );
  }
  if (context.experimental.strategy === PolluxDetectorStrategy.HEURISTIC) {
    // The structured detector is not the active strategy; return a non-match
    // so hybrid composition can evaluate this path explicitly (P3-03).
    return disabled(
      PolluxEscalationReasonCode.NONE,
      PolluxDetectorStrategy.STRUCTURED,
    );
  }
  const budget = checkAdvisorInvocationBudget(context.experimental, {
    callsCompletedThisTurn: context.advisorCallsThisTurn,
    callsCompletedThisSession: context.advisorCallsThisSession,
  });
  if (!budget.allowed) {
    return disabled(budget.reasonCode, PolluxDetectorStrategy.STRUCTURED);
  }
  return null;
}

/**
 * Factory for the structured detector (POLLUX_SPEC §7.1 strategy 2).
 *
 * The detector extracts confidence tags and strips them from bounded context
 * fields without mutating caller input. Escalation occurs only when a valid
 * confidence value exists and meets the configured threshold.
 */
export function createStructuredDetector(
  options?: StructuredDetectorOptions,
): PolluxDetector {
  const resolved = resolveStructuredOptions(options);
  return {
    async shouldEscalate(
      context: PolluxTurnContext,
    ): Promise<ShouldEscalateResult> {
      const gate = isStructuredPathEligible(context);
      if (gate !== null) {
        return gate;
      }

      const evaluation = evaluateStructuredConfidenceSignal(context, resolved);
      if (evaluation.structuredConfidence === undefined) {
        return disabled(
          PolluxEscalationReasonCode.NONE,
          PolluxDetectorStrategy.STRUCTURED,
        );
      }

      const threshold = resolveStructuredThreshold(
        context.experimental.confidenceThreshold,
      );
      if (evaluation.structuredConfidence >= threshold) {
        return {
          escalate: true,
          reasonCode: PolluxEscalationReasonCode.STRUCTURED_TAG,
          strategy: PolluxDetectorStrategy.STRUCTURED,
          structuredConfidence: evaluation.structuredConfidence,
        };
      }

      return disabled(
        PolluxEscalationReasonCode.NONE,
        PolluxDetectorStrategy.STRUCTURED,
        evaluation.structuredConfidence,
      );
    },
  };
}

/**
 * Factory for the heuristic detector (POLLUX_SPEC §7.1).
 *
 * The returned object implements the {@link PolluxDetector} contract. All
 * branches return a deterministic {@link ShouldEscalateResult} whose
 * `strategy` is always `HEURISTIC`.
 */
export function createHeuristicDetector(
  options?: HeuristicDetectorOptions,
): PolluxDetector {
  const resolved = resolveOptions(options);
  return {
    async shouldEscalate(
      context: PolluxTurnContext,
    ): Promise<ShouldEscalateResult> {
      const gate = isHeuristicPathEligible(context);
      if (gate !== null) {
        return gate;
      }
      const evaluation = evaluateHeuristicSignals(context, resolved);
      if (evaluation.score >= resolved.minScore) {
        return {
          escalate: true,
          reasonCode: PolluxEscalationReasonCode.HEURISTIC_MATCH,
          strategy: PolluxDetectorStrategy.HEURISTIC,
        };
      }
      return disabled(
        PolluxEscalationReasonCode.NONE,
        PolluxDetectorStrategy.HEURISTIC,
      );
    },
  };
}
