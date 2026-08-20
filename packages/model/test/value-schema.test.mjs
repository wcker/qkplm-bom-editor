import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeBomFields,
  normalizeBomSchema,
  normalizeBomValue,
} from '../dist/index.js';
import { createSchema, errorCodes } from './fixtures.mjs';

test('BomValue normalizes negative zero and owns an immutable copy', () => {
  const input = { value: -0, nested: [{ label: 'part' }] };
  const result = normalizeBomValue(input);
  assert.equal(result.ok, true);
  assert.equal(Object.is(result.value.value, -0), false);
  assert.equal(result.value.value, 0);
  assert.notEqual(result.value, input);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.nested), true);
  input.nested[0].label = 'mutated';
  assert.equal(result.value.nested[0].label, 'part');
});

test('BomValue reuses a deeply frozen valid input after validation', () => {
  const input = Object.freeze({
    value: 'part',
    nested: Object.freeze([Object.freeze({ label: 'assembly' })]),
  });
  const result = normalizeBomValue(input);

  assert.equal(result.ok, true);
  assert.equal(result.value, input);
  assert.equal(result.value.nested, input.nested);
  assert.equal(result.value.nested[0], input.nested[0]);
});

test('BomValue rejects non-finite numbers and unsupported runtime objects', () => {
  for (const value of [NaN, Infinity, -Infinity, new Date(), new Map()]) {
    const result = normalizeBomValue(value);
    assert.equal(result.ok, false);
  }
});

test('BomValue rejects accessors, sparse arrays, cycles, and dangerous keys', () => {
  const accessor = {};
  Object.defineProperty(accessor, 'secret', {
    enumerable: true,
    get() {
      throw new Error('must not execute');
    },
  });
  const sparse = new Array(2);
  sparse[1] = 'value';
  const cycle = {};
  cycle.self = cycle;
  const dangerous = Object.create(null);
  dangerous.__proto__ = 'pollution';

  assert.deepEqual(errorCodes(normalizeBomValue(accessor)), ['BOM_VALUE_NOT_WIRE_SAFE']);
  assert.deepEqual(errorCodes(normalizeBomValue(sparse)), ['BOM_VALUE_NOT_WIRE_SAFE']);
  assert.deepEqual(errorCodes(normalizeBomValue(cycle)), ['BOM_VALUE_CYCLE']);
  assert.deepEqual(errorCodes(normalizeBomValue(dangerous)), ['BOM_VALUE_DANGEROUS_KEY']);
});

test('tagged integers and decimals enforce canonical text and preserve scale', () => {
  const accepted = normalizeBomValue({ $type: 'decimal', value: '1.2300', unit: 'kg' });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.value, '1.2300');

  for (const value of [
    { $type: 'integer', value: '-0' },
    { $type: 'integer', value: '+1' },
    { $type: 'integer', value: '01' },
    { $type: 'decimal', value: '-0.00' },
    { $type: 'decimal', value: '1e3' },
  ]) {
    assert.equal(normalizeBomValue(value).ok, false);
  }
});

test('Schema normalization rejects duplicate, prefix, and dangerous paths', () => {
  const duplicate = createSchema({
    fields: [
      { fieldId: 'a', path: ['a'], type: { kind: 'string' }, required: false, nullable: false },
      { fieldId: 'a', path: ['b'], type: { kind: 'string' }, required: false, nullable: false },
    ],
  });
  assert.ok(errorCodes(normalizeBomSchema(duplicate)).includes('BOM_SCHEMA_DUPLICATE_FIELD_ID'));

  const prefix = createSchema({
    fields: [
      { fieldId: 'a', path: ['a'], type: { kind: 'json', maxBytes: 100 }, required: false, nullable: false },
      { fieldId: 'b', path: ['a', 'b'], type: { kind: 'string' }, required: false, nullable: false },
    ],
  });
  assert.ok(errorCodes(normalizeBomSchema(prefix)).includes('BOM_SCHEMA_PATH_PREFIX_CONFLICT'));

  const dangerous = createSchema({
    fields: [
      { fieldId: 'bad', path: ['__proto__'], type: { kind: 'string' }, required: false, nullable: false },
    ],
  });
  assert.equal(normalizeBomSchema(dangerous).ok, false);
});

test('Schema validates bounds, enum uniqueness, depth, and defaults', () => {
  const invalid = createSchema({
    recommendedDepth: 9,
    maximumDepth: 2,
    fields: [
      {
        fieldId: 'quantity',
        path: ['quantity'],
        type: { kind: 'decimal', maxScale: 2, roundingMode: 'halfEven' },
        required: true,
        nullable: false,
        defaultValue: { $type: 'decimal', value: '1.234' },
      },
      {
        fieldId: 'enum',
        path: ['enum'],
        type: { kind: 'enum', values: ['x', 'x'] },
        required: false,
        nullable: false,
      },
    ],
  });
  const codes = errorCodes(normalizeBomSchema(invalid));
  assert.ok(codes.includes('BOM_SCHEMA_INVALID_CONSTRAINT'));
  assert.ok(codes.includes('BOM_SCHEMA_INVALID_DEFAULT'));
});

test('field normalization applies defaults and rejects undeclared leaves', () => {
  const schemaResult = normalizeBomSchema(createSchema());
  assert.equal(schemaResult.ok, true);

  const normalized = normalizeBomFields({ name: 'Part' }, schemaResult.value);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.quantity.value, '0.000');
  assert.equal(Object.isFrozen(normalized.value), true);

  const additional = normalizeBomFields(
    { name: 'Part', unexpected: true },
    schemaResult.value,
  );
  assert.deepEqual(errorCodes(additional), ['BOM_FIELD_ADDITIONAL']);
  assert.equal(additional.errors[0].safeContext.path, '$.fields.unexpected');
});

test('nested defaults reject an existing scalar path prefix', () => {
  const schemaResult = normalizeBomSchema(
    createSchema({
      allowAdditionalFields: true,
      fields: [
        {
          fieldId: 'category',
          path: ['meta', 'category'],
          type: { kind: 'enum', values: ['raw', 'assembly'] },
          required: false,
          nullable: false,
          defaultValue: 'raw',
        },
      ],
    }),
  );
  assert.equal(schemaResult.ok, true);

  const result = normalizeBomFields({ meta: 'must-not-be-overwritten' }, schemaResult.value);
  assert.deepEqual(errorCodes(result), ['BOM_FIELD_TYPE_MISMATCH']);
  assert.equal(result.errors[0].safeContext.path, '$.fields.meta');
});

test('field types enforce safe integers, scale, calendar dates, and UTC instants', () => {
  const schemaResult = normalizeBomSchema(
    createSchema({
      fields: [
        { fieldId: 'count', path: ['count'], type: { kind: 'integer', min: '-2', max: '2' }, required: true, nullable: false },
        { fieldId: 'price', path: ['price'], type: { kind: 'decimal', maxScale: 2, roundingMode: 'halfEven' }, required: true, nullable: false },
        { fieldId: 'day', path: ['day'], type: { kind: 'date', representation: 'iso-date' }, required: true, nullable: false },
        { fieldId: 'instant', path: ['instant'], type: { kind: 'datetime', representation: 'iso-instant' }, required: true, nullable: false },
      ],
    }),
  );
  assert.equal(schemaResult.ok, true);

  const invalid = normalizeBomFields(
    {
      count: Number.MAX_SAFE_INTEGER + 1,
      price: { $type: 'decimal', value: '1.234' },
      day: '2025-02-29',
      instant: '2026-01-01T24:00:00Z',
    },
    schemaResult.value,
  );
  const codes = errorCodes(invalid);
  assert.ok(codes.includes('BOM_INTEGER_NOT_CANONICAL'));
  assert.ok(codes.includes('BOM_DECIMAL_SCALE_EXCEEDED'));
  assert.ok(codes.includes('BOM_DATE_INVALID'));
  assert.ok(codes.includes('BOM_DATETIME_INVALID'));
  assert.deepEqual(
    invalid.errors.map((error) => error.safeContext.path),
    ['$.fields.count', '$.fields.price', '$.fields.day', '$.fields.instant'],
  );
});
