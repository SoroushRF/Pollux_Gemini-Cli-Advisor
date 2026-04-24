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
import type { AdvisorConsultationInput } from './types.js';
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
  },
} as const satisfies AnySchema;

const CONFIDENCE_COMMENT_RE = /<!--\s*pollux:confidence:\s*(\d+)\s*-->/gi;

const CONFIDENCE_XML_RE = /<pollux:confidence\b[^>]*\bvalue="(\d+)"[^>]*\/?>/gi;

const STATUS_TAG_RE = /<pollux:status\b[^>]*\/?>/gi;
const STATUS_TAG_PREFIX = '<pollux:status';

const STATUS_STUCK_ON_RE = /\bstuck_on\s*=\s*"([^"]*)"/i;
const STATUS_NEXT_RE = /\bnext\s*=\s*"([^"]*)"/i;

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

/**
 * Removes Pollux status tags from free text (DETECTOR_IMPLEMENTATION_PLAN Phase E).
 */
export function stripPolluxStatusTags(text: string): string {
  return text
    .replace(STATUS_TAG_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function findTrailingStatusTagCarryIndex(text: string): number {
  const partialTag = /<pollux:status\b[^>]*$/i.exec(text);
  if (partialTag) {
    return partialTag.index;
  }

  const lower = text.toLowerCase();
  const maxPrefixLength = Math.min(STATUS_TAG_PREFIX.length, lower.length);
  for (let length = maxPrefixLength; length > 0; length -= 1) {
    const suffix = lower.slice(lower.length - length);
    if (STATUS_TAG_PREFIX.startsWith(suffix)) {
      return lower.length - length;
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
    STATUS_TAG_PREFIX.startsWith(lower)
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
  | 'recovered_substring';

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

export type ParsedAdvisorModelResponse =
  | {
      readonly ok: true;
      readonly parserOutcome: PolluxAdvisorParserSuccessOutcome;
      /** Guidance safe for the executor path (tags stripped). */
      readonly guidance: string;
      /** From JSON `confidence`, else first valid embedded tag (1–10). */
      readonly structuredConfidence?: number;
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

  return {
    ok: true,
    parserOutcome: parsed.parserOutcome,
    guidance,
    structuredConfidence,
  };
}

/**
 * Builds the user message body for an advisor_consultation request instructing
 * strict JSON-only output.
 */
export function buildAdvisorConsultationPrompt(
  input: AdvisorConsultationInput,
): string {
  const lines = [
    `Tool: ${ADVISOR_CONSULTATION_TOOL_NAME}`,
    '',
    'Respond with a single JSON object only (no markdown fences, no prose before or after).',
    'Schema:',
    JSON.stringify(POLLUX_ADVISOR_RESPONSE_SCHEMA, undefined, 2),
    '',
    'You may embed <!-- pollux:confidence:N --> (N=1..10) inside the guidance string; tags are stripped before the executor sees guidance.',
    '',
    'Consultation payload:',
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
