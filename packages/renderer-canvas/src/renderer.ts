import type {
  BomDecimal,
  BomFields,
  BomInteger,
  BomNode,
  BomValue,
  OccurrenceId,
} from '@bom-editor/contracts';
import {
  BOM_INTERNAL_CLIPBOARD_MIME,
  ResourceRegistry,
} from '@bom-editor/runtime';
import type {
  BomCellAddress,
  BomCellRange,
  BomColumnInsertPosition,
  BomColumnDefinition,
  BomEditCommitReason,
  BomEditState,
  BomPasteInput,
  BomSelectionChangeReason,
  BomSelectionMode,
  BomSelectionState,
  BomResourceKindDeclaration,
  BomViewChangeReason,
  BomViewState,
} from '@bom-editor/runtime';
import { resolveEffectiveDpr, type BomDprResolution } from './dpr.js';
import { hitTestCanvasCell, type BomCanvasCellHit } from './hit-test.js';
import {
  calculateCanvasSurfaceLayout,
  calculateColumnWindow,
  calculateRowLayout,
  type BomCanvasColumnLayout,
  type BomCanvasColumnWindow,
  type BomCanvasRowLayout,
  type BomCanvasRowMetric,
  type BomCanvasSurfaceLayout,
} from './layout.js';
import {
  BOM_CANVAS_DIFF_VIEW_PROTOCOL,
  BOM_CANVAS_FRAME_COMMIT_PROTOCOL,
  BOM_CANVAS_WORKER_TASK_LEDGER_PROTOCOL,
} from './types.js';
import {
  bomCanvasTreeDropPositionLabel,
  resolveBomCanvasLabels,
  resolveLocalizedText,
} from './i18n.js';
import type {
  BomCanvasCellTextContext,
  BomCanvasCellAccessibleContext,
  BomCanvasCellDrawContext,
  BomCanvasCellHitTestContext,
  BomCanvasCellMeasureContext,
  BomCanvasCellRenderer,
  BomCanvasCellRendererContext,
  BomCanvasCellRendererHit,
  BomCanvasCellRendererHitTarget,
  BomCanvasCellSize,
  BomCanvasDiffKind,
  BomCanvasDiffDeletionSummary,
  BomCanvasDiffGhostRow,
  BomCanvasDiffLabels,
  BomCanvasDiffView,
  BomCanvasClipboardPayload,
  BomCanvasFrameCommit,
  BomCanvasInvalidation,
  BomCanvasLayer,
  BomCanvasLiveAnnouncement,
  BomCanvasLiveAnnouncementResult,
  BomCanvasLiveRegionLabels,
  BomCanvasLivePoliteness,
  BomCanvasLiveRegionOptions,
  BomCanvasRect,
  BomCanvasRenderer,
  BomCanvasRendererCallbacks,
  BomCanvasRendererDiagnostic,
  BomCanvasRendererDiagnostics,
  BomCanvasRendererLabelOverrides,
  BomCanvasRendererLabels,
  BomCanvasRendererOptions,
  BomCanvasPresentationConfigurationResult,
  BomCanvasPresentationDiagnostic,
  BomCanvasPresentationOptions,
  BomCanvasPresentationState,
  BomCanvasTextDirection,
  BomCanvasTheme,
  BomCanvasViewModel,
  BomEditorLocale,
  BomCanvasColumnDeleteReason,
  BomCanvasColumnInsertReason,
  BomCanvasColumnVisibilityReason,
  BomShortcutConfigurationResult,
  BomShortcutContext,
  BomShortcutInvocation,
  BomShortcutRegistryOptions,
  BomTreeDropPosition,
  BomTreeInsertMode,
  BomTreeMoveRequest,
  BomTreeMoveDirection,
} from './types.js';
import {
  BomShortcutRegistry,
  validateBomShortcutOptions,
  type BomShortcutMatch,
} from './shortcuts.js';

const LAYERS: readonly BomCanvasLayer[] = Object.freeze([
  'background',
  'content',
  'interaction',
]);
const DEFAULT_OVERSCAN_X = 120;
const DEFAULT_OVERSCAN_Y = 160;
const DEFAULT_MAX_DPR = 2;
const DEFAULT_MAX_BACKING_STORE_BYTES = 128 * 1024 * 1024;
const DEFAULT_DIRTY_RATIO = 0.4;
const DEFAULT_INDENT_WIDTH = 16;
const DEFAULT_CELL_PADDING = 6;
const DEFAULT_HEADER_HEIGHT = 36;
const DEFAULT_ROW_HEADER_WIDTH = 48;
const EXPANDER_SIZE = 10;
const COLUMN_RESIZE_HIT_SLOP = 6;
const DEFAULT_COLUMN_RESIZE_STEP = 8;
const AUTO_FIT_MAX_VISIBLE_ROWS = 256;
const AUTO_FIT_MAX_TEXT_LENGTH = 4_096;
const AUTO_FIT_MAX_WIDTH = 1_200;
const COLUMN_REORDER_DRAG_THRESHOLD = 6;
const TREE_MOVE_DRAG_THRESHOLD = 6;
const TREE_MOVE_EDGE_RATIO = 0.26;
const DEFAULT_CELL_RENDERER_FRAME_BUDGET_MS = 4;
const MAX_CELL_RENDERER_FRAME_BUDGET_MS = 16;
const DEFAULT_LIVE_REGION_POLITE_MIN_INTERVAL_MS = 400;
const MAX_LIVE_REGION_POLITE_MIN_INTERVAL_MS = 60_000;
const MAX_LIVE_REGION_MESSAGE_LENGTH = 4_096;
const MAX_DIFF_DECORATIONS = 100_000;
const MAX_OVERSCAN = 4_096;
const MAX_DIRTY_RECTS = 64;
const MAX_ROW_HEIGHT = 1_000_000;
const EMPTY_DIFF_KINDS: ReadonlySet<BomCanvasDiffKind> = new Set();
const EMPTY_GHOST_ROWS: readonly Readonly<BomCanvasDiffGhostRow>[] =
  Object.freeze([]);

export { DEFAULT_BOM_CANVAS_LABELS } from './i18n.js';

interface ResolvedRendererLabels extends BomCanvasRendererLabels {
  readonly treegridDescription: string;
}

export const DEFAULT_BOM_CANVAS_THEME: Readonly<BomCanvasTheme> = Object.freeze({
  background: '#ffffff',
  frozenBackground: '#f6f8fb',
  rowAlternateBackground: '#fbfcfe',
  gridLine: '#e0e7ef',
  text: '#1d2a3a',
  activeCell: '#2563eb',
  activeCellFill: 'rgba(37, 99, 235, 0.12)',
  rangeFill: 'rgba(37, 99, 235, 0.075)',
  fillPreviewFill: 'rgba(15, 118, 110, 0.13)',
  fillPreviewBorder: '#0f766e',
  expander: '#5b6b7d',
  diffAddedFill: 'rgba(15, 118, 110, 0.13)',
  diffDeletedFill: 'rgba(194, 65, 59, 0.13)',
  diffChangedFill: 'rgba(180, 110, 13, 0.14)',
  diffMarker: '#9a5e09',
  font: '13px sans-serif',
});

interface ResolvedRendererOptions<TFields extends BomFields> {
  readonly instanceId: string;
  readonly locale: BomEditorLocale;
  readonly direction: BomCanvasTextDirection;
  readonly labelOverrides: Readonly<BomCanvasRendererLabelOverrides>;
  readonly labels: Readonly<ResolvedRendererLabels>;
  readonly theme: Readonly<BomCanvasTheme>;
  readonly liveRegion: Readonly<ResolvedLiveRegionOptions>;
  readonly overscanX: number;
  readonly overscanY: number;
  readonly maxDpr: number;
  readonly maxBackingStoreBytes: number;
  readonly dirtyAreaFullRedrawRatio: number;
  readonly indentWidth: number;
  readonly cellPadding: number;
  readonly headerHeight: number;
  readonly rowHeaderWidth: number;
  readonly formatCellText:
    | ((context: Readonly<BomCanvasCellTextContext<TFields>>) => string | undefined)
    | undefined;
  readonly cellRenderers: ReadonlyMap<
    string,
    Readonly<BomCanvasCellRenderer<TFields>>
  >;
  readonly cellRendererFrameBudgetMs: number;
  readonly onCellRendererHit:
    | ((hit: Readonly<BomCanvasCellRendererHit>) => void)
    | undefined;
  readonly diagnosticSink:
    | ((diagnostic: Readonly<BomCanvasRendererDiagnostic>) => void)
    | undefined;
  readonly frameCommitSink:
    | ((frame: Readonly<BomCanvasFrameCommit>) => void)
    | undefined;
  readonly onShortcut:
    | ((invocation: Readonly<BomShortcutInvocation>) => void)
    | undefined;
  readonly shortcuts: Readonly<BomShortcutRegistryOptions> | undefined;
}

interface ResolvedLiveRegionOptions {
  readonly enabled: boolean;
  readonly politeMinIntervalMs: number;
}

interface CanvasLayerState {
  readonly name: BomCanvasLayer;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

interface RendererLayout {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly bodyTop: number;
  readonly bodyHeight: number;
  readonly rowHeaderLeft: number;
  readonly scrollableStart: number;
  readonly scrollableEnd: number;
  readonly surface: Readonly<BomCanvasSurfaceLayout>;
  readonly dpr: Readonly<BomDprResolution>;
  readonly columnWindow: Readonly<BomCanvasColumnWindow>;
  readonly rows: readonly Readonly<BomCanvasRowLayout>[];
  readonly ghostRows: readonly Readonly<GhostRowLayout>[];
  readonly totalRowCount: number;
  readonly totalHeight: number;
}

interface GhostRowPlacement {
  readonly occurrenceId: OccurrenceId;
  readonly insertionIndex: number;
  readonly depth: number;
  readonly order: number;
  readonly expandedOffset: number;
}

interface GhostBoundary {
  readonly insertionIndex: number;
  readonly baseOffset: number;
  readonly start: number;
  readonly count: number;
}

interface GhostRowProjection {
  readonly rowHeight: number;
  readonly rows: readonly Readonly<GhostRowPlacement>[];
  readonly boundaries: readonly Readonly<GhostBoundary>[];
  readonly totalHeight: number;
  readonly totalRowCount: number;
}

interface GhostRowLayout extends BomCanvasRect {
  readonly occurrenceId: OccurrenceId;
  readonly rowIndex: number;
  readonly documentOffset: number;
  readonly depth: number;
  readonly expandable: false;
  readonly expanded: false;
}

interface SelectionDragSession {
  readonly pointerId: number;
  readonly lastAddress: Readonly<BomCellAddress>;
  readonly additive: boolean;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly moved: boolean;
}

interface FillHandleDragSession {
  readonly pointerId: number;
  readonly mode: FillHandleDragMode;
  readonly lastAddress: Readonly<BomCellAddress>;
  readonly targetColumnId: string;
  readonly sourceBounds: Readonly<FillSelectionBounds>;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly changed: boolean;
}

type FillHandleDragMode = 'copy' | 'series';

interface FillSelectionBounds {
  readonly firstRow: number;
  readonly lastRow: number;
  readonly firstColumn: number;
  readonly lastColumn: number;
}

interface ColumnResizeSession {
  readonly pointerId: number;
  readonly columnId: string;
  readonly startX: number;
  readonly startWidth: number;
  readonly initialScrollLeft: number;
  readonly frozen: boolean;
  readonly targetContentOffset: number;
  readonly lastCommittedWidth: number;
  readonly lastWidth: number;
}

interface ColumnReorderSession {
  readonly pointerId: number;
  readonly columnId: string;
  readonly startX: number;
  readonly startY: number;
  readonly dragClientX: number | null;
  readonly dragClientY: number | null;
  readonly dragOffsetX: number;
  readonly dragOffsetY: number;
  readonly columnWidth: number;
  readonly indicatorX: number | null;
  readonly pendingOrder: readonly string[] | null;
}

interface TreeMoveSession {
  readonly pointerId: number;
  readonly occurrenceId: OccurrenceId;
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly startX: number;
  readonly startY: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly moved: boolean;
  readonly targetOccurrenceId: OccurrenceId | null;
  readonly position: BomTreeDropPosition | null;
}

interface CellRendererMeasurement<TFields extends BomFields> {
  readonly renderer: Readonly<BomCanvasCellRenderer<TFields>>;
  readonly size: Readonly<BomCanvasCellSize> | null;
}

type RtlScrollBehavior =
  | 'unknown'
  | 'negative'
  | 'default'
  | 'reverse'
  | 'logical';

const MOUNTED_RENDERERS = new WeakMap<HTMLElement, object>();
let rendererSequence = 0;

function rendererResourceKinds(
  document: Document,
): readonly Readonly<BomResourceKindDeclaration>[] {
  const runtime = document.defaultView as unknown as {
    readonly ResizeObserver?: unknown;
    readonly MutationObserver?: unknown;
    readonly IntersectionObserver?: unknown;
    readonly Worker?: unknown;
    readonly requestAnimationFrame?: unknown;
    readonly cancelAnimationFrame?: unknown;
    readonly setTimeout?: unknown;
    readonly clearTimeout?: unknown;
    readonly setInterval?: unknown;
    readonly clearInterval?: unknown;
  } | null;
  const declarations: BomResourceKindDeclaration[] = [
    { kind: 'event-listener', tracked: true, supported: true },
    {
      kind: 'resize-observer',
      tracked: true,
      supported: typeof runtime?.ResizeObserver === 'function',
    },
    {
      kind: 'mutation-observer',
      tracked: true,
      supported: typeof runtime?.MutationObserver === 'function',
    },
    {
      kind: 'intersection-observer',
      tracked: true,
      supported: typeof runtime?.IntersectionObserver === 'function',
    },
    {
      kind: 'animation-frame',
      tracked: true,
      supported:
        typeof runtime?.requestAnimationFrame === 'function' &&
        typeof runtime?.cancelAnimationFrame === 'function',
    },
    { kind: 'renderer-root', tracked: true, supported: true },
    { kind: 'renderer-dom-state', tracked: true, supported: true },
    { kind: 'custom-cell-renderer', tracked: true, supported: true },
    { kind: 'canvas', tracked: true, supported: true },
    { kind: 'portal', tracked: true, supported: true },
    {
      kind: 'font-ready',
      tracked: true,
      supported: document.fonts !== undefined,
    },
    {
      kind: 'worker',
      tracked: true,
      supported: typeof runtime?.Worker === 'function',
    },
    {
      kind: 'worker-task',
      tracked: true,
      supported: typeof runtime?.Worker === 'function',
    },
    {
      kind: 'timeout',
      tracked: true,
      supported:
        typeof runtime?.setTimeout === 'function' &&
        typeof runtime?.clearTimeout === 'function',
    },
    {
      kind: 'interval',
      tracked: true,
      supported:
        typeof runtime?.setInterval === 'function' &&
        typeof runtime?.clearInterval === 'function',
    },
  ];
  return Object.freeze(
    declarations.map((declaration) => Object.freeze(declaration)),
  );
}

export function mountBomCanvasRenderer<
  TFields extends BomFields = BomFields,
>(
  container: HTMLElement,
  viewModel: Readonly<BomCanvasViewModel<TFields>>,
  callbacks: Readonly<BomCanvasRendererCallbacks>,
  options: Readonly<BomCanvasRendererOptions<TFields>>,
): BomCanvasRenderer<TFields> {
  if (MOUNTED_RENDERERS.has(container)) {
    throw new Error('BOM_RENDERER_CONTAINER_ALREADY_MOUNTED');
  }
  const renderer = new CanvasBomRenderer(
    container,
    viewModel,
    callbacks,
    resolveOptions(options),
  );
  MOUNTED_RENDERERS.set(container, renderer);
  return renderer;
}

class CanvasBomRenderer<TFields extends BomFields>
  implements BomCanvasRenderer<TFields>
{
  public readonly ready: Promise<boolean>;

  #callbacks: Readonly<BomCanvasRendererCallbacks> | null;
  #options: Readonly<ResolvedRendererOptions<TFields>> | null;
  readonly #shortcuts: BomShortcutRegistry;
  readonly #registry: ResourceRegistry;
  readonly #document: Document;
  readonly #root: HTMLDivElement;
  readonly #scrollHost: HTMLDivElement;
  readonly #spacer: HTMLDivElement;
  readonly #semantics: HTMLDivElement;
  readonly #portal: HTMLInputElement;
  readonly #contextMenu: HTMLDivElement;
  readonly #liveRegions: ReadonlyMap<BomCanvasLivePoliteness, HTMLDivElement>;
  readonly #layers: ReadonlyMap<BomCanvasLayer, CanvasLayerState>;
  readonly #domIdPrefix: string;
  readonly #dirtyRects = new Map<BomCanvasLayer, BomCanvasRect[]>();
  readonly #fullDirty = new Set<BomCanvasLayer>(LAYERS);
  readonly #cellRendererMeasurements = new Map<
    string,
    Map<string, CellRendererMeasurement<TFields>>
  >();
  #container: HTMLElement | null;
  #viewModel: Readonly<BomCanvasViewModel<TFields>> | null;
  #indexedDiffView: Readonly<BomCanvasDiffView> | null = null;
  #diffRows = new Map<string, Set<BomCanvasDiffKind>>();
  #diffCells = new Map<string, Set<BomCanvasDiffKind>>();
  #diffDeletedRows: readonly Readonly<BomCanvasDiffDeletionSummary>[] =
    Object.freeze([]);
  #diffGhostRows: readonly Readonly<BomCanvasDiffGhostRow>[] = EMPTY_GHOST_ROWS;
  #ghostProjection: Readonly<GhostRowProjection> | null = null;
  #layout: Readonly<RendererLayout> | null = null;
  #layoutDirty = true;
  #rtlScrollBehavior: RtlScrollBehavior = 'unknown';
  #destroyed = false;
  #frameRelease: (() => void) | null = null;
  #selectionAutoScrollRelease: (() => void) | null = null;
  #fillHandleAutoScrollRelease: (() => void) | null = null;
  #treeMoveAutoScrollRelease: (() => void) | null = null;
  #livePoliteRelease: (() => void) | null = null;
  #pendingPoliteAnnouncement: string | null = null;
  #lastPoliteAnnouncementAt = Number.NEGATIVE_INFINITY;
  #lastPoliteAnnouncement = '';
  #lastAssertiveAnnouncementAt = Number.NEGATIVE_INFINITY;
  #lastAssertiveAnnouncement = '';
  #composing = false;
  #callbackPending = false;
  #shouldFocusPortal = false;
  #selectionDrag: Readonly<SelectionDragSession> | null = null;
  #fillHandleDrag: Readonly<FillHandleDragSession> | null = null;
  #columnResize: Readonly<ColumnResizeSession> | null = null;
  #columnReorder: Readonly<ColumnReorderSession> | null = null;
  #treeMove: Readonly<TreeMoveSession> | null = null;
  #contextMenuTarget: Readonly<{ kind: 'column' | 'row' | 'cell'; address: BomCellAddress }> | null = null;
  #mountedRowCount = 0;
  #mountedColumnCount = 0;
  #activeDescendantIsProxy = false;
  #frameCommitSequence = 0;
  #cellRendererBudgetRemainingMs = 0;
  #cellRendererBudgetReported = false;
  #readySettled = false;
  #resolveReady: ((rendered: boolean) => void) | null = null;

  public constructor(
    container: HTMLElement,
    viewModel: Readonly<BomCanvasViewModel<TFields>>,
    callbacks: Readonly<BomCanvasRendererCallbacks>,
    options: Readonly<ResolvedRendererOptions<TFields>>,
  ) {
    this.ready = new Promise<boolean>((resolve) => {
      this.#resolveReady = resolve;
    });
    validateViewModel(viewModel);
    this.#container = container;
    this.#viewModel = viewModel;
    this.#callbacks = callbacks;
    this.#options = options;
    this.#shortcuts = new BomShortcutRegistry(options.shortcuts);
    this.#document = container.ownerDocument;
    this.#registry = new ResourceRegistry({
      kinds: rendererResourceKinds(this.#document),
    });
    rendererSequence += 1;
    this.#domIdPrefix = `bom-${encodeIdPart(options.instanceId)}-${rendererSequence}`;

    const root = this.#document.createElement('div');
    root.setAttribute('data-bom-canvas-renderer', options.instanceId);
    root.setAttribute('dir', options.direction);
    setStyles(root, {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      contain: 'strict',
    });
    this.#root = root;

    const politeLiveRegion = createLiveRegion(
      this.#document,
      'polite',
      options.liveRegion.enabled,
    );
    const assertiveLiveRegion = createLiveRegion(
      this.#document,
      'assertive',
      options.liveRegion.enabled,
    );
    this.#liveRegions = new Map([
      ['polite', politeLiveRegion],
      ['assertive', assertiveLiveRegion],
    ]);
    root.appendChild(politeLiveRegion);
    root.appendChild(assertiveLiveRegion);

    const scrollHost = this.#document.createElement('div');
    scrollHost.setAttribute('role', 'treegrid');
    scrollHost.setAttribute('tabindex', '0');
    scrollHost.setAttribute('dir', options.direction);
    scrollHost.setAttribute('aria-label', options.labels.treegridLabel);
    scrollHost.setAttribute('aria-multiselectable', 'true');
    setStyles(scrollHost, {
      position: 'absolute',
      inset: '0',
      overflow: 'auto',
      scrollbarGutter: 'stable',
      overscrollBehavior: 'contain',
      touchAction: 'pan-x pan-y',
      direction: options.direction,
      zIndex: '3',
    });
    this.#scrollHost = scrollHost;

    if (options.labels.treegridDescription !== '') {
      const description = this.#document.createElement('div');
      description.id = `${this.#domIdPrefix}-treegrid-description`;
      description.setAttribute('data-bom-treegrid-description', 'true');
      description.textContent = options.labels.treegridDescription;
      setStyles(description, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      });
      scrollHost.setAttribute('aria-describedby', description.id);
      root.appendChild(description);
    }

    const spacer = this.#document.createElement('div');
    spacer.setAttribute('data-bom-scroll-spacer', 'true');
    spacer.setAttribute('role', 'presentation');
    setStyles(spacer, {
      position: 'relative',
      minWidth: '1px',
      minHeight: '1px',
      pointerEvents: 'none',
    });
    this.#spacer = spacer;

    const semantics = this.#document.createElement('div');
    semantics.setAttribute('data-bom-semantic-window', 'true');
    setStyles(semantics, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    });
    this.#semantics = semantics;
    spacer.appendChild(semantics);
    scrollHost.appendChild(spacer);
    root.appendChild(scrollHost);

    const mutableLayers = new Map<BomCanvasLayer, CanvasLayerState>();
    for (const layerName of LAYERS) {
      const canvas = this.#document.createElement('canvas');
      canvas.setAttribute('data-bom-canvas-layer', layerName);
      canvas.setAttribute('aria-hidden', 'true');
      setStyles(canvas, {
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: String(LAYERS.indexOf(layerName)),
      });
      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error(`BOM_RENDERER_CONTEXT_UNAVAILABLE:${layerName}`);
      }
      const layer = Object.freeze({ name: layerName, canvas, context });
      mutableLayers.set(layerName, layer);
      root.appendChild(canvas);
    }
    this.#layers = mutableLayers;

    const portal = this.#document.createElement('input');
    portal.setAttribute('data-bom-editor-portal', 'true');
    portal.setAttribute('aria-label', options.labels.editorLabel);
    portal.setAttribute('type', 'text');
    portal.hidden = true;
    setStyles(portal, {
      position: 'absolute',
      display: 'none',
      boxSizing: 'border-box',
      zIndex: '4',
      margin: '0',
      padding: '0 6px',
      border: `2px solid ${options.theme.activeCell}`,
      borderRadius: '2px',
      outline: 'none',
      color: options.theme.text,
      background: options.theme.background,
      boxShadow: `inset 0 0 0 1px ${options.theme.activeCellFill}`,
      font: options.theme.font,
    });
    this.#portal = portal;
    root.appendChild(portal);

    const contextMenu = this.#document.createElement('div');
    contextMenu.setAttribute('data-bom-context-menu', 'true');
    contextMenu.setAttribute('role', 'menu');
    contextMenu.hidden = true;
    setStyles(contextMenu, {
      position: 'absolute', zIndex: '6', minWidth: '188px', padding: '6px',
      background: options.theme.background, border: `1px solid ${options.theme.gridLine}`,
      color: options.theme.text, boxShadow: '0 12px 24px rgba(25, 41, 61, .16)',
      borderRadius: '6px',
    });
    this.#contextMenu = contextMenu;
    root.appendChild(contextMenu);
    container.appendChild(root);

    this.#registry.register((): void => {
      if (root.parentNode !== null) {
        root.remove();
      }
    }, 'renderer-root');
    this.#registry.register((): void => {
      semantics.replaceChildren();
    }, 'renderer-dom-state');
    this.#registry.register((): void => {
      spacer.replaceChildren();
    }, 'renderer-dom-state');
    this.#registry.register((): void => {
      root.replaceChildren();
    }, 'renderer-dom-state');
    for (const layer of mutableLayers.values()) {
      this.#registry.register((): void => {
        clearCanvasBackingStore(layer.canvas);
      }, 'canvas');
    }
    this.#registry.register((): void => {
      portal.value = '';
      portal.hidden = true;
    }, 'portal');
    try {
      this.#registerCustomCellRendererResources();
      this.#registerResources();
      this.#shouldFocusPortal = draftAddress(viewModel.editState) !== null;
      this.#scheduleRender();
    } catch (cause) {
      this.#registry.dispose();
      throw cause;
    }
  }

  public get destroyed(): boolean {
    return this.#destroyed;
  }

  public update(
    viewModel: Readonly<BomCanvasViewModel<TFields>>,
    invalidation: Readonly<BomCanvasInvalidation> = {},
  ): void {
    this.#assertAlive();
    validateViewModel(viewModel);
    const previous = this.#requiredViewModel();
    const previousDraft = draftAddress(previous.editState);
    const nextDraft = draftAddress(viewModel.editState);
    const layoutChanged =
      invalidation.layoutChanged === true ||
      previous.projection !== viewModel.projection ||
      !sameColumnGeometry(previous.columns, viewModel.columns);
    const diffChanged = previous.diffView !== viewModel.diffView;
    this.#viewModel = viewModel;
    this.#callbackPending = false;
    this.#composing = viewModel.editState.status === 'composing';
    this.#shouldFocusPortal =
      nextDraft !== null &&
      (previousDraft === null || !sameAddress(previousDraft, nextDraft));
    this.#announceEditRejection(previous.editState, viewModel.editState);

    if (layoutChanged) {
      this.#layoutDirty = true;
      this.#markAllLayersFull();
    } else {
      if (!sameSelection(previous.selection, viewModel.selection)) {
        // A range can cover non-contiguous screen regions across frozen columns.
        // Redraw the bounded interaction surface instead of risking stale fill.
        this.#fullDirty.add('interaction');
      }
      const layers = invalidation.layers ?? ['content', 'interaction'];
      if (invalidation.dirtyCells !== undefined) {
        for (const address of invalidation.dirtyCells) {
          this.invalidateCell(address, layers);
        }
      } else if (previous.revision !== viewModel.revision) {
        this.#fullDirty.add('content');
      }
      if (diffChanged) {
        // Ghost rows change the scroll surface and visible row positions;
        // rebuild geometry before drawing the new Diff overlay.
        this.#layoutDirty = true;
        this.#fullDirty.add('content');
        this.#fullDirty.add('interaction');
      }
    }
    this.#scheduleRender();
  }

  public invalidateCell(
    address: Readonly<BomCellAddress>,
    layers: readonly BomCanvasLayer[] = ['content', 'interaction'],
  ): void {
    this.#assertAlive();
    const rect = this.#cellRect(address);
    if (rect === null) {
      return;
    }
    for (const layer of layers) {
      if (!isCanvasLayer(layer)) {
        throw new RangeError('BOM_RENDERER_INVALID_LAYER');
      }
      const rects = this.#dirtyRects.get(layer) ?? [];
      rects.push(rect);
      this.#dirtyRects.set(layer, rects);
    }
    this.#scheduleRender();
  }

  public scrollToCell(address: Readonly<BomCellAddress>): boolean {
    this.#assertAlive();
    const viewModel = this.#requiredViewModel();
    if (!viewModel.indexes.rowById.has(address.occurrenceId)) {
      return false;
    }
    const columnIndex = viewModel.columns.findIndex(
      (column) => column.columnId === address.columnId,
    );
    if (columnIndex < 0 || viewModel.columns[columnIndex]?.visible === false) {
      return false;
    }
    const offsetResult = viewModel.projection.offsetOf(address.occurrenceId);
    const heightResult = viewModel.projection.rowHeightOf(address.occurrenceId);
    if (!offsetResult.ok || !heightResult.ok || offsetResult.value === undefined) {
      return false;
    }
    const visibleIndex = viewModel.projection.indexOf(address.occurrenceId);
    const ghostProjection = this.#getGhostProjection();
    const ghostShift = visibleIndex.ok && visibleIndex.value !== undefined &&
      ghostProjection !== null
      ? this.#ghostCountBefore(visibleIndex.value, ghostProjection) *
        ghostProjection.rowHeight
      : 0;
    const viewportWidth = this.#measureWidth();
    const bodyHeight = Math.max(
      0,
      this.#measureHeight() - this.#requiredOptions().headerHeight,
    );
    let nextTop = this.#scrollHost.scrollTop;
    const rowStart = offsetResult.value + ghostShift;
    const rowEnd = rowStart + heightResult.value;
    if (rowStart < nextTop) {
      nextTop = rowStart;
    } else if (rowEnd > nextTop + bodyHeight) {
      nextTop = rowEnd - bodyHeight;
    }
    nextTop = Math.min(
      Math.max(
        0,
        (ghostProjection?.totalHeight ?? viewModel.projection.totalHeight) -
          bodyHeight,
      ),
      Math.max(0, nextTop),
    );

    const columnPosition = fullColumnPosition(
      viewModel.columns,
      columnIndex,
      this.#requiredOptions().rowHeaderWidth,
    );
    const maximumLeft = Math.max(
      0,
      columnPosition.totalWidth - viewportWidth,
    );
    let nextLeft = this.#logicalScrollLeft(maximumLeft);
    if (!columnPosition.frozen) {
      const rtl = this.#requiredOptions().direction === 'rtl';
      const visibleStart = rtl
        ? columnPosition.trailingFrozenWidth
        : columnPosition.frozenWidth;
      const visibleEnd = Math.max(
        visibleStart,
        rtl
          ? viewportWidth - columnPosition.frozenWidth
          : viewportWidth - columnPosition.trailingFrozenWidth,
      );
      const scrollableOffset =
        columnPosition.contentStart - columnPosition.frozenWidth;
      const screenStart = rtl
        ? viewportWidth - columnPosition.frozenWidth - scrollableOffset +
          nextLeft - columnPosition.width
        : columnPosition.contentStart - nextLeft;
      const screenEnd = screenStart + columnPosition.width;
      if (screenStart < visibleStart) {
        nextLeft += rtl
          ? visibleStart - screenStart
          : screenStart - visibleStart;
      } else if (screenEnd > visibleEnd) {
        nextLeft += rtl
          ? visibleEnd - screenEnd
          : screenEnd - visibleEnd;
      }
      nextLeft = Math.min(maximumLeft, Math.max(0, nextLeft));
    }

    const changed =
      nextTop !== this.#scrollHost.scrollTop ||
      nextLeft !== this.#logicalScrollLeft(maximumLeft);
    if (changed) {
      this.#scrollHost.scrollTop = Math.max(0, nextTop);
      this.#setLogicalScrollLeft(nextLeft, maximumLeft);
      this.#viewChanged('api');
    }
    return true;
  }

  public scrollToView(
    view: Readonly<Pick<BomViewState, 'scrollLeft' | 'scrollTop'>>,
  ): boolean {
    this.#assertAlive();
    if (
      view === null ||
      typeof view !== 'object' ||
      !Number.isFinite(view.scrollLeft) ||
      !Number.isFinite(view.scrollTop)
    ) {
      return false;
    }
    const layout = this.#layout;
    if (layout === null) {
      return false;
    }
    const ghostProjection = this.#getGhostProjection();
    const totalHeight = ghostProjection?.totalHeight ??
      this.#requiredViewModel().projection.totalHeight;
    const nextTop = Math.min(
      Math.max(0, totalHeight - layout.bodyHeight),
      Math.max(0, view.scrollTop),
    );
    const nextLeft = Math.min(
      Math.max(0, layout.columnWindow.totalWidth - layout.viewportWidth),
      Math.max(0, view.scrollLeft),
    );
    const maximumLeft = Math.max(
      0,
      layout.columnWindow.totalWidth - layout.viewportWidth,
    );
    const changed =
      nextTop !== this.#scrollHost.scrollTop ||
      nextLeft !== this.#logicalScrollLeft(maximumLeft);
    if (changed) {
      this.#scrollHost.scrollTop = nextTop;
      this.#setLogicalScrollLeft(nextLeft, maximumLeft);
      this.#viewChanged('api');
    }
    return true;
  }

  public announce(
    announcement: Readonly<BomCanvasLiveAnnouncement>,
  ): BomCanvasLiveAnnouncementResult {
    if (this.#destroyed) {
      return Object.freeze({ ok: false, reason: 'destroyed' as const });
    }
    const normalized = normalizeLiveAnnouncement(announcement);
    if (normalized === null) {
      return Object.freeze({
        ok: false,
        reason: 'invalid-announcement' as const,
      });
    }
    const options = this.#requiredOptions().liveRegion;
    if (!options.enabled) {
      return Object.freeze({ ok: false, reason: 'disabled' as const });
    }
    if (normalized.politeness === 'assertive') {
      return this.#announceAssertive(normalized.message, options);
    }
    return this.#announcePolite(normalized.message, options);
  }

  public focus(): void {
    this.#assertAlive();
    this.#scrollHost.focus({ preventScroll: true });
  }

  public getDiagnostics(): Readonly<BomCanvasRendererDiagnostics> {
    const layout = this.#layout;
    const resources = this.#registry.getDiagnostics();
    const workerTaskResource = resources.kinds.find(
      (entry) => entry.kind === 'worker-task',
    );
    return Object.freeze({
      destroyed: this.#destroyed,
      ...(this.#viewModel === null
        ? {}
        : { revision: this.#viewModel.revision }),
      viewportWidth: layout?.viewportWidth ?? 0,
      viewportHeight: layout?.viewportHeight ?? 0,
      canvasCssWidth: layout?.surface.width ?? 0,
      canvasCssHeight: layout?.surface.height ?? 0,
      backingWidth: layout?.dpr.backingWidth ?? 0,
      backingHeight: layout?.dpr.backingHeight ?? 0,
      effectiveDpr: layout?.dpr.effectiveDpr ?? 1,
      backingStoreBytes: layout?.dpr.estimatedBytes ?? 0,
      mountedRowCount: this.#mountedRowCount,
      mountedColumnCount: this.#mountedColumnCount,
      activeDescendantIsProxy: this.#activeDescendantIsProxy,
      registeredResourceCount: this.#registry.size,
      resources,
      workerTasks: Object.freeze({
        protocol: BOM_CANVAS_WORKER_TASK_LEDGER_PROTOCOL,
        kind: 'worker-task',
        tracked: true,
        supported: workerTaskResource?.supported === true,
        queuedCount: 0,
        runningCount: 0,
        cleanupFailureCount: workerTaskResource?.cleanupFailureCount ?? 1,
      }),
    });
  }

  public destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    const container = this.#container;
    this.#livePoliteRelease?.();
    this.#livePoliteRelease = null;
    this.#pendingPoliteAnnouncement = null;
    this.#registry.dispose();
    if (
      container !== null &&
      MOUNTED_RENDERERS.get(container) === this
    ) {
      MOUNTED_RENDERERS.delete(container);
    }
    this.#container = null;
    this.#viewModel = null;
    this.#indexedDiffView = null;
    this.#diffRows.clear();
    this.#diffCells.clear();
    this.#diffDeletedRows = Object.freeze([]);
    this.#diffGhostRows = EMPTY_GHOST_ROWS;
    this.#ghostProjection = null;
    this.#layout = null;
    this.#callbacks = null;
    this.#options = null;
    this.#dirtyRects.clear();
    this.#fullDirty.clear();
    this.#cellRendererMeasurements.clear();
    this.#frameRelease = null;
    this.#selectionAutoScrollRelease = null;
    this.#fillHandleAutoScrollRelease = null;
    this.#treeMoveAutoScrollRelease = null;
    this.#selectionDrag = null;
    this.#fillHandleDrag = null;
    this.#columnResize = null;
    this.#columnReorder = null;
    this.#treeMove = null;
    this.#mountedRowCount = 0;
    this.#mountedColumnCount = 0;
    this.#activeDescendantIsProxy = false;
    this.#settleReady(false);
  }

  public configureShortcuts(
    options: Readonly<BomShortcutRegistryOptions>,
  ): BomShortcutConfigurationResult {
    if (this.#destroyed) {
      return Object.freeze({
        ok: false,
        diagnostics: Object.freeze([
          { code: 'destroyed' as const, severity: 'error' as const },
        ]),
      });
    }
    return this.#shortcuts.configure(options);
  }

  public resetShortcuts(): BomShortcutConfigurationResult {
    if (this.#destroyed) {
      return Object.freeze({
        ok: false,
        diagnostics: Object.freeze([
          { code: 'destroyed' as const, severity: 'error' as const },
        ]),
      });
    }
    return this.#shortcuts.reset();
  }

  public configurePresentation(
    options: Readonly<BomCanvasPresentationOptions>,
  ): BomCanvasPresentationConfigurationResult {
    if (this.#destroyed) {
      return presentationFailure('destroyed');
    }
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      return presentationFailure('invalid-options');
    }
    const current = this.#requiredOptions();
    const locale = options.locale === undefined
      ? current.locale
      : normalizeRendererLocale(options.locale);
    if (locale === null) return presentationFailure('invalid-locale');
    const direction = options.direction === undefined
      ? current.direction
      : options.direction;
    if (direction !== 'ltr' && direction !== 'rtl') {
      return presentationFailure('invalid-direction');
    }
    const labelOverrides = mergeRendererLabelOverrides(
      current.labelOverrides,
      options.labels,
    );
    if (labelOverrides === null) return presentationFailure('invalid-labels');
    const labels = resolveRendererLabels(locale, labelOverrides);
    const theme = mergeRendererTheme(current.theme, options.theme);
    if (theme === null) return presentationFailure('invalid-theme');
    const next = Object.freeze({
      ...current,
      locale,
      direction,
      labelOverrides,
      labels,
      theme,
    });
    const previousLayout = this.#layout;
    const previousMaximumLeft = previousLayout === null
      ? 0
      : Math.max(
        0,
        previousLayout.columnWindow.totalWidth - previousLayout.viewportWidth,
      );
    const preservedScrollLeft = this.#logicalScrollLeft(previousMaximumLeft);
    const directionChanged = direction !== current.direction;
    this.#options = next;
    this.#root.setAttribute('dir', direction);
    this.#scrollHost.setAttribute('dir', direction);
    this.#scrollHost.style.direction = direction;
    if (directionChanged) {
      this.#rtlScrollBehavior = 'unknown';
      this.#setLogicalScrollLeft(preservedScrollLeft, previousMaximumLeft);
    }
    this.#scrollHost.setAttribute('aria-label', labels.treegridLabel);
    this.#portal.setAttribute('aria-label', labels.editorLabel);
    const description = this.#root.querySelector<HTMLElement>(
      '[data-bom-treegrid-description="true"]',
    );
    if (description !== null) {
      description.textContent = labels.treegridDescription ?? '';
      if ((labels.treegridDescription ?? '') === '') {
        description.remove();
        this.#scrollHost.removeAttribute('aria-describedby');
      } else {
        this.#scrollHost.setAttribute('aria-describedby', description.id);
      }
    } else if (labels.treegridDescription !== '') {
      const nextDescription = this.#document.createElement('div');
      nextDescription.id = `${this.#domIdPrefix}-treegrid-description`;
      nextDescription.setAttribute('data-bom-treegrid-description', 'true');
      nextDescription.textContent = labels.treegridDescription;
      setStyles(nextDescription, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      });
      this.#scrollHost.setAttribute('aria-describedby', nextDescription.id);
      // The description is visually hidden, so append order does not affect
      // layout and remains compatible with minimal host DOM implementations.
      this.#root.appendChild(nextDescription);
    }
    setStyles(this.#contextMenu, {
      background: theme.background,
      borderColor: theme.gridLine,
      color: theme.text,
    });
    setStyles(this.#portal, {
      color: theme.text,
      background: theme.background,
      borderColor: theme.activeCell,
      boxShadow: `inset 0 0 0 1px ${theme.activeCellFill}`,
      font: theme.font,
    });
    this.#layoutDirty = true;
    this.#markAllLayersFull();
    this.#scheduleRender();
    return Object.freeze({
      ok: true,
      state: presentationState(next),
      diagnostics: Object.freeze([]),
    });
  }

  public getPresentation(): Readonly<BomCanvasPresentationState> {
    return presentationState(this.#requiredOptions());
  }

  #announceEditRejection(
    previous: Readonly<BomEditState>,
    next: Readonly<BomEditState>,
  ): void {
    if (previous.status === 'rejected' && next.status !== 'rejected') {
      this.#lastAssertiveAnnouncement = '';
      this.#lastAssertiveAnnouncementAt = Number.NEGATIVE_INFINITY;
      this.#clearLiveRegion('assertive');
      return;
    }
    if (previous.status === 'rejected' || next.status !== 'rejected') return;
    this.#announceBuiltInLiveLabel(
      next.phase === 'validation'
        ? 'validationRejected'
        : 'commitRejected',
      'assertive',
    );
  }

  #announceBuiltInLiveLabel(
    label: keyof BomCanvasLiveRegionLabels,
    politeness: BomCanvasLivePoliteness,
  ): void {
    const options = this.#requiredOptions();
    if (!options.liveRegion.enabled) return;
    const message = options.labels.liveRegion?.[label];
    if (message === undefined || message.trim().length === 0) return;
    if (politeness === 'assertive') {
      this.#announceAssertive(message, options.liveRegion);
      return;
    }
    this.#announcePolite(message, options.liveRegion);
  }

  #announceColumnReorderTarget(position: number): void {
    const options = this.#requiredOptions();
    if (!options.liveRegion.enabled) return;
    const template = options.labels.liveRegion?.columnReorderTarget;
    if (template === undefined || template.trim().length === 0) return;
    const message = template.replaceAll('{position}', String(position));
    if (message.trim().length === 0) return;
    this.#announcePolite(message, options.liveRegion);
  }

  #announceTreeMoveTarget(position: BomTreeDropPosition): void {
    const options = this.#requiredOptions();
    if (!options.liveRegion.enabled) return;
    const message = this.#treeMoveTargetMessage(position);
    if (message === null) return;
    this.#announcePolite(message, options.liveRegion);
  }

  #treeMoveTargetMessage(position: BomTreeDropPosition): string | null {
    const options = this.#requiredOptions();
    const template = options.labels.liveRegion?.treeMoveTarget;
    if (template === undefined || template.trim().length === 0) return null;
    const message = template.replaceAll(
      '{position}',
      bomCanvasTreeDropPositionLabel(options.locale, position),
    );
    return message.trim().length === 0 ? null : message;
  }

  #announcePolite(
    message: string,
    options: Readonly<ResolvedLiveRegionOptions>,
  ): BomCanvasLiveAnnouncementResult {
    const now = Date.now();
    if (
      message === this.#lastPoliteAnnouncement &&
      now - this.#lastPoliteAnnouncementAt < options.politeMinIntervalMs
    ) {
      return Object.freeze({ ok: true, delivery: 'deduplicated' as const });
    }
    if (message === this.#pendingPoliteAnnouncement) {
      return Object.freeze({ ok: true, delivery: 'deduplicated' as const });
    }
    const elapsed = now - this.#lastPoliteAnnouncementAt;
    const remaining = options.politeMinIntervalMs - elapsed;
    if (remaining <= 0) {
      this.#deliverPoliteAnnouncement(message);
      return Object.freeze({ ok: true, delivery: 'immediate' as const });
    }
    this.#pendingPoliteAnnouncement = message;
    this.#schedulePoliteAnnouncement(remaining);
    return Object.freeze({ ok: true, delivery: 'queued' as const });
  }

  #announceAssertive(
    message: string,
    options: Readonly<ResolvedLiveRegionOptions>,
  ): BomCanvasLiveAnnouncementResult {
    const now = Date.now();
    if (
      message === this.#lastAssertiveAnnouncement &&
      now - this.#lastAssertiveAnnouncementAt < options.politeMinIntervalMs
    ) {
      return Object.freeze({ ok: true, delivery: 'deduplicated' as const });
    }
    this.#lastAssertiveAnnouncement = message;
    this.#lastAssertiveAnnouncementAt = now;
    this.#writeLiveRegion('assertive', message);
    return Object.freeze({ ok: true, delivery: 'immediate' as const });
  }

  #schedulePoliteAnnouncement(delayMs: number): void {
    if (this.#livePoliteRelease !== null) return;
    const timerHost = rendererTimerHost(this.#document);
    if (timerHost === null) {
      queueMicrotask((): void => {
        if (!this.#destroyed) this.#flushPendingPoliteAnnouncement();
      });
      return;
    }
    let unregister: (() => void) | null = null;
    const handle = timerHost.setTimeout((): void => {
      const release = this.#livePoliteRelease;
      this.#livePoliteRelease = null;
      release?.();
      this.#flushPendingPoliteAnnouncement();
    }, Math.max(0, Math.ceil(delayMs)));
    unregister = this.#registry.trackTimeout(handle, (timeout): void => {
      timerHost.clearTimeout(timeout);
    });
    this.#livePoliteRelease = (): void => {
      const release = unregister;
      unregister = null;
      release?.();
    };
  }

  #flushPendingPoliteAnnouncement(): void {
    const message = this.#pendingPoliteAnnouncement;
    this.#pendingPoliteAnnouncement = null;
    if (message !== null) this.#deliverPoliteAnnouncement(message);
  }

  #deliverPoliteAnnouncement(message: string): void {
    this.#lastPoliteAnnouncement = message;
    this.#lastPoliteAnnouncementAt = Date.now();
    this.#writeLiveRegion('polite', message);
  }

  #writeLiveRegion(
    politeness: BomCanvasLivePoliteness,
    message: string,
  ): void {
    const region = this.#liveRegions.get(politeness);
    if (region === undefined) return;
    const content = this.#document.createElement('span');
    content.setAttribute('data-bom-live-region-message', politeness);
    content.textContent = message;
    // Replacing the child causes repeated identical status text to be exposed
    // as a new live-region mutation without rendering it in the grid itself.
    region.replaceChildren(content);
  }

  #clearLiveRegion(politeness: BomCanvasLivePoliteness): void {
    this.#liveRegions.get(politeness)?.replaceChildren();
  }

  #registerCustomCellRendererResources(): void {
    const disposed = new Set<Readonly<BomCanvasCellRenderer<TFields>>>();
    for (const [columnId, renderer] of this.#requiredOptions().cellRenderers) {
      if (renderer.dispose === undefined || disposed.has(renderer)) {
        continue;
      }
      disposed.add(renderer);
      this.#registry.register((): void => {
        try {
          renderer.dispose!.call(renderer);
        } catch (cause) {
          this.#report({
            code: 'BOM_RENDERER_CELL_RENDERER_FAILED',
            phase: 'dispose',
            columnId,
            cause,
          });
          throw cause;
        }
      }, 'custom-cell-renderer');
    }
  }

  #registerResources(): void {
    this.#registry.trackEvent(this.#scrollHost, 'scroll', this.#onScroll);
    this.#registry.trackEvent(this.#scrollHost, 'contextmenu', this.#onContextMenu);
    this.#registry.trackEvent(
      this.#scrollHost,
      'pointerdown',
      this.#onPointerDown,
    );
    this.#registry.trackEvent(
      this.#scrollHost,
      'pointermove',
      this.#onPointerMove,
    );
    this.#registry.trackEvent(
      this.#scrollHost,
      'pointerleave',
      this.#onPointerLeave,
    );
    this.#registry.trackEvent(this.#scrollHost, 'pointerup', this.#onPointerUp);
    this.#registry.trackEvent(
      this.#scrollHost,
      'pointercancel',
      this.#onPointerCancel,
    );
    this.#registry.trackEvent(
      this.#scrollHost,
      'lostpointercapture',
      this.#onLostPointerCapture,
    );
    this.#registry.trackEvent(
      this.#scrollHost,
      'dblclick',
      this.#onDoubleClick,
    );
    this.#registry.trackEvent(this.#scrollHost, 'keydown', this.#onGridKeyDown);
    this.#registry.trackEvent(this.#scrollHost, 'copy', this.#onCopy);
    this.#registry.trackEvent(this.#scrollHost, 'cut', this.#onCut);
    this.#registry.trackEvent(this.#scrollHost, 'paste', this.#onPaste);
    this.#registry.trackEvent(this.#portal, 'input', this.#onPortalInput);
    this.#registry.trackEvent(this.#portal, 'keydown', this.#onPortalKeyDown);
    this.#registry.trackEvent(this.#portal, 'copy', this.#onPortalCopy);
    this.#registry.trackEvent(this.#portal, 'cut', this.#onPortalCut);
    this.#registry.trackEvent(this.#portal, 'blur', this.#onPortalBlur);
    this.#registry.trackEvent(
      this.#portal,
      'compositionstart',
      this.#onCompositionStart,
    );
    this.#registry.trackEvent(
      this.#portal,
      'compositionend',
      this.#onCompositionEnd,
    );

    for (const layer of this.#layers.values()) {
      this.#registry.trackEvent(
        layer.canvas,
        'contextlost',
        (event: Event): void => {
          event.preventDefault();
          this.#fullDirty.add(layer.name);
          this.#report({
            code: 'BOM_RENDERER_CONTEXT_LOST',
            layer: layer.name,
          });
        },
      );
      this.#registry.trackEvent(
        layer.canvas,
        'contextrestored',
        (): void => {
          this.#layoutDirty = true;
          this.#fullDirty.add(layer.name);
          this.#scheduleRender();
        },
      );
    }

    const view = this.#document.defaultView;
    if (view !== null) {
      this.#registry.trackEvent(view, 'resize', this.#onWindowResize);
      const ResizeObserverConstructor = view.ResizeObserver;
      if (typeof ResizeObserverConstructor === 'function') {
        const observer = new ResizeObserverConstructor((): void => {
          this.#viewChanged('resize');
        });
        this.#registry.register((): void => {
          observer.disconnect();
        }, 'resize-observer');
        const container = this.#container;
        if (container !== null) {
          observer.observe(container);
        }
      }
    }

    const fontSet = this.#document.fonts;
    if (fontSet !== undefined) {
      const continuation: {
        renderer: CanvasBomRenderer<TFields> | null;
      } = { renderer: this };
      this.#registry.register((): void => {
        continuation.renderer = null;
      }, 'font-ready');
      void fontSet.ready.then(
        (): void => {
          const renderer = continuation.renderer;
          if (renderer !== null && !renderer.#destroyed) {
            renderer.#markAllLayersFull();
            renderer.#scheduleRender();
          }
        },
        (): void => {
          // Font failure keeps the browser fallback font and current layout.
        },
      );
    }
  }

  readonly #onScroll = (): void => {
    if (!this.#destroyed) {
      this.#closeContextMenu();
      this.#viewChanged('scroll');
    }
  };

  readonly #onWindowResize = (): void => {
    if (!this.#destroyed) {
      this.#viewChanged('resize');
    }
  };

  readonly #onContextMenu = (event: Event): void => {
    if (this.#destroyed) return;
    const mouse = event as MouseEvent;
    const hit = this.#hitFromClient(mouse.clientX, mouse.clientY);
    if (
      hit === null ||
      (hit.target !== 'column-header' &&
        hit.target !== 'row-header' &&
        hit.target !== 'cell')
    ) return;
    mouse.preventDefault();
    const kind = hit.target === 'column-header'
      ? 'column'
      : hit.target === 'row-header'
        ? 'row'
        : 'cell';
    this.#contextMenuTarget = Object.freeze({ kind, address: hit.address });
    this.#invoke('select', () => this.#requiredCallbacks().select(
      hit.address,
      'pointer',
      {
        extend: false,
        ...(kind === 'column' ? { mode: 'column' as const } : {}),
      },
    ));
    this.#showContextMenu(kind, hit.address, mouse.clientX, mouse.clientY);
  };

  #closeContextMenu(): void {
    this.#contextMenuTarget = null;
    this.#contextMenu.hidden = true;
    this.#contextMenu.replaceChildren();
  }

  #showContextMenu(kind: 'column' | 'row' | 'cell', address: Readonly<BomCellAddress>, clientX: number, clientY: number): void {
    const labels = this.#requiredOptions().labels.contextMenu ?? {};
    const targetNode = this.#viewModel?.indexes.rowById.get(address.occurrenceId);
    const targetColumn = this.#viewModel?.columns.find((column) => column.columnId === address.columnId);
    const filterValue = targetNode === undefined || targetColumn === undefined
      ? undefined
      : readFieldValue(targetNode.fields, targetColumn.fieldPath);
    const entries: readonly (readonly [string, () => void])[] = kind === 'column'
      ? [
          ['insert-before', () => this.#requiredCallbacks().insertColumn?.(address.columnId, 'before', 1, 'pointer')],
          ['insert-after', () => this.#requiredCallbacks().insertColumn?.(address.columnId, 'after', 1, 'pointer')],
          ['delete', () => this.#requiredCallbacks().deleteColumns?.([address.columnId], 'pointer')],
          ['hide', () => this.#requiredCallbacks().setColumnVisibility?.([address.columnId], false, 'pointer')],
          ['freeze-start', () => this.#requiredCallbacks().setColumnFrozen?.(address.columnId, 'start', 'pointer')],
          ['freeze-end', () => this.#requiredCallbacks().setColumnFrozen?.(address.columnId, 'end', 'pointer')],
          ['unfreeze', () => this.#requiredCallbacks().setColumnFrozen?.(address.columnId, false, 'pointer')],
          ['sort-asc', () => this.#requiredCallbacks().sortColumn?.(address.columnId, 'asc')],
          ['sort-desc', () => this.#requiredCallbacks().sortColumn?.(address.columnId, 'desc')],
          ['filter-current', () => filterValue === undefined ? undefined : this.#requiredCallbacks().filterColumnValue?.(address.columnId, filterValue)],
          ['clear-sort-filter', () => this.#requiredCallbacks().clearViewQuery?.()],
          ['clear-format', () => this.#requiredCallbacks().clearColumnFormat?.(address.columnId)],
          ['auto-size', () => this.#autoSizeColumnById(address.columnId)],
          ['reset-width', () => this.#resetColumnWidthFromContext(address.columnId)],
          ['copy', () => this.#copyFromContextMenu()],
          ['clear-content', () => this.#clearContextSelection(kind, address)],
        ]
      : kind === 'row'
        ? [
          ['insert-sibling', () => this.#requiredCallbacks().insertSelection?.('sibling')],
          ['insert-child', () => this.#requiredCallbacks().insertSelection?.('child')],
          ['delete', () => this.#requiredCallbacks().deleteSubtree?.()],
          ['move-up', () => this.#requiredCallbacks().moveSelection?.('up')],
          ['move-down', () => this.#requiredCallbacks().moveSelection?.('down')],
          ['indent', () => this.#requiredCallbacks().moveSelection?.('indent')],
          ['outdent', () => this.#requiredCallbacks().moveSelection?.('outdent')],
          ['expand-all', () => this.#requiredCallbacks().setExpansionAll?.(true)],
          ['collapse-all', () => this.#requiredCallbacks().setExpansionAll?.(false)],
          ['set-row-height', () => this.#requestRowHeight(address.occurrenceId)],
          ['auto-row-height', () => this.#requestRowHeight(address.occurrenceId, true)],
          ['reset-row-height', () => this.#requestRowHeight(address.occurrenceId, false, true)],
          ['clear-content', () => this.#clearContextSelection(kind, address)],
        ]
        : [
          ['copy', () => this.#copyFromContextMenu()],
          ['paste', () => this.#pasteFromContextMenu()],
          ['clear-content', () => this.#clearContextSelection(kind, address)],
        ];
    this.#contextMenu.replaceChildren();
    for (const [key, command] of entries) {
      const callbackName = kind === 'column' && key === 'insert-before' ? 'insertColumn' : undefined;
      if (callbackName !== undefined && typeof this.#callbacks?.insertColumn !== 'function') continue;
      if (kind === 'column' && key === 'insert-after' && typeof this.#callbacks?.insertColumn !== 'function') continue;
      if (kind === 'column' && key === 'delete' && typeof this.#callbacks?.deleteColumns !== 'function') continue;
      if (kind === 'column' && key === 'hide' && typeof this.#callbacks?.setColumnVisibility !== 'function') continue;
      if (kind === 'column' && (key.startsWith('freeze') || key === 'unfreeze') && typeof this.#callbacks?.setColumnFrozen !== 'function') continue;
      if (kind === 'column' && ['sort-asc', 'sort-desc'].includes(key) && typeof this.#callbacks?.sortColumn !== 'function') continue;
      if (kind === 'column' && key === 'filter-current' && (typeof this.#callbacks?.filterColumnValue !== 'function' || filterValue === undefined)) continue;
      if (kind === 'column' && key === 'clear-sort-filter' && typeof this.#callbacks?.clearViewQuery !== 'function') continue;
      if (kind === 'column' && key === 'clear-format' && typeof this.#callbacks?.clearColumnFormat !== 'function') continue;
      if (kind === 'column' && key === 'auto-size' && typeof this.#callbacks?.resizeColumn !== 'function') continue;
      if (kind === 'column' && key === 'reset-width' && typeof this.#callbacks?.resetColumnWidth !== 'function') continue;
      if (kind === 'column' && key === 'copy' && (typeof this.#callbacks?.copy !== 'function' || this.#clipboardWriter() === null)) continue;
      if (kind === 'cell' && key === 'copy' && (typeof this.#callbacks?.copy !== 'function' || this.#clipboardWriter() === null)) continue;
      if (kind === 'cell' && key === 'paste' && !this.#canReadClipboard()) continue;
      if (key === 'clear-content' && typeof this.#callbacks?.clearSelection !== 'function') continue;
      if (kind === 'row' && ['insert-sibling', 'insert-child'].includes(key) && typeof this.#callbacks?.insertSelection !== 'function') continue;
      if (kind === 'row' && key === 'delete' && typeof this.#callbacks?.deleteSubtree !== 'function') continue;
      if (kind === 'row' && ['move-up', 'move-down', 'indent', 'outdent'].includes(key) && typeof this.#callbacks?.moveSelection !== 'function') continue;
      if (kind === 'row' && ['expand-all', 'collapse-all'].includes(key) && typeof this.#callbacks?.setExpansionAll !== 'function') continue;
      if (kind === 'row' && ['set-row-height', 'auto-row-height', 'reset-row-height'].includes(key) && typeof this.#callbacks?.setRowHeight !== 'function') continue;
      const button = this.#document.createElement('button');
      button.setAttribute('type', 'button');
      button.setAttribute('role', 'menuitem');
      button.setAttribute('data-bom-context-command', key);
      button.textContent = labels[`${kind}.${key}`] ?? '';
      setStyles(button, {
        display: 'block', width: '100%', minHeight: '30px', padding: '6px 8px',
        border: '0', borderRadius: '4px', color: this.#requiredOptions().theme.text,
        background: 'transparent', textAlign: 'left', font: '12px sans-serif', cursor: 'pointer',
      });
      this.#registry.trackEvent(button, 'click', () => {
        this.#closeContextMenu();
        const callback: keyof BomCanvasRendererCallbacks = key === 'clear-content'
          ? 'clearSelection'
          : key === 'paste'
            ? 'paste'
            : kind === 'column'
              ? key === 'reset-width' ? 'resetColumnWidth' : 'insertColumn'
              : key === 'set-row-height' || key === 'auto-row-height' || key === 'reset-row-height'
                ? 'setRowHeight'
                : 'deleteSubtree';
        this.#invoke(callback, command);
      });
      this.#contextMenu.appendChild(button);
    }
    const rootBounds = this.#root.getBoundingClientRect();
    this.#contextMenu.style.left = `${Math.max(0, Math.min(clientX - rootBounds.left, Math.max(0, rootBounds.width - 190)))}px`;
    this.#contextMenu.style.top = `${Math.max(0, Math.min(clientY - rootBounds.top, Math.max(0, rootBounds.height - 30)))}px`;
    this.#contextMenu.hidden = false;
  }

  #requestRowHeight(
    occurrenceId: OccurrenceId,
    auto = false,
    reset = false,
  ): void {
    const callbacks = this.#requiredCallbacks();
    if (typeof callbacks.setRowHeight !== 'function') return;
    const projection = this.#requiredViewModel().projection;
    let rowHeight = projection.defaultRowHeight;
    if (!reset && auto) {
      const viewModel = this.#requiredViewModel();
      let lineCount = 1;
      for (const column of visibleColumnDefinitions(viewModel.columns)) {
        if (column.wrapText !== true) continue;
        const node = viewModel.indexes.rowById.get(occurrenceId);
        if (node === undefined) continue;
        const text = this.#cellText(node, column, undefined);
        const maxCharacters = Math.max(1, Math.floor(column.width / 7));
        lineCount = Math.max(lineCount, wrapCanvasText(text, maxCharacters).length);
      }
      rowHeight = Math.min(MAX_ROW_HEIGHT, Math.max(rowHeight, lineCount * 14 + 4));
    } else if (!reset && !auto) {
      const prompt = this.#document.defaultView?.prompt;
      if (typeof prompt !== 'function') return;
      const current = projection.rowHeightOf(occurrenceId);
      const answer = prompt(
        this.#requiredOptions().labels.contextMenu?.['prompt.row-height'] ?? '',
        String(current.ok ? current.value : rowHeight),
      );
      if (answer === null) return;
      const parsed = Number(answer);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_ROW_HEIGHT) return;
      rowHeight = parsed;
    }
    this.#invoke('setRowHeight', () => callbacks.setRowHeight!(occurrenceId, rowHeight, 'pointer'));
  }

  #resetColumnWidthFromContext(columnId: string): void {
    const callbacks = this.#requiredCallbacks();
    if (typeof callbacks.resetColumnWidth !== 'function') return;
    const beforeWidth = this.#viewModel?.columns.find(
      (column) => column.columnId === columnId,
    )?.width;
    try {
      callbacks.resetColumnWidth.call(callbacks, columnId, 'pointer');
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'resetColumnWidth',
        cause,
      });
      return;
    }
    const afterWidth = this.#viewModel?.columns.find(
      (column) => column.columnId === columnId,
    )?.width;
    if (
      beforeWidth !== undefined &&
      afterWidth !== undefined &&
      beforeWidth !== afterWidth
    ) {
      this.#viewChanged('columns');
    }
  }

  #copyFromContextMenu(): void {
    const writer = this.#clipboardWriter();
    if (writer === null) return;
    const payload = this.#requestClipboardCopy();
    if (payload !== null) this.#writeClipboardPayload(payload, writer);
  }

  #canReadClipboard(): boolean {
    const clipboard = this.#document.defaultView?.navigator?.clipboard;
    return typeof clipboard?.read === 'function' ||
      typeof clipboard?.readText === 'function';
  }

  #pasteFromContextMenu(): void {
    if (this.#destroyed) return;
    const clipboard = this.#document.defaultView?.navigator?.clipboard;
    if (clipboard === undefined || clipboard === null) return;
    const read = clipboard.read;
    if (typeof read === 'function') {
      let pending: Promise<unknown>;
      try {
        pending = Promise.resolve((read as () => unknown).call(clipboard));
      } catch {
        return;
      }
      void pending.then(
        (items): void => {
          void this.#dispatchClipboardItems(items);
        },
        (): void => undefined,
      );
      return;
    }
    const readText = clipboard.readText;
    if (typeof readText !== 'function') return;
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve((readText as () => unknown).call(clipboard));
    } catch {
      return;
    }
    void pending.then(
      (value): void => {
        if (this.#destroyed || typeof value !== 'string') return;
        this.#invoke('paste', () => this.#requiredCallbacks().paste(
          Object.freeze({ text: value }),
        ));
      },
      (): void => undefined,
    );
  }

  async #dispatchClipboardItems(items: unknown): Promise<void> {
    if (this.#destroyed || !Array.isArray(items)) return;
    const candidates: Record<string, string> = {};
    const types = [BOM_INTERNAL_CLIPBOARD_MIME, 'text/html', 'text/plain'];
    for (const type of types) {
      for (const item of items) {
        if (item === null || typeof item !== 'object') continue;
        const candidate = item as {
          readonly types?: unknown;
          readonly getType?: (type: string) => Promise<unknown>;
        };
        const declared = candidate.types;
        if (
          Array.isArray(declared) && !declared.includes(type)
        ) {
          continue;
        }
        if (typeof candidate.getType !== 'function') continue;
        try {
          const blob = await candidate.getType.call(item, type);
          if (this.#destroyed) return;
          const text = typeof blob === 'string'
            ? blob
            : blob !== null && typeof blob === 'object' &&
                typeof (blob as { readonly text?: unknown }).text === 'function'
              ? await (blob as { text(): Promise<unknown> }).text()
              : undefined;
          if (typeof text === 'string') {
            candidates[type] = text;
            break;
          }
        } catch {
          // A denied or unsupported representation may safely fall through.
        }
      }
    }
    if (this.#destroyed) return;
    const internal = candidates[BOM_INTERNAL_CLIPBOARD_MIME];
    const html = candidates['text/html'];
    const text = candidates['text/plain'];
    if (internal === undefined && html === undefined && text === undefined) {
      return;
    }
    this.#invoke('paste', () => this.#requiredCallbacks().paste(
      Object.freeze({
        ...(internal === undefined ? {} : { internal }),
        ...(html === undefined ? {} : { html }),
        ...(text === undefined ? {} : { text }),
      }),
    ));
  }

  #clearContextSelection(kind: 'column' | 'row' | 'cell', address: Readonly<BomCellAddress>): void {
    const callbacks = this.#requiredCallbacks();
    this.#invoke('select', () => callbacks.select(address, 'pointer', {
      extend: false,
      ...(kind === 'column' || kind === 'row' ? { mode: kind } : {}),
    }));
    this.#invoke('clearSelection', () => callbacks.clearSelection?.());
  }

  readonly #onPointerDown = (event: Event): void => {
    if (this.#destroyed) {
      return;
    }
    this.#closeContextMenu();
    const pointerEvent = event as PointerEvent;
    if (pointerEvent.button !== 0) {
      return;
    }
    // Native scrollbars are part of the scroll host, so their pointerdown
    // bubbles here. They must never start a cell-selection drag.
    if (this.#isNativeScrollbarHit(pointerEvent.clientX, pointerEvent.clientY)) {
      return;
    }
    this.focus();
    const resizeColumn = this.#columnResizeHitFromClient(
      pointerEvent.clientX,
      pointerEvent.clientY,
    );
    if (
      resizeColumn !== null &&
      pointerEvent.pointerType !== 'touch' &&
      Number.isFinite(pointerEvent.pointerId)
    ) {
      this.#beginColumnResize(pointerEvent, resizeColumn);
      return;
    }
    const hit = this.#hitFromClient(pointerEvent.clientX, pointerEvent.clientY);
    if (hit === null) {
      return;
    }
    const fillHandleMode: FillHandleDragMode = pointerEvent.altKey === true
      ? 'series'
      : 'copy';
    if (
      hit.target === 'cell' &&
      !pointerEvent.shiftKey &&
      !pointerEvent.ctrlKey &&
      !pointerEvent.metaKey &&
      this.#isFillHandleHit(
        pointerEvent.clientX,
        pointerEvent.clientY,
        fillHandleMode,
      )
    ) {
      this.#beginFillHandleDrag(pointerEvent, hit.address, fillHandleMode);
      return;
    }
    if (hit.target === 'cell') {
      const customHit = this.#hitTestCustomCell(
        hit,
        pointerEvent.clientX,
        pointerEvent.clientY,
      );
      if (customHit !== null) {
        this.#emitCellRendererHit(hit.address, customHit);
        if (customHit.consume === true) {
          return;
        }
      }
    }
    const extend = pointerEvent.shiftKey === true;
    if (hit.target === 'row-header' || hit.target === 'column-header') {
      if (hit.target === 'column-header') {
        this.#beginColumnReorder(pointerEvent, hit.address.columnId);
      }
      const preserveMultiRowSelection = hit.target === 'row-header' &&
        !extend &&
        !pointerEvent.ctrlKey &&
        !pointerEvent.metaKey &&
        !pointerEvent.altKey &&
        this.#isMultiRowSelectionContaining(hit.address.occurrenceId);
      if (!preserveMultiRowSelection) {
        this.#invoke('select', (): void => {
          this.#requiredCallbacks().select(hit.address, 'pointer', {
            extend,
            mode: hit.target === 'row-header' ? 'row' : 'column',
          });
        });
      }
      if (
        hit.target === 'row-header' &&
        !extend &&
        !pointerEvent.ctrlKey &&
        !pointerEvent.metaKey &&
        !pointerEvent.altKey
      ) {
        this.#beginTreeMove(pointerEvent, hit.address.occurrenceId);
      }
      return;
    }
    if (hit.target === 'expander') {
      const row = this.#layout?.rows.find(
        (entry) => entry.occurrenceId === hit.address.occurrenceId,
      );
      if (row !== undefined) {
        this.#invoke('toggleExpansion', (): void => {
          this.#requiredCallbacks().toggleExpansion(hit.address, !row.expanded);
        });
      }
      return;
    }
    const additive = pointerEvent.ctrlKey === true || pointerEvent.metaKey === true;
    this.#invoke('select', (): void => {
      this.#requiredCallbacks().select(
        hit.address,
        'pointer',
        additive ? { extend, additive: true } : { extend },
      );
    });
    this.#beginSelectionDrag(pointerEvent, hit.address, additive);
  };

  #isMultiRowSelectionContaining(occurrenceId: OccurrenceId): boolean {
    const selection = this.#viewModel?.selection;
    if (selection === undefined || selection === null ||
        selection.mode !== 'row' || selection.range === null) {
      return false;
    }
    const ranges = selection.ranges ?? [selection.range];
    for (const range of ranges) {
      const anchor = this.#viewModel?.projection.indexOf(range.anchor.occurrenceId);
      const focus = this.#viewModel?.projection.indexOf(range.focus.occurrenceId);
      const current = this.#viewModel?.projection.indexOf(occurrenceId);
      if (!anchor?.ok || anchor.value === undefined ||
          !focus?.ok || focus.value === undefined ||
          !current?.ok || current.value === undefined) {
        continue;
      }
      if (anchor.value !== focus.value &&
          current.value >= Math.min(anchor.value, focus.value) &&
          current.value <= Math.max(anchor.value, focus.value)) {
        return true;
      }
    }
    return false;
  }

  readonly #onPointerMove = (event: Event): void => {
    if (this.#destroyed) {
      return;
    }
    const pointerEvent = event as PointerEvent;
    if (this.#isColumnResizePointer(pointerEvent)) {
      this.#extendColumnResizeAt(pointerEvent.clientX);
      return;
    }
    if (this.#isColumnReorderPointer(pointerEvent)) {
      this.#extendColumnReorderAt(pointerEvent.clientX, pointerEvent.clientY);
      return;
    }
    if (this.#isTreeMovePointer(pointerEvent)) {
      this.#extendTreeMoveAt(pointerEvent.clientX, pointerEvent.clientY);
      this.#scheduleTreeMoveAutoScroll();
      return;
    }
    if (this.#isFillHandlePointer(pointerEvent)) {
      this.#extendFillHandleAt(pointerEvent.clientX, pointerEvent.clientY);
      this.#scheduleFillHandleAutoScroll();
      return;
    }
    if (this.#columnResizeHitFromClient(
      pointerEvent.clientX,
      pointerEvent.clientY,
    ) !== null) {
      this.#scrollHost.style.cursor = 'col-resize';
      return;
    }
    this.#updateFillHandleCursor(
      pointerEvent.clientX,
      pointerEvent.clientY,
      pointerEvent.altKey === true ? 'series' : 'copy',
    );
    if (!this.#isSelectionDragPointer(pointerEvent)) {
      return;
    }
    this.#extendSelectionDragAt(pointerEvent.clientX, pointerEvent.clientY);
    this.#scheduleSelectionAutoScroll();
  };

  readonly #onPointerLeave = (): void => {
    if (
      !this.#destroyed &&
      this.#fillHandleDrag === null &&
      this.#columnResize === null &&
      this.#columnReorder === null &&
      this.#treeMove === null
    ) {
      this.#scrollHost.style.cursor = '';
    }
  };

  readonly #onPointerUp = (event: Event): void => {
    if (this.#destroyed) {
      return;
    }
    const pointerEvent = event as PointerEvent;
    if (this.#isColumnResizePointer(pointerEvent)) {
      this.#extendColumnResizeAt(pointerEvent.clientX);
      this.#endColumnResize(pointerEvent.pointerId, true);
      return;
    }
    if (this.#isColumnReorderPointer(pointerEvent)) {
      this.#extendColumnReorderAt(pointerEvent.clientX, pointerEvent.clientY);
      this.#endColumnReorder(pointerEvent.pointerId, true);
      return;
    }
    if (this.#isTreeMovePointer(pointerEvent)) {
      this.#extendTreeMoveAt(pointerEvent.clientX, pointerEvent.clientY);
      this.#endTreeMove(pointerEvent.pointerId, true);
      return;
    }
    if (this.#isFillHandlePointer(pointerEvent)) {
      this.#extendFillHandleAt(pointerEvent.clientX, pointerEvent.clientY);
      this.#endFillHandleDrag(pointerEvent.pointerId, true);
      return;
    }
    if (!this.#isSelectionDragPointer(pointerEvent)) {
      return;
    }
    this.#extendSelectionDragAt(pointerEvent.clientX, pointerEvent.clientY);
    this.#endSelectionDrag(pointerEvent.pointerId);
  };

  readonly #onPointerCancel = (event: Event): void => {
    if (!this.#destroyed) {
      this.#endColumnResize((event as PointerEvent).pointerId);
      this.#endColumnReorder((event as PointerEvent).pointerId);
      this.#endTreeMove((event as PointerEvent).pointerId);
      this.#endFillHandleDrag((event as PointerEvent).pointerId);
      this.#endSelectionDrag((event as PointerEvent).pointerId);
    }
  };

  readonly #onLostPointerCapture = (event: Event): void => {
    if (!this.#destroyed) {
      this.#endColumnResize((event as PointerEvent).pointerId);
      this.#endColumnReorder((event as PointerEvent).pointerId);
      this.#endTreeMove((event as PointerEvent).pointerId);
      this.#endFillHandleDrag((event as PointerEvent).pointerId);
      this.#endSelectionDrag((event as PointerEvent).pointerId);
    }
  };

  #columnResizeHitFromClient(
    clientX: number,
    clientY: number,
  ): Readonly<BomCanvasColumnLayout> | null {
    const callbacks = this.#callbacks;
    const layout = this.#layout;
    const viewModel = this.#viewModel;
    if (
      callbacks === null ||
      typeof callbacks.resizeColumn !== 'function' ||
      layout === null ||
      viewModel === null ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused')
    ) {
      return null;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      y < 0 ||
      y >= layout.bodyTop ||
      (x >= layout.rowHeaderLeft &&
        x < layout.rowHeaderLeft + this.#requiredOptions().rowHeaderWidth)
    ) {
      return null;
    }
    let nearest: Readonly<BomCanvasColumnLayout> | null = null;
    let distance = COLUMN_RESIZE_HIT_SLOP + 1;
    for (const column of layout.columnWindow.columns) {
      const header = visibleColumnRect(
        column,
        layout.scrollableStart,
        layout.scrollableEnd,
        0,
        layout.bodyTop,
      );
      if (header === null) {
        continue;
      }
      const resizeEdge = this.#requiredOptions().direction === 'rtl'
        ? header.x
        : header.x + header.width;
      const candidateDistance = Math.abs(x - resizeEdge);
      if (
        candidateDistance <= COLUMN_RESIZE_HIT_SLOP &&
        candidateDistance < distance
      ) {
        nearest = column;
        distance = candidateDistance;
      }
    }
    return nearest;
  }

  #isNativeScrollbarHit(clientX: number, clientY: number): boolean {
    const bounds = this.#scrollHost.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }
    // client dimensions exclude the scrollbar gutters, while the bounding
    // rectangle includes them. This applies to both classic and reserved
    // scrollbar implementations without assuming a fixed gutter width.
    const hasVerticalGutter = bounds.width > this.#scrollHost.clientWidth;
    const hasHorizontalGutter = bounds.height > this.#scrollHost.clientHeight;
    return (hasVerticalGutter && x >= this.#scrollHost.clientWidth) ||
      (hasHorizontalGutter && y >= this.#scrollHost.clientHeight);
  }

  #beginColumnResize(
    event: PointerEvent,
    column: Readonly<BomCanvasColumnLayout>,
  ): void {
    this.#shortcuts.clearPending();
    this.#endSelectionDrag();
    this.#endFillHandleDrag();
    this.#endColumnResize();
    const callbacks = this.#callbacks;
    const layout = this.#layout;
    if (
      callbacks === null ||
      layout === null ||
      typeof callbacks.resizeColumn !== 'function' ||
      event.pointerType === 'touch' ||
      !Number.isFinite(event.pointerId)
    ) {
      return;
    }
    this.#columnResize = Object.freeze({
      pointerId: event.pointerId,
      columnId: column.columnId,
      startX: event.clientX,
      startWidth: column.width,
      initialScrollLeft: this.#logicalScrollLeft(Math.max(
        0,
        layout.columnWindow.totalWidth - layout.viewportWidth,
      )),
      frozen: column.column.frozen === 'start',
      targetContentOffset: column.contentOffset,
      lastCommittedWidth: column.width,
      lastWidth: column.width,
    });
    this.#invoke('beginColumnResize', (): void => {
      this.#requiredCallbacks().beginColumnResize?.call(
        this.#requiredCallbacks(),
        column.columnId,
        column.width,
      );
    });
    this.#scrollHost.style.cursor = 'col-resize';
    try {
      this.#scrollHost.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable for synthetic or detached targets.
    }
  }

  #autoSizeColumn(column: Readonly<BomCanvasColumnLayout>): void {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    const layout = this.#layout;
    const options = this.#options;
    const contentLayer = this.#layers.get('content');
    if (
      viewModel === null ||
      callbacks === null ||
      layout === null ||
      options === null ||
      contentLayer === undefined ||
      typeof callbacks.resizeColumn !== 'function' ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused')
    ) {
      return;
    }
    const definition = viewModel.columns.find(
      (candidate) => candidate.columnId === column.columnId,
    );
    if (definition === undefined || definition.visible === false) {
      return;
    }

    const context = contentLayer.context;
    const measure = (text: string): number => {
      const bounded = text.length > AUTO_FIT_MAX_TEXT_LENGTH
        ? `${text.slice(0, AUTO_FIT_MAX_TEXT_LENGTH)}...`
        : text;
      try {
        const measured = typeof context.measureText === 'function'
          ? context.measureText(bounded).width
          : bounded.length * 8;
        return Number.isFinite(measured) ? Math.max(0, measured) : bounded.length * 8;
      } catch {
        return bounded.length * 8;
      }
    };

    let contentWidth = 0;
    context.save();
    try {
      context.font = boldCanvasFont(options.theme.font);
      contentWidth = Math.max(contentWidth, measure(definition.label));
      context.font = options.theme.font;
      let measuredRows = 0;
      for (const row of layout.rows) {
        if (measuredRows >= AUTO_FIT_MAX_VISIBLE_ROWS) break;
        const node = viewModel.indexes.rowById.get(row.occurrenceId);
        if (node === undefined) continue;
        const textWidth = measure(this.#cellText(node, definition, undefined));
        const treeInset = definition.columnId === viewModel.columns[0]?.columnId
          ? Math.max(0, row.depth - 1) * options.indentWidth + EXPANDER_SIZE + 4
          : 0;
        contentWidth = Math.max(contentWidth, textWidth + treeInset);
        measuredRows += 1;
      }
    } finally {
      context.restore();
    }

    const targetWidth = clampColumnWidth(
      Math.min(
        AUTO_FIT_MAX_WIDTH,
        Math.ceil(contentWidth + options.cellPadding * 2),
      ),
      definition,
    );
    if (targetWidth === definition.width) {
      return;
    }
    const widthDelta = targetWidth - definition.width;
    const maximumLeft = Math.max(
      0,
      layout.columnWindow.totalWidth - layout.viewportWidth,
    );
    const initialScrollLeft = this.#logicalScrollLeft(maximumLeft);
    const targetIsBeforeScrollAnchor = definition.frozen === 'start' ||
      column.contentOffset + column.width <= initialScrollLeft;
    this.#invoke('beginColumnResize', (): void => {
      this.#requiredCallbacks().beginColumnResize?.call(
        this.#requiredCallbacks(),
        definition.columnId,
        definition.width,
      );
    });
    if (!this.#callColumnResize(definition.columnId, targetWidth, 'pointer')) {
      this.#invoke('endColumnResize', (): void => {
        this.#requiredCallbacks().endColumnResize?.call(
          this.#requiredCallbacks(),
          definition.columnId,
          definition.width,
        );
      });
      return;
    }
    if (targetIsBeforeScrollAnchor) {
      this.#setLogicalScrollLeft(
        initialScrollLeft + widthDelta,
        Math.max(0, maximumLeft + widthDelta),
      );
    }
    this.#viewChanged('columns');
    this.#invoke('endColumnResize', (): void => {
      this.#requiredCallbacks().endColumnResize?.call(
        this.#requiredCallbacks(),
        definition.columnId,
        targetWidth,
      );
    });
    this.#announceBuiltInLiveLabel('columnResizeCompleted', 'polite');
  }

  #autoSizeColumnById(columnId: string): void {
    const column = this.#layout?.columnWindow.columns.find(
      (candidate) => candidate.columnId === columnId,
    );
    if (column !== undefined) {
      this.#autoSizeColumn(column);
    }
  }

  #isColumnResizePointer(event: PointerEvent): boolean {
    return this.#columnResize !== null &&
      Number.isFinite(event.pointerId) &&
      this.#columnResize.pointerId === event.pointerId;
  }

  #extendColumnResizeAt(clientX: number): void {
    const session = this.#columnResize;
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    if (
      session === null ||
      viewModel === null ||
      callbacks === null ||
      typeof callbacks.resizeColumn !== 'function'
    ) {
      return;
    }
    const column = viewModel.columns.find(
      (candidate) => candidate.columnId === session.columnId,
    );
    if (column === undefined) {
      return;
    }
    const nextWidth = clampColumnWidth(
      session.startWidth + (this.#requiredOptions().direction === 'rtl'
        ? session.startX - clientX
        : clientX - session.startX),
      column,
    );
    if (nextWidth === session.lastWidth) {
      return;
    }
    const nextSession = Object.freeze({
      ...session,
      lastWidth: nextWidth,
    });
    this.#columnResize = nextSession;
    this.#preserveColumnResizeAnchor(session, nextWidth - session.startWidth);
    if (this.#callColumnResize(session.columnId, nextWidth, 'pointer')) {
      this.#columnResize = Object.freeze({
        ...nextSession,
        lastCommittedWidth: nextWidth,
      });
      this.#viewChanged('columns');
    }
  }

  #endColumnResize(pointerId?: number, commit = false): void {
    const session = this.#columnResize;
    if (
      session === null ||
      (pointerId !== undefined && session.pointerId !== pointerId)
    ) {
      return;
    }
    const announceCompleted =
      commit &&
      session.lastCommittedWidth !== session.startWidth;
    this.#invoke('endColumnResize', (): void => {
      this.#requiredCallbacks().endColumnResize?.call(
        this.#requiredCallbacks(),
        session.columnId,
        session.lastWidth,
      );
    });
    this.#columnResize = null;
    this.#scrollHost.style.cursor = '';
    this.#shortcuts.clearPending();
    try {
      if (this.#scrollHost.hasPointerCapture(session.pointerId)) {
        this.#scrollHost.releasePointerCapture(session.pointerId);
      }
    } catch {
      // A browser can release capture before pointerup or pointercancel arrives.
    }
    if (announceCompleted) {
      this.#announceBuiltInLiveLabel('columnResizeCompleted', 'polite');
    }
  }

  #callColumnResize(
    columnId: string,
    width: number,
    reason: 'pointer' | 'keyboard',
  ): boolean {
    try {
      const callbacks = this.#requiredCallbacks();
      callbacks.resizeColumn!.call(callbacks, columnId, width, reason);
      return true;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'resizeColumn',
        cause,
      });
      return false;
    }
  }

  #beginColumnReorder(event: PointerEvent, columnId: string): void {
    this.#endColumnReorder();
    const callbacks = this.#callbacks;
    const viewModel = this.#viewModel;
    if (
      callbacks === null ||
      typeof callbacks.reorderColumns !== 'function' ||
      viewModel === null ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused') ||
      event.pointerType === 'touch' ||
      !Number.isFinite(event.pointerId)
    ) {
      return;
    }
    const visibleColumns = visibleColumnDefinitions(viewModel.columns);
    const sourceIndex = visibleColumns.findIndex(
      (column) => column.columnId === columnId,
    );
    // The first column owns the tree expander and remains the stable tree key.
    if (sourceIndex <= 0) {
      return;
    }
    const layout = this.#layout;
    const layoutColumn = layout?.columnWindow.columns.find(
      (column) => column.columnId === columnId,
    );
    if (layout === null || layoutColumn === undefined) {
      return;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    this.#endSelectionDrag();
    this.#endFillHandleDrag();
    this.#columnReorder = Object.freeze({
      pointerId: event.pointerId,
      columnId,
      startX: event.clientX,
      startY: event.clientY,
      dragClientX: null,
      dragClientY: null,
      dragOffsetX: clamp(
        event.clientX - bounds.left - layoutColumn.x,
        0,
        layoutColumn.width,
      ),
      dragOffsetY: clamp(event.clientY - bounds.top, 0, layout.bodyTop),
      columnWidth: layoutColumn.width,
      indicatorX: null,
      pendingOrder: null,
    });
    this.#scrollHost.style.cursor = 'grabbing';
    try {
      this.#scrollHost.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable for synthetic or detached targets.
    }
  }

  #isColumnReorderPointer(event: PointerEvent): boolean {
    return this.#columnReorder !== null &&
      Number.isFinite(event.pointerId) &&
      this.#columnReorder.pointerId === event.pointerId;
  }

  #extendColumnReorderAt(clientX: number, clientY: number): void {
    const session = this.#columnReorder;
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    if (
      session === null ||
      viewModel === null ||
      callbacks === null ||
      typeof callbacks.reorderColumns !== 'function'
    ) {
      return;
    }
    if (
      Math.hypot(clientX - session.startX, clientY - session.startY) <
      COLUMN_REORDER_DRAG_THRESHOLD
    ) {
      this.#setColumnReorderPreview(null, null, null, null);
      return;
    }
    const layout = this.#layout;
    if (layout === null) {
      this.#setColumnReorderPreview(null, null, clientX, clientY);
      return;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    const localX = clientX - bounds.left;
    const target = layout.columnWindow.columns.find((column) => {
      const header = visibleColumnRect(
        column,
        layout.scrollableStart,
        layout.scrollableEnd,
        0,
        layout.bodyTop,
      );
      return header !== null &&
        localX >= header.x &&
        localX <= header.x + header.width;
    });
    if (target === undefined) {
      this.#setColumnReorderPreview(null, null, clientX, clientY);
      return;
    }
    const targetHeader = visibleColumnRect(
      target,
      layout.scrollableStart,
      layout.scrollableEnd,
      0,
      layout.bodyTop,
    );
    if (targetHeader === null) {
      this.#setColumnReorderPreview(null, null, clientX, clientY);
      return;
    }
    const visibleColumns = visibleColumnDefinitions(viewModel.columns);
    const sourceIndex = visibleColumns.findIndex(
      (column) => column.columnId === session.columnId,
    );
    const targetIndex = visibleColumns.findIndex(
      (column) => column.columnId === target.columnId,
    );
    if (
      sourceIndex <= 0 ||
      targetIndex <= 0 ||
      sourceIndex === targetIndex ||
      columnReorderGroup(visibleColumns[sourceIndex]!) !==
        columnReorderGroup(visibleColumns[targetIndex]!)
    ) {
      this.#setColumnReorderPreview(null, null, clientX, clientY);
      return;
    }
    const targetCenter = targetHeader.x + targetHeader.width / 2;
    const insertBefore = this.#requiredOptions().direction === 'rtl'
      ? localX > targetCenter
      : localX < targetCenter;
    let insertionIndex = targetIndex + (insertBefore ? 0 : 1);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    const visibleOrder = visibleColumns.map((column) => column.columnId);
    const [moved] = visibleOrder.splice(sourceIndex, 1);
    if (moved === undefined) {
      this.#setColumnReorderPreview(null, null, clientX, clientY);
      return;
    }
    visibleOrder.splice(insertionIndex, 0, moved);
    const order = orderWithVisibleColumns(viewModel.columns, visibleOrder);
    const changed = order.some(
      (columnId, index) => columnId !== viewModel.columns[index]?.columnId,
    );
    if (!changed) {
      this.#setColumnReorderPreview(null, null, clientX, clientY);
      return;
    }
    this.#setColumnReorderPreview(
      insertBefore
        ? targetHeader.x
        : targetHeader.x + targetHeader.width,
      order,
      clientX,
      clientY,
    );
  }

  #setColumnReorderPreview(
    indicatorX: number | null,
    pendingOrder: readonly string[] | null,
    dragClientX: number | null,
    dragClientY: number | null,
  ): void {
    const session = this.#columnReorder;
    if (session === null) {
      return;
    }
    const sameOrder =
      session.pendingOrder === pendingOrder ||
      (session.pendingOrder !== null &&
        pendingOrder !== null &&
        session.pendingOrder.length === pendingOrder.length &&
        session.pendingOrder.every(
          (columnId, index) => columnId === pendingOrder[index],
        ));
    if (
      session.indicatorX === indicatorX &&
      session.dragClientX === dragClientX &&
      session.dragClientY === dragClientY &&
      sameOrder
    ) {
      return;
    }
    this.#columnReorder = Object.freeze({
      ...session,
      indicatorX,
      dragClientX,
      dragClientY,
      pendingOrder: pendingOrder === null
        ? null
        : Object.freeze([...pendingOrder]),
    });
    if (pendingOrder !== null && !sameOrder) {
      const position = pendingOrder.indexOf(session.columnId) + 1;
      if (position > 0) this.#announceColumnReorderTarget(position);
    }
    this.#fullDirty.add('interaction');
    this.#scheduleRender();
  }

  #endColumnReorder(pointerId?: number, commit = false): void {
    const session = this.#columnReorder;
    if (
      session === null ||
      (pointerId !== undefined && session.pointerId !== pointerId)
    ) {
      return;
    }
    this.#columnReorder = null;
    if (session.indicatorX !== null || session.dragClientX !== null) {
      this.#fullDirty.add('interaction');
      this.#scheduleRender();
    }
    if (this.#columnResize === null) {
      this.#scrollHost.style.cursor = '';
    }
    this.#shortcuts.clearPending();
    try {
      if (this.#scrollHost.hasPointerCapture(session.pointerId)) {
        this.#scrollHost.releasePointerCapture(session.pointerId);
      }
    } catch {
      // A browser can release capture before pointerup or pointercancel arrives.
    }
    if (
      commit &&
      session.pendingOrder !== null &&
      this.#callColumnReorder(session.pendingOrder, 'pointer')
    ) {
      this.#viewChanged('columns');
      this.#announceBuiltInLiveLabel('columnReorderCompleted', 'polite');
    }
  }

  #callColumnReorder(
    columnIds: readonly string[],
    reason: 'pointer' | 'keyboard',
  ): boolean {
    try {
      const callbacks = this.#requiredCallbacks();
      callbacks.reorderColumns!.call(callbacks, Object.freeze([...columnIds]), reason);
      return true;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'reorderColumns',
        cause,
      });
      return false;
    }
  }

  #beginTreeMove(event: PointerEvent, occurrenceId: OccurrenceId): void {
    this.#endTreeMove();
    this.#stopTreeMoveAutoScroll();
    const callbacks = this.#callbacks;
    const viewModel = this.#viewModel;
    if (
      callbacks === null ||
      viewModel === null ||
      typeof callbacks.moveSubtree !== 'function' ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused') ||
      event.pointerType === 'touch' ||
      !Number.isFinite(event.pointerId) ||
      !viewModel.indexes.rowById.has(occurrenceId)
    ) {
      return;
    }
    this.#shortcuts.clearPending();
    this.#endSelectionDrag();
    this.#endFillHandleDrag();
    this.#endColumnResize();
    this.#endColumnReorder();
    this.#treeMove = Object.freeze({
      pointerId: event.pointerId,
      occurrenceId,
      occurrenceIds: this.#treeMoveOccurrenceIds(occurrenceId),
      startX: event.clientX,
      startY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      moved: false,
      targetOccurrenceId: null,
      position: null,
    });
    this.#scrollHost.style.cursor = 'grab';
    try {
      this.#scrollHost.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable for synthetic or detached targets.
    }
  }

  #isTreeMovePointer(event: PointerEvent): boolean {
    return this.#treeMove !== null &&
      Number.isFinite(event.pointerId) &&
      this.#treeMove.pointerId === event.pointerId;
  }

  #treeMoveOccurrenceIds(occurrenceId: OccurrenceId): readonly OccurrenceId[] {
    const viewModel = this.#requiredViewModel();
    const selection = viewModel.selection;
    if (selection.mode !== 'row' || selection.range === null) {
      return Object.freeze([occurrenceId]);
    }
    const ranges = selection.ranges ?? [selection.range];
    const selected = new Set<OccurrenceId>();
    for (const range of ranges) {
      const anchor = viewModel.projection.indexOf(range.anchor.occurrenceId);
      const focus = viewModel.projection.indexOf(range.focus.occurrenceId);
      if (!anchor.ok || anchor.value === undefined ||
          !focus.ok || focus.value === undefined) {
        continue;
      }
      const first = Math.min(anchor.value, focus.value);
      const last = Math.max(anchor.value, focus.value);
      for (let index = first; index <= last; index += 1) {
        const row = viewModel.projection.occurrenceAt(index);
        if (row.ok && row.value !== undefined) selected.add(row.value);
      }
    }
    if (!selected.has(occurrenceId)) {
      return Object.freeze([occurrenceId]);
    }
    const ordered: OccurrenceId[] = [];
    const count = viewModel.projection.visibleCount;
    for (let index = 0; index < count; index += 1) {
      const row = viewModel.projection.occurrenceAt(index);
      if (row.ok && row.value !== undefined && selected.has(row.value)) {
        ordered.push(row.value);
      }
    }
    return Object.freeze(ordered.length === 0 ? [occurrenceId] : ordered);
  }

  #extendTreeMoveAt(clientX: number, clientY: number): void {
    const session = this.#treeMove;
    if (session === null) return;
    const moved = session.moved ||
      Math.hypot(clientX - session.startX, clientY - session.startY) >=
        TREE_MOVE_DRAG_THRESHOLD;
    let targetOccurrenceId: OccurrenceId | null = null;
    let position: BomTreeDropPosition | null = null;
    if (moved) {
      const row = this.#treeMoveRowFromClient(clientY);
      if (row !== undefined) {
        const candidatePosition = this.#treeDropPositionAt(row, clientY);
        if (
          this.#isTreeMoveTargetAllowed(
            session.occurrenceIds,
            row.occurrenceId,
          )
        ) {
          targetOccurrenceId = row.occurrenceId;
          position = candidatePosition;
        }
      }
    }
    this.#setTreeMovePreview(
      clientX,
      clientY,
      moved,
      targetOccurrenceId,
      position,
    );
  }

  #treeDropPositionAt(
    row: Readonly<BomCanvasRowLayout>,
    clientY: number,
  ): BomTreeDropPosition {
    const bounds = this.#scrollHost.getBoundingClientRect();
    const layout = this.#layout;
    const viewportY = clientY - bounds.top;
    if (layout !== null) {
      if (viewportY <= layout.bodyTop) return 'before';
      if (viewportY >= layout.viewportHeight) return 'after';
    }
    const offset = clientY - bounds.top - row.y;
    const ratio = row.height <= 0 ? 0.5 : offset / row.height;
    if (ratio <= TREE_MOVE_EDGE_RATIO) return 'before';
    if (ratio >= 1 - TREE_MOVE_EDGE_RATIO) return 'after';
    return 'inside';
  }

  #treeMoveRowFromClient(
    clientY: number,
  ): Readonly<BomCanvasRowLayout> | undefined {
    const direct = this.#rowFromClient(clientY);
    if (direct !== undefined) {
      return direct;
    }
    const layout = this.#layout;
    if (layout === null || !Number.isFinite(clientY)) {
      return undefined;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    const y = clientY - bounds.top;
    if (y < layout.bodyTop) {
      return layout.rows.find((row) => row.y + row.height > layout.bodyTop);
    }
    if (y < layout.viewportHeight) {
      return undefined;
    }
    for (let index = layout.rows.length - 1; index >= 0; index -= 1) {
      const row = layout.rows[index]!;
      if (row.y < layout.viewportHeight) {
        return row;
      }
    }
    return undefined;
  }

  #scheduleTreeMoveAutoScroll(): void {
    if (
      this.#destroyed ||
      this.#treeMove === null ||
      this.#treeMove.moved !== true ||
      this.#treeMoveAutoScrollRelease !== null
    ) {
      return;
    }
    const view = this.#document.defaultView;
    if (view === null || typeof view.requestAnimationFrame !== 'function') {
      return;
    }
    const requestId = view.requestAnimationFrame((): void => {
      const release = this.#treeMoveAutoScrollRelease;
      this.#treeMoveAutoScrollRelease = null;
      release?.();
      if (this.#destroyed || this.#treeMove === null) {
        return;
      }
      if (this.#autoScrollTreeMove()) {
        const session = this.#treeMove;
        if (session !== null) {
          this.#extendTreeMoveAt(session.pointerX, session.pointerY);
        }
        this.#scheduleTreeMoveAutoScroll();
      }
    });
    this.#treeMoveAutoScrollRelease = this.#registry.trackAnimationFrame(
      requestId,
      (id: number): void => {
        view.cancelAnimationFrame(id);
      },
    );
  }

  #stopTreeMoveAutoScroll(): void {
    const release = this.#treeMoveAutoScrollRelease;
    this.#treeMoveAutoScrollRelease = null;
    release?.();
  }

  #autoScrollTreeMove(): boolean {
    const session = this.#treeMove;
    const layout = this.#layout;
    if (session === null || layout === null) {
      return false;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    const y = session.pointerY - bounds.top;
    const verticalDelta = edgeScrollDelta(
      y,
      layout.viewportHeight,
      32,
      layout.bodyTop,
    );
    if (verticalDelta === 0) {
      return false;
    }
    const maximumTop = Math.max(
      0,
      layout.totalHeight - layout.bodyHeight,
    );
    const nextTop = Math.min(
      maximumTop,
      Math.max(0, this.#scrollHost.scrollTop + verticalDelta),
    );
    if (nextTop === this.#scrollHost.scrollTop) {
      return false;
    }
    this.#scrollHost.scrollTop = nextTop;
    this.#viewChanged('scroll');
    return true;
  }

  #isTreeMoveTargetAllowed(
    occurrenceIds: readonly OccurrenceId[],
    targetOccurrenceId: OccurrenceId,
  ): boolean {
    if (occurrenceIds.includes(targetOccurrenceId)) return false;
    const indexes = this.#viewModel?.indexes;
    if (indexes === null || indexes === undefined) return false;
    for (const occurrenceId of occurrenceIds) {
      let current = indexes.rowById.get(targetOccurrenceId);
      for (let depth = 0; current !== undefined && depth <= indexes.rowById.size; depth += 1) {
        if (current.parentId === occurrenceId) return false;
        if (current.parentId === null) break;
        current = indexes.rowById.get(current.parentId);
      }
      if (current === undefined) return false;
    }
    return true;
  }

  #setTreeMovePreview(
    pointerX: number,
    pointerY: number,
    moved: boolean,
    targetOccurrenceId: OccurrenceId | null,
    position: BomTreeDropPosition | null,
  ): void {
    const session = this.#treeMove;
    if (session === null) return;
    const targetChanged =
      session.targetOccurrenceId !== targetOccurrenceId ||
      session.position !== position;
    if (
      session.pointerX === pointerX &&
      session.pointerY === pointerY &&
      session.moved === moved &&
      !targetChanged
    ) {
      return;
    }
    this.#treeMove = Object.freeze({
      ...session,
      pointerX,
      pointerY,
      moved,
      targetOccurrenceId,
      position,
    });
    this.#scrollHost.style.cursor = moved ? 'grabbing' : 'grab';
    if (targetChanged && targetOccurrenceId !== null && position !== null) {
      this.#announceTreeMoveTarget(position);
    }
    this.#fullDirty.add('interaction');
    this.#scheduleRender();
  }

  #endTreeMove(pointerId?: number, commit = false): void {
    const session = this.#treeMove;
    if (
      session === null ||
      (pointerId !== undefined && session.pointerId !== pointerId)
    ) {
      return;
    }
    this.#stopTreeMoveAutoScroll();
    this.#treeMove = null;
    if (
      session.moved ||
      session.targetOccurrenceId !== null ||
      session.position !== null
    ) {
      this.#fullDirty.add('interaction');
      this.#scheduleRender();
    }
    if (
      this.#columnResize === null &&
      this.#columnReorder === null &&
      this.#fillHandleDrag === null
    ) {
      this.#scrollHost.style.cursor = '';
    }
    this.#shortcuts.clearPending();
    try {
      if (this.#scrollHost.hasPointerCapture(session.pointerId)) {
        this.#scrollHost.releasePointerCapture(session.pointerId);
      }
    } catch {
      // A browser can release capture before pointerup or pointercancel arrives.
    }
    if (
      !commit ||
      !session.moved ||
      session.targetOccurrenceId === null ||
      session.position === null ||
      this.#callbacks?.moveSubtree === undefined
    ) {
      return;
    }
    const request: Readonly<BomTreeMoveRequest> = Object.freeze({
      occurrenceId: session.occurrenceId,
      targetOccurrenceId: session.targetOccurrenceId,
      position: session.position,
      ...(session.occurrenceIds.length > 1
        ? { occurrenceIds: session.occurrenceIds }
        : {}),
    });
    this.#invoke('moveSubtree', (): void => {
      const callbacks = this.#requiredCallbacks();
      callbacks.moveSubtree!.call(callbacks, request);
    });
  }

  #canHideActiveColumn(): boolean {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    const active = viewModel?.selection.activeCell;
    if (
      viewModel === null ||
      callbacks === null ||
      active === null ||
      active === undefined ||
      viewModel.selection.mode !== undefined ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused') ||
      typeof callbacks.setColumnVisibility !== 'function'
    ) {
      return false;
    }
    const visible = visibleColumnDefinitions(viewModel.columns);
    const sourceIndex = visible.findIndex(
      (column) => column.columnId === active.columnId,
    );
    return sourceIndex > 0 && visible.length > 1;
  }

  #selectedColumnIds(): readonly string[] {
    const viewModel = this.#viewModel;
    const active = viewModel?.selection.activeCell;
    if (viewModel === null || active === null || active === undefined) {
      return Object.freeze([]);
    }
    const visible = visibleColumnDefinitions(viewModel.columns);
    if (viewModel.selection.mode !== 'column') {
      return visible.some((column) => column.columnId === active.columnId)
        ? Object.freeze([active.columnId])
        : Object.freeze([]);
    }
    const range = viewModel.selection.range;
    if (range === null) {
      return Object.freeze([active.columnId]);
    }
    const first = visible.findIndex(
      (column) => column.columnId === range.anchor.columnId,
    );
    const last = visible.findIndex(
      (column) => column.columnId === range.focus.columnId,
    );
    if (first < 0 || last < 0) {
      return Object.freeze([]);
    }
    const start = Math.min(first, last);
    const end = Math.max(first, last);
    return Object.freeze(
      visible.slice(start, end + 1).map((column) => column.columnId),
    );
  }

  #canInsertColumns(): boolean {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    const active = viewModel?.selection.activeCell;
    return viewModel !== null &&
      callbacks !== null &&
      active !== null &&
      active !== undefined &&
      (viewModel.editState.status === 'idle' ||
        viewModel.editState.status === 'focused') &&
      typeof callbacks.insertColumn === 'function' &&
      visibleColumnDefinitions(viewModel.columns).some(
        (column) => column.columnId === active.columnId,
      );
  }

  #insertColumns(
    position: BomColumnInsertPosition,
    reason: BomCanvasColumnInsertReason,
  ): void {
    const viewModel = this.#requiredViewModel();
    const active = viewModel.selection.activeCell;
    if (active === null || !this.#canInsertColumns()) {
      return;
    }
    const count = Math.max(1, this.#selectedColumnIds().length);
    if (this.#callColumnInsert(active.columnId, position, count, reason)) {
      this.#viewChanged('columns');
    }
  }

  #canDeleteColumns(): boolean {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    const ids = this.#selectedColumnIds();
    if (
      viewModel === null ||
      callbacks === null ||
      ids.length === 0 ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused') ||
      typeof callbacks.deleteColumns !== 'function'
    ) {
      return false;
    }
    const firstColumnId = viewModel.columns[0]?.columnId;
    return firstColumnId !== undefined && !ids.includes(firstColumnId) &&
      visibleColumnDefinitions(viewModel.columns).length > ids.length;
  }

  #deleteColumns(reason: BomCanvasColumnDeleteReason): void {
    if (!this.#canDeleteColumns()) {
      return;
    }
    const columnIds = this.#selectedColumnIds();
    if (this.#callColumnDelete(columnIds, reason)) {
      this.#viewChanged('columns');
    }
  }

  #hideActiveColumn(reason: BomCanvasColumnVisibilityReason): void {
    const viewModel = this.#requiredViewModel();
    const active = viewModel.selection.activeCell;
    if (active === null || !this.#canHideActiveColumn()) {
      return;
    }
    if (
      this.#callColumnVisibility(
        Object.freeze([active.columnId]),
        false,
        reason,
      )
    ) {
      this.#viewChanged('columns');
    }
  }

  #canShowAllColumns(): boolean {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    return viewModel !== null &&
      callbacks !== null &&
      (viewModel.editState.status === 'idle' ||
        viewModel.editState.status === 'focused') &&
      typeof callbacks.setColumnVisibility === 'function' &&
      viewModel.columns.some((column) => column.visible === false);
  }

  #showAllColumns(reason: BomCanvasColumnVisibilityReason): void {
    const viewModel = this.#requiredViewModel();
    if (!this.#canShowAllColumns()) {
      return;
    }
    const hidden = viewModel.columns
      .filter((column) => column.visible === false)
      .map((column) => column.columnId);
    if (
      hidden.length > 0 &&
      this.#callColumnVisibility(Object.freeze(hidden), true, reason)
    ) {
      this.#viewChanged('columns');
    }
  }

  #canSetActiveColumnFrozen(): boolean {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    const active = viewModel?.selection.activeCell;
    if (
      viewModel === null ||
      callbacks === null ||
      active === null ||
      active === undefined ||
      typeof callbacks.setColumnFrozen !== 'function' ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused')
    ) {
      return false;
    }
    return visibleColumnDefinitions(viewModel.columns).findIndex(
      (column) => column.columnId === active.columnId,
    ) > 0;
  }

  #setActiveColumnFrozen(frozen: 'start' | 'end' | false): void {
    const viewModel = this.#requiredViewModel();
    const active = viewModel.selection.activeCell;
    if (active === null || !this.#canSetActiveColumnFrozen()) {
      return;
    }
    try {
      const callbacks = this.#requiredCallbacks();
      callbacks.setColumnFrozen!.call(callbacks, active.columnId, frozen, 'keyboard');
      this.#viewChanged('columns');
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'setColumnFrozen',
        cause,
      });
    }
  }

  #callColumnVisibility(
    columnIds: readonly string[],
    visible: boolean,
    reason: BomCanvasColumnVisibilityReason,
  ): boolean {
    try {
      const callbacks = this.#requiredCallbacks();
      callbacks.setColumnVisibility!.call(
        callbacks,
        Object.freeze([...columnIds]),
        visible,
        reason,
      );
      return true;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'setColumnVisibility',
        cause,
      });
      return false;
    }
  }

  #callColumnInsert(
    referenceColumnId: string,
    position: BomColumnInsertPosition,
    count: number,
    reason: BomCanvasColumnInsertReason,
  ): boolean {
    try {
      const callbacks = this.#requiredCallbacks();
      callbacks.insertColumn!.call(
        callbacks,
        referenceColumnId,
        position,
        count,
        reason,
      );
      return true;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'insertColumn',
        cause,
      });
      return false;
    }
  }

  #callColumnDelete(
    columnIds: readonly string[],
    reason: BomCanvasColumnDeleteReason,
  ): boolean {
    try {
      const callbacks = this.#requiredCallbacks();
      callbacks.deleteColumns!.call(
        callbacks,
        Object.freeze([...columnIds]),
        reason,
      );
      return true;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'deleteColumns',
        cause,
      });
      return false;
    }
  }

  #preserveColumnResizeAnchor(
    session: Readonly<ColumnResizeSession>,
    delta: number,
  ): void {
    if (delta === 0) {
      return;
    }
    const layout = this.#layout;
    if (layout === null) {
      return;
    }
    const targetIsBeforeScrollAnchor = session.frozen ||
      session.targetContentOffset + session.startWidth <=
        session.initialScrollLeft;
    if (!targetIsBeforeScrollAnchor) {
      return;
    }
    const maximumLeft = Math.max(
      0,
      layout.columnWindow.totalWidth - layout.viewportWidth,
    );
    const nextLeft = Math.min(
      maximumLeft,
      Math.max(0, session.initialScrollLeft + delta),
    );
    if (nextLeft !== this.#logicalScrollLeft(maximumLeft)) {
      this.#setLogicalScrollLeft(nextLeft, maximumLeft);
    }
  }

  #canUseFillHandle(mode: FillHandleDragMode = 'copy'): boolean {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    if (
      viewModel === null ||
      callbacks === null ||
      (mode === 'copy'
        ? typeof callbacks.fillDown !== 'function'
        : typeof callbacks.fillSeries !== 'function') ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused') ||
      viewModel.selection.activeCell === null ||
      viewModel.selection.mode !== undefined
    ) {
      return false;
    }
    const ranges = viewModel.selection.ranges;
    if (ranges === undefined) {
      return true;
    }
    const activeBounds = this.#selectionBounds(viewModel.selection);
    if (activeBounds === null) {
      return false;
    }
    // A multi-range fill reuses one atomic transaction for every range. Copy
    // mode needs a top-row source in every range; series mode additionally
    // needs a second source row in every static peer. The active range may
    // start with exactly two rows because the handle drag supplies its target
    // rows before fillSeries() runs.
    return ranges.every((range) => {
      const bounds = this.#selectionBoundsForRange(range);
      if (bounds === null || bounds.lastRow <= bounds.firstRow) {
        return false;
      }
      if (mode !== 'series') {
        return true;
      }
      const isActive = bounds.firstRow === activeBounds.firstRow &&
        bounds.lastRow === activeBounds.lastRow &&
        bounds.firstColumn === activeBounds.firstColumn &&
        bounds.lastColumn === activeBounds.lastColumn;
      return isActive || bounds.lastRow - bounds.firstRow >= 2;
    });
  }

  #isFillHandleHit(
    clientX: number,
    clientY: number,
    mode: FillHandleDragMode = 'copy',
  ): boolean {
    if (!this.#canUseFillHandle(mode)) {
      return false;
    }
    const handle = this.#selectionHandleRect();
    if (handle === null) {
      return false;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    return x >= handle.x &&
      x <= handle.x + handle.width &&
      y >= handle.y &&
      y <= handle.y + handle.height;
  }

  #updateFillHandleCursor(
    clientX: number,
    clientY: number,
    mode: FillHandleDragMode = 'copy',
  ): void {
    const cursor = this.#isFillHandleHit(clientX, clientY, mode)
      ? mode === 'series' ? 'cell' : 'crosshair'
      : '';
    if (this.#scrollHost.style.cursor !== cursor) {
      this.#scrollHost.style.cursor = cursor;
    }
  }

  #beginFillHandleDrag(
    event: PointerEvent,
    address: Readonly<BomCellAddress>,
    mode: FillHandleDragMode,
  ): void {
    this.#shortcuts.clearPending();
    this.#endSelectionDrag();
    this.#endFillHandleDrag();
    if (
      event.pointerType === 'touch' ||
      !Number.isFinite(event.pointerId) ||
      !this.#canUseFillHandle(mode)
    ) {
      return;
    }
    const selection = this.#requiredViewModel().selection;
    const sourceBounds = this.#selectionBounds(selection);
    const targetColumnId = visibleColumnDefinitions(
      this.#requiredViewModel().columns,
    )[sourceBounds?.lastColumn ?? -1]?.columnId;
    if (sourceBounds === null || targetColumnId === undefined) {
      return;
    }
    this.#fillHandleDrag = Object.freeze({
      pointerId: event.pointerId,
      mode,
      lastAddress: Object.freeze({ ...address }),
      targetColumnId,
      sourceBounds,
      pointerX: event.clientX,
      pointerY: event.clientY,
      changed: false,
    });
    this.#scrollHost.style.cursor = mode === 'series' ? 'cell' : 'crosshair';
    try {
      this.#scrollHost.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable for synthetic or detached targets.
    }
  }

  #isFillHandlePointer(event: PointerEvent): boolean {
    return this.#fillHandleDrag !== null &&
      Number.isFinite(event.pointerId) &&
      this.#fillHandleDrag.pointerId === event.pointerId;
  }

  #extendFillHandleAt(clientX: number, clientY: number): void {
    const session = this.#fillHandleDrag;
    if (session === null) {
      return;
    }
    const pointerX = Number.isFinite(clientX) ? clientX : session.pointerX;
    const pointerY = Number.isFinite(clientY) ? clientY : session.pointerY;
    const row = this.#fillHandleRowFromClient(pointerY);
    if (row === undefined) {
      // Pointer capture intentionally keeps a fill drag alive outside the
      // scroll host. At a terminal/sparse layout edge, preserve the pending
      // target until a subsequent scroll frame can resolve a visible row.
      if (this.#isBelowFillHandleViewport(pointerY)) {
        this.#fillHandleDrag = Object.freeze({
          ...session,
          pointerX,
          pointerY,
        });
        return;
      }
      this.#resetFillHandleTarget(session, pointerX, pointerY);
      return;
    }
    if (row.rowIndex <= session.sourceBounds.lastRow) {
      this.#resetFillHandleTarget(session, pointerX, pointerY);
      return;
    }
    const target = Object.freeze({
      occurrenceId: row.occurrenceId,
      columnId: session.targetColumnId,
    });
    if (sameAddress(session.lastAddress, target) &&
        pointerX === session.pointerX && pointerY === session.pointerY) {
      return;
    }
    this.#fillHandleDrag = Object.freeze({
      ...session,
      lastAddress: target,
      pointerX,
      pointerY,
      changed: true,
    });
    this.#refreshInteractionForFillPreview();
  }

  #resetFillHandleTarget(
    session: Readonly<FillHandleDragSession>,
    pointerX: number,
    pointerY: number,
  ): void {
    const sourceOccurrence = this.#requiredViewModel().projection.occurrenceAt(
      session.sourceBounds.lastRow,
    );
    const sourceLastAddress = sourceOccurrence.ok &&
      sourceOccurrence.value !== undefined
      ? Object.freeze({
        occurrenceId: sourceOccurrence.value,
        columnId: session.targetColumnId,
      })
      : session.lastAddress;
    const changed = session.changed;
    this.#fillHandleDrag = Object.freeze({
      ...session,
      lastAddress: sourceLastAddress,
      pointerX,
      pointerY,
      changed: false,
    });
    if (changed) {
      this.#refreshInteractionForFillPreview();
    }
  }

  #fillHandleRowFromClient(
    clientY: number,
  ): Readonly<BomCanvasRowLayout> | undefined {
    const row = this.#rowFromClient(clientY);
    if (row !== undefined) {
      return row;
    }
    const layout = this.#layout;
    if (layout === null || !this.#isBelowFillHandleViewport(clientY)) {
      return undefined;
    }
    // A captured pointer can move beyond the virtualized overscan window.
    // Resolve it at the last visible body pixel; after each scroll frame that
    // maps to the newly visible bottom row and grows the pending fill range.
    const y = Math.max(layout.bodyTop, layout.viewportHeight - 0.5);
    return layout.rows.find((candidate) =>
      y >= candidate.y && y < candidate.y + candidate.height);
  }

  #isBelowFillHandleViewport(clientY: number): boolean {
    const layout = this.#layout;
    if (layout === null || !Number.isFinite(clientY)) {
      return false;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    return clientY - bounds.top >= layout.viewportHeight;
  }

  #scheduleFillHandleAutoScroll(): void {
    const session = this.#fillHandleDrag;
    if (
      this.#destroyed ||
      session === null ||
      this.#fillHandleAutoScrollRelease !== null
    ) {
      return;
    }
    const view = this.#document.defaultView;
    if (view === null || typeof view.requestAnimationFrame !== 'function') {
      return;
    }
    const requestId = view.requestAnimationFrame((): void => {
      const release = this.#fillHandleAutoScrollRelease;
      this.#fillHandleAutoScrollRelease = null;
      release?.();
      const current = this.#fillHandleDrag;
      if (this.#destroyed || current === null) {
        return;
      }
      if (this.#autoScrollFillHandle()) {
        const updated = this.#fillHandleDrag;
        if (updated !== null) {
          this.#extendFillHandleAt(updated.pointerX, updated.pointerY);
        }
        this.#scheduleFillHandleAutoScroll();
      }
    });
    this.#fillHandleAutoScrollRelease = this.#registry.trackAnimationFrame(
      requestId,
      (id: number): void => {
        view.cancelAnimationFrame(id);
      },
    );
  }

  #stopFillHandleAutoScroll(): void {
    const release = this.#fillHandleAutoScrollRelease;
    this.#fillHandleAutoScrollRelease = null;
    release?.();
  }

  #autoScrollFillHandle(): boolean {
    const session = this.#fillHandleDrag;
    const layout = this.#layout;
    if (session === null || layout === null) {
      return false;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    const y = session.pointerY - bounds.top;
    // Fill-down only extends below the source rectangle; moving above it must
    // not unexpectedly scroll the document upward.
    const verticalDelta = Math.max(
      0,
      edgeScrollDelta(y, layout.viewportHeight, 32, layout.bodyTop),
    );
    if (verticalDelta === 0) {
      return false;
    }
    const maximumTop = Math.max(
      0,
      layout.totalHeight - layout.bodyHeight,
    );
    const nextTop = Math.min(
      maximumTop,
      Math.max(0, this.#scrollHost.scrollTop + verticalDelta),
    );
    if (nextTop === this.#scrollHost.scrollTop) {
      return false;
    }
    this.#scrollHost.scrollTop = nextTop;
    this.#viewChanged('scroll');
    return true;
  }

  #endFillHandleDrag(pointerId?: number, commit = false): void {
    const session = this.#fillHandleDrag;
    if (
      session === null ||
      (pointerId !== undefined && session.pointerId !== pointerId)
    ) {
      return;
    }
    this.#stopFillHandleAutoScroll();
    this.#fillHandleDrag = null;
    if (this.#columnResize === null && this.#columnReorder === null) {
      this.#scrollHost.style.cursor = '';
    }
    this.#shortcuts.clearPending();
    try {
      if (this.#scrollHost.hasPointerCapture(session.pointerId)) {
        this.#scrollHost.releasePointerCapture(session.pointerId);
      }
    } catch {
      // A browser can release capture before pointerup or pointercancel arrives.
    }
    const canCommit = session.mode === 'copy'
      ? typeof this.#callbacks?.fillDown === 'function'
      : typeof this.#callbacks?.fillSeries === 'function';
    if (commit && session.changed && canCommit) {
      const target = Object.freeze({
        occurrenceId: session.lastAddress.occurrenceId,
        columnId: session.targetColumnId,
      });
      this.#invoke('select', (): void => {
        this.#requiredCallbacks().select(target, 'pointer', { extend: true });
      });
      if (session.mode === 'series') {
        this.#invoke('fillSeries', (): void => {
          const callbacks = this.#requiredCallbacks();
          callbacks.fillSeries!.call(callbacks);
        });
      } else {
        this.#invoke('fillDown', (): void => {
          const callbacks = this.#requiredCallbacks();
          callbacks.fillDown!.call(callbacks);
        });
      }
    }
  }

  #refreshInteractionForFillPreview(): void {
    this.#fullDirty.add('interaction');
    this.#scheduleRender();
  }

  #beginSelectionDrag(
    event: PointerEvent,
    address: Readonly<BomCellAddress>,
    additive: boolean,
  ): void {
    this.#shortcuts.clearPending();
    this.#endSelectionDrag();
    // A modifier click is a discrete multi-range operation. Do not keep the
    // grid in dragging scope after the click, otherwise a key pressed before
    // the synthetic/native pointerup can be consumed as a drag command.
    if (additive) {
      return;
    }
    if (event.pointerType === 'touch' || !Number.isFinite(event.pointerId)) {
      return;
    }
    const pointerId = event.pointerId;
    this.#selectionDrag = Object.freeze({
      pointerId,
      lastAddress: Object.freeze({ ...address }),
      additive,
      pointerX: event.clientX,
      pointerY: event.clientY,
      moved: false,
    });
    try {
      this.#scrollHost.setPointerCapture(pointerId);
    } catch {
      // Pointer capture can be unavailable for synthetic or detached targets.
    }
  }

  #isSelectionDragPointer(event: PointerEvent): boolean {
    return (
      this.#selectionDrag !== null &&
      Number.isFinite(event.pointerId) &&
      this.#selectionDrag.pointerId === event.pointerId
    );
  }

  #extendSelectionDragAt(clientX: number, clientY: number): void {
    const selectionDrag = this.#selectionDrag;
    if (selectionDrag === null) {
      return;
    }
    const moved = selectionDrag.moved ||
      clientX !== selectionDrag.pointerX ||
      clientY !== selectionDrag.pointerY;
    this.#selectionDrag = Object.freeze({
      ...selectionDrag,
      pointerX: clientX,
      pointerY: clientY,
      moved,
    });
    const hit = this.#hitFromClient(clientX, clientY);
    if (
      hit === null ||
      hit.target !== 'cell' ||
      sameAddress(selectionDrag.lastAddress, hit.address)
    ) {
      return;
    }
    this.#selectionDrag = Object.freeze({
      pointerId: selectionDrag.pointerId,
      lastAddress: Object.freeze({ ...hit.address }),
      additive: selectionDrag.additive,
      pointerX: clientX,
      pointerY: clientY,
      moved,
    });
    this.#invoke('select', (): void => {
      this.#requiredCallbacks().select(
        hit.address,
        'pointer',
        selectionDrag.additive
          ? { extend: true, additive: true }
          : { extend: true },
      );
    });
  }

  #scheduleSelectionAutoScroll(): void {
    if (
      this.#destroyed ||
      this.#selectionDrag === null ||
      this.#selectionDrag.moved !== true ||
      this.#selectionAutoScrollRelease !== null
    ) {
      return;
    }
    const view = this.#document.defaultView;
    if (view === null || typeof view.requestAnimationFrame !== 'function') {
      return;
    }
    const requestId = view.requestAnimationFrame((): void => {
      const release = this.#selectionAutoScrollRelease;
      this.#selectionAutoScrollRelease = null;
      release?.();
      if (this.#destroyed || this.#selectionDrag === null) {
        return;
      }
      if (this.#autoScrollSelection()) {
        const session = this.#selectionDrag;
        if (session !== null) {
          this.#extendSelectionDragAt(session.pointerX, session.pointerY);
        }
        this.#scheduleSelectionAutoScroll();
      }
    });
    this.#selectionAutoScrollRelease = this.#registry.trackAnimationFrame(
      requestId,
      (id: number): void => {
        view.cancelAnimationFrame(id);
      },
    );
  }

  #stopSelectionAutoScroll(): void {
    const release = this.#selectionAutoScrollRelease;
    this.#selectionAutoScrollRelease = null;
    release?.();
  }

  #autoScrollSelection(): boolean {
    const session = this.#selectionDrag;
    const layout = this.#layout;
    if (session === null || layout === null) {
      return false;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    const x = session.pointerX - bounds.left;
    const y = session.pointerY - bounds.top;
    const edge = 32;
    const horizontalDelta = edgeScrollDelta(x, layout.viewportWidth, edge);
    const verticalDelta = edgeScrollDelta(
      y,
      layout.viewportHeight,
      edge,
      layout.bodyTop,
    );
    if (horizontalDelta === 0 && verticalDelta === 0) {
      return false;
    }
    const maximumLeft = Math.max(
      0,
      layout.columnWindow.totalWidth - layout.viewportWidth,
    );
    const maximumTop = Math.max(
      0,
      layout.totalHeight - layout.bodyHeight,
    );
    const logicalHorizontalDelta = this.#requiredOptions().direction === 'rtl'
      ? -horizontalDelta
      : horizontalDelta;
    const nextLeft = Math.min(
      maximumLeft,
      Math.max(
        0,
        this.#logicalScrollLeft(maximumLeft) + logicalHorizontalDelta,
      ),
    );
    const nextTop = Math.min(
      maximumTop,
      Math.max(0, this.#scrollHost.scrollTop + verticalDelta),
    );
    const changed =
      nextLeft !== this.#logicalScrollLeft(maximumLeft) ||
      nextTop !== this.#scrollHost.scrollTop;
    if (!changed) {
      return false;
    }
    this.#setLogicalScrollLeft(nextLeft, maximumLeft);
    this.#scrollHost.scrollTop = nextTop;
    this.#viewChanged('scroll');
    return true;
  }

  #endSelectionDrag(pointerId?: number): void {
    const selectionDrag = this.#selectionDrag;
    if (
      selectionDrag === null ||
      (pointerId !== undefined && selectionDrag.pointerId !== pointerId)
    ) {
      return;
    }
    this.#selectionDrag = null;
    this.#stopSelectionAutoScroll();
    this.#shortcuts.clearPending();
    try {
      if (this.#scrollHost.hasPointerCapture(selectionDrag.pointerId)) {
        this.#scrollHost.releasePointerCapture(selectionDrag.pointerId);
      }
    } catch {
      // A browser can release capture before pointerup or pointercancel arrives.
    }
  }

  readonly #onDoubleClick = (event: Event): void => {
    if (this.#destroyed) {
      return;
    }
    const pointerEvent = event as MouseEvent;
    const resizeColumn = this.#columnResizeHitFromClient(
      pointerEvent.clientX,
      pointerEvent.clientY,
    );
    if (resizeColumn !== null) {
      pointerEvent.preventDefault();
      this.#autoSizeColumn(resizeColumn);
      return;
    }
    const hit = this.#hitFromClient(pointerEvent.clientX, pointerEvent.clientY);
    if (hit === null || hit.target !== 'cell') {
      return;
    }
    this.#invoke('requestEdit', (): void => {
      this.#requiredCallbacks().requestEdit(hit.address, 'pointer');
    });
  };

  readonly #onGridKeyDown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (
      this.#destroyed ||
      this.#document.activeElement !== this.#scrollHost ||
      keyboardEvent.isComposing ||
      keyboardEvent.keyCode === 229
    ) {
      return;
    }
    if (keyboardEvent.key === 'Escape' && !this.#contextMenu.hidden) {
      keyboardEvent.preventDefault();
      this.#closeContextMenu();
      return;
    }
    const dragging =
      this.#selectionDrag !== null || this.#fillHandleDrag !== null;
    const shortcutScope: BomShortcutContext = dragging ? 'dragging' : 'focused';
    const configured = this.#shortcuts.consume(keyboardEvent, shortcutScope);
    if (configured?.kind === 'pending') {
      keyboardEvent.preventDefault();
      return;
    }
    if (
      configured?.kind === 'matched' &&
      this.#dispatchConfiguredShortcut(
        configured.value,
        keyboardEvent,
        shortcutScope,
      )
    ) {
      return;
    }
    if (dragging) {
      // A drag owns the pointer gesture. Do not let an unmatched key invoke
      // the focused grid's navigation, edit, history, or clipboard paths.
      if (configured?.kind === 'matched') {
        keyboardEvent.preventDefault();
      }
      return;
    }
    const expansion = expansionShortcut(keyboardEvent);
    if (expansion !== null) {
      const expansionId = expansion ? 'tree.expand-all' : 'tree.collapse-all';
      if (!this.#shortcuts.isDefaultEnabled(expansionId)) {
        return;
      }
      const callbacks = this.#requiredCallbacks();
      if (typeof callbacks.setExpansionAll === 'function') {
        keyboardEvent.preventDefault();
        this.#invoke('setExpansionAll', () =>
          callbacks.setExpansionAll!.call(callbacks, expansion));
      }
      return;
    }
    const structuralInsert = structuralInsertShortcut(keyboardEvent);
    if (structuralInsert !== null) {
      const insertId = structuralInsert === 'child'
        ? 'tree.insert-child'
        : 'tree.insert-sibling';
      if (!this.#shortcuts.isDefaultEnabled(insertId)) {
        return;
      }
      const viewModel = this.#requiredViewModel();
      const callbacks = this.#requiredCallbacks();
      if (
        (viewModel.editState.status === 'idle' ||
          viewModel.editState.status === 'focused') &&
        viewModel.selection.mode === undefined &&
        typeof callbacks.insertSelection === 'function'
      ) {
        keyboardEvent.preventDefault();
        this.#invoke('insertSelection', () =>
          callbacks.insertSelection!.call(callbacks, structuralInsert));
      }
      return;
    }
    const structuralMove = structuralMoveShortcut(keyboardEvent);
    if (structuralMove !== null) {
      const moveId = structuralMove === 'up'
        ? 'tree.move-up'
        : structuralMove === 'down'
          ? 'tree.move-down'
          : structuralMove === 'indent'
            ? 'tree.indent'
            : 'tree.outdent';
      if (!this.#shortcuts.isDefaultEnabled(moveId)) {
        return;
      }
      const viewModel = this.#requiredViewModel();
      const callbacks = this.#requiredCallbacks();
      if (
        (viewModel.editState.status === 'idle' ||
          viewModel.editState.status === 'focused') &&
        viewModel.selection.mode === undefined &&
        typeof callbacks.moveSelection === 'function'
      ) {
        keyboardEvent.preventDefault();
        this.#invoke('moveSelection', () =>
          callbacks.moveSelection!.call(callbacks, structuralMove));
      }
      return;
    }
    if (isDeleteSubtreeShortcut(keyboardEvent)) {
      if (!this.#shortcuts.isDefaultEnabled('tree.delete-subtree')) {
        return;
      }
      const viewModel = this.#requiredViewModel();
      const callbacks = this.#requiredCallbacks();
      if (
        (viewModel.editState.status === 'idle' ||
          viewModel.editState.status === 'focused') &&
        (viewModel.selection.mode === undefined ||
          viewModel.selection.mode === 'row') &&
        typeof callbacks.deleteSubtree === 'function'
      ) {
        keyboardEvent.preventDefault();
        this.#invoke('deleteSubtree', () => callbacks.deleteSubtree!.call(callbacks));
      }
      return;
    }
    const resizeDirection = columnResizeShortcut(keyboardEvent);
    if (resizeDirection !== null) {
      const resizeId = resizeDirection < 0
        ? 'grid.resize-column-left'
        : 'grid.resize-column-right';
      if (!this.#shortcuts.isDefaultEnabled(resizeId)) {
        return;
      }
      if (this.#canResizeActiveColumn()) {
        keyboardEvent.preventDefault();
        this.#resizeActiveColumn(resizeDirection, 'keyboard');
      }
      return;
    }
    const reorderDirection = columnReorderShortcut(keyboardEvent);
    if (reorderDirection !== null) {
      const reorderId = reorderDirection < 0
        ? 'grid.reorder-column-left'
        : 'grid.reorder-column-right';
      if (!this.#shortcuts.isDefaultEnabled(reorderId)) {
        return;
      }
      if (this.#canReorderActiveColumn(reorderDirection)) {
        keyboardEvent.preventDefault();
        this.#reorderActiveColumn(reorderDirection, 'keyboard');
      }
      return;
    }
    const visibilityAction = columnVisibilityShortcut(keyboardEvent);
    if (visibilityAction !== null) {
      if (!this.#shortcuts.isDefaultEnabled(visibilityAction.id)) {
        return;
      }
      if (visibilityAction.action === 'hide' && this.#canHideActiveColumn()) {
        keyboardEvent.preventDefault();
        this.#hideActiveColumn('keyboard');
      } else if (
        visibilityAction.action === 'show-all' &&
        this.#canShowAllColumns()
      ) {
        keyboardEvent.preventDefault();
        this.#showAllColumns('keyboard');
      }
      return;
    }
    if (columnInsertShortcut(keyboardEvent) &&
      this.#shortcuts.isDefaultEnabled('grid.insert-column') &&
      this.#canInsertColumns()) {
      keyboardEvent.preventDefault();
      this.#insertColumns('before', 'keyboard');
      return;
    }
    if (columnDeleteShortcut(keyboardEvent) &&
      this.#shortcuts.isDefaultEnabled('grid.delete-column') &&
      this.#canDeleteColumns()) {
      keyboardEvent.preventDefault();
      this.#deleteColumns('keyboard');
      return;
    }
    const columnFrozen = columnFrozenShortcut(keyboardEvent);
    if (
      columnFrozen !== null &&
      this.#shortcuts.isDefaultEnabled(columnFrozen.id) &&
      this.#canSetActiveColumnFrozen()
    ) {
      keyboardEvent.preventDefault();
      this.#setActiveColumnFrozen(columnFrozen.frozen);
      return;
    }
    if (keyboardEvent.altKey) {
      return;
    }
    if (isClipboardCopyShortcut(keyboardEvent)) {
      if (!this.#shortcuts.isDefaultEnabled('grid.copy')) {
        return;
      }
      // Keep the trusted native event path available for permission-denied
      // Async Clipboard environments. #onCopy owns authorization and writing.
      if (keyboardEvent.isTrusted === true) {
        return;
      }
      // Non-browser test hosts do not synthesize a follow-up `copy` event for
      // a dispatched keydown. Preserve their explicit Async Clipboard path.
      const writeClipboard = this.#clipboardWriter();
      if (writeClipboard === null) {
        return;
      }
      keyboardEvent.preventDefault();
      const payload = this.#requestClipboardCopy();
      if (payload === null) {
        return;
      }
      this.#writeClipboardPayload(payload, writeClipboard);
      return;
    }
    if (isClipboardCutShortcut(keyboardEvent)) {
      if (!this.#shortcuts.isDefaultEnabled('grid.cut')) {
        return;
      }
      // Keep the trusted native event path available for permission-denied
      // Async Clipboard environments. #onCut owns authorization and writing.
      return;
    }
    if (isClipboardBranchCopyShortcut(keyboardEvent)) {
      if (!this.#shortcuts.isDefaultEnabled('tree.copy-branch')) {
        return;
      }
      keyboardEvent.preventDefault();
      const writeClipboard = this.#clipboardWriter();
      if (writeClipboard === null) return;
      const payload = this.#requestClipboardBranch('copy');
      if (payload !== null) this.#writeClipboardPayload(payload, writeClipboard);
      return;
    }
    if (isClipboardBranchCutShortcut(keyboardEvent)) {
      if (!this.#shortcuts.isDefaultEnabled('tree.cut-branch')) {
        return;
      }
      keyboardEvent.preventDefault();
      const writeClipboard = this.#clipboardWriter();
      if (writeClipboard === null) return;
      const payload = this.#requestClipboardBranch('cut');
      if (payload !== null) this.#writeClipboardPayload(payload, writeClipboard);
      return;
    }
    if (isSelectAllShortcut(keyboardEvent)) {
      if (!this.#shortcuts.isDefaultEnabled('grid.select-all')) {
        return;
      }
      keyboardEvent.preventDefault();
      this.#invoke('selectAll', (): void => {
        this.#requiredCallbacks().selectAll();
      });
      return;
    }
    const axisMode = selectionAxisShortcut(keyboardEvent);
    if (axisMode !== null) {
      const axisId = axisMode === 'row' ? 'grid.axis-row' : 'grid.axis-column';
      if (!this.#shortcuts.isDefaultEnabled(axisId)) {
        return;
      }
      const active = this.#requiredViewModel().selection.activeCell;
      if (active !== null) {
        keyboardEvent.preventDefault();
        this.#invoke('select', (): void => {
          this.#requiredCallbacks().select(active, 'keyboard', {
            extend: false,
            mode: axisMode,
          });
        });
      }
      return;
    }
    const historyAction = historyShortcut(keyboardEvent);
    if (historyAction !== null) {
      const historyId = historyAction === 'undo' ? 'grid.undo' : 'grid.redo';
      if (
        !this.#shortcuts.isDefaultEnabled(historyId) &&
        !this.#shortcuts.isDefaultEnabled('grid.redo-shift')
      ) {
        return;
      }
      const callbacks = this.#requiredCallbacks();
      const callback = historyAction === 'undo' ? callbacks.undo : callbacks.redo;
      if (typeof callback === 'function') {
        keyboardEvent.preventDefault();
        this.#invoke(historyAction, () => callback.call(callbacks));
      }
      return;
    }
    if (isFillDownShortcut(keyboardEvent)) {
      if (!this.#shortcuts.isDefaultEnabled('grid.fill-down')) {
        return;
      }
      const viewModel = this.#requiredViewModel();
      const callbacks = this.#requiredCallbacks();
      if (
        (viewModel.editState.status === 'idle' ||
          viewModel.editState.status === 'focused') &&
        viewModel.selection.mode === undefined &&
        typeof callbacks.fillDown === 'function'
      ) {
        keyboardEvent.preventDefault();
        this.#invoke('fillDown', () => callbacks.fillDown!.call(callbacks));
      }
      return;
    }
    if (keyboardEvent.metaKey) {
      return;
    }
    const viewModel = this.#requiredViewModel();
    if (isClearSelectionShortcut(keyboardEvent)) {
      const clearId = keyboardEvent.key === 'Backspace'
        ? 'grid.clear-backspace'
        : 'grid.clear';
      if (!this.#shortcuts.isDefaultEnabled(clearId)) {
        return;
      }
      const callbacks = this.#requiredCallbacks();
      if (
        (viewModel.editState.status === 'idle' ||
          viewModel.editState.status === 'focused') &&
        typeof callbacks.clearSelection === 'function'
      ) {
        keyboardEvent.preventDefault();
        this.#invoke('clearSelection', () =>
          callbacks.clearSelection!.call(callbacks));
      }
      return;
    }
    const active = viewModel.selection.activeCell;
    if (
      (keyboardEvent.key === ' ' || keyboardEvent.key === 'Spacebar') &&
      !keyboardEvent.ctrlKey &&
      !keyboardEvent.metaKey &&
      !keyboardEvent.shiftKey &&
      active !== null &&
      active.columnId === viewModel.columns[0]?.columnId
    ) {
      const node = viewModel.indexes.rowById.get(active.occurrenceId);
      const expandedResult = viewModel.projection.isExpanded(active.occurrenceId);
      if (
        node !== undefined &&
        isExpandable(node, viewModel.indexes.childrenByParent) &&
        expandedResult.ok
      ) {
        keyboardEvent.preventDefault();
        this.#invoke('toggleExpansion', (): void => {
          this.#requiredCallbacks().toggleExpansion(
            active,
            !expandedResult.value,
          );
        });
      }
      return;
    }
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === 'F2') {
      const editId = keyboardEvent.key === 'F2'
        ? 'grid.request-edit-f2'
        : 'grid.request-edit-enter';
      if (!this.#shortcuts.isDefaultEnabled(editId)) {
        return;
      }
      if (active !== null) {
        keyboardEvent.preventDefault();
        this.scrollToCell(active);
        this.#invoke('requestEdit', (): void => {
          this.#requiredCallbacks().requestEdit(active, 'keyboard');
        });
      }
      return;
    }
    if (
      active !== null &&
      this.#isEditableAddress(active) &&
      isReplaceEditKey(keyboardEvent)
    ) {
      keyboardEvent.preventDefault();
      this.scrollToCell(active);
      this.#invoke('requestEdit', (): void => {
        this.#requiredCallbacks().requestEdit(active, 'keyboard');
      });
      this.#invoke('draftInput', (): void => {
        this.#requiredCallbacks().draftInput(active, keyboardEvent.key, 'replace');
      });
      return;
    }

    const next = this.#keyboardDestination(keyboardEvent);
    if (next === null) {
      return;
    }
    keyboardEvent.preventDefault();
    this.scrollToCell(next);
    const extend = keyboardEvent.shiftKey === true;
    this.#invoke('select', (): void => {
      this.#requiredCallbacks().select(next, 'keyboard', {
        extend,
      });
    });
  };

  readonly #onCopy = (event: Event): void => {
    if (this.#destroyed) {
      return;
    }
    // A synthetic ClipboardEvent cannot prove that the browser Clipboard was
    // written, so it must not produce a policy decision or a false audit.
    if (event.isTrusted !== true) {
      event.preventDefault();
      return;
    }
    if (this.#document.activeElement !== this.#scrollHost) {
      return;
    }
    if (!this.#shortcuts.isDefaultEnabled('grid.copy')) {
      return;
    }
    // Block the browser's default path before any content can leave the grid.
    event.preventDefault();
    const payload = this.#requestClipboardCopy();
    if (payload === null) {
      return;
    }
    const clipboardData = (event as ClipboardEvent).clipboardData;
    if (
      clipboardData === null ||
      clipboardData === undefined ||
      typeof (clipboardData as unknown as { readonly setData?: unknown })
        .setData !== 'function'
    ) {
      this.#reportClipboardWrite(payload.id, 'event-fallback', 'failed');
      return;
    }
    try {
      writeClipboardPayloadToEvent(clipboardData, payload);
      this.#reportClipboardWrite(payload.id, 'event-fallback', 'written');
    } catch {
      this.#reportClipboardWrite(payload.id, 'event-fallback', 'failed');
    }
  };

  readonly #onCut = (event: Event): void => {
    if (this.#destroyed) {
      return;
    }
    // Synthetic ClipboardEvents cannot prove a browser user gesture. Block them
    // before requesting an editor-authorized destructive clipboard payload.
    if (event.isTrusted !== true) {
      event.preventDefault();
      return;
    }
    if (this.#document.activeElement !== this.#scrollHost) {
      return;
    }
    if (!this.#shortcuts.isDefaultEnabled('grid.cut')) {
      return;
    }
    // Block the browser's default path until the editor authorizes the cut.
    event.preventDefault();
    const payload = this.#requestClipboardCut();
    if (payload === null) {
      return;
    }
    const clipboardData = (event as ClipboardEvent).clipboardData;
    if (
      clipboardData === null ||
      clipboardData === undefined ||
      typeof (clipboardData as unknown as { readonly setData?: unknown })
        .setData !== 'function'
    ) {
      this.#reportClipboardWrite(payload.id, 'event-fallback', 'failed');
      return;
    }
    try {
      writeClipboardPayloadToEvent(clipboardData, payload);
      this.#reportClipboardWrite(payload.id, 'event-fallback', 'written');
    } catch {
      this.#reportClipboardWrite(payload.id, 'event-fallback', 'failed');
    }
  };

  readonly #onPaste = (event: Event): void => {
    if (
      this.#destroyed ||
      this.#document.activeElement !== this.#scrollHost
    ) {
      return;
    }
    // Consume the browser path before reading clipboard data into the editor.
    event.preventDefault();
    try {
      const clipboardData = (event as ClipboardEvent).clipboardData;
      if (clipboardData === null || clipboardData === undefined) {
        return;
      }
      const getData = (
        clipboardData as unknown as { readonly getData?: unknown }
      ).getData;
      if (typeof getData !== 'function') {
        return;
      }
      const declaredType = (type: string): boolean | undefined => {
        const types = (
          clipboardData as unknown as { readonly types?: unknown }
        ).types;
        if (types === undefined || types === null) {
          return undefined;
        }
        if (Array.isArray(types)) {
          return types.includes(type);
        }
        if (
          typeof (types as { readonly contains?: unknown }).contains ===
          'function'
        ) {
          return (types as { contains(value: string): boolean }).contains(type);
        }
        if (typeof (types as { readonly length?: unknown }).length === 'number') {
          const indexed = types as { readonly length: number; [index: number]: unknown };
          for (let index = 0; index < indexed.length; index += 1) {
            if (indexed[index] === type) return true;
          }
          return false;
        }
        return undefined;
      };
      const readText = (type: string): string | undefined => {
        if (declaredType(type) === false) return undefined;
        const value = getData.call(clipboardData, type);
        return typeof value === 'string' ? value : undefined;
      };
      const internal = readText(BOM_INTERNAL_CLIPBOARD_MIME);
      const html = readText('text/html');
      const rawText = readText('text/plain');
      const text = rawText === '' &&
          declaredType('text/plain') === undefined &&
          (internal !== undefined || html !== undefined)
        ? undefined
        : rawText;
      if (internal === undefined && html === undefined && text === undefined) {
        return;
      }
      this.#invoke('paste', (): void => {
        const input: BomPasteInput = Object.freeze({
          ...(internal === undefined ? {} : { internal }),
          ...(html === undefined ? {} : { html }),
          ...(text === undefined ? {} : { text }),
        });
        this.#requiredCallbacks().paste(input);
      });
    } catch {
      // Clipboard data is unavailable or unreadable; do not expose partial data.
    }
  };

  readonly #onPortalInput = (event: Event): void => {
    const address = this.#activeDraftAddress();
    if (address === null || this.#callbackPending) {
      return;
    }
    const inputEvent = event as InputEvent;
    const inputType = this.#composing
      ? 'composition'
      : classifyInputType(inputEvent.inputType);
    this.#invoke('draftInput', (): void => {
      this.#requiredCallbacks().draftInput(address, this.#portal.value, inputType);
    });
  };

  readonly #onPortalCopy = (event: Event): void => {
    if (!this.#destroyed) {
      // Portal text is an uncommitted draft. It must not bypass the editor's
      // clipboard policy through the browser's native input behavior.
      event.preventDefault();
    }
  };

  readonly #onPortalCut = (event: Event): void => {
    if (!this.#destroyed) {
      // Prevent the browser from exporting or deleting an uncommitted draft.
      event.preventDefault();
    }
  };

  readonly #onPortalKeyDown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    const address = this.#activeDraftAddress();
    if (address === null || this.#callbackPending) {
      return;
    }
    if (
      this.#composing ||
      keyboardEvent.isComposing ||
      keyboardEvent.keyCode === 229
    ) {
      return;
    }
    const configured = this.#shortcuts.consume(keyboardEvent, 'editing');
    if (configured?.kind === 'pending') {
      keyboardEvent.preventDefault();
      return;
    }
    if (
      configured?.kind === 'matched' &&
      this.#dispatchConfiguredShortcut(configured.value, keyboardEvent, 'editing')
    ) {
      return;
    }
    if (keyboardEvent.key === 'Escape') {
      if (!this.#shortcuts.isDefaultEnabled('portal.cancel')) {
        return;
      }
      keyboardEvent.preventDefault();
      this.#callbackPending = true;
      this.#invoke('cancel', (): void => {
        this.#requiredCallbacks().cancel(address);
      });
      return;
    }
    if (isPrimaryModifiedEnter(keyboardEvent)) {
      const viewModel = this.#requiredViewModel();
      if (this.#shortcuts.isDefaultEnabled('portal.fill-selection') &&
          isFillSelectionShortcut(keyboardEvent) &&
          hasFillSelectionRange(viewModel, address)) {
        keyboardEvent.preventDefault();
        this.#requestCommit(address, 'fill-selection');
      }
      return;
    }
    let reason: BomEditCommitReason | null = null;
    if (keyboardEvent.key === 'Enter') {
      if (!this.#shortcuts.isDefaultEnabled('portal.commit-enter')) {
        return;
      }
      reason = 'enter';
    } else if (keyboardEvent.key === 'Tab') {
      const id = keyboardEvent.shiftKey
        ? 'portal.commit-shift-tab'
        : 'portal.commit-tab';
      if (!this.#shortcuts.isDefaultEnabled(id)) {
        return;
      }
      reason = keyboardEvent.shiftKey ? 'shift-tab' : 'tab';
    }
    if (reason !== null) {
      keyboardEvent.preventDefault();
      this.#requestCommit(address, reason);
    }
  };

  readonly #onPortalBlur = (): void => {
    const address = this.#activeDraftAddress();
    if (
      address !== null &&
      !this.#composing &&
      !this.#callbackPending &&
      !this.#destroyed
    ) {
      this.#requestCommit(address, 'blur');
    }
  };

  readonly #onCompositionStart = (): void => {
    const address = this.#activeDraftAddress();
    if (address === null || this.#composing) {
      return;
    }
    this.#composing = true;
    this.#invoke('composition', (): void => {
      this.#requiredCallbacks().composition(address, 'start');
    });
  };

  readonly #onCompositionEnd = (): void => {
    const address = this.#activeDraftAddress();
    if (address === null || !this.#composing) {
      return;
    }
    this.#composing = false;
    this.#invoke('composition', (): void => {
      this.#requiredCallbacks().composition(address, 'end');
    });
  };

  #dispatchConfiguredShortcut(
    match: Readonly<BomShortcutMatch>,
    event: KeyboardEvent,
    scope: BomShortcutContext,
  ): boolean {
    const binding = match.binding;
    const prevent = (): void => {
      if (binding.preventDefault !== false) {
        event.preventDefault();
      }
    };
    const viewModel = this.#requiredViewModel();
    const callbacks = this.#requiredCallbacks();
    switch (match.command) {
      case 'copy': {
        if (scope !== 'focused') return false;
        if (
          binding.id === 'grid.copy' &&
          this.#shortcuts.isDefaultEnabled('grid.copy') &&
          event.isTrusted === true
        ) {
          // The default Ctrl/Cmd+C must reach the trusted native `copy`
          // event. Async Clipboard may be present but denied by browser policy.
          return false;
        }
        const writeClipboard = this.#clipboardWriter();
        prevent();
        // A configured copy binding cannot safely fall through to the
        // browser's native event: the event may export semantic DOM text
        // without passing the editor policy. Keep the stroke consumed when
        // Async Clipboard is unavailable; the default binding still uses the
        // trusted native fallback in #onCopy below.
        if (writeClipboard === null) return true;
        const payload = this.#requestClipboardCopy();
        if (payload !== null) {
          this.#writeClipboardPayload(payload, writeClipboard);
        }
        return true;
      }
      case 'cut':
        // A trusted native cut event is the only safe destructive path. A
        // custom binding cannot forge it, so consume the stroke rather than
        // falling through to a browser default that bypasses policy.
        prevent();
        return true;
      case 'copy-branch': {
        if (scope !== 'focused') return false;
        prevent();
        const writeClipboard = this.#clipboardWriter();
        // Branch copy has no matching native browser event. If Async
        // Clipboard is unavailable, consume the command without exporting
        // semantic DOM text or bypassing the editor policy.
        if (writeClipboard === null || typeof callbacks.copyBranch !== 'function') {
          return true;
        }
        const payload = this.#requestClipboardBranch('copy');
        if (payload !== null) {
          this.#writeClipboardPayload(payload, writeClipboard);
        }
        return true;
      }
      case 'cut-branch': {
        if (scope !== 'focused') return false;
        prevent();
        const writeClipboard = this.#clipboardWriter();
        // A branch cut is an independent command. It can only use the
        // trusted key gesture's Async Clipboard write; it never falls back to
        // the ordinary cell cut event or to deleteSubtree directly.
        if (writeClipboard === null || typeof callbacks.cutBranch !== 'function') {
          return true;
        }
        const payload = this.#requestClipboardBranch('cut');
        if (payload !== null) {
          this.#writeClipboardPayload(payload, writeClipboard);
        }
        return true;
      }
      case 'select-all':
        if (scope !== 'focused') return false;
        prevent();
        this.#invoke('selectAll', (): void => callbacks.selectAll());
        return true;
      case 'select-row':
      case 'select-column': {
        if (scope !== 'focused') return false;
        const active = viewModel.selection.activeCell;
        if (active === null) return false;
        prevent();
        this.#invoke('select', (): void => callbacks.select(active, 'keyboard', {
          extend: false,
          mode: match.command === 'select-row' ? 'row' : 'column',
        }));
        return true;
      }
      case 'undo':
      case 'redo': {
        if (scope !== 'focused') return false;
        const callback = match.command === 'undo' ? callbacks.undo : callbacks.redo;
        if (typeof callback !== 'function') return false;
        prevent();
        this.#invoke(match.command, () => callback.call(callbacks));
        return true;
      }
      case 'clear-selection':
        if (
          scope !== 'focused' ||
          (viewModel.editState.status !== 'idle' &&
            viewModel.editState.status !== 'focused') ||
          typeof callbacks.clearSelection !== 'function'
        ) return false;
        prevent();
        this.#invoke('clearSelection', () => callbacks.clearSelection!.call(callbacks));
        return true;
      case 'fill-down':
        if (
          scope !== 'focused' ||
          (viewModel.editState.status !== 'idle' &&
            viewModel.editState.status !== 'focused') ||
          viewModel.selection.mode !== undefined ||
          typeof callbacks.fillDown !== 'function'
        ) return false;
        prevent();
        this.#invoke('fillDown', () => callbacks.fillDown!.call(callbacks));
        return true;
      case 'fill-series':
        if (
          scope !== 'focused' ||
          (viewModel.editState.status !== 'idle' && viewModel.editState.status !== 'focused') ||
          viewModel.selection.mode !== undefined ||
          typeof callbacks.fillSeries !== 'function'
        ) return false;
        prevent();
        this.#invoke('fillSeries', () => callbacks.fillSeries!.call(callbacks));
        return true;
      case 'delete-subtree':
        if (
          scope !== 'focused' ||
          (viewModel.editState.status !== 'idle' &&
            viewModel.editState.status !== 'focused') ||
          (viewModel.selection.mode !== undefined &&
            viewModel.selection.mode !== 'row') ||
          typeof callbacks.deleteSubtree !== 'function'
        ) return false;
        prevent();
        this.#invoke('deleteSubtree', () => callbacks.deleteSubtree!.call(callbacks));
        return true;
      case 'insert-sibling':
      case 'insert-child': {
        if (
          scope !== 'focused' ||
          (viewModel.editState.status !== 'idle' &&
            viewModel.editState.status !== 'focused') ||
          viewModel.selection.mode !== undefined ||
          typeof callbacks.insertSelection !== 'function'
        ) return false;
        prevent();
        const mode: BomTreeInsertMode = match.command === 'insert-child'
          ? 'child'
          : 'sibling';
        this.#invoke('insertSelection', () =>
          callbacks.insertSelection!.call(callbacks, mode));
        return true;
      }
      case 'expand-all':
      case 'collapse-all':
        if (scope !== 'focused' || typeof callbacks.setExpansionAll !== 'function') {
          return false;
        }
        prevent();
        this.#invoke('setExpansionAll', () =>
          callbacks.setExpansionAll!.call(callbacks, match.command === 'expand-all'));
        return true;
      case 'move-up':
      case 'move-down':
      case 'indent':
      case 'outdent': {
        if (
          scope !== 'focused' ||
          (viewModel.editState.status !== 'idle' &&
            viewModel.editState.status !== 'focused') ||
          viewModel.selection.mode !== undefined ||
          typeof callbacks.moveSelection !== 'function'
        ) return false;
        prevent();
        const direction: BomTreeMoveDirection = match.command === 'move-up'
          ? 'up'
          : match.command === 'move-down'
            ? 'down'
            : match.command === 'indent'
              ? 'indent'
              : 'outdent';
        this.#invoke('moveSelection', () => callbacks.moveSelection!.call(
          callbacks,
          direction,
        ));
        return true;
      }
      case 'resize-column-left':
      case 'resize-column-right': {
        if (scope !== 'focused') return false;
        const direction = match.command === 'resize-column-left' ? -1 : 1;
        if (!this.#canResizeActiveColumn()) return false;
        prevent();
        this.#resizeActiveColumn(direction, 'keyboard');
        return true;
      }
      case 'reorder-column-left':
      case 'reorder-column-right': {
        if (scope !== 'focused') return false;
        const direction = match.command === 'reorder-column-left' ? -1 : 1;
        if (!this.#canReorderActiveColumn(direction)) return false;
        prevent();
        this.#reorderActiveColumn(direction, 'keyboard');
        return true;
      }
      case 'hide-column':
        if (scope !== 'focused' || !this.#canHideActiveColumn()) return false;
        prevent();
        this.#hideActiveColumn('keyboard');
        return true;
      case 'show-all-columns':
        if (scope !== 'focused' || !this.#canShowAllColumns()) return false;
        prevent();
        this.#showAllColumns('keyboard');
        return true;
      case 'insert-column':
        if (scope !== 'focused' || !this.#canInsertColumns()) return false;
        prevent();
        this.#insertColumns('before', 'keyboard');
        return true;
      case 'delete-column':
        if (scope !== 'focused' || !this.#canDeleteColumns()) return false;
        prevent();
        this.#deleteColumns('keyboard');
        return true;
      case 'freeze-column-start':
      case 'freeze-column-end':
      case 'unfreeze-column': {
        if (scope !== 'focused' || !this.#canSetActiveColumnFrozen()) {
          return false;
        }
        prevent();
        const frozen = match.command === 'freeze-column-start'
          ? 'start'
          : match.command === 'freeze-column-end'
            ? 'end'
            : false;
        this.#setActiveColumnFrozen(frozen);
        return true;
      }
      case 'request-edit': {
        if (scope !== 'focused') return false;
        const active = viewModel.selection.activeCell;
        if (active === null) return false;
        prevent();
        this.scrollToCell(active);
        this.#invoke('requestEdit', (): void => callbacks.requestEdit(active, 'keyboard'));
        return true;
      }
      case 'cancel-edit': {
        if (scope !== 'editing') return false;
        const address = this.#activeDraftAddress();
        if (address === null) return false;
        prevent();
        this.#callbackPending = true;
        this.#invoke('cancel', (): void => callbacks.cancel(address));
        return true;
      }
      case 'fill-selection': {
        if (scope !== 'editing') return false;
        const address = this.#activeDraftAddress();
        if (address === null || !hasFillSelectionRange(viewModel, address)) return false;
        prevent();
        this.#requestCommit(address, 'fill-selection');
        return true;
      }
      case 'commit-enter':
      case 'commit-tab':
      case 'commit-shift-tab': {
        if (scope !== 'editing') return false;
        const address = this.#activeDraftAddress();
        if (address === null) return false;
        prevent();
        const reason = match.command === 'commit-enter'
          ? 'enter'
          : match.command === 'commit-shift-tab'
            ? 'shift-tab'
            : 'tab';
        this.#requestCommit(address, reason);
        return true;
      }
      default: {
        const callback = this.#requiredOptions().onShortcut;
        if (callback === undefined) {
          // A configured command owns its stroke even when no host handler is
          // installed; otherwise it could accidentally fall through to a
          // different built-in action on the same key.
          prevent();
          return true;
        }
        prevent();
        try {
          callback(Object.freeze({
            bindingId: binding.id,
            command: match.command,
            scope,
            sequence: match.sequence,
            event,
          }));
        } catch (cause) {
          this.#report({
            code: 'BOM_RENDERER_SHORTCUT_FAILED',
            bindingId: binding.id,
            cause,
          });
        }
        return true;
      }
    }
  }

  #requestClipboardCopy(): Readonly<BomCanvasClipboardPayload> | null {
    try {
      return this.#requiredCallbacks().copy();
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'copy',
        cause,
      });
      return null;
    }
  }

  #requestClipboardCut(): Readonly<BomCanvasClipboardPayload> | null {
    try {
      const callbacks = this.#requiredCallbacks();
      const cut = callbacks.cut;
      return typeof cut === 'function' ? cut.call(callbacks) : null;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: 'cut',
        cause,
      });
      return null;
    }
  }

  #requestClipboardBranch(
    operation: 'copy' | 'cut',
  ): Readonly<BomCanvasClipboardPayload> | null {
    try {
      const callbacks = this.#requiredCallbacks();
      const callback = operation === 'copy'
        ? callbacks.copyBranch
        : callbacks.cutBranch;
      return typeof callback === 'function' ? callback.call(callbacks) : null;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback: operation === 'copy' ? 'copyBranch' : 'cutBranch',
        cause,
      });
      return null;
    }
  }

  #writeClipboardPayload(
    payload: Readonly<BomCanvasClipboardPayload>,
    writeClipboard: (
      payload: Readonly<BomCanvasClipboardPayload>,
    ) => Promise<void>,
  ): void {
    try {
      void Promise.resolve(writeClipboard(payload)).then(
        (): void => {
          if (!this.#destroyed) {
            this.#reportClipboardWrite(payload.id, 'async', 'written');
          }
        },
        (): void => {
          if (!this.#destroyed) {
            this.#reportClipboardWrite(payload.id, 'async', 'failed');
          }
        },
      );
    } catch {
      this.#reportClipboardWrite(payload.id, 'async', 'failed');
    }
  }

  #clipboardWriter(): (
    (payload: Readonly<BomCanvasClipboardPayload>) => Promise<void>
  ) | null {
    const view = this.#document.defaultView;
    if (view === null) {
      return null;
    }
    try {
      const clipboard = view.navigator?.clipboard;
      const write = clipboard?.write;
      const clipboardItem = (view as unknown as {
        readonly ClipboardItem?: unknown;
      }).ClipboardItem;
      const blob = (view as unknown as { readonly Blob?: unknown }).Blob;
      if (
        typeof write === 'function' &&
        typeof clipboardItem === 'function' &&
        typeof blob === 'function'
      ) {
        return (payload: Readonly<BomCanvasClipboardPayload>): Promise<void> => {
          const BlobConstructor = blob as {
            new (parts?: readonly unknown[], options?: { readonly type?: string }): Blob;
          };
          const ClipboardItemConstructor = clipboardItem as {
            new (items: Record<string, Blob>): ClipboardItem;
          };
          const items: Record<string, Blob> = {
            'text/plain': new BlobConstructor([payload.text], {
              type: 'text/plain',
            }),
          };
          if (payload.html !== undefined) {
            items['text/html'] = new BlobConstructor([payload.html], {
              type: 'text/html',
            });
          }
          if (payload.internal !== undefined) {
            items[BOM_INTERNAL_CLIPBOARD_MIME] = new BlobConstructor(
              [payload.internal],
              { type: BOM_INTERNAL_CLIPBOARD_MIME },
            );
          }
          const item = new ClipboardItemConstructor(items);
          return (write as (items: readonly ClipboardItem[]) => Promise<void>)
            .call(clipboard, [item]);
        };
      }
      const writeText = clipboard?.writeText;
      if (typeof writeText !== 'function') {
        return null;
      }
      return (payload: Readonly<BomCanvasClipboardPayload>): Promise<void> =>
        writeText.call(clipboard, payload.text);
    } catch {
      return null;
    }
  }

  #reportClipboardWrite(
    id: string,
    method: 'async' | 'event-fallback',
    outcome: 'written' | 'failed',
  ): void {
    this.#invoke('clipboardWrite', (): void => {
      this.#requiredCallbacks().clipboardWrite(id, method, outcome);
    });
  }

  #canResizeActiveColumn(): boolean {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    const active = viewModel?.selection.activeCell;
    return viewModel !== null &&
      callbacks !== null &&
      active !== null &&
      active !== undefined &&
      viewModel.selection.mode === undefined &&
      (viewModel.editState.status === 'idle' ||
        viewModel.editState.status === 'focused') &&
      typeof callbacks.resizeColumn === 'function' &&
      viewModel.columns.some((column) =>
        column.columnId === active.columnId && column.visible !== false);
  }

  #resizeActiveColumn(
    direction: -1 | 1,
    reason: 'keyboard',
  ): void {
    const viewModel = this.#requiredViewModel();
    const callbacks = this.#requiredCallbacks();
    const active = viewModel.selection.activeCell;
    if (
      active === null ||
      viewModel.selection.mode !== undefined ||
      typeof callbacks.resizeColumn !== 'function' ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused')
    ) {
      return;
    }
    const column = viewModel.columns.find(
      (candidate) => candidate.columnId === active.columnId,
    );
    if (column === undefined || column.visible === false) {
      return;
    }
    const width = clampColumnWidth(
      column.width + direction * DEFAULT_COLUMN_RESIZE_STEP,
      column,
    );
    if (width === column.width) {
      return;
    }
    if (this.#callColumnResize(column.columnId, width, reason)) {
      this.#viewChanged('columns');
    }
  }

  #canReorderActiveColumn(direction: -1 | 1): boolean {
    const viewModel = this.#viewModel;
    const callbacks = this.#callbacks;
    const active = viewModel?.selection.activeCell;
    if (
      viewModel === null ||
      callbacks === null ||
      active === null ||
      active === undefined ||
      viewModel.selection.mode !== undefined ||
      (viewModel.editState.status !== 'idle' &&
        viewModel.editState.status !== 'focused') ||
      typeof callbacks.reorderColumns !== 'function'
    ) {
      return false;
    }
    const visibleColumns = visibleColumnDefinitions(viewModel.columns);
    const sourceIndex = visibleColumns.findIndex(
      (column) => column.columnId === active.columnId,
    );
    const targetIndex = sourceIndex + direction;
    if (
      sourceIndex <= 0 ||
      targetIndex <= 0 ||
      targetIndex >= visibleColumns.length
    ) {
      return false;
    }
    return columnReorderGroup(visibleColumns[sourceIndex]!) ===
      columnReorderGroup(visibleColumns[targetIndex]!);
  }

  #reorderActiveColumn(
    direction: -1 | 1,
    reason: 'keyboard',
  ): void {
    const viewModel = this.#requiredViewModel();
    const active = viewModel.selection.activeCell;
    if (active === null || !this.#canReorderActiveColumn(direction)) {
      return;
    }
    const visibleColumns = visibleColumnDefinitions(viewModel.columns);
    const sourceIndex = visibleColumns.findIndex(
      (column) => column.columnId === active.columnId,
    );
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= visibleColumns.length) {
      return;
    }
    const order = viewModel.columns.map((column) => column.columnId);
    const sourceColumn = visibleColumns[sourceIndex]?.columnId;
    const targetColumn = visibleColumns[targetIndex]?.columnId;
    if (sourceColumn === undefined || targetColumn === undefined) {
      return;
    }
    const sourceOrderIndex = order.indexOf(sourceColumn);
    const targetOrderIndex = order.indexOf(targetColumn);
    if (sourceOrderIndex < 0 || targetOrderIndex < 0) {
      return;
    }
    order[sourceOrderIndex] = targetColumn;
    order[targetOrderIndex] = sourceColumn;
    if (this.#callColumnReorder(order, reason)) {
      this.#viewChanged('columns');
    }
  }

  #keyboardDestination(event: KeyboardEvent): Readonly<BomCellAddress> | null {
    const viewModel = this.#requiredViewModel();
    const columns = visibleColumnDefinitions(viewModel.columns);
    if (columns.length === 0 || viewModel.projection.visibleCount === 0) {
      return null;
    }
    const active = viewModel.selection.activeCell;
    let rowIndex = 0;
    let columnIndex = 0;
    if (active !== null) {
      const rowResult = viewModel.projection.indexOf(active.occurrenceId);
      if (rowResult.ok && rowResult.value !== undefined) {
        rowIndex = rowResult.value;
      }
      const activeColumn = columns.findIndex(
        (column) => column.columnId === active.columnId,
      );
      if (activeColumn >= 0) {
        columnIndex = activeColumn;
      }
    }

    const pageRows = Math.max(
      1,
      Math.floor(
        Math.max(
          0,
          this.#measureHeight() - this.#requiredOptions().headerHeight,
        ) / viewModel.projection.defaultRowHeight,
      ),
    );
    switch (event.key) {
      case 'ArrowUp':
        rowIndex -= 1;
        break;
      case 'ArrowDown':
        rowIndex += 1;
        break;
      case 'ArrowLeft':
        columnIndex += this.#requiredOptions().direction === 'rtl' ? 1 : -1;
        break;
      case 'ArrowRight':
        columnIndex += this.#requiredOptions().direction === 'rtl' ? -1 : 1;
        break;
      case 'Home':
        if (event.ctrlKey) {
          rowIndex = 0;
        }
        columnIndex = 0;
        break;
      case 'End':
        if (event.ctrlKey) {
          rowIndex = viewModel.projection.visibleCount - 1;
        }
        columnIndex = columns.length - 1;
        break;
      case 'PageUp':
        rowIndex -= pageRows;
        break;
      case 'PageDown':
        rowIndex += pageRows;
        break;
      default:
        return null;
    }
    rowIndex = Math.min(
      viewModel.projection.visibleCount - 1,
      Math.max(0, rowIndex),
    );
    columnIndex = Math.min(
      columns.length - 1,
      Math.max(0, columnIndex),
    );
    const occurrenceResult = viewModel.projection.occurrenceAt(rowIndex);
    if (!occurrenceResult.ok || occurrenceResult.value === undefined) {
      return null;
    }
    return Object.freeze({
      occurrenceId: occurrenceResult.value,
      columnId: columns[columnIndex]!.columnId,
    });
  }

  #isEditableAddress(address: Readonly<BomCellAddress>): boolean {
    const column = this.#requiredViewModel().columns.find(
      (candidate) => candidate.columnId === address.columnId,
    );
    return column?.visible !== false && column?.editable === true;
  }

  #requestCommit(
    address: Readonly<BomCellAddress>,
    reason: BomEditCommitReason,
  ): void {
    this.#callbackPending = true;
    this.#invoke('commit', (): void => {
      this.#requiredCallbacks().commit(address, reason);
    });
  }

  #hitFromClient(clientX: number, clientY: number): Readonly<BomCanvasCellHit> | null {
    const layout = this.#layout;
    const viewModel = this.#viewModel;
    if (layout === null || viewModel === null) {
      return null;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    return hitTestCanvasCell({
      x: clientX - bounds.left,
      y: clientY - bounds.top,
      rows: layout.rows,
      columnWindow: layout.columnWindow,
      treeColumnId: viewModel.columns[0]?.columnId,
      indentWidth: this.#requiredOptions().indentWidth,
      cellPadding: this.#requiredOptions().cellPadding,
      expanderSize: EXPANDER_SIZE,
      bodyTop: layout.bodyTop,
      rowHeaderWidth: this.#requiredOptions().rowHeaderWidth,
      viewportWidth: layout.viewportWidth,
      direction: this.#requiredOptions().direction,
    });
  }

  #rowFromClient(clientY: number): Readonly<BomCanvasRowLayout> | undefined {
    const layout = this.#layout;
    if (layout === null || !Number.isFinite(clientY)) return undefined;
    const bounds = this.#scrollHost.getBoundingClientRect();
    const y = clientY - bounds.top;
    return layout.rows.find((row) => y >= row.y && y < row.y + row.height);
  }

  #viewChanged(reason: BomViewChangeReason): void {
    this.#layoutDirty = true;
    this.#markAllLayersFull();
    this.#scheduleRender();
    const view = this.#buildViewState();
    this.#invoke('viewChange', (): void => {
      this.#requiredCallbacks().viewChange(view, reason);
    });
  }

  #buildViewState(): Readonly<BomViewState> {
    const viewModel = this.#requiredViewModel();
    const viewportWidth = this.#measureWidth();
    const viewportHeight = this.#measureHeight();
    const bodyHeight = Math.max(
      0,
      viewportHeight - this.#requiredOptions().headerHeight,
    );
    const windowResult = viewModel.projection.windowByOffset(
      Math.max(0, this.#scrollHost.scrollTop),
      bodyHeight,
      0,
    );
    const occurrenceIds = windowResult.ok
      ? windowResult.value.occurrenceIds
      : [];
    const common = {
      scrollLeft: this.#currentLogicalScrollLeft(),
      scrollTop: Math.max(0, this.#scrollHost.scrollTop),
      viewportWidth,
      viewportHeight,
      visibleRowCount: occurrenceIds.length,
      columns: Object.freeze(viewModel.columns.map((column) => Object.freeze({
        columnId: column.columnId,
        width: column.width,
        frozen: column.frozen,
        visible: column.visible !== false,
      }))),
      rowHeights: Object.freeze(viewModel.projection.rowHeightOverrides().map((entry) => Object.freeze({
        occurrenceId: entry.occurrenceId,
        rowHeight: entry.rowHeight,
      }))),
    };
    if (occurrenceIds.length === 0) {
      return Object.freeze(common);
    }
    return Object.freeze({
      ...common,
      firstVisibleOccurrenceId: occurrenceIds[0]!,
      lastVisibleOccurrenceId: occurrenceIds[occurrenceIds.length - 1]!,
    });
  }

  #scheduleRender(): void {
    if (this.#destroyed || this.#frameRelease !== null) {
      return;
    }
    const view = this.#document.defaultView;
    if (view === null || typeof view.requestAnimationFrame !== 'function') {
      this.#performRender();
      return;
    }
    const requestId = view.requestAnimationFrame((): void => {
      const release = this.#frameRelease;
      this.#frameRelease = null;
      release?.();
      if (!this.#destroyed) {
        try {
          this.#performRender();
        } catch (cause) {
          this.#report({
            code: 'BOM_RENDERER_RENDER_FAILED',
            cause,
          });
          this.#settleReady(false);
        }
      }
    });
    this.#frameRelease = this.#registry.trackAnimationFrame(
      requestId,
      (id: number): void => {
        view.cancelAnimationFrame(id);
      },
    );
  }

  #performRender(): void {
    if (this.#destroyed) {
      return;
    }
    this.#cellRendererMeasurements.clear();
    this.#cellRendererBudgetRemainingMs =
      this.#requiredOptions().cellRendererFrameBudgetMs;
    this.#cellRendererBudgetReported = false;
    this.#rebuildDiffIndex();
    if (this.#layoutDirty || this.#layout === null) {
      this.#rebuildLayout();
    }
    for (const layer of LAYERS) {
      this.#drawLayer(layer);
    }
    this.#syncSemantics();
    this.#syncPortal();
    this.#emitFrameCommit();
    this.#settleReady(true);
  }

  #emitFrameCommit(): void {
    const layout = this.#layout;
    const viewModel = this.#viewModel;
    const sink = this.#options?.frameCommitSink;
    if (layout === null || viewModel === null) {
      return;
    }
    this.#frameCommitSequence += 1;
    if (sink === undefined) {
      return;
    }
    const frame: Readonly<BomCanvasFrameCommit> = Object.freeze({
      protocol: BOM_CANVAS_FRAME_COMMIT_PROTOCOL,
      sequence: this.#frameCommitSequence,
      completedAtMs: globalThis.performance.now(),
      revision: viewModel.revision,
      scrollLeft: this.#currentLogicalScrollLeft(),
      scrollTop: Math.max(0, this.#scrollHost.scrollTop),
      viewport: Object.freeze({
        width: layout.viewportWidth,
        height: layout.viewportHeight,
      }),
      surface: Object.freeze({ ...layout.surface }),
    });
    try {
      sink(frame);
    } catch {
      // Evidence observers cannot interrupt rendering.
    }
  }

  #logicalScrollLeft(maximumLeft: number): number {
    const maximum = Math.max(0, maximumLeft);
    const raw = this.#scrollHost.scrollLeft;
    if (this.#requiredOptions().direction !== 'rtl') {
      return Math.min(maximum, Math.max(0, raw));
    }
    switch (this.#resolveRtlScrollBehavior(maximum)) {
      case 'negative':
        return Math.min(maximum, Math.max(0, -raw));
      case 'default':
        return Math.min(maximum, Math.max(0, maximum - raw));
      case 'reverse':
      case 'logical':
      case 'unknown':
        return Math.min(maximum, Math.max(0, raw));
    }
  }

  #currentLogicalScrollLeft(): number {
    const layout = this.#layout;
    if (layout === null) {
      return Math.max(0, this.#scrollHost.scrollLeft);
    }
    return this.#logicalScrollLeft(Math.max(
      0,
      layout.columnWindow.totalWidth - layout.viewportWidth,
    ));
  }

  #setLogicalScrollLeft(value: number, maximumLeft: number): void {
    const maximum = Math.max(0, maximumLeft);
    const logical = Math.min(maximum, Math.max(0, value));
    if (this.#requiredOptions().direction !== 'rtl') {
      this.#scrollHost.scrollLeft = logical;
      return;
    }
    switch (this.#resolveRtlScrollBehavior(maximum)) {
      case 'negative':
        this.#scrollHost.scrollLeft = -logical;
        return;
      case 'default':
        this.#scrollHost.scrollLeft = maximum - logical;
        return;
      case 'reverse':
      case 'logical':
      case 'unknown':
        this.#scrollHost.scrollLeft = logical;
    }
  }

  #resolveRtlScrollBehavior(maximumLeft: number): RtlScrollBehavior {
    if (this.#rtlScrollBehavior !== 'unknown') {
      return this.#rtlScrollBehavior;
    }
    const host = this.#scrollHost;
    if (
      maximumLeft <= 0 ||
      !Number.isFinite(host.scrollWidth) ||
      host.scrollWidth <= host.clientWidth
    ) {
      // Minimal DOM hosts may not implement native scroll geometry. Their
      // numeric scrollLeft already behaves as the renderer's logical offset.
      this.#rtlScrollBehavior = 'logical';
      return this.#rtlScrollBehavior;
    }
    const initial = host.scrollLeft;
    host.scrollLeft = 1;
    if (host.scrollLeft === 0) {
      host.scrollLeft = -1;
      this.#rtlScrollBehavior = host.scrollLeft < 0 ? 'negative' : 'default';
    } else {
      this.#rtlScrollBehavior = initial > 0 ? 'default' : 'reverse';
    }
    host.scrollLeft = initial;
    return this.#rtlScrollBehavior;
  }

  #settleReady(rendered: boolean): void {
    if (this.#readySettled) {
      return;
    }
    this.#readySettled = true;
    this.#resolveReady?.(rendered);
    this.#resolveReady = null;
  }

  #rebuildLayout(): void {
    const viewModel = this.#requiredViewModel();
    const options = this.#requiredOptions();
    const viewportWidth = this.#measureWidth();
    const viewportHeight = this.#measureHeight();
    const bodyTop = Math.min(viewportHeight, options.headerHeight);
    const bodyHeight = Math.max(0, viewportHeight - bodyTop);
    const scrollTop = Math.max(0, this.#scrollHost.scrollTop);
    const surface = calculateCanvasSurfaceLayout(
      viewportWidth,
      viewportHeight,
      options.overscanX,
      options.overscanY,
    );
    // Size the native scroll surface before normalizing browser-specific RTL
    // scrollLeft values. This keeps the logical offset stable across engines.
    const initialColumnWindow = calculateColumnWindow(
      viewModel.columns,
      0,
      viewportWidth,
      options.overscanX,
      options.rowHeaderWidth,
      options.direction,
    );
    this.#spacer.style.width = `${Math.max(
      viewportWidth,
      initialColumnWindow.totalWidth,
    )}px`;
    const maximumLeft = Math.max(
      0,
      initialColumnWindow.totalWidth - viewportWidth,
    );
    const scrollLeft = this.#logicalScrollLeft(maximumLeft);
    const columnWindow = calculateColumnWindow(
      viewModel.columns,
      scrollLeft,
      viewportWidth,
      options.overscanX,
      options.rowHeaderWidth,
      options.direction,
    );
    const ghostProjection = this.#getGhostProjection();
    const expandedStart = Math.max(0, scrollTop - options.overscanY);
    const expandedEnd = Math.min(
      ghostProjection?.totalHeight ?? viewModel.projection.totalHeight,
      scrollTop + bodyHeight + options.overscanY,
    );
    const baseStart = ghostProjection === null
      ? expandedStart
      : this.#baseOffsetForExpanded(expandedStart, ghostProjection);
    const baseEnd = ghostProjection === null
      ? expandedEnd
      : this.#baseOffsetForExpanded(expandedEnd, ghostProjection);
    const windowResult = viewModel.projection.windowByOffset(
      baseStart,
      Math.max(
        viewModel.projection.defaultRowHeight,
        baseEnd - baseStart + viewModel.projection.defaultRowHeight * 2,
      ),
      0,
    );
    if (!windowResult.ok) {
      throw new Error('BOM_RENDERER_INVALID_PROJECTION_WINDOW');
    }
    const metrics: BomCanvasRowMetric[] = [];
    for (const occurrenceId of windowResult.value.occurrenceIds) {
      const node = viewModel.indexes.rowById.get(occurrenceId);
      if (node === undefined) {
        throw new Error('BOM_RENDERER_REVISION_MISMATCH');
      }
      const rowHeightResult = viewModel.projection.rowHeightOf(occurrenceId);
      const depthResult = viewModel.projection.depthOf(occurrenceId);
      const expandedResult = viewModel.projection.isExpanded(occurrenceId);
      if (!rowHeightResult.ok || !depthResult.ok || !expandedResult.ok) {
        throw new Error('BOM_RENDERER_REVISION_MISMATCH');
      }
      metrics.push(
        Object.freeze({
          occurrenceId,
          height: rowHeightResult.value,
          depth: depthResult.value,
          expandable: isExpandable(node, viewModel.indexes.childrenByParent),
          expanded: expandedResult.value,
        }),
      );
    }
    const baseRows = calculateRowLayout(
      windowResult.value,
      metrics,
      0,
      bodyTop,
    );
    const rows = Object.freeze(baseRows.map((row) => {
      const shift = ghostProjection === null
        ? 0
        : this.#ghostCountBefore(row.rowIndex, ghostProjection) *
          ghostProjection.rowHeight;
      return Object.freeze({
        ...row,
        documentOffset: row.documentOffset + shift,
        y: row.y + shift - scrollTop,
      });
    }));
    const ghostRows = ghostProjection === null
      ? Object.freeze([] as Readonly<GhostRowLayout>[])
      : Object.freeze(
          ghostProjection.rows
            .map((placement, index) => Object.freeze({
              occurrenceId: placement.occurrenceId,
              rowIndex: placement.insertionIndex + index,
              documentOffset: placement.expandedOffset,
              x: 0,
              y: bodyTop + placement.expandedOffset - scrollTop,
              width: 0,
              height: ghostProjection.rowHeight,
              depth: placement.depth,
              expandable: false,
              expanded: false,
            }))
            .filter((row) =>
              row.y + row.height > bodyTop - options.overscanY &&
              row.y < viewportHeight + options.overscanY,
            ),
        );
    const dpr = resolveEffectiveDpr({
      cssWidth: surface.width,
      cssHeight: surface.height,
      devicePixelRatio: this.#document.defaultView?.devicePixelRatio ?? 1,
      maxDpr: options.maxDpr,
      layerCount: LAYERS.length,
      maxBackingStoreBytes: options.maxBackingStoreBytes,
    });
    const previous = this.#layout;
    this.#layout = Object.freeze({
      viewportWidth,
      viewportHeight,
      bodyTop,
      bodyHeight,
      rowHeaderLeft: options.direction === 'rtl'
        ? Math.max(0, viewportWidth - options.rowHeaderWidth)
        : 0,
      scrollableStart: options.direction === 'rtl'
        ? columnWindow.trailingFrozenWidth
        : columnWindow.frozenWidth,
      scrollableEnd: options.direction === 'rtl'
        ? viewportWidth - columnWindow.frozenWidth
        : viewportWidth - columnWindow.trailingFrozenWidth,
      surface,
      dpr,
      columnWindow,
      rows,
      ghostRows,
      totalRowCount: ghostProjection?.totalRowCount ?? viewModel.projection.visibleCount,
      totalHeight: ghostProjection?.totalHeight ?? viewModel.projection.totalHeight,
    });
    this.#layoutDirty = false;
    this.#spacer.style.height = `${Math.max(
      1,
      bodyTop + (ghostProjection?.totalHeight ?? viewModel.projection.totalHeight),
    )}px`;
    this.#sizeCanvases(surface, dpr);
    if (
      previous === null ||
      previous.surface.width !== surface.width ||
      previous.surface.height !== surface.height ||
      previous.dpr.backingWidth !== dpr.backingWidth ||
      previous.dpr.backingHeight !== dpr.backingHeight
    ) {
      this.#markAllLayersFull();
    }
  }

  #sizeCanvases(
    surface: Readonly<BomCanvasSurfaceLayout>,
    dpr: Readonly<BomDprResolution>,
  ): void {
    for (const layer of this.#layers.values()) {
      layer.canvas.style.left = `${surface.left}px`;
      layer.canvas.style.top = `${surface.top}px`;
      layer.canvas.style.width = `${surface.width}px`;
      layer.canvas.style.height = `${surface.height}px`;
      if (layer.canvas.width !== dpr.backingWidth) {
        layer.canvas.width = dpr.backingWidth;
      }
      if (layer.canvas.height !== dpr.backingHeight) {
        layer.canvas.height = dpr.backingHeight;
      }
      layer.context.setTransform(dpr.effectiveDpr, 0, 0, dpr.effectiveDpr, 0, 0);
    }
  }

  #drawLayer(layerName: BomCanvasLayer): void {
    const layer = this.#layers.get(layerName);
    const layout = this.#layout;
    if (layer === undefined || layout === null) {
      return;
    }
    const rects = this.#dirtyRects.get(layerName) ?? [];
    let full = this.#fullDirty.has(layerName);
    if (!full && rects.length > 0) {
      const dirtyArea = rects.reduce(
        (sum, rect) => sum + rect.width * rect.height,
        0,
      );
      full =
        rects.length > MAX_DIRTY_RECTS ||
        dirtyArea >=
        layout.surface.width *
          layout.surface.height *
          this.#requiredOptions().dirtyAreaFullRedrawRatio;
    }
    if (!full && rects.length === 0) {
      return;
    }
    let succeeded = false;
    try {
      if (full) {
        layer.context.clearRect(0, 0, layout.surface.width, layout.surface.height);
        this.#drawLayerContents(layerName, layer.context, layout);
      } else {
        for (const rect of rects) {
          const canvasRect = this.#toCanvasRect(rect, layout.surface);
          layer.context.save();
          layer.context.beginPath();
          layer.context.rect(
            canvasRect.x,
            canvasRect.y,
            canvasRect.width,
            canvasRect.height,
          );
          layer.context.clip();
          layer.context.clearRect(
            canvasRect.x,
            canvasRect.y,
            canvasRect.width,
            canvasRect.height,
          );
          this.#drawLayerContents(layerName, layer.context, layout);
          layer.context.restore();
        }
      }
      succeeded = true;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_DRAW_FAILED',
        layer: layerName,
        cause,
      });
    }
    if (succeeded) {
      this.#fullDirty.delete(layerName);
      this.#dirtyRects.delete(layerName);
    } else {
      this.#fullDirty.add(layerName);
    }
  }

  #drawLayerContents(
    layer: BomCanvasLayer,
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    if (layer === 'background') {
      this.#drawBackground(context, layout);
    } else if (layer === 'content') {
      this.#drawContent(context, layout);
    } else {
      this.#drawInteraction(context, layout);
    }
  }

  #drawBackground(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    const options = this.#requiredOptions();
    const theme = options.theme;
    const originX = -layout.surface.left;
    const originY = -layout.surface.top;
    context.fillStyle = theme.background;
    context.fillRect(0, 0, layout.surface.width, layout.surface.height);
    for (const row of layout.rows) {
      const rowTop = Math.max(row.y, layout.bodyTop);
      const rowBottom = row.y + row.height;
      if (rowBottom <= rowTop) {
        continue;
      }
      if (row.rowIndex % 2 === 1) {
        context.fillStyle = theme.rowAlternateBackground;
        context.fillRect(
          0,
          rowTop + originY,
          layout.surface.width,
          rowBottom - rowTop,
        );
      }
      context.fillStyle = theme.frozenBackground;
      context.fillRect(
        layout.rowHeaderLeft + originX,
        rowTop + originY,
        options.rowHeaderWidth,
        rowBottom - rowTop,
      );
      context.strokeStyle = theme.gridLine;
      context.lineWidth = 1;
      context.strokeRect(
        layout.rowHeaderLeft + originX,
        rowTop + originY,
        options.rowHeaderWidth,
        rowBottom - rowTop,
      );
      for (const column of layout.columnWindow.columns) {
        const cell = visibleCellRect(
          row,
          column,
          layout.scrollableStart,
          layout.scrollableEnd,
          layout.bodyTop,
        );
        if (cell === null) {
          continue;
        }
        if (column.frozen) {
          context.fillStyle = theme.frozenBackground;
          context.fillRect(
            cell.x + originX,
            cell.y + originY,
            cell.width,
            cell.height,
          );
        }
        context.strokeStyle = theme.gridLine;
        context.lineWidth = 1;
        context.strokeRect(
          cell.x + originX,
          cell.y + originY,
          cell.width,
          cell.height,
        );
      }
    }
    for (const row of layout.ghostRows) {
      this.#drawGhostRowBackground(context, layout, row);
    }
    context.fillStyle = theme.frozenBackground;
    context.fillRect(
      originX,
      originY,
      layout.viewportWidth,
      layout.bodyTop,
    );
    context.strokeStyle = theme.gridLine;
    context.lineWidth = 1;
    context.strokeRect(
      layout.rowHeaderLeft + originX,
      originY,
      options.rowHeaderWidth,
      layout.bodyTop,
    );
    const groupDepth = headerGroupDepth(
      this.#requiredViewModel().columns,
    );
    const groupHeight = groupDepth > 0
      ? Math.floor(layout.bodyTop / (groupDepth + 1))
      : 0;
    const leafTop = groupHeight * groupDepth;
    const scrollableStart = layout.scrollableStart;
    const scrollableEnd = layout.scrollableEnd;
    for (let groupIndex = 0; groupIndex < groupDepth; groupIndex += 1) {
      for (const segment of headerGroupSegments(
        layout.columnWindow.columns,
        groupIndex,
        scrollableStart,
        scrollableEnd,
      )) {
        context.strokeRect(
          segment.x + originX,
          groupIndex * groupHeight + originY,
          segment.width,
          groupHeight,
        );
      }
    }
    for (const column of layout.columnWindow.columns) {
      const header = visibleColumnRect(
        column,
        scrollableStart,
        scrollableEnd,
        leafTop,
        Math.max(0, layout.bodyTop - leafTop),
      );
      if (header === null) {
        continue;
      }
      context.strokeRect(
        header.x + originX,
        header.y + originY,
        header.width,
        header.height,
      );
    }
  }

  #drawGhostRowBackground(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
    row: Readonly<GhostRowLayout>,
  ): void {
    const options = this.#requiredOptions();
    const theme = options.theme;
    const originX = -layout.surface.left;
    const originY = -layout.surface.top;
    const rowTop = Math.max(row.y, layout.bodyTop);
    const rowBottom = row.y + row.height;
    if (rowBottom <= rowTop) return;
    context.save();
    context.fillStyle = theme.diffDeletedFill;
    context.fillRect(0, rowTop + originY, layout.surface.width, rowBottom - rowTop);
    context.strokeStyle = theme.diffMarker;
    context.lineWidth = 1;
    context.setLineDash([4, 3]);
    context.strokeRect(
      layout.rowHeaderLeft + originX,
      rowTop + originY,
      options.rowHeaderWidth,
      rowBottom - rowTop,
    );
    context.setLineDash([]);
    for (const column of layout.columnWindow.columns) {
      const cell = visibleCellRect(
        row,
        column,
        layout.scrollableStart,
        layout.scrollableEnd,
        layout.bodyTop,
      );
      if (cell === null) continue;
      context.strokeRect(
        cell.x + originX,
        cell.y + originY,
        cell.width,
        cell.height,
      );
    }
    context.restore();
  }

  #rebuildDiffIndex(): void {
    const viewModel = this.#viewModel;
    const diffView = viewModel?.diffView ?? null;
    if (
      diffView === null ||
      diffView.viewRevision !== viewModel?.revision ||
      diffView.documentId !== viewModel?.snapshot.documentId ||
      diffView.documentGeneration !== viewModel?.documentGeneration
    ) {
      if (this.#indexedDiffView !== null) {
        this.#indexedDiffView = null;
        this.#diffRows.clear();
        this.#diffCells.clear();
        this.#diffDeletedRows = Object.freeze([]);
        this.#diffGhostRows = EMPTY_GHOST_ROWS;
        this.#ghostProjection = null;
      }
      return;
    }
    if (this.#indexedDiffView === diffView) {
      return;
    }
    this.#indexedDiffView = diffView;
    this.#diffRows.clear();
    this.#diffCells.clear();
    this.#diffDeletedRows = Object.freeze([...(diffView.deletedRows ?? [])]);
    this.#diffGhostRows = Object.freeze([...(diffView.ghostRows ?? [])]);
    this.#ghostProjection = null;
    for (const entry of diffView.rows) {
      let kinds = this.#diffRows.get(entry.occurrenceId);
      if (kinds === undefined) {
        kinds = new Set<BomCanvasDiffKind>();
        this.#diffRows.set(entry.occurrenceId, kinds);
      }
      kinds.add(entry.kind);
    }
    for (const entry of diffView.cells) {
      const key = diffCellKey(entry.occurrenceId, entry.columnId);
      let kinds = this.#diffCells.get(key);
      if (kinds === undefined) {
        kinds = new Set<BomCanvasDiffKind>();
        this.#diffCells.set(key, kinds);
      }
      kinds.add(entry.kind);
    }
  }

  #diffKindsForRow(
    occurrenceId: string,
  ): ReadonlySet<BomCanvasDiffKind> {
    return this.#diffRows.get(occurrenceId) ?? EMPTY_DIFF_KINDS;
  }

  #diffKindsForCell(
    occurrenceId: string,
    columnId: string,
  ): ReadonlySet<BomCanvasDiffKind> {
    const rowKinds = this.#diffRows.get(occurrenceId);
    const cellKinds = this.#diffCells.get(diffCellKey(occurrenceId, columnId));
    if (rowKinds === undefined) {
      return cellKinds ?? EMPTY_DIFF_KINDS;
    }
    if (cellKinds === undefined) {
      return rowKinds;
    }
    const combined = new Set<BomCanvasDiffKind>(rowKinds);
    for (const kind of cellKinds) {
      combined.add(kind);
    }
    return combined;
  }

  #diffCellOnlyKinds(
    occurrenceId: string,
    columnId: string,
  ): ReadonlySet<BomCanvasDiffKind> {
    return this.#diffCells.get(diffCellKey(occurrenceId, columnId)) ??
      EMPTY_DIFF_KINDS;
  }

  #getGhostProjection(): Readonly<GhostRowProjection> | null {
    if (this.#ghostProjection !== null) {
      return this.#ghostProjection;
    }
    const viewModel = this.#viewModel;
    if (viewModel === null || this.#diffGhostRows.length === 0) {
      return null;
    }
    const rowHeight = viewModel.projection.defaultRowHeight;
    if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
      return null;
    }
    const placements: GhostRowPlacement[] = [];
    const seen = new Set<OccurrenceId>();
    for (let order = 0; order < this.#diffGhostRows.length; order += 1) {
      const ghost = this.#diffGhostRows[order]!;
      if (seen.has(ghost.occurrenceId)) {
        continue;
      }
      let insertionIndex: number;
      let anchorDepth: number | undefined;
      if (ghost.position === 'start') {
        insertionIndex = 0;
      } else if (ghost.position === 'end') {
        insertionIndex = viewModel.projection.visibleCount;
      } else if (ghost.anchorOccurrenceId !== undefined) {
        const anchor = viewModel.projection.indexOf(ghost.anchorOccurrenceId);
        if (!anchor.ok || anchor.value === undefined) {
          continue;
        }
        insertionIndex = ghost.position === 'before'
          ? anchor.value
          : anchor.value + 1;
        const depth = viewModel.projection.depthOf(ghost.anchorOccurrenceId);
        if (depth.ok && depth.value !== undefined) {
          anchorDepth = depth.value;
        }
      } else {
        continue;
      }
      const depth = ghost.depth ?? anchorDepth ?? 1;
      if (!Number.isSafeInteger(depth) || depth < 1 || depth > 1024) {
        continue;
      }
      seen.add(ghost.occurrenceId);
      placements.push({
        occurrenceId: ghost.occurrenceId,
        insertionIndex,
        depth,
        order,
        expandedOffset: 0,
      });
    }
    if (placements.length === 0) {
      this.#ghostProjection = null;
      return null;
    }
    placements.sort((left, right) =>
      left.insertionIndex - right.insertionIndex || left.order - right.order);
    const boundaries: GhostBoundary[] = [];
    const expandedPlacements: GhostRowPlacement[] = [];
    let previousCount = 0;
    for (let index = 0; index < placements.length;) {
      const insertionIndex = placements[index]!.insertionIndex;
      const groupStart = index;
      while (
        index < placements.length &&
        placements[index]!.insertionIndex === insertionIndex
      ) {
        index += 1;
      }
      const count = index - groupStart;
      const baseOffset = insertionIndex >= viewModel.projection.visibleCount
        ? viewModel.projection.totalHeight
        : (() => {
            const occurrence = viewModel.projection.occurrenceAt(insertionIndex);
            if (!occurrence.ok || occurrence.value === undefined) {
              return null;
            }
            const offset = viewModel.projection.offsetOf(occurrence.value);
            return offset.ok && offset.value !== undefined ? offset.value : null;
          })();
      if (baseOffset === null) {
        continue;
      }
      const start = baseOffset + previousCount * rowHeight;
      boundaries.push({ insertionIndex, baseOffset, start, count });
      for (let offset = 0; offset < count; offset += 1) {
        const placement = placements[groupStart + offset]!;
        expandedPlacements.push(Object.freeze({
          ...placement,
          expandedOffset: start + offset * rowHeight,
        }));
      }
      previousCount += count;
    }
    if (expandedPlacements.length === 0) {
      this.#ghostProjection = null;
      return null;
    }
    const projection = Object.freeze({
      rowHeight,
      rows: Object.freeze(expandedPlacements),
      boundaries: Object.freeze(boundaries.map((boundary) => Object.freeze(boundary))),
      totalHeight: viewModel.projection.totalHeight + expandedPlacements.length * rowHeight,
      totalRowCount: viewModel.projection.visibleCount + expandedPlacements.length,
    });
    this.#ghostProjection = projection;
    return projection;
  }

  #ghostCountBefore(
    rowIndex: number,
    projection = this.#getGhostProjection(),
  ): number {
    if (projection === null || projection.boundaries.length === 0) {
      return 0;
    }
    let low = 0;
    let high = projection.boundaries.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (projection.boundaries[middle]!.insertionIndex <= rowIndex) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    let count = 0;
    for (let index = 0; index < low; index += 1) {
      count += projection.boundaries[index]!.count;
    }
    return count;
  }

  #baseOffsetForExpanded(
    expandedOffset: number,
    projection: Readonly<GhostRowProjection>,
  ): number {
    const value = Math.max(0, expandedOffset);
    let previousCount = 0;
    for (const boundary of projection.boundaries) {
      const start = boundary.baseOffset + previousCount * projection.rowHeight;
      const end = start + boundary.count * projection.rowHeight;
      if (value < start) {
        return Math.max(0, value - previousCount * projection.rowHeight);
      }
      if (value < end) {
        return boundary.baseOffset;
      }
      previousCount += boundary.count;
    }
    return Math.max(
      0,
      value - previousCount * projection.rowHeight,
    );
  }

  #drawContent(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    const viewModel = this.#requiredViewModel();
    const originX = -layout.surface.left;
    const originY = -layout.surface.top;
    const options = this.#requiredOptions();
    context.font = options.theme.font;
    context.textBaseline = 'middle';
    context.fillStyle = options.theme.text;
    for (const row of layout.rows) {
      const node = viewModel.indexes.rowById.get(row.occurrenceId);
      if (node === undefined) {
        continue;
      }
      const rowTop = Math.max(row.y, layout.bodyTop);
      const rowBottom = row.y + row.height;
      if (rowBottom <= rowTop) {
        continue;
      }
      context.save();
      context.beginPath();
      context.rect(
        layout.rowHeaderLeft + originX,
        rowTop + originY,
        options.rowHeaderWidth,
        rowBottom - rowTop,
      );
      context.clip();
      context.textAlign = options.direction === 'rtl' ? 'left' : 'right';
      context.fillText(
        String(row.rowIndex + 1),
        (options.direction === 'rtl'
          ? layout.rowHeaderLeft + options.cellPadding
          : layout.rowHeaderLeft + options.rowHeaderWidth - options.cellPadding) + originX,
        row.y + row.height / 2 + originY,
        Math.max(0, options.rowHeaderWidth - options.cellPadding * 2),
      );
      context.restore();
      for (const column of layout.columnWindow.columns) {
        const cell = visibleCellRect(
          row,
          column,
          layout.scrollableStart,
          layout.scrollableEnd,
          layout.bodyTop,
        );
        if (cell === null) {
          continue;
        }
        context.save();
        context.beginPath();
        context.rect(
          cell.x + originX,
          cell.y + originY,
          cell.width,
          cell.height,
        );
        context.clip();
        if (column.columnId === viewModel.columns[0]?.columnId) {
          if (row.expandable) {
            this.#drawExpander(context, row, column, originX, originY);
          }
        }
        const bounds = this.#toCanvasRect(cell, layout.surface);
        const contentBounds = this.#cellRendererContentBounds(
          row,
          column,
          bounds,
        );
        this.#drawDiffCellFill(
          context,
          bounds,
          this.#diffKindsForCell(row.occurrenceId, column.columnId),
        );
        const custom = options.cellRenderers.get(column.columnId);
        const drewCustom = custom !== undefined && this.#drawCustomCell(
          custom,
          context,
          node,
          column.column,
          bounds,
          contentBounds,
        );
        if (!drewCustom) {
          const text = this.#cellText(node, column.column, undefined);
          context.fillStyle = options.theme.text;
          drawColumnCellText(
            context,
            text,
            column.column,
            contentBounds.x,
            contentBounds.y + contentBounds.height / 2,
            contentBounds.width,
            contentBounds.height,
            options.direction,
          );
        }
        context.restore();
      }
    }
    for (const row of layout.ghostRows) {
      this.#drawGhostRowContent(context, layout, row);
    }
    context.save();
    context.beginPath();
    context.rect(
      layout.rowHeaderLeft + originX,
      originY,
      options.rowHeaderWidth,
      layout.bodyTop,
    );
    context.clip();
    context.textAlign = 'center';
    context.fillText(
      options.labels.rowNumberHeader,
      layout.rowHeaderLeft + options.rowHeaderWidth / 2 + originX,
      layout.bodyTop / 2 + originY,
      Math.max(0, options.rowHeaderWidth - options.cellPadding * 2),
    );
    context.restore();
    context.textAlign = 'left';
    context.font = boldCanvasFont(options.theme.font);
    const groupDepth = headerGroupDepth(this.#requiredViewModel().columns);
    const groupHeight = groupDepth > 0
      ? Math.floor(layout.bodyTop / (groupDepth + 1))
      : 0;
    const leafTop = groupHeight * groupDepth;
    const scrollableStart = layout.scrollableStart;
    const scrollableEnd = layout.scrollableEnd;
    for (let groupIndex = 0; groupIndex < groupDepth; groupIndex += 1) {
      for (const segment of headerGroupSegments(
        layout.columnWindow.columns,
        groupIndex,
        scrollableStart,
        scrollableEnd,
      )) {
        if (segment.label.length === 0) continue;
        context.save();
        context.beginPath();
        context.rect(
          segment.x + originX,
          groupIndex * groupHeight + originY,
          segment.width,
          groupHeight,
        );
        context.clip();
        context.textAlign = 'center';
        context.font = options.theme.font;
        context.fillText(
          segment.label,
          segment.x + segment.width / 2 + originX,
          groupIndex * groupHeight + groupHeight / 2 + originY,
          Math.max(0, segment.width - options.cellPadding * 2),
        );
        context.restore();
      }
    }
    for (const column of layout.columnWindow.columns) {
      const header = visibleColumnRect(
        column,
        scrollableStart,
        scrollableEnd,
        leafTop,
        Math.max(0, layout.bodyTop - leafTop),
      );
      if (header === null) {
        continue;
      }
      context.save();
      context.beginPath();
      context.rect(
        header.x + originX,
        header.y + originY,
        header.width,
        header.height,
      );
      context.clip();
      context.textAlign = options.direction === 'rtl' ? 'right' : 'left';
      context.font = boldCanvasFont(options.theme.font);
      context.fillText(
        column.column.label,
        (options.direction === 'rtl'
          ? header.x + header.width - options.cellPadding
          : header.x + options.cellPadding) + originX,
        leafTop + (layout.bodyTop - leafTop) / 2 + originY,
        Math.max(0, column.width - options.cellPadding * 2),
      );
      context.restore();
    }
    context.font = options.theme.font;
  }

  #drawGhostRowContent(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
    row: Readonly<GhostRowLayout>,
  ): void {
    const options = this.#requiredOptions();
    const originX = -layout.surface.left;
    const originY = -layout.surface.top;
    const rowTop = Math.max(row.y, layout.bodyTop);
    const rowBottom = row.y + row.height;
    if (rowBottom <= rowTop) return;
    context.save();
    context.beginPath();
    context.rect(
      layout.rowHeaderLeft + originX,
      rowTop + originY,
      options.rowHeaderWidth,
      rowBottom - rowTop,
    );
    context.clip();
    context.textAlign = options.direction === 'rtl' ? 'left' : 'right';
    context.textBaseline = 'middle';
    context.font = options.theme.font;
    context.fillStyle = options.theme.diffMarker;
    context.fillText(
      '-',
      (options.direction === 'rtl'
        ? layout.rowHeaderLeft + options.cellPadding
        : layout.rowHeaderLeft + options.rowHeaderWidth - options.cellPadding) + originX,
      row.y + row.height / 2 + originY,
      Math.max(0, options.rowHeaderWidth - options.cellPadding * 2),
    );
    context.restore();
    for (const column of layout.columnWindow.columns) {
      const cell = visibleCellRect(
        row,
        column,
        layout.scrollableStart,
        layout.scrollableEnd,
        layout.bodyTop,
      );
      if (cell === null) continue;
      const canvasCell = this.#toCanvasRect(cell, layout.surface);
      context.save();
      context.beginPath();
      context.rect(
        canvasCell.x,
        canvasCell.y,
        canvasCell.width,
        canvasCell.height,
      );
      context.clip();
      context.font = options.theme.font;
      context.textBaseline = 'middle';
      context.textAlign = options.direction === 'rtl' ? 'right' : 'left';
      context.fillStyle = options.theme.diffMarker;
      if (column.columnIndex === 0) {
        const label = options.labels.diff?.deletedGhost ?? '';
        context.fillText(
          label,
          options.direction === 'rtl'
            ? canvasCell.x + canvasCell.width - options.cellPadding
            : canvasCell.x + options.cellPadding,
          canvasCell.y + canvasCell.height / 2,
          Math.max(0, canvasCell.width - options.cellPadding * 2),
        );
      }
      context.restore();
    }
  }

  #drawExpander(
    context: CanvasRenderingContext2D,
    row: Readonly<BomCanvasRowLayout>,
    column: Readonly<BomCanvasColumnLayout>,
    originX: number,
    originY: number,
  ): void {
    const options = this.#requiredOptions();
    const indent = Math.max(0, row.depth - 1) * options.indentWidth;
    const left = (options.direction === 'rtl'
      ? column.x + column.width - options.cellPadding - indent - EXPANDER_SIZE
      : column.x + options.cellPadding + indent) + originX;
    const top = row.y + (row.height - EXPANDER_SIZE) / 2 + originY;
    const middleX = left + EXPANDER_SIZE / 2;
    const middleY = top + EXPANDER_SIZE / 2;
    context.strokeStyle = options.theme.expander;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(left + 1, middleY);
    context.lineTo(left + EXPANDER_SIZE - 1, middleY);
    if (!row.expanded) {
      context.moveTo(middleX, top + 1);
      context.lineTo(middleX, top + EXPANDER_SIZE - 1);
    }
    context.stroke();
  }

  #drawDiffCellFill(
    context: CanvasRenderingContext2D,
    rect: Readonly<BomCanvasRect>,
    kinds: ReadonlySet<BomCanvasDiffKind>,
  ): void {
    if (kinds.size === 0) {
      return;
    }
    const theme = this.#requiredOptions().theme;
    context.fillStyle = kinds.has('deleted')
      ? theme.diffDeletedFill
      : kinds.has('inserted')
        ? theme.diffAddedFill
        : theme.diffChangedFill;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  #drawDiffMarkers(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    const originX = -layout.surface.left;
    const originY = -layout.surface.top;
    const options = this.#requiredOptions();
    const drawMarker = (
      rect: Readonly<BomCanvasRect>,
      kinds: ReadonlySet<BomCanvasDiffKind>,
    ): void => {
      if (kinds.size === 0 || rect.width < 4 || rect.height < 4) {
        return;
      }
      const markerX = options.direction === 'rtl'
        ? rect.x + rect.width - 5
        : rect.x + 2;
      const markerY = rect.y + rect.height / 2;
      const primary = diffPrimaryKind(kinds);
      context.save();
      context.strokeStyle = options.theme.diffMarker;
      context.lineWidth = 1.5;
      context.beginPath();
      if (primary === 'inserted') {
        context.moveTo(markerX - 3, markerY);
        context.lineTo(markerX + 3, markerY);
        context.moveTo(markerX, markerY - 3);
        context.lineTo(markerX, markerY + 3);
      } else if (primary === 'deleted') {
        context.moveTo(markerX - 3, markerY);
        context.lineTo(markerX + 3, markerY);
      } else if (primary === 'moved') {
        context.moveTo(markerX - 3, markerY + 2);
        context.lineTo(markerX, markerY - 2);
        context.lineTo(markerX + 3, markerY + 2);
      } else if (primary === 'reordered') {
        context.moveTo(markerX - 3, markerY - 2);
        context.lineTo(markerX, markerY - 4);
        context.lineTo(markerX + 3, markerY - 2);
        context.moveTo(markerX - 3, markerY + 2);
        context.lineTo(markerX, markerY + 4);
        context.lineTo(markerX + 3, markerY + 2);
      } else {
        context.strokeRect(markerX - 3, markerY - 3, 6, 6);
      }
      context.stroke();
      context.restore();
    };

    for (const row of layout.rows) {
      const rowKinds = this.#diffKindsForRow(row.occurrenceId);
      const rowTop = Math.max(row.y, layout.bodyTop);
      const rowBottom = row.y + row.height;
      if (rowBottom <= rowTop) {
        continue;
      }
      drawMarker(
        Object.freeze({
          x: layout.rowHeaderLeft + originX,
          y: rowTop + originY,
          width: options.rowHeaderWidth,
          height: rowBottom - rowTop,
        }),
        rowKinds,
      );
      for (const column of layout.columnWindow.columns) {
        const cell = visibleCellRect(
          row,
          column,
          layout.scrollableStart,
          layout.scrollableEnd,
          layout.bodyTop,
        );
        if (cell === null) {
          continue;
        }
        const kinds = this.#diffCellOnlyKinds(
          row.occurrenceId,
          column.columnId,
        );
        if (kinds.size === 0) {
          continue;
        }
        drawMarker(this.#toCanvasRect(cell, layout.surface), kinds);
      }
    }
    for (const row of layout.ghostRows) {
      const rowTop = Math.max(row.y, layout.bodyTop);
      const rowBottom = row.y + row.height;
      if (rowBottom <= rowTop) continue;
      drawMarker(
        Object.freeze({
          x: layout.rowHeaderLeft + originX,
          y: rowTop + originY,
          width: options.rowHeaderWidth,
          height: rowBottom - rowTop,
        }),
        new Set<BomCanvasDiffKind>(['deleted']),
      );
    }
    this.#drawDiffDeletionSummaries(context, layout);
  }

  #drawDiffDeletionSummaries(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    if (this.#diffDeletedRows.length === 0) return;
    const options = this.#requiredOptions();
    const originX = -layout.surface.left;
    const originY = -layout.surface.top;
    const x = layout.rowHeaderLeft + originX;
    const width = Math.max(24, layout.viewportWidth - layout.rowHeaderLeft);
    const summaryHeight = Math.min(20, Math.max(14, layout.bodyTop / 2));
    const drawn = new Set<string>();
    for (const summary of this.#diffDeletedRows) {
      const boundary = this.#diffDeletionBoundary(summary, layout);
      if (boundary === null) continue;
      const y = boundary + originY;
      if (y + summaryHeight < 0 || y > layout.surface.height) continue;
      const key = `${summary.anchorOccurrenceId ?? ''}:${summary.position}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const top = clamp(
        y - summaryHeight / 2,
        0,
        Math.max(0, layout.surface.height - summaryHeight),
      );
      const label = formatDiffDeletionSummary(
        options.labels.diff?.deletedSummary,
        summary.count,
      );
      context.save();
      context.fillStyle = options.theme.diffDeletedFill;
      context.fillRect(x, top, width, summaryHeight);
      context.strokeStyle = options.theme.diffMarker;
      context.lineWidth = 1;
      context.setLineDash([4, 3]);
      context.beginPath();
      context.moveTo(x, top + summaryHeight / 2);
      context.lineTo(x + width, top + summaryHeight / 2);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.rect(x, top, width, summaryHeight);
      context.clip();
      context.font = options.theme.font;
      context.textBaseline = 'middle';
      context.textAlign = options.direction === 'rtl' ? 'right' : 'left';
      context.fillStyle = options.theme.diffMarker;
      context.fillText(
        label,
        options.direction === 'rtl'
          ? x + width - options.cellPadding
          : x + options.cellPadding,
        top + summaryHeight / 2,
        Math.max(0, width - options.cellPadding * 2),
      );
      context.restore();
    }
  }

  #diffDeletionBoundary(
    summary: Readonly<BomCanvasDiffDeletionSummary>,
    layout: Readonly<RendererLayout>,
  ): number | null {
    const viewModel = this.#requiredViewModel();
    if (summary.position === 'start') return layout.bodyTop;
    if (summary.position === 'end') {
      return layout.bodyTop + layout.totalHeight;
    }
    if (summary.anchorOccurrenceId === undefined) return null;
    const mounted = layout.rows.find(
      (row) => row.occurrenceId === summary.anchorOccurrenceId,
    );
    if (mounted !== undefined) {
      return summary.position === 'before'
        ? mounted.y
        : mounted.y + mounted.height;
    }
    const offset = viewModel.projection.offsetOf(summary.anchorOccurrenceId);
    const height = viewModel.projection.rowHeightOf(summary.anchorOccurrenceId);
    if (!offset.ok || offset.value === undefined ||
        !height.ok || height.value === undefined) {
      return null;
    }
    const visibleIndex = viewModel.projection.indexOf(summary.anchorOccurrenceId);
    const ghostProjection = this.#getGhostProjection();
    const shift = visibleIndex.ok && visibleIndex.value !== undefined &&
      ghostProjection !== null
      ? this.#ghostCountBefore(
          summary.position === 'before'
            ? visibleIndex.value
            : visibleIndex.value + 1,
          ghostProjection,
        ) * ghostProjection.rowHeight
      : 0;
    return layout.bodyTop + offset.value + shift +
      (summary.position === 'before' ? 0 : height.value) -
      this.#scrollHost.scrollTop;
  }

  #drawInteraction(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    const selection = this.#requiredViewModel().selection;
    const active = selection.activeCell;
    this.#drawSelectionRange(context, layout, selection);
    this.#drawFillPreview(context, layout);
    this.#drawAxisHeaders(context, layout, selection);
    if (active !== null) {
      const rect = this.#cellRect(active);
      if (rect !== null) {
        const canvasRect = this.#toCanvasRect(rect, layout.surface);
        context.fillStyle = this.#requiredOptions().theme.activeCellFill;
        context.fillRect(
          canvasRect.x,
          canvasRect.y,
          canvasRect.width,
          canvasRect.height,
        );
        context.strokeStyle = this.#requiredOptions().theme.activeCell;
        context.lineWidth = 2;
        context.strokeRect(
          canvasRect.x + 1,
          canvasRect.y + 1,
          Math.max(0, canvasRect.width - 2),
          Math.max(0, canvasRect.height - 2),
        );
        const handle = this.#selectionHandleRect();
        if (handle !== null) {
          const handleRect = this.#toCanvasRect(handle, layout.surface);
          context.fillStyle = this.#requiredOptions().theme.activeCell;
          context.fillRect(
            handleRect.x,
            handleRect.y,
            handleRect.width,
            handleRect.height,
          );
        }
      }
    }
    this.#drawDiffMarkers(context, layout);
    this.#drawColumnReorderIndicator(context, layout);
    this.#drawTreeMovePreview(context, layout);
  }

  #drawColumnReorderIndicator(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    const session = this.#columnReorder;
    if (session === null) {
      return;
    }
    const color = this.#requiredOptions().theme.activeCell;
    if (session.indicatorX !== null) {
      const marker = this.#toCanvasRect(
        Object.freeze({
          x: session.indicatorX - 1,
          y: 0,
          width: 2,
          height: layout.bodyTop,
        }),
        layout.surface,
      );
      context.fillStyle = color;
      context.fillRect(marker.x, marker.y, marker.width, marker.height);
      context.beginPath();
      context.moveTo(marker.x - 4, marker.y + 1);
      context.lineTo(marker.x + marker.width + 4, marker.y + 1);
      context.lineTo(marker.x + marker.width / 2, marker.y + 7);
      context.closePath();
      context.fill();
    }
    if (session.dragClientX === null || session.dragClientY === null) {
      return;
    }
    const column = this.#requiredViewModel().columns.find(
      (candidate) => candidate.columnId === session.columnId,
    );
    if (column === undefined) {
      return;
    }
    const bounds = this.#scrollHost.getBoundingClientRect();
    const x = clamp(
      session.dragClientX - bounds.left - session.dragOffsetX,
      -session.columnWidth + 24,
      layout.viewportWidth - 24,
    );
    const y = clamp(
      session.dragClientY - bounds.top - session.dragOffsetY,
      -layout.bodyTop + 8,
      layout.viewportHeight - 8,
    );
    const ghost = this.#toCanvasRect(
      Object.freeze({
        x,
        y,
        width: session.columnWidth,
        height: layout.bodyTop,
      }),
      layout.surface,
    );
    const options = this.#requiredOptions();
    context.save();
    context.globalAlpha = 0.16;
    context.fillStyle = '#000000';
    context.fillRect(ghost.x + 3, ghost.y + 3, ghost.width, ghost.height);
    context.globalAlpha = 0.9;
    context.fillStyle = options.theme.frozenBackground;
    context.fillRect(ghost.x, ghost.y, ghost.width, ghost.height);
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(ghost.x + 0.5, ghost.y + 0.5, ghost.width - 1, ghost.height - 1);
    context.beginPath();
    context.rect(ghost.x, ghost.y, ghost.width, ghost.height);
    context.clip();
    context.font = options.theme.font;
    context.textBaseline = 'middle';
    context.fillStyle = options.theme.text;
    context.fillText(
      column.label,
      ghost.x + options.cellPadding,
      ghost.y + ghost.height / 2,
      Math.max(0, ghost.width - options.cellPadding * 2),
    );
    context.restore();
  }

  #drawTreeMovePreview(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    const session = this.#treeMove;
    if (session === null || !session.moved) return;
    const viewModel = this.#requiredViewModel();
    const options = this.#requiredOptions();
    const bounds = this.#scrollHost.getBoundingClientRect();
    const source = viewModel.indexes.rowById.get(session.occurrenceId);
    const sourceColumn = visibleColumnDefinitions(viewModel.columns)[0];
    const ghostHeight = Math.min(32, Math.max(20, layout.bodyHeight));
    const ghostX = layout.rowHeaderLeft;
    const ghostWidth = Math.max(24, layout.viewportWidth - ghostX);
    const ghostY = clamp(
      session.pointerY - bounds.top - ghostHeight / 2,
      layout.bodyTop,
      Math.max(layout.bodyTop, layout.viewportHeight - ghostHeight),
    );
    const ghost = this.#toCanvasRect(
      Object.freeze({
        x: ghostX,
        y: ghostY,
        width: ghostWidth,
        height: ghostHeight,
      }),
      layout.surface,
    );
    context.save();
    context.globalAlpha = 0.18;
    context.fillStyle = '#000000';
    context.fillRect(ghost.x + 3, ghost.y + 3, ghost.width, ghost.height);
    context.globalAlpha = 0.9;
    context.fillStyle = options.theme.frozenBackground;
    context.fillRect(ghost.x, ghost.y, ghost.width, ghost.height);
    context.strokeStyle = options.theme.activeCell;
    context.lineWidth = 1;
    context.strokeRect(ghost.x + 0.5, ghost.y + 0.5, ghost.width - 1, ghost.height - 1);
    if (source !== undefined && sourceColumn !== undefined) {
      context.beginPath();
      context.rect(ghost.x, ghost.y, ghost.width, ghost.height);
      context.clip();
      context.font = options.theme.font;
      context.textBaseline = 'middle';
      context.fillStyle = options.theme.text;
      const sourceLabel = this.#cellText(source, sourceColumn, undefined);
      const ghostLabel = session.occurrenceIds.length > 1
        ? `${sourceLabel} (+${session.occurrenceIds.length - 1})`
        : sourceLabel;
      context.fillText(
        ghostLabel,
        ghost.x + options.cellPadding,
        ghost.y + ghost.height / 2,
        Math.max(0, ghost.width - options.cellPadding * 2),
      );
    }
    context.restore();

    if (
      session.targetOccurrenceId === null ||
      session.position === null
    ) {
      return;
    }
    const target = layout.rows.find(
      (row) => row.occurrenceId === session.targetOccurrenceId,
    );
    if (target === undefined) return;
    const markerColor = options.theme.activeCell;
    const targetX = layout.rowHeaderLeft;
    const targetWidth = Math.max(0, layout.viewportWidth - targetX);
    if (session.position === 'inside') {
      const inside = this.#toCanvasRect(
        Object.freeze({
          x: targetX,
          y: target.y,
          width: targetWidth,
          height: target.height,
        }),
        layout.surface,
      );
      context.save();
      context.strokeStyle = markerColor;
      context.lineWidth = 2;
      context.strokeRect(
        inside.x + 1,
        inside.y + 1,
        Math.max(0, inside.width - 2),
        Math.max(0, inside.height - 2),
      );
      context.restore();
      return;
    }
    const y = session.position === 'before' ? target.y : target.y + target.height;
    const line = this.#toCanvasRect(
      Object.freeze({ x: targetX, y: y - 1, width: targetWidth, height: 2 }),
      layout.surface,
    );
    context.fillStyle = markerColor;
    context.fillRect(line.x, line.y, line.width, line.height);
    context.beginPath();
    context.moveTo(line.x, line.y - 4);
    context.lineTo(line.x, line.y + line.height + 4);
    context.lineTo(line.x + 7, line.y + line.height / 2);
    context.closePath();
    context.fill();
  }

  #syncSemantics(): void {
    const layout = this.#layout;
    const viewModel = this.#viewModel;
    if (layout === null || viewModel === null) {
      return;
    }
    this.#semantics.replaceChildren();
    const selectionBounds = this.#selectionBounds(viewModel.selection);
    const groupDepth = headerGroupDepth(viewModel.columns);
    this.#scrollHost.setAttribute(
      'aria-rowcount',
      String(layout.totalRowCount + groupDepth + 1),
    );
    this.#scrollHost.setAttribute(
      'aria-colcount',
      String(visibleColumnDefinitions(viewModel.columns).length + 1),
    );
    const scrollableStart = layout.scrollableStart;
    const scrollableEnd = layout.scrollableEnd;
    const appendColumnHeader = (
      row: HTMLDivElement,
      column: Readonly<BomCanvasColumnLayout>,
    ): void => {
      const columnHeader = this.#document.createElement('div');
      columnHeader.setAttribute('role', 'columnheader');
      columnHeader.setAttribute(
        'aria-colindex',
        String(column.columnIndex + 2),
      );
      columnHeader.textContent =
        column.column.a11y?.label ?? column.column.label;
      columnHeader.setAttribute(
        'aria-selected',
        String(
          viewModel.selection.mode === 'column' &&
            selectionBounds !== null &&
            column.columnIndex >= selectionBounds.firstColumn &&
            column.columnIndex <= selectionBounds.lastColumn,
        ),
      );
      if (column.column.a11y?.description !== undefined) {
        columnHeader.setAttribute(
          'aria-description',
          column.column.a11y.description,
        );
      }
      row.appendChild(columnHeader);
    };
    if (groupDepth > 0) {
      for (let groupIndex = 0; groupIndex < groupDepth; groupIndex += 1) {
        const groupRow = this.#document.createElement('div');
        groupRow.setAttribute('role', 'row');
        groupRow.setAttribute('aria-rowindex', String(groupIndex + 1));
        if (groupIndex === 0) {
          const rowNumberHeader = this.#document.createElement('div');
          rowNumberHeader.setAttribute('role', 'columnheader');
          rowNumberHeader.setAttribute('aria-colindex', '1');
          rowNumberHeader.setAttribute('aria-rowspan', String(groupDepth + 1));
          rowNumberHeader.textContent = this.#requiredOptions().labels.rowNumberHeader;
          groupRow.appendChild(rowNumberHeader);
        }
        for (const segment of headerGroupSegments(
          layout.columnWindow.columns,
          groupIndex,
          scrollableStart,
          scrollableEnd,
        )) {
          const groupHeader = this.#document.createElement('div');
          groupHeader.setAttribute('role', 'columnheader');
          groupHeader.setAttribute(
            'aria-colindex',
            String(segment.firstColumnIndex + 2),
          );
          groupHeader.setAttribute('aria-colspan', String(segment.columnCount));
          groupHeader.textContent = segment.label;
          groupRow.appendChild(groupHeader);
        }
        this.#semantics.appendChild(groupRow);
      }
    }
    const headerRow = this.#document.createElement('div');
    headerRow.setAttribute('role', 'row');
    headerRow.setAttribute('aria-rowindex', String(groupDepth + 1));
    if (groupDepth === 0) {
      const rowNumberHeader = this.#document.createElement('div');
      rowNumberHeader.setAttribute('role', 'columnheader');
      rowNumberHeader.setAttribute('aria-colindex', '1');
      rowNumberHeader.textContent = this.#requiredOptions().labels.rowNumberHeader;
      headerRow.appendChild(rowNumberHeader);
    }
    for (const column of layout.columnWindow.columns) {
      appendColumnHeader(headerRow, column);
    }
    this.#semantics.appendChild(headerRow);
    const active = viewModel.selection.activeCell;
    let activeMounted = false;
    const appendGhostRow = (ghost: Readonly<GhostRowLayout>): void => {
      const rowElement = this.#document.createElement('div');
      rowElement.setAttribute('role', 'row');
      rowElement.setAttribute(
        'aria-rowindex',
        String(ghost.rowIndex + groupDepth + 2),
      );
      rowElement.setAttribute('aria-level', String(ghost.depth));
      rowElement.setAttribute('aria-disabled', 'true');
      rowElement.setAttribute('aria-readonly', 'true');
      rowElement.setAttribute('data-bom-diff-ghost-row', ghost.occurrenceId);
      const rowHeader = this.#document.createElement('div');
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.setAttribute('aria-colindex', '1');
      rowHeader.setAttribute('aria-disabled', 'true');
      rowHeader.textContent = '-';
      rowElement.appendChild(rowHeader);
      for (const column of layout.columnWindow.columns) {
        const cellElement = this.#document.createElement('div');
        cellElement.setAttribute('role', 'gridcell');
        cellElement.setAttribute('aria-colindex', String(column.columnIndex + 2));
        cellElement.setAttribute('aria-readonly', 'true');
        cellElement.setAttribute('aria-disabled', 'true');
        if (column.columnIndex === 0) {
          cellElement.textContent =
            this.#requiredOptions().labels.diff?.deletedGhost ?? '';
        }
        rowElement.appendChild(cellElement);
      }
      rowElement.setAttribute(
        'aria-description',
        this.#requiredOptions().labels.diff?.deletedGhost ?? '',
      );
      this.#semantics.appendChild(rowElement);
    };
    let ghostCursor = 0;
    for (const row of layout.rows) {
      const node = viewModel.indexes.rowById.get(row.occurrenceId);
      if (node === undefined) {
        continue;
      }
      const expandedRowIndex = row.rowIndex + this.#ghostCountBefore(row.rowIndex);
      while (
        ghostCursor < layout.ghostRows.length &&
        layout.ghostRows[ghostCursor]!.rowIndex < expandedRowIndex
      ) {
        appendGhostRow(layout.ghostRows[ghostCursor]!);
        ghostCursor += 1;
      }
      const rowElement = this.#document.createElement('div');
      rowElement.setAttribute('role', 'row');
      rowElement.setAttribute('aria-rowindex', String(expandedRowIndex + groupDepth + 2));
      rowElement.setAttribute('aria-level', String(row.depth));
      if (row.expandable) {
        rowElement.setAttribute('aria-expanded', String(row.expanded));
      }
      const rowHeader = this.#document.createElement('div');
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.setAttribute('aria-colindex', '1');
      rowHeader.textContent = String(row.rowIndex + 1);
      this.#applyDiffSemantics(
        rowElement,
        this.#diffKindsForRow(row.occurrenceId),
      );
      this.#applyTreeMoveTargetSemantics(rowElement, row.occurrenceId);
      rowHeader.setAttribute(
        'aria-selected',
        String(
          viewModel.selection.mode === 'row' &&
            selectionBounds !== null &&
            row.rowIndex >= selectionBounds.firstRow &&
            row.rowIndex <= selectionBounds.lastRow,
        ),
      );
      rowElement.appendChild(rowHeader);
      for (const column of layout.columnWindow.columns) {
        const cellElement = this.#document.createElement('div');
        const address = Object.freeze({
          occurrenceId: row.occurrenceId,
          columnId: column.columnId,
        });
        const cellId = this.#cellDomId(address);
        cellElement.id = cellId;
        cellElement.setAttribute('role', 'gridcell');
        cellElement.setAttribute('aria-colindex', String(column.columnIndex + 2));
        cellElement.setAttribute('aria-readonly', String(!column.column.editable));
        if (column.column.a11y?.required === true) {
          cellElement.setAttribute('aria-required', 'true');
        }
        if (this.#cellIsRejected(address, viewModel.editState)) {
          cellElement.setAttribute('aria-invalid', 'true');
        }
        this.#applyDiffSemantics(
          cellElement,
          this.#diffCellOnlyKinds(row.occurrenceId, column.columnId),
          column.column.a11y?.description,
        );
        cellElement.setAttribute(
          'aria-selected',
          String(this.#addressInSelection(address, viewModel.selection)),
        );
        const cell = visibleCellRect(
          row,
          column,
          layout.scrollableStart,
          layout.scrollableEnd,
          layout.bodyTop,
        );
        cellElement.textContent = cell === null
          ? this.#cellText(node, column.column, undefined)
          : this.#cellAccessibleText(
              node,
              row,
              column,
              this.#toCanvasRect(cell, layout.surface),
            );
        rowElement.appendChild(cellElement);
        if (sameAddress(active, address)) {
          activeMounted = true;
        }
      }
      this.#semantics.appendChild(rowElement);
    }
    while (ghostCursor < layout.ghostRows.length) {
      appendGhostRow(layout.ghostRows[ghostCursor]!);
      ghostCursor += 1;
    }

    const summaryKeys = new Set<string>();
    for (const summary of this.#diffDeletedRows) {
      const boundary = this.#diffDeletionBoundary(summary, layout);
      if (boundary === null ||
          boundary < layout.bodyTop - layout.surface.height ||
          boundary > layout.bodyTop + layout.viewportHeight + layout.surface.height) {
        continue;
      }
      const key = `${summary.anchorOccurrenceId ?? ''}:${summary.position}`;
      if (summaryKeys.has(key)) continue;
      summaryKeys.add(key);
      const note = this.#document.createElement('div');
      note.setAttribute('role', 'note');
      note.setAttribute('data-bom-diff-deletion-summary', 'true');
      const label = formatDiffDeletionSummary(
        this.#requiredOptions().labels.diff?.deletedSummary,
        summary.count,
      );
      note.setAttribute('aria-description', label);
      note.textContent = label;
      this.#semantics.appendChild(note);
    }

    this.#activeDescendantIsProxy = false;
    if (active === null) {
      this.#scrollHost.removeAttribute('aria-activedescendant');
    } else {
      const activeId = this.#cellDomId(active);
      if (!activeMounted) {
        this.#appendActiveProxy(active, activeId);
        this.#activeDescendantIsProxy = true;
      }
      this.#scrollHost.setAttribute('aria-activedescendant', activeId);
    }
    this.#mountedRowCount = layout.rows.length + layout.ghostRows.length;
    this.#mountedColumnCount = layout.columnWindow.columns.length;
  }

  #appendActiveProxy(
    address: Readonly<BomCellAddress>,
    activeId: string,
  ): void {
    const viewModel = this.#requiredViewModel();
    const proxyRow = this.#document.createElement('div');
    proxyRow.setAttribute('role', 'row');
    proxyRow.setAttribute('data-bom-active-proxy', 'true');
    const rowIndexResult = viewModel.projection.indexOf(address.occurrenceId);
    if (rowIndexResult.ok && rowIndexResult.value !== undefined) {
      const groupDepth = headerGroupDepth(viewModel.columns);
      const expandedRowIndex = rowIndexResult.value + this.#ghostCountBefore(rowIndexResult.value);
      proxyRow.setAttribute(
        'aria-rowindex',
        String(expandedRowIndex + groupDepth + 2),
      );
      const depthResult = viewModel.projection.depthOf(address.occurrenceId);
      if (depthResult.ok) {
        proxyRow.setAttribute('aria-level', String(depthResult.value));
      }
    }
    const proxyRowHeader = this.#document.createElement('div');
    proxyRowHeader.setAttribute('role', 'rowheader');
    proxyRowHeader.setAttribute('aria-colindex', '1');
    proxyRowHeader.textContent =
      rowIndexResult.ok && rowIndexResult.value !== undefined
        ? String(rowIndexResult.value + 1)
        : '';
    const rowDiffKinds = this.#diffKindsForRow(address.occurrenceId);
    this.#applyDiffSemantics(proxyRow, rowDiffKinds);
    proxyRow.appendChild(proxyRowHeader);
    const proxyCell = this.#document.createElement('div');
    proxyCell.id = activeId;
    proxyCell.setAttribute('role', 'gridcell');
    proxyCell.setAttribute('data-bom-active-proxy-cell', 'true');
    proxyCell.setAttribute('aria-selected', 'true');
    const columnIndex = visibleColumnDefinitions(viewModel.columns).findIndex(
      (column) => column.columnId === address.columnId,
    );
    if (columnIndex >= 0) {
      proxyCell.setAttribute('aria-colindex', String(columnIndex + 2));
    }
    const node = viewModel.indexes.rowById.get(address.occurrenceId);
    const column = columnIndex >= 0
      ? visibleColumnDefinitions(viewModel.columns)[columnIndex]
      : undefined;
    if (node !== undefined && column !== undefined) {
      proxyCell.textContent = this.#activeProxyAccessibleText(node, column);
    }
    this.#applyDiffSemantics(
      proxyCell,
      this.#diffCellOnlyKinds(address.occurrenceId, address.columnId),
      column?.a11y?.description,
    );
    proxyRow.appendChild(proxyCell);
    this.#semantics.appendChild(proxyRow);
  }

  #syncPortal(): void {
    const viewModel = this.#viewModel;
    if (viewModel === null) {
      return;
    }
    const address = draftAddress(viewModel.editState);
    if (address === null) {
      const hadPortal = !this.#portal.hidden;
      const portalOwnedFocus = this.#document.activeElement === this.#portal;
      this.#portal.hidden = true;
      this.#portal.style.display = 'none';
      this.#callbackPending = false;
      if (hadPortal && portalOwnedFocus) {
        this.#scrollHost.focus({ preventScroll: true });
      }
      return;
    }
    const rect = this.#cellRect(address);
    if (rect === null || !rectIntersectsViewport(rect, this.#layout)) {
      this.#portal.hidden = true;
      this.#portal.style.display = 'none';
      return;
    }
    const draft = viewModel.editState.draft;
    if (draft === null) {
      return;
    }
    const value = bomValueToText(draft.value);
    if (!this.#composing && this.#portal.value !== value) {
      this.#portal.value = value;
    }
    const column = viewModel.columns.find(
      (candidate) => candidate.columnId === address.columnId,
    );
    this.#portal.setAttribute(
      'inputmode',
      column === undefined ? 'text' : editInputMode(column),
    );
    this.#portal.hidden = false;
    this.#portal.style.display = 'block';
    this.#portal.style.left = `${rect.x}px`;
    this.#portal.style.top = `${rect.y}px`;
    this.#portal.style.width = `${Math.max(1, rect.width)}px`;
    this.#portal.style.height = `${Math.max(1, rect.height)}px`;
    const locked =
      viewModel.editState.status === 'validating' ||
      viewModel.editState.status === 'committing';
    this.#portal.disabled = locked;
    this.#portal.readOnly = locked;
    this.#portal.setAttribute(
      'aria-invalid',
      String(viewModel.editState.status === 'rejected'),
    );
    if (this.#shouldFocusPortal && !locked) {
      this.#shouldFocusPortal = false;
      this.#portal.focus({ preventScroll: true });
      this.#portal.select();
    }
  }

  #activeProxyAccessibleText(
    node: Readonly<BomNode<TFields>>,
    column: Readonly<BomColumnDefinition>,
  ): string {
    const fallback = (): string => this.#cellText(node, column, undefined);
    if (
      this.#requiredOptions().cellRenderers.get(column.columnId) === undefined
    ) {
      return fallback();
    }
    const viewModel = this.#requiredViewModel();
    const projection = viewModel.projection;
    const index = projection.indexOf(node.occurrenceId);
    const offset = projection.offsetOf(node.occurrenceId);
    const height = projection.rowHeightOf(node.occurrenceId);
    const depth = projection.depthOf(node.occurrenceId);
    const expanded = projection.isExpanded(node.occurrenceId);
    const columnIndex = visibleColumnDefinitions(viewModel.columns).findIndex(
      (candidate) => candidate.columnId === column.columnId,
    );
    if (
      !index.ok || index.value === undefined ||
      !offset.ok || offset.value === undefined ||
      !height.ok || height.value === undefined ||
      !depth.ok || depth.value === undefined ||
      !expanded.ok || expanded.value === undefined ||
      columnIndex < 0
    ) {
      return fallback();
    }
    const bounds = Object.freeze({
      x: 0,
      y: 0,
      width: column.width,
      height: height.value,
    });
    const row: Readonly<BomCanvasRowLayout> = Object.freeze({
      ...bounds,
      occurrenceId: node.occurrenceId,
      rowIndex: index.value,
      documentOffset: offset.value,
      depth: depth.value,
      expandable: isExpandable(node, viewModel.indexes.childrenByParent),
      expanded: expanded.value,
    });
    const columnLayout: Readonly<BomCanvasColumnLayout> = Object.freeze({
      ...bounds,
      column,
      columnId: column.columnId,
      columnIndex,
      contentOffset: 0,
      frozen: column.frozen !== false,
    });
    return this.#cellAccessibleText(node, row, columnLayout, bounds);
  }

  #cellText(
    node: Readonly<BomNode<TFields>>,
    column: Readonly<BomColumnDefinition>,
    override: BomValue | undefined,
  ): string {
    const value = override ?? valueAtPath(node.fields, column.fieldPath);
    const formatter = this.#requiredOptions().formatCellText;
    if (formatter === undefined) {
      return formatColumnValue(value, column, this.#requiredOptions().locale);
    }
    const context = Object.freeze({
      revision: this.#requiredViewModel().revision,
      occurrenceId: node.occurrenceId,
      column,
      value,
      fields: node.fields,
      locale: this.#requiredOptions().locale,
      direction: this.#requiredOptions().direction,
    });
    try {
      const formatted = formatter(context);
      return formatted === undefined
        ? formatColumnValue(value, column, this.#requiredOptions().locale)
        : formatted;
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CELL_FORMAT_FAILED',
        address: Object.freeze({
          occurrenceId: node.occurrenceId,
          columnId: column.columnId,
        }),
        cause,
      });
      return bomValueToText(value);
    }
  }

  #cellRendererContentBounds(
    row: Readonly<BomCanvasRowLayout>,
    column: Readonly<BomCanvasColumnLayout>,
    bounds: Readonly<BomCanvasRect>,
  ): Readonly<BomCanvasRect> {
    const options = this.#requiredOptions();
    let x = bounds.x + options.cellPadding;
    let width = Math.max(0, bounds.width - options.cellPadding * 2);
    if (column.columnId === this.#requiredViewModel().columns[0]?.columnId) {
      const treeInset =
        Math.max(0, row.depth - 1) * options.indentWidth + EXPANDER_SIZE + 4;
      if (options.direction === 'rtl') {
        width = Math.max(0, width - treeInset);
      } else {
        x += treeInset;
        width = Math.max(0, bounds.x + bounds.width - x - options.cellPadding);
      }
    }
    return Object.freeze({
      x,
      y: bounds.y,
      width,
      height: bounds.height,
    });
  }

  #cellRendererContext(
    node: Readonly<BomNode<TFields>>,
    column: Readonly<BomColumnDefinition>,
    bounds: Readonly<BomCanvasRect>,
    contentBounds: Readonly<BomCanvasRect>,
  ): Readonly<BomCanvasCellRendererContext<TFields>> {
    const options = this.#requiredOptions();
    return Object.freeze({
      revision: this.#requiredViewModel().revision,
      address: Object.freeze({
        occurrenceId: node.occurrenceId,
        columnId: column.columnId,
      }),
      column,
      value: valueAtPath(node.fields, column.fieldPath),
      fields: node.fields,
      bounds,
      contentBounds,
      locale: options.locale,
      direction: options.direction,
      theme: options.theme,
    });
  }

  #measureCustomCell(
    renderer: Readonly<BomCanvasCellRenderer<TFields>>,
    node: Readonly<BomNode<TFields>>,
    column: Readonly<BomColumnDefinition>,
    bounds: Readonly<BomCanvasRect>,
    contentBounds: Readonly<BomCanvasRect>,
  ): Readonly<BomCanvasCellSize> | null {
    const cached = this.#cellRendererMeasurements
      .get(node.occurrenceId)
      ?.get(column.columnId);
    if (cached !== undefined && cached.renderer === renderer) {
      return cached.size;
    }
    const base = this.#cellRendererContext(
      node,
      column,
      bounds,
      contentBounds,
    );
    const availableSize = Object.freeze({
      width: contentBounds.width,
      height: contentBounds.height,
    });
    const measured = this.#runCellRenderer(
      'measure',
      base.address,
      (): Readonly<BomCanvasCellSize> => renderer.measure.call(
        renderer,
        Object.freeze({ ...base, availableSize }),
      ),
    );
    let size: Readonly<BomCanvasCellSize> | null = null;
    if (measured.ok && !this.#isAsyncCellRendererResult(
      measured.value,
      'measure',
      base.address,
    )) {
      try {
        size = normalizeCellRendererSize(measured.value, availableSize);
      } catch (cause) {
        this.#report({
          code: 'BOM_RENDERER_CELL_RENDERER_FAILED',
          phase: 'measure',
          address: base.address,
          cause,
        });
      }
    }
    let byColumn = this.#cellRendererMeasurements.get(node.occurrenceId);
    if (byColumn === undefined) {
      byColumn = new Map<string, CellRendererMeasurement<TFields>>();
      this.#cellRendererMeasurements.set(node.occurrenceId, byColumn);
    }
    byColumn.set(column.columnId, Object.freeze({ renderer, size }));
    return size;
  }

  #drawCustomCell(
    renderer: Readonly<BomCanvasCellRenderer<TFields>>,
    canvas: CanvasRenderingContext2D,
    node: Readonly<BomNode<TFields>>,
    column: Readonly<BomColumnDefinition>,
    bounds: Readonly<BomCanvasRect>,
    contentBounds: Readonly<BomCanvasRect>,
  ): boolean {
    const measuredSize = this.#measureCustomCell(
      renderer,
      node,
      column,
      bounds,
      contentBounds,
    );
    if (measuredSize === null) {
      return false;
    }
    const base = this.#cellRendererContext(
      node,
      column,
      bounds,
      contentBounds,
    );
    canvas.save();
    canvas.beginPath();
    canvas.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    canvas.clip();
    const drawn = this.#runCellRenderer(
      'draw',
      base.address,
      (): void => renderer.draw.call(renderer, Object.freeze({
        ...base,
        canvas,
        measuredSize,
      })),
    );
    const succeeded = drawn.ok && !this.#isAsyncCellRendererResult(
      drawn.ok ? drawn.value : undefined,
      'draw',
      base.address,
    );
    if (!succeeded) {
      // A synchronous renderer can overrun only after it has painted. The
      // content layer is cell-clipped, so erase that partial result before the
      // built-in fallback text is drawn by the caller.
      canvas.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    canvas.restore();
    return succeeded;
  }

  #cellAccessibleText(
    node: Readonly<BomNode<TFields>>,
    row: Readonly<BomCanvasRowLayout>,
    column: Readonly<BomCanvasColumnLayout>,
    bounds: Readonly<BomCanvasRect>,
  ): string {
    const fallback = (): string => this.#cellText(node, column.column, undefined);
    const renderer = this.#requiredOptions().cellRenderers.get(column.columnId);
    if (renderer === undefined) {
      return fallback();
    }
    const contentBounds = this.#cellRendererContentBounds(row, column, bounds);
    const measuredSize = this.#measureCustomCell(
      renderer,
      node,
      column.column,
      bounds,
      contentBounds,
    );
    if (measuredSize === null) {
      return fallback();
    }
    const base = this.#cellRendererContext(
      node,
      column.column,
      bounds,
      contentBounds,
    );
    const accessible = this.#runCellRenderer(
      'accessibility',
      base.address,
      (): string => renderer.getAccessibleText.call(renderer, Object.freeze({
        ...base,
        measuredSize,
      })),
    );
    if (
      !accessible.ok ||
      this.#isAsyncCellRendererResult(
        accessible.ok ? accessible.value : undefined,
        'accessibility',
        base.address,
      ) ||
      typeof accessible.value !== 'string'
    ) {
      if (accessible.ok && typeof accessible.value !== 'string') {
        this.#report({
          code: 'BOM_RENDERER_CELL_RENDERER_FAILED',
          phase: 'accessibility',
          address: base.address,
          cause: new TypeError('BOM_RENDERER_CELL_RENDERER_INVALID_ACCESSIBLE_TEXT'),
        });
      }
      return fallback();
    }
    return accessible.value;
  }

  #hitTestCustomCell(
    hit: Readonly<BomCanvasCellHit>,
    clientX: number,
    clientY: number,
  ): Readonly<BomCanvasCellRendererHitTarget> | null {
    const layout = this.#layout;
    const viewModel = this.#viewModel;
    if (layout === null || viewModel === null) {
      return null;
    }
    const renderer = this.#requiredOptions().cellRenderers.get(
      hit.address.columnId,
    );
    if (renderer === undefined || renderer.hitTest === undefined) {
      return null;
    }
    const row = layout.rows.find(
      (candidate) => candidate.occurrenceId === hit.address.occurrenceId,
    );
    const column = layout.columnWindow.columns.find(
      (candidate) => candidate.columnId === hit.address.columnId,
    );
    const node = viewModel.indexes.rowById.get(hit.address.occurrenceId);
    if (row === undefined || column === undefined || node === undefined) {
      return null;
    }
    const cell = visibleCellRect(
      row,
      column,
      layout.scrollableStart,
      layout.scrollableEnd,
      layout.bodyTop,
    );
    if (cell === null) {
      return null;
    }
    const bounds = this.#toCanvasRect(cell, layout.surface);
    const contentBounds = this.#cellRendererContentBounds(row, column, bounds);
    const measuredSize = this.#measureCustomCell(
      renderer,
      node,
      column.column,
      bounds,
      contentBounds,
    );
    if (measuredSize === null) {
      return null;
    }
    const scrollBounds = this.#scrollHost.getBoundingClientRect();
    const point = Object.freeze({
      x: clientX - scrollBounds.left - layout.surface.left,
      y: clientY - scrollBounds.top - layout.surface.top,
    });
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }
    const base = this.#cellRendererContext(
      node,
      column.column,
      bounds,
      contentBounds,
    );
    const tested = this.#runCellRenderer(
      'hitTest',
      base.address,
      (): Readonly<BomCanvasCellRendererHitTarget> | null =>
        renderer.hitTest!.call(renderer, Object.freeze({
          ...base,
          point,
          measuredSize,
        })),
    );
    if (
      !tested.ok ||
      this.#isAsyncCellRendererResult(
        tested.ok ? tested.value : undefined,
        'hitTest',
        base.address,
      )
    ) {
      return null;
    }
    try {
      return normalizeCellRendererHitTarget(tested.value);
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CELL_RENDERER_FAILED',
        phase: 'hitTest',
        address: base.address,
        cause,
      });
      return null;
    }
  }

  #emitCellRendererHit(
    address: Readonly<BomCellAddress>,
    target: Readonly<BomCanvasCellRendererHitTarget>,
  ): void {
    const callback = this.#requiredOptions().onCellRendererHit;
    if (callback === undefined) {
      return;
    }
    const hit: Readonly<BomCanvasCellRendererHit> = Object.freeze({
      revision: this.#requiredViewModel().revision,
      address: Object.freeze({ ...address }),
      target: Object.freeze({ ...target }),
    });
    try {
      callback(hit);
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CELL_RENDERER_HIT_CALLBACK_FAILED',
        address: hit.address,
        targetId: hit.target.id,
        cause,
      });
    }
  }

  #runCellRenderer<T>(
    phase: 'measure' | 'draw' | 'accessibility' | 'hitTest',
    address: Readonly<BomCellAddress>,
    operation: () => T,
  ): { readonly ok: true; readonly value: T } | { readonly ok: false } {
    if (this.#cellRendererBudgetRemainingMs <= 0) {
      this.#reportCellRendererBudget(address, phase, 0);
      return Object.freeze({ ok: false });
    }
    const startedAt = globalThis.performance.now();
    try {
      const value = operation();
      const withinBudget = this.#consumeCellRendererBudget(
        address,
        phase,
        Math.max(0, globalThis.performance.now() - startedAt),
      );
      if (!withinBudget) {
        return Object.freeze({ ok: false });
      }
      return Object.freeze({ ok: true, value });
    } catch (cause) {
      this.#consumeCellRendererBudget(
        address,
        phase,
        Math.max(0, globalThis.performance.now() - startedAt),
      );
      this.#report({
        code: 'BOM_RENDERER_CELL_RENDERER_FAILED',
        phase,
        address,
        cause,
      });
      return Object.freeze({ ok: false });
    }
  }

  #consumeCellRendererBudget(
    address: Readonly<BomCellAddress>,
    phase: 'measure' | 'draw' | 'accessibility' | 'hitTest',
    durationMs: number,
  ): boolean {
    this.#cellRendererBudgetRemainingMs -= durationMs;
    if (this.#cellRendererBudgetRemainingMs <= 0) {
      this.#reportCellRendererBudget(address, phase, durationMs);
      return false;
    }
    return true;
  }

  #reportCellRendererBudget(
    address: Readonly<BomCellAddress>,
    phase: 'measure' | 'draw' | 'accessibility' | 'hitTest',
    durationMs: number,
  ): void {
    if (this.#cellRendererBudgetReported) {
      return;
    }
    this.#cellRendererBudgetReported = true;
    this.#report({
      code: 'BOM_RENDERER_CELL_RENDERER_BUDGET_EXCEEDED',
      phase,
      address,
      durationMs,
      budgetMs: this.#requiredOptions().cellRendererFrameBudgetMs,
    });
  }

  #isAsyncCellRendererResult(
    value: unknown,
    phase: 'measure' | 'draw' | 'accessibility' | 'hitTest',
    address: Readonly<BomCellAddress>,
  ): boolean {
    if (!isPromiseLike(value)) {
      return false;
    }
    const cause = new TypeError('BOM_RENDERER_CELL_RENDERER_ASYNC_RESULT');
    this.#report({
      code: 'BOM_RENDERER_CELL_RENDERER_FAILED',
      phase,
      address,
      cause,
    });
    void Promise.resolve(value).catch((rejection: unknown): void => {
      this.#report({
        code: 'BOM_RENDERER_CELL_RENDERER_FAILED',
        phase,
        address,
        cause: rejection,
      });
    });
    return true;
  }

  #cellRect(address: Readonly<BomCellAddress>): Readonly<BomCanvasRect> | null {
    const layout = this.#layout;
    if (layout === null) {
      return null;
    }
    const row = layout.rows.find(
      (entry) => entry.occurrenceId === address.occurrenceId,
    );
    const column = layout.columnWindow.columns.find(
      (entry) => entry.columnId === address.columnId,
    );
    if (row === undefined || column === undefined) {
      return null;
    }
    return visibleCellRect(
      row,
      column,
      layout.scrollableStart,
      layout.scrollableEnd,
      layout.bodyTop,
    );
  }

  #selectionBounds(
    selection: Readonly<BomSelectionState>,
  ): Readonly<{
    readonly firstRow: number;
    readonly lastRow: number;
    readonly firstColumn: number;
    readonly lastColumn: number;
  }> | null {
    if (selection.activeCell === null) {
      return null;
    }
    const range = selection.range;
    return this.#selectionBoundsForRange(
      range ?? {
        anchor: selection.activeCell,
        focus: selection.activeCell,
      },
    );
  }

  #selectionBoundsForRange(
    range: Readonly<BomCellRange>,
  ): Readonly<{
    readonly firstRow: number;
    readonly lastRow: number;
    readonly firstColumn: number;
    readonly lastColumn: number;
  }> | null {
    const viewModel = this.#viewModel;
    if (viewModel === null) {
      return null;
    }
    const anchor = range.anchor;
    const focus = range.focus;
    const anchorRow = viewModel.projection.indexOf(anchor.occurrenceId);
    const focusRow = viewModel.projection.indexOf(focus.occurrenceId);
    const columns = visibleColumnDefinitions(viewModel.columns);
    const anchorColumn = columns.findIndex(
      (column) => column.columnId === anchor.columnId,
    );
    const focusColumn = columns.findIndex(
      (column) => column.columnId === focus.columnId,
    );
    if (
      !anchorRow.ok ||
      !focusRow.ok ||
      anchorRow.value === undefined ||
      focusRow.value === undefined ||
      anchorColumn < 0 ||
      focusColumn < 0
    ) {
      return null;
    }
    return Object.freeze({
      firstRow: Math.min(anchorRow.value, focusRow.value),
      lastRow: Math.max(anchorRow.value, focusRow.value),
      firstColumn: Math.min(anchorColumn, focusColumn),
      lastColumn: Math.max(anchorColumn, focusColumn),
    });
  }

  #selectionHandleRect(): Readonly<BomCanvasRect> | null {
    if (!this.#canUseFillHandle()) {
      return null;
    }
    const layout = this.#layout;
    const viewModel = this.#viewModel;
    if (layout === null || viewModel === null) {
      return null;
    }
    const bounds = this.#selectionBounds(viewModel.selection);
    if (bounds === null) {
      return null;
    }
    const row = layout.rows.find((entry) => entry.rowIndex === bounds.lastRow);
    const column = layout.columnWindow.columns.find(
      (entry) => entry.columnIndex === bounds.lastColumn,
    );
    if (row === undefined || column === undefined) {
      return null;
    }
    const size = 8;
    const right = column.x + column.width;
    const bottom = row.y + row.height;
    if (right <= 0 || bottom <= layout.bodyTop) {
      return null;
    }
    return Object.freeze({
      x: Math.max(column.x, right - size),
      y: Math.max(layout.bodyTop, bottom - size),
      width: Math.min(size, column.width),
      height: Math.min(size, Math.max(0, bottom - Math.max(layout.bodyTop, bottom - size))),
    });
  }

  #drawSelectionRange(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
    selection: Readonly<BomSelectionState>,
  ): void {
    const ranges = selection.ranges ??
      (selection.range === null ? [] : [selection.range]);
    if (ranges.length === 0) {
      return;
    }
    context.fillStyle = this.#requiredOptions().theme.rangeFill;
    for (const range of ranges) {
      const bounds = this.#selectionBoundsForRange(range);
      if (bounds === null) {
        continue;
      }
      for (const row of layout.rows) {
        if (row.rowIndex < bounds.firstRow || row.rowIndex > bounds.lastRow) {
          continue;
        }
        for (const column of layout.columnWindow.columns) {
          if (
            column.columnIndex < bounds.firstColumn ||
            column.columnIndex > bounds.lastColumn
          ) {
            continue;
          }
          const rect = visibleCellRect(
            row,
            column,
            layout.scrollableStart,
            layout.scrollableEnd,
            layout.bodyTop,
          );
          if (rect === null) {
            continue;
          }
          const canvasRect = this.#toCanvasRect(rect, layout.surface);
          context.fillRect(
            canvasRect.x,
            canvasRect.y,
            canvasRect.width,
            canvasRect.height,
          );
        }
      }
    }
  }

  #drawFillPreview(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
  ): void {
    const session = this.#fillHandleDrag;
    if (session === null || !session.changed) return;
    const targetIndex = this.#requiredViewModel().projection.indexOf(
      session.lastAddress.occurrenceId,
    );
    if (!targetIndex.ok || targetIndex.value === undefined) return;
    const firstRow = session.sourceBounds.lastRow + 1;
    const lastRow = targetIndex.value;
    if (lastRow < firstRow) return;
    const theme = this.#requiredOptions().theme;
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    context.fillStyle = theme.fillPreviewFill;
    for (const row of layout.rows) {
      if (row.rowIndex < firstRow || row.rowIndex > lastRow) continue;
      for (const column of layout.columnWindow.columns) {
        if (
          column.columnIndex < session.sourceBounds.firstColumn ||
          column.columnIndex > session.sourceBounds.lastColumn
        ) continue;
        const rect = visibleCellRect(
          row,
          column,
          layout.scrollableStart,
          layout.scrollableEnd,
          layout.bodyTop,
        );
        if (rect === null) continue;
        const canvasRect = this.#toCanvasRect(rect, layout.surface);
        context.fillRect(
          canvasRect.x,
          canvasRect.y,
          canvasRect.width,
          canvasRect.height,
        );
        left = Math.min(left, canvasRect.x);
        right = Math.max(right, canvasRect.x + canvasRect.width);
        top = Math.min(top, canvasRect.y);
        bottom = Math.max(bottom, canvasRect.y + canvasRect.height);
      }
    }
    if (!Number.isFinite(left) || right <= left || bottom <= top) return;
    context.save();
    context.strokeStyle = theme.fillPreviewBorder;
    context.lineWidth = 1;
    context.setLineDash([4, 3]);
    context.strokeRect(left + 0.5, top + 0.5, right - left - 1, bottom - top - 1);
    context.restore();
  }

  #drawAxisHeaders(
    context: CanvasRenderingContext2D,
    layout: Readonly<RendererLayout>,
    selection: Readonly<BomSelectionState>,
  ): void {
    if (selection.mode === undefined) {
      return;
    }
    const bounds = this.#selectionBounds(selection);
    if (bounds === null) {
      return;
    }
    context.fillStyle = this.#requiredOptions().theme.rangeFill;
    if (selection.mode === 'row') {
      for (const row of layout.rows) {
        if (
          row.rowIndex < bounds.firstRow ||
          row.rowIndex > bounds.lastRow
        ) {
          continue;
        }
        const top = Math.max(row.y, layout.bodyTop);
        const bottom = row.y + row.height;
        if (bottom <= top) {
          continue;
        }
        context.fillRect(
          layout.rowHeaderLeft - layout.surface.left,
          top - layout.surface.top,
          this.#requiredOptions().rowHeaderWidth,
          bottom - top,
        );
      }
      return;
    }
    for (const column of layout.columnWindow.columns) {
      if (
        column.columnIndex < bounds.firstColumn ||
        column.columnIndex > bounds.lastColumn
      ) {
        continue;
      }
      const header = visibleColumnRect(
        column,
        layout.scrollableStart,
        layout.scrollableEnd,
        0,
        layout.bodyTop,
      );
      if (header === null) {
        continue;
      }
      context.fillRect(
        header.x - layout.surface.left,
        header.y - layout.surface.top,
        header.width,
        header.height,
      );
    }
  }

  #addressInSelection(
    address: Readonly<BomCellAddress>,
    selection: Readonly<BomSelectionState>,
  ): boolean {
    if (selection.activeCell === null) {
      return false;
    }
    const ranges = selection.ranges ??
      (selection.range === null
        ? [{ anchor: selection.activeCell, focus: selection.activeCell }]
        : [selection.range]);
    const viewModel = this.#requiredViewModel();
    const row = viewModel.projection.indexOf(address.occurrenceId);
    const column = viewModel.columns.findIndex(
      (candidate) => candidate.columnId === address.columnId,
    );
    if (!row.ok || row.value === undefined || column < 0) {
      return false;
    }
    return ranges.some((range) => {
      const bounds = this.#selectionBoundsForRange(range);
      return bounds !== null &&
        column >= bounds.firstColumn &&
        column <= bounds.lastColumn &&
        row.value! >= bounds.firstRow &&
        row.value! <= bounds.lastRow;
    });
  }

  #cellIsRejected(
    address: Readonly<BomCellAddress>,
    editState: Readonly<BomEditState>,
  ): boolean {
    return (
      editState.status === 'rejected' &&
      sameAddress(editState.draft.address, address)
    );
  }

  #applyDiffSemantics(
    element: HTMLElement,
    kinds: ReadonlySet<BomCanvasDiffKind>,
    existingDescription?: string,
  ): void {
    if (kinds.size === 0) {
      if (existingDescription !== undefined) {
        element.setAttribute('aria-description', existingDescription);
      }
      return;
    }
    const labels = this.#requiredOptions().labels.diff;
    const descriptions = diffKindsInStableOrder(kinds)
      .map((kind) => diffLabel(labels, kind))
      .filter((label): label is string => label !== undefined && label !== '');
    const description = descriptions.join(' ');
    const merged = existingDescription === undefined || description === ''
      ? existingDescription ?? description
      : `${existingDescription} ${description}`;
    element.setAttribute(
      'data-bom-diff-kind',
      diffKindsInStableOrder(kinds).join(','),
    );
    if (merged !== '') {
      element.setAttribute('aria-description', merged);
    }
  }

  #applyTreeMoveTargetSemantics(
    element: HTMLElement,
    occurrenceId: OccurrenceId,
  ): void {
    const session = this.#treeMove;
    if (
      session === null ||
      !session.moved ||
      session.targetOccurrenceId !== occurrenceId ||
      session.position === null
    ) {
      return;
    }
    element.setAttribute('data-bom-tree-drop-position', session.position);
    const description = this.#treeMoveTargetMessage(session.position);
    if (description === null) return;
    const existing = element.getAttribute('aria-description');
    element.setAttribute(
      'aria-description',
      existing === null || existing === ''
        ? description
        : `${existing} ${description}`,
    );
  }

  #cellDomId(address: Readonly<BomCellAddress>): string {
    return `${this.#domIdPrefix}-cell-${encodeIdPart(address.occurrenceId)}-${encodeIdPart(address.columnId)}`;
  }

  #activeDraftAddress(): Readonly<BomCellAddress> | null {
    const viewModel = this.#viewModel;
    return viewModel === null ? null : draftAddress(viewModel.editState);
  }

  #toCanvasRect(
    rect: Readonly<BomCanvasRect>,
    surface: Readonly<BomCanvasSurfaceLayout>,
  ): Readonly<BomCanvasRect> {
    return Object.freeze({
      x: rect.x - surface.left,
      y: rect.y - surface.top,
      width: rect.width,
      height: rect.height,
    });
  }

  #markAllLayersFull(): void {
    for (const layer of LAYERS) {
      this.#fullDirty.add(layer);
    }
  }

  #measureWidth(): number {
    const container = this.#container;
    if (container === null) {
      return 0;
    }
    return finiteDimension(
      this.#scrollHost.clientWidth > 0
        ? this.#scrollHost.clientWidth
        : container.clientWidth,
    );
  }

  #measureHeight(): number {
    const container = this.#container;
    if (container === null) {
      return 0;
    }
    return finiteDimension(
      this.#scrollHost.clientHeight > 0
        ? this.#scrollHost.clientHeight
        : container.clientHeight,
    );
  }

  #requiredViewModel(): Readonly<BomCanvasViewModel<TFields>> {
    if (this.#viewModel === null) {
      throw new Error('BOM_RENDERER_DESTROYED');
    }
    return this.#viewModel;
  }

  #requiredCallbacks(): Readonly<BomCanvasRendererCallbacks> {
    if (this.#callbacks === null) {
      throw new Error('BOM_RENDERER_DESTROYED');
    }
    return this.#callbacks;
  }

  #requiredOptions(): Readonly<ResolvedRendererOptions<TFields>> {
    if (this.#options === null) {
      throw new Error('BOM_RENDERER_DESTROYED');
    }
    return this.#options;
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('BOM_RENDERER_DESTROYED');
    }
  }

  #invoke(
    callback: keyof BomCanvasRendererCallbacks,
    invoke: () => unknown,
  ): void {
    try {
      const result = invoke();
      if (isPromiseLike(result)) {
        void Promise.resolve(result).catch((cause: unknown): void => {
          this.#report({
            code: 'BOM_RENDERER_CALLBACK_FAILED',
            callback,
            cause,
          });
        });
      }
    } catch (cause) {
      this.#report({
        code: 'BOM_RENDERER_CALLBACK_FAILED',
        callback,
        cause,
      });
    }
  }

  #report(diagnostic: Readonly<BomCanvasRendererDiagnostic>): void {
    try {
      this.#options?.diagnosticSink?.(Object.freeze(diagnostic));
    } catch {
      // Diagnostics never interrupt rendering or teardown.
    }
  }
}

function boldCanvasFont(font: string): string {
  return /\b(?:normal|bold|[1-9]00)\b/.test(font)
    ? font.replace(/\b(?:normal|bold|[1-9]00)\b/, '700')
    : `700 ${font}`;
}

function readFieldValue(fields: BomFields, path: readonly string[]): BomValue | undefined {
  let value: BomValue | undefined = fields;
  for (const key of path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as { readonly [key: string]: BomValue })[key];
  }
  return value;
}

function resolveOptions<TFields extends BomFields>(
  options: Readonly<BomCanvasRendererOptions<TFields>>,
): Readonly<ResolvedRendererOptions<TFields>> {
  if (typeof options.instanceId !== 'string' || options.instanceId.length === 0) {
    throw new RangeError('BOM_RENDERER_INSTANCE_ID_REQUIRED');
  }
  const locale = normalizeRendererLocale(options.locale ?? 'zh-CN');
  if (locale === null) {
    throw new RangeError('BOM_RENDERER_LOCALE_INVALID');
  }
  if (options.direction !== undefined && options.direction !== 'ltr' && options.direction !== 'rtl') {
    throw new RangeError('BOM_RENDERER_DIRECTION_INVALID');
  }
  const labelOverrides = mergeRendererLabelOverrides(
    Object.freeze({}),
    options.labels,
  );
  if (labelOverrides === null) {
    throw new RangeError('BOM_RENDERER_LABELS_INVALID');
  }
  const labels = resolveRendererLabels(locale, labelOverrides);
  return Object.freeze({
    instanceId: options.instanceId,
    locale,
    direction: options.direction ?? 'ltr',
    labelOverrides,
    labels,
    theme: Object.freeze({
      ...DEFAULT_BOM_CANVAS_THEME,
      ...options.theme,
    }),
    liveRegion: resolveLiveRegionOptions(options.liveRegion),
    overscanX: boundedOverscan(options.overscanX, DEFAULT_OVERSCAN_X),
    overscanY: boundedOverscan(options.overscanY, DEFAULT_OVERSCAN_Y),
    maxDpr: positiveFinite(options.maxDpr, DEFAULT_MAX_DPR),
    maxBackingStoreBytes: backingStoreBudget(
      options.maxBackingStoreBytes,
      DEFAULT_MAX_BACKING_STORE_BYTES,
    ),
    dirtyAreaFullRedrawRatio: ratio(
      options.dirtyAreaFullRedrawRatio,
      DEFAULT_DIRTY_RATIO,
    ),
    indentWidth: positiveFinite(options.indentWidth, DEFAULT_INDENT_WIDTH),
    cellPadding: nonNegativeFinite(options.cellPadding, DEFAULT_CELL_PADDING),
    headerHeight: positiveFinite(
      options.headerHeight,
      DEFAULT_HEADER_HEIGHT,
    ),
    rowHeaderWidth: positiveFinite(
      options.rowHeaderWidth,
      DEFAULT_ROW_HEADER_WIDTH,
    ),
    formatCellText: options.formatCellText,
    cellRenderers: resolveCellRenderers(options.cellRenderers),
    cellRendererFrameBudgetMs: cellRendererFrameBudget(
      options.cellRendererFrameBudgetMs,
    ),
    onCellRendererHit: resolveCellRendererHitCallback(
      options.onCellRendererHit,
    ),
    diagnosticSink: options.diagnosticSink,
    frameCommitSink: options.frameCommitSink,
    onShortcut: options.onShortcut,
    shortcuts: options.shortcuts === undefined
      ? undefined
      : validateBomShortcutOptions(options.shortcuts).ok
        ? Object.freeze({ ...options.shortcuts })
        : (() => {
            throw new RangeError('BOM_RENDERER_SHORTCUT_INVALID');
          })(),
  });
}

function resolveCellRenderers<TFields extends BomFields>(
  registrations: BomCanvasRendererOptions<TFields>['cellRenderers'],
): ReadonlyMap<string, Readonly<BomCanvasCellRenderer<TFields>>> {
  if (registrations === undefined) {
    return new Map();
  }
  if (!Array.isArray(registrations)) {
    throw new RangeError('BOM_RENDERER_CELL_RENDERERS_INVALID');
  }
  const resolved = new Map<string, Readonly<BomCanvasCellRenderer<TFields>>>();
  for (const registration of registrations) {
    if (
      registration === null ||
      typeof registration !== 'object' ||
      Array.isArray(registration) ||
      typeof registration.columnId !== 'string' ||
      registration.columnId.length === 0 ||
      resolved.has(registration.columnId) ||
      !isCellRenderer(registration.renderer)
    ) {
      throw new RangeError('BOM_RENDERER_CELL_RENDERERS_INVALID');
    }
    resolved.set(registration.columnId, registration.renderer);
  }
  return resolved;
}

function isCellRenderer<TFields extends BomFields>(
  renderer: unknown,
): renderer is Readonly<BomCanvasCellRenderer<TFields>> {
  if (
    (typeof renderer !== 'object' && typeof renderer !== 'function') ||
    renderer === null
  ) {
    return false;
  }
  const capability = renderer as Partial<BomCanvasCellRenderer<TFields>>;
  return typeof capability.measure === 'function' &&
    typeof capability.draw === 'function' &&
    typeof capability.getAccessibleText === 'function' &&
    (capability.hitTest === undefined || typeof capability.hitTest === 'function') &&
    (capability.dispose === undefined || typeof capability.dispose === 'function');
}

function cellRendererFrameBudget(value: number | undefined): number {
  return Math.min(
    MAX_CELL_RENDERER_FRAME_BUDGET_MS,
    positiveFinite(value, DEFAULT_CELL_RENDERER_FRAME_BUDGET_MS),
  );
}

function resolveCellRendererHitCallback<TFields extends BomFields>(
  callback: BomCanvasRendererOptions<TFields>['onCellRendererHit'],
): ((hit: Readonly<BomCanvasCellRendererHit>) => void) | undefined {
  if (callback === undefined) {
    return undefined;
  }
  if (typeof callback !== 'function') {
    throw new RangeError('BOM_RENDERER_CELL_RENDERER_HIT_CALLBACK_INVALID');
  }
  return callback;
}

function normalizeCellRendererSize(
  value: unknown,
  availableSize: Readonly<BomCanvasCellSize>,
): Readonly<BomCanvasCellSize> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new TypeError('BOM_RENDERER_CELL_RENDERER_INVALID_SIZE');
  }
  const candidate = value as Partial<BomCanvasCellSize>;
  if (
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height) ||
    candidate.width === undefined ||
    candidate.height === undefined ||
    candidate.width < 0 ||
    candidate.height < 0
  ) {
    throw new TypeError('BOM_RENDERER_CELL_RENDERER_INVALID_SIZE');
  }
  return Object.freeze({
    width: Math.min(candidate.width, availableSize.width),
    height: Math.min(candidate.height, availableSize.height),
  });
}

function normalizeCellRendererHitTarget(
  value: unknown,
): Readonly<BomCanvasCellRendererHitTarget> | null {
  if (value === null) {
    return null;
  }
  if (
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError('BOM_RENDERER_CELL_RENDERER_INVALID_HIT_TARGET');
  }
  const target = value as Partial<BomCanvasCellRendererHitTarget>;
  if (
    typeof target.id !== 'string' ||
    target.id.length === 0 ||
    target.id.length > 256 ||
    (target.consume !== undefined && typeof target.consume !== 'boolean')
  ) {
    throw new TypeError('BOM_RENDERER_CELL_RENDERER_INVALID_HIT_TARGET');
  }
  return Object.freeze({
    id: target.id,
    ...(target.consume === undefined ? {} : { consume: target.consume }),
  });
}

function resolveLiveRegionOptions(
  input: Readonly<BomCanvasLiveRegionOptions> | undefined,
): Readonly<ResolvedLiveRegionOptions> {
  if (input === undefined) {
    return Object.freeze({
      enabled: true,
      politeMinIntervalMs: DEFAULT_LIVE_REGION_POLITE_MIN_INTERVAL_MS,
    });
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new RangeError('BOM_RENDERER_LIVE_REGION_OPTIONS_INVALID');
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new RangeError('BOM_RENDERER_LIVE_REGION_ENABLED_INVALID');
  }
  const politeMinIntervalMs = input.politeMinIntervalMs === undefined
    ? DEFAULT_LIVE_REGION_POLITE_MIN_INTERVAL_MS
    : input.politeMinIntervalMs;
  if (
    !Number.isInteger(politeMinIntervalMs) ||
    politeMinIntervalMs < 0 ||
    politeMinIntervalMs > MAX_LIVE_REGION_POLITE_MIN_INTERVAL_MS
  ) {
    throw new RangeError('BOM_RENDERER_LIVE_REGION_INTERVAL_INVALID');
  }
  return Object.freeze({
    enabled: input.enabled ?? true,
    politeMinIntervalMs,
  });
}

function normalizeLiveAnnouncement(
  input: unknown,
): Readonly<{ message: string; politeness: BomCanvasLivePoliteness }> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const candidate = input as Partial<BomCanvasLiveAnnouncement>;
  if (
    typeof candidate.message !== 'string' ||
    candidate.message.trim().length === 0 ||
    candidate.message.length > MAX_LIVE_REGION_MESSAGE_LENGTH
  ) {
    return null;
  }
  const politeness = candidate.politeness ?? 'polite';
  if (politeness !== 'polite' && politeness !== 'assertive') return null;
  return Object.freeze({ message: candidate.message, politeness });
}

function createLiveRegion(
  document: Document,
  politeness: BomCanvasLivePoliteness,
  enabled: boolean,
): HTMLDivElement {
  const region = document.createElement('div');
  region.setAttribute('data-bom-live-region', politeness);
  region.setAttribute('role', politeness === 'polite' ? 'status' : 'alert');
  region.setAttribute('aria-live', enabled ? politeness : 'off');
  region.setAttribute('aria-atomic', 'true');
  region.setAttribute('aria-relevant', 'additions text');
  setStyles(region, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  });
  return region;
}

function rendererTimerHost(document: Document): {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
} | null {
  const candidate = document.defaultView as unknown as {
    readonly setTimeout?: unknown;
    readonly clearTimeout?: unknown;
  } | null;
  if (
    typeof candidate?.setTimeout !== 'function' ||
    typeof candidate.clearTimeout !== 'function'
  ) {
    return null;
  }
  return candidate as {
    setTimeout(callback: () => void, delay: number): number;
    clearTimeout(handle: number): void;
  };
}

function normalizeRendererLocale(value: unknown): BomEditorLocale | null {
  return value === 'zh-CN' || value === 'en-US' ? value : null;
}

function mergeRendererLabelOverrides(
  base: Readonly<BomCanvasRendererLabelOverrides>,
  input: Readonly<BomCanvasRendererLabelOverrides> | undefined,
): Readonly<BomCanvasRendererLabelOverrides> | null {
  if (input === undefined) return base;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const stringKeys = ['treegridLabel', 'treegridDescription', 'editorLabel', 'rowNumberHeader'] as const;
  for (const key of stringKeys) {
    const value = input[key];
    if (!isLocalizedLabelValue(value)) return null;
  }
  const contextMenu = input.contextMenu;
  if (contextMenu !== undefined) {
    if (typeof contextMenu !== 'object' || contextMenu === null || Array.isArray(contextMenu)) return null;
    for (const value of Object.values(contextMenu)) {
      if (!isLocalizedLabelValue(value)) return null;
    }
  }
  const liveRegion = input.liveRegion;
  if (liveRegion !== undefined) {
    if (typeof liveRegion !== 'object' || liveRegion === null || Array.isArray(liveRegion)) return null;
    for (const value of Object.values(liveRegion)) {
      if (!isLocalizedLabelValue(value)) return null;
    }
  }
  const diff = input.diff;
  if (diff !== undefined) {
    if (typeof diff !== 'object' || diff === null || Array.isArray(diff)) return null;
    for (const value of Object.values(diff)) {
      if (!isLocalizedLabelValue(value)) return null;
    }
  }
  return Object.freeze({
    ...(input.treegridLabel === undefined && base.treegridLabel === undefined
      ? {}
      : { treegridLabel: input.treegridLabel ?? base.treegridLabel }),
    ...(input.treegridDescription === undefined && base.treegridDescription === undefined
      ? {}
      : { treegridDescription: input.treegridDescription ?? base.treegridDescription }),
    ...(input.editorLabel === undefined && base.editorLabel === undefined
      ? {}
      : { editorLabel: input.editorLabel ?? base.editorLabel }),
    ...(input.rowNumberHeader === undefined && base.rowNumberHeader === undefined
      ? {}
      : { rowNumberHeader: input.rowNumberHeader ?? base.rowNumberHeader }),
    contextMenu: Object.freeze({
      ...(base.contextMenu ?? {}),
      ...(contextMenu ?? {}),
    }),
    liveRegion: Object.freeze({
      ...(base.liveRegion ?? {}),
      ...(liveRegion ?? {}),
    }),
    diff: Object.freeze({
      ...(base.diff ?? {}),
      ...(diff ?? {}),
    }),
  });
}

function isLocalizedLabelValue(value: unknown): boolean {
  if (value === undefined || typeof value === 'string') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<'zh-CN' | 'en-US', unknown>>;
  return typeof candidate['zh-CN'] === 'string' &&
    (candidate['en-US'] === undefined || typeof candidate['en-US'] === 'string');
}

function resolveRendererLabels(
  locale: BomEditorLocale,
  overrides: Readonly<BomCanvasRendererLabelOverrides>,
): Readonly<ResolvedRendererLabels> {
  const base = resolveBomCanvasLabels(locale);
  return Object.freeze({
    treegridLabel: resolveRendererLabelValue(
      overrides.treegridLabel,
      locale,
    ) ?? base.treegridLabel,
    treegridDescription: resolveRendererLabelValue(
      overrides.treegridDescription,
      locale,
    ) ?? base.treegridDescription ?? '',
    editorLabel: resolveRendererLabelValue(
      overrides.editorLabel,
      locale,
    ) ?? base.editorLabel,
    rowNumberHeader: resolveRendererLabelValue(
      overrides.rowNumberHeader,
      locale,
    ) ?? base.rowNumberHeader,
    contextMenu: resolveRendererLabelMap(base.contextMenu, overrides.contextMenu, locale),
    liveRegion: resolveRendererLabelMap(base.liveRegion, overrides.liveRegion, locale),
    diff: resolveRendererLabelMap(base.diff, overrides.diff, locale),
  });
}

function resolveRendererLabelMap(
  base: Readonly<object> | undefined,
  overrides: Readonly<object> | undefined,
  locale: BomEditorLocale,
): Readonly<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(base ?? {})) {
    if (typeof value === 'string') resolved[key] = value;
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const localized = resolveRendererLabelValue(
      value as import('./types.js').BomCanvasLocalizedText,
      locale,
    );
    if (localized !== undefined) resolved[key] = localized;
  }
  return Object.freeze(resolved);
}

function resolveRendererLabelValue(
  value: import('./types.js').BomCanvasLocalizedText | undefined,
  locale: BomEditorLocale,
): string | undefined {
  if (value === undefined || typeof value === 'string') return value;
  return resolveLocalizedText(value, locale);
}

function mergeRendererTheme(
  base: Readonly<BomCanvasTheme>,
  input: Readonly<Partial<Readonly<BomCanvasTheme>>> | undefined,
): Readonly<BomCanvasTheme> | null {
  if (input === undefined) return base;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const keys: readonly (keyof BomCanvasTheme)[] = [
    'background',
    'frozenBackground',
    'rowAlternateBackground',
    'gridLine',
    'text',
    'activeCell',
    'activeCellFill',
    'rangeFill',
    'fillPreviewFill',
    'fillPreviewBorder',
    'expander',
    'diffAddedFill',
    'diffDeletedFill',
    'diffChangedFill',
    'diffMarker',
    'font',
  ];
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && typeof value !== 'string') return null;
  }
  return Object.freeze({ ...base, ...input });
}

function presentationState<TFields extends BomFields>(
  options: Readonly<ResolvedRendererOptions<TFields>>,
): Readonly<BomCanvasPresentationState> {
  return Object.freeze({
    locale: options.locale,
    direction: options.direction,
    labels: Object.freeze({
      ...options.labels,
      contextMenu: Object.freeze({ ...(options.labels.contextMenu ?? {}) }),
      liveRegion: Object.freeze({ ...(options.labels.liveRegion ?? {}) }),
      diff: Object.freeze({ ...(options.labels.diff ?? {}) }),
    }),
    theme: Object.freeze({ ...options.theme }),
  });
}

function presentationFailure(
  code: BomCanvasPresentationDiagnostic['code'],
): BomCanvasPresentationConfigurationResult {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([
      Object.freeze({ code, severity: 'error' as const }),
    ]),
  });
}

function validateViewModel<TFields extends BomFields>(
  viewModel: Readonly<BomCanvasViewModel<TFields>>,
): void {
  if (viewModel.selection.range === undefined) {
    throw new Error('BOM_RENDERER_INVALID_SELECTION');
  }
  if (
    viewModel.revision !== viewModel.snapshot.revision ||
    !Number.isSafeInteger(viewModel.documentGeneration) ||
    viewModel.documentGeneration < 0 ||
    viewModel.indexes.rowById.size !== viewModel.snapshot.nodes.length ||
    !Number.isSafeInteger(viewModel.projection.visibleCount) ||
    viewModel.projection.visibleCount < 0 ||
    !Number.isFinite(viewModel.projection.totalHeight) ||
    viewModel.projection.totalHeight < 0
  ) {
    throw new Error('BOM_RENDERER_REVISION_MISMATCH');
  }
  validateDiffView(viewModel.diffView);
  const columnIds = new Set<string>();
  const visibleColumnIds = new Set<string>();
  for (const column of viewModel.columns) {
    if (
      typeof column.columnId !== 'string' ||
      column.columnId.length === 0 ||
      columnIds.has(column.columnId) ||
      !Number.isFinite(column.width) ||
      column.width <= 0 ||
      (column.visible !== undefined && typeof column.visible !== 'boolean')
    ) {
      throw new Error('BOM_RENDERER_INVALID_COLUMNS');
    }
    columnIds.add(column.columnId);
    if (column.visible !== false) {
      visibleColumnIds.add(column.columnId);
    }
  }
  const diffView = viewModel.diffView;
  const diffViewIsCurrent =
    diffView !== undefined &&
    diffView !== null &&
    diffView.documentId === viewModel.snapshot.documentId &&
    diffView.documentGeneration === viewModel.documentGeneration &&
    diffView.viewRevision === viewModel.revision;
  if (diffViewIsCurrent && diffView !== undefined && diffView !== null) {
    for (const row of diffView.rows) {
      if (!viewModel.indexes.rowById.has(row.occurrenceId)) {
        throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
      }
    }
    for (const cell of diffView.cells) {
      if (
        !viewModel.indexes.rowById.has(cell.occurrenceId) ||
        !columnIds.has(cell.columnId)
      ) {
        throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
      }
    }
    for (const summary of diffView.deletedRows ?? []) {
      if (
        viewModel.indexes.rowById.has(summary.occurrenceId) ||
        ((summary.position === 'before' || summary.position === 'after') &&
          (summary.anchorOccurrenceId === undefined ||
            !viewModel.indexes.rowById.has(summary.anchorOccurrenceId)))
      ) {
        throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
      }
    }
    const ghostIds = new Set<string>(
      (diffView.deletedRows ?? []).map((summary) => summary.occurrenceId),
    );
    for (const ghost of diffView.ghostRows ?? []) {
      if (
        viewModel.indexes.rowById.has(ghost.occurrenceId) ||
        ghostIds.has(ghost.occurrenceId) ||
        ((ghost.position === 'before' || ghost.position === 'after') &&
          (ghost.anchorOccurrenceId === undefined ||
            !viewModel.indexes.rowById.has(ghost.anchorOccurrenceId)))
      ) {
        throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
      }
      ghostIds.add(ghost.occurrenceId);
    }
  }
  const addresses = [
    viewModel.selection.activeCell,
    viewModel.selection.range?.anchor ?? null,
    viewModel.selection.range?.focus ?? null,
    draftAddress(viewModel.editState),
  ];
  for (const address of addresses) {
    if (
      address !== null &&
      (!viewModel.indexes.rowById.has(address.occurrenceId) ||
        !visibleColumnIds.has(address.columnId))
    ) {
      throw new Error('BOM_RENDERER_INVALID_CELL_ADDRESS');
    }
  }
  const { activeCell, range } = viewModel.selection;
  if (
    viewModel.selection.mode !== undefined &&
    viewModel.selection.mode !== 'row' &&
    viewModel.selection.mode !== 'column'
  ) {
    throw new Error('BOM_RENDERER_INVALID_SELECTION');
  }
  const ranges = viewModel.selection.ranges;
  if (ranges !== undefined) {
    if (
      ranges.length < 2 ||
      viewModel.selection.mode !== undefined ||
      viewModel.selection.activeCell === null ||
      !ranges.some((range) =>
        sameAddress(range.focus, viewModel.selection.activeCell))
    ) {
      throw new Error('BOM_RENDERER_INVALID_SELECTION');
    }
    for (const range of ranges) {
      addresses.push(range.anchor, range.focus);
    }
  }
  if (
    (activeCell === null && range !== null) ||
    (activeCell !== null &&
      range !== null &&
      (!sameAddress(activeCell, range.focus) ||
        (viewModel.selection.mode === undefined &&
          sameAddress(range.anchor, range.focus))))
  ) {
    throw new Error('BOM_RENDERER_INVALID_SELECTION');
  }
  if (viewModel.selection.mode !== undefined && range === null) {
    throw new Error('BOM_RENDERER_INVALID_SELECTION');
  }
  for (const address of [
    activeCell,
    range?.anchor ?? null,
    range?.focus ?? null,
  ]) {
    if (address === null) {
      continue;
    }
    const visibleIndex = viewModel.projection.indexOf(address.occurrenceId);
    if (!visibleIndex.ok || visibleIndex.value === undefined) {
      throw new Error('BOM_RENDERER_INVALID_SELECTION');
    }
  }
  if (ranges !== undefined) {
    for (const range of ranges) {
      for (const address of [range.anchor, range.focus]) {
        if (
          !viewModel.indexes.rowById.has(address.occurrenceId) ||
          !visibleColumnIds.has(address.columnId)
        ) {
          throw new Error('BOM_RENDERER_INVALID_CELL_ADDRESS');
        }
        const visibleIndex = viewModel.projection.indexOf(address.occurrenceId);
        if (!visibleIndex.ok || visibleIndex.value === undefined) {
          throw new Error('BOM_RENDERER_INVALID_SELECTION');
        }
      }
    }
  }
}

function validateDiffView(
  diffView: Readonly<BomCanvasDiffView> | null | undefined,
): void {
  if (diffView === undefined || diffView === null) {
    return;
  }
  if (
    typeof diffView !== 'object' ||
    Array.isArray(diffView) ||
    diffView.protocol !== BOM_CANVAS_DIFF_VIEW_PROTOCOL ||
    typeof diffView.documentId !== 'string' ||
    diffView.documentId.length === 0 ||
    !Number.isSafeInteger(diffView.documentGeneration) ||
    diffView.documentGeneration < 0 ||
    typeof diffView.viewRevision !== 'string' ||
    diffView.viewRevision.length === 0 ||
    !Array.isArray(diffView.rows) ||
    !Array.isArray(diffView.cells) ||
    (diffView.deletedRows !== undefined && !Array.isArray(diffView.deletedRows)) ||
    (diffView.ghostRows !== undefined && !Array.isArray(diffView.ghostRows)) ||
    diffView.rows.length + diffView.cells.length +
      (diffView.deletedRows?.length ?? 0) +
      (diffView.ghostRows?.length ?? 0) > MAX_DIFF_DECORATIONS
  ) {
    throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
  }
  const kinds = new Set<BomCanvasDiffKind>([
    'inserted',
    'deleted',
    'changed',
    'moved',
    'reordered',
    'material',
  ]);
  for (const row of diffView.rows) {
    if (
      row === null ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      typeof row.occurrenceId !== 'string' ||
      row.occurrenceId.length === 0 ||
      !kinds.has(row.kind)
    ) {
      throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
    }
  }
  for (const cell of diffView.cells) {
    if (
      cell === null ||
      typeof cell !== 'object' ||
      Array.isArray(cell) ||
      typeof cell.occurrenceId !== 'string' ||
      cell.occurrenceId.length === 0 ||
      typeof cell.columnId !== 'string' ||
      cell.columnId.length === 0 ||
      !kinds.has(cell.kind)
    ) {
      throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
    }
  }
  for (const summary of diffView.deletedRows ?? []) {
    if (
      summary === null ||
      typeof summary !== 'object' ||
      Array.isArray(summary) ||
      typeof summary.occurrenceId !== 'string' ||
      summary.occurrenceId.length === 0 ||
      (summary.anchorOccurrenceId !== undefined &&
        (typeof summary.anchorOccurrenceId !== 'string' ||
          summary.anchorOccurrenceId.length === 0)) ||
      (summary.position !== 'before' &&
        summary.position !== 'after' &&
        summary.position !== 'start' &&
        summary.position !== 'end') ||
      ((summary.position === 'before' || summary.position === 'after') &&
        summary.anchorOccurrenceId === undefined) ||
      ((summary.position === 'start' || summary.position === 'end') &&
        summary.anchorOccurrenceId !== undefined) ||
      !Number.isSafeInteger(summary.count) ||
      summary.count <= 0
    ) {
      throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
    }
  }
  for (const ghost of diffView.ghostRows ?? []) {
    if (
      ghost === null ||
      typeof ghost !== 'object' ||
      Array.isArray(ghost) ||
      typeof ghost.occurrenceId !== 'string' ||
      ghost.occurrenceId.length === 0 ||
      (ghost.anchorOccurrenceId !== undefined &&
        (typeof ghost.anchorOccurrenceId !== 'string' ||
          ghost.anchorOccurrenceId.length === 0)) ||
      (ghost.position !== 'before' &&
        ghost.position !== 'after' &&
        ghost.position !== 'start' &&
        ghost.position !== 'end') ||
      ((ghost.position === 'before' || ghost.position === 'after') &&
        ghost.anchorOccurrenceId === undefined) ||
      ((ghost.position === 'start' || ghost.position === 'end') &&
        ghost.anchorOccurrenceId !== undefined) ||
      (ghost.depth !== undefined &&
        (!Number.isSafeInteger(ghost.depth) || ghost.depth < 1 || ghost.depth > 1024))
    ) {
      throw new Error('BOM_RENDERER_INVALID_DIFF_VIEW');
    }
  }
}

function visibleCellRect(
  row: Readonly<BomCanvasRowLayout>,
  column: Readonly<BomCanvasColumnLayout>,
  frozenWidth: number,
  trailingFrozenStart: number,
  bodyTop: number,
): Readonly<BomCanvasRect> | null {
  const left = column.frozen ? column.x : Math.max(column.x, frozenWidth);
  const right = column.frozen
    ? column.x + column.width
    : Math.min(column.x + column.width, trailingFrozenStart);
  const top = Math.max(row.y, bodyTop);
  const bottom = row.y + row.height;
  if (right <= left || bottom <= top) {
    return null;
  }
  return Object.freeze({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function visibleColumnRect(
  column: Readonly<BomCanvasColumnLayout>,
  frozenWidth: number,
  trailingFrozenStart: number,
  y: number,
  height: number,
): Readonly<BomCanvasRect> | null {
  const left = column.frozen ? column.x : Math.max(column.x, frozenWidth);
  const right = column.frozen
    ? column.x + column.width
    : Math.min(column.x + column.width, trailingFrozenStart);
  if (right <= left || height <= 0) {
    return null;
  }
  return Object.freeze({
    x: left,
    y,
    width: right - left,
    height,
  });
}

interface CanvasHeaderGroupSegment {
  readonly label: string;
  readonly x: number;
  readonly width: number;
  readonly columnCount: number;
  readonly firstColumnIndex: number;
}

interface CanvasHeaderGroupAccumulator {
  readonly key: string;
  readonly label: string;
  readonly x: number;
  readonly right: number;
  readonly columnCount: number;
  readonly firstColumnIndex: number;
}

function headerGroupDepth(
  columns: readonly Readonly<BomColumnDefinition>[],
): number {
  return columns.reduce(
    (depth, column) => Math.max(depth, column.visible === false ? 0 : column.headerGroup?.length ?? 0),
    0,
  );
}

/**
 * Resolves contiguous visible header cells into merged group bands. A band is
 * never allowed to cross a frozen edge, a scrolled gap, or a different parent
 * group path, which keeps partial horizontal windows semantically correct.
 */
function headerGroupSegments(
  columns: readonly Readonly<BomCanvasColumnLayout>[],
  groupIndex: number,
  frozenWidth: number,
  trailingFrozenStart: number,
): readonly Readonly<CanvasHeaderGroupSegment>[] {
  const segments: CanvasHeaderGroupSegment[] = [];
  let current: CanvasHeaderGroupAccumulator | null = null;
  const flush = (): void => {
    if (current === null) return;
    segments.push(Object.freeze({
      label: current.label,
      x: current.x,
      width: Math.max(0, current.right - current.x),
      columnCount: current.columnCount,
      firstColumnIndex: current.firstColumnIndex,
    }));
    current = null;
  };
  for (const column of columns) {
    const rect = visibleColumnRect(
      column,
      frozenWidth,
      trailingFrozenStart,
      0,
      1,
    );
    if (rect === null) {
      flush();
      continue;
    }
    const groups = column.column.headerGroup ?? [];
    const label = groups[groupIndex] ?? '';
    const parent = groups.slice(0, groupIndex).join('\u001f');
    const key = `${column.frozen ? 'frozen' : 'scroll'}\u0000${parent}\u0000${label}`;
    const contiguous = current !== null &&
      current.key === key &&
      Math.abs(rect.x - current.right) <= 0.5;
    if (!contiguous) {
      flush();
      current = {
        key,
        label,
        x: rect.x,
        right: rect.x + rect.width,
        columnCount: 1,
        firstColumnIndex: column.columnIndex,
      };
      continue;
    }
    const previous: CanvasHeaderGroupAccumulator | null = current;
    if (previous === null) {
      continue;
    }
    current = {
      ...previous,
      right: rect.x + rect.width,
      columnCount: previous.columnCount + 1,
    };
  }
  flush();
  return Object.freeze(segments);
}

function rectIntersectsViewport(
  rect: Readonly<BomCanvasRect>,
  layout: Readonly<RendererLayout> | null,
): boolean {
  return (
    layout !== null &&
    rect.x < layout.viewportWidth &&
    rect.x + rect.width > 0 &&
    rect.y < layout.viewportHeight &&
    rect.y + rect.height > 0
  );
}

function fullColumnPosition(
  columns: readonly Readonly<BomColumnDefinition>[],
  targetIndex: number,
  leadingFrozenWidth: number,
): Readonly<{
  frozen: 'start' | 'end' | false;
  frozenWidth: number;
  trailingFrozenWidth: number;
  contentStart: number;
  width: number;
  totalWidth: number;
}> {
  let frozenWidth = leadingFrozenWidth;
  let trailingFrozenWidth = 0;
  let scrollableWidth = 0;
  for (const column of columns) {
    if (column.visible === false) {
      continue;
    }
    if (column.frozen === 'start') {
      frozenWidth += column.width;
    } else if (column.frozen === 'end') {
      trailingFrozenWidth += column.width;
    } else {
      scrollableWidth += column.width;
    }
  }
  const target = columns[targetIndex]!;
  if (target.frozen === 'start') {
    let start = leadingFrozenWidth;
    for (let index = 0; index < targetIndex; index += 1) {
      const column = columns[index]!;
      if (column.visible === false) {
        continue;
      }
      if (column.frozen === 'start') {
        start += column.width;
      }
    }
    return Object.freeze({
      frozen: 'start',
      frozenWidth,
      trailingFrozenWidth,
      contentStart: start,
      width: target.width,
      totalWidth: frozenWidth + scrollableWidth + trailingFrozenWidth,
    });
  }
  if (target.frozen === 'end') {
    let offset = 0;
    for (let index = 0; index < targetIndex; index += 1) {
      const column = columns[index]!;
      if (column.visible !== false && column.frozen === 'end') {
        offset += column.width;
      }
    }
    return Object.freeze({
      frozen: 'end',
      frozenWidth,
      trailingFrozenWidth,
      contentStart: frozenWidth + scrollableWidth + offset,
      width: target.width,
      totalWidth: frozenWidth + scrollableWidth + trailingFrozenWidth,
    });
  }
  let scrollableStart = 0;
  for (let index = 0; index < targetIndex; index += 1) {
    const column = columns[index]!;
    if (column.visible === false) {
      continue;
    }
    if (column.frozen === false) {
      scrollableStart += column.width;
    }
  }
  return Object.freeze({
    frozen: false,
    frozenWidth,
    trailingFrozenWidth,
    contentStart: frozenWidth + scrollableStart,
    width: target.width,
    totalWidth: frozenWidth + scrollableWidth + trailingFrozenWidth,
  });
}

function isClipboardCopyShortcut(event: KeyboardEvent): boolean {
  return (
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    typeof event.key === 'string' &&
    event.key.toLowerCase() === 'c'
  );
}

function isClipboardCutShortcut(event: KeyboardEvent): boolean {
  return (
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    typeof event.key === 'string' &&
    event.key.toLowerCase() === 'x'
  );
}

function isClipboardBranchCopyShortcut(event: KeyboardEvent): boolean {
  return (
    event.shiftKey &&
    !event.altKey &&
    (event.ctrlKey || event.metaKey) &&
    typeof event.key === 'string' &&
    event.key.toLowerCase() === 'b'
  );
}

function isClipboardBranchCutShortcut(event: KeyboardEvent): boolean {
  return (
    event.shiftKey &&
    !event.altKey &&
    (event.ctrlKey || event.metaKey) &&
    typeof event.key === 'string' &&
    event.key.toLowerCase() === 'k'
  );
}

function expansionShortcut(event: KeyboardEvent): boolean | null {
  if (
    !(event.ctrlKey || event.metaKey) ||
    !event.shiftKey ||
    event.altKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    (typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  ) {
    return null;
  }
  if (event.key === 'ArrowDown') return true;
  if (event.key === 'ArrowUp') return false;
  return null;
}

function columnResizeShortcut(event: KeyboardEvent): -1 | 1 | null {
  if (
    !event.altKey ||
    event.shiftKey ||
    (!event.ctrlKey && !event.metaKey)
  ) {
    return null;
  }
  if (event.key === 'ArrowLeft') return -1;
  if (event.key === 'ArrowRight') return 1;
  return null;
}

function columnReorderShortcut(event: KeyboardEvent): -1 | 1 | null {
  if (
    event.altKey ||
    !event.shiftKey ||
    (!event.ctrlKey && !event.metaKey)
  ) {
    return null;
  }
  if (event.key === 'ArrowLeft') return -1;
  if (event.key === 'ArrowRight') return 1;
  return null;
}

function columnVisibilityShortcut(
  event: KeyboardEvent,
): Readonly<{
  readonly action: 'hide' | 'show-all';
  readonly id:
    | 'grid.hide-column'
    | 'grid.show-all-columns'
    | 'grid.hide-column-excel'
    | 'grid.show-all-columns-excel';
}> | null {
  if (
    (!event.ctrlKey && !event.metaKey) ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    (typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  ) {
    return null;
  }
  if (event.key?.toLowerCase() === 'h' && event.shiftKey) {
    return event.altKey
      ? Object.freeze({ action: 'show-all', id: 'grid.show-all-columns' })
      : Object.freeze({ action: 'hide', id: 'grid.hide-column' });
  }
  if (event.altKey || (event.key !== '0' && event.code !== 'Digit0')) {
    return null;
  }
  return event.shiftKey
    ? Object.freeze({ action: 'show-all', id: 'grid.show-all-columns-excel' })
    : Object.freeze({ action: 'hide', id: 'grid.hide-column-excel' });
}

function columnInsertShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    !event.altKey &&
    !event.repeat &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    (event.code === 'Equal' || event.key === '+' || event.key === '=') &&
    !(typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  );
}

function columnDeleteShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    !event.repeat &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    (event.code === 'Minus' || event.key === '-') &&
    !(typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  );
}

function columnFrozenShortcut(
  event: KeyboardEvent,
): Readonly<{
  readonly frozen: 'start' | 'end' | false;
  readonly id:
    | 'grid.freeze-column-start'
    | 'grid.freeze-column-end'
    | 'grid.unfreeze-column';
}> | null {
  if (
    !(event.ctrlKey || event.metaKey) ||
    !event.altKey ||
    !event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    (typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  ) {
    return null;
  }
  if (event.key === 'ArrowLeft') {
    return Object.freeze({ frozen: 'start', id: 'grid.freeze-column-start' });
  }
  if (event.key === 'ArrowRight') {
    return Object.freeze({ frozen: 'end', id: 'grid.freeze-column-end' });
  }
  if (event.key === 'ArrowUp') {
    return Object.freeze({ frozen: false, id: 'grid.unfreeze-column' });
  }
  return null;
}

function structuralInsertShortcut(
  event: KeyboardEvent,
): BomTreeInsertMode | null {
  if (
    (event.key !== 'Insert' && event.key !== 'insert') ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    (typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  ) {
    return null;
  }
  return event.ctrlKey || event.metaKey ? 'child' : 'sibling';
}

function structuralMoveShortcut(
  event: KeyboardEvent,
): 'up' | 'down' | 'indent' | 'outdent' | null {
  if (
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    (typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  ) {
    return null;
  }
  switch (event.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'outdent';
    case 'ArrowRight':
      return 'indent';
    default:
      return null;
  }
}

function isDeleteSubtreeShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === 'Delete' &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.repeat &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    !(typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  );
}

function isSelectAllShortcut(event: KeyboardEvent): boolean {
  return (
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    typeof event.key === 'string' &&
    event.key.toLowerCase() === 'a'
  );
}

function selectionAxisShortcut(event: KeyboardEvent): BomSelectionMode | null {
  if (
    (event.key !== ' ' && event.key !== 'Spacebar') ||
    event.altKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    (typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  ) {
    return null;
  }
  if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
    return 'row';
  }
  if (!event.shiftKey && (event.ctrlKey || event.metaKey)) {
    return 'column';
  }
  return null;
}

function isClearSelectionShortcut(event: KeyboardEvent): boolean {
  if (
    (event.key !== 'Delete' && event.key !== 'Backspace') ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229
  ) {
    return false;
  }
  return !(
    typeof event.getModifierState === 'function' &&
    event.getModifierState('AltGraph')
  );
}

function isFillDownShortcut(event: KeyboardEvent): boolean {
  if (
    typeof event.key !== 'string' ||
    event.key.toLowerCase() !== 'd' ||
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229
  ) {
    return false;
  }
  return !(
    typeof event.getModifierState === 'function' &&
    event.getModifierState('AltGraph')
  );
}

function isPrimaryModifiedEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

function isFillSelectionShortcut(event: KeyboardEvent): boolean {
  if (
    !isPrimaryModifiedEnter(event) ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    (typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph'))
  ) {
    return false;
  }
  return true;
}

function hasFillSelectionRange<TFields extends BomFields>(
  viewModel: Readonly<BomCanvasViewModel<TFields>>,
  address: Readonly<BomCellAddress>,
): boolean {
  const active = viewModel.selection.activeCell;
  if (
    viewModel.selection.mode !== undefined ||
    active === null ||
    active.occurrenceId !== address.occurrenceId ||
    active.columnId !== address.columnId
  ) {
    return false;
  }
  const ranges = viewModel.selection.ranges ??
    (viewModel.selection.range === null ? [] : [viewModel.selection.range]);
  if (ranges.length === 0) return false;
  let activeRange = false;
  for (const range of ranges) {
    if (
      range.anchor.columnId !== address.columnId ||
      range.focus.columnId !== address.columnId
    ) {
      return false;
    }
    const anchorRow = viewModel.projection.indexOf(range.anchor.occurrenceId);
    const focusRow = viewModel.projection.indexOf(range.focus.occurrenceId);
    if (
      !anchorRow.ok ||
      anchorRow.value === undefined ||
      !focusRow.ok ||
      focusRow.value === undefined ||
      anchorRow.value === focusRow.value
    ) {
      return false;
    }
    if (
      range.anchor.occurrenceId === address.occurrenceId ||
      range.focus.occurrenceId === address.occurrenceId
    ) {
      activeRange = true;
    }
  }
  return activeRange;
}

function historyShortcut(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.repeat ||
    (typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph')) ||
    typeof event.key !== 'string'
  ) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (!event.shiftKey && key === 'z') {
    return 'undo';
  }
  if ((!event.shiftKey && key === 'y') || (event.shiftKey && key === 'z')) {
    return 'redo';
  }
  return null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
  ) && typeof (value as { readonly then?: unknown }).then === 'function';
}

function isReplaceEditKey(event: KeyboardEvent): boolean {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    event.repeat ||
    event.key === 'Dead' ||
    event.key === 'Unidentified'
  ) {
    return false;
  }
  if (
    typeof event.getModifierState === 'function' &&
    event.getModifierState('AltGraph')
  ) {
    return false;
  }
  return (
    Array.from(event.key).length === 1 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(event.key)
  );
}

function isExpandable<TFields extends BomFields>(
  node: Readonly<BomNode<TFields>>,
  childrenByParent: ReadonlyMap<OccurrenceId | null, readonly OccurrenceId[]>,
): boolean {
  return (
    (childrenByParent.get(node.occurrenceId)?.length ?? 0) > 0 ||
    (node.knownChildCount ?? 0) > 0 ||
    node.childrenState === 'partial' ||
    node.childrenState === 'unloaded'
  );
}

function valueAtPath(
  fields: Readonly<Record<string, BomValue>>,
  path: readonly string[],
): BomValue | undefined {
  if (path.length === 0) {
    return undefined;
  }
  let current: BomValue | undefined = fields[path[0]!];
  for (let index = 1; index < path.length; index += 1) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !isBomObjectRecord(current)
    ) {
      return undefined;
    }
    current = current[path[index]!];
  }
  return current;
}

function bomValueToText(value: BomValue | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isBomInteger(value)) {
    return value.value;
  }
  if (isBomDecimal(value)) {
    return value.unit === undefined ? value.value : `${value.value} ${value.unit}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function formatColumnValue(
  value: BomValue | undefined,
  column: Readonly<BomColumnDefinition>,
  locale?: string,
): string {
  const format = column.format;
  if (format === undefined || format.kind === 'text') {
    return bomValueToText(value);
  }
  try {
    switch (format.kind) {
      case 'integer': {
        const numeric = numericColumnValue(value);
        return numeric === null
          ? bomValueToText(value)
          : new Intl.NumberFormat(locale, {
              maximumFractionDigits: 0,
              useGrouping: format.useGrouping,
            }).format(numeric);
      }
      case 'decimal': {
        const numeric = numericColumnValue(value);
        if (numeric === null) return bomValueToText(value);
        const text = new Intl.NumberFormat(locale, {
          minimumFractionDigits: format.minimumFractionDigits,
          maximumFractionDigits: format.maximumFractionDigits,
          useGrouping: format.useGrouping,
        }).format(numeric);
        return format.unit === 'hidden' || !isBomDecimal(value) ||
            value.unit === undefined
          ? text
          : `${text} ${value.unit}`;
      }
      case 'percent': {
        const numeric = numericColumnValue(value);
        return numeric === null
          ? bomValueToText(value)
          : new Intl.NumberFormat(locale, {
              style: 'percent',
              minimumFractionDigits: format.minimumFractionDigits,
              maximumFractionDigits: format.maximumFractionDigits,
            }).format(numeric);
      }
      case 'currency': {
        const numeric = numericColumnValue(value);
        return numeric === null
          ? bomValueToText(value)
          : new Intl.NumberFormat(locale, {
              style: 'currency',
              currency: format.currency,
              minimumFractionDigits: format.minimumFractionDigits,
              maximumFractionDigits: format.maximumFractionDigits,
            }).format(numeric);
      }
      case 'accounting': {
        const numeric = numericColumnValue(value);
        return numeric === null
          ? bomValueToText(value)
          : new Intl.NumberFormat(locale, {
              style: 'currency',
              currency: format.currency,
              currencySign: 'accounting',
              minimumFractionDigits: format.minimumFractionDigits,
              maximumFractionDigits: format.maximumFractionDigits,
              useGrouping: format.useGrouping,
            }).format(numeric);
      }
      case 'scientific': {
        const numeric = numericColumnValue(value);
        return numeric === null
          ? bomValueToText(value)
          : new Intl.NumberFormat(locale, {
              notation: 'scientific',
              minimumFractionDigits: format.minimumFractionDigits,
              maximumFractionDigits: format.maximumFractionDigits,
            }).format(numeric);
      }
      case 'fraction': {
        const numeric = numericColumnValue(value);
        return numeric === null
          ? bomValueToText(value)
          : formatFractionValue(
              numeric,
              format.maximumDenominator ?? 100,
              format.useGrouping,
              locale,
            );
      }
      case 'date':
      case 'datetime': {
        if (typeof value !== 'string') return bomValueToText(value);
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        const dateStyle = format.dateStyle;
        const timeStyle = format.kind === 'datetime' ? format.timeStyle : undefined;
        if (dateStyle !== undefined || timeStyle !== undefined) {
          return new Intl.DateTimeFormat(
            locale,
            format.kind === 'date'
              ? { dateStyle: dateStyle ?? 'short' }
              : {
                  dateStyle: dateStyle ?? 'short',
                  timeStyle: timeStyle ?? 'short',
                },
          ).format(date);
        }
        return new Intl.DateTimeFormat(
          locale,
          format.kind === 'date'
            ? { year: 'numeric', month: '2-digit', day: '2-digit' }
            : {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              },
        ).format(date);
      }
    }
  } catch {
    // Intl may reject a host-provided locale or currency. Rendering remains
    // available with the canonical text rather than failing the frame.
    return bomValueToText(value);
  }
}

function numericColumnValue(value: BomValue | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (isBomInteger(value) || isBomDecimal(value)) {
    const numeric = Number(value.value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function formatFractionValue(
  numeric: number,
  maximumDenominator: number,
  useGrouping: boolean | undefined,
  locale?: string,
): string {
  const negative = numeric < 0;
  let absolute = Math.abs(numeric);
  let whole = Math.floor(absolute);
  const approximation = approximateFraction(absolute - whole, maximumDenominator);
  whole += Math.floor(approximation.numerator / approximation.denominator);
  const numerator = approximation.numerator % approximation.denominator;
  const wholeText = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping,
  }).format(whole);
  const sign = negative && (whole !== 0 || numerator !== 0) ? '-' : '';
  if (numerator === 0) return sign + wholeText;
  const fractionText = `${numerator}/${approximation.denominator}`;
  return whole === 0 ? sign + fractionText : `${sign}${wholeText} ${fractionText}`;
}

function approximateFraction(
  value: number,
  maximumDenominator: number,
): Readonly<{ numerator: number; denominator: number }> {
  if (value <= Number.EPSILON) {
    return Object.freeze({ numerator: 0, denominator: 1 });
  }
  let previousNumerator = 0;
  let currentNumerator = 1;
  let previousDenominator = 1;
  let currentDenominator = 0;
  let remainder = value;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const coefficient = Math.floor(remainder);
    const nextNumerator = coefficient * currentNumerator + previousNumerator;
    const nextDenominator = coefficient * currentDenominator + previousDenominator;
    if (nextDenominator > maximumDenominator) {
      const multiplier = currentDenominator === 0
        ? 0
        : Math.floor((maximumDenominator - previousDenominator) / currentDenominator);
      const boundedNumerator = previousNumerator + multiplier * currentNumerator;
      const boundedDenominator = previousDenominator + multiplier * currentDenominator;
      const boundedError = Math.abs(value - boundedNumerator / boundedDenominator);
      const currentError = Math.abs(value - currentNumerator / currentDenominator);
      return Object.freeze(
        boundedError < currentError
          ? { numerator: boundedNumerator, denominator: boundedDenominator }
          : { numerator: currentNumerator, denominator: currentDenominator },
      );
    }
    previousNumerator = currentNumerator;
    currentNumerator = nextNumerator;
    previousDenominator = currentDenominator;
    currentDenominator = nextDenominator;
    const fractionalPart = remainder - coefficient;
    if (fractionalPart <= Number.EPSILON) break;
    remainder = 1 / fractionalPart;
  }
  return Object.freeze({
    numerator: currentNumerator,
    denominator: currentDenominator,
  });
}

function editInputMode(column: Readonly<BomColumnDefinition>):
  | 'text'
  | 'numeric'
  | 'decimal' {
  switch (column.format?.kind) {
    case 'integer':
      return 'numeric';
    case 'decimal':
    case 'percent':
    case 'currency':
    case 'accounting':
    case 'scientific':
    case 'fraction':
      return 'decimal';
    default:
      // Date values remain text so the host Schema can accept its canonical
      // representation (for example an ISO-8601 string) without browser
      // input normalization.
      return 'text';
  }
}

function drawColumnCellText(
  context: CanvasRenderingContext2D,
  text: string,
  column: Readonly<BomColumnDefinition>,
  x: number,
  centerY: number,
  width: number,
  rowHeight: number,
  direction: BomCanvasTextDirection,
): void {
  const alignment = column.alignment ?? 'start';
  const right = x + width;
  const textAlign = alignment === 'center'
    ? 'center'
    : alignment === 'start'
      ? direction === 'rtl' ? 'right' : 'left'
      : direction === 'rtl' ? 'left' : 'right';
  const textX = textAlign === 'right'
    ? right
    : textAlign === 'center'
      ? x + width / 2
      : x;
  context.textAlign = textAlign;
  if (column.wrapText !== true || text.length === 0 || width <= 0) {
    context.fillText(text, textX, centerY, width);
    context.textAlign = 'left';
    return;
  }
  // Canvas text measurement is deliberately avoided here because constrained
  // browser test hosts need not implement it. The bound is conservative for
  // the default UI font and only affects visual line breaks, never cell data.
  const maxCharacters = Math.max(1, Math.floor(width / 7));
  const lines = wrapCanvasText(text, maxCharacters);
  const lineHeight = 14;
  const maxLines = Math.max(1, Math.floor((rowHeight - 4) / lineHeight));
  const displayed = lines.slice(0, maxLines);
  const firstY = centerY - ((displayed.length - 1) * lineHeight) / 2;
  for (let index = 0; index < displayed.length; index += 1) {
    context.fillText(displayed[index]!, textX, firstY + index * lineHeight, width);
  }
  context.textAlign = 'left';
}

function wrapCanvasText(text: string, maxCharacters: number): readonly string[] {
  const output: string[] = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    if (paragraph.length === 0) {
      output.push('');
      continue;
    }
    for (let start = 0; start < paragraph.length; start += maxCharacters) {
      output.push(paragraph.slice(start, start + maxCharacters));
    }
  }
  return output;
}

function isBomInteger(value: BomValue | undefined): value is BomInteger {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { readonly $type?: unknown };
  return candidate.$type === 'integer';
}

function isBomDecimal(value: BomValue | undefined): value is BomDecimal {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { readonly $type?: unknown };
  return candidate.$type === 'decimal';
}

function isBomObjectRecord(
  value: BomValue,
): value is { readonly [key: string]: BomValue } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !isBomInteger(value) &&
    !isBomDecimal(value)
  );
}

function draftAddress(
  editState: Readonly<BomEditState>,
): Readonly<BomCellAddress> | null {
  return editState.draft?.address ?? null;
}

function sameAddress(
  left: Readonly<BomCellAddress> | null,
  right: Readonly<BomCellAddress> | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.occurrenceId === right.occurrenceId &&
    left.columnId === right.columnId
  );
}

function diffCellKey(occurrenceId: string, columnId: string): string {
  return JSON.stringify([occurrenceId, columnId]);
}

function diffPrimaryKind(
  kinds: ReadonlySet<BomCanvasDiffKind>,
): BomCanvasDiffKind {
  const priority: readonly BomCanvasDiffKind[] = [
    'deleted',
    'inserted',
    'moved',
    'reordered',
    'material',
    'changed',
  ];
  return priority.find((kind) => kinds.has(kind)) ?? 'changed';
}

function diffKindsInStableOrder(
  kinds: ReadonlySet<BomCanvasDiffKind>,
): readonly BomCanvasDiffKind[] {
  const priority: readonly BomCanvasDiffKind[] = [
    'inserted',
    'deleted',
    'changed',
    'moved',
    'reordered',
    'material',
  ];
  return priority.filter((kind) => kinds.has(kind));
}

function diffLabel(
  labels: Readonly<BomCanvasDiffLabels> | undefined,
  kind: BomCanvasDiffKind,
): string | undefined {
  return labels?.[kind];
}

function formatDiffDeletionSummary(
  template: string | undefined,
  count: number,
): string {
  return (template ?? '').replaceAll('{count}', String(count));
}


function edgeScrollDelta(
  value: number,
  extent: number,
  edge: number,
  start = 0,
): number {
  const end = Math.max(start, extent);
  if (value < start + edge) {
    return -Math.min(24, Math.max(4, Math.ceil((start + edge - value) / 2)));
  }
  if (value > end - edge) {
    return Math.min(24, Math.max(4, Math.ceil((value - (end - edge)) / 2)));
  }
  return 0;
}

function writeClipboardPayloadToEvent(
  clipboardData: Readonly<{
    setData(type: string, data: string): void;
  }>,
  payload: Readonly<BomCanvasClipboardPayload>,
): void {
  clipboardData.setData('text/plain', payload.text);
  if (payload.html !== undefined) {
    clipboardData.setData('text/html', payload.html);
  }
  if (payload.internal !== undefined) {
    clipboardData.setData(BOM_INTERNAL_CLIPBOARD_MIME, payload.internal);
  }
}

function sameNullableAddress(
  left: Readonly<BomCellAddress> | null,
  right: Readonly<BomCellAddress> | null,
): boolean {
  return (left === null && right === null) || sameAddress(left, right);
}

function sameSelection(
  left: Readonly<BomSelectionState>,
  right: Readonly<BomSelectionState>,
): boolean {
  return (
    sameNullableAddress(left.activeCell, right.activeCell) &&
    left.mode === right.mode &&
    ((left.range === null && right.range === null) ||
      (left.range !== null &&
        right.range !== null &&
        sameAddress(left.range.anchor, right.range.anchor) &&
        sameAddress(left.range.focus, right.range.focus))) &&
    sameRanges(left.ranges, right.ranges)
  );
}

function sameRanges(
  left: readonly Readonly<BomCellRange>[] | undefined,
  right: readonly Readonly<BomCellRange>[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.length === right.length &&
    left.every((range, index) => {
      const other = right[index];
      return other !== undefined &&
        sameAddress(range.anchor, other.anchor) &&
        sameAddress(range.focus, other.focus);
    });
}

function sameColumnGeometry(
  left: readonly Readonly<BomColumnDefinition>[],
  right: readonly Readonly<BomColumnDefinition>[],
): boolean {
  return (
    left.length === right.length &&
    left.every((column, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        column.columnId === other.columnId &&
        column.width === other.width &&
        column.frozen === other.frozen &&
        column.visible === other.visible
      );
    })
  );
}

function columnReorderGroup(
  column: Readonly<BomColumnDefinition>,
): 'start' | 'scrollable' | 'end' {
  return column.frozen === 'start'
    ? 'start'
    : column.frozen === 'end'
      ? 'end'
      : 'scrollable';
}

function visibleColumnDefinitions(
  columns: readonly Readonly<BomColumnDefinition>[],
): readonly Readonly<BomColumnDefinition>[] {
  return columns.filter((column) => column.visible !== false);
}

function orderWithVisibleColumns(
  columns: readonly Readonly<BomColumnDefinition>[],
  visibleOrder: readonly string[],
): readonly string[] {
  let visibleIndex = 0;
  return columns.map((column) =>
    column.visible === false
      ? column.columnId
      : visibleOrder[visibleIndex++] ?? column.columnId,
  );
}

function clampColumnWidth(
  value: number,
  column: Readonly<BomColumnDefinition>,
): number {
  const minimum = Math.max(1, column.minWidth ?? 1);
  const maximum = Math.max(minimum, column.maxWidth ?? Number.POSITIVE_INFINITY);
  if (!Number.isFinite(value)) {
    return column.width;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  const lower = Math.min(minimum, maximum);
  const upper = Math.max(minimum, maximum);
  return Math.min(upper, Math.max(lower, value));
}

function classifyInputType(
  inputType: string | undefined,
): 'insert' | 'delete' | 'replace' {
  if (inputType === undefined) {
    return 'replace';
  }
  if (inputType.startsWith('delete')) {
    return 'delete';
  }
  if (inputType.startsWith('insert')) {
    return 'insert';
  }
  return 'replace';
}

function isCanvasLayer(value: string): value is BomCanvasLayer {
  return value === 'background' || value === 'content' || value === 'interaction';
}

function encodeIdPart(value: string): string {
  let encoded = '';
  for (let index = 0; index < value.length; index += 1) {
    encoded += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return encoded || '0000';
}

function setStyles(
  element: HTMLElement,
  styles: Readonly<Record<string, string>>,
): void {
  Object.assign(element.style, styles);
}

function clearCanvasBackingStore(canvas: HTMLCanvasElement): void {
  const failures: unknown[] = [];
  try {
    canvas.width = 0;
  } catch (cause) {
    failures.push(cause);
  }
  try {
    canvas.height = 0;
  } catch (cause) {
    failures.push(cause);
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      'BOM_RENDERER_CANVAS_BACKING_STORE_RELEASE_FAILED',
    );
  }
}

function finiteDimension(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function nonNegativeFinite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function boundedOverscan(value: number | undefined, fallback: number): number {
  return Math.min(MAX_OVERSCAN, nonNegativeFinite(value, fallback));
}

function backingStoreBudget(
  value: number | undefined,
  fallback: number,
): number {
  const budget = positiveFinite(value, fallback);
  if (budget < LAYERS.length * 4) {
    throw new RangeError('BOM_RENDERER_BACKING_STORE_BUDGET_TOO_SMALL');
  }
  return budget;
}

function ratio(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : fallback;
}
