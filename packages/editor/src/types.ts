import type {
  BomCommand,
  BomCommit,
  BomDocumentGeneration,
  BomDocumentId,
  BomDocumentSnapshot,
  BomError,
  BomFields,
  BomPage,
  BomQueryRequest,
  BomQueryResult,
  OccurrenceId,
  BomPatch,
  BomResult,
  BomSchema,
  BomValidationIssue,
  RevisionToken,
} from '@bom-editor/contracts';
import type {
  BomPlugin,
  BomPluginCommand,
  BomPluginFixConflict,
  BomPluginFixDraft,
  BomPluginFixFieldImpact,
  BomPluginFixImpact,
  BomPluginFixProposal,
  BomPluginFixer,
  BomPluginGrantPolicy,
  BomPluginHostConfiguration,
  BomPluginManifest,
  BomPluginPermission,
  BomPluginValidator,
} from '@bom-editor/contracts';
import type { BomDataSource } from '@bom-editor/datasource';
import type {
  BomMaterialMatchCandidate as ModelBomMaterialMatchCandidate,
  BomMaterialMatchComponentScores as ModelBomMaterialMatchComponentScores,
  BomMaterialMatchOptions as ModelBomMaterialMatchOptions,
  BomMaterialMatchResult as ModelBomMaterialMatchResult,
  BomMaterialMatchSelection as ModelBomMaterialMatchSelection,
  BomMaterialMatchSelectionStatus as ModelBomMaterialMatchSelectionStatus,
  BomMaterialMatchSource as ModelBomMaterialMatchSource,
  BomMaterialMatchWeights as ModelBomMaterialMatchWeights,
} from '@bom-editor/model';
import type {
  BomCanvasPresentationConfigurationResult,
  BomCanvasLiveAnnouncement,
  BomCanvasLiveAnnouncementResult,
  BomCanvasPresentationOptions,
  BomCanvasPresentationState,
  BomCanvasDiffView,
  BomCanvasRendererOptions,
  BomShortcutConfigurationResult,
  BomShortcutRegistryOptions,
} from '@bom-editor/renderer-canvas';

export type {
  BomCanvasLiveAnnouncement,
  BomCanvasLiveAnnouncementResult,
  BomCanvasLivePoliteness,
  BomCanvasLiveRegionLabels,
  BomCanvasLiveRegionOptions,
  BomCanvasLocalizedDiffLabels,
  BomCanvasLocalizedLiveRegionLabels,
  BomCanvasLocalizedText,
  BomCanvasPresentationConfigurationResult,
  BomCanvasPresentationDiagnostic,
  BomCanvasPresentationDiagnosticCode,
  BomCanvasPresentationOptions,
  BomCanvasPresentationState,
  BomCanvasRendererLabelOverrides,
  BomCanvasTextDirection,
  BomEditorLocale,
  LocalizedText,
  BomCanvasDiffView,
  BomCanvasDiffKind,
  BomCanvasDiffLabels,
  BomCanvasDiffCellDecoration,
  BomCanvasDiffRowDecoration,
} from '@bom-editor/renderer-canvas';
import type {
  BomCapabilities,
  BomCellAddress,
  BomClipboardPolicy,
  BomColumnDefinition,
  BomColumnInsertPosition,
  BomFrozenColumnPosition,
  BomDiagnostics,
  BomLogger,
  BomEventListener,
  BomEventMap,
  BomPasteFormat,
  BomPasteCell,
  BomPasteInput,
  BomPasteLimits,
  BomPastePolicy,
  BomResourceRegistryDiagnostics,
  BomSelectionState,
  BomViewColumnState,
  BomViewRowHeightState,
} from '@bom-editor/runtime';
import type { BomHistoryBudget } from '@bom-editor/transaction';
import type { VisibleQueryOptions } from '@bom-editor/visible-projection';

export type { VisibleQueryFilter, VisibleQueryOperator, VisibleQueryOptions, VisibleQuerySort } from '@bom-editor/visible-projection';

export type {
  BomStructureMoveIntent,
  BomStructureMovePosition,
  BomStructureMoveRequest,
} from '@bom-editor/runtime';
export type { BomStructureMoveRequestedEvent } from '@bom-editor/runtime';

export interface BomViewTemplate {
  readonly columns: readonly BomColumnDefinition[];
  readonly query?: Readonly<VisibleQueryOptions>;
}

export type {
  BomShortcutBinding,
  BomShortcutConfigurationResult,
  BomShortcutContext,
  BomShortcutDiagnostic,
  BomShortcutDiagnosticCode,
  BomShortcutInvocation,
  BomShortcutScope,
  BomShortcutRegistryOptions,
} from '@bom-editor/renderer-canvas';

export interface BomTransactionBuilder<
  TFields extends BomFields = BomFields,
> {
  execute(command: BomCommand<TFields>): void;
  /**
   * Adds a synchronous nested group to the current atomic transaction. Nested
   * groups do not create a second history entry or a second event sequence.
   */
  transaction(build: (transaction: BomTransactionBuilder<TFields>) => void): void;
}

/** A safe, value-free diagnostic for one source cell in a failed paste. */
export interface BomPasteCellDiagnostic {
  /** Zero-based coordinates in the candidate grid; parser failures may omit target fields. */
  readonly sourceRow: number;
  readonly sourceColumn: number;
  readonly code: string;
  /** Present only when multiple clipboard candidates all failed to parse. */
  readonly candidateFormat?: BomPasteFormat;
  readonly address?: Readonly<BomCellAddress>;
  readonly fieldId?: string;
}

export interface BomPasteReceipt<TFields extends BomFields = BomFields> {
  readonly commit: BomCommit<TFields>;
  readonly format: BomPasteFormat;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly cellCount: number;
}

/** Read-only result of parsing, converting, and authorizing a paste. */
export interface BomPastePreview<TFields extends BomFields = BomFields> {
  readonly inputBytes: number;
  readonly format: BomPasteFormat;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly cellCount: number;
  readonly decisionId: string;
  readonly cells: readonly Readonly<BomPasteCell>[];
}

export type BomSearchMode = 'exact' | 'prefix' | 'fuzzy' | 'regex';

/** A bounded, local document search request. */
export interface BomSearchRequest {
  readonly query: string;
  readonly mode?: BomSearchMode;
  /** Defaults to false. Regular-expression matching uses the same setting. */
  readonly caseSensitive?: boolean;
  /** Defaults to false. Requires the complete candidate cell to match. */
  readonly matchWholeCell?: boolean;
  readonly limit?: number;
}

export interface BomSearchMatch {
  readonly occurrenceId: OccurrenceId;
  readonly score: number;
  /** Matching field identifiers and/or the material-code metadata field. */
  readonly reasons: readonly string[];
}

export interface BomSearchResult {
  readonly matches: readonly Readonly<BomSearchMatch>[];
  /** Count before applying the request limit. */
  readonly totalMatches: number;
  /** True when `matches` contains only the first `limit` ranked matches. */
  readonly truncated: boolean;
  readonly indexRevision: RevisionToken;
}

/**
 * A read-only material matching request. Locale dictionaries, transliteration,
 * and tokenization remain host-provided functions rather than component props.
 */
export type BomMaterialMatchRequest<
  TFields extends BomFields = BomFields,
> = ModelBomMaterialMatchOptions<TFields>;

export type BomMaterialMatchCandidate = ModelBomMaterialMatchCandidate;
export type BomMaterialMatchComponentScores =
  ModelBomMaterialMatchComponentScores;
export type BomMaterialMatchResult = ModelBomMaterialMatchResult;
export type BomMaterialMatchSelection = ModelBomMaterialMatchSelection;
export type BomMaterialMatchSelectionStatus =
  ModelBomMaterialMatchSelectionStatus;
export type BomMaterialMatchSource = ModelBomMaterialMatchSource;
export type BomMaterialMatchWeights = ModelBomMaterialMatchWeights;

/**
 * A host-issued, immutable capability for explicitly adopting one material
 * match candidate into a target occurrence. The exact object returned by
 * `proposeMaterialMatch()` must be retained and passed to
 * `applyMaterialMatch()`; reconstructing this shape is rejected.
 */
export interface BomMaterialMatchProposal {
  readonly proposalId: string;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly baseRevision: RevisionToken;
  readonly targetOccurrenceId: OccurrenceId;
  readonly candidateOccurrenceId: OccurrenceId;
  readonly algorithmVersion: string;
  readonly score: number;
  readonly confidence: number;
}

/** Value-free input supplied to a host material-match approval policy. */
export interface BomMaterialMatchApprovalRequest
  extends BomMaterialMatchProposal {}

export interface BomMaterialMatchApprovalDecision {
  /** Value-free audit token; ASCII alphanumeric plus . _ : -, max 64 chars. */
  readonly decisionId: string;
  readonly allowed: boolean;
  /** Value-free reason token for a denied or failed decision. */
  readonly reasonCode?: string;
}

/** Optional host gate evaluated immediately before a match is committed. */
export interface BomMaterialMatchApprovalPolicy {
  authorize(
    request: Readonly<BomMaterialMatchApprovalRequest>,
    options: { readonly signal: AbortSignal },
  ):
    | Readonly<BomMaterialMatchApprovalDecision>
    | Promise<Readonly<BomMaterialMatchApprovalDecision>>;
}

export interface BomMaterialMatchApplyOptions {
  readonly signal?: AbortSignal;
  /** Appended to the value-free editor origin for host correlation. */
  readonly origin?: string;
}

export type BomValidationScope = 'document' | 'visible' | 'selection';

export interface BomValidationOptions {
  /** Defaults to `document`; `visible` follows the current projection. */
  readonly scope?: BomValidationScope;
  readonly signal?: AbortSignal;
}

/** Value-free structural and Schema diagnostics for a validation pass. */
export interface BomValidationReport {
  readonly taskId: string;
  readonly documentRevision: RevisionToken;
  readonly scope: BomValidationScope;
  readonly checkedNodeCount: number;
  readonly totalNodeCount: number;
  readonly valid: boolean;
  readonly issues: readonly Readonly<BomValidationIssue>[];
}

export type {
  BomPlugin,
  BomPluginCommand,
  BomPluginFixConflict,
  BomPluginFixDraft,
  BomPluginFixFieldImpact,
  BomPluginFixImpact,
  BomPluginFixProposal,
  BomPluginFixer,
  BomPluginGrantPolicy,
  BomPluginHostConfiguration,
  BomPluginManifest,
  BomPluginPermission,
  BomPluginValidator,
};

export interface BomPluginState {
  readonly manifest: Readonly<BomPluginManifest>;
  readonly negotiatedAbiVersion: string;
  readonly grantedPermissions: readonly BomPluginPermission[];
  readonly enabledCapabilities: readonly string[];
}

export interface BomPluginFixOptions {
  readonly signal?: AbortSignal;
  readonly origin?: string;
  /** Rejects overlapping active repairs unless the host explicitly supersedes them. */
  readonly conflictResolution?: 'reject' | 'supersede';
}

export type BomImportSource =
  | Blob
  | ArrayBuffer
  | ReadableStream<Uint8Array>;

export type BomImportHeaderMode = 'none' | 'firstRow';

/** Stable source-to-schema mapping used by delimited and optional XLSX importers. */
export interface BomImportColumnMapping {
  /** Source column index (zero-based) or header text when `header` is `firstRow`. */
  readonly source: number | string;
  /** Stable Schema field ID, never a localized column label. */
  readonly fieldId: string;
}

export interface BomImportHierarchyOptions {
  /** Source column containing a parent occurrence ID, when importing structure. */
  readonly parentFieldId?: string;
  /** Source column containing a one-based depth/level. */
  readonly levelFieldId?: string;
}

/** Independent limits for the optional XLSX parser; secure defaults are applied when omitted. */
export interface BomXlsxImportLimits {
  readonly maxBytes?: number;
  readonly maxRows?: number;
  readonly maxColumns?: number;
  readonly maxCells?: number;
  readonly maxCellBytes?: number;
  readonly maxEntries?: number;
  readonly maxSheets?: number;
  readonly maxUncompressedBytes?: number;
}

export interface BomImportOptions {
  readonly format?: 'xlsx' | 'csv' | 'tsv' | 'xls';
  readonly mode: 'preview' | 'commit';
  readonly signal?: AbortSignal;
  readonly baseRevision?: RevisionToken;
  readonly header?: BomImportHeaderMode;
  readonly mapping?: readonly Readonly<BomImportColumnMapping>[];
  /** Target field order; omitted values follow the active visible columns. */
  readonly fieldIds?: readonly string[];
  readonly hierarchy?: Readonly<BomImportHierarchyOptions>;
  /** Exact workbook sheet name; omitted selects the first workbook sheet. */
  readonly sheetName?: string;
  readonly xlsxLimits?: Readonly<BomXlsxImportLimits>;
}

/** Value-free source location for a rejected import cell or mapping. */
export interface BomImportCellDiagnostic {
  /** Present for a worksheet-scoped XLSX diagnostic. */
  readonly sheetName?: string;
  readonly sourceRow: number;
  readonly sourceColumn?: number;
  readonly fieldId?: string;
  readonly code: string;
  readonly messageKey: string;
  readonly suggestionKey?: string;
}

export interface BomImportReport<
  TFields extends BomFields = BomFields,
> {
  readonly taskId: string;
  readonly proposedPatch?: Readonly<BomPatch<TFields>>;
  readonly commit?: Readonly<BomCommit<TFields>>;
  readonly diagnostics: readonly Readonly<BomError>[];
  readonly cellDiagnostics?: readonly Readonly<BomImportCellDiagnostic>[];
}

export interface BomExportRequest {
  readonly mode: 'currentView' | 'completeData' | 'roundTripTemplate';
  readonly format: 'xlsx' | 'csv' | 'tsv';
  readonly rowScope: 'visible' | 'filtered' | 'all';
  readonly fieldIds: readonly string[];
  readonly csvFormulaProtection?: 'safe' | 'raw-exchange';
}

export interface BomExportDecision {
  readonly decisionId: string;
  readonly allowed: boolean;
  readonly fieldIds?: readonly string[];
  readonly maskingByFieldId?: Readonly<
    Record<string, 'omit' | 'redact' | 'hash'>
  >;
  readonly reasonCode?: string;
}

export interface BomExportPolicy {
  authorize(
    request: Readonly<BomExportRequest>,
    options: { readonly signal: AbortSignal },
  ): Promise<Readonly<BomExportDecision>>;
}

export interface BomExportOptions extends BomExportRequest {
  readonly signal?: AbortSignal;
}

export interface BomExportResult {
  readonly taskId: string;
  readonly blob: Blob;
  readonly effectiveMode:
    | 'currentView'
    | 'completeData'
    | 'roundTripTemplate'
    | 'policyTransformed';
  readonly lossless: boolean;
  readonly policyDecisionId?: string;
  readonly exportedRowCount: number;
  readonly exportedFieldIds: readonly string[];
  readonly omittedFieldIds: readonly string[];
  readonly maskingSummary: Readonly<
    Record<string, 'redact' | 'hash'>
  >;
  readonly warnings: readonly Readonly<BomError>[];
}

/**
 * Frontend editing-navigation behavior after a successful cell commit.
 * `shift-tab` always uses the inverse of the configured Tab traversal.
 */
export interface BomEditNavigation {
  readonly enter: 'down' | 'none';
  readonly tab: 'next-editable' | 'none';
}

/**
 * Serializable view state applied while an editor instance is created.
 *
 * Viewport dimensions are intentionally excluded because they are owned by
 * the mounted container. Stable row/column IDs are used for the initial
 * selection so the same configuration can be restored after a document is
 * normalized or projected.
 */
export interface BomEditorInitialView {
  /**
   * Complete ordered column geometry restored over the static `columns`
   * definitions. Every configured column must occur exactly once; this only
   * changes order, width, frozen side, and visibility.
   */
  readonly columns?: readonly Readonly<BomViewColumnState>[];
  readonly rowHeight?: number;
  /** Stable per-row height overrides restored by occurrence ID. */
  readonly rowHeights?: readonly Readonly<BomViewRowHeightState>[];
  readonly expandedIds?: readonly OccurrenceId[];
  readonly expandAll?: boolean;
  readonly query?: Readonly<VisibleQueryOptions>;
  readonly selection?: Readonly<BomSelectionState> | null;
  readonly scrollLeft?: number;
  readonly scrollTop?: number;
}

export type BomPasteResult<TFields extends BomFields = BomFields> =
  | {
      readonly ok: true;
      readonly value: Readonly<BomPasteReceipt<TFields>>;
    }
  | {
      readonly ok: false;
      readonly error: BomError;
      readonly diagnostics: readonly Readonly<BomPasteCellDiagnostic>[];
  };

export type BomPastePreviewResult<
  TFields extends BomFields = BomFields,
> =
  | {
      readonly ok: true;
      readonly value: Readonly<BomPastePreview<TFields>>;
    }
  | {
      readonly ok: false;
      readonly error: BomError;
      readonly diagnostics: readonly BomPasteCellDiagnostic[];
    };

export interface BomEditorCommonOptions<
  TFields extends BomFields = BomFields,
> {
  readonly schema: BomSchema;
  readonly columns: readonly BomColumnDefinition[];
  readonly instanceId?: string;
  readonly protocolVersion?: string;
  /** Complete serializable view state applied during construction. */
  readonly initialView?: Readonly<BomEditorInitialView>;
  /** @deprecated Use `initialView.rowHeight`. */
  readonly rowHeight?: number;
  /** @deprecated Use `initialView.expandedIds`. */
  readonly expandedIds?: readonly string[];
  /** @deprecated Use `initialView.expandAll`. */
  readonly expandAll?: boolean;
  readonly history?: Partial<BomHistoryBudget>;
  /** Called synchronously before a copy or cut format is generated. */
  readonly clipboardPolicy?: BomClipboardPolicy;
  /** Optional client-side export authorization policy. */
  readonly exportPolicy?: BomExportPolicy;
  /** Called synchronously after Schema conversion and before one atomic paste. */
  readonly pastePolicy?: BomPastePolicy;
  /** Bounded plain-text paste parser settings; omitted members use secure defaults. */
  readonly pasteLimits?: Partial<Readonly<BomPasteLimits>>;
  /**
   * Browser-only continuous-editing behavior. Successful commits still emit
   * the normal `selectionChanged` and `editEnd` outputs through `on()`.
   */
  readonly editNavigation?: Partial<Readonly<BomEditNavigation>>;
  /** Built-in shortcut overrides and browser-only custom bindings. */
  readonly shortcuts?: Readonly<BomShortcutRegistryOptions>;
  /** Initial trusted plugins. They are staged and installed before ready. */
  readonly plugins?: readonly BomPlugin<TFields>[];
  /** Explicit host permission grant policy; omitted means no permissions. */
  readonly pluginGrantPolicy?: BomPluginGrantPolicy;
  /** ABI, engine, and capability limits applied before a plugin can run setup. */
  readonly pluginHostConfiguration?: Readonly<BomPluginHostConfiguration>;
  /** Optional value-free gate for explicit material-match adoption. */
  readonly matchApprovalPolicy?: BomMaterialMatchApprovalPolicy;
  /** Optional value-free diagnostics sink; exceptions are isolated. */
  readonly logger?: BomLogger;
  readonly renderer?: Omit<
    BomCanvasRendererOptions<TFields>,
    'instanceId' | 'shortcuts'
  >;
}

/** A complete frontend document change emitted after a local commit. */
export interface BomEditorComponentDocumentChange<
  TFields extends BomFields = BomFields,
> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly commit: BomCommit<TFields>;
  readonly patch: BomPatch<TFields>;
  readonly origin: string;
}

/**
 * Framework-neutral component outputs. Handlers receive the existing frozen
 * runtime events, except `onDocumentChange`, which also owns the next Snapshot.
 */
export interface BomEditorComponentOutputs<
  TFields extends BomFields = BomFields,
> {
  readonly onDocumentChange?: (
    event: Readonly<BomEditorComponentDocumentChange<TFields>>,
  ) => void;
  /**
   * Publishes the value-free identity of an adopted document. Hosts use
   * `next.documentId`, `next.generation`, and `next.revision` to bind a
   * subsequent controlled Diff view to the newly published document.
   */
  readonly onDocumentReplaced?: BomEventListener<TFields, 'documentReplaced'>;
  /** Requests host completion when a partial Snapshot cannot prove a move locally. */
  readonly onStructureMoveRequest?: BomEventListener<TFields, 'structureMoveRequested'>;
  readonly onSelectionChange?: BomEventListener<TFields, 'selectionChanged'>;
  readonly onViewChange?: BomEventListener<TFields, 'viewChanged'>;
  readonly onEditStart?: BomEventListener<TFields, 'editStart'>;
  readonly onDraftChange?: BomEventListener<TFields, 'valueChanged'>;
  readonly onEditEnd?: BomEventListener<TFields, 'editEnd'>;
  readonly onEditRejected?: BomEventListener<TFields, 'commitRejected'>;
  readonly onPaste?: BomEventListener<TFields, 'pasteOperation'>;
  readonly onValidationChange?: BomEventListener<TFields, 'validationChanged'>;
  readonly onMaterialMatchAudit?: BomEventListener<TFields, 'materialMatchAudit'>;
  readonly onClipboardCompleted?: BomEventListener<TFields, 'clipboardCompleted'>;
  readonly onClipboardRejected?: BomEventListener<TFields, 'clipboardRejected'>;
  readonly onTaskProgress?: BomEventListener<TFields, 'taskProgress'>;
  readonly onError?: BomEventListener<TFields, 'error'>;
}

/**
 * Framework-neutral browser component inputs. This surface intentionally has
 * no DataSource or persistence properties.
 */
export interface BomEditorComponentProps<
  TFields extends BomFields = BomFields,
> extends BomEditorCommonOptions<TFields> {
  readonly document: BomDocumentSnapshot<TFields>;
  /** Controlled value-free Diff overlay for the current document revision. */
  readonly diffView?: Readonly<BomCanvasDiffView> | null;
  readonly outputs?: Readonly<BomEditorComponentOutputs<TFields>>;
}

/** Runtime-updatable component inputs. Schema and renderer construction options stay fixed. */
export interface BomEditorComponentUpdate<
  TFields extends BomFields = BomFields,
> {
  readonly document: BomDocumentSnapshot<TFields>;
  /** Optional request ID proving this document is a host response to a partial move. */
  readonly structureMoveRequestId?: string;
  /** Replaces the controlled column definitions without changing the document. */
  readonly columns?: readonly BomColumnDefinition[];
  /** Replaces or clears the controlled value-free Diff overlay. */
  readonly diffView?: Readonly<BomCanvasDiffView> | null;
  readonly outputs?: Readonly<BomEditorComponentOutputs<TFields>>;
}

export type BomEditorOptions<
  TFields extends BomFields = BomFields,
> = BomEditorCommonOptions<TFields> & (
  | {
      readonly initialDocument: BomDocumentSnapshot<TFields>;
      readonly dataSource?: never;
    }
  | {
      readonly dataSource: BomDataSource<TFields>;
      readonly initialDocument?: never;
    }
  | {
      readonly initialDocument?: undefined;
      readonly dataSource?: undefined;
    }
);

export const BOM_EDITOR_RESOURCE_LEDGER_PROTOCOL =
  'bom-editor-resource-ledger/v1';
export const BOM_EDITOR_TASK_LEDGER_PROTOCOL =
  'bom-editor-task-ledger/v1';
export const BOM_EDITOR_WORKER_TASK_LEDGER_PROTOCOL =
  'bom-editor-worker-task-ledger/v1';

export interface BomEditorEventHubResourceDiagnostics {
  readonly kind: 'event-hub-listener';
  readonly tracked: true;
  readonly supported: true;
  readonly registeredCount: number;
  readonly removedCount: number;
  readonly activeCount: number;
  readonly pendingAsyncCount: number;
  readonly outstandingCount: number;
  readonly cleanupFailureCount: 0;
}

export interface BomEditorTaskResourceDiagnostics {
  readonly protocol: typeof BOM_EDITOR_TASK_LEDGER_PROTOCOL;
  readonly kind: 'editor-task';
  readonly tracked: true;
  readonly supported: true;
  readonly queuedCount: number;
  readonly runningCount: number;
  readonly outstandingCount: number;
  readonly cleanupFailureCount: 0;
}

export interface BomEditorWorkerTaskResourceDiagnostics {
  readonly protocol: typeof BOM_EDITOR_WORKER_TASK_LEDGER_PROTOCOL;
  readonly kind: 'worker-task';
  readonly tracked: boolean;
  readonly supported: boolean;
  readonly queuedCount: number | null;
  readonly runningCount: number | null;
  readonly outstandingCount: number | null;
  readonly cleanupFailureCount: number | null;
}

export interface BomEditorResourceDiagnostics {
  readonly protocol: typeof BOM_EDITOR_RESOURCE_LEDGER_PROTOCOL;
  /** Current renderer registry, or the last terminal registry after teardown. */
  readonly renderer: Readonly<BomResourceRegistryDiagnostics> | null;
  readonly eventHub: Readonly<BomEditorEventHubResourceDiagnostics>;
  readonly tasks: Readonly<BomEditorTaskResourceDiagnostics>;
  readonly workerTasks: Readonly<BomEditorWorkerTaskResourceDiagnostics>;
  readonly activeCount: number;
  readonly cleanupFailureCount: number;
  readonly fullyTracked: boolean;
  readonly trackedResourcesReleased: boolean;
}

export interface BomEditorDiagnostics extends BomDiagnostics {
  readonly instanceId: string;
  readonly documentGeneration: number;
  readonly visibleRows: number;
  readonly totalHeight: number;
  readonly mountedResources: number;
  readonly resources: Readonly<BomEditorResourceDiagnostics>;
}

export interface BomEditorReplaceSourceOptions {
  readonly pending?: 'wait' | 'abortAndRollback';
  readonly preserveView?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Read-only query against the currently bound remote DataSource. The editor
 * fills `expectedSourceRevision` from its active source session unless the
 * caller supplies the same value explicitly.
 */
export interface BomEditorDataSourceQueryOptions
  extends Omit<BomQueryRequest, 'expectedSourceRevision'> {
  readonly expectedSourceRevision?: RevisionToken;
  readonly signal?: AbortSignal;
}

/**
 * A normalized remote query result. IDs may refer to unloaded nodes; callers
 * can load a partial branch with `loadDataSourceChildren()` when appropriate.
 */
export interface BomEditorDataSourceQueryResult extends BomQueryResult {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
}

/** Options for one bounded page load below an existing partial-tree parent. */
export interface BomEditorLoadDataSourceChildrenOptions {
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

/** Metadata for a successfully staged and atomically published child page. */
export interface BomEditorDataSourceChildrenLoadResult<
  TFields extends BomFields = BomFields,
> {
  readonly parentId: OccurrenceId;
  readonly page: Readonly<BomPage<TFields>>;
  readonly documentGeneration: BomDocumentGeneration;
}

export interface BomEditor<
  TFields extends BomFields = BomFields,
> {
  readonly instanceId: string;
  readonly ready: Promise<BomResult<void>>;
  readonly capabilities: Readonly<BomCapabilities>;

  mount(container: HTMLElement): Promise<BomResult<void>>;
  unmount(): BomResult<void>;
  setDocument(
    snapshot: BomDocumentSnapshot<TFields>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<void>>;
  replaceSource(
    source: BomDocumentSnapshot<TFields> | BomDataSource<TFields>,
    options?: BomEditorReplaceSourceOptions,
  ): Promise<BomResult<void>>;
  /**
   * Executes a bounded read-only query through the active remote DataSource.
   * It never changes the document, selection, or local query projection.
   */
  queryDataSource(
    options: Readonly<BomEditorDataSourceQueryOptions>,
  ): Promise<BomResult<Readonly<BomEditorDataSourceQueryResult>>>;
  /**
   * Stages one page of direct children from a lazy DataSource and publishes it
   * only when its source revision still matches the active document.
   */
  loadDataSourceChildren(
    parentId: OccurrenceId,
    options?: Readonly<BomEditorLoadDataSourceChildrenOptions>,
  ): Promise<BomResult<BomEditorDataSourceChildrenLoadResult<TFields>>>;
  execute(
    command: BomCommand<TFields>,
    options?: {
      readonly signal?: AbortSignal;
      readonly origin?: string;
      /** Caller-supplied retry key used when the active DataSource persists a mutation. */
      readonly idempotencyKey?: string;
    },
  ): Promise<BomResult<BomCommit<TFields>>>;
  applyPatch(
    patch: BomPatch<TFields>,
    options?: {
      readonly signal?: AbortSignal;
      readonly origin?: string;
    },
  ): Promise<BomResult<BomCommit<TFields>>>;
  transaction(
    build: (transaction: BomTransactionBuilder<TFields>) => void,
    options?: {
      readonly label?: string;
      readonly origin?: string;
      readonly signal?: AbortSignal;
      /** Caller-supplied retry key used when the active DataSource persists a mutation. */
      readonly idempotencyKey?: string;
    },
  ): Promise<BomResult<BomCommit<TFields>>>;
  undo(options?: {
    readonly signal?: AbortSignal;
    readonly origin?: string;
  }): Promise<BomResult<BomCommit<TFields>>>;
  redo(options?: {
    readonly signal?: AbortSignal;
    readonly origin?: string;
  }): Promise<BomResult<BomCommit<TFields>>>;
  configureShortcuts(
    options: Readonly<BomShortcutRegistryOptions>,
  ): BomShortcutConfigurationResult;
  resetShortcuts(): BomShortcutConfigurationResult;
  configurePresentation(
    options: Readonly<BomCanvasPresentationOptions>,
  ): BomCanvasPresentationConfigurationResult;
  getPresentation(): Readonly<BomCanvasPresentationState>;
  /** Sends a localized, value-reviewed message to the mounted live region. */
  announce(
    announcement: Readonly<BomCanvasLiveAnnouncement>,
  ): BomCanvasLiveAnnouncementResult;
  /** Replaces or clears value-free Diff markers without changing document data. */
  setDiffView(diffView: Readonly<BomCanvasDiffView> | null): BomResult<void>;
  installPlugin(
    plugin: BomPlugin<TFields>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<void>>;
  uninstallPlugin(pluginId: string): Promise<BomResult<void>>;
  reloadPlugin(
    pluginId: string,
    replacement: BomPlugin<TFields>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<void>>;
  getPlugins(): readonly Readonly<BomPluginState>[];
  proposeFix(
    pluginId: string,
    issue: Readonly<BomValidationIssue>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<Readonly<BomPluginFixProposal<TFields>> | null>>;
  applyFix(
    proposal: Readonly<BomPluginFixProposal<TFields>>,
    options?: Readonly<BomPluginFixOptions>,
  ): Promise<BomResult<BomCommit<TFields>>>;
  executePluginCommand(
    pluginId: string,
    commandId: string,
    payload?: unknown,
    options?: { readonly signal?: AbortSignal; readonly origin?: string },
  ): Promise<BomResult<BomCommit<TFields>>>;
  setColumns(columns: readonly BomColumnDefinition[]): BomResult<void>;
  setRowHeight(
    occurrenceId: OccurrenceId,
    rowHeight: number,
  ): BomResult<void>;
  /** Replaces the view-only local sort/filter query without changing the document. */
  setViewQuery(options?: Readonly<VisibleQueryOptions>): BomResult<void>;
  getViewTemplate(): Readonly<BomViewTemplate>;
  applyViewTemplate(template: Readonly<BomViewTemplate>): BomResult<void>;
  /** Fills numeric or ISO temporal columns from the first two selected rows using their step. */
  fillSeries(): void;
  setColumnFrozen(
    columnId: string,
    frozen: BomFrozenColumnPosition,
  ): BomResult<void>;
  insertColumn(
    referenceColumnId: string,
    position?: BomColumnInsertPosition,
    count?: number,
  ): BomResult<void>;
  deleteColumns(columnIds: readonly string[]): BomResult<void>;
  /**
   * Replaces a suspended writable-source session from its authoritative
   * document after a `reloadRequired` persistence event.
   */
  recoverPersistence(options?: {
    readonly signal?: AbortSignal;
  }): Promise<BomResult<void>>;
  /**
   * Paste one or more raw clipboard representations. `pasteText()` remains a
   * convenience wrapper for callers that only have `text/plain` content.
   */
  paste(
    input: Readonly<BomPasteInput>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomPasteResult<TFields>>;
  pasteText(
    text: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomPasteResult<TFields>>;
  previewPaste(
    input: Readonly<BomPasteInput>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomPastePreviewResult<TFields>>;
  importData(
    source: BomImportSource,
    options: Readonly<BomImportOptions>,
  ): Promise<BomResult<BomImportReport<TFields>>>;
  exportData(
    options: Readonly<BomExportOptions>,
  ): Promise<BomResult<BomExportResult>>;
  search(
    request: Readonly<BomSearchRequest>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<BomSearchResult>>;
  /**
   * Produces deterministic material-match suggestions only. It never changes
   * the document or selection, including when a candidate is auto-selected.
   */
  matchMaterials(
    request: Readonly<BomMaterialMatchRequest<TFields>>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<BomMaterialMatchResult>>;
  proposeMaterialMatch(
    targetOccurrenceId: OccurrenceId,
    candidate: Readonly<BomMaterialMatchCandidate>,
  ): BomResult<Readonly<BomMaterialMatchProposal>>;
  applyMaterialMatch(
    proposal: Readonly<BomMaterialMatchProposal>,
    options?: Readonly<BomMaterialMatchApplyOptions>,
  ): Promise<BomResult<BomCommit<TFields>>>;
  validate(
    options?: Readonly<BomValidationOptions>,
  ): Promise<BomResult<BomValidationReport>>;
  focusCell(address: Readonly<BomCellAddress>): BomResult<void>;

  getSnapshot(): BomDocumentSnapshot<TFields>;
  getDiagnostics(): Readonly<BomEditorDiagnostics>;
  on<K extends keyof BomEventMap<TFields>>(
    type: K,
    listener: BomEventListener<TFields, K>,
  ): () => void;
  focus(): BomResult<void>;
  blur(): BomResult<void>;
  destroy(): void;
}

/** A browser component facade that accepts document props and emits UI outputs. */
export interface BomEditorComponent<
  TFields extends BomFields = BomFields,
> {
  readonly instanceId: string;
  readonly ready: Promise<BomResult<void>>;

  mount(container: HTMLElement): Promise<BomResult<void>>;
  unmount(): BomResult<void>;
  update(
    input: Readonly<BomEditorComponentUpdate<TFields>>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<void>>;
  focus(): BomResult<void>;
  blur(): BomResult<void>;
  configureShortcuts(
    options: Readonly<BomShortcutRegistryOptions>,
  ): BomShortcutConfigurationResult;
  resetShortcuts(): BomShortcutConfigurationResult;
  configurePresentation(
    options: Readonly<BomCanvasPresentationOptions>,
  ): BomCanvasPresentationConfigurationResult;
  getPresentation(): Readonly<BomCanvasPresentationState>;
  announce(
    announcement: Readonly<BomCanvasLiveAnnouncement>,
  ): BomCanvasLiveAnnouncementResult;
  /** Replaces or clears value-free Diff markers without changing document data. */
  setDiffView(diffView: Readonly<BomCanvasDiffView> | null): BomResult<void>;
  installPlugin(
    plugin: BomPlugin<TFields>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<void>>;
  uninstallPlugin(pluginId: string): Promise<BomResult<void>>;
  reloadPlugin(
    pluginId: string,
    replacement: BomPlugin<TFields>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<void>>;
  getPlugins(): readonly Readonly<BomPluginState>[];
  setColumns(columns: readonly BomColumnDefinition[]): BomResult<void>;
  setRowHeight(
    occurrenceId: OccurrenceId,
    rowHeight: number,
  ): BomResult<void>;
  setViewQuery(options?: Readonly<VisibleQueryOptions>): BomResult<void>;
  getViewTemplate(): Readonly<BomViewTemplate>;
  applyViewTemplate(template: Readonly<BomViewTemplate>): BomResult<void>;
  fillSeries(): void;
  setColumnFrozen(
    columnId: string,
    frozen: BomFrozenColumnPosition,
  ): BomResult<void>;
  insertColumn(
    referenceColumnId: string,
    position?: BomColumnInsertPosition,
    count?: number,
  ): BomResult<void>;
  deleteColumns(columnIds: readonly string[]): BomResult<void>;
  search(
    request: Readonly<BomSearchRequest>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<BomSearchResult>>;
  matchMaterials(
    request: Readonly<BomMaterialMatchRequest<TFields>>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<BomMaterialMatchResult>>;
  proposeMaterialMatch(
    targetOccurrenceId: OccurrenceId,
    candidate: Readonly<BomMaterialMatchCandidate>,
  ): BomResult<Readonly<BomMaterialMatchProposal>>;
  applyMaterialMatch(
    proposal: Readonly<BomMaterialMatchProposal>,
    options?: Readonly<BomMaterialMatchApplyOptions>,
  ): Promise<BomResult<BomCommit<TFields>>>;
  importData(
    source: BomImportSource,
    options: Readonly<BomImportOptions>,
  ): Promise<BomResult<BomImportReport<TFields>>>;
  exportData(
    options: Readonly<BomExportOptions>,
  ): Promise<BomResult<BomExportResult>>;
  validate(
    options?: Readonly<BomValidationOptions>,
  ): Promise<BomResult<BomValidationReport>>;
  focusCell(address: Readonly<BomCellAddress>): BomResult<void>;
  previewPaste(
    input: Readonly<BomPasteInput>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomPastePreviewResult<TFields>>;
  destroy(): void;
}
