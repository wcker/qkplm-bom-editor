import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(packageRoot, 'dist');
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const failures = [];

const expectedExports = Object.freeze({
  '.': './dist/index.js',
  './contracts': './dist/contracts.js',
  './model': './dist/model.js',
  './transaction': './dist/transaction.js',
  './datasource': './dist/datasource.js',
  './runtime': './dist/runtime.js',
  './renderer/canvas': './dist/renderer/canvas.js',
  './worker': './dist/worker.js',
});

if (packageJson.private === true) failures.push('Public Core package must not be private.');
if (packageJson.sideEffects !== false) failures.push('Core package must declare sideEffects: false.');
if (packageJson.license !== 'Apache-2.0') failures.push('Core package must declare Apache-2.0.');

for (const field of ['repository', 'homepage', 'bugs', 'keywords']) {
  if (packageJson[field] === undefined) failures.push(`Core package is missing ${field}.`);
}

if (packageJson.dependencies !== undefined && Object.keys(packageJson.dependencies).length > 0) {
  failures.push('Self-contained Core must not declare runtime dependencies.');
}

for (const [subpath, importPath] of Object.entries(expectedExports)) {
  const entry = packageJson.exports?.[subpath];
  const typesPath = importPath.replace(/\.js$/u, '.d.ts');
  if (
    entry?.import !== importPath ||
    entry.default !== importPath ||
    entry.types !== typesPath
  ) {
    failures.push(`${subpath} has an invalid public export map.`);
  }
  if (!existsSync(resolve(packageRoot, importPath))) {
    failures.push(`${subpath} JavaScript artifact is missing.`);
  }
  if (!existsSync(resolve(packageRoot, typesPath))) {
    failures.push(`${subpath} declaration artifact is missing.`);
  }
}

if (!existsSync(distRoot)) {
  failures.push('Core dist directory is missing.');
} else {
  for (const file of listFiles(distRoot)) {
    if (!/\.(?:js|d\.ts)$/u.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    if (source.includes('@bom-editor/')) {
      failures.push(`${display(file)} leaks an internal @bom-editor module specifier.`);
    }
    if (source.includes('workspace:')) {
      failures.push(`${display(file)} leaks a workspace protocol specifier.`);
    }
  }
}

for (const legalFile of ['LICENSE', 'NOTICE']) {
  if (!packageJson.files?.includes(legalFile)) {
    failures.push(`Core package files must include ${legalFile}.`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Core self-contained package boundary checks passed.');
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function display(path) {
  return relative(packageRoot, path).replaceAll('\\', '/');
}
