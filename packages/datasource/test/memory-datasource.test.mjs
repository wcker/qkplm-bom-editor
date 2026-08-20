import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOM_DATASOURCE_ERROR_CODES,
  BomDataSourceException,
  createMemoryDataSource,
  validateBomDataSource,
} from '../dist/index.js';

const schema = Object.freeze({
  schemaVersion: '1.0.0',
  fields: Object.freeze([
    Object.freeze({
      fieldId: 'name',
      path: Object.freeze(['name']),
      type: Object.freeze({ kind: 'string', maxLength: 100 }),
      required: true,
      nullable: false,
    }),
  ]),
  allowAdditionalFields: false,
  recommendedDepth: 6,
  maximumDepth: 128,
  canonicalizationVersion: '1',
  contentHashAlgorithm: 'SHA-256',
});

function snapshot() {
  return {
    schemaVersion: '1.0.0',
    documentId: 'memory-document',
    revision: 'revision-0',
    sourceRevision: 'source-0',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: 1,
    roots: ['root'],
    nodes: [
      {
        occurrenceId: 'root',
        kind: 'material',
        materialCode: 'MAT-001',
        parentId: null,
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 0,
        fields: { name: 'Original' },
      },
    ],
  };
}

function source(options = {}) {
  const result = createMemoryDataSource({
    snapshot: snapshot(),
    schema,
    protocolVersion: '1.0.0',
    ...options,
  });
  assert.equal(result.ok, true);
  return result.value;
}

function patch(baseRevision, transactionId, value, idempotencyKey) {
  return {
    protocolVersion: '1.0.0',
    documentId: 'memory-document',
    baseRevision,
    transactionId,
    origin: 'test',
    timestamp: '2026-07-18T00:00:00.000Z',
    idempotencyKey,
    operations: [
      {
        op: 'updateField',
        occurrenceId: 'root',
        fieldPath: ['name'],
        value,
      },
    ],
  };
}

test('capability validation catches method mismatches and hostile accessors', () => {
  const valid = source();
  assert.deepEqual(validateBomDataSource(valid), { ok: true, value: true });

  const missingCommit = {
    capabilities: {
      ...valid.capabilities,
      writable: true,
    },
    loadDocument: valid.loadDocument.bind(valid),
  };
  const mismatch = validateBomDataSource(missingCommit);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, BOM_DATASOURCE_ERROR_CODES.capabilityMismatch);

  const hostile = {};
  Object.defineProperty(hostile, 'capabilities', {
    get() {
      throw new Error('must become a Result');
    },
  });
  assert.equal(validateBomDataSource(hostile).ok, false);
});

test('load owns an immutable snapshot and reports abort without raw data', async () => {
  const memory = source();
  const loaded = await memory.loadDocument({
    signal: new AbortController().signal,
  });
  assert.equal(loaded, memory.getSnapshot());
  assert.equal(Object.isFrozen(loaded), true);
  assert.equal(Object.isFrozen(loaded.nodes), true);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    memory.loadDocument({ signal: controller.signal }),
    (failure) =>
      failure instanceof BomDataSourceException &&
      failure.error.code === BOM_DATASOURCE_ERROR_CODES.aborted,
  );
});

test('writable memory source commits atomically and publishes source revisions', async () => {
  const memory = source();
  const envelopes = [];
  memory.subscribeRemote({
    next(envelope) {
      envelopes.push(envelope);
    },
    error() {},
    resyncRequired() {},
  });
  const controller = new AbortController();
  const response = await memory.commit({
    patch: patch('revision-0', 'tx-1', 'Updated', 'key-1'),
    expectedSourceRevision: 'source-0',
    signal: controller.signal,
  });
  assert.equal(response.status, 'acknowledged');
  assert.equal(memory.getSnapshot().fields, undefined);
  assert.equal(memory.getSnapshot().nodes[0].fields.name, 'Updated');
  assert.equal(memory.getSnapshot().sourceRevision, response.sourceRevision);
  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0].previousSourceRevision, 'source-0');
  assert.equal(envelopes[0].sourceRevision, response.sourceRevision);
  assert.equal(Object.isFrozen(envelopes[0]), true);

  const stale = await memory.commit({
    patch: patch(memory.getSnapshot().revision, 'tx-stale', 'Stale', 'key-stale'),
    expectedSourceRevision: 'source-0',
    signal: controller.signal,
  });
  assert.equal(stale.status, 'conflicted');
  assert.equal(memory.getSnapshot().nodes[0].fields.name, 'Updated');
});

test('idempotency returns the original acknowledgement and rejects key reuse', async () => {
  const memory = source();
  const controller = new AbortController();
  const firstPatch = patch('revision-0', 'tx-1', 'Updated', 'same-key');
  const first = await memory.commit({
    patch: firstPatch,
    signal: controller.signal,
  });
  const duplicate = await memory.commit({
    patch: firstPatch,
    signal: controller.signal,
  });
  assert.equal(first.status, 'acknowledged');
  assert.deepEqual(duplicate, first);

  const reused = await memory.commit({
    patch: patch(memory.getSnapshot().revision, 'tx-2', 'Other', 'same-key'),
    signal: controller.signal,
  });
  assert.equal(reused.status, 'rejected');
  assert.equal(reused.error.code, BOM_DATASOURCE_ERROR_CODES.idempotencyReused);
  assert.equal(memory.getSnapshot().nodes[0].fields.name, 'Updated');
});

test('idempotency fingerprint ignores wire-object insertion order', async () => {
  const memory = source();
  const controller = new AbortController();
  const original = patch('revision-0', 'tx-ordered', 'Updated', 'ordered-key');
  const first = await memory.commit({
    patch: original,
    signal: controller.signal,
  });
  const reordered = {
    operations: original.operations.map((operation) => ({
      value: operation.value,
      fieldPath: operation.fieldPath,
      occurrenceId: operation.occurrenceId,
      op: operation.op,
    })),
    idempotencyKey: original.idempotencyKey,
    timestamp: original.timestamp,
    origin: original.origin,
    transactionId: original.transactionId,
    baseRevision: original.baseRevision,
    documentId: original.documentId,
    protocolVersion: original.protocolVersion,
  };
  const duplicate = await memory.commit({
    patch: reordered,
    signal: controller.signal,
  });

  assert.equal(first.status, 'acknowledged');
  assert.deepEqual(duplicate, first);
  assert.equal(memory.getSnapshot().nodes[0].fields.name, 'Updated');
});

test('read-only, aborted, and destroyed commits never alter the snapshot', async () => {
  const readOnly = source({ writable: false });
  const initial = readOnly.getSnapshot();
  const controller = new AbortController();
  const denied = await readOnly.commit({
    patch: patch('revision-0', 'tx-readonly', 'Denied', 'readonly-key'),
    signal: controller.signal,
  });
  assert.equal(denied.status, 'rejected');
  assert.equal(denied.error.code, BOM_DATASOURCE_ERROR_CODES.readOnly);
  assert.equal(readOnly.getSnapshot(), initial);

  const writable = source();
  const abortedController = new AbortController();
  abortedController.abort();
  const aborted = await writable.commit({
    patch: patch('revision-0', 'tx-aborted', 'Denied', 'aborted-key'),
    signal: abortedController.signal,
  });
  assert.equal(aborted.status, 'rejected');
  assert.equal(aborted.error.code, BOM_DATASOURCE_ERROR_CODES.aborted);

  writable.destroy();
  writable.destroy();
  const destroyed = await writable.commit({
    patch: patch('revision-0', 'tx-destroyed', 'Denied', 'destroyed-key'),
    signal: controller.signal,
  });
  assert.equal(destroyed.status, 'rejected');
  assert.equal(destroyed.error.code, BOM_DATASOURCE_ERROR_CODES.destroyed);
});
