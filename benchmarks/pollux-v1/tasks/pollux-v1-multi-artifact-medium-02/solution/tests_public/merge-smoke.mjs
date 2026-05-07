import { mergeConfig } from '../src/mergeConfig.mjs';

const merged = mergeConfig({ mode: 'a', features: ['one'] }, { mode: 'b' }, []);
if (merged.mode !== 'b') {
  throw new Error('public merge mode failed');
}
