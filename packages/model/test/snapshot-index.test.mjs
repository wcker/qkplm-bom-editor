import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BOM_MODEL_LIMITS,
  buildBomIndexes,
  comparePositionKeys,
  createPositionKeyBetween,
  deepFreezeBomValue,
  normalizeBomDocumentSnapshot,
  normalizeBomSchema,
  rebalancePositionKeys,
  validatePositionKey,
} from '../dist/index.js';
import {
  createPartialSnapshot,
  createSchema,
  createSnapshot,
  errorCodes,
} from './fixtures.mjs';

test('default value-node limit accommodates the fixed F4 100K fixture shape', () => {
  assert.equal(DEFAULT_BOM_MODEL_LIMITS.maxValueNodes, 5_000_000);
  assert.equal(Object.isFrozen(DEFAULT_BOM_MODEL_LIMITS), true);
});

test('complete Snapshot normalizes to frozen position preorder', () => {
  const input = createSnapshot();
  const result = normalizeBomDocumentSnapshot(input, createSchema());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.roots, ['root-a', 'root-b']);
  assert.deepEqual(
    result.value.nodes.map((node) => node.occurrenceId),
    ['root-a', 'child-a', 'root-b'],
  );
  assert.equal(result.value.knownRootCount, 2);
  assert.equal(result.value.nodes[0].childrenState, 'complete');
  assert.equal(result.value.nodes[0].knownChildCount, 1);
  assert.equal(result.value.nodes[0].fields.quantity.value, '0.000');
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.nodes), true);
  assert.equal(Object.isFrozen(result.value.nodes[0]), true);

  input.nodes[2].fields.name = 'mutated';
  assert.equal(result.value.nodes[0].fields.name, 'First root');
});

test('normalized Snapshot identity is reused only for the same default Schema scope', () => {
  const schema = normalizeBomSchema(createSchema());
  assert.equal(schema.ok, true);
  const first = normalizeBomDocumentSnapshot(createSnapshot(), schema.value);
  assert.equal(first.ok, true);
  const reused = normalizeBomDocumentSnapshot(first.value, schema.value);
  assert.equal(reused.ok, true);
  assert.equal(reused.value, first.value);

  const restricted = normalizeBomDocumentSnapshot(first.value, schema.value, {
    limits: { maxNodes: 1 },
  });
  assert.equal(restricted.ok, false);
  assert.ok(errorCodes(restricted).includes('BOM_NODE_LIMIT_EXCEEDED'));
});

test('deeply frozen source Snapshot reuses its validated normalized ownership', () => {
  const schema = normalizeBomSchema(createSchema());
  assert.equal(schema.ok, true);
  const source = deepFreezeBomValue(createSnapshot());

  const first = normalizeBomDocumentSnapshot(source, schema.value);
  const second = normalizeBomDocumentSnapshot(source, schema.value);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.value, first.value);
  assert.notEqual(first.value, source);
});

test('Snapshot rejects duplicate IDs and missing parents', () => {
  const duplicate = createSnapshot();
  duplicate.nodes[1].occurrenceId = 'root-b';
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(duplicate, createSchema())).includes(
      'BOM_SNAPSHOT_DUPLICATE_ID',
    ),
  );

  const orphan = createSnapshot();
  orphan.nodes[1].parentId = 'missing';
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(orphan, createSchema())).includes(
      'BOM_SNAPSHOT_PARENT_NOT_FOUND',
    ),
  );
});

test('Snapshot detects cycles iteratively', () => {
  const fields = {
    name: 'Node',
    quantity: { $type: 'decimal', value: '1.000', unit: 'pcs' },
  };
  const cycle = createSnapshot({
    roots: [],
    nodes: [
      {
        occurrenceId: 'a',
        kind: 'material',
        materialCode: 'A',
        parentId: 'b',
        positionKey: 'A',
        fields,
      },
      {
        occurrenceId: 'b',
        kind: 'material',
        materialCode: 'B',
        parentId: 'a',
        positionKey: 'A',
        fields,
      },
    ],
  });
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(cycle, createSchema())).includes(
      'BOM_SNAPSHOT_CYCLE',
    ),
  );
});

test('roots must match parent-null nodes and position order', () => {
  const wrongOrder = createSnapshot({ roots: ['root-b', 'root-a'] });
  assert.deepEqual(
    errorCodes(normalizeBomDocumentSnapshot(wrongOrder, createSchema())),
    ['BOM_SNAPSHOT_ROOT_ORDER_MISMATCH'],
  );

  const missing = createSnapshot({ roots: ['root-a'] });
  assert.deepEqual(
    errorCodes(normalizeBomDocumentSnapshot(missing, createSchema())),
    ['BOM_SNAPSHOT_ROOTS_MISMATCH'],
  );
});

test('siblings require unique printable ASCII position keys', () => {
  const duplicate = createSnapshot();
  duplicate.nodes[0].positionKey = 'A';
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(duplicate, createSchema())).includes(
      'BOM_POSITION_KEY_DUPLICATE',
    ),
  );

  const unicode = createSnapshot();
  unicode.nodes[0].positionKey = '中';
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(unicode, createSchema())).includes(
      'BOM_POSITION_KEY_INVALID',
    ),
  );
  assert.equal(validatePositionKey('A', ['key']).ok, true);
  assert.equal(validatePositionKey('\n', ['key']).ok, false);
});

test('material nodes require identity while groups may omit it', () => {
  const snapshot = createSnapshot();
  delete snapshot.nodes[0].materialCode;
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(snapshot, createSchema())).includes(
      'BOM_MATERIAL_REF_REQUIRED',
    ),
  );
});

test('maximumDepth is enforced without recursive traversal', () => {
  const nodeCount = 200;
  const nodes = [];
  for (let index = 0; index < nodeCount; index += 1) {
    nodes.push({
      occurrenceId: `node-${index}`,
      kind: 'material',
      materialCode: `M-${index}`,
      parentId: index === 0 ? null : `node-${index - 1}`,
      positionKey: 'A',
      fields: {
        name: `Node ${index}`,
        quantity: { $type: 'decimal', value: '1.000', unit: 'pcs' },
      },
    });
  }
  const snapshot = createSnapshot({ roots: ['node-0'], nodes });
  const schema = createSchema({ recommendedDepth: 10, maximumDepth: 100 });
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(snapshot, schema)).includes(
      'BOM_DEPTH_LIMIT_EXCEEDED',
    ),
  );
});

test('partial Snapshot enforces known roots and child-state semantics', () => {
  const valid = normalizeBomDocumentSnapshot(createPartialSnapshot(), createSchema());
  assert.equal(valid.ok, true);

  const missingState = createPartialSnapshot();
  delete missingState.nodes[0].childrenState;
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(missingState, createSchema())).includes(
      'BOM_CHILDREN_STATE_INVALID',
    ),
  );

  const missingKnownRoots = createPartialSnapshot();
  delete missingKnownRoots.knownRootCount;
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(missingKnownRoots, createSchema())).includes(
      'BOM_CHILD_COUNT_MISMATCH',
    ),
  );

  const partialWithoutCount = createPartialSnapshot();
  partialWithoutCount.nodes[2].childrenState = 'partial';
  delete partialWithoutCount.nodes[2].knownChildCount;
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(partialWithoutCount, createSchema())).includes(
      'BOM_CHILD_COUNT_MISMATCH',
    ),
  );

  const unloadedWithChild = createPartialSnapshot();
  unloadedWithChild.nodes[2].childrenState = 'unloaded';
  assert.ok(
    errorCodes(normalizeBomDocumentSnapshot(unloadedWithChild, createSchema())).includes(
      'BOM_CHILD_COUNT_MISMATCH',
    ),
  );
});

test('base indexes preserve sibling order and duplicate material occurrences', () => {
  const normalized = normalizeBomDocumentSnapshot(createSnapshot(), createSchema());
  assert.equal(normalized.ok, true);
  const indexed = buildBomIndexes(normalized.value);
  assert.equal(indexed.ok, true);
  assert.equal(indexed.value.rowById.get('child-a').materialId, 'material-a');
  assert.deepEqual(indexed.value.childrenByParent.get(null), ['root-a', 'root-b']);
  assert.deepEqual(indexed.value.childrenByParent.get('root-a'), ['child-a']);
  assert.deepEqual(indexed.value.rowsByMaterialCode.get('DUPLICATE'), [
    'child-a',
    'root-b',
  ]);
  assert.equal('set' in indexed.value.rowById, false);
});

test('base indexes reuse the cache only for normalized Snapshots', () => {
  const schemaResult = normalizeBomSchema(createSchema());
  assert.equal(schemaResult.ok, true);
  const snapshotResult = normalizeBomDocumentSnapshot(createSnapshot(), schemaResult.value);
  assert.equal(snapshotResult.ok, true);

  const first = buildBomIndexes(snapshotResult.value);
  const second = buildBomIndexes(snapshotResult.value);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value, second.value);
});

test('position generation returns gaps or deterministic rebalance keys', () => {
  const initial = createPositionKeyBetween(null, null);
  assert.equal(initial.ok, true);
  const before = createPositionKeyBetween(null, initial.value);
  const after = createPositionKeyBetween(initial.value, null);
  assert.equal(before.ok, true);
  assert.equal(after.ok, true);
  assert.ok(comparePositionKeys(before.value, initial.value) < 0);
  assert.ok(comparePositionKeys(initial.value, after.value) < 0);

  const noGap = createPositionKeyBetween(null, ' ');
  assert.equal(noGap.ok, false);

  const rebalanced = rebalancePositionKeys(1_000);
  assert.equal(rebalanced.ok, true);
  assert.equal(rebalanced.value.length, 1_000);
  for (let index = 1; index < rebalanced.value.length; index += 1) {
    assert.ok(comparePositionKeys(rebalanced.value[index - 1], rebalanced.value[index]) < 0);
  }
});

test('base index construction fails closed and readonly maps preserve the Map contract', () => {
  const valid = normalizeBomDocumentSnapshot(createSnapshot(), createSchema());
  assert.equal(valid.ok, true);

  const duplicate = {
    ...valid.value,
    nodes: [...valid.value.nodes, { ...valid.value.nodes[0] }],
  };
  assert.deepEqual(
    errorCodes(buildBomIndexes(duplicate)),
    ['BOM_SNAPSHOT_DUPLICATE_ID'],
  );

  const orphan = {
    ...valid.value,
    nodes: valid.value.nodes.map((node, index) =>
      index === 1 ? { ...node, parentId: 'missing-parent' } : node,
    ),
  };
  assert.deepEqual(
    errorCodes(buildBomIndexes(orphan)),
    ['BOM_SNAPSHOT_PARENT_NOT_FOUND'],
  );

  const indexed = buildBomIndexes(valid.value);
  assert.equal(indexed.ok, true);
  const rows = indexed.value.rowById;
  assert.equal(rows.size, 3);
  assert.equal(rows.get('missing'), undefined);
  assert.equal(rows.has('root-a'), true);
  assert.deepEqual([...rows.keys()], ['root-a', 'child-a', 'root-b']);
  assert.deepEqual([...rows.values()].map((node) => node.occurrenceId), [
    'root-a',
    'child-a',
    'root-b',
  ]);
  assert.deepEqual([...rows.entries()].map(([id, node]) => [id, node.occurrenceId]), [
    ['root-a', 'root-a'],
    ['child-a', 'child-a'],
    ['root-b', 'root-b'],
  ]);
  let callbackMap;
  const callbackIds = [];
  rows.forEach((node, id, map) => {
    callbackMap = map;
    callbackIds.push(`${id}:${node.occurrenceId}`);
  });
  assert.equal(callbackMap, rows);
  assert.deepEqual(callbackIds, ['root-a:root-a', 'child-a:child-a', 'root-b:root-b']);
  assert.deepEqual([...rows], [...rows.entries()]);
  assert.equal(rows[Symbol.toStringTag], 'ImmutableReadonlyMap');

  const children = indexed.value.childrenByParent;
  assert.equal(children.get('missing'), undefined);
  assert.equal(children.has(null), true);
  assert.deepEqual([...children], [...children.entries()]);
  assert.equal(indexed.value.rowsByMaterialCode.get('missing'), undefined);
});
