import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import ts from 'typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configRoot = resolve(packageRoot, 'config/api-extractor');
const reportRoot = resolve(packageRoot, 'etc/api');
const tempReportRoot = resolve(packageRoot, 'dist/api-report-temp');
const update = process.argv[2] === '--update';

if (process.argv.length > (update ? 3 : 2)) {
  fail('Usage: node scripts/check-api-reports.mjs [--update]');
}

const entrySpecs = Object.freeze([
  entry('.', 'core', ['@bom-editor/contracts', '@bom-editor/editor']),
  entry('./contracts', 'core-contracts', ['@bom-editor/contracts']),
  entry('./model', 'core-model', ['@bom-editor/model']),
  entry('./transaction', 'core-transaction', ['@bom-editor/transaction']),
  entry('./datasource', 'core-datasource', ['@bom-editor/datasource']),
  entry('./runtime', 'core-runtime', ['@bom-editor/runtime']),
  entry('./renderer/canvas', 'core-renderer-canvas', [
    '@bom-editor/renderer-canvas',
  ]),
  entry('./worker', 'core-worker', ['@bom-editor/worker']),
]);
const failures = [];
const packageJsonPath = resolve(packageRoot, 'package.json');
const packageJson = readJson(packageJsonPath);

mkdirSync(reportRoot, { recursive: true });
mkdirSync(tempReportRoot, { recursive: true });

assertExactSet(
  'Core package exports',
  Object.keys(packageJson.exports ?? {}),
  entrySpecs.map((spec) => spec.subpath),
);
assertExactSet(
  'API Extractor configs',
  listFiles(configRoot, '.json'),
  entrySpecs.map((spec) => `${spec.reportName}.json`),
);

const baseConfig = readJson(resolve(packageRoot, 'api-extractor.base.json'));
if (
  baseConfig.messages?.extractorMessageReporting?.['ae-forgotten-export']
    ?.logLevel !== 'error' ||
  baseConfig.messages?.extractorMessageReporting?.['ae-forgotten-export']
    ?.addToApiReportFile !== false
) {
  failures.push(
    'ae-forgotten-export must be an error and must not be consumed by the report.',
  );
}
if (baseConfig.apiReport?.includeForgottenExports !== false) {
  failures.push('Forgotten exports must not be included in approved reports.');
}
if (baseConfig.compiler?.skipLibCheck !== false) {
  failures.push('API extraction must run with skipLibCheck disabled.');
}

for (const spec of entrySpecs) {
  const packageExport = packageJson.exports?.[spec.subpath];
  const declaredTypesPath = packageExport?.types;
  if (typeof declaredTypesPath !== 'string') {
    failures.push(`${spec.subpath} must declare a string types export.`);
    continue;
  }

  const configPath = resolve(configRoot, `${spec.reportName}.json`);
  try {
    const failureCountBeforeConfig = failures.length;
    const extractorConfig = ExtractorConfig.loadFileAndPrepare(configPath);
    const expectedEntryPoint = resolve(
      packageRoot,
      '.build',
      declaredTypesPath.replace(/^\.\/dist\//u, ''),
    );
    if (resolve(extractorConfig.mainEntryPointFilePath) !== expectedEntryPoint) {
      failures.push(
        `${spec.subpath} config entry point does not match package.json: ` +
          `${display(extractorConfig.mainEntryPointFilePath)} != ${display(expectedEntryPoint)}.`,
      );
    }
    if (!extractorConfig.apiReportEnabled) {
      failures.push(`${spec.subpath} must enable API reports.`);
    }
    if (extractorConfig.apiReportIncludeForgottenExports) {
      failures.push(`${spec.subpath} must exclude forgotten exports.`);
    }
    if (resolve(extractorConfig.reportFolder) !== reportRoot) {
      failures.push(`${spec.subpath} has an unexpected report folder.`);
    }
    if (resolve(extractorConfig.reportTempFolder) !== tempReportRoot) {
      failures.push(`${spec.subpath} has an unexpected temporary report folder.`);
    }
    if (
      resolve(extractorConfig.reportFilePath) !==
      resolve(reportRoot, `${spec.reportName}.api.md`)
    ) {
      failures.push(`${spec.subpath} has an unexpected API report file name.`);
    }
    assertExactSet(
      `${spec.subpath} resolved bundledPackages`,
      extractorConfig.bundledPackages,
      spec.bundledPackages,
    );

    if (failures.length !== failureCountBeforeConfig) continue;

    const result = Extractor.invoke(extractorConfig, {
      localBuild: update,
      printApiReportDiff: true,
      showVerboseMessages: false,
    });
    if (!result.succeeded) {
      failures.push(
        `${spec.subpath} API extraction failed with ${result.errorCount} error(s) ` +
          `and ${result.warningCount} warning(s).`,
      );
    }
  } catch (error) {
    failures.push(
      `${spec.subpath} API extraction threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

assertExactSet(
  'approved API reports',
  listFiles(reportRoot, '.api.md'),
  entrySpecs.map((spec) => `${spec.reportName}.api.md`),
);

for (const spec of entrySpecs) {
  inspectReport(
    resolve(reportRoot, `${spec.reportName}.api.md`),
    spec,
    failures,
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  const action = update ? 'updated' : 'verified';
  console.log(
    `Core API reports ${action} (${entrySpecs.length} stable entry points, no explicit any).`,
  );
}

function entry(subpath, reportName, packages) {
  return Object.freeze({
    subpath,
    reportName,
    bundledPackages: Object.freeze(packages),
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listFiles(folder, suffix) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith(suffix))
    .map((item) => item.name)
    .sort();
}

function assertExactSet(label, actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((item) => !actualSet.has(item));
  const unexpected = [...actualSet].filter((item) => !expectedSet.has(item));
  if (actualSet.size !== actual.length) {
    failures.push(`${label} contains duplicate entries.`);
  }
  if (missing.length > 0) {
    failures.push(`${label} is missing: ${missing.join(', ')}.`);
  }
  if (unexpected.length > 0) {
    failures.push(`${label} has unexpected entries: ${unexpected.join(', ')}.`);
  }
}

function inspectReport(path, spec, reportFailures) {
  if (!existsSync(path)) return;
  const report = readFileSync(path, 'utf8');
  if (report.includes('ae-forgotten-export')) {
    reportFailures.push(
      `${display(path)} contains an unhandled forgotten export.`,
    );
  }
  const blocks = [...report.matchAll(/```ts\s*\r?\n([\s\S]*?)\r?\n```/g)];
  if (blocks.length !== 1 || blocks[0]?.[1] === undefined) {
    reportFailures.push(`${display(path)} must contain exactly one TypeScript code block.`);
    return;
  }

  const sourceFile = ts.createSourceFile(
    path,
    blocks[0][1],
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const diagnostic of sourceFile.parseDiagnostics) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    reportFailures.push(`${display(path)} is not valid TypeScript: ${message}`);
  }
  visit(sourceFile);

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const location = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      reportFailures.push(
        `${display(path)} contains explicit any at report declaration ` +
          `${location.line + 1}:${location.character + 1}.`,
      );
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      spec.bundledPackages.includes(node.moduleSpecifier.text)
    ) {
      reportFailures.push(
        `${display(path)} still references bundled physical package ` +
          `${node.moduleSpecifier.text}.`,
      );
    }
    ts.forEachChild(node, visit);
  }
}

function display(path) {
  return relative(packageRoot, path).replaceAll('\\', '/');
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
