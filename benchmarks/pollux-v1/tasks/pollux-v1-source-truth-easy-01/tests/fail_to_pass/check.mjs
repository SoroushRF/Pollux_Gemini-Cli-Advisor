import { runtimeMode } from '../../src/runtime.mjs';

if (runtimeMode !== 'live') {
  throw new Error('runtime mode must follow config');
}

