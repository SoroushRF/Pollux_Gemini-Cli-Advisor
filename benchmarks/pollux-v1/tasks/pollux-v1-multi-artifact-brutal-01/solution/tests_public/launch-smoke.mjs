import { launchKey } from '../src/launch.mjs';

if (launchKey !== 'atlas') {
  throw new Error('public launch selection smoke failed');
}
