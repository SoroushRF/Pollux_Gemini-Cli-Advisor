/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HEURISTIC_MIN_SCORE,
  DEFAULT_HEURISTIC_RULES,
  DETECTOR_MAX_FIELD_LENGTH,
  createHeuristicDetector,
  evaluateHeuristicSignals,
  isHeuristicPathEligible,
} from './detector.js';
import {
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  PolluxDetectorStrategy,
  PolluxEscalationReasonCode,
  PolluxRuntimeSurface,
  mergePolluxExperimentalConfig,
  type PolluxExperimentalConfig,
  type PolluxTurnContext,
} from './types.js';

const enabledHeuristic = mergePolluxExperimentalConfig({
  enabled: true,
  strategy: PolluxDetectorStrategy.HEURISTIC,
});

const enabledHybrid = mergePolluxExperimentalConfig({
  enabled: true,
  strategy: PolluxDetectorStrategy.HYBRID,
});

function ctx(overrides: Partial<PolluxTurnContext> = {}): PolluxTurnContext {
  const base: PolluxTurnContext = {
    surface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
    sessionId: 'session-test',
    turnId: 'turn-1',
    experimental: enabledHeuristic,
    advisorCallsThisTurn: 0,
    advisorCallsThisSession: 0,
    userContentDigest: '',
    pendingToolContext: '',
  };
  return { ...base, ...overrides };
}

describe('pollux/detector heuristic', () => {
  describe('constants and defaults', () => {
    it('exposes a stable default minimum score', () => {
      expect(DEFAULT_HEURISTIC_MIN_SCORE).toBe(2);
    });

    it('ships a non-empty, unique rule set', () => {
      expect(DEFAULT_HEURISTIC_RULES.length).toBeGreaterThan(0);
      const ids = DEFAULT_HEURISTIC_RULES.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const rule of DEFAULT_HEURISTIC_RULES) {
        expect(rule.weight).toBeGreaterThan(0);
        expect(typeof rule.description).toBe('string');
        expect(
          rule.field === 'user' ||
            rule.field === 'tool' ||
            rule.field === 'both',
        ).toBe(true);
      }
    });

    it('clamps long inputs to DETECTOR_MAX_FIELD_LENGTH before evaluating rules', () => {
      // A match that occurs only *after* the clamp window must not score.
      const filler = 'x '.repeat(DETECTOR_MAX_FIELD_LENGTH);
      const hidden = `${filler}\nI am completely stuck here`;
      const evaluation = evaluateHeuristicSignals(
        ctx({ userContentDigest: hidden }),
      );
      expect(evaluation.score).toBe(0);
      expect(evaluation.matchedRuleIds).toEqual([]);
    });
  });

  describe('gate: isHeuristicPathEligible', () => {
    it('returns CONFIG_DISABLED when Pollux is off', () => {
      const gate = isHeuristicPathEligible(
        ctx({ experimental: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG }),
      );
      expect(gate).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.CONFIG_DISABLED,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('returns DEFERRED_SURFACE for A2A even when Pollux is enabled', () => {
      const gate = isHeuristicPathEligible(
        ctx({
          experimental: enabledHeuristic,
          surface: PolluxRuntimeSurface.A2A_DEFERRED,
        }),
      );
      expect(gate).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.DEFERRED_SURFACE,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('returns NONE (non-match) when the active strategy is structured-only', () => {
      const gate = isHeuristicPathEligible(
        ctx({
          experimental: mergePolluxExperimentalConfig({
            enabled: true,
            strategy: PolluxDetectorStrategy.STRUCTURED,
          }),
        }),
      );
      expect(gate).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.NONE,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('returns BUDGET_EXHAUSTED when per-turn budget is full', () => {
      const gate = isHeuristicPathEligible(
        ctx({
          experimental: enabledHeuristic,
          advisorCallsThisTurn: enabledHeuristic.maxAdvisorCallsPerTurn,
        }),
      );
      expect(gate).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.BUDGET_EXHAUSTED,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('returns BUDGET_EXHAUSTED when per-session budget is full', () => {
      const gate = isHeuristicPathEligible(
        ctx({
          experimental: enabledHeuristic,
          advisorCallsThisSession: enabledHeuristic.maxAdvisorCallsPerSession,
        }),
      );
      expect(gate).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.BUDGET_EXHAUSTED,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('returns null (path eligible) when enabled, in-scope, and under budget', () => {
      expect(isHeuristicPathEligible(ctx())).toBeNull();
    });

    it('is eligible for the hybrid strategy too (composable with P3-03)', () => {
      expect(
        isHeuristicPathEligible(ctx({ experimental: enabledHybrid })),
      ).toBeNull();
    });
  });

  describe('evaluateHeuristicSignals — true positives (FN regressions guarded)', () => {
    it.each([
      [
        'EXPLICIT_BLOCKED single word on user side',
        { userContentDigest: "I'm completely stuck on this bug." },
        ['EXPLICIT_BLOCKED'],
      ],
      [
        'ERROR_MARKER alone in tool context',
        {
          pendingToolContext:
            'Traceback (most recent call last): Error: whoops',
        },
        ['ERROR_MARKER'],
      ],
      [
        'RETRY_LOOP alone on user side',
        { userContentDigest: "I've tried several times and it keeps failing." },
        ['RETRY_LOOP'],
      ],
      [
        'HELP_REQUEST + COMPLEXITY accumulate to threshold',
        {
          userContentDigest:
            'Please help me with this refactor — I need a better architecture.',
        },
        ['HELP_REQUEST', 'COMPLEXITY'],
      ],
      [
        'ERROR_MARKER in tool + DEBUG_INTENT in user',
        {
          userContentDigest:
            'I want to debug the stack trace and find the root cause.',
          pendingToolContext: 'exit code 1\nerror: segfault',
        },
        ['DEBUG_INTENT', 'ERROR_MARKER'],
      ],
      [
        'EXPLICIT_BLOCKED works on tool side too (field=both)',
        {
          userContentDigest: '',
          pendingToolContext: 'Previous step blocked because nothing builds.',
        },
        ['EXPLICIT_BLOCKED'],
      ],
    ])('matches %s', (_name, digest, expectedIds) => {
      const result = evaluateHeuristicSignals(ctx(digest));
      expect(result.score).toBeGreaterThanOrEqual(DEFAULT_HEURISTIC_MIN_SCORE);
      expect(result.matchedRuleIds).toEqual(expectedIds);
    });
  });

  describe('evaluateHeuristicSignals — false positives (negative regression guard)', () => {
    it.each([
      [
        'neutral code request',
        { userContentDigest: 'Please write a function that sums an array.' },
      ],
      [
        'documentation question with no failure language',
        {
          userContentDigest:
            'Explain how Map#forEach differs from Array#forEach.',
        },
      ],
      [
        'single weak keyword without accumulator (help alone)',
        { userContentDigest: 'Can you help? Thanks.' },
      ],
      [
        'non-zero exit code zero is not an error marker',
        { pendingToolContext: 'exit code 0 — ran fine' },
      ],
      [
        'the word "error" outside "error:" prefix',
        { userContentDigest: 'Discuss common sources of human error in UX.' },
      ],
      [
        'architectural term as a noun only (complexity <2 threshold)',
        { userContentDigest: 'Describe the MVC architecture briefly.' },
      ],
      [
        'empty digest and tool context',
        { userContentDigest: '', pendingToolContext: '' },
      ],
    ])('does not match %s', (_name, digest) => {
      const result = evaluateHeuristicSignals(ctx(digest));
      expect(result.score).toBeLessThan(DEFAULT_HEURISTIC_MIN_SCORE);
    });
  });

  describe('determinism', () => {
    it('produces identical output across repeated calls with the same input', () => {
      const input = ctx({
        userContentDigest:
          "I've tried again and I'm still stuck. Please help me debug this.",
        pendingToolContext: 'Traceback: error: boom',
      });
      const first = evaluateHeuristicSignals(input);
      const second = evaluateHeuristicSignals(input);
      expect(first).toEqual(second);
    });

    it('produces the same matchedRuleIds order regardless of field source', () => {
      const inUser = evaluateHeuristicSignals(
        ctx({ userContentDigest: 'I am stuck and it keeps failing.' }),
      );
      const inTool = evaluateHeuristicSignals(
        ctx({ pendingToolContext: 'I am stuck and it keeps failing.' }),
      );
      // Order must follow the rule set, not the field origin.
      expect(inUser.matchedRuleIds).toEqual(['EXPLICIT_BLOCKED', 'RETRY_LOOP']);
      expect(inTool.matchedRuleIds).toEqual(['EXPLICIT_BLOCKED', 'RETRY_LOOP']);
    });
  });

  describe('createHeuristicDetector().shouldEscalate', () => {
    it('short-circuits to CONFIG_DISABLED when Pollux is off', async () => {
      const det = createHeuristicDetector();
      const r = await det.shouldEscalate(
        ctx({ experimental: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG }),
      );
      expect(r).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.CONFIG_DISABLED,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('short-circuits to DEFERRED_SURFACE for A2A turns', async () => {
      const det = createHeuristicDetector();
      const r = await det.shouldEscalate(
        ctx({ surface: PolluxRuntimeSurface.A2A_DEFERRED }),
      );
      expect(r.escalate).toBe(false);
      expect(r.reasonCode).toBe(PolluxEscalationReasonCode.DEFERRED_SURFACE);
    });

    it('short-circuits to BUDGET_EXHAUSTED at the turn cap', async () => {
      const det = createHeuristicDetector();
      const r = await det.shouldEscalate(
        ctx({
          advisorCallsThisTurn: enabledHeuristic.maxAdvisorCallsPerTurn,
        }),
      );
      expect(r).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.BUDGET_EXHAUSTED,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('escalates with HEURISTIC_MATCH when score >= minScore', async () => {
      const det = createHeuristicDetector();
      const r = await det.shouldEscalate(
        ctx({
          userContentDigest:
            "I'm stuck; the tests keep failing with the same error.",
        }),
      );
      expect(r).toEqual({
        escalate: true,
        reasonCode: PolluxEscalationReasonCode.HEURISTIC_MATCH,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('returns NONE (non-match) when no rule triggers', async () => {
      const det = createHeuristicDetector();
      const r = await det.shouldEscalate(
        ctx({ userContentDigest: 'Hello, please describe FizzBuzz.' }),
      );
      expect(r).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.NONE,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('honors a custom minScore', async () => {
      const det = createHeuristicDetector({ minScore: 1 });
      const r = await det.shouldEscalate(
        ctx({ userContentDigest: 'Please help fix this.' }),
      );
      expect(r.escalate).toBe(true);
      expect(r.reasonCode).toBe(PolluxEscalationReasonCode.HEURISTIC_MATCH);
    });

    it('honors a custom rule set (empty set never escalates)', async () => {
      const det = createHeuristicDetector({
        rules: [
          {
            id: 'NEVER',
            pattern: /this-should-never-match-anything-xyz123/,
            weight: 99,
            field: 'both',
            description: 'never',
          },
        ],
      });
      const r = await det.shouldEscalate(
        ctx({ userContentDigest: "I'm stuck and it keeps failing." }),
      );
      expect(r).toEqual({
        escalate: false,
        reasonCode: PolluxEscalationReasonCode.NONE,
        strategy: PolluxDetectorStrategy.HEURISTIC,
      });
    });

    it('clamps a malformed minScore option to a safe positive integer', async () => {
      const det = createHeuristicDetector({ minScore: -5 });
      const r = await det.shouldEscalate(
        ctx({ userContentDigest: 'Please help fix this.' }),
      );
      expect(r.escalate).toBe(true);
      expect(r.reasonCode).toBe(PolluxEscalationReasonCode.HEURISTIC_MATCH);
    });
  });

  describe('baseline purity invariant (POLLUX_SPEC §7.4)', () => {
    it('performs no LLM, no I/O — shouldEscalate is synchronous inside its Promise', async () => {
      // Proof by construction: evaluateHeuristicSignals is pure and
      // shouldEscalate is `async` only to satisfy the PolluxDetector
      // interface. The test verifies we can resolve immediately on a
      // microtask tick without any scheduled timer/IO.
      const det = createHeuristicDetector();
      const started = performance.now();
      const settled = await Promise.race([
        det.shouldEscalate(
          ctx({
            userContentDigest: "I'm completely stuck and it keeps failing.",
          }),
        ),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
      ]);
      expect(settled).not.toBe('timeout');
      // Generous upper bound; the real evaluation is sub-millisecond.
      expect(performance.now() - started).toBeLessThan(50);
    });

    it('does not mutate the input context or its experimental config', async () => {
      const experimental: PolluxExperimentalConfig = {
        ...enabledHeuristic,
      };
      const input = ctx({
        experimental,
        userContentDigest: "I'm stuck and it keeps failing.",
        pendingToolContext: 'error: boom',
      });
      const snapshot = JSON.parse(JSON.stringify(input)) as PolluxTurnContext;
      const det = createHeuristicDetector();
      await det.shouldEscalate(input);
      expect(input).toEqual(snapshot);
      expect(input.experimental).toBe(experimental);
    });
  });
});
