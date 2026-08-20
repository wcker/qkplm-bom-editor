import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBomIndexes } from '../../../packages/model/dist/index.js';
import { createVisibleProjection } from '../../../packages/visible-projection/dist/index.js';

const SEEDS = Object.freeze([
  0x13579bdf,
  0x5eedc0de,
  0xc001d00d,
  0x0badc0de,
  0x7f4a7c15,
  0x2468ace0,
]);

test('visible projection and bidirectional position index remain equivalent', () => {
  for (const seed of SEEDS) {
    runSeed(seed);
  }
});

function runSeed(seed) {
  const snapshot = createSnapshot(seed);
  const indexes = must(buildBomIndexes(snapshot));
  const positionIndex = buildPositionIndex(indexes);
  const rng = createPrng(seed);
  const expanded = new Set(snapshot.roots);
  const heights = new Map();

  for (let step = 0; step < 96; step += 1) {
    const occurrenceId = snapshot.nodes[rng.int(snapshot.nodes.length)].occurrenceId;
    if (expanded.has(occurrenceId)) expanded.delete(occurrenceId);
    else expanded.add(occurrenceId);

    const height = 11 + rng.int(23);
    heights.set(occurrenceId, height);
    const projection = must(createVisibleProjection(snapshot, {
      indexes,
      rowHeight: 17,
      expandedIds: [...expanded],
    }));
    for (const [id, rowHeight] of heights) {
      must(projection.setRowHeight(id, rowHeight));
    }

    const expected = visiblePreorder(indexes, expanded);
    assert.deepEqual(projection.toArray(), expected, label(seed, step, 'preorder'));
    assert.equal(projection.visibleCount, expected.length, label(seed, step, 'count'));

    let offset = 0;
    for (let index = 0; index < expected.length; index += 1) {
      const id = expected[index];
      assert.deepEqual(
        projection.occurrenceAt(index),
        { ok: true, value: id },
        label(seed, step, `occurrenceAt:${index}`),
      );
      assert.deepEqual(
        projection.indexOf(id),
        { ok: true, value: index },
        label(seed, step, `indexOf:${id}`),
      );
      assert.deepEqual(
        projection.offsetOf(id),
        { ok: true, value: offset },
        label(seed, step, `offsetOf:${id}`),
      );
      assert.deepEqual(
        projection.occurrenceAtOffset(offset),
        { ok: true, value: id },
        label(seed, step, `offsetInverse:${id}`),
      );
      offset += heights.get(id) ?? 17;
    }
    assert.equal(projection.totalHeight, offset, label(seed, step, 'height'));

    for (const node of snapshot.nodes) {
      const expectedIndex = expected.indexOf(node.occurrenceId);
      const actualIndex = projection.indexOf(node.occurrenceId);
      if (expectedIndex < 0) {
        assert.deepEqual(actualIndex, { ok: true, value: undefined }, label(seed, step, `hidden:${node.occurrenceId}`));
      } else {
        assert.equal(actualIndex.value, expectedIndex, label(seed, step, `visible:${node.occurrenceId}`));
      }
    }

    assertPositionIndex(indexes, positionIndex, label(seed, step, 'position-index'));
    const window = must(projection.windowByOffset(
      expected.length === 0 ? 0 : Math.floor(offset / 3),
      Math.max(1, Math.floor(offset / 5)),
      2,
    ));
    for (const id of window.occurrenceIds) {
      assert.equal(projection.indexOf(id).ok, true, label(seed, step, `window:${id}`));
    }
  }
}

function createSnapshot(seed) {
  const nodes = [];
  const roots = [];
  for (let rootIndex = 0; rootIndex < 4; rootIndex += 1) {
    const rootId = `root-${rootIndex}`;
    roots.push(rootId);
    nodes.push(node(rootId, null, `R${rootIndex}`));
    for (let childIndex = 0; childIndex < 7; childIndex += 1) {
      const childId = `${rootId}-child-${childIndex}`;
      nodes.push(node(childId, rootId, `C${childIndex}`, childIndex % 2 === 0));
      for (let leafIndex = 0; leafIndex < 3; leafIndex += 1) {
        nodes.push(node(
          `${childId}-leaf-${leafIndex}`,
          childId,
          `L${leafIndex}`,
          leafIndex % 2 === 1,
        ));
      }
    }
  }
  // Seed participates in the fixture identity without changing sibling order.
  nodes[0].fields.seed = seed >>> 0;
  return {
    schemaVersion: '1.0.0',
    documentId: `visible-position-${seed >>> 0}`,
    revision: 'r1',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: roots.length,
    roots,
    nodes,
  };
}

function node(occurrenceId, parentId, positionKey, material = false) {
  return {
    occurrenceId,
    kind: material ? 'material' : 'group',
    ...(material ? { materialCode: `MAT-${occurrenceId}` } : {}),
    parentId,
    positionKey,
    childrenState: 'complete',
    knownChildCount: 0,
    fields: { name: occurrenceId },
  };
}

function buildPositionIndex(indexes) {
  const byParent = new Map();
  for (const [parentId, children] of indexes.childrenByParent) {
    const entries = children.map((occurrenceId) => ({
      occurrenceId,
      positionKey: indexes.rowById.get(occurrenceId).positionKey,
    }));
    byParent.set(parentId, new Map(entries.map((entry) => [entry.positionKey, entry.occurrenceId])));
  }
  return byParent;
}

function assertPositionIndex(indexes, positionIndex, label) {
  for (const [parentId, children] of indexes.childrenByParent) {
    const byPosition = positionIndex.get(parentId);
    assert.equal(byPosition.size, children.length, `${label}:${String(parentId)} size`);
    let previous = '';
    for (const occurrenceId of children) {
      const positionKey = indexes.rowById.get(occurrenceId).positionKey;
      assert.ok(positionKey > previous, `${label}:${String(parentId)} order`);
      assert.equal(byPosition.get(positionKey), occurrenceId, `${label}:${positionKey} reverse lookup`);
      previous = positionKey;
    }
  }
}

function visiblePreorder(indexes, expanded) {
  const result = [];
  const stack = [...(indexes.childrenByParent.get(null) ?? [])].reverse();
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

function must(result) {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
  return result.value;
}

function createPrng(seed) {
  let state = seed >>> 0;
  return {
    int(max) {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) % max;
    },
  };
}

function label(seed, step, detail) {
  return `seed=0x${(seed >>> 0).toString(16)} step=${step} ${detail}`;
}
