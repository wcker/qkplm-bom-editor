import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOM_10K_D6,
  BOM_100K_D6,
  BOM_100K_FLAT,
  STANDARD_FIXTURE_DEFINITIONS,
  VALIDATION_FIXTURE_DEFINITIONS,
  createFixtureManifestEntry,
  generateFixture,
} from '../dist/index.js';

const nestedDefinition = Object.freeze({
  ...BOM_10K_D6,
  id: 'TEST-1K-D6',
  seed: 42,
  nodeCount: 1_000,
  fieldCount: 12,
  duplicateMaterialRatio: 0.2,
});

const flatDefinition = Object.freeze({
  ...BOM_100K_FLAT,
  id: 'TEST-500-FLAT',
  seed: 84,
  nodeCount: 500,
  fieldCount: 8,
});

test('standard exports remain lazy definitions', () => {
  assert.deepEqual(
    STANDARD_FIXTURE_DEFINITIONS.map((definition) => definition.nodeCount),
    [10_000, 100_000, 100_000],
  );
  assert.deepEqual(
    VALIDATION_FIXTURE_DEFINITIONS.map((definition) => definition.validationErrorRate),
    [0.02],
  );
  assert.equal('snapshot' in BOM_100K_D6, false);
});

test('the same definition produces byte-equivalent JSON', () => {
  const first = generateFixture(nestedDefinition);
  const second = generateFixture(nestedDefinition);

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.manifest, createFixtureManifestEntry(nestedDefinition));
  assert.equal(first.schema.schemaVersion, first.snapshot.schemaVersion);
  assert.equal(first.schema.fields.length, nestedDefinition.fieldCount);
});

test('nested generation preserves identity, parent, depth, and child counts', () => {
  const { snapshot } = generateFixture(nestedDefinition);
  const byId = new Map(snapshot.nodes.map((node) => [node.occurrenceId, node]));
  const depths = new Map();
  const observedChildren = new Map();
  const materialIds = new Set();
  let maximumDepth = 0;

  assert.equal(snapshot.nodes.length, nestedDefinition.nodeCount);
  assert.equal(snapshot.roots.length, 1);
  assert.equal(new Set(snapshot.nodes.map((node) => node.occurrenceId)).size, snapshot.nodes.length);

  for (const node of snapshot.nodes) {
    const parentDepth = node.parentId === null ? 0 : depths.get(node.parentId);
    assert.notEqual(parentDepth, undefined, `parent must precede ${node.occurrenceId}`);
    const depth = parentDepth + 1;
    depths.set(node.occurrenceId, depth);
    maximumDepth = Math.max(maximumDepth, depth);
    if (node.parentId !== null) {
      observedChildren.set(node.parentId, (observedChildren.get(node.parentId) ?? 0) + 1);
    }
    if (node.materialId !== undefined) materialIds.add(node.materialId);
    assert.equal(Object.keys(node.fields).length, nestedDefinition.fieldCount);
    assert.equal(Object.isFrozen(node), true);
    assert.equal(Object.isFrozen(node.fields), true);
  }

  for (const node of snapshot.nodes) {
    assert.equal(node.knownChildCount, observedChildren.get(node.occurrenceId) ?? 0);
    if (node.parentId !== null) assert.equal(byId.has(node.parentId), true);
  }

  assert.equal(maximumDepth, nestedDefinition.maxDepth);
  assert.ok(materialIds.size < snapshot.nodes.length, 'fixture must contain repeated materials');
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.nodes), true);
  assert.equal(Object.isFrozen(snapshot.roots), true);
});

test('flat generation creates only ordered roots', () => {
  const { snapshot } = generateFixture(flatDefinition);

  assert.equal(snapshot.nodes.length, flatDefinition.nodeCount);
  assert.equal(snapshot.roots.length, flatDefinition.nodeCount);
  assert.ok(snapshot.nodes.every((node) => node.parentId === null));
  assert.deepEqual(snapshot.roots, snapshot.nodes.map((node) => node.occurrenceId));
});

test('invalid-data mode injects deterministic schema and material errors', () => {
  const definition = Object.freeze({
    ...nestedDefinition,
    id: 'TEST-INVALID',
    validationErrorRate: 0.1,
  });
  const first = generateFixture(definition).snapshot;
  const second = generateFixture(definition).snapshot;
  const invalidNodes = first.nodes.filter(
    (node) => node.materialId === undefined && node.materialCode === undefined,
  );

  assert.ok(invalidNodes.length > 0);
  assert.ok(
    invalidNodes.every((node) => node.fields.quantity?.$type === 'decimal' && node.fields.quantity.value === 'NaN'),
  );
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('invalid definitions fail before allocating nodes', () => {
  assert.throws(
    () => generateFixture({ ...nestedDefinition, nodeCount: 0 }),
    /nodeCount/u,
  );
  assert.throws(
    () => generateFixture({ ...nestedDefinition, duplicateMaterialRatio: 1 }),
    /duplicateMaterialRatio/u,
  );
  assert.throws(
    () => generateFixture({ ...nestedDefinition, maxDepth: 2_000 }),
    /maxDepth/u,
  );
});
