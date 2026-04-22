/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POLLUX_DETECTOR_CONFIG,
  mergePolluxExperimentalConfig,
} from '@google/gemini-cli-core';
import { getSettingsSchema } from './settingsSchema.js';

describe('Pollux TG-5 schema ↔ ConfigParameters mapping', () => {
  it('every experimental.pollux schema property key maps through mergePolluxExperimentalConfig', () => {
    const polluxSchema = getSettingsSchema().experimental.properties.pollux;
    expect(polluxSchema?.type).toBe('object');
    const keys = Object.keys(polluxSchema.properties ?? {});
    const merged = mergePolluxExperimentalConfig({});
    for (const key of keys) {
      expect(merged).toHaveProperty(key);
    }
    expect(Object.keys(merged).sort()).toEqual([...keys].sort());
  });

  it('maps experimental.pollux.detector subtree keys through mergePolluxExperimentalConfig', () => {
    const polluxSchema = getSettingsSchema().experimental.properties.pollux;
    const detectorSchema = polluxSchema.properties?.detector;
    expect(detectorSchema?.type).toBe('object');
    const subtreeKeys = Object.keys(detectorSchema?.properties ?? {});
    const merged = mergePolluxExperimentalConfig({});
    for (const key of subtreeKeys) {
      expect(merged.detector).toHaveProperty(key);
    }
    expect(merged.detector).toEqual(DEFAULT_POLLUX_DETECTOR_CONFIG);
  });
});
