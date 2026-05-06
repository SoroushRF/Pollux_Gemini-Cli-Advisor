import { formatShade, renderShade } from '../../src/color.mjs';

if (renderShade('AZURE') !== 'shade:azure') {
  throw new Error('canonical shade second case mismatch');
}
if (formatShade('AZURE') !== 'shade:azure') {
  throw new Error('compat shade second case mismatch');
}

