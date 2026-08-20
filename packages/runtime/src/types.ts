import type {
  BomDocumentGeneration,
  BomDocumentId,
  BomError,
  BomInstanceId,
  BomTransactionId,
  BomValue,
  OccurrenceId,
  RevisionToken,
} from '@bom-editor/contracts';

export type BomLifecycleState =
  | 'created'
  | 'mounted'
  | 'ready'
  | 'destroying'
  | 'destroyed';

export type BomClipboardCapability =
  | 'async'
  | 'event-fallback'
  | 'unavailable';

export type BomClipboardFormat = 'text/plain' | 'text/html' | 'internal';

/** Ordinary cell-grid clipboard operations. */
export type BomClipboardOperation = 'copy' | 'cut';

/** Independent tree/branch clipboard commands. */
export type BomBranchClipboardOperation = 'copy-branch' | 'cut-branch';

/** Versioned, value-free protocol for controlled structural moves. */
export const BOM_STRUCTURE_MOVE_REQUEST_PROTOCOL =
  'bom-structure-move-request/v1';

export type BomStructureMovePosition = 'before' | 'after' | 'inside';

export type BomStructureMoveIntent =
  | Readonly<{
      readonly kind: 'pointer';
      readonly targetOccurrenceId: OccurrenceId;
      readonly position: BomStructureMovePosition;
    }>
  | Readonly<{
      readonly kind: 'keyboard';
      readonly direction: 'up' | 'down' | 'indent' | 'outdent';
    }>;

/**
 * Host request emitted when a structural move cannot be proven locally from
 * a partial Snapshot. It deliberately contains no node values or fields.
 */
export interface BomStructureMoveRequest {
  readonly protocol: typeof BOM_STRUCTURE_MOVE_REQUEST_PROTOCOL;
  readonly requestId: string;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly baseRevision: RevisionToken;
  readonly sourceRevision?: RevisionToken;
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly intent: BomStructureMoveIntent;
  readonly reason: 'partial-snapshot';
}

/** Stable branch scope supplied to the Clipboard Policy and audit stream. */
export interface BomClipboardBranchScope {
  readonly rootOccurrenceIds: readonly OccurrenceId[];
  /** Branch descendants are structural, not limited to visible expanded rows. */
  readonly includeDescendants: boolean;
}

/** Metadata supplied to a synchronous outbound Clipboard Policy. */
export interface BomClipboardRequest {
  readonly operation: BomClipboardOperation | BomBranchClipboardOperation;
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly fieldIds: readonly string[];
  readonly formats: readonly BomClipboardFormat[];
  /** Present only for `copy-branch` and `cut-branch`. */
  readonly branch?: Readonly<BomClipboardBranchScope>;
}

export type BomClipboardMasking = 'omit' | 'redact' | 'hash';

/** A policy decision is evaluated before any outbound format is generated. */
export interface BomClipboardDecision {
  /** Value-free audit token: ASCII alphanumeric plus . _ : -, max 64 chars. */
  readonly decisionId: string;
  readonly allowed: boolean;
  readonly fieldIds?: readonly string[];
  readonly maskingByFieldId?: Readonly<
    Record<string, BomClipboardMasking>
  >;
  /** Value-free audit token: ASCII alphanumeric plus . _ : -, max 64 chars. */
  readonly reasonCode?: string;
}

export interface BomClipboardPolicy {
  authorize(
    request: Readonly<BomClipboardRequest>,
  ): Readonly<BomClipboardDecision>;
}

export type BomClipboardWriteMethod = 'async' | 'event-fallback';

export type BomClipboardWriteOutcome = 'written' | 'denied' | 'failed';

/** Versioned vendor MIME type reserved for same-ecosystem clipboard payloads. */
export const BOM_INTERNAL_CLIPBOARD_MIME =
  'application/x-bom-editor-clipboard+json';

/** The representation selected by the editor after clipboard precedence rules. */
export type BomPasteFormat = 'internal' | 'html' | 'tsv' | 'csv' | 'text';

/**
 * Raw clipboard representations supplied by an API caller or a browser paste
 * event. Every value is untrusted text. The editor parses bounded internal,
 * HTML-table, and plain-text candidates in that priority order.
 */
export interface BomPasteInput {
  readonly internal?: string;
  readonly html?: string;
  readonly text?: string;
  /**
   * Optional bounded source of text chunks. It is mutually exclusive with
   * `text`; chunk boundaries do not define rows or cells.
   */
  readonly textStream?: AsyncIterable<string>;
}

export type BomPasteSource = 'api' | 'event';

export type BomPasteOutcome = 'committed' | 'denied' | 'failed';

/** Security limits applied before a plain-text paste is mapped to document cells. */
export interface BomPasteLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxCellBytes: number;
}

/** One converted target cell supplied to the trusted synchronous paste policy. */
export interface BomPasteCell {
  readonly sourceRow: number;
  readonly sourceColumn: number;
  readonly address: Readonly<BomCellAddress>;
  readonly fieldId: string;
  readonly value: BomValue;
}

export interface BomPasteAuthorizationRequest {
  readonly operation: 'paste';
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly baseRevision: RevisionToken;
  readonly cells: readonly Readonly<BomPasteCell>[];
}

/** A rejected cell makes the whole paste fail; partial application is never implicit. */
export interface BomPasteCellRejection {
  readonly sourceRow: number;
  readonly sourceColumn: number;
  /** Value-free audit token: ASCII alphanumeric plus . _ : -, max 64 chars. */
  readonly reasonCode?: string;
}

export interface BomPasteDecision {
  /** Value-free audit token: ASCII alphanumeric plus . _ : -, max 64 chars. */
  readonly decisionId: string;
  readonly allowed: boolean;
  /** Value-free audit token: ASCII alphanumeric plus . _ : -, max 64 chars. */
  readonly reasonCode?: string;
  readonly deniedCells?: readonly Readonly<BomPasteCellRejection>[];
}

/** Synchronous inbound edit authorization, separate from outbound Clipboard Policy. */
export interface BomPastePolicy {
  authorize(
    request: Readonly<BomPasteAuthorizationRequest>,
  ): Readonly<BomPasteDecision>;
}

export interface BomCapabilities {
  readonly worker: boolean;
  readonly offscreenCanvas: boolean;
  readonly clipboard: BomClipboardCapability;
  readonly pointerEvents: boolean;
  readonly resizeObserver: boolean;
  readonly intl: boolean;
  readonly secureContext: boolean;
  readonly hardwareConcurrency?: number;
  readonly deviceMemoryGiB?: number;
}

export interface BomMetricSnapshot {
  readonly name: string;
  readonly unit: string;
  readonly count: number;
  readonly last: number;
  readonly total: number;
  readonly minimum: number;
  readonly maximum: number;
}

/** Logger callbacks are optional and must never be able to break the editor. */
export interface BomLogger {
  readonly debug?: (message: string, context?: Readonly<Record<string, string | number>>) => void;
  readonly info?: (message: string, context?: Readonly<Record<string, string | number>>) => void;
  readonly warn?: (message: string, context?: Readonly<Record<string, string | number>>) => void;
  readonly error?: (message: string, context?: Readonly<Record<string, string | number>>) => void;
}

export interface BomDiagnostics {
  readonly lifecycle: BomLifecycleState;
  readonly documentRevision?: RevisionToken;
  readonly sourceRevision?: RevisionToken;
  readonly queuedTasks: number;
  readonly activeTasks: number;
  readonly metrics?: readonly Readonly<BomMetricSnapshot>[];
}

export type BomFrozenColumnPosition = false | 'start' | 'end';

/** Placement used when a new view column is inserted beside a reference column. */
export type BomColumnInsertPosition = 'before' | 'after';

/** Horizontal text placement inside a rendered cell. */
export type BomColumnHorizontalAlignment = 'start' | 'center' | 'end';

/**
 * Serializable display rules for the built-in Canvas formatter. They only
 * affect presentation; the field Schema remains the authority for parsing,
 * validation, precision, and canonical values.
 */
export type BomColumnDateStyle = 'short' | 'medium' | 'long' | 'full';
export type BomColumnTimeStyle = 'short' | 'medium' | 'long';

export type BomColumnDisplayFormat =
  | { readonly kind: 'text' }
  | { readonly kind: 'integer'; readonly useGrouping?: boolean }
  | {
      readonly kind: 'decimal';
      readonly minimumFractionDigits?: number;
      readonly maximumFractionDigits?: number;
      readonly useGrouping?: boolean;
      readonly unit?: 'preserve' | 'hidden';
    }
  | {
      readonly kind: 'percent';
      readonly minimumFractionDigits?: number;
      readonly maximumFractionDigits?: number;
    }
  | {
      readonly kind: 'currency';
      readonly currency: string;
      readonly minimumFractionDigits?: number;
      readonly maximumFractionDigits?: number;
    }
  | {
      /** Currency with accounting-style negative values and symbol placement. */
      readonly kind: 'accounting';
      readonly currency: string;
      readonly minimumFractionDigits?: number;
      readonly maximumFractionDigits?: number;
      readonly useGrouping?: boolean;
    }
  | {
      readonly kind: 'scientific';
      readonly minimumFractionDigits?: number;
      readonly maximumFractionDigits?: number;
    }
  | {
      /** A bounded mixed-number approximation for a finite numeric value. */
      readonly kind: 'fraction';
      readonly maximumDenominator?: number;
      readonly useGrouping?: boolean;
    }
  | { readonly kind: 'date'; readonly dateStyle?: BomColumnDateStyle }
  | {
      readonly kind: 'datetime';
      readonly dateStyle?: BomColumnDateStyle;
      readonly timeStyle?: BomColumnTimeStyle;
    };

export interface BomColumnAccessibility {
  readonly label?: string;
  readonly description?: string;
  readonly required?: boolean;
}

export interface BomColumnDefinition {
  /** Stable across column reorder, visibility, and view-template changes. */
  readonly columnId: string;
  /**
   * Schema field identifier bound by this column. When omitted, the editor
   * derives it from `fieldPath` during normalization.
   */
  readonly fieldName?: string;
  /** Canonical document path used for all reads, writes, filters, and sorts. */
  readonly fieldPath: readonly string[];
  readonly label: string;
  /** Optional hierarchical labels rendered above the leaf column label. */
  readonly headerGroup?: readonly string[];
  /** CSS pixel width before viewport scaling. */
  readonly width: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  /** Whether the column participates in the current rendered view. */
  readonly visible?: boolean;
  readonly editable: boolean;
  readonly frozen: BomFrozenColumnPosition;
  /** Built-in serializable cell display rule. A renderer callback can override it. */
  readonly format?: Readonly<BomColumnDisplayFormat>;
  readonly alignment?: BomColumnHorizontalAlignment;
  /** Wrap display text within the current row height instead of clipping it. */
  readonly wrapText?: boolean;
  readonly a11y?: Readonly<BomColumnAccessibility>;
}

export interface BomCellAddress {
  readonly occurrenceId: OccurrenceId;
  readonly columnId: string;
}

/**
 * A rectangular cell range expressed exclusively by stable row and column IDs.
 * Bounds are resolved against the current visible projection by the consumer.
 */
export interface BomCellRange {
  readonly anchor: Readonly<BomCellAddress>;
  readonly focus: Readonly<BomCellAddress>;
}

/** The semantic axis of a selection when it is not a cell selection. */
export type BomSelectionMode = 'row' | 'column';

/**
 * A stable selection. Cell ranges retain their original shape; row and column
 * selections use the same stable endpoints plus `mode` so consumers do not
 * have to infer axis semantics from visible indexes.
 */
export interface BomSelectionState {
  readonly activeCell: Readonly<BomCellAddress> | null;
  readonly range: Readonly<BomCellRange> | null;
  /**
   * Optional disjoint selection ranges. When present, this is the complete
   * set of at least two selected rectangles, including the active rectangle. `range`
   * remains the legacy primary range and is null when the active rectangle is
   * a single cell. Multi-range operations must define their own semantics;
   * unsupported operations must fail without partial changes.
   */
  readonly ranges?: readonly Readonly<BomCellRange>[];
  /** Omitted for the default cell-selection mode. */
  readonly mode?: BomSelectionMode;
}

export type BomSelectionChangeReason =
  | 'keyboard'
  | 'pointer'
  | 'api'
  | 'view-change'
  | 'document-change';

export interface BomViewState {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly visibleRowCount: number;
  /** Current ordered column geometry, keyed by stable column ID. */
  readonly columns: readonly Readonly<BomViewColumnState>[];
  /** Current per-row height overrides, keyed by stable occurrence ID. */
  readonly rowHeights: readonly Readonly<BomViewRowHeightState>[];
  readonly sort?: readonly Readonly<BomViewSortState>[];
  readonly filters?: readonly Readonly<BomViewFilterState>[];
  readonly firstVisibleOccurrenceId?: OccurrenceId;
  readonly lastVisibleOccurrenceId?: OccurrenceId;
}

export interface BomViewSortState {
  readonly fieldPath: readonly string[];
  readonly direction: 'asc' | 'desc';
}

export interface BomViewFilterState {
  readonly fieldPath: readonly string[];
  readonly operator: 'contains' | 'equals' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte';
  readonly value: BomValue;
}

export type BomViewChangeReason =
  | 'scroll'
  | 'resize'
  | 'projection'
  | 'columns'
  | 'row-height'
  | 'api';

/** Stable, serializable geometry published with a view change. */
export interface BomViewColumnState {
  readonly columnId: string;
  readonly width: number;
  readonly frozen: BomFrozenColumnPosition;
  readonly visible: boolean;
}

/** Stable, serializable height override published with a view change. */
export interface BomViewRowHeightState {
  readonly occurrenceId: OccurrenceId;
  readonly rowHeight: number;
}

export type BomEditStatus =
  | 'idle'
  | 'focused'
  | 'editing'
  | 'composing'
  | 'validating'
  | 'committing'
  | 'rejected';

export type BomEditTrigger = 'keyboard' | 'pointer' | 'api' | 'paste';

export type BomEditCommitReason =
  | 'enter'
  | 'fill-selection'
  | 'tab'
  | 'shift-tab'
  | 'blur'
  | 'outside-pointer'
  | 'scroll'
  | 'api';

export interface BomEditDraft {
  readonly address: Readonly<BomCellAddress>;
  readonly originalValue: BomValue | undefined;
  readonly value: BomValue;
  readonly dirty: boolean;
}

export interface BomIdleEditState {
  readonly status: 'idle';
  readonly draft: null;
}

export interface BomFocusedEditState {
  readonly status: 'focused';
  readonly draft: null;
}

export interface BomEditingEditState {
  readonly status: 'editing';
  readonly draft: Readonly<BomEditDraft>;
}

export interface BomComposingEditState {
  readonly status: 'composing';
  readonly draft: Readonly<BomEditDraft>;
}

export interface BomValidatingEditState {
  readonly status: 'validating';
  readonly draft: Readonly<BomEditDraft>;
  readonly validationId?: string;
}

export interface BomCommittingEditState {
  readonly status: 'committing';
  readonly draft: Readonly<BomEditDraft>;
  readonly transactionId?: BomTransactionId;
}

export interface BomRejectedEditState {
  readonly status: 'rejected';
  readonly draft: Readonly<BomEditDraft>;
  readonly phase: 'validation' | 'commit';
  readonly error: BomError;
}

export type BomEditState =
  | BomIdleEditState
  | BomFocusedEditState
  | BomEditingEditState
  | BomComposingEditState
  | BomValidatingEditState
  | BomCommittingEditState
  | BomRejectedEditState;

export type BomEditAction =
  | { readonly type: 'focus' }
  | { readonly type: 'blur' }
  | {
      readonly type: 'beginEdit';
      readonly draft: Readonly<BomEditDraft>;
    }
  | { readonly type: 'updateDraft'; readonly value: BomValue }
  | { readonly type: 'compositionStart' }
  | { readonly type: 'compositionEnd' }
  | { readonly type: 'beginValidation'; readonly validationId?: string }
  | { readonly type: 'beginCommit'; readonly transactionId?: BomTransactionId }
  | { readonly type: 'reject'; readonly error: BomError }
  | { readonly type: 'commitSucceeded' }
  | { readonly type: 'cancel' };

export interface BomEditTransitionSuccess {
  readonly ok: true;
  readonly previous: Readonly<BomEditState>;
  readonly state: Readonly<BomEditState>;
}

export interface BomEditTransitionFailure {
  readonly ok: false;
  readonly code: 'BOM_EDIT_INVALID_TRANSITION';
  readonly from: BomEditStatus;
  readonly action: BomEditAction['type'];
}

export type BomEditTransitionResult =
  | BomEditTransitionSuccess
  | BomEditTransitionFailure;

export type BomRuntimeDiagnostic =
  | {
      readonly code: 'BOM_EVENT_LISTENER_FAILED';
      readonly source: 'event';
      readonly instanceId: BomInstanceId;
      readonly eventType: string;
      readonly sequence: number;
      readonly listenerIndex: number;
      readonly cause: unknown;
    }
  | {
      readonly code: 'BOM_RESOURCE_DISPOSE_FAILED';
      readonly source: 'resource';
      readonly resourceKind: string;
      readonly cause: unknown;
    };

export type BomRuntimeDiagnosticSink = (
  diagnostic: Readonly<BomRuntimeDiagnostic>,
) => void;

export interface BomDocumentRuntimeScope {
  readonly documentId: string;
  readonly documentGeneration: BomDocumentGeneration;
}
