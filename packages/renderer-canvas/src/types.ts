import type {
  BomDocumentId,
  BomDocumentGeneration,
  BomDocumentSnapshot,
  BomFields,
  BomInstanceId,
  BomValue,
  OccurrenceId,
  RevisionToken,
} from '@bom-editor/contracts';
import type { BomBaseIndexes } from '@bom-editor/model';
import type {
  BomCellAddress,
  BomColumnInsertPosition,
  BomColumnDefinition,
  BomFrozenColumnPosition,
  BomEditCommitReason,
  BomEditState,
  BomEditTrigger,
  BomPasteInput,
  BomSelectionMode,
  BomSelectionChangeReason,
  BomSelectionState,
  BomResourceRegistryDiagnostics,
  BomViewChangeReason,
  BomViewState,
} from '@bom-editor/runtime';
import type { VisibleProjection } from '@bom-editor/visible-projection';

export const BOM_CANVAS_WORKER_TASK_LEDGER_PROTOCOL =
  'bom-canvas-worker-task-ledger/v1';
export const BOM_CANVAS_FRAME_COMMIT_PROTOCOL =
  'bom-canvas-frame-commit/v1';
export const BOM_CANVAS_DIFF_VIEW_PROTOCOL = 'bom-canvas-diff-view/v1';

export type BomCanvasLayer = 'background' | 'content' | 'interaction';

export interface BomCanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface BomCanvasRect extends BomCanvasPoint {
  readonly width: number;
  readonly height: number;
}

/** A complete Canvas/semantic/Portal synchronization observed before presentation. */
export interface BomCanvasFrameCommit {
  readonly protocol: typeof BOM_CANVAS_FRAME_COMMIT_PROTOCOL;
  readonly sequence: number;
  /** DOMHighResTimeStamp from the renderer document's performance time origin. */
  readonly completedAtMs: number;
  readonly revision: RevisionToken;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly viewport: Readonly<{
    readonly width: number;
    readonly height: number;
  }>;
  readonly surface: Readonly<BomCanvasRect>;
}

/** Value-free semantic category used by a controlled Diff overlay. */
export type BomCanvasDiffKind =
  | 'inserted'
  | 'deleted'
  | 'changed'
  | 'moved'
  | 'reordered'
  | 'material';

/** Row-wide Diff marker keyed only by the stable occurrence identity. */
export interface BomCanvasDiffRowDecoration {
  readonly occurrenceId: OccurrenceId;
  readonly kind: BomCanvasDiffKind;
}

/** Cell-level Diff marker keyed only by stable occurrence and column IDs. */
export interface BomCanvasDiffCellDecoration {
  readonly occurrenceId: OccurrenceId;
  readonly columnId: string;
  readonly kind: BomCanvasDiffKind;
}

/**
 * Value-free summary for rows that no longer exist in the bound Snapshot.
 * The summary is drawn at a current-row boundary and is never an interactive
 * grid row or a replacement for a deleted Snapshot node.
 */
export interface BomCanvasDiffDeletionSummary {
  /** Stable ID of the deleted row represented by this summary. */
  readonly occurrenceId: OccurrenceId;
  /** Existing row used as the visual/semantic anchor for before/after. */
  readonly anchorOccurrenceId?: OccurrenceId;
  /** `start`/`end` require no anchor; `before`/`after` require one. */
  readonly position: 'before' | 'after' | 'start' | 'end';
  /** Number of deleted rows represented; must be a positive safe integer. */
  readonly count: number;
}

/**
 * One value-free deleted row rendered as an opt-in virtual ghost row.
 * Ghost rows participate in visual/ARIA row positioning but are never
 * selectable, editable, expandable, or valid transaction targets.
 */
export interface BomCanvasDiffGhostRow {
  /** Stable ID of the deleted row represented by this ghost. */
  readonly occurrenceId: OccurrenceId;
  /** Existing row used as the visual/semantic anchor for before/after. */
  readonly anchorOccurrenceId?: OccurrenceId;
  /** `start`/`end` require no anchor; `before`/`after` require one. */
  readonly position: 'before' | 'after' | 'start' | 'end';
  /** Optional tree depth; defaults to the anchor depth or one. */
  readonly depth?: number;
}

/**
 * A controlled, value-free Diff view for the current Snapshot. It is bound to
 * the document identity, document generation, and published view revision.
 * Stale views are ignored. Decorations may address current rows and columns;
 * removed rows may opt into the non-interactive ghost-row projection below.
 */
export interface BomCanvasDiffView {
  readonly protocol: typeof BOM_CANVAS_DIFF_VIEW_PROTOCOL;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly viewRevision: RevisionToken;
  readonly rows: readonly Readonly<BomCanvasDiffRowDecoration>[];
  readonly cells: readonly Readonly<BomCanvasDiffCellDecoration>[];
  /** Optional value-free summaries for deleted rows absent from the Snapshot. */
  readonly deletedRows?: readonly Readonly<BomCanvasDiffDeletionSummary>[];
  /** Optional value-free deleted rows rendered as non-interactive ghost rows. */
  readonly ghostRows?: readonly Readonly<BomCanvasDiffGhostRow>[];
}

/**
 * An atomically published browser view. Every member must describe `revision`.
 * The renderer validates the revision token and consumes this object read-only.
 */
export interface BomCanvasViewModel<
  TFields extends BomFields = BomFields,
> {
  readonly revision: RevisionToken;
  readonly documentGeneration: BomDocumentGeneration;
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly indexes: BomBaseIndexes<TFields>;
  readonly projection: VisibleProjection<TFields>;
  readonly columns: readonly Readonly<BomColumnDefinition>[];
  readonly selection: Readonly<BomSelectionState>;
  readonly editState: Readonly<BomEditState>;
  /** Optional value-free Diff decorations for the published revision. */
  readonly diffView?: Readonly<BomCanvasDiffView> | null;
}

export type BomCanvasDraftInputType =
  | 'insert'
  | 'delete'
  | 'replace'
  | 'composition';

/** Prepared by the editor after policy authorization, then written by the renderer. */
export interface BomCanvasClipboardPayload {
  readonly id: string;
  readonly text: string;
  /** Safe HTML table representation, when the editor prepared rich output. */
  readonly html?: string;
  /** Versioned same-ecosystem JSON representation, when prepared. */
  readonly internal?: string;
  /** Distinguishes branch envelopes from ordinary cell-grid payloads. */
  readonly kind?: 'cell-grid' | 'branch-tree';
}

/** Keyboard context in which a shortcut is eligible to run. */
export type BomShortcutContext = 'focused' | 'editing' | 'dragging';
export type BomShortcutScope = BomShortcutContext;

/**
 * One user contribution. `keys` accepts a stroke (`Primary+K`) or a bounded
 * sequence separated by spaces (`Primary+K Primary+C`). `enabled: false`
 * disables a default binding with the same id.
 */
export interface BomShortcutBinding {
  readonly id: string;
  readonly keys: string | readonly string[];
  readonly command: string;
  readonly scope?: BomShortcutScope | readonly BomShortcutScope[];
  readonly priority?: number;
  readonly enabled?: boolean;
  readonly preventDefault?: boolean;
  readonly allowRepeat?: boolean;
}

export interface BomShortcutRegistryOptions {
  readonly bindings?: readonly Readonly<BomShortcutBinding>[];
  readonly sequenceTimeoutMs?: number;
}

export type BomShortcutDiagnosticCode =
  | 'destroyed'
  | 'invalid-options'
  | 'invalid-timeout'
  | 'invalid-binding'
  | 'invalid-stroke'
  | 'invalid-scope'
  | 'invalid-priority'
  | 'duplicate-id'
  | 'conflict'
  | 'reserved-key';

export interface BomShortcutDiagnostic {
  readonly code: BomShortcutDiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly id?: string;
  readonly conflictingId?: string;
  readonly stroke?: string;
}

export type BomShortcutConfigurationResult =
  | {
      readonly ok: true;
      readonly state: Readonly<BomShortcutRegistryOptions>;
      readonly diagnostics: readonly Readonly<BomShortcutDiagnostic>[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Readonly<BomShortcutDiagnostic>[];
    };

export interface BomShortcutInvocation {
  readonly bindingId: string;
  readonly command: string;
  readonly scope: BomShortcutContext;
  readonly sequence: readonly string[];
  readonly event: KeyboardEvent;
}

export type BomCanvasClipboardWriteMethod = 'async' | 'event-fallback';

export type BomCanvasClipboardWriteOutcome = 'written' | 'failed';

/** Keyboard structural movement for the focused tree row. */
export type BomTreeMoveDirection = 'up' | 'down' | 'indent' | 'outdent';
/** Pointer drop position for a stable tree occurrence. */
export type BomTreeDropPosition = 'before' | 'after' | 'inside';
/** Value-free, controlled pointer tree move request. */
export interface BomTreeMoveRequest {
  readonly occurrenceId: OccurrenceId;
  readonly targetOccurrenceId: OccurrenceId;
  readonly position: BomTreeDropPosition;
  /** Present only when the active row selection contains multiple rows. */
  readonly occurrenceIds?: readonly OccurrenceId[];
}
/** Placement of a newly duplicated node relative to the focused tree row. */
export type BomTreeInsertMode = 'sibling' | 'child';
/** Why a controlled host is being asked to change one column's width. */
export type BomCanvasColumnResizeReason = 'pointer' | 'keyboard';
/** Why a controlled row height update was requested. */
export type BomCanvasRowHeightReason = 'pointer' | 'keyboard';
/** Why a controlled host is being asked to change column order. */
export type BomCanvasColumnReorderReason = 'pointer' | 'keyboard';
/** Why a controlled host is being asked to change column visibility. */
export type BomCanvasColumnVisibilityReason = 'keyboard' | 'pointer' | 'api';
export type BomCanvasColumnInsertReason = 'keyboard' | 'pointer' | 'api';
export type BomCanvasColumnDeleteReason = 'keyboard' | 'pointer' | 'api';
export type BomCanvasColumnSortDirection = 'asc' | 'desc';

export interface BomCanvasRendererCallbacks {
  select(
    address: Readonly<BomCellAddress>,
    reason: BomSelectionChangeReason,
    options?: Readonly<{
      readonly extend: boolean;
      /** Adds a new rectangle instead of replacing the current selection. */
      readonly additive?: boolean;
      readonly mode?: BomSelectionMode;
    }>,
  ): void;
  /** Selects the current projection's full visible rectangle. */
  selectAll(): void;
  /** Optional history callbacks for standalone renderer hosts. */
  undo?(): void;
  redo?(): void;
  /** Optional field-level clear callback for the focused grid selection. */
  clearSelection?(): void;
  /** Optional top-row-to-range fill callback for the focused grid selection. */
  fillDown?(): void;
  /** Optional numeric-series fill callback for the focused grid selection. */
  fillSeries?(): void;
  /** Optional atomic structural delete for the focused tree row. */
  deleteSubtree?(): void;
  /** Optional atomic structural movement for the focused tree row. */
  moveSelection?(direction: BomTreeMoveDirection): void;
  /** Optional atomic pointer move for a stable tree occurrence. */
  moveSubtree?(request: Readonly<BomTreeMoveRequest>): void;
  /** Optional atomic insertion of a duplicated node. */
  insertSelection?(mode: BomTreeInsertMode): void;
  /** Optional view-only expansion command. */
  setExpansionAll?(expanded: boolean): void;
  /** Optional controlled column geometry update. */
  /** Marks the beginning of a pointer column-resize gesture. */
  beginColumnResize?(columnId: string, width: number): void;
  resizeColumn?(
    columnId: string,
    width: number,
    reason: BomCanvasColumnResizeReason,
  ): void;
  /** Marks the end of a pointer column-resize gesture. */
  endColumnResize?(columnId: string, width: number): void;
  /** Optional controlled row height update. Passing the projection default resets the override. */
  setRowHeight?(
    occurrenceId: OccurrenceId,
    rowHeight: number,
    reason: BomCanvasRowHeightReason,
  ): void;
  /** Optional controlled reset to the original static column width. */
  resetColumnWidth?(columnId: string, reason: 'pointer' | 'keyboard'): void;
  /** Optional controlled column order update. */
  reorderColumns?(
    columnIds: readonly string[],
    reason: BomCanvasColumnReorderReason,
  ): void;
  /** Optional controlled column visibility update. */
  setColumnVisibility?(
    columnIds: readonly string[],
    visible: boolean,
    reason: BomCanvasColumnVisibilityReason,
  ): void;
  /** Optional controlled insertion of one or more view columns. */
  insertColumn?(
    referenceColumnId: string,
    position: BomColumnInsertPosition,
    count: number,
    reason: BomCanvasColumnInsertReason,
  ): void;
  /** Optional controlled deletion of view columns. */
  deleteColumns?(
    columnIds: readonly string[],
    reason: BomCanvasColumnDeleteReason,
  ): void;
  /** Optional controlled frozen-column placement update. */
  setColumnFrozen?(
    columnId: string,
    frozen: BomFrozenColumnPosition,
    reason: 'keyboard' | 'pointer',
  ): void;
  /** Optional view-only sort/filter commands exposed by the column menu. */
  sortColumn?(columnId: string, direction: BomCanvasColumnSortDirection): void;
  filterColumnValue?(columnId: string, value: BomValue): void;
  clearViewQuery?(): void;
  clearColumnFormat?(columnId: string): void;
  copy(): Readonly<BomCanvasClipboardPayload> | null;
  cut?(): Readonly<BomCanvasClipboardPayload> | null;
  /** Optional independent tree/branch clipboard commands. */
  copyBranch?(): Readonly<BomCanvasClipboardPayload> | null;
  cutBranch?(): Readonly<BomCanvasClipboardPayload> | null;
  /** Receives clipboard candidates read from a trusted context-menu gesture. */
  paste(input: Readonly<BomPasteInput>): void;
  clipboardWrite(
    id: string,
    method: BomCanvasClipboardWriteMethod,
    outcome: BomCanvasClipboardWriteOutcome,
  ): void;
  toggleExpansion(
    address: Readonly<BomCellAddress>,
    expanded: boolean,
  ): void;
  requestEdit(
    address: Readonly<BomCellAddress>,
    trigger: BomEditTrigger,
  ): void;
  draftInput(
    address: Readonly<BomCellAddress>,
    value: string,
    inputType: BomCanvasDraftInputType,
  ): void;
  commit(
    address: Readonly<BomCellAddress>,
    reason: BomEditCommitReason,
  ): void;
  cancel(address: Readonly<BomCellAddress>): void;
  composition(
    address: Readonly<BomCellAddress>,
    phase: 'start' | 'end',
  ): void;
  viewChange(
    view: Readonly<BomViewState>,
    reason: BomViewChangeReason,
  ): void;
}

export interface BomCanvasRendererLabels {
  readonly treegridLabel: string;
  /**
   * Optional non-visual treegrid description, exposed through
   * `aria-describedby` when non-empty.
   */
  readonly treegridDescription?: string;
  readonly editorLabel: string;
  readonly rowNumberHeader: string;
  /** Localizable labels for the column-header and row-number context menus. */
  readonly contextMenu?: Readonly<Record<string, string>>;
  /** Localized value-free messages for automatic renderer announcements. */
  readonly liveRegion?: Readonly<BomCanvasLiveRegionLabels>;
  /** Localized, value-free descriptions for Diff semantics. */
  readonly diff?: Readonly<BomCanvasDiffLabels>;
}

/** Locales bundled with the editor UI. No locale data is fetched at runtime. */
export type BomEditorLocale = 'zh-CN' | 'en-US';

/**
 * Static host-provided UI text. English intentionally falls back to Chinese
 * when it is omitted, so rendering never invokes a host translation callback.
 */
export type LocalizedText = Readonly<{
  'zh-CN': string;
  'en-US'?: string;
}>;

/** A label accepted from the host before it is resolved for the active locale. */
export type BomCanvasLocalizedText = string | LocalizedText;

export type BomCanvasLocalizedLiveRegionLabels = Readonly<{
  [K in keyof BomCanvasLiveRegionLabels]?: BomCanvasLocalizedText;
}>;

export type BomCanvasLocalizedDiffLabels = Readonly<{
  [K in keyof BomCanvasDiffLabels]?: BomCanvasLocalizedText;
}>;

/**
 * Host overrides for built-in labels. String values remain backward
 * compatible; `LocalizedText` values are resolved whenever locale changes.
 */
export interface BomCanvasRendererLabelOverrides {
  readonly treegridLabel?: BomCanvasLocalizedText;
  readonly treegridDescription?: BomCanvasLocalizedText;
  readonly editorLabel?: BomCanvasLocalizedText;
  readonly rowNumberHeader?: BomCanvasLocalizedText;
  readonly contextMenu?: Readonly<Record<string, BomCanvasLocalizedText>>;
  readonly liveRegion?: BomCanvasLocalizedLiveRegionLabels;
  readonly diff?: BomCanvasLocalizedDiffLabels;
}

export interface BomCanvasDiffLabels {
  readonly inserted?: string;
  readonly deleted?: string;
  readonly changed?: string;
  readonly moved?: string;
  readonly reordered?: string;
  readonly material?: string;
  /** Localized value-free deletion summary; use `{count}` for the row count. */
  readonly deletedSummary?: string;
  /** Localized value-free label rendered inside a deleted ghost row. */
  readonly deletedGhost?: string;
}

/** The WAI-ARIA priority used for one non-visual status announcement. */
export type BomCanvasLivePoliteness = 'polite' | 'assertive';

/**
 * A localized, value-reviewed message for the renderer-owned live region.
 *
 * The renderer always writes this as text, never HTML. Callers should avoid
 * putting raw BOM values in a status message unless their own access policy
 * explicitly permits exposing them to assistive technology.
 */
export interface BomCanvasLiveAnnouncement {
  readonly message: string;
  readonly politeness?: BomCanvasLivePoliteness;
}

/** Controls bounded delivery of polite live-region announcements. */
export interface BomCanvasLiveRegionOptions {
  /** Defaults to true. Disabled regions remain mounted with aria-live="off". */
  readonly enabled?: boolean;
  /**
   * Minimum delay between polite announcements. Intermediate polite messages
   * are coalesced to the newest message. Defaults to 400 ms.
   */
  readonly politeMinIntervalMs?: number;
}

/** Localized value-free messages emitted for built-in edit, validation, and column outcomes. */
export interface BomCanvasLiveRegionLabels {
  readonly validationRejected?: string;
  readonly commitRejected?: string;
  /** Announced politely when a changed validation report has no issues. */
  readonly validationCompleted?: string;
  /** Announced politely when a changed validation report has issues. Use `{count}` for its issue count. */
  readonly validationIssuesFound?: string;
  /** Announced politely after a pointer column resize finishes with a net change. */
  readonly columnResizeCompleted?: string;
  /** Announced politely after a pointer column reorder reaches the host. */
  readonly columnReorderCompleted?: string;
  /**
   * Announced politely while a pointer column reorder has a new visible target.
   * Use `{position}` for the one-based visible target column number.
   */
  readonly columnReorderTarget?: string;
  /** Announced politely while a pointer tree move has a new valid target. */
  readonly treeMoveTarget?: string;
  /** Announced politely after an atomic keyboard or row-menu tree move succeeds. */
  readonly treeMoveCompleted?: string;
}

export type BomCanvasLiveAnnouncementResult =
  | {
      readonly ok: true;
      readonly delivery: 'immediate' | 'queued' | 'deduplicated';
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'destroyed'
        | 'not-mounted'
        | 'disabled'
        | 'invalid-announcement';
    };

export interface BomCanvasTheme {
  readonly background: string;
  readonly frozenBackground: string;
  readonly rowAlternateBackground: string;
  readonly gridLine: string;
  readonly text: string;
  readonly activeCell: string;
  readonly activeCellFill: string;
  readonly rangeFill: string;
  readonly fillPreviewFill: string;
  readonly fillPreviewBorder: string;
  readonly expander: string;
  readonly diffAddedFill: string;
  readonly diffDeletedFill: string;
  readonly diffChangedFill: string;
  readonly diffMarker: string;
  readonly font: string;
}

export interface BomCanvasCellTextContext<
  TFields extends BomFields = BomFields,
> {
  readonly revision: RevisionToken;
  readonly occurrenceId: OccurrenceId;
  readonly column: Readonly<BomColumnDefinition>;
  readonly value: BomValue | undefined;
  readonly fields: TFields;
  /** Locale used by the built-in formatter for this render pass. */
  readonly locale: BomEditorLocale;
  /** Logical text direction used by the renderer. */
  readonly direction: BomCanvasTextDirection;
}

export type BomCanvasTextDirection = 'ltr' | 'rtl';

/** A bounded CSS-pixel size reported by a custom cell renderer. */
export interface BomCanvasCellSize {
  readonly width: number;
  readonly height: number;
}

/** Shared immutable data exposed to one custom Canvas cell-renderer call. */
export interface BomCanvasCellRendererContext<
  TFields extends BomFields = BomFields,
> {
  readonly revision: RevisionToken;
  readonly address: Readonly<BomCellAddress>;
  readonly column: Readonly<BomColumnDefinition>;
  readonly value: BomValue | undefined;
  readonly fields: TFields;
  /** Full cell bounds in the Canvas's CSS-pixel coordinate space. */
  readonly bounds: Readonly<BomCanvasRect>;
  /** Padded content bounds; tree indentation and expander space are excluded. */
  readonly contentBounds: Readonly<BomCanvasRect>;
  readonly locale: string;
  readonly direction: BomCanvasTextDirection;
  readonly theme: Readonly<BomCanvasTheme>;
}

export interface BomCanvasCellMeasureContext<
  TFields extends BomFields = BomFields,
> extends BomCanvasCellRendererContext<TFields> {
  /** The grid owns layout; this is the largest drawable content region. */
  readonly availableSize: Readonly<BomCanvasCellSize>;
}

export interface BomCanvasCellDrawContext<
  TFields extends BomFields = BomFields,
> extends BomCanvasCellRendererContext<TFields> {
  /** Canvas state is isolated with save/clip/restore around this call. */
  readonly canvas: CanvasRenderingContext2D;
  readonly measuredSize: Readonly<BomCanvasCellSize>;
}

export interface BomCanvasCellHitTestContext<
  TFields extends BomFields = BomFields,
> extends BomCanvasCellRendererContext<TFields> {
  /** Pointer location in the Canvas's CSS-pixel coordinate space. */
  readonly point: Readonly<BomCanvasPoint>;
  readonly measuredSize: Readonly<BomCanvasCellSize>;
}

export interface BomCanvasCellAccessibleContext<
  TFields extends BomFields = BomFields,
> extends BomCanvasCellRendererContext<TFields> {
  readonly measuredSize: Readonly<BomCanvasCellSize>;
}

/** A named custom hit region. `consume` suppresses the default cell selection. */
export interface BomCanvasCellRendererHitTarget {
  readonly id: string;
  readonly consume?: boolean;
}

/** Value-free callback payload for one custom cell hit target. */
export interface BomCanvasCellRendererHit {
  readonly revision: RevisionToken;
  readonly address: Readonly<BomCellAddress>;
  readonly target: Readonly<BomCanvasCellRendererHitTarget>;
}

/**
 * Synchronous, per-column Canvas customization. A renderer cannot change
 * layout, document state, selection, or transactions; invalid/slow calls
 * fall back to the built-in text and accessibility rendering.
 */
export interface BomCanvasCellRenderer<
  TFields extends BomFields = BomFields,
> {
  measure(
    context: Readonly<BomCanvasCellMeasureContext<TFields>>,
  ): Readonly<BomCanvasCellSize>;
  draw(context: Readonly<BomCanvasCellDrawContext<TFields>>): void;
  hitTest?(
    context: Readonly<BomCanvasCellHitTestContext<TFields>>,
  ): Readonly<BomCanvasCellRendererHitTarget> | null;
  getAccessibleText(
    context: Readonly<BomCanvasCellAccessibleContext<TFields>>,
  ): string;
  dispose?(): void;
}

/** Associates one immutable renderer capability with a stable column ID. */
export interface BomCanvasCellRendererRegistration<
  TFields extends BomFields = BomFields,
> {
  readonly columnId: string;
  readonly renderer: Readonly<BomCanvasCellRenderer<TFields>>;
}

/** Runtime presentation values that can be changed without replacing data. */
export interface BomCanvasPresentationOptions {
  readonly locale?: BomEditorLocale;
  readonly direction?: BomCanvasTextDirection;
  readonly labels?: Readonly<BomCanvasRendererLabelOverrides>;
  readonly theme?: Partial<Readonly<BomCanvasTheme>>;
}

export interface BomCanvasPresentationState {
  readonly locale: BomEditorLocale;
  readonly direction: BomCanvasTextDirection;
  readonly labels: Readonly<BomCanvasRendererLabels>;
  readonly theme: Readonly<BomCanvasTheme>;
}

export type BomCanvasPresentationDiagnosticCode =
  | 'destroyed'
  | 'invalid-options'
  | 'invalid-locale'
  | 'invalid-direction'
  | 'invalid-labels'
  | 'invalid-theme';

export interface BomCanvasPresentationDiagnostic {
  readonly code: BomCanvasPresentationDiagnosticCode;
  readonly severity: 'error';
}

export type BomCanvasPresentationConfigurationResult =
  | {
      readonly ok: true;
      readonly state: Readonly<BomCanvasPresentationState>;
      readonly diagnostics: readonly Readonly<BomCanvasPresentationDiagnostic>[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Readonly<BomCanvasPresentationDiagnostic>[];
    };

export type BomCanvasRendererDiagnostic =
  | {
      readonly code: 'BOM_RENDERER_CALLBACK_FAILED';
      readonly callback: keyof BomCanvasRendererCallbacks;
      readonly cause: unknown;
    }
  | {
      readonly code: 'BOM_RENDERER_DRAW_FAILED';
      readonly layer: BomCanvasLayer;
      readonly cause: unknown;
    }
  | {
      readonly code: 'BOM_RENDERER_RENDER_FAILED';
      readonly cause: unknown;
    }
  | {
      readonly code: 'BOM_RENDERER_CONTEXT_LOST';
      readonly layer: BomCanvasLayer;
    }
  | {
      readonly code: 'BOM_RENDERER_CELL_FORMAT_FAILED';
      readonly address: Readonly<BomCellAddress>;
      readonly cause: unknown;
    }
  | {
      readonly code: 'BOM_RENDERER_CELL_RENDERER_FAILED';
      readonly phase:
        | 'measure'
        | 'draw'
        | 'accessibility'
        | 'hitTest'
        | 'dispose';
      readonly columnId?: string;
      readonly address?: Readonly<BomCellAddress>;
      readonly cause: unknown;
    }
  | {
      readonly code: 'BOM_RENDERER_CELL_RENDERER_BUDGET_EXCEEDED';
      readonly phase: 'measure' | 'draw' | 'accessibility' | 'hitTest';
      readonly address: Readonly<BomCellAddress>;
      readonly durationMs: number;
      readonly budgetMs: number;
    }
  | {
      readonly code: 'BOM_RENDERER_CELL_RENDERER_HIT_CALLBACK_FAILED';
      readonly address: Readonly<BomCellAddress>;
      readonly targetId: string;
      readonly cause: unknown;
    }
  | {
      readonly code: 'BOM_RENDERER_SHORTCUT_FAILED';
      readonly bindingId: string;
      readonly cause: unknown;
    };

export interface BomCanvasRendererOptions<
  TFields extends BomFields = BomFields,
> {
  readonly instanceId: BomInstanceId;
  readonly locale?: BomEditorLocale;
  readonly direction?: BomCanvasTextDirection;
  readonly labels?: Readonly<BomCanvasRendererLabelOverrides>;
  readonly theme?: Partial<Readonly<BomCanvasTheme>>;
  /** Optional bounded live-region behavior; messages are supplied by announce(). */
  readonly liveRegion?: Readonly<BomCanvasLiveRegionOptions>;
  readonly overscanX?: number;
  readonly overscanY?: number;
  readonly maxDpr?: number;
  readonly maxBackingStoreBytes?: number;
  readonly dirtyAreaFullRedrawRatio?: number;
  readonly indentWidth?: number;
  readonly cellPadding?: number;
  readonly headerHeight?: number;
  readonly rowHeaderWidth?: number;
  readonly formatCellText?: (
    context: Readonly<BomCanvasCellTextContext<TFields>>,
  ) => string | undefined;
  /** Optional synchronous renderers, keyed by stable visible column ID. */
  readonly cellRenderers?: readonly Readonly<
    BomCanvasCellRendererRegistration<TFields>
  >[];
  /** Aggregate per-frame budget for custom measure/draw/accessibility calls. */
  readonly cellRendererFrameBudgetMs?: number;
  /** Receives a value-free custom hit target before default pointer selection. */
  readonly onCellRendererHit?: (
    hit: Readonly<BomCanvasCellRendererHit>,
  ) => void;
  readonly diagnosticSink?: (
    diagnostic: Readonly<BomCanvasRendererDiagnostic>,
  ) => void;
  /** Optional evidence hook; called after all Canvas and DOM surfaces synchronize. */
  readonly frameCommitSink?: (
    frame: Readonly<BomCanvasFrameCommit>,
  ) => void;
  /** Optional handler for non-built-in shortcut commands. */
  readonly onShortcut?: (invocation: Readonly<BomShortcutInvocation>) => void;
  /** User overrides and additions for the built-in shortcut registry. */
  readonly shortcuts?: Readonly<BomShortcutRegistryOptions>;
}

export interface BomCanvasInvalidation {
  readonly layoutChanged?: boolean;
  readonly dirtyCells?: readonly Readonly<BomCellAddress>[];
  readonly layers?: readonly BomCanvasLayer[];
}

export interface BomCanvasWorkerTaskDiagnostics {
  readonly protocol: typeof BOM_CANVAS_WORKER_TASK_LEDGER_PROTOCOL;
  readonly kind: 'worker-task';
  /** Every renderer-owned Worker task is represented by this ledger. */
  readonly tracked: true;
  readonly supported: boolean;
  readonly queuedCount: number;
  readonly runningCount: number;
  readonly cleanupFailureCount: number;
}

export interface BomCanvasRendererDiagnostics {
  readonly destroyed: boolean;
  readonly revision?: RevisionToken;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly canvasCssWidth: number;
  readonly canvasCssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly effectiveDpr: number;
  readonly backingStoreBytes: number;
  readonly mountedRowCount: number;
  readonly mountedColumnCount: number;
  readonly activeDescendantIsProxy: boolean;
  readonly registeredResourceCount: number;
  readonly resources: Readonly<BomResourceRegistryDiagnostics>;
  readonly workerTasks: Readonly<BomCanvasWorkerTaskDiagnostics>;
}

export interface BomCanvasRenderer<
  TFields extends BomFields = BomFields,
> {
  readonly destroyed: boolean;
  /** True after first Canvas/DOM synchronization; false if teardown or rendering wins. */
  readonly ready: Promise<boolean>;
  update(
    viewModel: Readonly<BomCanvasViewModel<TFields>>,
    invalidation?: Readonly<BomCanvasInvalidation>,
  ): void;
  invalidateCell(
    address: Readonly<BomCellAddress>,
    layers?: readonly BomCanvasLayer[],
  ): void;
  scrollToCell(address: Readonly<BomCellAddress>): boolean;
  /** Restores bounded scroll offsets without changing the view model. */
  scrollToView(
    view: Readonly<Pick<BomViewState, 'scrollLeft' | 'scrollTop'>>,
  ): boolean;
  /** Delivers a localized status without exposing it as visible grid content. */
  announce(
    announcement: Readonly<BomCanvasLiveAnnouncement>,
  ): BomCanvasLiveAnnouncementResult;
  configureShortcuts(
    options: Readonly<BomShortcutRegistryOptions>,
  ): BomShortcutConfigurationResult;
  resetShortcuts(): BomShortcutConfigurationResult;
  configurePresentation(
    options: Readonly<BomCanvasPresentationOptions>,
  ): BomCanvasPresentationConfigurationResult;
  getPresentation(): Readonly<BomCanvasPresentationState>;
  focus(): void;
  getDiagnostics(): Readonly<BomCanvasRendererDiagnostics>;
  destroy(): void;
}
