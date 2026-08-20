export function createSchema(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    fields: [
      {
        fieldId: 'name',
        path: ['name'],
        type: { kind: 'string', maxLength: 100 },
        required: true,
        nullable: false,
      },
      {
        fieldId: 'quantity',
        path: ['quantity'],
        type: {
          kind: 'decimal',
          maxScale: 3,
          roundingMode: 'halfEven',
          unitFamily: 'quantity',
        },
        required: true,
        nullable: false,
        defaultValue: { $type: 'decimal', value: '0.000', unit: 'pcs' },
      },
      {
        fieldId: 'category',
        path: ['meta', 'category'],
        type: { kind: 'enum', values: ['raw', 'assembly'] },
        required: false,
        nullable: false,
      },
    ],
    allowAdditionalFields: false,
    recommendedDepth: 6,
    maximumDepth: 128,
    canonicalizationVersion: '1',
    contentHashAlgorithm: 'SHA-256',
    ...overrides,
  };
}

export function createSnapshot(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    documentId: 'document-1',
    revision: 'local-1',
    sourceRevision: 'source-1',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    roots: ['root-a', 'root-b'],
    nodes: [
      {
        occurrenceId: 'root-b',
        kind: 'material',
        materialCode: 'DUPLICATE',
        parentId: null,
        positionKey: 'B',
        fields: {
          name: 'Second root',
          quantity: { $type: 'decimal', value: '2.000', unit: 'pcs' },
        },
      },
      {
        occurrenceId: 'child-a',
        kind: 'material',
        materialId: 'material-a',
        materialCode: 'DUPLICATE',
        parentId: 'root-a',
        positionKey: 'A',
        fields: {
          name: 'Child',
          quantity: { $type: 'decimal', value: '1.000', unit: 'pcs' },
          meta: { category: 'raw' },
        },
      },
      {
        occurrenceId: 'root-a',
        kind: 'group',
        parentId: null,
        positionKey: 'A',
        fields: { name: 'First root' },
      },
    ],
    ...overrides,
  };
}

export function createPartialSnapshot(overrides = {}) {
  const complete = createSnapshot();
  return {
    ...complete,
    completeness: 'partial',
    knownRootCount: 2,
    nodes: complete.nodes.map((node) => ({
      ...node,
      childrenState: 'complete',
      knownChildCount: node.occurrenceId === 'root-a' ? 1 : 0,
    })),
    ...overrides,
  };
}

export function errorCodes(result) {
  return result.ok ? [] : result.errors.map((error) => error.code);
}
