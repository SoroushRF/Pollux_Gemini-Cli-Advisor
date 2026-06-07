import { compatibility, formatShade, renderShade } from '../../src/color.mjs';
import { registry } from '../../src/registry.mjs';
import { primaryShade } from '../../src/theme.mjs';

for (const shade of ['COBALT', 'AMBER', 'SLATE']) {
  if (renderShade(shade) !== `shade:${shade.toLowerCase()}`) {
    throw new Error(`renderShade failed for ${shade}`);
  }
  if (formatShade(shade) !== `shade:${shade.toLowerCase()}`) {
    throw new Error(`formatShade alias failed for ${shade}`);
  }
}
if (primaryShade !== 'shade:cobalt') throw new Error('theme migration failed');
if (registry.renderShade('AMBER') !== 'shade:amber') throw new Error('registry canonical key failed');
if (registry.formatShade('AMBER') !== 'shade:amber') throw new Error('registry compat key failed');
if (compatibility.formatShade('SLATE') !== 'shade:slate') throw new Error('compatibility surface failed');
