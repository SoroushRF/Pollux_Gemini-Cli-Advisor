import fs from 'node:fs';

const input = JSON.parse(fs.readFileSync('data/service.json', 'utf8'));
if (input.name !== 'pollux' || input.port !== 8080) {
  throw new Error('service input changed');
}

