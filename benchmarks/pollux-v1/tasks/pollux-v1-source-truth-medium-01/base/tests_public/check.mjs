import { existsSync } from 'node:fs';

if (!existsSync('src')) throw new Error('task-local source tree missing');
