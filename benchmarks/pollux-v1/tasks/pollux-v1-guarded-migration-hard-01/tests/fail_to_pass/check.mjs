import { formatShade, renderShade } from '../../src/color.mjs';
import { primaryShade } from '../../src/theme.mjs';

if (renderShade('COBALT') !== 'shade:cobalt') {
  throw new Error('canonical shade mismatch');
}
if (formatShade('COBALT') !== 'shade:cobalt') {
  throw new Error('compat alias mismatch');
}
if (primaryShade !== 'shade:cobalt') {
  throw new Error('theme usage mismatch');
}

