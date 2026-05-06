import { buildName, createName } from '../../src/name.mjs';
import { displayName } from '../../src/display.mjs';

if (createName('Ada') !== 'name:ada') throw new Error('canonical failed');
if (buildName('Ada') !== 'name:ada') throw new Error('alias failed');
if (displayName !== 'name:pollux') throw new Error('internal usage failed');

