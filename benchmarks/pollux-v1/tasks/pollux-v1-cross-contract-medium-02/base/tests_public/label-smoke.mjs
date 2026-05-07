import { createLabel } from '../src/index.mjs';

if (createLabel('Ada') !== 'stable:ada') {
  throw new Error('public compatibility label failed');
}
