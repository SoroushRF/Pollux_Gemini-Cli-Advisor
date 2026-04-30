/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

import {
  FinishReason,
  type Content,
  type GenerateContentResponse,
  type Part,
} from '@google/genai';
import { GeminiClient } from './client.js';
import {
  AuthType,
  type ContentGenerator,
  type ContentGeneratorConfig,
} from './contentGenerator.js';
import { GeminiChat } from './geminiChat.js';
import type { Config } from '../config/config.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import {
  CompressionStatus,
  GeminiEventType,
  Turn,
  type ChatCompressionInfo,
  type ServerGeminiStreamEvent,
} from './turn.js';
import { getCoreSystemPrompt } from './prompts.js';
import { DEFAULT_GEMINI_MODEL_AUTO } from '../config/models.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { setSimulate429 } from '../utils/testUtils.js';
import { tokenLimit } from './tokenLimits.js';
import { ideContextStore } from '../ide/ideContext.js';
import type { ModelRouterService } from '../routing/modelRouterService.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import { ChatCompressionService } from '../context/chatCompressionService.js';
import type { ChatRecordingService } from '../services/chatRecordingService.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';
import type { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import type {
  ModelConfigKey,
  ResolvedModelConfig,
} from '../services/modelConfigService.js';
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';
import * as policyCatalog from '../availability/policyCatalog.js';
import { LlmRole, LoopType } from '../telemetry/types.js';
import { PolicyDecision } from '../policy/types.js';
import {
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  PolluxEscalationReasonCode,
  PolluxRuntimeSurface,
} from '../pollux/types.js';
import {
  buildPolluxHardLoopNextTurnIntent,
  type NextTurnIntent,
} from '../pollux/observer/index.js';
import type { PolluxAdvisorPhasePayload } from '../utils/events.js';
import { partToString } from '../utils/partUtils.js';
import { RetryableQuotaError } from '../utils/googleQuotaErrors.js';

/**
 * Sample user phrasing reused across Pollux seam tests for baseline parity.
 * Escalation is no longer inferred from plain-text prompts; tests that need a
 * detector-shaped path seed `polluxPendingNextTurnIntent` via
 * `seedPolluxCompositeIntent`.
 */
const POLLUX_ESCALATION_INPUT = 'I am stuck and need help with this.';

function seedPolluxCompositeIntent(
  target: GeminiClient,
  overrides: Partial<NextTurnIntent> = {},
): void {
  (
    target as unknown as {
      polluxPendingNextTurnIntent: NextTurnIntent | undefined;
    }
  ).polluxPendingNextTurnIntent = {
    timing: 'next_turn',
    reasonCode: PolluxEscalationReasonCode.FUSION_COMPOSITE,
    netScore: 4.2,
    contributingSignalIds: ['thought.subject_loop', 'tool.failure_cascade'],
    queuedAtMs: Date.now() - 10,
    ...overrides,
  };
}
import { coreEvents, CoreEvent } from '../utils/events.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import * as telemetryLoggers from '../telemetry/loggers.js';

// Mock fs module to prevent actual file system operations during tests
const mockFileSystem = new Map<string, string>();

vi.mock('node:fs', () => {
  const fsModule = {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((path: string, data: string) => {
      mockFileSystem.set(path, data);
    }),
    appendFileSync: vi.fn((path: string, data: string) => {
      const current = mockFileSystem.get(path) || '';
      mockFileSystem.set(path, current + data);
    }),
    readFileSync: vi.fn((path: string) => {
      if (mockFileSystem.has(path)) {
        return mockFileSystem.get(path);
      }
      throw Object.assign(new Error('ENOENT: no such file or directory'), {
        code: 'ENOENT',
      });
    }),
    existsSync: vi.fn((path: string) => mockFileSystem.has(path)),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      on: vi.fn(),
    })),
  };

  return {
    default: fsModule,
    ...fsModule,
  };
});

// --- Mocks ---
interface MockTurnContext {
  getResponseText: Mock<() => string>;
}

const mockTurnRunFn = vi.fn();

vi.mock('./turn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./turn.js')>();
  // Define a mock class that has the same shape as the real Turn
  class MockTurn {
    pendingToolCalls = [];
    // The run method is a property that holds our mock function
    run = mockTurnRunFn;

    constructor() {
      // The constructor can be empty or do some mock setup
    }

    getResponseText = vi.fn().mockReturnValue('Mock Response');
  }
  // Export the mock class as 'Turn'
  return {
    ...actual,
    Turn: MockTurn,
  };
});

vi.mock('../config/config.js');
vi.mock('./prompts');
vi.mock('../utils/getFolderStructure', () => ({
  getFolderStructure: vi.fn().mockResolvedValue('Mock Folder Structure'),
}));
vi.mock('../utils/errorReporting', () => ({ reportError: vi.fn() }));
vi.mock('../utils/nextSpeakerChecker', () => ({
  checkNextSpeaker: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/generateContentResponseUtilities', () => ({
  getResponseText: (result: GenerateContentResponse) =>
    result.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ||
    undefined,
}));
vi.mock('../telemetry/index.js', () => ({
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
  logApiError: vi.fn(),
}));
vi.mock('../ide/ideContext.js');
vi.mock('../telemetry/uiTelemetry.js', () => ({
  uiTelemetryService: {
    setLastPromptTokenCount: vi.fn(),
    getLastPromptTokenCount: vi.fn(),
    addEvent: vi.fn(),
  },
}));
vi.mock('../hooks/hookSystem.js');
const mockHookSystem = {
  fireBeforeAgentEvent: vi.fn().mockResolvedValue(undefined),
  fireAfterAgentEvent: vi.fn().mockResolvedValue(undefined),
  firePreCompressEvent: vi.fn().mockResolvedValue(undefined),
};

/**
 * Array.fromAsync ponyfill, which will be available in es 2024.
 *
 * Buffers an async generator into an array and returns the result.
 */
async function fromAsync<T>(promise: AsyncGenerator<T>): Promise<readonly T[]> {
  const results: T[] = [];
  for await (const result of promise) {
    results.push(result);
  }
  return results;
}

describe('Gemini Client (client.ts)', () => {
  let mockContentGenerator: ContentGenerator;
  let mockConfig: Config;
  let client: GeminiClient;
  let mockGenerateContentFn: Mock;
  let mockRouterService: { route: Mock };
  let mockPolicyCheck: Mock;
  beforeEach(async () => {
    vi.resetAllMocks();
    ClearcutLogger.clearInstance();
    vi.mocked(uiTelemetryService.setLastPromptTokenCount).mockClear();

    mockGenerateContentFn = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: '{"key": "value"}' }] } }],
    });

    // Disable 429 simulation for tests
    setSimulate429(false);

    mockRouterService = {
      route: vi
        .fn()
        .mockResolvedValue({ model: 'default-routed-model', reason: 'test' }),
    };

    mockPolicyCheck = vi.fn().mockResolvedValue({
      decision: PolicyDecision.ALLOW,
      rule: undefined,
    });

    mockContentGenerator = {
      generateContent: mockGenerateContentFn,
      generateContentStream: vi.fn(),
      batchEmbedContents: vi.fn(),
      countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
    } as unknown as ContentGenerator;

    // Because the GeminiClient constructor kicks off an async process (startChat)
    // that depends on a fully-formed Config object, we need to mock the
    // entire implementation of Config for these tests.
    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(null),
    };
    const fileService = new FileDiscoveryService('/test/dir');
    const contentGeneratorConfig: ContentGeneratorConfig = {
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    };
    mockConfig = {
      getRequestTimeoutMs: vi.fn().mockReturnValue(undefined),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue(contentGeneratorConfig),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getModel: vi.fn().mockReturnValue('test-model'),
      getUserTier: vi.fn().mockReturnValue(undefined),
      getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
      getApiKey: vi.fn().mockReturnValue('test-key'),
      getVertexAI: vi.fn().mockReturnValue(false),
      getUserAgent: vi.fn().mockReturnValue('test-agent'),
      getUserMemory: vi.fn().mockReturnValue(''),
      getGlobalMemory: vi.fn().mockReturnValue(''),
      getEnvironmentMemory: vi.fn().mockReturnValue(''),
      getSystemInstructionMemory: vi.fn().mockReturnValue(''),
      getSessionMemory: vi.fn().mockReturnValue(''),
      isJitContextEnabled: vi.fn().mockReturnValue(false),
      getMemoryContextManager: vi.fn().mockReturnValue(undefined),
      getDisableLoopDetection: vi.fn().mockReturnValue(false),
      getToolOutputMaskingConfig: vi.fn().mockReturnValue({
        protectionThresholdTokens: 50000,
        minPrunableThresholdTokens: 30000,
        protectLatestTurn: true,
      }),

      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProxy: vi.fn().mockReturnValue(undefined),
      getWorkingDir: vi.fn().mockReturnValue('/test/dir'),
      getFileService: vi.fn().mockReturnValue(fileService),
      getMaxSessionTurns: vi.fn().mockReturnValue(0),
      getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
      setQuotaErrorOccurred: vi.fn(),
      getNoBrowser: vi.fn().mockReturnValue(false),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
      getIdeModeFeature: vi.fn().mockReturnValue(false),
      getIdeMode: vi.fn().mockReturnValue(true),
      getDebugMode: vi.fn().mockReturnValue(false),
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/dir']),
      }),
      getGeminiClient: vi.fn(),
      getRetryFetchErrors: vi.fn().mockReturnValue(true),
      getMaxAttempts: vi.fn().mockReturnValue(3),
      getModelRouterService: vi
        .fn()
        .mockReturnValue(mockRouterService as unknown as ModelRouterService),
      getMessageBus: vi.fn().mockReturnValue(undefined),
      getPolicyEngine: vi.fn().mockReturnValue({ check: mockPolicyCheck }),
      getEnableHooks: vi.fn().mockReturnValue(false),
      getPolluxExperimentalConfig: vi
        .fn()
        .mockReturnValue(DEFAULT_POLLUX_EXPERIMENTAL_CONFIG),
      getChatCompression: vi.fn().mockReturnValue(undefined),
      getCompressionThreshold: vi.fn().mockReturnValue(undefined),
      getSkipNextSpeakerCheck: vi.fn().mockReturnValue(false),
      getShowModelInfoInChat: vi.fn().mockReturnValue(false),
      getContinueOnFailedApiCall: vi.fn(),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      getIncludeDirectoryTree: vi.fn().mockReturnValue(true),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/temp'),
      },
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateJson: vi.fn().mockResolvedValue({
          next_speaker: 'user',
          reasoning: 'test',
        }),
        generateContent: vi.fn().mockResolvedValue({
          candidates: [
            { content: { parts: [{ text: '{"summary":"test"}' }] } },
          ],
        }),
      }),
      modelConfigService: {
        getResolvedConfig(modelConfigKey: ModelConfigKey) {
          return {
            model: modelConfigKey.model,
            generateContentConfig: {
              temperature: 0,
              topP: 1,
            } as unknown as ResolvedModelConfig,
          };
        },
      },
      isInteractive: vi.fn().mockReturnValue(false),
      getExperiments: () => {},
      getActiveModel: vi.fn().mockReturnValue('test-model'),
      setActiveModel: vi.fn(),
      resetTurn: vi.fn(),

      isAutoDistillationEnabled: vi.fn().mockReturnValue(false),
      getContextManagementConfig: vi.fn().mockReturnValue({ enabled: false }),
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(createAvailabilityServiceMock()),
    } as unknown as Config;
    mockConfig.getHookSystem = vi.fn().mockReturnValue(mockHookSystem);

    (
      mockConfig as unknown as { toolRegistry: typeof mockToolRegistry }
    ).toolRegistry = mockToolRegistry;
    (mockConfig as unknown as { messageBus: MessageBus }).messageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as MessageBus;
    (mockConfig as unknown as { config: Config; promptId: string }).config =
      mockConfig;
    (mockConfig as unknown as { config: Config; promptId: string }).promptId =
      'test-prompt-id';

    client = new GeminiClient(mockConfig as unknown as AgentLoopContext);
    await client.initialize();
    vi.mocked(mockConfig.getGeminiClient).mockReturnValue(client);
    (mockConfig as unknown as { geminiClient: GeminiClient }).geminiClient =
      client;

    vi.mocked(uiTelemetryService.setLastPromptTokenCount).mockClear();
  });

  afterEach(() => {
    client.dispose();
    vi.restoreAllMocks();
  });

  describe('addHistory', () => {
    it('should call chat.addHistory with the provided content', async () => {
      const mockChat = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
      } as unknown as GeminiChat;
      client['chat'] = mockChat;

      const newContent = {
        role: 'user',
        parts: [{ text: 'New history item' }],
      };
      await client.addHistory(newContent);

      expect(mockChat.addHistory).toHaveBeenCalledWith(newContent);
    });
  });

  describe('setHistory', () => {
    it('should update telemetry token count when history is set', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'some message' }] },
      ];
      client.setHistory(history);

      expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalled();
    });
  });

  describe('resumeChat', () => {
    it('should update telemetry token count when a chat is resumed', async () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'resumed message' }] },
      ];
      await client.resumeChat(history);

      expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalled();
    });
  });

  describe('resetChat', () => {
    it('should create a new chat session, clearing the old history', async () => {
      // 1. Get the initial chat instance and add some history.
      const initialChat = client.getChat();
      const initialHistory = client.getHistory();
      await client.addHistory({
        role: 'user',
        parts: [{ text: 'some old message' }],
      });
      const historyWithOldMessage = client.getHistory();
      expect(historyWithOldMessage.length).toBeGreaterThan(
        initialHistory.length,
      );

      // 2. Call resetChat.
      await client.resetChat();

      // 3. Get the new chat instance and its history.
      const newChat = client.getChat();
      const newHistory = client.getHistory();

      // 4. Assert that the chat instance is new and the history is reset.
      expect(newChat).not.toBe(initialChat);
      expect(newHistory.length).toBe(initialHistory.length);
      expect(JSON.stringify(newHistory)).not.toContain('some old message');
    });

    it('should refresh MemoryContextManager to reset JIT loaded paths', async () => {
      const mockRefresh = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockConfig.getMemoryContextManager).mockReturnValue({
        refresh: mockRefresh,
      } as unknown as ReturnType<typeof mockConfig.getMemoryContextManager>);

      await client.resetChat();

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('should not fail when MemoryContextManager is undefined', async () => {
      vi.mocked(mockConfig.getMemoryContextManager).mockReturnValue(undefined);

      await expect(client.resetChat()).resolves.not.toThrow();
    });
  });

  describe('startChat', () => {
    it('should include environment context when resuming a session', async () => {
      const extraHistory: Content[] = [
        { role: 'user', parts: [{ text: 'Old message' }] },
        { role: 'model', parts: [{ text: 'Old response' }] },
      ];

      const chat = await client.startChat(extraHistory);
      const history = chat.getHistory();

      // The first message should be the environment context
      expect(history[0].role).toBe('user');
      expect(history[0].parts?.[0]?.text).toContain('This is the Gemini CLI');
      expect(history[0].parts?.[0]?.text).toContain(
        "The project's temporary directory is:",
      );

      // The subsequent messages should be the extra history
      expect(history[1]).toEqual(extraHistory[0]);
      expect(history[2]).toEqual(extraHistory[1]);
    });
  });

  describe('tryCompressChat', () => {
    const mockGetHistory = vi.fn();

    beforeEach(() => {
      vi.mock('./tokenLimits', () => ({
        tokenLimit: vi.fn(),
      }));

      client['chat'] = {
        getHistory: mockGetHistory,
        addHistory: vi.fn(),
        setHistory: vi.fn(),
        setTools: vi.fn(),
        getLastPromptTokenCount: vi.fn(),
      } as unknown as GeminiChat;
    });

    function setup({
      chatHistory = [
        { role: 'user', parts: [{ text: 'Long conversation' }] },
        { role: 'model', parts: [{ text: 'Long response' }] },
      ] as Content[],
      originalTokenCount = 1000,
      newTokenCount = 500,
      compressionStatus = CompressionStatus.COMPRESSED,
    } = {}) {
      const mockOriginalChat: Partial<GeminiChat> = {
        getHistory: vi.fn((_curated?: boolean) => chatHistory),
        setHistory: vi.fn(),
        getLastPromptTokenCount: vi.fn().mockReturnValue(originalTokenCount),
        getChatRecordingService: vi.fn().mockReturnValue({
          getConversation: vi.fn().mockReturnValue(null),
          getConversationFilePath: vi.fn().mockReturnValue(null),
        }),
      };
      client['chat'] = mockOriginalChat as GeminiChat;

      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        originalTokenCount,
      );

      const newHistory: Content[] = [
        { role: 'user', parts: [{ text: 'Summary' }] },
        { role: 'model', parts: [{ text: 'Got it' }] },
      ];

      vi.spyOn(ChatCompressionService.prototype, 'compress').mockResolvedValue({
        newHistory:
          compressionStatus === CompressionStatus.COMPRESSED
            ? newHistory
            : null,
        info: {
          originalTokenCount,
          newTokenCount,
          compressionStatus,
        },
      });

      const mockNewChat: Partial<GeminiChat> = {
        getHistory: vi.fn().mockReturnValue(newHistory),
        setHistory: vi.fn(),
        getLastPromptTokenCount: vi.fn().mockReturnValue(newTokenCount),
      };

      client['startChat'] = vi
        .fn()
        .mockResolvedValue(mockNewChat as GeminiChat);

      return {
        client,
        mockOriginalChat,
        mockNewChat,
        estimatedNewTokenCount: newTokenCount,
      };
    }

    describe('when compression inflates the token count', () => {
      it('allows compression to be forced/manual after a failure', async () => {
        // Call 1 (Fails): Setup with inflated tokens
        setup({
          originalTokenCount: 100,
          newTokenCount: 200,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });

        await client.tryCompressChat('prompt-id-4', false); // Fails

        // Call 2 (Forced): Re-setup with compressed tokens
        const { estimatedNewTokenCount: compressedTokenCount } = setup({
          originalTokenCount: 100,
          newTokenCount: 50,
          compressionStatus: CompressionStatus.COMPRESSED,
        });

        const result = await client.tryCompressChat('prompt-id-4', true); // Forced

        expect(result).toEqual({
          compressionStatus: CompressionStatus.COMPRESSED,
          newTokenCount: compressedTokenCount,
          originalTokenCount: 100,
        });
      });

      it('yields the result even if the compression inflated the tokens', async () => {
        const { client, estimatedNewTokenCount } = setup({
          originalTokenCount: 100,
          newTokenCount: 200,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });

        const result = await client.tryCompressChat('prompt-id-4', false);

        expect(result).toEqual({
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
          newTokenCount: estimatedNewTokenCount,
          originalTokenCount: 100,
        });
        // IMPORTANT: The change in client.ts means setLastPromptTokenCount is NOT called on failure
        expect(
          uiTelemetryService.setLastPromptTokenCount,
        ).not.toHaveBeenCalled();
      });

      it('does not manipulate the source chat', async () => {
        const { client, mockOriginalChat } = setup({
          originalTokenCount: 100,
          newTokenCount: 200,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });

        await client.tryCompressChat('prompt-id-4', false);

        // On failure, the chat should NOT be replaced
        expect(client['chat']).toBe(mockOriginalChat);
      });

      it.skip('will not attempt to compress context after a failure', async () => {
        const { client } = setup({
          originalTokenCount: 100,
          newTokenCount: 200,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });

        await client.tryCompressChat('prompt-id-4', false); // This fails and sets hasFailedCompressionAttempt = true

        // Mock the next call to return NOOP
        vi.mocked(
          ChatCompressionService.prototype.compress,
        ).mockResolvedValueOnce({
          newHistory: null,
          info: {
            originalTokenCount: 0,
            newTokenCount: 0,
            compressionStatus: CompressionStatus.NOOP,
          },
        });

        // This call should now be a NOOP
        const result = await client.tryCompressChat('prompt-id-5', false);

        expect(result.compressionStatus).toBe(CompressionStatus.NOOP);
        expect(ChatCompressionService.prototype.compress).toHaveBeenCalledTimes(
          2,
        );
        expect(
          ChatCompressionService.prototype.compress,
        ).toHaveBeenLastCalledWith(
          expect.anything(),
          'prompt-id-5',
          false,
          expect.anything(),
          expect.anything(),
          true, // hasFailedCompressionAttempt
        );
      });
    });
    it('should correctly latch hasFailedCompressionAttempt flag', async () => {
      // 1. Setup: Call setup() from this test file
      // This helper function mocks the compression service for us.
      const { client } = setup({
        originalTokenCount: 100,
        newTokenCount: 200, // Inflated
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      });

      // 2. Test Step 1: Trigger a non-forced failure
      await client.tryCompressChat('prompt-1', false); // force = false

      // 3. Assert Step 1: Check that the flag became true
      // 3. Assert Step 1: Check that the flag became true
      expect(
        (client as unknown as { hasFailedCompressionAttempt: boolean })
          .hasFailedCompressionAttempt,
      ).toBe(true);

      // 4. Test Step 2: Trigger a forced failure

      await client.tryCompressChat('prompt-2', true); // force = true

      // 5. Assert Step 2: Check that the flag REMAINS true
      // 5. Assert Step 2: Check that the flag REMAINS true
      expect(
        (client as unknown as { hasFailedCompressionAttempt: boolean })
          .hasFailedCompressionAttempt,
      ).toBe(true);
    });

    it('should not trigger summarization if token count is below threshold', async () => {
      const MOCKED_TOKEN_LIMIT = 1000;
      const originalTokenCount = MOCKED_TOKEN_LIMIT * 0.699;

      vi.spyOn(ChatCompressionService.prototype, 'compress').mockResolvedValue({
        newHistory: null,
        info: {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.NOOP,
        },
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-2', false);
      const newChat = client.getChat();

      expect(result).toEqual({
        compressionStatus: CompressionStatus.NOOP,
        newTokenCount: originalTokenCount,
        originalTokenCount,
      });
      expect(newChat).toBe(initialChat);
    });

    it('should return NOOP if history is too short to compress', async () => {
      const { client } = setup({
        chatHistory: [{ role: 'user', parts: [{ text: 'hi' }] }],
        originalTokenCount: 50,
        newTokenCount: 50,
        compressionStatus: CompressionStatus.NOOP,
      });

      const result = await client.tryCompressChat('prompt-id-noop', false);

      expect(result).toEqual({
        compressionStatus: CompressionStatus.NOOP,
        originalTokenCount: 50,
        newTokenCount: 50,
      });
    });

    it('should resume the session file when compression succeeds', async () => {
      const { client, mockOriginalChat } = setup({
        compressionStatus: CompressionStatus.COMPRESSED,
      });

      const mockConversation = { some: 'conversation' };
      const mockFilePath = '/tmp/session.json';

      // Override the mock to return values
      const mockRecordingService = {
        getConversation: vi.fn().mockReturnValue(mockConversation),
        getConversationFilePath: vi.fn().mockReturnValue(mockFilePath),
      };
      vi.mocked(mockOriginalChat.getChatRecordingService!).mockReturnValue(
        mockRecordingService as unknown as ChatRecordingService,
      );

      await client.tryCompressChat('prompt-id', false);

      expect(client['startChat']).toHaveBeenCalledWith(
        expect.anything(), // newHistory
        {
          conversation: mockConversation,
          filePath: mockFilePath,
        },
      );
    });
  });

  describe('sendMessageStream', () => {
    it('calls AgentHistoryProvider.manageHistory when history truncation is enabled', async () => {
      // Arrange
      mockConfig.getContextManagementConfig = vi
        .fn()
        .mockReturnValue({ enabled: true });
      const manageHistorySpy = vi
        .spyOn(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client as any).agentHistoryProvider,
          'manageHistory',
        )
        .mockResolvedValue([
          { role: 'user', parts: [{ text: 'preserved message' }] },
        ]);

      mockTurnRunFn.mockReturnValue(
        (async function* () {
          yield { type: 'content', value: 'Hello' };
        })(),
      );

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-1',
      );

      await fromAsync(stream);

      // Assert
      expect(manageHistorySpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(AbortSignal),
      );
    });

    it('emits a compression event when the context was automatically compressed', async () => {
      // Arrange
      mockTurnRunFn.mockReturnValue(
        (async function* () {
          yield { type: 'content', value: 'Hello' };
        })(),
      );

      const compressionInfo: ChatCompressionInfo = {
        compressionStatus: CompressionStatus.COMPRESSED,
        originalTokenCount: 1000,
        newTokenCount: 500,
      };

      vi.spyOn(client, 'tryCompressChat').mockResolvedValueOnce(
        compressionInfo,
      );

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-1',
      );

      const events = await fromAsync(stream);

      // Assert
      expect(events).toContainEqual({
        type: GeminiEventType.ChatCompressed,
        value: compressionInfo,
      });
    });

    it('does not emit ModelInfo event if signal is aborted', async () => {
      // Arrange
      mockTurnRunFn.mockReturnValue(
        (async function* () {
          yield { type: 'content', value: 'Hello' };
        })(),
      );

      const controller = new AbortController();
      controller.abort();

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        controller.signal,
        'prompt-id-1',
      );

      const events = await fromAsync(stream);

      // Assert
      expect(events).not.toContainEqual(
        expect.objectContaining({
          type: GeminiEventType.ModelInfo,
        }),
      );
    });

    it('keeps legacy interactive output baseline-identical when Pollux is disabled (Cell A)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: false,
      });

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-cell-a-baseline',
        ),
      );

      const interactiveWithPolluxDisabled = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-cell-a-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(interactiveWithPolluxDisabled).toEqual(baseline);
      expect(mockPolicyCheck).not.toHaveBeenCalled();
    });

    it('strips <pollux:status> tags from streamed content when selfReport is enabled (Phase E leakage)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.Content,
            value:
              'x <pollux:status stuck_on="ci fails on windows" next="inspect logs"/> y',
          };
          yield {
            type: GeminiEventType.Content,
            value:
              'x <pollux:status next="inspect logs" stuck_on="ci fails on windows"/> y',
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        advisorFallbackModel: null,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          selfReport: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.selfReport,
            enabled: true,
          },
        },
      });

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-phase-e-leakage',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      const contents = events
        .filter((e) => e.type === GeminiEventType.Content)
        .map((e) => (e as { value: string }).value)
        .join('\n');
      expect(contents).not.toContain('<pollux:status');
      expect(contents).toContain('x y');
    });

    it('runs advisor internally on allow and preserves visible stream events (Cell B)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-cell-b-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Continue with executor"}' }],
            },
          },
        ],
      } as GenerateContentResponse);
      const guidanceTelemetrySpy = vi.spyOn(
        telemetryLoggers,
        'logPolluxAdvisorGuidance',
      );

      seedPolluxCompositeIntent(client);
      const polluxOn = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-cell-b-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(polluxOn).toEqual(baseline);
      expect(mockPolicyCheck).toHaveBeenCalled();
      expect(mockPolicyCheck.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'advisor_consultation' }),
      );
      expect(advisorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Object),
        LlmRole.UTILITY_ADVISOR,
        expect.objectContaining({ maxAttemptsOverride: 1 }),
      );
      const historyText = client
        .getHistory()
        .flatMap((entry) => entry.parts ?? [])
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n');
      expect(historyText).toContain('<pollux:advisor_guidance>');
      expect(historyText).toContain('Continue with executor');
      expect(guidanceTelemetrySpy).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          guidance_chars: 'Continue with executor'.length,
          guidance_words: 3,
          parser_outcome: 'direct',
          advisor_trigger_mode: 'hybrid',
          advisor_trigger_source: 'fusion',
          injection_timing: 'next_turn',
        }),
      );
    });

    it('fails open when advisor policy denies (Cell C)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-cell-c-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent');

      const polluxOnDenied = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-cell-c-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(polluxOnDenied).toEqual(baseline);
      expect(advisorSpy).not.toHaveBeenCalled();
    });

    it('fails open on advisor timeout and keeps executor stream stable (Cell D)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-cell-d-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const timeoutError = new Error('advisor timeout');
      timeoutError.name = 'AbortError';
      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockRejectedValue(timeoutError);

      seedPolluxCompositeIntent(client);
      const polluxOnTimeout = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-cell-d-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(polluxOnTimeout).toEqual(baseline);
      expect(
        polluxOnTimeout.some(
          (event) => event.type === GeminiEventType.UserCancelled,
        ),
      ).toBe(false);
      expect(advisorSpy).toHaveBeenCalledTimes(2);
    });

    it('runs same-turn advisor before yielding high-risk ToolCallRequest events (Phase B pre-tool)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'risk-1',
              name: 'run_shell_command',
              args: { command: 'rm -rf /tmp/*' },
              isClientInitiated: false,
              prompt_id: 'prompt-id-risk',
            },
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          riskGate: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Avoid destructive delete"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      const stream = client.sendMessageStream(
        [{ text: 'check this command' }],
        new AbortController().signal,
        'pollux-phase-b-risk-pre-tool',
        undefined,
        false,
        undefined,
        false,
        PolluxRuntimeSurface.LEGACY_INTERACTIVE,
      );
      const iterator = stream[Symbol.asyncIterator]();

      let sawToolCall = false;
      while (true) {
        const next = await iterator.next();
        if (next.done) {
          break;
        }
        if (next.value.type === GeminiEventType.ToolCallRequest) {
          sawToolCall = true;
          break;
        }
      }

      expect(sawToolCall).toBe(true);
      expect(mockPolicyCheck).toHaveBeenCalledTimes(1);
      expect(advisorSpy).toHaveBeenCalledTimes(1);

      const remaining: ServerGeminiStreamEvent[] = [];
      // Drain the stream to avoid leaking pending async work in this test.
      while (true) {
        const next = await iterator.next();
        if (next.done) {
          break;
        }
        remaining.push(next.value);
      }
      expect(
        remaining.some((event) => event.type === GeminiEventType.Finished),
      ).toBe(true);
    });

    it('carries Pollux observer state across tool-response continuations for M3 anchor fusion', async () => {
      const prompt =
        'Fix the transitive import/export mismatch so view.ts uses the canonical createStableLabel implementation through the public index. Do not change src/labels.ts behavior or tests/view.test.ts.';
      const makeToolRequest = (
        callId: string,
        name: string,
        args: Record<string, unknown>,
      ): ServerGeminiStreamEvent => ({
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId,
          name,
          args,
          isClientInitiated: false,
          prompt_id: 'pollux-m3-continuation',
        },
      });
      const finished: ServerGeminiStreamEvent = {
        type: GeminiEventType.Finished,
        value: { reason: FinishReason.STOP, usageMetadata: undefined },
      };
      const modelTurns: ServerGeminiStreamEvent[][] = [
        [
          makeToolRequest('read-index', 'read_file', {
            file_path: 'src/index.ts',
          }),
          makeToolRequest('read-labels', 'read_file', {
            file_path: 'src/labels.ts',
          }),
          makeToolRequest('read-view', 'read_file', {
            file_path: 'src/view.ts',
          }),
          makeToolRequest('read-test', 'read_file', {
            file_path: 'tests/view.test.ts',
          }),
          finished,
        ],
        [
          makeToolRequest('mut-index', 'replace', {
            file_path: 'src/index.ts',
            old_string: 'export { createLabel } from "./labels.js";\n',
            new_string: 'export { createStableLabel } from "./labels.js";\n',
          }),
          finished,
        ],
        [finished],
      ];
      mockTurnRunFn.mockImplementation(() => {
        const events = modelTurns.shift() ?? [finished];
        return (async function* () {
          for (const event of events) {
            yield event;
          }
        })();
      });

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"check public index repair"}' }],
            },
          },
        ],
      } as GenerateContentResponse);
      const escalationSpy = vi.spyOn(telemetryLoggers, 'logPolluxEscalation');

      await fromAsync(
        client.sendMessageStream(
          [{ text: prompt }],
          new AbortController().signal,
          'pollux-m3-continuation',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        ),
      );
      expect(advisorSpy).not.toHaveBeenCalled();

      await fromAsync(
        client.sendMessageStream(
          [
            {
              functionResponse: {
                name: 'read_file',
                response: { success: true },
              },
            },
          ],
          new AbortController().signal,
          'pollux-m3-continuation',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        ),
      );

      if (advisorSpy.mock.calls.length === 0) {
        await fromAsync(
          client.sendMessageStream(
            [
              {
                functionResponse: {
                  name: 'replace',
                  response: { success: true },
                },
              },
            ],
            new AbortController().signal,
            'pollux-m3-continuation',
            undefined,
            false,
            undefined,
            false,
            PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
          ),
        );
      }

      expect(advisorSpy).toHaveBeenCalled();
      expect(JSON.stringify(advisorSpy.mock.calls[0]?.[1])).toContain(prompt);
      expect(escalationSpy).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          reason_code: PolluxEscalationReasonCode.PRE_MUTATION_REVIEW,
          contributing_signal_ids: expect.arrayContaining([
            'tool.pre_mutation_advisor',
          ]),
        }),
      );
    });

    it('fails open on same-turn risk-gate advisor exceptions and still streams tool events', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'risk-throw-1',
              name: 'run_shell_command',
              args: { command: 'git push --force origin main' },
              isClientInitiated: false,
              prompt_id: 'prompt-id-risk-throw',
            },
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          riskGate: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockRejectedValue(new Error('advisor failure'));

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'run risky command' }],
          new AbortController().signal,
          'pollux-phase-b-risk-fail-open',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).toHaveBeenCalledTimes(1);
      expect(
        events.some((event) => event.type === GeminiEventType.ToolCallRequest),
      ).toBe(true);
      expect(
        events.some((event) => event.type === GeminiEventType.Finished),
      ).toBe(true);
    });

    it('honors policy deny on same-turn risk-gate path and does not call advisor model', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'risk-deny-1',
              name: 'run_shell_command',
              args: { command: 'rm -rf /tmp/*' },
              isClientInitiated: false,
              prompt_id: 'prompt-id-risk-deny',
            },
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          riskGate: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent');

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'run risky command' }],
          new AbortController().signal,
          'pollux-phase-b-risk-policy-deny',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).not.toHaveBeenCalled();
      expect(
        events.some((event) => event.type === GeminiEventType.ToolCallRequest),
      ).toBe(true);
    });

    it('I11: only one same-turn risk-gate advisor call fires per turn', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'risk-single-shot-1',
              name: 'run_shell_command',
              args: { command: 'rm -rf /tmp/*' },
              isClientInitiated: false,
              prompt_id: 'prompt-id-risk-single-shot',
            },
          };
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'risk-single-shot-2',
              name: 'run_shell_command',
              args: { command: 'git push --force origin main' },
              isClientInitiated: false,
              prompt_id: 'prompt-id-risk-single-shot',
            },
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          riskGate: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
            maxSameTurnEscalationsPerTurn: 1,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Use safe alternative"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'run risky commands' }],
          new AbortController().signal,
          'pollux-phase-b-risk-single-shot',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).toHaveBeenCalledTimes(1);
      expect(mockPolicyCheck).toHaveBeenCalledTimes(1);
      expect(
        events.filter(
          (event) => event.type === GeminiEventType.ToolCallRequest,
        ),
      ).toHaveLength(2);
    });

    it('runs same-turn advisor on loop confirmation when observer bridge is enabled (Phase C)', async () => {
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck')
        .mockReturnValueOnce({ count: 1, detail: 'Repetitive tool call' })
        .mockReturnValue({ count: 0 });
      // Mimic the real `clearDetection()` that `_recoverFromLoop` runs on
      // strike 1: peekState reports `loopDetected: true` until the recovery
      // kicks in, then returns `false` for the recovery turn so the Phase F
      // observer's loop bridge does not re-fire a second same-turn consult
      // inside the recursion (Phase C parity).
      const peekStateSpy = vi
        .spyOn(client['loopDetector'], 'peekState')
        .mockReturnValue({
          loopDetected: true,
          lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
          detail: 'Repetitive tool call',
        });
      vi.spyOn(client['loopDetector'], 'clearDetection').mockImplementation(
        () => {
          peekStateSpy.mockReturnValue({ loopDetected: false });
        },
      );

      const sendMessageStreamSpy = vi.spyOn(client, 'sendMessageStream');
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Event' };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                { text: '{"guidance":"Break loop and change approach"}' },
              ],
            },
          },
        ],
      } as GenerateContentResponse);

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-phase-c-loop-same-turn',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).toHaveBeenCalledTimes(1);
      expect(sendMessageStreamSpy).toHaveBeenCalledTimes(2);
      expect(events).not.toContainEqual({ type: GeminiEventType.LoopDetected });
    });

    it('Phase C §C.4: peekState throws — fail-open; stream completes without advisor', async () => {
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck').mockReturnValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'peekState').mockImplementation(() => {
        throw new Error('peekState synthetic failure');
      });

      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'ok' };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent');

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-phase-c-peek-fail-open',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).not.toHaveBeenCalled();
      expect(events.some((e) => e.type === GeminiEventType.Content)).toBe(true);
    });

    it('Phase C §C.4: count===1, sameTurnEnabled=false — no LoopDetected, recovery, HARD_LOOP queued for next turn', async () => {
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck')
        .mockReturnValueOnce({ count: 1, detail: 'First strike' })
        .mockReturnValue({ count: 0 });

      mockTurnRunFn
        .mockImplementationOnce(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'before loop break' };
          })(),
        )
        .mockImplementationOnce(() =>
          (async function* () {
            yield {
              type: GeminiEventType.Content,
              value: 'after recovery stream',
            };
            yield {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            };
          })(),
        );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: false,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                { text: '{"guidance":"Queued HARD_LOOP next-turn consult"}' },
              ],
            },
          },
        ],
      } as GenerateContentResponse);

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'user turn' }],
          new AbortController().signal,
          'pollux-phase-c4-count1-next-turn-queue',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(events).not.toContainEqual({ type: GeminiEventType.LoopDetected });
      expect(
        events.some(
          (e) =>
            e.type === GeminiEventType.Content &&
            'value' in e &&
            e.value === 'after recovery stream',
        ),
      ).toBe(true);
      expect(advisorSpy).toHaveBeenCalledTimes(1);
    });

    it('Phase C §C.5: HARD_LOOP same-turn policy DENY queues next-turn; recovery turn consults once when ALLOW', async () => {
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck')
        .mockReturnValueOnce({ count: 1, detail: 'Loop strike' })
        .mockReturnValue({ count: 0 });
      vi.spyOn(client['loopDetector'], 'peekState').mockReturnValue({
        loopDetected: true,
        lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
        detail: 'Loop strike',
      });

      mockTurnRunFn
        .mockImplementationOnce(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'looping' };
          })(),
        )
        .mockImplementationOnce(() =>
          (async function* () {
            yield {
              type: GeminiEventType.Content,
              value: 'post-deny recovery',
            };
            yield {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            };
          })(),
        );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck
        .mockResolvedValueOnce({
          decision: PolicyDecision.DENY,
          rule: undefined,
        })
        .mockResolvedValue({
          decision: PolicyDecision.ALLOW,
          rule: undefined,
        });

      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Next-turn after deny"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-phase-c5-deny-then-queue',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(mockPolicyCheck).toHaveBeenCalledTimes(2);
      expect(advisorSpy).toHaveBeenCalledTimes(1);
    });

    it('Phase C §C.5: HARD_LOOP same-turn budget exhausted downgrades; recovery turn consults queued intent', async () => {
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck')
        .mockReturnValueOnce({ count: 0 })
        .mockReturnValueOnce({ count: 1, detail: 'Loop strike' })
        .mockReturnValue({ count: 0 });
      const peekState = vi
        .fn()
        .mockReturnValueOnce({
          loopDetected: false,
          lastLoopType: undefined,
          detail: undefined,
        })
        .mockReturnValueOnce({
          loopDetected: true,
          lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
          detail: 'Loop strike',
        })
        .mockReturnValue({
          loopDetected: false,
          lastLoopType: undefined,
          detail: undefined,
        });
      vi.spyOn(client['loopDetector'], 'peekState').mockImplementation(
        peekState,
      );

      mockTurnRunFn
        .mockImplementationOnce(() =>
          (async function* () {
            yield {
              type: GeminiEventType.ToolCallRequest,
              value: {
                callId: 'risk-budget-1',
                name: 'run_shell_command',
                args: { command: 'rm -rf /tmp/*' },
                isClientInitiated: false,
                prompt_id: 'prompt-id-risk-budget',
              },
            };
            yield { type: GeminiEventType.Content, value: 'looping' };
          })(),
        )
        .mockImplementationOnce(() =>
          (async function* () {
            yield {
              type: GeminiEventType.Content,
              value: 'post-budget recovery',
            };
            yield {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            };
          })(),
        );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        maxAdvisorCallsPerTurn: 1,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          riskGate: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
            enabled: true,
          },
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '{"guidance":"ok"}' }] } }],
      } as GenerateContentResponse);

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-phase-c5-budget-exhausted',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      // 1 call for risk gate; loop consult is budget-exhausted; 1 call on recovery for queued HARD_LOOP.
      expect(advisorSpy).toHaveBeenCalledTimes(2);
      expect(events).not.toContainEqual({ type: GeminiEventType.LoopDetected });
      expect(
        events.some(
          (e) =>
            e.type === GeminiEventType.Content &&
            'value' in e &&
            e.value === 'post-budget recovery',
        ),
      ).toBe(true);
    });

    it('Phase C §C.5: HARD_LOOP same-turn advisor throw downgrades; recovery turn consults queued intent', async () => {
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck')
        .mockReturnValueOnce({ count: 1, detail: 'Loop strike' })
        .mockReturnValue({ count: 0 });
      vi.spyOn(client['loopDetector'], 'peekState').mockReturnValue({
        loopDetected: true,
        lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
        detail: 'Loop strike',
      });

      mockTurnRunFn
        .mockImplementationOnce(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'looping' };
          })(),
        )
        .mockImplementationOnce(() =>
          (async function* () {
            yield {
              type: GeminiEventType.Content,
              value: 'post-throw recovery',
            };
            yield {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            };
          })(),
        );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockRejectedValueOnce(new Error('advisor synthetic throw'))
        .mockResolvedValue({
          candidates: [{ content: { parts: [{ text: '{"guidance":"ok"}' }] } }],
        } as GenerateContentResponse);

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-phase-c5-advisor-throw',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).toHaveBeenCalledTimes(2);
      expect(events).not.toContainEqual({ type: GeminiEventType.LoopDetected });
      expect(
        events.some(
          (e) =>
            e.type === GeminiEventType.Content &&
            'value' in e &&
            e.value === 'post-throw recovery',
        ),
      ).toBe(true);
    });

    it('Phase C §C.5: count>1 still emits LoopDetected with observer enabled (safety net)', async () => {
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck').mockReturnValue({
        count: 2,
        detail: 'Strike 2',
      });
      vi.spyOn(client['loopDetector'], 'peekState').mockReturnValue({
        loopDetected: true,
        lastLoopType: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
        detail: 'Strike 2',
      });

      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'looping event' };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: false,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-phase-c5-count-gt1-safety',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(events).toContainEqual({ type: GeminiEventType.LoopDetected });
    });

    it('queues HARD_LOOP next-turn advisor intent when same-turn loop path is disabled (Phase C fallback)', async () => {
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck')
        .mockReturnValueOnce({ count: 2, detail: 'Strike 2' })
        .mockReturnValue({ count: 0 });

      mockTurnRunFn
        .mockImplementationOnce(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'looping event' };
          })(),
        )
        .mockImplementationOnce(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'next user turn' };
            yield {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            };
          })(),
        );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: false,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Consulted on queued hard loop"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      const firstTurnEvents = await fromAsync(
        client.sendMessageStream(
          [{ text: 'first request' }],
          new AbortController().signal,
          'pollux-phase-c-loop-next-turn-1',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(firstTurnEvents).toContainEqual({
        type: GeminiEventType.LoopDetected,
      });
      expect(advisorSpy).toHaveBeenCalledTimes(0);

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'second request' }],
          new AbortController().signal,
          'pollux-phase-c-loop-next-turn-2',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).toHaveBeenCalledTimes(1);
    });

    // ──────────────────────────────────────────────────────────────
    // Phase F: advisor consultation lifecycle
    // Covers DETECTOR_IMPLEMENTATION_PLAN §11.F.3 test checklist.
    // ──────────────────────────────────────────────────────────────

    /**
     * Capture every `pollux-advisor-phase` telemetry payload emitted during
     * a test. Returns a `stop()` function that detaches the listener and
     * yields the captured payloads in emission order.
     */
    function capturePolluxAdvisorPhaseEvents(): {
      payloads: PolluxAdvisorPhasePayload[];
      stop: () => PolluxAdvisorPhasePayload[];
    } {
      const payloads: PolluxAdvisorPhasePayload[] = [];
      const listener = (payload: PolluxAdvisorPhasePayload) => {
        payloads.push(payload);
      };
      coreEvents.on(CoreEvent.PolluxAdvisorPhase, listener);
      return {
        payloads,
        stop: () => {
          coreEvents.off(CoreEvent.PolluxAdvisorPhase, listener);
          return payloads;
        },
      };
    }

    it('Phase F §11.F.3 7.1: next-turn lifecycle — queued intent from turn N consults on turn N+1 with escalationTiming=next_turn', async () => {
      // Simulate a soft composite that already fired on a prior turn: the
      // observer has queued a NextTurnIntent onto the client's slot. The
      // stream on turn N+1 should consult the advisor at top-of-turn.
      client['polluxPendingNextTurnIntent'] = {
        timing: 'next_turn',
        reasonCode: PolluxEscalationReasonCode.FUSION_COMPOSITE,
        netScore: 4.2,
        contributingSignalIds: ['thought.repetition', 'tool.redundant_noop'],
        queuedAtMs: Date.now() - 10,
      };

      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'ok' };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        advisorFallbackModel: null,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: '{"guidance":"next-turn"}' }] } },
        ],
      } as GenerateContentResponse);
      const escalationSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxEscalation')
        .mockImplementation(() => {});

      const telemetry = capturePolluxAdvisorPhaseEvents();

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'carry over' }],
          new AbortController().signal,
          'pollux-phase-f-next-turn',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      const events = telemetry.stop();
      expect(advisorSpy).toHaveBeenCalledTimes(1);
      const pending = events.find((e) => e.phase === 'pending');
      expect(pending?.escalationTiming).toBe('next_turn');
      expect(pending?.contributingSignalIds).toEqual([
        'thought.repetition',
        'tool.redundant_noop',
      ]);
      expect(escalationSpy).toHaveBeenCalled();
      const consulted = escalationSpy.mock.calls
        .map(([, event]) => event)
        .find((event) => event.outcome === 'consulted');
      expect(consulted?.reason_code).toBe(
        PolluxEscalationReasonCode.FUSION_COMPOSITE,
      );
      expect(consulted?.escalation_timing).toBe('next_turn');
      // The slot is consumed exactly once and cleared.
      expect(client['polluxPendingNextTurnIntent']).toBeUndefined();
    });

    it('Phase F §11.F.3 7.4: self-report lifecycle — <pollux:status stuck_on="..."> triggers same-turn consult with SELF_REPORT_STUCK', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.Content,
            value:
              'Checking: <pollux:status stuck_on="cannot resolve merge conflict" next="inspect HEAD"/> continuing.',
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          selfReport: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.selfReport,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: '{"guidance":"try rebase"}' }] } },
        ],
      } as GenerateContentResponse);
      const escalationSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxEscalation')
        .mockImplementation(() => {});
      const guidanceSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxAdvisorGuidance')
        .mockImplementation(() => {});

      const telemetry = capturePolluxAdvisorPhaseEvents();

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'help with merge conflict' }],
          new AbortController().signal,
          'pollux-phase-f-self-report',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      const events = telemetry.stop();
      expect(advisorSpy).toHaveBeenCalledTimes(1);
      const pending = events.find((e) => e.phase === 'pending');
      expect(pending?.escalationTiming).toBe('same_turn');
      expect(pending?.pauseBoundary).toBe('post_event');
      expect(pending?.contributingSignalIds).toContain(
        'self.structured_status_stuck',
      );
      const consulted = escalationSpy.mock.calls
        .map(([, event]) => event)
        .find(
          (event) =>
            event.outcome === 'consulted' &&
            event.reason_code === PolluxEscalationReasonCode.SELF_REPORT_STUCK,
        );
      expect(consulted?.escalation_timing).toBe('same_turn');
      expect(guidanceSpy).not.toHaveBeenCalled();
      expect(client['polluxPendingAdvisorGuidance']).toMatchObject({
        guidance: 'try rebase',
        injectionTiming: 'same_turn_next_continuation',
      });

      client['flushPolluxPendingAdvisorGuidance']();
      expect(guidanceSpy).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          reason_code: PolluxEscalationReasonCode.SELF_REPORT_STUCK,
          escalation_timing: 'same_turn',
          injection_timing: 'same_turn_next_continuation',
          advisor_trigger_source: 'self_status',
        }),
      );
    });

    it('executor-request smoke: advisor_request triggers same-turn consult before a substantive edit and stages hidden guidance', async () => {
      let advisorCalledBeforeTool = false;
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.Content,
            value:
              'Plan first: <pollux:advisor_request reason="need alias map before editing exports across parser and renderer" timing="now"/>',
          };
          expect(advisorCalledBeforeTool).toBe(true);
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'tool-1',
              name: 'replace',
              args: {
                file_path: 'src/parser.ts',
                old_string: 'legacyAlias',
                new_string: 'stableAlias',
              },
              isClientInitiated: false,
              prompt_id: 'pollux-phase-f-executor-request',
            },
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        advisorTriggerMode: 'executor_request',
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          selfReport: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.selfReport,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockImplementation(async (...args) => {
          if (args[3] === LlmRole.UTILITY_ADVISOR) {
            advisorCalledBeforeTool = true;
          }
          return {
            candidates: [
              {
                content: {
                  parts: [
                    { text: '{"guidance":"Inspect alias ownership first"}' },
                  ],
                },
              },
            ],
          } as GenerateContentResponse;
        });
      const escalationSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxEscalation')
        .mockImplementation(() => {});
      const guidanceSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxAdvisorGuidance')
        .mockImplementation(() => {});

      const telemetry = capturePolluxAdvisorPhaseEvents();

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'update parser alias handling safely' }],
          new AbortController().signal,
          'pollux-phase-f-executor-request',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      const phaseEvents = telemetry.stop();
      expect(advisorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Object),
        LlmRole.UTILITY_ADVISOR,
        expect.objectContaining({ maxAttemptsOverride: 1 }),
      );
      expect(
        events.some((event) => event.type === GeminiEventType.ToolCallRequest),
      ).toBe(true);
      const pending = phaseEvents.find((e) => e.phase === 'pending');
      expect(pending?.escalationTiming).toBe('same_turn');
      expect(pending?.pauseBoundary).toBe('post_event');
      expect(pending?.contributingSignalIds).toContain('self.advisor_request');
      const consulted = escalationSpy.mock.calls
        .map(([, event]) => event)
        .find(
          (event) =>
            event.outcome === 'consulted' &&
            event.reason_code ===
              PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST,
        );
      expect(consulted?.escalation_timing).toBe('same_turn');
      expect(client['polluxPendingAdvisorGuidance']).toMatchObject({
        guidance: 'Inspect alias ownership first',
        injectionTiming: 'same_turn_next_continuation',
      });

      client['flushPolluxPendingAdvisorGuidance']();
      expect(guidanceSpy).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          reason_code: PolluxEscalationReasonCode.EXECUTOR_ADVISOR_REQUEST,
          escalation_timing: 'same_turn',
          injection_timing: 'same_turn_next_continuation',
          advisor_trigger_source: 'executor_request',
        }),
      );
      const historyText = client
        .getHistory()
        .flatMap((entry) => entry.parts ?? [])
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n');
      expect(historyText).toContain('<pollux:advisor_guidance>');
      expect(historyText).toContain('Inspect alias ownership first');
    });

    it('records capacity_exhausted when the advisor model is capacity-limited', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.Content,
            value:
              'Checking: <pollux:status stuck_on="cannot resolve merge conflict" next="inspect HEAD"/> continuing.',
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        advisorFallbackModel: null,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          selfReport: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.selfReport,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockImplementation(async (modelConfigKey) => {
          if (
            modelConfigKey.model ===
            DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.advisorModel
          ) {
            throw new RetryableQuotaError(
              'No capacity available for advisor model',
              {
                code: 429,
                message: 'No capacity available for advisor model',
                details: [],
              },
            );
          }
          return {
            candidates: [
              {
                content: {
                  parts: [{ text: '{"guidance":"unexpected fallback"}' }],
                },
              },
            ],
          } as GenerateContentResponse;
        });
      const escalationSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxEscalation')
        .mockImplementation(() => {});
      const telemetry = capturePolluxAdvisorPhaseEvents();

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'help with merge conflict' }],
          new AbortController().signal,
          'pollux-phase-f-self-report-fallback',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      const events = telemetry.stop();
      expect(advisorSpy.mock.calls[0]?.[0]).toMatchObject({
        model: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.advisorModel,
      });
      expect(advisorSpy).toHaveBeenCalledTimes(1);
      expect(
        events
          .filter((event) => event.phase === 'consulting')
          .map((event) => event.advisorModel),
      ).toEqual([DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.advisorModel]);
      const failOpen = escalationSpy.mock.calls
        .map(([, event]) => event)
        .find(
          (event) =>
            event.outcome === 'fail_open' &&
            event.reason_code === PolluxEscalationReasonCode.SELF_REPORT_STUCK,
        );
      expect(failOpen?.escalation_timing).toBe('same_turn');
      expect(failOpen?.failure_kind).toBe('capacity_exhausted');
    });

    it('Phase F §11.F.3 7.6: single-shot guardrail — two same-turn-eligible risk triggers collapse to one consult; second downgrades to next-turn', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'f-single-1',
              name: 'run_shell_command',
              args: { command: 'rm -rf /tmp/a' },
              isClientInitiated: false,
              prompt_id: 'pollux-phase-f-single-shot',
            },
          };
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'f-single-2',
              name: 'run_shell_command',
              args: { command: 'git push --force origin main' },
              isClientInitiated: false,
              prompt_id: 'pollux-phase-f-single-shot',
            },
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          riskGate: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
            // Deliberately allow >1 per observer cap so the client-level
            // single-shot (I11) is the enforcing path.
            maxSameTurnEscalationsPerTurn: 3,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: '{"guidance":"one-shot"}' }] } },
        ],
      } as GenerateContentResponse);

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'two risky commands' }],
          new AbortController().signal,
          'pollux-phase-f-single-shot',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      // Exactly one same-turn consult fired during the turn.
      expect(advisorSpy).toHaveBeenCalledTimes(1);
      // The second risk trigger must have been downgraded to a next-turn
      // intent on the client, preserving its reason code.
      const queued = client['polluxPendingNextTurnIntent'];
      expect(queued).toBeDefined();
      expect(queued?.timing).toBe('next_turn');
      expect(queued?.reasonCode).toBe(
        PolluxEscalationReasonCode.RISK_GATE_BLOCK,
      );
    });

    it('Phase F §11.F.3 7.7: no recursion — after a same-turn consult additional post-event triggers do not consult again', async () => {
      // Post-event trigger via self-report; then another post-event content
      // with a second stuck tag should not produce a second same-turn call.
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.Content,
            value: '<pollux:status stuck_on="first obstacle"/>',
          };
          yield {
            type: GeminiEventType.Content,
            value: '<pollux:status stuck_on="second obstacle"/>',
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          selfReport: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.selfReport,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: '{"guidance":"no-recursion"}' }] } },
        ],
      } as GenerateContentResponse);

      await fromAsync(
        client.sendMessageStream(
          // The heuristic detector matches `\b(stuck|blocked|...)\b` in the
          // user request, so the prompt must NOT contain those words or the
          // top-of-turn detector path will fire a second generateContent call
          // that is orthogonal to the post-event same-turn guardrail we are
          // testing here.
          [{ text: 'please analyze the situation' }],
          new AbortController().signal,
          'pollux-phase-f-no-recursion',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).toHaveBeenCalledTimes(1);
      expect(client['polluxSameTurnFiredThisTurn']).toBe(true);
    });

    it('Phase F §11.F.3 7.9: budget cap downgrades same-turn to next-turn with sameTurnDowngraded=true telemetry', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'f-budget-1',
              name: 'run_shell_command',
              args: { command: 'rm -rf /tmp/b' },
              isClientInitiated: false,
              prompt_id: 'pollux-phase-f-budget',
            },
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        // Exhaust the session-level budget up front: `polluxAdvisorCallsThisTurn`
        // is reset at `processTurn` entry, but the session counter is not --
        // using it ensures the budget check at same-turn trigger time is
        // unavoidable.
        maxAdvisorCallsPerSession: 1,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          riskGate: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: true,
          },
        },
      });
      // Pretend the session budget is already exhausted by a prior consult.
      client['polluxAdvisorCallsThisSession'] = 1;

      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent');
      const escalationSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxEscalation')
        .mockImplementation(() => {});

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'risky with budget exhausted' }],
          new AbortController().signal,
          'pollux-phase-f-budget',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      // No mid-turn consult should have fired.
      expect(advisorSpy).not.toHaveBeenCalled();
      // The risk-gate intent must be parked on the next-turn slot with the
      // same reason code; the client will re-check budget at the top of the
      // following turn.
      const queued = client['polluxPendingNextTurnIntent'];
      expect(queued).toBeDefined();
      expect(queued?.reasonCode).toBe(
        PolluxEscalationReasonCode.RISK_GATE_BLOCK,
      );
      const budget = escalationSpy.mock.calls
        .map(([, event]) => event)
        .find((event) => event.outcome === 'budget_exhausted');
      expect(budget?.reason_code).toBe(
        PolluxEscalationReasonCode.RISK_GATE_BLOCK,
      );
    });

    it('Phase F §11.F.3 7.11: kill switch — detector.timing.sameTurnEnabled=false forces risk-gate to next-turn queue; no mid-turn consult', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield {
            type: GeminiEventType.ToolCallRequest,
            value: {
              callId: 'f-kill-1',
              name: 'run_shell_command',
              args: { command: 'rm -rf /tmp/c' },
              isClientInitiated: false,
              prompt_id: 'pollux-phase-f-kill',
            },
          };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          riskGate: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.riskGate,
            enabled: true,
          },
          timing: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.timing,
            sameTurnEnabled: false,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent');
      const escalationSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxEscalation')
        .mockImplementation(() => {});

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'kill switch on' }],
          new AbortController().signal,
          'pollux-phase-f-kill',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      // No mid-turn consult allowed.
      expect(advisorSpy).not.toHaveBeenCalled();
      // Observer / client should have queued a next-turn intent so the
      // advisor is still consulted on the next turn.
      const queued = client['polluxPendingNextTurnIntent'];
      expect(queued).toBeDefined();
      expect(queued?.timing).toBe('next_turn');
      expect(queued?.reasonCode).toBe(
        PolluxEscalationReasonCode.RISK_GATE_BLOCK,
      );
      const deferred = escalationSpy.mock.calls
        .map(([, event]) => event)
        .find((event) => event.outcome === 'deferred_next_turn');
      expect(deferred?.reason_code).toBe(
        PolluxEscalationReasonCode.RISK_GATE_BLOCK,
      );
      expect(deferred?.same_turn_downgraded).toBe(true);
    });

    it('Phase F §11.F.3 telemetry attribution: next-turn consult of a same-turn-canonical intent emits sameTurnDowngraded=true', async () => {
      // Reason code is canonically same-turn (HARD_LOOP), but we queue it on
      // the next-turn slot. §F.1.6 inference says the next-turn consult must
      // emit sameTurnDowngraded=true.
      client['polluxPendingNextTurnIntent'] =
        buildPolluxHardLoopNextTurnIntent();

      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'ok' };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
        },
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: '{"guidance":"downgraded"}' }] } },
        ],
      } as GenerateContentResponse);

      const telemetry = capturePolluxAdvisorPhaseEvents();

      await fromAsync(
        client.sendMessageStream(
          [{ text: 'consult queued hard-loop' }],
          new AbortController().signal,
          'pollux-phase-f-downgrade-telemetry',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      const events = telemetry.stop();
      const pending = events.find((e) => e.phase === 'pending');
      expect(pending?.escalationTiming).toBe('next_turn');
      expect(pending?.sameTurnDowngraded).toBe(true);
      expect(pending?.contributingSignalIds).toEqual(['loop.hard_confirmed']);
    });

    it('Phase F §11.F.3 7.10: observer ingest() throwing mid-stream is fail-open; stream completes without escalation', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'keep going' };
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        detector: {
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector,
          observer: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.observer,
            enabled: true,
          },
          selfReport: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detector.selfReport,
            enabled: true,
          },
        },
      });
      // Force the self-report parse path to throw by monkey-patching a
      // global function it uses -- but since that module is pure, we instead
      // spy on the loop detector's peekState (consumed by the loop sensor
      // via `ingestAfterLoopCheck`) to simulate a mid-stream exception
      // surface. The fail-open harness at the call site must swallow it.
      vi.spyOn(client['loopDetector'], 'peekState').mockImplementation(() => {
        throw new Error('synthetic observer failure');
      });
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
        count: 0,
      });
      vi.spyOn(client['loopDetector'], 'addAndCheck').mockReturnValue({
        count: 0,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent');

      const events = await fromAsync(
        client.sendMessageStream(
          [{ text: 'observer throws' }],
          new AbortController().signal,
          'pollux-phase-f-observer-throws',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).not.toHaveBeenCalled();
      expect(events.some((e) => e.type === GeminiEventType.Content)).toBe(true);
      expect(events.some((e) => e.type === GeminiEventType.Finished)).toBe(
        true,
      );
    });

    it('keeps legacy non-interactive output baseline-identical when Pollux is disabled (D2 Cell A)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: false,
      });

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-d2-cell-a-baseline',
        ),
      );

      const nonInteractiveWithPolluxDisabled = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-d2-cell-a-non-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        ),
      );

      expect(nonInteractiveWithPolluxDisabled).toEqual(baseline);
      expect(mockPolicyCheck).not.toHaveBeenCalled();
    });

    it('runs advisor internally on allow and preserves non-interactive stream events (D2 Cell B)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d2-cell-b-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Continue with executor"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      seedPolluxCompositeIntent(client);
      const polluxOn = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d2-cell-b-non-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        ),
      );

      expect(polluxOn).toEqual(baseline);
      expect(mockPolicyCheck).toHaveBeenCalled();
      expect(mockPolicyCheck.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'advisor_consultation' }),
      );
      expect(advisorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Object),
        LlmRole.UTILITY_ADVISOR,
        expect.objectContaining({ maxAttemptsOverride: 1 }),
      );
    });

    it('fails open for legacy non-interactive when advisor policy denies (D2 Cell C)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d2-cell-c-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent');

      const polluxOnDenied = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d2-cell-c-non-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        ),
      );

      expect(polluxOnDenied).toEqual(baseline);
      expect(advisorSpy).not.toHaveBeenCalled();
    });

    it('fails open on advisor timeout and keeps non-interactive executor stream stable (D2 Cell D)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d2-cell-d-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const timeoutError = new Error('advisor timeout');
      timeoutError.name = 'AbortError';
      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockRejectedValue(timeoutError);

      seedPolluxCompositeIntent(client);
      const polluxOnTimeout = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d2-cell-d-non-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        ),
      );

      expect(polluxOnTimeout).toEqual(baseline);
      expect(
        polluxOnTimeout.some(
          (event) => event.type === GeminiEventType.UserCancelled,
        ),
      ).toBe(false);
      expect(advisorSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps interactive agent-session output baseline-identical when Pollux is disabled (D3 Cell A)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: false,
      });

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-d3-cell-a-baseline',
        ),
      );

      const agentSessionInteractiveWithPolluxDisabled = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-d3-cell-a-agent-session-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE,
        ),
      );

      expect(agentSessionInteractiveWithPolluxDisabled).toEqual(baseline);
      expect(mockPolicyCheck).not.toHaveBeenCalled();
    });

    it('runs advisor internally on allow and preserves interactive agent-session stream events (D3 Cell B)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d3-cell-b-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Continue with executor"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      seedPolluxCompositeIntent(client);
      const polluxOn = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d3-cell-b-agent-session-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE,
        ),
      );

      expect(polluxOn).toEqual(baseline);
      expect(mockPolicyCheck).toHaveBeenCalled();
      expect(mockPolicyCheck.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'advisor_consultation' }),
      );
      expect(advisorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Object),
        LlmRole.UTILITY_ADVISOR,
        expect.objectContaining({ maxAttemptsOverride: 1 }),
      );
    });

    it('fails open for interactive agent-session when advisor policy denies (D3 Cell C)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d3-cell-c-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent');

      const polluxOnDenied = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d3-cell-c-agent-session-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE,
        ),
      );

      expect(polluxOnDenied).toEqual(baseline);
      expect(advisorSpy).not.toHaveBeenCalled();
    });

    it('fails open on advisor timeout and keeps interactive agent-session executor stream stable (D3 Cell D)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d3-cell-d-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const timeoutError = new Error('advisor timeout');
      timeoutError.name = 'AbortError';
      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockRejectedValue(timeoutError);

      seedPolluxCompositeIntent(client);
      const polluxOnTimeout = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d3-cell-d-agent-session-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE,
        ),
      );

      expect(polluxOnTimeout).toEqual(baseline);
      expect(
        polluxOnTimeout.some(
          (event) => event.type === GeminiEventType.UserCancelled,
        ),
      ).toBe(false);
      expect(advisorSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps non-interactive agent-session output baseline-identical when Pollux is disabled (D4 Cell A)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: false,
      });

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-d4-cell-a-baseline',
        ),
      );

      const agentSessionNonInteractiveWithPolluxDisabled = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-d4-cell-a-agent-session-non-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE,
        ),
      );

      expect(agentSessionNonInteractiveWithPolluxDisabled).toEqual(baseline);
      expect(mockPolicyCheck).not.toHaveBeenCalled();
    });

    it('runs advisor internally on allow and preserves non-interactive agent-session stream events (D4 Cell B)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d4-cell-b-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Continue with executor"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      seedPolluxCompositeIntent(client);
      const polluxOn = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d4-cell-b-agent-session-non-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE,
        ),
      );

      expect(polluxOn).toEqual(baseline);
      expect(mockPolicyCheck).toHaveBeenCalled();
      expect(mockPolicyCheck.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'advisor_consultation' }),
      );
      expect(advisorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Object),
        LlmRole.UTILITY_ADVISOR,
        expect.objectContaining({ maxAttemptsOverride: 1 }),
      );
    });

    it('fails open for non-interactive agent-session when advisor policy denies (D4 Cell C)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d4-cell-c-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent');

      const polluxOnDenied = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d4-cell-c-agent-session-non-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE,
        ),
      );

      expect(polluxOnDenied).toEqual(baseline);
      expect(advisorSpy).not.toHaveBeenCalled();
    });

    it('fails open on advisor timeout and keeps non-interactive agent-session executor stream stable (D4 Cell D)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d4-cell-d-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const timeoutError = new Error('advisor timeout');
      timeoutError.name = 'AbortError';
      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockRejectedValue(timeoutError);

      seedPolluxCompositeIntent(client);
      const polluxOnTimeout = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d4-cell-d-agent-session-non-interactive',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE,
        ),
      );

      expect(polluxOnTimeout).toEqual(baseline);
      expect(
        polluxOnTimeout.some(
          (event) => event.type === GeminiEventType.UserCancelled,
        ),
      ).toBe(false);
      expect(advisorSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps ACP output baseline-identical when Pollux is disabled (D5 Cell A)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: false,
      });

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-d5-cell-a-baseline',
        ),
      );

      const acpWithPolluxDisabled = await fromAsync(
        client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'pollux-d5-cell-a-acp',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.ACP,
        ),
      );

      expect(acpWithPolluxDisabled).toEqual(baseline);
      expect(mockPolicyCheck).not.toHaveBeenCalled();
    });

    it('runs advisor internally on allow and preserves ACP stream events (D5 Cell B)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d5-cell-b-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"Continue with executor"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      seedPolluxCompositeIntent(client);
      const polluxOn = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d5-cell-b-acp',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.ACP,
        ),
      );

      expect(polluxOn).toEqual(baseline);
      expect(mockPolicyCheck).toHaveBeenCalled();
      expect(mockPolicyCheck.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'advisor_consultation' }),
      );
      expect(advisorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Object),
        LlmRole.UTILITY_ADVISOR,
        expect.objectContaining({ maxAttemptsOverride: 1 }),
      );
    });

    it('fails open for ACP when advisor policy denies (D5 Cell C)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d5-cell-c-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: undefined,
      });

      const advisorSpy = vi.spyOn(client, 'generateContent');

      const polluxOnDenied = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d5-cell-c-acp',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.ACP,
        ),
      );

      expect(polluxOnDenied).toEqual(baseline);
      expect(advisorSpy).not.toHaveBeenCalled();
    });

    it('fails open on advisor timeout and keeps ACP executor stream stable (D5 Cell D)', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      const baseline = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d5-cell-d-baseline',
        ),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const timeoutError = new Error('advisor timeout');
      timeoutError.name = 'AbortError';
      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockRejectedValue(timeoutError);

      seedPolluxCompositeIntent(client);
      const polluxOnTimeout = await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-d5-cell-d-acp',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.ACP,
        ),
      );

      expect(polluxOnTimeout).toEqual(baseline);
      expect(
        polluxOnTimeout.some(
          (event) => event.type === GeminiEventType.UserCancelled,
        ),
      ).toBe(false);
      expect(advisorSpy).toHaveBeenCalledTimes(2);
    });

    it.each([
      {
        label: 'legacy interactive',
        surface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        prompt: 'pollux-p3-04-malformed-d1',
      },
      {
        label: 'legacy non-interactive',
        surface: PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        prompt: 'pollux-p3-04-malformed-d2',
      },
      {
        label: 'agent-session interactive',
        surface: PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE,
        prompt: 'pollux-p3-04-malformed-d3',
      },
      {
        label: 'agent-session non-interactive',
        surface: PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE,
        prompt: 'pollux-p3-04-malformed-d4',
      },
      {
        label: 'acp',
        surface: PolluxRuntimeSurface.ACP,
        prompt: 'pollux-p3-04-malformed-d5',
      },
    ])(
      'accepts short plaintext advisor fallback and keeps $label executor stream stable (P3-04)',
      async ({ surface, prompt }) => {
        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Hello' };
          })(),
        );

        const baseline = await fromAsync(
          client.sendMessageStream(
            [{ text: POLLUX_ESCALATION_INPUT }],
            new AbortController().signal,
            `${prompt}-baseline`,
          ),
        );

        vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
          enabled: true,
        });
        mockPolicyCheck.mockResolvedValue({
          decision: PolicyDecision.ALLOW,
          rule: undefined,
        });

        const advisorSpy = vi
          .spyOn(client, 'generateContent')
          .mockResolvedValue({
            candidates: [
              {
                content: {
                  parts: [{ text: '{malformed json' }],
                },
              },
            ],
          } as GenerateContentResponse);

        seedPolluxCompositeIntent(client);
        const polluxOnMalformed = await fromAsync(
          client.sendMessageStream(
            [{ text: POLLUX_ESCALATION_INPUT }],
            new AbortController().signal,
            prompt,
            undefined,
            false,
            undefined,
            false,
            surface,
          ),
        );

        expect(polluxOnMalformed).toEqual(baseline);
        expect(
          polluxOnMalformed.some(
            (event) => event.type === GeminiEventType.UserCancelled,
          ),
        ).toBe(false);
        expect(advisorSpy).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      {
        label: 'legacy interactive',
        surface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        prompt: 'pollux-p3-04-empty-d1',
      },
      {
        label: 'legacy non-interactive',
        surface: PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        prompt: 'pollux-p3-04-empty-d2',
      },
      {
        label: 'agent-session interactive',
        surface: PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE,
        prompt: 'pollux-p3-04-empty-d3',
      },
      {
        label: 'agent-session non-interactive',
        surface: PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE,
        prompt: 'pollux-p3-04-empty-d4',
      },
      {
        label: 'acp',
        surface: PolluxRuntimeSurface.ACP,
        prompt: 'pollux-p3-04-empty-d5',
      },
    ])(
      'fails open on empty advisor response and keeps $label executor stream stable (P3-04)',
      async ({ surface, prompt }) => {
        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Hello' };
          })(),
        );

        const baseline = await fromAsync(
          client.sendMessageStream(
            [{ text: POLLUX_ESCALATION_INPUT }],
            new AbortController().signal,
            `${prompt}-baseline`,
          ),
        );

        vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
          enabled: true,
        });
        mockPolicyCheck.mockResolvedValue({
          decision: PolicyDecision.ALLOW,
          rule: undefined,
        });

        const advisorSpy = vi
          .spyOn(client, 'generateContent')
          .mockResolvedValue({
            candidates: [],
          } as unknown as GenerateContentResponse);

        seedPolluxCompositeIntent(client);
        const polluxOnEmpty = await fromAsync(
          client.sendMessageStream(
            [{ text: POLLUX_ESCALATION_INPUT }],
            new AbortController().signal,
            prompt,
            undefined,
            false,
            undefined,
            false,
            surface,
          ),
        );

        expect(polluxOnEmpty).toEqual(baseline);
        expect(
          polluxOnEmpty.some(
            (event) => event.type === GeminiEventType.UserCancelled,
          ),
        ).toBe(false);
        expect(advisorSpy).toHaveBeenCalledTimes(2);
      },
    );

    it('records primary parse_error then repair_retry consulted attempt telemetry on recovery', async () => {
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        })(),
      );

      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      const advisorSpy = vi
        .spyOn(client, 'generateContent')
        .mockResolvedValueOnce({
          candidates: [{ content: { parts: [{ text: '{"oops":true}' }] } }],
        } as GenerateContentResponse)
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ text: '{"guidance":"recovered"}' }] } },
          ],
        } as GenerateContentResponse);
      const attemptSpy = vi
        .spyOn(telemetryLoggers, 'logPolluxAdvisorAttempt')
        .mockImplementation(() => {});

      seedPolluxCompositeIntent(client);
      await fromAsync(
        client.sendMessageStream(
          [{ text: POLLUX_ESCALATION_INPUT }],
          new AbortController().signal,
          'pollux-m2-repair-retry',
          undefined,
          false,
          undefined,
          false,
          PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        ),
      );

      expect(advisorSpy).toHaveBeenCalledTimes(2);
      expect(attemptSpy).toHaveBeenCalledTimes(2);
      expect(attemptSpy.mock.calls[0]?.[1]).toMatchObject({
        attempt_kind: 'primary',
        outcome: 'parse_error',
        parser_outcome: 'schema',
      });
      expect(attemptSpy.mock.calls[1]?.[1]).toMatchObject({
        attempt_kind: 'repair_retry',
        outcome: 'consulted',
        parser_outcome: 'direct',
      });
    });

    it.each([
      {
        label: 'legacy interactive',
        surface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        prompt: 'pollux-p3-04-policy-denied-d1',
      },
      {
        label: 'legacy non-interactive',
        surface: PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        prompt: 'pollux-p3-04-policy-denied-d2',
      },
      {
        label: 'agent-session interactive',
        surface: PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE,
        prompt: 'pollux-p3-04-policy-denied-d3',
      },
      {
        label: 'agent-session non-interactive',
        surface: PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE,
        prompt: 'pollux-p3-04-policy-denied-d4',
      },
      {
        label: 'acp',
        surface: PolluxRuntimeSurface.ACP,
        prompt: 'pollux-p3-04-policy-denied-d5',
      },
    ])(
      'fails open when advisor policy denies and keeps $label executor stream stable (P3-04)',
      async ({ surface, prompt }) => {
        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Hello' };
          })(),
        );

        const baseline = await fromAsync(
          client.sendMessageStream(
            [{ text: POLLUX_ESCALATION_INPUT }],
            new AbortController().signal,
            `${prompt}-baseline`,
          ),
        );

        vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
          enabled: true,
        });
        // Seeded next-turn intent stands in for observer fusion escalation;
        // policy then denies the advisor_consultation tool — the executor
        // path must continue unchanged with no UserCancelled event surfaced.
        mockPolicyCheck.mockResolvedValue({
          decision: PolicyDecision.DENY,
          rule: undefined,
        });
        const advisorSpy = vi.spyOn(client, 'generateContent');

        seedPolluxCompositeIntent(client);
        const polluxOnDenied = await fromAsync(
          client.sendMessageStream(
            [{ text: POLLUX_ESCALATION_INPUT }],
            new AbortController().signal,
            prompt,
            undefined,
            false,
            undefined,
            false,
            surface,
          ),
        );

        expect(polluxOnDenied).toEqual(baseline);
        expect(
          polluxOnDenied.some(
            (event) => event.type === GeminiEventType.UserCancelled,
          ),
        ).toBe(false);
        expect(mockPolicyCheck).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'advisor_consultation' }),
          undefined,
        );
        expect(advisorSpy).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        label: 'legacy interactive',
        surface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
        prompt: 'pollux-p3-07-detector-skip-d1',
      },
      {
        label: 'legacy non-interactive',
        surface: PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE,
        prompt: 'pollux-p3-07-detector-skip-d2',
      },
      {
        label: 'agent-session interactive',
        surface: PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE,
        prompt: 'pollux-p3-07-detector-skip-d3',
      },
      {
        label: 'agent-session non-interactive',
        surface: PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE,
        prompt: 'pollux-p3-07-detector-skip-d4',
      },
      {
        label: 'acp',
        surface: PolluxRuntimeSurface.ACP,
        prompt: 'pollux-p3-07-detector-skip-d5',
      },
    ])(
      'detector gate skips advisor for $label when input does not escalate (P3-07)',
      async ({ surface, prompt }) => {
        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Hello' };
          })(),
        );

        vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
          ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
          enabled: true,
        });
        mockPolicyCheck.mockResolvedValue({
          decision: PolicyDecision.ALLOW,
          rule: undefined,
        });
        const advisorSpy = vi.spyOn(client, 'generateContent');

        // Innocuous input does not produce a pending escalation intent from
        // the live observer on this path, so the advisor must not run.
        await fromAsync(
          client.sendMessageStream(
            [{ text: 'Hi' }],
            new AbortController().signal,
            prompt,
            undefined,
            false,
            undefined,
            false,
            surface,
          ),
        );

        expect(advisorSpy).not.toHaveBeenCalled();
        expect(mockPolicyCheck).not.toHaveBeenCalled();
      },
    );

    it('runPolluxAdvisorConsultation is a no-op for unknown runtime surfaces (P2-05 guard)', async () => {
      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent');

      // A2A is explicitly deferred (D6) and must remain a no-op bypass.
      await client.runPolluxAdvisorConsultation(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'pollux-a2a-deferred-noop',
        PolluxRuntimeSurface.A2A_DEFERRED,
      );

      expect(mockPolicyCheck).not.toHaveBeenCalled();
      expect(advisorSpy).not.toHaveBeenCalled();
    });

    it('runPolluxAdvisorConsultation invokes advisor for ACP surface (P2-05 public wrapper)', async () => {
      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '{"guidance":"ok"}' }],
            },
          },
        ],
      } as GenerateContentResponse);

      seedPolluxCompositeIntent(client);
      await client.runPolluxAdvisorConsultation(
        [{ text: POLLUX_ESCALATION_INPUT }],
        new AbortController().signal,
        'pollux-acp-public-wrapper',
        PolluxRuntimeSurface.ACP,
      );

      expect(mockPolicyCheck).toHaveBeenCalled();
      expect(mockPolicyCheck.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'advisor_consultation' }),
      );
      expect(advisorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Object),
        LlmRole.UTILITY_ADVISOR,
        expect.objectContaining({ maxAttemptsOverride: 1 }),
      );
    });

    it('uses fixed sham guidance without an advisor API request', async () => {
      vi.mocked(mockConfig.getPolluxExperimentalConfig).mockReturnValue({
        ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
        enabled: true,
        advisorShamEnabled: true,
        advisorShamGuidance:
          '1. Continue with the best supported plan. 2. Verify with the existing oracle.',
      });
      mockPolicyCheck.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });
      const advisorSpy = vi.spyOn(client, 'generateContent');
      const attemptTelemetrySpy = vi.spyOn(
        telemetryLoggers,
        'logPolluxAdvisorAttempt',
      );

      seedPolluxCompositeIntent(client);
      await client.runPolluxAdvisorConsultation(
        [{ text: POLLUX_ESCALATION_INPUT }],
        new AbortController().signal,
        'pollux-sham-advisor-control',
        PolluxRuntimeSurface.ACP,
      );

      expect(mockPolicyCheck).toHaveBeenCalled();
      expect(advisorSpy).not.toHaveBeenCalled();
      expect(attemptTelemetrySpy).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          model: 'sham:gemini-3.1-pro-preview',
          outcome: 'consulted',
          parser_outcome: 'direct',
        }),
      );
      const historyText = client
        .getHistory()
        .flatMap((entry) => entry.parts ?? [])
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n');
      expect(historyText).toContain('Verify with the existing oracle');
    });

    it('yields UserCancelled when processTurn throws AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      vi.spyOn(client['loopDetector'], 'turnStarted').mockRejectedValueOnce(
        abortError,
      );

      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-abort-error',
      );
      const events = await fromAsync(stream);

      expect(events).toEqual([{ type: GeminiEventType.UserCancelled }]);
    });

    it.each([
      {
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      },
      { compressionStatus: CompressionStatus.NOOP },
    ])(
      'does not emit a compression event when the status is $compressionStatus',
      async ({ compressionStatus }) => {
        // Arrange
        const mockStream = (async function* () {
          yield { type: 'content', value: 'Hello' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        const compressionInfo: ChatCompressionInfo = {
          compressionStatus,
          originalTokenCount: 1000,
          newTokenCount: 500,
        };

        vi.spyOn(client, 'tryCompressChat').mockResolvedValueOnce(
          compressionInfo,
        );

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-1',
        );

        const events = await fromAsync(stream);

        // Assert
        expect(events).not.toContainEqual({
          type: GeminiEventType.ChatCompressed,
          value: expect.anything(),
        });
      },
    );

    it('should include editor context when ideMode is enabled', async () => {
      // Arrange
      vi.mocked(ideContextStore.get).mockReturnValue({
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/active/file.ts',
              timestamp: Date.now(),
              isActive: true,
              selectedText: 'hello',
              cursor: { line: 5, character: 10 },
            },
            {
              path: '/path/to/recent/file1.ts',
              timestamp: Date.now(),
            },
            {
              path: '/path/to/recent/file2.ts',
              timestamp: Date.now(),
            },
          ],
        },
      });

      vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);

      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.COMPRESSED,
      });

      mockTurnRunFn.mockReturnValue(
        (async function* () {
          yield { type: 'content', value: 'Hello' };
        })(),
      );

      const mockChat = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      } as unknown as GeminiChat;
      client['chat'] = mockChat;

      const initialRequest: Part[] = [{ text: 'Hi' }];

      // Act
      const stream = client.sendMessageStream(
        initialRequest,
        new AbortController().signal,
        'prompt-id-ide',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(ideContextStore.get).toHaveBeenCalled();
      const expectedContext = `
Here is the user's editor context as a JSON object. This is for your information only.
\`\`\`json
${JSON.stringify(
  {
    activeFile: {
      path: '/path/to/active/file.ts',
      cursor: {
        line: 5,
        character: 10,
      },
      selectedText: 'hello',
    },
    otherOpenFiles: ['/path/to/recent/file1.ts', '/path/to/recent/file2.ts'],
  },
  null,
  2,
)}
\`\`\`
      `.trim();
      const expectedRequest = [{ text: expectedContext }];
      expect(mockChat.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: expectedRequest,
      });
    });

    it('should not add context if ideMode is enabled but no open files', async () => {
      // Arrange
      vi.mocked(ideContextStore.get).mockReturnValue({
        workspaceState: {
          openFiles: [],
        },
      });

      vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];

      // Act
      const stream = client.sendMessageStream(
        initialRequest,
        new AbortController().signal,
        'prompt-id-ide',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(ideContextStore.get).toHaveBeenCalled();
      expect(mockTurnRunFn).toHaveBeenCalledWith(
        { model: 'default-routed-model', isChatModel: true },
        initialRequest,
        expect.any(AbortSignal),
        undefined,
      );
    });

    it('should add context if ideMode is enabled and there is one active file', async () => {
      // Arrange
      vi.mocked(ideContextStore.get).mockReturnValue({
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/active/file.ts',
              timestamp: Date.now(),
              isActive: true,
              selectedText: 'hello',
              cursor: { line: 5, character: 10 },
            },
          ],
        },
      });

      vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);

      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.COMPRESSED,
      });

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];

      // Act
      const stream = client.sendMessageStream(
        initialRequest,
        new AbortController().signal,
        'prompt-id-ide',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(ideContextStore.get).toHaveBeenCalled();
      const expectedContext = `
Here is the user's editor context as a JSON object. This is for your information only.
\`\`\`json
${JSON.stringify(
  {
    activeFile: {
      path: '/path/to/active/file.ts',
      cursor: {
        line: 5,
        character: 10,
      },
      selectedText: 'hello',
    },
  },
  null,
  2,
)}
\`\`\`
      `.trim();
      const expectedRequest = [{ text: expectedContext }];
      expect(mockChat.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: expectedRequest,
      });
    });

    it('should add context if ideMode is enabled and there are open files but no active file', async () => {
      // Arrange
      vi.mocked(ideContextStore.get).mockReturnValue({
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/recent/file1.ts',
              timestamp: Date.now(),
            },
            {
              path: '/path/to/recent/file2.ts',
              timestamp: Date.now(),
            },
          ],
        },
      });

      vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);

      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.COMPRESSED,
      });

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];

      // Act
      const stream = client.sendMessageStream(
        initialRequest,
        new AbortController().signal,
        'prompt-id-ide',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(ideContextStore.get).toHaveBeenCalled();
      const expectedContext = `
Here is the user's editor context as a JSON object. This is for your information only.
\`\`\`json
${JSON.stringify(
  {
    otherOpenFiles: ['/path/to/recent/file1.ts', '/path/to/recent/file2.ts'],
  },
  null,
  2,
)}
\`\`\`
      `.trim();
      const expectedRequest = [{ text: expectedContext }];
      expect(mockChat.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: expectedRequest,
      });
    });

    it('should use local estimation for text-only requests and NOT call countTokens', async () => {
      const request = [{ text: 'Hello world' }];
      const generator = client['getContentGeneratorOrFail']();
      const countTokensSpy = vi.spyOn(generator, 'countTokens');

      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'test-prompt-id',
      );
      await stream.next(); // Trigger the generator

      expect(countTokensSpy).not.toHaveBeenCalled();
    });

    it('should use countTokens API for requests with non-text parts', async () => {
      const request = [
        { text: 'Describe this image' },
        { inlineData: { mimeType: 'image/png', data: 'base64...' } },
      ];
      const generator = client['getContentGeneratorOrFail']();
      const countTokensSpy = vi
        .spyOn(generator, 'countTokens')
        .mockResolvedValue({ totalTokens: 123 });

      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'test-prompt-id',
      );
      await stream.next(); // Trigger the generator

      expect(countTokensSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                { text: 'Describe this image' },
                { inlineData: { mimeType: 'image/png', data: 'base64...' } },
              ]),
            }),
          ]),
        }),
      );
    });

    it('should estimate CJK characters more conservatively (closer to 1 token/char)', async () => {
      const request = [{ text: '你好世界' }]; // 4 chars
      const generator = client['getContentGeneratorOrFail']();
      const countTokensSpy = vi.spyOn(generator, 'countTokens');

      // 4 chars.
      // Old logic: 4/4 = 1.
      // New logic (heuristic): 4 * 1 = 4. (Or at least > 1).
      // Let's assert it's roughly accurate.

      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'test-prompt-id',
      );
      await stream.next();

      // Should NOT call countTokens (it's text only)
      expect(countTokensSpy).not.toHaveBeenCalled();

      // The actual token calculation is unit tested in tokenCalculation.test.ts
    });

    it('should cleanly abort and return Turn on LoopDetected without unhandled promise rejections', async () => {
      // Arrange
      const mockStream = (async function* () {
        // Yield an event that will trigger the loop detector
        yield { type: 'content', value: 'Looping content' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      // Mock loop detector to return count > 1 on the first event (loop detected)
      vi.spyOn(client['loopDetector'], 'addAndCheck').mockReturnValue({
        count: 2,
      });

      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-1',
      );

      const events: ServerGeminiStreamEvent[] = [];
      let finalResult: Turn | undefined;

      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
        events.push(result.value);
      }

      // Assert
      expect(events).toContainEqual({ type: GeminiEventType.LoopDetected });
      expect(abortSpy).toHaveBeenCalled();
      expect(finalResult).toBeInstanceOf(Turn);
    });

    it('should return the turn instance after the stream is complete', async () => {
      // Arrange
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-1',
      );

      // Consume the stream manually to get the final return value.
      let finalResult: Turn | undefined;
      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
      }

      // Assert
      expect(finalResult).toBeInstanceOf(Turn);
    });

    it('should stop infinite loop after MAX_TURNS when nextSpeaker always returns model', async () => {
      vi.spyOn(client['config'], 'getContinueOnFailedApiCall').mockReturnValue(
        true,
      );
      // Get the mocked checkNextSpeaker function and configure it to trigger infinite loop
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);
      mockCheckNextSpeaker.mockResolvedValue({
        next_speaker: 'model',
        reasoning: 'Test case - always continue',
      });

      // Mock Turn to have no pending tool calls (which would allow nextSpeaker check)
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Continue...' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      // Use a signal that never gets aborted
      const abortController = new AbortController();
      const signal = abortController.signal;

      // Act - Start the stream that should loop
      const stream = client.sendMessageStream(
        [{ text: 'Start conversation' }],
        signal,
        'prompt-id-2',
      );

      // Count how many stream events we get
      let eventCount = 0;
      let finalResult: Turn | undefined;

      // Consume the stream and count iterations
      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
        eventCount++;

        // Safety check to prevent actual infinite loop in test
        if (eventCount > 200) {
          abortController.abort();
          throw new Error(
            'Test exceeded expected event limit - possible actual infinite loop',
          );
        }
      }

      // Assert
      expect(finalResult).toBeInstanceOf(Turn);

      // If infinite loop protection is working, checkNextSpeaker should be called many times
      // but stop at MAX_TURNS (100). Since each recursive call should trigger checkNextSpeaker,
      // we expect it to be called multiple times before hitting the limit
      expect(mockCheckNextSpeaker).toHaveBeenCalled();

      // The stream should produce events and eventually terminate
      expect(eventCount).toBeGreaterThanOrEqual(1);
      expect(eventCount).toBeLessThan(200); // Should not exceed our safety limit
    });

    it('should yield MaxSessionTurns and stop when session turn limit is reached', async () => {
      // Arrange
      const MAX_SESSION_TURNS = 5;
      vi.spyOn(client['config'], 'getMaxSessionTurns').mockReturnValue(
        MAX_SESSION_TURNS,
      );

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      // Act & Assert
      // Run up to the limit
      for (let i = 0; i < MAX_SESSION_TURNS; i++) {
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-4',
        );
        // consume stream
        for await (const _event of stream) {
          // do nothing
        }
      }

      // This call should exceed the limit
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-5',
      );

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([{ type: GeminiEventType.MaxSessionTurns }]);
      expect(mockTurnRunFn).toHaveBeenCalledTimes(MAX_SESSION_TURNS);
    });

    it('should respect MAX_TURNS limit even when turns parameter is set to a large value', async () => {
      // This test verifies that the infinite loop protection works even when
      // someone tries to bypass it by calling with a very large turns value

      // Get the mocked checkNextSpeaker function and configure it to trigger infinite loop
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);
      mockCheckNextSpeaker.mockResolvedValue({
        next_speaker: 'model',
        reasoning: 'Test case - always continue',
      });

      // Mock Turn to have no pending tool calls (which would allow nextSpeaker check)
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Continue...' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      // Use a signal that never gets aborted
      const abortController = new AbortController();
      const signal = abortController.signal;

      // Act - Start the stream with an extremely high turns value
      // This simulates a case where the turns protection is bypassed
      const stream = client.sendMessageStream(
        [{ text: 'Start conversation' }],
        signal,
        'prompt-id-3',
        Number.MAX_SAFE_INTEGER, // Bypass the MAX_TURNS protection
      );

      // Count how many stream events we get
      let eventCount = 0;
      const maxTestIterations = 1000; // Higher limit to show the loop continues

      // Consume the stream and count iterations
      try {
        while (true) {
          const result = await stream.next();
          if (result.done) {
            break;
          }
          eventCount++;

          // This test should hit this limit, demonstrating the infinite loop
          if (eventCount > maxTestIterations) {
            abortController.abort();
            // This is the expected behavior - we hit the infinite loop
            break;
          }
        }
      } catch {
        // If the test framework times out, that also demonstrates the infinite loop
      }

      // Assert that the fix works - the loop should stop at MAX_TURNS
      const callCount = mockCheckNextSpeaker.mock.calls.length;

      // With the fix: even when turns is set to a very high value,
      // the loop should stop at MAX_TURNS (100)
      expect(callCount).toBeLessThanOrEqual(100); // Should not exceed MAX_TURNS
      expect(eventCount).toBeLessThanOrEqual(200); // Should have reasonable number of events
    });

    it('should yield ContextWindowWillOverflow when the context window is about to overflow', async () => {
      // Arrange
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);

      // Set last prompt token count
      const lastPromptTokenCount = 900;
      const mockChat: Partial<GeminiChat> = {
        getLastPromptTokenCount: vi.fn().mockReturnValue(lastPromptTokenCount),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      // Remaining = 100.
      // We need a request > 100 tokens.
      // A string of length 404 is roughly 101 tokens.
      const longText = 'a'.repeat(404);
      const request: Part[] = [{ text: longText }];
      // estimateTextOnlyLength counts only text content (400 chars), not JSON structure
      const estimatedRequestTokenCount = Math.floor(longText.length / 4);
      const remainingTokenCount = MOCKED_TOKEN_LIMIT - lastPromptTokenCount;

      // Mock tryCompressChat to not compress
      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: lastPromptTokenCount,
        newTokenCount: lastPromptTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      });

      // Act
      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'prompt-id-overflow',
      );

      const events = await fromAsync(stream);

      // Assert
      expect(events).toContainEqual({
        type: GeminiEventType.ContextWindowWillOverflow,
        value: {
          estimatedRequestTokenCount,
          remainingTokenCount,
        },
      });
      // Ensure turn.run is not called
      expect(mockTurnRunFn).not.toHaveBeenCalled();
    });

    it("should use the sticky model's token limit for the overflow check", async () => {
      // Arrange
      const STICKY_MODEL = 'gemini-1.5-flash';
      const STICKY_MODEL_LIMIT = 1000;
      const CONFIG_MODEL_LIMIT = 2000;

      // Set up token limits
      vi.mocked(tokenLimit).mockImplementation((model) => {
        if (model === STICKY_MODEL) return STICKY_MODEL_LIMIT;
        return CONFIG_MODEL_LIMIT;
      });

      // Set the sticky model
      client['currentSequenceModel'] = STICKY_MODEL;

      // Set token count
      const lastPromptTokenCount = 900;
      const mockChat: Partial<GeminiChat> = {
        getLastPromptTokenCount: vi.fn().mockReturnValue(lastPromptTokenCount),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      // Remaining (sticky) = 100.
      // We need a request > 100 tokens.
      const longText = 'a'.repeat(404);
      const request: Part[] = [{ text: longText }];
      // estimateTextOnlyLength counts only text content (400 chars), not JSON structure
      const estimatedRequestTokenCount = Math.floor(longText.length / 4);
      const remainingTokenCount = STICKY_MODEL_LIMIT - lastPromptTokenCount;

      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: lastPromptTokenCount,
        newTokenCount: lastPromptTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      });

      // Act
      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'test-session-id', // Use the same ID as the session to keep stickiness
      );

      const events = await fromAsync(stream);

      // Assert
      // Should overflow based on the sticky model's limit
      expect(events).toContainEqual({
        type: GeminiEventType.ContextWindowWillOverflow,
        value: {
          estimatedRequestTokenCount,
          remainingTokenCount,
        },
      });
      expect(tokenLimit).toHaveBeenCalledWith(STICKY_MODEL);
      expect(mockTurnRunFn).not.toHaveBeenCalled();
    });

    it('should attempt compression before overflow check and proceed if compression frees space', async () => {
      // Arrange
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);

      // Initial state: 950 tokens used, 50 remaining.
      const initialTokenCount = 950;
      // Request: 60 tokens. (950 + 60 = 1010 > 1000) -> Would overflow without compression.
      const longText = 'a'.repeat(240); // 240 / 4 = 60 tokens
      const request: Part[] = [{ text: longText }];

      // Use the real GeminiChat to manage state and token counts more realistically
      const mockChatCompressed = {
        getLastPromptTokenCount: vi.fn().mockReturnValue(400),
        getHistory: vi
          .fn()
          .mockReturnValue([{ role: 'user', parts: [{ text: 'old' }] }]),
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getChatRecordingService: vi.fn().mockReturnValue({
          getConversation: vi.fn(),
          getConversationFilePath: vi.fn(),
        }),
      } as unknown as GeminiChat;

      const mockChatInitial = {
        getLastPromptTokenCount: vi.fn().mockReturnValue(initialTokenCount),
        getHistory: vi
          .fn()
          .mockReturnValue([{ role: 'user', parts: [{ text: 'old' }] }]),
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getChatRecordingService: vi.fn().mockReturnValue({
          getConversation: vi.fn(),
          getConversationFilePath: vi.fn(),
        }),
      } as unknown as GeminiChat;

      client['chat'] = mockChatInitial;

      // Mock tryCompressChat to simulate successful compression
      const tryCompressSpy = vi
        .spyOn(client, 'tryCompressChat')
        .mockImplementation(async () => {
          // In reality, tryCompressChat replaces this.chat
          client['chat'] = mockChatCompressed;
          return {
            originalTokenCount: initialTokenCount,
            newTokenCount: 400,
            compressionStatus: CompressionStatus.COMPRESSED,
          };
        });

      // Use a manual spy on Turn.prototype.run since Turn is a real class in this test context
      // but mocked at the top of the file
      mockTurnRunFn.mockImplementation(async function* () {
        yield { type: 'content', value: 'Success after compression' };
      });

      // Act
      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'prompt-id-compression-test',
      );

      const events = await fromAsync(stream);

      // Assert
      // 1. Should NOT contain overflow warning
      expect(events).not.toContainEqual(
        expect.objectContaining({
          type: GeminiEventType.ContextWindowWillOverflow,
        }),
      );

      // 2. Should contain compression event
      expect(events).toContainEqual(
        expect.objectContaining({
          type: GeminiEventType.ChatCompressed,
        }),
      );

      // 3. Should have called tryCompressChat
      expect(tryCompressSpy).toHaveBeenCalled();

      // 4. Should have called Turn.run (proceeded with the request)
      expect(mockTurnRunFn).toHaveBeenCalled();
    });

    it('should handle massive function responses by truncating them and then yielding overflow warning', async () => {
      // Arrange
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);

      // History has a large compressible part and a massive function response at the end.
      const massiveText = 'a'.repeat(200000);
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'a'.repeat(100000) }] }, // compressible part
        { role: 'model', parts: [{ text: 'ok' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'huge_tool', args: {} } }],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'huge_tool',
                response: { data: massiveText },
              },
            },
          ],
        },
      ];

      const realChat = new GeminiChat(mockConfig, '', [], history);
      client['chat'] = realChat;

      // Use a realistic mock for compression that simulates the 40k truncation effect.
      // We spy on the instance directly to ensure it intercepts correctly.
      const compressSpy = vi
        .spyOn(client['compressionService'], 'compress')
        .mockResolvedValue({
          newHistory: history, // Keep history large for the overflow check
          info: {
            originalTokenCount: 50000,
            newTokenCount: 10000, // Reduced from 50k but still > 1000 limit
            compressionStatus: CompressionStatus.COMPRESSED,
          },
        });

      // The new request
      const request: Part[] = [{ text: 'next question' }];

      // Act
      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'prompt-id-massive-test',
      );

      const events = await fromAsync(stream);

      // Assert
      // 1. Should have attempted compression
      expect(compressSpy).toHaveBeenCalled();

      // 2. Should yield overflow warning because 10000 > 1000 limit.
      expect(events).toContainEqual(
        expect.objectContaining({
          type: GeminiEventType.ContextWindowWillOverflow,
          value: expect.objectContaining({
            estimatedRequestTokenCount: expect.any(Number),
            remainingTokenCount: expect.any(Number),
          }),
        }),
      );
    });

    it('should not trigger overflow warning for requests with large binary data (PDFs/images)', async () => {
      // Arrange
      const MOCKED_TOKEN_LIMIT = 1000000; // 1M tokens
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);

      const lastPromptTokenCount = 10000;
      const mockChat: Partial<GeminiChat> = {
        getLastPromptTokenCount: vi.fn().mockReturnValue(lastPromptTokenCount),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      // Simulate a PDF file with large base64 data (11MB when encoded)
      // In the old implementation, this would incorrectly estimate ~2.7M tokens
      // In the new implementation, only the text part is counted
      const largePdfBase64 = 'A'.repeat(11 * 1024 * 1024);
      const request: Part[] = [
        { text: 'Please analyze this PDF document' }, // ~35 chars = ~8 tokens
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: largePdfBase64, // This should be ignored in token estimation
          },
        },
      ];

      // Mock tryCompressChat to not compress
      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: lastPromptTokenCount,
        newTokenCount: lastPromptTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      });

      // Mock Turn.run to simulate successful processing
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Analysis complete' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      // Act
      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'prompt-id-pdf-test',
      );

      const events = await fromAsync(stream);

      // Assert
      // Should NOT contain overflow warning
      expect(events).not.toContainEqual(
        expect.objectContaining({
          type: GeminiEventType.ContextWindowWillOverflow,
        }),
      );

      // Turn.run should be called (processing should continue)
      expect(mockTurnRunFn).toHaveBeenCalled();
    });

    describe('Model Routing', () => {
      let mockRouterService: { route: Mock };

      beforeEach(() => {
        mockRouterService = {
          route: vi
            .fn()
            .mockResolvedValue({ model: 'routed-model', reason: 'test' }),
        };
        vi.mocked(mockConfig.getModelRouterService).mockReturnValue(
          mockRouterService as unknown as ModelRouterService,
        );

        mockTurnRunFn.mockReturnValue(
          (async function* () {
            yield { type: 'content', value: 'Hello' };
          })(),
        );

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          setTools: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;
      });

      it('should use the model router service to select a model on the first turn', async () => {
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream); // consume stream

        expect(mockConfig.getModelRouterService).toHaveBeenCalled();
        expect(mockRouterService.route).toHaveBeenCalled();
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'routed-model', isChatModel: true },
          [{ text: 'Hi' }],
          expect.any(AbortSignal),
          undefined,
        );
      });

      it('should use the same model for subsequent turns in the same prompt (stickiness)', async () => {
        // First turn
        let stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream);

        expect(mockRouterService.route).toHaveBeenCalledTimes(1);
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'routed-model', isChatModel: true },
          [{ text: 'Hi' }],
          expect.any(AbortSignal),
          undefined,
        );

        // Second turn
        stream = client.sendMessageStream(
          [{ text: 'Continue' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream);

        // Router should not be called again
        expect(mockRouterService.route).toHaveBeenCalledTimes(1);
        // Should stick to the first model
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'routed-model', isChatModel: true },
          [{ text: 'Continue' }],
          expect.any(AbortSignal),
          undefined,
        );
      });

      it('should reset the sticky model and re-route when the prompt_id changes', async () => {
        // First prompt
        let stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream);

        expect(mockRouterService.route).toHaveBeenCalledTimes(1);
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'routed-model', isChatModel: true },
          [{ text: 'Hi' }],
          expect.any(AbortSignal),
          undefined,
        );

        // New prompt
        mockRouterService.route.mockResolvedValue({
          model: 'new-routed-model',
          reason: 'test',
        });
        stream = client.sendMessageStream(
          [{ text: 'A new topic' }],
          new AbortController().signal,
          'prompt-2',
        );
        await fromAsync(stream);

        // Router should be called again for the new prompt
        expect(mockRouterService.route).toHaveBeenCalledTimes(2);
        // Should use the newly routed model
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'new-routed-model', isChatModel: true },
          [{ text: 'A new topic' }],
          expect.any(AbortSignal),
          undefined,
        );
      });

      it('should re-route within the same prompt when the configured model changes', async () => {
        mockTurnRunFn.mockClear();
        mockTurnRunFn.mockImplementation(async function* () {
          yield { type: 'content', value: 'Hello' };
        });

        mockRouterService.route.mockResolvedValueOnce({
          model: 'original-model',
          reason: 'test',
        });

        let stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream);

        expect(mockRouterService.route).toHaveBeenCalledTimes(1);
        expect(mockTurnRunFn).toHaveBeenNthCalledWith(
          1,
          { model: 'original-model', isChatModel: true },
          [{ text: 'Hi' }],
          expect.any(AbortSignal),
          undefined,
        );

        mockRouterService.route.mockResolvedValue({
          model: 'fallback-model',
          reason: 'test',
        });
        vi.mocked(mockConfig.getModel).mockReturnValue('gemini-2.5-flash');
        coreEvents.emitModelChanged('gemini-2.5-flash');

        stream = client.sendMessageStream(
          [{ text: 'Continue' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream);

        expect(mockRouterService.route).toHaveBeenCalledTimes(2);
        expect(mockTurnRunFn).toHaveBeenNthCalledWith(
          2,
          { model: 'fallback-model', isChatModel: true },
          [{ text: 'Continue' }],
          expect.any(AbortSignal),
          undefined,
        );
      });
    });

    it('should use getSystemInstructionMemory for system instruction when JIT is enabled', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(true);
      vi.mocked(mockConfig.getSystemInstructionMemory).mockReturnValue(
        'Global JIT Memory',
      );

      const { getCoreSystemPrompt } = await import('./prompts.js');
      const mockGetCoreSystemPrompt = vi.mocked(getCoreSystemPrompt);

      client.updateSystemInstruction();

      expect(mockGetCoreSystemPrompt).toHaveBeenCalledWith(
        mockConfig,
        'Global JIT Memory',
      );
    });

    it('should use getSystemInstructionMemory for system instruction when JIT is disabled', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(false);
      vi.mocked(mockConfig.getSystemInstructionMemory).mockReturnValue(
        'Legacy Memory',
      );

      const { getCoreSystemPrompt } = await import('./prompts.js');
      const mockGetCoreSystemPrompt = vi.mocked(getCoreSystemPrompt);

      client.updateSystemInstruction();

      expect(mockGetCoreSystemPrompt).toHaveBeenCalledWith(
        mockConfig,
        'Legacy Memory',
      );
    });

    it('should update system instruction when MemoryChanged event is emitted', async () => {
      vi.mocked(mockConfig.getSystemInstructionMemory).mockReturnValue(
        'Updated Memory',
      );

      const { getCoreSystemPrompt } = await import('./prompts.js');
      const mockGetCoreSystemPrompt = vi.mocked(getCoreSystemPrompt);
      mockGetCoreSystemPrompt.mockClear();

      coreEvents.emit(CoreEvent.MemoryChanged, { fileCount: 2 });

      expect(mockGetCoreSystemPrompt).toHaveBeenCalledWith(
        mockConfig,
        'Updated Memory',
      );
    });

    it('should recursively call sendMessageStream with "Please continue." when InvalidStream event is received for Gemini 2 models', async () => {
      vi.spyOn(client['config'], 'getContinueOnFailedApiCall').mockReturnValue(
        true,
      );
      // Arrange - router must return a Gemini 2 model for retry to trigger
      mockRouterService.route.mockResolvedValue({
        model: 'gemini-2.0-flash',
        reason: 'test',
      });

      const mockStream1 = (async function* () {
        yield { type: GeminiEventType.InvalidStream };
      })();
      const mockStream2 = (async function* () {
        yield { type: GeminiEventType.Content, value: 'Continued content' };
      })();

      mockTurnRunFn
        .mockReturnValueOnce(mockStream1)
        .mockReturnValueOnce(mockStream2);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];
      const promptId = 'prompt-id-invalid-stream';
      const signal = new AbortController().signal;

      // Act
      const stream = client.sendMessageStream(initialRequest, signal, promptId);
      const events = await fromAsync(stream);

      // Assert
      expect(events).toEqual([
        { type: GeminiEventType.ModelInfo, value: 'gemini-2.0-flash' },
        { type: GeminiEventType.InvalidStream },
        { type: GeminiEventType.Content, value: 'Continued content' },
      ]);

      // Verify that turn.run was called twice
      expect(mockTurnRunFn).toHaveBeenCalledTimes(2);

      // First call with original request
      expect(mockTurnRunFn).toHaveBeenNthCalledWith(
        1,
        { model: 'gemini-2.0-flash', isChatModel: true },
        initialRequest,
        expect.any(AbortSignal),
        undefined,
      );

      // Second call with "Please continue."
      expect(mockTurnRunFn).toHaveBeenNthCalledWith(
        2,
        { model: 'gemini-2.0-flash', isChatModel: true },
        [{ text: 'System: Please continue.' }],
        expect.any(AbortSignal),
        undefined,
      );
    });

    it('should not recursively call sendMessageStream with "Please continue." when InvalidStream event is received and flag is false', async () => {
      vi.spyOn(client['config'], 'getContinueOnFailedApiCall').mockReturnValue(
        false,
      );
      // Arrange
      const mockStream1 = (async function* () {
        yield { type: GeminiEventType.InvalidStream };
      })();

      mockTurnRunFn.mockReturnValueOnce(mockStream1);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];
      const promptId = 'prompt-id-invalid-stream';
      const signal = new AbortController().signal;

      // Act
      const stream = client.sendMessageStream(initialRequest, signal, promptId);
      const events = await fromAsync(stream);

      // Assert
      expect(events).toEqual([
        { type: GeminiEventType.ModelInfo, value: 'default-routed-model' },
        { type: GeminiEventType.InvalidStream },
      ]);

      // Verify that turn.run was called only once
      expect(mockTurnRunFn).toHaveBeenCalledTimes(1);
    });

    it('should stop recursing after one retry when InvalidStream events are repeatedly received', async () => {
      vi.spyOn(client['config'], 'getContinueOnFailedApiCall').mockReturnValue(
        true,
      );
      // Arrange - router must return a Gemini 2 model for retry to trigger
      mockRouterService.route.mockResolvedValue({
        model: 'gemini-2.0-flash',
        reason: 'test',
      });
      // Always return a new invalid stream
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.InvalidStream };
        })(),
      );

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];
      const promptId = 'prompt-id-infinite-invalid-stream';
      const signal = new AbortController().signal;

      // Act
      const stream = client.sendMessageStream(initialRequest, signal, promptId);
      const events = await fromAsync(stream);

      // Assert
      // We expect 3 events (model_info + original + 1 retry)
      expect(events.length).toBe(3);
      expect(
        events
          .filter((e) => e.type === GeminiEventType.ModelInfo)
          .map((e) => e.value),
      ).toEqual(['gemini-2.0-flash']);

      // Verify that turn.run was called twice
      expect(mockTurnRunFn).toHaveBeenCalledTimes(2);
    });

    describe('Editor context delta', () => {
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();

      beforeEach(() => {
        client['forceFullIdeContext'] = false; // Reset before each delta test
        vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.COMPRESSED,
        });
        vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);
        mockTurnRunFn.mockReturnValue(mockStream);

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          setHistory: vi.fn(),
          setTools: vi.fn(),
          // Assume history is not empty for delta checks
          getHistory: vi
            .fn()
            .mockReturnValue([
              { role: 'user', parts: [{ text: 'previous message' }] },
            ]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;
      });

      const testCases = [
        {
          description: 'sends delta when active file changes',
          previousActiveFile: {
            path: '/path/to/old/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when cursor line changes',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 1, character: 10 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when cursor character changes',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 1 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when selected text changes',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'world',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when selected text is added',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when selected text is removed',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
          },
          shouldSendContext: true,
        },
        {
          description: 'does not send context when nothing changes',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: false,
        },
      ];

      it.each(testCases)(
        '$description',
        async ({
          previousActiveFile,
          currentActiveFile,
          shouldSendContext,
        }) => {
          // Setup previous context
          client['lastSentIdeContext'] = {
            workspaceState: {
              openFiles: [
                {
                  path: previousActiveFile.path,
                  cursor: previousActiveFile.cursor,
                  selectedText: previousActiveFile.selectedText,
                  isActive: true,
                  timestamp: Date.now() - 1000,
                },
              ],
            },
          };

          // Setup current context
          vi.mocked(ideContextStore.get).mockReturnValue({
            workspaceState: {
              openFiles: [
                {
                  ...currentActiveFile,
                  isActive: true,
                  timestamp: Date.now(),
                },
              ],
            },
          });

          const stream = client.sendMessageStream(
            [{ text: 'Hi' }],
            new AbortController().signal,
            'prompt-id-delta',
          );
          for await (const _ of stream) {
            // consume stream
          }

          const mockChat = client['chat'] as unknown as {
            addHistory: (typeof vi)['fn'];
          };

          if (shouldSendContext) {
            expect(mockChat.addHistory).toHaveBeenCalledWith(
              expect.objectContaining({
                parts: expect.arrayContaining([
                  expect.objectContaining({
                    text: expect.stringContaining(
                      "Here is a summary of changes in the user's editor context",
                    ),
                  }),
                ]),
              }),
            );
          } else {
            expect(mockChat.addHistory).not.toHaveBeenCalled();
          }
        },
      );

      it('sends full context when history is cleared, even if editor state is unchanged', async () => {
        const activeFile = {
          path: '/path/to/active/file.ts',
          cursor: { line: 5, character: 10 },
          selectedText: 'hello',
        };

        // Setup previous context
        client['lastSentIdeContext'] = {
          workspaceState: {
            openFiles: [
              {
                path: activeFile.path,
                cursor: activeFile.cursor,
                selectedText: activeFile.selectedText,
                isActive: true,
                timestamp: Date.now() - 1000,
              },
            ],
          },
        };

        // Setup current context (same as previous)
        vi.mocked(ideContextStore.get).mockReturnValue({
          workspaceState: {
            openFiles: [
              { ...activeFile, isActive: true, timestamp: Date.now() },
            ],
          },
        });

        // Make history empty
        const mockChat = client['chat'] as unknown as {
          getHistory: ReturnType<(typeof vi)['fn']>;
          addHistory: ReturnType<(typeof vi)['fn']>;
        };
        mockChat.getHistory.mockReturnValue([]);

        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-history-cleared',
        );
        for await (const _ of stream) {
          // consume stream
        }

        expect(mockChat.addHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining(
                  "Here is the user's editor context",
                ),
              }),
            ]),
          }),
        );

        // Also verify it's the full context, not a delta.
        const call = mockChat.addHistory.mock.calls[0][0];
        const contextText = call.parts[0].text;
        const contextJson = JSON.parse(
          contextText.match(/```json\n(.*)\n```/s)![1],
        );
        expect(contextJson).toHaveProperty('activeFile');
        expect(contextJson.activeFile.path).toBe('/path/to/active/file.ts');
      });
    });

    describe('Availability Service Integration', () => {
      let mockAvailabilityService: ModelAvailabilityService;

      beforeEach(() => {
        mockAvailabilityService = createAvailabilityServiceMock();

        vi.mocked(mockConfig.getModelAvailabilityService).mockReturnValue(
          mockAvailabilityService,
        );
        vi.mocked(mockConfig.setActiveModel).mockClear();
        mockRouterService.route.mockResolvedValue({
          model: 'model-a',
          reason: 'test',
        });
        vi.mocked(mockConfig.getModelRouterService).mockReturnValue(
          mockRouterService as unknown as ModelRouterService,
        );
        vi.spyOn(policyCatalog, 'getModelPolicyChain').mockReturnValue([
          {
            model: 'model-a',
            isLastResort: false,
            actions: {},
            stateTransitions: {},
          },
          {
            model: 'model-b',
            isLastResort: true,
            actions: {},
            stateTransitions: {},
          },
        ]);

        mockTurnRunFn.mockReturnValue(
          (async function* () {
            yield { type: 'content', value: 'Hello' };
          })(),
        );
      });

      it('should select first available model, set active, and not consume sticky attempt (done lower in chain)', async () => {
        vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue(
          {
            selectedModel: 'model-a',
            attempts: 1,
            skipped: [],
          },
        );
        vi.mocked(mockConfig.getModel).mockReturnValue(
          DEFAULT_GEMINI_MODEL_AUTO,
        );
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-avail',
        );
        await fromAsync(stream);

        expect(
          mockAvailabilityService.selectFirstAvailable,
        ).toHaveBeenCalledWith(['model-a', 'model-b']);
        expect(mockConfig.setActiveModel).toHaveBeenCalledWith('model-a');
        expect(
          mockAvailabilityService.consumeStickyAttempt,
        ).not.toHaveBeenCalled();
        // Ensure turn.run used the selected model
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          expect.objectContaining({ model: 'model-a' }),
          expect.anything(),
          expect.anything(),
          undefined,
        );
      });

      it('should default to last resort model if selection returns null', async () => {
        vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue(
          {
            selectedModel: null,
            skipped: [],
          },
        );
        vi.mocked(mockConfig.getModel).mockReturnValue(
          DEFAULT_GEMINI_MODEL_AUTO,
        );
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-avail-fallback',
        );
        await fromAsync(stream);

        expect(mockConfig.setActiveModel).toHaveBeenCalledWith('model-b'); // Last resort
        expect(
          mockAvailabilityService.consumeStickyAttempt,
        ).not.toHaveBeenCalled();
      });

      it('should reset turn on new message stream', async () => {
        vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue(
          {
            selectedModel: 'model-a',
            skipped: [],
          },
        );
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-reset',
        );
        await fromAsync(stream);

        expect(mockConfig.resetTurn).toHaveBeenCalled();
      });

      it('should NOT reset turn on invalid stream retry', async () => {
        vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue(
          {
            selectedModel: 'model-a',
            skipped: [],
          },
        );
        // We simulate a retry by calling sendMessageStream with isInvalidStreamRetry=true
        // But the public API doesn't expose that argument directly unless we use the private method or simulate the recursion.
        // We can simulate recursion by mocking turn run to return invalid stream once.

        vi.spyOn(
          client['config'],
          'getContinueOnFailedApiCall',
        ).mockReturnValue(true);
        const mockStream1 = (async function* () {
          yield { type: GeminiEventType.InvalidStream };
        })();
        const mockStream2 = (async function* () {
          yield { type: 'content', value: 'ok' };
        })();
        mockTurnRunFn
          .mockReturnValueOnce(mockStream1)
          .mockReturnValueOnce(mockStream2);

        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-retry',
        );
        await fromAsync(stream);

        // resetTurn should be called once (for the initial call) but NOT for the recursive call
        expect(mockConfig.resetTurn).toHaveBeenCalledTimes(1);
      });
    });

    describe('IDE context with pending tool calls', () => {
      let mockChat: Partial<GeminiChat>;

      beforeEach(() => {
        vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.COMPRESSED,
        });

        const mockStream = (async function* () {
          yield { type: 'content', value: 'response' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        mockChat = {
          addHistory: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]), // Default empty history
          setHistory: vi.fn(),
          setTools: vi.fn(),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;

        vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);
        vi.mocked(ideContextStore.get).mockReturnValue({
          workspaceState: {
            openFiles: [{ path: '/path/to/file.ts', timestamp: Date.now() }],
          },
        });
      });

      it('should NOT add IDE context when a tool call is pending', async () => {
        // Arrange: History ends with a functionCall from the model
        const historyWithPendingCall: Content[] = [
          { role: 'user', parts: [{ text: 'Please use a tool.' }] },
          {
            role: 'model',
            parts: [{ functionCall: { name: 'some_tool', args: {} } }],
          },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(historyWithPendingCall);

        // Act: Simulate sending the tool's response back
        const stream = client.sendMessageStream(
          [
            {
              functionResponse: {
                name: 'some_tool',
                response: { success: true },
              },
            },
          ],
          new AbortController().signal,
          'prompt-id-tool-response',
        );
        for await (const _ of stream) {
          // consume stream to complete the call
        }

        // Assert: The IDE context message should NOT have been added to the history.
        expect(mockChat.addHistory).not.toHaveBeenCalledWith(
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining("user's editor context"),
              }),
            ]),
          }),
        );
      });

      it('should add IDE context when no tool call is pending', async () => {
        // Arrange: History is normal, no pending calls
        const normalHistory: Content[] = [
          { role: 'user', parts: [{ text: 'A normal message.' }] },
          { role: 'model', parts: [{ text: 'A normal response.' }] },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(normalHistory);

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Another normal message' }],
          new AbortController().signal,
          'prompt-id-normal',
        );
        for await (const _ of stream) {
          // consume stream
        }

        // Assert: The IDE context message SHOULD have been added.
        expect(mockChat.addHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            role: 'user',
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining("user's editor context"),
              }),
            ]),
          }),
        );
      });

      it('should send the latest IDE context on the next message after a skipped context', async () => {
        // --- Step 1: A tool call is pending, context should be skipped ---

        // Arrange: History ends with a functionCall
        const historyWithPendingCall: Content[] = [
          { role: 'user', parts: [{ text: 'Please use a tool.' }] },
          {
            role: 'model',
            parts: [{ functionCall: { name: 'some_tool', args: {} } }],
          },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(historyWithPendingCall);

        // Arrange: Set the initial IDE context
        const initialIdeContext = {
          workspaceState: {
            openFiles: [{ path: '/path/to/fileA.ts', timestamp: Date.now() }],
          },
        };
        vi.mocked(ideContextStore.get).mockReturnValue(initialIdeContext);

        // Act: Send the tool response
        let stream = client.sendMessageStream(
          [
            {
              functionResponse: {
                name: 'some_tool',
                response: { success: true },
              },
            },
          ],
          new AbortController().signal,
          'prompt-id-tool-response',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: The initial context was NOT sent
        expect(mockChat.addHistory).not.toHaveBeenCalledWith(
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining("user's editor context"),
              }),
            ]),
          }),
        );

        // --- Step 2: A new message is sent, latest context should be included ---

        // Arrange: The model has responded to the tool, and the user is sending a new message.
        const historyAfterToolResponse: Content[] = [
          ...historyWithPendingCall,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'some_tool',
                  response: { success: true },
                },
              },
            ],
          },
          { role: 'model', parts: [{ text: 'The tool ran successfully.' }] },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(
          historyAfterToolResponse,
        );
        vi.mocked(mockChat.addHistory!).mockClear(); // Clear previous calls for the next assertion

        // Arrange: The IDE context has now changed
        const newIdeContext = {
          workspaceState: {
            openFiles: [{ path: '/path/to/fileB.ts', timestamp: Date.now() }],
          },
        };
        vi.mocked(ideContextStore.get).mockReturnValue(newIdeContext);

        // Act: Send a new, regular user message
        stream = client.sendMessageStream(
          [{ text: 'Thanks!' }],
          new AbortController().signal,
          'prompt-id-final',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: The NEW context was sent as a FULL context because there was no previously sent context.
        const addHistoryCalls = vi.mocked(mockChat.addHistory!).mock.calls;
        const contextCall = addHistoryCalls.find((call) =>
          JSON.stringify(call[0]).includes("user's editor context"),
        );
        expect(contextCall).toBeDefined();
        expect(JSON.stringify(contextCall![0])).toContain(
          "Here is the user's editor context as a JSON object",
        );
        // Check that the sent context is the new one (fileB.ts)
        expect(JSON.stringify(contextCall![0])).toContain('fileB.ts');
        // Check that the sent context is NOT the old one (fileA.ts)
        expect(JSON.stringify(contextCall![0])).not.toContain('fileA.ts');
      });

      it('should send a context DELTA on the next message after a skipped context', async () => {
        // --- Step 0: Establish an initial context ---
        vi.mocked(mockChat.getHistory!).mockReturnValue([]); // Start with empty history
        const contextA = {
          workspaceState: {
            openFiles: [
              {
                path: '/path/to/fileA.ts',
                isActive: true,
                timestamp: Date.now(),
              },
            ],
          },
        };
        vi.mocked(ideContextStore.get).mockReturnValue(contextA);

        // Act: Send a regular message to establish the initial context
        let stream = client.sendMessageStream(
          [{ text: 'Initial message' }],
          new AbortController().signal,
          'prompt-id-initial',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: Full context for fileA.ts was sent and stored.
        const initialCall = vi.mocked(mockChat.addHistory!).mock.calls[0][0];
        expect(JSON.stringify(initialCall)).toContain(
          "user's editor context as a JSON object",
        );
        expect(JSON.stringify(initialCall)).toContain('fileA.ts');
        // This implicitly tests that `lastSentIdeContext` is now set internally by the client.
        vi.mocked(mockChat.addHistory!).mockClear();

        // --- Step 1: A tool call is pending, context should be skipped ---
        const historyWithPendingCall: Content[] = [
          { role: 'user', parts: [{ text: 'Please use a tool.' }] },
          {
            role: 'model',
            parts: [{ functionCall: { name: 'some_tool', args: {} } }],
          },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(historyWithPendingCall);

        // Arrange: IDE context changes, but this should be skipped
        const contextB = {
          workspaceState: {
            openFiles: [
              {
                path: '/path/to/fileB.ts',
                isActive: true,
                timestamp: Date.now(),
              },
            ],
          },
        };
        vi.mocked(ideContextStore.get).mockReturnValue(contextB);

        // Act: Send the tool response
        stream = client.sendMessageStream(
          [
            {
              functionResponse: {
                name: 'some_tool',
                response: { success: true },
              },
            },
          ],
          new AbortController().signal,
          'prompt-id-tool-response',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: No context was sent
        expect(mockChat.addHistory).not.toHaveBeenCalled();

        // --- Step 2: A new message is sent, latest context DELTA should be included ---
        const historyAfterToolResponse: Content[] = [
          ...historyWithPendingCall,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'some_tool',
                  response: { success: true },
                },
              },
            ],
          },
          { role: 'model', parts: [{ text: 'The tool ran successfully.' }] },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(
          historyAfterToolResponse,
        );

        // Arrange: The IDE context has changed again
        const contextC = {
          workspaceState: {
            openFiles: [
              // fileA is now closed, fileC is open
              {
                path: '/path/to/fileC.ts',
                isActive: true,
                timestamp: Date.now(),
              },
            ],
          },
        };
        vi.mocked(ideContextStore.get).mockReturnValue(contextC);

        // Act: Send a new, regular user message
        stream = client.sendMessageStream(
          [{ text: 'Thanks!' }],
          new AbortController().signal,
          'prompt-id-final',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: The DELTA context was sent
        const finalCall = vi.mocked(mockChat.addHistory!).mock.calls[0][0];
        expect(JSON.stringify(finalCall)).toContain('summary of changes');
        // The delta should reflect fileA being closed and fileC being opened.
        expect(JSON.stringify(finalCall)).toContain('filesClosed');
        expect(JSON.stringify(finalCall)).toContain('fileA.ts');
        expect(JSON.stringify(finalCall)).toContain('activeFileChanged');
        expect(JSON.stringify(finalCall)).toContain('fileC.ts');
      });
    });

    it('should not call checkNextSpeaker when turn.run() yields an error', async () => {
      // Arrange
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);

      const mockStream = (async function* () {
        yield {
          type: GeminiEventType.Error,
          value: { error: { message: 'test error' } },
        };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-error',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(mockCheckNextSpeaker).not.toHaveBeenCalled();
    });

    it('should not call checkNextSpeaker when turn.run() yields a value then an error', async () => {
      // Arrange
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);

      const mockStream = (async function* () {
        yield { type: GeminiEventType.Content, value: 'some content' };
        yield {
          type: GeminiEventType.Error,
          value: { error: { message: 'test error' } },
        };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-error',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(mockCheckNextSpeaker).not.toHaveBeenCalled();
    });

    describe('Loop Recovery (Two-Strike)', () => {
      beforeEach(() => {
        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          setTools: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;
        vi.spyOn(client['loopDetector'], 'clearDetection');
        vi.spyOn(client['loopDetector'], 'reset');
      });

      it('should trigger recovery (Strike 1) and continue', async () => {
        // Arrange
        vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
          count: 0,
        });
        vi.spyOn(client['loopDetector'], 'addAndCheck')
          .mockReturnValueOnce({ count: 0 })
          .mockReturnValueOnce({ count: 1, detail: 'Repetitive tool call' });

        const sendMessageStreamSpy = vi.spyOn(client, 'sendMessageStream');

        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'First event' };
            yield { type: GeminiEventType.Content, value: 'Second event' };
          })(),
        );

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-loop-1',
        );

        const events = [];
        for await (const event of stream) {
          events.push(event);
        }

        // Assert
        // sendMessageStream should be called twice (original + recovery)
        expect(sendMessageStreamSpy).toHaveBeenCalledTimes(2);

        // Verify recovery call parameters
        const recoveryCall = sendMessageStreamSpy.mock.calls[1];
        expect((recoveryCall[0] as Part[])[0].text).toContain(
          'System: Potential loop detected',
        );
        expect((recoveryCall[0] as Part[])[0].text).toContain(
          'Repetitive tool call',
        );

        // Verify loopDetector.clearDetection was called
        expect(client['loopDetector'].clearDetection).toHaveBeenCalled();
      });

      it('should terminate (Strike 2) after recovery fails', async () => {
        // Arrange
        vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
          count: 0,
        });

        // First call triggers Strike 1, Second call triggers Strike 2
        vi.spyOn(client['loopDetector'], 'addAndCheck')
          .mockReturnValueOnce({ count: 0 })
          .mockReturnValueOnce({ count: 1, detail: 'Strike 1' }) // Triggers recovery in turn 1
          .mockReturnValueOnce({ count: 2, detail: 'Strike 2' }); // Triggers termination in turn 2 (recovery turn)

        const sendMessageStreamSpy = vi.spyOn(client, 'sendMessageStream');

        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Event' };
            yield { type: GeminiEventType.Content, value: 'Event' };
          })(),
        );

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-loop-2',
        );

        const events = [];
        for await (const event of stream) {
          events.push(event);
        }

        // Assert
        expect(events).toContainEqual({ type: GeminiEventType.LoopDetected });
        expect(sendMessageStreamSpy).toHaveBeenCalledTimes(2); // One original, one recovery
      });

      it('should respect boundedTurns during recovery', async () => {
        // Arrange
        vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
          count: 0,
        });
        vi.spyOn(client['loopDetector'], 'addAndCheck').mockReturnValue({
          count: 1,
          detail: 'Loop',
        });

        const sendMessageStreamSpy = vi.spyOn(client, 'sendMessageStream');

        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Event' };
          })(),
        );

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-loop-3',
          1, // Only 1 turn allowed
        );

        const events = [];
        for await (const event of stream) {
          events.push(event);
        }

        // Assert
        // Should NOT trigger recovery because boundedTurns would reach 0
        expect(events).toContainEqual({
          type: GeminiEventType.MaxSessionTurns,
        });
        expect(sendMessageStreamSpy).toHaveBeenCalledTimes(1);
      });

      it('should suppress LoopDetected event on Strike 1', async () => {
        // Arrange
        vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
          count: 0,
        });
        vi.spyOn(client['loopDetector'], 'addAndCheck')
          .mockReturnValueOnce({ count: 0 })
          .mockReturnValueOnce({ count: 1, detail: 'Strike 1' });

        const sendMessageStreamSpy = vi.spyOn(client, 'sendMessageStream');

        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Event' };
            yield { type: GeminiEventType.Content, value: 'Event 2' };
          })(),
        );

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-telemetry',
        );

        const events = [];
        for await (const event of stream) {
          events.push(event);
        }

        // Assert
        // Strike 1 should trigger recovery call but NOT emit LoopDetected event
        expect(events).not.toContainEqual({
          type: GeminiEventType.LoopDetected,
        });
        expect(sendMessageStreamSpy).toHaveBeenCalledTimes(2);
      });

      it('should escalate Strike 2 even if loop type changes', async () => {
        // Arrange
        vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
          count: 0,
        });

        // Strike 1: Tool Call Loop, Strike 2: LLM Detected Loop
        vi.spyOn(client['loopDetector'], 'addAndCheck')
          .mockReturnValueOnce({ count: 0 })
          .mockReturnValueOnce({
            count: 1,
            type: LoopType.TOOL_CALL_LOOP,
            detail: 'Repetitive tool',
          })
          .mockReturnValueOnce({
            count: 2,
            type: LoopType.LLM_DETECTED_LOOP,
            detail: 'LLM loop',
          });

        const sendMessageStreamSpy = vi.spyOn(client, 'sendMessageStream');

        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Event' };
            yield { type: GeminiEventType.Content, value: 'Event 2' };
          })(),
        );

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-escalate',
        );

        const events = [];
        for await (const event of stream) {
          events.push(event);
        }

        // Assert
        expect(events).toContainEqual({ type: GeminiEventType.LoopDetected });
        expect(sendMessageStreamSpy).toHaveBeenCalledTimes(2);
      });

      it('should reset loop detector on new prompt', async () => {
        // Arrange
        vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue({
          count: 0,
        });
        vi.spyOn(client['loopDetector'], 'addAndCheck').mockReturnValue({
          count: 0,
        });
        mockTurnRunFn.mockImplementation(() =>
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Event' };
          })(),
        );

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-new',
        );
        for await (const _ of stream) {
          // Consume stream
        }

        // Assert
        expect(client['loopDetector'].reset).toHaveBeenCalledWith(
          'prompt-id-new',
          'Hi',
        );
      });
    });
  });

  describe('generateContent', () => {
    it('should call generateContent with the correct parameters', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const abortSignal = new AbortController().signal;

      await client.generateContent(
        { model: 'test-model' },
        contents,
        abortSignal,
        LlmRole.MAIN,
      );

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        {
          model: 'test-model',
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt({} as unknown as Config, ''),
            temperature: 0,
            topP: 1,
          },
          contents,
        },
        'test-session-id',
        LlmRole.MAIN,
      );
    });

    it('should use current model from config for content generation', async () => {
      const initialModel = 'test-model';
      const contents = [{ role: 'user', parts: [{ text: 'test' }] }];

      await client.generateContent(
        { model: initialModel },
        contents,
        new AbortController().signal,
        LlmRole.MAIN,
      );

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: initialModel,
        }),
        'test-session-id',
        LlmRole.MAIN,
      );
    });

    describe('Hook System', () => {
      let mockMessageBus: { publish: Mock; subscribe: Mock };

      beforeEach(() => {
        vi.clearAllMocks();
        mockMessageBus = { publish: vi.fn(), subscribe: vi.fn() };

        // Force override config methods on the client instance
        client['config'].getEnableHooks = vi.fn().mockReturnValue(true);
        client['config'].getMessageBus = vi
          .fn()
          .mockReturnValue(mockMessageBus);
      });

      it('should fire BeforeAgent and AfterAgent exactly once for a simple turn', async () => {
        const promptId = 'test-prompt-hook-1';
        const request = { text: 'Hello Hooks' };
        const signal = new AbortController().signal;

        mockTurnRunFn.mockImplementation(async function* (
          this: MockTurnContext,
        ) {
          this.getResponseText.mockReturnValue('Hook Response');
          yield { type: GeminiEventType.Content, value: 'Hook Response' };
        });

        const stream = client.sendMessageStream(request, signal, promptId);
        while (!(await stream.next()).done);

        expect(mockHookSystem.fireBeforeAgentEvent).toHaveBeenCalledTimes(1);
        expect(mockHookSystem.fireAfterAgentEvent).toHaveBeenCalledTimes(1);
        expect(mockHookSystem.fireAfterAgentEvent).toHaveBeenCalledWith(
          partToString(request),
          'Hook Response',
          false,
        );

        // Map should be empty
        expect(client['hookStateMap'].size).toBe(0);
      });

      it('should fire BeforeAgent once and AfterAgent once even with recursion', async () => {
        const { checkNextSpeaker } = await import(
          '../utils/nextSpeakerChecker.js'
        );
        vi.mocked(checkNextSpeaker)
          .mockResolvedValueOnce({ next_speaker: 'model', reasoning: 'more' })
          .mockResolvedValueOnce(null);

        const promptId = 'test-prompt-hook-recursive';
        const request = { text: 'Recursion Test' };
        const signal = new AbortController().signal;

        let callCount = 0;
        mockTurnRunFn.mockImplementation(async function* (
          this: MockTurnContext,
        ) {
          callCount++;
          const response = `Response ${callCount}`;
          this.getResponseText.mockReturnValue(response);
          yield { type: GeminiEventType.Content, value: response };
        });

        const stream = client.sendMessageStream(request, signal, promptId);
        while (!(await stream.next()).done);

        // BeforeAgent should fire ONLY once despite multiple internal turns
        expect(mockHookSystem.fireBeforeAgentEvent).toHaveBeenCalledTimes(1);

        // AfterAgent should fire ONLY when the stack unwinds
        expect(mockHookSystem.fireAfterAgentEvent).toHaveBeenCalledTimes(1);

        // Check cumulative response (separated by newline)
        expect(mockHookSystem.fireAfterAgentEvent).toHaveBeenCalledWith(
          partToString(request),
          'Response 1\nResponse 2',
          false,
        );

        expect(client['hookStateMap'].size).toBe(0);
      });

      it('should use original request in AfterAgent hook even when continuation happened', async () => {
        const { checkNextSpeaker } = await import(
          '../utils/nextSpeakerChecker.js'
        );
        vi.mocked(checkNextSpeaker)
          .mockResolvedValueOnce({ next_speaker: 'model', reasoning: 'more' })
          .mockResolvedValueOnce(null);

        const promptId = 'test-prompt-hook-original-req';
        const request = { text: 'Do something' };
        const signal = new AbortController().signal;

        mockTurnRunFn.mockImplementation(async function* (
          this: MockTurnContext,
        ) {
          this.getResponseText.mockReturnValue('Ok');
          yield { type: GeminiEventType.Content, value: 'Ok' };
        });

        const stream = client.sendMessageStream(request, signal, promptId);
        while (!(await stream.next()).done);

        expect(mockHookSystem.fireAfterAgentEvent).toHaveBeenCalledWith(
          partToString(request), // Should be 'Do something'
          expect.stringContaining('Ok'),
          false,
        );
      });

      it('should cleanup state when prompt_id changes', async () => {
        const signal = new AbortController().signal;
        mockTurnRunFn.mockImplementation(async function* (
          this: MockTurnContext,
        ) {
          this.getResponseText.mockReturnValue('Ok');
          yield { type: GeminiEventType.Content, value: 'Ok' };
        });

        client['hookStateMap'].set('old-id', {
          hasFiredBeforeAgent: true,
          cumulativeResponse: 'Old',
          activeCalls: 0,
          originalRequest: { text: 'Old' },
        });
        client['lastPromptId'] = 'old-id';

        const stream = client.sendMessageStream(
          { text: 'New' },
          signal,
          'new-id',
        );
        await stream.next();

        expect(client['hookStateMap'].has('old-id')).toBe(false);
        expect(client['hookStateMap'].has('new-id')).toBe(true);
      });

      it('should stop execution in BeforeAgent when hook returns continue: false', async () => {
        mockHookSystem.fireBeforeAgentEvent.mockResolvedValue({
          shouldStopExecution: () => true,
          getEffectiveReason: () => 'Stopped by hook',
          systemMessage: undefined,
        });

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          setTools: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;

        const request = [{ text: 'Hello' }];
        const stream = client.sendMessageStream(
          request,
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual({
          type: GeminiEventType.AgentExecutionStopped,
          value: { reason: 'Stopped by hook' },
        });
        expect(mockChat.addHistory).toHaveBeenCalledWith({
          role: 'user',
          parts: request,
        });
        expect(mockTurnRunFn).not.toHaveBeenCalled();
      });

      it('should block execution in BeforeAgent when hook returns decision: block', async () => {
        mockHookSystem.fireBeforeAgentEvent.mockResolvedValue({
          shouldStopExecution: () => false,
          isBlockingDecision: () => true,
          getEffectiveReason: () => 'Blocked by hook',
          systemMessage: undefined,
        });

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          setTools: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;

        const request = [{ text: 'Hello' }];
        const stream = client.sendMessageStream(
          request,
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual({
          type: GeminiEventType.AgentExecutionBlocked,
          value: {
            reason: 'Blocked by hook',
          },
        });
        expect(mockChat.addHistory).not.toHaveBeenCalled();
        expect(mockTurnRunFn).not.toHaveBeenCalled();
      });

      it('should stop execution in AfterAgent when hook returns continue: false', async () => {
        mockHookSystem.fireAfterAgentEvent.mockResolvedValue({
          shouldStopExecution: () => true,
          getEffectiveReason: () => 'Stopped after agent',
          shouldClearContext: () => false,
          systemMessage: undefined,
        });

        mockTurnRunFn.mockImplementation(async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        });

        const stream = client.sendMessageStream(
          { text: 'Hi' },
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual(
          expect.objectContaining({
            type: GeminiEventType.AgentExecutionStopped,
            value: expect.objectContaining({ reason: 'Stopped after agent' }),
          }),
        );
        // sendMessageStream should not recurse
        expect(mockTurnRunFn).toHaveBeenCalledTimes(1);
      });

      it('should yield AgentExecutionBlocked and recurse in AfterAgent when hook returns decision: block', async () => {
        mockHookSystem.fireAfterAgentEvent
          .mockResolvedValueOnce({
            shouldStopExecution: () => false,
            isBlockingDecision: () => true,
            getEffectiveReason: () => 'Please explain',
            shouldClearContext: () => false,
            systemMessage: undefined,
          })
          .mockResolvedValueOnce({
            shouldStopExecution: () => false,
            isBlockingDecision: () => false,
            shouldClearContext: () => false,
            systemMessage: undefined,
          });

        mockTurnRunFn.mockImplementation(async function* () {
          yield { type: GeminiEventType.Content, value: 'Response' };
        });

        const stream = client.sendMessageStream(
          { text: 'Hi' },
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual(
          expect.objectContaining({
            type: GeminiEventType.AgentExecutionBlocked,
            value: expect.objectContaining({ reason: 'Please explain' }),
          }),
        );
        // Should have called turn run twice (original + re-prompt)
        expect(mockTurnRunFn).toHaveBeenCalledTimes(2);
        expect(mockTurnRunFn).toHaveBeenNthCalledWith(
          2,
          expect.anything(),
          [{ text: 'Please explain' }],
          expect.anything(),
          undefined,
        );

        // First call should have stopHookActive=false, retry should have stopHookActive=true
        expect(mockHookSystem.fireAfterAgentEvent).toHaveBeenCalledTimes(2);
        expect(mockHookSystem.fireAfterAgentEvent).toHaveBeenNthCalledWith(
          1,
          expect.any(String),
          expect.any(String),
          false,
        );
        expect(mockHookSystem.fireAfterAgentEvent).toHaveBeenNthCalledWith(
          2,
          expect.any(String),
          expect.any(String),
          true,
        );
      });

      it('should call resetChat when AfterAgent hook returns shouldClearContext: true', async () => {
        const resetChatSpy = vi
          .spyOn(client, 'resetChat')
          .mockResolvedValue(undefined);

        mockHookSystem.fireAfterAgentEvent
          .mockResolvedValueOnce({
            shouldStopExecution: () => false,
            isBlockingDecision: () => true,
            getEffectiveReason: () => 'Blocked and clearing context',
            shouldClearContext: () => true,
            systemMessage: undefined,
          })
          .mockResolvedValueOnce({
            shouldStopExecution: () => false,
            isBlockingDecision: () => false,
            shouldClearContext: () => false,
            systemMessage: undefined,
          });

        mockTurnRunFn.mockImplementation(async function* () {
          yield { type: GeminiEventType.Content, value: 'Response' };
        });

        const stream = client.sendMessageStream(
          { text: 'Hi' },
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual({
          type: GeminiEventType.AgentExecutionBlocked,
          value: {
            reason: 'Blocked and clearing context',
            systemMessage: undefined,
            contextCleared: true,
          },
        });
        expect(resetChatSpy).toHaveBeenCalledTimes(1);

        resetChatSpy.mockRestore();
      });
    });

    it('accepts short plaintext advisor responses as fallback guidance', async () => {
      vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'this is not valid advisor json' }],
            },
          },
        ],
      } as GenerateContentResponse);

      const result = await client['attemptPolluxAdvisorConsultationWithModel']({
        turnId: 'test-turn',
        attemptIndex: 1,
        attemptKind: 'primary',
        advisorModelId: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.advisorModel,
        advisorPrompt: 'advisor prompt',
        advisorSignal: new AbortController().signal,
        executorModel: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.executorModel,
        escalationMeta: undefined,
      });

      expect(result).toMatchObject({
        consultationSucceeded: true,
        parserOutcome: 'plain_text_fallback',
        guidance: 'this is not valid advisor json',
        retryableForFallback: false,
      });
    });

    it('classifies quota-looking advisor response text as quota_exhausted', async () => {
      vi.spyOn(client, 'generateContent').mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'TerminalQuotaError: You have exhausted your capacity on this model. reason: QUOTA_EXHAUSTED code: 429',
                },
              ],
            },
          },
        ],
      } as GenerateContentResponse);

      const result = await client['attemptPolluxAdvisorConsultationWithModel']({
        turnId: 'test-turn',
        attemptIndex: 1,
        attemptKind: 'primary',
        advisorModelId: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.advisorModel,
        advisorPrompt: 'advisor prompt',
        advisorSignal: new AbortController().signal,
        executorModel: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.executorModel,
        escalationMeta: undefined,
      });

      expect(result).toMatchObject({
        consultationSucceeded: false,
        parserOutcome: 'quota_exhausted',
        outcome: 'quota_exhausted',
        failOpenKind: 'quota_exhausted',
        retryableForRepair: false,
        retryableForFallback: true,
      });
    });

    it('classifies wrapped abort-like advisor failures as timeout instead of parse_error', () => {
      const wrappedAbort = new Error(
        'Failed to generate content with model gemini-3.1-pro-preview: The user aborted a request.',
      );

      expect(client['classifyPolluxAdvisorFailure'](wrappedAbort)).toBe(
        'timeout',
      );
    });
  });
});
