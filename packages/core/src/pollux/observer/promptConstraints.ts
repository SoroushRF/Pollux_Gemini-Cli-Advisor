/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PromptConstraintSummary } from './sensors/base.js';

const PATH_TOKEN_RE =
  /\b(?:[a-z0-9_.-]+\/)+[a-z0-9_.-]+\b|\b[a-z0-9_.-]+\.(?:[a-z0-9_.-]+)\b/gi;
const MUTATION_PROTECTED_SENTENCE_RE =
  /\b(do not edit|do not modify|do not weaken|are protected|is protected|protected|preserve the input files|preserve input files)\b/i;
const DO_NOT_CHANGE_RE = /\bdo not change\b/i;
const SOURCE_OF_TRUTH_RE = /\bsource of truth\b/i;
const TEST_PATH_RE = /(^|\/)(tests?|__tests__)(\/|$)|\.test\.[a-z0-9]+$/i;
const DOC_PATH_RE = /(^|\/)(docs?|rules)(\/|$)|(^|\/)readme(?:\.[a-z0-9]+)?$/i;
const CONFIG_PATH_RE = /(^|\/)(config|configs)(\/|$)|\.json$/i;
const DATA_OR_RULE_PATH_RE = /(^|\/)(data|rules|plans)(\/|$)|\.txt$/i;
const SOURCE_PATH_RE = /(^|\/)src(\/|$)|\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;
const PUBLIC_INTERFACE_RE =
  /\b(public index|public api|external callers|external compatibility|compatibility alias|compat alias|facade)\b/i;
const BEHAVIOR_PRESERVATION_RE =
  /\b(preserve behavior|preserves? .* behavior|keeping .* available|keep .* available|without weakening|do not change .* behavior|preserve .* formula|preserve terminal-state behavior)\b/i;
const COMPATIBILITY_ALIAS_RE =
  /\b(compatibility alias|compat alias|old alias .* compatibility|keep .* exported|keeping .* facade|legacy .* facade|facade available|external compatibility|alias-preserving)\b/i;
const CROSS_FILE_RE =
  /\b(across (?:all )?source files|source files only|through the public index|source of truth|transitive import\/export|transitive import|cross-file|compatibility alias|public index|internal source usage|rename .* across|update internal source usage|cascade contract)\b/i;

export function normalizePromptPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '');
}

function extractPathTokens(text: string): string[] {
  const matches = text.match(PATH_TOKEN_RE) ?? [];
  const normalized = new Set<string>();
  for (const match of matches) {
    normalized.add(normalizePromptPath(match));
  }
  return [...normalized];
}

function isProtectedTestOrDocPath(path: string): boolean {
  return (
    TEST_PATH_RE.test(path) ||
    DOC_PATH_RE.test(path) ||
    CONFIG_PATH_RE.test(path)
  );
}

function isSourcePath(path: string): boolean {
  return SOURCE_PATH_RE.test(path);
}

function isAnchorInputPath(path: string): boolean {
  return (
    TEST_PATH_RE.test(path) ||
    DOC_PATH_RE.test(path) ||
    CONFIG_PATH_RE.test(path) ||
    DATA_OR_RULE_PATH_RE.test(path)
  );
}

function splitPromptIntoSentences(text: string): string[] {
  return text
    .split(/[\n\r]+|(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function addReferencedByNoun(
  lowerSentence: string,
  referencedPaths: readonly string[],
  mutationProtectedPaths: Set<string>,
  sourceOfTruthPaths: Set<string>,
): void {
  const mentionsTest = /\bthe test\b|\bthe tests\b|\btests?\b/i.test(
    lowerSentence,
  );
  const mentionsReadme = /\breadme\b/i.test(lowerSentence);
  const mentionsDocs = /\bdocs?\b/i.test(lowerSentence);
  const mentionsConfig = /\bconfig\b/i.test(lowerSentence);
  const mentionsInputFiles =
    /\binput files?\b|\bpreserve the input files\b/i.test(lowerSentence);

  for (const path of referencedPaths) {
    if (mentionsTest && TEST_PATH_RE.test(path)) {
      mutationProtectedPaths.add(path);
      sourceOfTruthPaths.add(path);
    }
    if (mentionsReadme && /(^|\/)readme(?:\.[a-z0-9]+)?$/i.test(path)) {
      mutationProtectedPaths.add(path);
      sourceOfTruthPaths.add(path);
    }
    if (mentionsDocs && DOC_PATH_RE.test(path)) {
      mutationProtectedPaths.add(path);
      sourceOfTruthPaths.add(path);
    }
    if (mentionsConfig && CONFIG_PATH_RE.test(path)) {
      mutationProtectedPaths.add(path);
      sourceOfTruthPaths.add(path);
    }
    if (mentionsInputFiles && isAnchorInputPath(path)) {
      mutationProtectedPaths.add(path);
      sourceOfTruthPaths.add(path);
    }
  }

  if (mentionsReadme) {
    mutationProtectedPaths.add('README.md');
    sourceOfTruthPaths.add('README.md');
  }
}

function classifySentencePaths(
  sentence: string,
  referencedPaths: readonly string[],
  mutationProtectedPaths: Set<string>,
  behaviorAnchorPaths: Set<string>,
  sourceOfTruthPaths: Set<string>,
): void {
  const paths = extractPathTokens(sentence);
  const lowerSentence = sentence.toLowerCase();
  const hasMutationProtection =
    MUTATION_PROTECTED_SENTENCE_RE.test(sentence) ||
    (DO_NOT_CHANGE_RE.test(sentence) && !/\bbehavior\b/i.test(sentence));
  const hasBehaviorProtection =
    BEHAVIOR_PRESERVATION_RE.test(sentence) ||
    (DO_NOT_CHANGE_RE.test(sentence) && /\bbehavior\b/i.test(sentence));
  const hasSourceOfTruth = SOURCE_OF_TRUTH_RE.test(sentence);

  if (hasBehaviorProtection) {
    for (const path of paths) {
      if (isSourcePath(path) && !isProtectedTestOrDocPath(path)) {
        behaviorAnchorPaths.add(path);
      }
    }
  }

  if (hasSourceOfTruth) {
    for (const path of paths) {
      if (isAnchorInputPath(path)) {
        sourceOfTruthPaths.add(path);
      }
    }
  }

  if (hasMutationProtection) {
    for (const path of paths) {
      if (
        hasBehaviorProtection &&
        isSourcePath(path) &&
        !isAnchorInputPath(path)
      ) {
        behaviorAnchorPaths.add(path);
        continue;
      }
      mutationProtectedPaths.add(path);
      if (isAnchorInputPath(path) || hasSourceOfTruth) {
        sourceOfTruthPaths.add(path);
      }
    }
    addReferencedByNoun(
      lowerSentence,
      referencedPaths,
      mutationProtectedPaths,
      sourceOfTruthPaths,
    );
    return;
  }

  if (hasSourceOfTruth || hasBehaviorProtection) {
    addReferencedByNoun(
      lowerSentence,
      referencedPaths,
      mutationProtectedPaths,
      sourceOfTruthPaths,
    );
  }
}

export function parsePromptConstraintSummary(
  userPromptText?: string,
): PromptConstraintSummary {
  const prompt = userPromptText?.trim() ?? '';
  if (prompt.length === 0) {
    return {
      mutationProtectedPaths: [],
      behaviorAnchorPaths: [],
      sourceOfTruthPaths: [],
      referencedPaths: [],
      hasProtectedTestsOrDocs: false,
      hasPublicInterfaceConstraint: false,
      hasBehaviorPreservationConstraint: false,
      hasCrossFileRepairConstraint: false,
      hasCompatibilityAliasConstraint: false,
    };
  }

  const normalizedPrompt = prompt.replace(/\\/g, '/');
  const referencedPaths = extractPathTokens(normalizedPrompt);
  const mutationProtectedPaths = new Set<string>();
  const behaviorAnchorPaths = new Set<string>();
  const sourceOfTruthPaths = new Set<string>();

  for (const sentence of splitPromptIntoSentences(normalizedPrompt)) {
    classifySentencePaths(
      sentence,
      referencedPaths,
      mutationProtectedPaths,
      behaviorAnchorPaths,
      sourceOfTruthPaths,
    );
  }

  const hasPublicInterfaceConstraint =
    PUBLIC_INTERFACE_RE.test(normalizedPrompt);
  const hasBehaviorPreservationConstraint =
    BEHAVIOR_PRESERVATION_RE.test(normalizedPrompt);
  const hasCompatibilityAliasConstraint =
    COMPATIBILITY_ALIAS_RE.test(normalizedPrompt);
  const hasCrossFileRepairConstraint =
    referencedPaths.length >= 2 &&
    (CROSS_FILE_RE.test(normalizedPrompt) ||
      hasPublicInterfaceConstraint ||
      hasCompatibilityAliasConstraint);
  const mutationProtectedPathsArray = [...mutationProtectedPaths];

  return {
    mutationProtectedPaths: mutationProtectedPathsArray,
    behaviorAnchorPaths: [...behaviorAnchorPaths],
    sourceOfTruthPaths: [...sourceOfTruthPaths],
    referencedPaths,
    hasProtectedTestsOrDocs: mutationProtectedPathsArray.some(
      isProtectedTestOrDocPath,
    ),
    hasPublicInterfaceConstraint,
    hasBehaviorPreservationConstraint,
    hasCrossFileRepairConstraint,
    hasCompatibilityAliasConstraint,
  };
}
