/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Task } from './task.js';
import {
  GeminiEventType,
  type Config,
  type ToolCallRequestInfo,
  type GitService,
  type CompletedToolCall,
} from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import { CoderAgentEvent } from '../types.js';

const mockProcessRestorableToolCalls = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    processRestorableToolCalls: mockProcessRestorableToolCalls,
  };
});

describe('Task', () => {
  it('scheduleToolCalls should not modify the input requests array', async () => {
    const mockConfig = createMockConfig();

    const mockEventBus: ExecutionEventBus = {
      publish: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      finished: vi.fn(),
    };

    // The Task constructor is private. We'll bypass it for this unit test.
    // @ts-expect-error - Calling private constructor for test purposes.
    const task = new Task(
      'task-id',
      'context-id',
      mockConfig as Config,
      mockEventBus,
    );

    task['setTaskStateAndPublishUpdate'] = vi.fn();
    task['getProposedContent'] = vi.fn().mockResolvedValue('new content');

    const requests: ToolCallRequestInfo[] = [
      {
        callId: '1',
        name: 'replace',
        args: {
          file_path: 'test.txt',
          old_string: 'old',
          new_string: 'new',
        },
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
    ];

    const originalRequests = JSON.parse(JSON.stringify(requests));
    const abortController = new AbortController();

    await task.scheduleToolCalls(requests, abortController.signal);

    expect(requests).toEqual(originalRequests);
  });

  describe('scheduleToolCalls', () => {
    const mockConfig = createMockConfig();
    const mockEventBus: ExecutionEventBus = {
      publish: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      finished: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should not create a checkpoint if no restorable tools are called', async () => {
      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );
      const requests: ToolCallRequestInfo[] = [
        {
          callId: '1',
          name: 'run_shell_command',
          args: { command: 'ls' },
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
      ];
      const abortController = new AbortController();
      await task.scheduleToolCalls(requests, abortController.signal);
      expect(mockProcessRestorableToolCalls).not.toHaveBeenCalled();
    });

    it('should create a checkpoint if a restorable tool is called', async () => {
      const mockConfig = createMockConfig({
        getCheckpointingEnabled: () => true,
        getGitService: () => Promise.resolve({} as GitService),
      });
      mockProcessRestorableToolCalls.mockResolvedValue({
        checkpointsToWrite: new Map([['test.json', 'test content']]),
        toolCallToCheckpointMap: new Map(),
        errors: [],
      });
      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );
      const requests: ToolCallRequestInfo[] = [
        {
          callId: '1',
          name: 'replace',
          args: {
            file_path: 'test.txt',
            old_string: 'old',
            new_string: 'new',
          },
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
      ];
      const abortController = new AbortController();
      await task.scheduleToolCalls(requests, abortController.signal);
      expect(mockProcessRestorableToolCalls).toHaveBeenCalledOnce();
    });

    it('should process all restorable tools for checkpointing in a single batch', async () => {
      const mockConfig = createMockConfig({
        getCheckpointingEnabled: () => true,
        getGitService: () => Promise.resolve({} as GitService),
      });
      mockProcessRestorableToolCalls.mockResolvedValue({
        checkpointsToWrite: new Map([
          ['test1.json', 'test content 1'],
          ['test2.json', 'test content 2'],
        ]),
        toolCallToCheckpointMap: new Map([
          ['1', 'test1'],
          ['2', 'test2'],
        ]),
        errors: [],
      });
      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );
      const requests: ToolCallRequestInfo[] = [
        {
          callId: '1',
          name: 'replace',
          args: {
            file_path: 'test.txt',
            old_string: 'old',
            new_string: 'new',
          },
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
        {
          callId: '2',
          name: 'write_file',
          args: { file_path: 'test2.txt', content: 'new content' },
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
        {
          callId: '3',
          name: 'not_restorable',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-3',
        },
      ];
      const abortController = new AbortController();
      await task.scheduleToolCalls(requests, abortController.signal);
      expect(mockProcessRestorableToolCalls).toHaveBeenCalledExactlyOnceWith(
        [
          expect.objectContaining({ callId: '1' }),
          expect.objectContaining({ callId: '2' }),
        ],
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('acceptAgentMessage', () => {
    it('should set currentTraceId when event has traceId', async () => {
      const mockConfig = createMockConfig();
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const event = {
        type: 'content',
        value: 'test',
        traceId: 'test-trace-id',
      };

      await task.acceptAgentMessage(event);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            traceId: 'test-trace-id',
          }),
        }),
      );
    });

    it('should handle Citation event and publish to event bus', async () => {
      const mockConfig = createMockConfig();
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const citationText = 'Source: example.com';
      const citationEvent = {
        type: GeminiEventType.Citation,
        value: citationText,
      };

      await task.acceptAgentMessage(citationEvent);

      expect(mockEventBus.publish).toHaveBeenCalledOnce();
      const publishedEvent = (mockEventBus.publish as Mock).mock.calls[0][0];

      expect(publishedEvent.kind).toBe('status-update');
      expect(publishedEvent.taskId).toBe('task-id');
      expect(publishedEvent.metadata.coderAgent.kind).toBe(
        CoderAgentEvent.CitationEvent,
      );
      expect(publishedEvent.status.message).toBeDefined();
      expect(publishedEvent.status.message.parts).toEqual([
        {
          kind: 'text',
          text: citationText,
        },
      ]);
    });

    it('should update modelInfo and reflect it in metadata and status updates', async () => {
      const mockConfig = createMockConfig();
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const modelInfoEvent = {
        type: GeminiEventType.ModelInfo,
        value: 'new-model-name',
      };

      await task.acceptAgentMessage(modelInfoEvent);

      expect(task.modelInfo).toBe('new-model-name');

      // Check getMetadata
      const metadata = await task.getMetadata();
      expect(metadata.model).toBe('new-model-name');

      // Check status update
      task.setTaskStateAndPublishUpdate(
        'working',
        { kind: CoderAgentEvent.StateChangeEvent },
        'Working...',
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            model: 'new-model-name',
          }),
        }),
      );
    });

    it.each([
      { eventType: GeminiEventType.Retry, eventName: 'Retry' },
      { eventType: GeminiEventType.InvalidStream, eventName: 'InvalidStream' },
    ])(
      'should handle $eventName event without triggering error handling',
      async ({ eventType }) => {
        const mockConfig = createMockConfig();
        const mockEventBus: ExecutionEventBus = {
          publish: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
          once: vi.fn(),
          removeAllListeners: vi.fn(),
          finished: vi.fn(),
        };

        // @ts-expect-error - Calling private constructor
        const task = new Task(
          'task-id',
          'context-id',
          mockConfig as Config,
          mockEventBus,
        );

        const cancelPendingToolsSpy = vi.spyOn(task, 'cancelPendingTools');
        const setTaskStateSpy = vi.spyOn(task, 'setTaskStateAndPublishUpdate');

        const event = {
          type: eventType,
        };

        await task.acceptAgentMessage(event);

        expect(cancelPendingToolsSpy).not.toHaveBeenCalled();
        expect(setTaskStateSpy).not.toHaveBeenCalled();
      },
    );
  });

  describe('currentPromptId and promptCount', () => {
    it('should correctly initialize and update promptId and promptCount', async () => {
      const mockConfig = createMockConfig();
      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: vi.fn().mockReturnValue((async function* () {})()),
      });
      mockConfig.getSessionId = () => 'test-session-id';

      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      // Initial state
      expect(task.currentPromptId).toBeUndefined();
      expect(task.promptCount).toBe(0);

      // First user message should set prompt_id
      const userMessage1 = {
        userMessage: {
          parts: [{ kind: 'text', text: 'hello' }],
        },
      } as RequestContext;
      const abortController1 = new AbortController();
      for await (const _ of task.acceptUserMessage(
        userMessage1,
        abortController1.signal,
      )) {
        // no-op
      }

      const expectedPromptId1 = 'test-session-id########0';
      expect(task.promptCount).toBe(1);
      expect(task.currentPromptId).toBe(expectedPromptId1);

      // A new user message should generate a new prompt_id
      const userMessage2 = {
        userMessage: {
          parts: [{ kind: 'text', text: 'world' }],
        },
      } as RequestContext;
      const abortController2 = new AbortController();
      for await (const _ of task.acceptUserMessage(
        userMessage2,
        abortController2.signal,
      )) {
        // no-op
      }

      const expectedPromptId2 = 'test-session-id########1';
      expect(task.promptCount).toBe(2);
      expect(task.currentPromptId).toBe(expectedPromptId2);

      // Subsequent tool call processing should use the same prompt_id
      const completedTool = {
        request: { callId: 'tool-1' },
        response: { responseParts: [{ text: 'tool output' }] },
      } as CompletedToolCall;
      const abortController3 = new AbortController();
      for await (const _ of task.sendCompletedToolsToLlm(
        [completedTool],
        abortController3.signal,
      )) {
        // no-op
      }

      expect(task.promptCount).toBe(2);
      expect(task.currentPromptId).toBe(expectedPromptId2);
    });
  });

  // BP-06 A2A deferred bypass assertion (P2-06).
  //
  // D6 (A2A CoderAgentExecutor) is explicitly out of scope for Pollux Phase 1
  // and Phase 2 per P0-01 §D6 and POLLUX_SPEC.md §3. Each A2A turn MUST
  // explicitly tag its GeminiClient.sendMessageStream invocation with the
  // A2A_DEFERRED surface marker so the advisor seam never engages on this
  // path regardless of the Pollux feature-flag state. These tests pin that
  // contract at the call-site level; the corresponding core-level guard
  // (A2A_DEFERRED is absent from the seam allow-list) is covered by the
  // `runPolluxAdvisorConsultation is a no-op for unknown runtime surfaces`
  // test in packages/core/src/core/client.test.ts.
  describe('Pollux A2A deferred bypass (P2-06 / BP-06)', () => {
    const A2A_DEFERRED_SURFACE = 'a2a_deferred' as const;

    function makeTaskWithSendMessageStreamSpy(): {
      task: Task;
      sendMessageStream: Mock;
    } {
      const mockConfig = createMockConfig();
      const sendMessageStream = vi
        .fn()
        .mockReturnValue((async function* () {})());
      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream,
      });
      mockConfig.getSessionId = () => 'a2a-deferred-session';

      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      return { task, sendMessageStream };
    }

    it('tags acceptUserMessage turns with the A2A_DEFERRED runtime surface', async () => {
      const { task, sendMessageStream } = makeTaskWithSendMessageStreamSpy();

      const userMessage = {
        userMessage: {
          parts: [{ kind: 'text', text: 'hello from a2a' }],
        },
      } as RequestContext;
      const aborted = new AbortController().signal;

      for await (const _ of task.acceptUserMessage(userMessage, aborted)) {
        // drain generator
      }

      expect(sendMessageStream).toHaveBeenCalledTimes(1);
      const callArgs = sendMessageStream.mock.calls[0];
      // Positional args: [request, signal, prompt_id, turns, isInvalidStreamRetry,
      //                   displayContent, stopHookActive, runtimeSurface].
      expect(callArgs.length).toBeGreaterThanOrEqual(8);
      expect(callArgs[7]).toBe(A2A_DEFERRED_SURFACE);
    });

    it('tags sendCompletedToolsToLlm turns with the A2A_DEFERRED runtime surface', async () => {
      const { task, sendMessageStream } = makeTaskWithSendMessageStreamSpy();

      const completedTool = {
        request: { callId: 'tool-a2a', prompt_id: 'a2a-prompt' },
        response: { responseParts: [{ text: 'tool output' }] },
      } as CompletedToolCall;
      const aborted = new AbortController().signal;

      for await (const _ of task.sendCompletedToolsToLlm(
        [completedTool],
        aborted,
      )) {
        // drain generator
      }

      expect(sendMessageStream).toHaveBeenCalledTimes(1);
      const callArgs = sendMessageStream.mock.calls[0];
      expect(callArgs.length).toBeGreaterThanOrEqual(8);
      expect(callArgs[7]).toBe(A2A_DEFERRED_SURFACE);
    });

    it('never engages legacy-non-interactive Pollux routing on A2A turns', async () => {
      const { task, sendMessageStream } = makeTaskWithSendMessageStreamSpy();

      const userMessage = {
        userMessage: {
          parts: [{ kind: 'text', text: 'a2a deferred marker check' }],
        },
      } as RequestContext;
      const aborted = new AbortController().signal;

      for await (const _ of task.acceptUserMessage(userMessage, aborted)) {
        // drain generator
      }

      const callArgs = sendMessageStream.mock.calls[0];
      // Deferred-scope reason marker: the A2A executor must never fall back to
      // the default LEGACY_NON_INTERACTIVE surface tag because that would
      // engage the Pollux advisor seam when pollux.enabled=true.
      expect(callArgs[7]).not.toBe('legacy_non_interactive');
      expect(callArgs[7]).toBe(A2A_DEFERRED_SURFACE);
    });
  });
});
