/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createUserContent,
  type GenerateContentConfig,
  type PartListUnion,
  type Content,
  type Tool,
  type GenerateContentResponse,
} from '@google/genai';
import { partListUnionToString } from './geminiRequest.js';
import {
  getDirectoryContextString,
  getInitialChatHistory,
} from '../utils/environmentContext.js';
import {
  CompressionStatus,
  Turn,
  GeminiEventType,
  type ServerGeminiStreamEvent,
  type ChatCompressionInfo,
} from './turn.js';
import type { Config } from '../config/config.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { getCoreSystemPrompt } from './prompts.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import {
  retryWithBackoff,
  type RetryAvailabilityContext,
} from '../utils/retry.js';
import {
  RetryableQuotaError,
  TerminalQuotaError,
  type ValidationRequiredError,
} from '../utils/googleQuotaErrors.js';
import { getErrorMessage, isAbortError } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import type {
  ChatRecordingService,
  ResumedSessionData,
} from '../services/chatRecordingService.js';
import type { ContentGenerator } from './contentGenerator.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import { ChatCompressionService } from '../context/chatCompressionService.js';
import { AgentHistoryProvider } from '../context/agentHistoryProvider.js';
import { ideContextStore } from '../ide/ideContext.js';
import {
  logContentRetryFailure,
  logNextSpeakerCheck,
  logPolluxAdvisorAttempt,
  logPolluxAdvisorGuidance,
  logPolluxEscalation,
} from '../telemetry/loggers.js';
import type {
  DefaultHookOutput,
  AfterAgentHookOutput,
} from '../hooks/types.js';
import {
  ContentRetryFailureEvent,
  NextSpeakerCheckEvent,
  LlmRole,
  PolluxAdvisorGuidanceTelemetryEvent,
  PolluxAdvisorAttemptTelemetryEvent,
  PolluxEscalationTelemetryEvent,
} from '../telemetry/types.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import type { IdeContext, File } from '../ide/types.js';
import { handleFallback } from '../fallback/handler.js';
import type { RoutingContext } from '../routing/routingStrategy.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { ToolOutputMaskingService } from '../context/toolOutputMaskingService.js';
import { calculateRequestTokenCount } from '../utils/tokenCalculation.js';
import {
  applyModelSelection,
  createAvailabilityContextProvider,
} from '../availability/policyHelpers.js';
import { classifyFailureKind } from '../availability/errorClassification.js';
import { getDisplayString, resolveModel } from '../config/models.js';
import { getResponseText, partToString } from '../utils/partUtils.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import { PolicyDecision } from '../policy/types.js';
import {
  ADVISOR_CONSULTATION_TOOL_NAME,
  POLLUX_ESCALATION_TIMING,
  PolluxEscalationReasonCode,
  PolluxRuntimeSurface,
  POLLUX_TURN_DIGEST_MAX_CHARS,
  type AdvisorConsultationMode,
  type PolluxAdvisorExecutorProfile,
  type PolluxEscalationTiming,
  type PolluxTurnContext,
} from '../pollux/types.js';
import {
  buildPolluxHardLoopNextTurnIntent,
  checkPolluxEligibility,
  createLiveExecutorObserver,
  ingestPolluxAfterLoopCheckFailOpen,
  ingestPolluxObserverFailOpen,
  type LiveExecutorObserver,
  type NextTurnIntent,
  type SameTurnIntent,
} from '../pollux/observer/index.js';
import {
  checkAdvisorInvocationBudget,
  getAdvisorRequestTimeoutMs,
  resolveAdvisorPathFailure,
  type AdvisorPathFailureKind,
} from '../pollux/safeguards.js';
import {
  buildAdvisorConsultationPrompt,
  buildAdvisorConsultationRepairPrompt,
  flushPolluxStatusTagStreamCarry,
  parseAdvisorModelResponse,
  stripPolluxStatusTagsFromStreamChunk,
  stripPolluxStatusTags,
} from '../pollux/prompts.js';
import {
  PolluxModelRegistry,
  PolluxModelRole,
  resolvePolluxModel,
} from '../pollux/models.js';
import {
  createPolluxDiagnosticTraceWriter,
  type PolluxDiagnosticTraceEventType,
  type PolluxDiagnosticTraceWriter,
} from '../pollux/diagnosticTrace.js';
import { parsePromptConstraintSummary } from '../pollux/observer/promptConstraints.js';

const MAX_TURNS = 100;

/**
 * Splits a turn's `PartListUnion` into the bounded `userContentDigest` and
 * `pendingToolContext` fields consumed by the detector. Text parts (and bare
 * string requests) are routed to the user digest; `functionResponse` payloads
 * are stringified into the tool context. All other part shapes (file data,
 * inline data, function calls, code execution results, etc.) are intentionally
 * dropped from the detector inputs to keep the digest free of binary blobs and
 * model-emitted artifacts (POLLUX_SPEC §5.1, §7).
 *
 * Both fields are clamped to {@link POLLUX_TURN_DIGEST_MAX_CHARS} so the detector
 * receives a stable, bounded view regardless of upstream request size.
 */
function summarizeRequestForDetector(request: PartListUnion): {
  userContentDigest: string;
  pendingToolContext: string;
} {
  const userParts: string[] = [];
  const toolParts: string[] = [];
  const partsList: unknown[] = Array.isArray(request) ? request : [request];

  for (const raw of partsList) {
    if (raw == null) continue;
    if (typeof raw === 'string') {
      userParts.push(raw);
      continue;
    }
    if (typeof raw !== 'object') continue;

    const part = raw as {
      text?: string;
      functionResponse?: { response?: unknown };
    };

    if (typeof part.text === 'string') {
      userParts.push(part.text);
      continue;
    }
    if (part.functionResponse) {
      try {
        toolParts.push(
          JSON.stringify(part.functionResponse.response ?? '') ?? '',
        );
      } catch {
        toolParts.push('[unserializable function response]');
      }
    }
  }

  return {
    userContentDigest: userParts
      .join('\n')
      .slice(0, POLLUX_TURN_DIGEST_MAX_CHARS),
    pendingToolContext: toolParts
      .join('\n')
      .slice(0, POLLUX_TURN_DIGEST_MAX_CHARS),
  };
}

function isFunctionResponseOnlyRequest(request: PartListUnion): boolean {
  const partsList: unknown[] = Array.isArray(request) ? request : [request];
  return (
    partsList.length > 0 &&
    partsList.every(
      (raw) =>
        raw !== null && typeof raw === 'object' && 'functionResponse' in raw,
    )
  );
}

type PolluxIntentConsultationOutcome =
  | 'consulted'
  | 'budget_exhausted'
  | 'policy_denied'
  | 'fail_open'
  | 'skipped';

type PolluxEscalationOutcome =
  | 'consulted'
  | 'fail_open'
  | 'budget_exhausted'
  | 'policy_denied'
  | 'deferred_next_turn'
  | 'skipped';

type PolluxAdvisorAttemptKind = 'primary' | 'repair_retry' | 'fallback';

type PolluxAdvisorAttemptOutcome =
  | 'consulted'
  | 'parse_error'
  | 'empty_response'
  | 'timeout'
  | 'capacity_exhausted'
  | 'quota_exhausted';

type PolluxAdvisorAttemptParserOutcome =
  | 'direct'
  | 'recovered_fence'
  | 'recovered_substring'
  | 'plain_text_fallback'
  | 'parse_error'
  | 'malformed_json'
  | 'schema'
  | 'empty_response'
  | 'timeout'
  | 'capacity_exhausted'
  | 'quota_exhausted';

type PolluxAdvisorTriggerSource =
  | 'executor_request'
  | 'executor_request_status'
  | 'executor_request_checkpoint'
  | 'executor_request_checkpoint_default'
  | 'pre_mutation'
  | 'final_audit'
  | 'risk_gate'
  | 'fusion'
  | 'self_status'
  | 'loop'
  | 'unknown';

type PolluxAdvisorInjectionTiming = 'next_turn' | 'same_turn_next_continuation';

interface PolluxAdvisorGuidanceInjection {
  readonly guidance: string;
  readonly mode?: AdvisorConsultationMode;
  readonly mustInclude?: readonly string[];
  readonly mustForbid?: readonly string[];
  readonly verifyBeforeDone?: readonly string[];
  readonly turnId: string;
  readonly reasonCode?: string;
  readonly escalationTiming?: PolluxEscalationTiming;
  readonly injectionTiming: PolluxAdvisorInjectionTiming;
  readonly confidence?: number;
  readonly parserOutcome?: PolluxAdvisorAttemptParserOutcome;
  readonly triggerMode?: 'executor_request' | 'detector' | 'hybrid';
  readonly triggerSource: PolluxAdvisorTriggerSource;
  readonly model?: string;
  readonly attemptKind?: PolluxAdvisorAttemptKind;
  readonly advisorExecutorProfile?: PolluxAdvisorExecutorProfile;
  readonly guidanceQuality?:
    | 'none'
    | 'capacity_failed'
    | 'truncated'
    | 'too_short'
    | 'structured'
    | 'fallback_structured';
}

interface PolluxAdvisorAttemptResult {
  readonly attemptIndex: number;
  readonly attemptKind: PolluxAdvisorAttemptKind;
  readonly model: string;
  readonly parserOutcome: PolluxAdvisorAttemptParserOutcome;
  readonly outcome: PolluxAdvisorAttemptOutcome;
  readonly consultationSucceeded: boolean;
  readonly failOpenKind?: AdvisorPathFailureKind;
  readonly rawResponse: string;
  readonly guidance?: string;
  readonly mustInclude?: readonly string[];
  readonly mustForbid?: readonly string[];
  readonly verifyBeforeDone?: readonly string[];
  readonly structuredConfidence?: number;
  readonly advisorExecutorProfile?: PolluxAdvisorExecutorProfile;
  readonly outputFinishReason?: string;
  readonly visibleOutputTokens?: number;
  readonly thoughtTokens?: number;
  readonly truncated?: boolean;
  readonly guidanceTooShort?: boolean;
  readonly retryableForRepair: boolean;
  readonly retryableForFallback: boolean;
  readonly strictCheckpointFailureKind?: string;
  readonly strictCheckpointConsultedGood?: boolean;
}

interface PolluxStrictCheckpointState {
  readonly reason: string;
  requested: boolean;
  primaryAttempted: boolean;
  consultedGood: boolean;
  failed: boolean;
  budgetBlocked: boolean;
  finalVerificationObserved: boolean;
  finalVerificationCommand?: string;
  finalAuditConsultedAtMutationCount?: number;
  finalVerificationObservedAtMutationCount?: number;
  finalVerificationPending?: boolean;
  lastOutcome?: PolluxAdvisorAttemptOutcome | 'budget_exhausted';
  lastParserOutcome?: PolluxAdvisorAttemptParserOutcome;
  lastFinishReason?: string;
  lastFailureKind?: string;
}

type PolluxAdvisorConsultationResult =
  | {
      readonly outcome: 'consulted';
      readonly guidance: string;
      readonly structuredConfidence?: number;
      readonly model: string;
      readonly attemptKind: PolluxAdvisorAttemptKind;
      readonly checkpointReason?: string;
    }
  | {
      readonly outcome: 'policy_denied' | 'fail_open';
      readonly failureKind?: AdvisorPathFailureKind;
      readonly checkpointReason?: string;
    };

function resolvePolluxAdvisorExecutorProfile(
  experimental: Readonly<{
    executorModel: string;
    advisorExecutorProfile?: string;
  }>,
): PolluxAdvisorExecutorProfile {
  if (experimental.advisorExecutorProfile === 'strict_fd') {
    return 'strict_fd';
  }
  if (
    experimental.advisorExecutorProfile === 'flash_lite' ||
    experimental.executorModel.toLowerCase().includes('flash-lite')
  ) {
    return 'flash_lite';
  }
  return 'default';
}

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}

function isTruncatedAdvisorResponse(params: {
  readonly finishReason?: string;
  readonly rawResponse: string;
}): boolean {
  if (/max[_\s-]?tokens/i.test(params.finishReason ?? '')) {
    return true;
  }
  const trimmed = params.rawResponse.trim();
  return (
    trimmed.startsWith('{') &&
    !trimmed.endsWith('}') &&
    (trimmed.includes('"guidance"') || trimmed.includes('guidance'))
  );
}

function isFlashLiteGuidanceTooShort(params: {
  readonly advisorExecutorProfile: PolluxAdvisorExecutorProfile;
  readonly guidance: string;
  readonly mustInclude?: readonly string[];
  readonly verifyBeforeDone?: readonly string[];
}): boolean {
  if (params.advisorExecutorProfile !== 'flash_lite') {
    return false;
  }
  if (
    (params.mustInclude?.length ?? 0) > 0 ||
    (params.verifyBeforeDone?.length ?? 0) > 0
  ) {
    return false;
  }
  return countWords(params.guidance) < 20;
}

const STRICT_FD_CONTRACT_REASON = 'contract extraction before source edit';
const STRICT_FD_MID_RUN_REASON =
  'mid-run risk review after edits or failed tests';
const STRICT_FD_FINAL_AUDIT_REASON = 'final diff audit before completion';
const STRICT_FD_KNOWN_CHECKPOINT_REASONS = [
  STRICT_FD_CONTRACT_REASON,
  STRICT_FD_MID_RUN_REASON,
  STRICT_FD_FINAL_AUDIT_REASON,
] as const;

const STRICT_FD_GO_OFF_DOMAIN_GUIDANCE_RE =
  /\b(O_CLOEXEC|SOCK_CLOEXEC|dup2|dup3|epoll_create)\b|src\/(?:connection|net_handler)\.c/i;

const STRICT_FD_GO_TASK_RE =
  /\b(wazero|golang|go task|go benchmark|\.go\b|go\s+module|experimental\/|snapshot\.go)\b/i;

const STRICT_FD_GO_FINAL_VERIFICATION_RE =
  /\b(?:gofmt|go\s+test(?:\s|$)|go\s+vet|compile check|build check|syntax check|imports?\s+after\s+declarations|unused imports?)/i;

const STRICT_FD_JS_TS_TASK_RE =
  /\b(?:javascript|typescript|ts-pattern|true-myth|\.tsx?\b|\.jsx?\b|package\.json|pnpm-lock\.yaml|package-lock\.json|npm|pnpm|yarn|jest|vitest|tsc)\b/i;

const STRICT_FD_JS_TS_FINAL_VERIFICATION_RE =
  /\b(?:npm\s+(?:run\s+)?(?:test|build|typecheck)|npm\s+test|npx\s+(?:jest|vitest|tsc)|pnpm\s+(?:test|run\s+test|run\s+build|run\s+typecheck|exec\s+(?:jest|vitest|tsc))|yarn\s+(?:test|build|typecheck)|jest(?:\s|$)|vitest(?:\s|$)|tsc\s+--noEmit)/i;

const STRICT_FD_FINAL_VERIFICATION_RE = new RegExp(
  `${STRICT_FD_GO_FINAL_VERIFICATION_RE.source}|${STRICT_FD_JS_TS_FINAL_VERIFICATION_RE.source}`,
  'i',
);

const STRICT_FD_SOURCE_MUTATION_TOOL_RE =
  /\b(?:write_file|replace|edit|modify|patch)\b/i;

const STRICT_FD_SOURCE_PATH_RE =
  /\.(?:go|ts|tsx|js|jsx|py|rs|java|c|cc|cpp|h|hpp|cs|rb|php|swift|kt|kts)\b|(?:^|[\\/])(?:src|lib|packages|internal|cmd|experimental)[\\/]/i;

const STRICT_FD_GENERIC_PLANNING_GUIDANCE_RE =
  /\b(?:create|write|draft|update)\s+(?:an?\s+)?implementation plan\b|\bplan file\b|\bwait for (?:user )?approval\b|\bproceed with (?:the )?(?:plan|implementation)\b/i;

function collectAdvisorGuidanceText(params: {
  readonly guidance: string;
  readonly mustInclude?: readonly string[];
  readonly mustForbid?: readonly string[];
  readonly verifyBeforeDone?: readonly string[];
}): string {
  return [
    params.guidance,
    ...(params.mustInclude ?? []),
    ...(params.mustForbid ?? []),
    ...(params.verifyBeforeDone ?? []),
  ].join('\n');
}

function strictFdContextLooksLikeGoTask(contextText: string): boolean {
  return STRICT_FD_GO_TASK_RE.test(contextText);
}

function strictFdContextLooksLikeJsTsTask(contextText: string): boolean {
  return STRICT_FD_JS_TS_TASK_RE.test(contextText);
}

function strictFdHasExecutableFinalVerification(
  verifyBeforeDone: readonly string[] | undefined,
): boolean {
  return STRICT_FD_FINAL_VERIFICATION_RE.test(
    (verifyBeforeDone ?? []).join('\n'),
  );
}

function toolCallRequestTextFromArgs(args: Record<string, unknown>): string {
  const pieces: string[] = [];
  for (const key of ['description', 'command', 'instruction']) {
    const value = args[key];
    if (typeof value === 'string') {
      pieces.push(value);
    }
  }
  return pieces.join('\n');
}

function strictFdToolCallLooksLikeSourceMutation(
  event: ServerGeminiStreamEvent,
): boolean {
  if (event.type !== GeminiEventType.ToolCallRequest) {
    return false;
  }
  if (!STRICT_FD_SOURCE_MUTATION_TOOL_RE.test(event.value.name)) {
    return false;
  }
  const text = `${event.value.name}\n${JSON.stringify(event.value.args)}`;
  return STRICT_FD_SOURCE_PATH_RE.test(text);
}

function extractPromptMetadataField(
  promptText: string,
  label: string,
): string | null {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, 'im');
  return pattern.exec(promptText)?.[1]?.trim() ?? null;
}

function normalizedPolluxCheckpointReason(reason: string): string {
  return reason.trim().replace(/\s+/g, ' ').toLowerCase();
}

function polluxCheckpointReasonFromAttribution(
  attribution: string | undefined,
): string | undefined {
  if (!attribution) {
    return undefined;
  }
  return /\badvisor_request reason="([^"]+)"/i.exec(attribution)?.[1];
}

function extractThoughtPartsFromGenerateContentResponse(
  response: GenerateContentResponse,
): Array<{
  readonly candidateIndex: number;
  readonly partIndex: number;
  readonly text: string;
  readonly thoughtSignaturePresent: boolean;
}> {
  const thoughts: Array<{
    readonly candidateIndex: number;
    readonly partIndex: number;
    readonly text: string;
    readonly thoughtSignaturePresent: boolean;
  }> = [];

  for (const [candidateIndex, candidate] of (
    response.candidates ?? []
  ).entries()) {
    for (const [partIndex, rawPart] of (
      candidate.content?.parts ?? []
    ).entries()) {
      const part = rawPart as {
        thought?: boolean;
        text?: string;
        thoughtSignature?: string;
      };
      if (part.thought !== true) {
        continue;
      }
      const text = typeof part.text === 'string' ? part.text : '';
      const thoughtSignaturePresent =
        typeof part.thoughtSignature === 'string' &&
        part.thoughtSignature.length > 0;
      if (text.trim().length === 0 && !thoughtSignaturePresent) {
        continue;
      }
      thoughts.push({
        candidateIndex,
        partIndex,
        text,
        thoughtSignaturePresent,
      });
    }
  }

  return thoughts;
}

/**
 * Phase F §F.1.4: build a `NextTurnIntent` from a same-turn intent that was
 * blocked by an explicit guardrail (single-shot, kill switch, or budget).
 * The reason code and contributing signal ids are preserved verbatim so the
 * downstream consult still carries the same attribution.
 */
function buildPolluxDowngradedNextTurnIntent(
  sameTurn: SameTurnIntent,
  queuedAtMs: number = Date.now(),
): NextTurnIntent {
  return {
    timing: 'next_turn',
    reasonCode: sameTurn.reasonCode,
    netScore: sameTurn.netScore,
    contributingSignalIds: sameTurn.contributingSignalIds,
    contributingSignalAttributions: sameTurn.contributingSignalAttributions,
    queuedAtMs,
  };
}

function polluxExecutorAdvisorRequestKey(intent: SameTurnIntent): string {
  return (
    intent.contributingSignalAttributions?.join('\n') ||
    intent.contributingSignalIds.join('\n') ||
    intent.reasonCode
  );
}

type BeforeAgentHookReturn =
  | {
      type: GeminiEventType.AgentExecutionStopped;
      value: { reason: string; systemMessage?: string };
    }
  | {
      type: GeminiEventType.AgentExecutionBlocked;
      value: { reason: string; systemMessage?: string };
    }
  | { additionalContext: string | undefined }
  | undefined;

export class GeminiClient {
  private chat?: GeminiChat;
  private sessionTurnCount = 0;

  private readonly loopDetector: LoopDetectionService;
  private readonly compressionService: ChatCompressionService;
  private readonly agentHistoryProvider: AgentHistoryProvider;
  private readonly toolOutputMaskingService: ToolOutputMaskingService;
  private lastPromptId: string;
  private currentSequenceModel: string | null = null;
  private readonly polluxModelRegistry = new PolluxModelRegistry([]);
  private polluxAdvisorCallsThisTurn = 0;
  private polluxAdvisorCallsThisSession = 0;
  /**
   * Loop-detector–only next-turn slot (Phase C bridge). `maybeRunPolluxAdvisorConsultation`
   * prefers the unified `polluxPendingNextTurnIntent` when both are set, but keeps
   * this slot so a hard-loop downgrade observed late in a turn is not dropped if
   * the unified slot is empty — a narrow safety net for loop recovery.
   */
  private polluxPendingLoopNextTurnIntent: NextTurnIntent | undefined;
  /**
   * Phase F §F.1.2: generic next-turn intent slot populated by the live
   * observer (or by an explicit same-turn downgrade). Consumed exactly once
   * at the top of the following turn by `maybeRunPolluxAdvisorConsultation`.
   */
  private polluxPendingNextTurnIntent: NextTurnIntent | undefined;
  /**
   * Phase F §F.1.2: mirrors the observer's same-turn intent slot on the
   * client for parity / introspection. The authoritative same-turn intent
   * still lives on the observer; this slot is informational only (reserved
   * for future cross-boundary same-turn promotions).
   */
  private polluxPendingSameTurnIntent: SameTurnIntent | undefined;
  private polluxPendingAdvisorGuidance:
    | PolluxAdvisorGuidanceInjection
    | undefined;
  /**
   * Phase F §F.1.4 single-shot guardrail (I11): flips to `true` once a same-
   * turn consult has completed (or was attempted) in the current turn, so
   * subsequent same-turn-eligible intents must downgrade to next-turn.
   */
  private polluxSameTurnFiredThisTurn = false;
  private readonly polluxSameTurnExecutorRequestKeysThisTurn =
    new Set<string>();
  private readonly polluxStrictCheckpointStates = new Map<
    string,
    PolluxStrictCheckpointState
  >();
  private polluxStrictSourceMutationCount = 0;
  private polluxStrictFinalGateContinuationUsedThisTurn = false;
  private polluxActiveObserver: LiveExecutorObserver | undefined;
  private polluxActiveObserverPromptId: string | undefined;
  private polluxActiveUserPromptText = '';
  private polluxDiagnosticTraceWriter:
    | PolluxDiagnosticTraceWriter
    | undefined
    | null;
  private lastSentIdeContext: IdeContext | undefined;
  private forceFullIdeContext = true;

  /**
   * At any point in this conversation, was compression triggered without
   * being forced and did it fail?
   */
  private hasFailedCompressionAttempt = false;

  constructor(private readonly context: AgentLoopContext) {
    this.loopDetector = new LoopDetectionService(this.config);
    this.compressionService = new ChatCompressionService();
    this.agentHistoryProvider = new AgentHistoryProvider(
      this.config.agentHistoryProviderConfig,
      this.config,
    );
    this.toolOutputMaskingService = new ToolOutputMaskingService();
    this.lastPromptId = this.config.getSessionId();

    coreEvents.on(CoreEvent.ModelChanged, this.handleModelChanged);
    coreEvents.on(CoreEvent.MemoryChanged, this.handleMemoryChanged);
  }

  private get config(): Config {
    return this.context.config;
  }

  private handleModelChanged = () => {
    this.currentSequenceModel = null;
  };

  private handleMemoryChanged = () => {
    this.updateSystemInstruction();
  };

  clearCurrentSequenceModel(): void {
    this.currentSequenceModel = null;
  }

  // Hook state to deduplicate BeforeAgent calls and track response for
  // AfterAgent
  private hookStateMap = new Map<
    string,
    {
      hasFiredBeforeAgent: boolean;
      cumulativeResponse: string;
      activeCalls: number;
      originalRequest: PartListUnion;
    }
  >();

  private async fireBeforeAgentHookSafe(
    request: PartListUnion,
    prompt_id: string,
  ): Promise<BeforeAgentHookReturn> {
    let hookState = this.hookStateMap.get(prompt_id);
    if (!hookState) {
      hookState = {
        hasFiredBeforeAgent: false,
        cumulativeResponse: '',
        activeCalls: 0,
        originalRequest: request,
      };
      this.hookStateMap.set(prompt_id, hookState);
    }

    // Increment active calls for this prompt_id
    // This is called at the start of sendMessageStream, so it acts as an entry
    // counter. We increment here, assuming this helper is ALWAYS called at
    // entry.
    hookState.activeCalls++;

    if (hookState.hasFiredBeforeAgent) {
      return undefined;
    }

    const hookOutput = await this.config
      .getHookSystem()
      ?.fireBeforeAgentEvent(partToString(request));
    hookState.hasFiredBeforeAgent = true;

    if (hookOutput?.shouldStopExecution()) {
      return {
        type: GeminiEventType.AgentExecutionStopped,
        value: {
          reason: hookOutput.getEffectiveReason(),
          systemMessage: hookOutput.systemMessage,
        },
      };
    }

    if (hookOutput?.isBlockingDecision()) {
      return {
        type: GeminiEventType.AgentExecutionBlocked,
        value: {
          reason: hookOutput.getEffectiveReason(),
          systemMessage: hookOutput.systemMessage,
        },
      };
    }

    const additionalContext = hookOutput?.getAdditionalContext();
    if (additionalContext) {
      return { additionalContext };
    }
    return undefined;
  }

  private async fireAfterAgentHookSafe(
    currentRequest: PartListUnion,
    prompt_id: string,
    turn?: Turn,
    stopHookActive: boolean = false,
  ): Promise<DefaultHookOutput | undefined> {
    const hookState = this.hookStateMap.get(prompt_id);
    // Only fire on the outermost call (when activeCalls is 1)
    if (!hookState || (hookState.activeCalls !== 1 && !stopHookActive)) {
      return undefined;
    }

    if (turn && turn.pendingToolCalls.length > 0) {
      return undefined;
    }

    const finalResponseText =
      hookState.cumulativeResponse ||
      turn?.getResponseText() ||
      '[no response text]';
    const finalRequest = hookState.originalRequest || currentRequest;

    const hookOutput = await this.config
      .getHookSystem()
      ?.fireAfterAgentEvent(
        partToString(finalRequest),
        finalResponseText,
        stopHookActive,
      );

    return hookOutput;
  }

  private updateTelemetryTokenCount() {
    if (this.chat) {
      uiTelemetryService.setLastPromptTokenCount(
        this.chat.getLastPromptTokenCount(),
      );
    }
  }

  async initialize() {
    this.chat = await this.startChat();
    this.updateTelemetryTokenCount();
  }

  private getContentGeneratorOrFail(): ContentGenerator {
    if (!this.config.getContentGenerator()) {
      throw new Error('Content generator not initialized');
    }
    return this.config.getContentGenerator();
  }

  async addHistory(content: Content) {
    this.getChat().addHistory(content);
  }

  getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  isInitialized(): boolean {
    return this.chat !== undefined;
  }

  getHistory(): readonly Content[] {
    return this.getChat().getHistory();
  }

  stripThoughtsFromHistory() {
    this.getChat().stripThoughtsFromHistory();
  }

  setHistory(history: readonly Content[]) {
    this.getChat().setHistory(history);
    this.updateTelemetryTokenCount();
    this.forceFullIdeContext = true;
  }

  private lastUsedModelId?: string;

  async setTools(modelId?: string): Promise<void> {
    if (!this.chat) {
      return;
    }

    if (modelId && modelId === this.lastUsedModelId) {
      return;
    }
    this.lastUsedModelId = modelId;

    const toolRegistry = this.context.toolRegistry;
    const toolDeclarations = toolRegistry.getFunctionDeclarations(modelId);
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    this.getChat().setTools(tools);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat();
    this.updateTelemetryTokenCount();
    // Reset JIT context loaded paths so subdirectory context can be
    // re-discovered in the new session.
    await this.config.getMemoryContextManager()?.refresh();
  }

  dispose() {
    coreEvents.off(CoreEvent.ModelChanged, this.handleModelChanged);
    coreEvents.off(CoreEvent.MemoryChanged, this.handleMemoryChanged);
  }

  async resumeChat(
    history: Content[],
    resumedSessionData?: ResumedSessionData,
  ): Promise<void> {
    this.chat = await this.startChat(history, resumedSessionData);
    this.updateTelemetryTokenCount();
  }

  getChatRecordingService(): ChatRecordingService | undefined {
    return this.chat?.getChatRecordingService();
  }

  getLoopDetectionService(): LoopDetectionService {
    return this.loopDetector;
  }

  getCurrentSequenceModel(): string | null {
    return this.currentSequenceModel;
  }

  async addDirectoryContext(): Promise<void> {
    if (!this.chat) {
      return;
    }

    this.getChat().addHistory({
      role: 'user',
      parts: [{ text: await getDirectoryContextString(this.config) }],
    });
  }

  updateSystemInstruction(): void {
    if (!this.isInitialized()) {
      return;
    }

    const systemMemory = this.config.getSystemInstructionMemory();
    const systemInstruction = getCoreSystemPrompt(this.config, systemMemory);
    this.getChat().setSystemInstruction(systemInstruction);
  }

  async startChat(
    extraHistory?: Content[],
    resumedSessionData?: ResumedSessionData,
  ): Promise<GeminiChat> {
    this.forceFullIdeContext = true;
    this.hasFailedCompressionAttempt = false;
    this.lastUsedModelId = undefined;

    const toolRegistry = this.context.toolRegistry;
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];

    const history = await getInitialChatHistory(this.config, extraHistory);

    try {
      const systemMemory = this.config.getSystemInstructionMemory();
      const systemInstruction = getCoreSystemPrompt(this.config, systemMemory);
      const chat = new GeminiChat(
        this.config,
        systemInstruction,
        tools,
        history,
        resumedSessionData,
        async (modelId: string) => {
          this.lastUsedModelId = modelId;
          const toolRegistry = this.context.toolRegistry;
          const toolDeclarations =
            toolRegistry.getFunctionDeclarations(modelId);
          return [{ functionDeclarations: toolDeclarations }];
        },
      );
      await chat.initialize(resumedSessionData, 'main');
      return chat;
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        history,
        'startChat',
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  private getIdeContextParts(forceFullContext: boolean): {
    contextParts: string[];
    newIdeContext: IdeContext | undefined;
  } {
    const currentIdeContext = ideContextStore.get();
    if (!currentIdeContext) {
      return { contextParts: [], newIdeContext: undefined };
    }

    if (forceFullContext || !this.lastSentIdeContext) {
      // Send full context as JSON
      const openFiles = currentIdeContext.workspaceState?.openFiles || [];
      const activeFile = openFiles.find((f) => f.isActive);
      const otherOpenFiles = openFiles
        .filter((f) => !f.isActive)
        .map((f) => f.path);

      const contextData: Record<string, unknown> = {};

      if (activeFile) {
        contextData['activeFile'] = {
          path: activeFile.path,
          cursor: activeFile.cursor
            ? {
                line: activeFile.cursor.line,
                character: activeFile.cursor.character,
              }
            : undefined,
          selectedText: activeFile.selectedText || undefined,
        };
      }

      if (otherOpenFiles.length > 0) {
        contextData['otherOpenFiles'] = otherOpenFiles;
      }

      if (Object.keys(contextData).length === 0) {
        return { contextParts: [], newIdeContext: currentIdeContext };
      }

      const jsonString = JSON.stringify(contextData, null, 2);
      const contextParts = [
        "Here is the user's editor context as a JSON object. This is for your information only.",
        '```json',
        jsonString,
        '```',
      ];

      if (this.config.getDebugMode()) {
        debugLogger.log(contextParts.join('\n'));
      }
      return {
        contextParts,
        newIdeContext: currentIdeContext,
      };
    } else {
      // Calculate and send delta as JSON
      const delta: Record<string, unknown> = {};
      const changes: Record<string, unknown> = {};

      const lastFiles = new Map(
        (this.lastSentIdeContext.workspaceState?.openFiles || []).map(
          (f: File) => [f.path, f],
        ),
      );
      const currentFiles = new Map(
        (currentIdeContext.workspaceState?.openFiles || []).map((f: File) => [
          f.path,
          f,
        ]),
      );

      const openedFiles: string[] = [];
      for (const [path] of currentFiles.entries()) {
        if (!lastFiles.has(path)) {
          openedFiles.push(path);
        }
      }
      if (openedFiles.length > 0) {
        changes['filesOpened'] = openedFiles;
      }

      const closedFiles: string[] = [];
      for (const [path] of lastFiles.entries()) {
        if (!currentFiles.has(path)) {
          closedFiles.push(path);
        }
      }
      if (closedFiles.length > 0) {
        changes['filesClosed'] = closedFiles;
      }

      const lastActiveFile = (
        this.lastSentIdeContext.workspaceState?.openFiles || []
      ).find((f: File) => f.isActive);
      const currentActiveFile = (
        currentIdeContext.workspaceState?.openFiles || []
      ).find((f: File) => f.isActive);

      if (currentActiveFile) {
        if (!lastActiveFile || lastActiveFile.path !== currentActiveFile.path) {
          changes['activeFileChanged'] = {
            path: currentActiveFile.path,
            cursor: currentActiveFile.cursor
              ? {
                  line: currentActiveFile.cursor.line,
                  character: currentActiveFile.cursor.character,
                }
              : undefined,
            selectedText: currentActiveFile.selectedText || undefined,
          };
        } else {
          const lastCursor = lastActiveFile.cursor;
          const currentCursor = currentActiveFile.cursor;
          if (
            currentCursor &&
            (!lastCursor ||
              lastCursor.line !== currentCursor.line ||
              lastCursor.character !== currentCursor.character)
          ) {
            changes['cursorMoved'] = {
              path: currentActiveFile.path,
              cursor: {
                line: currentCursor.line,
                character: currentCursor.character,
              },
            };
          }

          const lastSelectedText = lastActiveFile.selectedText || '';
          const currentSelectedText = currentActiveFile.selectedText || '';
          if (lastSelectedText !== currentSelectedText) {
            changes['selectionChanged'] = {
              path: currentActiveFile.path,
              selectedText: currentSelectedText,
            };
          }
        }
      } else if (lastActiveFile) {
        changes['activeFileChanged'] = {
          path: null,
          previousPath: lastActiveFile.path,
        };
      }

      if (Object.keys(changes).length === 0) {
        return { contextParts: [], newIdeContext: currentIdeContext };
      }

      delta['changes'] = changes;
      const jsonString = JSON.stringify(delta, null, 2);
      const contextParts = [
        "Here is a summary of changes in the user's editor context, in JSON format. This is for your information only.",
        '```json',
        jsonString,
        '```',
      ];

      if (this.config.getDebugMode()) {
        debugLogger.log(contextParts.join('\n'));
      }
      return {
        contextParts,
        newIdeContext: currentIdeContext,
      };
    }
  }

  private _getActiveModelForCurrentTurn(): string {
    if (this.currentSequenceModel) {
      return this.currentSequenceModel;
    }

    // Availability logic: The configured model is the source of truth,
    // including any permanent fallbacks (config.setModel) or manual overrides.
    return resolveModel(
      this.config.getActiveModel(),
      this.config.getGemini31LaunchedSync?.() ?? false,
      this.config.getGemini31FlashLiteLaunchedSync?.() ?? false,
      false,
      this.config.getHasAccessToPreviewModel?.() ?? true,
      this.config,
    );
  }

  /**
   * Public entry point for surfaces that do not route through
   * `GeminiClient.processTurn` (currently the ACP surface uses
   * `GeminiChat.sendMessageStream` directly and must invoke the advisor
   * per-surface seam explicitly). Delegates to the same internal helper as
   * `processTurn` so the policy-path, budget, telemetry role, and fail-open
   * behavior are identical across surfaces (P0-01 S4, PHASE2_GUARDRAILS §4.2).
   */
  async runPolluxAdvisorConsultation(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    runtimeSurface: PolluxRuntimeSurface,
  ): Promise<void> {
    this.polluxAdvisorCallsThisTurn = 0;
    return this.maybeRunPolluxAdvisorConsultation(
      request,
      signal,
      prompt_id,
      runtimeSurface,
    );
  }

  private buildPolluxTurnContext(
    request: PartListUnion,
    prompt_id: string,
    runtimeSurface: PolluxRuntimeSurface,
    experimental: PolluxTurnContext['experimental'],
    pendingToolContextOverride?: string,
    userContentDigestOverride?: string,
  ): PolluxTurnContext {
    const requestSummary = summarizeRequestForDetector(request);
    return {
      surface: runtimeSurface,
      sessionId: this.config.getSessionId(),
      turnId: `${prompt_id}:${this.sessionTurnCount}`,
      experimental,
      advisorCallsThisTurn: this.polluxAdvisorCallsThisTurn,
      advisorCallsThisSession: this.polluxAdvisorCallsThisSession,
      userContentDigest:
        userContentDigestOverride ?? requestSummary.userContentDigest,
      pendingToolContext:
        pendingToolContextOverride ?? requestSummary.pendingToolContext,
    };
  }

  private canonicalPolluxStrictCheckpointReason(
    reason: string | undefined,
  ): string | undefined {
    if (!reason) {
      return undefined;
    }
    const experimental = this.config.getPolluxExperimentalConfig();
    if (
      !experimental.executorCheckpoints.enabled ||
      !experimental.executorCheckpoints.enforceRequired
    ) {
      return undefined;
    }
    const normalized = normalizedPolluxCheckpointReason(reason);
    const required = experimental.executorCheckpoints.requiredReasons.find(
      (candidate) => normalizedPolluxCheckpointReason(candidate) === normalized,
    );
    if (required) {
      return required;
    }
    if (experimental.advisorExecutorProfile === 'strict_fd') {
      return STRICT_FD_KNOWN_CHECKPOINT_REASONS.find(
        (candidate) =>
          normalizedPolluxCheckpointReason(candidate) === normalized,
      );
    }
    return undefined;
  }

  private strictCheckpointReasonFromIntent(
    intent: SameTurnIntent | NextTurnIntent,
  ): string | undefined {
    if (
      intent.reasonCode !== PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST
    ) {
      return undefined;
    }
    for (const attribution of intent.contributingSignalAttributions ?? []) {
      const canonical = this.canonicalPolluxStrictCheckpointReason(
        polluxCheckpointReasonFromAttribution(attribution),
      );
      if (canonical) {
        return canonical;
      }
    }
    return undefined;
  }

  private strictCheckpointReasonFromEscalationMeta(meta?: {
    readonly reasonCode?: string;
    readonly contributingSignalAttributions?: readonly string[];
  }): string | undefined {
    if (
      meta?.reasonCode !== PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST
    ) {
      return undefined;
    }
    for (const attribution of meta.contributingSignalAttributions ?? []) {
      const canonical = this.canonicalPolluxStrictCheckpointReason(
        polluxCheckpointReasonFromAttribution(attribution),
      );
      if (canonical) {
        return canonical;
      }
    }
    return undefined;
  }

  private getOrCreateStrictCheckpointState(
    reason: string,
  ): PolluxStrictCheckpointState {
    const key = normalizedPolluxCheckpointReason(reason);
    let state = this.polluxStrictCheckpointStates.get(key);
    if (!state) {
      state = {
        reason,
        requested: false,
        primaryAttempted: false,
        consultedGood: false,
        failed: false,
        budgetBlocked: false,
        finalVerificationObserved: false,
        finalVerificationPending: false,
      };
      this.polluxStrictCheckpointStates.set(key, state);
    }
    return state;
  }

  private noteStrictCheckpointRequested(reason: string | undefined): void {
    if (!reason) {
      return;
    }
    const state = this.getOrCreateStrictCheckpointState(reason);
    state.requested = true;
    this.recordPolluxDiagnosticTrace('checkpoint_state', {
      reason,
      status: 'requested',
    });
  }

  private noteStrictCheckpointBudgetBlocked(reason: string | undefined): void {
    if (!reason) {
      return;
    }
    const state = this.getOrCreateStrictCheckpointState(reason);
    state.requested = true;
    state.budgetBlocked = true;
    state.lastOutcome = 'budget_exhausted';
    this.recordPolluxDiagnosticTrace('checkpoint_state', {
      reason,
      status: 'budget_blocked',
    });
  }

  private shouldSuppressStrictFinalAuditAdvisorRequest(
    reason: string | undefined,
  ): boolean {
    if (
      normalizedPolluxCheckpointReason(reason ?? '') !==
      normalizedPolluxCheckpointReason(STRICT_FD_FINAL_AUDIT_REASON)
    ) {
      return false;
    }
    const experimental = this.config.getPolluxExperimentalConfig();
    if (experimental.advisorExecutorProfile !== 'strict_fd') {
      return false;
    }
    const state = this.polluxStrictCheckpointStates.get(
      normalizedPolluxCheckpointReason(STRICT_FD_FINAL_AUDIT_REASON),
    );
    return state?.consultedGood === true;
  }

  private noteStrictFinalAuditDuplicateSuppressed(
    reason: string | undefined,
  ): void {
    if (!reason) {
      return;
    }
    const state = this.getOrCreateStrictCheckpointState(reason);
    state.requested = true;
    this.recordPolluxDiagnosticTrace('checkpoint_state', {
      reason,
      status: 'duplicate_suppressed',
      failureKind: 'final_audit_already_consulted',
      mutationCount: this.polluxStrictSourceMutationCount,
      finalVerificationPending: state.finalVerificationPending,
    });
  }

  private noteStrictCheckpointAttempt(
    reason: string | undefined,
    result: PolluxAdvisorAttemptResult,
  ): void {
    if (!reason) {
      return;
    }
    const state = this.getOrCreateStrictCheckpointState(reason);
    state.requested = true;
    if (result.attemptKind === 'primary') {
      state.primaryAttempted = true;
    }
    state.lastOutcome = result.outcome;
    state.lastParserOutcome = result.parserOutcome;
    state.lastFinishReason = result.outputFinishReason;
    state.lastFailureKind =
      result.strictCheckpointFailureKind ?? result.failOpenKind;
    if (result.strictCheckpointConsultedGood === true) {
      state.consultedGood = true;
      state.failed = false;
      if (
        normalizedPolluxCheckpointReason(reason) ===
        normalizedPolluxCheckpointReason(STRICT_FD_FINAL_AUDIT_REASON)
      ) {
        state.finalAuditConsultedAtMutationCount =
          this.polluxStrictSourceMutationCount;
        state.finalVerificationPending =
          state.finalVerificationObservedAtMutationCount !==
          this.polluxStrictSourceMutationCount;
        state.finalVerificationObserved =
          state.finalVerificationObservedAtMutationCount ===
          this.polluxStrictSourceMutationCount;
        if (state.finalVerificationPending) {
          state.finalVerificationCommand = undefined;
        }
      }
    } else if (
      !result.consultationSucceeded ||
      result.strictCheckpointFailureKind
    ) {
      state.failed = true;
    }
    this.recordPolluxDiagnosticTrace('checkpoint_state', {
      reason,
      status:
        result.strictCheckpointConsultedGood === true
          ? 'consulted_good'
          : result.consultationSucceeded
            ? 'consulted_weak'
            : 'failed',
      attemptKind: result.attemptKind,
      outcome: result.outcome,
      parserOutcome: result.parserOutcome,
      finishReason: result.outputFinishReason,
      truncated: result.truncated,
      failureKind: result.strictCheckpointFailureKind ?? result.failOpenKind,
    });
  }

  private noteStrictFinalVerificationObserved(command: string): void {
    const state = this.getOrCreateStrictCheckpointState(
      STRICT_FD_FINAL_AUDIT_REASON,
    );
    if (
      !state.consultedGood ||
      state.finalVerificationObservedAtMutationCount ===
        this.polluxStrictSourceMutationCount
    ) {
      return;
    }
    state.finalVerificationObserved = true;
    state.finalVerificationObservedAtMutationCount =
      this.polluxStrictSourceMutationCount;
    state.finalVerificationPending = false;
    if (state.lastFailureKind === 'final_verification_missing') {
      state.failed = false;
      state.lastFailureKind = undefined;
    }
    state.finalVerificationCommand = command;
    this.recordPolluxDiagnosticTrace('checkpoint_state', {
      reason: STRICT_FD_FINAL_AUDIT_REASON,
      status: 'final_verification_observed',
      command,
      mutationCount: this.polluxStrictSourceMutationCount,
    });
  }

  private noteStrictFinalVerificationMissing(): void {
    const state = this.getOrCreateStrictCheckpointState(
      STRICT_FD_FINAL_AUDIT_REASON,
    );
    if (
      !state.consultedGood ||
      state.finalVerificationObservedAtMutationCount ===
        this.polluxStrictSourceMutationCount
    ) {
      return;
    }
    state.finalVerificationPending = true;
    state.failed = true;
    state.lastFailureKind = 'final_verification_missing';
    this.recordPolluxDiagnosticTrace('checkpoint_state', {
      reason: STRICT_FD_FINAL_AUDIT_REASON,
      status: 'final_verification_missing',
      failureKind: 'final_verification_missing',
      mutationCount: this.polluxStrictSourceMutationCount,
    });
  }

  private maybeNoteStrictFdSourceMutationFromToolCall(
    event: ServerGeminiStreamEvent,
  ): void {
    const experimental = this.config.getPolluxExperimentalConfig();
    if (
      experimental.advisorExecutorProfile !== 'strict_fd' ||
      !strictFdToolCallLooksLikeSourceMutation(event)
    ) {
      return;
    }
    this.polluxStrictSourceMutationCount += 1;
    const state = this.polluxStrictCheckpointStates.get(
      normalizedPolluxCheckpointReason(STRICT_FD_FINAL_AUDIT_REASON),
    );
    if (!state?.consultedGood) {
      return;
    }
    if (
      state.finalVerificationObservedAtMutationCount !==
      this.polluxStrictSourceMutationCount
    ) {
      state.finalVerificationObserved = false;
      state.finalVerificationPending = true;
      this.recordPolluxDiagnosticTrace('checkpoint_state', {
        reason: STRICT_FD_FINAL_AUDIT_REASON,
        status: 'final_verification_invalidated',
        mutationCount: this.polluxStrictSourceMutationCount,
      });
    }
  }

  private maybeNoteStrictFinalVerificationFromToolCall(
    event: ServerGeminiStreamEvent,
  ): void {
    if (event.type !== GeminiEventType.ToolCallRequest) {
      return;
    }
    const experimental = this.config.getPolluxExperimentalConfig();
    if (
      experimental.advisorExecutorProfile !== 'strict_fd' ||
      !this.polluxStrictFinalGateContinuationUsedThisTurn
    ) {
      return;
    }
    const state = this.polluxStrictCheckpointStates.get(
      normalizedPolluxCheckpointReason(STRICT_FD_FINAL_AUDIT_REASON),
    );
    if (
      !state?.consultedGood ||
      state.finalVerificationObservedAtMutationCount ===
        this.polluxStrictSourceMutationCount
    ) {
      return;
    }
    const commandText = toolCallRequestTextFromArgs(event.value.args);
    if (STRICT_FD_FINAL_VERIFICATION_RE.test(commandText)) {
      this.noteStrictFinalVerificationObserved(commandText);
    }
  }

  private strictCheckpointIsConsultedGood(reason: string | undefined): boolean {
    if (!reason) {
      return false;
    }
    return (
      this.polluxStrictCheckpointStates.get(
        normalizedPolluxCheckpointReason(reason),
      )?.consultedGood === true
    );
  }

  private remainingRequiredCheckpointPrimaryAttempts(): number {
    const experimental = this.config.getPolluxExperimentalConfig();
    if (
      !experimental.executorCheckpoints.enabled ||
      !experimental.executorCheckpoints.enforceRequired
    ) {
      return 0;
    }
    return experimental.executorCheckpoints.requiredReasons.filter((reason) => {
      const state = this.polluxStrictCheckpointStates.get(
        normalizedPolluxCheckpointReason(reason),
      );
      return !state?.primaryAttempted;
    }).length;
  }

  private canUseRepairAttemptWithoutStarvingRequiredCheckpoints(): boolean {
    const experimental = this.config.getPolluxExperimentalConfig();
    if (!experimental.executorCheckpoints.reserveRequiredPrimarySlots) {
      return true;
    }
    const remainingPrimary = this.remainingRequiredCheckpointPrimaryAttempts();
    const remainingTurnSlots =
      experimental.maxAdvisorCallsPerTurn - this.polluxAdvisorCallsThisTurn;
    const remainingSessionSlots =
      experimental.maxAdvisorCallsPerSession -
      this.polluxAdvisorCallsThisSession;
    return (
      Math.min(remainingTurnSlots, remainingSessionSlots) > remainingPrimary
    );
  }

  private buildStrictCheckpointContextPacket(params: {
    readonly reason?: string;
    readonly intent: SameTurnIntent | NextTurnIntent;
    readonly pendingToolContextOverride?: string;
  }): string | undefined {
    if (!params.reason) {
      return params.pendingToolContextOverride;
    }
    const observerSnapshot =
      this.polluxActiveObserver?.snapshotCheckpointContext();
    const checkpointStates = [
      ...this.polluxStrictCheckpointStates.values(),
    ].map((state) => ({
      reason: state.reason,
      requested: state.requested,
      primaryAttempted: state.primaryAttempted,
      consultedGood: state.consultedGood,
      failed: state.failed,
      budgetBlocked: state.budgetBlocked,
      lastOutcome: state.lastOutcome,
      lastParserOutcome: state.lastParserOutcome,
      lastFinishReason: state.lastFinishReason,
      lastFailureKind: state.lastFailureKind,
      finalVerificationObserved: state.finalVerificationObserved,
      finalVerificationCommand: state.finalVerificationCommand,
      finalAuditConsultedAtMutationCount:
        state.finalAuditConsultedAtMutationCount,
      finalVerificationObservedAtMutationCount:
        state.finalVerificationObservedAtMutationCount,
      finalVerificationPending: state.finalVerificationPending,
    }));
    const packet = {
      strictCheckpoint: {
        reason: params.reason,
        repository: extractPromptMetadataField(
          this.polluxActiveUserPromptText,
          'Repository',
        ),
        taskId: extractPromptMetadataField(
          this.polluxActiveUserPromptText,
          'Task',
        ),
        language: extractPromptMetadataField(
          this.polluxActiveUserPromptText,
          'Language',
        ),
        instructionSummary: this.polluxActiveUserPromptText.slice(0, 1200),
        required:
          this.config.getPolluxExperimentalConfig().executorCheckpoints
            .requiredReasons,
        checkpointStates,
      },
      pendingTool: params.pendingToolContextOverride,
      recentToolEvents: observerSnapshot?.toolEventWindow ?? [],
      modelOutputTail: observerSnapshot?.currentTurnModelOutputTail,
    };
    return JSON.stringify(packet);
  }

  private getPolluxObserverForProcessTurn(params: {
    readonly request: PartListUnion;
    readonly promptId: string;
    readonly isFunctionResponseContinuation: boolean;
  }): LiveExecutorObserver {
    if (
      params.isFunctionResponseContinuation &&
      this.polluxActiveObserver &&
      this.polluxActiveObserverPromptId === params.promptId
    ) {
      return this.polluxActiveObserver;
    }

    const observer = createLiveExecutorObserver(
      this.config.getPolluxExperimentalConfig(),
      this.loopDetector,
      {
        record: (type, payload) => {
          this.recordPolluxDiagnosticTrace(type, payload);
        },
      },
    );
    this.polluxActiveObserver = observer;
    this.polluxActiveObserverPromptId = params.promptId;
    this.polluxActiveUserPromptText = partListUnionToString(params.request);
    observer.beginTurn(this.polluxActiveUserPromptText);
    return observer;
  }

  private getPolluxDiagnosticTraceWriter():
    | PolluxDiagnosticTraceWriter
    | undefined {
    if (this.polluxDiagnosticTraceWriter === undefined) {
      this.polluxDiagnosticTraceWriter =
        createPolluxDiagnosticTraceWriter(
          this.config.getPolluxExperimentalConfig().diagnosticTrace,
        ) ?? null;
    }
    return this.polluxDiagnosticTraceWriter ?? undefined;
  }

  private recordPolluxDiagnosticTrace(
    type: PolluxDiagnosticTraceEventType,
    payload: unknown,
  ): void {
    this.getPolluxDiagnosticTraceWriter()?.record(type, payload);
  }

  private tracePolluxStreamEvent(event: ServerGeminiStreamEvent): void {
    const trace = this.config.getPolluxExperimentalConfig().diagnosticTrace;
    if (!trace.enabled) {
      return;
    }
    switch (event.type) {
      case GeminiEventType.Content:
        if (trace.includeExecutorText) {
          this.recordPolluxDiagnosticTrace('executor_text_delta', {
            text: event.value,
          });
        }
        break;
      case GeminiEventType.Thought:
        if (trace.includeModelThoughts) {
          this.recordPolluxDiagnosticTrace('executor_thought', {
            subject: event.value.subject,
            description:
              trace.includeModelThoughts === 'raw_model_exposed'
                ? event.value.description
                : event.value.description,
          });
        }
        break;
      case GeminiEventType.ToolCallRequest:
        if (trace.includeToolCalls) {
          this.recordPolluxDiagnosticTrace('tool_call_request', {
            callId: event.value.callId,
            name: event.value.name,
            args: event.value.args,
          });
        }
        break;
      case GeminiEventType.ToolCallResponse:
        if (trace.includeToolResults !== 'none') {
          this.recordPolluxDiagnosticTrace('tool_call_result', {
            callId: event.value.callId,
            errorType: event.value.errorType,
            response:
              trace.includeToolResults === 'snippet'
                ? partToString(event.value.responseParts)
                : partToString(event.value.responseParts).slice(0, 500),
          });
        }
        break;
      case GeminiEventType.Finished:
        this.recordPolluxDiagnosticTrace('oracle_result', {
          reason: event.value.reason,
          usageMetadata: event.value.usageMetadata,
        });
        break;
      default:
        break;
    }
  }

  private tracePolluxAdvisorThoughts(
    advisorResponse: GenerateContentResponse,
    params: {
      readonly turnId: string;
      readonly attemptIndex: number;
      readonly attemptKind: PolluxAdvisorAttemptKind;
      readonly model: string;
      readonly advisorMode?: AdvisorConsultationMode;
      readonly reasonCode?: string;
      readonly escalationTiming?: PolluxEscalationTiming;
    },
  ): void {
    const trace = this.config.getPolluxExperimentalConfig().diagnosticTrace;
    if (!trace.enabled || !trace.includeModelThoughts) {
      return;
    }

    for (const thought of extractThoughtPartsFromGenerateContentResponse(
      advisorResponse,
    )) {
      this.recordPolluxDiagnosticTrace('advisor_thought', {
        turnId: params.turnId,
        reasonCode: params.reasonCode,
        escalationTiming: params.escalationTiming,
        attemptIndex: params.attemptIndex,
        attemptKind: params.attemptKind,
        model: params.model,
        advisorMode: params.advisorMode,
        candidateIndex: thought.candidateIndex,
        partIndex: thought.partIndex,
        text:
          trace.includeModelThoughts === 'raw_model_exposed'
            ? thought.text
            : thought.text.slice(0, 240),
        thoughtSignaturePresent: thought.thoughtSignaturePresent,
      });
    }
  }

  private recordPolluxEscalationTelemetry(params: {
    turnId: string;
    reasonCode: string;
    escalationTiming: 'same_turn' | 'next_turn';
    outcome: PolluxEscalationOutcome;
    sameTurnDowngraded?: boolean;
    pauseBoundary?: 'pre_tool' | 'post_event';
    contributingSignalIds?: readonly string[];
    contributingSignalAttributions?: readonly string[];
    failureKind?: string;
  }): void {
    logPolluxEscalation(
      this.config,
      new PolluxEscalationTelemetryEvent({
        turnId: params.turnId,
        reasonCode: params.reasonCode,
        escalationTiming: params.escalationTiming,
        outcome: params.outcome,
        sameTurnDowngraded: params.sameTurnDowngraded,
        pauseBoundary: params.pauseBoundary,
        contributingSignalIds: params.contributingSignalIds,
        contributingSignalAttributions: params.contributingSignalAttributions,
        failureKind: params.failureKind,
      }),
    );
  }

  private recordPolluxAdvisorAttemptTelemetry(params: {
    turnId: string;
    reasonCode: string;
    escalationTiming: 'same_turn' | 'next_turn';
    attemptIndex: number;
    attemptKind: PolluxAdvisorAttemptKind;
    model: string;
    parserOutcome: PolluxAdvisorAttemptParserOutcome;
    outcome: PolluxAdvisorAttemptOutcome;
    failureKind?: string;
    advisorExecutorProfile?: PolluxAdvisorExecutorProfile;
    outputFinishReason?: string;
    visibleOutputTokens?: number;
    thoughtTokens?: number;
    truncated?: boolean;
    guidanceTooShort?: boolean;
  }): void {
    logPolluxAdvisorAttempt(
      this.config,
      new PolluxAdvisorAttemptTelemetryEvent({
        turnId: params.turnId,
        reasonCode: params.reasonCode,
        escalationTiming: params.escalationTiming,
        attemptIndex: params.attemptIndex,
        attemptKind: params.attemptKind,
        model: params.model,
        parserOutcome: params.parserOutcome,
        outcome: params.outcome,
        failureKind: params.failureKind,
        advisorExecutorProfile: params.advisorExecutorProfile,
        outputFinishReason: params.outputFinishReason,
        visibleOutputTokens: params.visibleOutputTokens,
        thoughtTokens: params.thoughtTokens,
        truncated: params.truncated,
        guidanceTooShort: params.guidanceTooShort,
      }),
    );
  }

  private async executePolluxAdvisorConsultation(
    turnContext: PolluxTurnContext,
    requestBody: string,
    signal: AbortSignal,
    escalationMeta?: {
      reasonCode?: string;
      escalationTiming?: 'same_turn' | 'next_turn';
      pauseBoundary?: 'pre_tool' | 'post_event';
      contributingSignalIds?: readonly string[];
      contributingSignalAttributions?: readonly string[];
      sameTurnDowngraded?: boolean;
    },
  ): Promise<PolluxAdvisorConsultationResult> {
    const experimental = turnContext.experimental;

    const policyResult = await this.config.getPolicyEngine().check(
      {
        name: ADVISOR_CONSULTATION_TOOL_NAME,
        args: {},
      },
      undefined,
    );

    const advisorExecutorProfile =
      resolvePolluxAdvisorExecutorProfile(experimental);
    const checkpointReason =
      this.strictCheckpointReasonFromEscalationMeta(escalationMeta);
    this.noteStrictCheckpointRequested(checkpointReason);

    if (policyResult.decision !== PolicyDecision.ALLOW) {
      if (experimental.emitAdvisorDebug) {
        debugLogger.log(
          `Pollux advisor skipped (policy): ${policyResult.decision}`,
        );
      }
      if (escalationMeta?.reasonCode && escalationMeta.escalationTiming) {
        this.recordPolluxEscalationTelemetry({
          turnId: turnContext.turnId,
          reasonCode: escalationMeta.reasonCode,
          escalationTiming: escalationMeta.escalationTiming,
          outcome: 'policy_denied',
          sameTurnDowngraded: escalationMeta.sameTurnDowngraded,
          pauseBoundary: escalationMeta.pauseBoundary,
          contributingSignalIds: escalationMeta.contributingSignalIds,
          contributingSignalAttributions:
            escalationMeta.contributingSignalAttributions,
        });
      }
      return { outcome: 'policy_denied', checkpointReason };
    }
    const advisorMode = this.resolvePolluxAdvisorConsultationMode({
      turnContext,
      reasonCode: escalationMeta?.reasonCode,
      advisorExecutorProfile,
      checkpointReason,
    });
    const advisorInput = {
      context: turnContext,
      toolName: ADVISOR_CONSULTATION_TOOL_NAME,
      mode: advisorMode,
      advisorExecutorProfile,
      body: requestBody,
    } as const;
    const advisorPrompt = buildAdvisorConsultationPrompt(advisorInput);
    const timeoutSignal = AbortSignal.timeout(
      getAdvisorRequestTimeoutMs(experimental),
    );
    const advisorSignal = AbortSignal.any([signal, timeoutSignal]);
    let failOpenKind: AdvisorPathFailureKind | undefined;
    let consultationSucceeded = false;
    let winningGuidance:
      | {
          readonly guidance: string;
          readonly mustInclude?: readonly string[];
          readonly mustForbid?: readonly string[];
          readonly verifyBeforeDone?: readonly string[];
          readonly structuredConfidence?: number;
          readonly model: string;
          readonly attemptKind: PolluxAdvisorAttemptKind;
          readonly parserOutcome: PolluxAdvisorAttemptParserOutcome;
          readonly guidanceTooShort?: boolean;
          readonly truncated?: boolean;
        }
      | undefined;

    const advisorModel = resolvePolluxModel(experimental.advisorModel, {
      registry: this.polluxModelRegistry,
      role: PolluxModelRole.ADVISOR,
      experimental,
    });
    const fallbackModel =
      typeof experimental.advisorFallbackModel === 'string' &&
      experimental.advisorFallbackModel.length > 0
        ? resolvePolluxModel(experimental.advisorFallbackModel, {
            registry: this.polluxModelRegistry,
            role: PolluxModelRole.ADVISOR,
            experimental,
          }).canonicalModelId
        : null;

    coreEvents.emitPolluxAdvisorPhase({
      phase: 'pending',
      advisorModel: advisorModel.canonicalModelId,
      executorModel: experimental.executorModel,
      ...escalationMeta,
    });

    try {
      const primaryAttempt =
        await this.attemptPolluxAdvisorConsultationWithModel({
          turnId: turnContext.turnId,
          attemptIndex: 1,
          attemptKind: 'primary',
          advisorModelId: advisorModel.canonicalModelId,
          advisorPrompt,
          advisorMode,
          advisorExecutorProfile,
          checkpointReason,
          advisorSignal,
          executorModel: experimental.executorModel,
          escalationMeta,
        });
      this.noteStrictCheckpointAttempt(checkpointReason, primaryAttempt);
      consultationSucceeded = primaryAttempt.consultationSucceeded;
      failOpenKind = primaryAttempt.failOpenKind;
      if (primaryAttempt.consultationSucceeded && primaryAttempt.guidance) {
        winningGuidance = {
          guidance: primaryAttempt.guidance,
          mustInclude: primaryAttempt.mustInclude,
          mustForbid: primaryAttempt.mustForbid,
          verifyBeforeDone: primaryAttempt.verifyBeforeDone,
          structuredConfidence: primaryAttempt.structuredConfidence,
          model: primaryAttempt.model,
          attemptKind: primaryAttempt.attemptKind,
          parserOutcome: primaryAttempt.parserOutcome,
          guidanceTooShort: primaryAttempt.guidanceTooShort,
          truncated: primaryAttempt.truncated,
        };
      }

      if (experimental.emitAdvisorDebug) {
        debugLogger.log(
          `Pollux advisor primary attempt completed (success=${consultationSucceeded ? 'yes' : 'no'}, repair=${primaryAttempt.retryableForRepair ? 'yes' : 'no'}, fallback=${primaryAttempt.retryableForFallback ? 'yes' : 'no'})`,
        );
      }

      if (
        !consultationSucceeded &&
        primaryAttempt.retryableForRepair &&
        this.canUseRepairAttemptWithoutStarvingRequiredCheckpoints()
      ) {
        const repairPrompt = buildAdvisorConsultationRepairPrompt({
          input: advisorInput,
          previousResponse: primaryAttempt.rawResponse,
          previousFailure:
            primaryAttempt.outcome === 'empty_response'
              ? 'empty_response'
              : 'parse_error',
        });
        const repairAttempt =
          await this.attemptPolluxAdvisorConsultationWithModel({
            turnId: turnContext.turnId,
            attemptIndex: 2,
            attemptKind: 'repair_retry',
            advisorModelId: advisorModel.canonicalModelId,
            advisorPrompt: repairPrompt,
            advisorMode,
            advisorExecutorProfile,
            checkpointReason,
            advisorSignal,
            executorModel: experimental.executorModel,
            escalationMeta,
          });
        this.noteStrictCheckpointAttempt(checkpointReason, repairAttempt);
        consultationSucceeded = repairAttempt.consultationSucceeded;
        failOpenKind = repairAttempt.failOpenKind;
        if (repairAttempt.consultationSucceeded && repairAttempt.guidance) {
          winningGuidance = {
            guidance: repairAttempt.guidance,
            mustInclude: repairAttempt.mustInclude,
            mustForbid: repairAttempt.mustForbid,
            verifyBeforeDone: repairAttempt.verifyBeforeDone,
            structuredConfidence: repairAttempt.structuredConfidence,
            model: repairAttempt.model,
            attemptKind: repairAttempt.attemptKind,
            parserOutcome: repairAttempt.parserOutcome,
            guidanceTooShort: repairAttempt.guidanceTooShort,
            truncated: repairAttempt.truncated,
          };
        }
      } else if (!consultationSucceeded && primaryAttempt.retryableForRepair) {
        this.recordPolluxDiagnosticTrace('checkpoint_state', {
          reason: checkpointReason,
          status: 'repair_skipped_reserved_checkpoint_slot',
          remainingRequiredPrimaryAttempts:
            this.remainingRequiredCheckpointPrimaryAttempts(),
        });
      } else if (
        !consultationSucceeded &&
        primaryAttempt.retryableForFallback &&
        fallbackModel !== null &&
        this.canUseRepairAttemptWithoutStarvingRequiredCheckpoints()
      ) {
        const fallbackAttempt =
          await this.attemptPolluxAdvisorConsultationWithModel({
            turnId: turnContext.turnId,
            attemptIndex: 2,
            attemptKind: 'fallback',
            advisorModelId: fallbackModel,
            advisorPrompt,
            advisorMode,
            advisorExecutorProfile,
            checkpointReason,
            advisorSignal,
            executorModel: experimental.executorModel,
            escalationMeta,
          });
        this.noteStrictCheckpointAttempt(checkpointReason, fallbackAttempt);
        consultationSucceeded = fallbackAttempt.consultationSucceeded;
        failOpenKind = fallbackAttempt.failOpenKind;
        if (fallbackAttempt.consultationSucceeded && fallbackAttempt.guidance) {
          winningGuidance = {
            guidance: fallbackAttempt.guidance,
            mustInclude: fallbackAttempt.mustInclude,
            mustForbid: fallbackAttempt.mustForbid,
            verifyBeforeDone: fallbackAttempt.verifyBeforeDone,
            structuredConfidence: fallbackAttempt.structuredConfidence,
            model: fallbackAttempt.model,
            attemptKind: fallbackAttempt.attemptKind,
            parserOutcome: fallbackAttempt.parserOutcome,
            guidanceTooShort: fallbackAttempt.guidanceTooShort,
            truncated: fallbackAttempt.truncated,
          };
        }
      } else if (
        !consultationSucceeded &&
        primaryAttempt.retryableForFallback &&
        fallbackModel !== null
      ) {
        this.recordPolluxDiagnosticTrace('checkpoint_state', {
          reason: checkpointReason,
          status: 'fallback_skipped_reserved_checkpoint_slot',
          remainingRequiredPrimaryAttempts:
            this.remainingRequiredCheckpointPrimaryAttempts(),
        });
      }
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      failOpenKind =
        isAbortError(error) || timeoutSignal.aborted
          ? 'timeout'
          : this.classifyPolluxAdvisorFailure(error);
    } finally {
      if (failOpenKind && experimental.emitAdvisorDebug) {
        const failOpenOutcome = resolveAdvisorPathFailure(failOpenKind);
        debugLogger.warn(
          `Pollux advisor fail-open (${failOpenOutcome.failureKind}); continuing executor path.`,
        );
      }

      coreEvents.emitPolluxAdvisorPhase({
        phase: 'done',
        executorModel: experimental.executorModel,
        ...escalationMeta,
      });
    }

    const outcome: 'consulted' | 'fail_open' = consultationSucceeded
      ? 'consulted'
      : 'fail_open';
    if (escalationMeta?.reasonCode && escalationMeta.escalationTiming) {
      this.recordPolluxEscalationTelemetry({
        turnId: turnContext.turnId,
        reasonCode: escalationMeta.reasonCode,
        escalationTiming: escalationMeta.escalationTiming,
        outcome,
        sameTurnDowngraded: escalationMeta.sameTurnDowngraded,
        pauseBoundary: escalationMeta.pauseBoundary,
        contributingSignalIds: escalationMeta.contributingSignalIds,
        contributingSignalAttributions:
          escalationMeta.contributingSignalAttributions,
        failureKind: outcome === 'fail_open' ? failOpenKind : undefined,
      });
    }
    if (winningGuidance) {
      const guidanceInjection = {
        guidance: winningGuidance.guidance,
        mode: advisorMode,
        mustInclude: winningGuidance.mustInclude,
        mustForbid: winningGuidance.mustForbid,
        verifyBeforeDone: winningGuidance.verifyBeforeDone,
        turnId: turnContext.turnId,
        reasonCode: escalationMeta?.reasonCode,
        escalationTiming: escalationMeta?.escalationTiming,
        injectionTiming:
          escalationMeta?.escalationTiming === 'same_turn'
            ? 'same_turn_next_continuation'
            : 'next_turn',
        confidence: winningGuidance.structuredConfidence,
        parserOutcome: winningGuidance.parserOutcome,
        triggerMode: experimental.advisorTriggerMode,
        triggerSource: this.derivePolluxAdvisorTriggerSource({
          reasonCode: escalationMeta?.reasonCode,
          contributingSignalIds: escalationMeta?.contributingSignalIds,
        }),
        model: winningGuidance.model,
        attemptKind: winningGuidance.attemptKind,
        advisorExecutorProfile,
        guidanceQuality:
          winningGuidance.truncated === true
            ? 'truncated'
            : winningGuidance.guidanceTooShort === true
              ? 'too_short'
              : winningGuidance.attemptKind === 'fallback'
                ? 'fallback_structured'
                : 'structured',
      } satisfies PolluxAdvisorGuidanceInjection;
      if (escalationMeta?.escalationTiming === 'same_turn') {
        this.polluxPendingAdvisorGuidance = guidanceInjection;
      } else {
        this.injectPolluxAdvisorGuidance(guidanceInjection);
      }
      return {
        outcome: 'consulted',
        guidance: winningGuidance.guidance,
        structuredConfidence: winningGuidance.structuredConfidence,
        model: winningGuidance.model,
        attemptKind: winningGuidance.attemptKind,
        checkpointReason,
      };
    }
    return {
      outcome: 'fail_open',
      failureKind: failOpenKind,
      checkpointReason,
    };
  }

  private injectPolluxAdvisorGuidance(params: {
    readonly guidance: string;
    readonly mode?: AdvisorConsultationMode;
    readonly mustInclude?: readonly string[];
    readonly mustForbid?: readonly string[];
    readonly verifyBeforeDone?: readonly string[];
    readonly turnId?: string;
    readonly reasonCode?: string;
    readonly escalationTiming?: PolluxEscalationTiming;
    readonly injectionTiming?: PolluxAdvisorInjectionTiming;
    readonly confidence?: number;
    readonly parserOutcome?: PolluxAdvisorAttemptParserOutcome;
    readonly triggerMode?: 'executor_request' | 'detector' | 'hybrid';
    readonly triggerSource?: PolluxAdvisorTriggerSource;
    readonly model?: string;
    readonly attemptKind?: PolluxAdvisorAttemptKind;
    readonly advisorExecutorProfile?: PolluxAdvisorExecutorProfile;
    readonly guidanceQuality?:
      | 'none'
      | 'capacity_failed'
      | 'truncated'
      | 'too_short'
      | 'structured'
      | 'fallback_structured';
  }): void {
    const text = [
      '<pollux:advisor_guidance>',
      `reason=${params.reasonCode ?? 'unknown'}`,
      `timing=${params.escalationTiming ?? 'next_turn'}`,
      params.mode === undefined ? undefined : `mode=${params.mode}`,
      params.confidence === undefined
        ? undefined
        : `confidence=${params.confidence}`,
      '',
      'Use this guidance silently when continuing the task.',
      'Do not mention Pollux, advisor, or this hidden note to the user.',
      '',
      'Guidance:',
      params.guidance,
      ...(params.mustInclude && params.mustInclude.length > 0
        ? [
            '',
            'Must include:',
            ...params.mustInclude.map((item) => `- ${item}`),
          ]
        : []),
      ...(params.mustForbid && params.mustForbid.length > 0
        ? ['', 'Must forbid:', ...params.mustForbid.map((item) => `- ${item}`)]
        : []),
      ...(params.verifyBeforeDone && params.verifyBeforeDone.length > 0
        ? [
            '',
            'Verify before done:',
            ...params.verifyBeforeDone.map((item) => `- ${item}`),
          ]
        : []),
      '</pollux:advisor_guidance>',
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    this.getChat().addHistory(createUserContent(text));
    this.recordPolluxDiagnosticTrace('guidance_injection', {
      turnId: params.turnId,
      reasonCode: params.reasonCode,
      escalationTiming: params.escalationTiming,
      injectionTiming: params.injectionTiming ?? 'next_turn',
      mode: params.mode,
      guidanceChars: params.guidance.length,
      guidanceWords:
        params.guidance.trim().length === 0
          ? 0
          : params.guidance.trim().split(/\s+/u).length,
      mustIncludeCount: params.mustInclude?.length ?? 0,
      mustForbidCount: params.mustForbid?.length ?? 0,
      verifyBeforeDoneCount: params.verifyBeforeDone?.length ?? 0,
    });

    if (params.turnId) {
      const trimmedGuidance = params.guidance.trim();
      logPolluxAdvisorGuidance(
        this.config,
        new PolluxAdvisorGuidanceTelemetryEvent({
          turnId: params.turnId,
          reasonCode: params.reasonCode,
          escalationTiming: params.escalationTiming,
          injectionTiming: params.injectionTiming ?? 'next_turn',
          guidanceChars: params.guidance.length,
          guidanceWords:
            trimmedGuidance.length === 0
              ? 0
              : trimmedGuidance.split(/\s+/u).length,
          parserOutcome: params.parserOutcome,
          advisorTriggerMode: params.triggerMode,
          advisorTriggerSource: params.triggerSource ?? 'unknown',
          model: params.model,
          attemptKind: params.attemptKind,
          advisorExecutorProfile: params.advisorExecutorProfile,
          guidanceQuality: params.guidanceQuality,
        }),
      );
    }
  }

  private flushPolluxPendingAdvisorGuidance(): void {
    const pending = this.polluxPendingAdvisorGuidance;
    if (!pending) {
      return;
    }
    this.polluxPendingAdvisorGuidance = undefined;
    this.injectPolluxAdvisorGuidance(pending);
  }

  private derivePolluxAdvisorTriggerSource(params: {
    readonly reasonCode?: string;
    readonly contributingSignalIds?: readonly string[];
  }): PolluxAdvisorTriggerSource {
    const signalIds = params.contributingSignalIds ?? [];
    if (
      params.reasonCode ===
        PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST ||
      signalIds.some((signalId) => signalId === 'self.advisor_request')
    ) {
      if (signalIds.some((signalId) => signalId === 'self.advisor_request')) {
        return 'executor_request';
      }
      return 'executor_request';
    }
    if (
      params.reasonCode ===
        PolluxEscalationReasonCode.EXECUTOR_CHECKPOINT_REQUEST ||
      signalIds.some(
        (signalId) => signalId === 'tool.executor_checkpoint_advisor',
      )
    ) {
      return 'executor_request_checkpoint_default';
    }
    if (
      params.reasonCode === PolluxEscalationReasonCode.PRE_MUTATION_REVIEW ||
      signalIds.some((signalId) => signalId === 'tool.pre_mutation_advisor')
    ) {
      return 'pre_mutation';
    }
    if (
      params.reasonCode === PolluxEscalationReasonCode.FINAL_CONSTRAINT_AUDIT ||
      signalIds.some((signalId) => signalId === 'tool.finalization_audit')
    ) {
      return 'final_audit';
    }
    if (params.reasonCode === PolluxEscalationReasonCode.RISK_GATE_BLOCK) {
      return 'risk_gate';
    }
    if (
      params.reasonCode === PolluxEscalationReasonCode.FUSION_COMPOSITE ||
      params.reasonCode ===
        PolluxEscalationReasonCode.FUSION_COMPOSITE_EMPHATIC ||
      params.reasonCode === PolluxEscalationReasonCode.FUSION_BUDGET_TARGET
    ) {
      return 'fusion';
    }
    if (params.reasonCode === PolluxEscalationReasonCode.SELF_REPORT_STUCK) {
      return 'self_status';
    }
    if (params.reasonCode === PolluxEscalationReasonCode.HARD_LOOP) {
      return 'loop';
    }
    return 'unknown';
  }

  private resolvePolluxAdvisorConsultationMode(params: {
    readonly turnContext: PolluxTurnContext;
    readonly reasonCode?: string;
    readonly advisorExecutorProfile?: PolluxAdvisorExecutorProfile;
    readonly checkpointReason?: string;
  }): AdvisorConsultationMode {
    if (
      params.reasonCode === PolluxEscalationReasonCode.FINAL_CONSTRAINT_AUDIT ||
      params.checkpointReason === 'final diff audit before completion'
    ) {
      return 'final_audit';
    }
    const summary = parsePromptConstraintSummary(
      params.turnContext.userContentDigest,
    );
    const hasHighRiskConstraint =
      summary.hasNegativeSpaceConstraint ||
      summary.hasExplicitCompletenessConstraint ||
      summary.hasStateMachineConstraint ||
      summary.hasTerminalStateConstraint ||
      summary.hasStructuredMapConstraint ||
      summary.hasForbiddenBehaviorConstraint ||
      summary.hasCompatibilityAliasConstraint;
    const userDigest = params.turnContext.userContentDigest ?? '';
    const isM3BenchmarkTask =
      /\bM3-BM-\d+\b/i.test(userDigest) || /\bm3-done\.txt\b/i.test(userDigest);
    if (
      params.advisorExecutorProfile === 'flash_lite' &&
      (hasHighRiskConstraint || isM3BenchmarkTask)
    ) {
      return 'constraint_audit';
    }
    return hasHighRiskConstraint ? 'constraint_audit' : 'compact';
  }

  private classifyStrictCheckpointGuidanceFailure(params: {
    readonly checkpointReason?: string;
    readonly advisorExecutorProfile: PolluxAdvisorExecutorProfile;
    readonly guidance: string;
    readonly mustInclude?: readonly string[];
    readonly mustForbid?: readonly string[];
    readonly verifyBeforeDone?: readonly string[];
    readonly parserOutcome: PolluxAdvisorAttemptParserOutcome;
    readonly truncated: boolean;
    readonly contextText: string;
  }): string | undefined {
    if (!params.checkpointReason) {
      return undefined;
    }
    const checkpoints =
      this.config.getPolluxExperimentalConfig().executorCheckpoints;
    if (!checkpoints.enforceRequired) {
      return undefined;
    }
    if (checkpoints.rejectTruncatedGuidance && params.truncated) {
      return 'truncated_guidance';
    }
    const guidanceWords = countWords(params.guidance);
    if (
      params.parserOutcome === 'plain_text_fallback' &&
      guidanceWords < checkpoints.minGuidanceWords
    ) {
      return 'guidance_too_short';
    }
    if (
      checkpoints.requireStructuredGuidance &&
      (params.mustInclude?.length ?? 0) === 0 &&
      (params.mustForbid?.length ?? 0) === 0 &&
      (params.verifyBeforeDone?.length ?? 0) === 0
    ) {
      return 'unstructured_guidance';
    }
    if (params.advisorExecutorProfile === 'strict_fd') {
      const guidanceText = collectAdvisorGuidanceText(params);
      const hasConcreteRepoCheck =
        STRICT_FD_SOURCE_PATH_RE.test(guidanceText) ||
        STRICT_FD_FINAL_VERIFICATION_RE.test(guidanceText);
      if (
        STRICT_FD_GENERIC_PLANNING_GUIDANCE_RE.test(guidanceText) &&
        !hasConcreteRepoCheck
      ) {
        return 'generic_planning_guidance';
      }
      const looksLikeGoTask = strictFdContextLooksLikeGoTask(
        `${params.contextText}\n${this.polluxActiveUserPromptText}`,
      );
      const looksLikeJsTsTask = strictFdContextLooksLikeJsTsTask(
        `${params.contextText}\n${this.polluxActiveUserPromptText}`,
      );
      if (
        looksLikeGoTask &&
        STRICT_FD_GO_OFF_DOMAIN_GUIDANCE_RE.test(guidanceText)
      ) {
        return 'off_domain_guidance';
      }
      if (
        (looksLikeGoTask || looksLikeJsTsTask) &&
        normalizedPolluxCheckpointReason(params.checkpointReason) ===
          normalizedPolluxCheckpointReason(STRICT_FD_FINAL_AUDIT_REASON) &&
        !strictFdHasExecutableFinalVerification(params.verifyBeforeDone)
      ) {
        return 'missing_final_verification';
      }
    }
    return undefined;
  }

  private async attemptPolluxAdvisorConsultationWithModel(params: {
    turnId: string;
    attemptIndex: number;
    attemptKind: PolluxAdvisorAttemptKind;
    advisorModelId: string;
    advisorPrompt: string;
    advisorMode?: AdvisorConsultationMode;
    advisorExecutorProfile: PolluxAdvisorExecutorProfile;
    checkpointReason?: string;
    advisorSignal: AbortSignal;
    executorModel: string;
    escalationMeta:
      | {
          reasonCode?: string;
          escalationTiming?: 'same_turn' | 'next_turn';
          pauseBoundary?: 'pre_tool' | 'post_event';
          contributingSignalIds?: readonly string[];
          contributingSignalAttributions?: readonly string[];
          sameTurnDowngraded?: boolean;
        }
      | undefined;
  }): Promise<PolluxAdvisorAttemptResult> {
    coreEvents.emitPolluxAdvisorPhase({
      phase: 'consulting',
      advisorModel: params.advisorModelId,
      executorModel: params.executorModel,
      ...params.escalationMeta,
    });

    // eslint-disable-next-line no-console
    console.log(`[Pollux] Consulting advisor (${params.advisorModelId})...`);

    let result: PolluxAdvisorAttemptResult | undefined;
    try {
      const experimental = this.config.getPolluxExperimentalConfig();
      if (experimental.advisorShamEnabled) {
        const rawResponse = JSON.stringify({
          guidance: experimental.advisorShamGuidance,
          confidence: 5,
        });
        result = {
          attemptIndex: params.attemptIndex,
          attemptKind: params.attemptKind,
          model: `sham:${params.advisorModelId}`,
          parserOutcome: 'direct',
          outcome: 'consulted',
          consultationSucceeded: true,
          rawResponse,
          guidance: experimental.advisorShamGuidance,
          structuredConfidence: 5,
          advisorExecutorProfile: params.advisorExecutorProfile,
          outputFinishReason: 'STOP',
          visibleOutputTokens: countWords(experimental.advisorShamGuidance),
          thoughtTokens: 0,
          truncated: false,
          guidanceTooShort: false,
          retryableForRepair: false,
          retryableForFallback: false,
        };
        return result;
      }

      const advisorResponse = await this.generateContent(
        {
          model: params.advisorModelId,
          isChatModel: true,
        },
        [createUserContent(params.advisorPrompt)],
        params.advisorSignal,
        LlmRole.UTILITY_ADVISOR,
        {
          maxAttemptsOverride: 1,
          systemInstructionOverride:
            'You are a concise advisor for an executor model. Return only the requested guidance.',
          generateContentConfigOverride: {
            maxOutputTokens: (() => {
              const mode = params.advisorMode ?? 'compact';
              if (params.advisorExecutorProfile === 'strict_fd') {
                return mode === 'compact' ? 1024 : 2048;
              }
              if (params.advisorExecutorProfile === 'flash_lite') {
                return mode === 'compact' ? 1024 : 1536;
              }
              return mode === 'compact' ? 384 : 512;
            })(),
            temperature: 0.2,
          },
        },
      );
      // eslint-disable-next-line no-console
      console.log(`[Pollux] Advisor consultation finished.`);
      this.tracePolluxAdvisorThoughts(advisorResponse, {
        turnId: params.turnId,
        attemptIndex: params.attemptIndex,
        attemptKind: params.attemptKind,
        model: params.advisorModelId,
        advisorMode: params.advisorMode,
        reasonCode: params.escalationMeta?.reasonCode,
        escalationTiming: params.escalationMeta?.escalationTiming,
      });

      const rawAdvisorResponse = getResponseText(advisorResponse) ?? '';
      const outputFinishReason =
        advisorResponse.candidates?.[0]?.finishReason?.toString();
      const visibleOutputTokens =
        advisorResponse.usageMetadata?.candidatesTokenCount ?? 0;
      const thoughtTokens =
        advisorResponse.usageMetadata?.thoughtsTokenCount ?? 0;
      const truncated = isTruncatedAdvisorResponse({
        finishReason: outputFinishReason,
        rawResponse: rawAdvisorResponse,
      });
      const classifiedRawFailure =
        rawAdvisorResponse.trim().length > 0
          ? this.classifyPolluxAdvisorFailure(new Error(rawAdvisorResponse))
          : undefined;
      if (classifiedRawFailure && classifiedRawFailure !== 'parse_error') {
        result = {
          attemptIndex: params.attemptIndex,
          attemptKind: params.attemptKind,
          model: params.advisorModelId,
          parserOutcome: classifiedRawFailure,
          outcome: classifiedRawFailure,
          consultationSucceeded: false,
          failOpenKind: classifiedRawFailure,
          rawResponse: rawAdvisorResponse,
          advisorExecutorProfile: params.advisorExecutorProfile,
          outputFinishReason,
          visibleOutputTokens,
          thoughtTokens,
          truncated,
          strictCheckpointConsultedGood: params.checkpointReason
            ? false
            : undefined,
          retryableForRepair: false,
          retryableForFallback:
            params.attemptKind === 'primary' &&
            (classifiedRawFailure === 'timeout' ||
              classifiedRawFailure === 'capacity_exhausted' ||
              classifiedRawFailure === 'quota_exhausted'),
        };
        return result;
      }
      const parsedResponse = parseAdvisorModelResponse(rawAdvisorResponse);
      if (!parsedResponse.ok) {
        const failOpenKind =
          classifiedRawFailure && classifiedRawFailure !== 'parse_error'
            ? classifiedRawFailure
            : parsedResponse.reason === 'empty_response'
              ? 'empty_response'
              : 'parse_error';
        result = {
          attemptIndex: params.attemptIndex,
          attemptKind: params.attemptKind,
          model: params.advisorModelId,
          parserOutcome:
            classifiedRawFailure && classifiedRawFailure !== 'parse_error'
              ? classifiedRawFailure
              : parsedResponse.parserOutcome,
          outcome: failOpenKind,
          consultationSucceeded: false,
          failOpenKind,
          rawResponse: rawAdvisorResponse,
          advisorExecutorProfile: params.advisorExecutorProfile,
          outputFinishReason,
          visibleOutputTokens,
          thoughtTokens,
          truncated,
          strictCheckpointConsultedGood: params.checkpointReason
            ? false
            : undefined,
          retryableForRepair:
            params.attemptKind === 'primary' &&
            (parsedResponse.reason === 'empty_response' ||
              parsedResponse.reason === 'malformed_json' ||
              parsedResponse.reason === 'schema' ||
              truncated),
          retryableForFallback: false,
        };
        return result;
      }
      const guidanceTooShort = isFlashLiteGuidanceTooShort({
        advisorExecutorProfile: params.advisorExecutorProfile,
        guidance: parsedResponse.guidance,
        mustInclude: parsedResponse.mustInclude,
        verifyBeforeDone: parsedResponse.verifyBeforeDone,
      });
      const strictCheckpointFailure =
        this.classifyStrictCheckpointGuidanceFailure({
          checkpointReason: params.checkpointReason,
          advisorExecutorProfile: params.advisorExecutorProfile,
          guidance: parsedResponse.guidance,
          mustInclude: parsedResponse.mustInclude,
          mustForbid: parsedResponse.mustForbid,
          verifyBeforeDone: parsedResponse.verifyBeforeDone,
          parserOutcome: parsedResponse.parserOutcome,
          truncated,
          contextText: this.polluxActiveUserPromptText,
        });
      if (
        (params.advisorExecutorProfile === 'flash_lite' &&
          (truncated || guidanceTooShort)) ||
        strictCheckpointFailure
      ) {
        result = {
          attemptIndex: params.attemptIndex,
          attemptKind: params.attemptKind,
          model: params.advisorModelId,
          parserOutcome: 'parse_error',
          outcome: 'parse_error',
          consultationSucceeded: false,
          failOpenKind: 'parse_error',
          rawResponse: rawAdvisorResponse,
          guidance: parsedResponse.guidance,
          mustInclude: parsedResponse.mustInclude,
          mustForbid: parsedResponse.mustForbid,
          verifyBeforeDone: parsedResponse.verifyBeforeDone,
          structuredConfidence: parsedResponse.structuredConfidence,
          advisorExecutorProfile: params.advisorExecutorProfile,
          outputFinishReason,
          visibleOutputTokens,
          thoughtTokens,
          truncated,
          guidanceTooShort:
            guidanceTooShort ||
            strictCheckpointFailure === 'guidance_too_short',
          strictCheckpointFailureKind: strictCheckpointFailure,
          strictCheckpointConsultedGood: false,
          retryableForRepair: params.attemptKind === 'primary',
          retryableForFallback: false,
        };
        return result;
      }

      if (this.config.getPolluxExperimentalConfig().emitAdvisorDebug) {
        debugLogger.log(
          `Pollux advisor consulted (confidence=${parsedResponse.structuredConfidence ?? 'n/a'})`,
        );
      }

      result = {
        attemptIndex: params.attemptIndex,
        attemptKind: params.attemptKind,
        model: params.advisorModelId,
        parserOutcome: parsedResponse.parserOutcome,
        outcome: 'consulted',
        consultationSucceeded: true,
        rawResponse: rawAdvisorResponse,
        guidance: parsedResponse.guidance,
        mustInclude: parsedResponse.mustInclude,
        mustForbid: parsedResponse.mustForbid,
        verifyBeforeDone: parsedResponse.verifyBeforeDone,
        structuredConfidence: parsedResponse.structuredConfidence,
        advisorExecutorProfile: params.advisorExecutorProfile,
        outputFinishReason,
        visibleOutputTokens,
        thoughtTokens,
        truncated,
        guidanceTooShort,
        strictCheckpointConsultedGood: params.checkpointReason
          ? true
          : undefined,
        retryableForRepair: false,
        retryableForFallback: false,
      };
      if (
        this.config.getPolluxExperimentalConfig().diagnosticTrace
          .includeAdvisorGuidanceText
      ) {
        this.recordPolluxDiagnosticTrace('advisor_guidance', {
          turnId: params.turnId,
          model: params.advisorModelId,
          advisorMode: params.advisorMode,
          parserOutcome: parsedResponse.parserOutcome,
          guidance: parsedResponse.guidance,
          mustInclude: parsedResponse.mustInclude ?? [],
          mustForbid: parsedResponse.mustForbid ?? [],
          verifyBeforeDone: parsedResponse.verifyBeforeDone ?? [],
        });
      }
      return result;
    } catch (error) {
      if (params.advisorSignal.aborted && isAbortError(error)) {
        result = {
          attemptIndex: params.attemptIndex,
          attemptKind: params.attemptKind,
          model: params.advisorModelId,
          parserOutcome: 'timeout',
          outcome: 'timeout',
          consultationSucceeded: false,
          failOpenKind: 'timeout',
          rawResponse: '',
          advisorExecutorProfile: params.advisorExecutorProfile,
          outputFinishReason: 'timeout',
          visibleOutputTokens: 0,
          thoughtTokens: 0,
          truncated: false,
          strictCheckpointConsultedGood: params.checkpointReason
            ? false
            : undefined,
          retryableForRepair: false,
          retryableForFallback: params.attemptKind === 'primary',
        };
        return result;
      }

      const failOpenKind = this.classifyPolluxAdvisorFailure(error);
      result = {
        attemptIndex: params.attemptIndex,
        attemptKind: params.attemptKind,
        model: params.advisorModelId,
        parserOutcome:
          failOpenKind === 'parse_error' ? 'parse_error' : failOpenKind,
        outcome: failOpenKind,
        consultationSucceeded: false,
        failOpenKind,
        rawResponse: '',
        advisorExecutorProfile: params.advisorExecutorProfile,
        visibleOutputTokens: 0,
        thoughtTokens: 0,
        truncated: false,
        strictCheckpointConsultedGood: params.checkpointReason
          ? false
          : undefined,
        retryableForRepair: false,
        retryableForFallback:
          params.attemptKind === 'primary' &&
          (failOpenKind === 'timeout' ||
            failOpenKind === 'capacity_exhausted' ||
            failOpenKind === 'quota_exhausted'),
      };
      return result;
    } finally {
      this.polluxAdvisorCallsThisTurn++;
      this.polluxAdvisorCallsThisSession++;

      if (
        params.escalationMeta?.reasonCode &&
        params.escalationMeta.escalationTiming &&
        result
      ) {
        this.recordPolluxDiagnosticTrace('advisor_attempt', {
          turnId: params.turnId,
          reasonCode: params.escalationMeta.reasonCode,
          escalationTiming: params.escalationMeta.escalationTiming,
          attemptIndex: result.attemptIndex,
          attemptKind: result.attemptKind,
          model: result.model,
          advisorMode: params.advisorMode,
          parserOutcome: result.parserOutcome,
          outcome: result.outcome,
          failureKind: result.failOpenKind,
          checkpointReason: params.checkpointReason,
          checkpointConsultedGood: result.strictCheckpointConsultedGood,
          strictCheckpointFailureKind: result.strictCheckpointFailureKind,
          advisorExecutorProfile: result.advisorExecutorProfile,
          outputFinishReason: result.outputFinishReason,
          visibleOutputTokens: result.visibleOutputTokens,
          thoughtTokens: result.thoughtTokens,
          truncated: result.truncated,
          guidanceTooShort: result.guidanceTooShort,
        });
        this.recordPolluxAdvisorAttemptTelemetry({
          turnId: params.turnId,
          reasonCode: params.escalationMeta.reasonCode,
          escalationTiming: params.escalationMeta.escalationTiming,
          attemptIndex: result.attemptIndex,
          attemptKind: result.attemptKind,
          model: result.model,
          parserOutcome: result.parserOutcome,
          outcome: result.outcome,
          failureKind: result.failOpenKind,
          advisorExecutorProfile: result.advisorExecutorProfile,
          outputFinishReason: result.outputFinishReason,
          visibleOutputTokens: result.visibleOutputTokens,
          thoughtTokens: result.thoughtTokens,
          truncated: result.truncated,
          guidanceTooShort: result.guidanceTooShort,
        });
      }
    }
  }

  private classifyPolluxAdvisorFailure(error: unknown): AdvisorPathFailureKind {
    const errorName = error instanceof Error ? error.name : undefined;
    const message = getErrorMessage(error);
    const normalizedMessage = message.toLowerCase();

    if (
      isAbortError(error) ||
      /user aborted a request|request was aborted|\baborted\b|\btimeout\b|timed out/i.test(
        message,
      )
    ) {
      return 'timeout';
    }
    if (
      error instanceof TerminalQuotaError ||
      errorName === 'TerminalQuotaError' ||
      /\b(quota_exhausted|quota_exceeded)\b/i.test(message) ||
      /quota exhausted|quota_exhausted|exhausted your capacity|quota exceeded|insufficient quota|quota limit|too many requests|\b429\b/i.test(
        normalizedMessage,
      )
    ) {
      return 'quota_exhausted';
    }
    if (
      error instanceof RetryableQuotaError ||
      errorName === 'RetryableQuotaError' ||
      /\b(model_capacity_exhausted|resource_exhausted|rate_limit_exceeded)\b/i.test(
        message,
      ) ||
      /no capacity available|capacity exhausted|resource exhausted|rate limit/i.test(
        normalizedMessage,
      )
    ) {
      return 'capacity_exhausted';
    }

    const failureKind = classifyFailureKind(error);
    if (failureKind === 'transient') {
      return 'capacity_exhausted';
    }
    if (failureKind === 'terminal') {
      return 'quota_exhausted';
    }

    return 'parse_error';
  }

  private async maybeRunPolluxAdvisorConsultation(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    runtimeSurface: PolluxRuntimeSurface,
  ): Promise<void> {
    const experimental = this.config.getPolluxExperimentalConfig();
    const pendingNextTurnIntent =
      this.polluxPendingNextTurnIntent ?? this.polluxPendingLoopNextTurnIntent;
    const eligibility = checkPolluxEligibility({
      runtimeSurface,
      experimental,
      callsCompletedThisTurn: this.polluxAdvisorCallsThisTurn,
      callsCompletedThisSession: this.polluxAdvisorCallsThisSession,
    });
    if (!eligibility.eligible) {
      if (
        experimental.emitAdvisorDebug &&
        eligibility.blockReason === 'budget'
      ) {
        debugLogger.log('Pollux advisor skipped (budget).');
      }
      if (pendingNextTurnIntent && eligibility.blockReason === 'budget') {
        const sameTurnDowngraded =
          pendingNextTurnIntent.timing === 'next_turn' &&
          POLLUX_ESCALATION_TIMING[pendingNextTurnIntent.reasonCode] ===
            'same_turn';
        this.recordPolluxEscalationTelemetry({
          turnId: `${prompt_id}:${this.sessionTurnCount}`,
          reasonCode: pendingNextTurnIntent.reasonCode,
          escalationTiming: pendingNextTurnIntent.timing,
          outcome: 'budget_exhausted',
          sameTurnDowngraded,
          pauseBoundary: undefined,
          contributingSignalIds: pendingNextTurnIntent.contributingSignalIds,
          contributingSignalAttributions:
            pendingNextTurnIntent.contributingSignalAttributions,
        });
      }
      return;
    }

    // F.1.1: prefer the unified next-turn intent slot introduced in Phase F.
    // It supersedes the Phase C loop-only slot when both are set (the loop
    // slot is kept for backward compatibility and tested migration paths).
    if (pendingNextTurnIntent) {
      const outcome = await this.maybeRunPolluxAdvisorConsultationForIntent(
        request,
        signal,
        prompt_id,
        runtimeSurface,
        pendingNextTurnIntent,
      );
      if (outcome !== 'budget_exhausted') {
        // Consumed (or dropped via policy/fail-open) -> clear both slots so
        // the intent is not replayed on subsequent turns.
        this.polluxPendingNextTurnIntent = undefined;
        this.polluxPendingLoopNextTurnIntent = undefined;
      }
      return;
    }
  }

  private async maybeRunPolluxAdvisorConsultationForIntent(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    runtimeSurface: PolluxRuntimeSurface,
    intent: SameTurnIntent | NextTurnIntent,
    options: { sameTurnDowngraded?: boolean } = {},
  ): Promise<PolluxIntentConsultationOutcome> {
    const experimental = this.config.getPolluxExperimentalConfig();
    const inferredDowngrade =
      intent.timing === 'next_turn' &&
      POLLUX_ESCALATION_TIMING[intent.reasonCode] === 'same_turn';
    const sameTurnDowngraded =
      options.sameTurnDowngraded === true || inferredDowngrade
        ? true
        : undefined;
    const checkpointReason = this.strictCheckpointReasonFromIntent(intent);
    this.noteStrictCheckpointRequested(checkpointReason);
    if (this.shouldSuppressStrictFinalAuditAdvisorRequest(checkpointReason)) {
      this.noteStrictFinalAuditDuplicateSuppressed(checkpointReason);
      return 'skipped';
    }

    const eligibility = checkPolluxEligibility({
      runtimeSurface,
      experimental,
      callsCompletedThisTurn: this.polluxAdvisorCallsThisTurn,
      callsCompletedThisSession: this.polluxAdvisorCallsThisSession,
    });
    if (!eligibility.eligible) {
      const outcome =
        eligibility.blockReason === 'budget' ? 'budget_exhausted' : 'skipped';
      this.recordPolluxEscalationTelemetry({
        turnId: `${prompt_id}:${this.sessionTurnCount}`,
        reasonCode: intent.reasonCode,
        escalationTiming: intent.timing,
        outcome,
        sameTurnDowngraded,
        pauseBoundary:
          intent.timing === 'same_turn' ? intent.pauseBoundary : undefined,
        contributingSignalIds: intent.contributingSignalIds,
        contributingSignalAttributions: intent.contributingSignalAttributions,
      });
      if (outcome === 'budget_exhausted') {
        this.noteStrictCheckpointBudgetBlocked(checkpointReason);
      }
      return outcome;
    }

    let pendingToolContextOverride: string | undefined;
    if (intent.timing === 'same_turn' && intent.pendingTool) {
      try {
        pendingToolContextOverride = JSON.stringify({
          name: intent.pendingTool.name,
          args: intent.pendingTool.args,
        });
      } catch {
        pendingToolContextOverride = 'unserializable pending tool context';
      }
    }

    const isFunctionResponseContinuation =
      isFunctionResponseOnlyRequest(request) &&
      this.polluxActiveObserverPromptId === prompt_id &&
      this.polluxActiveUserPromptText.length > 0;
    const advisorRequestBody = isFunctionResponseContinuation
      ? this.polluxActiveUserPromptText
      : partListUnionToString(request);

    const strictCheckpointContextOverride =
      this.buildStrictCheckpointContextPacket({
        reason: checkpointReason,
        intent,
        pendingToolContextOverride,
      });

    const turnContext = this.buildPolluxTurnContext(
      request,
      prompt_id,
      runtimeSurface,
      experimental,
      strictCheckpointContextOverride,
      isFunctionResponseContinuation
        ? this.polluxActiveUserPromptText
        : undefined,
    );

    const adaptiveBudget = this.checkPolluxAdaptiveAdvisorBudget(
      turnContext,
      intent.reasonCode,
    );
    if (!adaptiveBudget.allowed) {
      this.recordPolluxEscalationTelemetry({
        turnId: `${prompt_id}:${this.sessionTurnCount}`,
        reasonCode: intent.reasonCode,
        escalationTiming: intent.timing,
        outcome: 'budget_exhausted',
        sameTurnDowngraded,
        pauseBoundary:
          intent.timing === 'same_turn' ? intent.pauseBoundary : undefined,
        contributingSignalIds: intent.contributingSignalIds,
        contributingSignalAttributions: intent.contributingSignalAttributions,
      });
      this.noteStrictCheckpointBudgetBlocked(checkpointReason);
      return 'budget_exhausted';
    }

    // F.1.6 attribution: mark `sameTurnDowngraded` when either the caller
    // explicitly flags it (single-shot / kill switch / budget) OR the intent
    // carries a canonically same-turn reason code but is being run next-turn
    // (I11 inference so legacy paths still surface downgrades in telemetry).
    if (
      intent.reasonCode ===
      PolluxEscalationReasonCode.EXECUTOR_CHECKPOINT_REQUEST
    ) {
      this.recordPolluxDiagnosticTrace('fr_decision_checkpoint', {
        turnId: turnContext.turnId,
        reasonCode: intent.reasonCode,
        outcome: 'checkpoint_default_consult',
        contributingSignalIds: intent.contributingSignalIds,
        contributingSignalAttributions: intent.contributingSignalAttributions,
      });
    }

    const result = await this.executePolluxAdvisorConsultation(
      turnContext,
      advisorRequestBody,
      signal,
      {
        reasonCode: intent.reasonCode,
        escalationTiming: intent.timing,
        pauseBoundary:
          intent.timing === 'same_turn' ? intent.pauseBoundary : undefined,
        contributingSignalIds: intent.contributingSignalIds,
        contributingSignalAttributions: intent.contributingSignalAttributions,
        sameTurnDowngraded,
      },
    );
    return result.outcome;
  }

  private checkPolluxAdaptiveAdvisorBudget(
    turnContext: PolluxTurnContext,
    reasonCode?: string,
  ): { readonly allowed: true } | { readonly allowed: false } {
    const experimental = turnContext.experimental;
    if (experimental.advisorBudgetMode !== 'adaptive') {
      return { allowed: true };
    }
    const heuristic = experimental.longTaskHeuristic;
    const digestLength = turnContext.userContentDigest?.length ?? 0;
    const hasContinuationContext =
      (turnContext.pendingToolContext?.trim().length ?? 0) > 0;
    const longReason =
      reasonCode === PolluxEscalationReasonCode.PRE_MUTATION_REVIEW ||
      reasonCode === PolluxEscalationReasonCode.FINAL_CONSTRAINT_AUDIT ||
      reasonCode === PolluxEscalationReasonCode.EXECUTOR_CHECKPOINT_REQUEST ||
      reasonCode === PolluxEscalationReasonCode.HARD_LOOP ||
      reasonCode === PolluxEscalationReasonCode.FUSION_COMPOSITE ||
      reasonCode === PolluxEscalationReasonCode.FUSION_COMPOSITE_EMPHATIC ||
      reasonCode === PolluxEscalationReasonCode.FUSION_BUDGET_TARGET;
    const isLongTask =
      digestLength >= heuristic.minPromptChars ||
      (heuristic.anchoredMutation && hasContinuationContext) ||
      longReason;
    const adaptiveLimit = isLongTask
      ? experimental.maxAdvisorCallsLongTask
      : experimental.maxAdvisorCallsShortTask;
    const effectiveLimit = Math.min(
      experimental.maxAdvisorCallsPerTurn,
      adaptiveLimit,
    );
    return turnContext.advisorCallsThisTurn >= effectiveLimit
      ? { allowed: false }
      : { allowed: true };
  }

  /**
   * Phase F §F.1.3 + §F.1.4: execute a same-turn consult if the guardrail
   * chain permits, else explicitly downgrade the intent to a next-turn slot
   * on the client.
   *
   * Guardrails (in order):
   *   1. Single-shot: only one same-turn consult per turn (I11).
   *   2. Kill switch: `detector.timing.sameTurnEnabled === false` -> downgrade.
   *   3. Budget cap: if a pre-check would be refused (I6) -> downgrade.
   *
   * On a successful same-turn consult, `polluxSameTurnFiredThisTurn` is set
   * so subsequent same-turn-eligible intents in the same turn are forced to
   * downgrade (I11 / no recursion).
   *
   * On downgrade, the caller's same-turn intent is preserved into
   * `polluxPendingNextTurnIntent` with its `reasonCode` + `contributingSignalIds`
   * intact; `sameTurnDowngraded: true` is emitted with the telemetry.
   *
   * Fail-open: any thrown error (policy, transport, timeout) is swallowed
   * unless the outer signal is aborted. Observer state is untouched.
   */
  private async runPolluxSameTurnConsult(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    runtimeSurface: PolluxRuntimeSurface,
    intent: SameTurnIntent,
    polluxObserver: LiveExecutorObserver,
  ): Promise<PolluxIntentConsultationOutcome> {
    const experimental = this.config.getPolluxExperimentalConfig();
    const sameTurnEnabled = experimental.detector.timing.sameTurnEnabled;
    const checkpointReason = this.strictCheckpointReasonFromIntent(intent);
    if (this.shouldSuppressStrictFinalAuditAdvisorRequest(checkpointReason)) {
      this.noteStrictCheckpointRequested(checkpointReason);
      this.noteStrictFinalAuditDuplicateSuppressed(checkpointReason);
      polluxObserver.noteAdvisorSuccess(true, intent.contributingSignalIds);
      return 'skipped';
    }

    const executorRequestKey = polluxExecutorAdvisorRequestKey(intent);
    const canUseMultiCheckpointSlot =
      intent.reasonCode ===
        PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST &&
      (experimental.advisorTriggerMode === 'hybrid' ||
        experimental.advisorTriggerMode === 'executor_request') &&
      !this.polluxSameTurnExecutorRequestKeysThisTurn.has(executorRequestKey);
    const singleShotBlocked =
      this.polluxSameTurnFiredThisTurn && !canUseMultiCheckpointSlot;
    const killSwitchBlocked = !sameTurnEnabled;

    // Pre-check budget at same-turn trigger time. The nested
    // `maybeRunPolluxAdvisorConsultationForIntent` also enforces this, but the
    // explicit pre-check is required so we can record the downgrade as such
    // (instead of letting the same-turn path silently turn into budget_exhausted).
    const budgetCheck = checkAdvisorInvocationBudget(experimental, {
      callsCompletedThisTurn: this.polluxAdvisorCallsThisTurn,
      callsCompletedThisSession: this.polluxAdvisorCallsThisSession,
    });
    const budgetBlocked = !budgetCheck.allowed;

    const downgradeRequired =
      singleShotBlocked || killSwitchBlocked || budgetBlocked;

    if (downgradeRequired) {
      const downgraded = buildPolluxDowngradedNextTurnIntent(intent);
      // Explicit same-turn downgrades unconditionally own the next-turn slot;
      // the stronger-intent merge happens at observer harvest (see
      // consumePendingNextTurnIntent and the `netScore >= existing.netScore`
      // guard in the harvest block below), which is the only place
      // arbitration against observer-originated intents lives. An explicit
      // guardrail downgrade beats any in-flight observer-composite that the
      // harvest would otherwise pick up next.
      this.polluxPendingNextTurnIntent = downgraded;
      if (experimental.emitAdvisorDebug) {
        const reason = singleShotBlocked
          ? 'single_shot'
          : killSwitchBlocked
            ? 'kill_switch'
            : 'budget';
        debugLogger.log(
          `Pollux same-turn downgrade (${reason}) reason=${intent.reasonCode}`,
        );
      }
      this.recordPolluxEscalationTelemetry({
        turnId: `${prompt_id}:${this.sessionTurnCount}`,
        reasonCode: intent.reasonCode,
        escalationTiming: 'next_turn',
        outcome: budgetBlocked ? 'budget_exhausted' : 'deferred_next_turn',
        sameTurnDowngraded: true,
        pauseBoundary: intent.pauseBoundary,
        contributingSignalIds: intent.contributingSignalIds,
        contributingSignalAttributions: intent.contributingSignalAttributions,
      });
      if (budgetBlocked) {
        this.noteStrictCheckpointBudgetBlocked(checkpointReason);
      }
      return budgetBlocked ? 'budget_exhausted' : 'skipped';
    }

    // F.1.2 introspection: mirror the in-flight same-turn intent on the
    // client so tests (and future diagnostic tooling) can observe the
    // pause-boundary state without reaching into the observer instance.
    this.polluxPendingSameTurnIntent = intent;
    try {
      const outcome = await this.maybeRunPolluxAdvisorConsultationForIntent(
        request,
        signal,
        prompt_id,
        runtimeSurface,
        intent,
      );
      if (outcome === 'consulted') {
        this.polluxSameTurnFiredThisTurn = true;
        if (
          intent.reasonCode ===
          PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST
        ) {
          this.polluxSameTurnExecutorRequestKeysThisTurn.add(
            executorRequestKey,
          );
        }
        const strictCheckpointComplete =
          checkpointReason === undefined ||
          this.strictCheckpointIsConsultedGood(checkpointReason);
        polluxObserver.noteAdvisorSuccess(
          strictCheckpointComplete,
          intent.contributingSignalIds,
        );
      } else if (outcome === 'budget_exhausted') {
        // Budget went from allowed at pre-check to exhausted during execution
        // (race with parallel surface). Treat as a downgrade so the attempt
        // still lands in the next-turn queue with telemetry. Also flip the
        // single-shot flag — the advisor slot for this turn is effectively
        // consumed, and any subsequent same-turn trigger in the same turn
        // would be budget-blocked anyway; setting the flag keeps I11
        // book-keeping consistent with the `consulted` and `skipped`
        // branches.
        const downgraded = buildPolluxDowngradedNextTurnIntent(intent);
        this.polluxPendingNextTurnIntent = downgraded;
        this.polluxSameTurnFiredThisTurn = true;
      } else {
        // policy_denied | fail_open | skipped -- the single-shot guardrail
        // still consumes the slot to prevent rapid retries within a turn,
        // mirroring the observer's per-reason cap behavior (§F.1.4).
        this.polluxSameTurnFiredThisTurn = true;
        polluxObserver.noteAdvisorSuccess(false, intent.contributingSignalIds);
      }
      return outcome;
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      if (experimental.emitAdvisorDebug) {
        const inFlight = this.polluxPendingSameTurnIntent?.reasonCode;
        debugLogger.warn(
          `Pollux same-turn consult failed open (reason=${inFlight ?? intent.reasonCode}).`,
        );
      }
      this.recordPolluxEscalationTelemetry({
        turnId: `${prompt_id}:${this.sessionTurnCount}`,
        reasonCode: intent.reasonCode,
        escalationTiming: intent.timing,
        outcome: 'fail_open',
        sameTurnDowngraded: false,
        pauseBoundary: intent.pauseBoundary,
        contributingSignalIds: intent.contributingSignalIds,
        contributingSignalAttributions: intent.contributingSignalAttributions,
      });
      // Fail-open: the executor proceeds even when the consult throws.
      return 'fail_open';
    } finally {
      this.polluxPendingSameTurnIntent = undefined;
    }
  }

  private async *processTurn(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    boundedTurns: number,
    isInvalidStreamRetry: boolean,
    displayContent?: PartListUnion,
    runtimeSurface: PolluxRuntimeSurface = PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    // Re-initialize turn (it was empty before if in loop, or new instance)
    let turn = new Turn(this.getChat(), prompt_id);

    const isFunctionResponseContinuation =
      isFunctionResponseOnlyRequest(request);
    const isNewPolluxUserTurn =
      !isFunctionResponseContinuation ||
      this.polluxActiveObserverPromptId !== prompt_id ||
      this.polluxActiveObserver === undefined;
    if (isNewPolluxUserTurn) {
      this.polluxAdvisorCallsThisTurn = 0;
      // F.1.4: reset same-turn guardrails at user-turn entry. Detector signals
      // keep I11 single-shot behavior; explicit executor checkpoint requests
      // may use multiple configured slots.
      this.polluxSameTurnFiredThisTurn = false;
      this.polluxSameTurnExecutorRequestKeysThisTurn.clear();
    }
    this.polluxPendingSameTurnIntent = undefined;
    const polluxObserver = this.getPolluxObserverForProcessTurn({
      request,
      promptId: prompt_id,
      isFunctionResponseContinuation,
    });
    this.flushPolluxPendingAdvisorGuidance();

    this.sessionTurnCount++;
    if (
      this.config.getMaxSessionTurns() > 0 &&
      this.sessionTurnCount > this.config.getMaxSessionTurns()
    ) {
      yield { type: GeminiEventType.MaxSessionTurns };
      return turn;
    }

    if (!boundedTurns) {
      return turn;
    }

    // Check for context window overflow
    const modelForLimitCheck = this._getActiveModelForCurrentTurn();

    if (this.config.getContextManagementConfig().enabled) {
      const newHistory = await this.agentHistoryProvider.manageHistory(
        this.getHistory(),
        signal,
      );
      if (newHistory.length !== this.getHistory().length) {
        this.getChat().setHistory(newHistory);
      }
    } else {
      const compressed = await this.tryCompressChat(prompt_id, false, signal);

      if (compressed.compressionStatus === CompressionStatus.COMPRESSED) {
        yield { type: GeminiEventType.ChatCompressed, value: compressed };
      }
    }

    const remainingTokenCount =
      tokenLimit(modelForLimitCheck) - this.getChat().getLastPromptTokenCount();

    await this.tryMaskToolOutputs(this.getHistory());

    // Estimate tokens. For text-only requests, we estimate based on character length.
    // For requests with non-text parts (like images, tools), we use the countTokens API.
    const estimatedRequestTokenCount = await calculateRequestTokenCount(
      request,
      this.getContentGeneratorOrFail(),
      modelForLimitCheck,
    );

    if (estimatedRequestTokenCount > remainingTokenCount) {
      yield {
        type: GeminiEventType.ContextWindowWillOverflow,
        value: { estimatedRequestTokenCount, remainingTokenCount },
      };
      return turn;
    }

    // Prevent context updates from being sent while a tool call is
    // waiting for a response. The Gemini API requires that a functionResponse
    // part from the user immediately follows a functionCall part from the model
    // in the conversation history . The IDE context is not discarded; it will
    // be included in the next regular message sent to the model.
    const history = this.getHistory();
    const lastMessage =
      history.length > 0 ? history[history.length - 1] : undefined;
    const hasPendingToolCall =
      !!lastMessage &&
      lastMessage.role === 'model' &&
      (lastMessage.parts?.some((p) => 'functionCall' in p) || false);

    if (this.config.getIdeMode() && !hasPendingToolCall) {
      const { contextParts, newIdeContext } = this.getIdeContextParts(
        this.forceFullIdeContext || history.length === 0,
      );
      if (contextParts.length > 0) {
        this.getChat().addHistory({
          role: 'user',
          parts: [{ text: contextParts.join('\n') }],
        });
      }
      this.lastSentIdeContext = newIdeContext;
      this.forceFullIdeContext = false;
    }

    await this.maybeRunPolluxAdvisorConsultation(
      request,
      signal,
      prompt_id,
      runtimeSurface,
    );

    // Re-initialize turn with fresh history
    turn = new Turn(this.getChat(), prompt_id);

    const controller = new AbortController();
    const linkedSignal = AbortSignal.any([signal, controller.signal]);

    const loopResult = await this.loopDetector.turnStarted(signal);
    if (loopResult.count > 1) {
      yield { type: GeminiEventType.LoopDetected };
      return turn;
    } else if (loopResult.count === 1) {
      if (boundedTurns <= 1) {
        yield { type: GeminiEventType.MaxSessionTurns };
        return turn;
      }
      return yield* this._recoverFromLoop(
        loopResult,
        signal,
        prompt_id,
        boundedTurns,
        isInvalidStreamRetry,
        displayContent,
        runtimeSurface,
      );
    }

    const routingContext: RoutingContext = {
      history: this.getChat().getHistory(/*curated=*/ true),
      request,
      signal,
      requestedModel: this.config.getModel(),
    };

    let modelToUse: string;

    // Determine Model (Stickiness vs. Routing)
    if (this.currentSequenceModel) {
      modelToUse = this.currentSequenceModel;
    } else {
      const router = this.config.getModelRouterService();
      const decision = await router.route(routingContext);
      modelToUse = decision.model;
    }

    // availability logic
    const modelConfigKey: ModelConfigKey = {
      model: modelToUse,
      isChatModel: true,
    };
    const { model: finalModel } = applyModelSelection(
      this.config,
      modelConfigKey,
      { consumeAttempt: false },
    );
    modelToUse = finalModel;

    if (!signal.aborted && !this.currentSequenceModel) {
      yield { type: GeminiEventType.ModelInfo, value: modelToUse };
    }
    this.currentSequenceModel = modelToUse;

    // Update tools with the final modelId to ensure model-dependent descriptions are used.
    await this.setTools(modelToUse);

    const resultStream = turn.run(
      modelConfigKey,
      request,
      linkedSignal,
      displayContent,
    );
    let isError = false;
    let isInvalidStream = false;
    let polluxStatusTagStreamCarry = '';
    let polluxStrictFinalGateContinuationRequest: PartListUnion | undefined;

    let loopDetectedAbort = false;
    let loopRecoverResult: { detail?: string } | undefined;
    for await (const event of resultStream) {
      ingestPolluxObserverFailOpen(polluxObserver, event);
      this.tracePolluxStreamEvent(event);
      this.maybeNoteStrictFdSourceMutationFromToolCall(event);
      this.maybeNoteStrictFinalVerificationFromToolCall(event);

      // F.1.3 pre-tool same-turn handler: route through the generic consult
      // helper so single-shot, kill-switch, and budget guardrails apply
      // uniformly to the risk-gate path.
      if (event.type === GeminiEventType.ToolCallRequest) {
        const preToolIntent = polluxObserver.peekSameTurnIntent();
        if (preToolIntent?.pauseBoundary === 'pre_tool') {
          const intent = polluxObserver.consumeSameTurnIntent();
          if (intent) {
            // eslint-disable-next-line no-console
            console.log(
              `[Pollux] 🚨 Same-turn escalation triggered: ${intent.reasonCode} (Score: ${intent.netScore})`,
            );
            await this.runPolluxSameTurnConsult(
              request,
              signal,
              prompt_id,
              runtimeSurface,
              intent,
              polluxObserver,
            );
          }
        }
      }

      const loopResult = this.loopDetector.addAndCheck(event);
      ingestPolluxAfterLoopCheckFailOpen(polluxObserver, event);

      const polluxExperimental = this.config.getPolluxExperimentalConfig();

      // F.1.3 post-event same-turn handler: generic path covering HARD_LOOP,
      // SELF_REPORT_STUCK, and FUSION_COMPOSITE_EMPHATIC. Consumes any intent
      // with `pauseBoundary === 'post_event'` and routes it through the same
      // guardrail chain as the pre-tool path.
      {
        const postIntent = polluxObserver.peekSameTurnIntent();
        if (postIntent?.pauseBoundary === 'post_event') {
          const consumed = polluxObserver.consumeSameTurnIntent();
          if (consumed) {
            const outcome = await this.runPolluxSameTurnConsult(
              request,
              signal,
              prompt_id,
              runtimeSurface,
              consumed,
              polluxObserver,
            );
            const checkpointReason =
              this.strictCheckpointReasonFromIntent(consumed);
            if (
              event.type === GeminiEventType.Finished &&
              checkpointReason === 'final diff audit before completion' &&
              outcome === 'consulted' &&
              this.strictCheckpointIsConsultedGood(checkpointReason) &&
              !this.polluxStrictFinalGateContinuationUsedThisTurn &&
              boundedTurns > 1
            ) {
              this.polluxStrictFinalGateContinuationUsedThisTurn = true;
              this.flushPolluxPendingAdvisorGuidance();
              polluxStrictFinalGateContinuationRequest = [
                {
                  text: [
                    'Continue after applying hidden final-audit advisor guidance.',
                    'Run the required verification commands from verify_before_done.',
                    'If verification fails, fix the issue before final completion.',
                    'Do not finish until final verification has passed or a concrete blocker is reported.',
                    'For Go tasks, if no command was named, run gofmt on modified Go files and a focused go test for the touched package.',
                    'For JavaScript or TypeScript tasks, if no command was named, run a focused repository check such as npm test, npx jest, npx tsc --noEmit, npm run build, or the repository equivalent.',
                    'Do not mention Pollux.',
                  ].join(' '),
                },
              ];
              break;
            }
          }
        }
      }

      // Phase C compatibility: the loop detector's own `count >= 1` signal
      // remains the authoritative source for the legacy HARD_LOOP fallback.
      // Queue it whenever a loop was confirmed AND no same-turn consult has
      // already fired this turn. This covers:
      //   (a) rollback paths where the Phase D observer is disabled,
      //   (b) sameTurnEnabled=false kill-switch (observer queues next-turn
      //       via `pendingNextTurnIntent`, but mocks in Phase C tests may not
      //       surface it; the legacy slot stays as a safety net), and
      //   (c) same-turn attempts that did NOT produce a 'consulted' outcome
      //       (policy denied, fail-open, or downgraded) so the loop still
      //       gets consulted on the recovery turn.
      if (
        polluxExperimental.enabled &&
        loopResult.count >= 1 &&
        !this.polluxSameTurnFiredThisTurn
      ) {
        this.polluxPendingLoopNextTurnIntent =
          buildPolluxHardLoopNextTurnIntent();
      }

      if (loopResult.count > 1) {
        yield { type: GeminiEventType.LoopDetected };
        loopDetectedAbort = true;
        break;
      } else if (loopResult.count === 1) {
        if (boundedTurns <= 1) {
          yield { type: GeminiEventType.MaxSessionTurns };
          loopDetectedAbort = true;
          break;
        }
        loopRecoverResult = loopResult;
        break;
      }
      // Phase E leakage prevention: strip `<pollux:status>` tags before the
      // event is yielded downstream. The observer/SelfReportSensor has
      // already seen the raw event by this point (ingestPolluxObserverFailOpen
      // runs at the top of the loop), so stripping here only affects what
      // the UI / agent-session / ACP surfaces render — never what the
      // detector matches on. Thought events are also inspectable by the
      // sensor via `extractInspectableText`, so we strip from their subject
      // and description to prevent tag leakage on surfaces that render
      // raw thought streams.
      if (
        polluxExperimental.enabled &&
        polluxExperimental.detector.selfReport.enabled
      ) {
        if (event.type === GeminiEventType.Content) {
          const sanitized = stripPolluxStatusTagsFromStreamChunk(
            event.value,
            polluxStatusTagStreamCarry,
          );
          polluxStatusTagStreamCarry = sanitized.carry;
          if (sanitized.output.length > 0) {
            yield {
              ...event,
              value: sanitized.output,
            };
          }
        } else if (event.type === GeminiEventType.Thought) {
          yield {
            ...event,
            value: {
              subject: stripPolluxStatusTags(event.value.subject),
              description: stripPolluxStatusTags(event.value.description),
            },
          };
        } else {
          yield event;
        }
      } else {
        yield event;
      }

      if (
        event.type === GeminiEventType.Finished &&
        this.polluxStrictFinalGateContinuationUsedThisTurn &&
        !polluxStrictFinalGateContinuationRequest
      ) {
        this.noteStrictFinalVerificationMissing();
      }

      this.updateTelemetryTokenCount();

      if (event.type === GeminiEventType.InvalidStream) {
        isInvalidStream = true;
      }
      if (event.type === GeminiEventType.Error) {
        isError = true;
      }
    }

    const polluxExperimentalAfterStream =
      this.config.getPolluxExperimentalConfig();
    if (polluxStrictFinalGateContinuationRequest && !signal.aborted) {
      controller.abort();
      return yield* this.processTurn(
        polluxStrictFinalGateContinuationRequest,
        signal,
        prompt_id,
        boundedTurns - 1,
        false,
        displayContent,
        runtimeSurface,
      );
    }
    if (
      polluxStatusTagStreamCarry.length > 0 &&
      polluxExperimentalAfterStream.enabled &&
      polluxExperimentalAfterStream.detector.selfReport.enabled
    ) {
      const flushed = flushPolluxStatusTagStreamCarry(
        polluxStatusTagStreamCarry,
      );
      polluxStatusTagStreamCarry = '';
      if (flushed.length > 0) {
        yield { type: GeminiEventType.Content, value: flushed };
      }
    }

    // F.1.1 / F.1.2: harvest the observer's pending next-turn intent before
    // the local observer instance is garbage-collected. This is what carries
    // observer-driven escalations (soft composite, downgraded hard-precision)
    // across turn boundaries into `polluxPendingNextTurnIntent`.
    try {
      const harvested = polluxObserver.consumePendingNextTurnIntent();
      if (harvested) {
        // Explicit downgrades staged by `runPolluxSameTurnConsult` already
        // set the slot. Harvest overwrites only when empty OR when the
        // harvested observer intent has netScore ≥ existing (stronger or equal
        // fusion wins; a downgrade already in the slot is not blindly replaced
        // by a weaker harvest).
        const existing = this.polluxPendingNextTurnIntent;
        const isSameTurnCanonicalDowngrade =
          harvested.timing === 'next_turn' &&
          POLLUX_ESCALATION_TIMING[harvested.reasonCode] === 'same_turn';
        if (!existing && isSameTurnCanonicalDowngrade) {
          this.recordPolluxEscalationTelemetry({
            turnId: `${prompt_id}:${this.sessionTurnCount}`,
            reasonCode: harvested.reasonCode,
            escalationTiming: harvested.timing,
            outcome: 'deferred_next_turn',
            sameTurnDowngraded: true,
            contributingSignalIds: harvested.contributingSignalIds,
            contributingSignalAttributions:
              harvested.contributingSignalAttributions,
          });
        }
        if (!existing || harvested.netScore >= existing.netScore) {
          this.polluxPendingNextTurnIntent = harvested;
        }
      }
    } catch {
      // Fail-open (I3): observer harvest must never abort the turn.
    }

    if (loopDetectedAbort) {
      controller.abort();
      return turn;
    }

    if (loopRecoverResult) {
      return yield* this._recoverFromLoop(
        loopRecoverResult,
        signal,
        prompt_id,
        boundedTurns,
        isInvalidStreamRetry,
        displayContent,
        runtimeSurface,
        controller,
      );
    }

    if (isError) {
      return turn;
    }

    // Update cumulative response in hook state
    // We do this immediately after the stream finishes for THIS turn.
    const hooksEnabled = this.config.getEnableHooks();
    if (hooksEnabled) {
      const responseText = turn.getResponseText() || '';
      const hookState = this.hookStateMap.get(prompt_id);
      if (hookState && responseText) {
        // Append with newline if not empty
        hookState.cumulativeResponse = hookState.cumulativeResponse
          ? `${hookState.cumulativeResponse}\n${responseText}`
          : responseText;
      }
    }

    if (isInvalidStream) {
      if (this.config.getContinueOnFailedApiCall()) {
        if (isInvalidStreamRetry) {
          logContentRetryFailure(
            this.config,
            new ContentRetryFailureEvent(
              4,
              'FAILED_AFTER_PROMPT_INJECTION',
              modelToUse,
            ),
          );
          return turn;
        }
        const nextRequest = [{ text: 'System: Please continue.' }];
        // Recursive call - update turn with result
        turn = yield* this.sendMessageStream(
          nextRequest,
          signal,
          prompt_id,
          boundedTurns - 1,
          true,
          displayContent,
          false,
          runtimeSurface,
        );
        return turn;
      }
    }

    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      if (
        !this.config.getQuotaErrorOccurred() &&
        !this.config.getSkipNextSpeakerCheck()
      ) {
        const nextSpeakerCheck = await checkNextSpeaker(
          this.getChat(),
          this.config.getBaseLlmClient(),
          signal,
          prompt_id,
        );
        logNextSpeakerCheck(
          this.config,
          new NextSpeakerCheckEvent(
            prompt_id,
            turn.finishReason?.toString() || '',
            nextSpeakerCheck?.next_speaker || '',
          ),
        );
        if (nextSpeakerCheck?.next_speaker === 'model') {
          // eslint-disable-next-line no-console
          console.log(
            `[Pollux] 🔄 Next-speaker check requested continuation. Bounded turns left: ${boundedTurns - 1}`,
          );
          const nextRequest = [{ text: 'Please continue.' }];
          turn = yield* this.sendMessageStream(
            nextRequest,
            signal,
            prompt_id,
            boundedTurns - 1,
            false, // isInvalidStreamRetry is false
            displayContent,
            false,
            runtimeSurface,
          );
          return turn;
        }
      }
    }
    return turn;
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    turns: number = MAX_TURNS,
    isInvalidStreamRetry: boolean = false,
    displayContent?: PartListUnion,
    stopHookActive: boolean = false,
    runtimeSurface: PolluxRuntimeSurface = PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (!isInvalidStreamRetry) {
      this.config.resetTurn();
    }

    const hooksEnabled = this.config.getEnableHooks();
    const messageBus = this.context.messageBus;

    if (this.lastPromptId !== prompt_id) {
      this.loopDetector.reset(prompt_id, partListUnionToString(request));
      this.hookStateMap.delete(this.lastPromptId);
      this.lastPromptId = prompt_id;
      this.currentSequenceModel = null;
      this.polluxStrictCheckpointStates.clear();
      this.polluxStrictSourceMutationCount = 0;
      this.polluxStrictFinalGateContinuationUsedThisTurn = false;
    }

    if (hooksEnabled && messageBus) {
      const hookResult = await this.fireBeforeAgentHookSafe(request, prompt_id);
      if (hookResult) {
        if (
          'type' in hookResult &&
          hookResult.type === GeminiEventType.AgentExecutionStopped
        ) {
          // Add user message to history before returning so it's kept in the transcript
          this.getChat().addHistory(createUserContent(request));
          yield hookResult;
          return new Turn(this.getChat(), prompt_id);
        } else if (
          'type' in hookResult &&
          hookResult.type === GeminiEventType.AgentExecutionBlocked
        ) {
          yield hookResult;
          return new Turn(this.getChat(), prompt_id);
        } else if ('additionalContext' in hookResult) {
          const additionalContext = hookResult.additionalContext;
          if (additionalContext) {
            const requestArray = Array.isArray(request) ? request : [request];
            request = [
              ...requestArray,
              { text: `<hook_context>${additionalContext}</hook_context>` },
            ];
          }
        }
      }
    }

    const boundedTurns = Math.min(turns, MAX_TURNS);
    let turn = new Turn(this.getChat(), prompt_id);
    let continuationHandled = false;

    try {
      turn = yield* this.processTurn(
        request,
        signal,
        prompt_id,
        boundedTurns,
        isInvalidStreamRetry,
        displayContent,
        runtimeSurface,
      );

      // Fire AfterAgent hook if we have a turn and no pending tools
      if (hooksEnabled && messageBus) {
        const hookOutput = await this.fireAfterAgentHookSafe(
          request,
          prompt_id,
          turn,
          stopHookActive,
        );

        // Cast to AfterAgentHookOutput for access to shouldClearContext()
        const afterAgentOutput = hookOutput as AfterAgentHookOutput | undefined;

        if (afterAgentOutput?.shouldStopExecution()) {
          const contextCleared = afterAgentOutput.shouldClearContext();
          yield {
            type: GeminiEventType.AgentExecutionStopped,
            value: {
              reason: afterAgentOutput.getEffectiveReason(),
              systemMessage: afterAgentOutput.systemMessage,
              contextCleared,
            },
          };
          // Clear context if requested (honor both stop + clear)
          if (contextCleared) {
            await this.resetChat();
          }
          return turn;
        }

        if (afterAgentOutput?.isBlockingDecision()) {
          const continueReason = afterAgentOutput.getEffectiveReason();
          const contextCleared = afterAgentOutput.shouldClearContext();
          yield {
            type: GeminiEventType.AgentExecutionBlocked,
            value: {
              reason: continueReason,
              systemMessage: afterAgentOutput.systemMessage,
              contextCleared,
            },
          };
          // Clear context if requested
          if (contextCleared) {
            await this.resetChat();
          }
          const continueRequest = [{ text: continueReason }];
          // Reset hook state so the continuation fires BeforeAgent fresh
          // and fireAfterAgentHookSafe sees activeCalls=1, not 2.
          const contHookState = this.hookStateMap.get(prompt_id);
          if (contHookState) {
            contHookState.hasFiredBeforeAgent = false;
            contHookState.activeCalls--;
          }
          continuationHandled = true;
          turn = yield* this.sendMessageStream(
            continueRequest,
            signal,
            prompt_id,
            boundedTurns - 1,
            false,
            displayContent,
            true, // stopHookActive: signal retry to AfterAgent hooks
            runtimeSurface,
          );
        }
      }
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        yield { type: GeminiEventType.UserCancelled };
        return turn;
      }
      throw error;
    } finally {
      if (!continuationHandled) {
        const hookState = this.hookStateMap.get(prompt_id);
        if (hookState) {
          hookState.activeCalls--;
          const isPendingTools =
            turn?.pendingToolCalls && turn.pendingToolCalls.length > 0;
          const isAborted = signal?.aborted;

          if (hookState.activeCalls <= 0) {
            if (!isPendingTools || isAborted) {
              this.hookStateMap.delete(prompt_id);
            }
          }
        }
      }
    }

    return turn;
  }

  async generateContent(
    modelConfigKey: ModelConfigKey,
    contents: Content[],
    abortSignal: AbortSignal,
    role: LlmRole,
    options?: {
      maxAttemptsOverride?: number;
      systemInstructionOverride?: string | null;
      generateContentConfigOverride?: Partial<GenerateContentConfig>;
    },
  ): Promise<GenerateContentResponse> {
    const desiredModelConfig =
      this.config.modelConfigService.getResolvedConfig(modelConfigKey);
    let {
      model: currentAttemptModel,
      generateContentConfig: currentAttemptGenerateContentConfig,
    } = desiredModelConfig;

    try {
      const userMemory = this.config.getSystemInstructionMemory();
      const systemInstruction =
        options?.systemInstructionOverride === undefined
          ? getCoreSystemPrompt(this.config, userMemory)
          : options.systemInstructionOverride;
      const {
        model,
        config: newConfig,
        maxAttempts: availabilityMaxAttempts,
      } = applyModelSelection(this.config, modelConfigKey);
      currentAttemptModel = model;
      if (newConfig) {
        currentAttemptGenerateContentConfig = newConfig;
      }

      // Define callback to refresh context based on currentAttemptModel which might be updated by fallback handler
      const getAvailabilityContext: () => RetryAvailabilityContext | undefined =
        createAvailabilityContextProvider(
          this.config,
          () => currentAttemptModel,
        );

      let initialActiveModel = this.config.getActiveModel();

      const apiCall = () => {
        // AvailabilityService
        const active = this.config.getActiveModel();
        if (active !== initialActiveModel) {
          initialActiveModel = active;
          // Re-resolve config if model changed
          const { model: resolvedModel, generateContentConfig } =
            this.config.modelConfigService.getResolvedConfig({
              ...modelConfigKey,
              model: active,
            });
          currentAttemptModel = resolvedModel;
          currentAttemptGenerateContentConfig = generateContentConfig;
        }

        const requestConfig: GenerateContentConfig = {
          ...currentAttemptGenerateContentConfig,
          ...options?.generateContentConfigOverride,
          abortSignal,
          ...(systemInstruction === null ? {} : { systemInstruction }),
        };

        return this.getContentGeneratorOrFail().generateContent(
          {
            model: currentAttemptModel,
            config: requestConfig,
            contents,
          },
          this.lastPromptId,
          role,
        );
      };
      const onPersistent429Callback = async (
        authType?: string,
        error?: unknown,
      ) =>
        // Pass the captured model to the centralized handler.
        handleFallback(this.config, currentAttemptModel, authType, error);

      const onValidationRequiredCallback = async (
        validationError: ValidationRequiredError,
      ) => {
        // Suppress validation dialog for background calls (e.g. prompt-completion)
        // to prevent the dialog from appearing on startup or during typing.
        if (modelConfigKey.model === 'prompt-completion') {
          throw validationError;
        }

        const handler = this.config.getValidationHandler();
        if (typeof handler !== 'function') {
          throw validationError;
        }
        return handler(
          validationError.validationLink,
          validationError.validationDescription,
          validationError.learnMoreUrl,
        );
      };

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: onPersistent429Callback,
        onValidationRequired: onValidationRequiredCallback,
        authType: this.config.getContentGeneratorConfig()?.authType,
        maxAttempts: options?.maxAttemptsOverride ?? availabilityMaxAttempts,
        retryFetchErrors: this.config.getRetryFetchErrors(),
        getAvailabilityContext,
        onRetry: (attempt, error, delayMs) => {
          coreEvents.emitRetryAttempt({
            attempt,
            maxAttempts:
              options?.maxAttemptsOverride ??
              availabilityMaxAttempts ??
              this.config.getMaxAttempts(),
            delayMs,
            error: error instanceof Error ? error.message : String(error),
            model: getDisplayString(currentAttemptModel),
          });
        },
      });

      return result;
    } catch (error: unknown) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        `Error generating content via API with model ${currentAttemptModel}.`,
        {
          requestContents: contents,
          requestConfig: currentAttemptGenerateContentConfig,
        },
        'generateContent-api',
      );
      throw new Error(
        `Failed to generate content with model ${currentAttemptModel}: ${getErrorMessage(error)}`,
      );
    }
  }

  async tryCompressChat(
    prompt_id: string,
    force: boolean = false,
    abortSignal?: AbortSignal,
  ): Promise<ChatCompressionInfo> {
    // If the model is 'auto', we will use a placeholder model to check.
    // Compression occurs before we choose a model, so calling `count_tokens`
    // before the model is chosen would result in an error.
    const model = this._getActiveModelForCurrentTurn();

    const { newHistory, info } = await this.compressionService.compress(
      this.getChat(),
      prompt_id,
      force,
      model,
      this.config,
      this.hasFailedCompressionAttempt,
      abortSignal,
    );

    if (
      info.compressionStatus ===
      CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT
    ) {
      this.hasFailedCompressionAttempt =
        this.hasFailedCompressionAttempt || !force;
    } else if (info.compressionStatus === CompressionStatus.COMPRESSED) {
      if (newHistory) {
        // capture current session data before resetting
        const currentRecordingService =
          this.getChat().getChatRecordingService();
        const conversation = currentRecordingService.getConversation();
        const filePath = currentRecordingService.getConversationFilePath();

        let resumedData: ResumedSessionData | undefined;

        if (conversation && filePath) {
          resumedData = { conversation, filePath };
        }

        this.chat = await this.startChat(newHistory, resumedData);
        this.updateTelemetryTokenCount();
        this.forceFullIdeContext = true;
      }
    } else if (info.compressionStatus === CompressionStatus.CONTENT_TRUNCATED) {
      if (newHistory) {
        // We truncated content to save space, but summarization is still "failed".
        // We update the chat context directly without resetting the failure flag.
        this.getChat().setHistory(newHistory);
        this.updateTelemetryTokenCount();
        // We don't reset the chat session fully like in COMPRESSED because
        // this is a lighter-weight intervention.
      }
    }

    return info;
  }

  /**
   * Masks bulky tool outputs to save context window space.
   */
  private async tryMaskToolOutputs(history: readonly Content[]): Promise<void> {
    const result = await this.toolOutputMaskingService.mask(
      history,
      this.config,
    );
    if (result.maskedCount > 0) {
      this.getChat().setHistory(result.newHistory);
    }
  }

  /**
   * Handles loop recovery by providing feedback to the model and initiating a new turn.
   */
  private _recoverFromLoop(
    loopResult: { detail?: string },
    signal: AbortSignal,
    prompt_id: string,
    boundedTurns: number,
    isInvalidStreamRetry: boolean,
    displayContent?: PartListUnion,
    runtimeSurface: PolluxRuntimeSurface = PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
    controllerToAbort?: AbortController,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    controllerToAbort?.abort();

    // Clear the detection flag so the recursive turn can proceed, but the count remains 1.
    this.loopDetector.clearDetection();

    const feedbackText = `System: Potential loop detected. Details: ${loopResult.detail || 'Repetitive patterns identified'}. Please take a step back and confirm you're making forward progress. If not, take a step back, analyze your previous actions and rethink how you're approaching the problem. Avoid repeating the same tool calls or responses without new results.`;

    if (this.config.getDebugMode()) {
      debugLogger.warn(
        'Iterative Loop Recovery: Injecting feedback message to model.',
      );
    }

    const feedback = [{ text: feedbackText }];

    // Recursive call with feedback
    return this.sendMessageStream(
      feedback,
      signal,
      prompt_id,
      boundedTurns - 1,
      isInvalidStreamRetry,
      displayContent,
      false,
      runtimeSurface,
    );
  }
}
