import { buildName } from '../../src/name.mjs';

if (buildName('LIN') !== 'name:lin') {
  throw new Error('compat alias behavior changed');
}

