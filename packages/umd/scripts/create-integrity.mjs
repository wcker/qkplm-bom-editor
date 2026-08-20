import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = process.cwd();
const fileName = 'bom-editor.umd.min.js';
const source = readFileSync(resolve(packageRoot, 'dist', fileName));
const integrity = `sha384-${createHash('sha384').update(source).digest('base64')}`;

writeFileSync(
  resolve(packageRoot, 'dist', 'integrity.json'),
  `${JSON.stringify({ [fileName]: integrity }, null, 2)}\n`,
  'utf8',
);
console.log(`Generated SRI for ${fileName}.`);
