import { formatShade } from '../src/color.mjs';

if (formatShade('COBALT') !== 'shade:cobalt') {
  throw new Error('compat formatter smoke failed');
}
