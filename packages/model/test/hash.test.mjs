import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalSerializeBomValue,
  hashBomDocumentContent,
  hashBomDocumentEnvelope,
  hashBomFieldValue,
  normalizeBomSchema,
  sha256Hex,
} from '../dist/index.js';
import {
  createPartialSnapshot,
  createSchema,
  createSnapshot,
} from './fixtures.mjs';

test('pure TypeScript SHA-256 matches standard vectors', () => {
  assert.equal(
    sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('canonical serialization ignores object insertion order but preserves array order', () => {
  const left = canonicalSerializeBomValue({ b: 2, a: [1, 2] });
  const right = canonicalSerializeBomValue({ a: [1, 2], b: 2 });
  const reorderedArray = canonicalSerializeBomValue({ a: [2, 1], b: 2 });
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  assert.equal(reorderedArray.ok, true);
  assert.equal(left.value, right.value);
  assert.notEqual(left.value, reorderedArray.value);
});

test('content hash ignores node input order, document ID, and revisions', () => {
  const schema = createSchema();
  const first = createSnapshot();
  const second = createSnapshot({
    documentId: 'document-2',
    revision: 'local-99',
    sourceRevision: 'source-99',
    nodes: [...first.nodes].reverse(),
  });
  const firstHash = hashBomDocumentContent(first, schema);
  const secondHash = hashBomDocumentContent(second, schema);
  assert.equal(firstHash.ok, true);
  assert.equal(secondHash.ok, true);
  assert.equal(firstHash.value, secondHash.value);
});

test('content hash excludes loading envelope while envelope hash includes it', () => {
  const schema = createSchema();
  const complete = createSnapshot();
  const partial = createPartialSnapshot();
  const completeContent = hashBomDocumentContent(complete, schema);
  const partialContent = hashBomDocumentContent(partial, schema);
  const completeEnvelope = hashBomDocumentEnvelope(complete, schema);
  const partialEnvelope = hashBomDocumentEnvelope(partial, schema);
  assert.equal(completeContent.ok, true);
  assert.equal(partialContent.ok, true);
  assert.equal(completeContent.value, partialContent.value);
  assert.notEqual(completeEnvelope.value, partialEnvelope.value);
});

test('envelope hash changes with revision', () => {
  const schema = createSchema();
  const first = hashBomDocumentEnvelope(createSnapshot(), schema);
  const second = hashBomDocumentEnvelope(
    createSnapshot({ revision: 'local-2' }),
    schema,
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.value, second.value);
});

test('field hash binds scale, field identity, and canonicalization version', () => {
  const schemaResult = normalizeBomSchema(createSchema());
  assert.equal(schemaResult.ok, true);
  const quantity = schemaResult.value.fields.find((field) => field.fieldId === 'quantity');
  const first = hashBomFieldValue(
    { $type: 'decimal', value: '1.0', unit: 'pcs' },
    schemaResult.value,
    quantity,
  );
  const second = hashBomFieldValue(
    { $type: 'decimal', value: '1.00', unit: 'pcs' },
    schemaResult.value,
    quantity,
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.value, second.value);
});
