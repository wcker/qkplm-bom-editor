import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(packageRoot, 'dist');

if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
