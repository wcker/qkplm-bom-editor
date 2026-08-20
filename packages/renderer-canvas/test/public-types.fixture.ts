import type {
  BomCanvasCellAccessibleContext,
  BomCanvasCellDrawContext,
  BomCanvasCellHitTestContext,
  BomCanvasCellMeasureContext,
  BomCanvasCellRenderer,
  BomCanvasCellRendererHit,
  BomCanvasCellRendererHitTarget,
  BomCanvasCellRendererRegistration,
  BomCanvasCellSize,
  BomCanvasDiffCellDecoration,
  BomCanvasDiffKind,
  BomCanvasDiffRowDecoration,
  BomCanvasDiffView,
  BomCanvasLiveAnnouncement,
  BomCanvasLiveAnnouncementResult,
  BomCanvasRendererDiagnostic,
  BomCanvasRendererCallbacks,
  BomCanvasViewModel,
  BomTreeDropPosition,
  BomTreeMoveRequest,
} from '../src/index.js';
import { mountBomCanvasRenderer } from '../src/index.js';

declare const container: HTMLElement;
declare const viewModel: BomCanvasViewModel;

const diffKind: BomCanvasDiffKind = 'changed';
const diffView: BomCanvasDiffView = {
  protocol: 'bom-canvas-diff-view/v1',
  documentId: 'fixture-document',
  documentGeneration: 0,
  viewRevision: 'fixture-revision',
  rows: [{ occurrenceId: 'row-1', kind: 'moved' }],
  cells: [{ occurrenceId: 'row-1', columnId: 'name', kind: diffKind }],
};
diffView.cells[0]?.columnId satisfies string | undefined;

const valueFreeRow: BomCanvasDiffRowDecoration = {
  occurrenceId: 'row-1',
  kind: 'moved',
  // @ts-expect-error Diff decorations cannot carry a prior BOM value.
  before: 'secret',
};
valueFreeRow;

const valueFreeCell: BomCanvasDiffCellDecoration = {
  occurrenceId: 'row-1',
  columnId: 'name',
  kind: 'changed',
  // @ts-expect-error Diff decorations cannot carry a prior BOM value.
  after: 'secret',
};
valueFreeCell;

function measureCell(
  context: Readonly<BomCanvasCellMeasureContext>,
): Readonly<BomCanvasCellSize> {
  context.revision satisfies string;
  context.address.occurrenceId satisfies string;
  context.column.columnId satisfies string;
  context.bounds.width satisfies number;
  context.contentBounds.height satisfies number;
  context.availableSize.width satisfies number;
  context.locale satisfies string;
  context.direction satisfies 'ltr' | 'rtl';
  context.theme.font satisfies string;
  return {
    width: context.availableSize.width,
    height: context.availableSize.height,
  };
}

function drawCell(context: Readonly<BomCanvasCellDrawContext>): void {
  context.canvas.fillText(
    String(context.value ?? ''),
    context.contentBounds.x,
    context.contentBounds.y,
  );
  context.measuredSize.width satisfies number;
}

function hitTestCell(
  context: Readonly<BomCanvasCellHitTestContext>,
): Readonly<BomCanvasCellRendererHitTarget> | null {
  context.point.x satisfies number;
  context.point.y satisfies number;
  return { id: 'fixture-action', consume: true };
}

function accessibleCell(
  context: Readonly<BomCanvasCellAccessibleContext>,
): string {
  context.measuredSize.height satisfies number;
  return String(context.value ?? '');
}

const cellRenderer: BomCanvasCellRenderer = {
  measure: measureCell,
  draw: drawCell,
  hitTest: hitTestCell,
  getAccessibleText: accessibleCell,
  dispose() {},
};

const cellRenderers: readonly BomCanvasCellRendererRegistration[] = [
  { columnId: 'name', renderer: cellRenderer },
];

function onCellRendererHit(hit: Readonly<BomCanvasCellRendererHit>): void {
  hit.revision satisfies string;
  hit.address.columnId satisfies string;
  hit.target.id satisfies string;
  hit.target.consume satisfies boolean | undefined;
}

function assertCellRendererDiagnostic(
  diagnostic: Readonly<BomCanvasRendererDiagnostic>,
): void {
  if (diagnostic.code === 'BOM_RENDERER_CELL_RENDERER_FAILED') {
    diagnostic.phase satisfies
      | 'measure'
      | 'draw'
      | 'accessibility'
      | 'hitTest'
      | 'dispose';
    diagnostic.address?.occurrenceId satisfies string | undefined;
    diagnostic.columnId satisfies string | undefined;
  }
  if (diagnostic.code === 'BOM_RENDERER_CELL_RENDERER_BUDGET_EXCEEDED') {
    diagnostic.phase satisfies 'measure' | 'draw' | 'accessibility' | 'hitTest';
    diagnostic.address.columnId satisfies string;
    diagnostic.durationMs satisfies number;
    diagnostic.budgetMs satisfies number;
  }
  if (diagnostic.code === 'BOM_RENDERER_CELL_RENDERER_HIT_CALLBACK_FAILED') {
    diagnostic.address.occurrenceId satisfies string;
    diagnostic.targetId satisfies string;
  }
}

const incompleteCellRenderer = {
  measure: measureCell,
  draw: drawCell,
};
const invalidRegistration: BomCanvasCellRendererRegistration = {
  columnId: 'invalid',
  // @ts-expect-error getAccessibleText is required for every custom renderer.
  renderer: incompleteCellRenderer,
};
void invalidRegistration;

const callbacks: BomCanvasRendererCallbacks = {
  select(address, reason, options) {
    address.occurrenceId satisfies string;
    reason satisfies 'keyboard' | 'pointer' | 'api' | 'view-change' | 'document-change';
    options?.extend satisfies boolean | undefined;
  },
  selectAll() {},
  clearSelection() {},
  fillDown() {},
  moveSubtree(request) {
    request.occurrenceId satisfies string;
    request.targetOccurrenceId satisfies string;
    request.position satisfies 'before' | 'after' | 'inside';
  },
  copy() {
    return { id: 'copy-1', text: 'Part' };
  },
  cut() {
    return { id: 'cut-1', text: 'Part' };
  },
  paste(input) {
    input.text satisfies string | undefined;
    input.html satisfies string | undefined;
    input.internal satisfies string | undefined;
  },
  clipboardWrite(id, method, outcome) {
    id satisfies string;
    method satisfies 'async' | 'event-fallback';
    outcome satisfies 'written' | 'failed';
  },
  toggleExpansion(address, expanded) {
    address.columnId satisfies string;
    expanded satisfies boolean;
  },
  requestEdit(address, trigger) {
    address.occurrenceId satisfies string;
    trigger satisfies 'keyboard' | 'pointer' | 'api' | 'paste';
  },
  draftInput(address, value, inputType) {
    address.columnId satisfies string;
    value satisfies string;
    inputType satisfies 'insert' | 'delete' | 'replace' | 'composition';
  },
  commit(address, reason) {
    address.occurrenceId satisfies string;
    reason satisfies
      | 'enter'
      | 'fill-selection'
      | 'tab'
      | 'shift-tab'
      | 'blur'
      | 'outside-pointer'
      | 'scroll'
      | 'api';
  },
  cancel(address) {
    address.columnId satisfies string;
  },
  composition(address, phase) {
    address.occurrenceId satisfies string;
    phase satisfies 'start' | 'end';
  },
  viewChange(view, reason) {
    view.viewportHeight satisfies number;
    reason satisfies 'scroll' | 'resize' | 'projection' | 'columns' | 'row-height' | 'api';
  },
};

const optionalCut: BomCanvasRendererCallbacks['cut'] = undefined;
void optionalCut;
const optionalUndo: BomCanvasRendererCallbacks['undo'] = undefined;
const optionalRedo: BomCanvasRendererCallbacks['redo'] = undefined;
const optionalClearSelection: BomCanvasRendererCallbacks['clearSelection'] =
  undefined;
const optionalFillDown: BomCanvasRendererCallbacks['fillDown'] = undefined;
const optionalMoveSubtree: BomCanvasRendererCallbacks['moveSubtree'] = undefined;
void optionalUndo;
void optionalRedo;
void optionalClearSelection;
void optionalFillDown;
void optionalMoveSubtree;

const dropPosition: BomTreeDropPosition = 'inside';
const treeMoveRequest: BomTreeMoveRequest = {
  occurrenceId: 'row-1',
  targetOccurrenceId: 'row-2',
  position: dropPosition,
  occurrenceIds: ['row-1', 'row-3'],
};
treeMoveRequest;

const renderer = mountBomCanvasRenderer(container, viewModel, callbacks, {
  instanceId: 'fixture',
  liveRegion: { enabled: true, politeMinIntervalMs: 400 },
  labels: {
    treegridLabel: 'Parts',
    treegridDescription: 'Use the arrow keys to browse the BOM.',
    editorLabel: 'Value',
    liveRegion: {
      validationRejected: 'Input was not saved.',
      commitRejected: 'Save failed.',
      validationCompleted: 'Validation complete.',
      validationIssuesFound: 'Validation complete: {count} issues.',
      columnResizeCompleted: 'Column width updated.',
      columnReorderCompleted: 'Column position updated.',
      columnReorderTarget: 'Move to column {position}.',
      treeMoveTarget: 'Drop {position}.',
      treeMoveCompleted: 'Tree structure updated.',
    },
    diff: {
      inserted: 'Inserted.',
      deleted: 'Deleted.',
      changed: 'Changed.',
      moved: 'Moved.',
      reordered: 'Reordered.',
      material: 'Material changed.',
    },
  },
  cellRenderers,
  cellRendererFrameBudgetMs: 4,
  onCellRendererHit,
  diagnosticSink(diagnostic) {
    assertCellRendererDiagnostic(diagnostic);
  },
  frameCommitSink(frame) {
    frame.protocol satisfies 'bom-canvas-frame-commit/v1';
    frame.sequence satisfies number;
    frame.completedAtMs satisfies number;
    frame.revision satisfies string;
    frame.surface.width satisfies number;
  },
});

const announcement: BomCanvasLiveAnnouncement = {
  message: 'Changes saved.',
  politeness: 'polite',
};
const announcementResult: BomCanvasLiveAnnouncementResult =
  renderer.announce(announcement);
if (announcementResult.ok) {
  announcementResult.delivery satisfies 'immediate' | 'queued' | 'deduplicated';
} else {
  announcementResult.reason satisfies
    | 'destroyed'
    | 'not-mounted'
    | 'disabled'
    | 'invalid-announcement';
}

renderer.invalidateCell({ occurrenceId: 'row-1', columnId: 'name' });
renderer.update(viewModel, {
  dirtyCells: [{ occurrenceId: 'row-1', columnId: 'name' }],
});
const resourceKind = renderer.getDiagnostics().resources.kinds[0];
if (resourceKind !== undefined) {
  resourceKind.tracked satisfies boolean;
}
renderer.getDiagnostics().resources.cleanupFailureCount satisfies number;
renderer.getDiagnostics().workerTasks.protocol satisfies
  'bom-canvas-worker-task-ledger/v1';
renderer.getDiagnostics().workerTasks.queuedCount satisfies number;
renderer.getDiagnostics().workerTasks.runningCount satisfies number;
renderer.destroy();
