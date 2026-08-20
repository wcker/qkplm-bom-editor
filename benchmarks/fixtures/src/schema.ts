import type { BomFieldSchema, BomSchema } from '@bom-editor/contracts';

import type { BomFixtureDefinition } from './types.js';

const BASE_FIELDS = Object.freeze([
  Object.freeze({
    fieldId: 'name',
    path: Object.freeze(['name']),
    type: Object.freeze({ kind: 'string', maxLength: 200 }),
    required: true,
    nullable: false,
  }),
  Object.freeze({
    fieldId: 'quantity',
    path: Object.freeze(['quantity']),
    type: Object.freeze({
      kind: 'decimal',
      maxScale: 3,
      roundingMode: 'halfEven',
      unitFamily: 'quantity',
    }),
    required: true,
    nullable: false,
  }),
  Object.freeze({
    fieldId: 'category',
    path: Object.freeze(['category']),
    type: Object.freeze({ kind: 'string', maxLength: 32 }),
    required: true,
    nullable: false,
  }),
  Object.freeze({
    fieldId: 'description',
    path: Object.freeze(['description']),
    type: Object.freeze({ kind: 'string', maxLength: 500 }),
    required: true,
    nullable: false,
  }),
] as const satisfies readonly BomFieldSchema[]);

export function getFixtureSchemaVersion(definition: BomFixtureDefinition): string {
  return `benchmark-${definition.generatorVersion}-fields-${definition.fieldCount}`;
}

export function createFixtureSchema(definition: BomFixtureDefinition): BomSchema {
  const fields: BomFieldSchema[] = [...BASE_FIELDS];

  for (let field = BASE_FIELDS.length; field < definition.fieldCount; field += 1) {
    const fieldId = `custom${String(field + 1).padStart(2, '0')}`;
    fields.push(
      Object.freeze({
        fieldId,
        path: Object.freeze([fieldId]),
        type: Object.freeze(
          field % 3 === 0
            ? { kind: 'integer' as const, min: '0', max: '9999' }
            : { kind: 'string' as const, maxLength: 64 },
        ),
        required: true,
        nullable: false,
      }),
    );
  }

  return Object.freeze({
    schemaVersion: getFixtureSchemaVersion(definition),
    fields: Object.freeze(fields),
    allowAdditionalFields: false,
    recommendedDepth: Math.min(6, definition.maxDepth),
    maximumDepth: Math.max(128, definition.maxDepth),
    canonicalizationVersion: '1',
    contentHashAlgorithm: 'SHA-256',
  });
}
