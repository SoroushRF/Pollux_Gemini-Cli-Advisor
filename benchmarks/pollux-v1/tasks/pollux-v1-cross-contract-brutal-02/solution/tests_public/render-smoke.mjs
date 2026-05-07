import { renderUser } from '../src/renderer.mjs';

if (renderUser('user:ada:ACTIVE') !== 'user=ADA status=active') {
  throw new Error('public render contract failed');
}
