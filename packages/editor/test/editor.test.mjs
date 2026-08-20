import assert from 'node:assert/strict';
import test from 'node:test';

import { hashBomDocumentContent } from '@bom-editor/model';
import { BOM_TRANSACTION_ERROR_CODES } from '@bom-editor/transaction';
import { BOM_AGENT_CAPABILITY_PROTOCOL } from '@bom-editor/contracts';
import {
  BOM_EDITOR_AGENT_CAPABILITIES,
  createBomEditor,
  createBomEditorAgentCapabilityAdapter,
  createBomEditorMcpAdapter,
  createBomEditorMcpProtocolServer,
  createBomEditorComponent,
  BOM_EDITOR_ERROR_CODES,
  BomEditorConfigurationError,
  createBomViewTemplateStorage,
  createBomLocalStorageTemplateStorage,
  parseBomViewTemplate,
} from '../dist/index.js';
import {
  parseClipboardText,
  parseClipboardTextAsync,
} from '../dist/paste.js';
import {
  parseHtmlClipboardAsync,
} from '../dist/html-clipboard.js';
import {
  parseBranchClipboardAsync,
  parseInternalClipboardAsync,
} from '../dist/internal-clipboard.js';
import {
  ClipboardParseWorkerClient,
} from '../dist/clipboard-worker-client.js';
import { parseClipboardTextStreamAsync } from '../dist/stream-clipboard.js';
import {
  createFakeDom,
  fakeEvent,
} from '../../renderer-canvas/test/dom-mocks.mjs';

const schema = Object.freeze({
  schemaVersion: '1.0.0',
  fields: Object.freeze([
    Object.freeze({
      fieldId: 'name',
      path: Object.freeze(['name']),
      type: Object.freeze({ kind: 'string', maxLength: 100 }),
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
  ]),
  allowAdditionalFields: false,
  recommendedDepth: 6,
  maximumDepth: 128,
  canonicalizationVersion: '1',
  contentHashAlgorithm: 'SHA-256',
});

const columns = Object.freeze([
  Object.freeze({
    columnId: 'name',
    fieldPath: Object.freeze(['name']),
    label: 'Name',
    width: 160,
    editable: true,
    frozen: 'start',
  }),
  Object.freeze({
    columnId: 'note',
    fieldPath: Object.freeze(['note']),
    label: 'Note',
    width: 140,
    editable: true,
    frozen: false,
  }),
]);

function createSnapshot({
  documentId = 'document-a',
  revision = 'revision-a',
  firstId = 'row-1',
  secondId = 'row-2',
  firstName = 'Part one',
  secondName = 'Part two',
  firstNote = 'initial',
  sourceRevision,
} = {}) {
  return {
    schemaVersion: '1.0.0',
    documentId,
    revision,
    ...(sourceRevision === undefined ? {} : { sourceRevision }),
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: 2,
    roots: [firstId, secondId],
    nodes: [
      {
        occurrenceId: firstId,
        kind: 'material',
        materialCode: `MAT-${firstId}`,
        parentId: null,
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 0,
        fields: { name: firstName, note: firstNote },
      },
      {
        occurrenceId: secondId,
        kind: 'material',
        materialCode: `MAT-${secondId}`,
        parentId: null,
        positionKey: 'B',
        childrenState: 'complete',
        knownChildCount: 0,
        fields: { name: secondName },
      },
    ],
  };
}

function createFlatSnapshot(rowCount, documentId = 'flat-paste-document') {
  const roots = [];
  const nodes = [];
  for (let index = 0; index < rowCount; index += 1) {
    const occurrenceId = `flat-row-${index}`;
    roots.push(occurrenceId);
    nodes.push({
      occurrenceId,
      kind: 'material',
      materialCode: `MAT-${index}`,
      parentId: null,
      positionKey: `P${String(index).padStart(6, '0')}`,
      childrenState: 'complete',
      knownChildCount: 0,
      fields: { name: `Part ${index}`, note: 'initial' },
    });
  }
  return {
    schemaVersion: '1.0.0',
    documentId,
    revision: 'flat-paste-revision',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: rowCount,
    roots,
    nodes,
  };
}

function createTreeSnapshot() {
  return {
    schemaVersion: '1.0.0',
    documentId: 'tree-document',
    revision: 'tree-revision',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: 1,
    roots: ['root'],
    nodes: [
      {
        occurrenceId: 'root',
        kind: 'material',
        materialCode: 'MAT-root',
        parentId: null,
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 1,
        fields: { name: 'Root', note: 'Root note' },
      },
      {
        occurrenceId: 'child',
        kind: 'material',
        materialCode: 'MAT-child',
        parentId: 'root',
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 0,
        fields: { name: 'Child', note: 'Child note' },
      },
    ],
  };
}

function createPartialSnapshot(overrides = {}) {
  const snapshot = createSnapshot({
    revision: 'partial-revision',
    sourceRevision: 'partial-source-revision',
    ...overrides,
  });
  return {
    ...snapshot,
    completeness: 'partial',
    knownRootCount: 3,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      childrenState: 'unloaded',
      knownChildCount: 0,
    })),
  };
}

function createLazyChildrenSnapshot() {
  return {
    schemaVersion: '1.0.0',
    documentId: 'lazy-document',
    revision: 'lazy-revision',
    sourceRevision: 'lazy-source-0',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'partial',
    knownRootCount: 1,
    roots: ['lazy-root'],
    nodes: [
      {
        occurrenceId: 'lazy-root',
        kind: 'group',
        parentId: null,
        positionKey: 'A',
        childrenState: 'unloaded',
        knownChildCount: 2,
        fields: { name: 'Lazy root', note: 'initial' },
      },
    ],
  };
}

function createBranchSnapshot() {
  return {
    schemaVersion: '1.0.0',
    documentId: 'branch-document',
    revision: 'branch-revision',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: 1,
    roots: ['branch-root'],
    nodes: [
      {
        occurrenceId: 'branch-root',
        kind: 'group',
        materialCode: 'MAT-root',
        parentId: null,
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 1,
        fields: { name: 'Root', note: 'Root note' },
      },
      {
        occurrenceId: 'branch-child',
        kind: 'material',
        materialCode: 'MAT-child',
        parentId: 'branch-root',
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 1,
        fields: { name: 'Child', note: 'Child note' },
      },
      {
        occurrenceId: 'branch-leaf',
        kind: 'material',
        materialCode: 'MAT-leaf',
        parentId: 'branch-child',
        positionKey: 'A',
        childrenState: 'complete',
        knownChildCount: 0,
        fields: { name: 'Leaf', note: 'Leaf note' },
      },
    ],
  };
}

function createEditor(snapshot = createSnapshot()) {
  return createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-test',
    rowHeight: 28,
  });
}

function createTreeEditor() {
  return createBomEditor({
    schema,
    columns,
    initialDocument: createTreeSnapshot(),
    instanceId: 'editor-tree-test',
    rowHeight: 28,
    expandAll: true,
  });
}

async function mountFocusedGrid(editor) {
  const dom = createFakeDom(640, 280);
  const mounting = editor.mount(dom.container);
  await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = dom.container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  return { ...dom, grid };
}

function deleteSelectionKey({ key = 'Delete' } = {}) {
  return fakeEvent('keydown', {
    key,
    keyCode: key === 'Backspace' ? 8 : 46,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
}

function fillDownKey({ command = false } = {}) {
  return fakeEvent('keydown', {
    key: 'd',
    keyCode: 68,
    altKey: false,
    ctrlKey: !command,
    metaKey: command,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
}

function fillSelectionKey({ command = false } = {}) {
  return fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: !command,
    metaKey: command,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
}

function createInternalClipboard(rows) {
  return JSON.stringify({
    format: 'bom-editor/clipboard',
    version: 1,
    kind: 'cell-grid-text',
    rows,
  });
}

function createBranchClipboard(snapshot = createBranchSnapshot()) {
  return JSON.stringify({
    format: 'bom-editor/clipboard',
    version: 1,
    kind: 'branch-tree',
    roots: snapshot.roots,
    includeDescendants: true,
    nodes: snapshot.nodes,
  });
}

function expectOk(result) {
  assert.equal(
    result.ok,
    true,
    result.ok ? undefined : `${result.error.code}: ${result.error.messageKey}`,
  );
  return result.value;
}

function expectError(result, code) {
  assert.equal(result.ok, false, 'Expected the editor operation to fail.');
  assert.equal(result.error.code, code);
  return result.error;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function flushComponentOutputs() {
  await Promise.resolve();
  await Promise.resolve();
}

function controlledDataSource({
  snapshot = createSnapshot({ sourceRevision: 'source-0' }),
  writable = true,
  remoteChanges = true,
  cancelPendingCommit = false,
  remoteQuery = false,
  lazyChildren = false,
  queryExecution,
  loadDocument,
  query,
  loadChildren,
  cancelCommit,
  onSubscribe,
} = {}) {
  const commits = [];
  const observers = new Set();
  let currentSnapshot = snapshot;
  let loadCount = 0;
  let unsubscribeCount = 0;
  const source = {
    capabilities: Object.freeze({
      streaming: false,
      lazyChildren,
      remoteQuery,
      writable,
      remoteChanges,
      cancelPendingCommit,
      queryExecution: Object.freeze(queryExecution ?? {
        search: remoteQuery ? 'remote' : 'local',
        filter: remoteQuery ? 'remote' : 'local',
        sort: remoteQuery ? 'remote' : 'local',
        pagination: remoteQuery ? 'remote' : 'local',
      }),
    }),
    async loadDocument({ signal }) {
      loadCount += 1;
      if (loadDocument !== undefined) {
        return loadDocument({ signal, loadCount });
      }
      return currentSnapshot;
    },
    ...(remoteQuery
      ? {
          query(request) {
            return query === undefined
              ? Promise.resolve({
                  occurrenceIds: [],
                  sourceRevision: currentSnapshot.sourceRevision ?? currentSnapshot.revision,
                })
              : query(request);
          },
        }
      : {}),
    ...(lazyChildren
      ? {
          loadChildren(request) {
            return loadChildren === undefined
              ? Promise.resolve({
                  items: [],
                  sourceRevision: currentSnapshot.sourceRevision ?? currentSnapshot.revision,
                  complete: true,
                })
              : loadChildren(request);
          },
        }
      : {}),
    commit(request) {
      const pending = deferred();
      commits.push({ request, pending });
      return pending.promise;
    },
    ...(cancelPendingCommit
      ? {
          cancelCommit(request) {
            return cancelCommit === undefined
              ? Promise.resolve({ cancelled: false })
              : cancelCommit(request);
          },
        }
      : {}),
    ...(remoteChanges
      ? {
          subscribeRemote(observer) {
            observers.add(observer);
            let active = true;
            const unsubscribe = () => {
              if (!active) return;
              active = false;
              unsubscribeCount += 1;
              observers.delete(observer);
            };
            onSubscribe?.(observer);
            return unsubscribe;
          },
        }
      : {}),
  };
  return {
    source,
    commits,
    get loadCount() { return loadCount; },
    get unsubscribeCount() { return unsubscribeCount; },
    setSnapshot(next) { currentSnapshot = next; },
    emit(envelope) {
      for (const observer of [...observers]) observer.next(envelope);
    },
    emitError(error) {
      for (const observer of [...observers]) observer.error(error);
    },
    requestResync(sourceRevision) {
      for (const observer of [...observers]) {
        observer.resyncRequired(sourceRevision);
      }
    },
  };
}

async function mountDataSourceEditor(dataSource, instanceId = 'source-editor') {
  const editor = createBomEditor({
    schema,
    columns,
    dataSource,
    instanceId,
    rowHeight: 28,
  });
  const dom = createFakeDom(640, 280);
  const mounting = editor.mount(dom.container);
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);
  return { editor, ...dom };
}

function contentHash(snapshot) {
  const result = hashBomDocumentContent(snapshot, schema);
  assert.equal(
    result.ok,
    true,
    result.ok ? undefined : result.errors.map((error) => error.code).join(', '),
  );
  return result.value;
}

function node(snapshot, occurrenceId) {
  const value = snapshot.nodes.find(
    (candidate) => candidate.occurrenceId === occurrenceId,
  );
  assert.ok(value, `Missing node ${occurrenceId}.`);
  return value;
}

function recordEvents(editor, types) {
  const events = [];
  const off = types.map((type) =>
    editor.on(type, (event) => {
      events.push(event);
    }),
  );
  return {
    events,
    stop() {
      for (const unsubscribe of off) {
        unsubscribe();
      }
    },
  };
}

function waitForEvent(editor, type, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${type}.`));
    }, 2_000);
    const unsubscribe = editor.on(type, (event) => {
      if (!predicate(event)) {
        return;
      }
      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });
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

test('initialView restores query, stable selection, and scroll state at creation', async (t) => {
  const layoutColumns = Object.freeze([
    columns[0],
    columns[1],
    Object.freeze({
      ...columns[1],
      columnId: 'note-copy',
      label: 'Note copy',
      width: 110,
    }),
  ]);
  const editor = createBomEditor({
    schema,
    columns: layoutColumns,
    initialDocument: createTreeSnapshot(),
    instanceId: 'initial-view-tree',
    initialView: {
      rowHeight: 28,
      columns: [
        { columnId: 'name', width: 184, frozen: 'start', visible: true },
        { columnId: 'note-copy', width: 126, frozen: false, visible: true },
        { columnId: 'note', width: 118, frozen: 'end', visible: false },
      ],
      expandedIds: ['root'],
      query: {
        filters: [
          { fieldPath: ['name'], operator: 'contains', value: 'Child' },
        ],
      },
      selection: {
        activeCell: { occurrenceId: 'child', columnId: 'name' },
        range: null,
      },
    },
  });
  t.after(() => editor.destroy());
  assert.deepEqual(editor.getViewTemplate().query, {
    filters: [
      { fieldPath: ['name'], operator: 'contains', value: 'Child' },
    ],
  });
  assert.deepEqual(
    editor.getViewTemplate().columns.map((column) => ({
      columnId: column.columnId,
      width: column.width,
      frozen: column.frozen,
      visible: column.visible,
    })),
    [
      { columnId: 'name', width: 184, frozen: 'start', visible: true },
      { columnId: 'note-copy', width: 126, frozen: false, visible: true },
      { columnId: 'note', width: 118, frozen: 'end', visible: false },
    ],
  );
  const dom = createFakeDom(640, 280);
  const mounting = editor.mount(dom.container);
  await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);
  const rootRow = [...dom.container.querySelectorAll('[role="row"]')]
    .find((row) => row.getAttribute('aria-expanded') === 'true');
  assert.ok(rootRow);
  const selected = [...dom.container.querySelectorAll('[role="gridcell"]')]
    .filter((cell) => cell.getAttribute('aria-selected') === 'true');
  assert.equal(selected.length, 1);
  assert.match(selected[0].textContent, /Child/u);

  const scrollEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(30, 'initial-view-scroll'),
    instanceId: 'initial-view-scroll',
    initialView: { rowHeight: 28, scrollTop: 16 },
  });
  t.after(() => scrollEditor.destroy());
  const scrollViews = [];
  scrollEditor.on('viewChanged', (event) => scrollViews.push(event.view));
  const scrollDom = createFakeDom(640, 280);
  const scrollMount = scrollEditor.mount(scrollDom.container);
  await Promise.resolve();
  scrollDom.window.flushAnimationFrames();
  expectOk(await scrollMount);
  assert.equal(scrollViews.at(-1).scrollTop, 16);
});

test('initialView restores stable per-row height overrides', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'initial-view-row-heights',
    initialView: {
      rowHeight: 28,
      rowHeights: [
        { occurrenceId: 'row-1', rowHeight: 52 },
      ],
    },
  });
  t.after(() => editor.destroy());
  const views = [];
  const unsubscribe = editor.on('viewChanged', (event) => views.push(event));
  t.after(() => unsubscribe());
  const dom = createFakeDom(640, 280);
  const mounting = editor.mount(dom.container);
  await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);
  assert.equal(editor.setViewQuery({}).ok, true);
  assert.deepEqual(views.at(-1).view.rowHeights, [
    { occurrenceId: 'row-1', rowHeight: 52 },
  ]);
});

test('initialView rejects conflicting, malformed, or invisible state', () => {
  assert.throws(
    () => createBomEditor({
      schema,
      columns,
      initialDocument: createSnapshot(),
      instanceId: 'initial-view-conflict',
      initialView: { expandAll: true, expandedIds: ['row-1'] },
    }),
    (error) => error instanceof BomEditorConfigurationError &&
      error.error.code === BOM_EDITOR_ERROR_CODES.configInvalid,
  );
  assert.throws(
    () => createBomEditor({
      schema,
      columns,
      initialDocument: createSnapshot(),
      instanceId: 'initial-view-query-field',
      initialView: {
        query: {
          filters: [
            { fieldPath: ['missing'], operator: 'equals', value: 'value' },
          ],
        },
      },
    }),
    (error) => error instanceof BomEditorConfigurationError &&
      error.error.code === BOM_EDITOR_ERROR_CODES.configInvalid,
  );
  assert.throws(
    () => createBomEditor({
      schema,
      columns,
      initialDocument: createSnapshot(),
      instanceId: 'initial-view-selection',
      initialView: {
        selection: {
          activeCell: { occurrenceId: 'missing-row', columnId: 'name' },
          range: null,
        },
      },
    }),
    (error) => error instanceof BomEditorConfigurationError &&
      error.error.code === BOM_EDITOR_ERROR_CODES.configInvalid,
  );
  assert.throws(
    () => createBomEditor({
      schema,
      columns,
      initialDocument: createSnapshot(),
      instanceId: 'initial-view-columns',
      initialView: {
        columns: [
          { columnId: 'name', width: 160, frozen: 'start', visible: true },
        ],
      },
    }),
    (error) => error instanceof BomEditorConfigurationError &&
      error.error.code === BOM_EDITOR_ERROR_CODES.configInvalid,
  );
  const queryEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'initial-view-query-runtime',
  });
  assert.equal(
    queryEditor.setViewQuery({ filters: [null] }).ok,
    false,
  );
  queryEditor.destroy();
});

test('component creation forwards initialView without flattening its fields', async (t) => {
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'initial-view-component',
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'row-2', columnId: 'name' },
        range: null,
      },
      scrollLeft: 0,
      scrollTop: 0,
    },
  });
  t.after(() => component.destroy());
  const dom = createFakeDom(640, 280);
  const mounting = component.mount(dom.container);
  await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);
  const selected = [...dom.container.querySelectorAll('[role="gridcell"]')]
    .filter((cell) => cell.getAttribute('aria-selected') === 'true');
  assert.equal(selected.length, 1);
  assert.match(selected[0].textContent, /Part two/u);
});

test('template storage migrates deterministically and preserves corrupt source on fallback', () => {
  const values = new Map();
  const backend = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const storage = createBomViewTemplateStorage(backend, 'app:user:schema');
  const template = Object.freeze({ columns });
  assert.equal(storage.save('layout', template, '1.0.0').ok, true);
  const original = values.get('bom-view-template:app:user:schema:layout');
  const migrated = storage.loadResolved('layout', {
    targetSchemaVersion: '2.0.0',
    migrate(source, fromVersion, toVersion) {
      assert.equal(fromVersion, '1.0.0');
      assert.equal(toVersion, '2.0.0');
      return Object.freeze({
        ...source,
        columns: Object.freeze(source.columns.map((column) => Object.freeze({
          ...column,
          label: `${column.label} (v2)`,
        }))),
      });
    },
    persistMigrated: true,
  });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.value.source, 'migrated');
  assert.equal(migrated.value.persisted, true);
  assert.notEqual(values.get('bom-view-template:app:user:schema:layout'), original);
  assert.equal(
    storage.load('layout').value.schemaVersion,
    '2.0.0',
  );

  values.set(
    'bom-view-template:app:user:schema:broken',
    '{"protocol":"bom-view-template/v1","schemaVersion":"1.0.0","template":null}',
  );
  const corrupt = values.get('bom-view-template:app:user:schema:broken');
  const fallback = storage.loadResolved('broken', {
    targetSchemaVersion: '2.0.0',
    defaultTemplate: template,
    migrate() {
      throw new Error('migration must not run for corrupt input');
    },
    persistMigrated: true,
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.value.source, 'default');
  assert.equal(fallback.value.persisted, false);
  assert.equal(values.get('bom-view-template:app:user:schema:broken'), corrupt);

  const failed = storage.loadResolved('layout', {
    targetSchemaVersion: '3.0.0',
    defaultTemplate: template,
    migrate() {
      return undefined;
    },
    persistMigrated: true,
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.value.source, 'default');
  assert.equal(failed.value.persisted, false);
  assert.equal(storage.load('layout').value.schemaVersion, '2.0.0');
});

test('local template storage namespaces ownership and forwards cross-tab changes without values', () => {
  const values = new Map();
  const backend = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const storageListeners = new Set();
  const eventSource = {
    addEventListener(type, listener) {
      assert.equal(type, 'storage');
      storageListeners.add(listener);
    },
    removeEventListener(type, listener) {
      assert.equal(type, 'storage');
      storageListeners.delete(listener);
    },
  };
  const storage = createBomLocalStorageTemplateStorage(
    backend,
    {
      appId: 'bom-app',
      tenantId: 'tenant-a',
      userId: 'user-1',
      schemaVersion: 'schema-2',
    },
    eventSource,
  );
  const changes = [];
  const stop = storage.onChange('layout', (change) => changes.push(change));
  const template = Object.freeze({ columns });
  assert.equal(storage.save('layout', template, 'schema-2').ok, true);
  const key = [...values.keys()][0];
  assert.match(key, /bom-editor:view-template:v1:bom-app:tenant-a:user-1:schema-2/);
  assert.deepEqual(changes, [{ name: 'layout', source: 'local' }]);

  for (const listener of [...storageListeners]) {
    listener({ key, storageArea: backend });
  }
  assert.deepEqual(changes, [
    { name: 'layout', source: 'local' },
    { name: 'layout', source: 'remote' },
  ]);
  stop();
  assert.equal(storageListeners.size, 0);
});

test('fillSeries generates ISO date and datetime sequences from the first two rows', async (t) => {
  const dateSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      Object.freeze({
        fieldId: 'date',
        path: Object.freeze(['date']),
        type: Object.freeze({ kind: 'date', representation: 'iso-date' }),
        required: true,
        nullable: false,
      }),
      Object.freeze({
        fieldId: 'instant',
        path: Object.freeze(['instant']),
        type: Object.freeze({ kind: 'datetime', representation: 'iso-instant' }),
        required: true,
        nullable: false,
      }),
    ]),
  });
  const dateColumns = Object.freeze([
    Object.freeze({
      columnId: 'date',
      fieldPath: Object.freeze(['date']),
      label: 'Date',
      width: 140,
      editable: true,
      frozen: 'start',
    }),
    Object.freeze({
      columnId: 'instant',
      fieldPath: Object.freeze(['instant']),
      label: 'Instant',
      width: 180,
      editable: true,
      frozen: false,
    }),
  ]);
  const snapshot = createFlatSnapshot(4, 'fill-series-temporal');
  snapshot.nodes = snapshot.nodes.map((nodeValue, index) => ({
    ...nodeValue,
    fields: {
      date: ['2026-01-01', '2026-01-03', '2026-01-03', '2026-01-03'][index],
      instant: [
        '2026-01-01T00:00:00Z',
        '2026-01-01T06:00:00Z',
        '2026-01-01T06:00:00Z',
        '2026-01-01T06:00:00Z',
      ][index],
    },
  }));
  const editor = createBomEditor({
    schema: dateSchema,
    columns: dateColumns,
    initialDocument: snapshot,
    instanceId: 'editor-fill-series-temporal',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
    repeat: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
    repeat: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
    repeat: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
    repeat: false,
  }));
  window.flushAnimationFrames();
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:fill-series',
  );
  editor.fillSeries();
  const event = await committed;
  assert.equal(event.patch.operations.length, 4);
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.date, '2026-01-05');
  assert.equal(node(editor.getSnapshot(), 'flat-row-3').fields.date, '2026-01-07');
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.instant, '2026-01-01T12:00:00.000Z');
  assert.equal(node(editor.getSnapshot(), 'flat-row-3').fields.instant, '2026-01-01T18:00:00.000Z');
});

test('fillSeries fills disjoint temporal ranges in one transaction', async (t) => {
  const dateSchema = Object.freeze({
    schemaVersion: '1.0.0',
    fields: Object.freeze([
      Object.freeze({
        fieldId: 'date',
        path: Object.freeze(['date']),
        type: Object.freeze({ kind: 'date', representation: 'iso-date' }),
        required: true,
        nullable: false,
      }),
    ]),
    allowAdditionalFields: false,
    recommendedDepth: 6,
    maximumDepth: 128,
    canonicalizationVersion: '1',
    contentHashAlgorithm: 'SHA-256',
  });
  const dateColumns = Object.freeze([
    Object.freeze({
      columnId: 'date',
      fieldPath: Object.freeze(['date']),
      label: 'Date',
      width: 140,
      editable: true,
      frozen: 'start',
    }),
  ]);
  const snapshot = createFlatSnapshot(6, 'fill-series-multi-range');
  snapshot.nodes = snapshot.nodes.map((nodeValue, index) => ({
    ...nodeValue,
    fields: {
      date: [
        '2026-01-01',
        '2026-01-03',
        '2026-01-03',
        '2026-02-01',
        '2026-02-03',
        '2026-02-03',
      ][index],
    },
  }));
  const editor = createBomEditor({
    schema: dateSchema,
    columns: dateColumns,
    initialDocument: snapshot,
    instanceId: 'editor-fill-series-multi-range',
    rowHeight: 28,
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-5', columnId: 'date' },
        range: {
          anchor: { occurrenceId: 'flat-row-3', columnId: 'date' },
          focus: { occurrenceId: 'flat-row-5', columnId: 'date' },
        },
        ranges: [
          {
            anchor: { occurrenceId: 'flat-row-0', columnId: 'date' },
            focus: { occurrenceId: 'flat-row-2', columnId: 'date' },
          },
          {
            anchor: { occurrenceId: 'flat-row-3', columnId: 'date' },
            focus: { occurrenceId: 'flat-row-5', columnId: 'date' },
          },
        ],
      },
    },
  });
  t.after(() => editor.destroy());
  await mountFocusedGrid(editor);
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:fill-series',
  );
  editor.fillSeries();
  const event = await committed;
  assert.equal(event.patch.operations.length, 2);
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.date, '2026-01-05');
  assert.equal(node(editor.getSnapshot(), 'flat-row-5').fields.date, '2026-02-05');
});

test('serializes concurrent commands and publishes transaction events in FIFO order', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const recorded = recordEvents(editor, [
    'beforeTransaction',
    'transactionCommitted',
    'documentChanged',
  ]);

  const firstPromise = editor.execute(
    {
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'first',
    },
    { origin: 'test:first' },
  );
  const secondPromise = editor.execute(
    {
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'second',
    },
    { origin: 'test:second' },
  );

  const [firstResult, secondResult] = await Promise.all([
    firstPromise,
    secondPromise,
  ]);
  const first = expectOk(firstResult);
  const second = expectOk(secondResult);

  assert.equal(second.previousRevision, first.revision);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'second');
  assert.deepEqual(
    recorded.events.map((event) => `${event.type}:${event.origin}`),
    [
      'beforeTransaction:test:first',
      'transactionCommitted:test:first',
      'documentChanged:test:first',
      'beforeTransaction:test:second',
      'transactionCommitted:test:second',
      'documentChanged:test:second',
    ],
  );
  assert.deepEqual(
    recorded.events.map((event) => event.sequence),
    [...recorded.events.map((event) => event.sequence)].sort((a, b) => a - b),
  );
  assert.equal(
    new Set(recorded.events.map((event) => event.sequence)).size,
    recorded.events.length,
  );
  recorded.stop();
});

test('a transaction listener queues reentrant editor commands after the active commit', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const recorded = recordEvents(editor, [
    'beforeTransaction',
    'transactionCommitted',
    'documentChanged',
  ]);
  let listenerCommand;
  const stop = editor.on('beforeTransaction', (event) => {
    if (event.origin !== 'test:listener-outer') return;
    listenerCommand = editor.execute({
      type: 'setField',
      occurrenceId: 'row-2',
      fieldPath: ['note'],
      value: 'listener-follow-up',
    }, { origin: 'test:listener-follow-up' });
  });
  t.after(() => stop());

  const outer = expectOk(await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'outer',
  }, { origin: 'test:listener-outer' }));
  const followUp = expectOk(await listenerCommand);

  assert.equal(followUp.previousRevision, outer.revision);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'outer');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'listener-follow-up');
  assert.deepEqual(
    recorded.events.map((event) => `${event.type}:${event.origin}`),
    [
      'beforeTransaction:test:listener-outer',
      'transactionCommitted:test:listener-outer',
      'documentChanged:test:listener-outer',
      'beforeTransaction:test:listener-follow-up',
      'transactionCommitted:test:listener-follow-up',
      'documentChanged:test:listener-follow-up',
    ],
  );
  recorded.stop();
});

test('beforeTransaction cancellation is synchronous and leaves no partial state', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const snapshotBefore = editor.getSnapshot();
  const hashBefore = contentHash(snapshotBefore);
  const rejected = [];
  let cancelledEvent;

  editor.on('transactionRejected', (event) => rejected.push(event));
  editor.on('beforeTransaction', (event) => {
    assert.equal(Object.isFrozen(event), true);
    assert.equal(Object.isFrozen(event.patch), true);
    if (event.origin === 'test:cancel') {
      cancelledEvent = event;
      event.preventDefault();
    } else if (event.origin === 'test:late-cancel') {
      queueMicrotask(() => event.preventDefault());
    }
  });

  const cancelled = await editor.execute(
    {
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'must-not-commit',
    },
    { origin: 'test:cancel' },
  );

  expectError(cancelled, BOM_TRANSACTION_ERROR_CODES.beforeApplyRejected);
  assert.equal(cancelledEvent.defaultPrevented, true);
  assert.equal(editor.getSnapshot(), snapshotBefore);
  assert.equal(contentHash(editor.getSnapshot()), hashBefore);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].baseRevision, snapshotBefore.revision);

  const accepted = await editor.execute(
    {
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'late-cancel-is-ignored',
    },
    { origin: 'test:late-cancel' },
  );
  expectOk(accepted);
  assert.equal(
    node(editor.getSnapshot(), 'row-1').fields.note,
    'late-cancel-is-ignored',
  );
});

test('setField followed by Undo restores the canonical content hash', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const hashBefore = contentHash(editor.getSnapshot());

  const changed = expectOk(
    await editor.execute({
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'changed',
    }),
  );
  const changedHash = contentHash(editor.getSnapshot());
  assert.notEqual(changedHash, hashBefore);
  assert.equal(changed.patch.operations[0].op, 'updateField');

  const undone = expectOk(await editor.undo({ origin: 'test:undo' }));
  assert.equal(undone.patch.origin, 'test:undo');
  assert.equal(contentHash(editor.getSnapshot()), hashBefore);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
});

test('Undo and Redo restore stable selection endpoints around structural history', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = await mountFocusedGrid(editor);
  const selectionEvents = recordEvents(editor, ['selectionChanged']);
  t.after(() => selectionEvents.stop());

  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  }));
  window.flushAnimationFrames();
  assert.deepEqual(selectionEvents.events.at(-1).selection.activeCell, {
    occurrenceId: 'row-2',
    columnId: 'name',
  });

  expectOk(await editor.execute({
    type: 'deleteSubtree',
    occurrenceId: 'row-2',
  }));
  assert.deepEqual(selectionEvents.events.at(-1).selection.activeCell, {
    occurrenceId: 'row-1',
    columnId: 'name',
  });

  expectOk(await editor.undo());
  assert.deepEqual(selectionEvents.events.at(-1).selection.activeCell, {
    occurrenceId: 'row-2',
    columnId: 'name',
  });
  expectOk(await editor.redo());
  assert.deepEqual(selectionEvents.events.at(-1).selection.activeCell, {
    occurrenceId: 'row-1',
    columnId: 'name',
  });
});

test('keyboard structural movement and subtree deletion are atomic and undoable', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'tree-move-live-region',
    rowHeight: 28,
    renderer: {
      liveRegion: { politeMinIntervalMs: 0 },
      labels: { liveRegion: { treeMoveCompleted: 'Tree structure updated.' } },
    },
  });
  t.after(() => editor.destroy());
  const { container, grid, window } = await mountFocusedGrid(editor);
  const settle = async () => {
    await turn();
    await turn();
    window.flushAnimationFrames();
  };
  const key = (value, extras = {}) => fakeEvent('keydown', {
    key: value,
    keyCode: value === 'Delete' ? 46 : 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    ...extras,
  });

  const polite = container.querySelector('[data-bom-live-region="polite"]');
  assert.ok(polite);
  grid.dispatchEvent(key('ArrowUp', { altKey: true }));
  await settle();
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]'),
    null,
  );

  grid.dispatchEvent(key('ArrowDown'));
  window.flushAnimationFrames();
  assert.equal(editor.getSnapshot().roots[1], 'row-2');

  grid.dispatchEvent(key('ArrowUp', { altKey: true }));
  await settle();
  assert.deepEqual(editor.getSnapshot().roots, ['row-2', 'row-1']);
  assert.equal(node(editor.getSnapshot(), 'row-2').parentId, null);
  assert.equal(
    polite
      .querySelector('[data-bom-live-region-message="polite"]')
      .textContent,
    'Tree structure updated.',
  );

  grid.dispatchEvent(key('ArrowDown', { altKey: true }));
  await settle();
  assert.deepEqual(editor.getSnapshot().roots, ['row-1', 'row-2']);

  grid.dispatchEvent(key('ArrowRight', { altKey: true }));
  await settle();
  assert.deepEqual(editor.getSnapshot().roots, ['row-1']);
  assert.equal(node(editor.getSnapshot(), 'row-2').parentId, 'row-1');

  grid.dispatchEvent(key('ArrowLeft', { altKey: true }));
  await settle();
  assert.deepEqual(editor.getSnapshot().roots, ['row-1', 'row-2']);
  assert.equal(node(editor.getSnapshot(), 'row-2').parentId, null);

  grid.dispatchEvent(key('Delete', { shiftKey: true }));
  await settle();
  assert.deepEqual(editor.getSnapshot().roots, ['row-1']);
  assert.equal(editor.getSnapshot().nodes.length, 1);

  expectOk(await editor.undo());
  assert.deepEqual(editor.getSnapshot().roots, ['row-1', 'row-2']);
  expectOk(await editor.redo());
  assert.deepEqual(editor.getSnapshot().roots, ['row-1']);
});

test('pointer tree drag commits one moveSubtree transaction and restores through Undo/Redo', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'pointer-tree-move-editor',
    rowHeight: 28,
    renderer: {
      liveRegion: { politeMinIntervalMs: 0 },
      labels: { liveRegion: { treeMoveCompleted: 'Tree structure updated.' } },
    },
  });
  t.after(() => editor.destroy());
  const { container, grid, window } = await mountFocusedGrid(editor);
  const settle = async () => {
    await turn();
    await turn();
    window.flushAnimationFrames();
  };
  const committedEvents = recordEvents(editor, ['transactionCommitted']);
  t.after(() => committedEvents.stop());
  const polite = container.querySelector('[data-bom-live-region="polite"]');
  assert.ok(polite);

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
    clientY: 90,
  }));
  // A drag preview is view-only until the release edge.
  assert.deepEqual(editor.getSnapshot().roots, ['row-1', 'row-2']);
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 91,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 90,
  }));
  await settle();

  assert.deepEqual(editor.getSnapshot().roots, ['row-2', 'row-1']);
  assert.equal(committedEvents.events.length, 1);
  const committed = committedEvents.events.at(-1);
  assert.equal(committed.origin, 'editor:move-subtree-pointer');
  assert.equal(committed.patch.operations[0].op, 'moveSubtree');
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]')?.textContent,
    'Tree structure updated.',
  );

  expectOk(await editor.undo({ origin: 'test:pointer-tree-move:undo' }));
  assert.deepEqual(editor.getSnapshot().roots, ['row-1', 'row-2']);
  expectOk(await editor.redo({ origin: 'test:pointer-tree-move:redo' }));
  assert.deepEqual(editor.getSnapshot().roots, ['row-2', 'row-1']);
});

test('partial Snapshot hands keyboard structural movement to the host without a local transaction', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createPartialSnapshot(),
    instanceId: 'partial-keyboard-structure-request',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const requests = [];
  const unsubscribe = editor.on('structureMoveRequested', (event) => {
    requests.push(event);
  });
  t.after(unsubscribe);
  const before = editor.getSnapshot();
  const { grid, window } = await mountFocusedGrid(editor);
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    keyCode: 40,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  }));
  await turn();
  window.flushAnimationFrames();

  assert.equal(requests.length, 1);
  const event = requests[0];
  assert.equal(event.type, 'structureMoveRequested');
  assert.equal(event.request.protocol, 'bom-structure-move-request/v1');
  assert.equal(event.request.documentId, before.documentId);
  assert.equal(event.request.documentGeneration, 0);
  assert.equal(event.request.baseRevision, before.revision);
  assert.equal(event.request.sourceRevision, before.sourceRevision);
  assert.deepEqual(event.request.occurrenceIds, ['row-1']);
  assert.deepEqual(event.request.intent, { kind: 'keyboard', direction: 'down' });
  assert.equal(event.request.reason, 'partial-snapshot');
  assert.equal(Object.isFrozen(event.request), true);
  assert.equal(Object.isFrozen(event.request.occurrenceIds), true);
  assert.equal(editor.getSnapshot(), before);
  assert.equal(editor.getSnapshot().revision, 'partial-revision');
});

test('partial Snapshot emits a controlled pointer structure request through the component output', async (t) => {
  const requests = [];
  const documentChanges = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createPartialSnapshot(),
    instanceId: 'partial-pointer-structure-request',
    rowHeight: 28,
    outputs: {
      onStructureMoveRequest(event) {
        requests.push(event);
      },
      onDocumentChange(event) {
        documentChanges.push(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);
  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  const before = createPartialSnapshot();

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 191,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 191,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 90,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 191,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 90,
  }));
  await flushComponentOutputs();

  assert.equal(requests.length, 1);
  const event = requests[0];
  assert.equal(event.request.protocol, 'bom-structure-move-request/v1');
  assert.deepEqual(event.request.occurrenceIds, ['row-1']);
  assert.deepEqual(event.request.intent, {
    kind: 'pointer',
    targetOccurrenceId: 'row-2',
    position: 'after',
  });
  assert.equal(event.request.baseRevision, before.revision);
  assert.equal(documentChanges.length, 0);

  const authoritative = createSnapshot({
    revision: 'partial-authoritative-revision',
    sourceRevision: 'partial-authoritative-source',
  });
  authoritative.roots = ['row-2', 'row-1'];
  authoritative.nodes[0].positionKey = 'B';
  authoritative.nodes[1].positionKey = 'A';
  expectOk(await component.update({
    document: authoritative,
    structureMoveRequestId: event.request.requestId,
  }));
  assert.equal(documentChanges.length, 0);

  const staleResponse = createSnapshot({ revision: 'partial-stale-response' });
  const stale = await component.update({
    document: staleResponse,
    structureMoveRequestId: event.request.requestId,
  });
  expectError(stale, BOM_EDITOR_ERROR_CODES.structureMoveStale);
});

test('multi-row pointer tree drag commits one ordered batch and undoes atomically', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(4, 'multi-tree-document'),
    instanceId: 'multi-pointer-tree-move-editor',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);
  const settle = async () => {
    await turn();
    await turn();
    window.flushAnimationFrames();
  };
  const rowHeader = (clientY, extras = {}) => fakeEvent('pointerdown', {
    button: 0,
    pointerType: 'mouse',
    clientX: 20,
    clientY,
    ...extras,
  });

  grid.dispatchEvent(rowHeader(50, { pointerId: 101 }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 101,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(rowHeader(78, { pointerId: 102, shiftKey: true }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 102,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 78,
  }));

  grid.dispatchEvent(rowHeader(50, { pointerId: 103 }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 103,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 121,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 103,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 121,
  }));
  await settle();

  assert.deepEqual(editor.getSnapshot().roots, [
    'flat-row-2',
    'flat-row-0',
    'flat-row-1',
    'flat-row-3',
  ]);
  const committed = editor.getSnapshot();
  assert.equal(committed.roots.length, 4);
  expectOk(await editor.undo({ origin: 'test:multi-tree-undo' }));
  assert.deepEqual(editor.getSnapshot().roots, [
    'flat-row-0',
    'flat-row-1',
    'flat-row-2',
    'flat-row-3',
  ]);
  expectOk(await editor.redo({ origin: 'test:multi-tree-redo' }));
  assert.deepEqual(editor.getSnapshot().roots, [
    'flat-row-2',
    'flat-row-0',
    'flat-row-1',
    'flat-row-3',
  ]);
});

test('Shift+Delete removes a selected row range as one structural batch', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(4, 'multi-delete-document'),
    instanceId: 'multi-delete-tree-editor',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);
  const settle = async () => {
    await turn();
    await turn();
    window.flushAnimationFrames();
  };
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 111,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 111,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 112,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 78,
    shiftKey: true,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 112,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 78,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'Delete',
    keyCode: 46,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    repeat: false,
  }));
  await settle();
  assert.deepEqual(editor.getSnapshot().roots, ['flat-row-2', 'flat-row-3']);
  expectOk(await editor.undo({ origin: 'test:multi-delete-undo' }));
  assert.deepEqual(editor.getSnapshot().roots, [
    'flat-row-0',
    'flat-row-1',
    'flat-row-2',
    'flat-row-3',
  ]);
});

test('pointer tree drag expands a collapsed inside target before committing', async (t) => {
  const snapshot = createTreeSnapshot();
  snapshot.knownRootCount = 2;
  snapshot.roots.push('source');
  snapshot.nodes.push({
    occurrenceId: 'source',
    kind: 'material',
    materialCode: 'MAT-source',
    parentId: null,
    positionKey: 'B',
    childrenState: 'complete',
    knownChildCount: 0,
    fields: { name: 'Source', note: 'Source note' },
  });
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'pointer-tree-expand-target',
    rowHeight: 28,
    renderer: {
      liveRegion: { politeMinIntervalMs: 0 },
      labels: { liveRegion: { treeMoveCompleted: 'Tree structure updated.' } },
    },
  });
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);
  const settle = async () => {
    await turn();
    await turn();
    window.flushAnimationFrames();
  };

  assert.equal(editor.getDiagnostics().visibleRows, 2);
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 92,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 78,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 92,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 92,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 50,
  }));
  await settle();

  assert.equal(node(editor.getSnapshot(), 'source').parentId, 'root');
  assert.equal(editor.getDiagnostics().visibleRows, 3);
  assert.deepEqual(editor.getSnapshot().roots, ['root']);
});

test('Insert and Primary+Insert duplicate the focused node as sibling or child', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);
  const settle = async () => {
    await turn();
    await turn();
    window.flushAnimationFrames();
  };
  const key = (extras = {}) => fakeEvent('keydown', {
    key: 'Insert',
    keyCode: 45,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    ...extras,
  });

  grid.dispatchEvent(key());
  await settle();
  const siblingId = 'editor-test:insert:1';
  assert.deepEqual(editor.getSnapshot().roots, [
    'row-1',
    siblingId,
    'row-2',
  ]);
  assert.equal(editor.getSnapshot().nodes.length, 3);
  assert.deepEqual(node(editor.getSnapshot(), siblingId).fields, {
    name: 'Part one',
    note: 'initial',
  });

  grid.dispatchEvent(key({ ctrlKey: true }));
  await settle();
  const childId = 'editor-test:insert:2';
  assert.deepEqual(editor.getSnapshot().roots, ['row-1', siblingId, 'row-2']);
  assert.equal(node(editor.getSnapshot(), childId).parentId, siblingId);
  assert.equal(editor.getSnapshot().nodes.length, 4);

  expectOk(await editor.undo());
  assert.equal(editor.getSnapshot().nodes.length, 3);
  expectOk(await editor.undo());
  assert.deepEqual(editor.getSnapshot().roots, ['row-1', 'row-2']);
});

test('tree expansion shortcuts update the projection without changing the document', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createTreeSnapshot(),
    instanceId: 'editor-expansion-shortcuts',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const beforeRevision = editor.getSnapshot().revision;
  const { grid, window } = await mountFocusedGrid(editor);
  const settle = async () => {
    await turn();
    await turn();
    window.flushAnimationFrames();
  };
  const expansionKey = (key) => fakeEvent('keydown', {
    key,
    keyCode: key === 'ArrowDown' ? 40 : 38,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    isComposing: false,
    repeat: false,
  });

  assert.equal(editor.getDiagnostics().visibleRows, 1);
  grid.dispatchEvent(expansionKey('ArrowDown'));
  await settle();
  assert.equal(editor.getDiagnostics().visibleRows, 2);
  assert.equal(editor.getSnapshot().revision, beforeRevision);

  grid.dispatchEvent(expansionKey('ArrowUp'));
  await settle();
  assert.equal(editor.getDiagnostics().visibleRows, 1);
  assert.equal(editor.getSnapshot().revision, beforeRevision);
});

test('a failed command batch is atomic across snapshot, revision, and events', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const snapshotBefore = editor.getSnapshot();
  const hashBefore = contentHash(snapshotBefore);
  const events = recordEvents(editor, [
    'beforeTransaction',
    'transactionCommitted',
    'transactionRejected',
    'documentChanged',
  ]);

  const result = await editor.transaction(
    (transaction) => {
      transaction.execute({
        type: 'setField',
        occurrenceId: 'row-1',
        fieldPath: ['note'],
        value: 'must-not-leak',
      });
      transaction.execute({
        type: 'unsetField',
        occurrenceId: 'row-1',
        fieldPath: ['name'],
        expectedPresent: true,
      });
    },
    { label: 'invalid batch', origin: 'test:invalid-batch' },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'BOM_FIELD_REQUIRED');
  assert.equal(editor.getSnapshot(), snapshotBefore);
  assert.equal(editor.getSnapshot().revision, snapshotBefore.revision);
  assert.equal(contentHash(editor.getSnapshot()), hashBefore);
  assert.deepEqual(
    events.events.map((event) => event.type),
    ['transactionRejected'],
  );
  assert.equal(events.events[0].baseRevision, snapshotBefore.revision);
});

test('nested transactions fold into one lexical, undoable commit', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'beforeTransaction',
    'transactionCommitted',
    'transactionRejected',
    'documentChanged',
  ]);
  let nestedPromise;
  const outerPromise = editor.transaction((transaction) => {
    transaction.execute({
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'outer-before',
    });
    transaction.transaction((nested) => {
      nested.execute({
        type: 'setField',
        occurrenceId: 'row-2',
        fieldPath: ['note'],
        value: 'nested-builder',
      });
      nested.transaction((deep) => {
        deep.execute({
          type: 'setField',
          occurrenceId: 'row-1',
          fieldPath: ['name'],
          value: 'nested-deep',
        });
      });
    });
    nestedPromise = editor.transaction((nested) => {
      nested.execute({
        type: 'setField',
        occurrenceId: 'row-2',
        fieldPath: ['name'],
        value: 'nested-api',
      });
    });
    transaction.execute({
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'outer-after',
    });
  }, { origin: 'test:nested' });

  const [outerResult, nestedResult] = await Promise.all([
    outerPromise,
    nestedPromise,
  ]);
  const outer = expectOk(outerResult);
  const nested = expectOk(nestedResult);
  assert.equal(nested.transactionId, outer.transactionId);
  assert.deepEqual(
    outer.patch.operations.map((operation) => operation.fieldPath?.join('.')),
    ['note', 'note', 'name', 'name', 'note'],
  );
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'outer-after');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'nested-deep');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'nested-builder');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.name, 'nested-api');
  assert.deepEqual(
    events.events.map((event) => event.type),
    ['beforeTransaction', 'transactionCommitted', 'documentChanged'],
  );

  expectOk(await editor.undo());
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal(Object.hasOwn(node(editor.getSnapshot(), 'row-2').fields, 'note'), false);
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.name, 'Part two');
  events.stop();
});

test('nested transaction builder failures reject atomically and emit one rejection', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();
  const events = recordEvents(editor, [
    'beforeTransaction',
    'transactionCommitted',
    'transactionRejected',
    'documentChanged',
  ]);
  const result = await editor.transaction((transaction) => {
    transaction.execute({
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'must-not-commit',
    });
    transaction.transaction(() => {
      throw new Error('nested builder failure');
    });
  }, { origin: 'test:nested-failure' });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
  assert.equal(editor.getSnapshot(), before);
  assert.deepEqual(
    events.events.map((event) => event.type),
    ['transactionRejected'],
  );
  assert.equal(events.events[0].transactionId.includes('batch:'), true);
  events.stop();
});

test('empty and asynchronous transaction builders fail with stable errors', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const empty = await editor.transaction(() => {});
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, BOM_EDITOR_ERROR_CODES.transactionEmpty);

  const asynchronous = await editor.transaction(async (transaction) => {
    transaction.execute({
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'must-not-commit',
    });
    await Promise.resolve();
  });
  assert.equal(asynchronous.ok, false);
  assert.equal(
    asynchronous.error.code,
    BOM_EDITOR_ERROR_CODES.transactionBuilderAsync,
  );
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
});

test('setDocument is a FIFO barrier and advances documentGeneration', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'beforeTransaction',
    'transactionCommitted',
    'documentChanged',
    'beforeDocumentReplace',
    'documentReplaced',
    'selectionChanged',
  ]);
  const nextDocument = createSnapshot({
    documentId: 'document-b',
    revision: 'revision-b',
    firstId: 'row-new',
    secondId: 'row-new-2',
    firstName: 'New part',
    secondName: 'New second part',
    firstNote: 'new initial',
  });

  const beforeBarrier = editor.execute(
    {
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'old document update',
    },
    { origin: 'test:before-barrier' },
  );
  const barrier = editor.setDocument(nextDocument);
  const afterBarrier = editor.execute(
    {
      type: 'setField',
      occurrenceId: 'row-new',
      fieldPath: ['note'],
      value: 'new document update',
    },
    { origin: 'test:after-barrier' },
  );

  const [beforeResult, replaceResult, afterResult] = await Promise.all([
    beforeBarrier,
    barrier,
    afterBarrier,
  ]);
  expectOk(beforeResult);
  expectOk(replaceResult);
  expectOk(afterResult);

  assert.equal(editor.getSnapshot().documentId, 'document-b');
  assert.equal(node(editor.getSnapshot(), 'row-new').fields.note, 'new document update');
  assert.equal(editor.getDiagnostics().documentGeneration, 1);
  assert.deepEqual(
    events.events.map((event) => event.type),
    [
      'beforeTransaction',
      'transactionCommitted',
      'documentChanged',
      'beforeDocumentReplace',
      'documentReplaced',
      'selectionChanged',
      'beforeTransaction',
      'transactionCommitted',
      'documentChanged',
    ],
  );
  const committed = events.events.filter(
    (event) => event.type === 'transactionCommitted',
  );
  assert.deepEqual(
    committed.map((event) => [event.documentId, event.documentGeneration]),
    [
      ['document-a', 0],
      ['document-b', 1],
    ],
  );
  const replaced = events.events.find((event) => event.type === 'documentReplaced');
  assert.deepEqual(
    [replaced.previous.documentId, replaced.previous.generation],
    ['document-a', 0],
  );
  assert.deepEqual(
    [replaced.next.documentId, replaced.next.generation],
    ['document-b', 1],
  );
  const selectionChange = events.events.find(
    (event) => event.type === 'selectionChanged',
  );
  assert.equal(selectionChange.reason, 'document-change');
  assert.deepEqual(selectionChange.previous, {
    activeCell: { occurrenceId: 'row-1', columnId: 'name' },
    range: null,
  });
  assert.deepEqual(selectionChange.selection, {
    activeCell: { occurrenceId: 'row-new', columnId: 'name' },
    range: null,
  });
});

test('remote DataSource queries bind the active source revision and remain read-only', async (t) => {
  const calls = [];
  const controlled = controlledDataSource({
    remoteChanges: false,
    remoteQuery: true,
    query(request) {
      calls.push(request);
      return Promise.resolve({
        occurrenceIds: ['row-2', 'row-1'],
        nextCursor: 'cursor-2',
        sourceRevision: 'source-0',
      });
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'remote-query-editor',
  );
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();

  const result = expectOk(await editor.queryDataSource({
    expression: {
      op: 'contains',
      fieldId: 'name',
      value: 'Part',
    },
    sort: [{ fieldId: 'name', direction: 'asc' }],
    limit: 25,
  }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedSourceRevision, 'source-0');
  assert.equal(calls[0].signal.aborted, false);
  assert.deepEqual(result.occurrenceIds, ['row-2', 'row-1']);
  assert.equal(result.nextCursor, 'cursor-2');
  assert.equal(result.sourceRevision, 'source-0');
  assert.equal(result.documentId, 'document-a');
  assert.equal(result.documentGeneration, 1);
  assert.equal(editor.getSnapshot(), before);
});

test('stale remote query result triggers a source resync without applying data', async (t) => {
  const controlled = controlledDataSource({
    remoteChanges: false,
    remoteQuery: true,
    query() {
      return Promise.resolve({
        occurrenceIds: ['row-1'],
        sourceRevision: 'source-1',
      });
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'stale-remote-query-editor',
  );
  t.after(() => editor.destroy());
  controlled.setSnapshot(createSnapshot({ sourceRevision: 'source-1' }));
  const before = editor.getSnapshot();

  expectError(
    await editor.queryDataSource({ limit: 10 }),
    BOM_EDITOR_ERROR_CODES.dataSourceQueryStale,
  );
  for (let index = 0; index < 5; index += 1) await turn();

  assert.equal(editor.getSnapshot().documentId, before.documentId);
  assert.equal(editor.getSnapshot().sourceRevision, 'source-1');
  assert.equal(controlled.loadCount, 2);
});

test('aborting a remote DataSource query aborts its source signal and preserves the document', async (t) => {
  const pending = deferred();
  let sourceSignal;
  const controlled = controlledDataSource({
    remoteChanges: false,
    remoteQuery: true,
    query(request) {
      sourceSignal = request.signal;
      return pending.promise;
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'abort-remote-query-editor',
  );
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();
  const controller = new AbortController();
  const querying = editor.queryDataSource({ limit: 10, signal: controller.signal });
  await turn();
  controller.abort();

  expectError(
    await querying,
    BOM_EDITOR_ERROR_CODES.aborted,
  );
  assert.equal(sourceSignal.aborted, true);
  assert.equal(editor.getSnapshot(), before);
  pending.resolve({ occurrenceIds: ['row-1'], sourceRevision: 'source-0' });
});

test('lazy DataSource child pages stage atomically and retain a stable selection', async (t) => {
  const pages = [];
  const controlled = controlledDataSource({
    snapshot: createLazyChildrenSnapshot(),
    writable: false,
    remoteChanges: false,
    lazyChildren: true,
    loadChildren(request) {
      pages.push(request);
      if (request.cursor === undefined) {
        return Promise.resolve({
          items: [{
            occurrenceId: 'lazy-child-1',
            kind: 'material',
            materialCode: 'MAT-LAZY-1',
            parentId: 'lazy-root',
            positionKey: 'A',
            childrenState: 'complete',
            knownChildCount: 0,
            fields: { name: 'Child one', note: 'first' },
          }],
          nextCursor: 'page-2',
          sourceRevision: 'lazy-source-0',
          complete: false,
        });
      }
      return Promise.resolve({
        items: [{
          occurrenceId: 'lazy-child-2',
          kind: 'material',
          materialCode: 'MAT-LAZY-2',
          parentId: 'lazy-root',
          positionKey: 'B',
          childrenState: 'complete',
          knownChildCount: 0,
          fields: { name: 'Child two', note: 'second' },
        }],
        sourceRevision: 'lazy-source-0',
        complete: true,
      });
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'lazy-children-editor',
  );
  t.after(() => editor.destroy());
  const replaced = recordEvents(editor, ['documentReplaced']);
  expectOk(editor.focusCell({ occurrenceId: 'lazy-root', columnId: 'name' }));

  const first = expectOk(await editor.loadDataSourceChildren('lazy-root'));
  assert.equal(first.page.complete, false);
  assert.equal(first.page.nextCursor, 'page-2');
  assert.equal(first.documentGeneration, 2);
  assert.equal(node(editor.getSnapshot(), 'lazy-root').childrenState, 'partial');
  assert.equal(node(editor.getSnapshot(), 'lazy-root').knownChildCount, 2);
  assert.equal(node(editor.getSnapshot(), 'lazy-child-1').fields.note, 'first');
  assert.equal(replaced.events.at(-1).reason, 'loadChildren');

  const second = expectOk(await editor.loadDataSourceChildren('lazy-root', {
    cursor: first.page.nextCursor,
  }));
  assert.equal(second.page.complete, true);
  assert.equal(second.documentGeneration, 3);
  assert.equal(node(editor.getSnapshot(), 'lazy-root').childrenState, 'complete');
  assert.equal(node(editor.getSnapshot(), 'lazy-root').knownChildCount, 2);
  assert.equal(node(editor.getSnapshot(), 'lazy-child-2').fields.name, 'Child two');
  assert.deepEqual(
    pages.map((request) => request.cursor),
    [undefined, 'page-2'],
  );
  assert.deepEqual(
    pages.map((request) => request.expectedSourceRevision),
    ['lazy-source-0', 'lazy-source-0'],
  );
  assert.deepEqual(editor.getSnapshot().roots, ['lazy-root']);
});

test('an invalid lazy page cannot alter the active partial Snapshot', async (t) => {
  const controlled = controlledDataSource({
    snapshot: createLazyChildrenSnapshot(),
    writable: false,
    remoteChanges: false,
    lazyChildren: true,
    loadChildren() {
      return Promise.resolve({
        items: [{
          occurrenceId: 'wrong-parent-child',
          kind: 'material',
          parentId: 'not-the-requested-parent',
          positionKey: 'A',
          childrenState: 'complete',
          knownChildCount: 0,
          fields: { name: 'Invalid', note: 'invalid' },
        }],
        sourceRevision: 'lazy-source-0',
        complete: true,
      });
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'invalid-lazy-page-editor',
  );
  t.after(() => editor.destroy());

  expectError(
    await editor.loadDataSourceChildren('lazy-root'),
    BOM_EDITOR_ERROR_CODES.dataSourcePageInvalid,
  );
  for (let index = 0; index < 4; index += 1) await turn();
  assert.equal(
    editor.getSnapshot().nodes.some(
      (candidate) => candidate.occurrenceId === 'wrong-parent-child',
    ),
    false,
  );
  assert.equal(node(editor.getSnapshot(), 'lazy-root').childrenState, 'unloaded');
});

test('writable DataSource commits locally, persists FIFO, and treats own echo as idempotent', async (t) => {
  const controlled = controlledDataSource();
  const { editor } = await mountDataSourceEditor(controlled.source);
  t.after(() => editor.destroy());
  const persistence = recordEvents(editor, ['transactionPersistenceChanged']);

  const first = expectOk(await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'local-first',
  }, { origin: 'test:source:first' }));
  const second = expectOk(await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'local-second',
  }, { origin: 'test:source:second' }));

  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'local-second');
  assert.equal(editor.getSnapshot().sourceRevision, 'source-0');
  assert.ok(first.patch.idempotencyKey);
  assert.ok(second.patch.idempotencyKey);
  assert.equal(second.patch.dependsOnTransactionId, first.transactionId);
  assert.deepEqual(
    persistence.events.map((event) => event.state),
    ['localApplied', 'pending', 'localApplied', 'pending'],
  );
  await turn();
  assert.equal(controlled.commits.length, 1);
  assert.equal(
    controlled.commits[0].request.expectedSourceRevision,
    'source-0',
  );

  const revisionBeforeEcho = editor.getSnapshot().revision;
  controlled.emit({
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    sourceTransactionId: first.transactionId,
    sequence: 1,
    previousSourceRevision: 'source-0',
    sourceRevision: 'source-1',
    operations: first.patch.operations,
  });
  await turn();
  assert.equal(editor.getSnapshot().revision, revisionBeforeEcho);

  controlled.commits[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  await turn();
  assert.equal(editor.getSnapshot().sourceRevision, 'source-1');
  assert.equal(controlled.commits.length, 2);
  assert.equal(
    controlled.commits[1].request.expectedSourceRevision,
    'source-1',
  );
  controlled.commits[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  await turn();
  assert.equal(editor.getSnapshot().sourceRevision, 'source-2');
  assert.deepEqual(
    persistence.events
      .filter((event) => event.state === 'acknowledged')
      .map((event) => event.transactionId),
    [first.transactionId, second.transactionId],
  );
});

test('delayed own echoes remain valid after later acknowledgements', async (t) => {
  const controlled = controlledDataSource();
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'delayed-own-echo-editor',
  );
  t.after(() => editor.destroy());

  const first = expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'one',
  }));
  const second = expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'two',
  }));
  await turn();
  controlled.commits[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  for (let index = 0; index < 2; index += 1) await turn();
  controlled.commits[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  for (let index = 0; index < 2; index += 1) await turn();

  controlled.emit({
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    sourceTransactionId: first.transactionId,
    sequence: 1,
    previousSourceRevision: 'source-0',
    sourceRevision: 'source-1',
    operations: first.patch.operations,
  });
  await turn();
  controlled.emit({
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    sourceTransactionId: second.transactionId,
    sequence: 2,
    previousSourceRevision: 'source-1',
    sourceRevision: 'source-2',
    operations: second.patch.operations,
  });
  for (let index = 0; index < 2; index += 1) await turn();

  assert.equal(editor.getSnapshot().sourceRevision, 'source-2');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'two');
  assert.equal(controlled.loadCount, 1);
});

test('an enqueue failure never publishes an optimistic orphan commit', async (t) => {
  const controlled = controlledDataSource({ remoteChanges: false });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'enqueue-failure-editor',
  );
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'transactionCommitted',
    'documentChanged',
  ]);

  const first = expectOk(await editor.applyPatch({
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    baseRevision: editor.getSnapshot().revision,
    transactionId: 'duplicate-idempotency-first',
    origin: 'test:duplicate-idempotency',
    timestamp: '2026-07-21T00:00:00.000Z',
    idempotencyKey: 'duplicate-idempotency-key',
    operations: [{
      op: 'updateField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'one',
    }],
  }));
  const failed = await editor.applyPatch({
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    baseRevision: editor.getSnapshot().revision,
    transactionId: 'duplicate-idempotency-second',
    origin: 'test:duplicate-idempotency',
    timestamp: '2026-07-21T00:00:01.000Z',
    idempotencyKey: 'duplicate-idempotency-key',
    operations: [{
      op: 'updateField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'two',
    }],
  });

  assert.equal(failed.ok, false);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'one');
  assert.equal(editor.getSnapshot().revision, first.revision);
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    1,
  );
  assert.equal(
    events.events.filter((event) => event.type === 'documentChanged').length,
    1,
  );
});

test('read-only DataSource rejects mutation without calling commit', async (t) => {
  const controlled = controlledDataSource({
    writable: false,
    remoteChanges: false,
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'readonly-source-editor',
  );
  t.after(() => editor.destroy());

  expectError(await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'denied',
  }), BOM_EDITOR_ERROR_CODES.sourceReadOnly);
  assert.equal(controlled.commits.length, 0);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
});

test('remote subscription applies one external patch, ignores exact duplicate, and reloads once on a gap', async (t) => {
  const controlled = controlledDataSource();
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'remote-sequence-editor',
  );
  t.after(() => editor.destroy());
  const remote = {
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    sourceTransactionId: 'remote-tx-1',
    sequence: 1,
    previousSourceRevision: 'source-0',
    sourceRevision: 'source-1',
    operations: [{
      op: 'updateField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'remote-value',
    }],
  };
  controlled.emit(remote);
  await turn();
  const remoteRevision = editor.getSnapshot().revision;
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'remote-value');
  assert.equal(editor.getSnapshot().sourceRevision, 'source-1');

  controlled.emit(remote);
  await turn();
  assert.equal(editor.getSnapshot().revision, remoteRevision);
  expectError(await editor.undo(), BOM_EDITOR_ERROR_CODES.persistenceSuspended);

  controlled.emit({
    ...remote,
    sourceTransactionId: 'remote-tx-3',
    sequence: 3,
    previousSourceRevision: 'source-1',
    sourceRevision: 'source-3',
  });
  controlled.emit({
    ...remote,
    sourceTransactionId: 'remote-tx-4',
    sequence: 4,
    previousSourceRevision: 'source-3',
    sourceRevision: 'source-4',
  });
  for (let index = 0; index < 4; index += 1) await turn();
  assert.equal(controlled.loadCount, 2);
  assert.equal(controlled.unsubscribeCount, 1);
  assert.equal(editor.getDiagnostics().documentGeneration, 2);
});

test('synchronous resync during subscribe disposes the just-created subscription', async (t) => {
  let subscriptions = 0;
  const controlled = controlledDataSource({
    onSubscribe(observer) {
      subscriptions += 1;
      if (subscriptions === 1) observer.resyncRequired('source-1');
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'synchronous-resync-editor',
  );
  t.after(() => editor.destroy());
  for (let index = 0; index < 5; index += 1) await turn();

  assert.equal(controlled.unsubscribeCount, 1);
  assert.equal(controlled.loadCount, 2);
  assert.equal(subscriptions, 2);
  assert.equal(editor.getDiagnostics().documentGeneration, 2);
});

test('explicit rejection atomically removes the parent and replays its descendant', async (t) => {
  const controlled = controlledDataSource({ remoteChanges: false });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'source-reconcile-editor',
  );
  t.after(() => editor.destroy());
  const persistence = recordEvents(editor, ['transactionPersistenceChanged']);
  const first = expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'one',
  }));
  const second = expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'two',
  }));
  await turn();
  controlled.commits[0].pending.resolve({
    status: 'rejected',
    error: {
      code: 'TEST_REMOTE_REJECTED',
      category: 'VALIDATION',
      messageKey: 'test.remote_rejected',
      recoverable: true,
    },
  });
  for (let index = 0; index < 6; index += 1) await turn();

  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'two');
  assert.equal(controlled.commits.length, 2);
  assert.equal(controlled.commits[1].request.patch.transactionId, second.transactionId);
  assert.notEqual(
    controlled.commits[1].request.patch.baseRevision,
    second.patch.baseRevision,
  );
  assert.ok(
    persistence.events.some(
      (event) => event.transactionId === first.transactionId &&
        event.state === 'rejected',
    ),
  );
  assert.ok(
    persistence.events.some(
      (event) => event.transactionId === second.transactionId &&
        event.state === 'rebased',
    ),
  );
  controlled.commits[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  await turn();
  const undo = expectOk(await editor.undo({ origin: 'test:undo-replayed' }));
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
  assert.equal(undo.patch.dependsOnTransactionId, second.transactionId);
  await turn();
  assert.equal(controlled.commits.length, 3);
  controlled.commits[2].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  await turn();
});

test('a conflict without remoteOperations fails closed with a RecoveryBundle', async (t) => {
  const controlled = controlledDataSource({ remoteChanges: false });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'conflict-operations-missing-editor',
  );
  t.after(() => editor.destroy());
  const persistence = recordEvents(editor, ['transactionPersistenceChanged']);
  expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  controlled.commits[0].pending.resolve({
    status: 'conflicted', sourceRevision: 'source-1',
  });
  for (let index = 0; index < 6; index += 1) await turn();

  const recovery = persistence.events.find(
    (event) => event.state === 'reloadRequired' &&
      event.recoveryBundle !== undefined,
  );
  assert.ok(recovery);
  assert.equal(recovery.recoveryBundle.reason.code, 'BOM_EDITOR_REMOTE_RESYNC_REQUIRED');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'local');
});

test('a subscription envelope already applied during conflict reconciliation is not reapplied', async (t) => {
  const controlled = controlledDataSource();
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'pre-applied-conflict-envelope-editor',
  );
  t.after(() => editor.destroy());
  const committed = recordEvents(editor, ['transactionCommitted']);
  expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  const remoteOperations = [{
    op: 'updateField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'remote',
  }];
  controlled.commits[0].pending.resolve({
    status: 'conflicted',
    sourceRevision: 'source-1',
    remoteOperations,
  });
  for (let index = 0; index < 6; index += 1) await turn();
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'remote');
  const commitsBeforeEnvelope = committed.events.length;

  controlled.emit({
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    sourceTransactionId: 'remote-conflict-transaction',
    sequence: 1,
    previousSourceRevision: 'source-0',
    sourceRevision: 'source-1',
    operations: remoteOperations,
  });
  for (let index = 0; index < 2; index += 1) await turn();
  assert.equal(committed.events.length, commitsBeforeEnvelope);
  assert.equal(editor.getSnapshot().sourceRevision, 'source-1');
  assert.equal(controlled.loadCount, 1);
});

test('pending undo uses confirmed cancellation and ignores the original late response', async (t) => {
  const cancellation = deferred();
  const cancelRequests = [];
  const controlled = controlledDataSource({
    remoteChanges: false,
    cancelPendingCommit: true,
    cancelCommit(request) {
      cancelRequests.push(request);
      return cancellation.promise;
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'source-cancel-editor',
  );
  t.after(() => editor.destroy());
  const rolledBackValues = [];
  editor.on('transactionPersistenceChanged', (event) => {
    if (event.state === 'rolledBack') {
      rolledBackValues.push(node(editor.getSnapshot(), 'row-1').fields.note);
    }
  });
  const original = expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  const undoing = editor.undo({ origin: 'test:cancel-undo' });
  await turn();
  assert.equal(cancelRequests.length, 1);
  cancellation.resolve({ cancelled: true, sourceRevision: 'source-0' });
  expectOk(await undoing);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
  assert.deepEqual(rolledBackValues, ['initial']);

  controlled.commits[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'late-source',
  });
  await turn();
  assert.equal(editor.getSnapshot().sourceRevision, 'source-0');
  assert.equal(controlled.commits.length, 1);
  assert.equal(cancelRequests[0].transactionId, original.transactionId);
});

test('a cancelled own transaction echo fails closed and reloads', async (t) => {
  const cancellation = deferred();
  const controlled = controlledDataSource({
    cancelPendingCommit: true,
    cancelCommit() {
      return cancellation.promise;
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'cancelled-own-echo-editor',
  );
  t.after(() => editor.destroy());
  const original = expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  const undoing = editor.undo();
  await turn();
  cancellation.resolve({ cancelled: true, sourceRevision: 'source-0' });
  expectOk(await undoing);

  controlled.emit({
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    sourceTransactionId: original.transactionId,
    sequence: 1,
    previousSourceRevision: 'source-0',
    sourceRevision: 'source-1',
    operations: original.patch.operations,
  });
  for (let index = 0; index < 4; index += 1) await turn();
  assert.equal(controlled.loadCount, 2);
});

test('a rejected own transaction echo fails closed and reloads', async (t) => {
  const controlled = controlledDataSource();
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'rejected-own-echo-editor',
  );
  t.after(() => editor.destroy());
  const original = expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  controlled.commits[0].pending.resolve({
    status: 'rejected',
    error: {
      code: 'TEST_REMOTE_REJECTED',
      category: 'VALIDATION',
      messageKey: 'test.remote_rejected',
      recoverable: true,
    },
  });
  for (let index = 0; index < 4; index += 1) await turn();

  controlled.emit({
    protocolVersion: '1.0.0',
    documentId: 'document-a',
    sourceTransactionId: original.transactionId,
    sequence: 1,
    previousSourceRevision: 'source-0',
    sourceRevision: 'source-1',
    operations: original.patch.operations,
  });
  for (let index = 0; index < 4; index += 1) await turn();
  assert.equal(controlled.loadCount, 2);
});

test('declined pending cancellation waits for acknowledgement then persists a dependent compensation', async (t) => {
  const controlled = controlledDataSource({ remoteChanges: false });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'source-compensation-editor',
  );
  t.after(() => editor.destroy());
  const original = expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  const undoing = editor.undo({ origin: 'test:compensate' });
  let settled = false;
  void undoing.then(() => { settled = true; });
  await turn();
  assert.equal(settled, false);
  controlled.commits[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  const compensation = expectOk(await undoing);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
  assert.equal(
    compensation.patch.dependsOnTransactionId,
    original.transactionId,
  );
  await turn();
  assert.equal(controlled.commits.length, 2);
  assert.equal(
    controlled.commits[1].request.patch.dependsOnTransactionId,
    original.transactionId,
  );
  controlled.commits[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  await turn();
  expectError(await editor.redo(), BOM_EDITOR_ERROR_CODES.sourceBound);
});

test('a second Undo waits for a compensation instead of cancelling it', async (t) => {
  const cancelRequests = [];
  const controlled = controlledDataSource({
    remoteChanges: false,
    cancelPendingCommit: true,
    cancelCommit(request) {
      cancelRequests.push(request);
      return Promise.resolve({ cancelled: false });
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'second-undo-compensation-editor',
  );
  t.after(() => editor.destroy());
  expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  const firstUndo = editor.undo();
  await turn();
  assert.equal(cancelRequests.length, 1);
  controlled.commits[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  expectOk(await firstUndo);
  await turn();
  assert.equal(controlled.commits.length, 2);

  const secondUndo = editor.undo();
  await turn();
  assert.equal(cancelRequests.length, 1);
  controlled.commits[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  expectError(
    await secondUndo,
    BOM_TRANSACTION_ERROR_CODES.historyEmpty,
  );
});

test('a rejected compensation publishes a RecoveryBundle and can be recovered', async (t) => {
  const controlled = controlledDataSource({ remoteChanges: false });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'compensation-recovery-editor',
  );
  t.after(() => editor.destroy());
  const persistence = recordEvents(editor, ['transactionPersistenceChanged']);
  expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  controlled.commits[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  for (let index = 0; index < 2; index += 1) await turn();
  controlled.setSnapshot(createSnapshot({
    sourceRevision: 'source-1', firstNote: 'local',
  }));

  expectOk(await editor.undo({ origin: 'test:compensation-recovery' }));
  await turn();
  controlled.commits[1].pending.resolve({
    status: 'rejected',
    error: {
      code: 'TEST_COMPENSATION_REJECTED',
      category: 'VALIDATION',
      messageKey: 'test.compensation_rejected',
      recoverable: true,
    },
  });
  for (let index = 0; index < 6; index += 1) await turn();

  const recovery = persistence.events.find(
    (event) => event.state === 'reloadRequired' &&
      event.recoveryId !== undefined && event.recoveryBundle !== undefined,
  );
  assert.ok(recovery);
  assert.equal(recovery.retryable, false);
  assert.match(recovery.recoveryBundle.failedTransactionId, /:undo:2$/);
  expectOk(await editor.recoverPersistence());
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'local');
  assert.equal(controlled.loadCount, 2);
});

test('an aborted pending Undo releases the barrier and suspends persistence', async (t) => {
  const cancellation = deferred();
  const controlled = controlledDataSource({
    remoteChanges: false,
    cancelPendingCommit: true,
    cancelCommit() {
      return cancellation.promise;
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'aborted-pending-undo-editor',
  );
  t.after(() => editor.destroy());
  expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'local',
  }));
  await turn();
  const controller = new AbortController();
  const undoing = editor.undo({ signal: controller.signal });
  await turn();
  controller.abort();
  expectError(await undoing, BOM_EDITOR_ERROR_CODES.aborted);
  expectError(
    await editor.execute({
      type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'later',
    }),
    BOM_EDITOR_ERROR_CODES.persistenceSuspended,
  );
});

test('replaceSource abortAndRollback cancels the dependency chain before replacement', async (t) => {
  const cancelRequests = [];
  const controlled = controlledDataSource({
    remoteChanges: false,
    cancelPendingCommit: true,
    cancelCommit(request) {
      cancelRequests.push(request);
      return Promise.resolve({ cancelled: true, sourceRevision: 'source-0' });
    },
  });
  const { editor } = await mountDataSourceEditor(
    controlled.source,
    'abort-and-rollback-source-editor',
  );
  t.after(() => editor.destroy());
  expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'one',
  }));
  expectOk(await editor.execute({
    type: 'setField', occurrenceId: 'row-1', fieldPath: ['note'], value: 'two',
  }));
  await turn();
  assert.equal(controlled.commits.length, 1);

  expectOk(await editor.replaceSource(
    createSnapshot({ documentId: 'document-b', firstId: 'row-new' }),
    { pending: 'abortAndRollback' },
  ));
  assert.equal(editor.getSnapshot().documentId, 'document-b');
  assert.equal(node(editor.getSnapshot(), 'row-new').fields.note, 'initial');
  assert.equal(cancelRequests.length, 1);

  controlled.commits[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'late-source',
  });
  for (let index = 0; index < 2; index += 1) await turn();
  assert.equal(editor.getSnapshot().documentId, 'document-b');
});

test('replaceSource aborts promptly when a DataSource ignores load abort', async (t) => {
  const loading = deferred();
  const controlled = controlledDataSource({
    remoteChanges: false,
    loadDocument() {
      return loading.promise;
    },
  });
  const editor = createEditor();
  t.after(() => editor.destroy());
  const controller = new AbortController();
  const replacing = editor.replaceSource(controlled.source, {
    signal: controller.signal,
  });
  await turn();
  controller.abort();
  expectError(await replacing, BOM_EDITOR_ERROR_CODES.aborted);
  loading.resolve(createSnapshot({ documentId: 'late-document' }));
  for (let index = 0; index < 2; index += 1) await turn();
  assert.equal(editor.getSnapshot().documentId, 'document-a');
});

test('mount, unmount, remount, and destroy release DOM resources without losing the model', async () => {
  const editor = createEditor();
  const firstDom = createFakeDom(640, 280);
  const secondDom = createFakeDom(720, 300);
  const destroyed = [];
  editor.on('destroyed', (event) => destroyed.push(event));

  const firstMount = editor.mount(firstDom.container);
  await Promise.resolve();
  assert.equal(firstDom.window.pendingAnimationFrames(), 1);
  let readySettled = false;
  void editor.ready.then(() => {
    readySettled = true;
  });
  await Promise.resolve();
  assert.equal(readySettled, false);
  firstDom.window.flushAnimationFrames();
  expectOk(await firstMount);
  expectOk(await editor.ready);
  assert.equal(readySettled, true);
  const mountedDiagnostics = editor.getDiagnostics();
  assert.equal(mountedDiagnostics.lifecycle, 'ready');
  assert.ok(mountedDiagnostics.mountedResources > 0);
  assert.equal(
    mountedDiagnostics.resources.protocol,
    'bom-editor-resource-ledger/v1',
  );
  assert.equal(mountedDiagnostics.resources.renderer.disposed, false);
  assert.equal(mountedDiagnostics.resources.eventHub.activeCount, 1);
  assert.equal(
    mountedDiagnostics.resources.tasks.protocol,
    'bom-editor-task-ledger/v1',
  );
  assert.equal(mountedDiagnostics.resources.tasks.outstandingCount, 0);
  assert.equal(
    mountedDiagnostics.resources.workerTasks.protocol,
    'bom-editor-worker-task-ledger/v1',
  );
  assert.equal(mountedDiagnostics.resources.workerTasks.tracked, true);
  assert.equal(mountedDiagnostics.resources.workerTasks.queuedCount, 0);
  assert.equal(mountedDiagnostics.resources.workerTasks.runningCount, 0);
  assert.equal(mountedDiagnostics.resources.fullyTracked, true);
  assert.equal(mountedDiagnostics.resources.trackedResourcesReleased, false);
  assert.equal(firstDom.container.querySelectorAll('canvas').length, 3);

  expectOk(editor.unmount());
  expectOk(editor.unmount());
  const unmountedDiagnostics = editor.getDiagnostics();
  assert.equal(unmountedDiagnostics.lifecycle, 'created');
  assert.equal(unmountedDiagnostics.mountedResources, 0);
  assert.equal(unmountedDiagnostics.resources.renderer.disposed, true);
  assert.equal(unmountedDiagnostics.resources.renderer.activeCount, 0);
  assert.equal(unmountedDiagnostics.resources.eventHub.activeCount, 1);
  assert.equal(unmountedDiagnostics.resources.cleanupFailureCount, 0);
  assert.equal(
    firstDom.container.querySelector('[data-bom-canvas-renderer]'),
    null,
  );
  assert.equal(firstDom.window.listenerCount(), 0);
  assert.ok(firstDom.window.observers.every((observer) => observer.disconnected));

  expectOk(
    await editor.execute({
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'edited while headless',
    }),
  );
  const secondMount = editor.mount(secondDom.container);
  await Promise.resolve();
  secondDom.window.flushAnimationFrames();
  expectOk(await secondMount);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'edited while headless');
  assert.equal(secondDom.container.querySelectorAll('canvas').length, 3);

  editor.destroy();
  editor.destroy();
  const destroyedDiagnostics = editor.getDiagnostics();
  assert.equal(destroyedDiagnostics.lifecycle, 'destroyed');
  assert.equal(destroyedDiagnostics.mountedResources, 0);
  assert.equal(destroyedDiagnostics.resources.renderer.disposed, true);
  assert.equal(destroyedDiagnostics.resources.renderer.activeCount, 0);
  assert.equal(destroyedDiagnostics.resources.eventHub.activeCount, 0);
  assert.equal(destroyedDiagnostics.resources.eventHub.pendingAsyncCount, 0);
  assert.equal(destroyedDiagnostics.resources.tasks.queuedCount, 0);
  assert.equal(destroyedDiagnostics.resources.tasks.runningCount, 0);
  assert.equal(destroyedDiagnostics.resources.tasks.outstandingCount, 0);
  assert.equal(destroyedDiagnostics.resources.workerTasks.outstandingCount, 0);
  assert.equal(destroyedDiagnostics.resources.activeCount, 0);
  assert.equal(destroyedDiagnostics.resources.cleanupFailureCount, 0);
  assert.equal(destroyedDiagnostics.resources.fullyTracked, true);
  assert.equal(
    destroyedDiagnostics.resources.trackedResourcesReleased,
    true,
  );
  assert.equal(destroyed.length, 1);
  assert.equal(secondDom.container.querySelector('[data-bom-canvas-renderer]'), null);
  assert.equal(secondDom.window.listenerCount(), 0);
  assert.ok(secondDom.window.observers.every((observer) => observer.disconnected));
  expectError(editor.focus(), BOM_EDITOR_ERROR_CODES.destroyed);
  expectError(editor.unmount(), BOM_EDITOR_ERROR_CODES.destroyed);
  expectError(
    await editor.execute({
      type: 'setField',
      occurrenceId: 'row-1',
      fieldPath: ['note'],
      value: 'after destroy',
    }),
    BOM_EDITOR_ERROR_CODES.destroyed,
  );
});

test('editor retains renderer cleanup failures after dropping the renderer', async () => {
  const editor = createEditor();
  const { container, window } = createFakeDom(640, 280);
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  window.removeEventListener = () => {
    throw new Error('injected removeEventListener failure');
  };

  editor.destroy();

  const diagnostics = editor.getDiagnostics();
  const eventListeners = diagnostics.resources.renderer.kinds.find(
    (entry) => entry.kind === 'event-listener',
  );
  assert.equal(diagnostics.lifecycle, 'destroyed');
  assert.equal(diagnostics.resources.renderer.disposed, true);
  assert.equal(diagnostics.resources.renderer.activeCount, 0);
  assert.equal(diagnostics.resources.renderer.cleanupFailureCount, 1);
  assert.equal(eventListeners.cleanupFailureCount, 1);
  assert.equal(diagnostics.resources.cleanupFailureCount, 1);
  assert.equal(diagnostics.resources.activeCount, 0);
  assert.equal(diagnostics.resources.trackedResourcesReleased, false);
});

test('destroy remains unqualified while an async EventHub listener is pending', async () => {
  const editor = createEditor();
  let settle;
  const pending = new Promise((resolve) => {
    settle = resolve;
  });
  editor.on('destroyed', () => pending);

  editor.destroy();

  const pendingDiagnostics = editor.getDiagnostics();
  assert.equal(pendingDiagnostics.resources.eventHub.activeCount, 0);
  assert.equal(pendingDiagnostics.resources.eventHub.pendingAsyncCount, 1);
  assert.equal(pendingDiagnostics.resources.eventHub.outstandingCount, 1);
  assert.equal(pendingDiagnostics.resources.activeCount, 1);
  assert.equal(
    pendingDiagnostics.resources.trackedResourcesReleased,
    false,
  );

  settle();
  await pending;
  await Promise.resolve();

  const settledDiagnostics = editor.getDiagnostics();
  assert.equal(settledDiagnostics.resources.eventHub.pendingAsyncCount, 0);
  assert.equal(settledDiagnostics.resources.activeCount, 0);
  assert.equal(settledDiagnostics.resources.trackedResourcesReleased, true);
});

test('unmount and destroy invalidate a mount that has not committed its first frame', async () => {
  const unmountedEditor = createEditor();
  const unmountedDom = createFakeDom(640, 280);
  const pendingUnmountedMount = unmountedEditor.mount(unmountedDom.container);
  await Promise.resolve();
  assert.ok(
    unmountedDom.container.querySelector('[data-bom-canvas-renderer]'),
  );

  expectOk(unmountedEditor.unmount());
  unmountedDom.window.flushAnimationFrames();
  expectError(await pendingUnmountedMount, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(unmountedEditor.getDiagnostics().lifecycle, 'created');
  assert.equal(unmountedEditor.getDiagnostics().mountedResources, 0);
  assert.equal(
    unmountedDom.container.querySelector('[data-bom-canvas-renderer]'),
    null,
  );
  unmountedEditor.destroy();

  const destroyedEditor = createEditor();
  const destroyedDom = createFakeDom(640, 280);
  const pendingDestroyedMount = destroyedEditor.mount(destroyedDom.container);
  await Promise.resolve();
  assert.ok(
    destroyedDom.container.querySelector('[data-bom-canvas-renderer]'),
  );

  destroyedEditor.destroy();
  destroyedDom.window.flushAnimationFrames();
  expectError(await pendingDestroyedMount, BOM_EDITOR_ERROR_CODES.destroyed);
  expectError(await destroyedEditor.ready, BOM_EDITOR_ERROR_CODES.destroyed);
  assert.equal(destroyedEditor.getDiagnostics().lifecycle, 'destroyed');
  assert.equal(destroyedEditor.getDiagnostics().mountedResources, 0);
  assert.equal(
    destroyedDom.container.querySelector('[data-bom-canvas-renderer]'),
    null,
  );
});

test('destroy during initial DataSource load settles mount as destroyed', async () => {
  const dataSource = {
    capabilities: Object.freeze({
      streaming: false,
      lazyChildren: false,
      remoteQuery: false,
      writable: false,
      remoteChanges: false,
      cancelPendingCommit: false,
      queryExecution: Object.freeze({
        search: 'local',
        filter: 'local',
        sort: 'local',
        pagination: 'local',
      }),
    }),
    loadDocument({ signal }) {
      return new Promise((resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new Error('test load aborted')),
          { once: true },
        );
        void resolve;
      });
    },
  };
  const editor = createBomEditor({
    schema,
    columns,
    dataSource,
    instanceId: 'editor-source-race-test',
  });
  const { container } = createFakeDom(640, 280);
  const mounting = editor.mount(container);
  await Promise.resolve();
  assert.equal(editor.getDiagnostics().activeTasks, 1);

  editor.destroy();

  const destroyingDiagnostics = editor.getDiagnostics();
  assert.equal(destroyingDiagnostics.resources.tasks.queuedCount, 0);
  assert.equal(destroyingDiagnostics.resources.tasks.runningCount, 1);
  assert.equal(destroyingDiagnostics.resources.tasks.outstandingCount, 1);
  assert.equal(
    destroyingDiagnostics.resources.trackedResourcesReleased,
    false,
  );

  expectError(await mounting, BOM_EDITOR_ERROR_CODES.destroyed);
  expectError(await editor.ready, BOM_EDITOR_ERROR_CODES.destroyed);
  const destroyedDiagnostics = editor.getDiagnostics();
  assert.equal(destroyedDiagnostics.lifecycle, 'destroyed');
  assert.equal(destroyedDiagnostics.resources.tasks.queuedCount, 0);
  assert.equal(destroyedDiagnostics.resources.tasks.runningCount, 0);
  assert.equal(destroyedDiagnostics.resources.tasks.outstandingCount, 0);
  assert.equal(
    destroyedDiagnostics.resources.trackedResourcesReleased,
    true,
  );
  assert.equal(container.querySelector('[data-bom-canvas-renderer]'), null);
});

test('a DataSource load that ignores abort cannot replace the document after destroy', async () => {
  const load = deferred();
  const controlled = controlledDataSource({
    writable: false,
    remoteChanges: false,
    loadDocument() {
      return load.promise;
    },
  });
  const editor = createBomEditor({
    schema,
    columns,
    dataSource: controlled.source,
    instanceId: 'late-load-editor',
  });
  const { container } = createFakeDom(640, 280);
  const mounting = editor.mount(container);
  await Promise.resolve();
  const terminalSnapshot = editor.getSnapshot();
  editor.destroy();
  load.resolve(createSnapshot({
    documentId: 'must-not-publish',
    sourceRevision: 'late-source',
  }));

  expectError(await mounting, BOM_EDITOR_ERROR_CODES.destroyed);
  assert.equal(editor.getSnapshot(), terminalSnapshot);
  assert.equal(editor.getSnapshot().documentId, 'late-load-editor:document');
  assert.equal(editor.getDiagnostics().documentGeneration, 0);
});

test('an asynchronous first-frame failure is reported as a renderer failure', async () => {
  const editor = createEditor();
  const { container, window } = createFakeDom(640, 280);
  const mounting = editor.mount(container);
  await Promise.resolve();
  const canvas = container.querySelector('canvas');
  assert.ok(canvas);
  const context = canvas.getContext('2d');
  assert.ok(context);
  context.setTransform = () => {
    throw new Error('test first-frame failure');
  };

  window.flushAnimationFrames();

  expectError(await mounting, BOM_EDITOR_ERROR_CODES.rendererFailed);
  expectError(await editor.ready, BOM_EDITOR_ERROR_CODES.rendererFailed);
  assert.equal(editor.getDiagnostics().lifecycle, 'created');
  assert.equal(editor.getDiagnostics().mountedResources, 0);
  assert.equal(container.querySelector('[data-bom-canvas-renderer]'), null);
  editor.destroy();
});

test('column width changes are controlled, constrained, and published in view output', async () => {
  const editor = createEditor();
  const views = [];
  const unsubscribe = editor.on('viewChanged', (event) => views.push(event));
  const mounted = await mountFocusedGrid(editor);
  mounted.grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 208,
    clientY: 10,
  }));
  mounted.grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 224,
    clientY: 10,
  }));
  mounted.grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 240,
    clientY: 10,
  }));
  mounted.grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 81,
    pointerType: 'mouse',
    clientX: 240,
    clientY: 10,
  }));
  assert.equal(views.at(-1).reason, 'columns');
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'name').width,
    192,
  );
  assert.equal(Object.isFrozen(views.at(-1).view.columns), true);
  assert.equal(editor.getSnapshot().revision, 'revision-a');

  const undone = await editor.undo({ origin: 'test:resize:undo' });
  assert.equal(undone.ok, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'name').width,
    160,
  );
  const redone = await editor.redo({ origin: 'test:resize:redo' });
  assert.equal(redone.ok, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'name').width,
    192,
  );

  const keyboard = fakeEvent('keydown', {
    key: 'ArrowLeft',
    keyCode: 37,
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  });
  mounted.grid.dispatchEvent(keyboard);
  assert.equal(keyboard.defaultPrevented, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'name').width,
    184,
  );
  unsubscribe();
  editor.destroy();
});

test('row height changes are controlled view updates, preserved across projection refresh, and undoable', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const views = [];
  const unsubscribe = editor.on('viewChanged', (event) => views.push(event));
  t.after(() => unsubscribe());
  await mountFocusedGrid(editor);
  const changed = editor.setRowHeight('row-1', 64);
  assert.equal(changed.ok, true);
  assert.equal(views.at(-1).reason, 'row-height');
  assert.deepEqual(views.at(-1).view.rowHeights, [
    { occurrenceId: 'row-1', rowHeight: 64 },
  ]);
  assert.equal(editor.getSnapshot().revision, 'revision-a');
  assert.equal(editor.setViewQuery({ filters: [{ fieldPath: ['name'], operator: 'contains', value: 'Part' }] }).ok, true);
  assert.deepEqual(views.at(-1).view.rowHeights, [
    { occurrenceId: 'row-1', rowHeight: 64 },
  ]);
  assert.equal((await editor.undo()).ok, true);
  assert.deepEqual(views.at(-1).view.rowHeights, []);
  assert.equal((await editor.redo()).ok, true);
  assert.deepEqual(views.at(-1).view.rowHeights, [
    { occurrenceId: 'row-1', rowHeight: 64 },
  ]);
});

test('row-height output retains overrides for rows hidden by a query', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const views = [];
  const unsubscribe = editor.on('viewChanged', (event) => views.push(event));
  t.after(() => unsubscribe());
  assert.equal(editor.setRowHeight('row-1', 64).ok, true);
  assert.equal(editor.setRowHeight('row-2', 72).ok, true);
  assert.equal(editor.setViewQuery({ filters: [{
    fieldPath: ['name'], operator: 'equals', value: 'Part one',
  }] }).ok, true);
  assert.deepEqual(views.at(-1).view.rowHeights, [
    { occurrenceId: 'row-1', rowHeight: 64 },
    { occurrenceId: 'row-2', rowHeight: 72 },
  ]);
});

test('column order changes are controlled view updates with interaction history', async (t) => {
  const reorderColumns = Object.freeze([
    columns[0],
    columns[1],
    Object.freeze({
      columnId: 'note-copy',
      fieldPath: Object.freeze(['note']),
      label: 'Note copy',
      width: 120,
      editable: true,
      frozen: false,
    }),
  ]);
  const editor = createBomEditor({
    schema,
    columns: reorderColumns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-column-reorder-test',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const views = [];
  const unsubscribeView = editor.on('viewChanged', (event) => views.push(event));
  t.after(() => unsubscribeView());
  const events = recordEvents(editor, [
    'transactionCommitted',
    'documentChanged',
  ]);
  t.after(() => events.stop());
  const mounted = await mountFocusedGrid(editor);

  mounted.grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 82,
    pointerType: 'mouse',
    clientX: 240,
    clientY: 10,
  }));
  mounted.grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 82,
    pointerType: 'mouse',
    clientX: 430,
    clientY: 10,
  }));
  mounted.grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 82,
    pointerType: 'mouse',
    clientX: 430,
    clientY: 10,
  }));

  // The reorder callback is synchronous; the editor has already published the
  // controlled geometry before the renderer emits its view event.
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.columnId),
    ['name', 'note-copy', 'note'],
  );
  assert.equal(editor.getSnapshot().revision, 'revision-a');
  assert.equal(events.events.length, 0);
  assert.equal(views.at(-1).reason, 'columns');
  assert.equal(Object.isFrozen(views.at(-1).view.columns), true);

  // Clear the header-axis selection, then exercise the adjacent keyboard move
  // against the editor-controlled order.
  mounted.grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 83,
    pointerType: 'mouse',
    clientX: 240,
    clientY: 50,
  }));
  mounted.grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 83,
    pointerType: 'mouse',
    clientX: 240,
    clientY: 50,
  }));
  const keyboard = fakeEvent('keydown', {
    key: 'ArrowLeft',
    keyCode: 37,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    repeat: false,
    isComposing: false,
  });
  mounted.grid.dispatchEvent(keyboard);
  assert.equal(keyboard.defaultPrevented, true);
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.columnId),
    ['name', 'note', 'note-copy'],
  );
  assert.equal(editor.getSnapshot().revision, 'revision-a');
  assert.equal(events.events.length, 0);

  const undone = await editor.undo({ origin: 'test:reorder:undo' });
  assert.equal(undone.ok, true);
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.columnId),
    ['name', 'note-copy', 'note'],
  );
  const redone = await editor.redo({ origin: 'test:reorder:redo' });
  assert.equal(redone.ok, true);
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.columnId),
    ['name', 'note', 'note-copy'],
  );
});

test('column visibility changes are controlled view updates that preserve the document', async (t) => {
  const visibilityColumns = Object.freeze([
    columns[0],
    columns[1],
    Object.freeze({
      columnId: 'note-copy',
      fieldPath: Object.freeze(['note']),
      label: 'Note copy',
      width: 120,
      editable: true,
      frozen: false,
    }),
  ]);
  const editor = createBomEditor({
    schema,
    columns: visibilityColumns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-column-visibility-test',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const views = [];
  const unsubscribeView = editor.on('viewChanged', (event) => views.push(event));
  t.after(() => unsubscribeView());
  const events = recordEvents(editor, [
    'selectionChanged',
    'transactionCommitted',
    'documentChanged',
  ]);
  t.after(() => events.stop());
  const mounted = await mountFocusedGrid(editor);

  // Move the active cell from the required tree column to the optional note column.
  const moveRight = fakeEvent('keydown', {
    key: 'ArrowRight',
    keyCode: 39,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  });
  mounted.grid.dispatchEvent(moveRight);
  assert.equal(moveRight.defaultPrevented, true);
  events.events.length = 0;
  const beforeRevision = editor.getSnapshot().revision;

  const hide = fakeEvent('keydown', {
    key: 'h',
    keyCode: 72,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    repeat: false,
    isComposing: false,
  });
  mounted.grid.dispatchEvent(hide);
  assert.equal(hide.defaultPrevented, true);
  assert.equal(views.at(-1).reason, 'columns');
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => ({
      columnId: column.columnId,
      visible: column.visible,
    })),
    [
      { columnId: 'name', visible: true },
      { columnId: 'note', visible: false },
      { columnId: 'note-copy', visible: true },
    ],
  );
  assert.deepEqual(events.events.map((event) => event.type), ['selectionChanged']);
  assert.equal(events.events[0].reason, 'view-change');
  assert.deepEqual(events.events[0].selection.activeCell, {
    occurrenceId: 'row-1',
    columnId: 'note-copy',
  });
  assert.equal(editor.getSnapshot().revision, beforeRevision);

  const showAll = fakeEvent('keydown', {
    key: 'h',
    keyCode: 72,
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: true,
    repeat: false,
    isComposing: false,
  });
  mounted.grid.dispatchEvent(showAll);
  assert.equal(showAll.defaultPrevented, true);
  assert.equal(views.at(-1).reason, 'columns');
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.visible),
    [true, true, true],
  );
  assert.equal(editor.getSnapshot().revision, beforeRevision);
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    0,
  );
  assert.equal(
    events.events.filter((event) => event.type === 'documentChanged').length,
    0,
  );
});

test('column visibility and frozen placement use the unified interaction history', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const views = [];
  const unsubscribe = editor.on('viewChanged', (event) => views.push(event));
  t.after(() => unsubscribe());
  const mounted = await mountFocusedGrid(editor);
  assert.equal(
    editor.focusCell({ occurrenceId: 'row-1', columnId: 'note' }).ok,
    true,
  );

  const hide = fakeEvent('keydown', {
    key: 'h',
    keyCode: 72,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    repeat: false,
    isComposing: false,
  });
  mounted.grid.dispatchEvent(hide);
  assert.equal(hide.defaultPrevented, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'note').visible,
    false,
  );

  const hiddenUndo = await editor.undo({ origin: 'test:visibility:undo' });
  assert.equal(hiddenUndo.ok, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'note').visible,
    true,
  );
  const hiddenRedo = await editor.redo({ origin: 'test:visibility:redo' });
  assert.equal(hiddenRedo.ok, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'note').visible,
    false,
  );

  const frozen = editor.setColumnFrozen('note', 'end');
  assert.equal(frozen.ok, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'note').frozen,
    'end',
  );
  const frozenUndo = await editor.undo({ origin: 'test:frozen:undo' });
  assert.equal(frozenUndo.ok, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'note').frozen,
    false,
  );
  const frozenRedo = await editor.redo({ origin: 'test:frozen:redo' });
  assert.equal(frozenRedo.ok, true);
  assert.equal(
    views.at(-1).view.columns.find((column) => column.columnId === 'note').frozen,
    'end',
  );
});

test('column insertion and deletion are view operations with unified undo and redo', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const views = [];
  const unsubscribe = editor.on('viewChanged', (event) => views.push(event));
  t.after(() => unsubscribe());
  await mountFocusedGrid(editor);
  const revision = editor.getSnapshot().revision;

  const inserted = editor.insertColumn('note', 'before');
  assert.equal(inserted.ok, true);
  const insertedView = views.at(-1).view;
  assert.equal(insertedView.columns.length, 3);
  const insertedColumnId = insertedView.columns[1].columnId;
  assert.notEqual(insertedColumnId, 'note');
  assert.equal(editor.getSnapshot().revision, revision);

  const undone = await editor.undo();
  assert.equal(undone.ok, true);
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.columnId),
    ['name', 'note'],
  );
  assert.equal(editor.getSnapshot().revision, revision);

  const redone = await editor.redo();
  assert.equal(redone.ok, true);
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.columnId),
    ['name', insertedColumnId, 'note'],
  );

  const deleted = editor.deleteColumns([insertedColumnId]);
  assert.equal(deleted.ok, true);
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.columnId),
    ['name', 'note'],
  );
  const deleteUndo = await editor.undo();
  assert.equal(deleteUndo.ok, true);
  assert.deepEqual(
    views.at(-1).view.columns.map((column) => column.columnId),
    ['name', insertedColumnId, 'note'],
  );
  assert.equal(editor.getSnapshot().revision, revision);
});

test('DOM editing keeps Enter isolated during IME composition and commits afterward', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const interactionEvents = recordEvents(editor, [
    'beforeEdit',
    'editStart',
    'valueChanged',
    'beforeCommit',
    'transactionCommitted',
    'editEnd',
  ]);

  const mount = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mount);
  await Promise.resolve();
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(
    fakeEvent('dblclick', {
      clientX: 80,
      clientY: 50,
    }),
  );
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  assert.equal(portal.hidden, false);
  assert.equal(portal.value, 'Part one');

  const composedValue = '\u96f6\u4ef6\u4e00';
  portal.dispatchEvent(fakeEvent('compositionstart'));
  portal.value = composedValue;
  portal.dispatchEvent(
    fakeEvent('input', { inputType: 'insertCompositionText' }),
  );
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );
  await Promise.resolve();

  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal(
    interactionEvents.events.some((event) => event.type === 'beforeCommit'),
    false,
  );
  const changed = interactionEvents.events.find(
    (event) => event.type === 'valueChanged',
  );
  assert.equal(changed.inputType, 'composition');
  assert.equal(changed.value, composedValue);

  portal.dispatchEvent(fakeEvent('compositionend'));
  const committedEvent = waitForEvent(
    editor,
    'editEnd',
    (event) => event.outcome === 'committed',
  );
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );

  const editEnd = await committedEvent;
  assert.equal(editEnd.value, composedValue);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, composedValue);
  assert.deepEqual(
    interactionEvents.events
      .filter((event) => event.type !== 'valueChanged')
      .map((event) => event.type),
    [
      'beforeEdit',
      'editStart',
      'beforeCommit',
      'transactionCommitted',
      'editEnd',
    ],
  );
  assert.equal(
    interactionEvents.events.find((event) => event.type === 'beforeCommit').reason,
    'enter',
  );
  assert.equal(
    interactionEvents.events.find((event) => event.type === 'transactionCommitted')
      .origin,
    'editor:cell',
  );
});

test('a printable grid key opens a replacement draft through the editor state machine', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['beforeEdit', 'editStart', 'valueChanged']);
  t.after(() => events.stop());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const key = fakeEvent('keydown', {
    key: 'Z',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(key);
  window.flushAnimationFrames();
  assert.equal(key.defaultPrevented, true);
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  assert.equal(portal.hidden, false);
  assert.equal(portal.value, 'Z');
  assert.deepEqual(events.events.map((event) => event.type), [
    'beforeEdit',
    'editStart',
    'valueChanged',
  ]);
  const changed = events.events.at(-1);
  assert.equal(changed.inputType, 'replace');
  assert.equal(changed.previousValue, 'Part one');
  assert.equal(changed.value, 'Z');
});

test('DOM mouse drag expands the editor selection across the visible rectangle', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['selectionChanged']);
  t.after(() => events.stop());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      pointerId: 51,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 50,
    }),
  );
  grid.dispatchEvent(
    fakeEvent('pointermove', {
      pointerId: 51,
      pointerType: 'mouse',
      clientX: 250,
      clientY: 80,
    }),
  );
  window.flushAnimationFrames();
  assert.equal(events.events.length, 1);
  assert.deepEqual(events.events[0].selection, {
    activeCell: { occurrenceId: 'row-2', columnId: 'note' },
    range: {
      anchor: { occurrenceId: 'row-1', columnId: 'name' },
      focus: { occurrenceId: 'row-2', columnId: 'note' },
    },
  });

  grid.dispatchEvent(
    fakeEvent('pointerup', {
      pointerId: 51,
      pointerType: 'mouse',
      clientX: 250,
      clientY: 80,
    }),
  );
  grid.dispatchEvent(
    fakeEvent('pointermove', {
      pointerId: 51,
      pointerType: 'mouse',
      clientX: 250,
      clientY: 108,
    }),
  );
  assert.equal(events.events.length, 1);
});

test('DOM editing navigates after successful keyboard commits and skips read-only columns', async (t) => {
  const navigationColumns = Object.freeze([
    columns[0],
    Object.freeze({
      columnId: 'locked-note',
      fieldPath: Object.freeze(['note']),
      label: 'Locked note',
      width: 120,
      editable: false,
      frozen: false,
    }),
    columns[1],
  ]);
  const editor = createBomEditor({
    schema,
    columns: navigationColumns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-edit-navigation',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const selectionEvents = recordEvents(editor, [
    'selectionChanged',
    'commitRejected',
  ]);
  t.after(() => selectionEvents.stop());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  await Promise.resolve();
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  const selectCell = (clientX, clientY) => {
    grid.dispatchEvent(
      fakeEvent('pointerdown', {
        button: 0,
        clientX,
        clientY,
        shiftKey: false,
      }),
    );
    window.flushAnimationFrames();
  };
  const startEdit = (clientX, clientY) => {
    grid.dispatchEvent(fakeEvent('dblclick', { clientX, clientY }));
    window.flushAnimationFrames();
    const portal = container.querySelector('input[data-bom-editor-portal="true"]');
    assert.ok(portal);
    assert.equal(portal.hidden, false);
    return portal;
  };
  const commit = async (portal, key, shiftKey = false) => {
    const committed = waitForEvent(
      editor,
      'editEnd',
      (event) => event.outcome === 'committed',
    );
    const keydown = fakeEvent('keydown', {
      key,
      keyCode: key === 'Enter' ? 13 : 9,
      isComposing: false,
      shiftKey,
    });
    portal.dispatchEvent(keydown);
    assert.equal(keydown.defaultPrevented, true);
    await committed;
    window.flushAnimationFrames();
  };

  // Default Tab is row-major and must skip the read-only middle column.
  let portal = startEdit(80, 50);
  portal.value = 'Part one via Tab';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  await commit(portal, 'Tab');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one via Tab');
  assert.deepEqual(selectionEvents.events.at(-1).selection, {
    activeCell: { occurrenceId: 'row-1', columnId: 'note' },
    range: null,
  });

  // Shift+Tab is the reverse traversal and must skip the same read-only column.
  selectCell(380, 80);
  portal = startEdit(380, 80);
  portal.value = 'Row two via Shift+Tab';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  await commit(portal, 'Tab', true);
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'Row two via Shift+Tab');
  assert.deepEqual(selectionEvents.events.at(-1).selection, {
    activeCell: { occurrenceId: 'row-2', columnId: 'name' },
    range: null,
  });

  // Default Enter moves down in the current editable column.
  selectCell(380, 50);
  portal = startEdit(380, 50);
  portal.value = 'Row one via Enter';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  await commit(portal, 'Enter');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'Row one via Enter');
  assert.deepEqual(selectionEvents.events.at(-1).selection, {
    activeCell: { occurrenceId: 'row-2', columnId: 'note' },
    range: null,
  });

  // The final editable cell has no forward destination, so a successful Tab
  // commits without moving the controlled selection.
  const selectionCountAtBoundary = selectionEvents.events.length;
  portal = startEdit(380, 80);
  portal.value = 'Row two boundary';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  await commit(portal, 'Tab');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'Row two boundary');
  assert.equal(selectionEvents.events.length, selectionCountAtBoundary);

  // A validation rejection keeps the source selection; it must not consume the
  // pending Tab navigation intent.
  selectCell(80, 50);
  const selectionCountBeforeRejectedCommit = selectionEvents.events.length;
  portal = startEdit(80, 50);
  portal.value = 'x'.repeat(101);
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  const rejected = waitForEvent(editor, 'commitRejected');
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Tab',
      keyCode: 9,
      isComposing: false,
      shiftKey: false,
    }),
  );
  await rejected;
  window.flushAnimationFrames();
  assert.equal(selectionEvents.events.length, selectionCountBeforeRejectedCommit + 1);
  assert.equal(selectionEvents.events.at(-1).type, 'commitRejected');
  const lastSelection = selectionEvents.events
    .filter((event) => event.type === 'selectionChanged')
    .at(-1);
  assert.deepEqual(lastSelection.selection, {
    activeCell: { occurrenceId: 'row-1', columnId: 'name' },
    range: null,
  });
});

test('editNavigation input can disable post-commit movement and rejects invalid values', async (t) => {
  assert.throws(
    () => createBomEditor({
      schema,
      columns,
      initialDocument: createSnapshot(),
      instanceId: 'editor-invalid-edit-navigation',
      editNavigation: { tab: 'invalid' },
    }),
    (error) =>
      error?.error?.code === BOM_EDITOR_ERROR_CODES.configInvalid,
  );

  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-disabled-edit-navigation',
    rowHeight: 28,
    editNavigation: { enter: 'none', tab: 'none' },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const selectionEvents = recordEvents(editor, ['selectionChanged']);
  t.after(() => selectionEvents.stop());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'No navigation';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  const committed = waitForEvent(
    editor,
    'editEnd',
    (event) => event.outcome === 'committed',
  );
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Tab',
      keyCode: 9,
      isComposing: false,
      shiftKey: false,
    }),
  );
  await committed;
  window.flushAnimationFrames();

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const nextPortal = container.querySelector(
    'input[data-bom-editor-portal="true"]',
  );
  assert.ok(nextPortal);
  nextPortal.value = 'No Enter navigation';
  nextPortal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  const entered = waitForEvent(
    editor,
    'editEnd',
    (event) => event.outcome === 'committed',
  );
  nextPortal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );
  await entered;
  assert.equal(selectionEvents.events.length, 0);
});

test('edit navigation does not overwrite a selection changed during beforeCommit', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const selectionEvents = recordEvents(editor, ['selectionChanged']);
  t.after(() => selectionEvents.stop());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  const stop = editor.on('beforeCommit', () => {
    // Simulate an in-stack host interaction that changes selection and then
    // returns to the source. The pre-commit navigation intent must be stale.
    grid.dispatchEvent(
      fakeEvent('pointerdown', {
        button: 0,
        clientX: 250,
        clientY: 50,
        shiftKey: false,
      }),
    );
    grid.dispatchEvent(
      fakeEvent('pointerdown', {
        button: 0,
        clientX: 80,
        clientY: 50,
        shiftKey: false,
      }),
    );
  });
  t.after(stop);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Selection race';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  const committed = waitForEvent(
    editor,
    'editEnd',
    (event) => event.outcome === 'committed',
  );
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Tab',
      keyCode: 9,
      isComposing: false,
      shiftKey: false,
    }),
  );
  await committed;
  assert.equal(selectionEvents.events.length, 0);
});

test('cut writes the complete selection before one atomic unsetField transaction and supports Undo', async (t) => {
  const policyRequests = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(2, 'cut-document'),
    instanceId: 'editor-cut-success',
    rowHeight: 28,
    clipboardPolicy: {
      authorize(request) {
        policyRequests.push(request);
        return { decisionId: 'cut-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const copied = new Map();
  const events = recordEvents(editor, [
    'clipboardOperation',
    'transactionCommitted',
  ]);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
  const cut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        copied.set(type, text);
      },
    },
  });
  grid.dispatchEvent(cut);

  assert.equal(cut.defaultPrevented, true);
  assert.deepEqual([...copied], [
    ['text/plain', 'initial\r\ninitial'],
    ['text/html', '<table><tbody><tr><td>initial</td></tr><tr><td>initial</td></tr></tbody></table>'],
    ['application/x-bom-editor-clipboard+json', '{"format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["initial"],["initial"]]}'],
  ]);
  assert.deepEqual(policyRequests, [
    {
      operation: 'cut',
      occurrenceIds: ['flat-row-0', 'flat-row-1'],
      fieldIds: ['note'],
      formats: ['text/plain', 'text/html', 'internal'],
    },
  ]);

  await turn();
  await turn();

  assert.equal(node(editor.getSnapshot(), 'flat-row-0').fields.note, undefined);
  assert.equal(node(editor.getSnapshot(), 'flat-row-1').fields.note, undefined);
  const cutCommit = events.events.find(
    (event) => event.type === 'transactionCommitted' && event.origin === 'editor:cut',
  );
  assert.ok(cutCommit);
  assert.deepEqual(
    cutCommit.patch.operations.map((operation) => operation.op),
    ['unsetField', 'unsetField'],
  );
  assert.deepEqual(
    events.events
      .filter((event) => event.type === 'clipboardOperation')
      .map((event) => ({
        operation: event.operation,
        outcome: event.outcome,
        method: event.method,
        decisionId: event.decisionId,
      })),
    [
      {
        operation: 'cut',
        outcome: 'written',
        method: 'event-fallback',
        decisionId: 'cut-allow',
      },
    ],
  );

  expectOk(await editor.undo());
  assert.equal(contentHash(editor.getSnapshot()), before);
});

test('independent branch cut authorizes and writes the complete hidden subtree before one delete transaction', async (t) => {
  const policyRequests = [];
  const clipboardWrites = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createBranchSnapshot(),
    instanceId: 'editor-branch-cut-success',
    rowHeight: 28,
    clipboardPolicy: {
      authorize(request) {
        policyRequests.push(request);
        return { decisionId: 'branch-cut-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  window.Blob = globalThis.Blob;
  window.ClipboardItem = class {
    constructor(items) {
      this.items = items;
    }
  };
  window.navigator = {
    clipboard: {
      write(items) {
        clipboardWrites.push(items);
        return Promise.resolve();
      },
    },
  };
  const events = recordEvents(editor, [
    'clipboardOperation',
    'transactionCommitted',
  ]);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const branchCut = fakeEvent('keydown', {
    key: 'k',
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(branchCut);
  assert.equal(branchCut.defaultPrevented, true);
  await Promise.resolve();
  assert.equal(clipboardWrites.length, 1);
  const internal = await clipboardWrites[0][0].items[
    'application/x-bom-editor-clipboard+json'
  ].text();
  const envelope = JSON.parse(internal);
  assert.equal(envelope.kind, 'branch-tree');
  assert.deepEqual(envelope.roots, ['branch-root']);
  assert.deepEqual(envelope.nodes.map((node) => node.occurrenceId), [
    'branch-root',
    'branch-child',
    'branch-leaf',
  ]);
  assert.deepEqual(policyRequests, [
    {
      operation: 'cut-branch',
      occurrenceIds: ['branch-root', 'branch-child', 'branch-leaf'],
      fieldIds: ['name', 'note'],
      formats: ['text/plain', 'text/html', 'internal'],
      branch: {
        rootOccurrenceIds: ['branch-root'],
        includeDescendants: true,
      },
    },
  ]);

  await turn();
  await turn();
  assert.deepEqual(editor.getSnapshot().nodes, []);
  const branchCommit = events.events.find(
    (event) => event.type === 'transactionCommitted' &&
      event.origin === 'editor:cut-branch',
  );
  assert.ok(branchCommit);
  assert.deepEqual(branchCommit.patch.operations.map((operation) => operation.op), [
    'deleteSubtree',
  ]);
  assert.deepEqual(
    events.events
      .filter((event) => event.type === 'clipboardOperation')
      .map((event) => ({
        operation: event.operation,
        outcome: event.outcome,
        method: event.method,
        decisionId: event.decisionId,
        branch: event.branch,
      })),
    [{
      operation: 'cut-branch',
      outcome: 'written',
      method: 'async',
      decisionId: 'branch-cut-allow',
      branch: {
        rootOccurrenceIds: ['branch-root'],
        includeDescendants: true,
      },
    }],
  );
  expectOk(await editor.undo());
  assert.equal(contentHash(editor.getSnapshot()), before);
});

test('independent branch copy writes a branch envelope without a transaction', async (t) => {
  const writes = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createBranchSnapshot(),
    instanceId: 'editor-branch-copy-success',
    clipboardPolicy: {
      authorize(request) {
        return { decisionId: 'branch-copy-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const { container, window } = createFakeDom(640, 280);
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
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const copy = fakeEvent('keydown', {
    key: 'b', ctrlKey: true, metaKey: false, shiftKey: true,
    altKey: false, isComposing: false,
  });
  grid.dispatchEvent(copy);
  assert.equal(copy.defaultPrevented, true);
  await Promise.resolve();
  assert.equal(writes.length, 1);
  const internal = await writes[0][0].items[
    'application/x-bom-editor-clipboard+json'
  ].text();
  assert.equal(JSON.parse(internal).kind, 'branch-tree');
  assert.equal(events.events.filter((event) => event.type === 'transactionCommitted').length, 0);
  assert.deepEqual(
    events.events
      .filter((event) => event.type === 'clipboardOperation')
      .map((event) => ({ operation: event.operation, outcome: event.outcome, method: event.method })),
    [{ operation: 'copy-branch', outcome: 'written', method: 'async' }],
  );
});

test('branch copy policy denial and async write failure never mutate the snapshot', async (t) => {
  const deniedWrites = [];
  const deniedEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createBranchSnapshot(),
    instanceId: 'editor-branch-copy-denied',
    clipboardPolicy: {
      authorize() {
        return {
          decisionId: 'branch-copy-deny',
          allowed: false,
          reasonCode: 'restricted',
        };
      },
    },
  });
  t.after(() => deniedEditor.destroy());
  const deniedEvents = recordEvents(deniedEditor, ['clipboardOperation']);
  t.after(() => deniedEvents.stop());
  const deniedDom = createFakeDom(640, 280);
  deniedDom.window.Blob = globalThis.Blob;
  deniedDom.window.ClipboardItem = class { constructor(items) { this.items = items; } };
  deniedDom.window.navigator = { clipboard: { write(items) { deniedWrites.push(items); return Promise.resolve(); } } };
  const deniedMount = deniedEditor.mount(deniedDom.container);
  await Promise.resolve();
  deniedDom.window.flushAnimationFrames();
  expectOk(await deniedMount);
  const deniedGrid = deniedDom.container.querySelector('[role="treegrid"]');
  deniedGrid.focus();
  deniedGrid.dispatchEvent(fakeEvent('keydown', {
    key: 'b', ctrlKey: true, metaKey: false, shiftKey: true,
    altKey: false, isComposing: false,
  }));
  await Promise.resolve();
  assert.equal(deniedWrites.length, 0);
  assert.equal(deniedEvents.events[0].outcome, 'denied');

  const failedWrites = [];
  const failedEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createBranchSnapshot(),
    instanceId: 'editor-branch-cut-write-failed',
    clipboardPolicy: {
      authorize() {
        return { decisionId: 'branch-cut-write-allow', allowed: true };
      },
    },
  });
  t.after(() => failedEditor.destroy());
  const failedEvents = recordEvents(failedEditor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => failedEvents.stop());
  const failedDom = createFakeDom(640, 280);
  failedDom.window.Blob = globalThis.Blob;
  failedDom.window.ClipboardItem = class { constructor(items) { this.items = items; } };
  failedDom.window.navigator = { clipboard: { write(items) { failedWrites.push(items); return Promise.reject(new Error('denied')); } } };
  const failedMount = failedEditor.mount(failedDom.container);
  await Promise.resolve();
  failedDom.window.flushAnimationFrames();
  expectOk(await failedMount);
  const failedGrid = failedDom.container.querySelector('[role="treegrid"]');
  failedGrid.focus();
  failedGrid.dispatchEvent(fakeEvent('keydown', {
    key: 'k', ctrlKey: true, metaKey: false, shiftKey: true,
    altKey: false, isComposing: false,
  }));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(failedWrites.length, 1);
  assert.equal(failedEditor.getSnapshot().nodes.length, 3);
  assert.deepEqual(
    failedEvents.events
      .filter((event) => event.type === 'clipboardOperation')
      .map((event) => ({ operation: event.operation, outcome: event.outcome, method: event.method })),
    [{ operation: 'cut-branch', outcome: 'failed', method: 'async' }],
  );
  assert.equal(failedEvents.events.filter((event) => event.type === 'transactionCommitted').length, 0);
});

test('branch cut does not delete after a document version changes during Clipboard write', async (t) => {
  const gate = deferred();
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createBranchSnapshot(),
    instanceId: 'editor-branch-cut-stale',
    clipboardPolicy: {
      authorize() {
        return { decisionId: 'branch-cut-stale-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const { container, window } = createFakeDom(640, 280);
  window.Blob = globalThis.Blob;
  window.ClipboardItem = class { constructor(items) { this.items = items; } };
  window.navigator = { clipboard: { write() { return gate.promise; } } };
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'k', ctrlKey: true, metaKey: false, shiftKey: true,
    altKey: false, isComposing: false,
  }));
  await Promise.resolve();
  const replacement = createSnapshot({
    documentId: 'branch-cut-stale-replacement',
    revision: 'branch-cut-stale-revision',
  });
  const replacing = editor.setDocument(replacement);
  gate.resolve();
  expectOk(await replacing);
  await turn();
  await turn();
  assert.deepEqual(editor.getSnapshot().roots, replacement.roots);
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    0,
  );
  assert.deepEqual(
    events.events
      .filter((event) => event.type === 'clipboardOperation')
      .map((event) => ({ operation: event.operation, outcome: event.outcome, reasonCode: event.reasonCode })),
    [
      { operation: 'cut-branch', outcome: 'written', reasonCode: undefined },
      { operation: 'cut-branch', outcome: 'failed', reasonCode: 'stale-document' },
    ],
  );
});

test('cut rejects optional fields whose Schema default would refill an unset value', async (t) => {
  const defaultedSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      schema.fields[0],
      Object.freeze({
        ...schema.fields[1],
        defaultValue: 'fallback note',
      }),
    ]),
  });
  const policyRequests = [];
  const editor = createBomEditor({
    schema: defaultedSchema,
    columns,
    initialDocument: createSnapshot({ firstNote: 'explicit note' }),
    instanceId: 'editor-cut-defaulted-field',
    rowHeight: 28,
    clipboardPolicy: {
      authorize(request) {
        policyRequests.push(request);
        return { decisionId: 'cut-defaulted-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = editor.getSnapshot();

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  const cut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        writes.push([type, text]);
      },
    },
  });
  grid.dispatchEvent(cut);
  await turn();

  assert.equal(cut.defaultPrevented, true);
  assert.deepEqual(writes, []);
  assert.deepEqual(policyRequests, []);
  assert.equal(editor.getSnapshot(), before);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'explicit note');
  assert.equal(
    events.events.some(
      (event) => event.type === 'transactionCommitted' && event.origin === 'editor:cut',
    ),
    false,
  );
  assert.deepEqual(events.events.map((event) => ({
    outcome: event.outcome,
    reasonCode: event.reasonCode,
  })), [
    { outcome: 'failed', reasonCode: 'cut-defaulted-field' },
  ]);
});

test('a synthetic cut event cannot write a false success or delete editor data', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = editor.getSnapshot();

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  const cut = fakeEvent('cut', {
    isTrusted: false,
    clipboardData: {
      setData(type, text) {
        writes.push([type, text]);
      },
    },
  });
  grid.dispatchEvent(cut);
  await turn();

  assert.equal(cut.defaultPrevented, true);
  assert.deepEqual(writes, []);
  assert.equal(editor.getSnapshot(), before);
  assert.deepEqual(events.events, []);
});

test('cut keeps commands and Clipboard output bounded before writing or deleting', async (t) => {
  const largeSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      schema.fields[0],
      Object.freeze({
        ...schema.fields[1],
        type: Object.freeze({ kind: 'string', maxLength: 100_000 }),
      }),
    ]),
  });
  const editor = createBomEditor({
    schema: largeSchema,
    columns,
    initialDocument: createSnapshot({ firstNote: 'x'.repeat(64 * 1024 + 1) }),
    instanceId: 'editor-cut-output-limit',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = editor.getSnapshot();

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  grid.dispatchEvent(fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        writes.push([type, text]);
      },
    },
  }));
  await turn();

  assert.deepEqual(writes, []);
  assert.equal(editor.getSnapshot(), before);
  assert.equal(
    events.events.some(
      (event) => event.type === 'transactionCommitted' && event.origin === 'editor:cut',
    ),
    false,
  );
  assert.deepEqual(events.events.map((event) => ({
    outcome: event.outcome,
    reasonCode: event.reasonCode,
  })), [
    { outcome: 'failed', reasonCode: 'cut-cell-byte-limit' },
  ]);
});

test('cut rejects aggregate Clipboard output above its total byte limit', async (t) => {
  const largeSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      schema.fields[0],
      Object.freeze({
        ...schema.fields[1],
        type: Object.freeze({ kind: 'string', maxLength: 100_000 }),
      }),
    ]),
  });
  const snapshot = createFlatSnapshot(20, 'editor-cut-total-byte-limit');
  for (const row of snapshot.nodes) {
    row.fields.note = 'x'.repeat(60 * 1024);
  }
  const editor = createBomEditor({
    schema: largeSchema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-cut-total-byte-limit',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = editor.getSnapshot();

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  for (let index = 1; index < 20; index += 1) {
    grid.dispatchEvent(fakeEvent('keydown', {
      key: 'ArrowDown',
      shiftKey: true,
    }));
  }
  grid.dispatchEvent(fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        writes.push([type, text]);
      },
    },
  }));
  await turn();

  assert.deepEqual(writes, []);
  assert.equal(editor.getSnapshot(), before);
  assert.equal(
    events.events.some(
      (event) => event.type === 'transactionCommitted' && event.origin === 'editor:cut',
    ),
    false,
  );
  assert.deepEqual(events.events.map((event) => ({
    outcome: event.outcome,
    reasonCode: event.reasonCode,
  })), [
    { outcome: 'failed', reasonCode: 'cut-byte-limit' },
  ]);
});

test('cut rejects an oversized rectangular selection before allocating commands', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(10_001, 'editor-cut-selection-limit'),
    instanceId: 'editor-cut-selection-limit',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = editor.getSnapshot();

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'End',
    ctrlKey: true,
    shiftKey: true,
  }));
  grid.dispatchEvent(fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        writes.push([type, text]);
      },
    },
  }));
  await turn();

  assert.deepEqual(writes, []);
  assert.equal(editor.getSnapshot(), before);
  assert.equal(
    events.events.some(
      (event) => event.type === 'transactionCommitted' && event.origin === 'editor:cut',
    ),
    false,
  );
  assert.deepEqual(events.events.map((event) => ({
    occurrenceCount: event.occurrenceCount,
    fieldIds: event.fieldIds,
    outcome: event.outcome,
    reasonCode: event.reasonCode,
  })), [
    {
      occurrenceCount: 10_001,
      fieldIds: [],
      outcome: 'failed',
      reasonCode: 'cut-selection-limit',
    },
  ]);
});

test('cut keeps NUL-containing occurrence and field IDs distinct', async (t) => {
  const collisionSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      Object.freeze({
        fieldId: 'b\u0000c',
        path: Object.freeze(['first']),
        type: Object.freeze({ kind: 'string', maxLength: 100 }),
        required: false,
        nullable: false,
      }),
      Object.freeze({
        fieldId: 'c',
        path: Object.freeze(['second']),
        type: Object.freeze({ kind: 'string', maxLength: 100 }),
        required: false,
        nullable: false,
      }),
    ]),
  });
  const collisionColumns = Object.freeze([
    Object.freeze({
      columnId: 'first',
      fieldPath: Object.freeze(['first']),
      label: 'First',
      width: 140,
      editable: true,
      frozen: 'start',
    }),
    Object.freeze({
      columnId: 'second',
      fieldPath: Object.freeze(['second']),
      label: 'Second',
      width: 140,
      editable: true,
      frozen: false,
    }),
  ]);
  const editor = createBomEditor({
    schema: collisionSchema,
    columns: collisionColumns,
    initialDocument: {
      schemaVersion: '1.0.0',
      documentId: 'cut-nul-collision',
      revision: 'cut-nul-revision',
      positionKeyCodecVersion: 'lexicographic-ascii-v1',
      completeness: 'complete',
      knownRootCount: 2,
      roots: ['a', 'a\u0000b'],
      nodes: [
        {
          occurrenceId: 'a',
          kind: 'material',
          materialCode: 'MAT-A',
          parentId: null,
          positionKey: 'A',
          childrenState: 'complete',
          knownChildCount: 0,
          fields: { first: 'one', second: 'one-second' },
        },
        {
          occurrenceId: 'a\u0000b',
          kind: 'material',
          materialCode: 'MAT-B',
          parentId: null,
          positionKey: 'B',
          childrenState: 'complete',
          knownChildCount: 0,
          fields: { first: 'two', second: 'two-second' },
        },
      ],
    },
    instanceId: 'editor-cut-nul-collision',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
  grid.dispatchEvent(fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        writes.push([type, text]);
      },
    },
  }));
  await turn();
  await turn();

  assert.deepEqual(writes, [
    ['text/plain', 'one\tone-second\r\ntwo\ttwo-second'],
    ['text/html', '<table><tbody><tr><td>one</td><td>one-second</td></tr><tr><td>two</td><td>two-second</td></tr></tbody></table>'],
    ['application/x-bom-editor-clipboard+json', '{"format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["one","one-second"],["two","two-second"]]}'],
  ]);
  assert.deepEqual(node(editor.getSnapshot(), 'a').fields, {});
  assert.deepEqual(node(editor.getSnapshot(), 'a\u0000b').fields, {});
  const commit = events.events.find(
    (event) => event.origin === 'editor:cut',
  );
  assert.ok(commit);
  assert.equal(commit.patch.operations.length, 4);

  expectOk(await editor.undo());
  expectOk(await editor.paste({
    internal: createInternalClipboard([
      ['paste-first-a', 'paste-second-a'],
      ['paste-first-b', 'paste-second-b'],
    ]),
  }));
  assert.deepEqual(node(editor.getSnapshot(), 'a').fields, {
    first: 'paste-first-a',
    second: 'paste-second-a',
  });
  assert.deepEqual(node(editor.getSnapshot(), 'a\u0000b').fields, {
    first: 'paste-first-b',
    second: 'paste-second-b',
  });
});

test('cut keeps the snapshot intact when Clipboard writing fails or a field cannot be safely cut', async (t) => {
  const failing = createEditor();
  t.after(() => failing.destroy());
  const failingDom = createFakeDom(640, 280);
  const failingEvents = recordEvents(failing, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => failingEvents.stop());
  const failingBefore = contentHash(failing.getSnapshot());
  const failingMount = failing.mount(failingDom.container);
  await Promise.resolve();
  failingDom.window.flushAnimationFrames();
  expectOk(await failingMount);
  const failingGrid = failingDom.container.querySelector('[role="treegrid"]');
  assert.ok(failingGrid);
  failingGrid.focus();
  failingGrid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  const failedCut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData() {
        throw new Error('clipboard write rejected');
      },
    },
  });
  failingGrid.dispatchEvent(failedCut);
  await turn();
  assert.equal(failedCut.defaultPrevented, true);
  assert.equal(contentHash(failing.getSnapshot()), failingBefore);
  assert.equal(
    failingEvents.events.some((event) => event.type === 'transactionCommitted'),
    false,
  );
  assert.deepEqual(failingEvents.events.map((event) => ({
    operation: event.operation,
    outcome: event.outcome,
    method: event.method,
  })), [
    { operation: 'cut', outcome: 'failed', method: 'event-fallback' },
  ]);

  const requests = [];
  const transformed = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-cut-transformed',
    rowHeight: 28,
    clipboardPolicy: {
      authorize(request) {
        requests.push(request);
        return {
          decisionId: 'cut-redacted',
          allowed: true,
          maskingByFieldId: { note: 'redact' },
        };
      },
    },
  });
  t.after(() => transformed.destroy());
  const transformedDom = createFakeDom(640, 280);
  const transformedWrites = [];
  const transformedEvents = recordEvents(transformed, ['clipboardOperation']);
  t.after(() => transformedEvents.stop());
  const transformedMount = transformed.mount(transformedDom.container);
  await Promise.resolve();
  transformedDom.window.flushAnimationFrames();
  expectOk(await transformedMount);
  const transformedGrid = transformedDom.container.querySelector('[role="treegrid"]');
  assert.ok(transformedGrid);
  transformedGrid.focus();
  transformedGrid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  transformedGrid.dispatchEvent(fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        transformedWrites.push([type, text]);
      },
    },
  }));
  await Promise.resolve();
  assert.deepEqual(transformedWrites, []);
  assert.equal(node(transformed.getSnapshot(), 'row-1').fields.note, 'initial');
  assert.equal(requests[0].operation, 'cut');
  assert.deepEqual(transformedEvents.events.map((event) => ({
    operation: event.operation,
    outcome: event.outcome,
    reasonCode: event.reasonCode,
  })), [
    {
      operation: 'cut',
      outcome: 'denied',
      reasonCode: 'cut-requires-original-values',
    },
  ]);

  const required = createEditor();
  t.after(() => required.destroy());
  const requiredDom = createFakeDom(640, 280);
  const requiredWrites = [];
  const requiredEvents = recordEvents(required, ['clipboardOperation']);
  t.after(() => requiredEvents.stop());
  const requiredMount = required.mount(requiredDom.container);
  await Promise.resolve();
  requiredDom.window.flushAnimationFrames();
  expectOk(await requiredMount);
  const requiredGrid = requiredDom.container.querySelector('[role="treegrid"]');
  assert.ok(requiredGrid);
  requiredGrid.focus();
  requiredGrid.dispatchEvent(fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        requiredWrites.push([type, text]);
      },
    },
  }));
  await Promise.resolve();
  assert.deepEqual(requiredWrites, []);
  assert.equal(node(required.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal(requiredEvents.events[0].reasonCode, 'cut-required-field');
});

test('native cut fallback writes before applying the editor cut transaction', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const copied = new Map();
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  const cut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData(type, text) {
        copied.set(type, text);
      },
    },
  });
  grid.dispatchEvent(cut);
  assert.equal(cut.defaultPrevented, true);
  assert.deepEqual([...copied], [
    ['text/plain', 'initial'],
    ['text/html', '<table><tbody><tr><td>initial</td></tr></tbody></table>'],
    ['application/x-bom-editor-clipboard+json', '{"format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["initial"]]}'],
  ]);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
  await turn();
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, undefined);
  assert.equal(
    events.events.some(
      (event) => event.type === 'transactionCommitted' && event.origin === 'editor:cut',
    ),
    true,
  );
  assert.deepEqual(events.events
    .filter((event) => event.type === 'clipboardOperation')
    .map((event) => ({ operation: event.operation, method: event.method })), [
    { operation: 'cut', method: 'event-fallback' },
  ]);
});

test('a Clipboard-confirmed cut does not delete after its document generation becomes stale', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  const replacing = editor.setDocument(
    createSnapshot({ documentId: 'document-b', revision: 'revision-b' }),
  );
  const cut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData() {},
    },
  });
  grid.dispatchEvent(cut);
  assert.equal(cut.defaultPrevented, true);
  expectOk(await replacing);
  await turn();
  await turn();

  assert.equal(editor.getSnapshot().documentId, 'document-b');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
  assert.equal(
    events.events.some(
      (event) => event.type === 'transactionCommitted' && event.origin === 'editor:cut',
    ),
    false,
  );
  assert.deepEqual(events.events
    .filter((event) => event.type === 'clipboardOperation')
    .map((event) => ({
      operation: event.operation,
      outcome: event.outcome,
      reasonCode: event.reasonCode,
      documentId: event.documentId,
      documentGeneration: event.documentGeneration,
    })), [
    {
      operation: 'cut',
      outcome: 'written',
      reasonCode: undefined,
      documentId: 'document-a',
      documentGeneration: 0,
    },
    {
      operation: 'cut',
      outcome: 'failed',
      reasonCode: 'stale-document',
      documentId: 'document-a',
      documentGeneration: 0,
    },
  ]);
});

test('a Clipboard-confirmed cut does not overwrite a newer field revision', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['clipboardOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  const updating = editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'newer value',
  });
  const cut = fakeEvent('cut', {
    isTrusted: true,
    clipboardData: {
      setData() {},
    },
  });
  grid.dispatchEvent(cut);
  assert.equal(cut.defaultPrevented, true);
  expectOk(await updating);
  await turn();
  await turn();

  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'newer value');
  assert.equal(
    events.events.some(
      (event) => event.type === 'transactionCommitted' && event.origin === 'editor:cut',
    ),
    false,
  );
  assert.deepEqual(events.events
    .filter((event) => event.type === 'clipboardOperation')
    .map((event) => ({ outcome: event.outcome, reasonCode: event.reasonCode })), [
    { outcome: 'written', reasonCode: undefined },
    { outcome: 'failed', reasonCode: 'stale-document' },
  ]);
});

test('copy authorizes a stable rectangular range before producing safe TSV', async (t) => {
  const policyRequests = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot({
      firstName: '=SUM(1,1)',
      firstNote: 'sensitive note',
    }),
    instanceId: 'editor-copy-policy',
    rowHeight: 28,
    clipboardPolicy: {
      authorize(request) {
        policyRequests.push(request);
        return {
          decisionId: 'copy-allow-redacted',
          allowed: true,
          maskingByFieldId: { note: 'redact' },
        };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  window.isSecureContext = true;
  window.navigator = {
    clipboard: {
      writeText(text) {
        writes.push(text);
        return Promise.resolve();
      },
    },
  };
  const clipboardEvents = recordEvents(editor, ['clipboardOperation']);
  t.after(() => clipboardEvents.stop());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowDown',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();

  const copy = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(copy);
  assert.equal(copy.defaultPrevented, true);
  await Promise.resolve();

  assert.deepEqual(policyRequests, [
    {
      operation: 'copy',
      occurrenceIds: ['row-1', 'row-2'],
      fieldIds: ['name', 'note'],
      formats: ['text/plain', 'text/html', 'internal'],
    },
  ]);
  assert.deepEqual(writes, [
    "'=SUM(1,1)\t[REDACTED]\r\nPart two\t[REDACTED]",
  ]);
  const copied = parseClipboardText(writes[0], {
    maxBytes: 1024,
    maxRows: 16,
    maxColumns: 16,
    maxCells: 64,
    maxCellBytes: 256,
  });
  assert.equal(copied.ok, true);
  assert.equal(copied.format, 'tsv');
  assert.deepEqual(copied.rows, [
    ["'=SUM(1,1)", '[REDACTED]'],
    ['Part two', '[REDACTED]'],
  ]);
  assert.deepEqual(clipboardEvents.events.map((event) => ({
    operation: event.operation,
    outcome: event.outcome,
    method: event.method,
    decisionId: event.decisionId,
    occurrenceCount: event.occurrenceCount,
    fieldIds: event.fieldIds,
    formats: event.formats,
  })), [
    {
      operation: 'copy',
      outcome: 'written',
      method: 'async',
      decisionId: 'copy-allow-redacted',
      occurrenceCount: 2,
      fieldIds: ['name', 'note'],
      formats: ['text/plain', 'text/html', 'internal'],
    },
  ]);
});

test('clipboard lifecycle exposes cancellable beforeCopy and split completion/rejection events', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const dom = createFakeDom(640, 280);
  const writes = [];
  dom.window.isSecureContext = true;
  dom.window.navigator = {
    clipboard: {
      writeText(text) {
        writes.push(text);
        return Promise.resolve();
      },
    },
  };
  const before = [];
  const completed = [];
  const rejected = [];
  const stopBefore = editor.on('beforeCopy', (event) => {
    before.push(event);
    if (before.length === 1) event.preventDefault();
  });
  const stopCompleted = editor.on('clipboardCompleted', (event) => completed.push(event));
  const stopRejected = editor.on('clipboardRejected', (event) => rejected.push(event));
  t.after(() => stopBefore());
  t.after(() => stopCompleted());
  t.after(() => stopRejected());

  const mounting = editor.mount(dom.container);
  await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = dom.container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const cancelled = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(cancelled);
  assert.equal(cancelled.defaultPrevented, true);
  await Promise.resolve();
  assert.equal(before.length, 1);
  assert.equal(before[0].operation, 'copy');
  assert.equal(Object.isFrozen(before[0].fieldIds), true);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].outcome, 'denied');
  assert.equal(rejected[0].reasonCode, 'cancelled');
  assert.equal(completed.length, 0);
  assert.deepEqual(writes, []);

  const allowed = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(allowed);
  await Promise.resolve();
  assert.equal(before.length, 2);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].method, 'async');
  assert.equal(completed[0].operation, 'copy');
  assert.deepEqual(rejected.map((event) => event.reasonCode), ['cancelled']);
  assert.equal(writes.length, 1);
});

test('copy policy can crop fields and denies output before it reaches the Clipboard', async (t) => {
  const requests = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot({ firstNote: 'copy only this' }),
    instanceId: 'editor-copy-crop',
    rowHeight: 28,
    clipboardPolicy: {
      authorize(request) {
        requests.push(request);
        return {
          decisionId: 'copy-note-only',
          allowed: true,
          fieldIds: ['note'],
        };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  window.navigator = {
    clipboard: {
      writeText(text) {
        writes.push(text);
        return Promise.resolve();
      },
    },
  };
  const clipboardEvents = recordEvents(editor, ['clipboardOperation']);
  t.after(() => clipboardEvents.stop());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
    }),
  );
  await Promise.resolve();

  assert.deepEqual(writes, ['copy only this']);
  assert.equal(requests[0].fieldIds.includes('name'), true);
  assert.equal(requests[0].fieldIds.includes('note'), true);
  assert.equal(clipboardEvents.events[0].fieldIds.length, 1);
  assert.equal(clipboardEvents.events[0].fieldIds[0], 'note');

  const deniedEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-copy-denied',
    rowHeight: 28,
    clipboardPolicy: {
      authorize() {
        return {
          decisionId: 'copy-denied',
          allowed: false,
          reasonCode: 'restricted',
        };
      },
    },
  });
  t.after(() => deniedEditor.destroy());
  const deniedDom = createFakeDom(640, 280);
  const deniedWrites = [];
  deniedDom.window.navigator = {
    clipboard: {
      writeText(text) {
        deniedWrites.push(text);
        return Promise.resolve();
      },
    },
  };
  const deniedEvents = recordEvents(deniedEditor, ['clipboardOperation']);
  t.after(() => deniedEvents.stop());
  const deniedMount = deniedEditor.mount(deniedDom.container);
  await Promise.resolve();
  deniedDom.window.flushAnimationFrames();
  expectOk(await deniedMount);
  const deniedGrid = deniedDom.container.querySelector('[role="treegrid"]');
  assert.ok(deniedGrid);
  deniedGrid.focus();
  const deniedCopy = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  deniedGrid.dispatchEvent(deniedCopy);
  assert.equal(deniedCopy.defaultPrevented, true);
  await Promise.resolve();
  assert.deepEqual(deniedWrites, []);
  assert.deepEqual(deniedEvents.events.map((event) => ({
    outcome: event.outcome,
    decisionId: event.decisionId,
    reasonCode: event.reasonCode,
  })), [
    {
      outcome: 'denied',
      decisionId: 'copy-denied',
      reasonCode: 'restricted',
    },
  ]);
});

test('copy rejects an oversized visible selection before reading or writing fields', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(10_001, 'copy-limit-document'),
    instanceId: 'editor-copy-selection-limit',
    rowHeight: 28,
    clipboardPolicy: {
      authorize() {
        throw new Error('copy policy must not run after the selection limit');
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  window.navigator = {
    clipboard: {
      writeText() {
        throw new Error('copy must not write after the selection limit');
      },
    },
  };
  const events = recordEvents(editor, ['clipboardOperation']);
  t.after(() => events.stop());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const selectAll = fakeEvent('keydown', {
    key: 'a',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(selectAll);
  assert.equal(selectAll.defaultPrevented, true);
  const copy = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(copy);
  assert.equal(copy.defaultPrevented, true);
  assert.deepEqual(events.events.map((event) => ({
    outcome: event.outcome,
    reasonCode: event.reasonCode,
  })), [{ outcome: 'failed', reasonCode: 'copy-selection-limit' }]);
});

test('copy bounds pending async writes, releases failed slots, and clears them on unmount', async (t) => {
  const maximumPendingCopies = 32;
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-copy-pending-boundary',
    rowHeight: 28,
    clipboardPolicy: {
      authorize() {
        policyCalls += 1;
        return {
          decisionId: 'pending-copy-allow',
          allowed: true,
        };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const writes = [];
  const pendingWrites = [];
  window.navigator = {
    clipboard: {
      writeText(text) {
        const pending = deferred();
        writes.push(text);
        pendingWrites.push(pending);
        return pending.promise;
      },
    },
  };
  const clipboardEvents = recordEvents(editor, ['clipboardOperation']);
  t.after(() => clipboardEvents.stop());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  for (let index = 0; index < maximumPendingCopies; index += 1) {
    const copy = fakeEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
    });
    grid.dispatchEvent(copy);
    assert.equal(copy.defaultPrevented, true);
  }
  assert.equal(policyCalls, maximumPendingCopies);
  assert.equal(writes.length, maximumPendingCopies);

  const boundedCopy = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(boundedCopy);
  assert.equal(boundedCopy.defaultPrevented, true);
  assert.equal(policyCalls, maximumPendingCopies);
  assert.equal(writes.length, maximumPendingCopies);
  assert.deepEqual(clipboardEvents.events.map((event) => ({
    outcome: event.outcome,
    method: event.method,
    decisionId: event.decisionId,
    reasonCode: event.reasonCode,
  })), [
    {
      outcome: 'failed',
      method: undefined,
      decisionId: undefined,
      reasonCode: 'pending-capacity',
    },
  ]);

  pendingWrites[0].reject(new Error('clipboard write rejected'));
  await turn();
  assert.deepEqual(clipboardEvents.events.at(-1).outcome, 'failed');
  assert.equal(clipboardEvents.events.at(-1).method, 'async');
  assert.equal(clipboardEvents.events.at(-1).reasonCode, undefined);

  const retry = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(retry);
  assert.equal(retry.defaultPrevented, true);
  assert.equal(policyCalls, maximumPendingCopies + 1);
  assert.equal(writes.length, maximumPendingCopies + 1);

  expectOk(editor.unmount());
  for (const pending of pendingWrites) {
    pending.resolve();
  }
  await turn();
  assert.equal(clipboardEvents.events.length, 2);

  const remounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await remounting);
  const remountedGrid = container.querySelector('[role="treegrid"]');
  assert.ok(remountedGrid);
  remountedGrid.focus();
  const remountedCopy = fakeEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  remountedGrid.dispatchEvent(remountedCopy);
  assert.equal(remountedCopy.defaultPrevented, true);
  assert.equal(policyCalls, maximumPendingCopies + 2);
  assert.equal(writes.length, maximumPendingCopies + 2);

  pendingWrites.at(-1).resolve();
  await turn();
  assert.deepEqual(clipboardEvents.events.map((event) => ({
    outcome: event.outcome,
    method: event.method,
    decisionId: event.decisionId,
    reasonCode: event.reasonCode,
  })), [
    {
      outcome: 'failed',
      method: undefined,
      decisionId: undefined,
      reasonCode: 'pending-capacity',
    },
    {
      outcome: 'failed',
      method: 'async',
      decisionId: 'pending-copy-allow',
      reasonCode: undefined,
    },
    {
      outcome: 'written',
      method: 'async',
      decisionId: 'pending-copy-allow',
      reasonCode: undefined,
    },
  ]);
});

test('a late Clipboard write audit retains the document generation that produced it', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const write = deferred();
  window.navigator = {
    clipboard: {
      writeText() {
        return write.promise;
      },
    },
  };
  const events = recordEvents(editor, ['clipboardOperation']);
  t.after(() => events.stop());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
    }),
  );
  expectOk(
    await editor.setDocument(
      createSnapshot({ documentId: 'document-b', revision: 'revision-b' }),
    ),
  );
  write.resolve();
  await turn();
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].outcome, 'written');
  assert.equal(events.events[0].documentId, 'document-a');
  assert.equal(events.events[0].documentGeneration, 0);
});

test('plain-text paste parser preserves quoted cells, line endings, and safe bounds', () => {
  const limits = {
    maxBytes: 1024,
    maxRows: 16,
    maxColumns: 16,
    maxCells: 64,
    maxCellBytes: 256,
  };
  const tsv = parseClipboardText('a\t"b\tc"\r\n"d""e"\tline', limits);
  assert.equal(tsv.ok, true);
  assert.deepEqual(tsv.rows, [
    ['a', 'b\tc'],
    ['d"e', 'line'],
  ]);

  const csv = parseClipboardText('a,"b,c"\n"d""e",f', limits);
  assert.equal(csv.ok, true);
  assert.equal(csv.format, 'csv');
  assert.deepEqual(csv.rows, [
    ['a', 'b,c'],
    ['d"e', 'f'],
  ]);

  const trailing = parseClipboardText('a\tb\r\n\r\n', limits);
  assert.equal(trailing.ok, true);
  assert.deepEqual(trailing.rows, [
    ['a', 'b'],
    [''],
  ]);

  const singleColumnRows = parseClipboardText(
    'first\r\nsecond\nthird\rfourth',
    limits,
  );
  assert.equal(singleColumnRows.ok, true);
  assert.equal(singleColumnRows.format, 'tsv');
  assert.deepEqual(singleColumnRows.rows, [
    ['first'],
    ['second'],
    ['third'],
    ['fourth'],
  ]);

  const quotedSingleCell = parseClipboardText(
    '"contains\ta tab\r\nand an escaped ""quote"""',
    limits,
  );
  assert.equal(quotedSingleCell.ok, true);
  assert.equal(quotedSingleCell.format, 'tsv');
  assert.deepEqual(quotedSingleCell.rows, [
    ['contains\ta tab\r\nand an escaped "quote"'],
  ]);

  const quotedSingleColumnRows = parseClipboardText(
    '"first\tvalue"\r\n"second ""value"""',
    limits,
  );
  assert.equal(quotedSingleColumnRows.ok, true);
  assert.equal(quotedSingleColumnRows.format, 'tsv');
  assert.deepEqual(quotedSingleColumnRows.rows, [
    ['first\tvalue'],
    ['second "value"'],
  ]);

  const literalText = parseClipboardText('a literal "quoted" phrase', limits);
  assert.equal(literalText.ok, true);
  assert.equal(literalText.format, 'text');
  assert.deepEqual(literalText.rows, [['a literal "quoted" phrase']]);
  const literalRows = parseClipboardText(
    'first "quoted" row\nsecond "quoted" row',
    limits,
  );
  assert.equal(literalRows.ok, true);
  assert.equal(literalRows.format, 'tsv');
  assert.deepEqual(literalRows.rows, [
    ['first "quoted" row'],
    ['second "quoted" row'],
  ]);
  const quotedLiteralText = parseClipboardText('"quoted phrase"', limits);
  assert.equal(quotedLiteralText.ok, true);
  assert.equal(quotedLiteralText.format, 'text');
  assert.deepEqual(quotedLiteralText.rows, [['"quoted phrase"']]);

  const malformed = parseClipboardText('a\t"b"x', limits);
  assert.deepEqual(malformed, {
    ok: false,
    reason: 'malformed',
    diagnostics: [
      { sourceRow: 0, sourceColumn: 1, code: 'malformed-quote' },
    ],
  });
  const limited = parseClipboardText('four', {
    ...limits,
    maxCellBytes: 3,
  });
  assert.deepEqual(limited, {
    ok: false,
    reason: 'cell-too-large',
    diagnostics: [
      { sourceRow: 0, sourceColumn: 0, code: 'cell-too-large' },
    ],
  });
  const tooManyRows = parseClipboardText('first\nsecond', {
    ...limits,
    maxRows: 1,
  });
  assert.deepEqual(tooManyRows, {
    ok: false,
    reason: 'too-many-rows',
    diagnostics: [
      { sourceRow: 1, sourceColumn: 0, code: 'too-many-rows' },
    ],
  });
});

test('async plain-text parser yields mid-pass and preserves quoted TSV boundaries', async () => {
  const limits = {
    maxBytes: 1024,
    maxRows: 16,
    maxColumns: 16,
    maxCells: 64,
    maxCellBytes: 256,
  };
  const text = 'a\t"b\tc"\r\n"d""e"\temoji \ud83d\ude00';
  const checkpoints = [];
  const expected = parseClipboardText(text, limits);
  const parsed = await parseClipboardTextAsync(text, limits, {
    maxUnitsPerSlice: 1,
    checkpoint(checkpoint) {
      checkpoints.push(checkpoint);
    },
  });

  assert.equal(parsed.status, 'parsed');
  assert.deepEqual(parsed.parsed, expected);
  assert.ok(checkpoints.length > 0);
  assert.equal(checkpoints[0].phase, 'measure');
  assert.ok(checkpoints[0].offset > 0);
  assert.ok(checkpoints[0].offset < text.length);
  assert.equal(
    checkpoints.some((checkpoint) => checkpoint.phase === 'detect'),
    true,
  );
  assert.equal(
    checkpoints.some((checkpoint) => checkpoint.phase === 'parse'),
    true,
  );
});

test('async plain-text parser returns aborted when cancelled at a real checkpoint', async () => {
  const limits = {
    maxBytes: 1024,
    maxRows: 16,
    maxColumns: 16,
    maxCells: 64,
    maxCellBytes: 256,
  };
  const text = 'x'.repeat(512);
  const controller = new AbortController();
  const entered = deferred();
  const release = deferred();
  let checkpointCount = 0;
  const pending = parseClipboardTextAsync(text, limits, {
    signal: controller.signal,
    maxUnitsPerSlice: 1,
    checkpoint(checkpoint) {
      checkpointCount += 1;
      if (checkpointCount === 1) {
        entered.resolve(checkpoint);
        return release.promise;
      }
    },
  });

  const checkpoint = await entered.promise;
  assert.equal(checkpoint.phase, 'measure');
  assert.ok(checkpoint.offset > 0);
  assert.ok(checkpoint.offset < text.length);
  controller.abort();
  release.resolve();

  const result = await pending;
  assert.equal(result.status, 'aborted');
  assert.ok(result.inputBytes > 0);
  assert.ok(result.inputBytes < text.length);
});

test('async plain-text parser aborts during detect and quoted parse checkpoints', async () => {
  const limits = {
    maxBytes: 1024,
    maxRows: 16,
    maxColumns: 16,
    maxCells: 64,
    maxCellBytes: 256,
  };
  const text = 'a\t"b\tc"\r\n"d""e"\temoji \ud83d\ude00';

  for (const phase of ['detect', 'parse']) {
    const controller = new AbortController();
    let checkpointCount = 0;
    const result = await parseClipboardTextAsync(text, limits, {
      signal: controller.signal,
      maxUnitsPerSlice: 1,
      checkpoint(checkpoint) {
        if (checkpoint.phase !== phase || checkpointCount > 0) return;
        checkpointCount += 1;
        controller.abort();
      },
    });

    assert.equal(checkpointCount, 1, `Expected a ${phase} checkpoint.`);
    assert.equal(result.status, 'aborted');
    assert.ok(result.inputBytes > 0);
  }
});

test('async plain-text parser clears its pending scheduler timer when aborted', async (t) => {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timer = {};
  let scheduled = false;
  let cleared = 0;
  globalThis.setTimeout = (callback, delay, ...args) => {
    assert.equal(delay, 0);
    assert.equal(typeof callback, 'function');
    scheduled = true;
    return timer;
  };
  globalThis.clearTimeout = (candidate) => {
    if (candidate === timer) {
      cleared += 1;
    }
  };
  t.after(() => {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
  });
  const controller = new AbortController();
  const pending = parseClipboardTextAsync('x'.repeat(32 * 1024), {
    maxBytes: 64 * 1024,
    maxRows: 16,
    maxColumns: 16,
    maxCells: 64,
    maxCellBytes: 64 * 1024,
  }, { signal: controller.signal });

  assert.equal(scheduled, true);
  controller.abort();

  const result = await pending;
  assert.equal(result.status, 'aborted');
  assert.equal(cleared, 1);
});

test('clipboard parser Worker client carries document context and cancels late results', async () => {
  const messages = [];
  let terminated = 0;
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      messages.push(message);
    },
    terminate() {
      terminated += 1;
    },
  };
  const client = new ClipboardParseWorkerClient(worker);
  const limits = {
    maxBytes: 1024,
    maxRows: 4,
    maxColumns: 2,
    maxCells: 8,
    maxCellBytes: 64,
  };
  const pending = client.parseText(
    'worker value',
    limits,
    { documentId: 'worker-document', documentGeneration: 7 },
  );
  assert.equal(messages[0].protocol, 'bom-editor-clipboard-worker/v1');
  assert.equal(messages[0].type, 'parseText');
  assert.equal(messages[0].documentId, 'worker-document');
  assert.equal(messages[0].documentGeneration, 7);
  messages[0];
  worker.onmessage({
    data: {
      protocol: 'bom-editor-clipboard-worker/v1',
      type: 'parseResult',
      taskId: messages[0].taskId,
      documentId: 'worker-document',
      documentGeneration: 7,
      result: {
        status: 'parsed',
        inputBytes: 12,
        parsed: { ok: true, format: 'text', rows: [['worker value']] },
      },
    },
  });
  assert.deepEqual(await pending, {
    status: 'parsed',
    inputBytes: 12,
    parsed: { ok: true, format: 'text', rows: [['worker value']] },
  });

  const controller = new AbortController();
  const cancelled = client.parseText(
    'cancel me',
    limits,
    { documentId: 'worker-document', documentGeneration: 7 },
    controller.signal,
  );
  const cancelTaskId = messages.at(-1).taskId;
  controller.abort();
  assert.deepEqual(await cancelled, { status: 'aborted', inputBytes: 0 });
  assert.equal(messages.at(-1).type, 'cancel');
  assert.equal(messages.at(-1).taskId, cancelTaskId);

  client.dispose();
  assert.equal(terminated, 1);
});

test('stream clipboard adapter preserves parser grammar across chunks and aborts between chunks', async () => {
  const limits = {
    maxBytes: 1024,
    maxRows: 8,
    maxColumns: 4,
    maxCells: 32,
    maxCellBytes: 128,
  };
  async function* chunks() {
    yield 'first\t"quoted';
    await new Promise((resolve) => setImmediate(resolve));
    yield '\tcell"\r\nsecond\tvalue';
  }
  const parsed = await parseClipboardTextStreamAsync(chunks(), limits);
  assert.equal(parsed.status, 'parsed');
  assert.equal(parsed.parsed.ok, true);
  assert.deepEqual(parsed.parsed.rows, [
    ['first', 'quoted\tcell'],
    ['second', 'value'],
  ]);

  const controller = new AbortController();
  let returned = false;
  async function* abortable() {
    try {
      yield 'a';
      await new Promise((resolve) => setImmediate(resolve));
      yield 'b';
    } finally {
      returned = true;
    }
  }
  const pending = parseClipboardTextStreamAsync(abortable(), limits, controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  const aborted = await pending;
  assert.equal(aborted.status, 'aborted');
  assert.equal(returned, true);
  assert.ok(aborted.inputBytes > 0);

  const hangingController = new AbortController();
  const hanging = parseClipboardTextStreamAsync(
    (async function* () {
      await new Promise(() => {});
      yield 'never';
    })(),
    limits,
    hangingController.signal,
  );
  hangingController.abort();
  assert.deepEqual(await hanging, { status: 'aborted', inputBytes: 0 });

  const limited = await parseClipboardTextStreamAsync(
    (async function* () {
      yield '1234';
      yield '5';
    })(),
    { ...limits, maxBytes: 4 },
  );
  assert.deepEqual(limited, {
    status: 'parsed',
    inputBytes: 5,
    parsed: {
      ok: false,
      reason: 'input-too-large',
      diagnostics: [
        { sourceRow: 0, sourceColumn: 0, code: 'input-too-large' },
      ],
    },
  });
});

test('stream clipboard staging preserves CSV precedence and plain-text fallback', async () => {
  const limits = {
    maxBytes: 4096,
    maxRows: 8,
    maxColumns: 4,
    maxCells: 32,
    maxCellBytes: 128,
  };
  async function* csvChunks() {
    yield 'name,"note';
    yield ', with comma"\r\nnext,"line';
    yield '\nvalue"';
  }
  const csv = await parseClipboardTextStreamAsync(csvChunks(), limits);
  assert.equal(csv.status, 'parsed');
  assert.deepEqual(csv.parsed, {
    ok: true,
    format: 'csv',
    rows: [
      ['name', 'note, with comma'],
      ['next', 'line\nvalue'],
    ],
  });

  async function* textChunks() {
    yield 'literal "quote';
    yield '\r\nnext row';
  }
  const text = await parseClipboardTextStreamAsync(textChunks(), limits);
  assert.equal(text.status, 'parsed');
  assert.deepEqual(text.parsed, {
    ok: true,
    format: 'tsv',
    rows: [['literal "quote'], ['next row']],
  });
});

test('stream clipboard staging carries UTF-16 and CRLF boundaries without joining input', async () => {
  const limits = {
    maxBytes: 4096,
    maxRows: 8,
    maxColumns: 4,
    maxCells: 32,
    maxCellBytes: 128,
  };
  async function* chunks() {
    yield '😀\t';
    yield 'value\r';
    yield '\nnext\t😀';
  }
  const parsed = await parseClipboardTextStreamAsync(chunks(), limits);
  assert.equal(parsed.status, 'parsed');
  assert.equal(parsed.inputBytes, Buffer.byteLength('😀\tvalue\r\nnext\t😀'));
  assert.deepEqual(parsed.parsed, {
    ok: true,
    format: 'tsv',
    rows: [
      ['😀', 'value'],
      ['next', '😀'],
    ],
  });
});

test('mounted editor uses the parser Worker for large text and still commits on the main thread', async (t) => {
  const largeSnapshot = createFlatSnapshot(1000, 'worker-paste-document');
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: largeSnapshot,
    instanceId: 'editor-worker-paste',
    pasteLimits: {
      maxRows: 1000,
      maxCells: 1000,
    },
    pastePolicy: {
      authorize() {
        return { decisionId: 'worker-paste-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const dom = createFakeDom(640, 280);
  const workerInstances = [];
  dom.window.Worker = class {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
      this.messages = [];
      workerInstances.push(this);
    }

    postMessage(message) {
      this.messages.push(message);
      if (message.type !== 'parseText') return;
      const parsed = parseClipboardText(message.text, message.limits);
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            protocol: 'bom-editor-clipboard-worker/v1',
            type: 'parseResult',
            taskId: message.taskId,
            documentId: message.documentId,
            documentGeneration: message.documentGeneration,
            result: {
              status: 'parsed',
              inputBytes: message.text.length,
              parsed,
            },
          },
        });
      });
    }

    terminate() {
      this.terminated = true;
    }
  };
  const mounting = editor.mount(dom.container);
  await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);

  const text = Array.from({ length: 1000 }, () => 'x'.repeat(80)).join('\n');
  const pasted = await editor.pasteText(text);
  assert.equal(pasted.ok, true);
  assert.equal(workerInstances.length, 1);
  assert.equal(workerInstances[0].messages[0].type, 'parseText');
  assert.equal(workerInstances[0].messages[0].documentId, 'worker-paste-document');
  assert.equal(workerInstances[0].messages[0].documentGeneration, 0);
  assert.equal(node(editor.getSnapshot(), 'flat-row-999').fields.name, 'x'.repeat(80));
  editor.destroy();
  assert.equal(workerInstances[0].terminated, true);
});

test('editor accepts a bounded text stream as the same atomic paste pipeline', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  async function* source() {
    yield 'Stream name';
    yield '\tStream note';
  }
  const pasted = await editor.paste({ textStream: source() });
  assert.equal(pasted.ok, true);
  assert.equal(pasted.value.format, 'tsv');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Stream name');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'Stream note');
});

test('async HTML parser extracts bounded table text and expands merged cells', async () => {
  const limits = {
    maxBytes: 4096,
    maxRows: 8,
    maxColumns: 8,
    maxCells: 32,
    maxCellBytes: 128,
  };
  const html = [
    '<!doctype html><style>.secret{display:none}</style>',
    '<table><tbody>',
    '<tr><td rowspan="2">A &amp; B</td><td colspan="2">C</td></tr>',
    '<tr><td>\u003Cscript\u003Eignored\u003C/script\u003E</td></tr>',
    '</tbody></table>',
  ].join('');
  const checkpoints = [];
  const result = await parseHtmlClipboardAsync(html, limits, {
    maxUnitsPerSlice: 1,
    checkpoint(checkpoint) {
      checkpoints.push(checkpoint);
    },
  });
  assert.equal(result.status, 'parsed');
  assert.equal(result.parsed.ok, true);
  assert.deepEqual(result.parsed.rows, [
    ['A & B', 'C', ''],
    ['', '', ''],
  ]);
  assert.ok(checkpoints.length > 0);
  assert.equal(checkpoints[0].phase, 'parse');
});

test('HTML parser rejects unsafe resource shapes, enforces limits, and aborts cooperatively', async () => {
  const limits = {
    maxBytes: 128,
    maxRows: 2,
    maxColumns: 2,
    maxCells: 4,
    maxCellBytes: 8,
  };
  const malformed = await parseHtmlClipboardAsync('<div>text</div>', limits);
  assert.equal(malformed.status, 'parsed');
  assert.deepEqual(malformed.parsed, {
    ok: false,
    reason: 'malformed',
    diagnostics: [
      { sourceRow: 0, sourceColumn: 0, code: 'malformed-html' },
    ],
  });
  const tooManyColumns = await parseHtmlClipboardAsync(
    '<table><tr><td colspan="3">x</td></tr></table>',
    limits,
  );
  assert.equal(tooManyColumns.status, 'parsed');
  assert.deepEqual(tooManyColumns.parsed, {
    ok: false,
    reason: 'too-many-columns',
    diagnostics: [
      { sourceRow: 0, sourceColumn: 0, code: 'too-many-columns' },
    ],
  });
  const tooLarge = await parseHtmlClipboardAsync(
    `<table><tr><td>${'x'.repeat(200)}</td></tr></table>`,
    limits,
  );
  assert.equal(tooLarge.status, 'parsed');
  assert.deepEqual(tooLarge.parsed, {
    ok: false,
    reason: 'input-too-large',
    diagnostics: [
      { sourceRow: 0, sourceColumn: 0, code: 'input-too-large' },
    ],
  });

  const controller = new AbortController();
  let entered = false;
  const pending = parseHtmlClipboardAsync(
    `<table><tr><td>${'x'.repeat(256)}</td></tr></table>`,
    { ...limits, maxBytes: 4096, maxCellBytes: 4096 },
    {
      signal: controller.signal,
      maxUnitsPerSlice: 1,
      checkpoint() {
        if (!entered) {
          entered = true;
          controller.abort();
        }
      },
    },
  );
  const aborted = await pending;
  assert.equal(entered, true);
  assert.equal(aborted.status, 'aborted');
  assert.ok(aborted.inputBytes > 0);
});

test('internal clipboard V1 accepts only a bounded rectangular string envelope', async () => {
  const limits = {
    maxBytes: 1024,
    maxRows: 2,
    maxColumns: 2,
    maxCells: 4,
    maxCellBytes: 16,
  };
  const valid = await parseInternalClipboardAsync(
    createInternalClipboard([['A\nB', 'C'], ['D', 'E']]),
    limits,
  );
  assert.equal(valid.status, 'parsed');
  assert.equal(valid.parsed.ok, true);
  assert.deepEqual(valid.parsed.rows, [['A\nB', 'C'], ['D', 'E']]);

  const malformedInputs = [
    '{"format":"bom-editor/clipboard","format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["A"]]}',
    '{"format":"bom-editor/clipboard","version":1,"kind":"cell-grid-text","rows":[["A"]],"__proto__":"x"}',
    createInternalClipboard([['A'], ['B', 'C']]),
    createInternalClipboard([[1]]),
  ];
  for (const input of malformedInputs) {
    const parsed = await parseInternalClipboardAsync(input, limits);
    assert.equal(parsed.status, 'parsed');
    assert.equal(parsed.parsed.ok, false);
    assert.equal(parsed.parsed.reason, 'malformed');
    assert.equal(parsed.parsed.diagnostics?.length, 1);
    assert.equal(parsed.parsed.diagnostics?.[0]?.code, 'malformed-internal');
  }
  const unsupported = await parseInternalClipboardAsync(
    JSON.stringify({
      format: 'bom-editor/clipboard',
      version: 2,
      kind: 'cell-grid-text',
      rows: [['A']],
    }),
    limits,
  );
  assert.equal(unsupported.status, 'parsed');
  assert.deepEqual(unsupported.parsed, {
    ok: false,
    reason: 'unsupported',
    diagnostics: [
      { sourceRow: 0, sourceColumn: 0, code: 'unsupported' },
    ],
  });
  const tooManyRows = await parseInternalClipboardAsync(
    createInternalClipboard([['A'], ['B'], ['C']]),
    limits,
  );
  assert.equal(tooManyRows.status, 'parsed');
  assert.deepEqual(tooManyRows.parsed, {
    ok: false,
    reason: 'too-many-rows',
    diagnostics: [
      { sourceRow: 2, sourceColumn: 0, code: 'too-many-rows' },
    ],
  });

  const controller = new AbortController();
  const aborted = await parseInternalClipboardAsync(
    createInternalClipboard([['A']]),
    limits,
    {
      signal: controller.signal,
      maxUnitsPerSlice: 1,
      checkpoint() {
        controller.abort();
      },
    },
  );
  assert.equal(aborted.status, 'aborted');
});

test('branch clipboard parser validates the independent tree envelope', async () => {
  const limits = {
    maxBytes: 16 * 1024,
    maxRows: 8,
    maxColumns: 8,
    maxCells: 64,
    maxCellBytes: 1024,
  };
  const parsed = await parseBranchClipboardAsync(
    createBranchClipboard(),
    limits,
  );
  assert.equal(parsed.status, 'parsed');
  assert.equal(parsed.parsed.ok, true);
  assert.deepEqual(parsed.parsed.envelope.roots, ['branch-root']);
  assert.deepEqual(
    parsed.parsed.envelope.nodes.map((entry) => entry.occurrenceId),
    ['branch-root', 'branch-child', 'branch-leaf'],
  );
  const malformed = await parseBranchClipboardAsync(
    JSON.stringify({
      format: 'bom-editor/clipboard',
      version: 1,
      kind: 'branch-tree',
      roots: ['branch-root'],
      includeDescendants: true,
      nodes: [{
        occurrenceId: 'branch-root',
        kind: 'group',
        parentId: null,
        positionKey: 'A',
        fields: { name: 'Root' },
        unknown: true,
      }],
    }),
    limits,
  );
  assert.equal(malformed.status, 'parsed');
  assert.deepEqual(malformed.parsed, { ok: false, reason: 'malformed' });
  const controller = new AbortController();
  const aborted = await parseBranchClipboardAsync(
    createBranchClipboard(),
    limits,
    {
      signal: controller.signal,
      checkpoint() {
        controller.abort();
      },
    },
  );
  assert.equal(aborted.status, 'aborted');
});

test('branch paste remaps IDs, preserves hierarchy, authorizes values, and is undoable', async (t) => {
  const requests = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-branch-paste-success',
    pastePolicy: {
      authorize(request) {
        requests.push(request);
        return { decisionId: 'branch-paste-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['transactionCommitted', 'pasteOperation']);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  const pasted = await editor.paste({ internal: createBranchClipboard() });
  assert.equal(pasted.ok, true);
  assert.equal(pasted.value.format, 'internal');
  assert.equal(pasted.value.rowCount, 3);
  assert.equal(pasted.value.columnCount, 0);
  assert.equal(pasted.value.cellCount, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].operation, 'paste');
  assert.equal(requests[0].cells.length, 6);
  const snapshot = editor.getSnapshot();
  assert.deepEqual(snapshot.roots, [
    'row-1',
    'editor-branch-paste-success:branch-paste:1:0',
    'row-2',
  ]);
  const pastedRoot = node(snapshot, 'editor-branch-paste-success:branch-paste:1:0');
  const pastedChild = node(snapshot, 'editor-branch-paste-success:branch-paste:1:1');
  const pastedLeaf = node(snapshot, 'editor-branch-paste-success:branch-paste:1:2');
  assert.equal(pastedRoot.parentId, null);
  assert.equal(pastedChild.parentId, pastedRoot.occurrenceId);
  assert.equal(pastedLeaf.parentId, pastedChild.occurrenceId);
  assert.equal(pastedRoot.fields.name, 'Root');
  assert.equal(pastedLeaf.fields.note, 'Leaf note');
  const commit = events.events.find(
    (event) => event.type === 'transactionCommitted' && event.origin === 'editor:paste-branch',
  );
  assert.ok(commit);
  assert.deepEqual(commit.patch.operations.map((operation) => operation.op), [
    'insertNode',
    'insertNode',
    'insertNode',
  ]);
  expectOk(await editor.undo());
  assert.equal(contentHash(editor.getSnapshot()), before);
});

test('branch paste policy denial leaves the document unchanged', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-branch-paste-denied',
    pastePolicy: {
      authorize() {
        return {
          decisionId: 'branch-paste-deny',
          allowed: false,
          reasonCode: 'no-branch-import',
        };
      },
    },
  });
  t.after(() => editor.destroy());
  const before = contentHash(editor.getSnapshot());
  const result = await editor.paste({ internal: createBranchClipboard() });
  expectError(result, BOM_EDITOR_ERROR_CODES.pastePolicy);
  assert.equal(contentHash(editor.getSnapshot()), before);
});

test('pasteText commits one converted TSV transaction, audits no values, and Undo restores content', async (t) => {
  const requests = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-success',
    rowHeight: 28,
    pastePolicy: {
      authorize(request) {
        requests.push(request);
        return { decisionId: 'paste-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'transactionCommitted',
    'pasteOperation',
    'taskProgress',
  ]);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());

  const pasted = await editor.pasteText(
    'First replacement\tFirst note\r\nSecond replacement\tSecond note',
  );
  assert.equal(pasted.ok, true);
  assert.equal(pasted.value.format, 'tsv');
  assert.equal(pasted.value.cellCount, 4);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'First replacement');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'First note');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.name, 'Second replacement');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'Second note');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].operation, 'paste');
  assert.equal(requests[0].cells.length, 4);
  assert.equal(requests[0].cells[0].value, 'First replacement');
  assert.deepEqual(
    events.events
      .filter((event) => event.type === 'transactionCommitted')
      .map((event) => event.origin),
    ['editor:paste'],
  );
  const audit = events.events.find((event) => event.type === 'pasteOperation');
  assert.ok(audit);
  assert.deepEqual({
    source: audit.source,
    outcome: audit.outcome,
    format: audit.format,
    rowCount: audit.rowCount,
    columnCount: audit.columnCount,
    targetCellCount: audit.targetCellCount,
    diagnosticCount: audit.diagnosticCount,
    decisionId: audit.decisionId,
  }, {
    source: 'api',
    outcome: 'committed',
    format: 'tsv',
    rowCount: 2,
    columnCount: 2,
    targetCellCount: 4,
    diagnosticCount: 0,
    decisionId: 'paste-allow',
  });
  assert.equal(Object.hasOwn(audit, 'text'), false);
  assert.equal(Object.hasOwn(audit, 'value'), false);
  const progress = events.events.filter((event) => event.type === 'taskProgress');
  assert.ok(progress.length >= 4);
  assert.deepEqual(progress.map((event) => event.completed),
    [...progress.map((event) => event.completed)].sort((a, b) => a - b));
  assert.equal(progress.at(-1).stage, 'complete');
  assert.equal(progress.at(-1).completed, 4);

  expectOk(await editor.undo());
  assert.equal(contentHash(editor.getSnapshot()), before);
});

test('previewPaste returns converted cells without committing and reports monotonic progress', async (t) => {
  const requests = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-preview',
    rowHeight: 28,
    pastePolicy: {
      authorize(request) {
        requests.push(request);
        return { decisionId: 'preview-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'taskProgress',
    'transactionCommitted',
    'pasteOperation',
  ]);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());

  const preview = await editor.previewPaste({
    text: 'Preview name\tPreview note',
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.value.format, 'tsv');
  assert.equal(preview.value.rowCount, 1);
  assert.equal(preview.value.columnCount, 2);
  assert.equal(preview.value.cellCount, 2);
  assert.equal(preview.value.decisionId, 'preview-allow');
  assert.deepEqual(
    preview.value.cells.map((cell) => ({
      sourceRow: cell.sourceRow,
      sourceColumn: cell.sourceColumn,
      fieldId: cell.fieldId,
      value: cell.value,
    })),
    [
      { sourceRow: 0, sourceColumn: 0, fieldId: 'name', value: 'Preview name' },
      { sourceRow: 0, sourceColumn: 1, fieldId: 'note', value: 'Preview note' },
    ],
  );
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(requests.length, 1);
  assert.equal(events.events.some((event) => event.type === 'transactionCommitted'), false);
  assert.equal(events.events.some((event) => event.type === 'pasteOperation'), false);
  const progress = events.events.filter((event) => event.type === 'taskProgress');
  assert.ok(progress.length >= 4);
  assert.ok(progress.every((event) => event.taskType === 'paste'));
  assert.ok(progress.every((event) => event.total === 4));
  assert.deepEqual(
    progress.map((event) => event.completed),
    [...progress.map((event) => event.completed)].sort((a, b) => a - b),
  );
  assert.equal(progress.at(-1).stage, 'complete');
  assert.equal(progress.at(-1).completed, 4);
});

test('paste rejects policy, size, read-only, and conversion failures atomically', async (t) => {
  const denied = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-denied',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        return {
          decisionId: 'paste-denied',
          allowed: true,
          deniedCells: [{ sourceRow: 0, sourceColumn: 0, reasonCode: 'no-write' }],
        };
      },
    },
  });
  t.after(() => denied.destroy());
  const deniedEvents = recordEvents(denied, ['pasteOperation']);
  t.after(() => deniedEvents.stop());
  const deniedBefore = contentHash(denied.getSnapshot());
  const deniedResult = await denied.pasteText('changed');
  expectError(deniedResult, BOM_EDITOR_ERROR_CODES.pastePolicy);
  assert.equal(deniedResult.diagnostics.length, 1);
  assert.equal(deniedResult.diagnostics[0].code, 'no-write');
  assert.equal(contentHash(denied.getSnapshot()), deniedBefore);
  assert.equal(deniedEvents.events[0].outcome, 'denied');
  assert.equal(deniedEvents.events[0].decisionId, 'paste-denied');

  const limited = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-limited',
    rowHeight: 28,
    pasteLimits: { maxBytes: 3 },
  });
  t.after(() => limited.destroy());
  const limitedBefore = contentHash(limited.getSnapshot());
  const limitedResult = await limited.pasteText('four');
  expectError(limitedResult, BOM_EDITOR_ERROR_CODES.pasteLimit);
  assert.deepEqual(limitedResult.diagnostics, [
    { sourceRow: 0, sourceColumn: 0, code: 'input-too-large' },
  ]);
  assert.equal(contentHash(limited.getSnapshot()), limitedBefore);

  const readOnlyColumns = Object.freeze([
    columns[0],
    Object.freeze({ ...columns[1], editable: false }),
  ]);
  const readOnly = createBomEditor({
    schema,
    columns: readOnlyColumns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-read-only',
    rowHeight: 28,
  });
  t.after(() => readOnly.destroy());
  const readOnlyResult = await readOnly.pasteText('changed\tblocked');
  expectError(readOnlyResult, BOM_EDITOR_ERROR_CODES.pasteReadOnly);
  assert.equal(node(readOnly.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal(readOnlyResult.diagnostics.length, 1);
  assert.equal(readOnlyResult.diagnostics[0].code, 'read-only');

  const integerSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      schema.fields[0],
      Object.freeze({
        fieldId: 'quantity',
        path: Object.freeze(['quantity']),
        type: Object.freeze({ kind: 'integer', min: '0', max: '99' }),
        required: true,
        nullable: false,
      }),
    ]),
  });
  const integerColumns = Object.freeze([
    columns[0],
    Object.freeze({
      ...columns[1],
      columnId: 'quantity',
      fieldPath: Object.freeze(['quantity']),
      label: 'Quantity',
    }),
  ]);
  const base = createSnapshot();
  const integerSnapshot = {
    ...base,
    nodes: base.nodes.map((entry, index) => ({
      ...entry,
      fields: {
        name: entry.fields.name,
        quantity: { $type: 'integer', value: String(index + 1) },
      },
    })),
  };
  const conversion = createBomEditor({
    schema: integerSchema,
    columns: integerColumns,
    initialDocument: integerSnapshot,
    instanceId: 'editor-paste-conversion',
    rowHeight: 28,
  });
  t.after(() => conversion.destroy());
  const conversionResult = await conversion.pasteText(
    'changed\tnot-an-integer\r\nchanged again\tstill-not-an-integer',
  );
  expectError(conversionResult, BOM_EDITOR_ERROR_CODES.pasteInvalid);
  assert.equal(node(conversion.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal(conversionResult.diagnostics.length, 2);
  assert.deepEqual(
    conversionResult.diagnostics.map((diagnostic) => [
      diagnostic.sourceRow,
      diagnostic.sourceColumn,
    ]),
    [[0, 1], [1, 1]],
  );

  const mixedColumns = Object.freeze([
    integerColumns[1],
    Object.freeze({ ...columns[0], editable: false }),
  ]);
  const mixed = createBomEditor({
    schema: integerSchema,
    columns: mixedColumns,
    initialDocument: integerSnapshot,
    instanceId: 'editor-paste-mixed-diagnostics',
    rowHeight: 28,
  });
  t.after(() => mixed.destroy());
  const mixedBefore = JSON.stringify(mixed.getSnapshot());
  const mixedResult = await mixed.pasteText('not-an-integer\tread-only');
  expectError(mixedResult, BOM_EDITOR_ERROR_CODES.pasteInvalid);
  assert.equal(mixedResult.diagnostics.length, 2);
  assert.deepEqual(
    mixedResult.diagnostics.map((diagnostic) => diagnostic.code),
    ['read-only', 'BOM_INTEGER_NOT_CANONICAL'],
  );
  assert.equal(JSON.stringify(mixed.getSnapshot()), mixedBefore);
});

test('paste parser failures expose value-free source diagnostics in paste and preview', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const before = contentHash(editor.getSnapshot());

  const malformed = await editor.pasteText('name\t"broken"x');
  expectError(malformed, BOM_EDITOR_ERROR_CODES.pasteInvalid);
  assert.deepEqual(malformed.diagnostics, [
    { sourceRow: 0, sourceColumn: 1, code: 'malformed-quote' },
  ]);
  assert.equal(contentHash(editor.getSnapshot()), before);

  const preview = await editor.previewPaste({
    html: '<table><tr><td colspan="999">unsafe width</td></tr></table>',
  });
  expectError(preview, BOM_EDITOR_ERROR_CODES.pasteLimit);
  assert.deepEqual(preview.diagnostics, [
    { sourceRow: 0, sourceColumn: 0, code: 'too-many-columns' },
  ]);
  assert.equal(contentHash(editor.getSnapshot()), before);
});

test('a focused grid native paste uses the same secure editor pipeline', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['pasteOperation']);
  t.after(() => events.stop());
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const paste = fakeEvent('paste', {
    clipboardData: {
      types: ['text/plain'],
      getData(type) {
        assert.equal(type, 'text/plain');
        return 'Native name\tNative note';
      },
    },
  });
  grid.dispatchEvent(paste);
  assert.equal(paste.defaultPrevented, true);
  await turn();
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Native name');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'Native note');
  assert.equal(events.events[0].source, 'event');
  assert.equal(events.events[0].outcome, 'committed');
});

test('paste prioritizes valid HTML, falls back to text, and rejects non-table HTML safely', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['pasteOperation']);
  t.after(() => events.stop());

  const fallback = await editor.paste({
    internal: '{"version":1}',
    html: '<div>not a table</div>',
    text: 'Plain fallback',
  });
  assert.equal(fallback.ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Plain fallback');
  assert.equal(events.events[0].format, 'text');

  const htmlPaste = await editor.paste({
    html: '<table><tr><td>HTML name</td><td>HTML note</td></tr></table>',
  });
  assert.equal(htmlPaste.ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'HTML name');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'HTML note');
  assert.equal(events.events[1].format, 'html');

  const richOnly = await editor.paste({
    html: '<div>untrusted</div>',
  });
  expectError(richOnly, BOM_EDITOR_ERROR_CODES.pasteInvalid);
  assert.equal(events.events[2].format, 'html');
  assert.equal(events.events[2].reasonCode, 'malformed');
  assert.equal(JSON.stringify(events.events[2]).includes('untrusted'), false);
});

test('paste and preview aggregate bounded diagnostics when every clipboard candidate fails', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['pasteOperation']);
  t.after(() => events.stop());
  const input = {
    internal: JSON.stringify({
      format: 'bom-editor/clipboard',
      version: 2,
      kind: 'cell-grid-text',
      rows: [['unsupported']],
    }),
    html: '<div>not a table</div>',
    text: 'name\t"broken"x',
  };
  const expectedDiagnostics = [
    {
      sourceRow: 0,
      sourceColumn: 0,
      code: 'unsupported',
      candidateFormat: 'internal',
    },
    {
      sourceRow: 0,
      sourceColumn: 0,
      code: 'malformed-html',
      candidateFormat: 'html',
    },
    {
      sourceRow: 0,
      sourceColumn: 1,
      code: 'malformed-quote',
      candidateFormat: 'text',
    },
  ];

  const preview = await editor.previewPaste(input);
  expectError(preview, BOM_EDITOR_ERROR_CODES.pasteInvalid);
  assert.equal(preview.error.safeContext?.reason, 'all-candidates-failed');
  assert.deepEqual(preview.diagnostics, expectedDiagnostics);
  assert.equal(Object.isFrozen(preview.diagnostics), true);
  assert.equal(Object.isFrozen(preview.diagnostics[0]), true);

  const pasted = await editor.paste(input);
  expectError(pasted, BOM_EDITOR_ERROR_CODES.pasteInvalid);
  assert.equal(pasted.error.safeContext?.reason, 'all-candidates-failed');
  assert.deepEqual(pasted.diagnostics, expectedDiagnostics);
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].format, 'internal');
  assert.equal(events.events[0].reasonCode, 'all-candidates-failed');
  assert.equal(events.events[0].diagnosticCount, 3);
  assert.equal(JSON.stringify(events.events[0]).includes('unsupported'), false);
  assert.equal(JSON.stringify(events.events[0]).includes('broken'), false);
});

test('an invalid branch candidate still falls back to a safe lower-priority representation', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());

  const pasted = await editor.paste({
    internal: JSON.stringify({
      format: 'bom-editor/clipboard',
      version: 1,
      kind: 'branch-tree',
    }),
    text: 'fallback after invalid branch',
  });

  expectOk(pasted);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'fallback after invalid branch');
});

test('a valid internal clipboard grid takes precedence over text and cannot fall back after policy denial', async (t) => {
  const requests = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-internal-clipboard-priority',
    rowHeight: 28,
    pastePolicy: {
      authorize(request) {
        requests.push(request);
        return { decisionId: 'internal-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['pasteOperation']);
  t.after(() => events.stop());
  const internal = createInternalClipboard([
    ['Internal one', 'Internal note one'],
    ['Internal two', 'Internal note two'],
  ]);

  expectOk(await editor.paste({
    internal,
    text: 'Plain fallback',
  }));
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Internal one');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'Internal note one');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.name, 'Internal two');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'Internal note two');
  assert.equal(events.events[0].format, 'internal');
  assert.deepEqual(
    requests[0].cells.map((cell) => cell.value),
    ['Internal one', 'Internal note one', 'Internal two', 'Internal note two'],
  );

  const deniedRequests = [];
  const deniedEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-internal-clipboard-denied',
    rowHeight: 28,
    pastePolicy: {
      authorize(request) {
        deniedRequests.push(request);
        return { decisionId: 'internal-denied', allowed: false };
      },
    },
  });
  t.after(() => deniedEditor.destroy());
  const before = contentHash(deniedEditor.getSnapshot());
  const denied = await deniedEditor.paste({
    internal,
    text: 'Plain fallback must not be retried',
  });
  expectError(denied, BOM_EDITOR_ERROR_CODES.pastePolicy);
  assert.equal(contentHash(deniedEditor.getSnapshot()), before);
  assert.deepEqual(
    deniedRequests[0].cells.map((cell) => cell.value),
    ['Internal one', 'Internal note one', 'Internal two', 'Internal note two'],
  );
});

test('paste policy audit fields reject unsafe tokens without retaining source values', async (t) => {
  const secret = 'paste value must never be audited';
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-audit-token',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        return {
          decisionId: secret,
          allowed: false,
          reasonCode: secret,
        };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['pasteOperation']);
  t.after(() => events.stop());

  const result = await editor.pasteText('replacement');
  expectError(result, BOM_EDITOR_ERROR_CODES.pastePolicy);
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].decisionId, undefined);
  assert.equal(events.events[0].reasonCode, 'invalid-policy-decision');
  assert.equal(JSON.stringify(events.events[0]).includes(secret), false);
});

test('paste preparation yields to AbortSignal before policy authorization or a commit', async (t) => {
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(600),
    instanceId: 'editor-paste-abort',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'unexpected-policy-call', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['pasteOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  const controller = new AbortController();
  const pending = editor.pasteText(
    new Array(600).fill('cancelled replacement').join('\n'),
    { signal: controller.signal },
  );
  controller.abort();

  const result = await pending;
  expectError(result, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(policyCalls, 0);
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].type, 'pasteOperation');
  assert.equal(events.events[0].reasonCode, 'aborted');
});

test('paste aborts at a cooperative target-row mapping checkpoint', async (t) => {
  let policyCalls = 0;
  const readOnlyColumns = Object.freeze([
    Object.freeze({ ...columns[0], editable: false }),
  ]);
  const editor = createBomEditor({
    schema,
    columns: readOnlyColumns,
    initialDocument: createFlatSnapshot(256),
    instanceId: 'editor-paste-target-mapping-abort',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'unexpected-policy-call', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['pasteOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  const controller = new AbortController();

  // The input stays below the parser's 8 KiB slice threshold. With 256
  // read-only rows, the first zero-delay timer can only be the target-row
  // mapper's cooperative checkpoint; preparation itself does not yield.
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const targetMappingTimer = {};
  let releaseTargetMappingYield;
  let clearedTargetMappingTimer = 0;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (
      releaseTargetMappingYield === undefined &&
      delay === 0 &&
      typeof callback === 'function'
    ) {
      releaseTargetMappingYield = () => callback(...args);
      return targetMappingTimer;
    }
    return nativeSetTimeout(callback, delay, ...args);
  };
  globalThis.clearTimeout = (timer) => {
    if (timer === targetMappingTimer) {
      clearedTargetMappingTimer += 1;
    }
  };
  t.after(() => {
    controller.abort();
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
  });

  const pending = editor.pasteText(new Array(256).fill('x').join('\n'), {
    signal: controller.signal,
  });
  await turn();
  assert.equal(typeof releaseTargetMappingYield, 'function');
  controller.abort();

  const result = await pending;
  expectError(result, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(clearedTargetMappingTimer, 1);
  assert.equal(policyCalls, 0);
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    0,
  );
  const audit = events.events.find((event) => event.type === 'pasteOperation');
  assert.ok(audit);
  assert.equal(audit.outcome, 'failed');
  assert.equal(audit.reasonCode, 'aborted');
});

test('paste aborts during asynchronous plain-text parsing before policy or a transaction', async (t) => {
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-parse-abort',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'unexpected-policy-call', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['pasteOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  const controller = new AbortController();

  // This input exceeds multiple production parser slices. Advancing one timer
  // lets the parser finish one slice and pause again before cancellation.
  const pending = editor.pasteText('x'.repeat(32 * 1024), {
    signal: controller.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();

  const result = await pending;
  expectError(result, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(policyCalls, 0);
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    0,
  );
  const audit = events.events.find((event) => event.type === 'pasteOperation');
  assert.ok(audit);
  assert.equal(audit.outcome, 'failed');
  assert.equal(audit.reasonCode, 'aborted');
});

test('paste aborts when beforeTransaction synchronously cancels its signal', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['pasteOperation', 'transactionCommitted']);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  const controller = new AbortController();
  let beforeTransactionCalls = 0;
  const stopBeforeTransaction = editor.on('beforeTransaction', () => {
    beforeTransactionCalls += 1;
    controller.abort();
  });
  t.after(() => stopBeforeTransaction());

  const result = await editor.pasteText('Cancelled before commit', {
    signal: controller.signal,
  });

  expectError(result, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(beforeTransactionCalls, 1);
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    0,
  );
  const audit = events.events.find((event) => event.type === 'pasteOperation');
  assert.ok(audit);
  assert.equal(audit.outcome, 'failed');
  assert.equal(audit.reasonCode, 'aborted');
});

test('paste fails closed when beforeTransaction changes its selection', async (t) => {
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-precommit-edit-race',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'paste-precommit-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const events = recordEvents(editor, [
    'beforeTransaction',
    'pasteOperation',
    'transactionCommitted',
  ]);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  let beforeTransactionCalls = 0;
  let selectionKeyEvent;
  const stopBeforeTransaction = editor.on('beforeTransaction', (event) => {
    if (event.origin !== 'editor:paste') return;
    beforeTransactionCalls += 1;
    selectionKeyEvent = fakeEvent('keydown', { key: 'ArrowRight' });
    grid.dispatchEvent(selectionKeyEvent);
  });
  t.after(() => stopBeforeTransaction());

  const result = await editor.pasteText('Must not commit');

  expectError(result, BOM_EDITOR_ERROR_CODES.pasteConflict);
  assert.equal(result.error.safeContext?.reason, 'stale-selection');
  assert.equal(beforeTransactionCalls, 1);
  assert.equal(policyCalls, 1);
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.ok(selectionKeyEvent);
  assert.equal(selectionKeyEvent.defaultPrevented, true);
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    0,
  );
  const audit = events.events.find((event) => event.type === 'pasteOperation');
  assert.ok(audit);
  assert.equal(audit.outcome, 'failed');
  assert.equal(audit.reasonCode, 'stale-selection');
});

test('destroy during asynchronous plain-text parsing settles paste as destroyed', async (t) => {
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-parse-destroy',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'unexpected-policy-call', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());

  const pending = editor.pasteText('x'.repeat(32 * 1024));
  await new Promise((resolve) => setTimeout(resolve, 0));
  editor.destroy();

  const result = await pending;
  expectError(result, BOM_EDITOR_ERROR_CODES.destroyed);
  assert.equal(policyCalls, 0);
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(events.events.length, 0);
});

test('paste reserves FIFO order ahead of a later document replacement while parsing', async (t) => {
  let policyCalls = 0;
  const initial = createFlatSnapshot(5000, 'fifo-paste-document');
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: initial,
    instanceId: 'editor-paste-fifo-document',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'unexpected-policy-call', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'pasteOperation',
    'transactionCommitted',
    'documentReplaced',
  ]);
  t.after(() => events.stop());

  const pending = editor.pasteText(
    new Array(5000).fill('Queued paste').join('\n'),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const replacement = createFlatSnapshot(5000, 'fifo-paste-document');
  replacement.nodes[0] = {
    ...replacement.nodes[0],
    fields: { name: 'Replacement after paste', note: 'initial' },
  };
  const replacing = editor.setDocument(replacement);

  const pasted = await pending;
  assert.equal(pasted.ok, true);
  assert.equal(policyCalls, 1);
  expectOk(await replacing);
  assert.equal(editor.getDiagnostics().documentGeneration, 1);
  assert.equal(
    node(editor.getSnapshot(), 'flat-row-0').fields.name,
    'Replacement after paste',
  );
  const audit = events.events.find((event) => event.type === 'pasteOperation');
  const replacementEvent = events.events.find(
    (event) => event.type === 'documentReplaced',
  );
  assert.ok(audit);
  assert.ok(replacementEvent);
  assert.equal(audit.outcome, 'committed');
  assert.equal(audit.documentId, 'fifo-paste-document');
  assert.equal(audit.documentGeneration, 0);
  const pasteCommitted = events.events.find(
    (event) =>
      event.type === 'transactionCommitted' && event.origin === 'editor:paste',
  );
  assert.ok(pasteCommitted);
  assert.ok(events.events.indexOf(audit) < events.events.indexOf(replacementEvent));
  assert.ok(
    events.events.indexOf(pasteCommitted) <
      events.events.indexOf(replacementEvent),
  );
});

test('rich-only paste rejection waits behind an earlier incremental paste', async (t) => {
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(256, 'fifo-rich-only-document'),
    instanceId: 'editor-paste-fifo-rich-only',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'fifo-rich-only-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'transactionCommitted',
    'pasteOperation',
  ]);
  t.after(() => events.stop());

  const firstValue = `Queued plain text ${'x'.repeat(80)}`;
  const firstInput = new Array(256).fill(firstValue).join('\n');
  assert.ok(firstInput.length > 8 * 1024);
  const firstPending = editor.pasteText(firstInput);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const richOnlyValue = '<div>not-audited</div>';
  const rejectedPending = editor.paste({ html: richOnlyValue });

  const first = expectOk(await firstPending);
  const rejected = await rejectedPending;
  expectError(rejected, BOM_EDITOR_ERROR_CODES.pasteInvalid);
  assert.equal(rejected.error.safeContext?.reason, 'malformed');
  assert.equal(policyCalls, 1);
  assert.deepEqual(
    events.events.map((event) => [event.type, event.transactionId]),
    [
      ['transactionCommitted', first.commit.transactionId],
      ['pasteOperation', first.commit.transactionId],
      ['pasteOperation', undefined],
    ],
  );
  const rejectionAudit = events.events.at(-1);
  assert.equal(rejectionAudit.outcome, 'failed');
  assert.equal(rejectionAudit.format, 'html');
  assert.equal(rejectionAudit.reasonCode, 'malformed');
  assert.equal(JSON.stringify(rejectionAudit).includes(richOnlyValue), false);
});

test('an aborted queued rich-only paste audits as aborted', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(256, 'fifo-rich-only-abort-document'),
    instanceId: 'editor-paste-fifo-rich-only-abort',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'transactionCommitted',
    'pasteOperation',
  ]);
  t.after(() => events.stop());

  const firstValue = `Queued plain text ${'x'.repeat(80)}`;
  const firstInput = new Array(256).fill(firstValue).join('\n');
  assert.ok(firstInput.length > 8 * 1024);
  const firstPending = editor.pasteText(firstInput);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const controller = new AbortController();
  const richOnlyValue = '<div>must-not-audit</div>';
  const abortedPending = editor.paste(
    { html: richOnlyValue },
    { signal: controller.signal },
  );
  controller.abort();

  const first = expectOk(await firstPending);
  const aborted = await abortedPending;
  expectError(aborted, BOM_EDITOR_ERROR_CODES.aborted);
  assert.deepEqual(
    events.events.map((event) => [event.type, event.transactionId]),
    [
      ['transactionCommitted', first.commit.transactionId],
      ['pasteOperation', first.commit.transactionId],
      ['pasteOperation', undefined],
    ],
  );
  const abortAudit = events.events.at(-1);
  assert.equal(abortAudit.outcome, 'failed');
  assert.equal(abortAudit.reasonCode, 'aborted');
  assert.equal(abortAudit.inputBytes, 0);
  assert.equal(abortAudit.format, undefined);
  assert.equal(JSON.stringify(abortAudit).includes(richOnlyValue), false);
});

test('back-to-back pastes retain invocation FIFO through incremental parsing', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(256, 'fifo-paste-paste-document'),
    instanceId: 'editor-paste-fifo-paste',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'transactionCommitted',
    'pasteOperation',
  ]);
  t.after(() => events.stop());

  // This spans multiple production parser slices while keeping every cell
  // within the schema's maxLength bound.
  const firstValue = `First queued ${'x'.repeat(80)}`;
  const firstInput = new Array(256).fill(firstValue).join('\n');
  assert.ok(firstInput.length > 8 * 1024);

  const firstPending = editor.pasteText(firstInput);
  const secondPending = editor.pasteText('Second queued paste');
  const first = expectOk(await firstPending);
  const second = expectOk(await secondPending);

  assert.equal(
    node(editor.getSnapshot(), 'flat-row-0').fields.name,
    'Second queued paste',
  );
  assert.deepEqual(
    events.events.map((event) => [event.type, event.transactionId]),
    [
      ['transactionCommitted', first.commit.transactionId],
      ['pasteOperation', first.commit.transactionId],
      ['transactionCommitted', second.commit.transactionId],
      ['pasteOperation', second.commit.transactionId],
    ],
  );
});

test('an aborted queued paste audits safely and releases later commands', async (t) => {
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createFlatSnapshot(512, 'fifo-paste-abort-document'),
    instanceId: 'editor-paste-fifo-abort',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'fifo-paste-allow', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, [
    'transactionCommitted',
    'pasteOperation',
  ]);
  t.after(() => events.stop());

  const firstValue = `First parsing ${'x'.repeat(80)}`;
  const firstInput = new Array(512).fill(firstValue).join('\n');
  assert.ok(firstInput.length > 8 * 1024);
  const firstPending = editor.pasteText(firstInput);

  // Let the first paste reach one of its parser checkpoints before enqueuing
  // the second invocation. The second must still produce its own terminal
  // audit record after it is cancelled while waiting in FIFO order.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const controller = new AbortController();
  const redactedValue = 'queued-abort-value-must-not-be-audited';
  const abortedPending = editor.pasteText(redactedValue, {
    signal: controller.signal,
  });
  controller.abort();
  const followingPending = editor.execute({
    type: 'setField',
    occurrenceId: 'flat-row-0',
    fieldPath: ['name'],
    value: 'Follow-up command',
  }, { origin: 'test:paste-queue-follow-up' });

  const first = expectOk(await firstPending);
  const aborted = await abortedPending;
  expectError(aborted, BOM_EDITOR_ERROR_CODES.aborted);
  const following = expectOk(await followingPending);

  assert.equal(policyCalls, 1);
  assert.equal(
    node(editor.getSnapshot(), 'flat-row-0').fields.name,
    'Follow-up command',
  );
  const abortedAudit = events.events.find(
    (event) => event.type === 'pasteOperation' && event.reasonCode === 'aborted',
  );
  assert.ok(abortedAudit);
  assert.equal(abortedAudit.outcome, 'failed');
  assert.equal(abortedAudit.inputBytes, 0);
  assert.equal(abortedAudit.transactionId, undefined);
  assert.equal(Object.hasOwn(abortedAudit, 'text'), false);
  assert.equal(Object.hasOwn(abortedAudit, 'value'), false);
  assert.equal(Object.hasOwn(abortedAudit, 'cells'), false);
  assert.equal(JSON.stringify(abortedAudit).includes(redactedValue), false);
  assert.deepEqual(
    events.events.map((event) => [event.type, event.transactionId]),
    [
      ['transactionCommitted', first.commit.transactionId],
      ['pasteOperation', first.commit.transactionId],
      ['pasteOperation', undefined],
      ['transactionCommitted', following.transactionId],
    ],
  );
});

test('paste fails closed after a selection round-trip during asynchronous parsing', async (t) => {
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-parse-selection-race',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'unexpected-policy-call', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const events = recordEvents(editor, [
    'pasteOperation',
    'selectionChanged',
    'transactionCommitted',
  ]);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());

  const pending = editor.pasteText('x'.repeat(32 * 1024));
  await new Promise((resolve) => setTimeout(resolve, 0));
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowRight' }));
  grid.dispatchEvent(fakeEvent('keydown', { key: 'ArrowLeft' }));
  window.flushAnimationFrames();

  const result = await pending;
  expectError(result, BOM_EDITOR_ERROR_CODES.pasteConflict);
  assert.equal(result.error.safeContext?.reason, 'stale-selection');
  assert.equal(policyCalls, 0);
  assert.equal(contentHash(editor.getSnapshot()), before);
  const selectionChanges = events.events.filter(
    (event) => event.type === 'selectionChanged',
  );
  assert.equal(selectionChanges.length, 2);
  assert.deepEqual(selectionChanges[1].selection, {
    activeCell: { occurrenceId: 'row-1', columnId: 'name' },
    range: null,
  });
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    0,
  );
  const audit = events.events.find((event) => event.type === 'pasteOperation');
  assert.ok(audit);
  assert.equal(audit.outcome, 'failed');
  assert.equal(audit.reasonCode, 'stale-selection');
});

test('paste fails closed when F2 starts an edit during asynchronous parsing', async (t) => {
  let policyCalls = 0;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-paste-parse-edit-race',
    rowHeight: 28,
    pastePolicy: {
      authorize() {
        policyCalls += 1;
        return { decisionId: 'unexpected-policy-call', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  const events = recordEvents(editor, [
    'editStart',
    'pasteOperation',
    'transactionCommitted',
  ]);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());

  const pending = editor.pasteText('x'.repeat(32 * 1024));
  await new Promise((resolve) => setTimeout(resolve, 0));
  grid.dispatchEvent(fakeEvent('keydown', { key: 'F2' }));
  window.flushAnimationFrames();

  const result = await pending;
  expectError(result, BOM_EDITOR_ERROR_CODES.pasteConflict);
  assert.equal(result.error.safeContext?.reason, 'stale-selection');
  assert.equal(policyCalls, 0);
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(
    events.events.filter((event) => event.type === 'editStart').length,
    1,
  );
  assert.equal(
    events.events.filter((event) => event.type === 'transactionCommitted').length,
    0,
  );
  const audit = events.events.find((event) => event.type === 'pasteOperation');
  assert.ok(audit);
  assert.equal(audit.outcome, 'failed');
  assert.equal(audit.reasonCode, 'stale-selection');
});

test('paste requires an exact rectangular range and preserves FIFO command order', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowDown',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();

  const mismatch = await editor.pasteText('single');
  expectError(mismatch, BOM_EDITOR_ERROR_CODES.pasteTarget);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
  const matched = await editor.pasteText('A\tB\r\nC\tD');
  assert.equal(matched.ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'A');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'D');

  const raceEditor = createEditor();
  t.after(() => raceEditor.destroy());
  const events = recordEvents(raceEditor, ['pasteOperation']);
  t.after(() => events.stop());
  const earlier = raceEditor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['name'],
    value: 'Earlier transaction',
  });
  const laterPaste = raceEditor.pasteText('Late paste');
  expectOk(await earlier);
  assert.equal((await laterPaste).ok, true);
  assert.equal(node(raceEditor.getSnapshot(), 'row-1').fields.name, 'Late paste');
  assert.equal(events.events[0].outcome, 'committed');

  const generationEditor = createEditor();
  t.after(() => generationEditor.destroy());
  const generationEvents = recordEvents(generationEditor, ['pasteOperation']);
  t.after(() => generationEvents.stop());
  const replacing = generationEditor.setDocument(
    createSnapshot({ documentId: 'document-b', revision: 'revision-b' }),
  );
  const laterDocumentPaste = generationEditor.pasteText('Late document paste');
  expectOk(await replacing);
  assert.equal((await laterDocumentPaste).ok, true);
  assert.equal(generationEditor.getSnapshot().documentId, 'document-b');
  assert.equal(
    node(generationEditor.getSnapshot(), 'row-1').fields.name,
    'Late document paste',
  );
  assert.equal(generationEvents.events.length, 1);
  assert.equal(generationEvents.events[0].documentId, 'document-b');
  assert.equal(generationEvents.events[0].documentGeneration, 1);
  assert.equal(generationEvents.events[0].outcome, 'committed');
});

test('paste applies one rectangle atomically to multiple same-sized ranges', async (t) => {
  const snapshot = createFlatSnapshot(6, 'paste-multi-range');
  const firstRange = {
    anchor: { occurrenceId: 'flat-row-0', columnId: 'name' },
    focus: { occurrenceId: 'flat-row-1', columnId: 'note' },
  };
  const secondRange = {
    anchor: { occurrenceId: 'flat-row-3', columnId: 'name' },
    focus: { occurrenceId: 'flat-row-4', columnId: 'note' },
  };
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-paste-multi-range',
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-4', columnId: 'note' },
        range: secondRange,
        ranges: [firstRange, secondRange],
      },
    },
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());

  const pasted = await editor.pasteText('A\tA-note\r\nB\tB-note');
  assert.equal(pasted.ok, true);
  for (const rowId of ['flat-row-0', 'flat-row-3']) {
    assert.equal(node(editor.getSnapshot(), rowId).fields.name, 'A');
    assert.equal(node(editor.getSnapshot(), rowId).fields.note, 'A-note');
  }
  for (const rowId of ['flat-row-1', 'flat-row-4']) {
    assert.equal(node(editor.getSnapshot(), rowId).fields.name, 'B');
    assert.equal(node(editor.getSnapshot(), rowId).fields.note, 'B-note');
  }
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.name, 'Part 2');
  assert.equal(events.events.filter((event) => event.origin === 'editor:paste').length, 1);

  const undone = await editor.undo();
  assert.equal(undone.ok, true);
  assert.equal(node(editor.getSnapshot(), 'flat-row-0').fields.name, 'Part 0');
  assert.equal(node(editor.getSnapshot(), 'flat-row-3').fields.name, 'Part 3');
});

test('paste rejects overlapping multi-range mappings without partial changes', async (t) => {
  const snapshot = createFlatSnapshot(4, 'paste-multi-range-overlap');
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-paste-multi-range-overlap',
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-2', columnId: 'note' },
        range: {
          anchor: { occurrenceId: 'flat-row-1', columnId: 'name' },
          focus: { occurrenceId: 'flat-row-2', columnId: 'note' },
        },
        ranges: [
          {
            anchor: { occurrenceId: 'flat-row-0', columnId: 'name' },
            focus: { occurrenceId: 'flat-row-1', columnId: 'note' },
          },
          {
            anchor: { occurrenceId: 'flat-row-1', columnId: 'name' },
            focus: { occurrenceId: 'flat-row-2', columnId: 'note' },
          },
        ],
      },
    },
  });
  t.after(() => editor.destroy());
  const before = contentHash(editor.getSnapshot());
  const pasted = await editor.pasteText('A\tA-note\r\nB\tB-note');
  expectError(pasted, BOM_EDITOR_ERROR_CODES.pasteTarget);
  assert.equal(pasted.error.safeContext?.reason, 'duplicate-field-target');
  assert.equal(pasted.diagnostics[0]?.code, 'duplicate-field-target');
  assert.equal(contentHash(editor.getSnapshot()), before);
});

test('paste rejects multi-range target limits and read-only targets before policy or commit', async (t) => {
  const snapshot = createFlatSnapshot(5, 'paste-multi-range-limits');
  const ranges = [
    {
      anchor: { occurrenceId: 'flat-row-0', columnId: 'name' },
      focus: { occurrenceId: 'flat-row-1', columnId: 'note' },
    },
    {
      anchor: { occurrenceId: 'flat-row-3', columnId: 'name' },
      focus: { occurrenceId: 'flat-row-4', columnId: 'note' },
    },
  ];
  const limited = createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-paste-multi-range-limit',
    pasteLimits: { maxCells: 4 },
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-4', columnId: 'note' },
        range: ranges[1],
        ranges,
      },
    },
  });
  t.after(() => limited.destroy());
  const limitedResult = await limited.pasteText('A\tA-note\r\nB\tB-note');
  expectError(limitedResult, BOM_EDITOR_ERROR_CODES.pasteLimit);
  assert.equal(limitedResult.error.safeContext?.reason, 'target-cell-limit');

  const readOnlyColumns = columns.map((column) => ({
    ...column,
    editable: false,
  }));
  const readOnly = createBomEditor({
    schema,
    columns: readOnlyColumns,
    initialDocument: createFlatSnapshot(5, 'paste-multi-range-read-only'),
    instanceId: 'editor-paste-multi-range-read-only',
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-4', columnId: 'note' },
        range: ranges[1],
        ranges,
      },
    },
  });
  t.after(() => readOnly.destroy());
  const readOnlyResult = await readOnly.pasteText('A\tA-note\r\nB\tB-note');
  expectError(readOnlyResult, BOM_EDITOR_ERROR_CODES.pasteReadOnly);
  assert.equal(node(readOnly.getSnapshot(), 'flat-row-0').fields.name, 'Part 0');
});

test('Shift navigation preserves its stable anchor, expands a rectangular range, and plain navigation resets it', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['selectionChanged']);

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  const extended = events.events.at(-1);
  assert.deepEqual(extended.selection.activeCell, {
    occurrenceId: 'row-1',
    columnId: 'note',
  });
  assert.deepEqual(extended.selection.range, {
    anchor: { occurrenceId: 'row-1', columnId: 'name' },
    focus: { occurrenceId: 'row-1', columnId: 'note' },
  });

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowDown',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  const expanded = events.events.at(-1);
  assert.deepEqual(expanded.selection.activeCell, {
    occurrenceId: 'row-2',
    columnId: 'note',
  });
  assert.deepEqual(expanded.selection.range, {
    anchor: { occurrenceId: 'row-1', columnId: 'name' },
    focus: { occurrenceId: 'row-2', columnId: 'note' },
  });

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowLeft',
      shiftKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  const reset = events.events.at(-1);
  assert.deepEqual(reset.selection.activeCell, {
    occurrenceId: 'row-2',
    columnId: 'name',
  });
  assert.equal(reset.selection.range, null);
  assert.deepEqual(reset.previous.range, {
    anchor: { occurrenceId: 'row-1', columnId: 'name' },
    focus: { occurrenceId: 'row-2', columnId: 'note' },
  });
});

test('Ctrl or Command+A selects the full visible rectangle once', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['selectionChanged']);

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const selectAll = fakeEvent('keydown', {
    key: 'a',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  });
  grid.dispatchEvent(selectAll);
  window.flushAnimationFrames();
  assert.equal(selectAll.defaultPrevented, true);
  assert.equal(events.events.length, 1);
  assert.deepEqual(events.events[0].selection, {
    activeCell: { occurrenceId: 'row-2', columnId: 'note' },
    range: {
      anchor: { occurrenceId: 'row-1', columnId: 'name' },
      focus: { occurrenceId: 'row-2', columnId: 'note' },
    },
  });

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'A',
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  assert.equal(events.events.length, 1);
});

test('focused grid history shortcuts invoke the existing atomic Undo and Redo transactions', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const selectionEvents = recordEvents(editor, ['selectionChanged']);
  t.after(() => selectionEvents.stop());

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  expectOk(await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['name'],
    value: 'Keyboard history value',
  }, { origin: 'test:keyboard-history' }));
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Keyboard history value');

  const undoCommitted = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:undo',
  );
  const undo = fakeEvent('keydown', {
    key: 'z',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(undo);
  assert.equal(undo.defaultPrevented, true);
  await undoCommitted;
  window.flushAnimationFrames();
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');

  const redoCommitted = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:redo',
  );
  const redo = fakeEvent('keydown', {
    key: 'Z',
    altKey: false,
    ctrlKey: false,
    metaKey: true,
    shiftKey: true,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(redo);
  assert.equal(redo.defaultPrevented, true);
  await redoCommitted;
  window.flushAnimationFrames();
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Keyboard history value');
  assert.equal(selectionEvents.events.length, 0);
});

test('Shift navigation at a boundary does not emit a singleton range and returns to the anchor as a single cell', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['selectionChanged']);

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const initialEventCount = events.events.length;
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowLeft',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  assert.equal(events.events.length, initialEventCount);

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  const extended = events.events.at(-1);
  assert.deepEqual(extended.selection.range, {
    anchor: { occurrenceId: 'row-1', columnId: 'name' },
    focus: { occurrenceId: 'row-1', columnId: 'note' },
  });

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowLeft',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  const returnedToAnchor = events.events.at(-1);
  assert.deepEqual(returnedToAnchor.selection.activeCell, {
    occurrenceId: 'row-1',
    columnId: 'name',
  });
  assert.equal(returnedToAnchor.selection.range, null);
  assert.deepEqual(returnedToAnchor.previous.range, {
    anchor: { occurrenceId: 'row-1', columnId: 'name' },
    focus: { occurrenceId: 'row-1', columnId: 'note' },
  });
});

test('collapsing a subtree containing the active cell falls back to the collapsed row', async (t) => {
  const editor = createTreeEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['selectionChanged']);

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
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
  window.flushAnimationFrames();

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 58,
      clientY: 50,
    }),
  );
  window.flushAnimationFrames();
  const collapsed = events.events.at(-1);
  assert.equal(collapsed.reason, 'view-change');
  assert.deepEqual(collapsed.previous.range, {
    anchor: { occurrenceId: 'root', columnId: 'name' },
    focus: { occurrenceId: 'child', columnId: 'name' },
  });
  assert.deepEqual(collapsed.selection.activeCell, {
    occurrenceId: 'root',
    columnId: 'name',
  });
  assert.equal(collapsed.selection.range, null);
});

test('collapsing a subtree containing the range anchor clears the invalid range', async (t) => {
  const editor = createTreeEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);
  const events = recordEvents(editor, ['selectionChanged']);

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowDown',
      shiftKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();
  grid.dispatchEvent(
    fakeEvent('keydown', {
      key: 'ArrowUp',
      shiftKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false,
    }),
  );
  window.flushAnimationFrames();

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 58,
      clientY: 50,
    }),
  );
  window.flushAnimationFrames();
  const collapsed = events.events.at(-1);
  assert.equal(collapsed.reason, 'view-change');
  assert.deepEqual(collapsed.previous.range, {
    anchor: { occurrenceId: 'child', columnId: 'name' },
    focus: { occurrenceId: 'root', columnId: 'name' },
  });
  assert.deepEqual(collapsed.selection.activeCell, {
    occurrenceId: 'root',
    columnId: 'name',
  });
  assert.equal(collapsed.selection.range, null);
});

test('deleting a range anchor preserves the surviving active cell and clears the range', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
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
  window.flushAnimationFrames();

  const events = recordEvents(editor, ['selectionChanged']);
  t.after(() => events.stop());
  expectOk(await editor.execute(
    { type: 'deleteSubtree', occurrenceId: 'row-1' },
    { origin: 'test:selection-anchor-delete' },
  ));

  assert.equal(events.events.length, 1);
  const selectionChange = events.events[0];
  assert.equal(selectionChange.reason, 'document-change');
  assert.deepEqual(selectionChange.previous, {
    activeCell: { occurrenceId: 'row-2', columnId: 'name' },
    range: {
      anchor: { occurrenceId: 'row-1', columnId: 'name' },
      focus: { occurrenceId: 'row-2', columnId: 'name' },
    },
  });
  assert.deepEqual(selectionChange.selection, {
    activeCell: { occurrenceId: 'row-2', columnId: 'name' },
    range: null,
  });
});

test('draft input avoids Canvas redraw and commit redraws the changed cell once', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = editor.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  await Promise.resolve();
  window.flushAnimationFrames();
  const grid = container.querySelector('[role="treegrid"]');
  grid.dispatchEvent(
    fakeEvent('dblclick', {
      clientX: 80,
      clientY: 50,
    }),
  );
  window.flushAnimationFrames();
  const portal = container.querySelector(
    'input[data-bom-editor-portal="true"]',
  );
  assert.ok(portal);
  const clears = observeCanvasClears(container);

  portal.value = 'Part one edited';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  window.flushAnimationFrames();

  assert.equal(portal.value, 'Part one edited');
  assert.deepEqual(clears, {
    background: 0,
    content: 0,
    interaction: 0,
  });

  const committedEvent = waitForEvent(
    editor,
    'editEnd',
    (event) => event.outcome === 'committed',
  );
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );
  await committedEvent;
  window.flushAnimationFrames();

  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one edited');
  assert.deepEqual(clears, {
    background: 0,
    content: 1,
    interaction: 1,
  });
});

test('component facade emits the next document snapshot for a DOM cell edit', async (t) => {
  const documentChanges = [];
  const documentChanged = deferred();
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-document-output',
    rowHeight: 28,
    outputs: {
      onDocumentChange(event) {
        documentChanges.push(event);
        documentChanged.resolve(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Component output edit';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );

  const change = await documentChanged.promise;
  await flushComponentOutputs();
  assert.equal(documentChanges.length, 1);
  assert.equal(Object.isFrozen(change), true);
  assert.equal(change.origin, 'editor:cell');
  assert.equal(change.snapshot.documentId, 'document-a');
  assert.equal(change.snapshot.revision, change.commit.revision);
  assert.equal(node(change.snapshot, 'row-1').fields.name, 'Component output edit');
  assert.equal(change.commit.patch, change.patch);
  assert.equal(change.patch.documentId, change.snapshot.documentId);
  assert.equal(change.patch.origin, change.origin);
  assert.equal(change.patch.operations.length, 1);
  assert.equal(change.patch.operations[0].op, 'updateField');
});

test('component facade accepts controlled column updates without changing the document', async (t) => {
  const views = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-column-props',
    rowHeight: 28,
    outputs: {
      onViewChange(event) {
        views.push(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);
  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);

  const nextColumns = Object.freeze([
    Object.freeze({
      ...columns[0],
      label: 'Name (controlled)',
      format: Object.freeze({ kind: 'date', dateStyle: 'long' }),
    }),
    Object.freeze({
      ...columns[1],
      width: 220,
      visible: false,
      format: Object.freeze({ kind: 'datetime', dateStyle: 'medium', timeStyle: 'short' }),
    }),
  ]);
  expectOk(await component.update({
    document: createSnapshot(),
    columns: nextColumns,
  }));
  await flushComponentOutputs();

  assert.equal(component.setColumns(nextColumns).ok, true);
  const view = views.at(-1).view;
  assert.equal(view.columns[0].columnId, 'name');
  assert.equal(view.columns[0].width, 160);
  assert.equal(view.columns[1].columnId, 'note');
  assert.equal(view.columns[1].width, 220);
  assert.equal(view.columns[1].visible, false);
  assert.equal(component.focusCell({ occurrenceId: 'row-1', columnId: 'name' }).ok, true);
  const extendedFormats = Object.freeze([
    Object.freeze({
      ...columns[0],
      format: Object.freeze({
        kind: 'accounting',
        currency: 'CNY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      }),
    }),
    Object.freeze({
      ...columns[1],
      format: Object.freeze({
        kind: 'scientific',
        minimumFractionDigits: 1,
        maximumFractionDigits: 3,
      }),
    }),
  ]);
  expectOk(await component.update({
    document: createSnapshot(),
    columns: extendedFormats,
  }));
  assert.equal(component.setColumns(extendedFormats).ok, true);
  const fractionFormats = Object.freeze([
    Object.freeze({
      ...columns[0],
      format: Object.freeze({
        kind: 'fraction',
        maximumDenominator: 64,
        useGrouping: false,
      }),
    }),
    columns[1],
  ]);
  expectOk(await component.update({
    document: createSnapshot(),
    columns: fractionFormats,
  }));
  assert.equal(component.setColumns(fractionFormats).ok, true);
  const invalidFractionFormat = await component.update({
    document: createSnapshot(),
    columns: [
      Object.freeze({
        ...columns[0],
        format: Object.freeze({ kind: 'fraction', maximumDenominator: 1 }),
      }),
      columns[1],
    ],
  });
  assert.equal(invalidFractionFormat.ok, false);
  if (!invalidFractionFormat.ok) {
    assert.equal(invalidFractionFormat.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
  }
  const invalidScientificFormat = await component.update({
    document: createSnapshot(),
    columns: [
      Object.freeze({
        ...columns[0],
        format: Object.freeze({
          kind: 'scientific',
          minimumFractionDigits: 4,
          maximumFractionDigits: 2,
        }),
      }),
      columns[1],
    ],
  });
  assert.equal(invalidScientificFormat.ok, false);
  if (!invalidScientificFormat.ok) {
    assert.equal(invalidScientificFormat.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
  }
  const invalidDateStyle = await component.update({
    document: createSnapshot(),
    columns: [
      Object.freeze({ ...columns[0], format: Object.freeze({ kind: 'date', dateStyle: 'invalid' }) }),
      columns[1],
    ],
  });
  assert.equal(invalidDateStyle.ok, false);
  if (!invalidDateStyle.ok) {
    assert.equal(invalidDateStyle.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
  }
  const invalid = await component.update({
    document: createSnapshot(),
    columns: [
      Object.freeze({ ...columns[0], fieldPath: ['unknown'] }),
      columns[1],
    ],
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
  }
});

test('column fieldName is derived, validated, and controls the bound schema field', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'column-field-name-binding',
    pastePolicy: {
      authorize() {
        return { decisionId: 'column-field-name-paste', allowed: true };
      },
    },
  });
  t.after(() => editor.destroy());

  assert.equal(editor.getViewTemplate().columns[0].fieldName, 'name');
  assert.equal(editor.getViewTemplate().columns[1].fieldName, 'note');

  const reboundColumns = Object.freeze([
    Object.freeze({
      ...columns[0],
      fieldName: 'note',
      fieldPath: Object.freeze(['note']),
    }),
    columns[1],
  ]);
  expectOk(editor.setColumns(reboundColumns));
  assert.deepEqual(editor.getViewTemplate().columns[0].fieldPath, ['note']);
  assert.equal(editor.getViewTemplate().columns[0].fieldName, 'note');

  expectOk(editor.focusCell({ occurrenceId: 'row-1', columnId: 'name' }));
  expectOk(await editor.pasteText('Updated through rebound column'));
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'Updated through rebound column');

  const mismatchedColumns = Object.freeze([
    Object.freeze({ ...reboundColumns[0], fieldName: 'name' }),
    reboundColumns[1],
  ]);
  expectError(editor.setColumns(mismatchedColumns), BOM_EDITOR_ERROR_CODES.configInvalid);
  assert.equal(editor.getViewTemplate().columns[0].fieldName, 'note');
  assert.deepEqual(editor.getViewTemplate().columns[0].fieldPath, ['note']);
});

test('component facade emits document changes for focused grid Undo and Redo shortcuts', async (t) => {
  const documentChanges = [];
  const committed = deferred();
  const undone = deferred();
  const redone = deferred();
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-history-shortcuts',
    rowHeight: 28,
    outputs: {
      onDocumentChange(event) {
        documentChanges.push(event);
        if (event.origin === 'editor:cell') committed.resolve(event);
        if (event.origin === 'editor:undo') undone.resolve(event);
        if (event.origin === 'editor:redo') redone.resolve(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Component history value';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );
  const initial = await committed.promise;
  assert.equal(initial.snapshot.nodes[0].fields.name, 'Component history value');

  grid.focus();
  const undo = fakeEvent('keydown', {
    key: 'z',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(undo);
  assert.equal(undo.defaultPrevented, true);
  const undoChange = await undone.promise;
  assert.equal(Object.isFrozen(undoChange), true);
  assert.equal(undoChange.snapshot.nodes[0].fields.name, 'Part one');

  const redo = fakeEvent('keydown', {
    key: 'Z',
    altKey: false,
    ctrlKey: false,
    metaKey: true,
    shiftKey: true,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(redo);
  assert.equal(redo.defaultPrevented, true);
  const redoChange = await redone.promise;
  assert.equal(Object.isFrozen(redoChange), true);
  assert.equal(redoChange.snapshot.nodes[0].fields.name, 'Component history value');
  await flushComponentOutputs();
  assert.deepEqual(
    documentChanges.map((event) => event.origin),
    ['editor:cell', 'editor:undo', 'editor:redo'],
  );
});

test('focused grid Backspace writes null for nullable fields', async (t) => {
  const nullableSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      schema.fields[0],
      Object.freeze({ ...schema.fields[1], nullable: true }),
    ]),
  });
  const editor = createBomEditor({
    schema: nullableSchema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-delete-nullable',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:delete',
  );
  const remove = deleteSelectionKey({ key: 'Backspace' });
  grid.dispatchEvent(remove);

  assert.equal(remove.defaultPrevented, true);
  const deleted = await committed;
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, null);
  assert.equal(deleted.patch.operations.length, 1);
  assert.equal(deleted.patch.operations[0].op, 'updateField');
  assert.equal(deleted.patch.operations[0].occurrenceId, 'row-1');
  assert.deepEqual(deleted.patch.operations[0].fieldPath, ['note']);
  assert.equal(deleted.patch.operations[0].value, null);
});

test('focused grid Delete resets nonnullable default fields', async (t) => {
  const defaultedSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      schema.fields[0],
      Object.freeze({ ...schema.fields[1], defaultValue: 'default note' }),
    ]),
  });
  const editor = createBomEditor({
    schema: defaultedSchema,
    columns,
    initialDocument: createSnapshot({ firstNote: 'explicit note' }),
    instanceId: 'editor-delete-default',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:delete',
  );
  const remove = deleteSelectionKey();
  grid.dispatchEvent(remove);

  assert.equal(remove.defaultPrevented, true);
  const deleted = await committed;
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'default note');
  assert.equal(deleted.patch.operations.length, 1);
  assert.equal(deleted.patch.operations[0].op, 'unsetField');
  assert.deepEqual(deleted.patch.operations[0].fieldPath, ['note']);
});

test('focused grid Delete unsets optional values and leaves cleared selections unchanged', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());
  const { grid, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:delete',
  );
  const remove = deleteSelectionKey();
  grid.dispatchEvent(remove);

  assert.equal(remove.defaultPrevented, true);
  const deleted = await committed;
  assert.equal(Object.hasOwn(node(editor.getSnapshot(), 'row-1').fields, 'note'), false);
  assert.equal(deleted.patch.operations.length, 1);
  assert.equal(deleted.patch.operations[0].op, 'unsetField');
  const clearedSnapshot = editor.getSnapshot();
  const clearedRevision = clearedSnapshot.revision;

  const retry = deleteSelectionKey();
  grid.dispatchEvent(retry);
  assert.equal(retry.defaultPrevented, true);
  await turn();
  await turn();
  assert.equal(editor.getSnapshot(), clearedSnapshot);
  assert.equal(editor.getSnapshot().revision, clearedRevision);
  assert.equal(
    events.events.filter((event) => event.origin === 'editor:delete').length,
    1,
  );
});

test('focused grid Delete clears a rectangular selection in one transaction and one Undo', async (t) => {
  const snapshot = createSnapshot();
  snapshot.nodes[1].fields.note = 'second note';
  const editor = createEditor(snapshot);
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  const { grid, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:delete',
  );
  const remove = deleteSelectionKey();
  grid.dispatchEvent(remove);

  assert.equal(remove.defaultPrevented, true);
  const deleted = await committed;
  assert.equal(deleted.patch.operations.length, 2);
  assert.deepEqual(
    deleted.patch.operations.map((operation) => operation.op),
    ['unsetField', 'unsetField'],
  );
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, undefined);
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, undefined);
  assert.equal(
    events.events.filter((event) => event.origin === 'editor:delete').length,
    1,
  );

  expectOk(await editor.undo());
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'second note');
});

test('focused grid Delete clears a selected row atomically', async (t) => {
  const rowSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      Object.freeze({ ...schema.fields[0], required: false }),
      schema.fields[1],
    ]),
  });
  const editor = createBomEditor({
    schema: rowSchema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-delete-row',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const selectionEvents = recordEvents(editor, ['selectionChanged']);
  t.after(() => selectionEvents.stop());
  const { grid } = await mountFocusedGrid(editor);

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 20,
      clientY: 50,
      shiftKey: false,
    }),
  );
  assert.deepEqual(selectionEvents.events.at(-1).selection, {
    activeCell: { occurrenceId: 'row-1', columnId: 'note' },
    range: {
      anchor: { occurrenceId: 'row-1', columnId: 'name' },
      focus: { occurrenceId: 'row-1', columnId: 'note' },
    },
    mode: 'row',
  });
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:delete',
  );
  const remove = deleteSelectionKey({ key: 'Backspace' });
  grid.dispatchEvent(remove);
  assert.equal(remove.defaultPrevented, true);
  const deleted = await committed;
  assert.deepEqual(
    deleted.patch.operations.map((operation) => operation.occurrenceId),
    ['row-1', 'row-1'],
  );
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, undefined);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, undefined);
});

test('focused grid Delete clears a selected column across visible rows', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const selectionEvents = recordEvents(editor, ['selectionChanged']);
  t.after(() => selectionEvents.stop());
  const { grid } = await mountFocusedGrid(editor);

  grid.dispatchEvent(
    fakeEvent('pointerdown', {
      button: 0,
      clientX: 220,
      clientY: 20,
      shiftKey: false,
    }),
  );
  assert.deepEqual(selectionEvents.events.at(-1).selection, {
    activeCell: { occurrenceId: 'row-2', columnId: 'note' },
    range: {
      anchor: { occurrenceId: 'row-1', columnId: 'note' },
      focus: { occurrenceId: 'row-2', columnId: 'note' },
    },
    mode: 'column',
  });
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:delete',
  );
  const remove = deleteSelectionKey();
  grid.dispatchEvent(remove);
  assert.equal(remove.defaultPrevented, true);
  const deleted = await committed;
  assert.equal(deleted.patch.operations.length, 1);
  assert.equal(deleted.patch.operations[0].occurrenceId, 'row-1');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, undefined);
});

test('focused grid Delete rejects required and read-only mixed selections atomically', async (t) => {
  const readOnlySchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      Object.freeze({ ...schema.fields[0], required: false }),
      schema.fields[1],
    ]),
  });
  const readOnlyColumns = Object.freeze([
    columns[0],
    Object.freeze({ ...columns[1], editable: false }),
  ]);
  const scenarios = [
    {
      label: 'required',
      schema,
      columns,
      reason: 'required-field',
    },
    {
      label: 'read-only',
      schema: readOnlySchema,
      columns: readOnlyColumns,
      reason: 'read-only',
    },
  ];

  for (const scenario of scenarios) {
    const editor = createBomEditor({
      schema: scenario.schema,
      columns: scenario.columns,
      initialDocument: createSnapshot(),
      instanceId: `editor-delete-reject-${scenario.label}`,
      rowHeight: 28,
    });
    t.after(() => editor.destroy());
    const events = recordEvents(editor, ['transactionCommitted']);
    t.after(() => events.stop());
    const before = editor.getSnapshot();
    const { grid, window } = await mountFocusedGrid(editor);

    grid.dispatchEvent(fakeEvent('keydown', {
      key: 'ArrowRight',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      isComposing: false,
    }));
    window.flushAnimationFrames();
    const rejected = waitForEvent(
      editor,
      'error',
      (event) =>
        event.source === 'transaction' &&
        event.error.code === BOM_EDITOR_ERROR_CODES.deleteInvalid,
    );
    const remove = deleteSelectionKey();
    grid.dispatchEvent(remove);

    assert.equal(remove.defaultPrevented, true);
    const failure = await rejected;
    assert.equal(failure.error.safeContext?.reason, scenario.reason);
    assert.equal(editor.getSnapshot(), before);
    assert.equal(editor.getSnapshot().revision, before.revision);
    assert.equal(events.events.length, 0);
  }
});

test('component facade emits an asynchronous document change for focused grid Delete', async (t) => {
  const documentChanges = [];
  const deleted = deferred();
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-delete-shortcut',
    rowHeight: 28,
    outputs: {
      onDocumentChange(event) {
        documentChanges.push(event);
        if (event.origin === 'editor:delete') deleted.resolve(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  // The first column is required. Move to the editable optional note cell so
  // clearing is represented by the public unsetField transaction semantics.
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    keyCode: 39,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  }));
  window.flushAnimationFrames();

  const remove = fakeEvent('keydown', {
    key: 'Delete',
    keyCode: 46,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
  });
  grid.dispatchEvent(remove);
  assert.equal(remove.defaultPrevented, true);
  assert.deepEqual(documentChanges, []);

  const change = await deleted.promise;
  await flushComponentOutputs();
  assert.equal(documentChanges.length, 1);
  assert.equal(Object.isFrozen(change), true);
  assert.equal(change.origin, 'editor:delete');
  assert.equal(change.snapshot.documentId, 'document-a');
  assert.equal(node(change.snapshot, 'row-1').fields.note, undefined);
  assert.equal(change.snapshot.revision, change.commit.revision);
  assert.equal(change.commit.patch, change.patch);
  assert.equal(change.patch.documentId, change.snapshot.documentId);
  assert.equal(change.patch.origin, 'editor:delete');
  assert.equal(change.patch.operations.length, 1);
  assert.equal(change.patch.operations[0].op, 'unsetField');
  assert.equal(change.patch.operations[0].occurrenceId, 'row-1');
  assert.deepEqual(change.patch.operations[0].fieldPath, ['note']);
});

test('focused grid Ctrl+D fills a visible multi-column range atomically and Undo restores it once', async (t) => {
  const snapshot = createFlatSnapshot(3, 'fill-down-multi-column');
  snapshot.nodes[0].fields = { name: 'Source name', note: 'Source note' };
  snapshot.nodes[1].fields = { name: 'Target one', note: 'Target note one' };
  snapshot.nodes[2].fields = { name: 'Target two', note: 'Target note two' };
  const editor = createEditor(snapshot);
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());
  const before = contentHash(editor.getSnapshot());
  const { grid, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  window.flushAnimationFrames();

  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:fill-down',
  );
  const fill = fillDownKey();
  grid.dispatchEvent(fill);

  assert.equal(fill.defaultPrevented, true);
  const filled = await committed;
  assert.equal(filled.patch.operations.length, 4);
  assert.deepEqual(
    filled.patch.operations.map((operation) => operation.op),
    ['updateField', 'updateField', 'updateField', 'updateField'],
  );
  for (const occurrenceId of ['flat-row-1', 'flat-row-2']) {
    assert.equal(node(editor.getSnapshot(), occurrenceId).fields.name, 'Source name');
    assert.equal(node(editor.getSnapshot(), occurrenceId).fields.note, 'Source note');
  }
  assert.equal(
    events.events.filter((event) => event.origin === 'editor:fill-down').length,
    1,
  );

  expectOk(await editor.undo());
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(node(editor.getSnapshot(), 'flat-row-1').fields.name, 'Target one');
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.note, 'Target note two');
});

test('focused grid Ctrl+D fills disjoint ranges in one transaction', async (t) => {
  const snapshot = createFlatSnapshot(5, 'fill-down-multi-range');
  snapshot.nodes[0].fields = { name: 'Source A', note: 'Note A' };
  snapshot.nodes[1].fields = { name: 'Target A', note: 'Target note A' };
  snapshot.nodes[2].fields = { name: 'Target A2', note: 'Target note A2' };
  snapshot.nodes[3].fields = { name: 'Source B', note: 'Note B' };
  snapshot.nodes[4].fields = { name: 'Target B', note: 'Target note B' };
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-fill-down-multi-range',
    rowHeight: 28,
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-4', columnId: 'note' },
        range: {
          anchor: { occurrenceId: 'flat-row-3', columnId: 'name' },
          focus: { occurrenceId: 'flat-row-4', columnId: 'note' },
        },
        ranges: [
          {
            anchor: { occurrenceId: 'flat-row-0', columnId: 'name' },
            focus: { occurrenceId: 'flat-row-2', columnId: 'note' },
          },
          {
            anchor: { occurrenceId: 'flat-row-3', columnId: 'name' },
            focus: { occurrenceId: 'flat-row-4', columnId: 'note' },
          },
        ],
      },
    },
  });
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);

  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:fill-down',
  );
  const fill = fillDownKey();
  grid.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  const transaction = await committed;
  assert.equal(transaction.patch.operations.length, 6);
  assert.deepEqual(
    transaction.patch.operations.map((operation) => operation.occurrenceId),
    [
      'flat-row-1',
      'flat-row-2',
      'flat-row-1',
      'flat-row-2',
      'flat-row-4',
      'flat-row-4',
    ],
  );
  assert.equal(node(editor.getSnapshot(), 'flat-row-1').fields.name, 'Source A');
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.note, 'Note A');
  assert.equal(node(editor.getSnapshot(), 'flat-row-4').fields.name, 'Source B');
  assert.equal(node(editor.getSnapshot(), 'flat-row-4').fields.note, 'Note B');

  expectOk(await editor.undo());
  assert.equal(node(editor.getSnapshot(), 'flat-row-1').fields.name, 'Target A');
  assert.equal(node(editor.getSnapshot(), 'flat-row-4').fields.note, 'Target note B');
});

test('multi-range fill handle preserves peer ranges and commits one fill transaction', async (t) => {
  const snapshot = createFlatSnapshot(6, 'fill-handle-multi-range');
  snapshot.nodes[0].fields = { name: 'Source A', note: 'Note A' };
  snapshot.nodes[1].fields = { name: 'Target A', note: 'Target note A' };
  snapshot.nodes[3].fields = { name: 'Source B', note: 'Note B' };
  snapshot.nodes[4].fields = { name: 'Target B', note: 'Target note B' };
  snapshot.nodes[5].fields = { name: 'Target B2', note: 'Target note B2' };
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-fill-handle-multi-range',
    rowHeight: 28,
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-4', columnId: 'name' },
        range: {
          anchor: { occurrenceId: 'flat-row-3', columnId: 'name' },
          focus: { occurrenceId: 'flat-row-4', columnId: 'name' },
        },
        ranges: [
          {
            anchor: { occurrenceId: 'flat-row-0', columnId: 'name' },
            focus: { occurrenceId: 'flat-row-1', columnId: 'name' },
          },
          {
            anchor: { occurrenceId: 'flat-row-3', columnId: 'name' },
            focus: { occurrenceId: 'flat-row-4', columnId: 'name' },
          },
        ],
      },
    },
  });
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);
  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:fill-down',
  );

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    pointerId: 64,
    pointerType: 'mouse',
    clientX: 204,
    clientY: 171,
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    pointerId: 64,
    pointerType: 'mouse',
    clientX: 204,
    clientY: 199,
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    pointerId: 64,
    pointerType: 'mouse',
    clientX: 204,
    clientY: 199,
  }));
  window.flushAnimationFrames();

  const transaction = await committed;
  assert.equal(transaction.patch.operations.length, 3);
  assert.equal(node(editor.getSnapshot(), 'flat-row-1').fields.name, 'Source A');
  assert.equal(node(editor.getSnapshot(), 'flat-row-4').fields.name, 'Source B');
  assert.equal(node(editor.getSnapshot(), 'flat-row-5').fields.name, 'Source B');
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.name, 'Part 2');
});

test('focused grid Ctrl+D rejects conflicting overlapping ranges without mutation', async (t) => {
  const snapshot = createFlatSnapshot(4, 'fill-down-overlap-conflict');
  snapshot.nodes[0].fields.note = 'Source A';
  snapshot.nodes[1].fields.note = 'Source B';
  snapshot.nodes[2].fields.note = 'Target C';
  snapshot.nodes[3].fields.note = 'Target D';
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-fill-down-overlap-conflict',
    rowHeight: 28,
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-3', columnId: 'note' },
        range: {
          anchor: { occurrenceId: 'flat-row-1', columnId: 'note' },
          focus: { occurrenceId: 'flat-row-3', columnId: 'note' },
        },
        ranges: [
          {
            anchor: { occurrenceId: 'flat-row-0', columnId: 'note' },
            focus: { occurrenceId: 'flat-row-2', columnId: 'note' },
          },
          {
            anchor: { occurrenceId: 'flat-row-1', columnId: 'note' },
            focus: { occurrenceId: 'flat-row-3', columnId: 'note' },
          },
        ],
      },
    },
  });
  t.after(() => editor.destroy());
  const before = contentHash(editor.getSnapshot());
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());
  const { grid } = await mountFocusedGrid(editor);

  const fill = fillDownKey();
  grid.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  await turn();
  assert.equal(contentHash(editor.getSnapshot()), before);
  assert.equal(events.events.length, 0);
});

test('focused grid Ctrl+D preserves null and absent first-row source semantics', async (t) => {
  const nullableSchema = Object.freeze({
    ...schema,
    fields: Object.freeze([
      schema.fields[0],
      Object.freeze({ ...schema.fields[1], nullable: true }),
    ]),
  });
  const scenarios = [
    {
      label: 'nullable-null',
      schema: nullableSchema,
      sourceFields: { name: 'Source', note: null },
      targetOperation: 'updateField',
      expectedValue: null,
    },
    {
      label: 'absent',
      schema,
      sourceFields: { name: 'Source' },
      targetOperation: 'unsetField',
      expectedValue: undefined,
      expectedAbsent: true,
    },
  ];

  for (const scenario of scenarios) {
    const snapshot = createFlatSnapshot(3, `fill-down-${scenario.label}`);
    snapshot.nodes[0].fields = scenario.sourceFields;
    snapshot.nodes[1].fields = { name: 'Target one', note: 'Target note one' };
    snapshot.nodes[2].fields = { name: 'Target two', note: 'Target note two' };
    const editor = createBomEditor({
      schema: scenario.schema,
      columns,
      initialDocument: snapshot,
      instanceId: `editor-fill-down-${scenario.label}`,
      rowHeight: 28,
    });
    t.after(() => editor.destroy());
    const { grid, window } = await mountFocusedGrid(editor);

    grid.dispatchEvent(fakeEvent('keydown', {
      key: 'ArrowRight',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
    }));
    grid.dispatchEvent(fakeEvent('keydown', {
      key: 'ArrowDown',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      isComposing: false,
    }));
    grid.dispatchEvent(fakeEvent('keydown', {
      key: 'ArrowDown',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      isComposing: false,
    }));
    window.flushAnimationFrames();

    const committed = waitForEvent(
      editor,
      'transactionCommitted',
      (event) => event.origin === 'editor:fill-down',
    );
    const fill = fillDownKey();
    grid.dispatchEvent(fill);

    assert.equal(fill.defaultPrevented, true, scenario.label);
    const filled = await committed;
    assert.deepEqual(
      filled.patch.operations.map((operation) => operation.op),
      [scenario.targetOperation, scenario.targetOperation],
      scenario.label,
    );
    for (const occurrenceId of ['flat-row-1', 'flat-row-2']) {
      assert.equal(
        node(editor.getSnapshot(), occurrenceId).fields.note,
        scenario.expectedValue,
        scenario.label,
      );
      if (scenario.expectedAbsent === true) {
        assert.equal(
          Object.hasOwn(node(editor.getSnapshot(), occurrenceId).fields, 'note'),
          false,
          scenario.label,
        );
      }
    }
  }
});

test('focused grid Ctrl+D rejects a read-only target atomically', async (t) => {
  const readOnlyColumns = Object.freeze([
    columns[0],
    Object.freeze({ ...columns[1], editable: false }),
  ]);
  const snapshot = createFlatSnapshot(2, 'fill-down-read-only');
  snapshot.nodes[0].fields = { name: 'Source name', note: 'Source note' };
  snapshot.nodes[1].fields = { name: 'Target name', note: 'Target note' };
  const editor = createBomEditor({
    schema,
    columns: readOnlyColumns,
    initialDocument: snapshot,
    instanceId: 'editor-fill-down-read-only',
    rowHeight: 28,
  });
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());
  const before = editor.getSnapshot();
  const beforeHash = contentHash(before);
  const { grid, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  window.flushAnimationFrames();

  const fill = fillDownKey();
  grid.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  await turn();
  await turn();
  assert.equal(editor.getSnapshot(), before);
  assert.equal(contentHash(editor.getSnapshot()), beforeHash);
  assert.equal(
    events.events.filter((event) => event.origin === 'editor:fill-down').length,
    0,
  );
});

test('focused grid Ctrl+D fails closed when beforeTransaction changes its selection', async (t) => {
  const snapshot = createFlatSnapshot(2, 'fill-down-selection-race');
  snapshot.nodes[0].fields = { name: 'Source name', note: 'Source note' };
  snapshot.nodes[1].fields = { name: 'Target name', note: 'Target note' };
  const editor = createEditor(snapshot);
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();
  const { grid, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  window.flushAnimationFrames();

  const stop = editor.on('beforeTransaction', () => {
    grid.dispatchEvent(fakeEvent('keydown', {
      key: 'ArrowLeft',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
    }));
  });
  t.after(stop);
  const rejected = waitForEvent(
    editor,
    'transactionRejected',
    (event) => event.origin === 'editor:fill-down',
  );

  const fill = fillDownKey();
  grid.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  const rejection = await rejected;
  assert.equal(rejection.error.code, 'BOM_EDITOR_FILL_DOWN_CONFLICT');
  assert.equal(editor.getSnapshot(), before);
  assert.equal(editor.getSnapshot().revision, before.revision);
});

test('focused grid Ctrl+D is a no-op without a multi-row rectangular range', async (t) => {
  const editor = createEditor(createFlatSnapshot(2, 'fill-down-noop'));
  t.after(() => editor.destroy());
  const events = recordEvents(editor, ['transactionCommitted']);
  t.after(() => events.stop());
  const before = editor.getSnapshot();
  const { grid, window } = await mountFocusedGrid(editor);

  const withoutRange = fillDownKey();
  grid.dispatchEvent(withoutRange);
  assert.equal(withoutRange.defaultPrevented, true);
  await turn();
  await turn();
  assert.equal(editor.getSnapshot(), before);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const singleRow = fillDownKey();
  grid.dispatchEvent(singleRow);
  assert.equal(singleRow.defaultPrevented, true);
  await turn();
  await turn();
  assert.equal(editor.getSnapshot(), before);
  assert.equal(
    events.events.filter((event) => event.origin === 'editor:fill-down').length,
    0,
  );
});

test('component facade emits an asynchronous document change for Command+D fill-down', async (t) => {
  const snapshot = createFlatSnapshot(2, 'component-fill-down');
  snapshot.nodes[0].fields = { name: 'Source name', note: 'Source note' };
  snapshot.nodes[1].fields = { name: 'Target name', note: 'Target note' };
  const documentChanges = [];
  const filled = deferred();
  const component = createBomEditorComponent({
    schema,
    columns,
    document: snapshot,
    instanceId: 'component-fill-down',
    rowHeight: 28,
    outputs: {
      onDocumentChange(event) {
        documentChanges.push(event);
        if (event.origin === 'editor:fill-down') filled.resolve(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  window.flushAnimationFrames();

  const fill = fillDownKey({ command: true });
  grid.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  assert.deepEqual(documentChanges, []);

  const change = await filled.promise;
  await flushComponentOutputs();
  assert.equal(documentChanges.length, 1);
  assert.equal(Object.isFrozen(change), true);
  assert.equal(change.origin, 'editor:fill-down');
  assert.equal(change.snapshot.documentId, 'component-fill-down');
  assert.equal(node(change.snapshot, 'flat-row-1').fields.note, 'Source note');
  assert.equal(change.snapshot.revision, change.commit.revision);
  assert.equal(change.commit.patch, change.patch);
  assert.equal(change.patch.origin, 'editor:fill-down');
  assert.equal(change.patch.operations.length, 1);
  assert.equal(change.patch.operations[0].op, 'updateField');
  assert.equal(change.patch.operations[0].occurrenceId, 'flat-row-1');
  assert.deepEqual(change.patch.operations[0].fieldPath, ['note']);
});

test('Ctrl+Enter fills a visible single-column selection through one undoable transaction', async (t) => {
  const snapshot = createFlatSnapshot(3, 'fill-selection-success');
  snapshot.nodes[0].fields = { name: 'First', note: 'initial' };
  snapshot.nodes[1].fields = { name: 'Second', note: 'initial' };
  snapshot.nodes[2].fields = { name: 'Third', note: 'initial' };
  const editor = createEditor(snapshot);
  t.after(() => editor.destroy());
  const { grid, container, window } = await mountFocusedGrid(editor);

  for (let index = 0; index < 2; index += 1) {
    grid.dispatchEvent(fakeEvent('keydown', {
      key: 'ArrowDown',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      isComposing: false,
    }));
  }
  window.flushAnimationFrames();
  const selectionEvents = recordEvents(editor, ['selectionChanged']);
  t.after(() => selectionEvents.stop());

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Shared name';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:fill-selection',
  );
  const ended = waitForEvent(
    editor,
    'editEnd',
    (event) => event.outcome === 'committed',
  );
  const fill = fillSelectionKey();
  portal.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  assert.equal(editor.getDiagnostics().resources.tasks.queuedCount, 1);
  const transaction = await committed;
  await ended;

  assert.equal(transaction.patch.operations.length, 3);
  assert.deepEqual(
    transaction.patch.operations.map((operation) => operation.op),
    ['updateField', 'updateField', 'updateField'],
  );
  for (const occurrenceId of ['flat-row-0', 'flat-row-1', 'flat-row-2']) {
    assert.equal(node(editor.getSnapshot(), occurrenceId).fields.name, 'Shared name');
  }
  assert.equal(selectionEvents.events.length, 0);

  expectOk(await editor.undo());
  assert.equal(node(editor.getSnapshot(), 'flat-row-0').fields.name, 'First');
  assert.equal(node(editor.getSnapshot(), 'flat-row-1').fields.name, 'Second');
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.name, 'Third');
});

test('Ctrl+Enter fills disjoint same-column ranges atomically and de-duplicates overlap', async (t) => {
  const snapshot = createFlatSnapshot(5, 'fill-selection-multi-range');
  for (const row of snapshot.nodes) {
    row.fields.note = 'initial';
  }
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: snapshot,
    instanceId: 'editor-fill-selection-multi-range',
    rowHeight: 28,
    initialView: {
      selection: {
        activeCell: { occurrenceId: 'flat-row-4', columnId: 'note' },
        range: {
          anchor: { occurrenceId: 'flat-row-2', columnId: 'note' },
          focus: { occurrenceId: 'flat-row-4', columnId: 'note' },
        },
        ranges: [
          {
            anchor: { occurrenceId: 'flat-row-0', columnId: 'note' },
            focus: { occurrenceId: 'flat-row-2', columnId: 'note' },
          },
          {
            anchor: { occurrenceId: 'flat-row-2', columnId: 'note' },
            focus: { occurrenceId: 'flat-row-4', columnId: 'note' },
          },
        ],
      },
    },
  });
  t.after(() => editor.destroy());
  const { grid, container, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Shared note';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:fill-selection',
  );
  const fill = fillSelectionKey();
  portal.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  const transaction = await committed;
  assert.equal(transaction.patch.operations.length, 5);
  assert.deepEqual(
    transaction.patch.operations.map((operation) => operation.occurrenceId),
    ['flat-row-0', 'flat-row-1', 'flat-row-2', 'flat-row-3', 'flat-row-4'],
  );
  for (const row of snapshot.nodes) {
    assert.equal(node(editor.getSnapshot(), row.occurrenceId).fields.note, 'Shared note');
  }

  expectOk(await editor.undo());
  for (const row of snapshot.nodes) {
    assert.equal(node(editor.getSnapshot(), row.occurrenceId).fields.note, 'initial');
  }
});

test('Ctrl+Enter does not commit when the Portal selection is not a multi-row single column', async (t) => {
  const editor = createEditor(createFlatSnapshot(2, 'fill-selection-invalid-range'));
  t.after(() => editor.destroy());
  const { grid, container, window } = await mountFocusedGrid(editor);
  const before = editor.getSnapshot();

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  let portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  const noRange = fillSelectionKey();
  portal.dispatchEvent(noRange);
  assert.equal(noRange.defaultPrevented, false);
  await turn();
  assert.equal(editor.getSnapshot(), before);

  portal.dispatchEvent(fakeEvent('keydown', {
    key: 'Escape',
    keyCode: 27,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  const multiColumn = fillSelectionKey();
  portal.dispatchEvent(multiColumn);
  assert.equal(multiColumn.defaultPrevented, false);
  await turn();
  assert.equal(editor.getSnapshot(), before);
});

test('Ctrl+Enter fails closed when beforeTransaction changes the selected range', async (t) => {
  const snapshot = createFlatSnapshot(2, 'fill-selection-selection-race');
  snapshot.nodes[0].fields = { name: 'First', note: 'initial' };
  snapshot.nodes[1].fields = { name: 'Second', note: 'initial' };
  const editor = createEditor(snapshot);
  t.after(() => editor.destroy());
  const { grid, container, window } = await mountFocusedGrid(editor);
  const before = editor.getSnapshot();

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Must not commit';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  const stop = editor.on('beforeTransaction', () => {
    grid.dispatchEvent(fakeEvent('pointerdown', {
      button: 0,
      clientX: 250,
      clientY: 50,
      shiftKey: false,
    }));
  });
  t.after(stop);
  const rejected = waitForEvent(editor, 'commitRejected');
  const fill = fillSelectionKey();
  portal.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  const rejection = await rejected;
  assert.equal(rejection.error.code, 'BOM_EDITOR_FILL_SELECTION_CONFLICT');
  assert.equal(editor.getSnapshot(), before);
  assert.equal(editor.getSnapshot().revision, before.revision);
});

test('Ctrl+Enter fails closed when beforeCommit changes the selected range', async (t) => {
  const snapshot = createFlatSnapshot(2, 'fill-selection-before-commit-race');
  snapshot.nodes[0].fields = { name: 'First', note: 'initial' };
  snapshot.nodes[1].fields = { name: 'Second', note: 'initial' };
  const editor = createEditor(snapshot);
  t.after(() => editor.destroy());
  const { grid, container, window } = await mountFocusedGrid(editor);
  const before = editor.getSnapshot();

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Must not commit';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  const stop = editor.on('beforeCommit', () => {
    grid.dispatchEvent(fakeEvent('pointerdown', {
      button: 0,
      clientX: 250,
      clientY: 50,
      shiftKey: false,
    }));
  });
  t.after(stop);
  const rejected = waitForEvent(editor, 'commitRejected');
  const fill = fillSelectionKey();
  portal.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  const rejection = await rejected;
  assert.equal(rejection.error.code, 'BOM_EDITOR_FILL_SELECTION_CONFLICT');
  assert.equal(editor.getSnapshot(), before);
  assert.equal(editor.getSnapshot().revision, before.revision);
});

test('component facade emits one document change for Command+Enter fill-selection', async (t) => {
  const snapshot = createFlatSnapshot(2, 'component-fill-selection');
  snapshot.nodes[0].fields = { name: 'First', note: 'initial' };
  snapshot.nodes[1].fields = { name: 'Second', note: 'initial' };
  const documentChanges = [];
  const filled = deferred();
  const component = createBomEditorComponent({
    schema,
    columns,
    document: snapshot,
    instanceId: 'component-fill-selection',
    rowHeight: 28,
    outputs: {
      onDocumentChange(event) {
        documentChanges.push(event);
        if (event.origin === 'editor:fill-selection') filled.resolve(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    isComposing: false,
  }));
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Component shared';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  const fill = fillSelectionKey({ command: true });
  portal.dispatchEvent(fill);
  assert.equal(fill.defaultPrevented, true);
  const change = await filled.promise;
  await flushComponentOutputs();
  assert.equal(documentChanges.length, 1);
  assert.equal(change.origin, 'editor:fill-selection');
  assert.equal(change.snapshot.documentId, 'component-fill-selection');
  assert.equal(node(change.snapshot, 'flat-row-0').fields.name, 'Component shared');
  assert.equal(node(change.snapshot, 'flat-row-1').fields.name, 'Component shared');
  assert.equal(change.patch.operations.length, 2);
  assert.equal(change.patch.origin, 'editor:fill-selection');
});

test('component facade forwards Tab navigation through onSelectionChange', async (t) => {
  const selectionChanges = [];
  const tabNavigated = deferred();
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-selection-output',
    rowHeight: 28,
    editNavigation: { tab: 'next-editable', enter: 'down' },
    outputs: {
      onSelectionChange(event) {
        selectionChanges.push(event);
        if (
          event.reason === 'keyboard' &&
          event.selection.activeCell?.occurrenceId === 'row-1' &&
          event.selection.activeCell.columnId === 'note'
        ) {
          tabNavigated.resolve(event);
        }
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Tab navigation output';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  const keydown = fakeEvent('keydown', {
    key: 'Tab',
    keyCode: 9,
    isComposing: false,
    shiftKey: false,
  });
  portal.dispatchEvent(keydown);
  assert.equal(keydown.defaultPrevented, true);

  const selectionChange = await tabNavigated.promise;
  await flushComponentOutputs();
  assert.equal(selectionChanges.length, 1);
  assert.equal(selectionChange.reason, 'keyboard');
  assert.deepEqual(selectionChange.previous, {
    activeCell: { occurrenceId: 'row-1', columnId: 'name' },
    range: null,
  });
  assert.deepEqual(selectionChange.selection, {
    activeCell: { occurrenceId: 'row-1', columnId: 'note' },
    range: null,
  });
});

test('component facade keeps same-version echo drafts and replaces changed documents', async (t) => {
  const editEnds = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-controlled-document',
    rowHeight: 28,
    outputs: {
      onEditEnd(event) {
        editEnds.push(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const initialPortal = container.querySelector(
    'input[data-bom-editor-portal="true"]',
  );
  assert.ok(initialPortal);
  initialPortal.value = 'Draft retained across echo';
  initialPortal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  // A parent echo is a distinct Snapshot object but has the current version.
  // It must neither replace the document nor tear down the active draft.
  expectOk(await component.update({
    document: createSnapshot({ firstName: 'Parent echo must not replace draft' }),
  }));
  window.flushAnimationFrames();
  await flushComponentOutputs();
  assert.equal(initialPortal.hidden, false);
  assert.equal(initialPortal.value, 'Draft retained across echo');
  assert.equal(editEnds.length, 0);

  const revisionReplacement = createSnapshot({
    revision: 'revision-b',
    firstName: 'Revision replacement',
  });
  expectOk(await component.update({ document: revisionReplacement }));
  window.flushAnimationFrames();
  await flushComponentOutputs();
  assert.equal(initialPortal.hidden, true);
  assert.equal(editEnds.length, 1);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const revisionPortal = container.querySelector(
    'input[data-bom-editor-portal="true"]',
  );
  assert.ok(revisionPortal);
  assert.equal(revisionPortal.hidden, false);
  assert.equal(revisionPortal.value, 'Revision replacement');

  const documentReplacement = createSnapshot({
    documentId: 'document-b',
    revision: 'revision-c',
    firstName: 'Document replacement',
  });
  expectOk(await component.update({ document: documentReplacement }));
  window.flushAnimationFrames();
  await flushComponentOutputs();
  assert.equal(revisionPortal.hidden, true);
  assert.equal(editEnds.length, 2);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const documentPortal = container.querySelector(
    'input[data-bom-editor-portal="true"]',
  );
  assert.ok(documentPortal);
  assert.equal(documentPortal.hidden, false);
  assert.equal(documentPortal.value, 'Document replacement');
});

test('component facade rejects runtime dataSource props before constructing an editor', () => {
  const { source } = controlledDataSource();

  assert.throws(
    () => createBomEditorComponent({
      schema,
      columns,
      document: createSnapshot(),
      dataSource: source,
    }),
    (error) => {
      assert.ok(error instanceof BomEditorConfigurationError);
      assert.equal(error.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
      assert.equal(error.error.safeContext?.option, 'dataSource');
      return true;
    },
  );
});

test('component facade validates same-version document input before retaining an active draft', async (t) => {
  const editEnds = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-invalid-same-version-document',
    rowHeight: 28,
    outputs: {
      onEditEnd(event) {
        editEnds.push(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Draft must survive rejected same-version input';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  const invalidSameVersion = createSnapshot();
  invalidSameVersion.roots = ['row-2', 'row-1'];
  const result = await component.update({ document: invalidSameVersion });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'BOM_SNAPSHOT_ROOT_ORDER_MISMATCH');
  window.flushAnimationFrames();
  await flushComponentOutputs();
  assert.equal(portal.hidden, false);
  assert.equal(portal.value, 'Draft must survive rejected same-version input');
  assert.equal(editEnds.length, 0);
});

test('component facade validates output callbacks and isolates failures asynchronously', async (t) => {
  assert.throws(
    () => createBomEditorComponent({
      schema,
      columns,
      document: createSnapshot(),
      outputs: { onDocumentChange: 'not-a-function' },
    }),
    (error) => {
      assert.ok(error instanceof BomEditorConfigurationError);
      assert.equal(error.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
      assert.equal(error.error.safeContext?.option, 'outputs');
      return true;
    },
  );

  const deliveries = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-output-isolation',
    rowHeight: 28,
    outputs: {
      onEditStart() {
        deliveries.push('edit-start');
        throw new Error('consumer callback failure');
      },
      onDraftChange() {
        deliveries.push('draft-change');
      },
    },
  });
  t.after(() => component.destroy());

  const invalidOutputs = await component.update({
    document: createSnapshot(),
    outputs: { onEditEnd: null },
  });
  expectError(invalidOutputs, BOM_EDITOR_ERROR_CODES.configInvalid);

  const { container, window } = createFakeDom(640, 280);
  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Callback isolation';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  assert.deepEqual(deliveries, []);
  await flushComponentOutputs();
  assert.deepEqual(deliveries, ['edit-start', 'draft-change']);
});

test('component facade forwards frozen view and edit rejection outputs asynchronously in FIFO order', async (t) => {
  const deliveries = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-view-and-rejection-outputs',
    rowHeight: 28,
    outputs: {
      onViewChange(event) {
        deliveries.push({ type: 'view', event });
      },
      onEditRejected(event) {
        deliveries.push({ type: 'rejected', event });
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  await flushComponentOutputs();
  deliveries.length = 0;
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.scrollTop = 14;
  grid.dispatchEvent(fakeEvent('scroll'));
  grid.scrollTop = 28;
  grid.dispatchEvent(fakeEvent('scroll'));
  assert.deepEqual(deliveries, []);

  await flushComponentOutputs();
  assert.deepEqual(deliveries.map((delivery) => delivery.type), [
    'view',
    'view',
  ]);
  assert.deepEqual(
    deliveries.map((delivery) => delivery.event.view.scrollTop),
    [14, 28],
  );
  assert.equal(Object.isFrozen(deliveries[0].event), true);
  assert.equal(Object.isFrozen(deliveries[1].event), true);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'x'.repeat(101);
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));
  portal.dispatchEvent(
    fakeEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      isComposing: false,
      shiftKey: false,
    }),
  );
  assert.equal(deliveries.length, 2);

  await flushComponentOutputs();
  assert.deepEqual(deliveries.map((delivery) => delivery.type), [
    'view',
    'view',
    'rejected',
  ]);
  const rejected = deliveries[2].event;
  assert.equal(Object.isFrozen(rejected), true);
  assert.equal(rejected.phase, 'validation');
});

test('component facade forwards frozen native paste output asynchronously', async (t) => {
  const pasteEvents = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-paste-output',
    rowHeight: 28,
    outputs: {
      onPaste(event) {
        pasteEvents.push(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  await flushComponentOutputs();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  const paste = fakeEvent('paste', {
    clipboardData: {
      types: ['text/plain'],
      getData(type) {
        return type === 'text/plain' ? 'Facade paste\tFacade note' : '';
      },
    },
  });
  grid.dispatchEvent(paste);
  assert.equal(paste.defaultPrevented, true);
  assert.deepEqual(pasteEvents, []);

  await turn();
  await flushComponentOutputs();
  assert.equal(pasteEvents.length, 1);
  assert.equal(Object.isFrozen(pasteEvents[0]), true);
  assert.equal(pasteEvents[0].source, 'event');
  assert.equal(pasteEvents[0].outcome, 'committed');
  assert.equal(pasteEvents[0].format, 'tsv');
});

test('component facade exposes read-only paste preview and forwards task progress', async (t) => {
  const progressEvents = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-paste-preview',
    rowHeight: 28,
    outputs: {
      onTaskProgress(event) {
        progressEvents.push(event);
      },
    },
  });
  t.after(() => component.destroy());

  const preview = await component.previewPaste({
    text: 'Preview from component',
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.value.cellCount, 1);
  assert.equal(preview.value.cells[0].fieldId, 'name');
  assert.equal(preview.value.cells[0].value, 'Preview from component');
  await flushComponentOutputs();
  assert.ok(progressEvents.length >= 4);
  assert.equal(progressEvents.at(-1).stage, 'complete');
  assert.equal(progressEvents.at(-1).completed, 4);
  assert.ok(progressEvents.every((event) => Object.isFrozen(event)));
});

test('component facade only replaces output callbacks after a valid non-aborted update', async (t) => {
  const originalViews = [];
  const replacementViews = [];
  const unexpectedViews = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-output-update-atomicity',
    rowHeight: 28,
    outputs: {
      onViewChange(event) {
        originalViews.push(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  await flushComponentOutputs();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  const emitViewChange = async (scrollTop) => {
    grid.scrollTop = scrollTop;
    grid.dispatchEvent(fakeEvent('scroll'));
    await flushComponentOutputs();
  };

  await emitViewChange(10);
  assert.deepEqual(originalViews.map((event) => event.view.scrollTop), [10]);

  expectOk(await component.update({
    document: createSnapshot(),
    outputs: {
      onViewChange(event) {
        replacementViews.push(event);
      },
    },
  }));
  await emitViewChange(20);
  assert.deepEqual(originalViews.map((event) => event.view.scrollTop), [10]);
  assert.deepEqual(replacementViews.map((event) => event.view.scrollTop), [20]);

  const invalidOutputs = await component.update({
    document: createSnapshot(),
    outputs: { onViewChange: null },
  });
  expectError(invalidOutputs, BOM_EDITOR_ERROR_CODES.configInvalid);
  await emitViewChange(30);

  const unknownUpdateField = await component.update({
    document: createSnapshot(),
    outputs: {
      onViewChange(event) {
        unexpectedViews.push(event);
      },
    },
    unknownUpdateField: true,
  });
  expectError(unknownUpdateField, BOM_EDITOR_ERROR_CODES.configInvalid);
  await emitViewChange(40);

  const controller = new AbortController();
  controller.abort();
  const abortedUpdate = await component.update(
    {
      document: createSnapshot(),
      outputs: {
        onViewChange(event) {
          unexpectedViews.push(event);
        },
      },
    },
    { signal: controller.signal },
  );
  expectError(abortedUpdate, BOM_EDITOR_ERROR_CODES.aborted);
  await emitViewChange(50);

  assert.deepEqual(
    replacementViews.map((event) => event.view.scrollTop),
    [20, 30, 40, 50],
  );
  assert.deepEqual(unexpectedViews, []);
});

test('component facade drops queued outputs when destroyed', async (t) => {
  const selectionChanges = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-output-destroy',
    rowHeight: 28,
    outputs: {
      onSelectionChange(event) {
        selectionChanges.push(event);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);
  const keydown = (key) => fakeEvent('keydown', {
    key,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
  });

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  await flushComponentOutputs();
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();

  grid.dispatchEvent(keydown('ArrowRight'));
  assert.equal(selectionChanges.length, 0);
  await flushComponentOutputs();
  assert.equal(selectionChanges.length, 1);
  assert.equal(selectionChanges[0].reason, 'keyboard');

  grid.dispatchEvent(keydown('ArrowLeft'));
  component.destroy();
  await flushComponentOutputs();
  assert.equal(selectionChanges.length, 1);
});

test('component facade rejects missing and null document props at creation', () => {
  const invalidProps = [
    { schema, columns },
    { schema, columns, document: null },
  ];

  for (const props of invalidProps) {
    assert.throws(
      () => createBomEditorComponent(props),
      (error) => {
        assert.ok(error instanceof BomEditorConfigurationError);
        return true;
      },
    );
  }
});

test('component facade rejects unknown own keys on props and outputs', () => {
  assert.throws(
    () => createBomEditorComponent({
      schema,
      columns,
      document: createSnapshot(),
      outputs: { onDocumentChagne() {} },
    }),
    (error) => {
      assert.ok(error instanceof BomEditorConfigurationError);
      assert.equal(error.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
      assert.equal(error.error.safeContext?.option, 'outputs');
      return true;
    },
  );

  assert.throws(
    () => createBomEditorComponent({
      schema,
      columns,
      document: createSnapshot(),
      renderre: {},
    }),
    (error) => {
      assert.ok(error instanceof BomEditorConfigurationError);
      assert.equal(error.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
      assert.equal(error.error.safeContext?.option, 'componentProps');
      return true;
    },
  );
});

test('component facade validates update input before honoring an aborted signal', async (t) => {
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-aborted-update-validation',
    rowHeight: 28,
  });
  t.after(() => component.destroy());
  const controller = new AbortController();
  controller.abort();
  const invalidSnapshot = createSnapshot();
  invalidSnapshot.roots = ['row-2', 'row-1'];

  const invalidResult = await component.update(
    { document: invalidSnapshot },
    { signal: controller.signal },
  );
  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.error.code, 'BOM_SNAPSHOT_ROOT_ORDER_MISMATCH');

  const abortedResult = await component.update(
    { document: createSnapshot() },
    { signal: controller.signal },
  );
  expectError(abortedResult, BOM_EDITOR_ERROR_CODES.aborted);
});

test('createBomEditor rejects runtime initialDocument and dataSource combinations', () => {
  const { source } = controlledDataSource();

  assert.throws(
    () => createBomEditor({
      schema,
      columns,
      initialDocument: createSnapshot(),
      dataSource: source,
    }),
    (error) => {
      assert.ok(error instanceof BomEditorConfigurationError);
      assert.equal(error.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
      assert.equal(error.error.safeContext?.option, 'initialDocument/dataSource');
      return true;
    },
  );
});

test('component facade prevents queued output reentry when an output destroys it', async (t) => {
  const deliveries = [];
  let component;
  component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-output-callback-destroy',
    rowHeight: 28,
    outputs: {
      onEditStart() {
        deliveries.push('edit-start:before-destroy');
        component.destroy();
        deliveries.push('edit-start:after-destroy');
      },
      onDraftChange() {
        deliveries.push('draft-change');
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);

  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  portal.value = 'Destroy from output callback';
  portal.dispatchEvent(fakeEvent('input', { inputType: 'insertText' }));

  assert.deepEqual(deliveries, []);
  await flushComponentOutputs();
  assert.deepEqual(deliveries, [
    'edit-start:before-destroy',
    'edit-start:after-destroy',
  ]);
});

test('component facade preserves FIFO ordering for consecutive document updates', async (t) => {
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-document-update-fifo',
    rowHeight: 28,
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);

  const revisionB = createSnapshot({
    revision: 'revision-b',
    firstName: 'Revision B value',
  });
  const revisionA = createSnapshot({
    revision: 'revision-a',
    firstName: 'Revision A final value',
  });
  const updateB = component.update({ document: revisionB });
  const updateA = component.update({ document: revisionA });

  expectOk(await updateB);
  expectOk(await updateA);
  window.flushAnimationFrames();

  const grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
  window.flushAnimationFrames();
  const portal = container.querySelector('input[data-bom-editor-portal="true"]');
  assert.ok(portal);
  assert.equal(portal.value, 'Revision A final value');
});

test('component facade ignores a document-change output echo after replacement', async (t) => {
  const { container, window } = createFakeDom(640, 280);
  const echoedUpdate = deferred();
  let echoedUpdateTimeout;
  const echoedOutcome = Promise.race([
    echoedUpdate.promise,
    new Promise((_, reject) => {
      echoedUpdateTimeout = setTimeout(
        () => reject(new Error('Expected a document-change output echo.')),
        1000,
      );
    }),
  ]);
  const revisionB = createSnapshot({
    revision: 'revision-b',
    firstName: 'Revision B echo value',
  });
  let component;
  let grid;
  let portal;
  let echoed = false;
  component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-document-change-output-echo',
    rowHeight: 28,
    outputs: {
      onSelectionChange(event) {
        if (event.reason !== 'document-change' || echoed) return;
        echoed = true;
        try {
          component.update({ document: revisionB }).then(
            echoedUpdate.resolve,
            echoedUpdate.reject,
          );
          grid.dispatchEvent(fakeEvent('dblclick', { clientX: 80, clientY: 50 }));
          window.flushAnimationFrames();
          portal = container.querySelector('input[data-bom-editor-portal="true"]');
        } catch (error) {
          echoedUpdate.reject(error);
        }
      },
    },
  });
  t.after(() => component.destroy());

  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);
  grid = container.querySelector('[role="treegrid"]');
  assert.ok(grid);
  grid.focus();
  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowRight',
    shiftKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();
  await flushComponentOutputs();

  expectOk(await component.update({ document: revisionB }));
  expectOk(await echoedOutcome);
  clearTimeout(echoedUpdateTimeout);
  await turn();
  await flushComponentOutputs();
  window.flushAnimationFrames();

  assert.equal(echoed, true);
  assert.ok(portal);
  assert.equal(portal.hidden, false);
  assert.equal(portal.value, 'Revision B echo value');
});

test('Ctrl-click exposes stable disjoint ranges and clears them atomically', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  expectOk(await editor.execute({
    type: 'setField',
    occurrenceId: 'row-2',
    fieldPath: ['note'],
    value: 'second',
  }));
  const selectionEvents = recordEvents(editor, ['selectionChanged']);
  t.after(() => selectionEvents.stop());
  const { grid, window } = await mountFocusedGrid(editor);

  expectOk(editor.focusCell({ occurrenceId: 'row-1', columnId: 'note' }));
  window.flushAnimationFrames();

  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    clientX: 220,
    clientY: 80,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    pointerId: 1,
    pointerType: 'mouse',
  }));
  window.flushAnimationFrames();

  const selection = selectionEvents.events.at(-1).selection;
  assert.equal(selection.range, null);
  assert.deepEqual(selection.ranges, [
    {
      anchor: { occurrenceId: 'row-1', columnId: 'note' },
      focus: { occurrenceId: 'row-1', columnId: 'note' },
    },
    {
      anchor: { occurrenceId: 'row-2', columnId: 'note' },
      focus: { occurrenceId: 'row-2', columnId: 'note' },
    },
  ]);
  assert.deepEqual(selection.activeCell, {
    occurrenceId: 'row-2',
    columnId: 'note',
  });

  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:delete',
  );
  const remove = deleteSelectionKey();
  grid.dispatchEvent(remove);
  assert.equal(remove.defaultPrevented, true);
  const deleted = await committed;
  assert.equal(deleted.patch.operations.length, 2);
  assert.deepEqual(
    deleted.patch.operations.map((operation) => operation.occurrenceId),
    ['row-1', 'row-2'],
  );
  assert.equal(Object.hasOwn(node(editor.getSnapshot(), 'row-1').fields, 'note'), false);
  assert.equal(Object.hasOwn(node(editor.getSnapshot(), 'row-2').fields, 'note'), false);

  expectOk(await editor.undo());
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'initial');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'second');
});

test('single rectangular selection exposes a fill handle that reuses atomic fill-down', async (t) => {
  const editor = createEditor(createFlatSnapshot(3, 'fill-handle-document'));
  t.after(() => editor.destroy());
  const { grid, window } = await mountFocusedGrid(editor);

  grid.dispatchEvent(fakeEvent('keydown', {
    key: 'ArrowDown',
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
  }));
  window.flushAnimationFrames();

  const committed = waitForEvent(
    editor,
    'transactionCommitted',
    (event) => event.origin === 'editor:fill-down',
  );
  grid.dispatchEvent(fakeEvent('pointerdown', {
    button: 0,
    clientX: 204,
    clientY: 88,
    pointerId: 2,
    pointerType: 'mouse',
  }));
  grid.dispatchEvent(fakeEvent('pointermove', {
    clientX: 204,
    clientY: 105,
    pointerId: 2,
    pointerType: 'mouse',
  }));
  grid.dispatchEvent(fakeEvent('pointerup', {
    clientX: 204,
    clientY: 105,
    pointerId: 2,
    pointerType: 'mouse',
  }));

  const fill = await committed;
  assert.equal(fill.patch.operations.length, 2);
  assert.equal(node(editor.getSnapshot(), 'flat-row-1').fields.name, 'Part 0');
  assert.equal(node(editor.getSnapshot(), 'flat-row-2').fields.name, 'Part 0');
});

test('shortcut registry replaces and resets built-in bindings atomically', async () => {
  const editor = createEditor();
  const executed = await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'changed before shortcut',
  });
  expectOk(executed);
  const mounted = await mountFocusedGrid(editor);
  const configured = editor.configureShortcuts({
    bindings: [
      { id: 'grid.undo', keys: 'Primary+Shift+U', command: 'undo' },
    ],
  });
  assert.equal(configured.ok, true);
  const oldUndo = fakeEvent('keydown', {
    key: 'z',
    keyCode: 90,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
  });
  mounted.grid.dispatchEvent(oldUndo);
  await Promise.resolve();
  assert.equal(editor.getSnapshot().nodes[0].fields.note, 'changed before shortcut');
  const newUndo = fakeEvent('keydown', {
    key: 'u',
    keyCode: 85,
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    repeat: false,
    isComposing: false,
  });
  mounted.grid.dispatchEvent(newUndo);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(editor.getSnapshot().nodes[0].fields.note, 'initial');
  const reset = editor.resetShortcuts();
  assert.equal(reset.ok, true);
  editor.destroy();
});

test('local search is cancellable, supports case and safe regular expressions, and focus reveals collapsed matches', async (t) => {
  const editor = createEditor(createTreeSnapshot());
  t.after(() => editor.destroy());
  const progress = recordEvents(editor, ['taskProgress', 'selectionChanged']);
  t.after(() => progress.stop());

  const exact = await editor.search({ query: 'mat-child', mode: 'exact' });
  expectOk(exact);
  assert.deepEqual(exact.value.matches, [
    { occurrenceId: 'child', score: 10000, reasons: ['materialCode'] },
  ]);
  assert.equal(exact.value.totalMatches, 1);
  assert.equal(exact.value.truncated, false);
  const caseSensitive = await editor.search({ query: 'mat-child', mode: 'exact', caseSensitive: true });
  expectOk(caseSensitive);
  assert.equal(caseSensitive.value.totalMatches, 0);
  const regex = await editor.search({ query: '^mat-(?:child|root)$', mode: 'regex' });
  expectOk(regex);
  assert.equal(regex.value.totalMatches, 2);
  const limited = await editor.search({ query: 'mat-', mode: 'prefix', limit: 1 });
  expectOk(limited);
  assert.equal(limited.value.matches.length, 1);
  assert.equal(limited.value.totalMatches, 2);
  assert.equal(limited.value.truncated, true);
  const wholeCell = await editor.search({ query: 'mat-', mode: 'prefix', matchWholeCell: true });
  expectOk(wholeCell);
  assert.equal(wholeCell.value.totalMatches, 0);
  const wholeRegex = await editor.search({ query: '^mat-child$', mode: 'regex', matchWholeCell: true });
  expectOk(wholeRegex);
  assert.equal(wholeRegex.value.totalMatches, 1);
  const invalidRegex = await editor.search({ query: '(a+)+$', mode: 'regex' });
  assert.equal(invalidRegex.ok, false);
  assert.equal(invalidRegex.error.code, BOM_EDITOR_ERROR_CODES.searchRegexInvalid);
  const fuzzy = await editor.search({ query: 'cld', mode: 'fuzzy' });
  expectOk(fuzzy);
  assert.equal(fuzzy.value.matches[0].occurrenceId, 'child');
  assert.ok(progress.events.some((event) => event.taskType === 'search'));

  expectOk(editor.focusCell({ occurrenceId: 'child', columnId: 'name' }));
  assert.deepEqual(progress.events.at(-1).selection.activeCell, {
    occurrenceId: 'child',
    columnId: 'name',
  });
  const controller = new AbortController();
  controller.abort();
  const aborted = await editor.search({ query: 'child' }, { signal: controller.signal });
  assert.equal(aborted.ok, false);
  assert.equal(aborted.error.code, BOM_EDITOR_ERROR_CODES.aborted);
});

test('material matching is read-only, reports monotonic progress, and honors automatic-selection thresholds', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const progress = recordEvents(editor, ['taskProgress']);
  t.after(() => progress.stop());
  const before = editor.getSnapshot();

  const result = expectOk(await editor.matchMaterials({
    query: 'mat-row-1',
    aliasesByOccurrenceId: { 'row-2': ['secondary-part'] },
    selection: { minConfidence: 0.8, minScoreDelta: 0.1 },
  }));
  assert.equal(result.algorithmVersion, 'bom-match/v1');
  assert.equal(result.indexRevision, before.revision);
  assert.equal(result.matches[0].occurrenceId, 'row-1');
  assert.equal(result.selectionStatus, 'selected');
  assert.equal(result.selectedOccurrenceId, 'row-1');
  assert.equal(editor.getSnapshot(), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.matches), true);

  const matchProgress = progress.events.filter((event) => event.taskType === 'match');
  assert.ok(matchProgress.length >= 2);
  assert.equal(matchProgress[0].stage, 'start');
  assert.equal(matchProgress.at(-1).stage, 'complete');
  for (let index = 1; index < matchProgress.length; index += 1) {
    assert.ok(matchProgress[index].completed >= matchProgress[index - 1].completed);
  }

  const controller = new AbortController();
  controller.abort();
  const aborted = await editor.matchMaterials({ query: 'part' }, {
    signal: controller.signal,
  });
  assert.equal(aborted.ok, false);
  assert.equal(aborted.error.code, BOM_EDITOR_ERROR_CODES.aborted);

  const invalid = await editor.matchMaterials({ query: 'part', limit: 0 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, BOM_EDITOR_ERROR_CODES.configInvalid);
});

test('material matching discards stale work and observes destruction between chunks', async (t) => {
  const staleEditor = createEditor(createFlatSnapshot(600, 'matching-stale-document'));
  t.after(() => staleEditor.destroy());
  const stalePending = staleEditor.matchMaterials({ query: 'mat-' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const replacement = {
    ...createFlatSnapshot(600, 'matching-stale-document'),
    revision: 'matching-stale-revision-2',
  };
  expectOk(await staleEditor.setDocument(replacement));
  const stale = await stalePending;
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, BOM_EDITOR_ERROR_CODES.matchStale);

  const destroyedEditor = createEditor(createFlatSnapshot(600, 'matching-destroy-document'));
  t.after(() => destroyedEditor.destroy());
  const destroyedPending = destroyedEditor.matchMaterials({ query: 'mat-' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  destroyedEditor.destroy();
  const destroyed = await destroyedPending;
  assert.equal(destroyed.ok, false);
  assert.equal(destroyed.error.code, BOM_EDITOR_ERROR_CODES.destroyed);
});

test('component facade delegates material matching without expanding its Props boundary', async (t) => {
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot({ documentId: 'matching-component-document' }),
    instanceId: 'matching-component',
  });
  t.after(() => component.destroy());
  const result = expectOk(await component.matchMaterials({
    query: 'mat-row-1',
    selection: { minConfidence: 0.8, minScoreDelta: 0.1 },
  }));
  assert.equal(result.selectionStatus, 'selected');
  assert.equal(result.selectedOccurrenceId, 'row-1');
});

test('material match adoption is explicit, atomic, auditable, and undoable', async (t) => {
  const audits = [];
  const editor = createEditor();
  t.after(() => editor.destroy());
  editor.on('materialMatchAudit', (event) => audits.push(event));
  const before = editor.getSnapshot();
  const matches = expectOk(await editor.matchMaterials({ query: 'mat-row-1' }));
  assert.equal(editor.getSnapshot(), before);
  const candidate = matches.matches[0];
  assert.ok(candidate);
  const proposal = expectOk(editor.proposeMaterialMatch('row-2', candidate));
  assert.equal(Object.isFrozen(proposal), true);
  assert.equal(proposal.algorithmVersion, 'bom-match/v1');
  assert.equal(proposal.targetOccurrenceId, 'row-2');
  assert.equal(proposal.candidateOccurrenceId, 'row-1');
  assert.equal(audits.at(-1).decision, 'proposed');
  assert.equal(audits.at(-1).baseRevision, proposal.baseRevision);

  const forged = { ...proposal };
  const forgedResult = await editor.applyMaterialMatch(forged);
  expectError(forgedResult, BOM_EDITOR_ERROR_CODES.materialMatchInvalid);
  assert.equal(editor.getSnapshot(), before);

  const committed = expectOk(await editor.applyMaterialMatch(proposal));
  assert.equal(committed.patch.operations.length, 1);
  assert.match(committed.patch.origin, /^editor:material-match:material-match:/u);
  assert.equal(editor.getSnapshot().nodes[1].materialCode, 'MAT-row-1');
  assert.deepEqual(audits.map((event) => event.decision), [
    'proposed',
    'approved',
    'applied',
  ]);
  assert.equal(audits.at(-1).transactionId, committed.transactionId);
  assert.equal(audits.at(-1).baseRevision, proposal.baseRevision);
  assert.equal('materialCode' in audits.at(-1), false);
  assert.equal('materialId' in audits.at(-1), false);

  expectOk(await editor.undo());
  assert.equal(editor.getSnapshot().nodes[1].materialCode, 'MAT-row-2');
  expectOk(await editor.redo());
  assert.equal(editor.getSnapshot().nodes[1].materialCode, 'MAT-row-1');
  const replayed = await editor.applyMaterialMatch(proposal);
  expectError(replayed, BOM_EDITOR_ERROR_CODES.materialMatchInvalid);
});

test('material match proposals reject forged candidates, invalid targets, and stale revisions', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const matches = expectOk(await editor.matchMaterials({ query: 'mat-row-1' }));
  const candidate = matches.matches[0];
  assert.ok(candidate);
  expectError(
    editor.proposeMaterialMatch('row-2', { ...candidate }),
    BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
  );
  const proposal = expectOk(editor.proposeMaterialMatch('row-2', candidate));
  expectError(
    await editor.applyMaterialMatch({ ...proposal }),
    BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
  );
  expectOk(await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'revision changed',
  }));
  expectError(
    await editor.applyMaterialMatch(proposal),
    BOM_EDITOR_ERROR_CODES.materialMatchStale,
  );

  const tree = createBomEditor({
    schema,
    columns,
    initialDocument: createBranchSnapshot(),
    instanceId: 'material-match-invalid-target',
  });
  t.after(() => tree.destroy());
  const childMatches = expectOk(await tree.matchMaterials({ query: 'mat-child' }));
  const childCandidate = childMatches.matches[0];
  assert.ok(childCandidate);
  expectError(
    tree.proposeMaterialMatch('branch-root', childCandidate),
    BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
  );
  expectError(
    tree.proposeMaterialMatch('branch-child', childCandidate),
    BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
  );
});

test('material match approval policy can deny or cancel without writing', async (t) => {
  const deniedAudits = [];
  const deniedEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot({ documentId: 'material-match-denied' }),
    instanceId: 'material-match-denied',
    matchApprovalPolicy: {
      authorize(request) {
        assert.equal(request.targetOccurrenceId, 'row-2');
        assert.equal('materialCode' in request, false);
        return { decisionId: 'manual-review', allowed: false, reasonCode: 'needs-review' };
      },
    },
  });
  t.after(() => deniedEditor.destroy());
  deniedEditor.on('materialMatchAudit', (event) => deniedAudits.push(event));
  const deniedCandidate = expectOk(await deniedEditor.matchMaterials({ query: 'mat-row-1' })).matches[0];
  assert.ok(deniedCandidate);
  const deniedProposal = expectOk(deniedEditor.proposeMaterialMatch('row-2', deniedCandidate));
  const denied = await deniedEditor.applyMaterialMatch(deniedProposal);
  expectError(denied, BOM_EDITOR_ERROR_CODES.materialMatchDenied);
  assert.equal(deniedEditor.getSnapshot().nodes[1].materialCode, 'MAT-row-2');
  assert.equal(deniedAudits.at(-1).decision, 'denied');

  const started = deferred();
  const gate = deferred();
  const cancelledAudits = [];
  const cancelledEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot({ documentId: 'material-match-cancelled' }),
    instanceId: 'material-match-cancelled',
    matchApprovalPolicy: {
      authorize() {
        started.resolve();
        return gate.promise;
      },
    },
  });
  t.after(() => cancelledEditor.destroy());
  cancelledEditor.on('materialMatchAudit', (event) => cancelledAudits.push(event));
  const cancelledCandidate = expectOk(await cancelledEditor.matchMaterials({ query: 'mat-row-1' })).matches[0];
  assert.ok(cancelledCandidate);
  const cancelledProposal = expectOk(cancelledEditor.proposeMaterialMatch('row-2', cancelledCandidate));
  const controller = new AbortController();
  const pending = cancelledEditor.applyMaterialMatch(cancelledProposal, { signal: controller.signal });
  await started.promise;
  controller.abort();
  expectError(await pending, BOM_EDITOR_ERROR_CODES.aborted);
  gate.resolve({ decisionId: 'late-allow', allowed: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cancelledEditor.getSnapshot().nodes[1].materialCode, 'MAT-row-2');
  assert.equal(cancelledAudits.at(-1).decision, 'cancelled');
});

test('component forwards material match adoption and preserves output ordering', async (t) => {
  const outputs = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot({ documentId: 'material-match-component' }),
    instanceId: 'material-match-component',
    outputs: {
      onDocumentChange(event) {
        outputs.push(['document', event.origin]);
      },
      onMaterialMatchAudit(event) {
        outputs.push(['audit', event.decision]);
      },
    },
  });
  t.after(() => component.destroy());
  const candidate = expectOk(await component.matchMaterials({ query: 'mat-row-1' })).matches[0];
  assert.ok(candidate);
  const proposal = expectOk(component.proposeMaterialMatch('row-2', candidate));
  expectOk(await component.applyMaterialMatch(proposal));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(outputs.map(([kind]) => kind), [
    'audit',
    'audit',
    'document',
    'audit',
  ]);
  assert.equal(outputs[0][1], 'proposed');
  assert.equal(outputs[1][1], 'approved');
  assert.equal(outputs[2][0], 'document');
  assert.equal(outputs.at(-1)[1], 'applied');
});

test('validation reports document, visible, and selection scopes with cancellable progress', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const progress = recordEvents(editor, ['taskProgress']);
  const validationEvents = recordEvents(editor, ['validationChanged']);
  t.after(() => progress.stop());
  t.after(() => validationEvents.stop());

  const document = await editor.validate();
  const documentReport = expectOk(document);
  assert.equal(documentReport.scope, 'document');
  assert.equal(documentReport.checkedNodeCount, 2);
  assert.equal(documentReport.totalNodeCount, 2);
  assert.equal(documentReport.valid, true);
  assert.deepEqual(documentReport.issues, []);
  assert.equal(validationEvents.events.length, 1);
  assert.equal(validationEvents.events[0].scope, 'document');
  assert.equal(validationEvents.events[0].issueCount, 0);
  assert.equal(Object.isFrozen(validationEvents.events[0].issues), true);

  const unchangedDocument = await editor.validate();
  expectOk(unchangedDocument);
  assert.equal(validationEvents.events.length, 1);

  expectOk(editor.setViewQuery({
    filters: [{ fieldPath: ['name'], operator: 'equals', value: 'Part one' }],
  }));
  const visibleReport = expectOk(await editor.validate({ scope: 'visible' }));
  assert.equal(visibleReport.checkedNodeCount, 1);
  assert.equal(visibleReport.totalNodeCount, 2);

  expectOk(editor.focusCell({ occurrenceId: 'row-2', columnId: 'name' }));
  const selectionReport = expectOk(await editor.validate({ scope: 'selection' }));
  assert.equal(selectionReport.checkedNodeCount, 1);
  assert.equal(selectionReport.totalNodeCount, 2);
  assert.deepEqual(
    validationEvents.events.map((event) => event.scope),
    ['document', 'visible', 'selection'],
  );

  const validationProgress = progress.events.filter((event) => event.taskType === 'validate');
  assert.ok(validationProgress.length >= 3);
  const progressByTask = new Map();
  for (const event of validationProgress) {
    const taskEvents = progressByTask.get(event.taskId) ?? [];
    taskEvents.push(event);
    progressByTask.set(event.taskId, taskEvents);
  }
  for (const taskEvents of progressByTask.values()) {
    for (let index = 1; index < taskEvents.length; index += 1) {
      assert.ok(taskEvents[index].completed >= taskEvents[index - 1].completed);
    }
    assert.equal(taskEvents.at(-1).stage, 'complete');
  }

  const controller = new AbortController();
  controller.abort();
  const aborted = await editor.validate({ signal: controller.signal });
  assert.equal(aborted.ok, false);
  assert.equal(aborted.error.code, BOM_EDITOR_ERROR_CODES.aborted);
});

test('validation observes destroy during a cooperative long pass', async (t) => {
  const editor = createEditor(createFlatSnapshot(600, 'validation-destroy-document'));
  t.after(() => editor.destroy());
  const pending = editor.validate();
  await new Promise((resolve) => setTimeout(resolve, 0));
  editor.destroy();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, BOM_EDITOR_ERROR_CODES.destroyed);
});

test('component facade delegates validation without exposing a DataSource', async (t) => {
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot({ documentId: 'validation-component-document' }),
    instanceId: 'validation-component',
  });
  t.after(() => component.destroy());
  const result = await component.validate();
  const report = expectOk(result);
  assert.equal(report.scope, 'document');
  assert.equal(report.valid, true);
});

test('bounded CSV/TSV import previews and commits through the atomic paste path', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();
  const progress = recordEvents(editor, ['taskProgress']);
  t.after(() => progress.stop());

  const source = new Blob(['Imported one\tNote one\r\nImported two\tNote two'], {
    type: 'text/tab-separated-values',
  });
  const preview = await editor.importData(source, {
    format: 'tsv',
    mode: 'preview',
    baseRevision: before.revision,
  });
  const previewReport = expectOk(preview);
  assert.equal(previewReport.diagnostics.length, 0);
  assert.equal(previewReport.commit, undefined);
  assert.equal(editor.getSnapshot().revision, before.revision);

  const committed = await editor.importData(source, {
    format: 'tsv',
    mode: 'commit',
    baseRevision: before.revision,
  });
  const commitReport = expectOk(committed);
  assert.ok(commitReport.commit);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Imported one');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'Note two');
  assert.ok(progress.events.some((event) => event.taskType === 'import' && event.stage === 'complete'));
});

test('import parser failures retain value-free source diagnostics', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const before = contentHash(editor.getSnapshot());
  const result = await editor.importData(
    new Blob(['Name\t"broken"x']),
    { format: 'tsv', mode: 'preview' },
  );
  const report = expectOk(result);
  assert.equal(report.diagnostics[0]?.safeContext?.reason, 'malformed');
  assert.deepEqual(report.cellDiagnostics, [
    {
      sourceRow: 0,
      sourceColumn: 1,
      code: 'malformed-quote',
      messageKey: 'bom.import.cell.malformed-quote',
    },
  ]);
  assert.equal(contentHash(editor.getSnapshot()), before);
});

test('import and export expose value-free cancellable lifecycle events', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());

  let beforeImportEvent;
  let importCalls = 0;
  const stopBeforeImport = editor.on('beforeImport', (event) => {
    importCalls += 1;
    beforeImportEvent = event;
    assert.equal(event.mode, 'preview');
    assert.equal(event.format, 'tsv');
    assert.deepEqual(event.fieldIds, []);
    assert.equal(Object.isFrozen(event.fieldIds), true);
    event.preventDefault();
  });
  const imported = await editor.importData(new Blob(['blocked\tnote']), {
    format: 'tsv',
    mode: 'preview',
  });
  assert.equal(imported.ok, false);
  assert.equal(imported.error.code, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(importCalls, 1);
  assert.equal(beforeImportEvent.defaultPrevented, true);
  stopBeforeImport();

  const rejected = [];
  const completed = [];
  const stopRejected = editor.on('exportRejected', (event) => rejected.push(event));
  const stopCompleted = editor.on('exportCompleted', (event) => completed.push(event));
  const stopBeforeExport = editor.on('beforeExport', (event) => {
    assert.equal(event.format, 'tsv');
    assert.equal(event.mode, 'currentView');
    assert.equal(event.rowScope, 'visible');
    assert.deepEqual(event.fieldIds, ['name']);
    assert.equal(Object.isFrozen(event.fieldIds), true);
    event.preventDefault();
  });
  const blockedExport = await editor.exportData({
    mode: 'currentView',
    format: 'tsv',
    rowScope: 'visible',
    fieldIds: ['name'],
  });
  assert.equal(blockedExport.ok, false);
  assert.equal(blockedExport.error.code, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].error.code, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(completed.length, 0);
  stopBeforeExport();

  const exported = await editor.exportData({
    mode: 'currentView',
    format: 'tsv',
    rowScope: 'visible',
    fieldIds: ['name'],
  });
  assert.equal(exported.ok, true);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].exportedRowCount, 2);
  assert.deepEqual(completed[0].exportedFieldIds, ['name']);
  assert.equal(completed[0].lossless, false);
  assert.equal(rejected.length, 1);
  stopRejected();
  stopCompleted();
});

test('import cancellation during preparation returns E_ABORTED instead of a successful diagnostic report', async (t) => {
  const editor = createEditor(createFlatSnapshot(600, 'import-cancel-document'));
  t.after(() => editor.destroy());
  const controller = new AbortController();
  const stop = editor.on('taskProgress', (event) => {
    if (event.taskType === 'import' && event.stage === 'validate') {
      controller.abort();
    }
  });
  const rows = Array.from({ length: 600 }, (_, index) => `value-${index}\tnote-${index}`);
  const result = await editor.importData(new Blob([rows.join('\r\n')]), {
    format: 'tsv',
    mode: 'commit',
    signal: controller.signal,
  });
  stop();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, BOM_EDITOR_ERROR_CODES.aborted);
  assert.equal(editor.getSnapshot().revision, 'flat-paste-revision');
});

test('import maps headers by stable field id, reorders values, and exposes a proposed patch', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();
  const source = new Blob(['Note header\tName header\r\nMapped note\tMapped name'], {
    type: 'text/tab-separated-values',
  });
  const preview = await editor.importData(source, {
    format: 'tsv',
    mode: 'preview',
    header: 'firstRow',
    fieldIds: ['name', 'note'],
    mapping: [
      { source: 'Name header', fieldId: 'name' },
      { source: 'Note header', fieldId: 'note' },
    ],
    baseRevision: before.revision,
  });
  const previewReport = expectOk(preview);
  assert.equal(previewReport.commit, undefined);
  assert.ok(previewReport.proposedPatch);
  assert.equal(previewReport.proposedPatch.operations.length, 2);
  assert.equal(editor.getSnapshot().revision, before.revision);

  const committed = await editor.importData(source, {
    format: 'tsv',
    mode: 'commit',
    header: 'firstRow',
    fieldIds: ['name', 'note'],
    mapping: [
      { source: 'Name header', fieldId: 'name' },
      { source: 'Note header', fieldId: 'note' },
    ],
  });
  assert.ok(expectOk(committed).commit);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Mapped name');
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'Mapped note');
});

test('hierarchy import compiles parent mappings into one atomic, undoable transaction', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const source = new Blob([
    'Root value\t\r\nChild value\trow-1',
  ], { type: 'text/tab-separated-values' });
  const preview = await editor.importData(source, {
    format: 'tsv',
    mode: 'preview',
    fieldIds: ['name', 'note'],
    hierarchy: { parentFieldId: 'note' },
  });
  const previewReport = expectOk(preview);
  assert.equal(previewReport.diagnostics.length, 0);
  assert.equal(previewReport.proposedPatch.operations.length, 6);
  assert.ok(previewReport.proposedPatch.operations.some((operation) => operation.op === 'moveSubtree'));
  assert.equal(node(editor.getSnapshot(), 'row-2').parentId, null);

  const committed = await editor.importData(source, {
    format: 'tsv',
    mode: 'commit',
    fieldIds: ['name', 'note'],
    hierarchy: { parentFieldId: 'note' },
  });
  const report = expectOk(committed);
  assert.ok(report.commit);
  assert.equal(node(editor.getSnapshot(), 'row-2').parentId, 'row-1');
  assert.equal(editor.getSnapshot().roots.length, 1);
  const undone = await editor.undo();
  assert.equal(undone.ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-2').parentId, null);
});

test('import rejects unmapped headers with value-free cell diagnostics and no partial commit', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();
  const result = await editor.importData(
    new Blob(['Unknown\tName\r\nsecret\tWould not write']),
    {
      format: 'tsv',
      mode: 'commit',
      header: 'firstRow',
      fieldIds: ['name', 'note'],
    },
  );
  const report = expectOk(result);
  assert.ok(report.diagnostics.length > 0);
  assert.ok(report.cellDiagnostics?.some((diagnostic) => diagnostic.code === 'header-not-mapped'));
  assert.equal(report.cellDiagnostics?.some((diagnostic) => 'value' in diagnostic), false);
  assert.equal(editor.getSnapshot().revision, before.revision);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
});

test('import accepts bounded ArrayBuffer and ReadableStream sources and rejects unsupported inputs', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const encoded = new TextEncoder().encode('ArrayBuffer value\tarray note');
  const arrayBufferResult = await editor.importData(encoded.buffer, {
    format: 'tsv',
    mode: 'preview',
  });
  assert.equal(expectOk(arrayBufferResult).diagnostics.length, 0);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('Stream value\tstream note'));
      controller.close();
    },
  });
  const streamResult = await editor.importData(stream, {
    format: 'tsv',
    mode: 'preview',
  });
  assert.equal(expectOk(streamResult).diagnostics.length, 0);

  const unsupported = await editor.importData(new Blob(['x']), {
    format: 'xlsx',
    mode: 'preview',
  });
  assert.equal(expectOk(unsupported).diagnostics[0].safeContext.reason, 'zip-invalid');

  const controller = new AbortController();
  controller.abort();
  const aborted = await editor.importData(new Blob(['x']), {
    format: 'tsv',
    mode: 'preview',
    signal: controller.signal,
  });
  assert.equal(aborted.ok, false);
  assert.equal(aborted.error.code, BOM_EDITOR_ERROR_CODES.aborted);
});

test('CSV/TSV export enforces complete-data policy and reports transformed output', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const denied = await editor.exportData({
    mode: 'completeData',
    format: 'tsv',
    rowScope: 'all',
    fieldIds: ['name', 'note'],
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, BOM_EDITOR_ERROR_CODES.exportAuthRequired);

  const policyEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot({
      firstName: '=SUM(A1:A2)',
      secondName: 'Second',
    }),
    instanceId: 'export-policy-editor',
    exportPolicy: {
      async authorize() {
        return {
          decisionId: 'export-test',
          allowed: true,
          maskingByFieldId: { note: 'redact' },
        };
      },
    },
  });
  t.after(() => policyEditor.destroy());
  const exported = await policyEditor.exportData({
    mode: 'completeData',
    format: 'csv',
    rowScope: 'all',
    fieldIds: ['name', 'note'],
    csvFormulaProtection: 'safe',
  });
  const exportReport = expectOk(exported);
  assert.equal(exportReport.effectiveMode, 'policyTransformed');
  assert.equal(exportReport.lossless, false);
  assert.equal(exportReport.policyDecisionId, 'export-test');
  assert.deepEqual(exportReport.maskingSummary, { note: 'redact' });
  const csv = await exportReport.blob.text();
  assert.match(csv, /'=SUM\(A1:A2\)/u);
  assert.match(csv, /\[REDACTED\]/u);
});

test('round-trip template export serializes the current view without BOM values', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const exported = await editor.exportData({
    mode: 'roundTripTemplate',
    format: 'tsv',
    rowScope: 'visible',
    fieldIds: [],
  });
  const report = expectOk(exported);
  assert.equal(report.effectiveMode, 'roundTripTemplate');
  assert.equal(report.lossless, true);
  assert.equal(report.exportedRowCount, 0);
  const encoded = await report.blob.text();
  const parsed = parseBomViewTemplate(encoded);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.value.template.columns.length > 0);
  assert.doesNotMatch(encoded, /Part one/u);
  assert.equal(editor.applyViewTemplate(parsed.value.template).ok, true);
});

test('bounded XLSX data export round-trips through the safe worksheet parser', async (t) => {
  const sourceEditor = createEditor();
  const targetEditor = createEditor();
  t.after(() => sourceEditor.destroy());
  t.after(() => targetEditor.destroy());
  const exported = await sourceEditor.exportData({
    mode: 'currentView',
    format: 'xlsx',
    rowScope: 'visible',
    fieldIds: ['name', 'note'],
  });
  const exportReport = expectOk(exported);
  assert.equal(exportReport.blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const missingSheet = await targetEditor.importData(exportReport.blob, {
    format: 'xlsx',
    mode: 'preview',
    sheetName: 'Missing sheet',
    fieldIds: ['name', 'note'],
  });
  const missingSheetReport = expectOk(missingSheet);
  assert.equal(missingSheetReport.diagnostics[0].safeContext.reason, 'sheet-name-missing');
  assert.deepEqual(missingSheetReport.diagnostics[0].safeContext.availableSheetNames, ['BOM']);
  const limited = await targetEditor.importData(exportReport.blob, {
    format: 'xlsx',
    mode: 'preview',
    sheetName: 'BOM',
    fieldIds: ['name', 'note'],
    xlsxLimits: { maxCellBytes: 2 },
  });
  const limitedReport = expectOk(limited);
  assert.equal(limitedReport.diagnostics[0].safeContext.reason, 'cell-too-large');
  assert.deepEqual(limitedReport.cellDiagnostics, [
    {
      sheetName: 'BOM',
      sourceRow: 0,
      sourceColumn: 0,
      code: 'cell-too-large',
      messageKey: 'bom.import.cell.cell-too-large',
    },
    {
      sheetName: 'BOM',
      sourceRow: 0,
      sourceColumn: 1,
      code: 'cell-too-large',
      messageKey: 'bom.import.cell.cell-too-large',
    },
    {
      sheetName: 'BOM',
      sourceRow: 1,
      sourceColumn: 0,
      code: 'cell-too-large',
      messageKey: 'bom.import.cell.cell-too-large',
    },
  ]);
  const imported = await targetEditor.importData(exportReport.blob, {
    format: 'xlsx',
    mode: 'commit',
    sheetName: 'BOM',
    fieldIds: ['name', 'note'],
  });
  assert.ok(expectOk(imported).commit);
  assert.equal(node(targetEditor.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal(node(targetEditor.getSnapshot(), 'row-1').fields.note, 'initial');
});

test('component facade exposes import and export while retaining a frontend-only boundary', async (t) => {
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot({ documentId: 'io-component-document' }),
    instanceId: 'io-component',
    exportPolicy: {
      async authorize() {
        return { decisionId: 'component-export', allowed: true };
      },
    },
  });
  t.after(() => component.destroy());
  const imported = await component.importData(new Blob(['Component\tNote']), {
    format: 'tsv',
    mode: 'preview',
  });
  assert.equal(expectOk(imported).diagnostics.length, 0);
  const exported = await component.exportData({
    mode: 'currentView',
    format: 'tsv',
    rowScope: 'visible',
    fieldIds: ['name'],
  });
  assert.equal(expectOk(exported).exportedRowCount, 2);
});

test('plugin lifecycle stages contributions, isolates permissions, and feeds validate', async (t) => {
  const events = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-editor',
    pluginGrantPolicy: {
      async grant(manifest) {
        assert.equal(manifest.id, 'quality');
        return ['schema:read', 'document:read'];
      },
    },
  });
  t.after(() => editor.destroy());
  editor.on('pluginChanged', (event) => events.push(event));
  const plugin = {
    manifest: {
      id: 'quality',
      name: 'Quality rules',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators'],
      permissions: ['schema:read', 'document:read'],
    },
    setup(context) {
      assert.equal(context.schema.schemaVersion, schema.schemaVersion);
      assert.equal(context.getSnapshot().documentId, 'document-a');
      context.registerValidator({
        ruleId: 'name-present',
        version: '1',
        severity: 'warning',
        validate() {
          return [{
            issueId: 'ignored-by-host',
            ruleId: 'name-present',
            severity: 'warning',
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            messageKey: 'bom.quality.namePresent',
          }];
        },
      });
    },
  };
  assert.equal((await editor.installPlugin(plugin)).ok, true);
  assert.deepEqual(editor.getPlugins().map((entry) => entry.manifest.id), ['quality']);
  const report = expectOk(await editor.validate());
  assert.ok(report.issues.some((issue) => issue.ruleId === 'quality/name-present'));
  assert.equal(events[0].action, 'installed');
  assert.equal((await editor.uninstallPlugin('quality')).ok, true);
  assert.equal(editor.getPlugins().length, 0);
  assert.equal(events.at(-1).action, 'uninstalled');
});

test('initial plugin dependency traversal follows priority, name, and id ordering', async (t) => {
  const setupOrder = [];
  const plugin = ({ id, name, priority, dependencies }) => ({
    manifest: {
      id,
      name,
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      priority,
      capabilities: ['commands'],
      ...(dependencies === undefined ? {} : { dependencies }),
    },
    setup() {
      setupOrder.push(id);
    },
  });
  const rootId = 'dependency-order-root';
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-dependency-order',
    plugins: [
      plugin({
        id: rootId,
        name: 'Root',
        priority: -100,
        dependencies: {
          'a-name-beta': '*',
          'alpha-id': '*',
          'z-name-alpha': '*',
          'z-priority-low': '*',
          'zeta-id': '*',
        },
      }),
      plugin({ id: 'a-name-beta', name: 'Beta', priority: 0 }),
      plugin({ id: 'alpha-id', name: 'Same', priority: 0 }),
      plugin({ id: 'z-name-alpha', name: 'Alpha', priority: 0 }),
      plugin({ id: 'z-priority-low', name: 'Last by name', priority: -1 }),
      plugin({ id: 'zeta-id', name: 'Same', priority: 0 }),
    ],
  });
  t.after(() => editor.destroy());
  const dom = createFakeDom(640, 280);
  const mounting = editor.mount(dom.container);
  for (let index = 0; index < 32; index += 1) await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);

  const expected = [
    'z-priority-low',
    'z-name-alpha',
    'a-name-beta',
    'alpha-id',
    'zeta-id',
    rootId,
  ];
  assert.deepEqual(setupOrder, expected);
});

test('plugin manifest negotiation fails closed before setup', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-manifest-negotiation-editor',
  });
  t.after(() => editor.destroy());
  let setupCalls = 0;
  const pluginFor = ({
    id,
    version = '1.0.0',
    abiVersion = '1.0.0',
    engineRange = '*',
    capabilities = ['commands'],
  }) => ({
    manifest: {
      id,
      name: id,
      version,
      abiVersion,
      engineRange,
      capabilities,
    },
    setup(context) {
      setupCalls += 1;
      context.registerCommand({
        commandId: 'noop',
        execute() {
          return [{
            type: 'setField',
            occurrenceId: 'row-1',
            fieldPath: ['note'],
            value: 'plugin',
          }];
        },
      });
    },
  });

  expectError(await editor.installPlugin(pluginFor({
    id: 'future-abi',
    abiVersion: '2.0.0',
  })), BOM_EDITOR_ERROR_CODES.pluginInvalid);
  expectError(await editor.installPlugin(pluginFor({
    id: 'future-engine',
    engineRange: '^2.0.0',
  })), BOM_EDITOR_ERROR_CODES.pluginInvalid);
  expectError(await editor.installPlugin(pluginFor({
    id: 'invalid-engine-range',
    engineRange: 'latest',
  })), BOM_EDITOR_ERROR_CODES.pluginInvalid);
  expectError(await editor.installPlugin(pluginFor({
    id: 'unsupported-capability',
    capabilities: ['calculations'],
  })), BOM_EDITOR_ERROR_CODES.pluginInvalid);
  assert.equal(setupCalls, 0);
  assert.equal(editor.getPlugins().length, 0);
});

test('plugin host configuration negotiates compatible ABI minors and capabilities', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-compatible-minor-editor',
    pluginHostConfiguration: {
      engineVersion: '1.4.2',
      supportedAbiVersions: ['1.0.0', '1.2.0'],
      supportedCapabilities: ['commands'],
    },
  });
  t.after(() => editor.destroy());
  let contextAbiVersion;
  const installed = await editor.installPlugin({
    manifest: {
      id: 'minor-compatible',
      name: 'Minor compatible',
      version: '1.0.0',
      abiVersion: '1.1.0',
      engineRange: '>=1.0.0 <2.0.0',
      capabilities: ['commands'],
    },
    setup(context) {
      contextAbiVersion = context.negotiatedAbiVersion;
      context.registerCommand({
        commandId: 'noop',
        execute() {
          return [{
            type: 'setField',
            occurrenceId: 'row-1',
            fieldPath: ['note'],
            value: 'plugin',
          }];
        },
      });
    },
  });
  assert.equal(installed.ok, true);
  assert.equal(contextAbiVersion, '1.1.0');
  assert.deepEqual(editor.getPlugins(), [{
    manifest: editor.getPlugins()[0].manifest,
    negotiatedAbiVersion: '1.1.0',
    grantedPermissions: [],
    enabledCapabilities: ['commands'],
  }]);

  expectError(await editor.installPlugin({
    manifest: {
      id: 'disabled-validator',
      name: 'Disabled validator',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '~1.4.0',
      capabilities: ['validators'],
    },
    setup() {
      throw new Error('must not execute');
    },
  }), BOM_EDITOR_ERROR_CODES.pluginInvalid);
});

test('component facade accepts and forwards plugin host configuration', async (t) => {
  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot(),
    instanceId: 'component-plugin-host-configuration',
    pluginHostConfiguration: {
      supportedCapabilities: [],
      asyncHookTimeoutMs: 250,
      syncHookBudgetMs: 8,
    },
  });
  t.after(() => component.destroy());
  expectError(await component.installPlugin({
    manifest: {
      id: 'component-disabled-command',
      name: 'Component disabled command',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
    },
    setup() {
      throw new Error('unsupported capability must prevent setup');
    },
  }), BOM_EDITOR_ERROR_CODES.pluginInvalid);

  assert.throws(
    () => createBomEditor({
      schema,
      columns,
      initialDocument: createSnapshot(),
      instanceId: 'invalid-plugin-sync-hook-budget',
      pluginHostConfiguration: { syncHookBudgetMs: 0 },
    }),
    (error) => error instanceof BomEditorConfigurationError &&
      error.error.code === BOM_EDITOR_ERROR_CODES.pluginInvalid,
  );
});

test('plugin reload preserves the active plugin when manifest negotiation fails', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-reload-negotiation-editor',
  });
  t.after(() => editor.destroy());
  let replacementSetupCalls = 0;
  const original = {
    manifest: {
      id: 'reloadable',
      name: 'Reloadable',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
    },
    setup(context) {
      context.registerCommand({
        commandId: 'noop',
        execute() {
          return [{
            type: 'setField',
            occurrenceId: 'row-1',
            fieldPath: ['note'],
            value: 'plugin',
          }];
        },
      });
    },
  };
  assert.equal((await editor.installPlugin(original)).ok, true);
  expectError(await editor.reloadPlugin('reloadable', {
    manifest: {
      ...original.manifest,
      version: '2.0.0',
      abiVersion: '2.0.0',
    },
    setup() {
      replacementSetupCalls += 1;
    },
  }), BOM_EDITOR_ERROR_CODES.pluginInvalid);
  assert.equal(replacementSetupCalls, 0);
  assert.deepEqual(editor.getPlugins().map((entry) => ({
    id: entry.manifest.id,
    version: entry.manifest.version,
    negotiatedAbiVersion: entry.negotiatedAbiVersion,
  })), [{ id: 'reloadable', version: '1.0.0', negotiatedAbiVersion: '1.0.0' }]);
});

test('plugin asynchronous hooks time out, abort their host signals, and discard late results', async (t) => {
  const timeoutOptions = {
    schema,
    columns,
    initialDocument: createSnapshot(),
    pluginHostConfiguration: { asyncHookTimeoutMs: 5 },
  };

  const setupGate = deferred();
  let setupSignal;
  const setupEditor = createBomEditor({
    ...timeoutOptions,
    instanceId: 'plugin-setup-timeout',
  });
  t.after(() => setupEditor.destroy());
  expectError(await setupEditor.installPlugin({
    manifest: {
      id: 'setup-timeout',
      name: 'Setup timeout',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
    },
    setup(context) {
      setupSignal = context.signal;
      return setupGate.promise;
    },
  }), BOM_EDITOR_ERROR_CODES.pluginTimeout);
  assert.equal(setupSignal.aborted, true);
  assert.equal(setupEditor.getPlugins().length, 0);
  setupGate.resolve();
  await turn();

  const grantGate = deferred();
  let grantSignal;
  const grantEditor = createBomEditor({
    ...timeoutOptions,
    instanceId: 'plugin-grant-timeout',
    pluginGrantPolicy: {
      grant(_manifest, options) {
        grantSignal = options.signal;
        return grantGate.promise;
      },
    },
  });
  t.after(() => grantEditor.destroy());
  expectError(await grantEditor.installPlugin({
    manifest: {
      id: 'grant-timeout',
      name: 'Grant timeout',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
    },
    setup() {
      throw new Error('grant timeout must prevent setup');
    },
  }), BOM_EDITOR_ERROR_CODES.pluginTimeout);
  assert.equal(grantSignal.aborted, true);
  assert.equal(grantEditor.getPlugins().length, 0);
  grantGate.resolve([]);
  await turn();

  const validatorGate = deferred();
  let validatorSignal;
  const validatorEditor = createBomEditor({
    ...timeoutOptions,
    instanceId: 'plugin-validator-timeout',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => validatorEditor.destroy());
  assert.equal((await validatorEditor.installPlugin({
    manifest: {
      id: 'validator-timeout',
      name: 'Validator timeout',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators'],
      permissions: ['document:read'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'slow-rule',
        version: '1',
        severity: 'warning',
        validate(validationContext) {
          validatorSignal = validationContext.signal;
          return validatorGate.promise;
        },
      });
    },
  })).ok, true);
  expectError(await validatorEditor.validate(), BOM_EDITOR_ERROR_CODES.pluginTimeout);
  assert.equal(validatorSignal.aborted, true);
  validatorGate.resolve([]);
  await turn();

  const fixerGate = deferred();
  let fixerSignal;
  const fixerEditor = createBomEditor({
    ...timeoutOptions,
    instanceId: 'plugin-fixer-timeout',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => fixerEditor.destroy());
  assert.equal((await fixerEditor.installPlugin({
    manifest: {
      id: 'fixer-timeout',
      name: 'Fixer timeout',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators', 'fixers'],
      permissions: ['document:read'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'slow-fixer-rule',
        version: '1',
        severity: 'warning',
        validate() {
          return [{
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            messageKey: 'bom.plugin.timeout.fixer',
          }];
        },
      });
      context.registerFixer({
        fixerId: 'slow-fixer-rule',
        propose(fixerContext) {
          fixerSignal = fixerContext.signal;
          return fixerGate.promise;
        },
      });
    },
  })).ok, true);
  const fixerIssue = expectOk(await fixerEditor.validate()).issues.find((issue) =>
    issue.ruleId === 'fixer-timeout/slow-fixer-rule',
  );
  assert.ok(fixerIssue);
  expectError(
    await fixerEditor.proposeFix('fixer-timeout', fixerIssue),
    BOM_EDITOR_ERROR_CODES.pluginTimeout,
  );
  assert.equal(fixerSignal.aborted, true);
  fixerGate.resolve(null);
  await turn();

  const commandGate = deferred();
  let commandSignal;
  const commandEditor = createBomEditor({
    ...timeoutOptions,
    instanceId: 'plugin-command-timeout',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => commandEditor.destroy());
  assert.equal((await commandEditor.installPlugin({
    manifest: {
      id: 'command-timeout',
      name: 'Command timeout',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
      permissions: ['document:read'],
    },
    setup(context) {
      context.registerCommand({
        commandId: 'slow-command',
        execute(commandContext) {
          commandSignal = commandContext.signal;
          return commandGate.promise;
        },
      });
    },
  })).ok, true);
  expectError(
    await commandEditor.executePluginCommand('command-timeout', 'slow-command'),
    BOM_EDITOR_ERROR_CODES.pluginTimeout,
  );
  assert.equal(commandSignal.aborted, true);
  commandGate.resolve([]);
  await turn();

  const cleanupGate = deferred();
  let cleanupSignal;
  const cleanupEditor = createBomEditor({
    ...timeoutOptions,
    instanceId: 'plugin-cleanup-timeout',
  });
  t.after(() => cleanupEditor.destroy());
  assert.equal((await cleanupEditor.installPlugin({
    manifest: {
      id: 'cleanup-timeout',
      name: 'Cleanup timeout',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
    },
    setup() {
      return ({ signal }) => {
        cleanupSignal = signal;
        return cleanupGate.promise;
      };
    },
  })).ok, true);
  expectError(
    await cleanupEditor.uninstallPlugin('cleanup-timeout'),
    BOM_EDITOR_ERROR_CODES.pluginTimeout,
  );
  assert.equal(cleanupSignal.aborted, true);
  assert.equal(cleanupEditor.getPlugins().length, 0);
  cleanupGate.resolve();
  await turn();
});

test('plugin synchronous hook budgets emit diagnostics without rejecting successful hooks', async (t) => {
  const metrics = [];
  const warnings = [];
  const blockFor = (milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  };
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-sync-hook-budget',
    pluginHostConfiguration: {
      asyncHookTimeoutMs: 100,
      syncHookBudgetMs: 1,
    },
    pluginGrantPolicy: {
      grant() {
        blockFor(4);
        return Promise.resolve(['document:read', 'document:write']);
      },
    },
    logger: {
      warn(message, context) {
        warnings.push({ message, context });
      },
    },
  });
  const stopMetrics = editor.on('metric', (event) => metrics.push(event));
  t.after(() => {
    stopMetrics();
    editor.destroy();
  });

  assert.equal((await editor.installPlugin({
    manifest: {
      id: 'sync-hook-budget',
      name: 'Sync hook budget',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators', 'fixers', 'commands'],
      permissions: ['document:read', 'document:write'],
    },
    setup(context) {
      blockFor(4);
      context.registerValidator({
        ruleId: 'sync-budget-rule',
        version: '1',
        severity: 'warning',
        validate() {
          blockFor(4);
          return [{
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            messageKey: 'bom.plugin.syncBudget',
          }];
        },
      });
      context.registerFixer({
        fixerId: 'sync-budget-rule',
        propose() {
          blockFor(4);
          return null;
        },
      });
      context.registerCommand({
        commandId: 'sync-budget-command',
        execute() {
          blockFor(4);
          return [{
            type: 'setField',
            occurrenceId: 'row-1',
            fieldPath: ['note'],
            value: 'budgeted',
          }];
        },
      });
      return () => {
        blockFor(4);
      };
    },
  })).ok, true);

  const issue = expectOk(await editor.validate()).issues.find((candidate) =>
    candidate.ruleId === 'sync-hook-budget/sync-budget-rule',
  );
  assert.ok(issue);
  assert.equal((await editor.proposeFix('sync-hook-budget', issue)).ok, true);
  expectOk(await editor.executePluginCommand('sync-hook-budget', 'sync-budget-command'));
  assert.equal(editor.getSnapshot().nodes[0].fields.note, 'budgeted');
  expectOk(await editor.uninstallPlugin('sync-hook-budget'));

  const hookNames = metrics
    .filter((event) => event.name === 'plugin.sync-hook.duration')
    .map((event) => event.labels?.hook)
    .filter((hook) => hook !== undefined)
    .sort();
  assert.deepEqual(hookNames, [
    'cleanup',
    'command',
    'fixer',
    'grant',
    'setup',
    'validator',
  ]);
  assert.ok(metrics
    .filter((event) => event.name === 'plugin.sync-hook.duration')
    .every((event) => event.value > 1 && event.labels?.pluginId === 'sync-hook-budget'));
  assert.equal(warnings.length, 6);
  assert.ok(warnings.every(({ message }) =>
    message === 'bom-editor.plugin.sync-hook-budget-exceeded'));
});

test('unloading and destroying a plugin abort their in-flight hooks', async (t) => {
  const createSlowValidatorEditor = (instanceId) => {
    const gate = deferred();
    const started = deferred();
    let signal;
    const editor = createBomEditor({
      schema,
      columns,
      initialDocument: createSnapshot(),
      instanceId,
      pluginHostConfiguration: { asyncHookTimeoutMs: 100 },
      pluginGrantPolicy: {
        async grant() {
          return ['document:read'];
        },
      },
    });
    return {
      editor,
      gate,
      started,
      get signal() {
        return signal;
      },
      plugin: {
        manifest: {
          id: 'in-flight-validator',
          name: 'In-flight validator',
          version: '1.0.0',
          abiVersion: '1.0.0',
          engineRange: '*',
          capabilities: ['validators'],
          permissions: ['document:read'],
        },
        setup(context) {
          context.registerValidator({
            ruleId: 'in-flight-rule',
            version: '1',
            severity: 'warning',
            validate(validationContext) {
              signal = validationContext.signal;
              started.resolve();
              return gate.promise;
            },
          });
        },
      },
    };
  };

  const unloaded = createSlowValidatorEditor('plugin-unload-cancellation');
  t.after(() => unloaded.editor.destroy());
  assert.equal((await unloaded.editor.installPlugin(unloaded.plugin)).ok, true);
  const unloadingValidation = unloaded.editor.validate();
  await unloaded.started.promise;
  assert.equal((await unloaded.editor.uninstallPlugin('in-flight-validator')).ok, true);
  assert.equal(unloaded.signal.aborted, true);
  unloaded.gate.resolve([]);
  assert.equal((await unloadingValidation).ok, false);

  const destroyed = createSlowValidatorEditor('plugin-destroy-cancellation');
  assert.equal((await destroyed.editor.installPlugin(destroyed.plugin)).ok, true);
  const destroyingValidation = destroyed.editor.validate();
  await destroyed.started.promise;
  destroyed.editor.destroy();
  assert.equal(destroyed.signal.aborted, true);
  destroyed.gate.resolve([]);
  expectError(await destroyingValidation, BOM_EDITOR_ERROR_CODES.destroyed);
});

test('plugin registration unregister callbacks execute automatically in reverse order', async () => {
  const firstCommandId = 'unregister-order-first';
  const secondCommandId = 'unregister-order-second';
  const unregisterOrder = [];
  const originalDelete = Map.prototype.delete;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-unregister-order',
  });
  Map.prototype.delete = function trackedPluginUnregister(key) {
    if (key === firstCommandId || key === secondCommandId) {
      unregisterOrder.push(key);
    }
    return originalDelete.call(this, key);
  };
  try {
    assert.equal((await editor.installPlugin({
      manifest: {
        id: 'unregister-order',
        name: 'Unregister order',
        version: '1.0.0',
        abiVersion: '1.0.0',
        engineRange: '*',
        capabilities: ['commands'],
      },
      setup(context) {
        context.registerCommand({
          commandId: firstCommandId,
          execute() {
            return [];
          },
        });
        context.registerCommand({
          commandId: secondCommandId,
          execute() {
            return [];
          },
        });
      },
    })).ok, true);
    assert.equal((await editor.uninstallPlugin('unregister-order')).ok, true);
    assert.deepEqual(unregisterOrder, [secondCommandId, firstCommandId]);
    expectError(
      await editor.executePluginCommand('unregister-order', firstCommandId),
      BOM_EDITOR_ERROR_CODES.pluginNotFound,
    );
  } finally {
    Map.prototype.delete = originalDelete;
    editor.destroy();
  }
});

test('a reload whose old cleanup fails leaves the old plugin active', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-reload-cleanup-failure',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => editor.destroy());
  const original = {
    manifest: {
      id: 'cleanup-failure',
      name: 'Cleanup failure',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
      permissions: ['document:read'],
    },
    setup(context) {
      context.registerCommand({
        commandId: 'old-command',
        execute() {
          return [{
            type: 'setField',
            occurrenceId: 'row-1',
            fieldPath: ['note'],
            value: 'old command remains active',
          }];
        },
      });
      return () => {
        throw new Error('old cleanup failed');
      };
    },
  };
  assert.equal((await editor.installPlugin(original)).ok, true);
  expectError(await editor.reloadPlugin('cleanup-failure', {
    manifest: {
      ...original.manifest,
      version: '2.0.0',
    },
    setup(context) {
      context.registerCommand({
        commandId: 'replacement-command',
        execute() {
          return [];
        },
      });
    },
  }), BOM_EDITOR_ERROR_CODES.pluginFailed);
  assert.deepEqual(editor.getPlugins().map((entry) => ({
    id: entry.manifest.id,
    version: entry.manifest.version,
  })), [{ id: 'cleanup-failure', version: '1.0.0' }]);
  assert.equal(
    expectOk(await editor.executePluginCommand('cleanup-failure', 'old-command'))
      .patch.operations.length,
    1,
  );
  expectError(
    await editor.executePluginCommand('cleanup-failure', 'replacement-command'),
    BOM_EDITOR_ERROR_CODES.pluginNotFound,
  );
});

test('plugin dependency ranges must be satisfied by installed dependency versions', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-dependency-version-range',
  });
  t.after(() => editor.destroy());
  assert.equal((await editor.installPlugin({
    manifest: {
      id: 'range-provider',
      name: 'Range provider',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
    },
    setup() {},
  })).ok, true);
  let dependentSetupCalls = 0;
  expectError(await editor.installPlugin({
    manifest: {
      id: 'range-dependent',
      name: 'Range dependent',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
      dependencies: { 'range-provider': '^2.0.0' },
    },
    setup() {
      dependentSetupCalls += 1;
    },
  }), BOM_EDITOR_ERROR_CODES.pluginDependency);
  assert.equal(dependentSetupCalls, 0);
  assert.deepEqual(editor.getPlugins().map((entry) => entry.manifest.id), [
    'range-provider',
  ]);
});

test('plugin validators require document access and receive only granted schema', async (t) => {
  const validatorCalls = [];
  const documentReader = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-validator-document-reader',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => documentReader.destroy());
  const documentReaderPlugin = {
    manifest: {
      id: 'document-reader',
      name: 'Document reader',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators'],
      permissions: ['document:read', 'schema:read'],
    },
    setup(context) {
      assert.equal(context.schema, undefined);
      assert.equal(context.getSnapshot().documentId, 'document-a');
      context.registerValidator({
        ruleId: 'schema-optional',
        version: '2026.08',
        severity: 'warning',
        validate({ snapshot, schema: validationSchema }) {
          validatorCalls.push({ documentId: snapshot.documentId, schema: validationSchema });
          return [{
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            messageKey: 'bom.documentReader.schemaOptional',
          }];
        },
      });
    },
  };
  assert.equal((await documentReader.installPlugin(documentReaderPlugin)).ok, true);
  const report = expectOk(await documentReader.validate());
  const issue = report.issues.find((candidate) =>
    candidate.ruleId === 'document-reader/schema-optional',
  );
  assert.ok(issue);
  assert.equal(issue.ruleVersion, '2026.08');
  assert.equal(issue.severity, 'warning');
  assert.deepEqual(validatorCalls, [{ documentId: 'document-a', schema: undefined }]);

  let setupCalls = 0;
  let unauthorizedValidatorCalls = 0;
  const schemaReader = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-validator-schema-reader',
    pluginGrantPolicy: {
      async grant() {
        return ['schema:read'];
      },
    },
  });
  t.after(() => schemaReader.destroy());
  const denied = await schemaReader.installPlugin({
    manifest: {
      id: 'schema-reader',
      name: 'Schema reader',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators'],
      permissions: ['schema:read'],
    },
    setup(context) {
      setupCalls += 1;
      assert.equal(context.schema.schemaVersion, schema.schemaVersion);
      assert.throws(() => context.getSnapshot(), /BOM_PLUGIN_PERMISSION_DENIED/u);
      context.registerValidator({
        ruleId: 'must-not-run',
        version: '1',
        severity: 'error',
        validate() {
          unauthorizedValidatorCalls += 1;
          return [];
        },
      });
    },
  });
  expectError(denied, BOM_EDITOR_ERROR_CODES.pluginDenied);
  assert.equal(setupCalls, 1);
  assert.equal(expectOk(await schemaReader.validate()).valid, true);
  assert.equal(unauthorizedValidatorCalls, 0);
});

test('plugin validation findings are host-bound, versioned, and deterministic', async (t) => {
  let reverse = false;
  let forged = false;
  const validationEvents = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-validator-determinism',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => editor.destroy());
  editor.on('validationChanged', (event) => validationEvents.push(event));
  assert.equal((await editor.installPlugin({
    manifest: {
      id: 'quality',
      name: 'Quality',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators'],
      permissions: ['document:read'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'name-present',
        version: '2026.08.1',
        severity: 'warning',
        validate() {
          if (forged) {
            return [{
              ruleId: 'other-rule',
              severity: 'error',
              occurrenceId: 'row-1',
              fieldPath: ['name'],
              messageKey: 'bom.quality.forged',
            }];
          }
          const findings = [
            {
              occurrenceId: 'row-1',
              fieldPath: ['name'],
              messageKey: 'bom.quality.first',
              messageParams: { order: 1 },
            },
            {
              occurrenceId: 'row-2',
              fieldPath: ['name'],
              messageKey: 'bom.quality.second',
              messageParams: { order: 2 },
            },
          ];
          reverse = !reverse;
          return reverse ? findings.reverse() : findings;
        },
      });
    },
  })).ok, true);
  const first = expectOk(await editor.validate());
  const second = expectOk(await editor.validate());
  const firstFindings = first.issues.filter((issue) => issue.ruleId === 'quality/name-present');
  const secondFindings = second.issues.filter((issue) => issue.ruleId === 'quality/name-present');
  assert.deepEqual(secondFindings, firstFindings);
  assert.deepEqual(firstFindings.map((issue) => issue.occurrenceId), ['row-1', 'row-2']);
  assert.deepEqual(firstFindings.map((issue) => issue.ruleVersion), ['2026.08.1', '2026.08.1']);
  assert.deepEqual(firstFindings.map((issue) => issue.severity), ['warning', 'warning']);
  assert.equal(validationEvents.length, 1);

  forged = true;
  const forgedReport = expectOk(await editor.validate());
  assert.equal(forgedReport.issues.some((issue) => issue.ruleId === 'quality/other-rule'), false);
  assert.equal(forgedReport.issues.some((issue) =>
    issue.ruleId.startsWith('quality/name-present.validator.'),
  ), true);
});

test('late validator results cannot overwrite current document or plugin validation state', async (t) => {
  let gate = deferred();
  let started = deferred();
  const validationEvents = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-validator-stale',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => editor.destroy());
  editor.on('validationChanged', (event) => validationEvents.push(event));
  const makePlugin = (version) => ({
    manifest: {
      id: 'late-quality',
      name: 'Late quality',
      version,
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators'],
      permissions: ['document:read'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'late-rule',
        version,
        severity: 'warning',
        async validate() {
          started.resolve();
          return gate.promise;
        },
      });
    },
  });
  assert.equal((await editor.installPlugin(makePlugin('1'))).ok, true);
  const documentPending = editor.validate();
  await started.promise;
  assert.equal((await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'changed while validating',
  })).ok, true);
  gate.resolve([{
    occurrenceId: 'row-1',
    fieldPath: ['name'],
    messageKey: 'bom.late.document',
  }]);
  expectError(await documentPending, BOM_EDITOR_ERROR_CODES.validationStale);
  assert.equal(validationEvents.length, 0);

  gate = deferred();
  started = deferred();
  const pluginPending = editor.validate();
  await started.promise;
  assert.equal((await editor.reloadPlugin('late-quality', makePlugin('2'))).ok, true);
  gate.resolve([{
    occurrenceId: 'row-1',
    fieldPath: ['name'],
    messageKey: 'bom.late.plugin',
  }]);
  expectError(await pluginPending, BOM_EDITOR_ERROR_CODES.validationStale);
  assert.equal(validationEvents.length, 0);
});

test('plugin command output still commits through one Core transaction', async (t) => {
  let observedCommandSchema = 'unobserved';
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-command-editor',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => editor.destroy());
  const plugin = {
    manifest: {
      id: 'commands',
      name: 'Commands',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['commands'],
      permissions: ['document:read'],
    },
    setup(context) {
      context.registerCommand({
        commandId: 'rename',
        execute({ schema: commandSchema }) {
          observedCommandSchema = commandSchema;
          return [{
            type: 'setField',
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            value: 'From plugin',
          }];
        },
      });
    },
  };
  assert.equal((await editor.installPlugin(plugin)).ok, true);
  const committed = await editor.executePluginCommand('commands', 'rename');
  assert.equal(expectOk(committed).patch.operations.length, 1);
  assert.equal(observedCommandSchema, undefined);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'From plugin');
  assert.equal(expectOk(await editor.undo()).patch.operations.length, 1);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
});

test('host-issued fixes include immutable impact and Diff, commit once, and revalidate', async (t) => {
  let validationCalls = 0;
  const validationEvents = [];
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-fix-editor',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read', 'document:write'];
      },
    },
  });
  t.after(() => editor.destroy());
  const plugin = {
    manifest: {
      id: 'quality',
      name: 'Quality fixes',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators', 'fixers'],
      permissions: ['document:read', 'document:write'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'name-present',
        version: '1',
        severity: 'warning',
        validate({ snapshot }) {
          validationCalls += 1;
          return snapshot.nodes[0].fields.name === 'Fixed name'
            ? []
            : [{
              issueId: 'ignored-by-host',
              ruleId: 'name-present',
              severity: 'warning',
              occurrenceId: 'row-1',
              fieldPath: ['name'],
              messageKey: 'bom.quality.namePresent',
            }];
        },
      });
      context.registerFixer({
        fixerId: 'name-present',
        async propose() {
          return {
            proposalId: 'set-name',
            ruleId: 'name-present',
            titleKey: 'bom.quality.setName',
            confidence: 0.95,
            commands: [{
              type: 'setField',
              occurrenceId: 'row-1',
              fieldPath: ['name'],
              value: 'Fixed name',
            }],
          };
        },
      });
    },
  };
  assert.equal((await editor.installPlugin(plugin)).ok, true);
  const report = expectOk(await editor.validate());
  const issue = report.issues.find((candidate) => candidate.ruleId === 'quality/name-present');
  assert.ok(issue);
  editor.on('validationChanged', (event) => validationEvents.push(event));
  const before = editor.getSnapshot();
  const proposal = expectOk(await editor.proposeFix('quality', issue));
  assert.ok(proposal);
  assert.equal(editor.getSnapshot(), before);
  assert.equal(Object.isFrozen(proposal), true);
  assert.equal(Object.isFrozen(proposal.commands), true);
  assert.equal(Object.isFrozen(proposal.commands[0]), true);
  assert.equal(proposal.pluginId, 'quality');
  assert.equal(proposal.ruleId, 'quality/name-present');
  assert.equal(proposal.documentGeneration, 0);
  assert.deepEqual(proposal.impact.occurrenceIds, ['row-1']);
  assert.deepEqual(proposal.impact.structuralOccurrenceIds, []);
  assert.deepEqual(proposal.impact.fieldPaths, [{ occurrenceId: 'row-1', fieldPath: ['name'] }]);
  assert.equal(proposal.diff.sourceRevision, before.revision);
  assert.equal(proposal.diff.changes.length, 1);
  assert.deepEqual(proposal.diff.changes[0], {
    type: 'field',
    occurrenceId: 'row-1',
    fieldId: 'name',
    fieldPath: ['name'],
    before: { present: true, value: 'Part one' },
    after: { present: true, value: 'Fixed name' },
  });

  const committed = expectOk(await editor.applyFix(proposal));
  assert.equal(committed.patch.operations.length, 1);
  assert.match(committed.patch.origin, /^plugin:fix:quality\/set-name:/u);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Fixed name');
  assert.ok(validationCalls >= 2);
  assert.equal(validationEvents.at(-1).documentRevision, committed.revision);
  assert.equal(validationEvents.at(-1).issueCount, 0);

  assert.equal((await editor.undo()).ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal((await editor.redo()).ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Fixed name');
  const replayed = await editor.applyFix(proposal);
  assert.equal(replayed.ok, false);
  assert.equal(replayed.error.code, BOM_EDITOR_ERROR_CODES.fixInvalid);
});

test('slow post-fix validation does not keep the transaction FIFO busy', async (t) => {
  let delayRevalidation = false;
  const validationStarted = deferred();
  const validationGate = deferred();
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-fix-nonblocking-revalidation',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read', 'document:write'];
      },
    },
  });
  t.after(() => editor.destroy());
  assert.equal((await editor.installPlugin({
    manifest: {
      id: 'slow-quality',
      name: 'Slow quality',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators', 'fixers'],
      permissions: ['document:read', 'document:write'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'name-present',
        version: '1',
        severity: 'warning',
        async validate() {
          if (delayRevalidation) {
            validationStarted.resolve();
            return validationGate.promise;
          }
          return [{
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            messageKey: 'bom.slowQuality.namePresent',
          }];
        },
      });
      context.registerFixer({
        fixerId: 'name-present',
        propose() {
          return {
            proposalId: 'set-name',
            ruleId: 'name-present',
            titleKey: 'bom.slowQuality.setName',
            confidence: 1,
            commands: [{
              type: 'setField',
              occurrenceId: 'row-1',
              fieldPath: ['name'],
              value: 'Fixed name',
            }],
          };
        },
      });
    },
  })).ok, true);
  const issue = expectOk(await editor.validate()).issues.find((candidate) =>
    candidate.ruleId === 'slow-quality/name-present',
  );
  assert.ok(issue);
  const proposal = expectOk(await editor.proposeFix('slow-quality', issue));
  assert.ok(proposal);
  delayRevalidation = true;
  const applying = editor.applyFix(proposal);
  await validationStarted.promise;
  assert.equal((await editor.undo()).ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
  validationGate.resolve([]);
  assert.equal(expectOk(await applying).patch.operations.length, 1);
});

test('bounded fix proposal retention expires active capabilities explicitly', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-fix-retention',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read', 'document:write'];
      },
    },
  });
  t.after(() => editor.destroy());
  assert.equal((await editor.installPlugin({
    manifest: {
      id: 'retention-quality',
      name: 'Retention quality',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators', 'fixers'],
      permissions: ['document:read', 'document:write'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'name-present',
        version: '1',
        severity: 'warning',
        validate() {
          return [{
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            messageKey: 'bom.retentionQuality.namePresent',
          }];
        },
      });
      context.registerFixer({
        fixerId: 'name-present',
        propose() {
          return {
            proposalId: 'set-name',
            ruleId: 'name-present',
            titleKey: 'bom.retentionQuality.setName',
            confidence: 1,
            commands: [{
              type: 'setField',
              occurrenceId: 'row-1',
              fieldPath: ['name'],
              value: 'Fixed name',
            }],
          };
        },
      });
    },
  })).ok, true);
  const issue = expectOk(await editor.validate()).issues.find((candidate) =>
    candidate.ruleId === 'retention-quality/name-present',
  );
  assert.ok(issue);
  let oldest;
  for (let index = 0; index <= 256; index += 1) {
    const proposal = expectOk(await editor.proposeFix('retention-quality', issue));
    assert.ok(proposal);
    if (index === 0) oldest = proposal;
  }
  assert.ok(oldest);
  expectError(await editor.applyFix(oldest), BOM_EDITOR_ERROR_CODES.fixStale);
});

test('fix application requires a host-issued capability and document write permission', async (t) => {
  let observedFixerSchema = 'unobserved';
  const makePlugin = () => ({
    manifest: {
      id: 'readonly-quality',
      name: 'Readonly quality fixes',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators', 'fixers'],
      permissions: ['document:read', 'document:write'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'name-present',
        version: '1',
        severity: 'warning',
        validate() {
          return [{
            issueId: 'ignored-by-host',
            ruleId: 'name-present',
            severity: 'warning',
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            messageKey: 'bom.quality.namePresent',
          }];
        },
      });
      context.registerFixer({
        fixerId: 'name-present',
        propose({ schema: fixerSchema }) {
          observedFixerSchema = fixerSchema;
          return {
            proposalId: 'set-name',
            ruleId: 'name-present',
            titleKey: 'bom.quality.setName',
            confidence: 0.8,
            commands: [{
              type: 'setField',
              occurrenceId: 'row-1',
              fieldPath: ['name'],
              value: 'Would write',
            }],
          };
        },
      });
    },
  });
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-fix-readonly-editor',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => editor.destroy());
  assert.equal((await editor.installPlugin(makePlugin())).ok, true);
  const issue = expectOk(await editor.validate()).issues.find((candidate) =>
    candidate.ruleId === 'readonly-quality/name-present',
  );
  assert.ok(issue);
  const proposal = expectOk(await editor.proposeFix('readonly-quality', issue));
  assert.ok(proposal);
  assert.equal(observedFixerSchema, undefined);
  const forged = Object.freeze({ ...proposal });
  const forgedResult = await editor.applyFix(forged);
  assert.equal(forgedResult.ok, false);
  assert.equal(forgedResult.error.code, BOM_EDITOR_ERROR_CODES.fixInvalid);
  const denied = await editor.applyFix(proposal);
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, BOM_EDITOR_ERROR_CODES.pluginDenied);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
});

test('queued and overlapping fixes fail closed until the host makes an explicit conflict decision', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-fix-conflict-editor',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read', 'document:write'];
      },
    },
  });
  t.after(() => editor.destroy());
  const pluginFor = (id, value) => ({
    manifest: {
      id,
      name: `${id} fixes`,
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators', 'fixers'],
      permissions: ['document:read', 'document:write'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'name-present',
        version: '1',
        severity: 'warning',
        validate() {
          return [{
            issueId: 'ignored-by-host',
            ruleId: 'name-present',
            severity: 'warning',
            occurrenceId: 'row-1',
            fieldPath: ['name'],
            messageKey: `bom.${id}.namePresent`,
          }];
        },
      });
      context.registerFixer({
        fixerId: 'name-present',
        propose() {
          return {
            proposalId: 'set-name',
            ruleId: 'name-present',
            titleKey: `bom.${id}.setName`,
            confidence: 0.8,
            commands: [{
              type: 'setField',
              occurrenceId: 'row-1',
              fieldPath: ['name'],
              value,
            }],
          };
        },
      });
    },
  });
  assert.equal((await editor.installPlugin(pluginFor('quality-a', 'From A'))).ok, true);
  assert.equal((await editor.installPlugin(pluginFor('quality-b', 'From B'))).ok, true);
  const report = expectOk(await editor.validate());
  const issueA = report.issues.find((candidate) => candidate.ruleId === 'quality-a/name-present');
  const issueB = report.issues.find((candidate) => candidate.ruleId === 'quality-b/name-present');
  assert.ok(issueA);
  assert.ok(issueB);
  const proposalA = expectOk(await editor.proposeFix('quality-a', issueA));
  const proposalB = expectOk(await editor.proposeFix('quality-b', issueB));
  assert.ok(proposalA);
  assert.ok(proposalB);
  assert.deepEqual(proposalB.conflicts.map((conflict) => conflict.proposalId), [proposalA.proposalId]);
  const undecided = await editor.applyFix(proposalB);
  assert.equal(undecided.ok, false);
  assert.equal(undecided.error.code, BOM_EDITOR_ERROR_CODES.fixConflict);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Part one');
  assert.equal((await editor.applyFix(proposalB, { conflictResolution: 'supersede' })).ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'From B');
  const superseded = await editor.applyFix(proposalA);
  assert.equal(superseded.ok, false);
  assert.equal(superseded.error.code, BOM_EDITOR_ERROR_CODES.fixInvalid);

  const freshEditor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'plugin-fix-stale-editor',
    pluginGrantPolicy: {
      async grant() {
        return ['document:read', 'document:write'];
      },
    },
  });
  t.after(() => freshEditor.destroy());
  assert.equal((await freshEditor.installPlugin(pluginFor('quality-c', 'From C'))).ok, true);
  const staleIssue = expectOk(await freshEditor.validate()).issues.find((candidate) =>
    candidate.ruleId === 'quality-c/name-present',
  );
  assert.ok(staleIssue);
  const staleProposal = expectOk(await freshEditor.proposeFix('quality-c', staleIssue));
  assert.ok(staleProposal);
  const first = freshEditor.execute({
    type: 'setField',
    occurrenceId: 'row-2',
    fieldPath: ['note'],
    value: 'ahead of proposal',
  });
  const delayed = freshEditor.applyFix(staleProposal);
  assert.equal((await first).ok, true);
  const stale = await delayed;
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, BOM_EDITOR_ERROR_CODES.fixStale);
  assert.equal(node(freshEditor.getSnapshot(), 'row-1').fields.name, 'Part one');
});

test('presentation configuration is view-only and survives remount', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'presentation-editor',
  });
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();
  const configured = editor.configurePresentation({
    locale: 'en-US',
    direction: 'rtl',
    labels: {
      treegridLabel: 'Parts',
      editorLabel: 'Value',
      liveRegion: { validationCompleted: 'Validation passed.' },
    },
    theme: { background: '#101820' },
  });
  assert.equal(configured.ok, true);
  assert.equal(editor.getPresentation().direction, 'rtl');
  assert.equal(editor.getPresentation().theme.background, '#101820');
  assert.equal(
    editor.getPresentation().labels.liveRegion.validationCompleted,
    'Validation passed.',
  );
  assert.equal(editor.configurePresentation({
    labels: { liveRegion: { validationIssuesFound: 'Found {count} issues.' } },
  }).ok, true);
  assert.equal(
    editor.getPresentation().labels.liveRegion.validationCompleted,
    'Validation passed.',
  );
  assert.equal(
    editor.getPresentation().labels.liveRegion.validationIssuesFound,
    'Found {count} issues.',
  );
  assert.equal(editor.getSnapshot(), before);
  assert.equal(editor.configurePresentation({ locale: 'not a locale' }).ok, false);
});

test('locale packs preserve document state and resolve static localized labels', (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-locale-pack',
  });
  t.after(() => editor.destroy());
  const before = editor.getSnapshot();
  assert.equal(editor.getPresentation().locale, 'zh-CN');
  assert.equal(editor.getPresentation().labels.editorLabel, '编辑');

  assert.equal(editor.configurePresentation({
    locale: 'en-US',
    labels: {
      treegridLabel: { 'zh-CN': '零部件清单', 'en-US': 'Parts list' },
      contextMenu: {
        'column.delete': { 'zh-CN': '删除所选列' },
      },
    },
  }).ok, true);
  assert.equal(editor.getPresentation().labels.editorLabel, 'Edit cell');
  assert.equal(editor.getPresentation().labels.treegridLabel, 'Parts list');
  assert.equal(editor.getPresentation().labels.contextMenu['column.delete'], '删除所选列');
  assert.equal(editor.getSnapshot(), before);

  assert.equal(editor.configurePresentation({ locale: 'zh-CN' }).ok, true);
  assert.equal(editor.getPresentation().labels.treegridLabel, '零部件清单');
  assert.equal(editor.getPresentation().labels.contextMenu['column.delete'], '删除所选列');
  assert.equal(editor.getSnapshot(), before);
  assert.equal(editor.configurePresentation({ locale: 'fr-FR' }).ok, false);
});

test('mounted editor announces changed value-free validation summaries', async (t) => {
  let invalid = false;
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'validation-live-region',
    renderer: {
      liveRegion: { politeMinIntervalMs: 0 },
      labels: {
        liveRegion: {
          validationCompleted: 'Validation complete.',
          validationIssuesFound: 'Validation complete: {count} issues.',
        },
      },
    },
    pluginGrantPolicy: {
      async grant() {
        return ['document:read'];
      },
    },
  });
  t.after(() => editor.destroy());
  expectOk(await editor.installPlugin({
    manifest: {
      id: 'validation-live-region',
      name: 'Validation live region',
      version: '1.0.0',
      abiVersion: '1.0.0',
      engineRange: '*',
      capabilities: ['validators'],
      permissions: ['document:read'],
    },
    setup(context) {
      context.registerValidator({
        ruleId: 'changed-summary',
        version: '1',
        severity: 'warning',
        validate() {
          return invalid
            ? [{
                occurrenceId: 'row-1',
                fieldPath: ['name'],
                messageKey: 'validation.row-1.not-spoken',
              }]
            : [];
        },
      });
    },
  }));
  const dom = createFakeDom(640, 280);
  const mounting = editor.mount(dom.container);
  await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);
  const polite = dom.container.querySelector('[data-bom-live-region="polite"]');
  assert.ok(polite);

  const valid = expectOk(await editor.validate());
  assert.equal(valid.valid, true);
  const validAnnouncement = polite.querySelector(
    '[data-bom-live-region-message="polite"]',
  );
  assert.ok(validAnnouncement);
  assert.equal(validAnnouncement.textContent, 'Validation complete.');

  expectOk(await editor.validate());
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]'),
    validAnnouncement,
  );

  invalid = true;
  const invalidReport = expectOk(await editor.validate());
  assert.equal(invalidReport.valid, false);
  const invalidAnnouncement = polite.querySelector(
    '[data-bom-live-region-message="polite"]',
  );
  assert.ok(invalidAnnouncement);
  assert.equal(invalidAnnouncement.textContent, 'Validation complete: 1 issues.');
  assert.equal(invalidAnnouncement.textContent.includes('row-1'), false);
  assert.equal(invalidAnnouncement.textContent.includes('not-spoken'), false);

  expectOk(await editor.validate());
  assert.equal(
    polite.querySelector('[data-bom-live-region-message="polite"]'),
    invalidAnnouncement,
  );
});

test('editor and component facades forward localized live-region announcements', async (t) => {
  const editor = createBomEditor({
    schema,
    columns,
    initialDocument: createSnapshot(),
    instanceId: 'editor-live-region',
    renderer: { liveRegion: { politeMinIntervalMs: 0 } },
  });
  t.after(() => editor.destroy());
  assert.deepEqual(editor.announce({ message: 'Before mount.' }), {
    ok: false,
    reason: 'not-mounted',
  });
  const dom = createFakeDom(640, 280);
  const mounting = editor.mount(dom.container);
  await Promise.resolve();
  dom.window.flushAnimationFrames();
  expectOk(await mounting);
  assert.deepEqual(editor.announce({ message: 'Changes saved.' }), {
    ok: true,
    delivery: 'immediate',
  });
  assert.equal(
    dom.container
      .querySelector('[data-bom-live-region="polite"]')
      .querySelector('[data-bom-live-region-message="polite"]').textContent,
    'Changes saved.',
  );

  const component = createBomEditorComponent({
    schema,
    columns,
    document: createSnapshot({ documentId: 'component-live-region' }),
    instanceId: 'component-live-region',
    renderer: { liveRegion: { politeMinIntervalMs: 0 } },
  });
  t.after(() => component.destroy());
  const componentDom = createFakeDom(640, 280);
  const componentMounting = component.mount(componentDom.container);
  await Promise.resolve();
  componentDom.window.flushAnimationFrames();
  expectOk(await componentMounting);
  assert.deepEqual(component.announce({ message: 'Import complete.' }), {
    ok: true,
    delivery: 'immediate',
  });
  assert.equal(
    componentDom.container
      .querySelector('[data-bom-live-region="polite"]')
      .querySelector('[data-bom-live-region-message="polite"]').textContent,
    'Import complete.',
  );
});

test('component Diff view is controlled, value-free, and revision-bound', async (t) => {
  const document = createSnapshot();
  const diffView = Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: document.documentId,
    documentGeneration: 0,
    viewRevision: document.revision,
    rows: Object.freeze([
      Object.freeze({ occurrenceId: 'row-1', kind: 'moved', before: 'secret-row' }),
    ]),
    cells: Object.freeze([
      Object.freeze({
        occurrenceId: 'row-2',
        columnId: 'name',
        kind: 'changed',
        before: 'secret-cell',
      }),
    ]),
  });
  const component = createBomEditorComponent({
    schema,
    columns,
    document,
    diffView,
    instanceId: 'component-diff-view',
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);
  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);

  const movedRow = container.querySelectorAll('[role="row"]').find(
    (row) => row.getAttribute('aria-rowindex') === '2',
  );
  assert.equal(movedRow.getAttribute('data-bom-diff-kind'), 'moved');
  const changedCell = container.querySelectorAll('[role="gridcell"]').find(
    (cell) => cell.textContent === 'Part two',
  );
  assert.equal(changedCell.getAttribute('data-bom-diff-kind'), 'changed');
  assert.equal(changedCell.getAttribute('aria-description').includes('secret-cell'), false);
  assert.equal(component.setDiffView({ protocol: 'bad' }).ok, false);

  expectOk(await component.update({ document, diffView: null }));
  window.flushAnimationFrames();
  assert.equal(container.querySelector('[data-bom-diff-kind]'), null);
});

test('Diff views fail closed on stale bindings and unknown addresses, then expire after data changes', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = await mountFocusedGrid(editor);
  const initial = editor.getSnapshot();
  const valid = Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: initial.documentId,
    documentGeneration: 0,
    viewRevision: initial.revision,
    rows: Object.freeze([Object.freeze({ occurrenceId: 'row-1', kind: 'moved' })]),
    cells: Object.freeze([
      Object.freeze({ occurrenceId: 'row-2', columnId: 'name', kind: 'changed' }),
    ]),
  });

  expectOk(editor.setDiffView(valid));
  window.flushAnimationFrames();
  const initialMarker = container.querySelector('[data-bom-diff-kind]');
  assert.ok(initialMarker);
  assert.equal(initialMarker.getAttribute('data-bom-diff-kind'), 'moved');

  assert.equal(
    expectError(
    editor.setDiffView(Object.freeze({ ...valid, viewRevision: 'stale-revision' })),
    BOM_EDITOR_ERROR_CODES.diffViewStale,
    ).category,
    'CONFLICT',
  );
  expectError(
    editor.setDiffView(Object.freeze({ ...valid, documentGeneration: 1 })),
    BOM_EDITOR_ERROR_CODES.diffViewStale,
  );
  assert.equal(
    container.querySelector('[data-bom-diff-kind]').getAttribute('data-bom-diff-kind'),
    'moved',
  );
  assert.equal(
    expectError(
    editor.setDiffView(Object.freeze({
      ...valid,
      rows: Object.freeze([Object.freeze({ occurrenceId: 'missing-row', kind: 'moved' })]),
    })),
    BOM_EDITOR_ERROR_CODES.configInvalid,
    ).category,
    'CONFIG',
  );
  assert.equal(
    container.querySelector('[data-bom-diff-kind]').getAttribute('data-bom-diff-kind'),
    'moved',
  );
  expectError(
    editor.setDiffView(Object.freeze({
      ...valid,
      cells: Object.freeze([
        Object.freeze({ occurrenceId: 'row-2', columnId: 'missing-column', kind: 'changed' }),
      ]),
    })),
    BOM_EDITOR_ERROR_CODES.configInvalid,
  );
  assert.equal(
    container.querySelector('[data-bom-diff-kind]').getAttribute('data-bom-diff-kind'),
    'moved',
  );

  expectOk(await editor.execute({
    type: 'setField',
    occurrenceId: 'row-1',
    fieldPath: ['note'],
    value: 'updated after Diff',
  }));
  window.flushAnimationFrames();
  assert.equal(container.querySelector('[data-bom-diff-kind]'), null);
  expectOk(await editor.undo());
  window.flushAnimationFrames();
  assert.equal(container.querySelector('[data-bom-diff-kind]'), null);
  expectOk(await editor.redo());
  window.flushAnimationFrames();
  assert.equal(container.querySelector('[data-bom-diff-kind]'), null);

  const current = editor.getSnapshot();
  expectOk(editor.setDiffView(Object.freeze({
    ...valid,
    viewRevision: current.revision,
  })));
  window.flushAnimationFrames();
  assert.ok(container.querySelector('[data-bom-diff-kind]'));
  expectOk(await editor.setDocument(createSnapshot({
    documentId: 'replacement-document',
    revision: 'replacement-revision',
  })));
  window.flushAnimationFrames();
  assert.equal(container.querySelector('[data-bom-diff-kind]'), null);
});

test('deleted Diff summaries accept only absent IDs and valid current anchors', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = await mountFocusedGrid(editor);
  const snapshot = editor.getSnapshot();
  const valid = Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: snapshot.documentId,
    documentGeneration: 0,
    viewRevision: snapshot.revision,
    rows: Object.freeze([]),
    cells: Object.freeze([]),
    deletedRows: Object.freeze([
      Object.freeze({
        occurrenceId: 'deleted-row-1',
        anchorOccurrenceId: 'row-1',
        position: 'after',
        count: 3,
      }),
    ]),
  });
  expectOk(editor.setDiffView(valid));
  window.flushAnimationFrames();
  const summary = container.querySelector('[data-bom-diff-deletion-summary="true"]');
  assert.ok(summary);
  assert.equal(summary.textContent, '差异：已删除 3 行。');
  assert.equal(container.querySelectorAll('[role="row"]').some(
    (row) => row.getAttribute('data-bom-diff-deletion-summary') !== null,
  ), false);

  assert.equal(
    expectError(
      editor.setDiffView(Object.freeze({
        ...valid,
        deletedRows: Object.freeze([
          Object.freeze({
            occurrenceId: 'row-1',
            position: 'start',
            count: 1,
          }),
        ]),
      })),
      BOM_EDITOR_ERROR_CODES.configInvalid,
    ).category,
    'CONFIG',
  );
  assert.equal(
    expectError(
      editor.setDiffView(Object.freeze({
        ...valid,
        deletedRows: Object.freeze([
          Object.freeze({
            occurrenceId: 'deleted-row-2',
            anchorOccurrenceId: 'missing-row',
            position: 'before',
            count: 1,
          }),
        ]),
      })),
      BOM_EDITOR_ERROR_CODES.configInvalid,
    ).category,
    'CONFIG',
  );
  assert.ok(container.querySelector('[data-bom-diff-deletion-summary="true"]'));
});

test('Diff ghost rows are value-free, bound to current anchors, and non-interactive', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = await mountFocusedGrid(editor);
  const snapshot = editor.getSnapshot();
  const valid = Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: snapshot.documentId,
    documentGeneration: 0,
    viewRevision: snapshot.revision,
    rows: Object.freeze([]),
    cells: Object.freeze([]),
    ghostRows: Object.freeze([
      Object.freeze({
        occurrenceId: 'deleted-ghost-1',
        anchorOccurrenceId: 'row-1',
        position: 'before',
      }),
    ]),
  });
  expectOk(editor.setDiffView(valid));
  window.flushAnimationFrames();
  const ghost = container.querySelector('[data-bom-diff-ghost-row="deleted-ghost-1"]');
  assert.ok(ghost);
  assert.equal(ghost.getAttribute('aria-disabled'), 'true');
  assert.equal(ghost.getAttribute('aria-readonly'), 'true');
  assert.equal(container.querySelector('[data-bom-editor-portal="true"]').hidden, true);
  assert.equal(
    expectError(
      editor.setDiffView(Object.freeze({
        ...valid,
        ghostRows: Object.freeze([
          Object.freeze({
            occurrenceId: 'deleted-ghost-2',
            anchorOccurrenceId: 'missing-row',
            position: 'after',
          }),
        ]),
      })),
      BOM_EDITOR_ERROR_CODES.configInvalid,
    ).category,
    'CONFIG',
  );
  assert.ok(container.querySelector('[data-bom-diff-ghost-row="deleted-ghost-1"]'));
});

test('Diff views are cleared when a decorated column is removed', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const { container, window } = await mountFocusedGrid(editor);
  const snapshot = editor.getSnapshot();
  expectOk(editor.setDiffView(Object.freeze({
    protocol: 'bom-canvas-diff-view/v1',
    documentId: snapshot.documentId,
    documentGeneration: 0,
    viewRevision: snapshot.revision,
    rows: Object.freeze([]),
    cells: Object.freeze([
      Object.freeze({ occurrenceId: 'row-1', columnId: 'note', kind: 'changed' }),
    ]),
  })));
  window.flushAnimationFrames();
  assert.ok(container.querySelector('[data-bom-diff-kind]'));
  expectOk(editor.deleteColumns(['note']));
  window.flushAnimationFrames();
  assert.equal(container.querySelector('[data-bom-diff-kind]'), null);
});

test('component serializes document, column, and Diff updates with value-free replacement bindings', async (t) => {
  const document = createSnapshot();
  const documentB = createSnapshot({ revision: 'diff-component-b' });
  const documentC = createSnapshot({ revision: 'diff-component-c' });
  const replacements = [];
  const component = createBomEditorComponent({
    schema,
    columns,
    document,
    instanceId: 'component-diff-update-fifo',
    outputs: {
      onDocumentReplaced(event) {
        replacements.push(event.next);
      },
    },
  });
  t.after(() => component.destroy());
  const { container, window } = createFakeDom(640, 280);
  const mounting = component.mount(container);
  await Promise.resolve();
  window.flushAnimationFrames();
  expectOk(await mounting);

  expectError(await component.update({
    document: documentB,
    diffView: { protocol: 'bad' },
  }), BOM_EDITOR_ERROR_CODES.configInvalid);
  assert.deepEqual(replacements, []);

  const updateB = component.update({
    document: documentB,
    diffView: Object.freeze({
      protocol: 'bom-canvas-diff-view/v1',
      documentId: documentB.documentId,
      documentGeneration: 1,
      viewRevision: documentB.revision,
      rows: Object.freeze([Object.freeze({ occurrenceId: 'row-1', kind: 'moved' })]),
      cells: Object.freeze([]),
    }),
  });
  const updateC = component.update({
    document: documentC,
    diffView: Object.freeze({
      protocol: 'bom-canvas-diff-view/v1',
      documentId: documentC.documentId,
      documentGeneration: 2,
      viewRevision: documentC.revision,
      rows: Object.freeze([]),
      cells: Object.freeze([
        Object.freeze({ occurrenceId: 'row-2', columnId: 'name', kind: 'changed' }),
      ]),
    }),
  });
  expectOk(await updateB);
  expectOk(await updateC);
  window.flushAnimationFrames();
  await flushComponentOutputs();

  assert.deepEqual(
    replacements.map((reference) => [
      reference.documentId,
      reference.generation,
      reference.revision,
    ]),
    [
      [documentB.documentId, 1, documentB.revision],
      [documentC.documentId, 2, documentC.revision],
    ],
  );
  const changedCell = container.querySelectorAll('[role="gridcell"]').find(
    (cell) => cell.textContent === 'Part two',
  );
  assert.equal(changedCell.getAttribute('data-bom-diff-kind'), 'changed');
  assert.equal(
    container.querySelectorAll('[role="row"]').find(
      (row) => row.getAttribute('data-bom-diff-kind') !== null,
    ),
    undefined,
  );
});

test('agent capability adapter enforces grants, revision binding, and idempotent mutations', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());

  const denied = createBomEditorAgentCapabilityAdapter(editor);
  const catalog = await denied.call({
    protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
    requestId: 'agent-catalog-1',
    instanceId: editor.instanceId,
    capability: 'describeCapabilities',
    origin: 'test.agent',
  });
  assert.equal(catalog.ok, true);
  assert.equal(catalog.ok && Array.isArray(catalog.value), true);
  assert.ok(BOM_EDITOR_AGENT_CAPABILITIES.some(
    (capability) => capability.id === 'executeTransaction' && capability.requiresIdempotencyKey,
  ));

  const deniedRead = await denied.call({
    protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
    requestId: 'agent-denied-read-1',
    instanceId: editor.instanceId,
    capability: 'readSnapshot',
    origin: 'test.agent',
  });
  assert.equal(deniedRead.ok, false);
  assert.equal(deniedRead.ok ? undefined : deniedRead.error.code, 'BOM_AGENT_PERMISSION_DENIED');

  const adapter = createBomEditorAgentCapabilityAdapter(editor, {
    grantedPermissions: [
      'document:read',
      'document:write',
      'history:write',
      'view:read',
      'view:write',
      'diagnostics:read',
    ],
  });
  const initial = editor.getSnapshot();
  const generation = editor.getDiagnostics().documentGeneration;
  const writeRequest = Object.freeze({
    protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
    requestId: 'agent-write-1',
    instanceId: editor.instanceId,
    documentId: initial.documentId,
    documentGeneration: generation,
    baseRevision: initial.revision,
    capability: 'executeCommand',
    origin: 'test.agent',
    idempotencyKey: 'agent-write-key-1',
    input: Object.freeze({
      command: Object.freeze({
        type: 'setField',
        occurrenceId: 'row-1',
        fieldPath: Object.freeze(['note']),
        value: 'edited by agent',
      }),
    }),
  });
  const committed = await adapter.call(writeRequest);
  assert.equal(committed.ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.note, 'edited by agent');
  const revisionAfterWrite = editor.getSnapshot().revision;

  const replayed = await adapter.call(Object.freeze({
    ...writeRequest,
    requestId: 'agent-write-retry-1',
  }));
  assert.equal(replayed.ok, true);
  assert.equal(replayed.requestId, 'agent-write-retry-1');
  assert.equal(editor.getSnapshot().revision, revisionAfterWrite);
  assert.deepEqual(replayed.ok ? replayed.value : null, committed.ok ? committed.value : null);

  const stale = await adapter.call(Object.freeze({
    ...writeRequest,
    requestId: 'agent-stale-write-1',
    idempotencyKey: 'agent-stale-key-1',
  }));
  assert.equal(stale.ok, false);
  assert.equal(stale.ok ? undefined : stale.error.code, 'BOM_AGENT_REVISION_STALE');

  const current = editor.getSnapshot();
  const transaction = await adapter.call({
    protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
    requestId: 'agent-transaction-1',
    instanceId: editor.instanceId,
    documentId: current.documentId,
    documentGeneration: editor.getDiagnostics().documentGeneration,
    baseRevision: current.revision,
    capability: 'executeTransaction',
    origin: 'test.agent',
    idempotencyKey: 'agent-transaction-key-1',
    input: {
      label: 'agent batch',
      commands: [
        {
          type: 'setField',
          occurrenceId: 'row-1',
          fieldPath: ['name'],
          value: 'Agent Part',
        },
        {
          type: 'setField',
          occurrenceId: 'row-2',
          fieldPath: ['note'],
          value: 'Agent batch note',
        },
      ],
    },
  });
  assert.equal(transaction.ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-1').fields.name, 'Agent Part');
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'Agent batch note');
});

test('agent capability adapter keeps binary exchange behind a host attachment bridge', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const adapter = createBomEditorAgentCapabilityAdapter(editor, {
    grantedPermissions: ['document:read', 'file:write'],
  });
  const snapshot = editor.getSnapshot();
  const result = await adapter.call({
    protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
    requestId: 'agent-export-no-attachment-1',
    instanceId: editor.instanceId,
    documentId: snapshot.documentId,
    documentGeneration: editor.getDiagnostics().documentGeneration,
    capability: 'exportData',
    origin: 'test.agent',
    input: {
      options: {
        mode: 'currentView',
        format: 'csv',
        rowScope: 'visible',
        fieldIds: ['name'],
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.error.code, 'BOM_AGENT_ATTACHMENT_UNSUPPORTED');
});

test('MCP adapter maps the stable Agent catalog to tools and resources without owning transport', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const capabilities = createBomEditorAgentCapabilityAdapter(editor, {
    grantedPermissions: ['document:read', 'document:write'],
  });
  const mcp = createBomEditorMcpAdapter(capabilities);
  const commandTool = mcp.listTools().find((tool) => tool.name === 'bom_executeCommand');
  assert.ok(commandTool);
  assert.equal(commandTool.annotations.readOnlyHint, false);
  assert.equal(commandTool.annotations.idempotentHint, true);
  assert.ok(commandTool.inputSchema !== true && commandTool.inputSchema !== false);
  assert.deepEqual(commandTool.inputSchema.required, [
    'requestId',
    'origin',
    'documentId',
    'documentGeneration',
    'baseRevision',
    'idempotencyKey',
  ]);

  const snapshot = editor.getSnapshot();
  const result = await mcp.callTool('bom_executeCommand', {
    requestId: 'mcp-write-1',
    origin: 'mcp.test',
    documentId: snapshot.documentId,
    documentGeneration: editor.getDiagnostics().documentGeneration,
    baseRevision: snapshot.revision,
    idempotencyKey: 'mcp-write-key-1',
    input: {
      command: {
        type: 'setField',
        occurrenceId: 'row-2',
        fieldPath: ['note'],
        value: 'written by MCP tool',
      },
    },
  });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.ok, true);
  assert.equal(node(editor.getSnapshot(), 'row-2').fields.note, 'written by MCP tool');
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);

  const resources = mcp.listResources();
  assert.equal(resources.length, 1);
  const resource = mcp.readResource(resources[0].uri);
  assert.ok(resource);
  const catalog = JSON.parse(resource.text);
  assert.equal(catalog.protocol, BOM_AGENT_CAPABILITY_PROTOCOL);
  assert.equal(catalog.instanceId, editor.instanceId);
  assert.ok(catalog.capabilities.some((entry) => entry.id === 'readSnapshot'));

  const unknown = await mcp.callTool('bom_unknown', {
    requestId: 'mcp-unknown-1',
  });
  assert.equal(unknown.isError, true);
  assert.equal(
    unknown.structuredContent.ok ? undefined : unknown.structuredContent.error.code,
    'BOM_AGENT_CAPABILITY_UNSUPPORTED',
  );
});

test('MCP JSON-RPC session dispatcher gates calls, exposes tools and resources, and forwards cancellation', async (t) => {
  const editor = createEditor();
  t.after(() => editor.destroy());
  const capabilities = createBomEditorAgentCapabilityAdapter(editor, {
    grantedPermissions: ['document:read'],
  });
  const mcp = createBomEditorMcpAdapter(capabilities);
  const session = createBomEditorMcpProtocolServer(mcp, {
    serverInfo: { name: 'bom-editor-test', version: '1.2.3' },
  });
  t.after(() => session.dispose());

  const beforeInitialize = await session.handle({
    jsonrpc: '2.0',
    id: 'before-initialize',
    method: 'tools/list',
  });
  assert.ok(beforeInitialize && 'error' in beforeInitialize);
  assert.equal(beforeInitialize.error.code, -32600);

  const initialize = await session.handle({
    jsonrpc: '2.0',
    id: 'initialize',
    method: 'initialize',
    params: { protocolVersion: '2025-03-26' },
  });
  assert.ok(initialize && 'result' in initialize);
  assert.equal(initialize.result.protocolVersion, '2025-03-26');
  assert.equal(initialize.result.serverInfo.name, 'bom-editor-test');
  assert.equal(session.initialized, true);
  assert.equal(await session.handle({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }), null);

  const tools = await session.handle({
    jsonrpc: '2.0',
    id: 'tools',
    method: 'tools/list',
  });
  assert.ok(tools && 'result' in tools);
  assert.ok(tools.result.tools.some((tool) => tool.name === 'bom_readSnapshot'));

  const toolCall = await session.handle({
    jsonrpc: '2.0',
    id: 'snapshot',
    method: 'tools/call',
    params: {
      name: 'bom_readSnapshot',
      arguments: { requestId: 'mcp-session-snapshot', origin: 'mcp.session.test' },
    },
  });
  assert.ok(toolCall && 'result' in toolCall);
  assert.equal(toolCall.result.isError, false);
  assert.equal(toolCall.result.structuredContent.ok, true);

  const resourceUri = mcp.listResources()[0].uri;
  const resource = await session.handle({
    jsonrpc: '2.0',
    id: 'resource',
    method: 'resources/read',
    params: { uri: resourceUri },
  });
  assert.ok(resource && 'result' in resource);
  assert.equal(resource.result.contents[0].uri, resourceUri);

  const unknownMethod = await session.handle({
    jsonrpc: '2.0',
    id: 'unknown-method',
    method: 'prompts/list',
  });
  assert.ok(unknownMethod && 'error' in unknownMethod);
  assert.equal(unknownMethod.error.code, -32601);
  const unknownResource = await session.handle({
    jsonrpc: '2.0',
    id: 'unknown-resource',
    method: 'resources/read',
    params: { uri: 'bom://editor/missing/capabilities' },
  });
  assert.ok(unknownResource && 'error' in unknownResource);
  assert.equal(unknownResource.error.code, -32602);

  const entered = deferred();
  const cancelledAdapter = {
    instanceId: 'cancel-test',
    listTools: () => [],
    listResources: () => [],
    readResource: () => null,
    callTool: async (_name, _argumentsValue, { signal }) => {
      entered.resolve();
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      return {
        content: [{ type: 'text', text: '{"cancelled":true}' }],
        structuredContent: { cancelled: true },
        isError: true,
      };
    },
  };
  const cancellableSession = createBomEditorMcpProtocolServer(cancelledAdapter);
  t.after(() => cancellableSession.dispose());
  await cancellableSession.handle({
    jsonrpc: '2.0',
    id: 'cancellable-initialize',
    method: 'initialize',
    params: { protocolVersion: '2025-03-26' },
  });
  const pendingCall = cancellableSession.handle({
    jsonrpc: '2.0',
    id: 'cancellable-call',
    method: 'tools/call',
    params: { name: 'bom_slow', arguments: {} },
  });
  await entered.promise;
  assert.equal(await cancellableSession.handle({
    jsonrpc: '2.0',
    method: 'notifications/cancelled',
    params: { requestId: 'cancellable-call' },
  }), null);
  const cancelled = await pendingCall;
  assert.ok(cancelled && 'result' in cancelled);
  assert.equal(cancelled.result.isError, true);
});
