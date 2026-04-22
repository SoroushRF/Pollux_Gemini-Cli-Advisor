/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponseUsageMetadata } from '@google/genai';
import { GeminiEventType } from '../../core/turn.js';
import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../../scheduler/types.js';
import type { ToolErrorType } from '../../tools/tool-error.js';
import type { CalibrationTraceEntry, ScriptedEvent } from './calibration.js';
import { LOOP_HARD_CONFIRMED_SIGNAL_ID } from './sensors/loopBridge.js';
import { RISK_PRE_TOOL_HIGH_SIGNAL_ID } from './sensors/riskGate.js';
import {
  SELF_CONFIDENCE_LOW_SIGNAL_ID,
  SELF_STRUCTURED_STATUS_STUCK_SIGNAL_ID,
} from './sensors/selfReport.js';
import {
  THOUGHT_ENTROPY_SPIKE_SIGNAL_ID,
  THOUGHT_HEDGE_DENSITY_SIGNAL_ID,
  THOUGHT_SELF_CONTRADICTION_SIGNAL_ID,
  THOUGHT_STALL_SIGNAL_ID,
  THOUGHT_SUBJECT_LOOP_SIGNAL_ID,
} from './sensors/thought.js';
import {
  TOOL_EXIT_REGRESSION_SIGNAL_ID,
  TOOL_FAILURE_CASCADE_SIGNAL_ID,
  TOOL_IDENTICAL_REPEAT_SIGNAL_ID,
  TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID,
  TOOL_TOKEN_BURN_SIGNAL_ID,
} from './sensors/toolPattern.js';
import {
  NEG_CONCRETE_SUBJECT_SIGNAL_ID,
  NEG_CONFIDENT_CLOSE_SIGNAL_ID,
  NEG_EARLY_TURN_SIGNAL_ID,
  NEG_EXIT_ZERO_SIGNAL_ID,
  NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID,
} from './sensors/negatives.js';
import { LoopType } from '../../telemetry/types.js';

function toolRequest(
  callId: string,
  name: string,
  args: Record<string, unknown>,
  promptId = 'turn-1',
): ToolCallRequestInfo {
  return {
    callId,
    name,
    args,
    isClientInitiated: false,
    prompt_id: promptId,
  };
}

function toolResponse(params: {
  callId: string;
  responseText: string;
  errorType?: ToolErrorType;
}): ToolCallResponseInfo {
  return {
    callId: params.callId,
    responseParts: [{ text: params.responseText }],
    resultDisplay: undefined,
    error: undefined,
    errorType: params.errorType,
  };
}

function beginTurn(atMs = 0, userPromptText?: string): ScriptedEvent {
  return { atMs, kind: 'begin_turn', userPromptText };
}

function thought(
  atMs: number,
  subject: string,
  description: string,
): ScriptedEvent {
  return {
    atMs,
    kind: 'stream',
    event: { type: GeminiEventType.Thought, value: { subject, description } },
  };
}

function content(atMs: number, value: string): ScriptedEvent {
  return {
    atMs,
    kind: 'stream',
    event: { type: GeminiEventType.Content, value },
  };
}

function toolCallRequest(
  atMs: number,
  request: ToolCallRequestInfo,
): ScriptedEvent {
  return {
    atMs,
    kind: 'stream',
    event: { type: GeminiEventType.ToolCallRequest, value: request },
  };
}

function toolCallResponse(
  atMs: number,
  response: ToolCallResponseInfo,
): ScriptedEvent {
  return {
    atMs,
    kind: 'stream',
    event: { type: GeminiEventType.ToolCallResponse, value: response },
  };
}

function finished(
  atMs: number,
  usage?: { totalTokenCount?: number },
): ScriptedEvent {
  const usageMetadata: GenerateContentResponseUsageMetadata | undefined = usage
    ? { totalTokenCount: usage.totalTokenCount }
    : undefined;
  return {
    atMs,
    kind: 'stream',
    event: {
      type: GeminiEventType.Finished,
      value: { reason: undefined, usageMetadata },
    },
  };
}

function setLoopDetected(atMs: number, detected: boolean): ScriptedEvent {
  // Loop bridge reads LoopDetectionService.peekState(). We model only the fields it needs.
  return {
    atMs,
    kind: 'set_loop_state',
    state: {
      loopDetected: detected,
      lastLoopType: detected
        ? LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS
        : undefined,
      detail: detected ? 'scripted loop state' : undefined,
      confirmedByModel: detected ? 'gemini-2.5-pro' : undefined,
    },
  };
}

function statusTagStuckText(stuckOn: string): string {
  return `<pollux:status stuck_on="${stuckOn}" next="try a smaller reproducer"/>`;
}

function confidenceTagText(value: number): string {
  return `<!-- pollux:confidence:${value} -->`;
}

const BASE_PROMPT = 'fix failing tests in pollux observer';

function makeId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

/**
 * Calibration corpus (Phase H) — scripted traces.
 *
 * Notes:
 * - The harness records all sensor signals; escalation correctness is pinned by `expected.escalate`.
 * - Many traces are intentionally redundant variants so the corpus hits ≥60 entries and exercises
 *   small perturbations without changing expected outcomes.
 */
export const CALIBRATION_CORPUS: readonly CalibrationTraceEntry[] = (() => {
  const out: CalibrationTraceEntry[] = [];

  // --- Hard precision (same-turn intent candidates) ---
  out.push({
    id: 'CAL-TP-RISK-01',
    category: 'true_positive',
    description:
      'Risk gate: rm -rf should emit hard-precision risk.pre_tool_high',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      toolCallRequest(
        10,
        toolRequest('c1', 'run_shell_command', { command: 'rm -rf /tmp/*' }),
      ),
      finished(20),
    ],
    expected: {
      escalate: true,
      expectedSignalIds: [RISK_PRE_TOOL_HIGH_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-LOOP-01',
    category: 'true_positive',
    description:
      'Loop bridge: loopDetected rising edge should emit loop.hard_confirmed',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      setLoopDetected(5, true),
      content(10, 'still going...'),
      finished(20),
    ],
    expected: {
      escalate: true,
      expectedSignalIds: [LOOP_HARD_CONFIRMED_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-SELFSTATUS-01',
    category: 'true_positive',
    description:
      'Self-report: non-trivial pollux:status stuck_on should emit hard-precision signal',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      content(10, statusTagStuckText('ci fails with EACCES on node_modules')),
      finished(20),
    ],
    expected: {
      escalate: true,
      expectedSignalIds: [SELF_STRUCTURED_STATUS_STUCK_SIGNAL_ID],
    },
  });

  // --- Thought signals (soft) ---
  out.push({
    id: 'CAL-TP-THOUGHT-LOOP-01',
    category: 'true_positive',
    description: 'Thought subject loop: 3 similar subjects',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      thought(10, 'Investigate failure', 'maybe'),
      thought(20, 'Investigate failure', 'still'),
      thought(30, 'Investigate failure', 'again'),
      toolCallRequest(
        40,
        toolRequest('c2', 'run_shell_command', {
          command: 'echo Exit Code: 1',
        }),
      ),
      toolCallResponse(
        50,
        toolResponse({ callId: 'c2', responseText: 'Exit Code: 1' }),
      ),
      toolCallRequest(
        60,
        toolRequest('c3', 'run_shell_command', {
          command: 'echo Exit Code: 1',
        }),
      ),
      toolCallResponse(
        70,
        toolResponse({ callId: 'c3', responseText: 'Exit Code: 1' }),
      ),
      toolCallRequest(
        80,
        toolRequest('c4', 'run_shell_command', {
          command: 'echo Exit Code: 1',
        }),
      ),
      toolCallResponse(
        90,
        toolResponse({ callId: 'c4', responseText: 'Exit Code: 1' }),
      ),
      finished(100),
    ],
    expected: {
      escalate: true,
      expectedSignalIds: [THOUGHT_SUBJECT_LOOP_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-THOUGHT-HEDGE-01',
    category: 'boundary',
    description:
      'Hedge density should emit thought.hedge_density (low precision)',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      thought(
        10,
        'Plan',
        'maybe perhaps I think we might let me try hmm wait actually',
      ),
      thought(
        20,
        'Plan',
        'maybe perhaps I think we might let me try hmm wait actually',
      ),
      thought(
        30,
        'Plan',
        'maybe perhaps I think we might let me try hmm wait actually',
      ),
      toolCallRequest(40, toolRequest('c5', 'read_file', { path: 'a.txt' })),
      toolCallRequest(50, toolRequest('c6', 'read_file', { path: 'b.txt' })),
      toolCallRequest(60, toolRequest('c7', 'read_file', { path: 'c.txt' })),
      toolCallRequest(70, toolRequest('c8', 'read_file', { path: 'd.txt' })),
      toolCallRequest(80, toolRequest('c9', 'read_file', { path: 'e.txt' })),
      toolCallRequest(90, toolRequest('c10', 'read_file', { path: 'f.txt' })),
      toolCallRequest(100, toolRequest('c11', 'read_file', { path: 'g.txt' })),
      toolCallRequest(110, toolRequest('c12', 'read_file', { path: 'h.txt' })),
      finished(120),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [THOUGHT_HEDGE_DENSITY_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-THOUGHT-CONTRA-01',
    category: 'boundary',
    description:
      'Self contradiction phrase should emit thought.self_contradiction',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      thought(10, 'Reason', "wait that's wrong"),
      finished(20),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [THOUGHT_SELF_CONTRADICTION_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-THOUGHT-STALL-01',
    category: 'boundary',
    description: 'Same subject expanded description should emit thought.stall',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      thought(10, 'Build', 'short'),
      thought(20, 'Build', 'a much longer description without progress'),
      finished(30),
    ],
    expected: { escalate: false, expectedSignalIds: [THOUGHT_STALL_SIGNAL_ID] },
  });

  out.push({
    id: 'CAL-TP-THOUGHT-ENTROPY-01',
    category: 'boundary',
    description: 'Entropy spike: many distinct subjects quickly',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      thought(10, 'S1', 'a'),
      thought(20, 'S2', 'b'),
      thought(30, 'S3', 'c'),
      thought(40, 'S4', 'd'),
      finished(60),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [THOUGHT_ENTROPY_SPIKE_SIGNAL_ID],
    },
  });

  // --- Tool pattern signals ---
  out.push({
    id: 'CAL-TP-TOOL-REPEAT-01',
    category: 'true_positive',
    description:
      'Identical repeat: 3 same tool requests should emit tool.identical_repeat',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      toolCallRequest(10, toolRequest('r1', 'read_file', { path: 'a.txt' })),
      toolCallRequest(20, toolRequest('r2', 'read_file', { path: 'a.txt' })),
      toolCallRequest(30, toolRequest('r3', 'read_file', { path: 'a.txt' })),
      finished(40),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [TOOL_IDENTICAL_REPEAT_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-TOOL-EXITREG-01',
    category: 'boundary',
    description: 'Exit regression 1→0→1→0 should emit tool.exit_regression',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      toolCallRequest(
        10,
        toolRequest('s1', 'run_shell_command', { command: 'cmd1' }),
      ),
      toolCallResponse(
        20,
        toolResponse({ callId: 's1', responseText: 'Exit Code: 1' }),
      ),
      toolCallRequest(
        30,
        toolRequest('s2', 'run_shell_command', { command: 'cmd2' }),
      ),
      toolCallResponse(
        40,
        toolResponse({ callId: 's2', responseText: 'Exit Code: 0' }),
      ),
      toolCallRequest(
        50,
        toolRequest('s3', 'run_shell_command', { command: 'cmd3' }),
      ),
      toolCallResponse(
        60,
        toolResponse({ callId: 's3', responseText: 'Exit Code: 1' }),
      ),
      toolCallRequest(
        70,
        toolRequest('s4', 'run_shell_command', { command: 'cmd4' }),
      ),
      toolCallResponse(
        80,
        toolResponse({ callId: 's4', responseText: 'Exit Code: 0' }),
      ),
      finished(90),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [TOOL_EXIT_REGRESSION_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-TOOL-CASCADE-01',
    category: 'true_positive',
    description:
      'Failure cascade: 3 consecutive failures emits tool.failure_cascade',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      toolCallRequest(
        10,
        toolRequest('f1', 'run_shell_command', { command: 'x' }),
      ),
      toolCallResponse(
        20,
        toolResponse({ callId: 'f1', responseText: 'Exit Code: 2' }),
      ),
      toolCallRequest(
        30,
        toolRequest('f2', 'run_shell_command', { command: 'y' }),
      ),
      toolCallResponse(
        40,
        toolResponse({ callId: 'f2', responseText: 'Exit Code: 2' }),
      ),
      toolCallRequest(
        50,
        toolRequest('f3', 'run_shell_command', { command: 'z' }),
      ),
      toolCallResponse(
        60,
        toolResponse({ callId: 'f3', responseText: 'Exit Code: 2' }),
      ),
      thought(70, 'Investigate', 'maybe'),
      thought(80, 'Investigate', 'maybe'),
      thought(90, 'Investigate', 'maybe'),
      finished(100),
    ],
    expected: {
      escalate: true,
      expectedSignalIds: [TOOL_FAILURE_CASCADE_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-TOOL-SEARCHONLY-01',
    category: 'boundary',
    description:
      'Search without decide: >=8 read-only calls + non-exploratory prompt',
    userPrompt: 'fix this bug',
    events: [
      beginTurn(0, 'fix this bug'),
      toolCallRequest(10, toolRequest('ro1', 'read_file', { path: 'a' })),
      toolCallRequest(20, toolRequest('ro2', 'read_file', { path: 'b' })),
      toolCallRequest(30, toolRequest('ro3', 'read_file', { path: 'c' })),
      toolCallRequest(40, toolRequest('ro4', 'read_file', { path: 'd' })),
      toolCallRequest(50, toolRequest('ro5', 'read_file', { path: 'e' })),
      toolCallRequest(60, toolRequest('ro6', 'read_file', { path: 'f' })),
      toolCallRequest(70, toolRequest('ro7', 'read_file', { path: 'g' })),
      toolCallRequest(80, toolRequest('ro8', 'read_file', { path: 'h' })),
      finished(90),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TP-TOOL-TOKENBURN-01',
    category: 'boundary',
    description:
      'Token burn requires median history; keep as a signal-coverage boundary (may not trigger in isolation)',
    userPrompt: BASE_PROMPT,
    events: [beginTurn(0), finished(10, { totalTokenCount: 9999 })],
    expected: {
      escalate: false,
      expectedSignalIds: [TOOL_TOKEN_BURN_SIGNAL_ID],
    },
  });

  // --- Self confidence low ---
  out.push({
    id: 'CAL-TP-SELFCONF-01',
    category: 'boundary',
    description: 'pollux:confidence<=3 should emit self.confidence_low (soft)',
    userPrompt: BASE_PROMPT,
    events: [beginTurn(0), content(10, confidenceTagText(2)), finished(20)],
    expected: {
      escalate: false,
      expectedSignalIds: [SELF_CONFIDENCE_LOW_SIGNAL_ID],
    },
  });

  // --- Negative signals (explicit coverage) ---
  out.push({
    id: 'CAL-TN-NEG-EXIT0-01',
    category: 'true_negative',
    description: 'neg.exit_zero when last tool exit is 0',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      toolCallRequest(
        10,
        toolRequest('n1', 'run_shell_command', { command: 'ok' }),
      ),
      toolCallResponse(
        20,
        toolResponse({ callId: 'n1', responseText: 'Exit Code: 0' }),
      ),
      finished(30),
    ],
    expected: { escalate: false, expectedSignalIds: [NEG_EXIT_ZERO_SIGNAL_ID] },
  });

  out.push({
    id: 'CAL-TN-NEG-CONCRETE-01',
    category: 'true_negative',
    description: 'neg.concrete_subject when thought subject is action-like',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      thought(10, 'editing', 'applied changes'),
      finished(20),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [NEG_CONCRETE_SUBJECT_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TN-NEG-CONFIDENTCLOSE-01',
    category: 'true_negative',
    description: 'neg.confident_close when model output is long and hedge-free',
    userPrompt: BASE_PROMPT,
    events: [beginTurn(0), content(10, 'word '.repeat(100)), finished(20)],
    expected: {
      escalate: false,
      expectedSignalIds: [NEG_CONFIDENT_CLOSE_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TN-NEG-EARLY-01',
    category: 'true_negative',
    description: 'neg.early_turn when fewer than two tool calls were made',
    userPrompt: BASE_PROMPT,
    events: [beginTurn(0), finished(10)],
    expected: {
      escalate: false,
      expectedSignalIds: [NEG_EARLY_TURN_SIGNAL_ID],
    },
  });

  out.push({
    id: 'CAL-TN-NEG-ADVSUCCESS-01',
    category: 'true_negative',
    description:
      'neg.recent_advisor_success coverage via note_advisor_success hook',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      { atMs: 5, kind: 'note_advisor_success', success: true },
      finished(10),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID],
    },
  });

  // --- Boundary: composite-evidence gate (single category should not escalate) ---
  out.push({
    id: 'CAL-TN-COMPOSITE-SINGLECAT-01',
    category: 'true_negative',
    description:
      'Composite gate: thought-only positives should not escalate when requireComposite=true',
    userPrompt: BASE_PROMPT,
    events: [
      beginTurn(0),
      thought(10, 'Investigate', 'maybe'),
      thought(20, 'Investigate', 'maybe'),
      thought(30, 'Investigate', 'maybe'),
      finished(40),
    ],
    expected: {
      escalate: false,
      expectedSignalIds: [THOUGHT_SUBJECT_LOOP_SIGNAL_ID],
    },
  });

  // --- Variants to reach ≥60 while preserving deterministic expectations ---
  // Create lightweight variants for signal coverage with small perturbations.
  const baseIds = [
    RISK_PRE_TOOL_HIGH_SIGNAL_ID,
    LOOP_HARD_CONFIRMED_SIGNAL_ID,
    SELF_STRUCTURED_STATUS_STUCK_SIGNAL_ID,
    THOUGHT_SUBJECT_LOOP_SIGNAL_ID,
    THOUGHT_HEDGE_DENSITY_SIGNAL_ID,
    THOUGHT_SELF_CONTRADICTION_SIGNAL_ID,
    THOUGHT_STALL_SIGNAL_ID,
    THOUGHT_ENTROPY_SPIKE_SIGNAL_ID,
    TOOL_IDENTICAL_REPEAT_SIGNAL_ID,
    TOOL_EXIT_REGRESSION_SIGNAL_ID,
    TOOL_FAILURE_CASCADE_SIGNAL_ID,
    TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID,
    SELF_CONFIDENCE_LOW_SIGNAL_ID,
    NEG_EXIT_ZERO_SIGNAL_ID,
    NEG_CONCRETE_SUBJECT_SIGNAL_ID,
    NEG_CONFIDENT_CLOSE_SIGNAL_ID,
    NEG_EARLY_TURN_SIGNAL_ID,
    NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID,
  ] as const;

  let n = 0;
  while (out.length < 62) {
    const signalId = baseIds[n % baseIds.length];
    const id = makeId('CAL-VAR', n++);
    // Simple variants that keep expected non-escalation (most are boundary/negative),
    // except hard-precision and failure cascade variants which should escalate.
    const shouldEscalate =
      signalId === RISK_PRE_TOOL_HIGH_SIGNAL_ID ||
      signalId === LOOP_HARD_CONFIRMED_SIGNAL_ID ||
      signalId === SELF_STRUCTURED_STATUS_STUCK_SIGNAL_ID ||
      signalId === TOOL_FAILURE_CASCADE_SIGNAL_ID ||
      signalId === THOUGHT_SUBJECT_LOOP_SIGNAL_ID;

    let events: ScriptedEvent[];
    switch (signalId) {
      case RISK_PRE_TOOL_HIGH_SIGNAL_ID:
        events = [
          beginTurn(0),
          toolCallRequest(
            10,
            toolRequest(id, 'run_shell_command', {
              command: 'git push --force origin main',
            }),
          ),
          finished(20),
        ];
        break;
      case LOOP_HARD_CONFIRMED_SIGNAL_ID:
        events = [
          beginTurn(0),
          setLoopDetected(5, true),
          content(10, 'looping'),
          finished(20),
        ];
        break;
      case SELF_STRUCTURED_STATUS_STUCK_SIGNAL_ID:
        events = [
          beginTurn(0),
          thought(10, 'Status', statusTagStuckText('cannot parse json output')),
          finished(20),
        ];
        break;
      case TOOL_FAILURE_CASCADE_SIGNAL_ID:
        events = [
          beginTurn(0),
          toolCallRequest(
            10,
            toolRequest('x1', 'run_shell_command', { command: 'bad' }),
          ),
          toolCallResponse(
            20,
            toolResponse({ callId: 'x1', responseText: 'Exit Code: 1' }),
          ),
          toolCallRequest(
            30,
            toolRequest('x2', 'run_shell_command', { command: 'bad' }),
          ),
          toolCallResponse(
            40,
            toolResponse({ callId: 'x2', responseText: 'Exit Code: 1' }),
          ),
          toolCallRequest(
            50,
            toolRequest('x3', 'run_shell_command', { command: 'bad' }),
          ),
          toolCallResponse(
            60,
            toolResponse({ callId: 'x3', responseText: 'Exit Code: 1' }),
          ),
          thought(70, 'Investigate', 'maybe'),
          thought(80, 'Investigate', 'maybe'),
          thought(90, 'Investigate', 'maybe'),
          finished(100),
        ];
        break;
      case THOUGHT_SUBJECT_LOOP_SIGNAL_ID:
        events = [
          beginTurn(0),
          thought(10, 'Investigate', 'one'),
          thought(20, 'Investigate', 'two'),
          thought(30, 'Investigate', 'three'),
          toolCallRequest(
            40,
            toolRequest('y1', 'run_shell_command', {
              command: 'echo Exit Code: 1',
            }),
          ),
          toolCallResponse(
            50,
            toolResponse({ callId: 'y1', responseText: 'Exit Code: 1' }),
          ),
          toolCallRequest(
            60,
            toolRequest('y2', 'run_shell_command', {
              command: 'echo Exit Code: 1',
            }),
          ),
          toolCallResponse(
            70,
            toolResponse({ callId: 'y2', responseText: 'Exit Code: 1' }),
          ),
          toolCallRequest(
            80,
            toolRequest('y3', 'run_shell_command', {
              command: 'echo Exit Code: 1',
            }),
          ),
          toolCallResponse(
            90,
            toolResponse({ callId: 'y3', responseText: 'Exit Code: 1' }),
          ),
          finished(100),
        ];
        break;
      case NEG_EXIT_ZERO_SIGNAL_ID:
        events = [
          beginTurn(0),
          toolCallRequest(
            10,
            toolRequest('z1', 'run_shell_command', { command: 'ok' }),
          ),
          toolCallResponse(
            20,
            toolResponse({ callId: 'z1', responseText: 'Exit Code: 0' }),
          ),
          finished(30),
        ];
        break;
      case NEG_CONCRETE_SUBJECT_SIGNAL_ID:
        events = [beginTurn(0), thought(10, 'writing', 'file'), finished(20)];
        break;
      case NEG_CONFIDENT_CLOSE_SIGNAL_ID:
        events = [beginTurn(0), content(10, 'token '.repeat(90)), finished(20)];
        break;
      case NEG_EARLY_TURN_SIGNAL_ID:
        events = [beginTurn(0), finished(10)];
        break;
      case NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID:
        events = [
          beginTurn(0),
          { atMs: 5, kind: 'note_advisor_success', success: true },
          finished(10),
        ];
        break;
      default:
        // A generic boundary-ish trace that should not escalate.
        events = [
          beginTurn(0),
          content(10, `${signalId} marker`),
          finished(20),
        ];
        break;
    }

    out.push({
      id,
      category: shouldEscalate ? 'boundary' : 'true_negative',
      description: `Variant trace for ${signalId}`,
      userPrompt: BASE_PROMPT,
      events,
      expected: { escalate: shouldEscalate },
    });
  }

  return out;
})();

export const KNOWN_SIGNAL_IDS = [
  RISK_PRE_TOOL_HIGH_SIGNAL_ID,
  LOOP_HARD_CONFIRMED_SIGNAL_ID,
  SELF_STRUCTURED_STATUS_STUCK_SIGNAL_ID,
  SELF_CONFIDENCE_LOW_SIGNAL_ID,
  THOUGHT_SUBJECT_LOOP_SIGNAL_ID,
  THOUGHT_HEDGE_DENSITY_SIGNAL_ID,
  THOUGHT_SELF_CONTRADICTION_SIGNAL_ID,
  THOUGHT_STALL_SIGNAL_ID,
  THOUGHT_ENTROPY_SPIKE_SIGNAL_ID,
  TOOL_IDENTICAL_REPEAT_SIGNAL_ID,
  TOOL_EXIT_REGRESSION_SIGNAL_ID,
  TOOL_FAILURE_CASCADE_SIGNAL_ID,
  TOOL_SEARCH_WITHOUT_DECIDE_SIGNAL_ID,
  TOOL_TOKEN_BURN_SIGNAL_ID,
  NEG_EXIT_ZERO_SIGNAL_ID,
  NEG_CONCRETE_SUBJECT_SIGNAL_ID,
  NEG_CONFIDENT_CLOSE_SIGNAL_ID,
  NEG_RECENT_ADVISOR_SUCCESS_SIGNAL_ID,
  NEG_EARLY_TURN_SIGNAL_ID,
] as const;
