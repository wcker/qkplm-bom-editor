import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(packageRoot, 'src');
const bannedNames = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'OffscreenCanvas',
  'Worker',
  'SharedWorker',
];
const failures = [];

for (const file of readdirSync(sourceRoot).filter((name) => name.endsWith('.ts'))) {
  const source = readFileSync(resolve(sourceRoot, file), 'utf8');
  for (const name of bannedNames) {
    if (new RegExp(`\\b${name}\\b`, 'u').test(source)) {
      failures.push(`${file} references forbidden browser boundary: ${name}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Transaction headless boundary checks passed.');
}
