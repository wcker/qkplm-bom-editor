import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOM_TRANSACTION_ERROR_CODES,
  createBomTransactionEngine,
} from '@bom-editor/transaction';
import {
  buildBomIndexes,
  hashBomFieldValue,
  hashBomDocumentContent,
  LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
} from '@bom-editor/model';

const PROTOCOL_VERSION = '1.0.0';

const schema = Object.freeze({
  schemaVersion: '1.0.0',
  fields: Object.freeze([
    Object.freeze({
      fieldId: 'name',
      path: Object.freeze(['name']),
      type: Object.freeze({ kind: 'string', maxLength: 200 }),
      required: true,
      nullable: false,
    }),
    Object.freeze({
      fieldId: 'note',
      path: Object.freeze(['note']),
      type: Object.freeze({ kind: 'string', maxLength: 200 }),
      required: false,
      nullable: false,
    }),
  ]),
  allowAdditionalFields: false,
  recommendedDepth: 6,
  maximumDepth: 128,
  canonicalizationVersion: '1',
  contentHashAlgorithm: 'SHA-256',
});

function createSnapshot({ adjacentKeys = false } = {}) {
  return {
    schemaVersion: schema.schemaVersion,
    documentId: 'document-1',
    revision: 'revision-0',
    positionKeyCodecVersion: LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
    completeness: 'complete',
    knownRootCount: 1,
    roots: ['root'],
    nodes: [
      {
        occurrenceId: 'root',
        kind: 'group',
        parentId: null,
        positionKey: 'M',
        childrenState: 'complete',
        knownChildCount: 2,
        fields: { name: 'Root' },
      },
      {
        occurrenceId: 'left',
        kind: 'material',
        materialCode: 'MAT-LEFT',
        parentId: 'root',
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 0,
        fields: { name: 'Left' },
      },
      {
        occurrenceId: 'right',
        kind: 'material',
        materialCode: 'MAT-RIGHT',
        parentId: 'root',
        positionKey: adjacentKeys ? 'A ' : 'z',
        childrenState: 'complete',
        knownChildCount: 0,
        fields: { name: 'Right' },
      },
    ],
  };
}

function createEngine(options = {}) {
  const activeSchema = options.schema ?? schema;
  const created = createBomTransactionEngine({
    snapshot: options.snapshot ?? createSnapshot(),
    schema: activeSchema,
    protocolVersion: PROTOCOL_VERSION,
    documentGeneration: 7,
    history: options.history,
    beforeApply: options.beforeApply,
    revisionFactory: options.revisionFactory ?? (({ sequence, contentHash }) =>
      `revision-${sequence}-${contentHash.slice(0, 12)}`),
    transactionIdFactory: options.transactionIdFactory ?? (({ purpose, sequence }) =>
      `transaction-${purpose}-${sequence}`),
    timestampFactory: options.timestampFactory ?? (() => '2026-07-19T00:00:00.000Z'),
  });
  assert.equal(created.ok, true, created.ok ? undefined : formatErrors(created));
  return created.value;
}

function expectOk(result) {
  assert.equal(result.ok, true, result.ok ? undefined : formatErrors(result));
  return result.value;
}

function expectError(result, code) {
  assert.equal(result.ok, false, 'Expected the transaction to fail.');
  assert.equal(result.errors.some((error) => error.code === code), true);
}

async function expectErrorAsync(result, code) {
  expectError(await result, code);
}

function formatErrors(result) {
  return result.errors.map((error) => error.code).join(', ');
}

function assertIndexesMatchSnapshot(indexes, snapshot) {
  const rebuilt = buildBomIndexes(snapshot);
  assert.equal(rebuilt.ok, true);
  assert.deepEqual([...indexes.rowById], [...rebuilt.value.rowById]);
  assert.deepEqual(
    [...indexes.childrenByParent],
    [...rebuilt.value.childrenByParent],
  );
  assert.deepEqual(
    [...indexes.rowsByMaterialCode],
    [...rebuilt.value.rowsByMaterialCode],
  );
}

function replayBatch(engine, transactionId, commands, options = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    documentGeneration: 7,
    baseRevision: engine.getSnapshot().revision,
    transactionId,
    ...(options.dependsOnTransactionId === undefined
      ? {}
      : { dependsOnTransactionId: options.dependsOnTransactionId }),
    origin: options.origin ?? `test:${transactionId}`,
    timestamp: options.timestamp ?? '2026-07-19T02:00:00.000Z',
    ...(options.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: options.idempotencyKey }),
    commands,
  };
}

function replayPatch(engine, transactionId, operations, options = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    baseRevision: engine.getSnapshot().revision,
    transactionId,
    ...(options.dependsOnTransactionId === undefined
      ? {}
      : { dependsOnTransactionId: options.dependsOnTransactionId }),
    origin: options.origin ?? `test:${transactionId}`,
    timestamp: options.timestamp ?? '2026-07-19T02:00:00.000Z',
    ...(options.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: options.idempotencyKey }),
    operations,
  };
}

test('executes built-in commands in FIFO order and atomically swaps model indexes', async () => {
  const engine = createEngine();

  const firstPromise = engine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'first',
  });
  const secondPromise = engine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'second',
  });
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  const firstCommit = expectOk(first);
  const secondCommit = expectOk(second);
  assert.equal(secondCommit.previousRevision, firstCommit.revision);
  assert.equal(
    engine.getIndexes().rowById.get('left').fields.note,
    'second',
  );

  const baseRevision = engine.getSnapshot().revision;
  const batch = await engine.executeBatch({
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    documentGeneration: 7,
    baseRevision,
    transactionId: 'transaction-batch-builtins',
    origin: 'test',
    timestamp: '2026-07-19T00:00:01.000Z',
    commands: [
      {
        type: 'insertNode',
        parentId: 'root',
        placement: { at: 'last' },
        node: {
          occurrenceId: 'new-node',
          kind: 'material',
          materialCode: 'MAT-NEW',
          fields: { name: 'New' },
        },
      },
      {
        type: 'setMaterialRef',
        occurrenceId: 'right',
        materialId: 'material-right',
        materialRevision: 'B',
        materialCode: 'MAT-RIGHT-B',
      },
      {
        type: 'unsetField',
        occurrenceId: 'left',
        fieldPath: ['note'],
        expectedPresent: true,
      },
      {
        type: 'moveSubtree',
        occurrenceId: 'left',
        newParentId: null,
        placement: { at: 'last' },
      },
    ],
  });
  const batchCommit = expectOk(batch);
  assert.deepEqual(
    batchCommit.patch.operations.map((operation) => operation.op),
    ['insertNode', 'setMaterialRef', 'unsetField', 'moveSubtree'],
  );
  assert.deepEqual(engine.getSnapshot().roots, ['root', 'left']);
  assert.deepEqual(engine.getIndexes().childrenByParent.get('root'), [
    'right',
    'new-node',
  ]);
  assert.equal(
    engine.getIndexes().rowById.get('right').materialCode,
    'MAT-RIGHT-B',
  );
  assert.equal(
    Object.hasOwn(engine.getIndexes().rowById.get('left').fields, 'note'),
    false,
  );

  const deleted = expectOk(
    await engine.execute({ type: 'deleteSubtree', occurrenceId: 'new-node' }),
  );
  assert.equal(deleted.patch.operations[0].op, 'deleteSubtree');
  assert.equal(engine.getIndexes().rowById.has('new-node'), false);
  assert.equal(deleted.inversePatch.operations[0].op, 'insertNode');
});

test('command execution preserves captured persistence metadata on the local Patch', async () => {
  const preparedPatches = [];
  const engine = createEngine({
    beforeApply(prepared) {
      preparedPatches.push(prepared.patch);
    },
  });
  const first = expectOk(
    await engine.execute(
      {
        type: 'setField',
        occurrenceId: 'left',
        fieldPath: ['note'],
        value: 'first-pending',
      },
      {
        transactionId: 'transaction-pending-1',
        dependsOnTransactionId: 'transaction-acknowledged-0',
        idempotencyKey: 'idempotency-pending-1',
      },
    ),
  );
  assert.equal(
    first.patch.dependsOnTransactionId,
    'transaction-acknowledged-0',
  );
  assert.equal(first.patch.idempotencyKey, 'idempotency-pending-1');
  assert.equal(preparedPatches[0], first.patch);

  const batch = {
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    documentGeneration: 7,
    baseRevision: engine.getSnapshot().revision,
    transactionId: 'transaction-pending-2',
    dependsOnTransactionId: 'transaction-pending-1',
    origin: 'test:persistence',
    timestamp: '2026-07-19T00:00:01.500Z',
    idempotencyKey: 'idempotency-pending-2',
    commands: [
      {
        type: 'setField',
        occurrenceId: 'right',
        fieldPath: ['note'],
        value: 'second-pending',
      },
    ],
  };
  const pendingBatch = engine.executeBatch(batch);
  batch.dependsOnTransactionId = 'mutated-parent';
  batch.idempotencyKey = 'mutated-key';
  const second = expectOk(await pendingBatch);
  assert.equal(second.patch.dependsOnTransactionId, 'transaction-pending-1');
  assert.equal(second.patch.idempotencyKey, 'idempotency-pending-2');
  assert.equal(preparedPatches[1], second.patch);
  assert.equal(Object.isFrozen(second.patch), true);
});

test('all mutation entries reject empty persistence metadata and self-dependencies', async () => {
  const engine = createEngine();
  const snapshotBefore = engine.getSnapshot();
  const indexesBefore = engine.getIndexes();
  const contentHashBefore = engine.getContentHash();
  const historyBefore = engine.getHistoryState();
  const invalidMetadata = [
    {
      label: 'empty-idempotency-key',
      values: { idempotencyKey: '' },
    },
    {
      label: 'empty-dependency',
      values: { dependsOnTransactionId: '' },
    },
    {
      label: 'self-dependency',
      values: {
        transactionId: 'transaction-self',
        dependsOnTransactionId: 'transaction-self',
      },
    },
  ];
  const command = {
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'must-not-apply',
  };
  const operation = {
    op: 'updateField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'must-not-apply',
  };

  for (const testCase of invalidMetadata) {
    expectError(
      await engine.execute(command, {
        transactionId: `execute-${testCase.label}`,
        ...testCase.values,
      }),
      BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
    );
    expectError(
      await engine.executeBatch({
        protocolVersion: PROTOCOL_VERSION,
        documentId: 'document-1',
        documentGeneration: 7,
        baseRevision: snapshotBefore.revision,
        transactionId: `batch-${testCase.label}`,
        origin: 'test:invalid-metadata',
        timestamp: '2026-07-19T00:00:01.750Z',
        ...testCase.values,
        commands: [command],
      }),
      BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
    );
    expectError(
      await engine.applyPatch({
        protocolVersion: PROTOCOL_VERSION,
        documentId: 'document-1',
        baseRevision: snapshotBefore.revision,
        transactionId: `patch-${testCase.label}`,
        origin: 'test:invalid-metadata',
        timestamp: '2026-07-19T00:00:01.750Z',
        ...testCase.values,
        operations: [operation],
      }),
      BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
    );
  }

  assert.equal(engine.getSnapshot(), snapshotBefore);
  assert.equal(engine.getIndexes(), indexesBefore);
  assert.equal(engine.getContentHash(), contentHashBefore);
  assert.deepEqual(engine.getHistoryState(), historyBefore);
});

test('queued source acknowledgement only changes sourceRevision metadata', async () => {
  const snapshot = createSnapshot();
  snapshot.sourceRevision = 'source-0';
  let beforeApplyCalls = 0;
  const engine = createEngine({
    snapshot,
    beforeApply() {
      beforeApplyCalls += 1;
    },
  });
  expectOk(
    await engine.execute({
      type: 'setField',
      occurrenceId: 'left',
      fieldPath: ['note'],
      value: 'local-change',
    }),
  );

  const snapshotBefore = engine.getSnapshot();
  const indexesBefore = engine.getIndexes();
  const contentHashBefore = engine.getContentHash();
  const historyBefore = engine.getHistoryState();
  const rootsBefore = snapshotBefore.roots;
  const nodesBefore = snapshotBefore.nodes;
  const beforeApplyCallsBefore = beforeApplyCalls;
  const request = {
    sourceRevision: 'source-1',
    expectedLocalRevision: snapshotBefore.revision,
    expectedPriorSourceRevision: 'source-0',
  };
  const pendingAcknowledgement = engine.acknowledgeSourceRevision(request);
  request.sourceRevision = 'mutated-source';
  request.expectedLocalRevision = 'mutated-local';
  request.expectedPriorSourceRevision = 'mutated-prior';
  const acknowledged = expectOk(await pendingAcknowledgement);

  assert.equal(acknowledged, engine.getSnapshot());
  assert.notEqual(acknowledged, snapshotBefore);
  assert.equal(acknowledged.sourceRevision, 'source-1');
  assert.equal(acknowledged.revision, snapshotBefore.revision);
  assert.equal(acknowledged.roots, rootsBefore);
  assert.equal(acknowledged.nodes, nodesBefore);
  assert.equal(engine.getIndexes(), indexesBefore);
  assert.equal(engine.getContentHash(), contentHashBefore);
  assert.deepEqual(engine.getHistoryState(), historyBefore);
  assert.equal(beforeApplyCalls, beforeApplyCallsBefore);
  assert.equal(Object.isFrozen(acknowledged), true);

  const duplicate = expectOk(
    await engine.acknowledgeSourceRevision({
      sourceRevision: 'source-1',
      expectedLocalRevision: snapshotBefore.revision,
      expectedPriorSourceRevision: 'source-1',
    }),
  );
  assert.equal(duplicate, acknowledged);

  const stableSnapshot = engine.getSnapshot();
  expectError(
    await engine.acknowledgeSourceRevision({
      sourceRevision: 'source-2',
      expectedLocalRevision: 'stale-local',
      expectedPriorSourceRevision: 'source-1',
    }),
    BOM_TRANSACTION_ERROR_CODES.sourceRevisionLocalRevisionMismatch,
  );
  expectError(
    await engine.acknowledgeSourceRevision({
      sourceRevision: 'source-2',
      expectedLocalRevision: snapshotBefore.revision,
      expectedPriorSourceRevision: 'stale-source',
    }),
    BOM_TRANSACTION_ERROR_CODES.sourceRevisionMismatch,
  );
  expectError(
    await engine.acknowledgeSourceRevision({
      sourceRevision: '',
      expectedLocalRevision: snapshotBefore.revision,
    }),
    BOM_TRANSACTION_ERROR_CODES.sourceRevisionInvalid,
  );
  for (const invalidAcknowledgement of [
    { sourceRevision: 'source-2', expectedLocalRevision: '' },
    { sourceRevision: 'source-2', expectedLocalRevision: 1 },
    {
      sourceRevision: 'source-2',
      expectedLocalRevision: snapshotBefore.revision,
      expectedPriorSourceRevision: '',
    },
    {
      sourceRevision: 'source-2',
      expectedLocalRevision: snapshotBefore.revision,
      expectedPriorSourceRevision: 1,
    },
  ]) {
    expectError(
      await engine.acknowledgeSourceRevision(invalidAcknowledgement),
      BOM_TRANSACTION_ERROR_CODES.sourceRevisionInvalid,
    );
  }
  assert.equal(engine.getSnapshot(), stableSnapshot);
  assert.equal(engine.getIndexes(), indexesBefore);
  assert.equal(engine.getContentHash(), contentHashBefore);
  assert.deepEqual(engine.getHistoryState(), historyBefore);

  const queuedAcknowledgement = engine.acknowledgeSourceRevision({
    sourceRevision: 'source-2',
    expectedLocalRevision: snapshotBefore.revision,
    expectedPriorSourceRevision: 'source-1',
  });
  const followingCommit = engine.execute({
    type: 'setField',
    occurrenceId: 'right',
    fieldPath: ['note'],
    value: 'after-acknowledgement',
  });
  expectOk(await queuedAcknowledgement);
  const committed = expectOk(await followingCommit);
  assert.equal(committed.previousRevision, snapshotBefore.revision);
  assert.equal(engine.getSnapshot().sourceRevision, 'source-2');
  assert.equal(beforeApplyCalls, beforeApplyCallsBefore + 1);
});

test('field-only commits preserve atomicity, immutable indexes, and Undo equivalence', async () => {
  let accept = false;
  let prepared;
  const engine = createEngine({
    beforeApply(candidate) {
      prepared = candidate;
      return accept;
    },
  });
  const snapshotBefore = engine.getSnapshot();
  const indexesBefore = engine.getIndexes();
  const hashBefore = engine.getContentHash();
  const historyBefore = engine.getHistoryState();

  const rejected = await engine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'rejected',
  });
  expectError(rejected, BOM_TRANSACTION_ERROR_CODES.beforeApplyRejected);
  assert.equal(engine.getSnapshot(), snapshotBefore);
  assert.equal(engine.getIndexes(), indexesBefore);
  assert.equal(engine.getContentHash(), hashBefore);
  assert.deepEqual(engine.getHistoryState(), historyBefore);
  assert.equal(prepared.snapshot.nodes[1].fields.note, 'rejected');
  assert.equal(
    prepared.indexes.rowById.get('left'),
    prepared.snapshot.nodes[1],
  );
  assertIndexesMatchSnapshot(prepared.indexes, prepared.snapshot);

  accept = true;
  const accepted = expectOk(
    await engine.executeBatch({
      protocolVersion: PROTOCOL_VERSION,
      documentId: 'document-1',
      documentGeneration: 7,
      baseRevision: engine.getSnapshot().revision,
      transactionId: 'transaction-field-fast-path',
      origin: 'test',
      timestamp: '2026-07-19T00:00:00.500Z',
      commands: [
        {
          type: 'setField',
          occurrenceId: 'left',
          fieldPath: ['note'],
          value: 'accepted-left',
        },
        {
          type: 'setField',
          occurrenceId: 'right',
          fieldPath: ['note'],
          value: 'accepted-right',
        },
      ],
    }),
  );
  assert.deepEqual(
    accepted.patch.operations.map((operation) => operation.op),
    ['updateField', 'updateField'],
  );
  const indexes = engine.getIndexes();
  assertIndexesMatchSnapshot(indexes, engine.getSnapshot());
  assert.equal(Object.isFrozen(indexes), true);
  assert.equal(Object.isFrozen(indexes.rowById), true);
  assert.equal(indexes.rowById.set, undefined);
  assert.equal(indexes.rowById.delete, undefined);
  assert.equal(indexes.rowById.clear, undefined);
  assert.throws(
    () => Map.prototype.set.call(indexes.rowById, 'escaped', {}),
    TypeError,
  );
  let forEachMap;
  indexes.rowById.forEach((_value, _key, iteratedMap) => {
    forEachMap = iteratedMap;
  });
  assert.equal(forEachMap, indexes.rowById);

  expectOk(await engine.undo());
  assert.equal(engine.getSnapshot().nodes[1].fields.note, undefined);
  assert.equal(engine.getSnapshot().nodes[2].fields.note, undefined);
  assertIndexesMatchSnapshot(engine.getIndexes(), engine.getSnapshot());
  assert.equal(engine.getContentHash(), hashBefore);
});

test('nested field Undo restores missing and pre-existing empty ancestors exactly', async () => {
  const nestedSchema = {
    ...schema,
    fields: [
      ...schema.fields,
      {
        fieldId: 'category',
        path: ['meta', 'category'],
        type: { kind: 'string', maxLength: 100 },
        required: false,
        nullable: false,
      },
    ],
  };
  const cases = [
    {
      label: 'missing ancestor',
      fields: { name: 'Left' },
    },
    {
      label: 'pre-existing empty ancestor',
      fields: { name: 'Left', meta: {} },
    },
  ];

  for (const testCase of cases) {
    const snapshot = createSnapshot();
    snapshot.nodes[1].fields = testCase.fields;
    const engine = createEngine({ schema: nestedSchema, snapshot });
    const initialHash = engine.getContentHash();
    const initialFields = engine.getSnapshot().nodes[1].fields;

    expectOk(
      await engine.execute({
        type: 'setField',
        occurrenceId: 'left',
        fieldPath: ['meta', 'category'],
        value: 'mechanical',
      }),
    );
    expectOk(await engine.undo());

    assert.deepEqual(
      engine.getSnapshot().nodes[1].fields,
      initialFields,
      testCase.label,
    );
    assert.equal(engine.getContentHash(), initialHash, testCase.label);
    assertIndexesMatchSnapshot(engine.getIndexes(), engine.getSnapshot());
  }
});

test('repeated field edits keep row lookup and full index iteration equivalent', async () => {
  const engine = createEngine();
  for (let index = 0; index < 500; index += 1) {
    expectOk(
      await engine.execute({
        type: 'setField',
        occurrenceId: 'left',
        fieldPath: ['note'],
        value: `edit-${index}`,
      }),
    );
  }

  const indexes = engine.getIndexes();
  assert.equal(indexes.rowById.get('left').fields.note, 'edit-499');
  assert.equal([...indexes.rowById].length, engine.getSnapshot().nodes.length);
  assertIndexesMatchSnapshot(indexes, engine.getSnapshot());
});

test('rejects stale bases and invalid batches without exposing partial state', async () => {
  const engine = createEngine();
  const snapshotBefore = engine.getSnapshot();
  const indexesBefore = engine.getIndexes();
  const hashBefore = engine.getContentHash();
  const historyBefore = engine.getHistoryState();

  const invalid = await engine.executeBatch({
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    documentGeneration: 7,
    baseRevision: snapshotBefore.revision,
    transactionId: 'transaction-invalid-batch',
    origin: 'test',
    timestamp: '2026-07-19T00:00:02.000Z',
    commands: [
      {
        type: 'setField',
        occurrenceId: 'left',
        fieldPath: ['note'],
        value: 'must-not-leak',
      },
      {
        type: 'unsetField',
        occurrenceId: 'left',
        fieldPath: ['name'],
      },
    ],
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some((error) => error.code === 'BOM_FIELD_REQUIRED'), true);
  assert.equal(engine.getSnapshot(), snapshotBefore);
  assert.equal(engine.getIndexes(), indexesBefore);
  assert.equal(engine.getContentHash(), hashBefore);
  assert.deepEqual(engine.getHistoryState(), historyBefore);

  const stale = await engine.executeBatch({
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    documentGeneration: 7,
    baseRevision: 'stale-revision',
    transactionId: 'transaction-stale',
    origin: 'test',
    timestamp: '2026-07-19T00:00:03.000Z',
    commands: [
      {
        type: 'setField',
        occurrenceId: 'left',
        fieldPath: ['note'],
        value: 'stale',
      },
    ],
  });
  expectError(stale, BOM_TRANSACTION_ERROR_CODES.baseRevisionMismatch);
  assert.equal(engine.getSnapshot(), snapshotBefore);
});

test('delegates cycle detection to model and preserves the valid snapshot', async () => {
  const engine = createEngine();
  const snapshotBefore = engine.getSnapshot();
  const hashBefore = engine.getContentHash();

  const result = await engine.execute({
    type: 'moveSubtree',
    occurrenceId: 'root',
    newParentId: 'left',
    placement: { at: 'last' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === 'BOM_SNAPSHOT_CYCLE'), true);
  assert.equal(engine.getSnapshot(), snapshotBefore);
  assert.equal(engine.getContentHash(), hashBefore);
  assert.equal(engine.getHistoryState().undoEntries, 0);
});

test('rebalances exhausted position gaps and Undo restores the canonical content hash', async () => {
  const engine = createEngine({ snapshot: createSnapshot({ adjacentKeys: true }) });
  const initialHash = engine.getContentHash();

  const inserted = expectOk(
    await engine.execute({
      type: 'insertNode',
      parentId: 'root',
      placement: { beforeOccurrenceId: 'right' },
      node: {
        occurrenceId: 'between',
        kind: 'material',
        materialCode: 'MAT-BETWEEN',
        fields: { name: 'Between' },
      },
    }),
  );
  assert.deepEqual(
    inserted.patch.operations.map((operation) => operation.op),
    ['rebalancePositions', 'insertNode'],
  );
  assert.deepEqual(engine.getIndexes().childrenByParent.get('root'), [
    'left',
    'between',
    'right',
  ]);
  const insertedHash = engine.getContentHash();
  assert.notEqual(insertedHash, initialHash);

  expectOk(await engine.undo());
  assert.equal(engine.getContentHash(), initialHash);
  assert.equal(engine.getIndexes().rowById.has('between'), false);

  expectOk(await engine.redo());
  assert.equal(engine.getContentHash(), insertedHash);
  assert.deepEqual(engine.getIndexes().childrenByParent.get('root'), [
    'left',
    'between',
    'right',
  ]);

  const independentlyHashed = hashBomDocumentContent(engine.getSnapshot(), schema);
  assert.equal(independentlyHashed.ok, true);
  assert.equal(independentlyHashed.value, insertedHash);
});

test('enforces entry and byte budgets across Undo and Redo history', async () => {
  const engine = createEngine({
    history: { maxEntries: 2, maxBytes: 1024 * 1024 },
  });
  for (const value of ['one', 'two', 'three']) {
    expectOk(
      await engine.execute({
        type: 'setField',
        occurrenceId: 'left',
        fieldPath: ['note'],
        value,
      }),
    );
  }
  assert.equal(engine.getHistoryState().undoEntries, 2);
  assert.equal(engine.getHistoryState().evictedEntries, 1);
  assert.equal(engine.getHistoryState().bytes > 0, true);

  expectOk(await engine.undo());
  expectOk(await engine.undo());
  expectError(await engine.undo(), BOM_TRANSACTION_ERROR_CODES.historyEmpty);
  assert.equal(engine.getHistoryState().redoEntries, 2);

  const byteLimited = createEngine({
    history: { maxEntries: 100, maxBytes: 1 },
  });
  expectOk(
    await byteLimited.execute({
      type: 'setField',
      occurrenceId: 'left',
      fieldPath: ['note'],
      value: 'too-large-for-history',
    }),
  );
  assert.deepEqual(byteLimited.getHistoryState(), {
    maxEntries: 100,
    maxBytes: 1,
    undoEntries: 0,
    redoEntries: 0,
    bytes: 0,
    evictedEntries: 1,
  });
});

test('beforeApply is synchronous, read-only, cancellable, FIFO-safe, and rejects reentry', async () => {
  let engine;
  let callCount = 0;
  let preparedSeen;
  let reentrantResult;
  engine = createEngine({
    beforeApply(prepared) {
      callCount += 1;
      preparedSeen = prepared;
      if (callCount === 1) {
        reentrantResult = engine.execute({
          type: 'setField',
          occurrenceId: 'right',
          fieldPath: ['note'],
          value: 'reentrant',
        });
        return false;
      }
      return true;
    },
  });
  const snapshotBefore = engine.getSnapshot();
  const indexesBefore = engine.getIndexes();
  const hashBefore = engine.getContentHash();
  const historyBefore = engine.getHistoryState();

  const cancelledPromise = engine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'cancelled',
  });
  const followingPromise = engine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'accepted-after-cancel',
  });
  const [cancelled, following] = await Promise.all([
    cancelledPromise,
    followingPromise,
  ]);

  expectError(cancelled, BOM_TRANSACTION_ERROR_CODES.beforeApplyRejected);
  expectOk(following);
  expectError(await reentrantResult, BOM_TRANSACTION_ERROR_CODES.reentrantExecute);
  assert.equal(Object.isFrozen(preparedSeen), true);
  assert.equal(Object.isFrozen(preparedSeen.patch), true);
  assert.equal(Object.isFrozen(preparedSeen.snapshot), true);
  assert.equal(Object.isFrozen(preparedSeen.indexes), true);
  assert.equal(preparedSeen.previousSnapshot, snapshotBefore);
  assert.equal(preparedSeen.previousRevision, snapshotBefore.revision);
  assert.notEqual(preparedSeen.revision, snapshotBefore.revision);
  assert.equal(
    engine.getIndexes().rowById.get('left').fields.note,
    'accepted-after-cancel',
  );
  assert.notEqual(engine.getSnapshot(), snapshotBefore);
  assert.notEqual(engine.getIndexes(), indexesBefore);
  assert.notEqual(engine.getContentHash(), hashBefore);
  assert.equal(historyBefore.undoEntries, 0);
  assert.equal(engine.getHistoryState().undoEntries, 1);

  const throwing = createEngine({
    beforeApply() {
      throw new Error('private hook failure');
    },
  });
  const throwingSnapshot = throwing.getSnapshot();
  const throwingHash = throwing.getContentHash();
  const failed = await throwing.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'not-applied',
  });
  expectError(failed, BOM_TRANSACTION_ERROR_CODES.beforeApplyFailed);
  assert.equal(throwing.getSnapshot(), throwingSnapshot);
  assert.equal(throwing.getContentHash(), throwingHash);
  assert.equal(throwing.getHistoryState().undoEntries, 0);
});
test('same-parent move rebalances the complete pre-move sibling set', async () => {
  const snapshot = createSnapshot({ adjacentKeys: true });
  snapshot.nodes[0].knownChildCount = 3;
  snapshot.nodes.push({
    occurrenceId: 'mover',
    kind: 'material',
    materialCode: 'MAT-MOVER',
    parentId: 'root',
    positionKey: 'z',
    childrenState: 'complete',
    knownChildCount: 0,
    fields: { name: 'Mover' },
  });
  const engine = createEngine({ snapshot });
  const initialHash = engine.getContentHash();

  const moved = expectOk(
    await engine.execute({
      type: 'moveSubtree',
      occurrenceId: 'mover',
      newParentId: 'root',
      placement: { beforeOccurrenceId: 'right' },
    }),
  );
  assert.deepEqual(
    moved.patch.operations.map((operation) => operation.op),
    ['rebalancePositions', 'moveSubtree'],
  );
  assert.deepEqual(engine.getIndexes().childrenByParent.get('root'), [
    'left',
    'mover',
    'right',
  ]);

  expectOk(await engine.undo());
  assert.equal(engine.getContentHash(), initialHash);
  assert.deepEqual(engine.getIndexes().childrenByParent.get('root'), [
    'left',
    'right',
    'mover',
  ]);
});
test('applyPatch is defensive and partial snapshots reject structural writes', async () => {
  const engine = createEngine();
  const initialHash = engine.getContentHash();
  const applied = expectOk(
    await engine.applyPatch({
      protocolVersion: PROTOCOL_VERSION,
      documentId: 'document-1',
      baseRevision: engine.getSnapshot().revision,
      transactionId: 'transaction-direct-patch',
      origin: 'test:patch',
      timestamp: '2026-07-19T00:00:04.000Z',
      operations: [
        {
          op: 'updateField',
          occurrenceId: 'right',
          fieldPath: ['note'],
          value: 'direct',
        },
      ],
    }),
  );
  assert.equal(applied.inversePatch.operations[0].op, 'unsetField');
  assert.equal(engine.getIndexes().rowById.get('right').fields.note, 'direct');
  expectOk(await engine.undo());
  assert.equal(engine.getContentHash(), initialHash);

  const snapshotBeforeMalformed = engine.getSnapshot();
  const malformed = await engine.applyPatch({
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    baseRevision: snapshotBeforeMalformed.revision,
    transactionId: 'transaction-malformed',
    origin: 'test:patch',
    timestamp: '2026-07-19T00:00:05.000Z',
    operations: [{ op: 'not-a-real-operation' }],
  });
  expectError(malformed, BOM_TRANSACTION_ERROR_CODES.operationUnsupported);
  assert.equal(engine.getSnapshot(), snapshotBeforeMalformed);

  const partialSnapshot = createSnapshot();
  partialSnapshot.completeness = 'partial';
  const partial = createEngine({ snapshot: partialSnapshot });
  expectOk(
    await partial.execute({
      type: 'setField',
      occurrenceId: 'left',
      fieldPath: ['note'],
      value: 'loaded-field-edit',
    }),
  );
  const partialBeforeMove = partial.getSnapshot();
  const move = await partial.execute({
    type: 'moveSubtree',
    occurrenceId: 'left',
    newParentId: null,
    placement: { at: 'last' },
  });
  expectError(move, BOM_TRANSACTION_ERROR_CODES.partialStructureUnsupported);
  assert.equal(partial.getSnapshot(), partialBeforeMove);
});
test('beforeApply false leaves Snapshot, revision, indexes, hash, and history unchanged', async () => {
  const engine = createEngine({ beforeApply: () => false });
  const snapshot = engine.getSnapshot();
  const indexes = engine.getIndexes();
  const contentHash = engine.getContentHash();
  const history = engine.getHistoryState();

  const result = await engine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'cancelled',
  });

  expectError(result, BOM_TRANSACTION_ERROR_CODES.beforeApplyRejected);
  assert.equal(engine.getSnapshot(), snapshot);
  assert.equal(engine.getSnapshot().revision, snapshot.revision);
  assert.equal(engine.getIndexes(), indexes);
  assert.equal(engine.getContentHash(), contentHash);
  assert.deepEqual(engine.getHistoryState(), history);
});
test('nested writes never replace an existing scalar prefix and Patch metadata is validated', async () => {
  const nestedSchema = {
    ...schema,
    fields: [
      ...schema.fields,
      {
        fieldId: 'category',
        path: ['meta', 'category'],
        type: { kind: 'string', maxLength: 100 },
        required: false,
        nullable: false,
      },
    ],
    allowAdditionalFields: true,
  };
  const nestedSnapshot = createSnapshot();
  nestedSnapshot.nodes[1].fields = { name: 'Left', meta: 'legacy' };
  const engine = createEngine({ schema: nestedSchema, snapshot: nestedSnapshot });
  const snapshotBefore = engine.getSnapshot();
  const indexesBefore = engine.getIndexes();
  const hashBefore = engine.getContentHash();

  const command = await engine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['meta', 'category'],
    value: 'mechanical',
  });
  expectError(command, BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid);
  assert.equal(engine.getSnapshot(), snapshotBefore);
  assert.equal(engine.getIndexes(), indexesBefore);
  assert.equal(engine.getContentHash(), hashBefore);
  assert.equal(engine.getIndexes().rowById.get('left').fields.meta, 'legacy');

  const patch = await engine.applyPatch({
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    baseRevision: snapshotBefore.revision,
    transactionId: 'transaction-nested-patch',
    origin: 'test:patch',
    timestamp: '2026-07-19T00:00:06.000Z',
    operations: [
      {
        op: 'updateField',
        occurrenceId: 'left',
        fieldPath: ['meta', 'category'],
        value: 'electrical',
      },
    ],
  });
  expectError(patch, BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid);
  assert.equal(engine.getSnapshot(), snapshotBefore);

  const malformedMetadata = await engine.applyPatch({
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    baseRevision: snapshotBefore.revision,
    transactionId: '',
    origin: 'test:patch',
    timestamp: '2026-07-19T00:00:07.000Z',
    operations: [
      {
        op: 'updateField',
        occurrenceId: 'left',
        fieldPath: ['name'],
        value: 'not-applied',
      },
    ],
  });
  expectError(malformedMetadata, BOM_TRANSACTION_ERROR_CODES.metadataInvalid);
  assert.equal(engine.getSnapshot(), snapshotBefore);
});

test('applyPatch rejects structural operations on a partial Snapshot', async () => {
  const partialSnapshot = createSnapshot();
  partialSnapshot.completeness = 'partial';
  const engine = createEngine({ snapshot: partialSnapshot });
  const snapshotBefore = engine.getSnapshot();
  const result = await engine.applyPatch({
    protocolVersion: PROTOCOL_VERSION,
    documentId: 'document-1',
    baseRevision: snapshotBefore.revision,
    transactionId: 'transaction-partial-patch',
    origin: 'test:patch',
    timestamp: '2026-07-19T00:00:08.000Z',
    operations: [
      {
        op: 'moveSubtree',
        occurrenceId: 'left',
        newParentId: null,
        positionKey: 'z',
      },
    ],
  });
  expectError(result, BOM_TRANSACTION_ERROR_CODES.partialStructureUnsupported);
  assert.equal(engine.getSnapshot(), snapshotBefore);
  assert.equal(engine.getHistoryState().undoEntries, 0);
});

test('atomically reconciles an exact history suffix and preserves its confirmed prefix', async () => {
  let beforeApplyCalls = 0;
  let finalPrepared;
  const engine = createEngine({
    history: { maxEntries: 4, maxBytes: 1024 * 1024 },
    beforeApply(prepared) {
      beforeApplyCalls += 1;
      if (prepared.patch.origin === 'test:history-reconcile') {
        finalPrepared = prepared;
      }
      return true;
    },
  });
  const prefix = replayBatch(engine, 'tx-prefix', [{
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'prefix',
  }]);
  expectOk(await engine.executeBatch(prefix));
  const failed = replayBatch(engine, 'tx-failed', [{
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'failed',
  }], { dependsOnTransactionId: 'tx-prefix', idempotencyKey: 'key-failed' });
  expectOk(await engine.executeBatch(failed));
  const commandDescendant = replayBatch(engine, 'tx-command-child', [{
    type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'child',
  }], {
    dependsOnTransactionId: 'tx-failed',
    idempotencyKey: 'key-command-child',
  });
  expectOk(await engine.executeBatch(commandDescendant));
  const patchDescendant = replayPatch(engine, 'tx-patch-child', [{
    op: 'updateField', occurrenceId: 'root', fieldPath: ['note'], value: 'patch-child',
  }], {
    dependsOnTransactionId: 'tx-command-child',
    idempotencyKey: 'key-patch-child',
  });
  expectOk(await engine.applyPatch(patchDescendant));
  const callsBeforeReconcile = beforeApplyCalls;

  const reconciled = expectOk(await engine.reconcileHistorySuffix({
    failedTransactionId: 'tx-failed',
    transactionId: 'tx-history-reconcile',
    origin: 'test:history-reconcile',
    timestamp: '2026-07-19T02:01:00.000Z',
    descendants: [
      { kind: 'commands', batch: commandDescendant },
      { kind: 'patch', patch: patchDescendant },
    ],
  }));

  assert.deepEqual(reconciled.removedTransactionIds, [
    'tx-failed', 'tx-command-child', 'tx-patch-child',
  ]);
  assert.deepEqual(reconciled.rollbackOrder, [
    'tx-patch-child', 'tx-command-child', 'tx-failed',
  ]);
  assert.deepEqual(
    reconciled.replayed.map((mapping) => mapping.originalTransactionId),
    ['tx-command-child', 'tx-patch-child'],
  );
  assert.equal(
    reconciled.replayed[0].commit.previousRevision,
    reconciled.rollbackRevision,
  );
  assert.equal(
    reconciled.replayed[0].commit.patch.dependsOnTransactionId,
    undefined,
  );
  assert.equal(
    reconciled.replayed[1].commit.patch.dependsOnTransactionId,
    'tx-command-child',
  );
  assert.equal(reconciled.commit.revision, engine.getSnapshot().revision);
  assert.equal(finalPrepared.patch, reconciled.commit.patch);
  assert.equal(finalPrepared.snapshot, engine.getSnapshot());
  assert.equal(beforeApplyCalls, callsBeforeReconcile + 1);
  assert.equal(engine.getIndexes().rowById.get('left').fields.note, 'prefix');
  assert.equal(engine.getIndexes().rowById.get('right').fields.note, 'child');
  assert.equal(engine.getIndexes().rowById.get('root').fields.note, 'patch-child');
  assert.deepEqual(engine.getHistoryState(), {
    maxEntries: 4,
    maxBytes: 1024 * 1024,
    undoEntries: 3,
    redoEntries: 0,
    bytes: engine.getHistoryState().bytes,
    evictedEntries: 0,
  });
  assert.equal(engine.getHistoryState().bytes > 0, true);

  expectOk(await engine.undo());
  assert.equal(engine.getIndexes().rowById.get('root').fields.note, undefined);
  expectOk(await engine.undo());
  assert.equal(engine.getIndexes().rowById.get('right').fields.note, undefined);
  assert.equal(engine.getIndexes().rowById.get('left').fields.note, 'prefix');
});

test('applies conflict remote operations on the rollback baseline before replay', async () => {
  const engine = createEngine();
  const failed = replayBatch(engine, 'tx-conflict', [{
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'local',
  }], { idempotencyKey: 'key-conflict' });
  expectOk(await engine.executeBatch(failed));
  const descendant = replayBatch(engine, 'tx-after-conflict', [{
    type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'replayed',
  }], {
    dependsOnTransactionId: 'tx-conflict',
    idempotencyKey: 'key-after-conflict',
  });
  expectOk(await engine.executeBatch(descendant));

  const reconciled = expectOk(await engine.reconcileHistorySuffix({
    failedTransactionId: 'tx-conflict',
    transactionId: 'tx-conflict-reconcile',
    origin: 'system:conflict',
    timestamp: '2026-07-19T02:02:00.000Z',
    remoteOperations: [{
      op: 'updateField', occurrenceId: 'left', fieldPath: ['note'], value: 'remote',
    }],
    descendants: [{ kind: 'commands', batch: descendant }],
  }));

  assert.equal(engine.getIndexes().rowById.get('left').fields.note, 'remote');
  assert.equal(engine.getIndexes().rowById.get('right').fields.note, 'replayed');
  assert.equal(
    reconciled.replayed[0].commit.previousRevision,
    reconciled.rollbackRevision,
  );
  assert.equal(engine.getHistoryState().undoEntries, 1);
  expectOk(await engine.undo());
  assert.equal(engine.getIndexes().rowById.get('left').fields.note, 'remote');
  assert.equal(engine.getIndexes().rowById.get('right').fields.note, undefined);
});

test('a failed descendant replay leaves live state, history, and revision counters unchanged', async () => {
  const engine = createEngine();
  const failed = replayBatch(engine, 'tx-insert-failed', [{
    type: 'insertNode',
    parentId: 'root',
    placement: { at: 'last' },
    node: {
      occurrenceId: 'inserted-for-failed-parent',
      kind: 'material',
      materialCode: 'MAT-INSERTED',
      childrenState: 'complete',
      knownChildCount: 0,
      fields: { name: 'Inserted' },
    },
  }], { idempotencyKey: 'key-insert-failed' });
  expectOk(await engine.executeBatch(failed));
  const descendant = replayBatch(engine, 'tx-needs-inserted-node', [{
    type: 'setField',
    occurrenceId: 'inserted-for-failed-parent',
    fieldPath: ['note'],
    value: 'cannot-replay-without-parent',
  }], {
    dependsOnTransactionId: 'tx-insert-failed',
    idempotencyKey: 'key-needs-inserted-node',
  });
  expectOk(await engine.executeBatch(descendant));
  const snapshotBefore = engine.getSnapshot();
  const indexesBefore = engine.getIndexes();
  const hashBefore = engine.getContentHash();
  const historyBefore = engine.getHistoryState();

  const result = await engine.reconcileHistorySuffix({
    failedTransactionId: 'tx-insert-failed',
    transactionId: 'tx-replay-must-fail',
    origin: 'system:reconcile',
    timestamp: '2026-07-19T02:03:00.000Z',
    descendants: [{ kind: 'commands', batch: descendant }],
  });

  expectError(result, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  assert.equal(engine.getSnapshot(), snapshotBefore);
  assert.equal(engine.getIndexes(), indexesBefore);
  assert.equal(engine.getContentHash(), hashBefore);
  assert.deepEqual(engine.getHistoryState(), historyBefore);
  const following = expectOk(await engine.execute({
    type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'after-failure',
  }));
  assert.match(following.revision, /^revision-3-/);
});

test('rejects evicted, non-contiguous, and semantically mismatched suffix requests', async () => {
  const evicted = createEngine({
    history: { maxEntries: 1, maxBytes: 1024 * 1024 },
  });
  const failed = replayBatch(evicted, 'tx-evicted-parent', [{
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'parent',
  }]);
  expectOk(await evicted.executeBatch(failed));
  const descendant = replayBatch(evicted, 'tx-only-retained-child', [{
    type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'child',
  }], { dependsOnTransactionId: 'tx-evicted-parent' });
  expectOk(await evicted.executeBatch(descendant));
  const evictedSnapshot = evicted.getSnapshot();
  expectError(
    await evicted.reconcileHistorySuffix({
      failedTransactionId: 'tx-evicted-parent',
      transactionId: 'tx-cannot-reconcile-evicted',
      origin: 'system:reconcile',
      timestamp: '2026-07-19T02:04:00.000Z',
      descendants: [{ kind: 'commands', batch: descendant }],
    }),
    BOM_TRANSACTION_ERROR_CODES.historySuffixEvicted,
  );
  assert.equal(evicted.getSnapshot(), evictedSnapshot);

  const engine = createEngine();
  const retainedParent = replayBatch(engine, 'tx-retained-parent', [{
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'parent',
  }]);
  expectOk(await engine.executeBatch(retainedParent));
  const retainedChild = replayBatch(engine, 'tx-retained-child', [{
    type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'child',
  }], { dependsOnTransactionId: 'tx-retained-parent' });
  expectOk(await engine.executeBatch(retainedChild));
  const stable = engine.getSnapshot();
  expectError(
    await engine.reconcileHistorySuffix({
      failedTransactionId: 'tx-retained-parent',
      transactionId: 'tx-missing-descendant',
      origin: 'system:reconcile',
      timestamp: '2026-07-19T02:04:01.000Z',
      descendants: [],
    }),
    BOM_TRANSACTION_ERROR_CODES.historySuffixMismatch,
  );
  const mismatchedChild = {
    ...retainedChild,
    origin: 'tampered-origin',
  };
  expectError(
    await engine.reconcileHistorySuffix({
      failedTransactionId: 'tx-retained-parent',
      transactionId: 'tx-mismatched-descendant',
      origin: 'system:reconcile',
      timestamp: '2026-07-19T02:04:02.000Z',
      descendants: [{ kind: 'commands', batch: mismatchedChild }],
    }),
    BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid,
  );
  expectError(
    await engine.reconcileHistorySuffix({
      failedTransactionId: 'tx-retained-parent',
      transactionId: 'tx-invalid-remote',
      origin: 'system:reconcile',
      timestamp: '2026-07-19T02:04:03.000Z',
      remoteOperations: [{ op: 'unknown-remote-operation' }],
      descendants: [{ kind: 'commands', batch: retainedChild }],
    }),
    BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid,
  );
  assert.equal(engine.getSnapshot(), stable);
});

test('reconcile uses one FIFO slot, one final beforeApply, and rejects hook reentry', async () => {
  let engine;
  let request;
  let reentrantResult;
  let reconcileBeforeApplyCalls = 0;
  engine = createEngine({
    beforeApply(prepared) {
      if (prepared.patch.origin === 'system:fifo-reconcile') {
        reconcileBeforeApplyCalls += 1;
        reentrantResult = engine.reconcileHistorySuffix(request);
      }
      return true;
    },
  });
  const failed = replayBatch(engine, 'tx-fifo-failed', [{
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'failed',
  }]);
  expectOk(await engine.executeBatch(failed));
  const descendant = replayBatch(engine, 'tx-fifo-child', [{
    type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'child',
  }], { dependsOnTransactionId: 'tx-fifo-failed' });
  expectOk(await engine.executeBatch(descendant));
  request = {
    failedTransactionId: 'tx-fifo-failed',
    transactionId: 'tx-fifo-reconcile',
    origin: 'system:fifo-reconcile',
    timestamp: '2026-07-19T02:05:00.000Z',
    descendants: [{ kind: 'commands', batch: descendant }],
  };

  const reconcilePromise = engine.reconcileHistorySuffix(request);
  const followingPromise = engine.execute({
    type: 'setField', occurrenceId: 'root', fieldPath: ['note'], value: 'following',
  });
  const [reconcileResult, followingResult] = await Promise.all([
    reconcilePromise,
    followingPromise,
  ]);
  const reconciled = expectOk(reconcileResult);
  const following = expectOk(followingResult);

  assert.equal(following.previousRevision, reconciled.commit.revision);
  assert.equal(reconcileBeforeApplyCalls, 1);
  expectError(
    await reentrantResult,
    BOM_TRANSACTION_ERROR_CODES.reentrantExecute,
  );
});

test('a final reconcile beforeApply cancellation exposes no intermediate state', async () => {
  let finalCalls = 0;
  const engine = createEngine({
    beforeApply(prepared) {
      if (prepared.patch.origin === 'system:cancel-reconcile') {
        finalCalls += 1;
        return false;
      }
      return true;
    },
  });
  const failed = replayBatch(engine, 'tx-cancel-parent', [{
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'failed',
  }]);
  expectOk(await engine.executeBatch(failed));
  const descendant = replayBatch(engine, 'tx-cancel-child', [{
    type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'child',
  }], { dependsOnTransactionId: 'tx-cancel-parent' });
  expectOk(await engine.executeBatch(descendant));
  const snapshot = engine.getSnapshot();
  const indexes = engine.getIndexes();
  const hash = engine.getContentHash();
  const history = engine.getHistoryState();

  expectError(
    await engine.reconcileHistorySuffix({
      failedTransactionId: 'tx-cancel-parent',
      transactionId: 'tx-cancel-reconcile',
      origin: 'system:cancel-reconcile',
      timestamp: '2026-07-19T02:06:00.000Z',
      descendants: [{ kind: 'commands', batch: descendant }],
    }),
    BOM_TRANSACTION_ERROR_CODES.beforeApplyRejected,
  );
  assert.equal(finalCalls, 1);
  assert.equal(engine.getSnapshot(), snapshot);
  assert.equal(engine.getIndexes(), indexes);
  assert.equal(engine.getContentHash(), hash);
  assert.deepEqual(engine.getHistoryState(), history);
});

test('Undo and Redo preserve persistence dependency and idempotency metadata', async () => {
  const engine = createEngine();
  const original = expectOk(await engine.execute({
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'changed',
  }, { transactionId: 'tx-original' }));
  const undone = expectOk(await engine.undo({
    transactionId: 'tx-compensation',
    dependsOnTransactionId: original.transactionId,
    origin: 'history:compensation',
    timestamp: '2026-07-19T02:07:00.000Z',
    idempotencyKey: 'key-compensation',
  }));
  assert.equal(undone.patch.dependsOnTransactionId, 'tx-original');
  assert.equal(undone.patch.idempotencyKey, 'key-compensation');
  const redone = expectOk(await engine.redo({
    transactionId: 'tx-redo-persisted',
    dependsOnTransactionId: 'tx-compensation',
    origin: 'history:redo-persisted',
    timestamp: '2026-07-19T02:07:01.000Z',
    idempotencyKey: 'key-redo-persisted',
  }));
  assert.equal(redone.patch.dependsOnTransactionId, 'tx-compensation');
  assert.equal(redone.patch.idempotencyKey, 'key-redo-persisted');

  const snapshot = engine.getSnapshot();
  const history = engine.getHistoryState();
  expectError(
    await engine.undo({
      transactionId: 'tx-self-dependent-undo',
      dependsOnTransactionId: 'tx-self-dependent-undo',
      idempotencyKey: 'key-invalid-undo',
    }),
    BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
  );
  assert.equal(engine.getSnapshot(), snapshot);
  assert.deepEqual(engine.getHistoryState(), history);
});

test('transaction engine validates configuration, envelopes, and queue boundaries', async () => {
  const baseOptions = {
    snapshot: createSnapshot(),
    schema,
    protocolVersion: PROTOCOL_VERSION,
  };
  const defaultCreated = createBomTransactionEngine(baseOptions);
  assert.equal(defaultCreated.ok, true);
  const defaultEngine = defaultCreated.value;
  const defaultCommit = expectOk(await defaultEngine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'default-factory',
  }));
  assert.match(defaultCommit.revision, /^local-1-/);

  const invalidOptions = [
    { protocolVersion: '' },
    { documentGeneration: -1 },
    { history: { maxEntries: -1 } },
    { history: { maxBytes: -1 } },
    { positionKeyMaxBytes: 0 },
    { positionKeyMaxBytes: 129 },
    { positionKeyMaxBytes: 1.5 },
  ];
  for (const override of invalidOptions) {
    const result = createBomTransactionEngine({ ...baseOptions, ...override });
    expectError(result, BOM_TRANSACTION_ERROR_CODES.configInvalid);
  }

  const metadataEngine = createEngine();
  for (const options of [
    { transactionId: '' },
    { origin: '' },
    { timestamp: '' },
    { transactionId: 1 },
    { origin: 1 },
    { timestamp: 1 },
  ]) {
    expectError(
      await metadataEngine.execute({
        type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'invalid-metadata',
      }, options),
      BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
    );
  }

  const throwingOptions = new Proxy(baseOptions, {
    get(target, property, receiver) {
      if (property === 'protocolVersion') throw new Error('options getter');
      return Reflect.get(target, property, receiver);
    },
  });
  expectError(
    createBomTransactionEngine(throwingOptions),
    BOM_TRANSACTION_ERROR_CODES.internal,
  );

  const badRevision = createEngine({
    revisionFactory: () => '',
  });
  expectError(
    await badRevision.execute({
      type: 'setField',
      occurrenceId: 'left',
      fieldPath: ['note'],
      value: 'invalid-revision',
    }),
    BOM_TRANSACTION_ERROR_CODES.configInvalid,
  );
  const throwingRevision = createEngine({
    revisionFactory: () => {
      throw new Error('revision factory');
    },
  });
  expectError(
    await throwingRevision.execute({
      type: 'setField',
      occurrenceId: 'left',
      fieldPath: ['note'],
      value: 'throws',
    }),
    BOM_TRANSACTION_ERROR_CODES.internal,
  );

  const envelope = createEngine();
  const validBatch = replayBatch(envelope, 'tx-envelope', [{
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'valid',
  }]);
  for (const [field, value, code] of [
    ['protocolVersion', 'wrong', BOM_TRANSACTION_ERROR_CODES.protocolMismatch],
    ['documentId', 'wrong', BOM_TRANSACTION_ERROR_CODES.documentMismatch],
    ['documentGeneration', 99, BOM_TRANSACTION_ERROR_CODES.generationMismatch],
    ['baseRevision', 'stale', BOM_TRANSACTION_ERROR_CODES.baseRevisionMismatch],
  ]) {
    expectError(
      await envelope.executeBatch({ ...validBatch, [field]: value }),
      code,
    );
  }
  const patchBase = replayPatch(envelope, 'tx-patch-envelope', [{
    op: 'updateField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'patch',
  }]);
  for (const [field, value, code] of [
    ['protocolVersion', 'wrong', BOM_TRANSACTION_ERROR_CODES.protocolMismatch],
    ['documentId', 'wrong', BOM_TRANSACTION_ERROR_CODES.documentMismatch],
    ['baseRevision', 'stale', BOM_TRANSACTION_ERROR_CODES.baseRevisionMismatch],
  ]) {
    expectError(await envelope.applyPatch({ ...patchBase, [field]: value }), code);
  }
  expectError(
    await envelope.executeBatch({ ...validBatch, commands: [] }),
    BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
  );
  expectError(
    await envelope.applyPatch({ ...patchBase, operations: [] }),
    BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
  );
  expectError(
    await envelope.executeBatch({ ...validBatch, commands: [null] }),
    BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
  );
  expectError(
    await envelope.applyPatch({ ...patchBase, operations: [null] }),
    BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
  );
  expectError(
    await envelope.execute({ type: 'plugin:unsupported', payload: { ok: true } }),
    BOM_TRANSACTION_ERROR_CODES.commandUnsupported,
  );
});

test('transaction engine covers placement and operation validation branches', async () => {
  const insertNode = (occurrenceId, positionKey = 'b') => ({
    occurrenceId,
    kind: 'material',
    materialCode: `MAT-${occurrenceId}`,
    parentId: 'root',
    positionKey,
    childrenState: 'complete',
    knownChildCount: 0,
    fields: { name: occurrenceId },
  });
  const apply = async (engine, transactionId, operation, code) => {
    expectError(
      await engine.applyPatch(replayPatch(engine, transactionId, [operation])),
      code,
    );
  };

  const duplicate = createEngine();
  await apply(duplicate, 'tx-duplicate', {
    op: 'insertNode',
    node: insertNode('left'),
  }, BOM_TRANSACTION_ERROR_CODES.nodeAlreadyExists);
  await apply(createEngine(), 'tx-parent-missing', {
    op: 'insertNode',
    node: { ...insertNode('new'), parentId: 'missing' },
  }, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await apply(createEngine(), 'tx-position-invalid', {
    op: 'insertNode',
    node: insertNode('new', '\n'),
  }, 'BOM_POSITION_KEY_INVALID');
  await apply(createEngine(), 'tx-delete-missing', {
    op: 'deleteSubtree', occurrenceId: 'missing',
  }, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await apply(createEngine(), 'tx-move-missing', {
    op: 'moveSubtree', occurrenceId: 'missing', newParentId: null, positionKey: 'b',
  }, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await apply(createEngine(), 'tx-move-parent-missing', {
    op: 'moveSubtree', occurrenceId: 'left', newParentId: 'missing', positionKey: 'b',
  }, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await apply(createEngine(), 'tx-move-position-invalid', {
    op: 'moveSubtree', occurrenceId: 'left', newParentId: null, positionKey: '\n',
  }, 'BOM_POSITION_KEY_INVALID');
  await apply(createEngine(), 'tx-update-empty', {
    op: 'updateField', occurrenceId: 'left', fieldPath: [], value: 'x',
  }, BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid);
  await apply(createEngine(), 'tx-update-missing', {
    op: 'updateField', occurrenceId: 'missing', fieldPath: ['note'], value: 'x',
  }, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await apply(createEngine(), 'tx-unset-empty', {
    op: 'unsetField', occurrenceId: 'left', fieldPath: [],
  }, BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid);
  await apply(createEngine(), 'tx-unset-missing', {
    op: 'unsetField', occurrenceId: 'missing', fieldPath: ['note'],
  }, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await apply(createEngine(), 'tx-material-missing', {
    op: 'setMaterialRef', occurrenceId: 'missing', materialCode: 'MISSING',
  }, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await apply(createEngine(), 'tx-reorder-missing', {
    op: 'reorder', occurrenceId: 'missing', positionKey: 'b',
  }, BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await apply(createEngine(), 'tx-reorder-invalid', {
    op: 'reorder', occurrenceId: 'left', positionKey: '\n',
  }, 'BOM_POSITION_KEY_INVALID');

  const valid = createEngine();
  const reordered = expectOk(await valid.applyPatch(replayPatch(valid, 'tx-reorder', [{
    op: 'reorder', occurrenceId: 'left', positionKey: 'b',
  }])));
  assert.equal(reordered.patch.operations[0].op, 'reorder');
  expectOk(await valid.undo());

  const rebalanced = createEngine();
  const rebalancePositions = [
    { occurrenceId: 'left', positionKey: 'A' },
    { occurrenceId: 'right', positionKey: 'z' },
  ];
  const rebalancePatch = replayPatch(rebalanced, 'tx-rebalance-valid', [{
    op: 'rebalancePositions', parentId: 'root', positions: rebalancePositions,
  }]);
  expectOk(await rebalanced.applyPatch(rebalancePatch));
  for (const [transactionId, operation] of [
    ['tx-rebalance-parent', { op: 'rebalancePositions', parentId: 'missing', positions: [] }],
    ['tx-rebalance-length', { op: 'rebalancePositions', parentId: 'root', positions: [] }],
    ['tx-rebalance-unknown', { op: 'rebalancePositions', parentId: 'root', positions: [{ occurrenceId: 'missing', positionKey: 'A' }, { occurrenceId: 'right', positionKey: 'z' }] }],
    ['tx-rebalance-duplicate-id', { op: 'rebalancePositions', parentId: 'root', positions: [{ occurrenceId: 'left', positionKey: 'A' }, { occurrenceId: 'left', positionKey: 'z' }] }],
    ['tx-rebalance-duplicate-key', { op: 'rebalancePositions', parentId: 'root', positions: [{ occurrenceId: 'left', positionKey: 'A' }, { occurrenceId: 'right', positionKey: 'A' }] }],
    ['tx-rebalance-invalid-key', { op: 'rebalancePositions', parentId: 'root', positions: [{ occurrenceId: 'left', positionKey: '\n' }, { occurrenceId: 'right', positionKey: 'z' }] }],
    ['tx-rebalance-order', { op: 'rebalancePositions', parentId: 'root', positions: [{ occurrenceId: 'right', positionKey: 'A' }, { occurrenceId: 'left', positionKey: 'z' }] }],
  ]) {
    const expected = transactionId === 'tx-rebalance-invalid-key'
      ? 'BOM_POSITION_KEY_INVALID'
      : transactionId === 'tx-rebalance-parent'
        ? BOM_TRANSACTION_ERROR_CODES.nodeNotFound
        : BOM_TRANSACTION_ERROR_CODES.placementInvalid;
    await apply(createEngine(), transactionId, operation, expected);
  }

  const nestedSnapshot = createSnapshot();
  nestedSnapshot.nodes[1].fields = { name: 'Left', meta: 'legacy' };
  const nestedSchema = {
    ...schema,
    allowAdditionalFields: true,
    fields: [
      ...schema.fields,
      {
        fieldId: 'category',
        path: ['meta', 'category'],
        type: { kind: 'string', maxLength: 100 },
        required: false,
        nullable: false,
      },
    ],
  };
  await apply(createEngine({ snapshot: nestedSnapshot, schema: nestedSchema }), 'tx-update-conflict', {
    op: 'updateField', occurrenceId: 'left', fieldPath: ['meta', 'category'], value: 'x',
  }, BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid);
  await apply(createEngine({ snapshot: nestedSnapshot, schema: nestedSchema }), 'tx-unset-conflict', {
    op: 'unsetField', occurrenceId: 'left', fieldPath: ['meta', 'category'],
  }, BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid);

  const commandBranches = createEngine();
  await expectErrorAsync(
    commandBranches.execute({
      type: 'insertNode',
      parentId: 'root',
      placement: { at: 'first' },
      node: { occurrenceId: 'left', kind: 'material', materialCode: 'DUP', fields: { name: 'Dup' } },
    }),
    BOM_TRANSACTION_ERROR_CODES.nodeAlreadyExists,
  );
  await expectErrorAsync(
    commandBranches.execute({
      type: 'moveSubtree',
      occurrenceId: 'missing',
      newParentId: null,
      placement: { at: 'last' },
    }),
    BOM_TRANSACTION_ERROR_CODES.nodeNotFound,
  );
  const afterCommit = expectOk(await commandBranches.execute({
      type: 'insertNode',
      parentId: 'root',
      placement: { afterOccurrenceId: 'left' },
      node: { occurrenceId: 'after-node', kind: 'material', materialCode: 'AFTER', fields: { name: 'After' } },
    }));
  assert.equal(afterCommit.patch.operations[0].op, 'insertNode');
  await expectErrorAsync(
    commandBranches.execute({
      type: 'moveSubtree',
      occurrenceId: 'left',
      newParentId: 'root',
      placement: { beforeOccurrenceId: 'left' },
    }),
    BOM_TRANSACTION_ERROR_CODES.placementInvalid,
  );

  const nestedCommand = createEngine({ snapshot: nestedSnapshot, schema: nestedSchema });
  await expectErrorAsync(
    nestedCommand.execute({
      type: 'unsetField',
      occurrenceId: 'left',
      fieldPath: ['meta', 'category'],
    }),
    BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid,
  );
  const expectedPresent = createEngine();
  await expectErrorAsync(
    expectedPresent.execute({
      type: 'unsetField',
      occurrenceId: 'left',
      fieldPath: ['name'],
      expectedPresent: false,
    }),
    BOM_TRANSACTION_ERROR_CODES.fieldPreconditionFailed,
  );

  const partial = createSnapshot();
  partial.completeness = 'partial';
  const partialOperations = [
    {
      op: 'insertNode',
      node: insertNode('partial-insert'),
    },
    { op: 'deleteSubtree', occurrenceId: 'left' },
    { op: 'reorder', occurrenceId: 'left', positionKey: 'b' },
    {
      op: 'rebalancePositions',
      parentId: 'root',
      positions: [{ occurrenceId: 'left', positionKey: 'A' }, { occurrenceId: 'right', positionKey: 'z' }],
    },
  ];
  for (const [index, operation] of partialOperations.entries()) {
    await apply(
      createEngine({ snapshot: structuredClone(partial) }),
      `tx-partial-${index}`,
      operation,
      BOM_TRANSACTION_ERROR_CODES.partialStructureUnsupported,
    );
  }

  const optionalMaterial = createEngine();
  expectOk(await optionalMaterial.execute({
    type: 'setMaterialRef', occurrenceId: 'root',
  }));
});

test('transaction engine closes creation, hook reentry, command, and remote reconcile edges', async () => {
  const invalidSchema = createBomTransactionEngine({
    snapshot: createSnapshot(),
    schema: { ...schema, fields: [{ ...schema.fields[0], path: [] }] },
    protocolVersion: PROTOCOL_VERSION,
    documentGeneration: 7,
  });
  expectError(invalidSchema, 'BOM_SCHEMA_INVALID');

  const invalidSnapshot = createSnapshot();
  invalidSnapshot.roots = ['missing-root'];
  const invalidDocument = createBomTransactionEngine({
    snapshot: invalidSnapshot,
    schema,
    protocolVersion: PROTOCOL_VERSION,
    documentGeneration: 7,
  });
  assert.equal(invalidDocument.ok, false);

  let engine;
  const reentrantResults = [];
  engine = createEngine({
    beforeApply(prepared) {
      if (prepared.patch.origin !== 'test:reentry-matrix') return true;
      reentrantResults.push(
        engine.executeBatch(replayBatch(engine, 'tx-reentrant-batch', [
          { type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'batch' },
        ])),
        engine.applyPatch(replayPatch(engine, 'tx-reentrant-patch', [
          { op: 'updateField', occurrenceId: 'right', fieldPath: ['note'], value: 'patch' },
        ])),
        engine.undo(),
        engine.redo(),
      );
      return true;
    },
  });
  expectOk(await engine.execute({
    type: 'setField',
    occurrenceId: 'left',
    fieldPath: ['note'],
    value: 'reentry-host',
  }, { origin: 'test:reentry-matrix' }));
  for (const result of reentrantResults) {
    expectError(await result, BOM_TRANSACTION_ERROR_CODES.reentrantExecute);
  }

  const commandBranches = createEngine();
  const partialSnapshot = createSnapshot();
  partialSnapshot.completeness = 'partial';
  const partialEngine = createEngine({ snapshot: partialSnapshot });
  await expectErrorAsync(partialEngine.execute({
    type: 'insertNode',
    parentId: 'root',
    placement: { at: 'last' },
    node: { occurrenceId: 'partial-command', kind: 'material', fields: { name: 'partial' } },
  }), BOM_TRANSACTION_ERROR_CODES.partialStructureUnsupported);
  await expectErrorAsync(commandBranches.execute({
    type: 'insertNode',
    parentId: 'missing',
    placement: { at: 'last' },
    node: { occurrenceId: 'missing-parent', kind: 'material', fields: { name: 'missing' } },
  }), BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await expectErrorAsync(commandBranches.execute({
    type: 'insertNode',
    parentId: 'root',
    placement: { beforeOccurrenceId: 'missing' },
    node: { occurrenceId: 'invalid-placement', kind: 'material', fields: { name: 'invalid' } },
  }), BOM_TRANSACTION_ERROR_CODES.placementInvalid);
  await expectErrorAsync(commandBranches.execute({
    type: 'moveSubtree',
    occurrenceId: 'left',
    newParentId: 'missing',
    placement: { at: 'last' },
  }), BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
  await expectErrorAsync(commandBranches.execute({
    type: 'setField', occurrenceId: 'left', fieldPath: [], value: 'invalid',
  }), BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid);
  await expectErrorAsync(commandBranches.execute({
    type: 'unsetField', occurrenceId: 'left', fieldPath: [],
  }), BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid);
  await expectErrorAsync(commandBranches.execute({
    type: 'unsetField', occurrenceId: 'missing', fieldPath: ['note'],
  }), BOM_TRANSACTION_ERROR_CODES.nodeNotFound);

  const reconcile = createEngine();
  const failed = replayBatch(reconcile, 'tx-remote-failed', [
    { type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'local' },
  ]);
  expectOk(await reconcile.executeBatch(failed));
  const descendant = replayBatch(reconcile, 'tx-remote-child', [
    { type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'child' },
  ], { dependsOnTransactionId: 'tx-remote-failed' });
  expectOk(await reconcile.executeBatch(descendant));
  await expectErrorAsync(reconcile.reconcileHistorySuffix({
    failedTransactionId: 'tx-remote-failed',
    transactionId: 'tx-remote-apply-failure',
    origin: 'test:remote-apply-failure',
    timestamp: '2026-07-19T03:00:00.000Z',
    remoteOperations: [{
      op: 'updateField', occurrenceId: 'missing', fieldPath: ['note'], value: 'remote',
    }],
    descendants: [{ kind: 'commands', batch: descendant }],
  }), BOM_TRANSACTION_ERROR_CODES.nodeNotFound);
});

test('transaction engine covers field preconditions, lazy hashes, and history queue edges', async () => {
  const hashEngine = createEngine();
  await expectErrorAsync(
    hashEngine.applyPatch(replayPatch(hashEngine, 'tx-hash-missing', [{
      op: 'updateField',
      occurrenceId: 'left',
      fieldPath: ['note'],
      value: 'new',
      expectedValueHash: 'missing-hash',
    }])),
    BOM_TRANSACTION_ERROR_CODES.fieldPreconditionFailed,
  );
  const expectedNameHash = hashBomFieldValue('Left', schema, schema.fields[0]);
  assert.equal(expectedNameHash.ok, true);
  const validHash = createEngine();
  expectOk(await validHash.applyPatch(replayPatch(validHash, 'tx-hash-valid', [{
    op: 'updateField',
    occurrenceId: 'left',
    fieldPath: ['name'],
    value: 'hashed-update',
    expectedValueHash: expectedNameHash.value,
  }])));
  const wrongHash = createEngine();
  await expectErrorAsync(
    wrongHash.applyPatch(replayPatch(wrongHash, 'tx-hash-wrong', [{
      op: 'updateField',
      occurrenceId: 'left',
      fieldPath: ['name'],
      value: 'wrong-hash-update',
      expectedValueHash: 'wrong-hash',
    }])),
    BOM_TRANSACTION_ERROR_CODES.fieldPreconditionFailed,
  );
  const unknownFieldSnapshot = createSnapshot();
  unknownFieldSnapshot.nodes[1].fields.unlisted = 'existing';
  const unknownFieldEngine = createEngine({
    snapshot: unknownFieldSnapshot,
    schema: { ...schema, allowAdditionalFields: true },
  });
  await expectErrorAsync(
    unknownFieldEngine.applyPatch(replayPatch(unknownFieldEngine, 'tx-hash-unknown-field', [{
      op: 'updateField',
      occurrenceId: 'left',
      fieldPath: ['unlisted'],
      value: 'new',
      expectedValueHash: 'present-but-undeclared',
    }])),
    BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid,
  );
  const unsetMissing = createEngine();
  const unsetCommit = expectOk(await unsetMissing.applyPatch(replayPatch(unsetMissing, 'tx-unset-missing', [{
    op: 'unsetField', occurrenceId: 'left', fieldPath: ['note'],
  }])));
  assert.equal(unsetCommit.inversePatch.operations[0].op, 'unsetField');

  const lazy = createBomTransactionEngine({
    snapshot: createSnapshot(),
    schema,
    protocolVersion: PROTOCOL_VERSION,
    beforeApply(prepared) {
      assert.equal(typeof prepared.contentHash, 'string');
    },
  });
  assert.equal(lazy.ok, true);
  expectOk(await lazy.value.execute({
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'lazy-hash',
  }));
  const invalidDecision = createEngine({ beforeApply: () => 'invalid' });
  await expectErrorAsync(
    invalidDecision.execute({
      type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'invalid-decision',
    }),
    BOM_TRANSACTION_ERROR_CODES.beforeApplyFailed,
  );

  const emptyHistory = createEngine();
  await expectErrorAsync(emptyHistory.undo(), BOM_TRANSACTION_ERROR_CODES.historyEmpty);
  await expectErrorAsync(emptyHistory.redo(), BOM_TRANSACTION_ERROR_CODES.historyEmpty);
  expectOk(await emptyHistory.execute({
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'one',
  }));
  expectOk(await emptyHistory.undo());
  expectOk(await emptyHistory.execute({
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'two',
  }));
  assert.equal(emptyHistory.getHistoryState().redoEntries, 0);

  const malformed = createEngine();
  const malformedRequests = [
    null,
    {},
    { descendants: 'not-an-array' },
    { descendants: [], remoteOperations: {} },
    { descendants: [null] },
    { descendants: [{ kind: 'unknown' }] },
    {
      descendants: [{
        kind: 'commands',
        batch: replayBatch(malformed, 'tx-invalid-command', [{
          type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: undefined,
        }]),
      }],
    },
    {
      descendants: [{
        kind: 'patch',
        patch: replayPatch(malformed, 'tx-invalid-patch', [{ op: 'unknown-operation' }]),
      }],
    },
  ];
  for (const request of malformedRequests) {
    await expectErrorAsync(
      malformed.reconcileHistorySuffix(request),
      request?.descendants?.[0]?.kind === 'commands' || request?.descendants?.[0]?.kind === 'patch'
        ? BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid
        : BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid,
    );
  }
  const metadataInvalid = await malformed.reconcileHistorySuffix({
    failedTransactionId: 'missing',
    transactionId: '',
    origin: 'test',
    timestamp: 'now',
    descendants: [],
  });
  expectError(metadataInvalid, BOM_TRANSACTION_ERROR_CODES.metadataInvalid);
  const failedIdInvalid = await malformed.reconcileHistorySuffix({
    failedTransactionId: '',
    transactionId: 'tx-invalid-failed-id',
    origin: 'test',
    timestamp: 'now',
    descendants: [],
  });
  expectError(failedIdInvalid, BOM_TRANSACTION_ERROR_CODES.historySuffixMismatch);

  const matchEngine = createEngine();
  const matchRequest = await seedReconcile(
    matchEngine,
    'tx-match-failed',
    'tx-match-child',
    'test:match',
  );
  const matchBatch = matchRequest.descendants[0].batch;
  const mismatchedBatches = [
    { ...matchBatch, protocolVersion: 'other-protocol' },
    { ...matchBatch, documentId: 'other-document' },
    { ...matchBatch, documentGeneration: 99 },
    { ...matchBatch, baseRevision: 'other-revision' },
    { ...matchBatch, origin: 'other-origin' },
    { ...matchBatch, timestamp: 'other-time' },
    { ...matchBatch, dependsOnTransactionId: 'other-dependency' },
    { ...matchBatch, idempotencyKey: 'other-idempotency' },
    { ...matchBatch, commands: [{ ...matchBatch.commands[0], value: 'other-value' }] },
  ];
  for (const [index, batch] of mismatchedBatches.entries()) {
    await expectErrorAsync(
      matchEngine.reconcileHistorySuffix({
        ...matchRequest,
        transactionId: `tx-match-invalid-${index}`,
        descendants: [{ kind: 'commands', batch }],
      }),
      BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid,
    );
  }
  const patchKind = replayPatch(matchEngine, matchBatch.transactionId, [{
    op: 'updateField', occurrenceId: 'right', fieldPath: ['note'], value: 'patch-kind',
  }]);
  await expectErrorAsync(
    matchEngine.reconcileHistorySuffix({
      ...matchRequest,
      transactionId: 'tx-match-patch-kind',
      descendants: [{ kind: 'patch', patch: patchKind }],
    }),
    BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid,
  );

  const duplicate = createEngine();
  expectOk(await duplicate.execute({
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'a',
  }, { transactionId: 'duplicate-transaction' }));
  expectOk(await duplicate.execute({
    type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'b',
  }, { transactionId: 'duplicate-transaction' }));
  await expectErrorAsync(
    duplicate.reconcileHistorySuffix({
      failedTransactionId: 'duplicate-transaction',
      transactionId: 'tx-duplicate-reconcile',
      origin: 'test',
      timestamp: 'now',
      descendants: [],
    }),
    BOM_TRANSACTION_ERROR_CODES.historySuffixMismatch,
  );

  const duplicateIds = createEngine();
  const duplicateReplay = replayPatch(duplicateIds, 'duplicate-id', [{
    op: 'updateField', occurrenceId: 'left', fieldPath: ['note'], value: 'x',
  }]);
  await expectErrorAsync(
    duplicateIds.reconcileHistorySuffix({
      failedTransactionId: 'duplicate-id',
      transactionId: 'tx-duplicate-request',
      origin: 'test',
      timestamp: 'now',
      descendants: [{ kind: 'patch', patch: duplicateReplay }],
    }),
    BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid,
  );
  const includedId = replayPatch(duplicateIds, 'tx-included', [{
    op: 'updateField', occurrenceId: 'left', fieldPath: ['note'], value: 'x',
  }]);
  await expectErrorAsync(
    duplicateIds.reconcileHistorySuffix({
      failedTransactionId: 'failed',
      transactionId: 'tx-included',
      origin: 'test',
      timestamp: 'now',
      descendants: [{ kind: 'patch', patch: includedId }],
    }),
    BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid,
  );

  const redoPending = createEngine();
  expectOk(await redoPending.execute({
    type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'redo',
  }));
  expectOk(await redoPending.undo());
  await expectErrorAsync(
    redoPending.reconcileHistorySuffix({
      failedTransactionId: 'missing',
      transactionId: 'tx-redo-pending',
      origin: 'test',
      timestamp: 'now',
      descendants: [],
    }),
    BOM_TRANSACTION_ERROR_CODES.historySuffixMismatch,
  );

  async function seedReconcile(engine, failedId, childId, origin) {
    const failed = replayBatch(engine, failedId, [{
      type: 'setField', occurrenceId: 'left', fieldPath: ['note'], value: 'failed',
    }]);
    expectOk(await engine.executeBatch(failed));
    const child = replayBatch(engine, childId, [{
      type: 'setField', occurrenceId: 'right', fieldPath: ['note'], value: 'child',
    }], { dependsOnTransactionId: failedId });
    child.label = 'reconcile-child';
    expectOk(await engine.executeBatch(child));
    return {
      failedTransactionId: failedId,
      transactionId: `${childId}-reconcile`,
      origin,
      timestamp: 'now',
      descendants: [{ kind: 'commands', batch: child }],
    };
  }

  const approveHash = createBomTransactionEngine({
    snapshot: createSnapshot(),
    schema,
    protocolVersion: PROTOCOL_VERSION,
    documentGeneration: 7,
    beforeApply(prepared) {
      if (prepared.patch.origin === 'test:approve-hash') {
        assert.equal(typeof prepared.contentHash, 'string');
      }
    },
  });
  assert.equal(approveHash.ok, true);
  const approveHashRequest = await seedReconcile(
    approveHash.value,
    'tx-approve-hash-failed',
    'tx-approve-hash-child',
    'test:approve-hash',
  );
  expectOk(await approveHash.value.reconcileHistorySuffix(approveHashRequest));

  const approveThrow = createEngine({
    beforeApply(prepared) {
      if (prepared.patch.origin === 'test:approve-throw') throw new Error('approve throw');
    },
  });
  const approveThrowRequest = await seedReconcile(
    approveThrow,
    'tx-approve-throw-failed',
    'tx-approve-throw-child',
    'test:approve-throw',
  );
  await expectErrorAsync(
    approveThrow.reconcileHistorySuffix(approveThrowRequest),
    BOM_TRANSACTION_ERROR_CODES.beforeApplyFailed,
  );

  const approveInvalid = createEngine({
    beforeApply(prepared) {
      if (prepared.patch.origin === 'test:approve-invalid') return 'invalid';
    },
  });
  const approveInvalidRequest = await seedReconcile(
    approveInvalid,
    'tx-approve-invalid-failed',
    'tx-approve-invalid-child',
    'test:approve-invalid',
  );
  await expectErrorAsync(
    approveInvalid.reconcileHistorySuffix(approveInvalidRequest),
    BOM_TRANSACTION_ERROR_CODES.beforeApplyFailed,
  );
});

