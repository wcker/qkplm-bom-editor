import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(packageRoot, 'src');
const failures = [];
const bannedTypeNames = [
  'AbortSignal',
  'Blob',
  'Canvas',
  'Document',
  'File',
  'HTMLElement',
  'MessagePort',
  'Promise',
  'ReadableStream',
  'URL',
  'Window',
  'any',
  'unknown',
];

// Plugin ABI contracts intentionally expose async hooks and opaque command
// payloads. They remain DOM-free and type-only, but cannot satisfy the
// generic serializable-contract ban for Promise/unknown.
const boundaryExceptions = new Map([
  ['plugin.ts', new Set(['Promise', 'unknown'])],
  // Agent capability authorization is asynchronous but remains DOM-free.
  ['agent.ts', new Set(['Promise'])],
]);
const runtimeExportExceptions = new Set(['agent.ts']);

const sourceFiles = readdirSync(sourceRoot)
  .filter((file) => file.endsWith('.ts'))
  .sort();

for (const file of sourceFiles) {
  const source = stripComments(readFileSync(resolve(sourceRoot, file), 'utf8'));

  for (const bannedName of bannedTypeNames) {
    if (boundaryExceptions.get(file)?.has(bannedName)) continue;
    const expression = new RegExp(`\\b${bannedName}\\b`, 'u');
    if (expression.test(source)) {
      failures.push(`${file} contains banned boundary type: ${bannedName}`);
    }
  }

  const imports = source.match(/^import .+;$/gmu) ?? [];
  for (const statement of imports) {
    if (!statement.startsWith('import type ')) {
      failures.push(`${file} contains a runtime import: ${statement}`);
    }
  }

  if (
    !runtimeExportExceptions.has(file) &&
    /^export\s+(?:const|let|var|class|function|enum|namespace)\b/gmu.test(source)
  ) {
    failures.push(`${file} exports runtime code.`);
  }
}

const index = readFileSync(resolve(sourceRoot, 'index.ts'), 'utf8');
for (const [moduleName, exportKind] of [
  ['agent', 'value'],
  ['command', 'type'],
  ['commit', 'type'],
  ['datasource', 'type'],
  ['diff', 'type'],
  ['error', 'type'],
  ['event', 'type'],
  ['identifiers', 'type'],
  ['patch', 'type'],
  ['plugin', 'type'],
  ['schema', 'type'],
  ['snapshot', 'type'],
  ['value', 'type'],
  ['worker', 'type'],
]) {
  const isExported = exportKind === 'value'
    ? index.includes("BOM_AGENT_CAPABILITY_ERROR_CODES") &&
      index.includes("BOM_AGENT_CAPABILITY_PROTOCOL") &&
      index.includes('agentCapabilityError') &&
      index.includes(`export type * from './${moduleName}.js';`)
    : index.includes(`export type * from './${moduleName}.js';`);
  if (!isExported) {
    failures.push(`index.ts does not export ${moduleName}.ts`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Contract boundary checks passed (${sourceFiles.length} TypeScript files).`);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/.*$/gmu, '');
}
