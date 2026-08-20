import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diffBomDocumentSnapshots,
  hashBomDocumentContent,
} from '../dist/index.js';
import {
  createPartialSnapshot,
  createSchema,
  createSnapshot,
  errorCodes,
} from './fixtures.mjs';

function materialNode(occurrenceId, parentId, positionKey, name, materialCode) {
  return {
    occurrenceId,
    kind: 'material',
    materialCode,
    parentId,
    positionKey,
    fields: {
      name,
      quantity: { $type: 'decimal', value: '1.000', unit: 'pcs' },
    },
  };
}

test('Snapshot Diff reports every change class in deterministic category order', () => {
  const source = createSnapshot({
    revision: 'local-before',
    nodes: [
      ...createSnapshot().nodes,
      materialNode('child-b', 'root-a', 'B', 'Before', 'B-1'),
      materialNode('child-c', 'root-a', 'C', 'Stable', 'C-1'),
    ],
  });
  source.nodes.find((node) => node.occurrenceId === 'child-b').materialId =
    'material-b-1';
  source.nodes.find((node) => node.occurrenceId === 'child-b').materialRevision =
    'revision-1';

  const target = createSnapshot({
    revision: 'local-after',
    roots: ['root-a', 'child-a'],
    nodes: [
      materialNode('child-d', 'root-a', 'C', 'Inserted', 'D-1'),
      {
        ...source.nodes.find((node) => node.occurrenceId === 'child-a'),
        parentId: null,
        positionKey: 'B',
      },
      {
        ...source.nodes.find((node) => node.occurrenceId === 'child-c'),
        positionKey: 'A',
      },
      {
        ...source.nodes.find((node) => node.occurrenceId === 'child-b'),
        materialId: 'material-b-2',
        materialRevision: 'revision-2',
        materialCode: 'B-2',
        fields: {
          name: 'Before',
          quantity: { $type: 'decimal', value: '2.000', unit: 'pcs' },
          meta: { category: 'assembly' },
        },
      },
      {
        ...source.nodes.find((node) => node.occurrenceId === 'root-a'),
        fields: { name: 'After' },
      },
    ],
  });

  const result = diffBomDocumentSnapshots(source, target, createSchema());
  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, '1.0.0');
  assert.equal(result.value.documentId, 'document-1');
  assert.equal(result.value.sourceRevision, 'local-before');
  assert.equal(result.value.targetRevision, 'local-after');
  assert.equal(
    result.value.positionKeyCodecVersion,
    'lexicographic-ascii-v1',
  );
  assert.deepEqual(
    result.value.changes.map((change) => [
      change.type,
      change.type === 'insert' || change.type === 'delete'
        ? change.node.occurrenceId
        : change.occurrenceId,
      change.type === 'field' ? change.fieldPath.join('.') : undefined,
    ]),
    [
      ['delete', 'root-b', undefined],
      ['insert', 'child-d', undefined],
      ['move', 'child-a', undefined],
      ['reorder', 'child-c', undefined],
      ['material', 'child-b', undefined],
      ['field', 'root-a', 'name'],
      ['field', 'child-b', 'meta.category'],
      ['field', 'child-b', 'quantity'],
    ],
  );

  const move = result.value.changes.find((change) => change.type === 'move');
  assert.deepEqual(move, {
    type: 'move',
    occurrenceId: 'child-a',
    beforeParentId: 'root-a',
    afterParentId: null,
    beforePositionKey: 'A',
    afterPositionKey: 'B',
  });
  const material = result.value.changes.find(
    (change) => change.type === 'material',
  );
  assert.deepEqual(material.before, {
    materialId: 'material-b-1',
    materialRevision: 'revision-1',
    materialCode: 'B-1',
  });
  assert.deepEqual(material.after, {
    materialId: 'material-b-2',
    materialRevision: 'revision-2',
    materialCode: 'B-2',
  });
  const category = result.value.changes.find(
    (change) =>
      change.type === 'field' && change.fieldPath.join('.') === 'meta.category',
  );
  assert.deepEqual(category.before, { present: false });
  assert.deepEqual(category.after, { present: true, value: 'assembly' });
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.changes), true);
  assert.equal(Object.isFrozen(category.fieldPath), true);

  const shuffled = diffBomDocumentSnapshots(
    { ...source, nodes: [...source.nodes].reverse() },
    { ...target, nodes: [...target.nodes].reverse() },
    createSchema(),
  );
  assert.equal(shuffled.ok, true);
  assert.deepEqual(shuffled.value, result.value);

  target.nodes[0].fields.name = 'caller mutation';
  const inserted = result.value.changes.find((change) => change.type === 'insert');
  assert.equal(inserted.node.fields.name, 'Inserted');
});

test('Snapshot Diff ignores envelope revisions and caller node-array order', () => {
  const source = createSnapshot();
  const target = createSnapshot({
    revision: 'local-2',
    sourceRevision: 'source-2',
    nodes: [...createSnapshot().nodes].reverse(),
  });
  const result = diffBomDocumentSnapshots(source, target, createSchema());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.changes, []);
});

test('Snapshot Diff compares declared nested and additional fields exactly', () => {
  const source = createSnapshot();
  const sourceRoot = source.nodes.find((node) => node.occurrenceId === 'root-a');
  sourceRoot.fields.meta = {
    category: 'raw',
    extension: { z: 1, a: 2 },
  };
  const target = createSnapshot({ revision: 'local-2' });
  const targetRoot = target.nodes.find((node) => node.occurrenceId === 'root-a');
  targetRoot.fields.meta = {
    extension: { a: 2, z: 3 },
  };
  const result = diffBomDocumentSnapshots(
    source,
    target,
    createSchema({ allowAdditionalFields: true }),
  );
  assert.equal(result.ok, true);
  const changes = result.value.changes.filter(
    (change) => change.type === 'field',
  );
  assert.deepEqual(
    changes.map((change) => change.fieldPath),
    [
      ['meta', 'category'],
      ['meta', 'extension'],
    ],
  );
  assert.equal(changes[0].fieldId, 'category');
  assert.deepEqual(changes[0].before, { present: true, value: 'raw' });
  assert.deepEqual(changes[0].after, { present: false });
  assert.equal('fieldId' in changes[1], false);
});

test('Snapshot Diff reports empty Schema path container presence exactly', () => {
  const source = createSnapshot();
  const target = createSnapshot({ revision: 'local-2' });
  target.nodes.find((node) => node.occurrenceId === 'root-a').fields.meta = {};
  const sourceHash = hashBomDocumentContent(source, createSchema());
  const targetHash = hashBomDocumentContent(target, createSchema());
  assert.equal(sourceHash.ok, true);
  assert.equal(targetHash.ok, true);
  assert.notEqual(sourceHash.value, targetHash.value);

  const result = diffBomDocumentSnapshots(source, target, createSchema());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.changes, [
    {
      type: 'field',
      occurrenceId: 'root-a',
      fieldPath: ['meta'],
      before: { present: false },
      after: { present: true, value: {} },
    },
  ]);

  const reversed = diffBomDocumentSnapshots(target, source, createSchema());
  assert.equal(reversed.ok, true);
  assert.deepEqual(reversed.value.changes, [
    {
      type: 'field',
      occurrenceId: 'root-a',
      fieldPath: ['meta'],
      before: { present: true, value: {} },
      after: { present: false },
    },
  ]);
});

test('Snapshot Diff field equality and path order ignore object insertion order', () => {
  const additionalSchema = createSchema({ allowAdditionalFields: true });
  const equalSource = createSnapshot();
  equalSource.nodes.find((node) => node.occurrenceId === 'root-a').fields.extension = {
    z: 1,
    a: 2,
  };
  const equalTarget = createSnapshot({ revision: 'local-2' });
  equalTarget.nodes.find((node) => node.occurrenceId === 'root-a').fields.extension = {
    a: 2,
    z: 1,
  };
  const equal = diffBomDocumentSnapshots(
    equalSource,
    equalTarget,
    additionalSchema,
  );
  assert.equal(equal.ok, true);
  assert.deepEqual(equal.value.changes, []);

  const fieldNames = Array.from(
    { length: 1_024 },
    (_, index) => `field-${String(index).padStart(4, '0')}`,
  );
  const orderedSource = createSnapshot();
  const orderedTarget = createSnapshot({ revision: 'local-2' });
  orderedSource.nodes.find((node) => node.occurrenceId === 'root-a').fields = {
    name: 'Root A',
    ...Object.fromEntries(fieldNames.map((name) => [name, 0])),
  };
  orderedTarget.nodes.find((node) => node.occurrenceId === 'root-a').fields = {
    name: 'Root A',
    ...Object.fromEntries(
      [...fieldNames].reverse().map((name) => [name, 1]),
    ),
  };
  const ordered = diffBomDocumentSnapshots(
    orderedSource,
    orderedTarget,
    additionalSchema,
  );
  assert.equal(ordered.ok, true);
  assert.deepEqual(
    ordered.value.changes.map((change) => change.fieldPath[0]),
    fieldNames,
  );
});

test('Snapshot Diff fails closed for duplicate IDs and partial Snapshots', () => {
  const duplicate = createSnapshot({ revision: 'local-2' });
  duplicate.nodes[1].occurrenceId = 'root-b';
  const duplicateResult = diffBomDocumentSnapshots(
    createSnapshot(),
    duplicate,
    createSchema(),
  );
  assert.ok(errorCodes(duplicateResult).includes('BOM_SNAPSHOT_DUPLICATE_ID'));

  const partialResult = diffBomDocumentSnapshots(
    createPartialSnapshot(),
    createPartialSnapshot({ revision: 'local-2' }),
    createSchema(),
  );
  assert.deepEqual(errorCodes(partialResult), [
    'BOM_DIFF_REQUIRES_COMPLETE_SNAPSHOTS',
  ]);
});

test('Snapshot Diff rejects unrelated documents and occurrence kind reuse', () => {
  const differentDocument = diffBomDocumentSnapshots(
    createSnapshot(),
    createSnapshot({ documentId: 'document-2', revision: 'local-2' }),
    createSchema(),
  );
  assert.deepEqual(errorCodes(differentDocument), [
    'BOM_DIFF_DOCUMENT_MISMATCH',
  ]);

  const kindReuse = createSnapshot({ revision: 'local-2' });
  const root = kindReuse.nodes.find((node) => node.occurrenceId === 'root-a');
  root.kind = 'material';
  root.materialCode = 'REUSED';
  const kindResult = diffBomDocumentSnapshots(
    createSnapshot(),
    kindReuse,
    createSchema(),
  );
  assert.deepEqual(errorCodes(kindResult), ['BOM_DIFF_NODE_KIND_CHANGED']);
});

test('Snapshot Diff covers optional material references and heterogeneous values', () => {
  const schema = createSchema({ allowAdditionalFields: true });
  const source = createSnapshot();
  const sourceChild = source.nodes.find((node) => node.occurrenceId === 'child-a');
  sourceChild.fields.extension = {
    array: [1, { stable: true }],
    object: { left: 'same' },
  };
  const target = createSnapshot({ revision: 'local-2' });
  const targetChild = target.nodes.find((node) => node.occurrenceId === 'child-a');
  delete targetChild.materialId;
  targetChild.materialRevision = 'rev-2';
  targetChild.fields.extension = {
    array: [1, { stable: false }],
    object: { right: 'changed' },
  };

  const result = diffBomDocumentSnapshots(source, target, schema);
  assert.equal(result.ok, true);
  const material = result.value.changes.find((change) => change.type === 'material');
  assert.deepEqual(material.before, {
    materialId: 'material-a',
    materialCode: 'DUPLICATE',
  });
  assert.deepEqual(material.after, {
    materialRevision: 'rev-2',
    materialCode: 'DUPLICATE',
  });
  const fields = result.value.changes
    .filter((change) => change.type === 'field')
    .map((change) => change.fieldPath.join('.'));
  assert.deepEqual(fields, ['extension']);
});

test('Snapshot Diff closes invalid envelopes and exercises value comparison boundaries', () => {
  assert.equal(
    diffBomDocumentSnapshots(createSnapshot(), createSnapshot(), {}).ok,
    false,
  );
  const invalidSource = createSnapshot();
  invalidSource.nodes[1].occurrenceId = 'root-a';
  assert.equal(
    diffBomDocumentSnapshots(invalidSource, createSnapshot(), createSchema()).ok,
    false,
  );

  const arraySource = createSnapshot();
  arraySource.nodes[2].fields.values = [1, 2];
  const arrayTarget = createSnapshot({ revision: 'local-2' });
  arrayTarget.nodes[2].fields.values = { value: 1 };
  const arrayMismatch = diffBomDocumentSnapshots(
    arraySource,
    arrayTarget,
    createSchema({ allowAdditionalFields: true }),
  );
  assert.equal(arrayMismatch.ok, true);

  const lengthSource = createSnapshot();
  lengthSource.nodes[2].fields.values = [1, 2];
  const lengthTarget = createSnapshot({ revision: 'local-2' });
  lengthTarget.nodes[2].fields.values = [1];
  const lengthMismatch = diffBomDocumentSnapshots(
    lengthSource,
    lengthTarget,
    createSchema({ allowAdditionalFields: true }),
  );
  assert.equal(lengthMismatch.ok, true);

  const prefixSource = createSnapshot();
  prefixSource.nodes[2].fields.meta = {};
  const prefixTarget = createSnapshot({ revision: 'local-2' });
  prefixTarget.nodes[2].fields.meta = { category: 'raw' };
  const prefix = diffBomDocumentSnapshots(prefixSource, prefixTarget, createSchema());
  assert.equal(prefix.ok, true);
  assert.deepEqual(
    prefix.value.changes
      .filter((change) => change.type === 'field')
      .map((change) => change.fieldPath),
    [['meta'], ['meta', 'category']],
  );
});
