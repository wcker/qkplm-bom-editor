import { rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(packageRoot, 'dist');

if (relative(packageRoot, dist) !== 'dist') {
  throw new Error(`Refusing to remove unexpected build target: ${dist}`);
}

rmSync(dist, { force: true, recursive: true });
