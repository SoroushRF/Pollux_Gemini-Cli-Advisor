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

function tryParseJsonObject(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
    if (fence?.[1]) {
      try {
        return JSON.parse(fence[1].trim()) as unknown;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export type ParsedAdvisorModelResponse =
  | {
      readonly ok: true;
      /** Guidance safe for the executor path (tags stripped). */
      readonly guidance: string;
      /** From JSON `confidence`, else first valid embedded tag (1–10). */
      readonly structuredConfidence?: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'malformed_json' | 'schema';
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
  const tagValues = extractPolluxConfidenceTagValues(raw);
  const parsed = tryParseJsonObject(raw);
  if (parsed === undefined) {
    return { ok: false, reason: 'malformed_json' };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: 'malformed_json' };
  }

  const schemaError = SchemaValidator.validate(
    POLLUX_ADVISOR_RESPONSE_SCHEMA as unknown,
    parsed,
  );
  if (schemaError !== null) {
    return { ok: false, reason: 'schema', detail: schemaError };
  }

  const guidanceRaw = parsed['guidance'];
  if (typeof guidanceRaw !== 'string') {
    return { ok: false, reason: 'malformed_json' };
  }

  const guidance = stripPolluxConfidenceTags(guidanceRaw);
  if (guidance.length < 1) {
    return {
      ok: false,
      reason: 'schema',
      detail: 'guidance empty after stripping tags',
    };
  }

  let structuredConfidence: number | undefined;
  const confRaw = parsed['confidence'];
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
