/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiEventType } from '../../../core/turn.js';
import { SHELL_TOOL_NAME } from '../../../tools/definitions/base-declarations.js';
import type {
  Sensor,
  SensorInput,
  SensorSignal,
  ToolEventRecord,
} from './base.js';

/** Tool-pattern sensor slot (Phase D). */
export const TOOL_PATTERN_SENSOR_ID = 'sensor.tool_pattern' as const;

export const TOOL_IDENTICAL_REPEAT_SIGNAL_ID = 'tool.identical_repeat' as const;
export const TOOL_EXIT_REGRESSION_SIGNAL_ID = 'tool.exit_regression' as const;
export const TOOL_FAILURE_CASCADE_SIGNAL_ID = 'tool.failure_cascade' as const;
export const TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID =
  'tool.search_without_decide' as const;
export const TOOL_TOKEN_BURN_SIGNAL_ID = 'tool.token_burn' as const;
export const TOOL_LOCAL_PATCH_RETRY_SIGNAL_ID =
  'tool.local_patch_retry' as const;
export const TOOL_CROSS_SURFACE_DRIFT_SIGNAL_ID =
  'tool.cross_surface_drift' as const;
export const TOOL_ANCHOR_GUIDED_MUTATION_SIGNAL_ID =
  'tool.anchor_guided_mutation' as const;
export const TOOL_ANCHOR_TEST_FAILURE_SIGNAL_ID =
  'tool.anchor_test_failure' as const;
export const TOOL_PRE_MUTATION_ADVISOR_SIGNAL_ID =
  'tool.pre_mutation_advisor' as const;
export const LONGITUDINAL_M3_ANCHOR_PRESSURE_SIGNAL_ID =
  'longitudinal.m3_anchor_pressure' as const;

const NON_EXPLORATORY_PROMPT_RE = /\b(fix|implement|add|make.*work)\b/i;
const EXPLORATORY_PROMPT_RE =
  /\b(explore|investigate|inspect|research|look into|analyze|learn)\b/i;

function isNonExploratoryPrompt(prompt: string): boolean {
  if (prompt.trim().length === 0) {
    return false;
  }
  if (EXPLORATORY_PROMPT_RE.test(prompt)) {
    return false;
  }
  return NON_EXPLORATORY_PROMPT_RE.test(prompt);
}

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .toLowerCase();
}

function isTestOrDocPath(path: string): boolean {
  return (
    /(^|\/)(tests?|__tests__)(\/|$)|\.test\.[a-z0-9]+$/i.test(path) ||
    /(^|\/)(docs?|rules|plans)(\/|$)|(^|\/)readme(?:\.[a-z0-9]+)?$/i.test(path)
  );
}

function isConfigOrDataPath(path: string): boolean {
  return /(^|\/)(config|configs|data)(\/|$)|\.json$|\.txt$/i.test(path);
}

function isSourcePath(path: string): boolean {
  return /(^|\/)src(\/|$)|\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(path);
}

function isCompletionMarkerPath(path: string): boolean {
  return /(^|\/)m3-done\.txt$/i.test(path);
}

function collectRequestPaths(entry: ToolEventRecord): string[] {
  const args = entry.request?.args;
  if (!args) {
    return [];
  }
  const out = new Set<string>();
  const seen = new Set<unknown>();
  const visit = (value: unknown, keyHint?: string, depth = 0): void => {
    if (depth > 6 || value == null) {
      return;
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const normalized = normalizePath(value);
      const key = (keyHint ?? '').toLowerCase();
      const looksPathLike =
        key.includes('path') ||
        key === 'file' ||
        key === 'files' ||
        normalized.includes('/');
      if (looksPathLike) {
        out.add(normalized);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entryValue of value) {
        visit(entryValue, keyHint, depth + 1);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) {
        visit(childValue, childKey, depth + 1);
      }
    }
  };

  for (const [key, value] of Object.entries(args)) {
    visit(value, key);
  }
  return [...out];
}

function countTrailingFailures(
  responseEvents: readonly ToolEventRecord[],
): number {
  let failureCascadeCount = 0;
  for (let i = responseEvents.length - 1; i >= 0; i--) {
    const entry = responseEvents[i];
    const isFailure =
      entry.schemaError === true ||
      (entry.exitCode !== undefined && entry.exitCode !== 0);
    if (!isFailure) {
      break;
    }
    failureCascadeCount++;
  }
  return failureCascadeCount;
}

function hasPromptAnchors(input: SensorInput): boolean {
  const summary = input.promptConstraintSummary;
  if (!summary) {
    return false;
  }
  return (
    summary.hasCrossFileRepairConstraint ||
    summary.hasPublicInterfaceConstraint ||
    summary.hasBehaviorPreservationConstraint ||
    summary.hasCompatibilityAliasConstraint ||
    summary.mutationProtectedPaths.length > 0 ||
    summary.behaviorAnchorPaths.length > 0 ||
    summary.sourceOfTruthPaths.length > 0
  );
}

function matchesReferencedPath(
  candidate: string,
  referencedPaths: readonly string[],
): boolean {
  return referencedPaths.some((referencedPath) => {
    const normalizedReferenced = normalizePath(referencedPath);
    return (
      candidate === normalizedReferenced ||
      candidate.endsWith(`/${normalizedReferenced}`) ||
      normalizedReferenced.endsWith(`/${candidate}`)
    );
  });
}

function matchesAnyPromptPath(
  candidate: string,
  paths: readonly string[],
): boolean {
  return matchesReferencedPath(candidate, paths);
}

function isMutationProtectedPath(
  candidate: string,
  input: SensorInput,
): boolean {
  return matchesAnyPromptPath(
    candidate,
    input.promptConstraintSummary?.mutationProtectedPaths ?? [],
  );
}

function collectUniqueReadPaths(
  readOnlyRequests: readonly ToolEventRecord[],
): string[] {
  return [
    ...new Set(readOnlyRequests.flatMap((entry) => collectRequestPaths(entry))),
  ];
}

function collectMeaningfulAnchorReadPaths(
  input: SensorInput,
  readOnlyRequests: readonly ToolEventRecord[],
): string[] {
  const summary = input.promptConstraintSummary;
  if (!summary) {
    return [];
  }
  const promptAnchorPaths = [
    ...summary.mutationProtectedPaths,
    ...summary.behaviorAnchorPaths,
    ...summary.sourceOfTruthPaths,
    ...summary.referencedPaths,
  ];
  return collectUniqueReadPaths(readOnlyRequests).filter(
    (path) =>
      matchesAnyPromptPath(path, promptAnchorPaths) ||
      isSourcePath(path) ||
      isTestOrDocPath(path) ||
      isConfigOrDataPath(path),
  );
}

function collectAllowedSourceMutationPaths(
  mutationRequests: readonly ToolEventRecord[],
  input: SensorInput,
): string[] {
  return [
    ...new Set(
      mutationRequests
        .flatMap((entry) => collectRequestPaths(entry))
        .filter(
          (path) =>
            isSourcePath(path) &&
            !isCompletionMarkerPath(path) &&
            !isTestOrDocPath(path) &&
            !isConfigOrDataPath(path) &&
            !isMutationProtectedPath(path, input),
        ),
    ),
  ];
}

function latestResponseFailed(
  responseEvents: readonly ToolEventRecord[],
): boolean {
  const latest = responseEvents.at(-1);
  return (
    latest !== undefined &&
    (latest.schemaError === true ||
      (latest.exitCode !== undefined && latest.exitCode !== 0))
  );
}

export class ToolPatternSensor implements Sensor {
  readonly id = TOOL_PATTERN_SENSOR_ID;

  observe(input: SensorInput): readonly SensorSignal[] {
    try {
      const nowMs = Date.now();
      const out: SensorSignal[] = [];
      const requestEvents = input.toolEventWindow.filter(
        (entry) => entry.phase === 'request',
      );
      const responseEvents = input.toolEventWindow.filter(
        (entry) => entry.phase === 'response',
      );
      const mutationRequests = requestEvents.filter((entry) => entry.mutation);
      const readOnlyRequests = requestEvents.filter((entry) => entry.readOnly);
      const failureCascadeCount = countTrailingFailures(responseEvents);

      if (input.event.type === GeminiEventType.ToolCallRequest) {
        const latest = requestEvents.at(-1);
        if (latest) {
          const repeats = requestEvents.filter(
            (entry) =>
              entry.name === latest.name && entry.argsHash === latest.argsHash,
          ).length;
          if (repeats >= 3) {
            out.push({
              id: TOOL_IDENTICAL_REPEAT_SIGNAL_ID,
              weight: 2,
              precisionPrior: 0.75,
              category: 'tool',
              tsMs: nowMs,
              attribution: `${latest.name} repeated ${repeats} times`,
            });
          }
        }

        const summary = input.promptConstraintSummary;
        if (summary && hasPromptAnchors(input)) {
          const anchorReadPaths = collectMeaningfulAnchorReadPaths(
            input,
            readOnlyRequests,
          );
          const hasAliasCompatibilityAnchor =
            summary.hasCompatibilityAliasConstraint &&
            anchorReadPaths.length >= 1;
          const hasStandardAnchorInspection = anchorReadPaths.length >= 2;
          const hasCrossFileSourceSearch =
            summary.hasCrossFileRepairConstraint &&
            anchorReadPaths.some(
              (path) => path === 'src' || path.endsWith('/src'),
            );
          const hasSufficientAnchorInspection =
            hasStandardAnchorInspection ||
            hasAliasCompatibilityAnchor ||
            hasCrossFileSourceSearch;
          if (hasSufficientAnchorInspection) {
            out.push({
              id: LONGITUDINAL_M3_ANCHOR_PRESSURE_SIGNAL_ID,
              weight: 1.5,
              precisionPrior: 0.75,
              category: 'longitudinal',
              tsMs: nowMs,
              attribution: `${anchorReadPaths.length} anchored surfaces inspected`,
            });
          }

          if (latest?.mutation) {
            const firstMeaningfulMutation = mutationRequests.length === 1;
            if (
              firstMeaningfulMutation &&
              anchorReadPaths.length >= 1 &&
              !input.currentTurnAdvisorSuccessWithinTurn &&
              !input.recentAdvisorSuccessWithinTurns
            ) {
              out.push({
                id: TOOL_PRE_MUTATION_ADVISOR_SIGNAL_ID,
                weight: 3,
                precisionPrior: 0.9,
                category: 'tool',
                hardPrecision: true,
                tsMs: nowMs,
                attribution: `pre-mutation advisor after reads: ${anchorReadPaths.join(', ')}`,
              });
            }

            const mutationPathEntries = mutationRequests.flatMap((entry) =>
              collectRequestPaths(entry),
            );
            const mutationPathCounts = new Map<string, number>();
            for (const path of mutationPathEntries) {
              mutationPathCounts.set(
                path,
                (mutationPathCounts.get(path) ?? 0) + 1,
              );
            }
            const repeatedMutationPath = [...mutationPathCounts.entries()].find(
              ([, count]) => count >= 2,
            )?.[0];
            const latestMutationPaths = collectRequestPaths(latest);
            const latestAllowedSourceMutationPaths =
              collectAllowedSourceMutationPaths([latest], input);
            const allowedSourceMutationPaths =
              collectAllowedSourceMutationPaths(mutationRequests, input);
            const repeatedMutationArgs =
              mutationRequests.filter(
                (entry) =>
                  entry.name === latest.name &&
                  entry.argsHash === latest.argsHash,
              ).length >= 2;
            const searchChurn =
              readOnlyRequests.length >= 4 && mutationRequests.length >= 2;
            const existingChurnSymptom =
              repeatedMutationPath !== undefined ||
              repeatedMutationArgs ||
              failureCascadeCount >= 2 ||
              searchChurn;

            if (existingChurnSymptom && mutationRequests.length >= 2) {
              out.push({
                id: TOOL_LOCAL_PATCH_RETRY_SIGNAL_ID,
                weight: 2,
                precisionPrior: 0.75,
                category: 'tool',
                tsMs: nowMs,
                attribution:
                  repeatedMutationPath !== undefined
                    ? `repeated local mutation on ${repeatedMutationPath}`
                    : `${mutationRequests.length} mutation attempts under anchored prompt constraints`,
              });
            }

            if (
              hasSufficientAnchorInspection &&
              latestAllowedSourceMutationPaths.length > 0
            ) {
              out.push({
                id: TOOL_ANCHOR_GUIDED_MUTATION_SIGNAL_ID,
                weight: 2,
                precisionPrior: 0.72,
                category: 'tool',
                tsMs: nowMs,
                attribution: `allowed source mutation after anchored reads: ${latestAllowedSourceMutationPaths.join(', ')}`,
              });
            }

            const hasAliasCrossSurfaceRepair =
              summary.hasCompatibilityAliasConstraint &&
              hasAliasCompatibilityAnchor &&
              allowedSourceMutationPaths.length >= 1 &&
              summary.referencedPaths.filter(isSourcePath).length >= 2;
            if (
              (summary.hasCrossFileRepairConstraint ||
                summary.hasPublicInterfaceConstraint ||
                summary.hasCompatibilityAliasConstraint) &&
              (hasStandardAnchorInspection || hasAliasCrossSurfaceRepair) &&
              allowedSourceMutationPaths.length >= 1 &&
              latestMutationPaths.length > 0
            ) {
              out.push({
                id: TOOL_CROSS_SURFACE_DRIFT_SIGNAL_ID,
                weight: 2,
                precisionPrior: 0.7,
                category: 'tool',
                tsMs: nowMs,
                attribution: `${anchorReadPaths.length} anchored surfaces inspected before source mutation on ${allowedSourceMutationPaths.join(', ')}`,
              });
            }
          }
        }
      }

      if (input.event.type === GeminiEventType.ToolCallResponse) {
        const shellExitCodes = responseEvents
          .filter(
            (entry) =>
              entry.name === SHELL_TOOL_NAME && entry.exitCode !== undefined,
          )
          .map((entry) => entry.exitCode!);
        const last4 = shellExitCodes.slice(-4);
        if (
          last4.length === 4 &&
          last4[0] === 1 &&
          last4[1] === 0 &&
          last4[2] === 1 &&
          last4[3] === 0
        ) {
          out.push({
            id: TOOL_EXIT_REGRESSION_SIGNAL_ID,
            weight: 1,
            precisionPrior: 0.5,
            category: 'tool',
            tsMs: nowMs,
            attribution: 'shell exit oscillation 1→0→1→0',
          });
        }

        if (failureCascadeCount >= 3) {
          out.push({
            id: TOOL_FAILURE_CASCADE_SIGNAL_ID,
            weight: 2,
            precisionPrior: 0.8,
            category: 'tool',
            tsMs: nowMs,
            attribution: `${failureCascadeCount} consecutive failures`,
          });
        }

        if (
          latestResponseFailed(responseEvents) &&
          hasPromptAnchors(input) &&
          input.promptConstraintSummary?.hasProtectedTestsOrDocs === true
        ) {
          const anchorReadPaths = collectMeaningfulAnchorReadPaths(
            input,
            readOnlyRequests,
          );
          if (anchorReadPaths.length >= 2) {
            out.push({
              id: TOOL_ANCHOR_TEST_FAILURE_SIGNAL_ID,
              weight: 2,
              precisionPrior: 0.75,
              category: 'tool',
              tsMs: nowMs,
              attribution: `failed tool response after anchored reads: ${anchorReadPaths.join(', ')}`,
            });
          }
        }
      }

      if (requestEvents.length >= 8) {
        const readOnlyCalls = requestEvents.filter(
          (entry) => entry.readOnly,
        ).length;
        const mutationCalls = requestEvents.filter(
          (entry) => entry.mutation,
        ).length;
        if (
          readOnlyCalls >= 8 &&
          mutationCalls === 0 &&
          isNonExploratoryPrompt(input.userPromptText ?? '')
        ) {
          out.push({
            id: TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID,
            weight: 1,
            precisionPrior: 0.45,
            category: 'tool',
            tsMs: nowMs,
            attribution: `${readOnlyCalls} read-only calls without mutation`,
          });
        }
      }

      const medianSuccessfulTurnTokens =
        input.sessionMedianSuccessfulTurnTokens ?? 0;
      const currentTurnTokens = input.currentTurnTokenCount ?? 0;
      if (
        currentTurnTokens > 0 &&
        medianSuccessfulTurnTokens > 0 &&
        currentTurnTokens > medianSuccessfulTurnTokens * 2
      ) {
        out.push({
          id: TOOL_TOKEN_BURN_SIGNAL_ID,
          weight: 1,
          precisionPrior: 0.55,
          category: 'tool',
          tsMs: nowMs,
          attribution: `${currentTurnTokens} tokens vs median ${medianSuccessfulTurnTokens}`,
        });
      }

      return out;
    } catch {
      return [];
    }
  }
}
