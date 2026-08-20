import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCanvasSurfaceLayout,
  calculateColumnWindow,
  calculateRowLayout,
  deviceToLogicalCoordinate,
  hitTestCanvasCell,
  logicalToDeviceCoordinate,
  resolveEffectiveDpr,
} from '../dist/index.js';

function column(columnId, width, frozen = false) {
  return Object.freeze({
    columnId,
    fieldPath: Object.freeze([columnId]),
    label: columnId,
    width,
    editable: true,
    frozen,
  });
}

test('column window keeps start-frozen coordinates and virtualizes scrollable columns', () => {
  const columns = [
    column('tree', 80, 'start'),
    column('code', 100),
    column('name', 120),
    column('quantity', 90),
    column('cost', 110),
  ];
  const window = calculateColumnWindow(columns, 150, 260, 20);

  assert.equal(window.frozenWidth, 80);
  assert.equal(window.scrollableWidth, 420);
  assert.equal(window.totalWidth, 500);
  assert.deepEqual(
    window.columns.map(({ columnId, x, frozen }) => ({ columnId, x, frozen })),
    [
      { columnId: 'tree', x: 0, frozen: true },
      { columnId: 'name', x: 30, frozen: false },
      { columnId: 'quantity', x: 150, frozen: false },
      { columnId: 'cost', x: 240, frozen: false },
    ],
  );
  assert.ok(Object.isFrozen(window));
  assert.ok(Object.isFrozen(window.columns));
});

test('column window reserves a stable row-header gutter before frozen columns', () => {
  const columns = [
    column('tree', 80, 'start'),
    column('code', 100),
    column('name', 120),
    column('quantity', 90),
    column('cost', 110),
  ];
  const window = calculateColumnWindow(columns, 150, 260, 20, 48);

  assert.equal(window.frozenWidth, 128);
  assert.equal(window.scrollableWidth, 420);
  assert.equal(window.totalWidth, 548);
  assert.deepEqual(
    window.columns.map(({ columnId, x, contentOffset, frozen }) => ({
      columnId,
      x,
      contentOffset,
      frozen,
    })),
    [
      { columnId: 'tree', x: 48, contentOffset: 48, frozen: true },
      { columnId: 'name', x: 78, contentOffset: 228, frozen: false },
      { columnId: 'quantity', x: 198, contentOffset: 348, frozen: false },
    ],
  );
});

test('column window keeps trailing-frozen columns fixed on the right edge', () => {
  const columns = [
    column('tree', 80, 'start'),
    column('code', 100),
    column('name', 120),
    column('quantity', 90, 'end'),
  ];
  const window = calculateColumnWindow(columns, 75, 360, 0, 48);

  assert.equal(window.frozenWidth, 128);
  assert.equal(window.trailingFrozenWidth, 90);
  assert.equal(window.totalWidth, 438);
  assert.deepEqual(
    window.columns.map(({ columnId, x, frozen }) => ({ columnId, x, frozen })),
    [
      { columnId: 'tree', x: 48, frozen: true },
      { columnId: 'code', x: 53, frozen: false },
      { columnId: 'name', x: 153, frozen: false },
      { columnId: 'quantity', x: 270, frozen: true },
    ],
  );
  const rows = Object.freeze([
    Object.freeze({
      occurrenceId: 'row', rowIndex: 0, documentOffset: 0, x: 0, y: 30,
      width: 0, height: 20, depth: 1, expandable: false, expanded: false,
    }),
  ]);
  assert.equal(
    hitTestCanvasCell({
      x: 300, y: 35, rows, columnWindow: window, treeColumnId: 'tree',
      indentWidth: 16, cellPadding: 6, expanderSize: 10, bodyTop: 30,
      rowHeaderWidth: 48,
    }).address.columnId,
    'quantity',
  );
});

test('row layout preserves exact variable-height offsets', () => {
  const visibleWindow = Object.freeze({
    startIndex: 4,
    endIndex: 7,
    startOffset: 70.25,
    endOffset: 119.5,
    totalHeight: 1_000,
    occurrenceIds: Object.freeze(['a', 'b', 'c']),
  });
  const rows = calculateRowLayout(
    visibleWindow,
    [
      { occurrenceId: 'a', height: 10.5, depth: 1, expandable: true, expanded: false },
      { occurrenceId: 'b', height: 21.25, depth: 2, expandable: false, expanded: false },
      { occurrenceId: 'c', height: 17.5, depth: 3, expandable: false, expanded: false },
    ],
    72.75,
  );

  assert.deepEqual(
    rows.map(({ occurrenceId, rowIndex, documentOffset, y, height }) => ({
      occurrenceId,
      rowIndex,
      documentOffset,
      y,
      height,
    })),
    [
      { occurrenceId: 'a', rowIndex: 4, documentOffset: 70.25, y: -2.5, height: 10.5 },
      { occurrenceId: 'b', rowIndex: 5, documentOffset: 80.75, y: 8, height: 21.25 },
      { occurrenceId: 'c', rowIndex: 6, documentOffset: 102, y: 29.25, height: 17.5 },
    ],
  );
});

test('hit testing uses unrounded logical coordinates at fractional boundaries', () => {
  const columns = [column('tree', 80.5, 'start'), column('name', 100.25)];
  const columnWindow = calculateColumnWindow(columns, 0, 300, 0);
  const rows = Object.freeze([
    Object.freeze({
      occurrenceId: 'row',
      rowIndex: 0,
      documentOffset: 0,
      x: 0,
      y: 0.25,
      width: 0,
      height: 20.5,
      depth: 1,
      expandable: true,
      expanded: false,
    }),
  ]);

  const first = hitTestCanvasCell({
    x: 80.4999,
    y: 20.7499,
    rows,
    columnWindow,
    treeColumnId: 'tree',
    indentWidth: 16,
    cellPadding: 6,
    expanderSize: 10,
  });
  const second = hitTestCanvasCell({
    x: 80.5001,
    y: 20.7499,
    rows,
    columnWindow,
    treeColumnId: 'tree',
    indentWidth: 16,
    cellPadding: 6,
    expanderSize: 10,
  });
  assert.equal(first.address.columnId, 'tree');
  assert.equal(second.address.columnId, 'name');
  assert.equal(
    hitTestCanvasCell({
      x: 20,
      y: 20.75,
      rows,
      columnWindow,
      treeColumnId: 'tree',
      indentWidth: 16,
      cellPadding: 6,
      expanderSize: 10,
    }),
    null,
  );
});

test('header and row-header coordinates expose axis selection targets', () => {
  const columns = [column('tree', 80, 'start'), column('name', 100)];
  const columnWindow = calculateColumnWindow(columns, 0, 300, 0, 48);
  const visibleWindow = Object.freeze({
    startIndex: 0,
    endIndex: 1,
    startOffset: 0,
    endOffset: 28,
    totalHeight: 28,
    occurrenceIds: Object.freeze(['row']),
  });
  const rows = calculateRowLayout(
    visibleWindow,
    [
      {
        occurrenceId: 'row',
        height: 28,
        depth: 1,
        expandable: false,
        expanded: false,
      },
    ],
    0,
    36,
  );
  const input = {
    rows,
    columnWindow,
    treeColumnId: 'tree',
    indentWidth: 16,
    cellPadding: 6,
    expanderSize: 10,
    bodyTop: 36,
    rowHeaderWidth: 48,
  };

  assert.equal(rows[0].y, 36);
  assert.deepEqual(
    hitTestCanvasCell({ ...input, x: 60, y: 20 }),
    {
      address: { occurrenceId: 'row', columnId: 'tree' },
      target: 'column-header',
      rect: { x: 48, y: 0, width: 80, height: 36 },
    },
  );
  assert.deepEqual(
    hitTestCanvasCell({ ...input, x: 20, y: 40 }),
    {
      address: { occurrenceId: 'row', columnId: 'tree' },
      target: 'row-header',
      rect: { x: 0, y: 36, width: 48, height: 28 },
    },
  );
  assert.deepEqual(
    hitTestCanvasCell({ ...input, x: 60, y: 40 }).address,
    { occurrenceId: 'row', columnId: 'tree' },
  );
});

test('RTL mirrors frozen columns, the row gutter, and tree hit targets', () => {
  const columns = [
    column('tree', 80, 'start'),
    column('code', 100),
    column('name', 120),
    column('quantity', 90, 'end'),
  ];
  const columnWindow = calculateColumnWindow(
    columns,
    75,
    360,
    0,
    48,
    'rtl',
  );
  const rows = Object.freeze([
    Object.freeze({
      occurrenceId: 'row',
      rowIndex: 0,
      documentOffset: 0,
      x: 0,
      y: 36,
      width: 0,
      height: 28,
      depth: 1,
      expandable: true,
      expanded: false,
    }),
  ]);
  const input = {
    rows,
    columnWindow,
    treeColumnId: 'tree',
    indentWidth: 16,
    cellPadding: 6,
    expanderSize: 10,
    bodyTop: 36,
    rowHeaderWidth: 48,
    viewportWidth: 360,
    direction: 'rtl',
  };

  assert.equal(columnWindow.direction, 'rtl');
  assert.equal(columnWindow.frozenWidth, 128);
  assert.equal(columnWindow.trailingFrozenWidth, 90);
  assert.deepEqual(
    columnWindow.columns.map(({ columnId, x, frozen }) => ({
      columnId,
      x,
      frozen,
    })),
    [
      { columnId: 'quantity', x: 0, frozen: true },
      { columnId: 'name', x: 87, frozen: false },
      { columnId: 'code', x: 207, frozen: false },
      { columnId: 'tree', x: 232, frozen: true },
    ],
  );
  assert.deepEqual(
    hitTestCanvasCell({ ...input, x: 330, y: 50 }),
    {
      address: { occurrenceId: 'row', columnId: 'tree' },
      target: 'row-header',
      rect: { x: 312, y: 36, width: 48, height: 28 },
    },
  );
  assert.deepEqual(
    hitTestCanvasCell({ ...input, x: 300, y: 50 }),
    {
      address: { occurrenceId: 'row', columnId: 'tree' },
      target: 'expander',
      rect: { x: 232, y: 36, width: 80, height: 28 },
    },
  );
  assert.equal(
    hitTestCanvasCell({ ...input, x: 20, y: 50 }).address.columnId,
    'quantity',
  );
  assert.equal(
    hitTestCanvasCell({ ...input, x: 220, y: 50 }).address.columnId,
    'code',
  );
  assert.equal(
    hitTestCanvasCell({ ...input, x: 260, y: 20 }).target,
    'column-header',
  );
  assert.equal(hitTestCanvasCell({ ...input, x: 330, y: 20 }), null);
});

test('DPR resolution stays inside the aggregate backing-store budget', () => {
  const budget = 16 * 1024 * 1024;
  const result = resolveEffectiveDpr({
    cssWidth: 2_160,
    cssHeight: 1_320,
    devicePixelRatio: 3,
    maxDpr: 3,
    layerCount: 3,
    maxBackingStoreBytes: budget,
  });

  assert.equal(result.degraded, true);
  assert.ok(result.effectiveDpr > 0);
  assert.ok(result.effectiveDpr < 1);
  assert.ok(result.estimatedBytes <= budget);
  const logical = 37.125;
  assert.equal(
    deviceToLogicalCoordinate(
      logicalToDeviceCoordinate(logical, result.effectiveDpr),
      result.effectiveDpr,
    ),
    logical,
  );
  assert.deepEqual(calculateCanvasSurfaceLayout(800, 400, 100, 160), {
    x: -100,
    y: -160,
    left: -100,
    top: -160,
    width: 1_000,
    height: 720,
  });
});
