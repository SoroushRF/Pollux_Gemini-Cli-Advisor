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
import { SELF_ADVISOR_REQUEST_SIGNAL_ID } from './advisorRequest.js';

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
export const TOOL_FINALIZATION_AUDIT_SIGNAL_ID =
  'tool.finalization_audit' as const;
export const TOOL_EXECUTOR_CHECKPOINT_ADVISOR_SIGNAL_ID =
  'tool.executor_checkpoint_advisor' as const;
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

function isExecutorCheckpointSourcePath(path: string): boolean {
  return /(^|\/)src(\/|$)|\.(?:ts|tsx|js|jsx|mjs|cjs|go|py|rs|java|kt|kts|c|cc|cpp|cxx|h|hpp|cs|rb|php|swift|scala)$/i.test(
    path,
  );
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
    summary.hasNegativeSpaceConstraint ||
    summary.hasExplicitCompletenessConstraint ||
    summary.hasStateMachineConstraint ||
    summary.hasTerminalStateConstraint ||
    summary.hasStructuredMapConstraint ||
    summary.hasForbiddenBehaviorConstraint ||
    summary.mutationProtectedPaths.length > 0 ||
    summary.behaviorAnchorPaths.length > 0 ||
    summary.sourceOfTruthPaths.length > 0
  );
}

function hasHighRiskStructuralConstraints(input: SensorInput): boolean {
  const summary = input.promptConstraintSummary;
  if (!summary) {
    return false;
  }
  return (
    summary.hasNegativeSpaceConstraint ||
    summary.hasExplicitCompletenessConstraint ||
    summary.hasStateMachineConstraint ||
    summary.hasTerminalStateConstraint ||
    summary.hasStructuredMapConstraint ||
    summary.hasForbiddenBehaviorConstraint ||
    summary.hasCompatibilityAliasConstraint ||
    summary.hasBehaviorPreservationConstraint
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

function collectSourceMutationPaths(
  mutationRequests: readonly ToolEventRecord[],
): string[] {
  return [
    ...new Set(
      mutationRequests
        .flatMap((entry) => collectRequestPaths(entry))
        .filter(
          (path) =>
            isExecutorCheckpointSourcePath(path) &&
            !isCompletionMarkerPath(path),
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

const STRICT_CONTRACT_CHECKPOINT_REASON =
  'contract extraction before source edit';
const STRICT_MID_RUN_CHECKPOINT_REASON =
  'mid-run risk review after edits or failed tests';
const STRICT_FINAL_AUDIT_CHECKPOINT_REASON =
  'final diff audit before completion';

const FOCUSED_TEST_COMMAND_RE =
  /\b(go\s+test|npm\s+(?:run\s+)?test|npm\s+exec|npx\s+(?:jest|vitest)|pnpm\s+(?:test|vitest|jest)|yarn\s+(?:test|vitest|jest)|pytest|vitest|jest|cargo\s+test)\b/i;

function normalizeCheckpointReason(reason: string): string {
  return reason.trim().replace(/\s+/g, ' ').toLowerCase();
}

function configuredCheckpointReason(
  input: SensorInput,
  reason: string,
): string | undefined {
  const requiredReasons = input.executorCheckpoints?.requiredReasons ?? [];
  const normalized = normalizeCheckpointReason(reason);
  const configured = requiredReasons.find(
    (candidate) => normalizeCheckpointReason(candidate) === normalized,
  );
  if (configured) {
    return configured;
  }
  for (const builtIn of [
    STRICT_CONTRACT_CHECKPOINT_REASON,
    STRICT_MID_RUN_CHECKPOINT_REASON,
    STRICT_FINAL_AUDIT_CHECKPOINT_REASON,
  ]) {
    if (normalizeCheckpointReason(builtIn) === normalized) {
      return builtIn;
    }
  }
  return undefined;
}

function toolRequestText(entry: ToolEventRecord | undefined): string {
  if (!entry?.request) {
    return '';
  }
  const pieces = [entry.request.name];
  const args = entry.request.args;
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    for (const key of ['description', 'command', 'instruction']) {
      const value = args[key];
      if (typeof value === 'string') {
        pieces.push(value);
      }
    }
  }
  return pieces.join('\n');
}

function isFocusedTestResponse(
  response: ToolEventRecord,
  requestEvents: readonly ToolEventRecord[],
): boolean {
  const request = requestEvents.find(
    (entry) => entry.callId === response.callId,
  );
  return FOCUSED_TEST_COMMAND_RE.test(toolRequestText(request));
}

function hasRepeatedSourceEdit(
  mutationRequests: readonly ToolEventRecord[],
): boolean {
  const counts = new Map<string, number>();
  for (const path of mutationRequests.flatMap((entry) =>
    collectSourceMutationPaths([entry]),
  )) {
    const next = (counts.get(path) ?? 0) + 1;
    if (next >= 2) {
      return true;
    }
    counts.set(path, next);
  }
  return false;
}

function hasMultiFileHighRiskMutation(
  sourceMutationRequests: readonly ToolEventRecord[],
): boolean {
  const paths = collectSourceMutationPaths(sourceMutationRequests);
  if (new Set(paths).size < 2) {
    return false;
  }
  const text = sourceMutationRequests.map(toolRequestText).join('\n');
  return /\b(import|module|interface|type|class|func|package|schema|migration|concurrency|goroutine|async|await|transaction|lock|state machine)\b/i.test(
    text,
  );
}

export class ToolPatternSensor implements Sensor {
  readonly id = TOOL_PATTERN_SENSOR_ID;
  private readonly emittedExecutorCheckpointReasons = new Set<string>();
  private lastFinalAuditSourceMutationCount = 0;
  private finalAuditEmitted = false;

  beginTurn(): void {
    this.emittedExecutorCheckpointReasons.clear();
  }

  private buildStrictCheckpointSignal(
    input: SensorInput,
    reason: string,
    nowMs: number,
    attributionDetail: string,
  ): SensorSignal | undefined {
    if (!input.executorCheckpoints?.enabled) {
      return undefined;
    }
    const canonical = configuredCheckpointReason(input, reason);
    if (!canonical) {
      return undefined;
    }
    const dedupeKey = normalizeCheckpointReason(canonical);
    if (this.emittedExecutorCheckpointReasons.has(dedupeKey)) {
      return undefined;
    }
    this.emittedExecutorCheckpointReasons.add(dedupeKey);
    return {
      id: SELF_ADVISOR_REQUEST_SIGNAL_ID,
      weight: 3,
      precisionPrior: 0.95,
      category: 'self',
      hardPrecision: true,
      tsMs: nowMs,
      attribution: `advisor_request reason="${canonical}" (${attributionDetail})`,
    };
  }

  private buildStrictFinalAuditSignal(
    input: SensorInput,
    sourceMutationRequests: readonly ToolEventRecord[],
    nowMs: number,
    attributionDetail: string,
  ): SensorSignal | undefined {
    if (this.finalAuditEmitted) {
      return undefined;
    }
    if (
      sourceMutationRequests.length <= this.lastFinalAuditSourceMutationCount
    ) {
      return undefined;
    }
    const signal = this.buildStrictCheckpointSignal(
      input,
      STRICT_FINAL_AUDIT_CHECKPOINT_REASON,
      nowMs,
      attributionDetail,
    );
    if (signal) {
      this.lastFinalAuditSourceMutationCount = sourceMutationRequests.length;
      this.finalAuditEmitted = true;
    }
    return signal;
  }

  private maybeEmitStrictExecutorCheckpoint(params: {
    input: SensorInput;
    requestEvents: readonly ToolEventRecord[];
    responseEvents: readonly ToolEventRecord[];
    mutationRequests: readonly ToolEventRecord[];
    nowMs: number;
  }): SensorSignal | undefined {
    const { input, requestEvents, responseEvents, mutationRequests, nowMs } =
      params;
    if (!input.executorCheckpoints?.enabled) {
      return undefined;
    }

    const sourceMutationRequests = mutationRequests.filter(
      (entry) => collectSourceMutationPaths([entry]).length > 0,
    );

    if (input.event.type === GeminiEventType.ToolCallRequest) {
      const latest = requestEvents.at(-1);
      if (!latest) {
        return undefined;
      }
      const latestPaths = collectRequestPaths(latest);
      if (
        latestPaths.some(isCompletionMarkerPath) &&
        sourceMutationRequests.length > 0
      ) {
        return this.buildStrictFinalAuditSignal(
          input,
          sourceMutationRequests,
          nowMs,
          'before completion marker after source mutations',
        );
      }

      const latestSourcePaths = collectSourceMutationPaths([latest]);
      if (latestSourcePaths.length === 0) {
        return undefined;
      }
      if (
        sourceMutationRequests.length === 1 &&
        !input.currentTurnAdvisorSuccessWithinTurn
      ) {
        return this.buildStrictCheckpointSignal(
          input,
          STRICT_CONTRACT_CHECKPOINT_REASON,
          nowMs,
          `before first source mutation: ${latestSourcePaths.join(', ')}`,
        );
      }
      if (
        sourceMutationRequests.length >= 2 &&
        (hasRepeatedSourceEdit(sourceMutationRequests) ||
          hasMultiFileHighRiskMutation(sourceMutationRequests))
      ) {
        return this.buildStrictCheckpointSignal(
          input,
          STRICT_MID_RUN_CHECKPOINT_REASON,
          nowMs,
          `after ${sourceMutationRequests.length} risky or churned source mutations`,
        );
      }
    }

    if (input.event.type === GeminiEventType.ToolCallResponse) {
      const latestResponse = responseEvents.at(-1);
      if (
        latestResponse &&
        latestResponseFailed(responseEvents) &&
        sourceMutationRequests.length > 0 &&
        isFocusedTestResponse(latestResponse, requestEvents)
      ) {
        return this.buildStrictCheckpointSignal(
          input,
          STRICT_MID_RUN_CHECKPOINT_REASON,
          nowMs,
          'after failed focused test command following source mutation',
        );
      }
    }

    if (
      input.event.type === GeminiEventType.Finished &&
      input.executorCheckpoints.finalGate &&
      sourceMutationRequests.length > 0
    ) {
      return this.buildStrictFinalAuditSignal(
        input,
        sourceMutationRequests,
        nowMs,
        'at terminal completion after source mutations',
      );
    }

    return undefined;
  }

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
      const strictCheckpointSignal = this.maybeEmitStrictExecutorCheckpoint({
        input,
        requestEvents,
        responseEvents,
        mutationRequests,
        nowMs,
      });
      if (strictCheckpointSignal) {
        out.push(strictCheckpointSignal);
      }

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
          const promptAnchorPaths = [
            ...summary.mutationProtectedPaths,
            ...summary.behaviorAnchorPaths,
            ...summary.sourceOfTruthPaths,
            ...summary.referencedPaths,
          ].filter((path) => !isCompletionMarkerPath(path));
          const hasMultiSurfacePromptAnchor =
            new Set(promptAnchorPaths.map(normalizePath)).size >= 2;
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
              !input.recentAdvisorSuccessWithinTurns &&
              (hasSufficientAnchorInspection ||
                (hasHighRiskStructuralConstraints(input) &&
                  hasMultiSurfacePromptAnchor))
            ) {
              const executorCheckpoint =
                input.advisorTriggerMode === 'executor_request';
              if (
                !executorCheckpoint ||
                hasHighRiskStructuralConstraints(input)
              ) {
                out.push({
                  id: executorCheckpoint
                    ? TOOL_EXECUTOR_CHECKPOINT_ADVISOR_SIGNAL_ID
                    : TOOL_PRE_MUTATION_ADVISOR_SIGNAL_ID,
                  weight: 3,
                  precisionPrior: 0.9,
                  category: 'tool',
                  hardPrecision: true,
                  tsMs: nowMs,
                  attribution: executorCheckpoint
                    ? `executor checkpoint before risky mutation after reads: ${anchorReadPaths.join(', ')}`
                    : `pre-mutation advisor after reads: ${anchorReadPaths.join(', ')}`,
                });
              }
            }

            const mutationPathEntries = mutationRequests.flatMap((entry) =>
              collectRequestPaths(entry),
            );
            const latestMutationPathsForAudit = collectRequestPaths(latest);
            const previousSourceMutationPaths =
              collectAllowedSourceMutationPaths(
                mutationRequests.slice(0, -1),
                input,
              );
            if (
              latestMutationPathsForAudit.some(isCompletionMarkerPath) &&
              previousSourceMutationPaths.length > 0 &&
              hasHighRiskStructuralConstraints(input)
            ) {
              const executorCheckpoint =
                input.advisorTriggerMode === 'executor_request';
              out.push({
                id: executorCheckpoint
                  ? TOOL_EXECUTOR_CHECKPOINT_ADVISOR_SIGNAL_ID
                  : TOOL_FINALIZATION_AUDIT_SIGNAL_ID,
                weight: 3,
                precisionPrior: 0.9,
                category: 'tool',
                hardPrecision: true,
                tsMs: nowMs,
                attribution: executorCheckpoint
                  ? `executor checkpoint before finalization after source mutations: ${previousSourceMutationPaths.join(', ')}`
                  : `finalization audit after source mutations: ${previousSourceMutationPaths.join(', ')}`,
              });
            }
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
