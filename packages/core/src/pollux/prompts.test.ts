/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  buildAdvisorConsultationPrompt,
  buildAdvisorConsultationRepairPrompt,
  extractPolluxConfidenceTagValues,
  parsePolluxAdvisorRequestTag,
  parsePolluxStatusTag,
  parseAdvisorModelResponse,
  flushPolluxStatusTagStreamCarry,
  stripPolluxStatusTagsFromStreamChunk,
  stripPolluxConfidenceTags,
  stripPolluxStatusTags,
} from './prompts.js';
import {
  ADVISOR_CONSULTATION_TOOL_NAME,
  PolluxRuntimeSurface,
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  type AdvisorConsultationInput,
} from './types.js';

function minimalInput(body: string): AdvisorConsultationInput {
  return {
    context: {
      surface: PolluxRuntimeSurface.LEGACY_INTERACTIVE,
      sessionId: 's',
      turnId: 't',
      experimental: DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
      advisorCallsThisTurn: 0,
      advisorCallsThisSession: 0,
    },
    toolName: ADVISOR_CONSULTATION_TOOL_NAME,
    body,
  };
}

describe('pollux/prompts', () => {
  describe('stripPolluxConfidenceTags / extractPolluxConfidenceTagValues', () => {
    it('strips HTML comments and XML-style tags', () => {
      expect(
        stripPolluxConfidenceTags(
          'Hello <!-- pollux:confidence:7 --> world <pollux:confidence value="9"/> end',
        ),
      ).toBe('Hello world end');
    });

    it('extracts tag values in order', () => {
      expect(
        extractPolluxConfidenceTagValues(
          'x <!-- pollux:confidence:3 --> y <pollux:confidence value="8"/>',
        ),
      ).toEqual([3, 8]);
    });
  });

  describe('parsePolluxStatusTag / stripPolluxStatusTags', () => {
    it('parses multiple tags and preserves document order', () => {
      const tags = parsePolluxStatusTag(
        'a <pollux:status stuck_on="first obstacle" next="x"/> b <pollux:status stuck_on="second obstacle" next="y"/>',
      );
      expect(tags).toEqual([
        { stuckOn: 'first obstacle', next: 'x' },
        { stuckOn: 'second obstacle', next: 'y' },
      ]);
    });

    it('parses attribute order variations and missing attributes', () => {
      expect(
        parsePolluxStatusTag('<pollux:status next="n" stuck_on="stuck here"/>'),
      ).toEqual([{ stuckOn: 'stuck here', next: 'n' }]);
      expect(parsePolluxStatusTag('<pollux:status stuck_on="only"/>')).toEqual([
        { stuckOn: 'only', next: undefined },
      ]);
    });

    it('ignores malformed tags and does not throw', () => {
      expect(parsePolluxStatusTag('no tags here')).toEqual([]);
      expect(parsePolluxStatusTag('<pollux:status stuck_on=>')).toEqual([
        { stuckOn: undefined, next: undefined },
      ]);
    });

    it('strips tags in both attribute orderings (leakage guard)', () => {
      expect(
        stripPolluxStatusTags('x <pollux:status stuck_on="a b" next="c"/> y'),
      ).toBe('x y');
      expect(
        stripPolluxStatusTags('x <pollux:status next="c" stuck_on="a b"/> y'),
      ).toBe('x y');
      expect(
        stripPolluxStatusTags(
          'x <pollux:advisor_request reason="need plan" timing="now"/> y',
        ),
      ).toBe('x y');
    });

    it('interleaves cleanly with confidence tags (confidence behavior unchanged)', () => {
      const raw =
        'x <pollux:status stuck_on="a b" next="c"/> <!-- pollux:confidence:3 --> y';
      expect(stripPolluxStatusTags(stripPolluxConfidenceTags(raw))).toBe('x y');
      expect(extractPolluxConfidenceTagValues(raw)).toEqual([3]);
    });

    it('keeps malformed no-space status tags out of the valid parser', () => {
      const raw =
        '<pollux:statusstuck_on="refactor strategy" next="write marker"/>';
      expect(parsePolluxStatusTag(raw)).toEqual([]);
      expect(stripPolluxStatusTags(raw)).toBe(raw);
    });

    it('strips valid status tags split across streamed content chunks', () => {
      const first = stripPolluxStatusTagsFromStreamChunk(
        'Checking <pollux:sta',
      );
      expect(first).toEqual({ output: 'Checking', carry: '<pollux:sta' });

      const second = stripPolluxStatusTagsFromStreamChunk(
        'tus stuck_on="ci fails on windows"',
        first.carry,
      );
      expect(second).toEqual({
        output: '',
        carry: '<pollux:status stuck_on="ci fails on windows"',
      });

      const third = stripPolluxStatusTagsFromStreamChunk(
        ' next="inspect logs"/> done',
        second.carry,
      );
      expect(third).toEqual({ output: 'done', carry: '' });
      expect(flushPolluxStatusTagStreamCarry(third.carry)).toBe('');
    });

    it('does not silently strip malformed streamed status near-misses', () => {
      const chunk = stripPolluxStatusTagsFromStreamChunk(
        '<pollux:statusstuck_on="bad" next="x"/>',
      );
      expect(chunk.output).toBe('<pollux:statusstuck_on="bad" next="x"/>');
      expect(chunk.carry).toBe('');
    });
  });

  describe('parsePolluxAdvisorRequestTag', () => {
    it('parses advisor self-request tags in document order', () => {
      expect(
        parsePolluxAdvisorRequestTag(
          'x <pollux:advisor_request reason="need alias map before edit" timing="now"/> y <pollux:advisor_request reason="final review" timing="next"/>',
        ),
      ).toEqual([
        { reason: 'need alias map before edit', timing: 'now' },
        { reason: 'final review', timing: 'next' },
      ]);
    });

    it('tolerates missing attributes and ignores malformed near-misses', () => {
      expect(
        parsePolluxAdvisorRequestTag('<pollux:advisor_request reason="risk"/>'),
      ).toEqual([{ reason: 'risk', timing: undefined }]);
      expect(
        parsePolluxAdvisorRequestTag(
          '<pollux:advisor_requestreason="not valid"/>',
        ),
      ).toEqual([]);
    });
  });

  describe('parseAdvisorModelResponse', () => {
    it('accepts minimal valid JSON', () => {
      const r = parseAdvisorModelResponse('{"guidance":"Use the left file."}');
      expect(r).toEqual({
        ok: true,
        parserOutcome: 'direct',
        guidance: 'Use the left file.',
        structuredConfidence: undefined,
      });
    });

    it('accepts short plaintext fallback when JSON parsing fails', () => {
      expect(
        parseAdvisorModelResponse('1. Inspect aliases. 2. Patch export.'),
      ).toMatchObject({
        ok: true,
        parserOutcome: 'plain_text_fallback',
        guidance: '1. Inspect aliases. 2. Patch export.',
      });
      expect(parseAdvisorModelResponse('{')).toMatchObject({
        ok: true,
        parserOutcome: 'plain_text_fallback',
        guidance: '{',
      });
    });

    it('rejects long plaintext fallback', () => {
      expect(parseAdvisorModelResponse('x'.repeat(1201))).toMatchObject({
        ok: false,
        reason: 'malformed_json',
        parserOutcome: 'malformed_json',
      });
    });

    it('classifies empty responses explicitly', () => {
      expect(parseAdvisorModelResponse('')).toMatchObject({
        ok: false,
        reason: 'empty_response',
        parserOutcome: 'empty_response',
      });
    });

    it('fails closed on schema violations', () => {
      const r = parseAdvisorModelResponse('{"guidance":"","confidence":5}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('schema');
    });

    it('rejects extra properties', () => {
      const r = parseAdvisorModelResponse('{"guidance":"ok","extra":1}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('schema');
    });

    it('strips confidence tags inside guidance string', () => {
      const r = parseAdvisorModelResponse(
        '{"guidance":"<!-- pollux:confidence:6 -->Next step: run tests."}',
      );
      expect(r).toEqual({
        ok: true,
        parserOutcome: 'direct',
        guidance: 'Next step: run tests.',
        structuredConfidence: 6,
      });
    });

    it('uses JSON confidence when present', () => {
      const r = parseAdvisorModelResponse('{"guidance":"x","confidence":4}');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.structuredConfidence).toBe(4);
    });

    it('parses fenced JSON when model wraps output', () => {
      const r = parseAdvisorModelResponse(
        '```json\n{"guidance":"fenced"}\n```',
      );
      expect(r).toEqual({
        ok: true,
        parserOutcome: 'recovered_fence',
        guidance: 'fenced',
        structuredConfidence: undefined,
      });
    });

    it('parses JSON when the model prepends pollux status and prose', () => {
      const r = parseAdvisorModelResponse(
        'I will respond with JSON.\n<pollux:status stuck_on="refactor strategy" next="write marker"/>\n{"guidance":"Proceed with write_file.","confidence":9}',
      );
      expect(r).toEqual({
        ok: true,
        parserOutcome: 'recovered_substring',
        guidance: 'Proceed with write_file.',
        structuredConfidence: 9,
      });
    });
  });

  describe('buildAdvisorConsultationPrompt', () => {
    it('includes compact advisor contract and payload', () => {
      const p = buildAdvisorConsultationPrompt(minimalInput('summarize'));
      expect(p).toContain(ADVISOR_CONSULTATION_TOOL_NAME);
      expect(p).toContain('"guidance"');
      expect(p).toContain('under 100 words');
      expect(p).toContain('Context:');
      expect(p).not.toContain('JSON Schema');
      expect(p.endsWith('summarize')).toBe(true);
    });
  });

  describe('buildAdvisorConsultationRepairPrompt', () => {
    it('includes the original contract and invalid response context', () => {
      const p = buildAdvisorConsultationRepairPrompt({
        input: minimalInput('summarize'),
        previousResponse: '```json\n{"oops":true}\n```',
        previousFailure: 'parse_error',
      });
      expect(p).toContain('Your previous response could not be accepted.');
      expect(p).toContain('Failure: parse_error');
      expect(p).toContain('Previous response:');
      expect(p).toContain('"oops"');
    });
  });
});
