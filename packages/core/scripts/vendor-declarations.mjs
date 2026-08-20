import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = resolve(packageRoot, '.build');
const distRoot = resolve(packageRoot, 'dist');
const internalPackages = Object.freeze([
  'contracts',
  'datasource',
  'editor',
  'model',
  'renderer-canvas',
  'runtime',
  'transaction',
  'visible-projection',
  'worker',
]);

if (!existsSync(buildRoot)) {
  throw new Error('Core declaration build output is missing. Run build:types first.');
}

cpSync(buildRoot, distRoot, {
  filter: (source) => !source.endsWith('.js') && !source.endsWith('.js.map'),
  recursive: true,
});

for (const packageName of internalPackages) {
  const source = resolve(packageRoot, '..', packageName, 'dist');
  const target = resolve(distRoot, 'internal', packageName);
  if (!existsSync(source)) {
    throw new Error(`Internal declaration source is missing: ${packageName}.`);
  }
  cpSync(source, target, {
    filter: (path) => statSync(path).isDirectory() || path.endsWith('.d.ts'),
    recursive: true,
  });
}

for (const declarationPath of collectDeclarations(distRoot)) {
  let source = readFileSync(declarationPath, 'utf8');
  for (const packageName of internalPackages) {
    const moduleName = `@bom-editor/${packageName}`;
    const target = resolve(distRoot, 'internal', packageName, 'index.js');
    let replacement = relative(dirname(declarationPath), target).replaceAll('\\', '/');
    if (!replacement.startsWith('.')) replacement = `./${replacement}`;
    source = source.replaceAll(moduleName, replacement);
  }
  writeFileSync(declarationPath, source, 'utf8');
}

console.log(`Vendored declarations for ${internalPackages.length} internal packages.`);

function collectDeclarations(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectDeclarations(path);
    return path.endsWith('.d.ts') ? [path] : [];
  });
}
