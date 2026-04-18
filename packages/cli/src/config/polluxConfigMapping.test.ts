/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  mergePolluxExperimentalConfig,
  PolluxDetectorStrategy,
  type PolluxExperimentalConfig,
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

  it('rejects invalid strategy values by falling back to default', () => {
    const merged = mergePolluxExperimentalConfig({
      strategy: 'invalid' as PolluxExperimentalConfig['strategy'],
    });
    expect(merged.strategy).toBe(PolluxDetectorStrategy.HYBRID);
  });
});
