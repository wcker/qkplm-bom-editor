import type {
  BomCommand,
  BomCommandBatch,
  BomCommit,
  BomDocumentReference,
  BomDocumentSnapshot,
  BomError,
  BomFieldSchema,
  BomFields,
  BomNode,
  BomOperation,
  BomPage,
  OccurrenceId,
  BomPatch,
  BomQueryExpression,
  BomQueryRequest,
  BomQueryResult,
  BomRemotePatchEnvelope,
  BomRecoveryBundle,
  BomResult,
  BomSchema,
  BomSnapshotDiff,
  BomValue,
  BomValidationIssue,
  RevisionToken,
  BomTransactionPersistenceState,
} from '@bom-editor/contracts';
import type {
  BomPlugin,
  BomPluginCapability,
  BomPluginCleanup,
  BomPluginCommand,
  BomPluginFixConflict,
  BomPluginFixDraft,
  BomPluginFixImpact,
  BomPluginFixProposal,
  BomPluginFixer,
  BomPluginGrantPolicy,
  BomPluginHostConfiguration,
  BomPluginManifest,
  BomPluginPermission,
  BomPluginValidationFinding,
  BomPluginValidator,
} from '@bom-editor/contracts';
import {
  BOM_DATASOURCE_ERROR_CODES,
  BomDataSourceException,
  createBomRemoteCommitCoordinator,
  dataSourceError,
  validateBomDataSource,
  type BomAtomicRollbackRequest,
  type BomAtomicRollbackResult,
  type BomDataSource,
  type BomIsolatedReplayRequest,
  type BomIsolatedReplayResult,
  type BomRemoteCommitAuditEvent,
  type BomRemoteCommitCoordinator,
  type BomRemoteCommitOutcome,
  type BomRemoteCommitReceipt,
  type BomRemoteCommitSubmission,
} from '@bom-editor/datasource';
import {
  BOM_MATCH_ALGORITHM_VERSION,
  BOM_MODEL_ERROR_CODES,
  LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
  buildBomIndexes,
  compareUtf8,
  comparePositionKeys,
  createPositionKeyBetween,
  diffBomDocumentSnapshots,
  encodeCanonicalValue,
  hashBomFieldValue,
  matchBomMaterials,
  modelError,
  normalizeBomDocumentSnapshot,
  normalizeFieldValue,
  normalizeBomSchema,
  normalizeBomValue,
  rebalancePositionKeys,
  sha256Hex,
  type BomBaseIndexes,
} from '@bom-editor/model';
import {
  BOM_CANVAS_DIFF_VIEW_PROTOCOL,
  DEFAULT_BOM_CANVAS_THEME,
  mountBomCanvasRenderer,
  resolveBomCanvasLabels,
  type BomCanvasInvalidation,
  type BomCanvasDiffKind,
  type BomCanvasDiffDeletionSummary,
  type BomCanvasDiffGhostRow,
  type BomCanvasDiffView,
  type BomCanvasClipboardPayload,
  type BomCanvasLiveAnnouncement,
  type BomCanvasLiveAnnouncementResult,
  type BomCanvasRenderer,
  type BomCanvasRendererCallbacks,
  type BomCanvasRendererLabelOverrides,
  type BomCanvasRendererOptions,
  type BomCanvasPresentationConfigurationResult,
  type BomCanvasPresentationOptions,
  type BomCanvasPresentationState,
  type BomCanvasRendererLabels,
  type BomCanvasTheme,
  type BomCanvasViewModel,
  type BomEditorLocale,
  type BomCanvasColumnVisibilityReason,
  type BomCanvasColumnInsertReason,
  type BomCanvasColumnDeleteReason,
  type BomCanvasWorkerTaskDiagnostics,
  type BomShortcutConfigurationResult,
  type BomShortcutRegistryOptions,
  type BomTreeInsertMode,
  type BomTreeMoveRequest,
  type BomTreeMoveDirection,
  validateBomShortcutOptions,
} from '@bom-editor/renderer-canvas';
import {
  BOM_STRUCTURE_MOVE_REQUEST_PROTOCOL,
  EventHub,
  createBomEditStateMachine,
  detectBomCapabilities,
  type BomCapabilities,
  type BomBranchClipboardOperation,
  type BomClipboardBranchScope,
  type BomCellAddress,
  type BomCellRange,
  type BomClipboardDecision,
  type BomClipboardFormat,
  type BomClipboardMasking,
  type BomClipboardOperation,
  type BomClipboardPolicy,
  type BomClipboardRequest,
  type BomClipboardWriteMethod,
  type BomColumnDefinition,
  type BomColumnInsertPosition,
  type BomFrozenColumnPosition,
  type BomEditAction,
  type BomEditCommitReason,
  type BomEditDraft,
  type BomEditState,
  type BomEditStateMachine,
  type BomEditTrigger,
  type BomEventListener,
  type BomEventMap,
  type BomLifecycleState,
  type BomPasteAuthorizationRequest,
  type BomPasteCell,
  type BomPasteDecision,
  type BomPasteFormat,
  type BomPasteInput,
  type BomPasteLimits,
  type BomPastePolicy,
  type BomPasteSource,
  type BomResourceRegistryDiagnostics,
  type BomSelectionChangeReason,
  type BomSelectionMode,
  type BomSelectionState,
  type BomViewColumnState,
  type BomViewRowHeightState,
  type BomStructureMoveRequest,
  type BomViewState,
  type BomWindowLike,
} from '@bom-editor/runtime';
import {
  createBomTransactionEngine,
  type BomHistorySuffixReconcileResult,
  type BomHistoryBudget,
  type BomPreparedTransaction,
  type BomTransactionEngineApi,
  type BomTransactionResult,
} from '@bom-editor/transaction';
import {
  buildViewChildrenByParent,
  createVisibleProjection,
  MAX_ROW_HEIGHT_PX,
  type VisibleProjection,
  type VisibleQueryFilter,
  type VisibleQueryOptions,
  type VisibleQuerySort,
} from '@bom-editor/visible-projection';
import { normalizeEditorColumns } from './columns.js';
import { formatEditorValue, parseEditorValue } from './edit-value.js';
import { serializeBomViewTemplate } from './template.js';
import {
  BOM_EDITOR_ERROR_CODES,
  BomEditorConfigurationError,
  editorError,
  editorFailure,
  editorSuccess,
} from './errors.js';
import {
  parseClipboardTextAsync,
  type ClipboardParseDiagnostic,
  type ClipboardTextParseFailureReason,
  type ClipboardTextParseAsyncResult,
} from './paste.js';
import {
  createClipboardParseWorkerClient,
  type ClipboardParseWorkerClient,
} from './clipboard-worker-client.js';
import { parseClipboardTextStreamAsync } from './stream-clipboard.js';
import {
  createXlsxWorkbook,
  parseXlsx,
  type XlsxLimits,
} from './xlsx.js';
import {
  parseHtmlClipboardAsync,
  type HtmlClipboardParseFailureReason,
} from './html-clipboard.js';
import {
  BOM_INTERNAL_CLIPBOARD_FORMAT,
  BOM_INTERNAL_CLIPBOARD_KIND,
  BOM_INTERNAL_CLIPBOARD_VERSION,
  parseBranchClipboardAsync,
  parseInternalClipboardAsync,
  type InternalBranchClipboardEnvelope,
  type InternalClipboardParseFailureReason,
} from './internal-clipboard.js';
import {
  BOM_EDITOR_RESOURCE_LEDGER_PROTOCOL,
  BOM_EDITOR_TASK_LEDGER_PROTOCOL,
  BOM_EDITOR_WORKER_TASK_LEDGER_PROTOCOL,
  type BomEditor,
  type BomEditorDataSourceChildrenLoadResult,
  type BomEditorDataSourceQueryOptions,
  type BomEditorDataSourceQueryResult,
  type BomEditorDiagnostics,
  type BomEditNavigation,
  type BomEditorInitialView,
  type BomEditorLoadDataSourceChildrenOptions,
  type BomEditorOptions,
  type BomExportDecision,
  type BomExportOptions,
  type BomExportPolicy,
  type BomExportResult,
  type BomImportOptions,
  type BomImportHierarchyOptions,
  type BomImportCellDiagnostic,
  type BomImportColumnMapping,
  type BomImportReport,
  type BomImportSource,
  type BomXlsxImportLimits,
  type BomPasteCellDiagnostic,
  type BomPastePreview,
  type BomPastePreviewResult,
  type BomPasteReceipt,
  type BomPasteResult,
  type BomMaterialMatchCandidate,
  type BomMaterialMatchApprovalPolicy,
  type BomMaterialMatchApplyOptions,
  type BomMaterialMatchProposal,
  type BomMaterialMatchRequest,
  type BomMaterialMatchResult,
  type BomSearchMatch,
  type BomSearchRequest,
  type BomSearchResult,
  type BomValidationOptions,
  type BomValidationReport,
  type BomValidationScope,
  type BomEditorReplaceSourceOptions,
  type BomEditorResourceDiagnostics,
  type BomEditorWorkerTaskResourceDiagnostics,
  type BomPluginFixOptions,
  type BomPluginState,
  type BomTransactionBuilder,
} from './types.js';

interface PublishedState<TFields extends BomFields> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly indexes: BomBaseIndexes<TFields>;
  readonly projection: VisibleProjection<TFields>;
  readonly documentGeneration: number;
  readonly sourceType: 'memory' | 'dataSource';
}

interface InstalledPlugin<TFields extends BomFields> {
  readonly plugin: BomPlugin<TFields>;
  readonly manifest: Readonly<BomPluginManifest>;
  readonly negotiatedAbiVersion: string;
  readonly grantedPermissions: readonly BomPluginPermission[];
  readonly enabledCapabilities: readonly string[];
  readonly validators: Map<string, RegisteredPluginValidator<TFields>>;
  readonly fixers: Map<string, BomPluginFixer<TFields>>;
  readonly commands: Map<string, BomPluginCommand<TFields>>;
  readonly unregisters: readonly (() => void)[];
  readonly runtime: PluginRuntime;
  readonly cleanup: BomPluginCleanup | undefined;
}

interface PluginStage<TFields extends BomFields> {
  readonly plugin: BomPlugin<TFields>;
  readonly manifest: Readonly<BomPluginManifest>;
  readonly negotiatedAbiVersion: string;
  readonly grantedPermissions: readonly BomPluginPermission[];
  readonly enabledCapabilities: readonly string[];
  readonly validators: Map<string, RegisteredPluginValidator<TFields>>;
  readonly fixers: Map<string, BomPluginFixer<TFields>>;
  readonly commands: Map<string, BomPluginCommand<TFields>>;
  readonly unregisters: Array<() => void>;
  readonly runtime: PluginRuntime;
  registrationsActive: boolean;
  cleanup: BomPluginCleanup | undefined;
}

interface PluginNegotiation {
  readonly negotiatedAbiVersion: string;
  readonly enabledCapabilities: readonly BomPluginCapability[];
}

interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

interface NormalizedPluginHostConfiguration {
  readonly engineVersion: string;
  readonly parsedEngineVersion: Readonly<SemanticVersion>;
  readonly supportedAbiVersions: readonly Readonly<{
    readonly raw: string;
    readonly version: Readonly<SemanticVersion>;
  }>[];
  readonly supportedCapabilities: readonly BomPluginCapability[];
  readonly asyncHookTimeoutMs: number;
  readonly syncHookBudgetMs: number;
}

/** Mutable host-owned lifecycle state. It is never exposed to plugin code. */
interface PluginRuntime {
  lifecycleController: AbortController;
  hookController: AbortController;
  acceptingCalls: boolean;
  hookEpoch: number;
  inFlightHooks: number;
  readonly drainWaiters: Set<() => void>;
}

type PluginHookResult<T> =
  | { readonly status: 'fulfilled'; readonly value: T }
  | { readonly status: 'rejected'; readonly error: unknown }
  | { readonly status: 'aborted' }
  | { readonly status: 'timeout' };

type PluginHookName = 'grant' | 'setup' | 'validator' | 'fixer' | 'command' | 'cleanup';

/** Validated registration metadata that the host, rather than plugin output, owns. */
interface RegisteredPluginValidator<TFields extends BomFields> {
  readonly validator: BomPluginValidator<TFields>;
  readonly ruleId: string;
  readonly version: string;
  readonly severity: 'info' | 'warning' | 'error';
}

class PluginPermissionDeniedError extends Error {
  public constructor() {
    super('BOM_PLUGIN_PERMISSION_DENIED');
  }
}

interface NormalizedFixDraft<TFields extends BomFields> {
  readonly proposalId: string;
  readonly ruleId: string;
  readonly titleKey: string;
  readonly confidence: number;
  readonly commands: readonly BomCommand<TFields>[];
}

type IssuedFixProposalStatus =
  | 'active'
  | 'applying'
  | 'applied'
  | 'stale'
  | 'superseded';

interface IssuedFixProposal<TFields extends BomFields> {
  readonly proposal: Readonly<BomPluginFixProposal<TFields>>;
  readonly entry: InstalledPlugin<TFields>;
  status: IssuedFixProposalStatus;
}

interface MaterialMatchCandidateContext<TFields extends BomFields> {
  readonly state: Readonly<PublishedState<TFields>>;
  readonly candidateOccurrenceId: OccurrenceId;
  readonly algorithmVersion: string;
  readonly score: number;
  readonly confidence: number;
}

type IssuedMaterialMatchProposalStatus =
  | 'active'
  | 'approvalPending'
  | 'applying'
  | 'applied'
  | 'stale';

interface IssuedMaterialMatchProposal<TFields extends BomFields> {
  readonly proposal: Readonly<BomMaterialMatchProposal>;
  status: IssuedMaterialMatchProposalStatus;
}

type MaterialMatchAuthorization =
  | {
      readonly status: 'allowed';
      readonly decisionId: string;
    }
  | {
      readonly status: 'denied';
      readonly decisionId: string;
      readonly reasonCode?: string;
    }
  | { readonly status: 'invalid' };

type MaterialMatchApprovalWaitResult =
  | { readonly status: 'fulfilled'; readonly value: unknown }
  | { readonly status: 'rejected' }
  | { readonly status: 'aborted' };

interface HistoryInteractionEntry {
  readonly kind: 'document' | 'columns' | 'row-height';
  readonly transactionId: string;
  readonly beforeSelection: Readonly<BomSelectionState>;
  readonly beforeView: Readonly<BomViewState>;
  readonly afterSelection: Readonly<BomSelectionState>;
  readonly afterView: Readonly<BomViewState>;
  readonly beforeColumns?: readonly Readonly<BomColumnDefinition>[];
  readonly afterColumns?: readonly Readonly<BomColumnDefinition>[];
  readonly beforeRowHeights?: readonly Readonly<BomViewRowHeightState>[];
  readonly afterRowHeights?: readonly Readonly<BomViewRowHeightState>[];
}

interface ColumnResizeHistorySession {
  readonly columnId: string;
  readonly beforeColumns: readonly Readonly<BomColumnDefinition>[];
  readonly beforeSelection: Readonly<BomSelectionState>;
}

type HistoryInteractionMode = 'record' | 'undo' | 'redo' | 'none' | 'reset';

interface TransactionAttempt {
  readonly transactionId: string;
  readonly origin: string;
  readonly baseRevision: RevisionToken;
}

interface TransactionBuildContext<TFields extends BomFields> {
  readonly commands: BomCommand<TFields>[];
  readonly builder: BomTransactionBuilder<TFields>;
  readonly transactionId: string;
  readonly origin: string;
  readonly label: string | undefined;
  readonly signal: AbortSignal | undefined;
  readonly result: Promise<BomResult<BomCommit<TFields>>>;
  readonly settle: (result: BomResult<BomCommit<TFields>>) => void;
  active: boolean;
  buildError: BomError | undefined;
}

interface PreparedView<TFields extends BomFields> {
  readonly projection: VisibleProjection<TFields>;
  readonly patch: BomPatch<TFields>;
}

interface PendingPersistenceRecord<TFields extends BomFields> {
  commit: BomCommit<TFields>;
  commands: readonly BomCommand<TFields>[];
  receipt: BomRemoteCommitReceipt<TFields>;
  state: BomTransactionPersistenceState;
  dispatched: boolean;
  readonly recordHistory: boolean;
}

interface RemoteSequenceState {
  sourceRevision: RevisionToken;
  lastSequence: number | undefined;
  readonly fingerprints: Map<number, string>;
  readonly preAppliedFingerprints: Map<RevisionToken, string>;
  stopped: boolean;
}

interface OwnRemoteTransactionState {
  readonly fingerprint: string;
  status:
    | 'pending'
    | 'acknowledged'
    | 'cancelled'
    | 'rejected'
    | 'conflicted'
    | 'reloadRequired';
  /** The source revision observed from either an ACK or its subscription echo. */
  sourceRevision?: RevisionToken;
}

interface EditorPersistenceSession<TFields extends BomFields> {
  readonly source: BomDataSource<TFields>;
  readonly epoch: number;
  readonly documentId: string;
  readonly documentGeneration: number;
  coordinator: BomRemoteCommitCoordinator<TFields> | undefined;
  readonly pending: Map<string, PendingPersistenceRecord<TFields>>;
  readonly order: string[];
  readonly ownTransactions: Map<string, OwnRemoteTransactionState>;
  readonly historyOwners: {
    readonly transactionId: string;
    readonly kind: 'local' | 'remote';
  }[];
  readonly remote: RemoteSequenceState;
  unsubscribe: (() => void) | undefined;
  reloadController: AbortController | undefined;
  reloading: boolean;
  active: boolean;
  reconciliation:
    | {
        readonly failedTransactionId: string;
        readonly result: BomHistorySuffixReconcileResult<TFields>;
        readonly transactions: readonly BomRemoteCommitSubmission<TFields>[];
      }
    | undefined;
}

interface PersistenceCommitInput<TFields extends BomFields> {
  readonly session: EditorPersistenceSession<TFields> | undefined;
  readonly commands: readonly BomCommand<TFields>[];
  readonly recordHistory?: boolean;
}

interface PersistenceRecoveryDetail<TFields extends BomFields> {
  readonly recoveryId: string;
  readonly retryable: boolean;
  readonly bundle: BomRecoveryBundle<TFields>;
}

interface EditorConstruction<TFields extends BomFields> {
  readonly instanceId: string;
  readonly protocolVersion: string;
  readonly schema: BomSchema;
  readonly columns: readonly Readonly<BomColumnDefinition>[];
  readonly defaultColumnWidths: ReadonlyMap<string, number>;
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly indexes: BomBaseIndexes<TFields>;
  readonly projection: VisibleProjection<TFields>;
  readonly initialView: Readonly<ResolvedEditorInitialView>;
  readonly source?: BomDataSource<TFields>;
  readonly rowHeight?: number;
  readonly history?: Partial<BomHistoryBudget>;
  readonly clipboardPolicy?: BomClipboardPolicy;
  readonly exportPolicy?: BomExportPolicy;
  readonly pastePolicy?: BomPastePolicy;
  readonly pasteLimits: Readonly<BomPasteLimits>;
  readonly editNavigation: Readonly<BomEditNavigation>;
  readonly shortcuts?: Readonly<BomShortcutRegistryOptions>;
  readonly plugins?: readonly BomPlugin<TFields>[];
  readonly pluginGrantPolicy?: BomPluginGrantPolicy;
  readonly pluginHostConfiguration: Readonly<NormalizedPluginHostConfiguration>;
  readonly matchApprovalPolicy?: BomMaterialMatchApprovalPolicy;
  readonly logger?: import('@bom-editor/runtime').BomLogger;
  readonly renderer?: Omit<
    BomCanvasRendererOptions<TFields>,
    'instanceId' | 'shortcuts'
  >;
}

interface NormalizedEditorInitialView {
  readonly columns?: readonly Readonly<BomViewColumnState>[];
  readonly rowHeight?: number;
  readonly rowHeights?: readonly Readonly<BomViewRowHeightState>[];
  readonly expandedIds?: readonly string[];
  readonly expandAll?: boolean;
  readonly query: Readonly<VisibleQueryOptions>;
  readonly selection?: Readonly<BomSelectionState> | null;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

interface ResolvedEditorInitialView
  extends Omit<NormalizedEditorInitialView, 'selection'> {
  readonly selection: Readonly<BomSelectionState>;
}

interface ClipboardSelectionColumn {
  readonly column: Readonly<BomColumnDefinition>;
  readonly field: Readonly<BomFieldSchema>;
}

interface ClipboardSelection {
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly columns: readonly ClipboardSelectionColumn[];
}

interface ClipboardAudit {
  readonly operation: BomClipboardOperation | BomBranchClipboardOperation;
  readonly decisionId: string;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly occurrenceCount: number;
  readonly fieldIds: readonly string[];
  readonly formats: readonly BomClipboardFormat[];
  readonly branch?: Readonly<BomClipboardBranchScope>;
}

interface PendingClipboardCopy extends ClipboardAudit {
  readonly operation: 'copy' | 'copy-branch';
}

interface PendingClipboardCut<TFields extends BomFields>
  extends ClipboardAudit {
  readonly operation: 'cut' | 'cut-branch';
  readonly baseRevision: RevisionToken;
  readonly mountGeneration: number;
  readonly commands: readonly BomCommand<TFields>[];
}

type PendingClipboardWrite<TFields extends BomFields> =
  | PendingClipboardCopy
  | PendingClipboardCut<TFields>;

interface PublishedValidationState {
  readonly taskId: string;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly documentRevision: RevisionToken;
  readonly scope: BomValidationScope;
  readonly checkedNodeCount: number;
  readonly totalNodeCount: number;
  readonly valid: boolean;
  readonly issues: readonly Readonly<BomValidationIssue>[];
}

type CutCommandPreparation<TFields extends BomFields> =
  | {
      readonly ok: true;
      readonly commands: readonly BomCommand<TFields>[];
    }
  | {
      readonly ok: false;
      readonly reasonCode: string;
    };

type ClearCommandPreparation<TFields extends BomFields> =
  | {
      readonly ok: true;
      readonly commands: readonly BomCommand<TFields>[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

type FillDownCommandPreparation<TFields extends BomFields> =
  | {
      readonly ok: true;
      readonly commands: readonly BomCommand<TFields>[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

type FillSelectionCommandPreparation<TFields extends BomFields> =
  | {
      readonly ok: true;
      readonly commands: readonly BomCommand<TFields>[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

interface ClipboardSelectionLimits {
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
}

interface ClipboardOutputLimits {
  readonly maxBytes: number;
  readonly maxCellBytes: number;
}

type ClipboardSelectionResult =
  | {
      readonly ok: true;
      readonly value: Readonly<ClipboardSelection>;
    }
  | {
      readonly ok: false;
      readonly occurrenceCount: number;
      readonly reasonCode?: string;
    };

type ClipboardRepresentationSerialization =
  | {
      readonly ok: true;
      readonly text: string;
      readonly html: string;
      readonly internal: string;
    }
  | {
      readonly ok: false;
      readonly reasonCode: string;
    };

type BranchRepresentationSerialization = ClipboardRepresentationSerialization;

interface BranchSelection {
  readonly scope: Readonly<BomClipboardBranchScope>;
  readonly nodeIds: readonly OccurrenceId[];
}

type BranchSelectionResult =
  | { readonly ok: true; readonly value: Readonly<BranchSelection> }
  | { readonly ok: false; readonly reasonCode: string };

interface PasteTarget {
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly columns: readonly ClipboardSelectionColumn[];
}

interface PastePreparationOptions {
  /** Optional field-aware target used by imports and other structured inputs. */
  readonly target?: Readonly<PasteTarget>;
}

interface ImportRowSource {
  readonly sourceRow: number;
  readonly sourceColumns: readonly number[];
}

interface ImportMappingPlan<TFields extends BomFields = BomFields> {
  readonly rows: readonly (readonly string[])[];
  readonly sources: readonly Readonly<ImportRowSource>[];
  readonly fieldIds: readonly string[];
  readonly target: Readonly<PasteTarget>;
  readonly hierarchyCommands: readonly BomCommand<TFields>[];
}

interface PreparedPasteCell {
  readonly requestCell: Readonly<BomPasteCell>;
  readonly fieldPath: readonly string[];
}

interface PastePreparation {
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly baseRevision: RevisionToken;
  readonly pasteTargetEpoch: number;
  readonly source: BomPasteSource;
  readonly inputBytes: number;
  readonly format: BomPasteFormat;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly cells: readonly PreparedPasteCell[];
  readonly decisionId: string;
}

interface BranchPastePreparation<TFields extends BomFields> {
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly baseRevision: RevisionToken;
  readonly pasteTargetEpoch: number;
  readonly source: BomPasteSource;
  readonly inputBytes: number;
  readonly format: 'internal';
  readonly rowCount: number;
  readonly columnCount: 0;
  readonly commands: readonly BomCommand<TFields>[];
  readonly decisionId: string;
}

interface PrecommitPasteStalenessGuard<TFields extends BomFields> {
  readonly state: Readonly<PublishedState<TFields>>;
  readonly pasteTargetEpoch: number;
}

interface PrecommitClearStalenessGuard<TFields extends BomFields> {
  readonly state: Readonly<PublishedState<TFields>>;
  readonly pasteTargetEpoch: number;
}

interface PrecommitFillDownStalenessGuard<TFields extends BomFields> {
  readonly state: Readonly<PublishedState<TFields>>;
  readonly pasteTargetEpoch: number;
}

interface PrecommitFillSelectionStalenessGuard<TFields extends BomFields> {
  readonly state: Readonly<PublishedState<TFields>>;
  readonly pasteTargetEpoch: number;
}

interface ClipboardParseWorkerContext {
  readonly documentId: string;
  readonly documentGeneration: number;
}

interface PasteRejection {
  readonly inputBytes: number;
  readonly format?: BomPasteFormat;
  readonly error: BomError;
  readonly reasonCode: string;
}

interface PasteCandidateFailure {
  readonly inputBytes: number;
  /** The format shown in pasteOperation for this individual candidate. */
  readonly format?: BomPasteFormat;
  /** The candidate representation that produced the diagnostic. */
  readonly candidateFormat: BomPasteFormat;
  readonly reason: string;
  readonly limit: boolean;
  readonly diagnostics: readonly BomPasteCellDiagnostic[];
}

type PasteCandidateResult =
  | {
      readonly status: 'parsed';
      readonly inputBytes: number;
      readonly format: BomPasteFormat;
      readonly rows: readonly (readonly string[])[];
    }
  | {
      readonly status: 'branch';
      readonly inputBytes: number;
      readonly branch: Readonly<InternalBranchClipboardEnvelope>;
    }
  | {
      readonly status: 'failed';
      readonly inputBytes: number;
      readonly format?: BomPasteFormat;
      readonly reason: string;
      readonly limit: boolean;
      readonly diagnostics?: readonly BomPasteCellDiagnostic[];
    }
  | {
      readonly status: 'aborted';
      readonly inputBytes: number;
    };

type PastePreparationResult =
  | {
      readonly ok: true;
      readonly value: PastePreparation;
    }
  | {
      readonly ok: false;
      readonly error: BomError;
      readonly diagnostics: readonly BomPasteCellDiagnostic[];
      readonly format?: BomPasteFormat;
      readonly rowCount?: number;
      readonly columnCount?: number;
      readonly documentId?: string;
      readonly documentGeneration?: number;
      readonly outcome?: 'denied' | 'failed';
      readonly decisionId?: string;
      readonly reasonCode?: string;
    };

type BranchPastePreparationResult<TFields extends BomFields> =
  | {
      readonly ok: true;
      readonly value: Readonly<BranchPastePreparation<TFields>>;
    }
  | {
      readonly ok: false;
      readonly error: BomError;
      readonly diagnostics: readonly BomPasteCellDiagnostic[];
      readonly rowCount: number;
      readonly documentId?: string;
      readonly documentGeneration?: number;
      readonly outcome?: 'denied' | 'failed';
      readonly decisionId?: string;
      readonly reasonCode?: string;
    };

type ClipboardAuthorization =
  | {
      readonly status: 'allowed';
      readonly decisionId: string;
      readonly allowedFieldIds: ReadonlySet<string>;
      readonly maskingByFieldId: ReadonlyMap<string, BomClipboardMasking>;
    }
  | {
      readonly status: 'denied';
      readonly decisionId: string;
      readonly reasonCode?: string;
    }
  | { readonly status: 'invalid' };

type ExportAuthorization =
  | {
      readonly status: 'allowed';
      readonly decisionId?: string;
      readonly allowedFieldIds: ReadonlySet<string>;
      readonly maskingByFieldId: ReadonlyMap<string, BomClipboardMasking>;
    }
  | {
      readonly status: 'denied';
      readonly reasonCode?: string;
    }
  | { readonly status: 'invalid' };

type ImportSourceReadResult =
  | { readonly ok: true; readonly text: string; readonly bytes: Uint8Array; readonly inputBytes: number }
  | { readonly ok: false; readonly error: BomError }
  | { readonly status: 'aborted' };

type PasteAuthorization =
  | {
      readonly status: 'allowed';
      readonly decisionId: string;
    }
  | {
      readonly status: 'denied';
      readonly decisionId: string;
      readonly reasonCode?: string;
      readonly diagnostics: readonly BomPasteCellDiagnostic[];
    }
  | { readonly status: 'invalid' };

const DEFAULT_PROTOCOL_VERSION = '1.0.0';
const DEFAULT_PLUGIN_HOST_CONFIGURATION: Readonly<{
  readonly engineVersion: string;
  readonly supportedAbiVersions: readonly string[];
  readonly supportedCapabilities: readonly BomPluginCapability[];
  readonly asyncHookTimeoutMs: number;
  readonly syncHookBudgetMs: number;
}> = Object.freeze({
  engineVersion: '1.0.0',
  supportedAbiVersions: Object.freeze(['1.0.0']),
  supportedCapabilities: Object.freeze<BomPluginCapability[]>([
    'commands',
    'validators',
    'fixers',
  ]),
  asyncHookTimeoutMs: 10_000,
  syncHookBudgetMs: 16,
});
const DEFAULT_CLIPBOARD_DECISION: Readonly<BomClipboardDecision> =
  Object.freeze({
    decisionId: 'default-allow',
    allowed: true,
  });
const MAX_PENDING_CLIPBOARD_WRITES = 32;
const PASTE_PREPARATION_YIELD_CELL_INTERVAL = 512;
const PASTE_TARGET_YIELD_ROW_INTERVAL = 256;
const PASTE_PROGRESS_TOTAL = 4;
const MAX_PASTE_CANDIDATE_DIAGNOSTICS = 64;
const MAX_RETAINED_FIX_PROPOSALS = 256;
const MAX_RETAINED_MATERIAL_MATCH_PROPOSALS = 256;
const CLIPBOARD_WORKER_MIN_TEXT_LENGTH = 64 * 1024;
const DEFAULT_PASTE_LIMITS: Readonly<BomPasteLimits> = Object.freeze({
  maxBytes: 1024 * 1024,
  maxRows: 10_000,
  maxColumns: 256,
  maxCells: 10_000,
  maxCellBytes: 64 * 1024,
});
const DEFAULT_CUT_SELECTION_LIMITS: Readonly<ClipboardSelectionLimits> =
  Object.freeze({
    maxRows: 10_000,
    maxColumns: 256,
    maxCells: 10_000,
  });
const DEFAULT_COPY_SELECTION_LIMITS: Readonly<ClipboardSelectionLimits> =
  DEFAULT_CUT_SELECTION_LIMITS;
const DEFAULT_DELETE_SELECTION_LIMITS: Readonly<ClipboardSelectionLimits> =
  DEFAULT_CUT_SELECTION_LIMITS;
const DEFAULT_FILL_DOWN_SELECTION_LIMITS: Readonly<ClipboardSelectionLimits> =
  DEFAULT_CUT_SELECTION_LIMITS;
const DEFAULT_FILL_SELECTION_LIMITS: Readonly<ClipboardSelectionLimits> =
  DEFAULT_CUT_SELECTION_LIMITS;
const DEFAULT_CUT_OUTPUT_LIMITS: Readonly<ClipboardOutputLimits> = Object.freeze({
  maxBytes: 1024 * 1024,
  maxCellBytes: 64 * 1024,
});
const DEFAULT_COPY_OUTPUT_LIMITS: Readonly<ClipboardOutputLimits> =
  DEFAULT_CUT_OUTPUT_LIMITS;
const DEFAULT_BRANCH_NODE_LIMIT = 10_000;
const DEFAULT_BRANCH_SCOPE: Readonly<Pick<BomClipboardBranchScope, 'includeDescendants'>> =
  Object.freeze({ includeDescendants: true });
const DEFAULT_PASTE_DECISION: Readonly<BomPasteDecision> = Object.freeze({
  decisionId: 'default-allow',
  allowed: true,
});
const DEFAULT_MATERIAL_MATCH_DECISION: Readonly<{
  readonly decisionId: string;
  readonly allowed: true;
}> = Object.freeze({
  decisionId: 'default-allow',
  allowed: true,
});
const DEFAULT_EDIT_NAVIGATION: Readonly<BomEditNavigation> = Object.freeze({
  enter: 'down',
  tab: 'next-editable',
});
let editorSequence = 0;

export function createBomEditor<
  TFields extends BomFields = BomFields,
>(
  options: BomEditorOptions<TFields>,
): BomEditor<TFields> {
  try {
    if (
      options.initialDocument !== undefined &&
      options.dataSource !== undefined
    ) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'initialDocument/dataSource',
        }),
      );
    }
    const schema = normalizeBomSchema(options.schema);
    if (!schema.ok) {
      throw new BomEditorConfigurationError(schema.errors[0]!);
    }
    const columns = normalizeEditorColumns(options.columns, schema.value);
    if (!columns.ok) {
      throw new BomEditorConfigurationError(columns.error);
    }
    const instanceId = ownInstanceId(options.instanceId);
    const protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    if (typeof protocolVersion !== 'string' || protocolVersion.length === 0) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'protocolVersion',
        }),
      );
    }
    const clipboardPolicy = normalizeClipboardPolicy(options.clipboardPolicy);
    if (clipboardPolicy === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'clipboardPolicy',
        }),
      );
    }
    const exportPolicy = normalizeExportPolicy(options.exportPolicy);
    if (exportPolicy === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'exportPolicy',
        }),
      );
    }
    const pastePolicy = normalizePastePolicy(options.pastePolicy);
    if (pastePolicy === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'pastePolicy',
        }),
      );
    }
    const pasteLimits = normalizePasteLimits(options.pasteLimits);
    if (pasteLimits === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'pasteLimits',
        }),
      );
    }
    const editNavigation = normalizeEditNavigation(options.editNavigation);
    if (editNavigation === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'editNavigation',
        }),
      );
    }
    const shortcuts = validateBomShortcutOptions(options.shortcuts);
    if (!shortcuts.ok) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'shortcuts',
          diagnostic: shortcuts.diagnostics[0]?.code ?? 'invalid-options',
        }),
      );
    }
    const plugins = normalizePlugins(options.plugins);
    if (plugins === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN'),
      );
    }
    const pluginHostConfiguration = normalizePluginHostConfiguration(
      options.pluginHostConfiguration,
    );
    if (pluginHostConfiguration === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN', {
          reason: 'host-configuration',
        }),
      );
    }
    const pluginGrantPolicy = normalizePluginGrantPolicy(
      options.pluginGrantPolicy,
    );
    if (pluginGrantPolicy === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN'),
      );
    }
    const matchApprovalPolicy = normalizeMaterialMatchApprovalPolicy(
      options.matchApprovalPolicy,
    );
    if (matchApprovalPolicy === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'matchApprovalPolicy',
        }),
      );
    }
    let source: BomDataSource<TFields> | undefined;
    if (options.dataSource !== undefined) {
      const validSource = validateBomDataSource(
        options.dataSource as BomDataSource,
      );
      if (!validSource.ok) {
        throw new BomEditorConfigurationError(validSource.error);
      }
      source = options.dataSource;
    }
    const initialView = normalizeEditorInitialView(
      options.initialView,
      options,
      schema.value,
    );
    if (initialView === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'initialView',
        }),
      );
    }
    const initialColumns = resolveInitialViewColumns(
      columns.value,
      initialView.columns,
      schema.value,
    );
    if (initialColumns === null) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'initialView.columns',
        }),
      );
    }
    const initialInput =
      options.initialDocument ??
      createEmptySnapshot<TFields>(schema.value, instanceId);
    const initial = normalizeBomDocumentSnapshot<TFields>(
      initialInput,
      schema.value,
    );
    if (!initial.ok) {
      throw new BomEditorConfigurationError(initial.errors[0]!);
    }
    const indexes = buildBomIndexes(initial.value);
    if (!indexes.ok) {
      throw new BomEditorConfigurationError(indexes.errors[0]!);
    }
    if (initialView.rowHeights !== undefined && initialView.rowHeights.some(
      (entry) => !indexes.value.rowById.has(entry.occurrenceId),
    )) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'initialView.rowHeights',
        }),
      );
    }
    const projection = createVisibleProjection(initial.value, {
      indexes: indexes.value,
      ...(initialView.rowHeight === undefined
        ? {}
        : { rowHeight: initialView.rowHeight }),
      ...(initialView.rowHeights === undefined
        ? {}
        : { rowHeightOverrides: new Map(initialView.rowHeights.map((entry) => [entry.occurrenceId, entry.rowHeight])) }),
      ...(initialView.expandAll === undefined
        ? {}
        : { expandAll: initialView.expandAll }),
      ...(initialView.expandedIds === undefined
        ? {}
        : { expandedIds: initialView.expandedIds }),
      viewChildrenByParent: buildViewChildrenByParent(
        initial.value,
        indexes.value,
        initialView.query,
      ),
    });
    if (!projection.ok) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'projection',
          projectionError: projection.errors[0]?.code ?? 'unknown',
        }),
      );
    }
    const normalizedInitialView: Readonly<ResolvedEditorInitialView> =
      Object.freeze({
        ...initialView,
        selection: normalizeInitialSelection(
          initialView.selection,
          projection.value,
          indexes.value,
          initialColumns,
        ),
      });
    return new BomEditorImpl({
      instanceId,
      protocolVersion,
      schema: schema.value,
      columns: initialColumns,
      defaultColumnWidths: new Map(columns.value.map((column) => [column.columnId, column.width])),
      snapshot: initial.value,
      indexes: indexes.value,
      projection: projection.value,
      initialView: normalizedInitialView,
      ...(source === undefined ? {} : { source }),
      ...(initialView.rowHeight === undefined
        ? {}
        : { rowHeight: initialView.rowHeight }),
      ...(options.history === undefined ? {} : { history: options.history }),
      ...(clipboardPolicy === undefined ? {} : { clipboardPolicy }),
      ...(exportPolicy === undefined ? {} : { exportPolicy }),
      ...(pastePolicy === undefined ? {} : { pastePolicy }),
      pasteLimits,
      editNavigation,
      ...(options.shortcuts === undefined
        ? {}
        : { shortcuts: shortcuts.state }),
      ...(plugins === undefined ? {} : { plugins }),
      pluginHostConfiguration,
      ...(pluginGrantPolicy === undefined ? {} : { pluginGrantPolicy }),
      ...(matchApprovalPolicy === undefined ? {} : { matchApprovalPolicy }),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      ...(options.renderer === undefined
        ? {}
        : { renderer: options.renderer }),
    });
  } catch (failure) {
    if (failure instanceof BomEditorConfigurationError) {
      throw failure;
    }
    throw new BomEditorConfigurationError(
      editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'),
    );
  }
}

class BomEditorImpl<TFields extends BomFields>
  implements BomEditor<TFields> {
  public readonly instanceId: string;
  public readonly ready: Promise<BomResult<void>>;

  readonly #protocolVersion: string;
  readonly #schema: BomSchema;
  #columns: readonly Readonly<BomColumnDefinition>[];
  readonly #initialColumnWidths: ReadonlyMap<string, number>;
  #viewQuery: Readonly<VisibleQueryOptions> = Object.freeze({});
  #source: BomDataSource<TFields> | undefined;
  readonly #rowHeight: number | undefined;
  readonly #history: Partial<BomHistoryBudget> | undefined;
  readonly #historyUndo: HistoryInteractionEntry[] = [];
  readonly #historyRedo: HistoryInteractionEntry[] = [];
  readonly #clipboardPolicy: BomClipboardPolicy | undefined;
  readonly #exportPolicy: BomExportPolicy | undefined;
  readonly #pastePolicy: BomPastePolicy | undefined;
  readonly #pasteLimits: Readonly<BomPasteLimits>;
  readonly #editNavigation: Readonly<BomEditNavigation>;
  readonly #pluginGrantPolicy: BomPluginGrantPolicy | undefined;
  readonly #pluginHostConfiguration: Readonly<NormalizedPluginHostConfiguration>;
  readonly #matchApprovalPolicy: BomMaterialMatchApprovalPolicy | undefined;
  readonly #logger: import('@bom-editor/runtime').BomLogger | undefined;
  readonly #metricSamples = new Map<string, { readonly unit: string; samples: number[] }>();
  readonly #initialPlugins: readonly BomPlugin<TFields>[];
  readonly #plugins = new Map<string, InstalledPlugin<TFields>>();
  readonly #pluginValidators = new Map<string, RegisteredPluginValidator<TFields>>();
  readonly #pluginFixers = new Map<string, BomPluginFixer<TFields>>();
  readonly #pluginCommands = new Map<string, BomPluginCommand<TFields>>();
  readonly #pluginLifecycleAbortController = new AbortController();
  readonly #fixProposals = new Map<string, IssuedFixProposal<TFields>>();
  readonly #expiredFixProposalIds = new Set<string>();
  readonly #materialMatchCandidates = new WeakMap<
    object,
    MaterialMatchCandidateContext<TFields>
  >();
  readonly #materialMatchProposals = new Map<
    string,
    IssuedMaterialMatchProposal<TFields>
  >();
  readonly #expiredMaterialMatchProposalIds = new Set<string>();
  #fixProposalSequence = 0;
  #materialMatchProposalSequence = 0;
  #pluginGeneration = 0;
  #pluginsInitialized = false;
  #shortcuts: Readonly<BomShortcutRegistryOptions> | undefined;
  #rendererOptions:
    | Omit<BomCanvasRendererOptions<TFields>, 'instanceId' | 'shortcuts'>
    | undefined;
  #presentationLabelOverrides: Readonly<BomCanvasRendererLabelOverrides> =
    Object.freeze({});
  #presentation: Readonly<BomCanvasPresentationState>;
  readonly #events: EventHub<TFields>;
  readonly #validationState = new Map<
    BomValidationScope,
    Readonly<PublishedValidationState>
  >();
  readonly #callbacks: Readonly<BomCanvasRendererCallbacks>;
  #editMachine: BomEditStateMachine = createBomEditStateMachine();
  #diffView: Readonly<BomCanvasDiffView> | null = null;
  #engine: BomTransactionEngineApi<TFields>;
  #published: Readonly<PublishedState<TFields>>;
  #selection: Readonly<BomSelectionState>;
  #pasteTargetEpoch = 0;
  #renderer: BomCanvasRenderer<TFields> | null = null;
  #clipboardWorker: ClipboardParseWorkerClient | undefined;
  #clipboardWorkerConstructor: unknown;
  #lastRendererResources: Readonly<BomResourceRegistryDiagnostics> | null = null;
  #lastRendererWorkerTasks:
    | Readonly<BomCanvasWorkerTaskDiagnostics>
    | null = null;
  #completedRendererCleanupFailureCount = 0;
  readonly #capturedRenderers = new WeakSet<object>();
  #capabilities: Readonly<BomCapabilities>;
  #lifecycle: BomLifecycleState = 'created';
  #tail: Promise<void> = Promise.resolve();
  #queuedTasks = 0;
  #activeTasks = 0;
  #transactionSequence = 0;
  #taskSequence = 0;
  #branchPasteSequence = 0;
  #structureSequence = 0;
  #structureMoveRequestSequence = 0;
  #columnSequence = 0;
  #columnHistorySequence = 0;
  #columnHistoryInvalidatesDocumentRedo = false;
  #columnResizeHistorySession: ColumnResizeHistorySession | null = null;
  #prepared: PreparedView<TFields> | undefined;
  #preparedError: BomError | undefined;
  #transactionBuildContext: TransactionBuildContext<TFields> | undefined;
  #sourceLoaded: boolean;
  #sourceController: AbortController | undefined;
  readonly #dataSourceReadControllers = new Set<AbortController>();
  readonly #pasteParsingAbortController = new AbortController();
  readonly #precommitAbortSignals = new Map<string, AbortSignal>();
  readonly #precommitPasteStalenessGuards = new Map<
    string,
    Readonly<PrecommitPasteStalenessGuard<TFields>>
  >();
  readonly #precommitClearStalenessGuards = new Map<
    string,
    Readonly<PrecommitClearStalenessGuard<TFields>>
  >();
  readonly #precommitFillDownStalenessGuards = new Map<
    string,
    Readonly<PrecommitFillDownStalenessGuard<TFields>>
  >();
  readonly #precommitFillSelectionStalenessGuards = new Map<
    string,
    Readonly<PrecommitFillSelectionStalenessGuard<TFields>>
  >();
  #sourceEpoch = 0;
  #persistenceSession: EditorPersistenceSession<TFields> | undefined;
  #idempotencySequence = 0;
  #sourceReplacementPending = false;
  #persistenceMutationBarrier = false;
  #discardingUnpublished = false;
  #mountGeneration = 0;
  #readySettled = false;
  #resolveReady: ((result: BomResult<void>) => void) | undefined;
  #clipboardSequence = 0;
  readonly #pendingClipboardWrites = new Map<
    string,
    PendingClipboardWrite<TFields>
  >();
  #lastView: Readonly<BomViewState> = Object.freeze({
    scrollLeft: 0,
    scrollTop: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    visibleRowCount: 0,
    columns: Object.freeze([]),
    rowHeights: Object.freeze([]),
  });

  public constructor(construction: EditorConstruction<TFields>) {
    this.instanceId = construction.instanceId;
    this.#protocolVersion = construction.protocolVersion;
    this.#schema = construction.schema;
    this.#columns = construction.columns;
    this.#initialColumnWidths = construction.defaultColumnWidths;
    this.#viewQuery = construction.initialView.query;
    this.#lastView = Object.freeze({
      ...this.#lastView,
      scrollLeft: construction.initialView.scrollLeft,
      scrollTop: construction.initialView.scrollTop,
      visibleRowCount: construction.projection.visibleCount,
      columns: freezeViewColumns(this.#columns),
      rowHeights: freezeViewRowHeights(construction.projection),
      ...(construction.initialView.query.filters === undefined
        ? {}
        : { filters: construction.initialView.query.filters }),
      ...(construction.initialView.query.sort === undefined
        ? {}
        : { sort: construction.initialView.query.sort }),
    });
    this.#source = construction.source;
    this.#rowHeight = construction.rowHeight;
    this.#history = construction.history;
    this.#clipboardPolicy = construction.clipboardPolicy;
    this.#exportPolicy = construction.exportPolicy;
    this.#pastePolicy = construction.pastePolicy;
    this.#pasteLimits = construction.pasteLimits;
    this.#editNavigation = construction.editNavigation;
    this.#pluginGrantPolicy = construction.pluginGrantPolicy;
    this.#pluginHostConfiguration = construction.pluginHostConfiguration;
    this.#matchApprovalPolicy = construction.matchApprovalPolicy;
    this.#logger = construction.logger;
    this.#initialPlugins = construction.plugins ?? Object.freeze([]);
    this.#pluginsInitialized = this.#initialPlugins.length === 0;
    this.#shortcuts = construction.shortcuts;
    this.#rendererOptions =
      construction.renderer === undefined
        ? undefined
        : Object.freeze({ ...construction.renderer });
    this.#presentationLabelOverrides = this.#rendererOptions?.labels ??
      Object.freeze({});
    this.#presentation = resolveEditorPresentation(this.#rendererOptions);
    this.#events = new EventHub<TFields>({ instanceId: this.instanceId });
    this.#capabilities = detectBomCapabilities(null);
    this.#published = Object.freeze({
      snapshot: construction.snapshot,
      indexes: construction.indexes,
      projection: construction.projection,
      documentGeneration: 0,
      sourceType: construction.source === undefined ? 'memory' : 'dataSource',
    });
    this.#selection = construction.initialView.selection;
    this.#engine = this.#requireEngine(construction.snapshot, 0);
    this.#sourceLoaded = construction.source === undefined;
    this.#callbacks = this.#createRendererCallbacks();
    this.ready = new Promise<BomResult<void>>((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  public get capabilities(): Readonly<BomCapabilities> {
    return this.#capabilities;
  }

  #replaceSelection(selection: Readonly<BomSelectionState>): void {
    if (!sameSelection(this.#selection, selection)) {
      this.#pasteTargetEpoch += 1;
    }
    this.#selection = selection;
  }

  public mount(container: HTMLElement): Promise<BomResult<void>> {
    if (!isMountContainer(container)) {
      const failure = editorFailure<void>(
        editorError(BOM_EDITOR_ERROR_CODES.containerInvalid, 'CONFIG'),
      );
      this.#settleReady(failure);
      return Promise.resolve(failure);
    }
    const mountGeneration = this.#mountGeneration;
    return this.#enqueue(async () => {
      if (mountGeneration !== this.#mountGeneration) {
        return this.#abortedFailure();
      }
      if (this.#renderer !== null) {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.alreadyMounted, 'CONFIG'),
        );
      }
      if (!this.#sourceLoaded && this.#source !== undefined) {
        const loaded = await this.#loadInitialSource();
        if (mountGeneration !== this.#mountGeneration) {
          return this.#isDestroyedOrDestroying()
            ? this.#destroyedFailure()
            : this.#abortedFailure();
        }
        if (!loaded.ok) {
          this.#settleReady(loaded);
          return loaded;
        }
      }
      if (!this.#pluginsInitialized) {
        const initialized = await this.#initializePlugins();
        if (!initialized.ok) {
          this.#settleReady(initialized);
          return initialized;
        }
      }
      this.#lifecycle = 'mounted';
      const previousCapabilities = this.#capabilities;
      this.#capabilities = detectBomCapabilities(
        container.ownerDocument.defaultView as unknown as BomWindowLike,
      );
      this.#clipboardWorkerConstructor = (
        container.ownerDocument.defaultView as unknown as {
          readonly Worker?: unknown;
        } | null
      )?.Worker;
      if (!sameCapabilities(previousCapabilities, this.#capabilities)) {
        this.#events.dispatch('capabilitiesChanged', {
          previous: previousCapabilities,
          capabilities: this.#capabilities,
          reason: 'mount',
        });
      }
      try {
        const requestedScroll = Object.freeze({
          scrollLeft: this.#lastView.scrollLeft,
          scrollTop: this.#lastView.scrollTop,
        });
        const renderer = mountBomCanvasRenderer(
          container,
          this.#viewModel(),
          this.#callbacks,
          {
            ...(this.#rendererOptions ?? {}),
            instanceId: this.instanceId,
            ...(this.#shortcuts === undefined
              ? {}
              : { shortcuts: this.#shortcuts }),
          },
        );
        this.#renderer = renderer;
        const rendered = await renderer.ready;
        const mountInvalidated =
          this.#renderer !== renderer ||
          mountGeneration !== this.#mountGeneration;
        if (
          !rendered ||
          mountInvalidated
        ) {
          this.#disposeRenderer(renderer);
          if (this.#isDestroyedOrDestroying()) {
            return this.#destroyedFailure();
          }
          this.#lifecycle = 'created';
          if (!rendered && !mountInvalidated) {
            const failure = editorFailure<void>(
              editorError(BOM_EDITOR_ERROR_CODES.rendererFailed, 'RENDER'),
            );
            this.#settleReady(failure);
            return failure;
          }
          return this.#abortedFailure();
        }
        renderer.scrollToView(requestedScroll);
      } catch {
        this.#renderer = null;
        this.#lifecycle = 'created';
        const failure = editorFailure<void>(
          editorError(BOM_EDITOR_ERROR_CODES.rendererFailed, 'RENDER'),
        );
        this.#settleReady(failure);
        return failure;
      }
      this.#lifecycle = 'ready';
    const success = editorSuccess(undefined);
      this.#recordMetric('interactive-ready', 1, 'count');
      this.#events.dispatch('ready', {
        capabilities: this.#capabilities,
        diagnostics: this.getDiagnostics(),
      });
      this.#settleReady(success);
      return success;
    });
  }

  public unmount(): BomResult<void> {
    if (this.#lifecycle === 'destroyed' || this.#lifecycle === 'destroying') {
      return this.#destroyedFailure();
    }
    this.#mountGeneration += 1;
    this.#disposeClipboardWorker();
    if (this.#renderer === null) {
      return editorSuccess(undefined);
    }
    this.#pendingClipboardWrites.clear();
    if (this.#editMachine.state.draft !== null) {
      this.#endActiveEdit('cancelled');
    }
    this.#disposeRenderer(this.#renderer);
    this.#lifecycle = 'created';
    return editorSuccess(undefined);
  }

  public setDocument(
    snapshot: BomDocumentSnapshot<TFields>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomResult<void>> {
    if (this.#source !== undefined) {
      return Promise.resolve(
        editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.sourceBound, 'CONFIG'),
        ),
      );
    }
    const normalized = normalizeBomDocumentSnapshot<TFields>(
      snapshot,
      this.#schema,
    );
    if (!normalized.ok) {
      return Promise.resolve(editorFailure(normalized.errors[0]!));
    }
    return this.#enqueue(
      () => this.#replaceDocument(normalized.value, 'setDocument', 'memory'),
      options.signal,
    );
  }

  public async replaceSource(
    input: BomDocumentSnapshot<TFields> | BomDataSource<TFields>,
    options: BomEditorReplaceSourceOptions = {},
  ): Promise<BomResult<void>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    if (this.#sourceReplacementPending) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT'),
      );
    }
    if (
      options.pending !== undefined && options.pending !== 'wait' &&
      options.pending !== 'abortAndRollback'
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'pending',
        }),
      );
    }
    this.#sourceReplacementPending = true;
    this.#abortDataSourceReads();
    const previousSession = this.#persistenceSession;
    const previousGeneration = this.#published.documentGeneration;
    try {
      if (options.signal?.aborted) return this.#abortedFailure();
      if (
        previousSession?.coordinator !== undefined &&
        previousSession.coordinator.pendingCount > 0 &&
        previousSession.coordinator.mode !== 'reloadRequired'
      ) {
        if (options.pending === 'abortAndRollback') {
          const rolledBack = await this.#abortAndRollbackPendingPersistence(
            previousSession,
            options.signal,
          );
          if (!rolledBack.ok) return rolledBack;
        } else {
          const idleWait = await waitForAbortSignal(
            previousSession.coordinator.whenIdle(),
            options.signal,
          );
          if (idleWait.aborted) return this.#abortedFailure();
          const idle = idleWait.value;
          if (idle.status !== 'idle') {
            return editorFailure(
              'error' in idle
                ? idle.error
                : editorError(
                    BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT',
                  ),
            );
          }
        }
      }
      if (options.signal?.aborted) return this.#abortedFailure();
      let nextSource: BomDataSource<TFields> | undefined;
      let loaded: BomDocumentSnapshot<TFields>;
      if (isDataSourceCandidate<TFields>(input)) {
        const valid = validateBomDataSource(input as BomDataSource);
        if (!valid.ok) return editorFailure(valid.error);
        nextSource = input;
        const controller = new AbortController();
        this.#sourceController = controller;
        const abort = (): void => controller.abort();
        options.signal?.addEventListener('abort', abort, { once: true });
        try {
          const loadWait = await waitForAbortSignal(
            nextSource.loadDocument({ signal: controller.signal }),
            controller.signal,
          );
          if (loadWait.aborted) {
            return this.#isDestroyedOrDestroying()
              ? this.#destroyedFailure()
              : this.#abortedFailure();
          }
          loaded = loadWait.value;
        } catch (failure) {
          return editorFailure(
            this.#isDestroyedOrDestroying()
              ? editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG')
              : failure instanceof BomDataSourceException
              ? failure.error
              : options.signal?.aborted
                ? editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED')
                : editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'),
          );
        } finally {
          options.signal?.removeEventListener('abort', abort);
          if (this.#sourceController === controller) {
            this.#sourceController = undefined;
          }
        }
      } else {
        loaded = input;
      }
      const normalized = normalizeBomDocumentSnapshot<TFields>(
        loaded, this.#schema,
      );
      if (!normalized.ok) return editorFailure(normalized.errors[0]!);
      if (
        options.signal?.aborted || this.#isDestroyedOrDestroying() ||
        previousSession !== this.#persistenceSession ||
        previousGeneration !== this.#published.documentGeneration
      ) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      return await this.#enqueue(async () => {
        if (
          options.signal?.aborted ||
          previousSession !== this.#persistenceSession ||
          previousGeneration !== this.#published.documentGeneration
        ) return this.#abortedFailure();
        const replaced = await this.#replaceDocument(
          normalized.value,
          'replaceSource',
          nextSource === undefined ? 'memory' : 'dataSource',
          options.preserveView ?? false,
        );
        if (!replaced.ok) return replaced;
        this.#deactivatePersistenceSession('replaced');
        this.#sourceEpoch += 1;
        this.#source = nextSource;
        this.#sourceLoaded = true;
        if (nextSource !== undefined) {
          return this.#activatePersistenceSession(nextSource);
        }
        return editorSuccess(undefined);
      }, options.signal);
    } finally {
      this.#sourceReplacementPending = false;
    }
  }

  public async queryDataSource(
    options: Readonly<BomEditorDataSourceQueryOptions>,
  ): Promise<BomResult<Readonly<BomEditorDataSourceQueryResult>>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    const query = this.#normalizeDataSourceQuery(options);
    if (query === null) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.dataSourceQueryInvalid, 'VALIDATION'),
      );
    }
    const session = this.#persistenceSession;
    const source = this.#source;
    if (
      source === undefined || session === undefined || !this.#sourceLoaded ||
      !this.#isSessionCurrent(session) || !source.capabilities.remoteQuery ||
      typeof source.query !== 'function'
    ) {
      return editorFailure(
        editorError(
          BOM_EDITOR_ERROR_CODES.dataSourceQueryUnavailable,
          'CONFIG',
        ),
      );
    }
    const expectedSourceRevision =
      query.expectedSourceRevision ?? session.remote.sourceRevision;
    if (expectedSourceRevision !== session.remote.sourceRevision) {
      return this.#dataSourceQueryStaleFailure();
    }
    const request = this.#beginDataSourceRead(options.signal);
    if (request.controller.signal.aborted) {
      request.release();
      return this.#abortedFailure();
    }
    try {
      const waited = await waitForAbortSignal(
        source.query({
          ...query,
          expectedSourceRevision,
          signal: request.controller.signal,
        }),
        request.controller.signal,
      );
      if (waited.aborted) return this.#abortedFailure();
      if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
      if (
        !this.#isSessionCurrent(session) ||
        session.remote.sourceRevision !== expectedSourceRevision
      ) {
        return this.#dataSourceQueryStaleFailure();
      }
      const result = normalizeDataSourceQueryResult(waited.value);
      if (result === null) {
        const error = editorError(
          BOM_EDITOR_ERROR_CODES.remoteProtocolViolation,
          'DATA',
          { reason: 'query-result-invalid' },
        );
        this.#requestPersistenceReload(session, error, 'resync');
        return editorFailure(error);
      }
      if (result.sourceRevision !== expectedSourceRevision) {
        const error = editorError(
          BOM_EDITOR_ERROR_CODES.dataSourceQueryStale,
          'CONFLICT',
          { expectedSourceRevision, actualSourceRevision: result.sourceRevision },
        );
        this.#requestPersistenceReload(session, error, 'resync');
        return editorFailure(error);
      }
      return editorSuccess(Object.freeze({
        ...result,
        documentId: session.documentId,
        documentGeneration: session.documentGeneration,
      }));
    } catch (failure) {
      if (request.controller.signal.aborted) return this.#abortedFailure();
      return editorFailure(
        failure instanceof BomDataSourceException
          ? failure.error
          : editorError(BOM_EDITOR_ERROR_CODES.remoteProtocolViolation, 'IO', {
              reason: 'query-failed',
            }),
      );
    } finally {
      request.release();
    }
  }

  public async loadDataSourceChildren(
    parentId: OccurrenceId,
    options: Readonly<BomEditorLoadDataSourceChildrenOptions> = {},
  ): Promise<BomResult<BomEditorDataSourceChildrenLoadResult<TFields>>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    if (
      typeof parentId !== 'string' || parentId.length === 0 ||
      !isOptionalDataSourceCursor(options.cursor)
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.dataSourcePageInvalid, 'VALIDATION'),
      );
    }
    const session = this.#persistenceSession;
    const source = this.#source;
    const state = this.#published;
    if (
      source === undefined || session === undefined || !this.#sourceLoaded ||
      !this.#isSessionCurrent(session) || !source.capabilities.lazyChildren ||
      typeof source.loadChildren !== 'function'
    ) {
      return editorFailure(
        editorError(
          BOM_EDITOR_ERROR_CODES.dataSourceQueryUnavailable,
          'CONFIG',
          { operation: 'loadChildren' },
        ),
      );
    }
    const parent = state.indexes.rowById.get(parentId);
    if (
      parent === undefined || state.snapshot.completeness !== 'partial' ||
      parent.childrenState === 'complete'
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.dataSourcePageInvalid, 'VALIDATION'),
      );
    }
    if (
      session.pending.size > 0 ||
      (session.coordinator?.pendingCount ?? 0) > 0
    ) {
      return this.#dataSourceQueryStaleFailure();
    }
    const expectedSourceRevision = session.remote.sourceRevision;
    const documentRevision = state.snapshot.revision;
    const request = this.#beginDataSourceRead(options.signal);
    if (request.controller.signal.aborted) {
      request.release();
      return this.#abortedFailure();
    }
    try {
      const waited = await waitForAbortSignal(
        source.loadChildren({
          parentId,
          ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
          expectedSourceRevision,
          signal: request.controller.signal,
        }),
        request.controller.signal,
      );
      if (waited.aborted) return this.#abortedFailure();
      if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
      if (
        !this.#isSessionCurrent(session) ||
        session.remote.sourceRevision !== expectedSourceRevision ||
        this.#published.snapshot.revision !== documentRevision ||
        this.#published.documentGeneration !== state.documentGeneration ||
        this.#sourceReplacementPending || session.pending.size > 0 ||
        (session.coordinator?.pendingCount ?? 0) > 0
      ) {
        return this.#dataSourceQueryStaleFailure();
      }
      const page = normalizeDataSourcePage<TFields>(waited.value);
      if (page === null) {
        const error = editorError(
          BOM_EDITOR_ERROR_CODES.remoteProtocolViolation,
          'DATA',
          { reason: 'children-page-invalid' },
        );
        this.#requestPersistenceReload(session, error, 'resync');
        return editorFailure(error);
      }
      if (page.sourceRevision !== expectedSourceRevision) {
        const error = editorError(
          BOM_EDITOR_ERROR_CODES.dataSourceQueryStale,
          'CONFLICT',
          { expectedSourceRevision, actualSourceRevision: page.sourceRevision },
        );
        this.#requestPersistenceReload(session, error, 'resync');
        return editorFailure(error);
      }
      return this.#enqueue(async () => {
        if (
          !this.#isSessionCurrent(session) ||
          session.remote.sourceRevision !== expectedSourceRevision ||
          this.#published.snapshot.revision !== documentRevision ||
          this.#published.documentGeneration !== state.documentGeneration ||
          this.#sourceReplacementPending || session.pending.size > 0 ||
          (session.coordinator?.pendingCount ?? 0) > 0
        ) {
          return this.#dataSourceQueryStaleFailure();
        }
        const merged = mergeDataSourceChildrenPage(
          this.#published.snapshot,
          this.#published.indexes,
          parentId,
          page,
        );
        if (merged === null) {
          const error = editorError(
            BOM_EDITOR_ERROR_CODES.dataSourcePageInvalid,
            'DATA',
          );
          this.#requestPersistenceReload(session, error, 'resync');
          return editorFailure(error);
        }
        const normalized = normalizeBomDocumentSnapshot<TFields>(
          merged,
          this.#schema,
        );
        if (!normalized.ok) {
          const error = editorError(
            BOM_EDITOR_ERROR_CODES.dataSourcePageInvalid,
            'DATA',
          );
          this.#requestPersistenceReload(session, error, 'resync');
          return editorFailure(error);
        }
        const replaced = await this.#replaceDocument(
          normalized.value,
          'loadChildren',
          'dataSource',
          true,
          true,
        );
        if (!replaced.ok) return replaced;
        this.#deactivatePersistenceSession('reload');
        this.#sourceEpoch += 1;
        this.#sourceLoaded = true;
        const activated = this.#activatePersistenceSession(source);
        if (!activated.ok) return activated;
        return editorSuccess(Object.freeze({
          parentId,
          page,
          documentGeneration: this.#published.documentGeneration,
        }));
      }, options.signal);
    } catch (failure) {
      if (request.controller.signal.aborted) return this.#abortedFailure();
      return editorFailure(
        failure instanceof BomDataSourceException
          ? failure.error
          : editorError(BOM_EDITOR_ERROR_CODES.remoteProtocolViolation, 'IO', {
              reason: 'load-children-failed',
            }),
      );
    } finally {
      request.release();
    }
  }

  #normalizeDataSourceQuery(
    options: Readonly<BomEditorDataSourceQueryOptions>,
  ): BomQueryRequest | null {
    if (options === null || typeof options !== 'object') return null;
    const source = options as Readonly<Record<string, unknown>>;
    if (!isKnownRecordKeys(
      source,
      new Set([
        'expression',
        'sort',
        'cursor',
        'limit',
        'expectedSourceRevision',
        'signal',
      ]),
    )) return null;
    const limit = source['limit'];
    if (
      typeof limit !== 'number' || !Number.isSafeInteger(limit) ||
      limit < 1 || limit > 10_000
    ) {
      return null;
    }
    const cursor = source['cursor'];
    if (!isOptionalDataSourceCursor(cursor)) return null;
    const expectedSourceRevision = source['expectedSourceRevision'];
    if (
      expectedSourceRevision !== undefined &&
      (typeof expectedSourceRevision !== 'string' ||
        expectedSourceRevision.length === 0 ||
        expectedSourceRevision.length > 1_024)
    ) return null;
    const fieldIds = new Set(this.#schema.fields.map((field) => field.fieldId));
    const expression = normalizeDataSourceQueryExpression(
      source['expression'],
      fieldIds,
    );
    if (expression === INVALID_QUERY_EXPRESSION) return null;
    const sort = normalizeDataSourceQuerySort(source['sort'], fieldIds);
    if (sort === null) return null;
    return Object.freeze({
      ...(expression === undefined ? {} : { expression }),
      ...(sort === undefined ? {} : { sort }),
      ...(cursor === undefined ? {} : { cursor }),
      limit,
      ...(expectedSourceRevision === undefined
        ? {}
        : { expectedSourceRevision }),
    });
  }

  #beginDataSourceRead(signal: AbortSignal | undefined): {
    readonly controller: AbortController;
    readonly release: () => void;
  } {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    if (signal?.aborted) {
      controller.abort();
    } else if (signal !== undefined) {
      signal.addEventListener('abort', abort, { once: true });
    }
    this.#dataSourceReadControllers.add(controller);
    let released = false;
    return Object.freeze({
      controller,
      release: (): void => {
        if (released) return;
        released = true;
        this.#dataSourceReadControllers.delete(controller);
        if (signal !== undefined) {
          signal.removeEventListener('abort', abort);
        }
      },
    });
  }

  #abortDataSourceReads(): void {
    for (const controller of this.#dataSourceReadControllers) {
      controller.abort();
    }
    this.#dataSourceReadControllers.clear();
  }

  #dataSourceQueryStaleFailure<T>(): BomResult<T> {
    return editorFailure(
      editorError(BOM_EDITOR_ERROR_CODES.dataSourceQueryStale, 'CONFLICT'),
    );
  }

  public execute(
    command: BomCommand<TFields>,
    options: {
      readonly signal?: AbortSignal;
      readonly origin?: string;
      readonly idempotencyKey?: string;
    } = {},
  ): Promise<BomResult<BomCommit<TFields>>> {
    const captured = normalizeBomValue(command, {
      path: ['editor', 'command'],
    });
    if (!captured.ok) {
      return Promise.resolve(editorFailure(captured.errors[0]!));
    }
    const owned = captured.value as unknown as BomCommand<TFields>;
    const transactionId = this.#nextTransactionId('execute');
    const origin = options.origin ?? 'editor';
    return this.#enqueue(
      async () => {
        const persistence = this.#persistenceForMutation();
        if (!persistence.ok) return editorFailure(persistence.error);
        const attempt = this.#attempt(transactionId, origin);
        const metadata = this.#persistenceMetadata(
          persistence.value,
          transactionId,
          options.idempotencyKey,
        );
        this.#resetPreparation();
        const result = await this.#engine.execute(owned, {
          transactionId,
          origin,
          baseRevision: attempt.baseRevision,
          ...(metadata === undefined ? {} : metadata),
        });
        return this.#finishLocalTransaction(result, attempt, {
          session: persistence.value,
          commands: Object.freeze([owned]),
        });
      },
      options.signal,
    );
  }

  public applyPatch(
    patch: BomPatch<TFields>,
    options: {
      readonly signal?: AbortSignal;
      readonly origin?: string;
    } = {},
  ): Promise<BomResult<BomCommit<TFields>>> {
    const captured = normalizeBomValue(patch, {
      path: ['editor', 'patch'],
    });
    if (!captured.ok) {
      return Promise.resolve(editorFailure(captured.errors[0]!));
    }
    const ownedBase = captured.value as unknown as BomPatch<TFields>;
    return this.#enqueue(
      async () => {
        const persistence = this.#persistenceForMutation();
        if (!persistence.ok) return editorFailure(persistence.error);
        const metadata = this.#persistenceMetadata(
          persistence.value,
          ownedBase.transactionId,
          ownedBase.idempotencyKey,
        );
        const owned: BomPatch<TFields> = Object.freeze({
          ...ownedBase,
          origin: options.origin ?? ownedBase.origin,
          ...(metadata === undefined ? {} : metadata),
        });
        const attempt: TransactionAttempt = {
          transactionId: owned.transactionId,
          origin: owned.origin,
          baseRevision: owned.baseRevision,
        };
        this.#resetPreparation();
        const result = await this.#engine.applyPatch(owned);
        return this.#finishLocalTransaction(result, attempt, {
          session: persistence.value,
          commands: Object.freeze([]),
        });
      },
      options.signal,
    );
  }

  public transaction(
    build: (transaction: BomTransactionBuilder<TFields>) => void,
    options: {
      readonly label?: string;
      readonly origin?: string;
      readonly signal?: AbortSignal;
      readonly idempotencyKey?: string;
    } = {},
  ): Promise<BomResult<BomCommit<TFields>>> {
    const parent = this.#transactionBuildContext;
    if (parent !== undefined) {
      return this.#appendNestedTransaction(parent, build, options);
    }

    const capturedOptions = Object.freeze({ ...options });
    const transactionId = this.#nextTransactionId('batch');
    const origin = capturedOptions.origin ?? 'editor:transaction';
    let settle!: (result: BomResult<BomCommit<TFields>>) => void;
    const result = new Promise<BomResult<BomCommit<TFields>>>((resolve) => {
      settle = resolve;
    });
    const commands: BomCommand<TFields>[] = [];
    let context!: TransactionBuildContext<TFields>;
    const builder: BomTransactionBuilder<TFields> = Object.freeze({
      execute: (command: BomCommand<TFields>): void => {
        this.#appendTransactionCommand(context, command);
      },
      transaction: (
        nested: (transaction: BomTransactionBuilder<TFields>) => void,
      ): void => {
        this.#appendNestedTransaction(context, nested, {});
      },
    });
    context = {
      commands,
      builder,
      transactionId,
      origin,
      label: capturedOptions.label,
      signal: capturedOptions.signal,
      result,
      settle,
      active: true,
      buildError: undefined,
    };

    this.#transactionBuildContext = context;
    try {
      this.#runTransactionBuilder(context, build);
    } finally {
      context.active = false;
      this.#transactionBuildContext = undefined;
    }

    const buildError = context.buildError ??
      (commands.length === 0
        ? editorError(BOM_EDITOR_ERROR_CODES.transactionEmpty, 'VALIDATION')
        : undefined);
    if (buildError !== undefined) {
      void this.#enqueue<BomCommit<TFields>>(
        () => this.#rejectUnbuiltTransaction(
          this.#attempt(transactionId, origin),
          buildError,
        ),
        capturedOptions.signal,
      ).then((settled) => context.settle(settled));
      return result;
    }

    const ownedCommands = Object.freeze([...commands]);
    void this.#enqueue<BomCommit<TFields>>(
      async () => {
        const persistence = this.#persistenceForMutation();
        if (!persistence.ok) return editorFailure(persistence.error);
        const attempt = this.#attempt(transactionId, origin);
        const metadata = this.#persistenceMetadata(
          persistence.value,
          transactionId,
          capturedOptions.idempotencyKey,
        );
        const batch: BomCommandBatch<TFields> = Object.freeze({
          protocolVersion: this.#protocolVersion,
          documentId: this.#published.snapshot.documentId,
          documentGeneration: this.#published.documentGeneration,
          baseRevision: attempt.baseRevision,
          transactionId,
          origin,
          timestamp: new Date().toISOString(),
          ...(metadata === undefined ? {} : metadata),
          ...(context.label === undefined ? {} : { label: context.label }),
          commands: ownedCommands,
        });
        this.#resetPreparation();
        const transaction = await this.#engine.executeBatch(batch);
        return this.#finishLocalTransaction(transaction, attempt, {
          session: persistence.value,
          commands: ownedCommands,
        });
      },
      capturedOptions.signal,
    ).then((settled) => context.settle(settled));
    return result;
  }

  public undo(
    options: {
      readonly signal?: AbortSignal;
      readonly origin?: string;
    } = {},
  ): Promise<BomResult<BomCommit<TFields>>> {
    if (this.#source !== undefined) {
      return this.#sourceUndo(options);
    }
    return this.#historyAction('undo', options);
  }

  public redo(
    options: {
      readonly signal?: AbortSignal;
      readonly origin?: string;
    } = {},
  ): Promise<BomResult<BomCommit<TFields>>> {
    if (this.#source !== undefined) {
      return Promise.resolve(this.#sourceBoundMutationFailure());
    }
    return this.#historyAction('redo', options);
  }

  public configureShortcuts(
    options: Readonly<BomShortcutRegistryOptions>,
  ): BomShortcutConfigurationResult {
    if (this.#isDestroyedOrDestroying()) {
      return Object.freeze({
        ok: false,
        diagnostics: Object.freeze([
          { code: 'destroyed' as const, severity: 'error' as const },
        ]),
      });
    }
    const validated = validateBomShortcutOptions(options);
    if (!validated.ok) {
      return validated;
    }
    const renderer = this.#renderer;
    if (renderer !== null) {
      const result = renderer.configureShortcuts(validated.state);
      if (!result.ok) return result;
    }
    this.#shortcuts = validated.state;
    return validated;
  }

  public resetShortcuts(): BomShortcutConfigurationResult {
    if (this.#isDestroyedOrDestroying()) {
      return Object.freeze({
        ok: false,
        diagnostics: Object.freeze([
          { code: 'destroyed' as const, severity: 'error' as const },
        ]),
      });
    }
    const renderer = this.#renderer;
    const result = renderer === null
      ? validateBomShortcutOptions({ bindings: [] })
      : renderer.resetShortcuts();
    if (result.ok) {
      this.#shortcuts = undefined;
    }
    return result;
  }

  public configurePresentation(
    options: Readonly<BomCanvasPresentationOptions>,
  ): BomCanvasPresentationConfigurationResult {
    if (this.#isDestroyedOrDestroying()) {
      return editorPresentationFailure('destroyed');
    }
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      return editorPresentationFailure('invalid-options');
    }
    const labelOverrides = mergeEditorLabelOverrides(
      this.#presentationLabelOverrides,
      options.labels,
    );
    if (labelOverrides === null) return editorPresentationFailure('invalid-labels');
    const normalized = mergeEditorPresentation(
      this.#presentation,
      options,
      labelOverrides,
    );
    if (!normalized.ok) return normalized;
    const renderer = this.#renderer;
    if (renderer !== null) {
      const configured = renderer.configurePresentation(options);
      if (!configured.ok) return configured;
      this.#presentation = configured.state;
    } else {
      this.#presentation = normalized.state;
    }
    this.#presentationLabelOverrides = labelOverrides;
    this.#rendererOptions = Object.freeze({
      ...(this.#rendererOptions ?? {}),
      locale: this.#presentation.locale,
      direction: this.#presentation.direction,
      labels: labelOverrides,
      theme: this.#presentation.theme,
    });
    return Object.freeze({
      ok: true,
      state: this.#presentation,
      diagnostics: Object.freeze([]),
    });
  }

  public getPresentation(): Readonly<BomCanvasPresentationState> {
    return this.#presentation;
  }

  public announce(
    announcement: Readonly<BomCanvasLiveAnnouncement>,
  ): BomCanvasLiveAnnouncementResult {
    if (this.#isDestroyedOrDestroying()) {
      return Object.freeze({ ok: false, reason: 'destroyed' as const });
    }
    const renderer = this.#renderer;
    if (renderer === null) {
      return Object.freeze({ ok: false, reason: 'not-mounted' as const });
    }
    return renderer.announce(announcement);
  }

  public setDiffView(
    diffView: Readonly<BomCanvasDiffView> | null,
  ): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) {
      return this.#destroyedFailure();
    }
    const normalized = normalizeEditorDiffView(diffView);
    if (normalized === null && diffView !== null) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'diffView',
        }),
      );
    }
    const mismatch = normalized === null
      ? null
      : diffViewPublishedStateMismatch(
          normalized,
          this.#published,
          this.#columns,
        );
    if (mismatch === 'binding') {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.diffViewStale, 'CONFLICT', {
          reason: 'document-version',
        }),
      );
    }
    if (mismatch === 'address') {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'diffView',
          reason: 'unknown-address',
        }),
      );
    }
    this.#diffView = normalized;
    this.#refreshRenderer({ layers: ['content', 'interaction'] });
    return editorSuccess(undefined);
  }

  public installPlugin(
    plugin: BomPlugin<TFields>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomResult<void>> {
    if (this.#isDestroyedOrDestroying()) return Promise.resolve(this.#destroyedFailure());
    if (normalizePlugins([plugin]) === null) {
      return Promise.resolve(editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN')));
    }
    return this.#enqueue(() => this.#installPlugin(plugin, options.signal), options.signal);
  }

  public uninstallPlugin(pluginId: string): Promise<BomResult<void>> {
    if (this.#isDestroyedOrDestroying()) return Promise.resolve(this.#destroyedFailure());
    return this.#enqueue(() => this.#uninstallPlugin(pluginId));
  }

  public reloadPlugin(
    pluginId: string,
    replacement: BomPlugin<TFields>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomResult<void>> {
    if (this.#isDestroyedOrDestroying()) return Promise.resolve(this.#destroyedFailure());
    if (replacement === null || normalizePlugins([replacement]) === null) {
      return Promise.resolve(editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN')));
    }
    return this.#enqueue(
      () => this.#reloadPlugin(pluginId, replacement, options.signal),
      options.signal,
    );
  }

  public getPlugins(): readonly Readonly<BomPluginState>[] {
    return Object.freeze([...this.#plugins.values()]
      .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id))
      .map((entry) => Object.freeze({
        manifest: entry.manifest,
        negotiatedAbiVersion: entry.negotiatedAbiVersion,
        grantedPermissions: Object.freeze([...entry.grantedPermissions]),
        enabledCapabilities: Object.freeze([...entry.enabledCapabilities]),
      })));
  }

  public proposeFix(
    pluginId: string,
    issue: Readonly<BomValidationIssue>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomResult<Readonly<BomPluginFixProposal<TFields>> | null>> {
    if (this.#isDestroyedOrDestroying()) return Promise.resolve(this.#destroyedFailure());
    return this.#enqueue(async () => {
      const validatedIssue = this.#currentValidatedIssue(issue);
      const entry = this.#plugins.get(pluginId);
      const fixerId = localPluginContributionId(pluginId, validatedIssue?.ruleId);
      const fixer = fixerId === undefined ? undefined : entry?.fixers.get(fixerId);
      if (
        entry === undefined ||
        !entry.runtime.acceptingCalls ||
        fixerId === undefined ||
        fixer === undefined
      ) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginNotFound, 'PLUGIN'));
      }
      const resolvedFixerId = fixerId;
      if (!hasPermission(entry.grantedPermissions, 'document:read')) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginDenied, 'PLUGIN'));
      }
      if (options.signal?.aborted) return this.#abortedFailure();
      if (validatedIssue === undefined) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixStale, 'CONFLICT'));
      }
      const state = this.#published;
      const proposalResult = await this.#runPluginHook(
        entry.runtime,
        options.signal,
        { pluginId, name: 'fixer' },
        (pluginSignal) => fixer.propose(Object.freeze({
          snapshot: state.snapshot,
          schema: hasPermission(entry.grantedPermissions, 'schema:read')
            ? this.#schema
            : undefined,
          issue: validatedIssue,
          signal: pluginSignal,
        })),
      );
      if (proposalResult.status !== 'fulfilled') {
        return this.#pluginHookFailure(
          proposalResult,
          editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixStale, 'CONFLICT')),
          options.signal,
        );
      }
      if (this.#plugins.get(pluginId) !== entry || !entry.runtime.acceptingCalls) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixStale, 'CONFLICT'));
      }
      const proposal = proposalResult.value;
      if (proposal === null) return editorSuccess(null);
      const draft = normalizeFixDraft(proposal, resolvedFixerId, validatedIssue.ruleId);
      if (draft === null) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN'));
      }
      const issued = await this.#issueFixProposal(
        entry,
        pluginId,
        validatedIssue.ruleId,
        draft,
        state,
      );
      return issued === null
        ? editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN'))
        : editorSuccess(issued);
    }, options.signal);
  }

  public applyFix(
    proposal: Readonly<BomPluginFixProposal<TFields>>,
    options: Readonly<BomPluginFixOptions> = {},
  ): Promise<BomResult<BomCommit<TFields>>> {
    if (this.#isDestroyedOrDestroying()) return Promise.resolve(this.#destroyedFailure());
    const conflictResolution = options.conflictResolution ?? 'reject';
    if (conflictResolution !== 'reject' && conflictResolution !== 'supersede') {
      return Promise.resolve(editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixInvalid, 'CONFIG')));
    }
    const applied: Promise<BomResult<BomCommit<TFields>>> = this.#enqueue(async () => {
      if (typeof proposal !== 'object' || proposal === null) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixInvalid, 'PLUGIN'));
      }
      const issued = this.#fixProposals.get(proposal.proposalId);
      if (issued === undefined || issued.proposal !== proposal) {
        if (this.#expiredFixProposalIds.has(proposal.proposalId)) {
          return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixStale, 'CONFLICT'));
        }
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixInvalid, 'PLUGIN'));
      }
      if (issued.status !== 'active') {
        return editorFailure(editorError(
          issued.status === 'stale' ? BOM_EDITOR_ERROR_CODES.fixStale : BOM_EDITOR_ERROR_CODES.fixInvalid,
          'CONFLICT',
        ));
      }
      const entry = this.#plugins.get(proposal.pluginId);
      if (entry === undefined || entry !== issued.entry) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginNotFound, 'PLUGIN'));
      }
      if (!hasPermission(entry.grantedPermissions, 'document:write')) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginDenied, 'PLUGIN'));
      }
      if (!this.#isCurrentFixProposal(proposal)) {
        issued.status = 'stale';
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixStale, 'CONFLICT'));
      }
      const conflicts = this.#activeFixProposalConflicts(issued);
      if (conflicts.length > 0 && conflictResolution === 'reject') {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.fixConflict, 'CONFLICT', {
          proposalId: proposal.proposalId,
          conflictingProposalIds: conflicts.map((conflict) => conflict.proposalId).join(','),
        }));
      }
      const persistence = this.#persistenceForMutation();
      if (!persistence.ok) return editorFailure(persistence.error);
      const transactionId = this.#nextTransactionId('plugin-fix');
      const origin = 'plugin:fix:' + proposal.proposalId +
        (options.origin === undefined ? '' : ':' + options.origin);
      const attempt = this.#attempt(transactionId, origin);
      const metadata = this.#persistenceMetadata(persistence.value, transactionId);
      const batch: BomCommandBatch<TFields> = Object.freeze({
        protocolVersion: this.#protocolVersion,
        documentId: proposal.documentId,
        documentGeneration: proposal.documentGeneration,
        baseRevision: proposal.baseRevision,
        transactionId,
        origin,
        timestamp: new Date().toISOString(),
        label: 'plugin-fix:' + proposal.ruleId,
        ...(metadata === undefined ? {} : metadata),
        commands: proposal.commands,
      });
      issued.status = 'applying';
      this.#resetPreparation();
      const result = await this.#engine.executeBatch(batch);
      const committed = await this.#finishLocalTransaction(result, attempt, {
        session: persistence.value,
        commands: proposal.commands,
      });
      if (!committed.ok) {
        issued.status = this.#isCurrentFixProposal(proposal) ? 'active' : 'stale';
        return committed;
      }
      issued.status = 'applied';
      if (conflictResolution === 'supersede') {
        for (const conflict of conflicts) {
          const conflicting = this.#fixProposals.get(conflict.proposalId);
          if (conflicting !== undefined && conflicting.status !== 'applied') {
            conflicting.status = 'superseded';
          }
        }
      }
      return committed;
    }, options.signal);
    return applied.then(async (committed) => {
      if (committed.ok) await this.#revalidateAppliedFix();
      return committed;
    });
  }

  async #issueFixProposal(
    entry: InstalledPlugin<TFields>,
    pluginId: string,
    issueRuleId: string,
    draft: Readonly<NormalizedFixDraft<TFields>>,
    state: Readonly<PublishedState<TFields>>,
  ): Promise<Readonly<BomPluginFixProposal<TFields>> | null> {
    const sequence = ++this.#fixProposalSequence;
    const diff = await this.#previewFixDiff(
      state,
      draft.commands,
      this.instanceId + ':fix-preview:' + String(sequence),
    );
    if (
      diff === null || diff.changes.length === 0 ||
      this.#published.snapshot.documentId !== state.snapshot.documentId ||
      this.#published.documentGeneration !== state.documentGeneration ||
      this.#published.snapshot.revision !== state.snapshot.revision
    ) {
      return null;
    }
    const impact = fixImpactFromDiff(diff);
    const proposalId = pluginId + '/' + draft.proposalId + ':' + String(sequence);
    const proposal = Object.freeze({
      proposalId,
      pluginId,
      ruleId: issueRuleId,
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      baseRevision: state.snapshot.revision,
      titleKey: draft.titleKey,
      confidence: draft.confidence,
      commands: draft.commands,
      impact,
      diff,
      conflicts: this.#fixProposalConflicts({
        proposalId,
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
        baseRevision: state.snapshot.revision,
        impact,
      }),
    });
    this.#fixProposals.set(proposalId, {
      proposal,
      entry,
      status: 'active',
    });
    this.#trimFixProposals();
    return proposal;
  }

  async #previewFixDiff(
    state: Readonly<PublishedState<TFields>>,
    commands: readonly BomCommand<TFields>[],
    transactionId: string,
  ): Promise<Readonly<BomSnapshotDiff<TFields>> | null> {
    const preview = createBomTransactionEngine<TFields>({
      snapshot: state.snapshot,
      schema: this.#schema,
      protocolVersion: this.#protocolVersion,
      documentGeneration: state.documentGeneration,
    });
    if (!preview.ok) return null;
    const executed = await preview.value.executeBatch(Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      baseRevision: state.snapshot.revision,
      transactionId,
      origin: 'plugin:fix-preview',
      timestamp: '1970-01-01T00:00:00.000Z',
      commands,
    }));
    if (!executed.ok) return null;
    const diff = diffBomDocumentSnapshots<TFields>(
      state.snapshot,
      preview.value.getSnapshot(),
      this.#schema,
    );
    return diff.ok ? diff.value : null;
  }

  #isCurrentFixProposal(
    proposal: Readonly<BomPluginFixProposal<TFields>>,
  ): boolean {
    const state = this.#published;
    return proposal.documentId === state.snapshot.documentId &&
      proposal.documentGeneration === state.documentGeneration &&
      proposal.baseRevision === state.snapshot.revision;
  }

  #activeFixProposalConflicts(
    issued: Readonly<IssuedFixProposal<TFields>>,
  ): readonly Readonly<BomPluginFixConflict>[] {
    return this.#fixProposalConflicts(issued.proposal, issued.proposal.proposalId);
  }

  #fixProposalConflicts(
    proposal: Readonly<Pick<
      BomPluginFixProposal<TFields>,
      'proposalId' | 'documentId' | 'documentGeneration' | 'baseRevision' | 'impact'
    >>,
    excludeProposalId?: string,
  ): readonly Readonly<BomPluginFixConflict>[] {
    const conflicts: BomPluginFixConflict[] = [];
    for (const [proposalId, candidate] of this.#fixProposals) {
      if (
        proposalId === excludeProposalId ||
        candidate.status !== 'active' ||
        candidate.proposal.documentId !== proposal.documentId ||
        candidate.proposal.documentGeneration !== proposal.documentGeneration ||
        candidate.proposal.baseRevision !== proposal.baseRevision ||
        !fixImpactsOverlap(candidate.proposal.impact, proposal.impact)
      ) {
        continue;
      }
      conflicts.push(Object.freeze({
        proposalId: candidate.proposal.proposalId,
        impact: candidate.proposal.impact,
      }));
    }
    conflicts.sort((left, right) => left.proposalId.localeCompare(right.proposalId));
    return Object.freeze(conflicts);
  }

  async #revalidateAppliedFix(): Promise<void> {
    // The commit has already left the FIFO before this runs. A slow validator
    // may delay the caller's post-commit report, but cannot block Undo, edits,
    // or later transactions. Stale passes are deliberately dropped by validate.
    try {
      await this.validate({ scope: 'document' });
    } catch {
      // A validator is untrusted; repair durability is never contingent on its
      // post-commit diagnostic pass.
    }
  }

  #expireFixProposals(): void {
    for (const issued of this.#fixProposals.values()) {
      if (issued.status === 'active' && !this.#isCurrentFixProposal(issued.proposal)) {
        issued.status = 'stale';
      }
    }
    this.#trimFixProposals();
    this.#expireMaterialMatchProposals();
  }

  #expireMaterialMatchProposals(): void {
    for (const issued of this.#materialMatchProposals.values()) {
      if (
        (issued.status === 'active' || issued.status === 'approvalPending') &&
        !this.#isCurrentMaterialMatchProposal(issued.proposal)
      ) {
        issued.status = 'stale';
      }
    }
    this.#trimMaterialMatchProposals();
  }

  #trimMaterialMatchProposals(): void {
    while (
      this.#materialMatchProposals.size > MAX_RETAINED_MATERIAL_MATCH_PROPOSALS
    ) {
      const terminal = [...this.#materialMatchProposals.entries()].find(([, issued]) =>
        issued.status !== 'active' &&
        issued.status !== 'approvalPending' &&
        issued.status !== 'applying',
      );
      if (terminal !== undefined) {
        const [proposalId, issued] = terminal;
        this.#materialMatchProposals.delete(proposalId);
        if (issued.status === 'stale') {
          this.#rememberExpiredMaterialMatchProposal(proposalId);
        }
        continue;
      }
      const active = [...this.#materialMatchProposals.entries()].find(([, issued]) =>
        issued.status === 'active',
      );
      if (active === undefined) return;
      const [proposalId, issued] = active;
      issued.status = 'stale';
      this.#materialMatchProposals.delete(proposalId);
      this.#rememberExpiredMaterialMatchProposal(proposalId);
    }
  }

  #rememberExpiredMaterialMatchProposal(proposalId: string): void {
    this.#expiredMaterialMatchProposalIds.delete(proposalId);
    this.#expiredMaterialMatchProposalIds.add(proposalId);
    while (
      this.#expiredMaterialMatchProposalIds.size >
      MAX_RETAINED_MATERIAL_MATCH_PROPOSALS
    ) {
      const oldest = this.#expiredMaterialMatchProposalIds.values().next().value as
        | string
        | undefined;
      if (oldest === undefined) return;
      this.#expiredMaterialMatchProposalIds.delete(oldest);
    }
  }

  #trimFixProposals(): void {
    while (this.#fixProposals.size > MAX_RETAINED_FIX_PROPOSALS) {
      const terminal = [...this.#fixProposals.entries()].find(([, issued]) =>
        issued.status !== 'active' && issued.status !== 'applying',
      );
      if (terminal !== undefined) {
        const [proposalId, issued] = terminal;
        this.#fixProposals.delete(proposalId);
        if (issued.status === 'stale') this.#rememberExpiredFixProposal(proposalId);
        continue;
      }
      const active = [...this.#fixProposals.entries()].find(([, issued]) =>
        issued.status === 'active',
      );
      if (active === undefined) return;
      const [proposalId, issued] = active;
      issued.status = 'stale';
      this.#fixProposals.delete(proposalId);
      this.#rememberExpiredFixProposal(proposalId);
    }
  }

  #rememberExpiredFixProposal(proposalId: string): void {
    this.#expiredFixProposalIds.delete(proposalId);
    this.#expiredFixProposalIds.add(proposalId);
    while (this.#expiredFixProposalIds.size > MAX_RETAINED_FIX_PROPOSALS) {
      const oldest = this.#expiredFixProposalIds.values().next().value as string | undefined;
      if (oldest === undefined) return;
      this.#expiredFixProposalIds.delete(oldest);
    }
  }

  public executePluginCommand(
    pluginId: string,
    commandId: string,
    payload?: unknown,
    options: { readonly signal?: AbortSignal; readonly origin?: string } = {},
  ): Promise<BomResult<BomCommit<TFields>>> {
    if (this.#isDestroyedOrDestroying()) return Promise.resolve(this.#destroyedFailure());
    return this.#enqueue(async () => {
      const entry = this.#plugins.get(pluginId);
      const command = entry?.commands.get(commandId);
      if (entry === undefined || !entry.runtime.acceptingCalls || command === undefined) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginNotFound, 'PLUGIN'));
      }
      if (!hasPermission(entry.grantedPermissions, 'document:read')) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginDenied, 'PLUGIN'));
      }
      const commandResult = await this.#runPluginHook(
        entry.runtime,
        options.signal,
        { pluginId, name: 'command' },
        (pluginSignal) => command.execute(Object.freeze({
          snapshot: this.#published.snapshot,
          schema: hasPermission(entry.grantedPermissions, 'schema:read')
            ? this.#schema
            : undefined,
          signal: pluginSignal,
        }), payload),
      );
      if (commandResult.status !== 'fulfilled') {
        return this.#pluginHookFailure(
          commandResult,
          editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginNotFound, 'PLUGIN')),
          options.signal,
        );
      }
      if (this.#plugins.get(pluginId) !== entry || !entry.runtime.acceptingCalls) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginNotFound, 'PLUGIN'));
      }
      const commands = commandResult.value;
      if (!Array.isArray(commands) || commands.length === 0) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN'));
      }
      const transactionId = this.#nextTransactionId('plugin');
      return await this.#executePluginCommands(commands, transactionId, options);
    }, options.signal);
  }

  async #initializePlugins(): Promise<BomResult<void>> {
    let ordered: readonly BomPlugin<TFields>[];
    try {
      ordered = orderPlugins(this.#initialPlugins);
    } catch {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginDependency, 'PLUGIN'));
    }
    for (const plugin of ordered) {
      if (this.#plugins.has(plugin.manifest.id)) continue;
      const installed = await this.#installPlugin(plugin);
      if (!installed.ok) return installed;
    }
    this.#pluginsInitialized = true;
    return editorSuccess(undefined);
  }

  async #installPlugin(
    plugin: BomPlugin<TFields>,
    signal?: AbortSignal,
  ): Promise<BomResult<void>> {
    if (signal?.aborted) return this.#abortedFailure();
    const manifest = normalizePluginManifest(plugin?.manifest);
    if (manifest === null || typeof plugin?.setup !== 'function') {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN'));
    }
    if (this.#plugins.has(manifest.id)) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginConflict, 'PLUGIN', {
        pluginId: manifest.id,
      }));
    }
    const negotiation = this.#negotiatePlugin(manifest);
    if (!negotiation.ok) {
      this.#events.dispatch('pluginChanged', {
        action: 'failed', pluginId: manifest.id, error: negotiation.error,
      });
      return negotiation;
    }
    const dependencies = this.#verifyPluginDependencies(manifest);
    if (!dependencies.ok) {
      this.#events.dispatch('pluginChanged', {
        action: 'failed', pluginId: manifest.id, error: dependencies.error,
      });
      return dependencies;
    }
    const staged = await this.#stagePlugin(plugin, manifest, negotiation.value, signal);
    if (!staged.ok) {
      this.#events.dispatch('pluginChanged', {
        action: 'failed', pluginId: manifest.id, error: staged.error,
      });
      return staged;
    }
    const keyCollision = [
      ...staged.value.validators.keys(),
      ...staged.value.fixers.keys(),
      ...staged.value.commands.keys(),
    ].find((key) =>
      this.#pluginValidators.has(manifest.id + '/' + key) ||
      this.#pluginFixers.has(manifest.id + '/' + key) ||
      this.#pluginCommands.has(manifest.id + '/' + key),
    );
    if (keyCollision !== undefined) {
      await this.#disposeStagedPlugin(staged.value);
      const failure = editorError(BOM_EDITOR_ERROR_CODES.pluginConflict, 'PLUGIN', {
        pluginId: manifest.id,
        contributionId: keyCollision,
      });
      this.#events.dispatch('pluginChanged', {
        action: 'failed', pluginId: manifest.id, error: failure,
      });
      return editorFailure(failure);
    }
    const entry: InstalledPlugin<TFields> = Object.freeze({
      plugin,
      manifest,
      negotiatedAbiVersion: staged.value.negotiatedAbiVersion,
      grantedPermissions: staged.value.grantedPermissions,
      enabledCapabilities: staged.value.enabledCapabilities,
      validators: staged.value.validators,
      fixers: staged.value.fixers,
      commands: staged.value.commands,
      unregisters: Object.freeze([...staged.value.unregisters]),
      runtime: staged.value.runtime,
      cleanup: staged.value.cleanup,
    });
    this.#plugins.set(manifest.id, entry);
    for (const [id, validator] of entry.validators) {
      this.#pluginValidators.set(manifest.id + '/' + id, validator);
    }
    for (const [id, fixer] of entry.fixers) {
      this.#pluginFixers.set(manifest.id + '/' + id, fixer);
    }
    for (const [id, command] of entry.commands) {
      this.#pluginCommands.set(manifest.id + '/' + id, command);
    }
    this.#pluginGeneration += 1;
    this.#validationState.clear();
    this.#events.dispatch('pluginChanged', {
      action: 'installed', pluginId: manifest.id, version: manifest.version,
    });
    return editorSuccess(undefined);
  }

  #negotiatePlugin(
    manifest: Readonly<BomPluginManifest>,
  ): BomResult<Readonly<PluginNegotiation>> {
    const negotiatedAbiVersion = negotiatePluginAbiVersion(
      manifest.abiVersion,
      this.#pluginHostConfiguration.supportedAbiVersions,
    );
    if (negotiatedAbiVersion === undefined) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN', {
        pluginId: manifest.id,
        reason: 'abi-version',
      }));
    }
    const engineCompatible = engineRangeSatisfies(
      this.#pluginHostConfiguration.parsedEngineVersion,
      manifest.engineRange,
    );
    if (engineCompatible !== true) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN', {
        pluginId: manifest.id,
        reason: engineCompatible === null ? 'engine-range-invalid' : 'engine-version',
      }));
    }
    const unsupportedCapability = manifest.capabilities.find((capability) =>
      !this.#pluginHostConfiguration.supportedCapabilities.includes(capability),
    );
    if (unsupportedCapability !== undefined) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN', {
        pluginId: manifest.id,
        reason: 'capability-unsupported',
        capability: unsupportedCapability,
      }));
    }
    return editorSuccess(Object.freeze({
      negotiatedAbiVersion,
      enabledCapabilities: Object.freeze([...manifest.capabilities]),
    }));
  }

  #verifyPluginDependencies(
    manifest: Readonly<BomPluginManifest>,
  ): BomResult<void> {
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort(compareUtf8)) {
      const range = manifest.dependencies?.[dependency];
      const installed = this.#plugins.get(dependency);
      const version = installed === undefined
        ? null
        : parseSemanticVersion(installed.manifest.version);
      const compatible = range === undefined || version === null
        ? null
        : engineRangeSatisfies(version, range);
      if (installed === undefined || compatible !== true) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginDependency, 'PLUGIN', {
          pluginId: manifest.id,
          dependency,
          ...(installed === undefined ? {} : { reason: 'version-range' }),
        }));
      }
    }
    return editorSuccess(undefined);
  }

  async #runPluginHook<T>(
    runtime: PluginRuntime,
    callerSignal: AbortSignal | undefined,
    hook: Readonly<{ readonly pluginId: string; readonly name: PluginHookName }>,
    operation: (signal: AbortSignal) => T | Promise<T>,
  ): Promise<PluginHookResult<T>> {
    if (
      !runtime.acceptingCalls ||
      runtime.lifecycleController.signal.aborted ||
      this.#pluginLifecycleAbortController.signal.aborted
    ) {
      return Object.freeze({ status: 'aborted' });
    }
    const hookEpoch = runtime.hookEpoch;
    runtime.inFlightHooks += 1;
    try {
      const result = await runBoundedPluginHook(
        operation,
        [
          callerSignal,
          runtime.hookController.signal,
          runtime.lifecycleController.signal,
          this.#pluginLifecycleAbortController.signal,
        ],
        this.#pluginHostConfiguration.asyncHookTimeoutMs,
        (durationMs) => this.#reportPluginSyncHookBudget(hook, durationMs),
      );
      return result.status === 'fulfilled' && hookEpoch !== runtime.hookEpoch
        ? Object.freeze({ status: 'aborted' })
        : result;
    } finally {
      runtime.inFlightHooks -= 1;
      if (runtime.inFlightHooks === 0) {
        for (const resolve of runtime.drainWaiters) resolve();
        runtime.drainWaiters.clear();
      }
    }
  }

  #reportPluginSyncHookBudget(
    hook: Readonly<{ readonly pluginId: string; readonly name: PluginHookName }>,
    durationMs: number,
  ): void {
    if (
      !Number.isFinite(durationMs) ||
      durationMs <= this.#pluginHostConfiguration.syncHookBudgetMs
    ) {
      return;
    }
    const labels = Object.freeze({ pluginId: hook.pluginId, hook: hook.name });
    this.#recordMetric('plugin.sync-hook.duration', durationMs, 'ms', labels);
    try {
      this.#logger?.warn?.('bom-editor.plugin.sync-hook-budget-exceeded', Object.freeze({
        instanceId: this.instanceId,
        pluginId: hook.pluginId,
        hook: hook.name,
        durationMs,
        budgetMs: this.#pluginHostConfiguration.syncHookBudgetMs,
      }));
    } catch {
      // Plugin diagnostics must never alter hook completion or transactions.
    }
  }

  async #pausePlugin(entry: InstalledPlugin<TFields>): Promise<void> {
    const runtime = entry.runtime;
    if (!runtime.acceptingCalls) return;
    runtime.acceptingCalls = false;
    runtime.hookEpoch += 1;
    runtime.hookController.abort();
    this.#pluginGeneration += 1;
    this.#validationState.clear();
    await waitForPluginRuntimeDrain(
      runtime,
      this.#pluginHostConfiguration.asyncHookTimeoutMs,
    );
  }

  #resumePlugin(entry: InstalledPlugin<TFields>): void {
    const runtime = entry.runtime;
    if (runtime.lifecycleController.signal.aborted) return;
    runtime.acceptingCalls = true;
    runtime.hookEpoch += 1;
    runtime.hookController = new AbortController();
    this.#pluginGeneration += 1;
    this.#validationState.clear();
  }

  async #disposeStagedPlugin(stage: PluginStage<TFields>): Promise<PluginHookResult<void>> {
    stage.registrationsActive = false;
    stage.runtime.acceptingCalls = false;
    stage.runtime.hookEpoch += 1;
    stage.runtime.hookController.abort();
    stage.runtime.lifecycleController.abort();
    const cleanup = await safePluginCleanup(
      stage.cleanup,
      this.#pluginHostConfiguration.asyncHookTimeoutMs,
      (durationMs) => this.#reportPluginSyncHookBudget(
        { pluginId: stage.manifest.id, name: 'cleanup' },
        durationMs,
      ),
    );
    disposePluginRegistrations(stage.unregisters);
    return cleanup;
  }

  #finalizePluginRemoval(entry: InstalledPlugin<TFields>): void {
    this.#removePluginContributions(entry);
    disposePluginRegistrations(entry.unregisters);
    entry.runtime.lifecycleController.abort();
  }

  #pluginHookFailure<T>(
    result: PluginHookResult<unknown>,
    stale: BomResult<T>,
    signal: AbortSignal | undefined,
  ): BomResult<T> {
    if (result.status === 'timeout') {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginTimeout, 'PLUGIN'));
    }
    if (result.status === 'aborted') {
      if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
      return signal?.aborted ? this.#abortedFailure() : stale;
    }
    return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginFailed, 'PLUGIN'));
  }

  async #stagePlugin(
    plugin: BomPlugin<TFields>,
    manifest: Readonly<BomPluginManifest>,
    negotiation: Readonly<PluginNegotiation>,
    signal?: AbortSignal,
  ): Promise<BomResult<PluginStage<TFields>>> {
    const runtime = createPluginRuntime();
    let granted: readonly BomPluginPermission[] = Object.freeze([]);
    if (this.#pluginGrantPolicy !== undefined) {
      const grant = await this.#runPluginHook(
        runtime,
        signal,
        { pluginId: manifest.id, name: 'grant' },
        (hookSignal) => this.#pluginGrantPolicy!.grant(manifest, { signal: hookSignal }),
      );
      if (grant.status !== 'fulfilled') {
        runtime.acceptingCalls = false;
        runtime.hookController.abort();
        runtime.lifecycleController.abort();
        if (grant.status === 'timeout') {
          return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginTimeout, 'PLUGIN'));
        }
        if (grant.status === 'aborted') {
          return this.#isDestroyedOrDestroying()
            ? this.#destroyedFailure()
            : this.#abortedFailure();
        }
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginDenied, 'PLUGIN'));
      }
      const result = grant.value;
      if (!Array.isArray(result) || result.some((permission) =>
        !manifest.permissions?.includes(permission))) {
        runtime.acceptingCalls = false;
        runtime.hookController.abort();
        runtime.lifecycleController.abort();
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginDenied, 'PLUGIN'));
      }
      granted = Object.freeze([...new Set(result)]);
    }
    const stage: PluginStage<TFields> = {
      plugin,
      manifest,
      negotiatedAbiVersion: negotiation.negotiatedAbiVersion,
      grantedPermissions: granted,
      enabledCapabilities: negotiation.enabledCapabilities,
      validators: new Map(),
      fixers: new Map(),
      commands: new Map(),
      unregisters: [],
      runtime,
      registrationsActive: true,
      cleanup: undefined,
    };
    const requireCapability = (capability: string): void => {
      if (!stage.registrationsActive) {
        throw new Error('BOM_PLUGIN_CONTEXT_INACTIVE');
      }
      if (!manifest.capabilities.includes(capability as never)) {
        throw new Error('BOM_PLUGIN_CAPABILITY_NOT_DECLARED');
      }
    };
    const idOf = (value: unknown, property: string): string => {
      if (typeof value !== 'object' || value === null) throw new Error('BOM_PLUGIN_CONTRIBUTION_INVALID');
      const id = (value as Record<string, unknown>)[property];
      if (typeof id !== 'string' || !isContributionId(id)) throw new Error('BOM_PLUGIN_CONTRIBUTION_INVALID');
      return id;
    };
    const registeredValidatorOf = (
      validator: BomPluginValidator<TFields>,
      ruleId: string,
    ): RegisteredPluginValidator<TFields> => {
      if (typeof validator !== 'object' || validator === null) {
        throw new Error('BOM_PLUGIN_CONTRIBUTION_INVALID');
      }
      const candidate = validator as unknown as Readonly<{
        readonly version?: unknown;
        readonly severity?: unknown;
        readonly validate?: unknown;
      }>;
      if (
        typeof candidate.version !== 'string' || !isPluginRuleVersion(candidate.version) ||
        (candidate.severity !== 'info' &&
          candidate.severity !== 'warning' &&
          candidate.severity !== 'error') ||
        typeof candidate.validate !== 'function'
      ) {
        throw new Error('BOM_PLUGIN_CONTRIBUTION_INVALID');
      }
      return Object.freeze({
        validator,
        ruleId,
        version: candidate.version,
        severity: candidate.severity,
      });
    };
    const context = Object.freeze({
      pluginId: manifest.id,
      manifest,
      negotiatedAbiVersion: negotiation.negotiatedAbiVersion,
      grantedPermissions: granted,
      signal: runtime.lifecycleController.signal,
      schema: hasPermission(granted, 'schema:read') ? this.#schema : undefined,
      getSnapshot: (): Readonly<BomDocumentSnapshot<TFields>> => {
        if (!stage.registrationsActive) {
          throw new Error('BOM_PLUGIN_CONTEXT_INACTIVE');
        }
        if (!hasPermission(granted, 'document:read')) throw new Error('BOM_PLUGIN_PERMISSION_DENIED');
        return this.#published.snapshot;
      },
      registerValidator: (validator: BomPluginValidator<TFields>): (() => void) => {
        requireCapability('validators');
        if (!hasPermission(granted, 'document:read')) {
          throw new PluginPermissionDeniedError();
        }
        const id = idOf(validator, 'ruleId');
        if (stage.validators.has(id)) throw new Error('BOM_PLUGIN_CONTRIBUTION_DUPLICATE');
        const registered = registeredValidatorOf(validator, id);
        stage.validators.set(id, registered);
        const unregister = (): void => {
          if (stage.validators.get(id) === registered) stage.validators.delete(id);
        };
        stage.unregisters.push(unregister);
        return unregister;
      },
      registerFixer: (fixer: BomPluginFixer<TFields>): (() => void) => {
        requireCapability('fixers');
        const id = idOf(fixer, 'fixerId');
        if (stage.fixers.has(id)) throw new Error('BOM_PLUGIN_CONTRIBUTION_DUPLICATE');
        stage.fixers.set(id, fixer);
        const unregister = (): void => {
          if (stage.fixers.get(id) === fixer) stage.fixers.delete(id);
        };
        stage.unregisters.push(unregister);
        return unregister;
      },
      registerCommand: (command: BomPluginCommand<TFields>): (() => void) => {
        requireCapability('commands');
        const id = idOf(command, 'commandId');
        if (stage.commands.has(id)) throw new Error('BOM_PLUGIN_CONTRIBUTION_DUPLICATE');
        stage.commands.set(id, command);
        const unregister = (): void => {
          if (stage.commands.get(id) === command) stage.commands.delete(id);
        };
        stage.unregisters.push(unregister);
        return unregister;
      },
    });
    const setup = await this.#runPluginHook(
      runtime,
      signal,
      { pluginId: manifest.id, name: 'setup' },
      () => plugin.setup(context),
    );
    stage.registrationsActive = false;
    if (setup.status !== 'fulfilled') {
      await this.#disposeStagedPlugin(stage);
      if (setup.status === 'timeout') {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginTimeout, 'PLUGIN', {
          pluginId: manifest.id,
        }));
      }
      if (setup.status === 'aborted') {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      return editorFailure(editorError(
        setup.error instanceof PluginPermissionDeniedError
          ? BOM_EDITOR_ERROR_CODES.pluginDenied
          : BOM_EDITOR_ERROR_CODES.pluginFailed,
        'PLUGIN',
        { pluginId: manifest.id },
      ));
    }
    if (setup.value !== undefined && typeof setup.value !== 'function') {
      await this.#disposeStagedPlugin(stage);
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN', {
        pluginId: manifest.id,
      }));
    }
    stage.cleanup = typeof setup.value === 'function' ? setup.value : undefined;
    return editorSuccess(stage);
  }

  async #uninstallPlugin(pluginId: string): Promise<BomResult<void>> {
    const entry = this.#plugins.get(pluginId);
    if (entry === undefined) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginNotFound, 'PLUGIN', { pluginId }));
    }
    await this.#pausePlugin(entry);
    const cleanup = await safePluginCleanup(
      entry.cleanup,
      this.#pluginHostConfiguration.asyncHookTimeoutMs,
      (durationMs) => this.#reportPluginSyncHookBudget(
        { pluginId: entry.manifest.id, name: 'cleanup' },
        durationMs,
      ),
    );
    this.#finalizePluginRemoval(entry);
    this.#plugins.delete(pluginId);
    const cleanupFailed = cleanup.status !== 'fulfilled';
    const cleanupError = editorError(
      cleanup.status === 'timeout'
        ? BOM_EDITOR_ERROR_CODES.pluginTimeout
        : BOM_EDITOR_ERROR_CODES.pluginFailed,
      'PLUGIN',
    );
    this.#events.dispatch('pluginChanged', {
      action: cleanupFailed ? 'failed' : 'uninstalled',
      pluginId,
      ...(cleanupFailed ? { error: cleanupError } : {}),
    });
    return cleanupFailed
      ? editorFailure(cleanupError)
      : editorSuccess(undefined);
  }

  async #reloadPlugin(
    pluginId: string,
    replacement: BomPlugin<TFields>,
    signal?: AbortSignal,
  ): Promise<BomResult<void>> {
    const current = this.#plugins.get(pluginId);
    if (current === undefined) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginNotFound, 'PLUGIN', { pluginId }));
    }
    if (replacement.manifest.id !== pluginId) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN', { pluginId }));
    }
    const manifest = normalizePluginManifest(replacement.manifest);
    if (manifest === null) return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginInvalid, 'PLUGIN'));
    const negotiation = this.#negotiatePlugin(manifest);
    if (!negotiation.ok) {
      this.#events.dispatch('pluginChanged', {
        action: 'failed', pluginId, error: negotiation.error,
      });
      return negotiation;
    }
    const dependencies = this.#verifyPluginDependencies(manifest);
    if (!dependencies.ok) {
      this.#events.dispatch('pluginChanged', {
        action: 'failed', pluginId, error: dependencies.error,
      });
      return dependencies;
    }
    const staged = await this.#stagePlugin(replacement, manifest, negotiation.value, signal);
    if (!staged.ok) {
      this.#events.dispatch('pluginChanged', {
        action: 'failed', pluginId, error: staged.error,
      });
      return staged;
    }
    const entry: InstalledPlugin<TFields> = Object.freeze({
      plugin: replacement,
      manifest,
      negotiatedAbiVersion: staged.value.negotiatedAbiVersion,
      grantedPermissions: staged.value.grantedPermissions,
      enabledCapabilities: staged.value.enabledCapabilities,
      validators: staged.value.validators,
      fixers: staged.value.fixers,
      commands: staged.value.commands,
      unregisters: Object.freeze([...staged.value.unregisters]),
      runtime: staged.value.runtime,
      cleanup: staged.value.cleanup,
    });
    await this.#pausePlugin(current);
    const cleanup = await safePluginCleanup(
      current.cleanup,
      this.#pluginHostConfiguration.asyncHookTimeoutMs,
      (durationMs) => this.#reportPluginSyncHookBudget(
        { pluginId: current.manifest.id, name: 'cleanup' },
        durationMs,
      ),
    );
    if (cleanup.status !== 'fulfilled') {
      this.#resumePlugin(current);
      await this.#disposeStagedPlugin(staged.value);
      const error = editorError(
        cleanup.status === 'timeout'
          ? BOM_EDITOR_ERROR_CODES.pluginTimeout
          : BOM_EDITOR_ERROR_CODES.pluginFailed,
        'PLUGIN',
        { pluginId },
      );
      this.#events.dispatch('pluginChanged', { action: 'failed', pluginId, error });
      return editorFailure(error);
    }
    this.#finalizePluginRemoval(current);
    this.#plugins.set(pluginId, entry);
    for (const [id, validator] of entry.validators) this.#pluginValidators.set(pluginId + '/' + id, validator);
    for (const [id, fixer] of entry.fixers) this.#pluginFixers.set(pluginId + '/' + id, fixer);
    for (const [id, command] of entry.commands) this.#pluginCommands.set(pluginId + '/' + id, command);
    this.#pluginGeneration += 1;
    this.#validationState.clear();
    this.#events.dispatch('pluginChanged', { action: 'reloaded', pluginId, version: manifest.version });
    return editorSuccess(undefined);
  }

  #removePluginContributions(entry: InstalledPlugin<TFields>): void {
    for (const id of entry.validators.keys()) this.#pluginValidators.delete(entry.manifest.id + '/' + id);
    for (const id of entry.fixers.keys()) this.#pluginFixers.delete(entry.manifest.id + '/' + id);
    for (const id of entry.commands.keys()) this.#pluginCommands.delete(entry.manifest.id + '/' + id);
  }

  async #executePluginCommands(
    commands: readonly BomCommand<TFields>[],
    transactionId: string,
    options: Readonly<{ readonly signal?: AbortSignal; readonly origin?: string }>,
  ): Promise<BomResult<BomCommit<TFields>>> {
    const persistence = this.#persistenceForMutation();
    if (!persistence.ok) return editorFailure(persistence.error);
    const origin = options.origin ?? 'plugin:command';
    const attempt = this.#attempt(transactionId, origin);
    const metadata = this.#persistenceMetadata(persistence.value, transactionId);
    const batch: BomCommandBatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      baseRevision: attempt.baseRevision,
      transactionId,
      origin,
      timestamp: new Date().toISOString(),
      ...(metadata === undefined ? {} : metadata),
      commands: Object.freeze([...commands]),
    });
    this.#resetPreparation();
    const result = await this.#engine.executeBatch(batch);
    return this.#finishLocalTransaction(result, attempt, {
      session: persistence.value,
      commands: Object.freeze([...commands]),
    });
  }

  public setColumns(
    columns: readonly BomColumnDefinition[],
  ): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'));
    }
    const normalized = normalizeEditorColumns(columns, this.#schema);
    if (!normalized.ok) {
      return editorFailure(normalized.error);
    }
    return this.#replaceColumns(normalized.value);
  }

  public setRowHeight(
    occurrenceId: OccurrenceId,
    rowHeight: number,
  ): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'));
    }
    if (
      typeof occurrenceId !== 'string' ||
      occurrenceId.length === 0 ||
      !Number.isFinite(rowHeight) ||
      rowHeight <= 0 ||
      rowHeight > MAX_ROW_HEIGHT_PX ||
      !this.#published.indexes.rowById.has(occurrenceId)
    ) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const previousRowHeights = freezeViewRowHeights(this.#published.projection);
    const previousSelection = this.#selection;
    const changed = this.#published.projection.setRowHeight(occurrenceId, rowHeight);
    if (!changed.ok) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    if (changed.value.previousHeight === changed.value.rowHeight) {
      return editorSuccess(undefined);
    }
    this.#refreshRenderer({ layoutChanged: true });
    const previousView = this.#lastView;
    this.#lastView = Object.freeze({
      ...previousView,
      rowHeights: freezeViewRowHeights(this.#published.projection),
    });
    this.#events.dispatch('viewChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      previous: previousView,
      view: this.#lastView,
      reason: 'row-height',
    });
    this.#recordRowHeightHistory(previousRowHeights, previousSelection);
    return editorSuccess(undefined);
  }

  public setViewQuery(options: Readonly<VisibleQueryOptions> = {}): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'));
    }
    const nextQuery = normalizeViewQuery(options, this.#schema);
    if (nextQuery === null) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const state = this.#published;
    const expandedIds = state.projection.expandedOccurrenceIds();
      const projection = createVisibleProjection(state.snapshot, {
        indexes: state.indexes,
        ...(this.#rowHeight === undefined ? {} : { rowHeight: this.#rowHeight }),
        rowHeightOverrides: rowHeightOverrideMap(state.projection),
      expandedIds,
      viewChildrenByParent: buildViewChildrenByParent(state.snapshot, state.indexes, options),
    });
    if (!projection.ok) return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'));
    const previousSelection = this.#selection;
    this.#viewQuery = nextQuery;
    this.#published = Object.freeze({ ...state, projection: projection.value });
    this.#pasteTargetEpoch += 1;
    this.#replaceSelection(sanitizeSelection(previousSelection, projection.value, state.indexes, this.#columns));
    this.#refreshRenderer({ layoutChanged: true });
    const previousView = this.#lastView;
    const { filters: _previousFilters, sort: _previousSort, ...viewWithoutQuery } = previousView;
    this.#lastView = Object.freeze({
      ...viewWithoutQuery,
      visibleRowCount: projection.value.visibleCount,
      ...(nextQuery.filters === undefined ? {} : { filters: nextQuery.filters }),
      ...(nextQuery.sort === undefined ? {} : { sort: nextQuery.sort }),
    });
    this.#events.dispatch('viewChanged', { documentId: state.snapshot.documentId, documentGeneration: state.documentGeneration, previous: previousView, view: this.#lastView, reason: 'projection' });
    if (!sameSelection(previousSelection, this.#selection)) {
      this.#events.dispatch('selectionChanged', { documentId: state.snapshot.documentId, documentGeneration: state.documentGeneration, previous: previousSelection, selection: this.#selection, reason: 'view-change' });
    }
    return editorSuccess(undefined);
  }

  public getViewTemplate(): Readonly<import('./types.js').BomViewTemplate> {
    const query = this.#viewQuery;
    return Object.freeze({
      columns: Object.freeze(this.#columns.map((column) => Object.freeze({ ...column }))),
      ...(query.filters === undefined && query.sort === undefined ? {} : { query: Object.freeze({ ...query }) }),
    });
  }

  public applyViewTemplate(template: Readonly<import('./types.js').BomViewTemplate>): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'));
    if (template === null || typeof template !== 'object' || !Array.isArray(template.columns)) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const query = normalizeViewQuery(template.query ?? {}, this.#schema);
    if (query === null) return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    const normalized = normalizeEditorColumns(template.columns, this.#schema);
    if (!normalized.ok) return editorFailure(normalized.error);
    const columnsResult = this.#replaceColumns(normalized.value);
    if (!columnsResult.ok) return columnsResult;
    return this.setViewQuery(query);
  }

  public fillSeries(): void {
    const status = this.#editMachine.state.status;
    if (status !== 'idle' && status !== 'focused') return;
    this.#ensureEditFocused();
    if (this.#editMachine.state.status !== 'focused') return;
    const state = this.#published;
    const epoch = this.#pasteTargetEpoch;
    const task = this.#enqueue(() => this.#commitFillSeries(state, epoch));
    void task.then((result): void => {
      if (!result.ok && !this.#isDestroyedOrDestroying()) this.#emitRuntimeError(result.error, 'transaction');
    });
  }

  public setColumnFrozen(
    columnId: string,
    frozen: BomFrozenColumnPosition,
  ): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'));
    }
    if (
      typeof columnId !== 'string' ||
      (frozen !== false && frozen !== 'start' && frozen !== 'end')
    ) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const result = this.#setColumnFrozen(columnId, frozen);
    if (result.ok) {
      this.#publishColumnView();
    }
    return result;
  }

  public insertColumn(
    referenceColumnId: string,
    position: BomColumnInsertPosition = 'before',
    count = 1,
  ): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'));
    }
    if (
      typeof referenceColumnId !== 'string' ||
      referenceColumnId.length === 0 ||
      (position !== 'before' && position !== 'after') ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 256
    ) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const changed = this.#insertColumn(referenceColumnId, position, count, 'api');
    if (!changed) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    this.#publishColumnView();
    return editorSuccess(undefined);
  }

  public deleteColumns(columnIds: readonly string[]): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'));
    }
    const changed = this.#deleteColumns(columnIds, 'api');
    if (!changed) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    this.#publishColumnView();
    return editorSuccess(undefined);
  }

  public async recoverPersistence(
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomResult<void>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    if (this.#sourceReplacementPending || options.signal?.aborted) {
      return options.signal?.aborted
        ? this.#abortedFailure()
        : editorFailure(
            editorError(
              BOM_EDITOR_ERROR_CODES.persistenceSuspended,
              'CONFLICT',
            ),
          );
    }
    const session = this.#persistenceSession;
    if (
      session === undefined || !this.#isSessionCurrent(session) ||
      session.coordinator?.mode !== 'reloadRequired'
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT', {
          reason: 'persistence-recovery-not-available',
        }),
      );
    }
    this.#sourceReplacementPending = true;
    this.#abortDataSourceReads();
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    this.#sourceController = controller;
    try {
      const loadWait = await waitForAbortSignal(
        session.source.loadDocument({ signal: controller.signal }),
        controller.signal,
      );
      if (loadWait.aborted) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      const normalized = normalizeBomDocumentSnapshot<TFields>(
        loadWait.value,
        this.#schema,
      );
      if (!normalized.ok) return editorFailure(normalized.errors[0]!);
      return await this.#enqueue(async () => {
        if (
          options.signal?.aborted || !this.#isSessionCurrent(session) ||
          session.coordinator?.mode !== 'reloadRequired'
        ) {
          return options.signal?.aborted
            ? this.#abortedFailure()
            : editorFailure(
                editorError(
                  BOM_EDITOR_ERROR_CODES.persistenceSuspended,
                  'CONFLICT',
                ),
              );
        }
        const replaced = await this.#replaceDocument(
          normalized.value,
          'reload',
          'dataSource',
        );
        if (!replaced.ok) return replaced;
        this.#deactivatePersistenceSession('reload');
        this.#sourceEpoch += 1;
        this.#sourceLoaded = true;
        return this.#activatePersistenceSession(session.source);
      }, options.signal);
    } catch (failure) {
      return editorFailure(
        failure instanceof BomDataSourceException
          ? failure.error
          : this.#isDestroyedOrDestroying()
            ? editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG')
            : editorError(BOM_EDITOR_ERROR_CODES.remoteResyncRequired, 'IO'),
      );
    } finally {
      options.signal?.removeEventListener('abort', abort);
      if (this.#sourceController === controller) {
        this.#sourceController = undefined;
      }
      this.#sourceReplacementPending = false;
    }
  }

  public paste(
    input: Readonly<BomPasteInput>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomPasteResult<TFields>> {
    return this.#paste(input, 'api', options.signal);
  }

  public pasteText(
    text: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomPasteResult<TFields>> {
    return this.#paste({ text }, 'api', options.signal);
  }

  public previewPaste(
    input: Readonly<BomPasteInput>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomPastePreviewResult<TFields>> {
    return this.#previewPaste(input, 'api', options.signal);
  }

  public async importData(
    source: BomImportSource,
    options: Readonly<BomImportOptions>,
  ): Promise<BomResult<BomImportReport<TFields>>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    if (
      options === null ||
      typeof options !== 'object' ||
      (options.mode !== 'preview' && options.mode !== 'commit')
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'CONFIG', {
          reason: 'options-invalid',
        }),
      );
    }
    if (options.format === 'xls') {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importUnsupported, 'CONFIG', {
          format: options.format,
        }),
      );
    }
    if (
      options.format !== undefined &&
      options.format !== 'csv' &&
      options.format !== 'tsv' &&
      options.format !== 'xlsx'
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'CONFIG', {
          reason: 'format-invalid',
        }),
      );
    }
    if (
      (options.header !== undefined &&
        options.header !== 'none' &&
        options.header !== 'firstRow') ||
      (options.fieldIds !== undefined && !Array.isArray(options.fieldIds)) ||
      (options.mapping !== undefined && !Array.isArray(options.mapping)) ||
      (options.sheetName !== undefined &&
        (typeof options.sheetName !== 'string' ||
          options.sheetName.length === 0 ||
          options.sheetName.length > 31))
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'CONFIG', {
          reason: 'mapping-options-invalid',
        }),
      );
    }
    const normalizedXlsxLimits = normalizeXlsxLimitOverride(options.xlsxLimits);
    if (normalizedXlsxLimits === null ||
      (options.xlsxLimits !== undefined && options.format !== 'xlsx')) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'CONFIG', {
          reason: 'xlsx-limits-invalid',
        }),
      );
    }
    if (
      options.hierarchy !== undefined &&
      (
        typeof options.hierarchy !== 'object' ||
        options.hierarchy === null ||
        Array.isArray(options.hierarchy) ||
        (options.hierarchy.parentFieldId === undefined &&
          options.hierarchy.levelFieldId === undefined) ||
        (options.hierarchy.parentFieldId !== undefined &&
          (typeof options.hierarchy.parentFieldId !== 'string' ||
            options.hierarchy.parentFieldId.length === 0)) ||
        (options.hierarchy.levelFieldId !== undefined &&
          (typeof options.hierarchy.levelFieldId !== 'string' ||
            options.hierarchy.levelFieldId.length === 0))
      )
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'CONFIG', {
          reason: 'hierarchy-options-invalid',
        }),
      );
    }
    const state = this.#published;
    if (
      options.baseRevision !== undefined &&
      options.baseRevision !== state.snapshot.revision
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importConflict, 'CONFLICT'),
      );
    }
    if (options.signal?.aborted) return this.#abortedFailure();

    const taskId = this.#nextTaskId('import');
    const beforeImport = this.#events.dispatch('beforeImport', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId,
      ...(options.format === undefined ? {} : { format: options.format }),
      mode: options.mode,
      ...(options.header === undefined ? {} : { header: options.header }),
      fieldIds: Object.freeze([...(options.fieldIds ?? [])]),
      ...(options.baseRevision === undefined
        ? {}
        : { baseRevision: options.baseRevision }),
    });
    if (!beforeImport.ok) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.eventDispatchFailed, 'INTERNAL'),
      );
    }
    if (beforeImport.event.defaultPrevented) {
      return this.#abortedFailure();
    }
    const combined = combineAbortSignals(
      options.signal,
      this.#pasteParsingAbortController.signal,
    );
    this.#emitImportProgress(taskId, state, 0, 4, 'start');
    try {
      const sourceResult = await readImportSource(
        source,
        this.#pasteLimits.maxBytes,
        combined.signal,
        options.format === 'xlsx',
      );
      if ('status' in sourceResult) return this.#abortedFailure();
      if (!sourceResult.ok) {
        return editorSuccess(importReport(taskId, sourceResult.error));
      }
      this.#emitImportProgress(taskId, state, 1, 4, 'read');
      if (options.format === 'xlsx') {
        this.#emitImportProgress(taskId, state, 2, 4, 'parse');
        const parsedXlsx = await parseXlsx(
          sourceResult.bytes,
          xlsxLimits(this.#pasteLimits, normalizedXlsxLimits),
          combined.signal,
          options.sheetName,
        );
        if (!parsedXlsx.ok) {
          if (parsedXlsx.reason === 'aborted') return this.#abortedFailure();
          const limited = parsedXlsx.reason === 'input-too-large' ||
            parsedXlsx.reason === 'zip-limit' ||
            parsedXlsx.reason === 'too-many-rows' ||
            parsedXlsx.reason === 'too-many-columns' ||
            parsedXlsx.reason === 'too-many-cells' ||
            parsedXlsx.reason === 'cell-too-large' ||
            parsedXlsx.reason === 'too-many-sheets';
          const unsupported = parsedXlsx.reason === 'macro-present' ||
            parsedXlsx.reason === 'external-link-present';
          const xlsxCellDiagnostics = parsedXlsx.diagnostics === undefined
            ? []
            : parsedXlsx.diagnostics.map((diagnostic) =>
                importCellDiagnostic(
                  diagnostic.sourceRow,
                  diagnostic.sourceColumn,
                  diagnostic.code,
                  undefined,
                  parsedXlsx.sheetName,
                ),
              );
          return editorSuccess(importReport(
            taskId,
            editorError(
              limited
                ? BOM_EDITOR_ERROR_CODES.importLimit
                : unsupported
                  ? BOM_EDITOR_ERROR_CODES.importUnsupported
                  : BOM_EDITOR_ERROR_CODES.importInvalid,
              limited ? 'SECURITY_LIMIT' : 'VALIDATION',
              {
                reason: parsedXlsx.reason,
                ...(parsedXlsx.sheetName === undefined
                  ? {}
                  : { sheetName: parsedXlsx.sheetName }),
                ...(parsedXlsx.availableSheetNames === undefined
                  ? {}
                  : { availableSheetNames: parsedXlsx.availableSheetNames }),
              },
            ),
            xlsxCellDiagnostics,
          ));
        }
        const importTargetEpoch = this.#pasteTargetEpoch;
        return await this.#enqueue(
          () => this.#runQueuedImport(
            parsedXlsx.rows,
            'tsv',
            sourceResult.inputBytes,
            options,
            state,
            importTargetEpoch,
            taskId,
            combined.signal,
            parsedXlsx.sheetName,
          ),
          combined.signal,
        );
      }
      const parsed = await parseClipboardTextAsync(
        sourceResult.text,
        this.#pasteLimits,
        { signal: combined.signal },
      );
      if (parsed.status === 'aborted') return this.#abortedFailure();
      const parsedResult = parsed.parsed;
      if (!parsedResult.ok) {
        const error = editorError(
          isClipboardTextLimitFailure(parsedResult.reason)
            ? BOM_EDITOR_ERROR_CODES.importLimit
            : BOM_EDITOR_ERROR_CODES.importInvalid,
          isClipboardTextLimitFailure(parsedResult.reason)
            ? 'SECURITY_LIMIT'
            : 'VALIDATION',
          { reason: parsedResult.reason },
        );
        const cellDiagnostics = parsedResult.diagnostics === undefined
          ? []
          : parsedResult.diagnostics.map((diagnostic) =>
              importCellDiagnostic(
                diagnostic.sourceRow,
                diagnostic.sourceColumn,
                diagnostic.code,
              ),
            );
        return editorSuccess(importReport(taskId, error, cellDiagnostics));
      }
      if (
        options.format !== undefined &&
        options.format !== parsedResult.format &&
        parsedResult.format !== 'text'
      ) {
        return editorSuccess(importReport(
          taskId,
          editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'VALIDATION', {
            reason: 'format-mismatch',
          }),
        ));
      }
      if (
        parsedResult.format !== 'csv' &&
        parsedResult.format !== 'tsv' &&
        parsedResult.format !== 'text'
      ) {
        return editorSuccess(importReport(
          taskId,
          editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'VALIDATION', {
            reason: 'delimited-format-required',
          }),
        ));
      }
      if (this.#published !== state) {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.importConflict, 'CONFLICT'),
        );
      }
      this.#emitImportProgress(taskId, state, 2, 4, 'parse');
      const importFormat: BomPasteFormat = parsedResult.format === 'text'
        ? (options.format === 'csv' ? 'csv' : 'tsv')
        : parsedResult.format;
      const importTargetEpoch = this.#pasteTargetEpoch;
      const queued = await this.#enqueue(
        () => this.#runQueuedImport(
          parsedResult.rows,
          importFormat,
          sourceResult.inputBytes,
          options,
          state,
          importTargetEpoch,
          taskId,
          combined.signal,
        ),
        combined.signal,
      );
      return queued;
    } finally {
      combined.dispose();
    }
  }

  async #runQueuedImport(
    rows: readonly (readonly string[])[],
    format: BomPasteFormat,
    inputBytes: number,
    options: Readonly<BomImportOptions>,
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
    taskId: string,
    signal?: AbortSignal,
    sourceSheetName?: string,
  ): Promise<BomResult<BomImportReport<TFields>>> {
    const reportFailure = (
      error: BomError,
      cellDiagnostics: readonly BomImportCellDiagnostic[] = [],
    ): BomResult<BomImportReport<TFields>> => {
      if (signal?.aborted || error.code === BOM_EDITOR_ERROR_CODES.aborted) {
        return this.#abortedFailure();
      }
      this.#emitImportProgress(
        taskId,
        state,
        3,
        4,
        signal?.aborted ? 'cancelled' : 'failed',
      );
      return editorSuccess(importReport(
        taskId,
        error,
        importCellDiagnosticsForSheet(cellDiagnostics, sourceSheetName),
      ));
    };
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    if (signal?.aborted) return this.#abortedFailure();
    const staleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (staleness !== undefined) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importConflict, 'CONFLICT', {
          reason: staleness,
        }),
      );
    }
    const mapping = await this.#buildImportMappingPlan(
      rows,
      options,
      state,
      pasteTargetEpoch,
      signal,
    );
    if (!mapping.ok) return reportFailure(mapping.error, mapping.cellDiagnostics);
    this.#emitImportProgress(taskId, state, 3, 4, 'validate');
    const prepared = await this.#preparePaste(
      mapping.value.rows,
      format,
      'api',
      inputBytes,
      state,
      pasteTargetEpoch,
      signal,
      { target: mapping.value.target },
    );
    if (!prepared.ok) {
      return reportFailure(
        prepared.error,
        importCellDiagnosticsFromPaste(prepared.diagnostics, mapping.value.sources),
      );
    }
    if (signal?.aborted) return this.#abortedFailure();
    if (
      options.baseRevision !== undefined &&
      options.baseRevision !== this.#published.snapshot.revision
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.importConflict, 'CONFLICT'),
      );
    }
    const preparedValue = prepared.value;
    if (options.mode === 'preview') {
      this.#emitImportProgress(taskId, state, 4, 4, 'complete');
      return editorSuccess(Object.freeze({
        taskId,
        proposedPatch: importProposedPatch(
          preparedValue,
          state,
          this.#protocolVersion,
          this.#nextTransactionId('import-preview'),
          mapping.value.hierarchyCommands,
        ),
        diagnostics: Object.freeze([]),
        cellDiagnostics: Object.freeze([]),
      }));
    }
    const transactionId = this.#nextTransactionId('import');
    const committed = await this.#commitPreparedPaste(
      preparedValue,
      state,
      transactionId,
      signal ?? new AbortController().signal,
      'editor:import',
      'import',
      mapping.value.hierarchyCommands,
    );
    if (!committed.ok) return reportFailure(committed.error);
    this.#emitImportProgress(taskId, state, 4, 4, 'complete');
    return editorSuccess(Object.freeze({
      taskId,
      commit: committed.value.commit,
      diagnostics: Object.freeze([]),
      cellDiagnostics: Object.freeze([]),
    }));
  }

  async #buildImportMappingPlan(
    rows: readonly (readonly string[])[],
    options: Readonly<BomImportOptions>,
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
    signal?: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly value: Readonly<ImportMappingPlan<TFields>> }
    | {
        readonly ok: false;
        readonly error: BomError;
        readonly cellDiagnostics: readonly BomImportCellDiagnostic[];
      }
  > {
    const diagnostics: BomImportCellDiagnostic[] = [];
    const fail = (reason: string) => ({
      ok: false as const,
      error: editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'VALIDATION', {
        reason,
        diagnosticCount: diagnostics.length,
      }),
      cellDiagnostics: Object.freeze([...diagnostics]),
    });
    if (rows.length === 0 || rows[0] === undefined || rows[0].length === 0) {
      return fail('empty-input');
    }
    const width = rows[0].length;
    if (rows.some((row) => row.length !== width)) return fail('ragged-input');
    const headerMode = options.header ?? 'none';
    if (headerMode !== 'none' && headerMode !== 'firstRow') {
      return fail('header-invalid');
    }
    const header = headerMode === 'firstRow' ? rows[0] : undefined;
    const dataRows = headerMode === 'firstRow' ? rows.slice(1) : rows;
    if (dataRows.length === 0) return fail('header-only');
    const schemaById = new Map(
      this.#schema.fields.map((field) => [field.fieldId, field]),
    );
    const fieldIdByLabel = new Map<string, string | undefined>();
    for (const field of this.#schema.fields) {
      fieldIdByLabel.set(field.fieldId, field.fieldId);
    }
    const addHeaderAlias = (alias: string, fieldId: string): void => {
      if (!fieldIdByLabel.has(alias)) {
        fieldIdByLabel.set(alias, fieldId);
      } else if (fieldIdByLabel.get(alias) !== fieldId) {
        fieldIdByLabel.set(alias, undefined);
      }
    };
    for (const column of this.#columns) {
      const field = findSchemaField(this.#schema, column.fieldPath);
      if (field === undefined) continue;
      addHeaderAlias(column.label, field.fieldId);
      addHeaderAlias(column.columnId, field.fieldId);
    }
    const requestedFieldIds = options.fieldIds === undefined
      ? undefined
      : [...options.fieldIds];
    if (requestedFieldIds !== undefined) {
      if (
        requestedFieldIds.length === 0 ||
        uniqueStrings(requestedFieldIds).length !== requestedFieldIds.length ||
        requestedFieldIds.some((fieldId) => !schemaById.has(fieldId))
      ) {
        return fail('field-ids-invalid');
      }
    }
    const mappingInput = options.mapping === undefined
      ? undefined
      : [...options.mapping];
    const sourceByFieldId = new Map<string, number>();
    const usedSources = new Set<number>();
    const addMapping = (
      fieldId: string,
      sourceColumn: number,
      sourceRow: number,
    ): void => {
      if (!schemaById.has(fieldId)) {
        diagnostics.push(importCellDiagnostic(sourceRow, sourceColumn, 'unknown-field', fieldId));
        return;
      }
      if (sourceColumn < 0 || sourceColumn >= width) {
        diagnostics.push(importCellDiagnostic(sourceRow, sourceColumn, 'source-column-out-of-range', fieldId));
        return;
      }
      if (sourceByFieldId.has(fieldId)) {
        diagnostics.push(importCellDiagnostic(sourceRow, sourceColumn, 'duplicate-field-mapping', fieldId));
        return;
      }
      if (usedSources.has(sourceColumn)) {
        diagnostics.push(importCellDiagnostic(sourceRow, sourceColumn, 'duplicate-source-column', fieldId));
        return;
      }
      sourceByFieldId.set(fieldId, sourceColumn);
      usedSources.add(sourceColumn);
    };
    if (mappingInput !== undefined) {
      if (mappingInput.length === 0) return fail('mapping-empty');
      for (const entry of mappingInput) {
        if (
          entry === null ||
          typeof entry !== 'object' ||
          typeof entry.fieldId !== 'string'
        ) {
          diagnostics.push(importCellDiagnostic(0, 0, 'mapping-invalid'));
          continue;
        }
        let sourceColumn: number | undefined;
        if (typeof entry.source === 'number') {
          sourceColumn = Number.isSafeInteger(entry.source)
            ? entry.source
            : undefined;
        } else if (typeof entry.source === 'string' && header !== undefined) {
          const matches: number[] = [];
          header.forEach((value, index) => {
            if (value === entry.source) matches.push(index);
          });
          if (matches.length === 1) {
            sourceColumn = matches[0];
          } else {
            diagnostics.push(
              importCellDiagnostic(
                0,
                0,
                matches.length === 0 ? 'header-not-found' : 'header-duplicate',
              ),
            );
          }
        } else {
          diagnostics.push(importCellDiagnostic(0, 0, 'source-header-requires-header'));
        }
        if (sourceColumn !== undefined) addMapping(entry.fieldId, sourceColumn, 0);
      }
    } else if (header !== undefined) {
      for (let index = 0; index < header.length; index += 1) {
        const fieldId = fieldIdByLabel.get(header[index]!);
        if (fieldId === undefined) {
          diagnostics.push(importCellDiagnostic(0, index, 'header-not-mapped'));
        } else {
          addMapping(fieldId, index, 0);
        }
      }
    }
    let fieldIds: string[];
    if (requestedFieldIds !== undefined) {
      fieldIds = requestedFieldIds;
      if (mappingInput !== undefined || header !== undefined) {
        for (const fieldId of fieldIds) {
          if (!sourceByFieldId.has(fieldId)) {
            diagnostics.push(importCellDiagnostic(0, 0, 'field-not-mapped', fieldId));
          }
        }
      } else {
        for (let index = 0; index < fieldIds.length && index < width; index += 1) {
          addMapping(fieldIds[index]!, index, 0);
        }
      }
    } else if (sourceByFieldId.size > 0) {
      fieldIds = mappingInput !== undefined
        ? mappingInput
          .filter((entry): entry is BomImportColumnMapping =>
            entry !== null &&
            typeof entry === 'object' &&
            typeof entry.fieldId === 'string' &&
            sourceByFieldId.has(entry.fieldId)
          )
          .map((entry) => entry.fieldId)
        : [...sourceByFieldId.keys()];
    } else {
      const active = this.#selection.activeCell;
      const visible = visibleColumnDefinitions(this.#columns);
      const activeIndex = active === null
        ? 0
        : visible.findIndex((column) => column.columnId === active.columnId);
      fieldIds = (activeIndex < 0 ? visible : visible.slice(activeIndex))
        .slice(0, width)
        .map((column) => findSchemaField(this.#schema, column.fieldPath)?.fieldId)
        .filter((fieldId): fieldId is string => fieldId !== undefined);
      for (let index = 0; index < fieldIds.length && index < width; index += 1) {
        addMapping(fieldIds[index]!, index, 0);
      }
    }
    fieldIds = uniqueStrings(fieldIds);
    if (fieldIds.length === 0) return fail('no-target-fields');
    if (fieldIds.some((fieldId) => !sourceByFieldId.has(fieldId))) {
      return fail('field-not-mapped');
    }
    if (diagnostics.length > 0) return fail('mapping-invalid');
    const target = await this.#buildImportTarget(
      fieldIds,
      dataRows.length,
      state,
      pasteTargetEpoch,
      signal,
    );
    if (target === null) return fail('target-unavailable');
    const hierarchyCommands = this.#buildImportHierarchyCommands(
      options.hierarchy,
      dataRows,
      target,
      sourceByFieldId,
      state,
      diagnostics,
    );
    if (hierarchyCommands === null) return fail('hierarchy-invalid');
    const mappedRows: string[][] = [];
    const sources: ImportRowSource[] = [];
    const sourceColumns = fieldIds.map((fieldId) => sourceByFieldId.get(fieldId)!);
    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      if (signal?.aborted) return fail('aborted');
      const row = dataRows[rowIndex]!;
      mappedRows.push(sourceColumns.map((sourceColumn) => row[sourceColumn]!));
      sources.push(Object.freeze({
        sourceRow: rowIndex + (headerMode === 'firstRow' ? 1 : 0),
        sourceColumns: Object.freeze([...sourceColumns]),
      }));
      if (
        (rowIndex + 1) % PASTE_PREPARATION_YIELD_CELL_INTERVAL === 0 &&
        !(await yieldPastePreparation(signal))
      ) {
        return fail('aborted');
      }
    }
    return {
      ok: true,
      value: Object.freeze({
        rows: Object.freeze(mappedRows.map((row) => Object.freeze(row))),
        sources: Object.freeze(sources),
        fieldIds: Object.freeze(fieldIds),
        target,
        hierarchyCommands: Object.freeze(hierarchyCommands),
      }),
    };
  }

  #buildImportHierarchyCommands(
    hierarchy: Readonly<BomImportHierarchyOptions> | undefined,
    rows: readonly (readonly string[])[],
    target: Readonly<PasteTarget>,
    sourceByFieldId: ReadonlyMap<string, number>,
    state: Readonly<PublishedState<TFields>>,
    diagnostics: BomImportCellDiagnostic[],
  ): readonly BomCommand<TFields>[] | null {
    if (hierarchy === undefined) return Object.freeze([]);
    const parentColumn = hierarchy.parentFieldId === undefined
      ? undefined
      : sourceByFieldId.get(hierarchy.parentFieldId);
    const levelColumn = hierarchy.levelFieldId === undefined
      ? undefined
      : sourceByFieldId.get(hierarchy.levelFieldId);
    if (hierarchy.parentFieldId !== undefined && parentColumn === undefined) {
      diagnostics.push(importCellDiagnostic(0, 0, 'hierarchy-field-not-mapped', hierarchy.parentFieldId));
    }
    if (hierarchy.levelFieldId !== undefined && levelColumn === undefined) {
      diagnostics.push(importCellDiagnostic(0, 0, 'hierarchy-field-not-mapped', hierarchy.levelFieldId));
    }
    if (diagnostics.length > 0 || (parentColumn === undefined && levelColumn === undefined)) {
      return null;
    }
    if (rows.length !== target.occurrenceIds.length) return null;
    const targetIds = new Set(target.occurrenceIds);
    const desiredParents = new Map<OccurrenceId, OccurrenceId | null>();
    const levels: { level: number; occurrenceId: OccurrenceId }[] = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]!;
      const occurrenceId = target.occurrenceIds[rowIndex]!;
      let explicitParent: OccurrenceId | null | undefined;
      if (parentColumn !== undefined) {
        const raw = row[parentColumn];
        if (raw === undefined) return null;
        const trimmed = raw.trim();
        explicitParent = trimmed.length === 0 ? null : trimmed;
        if (
          explicitParent !== null &&
          !state.indexes.rowById.has(explicitParent)
        ) {
          diagnostics.push(importCellDiagnostic(rowIndex, parentColumn, 'hierarchy-parent-not-found', hierarchy.parentFieldId));
          continue;
        }
      }
      let levelParent: OccurrenceId | null | undefined;
      if (levelColumn !== undefined) {
        const raw = row[levelColumn];
        const level = raw === undefined ? Number.NaN : Number(raw.trim());
        if (!Number.isSafeInteger(level) || level < 1) {
          diagnostics.push(importCellDiagnostic(rowIndex, levelColumn, 'hierarchy-level-invalid', hierarchy.levelFieldId));
          continue;
        }
        while (levels.length > 0 && levels.at(-1)!.level >= level) levels.pop();
        if (level > 1) {
          const previous = levels.at(-1);
          if (previous === undefined || previous.level !== level - 1) {
            diagnostics.push(importCellDiagnostic(rowIndex, levelColumn, 'hierarchy-level-gap', hierarchy.levelFieldId));
            continue;
          }
          levelParent = previous.occurrenceId;
        } else {
          levelParent = null;
        }
        levels.push({ level, occurrenceId });
      }
      const parentId = explicitParent !== undefined
        ? explicitParent
        : levelParent ?? null;
      if (explicitParent !== undefined && levelParent !== undefined && explicitParent !== levelParent) {
        diagnostics.push(importCellDiagnostic(rowIndex, parentColumn ?? levelColumn ?? 0, 'hierarchy-parent-level-mismatch', hierarchy.parentFieldId ?? hierarchy.levelFieldId));
        continue;
      }
      if (parentId === occurrenceId || (parentId !== null && !state.indexes.rowById.has(parentId))) {
        diagnostics.push(importCellDiagnostic(rowIndex, parentColumn ?? levelColumn ?? 0, 'hierarchy-parent-invalid', hierarchy.parentFieldId ?? hierarchy.levelFieldId));
        continue;
      }
      desiredParents.set(occurrenceId, parentId);
    }
    if (diagnostics.length > 0) return null;
    for (const occurrenceId of target.occurrenceIds) {
      const seen = new Set<OccurrenceId>();
      let cursor: OccurrenceId | null = occurrenceId;
      while (cursor !== null) {
        if (seen.has(cursor)) return null;
        seen.add(cursor);
        cursor = desiredParents.has(cursor)
          ? desiredParents.get(cursor)!
          : state.indexes.rowById.get(cursor)?.parentId ?? null;
      }
    }
    const commands: BomCommand<TFields>[] = [];
    for (const occurrenceId of target.occurrenceIds) {
      const parentId = desiredParents.get(occurrenceId);
      if (parentId === undefined) return null;
      if (!targetIds.has(occurrenceId)) return null;
      commands.push(Object.freeze({
        type: 'moveSubtree',
        occurrenceId,
        newParentId: parentId,
        placement: Object.freeze({ at: 'last' }),
      }));
    }
    return Object.freeze(commands);
  }

  async #buildImportTarget(
    fieldIds: readonly string[],
    rowCount: number,
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
    signal?: AbortSignal,
  ): Promise<Readonly<PasteTarget> | null> {
    if (
      this.#selection.ranges !== undefined ||
      this.#selection.mode !== undefined
    ) {
      return null;
    }
    const active = this.#selection.activeCell;
    if (active === null) return null;
    const range = this.#selection.range;
    let firstRow: number;
    if (range !== null) {
      const anchor = this.#published.projection.indexOf(range.anchor.occurrenceId);
      const focus = this.#published.projection.indexOf(range.focus.occurrenceId);
      if (
        !anchor.ok ||
        !focus.ok ||
        anchor.value === undefined ||
        focus.value === undefined
      ) return null;
      firstRow = Math.min(anchor.value, focus.value);
      if (Math.abs(anchor.value - focus.value) + 1 !== rowCount) return null;
    } else {
      if (active === null) return null;
      const activeRow = this.#published.projection.indexOf(active.occurrenceId);
      if (!activeRow.ok || activeRow.value === undefined) return null;
      firstRow = activeRow.value;
    }
    const occurrenceIds: OccurrenceId[] = [];
    for (let index = 0; index < rowCount; index += 1) {
      const occurrence = this.#published.projection.occurrenceAt(firstRow + index);
      if (!occurrence.ok || occurrence.value === undefined) return null;
      occurrenceIds.push(occurrence.value);
      if (
        (index + 1) % PASTE_TARGET_YIELD_ROW_INTERVAL === 0 &&
        !(await this.#yieldPasteTarget(signal, state, pasteTargetEpoch))
      ) return null;
    }
    const columns: ClipboardSelectionColumn[] = [];
    for (const fieldId of fieldIds) {
      const field = this.#schema.fields.find((candidate) => candidate.fieldId === fieldId);
      const column = field === undefined
        ? undefined
        : this.#columns.find((candidate) => samePath(candidate.fieldPath, field.path));
      if (field === undefined || column === undefined) return null;
      columns.push(Object.freeze({ column, field }));
    }
    return Object.freeze({
      occurrenceIds: Object.freeze(occurrenceIds),
      columns: Object.freeze(columns),
    });
  }

  public async exportData(
    options: Readonly<BomExportOptions>,
  ): Promise<BomResult<BomExportResult>> {
    const templateExport = options !== null &&
      typeof options === 'object' &&
      options.mode === 'roundTripTemplate';
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    if (
      options === null ||
      typeof options !== 'object' ||
      (options.format !== 'csv' &&
        options.format !== 'tsv' &&
        options.format !== 'xlsx') ||
      (options.mode !== 'currentView' &&
        options.mode !== 'completeData' &&
        options.mode !== 'roundTripTemplate') ||
      (options.rowScope !== 'visible' &&
        options.rowScope !== 'filtered' &&
        options.rowScope !== 'all') ||
      !Array.isArray(options.fieldIds)
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.exportInvalid, 'CONFIG', {
          reason: 'options-invalid',
        }),
      );
    }
    if (options.signal?.aborted) return this.#abortedFailure();
    const startedAt = nowMs();
    const state = this.#published;
    if (
      options.mode === 'completeData' &&
      state.snapshot.completeness !== 'complete'
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.exportInvalid, 'VALIDATION', {
          reason: 'partial-snapshot',
        }),
      );
    }
    if (options.mode === 'completeData' && this.#exportPolicy === undefined) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.exportAuthRequired, 'SECURITY_LIMIT'),
      );
    }
    const fieldIds = uniqueStrings(options.fieldIds);
    if (
      fieldIds.length !== options.fieldIds.length ||
      (!templateExport && fieldIds.length === 0)
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.exportInvalid, 'CONFIG', {
          reason: 'field-ids-invalid',
        }),
      );
    }
    const fields = fieldIds.map((fieldId) =>
      this.#schema.fields.find((field) => field.fieldId === fieldId),
    );
    if (fields.some((field) => field === undefined)) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.exportInvalid, 'CONFIG', {
          reason: 'unknown-field',
        }),
      );
    }
    const taskId = this.#nextTaskId('export');
    const rejectExport = <T>(error: BomError): BomResult<T> => {
      this.#events.dispatch('exportRejected', {
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
        taskId,
        format: options.format,
        mode: options.mode,
        rowScope: options.rowScope,
        fieldIds: Object.freeze([...fieldIds]),
        error,
      });
      return editorFailure(error);
    };
    const completeExport = (
      result: BomResult<BomExportResult>,
    ): BomResult<BomExportResult> => {
      if (result.ok) {
        this.#events.dispatch('exportCompleted', {
          documentId: state.snapshot.documentId,
          documentGeneration: state.documentGeneration,
          taskId,
          format: options.format,
          mode: options.mode,
          effectiveMode: result.value.effectiveMode,
          lossless: result.value.lossless,
          exportedRowCount: result.value.exportedRowCount,
          exportedFieldIds: result.value.exportedFieldIds,
          omittedFieldIds: result.value.omittedFieldIds,
          ...(result.value.policyDecisionId === undefined
            ? {}
            : { policyDecisionId: result.value.policyDecisionId }),
        });
      }
      return result;
    };
    const beforeExport = this.#events.dispatch('beforeExport', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId,
      format: options.format,
      mode: options.mode,
      rowScope: options.rowScope,
      fieldIds: Object.freeze([...fieldIds]),
    });
    if (!beforeExport.ok) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.eventDispatchFailed, 'INTERNAL'),
      );
    }
    if (beforeExport.event.defaultPrevented) {
      return rejectExport(
        editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
      );
    }
    this.#emitExportProgress(taskId, state, 0, 3, 'start');
    let authorization: ExportAuthorization = {
      status: 'allowed',
      allowedFieldIds: new Set(fieldIds),
      maskingByFieldId: new Map(),
    };
    if (this.#exportPolicy !== undefined) {
      let decision: BomExportDecision;
      try {
        decision = await this.#exportPolicy.authorize(options, {
          signal: options.signal ?? new AbortController().signal,
        });
      } catch {
        return rejectExport(
          editorError(BOM_EDITOR_ERROR_CODES.exportPolicy, 'PLUGIN'),
        );
      }
      authorization = normalizeExportDecision(decision, fieldIds);
      if (authorization.status === 'invalid') {
        return rejectExport(
          editorError(BOM_EDITOR_ERROR_CODES.exportPolicy, 'PLUGIN', {
            reason: 'invalid-decision',
          }),
        );
      }
      if (authorization.status === 'denied') {
        return rejectExport(
          editorError(BOM_EDITOR_ERROR_CODES.exportPolicy, 'SECURITY_LIMIT', {
            reason: authorization.reasonCode ?? 'denied',
          }),
        );
      }
    }
    if (options.signal?.aborted) {
      return rejectExport(editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'));
    }
    if (templateExport) {
      this.#emitExportProgress(taskId, state, 1, 3, 'serialize');
      const encoded = serializeBomViewTemplate(
        this.getViewTemplate(),
        this.#schema.schemaVersion,
        Object.freeze({
          exportMode: 'roundTripTemplate',
          rowScope: options.rowScope,
        }),
      );
      if (!encoded.ok) {
        return rejectExport(
          editorError(BOM_EDITOR_ERROR_CODES.exportInvalid, 'VALIDATION', {
            reason: 'template-encode-failed',
          }),
        );
      }
      if (boundedUtf8ByteLength(encoded.value, this.#pasteLimits.maxBytes) > this.#pasteLimits.maxBytes) {
        return rejectExport(
          editorError(BOM_EDITOR_ERROR_CODES.exportLimit, 'SECURITY_LIMIT', {
            reason: 'output-too-large',
          }),
        );
      }
      this.#emitExportProgress(taskId, state, 2, 3, 'serialize');
      this.#emitExportProgress(taskId, state, 3, 3, 'complete');
      const exportedFieldIds = uniqueStrings(
        this.#columns.map((column) =>
          findSchemaField(this.#schema, column.fieldPath)?.fieldId,
        ).filter((fieldId): fieldId is string => fieldId !== undefined),
      );
      return completeExport(editorSuccess(Object.freeze({
        taskId,
        blob: new Blob([encoded.value], { type: 'application/json;charset=utf-8' }),
        effectiveMode: 'roundTripTemplate' as const,
        lossless: true,
        exportedRowCount: 0,
        exportedFieldIds: Object.freeze(exportedFieldIds),
        omittedFieldIds: Object.freeze([]),
        maskingSummary: Object.freeze({}),
        warnings: Object.freeze([]),
      })));
    }
    const occurrenceIds = options.rowScope === 'all'
      ? state.snapshot.nodes.map((node) => node.occurrenceId)
      : state.projection.toArray();
    const omittedFieldIds = fieldIds.filter((fieldId) =>
      !authorization.allowedFieldIds.has(fieldId));
    const maskingSummary: Record<string, 'redact' | 'hash'> = {};
    for (const [fieldId, masking] of authorization.maskingByFieldId) {
      if (masking === 'redact' || masking === 'hash') {
        maskingSummary[fieldId] = masking;
      }
    }
    if (options.format === 'xlsx') {
      const rows: string[][] = [];
      for (let rowIndex = 0; rowIndex < occurrenceIds.length; rowIndex += 1) {
        if (options.signal?.aborted) {
          return rejectExport(editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'));
        }
        const node = state.indexes.rowById.get(occurrenceIds[rowIndex]!);
        if (node === undefined) {
          return rejectExport(
            editorError(BOM_EDITOR_ERROR_CODES.exportInvalid, 'CONFLICT', {
              reason: 'selection-stale',
            }),
          );
        }
        rows.push(fieldIds.map((fieldId, columnIndex) => {
          if (!authorization.allowedFieldIds.has(fieldId)) return '';
          const field = fields[columnIndex]!;
          return clipboardCellText(
            fieldValue(node.fields, field.path),
            fieldId,
            authorization.maskingByFieldId.get(fieldId),
          );
        }));
        if ((rowIndex + 1) % 256 === 0 || rowIndex + 1 === occurrenceIds.length) {
          this.#emitExportProgress(taskId, state, 1, 3, 'serialize');
          await yieldSearchWork();
        }
      }
      const generated = createXlsxWorkbook(rows, {
        maxBytes: this.#pasteLimits.maxBytes,
        maxCellBytes: this.#pasteLimits.maxCellBytes,
      });
      if (!generated.ok) {
        return rejectExport(
          editorError(
            generated.reason === 'cell-too-large'
              ? BOM_EDITOR_ERROR_CODES.exportLimit
              : BOM_EDITOR_ERROR_CODES.exportLimit,
            'SECURITY_LIMIT',
            { reason: generated.reason },
          ),
        );
      }
      this.#emitExportProgress(taskId, state, 2, 3, 'serialize');
      if (options.signal?.aborted) {
        return rejectExport(editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'));
      }
      this.#emitExportProgress(taskId, state, 3, 3, 'complete');
      const transformed = omittedFieldIds.length > 0 || Object.keys(maskingSummary).length > 0;
      const lossless = options.mode === 'completeData' &&
        options.rowScope === 'all' &&
        !transformed &&
        fieldIds.length === this.#schema.fields.length;
      return completeExport(editorSuccess(Object.freeze({
        taskId,
        blob: new Blob([generated.bytes.buffer as ArrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        effectiveMode: transformed ? 'policyTransformed' : options.mode,
        lossless,
        ...(authorization.decisionId === undefined ? {} : { policyDecisionId: authorization.decisionId }),
        exportedRowCount: occurrenceIds.length,
        exportedFieldIds: Object.freeze(fieldIds.filter((fieldId) => authorization.allowedFieldIds.has(fieldId))),
        omittedFieldIds: Object.freeze(omittedFieldIds),
        maskingSummary: Object.freeze(maskingSummary),
        warnings: Object.freeze([]),
      })));
    }
    const delimiter = options.format === 'csv' ? ',' : '\t';
    const lines: string[] = [];
    for (let rowIndex = 0; rowIndex < occurrenceIds.length; rowIndex += 1) {
      if (options.signal?.aborted) {
        return rejectExport(editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'));
      }
      const node = state.indexes.rowById.get(occurrenceIds[rowIndex]!);
      if (node === undefined) {
        return rejectExport(
          editorError(BOM_EDITOR_ERROR_CODES.exportInvalid, 'CONFLICT', {
            reason: 'selection-stale',
          }),
        );
      }
      const cells: string[] = [];
      for (let columnIndex = 0; columnIndex < fieldIds.length; columnIndex += 1) {
        const fieldId = fieldIds[columnIndex]!;
        const field = fields[columnIndex]!;
        const masking = authorization.maskingByFieldId.get(fieldId);
        const value = fieldValue(node.fields, field.path);
        let cell = clipboardCellText(value, fieldId, masking);
        if ((options.csvFormulaProtection ?? 'safe') === 'safe') {
          cell = safeSpreadsheetText(cell);
        }
        if (boundedUtf8ByteLength(cell, this.#pasteLimits.maxCellBytes) > this.#pasteLimits.maxCellBytes) {
          return rejectExport(
            editorError(BOM_EDITOR_ERROR_CODES.exportLimit, 'SECURITY_LIMIT', {
              reason: 'cell-too-large',
            }),
          );
        }
        cells.push(
          authorization.allowedFieldIds.has(fieldId)
            ? escapeDelimitedCell(cell, delimiter)
            : '',
        );
      }
      lines.push(cells.join(delimiter));
      if ((rowIndex + 1) % 256 === 0 || rowIndex + 1 === occurrenceIds.length) {
        this.#emitExportProgress(taskId, state, 1, 3, 'serialize');
        await yieldSearchWork();
      }
    }
    this.#emitExportProgress(taskId, state, 2, 3, 'serialize');
    const text = lines.join('\r\n');
    if (boundedUtf8ByteLength(text, this.#pasteLimits.maxBytes) > this.#pasteLimits.maxBytes) {
      return rejectExport(
        editorError(BOM_EDITOR_ERROR_CODES.exportLimit, 'SECURITY_LIMIT', {
          reason: 'output-too-large',
        }),
      );
    }
    if (options.signal?.aborted) {
      return rejectExport(editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'));
    }
    this.#emitExportProgress(taskId, state, 3, 3, 'complete');
    const transformed = omittedFieldIds.length > 0 ||
      Object.keys(maskingSummary).length > 0;
    const lossless = options.mode === 'completeData' &&
      options.rowScope === 'all' &&
      !transformed &&
      fieldIds.length === this.#schema.fields.length;
    const blob = new Blob([text], {
      type: options.format === 'csv'
        ? 'text/csv;charset=utf-8'
        : 'text/tab-separated-values;charset=utf-8',
    });
    return completeExport(editorSuccess(Object.freeze({
      taskId,
      blob,
      effectiveMode: transformed ? 'policyTransformed' : options.mode,
      lossless,
      ...(authorization.decisionId === undefined
        ? {}
        : { policyDecisionId: authorization.decisionId }),
      exportedRowCount: occurrenceIds.length,
      exportedFieldIds: Object.freeze(fieldIds.filter((fieldId) =>
        authorization.allowedFieldIds.has(fieldId))),
      omittedFieldIds: Object.freeze(omittedFieldIds),
      maskingSummary: Object.freeze(maskingSummary),
      warnings: Object.freeze([]),
    })));
  }

  public async search(
    request: Readonly<BomSearchRequest>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomResult<BomSearchResult>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    const normalized = normalizeSearchRequest(request);
    if (normalized === null) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    if (normalized === 'invalid-regex') {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.searchRegexInvalid, 'CONFIG'));
    }
    if (options.signal?.aborted) return this.#abortedFailure();
    const startedAt = nowMs();
    const state = this.#published;
    const taskId = this.#nextTaskId('search');
    const matches: BomSearchMatch[] = [];
    const nodes = state.snapshot.nodes;
    for (let index = 0; index < nodes.length; index += 1) {
      if (options.signal?.aborted || this.#isDestroyedOrDestroying()) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      const match = matchSearchNode(nodes[index]!, normalized);
      if (match !== null) {
        matches.push(match);
      }
      if ((index + 1) % 256 === 0) {
        this.#emitSearchProgress(taskId, state, index + 1, nodes.length);
        await yieldSearchWork();
      }
    }
    this.#emitSearchProgress(taskId, state, nodes.length, nodes.length);
    matches.sort((left, right) =>
      right.score - left.score || left.occurrenceId.localeCompare(right.occurrenceId));
    this.#recordMetric('search.duration', nowMs() - startedAt, 'ms');
    this.#recordMetric('search.matches', matches.length, 'count');
    return editorSuccess(Object.freeze({
      matches: Object.freeze(matches.slice(0, normalized.limit)),
      totalMatches: matches.length,
      truncated: matches.length > normalized.limit,
      indexRevision: state.snapshot.revision,
    }));
  }

  public async matchMaterials(
    request: Readonly<BomMaterialMatchRequest<TFields>>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomResult<BomMaterialMatchResult>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    const normalized = normalizeMaterialMatchRequest<TFields>(request);
    if (normalized === null) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
        option: 'matchMaterials',
      }));
    }
    if (options.signal?.aborted) return this.#abortedFailure();

    const startedAt = nowMs();
    const state = this.#published;
    const taskId = this.#nextTaskId('match');
    const nodes = state.snapshot.nodes;
    const retainedLimit = Math.max(2, normalized.limit);
    const matches: BomMaterialMatchCandidate[] = [];
    let totalCandidates = 0;
    const { selection: _selection, ...candidateOptions } = normalized;
    this.#emitMatchProgress(taskId, state, 0, nodes.length, 'start');

    for (let start = 0; start < nodes.length; start += 256) {
      if (options.signal?.aborted || this.#isDestroyedOrDestroying()) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      if (this.#published !== state) {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.matchStale, 'CONFLICT'));
      }
      const end = Math.min(nodes.length, start + 256);
      const chunkSnapshot: BomDocumentSnapshot<TFields> = Object.freeze({
        ...state.snapshot,
        nodes: Object.freeze(nodes.slice(start, end)),
      });
      const chunk = matchBomMaterials(chunkSnapshot, Object.freeze({
        ...candidateOptions,
        limit: retainedLimit,
      }));
      totalCandidates += chunk.totalCandidates;
      matches.push(...chunk.matches);
      matches.sort(compareMaterialMatchCandidates);
      if (matches.length > retainedLimit) matches.length = retainedLimit;
      this.#emitMatchProgress(
        taskId,
        state,
        end,
        nodes.length,
        end >= nodes.length ? 'complete' : 'scan',
      );
      if (end < nodes.length) await yieldSearchWork();
    }

    if (options.signal?.aborted || this.#isDestroyedOrDestroying()) {
      return this.#isDestroyedOrDestroying()
        ? this.#destroyedFailure()
        : this.#abortedFailure();
    }
    if (this.#published !== state) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.matchStale, 'CONFLICT'));
    }
    if (nodes.length === 0) {
      this.#emitMatchProgress(taskId, state, 0, 0, 'complete');
    }
    const selection = resolveMaterialMatchSelection(
      matches[0],
      matches[1],
      normalized.selection,
    );
    this.#recordMetric('match.duration', nowMs() - startedAt, 'ms');
    this.#recordMetric('match.candidates', totalCandidates, 'count');
    const result = Object.freeze({
      algorithmVersion: BOM_MATCH_ALGORITHM_VERSION,
      indexRevision: state.snapshot.revision,
      matches: Object.freeze(matches.slice(0, normalized.limit)),
      totalCandidates,
      selectionStatus: selection.status,
      ...(selection.selectedOccurrenceId === undefined
        ? {}
        : { selectedOccurrenceId: selection.selectedOccurrenceId }),
    });
    for (const candidate of result.matches) {
      this.#materialMatchCandidates.set(candidate, Object.freeze({
        state,
        candidateOccurrenceId: candidate.occurrenceId,
        algorithmVersion: result.algorithmVersion,
        score: candidate.score,
        confidence: candidate.confidence,
      }));
    }
    return editorSuccess(result);
  }

  public proposeMaterialMatch(
    targetOccurrenceId: OccurrenceId,
    candidate: Readonly<BomMaterialMatchCandidate>,
  ): BomResult<Readonly<BomMaterialMatchProposal>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    if (
      typeof targetOccurrenceId !== 'string' ||
      targetOccurrenceId.length === 0 ||
      typeof candidate !== 'object' ||
      candidate === null
    ) {
      return editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
        'VALIDATION',
        { reason: 'candidate-invalid' },
      ));
    }
    let context: MaterialMatchCandidateContext<TFields> | undefined;
    try {
      context = this.#materialMatchCandidates.get(candidate);
    } catch {
      context = undefined;
    }
    if (context === undefined) {
      return editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
        'VALIDATION',
        { reason: 'candidate-not-issued' },
      ));
    }
    if (context.state !== this.#published) {
      return editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchStale,
        'CONFLICT',
      ));
    }
    const target = this.#published.indexes.rowById.get(targetOccurrenceId);
    const source = this.#published.indexes.rowById.get(
      context.candidateOccurrenceId,
    );
    if (
      target === undefined ||
      source === undefined ||
      target.kind !== 'material' ||
      source.kind !== 'material' ||
      target.occurrenceId === source.occurrenceId ||
      !hasMaterialReference(source)
    ) {
      return editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
        'VALIDATION',
        { reason: 'material-target-invalid' },
      ));
    }
    this.#materialMatchProposalSequence += 1;
    const proposalId = 'material-match:' +
      String(this.#materialMatchProposalSequence);
    const proposal = Object.freeze({
      proposalId,
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      baseRevision: this.#published.snapshot.revision,
      targetOccurrenceId: target.occurrenceId,
      candidateOccurrenceId: source.occurrenceId,
      algorithmVersion: context.algorithmVersion,
      score: context.score,
      confidence: context.confidence,
    });
    this.#materialMatchProposals.set(proposalId, {
      proposal,
      status: 'active',
    });
    this.#trimMaterialMatchProposals();
    this.#emitMaterialMatchAudit(proposal, 'proposed');
    return editorSuccess(proposal);
  }

  public applyMaterialMatch(
    proposal: Readonly<BomMaterialMatchProposal>,
    options: Readonly<BomMaterialMatchApplyOptions> = {},
  ): Promise<BomResult<BomCommit<TFields>>> {
    if (this.#isDestroyedOrDestroying()) {
      return Promise.resolve(this.#destroyedFailure());
    }
    let proposalId: string | undefined;
    try {
      if (typeof proposal !== 'object' || proposal === null) {
        return Promise.resolve(editorFailure(editorError(
          BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
          'VALIDATION',
          { reason: 'proposal-invalid' },
        )));
      }
      proposalId = proposal.proposalId;
    } catch {
      return Promise.resolve(editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
        'VALIDATION',
        { reason: 'proposal-invalid' },
      )));
    }
    const issued = typeof proposalId === 'string'
      ? this.#materialMatchProposals.get(proposalId)
      : undefined;
    if (issued === undefined || issued.proposal !== proposal) {
      return Promise.resolve(editorFailure(editorError(
        issued === undefined && proposalId !== undefined &&
            this.#expiredMaterialMatchProposalIds.has(proposalId)
          ? BOM_EDITOR_ERROR_CODES.materialMatchStale
          : BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
        'CONFLICT',
      )));
    }
    if (issued.status !== 'active') {
      return Promise.resolve(editorFailure(editorError(
        issued.status === 'stale'
          ? BOM_EDITOR_ERROR_CODES.materialMatchStale
          : BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
        'CONFLICT',
      )));
    }
    if (!this.#isCurrentMaterialMatchProposal(proposal)) {
      issued.status = 'stale';
      this.#emitMaterialMatchAudit(proposal, 'stale', {
        reasonCode: 'stale-document',
      });
      return Promise.resolve(editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchStale,
        'CONFLICT',
      )));
    }
    if (options.signal?.aborted) {
      this.#emitMaterialMatchAudit(proposal, 'cancelled', {
        reasonCode: 'aborted',
      });
      return Promise.resolve(this.#abortedFailure());
    }
    issued.status = 'approvalPending';
    return this.#approveAndApplyMaterialMatch(issued, options);
  }

  async #approveAndApplyMaterialMatch(
    issued: IssuedMaterialMatchProposal<TFields>,
    options: Readonly<BomMaterialMatchApplyOptions>,
  ): Promise<BomResult<BomCommit<TFields>>> {
    const proposal = issued.proposal;
    let authorization: MaterialMatchAuthorization;
    if (this.#matchApprovalPolicy === undefined) {
      authorization = normalizeMaterialMatchApproval(DEFAULT_MATERIAL_MATCH_DECISION);
    } else {
      const policySignal = options.signal ?? new AbortController().signal;
      let waited: MaterialMatchApprovalWaitResult;
      try {
        const pending = Promise.resolve().then(() =>
          this.#matchApprovalPolicy!.authorize(proposal, {
            signal: policySignal,
          }),
        );
        waited = await awaitMaterialMatchApproval(pending, options.signal);
      } catch {
        waited = { status: 'rejected' };
      }
      if (waited.status === 'aborted') {
        if (issued.status === 'approvalPending') issued.status =
          this.#isCurrentMaterialMatchProposal(proposal) ? 'active' : 'stale';
        this.#emitMaterialMatchAudit(proposal, 'cancelled', {
          reasonCode: 'aborted',
        });
        return this.#abortedFailure();
      }
      if (waited.status === 'rejected') {
        if (issued.status === 'approvalPending') issued.status = 'active';
        this.#emitMaterialMatchAudit(proposal, 'failed', {
          reasonCode: 'policy-failed',
        });
        return editorFailure(editorError(
          BOM_EDITOR_ERROR_CODES.materialMatchPolicy,
          'PLUGIN',
        ));
      }
      authorization = normalizeMaterialMatchApproval(waited.value);
    }

    if (options.signal?.aborted) {
      if (issued.status === 'approvalPending') issued.status =
        this.#isCurrentMaterialMatchProposal(proposal) ? 'active' : 'stale';
      this.#emitMaterialMatchAudit(proposal, 'cancelled', {
        reasonCode: 'aborted',
      });
      return this.#abortedFailure();
    }
    if (!this.#isCurrentMaterialMatchProposal(proposal) || issued.status !== 'approvalPending') {
      if (issued.status === 'approvalPending') issued.status = 'stale';
      this.#emitMaterialMatchAudit(proposal, 'stale', {
        reasonCode: 'stale-document',
      });
      return editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchStale,
        'CONFLICT',
      ));
    }
    if (authorization.status === 'invalid') {
      issued.status = 'active';
      this.#emitMaterialMatchAudit(proposal, 'failed', {
        reasonCode: 'policy-invalid',
      });
      return editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchPolicy,
        'PLUGIN',
      ));
    }
    if (authorization.status === 'denied') {
      issued.status = 'active';
      this.#emitMaterialMatchAudit(proposal, 'denied', {
        decisionId: authorization.decisionId,
        ...(authorization.reasonCode === undefined
          ? {}
          : { reasonCode: authorization.reasonCode }),
      });
      return editorFailure(editorError(
        BOM_EDITOR_ERROR_CODES.materialMatchDenied,
        'VALIDATION',
        {
          decisionId: authorization.decisionId,
          ...(authorization.reasonCode === undefined
            ? {}
            : { reason: authorization.reasonCode }),
        },
      ));
    }

    this.#emitMaterialMatchAudit(proposal, 'approved', {
      decisionId: authorization.decisionId,
    });
    const queued = await this.#enqueue<BomCommit<TFields>>(
      async (): Promise<BomResult<BomCommit<TFields>>> => {
      if (options.signal?.aborted) return this.#abortedFailure();
      const current = this.#materialMatchProposals.get(proposal.proposalId);
      if (
        current !== issued ||
        issued.status !== 'approvalPending' ||
        !this.#isCurrentMaterialMatchProposal(proposal)
      ) {
        if (issued.status === 'approvalPending') issued.status = 'stale';
        this.#emitMaterialMatchAudit(proposal, 'stale', {
          reasonCode: 'stale-document',
        });
        return editorFailure(editorError(
          BOM_EDITOR_ERROR_CODES.materialMatchStale,
          'CONFLICT',
        ));
      }
      const target = this.#published.indexes.rowById.get(
        proposal.targetOccurrenceId,
      );
      const source = this.#published.indexes.rowById.get(
        proposal.candidateOccurrenceId,
      );
      if (
        target === undefined ||
        source === undefined ||
        target.kind !== 'material' ||
        source.kind !== 'material' ||
        target.occurrenceId === source.occurrenceId ||
        !hasMaterialReference(source)
      ) {
        issued.status = 'stale';
        this.#emitMaterialMatchAudit(proposal, 'invalid', {
          reasonCode: 'material-target-invalid',
        });
        return editorFailure(editorError(
          BOM_EDITOR_ERROR_CODES.materialMatchInvalid,
          'VALIDATION',
          { reason: 'material-target-invalid' },
        ));
      }
      const persistence = this.#persistenceForMutation();
      if (!persistence.ok) return editorFailure(persistence.error);
      const transactionId = this.#nextTransactionId('material-match');
      const originSuffix = typeof options.origin === 'string' &&
          options.origin.length > 0
        ? ':' + options.origin
        : '';
      const origin = 'editor:material-match:' + proposal.proposalId + originSuffix;
      const attempt = this.#attempt(transactionId, origin);
      const metadata = this.#persistenceMetadata(
        persistence.value,
        transactionId,
      );
      const command: BomCommand<TFields> = Object.freeze({
        type: 'setMaterialRef',
        occurrenceId: proposal.targetOccurrenceId,
        ...(source.materialId === undefined ? {} : { materialId: source.materialId }),
        ...(source.materialRevision === undefined
          ? {}
          : { materialRevision: source.materialRevision }),
        ...(source.materialCode === undefined ? {} : { materialCode: source.materialCode }),
      });
      const batch: BomCommandBatch<TFields> = Object.freeze({
        protocolVersion: this.#protocolVersion,
        documentId: proposal.documentId,
        documentGeneration: proposal.documentGeneration,
        baseRevision: proposal.baseRevision,
        transactionId,
        origin,
        timestamp: new Date().toISOString(),
        label: 'material-match',
        ...(metadata === undefined ? {} : metadata),
        commands: Object.freeze([command]),
      });
      issued.status = 'applying';
      this.#resetPreparation();
      const result = await this.#engine.executeBatch(batch);
      const committed = await this.#finishLocalTransaction(result, attempt, {
        session: persistence.value,
        commands: Object.freeze([command]),
      });
      if (!committed.ok) {
        issued.status = this.#isCurrentMaterialMatchProposal(proposal)
          ? 'active'
          : 'stale';
        return committed;
      }
      issued.status = 'applied';
      return committed;
      },
      options.signal,
    );
    if (!queued.ok) {
      if (queued.error.code === BOM_EDITOR_ERROR_CODES.aborted) {
        if (issued.status === 'approvalPending') issued.status =
          this.#isCurrentMaterialMatchProposal(proposal) ? 'active' : 'stale';
        this.#emitMaterialMatchAudit(proposal, 'cancelled', {
          reasonCode: 'aborted',
        });
      } else if (issued.status === 'approvalPending') {
        issued.status = this.#isCurrentMaterialMatchProposal(proposal)
          ? 'active'
          : 'stale';
        const reasonCode = safeAuditToken(queued.error.code);
        this.#emitMaterialMatchAudit(
          proposal,
          'failed',
          reasonCode === undefined ? {} : { reasonCode },
        );
      }
      return queued;
    }
    this.#emitMaterialMatchAudit(
      proposal,
      'applied',
      Object.freeze({
        ...(authorization.status === 'allowed'
          ? { decisionId: authorization.decisionId }
          : {}),
        transactionId: queued.value.transactionId,
      }),
    );
    return queued;
  }

  #isCurrentMaterialMatchProposal(
    proposal: Readonly<BomMaterialMatchProposal>,
  ): boolean {
    const state = this.#published;
    return proposal.documentId === state.snapshot.documentId &&
      proposal.documentGeneration === state.documentGeneration &&
      proposal.baseRevision === state.snapshot.revision;
  }

  public async validate(
    options: Readonly<BomValidationOptions> = {},
  ): Promise<BomResult<BomValidationReport>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    const scope = options.scope ?? 'document';
    if (scope !== 'document' && scope !== 'visible' && scope !== 'selection') {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
        option: 'validate.scope',
      }));
    }
    if (options.signal?.aborted) return this.#abortedFailure();

    const startedAt = nowMs();
    const state = this.#published;
    const pluginGeneration = this.#pluginGeneration;
    const taskId = this.#nextTaskId('validate');
    const occurrenceIds = this.#validationOccurrenceIds(scope, state);
    const validationOccurrenceIds = new Set(occurrenceIds);
    const total = occurrenceIds.length;
    const issues: BomValidationIssue[] = [];
    this.#emitValidationProgress(taskId, state, 0, total, 'start');

    // The normalized Snapshot already passed the model gate. Re-checking the
    // same rules here gives callers a stable, value-free diagnostic stream and
    // keeps validation useful after a plugin or external source is attached.
    const indexResult = buildBomIndexes(state.snapshot);
    if (!indexResult.ok) {
      for (const error of indexResult.errors) {
        issues.push(validationIssue(
          error,
          undefined,
          undefined,
          'core.snapshot',
          issues.length,
        ));
      }
    }

    for (let index = 0; index < occurrenceIds.length; index += 1) {
      if (options.signal?.aborted || this.#isDestroyedOrDestroying()) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      const occurrenceId = occurrenceIds[index]!;
      const node = state.indexes.rowById.get(occurrenceId);
      if (node === undefined) {
        issues.push(validationIssue(
          editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'DATA'),
          occurrenceId,
          undefined,
          'core.occurrence',
          issues.length,
        ));
      } else {
        this.#validateNodeFields(node, issues);
      }
      if ((index + 1) % 256 === 0 || index + 1 === total) {
        this.#emitValidationProgress(
          taskId,
          state,
          index + 1,
          total,
          index + 1 >= total ? 'complete' : 'scan',
        );
        await yieldSearchWork();
        if (!this.#isValidationCurrent(state, pluginGeneration)) {
          return this.#isDestroyedOrDestroying()
            ? this.#destroyedFailure()
            : this.#validationStaleFailure();
        }
      }
    }

    const pluginSignal = options.signal ?? new AbortController().signal;
    for (const [pluginKey, registered] of [...this.#pluginValidators.entries()]
      .sort(([left], [right]) => compareUtf8(left, right))) {
      if (pluginSignal.aborted || this.#isDestroyedOrDestroying()) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      if (!this.#isValidationCurrent(state, pluginGeneration)) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#validationStaleFailure();
      }
      const separator = pluginKey.indexOf('/');
      const pluginId = separator < 1 ? undefined : pluginKey.slice(0, separator);
      const entry = pluginId === undefined ? undefined : this.#plugins.get(pluginId);
      if (
        entry === undefined ||
        entry.validators.get(registered.ruleId) !== registered ||
        !hasPermission(entry.grantedPermissions, 'document:read')
      ) {
        return this.#validationStaleFailure();
      }
      const pluginResult = await this.#runPluginHook(
        entry.runtime,
        options.signal,
        { pluginId: entry.manifest.id, name: 'validator' },
        (pluginHookSignal) => registered.validator.validate(Object.freeze({
          snapshot: state.snapshot,
          schema: hasPermission(entry.grantedPermissions, 'schema:read')
            ? this.#schema
            : undefined,
          scope,
          occurrenceIds: Object.freeze([...occurrenceIds]),
          signal: pluginHookSignal,
        })),
      );
      if (!this.#isValidationCurrent(state, pluginGeneration)) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#validationStaleFailure();
      }
      if (pluginResult.status === 'aborted') {
        return options.signal?.aborted
          ? this.#abortedFailure()
          : this.#validationStaleFailure();
      }
      if (pluginResult.status === 'timeout') {
        return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.pluginTimeout, 'PLUGIN'));
      }
      if (pluginResult.status !== 'fulfilled') {
        issues.push(validationIssue(
          editorError(BOM_EDITOR_ERROR_CODES.pluginFailed, 'PLUGIN'),
          undefined,
          undefined,
          pluginKey + '.validator',
          issues.length,
        ));
        continue;
      }
      const pluginIssues = pluginResult.value;
      if (!Array.isArray(pluginIssues)) {
        issues.push(validationIssue(
          editorError(BOM_EDITOR_ERROR_CODES.pluginFailed, 'PLUGIN'),
          undefined,
          undefined,
          pluginKey + '.validator',
          issues.length,
        ));
        continue;
      }
      const normalized = normalizePluginValidationIssues(
        pluginIssues,
        pluginKey,
        registered,
        state.indexes.rowById,
        validationOccurrenceIds,
        this.#schema,
      );
      if (normalized === null) {
        issues.push(validationIssue(
          editorError(BOM_EDITOR_ERROR_CODES.pluginFailed, 'PLUGIN'),
          undefined,
          undefined,
          pluginKey + '.validator',
          issues.length,
        ));
        continue;
      }
      issues.push(...normalized);
    }

    if (!this.#isValidationCurrent(state, pluginGeneration)) {
      return this.#isDestroyedOrDestroying()
        ? this.#destroyedFailure()
        : this.#validationStaleFailure();
    }

    if (total === 0) {
      this.#emitValidationProgress(taskId, state, 0, 0, 'complete');
    }
    this.#recordMetric('validate.duration', nowMs() - startedAt, 'ms');
    this.#recordMetric('validate.issues', issues.length, 'count');
    const report = Object.freeze({
      taskId,
      documentRevision: state.snapshot.revision,
      scope,
      checkedNodeCount: total,
      totalNodeCount: state.snapshot.nodes.length,
      valid: issues.length === 0,
      issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
    });
    this.#publishValidationChanged(state, report);
    return editorSuccess(report);
  }

  #currentValidatedIssue(
    issue: Readonly<BomValidationIssue>,
  ): Readonly<BomValidationIssue> | undefined {
    if (
      typeof issue !== 'object' || issue === null ||
      typeof issue.issueId !== 'string' || typeof issue.ruleId !== 'string'
    ) {
      return undefined;
    }
    const state = this.#published;
    for (const report of this.#validationState.values()) {
      if (
        report.documentId !== state.snapshot.documentId ||
        report.documentGeneration !== state.documentGeneration ||
        report.documentRevision !== state.snapshot.revision
      ) {
        continue;
      }
      for (const candidate of report.issues) {
        if (
          candidate.issueId === issue.issueId &&
          candidate.ruleId === issue.ruleId &&
          sameValidationIssues([candidate], [issue])
        ) {
          return candidate;
        }
      }
    }
    return undefined;
  }

  #isValidationCurrent(
    state: Readonly<PublishedState<TFields>>,
    pluginGeneration: number,
  ): boolean {
    return this.#published === state && this.#pluginGeneration === pluginGeneration;
  }

  #publishValidationChanged(
    state: Readonly<PublishedState<TFields>>,
    report: Readonly<BomValidationReport>,
  ): void {
    const previous = this.#validationState.get(report.scope);
    const sameDocument = previous !== undefined &&
      previous.documentId === state.snapshot.documentId &&
      previous.documentGeneration === state.documentGeneration &&
      previous.documentRevision === report.documentRevision;
    if (
      sameDocument &&
      previous !== undefined &&
      previous.valid === report.valid &&
      sameValidationIssues(previous.issues, report.issues)
    ) {
      this.#validationState.set(report.scope, Object.freeze({
        ...previous,
        taskId: report.taskId,
      }));
      return;
    }
    this.#validationState.set(report.scope, Object.freeze({
      taskId: report.taskId,
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      documentRevision: report.documentRevision,
      scope: report.scope,
      checkedNodeCount: report.checkedNodeCount,
      totalNodeCount: report.totalNodeCount,
      valid: report.valid,
      issues: report.issues,
    }));
    if (this.#isDestroyedOrDestroying()) return;
    this.#announceValidationSummary(report);
    this.#events.dispatch('validationChanged', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId: report.taskId,
      scope: report.scope,
      documentRevision: report.documentRevision,
      checkedNodeCount: report.checkedNodeCount,
      totalNodeCount: report.totalNodeCount,
      valid: report.valid,
      issueCount: report.issues.length,
      issues: report.issues,
      ...(sameDocument && previous !== undefined
        ? { previousIssueCount: previous.issues.length }
        : {}),
    });
  }

  #announceValidationSummary(
    report: Readonly<BomValidationReport>,
  ): void {
    const renderer = this.#renderer;
    if (renderer === null) return;
    const labels = this.#presentation.labels.liveRegion;
    const template = report.valid
      ? labels?.validationCompleted
      : labels?.validationIssuesFound;
    if (template === undefined || template.trim().length === 0) return;
    const message = report.valid
      ? template
      : template.replaceAll('{count}', String(report.issues.length));
    if (message.trim().length === 0) return;
    renderer.announce({ message, politeness: 'polite' });
  }

  #validationOccurrenceIds(
    scope: BomValidationScope,
    state: Readonly<PublishedState<TFields>>,
  ): readonly OccurrenceId[] {
    if (scope === 'document') return state.snapshot.nodes.map((node) => node.occurrenceId);
    if (scope === 'visible') return state.projection.toArray();
    const ids = new Set<OccurrenceId>();
    for (const range of selectionRanges(this.#selection)) {
      const anchor = state.projection.indexOf(range.anchor.occurrenceId);
      const focus = state.projection.indexOf(range.focus.occurrenceId);
      if (!anchor.ok || anchor.value === undefined || !focus.ok || focus.value === undefined) {
        continue;
      }
      const first = Math.min(anchor.value, focus.value);
      const last = Math.max(anchor.value, focus.value);
      for (let index = first; index <= last; index += 1) {
        const occurrence = state.projection.occurrenceAt(index);
        if (occurrence.ok && occurrence.value !== undefined) ids.add(occurrence.value);
      }
    }
    return Object.freeze([...ids]);
  }

  #validateNodeFields(
    node: Readonly<BomNode<TFields>>,
    issues: BomValidationIssue[],
  ): void {
    for (const field of this.#schema.fields) {
      const lookup = readNestedField(node.fields, field.path);
      if (!lookup.present) {
        if (field.required) {
          issues.push(validationIssue(
            modelError(
              BOM_MODEL_ERROR_CODES.fieldRequired,
              'VALIDATION',
              ['fields', ...field.path],
              { fieldId: field.fieldId },
            ),
            node.occurrenceId,
            field.path,
            'schema.required-field',
            issues.length,
          ));
        }
        continue;
      }
      const result = normalizeFieldValue(
        lookup.value,
        field,
        ['fields', ...field.path],
      );
      if (!result.ok) {
        for (const error of result.errors) {
          issues.push(validationIssue(
            error,
            node.occurrenceId,
            field.path,
            'schema.field-value',
            issues.length,
          ));
        }
      }
    }
  }

  public focusCell(address: Readonly<BomCellAddress>): BomResult<void> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    if (!this.#published.indexes.rowById.has(address.occurrenceId)) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const column = this.#columns.find((entry) => entry.columnId === address.columnId);
    if (column === undefined || column.visible === false) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const firstColumn = this.#columns.find((entry) => entry.visible !== false);
    if (firstColumn === undefined) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const ancestors: OccurrenceId[] = [];
    let node = this.#published.indexes.rowById.get(address.occurrenceId);
    while (node !== undefined && node.parentId !== null) {
      ancestors.push(node.parentId);
      node = this.#published.indexes.rowById.get(node.parentId);
    }
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      this.#toggleExpansion(
        Object.freeze({
          occurrenceId: ancestors[index]!,
          columnId: firstColumn.columnId,
        }),
        true,
      );
    }
    this.#select(address, 'api');
    this.#renderer?.scrollToCell(address);
    return editorSuccess(undefined);
  }

  public getSnapshot(): BomDocumentSnapshot<TFields> {
    return this.#published.snapshot;
  }

  public getDiagnostics(): Readonly<BomEditorDiagnostics> {
    const rendererDiagnostics = this.#renderer?.getDiagnostics() ?? null;
    const rendererResources =
      rendererDiagnostics?.resources ?? this.#lastRendererResources;
    const rendererWorkerTasks =
      rendererDiagnostics?.workerTasks ?? this.#lastRendererWorkerTasks;
    const parserWorkerRunning = this.#clipboardWorker?.pendingCount ?? 0;
    const eventHub = Object.freeze({
      kind: 'event-hub-listener' as const,
      tracked: true as const,
      supported: true as const,
      registeredCount: this.#events.registeredListenerCount,
      removedCount: this.#events.removedListenerCount,
      activeCount: this.#events.listenerCount,
      pendingAsyncCount: this.#events.pendingAsyncListenerCount,
      outstandingCount:
        this.#events.listenerCount +
        this.#events.pendingAsyncListenerCount,
      cleanupFailureCount: 0 as const,
    });
    const tasks = Object.freeze({
      protocol: BOM_EDITOR_TASK_LEDGER_PROTOCOL,
      kind: 'editor-task' as const,
      tracked: true as const,
      supported: true as const,
      queuedCount: this.#queuedTasks,
      runningCount: this.#activeTasks,
      outstandingCount: this.#queuedTasks + this.#activeTasks,
      cleanupFailureCount: 0 as const,
    });
    const workerTasks: Readonly<BomEditorWorkerTaskResourceDiagnostics> =
      rendererWorkerTasks === null
        ? Object.freeze({
            protocol: BOM_EDITOR_WORKER_TASK_LEDGER_PROTOCOL,
            kind: 'worker-task' as const,
            tracked: true,
            supported: this.#capabilities.worker,
            queuedCount: 0,
            runningCount: parserWorkerRunning,
            outstandingCount: parserWorkerRunning,
            cleanupFailureCount: 0,
          })
        : Object.freeze({
            protocol: BOM_EDITOR_WORKER_TASK_LEDGER_PROTOCOL,
            kind: 'worker-task' as const,
            tracked: rendererWorkerTasks.tracked,
            supported: rendererWorkerTasks.supported,
            queuedCount: rendererWorkerTasks.queuedCount,
            runningCount:
              rendererWorkerTasks.runningCount + parserWorkerRunning,
            outstandingCount:
              rendererWorkerTasks.queuedCount +
              rendererWorkerTasks.runningCount +
              parserWorkerRunning,
            cleanupFailureCount:
              rendererWorkerTasks.cleanupFailureCount,
          });
    const cleanupFailureCount =
      this.#completedRendererCleanupFailureCount +
      (rendererDiagnostics?.resources.cleanupFailureCount ?? 0);
    const activeResourceCount =
      (rendererResources?.activeCount ?? 0) +
      eventHub.outstandingCount +
      tasks.outstandingCount +
      parserWorkerRunning;
    const rendererFullyTracked =
      rendererResources === null ||
      rendererResources.kinds.every(
        (kind) =>
          kind.tracked &&
          kind.registeredCount !== null &&
          kind.activeCount !== null &&
          kind.cleanupAttemptCount !== null &&
          kind.cleanupFailureCount !== null,
      );
    const fullyTracked = rendererFullyTracked && workerTasks.tracked;
    const rendererReleased =
      rendererResources === null ||
      (rendererResources.disposed &&
        rendererResources.activeCount === 0 &&
        rendererResources.cleanupFailureCount === 0);
    const resources: Readonly<BomEditorResourceDiagnostics> = Object.freeze({
      protocol: BOM_EDITOR_RESOURCE_LEDGER_PROTOCOL,
      renderer: rendererResources,
      eventHub,
      tasks,
      workerTasks,
      activeCount: activeResourceCount,
      cleanupFailureCount,
      fullyTracked,
      trackedResourcesReleased:
        this.#lifecycle === 'destroyed' &&
        fullyTracked &&
        rendererReleased &&
        activeResourceCount === 0 &&
        cleanupFailureCount === 0 &&
        workerTasks.outstandingCount === 0 &&
        workerTasks.cleanupFailureCount === 0,
    });
    return Object.freeze({
      lifecycle: this.#lifecycle,
      documentRevision: this.#published.snapshot.revision,
      ...(this.#published.snapshot.sourceRevision === undefined
        ? {}
        : { sourceRevision: this.#published.snapshot.sourceRevision }),
      queuedTasks: this.#queuedTasks,
      activeTasks: this.#activeTasks,
      ...(this.#metricSamples.size === 0
        ? {}
        : { metrics: this.#metricSnapshots() }),
      instanceId: this.instanceId,
      documentGeneration: this.#published.documentGeneration,
      visibleRows: this.#published.projection.visibleCount,
      totalHeight: this.#published.projection.totalHeight,
      mountedResources:
        rendererDiagnostics?.registeredResourceCount ?? 0,
      resources,
    });
  }

  #recordMetric(
    name: string,
    value: number,
    unit: string,
    labels?: Readonly<Record<string, string>>,
  ): void {
    if (!Number.isFinite(value) || value < 0 || name.length === 0 || unit.length === 0) return;
    const current = this.#metricSamples.get(name);
    if (current === undefined) {
      this.#metricSamples.set(name, { unit, samples: [value] });
    } else {
      current.samples.push(value);
      if (current.samples.length > 128) current.samples.splice(0, current.samples.length - 128);
    }
    const context: Readonly<Record<string, string | number>> = Object.freeze({
      instanceId: this.instanceId,
      metric: name,
      value,
      unit,
    });
    try { this.#logger?.debug?.('bom-editor.metric', context); } catch { /* logger is isolated */ }
    this.#events.dispatch('metric', {
      name,
      value,
      unit,
      ...(labels === undefined ? {} : { labels }),
    });
  }

  #metricSnapshots(): readonly Readonly<import('@bom-editor/runtime').BomMetricSnapshot>[] {
    return Object.freeze([...this.#metricSamples.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, state]) => {
        const samples = state.samples;
        return Object.freeze({
          name,
          unit: state.unit,
          count: samples.length,
          last: samples[samples.length - 1] ?? 0,
          total: samples.reduce((sum, sample) => sum + sample, 0),
          minimum: Math.min(...samples),
          maximum: Math.max(...samples),
        });
      }));
  }

  public on<K extends keyof BomEventMap<TFields>>(
    type: K,
    listener: BomEventListener<TFields, K>,
  ): () => void {
    if (this.#lifecycle === 'destroyed') {
      return (): void => {};
    }
    return this.#events.on(type, listener);
  }

  public focus(): BomResult<void> {
    if (this.#lifecycle === 'destroyed' || this.#lifecycle === 'destroying') {
      return this.#destroyedFailure();
    }
    if (this.#renderer === null) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.notMounted, 'CONFIG'),
      );
    }
    this.#renderer.focus();
    this.#ensureEditFocused();
    return editorSuccess(undefined);
  }

  public blur(): BomResult<void> {
    if (this.#lifecycle === 'destroyed' || this.#lifecycle === 'destroying') {
      return this.#destroyedFailure();
    }
    if (this.#editMachine.state.status !== 'focused') {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.editInvalid, 'VALIDATION'),
      );
    }
    const transition = this.#editMachine.transition({ type: 'blur' });
    if (!transition.ok) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.editInvalid, 'VALIDATION'),
      );
    }
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#emitEditStateChanged(transition.previous, transition.state);
    return editorSuccess(undefined);
  }

  public destroy(): void {
    if (this.#lifecycle === 'destroyed' || this.#lifecycle === 'destroying') {
      return;
    }
    this.#lifecycle = 'destroying';
    this.#mountGeneration += 1;
    this.#sourceController?.abort();
    this.#sourceController = undefined;
    this.#abortDataSourceReads();
    this.#pasteParsingAbortController.abort();
    this.#pluginLifecycleAbortController.abort();
    for (const entry of this.#plugins.values()) {
      entry.runtime.acceptingCalls = false;
      entry.runtime.hookEpoch += 1;
      entry.runtime.hookController.abort();
      entry.runtime.lifecycleController.abort();
      this.#removePluginContributions(entry);
      disposePluginRegistrations(entry.unregisters);
      void safePluginCleanup(
        entry.cleanup,
        this.#pluginHostConfiguration.asyncHookTimeoutMs,
        (durationMs) => this.#reportPluginSyncHookBudget(
          { pluginId: entry.manifest.id, name: 'cleanup' },
          durationMs,
        ),
      );
    }
    this.#plugins.clear();
    this.#pluginValidators.clear();
    this.#pluginFixers.clear();
    this.#pluginCommands.clear();
    this.#pluginGeneration += 1;
    this.#validationState.clear();
    this.#disposeClipboardWorker();
    this.#sourceEpoch += 1;
    this.#deactivatePersistenceSession('destroyed');
    this.#pendingClipboardWrites.clear();
    this.#endActiveEdit('destroyed');
    if (this.#renderer !== null) {
      this.#disposeRenderer(this.#renderer);
    }
    this.#events.dispatch('destroyed', { reason: 'destroy' });
    this.#events.clear();
    this.#lifecycle = 'destroyed';
    this.#settleReady(this.#destroyedFailure());
  }

  #disposeRenderer(renderer: BomCanvasRenderer<TFields>): void {
    renderer.destroy();
    const rendererDiagnostics = renderer.getDiagnostics();
    const resources = rendererDiagnostics.resources;
    this.#lastRendererResources = resources;
    this.#lastRendererWorkerTasks = rendererDiagnostics.workerTasks;
    if (!this.#capturedRenderers.has(renderer)) {
      this.#capturedRenderers.add(renderer);
      this.#completedRendererCleanupFailureCount +=
        resources.cleanupFailureCount;
    }
    if (this.#renderer === renderer) {
      this.#renderer = null;
    }
  }

  #historyAction(
    action: 'undo' | 'redo',
    options: {
      readonly signal?: AbortSignal;
      readonly origin?: string;
    },
  ): Promise<BomResult<BomCommit<TFields>>> {
    if (this.#source !== undefined) {
      return Promise.resolve(this.#sourceBoundMutationFailure());
    }
    const transactionId = this.#nextTransactionId(action);
    const origin = options.origin ?? 'editor:' + action;
    return this.#enqueue(
      async () => {
        const historyEntry = action === 'undo'
          ? this.#historyUndo.at(-1)
          : this.#historyRedo.at(-1);
        if (historyEntry?.kind === 'columns') {
          return this.#applyColumnHistory(historyEntry, action);
        }
        if (historyEntry?.kind === 'row-height') {
          return this.#applyRowHeightHistory(historyEntry, action);
        }
        if (
          action === 'redo' &&
          historyEntry === undefined &&
          this.#columnHistoryInvalidatesDocumentRedo
        ) {
          return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.internal, 'CONFLICT'));
        }
        const attempt = this.#attempt(transactionId, origin);
        this.#resetPreparation();
        const result =
          action === 'undo'
            ? await this.#engine.undo({ transactionId, origin })
            : await this.#engine.redo({ transactionId, origin });
        return this.#finishTransaction(result, attempt, action);
      },
      options.signal,
    );
  }

  async #sourceUndo(
    options: {
      readonly signal?: AbortSignal;
      readonly origin?: string;
    },
  ): Promise<BomResult<BomCommit<TFields>>> {
    if (this.#persistenceMutationBarrier || this.#sourceReplacementPending) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT'),
      );
    }
    const persistence = this.#persistenceForMutation();
    if (!persistence.ok || persistence.value === undefined) {
      return editorFailure(
        persistence.ok
          ? editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT')
          : persistence.error,
      );
    }
    const session = persistence.value;
    const historyOwner = session.historyOwners.at(-1);
    if (historyOwner?.kind === 'remote') {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT', {
          reason: 'remote-history-head',
        }),
      );
    }
    const targetId = session.order.at(-1);
    const target = targetId === undefined
      ? undefined : session.pending.get(targetId);
    const cancellableTarget =
      target !== undefined && target.recordHistory &&
      target.commit.transactionId === historyOwner?.transactionId
        ? target
        : undefined;
    this.#persistenceMutationBarrier = true;
    try {
      let cancelled = false;
      let terminal: BomRemoteCommitOutcome<TFields> | undefined;
      if (target !== undefined && session.coordinator !== undefined) {
        if (cancellableTarget !== undefined) {
          const waitingForCancellation = await waitForAbortSignal(
            session.coordinator.cancelPending(
              cancellableTarget.commit.transactionId,
            ),
            options.signal,
          );
          if (waitingForCancellation.aborted) {
            this.#requestPersistenceReload(
              session,
              editorError(
                BOM_EDITOR_ERROR_CODES.remoteResyncRequired,
                'ABORTED',
                { reason: 'undo-cancellation-aborted' },
              ),
              'reload',
            );
            return this.#abortedFailure();
          }
          if (!this.#isSessionCurrent(session)) {
            return this.#sourceBoundMutationFailure();
          }
          cancelled =
            waitingForCancellation.value.ok &&
            waitingForCancellation.value.value.cancelled;
        }
        if (!cancelled && target !== undefined) {
          const waitingForTerminal = await waitForAbortSignal(
            target.receipt.outcome,
            options.signal,
          );
          if (waitingForTerminal.aborted) {
            this.#requestPersistenceReload(
              session,
              editorError(
                BOM_EDITOR_ERROR_CODES.remoteResyncRequired,
                'ABORTED',
                { reason: 'undo-persistence-wait-aborted' },
              ),
              'reload',
            );
            return this.#abortedFailure();
          }
          terminal = waitingForTerminal.value;
        }
      }
      return await this.#enqueue(async () => {
        if (!this.#isSessionCurrent(session) || options.signal?.aborted) {
          return options.signal?.aborted
            ? this.#abortedFailure()
            : this.#sourceBoundMutationFailure();
        }
        if (
          target !== undefined && terminal !== undefined &&
          session.pending.has(target.commit.transactionId)
        ) {
          await this.#handlePersistenceOutcome(session, target, terminal);
        } else if (target !== undefined && cancelled) {
          this.#removePendingRecord(session, target.commit.transactionId);
        }
        if (
          terminal !== undefined && terminal.status !== 'acknowledged' &&
          terminal.status !== 'cancelled'
        ) {
          return editorFailure(
            terminal.status === 'reloadRequired'
              ? terminal.error
              : terminal.status === 'rejected'
                ? terminal.response.error
                : editorError(
                    BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT',
                  ),
          );
        }
        const transactionId = this.#nextTransactionId('undo');
        const origin = options.origin ?? 'editor:undo';
        const metadata = cancelled
          ? undefined
          : this.#persistenceMetadata(
              session,
              transactionId,
              undefined,
              target?.commit.transactionId ?? historyOwner?.transactionId,
            );
        const attempt = this.#attempt(transactionId, origin);
        this.#resetPreparation();
        const result = await this.#engine.undo({
          transactionId,
          origin,
          ...(metadata === undefined ? {} : metadata),
        });
        const finished = cancelled
          ? this.#finishTransaction(result, attempt, 'undo')
          : await this.#finishLocalTransaction(result, attempt, {
              session,
              commands: Object.freeze([]),
              recordHistory: false,
            });
        if (finished.ok) {
          session.historyOwners.pop();
          if (cancelled && target !== undefined) {
            this.#emitPersistenceState(
              session, target.commit, 'rolledBack',
              session.coordinator?.sourceRevision,
            );
          }
        }
        return finished;
      }, options.signal);
    } finally {
      this.#persistenceMutationBarrier = false;
    }
  }

  async #abortAndRollbackPendingPersistence(
    session: EditorPersistenceSession<TFields>,
    signal: AbortSignal | undefined,
  ): Promise<BomResult<void>> {
    const coordinator = session.coordinator;
    if (
      !this.#isSessionCurrent(session) || coordinator === undefined ||
      session.source.capabilities.cancelPendingCommit !== true ||
      typeof session.source.cancelCommit !== 'function'
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT', {
          reason: 'abort-and-rollback-unsupported',
        }),
      );
    }
    const records: PendingPersistenceRecord<TFields>[] = [];
    for (const transactionId of session.order) {
      const record = session.pending.get(transactionId);
      if (record === undefined) {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT', {
            reason: 'pending-order-mismatch', transactionId,
          }),
        );
      }
      records.push(record);
    }
    if (records.length === 0 || coordinator.pendingCount !== records.length) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT', {
          reason: 'pending-coordinator-mismatch',
          pending: coordinator.pendingCount,
          localPending: records.length,
        }),
      );
    }
    if (records.some((record) => !record.recordHistory)) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT', {
          reason: 'unrecorded-compensation-cannot-abort-and-rollback',
        }),
      );
    }

    this.#persistenceMutationBarrier = true;
    try {
      for (const record of [...records].reverse()) {
        const cancelled = await waitForAbortSignal(
          coordinator.cancelPending(record.commit.transactionId),
          signal,
        );
        if (cancelled.aborted) {
          this.#requestPersistenceReload(
            session,
            editorError(
              BOM_EDITOR_ERROR_CODES.remoteResyncRequired,
              'ABORTED',
              { reason: 'source-replace-cancellation-aborted' },
            ),
            'reload',
          );
          return this.#abortedFailure();
        }
        if (!cancelled.value.ok || !cancelled.value.value.cancelled) {
          const error = cancelled.value.ok
            ? editorError(
                BOM_EDITOR_ERROR_CODES.persistenceSuspended,
                'CONFLICT',
                {
                  reason: 'source-replace-cancellation-declined',
                  transactionId: record.commit.transactionId,
                },
              )
            : cancelled.value.error;
          this.#requestPersistenceReload(session, error, 'reload');
          return editorFailure(error);
        }
        if (!this.#isSessionCurrent(session)) {
          return this.#sourceBoundMutationFailure();
        }
      }
      if (coordinator.pendingCount !== 0) {
        const error = editorError(
          BOM_EDITOR_ERROR_CODES.persistenceSuspended,
          'CONFLICT',
          {
            reason: 'source-replace-cancellation-incomplete',
            pending: coordinator.pendingCount,
          },
        );
        this.#requestPersistenceReload(session, error, 'reload');
        return editorFailure(error);
      }
      return this.#enqueue(
        () => this.#rollbackCancelledPersistenceSuffix(session, records),
        signal,
      );
    } finally {
      this.#persistenceMutationBarrier = false;
    }
  }

  async #rollbackCancelledPersistenceSuffix(
    session: EditorPersistenceSession<TFields>,
    records: readonly PendingPersistenceRecord<TFields>[],
  ): Promise<BomResult<void>> {
    if (!this.#isSessionCurrent(session)) return this.#sourceBoundMutationFailure();
    const expectedHistorySuffix = records.map(
      (record) => record.commit.transactionId,
    );
    const actualHistorySuffix = session.historyOwners
      .slice(-expectedHistorySuffix.length)
      .map((owner) => owner.transactionId);
    if (
      actualHistorySuffix.length !== expectedHistorySuffix.length ||
      actualHistorySuffix.some(
        (transactionId, index) => transactionId !== expectedHistorySuffix[index],
      )
    ) {
      const error = editorError(
        BOM_EDITOR_ERROR_CODES.persistenceSuspended,
        'CONFLICT',
        { reason: 'abort-and-rollback-history-suffix-mismatch' },
      );
      this.#requestPersistenceReload(session, error, 'reload');
      return editorFailure(error);
    }
    const descendants = records.slice(1).map((record) => {
      if (record.commands.length === 0) {
        return Object.freeze({ kind: 'patch' as const, patch: record.commit.patch });
      }
      const patch = record.commit.patch;
      return Object.freeze({
        kind: 'commands' as const,
        batch: Object.freeze({
          protocolVersion: patch.protocolVersion,
          documentId: patch.documentId,
          documentGeneration: session.documentGeneration,
          baseRevision: patch.baseRevision,
          transactionId: patch.transactionId,
          ...(patch.dependsOnTransactionId === undefined
            ? {} : { dependsOnTransactionId: patch.dependsOnTransactionId }),
          origin: patch.origin,
          timestamp: patch.timestamp,
          ...(patch.idempotencyKey === undefined
            ? {} : { idempotencyKey: patch.idempotencyKey }),
          commands: record.commands,
        } satisfies BomCommandBatch<TFields>),
      });
    });
    const transactionId = this.#nextTransactionId('source-replace-rollback');
    const attempt = this.#attempt(transactionId, 'editor:source-replace-rollback');
    this.#resetPreparation();
    const reconciled = await this.#engine.reconcileHistorySuffix({
      failedTransactionId: records[0]!.commit.transactionId,
      transactionId,
      origin: attempt.origin,
      timestamp: new Date().toISOString(),
      descendants: Object.freeze(descendants),
    });
    if (!reconciled.ok) {
      this.#resetPreparation();
      const error = reconciled.errors[0]!;
      this.#requestPersistenceReload(session, error, 'reload');
      return editorFailure(error);
    }
    const published = this.#finishTransaction(
      Object.freeze({ ok: true, value: reconciled.value.commit }),
      attempt,
      'reset',
    );
    if (!published.ok) {
      this.#requestPersistenceReload(session, published.error, 'reload');
      return editorFailure(published.error);
    }
    session.historyOwners.splice(-expectedHistorySuffix.length);
    for (const record of records) {
      this.#transitionOwnTransaction(
        session,
        record.commit.transactionId,
        'cancelled',
        session.coordinator?.sourceRevision,
      );
      this.#removePendingRecord(session, record.commit.transactionId);
      this.#emitPersistenceState(
        session,
        record.commit,
        'rolledBack',
        session.coordinator?.sourceRevision,
      );
    }
    return editorSuccess(undefined);
  }

  #persistenceForMutation(): BomResult<
    EditorPersistenceSession<TFields> | undefined
  > {
    const source = this.#source;
    if (source === undefined) return editorSuccess(undefined);
    if (source.capabilities.writable !== true) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.sourceReadOnly, 'CONFIG'),
      );
    }
    const session = this.#persistenceSession;
    if (
      this.#sourceReplacementPending || this.#persistenceMutationBarrier ||
      session === undefined ||
      !this.#isSessionCurrent(session) || session.coordinator === undefined ||
      session.coordinator.mode !== 'active' ||
      session.remote.stopped || session.reloading
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT'),
      );
    }
    return editorSuccess(session);
  }

  #persistenceMetadata(
    session: EditorPersistenceSession<TFields> | undefined,
    transactionId: string,
    requestedIdempotencyKey?: string,
    requiredDependency?: string,
  ): {
    readonly idempotencyKey: string;
    readonly dependsOnTransactionId?: string;
  } | undefined {
    if (session === undefined) return undefined;
    const predecessor = session.order.at(-1) ?? requiredDependency;
    return Object.freeze({
      idempotencyKey:
        requestedIdempotencyKey ?? this.#nextIdempotencyKey(transactionId),
      ...(predecessor === undefined
        ? {} : { dependsOnTransactionId: predecessor }),
    });
  }

  #nextIdempotencyKey(transactionId: string): string {
    this.#idempotencySequence += 1;
    const cryptoObject = globalThis.crypto as
      | { randomUUID?: () => string }
      | undefined;
    let nonce: string | undefined;
    try {
      nonce = cryptoObject?.randomUUID?.();
    } catch {
      nonce = undefined;
    }
    return nonce === undefined
      ? `${this.instanceId}:${Date.now().toString(36)}:${this.#sourceEpoch}:${this.#idempotencySequence}:${transactionId}`
      : `${this.instanceId}:${nonce}`;
  }

  #registerLocalCommit(
    session: EditorPersistenceSession<TFields>,
    commit: BomCommit<TFields>,
    commands: readonly BomCommand<TFields>[],
    recordHistory = true,
  ): BomResult<PendingPersistenceRecord<TFields>> {
    if (
      !this.#isSessionCurrent(session) ||
      session.coordinator === undefined
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.persistenceSuspended, 'CONFLICT'),
      );
    }
    const submission: BomRemoteCommitSubmission<TFields> = Object.freeze({
      documentId: session.documentId,
      documentGeneration: session.documentGeneration,
      commit,
      commands: Object.freeze([...commands]),
    });
    const enqueued = session.coordinator.enqueue(submission);
    if (!enqueued.ok) return editorFailure(enqueued.error);
    const record: PendingPersistenceRecord<TFields> = {
      commit: enqueued.value.submission.commit,
      commands: enqueued.value.submission.commands,
      receipt: enqueued.value,
      state: 'pending',
      dispatched: false,
      recordHistory,
    };
    session.pending.set(commit.transactionId, record);
    session.order.push(commit.transactionId);
    if (recordHistory) {
      session.historyOwners.push(Object.freeze({
        transactionId: commit.transactionId,
        kind: 'local',
      }));
    }
    session.ownTransactions.set(commit.transactionId, {
      fingerprint: operationFingerprint(commit.patch.operations),
      status: 'pending',
    });
    trimOwnTransactionLedger(session.ownTransactions, 256);
    void record.receipt.outcome.then((outcome) => {
      if (!this.#isSessionCurrent(session)) return;
      void this.#enqueue(() =>
        this.#handlePersistenceOutcome(session, record, outcome));
    });
    return editorSuccess(record);
  }

  #announceLocalCommit(
    session: EditorPersistenceSession<TFields>,
    record: PendingPersistenceRecord<TFields>,
  ): void {
    this.#emitPersistenceState(session, record.commit, 'localApplied');
    this.#emitPersistenceState(session, record.commit, 'pending');
  }

  #emitPersistenceState(
    session: EditorPersistenceSession<TFields>,
    commit: BomCommit<TFields>,
    state: BomTransactionPersistenceState,
    sourceRevision?: RevisionToken,
    error?: BomError,
    recovery?: PersistenceRecoveryDetail<TFields>,
  ): void {
    if (!this.#isSessionCurrent(session)) return;
    const record = session.pending.get(commit.transactionId);
    if (record !== undefined) record.state = state;
    this.#events.dispatch('transactionPersistenceChanged', {
      documentId: session.documentId,
      documentGeneration: session.documentGeneration,
      transactionId: commit.transactionId,
      origin: commit.patch.origin,
      previousRevision: commit.previousRevision,
      revision: commit.revision,
      patch: commit.patch,
      state,
      ...(sourceRevision === undefined ? {} : { sourceRevision }),
      ...(error === undefined ? {} : { error }),
      ...(recovery === undefined
        ? {}
        : {
            recoveryId: recovery.recoveryId,
            retryable: recovery.retryable,
            recoveryBundle: recovery.bundle,
          }),
    });
  }

  #transitionOwnTransaction(
    session: EditorPersistenceSession<TFields>,
    transactionId: string,
    status: OwnRemoteTransactionState['status'],
    sourceRevision?: RevisionToken,
    clearSourceRevision = false,
  ): boolean {
    const own = session.ownTransactions.get(transactionId);
    if (own === undefined) return false;
    if (
      sourceRevision !== undefined && own.sourceRevision !== undefined &&
      own.sourceRevision !== sourceRevision
    ) return false;
    own.status = status;
    if (sourceRevision !== undefined) {
      own.sourceRevision = sourceRevision;
    } else if (clearSourceRevision) {
      delete own.sourceRevision;
    }
    trimOwnTransactionLedger(session.ownTransactions, 256);
    return true;
  }

  #capturePersistenceAudit(
    session: EditorPersistenceSession<TFields>,
    event: BomRemoteCommitAuditEvent,
  ): void {
    if (!this.#isSessionCurrent(session)) return;
    const record = session.pending.get(event.transactionId);
    if (record === undefined) return;
    if (event.action === 'dispatchStarted') {
      record.dispatched = true;
      return;
    }
    const state: BomTransactionPersistenceState | undefined =
      event.action === 'rejected' ? 'rejected'
      : event.action === 'conflicted' ? 'conflicted'
      : event.action === 'rolledBack' ? 'rolledBack'
      : event.action === 'rebased' ? 'rebased'
      : event.action === 'requeued' ? 'pending'
      : event.action === 'reloadRequired' ? 'reloadRequired'
      : undefined;
    if (state === undefined || state === record.state) return;
    const error = event.errorCode === undefined
      ? undefined
      : dataSourceError(
          BOM_DATASOURCE_ERROR_CODES.externalFailure,
          event.errorCategory ?? 'INTERNAL',
          { transactionId: event.transactionId },
        );
    void this.#enqueue(() => {
      if (!this.#isSessionCurrent(session)) return editorSuccess(undefined);
      const current = session.pending.get(event.transactionId);
      if (current === undefined || current.state === state) {
        return editorSuccess(undefined);
      }
      this.#emitPersistenceState(
        session, current.commit, state, event.sourceRevision, error,
      );
      if (state === 'rejected') {
        this.#transitionOwnTransaction(
          session, current.commit.transactionId, 'rejected',
        );
      } else if (state === 'conflicted') {
        this.#transitionOwnTransaction(
          session, current.commit.transactionId, 'conflicted',
        );
      } else if (state === 'reloadRequired') {
        this.#transitionOwnTransaction(
          session, current.commit.transactionId, 'reloadRequired',
        );
      } else if (state === 'pending') {
        this.#transitionOwnTransaction(
          session, current.commit.transactionId, 'pending', undefined, true,
        );
      }
      if (state === 'reloadRequired') {
        this.#requestPersistenceReload(
          session,
          error ?? editorError(
            BOM_EDITOR_ERROR_CODES.remoteResyncRequired, 'CONFLICT',
          ),
          'reload',
        );
      }
      return editorSuccess(undefined);
    });
  }

  async #handlePersistenceOutcome(
    session: EditorPersistenceSession<TFields>,
    record: PendingPersistenceRecord<TFields>,
    outcome: BomRemoteCommitOutcome<TFields>,
  ): Promise<BomResult<void>> {
    if (!this.#isSessionCurrent(session)) return this.#abortedFailure();
    if (outcome.status === 'acknowledged') {
      const own = session.ownTransactions.get(record.commit.transactionId);
      if (
        own === undefined ||
        (own.sourceRevision !== undefined &&
          own.sourceRevision !== outcome.sourceRevision)
      ) {
        const failure = editorError(
          BOM_EDITOR_ERROR_CODES.remoteProtocolViolation,
          'CONFLICT',
          { reason: 'own-acknowledgement-mismatch' },
        );
        this.#emitPersistenceState(
          session, record.commit, 'reloadRequired', undefined, failure,
        );
        this.#transitionOwnTransaction(
          session, record.commit.transactionId, 'reloadRequired',
        );
        this.#requestPersistenceReload(session, failure, 'resync');
        return editorFailure(failure);
      }
      const acknowledged = await this.#engine.acknowledgeSourceRevision({
        sourceRevision: outcome.sourceRevision,
        expectedLocalRevision: this.#engine.getSnapshot().revision,
        ...(this.#engine.getSnapshot().sourceRevision === undefined
          ? {}
          : {
              expectedPriorSourceRevision:
                this.#engine.getSnapshot().sourceRevision,
            }),
      });
      if (!acknowledged.ok || !this.#isSessionCurrent(session)) {
        const failure = acknowledged.ok
          ? editorError(BOM_EDITOR_ERROR_CODES.remoteResyncRequired, 'CONFLICT')
          : acknowledged.errors[0]!;
        this.#emitPersistenceState(
          session, record.commit, 'reloadRequired', undefined, failure,
        );
        this.#transitionOwnTransaction(
          session, record.commit.transactionId, 'reloadRequired',
        );
        this.#requestPersistenceReload(session, failure, 'resync');
        return editorFailure(failure);
      }
      this.#publishEngineEnvelope();
      this.#transitionOwnTransaction(
        session, record.commit.transactionId, 'acknowledged',
        outcome.sourceRevision,
      );
      this.#emitPersistenceState(
        session, record.commit, 'acknowledged', outcome.sourceRevision,
      );
      this.#removePendingRecord(session, record.commit.transactionId);
      return editorSuccess(undefined);
    }
    if (outcome.status === 'reloadRequired') {
      this.#transitionOwnTransaction(
        session, record.commit.transactionId, 'reloadRequired',
      );
      this.#emitPersistenceState(
        session,
        record.commit,
        'reloadRequired',
        undefined,
        outcome.error,
        {
          recoveryId: outcome.recoveryId,
          retryable: outcome.retryable,
          bundle: outcome.bundle,
        },
      );
      this.#requestPersistenceReload(session, outcome.error, 'reload');
      return editorSuccess(undefined);
    }
    if (outcome.status === 'rejected') {
      this.#transitionOwnTransaction(
        session, record.commit.transactionId, 'rejected',
      );
      this.#removePendingRecord(session, record.commit.transactionId);
      return editorSuccess(undefined);
    }
    if (outcome.status === 'conflicted') {
      this.#transitionOwnTransaction(
        session, record.commit.transactionId, 'conflicted',
      );
      this.#removePendingRecord(session, record.commit.transactionId);
      return editorSuccess(undefined);
    }
    if (outcome.status === 'cancelled') {
      this.#transitionOwnTransaction(
        session, record.commit.transactionId, 'cancelled',
        outcome.sourceRevision,
      );
      this.#removePendingRecord(session, record.commit.transactionId);
      return editorSuccess(undefined);
    }
    this.#removePendingRecord(session, record.commit.transactionId);
    return editorSuccess(undefined);
  }

  #removePendingRecord(
    session: EditorPersistenceSession<TFields>,
    transactionId: string,
  ): void {
    session.pending.delete(transactionId);
    const index = session.order.indexOf(transactionId);
    if (index >= 0) session.order.splice(index, 1);
  }

  #publishEngineEnvelope(): void {
    this.#published = Object.freeze({
      snapshot: this.#engine.getSnapshot(),
      indexes: this.#engine.getIndexes(),
      projection: this.#published.projection,
      documentGeneration: this.#published.documentGeneration,
      sourceType: this.#published.sourceType,
    });
    this.#clearDiffViewIfNotCurrent();
    this.#expireFixProposals();
  }

  #activatePersistenceSession(
    source: BomDataSource<TFields>,
  ): BomResult<void> {
    const snapshot = this.#published.snapshot;
    const session: EditorPersistenceSession<TFields> = {
      source,
      epoch: this.#sourceEpoch,
      documentId: snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      coordinator: undefined,
      pending: new Map(),
      order: [],
      ownTransactions: new Map(),
      historyOwners: [],
      remote: {
        sourceRevision: snapshot.sourceRevision ?? snapshot.revision,
        lastSequence: undefined,
        fingerprints: new Map(),
        preAppliedFingerprints: new Map(),
        stopped: false,
      },
      unsubscribe: undefined,
      reloadController: undefined,
      reloading: false,
      active: true,
      reconciliation: undefined,
    };
    this.#persistenceSession = session;
    if (source.capabilities.writable) {
      const created = createBomRemoteCommitCoordinator<TFields>({
        dataSource: source,
        context: Object.freeze({
          protocolVersion: this.#protocolVersion,
          documentId: snapshot.documentId,
          documentGeneration: session.documentGeneration,
          schemaVersion: snapshot.schemaVersion,
          positionKeyCodecVersion: snapshot.positionKeyCodecVersion,
          sourceRevision: session.remote.sourceRevision,
        }),
        hooks: Object.freeze({
          rollbackAtomically: (request: BomAtomicRollbackRequest<TFields>) =>
            this.#rollbackPersistence(session, request),
          replayInIsolation: (request: BomIsolatedReplayRequest<TFields>) =>
            this.#replayPersistence(session, request),
        }),
        isCurrentDocument: () => this.#isSessionCurrent(session),
        audit: (event) => this.#capturePersistenceAudit(session, event),
      });
      if (!created.ok) {
        session.active = false;
        this.#persistenceSession = undefined;
        return editorFailure(created.error);
      }
      session.coordinator = created.value;
    }
    if (source.capabilities.remoteChanges) {
      try {
        const unsubscribe = source.subscribeRemote!({
          next: (envelope) => this.#captureRemoteEnvelope(session, envelope),
          error: (error) =>
            this.#requestPersistenceReload(session, error, 'reload'),
          resyncRequired: (actualSourceRevision) =>
            this.#requestPersistenceReload(
              session,
              editorError(
                BOM_EDITOR_ERROR_CODES.remoteResyncRequired,
                'CONFLICT',
                actualSourceRevision === undefined
                  ? undefined : { actualSourceRevision },
              ),
              'resync',
            ),
        });
        if (typeof unsubscribe !== 'function') {
          throw new Error('BOM_DATASOURCE_SUBSCRIBE_INVALID');
        }
        if (
          !this.#isSessionCurrent(session) || session.remote.stopped ||
          session.reloading
        ) {
          try { unsubscribe(); } catch { /* The session token remains stopped. */ }
        } else {
          session.unsubscribe = unsubscribe;
        }
      } catch {
        this.#requestPersistenceReload(
          session,
          editorError(BOM_EDITOR_ERROR_CODES.remoteProtocolViolation, 'DATA'),
          'reload',
        );
      }
    }
    return editorSuccess(undefined);
  }

  #deactivatePersistenceSession(
    reason: 'destroyed' | 'replaced' | 'reload',
  ): void {
    const session = this.#persistenceSession;
    if (session === undefined) return;
    session.active = false;
    session.remote.stopped = true;
    session.reloadController?.abort();
    session.reloadController = undefined;
    const unsubscribe = session.unsubscribe;
    session.unsubscribe = undefined;
    if (unsubscribe !== undefined) {
      try { unsubscribe(); } catch { /* Cleanup is fail-closed below. */ }
    }
    if (reason === 'replaced') {
      session.coordinator?.replaceDocument({
        ...session.coordinator.context,
        documentGeneration: session.documentGeneration + 1,
      });
    }
    session.coordinator?.destroy();
    if (this.#persistenceSession === session) {
      this.#persistenceSession = undefined;
    }
  }

  #isSessionCurrent(session: EditorPersistenceSession<TFields>): boolean {
    return (
      session.active && this.#persistenceSession === session &&
      session.source === this.#source && session.epoch === this.#sourceEpoch &&
      session.documentId === this.#published.snapshot.documentId &&
      session.documentGeneration === this.#published.documentGeneration &&
      !this.#isDestroyedOrDestroying()
    );
  }

  async #rollbackPersistence(
    session: EditorPersistenceSession<TFields>,
    request: BomAtomicRollbackRequest<TFields>,
  ): Promise<BomAtomicRollbackResult> {
    return this.#enqueue(async () => {
      if (!this.#isSessionCurrent(session)) {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        );
      }
      const failedRecord = session.pending.get(
        request.failedTransaction.commit.transactionId,
      );
      if (failedRecord?.recordHistory === false) {
        return editorFailure(
          editorError(
            BOM_EDITOR_ERROR_CODES.persistenceSuspended,
            'CONFLICT',
            { reason: 'unrecorded-compensation-recovery-required' },
          ),
        );
      }
      if (
        request.failure.status === 'conflicted' &&
        request.failure.remoteOperations === undefined
      ) {
        return editorFailure(
          editorError(
            BOM_EDITOR_ERROR_CODES.remoteResyncRequired,
            'CONFLICT',
            { reason: 'conflict-operations-missing' },
          ),
        );
      }
      const transactionId = this.#nextTransactionId('persistence-reconcile');
      const origin = 'dataSource:reconcile';
      const timestamp = new Date().toISOString();
      const descendants = request.descendants.map((submission) => {
        if (submission.commands.length === 0) {
          return Object.freeze({
            kind: 'patch' as const,
            patch: submission.commit.patch,
          });
        }
        const patch = submission.commit.patch;
        const batch: BomCommandBatch<TFields> = Object.freeze({
          protocolVersion: patch.protocolVersion,
          documentId: patch.documentId,
          documentGeneration: session.documentGeneration,
          baseRevision: patch.baseRevision,
          transactionId: patch.transactionId,
          ...(patch.dependsOnTransactionId === undefined
            ? {}
            : { dependsOnTransactionId: patch.dependsOnTransactionId }),
          origin: patch.origin,
          timestamp: patch.timestamp,
          ...(patch.idempotencyKey === undefined
            ? {} : { idempotencyKey: patch.idempotencyKey }),
          commands: submission.commands,
        });
        return Object.freeze({ kind: 'commands' as const, batch });
      });
      const expectedHistorySuffix = [
        request.failedTransaction.commit.transactionId,
        ...request.descendants.map(
          (submission) => submission.commit.transactionId,
        ),
      ];
      const actualHistorySuffix = session.historyOwners
        .slice(-expectedHistorySuffix.length)
        .map((owner) => owner.transactionId);
      if (
        actualHistorySuffix.length !== expectedHistorySuffix.length ||
        actualHistorySuffix.some(
          (transactionId, index) =>
            transactionId !== expectedHistorySuffix[index],
        )
      ) {
        return editorFailure(
          editorError(
            BOM_EDITOR_ERROR_CODES.persistenceSuspended,
            'CONFLICT',
            { reason: 'history-owner-suffix-mismatch' },
          ),
        );
      }
      const attempt = this.#attempt(transactionId, origin);
      this.#resetPreparation();
      const reconciled = await this.#engine.reconcileHistorySuffix({
        failedTransactionId:
          request.failedTransaction.commit.transactionId,
        transactionId,
        origin,
        timestamp,
        descendants: Object.freeze(descendants),
        ...(request.failure.status === 'conflicted' &&
          request.failure.remoteOperations !== undefined
          ? { remoteOperations: request.failure.remoteOperations }
          : {}),
      });
      if (!reconciled.ok) {
        this.#resetPreparation();
        return editorFailure(reconciled.errors[0]!);
      }
      if (request.failure.status === 'conflicted') {
        const snapshot = this.#engine.getSnapshot();
        const acknowledged = await this.#engine.acknowledgeSourceRevision({
          sourceRevision: request.failure.sourceRevision,
          expectedLocalRevision: snapshot.revision,
          ...(snapshot.sourceRevision === undefined
            ? {}
            : { expectedPriorSourceRevision: snapshot.sourceRevision }),
        });
        if (!acknowledged.ok) {
          this.#resetPreparation();
          return editorFailure(acknowledged.errors[0]!);
        }
        if (request.failure.remoteOperations !== undefined) {
          session.remote.preAppliedFingerprints.set(
            request.failure.sourceRevision,
            operationFingerprint(request.failure.remoteOperations),
          );
          trimMap(session.remote.preAppliedFingerprints, 64);
        }
      }
      const published = this.#finishTransaction(
        Object.freeze({ ok: true, value: reconciled.value.commit }),
        attempt,
        'reset',
      );
      if (!published.ok) return editorFailure(published.error);
      const mappings = new Map(
        reconciled.value.replayed.map((mapping) => [
          mapping.originalTransactionId, mapping.commit,
        ]),
      );
      const transactions = request.descendants.map((submission) => {
        const commit = mappings.get(submission.commit.transactionId)!;
        const record = session.pending.get(submission.commit.transactionId);
        if (record !== undefined) {
          record.commit = commit;
          session.ownTransactions.set(commit.transactionId, {
            fingerprint: operationFingerprint(commit.patch.operations),
            status: 'pending',
          });
          trimOwnTransactionLedger(session.ownTransactions, 256);
        }
        return Object.freeze({ ...submission, commit });
      });
      session.historyOwners.splice(-expectedHistorySuffix.length);
      for (const transaction of transactions) {
        session.historyOwners.push(Object.freeze({
          transactionId: transaction.commit.transactionId,
          kind: 'local' as const,
        }));
      }
      session.reconciliation = Object.freeze({
        failedTransactionId:
          request.failedTransaction.commit.transactionId,
        result: reconciled.value,
        transactions: Object.freeze(transactions),
      });
      return editorSuccess(Object.freeze({
        revision: reconciled.value.rollbackRevision,
      }));
    });
  }

  async #replayPersistence(
    session: EditorPersistenceSession<TFields>,
    request: BomIsolatedReplayRequest<TFields>,
  ): Promise<BomIsolatedReplayResult<TFields>> {
    const reconciliation = session.reconciliation;
    if (
      !this.#isSessionCurrent(session) || reconciliation === undefined ||
      reconciliation.failedTransactionId !==
        request.failedTransaction.commit.transactionId ||
      reconciliation.transactions.length !== request.descendants.length
    ) {
      return Object.freeze({
        ok: false,
        failedTransactionId:
          request.descendants[0]?.commit.transactionId ??
          request.failedTransaction.commit.transactionId,
        error: editorError(
          this.#isSessionCurrent(session)
            ? BOM_EDITOR_ERROR_CODES.persistenceSuspended
            : BOM_EDITOR_ERROR_CODES.aborted,
          this.#isSessionCurrent(session) ? 'CONFLICT' : 'ABORTED',
        ),
      });
    }
    session.reconciliation = undefined;
    return Object.freeze({
      ok: true,
      revision: reconciliation.result.commit.revision,
      transactions: reconciliation.transactions,
    });
  }

  #captureRemoteEnvelope(
    session: EditorPersistenceSession<TFields>,
    input: BomRemotePatchEnvelope<TFields>,
  ): void {
    if (!this.#isSessionCurrent(session) || session.remote.stopped) return;
    const normalized = normalizeBomValue(input, {
      path: ['editor', 'remoteEnvelope'],
    });
    if (!normalized.ok) {
      this.#requestPersistenceReload(
        session, normalized.errors[0]!, 'resync',
      );
      return;
    }
    const envelope = normalized.value as unknown as
      BomRemotePatchEnvelope<TFields>;
    void this.#enqueue(() => this.#handleRemoteEnvelope(session, envelope));
  }

  async #handleRemoteEnvelope(
    session: EditorPersistenceSession<TFields>,
    envelope: BomRemotePatchEnvelope<TFields>,
  ): Promise<BomResult<void>> {
    if (!this.#isSessionCurrent(session) || session.remote.stopped) {
      return this.#abortedFailure();
    }
    const envelopeFingerprint = encodeCanonicalValue(
      envelope as unknown as BomValue,
    );
    const duplicate = session.remote.fingerprints.get(envelope.sequence);
    if (duplicate !== undefined) {
      if (duplicate === envelopeFingerprint) return editorSuccess(undefined);
      return this.#failRemoteEnvelope(session, 'sequenceDuplicate');
    }
    if (
      envelope.protocolVersion !== this.#protocolVersion ||
      envelope.documentId !== session.documentId ||
      !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1 ||
      (session.remote.lastSequence !== undefined &&
        envelope.sequence !== session.remote.lastSequence + 1) ||
      typeof envelope.previousSourceRevision !== 'string' ||
      envelope.previousSourceRevision.length === 0 ||
      typeof envelope.sourceRevision !== 'string' ||
      envelope.sourceRevision.length === 0
    ) {
      return this.#failRemoteEnvelope(session, 'envelopeMetadata');
    }
    const own = session.ownTransactions.get(envelope.sourceTransactionId);
    if (own !== undefined) {
      if (
        own.status === 'cancelled' || own.status === 'rejected' ||
        own.status === 'conflicted' || own.status === 'reloadRequired' ||
        own.fingerprint !== operationFingerprint(envelope.operations) ||
        (own.sourceRevision !== undefined &&
          own.sourceRevision !== envelope.sourceRevision) ||
        envelope.previousSourceRevision !== session.remote.sourceRevision
      ) {
        return this.#failRemoteEnvelope(session, 'ownEchoMismatch');
      }
      if (own.sourceRevision === undefined) {
        own.sourceRevision = envelope.sourceRevision;
      }
      this.#advanceRemoteSequence(session, envelope, envelopeFingerprint);
      return editorSuccess(undefined);
    }
    if (envelope.previousSourceRevision !== session.remote.sourceRevision) {
      return this.#failRemoteEnvelope(session, 'sourceRevisionGap');
    }
    const preAppliedFingerprint = session.remote.preAppliedFingerprints.get(
      envelope.sourceRevision,
    );
    if (preAppliedFingerprint !== undefined) {
      if (preAppliedFingerprint !== operationFingerprint(envelope.operations)) {
        return this.#failRemoteEnvelope(session, 'preAppliedRemoteMismatch');
      }
      session.remote.preAppliedFingerprints.delete(envelope.sourceRevision);
      this.#advanceRemoteSequence(session, envelope, envelopeFingerprint);
      return editorSuccess(undefined);
    }
    if (
      session.pending.size > 0 ||
      (session.coordinator?.pendingCount ?? 0) > 0
    ) {
      return this.#failRemoteEnvelope(session, 'remoteWhilePending');
    }
    const transactionId =
      `remote:${envelope.sourceTransactionId}:${envelope.sequence}`;
    const patch: BomPatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: session.documentId,
      baseRevision: this.#published.snapshot.revision,
      transactionId,
      origin: 'dataSource:remote',
      timestamp: new Date().toISOString(),
      operations: envelope.operations,
    });
    const attempt: TransactionAttempt = Object.freeze({
      transactionId,
      origin: patch.origin,
      baseRevision: patch.baseRevision,
    });
    this.#resetPreparation();
    const applied = await this.#engine.applyPatch(patch);
    if (!applied.ok || !this.#isSessionCurrent(session)) {
      this.#resetPreparation();
      return this.#failRemoteEnvelope(session, 'remotePatchRejected');
    }
    const acknowledged = await this.#engine.acknowledgeSourceRevision({
      sourceRevision: envelope.sourceRevision,
      expectedLocalRevision: applied.value.revision,
      expectedPriorSourceRevision: envelope.previousSourceRevision,
    });
    if (!acknowledged.ok || !this.#isSessionCurrent(session)) {
      this.#resetPreparation();
      return this.#failRemoteEnvelope(session, 'remoteRevisionRejected');
    }
    const finished = this.#finishTransaction(applied, attempt);
    if (!finished.ok) {
      return this.#failRemoteEnvelope(session, 'remotePublishRejected');
    }
    session.historyOwners.push(Object.freeze({
      transactionId,
      kind: 'remote',
    }));
    this.#advanceRemoteSequence(session, envelope, envelopeFingerprint);
    return editorSuccess(undefined);
  }

  #advanceRemoteSequence(
    session: EditorPersistenceSession<TFields>,
    envelope: BomRemotePatchEnvelope<TFields>,
    fingerprint: string,
  ): void {
    session.remote.lastSequence = envelope.sequence;
    session.remote.sourceRevision = envelope.sourceRevision;
    session.remote.fingerprints.set(envelope.sequence, fingerprint);
    trimMap(session.remote.fingerprints, 64);
  }

  #failRemoteEnvelope(
    session: EditorPersistenceSession<TFields>,
    reason: string,
  ): BomResult<void> {
    const error = editorError(
      BOM_EDITOR_ERROR_CODES.remoteProtocolViolation,
      'CONFLICT',
      { reason },
    );
    this.#requestPersistenceReload(session, error, 'resync');
    return editorFailure(error);
  }

  #requestPersistenceReload(
    session: EditorPersistenceSession<TFields>,
    error: BomError,
    reason: 'reload' | 'resync',
  ): void {
    if (!this.#isSessionCurrent(session) || session.reloading) return;
    session.reloading = true;
    session.remote.stopped = true;
    const unsubscribe = session.unsubscribe;
    session.unsubscribe = undefined;
    if (unsubscribe !== undefined) {
      try { unsubscribe(); } catch { /* The stopped token still isolates it. */ }
    }
    for (const record of session.pending.values()) {
      if (record.state === 'reloadRequired') continue;
      this.#emitPersistenceState(
        session, record.commit, 'reloadRequired', undefined, error,
      );
      this.#transitionOwnTransaction(
        session, record.commit.transactionId, 'reloadRequired',
      );
    }
    this.#emitRuntimeError(error, 'document');
    const controller = new AbortController();
    session.reloadController = controller;
    void this.#performPersistenceReload(session, controller, reason);
  }

  async #performPersistenceReload(
    session: EditorPersistenceSession<TFields>,
    controller: AbortController,
    reason: 'reload' | 'resync',
  ): Promise<void> {
    try {
      if (
        session.coordinator !== undefined &&
        session.coordinator.pendingCount > 0
      ) {
        const idleWait = await waitForAbortSignal(
          session.coordinator.whenIdle(),
          controller.signal,
        );
        if (idleWait.aborted) return;
        const idle = idleWait.value;
        if (idle.status !== 'idle') {
          session.reloading = false;
          return;
        }
      }
      if (!this.#isSessionCurrent(session) || controller.signal.aborted) return;
      const loadWait = await waitForAbortSignal(
        session.source.loadDocument({ signal: controller.signal }),
        controller.signal,
      );
      if (loadWait.aborted) return;
      const loaded = loadWait.value;
      if (!this.#isSessionCurrent(session) || controller.signal.aborted) return;
      const normalized = normalizeBomDocumentSnapshot<TFields>(
        loaded, this.#schema,
      );
      if (!normalized.ok) {
        this.#emitRuntimeError(normalized.errors[0]!, 'document');
        session.reloading = false;
        return;
      }
      await this.#enqueue(async () => {
        if (!this.#isSessionCurrent(session) || controller.signal.aborted) {
          return this.#abortedFailure();
        }
        const replaced = await this.#replaceDocument(
          normalized.value, reason, 'dataSource',
        );
        if (!replaced.ok) {
          session.reloading = false;
          return replaced;
        }
        this.#deactivatePersistenceSession('reload');
        this.#sourceEpoch += 1;
        this.#sourceLoaded = true;
        const activated = this.#activatePersistenceSession(session.source);
        return activated;
      });
    } catch (failure) {
      if (!this.#isSessionCurrent(session) || controller.signal.aborted) return;
      const error = failure instanceof BomDataSourceException
        ? failure.error
        : editorError(BOM_EDITOR_ERROR_CODES.remoteResyncRequired, 'IO');
      this.#emitRuntimeError(error, 'document');
      session.reloading = false;
    } finally {
      if (session.reloadController === controller) {
        session.reloadController = undefined;
      }
    }
  }

  async #loadInitialSource(): Promise<BomResult<void>> {
    const source = this.#source;
    if (source === undefined || this.#sourceLoaded) {
      return editorSuccess(undefined);
    }
    const controller = new AbortController();
    const sourceEpoch = this.#sourceEpoch;
    const documentGeneration = this.#published.documentGeneration;
    this.#sourceController = controller;
    try {
      const loadWait = await waitForAbortSignal(
        source.loadDocument({ signal: controller.signal }),
        controller.signal,
      );
      if (loadWait.aborted) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      const snapshot = loadWait.value;
      if (
        sourceEpoch !== this.#sourceEpoch || source !== this.#source ||
        documentGeneration !== this.#published.documentGeneration ||
        this.#isDestroyedOrDestroying()
      ) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      const normalized = normalizeBomDocumentSnapshot<TFields>(
        snapshot,
        this.#schema,
      );
      if (!normalized.ok) {
        return editorFailure(normalized.errors[0]!);
      }
      if (
        sourceEpoch !== this.#sourceEpoch || source !== this.#source ||
        documentGeneration !== this.#published.documentGeneration ||
        this.#isDestroyedOrDestroying()
      ) {
        return this.#isDestroyedOrDestroying()
          ? this.#destroyedFailure()
          : this.#abortedFailure();
      }
      const replaced = await this.#replaceDocument(
        normalized.value,
        'initialLoad',
        'dataSource',
      );
      if (replaced.ok) {
        this.#sourceLoaded = true;
        const activated = this.#activatePersistenceSession(source);
        if (!activated.ok) return activated;
      }
      return replaced;
    } catch (failure) {
      return editorFailure(
        failure instanceof BomDataSourceException
          ? failure.error
          : editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'),
      );
    } finally {
      if (this.#sourceController === controller) {
        this.#sourceController = undefined;
      }
    }
  }

  async #replaceDocument(
    snapshot: BomDocumentSnapshot<TFields>,
    reason:
      | 'setDocument'
      | 'initialLoad'
      | 'replaceSource'
      | 'reload'
      | 'resync'
      | 'loadChildren',
    sourceType: 'memory' | 'dataSource',
    preserveView = true,
    preserveSelection = false,
  ): Promise<BomResult<void>> {
    const nextGeneration = this.#published.documentGeneration + 1;
    const indexesResult = buildBomIndexes(snapshot);
    if (!indexesResult.ok) {
      return editorFailure(indexesResult.errors[0]!);
    }
    const indexes = indexesResult.value;
    const expandedIds = preserveView
      ? this.#published.projection
          .expandedOccurrenceIds()
          .filter((occurrenceId) => indexes.rowById.has(occurrenceId))
      : [];
    const projection = createVisibleProjection(snapshot, {
      indexes,
      ...(this.#rowHeight === undefined
        ? {}
        : { rowHeight: this.#rowHeight }),
      rowHeightOverrides: preserveView
        ? rowHeightOverrideMap(this.#published.projection, indexes)
        : new Map(),
      expandedIds,
      viewChildrenByParent: buildViewChildrenByParent(snapshot, indexes, this.#viewQuery),
    });
    if (!projection.ok) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'),
      );
    }
    const engine = this.#buildEngine(snapshot, nextGeneration);
    if (!engine.ok) {
      return editorFailure(engine.error);
    }
    const previousReference = this.#documentReference(this.#published);
    const nextReference = documentReference(
      snapshot,
      nextGeneration,
      sourceType,
    );
    const before = this.#events.dispatch('beforeDocumentReplace', {
      previous: previousReference,
      next: nextReference,
      reason,
    });
    if (!before.ok) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.eventDispatchFailed, 'INTERNAL'),
      );
    }
    if (before.event.defaultPrevented) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
      );
    }
    this.#endActiveEdit('document-replaced');
    const previousSelection = this.#selection;
    this.#engine = engine.value;
    this.#historyUndo.length = 0;
    this.#historyRedo.length = 0;
    this.#published = Object.freeze({
      snapshot,
      indexes,
      projection: projection.value,
      documentGeneration: nextGeneration,
      sourceType,
    });
    this.#clearDiffViewIfNotCurrent();
    this.#expireFixProposals();
    this.#validationState.clear();
    this.#replaceSelection(
      preserveSelection
        ? sanitizeSelection(
            previousSelection,
            projection.value,
            indexes,
            this.#columns,
          )
        : firstSelection(projection.value, this.#columns),
    );
    this.#refreshRenderer({ layoutChanged: true });
    this.#events.dispatch('documentReplaced', {
      previous: previousReference,
      next: nextReference,
      reason,
    });
    if (!sameSelection(previousSelection, this.#selection)) {
      this.#events.dispatch('selectionChanged', {
        documentId: snapshot.documentId,
        documentGeneration: nextGeneration,
        previous: previousSelection,
        selection: this.#selection,
        reason: 'document-change',
      });
    }
    return editorSuccess(undefined);
  }

  #beforeApply(prepared: BomPreparedTransaction<TFields>): boolean {
    if (this.#discardingUnpublished) return true;
    if (
      this.#isPrecommitAbortRequested(prepared.patch.transactionId) ||
      this.#isPrecommitPasteStalenessRequested(prepared.patch.transactionId) ||
      this.#isPrecommitClearStalenessRequested(prepared.patch.transactionId) ||
      this.#isPrecommitFillDownStalenessRequested(prepared.patch.transactionId) ||
      this.#isPrecommitFillSelectionStalenessRequested(
        prepared.patch.transactionId,
      )
    ) {
      return false;
    }
    let projection = this.#published.projection;
    if (prepared.patch.operations.some(isStructuralOperation)) {
      const expandedIds = projection
        .expandedOccurrenceIds()
        .filter((occurrenceId) => prepared.indexes.rowById.has(occurrenceId));
      const candidate = createVisibleProjection(prepared.snapshot, {
        indexes: prepared.indexes,
        ...(this.#rowHeight === undefined
          ? {}
          : { rowHeight: this.#rowHeight }),
        rowHeightOverrides: rowHeightOverrideMap(projection, prepared.indexes),
        expandedIds,
        viewChildrenByParent: buildViewChildrenByParent(prepared.snapshot, prepared.indexes, this.#viewQuery),
      });
      if (!candidate.ok) {
        this.#preparedError = editorError(
          BOM_EDITOR_ERROR_CODES.internal,
          'INTERNAL',
        );
        return false;
      }
      projection = candidate.value;
    }
    this.#prepared = Object.freeze({
      projection,
      patch: prepared.patch,
    });
    const event = this.#events.dispatch('beforeTransaction', {
      documentId: prepared.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      transactionId: prepared.patch.transactionId,
      origin: prepared.patch.origin,
      previousRevision: prepared.previousRevision,
      revision: prepared.revision,
      patch: prepared.patch,
    });
    if (!event.ok) {
      this.#preparedError = editorError(
        BOM_EDITOR_ERROR_CODES.eventDispatchFailed,
        'INTERNAL',
      );
      return false;
    }
    if (
      this.#isPrecommitAbortRequested(prepared.patch.transactionId) ||
      this.#isPrecommitPasteStalenessRequested(prepared.patch.transactionId) ||
      this.#isPrecommitClearStalenessRequested(prepared.patch.transactionId) ||
      this.#isPrecommitFillDownStalenessRequested(prepared.patch.transactionId) ||
      this.#isPrecommitFillSelectionStalenessRequested(
        prepared.patch.transactionId,
      )
    ) {
      return false;
    }
    return !event.event.defaultPrevented;
  }

  async #finishLocalTransaction(
    result: BomTransactionResult<BomCommit<TFields>>,
    attempt: TransactionAttempt,
    persistence: PersistenceCommitInput<TFields>,
  ): Promise<BomResult<BomCommit<TFields>>> {
    const historyMode: HistoryInteractionMode =
      persistence.recordHistory === false ? 'undo' : 'record';
    if (!result.ok || persistence.session === undefined) {
      return this.#finishTransaction(result, attempt, historyMode);
    }
    const session = persistence.session;
    const recordHistory = persistence.recordHistory ?? true;
    const registered = this.#registerLocalCommit(
      session,
      result.value,
      persistence.commands,
      recordHistory,
    );
    if (!registered.ok) {
      const discarded = await this.#discardUnpublishedCommit(
        result.value,
        recordHistory,
      );
      if (!discarded.ok && this.#isSessionCurrent(session)) {
        this.#requestPersistenceReload(session, discarded.error, 'reload');
      }
      return this.#finishTransaction(
        Object.freeze({ ok: false, errors: Object.freeze([
          discarded.ok ? registered.error : discarded.error,
        ]) }),
        attempt,
        historyMode,
      );
    }
    const finished = this.#finishTransaction(result, attempt, historyMode);
    if (finished.ok) this.#announceLocalCommit(session, registered.value);
    return finished;
  }

  async #discardUnpublishedCommit(
    commit: BomCommit<TFields>,
    recordHistory: boolean,
  ): Promise<BomResult<void>> {
    this.#discardingUnpublished = true;
    try {
      const transactionId = this.#nextTransactionId('discard-unpublished');
      const result = recordHistory
        ? await this.#engine.reconcileHistorySuffix({
            failedTransactionId: commit.transactionId,
            transactionId,
            origin: 'editor:persistence-discard',
            timestamp: new Date().toISOString(),
            descendants: Object.freeze([]),
          })
        : await this.#engine.redo({
            transactionId,
            origin: 'editor:persistence-discard',
            timestamp: new Date().toISOString(),
          });
      return result.ok
        ? editorSuccess(undefined)
        : editorFailure(result.errors[0]!);
    } finally {
      this.#discardingUnpublished = false;
    }
  }

  #finishTransaction(
    result: BomTransactionResult<BomCommit<TFields>>,
    attempt: TransactionAttempt,
    historyMode: HistoryInteractionMode = 'record',
  ): BomResult<BomCommit<TFields>> {
    if (this.#isDestroyedOrDestroying()) {
      this.#resetPreparation();
      return this.#destroyedFailure();
    }
    if (!result.ok) {
      const error = this.#preparedError ?? result.errors[0]!;
      this.#events.dispatch('transactionRejected', {
        documentId: this.#published.snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        transactionId: attempt.transactionId,
        origin: attempt.origin,
        baseRevision: attempt.baseRevision,
        ...(this.#prepared === undefined
          ? {}
          : { patch: this.#prepared.patch }),
        error,
      });
      this.#resetPreparation();
      return editorFailure(error);
    }
    const commit = result.value;
    const historyEntry = historyMode === 'undo'
      ? this.#historyUndo.at(-1)
      : historyMode === 'redo'
        ? this.#historyRedo.at(-1)
        : undefined;
    const documentHistoryEntry = historyEntry?.kind === 'document'
      ? historyEntry
      : undefined;
    const projection = this.#prepared?.projection ?? this.#published.projection;
    const snapshot = this.#engine.getSnapshot();
    const indexes = this.#engine.getIndexes();
    const previousSelection = this.#selection;
    const sanitizedSelection = sanitizeSelection(
      previousSelection,
      projection,
      indexes,
      this.#columns,
    );
    const restoredSelection = documentHistoryEntry === undefined
      ? sanitizedSelection
      : sanitizeSelection(
        historyMode === 'undo'
          ? documentHistoryEntry.beforeSelection
          : documentHistoryEntry.afterSelection,
        projection,
        indexes,
        this.#columns,
      );
    this.#replaceSelection(restoredSelection);
    this.#published = Object.freeze({
      snapshot,
      indexes,
      projection,
      documentGeneration: this.#published.documentGeneration,
      sourceType: this.#published.sourceType,
    });
    this.#clearDiffViewIfNotCurrent();
    this.#expireFixProposals();
    const afterSelection = this.#selection;
    const afterView = this.#lastView;
    if (historyMode === 'record') {
      this.#historyUndo.push(Object.freeze({
        kind: 'document' as const,
        transactionId: commit.transactionId,
        beforeSelection: previousSelection,
        beforeView: this.#lastView,
        afterSelection,
        afterView,
      }));
      this.#historyRedo.length = 0;
      this.#columnHistoryInvalidatesDocumentRedo = false;
      this.#trimHistoryInteraction();
    } else if (historyMode === 'undo') {
      const moved = this.#historyUndo.pop();
      if (moved !== undefined) this.#historyRedo.push(moved);
      this.#trimHistoryInteraction();
    } else if (historyMode === 'redo') {
      const moved = this.#historyRedo.pop();
      if (moved !== undefined) this.#historyUndo.push(moved);
      this.#trimHistoryInteraction();
    } else if (historyMode === 'reset') {
      this.#historyUndo.length = 0;
      this.#historyRedo.length = 0;
    }
    this.#refreshRenderer(invalidationForPatch(commit.patch, this.#columns));
    this.#events.dispatch('transactionCommitted', {
      documentId: snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      transactionId: commit.transactionId,
      origin: commit.patch.origin,
      previousRevision: commit.previousRevision,
      revision: commit.revision,
      patch: commit.patch,
      commit,
    });
    this.#events.dispatch('documentChanged', {
      documentId: snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      transactionId: commit.transactionId,
      origin: commit.patch.origin,
      previousRevision: commit.previousRevision,
      revision: commit.revision,
      patch: commit.patch,
    });
    if (!sameSelection(previousSelection, this.#selection)) {
      this.#events.dispatch('selectionChanged', {
        documentId: snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        previous: previousSelection,
        selection: this.#selection,
        reason: 'document-change',
      });
    }
    if (documentHistoryEntry !== undefined) {
      this.#restoreHistoryView(
        historyMode === 'undo'
          ? documentHistoryEntry.beforeView
          : documentHistoryEntry.afterView,
      );
    }
    this.#resetPreparation();
    return editorSuccess(commit);
  }

  #trimHistoryInteraction(): void {
    const state = this.#engine.getHistoryState();
    while (this.#historyUndo.filter((entry) => entry.kind === 'document').length > state.undoEntries) {
      const index = this.#historyUndo.findIndex((entry) => entry.kind === 'document');
      if (index < 0) break;
      this.#historyUndo.splice(index, 1);
    }
    while (this.#historyRedo.filter((entry) => entry.kind === 'document').length > state.redoEntries) {
      const index = this.#historyRedo.findIndex((entry) => entry.kind === 'document');
      if (index < 0) break;
      this.#historyRedo.splice(index, 1);
    }
    const maxEntries = this.#history?.maxEntries ?? 100;
    while (this.#historyUndo.length > maxEntries) {
      this.#historyUndo.shift();
    }
    while (this.#historyRedo.length > maxEntries) {
      this.#historyRedo.shift();
    }
  }

  #restoreHistoryView(view: Readonly<BomViewState>): void {
    const renderer = this.#renderer;
    if (renderer === null) return;
    try {
      renderer.scrollToView({
        scrollLeft: view.scrollLeft,
        scrollTop: view.scrollTop,
      });
    } catch {
      this.#emitRuntimeError(
        editorError(BOM_EDITOR_ERROR_CODES.rendererFailed, 'RENDER'),
        'view',
      );
    }
  }

  #updateLatestHistoryInteraction(): void {
    const index = this.#historyUndo.length - 1;
    const entry = this.#historyUndo[index];
    if (entry === undefined || entry.kind !== 'document') return;
    this.#historyUndo[index] = Object.freeze({
      ...entry,
      afterSelection: this.#selection,
      afterView: this.#lastView,
    });
  }

  #viewWithColumns(
    columns: readonly Readonly<BomColumnDefinition>[],
  ): Readonly<BomViewState> {
    return Object.freeze({
      ...this.#lastView,
      columns: freezeViewColumns(columns),
      rowHeights: freezeViewRowHeights(this.#published.projection),
    });
  }

  #recordRowHeightHistory(
    beforeRowHeights: readonly Readonly<BomViewRowHeightState>[],
    beforeSelection: Readonly<BomSelectionState>,
  ): void {
    const afterRowHeights = freezeViewRowHeights(this.#published.projection);
    if (sameRowHeightStates(beforeRowHeights, afterRowHeights)) return;
    this.#historyUndo.push(Object.freeze({
      kind: 'row-height' as const,
      transactionId: `${this.instanceId}:row-height:${++this.#columnHistorySequence}`,
      beforeSelection,
      beforeView: Object.freeze({ ...this.#lastView, rowHeights: beforeRowHeights }),
      afterSelection: this.#selection,
      afterView: Object.freeze({ ...this.#lastView, rowHeights: afterRowHeights }),
      beforeRowHeights,
      afterRowHeights,
    }));
    this.#historyRedo.length = 0;
    this.#trimHistoryInteraction();
  }

  #applyRowHeightHistory(
    entry: HistoryInteractionEntry,
    action: 'undo' | 'redo',
  ): BomResult<BomCommit<TFields>> {
    const heights = action === 'undo' ? entry.beforeRowHeights : entry.afterRowHeights;
    if (entry.kind !== 'row-height' || heights === undefined) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'));
    }
    const target = new Map(heights.map((height) => [height.occurrenceId, height.rowHeight]));
    for (const node of this.#published.snapshot.nodes) {
      const current = this.#published.projection.rowHeightOf(node.occurrenceId);
      if (!current.ok) continue;
      const next = target.get(node.occurrenceId) ?? this.#published.projection.defaultRowHeight;
      this.#published.projection.setRowHeight(node.occurrenceId, next);
    }
    this.#refreshRenderer({ layoutChanged: true });
    const previousView = this.#lastView;
    const view = action === 'undo' ? entry.beforeView : entry.afterView;
    this.#lastView = Object.freeze({ ...view, rowHeights: freezeViewRowHeights(this.#published.projection) });
    this.#events.dispatch('viewChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      previous: previousView,
      view: this.#lastView,
      reason: 'row-height',
    });
    const moved = action === 'undo' ? this.#historyUndo.pop() : this.#historyRedo.pop();
    if (moved !== undefined) {
      (action === 'undo' ? this.#historyRedo : this.#historyUndo).push(moved);
    }
    this.#trimHistoryInteraction();
    return editorSuccess(this.#viewHistoryCommit(entry.transactionId, action, 'row-height'));
  }

  #publishColumnView(): void {
    const previous = this.#lastView;
    const view = this.#viewWithColumns(this.#columns);
    this.#lastView = view;
    this.#events.dispatch('viewChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      previous,
      view,
      reason: 'columns',
    });
  }

  #recordColumnHistory(
    beforeColumns: readonly Readonly<BomColumnDefinition>[],
    beforeSelection: Readonly<BomSelectionState>,
  ): void {
    if (sameColumnLayout(beforeColumns, this.#columns)) {
      return;
    }
    const afterColumns = this.#columns;
    this.#historyUndo.push(Object.freeze({
      kind: 'columns' as const,
      transactionId: `${this.instanceId}:columns:${++this.#columnHistorySequence}`,
      beforeSelection,
      beforeView: this.#viewWithColumns(beforeColumns),
      afterSelection: this.#selection,
      afterView: this.#viewWithColumns(afterColumns),
      beforeColumns: Object.freeze([...beforeColumns]),
      afterColumns: Object.freeze([...afterColumns]),
    }));
    this.#historyRedo.length = 0;
    if (this.#engine.getHistoryState().redoEntries > 0) {
      this.#columnHistoryInvalidatesDocumentRedo = true;
    }
    this.#trimHistoryInteraction();
  }

  #applyColumnHistory(
    entry: HistoryInteractionEntry,
    action: 'undo' | 'redo',
  ): BomResult<BomCommit<TFields>> {
    const columns = action === 'undo' ? entry.beforeColumns : entry.afterColumns;
    if (entry.kind !== 'columns' || columns === undefined) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'));
    }
    const previousSelection = this.#selection;
    this.#columns = Object.freeze([...columns]);
    this.#clearDiffViewIfNotCurrent();
    const nextSelection = sanitizeSelection(
      action === 'undo' ? entry.beforeSelection : entry.afterSelection,
      this.#published.projection,
      this.#published.indexes,
      visibleColumnDefinitions(this.#columns),
    );
    this.#replaceSelection(nextSelection);
    this.#refreshRenderer({ layoutChanged: true });
    if (!sameSelection(previousSelection, nextSelection)) {
      this.#events.dispatch('selectionChanged', {
        documentId: this.#published.snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        previous: previousSelection,
        selection: nextSelection,
        reason: 'view-change',
      });
    }
    const previousView = this.#lastView;
    const view = action === 'undo' ? entry.beforeView : entry.afterView;
    this.#lastView = view;
    this.#events.dispatch('viewChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      previous: previousView,
      view,
      reason: 'columns',
    });
    if (action === 'undo') {
      const moved = this.#historyUndo.pop();
      if (moved !== undefined) this.#historyRedo.push(moved);
    } else {
      const moved = this.#historyRedo.pop();
      if (moved !== undefined) this.#historyUndo.push(moved);
    }
    this.#trimHistoryInteraction();
    return editorSuccess(this.#viewHistoryCommit(entry.transactionId, action, 'columns'));
  }

  #viewHistoryCommit(
    transactionId: string,
    action: 'undo' | 'redo',
    kind: 'columns' | 'row-height',
  ): BomCommit<TFields> {
    const timestamp = new Date().toISOString();
    const patch: BomPatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#published.snapshot.documentId,
      baseRevision: this.#published.snapshot.revision,
      transactionId,
      origin: `editor:${action}:${kind}`,
      timestamp,
      operations: Object.freeze([]),
    });
    return Object.freeze({
      transactionId,
      previousRevision: this.#published.snapshot.revision,
      revision: this.#published.snapshot.revision,
      patch,
      inversePatch: patch,
      warnings: Object.freeze([]),
    });
  }

  #createRendererCallbacks(): Readonly<BomCanvasRendererCallbacks> {
    return Object.freeze({
      select: (
        address: Readonly<BomCellAddress>,
        reason: BomSelectionChangeReason,
        options?: Readonly<{
          readonly extend: boolean;
          readonly additive?: boolean;
          readonly mode?: BomSelectionMode;
        }>,
      ): void => this.#select(
        address,
        reason,
        options?.extend === true,
        options?.additive === true,
        options?.mode,
      ),
      selectAll: (): void => this.#selectAll(),
      undo: (): void => this.#runHistoryShortcut('undo'),
      redo: (): void => this.#runHistoryShortcut('redo'),
      clearSelection: (): void => this.#clearSelection(),
      fillDown: (): void => this.#fillDown(),
      fillSeries: (): void => this.fillSeries(),
      deleteSubtree: (): void => this.#deleteSelectedSubtree(),
      insertSelection: (mode: BomTreeInsertMode): void => {
        void this.#insertSelectedSubtree(mode);
      },
      setExpansionAll: (expanded: boolean): void => this.#setExpansionAll(expanded),
      beginColumnResize: (columnId: string, width: number): void =>
        this.#beginColumnResizeHistory(columnId, width),
      resizeColumn: (
        columnId: string,
        width: number,
        reason: 'pointer' | 'keyboard',
      ): void => this.#resizeColumn(columnId, width, reason),
      endColumnResize: (columnId: string, width: number): void =>
        this.#endColumnResizeHistory(columnId, width),
      setRowHeight: (
        occurrenceId: OccurrenceId,
        rowHeight: number,
        _reason: 'pointer' | 'keyboard',
      ): void => {
        this.setRowHeight(occurrenceId, rowHeight);
      },
      resetColumnWidth: (columnId: string, _reason: 'pointer' | 'keyboard'): void => {
        this.#resetColumnWidth(columnId);
      },
      reorderColumns: (
        columnIds: readonly string[],
        reason: 'pointer' | 'keyboard',
      ): void => this.#reorderColumns(columnIds, reason),
      setColumnVisibility: (
        columnIds: readonly string[],
        visible: boolean,
        reason: BomCanvasColumnVisibilityReason,
      ): void => this.#setColumnVisibility(columnIds, visible, reason),
      insertColumn: (
        referenceColumnId: string,
        position: BomColumnInsertPosition,
        count: number,
        reason: BomCanvasColumnInsertReason,
      ): void => {
        this.#insertColumn(referenceColumnId, position, count, reason);
      },
      deleteColumns: (
        columnIds: readonly string[],
        reason: BomCanvasColumnDeleteReason,
      ): void => {
        this.#deleteColumns(columnIds, reason);
      },
      setColumnFrozen: (
        columnId: string,
        frozen: BomFrozenColumnPosition,
      ): void => {
        this.#setColumnFrozen(columnId, frozen);
      },
      sortColumn: (columnId: string, direction: 'asc' | 'desc'): void => {
        const column = this.#columns.find((candidate) => candidate.columnId === columnId);
        if (column !== undefined) {
          this.setViewQuery({ sort: [{ fieldPath: column.fieldPath, direction }] });
        }
      },
      filterColumnValue: (columnId: string, value: BomValue): void => {
        const column = this.#columns.find((candidate) => candidate.columnId === columnId);
        if (column !== undefined) {
          this.setViewQuery({ filters: [{ fieldPath: column.fieldPath, operator: 'equals', value }] });
        }
      },
      clearViewQuery: (): void => {
        this.setViewQuery();
      },
      clearColumnFormat: (columnId: string): void => {
        const next = this.#columns.map((column) => {
          if (column.columnId !== columnId) return column;
          const { format: _format, alignment: _alignment, wrapText: _wrapText, ...withoutFormat } = column;
          return Object.freeze(withoutFormat);
        });
        this.#replaceColumns(Object.freeze(next));
      },
      moveSelection: (direction: BomTreeMoveDirection): void => {
        void this.#moveSelectedSubtree(direction);
      },
      moveSubtree: (request: Readonly<BomTreeMoveRequest>): void => {
        void this.#moveDraggedSubtree(request);
      },
      copy: (): Readonly<BomCanvasClipboardPayload> | null =>
        this.#prepareClipboardCopy(),
      cut: (): Readonly<BomCanvasClipboardPayload> | null =>
        this.#prepareClipboardCut(),
      copyBranch: (): Readonly<BomCanvasClipboardPayload> | null =>
        this.#prepareClipboardBranchWrite('copy-branch'),
      cutBranch: (): Readonly<BomCanvasClipboardPayload> | null =>
        this.#prepareClipboardBranchWrite('cut-branch'),
      paste: (input: Readonly<BomPasteInput>): void => {
        void this.#paste(input, 'event');
      },
      clipboardWrite: (
        id: string,
        method: 'async' | 'event-fallback',
        outcome: 'written' | 'failed',
      ): void => this.#recordClipboardWrite(id, method, outcome),
      toggleExpansion: (
        address: Readonly<BomCellAddress>,
        expanded: boolean,
      ): void => this.#toggleExpansion(address, expanded),
      requestEdit: (
        address: Readonly<BomCellAddress>,
        trigger: BomEditTrigger,
      ): void => this.#requestEdit(address, trigger),
      draftInput: (
        address: Readonly<BomCellAddress>,
        value: string,
        inputType: 'insert' | 'delete' | 'replace' | 'composition',
      ): void => this.#draftInput(address, value, inputType),
      commit: (
        address: Readonly<BomCellAddress>,
        reason: BomEditCommitReason,
      ): void => {
        void this.#commitEdit(address, reason);
      },
      cancel: (address: Readonly<BomCellAddress>): void =>
        this.#cancelEdit(address),
      composition: (
        address: Readonly<BomCellAddress>,
        phase: 'start' | 'end',
      ): void => this.#composition(address, phase),
      viewChange: (
        view: Readonly<BomViewState>,
        reason: 'scroll' | 'resize' | 'projection' | 'columns' | 'row-height' | 'api',
      ): void => {
        const previous = this.#lastView;
        this.#lastView = Object.freeze({
          ...view,
          ...(this.#viewQuery.filters === undefined
            ? {}
            : { filters: this.#viewQuery.filters }),
          ...(this.#viewQuery.sort === undefined
            ? {}
            : { sort: this.#viewQuery.sort }),
        });
        this.#events.dispatch('viewChanged', {
          documentId: this.#published.snapshot.documentId,
          documentGeneration: this.#published.documentGeneration,
          previous,
          view: this.#lastView,
          reason,
        });
      },
    });
  }

  #runHistoryShortcut(action: 'undo' | 'redo'): void {
    const task = action === 'undo' ? this.undo() : this.redo();
    void task.catch((): void => {
      this.#emitRuntimeError(
        editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'),
        'transaction',
      );
    });
  }

  #prepareClipboardCopy(): Readonly<BomCanvasClipboardPayload> | null {
    return this.#prepareClipboardWrite('copy');
  }

  #prepareClipboardCut(): Readonly<BomCanvasClipboardPayload> | null {
    return this.#prepareClipboardWrite('cut');
  }

  /**
   * Prepares the independent tree clipboard command. Branch scope is resolved
   * from stable occurrence IDs before any node fields are read; the policy is
   * therefore still the first value-bearing step. A branch envelope is kept
   * separate from the cell-grid parser and is intentionally not accepted by
   * ordinary paste yet.
   */
  #prepareClipboardBranchWrite(
    operation: 'copy-branch' | 'cut-branch',
  ): Readonly<BomCanvasClipboardPayload> | null {
    if (this.#isDestroyedOrDestroying()) return null;
    const state = this.#published;
    const formats = Object.freeze([
      'text/plain',
      'text/html',
      'internal',
    ] as const);
    const selection = this.#branchSelection();
    if (!selection.ok) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: 0,
        fieldIds: [],
        formats,
        reasonCode: selection.reasonCode,
      });
      return null;
    }
    const branch = selection.value;
    if (
      branch.nodeIds.length === 0 ||
      branch.nodeIds.length > DEFAULT_BRANCH_NODE_LIMIT
    ) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: branch.nodeIds.length,
        fieldIds: [],
        formats,
        branch: branch.scope,
        reasonCode: 'branch-node-limit',
      });
      return null;
    }
    if (this.#pendingClipboardWrites.size >= MAX_PENDING_CLIPBOARD_WRITES) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: branch.nodeIds.length,
        fieldIds: [],
        formats,
        branch: branch.scope,
        reasonCode: 'pending-capacity',
      });
      return null;
    }
    if (operation === 'cut-branch') {
      const persistence = this.#persistenceForMutation();
      if (!persistence.ok) {
        this.#emitClipboardOperation({
          operation,
          outcome: 'failed',
          occurrenceCount: branch.nodeIds.length,
          fieldIds: [],
          formats,
          branch: branch.scope,
          reasonCode: cutFailureReasonCode(persistence.error),
        });
        return null;
      }
    }
    // A branch cut removes complete nodes, so a partial field decision would
    // create data loss. The first branch slice consequently requires every
    // schema field in its original form for both copy and cut.
    const requestedFieldIds = uniqueStrings(
      this.#schema.fields.map((field) => field.fieldId),
    );
    if (!this.#dispatchBeforeCopy({
      operation,
      occurrenceCount: branch.nodeIds.length,
      fieldIds: requestedFieldIds,
      formats,
      branch: branch.scope,
    })) {
      return null;
    }
    const request: Readonly<BomClipboardRequest> = Object.freeze({
      operation,
      occurrenceIds: branch.nodeIds,
      fieldIds: Object.freeze([...requestedFieldIds]),
      formats,
      branch: branch.scope,
    });
    let decision: Readonly<BomClipboardDecision>;
    try {
      decision = this.#clipboardPolicy?.authorize(request) ??
        DEFAULT_CLIPBOARD_DECISION;
    } catch {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: branch.nodeIds.length,
        fieldIds: requestedFieldIds,
        formats,
        branch: branch.scope,
        reasonCode: 'policy-error',
      });
      return null;
    }
    const authorization = normalizeClipboardDecision(
      decision,
      requestedFieldIds,
    );
    if (authorization.status === 'invalid') {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: branch.nodeIds.length,
        fieldIds: requestedFieldIds,
        formats,
        branch: branch.scope,
        reasonCode: 'invalid-policy-decision',
      });
      return null;
    }
    if (authorization.status === 'denied') {
      this.#emitClipboardOperation({
        operation,
        outcome: 'denied',
        occurrenceCount: branch.nodeIds.length,
        fieldIds: requestedFieldIds,
        formats,
        branch: branch.scope,
        decisionId: authorization.decisionId,
        ...(authorization.reasonCode === undefined
          ? {}
          : { reasonCode: authorization.reasonCode }),
      });
      return null;
    }
    if (
      authorization.allowedFieldIds.size !== requestedFieldIds.length ||
      authorization.maskingByFieldId.size !== 0
    ) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'denied',
        occurrenceCount: branch.nodeIds.length,
        fieldIds: requestedFieldIds,
        formats,
        branch: branch.scope,
        decisionId: authorization.decisionId,
        reasonCode: 'branch-requires-original-values',
      });
      return null;
    }
    // Policy authorization intentionally precedes this node-field read.
    const serialized = this.#serializeBranchRepresentations(
      branch,
      state,
    );
    if (!serialized.ok) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: branch.nodeIds.length,
        fieldIds: requestedFieldIds,
        formats,
        branch: branch.scope,
        decisionId: authorization.decisionId,
        reasonCode: serialized.reasonCode,
      });
      return null;
    }
    if (this.#isDestroyedOrDestroying() || this.#published !== state) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
        occurrenceCount: branch.nodeIds.length,
        fieldIds: requestedFieldIds,
        formats,
        branch: branch.scope,
        decisionId: authorization.decisionId,
        reasonCode: 'stale-document',
      });
      return null;
    }
    this.#clipboardSequence += 1;
    const id = operation + '-' + String(this.#clipboardSequence);
    const audit = Object.freeze({
      decisionId: authorization.decisionId,
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      occurrenceCount: branch.nodeIds.length,
      fieldIds: Object.freeze(requestedFieldIds),
      formats,
      branch: branch.scope,
    });
    if (operation === 'cut-branch') {
      const commands = Object.freeze(
        branch.scope.rootOccurrenceIds.map((occurrenceId) =>
          Object.freeze({ type: 'deleteSubtree' as const, occurrenceId }),
        ),
      );
      this.#pendingClipboardWrites.set(
        id,
        Object.freeze({
          ...audit,
          operation,
          baseRevision: state.snapshot.revision,
          mountGeneration: this.#mountGeneration,
          commands,
        }),
      );
    } else {
      this.#pendingClipboardWrites.set(
        id,
        Object.freeze({ ...audit, operation }),
      );
    }
    return Object.freeze({
      id,
      text: serialized.text,
      html: serialized.html,
      internal: serialized.internal,
      kind: 'branch-tree' as const,
    });
  }

  #branchSelection(): BranchSelectionResult {
    if (this.#published.snapshot.completeness !== 'complete') {
      return { ok: false, reasonCode: 'branch-partial-structure' };
    }
    if (this.#selection.ranges !== undefined) {
      return { ok: false, reasonCode: 'branch-multi-range-unsupported' };
    }
    const active = this.#selection.activeCell;
    if (active === null) return { ok: false, reasonCode: 'branch-no-selection' };
    if (this.#selection.mode === 'column') {
      return { ok: false, reasonCode: 'branch-column-selection' };
    }
    const roots: OccurrenceId[] = [];
    const range = this.#selection.range;
    if (this.#selection.mode === 'row' && range !== null) {
      const anchor = this.#published.projection.indexOf(range.anchor.occurrenceId);
      const focus = this.#published.projection.indexOf(range.focus.occurrenceId);
      if (!anchor.ok || anchor.value === undefined || !focus.ok || focus.value === undefined) {
        return { ok: false, reasonCode: 'branch-selection-stale' };
      }
      const first = Math.min(anchor.value, focus.value);
      const last = Math.max(anchor.value, focus.value);
      for (let index = first; index <= last; index += 1) {
        const occurrence = this.#published.projection.occurrenceAt(index);
        if (!occurrence.ok || occurrence.value === undefined) {
          return { ok: false, reasonCode: 'branch-selection-stale' };
        }
        roots.push(occurrence.value);
      }
    } else if (
      range !== null &&
      range.anchor.occurrenceId !== range.focus.occurrenceId
    ) {
      return { ok: false, reasonCode: 'branch-requires-single-row' };
    } else {
      roots.push(active.occurrenceId);
    }
    const uniqueRoots = [...new Set(roots)];
    if (uniqueRoots.length !== roots.length || uniqueRoots.length === 0) {
      return { ok: false, reasonCode: 'branch-duplicate-root' };
    }
    const rootSet = new Set(uniqueRoots);
    for (const rootId of uniqueRoots) {
      let current = this.#published.indexes.rowById.get(rootId);
      if (current === undefined) return { ok: false, reasonCode: 'branch-selection-stale' };
      while (current.parentId !== null) {
        if (rootSet.has(current.parentId)) {
          return { ok: false, reasonCode: 'branch-nested-roots' };
        }
        const parent = this.#published.indexes.rowById.get(current.parentId);
        if (parent === undefined) return { ok: false, reasonCode: 'branch-parent-missing' };
        current = parent;
      }
    }
    const nodeIds: OccurrenceId[] = [];
    const visited = new Set<OccurrenceId>();
    const stack = [...uniqueRoots].reverse();
    while (stack.length > 0) {
      const occurrenceId = stack.pop()!;
      if (visited.has(occurrenceId)) continue;
      const node = this.#published.indexes.rowById.get(occurrenceId);
      if (node === undefined) return { ok: false, reasonCode: 'branch-node-missing' };
      visited.add(occurrenceId);
      nodeIds.push(occurrenceId);
      const children = this.#published.indexes.childrenByParent.get(occurrenceId) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]!);
      }
    }
    return {
      ok: true,
      value: Object.freeze({
        scope: Object.freeze({
          rootOccurrenceIds: Object.freeze(uniqueRoots),
          ...DEFAULT_BRANCH_SCOPE,
        }),
        nodeIds: Object.freeze(nodeIds),
      }),
    };
  }

  #serializeBranchRepresentations(
    selection: Readonly<BranchSelection>,
    state: Readonly<PublishedState<TFields>>,
  ): BranchRepresentationSerialization {
    const nodes: BomNode<TFields>[] = [];
    const rows: string[][] = [];
    const depthById = new Map<OccurrenceId, number>();
    for (const rootId of selection.scope.rootOccurrenceIds) {
      depthById.set(rootId, 0);
    }
    for (const occurrenceId of selection.nodeIds) {
      const node = state.indexes.rowById.get(occurrenceId);
      if (node === undefined) return { ok: false, reasonCode: 'branch-node-missing' };
      const depth = depthById.get(occurrenceId) ?? 0;
      nodes.push(node);
      rows.push([
        String(depth),
        safeSpreadsheetText(node.kind),
        safeSpreadsheetText(node.materialCode ?? ''),
      ]);
      if (rows.at(-1)!.some((cell) =>
        boundedUtf8ByteLength(cell, 64 * 1024) > 64 * 1024,
      )) {
        return { ok: false, reasonCode: 'branch-cell-byte-limit' };
      }
      const children = state.indexes.childrenByParent.get(occurrenceId) ?? [];
      for (const child of children) depthById.set(child, depth + 1);
      const fieldBytes = boundedUtf8ByteLength(
        JSON.stringify(node.fields) ?? '',
        64 * 1024,
      );
      if (fieldBytes > 64 * 1024) return { ok: false, reasonCode: 'branch-cell-byte-limit' };
    }
    const text = rows.map((row) => row.map(escapeClipboardTsvCell).join('\t')).join('\r\n');
    const html = '<table><tbody>' + rows.map((row) =>
      '<tr>' + row.map((cell) => '<td>' + escapeClipboardHtmlCell(cell) + '</td>').join('') + '</tr>',
    ).join('') + '</tbody></table>';
    const internal = JSON.stringify({
      format: BOM_INTERNAL_CLIPBOARD_FORMAT,
      version: BOM_INTERNAL_CLIPBOARD_VERSION,
      kind: 'branch-tree',
      roots: selection.scope.rootOccurrenceIds,
      includeDescendants: selection.scope.includeDescendants,
      nodes,
    });
    if (
      boundedUtf8ByteLength(text, 1024 * 1024) > 1024 * 1024 ||
      boundedUtf8ByteLength(html, 1024 * 1024) > 1024 * 1024 ||
      boundedUtf8ByteLength(internal, 1024 * 1024) > 1024 * 1024
    ) {
      return { ok: false, reasonCode: 'branch-byte-limit' };
    }
    return { ok: true, text, html, internal };
  }

  #prepareClipboardWrite(
    operation: BomClipboardOperation,
  ): Readonly<BomCanvasClipboardPayload> | null {
    if (this.#isDestroyedOrDestroying()) {
      return null;
    }
    const state = this.#published;
    const formats = Object.freeze([
      'text/plain',
      'text/html',
      'internal',
    ] as const);
    const selected = this.#clipboardSelection(
      operation === 'cut'
        ? DEFAULT_CUT_SELECTION_LIMITS
        : DEFAULT_COPY_SELECTION_LIMITS,
      operation + '-selection-limit',
    );
    if (!selected.ok) {
      if (selected.reasonCode !== undefined) {
        this.#emitClipboardOperation({
          operation,
          outcome: 'failed',
          occurrenceCount: selected.occurrenceCount,
          fieldIds: [],
          formats,
          reasonCode: selected.reasonCode,
        });
      }
      return null;
    }
    const selection = selected.value;
    const requestedFieldIds = uniqueStrings(
      selection.columns.map((entry) => entry.field.fieldId),
    );
    if (!this.#dispatchBeforeCopy({
      operation,
      occurrenceCount: selection.occurrenceIds.length,
      fieldIds: requestedFieldIds,
      formats,
    })) {
      return null;
    }
    if (this.#pendingClipboardWrites.size >= MAX_PENDING_CLIPBOARD_WRITES) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: selection.occurrenceIds.length,
        fieldIds: requestedFieldIds,
        formats,
        reasonCode: 'pending-capacity',
      });
      return null;
    }
    if (operation === 'cut') {
      const persistence = this.#persistenceForMutation();
      if (!persistence.ok) {
        this.#emitClipboardOperation({
          operation,
          outcome: 'failed',
          occurrenceCount: selection.occurrenceIds.length,
          fieldIds: requestedFieldIds,
          formats,
          reasonCode: cutFailureReasonCode(persistence.error),
        });
        return null;
      }
      const preflight = this.#validateCutSelection(selection);
      if (preflight !== undefined) {
        this.#emitClipboardOperation({
          operation,
          outcome: 'failed',
          occurrenceCount: selection.occurrenceIds.length,
          fieldIds: requestedFieldIds,
          formats,
          reasonCode: preflight,
        });
        return null;
      }
    }
    const request: Readonly<BomClipboardRequest> = Object.freeze({
      operation,
      occurrenceIds: Object.freeze([...selection.occurrenceIds]),
      fieldIds: Object.freeze([...requestedFieldIds]),
      formats,
    });
    let decision: Readonly<BomClipboardDecision>;
    try {
      decision = this.#clipboardPolicy?.authorize(request) ??
        DEFAULT_CLIPBOARD_DECISION;
    } catch {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: selection.occurrenceIds.length,
        fieldIds: requestedFieldIds,
        formats,
        reasonCode: 'policy-error',
      });
      return null;
    }
    const authorization = normalizeClipboardDecision(
      decision,
      requestedFieldIds,
    );
    if (authorization.status === 'invalid') {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: selection.occurrenceIds.length,
        fieldIds: requestedFieldIds,
        formats,
        reasonCode: 'invalid-policy-decision',
      });
      return null;
    }
    if (authorization.status === 'denied') {
      this.#emitClipboardOperation({
        operation,
        outcome: 'denied',
        occurrenceCount: selection.occurrenceIds.length,
        fieldIds: requestedFieldIds,
        formats,
        decisionId: authorization.decisionId,
        ...(authorization.reasonCode === undefined
          ? {}
          : { reasonCode: authorization.reasonCode }),
      });
      return null;
    }
    if (
      operation === 'cut' &&
      (authorization.allowedFieldIds.size !== requestedFieldIds.length ||
        authorization.maskingByFieldId.size !== 0)
    ) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'denied',
        occurrenceCount: selection.occurrenceIds.length,
        fieldIds: requestedFieldIds,
        formats,
        decisionId: authorization.decisionId,
        reasonCode: 'cut-requires-original-values',
      });
      return null;
    }
    const columns = operation === 'cut'
      ? selection.columns
      : selection.columns.filter((entry) =>
        authorization.allowedFieldIds.has(entry.field.fieldId),
      );
    const fieldIds = uniqueStrings(columns.map((entry) => entry.field.fieldId));
    if (columns.length === 0) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'denied',
        occurrenceCount: selection.occurrenceIds.length,
        fieldIds,
        formats,
        decisionId: authorization.decisionId,
        reasonCode: 'no-authorized-fields',
      });
      return null;
    }
    let commands: readonly BomCommand<TFields>[] | undefined;
    if (operation === 'cut') {
      const prepared = this.#prepareCutCommands(selection);
      if (!prepared.ok) {
        this.#emitClipboardOperation({
          operation,
          outcome: 'failed',
          occurrenceCount: selection.occurrenceIds.length,
          fieldIds,
          formats,
          decisionId: authorization.decisionId,
          reasonCode: prepared.reasonCode,
        });
        return null;
      }
      commands = prepared.commands;
    }
    if (this.#isDestroyedOrDestroying() || this.#published !== state) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
        occurrenceCount: selection.occurrenceIds.length,
        fieldIds,
        formats,
        decisionId: authorization.decisionId,
        reasonCode: 'stale-document',
      });
      return null;
    }
    // Policy authorization above intentionally precedes every field-value read.
    const serialized = this.#serializeClipboardRepresentations(
      selection.occurrenceIds,
      columns,
      authorization,
      operation === 'cut' ? DEFAULT_CUT_OUTPUT_LIMITS : DEFAULT_COPY_OUTPUT_LIMITS,
      operation,
    );
    if (!serialized.ok) {
      this.#emitClipboardOperation({
        operation,
        outcome: 'failed',
        occurrenceCount: selection.occurrenceIds.length,
        fieldIds,
        formats,
        decisionId: authorization.decisionId,
        reasonCode: serialized.reasonCode,
      });
      return null;
    }
    this.#clipboardSequence += 1;
    const id = operation + '-' + String(this.#clipboardSequence);
    const audit = Object.freeze({
      decisionId: authorization.decisionId,
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      occurrenceCount: selection.occurrenceIds.length,
      fieldIds: Object.freeze(fieldIds),
      formats,
    });
    if (operation === 'cut') {
      this.#pendingClipboardWrites.set(
        id,
        Object.freeze({
          ...audit,
          operation: 'cut' as const,
          baseRevision: state.snapshot.revision,
          mountGeneration: this.#mountGeneration,
          commands: commands!,
        }),
      );
    } else {
      this.#pendingClipboardWrites.set(
        id,
        Object.freeze({
          ...audit,
          operation: 'copy' as const,
        }),
      );
    }
    return Object.freeze({
      id,
      text: serialized.text,
      html: serialized.html,
      internal: serialized.internal,
    });
  }

  #validateCutSelection(
    selection: Readonly<ClipboardSelection>,
  ): string | undefined {
    for (const entry of selection.columns) {
      if (!entry.column.editable) return 'cut-read-only';
      if (entry.field.required) return 'cut-required-field';
      if (entry.field.defaultValue !== undefined) return 'cut-defaulted-field';
    }
    return undefined;
  }

  #prepareCutCommands(
    selection: Readonly<ClipboardSelection>,
  ): CutCommandPreparation<TFields> {
    const commands: BomCommand<TFields>[] = [];
    const targetFieldIdsByOccurrence = new Map<OccurrenceId, Set<string>>();
    for (const occurrenceId of selection.occurrenceIds) {
      const node = this.#published.indexes.rowById.get(occurrenceId);
      if (node === undefined) {
        return { ok: false, reasonCode: 'selection-stale' };
      }
      for (const entry of selection.columns) {
        let targetFieldIds = targetFieldIdsByOccurrence.get(occurrenceId);
        if (targetFieldIds?.has(entry.field.fieldId)) {
          continue;
        }
        const value = fieldValue(node.fields, entry.field.path);
        if (value === undefined) {
          return { ok: false, reasonCode: 'cut-field-absent' };
        }
        const valueHash = hashBomFieldValue(value, this.#schema, entry.field);
        if (!valueHash.ok) {
          return { ok: false, reasonCode: 'cut-field-hash-failed' };
        }
        if (targetFieldIds === undefined) {
          targetFieldIds = new Set<string>();
          targetFieldIdsByOccurrence.set(occurrenceId, targetFieldIds);
        }
        targetFieldIds.add(entry.field.fieldId);
        commands.push(
          Object.freeze({
            type: 'unsetField' as const,
            occurrenceId,
            fieldPath: Object.freeze([...entry.field.path]),
            expectedPresent: true,
            expectedValueHash: valueHash.value,
          }),
        );
      }
    }
    return {
      ok: true,
      commands: Object.freeze(commands),
    };
  }

  #clearSelection(): void {
    const editState = this.#editMachine.state.status;
    if (editState !== 'idle' && editState !== 'focused') {
      return;
    }
    this.#ensureEditFocused();
    if (this.#editMachine.state.status !== 'focused') {
      return;
    }
    const state = this.#published;
    const pasteTargetEpoch = this.#pasteTargetEpoch;
    const task = this.#enqueue(() =>
      this.#commitClearSelection(state, pasteTargetEpoch));
    void task.then((result): void => {
      if (!result.ok && !this.#isDestroyedOrDestroying()) {
        this.#emitRuntimeError(result.error, 'transaction');
      }
    });
  }

  /** Deletes the focused tree node or the selected row subtrees atomically. */
  #deleteSelectedSubtree(): void {
    const status = this.#editMachine.state.status;
    if (status !== 'idle' && status !== 'focused') return;
    const occurrenceIds = this.#selectedVisibleStructureIds();
    if (occurrenceIds.length === 0) return;
    const topLevel = occurrenceIds.filter((occurrenceId) =>
      !occurrenceIds.some((otherId) =>
        otherId !== occurrenceId &&
        this.#treeMoveWouldCreateCycle(otherId, occurrenceId)),
    );
    if (topLevel.length === 0) return;
    const task = topLevel.length === 1
      ? this.execute(
        Object.freeze({
          type: 'deleteSubtree' as const,
          occurrenceId: topLevel[0]!,
        }),
        { origin: 'editor:delete-subtree' },
      )
      : this.transaction(
        (builder) => {
          for (const occurrenceId of topLevel) {
            builder.execute({ type: 'deleteSubtree', occurrenceId });
          }
        },
        {
          label: 'delete-subtree-selection',
          origin: 'editor:delete-subtree',
        },
      );
    void task.then((result): void => {
      if (!result.ok && !this.#isDestroyedOrDestroying()) {
        this.#emitRuntimeError(result.error, 'transaction');
      }
    });
  }

  #selectedVisibleStructureIds(): readonly OccurrenceId[] {
    const active = this.#selection.activeCell;
    if (active === null) return Object.freeze([]);
    const selection = this.#selection;
    if (selection.mode !== 'row' || selection.range === null) {
      return Object.freeze([active.occurrenceId]);
    }
    const selected = new Set<OccurrenceId>();
    const ranges = selection.ranges ?? [selection.range];
    for (const range of ranges) {
      const anchor = this.#published.projection.indexOf(
        range.anchor.occurrenceId,
      );
      const focus = this.#published.projection.indexOf(
        range.focus.occurrenceId,
      );
      if (!anchor.ok || anchor.value === undefined ||
          !focus.ok || focus.value === undefined) {
        continue;
      }
      for (
        let index = Math.min(anchor.value, focus.value);
        index <= Math.max(anchor.value, focus.value);
        index += 1
      ) {
        const row = this.#published.projection.occurrenceAt(index);
        if (row.ok && row.value !== undefined) selected.add(row.value);
      }
    }
    if (!selected.has(active.occurrenceId)) {
      return Object.freeze([active.occurrenceId]);
    }
    const ordered: OccurrenceId[] = [];
    for (let index = 0; index < this.#published.projection.visibleCount; index += 1) {
      const row = this.#published.projection.occurrenceAt(index);
      if (row.ok && row.value !== undefined && selected.has(row.value)) {
        ordered.push(row.value);
      }
    }
    return Object.freeze(ordered.length === 0 ? [active.occurrenceId] : ordered);
  }

  /**
   * Hands an unprovable structural move to a controlled host. Partial
   * Snapshots cannot safely compile structural commands because unloaded
   * siblings/descendants may change cycle and placement proofs.
   */
  #emitStructureMoveRequest(
    occurrenceIds: readonly OccurrenceId[],
    intent: BomStructureMoveRequest['intent'],
  ): void {
    if (
      this.#published.snapshot.completeness !== 'partial' ||
      this.#isDestroyedOrDestroying() ||
      occurrenceIds.length === 0
    ) {
      return;
    }
    const request: BomStructureMoveRequest = Object.freeze({
      protocol: BOM_STRUCTURE_MOVE_REQUEST_PROTOCOL,
      requestId: `${this.instanceId}:structure-move:${++this.#structureMoveRequestSequence}`,
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      baseRevision: this.#published.snapshot.revision,
      ...(this.#published.snapshot.sourceRevision === undefined
        ? {}
        : { sourceRevision: this.#published.snapshot.sourceRevision }),
      occurrenceIds: Object.freeze([...occurrenceIds]),
      intent: Object.freeze({ ...intent }),
      reason: 'partial-snapshot',
    });
    this.#events.dispatch('structureMoveRequested', {
      documentId: request.documentId,
      documentGeneration: request.documentGeneration,
      occurrenceIds: request.occurrenceIds,
      request,
    });
  }

  /** Inserts a new node by duplicating the focused node's valid payload. */
  async #insertSelectedSubtree(mode: BomTreeInsertMode): Promise<void> {
    if (!this.#isFocusedForStructureEdit()) return;
    const active = this.#selection.activeCell;
    if (active === null || this.#published.snapshot.completeness !== 'complete') {
      return;
    }
    const source = this.#published.indexes.rowById.get(active.occurrenceId);
    if (source === undefined) return;
    const firstColumn = this.#columns[0];
    if (firstColumn === undefined) return;

    let occurrenceId = `${this.instanceId}:insert:${++this.#structureSequence}`;
    while (this.#published.indexes.rowById.has(occurrenceId)) {
      occurrenceId = `${this.instanceId}:insert:${++this.#structureSequence}`;
    }
    const parentId = mode === 'child' ? source.occurrenceId : source.parentId;
    const placement = mode === 'child'
      ? { at: 'last' as const }
      : { afterOccurrenceId: source.occurrenceId };
    if (mode === 'child') {
      const expanded = this.#published.projection.isExpanded(source.occurrenceId);
      if (expanded.ok && !expanded.value) {
        this.#toggleExpansion(
          Object.freeze({
            occurrenceId: source.occurrenceId,
            columnId: firstColumn.columnId,
          }),
          true,
        );
      }
    }
    const command: BomCommand<TFields> = Object.freeze({
      type: 'insertNode',
      parentId,
      placement,
      node: Object.freeze({
        occurrenceId,
        kind: source.kind,
        ...(source.materialId === undefined ? {} : { materialId: source.materialId }),
        ...(source.materialRevision === undefined
          ? {}
          : { materialRevision: source.materialRevision }),
        ...(source.materialCode === undefined ? {} : { materialCode: source.materialCode }),
        childrenState: 'complete' as const,
        knownChildCount: 0,
        fields: source.fields,
      }),
    });
    const result = await this.execute(command, { origin: `editor:insert-${mode}` });
    if (!result.ok) {
      if (!this.#isDestroyedOrDestroying()) {
        this.#emitRuntimeError(result.error, 'transaction');
      }
      return;
    }
    this.#select(
      Object.freeze({ occurrenceId, columnId: firstColumn.columnId }),
      'keyboard',
      false,
    );
  }

  /** Moves the focused tree node as one atomic moveSubtree command. */
  async #moveSelectedSubtree(direction: BomTreeMoveDirection): Promise<void> {
    if (!this.#isFocusedForStructureEdit()) return;
    const active = this.#selection.activeCell;
    if (active === null) return;
    const node = this.#published.indexes.rowById.get(active.occurrenceId);
    if (node === undefined) return;
    if (this.#published.snapshot.completeness === 'partial') {
      // A root has no possible outdent target, even when its siblings are
      // partially loaded. Every other direction needs host-side structure.
      if (direction === 'outdent' && node.parentId === null) return;
      this.#emitStructureMoveRequest(
        Object.freeze([node.occurrenceId]),
        Object.freeze({ kind: 'keyboard', direction }),
      );
      return;
    }
    const siblings = this.#published.indexes.childrenByParent.get(node.parentId) ?? [];
    const currentIndex = siblings.indexOf(node.occurrenceId);
    if (currentIndex < 0) return;

    let command: BomCommand<TFields> | undefined;
    let expandDestination: OccurrenceId | undefined;
    if (direction === 'up' && currentIndex > 0) {
      command = {
        type: 'moveSubtree',
        occurrenceId: node.occurrenceId,
        newParentId: node.parentId,
        placement: { beforeOccurrenceId: siblings[currentIndex - 1]! },
      };
    } else if (direction === 'down' && currentIndex < siblings.length - 1) {
      command = {
        type: 'moveSubtree',
        occurrenceId: node.occurrenceId,
        newParentId: node.parentId,
        placement: { afterOccurrenceId: siblings[currentIndex + 1]! },
      };
    } else if (direction === 'indent' && currentIndex > 0) {
      expandDestination = siblings[currentIndex - 1]!;
      command = {
        type: 'moveSubtree',
        occurrenceId: node.occurrenceId,
        newParentId: expandDestination,
        placement: { at: 'last' },
      };
    } else if (direction === 'outdent' && node.parentId !== null) {
      const parent = this.#published.indexes.rowById.get(node.parentId);
      if (parent === undefined) return;
      command = {
        type: 'moveSubtree',
        occurrenceId: node.occurrenceId,
        newParentId: parent.parentId,
        placement: { afterOccurrenceId: parent.occurrenceId },
      };
    }
    if (command === undefined) return;

    // Keep an indented row visible. Expansion is a view change and is done
    // before the queued transaction so the structural commit preserves it.
    if (expandDestination !== undefined) {
      const expanded = this.#published.projection.isExpanded(expandDestination);
      const firstColumn = this.#columns[0];
      if (expanded.ok && !expanded.value && firstColumn !== undefined) {
        this.#toggleExpansion(
          Object.freeze({
            occurrenceId: expandDestination,
            columnId: firstColumn.columnId,
          }),
          true,
        );
      }
    }
    const result = await this.execute(command, { origin: 'editor:move-subtree' });
    if (result.ok) {
      this.#announceTreeMoveCompleted();
    } else if (!this.#isDestroyedOrDestroying()) {
      this.#emitRuntimeError(result.error, 'transaction');
    }
  }

  /** Commits one value-free pointer tree drop through the existing FIFO path. */
  async #moveDraggedSubtree(
    request: Readonly<BomTreeMoveRequest>,
  ): Promise<void> {
    const status = this.#editMachine.state.status;
    if (status !== 'idle' && status !== 'focused') return;
    const requestedIds = request.occurrenceIds === undefined
      ? [request.occurrenceId]
      : [...request.occurrenceIds];
    if (
      requestedIds.length === 0 ||
      requestedIds[0] !== request.occurrenceId ||
      requestedIds.length > this.#published.indexes.rowById.size ||
      new Set(requestedIds).size !== requestedIds.length
    ) {
      return;
    }
    const sources = requestedIds.map((occurrenceId) =>
      this.#published.indexes.rowById.get(occurrenceId));
    const target = this.#published.indexes.rowById.get(
      request.targetOccurrenceId,
    );
    if (
      sources.some((source) => source === undefined) ||
      target === undefined ||
      sources.some((source) =>
        source !== undefined &&
        (source.occurrenceId === target.occurrenceId ||
          this.#treeMoveWouldCreateCycle(
            source.occurrenceId,
            target.occurrenceId,
          ))) ||
      sources.some((source, index) =>
        source !== undefined &&
        sources.some((other, otherIndex) =>
          otherIndex !== index &&
          other !== undefined &&
          this.#treeMoveWouldCreateCycle(
            source.occurrenceId,
            other.occurrenceId,
          )))
    ) {
      return;
    }

    const sourceNodes = sources as Readonly<BomNode<TFields>>[];

    if (this.#published.snapshot.completeness === 'partial') {
      if (
        sourceNodes.length === 1 &&
        request.position !== 'inside' &&
        this.#treeMoveIsNoOp(sourceNodes[0]!, target, request.position)
      ) {
        return;
      }
      this.#emitStructureMoveRequest(
        Object.freeze(requestedIds),
        Object.freeze({
          kind: 'pointer',
          targetOccurrenceId: target.occurrenceId,
          position: request.position,
        }),
      );
      return;
    }

    let command: BomCommand<TFields>;
    let expandDestination: OccurrenceId | undefined;
    if (request.position === 'before') {
      if (sourceNodes.length === 1 &&
          this.#treeMoveIsNoOp(sourceNodes[0]!, target, 'before')) return;
      command = {
        type: 'moveSubtree',
        occurrenceId: sourceNodes[0]!.occurrenceId,
        newParentId: target.parentId,
        placement: { beforeOccurrenceId: target.occurrenceId },
      };
    } else if (request.position === 'after') {
      if (sourceNodes.length === 1 &&
          this.#treeMoveIsNoOp(sourceNodes[0]!, target, 'after')) return;
      command = {
        type: 'moveSubtree',
        occurrenceId: sourceNodes[0]!.occurrenceId,
        newParentId: target.parentId,
        placement: { afterOccurrenceId: target.occurrenceId },
      };
    } else {
      expandDestination = target.occurrenceId;
      command = {
        type: 'moveSubtree',
        occurrenceId: sourceNodes[0]!.occurrenceId,
        newParentId: target.occurrenceId,
        placement: { at: 'last' },
      };
    }

    if (expandDestination !== undefined) {
      const expanded = this.#published.projection.isExpanded(expandDestination);
      const firstColumn = this.#columns[0];
      if (expanded.ok && !expanded.value && firstColumn !== undefined) {
        this.#toggleExpansion(
          Object.freeze({
            occurrenceId: expandDestination,
            columnId: firstColumn.columnId,
          }),
          true,
        );
      }
    }

    const result = sourceNodes.length === 1
      ? await this.execute(command, {
        origin: 'editor:move-subtree-pointer',
      })
      : await this.transaction(
        (builder) => {
          const ordered = request.position === 'after'
            ? [...sourceNodes].reverse()
            : sourceNodes;
          for (const source of ordered) {
            builder.execute({
              type: 'moveSubtree',
              occurrenceId: source.occurrenceId,
              newParentId: request.position === 'inside'
                ? target.occurrenceId
                : target.parentId,
              placement: request.position === 'before'
                ? { beforeOccurrenceId: target.occurrenceId }
                : request.position === 'after'
                  ? { afterOccurrenceId: target.occurrenceId }
                  : { at: 'last' },
            });
          }
        },
        {
          label: 'move-subtree-selection',
          origin: 'editor:move-subtree-pointer',
        },
      );
    if (result.ok) {
      const firstColumn = this.#columns[0];
      if (firstColumn !== undefined) {
        this.#select(
          Object.freeze({
            occurrenceId: sourceNodes[0]!.occurrenceId,
            columnId: firstColumn.columnId,
          }),
          'pointer',
          false,
        );
      }
      this.#announceTreeMoveCompleted();
    } else if (!this.#isDestroyedOrDestroying()) {
      this.#emitRuntimeError(result.error, 'transaction');
    }
  }

  #treeMoveWouldCreateCycle(
    occurrenceId: OccurrenceId,
    targetOccurrenceId: OccurrenceId,
  ): boolean {
    let current = this.#published.indexes.rowById.get(targetOccurrenceId);
    for (
      let depth = 0;
      current !== undefined && depth <= this.#published.indexes.rowById.size;
      depth += 1
    ) {
      if (current.parentId === occurrenceId) return true;
      if (current.parentId === null) return false;
      current = this.#published.indexes.rowById.get(current.parentId);
    }
    return current !== undefined;
  }

  #treeMoveIsNoOp(
    source: Readonly<BomNode<TFields>>,
    target: Readonly<BomNode<TFields>>,
    position: 'before' | 'after',
  ): boolean {
    if (source.parentId !== target.parentId) return false;
    const siblings = this.#published.indexes.childrenByParent.get(source.parentId) ?? [];
    const sourceIndex = siblings.indexOf(source.occurrenceId);
    const targetIndex = siblings.indexOf(target.occurrenceId);
    if (sourceIndex < 0 || targetIndex < 0) return false;
    return position === 'before'
      ? sourceIndex + 1 === targetIndex
      : sourceIndex - 1 === targetIndex;
  }

  #announceTreeMoveCompleted(): void {
    const renderer = this.#renderer;
    const message = this.#presentation.labels.liveRegion?.treeMoveCompleted;
    if (
      renderer === null ||
      message === undefined ||
      message.trim().length === 0
    ) {
      return;
    }
    renderer.announce({ message, politeness: 'polite' });
  }

  #isFocusedForStructureEdit(): boolean {
    const status = this.#editMachine.state.status;
    if (status !== 'idle' && status !== 'focused') return false;
    const selection = this.#selection;
    if (selection.mode !== undefined || selection.ranges !== undefined) return false;
    if (selection.activeCell === null) return false;
    return selection.range === null || (
      sameAddress(selection.range.anchor, selection.activeCell) &&
      sameAddress(selection.range.focus, selection.activeCell)
    );
  }

  async #commitClearSelection(
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
  ): Promise<BomResult<void>> {
    const queuedStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (queuedStaleness !== undefined) {
      return this.#clearFailure(queuedStaleness, 'CONFLICT');
    }
    if (this.#editMachine.state.status !== 'focused') {
      return this.#clearFailure('editing-active');
    }
    let prepared: ClearCommandPreparation<TFields>;
    if (this.#selection.ranges !== undefined) {
      const selections: ClipboardSelection[] = [];
      let totalRows = 0;
      let totalCells = 0;
      for (const range of this.#selection.ranges) {
        const selected = this.#clipboardSelectionForRange(
          range,
          DEFAULT_DELETE_SELECTION_LIMITS,
          'cut-selection-limit',
        );
        if (!selected.ok) {
          return this.#clearFailure(
            selected.reasonCode === 'cut-selection-limit'
              ? 'selection-limit'
              : 'selection-unavailable',
            selected.reasonCode === 'cut-selection-limit'
              ? 'SECURITY_LIMIT'
              : 'VALIDATION',
          );
        }
        totalRows += selected.value.occurrenceIds.length;
        totalCells +=
          selected.value.occurrenceIds.length * selected.value.columns.length;
        if (
          totalRows > DEFAULT_DELETE_SELECTION_LIMITS.maxRows ||
          totalCells > DEFAULT_DELETE_SELECTION_LIMITS.maxCells
        ) {
          return this.#clearFailure('selection-limit', 'SECURITY_LIMIT');
        }
        selections.push(selected.value);
      }
      prepared = this.#prepareClearCommandsForSelections(selections);
    } else {
      const selected = this.#clipboardSelection(DEFAULT_DELETE_SELECTION_LIMITS);
      if (!selected.ok) {
        return this.#clearFailure(
          selected.reasonCode === 'cut-selection-limit'
            ? 'selection-limit'
            : 'selection-unavailable',
          selected.reasonCode === 'cut-selection-limit'
            ? 'SECURITY_LIMIT'
            : 'VALIDATION',
        );
      }
      prepared = this.#prepareClearCommands(selected.value);
    }
    if (!prepared.ok) {
      return this.#clearFailure(prepared.reason);
    }
    if (prepared.commands.length === 0) {
      return editorSuccess(undefined);
    }
    const persistence = this.#persistenceForMutation();
    if (!persistence.ok) {
      return editorFailure(persistence.error);
    }
    const transactionId = this.#nextTransactionId('delete');
    const attempt = this.#attempt(transactionId, 'editor:delete');
    const metadata = this.#persistenceMetadata(
      persistence.value,
      transactionId,
    );
    const batch: BomCommandBatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      baseRevision: attempt.baseRevision,
      transactionId,
      origin: 'editor:delete',
      timestamp: new Date().toISOString(),
      label: 'delete',
      ...(metadata === undefined ? {} : metadata),
      commands: prepared.commands,
    });
    this.#resetPreparation();
    this.#precommitClearStalenessGuards.set(
      transactionId,
      Object.freeze({ state, pasteTargetEpoch }),
    );
    let executed: BomTransactionResult<BomCommit<TFields>>;
    try {
      executed = await this.#engine.executeBatch(batch);
    } finally {
      this.#precommitClearStalenessGuards.delete(transactionId);
    }
    const committed = await this.#finishLocalTransaction(executed, attempt, {
      session: persistence.value,
      commands: prepared.commands,
    });
    return committed.ok ? editorSuccess(undefined) : editorFailure(committed.error);
  }

  #prepareClearCommands(
    selection: Readonly<ClipboardSelection>,
  ): ClearCommandPreparation<TFields> {
    for (const entry of selection.columns) {
      if (!entry.column.editable) {
        return { ok: false, reason: 'read-only' };
      }
      if (
        entry.field.required &&
        !entry.field.nullable &&
        entry.field.defaultValue === undefined
      ) {
        return { ok: false, reason: 'required-field' };
      }
    }

    const commands: BomCommand<TFields>[] = [];
    const targetFieldIdsByOccurrence = new Map<OccurrenceId, Set<string>>();
    for (const occurrenceId of selection.occurrenceIds) {
      const node = this.#published.indexes.rowById.get(occurrenceId);
      if (node === undefined) {
        return { ok: false, reason: 'selection-stale' };
      }
      for (const entry of selection.columns) {
        let targetFieldIds = targetFieldIdsByOccurrence.get(occurrenceId);
        if (targetFieldIds?.has(entry.field.fieldId)) {
          continue;
        }
        if (targetFieldIds === undefined) {
          targetFieldIds = new Set<string>();
          targetFieldIdsByOccurrence.set(occurrenceId, targetFieldIds);
        }
        targetFieldIds.add(entry.field.fieldId);

        const value = fieldValue(node.fields, entry.field.path);
        if (value === undefined) {
          continue;
        }
        const valueHash = hashBomFieldValue(value, this.#schema, entry.field);
        if (!valueHash.ok) {
          return { ok: false, reason: 'field-hash-failed' };
        }
        if (entry.field.nullable) {
          if (value === null) {
            continue;
          }
          commands.push(
            Object.freeze({
              type: 'setField' as const,
              occurrenceId,
              fieldPath: Object.freeze([...entry.field.path]),
              value: null,
              expectedValueHash: valueHash.value,
            }),
          );
          continue;
        }
        if (entry.field.defaultValue !== undefined) {
          const defaultHash = hashBomFieldValue(
            entry.field.defaultValue,
            this.#schema,
            entry.field,
          );
          if (!defaultHash.ok) {
            return { ok: false, reason: 'default-hash-failed' };
          }
          if (valueHash.value === defaultHash.value) {
            continue;
          }
        }
        commands.push(
          Object.freeze({
            type: 'unsetField' as const,
            occurrenceId,
            fieldPath: Object.freeze([...entry.field.path]),
            expectedPresent: true,
            expectedValueHash: valueHash.value,
          }),
        );
      }
    }
    return { ok: true, commands: Object.freeze(commands) };
  }

  #prepareClearCommandsForSelections(
    selections: readonly Readonly<ClipboardSelection>[],
  ): ClearCommandPreparation<TFields> {
    const commands: BomCommand<TFields>[] = [];
    const seen = new Set<string>();
    for (const selection of selections) {
      const prepared = this.#prepareClearCommands(selection);
      if (!prepared.ok) return prepared;
      for (const command of prepared.commands) {
        const key = JSON.stringify([
          'occurrenceId' in command ? command.occurrenceId : null,
          'fieldPath' in command ? command.fieldPath : null,
        ]);
        if (seen.has(key)) continue;
        seen.add(key);
        commands.push(command);
      }
    }
    return { ok: true, commands: Object.freeze(commands) };
  }

  #clearFailure(
    reason: string,
    category: 'VALIDATION' | 'SECURITY_LIMIT' | 'CONFLICT' = 'VALIDATION',
  ): BomResult<void> {
    return editorFailure(
      editorError(
        category === 'CONFLICT'
          ? BOM_EDITOR_ERROR_CODES.deleteConflict
          : BOM_EDITOR_ERROR_CODES.deleteInvalid,
        category,
        { reason },
      ),
    );
  }

  #fillDown(): void {
    const editState = this.#editMachine.state.status;
    if (editState !== 'idle' && editState !== 'focused') {
      return;
    }
    this.#ensureEditFocused();
    if (this.#editMachine.state.status !== 'focused') {
      return;
    }
    const state = this.#published;
    const pasteTargetEpoch = this.#pasteTargetEpoch;
    const task = this.#enqueue(() =>
      this.#commitFillDown(state, pasteTargetEpoch));
    void task.then((result): void => {
      if (!result.ok && !this.#isDestroyedOrDestroying()) {
        this.#emitRuntimeError(result.error, 'transaction');
      }
    });
  }

  async #commitFillDown(
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
  ): Promise<BomResult<void>> {
    const queuedStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (queuedStaleness !== undefined) {
      return this.#fillDownFailure(queuedStaleness, 'CONFLICT');
    }
    if (this.#editMachine.state.status !== 'focused') {
      return this.#fillDownFailure('editing-active');
    }
    if (this.#selection.mode !== undefined) {
      return this.#fillDownFailure('axis-selection');
    }
    if (
      this.#selection.range === null &&
      this.#selection.ranges === undefined
    ) {
      return editorSuccess(undefined);
    }
    const selections: ClipboardSelection[] = [];
    let totalRows = 0;
    let totalCells = 0;
    if (this.#selection.ranges !== undefined) {
      for (const range of this.#selection.ranges) {
        const selected = this.#clipboardSelectionForRange(
          range,
          DEFAULT_FILL_DOWN_SELECTION_LIMITS,
          'cut-selection-limit',
        );
        if (!selected.ok) {
          return this.#fillDownFailure(
            selected.reasonCode === 'cut-selection-limit'
              ? 'selection-limit'
              : 'selection-unavailable',
            selected.reasonCode === 'cut-selection-limit'
              ? 'SECURITY_LIMIT'
              : 'VALIDATION',
          );
        }
        if (selected.value.occurrenceIds.length < 2) {
          return this.#fillDownFailure('selection-not-multi-row');
        }
        totalRows += selected.value.occurrenceIds.length;
        totalCells +=
          selected.value.occurrenceIds.length * selected.value.columns.length;
        if (
          totalRows > DEFAULT_FILL_DOWN_SELECTION_LIMITS.maxRows ||
          totalCells > DEFAULT_FILL_DOWN_SELECTION_LIMITS.maxCells
        ) {
          return this.#fillDownFailure('selection-limit', 'SECURITY_LIMIT');
        }
        selections.push(selected.value);
      }
    } else {
      const selected = this.#clipboardSelection(
        DEFAULT_FILL_DOWN_SELECTION_LIMITS,
      );
      if (!selected.ok) {
        return this.#fillDownFailure(
          selected.reasonCode === 'cut-selection-limit'
            ? 'selection-limit'
            : 'selection-unavailable',
          selected.reasonCode === 'cut-selection-limit'
            ? 'SECURITY_LIMIT'
            : 'VALIDATION',
        );
      }
      if (selected.value.occurrenceIds.length < 2) {
        return editorSuccess(undefined);
      }
      selections.push(selected.value);
    }
    const prepared =
      selections.length === 1
        ? this.#prepareFillDownCommands(selections[0]!)
        : this.#prepareFillDownCommandsForSelections(selections);
    if (!prepared.ok) {
      return this.#fillDownFailure(prepared.reason);
    }
    if (prepared.commands.length === 0) {
      return editorSuccess(undefined);
    }
    const persistence = this.#persistenceForMutation();
    if (!persistence.ok) {
      return editorFailure(persistence.error);
    }
    const transactionId = this.#nextTransactionId('fill-down');
    const attempt = this.#attempt(transactionId, 'editor:fill-down');
    const metadata = this.#persistenceMetadata(
      persistence.value,
      transactionId,
    );
    const batch: BomCommandBatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      baseRevision: attempt.baseRevision,
      transactionId,
      origin: 'editor:fill-down',
      timestamp: new Date().toISOString(),
      label: 'fill-down',
      ...(metadata === undefined ? {} : metadata),
      commands: prepared.commands,
    });
    this.#resetPreparation();
    this.#precommitFillDownStalenessGuards.set(
      transactionId,
      Object.freeze({ state, pasteTargetEpoch }),
    );
    let executed: BomTransactionResult<BomCommit<TFields>>;
    try {
      executed = await this.#engine.executeBatch(batch);
    } finally {
      this.#precommitFillDownStalenessGuards.delete(transactionId);
    }
    const committed = await this.#finishLocalTransaction(executed, attempt, {
      session: persistence.value,
      commands: prepared.commands,
    });
    return committed.ok ? editorSuccess(undefined) : editorFailure(committed.error);
  }

  async #commitFillSeries(
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
  ): Promise<BomResult<void>> {
    const queuedStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (queuedStaleness !== undefined) return this.#fillDownFailure(queuedStaleness, 'CONFLICT');
    if (
      this.#editMachine.state.status !== 'focused' ||
      this.#selection.mode !== undefined ||
      (this.#selection.range === null && this.#selection.ranges === undefined)
    ) return editorSuccess(undefined);
    const selections: ClipboardSelection[] = [];
    let totalRows = 0;
    let totalCells = 0;
    if (this.#selection.ranges !== undefined) {
      for (const range of this.#selection.ranges) {
        const selected = this.#clipboardSelectionForRange(
          range,
          DEFAULT_FILL_DOWN_SELECTION_LIMITS,
          'cut-selection-limit',
        );
        if (!selected.ok) return this.#fillDownFailure(
          selected.reasonCode === 'cut-selection-limit' ? 'selection-limit' : 'selection-unavailable',
          selected.reasonCode === 'cut-selection-limit' ? 'SECURITY_LIMIT' : 'VALIDATION',
        );
        if (selected.value.occurrenceIds.length < 3) {
          return this.#fillDownFailure('selection-not-series');
        }
        totalRows += selected.value.occurrenceIds.length;
        totalCells += selected.value.occurrenceIds.length * selected.value.columns.length;
        if (
          totalRows > DEFAULT_FILL_DOWN_SELECTION_LIMITS.maxRows ||
          totalCells > DEFAULT_FILL_DOWN_SELECTION_LIMITS.maxCells
        ) return this.#fillDownFailure('selection-limit', 'SECURITY_LIMIT');
        selections.push(selected.value);
      }
    } else {
      const selected = this.#clipboardSelection(DEFAULT_FILL_DOWN_SELECTION_LIMITS);
      if (!selected.ok) return this.#fillDownFailure(
        selected.reasonCode === 'cut-selection-limit' ? 'selection-limit' : 'selection-unavailable',
        selected.reasonCode === 'cut-selection-limit' ? 'SECURITY_LIMIT' : 'VALIDATION',
      );
      if (selected.value.occurrenceIds.length < 3) return editorSuccess(undefined);
      selections.push(selected.value);
    }
    const prepared = selections.length === 1
      ? this.#prepareFillSeriesCommands(selections[0]!)
      : this.#prepareFillSeriesCommandsForSelections(selections);
    if (!prepared.ok) return this.#fillDownFailure(prepared.reason);
    if (prepared.commands.length === 0) return editorSuccess(undefined);
    const persistence = this.#persistenceForMutation();
    if (!persistence.ok) return editorFailure(persistence.error);
    const transactionId = this.#nextTransactionId('fill-series');
    const attempt = this.#attempt(transactionId, 'editor:fill-series');
    const metadata = this.#persistenceMetadata(persistence.value, transactionId);
    const batch: BomCommandBatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      baseRevision: attempt.baseRevision,
      transactionId,
      origin: 'editor:fill-series',
      timestamp: new Date().toISOString(),
      label: 'fill-series',
      ...(metadata === undefined ? {} : metadata),
      commands: prepared.commands,
    });
    this.#resetPreparation();
    this.#precommitFillDownStalenessGuards.set(transactionId, Object.freeze({ state, pasteTargetEpoch }));
    let executed: BomTransactionResult<BomCommit<TFields>>;
    try { executed = await this.#engine.executeBatch(batch); } finally { this.#precommitFillDownStalenessGuards.delete(transactionId); }
    const committed = await this.#finishLocalTransaction(executed, attempt, { session: persistence.value, commands: prepared.commands });
    return committed.ok ? editorSuccess(undefined) : editorFailure(committed.error);
  }

  #prepareFillSeriesCommands(
    selection: Readonly<ClipboardSelection>,
  ): FillDownCommandPreparation<TFields> {
    const firstId = selection.occurrenceIds[0];
    const secondId = selection.occurrenceIds[1];
    if (firstId === undefined || secondId === undefined) return { ok: false, reason: 'selection-stale' };
    const first = this.#published.indexes.rowById.get(firstId);
    const second = this.#published.indexes.rowById.get(secondId);
    if (first === undefined || second === undefined) return { ok: false, reason: 'selection-stale' };
    const commands: BomCommand<TFields>[] = [];
    for (const entry of selection.columns) {
      if (!entry.column.editable) return { ok: false, reason: 'read-only' };
      const firstValue = fieldValue(first.fields, entry.field.path);
      const secondValue = fieldValue(second.fields, entry.field.path);
      const firstNumber = numericFillValue(firstValue);
      const secondNumber = numericFillValue(secondValue);
      const temporal = firstNumber === undefined || secondNumber === undefined
        ? temporalFillSource(firstValue, secondValue, entry.field.type.kind)
        : undefined;
      if (
        (firstNumber === undefined || secondNumber === undefined) &&
        temporal === undefined
      ) {
        return { ok: false, reason: 'non-sequential-source' };
      }
      const delta = firstNumber === undefined || secondNumber === undefined
        ? undefined
        : secondNumber - firstNumber;
      for (let index = 2; index < selection.occurrenceIds.length; index += 1) {
        const occurrenceId = selection.occurrenceIds[index]!;
        const target = this.#published.indexes.rowById.get(occurrenceId);
        if (target === undefined) return { ok: false, reason: 'selection-stale' };
        const targetValue = fieldValue(target.fields, entry.field.path);
        const expectedValueHash = targetValue === undefined ? undefined : hashBomFieldValue(targetValue, this.#schema, entry.field);
        if (expectedValueHash !== undefined && !expectedValueHash.ok) return { ok: false, reason: 'target-hash-failed' };
        commands.push(Object.freeze({
          type: 'setField' as const,
          occurrenceId,
          fieldPath: Object.freeze([...entry.field.path]),
          value: temporal === undefined
            ? seriesFillValue(
              secondValue!,
              secondNumber! + delta! * (index - 1),
            )
            : temporal.valueAt(index),
          ...(expectedValueHash === undefined ? {} : { expectedValueHash: expectedValueHash.value }),
        }));
      }
    }
    return { ok: true, commands: Object.freeze(commands) };
  }

  #prepareFillSeriesCommandsForSelections(
    selections: readonly Readonly<ClipboardSelection>[],
  ): FillDownCommandPreparation<TFields> {
    const commands: BomCommand<TFields>[] = [];
    const commandByAddress = new Map<string, BomCommand<TFields>>();
    for (const selection of selections) {
      const prepared = this.#prepareFillSeriesCommands(selection);
      if (!prepared.ok) return prepared;
      for (const command of prepared.commands) {
        const key = JSON.stringify([
          'occurrenceId' in command ? command.occurrenceId : null,
          'fieldPath' in command ? command.fieldPath : null,
        ]);
        const previous = commandByAddress.get(key);
        if (previous !== undefined) {
          if (JSON.stringify(previous) !== JSON.stringify(command)) {
            return { ok: false, reason: 'overlap-conflict' };
          }
          continue;
        }
        commandByAddress.set(key, command);
        commands.push(command);
      }
    }
    return { ok: true, commands: Object.freeze(commands) };
  }

  #prepareFillDownCommands(
    selection: Readonly<ClipboardSelection>,
  ): FillDownCommandPreparation<TFields> {
    const sourceOccurrenceId = selection.occurrenceIds[0];
    if (sourceOccurrenceId === undefined) {
      return { ok: false, reason: 'selection-stale' };
    }
    const source = this.#published.indexes.rowById.get(sourceOccurrenceId);
    if (source === undefined) {
      return { ok: false, reason: 'selection-stale' };
    }
    const columns: ClipboardSelectionColumn[] = [];
    const fieldIds = new Set<string>();
    for (const entry of selection.columns) {
      if (!entry.column.editable) {
        return { ok: false, reason: 'read-only' };
      }
      if (fieldIds.has(entry.field.fieldId)) {
        continue;
      }
      fieldIds.add(entry.field.fieldId);
      columns.push(entry);
    }

    const commands: BomCommand<TFields>[] = [];
    const targetFieldIdsByOccurrence = new Map<OccurrenceId, Set<string>>();
    for (const entry of columns) {
      const sourceValue = fieldValue(source.fields, entry.field.path);
      const sourceHash = sourceValue === undefined
        ? undefined
        : hashBomFieldValue(sourceValue, this.#schema, entry.field);
      if (sourceHash !== undefined && !sourceHash.ok) {
        return { ok: false, reason: 'source-hash-failed' };
      }
      for (let index = 1; index < selection.occurrenceIds.length; index += 1) {
        const occurrenceId = selection.occurrenceIds[index]!;
        const target = this.#published.indexes.rowById.get(occurrenceId);
        if (target === undefined) {
          return { ok: false, reason: 'selection-stale' };
        }
        let targetFieldIds = targetFieldIdsByOccurrence.get(occurrenceId);
        if (targetFieldIds?.has(entry.field.fieldId)) {
          continue;
        }
        if (targetFieldIds === undefined) {
          targetFieldIds = new Set<string>();
          targetFieldIdsByOccurrence.set(occurrenceId, targetFieldIds);
        }
        targetFieldIds.add(entry.field.fieldId);

        const targetValue = fieldValue(target.fields, entry.field.path);
        if (sourceValue === undefined) {
          if (targetValue === undefined) {
            continue;
          }
          const targetHash = hashBomFieldValue(
            targetValue,
            this.#schema,
            entry.field,
          );
          if (!targetHash.ok) {
            return { ok: false, reason: 'target-hash-failed' };
          }
          commands.push(
            Object.freeze({
              type: 'unsetField' as const,
              occurrenceId,
              fieldPath: Object.freeze([...entry.field.path]),
              expectedPresent: true,
              expectedValueHash: targetHash.value,
            }),
          );
          continue;
        }

        if (targetValue !== undefined) {
          const targetHash = hashBomFieldValue(
            targetValue,
            this.#schema,
            entry.field,
          );
          if (!targetHash.ok) {
            return { ok: false, reason: 'target-hash-failed' };
          }
          if (targetHash.value === sourceHash!.value) {
            continue;
          }
          commands.push(
            Object.freeze({
              type: 'setField' as const,
              occurrenceId,
              fieldPath: Object.freeze([...entry.field.path]),
              value: sourceValue,
              expectedValueHash: targetHash.value,
            }),
          );
          continue;
        }
        commands.push(
          Object.freeze({
            type: 'setField' as const,
            occurrenceId,
            fieldPath: Object.freeze([...entry.field.path]),
            value: sourceValue,
          }),
        );
      }
    }
    return { ok: true, commands: Object.freeze(commands) };
  }

  #prepareFillDownCommandsForSelections(
    selections: readonly Readonly<ClipboardSelection>[],
  ): FillDownCommandPreparation<TFields> {
    const commands: BomCommand<TFields>[] = [];
    const commandByAddress = new Map<string, BomCommand<TFields>>();
    for (const selection of selections) {
      const prepared = this.#prepareFillDownCommands(selection);
      if (!prepared.ok) {
        return prepared;
      }
      for (const command of prepared.commands) {
        const key = JSON.stringify([
          command.type,
          'occurrenceId' in command ? command.occurrenceId : null,
          'fieldPath' in command ? command.fieldPath : null,
        ]);
        const previous = commandByAddress.get(key);
        if (previous !== undefined) {
          if (JSON.stringify(previous) !== JSON.stringify(command)) {
            return { ok: false, reason: 'overlap-conflict' };
          }
          continue;
        }
        commandByAddress.set(key, command);
        commands.push(command);
      }
    }
    return { ok: true, commands: Object.freeze(commands) };
  }

  #fillDownFailure(
    reason: string,
    category: 'VALIDATION' | 'SECURITY_LIMIT' | 'CONFLICT' = 'VALIDATION',
  ): BomResult<void> {
    return editorFailure(
      editorError(
        category === 'CONFLICT'
          ? BOM_EDITOR_ERROR_CODES.fillDownConflict
          : BOM_EDITOR_ERROR_CODES.fillDownInvalid,
        category,
        { reason },
      ),
    );
  }

  async #commitFillSelection(
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
    commands: readonly BomCommand<TFields>[],
  ): Promise<BomResult<void>> {
    const queuedStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (queuedStaleness !== undefined) {
      return this.#fillSelectionFailure(queuedStaleness, 'CONFLICT');
    }
    if (commands.length === 0) {
      return editorSuccess(undefined);
    }
    const persistence = this.#persistenceForMutation();
    if (!persistence.ok) {
      return editorFailure(persistence.error);
    }
    const transactionId = this.#nextTransactionId('fill-selection');
    const attempt = this.#attempt(transactionId, 'editor:fill-selection');
    const metadata = this.#persistenceMetadata(
      persistence.value,
      transactionId,
    );
    const batch: BomCommandBatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      baseRevision: attempt.baseRevision,
      transactionId,
      origin: 'editor:fill-selection',
      timestamp: new Date().toISOString(),
      label: 'fill-selection',
      ...(metadata === undefined ? {} : metadata),
      commands,
    });
    this.#resetPreparation();
    this.#precommitFillSelectionStalenessGuards.set(
      transactionId,
      Object.freeze({ state, pasteTargetEpoch }),
    );
    let executed: BomTransactionResult<BomCommit<TFields>>;
    try {
      executed = await this.#engine.executeBatch(batch);
    } finally {
      this.#precommitFillSelectionStalenessGuards.delete(transactionId);
    }
    const committed = await this.#finishLocalTransaction(executed, attempt, {
      session: persistence.value,
      commands,
    });
    return committed.ok ? editorSuccess(undefined) : editorFailure(committed.error);
  }

  #prepareFillSelectionCommands(
    address: Readonly<BomCellAddress>,
    field: Readonly<BomFieldSchema>,
    value: BomValue,
    state: Readonly<PublishedState<TFields>>,
  ): FillSelectionCommandPreparation<TFields> {
    if (this.#selection.mode !== undefined) {
      return { ok: false, reason: 'selection-axis' };
    }
    const ranges =
      this.#selection.ranges ??
      (this.#selection.range === null ? [] : [this.#selection.range]);
    if (
      ranges.length === 0 ||
      !sameNullableAddress(this.#selection.activeCell, address)
    ) {
      return { ok: false, reason: 'selection-not-single-column' };
    }
    const selectedRanges: ClipboardSelection[] = [];
    let totalRows = 0;
    let totalCells = 0;
    let activeRangeContainsAddress = false;
    for (const range of ranges) {
      if (
        range.anchor.columnId !== address.columnId ||
        range.focus.columnId !== address.columnId
      ) {
        return { ok: false, reason: 'selection-not-single-column' };
      }
      const selected = this.#clipboardSelectionForRange(
        range,
        DEFAULT_FILL_SELECTION_LIMITS,
        'cut-selection-limit',
      );
      if (!selected.ok) {
        return {
          ok: false,
          reason:
            selected.reasonCode === 'cut-selection-limit'
              ? 'selection-limit'
              : 'selection-unavailable',
        };
      }
      if (selected.value.occurrenceIds.length < 2) {
        return { ok: false, reason: 'selection-not-multi-row' };
      }
      if (selected.value.columns.length !== 1) {
        return { ok: false, reason: 'selection-not-single-column' };
      }
      const column = selected.value.columns[0];
      if (
        column === undefined ||
        column.column.columnId !== address.columnId ||
        column.field.fieldId !== field.fieldId
      ) {
        return { ok: false, reason: 'selection-column-mismatch' };
      }
      if (!column.column.editable) {
        return { ok: false, reason: 'read-only' };
      }
      if (selected.value.occurrenceIds.includes(address.occurrenceId)) {
        activeRangeContainsAddress = true;
      }
      totalRows += selected.value.occurrenceIds.length;
      totalCells += selected.value.occurrenceIds.length;
      if (
        totalRows > DEFAULT_FILL_SELECTION_LIMITS.maxRows ||
        totalCells > DEFAULT_FILL_SELECTION_LIMITS.maxCells
      ) {
        return { ok: false, reason: 'selection-limit' };
      }
      selectedRanges.push(selected.value);
    }
    if (!activeRangeContainsAddress) {
      return { ok: false, reason: 'selection-active-missing' };
    }
    const valueHash = hashBomFieldValue(value, this.#schema, field);
    if (!valueHash.ok) {
      return { ok: false, reason: 'value-hash-failed' };
    }
    const commands: BomCommand<TFields>[] = [];
    const seenOccurrenceIds = new Set<OccurrenceId>();
    for (const selected of selectedRanges) {
      for (const occurrenceId of selected.occurrenceIds) {
        if (seenOccurrenceIds.has(occurrenceId)) {
          continue;
        }
        seenOccurrenceIds.add(occurrenceId);
        const node = state.indexes.rowById.get(occurrenceId);
        if (node === undefined) {
          return { ok: false, reason: 'selection-stale' };
        }
        const current = fieldValue(node.fields, field.path);
        if (current === undefined) {
          commands.push(
            Object.freeze({
              type: 'setField' as const,
              occurrenceId,
              fieldPath: Object.freeze([...field.path]),
              value,
            }),
          );
          continue;
        }
        const currentHash = hashBomFieldValue(current, this.#schema, field);
        if (!currentHash.ok) {
          return { ok: false, reason: 'target-hash-failed' };
        }
        if (currentHash.value === valueHash.value) {
          continue;
        }
        commands.push(
          Object.freeze({
            type: 'setField' as const,
            occurrenceId,
            fieldPath: Object.freeze([...field.path]),
            value,
            expectedValueHash: currentHash.value,
          }),
        );
      }
    }
    return { ok: true, commands: Object.freeze(commands) };
  }

  #fillSelectionError(
    reason: string,
    category: 'VALIDATION' | 'SECURITY_LIMIT' | 'CONFLICT' = 'VALIDATION',
  ): BomError {
    return editorError(
      category === 'CONFLICT'
        ? BOM_EDITOR_ERROR_CODES.fillSelectionConflict
        : BOM_EDITOR_ERROR_CODES.fillSelectionInvalid,
      category,
      { reason },
    );
  }

  #fillSelectionFailure(
    reason: string,
    category: 'VALIDATION' | 'SECURITY_LIMIT' | 'CONFLICT' = 'VALIDATION',
  ): BomResult<void> {
    return editorFailure(this.#fillSelectionError(reason, category));
  }

  #clipboardSelection(
    limits?: Readonly<ClipboardSelectionLimits>,
    limitReason = 'cut-selection-limit',
  ): ClipboardSelectionResult {
    if (this.#selection.ranges !== undefined) {
      return {
        ok: false,
        occurrenceCount: this.#selection.ranges.length,
        reasonCode: 'multi-range-unsupported',
      };
    }
    const active = this.#selection.activeCell;
    if (active === null) {
      return { ok: false, occurrenceCount: 0 };
    }
    return this.#clipboardSelectionForRange(
      this.#selection.range ?? cellRange(active, active),
      limits,
      limitReason,
    );
  }

  #clipboardSelectionForRange(
    range: Readonly<BomCellRange>,
    limits?: Readonly<ClipboardSelectionLimits>,
    limitReason = 'cut-selection-limit',
  ): ClipboardSelectionResult {
    const anchor = range.anchor;
    const focus = range.focus;
    const visibleColumns = visibleColumnDefinitions(this.#columns);
    const anchorRow = this.#published.projection.indexOf(anchor.occurrenceId);
    const focusRow = this.#published.projection.indexOf(focus.occurrenceId);
    const anchorColumn = visibleColumns.findIndex(
      (column) => column.columnId === anchor.columnId,
    );
    const focusColumn = visibleColumns.findIndex(
      (column) => column.columnId === focus.columnId,
    );
    if (
      !anchorRow.ok ||
      anchorRow.value === undefined ||
      !focusRow.ok ||
      focusRow.value === undefined ||
      anchorColumn < 0 ||
      focusColumn < 0
    ) {
      return { ok: false, occurrenceCount: 0 };
    }
    const firstRow = Math.min(anchorRow.value, focusRow.value);
    const lastRow = Math.max(anchorRow.value, focusRow.value);
    const firstColumn = Math.min(anchorColumn, focusColumn);
    const lastColumn = Math.max(anchorColumn, focusColumn);
    const occurrenceCount = lastRow - firstRow + 1;
    const columnCount = lastColumn - firstColumn + 1;
    if (
      limits !== undefined &&
      (occurrenceCount > limits.maxRows ||
        columnCount > limits.maxColumns ||
        occurrenceCount > Math.floor(limits.maxCells / columnCount))
    ) {
      return {
        ok: false,
        occurrenceCount,
        reasonCode: limitReason,
      };
    }
    const occurrenceIds: OccurrenceId[] = [];
    for (let index = firstRow; index <= lastRow; index += 1) {
      const occurrence = this.#published.projection.occurrenceAt(index);
      if (!occurrence.ok || occurrence.value === undefined) {
        return { ok: false, occurrenceCount: 0 };
      }
      occurrenceIds.push(occurrence.value);
    }
    const columns: ClipboardSelectionColumn[] = [];
    for (let index = firstColumn; index <= lastColumn; index += 1) {
      const column = visibleColumns[index];
      if (column === undefined) {
        return { ok: false, occurrenceCount: 0 };
      }
      const field = findSchemaField(this.#schema, column.fieldPath);
      if (field === undefined) {
        return { ok: false, occurrenceCount: 0 };
      }
      columns.push(Object.freeze({ column, field }));
    }
    return {
      ok: true,
      value: Object.freeze({
        occurrenceIds: Object.freeze(occurrenceIds),
        columns: Object.freeze(columns),
      }),
    };
  }

  #serializeClipboardRepresentations(
    occurrenceIds: readonly OccurrenceId[],
    columns: readonly ClipboardSelectionColumn[],
    authorization: Extract<ClipboardAuthorization, { readonly status: 'allowed' }>,
    limits?: Readonly<ClipboardOutputLimits>,
    operation: BomClipboardOperation = 'copy',
  ): ClipboardRepresentationSerialization {
    const maxBytes = limits?.maxBytes ?? Number.MAX_SAFE_INTEGER;
    const maxCellBytes = limits?.maxCellBytes ?? Number.MAX_SAFE_INTEGER;
    const rows: string[][] = [];
    for (const occurrenceId of occurrenceIds) {
      const node = this.#published.indexes.rowById.get(occurrenceId);
      if (node === undefined) {
        return { ok: false, reasonCode: 'selection-stale' };
      }
      const cells: string[] = [];
      for (const entry of columns) {
        const value = fieldValue(node.fields, entry.column.fieldPath);
        const masking = authorization.maskingByFieldId.get(entry.field.fieldId);
        const rawCell = safeSpreadsheetText(
          clipboardCellText(value, entry.field.fieldId, masking),
        );
        if (boundedUtf8ByteLength(rawCell, maxCellBytes) > maxCellBytes) {
          return {
            ok: false,
            reasonCode: operation + '-cell-byte-limit',
          };
        }
        const cell = escapeClipboardTsvCell(rawCell);
        const cellBytes = boundedUtf8ByteLength(cell, maxCellBytes);
        if (cellBytes > maxCellBytes) {
          return {
            ok: false,
            reasonCode: operation + '-cell-byte-limit',
          };
        }
        const htmlCell = escapeClipboardHtmlCell(rawCell);
        if (
          boundedUtf8ByteLength(htmlCell, maxCellBytes) > maxCellBytes ||
          boundedUtf8ByteLength(JSON.stringify(rawCell), maxCellBytes) >
            maxCellBytes
        ) {
          return {
            ok: false,
            reasonCode: operation + '-cell-byte-limit',
          };
        }
        cells.push(rawCell);
      }
      rows.push(cells);
    }
    const lines = rows.map((row) => row.map(escapeClipboardTsvCell).join('\t'));
    const text = lines.join('\r\n');
    if (boundedUtf8ByteLength(text, maxBytes) > maxBytes) {
      return { ok: false, reasonCode: operation + '-byte-limit' };
    }
    const html = '<table><tbody>' + rows.map((row) =>
      '<tr>' + row.map((cell) => '<td>' + escapeClipboardHtmlCell(cell) +
        '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    if (boundedUtf8ByteLength(html, maxBytes) > maxBytes) {
      return { ok: false, reasonCode: operation + '-byte-limit' };
    }
    const internal = JSON.stringify({
      format: BOM_INTERNAL_CLIPBOARD_FORMAT,
      version: BOM_INTERNAL_CLIPBOARD_VERSION,
      kind: BOM_INTERNAL_CLIPBOARD_KIND,
      rows,
    });
    if (boundedUtf8ByteLength(internal, maxBytes) > maxBytes) {
      return { ok: false, reasonCode: operation + '-byte-limit' };
    }
    return { ok: true, text, html, internal };
  }

  #recordClipboardWrite(
    id: string,
    method: BomClipboardWriteMethod,
    outcome: 'written' | 'failed',
  ): void {
    const pending = this.#pendingClipboardWrites.get(id);
    if (pending === undefined) {
      return;
    }
    this.#pendingClipboardWrites.delete(id);
    this.#emitClipboardOperation({
      ...pending,
      outcome,
      method,
    });
    if (
      outcome !== 'written' ||
      (pending.operation !== 'cut' && pending.operation !== 'cut-branch')
    ) {
      return;
    }
    void this.#commitClipboardCut(pending).then((result) => {
      if (!result.ok && !this.#isDestroyedOrDestroying()) {
        this.#emitClipboardOperation({
          ...pending,
          outcome: 'failed',
          method,
          reasonCode: cutFailureReasonCode(result.error),
        });
      }
    });
  }

  #commitClipboardCut(
    pending: Readonly<PendingClipboardCut<TFields>>,
  ): Promise<BomResult<BomCommit<TFields>>> {
    const branch = pending.operation === 'cut-branch';
    const origin = branch ? 'editor:cut-branch' : 'editor:cut';
    const label = branch ? 'cut-branch' : 'cut';
    const transactionId = this.#nextTransactionId(label);
    return this.#enqueue(async () => {
      if (
        this.#mountGeneration !== pending.mountGeneration ||
        this.#published.snapshot.documentId !== pending.documentId ||
        this.#published.documentGeneration !== pending.documentGeneration ||
        this.#published.snapshot.revision !== pending.baseRevision
      ) {
        return editorFailure(
          editorError(
            branch
              ? BOM_EDITOR_ERROR_CODES.branchCutConflict
              : BOM_EDITOR_ERROR_CODES.cutConflict,
            'CONFLICT',
            {
            reason: 'stale-document',
            },
          ),
        );
      }
      const persistence = this.#persistenceForMutation();
      if (!persistence.ok) {
        return editorFailure(persistence.error);
      }
      const attempt = this.#attempt(transactionId, origin);
      const metadata = this.#persistenceMetadata(
        persistence.value,
        transactionId,
      );
      const batch: BomCommandBatch<TFields> = Object.freeze({
        protocolVersion: this.#protocolVersion,
        documentId: this.#published.snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        baseRevision: attempt.baseRevision,
        transactionId,
        origin,
        timestamp: new Date().toISOString(),
        label,
        ...(metadata === undefined ? {} : metadata),
        commands: pending.commands,
      });
      this.#resetPreparation();
      const executed = await this.#engine.executeBatch(batch);
      return this.#finishLocalTransaction(executed, attempt, {
        session: persistence.value,
        commands: pending.commands,
      });
    });
  }

  #emitClipboardOperation(
    detail: Readonly<{
      readonly operation?: BomClipboardOperation | BomBranchClipboardOperation;
      readonly outcome: 'written' | 'denied' | 'failed';
      readonly documentId?: string;
      readonly documentGeneration?: number;
      readonly occurrenceCount: number;
      readonly fieldIds: readonly string[];
      readonly formats: readonly BomClipboardFormat[];
      readonly branch?: Readonly<BomClipboardBranchScope>;
      readonly method?: BomClipboardWriteMethod;
      readonly decisionId?: string;
      readonly reasonCode?: string;
    }>,
  ): void {
    const documentId = detail.documentId ?? this.#published.snapshot.documentId;
    const documentGeneration = detail.documentGeneration ??
      this.#published.documentGeneration;
    const decisionId = safeAuditToken(detail.decisionId);
    const reasonCode = safeAuditToken(detail.reasonCode);
    this.#events.dispatch('clipboardOperation', {
      documentId,
      documentGeneration,
      operation: detail.operation ?? 'copy',
      outcome: detail.outcome,
      occurrenceCount: detail.occurrenceCount,
      fieldIds: Object.freeze([...detail.fieldIds]),
      formats: Object.freeze([...detail.formats]),
      ...(detail.branch === undefined ? {} : { branch: detail.branch }),
      ...(detail.method === undefined ? {} : { method: detail.method }),
      ...(decisionId === undefined ? {} : { decisionId }),
      ...(reasonCode === undefined ? {} : { reasonCode }),
    });
    const operation = detail.operation ?? 'copy';
    if (detail.outcome === 'written' && detail.method !== undefined) {
      this.#events.dispatch('clipboardCompleted', {
        documentId,
        documentGeneration,
        operation,
        method: detail.method,
        occurrenceCount: detail.occurrenceCount,
        fieldIds: Object.freeze([...detail.fieldIds]),
        formats: Object.freeze([...detail.formats]),
        ...(decisionId === undefined ? {} : { decisionId }),
        ...(detail.branch === undefined ? {} : { branch: detail.branch }),
      });
    } else if (detail.outcome === 'denied' || detail.outcome === 'failed') {
      this.#events.dispatch('clipboardRejected', {
        documentId,
        documentGeneration,
        operation,
        outcome: detail.outcome,
        occurrenceCount: detail.occurrenceCount,
        fieldIds: Object.freeze([...detail.fieldIds]),
        formats: Object.freeze([...detail.formats]),
        ...(detail.method === undefined ? {} : { method: detail.method }),
        ...(decisionId === undefined ? {} : { decisionId }),
        ...(reasonCode === undefined ? {} : { reasonCode }),
        ...(detail.branch === undefined ? {} : { branch: detail.branch }),
      });
    }
  }

  #dispatchBeforeCopy(
    detail: Readonly<{
      readonly operation: BomClipboardOperation | BomBranchClipboardOperation;
      readonly occurrenceCount: number;
      readonly fieldIds: readonly string[];
      readonly formats: readonly BomClipboardFormat[];
      readonly branch?: Readonly<BomClipboardBranchScope>;
    }>,
  ): boolean {
    const before = this.#events.dispatch('beforeCopy', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      operation: detail.operation,
      occurrenceCount: detail.occurrenceCount,
      fieldIds: Object.freeze([...detail.fieldIds]),
      formats: Object.freeze([...detail.formats]),
      ...(detail.branch === undefined ? {} : { branch: detail.branch }),
    });
    if (!before.ok) {
      this.#emitClipboardOperation({
        ...detail,
        outcome: 'failed',
        reasonCode: 'event-dispatch-failed',
      });
      return false;
    }
    if (before.event.defaultPrevented) {
      this.#emitClipboardOperation({
        ...detail,
        outcome: 'denied',
        reasonCode: 'cancelled',
      });
      return false;
    }
    return true;
  }

  #paste(
    input: Readonly<BomPasteInput>,
    source: BomPasteSource,
    signal?: AbortSignal,
  ): Promise<BomPasteResult<TFields>> {
    const normalized = normalizePasteInput(input);
    if (normalized === null) {
      return this.#enqueuePasteRejection(source, signal, () =>
        Object.freeze({
          inputBytes: 0,
          error: editorError(BOM_EDITOR_ERROR_CODES.pasteInvalid, 'VALIDATION', {
            reason: 'input-invalid',
          }),
          reasonCode: 'input-invalid',
        }),
      );
    }
    return this.#enqueuePaste(normalized, source, signal);
  }

  #previewPaste(
    input: Readonly<BomPasteInput>,
    source: BomPasteSource,
    signal?: AbortSignal,
  ): Promise<BomPastePreviewResult<TFields>> {
    const normalized = normalizePasteInput(input);
    if (normalized === null) {
      return this.#enqueue(() =>
        editorSuccess(
          this.#previewFailure(
            editorError(BOM_EDITOR_ERROR_CODES.pasteInvalid, 'VALIDATION', {
              reason: 'input-invalid',
            }),
          ),
        ),
      ).then((settled) =>
        settled.ok ? settled.value : this.#previewFailure(settled.error));
    }
    const pasteTargetEpoch = this.#pasteTargetEpoch;
    const queued = this.#enqueue(async (): Promise<BomResult<BomPastePreviewResult<TFields>>> =>
      editorSuccess(
        await this.#runQueuedPreview(
          normalized,
          source,
          pasteTargetEpoch,
          signal,
        ),
      ));
    return queued.then((settled) => {
      if (settled.ok) return settled.value;
      return this.#previewFailure(
        settled.error,
      );
    });
  }

  async #runQueuedPreview(
    input: Readonly<BomPasteInput>,
    source: BomPasteSource,
    pasteTargetEpoch: number,
    signal?: AbortSignal,
  ): Promise<BomPastePreviewResult<TFields>> {
    if (this.#isDestroyedOrDestroying()) {
      return this.#previewFailure(
        editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'),
      );
    }
    if (signal?.aborted) {
      return this.#previewFailure(
        editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
      );
    }
    if (
      this.#editMachine.state.status !== 'idle' &&
      this.#editMachine.state.status !== 'focused'
    ) {
      return this.#previewFailure(
        editorError(BOM_EDITOR_ERROR_CODES.pasteTarget, 'VALIDATION', {
          reason: 'editing-active',
        }),
      );
    }

    const state = this.#published;
    const taskId = this.#nextTaskId('paste-preview');
    const pasteAbort = combineAbortSignals(
      signal,
      this.#pasteParsingAbortController.signal,
    );
    let completed = 0;
    const report = (next: number, stage: string): void => {
      if (next < completed) return;
      completed = next;
      this.#emitTaskProgress(taskId, state, completed, stage);
    };
    report(0, 'parse');
    try {
      const candidate = await this.#parsePasteCandidates(
        input,
        pasteAbort.signal,
        {
          documentId: state.snapshot.documentId,
          documentGeneration: state.documentGeneration,
        },
      );
      const inputBytes = candidate.inputBytes;
      if (candidate.status === 'aborted' || pasteAbort.signal.aborted) {
        report(completed, 'cancelled');
        return this.#previewFailure(
          editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        );
      }
      const parsingStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
      if (parsingStaleness !== undefined) {
        report(completed, 'stale');
        return this.#previewFailure(
          editorError(BOM_EDITOR_ERROR_CODES.pasteConflict, 'CONFLICT', {
            reason: parsingStaleness,
          }),
        );
      }
      if (candidate.status === 'branch') {
        report(completed, 'failed');
        return this.#previewFailure(
          editorError(BOM_EDITOR_ERROR_CODES.pasteInvalid, 'VALIDATION', {
            reason: 'branch-preview-unsupported',
          }),
        );
      }
      if (candidate.status === 'failed') {
        report(completed, 'failed');
        return this.#previewFailure(
          editorError(
            candidate.limit
              ? BOM_EDITOR_ERROR_CODES.pasteLimit
              : BOM_EDITOR_ERROR_CODES.pasteInvalid,
            candidate.limit ? 'SECURITY_LIMIT' : 'VALIDATION',
            { reason: candidate.reason },
          ),
          candidate.diagnostics,
        );
      }
      report(1, 'prepare');
      const prepared = await this.#preparePaste(
        candidate.rows,
        candidate.format,
        source,
        inputBytes,
        state,
        pasteTargetEpoch,
        pasteAbort.signal,
      );
      if (!prepared.ok) {
        report(completed, pasteAbort.signal.aborted ? 'cancelled' : 'failed');
        return this.#previewFailure(
          prepared.error,
          prepared.diagnostics,
        );
      }
      if (pasteAbort.signal.aborted) {
        report(completed, 'cancelled');
        return this.#previewFailure(
          editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        );
      }
      report(2, 'authorize');
      const preparation = prepared.value;
      const cells = Object.freeze(
        preparation.cells.map((entry) => entry.requestCell),
      );
      report(3, 'preview');
      report(4, 'complete');
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          inputBytes: preparation.inputBytes,
          format: preparation.format,
          rowCount: preparation.rowCount,
          columnCount: preparation.columnCount,
          cellCount: cells.length,
          decisionId: preparation.decisionId,
          cells,
        } satisfies BomPastePreview<TFields>),
      });
    } finally {
      pasteAbort.dispose();
    }
  }

  #nextTaskId(taskType: string): string {
    this.#taskSequence += 1;
    return taskType + '-' + String(this.#taskSequence);
  }

  #emitTaskProgress(
    taskId: string,
    state: Readonly<PublishedState<TFields>>,
    completed: number,
    stage: string,
  ): void {
    if (this.#isDestroyedOrDestroying()) return;
    this.#events.dispatch('taskProgress', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId,
      taskType: 'paste',
      completed,
      total: PASTE_PROGRESS_TOTAL,
      stage,
    });
  }

  #emitSearchProgress(
    taskId: string,
    state: Readonly<PublishedState<TFields>>,
    completed: number,
    total: number,
  ): void {
    if (this.#isDestroyedOrDestroying()) return;
    this.#events.dispatch('taskProgress', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId,
      taskType: 'search',
      completed,
      total,
      stage: completed >= total ? 'complete' : 'scan',
    });
  }

  #emitMatchProgress(
    taskId: string,
    state: Readonly<PublishedState<TFields>>,
    completed: number,
    total: number,
    stage: 'start' | 'scan' | 'complete',
  ): void {
    if (this.#isDestroyedOrDestroying()) return;
    this.#events.dispatch('taskProgress', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId,
      taskType: 'match',
      completed,
      total,
      stage,
    });
  }

  #emitMaterialMatchAudit(
    proposal: Readonly<BomMaterialMatchProposal>,
    decision: import('@bom-editor/runtime').BomMaterialMatchAuditEvent['decision'],
    detail: Readonly<{
      readonly decisionId?: string;
      readonly reasonCode?: string;
      readonly transactionId?: string;
    }> = {},
  ): void {
    if (this.#isDestroyedOrDestroying()) return;
    const decisionId = safeAuditToken(detail.decisionId);
    const reasonCode = safeAuditToken(detail.reasonCode);
    this.#events.dispatch('materialMatchAudit', {
      documentId: proposal.documentId,
      documentGeneration: proposal.documentGeneration,
      baseRevision: proposal.baseRevision,
      proposalId: proposal.proposalId,
      decision,
      targetOccurrenceId: proposal.targetOccurrenceId,
      candidateOccurrenceId: proposal.candidateOccurrenceId,
      algorithmVersion: proposal.algorithmVersion,
      score: proposal.score,
      confidence: proposal.confidence,
      ...(decisionId === undefined ? {} : { decisionId }),
      ...(reasonCode === undefined ? {} : { reasonCode }),
      ...(detail.transactionId === undefined
        ? {}
        : { transactionId: detail.transactionId }),
    });
  }

  #emitValidationProgress(
    taskId: string,
    state: Readonly<PublishedState<TFields>>,
    completed: number,
    total: number,
    stage: 'start' | 'scan' | 'complete',
  ): void {
    if (this.#isDestroyedOrDestroying()) return;
    this.#events.dispatch('taskProgress', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId,
      taskType: 'validate',
      completed,
      total,
      stage,
    });
  }

  #emitImportProgress(
    taskId: string,
    state: Readonly<PublishedState<TFields>>,
    completed: number,
    total: number,
    stage: string,
  ): void {
    if (this.#isDestroyedOrDestroying()) return;
    this.#events.dispatch('taskProgress', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId,
      taskType: 'import',
      completed,
      total,
      stage,
    });
  }

  #emitExportProgress(
    taskId: string,
    state: Readonly<PublishedState<TFields>>,
    completed: number,
    total: number,
    stage: string,
  ): void {
    if (this.#isDestroyedOrDestroying()) return;
    this.#events.dispatch('taskProgress', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      taskId,
      taskType: 'export',
      completed,
      total,
      stage,
    });
  }

  #previewFailure(
    error: BomError,
    diagnostics: readonly BomPasteCellDiagnostic[] = [],
  ): BomPastePreviewResult<TFields> {
    return Object.freeze({
      ok: false as const,
      error,
      diagnostics: Object.freeze([...diagnostics]),
    });
  }

  async #enqueuePasteRejection(
    source: BomPasteSource,
    signal: AbortSignal | undefined,
    createRejection: () => Readonly<PasteRejection>,
  ): Promise<BomPasteResult<TFields>> {
    const auditState = this.#published;
    const queued = this.#enqueue(() => {
      if (signal?.aborted) {
        return editorSuccess(
          this.#rejectPaste({
            source,
            inputBytes: 0,
            error: editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
            reasonCode: 'aborted',
          }),
        );
      }
      const rejection = createRejection();
      return editorSuccess(
        this.#rejectPaste({
          source,
          inputBytes: rejection.inputBytes,
          ...(rejection.format === undefined ? {} : { format: rejection.format }),
          error: rejection.error,
          reasonCode: rejection.reasonCode,
        }),
      );
    });
    const settled = await queued;
    if (settled.ok) {
      return settled.value;
    }
    return this.#rejectPaste({
      source,
      inputBytes: 0,
      documentId: auditState.snapshot.documentId,
      documentGeneration: auditState.documentGeneration,
      error: settled.error,
      reasonCode: pasteFailureReasonCode(settled.error),
    });
  }

  async #parsePasteCandidates(
    input: Readonly<BomPasteInput>,
    signal: AbortSignal,
    workerContext?: Readonly<ClipboardParseWorkerContext>,
  ): Promise<PasteCandidateResult> {
    const failures: PasteCandidateFailure[] = [];
    const recordFailure = (
      candidateFormat: BomPasteFormat,
      inputBytes: number,
      reason: string,
      limit: boolean,
      diagnostics: readonly BomPasteCellDiagnostic[] = [],
      format: BomPasteFormat | undefined = candidateFormat,
    ): void => {
      failures.push(Object.freeze({
        inputBytes,
        ...(format === undefined ? {} : { format }),
        candidateFormat,
        reason,
        limit,
        diagnostics: Object.freeze([...diagnostics]),
      }));
    };
    if (input.internal !== undefined) {
      const branch = await parseBranchClipboardAsync(
        input.internal,
        this.#pasteLimits,
        { signal },
      );
      if (branch.status === 'aborted') {
        return Object.freeze({
          status: 'aborted',
          inputBytes: branch.inputBytes,
        });
      }
      if (branch.parsed.ok) {
        return Object.freeze({
          status: 'branch',
          inputBytes: branch.inputBytes,
          branch: branch.parsed.envelope,
        });
      }
      if (branch.parsed.reason !== 'not-branch') {
        recordFailure(
          'internal',
          branch.inputBytes,
          'branch-' + branch.parsed.reason,
          branch.parsed.reason === 'input-too-large' ||
            branch.parsed.reason === 'too-many-nodes' ||
            branch.parsed.reason === 'node-too-large',
          Object.freeze([
            Object.freeze({
              sourceRow: 0,
              sourceColumn: 0,
              code: 'branch-' + branch.parsed.reason,
            }),
          ]),
        );
      } else {
        const internal = await parseInternalClipboardAsync(
          input.internal,
          this.#pasteLimits,
          { signal },
        );
        if (internal.status === 'aborted') {
          return Object.freeze({
            status: 'aborted',
            inputBytes: internal.inputBytes,
          });
        }
        if (internal.parsed.ok) {
          return Object.freeze({
            status: 'parsed',
            inputBytes: internal.inputBytes,
            format: 'internal',
            rows: internal.parsed.rows,
          });
        }
        recordFailure(
          'internal',
          internal.inputBytes,
          internal.parsed.reason,
          isInternalClipboardLimitFailure(internal.parsed.reason),
          pasteDiagnosticsFromClipboard(internal.parsed.diagnostics),
        );
      }
    }
    if (input.html !== undefined) {
      const html = await parseHtmlClipboardAsync(
        input.html,
        this.#pasteLimits,
        { signal },
      );
      if (html.status === 'aborted') {
        return Object.freeze({
          status: 'aborted',
          inputBytes: html.inputBytes,
        });
      }
      if (html.parsed.ok) {
        return Object.freeze({
          status: 'parsed',
          inputBytes: html.inputBytes,
          format: 'html',
          rows: html.parsed.rows,
        });
      }
      recordFailure(
        'html',
        html.inputBytes,
        html.parsed.reason,
        isHtmlClipboardLimitFailure(html.parsed.reason),
        pasteDiagnosticsFromClipboard(html.parsed.diagnostics),
      );
    }
    if (input.text !== undefined) {
      const text = await this.#parseClipboardTextCandidate(
        input.text,
        signal,
        workerContext,
      );
      if (text.status === 'aborted') {
        return Object.freeze({
          status: 'aborted',
          inputBytes: text.inputBytes,
        });
      }
      if (text.parsed.ok) {
        return Object.freeze({
          status: 'parsed',
          inputBytes: text.inputBytes,
          format: text.parsed.format,
          rows: text.parsed.rows,
        });
      }
      recordFailure(
        'text',
        text.inputBytes,
        text.parsed.reason,
        isClipboardTextLimitFailure(text.parsed.reason),
        pasteDiagnosticsFromClipboard(text.parsed.diagnostics),
        undefined,
      );
    }
    if (input.textStream !== undefined) {
      const text = await parseClipboardTextStreamAsync(
        input.textStream,
        this.#pasteLimits,
        signal,
      );
      if (text.status === 'aborted') {
        return Object.freeze({
          status: 'aborted',
          inputBytes: text.inputBytes,
        });
      }
      if (text.parsed.ok) {
        return Object.freeze({
          status: 'parsed',
          inputBytes: text.inputBytes,
          format: text.parsed.format,
          rows: text.parsed.rows,
        });
      }
      recordFailure(
        'text',
        text.inputBytes,
        text.parsed.reason,
        isClipboardTextLimitFailure(text.parsed.reason),
        pasteDiagnosticsFromClipboard(text.parsed.diagnostics),
        undefined,
      );
    }
    return failures.length > 0
      ? aggregatePasteCandidateFailures(failures)
      : Object.freeze({
          status: 'failed',
          inputBytes: 0,
          reason: 'input-invalid',
          limit: false,
        });
  }

  async #parseClipboardTextCandidate(
    text: string,
    signal: AbortSignal,
    workerContext?: Readonly<ClipboardParseWorkerContext>,
  ): Promise<ClipboardTextParseAsyncResult> {
    if (
      workerContext !== undefined &&
      text.length >= CLIPBOARD_WORKER_MIN_TEXT_LENGTH
    ) {
      const worker = this.#clipboardWorkerForParsing();
      if (worker !== undefined) {
        try {
          return await worker.parseText(
            text,
            this.#pasteLimits,
            workerContext,
            signal,
          );
        } catch {
          // Worker startup/crash is a capability failure, not a parse result.
          // The bounded cooperative main-thread parser remains equivalent.
          this.#disposeClipboardWorker();
          if (signal.aborted) {
            return { status: 'aborted', inputBytes: 0 };
          }
        }
      }
    }
    return parseClipboardTextAsync(text, this.#pasteLimits, { signal });
  }

  #clipboardWorkerForParsing(): ClipboardParseWorkerClient | undefined {
    if (this.#clipboardWorker !== undefined) {
      return this.#clipboardWorker;
    }
    if (
      !this.#capabilities.worker ||
      this.#clipboardWorkerConstructor === undefined
    ) {
      return undefined;
    }
    const created = createClipboardParseWorkerClient(
      this.#clipboardWorkerConstructor,
    );
    if (created === undefined) {
      this.#clipboardWorkerConstructor = undefined;
      return undefined;
    }
    this.#clipboardWorker = created;
    return created;
  }

  #disposeClipboardWorker(): void {
    this.#clipboardWorker?.dispose();
    this.#clipboardWorker = undefined;
    this.#clipboardWorkerConstructor = undefined;
  }

  #pasteStaleness(
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
  ): 'stale-document' | 'stale-selection' | undefined {
    if (
      this.#published !== state ||
      this.#published.snapshot.documentId !== state.snapshot.documentId ||
      this.#published.documentGeneration !== state.documentGeneration ||
      this.#published.snapshot.revision !== state.snapshot.revision
    ) {
      return 'stale-document';
    }
    return this.#pasteTargetEpoch === pasteTargetEpoch
      ? undefined
      : 'stale-selection';
  }

  async #enqueuePaste(
    input: Readonly<BomPasteInput>,
    source: BomPasteSource,
    signal?: AbortSignal,
  ): Promise<BomPasteResult<TFields>> {
    const pasteTargetEpoch = this.#pasteTargetEpoch;
    const auditState = this.#published;
    const queued = this.#enqueue(async (): Promise<BomResult<BomPasteResult<TFields>>> =>
      editorSuccess(
        await this.#runQueuedPaste(input, source, pasteTargetEpoch, signal),
      ));
    const settled = await queued;
    if (settled.ok) {
      return settled.value;
    }
    return this.#rejectPaste({
      source,
      inputBytes: 0,
      documentId: auditState.snapshot.documentId,
      documentGeneration: auditState.documentGeneration,
      error: settled.error,
      reasonCode: pasteFailureReasonCode(settled.error),
    });
  }

  async #runQueuedPaste(
    input: Readonly<BomPasteInput>,
    source: BomPasteSource,
    pasteTargetEpoch: number,
    signal?: AbortSignal,
  ): Promise<BomPasteResult<TFields>> {
    if (this.#isDestroyedOrDestroying()) {
      return Promise.resolve(
        this.#rejectPaste({
          source,
          inputBytes: 0,
          error: editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'),
          reasonCode: 'destroyed',
        }),
      );
    }
    if (signal?.aborted) {
      return Promise.resolve(
        this.#rejectPaste({
          source,
          inputBytes: 0,
          error: editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
          reasonCode: 'aborted',
        }),
      );
    }
    if (
      this.#editMachine.state.status !== 'idle' &&
      this.#editMachine.state.status !== 'focused'
    ) {
      return Promise.resolve(
        this.#rejectPaste({
          source,
          inputBytes: 0,
          error: editorError(BOM_EDITOR_ERROR_CODES.pasteTarget, 'VALIDATION', {
            reason: 'editing-active',
          }),
          reasonCode: 'editing-active',
        }),
      );
    }

    const state = this.#published;
    const taskId = this.#nextTaskId('paste');
    const pasteAbort = combineAbortSignals(
      signal,
      this.#pasteParsingAbortController.signal,
    );
    let progressCompleted = 0;
    const reportProgress = (next: number, stage: string): void => {
      if (next < progressCompleted) return;
      progressCompleted = next;
      this.#emitTaskProgress(taskId, state, progressCompleted, stage);
    };
    reportProgress(0, 'parse');
    try {
    const candidate = await this.#parsePasteCandidates(
      input,
      pasteAbort.signal,
      {
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
      },
    );
    const inputBytes = candidate.inputBytes;
    if (this.#isDestroyedOrDestroying()) {
      return this.#rejectPaste({
        source,
        inputBytes,
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
        error: editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'),
        reasonCode: 'destroyed',
      });
    }
    if (candidate.status === 'aborted' || pasteAbort.signal.aborted) {
      reportProgress(progressCompleted, 'cancelled');
      return this.#rejectPaste({
        source,
        inputBytes,
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
        error: editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        reasonCode: 'aborted',
      });
    }
    const parsingStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (parsingStaleness !== undefined) {
      reportProgress(progressCompleted, 'stale');
      return this.#rejectPaste({
        source,
        inputBytes,
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
        error: editorError(BOM_EDITOR_ERROR_CODES.pasteConflict, 'CONFLICT', {
          reason: parsingStaleness,
        }),
        reasonCode: parsingStaleness,
      });
    }
    if (candidate.status === 'branch') {
      reportProgress(1, 'prepare');
      const prepared = await this.#prepareBranchPaste(
        candidate.branch,
        source,
        inputBytes,
        state,
        pasteTargetEpoch,
        pasteAbort.signal,
      );
      if (!prepared.ok) {
        reportProgress(
          progressCompleted,
          pasteAbort.signal.aborted ? 'cancelled' : 'failed',
        );
        return this.#rejectPaste({
          source,
          inputBytes,
          ...(prepared.documentId === undefined
            ? {}
            : { documentId: prepared.documentId }),
          ...(prepared.documentGeneration === undefined
            ? {}
            : { documentGeneration: prepared.documentGeneration }),
          format: 'internal',
          rowCount: prepared.rowCount,
          columnCount: 0,
          error: prepared.error,
          diagnostics: prepared.diagnostics,
          ...(prepared.outcome === undefined ? {} : { outcome: prepared.outcome }),
          ...(prepared.decisionId === undefined
            ? {}
            : { decisionId: prepared.decisionId }),
          ...(prepared.reasonCode === undefined
            ? {}
            : { reasonCode: prepared.reasonCode }),
        });
      }
      const preparation = prepared.value;
      reportProgress(2, 'authorize');
      const transactionId = this.#nextTransactionId('paste-branch');
      reportProgress(3, 'commit');
      const committed = await this.#commitPreparedBranchPaste(
        preparation,
        state,
        transactionId,
        pasteAbort.signal,
      );
      if (!committed.ok) {
        reportProgress(
          progressCompleted,
          pasteAbort.signal.aborted ? 'cancelled' : 'failed',
        );
        return this.#rejectPaste({
          source: preparation.source,
          inputBytes: preparation.inputBytes,
          documentId: preparation.documentId,
          documentGeneration: preparation.documentGeneration,
          format: preparation.format,
          rowCount: preparation.rowCount,
          columnCount: preparation.columnCount,
          targetCellCount: 0,
          decisionId: preparation.decisionId,
          error: committed.error,
          reasonCode: pasteFailureReasonCode(committed.error),
        });
      }
      reportProgress(4, 'complete');
      this.#emitPasteOperation({
        source: preparation.source,
        outcome: 'committed',
        inputBytes: preparation.inputBytes,
        format: preparation.format,
        rowCount: preparation.rowCount,
        columnCount: preparation.columnCount,
        targetCellCount: 0,
        diagnosticCount: 0,
        decisionId: preparation.decisionId,
        transactionId: committed.value.commit.transactionId,
      });
      return Object.freeze({ ok: true, value: committed.value });
    }
    if (candidate.status === 'failed') {
      reportProgress(progressCompleted, 'failed');
      return Promise.resolve(
        this.#rejectPaste({
          source,
          inputBytes,
          documentId: state.snapshot.documentId,
          documentGeneration: state.documentGeneration,
          error: editorError(
            candidate.limit
              ? BOM_EDITOR_ERROR_CODES.pasteLimit
              : BOM_EDITOR_ERROR_CODES.pasteInvalid,
            candidate.limit ? 'SECURITY_LIMIT' : 'VALIDATION',
            { reason: candidate.reason },
          ),
          ...(candidate.format === undefined ? {} : { format: candidate.format }),
          ...(candidate.diagnostics === undefined
            ? {}
            : { diagnostics: candidate.diagnostics }),
          reasonCode: candidate.reason,
        }),
      );
    }
    reportProgress(1, 'prepare');
    const prepared = await this.#preparePaste(
      candidate.rows,
      candidate.format,
      source,
      inputBytes,
      state,
      pasteTargetEpoch,
      pasteAbort.signal,
    );
    if (!prepared.ok) {
      reportProgress(
        progressCompleted,
        pasteAbort.signal.aborted ? 'cancelled' : 'failed',
      );
      if (this.#isDestroyedOrDestroying()) {
        return this.#rejectPaste({
          source,
          inputBytes,
          documentId: state.snapshot.documentId,
          documentGeneration: state.documentGeneration,
          error: editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'),
          reasonCode: 'destroyed',
        });
      }
      return Promise.resolve(
        this.#rejectPaste({
          source,
          inputBytes,
          ...(prepared.documentId === undefined
            ? {}
            : { documentId: prepared.documentId }),
          ...(prepared.documentGeneration === undefined
            ? {}
            : { documentGeneration: prepared.documentGeneration }),
          ...(prepared.format === undefined ? {} : { format: prepared.format }),
          ...(prepared.rowCount === undefined
            ? {}
            : { rowCount: prepared.rowCount }),
          ...(prepared.columnCount === undefined
            ? {}
            : { columnCount: prepared.columnCount }),
          error: prepared.error,
          diagnostics: prepared.diagnostics,
          ...(prepared.outcome === undefined ? {} : { outcome: prepared.outcome }),
          ...(prepared.decisionId === undefined
            ? {}
            : { decisionId: prepared.decisionId }),
          ...(prepared.reasonCode === undefined
            ? {}
            : { reasonCode: prepared.reasonCode }),
        }),
      );
    }

    const preparation = prepared.value;
    reportProgress(2, 'authorize');
    const transactionId = this.#nextTransactionId('paste');
    reportProgress(3, 'commit');
    const committed = await this.#commitPreparedPaste(
      preparation,
      state,
      transactionId,
      pasteAbort.signal,
    );
    if (!committed.ok) {
      reportProgress(
        progressCompleted,
        pasteAbort.signal.aborted ? 'cancelled' : 'failed',
      );
      return this.#rejectPaste({
        source: preparation.source,
        inputBytes: preparation.inputBytes,
        documentId: preparation.documentId,
        documentGeneration: preparation.documentGeneration,
        format: preparation.format,
        rowCount: preparation.rowCount,
        columnCount: preparation.columnCount,
        targetCellCount: preparation.cells.length,
        decisionId: preparation.decisionId,
        error: committed.error,
        reasonCode: pasteFailureReasonCode(committed.error),
      });
    }
    reportProgress(4, 'complete');
    this.#emitPasteOperation({
      source: preparation.source,
      outcome: 'committed',
      inputBytes: preparation.inputBytes,
      format: preparation.format,
      rowCount: preparation.rowCount,
      columnCount: preparation.columnCount,
      targetCellCount: preparation.cells.length,
      diagnosticCount: 0,
      decisionId: preparation.decisionId,
      transactionId: committed.value.commit.transactionId,
    });
    return Object.freeze({ ok: true, value: committed.value });
    } finally {
      pasteAbort.dispose();
    }
  }

  async #prepareBranchPaste(
    envelope: Readonly<InternalBranchClipboardEnvelope>,
    source: BomPasteSource,
    inputBytes: number,
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
    signal?: AbortSignal,
  ): Promise<BranchPastePreparationResult<TFields>> {
    const rowCount = envelope.nodes.length;
    const fail = (
      error: BomError,
      detail: Readonly<{
        readonly outcome?: 'denied' | 'failed';
        readonly decisionId?: string;
        readonly reasonCode?: string;
      }> = {},
    ): BranchPastePreparationResult<TFields> => ({
      ok: false,
      error,
      diagnostics: Object.freeze([]),
      rowCount,
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      ...detail,
    });
    const stale = (
      reason: 'stale-document' | 'stale-selection',
    ): BranchPastePreparationResult<TFields> => fail(
      editorError(BOM_EDITOR_ERROR_CODES.pasteConflict, 'CONFLICT', { reason }),
      { reasonCode: reason },
    );
    if (signal?.aborted) {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        { reasonCode: 'aborted' },
      );
    }
    const initialStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (initialStaleness !== undefined) return stale(initialStaleness);
    if (state.snapshot.completeness !== 'complete') {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.branchInvalid, 'VALIDATION', {
          reason: 'partial-structure',
        }),
        { reasonCode: 'branch-partial-structure' },
      );
    }
    if (this.#selection.ranges !== undefined || this.#selection.mode === 'column') {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pasteTarget, 'VALIDATION', {
          reason: 'branch-target-unsupported',
        }),
        { reasonCode: 'branch-target-unsupported' },
      );
    }
    const active = this.#selection.activeCell;
    const activeNode = active === null
      ? undefined
      : state.indexes.rowById.get(active.occurrenceId);
    if (active === null || activeNode === undefined) {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pasteTarget, 'VALIDATION', {
          reason: 'target-unavailable',
        }),
        { reasonCode: 'target-unavailable' },
      );
    }

    const normalized = normalizeBomDocumentSnapshot<TFields>(
      {
        schemaVersion: this.#schema.schemaVersion,
        documentId: this.instanceId + ':clipboard-branch',
        revision: 'clipboard',
        positionKeyCodecVersion: LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
        completeness: 'complete',
        knownRootCount: envelope.roots.length,
        roots: envelope.roots,
        nodes: envelope.nodes,
      } as unknown,
      this.#schema,
      { limits: { maxNodes: DEFAULT_BRANCH_NODE_LIMIT } },
    );
    if (!normalized.ok) {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.branchInvalid, 'VALIDATION', {
          reason: 'schema-or-structure-invalid',
        }),
        { reasonCode: 'branch-schema-invalid' },
      );
    }

    const newIdBySourceId = new Map<OccurrenceId, OccurrenceId>();
    const allocatedIds = new Set<OccurrenceId>();
    const idPrefix = this.instanceId + ':branch-paste:' +
      String(++this.#branchPasteSequence) + ':';
    for (let index = 0; index < normalized.value.nodes.length; index += 1) {
      const sourceNode = normalized.value.nodes[index]!;
      let candidate = idPrefix + String(index);
      while (
        state.indexes.rowById.has(candidate) ||
        allocatedIds.has(candidate)
      ) {
        candidate += '-';
      }
      newIdBySourceId.set(sourceNode.occurrenceId, candidate);
      allocatedIds.add(candidate);
      if ((index + 1) % PASTE_PREPARATION_YIELD_CELL_INTERVAL === 0) {
        if (!(await yieldPastePreparation(signal)) || signal?.aborted) {
          return fail(
            editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
            { reasonCode: 'aborted' },
          );
        }
        const staleness = this.#pasteStaleness(state, pasteTargetEpoch);
        if (staleness !== undefined) return stale(staleness);
      }
    }

    const columnIdByFieldPath = new Map<string, string>();
    for (const column of this.#columns) {
      columnIdByFieldPath.set(column.fieldPath.join('\u0000'), column.columnId);
    }
    const cells: BomPasteCell[] = [];
    for (let nodeIndex = 0; nodeIndex < normalized.value.nodes.length; nodeIndex += 1) {
      const node = normalized.value.nodes[nodeIndex]!;
      const occurrenceId = newIdBySourceId.get(node.occurrenceId)!;
      for (let fieldIndex = 0; fieldIndex < this.#schema.fields.length; fieldIndex += 1) {
        const field = this.#schema.fields[fieldIndex]!;
        const value = fieldValue(node.fields, field.path);
        if (value === undefined) continue;
        const columnId = columnIdByFieldPath.get(field.path.join('\u0000')) ?? field.fieldId;
        cells.push(Object.freeze({
          sourceRow: nodeIndex,
          sourceColumn: fieldIndex,
          address: Object.freeze({ occurrenceId, columnId }),
          fieldId: field.fieldId,
          value,
        }));
      }
      if ((nodeIndex + 1) % PASTE_PREPARATION_YIELD_CELL_INTERVAL === 0) {
        if (!(await yieldPastePreparation(signal)) || signal?.aborted) {
          return fail(
            editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
            { reasonCode: 'aborted' },
          );
        }
        const staleness = this.#pasteStaleness(state, pasteTargetEpoch);
        if (staleness !== undefined) return stale(staleness);
      }
    }
    if (signal?.aborted) {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        { reasonCode: 'aborted' },
      );
    }
    const beforePolicyStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (beforePolicyStaleness !== undefined) return stale(beforePolicyStaleness);

    const request: Readonly<BomPasteAuthorizationRequest> = Object.freeze({
      operation: 'paste',
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      baseRevision: state.snapshot.revision,
      cells: Object.freeze(cells),
    });
    let decision: Readonly<BomPasteDecision>;
    try {
      decision = this.#pastePolicy?.authorize(request) ?? DEFAULT_PASTE_DECISION;
    } catch {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pastePolicy, 'VALIDATION', {
          reason: 'policy-error',
        }),
        { reasonCode: 'policy-error' },
      );
    }
    if (signal?.aborted) {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        { reasonCode: 'aborted' },
      );
    }
    const afterPolicyStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (afterPolicyStaleness !== undefined) return stale(afterPolicyStaleness);
    const authorization = normalizePasteDecision(decision, request.cells);
    if (authorization.status === 'invalid') {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pastePolicy, 'VALIDATION', {
          reason: 'invalid-policy-decision',
        }),
        { reasonCode: 'invalid-policy-decision' },
      );
    }
    if (authorization.status === 'denied') {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pastePolicy, 'VALIDATION', {
          reason: authorization.reasonCode ?? 'policy-denied',
          decisionId: authorization.decisionId,
          diagnosticCount: authorization.diagnostics.length,
        }),
        {
          outcome: 'denied',
          decisionId: authorization.decisionId,
          reasonCode: authorization.reasonCode ?? 'policy-denied',
        },
      );
    }

    const destinationParentId = activeNode.kind === 'group'
      ? activeNode.occurrenceId
      : activeNode.parentId;
    const initialPlacement = activeNode.kind === 'group'
      ? ({ at: 'last' } as const)
      : ({ afterOccurrenceId: activeNode.occurrenceId } as const);
    const sourceRootIds = new Set(envelope.roots);
    let previousRootId: OccurrenceId | undefined;
    const commands: BomCommand<TFields>[] = [];
    for (const node of normalized.value.nodes) {
      const occurrenceId = newIdBySourceId.get(node.occurrenceId);
      if (occurrenceId === undefined) {
        return fail(
          editorError(BOM_EDITOR_ERROR_CODES.branchInvalid, 'VALIDATION', {
            reason: 'source-parent-missing',
          }),
          { reasonCode: 'branch-source-parent-missing' },
        );
      }
      let parentId: OccurrenceId | null;
      let placement:
        | { readonly at: 'first' | 'last' }
        | { readonly beforeOccurrenceId: OccurrenceId }
        | { readonly afterOccurrenceId: OccurrenceId };
      if (node.parentId === null) {
        parentId = destinationParentId;
        if (!sourceRootIds.has(node.occurrenceId)) {
          return fail(
            editorError(BOM_EDITOR_ERROR_CODES.branchInvalid, 'VALIDATION', {
              reason: 'root-missing',
            }),
            { reasonCode: 'branch-root-missing' },
          );
        }
        placement = previousRootId === undefined
          ? initialPlacement
          : { afterOccurrenceId: previousRootId };
        previousRootId = occurrenceId;
      } else {
        parentId = newIdBySourceId.get(node.parentId) ?? null;
        if (parentId === null) {
          return fail(
            editorError(BOM_EDITOR_ERROR_CODES.branchInvalid, 'VALIDATION', {
              reason: 'source-parent-missing',
            }),
            { reasonCode: 'branch-source-parent-missing' },
          );
        }
        placement = { at: 'last' };
      }
      commands.push(Object.freeze({
        type: 'insertNode',
        parentId,
        placement,
        node: Object.freeze({
          occurrenceId,
          kind: node.kind,
          ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
          ...(node.materialRevision === undefined ? {} : { materialRevision: node.materialRevision }),
          ...(node.materialCode === undefined ? {} : { materialCode: node.materialCode }),
          fields: node.fields,
        }),
      }));
    }
    return {
      ok: true,
      value: Object.freeze({
        documentId: request.documentId,
        documentGeneration: request.documentGeneration,
        baseRevision: request.baseRevision,
        pasteTargetEpoch,
        source,
        inputBytes,
        format: 'internal',
        rowCount,
        columnCount: 0,
        commands: Object.freeze(commands),
        decisionId: authorization.decisionId,
      }),
    };
  }

  async #commitPreparedBranchPaste(
    preparation: BranchPastePreparation<TFields>,
    state: Readonly<PublishedState<TFields>>,
    transactionId: string,
    signal: AbortSignal,
  ): Promise<BomResult<BomPasteReceipt<TFields>>> {
    const queuedStaleness = this.#pasteStaleness(
      state,
      preparation.pasteTargetEpoch,
    );
    if (queuedStaleness !== undefined) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.pasteConflict, 'CONFLICT', {
          reason: queuedStaleness,
        }),
      );
    }
    const persistence = this.#persistenceForMutation();
    if (!persistence.ok) return editorFailure(persistence.error);
    const attempt = this.#attempt(transactionId, 'editor:paste-branch');
    const metadata = this.#persistenceMetadata(persistence.value, transactionId);
    const batch: BomCommandBatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      baseRevision: attempt.baseRevision,
      transactionId,
      origin: 'editor:paste-branch',
      timestamp: new Date().toISOString(),
      label: 'paste-branch',
      ...(metadata === undefined ? {} : metadata),
      commands: preparation.commands,
    });
    this.#resetPreparation();
    if (signal.aborted) return this.#abortedFailure();
    this.#precommitAbortSignals.set(transactionId, signal);
    this.#precommitPasteStalenessGuards.set(
      transactionId,
      Object.freeze({ state, pasteTargetEpoch: preparation.pasteTargetEpoch }),
    );
    let executed: BomTransactionResult<BomCommit<TFields>>;
    try {
      executed = await this.#engine.executeBatch(batch);
    } finally {
      this.#precommitAbortSignals.delete(transactionId);
      this.#precommitPasteStalenessGuards.delete(transactionId);
    }
    const committed = await this.#finishLocalTransaction(executed, attempt, {
      session: persistence.value,
      commands: preparation.commands,
    });
    if (!committed.ok) return editorFailure(committed.error);
    return editorSuccess(Object.freeze({
      commit: committed.value,
      format: preparation.format,
      rowCount: preparation.rowCount,
      columnCount: preparation.columnCount,
      cellCount: 0,
    }));
  }

  async #commitPreparedPaste(
    preparation: PastePreparation,
    state: Readonly<PublishedState<TFields>>,
    transactionId: string,
    signal: AbortSignal,
    origin = 'editor:paste',
    label = 'paste',
    extraCommands: readonly BomCommand<TFields>[] = [],
  ): Promise<BomResult<BomPasteReceipt<TFields>>> {
    const queuedStaleness = this.#pasteStaleness(
      state,
      preparation.pasteTargetEpoch,
    );
    if (queuedStaleness !== undefined) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.pasteConflict, 'CONFLICT', {
          reason: queuedStaleness,
        }),
      );
    }
    const persistence = this.#persistenceForMutation();
    if (!persistence.ok) {
      return editorFailure(persistence.error);
    }
    const attempt = this.#attempt(transactionId, origin);
    const metadata = this.#persistenceMetadata(
      persistence.value,
      transactionId,
    );
    const fieldCommands: readonly BomCommand<TFields>[] = preparation.cells.map((entry) =>
      Object.freeze({
        type: 'setField' as const,
        occurrenceId: entry.requestCell.address.occurrenceId,
        fieldPath: entry.fieldPath,
        value: entry.requestCell.value,
      }),
    );
    const commands: readonly BomCommand<TFields>[] = Object.freeze([
      ...fieldCommands,
      ...extraCommands,
    ]);
    const batch: BomCommandBatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      baseRevision: attempt.baseRevision,
      transactionId,
      origin,
      timestamp: new Date().toISOString(),
      label,
      ...(metadata === undefined ? {} : metadata),
      commands,
    });
    this.#resetPreparation();
    if (signal.aborted) {
      return this.#abortedFailure();
    }
    this.#precommitAbortSignals.set(transactionId, signal);
    this.#precommitPasteStalenessGuards.set(
      transactionId,
      Object.freeze({
        state,
        pasteTargetEpoch: preparation.pasteTargetEpoch,
      }),
    );
    let executed: BomTransactionResult<BomCommit<TFields>>;
    try {
      executed = await this.#engine.executeBatch(batch);
    } finally {
      this.#precommitAbortSignals.delete(transactionId);
      this.#precommitPasteStalenessGuards.delete(transactionId);
    }
    const committed = await this.#finishLocalTransaction(executed, attempt, {
      session: persistence.value,
      commands,
    });
    if (!committed.ok) {
      return editorFailure(committed.error);
    }
    return editorSuccess(
      Object.freeze({
        commit: committed.value,
        format: preparation.format,
        rowCount: preparation.rowCount,
        columnCount: preparation.columnCount,
        cellCount: preparation.cells.length,
      }),
    );
  }

  async #preparePaste(
    rows: readonly (readonly string[])[],
    format: BomPasteFormat,
    source: BomPasteSource,
    inputBytes: number,
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
    signal?: AbortSignal,
    options: Readonly<PastePreparationOptions> = {},
  ): Promise<PastePreparationResult> {
    const rowCount = rows.length;
    const columnCount = rows[0]?.length ?? 0;
    const fail = (
      error: BomError,
      diagnostics: readonly BomPasteCellDiagnostic[] = [],
      detail: Readonly<{
        readonly outcome?: 'denied' | 'failed';
        readonly decisionId?: string;
        readonly reasonCode?: string;
      }> = {},
    ): PastePreparationResult =>
      pastePreparationFailure(error, diagnostics, format, rowCount, columnCount, {
        ...detail,
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
      });
    const aborted = (): PastePreparationResult =>
      fail(editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'), [], {
        reasonCode: 'aborted',
      });
    const stale = (
      reason: 'stale-document' | 'stale-selection',
    ): PastePreparationResult =>
      fail(editorError(BOM_EDITOR_ERROR_CODES.pasteConflict, 'CONFLICT', {
        reason,
      }), [], { reasonCode: reason });
    if (signal?.aborted) return aborted();
    const initialStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (initialStaleness !== undefined) return stale(initialStaleness);
    if (
      rowCount === 0 ||
      columnCount === 0 ||
      rows.some((row) => row.length !== columnCount)
    ) {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pasteTarget, 'VALIDATION', {
          reason: 'ragged-input',
        }),
      );
    }
    const targets = options.target === undefined
      ? await this.#pasteTargets(
        rowCount,
        columnCount,
        signal,
        state,
        pasteTargetEpoch,
      )
      : Object.freeze([options.target]);
    if (signal?.aborted) return aborted();
    const targetStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (targetStaleness !== undefined) return stale(targetStaleness);
    if (targets === null || targets.length === 0) {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pasteTarget, 'VALIDATION', {
          reason: 'target-unavailable',
        }),
      );
    }
    const targetCellCount = targets.reduce(
      (total, target) => total + target.occurrenceIds.length * target.columns.length,
      0,
    );
    if (targetCellCount > this.#pasteLimits.maxCells) {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pasteLimit, 'SECURITY_LIMIT', {
          reason: 'target-cell-limit',
        }),
        [],
        { reasonCode: 'target-cell-limit' },
      );
    }

    let processedCells = 0;
    const checkpoint = async (): Promise<PastePreparationResult | undefined> => {
      if (!(await yieldPastePreparation(signal)) || signal?.aborted) {
        return aborted();
      }
      const staleness = this.#pasteStaleness(state, pasteTargetEpoch);
      return staleness === undefined ? undefined : stale(staleness);
    };

    const targetDiagnostics: BomPasteCellDiagnostic[] = [];
    const invalidTargetCells = targets.map(() => new Set<number>());
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex]!;
      for (let rowIndex = 0; rowIndex < target.occurrenceIds.length; rowIndex += 1) {
        const occurrenceId = target.occurrenceIds[rowIndex]!;
        const node = state.indexes.rowById.get(occurrenceId);
        for (let columnIndex = 0; columnIndex < target.columns.length; columnIndex += 1) {
          const entry = target.columns[columnIndex]!;
          const address = Object.freeze({
            occurrenceId,
            columnId: entry.column.columnId,
          });
          if (node === undefined || !entry.column.editable) {
            invalidTargetCells[targetIndex]!.add(rowIndex * columnCount + columnIndex);
            targetDiagnostics.push(
              Object.freeze({
                sourceRow: rowIndex,
                sourceColumn: columnIndex,
                code: node === undefined ? 'target-unavailable' : 'read-only',
                address,
                fieldId: entry.field.fieldId,
              }),
            );
          }
          processedCells += 1;
          if (processedCells % PASTE_PREPARATION_YIELD_CELL_INTERVAL === 0) {
            const paused = await checkpoint();
            if (paused !== undefined) return paused;
          }
        }
      }
    }
    const cells: PreparedPasteCell[] = [];
    const conversionDiagnostics: BomPasteCellDiagnostic[] = [];
    const fieldTargets = new Map<OccurrenceId, Map<string, Readonly<{
      readonly sourceRow: number;
      readonly sourceColumn: number;
    }>>>();
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex]!;
      const invalidCells = invalidTargetCells[targetIndex]!;
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const occurrenceId = target.occurrenceIds[rowIndex]!;
        const node = state.indexes.rowById.get(occurrenceId);
        for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
          const entry = target.columns[columnIndex]!;
          if (
            node === undefined ||
            invalidCells.has(rowIndex * columnCount + columnIndex)
          ) {
            processedCells += 1;
            if (processedCells % PASTE_PREPARATION_YIELD_CELL_INTERVAL === 0) {
              const paused = await checkpoint();
              if (paused !== undefined) return paused;
            }
            continue;
          }
          const address = Object.freeze({
            occurrenceId,
            columnId: entry.column.columnId,
          });
          let fieldsForOccurrence = fieldTargets.get(occurrenceId);
          if (fieldsForOccurrence === undefined) {
            fieldsForOccurrence = new Map();
            fieldTargets.set(occurrenceId, fieldsForOccurrence);
          }
          const existing = fieldsForOccurrence.get(entry.field.fieldId);
          if (existing !== undefined) {
            if (
              existing.sourceRow !== rowIndex ||
              existing.sourceColumn !== columnIndex
            ) {
              return fail(
                editorError(BOM_EDITOR_ERROR_CODES.pasteTarget, 'VALIDATION', {
                  reason: 'duplicate-field-target',
                }),
                [
                  Object.freeze({
                    sourceRow: rowIndex,
                    sourceColumn: columnIndex,
                    code: 'duplicate-field-target',
                    address,
                    fieldId: entry.field.fieldId,
                  }),
                ],
              );
            }
            processedCells += 1;
            if (processedCells % PASTE_PREPARATION_YIELD_CELL_INTERVAL === 0) {
              const paused = await checkpoint();
              if (paused !== undefined) return paused;
            }
            continue;
          }
          fieldsForOccurrence.set(entry.field.fieldId, Object.freeze({
            sourceRow: rowIndex,
            sourceColumn: columnIndex,
          }));
          const converted = parseEditorValue(
            rows[rowIndex]![columnIndex]!,
            fieldValue(node.fields, entry.column.fieldPath),
            entry.field,
          );
          if (!converted.ok) {
            conversionDiagnostics.push(
              Object.freeze({
                sourceRow: rowIndex,
                sourceColumn: columnIndex,
                code: converted.errors[0]?.code ?? 'conversion-failed',
                address,
                fieldId: entry.field.fieldId,
              }),
            );
            processedCells += 1;
            if (processedCells % PASTE_PREPARATION_YIELD_CELL_INTERVAL === 0) {
              const paused = await checkpoint();
              if (paused !== undefined) return paused;
            }
            continue;
          }
          cells.push(
            Object.freeze({
              requestCell: Object.freeze({
                sourceRow: rowIndex,
                sourceColumn: columnIndex,
                address,
                fieldId: entry.field.fieldId,
                value: converted.value,
              }),
              fieldPath: Object.freeze([...entry.field.path]),
            }),
          );
          processedCells += 1;
          if (processedCells % PASTE_PREPARATION_YIELD_CELL_INTERVAL === 0) {
            const paused = await checkpoint();
            if (paused !== undefined) return paused;
          }
        }
      }
    }
    if (signal?.aborted) return aborted();
    if (targetDiagnostics.length > 0 || conversionDiagnostics.length > 0) {
      const hasUnavailableTarget = targetDiagnostics.some(
        (diagnostic) => diagnostic.code === 'target-unavailable',
      );
      const allReadOnly =
        targetDiagnostics.length > 0 &&
        conversionDiagnostics.length === 0 &&
        targetDiagnostics.every((diagnostic) => diagnostic.code === 'read-only');
      const diagnostics = Object.freeze([
        ...targetDiagnostics,
        ...conversionDiagnostics,
      ]);
      return fail(
        editorError(
          allReadOnly
            ? BOM_EDITOR_ERROR_CODES.pasteReadOnly
            : hasUnavailableTarget
            ? BOM_EDITOR_ERROR_CODES.pasteTarget
            : BOM_EDITOR_ERROR_CODES.pasteInvalid,
          'VALIDATION',
          {
            reason: allReadOnly
              ? 'read-only'
              : hasUnavailableTarget
              ? 'target-unavailable'
              : 'conversion-failed',
            diagnosticCount: diagnostics.length,
          },
        ),
        diagnostics,
      );
    }
    const beforePolicyStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (beforePolicyStaleness !== undefined) return stale(beforePolicyStaleness);

    const request: Readonly<BomPasteAuthorizationRequest> = Object.freeze({
      operation: 'paste',
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      baseRevision: state.snapshot.revision,
      cells: Object.freeze(cells.map((entry) => entry.requestCell)),
    });
    let decision: Readonly<BomPasteDecision>;
    try {
      decision = this.#pastePolicy?.authorize(request) ?? DEFAULT_PASTE_DECISION;
    } catch {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pastePolicy, 'VALIDATION', {
          reason: 'policy-error',
        }),
        [],
        { reasonCode: 'policy-error' },
      );
    }
    if (signal?.aborted) return aborted();
    const afterPolicyStaleness = this.#pasteStaleness(state, pasteTargetEpoch);
    if (afterPolicyStaleness !== undefined) return stale(afterPolicyStaleness);
    const authorization = normalizePasteDecision(decision, request.cells);
    if (authorization.status === 'invalid') {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pastePolicy, 'VALIDATION', {
          reason: 'invalid-policy-decision',
        }),
        [],
        { reasonCode: 'invalid-policy-decision' },
      );
    }
    if (authorization.status === 'denied') {
      return fail(
        editorError(BOM_EDITOR_ERROR_CODES.pastePolicy, 'VALIDATION', {
          reason: authorization.reasonCode ?? 'policy-denied',
          decisionId: authorization.decisionId,
          diagnosticCount: authorization.diagnostics.length,
        }),
        authorization.diagnostics,
        {
          outcome: 'denied',
          decisionId: authorization.decisionId,
          reasonCode: authorization.reasonCode ?? 'policy-denied',
        },
      );
    }
    return {
      ok: true,
      value: Object.freeze({
        documentId: request.documentId,
        documentGeneration: request.documentGeneration,
        baseRevision: request.baseRevision,
        pasteTargetEpoch,
        source,
        inputBytes,
        format,
        rowCount,
        columnCount,
        cells: Object.freeze(cells),
        decisionId: authorization.decisionId,
      }),
    };
  }

  async #pasteTargets(
    rowCount: number,
    columnCount: number,
    signal: AbortSignal | undefined,
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
  ): Promise<readonly PasteTarget[] | null> {
    if (this.#selection.ranges !== undefined) {
      if (this.#selection.ranges.length === 0) return null;
      const targets: PasteTarget[] = [];
      for (const range of this.#selection.ranges) {
        const target = await this.#pasteTargetForRange(
          rowCount,
          columnCount,
          range,
          signal,
          state,
          pasteTargetEpoch,
        );
        if (target === null) return null;
        targets.push(target);
      }
      return Object.freeze(targets);
    }
    const active = this.#selection.activeCell;
    if (active === null) {
      return null;
    }
    const target = await this.#pasteTargetForRange(
      rowCount,
      columnCount,
      this.#selection.range,
      signal,
      state,
      pasteTargetEpoch,
    );
    return target === null ? null : Object.freeze([target]);
  }

  async #pasteTargetForRange(
    rowCount: number,
    columnCount: number,
    range: Readonly<BomCellRange> | null,
    signal: AbortSignal | undefined,
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
  ): Promise<PasteTarget | null> {
    const visibleColumns = visibleColumnDefinitions(this.#columns);
    const active = this.#selection.activeCell;
    let firstRow: number;
    let lastRow: number;
    let firstColumn: number;
    let lastColumn: number;
    if (range !== null) {
      const anchorRow = this.#published.projection.indexOf(
        range.anchor.occurrenceId,
      );
      const focusRow = this.#published.projection.indexOf(
        range.focus.occurrenceId,
      );
      const anchorColumn = visibleColumns.findIndex(
        (column) => column.columnId === range.anchor.columnId,
      );
      const focusColumn = visibleColumns.findIndex(
        (column) => column.columnId === range.focus.columnId,
      );
      if (
        !anchorRow.ok ||
        anchorRow.value === undefined ||
        !focusRow.ok ||
        focusRow.value === undefined ||
        anchorColumn < 0 ||
        focusColumn < 0
      ) {
        return null;
      }
      firstRow = Math.min(anchorRow.value, focusRow.value);
      lastRow = Math.max(anchorRow.value, focusRow.value);
      firstColumn = Math.min(anchorColumn, focusColumn);
      lastColumn = Math.max(anchorColumn, focusColumn);
      if (
        lastRow - firstRow + 1 !== rowCount ||
        lastColumn - firstColumn + 1 !== columnCount
      ) {
        return null;
      }
    } else {
      if (active === null) return null;
      const activeRow = this.#published.projection.indexOf(active.occurrenceId);
      const activeColumn = visibleColumns.findIndex(
        (column) => column.columnId === active.columnId,
      );
      if (!activeRow.ok || activeRow.value === undefined || activeColumn < 0) {
        return null;
      }
      firstRow = activeRow.value;
      lastRow = firstRow + rowCount - 1;
      firstColumn = activeColumn;
      lastColumn = firstColumn + columnCount - 1;
    }
    const occurrenceIds: OccurrenceId[] = [];
    for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
      const occurrence = this.#published.projection.occurrenceAt(rowIndex);
      if (!occurrence.ok || occurrence.value === undefined) {
        return null;
      }
      occurrenceIds.push(occurrence.value);
      if (
        occurrenceIds.length % PASTE_TARGET_YIELD_ROW_INTERVAL === 0 &&
        !(await this.#yieldPasteTarget(signal, state, pasteTargetEpoch))
      ) {
        return null;
      }
    }
    const columns: ClipboardSelectionColumn[] = [];
    for (let columnIndex = firstColumn; columnIndex <= lastColumn; columnIndex += 1) {
      const column = visibleColumns[columnIndex];
      if (column === undefined) {
        return null;
      }
      const field = findSchemaField(this.#schema, column.fieldPath);
      if (field === undefined) {
        return null;
      }
      columns.push(Object.freeze({ column, field }));
    }
    return Object.freeze({
      occurrenceIds: Object.freeze(occurrenceIds),
      columns: Object.freeze(columns),
    });
  }

  async #yieldPasteTarget(
    signal: AbortSignal | undefined,
    state: Readonly<PublishedState<TFields>>,
    pasteTargetEpoch: number,
  ): Promise<boolean> {
    return (await yieldPastePreparation(signal)) &&
      signal?.aborted !== true &&
      this.#pasteStaleness(state, pasteTargetEpoch) === undefined;
  }

  #rejectPaste(
    detail: Readonly<{
      readonly source: BomPasteSource;
      readonly inputBytes: number;
      readonly documentId?: string;
      readonly documentGeneration?: number;
      readonly error: BomError;
      readonly outcome?: 'denied' | 'failed';
      readonly format?: BomPasteFormat;
      readonly rowCount?: number;
      readonly columnCount?: number;
      readonly targetCellCount?: number;
      readonly decisionId?: string;
      readonly reasonCode?: string;
      readonly diagnostics?: readonly BomPasteCellDiagnostic[];
    }>,
  ): BomPasteResult<TFields> {
    const diagnostics = Object.freeze([...(detail.diagnostics ?? [])]);
    if (!this.#isDestroyedOrDestroying()) {
      this.#emitPasteOperation({
        source: detail.source,
        outcome: detail.outcome ?? 'failed',
        inputBytes: detail.inputBytes,
        ...(detail.documentId === undefined
          ? {}
          : { documentId: detail.documentId }),
        ...(detail.documentGeneration === undefined
          ? {}
          : { documentGeneration: detail.documentGeneration }),
        ...(detail.format === undefined ? {} : { format: detail.format }),
        ...(detail.rowCount === undefined ? {} : { rowCount: detail.rowCount }),
        ...(detail.columnCount === undefined
          ? {}
          : { columnCount: detail.columnCount }),
        ...(detail.targetCellCount === undefined
          ? {}
          : { targetCellCount: detail.targetCellCount }),
        diagnosticCount: diagnostics.length,
        ...(detail.decisionId === undefined
          ? {}
          : { decisionId: detail.decisionId }),
        ...(detail.reasonCode === undefined
          ? {}
          : { reasonCode: detail.reasonCode }),
      });
    }
    return Object.freeze({
      ok: false,
      error: detail.error,
      diagnostics,
    });
  }

  #emitPasteOperation(
    detail: Readonly<{
      readonly source: BomPasteSource;
      readonly outcome: 'committed' | 'denied' | 'failed';
      readonly inputBytes: number;
      readonly documentId?: string;
      readonly documentGeneration?: number;
      readonly format?: BomPasteFormat;
      readonly rowCount?: number;
      readonly columnCount?: number;
      readonly targetCellCount?: number;
      readonly diagnosticCount: number;
      readonly decisionId?: string;
      readonly reasonCode?: string;
      readonly transactionId?: string;
    }>,
  ): void {
    const documentId = detail.documentId ?? this.#published.snapshot.documentId;
    const documentGeneration = detail.documentGeneration ??
      this.#published.documentGeneration;
    const decisionId = safeAuditToken(detail.decisionId);
    const reasonCode = safeAuditToken(detail.reasonCode);
    this.#events.dispatch('pasteOperation', {
      documentId,
      documentGeneration,
      source: detail.source,
      outcome: detail.outcome,
      inputBytes: detail.inputBytes,
      diagnosticCount: detail.diagnosticCount,
      ...(detail.format === undefined ? {} : { format: detail.format }),
      ...(detail.rowCount === undefined ? {} : { rowCount: detail.rowCount }),
      ...(detail.columnCount === undefined
        ? {}
        : { columnCount: detail.columnCount }),
      ...(detail.targetCellCount === undefined
        ? {}
        : { targetCellCount: detail.targetCellCount }),
      ...(decisionId === undefined ? {} : { decisionId }),
      ...(reasonCode === undefined ? {} : { reasonCode }),
      ...(detail.transactionId === undefined
        ? {}
        : { transactionId: detail.transactionId }),
    });
  }

  #select(
    address: Readonly<BomCellAddress>,
    reason: BomSelectionChangeReason,
    extend = false,
    additive = false,
    mode: BomSelectionMode | undefined = undefined,
  ): void {
    if (!this.#isValidAddress(address, true)) {
      return;
    }
    this.#ensureEditFocused();
    const previous = this.#selection;
    const next = mode === undefined
      ? selectionForAddress(previous, address, extend, additive)
      : mode === 'row' || mode === 'column'
        ? selectionForAxis(
          previous,
          address,
          extend,
          mode,
          this.#published.projection,
          this.#columns,
        )
        : selectionForAddress(previous, address, extend);
    if (sameSelection(previous, next)) {
      return;
    }
    this.#replaceSelection(next);
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#events.dispatch('selectionChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      previous,
      selection: this.#selection,
      reason,
    });
  }

  #selectAll(): void {
    const projection = this.#published.projection;
    const visibleColumns = visibleColumnDefinitions(this.#columns);
    if (projection.visibleCount === 0 || visibleColumns.length === 0) {
      return;
    }
    const anchorOccurrence = projection.occurrenceAt(0);
    const focusOccurrence = projection.occurrenceAt(projection.visibleCount - 1);
    if (
      !anchorOccurrence.ok ||
      anchorOccurrence.value === undefined ||
      !focusOccurrence.ok ||
      focusOccurrence.value === undefined
    ) {
      return;
    }
    const anchor = Object.freeze({
      occurrenceId: anchorOccurrence.value,
      columnId: visibleColumns[0]!.columnId,
    });
    const focus = Object.freeze({
      occurrenceId: focusOccurrence.value,
      columnId: visibleColumns[visibleColumns.length - 1]!.columnId,
    });
    const previous = this.#selection;
    const next = freezeSelection(focus, { anchor, focus });
    if (sameSelection(previous, next)) {
      return;
    }
    this.#ensureEditFocused();
    this.#replaceSelection(next);
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#events.dispatch('selectionChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      previous,
      selection: this.#selection,
      reason: 'keyboard',
    });
  }

  #toggleExpansion(
    address: Readonly<BomCellAddress>,
    expanded: boolean,
  ): void {
    const changed = this.#published.projection.setExpanded(
      address.occurrenceId,
      expanded,
    );
    if (!changed.ok) {
      this.#emitRuntimeError(
        editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'),
        'view',
      );
      return;
    }
    if (changed.value.changed) {
      this.#pasteTargetEpoch += 1;
    }
    const previous = this.#selection;
    const next = sanitizeSelection(
      previous,
      this.#published.projection,
      this.#published.indexes,
      this.#columns,
      address,
    );
    if (!sameSelection(previous, next)) {
      this.#replaceSelection(next);
      this.#events.dispatch('selectionChanged', {
        documentId: this.#published.snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        previous,
        selection: this.#selection,
        reason: 'view-change',
      });
    }
    this.#refreshRenderer({ layoutChanged: true });
    const previousView = this.#lastView;
    this.#lastView = Object.freeze({
      ...previousView,
      visibleRowCount: this.#published.projection.visibleCount,
    });
    this.#events.dispatch('viewChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      previous: previousView,
      view: this.#lastView,
      reason: 'projection',
    });
  }

  #setExpansionAll(expanded: boolean): void {
    if (typeof expanded !== 'boolean' || this.#isDestroyedOrDestroying()) return;
    const state = this.#published;
    const targetIds = expanded
      ? state.snapshot.nodes
          .filter((node) =>
            (state.indexes.childrenByParent.get(node.occurrenceId)?.length ?? 0) > 0)
          .map((node) => node.occurrenceId)
      : [];
    const previousIds = state.projection.expandedOccurrenceIds();
    const targetIdSet = new Set(targetIds);
    if (
      previousIds.length === targetIds.length &&
      previousIds.every((occurrenceId) => targetIdSet.has(occurrenceId))
    ) {
      return;
    }
    const projection = createVisibleProjection(state.snapshot, {
      indexes: state.indexes,
      ...(this.#rowHeight === undefined ? {} : { rowHeight: this.#rowHeight }),
      rowHeightOverrides: rowHeightOverrideMap(state.projection),
      expandedIds: Object.freeze(targetIds),
      viewChildrenByParent: buildViewChildrenByParent(state.snapshot, state.indexes, this.#viewQuery),
    });
    if (!projection.ok) {
      this.#emitRuntimeError(editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'), 'view');
      return;
    }
    const previousSelection = this.#selection;
    this.#published = Object.freeze({
      ...state,
      projection: projection.value,
    });
    this.#pasteTargetEpoch += 1;
    this.#replaceSelection(
      sanitizeSelection(
        previousSelection,
        projection.value,
        state.indexes,
        this.#columns,
      ),
    );
    this.#refreshRenderer({ layoutChanged: true });
    if (!sameSelection(previousSelection, this.#selection)) {
      this.#events.dispatch('selectionChanged', {
        documentId: state.snapshot.documentId,
        documentGeneration: state.documentGeneration,
        previous: previousSelection,
        selection: this.#selection,
        reason: 'view-change',
      });
    }
    const previousView = this.#lastView;
    this.#lastView = Object.freeze({
      ...previousView,
      visibleRowCount: projection.value.visibleCount,
    });
    this.#events.dispatch('viewChanged', {
      documentId: state.snapshot.documentId,
      documentGeneration: state.documentGeneration,
      previous: previousView,
      view: this.#lastView,
      reason: 'projection',
    });
  }

  #replaceColumns(
    columns: readonly Readonly<BomColumnDefinition>[],
  ): BomResult<void> {
    if (sameColumnDefinitions(this.#columns, columns)) {
      return editorSuccess(undefined);
    }
    const previousColumns = this.#columns;
    const previousSelection = this.#selection;
    const nextVisibleColumns = visibleColumnDefinitions(columns);
    const fallback = fallbackAfterColumnVisibility(
      previousSelection.activeCell,
      previousColumns,
      nextVisibleColumns,
    );
    this.#endActiveEdit('cancelled');
    this.#columnResizeHistorySession = null;
    this.#columns = Object.freeze([...columns]);
    this.#clearDiffViewIfNotCurrent();
    this.#replaceSelection(
      sanitizeSelection(
        previousSelection,
        this.#published.projection,
        this.#published.indexes,
        nextVisibleColumns,
        fallback,
      ),
    );
    this.#historyUndo.splice(
      0,
      this.#historyUndo.length,
      ...this.#historyUndo.filter((entry) => entry.kind === 'document'),
    );
    this.#historyRedo.splice(
      0,
      this.#historyRedo.length,
      ...this.#historyRedo.filter((entry) => entry.kind === 'document'),
    );
    this.#columnHistoryInvalidatesDocumentRedo = false;
    this.#refreshRenderer({ layoutChanged: true });
    if (!sameSelection(previousSelection, this.#selection)) {
      this.#events.dispatch('selectionChanged', {
        documentId: this.#published.snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        previous: previousSelection,
        selection: this.#selection,
        reason: 'view-change',
      });
    }
    this.#publishColumnView();
    return editorSuccess(undefined);
  }

  #beginColumnResizeHistory(columnId: string, _width: number): void {
    if (this.#isDestroyedOrDestroying()) {
      return;
    }
    if (!this.#columns.some((column) => column.columnId === columnId)) {
      return;
    }
    this.#columnResizeHistorySession = Object.freeze({
      columnId,
      beforeColumns: this.#columns,
      beforeSelection: this.#selection,
    });
  }

  #endColumnResizeHistory(columnId: string, _width: number): void {
    const session = this.#columnResizeHistorySession;
    if (session === null || session.columnId !== columnId) {
      return;
    }
    this.#columnResizeHistorySession = null;
    this.#recordColumnHistory(session.beforeColumns, session.beforeSelection);
  }

  #resetColumnWidth(columnId: string): void {
    const index = this.#columns.findIndex((column) => column.columnId === columnId);
    if (index < 0) return;
    const current = this.#columns[index]!;
    const base = this.#initialColumnWidths.get(columnId);
    if (base === undefined || current.width === base) return;
    this.#resizeColumn(columnId, base, 'pointer');
  }

  #resizeColumn(
    columnId: string,
    width: number,
    _reason: 'pointer' | 'keyboard',
  ): void {
    if (this.#isDestroyedOrDestroying() || !Number.isFinite(width)) {
      return;
    }
    const index = this.#columns.findIndex(
      (column) => column.columnId === columnId,
    );
    if (index < 0) {
      return;
    }
    const column = this.#columns[index]!;
    const minimum = Math.max(1, column.minWidth ?? 1);
    const maximum = Math.max(
      minimum,
      column.maxWidth ?? Number.POSITIVE_INFINITY,
    );
    const nextWidth = Math.min(maximum, Math.max(minimum, width));
    if (nextWidth === column.width) {
      return;
    }
    const beforeColumns = this.#columns;
    const beforeSelection = this.#selection;
    this.#columns = Object.freeze(
      this.#columns.map((candidate, candidateIndex) =>
        candidateIndex === index
          ? Object.freeze({ ...candidate, width: nextWidth })
          : candidate,
      ),
    );
    this.#refreshRenderer({ layoutChanged: true });
    if (
      this.#columnResizeHistorySession === null ||
      this.#columnResizeHistorySession.columnId !== columnId
    ) {
      this.#recordColumnHistory(beforeColumns, beforeSelection);
    }
  }

  #reorderColumns(
    columnIds: readonly string[],
    _reason: 'pointer' | 'keyboard',
  ): void {
    if (
      this.#isDestroyedOrDestroying() ||
      !Array.isArray(columnIds) ||
      columnIds.length !== this.#columns.length ||
      this.#columns.length === 0
    ) {
      return;
    }
    const firstColumn = this.#columns[0];
    if (firstColumn === undefined || columnIds[0] !== firstColumn.columnId) {
      return;
    }
    const currentById = new Map(
      this.#columns.map((column) => [column.columnId, column]),
    );
    const seen = new Set<string>();
    const nextColumns: Readonly<BomColumnDefinition>[] = [];
    for (const columnId of columnIds) {
      if (typeof columnId !== 'string' || seen.has(columnId)) {
        return;
      }
      const column = currentById.get(columnId);
      if (column === undefined) {
        return;
      }
      seen.add(columnId);
      nextColumns.push(column);
    }
    if (seen.size !== currentById.size || nextColumns.every(
      (column, index) => column === this.#columns[index],
    )) {
      return;
    }
    const beforeColumns = this.#columns;
    const beforeSelection = this.#selection;
    this.#columns = Object.freeze(nextColumns);
    this.#refreshRenderer({ layoutChanged: true });
    this.#recordColumnHistory(beforeColumns, beforeSelection);
  }

  #setColumnFrozen(
    columnId: string,
    frozen: BomFrozenColumnPosition,
  ): BomResult<void> {
    const index = this.#columns.findIndex(
      (column) => column.columnId === columnId,
    );
    if (index < 0) {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    // The first visible column owns tree indentation and remains the stable
    // leading anchor for row navigation and accessibility.
    if (index === 0 && frozen !== 'start') {
      return editorFailure(editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG'));
    }
    const current = this.#columns[index]!;
    if (current.frozen === frozen) {
      return editorSuccess(undefined);
    }
    const beforeColumns = this.#columns;
    const beforeSelection = this.#selection;
    const changed = this.#columns.map((column, columnIndex) =>
      columnIndex === index ? Object.freeze({ ...column, frozen }) : column,
    );
    const ordered = [
      ...changed.filter((column) => column.frozen === 'start'),
      ...changed.filter((column) => column.frozen === false),
      ...changed.filter((column) => column.frozen === 'end'),
    ];
    this.#columns = Object.freeze(ordered);
    this.#refreshRenderer({ layoutChanged: true });
    this.#recordColumnHistory(beforeColumns, beforeSelection);
    return editorSuccess(undefined);
  }

  #insertColumn(
    referenceColumnId: string,
    position: BomColumnInsertPosition,
    count: number,
    _reason: BomCanvasColumnInsertReason,
  ): boolean {
    if (
      this.#isDestroyedOrDestroying() ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 256
    ) {
      return false;
    }
    const index = this.#columns.findIndex(
      (column) => column.columnId === referenceColumnId,
    );
    if (index < 0 || (index === 0 && position === 'before')) {
      return false;
    }
    const template = this.#columns[index]!;
    const beforeColumns = this.#columns;
    const beforeSelection = this.#selection;
    const existingIds = new Set(this.#columns.map((column) => column.columnId));
    const inserted: Readonly<BomColumnDefinition>[] = [];
    for (let offset = 0; offset < count; offset += 1) {
      let columnId = `${this.instanceId}:column:${++this.#columnSequence}`;
      while (existingIds.has(columnId)) {
        columnId = `${this.instanceId}:column:${++this.#columnSequence}`;
      }
      existingIds.add(columnId);
      const label = `${template.label} ${offset + 2}`;
      inserted.push(Object.freeze({
        ...template,
        columnId,
        label,
        visible: true,
        ...(template.a11y === undefined
          ? {}
          : { a11y: Object.freeze({ ...template.a11y, label }) }),
      }));
    }
    const nextColumns = [
      ...this.#columns.slice(0, position === 'before' ? index : index + 1),
      ...inserted,
      ...this.#columns.slice(position === 'before' ? index : index + 1),
    ];
    this.#columns = Object.freeze(nextColumns);
    this.#refreshRenderer({ layoutChanged: true });
    this.#recordColumnHistory(beforeColumns, beforeSelection);
    return true;
  }

  #deleteColumns(
    columnIds: readonly string[],
    _reason: BomCanvasColumnDeleteReason,
  ): boolean {
    if (
      this.#isDestroyedOrDestroying() ||
      !Array.isArray(columnIds) ||
      columnIds.length === 0
    ) {
      return false;
    }
    const requested = new Set<string>();
    for (const columnId of columnIds) {
      if (
        typeof columnId !== 'string' ||
        columnId.length === 0 ||
        requested.has(columnId) ||
        !this.#columns.some((column) => column.columnId === columnId)
      ) {
        return false;
      }
      requested.add(columnId);
    }
    const firstColumn = this.#columns[0];
    if (firstColumn === undefined || requested.has(firstColumn.columnId)) {
      return false;
    }
    const nextColumns = this.#columns.filter(
      (column) => !requested.has(column.columnId),
    );
    const nextVisibleColumns = visibleColumnDefinitions(nextColumns);
    if (nextVisibleColumns.length === 0) {
      return false;
    }
    const previousSelection = this.#selection;
    const beforeColumns = this.#columns;
    const fallback = fallbackAfterColumnVisibility(
      previousSelection.activeCell,
      this.#columns,
      nextVisibleColumns,
    );
    this.#columns = Object.freeze(nextColumns);
    this.#clearDiffViewIfNotCurrent();
    const nextSelection = sanitizeSelection(
      previousSelection,
      this.#published.projection,
      this.#published.indexes,
      nextVisibleColumns,
      fallback,
    );
    this.#replaceSelection(nextSelection);
    this.#refreshRenderer({ layoutChanged: true });
    this.#recordColumnHistory(beforeColumns, previousSelection);
    if (!sameSelection(previousSelection, nextSelection)) {
      this.#events.dispatch('selectionChanged', {
        documentId: this.#published.snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        previous: previousSelection,
        selection: nextSelection,
        reason: 'view-change',
      });
    }
    return true;
  }

  #setColumnVisibility(
    columnIds: readonly string[],
    visible: boolean,
    _reason: BomCanvasColumnVisibilityReason,
  ): void {
    if (
      this.#isDestroyedOrDestroying() ||
      !Array.isArray(columnIds) ||
      columnIds.length === 0 ||
      typeof visible !== 'boolean'
    ) {
      return;
    }
    const requested = new Set<string>();
    for (const columnId of columnIds) {
      if (
        typeof columnId !== 'string' ||
        columnId.length === 0 ||
        requested.has(columnId) ||
        !this.#columns.some((column) => column.columnId === columnId)
      ) {
        return;
      }
      requested.add(columnId);
    }
    const firstColumn = this.#columns[0];
    if (
      firstColumn === undefined ||
      (!visible && requested.has(firstColumn.columnId))
    ) {
      return;
    }
    const previousColumns = this.#columns;
    const nextColumns = previousColumns.map((column) =>
      requested.has(column.columnId)
        ? Object.freeze({ ...column, visible })
        : column,
    );
    const nextVisibleColumns = visibleColumnDefinitions(nextColumns);
    if (
      nextVisibleColumns.length === 0 ||
      nextColumns.every((column, index) => column === previousColumns[index])
    ) {
      return;
    }
    const previousSelection = this.#selection;
    const fallback = fallbackAfterColumnVisibility(
      previousSelection.activeCell,
      previousColumns,
      nextVisibleColumns,
    );
    this.#columns = Object.freeze(nextColumns);
    const nextSelection = sanitizeSelection(
      previousSelection,
      this.#published.projection,
      this.#published.indexes,
      nextVisibleColumns,
      fallback,
    );
    this.#replaceSelection(nextSelection);
    this.#refreshRenderer({ layoutChanged: true });
    this.#recordColumnHistory(previousColumns, previousSelection);
    if (!sameSelection(previousSelection, nextSelection)) {
      this.#events.dispatch('selectionChanged', {
        documentId: this.#published.snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        previous: previousSelection,
        selection: nextSelection,
        reason: 'view-change',
      });
    }
  }

  #requestEdit(
    address: Readonly<BomCellAddress>,
    trigger: BomEditTrigger,
  ): void {
    const column = this.#columns.find(
      (candidate) => candidate.columnId === address.columnId,
    );
    const node = this.#published.indexes.rowById.get(address.occurrenceId);
    if (
      column === undefined ||
      node === undefined ||
      !column.editable ||
      !this.#isValidAddress(address, true)
    ) {
      return;
    }
    this.#ensureEditFocused();
    if (this.#editMachine.state.status === 'rejected') {
      this.#editMachine.transition({ type: 'cancel' });
    }
    if (this.#editMachine.state.status !== 'focused') {
      return;
    }
    const initialValue = fieldValue(node.fields, column.fieldPath);
    const before = this.#events.dispatch('beforeEdit', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      address,
      initialValue,
      trigger,
    });
    if (!before.ok || before.event.defaultPrevented) {
      return;
    }
    const draft: Readonly<BomEditDraft> = Object.freeze({
      address: Object.freeze({ ...address }),
      originalValue: initialValue,
      value: initialValue ?? '',
      dirty: false,
    });
    const transition = this.#editMachine.transition({
      type: 'beginEdit',
      draft,
    });
    if (!transition.ok) {
      return;
    }
    this.#pasteTargetEpoch += 1;
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#events.dispatch('editStart', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      draft: transition.state.draft!,
      trigger,
    });
    this.#emitEditStateChanged(transition.previous, transition.state);
  }

  #draftInput(
    address: Readonly<BomCellAddress>,
    value: string,
    inputType: 'insert' | 'delete' | 'replace' | 'composition',
  ): void {
    const state = this.#editMachine.state;
    if (state.draft === null || !sameAddress(state.draft.address, address)) {
      return;
    }
    const previousValue = state.draft.value;
    const transition = this.#editMachine.transition({
      type: 'updateDraft',
      value,
    });
    if (!transition.ok || transition.state.draft === null) {
      return;
    }
    this.#refreshRenderer({});
    this.#events.dispatch('valueChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      address,
      previousValue,
      value,
      draft: transition.state.draft,
      inputType,
    });
    this.#emitEditStateChanged(transition.previous, transition.state);
  }

  async #commitEdit(
    address: Readonly<BomCellAddress>,
    reason: BomEditCommitReason,
  ): Promise<void> {
    const state = this.#editMachine.state;
    if (
      state.status === 'composing' ||
      state.draft === null ||
      !sameAddress(state.draft.address, address)
    ) {
      return;
    }
    const selectionCommitState = this.#published;
    const selectionCommitEpoch = this.#pasteTargetEpoch;
    const navigationGeneration = selectionCommitState.documentGeneration;
    const navigationEpoch = selectionCommitEpoch;
    const before = this.#events.dispatch('beforeCommit', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      draft: state.draft,
      reason,
    });
    if (!before.ok || before.event.defaultPrevented) {
      this.#refreshRenderer({ layers: ['interaction'] });
      return;
    }
    const validating = this.#editMachine.transition({
      type: 'beginValidation',
    });
    if (!validating.ok || validating.state.draft === null) {
      return;
    }
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#emitEditStateChanged(validating.previous, validating.state);
    const column = this.#columns.find(
      (candidate) => candidate.columnId === address.columnId,
    );
    const field =
      column === undefined
        ? undefined
        : findSchemaField(this.#schema, column.fieldPath);
    const text =
      typeof validating.state.draft.value === 'string'
        ? validating.state.draft.value
        : formatEditorValue(validating.state.draft.value);
    if (field === undefined) {
      this.#rejectEdit(
        editorError(BOM_EDITOR_ERROR_CODES.editInvalid, 'VALIDATION'),
        'validation',
      );
      return;
    }
    const parsed = parseEditorValue(
      text,
      validating.state.draft.originalValue,
      field,
    );
    if (!parsed.ok) {
      const error =
        parsed.errors[0] ??
        editorError(BOM_EDITOR_ERROR_CODES.editInvalid, 'VALIDATION');
      this.#rejectEdit(error, 'validation');
      return;
    }
    let fillSelectionCommands: readonly BomCommand<TFields>[] | undefined;
    if (reason === 'fill-selection') {
      const staleness = this.#pasteStaleness(
        selectionCommitState,
        selectionCommitEpoch,
      );
      if (staleness !== undefined) {
        this.#rejectEdit(
          this.#fillSelectionError(staleness, 'CONFLICT'),
          'validation',
        );
        return;
      }
      const prepared = this.#prepareFillSelectionCommands(
        address,
        field,
        parsed.value,
        selectionCommitState,
      );
      if (!prepared.ok) {
        this.#rejectEdit(
          this.#fillSelectionError(
            prepared.reason,
            prepared.reason === 'selection-limit'
              ? 'SECURITY_LIMIT'
              : 'VALIDATION',
          ),
          'validation',
        );
        return;
      }
      fillSelectionCommands = prepared.commands;
    }
    const committing = this.#editMachine.transition({
      type: 'beginCommit',
    });
    if (!committing.ok) {
      return;
    }
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#emitEditStateChanged(committing.previous, committing.state);
    if (fillSelectionCommands !== undefined) {
      const filled = await this.#enqueue(() =>
        this.#commitFillSelection(
          selectionCommitState,
          selectionCommitEpoch,
          fillSelectionCommands,
        ),
      );
      if (!filled.ok) {
        this.#rejectEdit(filled.error, 'commit');
        return;
      }
    } else {
      const committed = await this.execute(
        {
          type: 'setField',
          occurrenceId: address.occurrenceId,
          fieldPath: field.path,
          value: parsed.value,
        },
        { origin: 'editor:cell' },
      );
      if (!committed.ok) {
        this.#rejectEdit(committed.error, 'commit');
        return;
      }
    }
    const succeeded = this.#editMachine.transition({
      type: 'commitSucceeded',
    });
    if (!succeeded.ok) {
      return;
    }
    const navigationTarget = this.#editNavigationTarget(
      address,
      reason,
      navigationGeneration,
      navigationEpoch,
    );
    if (navigationTarget === null) {
      this.#refreshRenderer({});
    } else {
      this.#select(navigationTarget, 'keyboard');
      this.#renderer?.scrollToCell(navigationTarget);
    }
    this.#updateLatestHistoryInteraction();
    this.#emitEditStateChanged(succeeded.previous, succeeded.state);
    this.#events.dispatch('editEnd', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      address,
      outcome: 'committed',
      value: parsed.value,
    });
  }

  #editNavigationTarget(
    address: Readonly<BomCellAddress>,
    reason: BomEditCommitReason,
    documentGeneration: number,
    selectionEpoch: number,
  ): Readonly<BomCellAddress> | null {
    if (
      documentGeneration !== this.#published.documentGeneration ||
      selectionEpoch !== this.#pasteTargetEpoch ||
      !sameNullableAddress(this.#selection.activeCell, address)
    ) {
      return null;
    }
    const rowResult = this.#published.projection.indexOf(address.occurrenceId);
    const visibleColumns = visibleColumnDefinitions(this.#columns);
    const columnIndex = visibleColumns.findIndex(
      (column) => column.columnId === address.columnId,
    );
    if (!rowResult.ok || rowResult.value === undefined || columnIndex < 0) {
      return null;
    }
    if (reason === 'enter') {
      return this.#editNavigation.enter === 'down'
        ? this.#nextEditableCellInColumn(rowResult.value, columnIndex)
        : null;
    }
    if (reason === 'tab') {
      return this.#editNavigation.tab === 'next-editable'
        ? this.#nextEditableCellInRowOrder(rowResult.value, columnIndex, 1)
        : null;
    }
    if (reason === 'shift-tab') {
      return this.#editNavigation.tab === 'next-editable'
        ? this.#nextEditableCellInRowOrder(rowResult.value, columnIndex, -1)
        : null;
    }
    return null;
  }

  #nextEditableCellInColumn(
    rowIndex: number,
    columnIndex: number,
  ): Readonly<BomCellAddress> | null {
    const column = visibleColumnDefinitions(this.#columns)[columnIndex];
    if (column === undefined || !column.editable) {
      return null;
    }
    for (
      let candidateRow = rowIndex + 1;
      candidateRow < this.#published.projection.visibleCount;
      candidateRow += 1
    ) {
      const occurrence = this.#published.projection.occurrenceAt(candidateRow);
      if (!occurrence.ok || occurrence.value === undefined) {
        continue;
      }
      return Object.freeze({
        occurrenceId: occurrence.value,
        columnId: column.columnId,
      });
    }
    return null;
  }

  #nextEditableCellInRowOrder(
    rowIndex: number,
    columnIndex: number,
    direction: 1 | -1,
  ): Readonly<BomCellAddress> | null {
    const lastRow = this.#published.projection.visibleCount - 1;
    const visibleColumns = visibleColumnDefinitions(this.#columns);
    for (
      let candidateRow = rowIndex;
      candidateRow >= 0 && candidateRow <= lastRow;
      candidateRow += direction
    ) {
      const occurrence = this.#published.projection.occurrenceAt(candidateRow);
      if (!occurrence.ok || occurrence.value === undefined) {
        continue;
      }
      const startColumn = candidateRow === rowIndex
        ? columnIndex + direction
        : direction > 0
        ? 0
        : visibleColumns.length - 1;
      for (
        let candidateColumn = startColumn;
        candidateColumn >= 0 && candidateColumn < visibleColumns.length;
        candidateColumn += direction
      ) {
        const column = visibleColumns[candidateColumn];
        if (column === undefined || !column.editable) {
          continue;
        }
        return Object.freeze({
          occurrenceId: occurrence.value,
          columnId: column.columnId,
        });
      }
    }
    return null;
  }

  #rejectEdit(
    error: BomError,
    phase: 'validation' | 'commit',
  ): void {
    const transition = this.#editMachine.transition({ type: 'reject', error });
    if (!transition.ok || transition.state.status !== 'rejected') {
      return;
    }
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#events.dispatch('commitRejected', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      draft: transition.state.draft,
      phase,
      error,
    });
    this.#emitEditStateChanged(transition.previous, transition.state);
  }

  #cancelEdit(address: Readonly<BomCellAddress>): void {
    const state = this.#editMachine.state;
    if (state.draft === null || !sameAddress(state.draft.address, address)) {
      return;
    }
    const transition = this.#editMachine.transition({ type: 'cancel' });
    if (!transition.ok) {
      return;
    }
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#emitEditStateChanged(transition.previous, transition.state);
    this.#events.dispatch('editEnd', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      address,
      outcome: 'cancelled',
    });
  }

  #composition(
    address: Readonly<BomCellAddress>,
    phase: 'start' | 'end',
  ): void {
    const state = this.#editMachine.state;
    if (state.draft === null || !sameAddress(state.draft.address, address)) {
      return;
    }
    const action: BomEditAction =
      phase === 'start'
        ? { type: 'compositionStart' }
        : { type: 'compositionEnd' };
    const transition = this.#editMachine.transition(action);
    if (!transition.ok) {
      return;
    }
    this.#refreshRenderer({ layers: ['interaction'] });
    this.#emitEditStateChanged(transition.previous, transition.state);
  }

  #ensureEditFocused(): void {
    if (this.#editMachine.state.status !== 'idle') {
      return;
    }
    const transition = this.#editMachine.transition({ type: 'focus' });
    if (transition.ok) {
      this.#refreshRenderer({ layers: ['interaction'] });
      this.#emitEditStateChanged(transition.previous, transition.state);
    }
  }

  #endActiveEdit(
    outcome: 'cancelled' | 'document-replaced' | 'destroyed',
  ): void {
    const draft = this.#editMachine.state.draft;
    if (draft !== null) {
      this.#events.dispatch('editEnd', {
        documentId: this.#published.snapshot.documentId,
        documentGeneration: this.#published.documentGeneration,
        address: draft.address,
        outcome,
      });
    }
    this.#editMachine = createBomEditStateMachine();
  }

  #emitEditStateChanged(
    previous: Readonly<BomEditState>,
    state: Readonly<BomEditState>,
  ): void {
    this.#events.dispatch('editStateChanged', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      previous,
      state,
    });
  }

  #emitRuntimeError(
    error: BomError,
    source: 'lifecycle' | 'transaction' | 'document' | 'edit' | 'view',
  ): void {
    this.#events.dispatch('error', {
      error,
      source,
      fatal: false,
    });
  }

  #refreshRenderer(invalidation: Readonly<BomCanvasInvalidation>): void {
    const renderer = this.#renderer;
    if (renderer === null) {
      return;
    }
    try {
      renderer.update(this.#viewModel(), invalidation);
    } catch {
      this.#emitRuntimeError(
        editorError(BOM_EDITOR_ERROR_CODES.rendererFailed, 'RENDER'),
        'view',
      );
    }
  }

  #viewModel(): Readonly<BomCanvasViewModel<TFields>> {
    return Object.freeze({
      revision: this.#published.snapshot.revision,
      documentGeneration: this.#published.documentGeneration,
      snapshot: this.#published.snapshot,
      indexes: this.#published.indexes,
      projection: this.#published.projection,
      columns: this.#columns,
      selection: this.#selection,
      editState: this.#editMachine.state,
      diffView: this.#diffView,
    });
  }

  #clearDiffViewIfNotCurrent(): void {
    const diffView = this.#diffView;
    if (
      diffView !== null &&
      diffViewPublishedStateMismatch(
        diffView,
        this.#published,
        this.#columns,
      ) !== null
    ) {
      this.#diffView = null;
    }
  }

  #isValidAddress(
    address: Readonly<BomCellAddress>,
    requireVisible: boolean,
  ): boolean {
    if (
      !this.#published.indexes.rowById.has(address.occurrenceId) ||
      !this.#columns.some((column) =>
        column.columnId === address.columnId &&
        (!requireVisible || column.visible !== false))
    ) {
      return false;
    }
    if (!requireVisible) {
      return true;
    }
    const index = this.#published.projection.indexOf(address.occurrenceId);
    return index.ok && index.value !== undefined;
  }

  #attempt(transactionId: string, origin: string): TransactionAttempt {
    return Object.freeze({
      transactionId,
      origin,
      baseRevision: this.#published.snapshot.revision,
    });
  }

  #appendNestedTransaction(
    context: TransactionBuildContext<TFields>,
    build: (transaction: BomTransactionBuilder<TFields>) => void,
    options: {
      readonly label?: string;
      readonly origin?: string;
      readonly signal?: AbortSignal;
    },
  ): Promise<BomResult<BomCommit<TFields>>> {
    if (!context.active) {
      throw new Error('BOM_EDITOR_TRANSACTION_BUILDER_CLOSED');
    }
    if (
      options.label !== undefined ||
      options.origin !== undefined ||
      (options.signal !== undefined && options.signal !== context.signal)
    ) {
      context.buildError ??= editorError(
        BOM_EDITOR_ERROR_CODES.transactionNestedOptions,
        'CONFIG',
      );
      return context.result;
    }
    this.#runTransactionBuilder(context, build);
    return context.result;
  }

  #appendTransactionCommand(
    context: TransactionBuildContext<TFields>,
    command: BomCommand<TFields>,
  ): void {
    if (!context.active) {
      throw new Error('BOM_EDITOR_TRANSACTION_BUILDER_CLOSED');
    }
    const captured = normalizeBomValue(command, {
      path: ['editor', 'transaction', 'command'],
    });
    if (!captured.ok) {
      context.buildError ??= captured.errors[0]!;
      return;
    }
    context.commands.push(captured.value as unknown as BomCommand<TFields>);
  }

  #runTransactionBuilder(
    context: TransactionBuildContext<TFields>,
    build: (transaction: BomTransactionBuilder<TFields>) => void,
  ): void {
    if (typeof build !== 'function') {
      context.buildError ??= editorError(
        BOM_EDITOR_ERROR_CODES.configInvalid,
        'CONFIG',
        { option: 'transactionBuilder' },
      );
      return;
    }
    try {
      const returned = build(context.builder);
      if (isPromiseLike(returned)) {
        // A builder is intentionally synchronous; consume a late rejection so
        // malformed async callbacks cannot create an unhandled rejection.
        void Promise.resolve(returned).catch(() => undefined);
        context.buildError ??= editorError(
          BOM_EDITOR_ERROR_CODES.transactionBuilderAsync,
          'CONFIG',
        );
      }
    } catch {
      context.buildError ??= editorError(
        BOM_EDITOR_ERROR_CODES.configInvalid,
        'CONFIG',
        { option: 'transactionBuilder' },
      );
    }
  }

  #rejectUnbuiltTransaction(
    attempt: TransactionAttempt,
    error: BomError,
  ): BomResult<BomCommit<TFields>> {
    if (this.#isDestroyedOrDestroying()) return this.#destroyedFailure();
    const dispatched = this.#events.dispatch('transactionRejected', {
      documentId: this.#published.snapshot.documentId,
      documentGeneration: this.#published.documentGeneration,
      transactionId: attempt.transactionId,
      origin: attempt.origin,
      baseRevision: attempt.baseRevision,
      error,
    });
    if (!dispatched.ok) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.eventDispatchFailed, 'INTERNAL'),
      );
    }
    return editorFailure(error);
  }

  #isPrecommitAbortRequested(transactionId: string): boolean {
    if (this.#isDestroyedOrDestroying()) {
      this.#preparedError = editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG');
      return true;
    }
    if (this.#precommitAbortSignals.get(transactionId)?.aborted === true) {
      this.#preparedError = editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED', {
        reason: 'aborted',
      });
      return true;
    }
    return false;
  }

  #isPrecommitPasteStalenessRequested(transactionId: string): boolean {
    const guard = this.#precommitPasteStalenessGuards.get(transactionId);
    if (guard === undefined) {
      return false;
    }
    const staleness = this.#pasteStaleness(
      guard.state,
      guard.pasteTargetEpoch,
    );
    if (staleness === undefined) {
      return false;
    }
    this.#preparedError = editorError(
      BOM_EDITOR_ERROR_CODES.pasteConflict,
      'CONFLICT',
      { reason: staleness },
    );
    return true;
  }

  #isPrecommitClearStalenessRequested(transactionId: string): boolean {
    const guard = this.#precommitClearStalenessGuards.get(transactionId);
    if (guard === undefined) {
      return false;
    }
    const staleness = this.#pasteStaleness(
      guard.state,
      guard.pasteTargetEpoch,
    );
    if (staleness === undefined) {
      return false;
    }
    this.#preparedError = editorError(
      BOM_EDITOR_ERROR_CODES.deleteConflict,
      'CONFLICT',
      { reason: staleness },
    );
    return true;
  }

  #isPrecommitFillDownStalenessRequested(transactionId: string): boolean {
    const guard = this.#precommitFillDownStalenessGuards.get(transactionId);
    if (guard === undefined) {
      return false;
    }
    const staleness = this.#pasteStaleness(
      guard.state,
      guard.pasteTargetEpoch,
    );
    if (staleness === undefined) {
      return false;
    }
    this.#preparedError = editorError(
      BOM_EDITOR_ERROR_CODES.fillDownConflict,
      'CONFLICT',
      { reason: staleness },
    );
    return true;
  }

  #isPrecommitFillSelectionStalenessRequested(transactionId: string): boolean {
    const guard = this.#precommitFillSelectionStalenessGuards.get(transactionId);
    if (guard === undefined) {
      return false;
    }
    const staleness = this.#pasteStaleness(
      guard.state,
      guard.pasteTargetEpoch,
    );
    if (staleness === undefined) {
      return false;
    }
    this.#preparedError = this.#fillSelectionError(staleness, 'CONFLICT');
    return true;
  }

  #nextTransactionId(purpose: string): string {
    this.#transactionSequence += 1;
    return (
      this.instanceId +
      ':' +
      purpose +
      ':' +
      String(this.#transactionSequence)
    );
  }

  #resetPreparation(): void {
    this.#prepared = undefined;
    this.#preparedError = undefined;
  }

  #requireEngine(
    snapshot: BomDocumentSnapshot<TFields>,
    documentGeneration: number,
  ): BomTransactionEngineApi<TFields> {
    const result = this.#buildEngine(snapshot, documentGeneration);
    if (!result.ok) {
      throw new BomEditorConfigurationError(result.error);
    }
    return result.value;
  }

  #buildEngine(
    snapshot: BomDocumentSnapshot<TFields>,
    documentGeneration: number,
  ): BomResult<BomTransactionEngineApi<TFields>> {
    const created = createBomTransactionEngine<TFields>({
      snapshot,
      schema: this.#schema,
      protocolVersion: this.#protocolVersion,
      documentGeneration,
      ...(this.#history === undefined ? {} : { history: this.#history }),
      beforeApply: (prepared): boolean => this.#beforeApply(prepared),
    });
    return created.ok
      ? editorSuccess(created.value)
      : editorFailure(created.errors[0]!);
  }

  #documentReference(
    state: Readonly<PublishedState<TFields>>,
  ): BomDocumentReference {
    return documentReference(
      state.snapshot,
      state.documentGeneration,
      state.sourceType,
    );
  }

  #sourceBoundMutationFailure<T>(): BomResult<T> {
    return editorFailure(
      editorError(BOM_EDITOR_ERROR_CODES.sourceBound, 'CONFIG'),
    );
  }

  #destroyedFailure<T>(): BomResult<T> {
    return editorFailure(
      editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'),
    );
  }

  #isDestroyedOrDestroying(): boolean {
    return this.#lifecycle === 'destroyed' || this.#lifecycle === 'destroying';
  }

  #abortedFailure<T>(): BomResult<T> {
    return editorFailure(
      editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
    );
  }

  #validationStaleFailure<T>(): BomResult<T> {
    return editorFailure(
      editorError(BOM_EDITOR_ERROR_CODES.validationStale, 'CONFLICT'),
    );
  }

  #enqueue<T>(
    work: () => Promise<BomResult<T>> | BomResult<T>,
    signal?: AbortSignal,
  ): Promise<BomResult<T>> {
    this.#queuedTasks += 1;
    const result = this.#tail.then(async (): Promise<BomResult<T>> => {
      this.#queuedTasks -= 1;
      if (this.#lifecycle === 'destroyed' || this.#lifecycle === 'destroying') {
        return this.#destroyedFailure();
      }
      if (signal?.aborted) {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        );
      }
      this.#activeTasks += 1;
      try {
        return await work();
      } catch {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.internal, 'INTERNAL'),
        );
      } finally {
        this.#activeTasks -= 1;
      }
    });
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #settleReady(result: BomResult<void>): void {
    if (this.#readySettled) {
      return;
    }
    this.#readySettled = true;
    this.#resolveReady?.(result);
    this.#resolveReady = undefined;
  }

}

const INVALID_QUERY_EXPRESSION = Symbol('invalid-query-expression');

function normalizeDataSourceQueryExpression(
  input: unknown,
  fieldIds: ReadonlySet<string>,
): BomQueryExpression | undefined | typeof INVALID_QUERY_EXPRESSION {
  if (input === undefined) return undefined;
  const normalized = normalizeBomValue(input as BomValue, {
    path: ['editor', 'dataSourceQuery', 'expression'],
  });
  if (!normalized.ok) return INVALID_QUERY_EXPRESSION;
  return parseDataSourceQueryExpression(normalized.value, fieldIds, 0);
}

function parseDataSourceQueryExpression(
  input: BomValue,
  fieldIds: ReadonlySet<string>,
  depth: number,
): BomQueryExpression | typeof INVALID_QUERY_EXPRESSION {
  if (depth > 32 || !isDataSourceRecord(input)) return INVALID_QUERY_EXPRESSION;
  const value = input as Readonly<Record<string, BomValue>>;
  const op = value['op'];
  if (op === 'and' || op === 'or') {
    if (!isKnownRecordKeys(value, new Set(['op', 'items']))) {
      return INVALID_QUERY_EXPRESSION;
    }
    const items = value['items'];
    if (!Array.isArray(items) || items.length === 0 || items.length > 64) {
      return INVALID_QUERY_EXPRESSION;
    }
    const parsed: BomQueryExpression[] = [];
    for (const item of items) {
      const candidate = parseDataSourceQueryExpression(item, fieldIds, depth + 1);
      if (candidate === INVALID_QUERY_EXPRESSION) {
        return INVALID_QUERY_EXPRESSION;
      }
      parsed.push(candidate);
    }
    return Object.freeze({ op, items: Object.freeze(parsed) });
  }
  if (op === 'not') {
    if (!isKnownRecordKeys(value, new Set(['op', 'item']))) {
      return INVALID_QUERY_EXPRESSION;
    }
    const item = parseDataSourceQueryExpression(
      value['item']!,
      fieldIds,
      depth + 1,
    );
    return item === INVALID_QUERY_EXPRESSION
      ? INVALID_QUERY_EXPRESSION
      : Object.freeze({ op, item });
  }
  if (
    op !== 'eq' && op !== 'contains' && op !== 'startsWith' &&
    op !== 'gt' && op !== 'gte' && op !== 'lt' && op !== 'lte'
  ) return INVALID_QUERY_EXPRESSION;
  if (!isKnownRecordKeys(value, new Set(['op', 'fieldId', 'value']))) {
    return INVALID_QUERY_EXPRESSION;
  }
  const fieldId = value['fieldId'];
  if (typeof fieldId !== 'string' || !fieldIds.has(fieldId)) {
    return INVALID_QUERY_EXPRESSION;
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'value')) {
    return INVALID_QUERY_EXPRESSION;
  }
  return Object.freeze({ op, fieldId, value: value['value']! });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null
  ) {
    return false;
  }
  try {
    return typeof (value as { readonly then?: unknown }).then === 'function';
  } catch {
    return true;
  }
}

function normalizeDataSourceQuerySort(
  input: unknown,
  fieldIds: ReadonlySet<string>,
): readonly { readonly fieldId: string; readonly direction: 'asc' | 'desc' }[] | undefined | null {
  if (input === undefined) return undefined;
  const normalized = normalizeBomValue(input as BomValue, {
    path: ['editor', 'dataSourceQuery', 'sort'],
  });
  if (!normalized.ok || !Array.isArray(normalized.value)) return null;
  if (normalized.value.length === 0) return undefined;
  if (normalized.value.length > 32) return null;
  const seen = new Set<string>();
  const sort: { readonly fieldId: string; readonly direction: 'asc' | 'desc' }[] = [];
  for (const entry of normalized.value) {
    if (!isDataSourceRecord(entry) || !isKnownRecordKeys(entry, new Set(['fieldId', 'direction']))) {
      return null;
    }
    const fieldId = entry['fieldId'];
    const direction = entry['direction'];
    if (
      typeof fieldId !== 'string' || !fieldIds.has(fieldId) ||
      seen.has(fieldId) || (direction !== 'asc' && direction !== 'desc')
    ) return null;
    seen.add(fieldId);
    sort.push(Object.freeze({ fieldId, direction }));
  }
  return Object.freeze(sort);
}

function normalizeDataSourceQueryResult(
  input: unknown,
): BomQueryResult | null {
  const normalized = normalizeBomValue(input as BomValue, {
    path: ['editor', 'dataSourceQuery', 'result'],
  });
  if (!normalized.ok || !isDataSourceRecord(normalized.value)) return null;
  const value = normalized.value as Readonly<Record<string, BomValue>>;
  if (!isKnownRecordKeys(
    value,
    new Set(['occurrenceIds', 'nextCursor', 'sourceRevision']),
  )) return null;
  const sourceRevision = value['sourceRevision'];
  const cursor = value['nextCursor'];
  const occurrenceIds = value['occurrenceIds'];
  if (
    typeof sourceRevision !== 'string' || sourceRevision.length === 0 ||
    !isOptionalDataSourceCursor(cursor) || !Array.isArray(occurrenceIds) ||
    occurrenceIds.length > 10_000
  ) return null;
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const occurrenceId of occurrenceIds) {
    if (
      typeof occurrenceId !== 'string' || occurrenceId.length === 0 ||
      occurrenceId.length > 1_024 || seen.has(occurrenceId)
    ) return null;
    seen.add(occurrenceId);
    ids.push(occurrenceId);
  }
  return Object.freeze({
    occurrenceIds: Object.freeze(ids),
    ...(cursor === undefined ? {} : { nextCursor: cursor }),
    sourceRevision,
  });
}

function normalizeDataSourcePage<TFields extends BomFields>(
  input: unknown,
): BomPage<TFields> | null {
  const normalized = normalizeBomValue(input as BomValue, {
    path: ['editor', 'dataSourceChildren', 'page'],
  });
  if (!normalized.ok || !isDataSourceRecord(normalized.value)) return null;
  const value = normalized.value as Readonly<Record<string, BomValue>>;
  if (!isKnownRecordKeys(
    value,
    new Set(['items', 'nextCursor', 'sourceRevision', 'complete']),
  )) return null;
  const items = value['items'];
  const sourceRevision = value['sourceRevision'];
  const complete = value['complete'];
  const cursor = value['nextCursor'];
  if (
    !Array.isArray(items) || items.length > 10_000 ||
    typeof sourceRevision !== 'string' || sourceRevision.length === 0 ||
    typeof complete !== 'boolean' || !isOptionalDataSourceCursor(cursor) ||
    (complete && cursor !== undefined) || (!complete && cursor === undefined)
  ) return null;
  return Object.freeze({
    items: Object.freeze([...items]) as readonly BomNode<TFields>[],
    ...(cursor === undefined ? {} : { nextCursor: cursor }),
    sourceRevision,
    complete,
  });
}

function mergeDataSourceChildrenPage<TFields extends BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
  indexes: BomBaseIndexes<TFields>,
  parentId: OccurrenceId,
  page: BomPage<TFields>,
): BomDocumentSnapshot<TFields> | null {
  try {
    const parent = indexes.rowById.get(parentId);
    if (parent === undefined || parent.childrenState === 'complete') return null;
    const existingById = new Map(
      snapshot.nodes.map((node) => [node.occurrenceId, node] as const),
    );
    const additions: BomNode<TFields>[] = [];
    const pageIds = new Set<string>();
    for (const item of page.items) {
      if (
        !isDataSourceRecord(item) || typeof item.occurrenceId !== 'string' ||
        item.occurrenceId.length === 0 || item.parentId !== parentId ||
        pageIds.has(item.occurrenceId)
      ) return null;
      pageIds.add(item.occurrenceId);
      const existing = existingById.get(item.occurrenceId);
      if (existing !== undefined) {
        if (encodeCanonicalValue(existing as unknown as BomValue) !==
          encodeCanonicalValue(item as unknown as BomValue)) return null;
      } else {
        additions.push(item);
      }
    }
    const loadedChildCount = (indexes.childrenByParent.get(parentId)?.length ?? 0) +
      additions.length;
    const knownChildCount = page.complete
      ? loadedChildCount
      : Math.max(parent.knownChildCount ?? 0, loadedChildCount);
    const replacement: BomNode<TFields> = Object.freeze({
      ...parent,
      childrenState: page.complete ? 'complete' : 'partial',
      knownChildCount,
    });
    const nodes = snapshot.nodes.map((node) =>
      node.occurrenceId === parentId ? replacement : node,
    );
    nodes.push(...additions);
    return Object.freeze({ ...snapshot, nodes: Object.freeze(nodes) });
  } catch {
    return null;
  }
}

function isOptionalDataSourceCursor(value: unknown): value is string | undefined {
  return value === undefined || (
    typeof value === 'string' && value.length > 0 && value.length <= 4_096
  );
}

function isKnownRecordKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isDataSourceRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createEmptySnapshot<TFields extends BomFields>(
  schema: BomSchema,
  instanceId: string,
): BomDocumentSnapshot<TFields> {
  return Object.freeze({
    schemaVersion: schema.schemaVersion,
    documentId: instanceId + ':document',
    revision: '0',
    positionKeyCodecVersion: LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
    completeness: 'complete',
    knownRootCount: 0,
    roots: Object.freeze([]),
    nodes: Object.freeze([]),
  });
}

const SUPPORTED_PLUGIN_CAPABILITIES = new Set<BomPluginCapability>(
  DEFAULT_PLUGIN_HOST_CONFIGURATION.supportedCapabilities,
);

function nowMs(): number {
  try {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  } catch {
    return Date.now();
  }
}

function normalizePlugins<TFields extends BomFields>(
  input: readonly BomPlugin<TFields>[] | undefined,
): readonly BomPlugin<TFields>[] | null | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return null;
  const ids = new Set<string>();
  for (const plugin of input) {
    const manifest = normalizePluginManifest(plugin?.manifest);
    if (manifest === null || typeof plugin?.setup !== 'function' || ids.has(manifest.id)) {
      return null;
    }
    ids.add(manifest.id);
  }
  return Object.freeze([...input]);
}

function normalizePluginHostConfiguration(
  input: BomPluginHostConfiguration | undefined,
): Readonly<NormalizedPluginHostConfiguration> | null {
  if (
    input !== undefined &&
    (typeof input !== 'object' || input === null || Array.isArray(input))
  ) {
    return null;
  }
  const value = (input ?? {}) as Readonly<Record<string, unknown>>;
  const engineVersion = value['engineVersion'] === undefined
    ? DEFAULT_PLUGIN_HOST_CONFIGURATION.engineVersion
    : value['engineVersion'];
  if (
    typeof engineVersion !== 'string' ||
    engineVersion.length === 0 ||
    engineVersion.length > 64
  ) {
    return null;
  }
  const parsedEngineVersion = parseSemanticVersion(engineVersion);
  if (parsedEngineVersion === null) return null;

  const abiInput = value['supportedAbiVersions'] === undefined
    ? DEFAULT_PLUGIN_HOST_CONFIGURATION.supportedAbiVersions
    : value['supportedAbiVersions'];
  if (!Array.isArray(abiInput) || abiInput.length === 0) return null;
  const seenAbiVersions = new Set<string>();
  const supportedAbiVersions: Array<Readonly<{
    readonly raw: string;
    readonly version: Readonly<SemanticVersion>;
  }>> = [];
  for (const abiVersion of abiInput) {
    if (
      typeof abiVersion !== 'string' ||
      abiVersion.length === 0 ||
      abiVersion.length > 64 ||
      seenAbiVersions.has(abiVersion)
    ) {
      return null;
    }
    const parsed = parseSemanticVersion(abiVersion);
    if (parsed === null) return null;
    seenAbiVersions.add(abiVersion);
    supportedAbiVersions.push(Object.freeze({ raw: abiVersion, version: parsed }));
  }

  const capabilityInput = value['supportedCapabilities'] === undefined
    ? DEFAULT_PLUGIN_HOST_CONFIGURATION.supportedCapabilities
    : value['supportedCapabilities'];
  if (!Array.isArray(capabilityInput)) return null;
  const seenCapabilities = new Set<string>();
  const supportedCapabilities: BomPluginCapability[] = [];
  for (const capability of capabilityInput) {
    if (
      typeof capability !== 'string' ||
      !isContributionId(capability) ||
      !SUPPORTED_PLUGIN_CAPABILITIES.has(capability as BomPluginCapability) ||
      seenCapabilities.has(capability)
    ) {
      return null;
    }
    seenCapabilities.add(capability);
    supportedCapabilities.push(capability as BomPluginCapability);
  }
  const asyncHookTimeoutMs = value['asyncHookTimeoutMs'] === undefined
    ? DEFAULT_PLUGIN_HOST_CONFIGURATION.asyncHookTimeoutMs
    : value['asyncHookTimeoutMs'];
  if (
    typeof asyncHookTimeoutMs !== 'number' ||
    !Number.isSafeInteger(asyncHookTimeoutMs) ||
    asyncHookTimeoutMs < 1 ||
    asyncHookTimeoutMs > 60_000
  ) {
    return null;
  }
  const syncHookBudgetMs = value['syncHookBudgetMs'] === undefined
    ? DEFAULT_PLUGIN_HOST_CONFIGURATION.syncHookBudgetMs
    : value['syncHookBudgetMs'];
  if (
    typeof syncHookBudgetMs !== 'number' ||
    !Number.isSafeInteger(syncHookBudgetMs) ||
    syncHookBudgetMs < 1 ||
    syncHookBudgetMs > 1_000
  ) {
    return null;
  }
  return Object.freeze({
    engineVersion,
    parsedEngineVersion,
    supportedAbiVersions: Object.freeze(supportedAbiVersions),
    supportedCapabilities: Object.freeze(supportedCapabilities),
    asyncHookTimeoutMs,
    syncHookBudgetMs,
  });
}

function normalizePluginGrantPolicy(
  input: BomPluginGrantPolicy | undefined,
): BomPluginGrantPolicy | null | undefined {
  if (input === undefined) return undefined;
  try {
    return typeof input.grant === 'function' ? input : null;
  } catch {
    return null;
  }
}

function normalizeMaterialMatchApprovalPolicy(
  input: BomMaterialMatchApprovalPolicy | undefined,
): BomMaterialMatchApprovalPolicy | null | undefined {
  if (input === undefined) return undefined;
  try {
    return typeof input.authorize === 'function' ? input : null;
  } catch {
    return null;
  }
}

function normalizeMaterialMatchApproval(
  input: unknown,
): MaterialMatchAuthorization {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return { status: 'invalid' };
    }
    const decision = input as {
      readonly decisionId?: unknown;
      readonly allowed?: unknown;
      readonly reasonCode?: unknown;
    };
    const decisionId = safeAuditToken(decision.decisionId);
    const reasonCode = decision.reasonCode === undefined
      ? undefined
      : safeAuditToken(decision.reasonCode);
    if (
      decisionId === undefined ||
      typeof decision.allowed !== 'boolean' ||
      (decision.reasonCode !== undefined && reasonCode === undefined)
    ) {
      return { status: 'invalid' };
    }
    if (!decision.allowed) {
      return {
        status: 'denied',
        decisionId,
        ...(reasonCode === undefined ? {} : { reasonCode }),
      };
    }
    return { status: 'allowed', decisionId };
  } catch {
    return { status: 'invalid' };
  }
}

function hasMaterialReference<TFields extends BomFields>(
  node: Readonly<BomNode<TFields>>,
): boolean {
  return node.materialId !== undefined ||
    node.materialRevision !== undefined ||
    node.materialCode !== undefined;
}

function awaitMaterialMatchApproval(
  operation: PromiseLike<unknown>,
  signal?: AbortSignal,
): Promise<MaterialMatchApprovalWaitResult> {
  if (signal?.aborted) return Promise.resolve({ status: 'aborted' });
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (result: MaterialMatchApprovalWaitResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onAbort = (): void => finish({ status: 'aborted' });
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => finish({ status: 'fulfilled', value }),
      () => finish({ status: 'rejected' }),
    );
  });
}

function normalizePluginManifest(
  input: unknown,
): Readonly<BomPluginManifest> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const stringFields = ['id', 'name', 'version', 'abiVersion', 'engineRange'];
  if (stringFields.some((field) =>
    typeof value[field] !== 'string' || (value[field] as string).trim().length === 0 ||
    (value[field] as string).length > 128,
  )) return null;
  const id = value['id'] as string;
  const version = value['version'] as string;
  if (!isContributionId(id)) return null;
  const priority = value['priority'];
  if (
    priority !== undefined &&
    (typeof priority !== 'number' ||
      !Number.isSafeInteger(priority) ||
      Math.abs(priority) > 1_000_000)
  ) return null;
  const capabilities = value['capabilities'];
  if (!Array.isArray(capabilities) || capabilities.length === 0 ||
      capabilities.some((capability) => typeof capability !== 'string' || !isContributionId(capability))) {
    return null;
  }
  if (new Set(capabilities).size !== capabilities.length) return null;
  const permissions = value['permissions'];
  if (permissions !== undefined && (!Array.isArray(permissions) ||
      permissions.some((permission) => typeof permission !== 'string' || !isContributionId(permission)))) return null;
  if (permissions !== undefined && new Set(permissions).size !== permissions.length) return null;
  const dependencies = value['dependencies'];
  if (dependencies !== undefined && (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies))) return null;
  const dependencyEntries = Object.entries(
    (dependencies ?? {}) as Readonly<Record<string, unknown>>,
  );
  if (dependencyEntries.length > 256) return null;
  const normalizedDependencies: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [dependency, range] of dependencyEntries) {
    if (
      !isContributionId(dependency) ||
      dependency === id ||
      typeof range !== 'string' ||
      range.length === 0 ||
      range.length > 128 ||
      engineRangeSatisfies(Object.freeze({ major: 0, minor: 0, patch: 0 }), range) === null
    ) return null;
    normalizedDependencies[dependency] = range;
  }
  return Object.freeze({
    id,
    name: value['name'] as string,
    version,
    abiVersion: value['abiVersion'] as string,
    engineRange: value['engineRange'] as string,
    ...(priority === undefined ? {} : { priority: priority as number }),
    capabilities: Object.freeze([...capabilities] as BomPluginCapability[]),
    ...(permissions === undefined ? {} : { permissions: Object.freeze([...permissions] as BomPluginPermission[]) }),
    ...(dependencies === undefined ? {} : { dependencies: Object.freeze(normalizedDependencies) }),
  });
}

function parseSemanticVersion(input: string): Readonly<SemanticVersion> | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(input);
  if (match === null) return null;
  const majorText = match[1];
  const minorText = match[2];
  const patchText = match[3];
  if (majorText === undefined || minorText === undefined || patchText === undefined) {
    return null;
  }
  if (majorText.length > 9 || minorText.length > 9 || patchText.length > 9) return null;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  if (
    !Number.isSafeInteger(major) ||
    !Number.isSafeInteger(minor) ||
    !Number.isSafeInteger(patch)
  ) {
    return null;
  }
  return Object.freeze({ major, minor, patch });
}

function compareSemanticVersions(
  left: Readonly<SemanticVersion>,
  right: Readonly<SemanticVersion>,
): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function semanticVersionText(version: Readonly<SemanticVersion>): string {
  return String(version.major) + '.' + String(version.minor) + '.' + String(version.patch);
}

function negotiatePluginAbiVersion(
  pluginAbiVersion: string,
  hostAbiVersions: readonly Readonly<{
    readonly raw: string;
    readonly version: Readonly<SemanticVersion>;
  }>[],
): string | undefined {
  const pluginVersion = parseSemanticVersion(pluginAbiVersion);
  if (pluginVersion === null) return undefined;
  const compatible = hostAbiVersions
    .filter((candidate) => candidate.version.major === pluginVersion.major)
    .sort((left, right) => compareSemanticVersions(right.version, left.version));
  const hostVersion = compatible[0]?.version;
  if (hostVersion === undefined) return undefined;
  return semanticVersionText(
    compareSemanticVersions(pluginVersion, hostVersion) <= 0
      ? pluginVersion
      : hostVersion,
  );
}

/** Returns null when a range uses syntax outside the intentionally small ABI grammar. */
function engineRangeSatisfies(
  engineVersion: Readonly<SemanticVersion>,
  engineRange: string,
): boolean | null {
  const range = engineRange.trim();
  if (range === '*') return true;
  if (range.length === 0 || range.length > 128 || range.includes('||')) return null;

  const exact = parseSemanticVersion(range);
  if (exact !== null) return compareSemanticVersions(engineVersion, exact) === 0;

  const compatibilityPrefix = range[0];
  if (compatibilityPrefix === '^' || compatibilityPrefix === '~') {
    const minimum = parseSemanticVersion(range.slice(1));
    if (minimum === null || compareSemanticVersions(engineVersion, minimum) < 0) {
      return minimum === null ? null : false;
    }
    const upper = compatibilityPrefix === '^'
      ? caretUpperBound(minimum)
      : Object.freeze({ major: minimum.major, minor: minimum.minor + 1, patch: 0 });
    return compareSemanticVersions(engineVersion, upper) < 0;
  }

  const wildcard = wildcardEngineRange(range);
  if (wildcard !== null) {
    return engineVersion.major === wildcard.major &&
      (wildcard.minor === undefined || engineVersion.minor === wildcard.minor);
  }

  const comparators = range.split(/\s+/u);
  if (comparators.length === 0) return null;
  for (const comparator of comparators) {
    const match = /^(>=|>|<=|<)(.+)$/u.exec(comparator);
    if (match === null) return null;
    const operator = match[1];
    const versionText = match[2];
    if (operator === undefined || versionText === undefined) return null;
    const boundary = parseSemanticVersion(versionText);
    if (boundary === null) return null;
    const compared = compareSemanticVersions(engineVersion, boundary);
    if (
      (operator === '>=' && compared < 0) ||
      (operator === '>' && compared <= 0) ||
      (operator === '<=' && compared > 0) ||
      (operator === '<' && compared >= 0)
    ) {
      return false;
    }
  }
  return true;
}

function caretUpperBound(version: Readonly<SemanticVersion>): Readonly<SemanticVersion> {
  if (version.major > 0) {
    return Object.freeze({ major: version.major + 1, minor: 0, patch: 0 });
  }
  if (version.minor > 0) {
    return Object.freeze({ major: 0, minor: version.minor + 1, patch: 0 });
  }
  return Object.freeze({ major: 0, minor: 0, patch: version.patch + 1 });
}

function wildcardEngineRange(
  range: string,
): Readonly<{ readonly major: number; readonly minor?: number }> | null {
  const majorOnly = /^(0|[1-9]\d*)\.(?:x|\*)$/u.exec(range);
  if (majorOnly !== null) {
    const majorText = majorOnly[1];
    if (majorText === undefined || majorText.length > 9) return null;
    return Object.freeze({ major: Number(majorText) });
  }
  const majorMinor = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(?:x|\*)$/u.exec(range);
  if (majorMinor === null) return null;
  const majorText = majorMinor[1];
  const minorText = majorMinor[2];
  if (
    majorText === undefined ||
    minorText === undefined ||
    majorText.length > 9 ||
    minorText.length > 9
  ) {
    return null;
  }
  return Object.freeze({ major: Number(majorText), minor: Number(minorText) });
}

function isContributionId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value);
}

function isPluginRuleVersion(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u.test(value);
}

function hasPermission(
  permissions: readonly BomPluginPermission[],
  permission: BomPluginPermission,
): boolean {
  return permissions.includes(permission);
}

function createPluginRuntime(): PluginRuntime {
  return {
    lifecycleController: new AbortController(),
    hookController: new AbortController(),
    acceptingCalls: true,
    hookEpoch: 0,
    inFlightHooks: 0,
    drainWaiters: new Set<() => void>(),
  };
}

/** Runs one untrusted hook with a cancellable async wait and synchronous timing. */
function runBoundedPluginHook<T>(
  operation: (signal: AbortSignal) => T | Promise<T>,
  parentSignals: readonly (AbortSignal | undefined)[],
  timeoutMs: number,
  onSynchronousDuration?: (durationMs: number) => void,
): Promise<PluginHookResult<T>> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const listeners: Array<readonly [AbortSignal, () => void]> = [];
    let settled = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    const finish = (result: PluginHookResult<T>): void => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      for (const [signal, listener] of listeners) {
        signal.removeEventListener('abort', listener);
      }
      resolve(result);
    };
    const abort = (): void => {
      controller.abort();
      finish(Object.freeze({ status: 'aborted' }));
    };
    for (const signal of parentSignals) {
      if (signal === undefined) continue;
      if (signal.aborted) {
        abort();
        return;
      }
      const listener = (): void => abort();
      signal.addEventListener('abort', listener, { once: true });
      listeners.push([signal, listener]);
    }
    timeout = globalThis.setTimeout(() => {
      controller.abort();
      finish(Object.freeze({ status: 'timeout' }));
    }, timeoutMs);
    const startedAt = nowMs();
    try {
      const pending = operation(controller.signal);
      reportSynchronousPluginHookDuration(onSynchronousDuration, startedAt);
      Promise.resolve(pending).then(
        (value) => finish(Object.freeze({ status: 'fulfilled', value })),
        (error: unknown) => finish(Object.freeze({ status: 'rejected', error })),
      );
    } catch (error) {
      reportSynchronousPluginHookDuration(onSynchronousDuration, startedAt);
      finish(Object.freeze({ status: 'rejected', error }));
    }
  });
}

function reportSynchronousPluginHookDuration(
  observer: ((durationMs: number) => void) | undefined,
  startedAt: number,
): void {
  if (observer === undefined) return;
  try {
    observer(Math.max(0, nowMs() - startedAt));
  } catch {
    // Host observability is advisory and cannot alter plugin completion.
  }
}

function waitForPluginRuntimeDrain(
  runtime: PluginRuntime,
  timeoutMs: number,
): Promise<void> {
  if (runtime.inFlightHooks === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      runtime.drainWaiters.delete(finish);
      resolve();
    };
    runtime.drainWaiters.add(finish);
    timeout = globalThis.setTimeout(finish, timeoutMs);
  });
}

async function safePluginCleanup(
  cleanup: BomPluginCleanup | undefined,
  timeoutMs: number,
  onSynchronousDuration?: (durationMs: number) => void,
): Promise<PluginHookResult<void>> {
  if (cleanup === undefined) return Object.freeze({ status: 'fulfilled', value: undefined });
  return runBoundedPluginHook(
    (signal) => cleanup({ signal }),
    [],
    timeoutMs,
    onSynchronousDuration,
  );
}

function disposePluginRegistrations(
  unregisters: readonly (() => void)[],
): void {
  for (let index = unregisters.length - 1; index >= 0; index -= 1) {
    try {
      unregisters[index]!();
    } catch {
      // Host-issued unregister functions should not throw, but cleanup must continue.
    }
  }
}

function orderPlugins<TFields extends BomFields>(
  plugins: readonly BomPlugin<TFields>[],
): readonly BomPlugin<TFields>[] {
  const byId = new Map(plugins.map((plugin) => [plugin.manifest.id, plugin]));
  const ordered: BomPlugin<TFields>[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (plugin: BomPlugin<TFields>): void => {
    const id = plugin.manifest.id;
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new BomEditorConfigurationError(
      editorError(BOM_EDITOR_ERROR_CODES.pluginDependency, 'PLUGIN', { pluginId: id }),
    );
    visiting.add(id);
    const dependencies = Object.keys(plugin.manifest.dependencies ?? {})
      .map((dependency) => byId.get(dependency))
      .filter((dependency): dependency is BomPlugin<TFields> => dependency !== undefined)
      .sort(comparePlugins);
    for (const dependency of dependencies) {
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(plugin);
  };
  [...plugins].sort(comparePlugins).forEach(visit);
  return Object.freeze(ordered);
}

function comparePlugins<TFields extends BomFields>(
  left: BomPlugin<TFields>,
  right: BomPlugin<TFields>,
): number {
  return (left.manifest.priority ?? 0) - (right.manifest.priority ?? 0) ||
    compareUtf8(left.manifest.name, right.manifest.name) ||
    compareUtf8(left.manifest.id, right.manifest.id);
}

function normalizePluginValidationIssues<TFields extends BomFields>(
  issues: readonly BomPluginValidationFinding[],
  pluginKey: string,
  validator: Readonly<RegisteredPluginValidator<TFields>>,
  occurrenceById: ReadonlyMap<OccurrenceId, unknown>,
  validationOccurrenceIds: ReadonlySet<OccurrenceId>,
  schema: Readonly<BomSchema>,
): readonly BomValidationIssue[] | null {
  const separator = pluginKey.indexOf('/');
  if (separator < 1 || pluginKey.slice(separator + 1) !== validator.ruleId) return null;
  const pluginId = pluginKey.slice(0, separator);
  const schemaFieldPaths = new Set(schema.fields.map((field) => fieldPathKey(field.path)));
  const candidates: Array<Readonly<{
    readonly occurrenceId?: OccurrenceId;
    readonly fieldPath?: readonly string[];
    readonly messageKey: string;
    readonly messageParams?: Readonly<Record<string, string | number>>;
    readonly valueDigest?: string;
    readonly sortKey: string;
  }>> = [];
  for (const issue of issues) {
    if (issue === undefined || !isPluginValidationRecord(issue)) return null;
    if (issue.ruleId !== undefined && issue.ruleId !== validator.ruleId) return null;
    if (issue.ruleVersion !== undefined && issue.ruleVersion !== validator.version) return null;
    if (issue.severity !== undefined && issue.severity !== validator.severity) return null;
    if (
      typeof issue.messageKey !== 'string' ||
      issue.messageKey.trim().length === 0 ||
      issue.messageKey.length > 256
    ) return null;
    if (
      issue.occurrenceId !== undefined &&
      (typeof issue.occurrenceId !== 'string' ||
        !occurrenceById.has(issue.occurrenceId) ||
        !validationOccurrenceIds.has(issue.occurrenceId))
    ) return null;
    if (
      issue.fieldPath !== undefined &&
      (!Array.isArray(issue.fieldPath) ||
        issue.fieldPath.some((part) => typeof part !== 'string') ||
        !schemaFieldPaths.has(fieldPathKey(issue.fieldPath)))
    ) return null;
    if (
      issue.valueDigest !== undefined &&
      (typeof issue.valueDigest !== 'string' ||
        issue.valueDigest.length === 0 ||
        issue.valueDigest.length > 256)
    ) return null;
    const messageParams = normalizePluginValidationMessageParams(issue.messageParams);
    if (messageParams === null) return null;
    const occurrenceId = issue.occurrenceId;
    const fieldPath = issue.fieldPath === undefined
      ? undefined
      : Object.freeze([...issue.fieldPath]);
    const sortKey = pluginValidationFindingKey(
      occurrenceId,
      fieldPath,
      issue.messageKey,
      messageParams,
      issue.valueDigest,
    );
    candidates.push(Object.freeze({
      ...(occurrenceId === undefined ? {} : { occurrenceId }),
      ...(fieldPath === undefined ? {} : { fieldPath }),
      messageKey: issue.messageKey,
      ...(messageParams === undefined ? {} : { messageParams }),
      ...(issue.valueDigest === undefined ? {} : { valueDigest: issue.valueDigest }),
      sortKey,
    }));
  }
  candidates.sort((left, right) => compareUtf8(left.sortKey, right.sortKey));
  let previousKey: string | undefined;
  let duplicateOrdinal = 0;
  const ruleId = pluginId + '/' + validator.ruleId;
  const result = candidates.map((candidate) => {
    if (candidate.sortKey === previousKey) {
      duplicateOrdinal += 1;
    } else {
      previousKey = candidate.sortKey;
      duplicateOrdinal = 0;
    }
    const issueId = ruleId + ':' + sha256Hex(
      'bom:plugin-validation:v1\u0000' + ruleId + '\u0000' + validator.version + '\u0000' +
        candidate.sortKey,
    ) + ':' + String(duplicateOrdinal);
    return Object.freeze({
      issueId,
      ruleId,
      ruleVersion: validator.version,
      severity: validator.severity,
      ...(candidate.occurrenceId === undefined ? {} : { occurrenceId: candidate.occurrenceId }),
      ...(candidate.fieldPath === undefined ? {} : { fieldPath: candidate.fieldPath }),
      messageKey: candidate.messageKey,
      ...(candidate.messageParams === undefined
        ? {}
        : { messageParams: candidate.messageParams }),
      ...(candidate.valueDigest === undefined ? {} : { valueDigest: candidate.valueDigest }),
    });
  });
  return Object.freeze(result);
}

function isPluginValidationRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizePluginValidationMessageParams(
  input: unknown,
): Readonly<Record<string, string | number>> | undefined | null {
  if (input === undefined) return undefined;
  if (!isPluginValidationRecord(input)) return null;
  const entries: Array<readonly [string, string | number]> = [];
  for (const key of Object.keys(input).sort(compareUtf8)) {
    const value = input[key];
    if (
      key.length === 0 || key.length > 128 ||
      (typeof value !== 'string' &&
        (typeof value !== 'number' || !Number.isFinite(value)))
    ) return null;
    entries.push(Object.freeze([key, value]));
  }
  return Object.freeze(Object.fromEntries(entries));
}

function pluginValidationFindingKey(
  occurrenceId: OccurrenceId | undefined,
  fieldPath: readonly string[] | undefined,
  messageKey: string,
  messageParams: Readonly<Record<string, string | number>> | undefined,
  valueDigest: string | undefined,
): string {
  const params = messageParams === undefined
    ? '[]'
    : JSON.stringify(Object.keys(messageParams).sort(compareUtf8).map((key) => [
      key,
      messageParams[key],
    ]));
  return [
    occurrenceId ?? '$document',
    fieldPath === undefined ? '' : fieldPathKey(fieldPath),
    messageKey,
    params,
    valueDigest ?? '',
  ].join('\u0000');
}

function normalizeFixDraft<TFields extends BomFields>(
  proposal: BomPluginFixDraft<TFields>,
  fixerId: string,
  issueRuleId: string,
): Readonly<NormalizedFixDraft<TFields>> | null {
  if (typeof proposal !== 'object' || proposal === null) return null;
  const input = proposal as unknown as Readonly<{
    readonly proposalId?: unknown;
    readonly ruleId?: unknown;
    readonly titleKey?: unknown;
    readonly confidence?: unknown;
    readonly commands?: unknown;
  }>;
  const proposalId = input.proposalId;
  const ruleId = input.ruleId;
  const titleKey = input.titleKey;
  const confidence = input.confidence;
  const commandsInput = input.commands;
  if (
    typeof proposalId !== 'string' || !isContributionId(proposalId) ||
    typeof ruleId !== 'string' ||
      (ruleId !== fixerId && ruleId !== issueRuleId) ||
    typeof titleKey !== 'string' || titleKey.length === 0 ||
    typeof confidence !== 'number' ||
      !Number.isFinite(confidence) || confidence < 0 || confidence > 1 ||
    !Array.isArray(commandsInput) || commandsInput.length === 0
  ) {
    return null;
  }
  const commands = normalizeBomValue(commandsInput, {
    path: ['plugin', 'fix', 'commands'],
  });
  if (!commands.ok || !Array.isArray(commands.value) || commands.value.length === 0) {
    return null;
  }
  return Object.freeze({
    proposalId,
    ruleId: fixerId,
    titleKey,
    confidence,
    commands: commands.value as unknown as readonly BomCommand<TFields>[],
  });
}

function localPluginContributionId(
  pluginId: string,
  issueRuleId: unknown,
): string | undefined {
  if (typeof pluginId !== 'string' || !isContributionId(pluginId) ||
      typeof issueRuleId !== 'string') {
    return undefined;
  }
  const prefix = pluginId + '/';
  if (!issueRuleId.startsWith(prefix)) return undefined;
  const contributionId = issueRuleId.slice(prefix.length);
  return isContributionId(contributionId) ? contributionId : undefined;
}

function fixImpactFromDiff<TFields extends BomFields>(
  diff: Readonly<BomSnapshotDiff<TFields>>,
): Readonly<BomPluginFixImpact> {
  const occurrenceIds = new Set<string>();
  const structuralOccurrenceIds = new Set<string>();
  const fieldPaths: { occurrenceId: string; fieldPath: readonly string[] }[] = [];
  const addOccurrence = (occurrenceId: string | null): void => {
    if (occurrenceId !== null) occurrenceIds.add(occurrenceId);
  };
  const addStructuralOccurrence = (occurrenceId: string | null): void => {
    if (occurrenceId === null) return;
    occurrenceIds.add(occurrenceId);
    structuralOccurrenceIds.add(occurrenceId);
  };
  for (const change of diff.changes) {
    switch (change.type) {
      case 'field':
        addOccurrence(change.occurrenceId);
        fieldPaths.push(Object.freeze({
          occurrenceId: change.occurrenceId,
          fieldPath: Object.freeze([...change.fieldPath]),
        }));
        break;
      case 'insert':
      case 'delete':
        addStructuralOccurrence(change.node.occurrenceId);
        addStructuralOccurrence(change.node.parentId);
        break;
      case 'move':
        addStructuralOccurrence(change.occurrenceId);
        addStructuralOccurrence(change.beforeParentId);
        addStructuralOccurrence(change.afterParentId);
        break;
      case 'reorder':
        addStructuralOccurrence(change.occurrenceId);
        addStructuralOccurrence(change.parentId);
        break;
      case 'material':
        addStructuralOccurrence(change.occurrenceId);
        break;
    }
  }
  fieldPaths.sort((left, right) =>
    left.occurrenceId.localeCompare(right.occurrenceId) ||
    fieldPathKey(left.fieldPath).localeCompare(fieldPathKey(right.fieldPath)),
  );
  return Object.freeze({
    occurrenceIds: Object.freeze([...occurrenceIds].sort((left, right) => left.localeCompare(right))),
    structuralOccurrenceIds: Object.freeze(
      [...structuralOccurrenceIds].sort((left, right) => left.localeCompare(right)),
    ),
    fieldPaths: Object.freeze(fieldPaths),
  });
}

function fixImpactsOverlap(
  left: Readonly<BomPluginFixImpact>,
  right: Readonly<BomPluginFixImpact>,
): boolean {
  const leftOccurrences = new Set(left.occurrenceIds);
  const rightOccurrences = new Set(right.occurrenceIds);
  for (const occurrenceId of leftOccurrences) {
    if (!rightOccurrences.has(occurrenceId)) continue;
    if (
      left.structuralOccurrenceIds.includes(occurrenceId) ||
      right.structuralOccurrenceIds.includes(occurrenceId)
    ) {
      return true;
    }
  }
  for (const leftPath of left.fieldPaths) {
    for (const rightPath of right.fieldPaths) {
      if (leftPath.occurrenceId !== rightPath.occurrenceId) continue;
      if (fieldPathsOverlap(leftPath.fieldPath, rightPath.fieldPath)) return true;
    }
  }
  return false;
}

function fieldPathsOverlap(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const shorter = Math.min(left.length, right.length);
  for (let index = 0; index < shorter; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function fieldPathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function ownInstanceId(input: string | undefined): string {
  if (input !== undefined) {
    if (input.trim().length === 0) {
      throw new BomEditorConfigurationError(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'instanceId',
        }),
      );
    }
    return input;
  }
  editorSequence += 1;
  return 'bom-editor-' + String(editorSequence);
}

const INITIAL_VIEW_KEYS = new Set<PropertyKey>([
  'columns',
  'rowHeight',
  'rowHeights',
  'expandedIds',
  'expandAll',
  'query',
  'selection',
  'scrollLeft',
  'scrollTop',
]);
const INITIAL_VIEW_COLUMN_KEYS = new Set<PropertyKey>([
  'columnId',
  'width',
  'frozen',
  'visible',
]);

function normalizeEditorInitialView(
  input: Readonly<BomEditorInitialView> | undefined,
  legacy: Readonly<{
    readonly rowHeight?: number;
    readonly expandedIds?: readonly string[];
    readonly expandAll?: boolean;
  }>,
  schema: BomSchema,
): NormalizedEditorInitialView | null {
  if (input !== undefined) {
    if (
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Reflect.ownKeys(input).some((key) => !INITIAL_VIEW_KEYS.has(key))
    ) {
      return null;
    }
  }
  const candidate = input as Readonly<BomEditorInitialView> | undefined;
  const columns = normalizeInitialViewColumns(candidate?.columns);
  if (columns === null) return null;
  const rowHeight = candidate?.rowHeight ?? legacy.rowHeight;
  const rowHeights = normalizeInitialRowHeights(candidate?.rowHeights);
  if (rowHeights === null) return null;
  const expandedIds = candidate?.expandedIds ?? legacy.expandedIds;
  const expandAll = candidate?.expandAll ?? legacy.expandAll;
  if (
    expandedIds !== undefined &&
    (!Array.isArray(expandedIds) ||
      expandedIds.some(
        (occurrenceId) =>
          typeof occurrenceId !== 'string' || occurrenceId.length === 0,
      ))
  ) {
    return null;
  }
  if (
    expandAll !== undefined &&
    typeof expandAll !== 'boolean'
  ) {
    return null;
  }
  if (expandAll === true && expandedIds !== undefined && expandedIds.length > 0) {
    return null;
  }
  const query = normalizeViewQuery(candidate?.query ?? {}, schema);
  if (query === null) return null;
  const scrollLeft = candidate?.scrollLeft ?? 0;
  const scrollTop = candidate?.scrollTop ?? 0;
  if (
    !Number.isFinite(scrollLeft) ||
    scrollLeft < 0 ||
    !Number.isFinite(scrollTop) ||
    scrollTop < 0
  ) {
    return null;
  }
  return Object.freeze({
    ...(columns === undefined ? {} : { columns }),
    ...(rowHeight === undefined ? {} : { rowHeight }),
    ...(rowHeights === undefined ? {} : { rowHeights }),
    ...(expandedIds === undefined
      ? {}
      : { expandedIds: Object.freeze([...expandedIds]) }),
    ...(expandAll === undefined ? {} : { expandAll }),
    query,
    ...(candidate === undefined || !Object.prototype.hasOwnProperty.call(candidate, 'selection')
      ? {}
      : { selection: candidate.selection }),
    scrollLeft,
    scrollTop,
  });
}

function normalizeInitialViewColumns(
  input: unknown,
): readonly Readonly<BomViewColumnState>[] | undefined | null {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return null;
  const states: Readonly<BomViewColumnState>[] = [];
  const ids = new Set<string>();
  for (const candidate of input) {
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      Reflect.ownKeys(candidate).some(
        (key) => !INITIAL_VIEW_COLUMN_KEYS.has(key),
      )
    ) {
      return null;
    }
    const state = candidate as Readonly<Record<PropertyKey, unknown>>;
    const columnId = state['columnId'];
    const width = state['width'];
    const frozen = state['frozen'];
    const visible = state['visible'];
    if (
      typeof columnId !== 'string' ||
      columnId.length === 0 ||
      ids.has(columnId) ||
      typeof width !== 'number' ||
      !Number.isFinite(width) ||
      width <= 0 ||
      (frozen !== false && frozen !== 'start' && frozen !== 'end') ||
      typeof visible !== 'boolean'
    ) {
      return null;
    }
    ids.add(columnId);
    states.push(Object.freeze({ columnId, width, frozen, visible }));
  }
  return Object.freeze(states);
}

function normalizeInitialRowHeights(
  input: unknown,
): readonly Readonly<BomViewRowHeightState>[] | undefined | null {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return null;
  const result: BomViewRowHeightState[] = [];
  const ids = new Set<string>();
  for (const candidate of input) {
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      Reflect.ownKeys(candidate).some((key) => key !== 'occurrenceId' && key !== 'rowHeight')
    ) return null;
    const value = candidate as Readonly<Record<PropertyKey, unknown>>;
    const occurrenceId = value['occurrenceId'];
    const rowHeight = value['rowHeight'];
    if (
      typeof occurrenceId !== 'string' ||
      occurrenceId.length === 0 ||
      ids.has(occurrenceId) ||
      typeof rowHeight !== 'number' ||
      !Number.isFinite(rowHeight) ||
      rowHeight <= 0 ||
      rowHeight > MAX_ROW_HEIGHT_PX
    ) return null;
    ids.add(occurrenceId);
    result.push(Object.freeze({ occurrenceId, rowHeight }));
  }
  return Object.freeze(result);
}

function resolveInitialViewColumns(
  baseColumns: readonly Readonly<BomColumnDefinition>[],
  states: readonly Readonly<BomViewColumnState>[] | undefined,
  schema: BomSchema,
): readonly Readonly<BomColumnDefinition>[] | null {
  if (states === undefined) return baseColumns;
  const firstBaseColumn = baseColumns[0];
  const firstState = states[0];
  if (
    states.length !== baseColumns.length ||
    firstBaseColumn === undefined ||
    firstState === undefined ||
    firstState.columnId !== firstBaseColumn.columnId ||
    firstState.visible !== true
  ) {
    return null;
  }
  const columnsById = new Map(
    baseColumns.map((column) => [column.columnId, column]),
  );
  const nextColumns: BomColumnDefinition[] = [];
  for (const state of states) {
    const base = columnsById.get(state.columnId);
    if (base === undefined) return null;
    nextColumns.push({
      ...base,
      width: state.width,
      frozen: state.frozen,
      visible: state.visible,
    });
  }
  const normalized = normalizeEditorColumns(nextColumns, schema);
  return normalized.ok ? normalized.value : null;
}

function normalizeInitialSelection<TFields extends BomFields>(
  selection: Readonly<BomSelectionState> | null | undefined,
  projection: VisibleProjection<TFields>,
  indexes: BomBaseIndexes<TFields>,
  columns: readonly Readonly<BomColumnDefinition>[],
): Readonly<BomSelectionState> {
  if (selection === undefined) {
    return firstSelection(projection, columns);
  }
  if (selection === null) {
    return freezeSelection(null);
  }
  try {
    if (typeof selection !== 'object' || Array.isArray(selection)) {
      throw new Error('invalid-selection');
    }
    const normalized = sanitizeSelection(
      selection,
      projection,
      indexes,
      columns,
    );
    if (!sameSelection(normalized, selection)) {
      throw new Error('invalid-selection');
    }
    return freezeSelection(
      normalized.activeCell,
      normalized.range === null ? undefined : normalized.range,
      normalized.mode,
      normalized.ranges,
    );
  } catch {
    throw new BomEditorConfigurationError(
      editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
        option: 'initialView.selection',
      }),
    );
  }
}

function firstSelection<TFields extends BomFields>(
  projection: VisibleProjection<TFields>,
  columns: readonly Readonly<BomColumnDefinition>[],
): Readonly<BomSelectionState> {
  const column = visibleColumnDefinitions(columns)[0];
  const occurrence = projection.occurrenceAt(0);
  if (!occurrence.ok || occurrence.value === undefined || column === undefined) {
    return freezeSelection(null);
  }
  return freezeSelection({
    occurrenceId: occurrence.value,
    columnId: column.columnId,
  });
}

function sanitizeSelection<TFields extends BomFields>(
  selection: Readonly<BomSelectionState>,
  projection: VisibleProjection<TFields>,
  indexes: BomBaseIndexes<TFields>,
  columns: readonly Readonly<BomColumnDefinition>[],
  fallback?: Readonly<BomCellAddress>,
): Readonly<BomSelectionState> {
  const visibleColumns = visibleColumnDefinitions(columns);
  const active = selection.activeCell;
  const validAddress = (address: Readonly<BomCellAddress> | null): boolean => {
    if (
      address === null ||
      !indexes.rowById.has(address.occurrenceId) ||
      !visibleColumns.some((column) => column.columnId === address.columnId)
    ) {
      return false;
    }
    const visibleIndex = projection.indexOf(address.occurrenceId);
    return visibleIndex.ok && visibleIndex.value !== undefined;
  };

  const validRange = (range: Readonly<BomCellRange>): boolean =>
    validAddress(range.anchor) && validAddress(range.focus);
  if (selection.ranges !== undefined) {
    const ranges = selection.ranges.filter(validRange);
    if (ranges.length > 0) {
      const activeRange =
        (active === null
          ? undefined
          : ranges.find((range) => sameAddress(range.focus, active))) ??
        ranges[ranges.length - 1]!;
      const ordered = [
        ...ranges.filter((range) => range !== activeRange),
        activeRange,
      ];
      return freezeRanges(activeRange.focus, ordered);
    }
    if (fallback !== undefined && validAddress(fallback)) {
      return freezeSelection(fallback);
    }
    return firstSelection(projection, visibleColumns);
  }
  if (active !== null && validAddress(active)) {
    const range = selection.range;
    if (range === null) {
      return selection.mode === undefined
        ? selection
        : freezeSelection(active);
    }
    if (
      validAddress(range.anchor) &&
      validAddress(range.focus) &&
      sameAddress(active, range.focus)
    ) {
      return selection;
    }
    return freezeSelection(active);
  }
  if (fallback !== undefined && validAddress(fallback)) {
    return freezeSelection(fallback);
  }
  return firstSelection(projection, visibleColumns);
}

function selectionForAddress(
  previous: Readonly<BomSelectionState>,
  address: Readonly<BomCellAddress>,
  extend: boolean,
  additive = false,
): Readonly<BomSelectionState> {
  if (
    extend &&
    !additive &&
    previous.ranges !== undefined &&
    previous.ranges.length > 1 &&
    previous.activeCell !== null
  ) {
    const anchor = previous.range?.anchor ?? previous.activeCell;
    const candidate = cellRange(anchor, address);
    const activeRangeIndex = previous.range === null
      ? previous.ranges.length - 1
      : previous.ranges.findIndex((range) => sameRange(range, previous.range!));
    const nextRanges = [...previous.ranges];
    nextRanges[activeRangeIndex < 0 ? nextRanges.length - 1 : activeRangeIndex] =
      candidate;
    return freezeRanges(address, nextRanges);
  }
  if (additive && previous.mode === undefined) {
    const previousRanges = selectionRanges(previous);
    const candidate = extend
      ? cellRange(previous.activeCell ?? address, address)
      : cellRange(address, address);
    const existingIndex = previousRanges.findIndex((range) =>
      sameRange(range, candidate));
    if (existingIndex >= 0) {
      const remaining = previousRanges.filter((_, index) => index !== existingIndex);
      if (remaining.length === 0) {
        return freezeSelection(address);
      }
      return freezeRanges(remaining[remaining.length - 1]!.focus, remaining);
    }
    return freezeRanges(address, [...previousRanges, candidate]);
  }
  if (!extend || previous.activeCell === null) {
    return freezeSelection(address);
  }
  const anchor = previous.range?.anchor ?? previous.activeCell;
  if (sameAddress(anchor, address)) {
    return freezeSelection(address);
  }
  return freezeSelection(address, { anchor, focus: address });
}

function selectionForAxis<TFields extends BomFields>(
  previous: Readonly<BomSelectionState>,
  address: Readonly<BomCellAddress>,
  extend: boolean,
  mode: BomSelectionMode,
  projection: VisibleProjection<TFields>,
  columns: readonly Readonly<BomColumnDefinition>[],
): Readonly<BomSelectionState> {
  const visibleColumns = visibleColumnDefinitions(columns);
  const firstColumn = visibleColumns[0];
  const lastColumn = visibleColumns[visibleColumns.length - 1];
  const firstOccurrence = projection.occurrenceAt(0);
  const lastOccurrence = projection.occurrenceAt(projection.visibleCount - 1);
  if (
    firstColumn === undefined ||
    lastColumn === undefined ||
    !firstOccurrence.ok ||
    firstOccurrence.value === undefined ||
    !lastOccurrence.ok ||
    lastOccurrence.value === undefined
  ) {
    return selectionForAddress(previous, address, false);
  }

  const previousAnchor =
    extend && previous.mode === mode && previous.range !== null
      ? previous.range.anchor
      : address;
  const anchor = mode === 'row'
    ? {
        occurrenceId: previousAnchor.occurrenceId,
        columnId: firstColumn.columnId,
      }
    : {
        occurrenceId: firstOccurrence.value,
        columnId: previousAnchor.columnId,
      };
  const focus = mode === 'row'
    ? {
        occurrenceId: address.occurrenceId,
        columnId: lastColumn.columnId,
      }
    : {
        occurrenceId: lastOccurrence.value,
        columnId: address.columnId,
      };
  return freezeSelection(focus, { anchor, focus }, mode);
}

function freezeSelection(
  activeCell: Readonly<BomCellAddress> | null,
  range?: Readonly<{
    readonly anchor: Readonly<BomCellAddress>;
    readonly focus: Readonly<BomCellAddress>;
  }>,
  mode?: BomSelectionMode,
  ranges?: readonly Readonly<BomCellRange>[],
): Readonly<BomSelectionState> {
  if (activeCell === null) {
    return Object.freeze({ activeCell: null, range: null });
  }
  const active = Object.freeze({ ...activeCell });
  const frozenRange = range === undefined
    ? null
    : Object.freeze({
        anchor: Object.freeze({ ...range.anchor }),
        focus: Object.freeze({ ...range.focus }),
      });
  const frozenRanges = ranges === undefined
    ? undefined
    : Object.freeze(
        ranges.map((entry) =>
          Object.freeze({
            anchor: Object.freeze({ ...entry.anchor }),
            focus: Object.freeze({ ...entry.focus }),
          })),
      );
  return Object.freeze({
    activeCell: active,
    range: frozenRange,
    ...(frozenRanges === undefined || frozenRanges.length < 2
      ? {}
      : { ranges: frozenRanges }),
    ...(mode === undefined ? {} : { mode }),
  });
}

function freezeRanges(
  activeCell: Readonly<BomCellAddress>,
  ranges: readonly Readonly<BomCellRange>[],
): Readonly<BomSelectionState> {
  if (ranges.length === 0) {
    return freezeSelection(activeCell);
  }
  const activeRange = ranges[ranges.length - 1]!;
  const range = sameAddress(activeRange.anchor, activeRange.focus)
    ? undefined
    : activeRange;
  if (ranges.length === 1) {
    return freezeSelection(activeCell, range);
  }
  return freezeSelection(activeCell, range, undefined, ranges);
}

function selectionRanges(
  selection: Readonly<BomSelectionState>,
): readonly Readonly<BomCellRange>[] {
  if (selection.ranges !== undefined && selection.ranges.length > 0) {
    return selection.ranges;
  }
  if (selection.range !== null) {
    return [selection.range];
  }
  if (selection.activeCell === null) {
    return [];
  }
  return [cellRange(selection.activeCell, selection.activeCell)];
}

function cellRange(
  anchor: Readonly<BomCellAddress>,
  focus: Readonly<BomCellAddress>,
): Readonly<BomCellRange> {
  return Object.freeze({
    anchor: Object.freeze({ ...anchor }),
    focus: Object.freeze({ ...focus }),
  });
}

function sameRange(
  left: Readonly<BomCellRange>,
  right: Readonly<BomCellRange>,
): boolean {
  return sameAddress(left.anchor, right.anchor) &&
    sameAddress(left.focus, right.focus);
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

function freezeViewColumns(
  columns: readonly Readonly<BomColumnDefinition>[],
): readonly Readonly<{
  readonly columnId: string;
  readonly width: number;
  readonly frozen: BomColumnDefinition['frozen'];
  readonly visible: boolean;
}>[] {
  return Object.freeze(columns.map((column) => Object.freeze({
    columnId: column.columnId,
    width: column.width,
    frozen: column.frozen,
    visible: column.visible !== false,
  })));
}

function freezeViewRowHeights(
  projection: VisibleProjection<Readonly<Record<string, BomValue>>>,
): readonly Readonly<BomViewRowHeightState>[] {
  return Object.freeze(projection.rowHeightOverrides().map((entry) =>
    Object.freeze({ occurrenceId: entry.occurrenceId, rowHeight: entry.rowHeight }),
  ));
}

function rowHeightOverrideMap(
  projection: VisibleProjection<any>,
  indexes?: BomBaseIndexes<any>,
): ReadonlyMap<OccurrenceId, number> {
  const result = new Map<OccurrenceId, number>();
  for (const entry of projection.rowHeightOverrides()) {
    if (indexes === undefined || indexes.rowById.has(entry.occurrenceId)) {
      result.set(entry.occurrenceId, entry.rowHeight);
    }
  }
  return result;
}

function sameRowHeightStates(
  left: readonly Readonly<BomViewRowHeightState>[],
  right: readonly Readonly<BomViewRowHeightState>[],
): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return other !== undefined &&
      entry.occurrenceId === other.occurrenceId &&
      entry.rowHeight === other.rowHeight;
  });
}

function sameColumnDefinitions(
  left: readonly Readonly<BomColumnDefinition>[],
  right: readonly Readonly<BomColumnDefinition>[],
): boolean {
  return left.length === right.length && left.every((column, index) => {
    const other = right[index];
    if (
      other === undefined ||
      column.columnId !== other.columnId ||
      column.fieldName !== other.fieldName ||
      column.label !== other.label ||
      column.width !== other.width ||
      column.minWidth !== other.minWidth ||
      column.maxWidth !== other.maxWidth ||
      column.visible !== other.visible ||
      column.editable !== other.editable ||
      column.frozen !== other.frozen ||
      column.alignment !== other.alignment ||
      column.wrapText !== other.wrapText ||
      !sameColumnFormat(column.format, other.format) ||
      column.fieldPath.length !== other.fieldPath.length
    ) {
      return false;
    }
    return column.fieldPath.every((segment, segmentIndex) =>
      segment === other.fieldPath[segmentIndex]);
  });
}

function sameColumnFormat(
  left: BomColumnDefinition['format'],
  right: BomColumnDefinition['format'],
): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'text':
      return true;
    case 'date':
      return right.kind === 'date' && left.dateStyle === right.dateStyle;
    case 'datetime':
      return right.kind === 'datetime' &&
        left.dateStyle === right.dateStyle &&
        left.timeStyle === right.timeStyle;
    case 'integer':
      return right.kind === 'integer' && left.useGrouping === right.useGrouping;
    case 'decimal':
      return right.kind === 'decimal' &&
        left.minimumFractionDigits === right.minimumFractionDigits &&
        left.maximumFractionDigits === right.maximumFractionDigits &&
        left.useGrouping === right.useGrouping && left.unit === right.unit;
    case 'percent':
      return right.kind === 'percent' &&
        left.minimumFractionDigits === right.minimumFractionDigits &&
        left.maximumFractionDigits === right.maximumFractionDigits;
    case 'currency':
      return right.kind === 'currency' && left.currency === right.currency &&
        left.minimumFractionDigits === right.minimumFractionDigits &&
        left.maximumFractionDigits === right.maximumFractionDigits;
    case 'accounting':
      return right.kind === 'accounting' && left.currency === right.currency &&
        left.minimumFractionDigits === right.minimumFractionDigits &&
        left.maximumFractionDigits === right.maximumFractionDigits &&
        left.useGrouping === right.useGrouping;
    case 'scientific':
      return right.kind === 'scientific' &&
        left.minimumFractionDigits === right.minimumFractionDigits &&
        left.maximumFractionDigits === right.maximumFractionDigits;
    case 'fraction':
      return right.kind === 'fraction' &&
        left.maximumDenominator === right.maximumDenominator &&
        left.useGrouping === right.useGrouping;
  }
}

function sameColumnLayout(
  left: readonly Readonly<BomColumnDefinition>[],
  right: readonly Readonly<BomColumnDefinition>[],
): boolean {
  return left.length === right.length &&
    left.every((column, index) => column === right[index]);
}

const VIEW_QUERY_KEYS = new Set<PropertyKey>(['filters', 'sort']);
const VIEW_QUERY_FILTER_KEYS = new Set<PropertyKey>([
  'fieldPath',
  'operator',
  'value',
]);
const VIEW_QUERY_SORT_KEYS = new Set<PropertyKey>(['fieldPath', 'direction']);
const VIEW_QUERY_OPERATORS = new Set<VisibleQueryFilter['operator']>([
  'contains',
  'equals',
  'startsWith',
  'gt',
  'gte',
  'lt',
  'lte',
]);

function normalizeViewQuery(
  input: unknown,
  schema: BomSchema,
): Readonly<VisibleQueryOptions> | null {
  try {
    if (
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Reflect.ownKeys(input).some((key) => !VIEW_QUERY_KEYS.has(key))
    ) {
      return null;
    }
    const query = input as Readonly<Record<PropertyKey, unknown>>;
    const rawFilters = query['filters'];
    const rawSort = query['sort'];
    if (
      (rawFilters !== undefined && !Array.isArray(rawFilters)) ||
      (rawSort !== undefined && !Array.isArray(rawSort))
    ) {
      return null;
    }
    const schemaPaths = new Set(
      schema.fields.map((field) => viewQueryFieldPathKey(field.path)),
    );
    const filters: VisibleQueryFilter[] = [];
    for (const candidate of rawFilters ?? []) {
      if (
        candidate === null ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate) ||
        Reflect.ownKeys(candidate).some(
          (key) => !VIEW_QUERY_FILTER_KEYS.has(key),
        )
      ) {
        return null;
      }
      const filter = candidate as Readonly<Record<PropertyKey, unknown>>;
      const fieldPath = normalizeViewQueryFieldPath(
        filter['fieldPath'],
        schemaPaths,
      );
      const operator = filter['operator'];
      if (
        fieldPath === null ||
        typeof operator !== 'string' ||
        !VIEW_QUERY_OPERATORS.has(operator as VisibleQueryFilter['operator']) ||
        !Object.prototype.hasOwnProperty.call(filter, 'value')
      ) {
        return null;
      }
      const value = normalizeBomValue(filter['value']);
      if (!value.ok) return null;
      filters.push(Object.freeze({
        fieldPath,
        operator: operator as VisibleQueryFilter['operator'],
        value: value.value,
      }));
    }
    const sort: VisibleQuerySort[] = [];
    for (const candidate of rawSort ?? []) {
      if (
        candidate === null ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate) ||
        Reflect.ownKeys(candidate).some(
          (key) => !VIEW_QUERY_SORT_KEYS.has(key),
        )
      ) {
        return null;
      }
      const entry = candidate as Readonly<Record<PropertyKey, unknown>>;
      const fieldPath = normalizeViewQueryFieldPath(
        entry['fieldPath'],
        schemaPaths,
      );
      const direction = entry['direction'];
      if (
        fieldPath === null ||
        (direction !== 'asc' && direction !== 'desc')
      ) {
        return null;
      }
      sort.push(Object.freeze({ fieldPath, direction }));
    }
    return Object.freeze({
      ...(rawFilters === undefined ? {} : { filters: Object.freeze(filters) }),
      ...(rawSort === undefined ? {} : { sort: Object.freeze(sort) }),
    });
  } catch {
    return null;
  }
}

function normalizeViewQueryFieldPath(
  input: unknown,
  schemaPaths: ReadonlySet<string>,
): readonly string[] | null {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.some((part) => typeof part !== 'string' || part.length === 0)
  ) {
    return null;
  }
  const fieldPath = input as string[];
  return schemaPaths.has(viewQueryFieldPathKey(fieldPath))
    ? Object.freeze([...fieldPath])
    : null;
}

function viewQueryFieldPathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function visibleColumnDefinitions(
  columns: readonly Readonly<BomColumnDefinition>[],
): readonly Readonly<BomColumnDefinition>[] {
  return columns.filter((column) => column.visible !== false);
}

function fallbackAfterColumnVisibility(
  active: Readonly<BomCellAddress> | null,
  previousColumns: readonly Readonly<BomColumnDefinition>[],
  nextVisibleColumns: readonly Readonly<BomColumnDefinition>[],
): Readonly<BomCellAddress> | undefined {
  if (active === null) {
    return undefined;
  }
  const visibleIds = new Set(
    nextVisibleColumns.map((column) => column.columnId),
  );
  if (visibleIds.has(active.columnId)) {
    return undefined;
  }
  const activeIndex = previousColumns.findIndex(
    (column) => column.columnId === active.columnId,
  );
  if (activeIndex < 0) {
    return undefined;
  }
  for (let distance = 1; distance < previousColumns.length; distance += 1) {
    const nextIndex = activeIndex + distance;
    if (
      nextIndex < previousColumns.length &&
      visibleIds.has(previousColumns[nextIndex]!.columnId)
    ) {
      return Object.freeze({
        occurrenceId: active.occurrenceId,
        columnId: previousColumns[nextIndex]!.columnId,
      });
    }
    const previousIndex = activeIndex - distance;
    if (
      previousIndex >= 0 &&
      visibleIds.has(previousColumns[previousIndex]!.columnId)
    ) {
      return Object.freeze({
        occurrenceId: active.occurrenceId,
        columnId: previousColumns[previousIndex]!.columnId,
      });
    }
  }
  return undefined;
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
      return other !== undefined && sameRange(range, other);
    });
}

function sameNullableAddress(
  left: Readonly<BomCellAddress> | null,
  right: Readonly<BomCellAddress> | null,
): boolean {
  return (left === null && right === null) ||
    (left !== null && right !== null && sameAddress(left, right));
}

function isStructuralOperation(operation: BomOperation): boolean {
  return (
    operation.op === 'insertNode' ||
    operation.op === 'deleteSubtree' ||
    operation.op === 'moveSubtree' ||
    operation.op === 'reorder' ||
    operation.op === 'rebalancePositions'
  );
}

function invalidationForPatch<TFields extends BomFields>(
  patch: BomPatch<TFields>,
  columns: readonly Readonly<BomColumnDefinition>[],
): Readonly<BomCanvasInvalidation> {
  if (patch.operations.some(isStructuralOperation)) {
    return Object.freeze({ layoutChanged: true });
  }

  const cells: Readonly<BomCellAddress>[] = [];
  const seen = new Set<string>();
  for (const operation of patch.operations) {
    if (operation.op !== 'updateField' && operation.op !== 'unsetField') {
      continue;
    }
    for (const column of columns) {
      if (!samePath(column.fieldPath, operation.fieldPath)) {
        continue;
      }
      const key = operation.occurrenceId + '\u0000' + column.columnId;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      cells.push(
        Object.freeze({
          occurrenceId: operation.occurrenceId,
          columnId: column.columnId,
        }),
      );
    }
  }
  return Object.freeze({
    dirtyCells: Object.freeze(cells),
    layers: Object.freeze(['content', 'interaction'] as const),
  });
}

function normalizeClipboardPolicy(
  input: unknown,
): BomClipboardPolicy | undefined | null {
  if (input === undefined) {
    return undefined;
  }
  try {
    return typeof (input as { readonly authorize?: unknown }).authorize ===
      'function'
      ? (input as BomClipboardPolicy)
      : null;
  } catch {
    return null;
  }
}

function normalizeExportPolicy(
  input: unknown,
): BomExportPolicy | undefined | null {
  if (input === undefined) {
    return undefined;
  }
  try {
    return typeof (input as { readonly authorize?: unknown }).authorize ===
      'function'
      ? (input as BomExportPolicy)
      : null;
  } catch {
    return null;
  }
}

function importReport<TFields extends BomFields>(
  taskId: string,
  error?: BomError,
  cellDiagnostics: readonly BomImportCellDiagnostic[] = [],
): BomImportReport<TFields> {
  return Object.freeze({
    taskId,
    diagnostics: Object.freeze(error === undefined ? [] : [error]),
    cellDiagnostics: Object.freeze([...cellDiagnostics]),
  });
}

function importCellDiagnostic(
  sourceRow: number,
  sourceColumn: number,
  code: string,
  fieldId?: string,
  sheetName?: string,
): BomImportCellDiagnostic {
  return Object.freeze({
    ...(sheetName === undefined ? {} : { sheetName }),
    sourceRow,
    sourceColumn,
    ...(fieldId === undefined ? {} : { fieldId }),
    code,
    messageKey: 'bom.import.cell.' + code,
  });
}

function importCellDiagnosticsForSheet(
  diagnostics: readonly BomImportCellDiagnostic[],
  sheetName: string | undefined,
): readonly BomImportCellDiagnostic[] {
  if (sheetName === undefined || diagnostics.length === 0) {
    return Object.freeze([...diagnostics]);
  }
  return Object.freeze(diagnostics.map((diagnostic) =>
    Object.freeze({ ...diagnostic, sheetName }),
  ));
}

function importCellDiagnosticsFromPaste(
  diagnostics: readonly BomPasteCellDiagnostic[],
  sources: readonly Readonly<ImportRowSource>[],
): readonly BomImportCellDiagnostic[] {
  return Object.freeze(diagnostics.map((diagnostic) => {
    const source = sources[diagnostic.sourceRow];
    const sourceColumn = source?.sourceColumns[diagnostic.sourceColumn];
    return importCellDiagnostic(
      source?.sourceRow ?? diagnostic.sourceRow,
      sourceColumn ?? diagnostic.sourceColumn,
      diagnostic.code,
      diagnostic.fieldId,
    );
  }));
}

function importProposedPatch<TFields extends BomFields>(
  preparation: Readonly<PastePreparation>,
  state: Readonly<PublishedState<TFields>>,
  protocolVersion: string,
  transactionId: string,
  hierarchyCommands: readonly BomCommand<TFields>[] = [],
): Readonly<BomPatch<TFields>> {
  const fieldOperations: readonly BomOperation<TFields>[] = preparation.cells.map((entry) => Object.freeze({
    op: 'updateField' as const,
    occurrenceId: entry.requestCell.address.occurrenceId,
    fieldPath: Object.freeze([...entry.fieldPath]),
    value: entry.requestCell.value,
  }));
  const hierarchyOperations = previewHierarchyOperations(hierarchyCommands, state);
  return Object.freeze({
    protocolVersion,
    documentId: state.snapshot.documentId,
    baseRevision: state.snapshot.revision,
    transactionId,
    origin: 'editor:import',
    timestamp: new Date().toISOString(),
    operations: Object.freeze([...fieldOperations, ...hierarchyOperations]),
  });
}

function previewHierarchyOperations<TFields extends BomFields>(
  commands: readonly BomCommand<TFields>[],
  state: Readonly<PublishedState<TFields>>,
): readonly BomOperation<TFields>[] {
  if (commands.length === 0) return Object.freeze([]);
  const parentById = new Map<OccurrenceId, OccurrenceId | null>();
  const positionById = new Map<OccurrenceId, string>();
  const childrenByParent = new Map<string, OccurrenceId[]>();
  const parentKey = (parentId: OccurrenceId | null): string => parentId ?? '\u0000';
  for (const node of state.snapshot.nodes) {
    parentById.set(node.occurrenceId, node.parentId);
    positionById.set(node.occurrenceId, node.positionKey);
    const children = childrenByParent.get(parentKey(node.parentId)) ?? [];
    children.push(node.occurrenceId);
    childrenByParent.set(parentKey(node.parentId), children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => comparePositionKeys(positionById.get(left)!, positionById.get(right)!));
  }
  const operations: BomOperation<TFields>[] = [];
  for (const command of commands) {
    if (command.type !== 'moveSubtree') continue;
    const currentParent = parentById.get(command.occurrenceId);
    if (currentParent === undefined) continue;
    const currentSiblings = childrenByParent.get(parentKey(currentParent)) ?? [];
    const currentIndex = currentSiblings.indexOf(command.occurrenceId);
    if (currentIndex >= 0) currentSiblings.splice(currentIndex, 1);
    const nextSiblings = childrenByParent.get(parentKey(command.newParentId)) ?? [];
    childrenByParent.set(parentKey(command.newParentId), nextSiblings);
    const leftId = nextSiblings.at(-1);
    const generated = createPositionKeyBetween(
      leftId === undefined ? null : positionById.get(leftId) ?? null,
      null,
    );
    const positionKey = generated.ok
      ? generated.value
      : positionById.get(command.occurrenceId) ?? 'M';
    parentById.set(command.occurrenceId, command.newParentId);
    positionById.set(command.occurrenceId, positionKey);
    nextSiblings.push(command.occurrenceId);
    nextSiblings.sort((left, right) => comparePositionKeys(positionById.get(left)!, positionById.get(right)!));
    operations.push(Object.freeze({
      op: 'moveSubtree' as const,
      occurrenceId: command.occurrenceId,
      newParentId: command.newParentId,
      positionKey,
    }));
  }
  return Object.freeze(operations);
}

function normalizeExportDecision(
  input: unknown,
  requestedFieldIds: readonly string[],
): ExportAuthorization {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return { status: 'invalid' };
    }
    const decision = input as {
      readonly decisionId?: unknown;
      readonly allowed?: unknown;
      readonly fieldIds?: unknown;
      readonly maskingByFieldId?: unknown;
      readonly reasonCode?: unknown;
    };
    const decisionId = safeAuditToken(decision.decisionId);
    const reasonCode = decision.reasonCode === undefined
      ? undefined
      : safeAuditToken(decision.reasonCode);
    if (
      decisionId === undefined ||
      typeof decision.allowed !== 'boolean' ||
      (decision.reasonCode !== undefined && reasonCode === undefined)
    ) {
      return { status: 'invalid' };
    }
    if (!decision.allowed) {
      return {
        status: 'denied',
        ...(reasonCode === undefined ? {} : { reasonCode }),
      };
    }
    const requested = new Set(requestedFieldIds);
    const allowedFieldIds = new Set<string>();
    if (decision.fieldIds === undefined) {
      for (const fieldId of requestedFieldIds) allowedFieldIds.add(fieldId);
    } else {
      if (!Array.isArray(decision.fieldIds)) return { status: 'invalid' };
      for (const fieldId of decision.fieldIds) {
        if (
          typeof fieldId !== 'string' ||
          !requested.has(fieldId) ||
          allowedFieldIds.has(fieldId)
        ) {
          return { status: 'invalid' };
        }
        allowedFieldIds.add(fieldId);
      }
    }
    const maskingByFieldId = new Map<string, BomClipboardMasking>();
    if (decision.maskingByFieldId !== undefined) {
      if (
        typeof decision.maskingByFieldId !== 'object' ||
        decision.maskingByFieldId === null ||
        Array.isArray(decision.maskingByFieldId)
      ) {
        return { status: 'invalid' };
      }
      for (const [fieldId, masking] of Object.entries(
        decision.maskingByFieldId,
      )) {
        if (
          !allowedFieldIds.has(fieldId) ||
          (masking !== 'omit' && masking !== 'redact' && masking !== 'hash')
        ) {
          return { status: 'invalid' };
        }
        maskingByFieldId.set(fieldId, masking);
      }
    }
    return {
      status: 'allowed',
      decisionId,
      allowedFieldIds,
      maskingByFieldId,
    };
  } catch {
    return { status: 'invalid' };
  }
}

async function readImportSource(
  source: BomImportSource,
  maxBytes: number,
  signal?: AbortSignal,
  binary = false,
): Promise<ImportSourceReadResult> {
  if (signal?.aborted) return { status: 'aborted' };
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const append = (chunk: Uint8Array): ImportSourceReadResult | undefined => {
    if (signal?.aborted) return { status: 'aborted' };
    if (chunk.byteLength > maxBytes - totalBytes) {
      return {
        ok: false,
        error: editorError(BOM_EDITOR_ERROR_CODES.importLimit, 'SECURITY_LIMIT', {
          reason: 'input-too-large',
        }),
      };
    }
    if (chunk.byteLength > 0) chunks.push(chunk);
    totalBytes += chunk.byteLength;
    return undefined;
  };
  try {
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
      const bytes = new Uint8Array(await source.arrayBuffer());
      const failure = append(bytes);
      if (failure !== undefined) return failure;
    } else if (source instanceof ArrayBuffer) {
      const failure = append(new Uint8Array(source));
      if (failure !== undefined) return failure;
    } else if (isReadableByteStream(source)) {
      const reader = source.getReader();
      try {
        for (;;) {
          if (signal?.aborted) {
            await reader.cancel();
            return { status: 'aborted' };
          }
          const next = await reader.read();
          if (next.done) break;
          if (!(next.value instanceof Uint8Array)) {
            await reader.cancel();
            return {
              ok: false,
              error: editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'DATA', {
                reason: 'source-chunk-invalid',
              }),
            };
          }
          const failure = append(next.value);
          if (failure !== undefined) {
            await reader.cancel();
            return failure;
          }
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      return {
        ok: false,
        error: editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'CONFIG', {
          reason: 'source-invalid',
        }),
      };
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return {
      ok: true,
      text: binary ? '' : decoder.decode(bytes),
      bytes,
      inputBytes: totalBytes,
    };
  } catch {
    return {
      ok: false,
      error: editorError(BOM_EDITOR_ERROR_CODES.importInvalid, 'DATA', {
        reason: 'source-read-failed',
      }),
    };
  }
}

function isReadableByteStream(
  value: unknown,
): value is ReadableStream<Uint8Array> {
  try {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { readonly getReader?: unknown }).getReader === 'function'
    );
  } catch {
    return false;
  }
}

function escapeDelimitedCell(text: string, delimiter: ',' | '\t'): string {
  const needsQuotes = text.includes(delimiter) || /[\r\n"]/u.test(text);
  return needsQuotes ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

function normalizePastePolicy(
  input: unknown,
): BomPastePolicy | undefined | null {
  if (input === undefined) {
    return undefined;
  }
  try {
    return typeof (input as { readonly authorize?: unknown }).authorize ===
      'function'
      ? (input as BomPastePolicy)
      : null;
  } catch {
    return null;
  }
}

function normalizePasteLimits(
  input: unknown,
): Readonly<BomPasteLimits> | null {
  if (input === undefined) {
    return DEFAULT_PASTE_LIMITS;
  }
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return null;
    }
    const limits = input as Partial<BomPasteLimits>;
    const maxBytes = normalizePasteLimit(
      limits.maxBytes,
      DEFAULT_PASTE_LIMITS.maxBytes,
    );
    const maxRows = normalizePasteLimit(
      limits.maxRows,
      DEFAULT_PASTE_LIMITS.maxRows,
    );
    const maxColumns = normalizePasteLimit(
      limits.maxColumns,
      DEFAULT_PASTE_LIMITS.maxColumns,
    );
    const maxCells = normalizePasteLimit(
      limits.maxCells,
      DEFAULT_PASTE_LIMITS.maxCells,
    );
    const maxCellBytes = normalizePasteLimit(
      limits.maxCellBytes,
      DEFAULT_PASTE_LIMITS.maxCellBytes,
    );
    if (
      maxBytes === null ||
      maxRows === null ||
      maxColumns === null ||
      maxCells === null ||
      maxCellBytes === null
    ) {
      return null;
    }
    return Object.freeze({
      maxBytes,
      maxRows,
      maxColumns,
      maxCells,
      maxCellBytes,
    });
  } catch {
    return null;
  }
}

function normalizeEditNavigation(
  input: unknown,
): Readonly<BomEditNavigation> | null {
  if (input === undefined) {
    return DEFAULT_EDIT_NAVIGATION;
  }
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return null;
    }
    const navigation = input as Partial<BomEditNavigation>;
    const enter = navigation.enter ?? DEFAULT_EDIT_NAVIGATION.enter;
    const tab = navigation.tab ?? DEFAULT_EDIT_NAVIGATION.tab;
    if (
      (enter !== 'down' && enter !== 'none') ||
      (tab !== 'next-editable' && tab !== 'none')
    ) {
      return null;
    }
    return Object.freeze({ enter, tab });
  } catch {
    return null;
  }
}

function normalizePasteLimit(
  value: unknown,
  fallback: number,
): number | null {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0
    ? value
    : null;
}

function normalizeXlsxLimitOverride(
  input: unknown,
): Readonly<BomXlsxImportLimits> | undefined | null {
  if (input === undefined) return undefined;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const candidate = input as Record<string, unknown>;
  const keys = [
    'maxBytes',
    'maxRows',
    'maxColumns',
    'maxCells',
    'maxCellBytes',
    'maxEntries',
    'maxSheets',
    'maxUncompressedBytes',
  ] as const;
  const output: Record<string, number> = {};
  for (const key of keys) {
    const value = candidate[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || (value as number) <= 0) return null;
    output[key] = value as number;
  }
  return Object.freeze(output) as Readonly<BomXlsxImportLimits>;
}

function xlsxLimits(
  limits: Readonly<BomPasteLimits>,
  override?: Readonly<BomXlsxImportLimits>,
): Readonly<XlsxLimits> {
  const bounded = (base: number, requested: number | undefined): number =>
    requested === undefined ? base : Math.min(base, requested);
  const defaultUncompressed = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(limits.maxBytes, limits.maxBytes * 8),
  );
  return Object.freeze({
    maxBytes: bounded(limits.maxBytes, override?.maxBytes),
    maxRows: bounded(limits.maxRows, override?.maxRows),
    maxColumns: bounded(limits.maxColumns, override?.maxColumns),
    maxCells: bounded(limits.maxCells, override?.maxCells),
    maxCellBytes: bounded(limits.maxCellBytes, override?.maxCellBytes),
    maxEntries: bounded(512, override?.maxEntries),
    maxSheets: bounded(32, override?.maxSheets),
    maxUncompressedBytes: bounded(defaultUncompressed, override?.maxUncompressedBytes),
  });
}

function normalizePasteInput(input: unknown): BomPasteInput | null {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return null;
    }
    const candidate = input as {
      readonly internal?: unknown;
      readonly html?: unknown;
      readonly text?: unknown;
      readonly textStream?: unknown;
    };
    let present = false;
    let internal: string | undefined;
    let html: string | undefined;
    let text: string | undefined;
    let textStream: AsyncIterable<string> | undefined;
    if (Object.hasOwn(candidate, 'internal')) {
      if (typeof candidate.internal !== 'string') return null;
      internal = candidate.internal;
      present = true;
    }
    if (Object.hasOwn(candidate, 'html')) {
      if (typeof candidate.html !== 'string') return null;
      html = candidate.html;
      present = true;
    }
    if (Object.hasOwn(candidate, 'text')) {
      if (typeof candidate.text !== 'string') return null;
      text = candidate.text;
      present = true;
    }
    if (Object.hasOwn(candidate, 'textStream')) {
      if (
        text !== undefined ||
        typeof candidate.textStream !== 'object' ||
        candidate.textStream === null
      ) {
        return null;
      }
      const iterator = (candidate.textStream as {
        readonly [Symbol.asyncIterator]?: unknown;
      })[Symbol.asyncIterator];
      if (typeof iterator !== 'function') return null;
      textStream = candidate.textStream as AsyncIterable<string>;
      present = true;
    }
    return present
      ? Object.freeze({
          ...(internal === undefined ? {} : { internal }),
          ...(html === undefined ? {} : { html }),
          ...(text === undefined ? {} : { text }),
          ...(textStream === undefined ? {} : { textStream }),
        })
      : null;
  } catch {
    return null;
  }
}

function safeAuditToken(value: unknown): string | undefined {
  return typeof value === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value)
    ? value
    : undefined;
}

function normalizePasteDecision(
  input: unknown,
  cells: readonly Readonly<BomPasteCell>[],
): PasteAuthorization {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return { status: 'invalid' };
    }
    const decision = input as {
      readonly decisionId?: unknown;
      readonly allowed?: unknown;
      readonly reasonCode?: unknown;
      readonly deniedCells?: unknown;
    };
    const decisionId = safeAuditToken(decision.decisionId);
    const reasonCode = decision.reasonCode === undefined
      ? undefined
      : safeAuditToken(decision.reasonCode);
    if (
      decisionId === undefined ||
      typeof decision.allowed !== 'boolean' ||
      (decision.reasonCode !== undefined &&
        reasonCode === undefined)
    ) {
      return { status: 'invalid' };
    }
    const byCoordinate = new Map<string, Readonly<BomPasteCell>>();
    for (const cell of cells) {
      byCoordinate.set(pasteCoordinateKey(cell.sourceRow, cell.sourceColumn), cell);
    }
    const diagnostics: BomPasteCellDiagnostic[] = [];
    if (decision.deniedCells !== undefined) {
      if (!Array.isArray(decision.deniedCells)) {
        return { status: 'invalid' };
      }
      const seen = new Set<string>();
      for (const candidate of decision.deniedCells) {
        if (
          typeof candidate !== 'object' ||
          candidate === null ||
          Array.isArray(candidate)
        ) {
          return { status: 'invalid' };
        }
        const rejected = candidate as {
          readonly sourceRow?: unknown;
          readonly sourceColumn?: unknown;
          readonly reasonCode?: unknown;
        };
        const rejectionReasonCode = rejected.reasonCode === undefined
          ? undefined
          : safeAuditToken(rejected.reasonCode);
        if (
          !Number.isSafeInteger(rejected.sourceRow) ||
          (rejected.sourceRow as number) < 0 ||
          !Number.isSafeInteger(rejected.sourceColumn) ||
          (rejected.sourceColumn as number) < 0 ||
          (rejected.reasonCode !== undefined &&
            rejectionReasonCode === undefined)
        ) {
          return { status: 'invalid' };
        }
        const key = pasteCoordinateKey(
          rejected.sourceRow as number,
          rejected.sourceColumn as number,
        );
        const cell = byCoordinate.get(key);
        if (cell === undefined || seen.has(key)) {
          return { status: 'invalid' };
        }
        seen.add(key);
        diagnostics.push(
          Object.freeze({
            sourceRow: cell.sourceRow,
            sourceColumn: cell.sourceColumn,
            code: rejectionReasonCode ?? 'policy-denied',
            address: cell.address,
            fieldId: cell.fieldId,
          }),
        );
      }
    }
    if (!decision.allowed || diagnostics.length > 0) {
      return {
        status: 'denied',
        decisionId,
        ...(reasonCode === undefined
          ? { reasonCode: 'policy-denied' }
          : { reasonCode }),
        diagnostics: Object.freeze(diagnostics),
      };
    }
    return {
      status: 'allowed',
      decisionId,
    };
  } catch {
    return { status: 'invalid' };
  }
}

function pasteCoordinateKey(row: number, column: number): string {
  return String(row) + '\u0000' + String(column);
}

function pastePreparationFailure(
  error: BomError,
  diagnostics: readonly BomPasteCellDiagnostic[],
  format?: BomPasteFormat,
  rowCount?: number,
  columnCount?: number,
  detail: Readonly<{
    readonly documentId?: string;
    readonly documentGeneration?: number;
    readonly outcome?: 'denied' | 'failed';
    readonly decisionId?: string;
    readonly reasonCode?: string;
  }> = {},
): PastePreparationResult {
  return Object.freeze({
    ok: false,
    error,
    diagnostics: Object.freeze([...diagnostics]),
    ...(format === undefined ? {} : { format }),
    ...(rowCount === undefined ? {} : { rowCount }),
    ...(columnCount === undefined ? {} : { columnCount }),
    ...(detail.documentId === undefined
      ? {}
      : { documentId: detail.documentId }),
    ...(detail.documentGeneration === undefined
      ? {}
      : { documentGeneration: detail.documentGeneration }),
    ...(detail.outcome === undefined ? {} : { outcome: detail.outcome }),
    ...(detail.decisionId === undefined
      ? {}
      : { decisionId: detail.decisionId }),
    ...(detail.reasonCode === undefined
      ? {}
      : { reasonCode: detail.reasonCode }),
  });
}

function pasteDiagnosticsFromClipboard(
  diagnostics: readonly ClipboardParseDiagnostic[] | undefined,
): readonly BomPasteCellDiagnostic[] {
  if (diagnostics === undefined || diagnostics.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze(
    diagnostics.map((entry) =>
      Object.freeze({
        sourceRow: Math.max(0, entry.sourceRow),
        sourceColumn: Math.max(0, entry.sourceColumn),
        code: entry.code,
      }),
    ),
  );
}

/**
 * A clipboard event can contain several independent representations of the
 * same user action. Keep trying lower-priority safe candidates, but make a
 * final rejection diagnosable without exposing any original cell value.
 */
function aggregatePasteCandidateFailures(
  failures: readonly PasteCandidateFailure[],
): Extract<PasteCandidateResult, { readonly status: 'failed' }> {
  const firstLimitFailure = failures.find((failure) => failure.limit);
  const primary = firstLimitFailure ?? failures[0]!;
  const aggregate = failures.length > 1;
  const diagnostics = aggregate
    ? aggregatePasteCandidateDiagnostics(failures)
    : Object.freeze([...primary.diagnostics]);
  return Object.freeze({
    status: 'failed',
    inputBytes: primary.inputBytes,
    ...(primary.format === undefined ? {} : { format: primary.format }),
    reason: aggregate ? 'all-candidates-failed' : primary.reason,
    limit: primary.limit,
    ...(diagnostics.length === 0 ? {} : { diagnostics }),
  });
}

function aggregatePasteCandidateDiagnostics(
  failures: readonly PasteCandidateFailure[],
): readonly BomPasteCellDiagnostic[] {
  const diagnostics: BomPasteCellDiagnostic[] = [];
  let truncated = false;
  const detailLimit = MAX_PASTE_CANDIDATE_DIAGNOSTICS - 1;
  for (const failure of failures) {
    const entries = failure.diagnostics.length === 0
      ? Object.freeze([
          Object.freeze({
            sourceRow: 0,
            sourceColumn: 0,
            code: failure.reason,
          } satisfies BomPasteCellDiagnostic),
        ])
      : failure.diagnostics;
    for (const entry of entries) {
      if (diagnostics.length >= detailLimit) {
        truncated = true;
        break;
      }
      diagnostics.push(Object.freeze({
        ...entry,
        candidateFormat: failure.candidateFormat,
      }));
    }
    if (truncated) break;
  }
  if (truncated) {
    diagnostics.push(Object.freeze({
      sourceRow: 0,
      sourceColumn: 0,
      code: 'diagnostics-truncated',
    }));
  }
  return Object.freeze(diagnostics);
}

function isClipboardTextLimitFailure(
  reason: ClipboardTextParseFailureReason,
): boolean {
  return reason !== 'malformed';
}

function isInternalClipboardLimitFailure(
  reason: InternalClipboardParseFailureReason,
): boolean {
  return (
    reason === 'input-too-large' ||
    reason === 'too-many-rows' ||
    reason === 'too-many-columns' ||
    reason === 'too-many-cells' ||
    reason === 'cell-too-large'
  );
}

function isHtmlClipboardLimitFailure(
  reason: HtmlClipboardParseFailureReason,
): boolean {
  return reason !== 'malformed';
}

function pasteFailureReasonCode(error: BomError): string {
  const reason = error.safeContext?.['reason'];
  return safeAuditToken(reason) ?? safeAuditToken(error.code) ?? 'paste-failed';
}

function cutFailureReasonCode(error: BomError): string {
  const reason = error.safeContext?.['reason'];
  return safeAuditToken(reason) ?? safeAuditToken(error.code) ?? 'cut-failed';
}

function combineAbortSignals(
  ...signals: readonly (AbortSignal | undefined)[]
): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  const activeSignals: AbortSignal[] = [];
  const abort = (): void => controller.abort();
  for (const signal of signals) {
    if (signal === undefined) continue;
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
    activeSignals.push(signal);
  }
  return {
    signal: controller.signal,
    dispose: (): void => {
      for (const signal of activeSignals) {
        signal.removeEventListener('abort', abort);
      }
    },
  };
}

function yieldPastePreparation(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (continued: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      signal?.removeEventListener('abort', onAbort);
      resolve(continued);
    };
    const onAbort = (): void => finish(false);
    timer = setTimeout(() => finish(true), 0);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }
  });
}

function boundedUtf8ByteLength(text: string, maxBytes: number): number {
  let bytes = 0;
  for (let index = 0; index < text.length; ) {
    const codeUnit = text.charCodeAt(index);
    let width = 1;
    let byteLength = 3;
    if (codeUnit <= 0x7f) {
      byteLength = 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength = 2;
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < text.length
    ) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        byteLength = 4;
        width = 2;
      }
    }
    if (bytes > maxBytes - byteLength) {
      return maxBytes === Number.MAX_SAFE_INTEGER ? maxBytes : maxBytes + 1;
    }
    bytes += byteLength;
    index += width;
  }
  return bytes;
}

function normalizeClipboardDecision(
  input: unknown,
  requestedFieldIds: readonly string[],
): ClipboardAuthorization {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return { status: 'invalid' };
    }
    const decision = input as {
      readonly decisionId?: unknown;
      readonly allowed?: unknown;
      readonly fieldIds?: unknown;
      readonly maskingByFieldId?: unknown;
      readonly reasonCode?: unknown;
    };
    const decisionId = safeAuditToken(decision.decisionId);
    const reasonCode = decision.reasonCode === undefined
      ? undefined
      : safeAuditToken(decision.reasonCode);
    if (
      decisionId === undefined ||
      typeof decision.allowed !== 'boolean' ||
      (decision.reasonCode !== undefined &&
        reasonCode === undefined)
    ) {
      return { status: 'invalid' };
    }
    if (!decision.allowed) {
      return {
        status: 'denied',
        decisionId,
        ...(reasonCode === undefined
          ? {}
          : { reasonCode }),
      };
    }
    const requested = new Set(requestedFieldIds);
    const allowedFieldIds = new Set<string>();
    if (decision.fieldIds === undefined) {
      for (const fieldId of requestedFieldIds) {
        allowedFieldIds.add(fieldId);
      }
    } else {
      if (!Array.isArray(decision.fieldIds)) {
        return { status: 'invalid' };
      }
      for (const fieldId of decision.fieldIds) {
        if (
          typeof fieldId !== 'string' ||
          !requested.has(fieldId) ||
          allowedFieldIds.has(fieldId)
        ) {
          return { status: 'invalid' };
        }
        allowedFieldIds.add(fieldId);
      }
    }
    const maskingByFieldId = new Map<string, BomClipboardMasking>();
    if (decision.maskingByFieldId !== undefined) {
      if (
        typeof decision.maskingByFieldId !== 'object' ||
        decision.maskingByFieldId === null ||
        Array.isArray(decision.maskingByFieldId)
      ) {
        return { status: 'invalid' };
      }
      for (const [fieldId, masking] of Object.entries(
        decision.maskingByFieldId,
      )) {
        if (
          !allowedFieldIds.has(fieldId) ||
          (masking !== 'omit' && masking !== 'redact' && masking !== 'hash')
        ) {
          return { status: 'invalid' };
        }
        maskingByFieldId.set(fieldId, masking);
      }
    }
    return {
      status: 'allowed',
      decisionId,
      allowedFieldIds,
      maskingByFieldId,
    };
  } catch {
    return { status: 'invalid' };
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique;
}

function clipboardCellText(
  value: BomValue | undefined,
  fieldId: string,
  masking: BomClipboardMasking | undefined,
): string {
  if (masking === 'omit') {
    return '';
  }
  if (masking === 'redact') {
    return '[REDACTED]';
  }
  if (value === undefined) {
    return '';
  }
  if (masking === 'hash') {
    const canonical: BomValue = {
      fieldId,
      value,
    };
    return 'sha256:' + sha256Hex(
      'bom:clipboard-mask:v1\0' + encodeCanonicalValue(canonical),
    );
  }
  return formatEditorValue(value);
}

function safeSpreadsheetText(text: string): string {
  return /^\s*[=+\-@]/u.test(text) ? "'" + text : text;
}

function escapeClipboardTsvCell(text: string): string {
  return /[\t\r\n"]/u.test(text)
    ? '"' + text.replace(/"/gu, '""') + '"'
    : text;
}

function escapeClipboardHtmlCell(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function fieldValue(
  fields: BomFields,
  path: readonly string[],
): BomValue | undefined {
  let current: BomValue | undefined = fields;
  for (const segment of path) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = (current as Readonly<Record<string, BomValue>>)[segment];
  }
  return current;
}

interface NestedFieldLookup {
  readonly present: boolean;
  readonly value?: BomValue;
}

function readNestedField(
  fields: BomFields,
  path: readonly string[],
): NestedFieldLookup {
  let current: BomValue = fields;
  for (const segment of path) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { present: false };
    }
    current = (current as Readonly<Record<string, BomValue>>)[segment]!;
  }
  return { present: true, value: current };
}

function validationIssue(
  error: Readonly<BomError>,
  occurrenceId: OccurrenceId | undefined,
  fieldPath: readonly string[] | undefined,
  rulePrefix: string,
  ordinal: number,
): BomValidationIssue {
  const ruleId = rulePrefix + '.' + error.code.toLowerCase();
  const occurrence = occurrenceId ?? '$document';
  const field = fieldPath === undefined ? '' : fieldPath.join('.');
  return Object.freeze({
    issueId: ruleId + ':' + occurrence + ':' + field + ':' + String(ordinal),
    ruleId,
    severity: 'error' as const,
    ...(occurrenceId === undefined ? {} : { occurrenceId }),
    ...(fieldPath === undefined
      ? {}
      : { fieldPath: Object.freeze([...fieldPath]) }),
    messageKey: error.messageKey,
    ...(error.messageParams === undefined
      ? {}
      : { messageParams: Object.freeze({ ...error.messageParams }) }),
  });
}

function sameValidationIssues(
  left: readonly Readonly<BomValidationIssue>[],
  right: readonly Readonly<BomValidationIssue>[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a === undefined ||
      b === undefined ||
      a.issueId !== b.issueId ||
      a.ruleId !== b.ruleId ||
      a.ruleVersion !== b.ruleVersion ||
      a.severity !== b.severity ||
      a.occurrenceId !== b.occurrenceId ||
      a.messageKey !== b.messageKey ||
      a.valueDigest !== b.valueDigest ||
      (a.fieldPath?.join('\u0001') ?? '') !== (b.fieldPath?.join('\u0001') ?? '')
    ) {
      return false;
    }
    const aParams = a.messageParams;
    const bParams = b.messageParams;
    const aKeys = aParams === undefined ? [] : Object.keys(aParams).sort();
    const bKeys = bParams === undefined ? [] : Object.keys(bParams).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let keyIndex = 0; keyIndex < aKeys.length; keyIndex += 1) {
      const key = aKeys[keyIndex];
      if (key === undefined || key !== bKeys[keyIndex] ||
          aParams?.[key] !== bParams?.[key]) {
        return false;
      }
    }
  }
  return true;
}

function numericFillValue(value: BomValue | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'object' && value !== null && !Array.isArray(value) &&
      ('$type' in value) && ('value' in value) &&
      (value.$type === 'integer' || value.$type === 'decimal')) {
    const parsed = Number(value.value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

interface TemporalFillSource {
  readonly valueAt: (index: number) => BomValue;
}

function temporalFillSource(
  first: BomValue | undefined,
  second: BomValue | undefined,
  kind: BomFieldSchema['type']['kind'],
): TemporalFillSource | undefined {
  if (kind === 'date') {
    const firstDay = isoDateEpoch(first);
    const secondDay = isoDateEpoch(second);
    if (firstDay === undefined || secondDay === undefined) return undefined;
    const dayStep = Math.round((secondDay - firstDay) / ISO_DAY_MS);
    return Object.freeze({
      valueAt: (index: number): BomValue => isoDateFromEpoch(
        secondDay + dayStep * (index - 1) * ISO_DAY_MS,
      ),
    });
  }
  if (kind === 'datetime') {
    const firstInstant = isoInstantEpoch(first);
    const secondInstant = isoInstantEpoch(second);
    if (firstInstant === undefined || secondInstant === undefined) return undefined;
    const instantStep = secondInstant - firstInstant;
    return Object.freeze({
      valueAt: (index: number): BomValue => new Date(
        secondInstant + instantStep * (index - 1),
      ).toISOString(),
    });
  }
  return undefined;
}

const ISO_DAY_MS = 24 * 60 * 60 * 1000;

function isoDateEpoch(value: BomValue | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isGregorianDate(year, month, day)) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 100) date.setUTCFullYear(year);
  return date.getTime();
}

function isoDateFromEpoch(epoch: number): string {
  const date = new Date(epoch);
  return date.toISOString().slice(0, 10);
}

function isoInstantEpoch(value: BomValue | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/u.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    !isGregorianDate(year, month, day) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) return undefined;
  const milliseconds = match[7] === undefined
    ? 0
    : Number(`0.${match[7]}`) * 1000;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, milliseconds));
  if (year < 100) date.setUTCFullYear(year);
  return Number.isFinite(date.getTime()) ? date.getTime() : undefined;
}

function isGregorianDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1) {
    return false;
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}

function seriesFillValue(source: BomValue, value: number): BomValue {
  if (typeof source === 'object' && source !== null && !Array.isArray(source) && '$type' in source) {
    if (source.$type === 'integer') return Object.freeze({ $type: 'integer' as const, value: String(Math.trunc(value)) });
    if (source.$type === 'decimal') return Object.freeze({ $type: 'decimal' as const, value: String(value) });
  }
  return value;
}

function findSchemaField(
  schema: BomSchema,
  path: readonly string[],
): BomFieldSchema | undefined {
  return schema.fields.find((field) => samePath(field.path, path));
}

function samePath(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function sameAddress(
  left: Readonly<BomCellAddress>,
  right: Readonly<BomCellAddress>,
): boolean {
  return (
    left.occurrenceId === right.occurrenceId &&
    left.columnId === right.columnId
  );
}

type NormalizedMaterialMatchRequest<TFields extends BomFields> = Readonly<
  Omit<BomMaterialMatchRequest<TFields>, 'limit'> & {
    readonly limit: number;
  }
>;

function normalizeMaterialMatchRequest<TFields extends BomFields>(
  input: Readonly<BomMaterialMatchRequest<TFields>>,
): NormalizedMaterialMatchRequest<TFields> | null {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return null;
    }
    const request = input as Readonly<Record<string, unknown>>;
    if (typeof request['query'] !== 'string') return null;
    const limit = request['limit'] ?? 50;
    if (
      typeof limit !== 'number' ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 1_000
    ) return null;

    const fieldPaths = normalizeMaterialMatchPaths(request['fieldPaths']);
    if (fieldPaths === null) return null;
    const specificationPaths = normalizeMaterialMatchPaths(
      request['specificationPaths'],
    );
    if (specificationPaths === null) return null;
    const aliasesByOccurrenceId = normalizeMaterialMatchAliases(
      request['aliasesByOccurrenceId'],
    );
    if (aliasesByOccurrenceId === null) return null;
    const fieldWeights = normalizeMaterialMatchWeights(
      request['fieldWeights'],
    );
    if (fieldWeights === null) return null;
    const weights = normalizeMaterialMatchWeights(request['weights']);
    if (weights === null) return null;
    const selection = normalizeMaterialMatchSelection(request['selection']);
    if (selection === null) return null;
    if (
      request['pinyin'] !== undefined &&
      typeof request['pinyin'] !== 'function'
    ) return null;
    if (
      request['tokenizer'] !== undefined &&
      typeof request['tokenizer'] !== 'function'
    ) return null;

    return Object.freeze({
      query: request['query'],
      limit,
      ...(fieldPaths === undefined ? {} : { fieldPaths }),
      ...(specificationPaths === undefined ? {} : { specificationPaths }),
      ...(aliasesByOccurrenceId === undefined ? {} : { aliasesByOccurrenceId }),
      ...(fieldWeights === undefined ? {} : { fieldWeights }),
      ...(weights === undefined ? {} : { weights }),
      ...(selection === undefined ? {} : { selection }),
      ...(request['pinyin'] === undefined ? {} : {
        pinyin: request['pinyin'] as (value: string) => string,
      }),
      ...(request['tokenizer'] === undefined ? {} : {
        tokenizer: request['tokenizer'] as (value: string) => readonly string[],
      }),
    }) as NormalizedMaterialMatchRequest<TFields>;
  } catch {
    return null;
  }
}

function normalizeMaterialMatchPaths(
  input: unknown,
): readonly (readonly string[])[] | undefined | null {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length > 256) return null;
  const paths: (readonly string[])[] = input.map((path) => {
    if (!Array.isArray(path) || path.length === 0 || path.length > 32) {
      throw new Error('BOM_EDITOR_MATCH_PATH_INVALID');
    }
    const normalized = path.map((segment) => {
      if (typeof segment !== 'string' || segment.length === 0 || segment.length > 128) {
        throw new Error('BOM_EDITOR_MATCH_PATH_SEGMENT_INVALID');
      }
      return segment;
    });
    return Object.freeze(normalized);
  });
  return Object.freeze(paths);
}

function normalizeMaterialMatchAliases(
  input: unknown,
): Readonly<Record<string, readonly string[]>> | undefined | null {
  if (input === undefined) return undefined;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const entries = Object.entries(input as Readonly<Record<string, unknown>>);
  if (entries.length > 10_000) return null;
  const aliases: Record<string, readonly string[]> = Object.create(null) as Record<
    string,
    readonly string[]
  >;
  for (const [occurrenceId, value] of entries) {
    if (
      occurrenceId.length === 0 ||
      occurrenceId.length > 256 ||
      !Array.isArray(value) ||
      value.length > 256 ||
      value.some((alias) => typeof alias !== 'string' || alias.length > 4_096)
    ) return null;
    aliases[occurrenceId] = Object.freeze([...value] as string[]);
  }
  return Object.freeze(aliases);
}

function normalizeMaterialMatchWeights(
  input: unknown,
): Readonly<Record<string, number>> | undefined | null {
  if (input === undefined) return undefined;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const entries = Object.entries(input as Readonly<Record<string, unknown>>);
  if (entries.length > 256) return null;
  const weights: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const [key, value] of entries) {
    if (
      key.length === 0 ||
      key.length > 256 ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 2
    ) return null;
    weights[key] = value;
  }
  return Object.freeze(weights);
}

function normalizeMaterialMatchSelection(
  input: unknown,
): Readonly<{ readonly minConfidence: number; readonly minScoreDelta: number }> | undefined | null {
  if (input === undefined) return undefined;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const selection = input as Readonly<Record<string, unknown>>;
  const minConfidence = selection['minConfidence'];
  const minScoreDelta = selection['minScoreDelta'];
  if (
    typeof minConfidence !== 'number' ||
    !Number.isFinite(minConfidence) ||
    minConfidence < 0 ||
    minConfidence > 1 ||
    typeof minScoreDelta !== 'number' ||
    !Number.isFinite(minScoreDelta) ||
    minScoreDelta < 0 ||
    minScoreDelta > 1
  ) return null;
  return Object.freeze({ minConfidence, minScoreDelta });
}

function compareMaterialMatchCandidates(
  left: Readonly<BomMaterialMatchCandidate>,
  right: Readonly<BomMaterialMatchCandidate>,
): number {
  return right.score - left.score ||
    right.confidence - left.confidence ||
    compareMaterialMatchText(left.occurrenceId, right.occurrenceId);
}

function compareMaterialMatchText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveMaterialMatchSelection(
  first: Readonly<BomMaterialMatchCandidate> | undefined,
  second: Readonly<BomMaterialMatchCandidate> | undefined,
  selection: Readonly<{
    readonly minConfidence: number;
    readonly minScoreDelta: number;
  }> | undefined,
): Readonly<{
  readonly status: BomMaterialMatchResult['selectionStatus'];
  readonly selectedOccurrenceId?: string;
}> {
  if (first === undefined) return Object.freeze({ status: 'none' });
  if (selection === undefined) return Object.freeze({ status: 'ambiguous' });
  const delta = second === undefined ? first.score : first.score - second.score;
  return first.confidence >= selection.minConfidence &&
      delta >= selection.minScoreDelta
    ? Object.freeze({ status: 'selected', selectedOccurrenceId: first.occurrenceId })
    : Object.freeze({ status: 'ambiguous' });
}

function normalizeSearchRequest(
  request: Readonly<BomSearchRequest>,
): Readonly<{
  query: string;
  mode: 'exact' | 'prefix' | 'fuzzy' | 'regex';
  caseSensitive: boolean;
  matchWholeCell: boolean;
  limit: number;
  regex: RegExp | null;
}> | 'invalid-regex' | null {
  if (request === null || typeof request !== 'object') return null;
  if (typeof request.query !== 'string') return null;
  const mode = request.mode ?? 'prefix';
  if (mode !== 'exact' && mode !== 'prefix' && mode !== 'fuzzy' && mode !== 'regex') return null;
  if (request.caseSensitive !== undefined && typeof request.caseSensitive !== 'boolean') return null;
  if (request.matchWholeCell !== undefined && typeof request.matchWholeCell !== 'boolean') return null;
  const caseSensitive = request.caseSensitive ?? false;
  const matchWholeCell = request.matchWholeCell ?? false;
  const rawQuery = request.query.normalize('NFKC');
  const query = mode === 'regex'
    ? rawQuery
    : normalizeSearchText(rawQuery, caseSensitive);
  if (query.length === 0 || query.length > 512) return null;
  const limit = request.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) return null;
  if (mode !== 'regex') {
    return Object.freeze({ query, mode, caseSensitive, matchWholeCell, limit, regex: null });
  }
  if (!isSafeSearchRegularExpression(query)) return 'invalid-regex';
  try {
    return Object.freeze({
      query,
      mode,
      caseSensitive,
      matchWholeCell,
      limit,
      regex: new RegExp(query, caseSensitive ? 'u' : 'iu'),
    });
  } catch {
    return 'invalid-regex';
  }
}

function matchSearchNode<TFields extends BomFields>(
  node: Readonly<BomNode<TFields>>,
  request: Readonly<{
    query: string;
    mode: 'exact' | 'prefix' | 'fuzzy' | 'regex';
    caseSensitive: boolean;
    matchWholeCell: boolean;
    regex: RegExp | null;
  }>,
): BomSearchMatch | null {
  const terms: Array<readonly [string, string]> = [];
  if (node.materialCode !== undefined) {
    terms.push(['materialCode', node.materialCode]);
  }
  for (const [fieldId, value] of Object.entries(node.fields)) {
    collectSearchTerms(fieldId, value, terms);
  }
  let score = -1;
  const reasons: string[] = [];
  for (const [fieldId, raw] of terms) {
    const candidateScore = request.mode === 'regex'
      ? searchRegexScore(raw, request.regex, request.matchWholeCell)
      : searchScore(
        normalizeSearchText(raw, request.caseSensitive),
        request.query,
        request.mode,
        request.matchWholeCell,
      );
    if (candidateScore < 0) continue;
    score = Math.max(score, candidateScore);
    if (!reasons.includes(fieldId)) reasons.push(fieldId);
  }
  return score < 0
    ? null
    : Object.freeze({
      occurrenceId: node.occurrenceId,
      score,
      reasons: Object.freeze(reasons),
    });
}

function collectSearchTerms(
  fieldId: string,
  value: BomValue,
  terms: Array<readonly [string, string]>,
): void {
  if (value === null) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    terms.push([fieldId, String(value)]);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSearchTerms(fieldId, entry, terms);
    return;
  }
  if ('$type' in value && typeof value.value === 'string') {
    terms.push([fieldId, value.value]);
    return;
  }
  for (const entry of Object.values(value)) {
    collectSearchTerms(fieldId, entry, terms);
  }
}

function normalizeSearchText(value: string, caseSensitive = false): string {
  const normalized = value.trim().normalize('NFKC');
  return caseSensitive ? normalized : normalized.toLocaleLowerCase();
}

function searchScore(
  text: string,
  query: string,
  mode: 'exact' | 'prefix' | 'fuzzy',
  matchWholeCell: boolean,
): number {
  if (matchWholeCell) return text === query ? 10_000 : -1;
  if (mode === 'exact') return text === query ? 10_000 : -1;
  if (mode === 'prefix') return text.startsWith(query) ? 5_000 - text.length : -1;
  let cursor = 0;
  let gaps = 0;
  for (const character of query) {
    const next = text.indexOf(character, cursor);
    if (next < 0) return -1;
    gaps += next - cursor;
    cursor = next + character.length;
  }
  return 1_000 - gaps - Math.max(0, text.length - query.length) * 0.1;
}

function searchRegexScore(text: string, regex: RegExp | null, matchWholeCell: boolean): number {
  if (regex === null) return -1;
  // A bounded candidate prevents a single untrusted value from monopolizing the UI thread.
  const candidate = text.slice(0, 4_096);
  const match = regex.exec(candidate);
  if (match === null) return -1;
  if (matchWholeCell && (match.index !== 0 || match[0].length !== candidate.length)) return -1;
  return 1;
}

function isSafeSearchRegularExpression(pattern: string): boolean {
  // Reject constructs with unbounded backtracking before compiling the pattern.
  if (/(?:\(\?(?:[=!]|<)|\\(?:[1-9]|k<))/u.test(pattern)) return false;
  const groups: Array<{ hasQuantifiedAtom: boolean }> = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '[') {
      index = skipRegularExpressionCharacterClass(pattern, index);
      continue;
    }
    if (character === '(') {
      groups.push({ hasQuantifiedAtom: false });
      if (pattern[index + 1] === '?' && pattern[index + 2] === ':') index += 2;
      continue;
    }
    if (character === ')') {
      const group = groups.pop();
      if (group === undefined) continue;
      if (isRegularExpressionQuantifierAt(pattern, index + 1) && group.hasQuantifiedAtom) {
        return false;
      }
      if (isRegularExpressionQuantifierAt(pattern, index + 1) && groups.length > 0) {
        groups[groups.length - 1]!.hasQuantifiedAtom = true;
      }
      continue;
    }
    if (isRegularExpressionQuantifierAt(pattern, index) && groups.length > 0) {
      groups[groups.length - 1]!.hasQuantifiedAtom = true;
    }
  }
  return true;
}

function skipRegularExpressionCharacterClass(pattern: string, openingIndex: number): number {
  for (let index = openingIndex + 1; index < pattern.length; index += 1) {
    if (pattern[index] === '\\') {
      index += 1;
    } else if (pattern[index] === ']') {
      return index;
    }
  }
  return pattern.length;
}

function isRegularExpressionQuantifierAt(pattern: string, index: number): boolean {
  const character = pattern[index];
  if (character === '*' || character === '+' || character === '?') return true;
  if (character !== '{') return false;
  const closing = pattern.indexOf('}', index + 1);
  if (closing < 0) return false;
  return /^\d+(?:,\d*)?$/u.test(pattern.slice(index + 1, closing));
}

function yieldSearchWork(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function documentReference<TFields extends BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
  generation: number,
  sourceType: 'memory' | 'dataSource',
): BomDocumentReference {
  return Object.freeze({
    documentId: snapshot.documentId,
    revision: snapshot.revision,
    ...(snapshot.sourceRevision === undefined
      ? {}
      : { sourceRevision: snapshot.sourceRevision }),
    positionKeyCodecVersion: snapshot.positionKeyCodecVersion,
    sourceType,
    generation,
  });
}

function operationFingerprint<TFields extends BomFields>(
  operations: readonly BomOperation<TFields>[],
): string {
  return encodeCanonicalValue(operations as unknown as BomValue);
}

function trimMap<K, V>(map: Map<K, V>, maximumSize: number): void {
  while (map.size > maximumSize) {
    const first = map.keys().next();
    if (first.done) return;
    map.delete(first.value);
  }
}

function trimOwnTransactionLedger(
  transactions: Map<string, OwnRemoteTransactionState>,
  maximumSize: number,
): void {
  if (transactions.size <= maximumSize) return;
  for (const [transactionId, transaction] of transactions) {
    if (transactions.size <= maximumSize) return;
    if (transaction.status === 'pending') continue;
    transactions.delete(transactionId);
  }
}

function waitForAbortSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<
  | { readonly aborted: false; readonly value: T }
  | { readonly aborted: true }
> {
  if (signal === undefined) {
    return promise.then((value) => ({ aborted: false, value }));
  }
  if (signal.aborted) {
    void promise.then(undefined, () => undefined);
    return Promise.resolve({ aborted: true });
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (
      result:
        | { readonly aborted: false; readonly value: T }
        | { readonly aborted: true },
    ): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = (): void => finish({ aborted: true });
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => finish({ aborted: false, value }),
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function resolveEditorPresentation<TFields extends BomFields>(
  options:
    | Omit<BomCanvasRendererOptions<TFields>, 'instanceId' | 'shortcuts'>
    | undefined,
): Readonly<BomCanvasPresentationState> {
  const locale = normalizeEditorLocale(options?.locale) ?? 'zh-CN';
  const direction = options?.direction === 'rtl' ? 'rtl' as const : 'ltr' as const;
  const labelOverrides = mergeEditorLabelOverrides(
    Object.freeze({}),
    options?.labels,
  );
  if (labelOverrides === null) {
    throw new RangeError('BOM_EDITOR_PRESENTATION_LABELS_INVALID');
  }
  const labels = resolveEditorLabels(locale, labelOverrides);
  const theme = Object.freeze({
    ...DEFAULT_BOM_CANVAS_THEME,
    ...(options?.theme ?? {}),
  });
  return Object.freeze({ locale, direction, labels, theme });
}

function normalizeEditorLocale(value: unknown): BomEditorLocale | null {
  return value === undefined || value === 'zh-CN' || value === 'en-US'
    ? (value ?? 'zh-CN')
    : null;
}

function mergeEditorPresentation(
  current: Readonly<BomCanvasPresentationState>,
  input: Readonly<BomCanvasPresentationOptions>,
  labelOverrides: Readonly<BomCanvasRendererLabelOverrides>,
): BomCanvasPresentationConfigurationResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return editorPresentationFailure('invalid-options');
  }
  const locale = input.locale === undefined
    ? current.locale
    : normalizeEditorLocale(input.locale);
  if (locale === null) return editorPresentationFailure('invalid-locale');
  const direction = input.direction ?? current.direction;
  if (direction !== 'ltr' && direction !== 'rtl') {
    return editorPresentationFailure('invalid-direction');
  }
  const labels = resolveEditorLabels(locale, labelOverrides);
  const theme = mergeEditorTheme(current.theme, input.theme);
  if (theme === null) return editorPresentationFailure('invalid-theme');
  return Object.freeze({
    ok: true,
    state: Object.freeze({ locale, direction, labels, theme }),
    diagnostics: Object.freeze([]),
  });
}

function mergeEditorLabelOverrides(
  current: Readonly<BomCanvasRendererLabelOverrides>,
  input: Readonly<BomCanvasRendererLabelOverrides> | undefined,
): Readonly<BomCanvasRendererLabelOverrides> | null {
  if (input === undefined) return current;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const keys = ['treegridLabel', 'treegridDescription', 'editorLabel', 'rowNumberHeader'] as const;
  for (const key of keys) {
    const value = input[key];
    if (!isEditorLocalizedLabelValue(value)) return null;
  }
  if (input.contextMenu !== undefined) {
    if (typeof input.contextMenu !== 'object' || input.contextMenu === null || Array.isArray(input.contextMenu)) return null;
    if (Object.values(input.contextMenu).some((value) => !isEditorLocalizedLabelValue(value))) return null;
  }
  if (input.liveRegion !== undefined) {
    if (typeof input.liveRegion !== 'object' || input.liveRegion === null || Array.isArray(input.liveRegion)) return null;
    if (Object.values(input.liveRegion).some((value) => !isEditorLocalizedLabelValue(value))) return null;
  }
  if (input.diff !== undefined) {
    if (typeof input.diff !== 'object' || input.diff === null || Array.isArray(input.diff)) return null;
    if (Object.values(input.diff).some((value) => !isEditorLocalizedLabelValue(value))) return null;
  }
  return Object.freeze({
    ...(input.treegridLabel === undefined && current.treegridLabel === undefined
      ? {}
      : { treegridLabel: input.treegridLabel ?? current.treegridLabel }),
    ...(input.treegridDescription === undefined && current.treegridDescription === undefined
      ? {}
      : { treegridDescription: input.treegridDescription ?? current.treegridDescription }),
    ...(input.editorLabel === undefined && current.editorLabel === undefined
      ? {}
      : { editorLabel: input.editorLabel ?? current.editorLabel }),
    ...(input.rowNumberHeader === undefined && current.rowNumberHeader === undefined
      ? {}
      : { rowNumberHeader: input.rowNumberHeader ?? current.rowNumberHeader }),
    contextMenu: Object.freeze({
      ...(current.contextMenu ?? {}),
      ...(input.contextMenu ?? {}),
    }),
    liveRegion: Object.freeze({
      ...(current.liveRegion ?? {}),
      ...(input.liveRegion ?? {}),
    }),
    diff: Object.freeze({
      ...(current.diff ?? {}),
      ...(input.diff ?? {}),
    }),
  });
}

function isEditorLocalizedLabelValue(value: unknown): boolean {
  if (value === undefined || typeof value === 'string') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<'zh-CN' | 'en-US', unknown>>;
  return typeof candidate['zh-CN'] === 'string' &&
    (candidate['en-US'] === undefined || typeof candidate['en-US'] === 'string');
}

function resolveEditorLabels(
  locale: BomEditorLocale,
  overrides: Readonly<BomCanvasRendererLabelOverrides>,
): Readonly<BomCanvasRendererLabels> {
  const base = resolveBomCanvasLabels(locale);
  return Object.freeze({
    treegridLabel: resolveEditorLabelValue(overrides.treegridLabel, locale) ?? base.treegridLabel,
    treegridDescription: resolveEditorLabelValue(overrides.treegridDescription, locale) ?? base.treegridDescription ?? '',
    editorLabel: resolveEditorLabelValue(overrides.editorLabel, locale) ?? base.editorLabel,
    rowNumberHeader: resolveEditorLabelValue(overrides.rowNumberHeader, locale) ?? base.rowNumberHeader,
    contextMenu: resolveEditorLabelMap(base.contextMenu, overrides.contextMenu, locale),
    liveRegion: resolveEditorLabelMap(base.liveRegion, overrides.liveRegion, locale),
    diff: resolveEditorLabelMap(base.diff, overrides.diff, locale),
  });
}

function resolveEditorLabelMap(
  base: Readonly<object> | undefined,
  overrides: Readonly<object> | undefined,
  locale: BomEditorLocale,
): Readonly<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(base ?? {})) {
    if (typeof value === 'string') resolved[key] = value;
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const localized = resolveEditorLabelValue(
      value as import('@bom-editor/renderer-canvas').BomCanvasLocalizedText,
      locale,
    );
    if (localized !== undefined) resolved[key] = localized;
  }
  return Object.freeze(resolved);
}

function resolveEditorLabelValue(
  value: import('@bom-editor/renderer-canvas').BomCanvasLocalizedText | undefined,
  locale: BomEditorLocale,
): string | undefined {
  if (value === undefined || typeof value === 'string') return value;
  return value[locale] ?? value['zh-CN'];
}

function mergeEditorTheme(
  current: Readonly<BomCanvasTheme>,
  input: Readonly<Partial<Readonly<BomCanvasTheme>>> | undefined,
): Readonly<BomCanvasTheme> | null {
  if (input === undefined) return current;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const keys: readonly (keyof BomCanvasTheme)[] = [
    'background', 'frozenBackground', 'rowAlternateBackground', 'gridLine',
    'text', 'activeCell', 'activeCellFill', 'rangeFill', 'fillPreviewFill',
    'fillPreviewBorder', 'expander', 'diffAddedFill', 'diffDeletedFill',
    'diffChangedFill', 'diffMarker', 'font',
  ];
  if (keys.some((key) => input[key] !== undefined && typeof input[key] !== 'string')) return null;
  return Object.freeze({ ...current, ...input });
}

export function normalizeEditorDiffView(
  input: Readonly<BomCanvasDiffView> | null,
): Readonly<BomCanvasDiffView> | null {
  if (input === null) {
    return null;
  }
  if (
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input.protocol !== BOM_CANVAS_DIFF_VIEW_PROTOCOL ||
    typeof input.documentId !== 'string' ||
    input.documentId.length === 0 ||
    !Number.isSafeInteger(input.documentGeneration) ||
    input.documentGeneration < 0 ||
    typeof input.viewRevision !== 'string' ||
    input.viewRevision.length === 0 ||
    !Array.isArray(input.rows) ||
    !Array.isArray(input.cells) ||
    (input.deletedRows !== undefined && !Array.isArray(input.deletedRows)) ||
    (input.ghostRows !== undefined && !Array.isArray(input.ghostRows)) ||
    input.rows.length + input.cells.length +
      (input.deletedRows?.length ?? 0) +
      (input.ghostRows?.length ?? 0) > 100_000
  ) {
    return null;
  }
  const kinds = new Set<BomCanvasDiffKind>([
    'inserted',
    'deleted',
    'changed',
    'moved',
    'reordered',
    'material',
  ]);
  const rows = [] as { readonly occurrenceId: string; readonly kind: BomCanvasDiffKind }[];
  const rowKindsByOccurrence = new Map<string, Set<BomCanvasDiffKind>>();
  for (const row of input.rows) {
    if (
      row === null ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      typeof row.occurrenceId !== 'string' ||
      row.occurrenceId.length === 0 ||
      !kinds.has(row.kind)
    ) {
      return null;
    }
    let knownKinds = rowKindsByOccurrence.get(row.occurrenceId);
    if (knownKinds === undefined) {
      knownKinds = new Set<BomCanvasDiffKind>();
      rowKindsByOccurrence.set(row.occurrenceId, knownKinds);
    }
    if (knownKinds.has(row.kind)) {
      continue;
    }
    knownKinds.add(row.kind);
    rows.push(Object.freeze({ occurrenceId: row.occurrenceId, kind: row.kind }));
  }
  const cells = [] as {
    readonly occurrenceId: string;
    readonly columnId: string;
    readonly kind: BomCanvasDiffKind;
  }[];
  const cellKindsByAddress = new Map<
    string,
    Map<string, Set<BomCanvasDiffKind>>
  >();
  for (const cell of input.cells) {
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
      return null;
    }
    let columns = cellKindsByAddress.get(cell.occurrenceId);
    if (columns === undefined) {
      columns = new Map<string, Set<BomCanvasDiffKind>>();
      cellKindsByAddress.set(cell.occurrenceId, columns);
    }
    let knownKinds = columns.get(cell.columnId);
    if (knownKinds === undefined) {
      knownKinds = new Set<BomCanvasDiffKind>();
      columns.set(cell.columnId, knownKinds);
    }
    if (knownKinds.has(cell.kind)) {
      continue;
    }
    knownKinds.add(cell.kind);
    cells.push(Object.freeze({
      occurrenceId: cell.occurrenceId,
      columnId: cell.columnId,
      kind: cell.kind,
    }));
  }
  const deletedRows: BomCanvasDiffDeletionSummary[] = [];
  const deletedKeys = new Set<string>();
  for (const summary of input.deletedRows ?? []) {
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
      return null;
    }
    const key = JSON.stringify([
      summary.occurrenceId,
      summary.anchorOccurrenceId ?? null,
      summary.position,
    ]);
    if (deletedKeys.has(key)) continue;
    deletedKeys.add(key);
    deletedRows.push(Object.freeze({
      occurrenceId: summary.occurrenceId,
      ...(summary.anchorOccurrenceId === undefined
        ? {}
        : { anchorOccurrenceId: summary.anchorOccurrenceId }),
      position: summary.position,
      count: summary.count,
    }));
  }
  const ghostRows: BomCanvasDiffGhostRow[] = [];
  const ghostIds = new Set<string>(deletedRows.map((summary) => summary.occurrenceId));
  for (const ghost of input.ghostRows ?? []) {
    if (
      ghost === null ||
      typeof ghost !== 'object' ||
      Array.isArray(ghost) ||
      typeof ghost.occurrenceId !== 'string' ||
      ghost.occurrenceId.length === 0 ||
      ghostIds.has(ghost.occurrenceId) ||
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
      return null;
    }
    ghostIds.add(ghost.occurrenceId);
    ghostRows.push(Object.freeze({
      occurrenceId: ghost.occurrenceId,
      ...(ghost.anchorOccurrenceId === undefined
        ? {}
        : { anchorOccurrenceId: ghost.anchorOccurrenceId }),
      position: ghost.position,
      ...(ghost.depth === undefined ? {} : { depth: ghost.depth }),
    }));
  }
  return Object.freeze({
    protocol: BOM_CANVAS_DIFF_VIEW_PROTOCOL,
    documentId: input.documentId,
    documentGeneration: input.documentGeneration,
    viewRevision: input.viewRevision,
    rows: Object.freeze(rows),
    cells: Object.freeze(cells),
    ...(deletedRows.length === 0
      ? {}
      : { deletedRows: Object.freeze(deletedRows) }),
    ...(ghostRows.length === 0
      ? {}
      : { ghostRows: Object.freeze(ghostRows) }),
  });
}

function diffViewPublishedStateMismatch<TFields extends BomFields>(
  diffView: Readonly<BomCanvasDiffView>,
  state: Readonly<PublishedState<TFields>>,
  columns: readonly Readonly<BomColumnDefinition>[],
): 'binding' | 'address' | null {
  if (
    diffView.documentId !== state.snapshot.documentId ||
    diffView.documentGeneration !== state.documentGeneration ||
    diffView.viewRevision !== state.snapshot.revision
  ) {
    return 'binding';
  }
  const columnIds = new Set(columns.map((column) => column.columnId));
  for (const row of diffView.rows) {
    if (!state.indexes.rowById.has(row.occurrenceId)) {
      return 'address';
    }
  }
  for (const cell of diffView.cells) {
    if (
      !state.indexes.rowById.has(cell.occurrenceId) ||
      !columnIds.has(cell.columnId)
    ) {
      return 'address';
    }
  }
  for (const summary of diffView.deletedRows ?? []) {
    if (state.indexes.rowById.has(summary.occurrenceId)) {
      return 'address';
    }
    if (
      (summary.position === 'before' || summary.position === 'after') &&
      (summary.anchorOccurrenceId === undefined ||
        !state.indexes.rowById.has(summary.anchorOccurrenceId))
    ) {
      return 'address';
    }
  }
  const ghostIds = new Set<string>(
    (diffView.deletedRows ?? []).map((summary) => summary.occurrenceId),
  );
  for (const ghost of diffView.ghostRows ?? []) {
    if (
      ghostIds.has(ghost.occurrenceId) ||
      state.indexes.rowById.has(ghost.occurrenceId)
    ) {
      return 'address';
    }
    ghostIds.add(ghost.occurrenceId);
    if (
      (ghost.position === 'before' || ghost.position === 'after') &&
      (ghost.anchorOccurrenceId === undefined ||
        !state.indexes.rowById.has(ghost.anchorOccurrenceId))
    ) {
      return 'address';
    }
  }
  return null;
}

function editorPresentationFailure(
  code: import('@bom-editor/renderer-canvas').BomCanvasPresentationDiagnosticCode,
): BomCanvasPresentationConfigurationResult {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([
      Object.freeze({ code, severity: 'error' as const }),
    ]),
  });
}

function sameCapabilities(
  left: Readonly<BomCapabilities>,
  right: Readonly<BomCapabilities>,
): boolean {
  return (
    left.worker === right.worker &&
    left.offscreenCanvas === right.offscreenCanvas &&
    left.clipboard === right.clipboard &&
    left.pointerEvents === right.pointerEvents &&
    left.resizeObserver === right.resizeObserver &&
    left.intl === right.intl &&
    left.secureContext === right.secureContext &&
    left.hardwareConcurrency === right.hardwareConcurrency &&
    left.deviceMemoryGiB === right.deviceMemoryGiB
  );
}

function isMountContainer(value: unknown): value is HTMLElement {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as {
    readonly ownerDocument?: {
      readonly createElement?: unknown;
    };
    readonly appendChild?: unknown;
    readonly removeChild?: unknown;
  };
  return (
    typeof candidate.ownerDocument?.createElement === 'function' &&
    typeof candidate.appendChild === 'function' &&
    typeof candidate.removeChild === 'function'
  );
}

function isDataSourceCandidate<TFields extends BomFields>(
  value: BomDocumentSnapshot<TFields> | BomDataSource<TFields>,
): value is BomDataSource<TFields> {
  return (
    typeof value === 'object' && value !== null &&
    'capabilities' in value && 'loadDocument' in value &&
    typeof (value as { readonly loadDocument?: unknown }).loadDocument ===
      'function'
  );
}
