import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBomIndexes } from '@bom-editor/model';
import { createVisibleProjection } from '@bom-editor/visible-projection';
import { mountBomCanvasRenderer } from '../dist/index.js';
import { createFakeDom, fakeEvent } from './dom-mocks.mjs';

const EMPTY_CHILDREN = Object.freeze([]);

function value(result) {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
  return result.value;
}

function createFlatFixture(rowCount) {
  const nodes = new Array(rowCount);
  const roots = new Array(rowCount);
  for (let index = 0; index < rowCount; index += 1) {
    const occurrenceId = `row-${index}`;
    roots[index] = occurrenceId;
    nodes[index] = Object.freeze({
      occurrenceId,
      kind: 'material',
      materialCode: `M-${String(index).padStart(5, '0')}`,
      parentId: null,
      positionKey: `P${String(index).padStart(5, '0')}`,
      childrenState: 'complete',
      knownChildCount: 0,
      fields: Object.freeze({
        name: `Part ${index}`,
        quantity: index,
      }),
    });
  }
  return Object.freeze({
    schemaVersion: '1.0.0',
    documentId: 'renderer-10k',
    revision: 'r1',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: rowCount,
    roots: Object.freeze(roots),
    nodes: Object.freeze(nodes),
  });
}

function createTreeFixture() {
  return Object.freeze({
    schemaVersion: '1.0.0',
    documentId: 'renderer-tree',
    revision: 'r-tree',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: 1,
    roots: Object.freeze(['root']),
    nodes: Object.freeze([
      Object.freeze({
        occurrenceId: 'root',
        kind: 'material',
        materialCode: 'M-ROOT',
        parentId: null,
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 1,
        fields: Object.freeze({ name: 'Root', quantity: 1 }),
      }),
      Object.freeze({
        occurrenceId: 'child',
        kind: 'material',
        materialCode: 'M-CHILD',
        parentId: 'root',
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 0,
        fields: Object.freeze({ name: 'Child', quantity: 1 }),
      }),
    ]),
  });
}

function createColumns() {
  const columns = [
    Object.freeze({
      columnId: 'name',
      fieldPath: Object.freeze(['name']),
      label: 'Name',
      width: 140,
      editable: true,
      frozen: 'start',
      a11y: Object.freeze({
        label: 'Part name',
        description: 'The display name of the occurrence',
      }),
    }),
  ];
  for (let index = 0; index < 19; index += 1) {
    columns.push(
      Object.freeze({
        columnId: `quantity-${index}`,
        fieldPath: Object.freeze(['quantity']),
        label: `Quantity ${index}`,
        width: 100,
        editable: true,
        frozen: false,
      }),
    );
  }
  return Object.freeze(columns);
}

function createCallbacks(calls) {
  return {
    select(address, reason, options) {
      calls.select.push({ address, reason });
      calls.selectOptions.push(options);
    },
    selectAll() {
      calls.selectAll.push(undefined);
    },
    undo() {
      calls.undo.push(undefined);
    },
    redo() {
      calls.redo.push(undefined);
    },
    clearSelection() {
      calls.clearSelection.push(undefined);
    },
    fillDown() {
      calls.fillDown.push(undefined);
    },
    fillSeries() {
      calls.fillSeries.push(undefined);
    },
    moveSubtree(request) {
      calls.moveSubtree.push({ ...request });
    },
    beginColumnResize(columnId, width) {
      calls.beginColumnResize.push({ columnId, width });
    },
    resizeColumn(columnId, width, reason) {
      calls.resizeColumn.push({ columnId, width, reason });
    },
    endColumnResize(columnId, width) {
      calls.endColumnResize.push({ columnId, width });
    },
    reorderColumns(columnIds, reason) {
      calls.reorderColumns.push({ columnIds: [...columnIds], reason });
    },
    setColumnVisibility(columnIds, visible, reason) {
      calls.setColumnVisibility.push({
        columnIds: [...columnIds],
        visible,
        reason,
      });
    },
    insertColumn(referenceColumnId, position, count, reason) {
      calls.insertColumn.push({ referenceColumnId, position, count, reason });
    },
    deleteColumns(columnIds, reason) {
      calls.deleteColumns.push({ columnIds: [...columnIds], reason });
    },
    setColumnFrozen(columnId, frozen, reason) {
      calls.setColumnFrozen.push({ columnId, frozen, reason });
    },
    setRowHeight(occurrenceId, rowHeight, reason) {
      calls.setRowHeight.push({ occurrenceId, rowHeight, reason });
    },
    resetColumnWidth(columnId, reason) {
      calls.resetColumnWidth.push({ columnId, reason });
    },
    copy() {
      calls.copy.push(undefined);
      return calls.copyPayload;
    },
    copyBranch() {
      calls.copyBranch.push(undefined);
      return calls.copyBranchPayload;
    },
    cut() {
      calls.cut.push(undefined);
      return calls.cutPayload;
    },
    cutBranch() {
      calls.cutBranch.push(undefined);
      return calls.cutBranchPayload;
    },
    paste(text) {
      calls.paste.push(text);
    },
    clipboardWrite(id, method, outcome) {
      calls.clipboardWrite.push({ id, method, outcome });
    },
    toggleExpansion(address, expanded) {
      calls.toggleExpansion.push({ address, expanded });
    },
    requestEdit(address, trigger) {
      calls.requestEdit.push({ address, trigger });
    },
    draftInput(address, draftValue, inputType) {
      calls.draftInput.push({ address, draftValue, inputType });
    },
    commit(address, reason) {
      calls.commit.push({ address, reason });
    },
    cancel(address) {
      calls.cancel.push({ address });
    },
    composition(address, phase) {
      calls.composition.push({ address, phase });
    },
    viewChange(view, reason) {
      calls.viewChange.push({ view, reason });
    },
  };
}

function emptyCalls() {
  return {
    select: [],
    selectOptions: [],
    selectAll: [],
    undo: [],
    redo: [],
    clearSelection: [],
    fillDown: [],
    fillSeries: [],
    deleteSubtree: [],
    insertSelection: [],
    moveSelection: [],
    moveSubtree: [],
    setExpansionAll: [],
    sortColumn: [],
    clearViewQuery: [],
    beginColumnResize: [],
    resizeColumn: [],
    endColumnResize: [],
    reorderColumns: [],
    setColumnVisibility: [],
    insertColumn: [],
    deleteColumns: [],
    setColumnFrozen: [],
    setRowHeight: [],
    resetColumnWidth: [],
    copy: [],
    copyPayload: null,
    copyBranch: [],
    copyBranchPayload: null,
    cut: [],
    cutPayload: null,
    cutBranch: [],
    cutBranchPayload: null,
    paste: [],
    clipboardWrite: [],
    toggleExpansion: [],
    requestEdit: [],
    draftInput: [],
    commit: [],
    cancel: [],
    composition: [],
    viewChange: [],
  };
}

function observeCanvasClears(container) {
  const counts = {
    background: 0,
    content: 0,
    interaction: 0,
  };
  for (const layer of Object.keys(counts)) {
    const canvas = container.querySelector(
      `canvas[data-bom-canvas-layer="${layer}"]`,
    );
    assert.ok(canvas);
    const context = canvas.getContext('2d');
    assert.ok(context);
    const clearRect = context.clearRect.bind(context);
    context.clearRect = (...args) => {
      counts[layer] += 1;
      clearRect(...args);
    };
  }
  return counts;
}

function viewModel(
  snapshot,
  indexes,
  projection,
  columns,
  selection,
  editState,
  range = null,
  mode,
  diffView = null,
  ranges,
) {
  return Object.freeze({
    revision: snapshot.revision,
    documentGeneration: 0,
    snapshot,
    indexes,
    projection,
    columns,
    selection: Object.freeze({
      activeCell: selection,
      range,
      ...(mode === undefined ? {} : { mode }),
      ...(ranges === undefined ? {} : { ranges }),
    }),
    editState,
    ...(diffView === null ? {} : { diffView }),
  });
}

test('mounts bounded canvases, a valid ARIA proxy, and one IME-safe portal', async () => {
  const { document, window, container } = createFakeDom(800, 320);
  const snapshot = createFlatFixture(10_000);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const activeAddress = Object.freeze({
    occurrenceId: 'row-5000',
    columnId: 'quantity-18',
  });
  const calls = emptyCalls();
  const diagnostics = [];
  const frameCommits = [];
  const initial = viewModel(
    snapshot,
    indexes,
    projection,
    columns,
    activeAddress,
    Object.freeze({ status: 'focused', draft: null }),
    null,
    undefined,
    Object.freeze({
      protocol: 'bom-canvas-diff-view/v1',
      documentId: snapshot.documentId,
      documentGeneration: 0,
      viewRevision: snapshot.revision,
      rows: Object.freeze([
        Object.freeze({ occurrenceId: 'row-5000', kind: 'moved' }),
      ]),
      cells: Object.freeze([]),
    }),
  );
  const renderer = mountBomCanvasRenderer(
    container,
    initial,
    createCallbacks(calls),
    {
      instanceId: 'renderer-test',
      labels: {
        treegridLabel: 'Parts',
        treegridDescription: 'Use the arrow keys to browse parts.',
        editorLabel: 'Part value',
      },
      overscanX: 100,
      overscanY: 140,
      maxDpr: 2,
      maxBackingStoreBytes: 8 * 1024 * 1024,
      diagnosticSink(diagnostic) {
        diagnostics.push(diagnostic);
      },
      frameCommitSink(frame) {
        frameCommits.push(frame);
      },
    },
  );

  window.flushAnimationFrames();
  await Promise.resolve();
  window.flushAnimationFrames();

  assert.equal(frameCommits[0].protocol, 'bom-canvas-frame-commit/v1');
  assert.equal(frameCommits[0].sequence, 1);
  assert.equal(frameCommits[0].revision, 'r1');
  assert.equal(frameCommits[0].scrollTop, 0);
  assert.equal(frameCommits[0].viewport.width, 800);
  assert.equal(Object.isFrozen(frameCommits[0].surface), true);
  const canvases = container.querySelectorAll('canvas');
  assert.equal(canvases.length, 3);
  for (const [index, canvas] of canvases.entries()) {
    assert.equal(canvas.style.height, '600px');
    assert.equal(canvas.style.pointerEvents, 'none');
    assert.equal(canvas.style.zIndex, String(index));
    assert.ok(canvas.height < 1_000);
  }
  const spacer = container.querySelector('[data-bom-scroll-spacer="true"]');
  assert.equal(spacer.style.height, '280036px');
  assert.equal(spacer.style.width, '2088px');
  assert.equal(spacer.style.pointerEvents, 'none');
  assert.equal(spacer.parentNode.children.length, 1);
  const grid = container.querySelector('[role="treegrid"]');
  assert.equal(grid.style.overflow, 'auto');
  assert.equal(grid.style.zIndex, '3');
  assert.equal(grid.style.scrollbarGutter, 'stable');
  assert.equal(grid.style.overscrollBehavior, 'contain');
  assert.equal(grid.style.touchAction, 'pan-x pan-y');
  assert.equal(grid.getAttribute('aria-rowcount'), '10001');
  assert.equal(grid.getAttribute('aria-colcount'), '21');
  assert.equal(grid.getAttribute('aria-label'), 'Parts');
  const treegridDescriptionId = grid.getAttribute('aria-describedby');
  assert.ok(treegridDescriptionId);
  const treegridDescription = container.querySelector(
    `#${treegridDescriptionId}`,
  );
  assert.ok(treegridDescription);
  assert.equal(
    treegridDescription.getAttribute('data-bom-treegrid-description'),
    'true',
  );
  assert.equal(
    treegridDescription.textContent,
    'Use the arrow keys to browse parts.',
  );
  assert.equal(treegridDescription.style.clipPath, 'inset(50%)');
  const columnHeaders = container.querySelectorAll('[role="columnheader"]');
  assert.equal(columnHeaders[0].textContent, '#');
  assert.equal(columnHeaders[0].getAttribute('aria-colindex'), '1');
  assert.equal(columnHeaders[1].textContent, 'Part name');
  assert.equal(columnHeaders[1].getAttribute('aria-colindex'), '2');
  assert.equal(
    columnHeaders[1].getAttribute('aria-description'),
    'The display name of the occurrence',
  );
  const rowHeaders = container.querySelectorAll('[role="rowheader"]');
  assert.ok(rowHeaders.some((header) => header.textContent === '1'));
  assert.ok(
    container
      .querySelectorAll('[role="row"]')
      .some((row) => row.getAttribute('aria-rowindex') === '2'),
  );
  const activeId = grid.getAttribute('aria-activedescendant');
  assert.ok(activeId);
  assert.ok(container.querySelector(`#${activeId}`));
  assert.ok(container.querySelector('[data-bom-active-proxy="true"]'));
  assert.equal(
    container
      .querySelector('[data-bom-active-proxy="true"]')
      .getAttribute('aria-rowindex'),
    '5002',
  );
  assert.equal(
    container
      .querySelector('[data-bom-active-proxy-cell="true"]')
      .getAttribute('aria-colindex'),
    '21',
  );
  assert.equal(
    container
      .querySelector('[data-bom-active-proxy-cell="true"]')
      .getAttribute('aria-selected'),
    'true',
  );
  assert.equal(
    container
      .querySelector('[data-bom-active-proxy="true"]')
      .getAttribute('data-bom-diff-kind'),
    'moved',
  );
  assert.equal(
    container
      .querySelector('[data-bom-active-proxy="true"]')
      .getAttribute('aria-description'),
    '差异：已移动。',
  );
  assert.equal(renderer.getDiagnostics().activeDescendantIsProxy, true);
  assert.ok(renderer.getDiagnostics().mountedRowCount < 40);
  assert.ok(renderer.getDiagnostics().mountedColumnCount < columns.length);
  assert.ok(renderer.getDiagnostics().backingStoreBytes <= 8 * 1024 * 1024);

  renderer.focus();
  const initialSelectCount = calls.select.length;
  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 80.25,
      clientY: 10.5,
    }),
  );
  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 20.25,
      clientY: 40.5,
    }),
  );
  assert.equal(calls.select.length, initialSelectCount + 2);
  assert.deepEqual(calls.selectOptions.at(-2), {
    extend: false,
    mode: 'column',
  });
  assert.deepEqual(calls.selectOptions.at(-1), {
    extend: false,
    mode: 'row',
  });
  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 80.25,
      clientY: 40.5,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-0', columnId: 'name' },
    reason: 'pointer',
  });
  assert.deepEqual(calls.selectOptions.at(-1), { extend: false });
  assert.equal(grid.getAttribute('aria-multiselectable'), 'true');
  grid.dispatchEvent(
    fakeEvent('dblclick', {
      clientX: 80.25,
      clientY: 40.5,
    }),
  );
  assert.deepEqual(calls.requestEdit.at(-1), {
    address: { occurrenceId: 'row-0', columnId: 'name' },
    trigger: 'pointer',
  });

  grid.scrollTop = 280;
  grid.scrollLeft = 400;
  grid.dispatchEvent(fakeEvent('scroll'));
  window.flushAnimationFrames();
  assert.equal(calls.viewChange.at(-1).reason, 'scroll');
  assert.equal(calls.viewChange.at(-1).view.scrollTop, 280);
  assert.equal(calls.viewChange.at(-1).view.firstVisibleOccurrenceId, 'row-10');
  assert.equal(frameCommits.at(-1).scrollTop, 280);
  assert.ok(frameCommits.at(-1).sequence > frameCommits[0].sequence);
  assert.equal(
    renderer.scrollToView({ scrollLeft: 0, scrollTop: 0 }),
    true,
  );
  assert.equal(grid.scrollTop, 0);
  assert.equal(grid.scrollLeft, 0);
  assert.ok(
    container
      .querySelectorAll('[role="rowheader"]')
      .some((header) => header.textContent === '11'),
  );
  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 80.25,
      clientY: 40.5,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-10', columnId: 'name' },
    reason: 'pointer',
  });
  grid.dispatchEvent(
    fakeEvent('dblclick', {
      clientX: 80.25,
      clientY: 40.5,
    }),
  );
  assert.deepEqual(calls.requestEdit.at(-1), {
    address: { occurrenceId: 'row-10', columnId: 'name' },
    trigger: 'pointer',
  });

  grid.scrollTop = 0;
  grid.scrollLeft = 0;
  grid.dispatchEvent(fakeEvent('scroll'));
  window.flushAnimationFrames();
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Home',
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-0', columnId: 'name' },
    reason: 'keyboard',
  });
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowDown',
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-5001', columnId: 'quantity-18' },
    reason: 'keyboard',
  });
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'PageDown',
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-5010', columnId: 'quantity-18' },
    reason: 'keyboard',
  });
  grid.scrollTop = 0;
  grid.scrollLeft = 0;
  grid.dispatchEvent(fakeEvent('scroll'));
  window.flushAnimationFrames();

  const editAddress = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const draft = Object.freeze({
    address: editAddress,
    originalValue: 'Part 0',
    value: 'Part zero',
    dirty: true,
  });
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      editAddress,
      Object.freeze({ status: 'editing', draft }),
    ),
  );
  window.flushAnimationFrames();
  const portals = container.querySelectorAll('input[data-bom-editor-portal="true"]');
  assert.equal(portals.length, 1);
  const portal = portals[0];
  assert.equal(portal.hidden, false);
  assert.equal(portal.value, 'Part zero');
  assert.equal(portal.style.left, '48px');
  assert.equal(portal.style.top, '36px');
  assert.equal(portal.style.width, '140px');
  assert.equal(portal.style.height, '28px');
  assert.equal(portal.style.zIndex, '4');
  assert.equal(document.activeElement, portal);

  portal.dispatchEvent(fakeEvent('compositionstart'));
  portal.value = '零件';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertCompositionText' }));
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );
  assert.equal(calls.commit.length, 0);
  assert.deepEqual(calls.composition, [
    { address: editAddress, phase: 'start' },
  ]);
  assert.equal(calls.draftInput.at(-1).inputType, 'composition');

  portal.dispatchEvent(fakeEvent('compositionend'));
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );
  assert.deepEqual(calls.commit, [
    { address: editAddress, reason: 'enter' },
  ]);

  const fillSelectionAddress = Object.freeze({
    occurrenceId: 'row-1',
    columnId: 'name',
  });
  const fillSelectionDraft = Object.freeze({
    ...draft,
    address: fillSelectionAddress,
  });
  const fillSelectionRange = Object.freeze({
    anchor: editAddress,
    focus: fillSelectionAddress,
  });
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      fillSelectionAddress,
      Object.freeze({ status: 'editing', draft: fillSelectionDraft }),
      fillSelectionRange,
    ),
  );
  window.flushAnimationFrames();
  const ctrlEnter = fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  portal.dispatchEvent(ctrlEnter);
  assert.equal(ctrlEnter.defaultPrevented, true);
  assert.deepEqual(calls.commit.at(-1), {
    address: fillSelectionAddress,
    reason: 'fill-selection',
  });

  const multiFillAddress = Object.freeze({
    occurrenceId: 'row-5',
    columnId: 'name',
  });
  const multiFillDraft = Object.freeze({
    ...draft,
    address: multiFillAddress,
  });
  const multiFillRange = Object.freeze({
    anchor: { occurrenceId: 'row-3', columnId: 'name' },
    focus: multiFillAddress,
  });
  const multiFillRanges = Object.freeze([
    Object.freeze({
      anchor: { occurrenceId: 'row-0', columnId: 'name' },
      focus: { occurrenceId: 'row-2', columnId: 'name' },
    }),
    multiFillRange,
  ]);
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      multiFillAddress,
      Object.freeze({ status: 'editing', draft: multiFillDraft }),
      multiFillRange,
      undefined,
      null,
      multiFillRanges,
    ),
  );
  window.flushAnimationFrames();
  const multiFill = fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  portal.dispatchEvent(multiFill);
  assert.equal(multiFill.defaultPrevented, true);
  assert.deepEqual(calls.commit.at(-1), {
    address: multiFillAddress,
    reason: 'fill-selection',
  });

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      fillSelectionAddress,
      Object.freeze({ status: 'editing', draft: fillSelectionDraft }),
      fillSelectionRange,
    ),
  );
  window.flushAnimationFrames();
  const commandEnter = fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: false,
    metaKey: true,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  portal.dispatchEvent(commandEnter);
  assert.equal(commandEnter.defaultPrevented, true);
  assert.deepEqual(calls.commit.at(-1), {
    address: fillSelectionAddress,
    reason: 'fill-selection',
  });

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      fillSelectionAddress,
      Object.freeze({ status: 'editing', draft: fillSelectionDraft }),
    ),
  );
  window.flushAnimationFrames();
  const withoutRange = fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  portal.dispatchEvent(withoutRange);
  assert.equal(withoutRange.defaultPrevented, false);

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      fillSelectionAddress,
      Object.freeze({ status: 'editing', draft: fillSelectionDraft }),
      fillSelectionRange,
    ),
  );
  window.flushAnimationFrames();
  const fillCommitCount = calls.commit.length;
  for (const properties of [
    { shiftKey: true },
    { altKey: true },
    { repeat: true },
    { isComposing: true },
    { keyCode: 229 },
    { getModifierState: (name) => name === 'AltGraph' },
  ]) {
    const event = fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
      ...properties,
    });
    portal.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(calls.commit.length, fillCommitCount);
  assert.equal(container.querySelectorAll('input').length, 1);

  canvases[0].dispatchEvent(fakeEvent('contextlost'));
  canvases[0].dispatchEvent(fakeEvent('contextrestored'));
  window.flushAnimationFrames();
  assert.equal(diagnostics[0].code, 'BOM_RENDERER_CONTEXT_LOST');

  assert.throws(
    () =>
      mountBomCanvasRenderer(container, initial, createCallbacks(emptyCalls()), {
        instanceId: 'duplicate',
      }),
    /BOM_RENDERER_CONTAINER_ALREADY_MOUNTED/,
  );

  const migratedHost = document.createElement('div');
  migratedHost.appendChild(
    container.querySelector('[data-bom-canvas-renderer]'),
  );
  renderer.destroy();
  renderer.destroy();
  assert.equal(renderer.destroyed, true);
  for (const canvas of canvases) {
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  }
  assert.equal(portal.value, '');
  assert.equal(treegridDescription.parentNode, null);
  assert.equal(container.querySelector('[data-bom-canvas-renderer]'), null);
  assert.equal(migratedHost.querySelector('[data-bom-canvas-renderer]'), null);
  assert.equal(window.pendingAnimationFrames(), 0);
  assert.equal(window.listenerCount(), 0);
  assert.ok(window.observers.every((observer) => observer.disconnected));
  const terminalResources = renderer.getDiagnostics().resources;
  assert.equal(renderer.getDiagnostics().registeredResourceCount, 0);
  assert.equal(terminalResources.protocol, 'bom-resource-registry-ledger/v1');
  assert.equal(terminalResources.disposed, true);
  assert.equal(terminalResources.activeCount, 0);
  assert.equal(terminalResources.cleanupFailureCount, 0);
  assert.deepEqual(renderer.getDiagnostics().workerTasks, {
    protocol: 'bom-canvas-worker-task-ledger/v1',
    kind: 'worker-task',
    tracked: true,
    supported: false,
    queuedCount: 0,
    runningCount: 0,
    cleanupFailureCount: 0,
  });
  assert.deepEqual(
    terminalResources.kinds
      .filter((entry) =>
        ['event-listener', 'resize-observer',
          'renderer-root', 'renderer-dom-state', 'canvas', 'portal'].includes(
          entry.kind,
        ),
      )
      .map((entry) => [
        entry.kind,
        entry.tracked,
        entry.registeredCount,
        entry.activeCount,
        entry.cleanupFailureCount,
      ]),
    [
      ['canvas', true, 3, 0, 0],
      ['event-listener', true, 27, 0, 0],
      ['portal', true, 1, 0, 0],
      ['renderer-dom-state', true, 3, 0, 0],
      ['renderer-root', true, 1, 0, 0],
      ['resize-observer', true, 1, 0, 0],
    ],
  );
  const animationFrames = terminalResources.kinds.find(
    (entry) => entry.kind === 'animation-frame',
  );
  assert.ok(animationFrames.registeredCount > 0);
  assert.equal(animationFrames.activeCount, 0);
  assert.equal(animationFrames.cleanupFailureCount, 0);
  for (const kind of [
    'intersection-observer',
    'interval',
    'mutation-observer',
    'timeout',
    'worker',
    'worker-task',
  ]) {
    const entry = terminalResources.kinds.find(
      (candidate) => candidate.kind === kind,
    );
    assert.equal(entry.tracked, true);
    assert.equal(entry.registeredCount, 0);
    assert.equal(entry.activeCount, 0);
    assert.equal(entry.cleanupFailureCount, 0);
  }

  const remounted = mountBomCanvasRenderer(
    container,
    initial,
    createCallbacks(emptyCalls()),
    { instanceId: 'remounted' },
  );
  window.flushAnimationFrames();
  remounted.destroy();
});

test('display formats provide keyboard hints without changing the text editing portal', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const integerColumns = Object.freeze(
    createColumns().map((column) =>
      column.columnId === 'quantity-0'
        ? Object.freeze({
            ...column,
            format: Object.freeze({ kind: 'integer', useGrouping: true }),
          })
        : column,
    ),
  );
  const address = Object.freeze({
    occurrenceId: 'row-0',
    columnId: 'quantity-0',
  });
  const draft = Object.freeze({
    address,
    originalValue: 0,
    value: '123',
    dirty: true,
  });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      integerColumns,
      address,
      Object.freeze({ status: 'editing', draft }),
    ),
    createCallbacks(emptyCalls()),
    { instanceId: 'renderer-format-input-hint' },
  );
  window.flushAnimationFrames();

  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  assert.equal(portal.getAttribute('type'), 'text');
  assert.equal(portal.getAttribute('inputmode'), 'numeric');

  const decimalColumns = Object.freeze(
    integerColumns.map((column) =>
      column.columnId === 'quantity-0'
        ? Object.freeze({
            ...column,
            format: Object.freeze({ kind: 'decimal', maximumFractionDigits: 2 }),
          })
        : column,
    ),
  );
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      decimalColumns,
      address,
      Object.freeze({ status: 'editing', draft }),
    ),
  );
  window.flushAnimationFrames();
  assert.equal(portal.getAttribute('inputmode'), 'decimal');

  const fractionColumns = Object.freeze(
    decimalColumns.map((column) =>
      column.columnId === 'quantity-0'
        ? Object.freeze({
            ...column,
            format: Object.freeze({ kind: 'fraction', maximumDenominator: 64 }),
          })
        : column,
    ),
  );
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      fractionColumns,
      address,
      Object.freeze({ status: 'editing', draft }),
    ),
  );
  window.flushAnimationFrames();
  assert.equal(portal.getAttribute('inputmode'), 'decimal');

  const dateColumns = Object.freeze(
    fractionColumns.map((column) =>
      column.columnId === 'quantity-0'
        ? Object.freeze({
            ...column,
            format: Object.freeze({ kind: 'date', dateStyle: 'short' }),
          })
        : column,
    ),
  );
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      dateColumns,
      address,
      Object.freeze({ status: 'editing', draft }),
    ),
  );
  window.flushAnimationFrames();
  assert.equal(portal.getAttribute('inputmode'), 'text');
  renderer.destroy();
});

test('treegrid descriptions are optional, unique across instances, and removed on destroy', () => {
  const { document, window, container } = createFakeDom(480, 240);
  const secondContainer = document.createElement('div');
  secondContainer.clientWidth = 480;
  secondContainer.clientHeight = 240;
  const emptyContainer = document.createElement('div');
  emptyContainer.clientWidth = 480;
  emptyContainer.clientHeight = 240;
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const columns = createColumns();
  const initial = viewModel(
    snapshot,
    indexes,
    projection,
    columns,
    null,
    Object.freeze({ status: 'idle', draft: null }),
  );
  const first = mountBomCanvasRenderer(
    container,
    initial,
    createCallbacks(emptyCalls()),
    {
      instanceId: 'shared-description-id',
      labels: { treegridDescription: 'First description' },
    },
  );
  const second = mountBomCanvasRenderer(
    secondContainer,
    initial,
    createCallbacks(emptyCalls()),
    {
      instanceId: 'shared-description-id',
      labels: { treegridDescription: 'Second description' },
    },
  );
  const empty = mountBomCanvasRenderer(
    emptyContainer,
    initial,
    createCallbacks(emptyCalls()),
    {
      instanceId: 'empty-description',
      labels: { treegridDescription: '' },
    },
  );
  window.flushAnimationFrames();

  const firstGrid = container.querySelector('[role="treegrid"]');
  const secondGrid = secondContainer.querySelector('[role="treegrid"]');
  const emptyGrid = emptyContainer.querySelector('[role="treegrid"]');
  assert.ok(firstGrid);
  assert.ok(secondGrid);
  assert.ok(emptyGrid);
  const firstDescriptionId = firstGrid.getAttribute('aria-describedby');
  const secondDescriptionId = secondGrid.getAttribute('aria-describedby');
  assert.ok(firstDescriptionId);
  assert.ok(secondDescriptionId);
  assert.notEqual(firstDescriptionId, secondDescriptionId);
  const firstDescription = container.querySelector(`#${firstDescriptionId}`);
  const secondDescription = secondContainer.querySelector(
    `#${secondDescriptionId}`,
  );
  assert.ok(firstDescription);
  assert.ok(secondDescription);
  assert.equal(firstDescription.textContent, 'First description');
  assert.equal(secondDescription.textContent, 'Second description');
  assert.equal(emptyGrid.getAttribute('aria-describedby'), null);
  assert.equal(
    emptyContainer.querySelector('[data-bom-treegrid-description="true"]'),
    null,
  );

  first.destroy();
  assert.equal(firstDescription.parentNode, null);
  assert.equal(container.querySelector('[data-bom-treegrid-description="true"]'), null);
  assert.ok(secondContainer.querySelector(`#${secondDescriptionId}`));
  second.destroy();
  empty.destroy();
});

test('printable keys replace-edit an active editable cell without hijacking shortcuts or IME', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const active = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-type-to-replace' },
  );
  window.flushAnimationFrames();
  const editorPortal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(editorPortal);
  assert.equal(editorPortal.getAttribute('aria-label'), '编辑');
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const printable = fakeEvent('keydown', {
    key: '零',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(printable);
  assert.equal(printable.defaultPrevented, true);
  assert.deepEqual(calls.requestEdit, [
    { address: active, trigger: 'keyboard' },
  ]);
  assert.deepEqual(calls.draftInput, [
    { address: active, draftValue: '零', inputType: 'replace' },
  ]);

  const editCount = calls.requestEdit.length;
  const draftCount = calls.draftInput.length;
  for (const properties of [
    { key: 'q', ctrlKey: true },
    { key: 'q', metaKey: true },
    { key: 'q', altKey: true },
    { key: 'q', repeat: true },
    { key: 'q', isComposing: true },
    { key: 'Dead' },
    { key: 'Unidentified' },
    {
      key: 'q',
      getModifierState: (name) => name === 'AltGraph',
    },
  ]) {
    grid.dispatchEvent(
      fakeEvent('keydown', {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        repeat: false,
        ...properties,
      }),
    );
  }
  assert.equal(calls.requestEdit.length, editCount);
  assert.equal(calls.draftInput.length, draftCount);

  const readOnlyColumns = Object.freeze([
    Object.freeze({ ...columns[0], editable: false }),
    ...columns.slice(1),
  ]);
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      readOnlyColumns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
    ),
  );
  window.flushAnimationFrames();
  const readOnlyKey = fakeEvent('keydown', {
    key: 'x',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(readOnlyKey);
  assert.equal(readOnlyKey.defaultPrevented, false);
  assert.equal(calls.requestEdit.length, editCount);
  assert.equal(calls.draftInput.length, draftCount);
  renderer.destroy();
});

test('renderer retains cleanup failures in its terminal resource ledger', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      { occurrenceId: 'row-0', columnId: 'name' },
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(emptyCalls()),
    { instanceId: 'cleanup-failure-ledger' },
  );
  window.removeEventListener = () => {
    throw new Error('injected removeEventListener failure');
  };

  renderer.destroy();

  const diagnostics = renderer.getDiagnostics();
  const eventListeners = diagnostics.resources.kinds.find(
    (entry) => entry.kind === 'event-listener',
  );
  assert.equal(diagnostics.destroyed, true);
  assert.equal(diagnostics.resources.disposed, true);
  assert.equal(diagnostics.resources.activeCount, 0);
  assert.equal(diagnostics.resources.cleanupFailureCount, 1);
  assert.equal(eventListeners.cleanupFailureCount, 1);
});

test('mount failure disconnects a ResizeObserver whose observe call throws', () => {
  const { window, container } = createFakeDom(480, 240);
  let disconnected = false;
  window.ResizeObserver = class {
    observe() {
      throw new Error('injected observe failure');
    }

    disconnect() {
      disconnected = true;
    }
  };
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));

  assert.throws(
    () =>
      mountBomCanvasRenderer(
        container,
        viewModel(
          snapshot,
          indexes,
          projection,
          createColumns(),
          { occurrenceId: 'row-0', columnId: 'name' },
          Object.freeze({ status: 'focused', draft: null }),
        ),
        createCallbacks(emptyCalls()),
        { instanceId: 'observe-failure-cleanup' },
      ),
    /injected observe failure/,
  );
  assert.equal(disconnected, true);
  assert.equal(window.listenerCount(), 0);
  assert.equal(container.querySelector('[data-bom-canvas-renderer]'), null);
});

test('destroy releases a pending font-ready continuation before late settlement', async () => {
  const { document, window, container } = createFakeDom(480, 240);
  let resolveFonts;
  document.fonts.ready = new Promise((resolve) => {
    resolveFonts = resolve;
  });
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      { occurrenceId: 'row-0', columnId: 'name' },
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(emptyCalls()),
    { instanceId: 'pending-font-ready' },
  );

  renderer.destroy();
  resolveFonts();
  await Promise.resolve();
  await Promise.resolve();

  const fontReady = renderer.getDiagnostics().resources.kinds.find(
    (entry) => entry.kind === 'font-ready',
  );
  assert.equal(fontReady.registeredCount, 1);
  assert.equal(fontReady.activeCount, 0);
  assert.equal(fontReady.cleanupFailureCount, 0);
  assert.equal(window.pendingAnimationFrames(), 0);
  assert.equal(container.querySelector('[data-bom-canvas-renderer]'), null);
});

test('edit-only updates synchronize DOM without redrawing a stable selection', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const columns = createColumns();
  const activeAddress = Object.freeze({
    occurrenceId: 'row-0',
    columnId: 'name',
  });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      activeAddress,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(emptyCalls()),
    { instanceId: 'renderer-stable-selection' },
  );
  window.flushAnimationFrames();
  const clears = observeCanvasClears(container);
  const rejectedDraft = Object.freeze({
    address: Object.freeze({ ...activeAddress }),
    originalValue: 'Part 0',
    value: 'Rejected draft',
    dirty: true,
  });

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ ...activeAddress }),
      Object.freeze({
        status: 'rejected',
        draft: rejectedDraft,
        phase: 'validation',
        error: Object.freeze({
          code: 'TEST_REJECTED',
          category: 'VALIDATION',
          messageKey: 'TEST_REJECTED',
        }),
      }),
    ),
  );
  window.flushAnimationFrames();

  assert.deepEqual(clears, {
    background: 0,
    content: 0,
    interaction: 0,
  });
  const portal = container.querySelector(
    'input[data-bom-editor-portal="true"]',
  );
  assert.equal(portal.hidden, false);
  assert.equal(portal.value, 'Rejected draft');
  assert.equal(portal.getAttribute('aria-invalid'), 'true');
  const grid = container.querySelector('[role="treegrid"]');
  const activeCell = container.querySelector(
    `#${grid.getAttribute('aria-activedescendant')}`,
  );
  assert.equal(activeCell.getAttribute('aria-invalid'), 'true');

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({
        occurrenceId: 'row-1',
        columnId: 'name',
      }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
  );
  window.flushAnimationFrames();

  assert.deepEqual(clears, {
    background: 0,
    content: 0,
    interaction: 1,
  });
  assert.equal(portal.hidden, true);
  renderer.destroy();
});

test('live regions announce value-free edit failures and accept localized host status', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const columns = createColumns();
  const activeAddress = Object.freeze({
    occurrenceId: 'row-0',
    columnId: 'name',
  });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      activeAddress,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(emptyCalls()),
    {
      instanceId: 'live-region',
      liveRegion: { politeMinIntervalMs: 0 },
      labels: {
        liveRegion: {
          validationRejected: 'Input was not saved. Correct it and try again.',
          commitRejected: 'Save failed. The edit was not saved.',
        },
      },
    },
  );
  window.flushAnimationFrames();

  const polite = container.querySelector('[data-bom-live-region="polite"]');
  const assertive = container.querySelector('[data-bom-live-region="assertive"]');
  assert.ok(polite);
  assert.ok(assertive);
  assert.equal(polite.getAttribute('role'), 'status');
  assert.equal(polite.getAttribute('aria-live'), 'polite');
  assert.equal(polite.getAttribute('aria-atomic'), 'true');
  assert.equal(assertive.getAttribute('role'), 'alert');
  assert.equal(assertive.getAttribute('aria-live'), 'assertive');
  assert.equal(polite.style.clipPath, 'inset(50%)');

  assert.deepEqual(renderer.announce({ message: 'Changes saved.' }), {
    ok: true,
    delivery: 'immediate',
  });
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]').textContent,
    'Changes saved.',
  );

  const rejectedDraft = Object.freeze({
    address: activeAddress,
    originalValue: 'Part 0',
    value: 'Rejected draft',
    dirty: true,
  });
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      activeAddress,
      Object.freeze({
        status: 'rejected',
        draft: rejectedDraft,
        phase: 'validation',
        error: Object.freeze({
          code: 'TEST_REJECTED',
          category: 'VALIDATION',
          messageKey: 'TEST_REJECTED',
        }),
      }),
    ),
  );
  const rejectionMessage = assertive.querySelector(
    '[data-bom-live-region-message="assertive"]',
  );
  assert.equal(
    rejectionMessage.textContent,
    'Input was not saved. Correct it and try again.',
  );
  assert.equal(rejectionMessage.textContent.includes('Rejected draft'), false);
  assert.equal(rejectionMessage.textContent.includes('TEST_REJECTED'), false);

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      activeAddress,
      Object.freeze({ status: 'focused', draft: null }),
    ),
  );
  assert.equal(
    assertive.querySelector('[data-bom-live-region-message="assertive"]'),
    null,
  );

  renderer.destroy();
  assert.equal(polite.parentNode, null);
  assert.deepEqual(renderer.announce({ message: 'Ignored.' }), {
    ok: false,
    reason: 'destroyed',
  });
});

test('live-region delivery validates input and can be disabled by the host', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      null,
      Object.freeze({ status: 'idle', draft: null }),
    ),
    createCallbacks(emptyCalls()),
    {
      instanceId: 'disabled-live-region',
      liveRegion: { enabled: false },
    },
  );
  window.flushAnimationFrames();
  assert.equal(
    container
      .querySelector('[data-bom-live-region="polite"]')
      .getAttribute('aria-live'),
    'off',
  );
  assert.deepEqual(renderer.announce({ message: 'Disabled.' }), {
    ok: false,
    reason: 'disabled',
  });
  assert.deepEqual(renderer.announce({ message: '' }), {
    ok: false,
    reason: 'invalid-announcement',
  });
  renderer.destroy();
});

test('offscreen active proxies retain distinct row and cell Diff semantics through virtualization', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(80);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = Object.freeze([createColumns()[0]]);
  const active = Object.freeze({ occurrenceId: 'row-60', columnId: 'name' });
  const diffView = Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: snapshot.documentId,
    documentGeneration: 0,
    viewRevision: snapshot.revision,
    rows: Object.freeze([
      Object.freeze({ occurrenceId: 'row-60', kind: 'moved' }),
    ]),
    cells: Object.freeze([
      Object.freeze({
        occurrenceId: 'row-60',
        columnId: 'name',
        kind: 'changed',
      }),
    ]),
  });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
      null,
      undefined,
      diffView,
    ),
    createCallbacks(emptyCalls()),
    {
      instanceId: 'diff-active-proxy-lifecycle',
      labels: {
        diff: {
          moved: 'Row moved.',
          changed: 'Cell changed.',
        },
      },
    },
  );

  const assertProxySemantics = () => {
    const proxy = container.querySelector('[data-bom-active-proxy="true"]');
    assert.ok(proxy);
    assert.equal(proxy.getAttribute('data-bom-diff-kind'), 'moved');
    assert.equal(proxy.getAttribute('aria-description'), 'Row moved.');
    const rowHeader = proxy.querySelector('[role="rowheader"]');
    assert.ok(rowHeader);
    assert.equal(rowHeader.getAttribute('data-bom-diff-kind'), null);
    assert.equal(rowHeader.getAttribute('aria-description'), null);
    const cell = proxy.querySelector('[data-bom-active-proxy-cell="true"]');
    assert.ok(cell);
    assert.equal(cell.getAttribute('data-bom-diff-kind'), 'changed');
    assert.equal(
      cell.getAttribute('aria-description'),
      'The display name of the occurrence Cell changed.',
    );
    assert.equal(container.querySelectorAll('[data-bom-diff-kind]').length, 2);
  };

  const assertMountedSemantics = () => {
    assert.equal(container.querySelector('[data-bom-active-proxy="true"]'), null);
    const row = container.querySelectorAll('[role="row"]').find(
      (candidate) => candidate.getAttribute('aria-rowindex') === '62',
    );
    assert.ok(row);
    assert.equal(row.getAttribute('data-bom-diff-kind'), 'moved');
    assert.equal(row.getAttribute('aria-description'), 'Row moved.');
    const rowHeader = row.querySelector('[role="rowheader"]');
    assert.ok(rowHeader);
    assert.equal(rowHeader.getAttribute('data-bom-diff-kind'), null);
    assert.equal(rowHeader.getAttribute('aria-description'), null);
    const cell = row.querySelector('[role="gridcell"]');
    assert.ok(cell);
    assert.equal(cell.getAttribute('data-bom-diff-kind'), 'changed');
    assert.equal(
      cell.getAttribute('aria-description'),
      'The display name of the occurrence Cell changed.',
    );
    assert.equal(container.querySelectorAll('[data-bom-diff-kind]').length, 2);
  };

  window.flushAnimationFrames();
  assertProxySemantics();

  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.scrollTop = 60 * 28;
  grid.dispatchEvent(fakeEvent('scroll'));
  window.flushAnimationFrames();
  assertMountedSemantics();

  grid.scrollTop = 0;
  grid.dispatchEvent(fakeEvent('scroll'));
  window.flushAnimationFrames();
  assertProxySemantics();
  renderer.destroy();
});

test('value-free diff views retain non-color and virtual-treegrid semantics', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const columns = Object.freeze(createColumns().slice(0, 2));
  const active = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const diffView = Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: snapshot.documentId,
    documentGeneration: 0,
    viewRevision: snapshot.revision,
    rows: Object.freeze([
      Object.freeze({ occurrenceId: 'row-0', kind: 'moved' }),
    ]),
    cells: Object.freeze([
      Object.freeze({
        occurrenceId: 'row-1',
        columnId: 'name',
        kind: 'changed',
      }),
    ]),
  });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
      null,
      undefined,
      diffView,
    ),
    createCallbacks(emptyCalls()),
    {
      instanceId: 'diff-view',
      theme: {
        diffAddedFill: '#ffffff',
        diffDeletedFill: '#ffffff',
        diffChangedFill: '#ffffff',
        diffMarker: '#0f766e',
      },
      labels: {
        diff: {
          moved: 'Moved marker.',
          changed: 'Changed marker.',
        },
        liveRegion: {
          commitRejected: 'Initial commit rejection.',
        },
      },
    },
  );
  const interaction = container.querySelector(
    'canvas[data-bom-canvas-layer="interaction"]',
  );
  const interactionContext = interaction.getContext('2d');
  const initialDiffMarker = '#0f766e';
  const markerOperations = [];
  let path = [];
  const originalBeginPath = interactionContext.beginPath.bind(interactionContext);
  const originalMoveTo = interactionContext.moveTo.bind(interactionContext);
  const originalLineTo = interactionContext.lineTo.bind(interactionContext);
  const originalStroke = interactionContext.stroke.bind(interactionContext);
  const originalStrokeRect = interactionContext.strokeRect.bind(interactionContext);
  interactionContext.beginPath = (...args) => {
    path = [];
    originalBeginPath(...args);
  };
  interactionContext.moveTo = (...args) => {
    path.push(Object.freeze({ type: 'moveTo', args: [...args] }));
    originalMoveTo(...args);
  };
  interactionContext.lineTo = (...args) => {
    path.push(Object.freeze({ type: 'lineTo', args: [...args] }));
    originalLineTo(...args);
  };
  interactionContext.stroke = (...args) => {
    markerOperations.push(
      Object.freeze({
        type: 'stroke',
        strokeStyle: interactionContext.strokeStyle,
        path: Object.freeze([...path]),
      }),
    );
    originalStroke(...args);
  };
  interactionContext.strokeRect = (...args) => {
    markerOperations.push(
      Object.freeze({
        type: 'strokeRect',
        strokeStyle: interactionContext.strokeStyle,
        args: Object.freeze([...args]),
      }),
    );
    originalStrokeRect(...args);
  };
  window.flushAnimationFrames();

  const rows = container.querySelectorAll('[role="row"]');
  const movedRow = rows.find(
    (row) => row.getAttribute('aria-rowindex') === '2',
  );
  assert.equal(movedRow.getAttribute('data-bom-diff-kind'), 'moved');
  assert.equal(movedRow.getAttribute('aria-description'), 'Moved marker.');
  const movedRowHeader = movedRow.querySelector('[role="rowheader"]');
  assert.equal(movedRowHeader.getAttribute('data-bom-diff-kind'), null);
  assert.equal(movedRowHeader.getAttribute('aria-description'), null);
  const unchangedCellInMovedRow = movedRow.querySelectorAll('[role="gridcell"]').find(
    (cell) => cell.textContent === 'Part 0',
  );
  assert.equal(unchangedCellInMovedRow.getAttribute('data-bom-diff-kind'), null);
  assert.equal(
    unchangedCellInMovedRow.getAttribute('aria-description'),
    'The display name of the occurrence',
  );
  const changedCell = container.querySelectorAll('[role="gridcell"]').find(
    (cell) => cell.textContent === 'Part 1',
  );
  assert.equal(changedCell.getAttribute('data-bom-diff-kind'), 'changed');
  assert.equal(
    changedCell.getAttribute('aria-description'),
    'The display name of the occurrence Changed marker.',
  );
  assert.equal(changedCell.getAttribute('aria-description').includes('Part 1'), false);
  assert.ok(
    markerOperations.some(
      (operation) =>
        operation.type === 'stroke' &&
        operation.strokeStyle === initialDiffMarker &&
        operation.path.map((segment) => segment.type).join(',') ===
          'moveTo,lineTo,lineTo',
    ),
  );
  assert.ok(
    markerOperations.some(
      (operation) =>
        operation.type === 'strokeRect' &&
        operation.strokeStyle === initialDiffMarker &&
        operation.args[2] === 6 &&
        operation.args[3] === 6,
    ),
  );

  const initialPresentation = renderer.getPresentation();
  markerOperations.length = 0;
  const configured = renderer.configurePresentation({
    labels: {
      diff: { changed: 'Changed after presentation update.' },
      liveRegion: { validationRejected: 'Updated validation rejection.' },
    },
    theme: { diffMarker: '#7c3aed' },
  });
  assert.equal(configured.ok, true);
  assert.equal(configured.state.labels.diff.moved, 'Moved marker.');
  assert.equal(
    configured.state.labels.diff.changed,
    'Changed after presentation update.',
  );
  assert.equal(
    configured.state.labels.diff.inserted,
    initialPresentation.labels.diff.inserted,
  );
  assert.equal(
    configured.state.labels.liveRegion.commitRejected,
    'Initial commit rejection.',
  );
  assert.equal(
    configured.state.labels.liveRegion.validationRejected,
    'Updated validation rejection.',
  );
  assert.equal(
    configured.state.labels.liveRegion.validationCompleted,
    initialPresentation.labels.liveRegion.validationCompleted,
  );
  window.flushAnimationFrames();
  const updatedMovedRow = container.querySelectorAll('[role="row"]').find(
    (row) => row.getAttribute('aria-rowindex') === '2',
  );
  const updatedChangedCell = container.querySelectorAll('[role="gridcell"]').find(
    (cell) => cell.textContent === 'Part 1',
  );
  assert.ok(updatedMovedRow);
  assert.ok(updatedChangedCell);
  assert.equal(updatedMovedRow.getAttribute('aria-description'), 'Moved marker.');
  assert.equal(
    updatedChangedCell.getAttribute('aria-description'),
    'The display name of the occurrence Changed after presentation update.',
  );
  assert.ok(
    markerOperations.some(
      (operation) =>
        operation.strokeStyle === '#7c3aed' &&
        (operation.type === 'stroke' || operation.type === 'strokeRect'),
    ),
  );

  const rejectedDraft = Object.freeze({
    address: active,
    originalValue: 'Part 0',
    value: 'Rejected draft',
    dirty: true,
  });
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({
        status: 'rejected',
        draft: rejectedDraft,
        phase: 'validation',
        error: Object.freeze({
          code: 'TEST_REJECTED',
          category: 'VALIDATION',
          messageKey: 'TEST_REJECTED',
        }),
      }),
      null,
      undefined,
      diffView,
    ),
  );
  assert.equal(
    container
      .querySelector('[data-bom-live-region="assertive"]')
      .querySelector('[data-bom-live-region-message="assertive"]').textContent,
    'Updated validation rejection.',
  );

  const clears = observeCanvasClears(container);
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
      null,
      undefined,
      Object.freeze({
        ...diffView,
        rows: Object.freeze([]),
        cells: Object.freeze([]),
      }),
    ),
  );
  window.flushAnimationFrames();
  assert.equal(clears.content, 1);
  assert.equal(clears.interaction, 1);
  assert.equal(
    container.querySelector('[data-bom-diff-kind]'),
    null,
  );

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
      null,
      undefined,
      Object.freeze({ ...diffView, viewRevision: 'stale-revision' }),
    ),
  );
  window.flushAnimationFrames();
  assert.equal(container.querySelector('[data-bom-diff-kind]'), null);
  renderer.destroy();
});

test('deleted Diff summaries stay value-free and do not fabricate treegrid rows', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const columns = Object.freeze(createColumns().slice(0, 2));
  const diffView = Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: snapshot.documentId,
    documentGeneration: 0,
    viewRevision: snapshot.revision,
    rows: Object.freeze([]),
    cells: Object.freeze([]),
    deletedRows: Object.freeze([
      Object.freeze({
        occurrenceId: 'deleted-row-0',
        anchorOccurrenceId: 'row-0',
        position: 'before',
        count: 2,
      }),
    ]),
  });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
      null,
      undefined,
      diffView,
    ),
    createCallbacks(emptyCalls()),
    {
      instanceId: 'diff-deletion-summary',
      labels: { diff: { deletedSummary: 'Deleted {count} rows.' } },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.equal(grid.getAttribute('aria-rowcount'), '3');
  const summary = container.querySelector('[data-bom-diff-deletion-summary="true"]');
  assert.ok(summary);
  assert.equal(summary.getAttribute('role'), 'note');
  assert.equal(summary.textContent, 'Deleted 2 rows.');
  assert.equal(summary.getAttribute('aria-description'), 'Deleted 2 rows.');
  assert.equal(container.querySelectorAll('[role="row"]').length, 3);
  assert.equal(container.querySelector('[data-bom-diff-kind]'), null);

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
      null,
      undefined,
      Object.freeze({ ...diffView, deletedRows: Object.freeze([]) }),
    ),
  );
  window.flushAnimationFrames();
  assert.equal(container.querySelector('[data-bom-diff-deletion-summary]'), null);
  renderer.destroy();
});

test('opt-in Diff ghost rows expand the projection without becoming edit targets', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = Object.freeze(createColumns().slice(0, 2));
  const diffView = Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: snapshot.documentId,
    documentGeneration: 0,
    viewRevision: snapshot.revision,
    rows: Object.freeze([]),
    cells: Object.freeze([]),
    ghostRows: Object.freeze([
      Object.freeze({
        occurrenceId: 'deleted-before',
        anchorOccurrenceId: 'row-0',
        position: 'before',
      }),
      Object.freeze({
        occurrenceId: 'deleted-end',
        position: 'end',
        depth: 2,
      }),
    ]),
  });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
      null,
      undefined,
      diffView,
    ),
    createCallbacks(calls),
    {
      instanceId: 'diff-ghost-rows',
      labels: { diff: { deletedGhost: 'Deleted row.' } },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.equal(grid.getAttribute('aria-rowcount'), '5');
  const ghosts = container.querySelectorAll('[data-bom-diff-ghost-row]');
  assert.equal(ghosts.length, 2);
  assert.equal(ghosts[0].getAttribute('aria-disabled'), 'true');
  assert.equal(ghosts[0].getAttribute('aria-readonly'), 'true');
  assert.equal(ghosts[0].getAttribute('aria-description'), 'Deleted row.');
  assert.equal(ghosts[0].querySelector('[role="gridcell"]').textContent, 'Deleted row.');
  assert.equal(renderer.getDiagnostics().mountedRowCount, 4);
  assert.equal(calls.select.length, 0);
  renderer.destroy();
});

test('pointer and Space expose equivalent tree expansion paths', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createTreeFixture();
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, {
      indexes,
      rowHeight: 28,
      expandedIds: ['root'],
    }),
  );
  const columns = createColumns();
  const calls = emptyCalls();
  const rootAddress = Object.freeze({
    occurrenceId: 'root',
    columnId: 'name',
  });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      rootAddress,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-expansion' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 58,
      clientY: 50,
    }),
  );
  assert.deepEqual(calls.toggleExpansion.at(-1), {
    address: rootAddress,
    expanded: false,
  });

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: ' ',
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  assert.deepEqual(calls.toggleExpansion.at(-1), {
    address: rootAddress,
    expanded: false,
  });
  assert.equal(calls.toggleExpansion.length, 2);

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({
        occurrenceId: 'root',
        columnId: 'quantity-0',
      }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
  );
  window.flushAnimationFrames();
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: ' ',
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  assert.equal(calls.toggleExpansion.length, 2);

  renderer.destroy();
});

test('Shift navigation reports range extension and the semantic window marks the rectangular range', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const calls = emptyCalls();
  const anchor = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const focus = Object.freeze({ occurrenceId: 'row-1', columnId: 'quantity-0' });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      anchor,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-range-selection' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowDown',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-1', columnId: 'name' },
    reason: 'keyboard',
  });
  assert.deepEqual(calls.selectOptions.at(-1), { extend: true });

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      focus,
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({ anchor, focus }),
    ),
  );
  window.flushAnimationFrames();

  const selected = container
    .querySelectorAll('[role="gridcell"]')
    .filter((cell) => cell.getAttribute('aria-selected') === 'true');
  assert.equal(selected.length, 4);
  const activeId = grid.getAttribute('aria-activedescendant');
  assert.ok(activeId);
  assert.equal(
    container.querySelector(`#${activeId}`)?.getAttribute('aria-selected'),
    'true',
  );
  renderer.destroy();
});

test('native scrollbar drags never start a cell-selection gesture', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-scrollbar-gesture' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.clientWidth = 465;
  grid.clientHeight = 225;
  grid.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 480, bottom: 240,
    width: 480, height: 240, toJSON() { return {}; },
  });

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 40,
    pointerType: 'mouse',
    clientX: 80,
    clientY: 232,
  }));
  assert.equal(grid.hasPointerCapture(40), false);
  assert.deepEqual(calls.select, []);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 41,
    pointerType: 'mouse',
    clientX: 472,
    clientY: 80,
  }));
  assert.equal(grid.hasPointerCapture(41), false);
  assert.deepEqual(calls.select, []);
  renderer.destroy();
});

test('mouse drag extends a rectangular selection and releases its pointer session', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const active = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const calls = emptyCalls();
  const shortcuts = [];
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'renderer-drag-selection',
      shortcuts: {
        bindings: [
          {
            id: 'drag.custom',
            keys: 'Primary+K',
            command: 'drag-custom',
            scope: 'dragging',
          },
        ],
      },
      onShortcut(invocation) {
        shortcuts.push(invocation);
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      pointerId: 41,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 50,
    }),
  );
  assert.equal(grid.hasPointerCapture(41), true);
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-0', columnId: 'name' },
    reason: 'pointer',
  });
  assert.deepEqual(calls.selectOptions.at(-1), { extend: false });

  const draggingShortcut = fakeEvent('keydown', {
    key: 'k',
    keyCode: 75,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(draggingShortcut);
  assert.equal(draggingShortcut.defaultPrevented, true);
  assert.equal(shortcuts.at(-1).scope, 'dragging');

  const draggingArrow = fakeEvent('keydown', {
    key: 'ArrowDown',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(draggingArrow);
  assert.equal(draggingArrow.defaultPrevented, false);
  assert.equal(calls.select.length, 1);

  grid.dispatchEvent(
    fakeEvent('pointermove', {
      pointerId: 41,
      pointerType: 'mouse',
      clientX: 220,
      clientY: 76,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-1', columnId: 'quantity-0' },
    reason: 'pointer',
  });
  assert.deepEqual(calls.selectOptions.at(-1), { extend: true });
  const afterExtension = calls.select.length;

  grid.dispatchEvent(
    fakeEvent('pointermove', {
      pointerId: 41,
      pointerType: 'mouse',
      clientX: 220,
      clientY: 76,
    }),
  );
  assert.equal(calls.select.length, afterExtension);

  grid.dispatchEvent(
    fakeEvent('pointerup', {
      pointerId: 41,
      pointerType: 'mouse',
      clientX: 220,
      clientY: 76,
    }),
  );
  assert.equal(grid.hasPointerCapture(41), false);
  grid.dispatchEvent(
    fakeEvent('pointermove', {
      pointerId: 41,
      pointerType: 'mouse',
      clientX: 220,
      clientY: 104,
    }),
  );
  assert.equal(calls.select.length, afterExtension);

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      pointerId: 42,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 50,
    }),
  );
  const afterSecondStart = calls.select.length;
  grid.dispatchEvent(fakeEvent('pointercancel', { pointerId: 42 }));
  assert.equal(grid.hasPointerCapture(42), false);
  grid.dispatchEvent(
    fakeEvent('pointermove', {
      pointerId: 42,
      pointerType: 'mouse',
      clientX: 220,
      clientY: 104,
    }),
  );
  assert.equal(calls.select.length, afterSecondStart);

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      pointerId: 43,
      pointerType: 'touch',
      clientX: 80,
      clientY: 50,
    }),
  );
  const afterTouchStart = calls.select.length;
  assert.equal(grid.hasPointerCapture(43), false);
  grid.dispatchEvent(
    fakeEvent('pointermove', {
      pointerId: 43,
      pointerType: 'touch',
      clientX: 220,
      clientY: 104,
    }),
  );
  assert.equal(calls.select.length, afterTouchStart);
  renderer.destroy();
});

test('mouse selection drag auto-scrolls at viewport edges and stops on release', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(20);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-selection-auto-scroll' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.clientWidth = 480;
  grid.clientHeight = 240;

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 50,
    pointerType: 'mouse',
    clientX: 80,
    clientY: 239,
  }));
  const heldAtBottom = grid.scrollTop;
  window.flushAnimationFrames();
  assert.equal(grid.scrollTop, heldAtBottom);
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 50,
    pointerType: 'mouse',
    clientX: 80,
    clientY: 239,
  }));

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 51,
    pointerType: 'mouse',
    clientX: 80,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 51,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 239,
  }));
  const before = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop > before);
  assert.ok(calls.select.length > 1);

  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 51,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 239,
  }));
  const released = grid.scrollTop;
  window.flushAnimationFrames();
  assert.equal(grid.scrollTop, released);
  assert.equal(grid.hasPointerCapture(51), false);
  renderer.destroy();
});

test('fill-handle drag auto-scrolls downward and stops on release', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(20);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const anchor = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const focus = Object.freeze({ occurrenceId: 'row-1', columnId: 'name' });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      focus,
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({ anchor, focus }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-fill-auto-scroll' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.clientWidth = 480;
  grid.clientHeight = 240;

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 60,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 87,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 60,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 116,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 60,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 239,
  }));
  const before = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop > before);
  const afterFirstFrame = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop > afterFirstFrame);

  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 60,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 239,
  }));
  assert.equal(calls.fillDown.length, 1);
  assert.deepEqual(calls.select.at(-1).address, {
    occurrenceId: 'row-7',
    columnId: 'name',
  });
  const released = grid.scrollTop;
  window.flushAnimationFrames();
  assert.equal(grid.scrollTop, released);
  assert.equal(grid.hasPointerCapture(60), false);
  renderer.destroy();
});

test('Alt fill-handle drag delegates an expanded range to fillSeries', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(5);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const anchor = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const focus = Object.freeze({ occurrenceId: 'row-1', columnId: 'name' });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      focus,
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({ anchor, focus }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-fill-series-handle' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerType: 'mouse',
    altKey: true,
    clientX: 185,
    clientY: 87,
  }));
  assert.equal(grid.style.cursor, 'cell');

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 61,
    pointerType: 'mouse',
    altKey: true,
    clientX: 185,
    clientY: 87,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 61,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 116,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 61,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 116,
  }));

  assert.equal(calls.fillDown.length, 0);
  assert.equal(calls.fillSeries.length, 1);
  assert.deepEqual(calls.select.at(-1)?.address, {
    occurrenceId: 'row-2',
    columnId: 'name',
  });
  assert.deepEqual(calls.selectOptions.at(-1), { extend: true });
  renderer.destroy();
});

test('fill-handle drag keeps extending after the pointer leaves the virtual row window', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(100);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const anchor = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const focus = Object.freeze({ occurrenceId: 'row-1', columnId: 'name' });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      focus,
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({ anchor, focus }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-fill-auto-scroll-outside-overscan' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.clientWidth = 480;
  grid.clientHeight = 240;

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 62,
    pointerType: 'mouse',
    clientX: 185,
    // The source rectangle's lower-right fill handle.
    clientY: 87,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 62,
    pointerType: 'mouse',
    clientX: 185,
    // Beyond the viewport and the default 140px virtual overscan.
    clientY: 420,
  }));
  const before = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop > before);
  const afterFirstFrame = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop > afterFirstFrame);
  window.flushAnimationFrames();

  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 62,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 420,
  }));
  assert.equal(calls.fillDown.length, 1);
  const target = calls.select.at(-1)?.address;
  assert.ok(target);
  assert.equal(target.columnId, 'name');
  assert.ok(Number(target.occurrenceId.slice('row-'.length)) > 7);

  const released = grid.scrollTop;
  window.flushAnimationFrames();
  assert.equal(grid.scrollTop, released);
  assert.equal(grid.hasPointerCapture(62), false);
  renderer.destroy();
});

test('multi-range fill-handle drag extends the active range and keeps its peers', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(8);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const firstRange = Object.freeze({
    anchor: Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
    focus: Object.freeze({ occurrenceId: 'row-1', columnId: 'name' }),
  });
  const activeRange = Object.freeze({
    anchor: Object.freeze({ occurrenceId: 'row-3', columnId: 'name' }),
    focus: Object.freeze({ occurrenceId: 'row-4', columnId: 'name' }),
  });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-4', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
      activeRange,
      undefined,
      null,
      Object.freeze([firstRange, activeRange]),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-fill-multi-range' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 63,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 171,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 63,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 199,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 63,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 199,
  }));

  assert.equal(calls.fillDown.length, 1);
  assert.deepEqual(calls.select.at(-1)?.address, {
    occurrenceId: 'row-5',
    columnId: 'name',
  });
  assert.deepEqual(calls.selectOptions.at(-1), { extend: true });
  renderer.destroy();
});

test('Alt multi-range fill-handle drag delegates all eligible ranges to fillSeries', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(8);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const firstRange = Object.freeze({
    anchor: Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
    focus: Object.freeze({ occurrenceId: 'row-2', columnId: 'name' }),
  });
  const activeRange = Object.freeze({
    anchor: Object.freeze({ occurrenceId: 'row-3', columnId: 'name' }),
    focus: Object.freeze({ occurrenceId: 'row-4', columnId: 'name' }),
  });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-4', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
      activeRange,
      undefined,
      null,
      Object.freeze([firstRange, activeRange]),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-fill-multi-range-series' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 64,
    pointerType: 'mouse',
    altKey: true,
    clientX: 185,
    clientY: 171,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 64,
    pointerType: 'mouse',
    altKey: true,
    clientX: 185,
    clientY: 199,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 64,
    pointerType: 'mouse',
    altKey: true,
    clientX: 185,
    clientY: 199,
  }));

  assert.equal(calls.fillDown.length, 0);
  assert.equal(calls.fillSeries.length, 1);
  assert.deepEqual(calls.select.at(-1)?.address, {
    occurrenceId: 'row-5',
    columnId: 'name',
  });
  renderer.destroy();
});

test('multi-range fill handle stays inactive when a peer has no source row', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(6);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const activeRange = Object.freeze({
    anchor: Object.freeze({ occurrenceId: 'row-3', columnId: 'name' }),
    focus: Object.freeze({ occurrenceId: 'row-4', columnId: 'name' }),
  });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-4', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
      activeRange,
      undefined,
      null,
      Object.freeze([
        Object.freeze({
          anchor: Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
          focus: Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
        }),
        activeRange,
      ]),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-fill-multi-range-singleton-peer' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 65,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 171,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 65,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 171,
  }));
  assert.equal(calls.fillDown.length, 0);
  renderer.destroy();
});

test('tree row drag previews before, inside, and after targets and emits only on release', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(3);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'tree-row-drag-preview',
      liveRegion: { politeMinIntervalMs: 0 },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  const polite = container.querySelector('[data-bom-live-region="polite"]');
  assert.ok(grid);
  assert.ok(polite);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  assert.equal(grid.hasPointerCapture(81), true);
  assert.deepEqual(calls.selectOptions.at(-1), {
    extend: false,
    mode: 'row',
  });

  // The target row is row-1. The upper, middle, and lower portions select
  // before, inside, and after without mutating the host until pointerup.
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 65,
  }));
  window.flushAnimationFrames();
  let target = grid.querySelector('[data-bom-tree-drop-position="before"]');
  assert.ok(target);
  assert.equal(target.getAttribute('aria-description'), '放置到之前。');
  assert.equal(calls.moveSubtree.length, 0);
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]')?.textContent,
    '放置到之前。',
  );

  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 74,
  }));
  window.flushAnimationFrames();
  target = grid.querySelector('[data-bom-tree-drop-position="inside"]');
  assert.ok(target);
  assert.equal(target.getAttribute('aria-description'), '放置到作为子项。');
  assert.equal(calls.moveSubtree.length, 0);

  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 90,
  }));
  window.flushAnimationFrames();
  target = grid.querySelector('[data-bom-tree-drop-position="after"]');
  assert.ok(target);
  assert.equal(target.getAttribute('aria-description'), '放置到之后。');
  assert.equal(calls.moveSubtree.length, 0);

  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 90,
  }));
  assert.deepEqual(calls.moveSubtree, [{
    occurrenceId: 'row-0',
    targetOccurrenceId: 'row-1',
    position: 'after',
  }]);
  assert.equal(grid.hasPointerCapture(81), false);
  window.flushAnimationFrames();
  assert.equal(grid.querySelector('[data-bom-tree-drop-position]'), null);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 85,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 85,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 65,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 85,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 65,
  }));
  assert.deepEqual(calls.moveSubtree.at(-1), {
    occurrenceId: 'row-0',
    targetOccurrenceId: 'row-1',
    position: 'before',
  });

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 86,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 86,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 74,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 86,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 74,
  }));
  assert.deepEqual(calls.moveSubtree.at(-1), {
    occurrenceId: 'row-0',
    targetOccurrenceId: 'row-1',
    position: 'inside',
  });
  renderer.destroy();
});

test('tree row drag auto-scrolls beyond the virtual window and commits only on release', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(100);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'tree-row-drag-auto-scroll' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.clientWidth = 480;
  grid.clientHeight = 240;

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 87,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 87,
    pointerType: 'mouse',
    clientX: 20,
    // Continue well below both the viewport and default row overscan.
    clientY: 420,
  }));
  assert.equal(calls.moveSubtree.length, 0);
  const before = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop > before);
  const afterFirstFrame = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop > afterFirstFrame);
  assert.equal(calls.moveSubtree.length, 0);

  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 87,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 420,
  }));
  assert.equal(calls.moveSubtree.length, 1);
  const request = calls.moveSubtree[0];
  assert.equal(request.occurrenceId, 'row-0');
  assert.equal(request.position, 'after');
  assert.ok(Number(request.targetOccurrenceId.slice('row-'.length)) > 7);
  assert.equal(grid.hasPointerCapture(87), false);

  const released = grid.scrollTop;
  window.flushAnimationFrames();
  assert.equal(grid.scrollTop, released);
  renderer.destroy();
});

test('tree row drag auto-scrolls upward beyond the virtual window and commits only on release', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(100);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-60', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'tree-row-drag-auto-scroll-upward' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.clientWidth = 480;
  grid.clientHeight = 240;
  grid.scrollTop = 60 * 28;
  grid.dispatchEvent(fakeEvent('scroll'));
  window.flushAnimationFrames();

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 88,
    pointerType: 'mouse',
    clientX: 20,
    // Start below the first visible row so the upward target is never self.
    clientY: 200,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 88,
    pointerType: 'mouse',
    clientX: 20,
    // Continue well above both the viewport and default row overscan.
    clientY: -180,
  }));
  assert.equal(calls.moveSubtree.length, 0);
  const before = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop < before);
  const afterFirstFrame = grid.scrollTop;
  window.flushAnimationFrames();
  assert.ok(grid.scrollTop < afterFirstFrame);
  assert.equal(calls.moveSubtree.length, 0);

  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 88,
    pointerType: 'mouse',
    clientX: 20,
    clientY: -180,
  }));
  assert.equal(calls.moveSubtree.length, 1);
  const request = calls.moveSubtree[0];
  assert.equal(request.position, 'before');
  assert.ok(Number(request.occurrenceId.slice('row-'.length)) > 60);
  assert.ok(
    Number(request.targetOccurrenceId.slice('row-'.length)) <
      Number(request.occurrenceId.slice('row-'.length)),
  );
  assert.equal(grid.hasPointerCapture(88), false);

  const released = grid.scrollTop;
  window.flushAnimationFrames();
  assert.equal(grid.scrollTop, released);
  renderer.destroy();
});

test('multi-row tree drag emits ordered stable IDs only on release', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-1', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({
        anchor: Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
        focus: Object.freeze({ occurrenceId: 'row-1', columnId: 'name' }),
      }),
      'row',
    ),
    createCallbacks(calls),
    { instanceId: 'multi-row-tree-drag' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 91,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 91,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 95,
  }));
  window.flushAnimationFrames();
  assert.equal(calls.moveSubtree.length, 0);
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 91,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 95,
  }));
  assert.deepEqual(calls.moveSubtree, [{
    occurrenceId: 'row-0',
    targetOccurrenceId: 'row-2',
    position: 'before',
    occurrenceIds: ['row-0', 'row-1'],
  }]);
  renderer.destroy();
});

test('tree row drag rejects self and descendant targets and cancels cleanly', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createTreeFixture();
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, {
      indexes,
      rowHeight: 28,
      expandedIds: ['root'],
    }),
  );
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'root', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'tree-row-drag-guards' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  // A row cannot be dropped onto itself.
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 82,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 82,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 58,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 82,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 58,
  }));
  assert.equal(calls.moveSubtree.length, 0);
  assert.equal(grid.hasPointerCapture(82), false);

  // A row cannot be dropped inside one of its descendants.
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 83,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 83,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 74,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 83,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 74,
  }));
  assert.equal(calls.moveSubtree.length, 0);
  assert.equal(grid.hasPointerCapture(83), false);

  // Cancellation removes the preview and prevents a late pointer event from
  // reaching the host callback.
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 84,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 84,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 102,
  }));
  grid.dispatchEvent(fakeEvent('pointercancel', { pointerId: 84 }));
  assert.equal(grid.hasPointerCapture(84), false);
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 84,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 102,
  }));
  assert.equal(calls.moveSubtree.length, 0);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 87,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 87,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 74,
  }));
  grid.dispatchEvent(fakeEvent('lostpointercapture', { pointerId: 87 }));
  assert.equal(grid.hasPointerCapture(87), false);
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 87,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 74,
  }));
  assert.equal(calls.moveSubtree.length, 0);
  renderer.destroy();
});

test('Ctrl or Command+A delegates visible-rectangle selection to the editor', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-1', columnId: 'quantity-0' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-select-all' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const controlA = fakeEvent('keydown', {
    key: 'a',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(controlA);
  assert.equal(controlA.defaultPrevented, true);
  assert.equal(calls.selectAll.length, 1);

  const commandA = fakeEvent('keydown', {
    key: 'A',
    altKey: false,
    ctrlKey: false,
    metaKey: true,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(commandA);
  assert.equal(commandA.defaultPrevented, true);
  assert.equal(calls.selectAll.length, 2);

  const shiftedControlA = fakeEvent('keydown', {
    key: 'a',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  });
  grid.dispatchEvent(shiftedControlA);
  assert.equal(shiftedControlA.defaultPrevented, false);
  assert.equal(calls.selectAll.length, 2);
  renderer.destroy();
});

test('row and column headers plus Space shortcuts delegate axis selection', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const active = Object.freeze({ occurrenceId: 'row-3', columnId: 'name' });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-axis-selection' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 20,
      clientY: 50,
      shiftKey: false,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-0', columnId: 'name' },
    reason: 'pointer',
  });
  assert.deepEqual(calls.selectOptions.at(-1), {
    extend: false,
    mode: 'row',
  });

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 60,
      clientY: 20,
      shiftKey: false,
    }),
  );
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-0', columnId: 'name' },
    reason: 'pointer',
  });
  assert.deepEqual(calls.selectOptions.at(-1), {
    extend: false,
    mode: 'column',
  });

  grid.focus();
  const rowShortcut = fakeEvent('keydown', {
    key: ' ',
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(rowShortcut);
  assert.equal(rowShortcut.defaultPrevented, true);
  assert.deepEqual(calls.selectOptions.at(-1), {
    extend: false,
    mode: 'row',
  });

  const columnShortcut = fakeEvent('keydown', {
    key: 'Spacebar',
    shiftKey: false,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(columnShortcut);
  assert.equal(columnShortcut.defaultPrevented, true);
  assert.deepEqual(calls.selectOptions.at(-1), {
    extend: false,
    mode: 'column',
  });
  renderer.destroy();
});

test('column-header and row-number context menus dispatch their own operations', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(snapshot, indexes, projection, createColumns(), { occurrenceId: 'row-0', columnId: 'name' }, Object.freeze({ status: 'focused', draft: null })),
    {
      ...createCallbacks(calls),
      deleteSubtree() { calls.deleteSubtree.push(undefined); },
      insertSelection(mode) { calls.insertSelection.push(mode); },
      moveSelection(direction) { calls.moveSelection.push(direction); },
      setExpansionAll(expanded) { calls.setExpansionAll.push(expanded); },
      sortColumn(columnId, direction) { calls.sortColumn.push({ columnId, direction }); },
      clearViewQuery() { calls.clearViewQuery.push(undefined); },
    },
    { instanceId: 'renderer-context-menu' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  const columnEvent = fakeEvent('contextmenu', { clientX: 60, clientY: 20 });
  grid.dispatchEvent(columnEvent);
  assert.equal(columnEvent.defaultPrevented, true);
  const menu = container.querySelector('[data-bom-context-menu]');
  assert.ok(menu);
  assert.equal(menu.hidden, false);
  assert.equal(
    menu.querySelector('[data-bom-context-command="insert-before"]').textContent,
    '在左侧插入列',
  );
  assert.equal(
    menu.querySelector('[data-bom-context-command="delete"]').textContent,
    '删除列',
  );
  assert.equal(
    menu.querySelector('[data-bom-context-command="sort-asc"]').textContent,
    '升序排序',
  );
  menu.querySelector('[data-bom-context-command="insert-after"]').dispatchEvent(fakeEvent('click'));
  assert.deepEqual(calls.insertColumn.at(-1), { referenceColumnId: 'name', position: 'after', count: 1, reason: 'pointer' });
  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 60, clientY: 20 }));
  menu.querySelector('[data-bom-context-command="sort-asc"]').dispatchEvent(fakeEvent('click'));
  assert.deepEqual(calls.sortColumn.at(-1), { columnId: 'name', direction: 'asc' });

  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 60, clientY: 20 }));
  menu.querySelector('[data-bom-context-command="clear-content"]').dispatchEvent(fakeEvent('click'));
  assert.deepEqual(calls.selectOptions.at(-1), { extend: false, mode: 'column' });
  assert.equal(calls.clearSelection.length, 1);

  const rowEvent = fakeEvent('contextmenu', { clientX: 20, clientY: 50 });
  grid.dispatchEvent(rowEvent);
  assert.equal(rowEvent.defaultPrevented, true);
  assert.deepEqual(calls.selectOptions.at(-1), { extend: false });
  assert.equal(
    menu.querySelector('[data-bom-context-command="insert-sibling"]').textContent,
    '插入同级行',
  );
  assert.equal(
    menu.querySelector('[data-bom-context-command="move-up"]').textContent,
    '上移',
  );
  assert.equal(
    menu.querySelector('[data-bom-context-command="expand-all"]').textContent,
    '全部展开',
  );
  assert.equal(
    menu.querySelector('[data-bom-context-command="clear-content"]').textContent,
    '清除内容',
  );
  menu.querySelector('[data-bom-context-command="delete"]').dispatchEvent(fakeEvent('click'));
  assert.equal(calls.deleteSubtree.length, 1);

  assert.equal(renderer.configurePresentation({ locale: 'en-US' }).ok, true);
  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 60, clientY: 20 }));
  assert.equal(
    menu.querySelector('[data-bom-context-command="insert-before"]').textContent,
    'Insert column before',
  );
  assert.equal(
    menu.querySelector('[data-bom-context-command="delete"]').textContent,
    'Delete column',
  );

  assert.equal(renderer.configurePresentation({
    labels: {
      contextMenu: {
        'column.delete': { 'zh-CN': '删除所选列' },
      },
    },
  }).ok, true);
  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 60, clientY: 20 }));
  assert.equal(
    menu.querySelector('[data-bom-context-command="delete"]').textContent,
    '删除所选列',
  );
  assert.equal(renderer.configurePresentation({ locale: 'zh-CN' }).ok, true);
  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 60, clientY: 20 }));
  assert.equal(
    menu.querySelector('[data-bom-context-command="insert-before"]').textContent,
    '在左侧插入列',
  );
  renderer.destroy();
});

test('hierarchical column headers merge contiguous groups and expose aria-colspan', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = createColumns().map((column, index) => Object.freeze({
    ...column,
    headerGroup: Object.freeze(
      index === 0
        ? ['Identity', 'Name']
        : index < 4
          ? ['Measures', 'Quantity']
          : ['Other', 'Quantity'],
    ),
  }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      Object.freeze(columns),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-merged-headers' },
  );
  window.flushAnimationFrames();

  const semantics = container.querySelector('[data-bom-semantic-window]');
  assert.ok(semantics);
  const grouped = semantics.querySelectorAll('[aria-colspan]');
  assert.ok(grouped.length >= 2);
  const measures = grouped.find((element) => element.textContent === 'Measures');
  assert.ok(measures);
  assert.equal(measures.getAttribute('aria-colspan'), '3');
  assert.equal(measures.getAttribute('aria-colindex'), '3');
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  assert.equal(grid.getAttribute('aria-rowcount'), '7');
  const rows = semantics.querySelectorAll('[role="row"]');
  assert.equal(rows[0]?.getAttribute('aria-rowindex'), '1');
  assert.equal(rows[2]?.getAttribute('aria-rowindex'), '3');
  assert.equal(rows[3]?.getAttribute('aria-rowindex'), '4');
  renderer.destroy();
});

test('cell context menu exposes a trusted Clipboard API paste entry', async () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  window.navigator = {
    clipboard: {
      async readText() {
        return 'context paste';
      },
    },
  };
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-context-paste' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  const context = fakeEvent('contextmenu', { clientX: 60, clientY: 50 });
  grid.dispatchEvent(context);
  assert.equal(context.defaultPrevented, true);
  const menu = container.querySelector('[data-bom-context-menu]');
  assert.ok(menu);
  const paste = menu.querySelector('[data-bom-context-command="paste"]');
  assert.ok(paste);
  paste.dispatchEvent(fakeEvent('click'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.paste, [{ text: 'context paste' }]);
  renderer.destroy();
});

test('axis selections do not delegate fill-down', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const active = Object.freeze({ occurrenceId: 'row-3', columnId: 'name' });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({
        anchor: { occurrenceId: 'row-0', columnId: 'name' },
        focus: { occurrenceId: 'row-3', columnId: 'name' },
      }),
      'column',
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-axis-fill-down' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const fill = fakeEvent('keydown', {
    key: 'd',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, false);
  assert.equal(calls.fillDown.length, 0);
  renderer.destroy();
});

test('history shortcuts stay focused, isolate IME and Portal input, and report rejected callbacks', async () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const active = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const calls = emptyCalls();
  const callbacks = createCallbacks(calls);
  const diagnostics = [];
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    callbacks,
    {
      instanceId: 'renderer-history-shortcuts',
      diagnosticSink(diagnostic) {
        diagnostics.push(diagnostic);
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  const unfocusedUndo = fakeEvent('keydown', {
    key: 'z',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(unfocusedUndo);
  assert.equal(unfocusedUndo.defaultPrevented, false);
  assert.equal(calls.undo.length, 0);

  grid.focus();
  for (const event of [
    fakeEvent('keydown', {
      key: 'z',
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
    }),
    fakeEvent('keydown', {
      key: 'Z',
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      isComposing: false,
      repeat: false,
    }),
  ]) {
    grid.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  assert.equal(calls.undo.length, 2);

  for (const event of [
    fakeEvent('keydown', {
      key: 'y',
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
    }),
    fakeEvent('keydown', {
      key: 'Z',
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
      isComposing: false,
      repeat: false,
    }),
  ]) {
    grid.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  assert.equal(calls.redo.length, 2);

  for (const properties of [
    { key: 'z', repeat: true },
    { key: 'z', isComposing: true },
    { key: 'z', keyCode: 229 },
    { key: 'z', getModifierState: (name) => name === 'AltGraph' },
    { key: 'y', shiftKey: true },
  ]) {
    const event = fakeEvent('keydown', {
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
      ...properties,
    });
    grid.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(calls.undo.length, 2);
  assert.equal(calls.redo.length, 2);

  delete callbacks.undo;
  const unavailableUndo = fakeEvent('keydown', {
    key: 'z',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(unavailableUndo);
  assert.equal(unavailableUndo.defaultPrevented, false);
  assert.equal(calls.undo.length, 2);

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({
        status: 'editing',
        draft: Object.freeze({
          address: active,
          originalValue: 'Part 0',
          value: 'Part 0',
        }),
      }),
    ),
  );
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.focus();
  const portalRedo = fakeEvent('keydown', {
    key: 'y',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  portal.dispatchEvent(portalRedo);
  assert.equal(portalRedo.defaultPrevented, false);
  assert.equal(calls.redo.length, 2);

  grid.focus();
  callbacks.redo = () => Promise.reject(new Error('redo callback rejected'));
  const rejectedRedo = fakeEvent('keydown', {
    key: 'y',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(rejectedRedo);
  assert.equal(rejectedRedo.defaultPrevented, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'BOM_RENDERER_CALLBACK_FAILED');
  assert.equal(diagnostics[0].callback, 'redo');
  renderer.destroy();
});

test('bare Delete or Backspace clears a focused grid only through its optional callback', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const active = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const calls = emptyCalls();
  const callbacks = createCallbacks(calls);
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    callbacks,
    { instanceId: 'renderer-clear-selection' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  for (const key of ['Delete', 'Backspace']) {
    const clear = fakeEvent('keydown', {
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
    });
    grid.dispatchEvent(clear);
    assert.equal(clear.defaultPrevented, true);
  }
  assert.equal(calls.clearSelection.length, 2);

  for (const properties of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
  ]) {
    const event = fakeEvent('keydown', {
      key: 'Delete',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
      ...properties,
    });
    grid.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(calls.clearSelection.length, 2);

  delete callbacks.clearSelection;
  const unavailable = fakeEvent('keydown', {
    key: 'Delete',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(unavailable);
  assert.equal(unavailable.defaultPrevented, false);
  assert.equal(calls.clearSelection.length, 2);

  callbacks.clearSelection = () => {
    calls.clearSelection.push(undefined);
  };
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({
        status: 'editing',
        draft: Object.freeze({
          address: active,
          originalValue: 'Part 0',
          value: 'Part 0',
        }),
      }),
    ),
  );
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.focus();
  const portalDelete = fakeEvent('keydown', {
    key: 'Delete',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  portal.dispatchEvent(portalDelete);
  assert.equal(portalDelete.defaultPrevented, false);
  const portalBackspace = fakeEvent('keydown', {
    key: 'Backspace',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  portal.dispatchEvent(portalBackspace);
  assert.equal(portalBackspace.defaultPrevented, false);
  assert.equal(calls.clearSelection.length, 2);
  renderer.destroy();
});

test('Ctrl or Command+D fills down a focused grid only through its optional callback', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const active = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const calls = emptyCalls();
  const callbacks = createCallbacks(calls);
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    callbacks,
    { instanceId: 'renderer-fill-down' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  for (const event of [
    fakeEvent('keydown', {
      key: 'd',
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
    }),
    fakeEvent('keydown', {
      key: 'D',
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      isComposing: false,
      repeat: false,
    }),
  ]) {
    grid.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  assert.equal(calls.fillDown.length, 2);

  for (const properties of [
    { shiftKey: true },
    { altKey: true },
    { getModifierState: (name) => name === 'AltGraph' },
    { repeat: true },
    { isComposing: true },
    { keyCode: 229 },
  ]) {
    const event = fakeEvent('keydown', {
      key: 'd',
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
      ...properties,
    });
    grid.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(calls.fillDown.length, 2);

  delete callbacks.fillDown;
  const unavailable = fakeEvent('keydown', {
    key: 'd',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(unavailable);
  assert.equal(unavailable.defaultPrevented, false);
  assert.equal(calls.fillDown.length, 2);

  callbacks.fillDown = () => {
    calls.fillDown.push(undefined);
  };
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      active,
      Object.freeze({
        status: 'editing',
        draft: Object.freeze({
          address: active,
          originalValue: 'Part 0',
          value: 'Part 0',
        }),
      }),
    ),
  );
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.focus();
  const portalFillDown = fakeEvent('keydown', {
    key: 'd',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  portal.dispatchEvent(portalFillDown);
  assert.equal(portalFillDown.defaultPrevented, false);
  assert.equal(calls.fillDown.length, 2);
  renderer.destroy();
});

test('a rectangular selection redraws only the interaction layer', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const anchor = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const focus = Object.freeze({ occurrenceId: 'row-1', columnId: 'quantity-0' });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      anchor,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(emptyCalls()),
    { instanceId: 'renderer-range-invalidation' },
  );
  window.flushAnimationFrames();
  const clears = observeCanvasClears(container);

  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      focus,
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({ anchor, focus }),
    ),
  );
  window.flushAnimationFrames();

  assert.deepEqual(clears, {
    background: 0,
    content: 0,
    interaction: 1,
  });
  renderer.destroy();
});

test('fill-handle hover advertises a fill cursor and drag keeps the source selection until release', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const anchor = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const focus = Object.freeze({ occurrenceId: 'row-1', columnId: 'name' });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      focus,
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({ anchor, focus }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-fill-preview' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('pointermove', {
    clientX: 185,
    clientY: 87,
    pointerId: 8,
    pointerType: 'mouse',
  }));
  assert.equal(grid.style.cursor, 'crosshair');
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    clientX: 185,
    clientY: 87,
    pointerId: 8,
    pointerType: 'mouse',
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    clientX: 320,
    clientY: 116,
    pointerId: 8,
    pointerType: 'mouse',
  }));
  window.flushAnimationFrames();
  assert.equal(calls.select.length, 0);
  assert.equal(calls.fillDown.length, 0);

  grid.dispatchEvent(fakeEvent('pointerup', {
    clientX: 320,
    clientY: 116,
    pointerId: 8,
    pointerType: 'mouse',
  }));
  assert.equal(calls.select.length, 1);
  assert.deepEqual(calls.select[0].address, {
    occurrenceId: 'row-2',
    columnId: 'name',
  });
  assert.equal(calls.fillDown.length, 1);
  assert.equal(grid.style.cursor, '');
  renderer.destroy();
});

test('fill-handle drag back into the source clears the pending target', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(4);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const anchor = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const focus = Object.freeze({ occurrenceId: 'row-1', columnId: 'name' });
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      focus,
      Object.freeze({ status: 'focused', draft: null }),
      Object.freeze({ anchor, focus }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-fill-backtrack' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 61,
    pointerType: 'mouse',
    clientX: 185,
    clientY: 87,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 61,
    pointerType: 'mouse',
    clientX: 320,
    clientY: 116,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 61,
    pointerType: 'mouse',
    clientX: 320,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 61,
    pointerType: 'mouse',
    clientX: 320,
    clientY: 50,
  }));
  assert.equal(calls.fillDown.length, 0);
  assert.equal(calls.select.length, 0);
  assert.equal(grid.hasPointerCapture(61), false);
  renderer.destroy();
});

test('Ctrl or Command+C keeps the trusted native copy path even when Async Clipboard exists', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const calls = emptyCalls();
  calls.copyPayload = Object.freeze({ id: 'copy-async', text: 'Part 0\t0' });
  const writes = [];
  window.navigator = {
    clipboard: {
      writeText(text) {
        writes.push(text);
        return Promise.resolve();
      },
    },
  };
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-async-copy' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const commandCopy = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    isTrusted: true,
  });
  grid.dispatchEvent(commandCopy);
  assert.equal(commandCopy.defaultPrevented, false);
  assert.deepEqual(writes, []);
  assert.equal(calls.copy.length, 0);
  assert.equal(calls.clipboardWrite.length, 0);
  renderer.destroy();

  const fallback = emptyCalls();
  fallback.copyPayload = Object.freeze({
    id: 'copy-fallback',
    text: 'Part 1\t1',
    html: '<table><tbody><tr><td>Part 1</td><td>1</td></tr></tbody></table>',
    internal: '{"format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["Part 1","1"]]}',
  });
  const fallbackRenderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-1', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(fallback),
    { instanceId: 'renderer-copy-fallback' },
  );
  window.flushAnimationFrames();
  const fallbackGrid = container.querySelector('[role="treegrid"]');
  assert.ok(fallbackGrid);
  fallbackGrid.focus();
  const data = new Map();
  const copyEvent = fakeEvent('copy', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        data.set(type, text);
      },
    },
  });
  fallbackGrid.dispatchEvent(copyEvent);
  assert.equal(copyEvent.defaultPrevented, true);
  assert.deepEqual([...data], [
    ['text/plain', 'Part 1\t1'],
    ['text/html', '<table><tbody><tr><td>Part 1</td><td>1</td></tr></tbody></table>'],
    ['application/x-bom-editor-clipboard+json', '{"format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["Part 1","1"]]}'],
  ]);
  assert.deepEqual(fallback.clipboardWrite, [
    { id: 'copy-fallback', method: 'event-fallback', outcome: 'written' },
  ]);
  const syntheticData = new Map();
  const syntheticCopy = fakeEvent('copy', {
    isTrusted: false,
    clipboardData: {
      setData(type, text) {
        syntheticData.set(type, text);
      },
    },
  });
  fallbackGrid.dispatchEvent(syntheticCopy);
  assert.equal(syntheticCopy.defaultPrevented, true);
  assert.deepEqual([...syntheticData], []);
  assert.equal(fallback.copy.length, 1);
  assert.equal(fallback.clipboardWrite.length, 1);
  fallbackRenderer.destroy();
});

test('Async Clipboard writes the authorized payload as multiple MIME types', async () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const calls = emptyCalls();
  calls.copyPayload = Object.freeze({
    id: 'copy-rich',
    text: 'Part 0\t0',
    html: '<table><tbody><tr><td>Part 0</td><td>0</td></tr></tbody></table>',
    internal: '{"format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["Part 0","0"]]}',
  });
  const writes = [];
  window.Blob = globalThis.Blob;
  window.ClipboardItem = class {
    constructor(items) {
      this.items = items;
    }
  };
  window.navigator = {
    clipboard: {
      write(items) {
        writes.push(items);
        return Promise.resolve();
      },
    },
  };
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'renderer-rich-copy',
      shortcuts: {
        bindings: [
          { id: 'grid.copy', keys: 'Primary+Shift+C', command: 'copy' },
        ],
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const copy = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    isComposing: false,
  });
  grid.dispatchEvent(copy);
  assert.equal(copy.defaultPrevented, true);
  await Promise.resolve();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].length, 1);
  assert.deepEqual(Object.keys(writes[0][0].items), [
    'text/plain',
    'text/html',
    'application/x-bom-editor-clipboard+json',
  ]);
  assert.equal(await writes[0][0].items['text/plain'].text(), 'Part 0\t0');
  assert.equal(
    await writes[0][0].items['text/html'].text(),
    '<table><tbody><tr><td>Part 0</td><td>0</td></tr></tbody></table>',
  );
  assert.equal(
    await writes[0][0].items['application/x-bom-editor-clipboard+json'].text(),
    '{"format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["Part 0","0"]]}',
  );
  assert.deepEqual(calls.clipboardWrite, [
    { id: 'copy-rich', method: 'async', outcome: 'written' },
  ]);
  renderer.destroy();
});

test('Primary+Shift+B and Primary+Shift+K use independent async branch clipboard callbacks', async () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createTreeFixture();
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const calls = emptyCalls();
  calls.copyBranchPayload = Object.freeze({
    id: 'branch-copy',
    text: '0\tmaterial\tM',
    html: '<table><tbody><tr><td>0</td></tr></tbody></table>',
    internal: '{"format":"bom-editor/clipboard","version":1,"kind":"branch-tree","roots":["root"],"includeDescendants":true,"nodes":[]}',
    kind: 'branch-tree',
  });
  calls.cutBranchPayload = Object.freeze({
    ...calls.copyBranchPayload,
    id: 'branch-cut',
  });
  window.Blob = globalThis.Blob;
  window.ClipboardItem = class {
    constructor(items) {
      this.items = items;
    }
  };
  const writes = [];
  window.navigator = {
    clipboard: {
      write(items) {
        writes.push(items);
        return Promise.resolve();
      },
    },
  };
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'root', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-branch-shortcuts' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const copy = fakeEvent('keydown', {
    key: 'b', ctrlKey: true, metaKey: false, shiftKey: true,
    altKey: false, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(copy);
  assert.equal(copy.defaultPrevented, true);
  assert.equal(calls.copyBranch.length, 1);
  const cut = fakeEvent('keydown', {
    key: 'k', ctrlKey: true, metaKey: false, shiftKey: true,
    altKey: false, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(cut);
  assert.equal(cut.defaultPrevented, true);
  assert.equal(calls.cutBranch.length, 1);
  await Promise.resolve();
  assert.equal(writes.length, 2);
  assert.deepEqual(calls.clipboardWrite, [
    { id: 'branch-copy', method: 'async', outcome: 'written' },
    { id: 'branch-cut', method: 'async', outcome: 'written' },
  ]);
  renderer.destroy();
});

test('Ctrl or Command+X keeps the trusted native cut path even when Async Clipboard exists', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(
    createVisibleProjection(snapshot, { indexes, rowHeight: 28 }),
  );
  const columns = createColumns();
  const calls = emptyCalls();
  calls.cutPayload = Object.freeze({ id: 'cut-async', text: 'Part 0\t0' });
  const writes = [];
  window.navigator = {
    clipboard: {
      writeText(text) {
        writes.push(text);
        return Promise.resolve();
      },
    },
  };
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-async-cut' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const commandCut = fakeEvent('keydown', {
    key: 'x',
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(commandCut);
  assert.equal(commandCut.defaultPrevented, false);
  assert.deepEqual(writes, []);
  assert.equal(calls.copy.length, 0);
  assert.equal(calls.cut.length, 0);

  const data = new Map();
  const cutEvent = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        data.set(type, text);
      },
    },
  });
  grid.dispatchEvent(cutEvent);
  assert.equal(cutEvent.defaultPrevented, true);
  assert.deepEqual([...data], [['text/plain', 'Part 0\t0']]);
  assert.equal(calls.copy.length, 0);
  assert.equal(calls.cut.length, 1);
  assert.deepEqual(calls.clipboardWrite, [
    { id: 'cut-async', method: 'event-fallback', outcome: 'written' },
  ]);
  renderer.destroy();
});

test('cut reports failed native Clipboard writes without a false success', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const fallback = emptyCalls();
  fallback.cutPayload = Object.freeze({
    id: 'cut-fallback-failed',
    text: 'Part 0\t0',
  });
  const fallbackRenderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(fallback),
    { instanceId: 'renderer-native-cut-failed' },
  );
  window.flushAnimationFrames();
  const fallbackGrid = container.querySelector('[role="treegrid"]');
  assert.ok(fallbackGrid);
  fallbackGrid.focus();
  const nativeCut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData() {
        throw new Error('clipboard unavailable');
      },
    },
  });
  fallbackGrid.dispatchEvent(nativeCut);
  assert.equal(nativeCut.defaultPrevented, true);
  assert.equal(fallback.cut.length, 1);
  assert.deepEqual(fallback.clipboardWrite, [
    { id: 'cut-fallback-failed', method: 'event-fallback', outcome: 'failed' },
  ]);
  fallbackRenderer.destroy();
});

test('synthetic cut is fail-closed before requesting an editor payload', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const calls = emptyCalls();
  calls.cutPayload = Object.freeze({ id: 'cut-synthetic', text: 'Part 0\t0' });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-synthetic-cut' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const written = new Map();
  const syntheticCut = fakeEvent('cut', {
    isTrusted: false,
    clipboardData: {
      setData(type, text) {
        written.set(type, text);
      },
    },
  });
  grid.dispatchEvent(syntheticCut);
  assert.equal(syntheticCut.defaultPrevented, true);
  assert.deepEqual([...written], []);
  assert.equal(calls.cut.length, 0);
  assert.deepEqual(calls.clipboardWrite, []);
  renderer.destroy();
});

test('an older renderer callback object without cut safely rejects native cut', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const calls = emptyCalls();
  const callbacks = createCallbacks(calls);
  delete callbacks.cut;
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    callbacks,
    { instanceId: 'renderer-optional-cut' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const written = new Map();
  const cut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        written.set(type, text);
      },
    },
  });
  grid.dispatchEvent(cut);
  assert.equal(cut.defaultPrevented, true);
  assert.deepEqual([...written], []);
  assert.equal(calls.cut.length, 0);
  assert.deepEqual(calls.clipboardWrite, []);
  renderer.destroy();
});

test('native cut stays scoped to the focused treegrid and portal copy/cut are blocked', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const columns = createColumns();
  const address = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const calls = emptyCalls();
  calls.cutPayload = Object.freeze({ id: 'cut-focus', text: 'Part 0\t0' });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      address,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-cut-focus-scope' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  const inactiveData = new Map();
  const inactiveCut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        inactiveData.set(type, text);
      },
    },
  });
  grid.dispatchEvent(inactiveCut);
  assert.equal(inactiveCut.defaultPrevented, false);
  assert.deepEqual([...inactiveData], []);
  assert.equal(calls.cut.length, 0);

  const draft = Object.freeze({
    address,
    originalValue: 'Part 0',
    value: 'Part 0',
    dirty: false,
  });
  grid.focus();
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      address,
      Object.freeze({ status: 'editing', draft }),
    ),
  );
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  assert.equal(portal.ownerDocument.activeElement, portal);
  portal.value = 'uncommitted draft';
  const portalCopyData = new Map();
  const portalCopy = fakeEvent('copy', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        portalCopyData.set(type, text);
      },
    },
  });
  portal.dispatchEvent(portalCopy);
  assert.equal(portalCopy.defaultPrevented, true);
  assert.deepEqual([...portalCopyData], []);
  assert.equal(portal.value, 'uncommitted draft');
  assert.equal(calls.copy.length, 0);

  const portalCutData = new Map();
  const portalCut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        portalCutData.set(type, text);
      },
    },
  });
  portal.dispatchEvent(portalCut);
  assert.equal(portalCut.defaultPrevented, true);
  assert.deepEqual([...portalCutData], []);
  assert.equal(portal.value, 'uncommitted draft');
  assert.equal(calls.cut.length, 0);
  assert.deepEqual(calls.clipboardWrite, []);
  renderer.destroy();
});

test('native paste forwards declared clipboard representations only from the focused treegrid', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const columns = createColumns();
  const calls = emptyCalls();
  const address = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      address,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-native-paste' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const requestedFormats = [];
  const successfulPaste = fakeEvent('paste', {
    clipboardData: {
      types: ['text/plain'],
      getData(type) {
        requestedFormats.push(type);
        return 'Part 0\t1';
      },
    },
  });
  grid.dispatchEvent(successfulPaste);
  assert.equal(successfulPaste.defaultPrevented, true);
  assert.deepEqual(requestedFormats, ['text/plain']);
  const expectedPastes = [{ text: 'Part 0\t1' }];
  assert.deepEqual(calls.paste, expectedPastes);

  const richPaste = fakeEvent('paste', {
    clipboardData: {
      types: [
        'application/x-bom-editor-clipboard+json',
        'text/html',
        'text/plain',
      ],
      getData(type) {
        return {
          'application/x-bom-editor-clipboard+json': '{"version":1}',
          'text/html': '<table><tr><td>Part 0</td></tr></table>',
          'text/plain': 'Part 0',
        }[type];
      },
    },
  });
  grid.dispatchEvent(richPaste);
  assert.equal(richPaste.defaultPrevented, true);
  expectedPastes.push({
    internal: '{"version":1}',
    html: '<table><tr><td>Part 0</td></tr></table>',
    text: 'Part 0',
  });
  assert.deepEqual(calls.paste, expectedPastes);

  const missingClipboard = fakeEvent('paste', { clipboardData: null });
  grid.dispatchEvent(missingClipboard);
  assert.equal(missingClipboard.defaultPrevented, true);
  const missingReader = fakeEvent('paste', { clipboardData: {} });
  grid.dispatchEvent(missingReader);
  assert.equal(missingReader.defaultPrevented, true);
  const unreadableClipboard = fakeEvent('paste', {
    clipboardData: {
      getData() {
        throw new Error('clipboard unavailable');
      },
    },
  });
  grid.dispatchEvent(unreadableClipboard);
  assert.equal(unreadableClipboard.defaultPrevented, true);
  assert.deepEqual(calls.paste, expectedPastes);

  const draft = Object.freeze({
    address,
    originalValue: 'Part 0',
    value: 'Part 0',
    dirty: false,
  });
  renderer.update(
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      address,
      Object.freeze({ status: 'editing', draft }),
    ),
  );
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  assert.equal(portal.hidden, false);
  assert.equal(portal.ownerDocument.activeElement, portal);
  const portalPaste = fakeEvent('paste', {
    clipboardData: {
      getData() {
        return 'should stay in the portal';
      },
    },
  });
  grid.dispatchEvent(portalPaste);
  assert.equal(portalPaste.defaultPrevented, false);
  assert.deepEqual(calls.paste, expectedPastes);

  renderer.destroy();
  const destroyedPaste = fakeEvent('paste', {
    clipboardData: {
      getData() {
        return 'ignored after destroy';
      },
    },
  });
  grid.dispatchEvent(destroyedPaste);
  assert.equal(destroyedPaste.defaultPrevented, false);
  assert.deepEqual(calls.paste, expectedPastes);
});

test('destroy prevents a late async Clipboard completion from reaching callbacks', async () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const calls = emptyCalls();
  calls.copyPayload = Object.freeze({ id: 'copy-late', text: 'Part 0\t0' });
  let resolveWrite;
  window.navigator = {
    clipboard: {
      writeText() {
        return new Promise((resolve) => {
          resolveWrite = resolve;
        });
      },
    },
  };
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'renderer-copy-late-destroy',
      shortcuts: {
        bindings: [
          { id: 'grid.copy', keys: 'Primary+Shift+C', command: 'copy' },
        ],
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const copy = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  });
  grid.dispatchEvent(copy);
  assert.equal(copy.defaultPrevented, true);
  assert.equal(calls.copy.length, 1);

  renderer.destroy();
  resolveWrite();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls.clipboardWrite, []);
});

test('destroy leaves a later native cut event untouched', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const calls = emptyCalls();
  calls.cutPayload = Object.freeze({ id: 'cut-late', text: 'Part 0\t0' });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'renderer-cut-late-destroy' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  renderer.destroy();
  const cut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData() {},
    },
  });
  grid.dispatchEvent(cut);
  assert.equal(cut.defaultPrevented, false);
  assert.equal(calls.cut.length, 0);
  assert.deepEqual(calls.clipboardWrite, []);
});

test('rejects controlled selections that are structurally invalid or hidden by the projection', () => {
  const { container } = createFakeDom();
  const snapshot = createTreeFixture();
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const columns = createColumns();
  const root = Object.freeze({ occurrenceId: 'root', columnId: 'name' });
  const child = Object.freeze({ occurrenceId: 'child', columnId: 'name' });
  const callbacks = createCallbacks(emptyCalls());
  const focused = Object.freeze({ status: 'focused', draft: null });

  const missingRange = Object.freeze({
    ...viewModel(snapshot, indexes, projection, columns, root, focused),
    selection: Object.freeze({ activeCell: root }),
  });
  assert.throws(
    () =>
      mountBomCanvasRenderer(
        container,
        missingRange,
        callbacks,
        { instanceId: 'renderer-missing-range' },
      ),
    /BOM_RENDERER_INVALID_SELECTION/,
  );
  assert.throws(
    () =>
      mountBomCanvasRenderer(
        container,
        viewModel(
          snapshot,
          indexes,
          projection,
          columns,
          null,
          focused,
          Object.freeze({ anchor: root, focus: root }),
        ),
        callbacks,
        { instanceId: 'renderer-invalid-empty-range' },
      ),
    /BOM_RENDERER_INVALID_SELECTION/,
  );
  assert.throws(
    () =>
      mountBomCanvasRenderer(
        container,
        viewModel(
          snapshot,
          indexes,
          projection,
          columns,
          root,
          focused,
          Object.freeze({ anchor: root, focus: root }),
        ),
        callbacks,
        { instanceId: 'renderer-singleton-range' },
      ),
    /BOM_RENDERER_INVALID_SELECTION/,
  );
  assert.throws(
    () =>
      mountBomCanvasRenderer(
        container,
        viewModel(
          snapshot,
          indexes,
          projection,
          columns,
          root,
          focused,
          Object.freeze({ anchor: root, focus: child }),
        ),
        callbacks,
        { instanceId: 'renderer-invalid-range-focus' },
      ),
    /BOM_RENDERER_INVALID_SELECTION/,
  );
  assert.throws(
    () =>
      mountBomCanvasRenderer(
        container,
        viewModel(
          snapshot,
          indexes,
          projection,
          columns,
          child,
          focused,
        ),
        callbacks,
        { instanceId: 'renderer-hidden-selection' },
      ),
    /BOM_RENDERER_INVALID_SELECTION/,
  );
  assert.deepEqual(container.children, EMPTY_CHILDREN);
});

test('rejects mismatched view revisions before touching the container', () => {
  const { container } = createFakeDom();
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes }));
  const invalid = {
    ...viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      null,
      Object.freeze({ status: 'idle', draft: null }),
    ),
    revision: 'other',
  };
  assert.throws(
    () =>
      mountBomCanvasRenderer(
        container,
        invalid,
        createCallbacks(emptyCalls()),
        { instanceId: 'invalid' },
      ),
    /BOM_RENDERER_REVISION_MISMATCH/,
  );
  assert.deepEqual(container.children, EMPTY_CHILDREN);
});

test('configured shortcut commands hot-reload without falling through to defaults', async () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(3);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const invocations = [];
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'shortcut-hot-reload',
      shortcuts: {
        bindings: [
          { id: 'custom.command', keys: 'Primary+D', command: 'custom:command', priority: 1 },
        ],
      },
      onShortcut(invocation) {
        invocations.push(invocation);
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const custom = fakeEvent('keydown', {
    key: 'd',
    keyCode: 68,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(custom);
  assert.equal(custom.defaultPrevented, true);
  assert.equal(invocations[0].command, 'custom:command');
  assert.equal(calls.fillDown.length, 0);

  const updated = renderer.configureShortcuts({
    bindings: [
      { id: 'grid.fill-down', keys: 'Primary+Shift+D', command: 'fill-down' },
    ],
  });
  assert.equal(updated.ok, true);
  const fill = fakeEvent('keydown', {
    key: 'd',
    keyCode: 68,
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  assert.equal(calls.fillDown.length, 1);
  renderer.destroy();
});

test('configured clipboard bindings fail closed when native fallback cannot be synthesized', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'shortcut-clipboard-fail-closed',
      shortcuts: {
        bindings: [
          { id: 'grid.copy', keys: 'Primary+Shift+C', command: 'copy' },
          { id: 'grid.cut', keys: 'Primary+Shift+X', command: 'cut' },
        ],
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const copy = fakeEvent('keydown', {
    key: 'c', ctrlKey: true, metaKey: false, shiftKey: true,
    altKey: false, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(copy);
  assert.equal(copy.defaultPrevented, true);
  assert.equal(calls.copy.length, 0);
  const cut = fakeEvent('keydown', {
    key: 'x', ctrlKey: true, metaKey: false, shiftKey: true,
    altKey: false, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(cut);
  assert.equal(cut.defaultPrevented, true);
  assert.equal(calls.cut.length, 0);
  renderer.destroy();
});

test('column boundaries resize with the pointer and the focused keyboard path', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'column-resize' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 71,
    pointerType: 'mouse',
    clientX: 188,
    clientY: 10,
  }));
  assert.deepEqual(calls.beginColumnResize.at(-1), {
    columnId: 'name',
    width: 140,
  });
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 71,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  assert.deepEqual(calls.resizeColumn.at(-1), {
    columnId: 'name',
    width: 172,
    reason: 'pointer',
  });
  assert.equal(calls.viewChange.at(-1).reason, 'columns');
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 71,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  assert.deepEqual(calls.endColumnResize.at(-1), {
    columnId: 'name',
    width: 172,
  });
  const resizeAnnouncement = container
    .querySelector('[data-bom-live-region="polite"]')
    .querySelector('[data-bom-live-region-message="polite"]');
  assert.ok(resizeAnnouncement);
  assert.equal(resizeAnnouncement.textContent, '列宽已调整。');

  const keyboard = fakeEvent('keydown', {
    key: 'ArrowRight',
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(keyboard);
  assert.equal(keyboard.defaultPrevented, true);
  assert.deepEqual(calls.resizeColumn.at(-1), {
    columnId: 'name',
    width: 148,
    reason: 'keyboard',
  });
  renderer.destroy();
});

test('double-clicking a column boundary auto-sizes from the rendered values', () => {
  const { container, window } = createFakeDom(640, 280);
  const base = createFlatFixture(2);
  const snapshot = Object.freeze({
    ...base,
    nodes: Object.freeze(base.nodes.map((node, index) => index === 1
      ? Object.freeze({
          ...node,
          fields: Object.freeze({
            ...node.fields,
            name: 'A deliberately long part name for auto sizing',
          }),
        })
      : node)),
  });
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'column-auto-size-pointer' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('dblclick', {
    clientX: 188,
    clientY: 10,
  }));
  assert.deepEqual(calls.beginColumnResize.at(-1), {
    columnId: 'name',
    width: 140,
  });
  const resize = calls.resizeColumn.at(-1);
  assert.equal(resize.columnId, 'name');
  assert.equal(resize.reason, 'pointer');
  assert.ok(resize.width > 140);
  assert.deepEqual(calls.endColumnResize.at(-1), {
    columnId: 'name',
    width: resize.width,
  });
  renderer.destroy();
});

test('column context menu exposes a bounded auto-size command', () => {
  const { container, window } = createFakeDom(640, 280);
  const base = createFlatFixture(2);
  const snapshot = Object.freeze({
    ...base,
    nodes: Object.freeze(base.nodes.map((node, index) => index === 1
      ? Object.freeze({
          ...node,
          fields: Object.freeze({
            ...node.fields,
            name: 'Another deliberately long value for the context menu',
          }),
        })
      : node)),
  });
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'column-auto-size-menu' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('contextmenu', {
    clientX: 100,
    clientY: 10,
  }));
  const command = container.querySelector('[data-bom-context-command="auto-size"]');
  assert.ok(command);
  command.dispatchEvent(fakeEvent('click'));
  assert.equal(calls.resizeColumn.at(-1)?.columnId, 'name');
  assert.ok(calls.resizeColumn.at(-1)?.width > 140);
  renderer.destroy();
});

test('row context menu exposes controlled row-height operations and column reset', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(snapshot, indexes, projection, createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null })),
    createCallbacks(calls),
    { instanceId: 'row-height-menu' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 20, clientY: 50 }));
  const auto = container.querySelector('[data-bom-context-command="auto-row-height"]');
  assert.ok(auto);
  auto.dispatchEvent(fakeEvent('click'));
  assert.deepEqual(calls.setRowHeight.at(-1), {
    occurrenceId: 'row-0', rowHeight: 28, reason: 'pointer',
  });
  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 100, clientY: 10 }));
  const reset = container.querySelector('[data-bom-context-command="reset-width"]');
  assert.ok(reset);
  reset.dispatchEvent(fakeEvent('click'));
  assert.deepEqual(calls.resetColumnWidth.at(-1), { columnId: 'name', reason: 'pointer' });
  renderer.destroy();
});

test('column reset context command publishes only after the host changes width', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  let currentColumns = Object.freeze([
    Object.freeze({ ...createColumns()[0], width: 180 }),
  ]);
  let renderer;
  const callbacks = createCallbacks(calls);
  callbacks.resetColumnWidth = (columnId, reason) => {
    calls.resetColumnWidth.push({ columnId, reason });
    currentColumns = Object.freeze([
      Object.freeze({ ...currentColumns[0], width: 140 }),
    ]);
    renderer.update(
      viewModel(
        snapshot,
        indexes,
        projection,
        currentColumns,
        Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
        Object.freeze({ status: 'focused', draft: null }),
      ),
      { layoutChanged: true },
    );
  };
  renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      currentColumns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    callbacks,
    { instanceId: 'column-reset-view-event' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 100, clientY: 10 }));
  const reset = container.querySelector('[data-bom-context-command="reset-width"]');
  assert.ok(reset);
  reset.dispatchEvent(fakeEvent('click'));
  assert.equal(calls.viewChange.at(-1)?.reason, 'columns');
  const publishedCount = calls.viewChange.length;

  grid.dispatchEvent(fakeEvent('contextmenu', { clientX: 100, clientY: 10 }));
  const unchanged = container.querySelector('[data-bom-context-command="reset-width"]');
  assert.ok(unchanged);
  unchanged.dispatchEvent(fakeEvent('click'));
  assert.equal(calls.viewChange.length, publishedCount);
  renderer.destroy();
});

test('column headers reorder within their group and the keyboard path swaps adjacent columns', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'quantity-0' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'column-reorder',
      liveRegion: { politeMinIntervalMs: 0 },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 72,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 72,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 10,
  }));
  assert.equal(calls.reorderColumns.length, 0);
  assert.equal(calls.viewChange.length, 0);
  const targetAnnouncement = container
    .querySelector('[data-bom-live-region="polite"]')
    .querySelector('[data-bom-live-region-message="polite"]');
  assert.ok(targetAnnouncement);
  assert.equal(targetAnnouncement.textContent, '将移动到第 3 列。');
  assert.equal(targetAnnouncement.textContent.includes('quantity-0'), false);
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 72,
    pointerType: 'mouse',
    clientX: 360,
    clientY: 10,
  }));
  assert.equal(
    container
      .querySelector('[data-bom-live-region="polite"]')
      .querySelector('[data-bom-live-region-message="polite"]'),
    targetAnnouncement,
  );
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 72,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 10,
  }));
  assert.deepEqual(calls.reorderColumns.at(-1), {
    columnIds: [
      'name',
      'quantity-1',
      'quantity-0',
      ...Array.from({ length: 17 }, (_, index) => `quantity-${index + 2}`),
    ],
    reason: 'pointer',
  });
  assert.equal(calls.viewChange.at(-1).reason, 'columns');
  const reorderAnnouncement = container
    .querySelector('[data-bom-live-region="polite"]')
    .querySelector('[data-bom-live-region-message="polite"]');
  assert.ok(reorderAnnouncement);
  assert.equal(reorderAnnouncement.textContent, '列位置已更新。');
  const pointerReorders = calls.reorderColumns.length;
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 72,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 10,
  }));
  assert.equal(calls.reorderColumns.length, pointerReorders);

  const keyboard = fakeEvent('keydown', {
    key: 'ArrowRight',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(keyboard);
  assert.equal(keyboard.defaultPrevented, true);
  assert.deepEqual(calls.reorderColumns.at(-1), {
    columnIds: [
      'name',
      'quantity-1',
      'quantity-0',
      ...Array.from({ length: 17 }, (_, index) => `quantity-${index + 2}`),
    ],
    reason: 'keyboard',
  });
  renderer.destroy();
});

test('pointer column completion announcements skip canceled and failed operations', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const callbacks = createCallbacks(calls);
  callbacks.resizeColumn = (columnId, width, reason) => {
    calls.resizeColumn.push({ columnId, width, reason });
    throw new Error('resize rejected by host');
  };
  callbacks.reorderColumns = (columnIds, reason) => {
    calls.reorderColumns.push({ columnIds: [...columnIds], reason });
    throw new Error('reorder rejected by host');
  };
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'quantity-0' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    callbacks,
    {
      instanceId: 'column-completion-announcement-guards',
      liveRegion: { politeMinIntervalMs: 0 },
      labels: {
        liveRegion: { columnReorderTarget: '' },
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  const polite = container.querySelector('[data-bom-live-region="polite"]');
  assert.ok(grid);
  assert.ok(polite);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 74,
    pointerType: 'mouse',
    clientX: 188,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 74,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointercancel', { pointerId: 74 }));
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]'),
    null,
  );

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 75,
    pointerType: 'mouse',
    clientX: 188,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 75,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 75,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  assert.equal(calls.resizeColumn.length, 2);
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]'),
    null,
  );

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 76,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 76,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointercancel', { pointerId: 76 }));
  assert.equal(calls.reorderColumns.length, 0);
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]'),
    null,
  );

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 77,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 77,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 77,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 10,
  }));
  assert.equal(calls.reorderColumns.length, 1);
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]'),
    null,
  );
  renderer.destroy();
});

test('pointer column resize completion announcement skips a reverted width', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'column-resize-announcement-reverted',
      liveRegion: { politeMinIntervalMs: 0 },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  const polite = container.querySelector('[data-bom-live-region="polite"]');
  assert.ok(grid);
  assert.ok(polite);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 79,
    pointerType: 'mouse',
    clientX: 188,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 79,
    pointerType: 'mouse',
    clientX: 220,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 79,
    pointerType: 'mouse',
    clientX: 188,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 79,
    pointerType: 'mouse',
    clientX: 188,
    clientY: 10,
  }));
  assert.deepEqual(calls.resizeColumn.map(({ width }) => width), [172, 140]);
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]'),
    null,
  );
  renderer.destroy();
});

test('column reorder keeps the tree column and frozen groups stable, and ignores touch drags', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const columns = createColumns();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'column-reorder-guards' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const firstColumnKey = fakeEvent('keydown', {
    key: 'ArrowRight',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(firstColumnKey);
  assert.equal(firstColumnKey.defaultPrevented, false);
  assert.equal(calls.reorderColumns.length, 0);

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 73,
    pointerType: 'touch',
    clientX: 220,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 73,
    pointerType: 'touch',
    clientX: 350,
    clientY: 10,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 73,
    pointerType: 'touch',
    clientX: 350,
    clientY: 10,
  }));
  assert.equal(calls.reorderColumns.length, 0);
  renderer.destroy();
});

test('hidden columns leave the layout and ARIA count, while focused shortcuts request hide and show-all', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const columns = Object.freeze(
    createColumns().map((column) =>
      column.columnId === 'quantity-0'
        ? Object.freeze({ ...column, visible: false })
        : column,
    ),
  );
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'quantity-1' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'column-visibility' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  assert.equal(grid.getAttribute('aria-colcount'), '20');
  grid.focus();

  const hide = fakeEvent('keydown', {
    key: 'h',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(hide);
  assert.equal(hide.defaultPrevented, true);
  assert.deepEqual(calls.setColumnVisibility.at(-1), {
    columnIds: ['quantity-1'],
    visible: false,
    reason: 'keyboard',
  });
  assert.equal(calls.viewChange.at(-1).reason, 'columns');

  const showAll = fakeEvent('keydown', {
    key: 'h',
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: true,
    repeat: false,
    isComposing: false,
  });
  grid.dispatchEvent(showAll);
  assert.equal(showAll.defaultPrevented, true);
  assert.deepEqual(calls.setColumnVisibility.at(-1), {
    columnIds: ['quantity-0'],
    visible: true,
    reason: 'keyboard',
  });
  renderer.destroy();
});

test('Excel-compatible column shortcuts request insert, delete, hide, show-all, and freeze', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const calls = emptyCalls();
  const columns = Object.freeze(
    createColumns().map((column) =>
      column.columnId === 'quantity-0'
        ? Object.freeze({ ...column, visible: false })
        : column,
    ),
  );
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'quantity-1' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'column-excel-shortcuts' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const insert = fakeEvent('keydown', {
    key: '+', code: 'Equal', ctrlKey: true, metaKey: false, altKey: false,
    shiftKey: true, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(insert);
  assert.equal(insert.defaultPrevented, true);
  assert.deepEqual(calls.insertColumn.at(-1), {
    referenceColumnId: 'quantity-1', position: 'before', count: 1, reason: 'keyboard',
  });

  const remove = fakeEvent('keydown', {
    key: '-', code: 'Minus', ctrlKey: true, metaKey: false, altKey: false,
    shiftKey: false, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(remove);
  assert.equal(remove.defaultPrevented, true);
  assert.deepEqual(calls.deleteColumns.at(-1), {
    columnIds: ['quantity-1'], reason: 'keyboard',
  });

  const hide = fakeEvent('keydown', {
    key: '0', code: 'Digit0', ctrlKey: true, metaKey: false, altKey: false,
    shiftKey: false, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(hide);
  assert.equal(hide.defaultPrevented, true);
  assert.deepEqual(calls.setColumnVisibility.at(-1), {
    columnIds: ['quantity-1'], visible: false, reason: 'keyboard',
  });

  const showAll = fakeEvent('keydown', {
    key: '0', code: 'Digit0', ctrlKey: true, metaKey: false, altKey: false,
    shiftKey: true, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(showAll);
  assert.equal(showAll.defaultPrevented, true);
  assert.deepEqual(calls.setColumnVisibility.at(-1), {
    columnIds: ['quantity-0'], visible: true, reason: 'keyboard',
  });

  const freezeEnd = fakeEvent('keydown', {
    key: 'ArrowRight', ctrlKey: true, metaKey: false, altKey: true,
    shiftKey: true, repeat: false, isComposing: false,
  });
  grid.dispatchEvent(freezeEnd);
  assert.equal(freezeEnd.defaultPrevented, true);
  assert.deepEqual(calls.setColumnFrozen.at(-1), {
    columnId: 'quantity-1', frozen: 'end', reason: 'keyboard',
  });
  renderer.destroy();
});

test('presentation configuration hot-swaps locale, direction, labels, and theme without replacing the view', () => {
  const { window, container } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = Object.freeze([createColumns()[0]]);
  const active = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(snapshot, indexes, projection, columns, active, Object.freeze({ status: 'focused', draft: null })),
    createCallbacks(emptyCalls()),
    { instanceId: 'presentation-hot-swap' },
  );
  window.flushAnimationFrames();

  const configured = renderer.configurePresentation({
    locale: 'en-US',
    direction: 'rtl',
    labels: {
      treegridLabel: 'Parts RTL',
      treegridDescription: 'Right-to-left parts',
      editorLabel: 'Part editor',
    },
    theme: {
      background: '#101820',
      text: '#f5f7fa',
    },
  });
  assert.equal(configured.ok, true);
  assert.equal(configured.state.locale, 'en-US');
  assert.equal(configured.state.direction, 'rtl');
  assert.equal(renderer.getPresentation().theme.background, '#101820');
  const grid = container.querySelector('[role="treegrid"]');
  assert.equal(grid.getAttribute('dir'), 'rtl');
  assert.equal(grid.getAttribute('aria-label'), 'Parts RTL');
  assert.equal(container.querySelector('[data-bom-treegrid-description="true"]').textContent, 'Right-to-left parts');
  assert.equal(container.querySelector('[data-bom-editor-portal="true"]').getAttribute('aria-label'), 'Part editor');
  assert.equal(renderer.configurePresentation({ locale: 'not a locale' }).ok, false);
  renderer.destroy();
});

test('built-in locale packs switch renderer-owned labels without replacing the view', () => {
  const { window, container } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = Object.freeze([createColumns()[0]]);
  const active = Object.freeze({ occurrenceId: 'row-0', columnId: 'name' });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(snapshot, indexes, projection, columns, active, Object.freeze({ status: 'focused', draft: null })),
    createCallbacks(emptyCalls()),
    { instanceId: 'locale-pack-hot-swap' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  const portal = container.querySelector('[data-bom-editor-portal="true"]');
  assert.equal(grid.getAttribute('aria-label'), 'BOM');
  assert.equal(portal.getAttribute('aria-label'), '编辑');

  const configured = renderer.configurePresentation({ locale: 'en-US' });
  assert.equal(configured.ok, true);
  assert.equal(configured.state.locale, 'en-US');
  assert.equal(configured.state.labels.editorLabel, 'Edit cell');
  assert.equal(configured.state.labels.liveRegion.validationCompleted, 'Validation complete. No issues found.');
  assert.equal(grid.getAttribute('aria-label'), 'BOM');
  assert.equal(portal.getAttribute('aria-label'), 'Edit cell');

  assert.equal(renderer.configurePresentation({ locale: 'zh-CN' }).ok, true);
  assert.equal(renderer.getPresentation().labels.editorLabel, '编辑');
  assert.equal(portal.getAttribute('aria-label'), '编辑');
  renderer.destroy();
});

test('RTL pointer interactions mirror the tree expander and row-number gutter', () => {
  const { window, container } = createFakeDom(480, 240);
  const snapshot = createTreeFixture();
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, {
    indexes,
    rowHeight: 28,
    expandedIds: ['root'],
  }));
  const calls = emptyCalls();
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      createColumns(),
      Object.freeze({ occurrenceId: 'root', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    { instanceId: 'rtl-pointer-targets', direction: 'rtl' },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  assert.equal(grid.getAttribute('dir'), 'rtl');

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    clientX: 418,
    clientY: 50,
  }));
  assert.deepEqual(calls.toggleExpansion.at(-1), {
    address: { occurrenceId: 'root', columnId: 'name' },
    expanded: false,
  });

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    clientX: 456,
    clientY: 50,
  }));
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'root', columnId: 'name' },
    reason: 'pointer',
  });
  assert.deepEqual(calls.selectOptions.at(-1), {
    extend: false,
    mode: 'row',
  });
  renderer.destroy();
});

test('direction hot-swaps preserve logical scroll and map Left and Right visually', () => {
  const { window, container } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(2);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = createColumns();
  const calls = emptyCalls();
  const frameCommits = [];
  const initialActive = Object.freeze({
    occurrenceId: 'row-0',
    columnId: 'quantity-1',
  });
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      initialActive,
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'rtl-presentation-navigation',
      frameCommitSink(frame) {
        frameCommits.push(frame);
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.scrollLeft = 300;
  grid.dispatchEvent(fakeEvent('scroll'));
  window.flushAnimationFrames();
  assert.equal(frameCommits.at(-1).scrollLeft, 300);
  const activeId = grid.getAttribute('aria-activedescendant');
  assert.ok(activeId);

  assert.equal(renderer.configurePresentation({ direction: 'rtl' }).ok, true);
  window.flushAnimationFrames();
  assert.equal(grid.getAttribute('dir'), 'rtl');
  assert.equal(grid.scrollLeft, 300);
  assert.equal(frameCommits.at(-1).scrollLeft, 300);
  assert.equal(grid.getAttribute('aria-activedescendant'), activeId);
  assert.ok(container.querySelector(`#${activeId}`));

  assert.equal(renderer.configurePresentation({ direction: 'ltr' }).ok, true);
  window.flushAnimationFrames();
  assert.equal(grid.getAttribute('dir'), 'ltr');
  assert.equal(grid.scrollLeft, 300);
  assert.equal(frameCommits.at(-1).scrollLeft, 300);
  assert.equal(grid.getAttribute('aria-activedescendant'), activeId);
  assert.ok(container.querySelector(`#${activeId}`));

  assert.equal(renderer.configurePresentation({ direction: 'rtl' }).ok, true);
  window.flushAnimationFrames();

  grid.focus();
  const left = fakeEvent('keydown', {
    key: 'ArrowLeft',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(left);
  assert.equal(left.defaultPrevented, true);
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-0', columnId: 'quantity-2' },
    reason: 'keyboard',
  });

  const movedActive = Object.freeze({
    occurrenceId: 'row-0',
    columnId: 'quantity-2',
  });
  renderer.update(viewModel(
    snapshot,
    indexes,
    projection,
    columns,
    movedActive,
    Object.freeze({ status: 'focused', draft: null }),
  ));
  window.flushAnimationFrames();
  const right = fakeEvent('keydown', {
    key: 'ArrowRight',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(right);
  assert.equal(right.defaultPrevented, true);
  assert.deepEqual(calls.select.at(-1), {
    address: { occurrenceId: 'row-0', columnId: 'quantity-1' },
    reason: 'keyboard',
  });
  renderer.destroy();
});

test('custom cell renderers share measurement across Canvas, semantics, and consume hits', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = Object.freeze([createColumns()[0]]);
  const calls = emptyCalls();
  const rendererCalls = { measure: [], draw: [], accessible: [], hit: [], dispose: 0 };
  const hits = [];
  const registrations = [{
    columnId: 'name',
    renderer: {
      measure(context) {
        rendererCalls.measure.push(context);
        assert.equal(Object.isFrozen(context), true);
        assert.equal(context.revision, 'r1');
        assert.equal(context.address.occurrenceId, 'row-0');
        assert.equal(context.address.columnId, 'name');
        assert.equal(context.value, 'Part 0');
        assert.equal(context.fields.name, 'Part 0');
        assert.equal(context.availableSize.height, 28);
        return { width: context.availableSize.width + 50, height: 18 };
      },
      draw(context) {
        rendererCalls.draw.push(context);
        assert.equal(context.measuredSize.width, context.availableSize?.width ?? context.contentBounds.width);
        context.canvas.fillText('custom', context.contentBounds.x, context.contentBounds.y);
      },
      hitTest(context) {
        rendererCalls.hit.push(context);
        assert.equal(Number.isFinite(context.point.x), true);
        assert.equal(Number.isFinite(context.point.y), true);
        return { id: 'open-detail', consume: true };
      },
      getAccessibleText(context) {
        rendererCalls.accessible.push(context);
        return `Custom ${context.value}`;
      },
      dispose() {
        rendererCalls.dispose += 1;
      },
    },
  }];
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'custom-renderer-success',
      cellRenderers: registrations,
      onCellRendererHit(hit) {
        hits.push(hit);
      },
    },
  );
  window.flushAnimationFrames();

  assert.equal(rendererCalls.measure.length, 1);
  assert.equal(rendererCalls.draw.length, 1);
  assert.equal(rendererCalls.accessible.length, 1);
  assert.equal(
    container.querySelector('[role="gridcell"]').textContent,
    'Custom Part 0',
  );

  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 801,
    pointerType: 'mouse',
    clientX: 70,
    clientY: 50,
  }));
  assert.equal(rendererCalls.measure.length, 1);
  assert.equal(rendererCalls.hit.length, 1);
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], {
    revision: 'r1',
    address: { occurrenceId: 'row-0', columnId: 'name' },
    target: { id: 'open-detail', consume: true },
  });
  assert.equal(calls.select.length, 0);

  registrations.pop();
  renderer.invalidateCell({ occurrenceId: 'row-0', columnId: 'name' });
  window.flushAnimationFrames();
  assert.equal(rendererCalls.measure.length, 2);
  renderer.destroy();
  renderer.destroy();
  assert.equal(rendererCalls.dispose, 1);
});

test('custom cell-renderer failures and exhausted frame budgets fall back without blocking selection', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = Object.freeze([createColumns()[0]]);
  const calls = emptyCalls();
  const diagnostics = [];
  let drawCalls = 0;
  let accessibleCalls = 0;
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(calls),
    {
      instanceId: 'custom-renderer-fallback',
      cellRenderers: [{
        columnId: 'name',
        renderer: {
          measure() {
            return { width: -1, height: 20 };
          },
          draw() {
            drawCalls += 1;
          },
          hitTest() {
            return Promise.resolve({ id: 'async-hit', consume: true });
          },
          getAccessibleText() {
            accessibleCalls += 1;
            return 'never used';
          },
        },
      }],
      diagnosticSink(diagnostic) {
        diagnostics.push(diagnostic);
      },
    },
  );
  window.flushAnimationFrames();
  assert.equal(drawCalls, 0);
  assert.equal(accessibleCalls, 0);
  assert.equal(container.querySelector('[role="gridcell"]').textContent, 'Part 0');
  assert.equal(
    diagnostics.some((diagnostic) =>
      diagnostic.code === 'BOM_RENDERER_CELL_RENDERER_FAILED' &&
      diagnostic.phase === 'measure'),
    true,
  );
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 802,
    pointerType: 'mouse',
    clientX: 70,
    clientY: 50,
  }));
  assert.equal(calls.select.length, 1);
  renderer.destroy();

  const budgetDom = createFakeDom(640, 280);
  const budgetDiagnostics = [];
  let measures = 0;
  let budgetDraws = 0;
  const budgetRenderer = mountBomCanvasRenderer(
    budgetDom.container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(emptyCalls()),
    {
      instanceId: 'custom-renderer-budget',
      cellRendererFrameBudgetMs: 0.001,
      cellRenderers: [{
        columnId: 'name',
        renderer: {
          measure(context) {
            measures += 1;
            const deadline = globalThis.performance.now() + 2;
            while (globalThis.performance.now() < deadline) {
              // Exercise the synchronous frame-budget guard deterministically.
            }
            return context.availableSize;
          },
          draw() {
            budgetDraws += 1;
          },
          getAccessibleText() {
            return 'too slow';
          },
        },
      }],
      diagnosticSink(diagnostic) {
        budgetDiagnostics.push(diagnostic);
      },
    },
  );
  budgetDom.window.flushAnimationFrames();
  assert.equal(measures, 1);
  assert.equal(budgetDraws, 0);
  assert.equal(
    budgetDiagnostics.filter(
      (diagnostic) => diagnostic.code === 'BOM_RENDERER_CELL_RENDERER_BUDGET_EXCEEDED',
    ).length,
    1,
  );
  assert.equal(
    budgetDom.container.querySelector('[role="gridcell"]').textContent,
    'Part 0',
  );
  budgetRenderer.invalidateCell({ occurrenceId: 'row-0', columnId: 'name' });
  budgetDom.window.flushAnimationFrames();
  assert.equal(measures, 2);
  assert.equal(
    budgetDiagnostics.filter(
      (diagnostic) => diagnostic.code === 'BOM_RENDERER_CELL_RENDERER_BUDGET_EXCEEDED',
    ).length,
    2,
  );
  budgetRenderer.destroy();
});

test('custom cell-renderer option validation and non-consuming hit callbacks are isolated', () => {
  const { container, window } = createFakeDom(640, 280);
  const snapshot = createFlatFixture(1);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = Object.freeze([createColumns()[0]]);
  const currentView = viewModel(
    snapshot,
    indexes,
    projection,
    columns,
    Object.freeze({ occurrenceId: 'row-0', columnId: 'name' }),
    Object.freeze({ status: 'focused', draft: null }),
  );
  const rendererCapability = {
    measure(context) {
      return context.availableSize;
    },
    draw() {},
    getAccessibleText() {
      return 'custom';
    },
  };
  assert.throws(
    () => mountBomCanvasRenderer(
      container,
      currentView,
      createCallbacks(emptyCalls()),
      {
        instanceId: 'custom-renderer-invalid',
        cellRenderers: [{ columnId: '', renderer: rendererCapability }],
      },
    ),
    /BOM_RENDERER_CELL_RENDERERS_INVALID/,
  );
  assert.throws(
    () => mountBomCanvasRenderer(
      container,
      currentView,
      createCallbacks(emptyCalls()),
      {
        instanceId: 'custom-renderer-duplicate',
        cellRenderers: [
          { columnId: 'name', renderer: rendererCapability },
          { columnId: 'name', renderer: rendererCapability },
        ],
      },
    ),
    /BOM_RENDERER_CELL_RENDERERS_INVALID/,
  );

  const calls = emptyCalls();
  const diagnostics = [];
  const renderer = mountBomCanvasRenderer(
    container,
    currentView,
    createCallbacks(calls),
    {
      instanceId: 'custom-renderer-non-consuming',
      cellRendererFrameBudgetMs: 100,
      cellRenderers: [{
        columnId: 'name',
        renderer: {
          ...rendererCapability,
          hitTest() {
            return { id: 'pass-through', consume: false };
          },
        },
      }],
      onCellRendererHit() {
        throw new Error('observer failure');
      },
      diagnosticSink(diagnostic) {
        diagnostics.push(diagnostic);
      },
    },
  );
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 803,
    pointerType: 'mouse',
    clientX: 70,
    clientY: 50,
  }));
  assert.equal(calls.select.length, 1);
  assert.equal(
    diagnostics.some((diagnostic) =>
      diagnostic.code === 'BOM_RENDERER_CELL_RENDERER_HIT_CALLBACK_FAILED' &&
      diagnostic.targetId === 'pass-through'),
    true,
  );
  renderer.destroy();
});

test('custom accessible text also serves an off-window active-cell proxy', () => {
  const { container, window } = createFakeDom(480, 160);
  const snapshot = createFlatFixture(100);
  const indexes = value(buildBomIndexes(snapshot));
  const projection = value(createVisibleProjection(snapshot, { indexes, rowHeight: 28 }));
  const columns = Object.freeze([createColumns()[0]]);
  const renderer = mountBomCanvasRenderer(
    container,
    viewModel(
      snapshot,
      indexes,
      projection,
      columns,
      Object.freeze({ occurrenceId: 'row-99', columnId: 'name' }),
      Object.freeze({ status: 'focused', draft: null }),
    ),
    createCallbacks(emptyCalls()),
    {
      instanceId: 'custom-renderer-active-proxy',
      cellRenderers: [{
        columnId: 'name',
        renderer: {
          measure(context) {
            return context.availableSize;
          },
          draw() {},
          getAccessibleText(context) {
            return `Accessible ${context.value}`;
          },
        },
      }],
    },
  );
  window.flushAnimationFrames();
  assert.equal(
    container.querySelector('[data-bom-active-proxy-cell="true"]').textContent,
    'Accessible Part 99',
  );
  renderer.destroy();
});
