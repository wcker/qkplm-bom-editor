import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BOM_100K_D6,
  BOM_100K_FLAT,
  createFixtureManifestEntry,
  generateFixture,
} from '@bom-editor/benchmark-fixtures';
import { createBomEditor } from '@qkplm/bom-editor';
import {
  buildBomIndexes,
  normalizeBomDocumentSnapshot,
  normalizeBomSchema,
} from '@bom-editor/model';
import { createVisibleProjection } from '@bom-editor/visible-projection';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const runId = parseRunId(process.argv.slice(2));
const definitions = Object.freeze([BOM_100K_D6, BOM_100K_FLAT]);
const expansionStates = Object.freeze(['collapsed', 'partial', 'all']);

const measurements = definitions.flatMap((definition) =>
  expansionStates.map((expansion) => measure(definition, expansion)),
);
const readyInstanceMeasurements = [];
for (const definition of definitions) {
  readyInstanceMeasurements.push(await measureReadyInstance(definition));
}
const report = Object.freeze({
  schemaVersion: 'bom-f4-headless-baseline/v1',
  runId,
  generatedAt: new Date().toISOString(),
  status: 'baseline',
  runtime: Object.freeze({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  }),
  measurementConditions: Object.freeze({
    columnCount: 30,
    visibleColumnCount: 10,
    frozenColumnCount: 1,
    expansionStates,
    readyInstanceExpansion: 'collapsed',
    rowHeight: 28,
  }),
  measurements: Object.freeze(measurements),
  readyInstanceMeasurements: Object.freeze(readyInstanceMeasurements),
});
const reportDirectory = resolve(workspaceRoot, 'benchmarks', 'reports', 'f4', runId);
const reportPath = resolve(reportDirectory, 'headless-baseline.json');
await mkdir(reportDirectory, { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
process.stdout.write(JSON.stringify({ runId, report: reportPath, status: report.status }) + '\n');

function measure(definition, expansion) {
  globalThis.gc?.();
  const before = process.memoryUsage();
  const fixtureStartedAt = performance.now();
  const fixture = generateFixture(definition);
  const fixtureMs = performance.now() - fixtureStartedAt;
  const expansionOptions = createExpansionOptions(fixture.snapshot, expansion);
  const editorStartedAt = performance.now();
  const editor = createBomEditor({
    schema: fixture.schema,
    columns: createColumns(fixture.schema.fields),
    initialDocument: fixture.snapshot,
    rowHeight: 28,
    ...expansionOptions,
  });
  const editorMs = performance.now() - editorStartedAt;
  const afterCreate = process.memoryUsage();
  const visibleNodeCount = editor.getDiagnostics().visibleRows;
  editor.destroy();
  const reusedEditorStartedAt = performance.now();
  const reusedEditor = createBomEditor({
    schema: fixture.schema,
    columns: createColumns(fixture.schema.fields),
    initialDocument: fixture.snapshot,
    rowHeight: 28,
    ...expansionOptions,
  });
  const reusedEditorMs = performance.now() - reusedEditorStartedAt;
  reusedEditor.destroy();
  const phaseProfile = measurePhases(definition, expansion);

  return Object.freeze({
    fixture: createFixtureManifestEntry(definition),
    expansion,
    fixtureGenerationMs: round(fixtureMs),
    editorCreateMs: round(editorMs),
    editorReuseMs: round(reusedEditorMs),
    phaseProfile,
    memory: Object.freeze({
      beforeRssBytes: before.rss,
      afterCreateRssBytes: afterCreate.rss,
      rssDeltaBytes: afterCreate.rss - before.rss,
      heapUsedDeltaBytes: afterCreate.heapUsed - before.heapUsed,
    }),
    diagnostics: Object.freeze({
      nodeCount: fixture.snapshot.nodes.length,
      visibleNodeCount,
      expandedOccurrenceCount: expansion === 'all'
        ? fixture.snapshot.nodes.length
        : (expansionOptions.expandedIds?.length ?? 0),
      revision: fixture.snapshot.revision,
    }),
  });
}

function measurePhases(definition, expansion) {
  const fixture = generateFixture(definition);
  const expansionOptions = createExpansionOptions(fixture.snapshot, expansion);
  let startedAt = performance.now();
  const schema = normalizeBomSchema(fixture.schema);
  const schemaNormalizationMs = performance.now() - startedAt;
  if (!schema.ok) {
    throw new Error(`Schema normalization failed for ${definition.id}`);
  }
  startedAt = performance.now();
  const snapshot = normalizeBomDocumentSnapshot(fixture.snapshot, schema.value);
  const snapshotNormalizationMs = performance.now() - startedAt;
  if (!snapshot.ok) {
    throw new Error(`Snapshot normalization failed for ${definition.id}`);
  }
  startedAt = performance.now();
  const indexes = buildBomIndexes(snapshot.value);
  const indexBuildMs = performance.now() - startedAt;
  if (!indexes.ok) {
    throw new Error(`Index construction failed for ${definition.id}`);
  }
  startedAt = performance.now();
  const projection = createVisibleProjection(snapshot.value, {
    indexes: indexes.value,
    rowHeight: 28,
    ...expansionOptions,
  });
  const projectionBuildMs = performance.now() - startedAt;
  if (!projection.ok) {
    throw new Error(`Projection construction failed for ${definition.id}`);
  }
  return Object.freeze({
    schemaNormalizationMs: round(schemaNormalizationMs),
    snapshotNormalizationMs: round(snapshotNormalizationMs),
    indexBuildMs: round(indexBuildMs),
    projectionBuildMs: round(projectionBuildMs),
    visibleNodeCount: projection.value.visibleCount,
  });
}

function createExpansionOptions(snapshot, expansion) {
  if (expansion === 'all') {
    return Object.freeze({ expandAll: true });
  }
  if (expansion === 'collapsed') {
    return Object.freeze({});
  }

  const parentById = new Map(
    snapshot.nodes.map((node) => [node.occurrenceId, node.parentId]),
  );
  const expandedIds = new Set();
  for (let index = 0; index < snapshot.nodes.length; index += 10) {
    let occurrenceId = snapshot.nodes[index].occurrenceId;
    while (occurrenceId !== null) {
      expandedIds.add(occurrenceId);
      occurrenceId = parentById.get(occurrenceId) ?? null;
    }
  }
  return Object.freeze({ expandedIds: Object.freeze([...expandedIds]) });
}

async function measureReadyInstance(definition) {
  globalThis.gc?.();
  const before = process.memoryUsage();
  const fixtureStartedAt = performance.now();
  const fixture = generateFixture(definition);
  const fixtureMs = performance.now() - fixtureStartedAt;
  const editor = createBomEditor({
    schema: fixture.schema,
    columns: createColumns(fixture.schema.fields),
    rowHeight: 28,
  });
  const setDocumentStartedAt = performance.now();
  const result = await editor.setDocument(fixture.snapshot);
  const setDocumentMs = performance.now() - setDocumentStartedAt;
  const afterSetDocument = process.memoryUsage();
  if (!result.ok) {
    editor.destroy();
    throw new Error(`ready-instance setDocument failed for ${definition.id}: ${result.error.code}`);
  }
  const visibleNodeCount = editor.getDiagnostics().visibleRows;
  editor.destroy();

  return Object.freeze({
    fixture: createFixtureManifestEntry(definition),
    fixtureGenerationMs: round(fixtureMs),
    setDocumentMs: round(setDocumentMs),
    memory: Object.freeze({
      beforeRssBytes: before.rss,
      afterSetDocumentRssBytes: afterSetDocument.rss,
      rssDeltaBytes: afterSetDocument.rss - before.rss,
      heapUsedDeltaBytes: afterSetDocument.heapUsed - before.heapUsed,
    }),
    diagnostics: Object.freeze({
      nodeCount: fixture.snapshot.nodes.length,
      visibleNodeCount,
      expansion: 'collapsed',
      revision: fixture.snapshot.revision,
    }),
  });
}

function createColumns(fields) {
  return Object.freeze(fields.map((field, index) => Object.freeze({
    columnId: field.fieldId,
    fieldPath: field.path,
    label: field.fieldId,
    width: index === 0 ? 260 : 140,
    editable: true,
    frozen: index === 0 ? 'start' : false,
    visible: index < 10,
  })));
}

function parseRunId(arguments_) {
  let supplied = null;
  for (const argument of arguments_) {
    if (!argument.startsWith('--run-id=')) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    supplied = argument.slice('--run-id='.length);
  }
  if (supplied !== null) {
    if (!/^[A-Za-z0-9._-]+$/u.test(supplied)) {
      throw new RangeError('--run-id must contain only ASCII letters, digits, dot, underscore, or hyphen.');
    }
    return supplied;
  }
  return new Date().toISOString().replaceAll(/[-:.]/gu, '').replace('Z', 'Z-f4-') + randomBytes(4).toString('hex');
}

function round(value) {
  return Number(value.toFixed(2));
}
