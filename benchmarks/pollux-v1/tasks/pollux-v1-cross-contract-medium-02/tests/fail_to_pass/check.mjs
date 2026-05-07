import { createLabel, createStableLabel } from '../../src/index.mjs';
import { label } from '../../src/view.mjs';
import { auditLabels } from '../../src/audit.mjs';

if (createStableLabel(' ADA ') !== 'stable:ada') throw new Error('canonical trim/lowercase failed');
if (createLabel(' LIN ') !== 'stable:lin') throw new Error('compat alias failed');
if (label !== 'stable:pollux') throw new Error('view contract failed');

const audit = auditLabels(' MIA ');
if (audit.canonical !== 'stable:mia') throw new Error('audit canonical failed');
if (audit.compat !== 'stable:mia') throw new Error('audit compat failed');
