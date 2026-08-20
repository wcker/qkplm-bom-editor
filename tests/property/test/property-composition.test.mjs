import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBomIndexes } from '../../../packages/model/dist/index.js';
import { createBomTransactionEngine } from '../../../packages/transaction/dist/index.js';
import { createVisibleProjection } from '../../../packages/visible-projection/dist/index.js';

const PROTOCOL_VERSION = '1.0.0';
const STEPS_PER_SEED = 192;
const DEFAULT_SEEDS = Object.freeze([
  0x13579bdf,
  0x5eedc0de,
  0xc001d00d,
]);

const schema = Object.freeze({
  schemaVersion: 'property-schema-v1',
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
      type: Object.freeze({
        kind: 'enum',
        values: Object.freeze(['raw', 'assembly']),
      }),
      required: false,
      nullable: false,
    }),
  ]),
  allowAdditionalFields: false,
  recommendedDepth: 8,
  maximumDepth: 64,
  canonicalizationVersion: '1',
  contentHashAlgorithm: 'SHA-256',
});

const replaySeed = process.env.BOM_PROPERTY_SEED;
const activeSeeds = replaySeed === undefined
  ? DEFAULT_SEEDS
  : Object.freeze([parseSeed(replaySeed)]);

for (const seed of activeSeeds) {
  test(
    `transaction/model/visible state agrees with independent oracle seed=${seedHex(seed)}`,
    { timeout: 30_000 },
    async () => {
      process.stdout.write(
        `[property-gate] seed=${seedHex(seed)} steps=${STEPS_PER_SEED} ` +
          `replay=BOM_PROPERTY_SEED=${seedHex(seed)}\n`,
      );
      await runSeed(seed);
    },
  );
}

async function runSeed(seed) {
  const rng = createPrng(seed);
  const initialSnapshot = createInitialSnapshot(seed);
  const created = createBomTransactionEngine({
    snapshot: clone(initialSnapshot),
    schema,
    protocolVersion: PROTOCOL_VERSION,
    documentGeneration: 1,
    history: {
      maxEntries: STEPS_PER_SEED + 32,
      maxBytes: 32 * 1024 * 1024,
    },
    revisionFactory: ({ sequence, contentHash }) =>
      `property-r${sequence}-${contentHash.slice(0, 12)}`,
    transactionIdFactory: ({ purpose, sequence }) =>
      `property-${purpose}-${sequence}`,
    timestampFactory: () => '2026-07-20T00:00:00.000Z',
  });
  assert.equal(created.ok, true, formatResultErrors(created));
  const engine = created.value;

  let reference = new ReferenceDocument(initialSnapshot);
  let undoStack = [];
  let redoStack = [];
  const expanded = new Set(['root', 'assembly-a']);
  const coverage = createCoverage();

  assertCombinedState(engine, reference, expanded, rng, context(seed, -1, 'initial'));

  for (let step = 0; step < STEPS_PER_SEED; step += 1) {
    const action = chooseAction(reference, undoStack, redoStack, rng, step);
    const label = context(seed, step, action);

    if (action === 'invalidPatch') {
      const before = captureEngineState(engine);
      const target = rng.pick(reference.nodes());
      const result = await engine.applyPatch(createPatch(engine, seed, step, action, {
        op: 'unsetField',
        occurrenceId: target.occurrenceId,
        fieldPath: ['name'],
      }));
      assert.equal(result.ok, false, `${label}: required field removal committed`);
      assert.ok(
        result.errors.some((error) => error.code === 'BOM_FIELD_REQUIRED'),
        `${label}: expected BOM_FIELD_REQUIRED; actual=${formatResultErrors(result)}`,
      );
      assert.equal(engine.getSnapshot(), before.snapshot, `${label}: snapshot reference changed`);
      assert.equal(engine.getIndexes(), before.indexes, `${label}: index reference changed`);
      assert.equal(engine.getContentHash(), before.contentHash, `${label}: content hash changed`);
      assert.deepEqual(engine.getHistoryState(), before.history, `${label}: history changed`);
      coverage.invalidPatch += 1;
      assertCombinedState(engine, reference, expanded, rng, label);
      continue;
    }

    if (action === 'undo') {
      const result = await engine.undo({
        transactionId: `property-undo-${seedHex(seed)}-${step}`,
        timestamp: timestampFor(step),
      });
      assert.equal(result.ok, true, `${label}: ${formatResultErrors(result)}`);
      assert.ok(undoStack.length > 0, `${label}: reference undo stack is empty`);
      redoStack.push(reference);
      reference = undoStack.pop();
      coverage.undo += 1;
      assertCombinedState(engine, reference, expanded, rng, label);
      continue;
    }

    if (action === 'redo') {
      const result = await engine.redo({
        transactionId: `property-redo-${seedHex(seed)}-${step}`,
        timestamp: timestampFor(step),
      });
      assert.equal(result.ok, true, `${label}: ${formatResultErrors(result)}`);
      assert.ok(redoStack.length > 0, `${label}: reference redo stack is empty`);
      undoStack.push(reference);
      reference = redoStack.pop();
      coverage.redo += 1;
      assertCombinedState(engine, reference, expanded, rng, label);
      continue;
    }

    const generated = createOperation(action, reference, rng, seed, step);
    const candidate = reference.copy();
    candidate.apply(generated.operation);
    const result = await engine.applyPatch(
      createPatch(engine, seed, step, generated.action, generated.operation),
    );
    assert.equal(result.ok, true, `${label}: ${formatResultErrors(result)}`);
    undoStack.push(reference);
    reference = candidate;
    redoStack = [];
    coverage[generated.action] += 1;
    assertCombinedState(engine, reference, expanded, rng, label);
  }

  for (const [action, count] of Object.entries(coverage)) {
    assert.ok(count > 0, `seed=${seedHex(seed)} missing action coverage=${action}`);
  }
}

function chooseAction(reference, undoStack, redoStack, rng, step) {
  const forced = [
    'updateField',
    'insertNode',
    'moveSubtree',
    'setMaterialRef',
    'reorder',
    'unsetField',
    'deleteSubtree',
    'invalidPatch',
    'undo',
    'redo',
  ];
  if (step < forced.length) return forced[step];
  if (step % 48 === 46 && undoStack.length > 0) return 'undo';
  if (step % 48 === 47 && redoStack.length > 0) return 'redo';

  const roll = rng.int(100);
  if (roll < 21) return 'updateField';
  if (roll < 32) return 'unsetField';
  if (roll < 47) return reference.size < 48 ? 'insertNode' : 'updateField';
  if (roll < 61) return 'moveSubtree';
  if (roll < 70) {
    return reference.safeDeleteCandidates().length > 0
      ? 'deleteSubtree'
      : 'updateField';
  }
  if (roll < 80) return 'setMaterialRef';
  if (roll < 88) return 'reorder';
  if (roll < 92) return 'invalidPatch';
  if (roll < 96) return undoStack.length > 0 ? 'undo' : 'updateField';
  return redoStack.length > 0 ? 'redo' : 'updateField';
}

function createOperation(action, reference, rng, seed, step) {
  switch (action) {
    case 'updateField': {
      const node = rng.pick(reference.nodes());
      switch (rng.int(3)) {
        case 0:
          return operation(action, {
            op: 'updateField',
            occurrenceId: node.occurrenceId,
            fieldPath: ['name'],
            value: `Name ${seedHex(seed)} ${step}`,
          });
        case 1:
          return operation(action, {
            op: 'updateField',
            occurrenceId: node.occurrenceId,
            fieldPath: ['note'],
            value: `Note ${seedHex(seed)} ${step}`,
          });
        default:
          return operation(action, {
            op: 'updateField',
            occurrenceId: node.occurrenceId,
            fieldPath: ['meta', 'category'],
            value: rng.int(2) === 0 ? 'raw' : 'assembly',
          });
      }
    }
    case 'unsetField': {
      const candidates = reference.optionalFieldPaths();
      if (candidates.length === 0) {
        const node = rng.pick(reference.nodes());
        return operation('updateField', {
          op: 'updateField',
          occurrenceId: node.occurrenceId,
          fieldPath: ['note'],
          value: `Fallback note ${step}`,
        });
      }
      const selected = rng.pick(candidates);
      return operation(action, {
        op: 'unsetField',
        occurrenceId: selected.occurrenceId,
        fieldPath: selected.fieldPath,
      });
    }
    case 'insertNode': {
      const parentId = rng.pick([null, ...reference.nodes().map((node) => node.occurrenceId)]);
      const material = rng.int(4) !== 0;
      const occurrenceId = `insert-${seedHex(seed).slice(2)}-${step}`;
      return operation(action, {
        op: 'insertNode',
        node: {
          occurrenceId,
          kind: material ? 'material' : 'group',
          ...(material ? { materialCode: `MAT-${rng.int(12)}` } : {}),
          parentId,
          positionKey: uniquePosition('I', seed, step),
          fields: {
            name: `Inserted ${step}`,
            ...(step % 2 === 0 ? { note: `insert-${step}` } : {}),
          },
        },
      });
    }
    case 'moveSubtree': {
      const node = rng.pick(reference.nodes().filter((entry) => entry.occurrenceId !== 'root'));
      const descendants = reference.descendantIds(node.occurrenceId);
      const parents = [
        null,
        ...reference.nodes()
          .map((entry) => entry.occurrenceId)
          .filter((occurrenceId) => !descendants.has(occurrenceId)),
      ];
      return operation(action, {
        op: 'moveSubtree',
        occurrenceId: node.occurrenceId,
        newParentId: rng.pick(parents),
        positionKey: uniquePosition('M', seed, step),
      });
    }
    case 'deleteSubtree': {
      const candidates = reference.safeDeleteCandidates();
      if (candidates.length === 0) {
        return createOperation('updateField', reference, rng, seed, step);
      }
      return operation(action, {
        op: 'deleteSubtree',
        occurrenceId: rng.pick(candidates).occurrenceId,
      });
    }
    case 'setMaterialRef': {
      const materials = reference.nodes().filter((node) => node.kind === 'material');
      if (materials.length === 0) {
        return createOperation('insertNode', reference, rng, seed, step);
      }
      return operation(action, {
        op: 'setMaterialRef',
        occurrenceId: rng.pick(materials).occurrenceId,
        materialId: `material-${seedHex(seed).slice(2)}-${step}`,
        materialRevision: `revision-${step}`,
        materialCode: `MAT-${rng.int(12)}`,
      });
    }
    case 'reorder': {
      const node = rng.pick(reference.nodes());
      return operation(action, {
        op: 'reorder',
        occurrenceId: node.occurrenceId,
        positionKey: uniquePosition('R', seed, step),
      });
    }
    default:
      assert.fail(`unsupported generated action=${action}`);
  }
}

function assertCombinedState(engine, reference, expanded, rng, label) {
  for (const occurrenceId of [...expanded]) {
    if (!reference.has(occurrenceId)) expanded.delete(occurrenceId);
  }

  const expectedSnapshot = reference.snapshotContent();
  assert.deepEqual(snapshotContent(engine.getSnapshot()), expectedSnapshot, `${label}: snapshot differs`);

  const expectedIndexes = reference.indexOracle();
  assertIndexSet(engine.getIndexes(), expectedIndexes, `${label}: transaction indexes`);

  const rebuilt = buildBomIndexes(engine.getSnapshot());
  assert.equal(rebuilt.ok, true, `${label}: model full index rebuild failed`);
  assertIndexSet(rebuilt.value, expectedIndexes, `${label}: model indexes`);

  const projectionResult = createVisibleProjection(engine.getSnapshot(), {
    indexes: engine.getIndexes(),
    rowHeight: 17,
    expandedIds: [...expanded],
  });
  assert.equal(projectionResult.ok, true, `${label}: visible projection creation failed`);
  const projection = projectionResult.value;
  assertProjection(projection, reference.visiblePreorder(expanded), reference, label);

  const toggledId = rng.pick(reference.nodes()).occurrenceId;
  const shouldExpand = !expanded.has(toggledId);
  const toggled = projection.setExpanded(toggledId, shouldExpand);
  assert.equal(toggled.ok, true, `${label}: expansion toggle failed id=${toggledId}`);
  if (shouldExpand) expanded.add(toggledId);
  else expanded.delete(toggledId);
  assertProjection(projection, reference.visiblePreorder(expanded), reference, `${label}: toggled=${toggledId}`);
}

function assertProjection(projection, expected, reference, label) {
  assert.deepEqual(projection.toArray(), expected, `${label}: visible preorder differs`);
  assert.equal(projection.visibleCount, expected.length, `${label}: visible count differs`);
  assert.equal(projection.totalHeight, expected.length * 17, `${label}: total height differs`);
  for (let index = 0; index < expected.length; index += 1) {
    const occurrenceId = expected[index];
    assert.deepEqual(projection.occurrenceAt(index), { ok: true, value: occurrenceId }, `${label}: occurrenceAt(${index})`);
    assert.deepEqual(projection.indexOf(occurrenceId), { ok: true, value: index }, `${label}: indexOf(${occurrenceId})`);
    assert.deepEqual(projection.depthOf(occurrenceId), { ok: true, value: reference.depthOf(occurrenceId) }, `${label}: depthOf(${occurrenceId})`);
    assert.deepEqual(projection.offsetOf(occurrenceId), { ok: true, value: index * 17 }, `${label}: offsetOf(${occurrenceId})`);
  }
}

function assertIndexSet(actual, expected, label) {
  assert.deepEqual([...actual.rowById], [...expected.rowById], `${label}.rowById`);
  assert.deepEqual(
    [...actual.childrenByParent],
    [...expected.childrenByParent],
    `${label}.childrenByParent`,
  );
  assert.deepEqual(
    [...actual.rowsByMaterialCode],
    [...expected.rowsByMaterialCode],
    `${label}.rowsByMaterialCode`,
  );
}

class ReferenceDocument {
  #envelope;
  #nodes;

  constructor(snapshot) {
    this.#envelope = {
      schemaVersion: snapshot.schemaVersion,
      documentId: snapshot.documentId,
      positionKeyCodecVersion: snapshot.positionKeyCodecVersion,
      completeness: snapshot.completeness,
    };
    this.#nodes = new Map(
      snapshot.nodes.map((node) => [node.occurrenceId, stripDerivedNode(node)]),
    );
  }

  get size() {
    return this.#nodes.size;
  }

  has(occurrenceId) {
    return this.#nodes.has(occurrenceId);
  }

  copy() {
    return new ReferenceDocument({
      ...this.#envelope,
      nodes: this.nodes().map(stripDerivedNode),
    });
  }

  nodes() {
    return this.#orderedNodes().map((node) => clone(node));
  }

  apply(operation) {
    switch (operation.op) {
      case 'insertNode':
        assert.equal(this.#nodes.has(operation.node.occurrenceId), false);
        assert.ok(operation.node.parentId === null || this.#nodes.has(operation.node.parentId));
        this.#nodes.set(operation.node.occurrenceId, stripDerivedNode(operation.node));
        break;
      case 'deleteSubtree':
        for (const occurrenceId of this.descendantIds(operation.occurrenceId)) {
          this.#nodes.delete(occurrenceId);
        }
        break;
      case 'moveSubtree': {
        const node = this.#requireNode(operation.occurrenceId);
        this.#nodes.set(operation.occurrenceId, {
          ...node,
          parentId: operation.newParentId,
          positionKey: operation.positionKey,
        });
        break;
      }
      case 'updateField': {
        const node = this.#requireNode(operation.occurrenceId);
        this.#nodes.set(operation.occurrenceId, {
          ...node,
          fields: setPath(node.fields, operation.fieldPath, operation.value),
        });
        break;
      }
      case 'unsetField': {
        const node = this.#requireNode(operation.occurrenceId);
        this.#nodes.set(operation.occurrenceId, {
          ...node,
          fields: unsetPath(node.fields, operation.fieldPath),
        });
        break;
      }
      case 'setMaterialRef': {
        const node = this.#requireNode(operation.occurrenceId);
        this.#nodes.set(operation.occurrenceId, {
          occurrenceId: node.occurrenceId,
          kind: node.kind,
          ...(operation.materialId === undefined ? {} : { materialId: operation.materialId }),
          ...(operation.materialRevision === undefined ? {} : { materialRevision: operation.materialRevision }),
          ...(operation.materialCode === undefined ? {} : { materialCode: operation.materialCode }),
          parentId: node.parentId,
          positionKey: node.positionKey,
          fields: clone(node.fields),
        });
        break;
      }
      case 'reorder': {
        const node = this.#requireNode(operation.occurrenceId);
        this.#nodes.set(operation.occurrenceId, {
          ...node,
          positionKey: operation.positionKey,
        });
        break;
      }
      default:
        assert.fail(`reference model does not support op=${operation.op}`);
    }
  }

  snapshotContent() {
    const ordered = this.#orderedNodes();
    const children = this.#childrenOracle(ordered);
    const roots = [...(children.get(null) ?? [])];
    return {
      ...this.#envelope,
      knownRootCount: roots.length,
      roots,
      nodes: ordered.map((node) => ({
        occurrenceId: node.occurrenceId,
        kind: node.kind,
        ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
        ...(node.materialRevision === undefined ? {} : { materialRevision: node.materialRevision }),
        ...(node.materialCode === undefined ? {} : { materialCode: node.materialCode }),
        parentId: node.parentId,
        positionKey: node.positionKey,
        childrenState: 'complete',
        knownChildCount: (children.get(node.occurrenceId) ?? []).length,
        fields: clone(node.fields),
      })),
    };
  }

  indexOracle() {
    const snapshot = this.snapshotContent();
    const rowById = new Map();
    const childrenByParent = new Map([[null, []]]);
    const rowsByMaterialCode = new Map();
    for (const node of snapshot.nodes) {
      rowById.set(node.occurrenceId, node);
      const siblings = childrenByParent.get(node.parentId) ?? [];
      siblings.push(node.occurrenceId);
      childrenByParent.set(node.parentId, siblings);
      if (node.kind === 'material' && node.materialCode !== undefined) {
        const occurrences = rowsByMaterialCode.get(node.materialCode) ?? [];
        occurrences.push(node.occurrenceId);
        rowsByMaterialCode.set(node.materialCode, occurrences);
      }
    }
    for (const [parentId, children] of childrenByParent) {
      children.sort((leftId, rightId) =>
        compareAscii(
          rowById.get(leftId).positionKey,
          rowById.get(rightId).positionKey,
        ));
      childrenByParent.set(parentId, children);
    }
    return { rowById, childrenByParent, rowsByMaterialCode };
  }

  visiblePreorder(expanded) {
    const indexes = this.indexOracle();
    const result = [];
    const roots = indexes.childrenByParent.get(null) ?? [];
    const stack = [...roots].reverse();
    while (stack.length > 0) {
      const occurrenceId = stack.pop();
      result.push(occurrenceId);
      if (!expanded.has(occurrenceId)) continue;
      const children = indexes.childrenByParent.get(occurrenceId) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }
    return result;
  }

  depthOf(occurrenceId) {
    let depth = 0;
    let currentId = occurrenceId;
    while (currentId !== null) {
      depth += 1;
      currentId = this.#requireNode(currentId).parentId;
    }
    return depth;
  }

  descendantIds(occurrenceId) {
    const children = this.indexOracle().childrenByParent;
    const result = new Set();
    const stack = [occurrenceId];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (result.has(currentId)) continue;
      result.add(currentId);
      stack.push(...(children.get(currentId) ?? []));
    }
    return result;
  }

  safeDeleteCandidates() {
    const materialCount = this.nodes().filter((node) => node.kind === 'material').length;
    return this.nodes().filter((node) => {
      if (node.occurrenceId === 'root') return false;
      const subtree = this.descendantIds(node.occurrenceId);
      let removedMaterials = 0;
      for (const occurrenceId of subtree) {
        if (this.#requireNode(occurrenceId).kind === 'material') removedMaterials += 1;
      }
      return this.size - subtree.size >= 6 && materialCount - removedMaterials > 0;
    });
  }

  optionalFieldPaths() {
    const result = [];
    for (const node of this.nodes()) {
      if (Object.hasOwn(node.fields, 'note')) {
        result.push({ occurrenceId: node.occurrenceId, fieldPath: ['note'] });
      }
      if (
        isRecord(node.fields.meta) &&
        Object.hasOwn(node.fields.meta, 'category')
      ) {
        result.push({ occurrenceId: node.occurrenceId, fieldPath: ['meta', 'category'] });
      }
    }
    return result;
  }

  #requireNode(occurrenceId) {
    const node = this.#nodes.get(occurrenceId);
    assert.ok(node !== undefined, `reference node is missing id=${occurrenceId}`);
    return node;
  }

  #childrenOracle(nodes = [...this.#nodes.values()]) {
    const children = new Map([[null, []]]);
    for (const node of nodes) {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node.occurrenceId);
      children.set(node.parentId, siblings);
    }
    for (const [parentId, siblings] of children) {
      siblings.sort((leftId, rightId) =>
        compareAscii(
          this.#requireNode(leftId).positionKey,
          this.#requireNode(rightId).positionKey,
        ));
      children.set(parentId, siblings);
    }
    return children;
  }

  #orderedNodes() {
    const children = this.#childrenOracle();
    const ordered = [];
    const roots = children.get(null) ?? [];
    const stack = [...roots].reverse();
    while (stack.length > 0) {
      const occurrenceId = stack.pop();
      const node = this.#requireNode(occurrenceId);
      ordered.push(node);
      const descendants = children.get(occurrenceId) ?? [];
      for (let index = descendants.length - 1; index >= 0; index -= 1) {
        stack.push(descendants[index]);
      }
    }
    assert.equal(ordered.length, this.#nodes.size, 'reference graph is disconnected or cyclic');
    return ordered;
  }
}

function createInitialSnapshot(seed) {
  return {
    schemaVersion: schema.schemaVersion,
    documentId: `property-document-${seedHex(seed).slice(2)}`,
    revision: 'property-r0',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    roots: ['root'],
    nodes: [
      node('material-a2', 'material', 'assembly-a', 'M', { name: 'Material A2' }, 'MAT-1'),
      node('root', 'group', null, 'M', { name: 'Root', note: 'anchor' }),
      node('material-b1', 'material', 'assembly-b', 'A', { name: 'Material B1' }, 'MAT-2'),
      node('assembly-a', 'group', 'root', 'A', { name: 'Assembly A', meta: { category: 'assembly' } }),
      node('loose', 'material', 'root', 'z', { name: 'Loose material' }, 'MAT-0'),
      node('material-a1', 'material', 'assembly-a', 'A', { name: 'Material A1', note: 'removable' }, 'MAT-0'),
      node('assembly-b', 'group', 'root', 'M', { name: 'Assembly B', note: 'second branch' }),
      node('material-a3', 'material', 'assembly-a', 'z', { name: 'Material A3', meta: { category: 'raw' } }, 'MAT-0'),
      node('material-b2', 'material', 'assembly-b', 'M', { name: 'Material B2', meta: { category: 'raw' } }, 'MAT-1'),
      node('material-b3', 'material', 'assembly-b', 'z', { name: 'Material B3', note: 'leaf' }, 'MAT-3'),
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

function snapshotContent(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    documentId: snapshot.documentId,
    positionKeyCodecVersion: snapshot.positionKeyCodecVersion,
    completeness: snapshot.completeness,
    knownRootCount: snapshot.knownRootCount,
    roots: [...snapshot.roots],
    nodes: snapshot.nodes.map((node) => clone(node)),
  };
}

function stripDerivedNode(node) {
  return {
    occurrenceId: node.occurrenceId,
    kind: node.kind,
    ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
    ...(node.materialRevision === undefined ? {} : { materialRevision: node.materialRevision }),
    ...(node.materialCode === undefined ? {} : { materialCode: node.materialCode }),
    parentId: node.parentId,
    positionKey: node.positionKey,
    fields: clone(node.fields),
  };
}

function setPath(fields, path, value) {
  const result = clone(fields);
  let current = result;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!isRecord(current[segment])) current[segment] = {};
    current = current[segment];
  }
  current[path[path.length - 1]] = clone(value);
  return result;
}

function unsetPath(fields, path) {
  const result = clone(fields);
  let current = result;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!isRecord(current[segment])) return result;
    current = current[segment];
  }
  delete current[path[path.length - 1]];
  return result;
}

function compareAscii(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function createPatch(engine, seed, step, action, operationValue) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    documentId: engine.getSnapshot().documentId,
    baseRevision: engine.getSnapshot().revision,
    transactionId: `property-${action}-${seedHex(seed).slice(2)}-${step}`,
    origin: 'test:property-gate',
    timestamp: timestampFor(step),
    operations: [operationValue],
  };
}

function operation(action, operationValue) {
  return { action, operation: operationValue };
}

function uniquePosition(prefix, seed, step) {
  return `${prefix}-${seedHex(seed).slice(2)}-${String(step).padStart(4, '0')}`;
}

function timestampFor(step) {
  return new Date(Date.UTC(2026, 6, 20, 0, 0, step)).toISOString();
}

function captureEngineState(engine) {
  return {
    snapshot: engine.getSnapshot(),
    indexes: engine.getIndexes(),
    contentHash: engine.getContentHash(),
    history: engine.getHistoryState(),
  };
}

function createCoverage() {
  return {
    updateField: 0,
    unsetField: 0,
    insertNode: 0,
    moveSubtree: 0,
    deleteSubtree: 0,
    setMaterialRef: 0,
    reorder: 0,
    invalidPatch: 0,
    undo: 0,
    redo: 0,
  };
}

function createPrng(seed) {
  let state = seed >>> 0;
  return Object.freeze({
    int(exclusiveMaximum) {
      assert.ok(exclusiveMaximum > 0);
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

function parseSeed(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(`BOM_PROPERTY_SEED must be a uint32; actual=${value}`);
  }
  return seed >>> 0;
}

function seedHex(seed) {
  return `0x${(seed >>> 0).toString(16).padStart(8, '0')}`;
}

function context(seed, step, action) {
  return `seed=${seedHex(seed)} step=${step} action=${action}`;
}

function formatResultErrors(result) {
  return result.ok ? '' : result.errors.map((error) => error.code).join(', ');
}

function clone(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
