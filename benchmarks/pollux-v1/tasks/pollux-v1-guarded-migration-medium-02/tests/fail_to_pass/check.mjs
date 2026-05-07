import { stableGate, legacyGate } from '../../src/flags.mjs';
import { gates } from '../../src/registry.mjs';
import { enabled } from '../../src/app.mjs';
import { legacyGate as compatLegacyGate } from '../../src/compat.mjs';

for (const user of [{ beta: true }, { beta: false }]) {
  if (stableGate(user) !== (user.beta === true)) throw new Error('stableGate behavior failed');
  if (legacyGate(user) !== stableGate(user)) throw new Error('legacy alias failed');
  if (compatLegacyGate(user) !== stableGate(user)) throw new Error('compat surface failed');
}

if (!gates.stableGate({ beta: true })) throw new Error('registry canonical failed');
if (enabled !== true) throw new Error('internal app usage failed');
