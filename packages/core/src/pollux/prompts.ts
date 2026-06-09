/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Advisor prompt builder and structured response parser (POLLUX_SPEC §§4, 6–7,
 * P1-06). Pure functions — no cross-turn mutable state.
 */

import type { AnySchema } from 'ajv';
import type {
  AdvisorConsultationInput,
  AdvisorConsultationMode,
  PolluxAdvisorExecutorProfile,
} from './types.js';
import { ADVISOR_CONSULTATION_TOOL_NAME } from './types.js';
import { SchemaValidator } from '../utils/schemaValidator.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON Schema (draft-07) for the advisor model's required output shape. */
export const POLLUX_ADVISOR_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['guidance'],
  additionalProperties: false,
  properties: {
    guidance: {
      type: 'string',
      minLength: 1,
      description:
        'Executor-safe guidance text. Must not include pollux confidence tags.',
    },
    confidence: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: 'Optional structured confidence (1–10).',
    },
    must_include: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Optional structural facts the executor must include.',
    },
    must_forbid: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Optional structural shortcuts the executor must avoid.',
    },
    verify_before_done: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Optional final checks before the executor finishes.',
    },
  },
} as const satisfies AnySchema;

const CONFIDENCE_COMMENT_RE = /<!--\s*pollux:confidence:\s*(\d+)\s*-->/gi;

const CONFIDENCE_XML_RE = /<pollux:confidence\b[^>]*\bvalue="(\d+)"[^>]*\/?>/gi;

const STATUS_TAG_RE = /<pollux:status\b[^>]*\/?>/gi;
const STATUS_TAG_PREFIX = '<pollux:status';
const ADVISOR_REQUEST_TAG_RE = /<pollux:advisor_request\b[^>]*\/?>/gi;
const ADVISOR_REQUEST_TAG_PREFIX = '<pollux:advisor_request';
const ADVISOR_REQUEST_LINE_RE =
  /^[ \t]*ADVISOR_REQUEST(?:\s+(now|next))?\s*:\s*(.+)$/gim;
const ADVISOR_REQUEST_BRACKET_RE = /\[\s*advisor\s+request\s*:\s*([^\]]+)\]/gi;
const ADVISOR_REQUEST_SNAKE_RE =
  /^[ \t]*consult_advisor(?:\s+(now|next))?\s*:\s*(.+)$/gim;
const ADVISOR_REQUEST_LINE_PREFIXES = [
  'advisor_request',
  '[advisor request',
  'consult_advisor',
] as const;

const STATUS_STUCK_ON_RE = /\bstuck_on\s*=\s*"([^"]*)"/i;
const STATUS_NEXT_RE = /\bnext\s*=\s*"([^"]*)"/i;
const ADVISOR_REQUEST_REASON_RE = /\breason\s*=\s*"([^"]*)"/i;
const ADVISOR_REQUEST_TIMING_RE = /\btiming\s*=\s*"(now|next)"/i;
const ADVISOR_PLAINTEXT_MAX_CHARS = 1200;

/**
 * Lists pollux confidence tag values in document order (POLLUX_SPEC §7.3).
 */
export function extractPolluxConfidenceTagValues(
  text: string,
): readonly number[] {
  const out: number[] = [];
  for (const m of text.matchAll(CONFIDENCE_COMMENT_RE)) {
    out.push(Number.parseInt(m[1], 10));
  }
  for (const m of text.matchAll(CONFIDENCE_XML_RE)) {
    out.push(Number.parseInt(m[1], 10));
  }
  return out;
}

/**
 * Removes Pollux confidence tags from free text (POLLUX_SPEC §7.3).
 */
export function stripPolluxConfidenceTags(text: string): string {
  return text
    .replace(CONFIDENCE_COMMENT_RE, '')
    .replace(CONFIDENCE_XML_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface PolluxStatusTag {
  readonly stuckOn?: string;
  readonly next?: string;
}

export interface PolluxAdvisorRequestTag {
  readonly reason?: string;
  readonly timing?: 'now' | 'next';
  readonly sourceFormat?: 'xml' | 'line' | 'bracket' | 'snake_case' | 'status';
}

/**
 * Lists structured Pollux status tags in document order (DETECTOR_IMPLEMENTATION_PLAN Phase E).
 */
export function parsePolluxStatusTag(text: string): readonly PolluxStatusTag[] {
  const out: PolluxStatusTag[] = [];
  for (const match of text.matchAll(STATUS_TAG_RE)) {
    const raw = match[0];
    const stuckOn = STATUS_STUCK_ON_RE.exec(raw)?.[1];
    const next = STATUS_NEXT_RE.exec(raw)?.[1];
    out.push({
      stuckOn: typeof stuckOn === 'string' ? stuckOn : undefined,
      next: typeof next === 'string' ? next : undefined,
    });
  }
  return out;
}

export function parsePolluxAdvisorRequestTag(
  text: string,
): readonly PolluxAdvisorRequestTag[] {
  const out: PolluxAdvisorRequestTag[] = [];
  for (const match of text.matchAll(ADVISOR_REQUEST_TAG_RE)) {
    const raw = match[0];
    const reason = ADVISOR_REQUEST_REASON_RE.exec(raw)?.[1];
    const timing = ADVISOR_REQUEST_TIMING_RE.exec(raw)?.[1];
    out.push({
      reason: typeof reason === 'string' ? reason : undefined,
      timing: timing === 'now' || timing === 'next' ? timing : undefined,
      sourceFormat: 'xml',
    });
  }
  for (const match of text.matchAll(ADVISOR_REQUEST_LINE_RE)) {
    const timing = match[1];
    const reason = match[2];
    out.push({
      reason: typeof reason === 'string' ? reason.trim() : undefined,
      timing: timing === 'now' || timing === 'next' ? timing : undefined,
      sourceFormat: 'line',
    });
  }
  for (const match of text.matchAll(ADVISOR_REQUEST_BRACKET_RE)) {
    const reason = match[1];
    out.push({
      reason: typeof reason === 'string' ? reason.trim() : undefined,
      sourceFormat: 'bracket',
    });
  }
  for (const match of text.matchAll(ADVISOR_REQUEST_SNAKE_RE)) {
    const timing = match[1];
    const reason = match[2];
    out.push({
      reason: typeof reason === 'string' ? reason.trim() : undefined,
      timing: timing === 'now' || timing === 'next' ? timing : undefined,
      sourceFormat: 'snake_case',
    });
  }
  return out;
}

/**
 * Removes Pollux status tags from free text (DETECTOR_IMPLEMENTATION_PLAN Phase E).
 */
export function stripPolluxStatusTags(text: string): string {
  return text
    .replace(STATUS_TAG_RE, '')
    .replace(ADVISOR_REQUEST_TAG_RE, '')
    .replace(ADVISOR_REQUEST_LINE_RE, '')
    .replace(ADVISOR_REQUEST_BRACKET_RE, '')
    .replace(ADVISOR_REQUEST_SNAKE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function findTrailingStatusTagCarryIndex(text: string): number {
  const partialTag =
    /<pollux:status\b[^>]*$/i.exec(text) ??
    /<pollux:advisor_request\b[^>]*$/i.exec(text);
  if (partialTag) {
    return partialTag.index;
  }

  const lower = text.toLowerCase();
  for (const prefix of [
    STATUS_TAG_PREFIX,
    ADVISOR_REQUEST_TAG_PREFIX,
    ...ADVISOR_REQUEST_LINE_PREFIXES,
  ]) {
    const maxPrefixLength = Math.min(prefix.length, lower.length);
    for (let length = maxPrefixLength; length > 0; length -= 1) {
      const suffix = lower.slice(lower.length - length);
      if (prefix.startsWith(suffix)) {
        return lower.length - length;
      }
    }
  }
  return -1;
}

export interface PolluxStatusTagStreamChunk {
  readonly output: string;
  readonly carry: string;
}

/**
 * Strips valid Pollux status tags across streamed content chunks. Malformed
 * near-misses are intentionally left intact so benchmark diagnostics can catch
 * them instead of silently treating them as valid self-report evidence.
 */
export function stripPolluxStatusTagsFromStreamChunk(
  chunk: string,
  carry = '',
): PolluxStatusTagStreamChunk {
  const combined = `${carry}${chunk}`;
  const carryIndex = findTrailingStatusTagCarryIndex(combined);
  if (carryIndex === -1) {
    return {
      output: stripPolluxStatusTags(combined),
      carry: '',
    };
  }
  return {
    output: stripPolluxStatusTags(combined.slice(0, carryIndex)),
    carry: combined.slice(carryIndex),
  };
}

export function flushPolluxStatusTagStreamCarry(carry: string): string {
  const lower = carry.toLowerCase();
  if (
    lower.startsWith(STATUS_TAG_PREFIX) ||
    STATUS_TAG_PREFIX.startsWith(lower) ||
    lower.startsWith(ADVISOR_REQUEST_TAG_PREFIX) ||
    ADVISOR_REQUEST_TAG_PREFIX.startsWith(lower) ||
    ADVISOR_REQUEST_LINE_PREFIXES.some(
      (prefix) => lower.startsWith(prefix) || prefix.startsWith(lower),
    )
  ) {
    return '';
  }
  return carry;
}

function clampConfidence(n: number): number | undefined {
  if (!Number.isFinite(n)) {
    return undefined;
  }
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 10) {
    return undefined;
  }
  return rounded;
}

function extractBalancedJsonObject(
  source: string,
  startIndex: number,
): string | undefined {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = startIndex; index < source.length; index++) {
    const ch = source[index];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

function tryParseEmbeddedJsonObject(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  for (
    let start = trimmed.indexOf('{');
    start !== -1;
    start = trimmed.indexOf('{', start + 1)
  ) {
    const candidate = extractBalancedJsonObject(trimmed, start);
    if (candidate === undefined) {
      continue;
    }
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Keep scanning; models sometimes emit prose before/after JSON.
    }
  }
  return undefined;
}

export type PolluxAdvisorParserSuccessOutcome =
  | 'direct'
  | 'recovered_fence'
  | 'recovered_substring'
  | 'plain_text_fallback';

export type PolluxAdvisorParserOutcome =
  | PolluxAdvisorParserSuccessOutcome
  | 'malformed_json'
  | 'schema'
  | 'empty_response';

interface ParsedJsonObjectCandidate {
  readonly value: unknown;
  readonly parserOutcome: PolluxAdvisorParserSuccessOutcome;
}

function tryParseJsonObject(
  raw: string,
): ParsedJsonObjectCandidate | undefined {
  const trimmed = raw.replace(/^\uFEFF/, '').trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return {
      value: JSON.parse(trimmed) as unknown,
      parserOutcome: 'direct',
    };
  } catch {
    const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
    if (fence?.[1]) {
      try {
        return {
          value: JSON.parse(fence[1].trim()) as unknown,
          parserOutcome: 'recovered_fence',
        };
      } catch {
        return undefined;
      }
    }
    const embedded = tryParseEmbeddedJsonObject(trimmed);
    if (embedded !== undefined) {
      return {
        value: embedded,
        parserOutcome: 'recovered_substring',
      };
    }
    return undefined;
  }
}

function stripAdvisorPlainText(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '').trim();
  const fence = /^```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```$/i.exec(text);
  if (fence?.[1]) {
    text = fence[1].trim();
  }
  return stripPolluxStatusTags(stripPolluxConfidenceTags(text));
}

function collectStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => stripPolluxStatusTags(stripPolluxConfidenceTags(entry)))
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

export type ParsedAdvisorModelResponse =
  | {
      readonly ok: true;
      readonly parserOutcome: PolluxAdvisorParserSuccessOutcome;
      /** Guidance safe for the executor path (tags stripped). */
      readonly guidance: string;
      /** From JSON `confidence`, else first valid embedded tag (1–10). */
      readonly structuredConfidence?: number;
      readonly mustInclude?: readonly string[];
      readonly mustForbid?: readonly string[];
      readonly verifyBeforeDone?: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: 'malformed_json' | 'schema' | 'empty_response';
      readonly parserOutcome: 'malformed_json' | 'schema' | 'empty_response';
      readonly detail?: string;
    };

/**
 * Parses and validates advisor model output. Fails closed (`ok: false`) when
 * JSON is invalid or does not match {@link POLLUX_ADVISOR_RESPONSE_SCHEMA}.
 * Strips confidence tags from `guidance` only after successful schema validation.
 */
export function parseAdvisorModelResponse(
  raw: string,
): ParsedAdvisorModelResponse {
  if (raw.replace(/^\uFEFF/, '').trim().length === 0) {
    return {
      ok: false,
      reason: 'empty_response',
      parserOutcome: 'empty_response',
    };
  }
  const tagValues = extractPolluxConfidenceTagValues(raw);
  const parsed = tryParseJsonObject(raw);
  if (parsed === undefined) {
    const fallback = stripAdvisorPlainText(raw);
    if (fallback.length > 0 && fallback.length <= ADVISOR_PLAINTEXT_MAX_CHARS) {
      return {
        ok: true,
        parserOutcome: 'plain_text_fallback',
        guidance: fallback,
        structuredConfidence: tagValues
          .map(clampConfidence)
          .find((value): value is number => value !== undefined),
      };
    }
    return {
      ok: false,
      reason: 'malformed_json',
      parserOutcome: 'malformed_json',
    };
  }
  if (!isPlainObject(parsed.value)) {
    return {
      ok: false,
      reason: 'malformed_json',
      parserOutcome: 'malformed_json',
    };
  }

  const schemaError = SchemaValidator.validate(
    POLLUX_ADVISOR_RESPONSE_SCHEMA as unknown,
    parsed.value,
  );
  if (schemaError !== null) {
    return {
      ok: false,
      reason: 'schema',
      parserOutcome: 'schema',
      detail: schemaError,
    };
  }

  const guidanceRaw = parsed.value['guidance'];
  if (typeof guidanceRaw !== 'string') {
    return {
      ok: false,
      reason: 'malformed_json',
      parserOutcome: 'malformed_json',
    };
  }

  const guidance = stripPolluxConfidenceTags(guidanceRaw);
  if (guidance.length < 1) {
    return {
      ok: false,
      reason: 'schema',
      parserOutcome: 'schema',
      detail: 'guidance empty after stripping tags',
    };
  }

  let structuredConfidence: number | undefined;
  const confRaw = parsed.value['confidence'];
  if (typeof confRaw === 'number') {
    structuredConfidence = clampConfidence(confRaw);
  }
  if (structuredConfidence === undefined) {
    for (const v of tagValues) {
      const c = clampConfidence(v);
      if (c !== undefined) {
        structuredConfidence = c;
        break;
      }
    }
  }

  const mustInclude = collectStringArray(parsed.value['must_include']);
  const mustForbid = collectStringArray(parsed.value['must_forbid']);
  const verifyBeforeDone = collectStringArray(
    parsed.value['verify_before_done'],
  );

  return {
    ok: true,
    parserOutcome: parsed.parserOutcome,
    guidance,
    structuredConfidence,
    ...(mustInclude === undefined ? {} : { mustInclude }),
    ...(mustForbid === undefined ? {} : { mustForbid }),
    ...(verifyBeforeDone === undefined ? {} : { verifyBeforeDone }),
  };
}

function buildAdvisorContractLines(
  mode: AdvisorConsultationMode | undefined,
  advisorExecutorProfile: PolluxAdvisorExecutorProfile = 'default',
) {
  if (advisorExecutorProfile === 'strict_fd') {
    const label =
      mode === 'final_audit'
        ? 'strict final diff audit'
        : mode === 'constraint_audit'
          ? 'strict checkpoint audit'
          : 'strict Flash-plus-advisor checkpoint guidance';
    return [
      `Mode: ${label}`,
      'You are the stronger advisor for a strict Flash-plus-advisor checkpoint. Give concrete patch-level guidance the executor can apply immediately.',
      'FD here means Flash executor plus Pro advisor condition. It does not mean file descriptors.',
      'Return strict JSON: {"guidance":"1. ... 2. ...","must_include":["..."],"must_forbid":["..."],"verify_before_done":["..."],"confidence":1-10}',
      'Ground every item in the current repository, task id, language, benchmark task title or instruction summary, checkpoint reason, and pending tool/diff context.',
      'If your guidance mentions files/APIs unrelated to the current repository, task, or language, the response is invalid.',
      'For Go tasks, require final checks where appropriate: gofmt, focused go test, no imports after declarations, and no unused imports.',
      'Target 120-260 words. Use exact files, APIs, invariants, old/new value directions, and forbidden implementation patterns from the context.',
      'Every array must contain at least one specific item. Prefer executable checks and hidden-test hazards over broad advice.',
      'No markdown. No user-facing prose. No code block unless an exact one-line pattern is essential.',
    ];
  }
  if (advisorExecutorProfile === 'flash_lite') {
    const label =
      mode === 'final_audit'
        ? 'final constraint audit'
        : mode === 'constraint_audit'
          ? 'constraint audit'
          : 'flash-lite execution audit';
    return [
      `Mode: ${label}`,
      'You are the stronger advisor for a weaker Flash-Lite executor. Give patch-level, executor-safe strategy.',
      'Return strict JSON: {"guidance":"1. ... 2. ...","must_include":["..."],"must_forbid":["..."],"verify_before_done":["..."],"confidence":1-10}',
      'Target 120-220 words. Use concrete file names, required invariants, and exact forbidden edits/patterns from the task.',
      'Prefer direct implementation constraints over abstract advice. Mention protected tests/docs/readmes and negative constraints explicitly.',
      'No markdown. No user-facing prose. No code block unless an exact one-line pattern is essential.',
    ];
  }
  if (mode === 'constraint_audit' || mode === 'final_audit') {
    const label =
      mode === 'final_audit' ? 'final constraint audit' : 'constraint audit';
    return [
      `Mode: ${label}`,
      'You are the stronger advisor. Give only executor-safe strategy.',
      'Return compact JSON: {"guidance":"1. ... 2. ...","must_include":["..."],"must_forbid":["..."],"verify_before_done":["..."],"confidence":1-10}',
      'Keep total output under 160 words. Use numbered steps and short checklists.',
      'Focus on structural constraints the executor is likely to miss.',
      'No markdown. No user-facing prose.',
    ];
  }
  return [
    'You are the stronger advisor. Give only executor-safe strategy.',
    'Return compact JSON: {"guidance":"1. ... 2. ...","confidence":1-10}',
    'Guidance must be under 100 words. Use numbered steps, not explanations.',
    'No markdown. No code unless essential. No user-facing prose.',
  ];
}

/**
 * Builds the user message body for an advisor_consultation request instructing
 * strict JSON-only output.
 */
export function buildAdvisorConsultationPrompt(
  input: AdvisorConsultationInput,
): string {
  const strictFdGroundingLines =
    input.advisorExecutorProfile === 'strict_fd'
      ? [
          '',
          'Strict Flash-plus-advisor grounding fields to use from context:',
          '- repository',
          '- task id',
          '- language',
          '- benchmark task title or instruction summary',
          '- current checkpoint reason',
          '- pending tool/diff context',
        ]
      : [];
  const lines = [
    `Tool: ${ADVISOR_CONSULTATION_TOOL_NAME}`,
    ...buildAdvisorContractLines(input.mode, input.advisorExecutorProfile),
    ...strictFdGroundingLines,
    '',
    'Context:',
    input.body,
  ];
  return lines.join('\n');
}

/**
 * Builds a bounded repair prompt when the prior advisor output was empty or
 * malformed. The contract remains strict JSON matching the original schema.
 */
export function buildAdvisorConsultationRepairPrompt(params: {
  input: AdvisorConsultationInput;
  previousResponse: string;
  previousFailure:
    | 'malformed_json'
    | 'schema'
    | 'empty_response'
    | 'parse_error';
}): string {
  const lines = [
    buildAdvisorConsultationPrompt(params.input),
    '',
    'Your previous response could not be accepted.',
    `Failure: ${params.previousFailure}`,
    'Re-emit exactly one valid JSON object that matches the schema above.',
    'Do not include markdown fences, commentary, or any text before or after the JSON object.',
  ];

  const previous = params.previousResponse.replace(/^\uFEFF/, '').trim();
  if (previous.length > 0) {
    lines.push('', 'Previous response:', previous.slice(0, 4000));
  }

  return lines.join('\n');
}
