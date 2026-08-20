import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBomIndexes } from '@bom-editor/model';
import {
  VISIBLE_PROJECTION_ERROR_CODES,
  buildViewChildrenByParent,
  createVisibleProjection,
} from '../dist/index.js';
import { ImplicitAvlRope } from '../dist/rope.js';

const EMPTY_FIELDS = Object.freeze({});

function bomNode(
  occurrenceId,
  parentId,
  positionKey,
  {
    childrenState = 'complete',
    knownChildCount = 0,
    kind = 'group',
  } = {},
) {
  return Object.freeze({
    occurrenceId,
    kind,
    ...(kind === 'material' ? { materialCode: `M-${occurrenceId}` } : {}),
    parentId,
    positionKey,
    childrenState,
    knownChildCount,
    fields: EMPTY_FIELDS,
  });
}

function bomSnapshot(nodes, roots, options = {}) {
  return Object.freeze({
    schemaVersion: '1.0.0',
    documentId: 'doc-visible-projection',
    revision: options.revision ?? 'r1',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: options.completeness ?? 'complete',
    knownRootCount: options.knownRootCount ?? roots.length,
    roots: Object.freeze([...roots]),
    nodes: Object.freeze(nodes),
  });
}

function value(result) {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
  return result.value;
}

function error(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, code);
  assert.ok(Object.isFrozen(result.errors));
  assert.ok(Object.isFrozen(result.errors[0]));
  return result.errors[0];
}

const orderedTree = bomSnapshot(
  [
    bomNode('root', null, 'A', { knownChildCount: 2 }),
    bomNode('a', 'root', 'A', { knownChildCount: 2 }),
    bomNode('a1', 'a', 'A', { knownChildCount: 1 }),
    bomNode('a1x', 'a1', 'A'),
    bomNode('a2', 'a', 'B'),
    bomNode('b', 'root', 'B', { knownChildCount: 1 }),
    bomNode('b1', 'b', 'A'),
  ],
  ['root'],
);

test('builds stable sorted and ancestor-preserving filtered view children', () => {
  const snapshot = bomSnapshot([
    Object.freeze({ ...bomNode('root', null, 'A', { knownChildCount: 2 }), fields: { name: 'Root' } }),
    Object.freeze({ ...bomNode('a', 'root', 'A'), fields: { name: 'Zulu' } }),
    Object.freeze({ ...bomNode('b', 'root', 'B'), fields: { name: 'Alpha' } }),
  ], ['root']);
  const indexes = value(buildBomIndexes(snapshot));
  const view = buildViewChildrenByParent(snapshot, indexes, {
    sort: [{ fieldPath: ['name'], direction: 'asc' }],
    filters: [{ fieldPath: ['name'], operator: 'contains', value: 'alp' }],
  });
  assert.deepEqual(view.get(null), ['root']);
  assert.deepEqual(view.get('root'), ['b']);
});

test('projects loaded nodes in stable preorder and updates only local descendants', () => {
  const projection = value(
    createVisibleProjection(orderedTree, {
      rowHeight: 10,
      expandedIds: ['root', 'a'],
    }),
  );

  assert.deepEqual(projection.toArray(), ['root', 'a', 'a1', 'a2', 'b']);
  assert.equal('snapshot' in projection, false);
  assert.equal(value(projection.depthOf('root')), 1);
  assert.equal(value(projection.depthOf('a1')), 3);
  assert.equal(value(projection.visibleSubtreeSizeOf('root')), 5);
  assert.equal(value(projection.visibleSubtreeSizeOf('a')), 3);
  assert.equal(value(projection.indexOf('a2')), 3);
  assert.equal(value(projection.occurrenceAt(4)), 'b');
  assert.equal(value(projection.occurrenceAt(5)), undefined);

  const expanded = value(projection.setExpanded('a1', true));
  assert.deepEqual(projection.toArray(), [
    'root',
    'a',
    'a1',
    'a1x',
    'a2',
    'b',
  ]);
  assert.equal(expanded.visibleDelta, 1);
  assert.equal(value(projection.visibleSubtreeSizeOf('root')), 6);

  const collapsed = value(projection.setExpanded('a', false));
  assert.deepEqual(projection.toArray(), ['root', 'a', 'b']);
  assert.equal(collapsed.visibleDelta, -3);
  assert.equal(value(projection.indexOf('a1x')), undefined);
  assert.equal(value(projection.visibleSubtreeSizeOf('a')), 1);

  // A hidden expansion change is retained but cannot alter the visible rope.
  assert.equal(value(projection.setExpanded('a1', false)).visibleDelta, 0);
  assert.deepEqual(projection.toArray(), ['root', 'a', 'b']);
  assert.deepEqual(value(projection.setExpanded('a', true)), {
    occurrenceId: 'a',
    expanded: true,
    changed: true,
    visibleDelta: 2,
    visibleCount: 5,
    visibleSubtreeSize: 3,
  });
  assert.deepEqual(projection.toArray(), ['root', 'a', 'a1', 'a2', 'b']);
  assert.ok(Object.isFrozen(projection.toArray()));
});

test('row index and pixel offset queries are inverse with variable row heights', () => {
  const snapshot = bomSnapshot(
    [
      bomNode('r1', null, 'A'),
      bomNode('r2', null, 'B'),
      bomNode('r3', null, 'C'),
    ],
    ['r1', 'r2', 'r3'],
  );
  const projection = value(createVisibleProjection(snapshot, { rowHeight: 10 }));

  assert.equal(value(projection.setRowHeight('r2', 20)).totalHeight, 40);
  assert.equal(value(projection.setRowHeight('r3', 15)).totalHeight, 45);
  assert.equal(value(projection.offsetOf('r1')), 0);
  assert.equal(value(projection.offsetOf('r2')), 10);
  assert.equal(value(projection.offsetOf('r3')), 30);
  assert.equal(value(projection.occurrenceAtOffset(0)), 'r1');
  assert.equal(value(projection.occurrenceAtOffset(9.999)), 'r1');
  assert.equal(value(projection.occurrenceAtOffset(10)), 'r2');
  assert.equal(value(projection.occurrenceAtOffset(29.999)), 'r2');
  assert.equal(value(projection.occurrenceAtOffset(30)), 'r3');
  assert.equal(value(projection.occurrenceAtOffset(44.999)), 'r3');
  assert.equal(value(projection.occurrenceAtOffset(45)), undefined);

  for (let index = 0; index < projection.visibleCount; index += 1) {
    const id = value(projection.occurrenceAt(index));
    assert.equal(value(projection.indexOf(id)), index);
    assert.equal(value(projection.occurrenceAtOffset(value(projection.offsetOf(id)))), id);
  }

  const exactWindow = value(projection.windowByOffset(10, 20, 0));
  assert.deepEqual(exactWindow, {
    startIndex: 1,
    endIndex: 2,
    startOffset: 10,
    endOffset: 30,
    totalHeight: 45,
    occurrenceIds: ['r2'],
  });
  assert.ok(Object.isFrozen(exactWindow));
  assert.ok(Object.isFrozen(exactWindow.occurrenceIds));

  const overscanned = value(projection.windowByOffset(12, 10, 3));
  assert.deepEqual(overscanned.occurrenceIds, ['r1', 'r2']);
  assert.equal(overscanned.startOffset, 0);
  assert.equal(overscanned.endOffset, 30);

  const beyond = value(projection.windowByOffset(100, 20, 0));
  assert.deepEqual(beyond.occurrenceIds, []);
  assert.equal(beyond.startIndex, 3);
  assert.equal(beyond.startOffset, 45);
});

test('a height assigned while hidden is applied when the row becomes visible', () => {
  const projection = value(
    createVisibleProjection(orderedTree, {
      rowHeight: 10,
      expandedIds: ['root'],
    }),
  );
  const hiddenChange = value(projection.setRowHeight('a1', 37));
  assert.equal(hiddenChange.visible, false);
  assert.equal(hiddenChange.totalHeight, 30);
  value(projection.setExpanded('a', true));
  assert.equal(value(projection.offsetOf('a2')), 57);
  assert.equal(projection.totalHeight, 77);
  assert.equal(value(projection.rowHeightOf('a1')), 37);
});

test('row-height overrides remain exportable when filtering hides a row', () => {
  const snapshot = bomSnapshot([
    Object.freeze({ ...bomNode('r1', null, 'A'), fields: { name: 'keep' } }),
    Object.freeze({ ...bomNode('r2', null, 'B'), fields: { name: 'hide' } }),
  ], ['r1', 'r2']);
  const indexes = value(buildBomIndexes(snapshot));
  const viewChildren = buildViewChildrenByParent(snapshot, indexes, {
    filters: [{ fieldPath: ['name'], operator: 'equals', value: 'keep' }],
  });
  const projection = value(createVisibleProjection(snapshot, {
    indexes,
    rowHeight: 10,
    rowHeightOverrides: new Map([
      ['r1', 24],
      ['r2', 36],
    ]),
    viewChildrenByParent: viewChildren,
  }));
  assert.deepEqual(projection.toArray(), ['r1']);
  assert.deepEqual(projection.rowHeightOverrides(), [
    { occurrenceId: 'r1', rowHeight: 24 },
    { occurrenceId: 'r2', rowHeight: 36 },
  ]);
});

test('partial and unloaded nodes expose loaded occurrences only', () => {
  const partial = bomSnapshot(
    [
      bomNode('root', null, 'A', {
        childrenState: 'partial',
        knownChildCount: 4,
      }),
      bomNode('loaded', 'root', 'A'),
      bomNode('unloaded', 'root', 'B', {
        childrenState: 'unloaded',
        knownChildCount: 8,
      }),
    ],
    ['root'],
    { completeness: 'partial', knownRootCount: 2 },
  );
  const projection = value(createVisibleProjection(partial));
  assert.deepEqual(projection.toArray(), ['root']);
  assert.equal(value(projection.setExpanded('root', true)).visibleDelta, 2);
  assert.deepEqual(projection.toArray(), ['root', 'loaded', 'unloaded']);
  const unloadedExpansion = value(projection.setExpanded('unloaded', true));
  assert.equal(unloadedExpansion.visibleDelta, 0);
  assert.equal(unloadedExpansion.visibleSubtreeSize, 1);
  assert.deepEqual(projection.toArray(), ['root', 'loaded', 'unloaded']);
});

test('invalid arguments and mismatched indexes return stable frozen errors', () => {
  error(
    createVisibleProjection(orderedTree, { rowHeight: 0 }),
    VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
  );
  error(
    createVisibleProjection(orderedTree, { expandedIds: ['missing'] }),
    VISIBLE_PROJECTION_ERROR_CODES.unknownOccurrence,
  );
  const projection = value(createVisibleProjection(orderedTree));
  error(
    projection.occurrenceAt(-1),
    VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
  );
  error(
    projection.occurrenceAtOffset(Number.NaN),
    VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
  );
  error(
    projection.windowByOffset(0, -1, 0),
    VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
  );
  error(
    projection.setExpanded('missing', true),
    VISIBLE_PROJECTION_ERROR_CODES.unknownOccurrence,
  );
  error(
    projection.setRowHeight('root', Number.POSITIVE_INFINITY),
    VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
  );

  const built = value(buildBomIndexes(orderedTree));
  const mismatched = {
    rowById: built.rowById,
    childrenByParent: new Map([[null, ['root']]]),
    rowsByMaterialCode: built.rowsByMaterialCode,
  };
  error(
    createVisibleProjection(orderedTree, { indexes: mismatched }),
    VISIBLE_PROJECTION_ERROR_CODES.invalidIndexes,
  );

  const throwingSnapshot = {};
  Object.defineProperty(throwingSnapshot, 'roots', {
    get() {
      throw new Error('must become a Result');
    },
  });
  error(
    createVisibleProjection(throwingSnapshot),
    VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
  );

  const throwingIndexes = {
    rowById: {
      size: orderedTree.nodes.length,
      get() {
        throw new Error('must become a Result');
      },
      has() {
        return true;
      },
    },
    childrenByParent: built.childrenByParent,
    rowsByMaterialCode: built.rowsByMaterialCode,
  };
  error(
    createVisibleProjection(orderedTree, { indexes: throwingIndexes }),
    VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
  );
});

test('incremental expansion and height results equal a full reconstruction', () => {
  const nodes = [
    bomNode('root', null, 'A', { knownChildCount: 12 }),
  ];
  for (let groupIndex = 0; groupIndex < 12; groupIndex += 1) {
    const groupId = `g${groupIndex}`;
    nodes.push(
      bomNode(groupId, 'root', String.fromCharCode(65 + groupIndex), {
        knownChildCount: 8,
      }),
    );
    for (let childIndex = 0; childIndex < 8; childIndex += 1) {
      nodes.push(
        bomNode(
          `${groupId}-c${childIndex}`,
          groupId,
          String.fromCharCode(65 + childIndex),
        ),
      );
    }
  }
  const snapshot = bomSnapshot(nodes, ['root']);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, {
      indexes,
      rowHeight: 11,
      expandedIds: ['root'],
    }),
  );
  const heights = new Map();
  const operations = [
    7, 1, 9, 3, 7, 11, 0, 5, 1, 2, 10, 3, 4, 8, 6, 0, 9, 5, 11, 2,
  ];

  for (let step = 0; step < operations.length; step += 1) {
    const groupId = `g${operations[step]}`;
    value(projection.setExpanded(groupId, !value(projection.isExpanded(groupId))));
    const heightId = `g${(operations[step] + 3) % 12}-c${step % 8}`;
    const rowHeight = 12 + (step % 7);
    heights.set(heightId, rowHeight);
    value(projection.setRowHeight(heightId, rowHeight));

    const rebuilt = value(
      createVisibleProjection(snapshot, {
        indexes,
        rowHeight: 11,
        expandedIds: projection.expandedOccurrenceIds(),
      }),
    );
    for (const [id, height] of heights) {
      value(rebuilt.setRowHeight(id, height));
    }
    assert.deepEqual(projection.toArray(), rebuilt.toArray(), `step ${step}`);
    assert.equal(projection.totalHeight, rebuilt.totalHeight, `step ${step}`);
    for (let index = 0; index < projection.visibleCount; index += 1) {
      const id = value(projection.occurrenceAt(index));
      assert.equal(value(projection.indexOf(id)), index, `step ${step}, ${id}`);
      assert.equal(
        value(projection.offsetOf(id)),
        value(rebuilt.offsetOf(id)),
        `step ${step}, ${id}`,
      );
    }
  }
});

test('implicit AVL rope preserves balance and aggregates under bulk edits', () => {
  let nextId = 0;
  let randomState = 0x51f15e;
  const random = () => {
    randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return randomState / 0x1_0000_0000;
  };
  const expected = [];
  for (let index = 0; index < 64; index += 1) {
    expected.push({ occurrenceId: `rope-${nextId++}`, rowHeight: 1 + (index % 9) });
  }
  const rope = new ImplicitAvlRope(expected);

  for (let step = 0; step < 1_000; step += 1) {
    if (expected.length === 0 || random() < 0.58) {
      const insertionIndex = Math.floor(random() * (expected.length + 1));
      const amount = 1 + Math.floor(random() * 12);
      const entries = Array.from({ length: amount }, (_, index) => ({
        occurrenceId: `rope-${nextId++}`,
        rowHeight: 1 + ((step + index) % 17),
      }));
      rope.insert(insertionIndex, entries);
      expected.splice(insertionIndex, 0, ...entries);
    } else {
      const removalIndex = Math.floor(random() * expected.length);
      const amount = Math.min(
        expected.length - removalIndex,
        1 + Math.floor(random() * 12),
      );
      rope.remove(removalIndex, amount);
      expected.splice(removalIndex, amount);
    }

    if (step % 10 === 0 || step === 999) {
      assertRopeIntegrity(rope, expected);
    }
  }
});

test('100K deep chain builds and queries without recursive BOM traversal', {
  timeout: 30_000,
}, () => {
  const nodeCount = 100_000;
  const nodes = new Array(nodeCount);
  for (let index = 0; index < nodeCount; index += 1) {
    nodes[index] = bomNode(
      `n${index}`,
      index === 0 ? null : `n${index - 1}`,
      'A',
      { knownChildCount: index + 1 < nodeCount ? 1 : 0 },
    );
  }
  const snapshot = bomSnapshot(nodes, ['n0']);
  const projection = value(
    createVisibleProjection(snapshot, { rowHeight: 1, expandAll: true }),
  );
  assert.equal(projection.visibleCount, nodeCount);
  assert.equal(projection.totalHeight, nodeCount);
  assert.equal(value(projection.occurrenceAt(nodeCount - 1)), 'n99999');
  assert.equal(value(projection.indexOf('n54321')), 54_321);
  assert.equal(value(projection.offsetOf('n54321')), 54_321);
  assert.equal(value(projection.occurrenceAtOffset(54_321)), 'n54321');
  assert.deepEqual(
    value(projection.windowByOffset(50_000, 20, 5)).occurrenceIds,
    Array.from({ length: 30 }, (_, index) => `n${49_995 + index}`),
  );
});

function assertRopeIntegrity(rope, expected) {
  const nodes = rope.nodes();
  assert.deepEqual(
    nodes.map((node) => ({
      occurrenceId: node.occurrenceId,
      rowHeight: node.rowHeight,
    })),
    expected,
  );
  assert.equal(rope.rowCount, expected.length);
  assert.equal(
    rope.pixelSum,
    expected.reduce((sum, entry) => sum + entry.rowHeight, 0),
  );
  if (nodes.length === 0) {
    return;
  }
  const roots = nodes.filter((node) => node.parent === undefined);
  assert.equal(roots.length, 1);
  const aggregates = new Map();
  const stack = [{ node: roots[0], visited: false }];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame.visited) {
      stack.push({ node: frame.node, visited: true });
      if (frame.node.right !== undefined) {
        assert.equal(frame.node.right.parent, frame.node);
        stack.push({ node: frame.node.right, visited: false });
      }
      if (frame.node.left !== undefined) {
        assert.equal(frame.node.left.parent, frame.node);
        stack.push({ node: frame.node.left, visited: false });
      }
      continue;
    }
    const left = aggregates.get(frame.node.left) ?? {
      height: 0,
      rowCount: 0,
      pixelSum: 0,
    };
    const right = aggregates.get(frame.node.right) ?? {
      height: 0,
      rowCount: 0,
      pixelSum: 0,
    };
    const actual = {
      height: Math.max(left.height, right.height) + 1,
      rowCount: left.rowCount + right.rowCount + 1,
      pixelSum: left.pixelSum + frame.node.rowHeight + right.pixelSum,
    };
    assert.ok(Math.abs(left.height - right.height) <= 1);
    assert.equal(frame.node.height, actual.height);
    assert.equal(frame.node.rowCount, actual.rowCount);
    assert.equal(frame.node.pixelSum, actual.pixelSum);
    aggregates.set(frame.node, actual);
  }
}
