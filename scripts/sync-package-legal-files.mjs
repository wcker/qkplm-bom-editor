import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = process.cwd();
const workspaceRoot = resolve(packageRoot, '../..');

for (const fileName of ['LICENSE', 'NOTICE']) {
  const source = resolve(workspaceRoot, fileName);
  const target = resolve(packageRoot, fileName);
  if (!existsSync(source)) throw new Error(`Missing workspace legal file: ${fileName}.`);
  copyFileSync(source, target);
}

console.log('Synchronized LICENSE and NOTICE into the package directory.');
