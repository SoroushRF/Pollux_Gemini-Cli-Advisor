import { stableGate } from '../../src/flags.mjs';
import { gates } from '../../src/registry.mjs';
import { enabled } from '../../src/app.mjs';

if (!stableGate({ beta: true })) throw new Error('stableGate behavior failed');
if (stableGate({ beta: false })) throw new Error('stableGate false case failed');
if (!gates.stableGate({ beta: true })) throw new Error('registry failed');
if (enabled !== true) throw new Error('app failed');

