import { formatShade, renderShade } from '../../src/color.mjs';
import { registry } from '../../src/registry.mjs';
import * as compatibility from '../../src/compatibility.mjs';
import { primaryShade } from '../../src/theme.mjs';

for (const shade of ['COBALT', 'AMBER', 'SLATE']) {
  if (renderShade(shade) !== `shade:${shade.toLowerCase()}`) throw new Error('canonical failed');
  if (formatShade(shade) !== renderShade(shade)) throw new Error('alias failed');
  if (registry.renderShade(shade) !== renderShade(shade)) throw new Error('registry canonical failed');
  if (registry.formatShade(shade) !== renderShade(shade)) throw new Error('registry alias failed');
  if (compatibility.renderShade(shade) !== renderShade(shade)) throw new Error('compat canonical failed');
  if (compatibility.formatShade(shade) !== renderShade(shade)) throw new Error('compat alias failed');
}

if (primaryShade !== 'shade:cobalt') throw new Error('internal theme failed');
if (registry.canonical !== 'renderShade') throw new Error('registry canonical metadata failed');
if (!registry.compatibilityAliases.includes('formatShade')) throw new Error('registry alias metadata failed');
