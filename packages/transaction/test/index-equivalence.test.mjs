import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBomTransactionEngine } from '@bom-editor/transaction';
import {
  buildBomIndexes,
  hashBomDocumentContent,
  LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
} from '@bom-editor/model';

const PROTOCOL_VERSION = '1.0.0';
const STEPS_PER_SEED = 256;
const MAX_NODE_COUNT = 64;
const MIN_NODE_COUNT = 6;
const MAX_GENERATED_DEPTH = 12;
const DEFAULT_SEEDS = Object.freeze([
  0x1a2b3c4d,
  0x5eedc0de,
  0x9e3779b9,
  0xc001d00d,
  0xf00dcafe,
]);

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
    Object.freeze({
      fieldId: 'category',
      path: Object.freeze(['meta', 'category']),
      type: Object.freeze({ kind: 'enum', values: Object.freeze(['raw', 'assembly']) }),
      required: false,
      nullable: false,
    }),
  ]),
  allowAdditionalFields: false,
  recommendedDepth: 6,
  maximumDepth: 64,
  canonicalizationVersion: '1',
  contentHashAlgorithm: 'SHA-256',
});

const replaySeed = process.env.BOM_INDEX_EQUIVALENCE_SEED;
const activeSeeds = replaySeed === undefined
  ? DEFAULT_SEEDS
  : Object.freeze([parseSeed(replaySeed)]);

test(
  'fixed-seed mixed commands keep incremental indexes equivalent to full rebuilds',
  { timeout: 30_000 },
  async () => {
    const aggregateCoverage = createCoverage();
    let executedSteps = 0;

    for (const seed of activeSeeds) {
      const coverage = await runSeed(seed);
      mergeCoverage(aggregateCoverage, coverage);
      executedSteps += STEPS_PER_SEED;
    }

    if (replaySeed === undefined) {
      assert.ok(
        executedSteps >= 1_000,
        `default equivalence gate must execute at least 1000 steps; actual=${executedSteps}`,
      );
    }
    for (const [action, count] of Object.entries(aggregateCoverage)) {
      assert.ok(count > 0, `mixed-command coverage missing action=${action}`);
    }
  },
);

async function runSeed(seed) {
  const rng = createPrng(seed);
  const engine = createEngine(seed);
  const initialHash = engine.getContentHash();
  const initialContent = snapshotContent(engine.getSnapshot());
  const coverage = createCoverage();
  let generatedNodeSequence = 0;

  assertIndexAndHashEquivalence(engine, context(seed, -1, 'initial'));

  for (let step = 0; step < STEPS_PER_SEED; step += 1) {
    const action = chooseAction(engine, rng, step);
    const label = context(seed, step, action);

    if (action === 'invalidBatch') {
      const before = captureEngineState(engine);
      const target = rng.pick(engine.getSnapshot().nodes);
      const result = await engine.executeBatch({
        protocolVersion: PROTOCOL_VERSION,
        documentId: engine.getSnapshot().documentId,
        documentGeneration: 1,
        baseRevision: engine.getSnapshot().revision,
        transactionId: `tx-invalid-${seedHex(seed)}-${step}`,
        origin: 'test:index-equivalence',
        timestamp: timestampFor(step),
        commands: [
          {
            type: 'setField',
            occurrenceId: target.occurrenceId,
            fieldPath: ['note'],
            value: `must-not-leak-${seedHex(seed)}-${step}`,
          },
          {
            type: 'unsetField',
            occurrenceId: target.occurrenceId,
            fieldPath: ['name'],
            expectedPresent: true,
          },
        ],
      });
      assert.equal(result.ok, false, `${label}: invalid batch unexpectedly committed`);
      assert.ok(
        result.errors.some((error) => error.code === 'BOM_FIELD_REQUIRED'),
        `${label}: invalid batch did not fail at the required-field validation point`,
      );
      assertFailureWasAtomic(engine, before, label);
      coverage.invalidBatch += 1;
      continue;
    }

    if (action === 'undo') {
      const result = await engine.undo({
        transactionId: `tx-undo-${seedHex(seed)}-${step}`,
        timestamp: timestampFor(step),
      });
      expectSuccess(result, label);
      coverage.undo += 1;
      assertIndexAndHashEquivalence(engine, label);
      continue;
    }

    if (action === 'redo') {
      const result = await engine.redo({
        transactionId: `tx-redo-${seedHex(seed)}-${step}`,
        timestamp: timestampFor(step),
      });
      expectSuccess(result, label);
      coverage.redo += 1;
      assertIndexAndHashEquivalence(engine, label);
      continue;
    }

    let command;
    switch (action) {
      case 'setField':
        command = createSetFieldCommand(engine, rng, seed, step);
        break;
      case 'unsetField':
        command = createUnsetFieldCommand(engine, rng, seed, step);
        break;
      case 'insertNode':
        generatedNodeSequence += 1;
        command = createInsertCommand(
          engine,
          rng,
          seed,
          step,
          generatedNodeSequence,
        );
        break;
      case 'moveSubtree':
        command = createMoveCommand(engine, rng);
        break;
      case 'deleteSubtree':
        command = createDeleteCommand(engine, rng);
        break;
      case 'setMaterialRef':
        command = createSetMaterialRefCommand(engine, rng, seed, step);
        break;
      default:
        assert.fail(`${label}: unknown generated action`);
    }

    const result = await engine.execute(command, {
      transactionId: `tx-${action}-${seedHex(seed)}-${step}`,
      origin: 'test:index-equivalence',
      timestamp: timestampFor(step),
    });
    expectSuccess(result, label);
    coverage[action] += 1;
    assertIndexAndHashEquivalence(engine, label);
  }

  let undoCheckpoint = 0;
  while (engine.getHistoryState().undoEntries > 0) {
    const label = context(seed, STEPS_PER_SEED + undoCheckpoint, 'fullUndo');
    const result = await engine.undo({
      transactionId: `tx-full-undo-${seedHex(seed)}-${undoCheckpoint}`,
      timestamp: timestampFor(STEPS_PER_SEED + undoCheckpoint),
    });
    expectSuccess(result, label);
    assertIndexAndHashEquivalence(engine, label);
    undoCheckpoint += 1;
  }

  const fullUndoLabel = context(
    seed,
    STEPS_PER_SEED + undoCheckpoint,
    'fullUndoHash',
  );
  assert.deepEqual(
    snapshotContent(engine.getSnapshot()),
    initialContent,
    `${fullUndoLabel}: document content did not return to the initial value`,
  );
  assert.equal(
    engine.getContentHash(),
    initialHash,
    `${fullUndoLabel}: canonical hash did not return to the initial value`,
  );
  return coverage;
}

function chooseAction(engine, rng, step) {
  const history = engine.getHistoryState();
  const snapshot = engine.getSnapshot();
  const nodeCount = snapshot.nodes.length;
  const safeDeletes = safeDeleteCandidates(snapshot, engine.getIndexes());
  const forced = [
    'setField',
    'insertNode',
    'moveSubtree',
    'deleteSubtree',
    'setMaterialRef',
    'setField',
    'unsetField',
    'invalidBatch',
    'undo',
    'redo',
  ];
  if (step < forced.length) {
    return forced[step];
  }
  if (step % 64 === 62 && history.undoEntries > 0) {
    return 'undo';
  }
  if (step % 64 === 63 && history.redoEntries > 0) {
    return 'redo';
  }

  const roll = rng.int(100);
  if (roll < 23) return 'setField';
  if (roll < 35) return 'unsetField';
  if (roll < 51) {
    return nodeCount < MAX_NODE_COUNT ? 'insertNode' : 'setField';
  }
  if (roll < 65) return 'moveSubtree';
  if (roll < 76) {
    return safeDeletes.length > 0 ? 'deleteSubtree' : 'insertNode';
  }
  if (roll < 85) return 'setMaterialRef';
  if (roll < 91) return 'invalidBatch';
  if (roll < 96) {
    return history.undoEntries > 0 ? 'undo' : 'setField';
  }
  return history.redoEntries > 0 ? 'redo' : 'setField';
}

function createSetFieldCommand(engine, rng, seed, step) {
  const node = rng.pick(engine.getSnapshot().nodes);
  const variant = rng.int(3);
  if (variant === 0) {
    return {
      type: 'setField',
      occurrenceId: node.occurrenceId,
      fieldPath: ['name'],
      value: `Name ${seedHex(seed)} ${step}`,
    };
  }
  if (variant === 1) {
    return {
      type: 'setField',
      occurrenceId: node.occurrenceId,
      fieldPath: ['note'],
      value: `Note ${seedHex(seed)} ${step}`,
    };
  }
  return {
    type: 'setField',
    occurrenceId: node.occurrenceId,
    fieldPath: ['meta', 'category'],
    value: rng.int(2) === 0 ? 'raw' : 'assembly',
  };
}

function createUnsetFieldCommand(engine, rng) {
  const candidates = [];
  for (const node of engine.getSnapshot().nodes) {
    if (Object.hasOwn(node.fields, 'note')) {
      candidates.push({ occurrenceId: node.occurrenceId, fieldPath: ['note'] });
    }
    if (
      isRecord(node.fields.meta) &&
      Object.hasOwn(node.fields.meta, 'category')
    ) {
      candidates.push({
        occurrenceId: node.occurrenceId,
        fieldPath: ['meta', 'category'],
      });
    }
  }
  if (candidates.length === 0) {
    return {
      type: 'unsetField',
      occurrenceId: rng.pick(engine.getSnapshot().nodes).occurrenceId,
      fieldPath: ['note'],
      expectedPresent: false,
    };
  }
  const selected = rng.pick(candidates);
  return {
    type: 'unsetField',
    occurrenceId: selected.occurrenceId,
    fieldPath: selected.fieldPath,
    expectedPresent: true,
  };
}

function createInsertCommand(engine, rng, seed, step, sequence) {
  const snapshot = engine.getSnapshot();
  const indexes = engine.getIndexes();
  const parents = [null];
  for (const node of snapshot.nodes) {
    if (depthOf(node.occurrenceId, indexes.rowById) < MAX_GENERATED_DEPTH) {
      parents.push(node.occurrenceId);
    }
  }
  const parentId = rng.pick(parents);
  const material =
    !snapshot.nodes.some((node) => node.kind === 'material') ||
    rng.int(3) !== 0;
  const occurrenceId = `generated-${seedHex(seed)}-${sequence}`;
  return {
    type: 'insertNode',
    parentId,
    placement: createPlacement(indexes, parentId, undefined, rng),
    node: {
      occurrenceId,
      kind: material ? 'material' : 'group',
      ...(material ? { materialCode: `MAT-${rng.int(8)}` } : {}),
      fields: {
        name: `Generated ${sequence}`,
        ...(step % 2 === 0 ? { note: `insert-${step}` } : {}),
      },
    },
  };
}

function createMoveCommand(engine, rng) {
  const snapshot = engine.getSnapshot();
  const indexes = engine.getIndexes();
  const movable = snapshot.nodes.filter((node) => node.occurrenceId !== 'root');
  const node = rng.pick(movable);
  const height = subtreeHeight(node.occurrenceId, indexes.childrenByParent);
  const parents = [null];
  for (const candidate of snapshot.nodes) {
    if (
      candidate.occurrenceId !== node.occurrenceId &&
      !isDescendantOf(candidate.occurrenceId, node.occurrenceId, indexes.rowById) &&
      depthOf(candidate.occurrenceId, indexes.rowById) + height < MAX_GENERATED_DEPTH
    ) {
      parents.push(candidate.occurrenceId);
    }
  }
  const newParentId = rng.pick(parents);
  return {
    type: 'moveSubtree',
    occurrenceId: node.occurrenceId,
    newParentId,
    placement: createPlacement(indexes, newParentId, node.occurrenceId, rng),
  };
}

function createDeleteCommand(engine, rng) {
  const snapshot = engine.getSnapshot();
  const indexes = engine.getIndexes();
  const candidates = safeDeleteCandidates(snapshot, indexes);
  assert.ok(candidates.length > 0, 'generator invariant: no safe delete candidate');
  return {
    type: 'deleteSubtree',
    occurrenceId: rng.pick(candidates).occurrenceId,
  };
}

function safeDeleteCandidates(snapshot, indexes) {
  const materialCount = snapshot.nodes.filter(
    (node) => node.kind === 'material',
  ).length;
  return snapshot.nodes.filter((node) => {
    if (node.occurrenceId === 'root') return false;
    const subtree = subtreeFacts(
      node.occurrenceId,
      indexes.childrenByParent,
      indexes.rowById,
    );
    return (
      snapshot.nodes.length - subtree.size >= MIN_NODE_COUNT &&
      materialCount - subtree.materialCount > 0
    );
  });
}

function createSetMaterialRefCommand(engine, rng, seed, step) {
  const materials = engine.getSnapshot().nodes.filter(
    (node) => node.kind === 'material',
  );
  assert.ok(materials.length > 0, 'generator invariant: no material node');
  const node = rng.pick(materials);
  return {
    type: 'setMaterialRef',
    occurrenceId: node.occurrenceId,
    materialId: `material-${seedHex(seed)}-${step}`,
    materialRevision: `r${step}`,
    materialCode: `MAT-${rng.int(8)}`,
  };
}

function createPlacement(indexes, parentId, movingOccurrenceId, rng) {
  const siblings = [...(indexes.childrenByParent.get(parentId) ?? [])].filter(
    (occurrenceId) => occurrenceId !== movingOccurrenceId,
  );
  if (siblings.length === 0) {
    return { at: rng.int(2) === 0 ? 'first' : 'last' };
  }
  switch (rng.int(4)) {
    case 0:
      return { at: 'first' };
    case 1:
      return { at: 'last' };
    case 2:
      return { beforeOccurrenceId: rng.pick(siblings) };
    default:
      return { afterOccurrenceId: rng.pick(siblings) };
  }
}

function createEngine(seed) {
  const created = createBomTransactionEngine({
    snapshot: createSnapshot(seed),
    schema,
    protocolVersion: PROTOCOL_VERSION,
    documentGeneration: 1,
    history: {
      maxEntries: STEPS_PER_SEED + 64,
      maxBytes: 128 * 1024 * 1024,
    },
    revisionFactory: ({ sequence, contentHash }) =>
      `revision-${sequence}-${contentHash.slice(0, 16)}`,
    transactionIdFactory: ({ purpose, sequence }) =>
      `transaction-${purpose}-${sequence}`,
    timestampFactory: () => '2026-07-19T00:00:00.000Z',
  });
  assert.equal(
    created.ok,
    true,
    created.ok
      ? undefined
      : `seed=${seedHex(seed)} engine creation failed: ${formatErrors(created)}`,
  );
  return created.value;
}

function createSnapshot(seed) {
  return {
    schemaVersion: schema.schemaVersion,
    documentId: `document-${seedHex(seed)}`,
    revision: 'revision-0',
    positionKeyCodecVersion: LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
    completeness: 'complete',
    knownRootCount: 1,
    roots: ['root'],
    nodes: [
      node('root', 'group', null, 'M', { name: 'Root', note: 'anchor' }),
      node('assembly-a', 'group', 'root', 'A', {
        name: 'Assembly A',
        meta: { category: 'assembly' },
      }),
      node('material-a1', 'material', 'assembly-a', 'A', {
        name: 'Material A1',
        note: 'removable',
      }, 'MAT-0'),
      node('material-a2', 'material', 'assembly-a', 'M', {
        name: 'Material A2',
      }, 'MAT-1'),
      node('material-a3', 'material', 'assembly-a', 'z', {
        name: 'Material A3',
        meta: { category: 'raw' },
      }, 'MAT-0'),
      node('assembly-b', 'group', 'root', 'M', {
        name: 'Assembly B',
        note: 'second branch',
      }),
      node('material-b1', 'material', 'assembly-b', 'A', {
        name: 'Material B1',
      }, 'MAT-2'),
      node('material-b2', 'material', 'assembly-b', 'M', {
        name: 'Material B2',
        meta: { category: 'raw' },
      }, 'MAT-1'),
      node('material-b3', 'material', 'assembly-b', 'z', {
        name: 'Material B3',
        note: 'leaf',
      }, 'MAT-3'),
      node('loose', 'material', 'root', 'z', {
        name: 'Loose material',
      }, 'MAT-0'),
    ],
  };
}

function node(occurrenceId, kind, parentId, positionKey, fields, materialCode) {
  return {
    occurrenceId,
    kind,
    ...(materialCode === undefined ? {} : { materialCode }),
    parentId,
    positionKey,
    fields,
  };
}

function captureEngineState(engine) {
  return {
    snapshot: engine.getSnapshot(),
    indexes: engine.getIndexes(),
    contentHash: engine.getContentHash(),
    history: engine.getHistoryState(),
  };
}

function assertFailureWasAtomic(engine, before, label) {
  assert.equal(engine.getSnapshot(), before.snapshot, `${label}: Snapshot reference changed`);
  assert.equal(engine.getIndexes(), before.indexes, `${label}: index reference changed`);
  assert.equal(engine.getContentHash(), before.contentHash, `${label}: hash changed`);
  assert.deepEqual(engine.getHistoryState(), before.history, `${label}: history changed`);
  assertIndexAndHashEquivalence(engine, label);
}

function assertIndexAndHashEquivalence(engine, label) {
  const snapshot = engine.getSnapshot();
  const rebuilt = buildBomIndexes(snapshot);
  assert.equal(
    rebuilt.ok,
    true,
    rebuilt.ok ? undefined : `${label}: full index rebuild failed: ${formatErrors(rebuilt)}`,
  );
  assertMapEquivalent(
    engine.getIndexes().rowById,
    rebuilt.value.rowById,
    'rowById',
    label,
  );
  assertMapEquivalent(
    engine.getIndexes().childrenByParent,
    rebuilt.value.childrenByParent,
    'childrenByParent',
    label,
  );
  assertMapEquivalent(
    engine.getIndexes().rowsByMaterialCode,
    rebuilt.value.rowsByMaterialCode,
    'rowsByMaterialCode',
    label,
  );

  const independentlyHashed = hashBomDocumentContent(snapshot, schema);
  assert.equal(
    independentlyHashed.ok,
    true,
    independentlyHashed.ok
      ? undefined
      : `${label}: independent content hash failed: ${formatErrors(independentlyHashed)}`,
  );
  assert.equal(
    engine.getContentHash(),
    independentlyHashed.value,
    `${label}: cached content hash differs from canonical hash`,
  );
}

function assertMapEquivalent(actual, expected, indexName, label) {
  assert.equal(
    actual.size,
    expected.size,
    `${label}: ${indexName}.size differs from full rebuild`,
  );
  assert.deepEqual(
    [...actual],
    [...expected],
    `${label}: ${indexName} iteration differs from full rebuild`,
  );
  for (const [key, value] of expected) {
    assert.equal(
      actual.has(key),
      true,
      `${label}: ${indexName} is missing key=${String(key)}`,
    );
    assert.deepEqual(
      actual.get(key),
      value,
      `${label}: ${indexName} value differs for key=${String(key)}`,
    );
  }
}

function expectSuccess(result, label) {
  assert.equal(
    result.ok,
    true,
    result.ok ? undefined : `${label}: transaction failed: ${formatErrors(result)}`,
  );
}

function depthOf(occurrenceId, rowById) {
  let depth = 0;
  let currentId = occurrenceId;
  while (currentId !== null) {
    depth += 1;
    currentId = rowById.get(currentId)?.parentId ?? null;
  }
  return depth;
}

function isDescendantOf(candidateId, ancestorId, rowById) {
  let currentId = candidateId;
  while (currentId !== null) {
    if (currentId === ancestorId) return true;
    currentId = rowById.get(currentId)?.parentId ?? null;
  }
  return false;
}

function subtreeHeight(occurrenceId, childrenByParent) {
  let height = 0;
  const stack = [[occurrenceId, 1]];
  while (stack.length > 0) {
    const [currentId, currentHeight] = stack.pop();
    height = Math.max(height, currentHeight);
    for (const childId of childrenByParent.get(currentId) ?? []) {
      stack.push([childId, currentHeight + 1]);
    }
  }
  return height;
}

function subtreeFacts(occurrenceId, childrenByParent, rowById) {
  let size = 0;
  let materialCount = 0;
  const stack = [occurrenceId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    size += 1;
    if (rowById.get(currentId)?.kind === 'material') {
      materialCount += 1;
    }
    stack.push(...(childrenByParent.get(currentId) ?? []));
  }
  return { size, materialCount };
}

function snapshotContent(snapshot) {
  return {
    roots: [...snapshot.roots],
    nodes: snapshot.nodes.map((node) => ({
      occurrenceId: node.occurrenceId,
      kind: node.kind,
      materialId: node.materialId,
      materialRevision: node.materialRevision,
      materialCode: node.materialCode,
      parentId: node.parentId,
      positionKey: node.positionKey,
      fields: node.fields,
    })),
  };
}

function createPrng(seed) {
  let state = seed >>> 0;
  return Object.freeze({
    int(exclusiveMaximum) {
      assert.ok(exclusiveMaximum > 0, 'PRNG maximum must be positive');
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) % exclusiveMaximum;
    },
    pick(values) {
      assert.ok(values.length > 0, 'PRNG cannot pick from an empty collection');
      return values[this.int(values.length)];
    },
  });
}

function createCoverage() {
  return {
    setField: 0,
    unsetField: 0,
    insertNode: 0,
    moveSubtree: 0,
    deleteSubtree: 0,
    setMaterialRef: 0,
    invalidBatch: 0,
    undo: 0,
    redo: 0,
  };
}

function mergeCoverage(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += source[key];
  }
}

function context(seed, step, action) {
  return `seed=${seedHex(seed)} step=${step} action=${action}`;
}

function seedHex(seed) {
  return `0x${(seed >>> 0).toString(16).padStart(8, '0')}`;
}

function timestampFor(step) {
  return new Date(Date.UTC(2026, 6, 19, 0, 0, 0, step)).toISOString();
}

function formatErrors(result) {
  return result.errors.map((error) => error.code).join(', ');
}

function parseSeed(raw) {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) {
    throw new Error(
      `BOM_INDEX_EQUIVALENCE_SEED must be a 32-bit unsigned integer; received=${raw}`,
    );
  }
  return parsed >>> 0;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
