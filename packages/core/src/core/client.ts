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
  readonly retryableForRepair: boolean;
  readonly retryableForFallback: boolean;
}

type PolluxAdvisorConsultationResult =
  | {
      readonly outcome: 'consulted';
      readonly guidance: string;
      readonly structuredConfidence?: number;
      readonly model: string;
      readonly attemptKind: PolluxAdvisorAttemptKind;
    }
  | {
      readonly outcome: 'policy_denied' | 'fail_open';
      readonly failureKind?: AdvisorPathFailureKind;
    };

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
      return { outcome: 'policy_denied' };
    }

    const advisorMode = this.resolvePolluxAdvisorConsultationMode({
      turnContext,
      reasonCode: escalationMeta?.reasonCode,
    });
    const advisorInput = {
      context: turnContext,
      toolName: ADVISOR_CONSULTATION_TOOL_NAME,
      mode: advisorMode,
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
          advisorSignal,
          executorModel: experimental.executorModel,
          escalationMeta,
        });
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
        };
      }

      if (experimental.emitAdvisorDebug) {
        debugLogger.log(
          `Pollux advisor primary attempt completed (success=${consultationSucceeded ? 'yes' : 'no'}, repair=${primaryAttempt.retryableForRepair ? 'yes' : 'no'}, fallback=${primaryAttempt.retryableForFallback ? 'yes' : 'no'})`,
        );
      }

      if (!consultationSucceeded && primaryAttempt.retryableForRepair) {
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
            advisorSignal,
            executorModel: experimental.executorModel,
            escalationMeta,
          });
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
          };
        }
      } else if (
        !consultationSucceeded &&
        primaryAttempt.retryableForFallback &&
        fallbackModel !== null
      ) {
        const fallbackAttempt =
          await this.attemptPolluxAdvisorConsultationWithModel({
            turnId: turnContext.turnId,
            attemptIndex: 2,
            attemptKind: 'fallback',
            advisorModelId: fallbackModel,
            advisorPrompt,
            advisorMode,
            advisorSignal,
            executorModel: experimental.executorModel,
            escalationMeta,
          });
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
          };
        }
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
      };
    }
    return { outcome: 'fail_open', failureKind: failOpenKind };
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
  }): AdvisorConsultationMode {
    if (
      params.reasonCode === PolluxEscalationReasonCode.FINAL_CONSTRAINT_AUDIT
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
    return hasHighRiskConstraint ? 'constraint_audit' : 'compact';
  }

  private async attemptPolluxAdvisorConsultationWithModel(params: {
    turnId: string;
    attemptIndex: number;
    attemptKind: PolluxAdvisorAttemptKind;
    advisorModelId: string;
    advisorPrompt: string;
    advisorMode?: AdvisorConsultationMode;
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
            maxOutputTokens:
              (params.advisorMode ?? 'compact') === 'compact' ? 384 : 512,
            temperature: 0.2,
          },
        },
      );
      // eslint-disable-next-line no-console
      console.log(`[Pollux] Advisor consultation finished.`);

      const rawAdvisorResponse = getResponseText(advisorResponse) ?? '';
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
          retryableForRepair:
            params.attemptKind === 'primary' &&
            (parsedResponse.reason === 'empty_response' ||
              parsedResponse.reason === 'malformed_json' ||
              parsedResponse.reason === 'schema'),
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

    const turnContext = this.buildPolluxTurnContext(
      request,
      prompt_id,
      runtimeSurface,
      experimental,
      pendingToolContextOverride,
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

    const singleShotBlocked = this.polluxSameTurnFiredThisTurn;
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
        polluxObserver.noteAdvisorSuccess(true, intent.contributingSignalIds);
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
      // F.1.4: reset the single-shot same-turn guardrail at user-turn entry so
      // each new user task is allowed exactly one same-turn consult (per I11).
      this.polluxSameTurnFiredThisTurn = false;
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

    let loopDetectedAbort = false;
    let loopRecoverResult: { detail?: string } | undefined;
    for await (const event of resultStream) {
      ingestPolluxObserverFailOpen(polluxObserver, event);
      this.tracePolluxStreamEvent(event);

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
            await this.runPolluxSameTurnConsult(
              request,
              signal,
              prompt_id,
              runtimeSurface,
              consumed,
              polluxObserver,
            );
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
