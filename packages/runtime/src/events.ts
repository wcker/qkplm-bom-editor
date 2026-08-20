import type {
  BomCommit,
  BomDocumentGeneration,
  BomDocumentId,
  BomDocumentReference,
  BomDocumentReplaceReason,
  BomEventType,
  BomError,
  BomFields,
  BomInstanceId,
  BomMaterialMatchAuditEvent as BomMaterialMatchAuditEnvelope,
  BomPatch,
  BomRecoveryBundle,
  BomTransactionId,
  BomTransactionPersistenceState,
  BomValue,
  BomValidationIssue,
  OccurrenceId,
  RevisionToken,
} from '@bom-editor/contracts';
import type {
  BomCapabilities,
  BomClipboardBranchScope,
  BomBranchClipboardOperation,
  BomCellAddress,
  BomClipboardFormat,
  BomClipboardOperation,
  BomClipboardWriteMethod,
  BomClipboardWriteOutcome,
  BomDiagnostics,
  BomEditCommitReason,
  BomEditDraft,
  BomEditState,
  BomEditTrigger,
  BomPasteFormat,
  BomPasteOutcome,
  BomPasteSource,
  BomSelectionChangeReason,
  BomSelectionState,
  BomStructureMoveRequest,
  BomViewChangeReason,
  BomViewState,
} from './types.js';

/** Browser-only events intentionally outside the neutral contracts envelope. */
export type BomRuntimeOnlyEventType =
  | 'pluginChanged'
  | 'clipboardOperation'
  | 'pasteOperation'
  | 'structureMoveRequested';

/** The browser event map contains every contracts event plus browser-only detail. */
export type BomRuntimeEventType = BomEventType | BomRuntimeOnlyEventType;

export type BomRuntimeCancellableEventType =
  | 'beforeTransaction'
  | 'beforeDocumentReplace'
  | 'beforeEdit'
  | 'beforeCommit'
  | 'beforeImport'
  | 'beforeExport'
  | 'beforeCopy';

export interface BomRuntimeEventBase<
  TType extends BomRuntimeEventType = BomRuntimeEventType,
> {
  readonly type: TType;
  readonly instanceId: BomInstanceId;
  readonly sequence: number;
  readonly timestamp: number;
}

/** This function-bearing wrapper exists only for one synchronous browser dispatch. */
export interface BomRuntimeCancellableEvent<
  TType extends BomRuntimeCancellableEventType = BomRuntimeCancellableEventType,
> extends BomRuntimeEventBase<TType> {
  readonly cancellable: true;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface BomReadyEvent extends BomRuntimeEventBase<'ready'> {
  readonly capabilities: Readonly<BomCapabilities>;
  readonly diagnostics: Readonly<BomDiagnostics>;
}

export interface BomDestroyedEvent extends BomRuntimeEventBase<'destroyed'> {
  readonly reason: 'destroy';
}

export interface BomCapabilitiesChangedEvent
  extends BomRuntimeEventBase<'capabilitiesChanged'> {
  readonly previous: Readonly<BomCapabilities>;
  readonly capabilities: Readonly<BomCapabilities>;
  readonly reason: 'environment' | 'mount' | 'recovery' | 'degradation';
}

export interface BomPluginChangedEvent extends BomRuntimeEventBase<'pluginChanged'> {
  readonly action: 'installed' | 'uninstalled' | 'reloaded' | 'failed';
  readonly pluginId: string;
  readonly version?: string;
  readonly error?: BomError;
}

export interface BomTransactionRuntimeEventBase<
  TType extends
    | 'beforeTransaction'
    | 'transactionCommitted'
    | 'transactionPersistenceChanged'
    | 'documentChanged',
  TFields extends BomFields = BomFields,
> extends BomRuntimeEventBase<TType> {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly transactionId: BomTransactionId;
  readonly origin: string;
  readonly previousRevision: RevisionToken;
  readonly revision: RevisionToken;
  readonly patch: BomPatch<TFields>;
}

export interface BomBeforeTransactionRuntimeEvent<
  TFields extends BomFields = BomFields,
> extends BomTransactionRuntimeEventBase<'beforeTransaction', TFields>,
    BomRuntimeCancellableEvent<'beforeTransaction'> {}

export interface BomTransactionCommittedRuntimeEvent<
  TFields extends BomFields = BomFields,
> extends BomTransactionRuntimeEventBase<'transactionCommitted', TFields> {
  readonly commit: BomCommit<TFields>;
}

export interface BomTransactionRejectedRuntimeEvent<
  TFields extends BomFields = BomFields,
> extends BomRuntimeEventBase<'transactionRejected'> {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly transactionId: BomTransactionId;
  readonly origin: string;
  readonly baseRevision: RevisionToken;
  readonly patch?: BomPatch<TFields>;
  readonly error: BomError;
}

export interface BomTransactionPersistenceChangedRuntimeEvent<
  TFields extends BomFields = BomFields,
> extends BomTransactionRuntimeEventBase<
    'transactionPersistenceChanged',
    TFields
  > {
  readonly state: BomTransactionPersistenceState;
  readonly sourceRevision?: RevisionToken;
  readonly recoveryId?: string;
  readonly retryable?: boolean;
  readonly recoveryBundle?: BomRecoveryBundle<TFields>;
  readonly error?: BomError;
}

export interface BomDocumentChangedRuntimeEvent<
  TFields extends BomFields = BomFields,
> extends BomTransactionRuntimeEventBase<'documentChanged', TFields> {}

export interface BomDocumentReplaceRuntimeEventBase<
  TType extends
    | 'beforeDocumentReplace'
    | 'documentReplaced'
    | 'documentReplaceRejected',
> extends BomRuntimeEventBase<TType> {
  readonly previous?: BomDocumentReference;
  readonly next: BomDocumentReference;
  readonly reason: BomDocumentReplaceReason;
}

export interface BomBeforeDocumentReplaceRuntimeEvent
  extends BomDocumentReplaceRuntimeEventBase<'beforeDocumentReplace'>,
    BomRuntimeCancellableEvent<'beforeDocumentReplace'> {}

export interface BomDocumentReplacedRuntimeEvent
  extends BomDocumentReplaceRuntimeEventBase<'documentReplaced'> {}

export interface BomDocumentReplaceRejectedRuntimeEvent
  extends BomDocumentReplaceRuntimeEventBase<'documentReplaceRejected'> {
  readonly error: BomError;
}

export interface BomInteractionRuntimeEventBase<
  TType extends
    | 'selectionChanged'
    | 'clipboardOperation'
    | 'beforeCopy'
    | 'clipboardCompleted'
    | 'clipboardRejected'
    | 'pasteOperation'
    | 'taskProgress'
    | 'viewChanged'
    | 'validationChanged'
    | 'materialMatchAudit'
    | 'beforeImport'
    | 'beforeExport'
    | 'exportCompleted'
    | 'exportRejected'
    | 'beforeEdit'
    | 'editStart'
    | 'valueChanged'
    | 'beforeCommit'
    | 'commitRejected'
    | 'editEnd'
    | 'editStateChanged',
> extends BomRuntimeEventBase<TType> {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
}

export interface BomSelectionChangedEvent
  extends BomInteractionRuntimeEventBase<'selectionChanged'> {
  readonly previous: Readonly<BomSelectionState>;
  readonly selection: Readonly<BomSelectionState>;
  readonly reason: BomSelectionChangeReason;
}

/** Value-free host handoff for a structural move on a partial Snapshot. */
export interface BomStructureMoveRequestedEvent
  extends BomRuntimeEventBase<'structureMoveRequested'> {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly request: Readonly<BomStructureMoveRequest>;
}

/** Clipboard audit metadata deliberately excludes any copied field values. */
export interface BomClipboardOperationEvent
  extends BomInteractionRuntimeEventBase<'clipboardOperation'> {
  readonly operation: BomClipboardOperation | BomBranchClipboardOperation;
  readonly outcome: BomClipboardWriteOutcome;
  readonly method?: BomClipboardWriteMethod;
  readonly decisionId?: string;
  readonly reasonCode?: string;
  readonly occurrenceCount: number;
  readonly fieldIds: readonly string[];
  readonly formats: readonly BomClipboardFormat[];
  /** Present for branch copy/cut; omitted for ordinary cell operations. */
  readonly branch?: Readonly<BomClipboardBranchScope>;
}

/** Value-free synchronous authorization hook for outbound clipboard data. */
export interface BomBeforeCopyEvent
  extends BomInteractionRuntimeEventBase<'beforeCopy'>,
    BomRuntimeCancellableEvent<'beforeCopy'> {
  readonly operation: BomClipboardOperation | BomBranchClipboardOperation;
  readonly occurrenceCount: number;
  readonly fieldIds: readonly string[];
  readonly formats: readonly BomClipboardFormat[];
  /** Present for branch copy/cut; omitted for ordinary cell operations. */
  readonly branch?: Readonly<BomClipboardBranchScope>;
}

/** Emitted after the requested clipboard representations were written. */
export interface BomClipboardCompletedEvent
  extends BomInteractionRuntimeEventBase<'clipboardCompleted'> {
  readonly operation: BomClipboardOperation | BomBranchClipboardOperation;
  readonly method: BomClipboardWriteMethod;
  readonly occurrenceCount: number;
  readonly fieldIds: readonly string[];
  readonly formats: readonly BomClipboardFormat[];
  readonly decisionId?: string;
  readonly branch?: Readonly<BomClipboardBranchScope>;
}

/** Emitted when clipboard authorization, preparation, or writing is rejected. */
export interface BomClipboardRejectedEvent
  extends BomInteractionRuntimeEventBase<'clipboardRejected'> {
  readonly operation: BomClipboardOperation | BomBranchClipboardOperation;
  readonly outcome: 'denied' | 'failed';
  readonly occurrenceCount: number;
  readonly fieldIds: readonly string[];
  readonly formats: readonly BomClipboardFormat[];
  readonly method?: BomClipboardWriteMethod;
  readonly decisionId?: string;
  readonly reasonCode?: string;
  readonly branch?: Readonly<BomClipboardBranchScope>;
}

/** Paste audit metadata deliberately excludes source text and converted values. */
export interface BomPasteOperationEvent
  extends BomInteractionRuntimeEventBase<'pasteOperation'> {
  readonly source: BomPasteSource;
  readonly outcome: BomPasteOutcome;
  readonly inputBytes: number;
  readonly format?: BomPasteFormat;
  readonly rowCount?: number;
  readonly columnCount?: number;
  readonly targetCellCount?: number;
  readonly diagnosticCount: number;
  readonly decisionId?: string;
  readonly reasonCode?: string;
  readonly transactionId?: BomTransactionId;
}

/**
 * Value-free progress for cancellable, potentially long-running editor work.
 * `completed` is monotonic for a task and `total` is optional when the work
 * cannot know its final size up front.
 */
export interface BomTaskProgressEvent
  extends BomInteractionRuntimeEventBase<'taskProgress'> {
  readonly taskId: string;
  readonly taskType: string;
  readonly completed: number;
  readonly total?: number;
  readonly stage: string;
}

export interface BomViewChangedEvent
  extends BomInteractionRuntimeEventBase<'viewChanged'> {
  readonly previous: Readonly<BomViewState>;
  readonly view: Readonly<BomViewState>;
  readonly reason: BomViewChangeReason;
}

/** Value-free validation diagnostics snapshot published when diagnostics change. */
export interface BomValidationChangedEvent
  extends BomInteractionRuntimeEventBase<'validationChanged'> {
  readonly taskId: string;
  readonly scope: 'document' | 'visible' | 'selection';
  readonly documentRevision: RevisionToken;
  readonly checkedNodeCount: number;
  readonly totalNodeCount: number;
  readonly valid: boolean;
  readonly issueCount: number;
  readonly issues: readonly Readonly<BomValidationIssue>[];
  readonly previousIssueCount?: number;
}

/** Value-free lifecycle of a host-approved material-match proposal. */
export interface BomMaterialMatchAuditEvent
  extends BomInteractionRuntimeEventBase<'materialMatchAudit'>,
    BomMaterialMatchAuditEnvelope {}

/** Value-free metadata for an import request. Source bytes and cell values are never exposed. */
export interface BomBeforeImportEvent
  extends BomInteractionRuntimeEventBase<'beforeImport'>,
    BomRuntimeCancellableEvent<'beforeImport'> {
  readonly taskId: string;
  readonly format?: 'csv' | 'tsv' | 'xlsx' | 'xls';
  readonly mode: 'preview' | 'commit';
  readonly header?: 'none' | 'firstRow';
  readonly fieldIds: readonly string[];
  readonly baseRevision?: RevisionToken;
}

/** Value-free metadata for an export request. */
export interface BomBeforeExportEvent
  extends BomInteractionRuntimeEventBase<'beforeExport'>,
    BomRuntimeCancellableEvent<'beforeExport'> {
  readonly taskId: string;
  readonly format: 'csv' | 'tsv' | 'xlsx';
  readonly mode: 'currentView' | 'completeData' | 'roundTripTemplate';
  readonly rowScope: 'visible' | 'filtered' | 'all';
  readonly fieldIds: readonly string[];
}

export interface BomExportCompletedEvent
  extends BomInteractionRuntimeEventBase<'exportCompleted'> {
  readonly taskId: string;
  readonly format: 'csv' | 'tsv' | 'xlsx';
  readonly mode: 'currentView' | 'completeData' | 'roundTripTemplate';
  readonly effectiveMode:
    | 'currentView'
    | 'completeData'
    | 'roundTripTemplate'
    | 'policyTransformed';
  readonly lossless: boolean;
  readonly exportedRowCount: number;
  readonly exportedFieldIds: readonly string[];
  readonly omittedFieldIds: readonly string[];
  readonly policyDecisionId?: string;
}

export interface BomExportRejectedEvent
  extends BomInteractionRuntimeEventBase<'exportRejected'> {
  readonly taskId: string;
  readonly format: 'csv' | 'tsv' | 'xlsx';
  readonly mode: 'currentView' | 'completeData' | 'roundTripTemplate';
  readonly rowScope: 'visible' | 'filtered' | 'all';
  readonly fieldIds: readonly string[];
  readonly error: BomError;
}

export interface BomBeforeEditEvent
  extends BomInteractionRuntimeEventBase<'beforeEdit'>,
    BomRuntimeCancellableEvent<'beforeEdit'> {
  readonly address: Readonly<BomCellAddress>;
  readonly initialValue: BomValue | undefined;
  readonly trigger: BomEditTrigger;
}

export interface BomEditStartEvent
  extends BomInteractionRuntimeEventBase<'editStart'> {
  readonly draft: Readonly<BomEditDraft>;
  readonly trigger: BomEditTrigger;
}

export interface BomValueChangedEvent
  extends BomInteractionRuntimeEventBase<'valueChanged'> {
  readonly address: Readonly<BomCellAddress>;
  readonly previousValue: BomValue;
  readonly value: BomValue;
  readonly draft: Readonly<BomEditDraft>;
  readonly inputType: 'insert' | 'delete' | 'replace' | 'composition' | 'api';
}

export interface BomBeforeCommitEvent
  extends BomInteractionRuntimeEventBase<'beforeCommit'>,
    BomRuntimeCancellableEvent<'beforeCommit'> {
  readonly draft: Readonly<BomEditDraft>;
  readonly reason: BomEditCommitReason;
}

export interface BomCommitRejectedEvent
  extends BomInteractionRuntimeEventBase<'commitRejected'> {
  readonly draft: Readonly<BomEditDraft>;
  readonly phase: 'validation' | 'commit';
  readonly error: BomError;
}

export interface BomEditEndEvent
  extends BomInteractionRuntimeEventBase<'editEnd'> {
  readonly address: Readonly<BomCellAddress>;
  readonly outcome: 'committed' | 'cancelled' | 'document-replaced' | 'destroyed';
  readonly value?: BomValue;
}

export interface BomEditStateChangedEvent
  extends BomInteractionRuntimeEventBase<'editStateChanged'> {
  readonly previous: Readonly<BomEditState>;
  readonly state: Readonly<BomEditState>;
}

export interface BomRuntimeErrorEvent extends BomRuntimeEventBase<'error'> {
  readonly error: BomError;
  readonly source: 'lifecycle' | 'transaction' | 'document' | 'edit' | 'view';
  readonly fatal: boolean;
}

export interface BomRuntimeMetricEvent extends BomRuntimeEventBase<'metric'> {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly labels?: Readonly<Record<string, string>>;
}

export interface BomEventMap<TFields extends BomFields = BomFields> {
  readonly ready: BomReadyEvent;
  readonly destroyed: BomDestroyedEvent;
  readonly capabilitiesChanged: BomCapabilitiesChangedEvent;
  readonly pluginChanged: BomPluginChangedEvent;
  readonly beforeTransaction: BomBeforeTransactionRuntimeEvent<TFields>;
  readonly transactionCommitted: BomTransactionCommittedRuntimeEvent<TFields>;
  readonly transactionRejected: BomTransactionRejectedRuntimeEvent<TFields>;
  readonly transactionPersistenceChanged: BomTransactionPersistenceChangedRuntimeEvent<TFields>;
  readonly documentChanged: BomDocumentChangedRuntimeEvent<TFields>;
  readonly beforeDocumentReplace: BomBeforeDocumentReplaceRuntimeEvent;
  readonly documentReplaced: BomDocumentReplacedRuntimeEvent;
  readonly documentReplaceRejected: BomDocumentReplaceRejectedRuntimeEvent;
  readonly selectionChanged: BomSelectionChangedEvent;
  readonly structureMoveRequested: BomStructureMoveRequestedEvent;
  readonly clipboardOperation: BomClipboardOperationEvent;
  readonly beforeCopy: BomBeforeCopyEvent;
  readonly clipboardCompleted: BomClipboardCompletedEvent;
  readonly clipboardRejected: BomClipboardRejectedEvent;
  readonly pasteOperation: BomPasteOperationEvent;
  readonly taskProgress: BomTaskProgressEvent;
  readonly viewChanged: BomViewChangedEvent;
  readonly validationChanged: BomValidationChangedEvent;
  readonly materialMatchAudit: BomMaterialMatchAuditEvent;
  readonly beforeImport: BomBeforeImportEvent;
  readonly beforeExport: BomBeforeExportEvent;
  readonly exportCompleted: BomExportCompletedEvent;
  readonly exportRejected: BomExportRejectedEvent;
  readonly beforeEdit: BomBeforeEditEvent;
  readonly editStart: BomEditStartEvent;
  readonly valueChanged: BomValueChangedEvent;
  readonly beforeCommit: BomBeforeCommitEvent;
  readonly commitRejected: BomCommitRejectedEvent;
  readonly editEnd: BomEditEndEvent;
  readonly editStateChanged: BomEditStateChangedEvent;
  readonly error: BomRuntimeErrorEvent;
  readonly metric: BomRuntimeMetricEvent;
}

export type BomRuntimeEvent<TFields extends BomFields = BomFields> =
  BomEventMap<TFields>[keyof BomEventMap<TFields>];

export type BomEventDetail<TEvent extends BomRuntimeEvent> = Omit<
  TEvent,
  | 'type'
  | 'instanceId'
  | 'sequence'
  | 'timestamp'
  | (TEvent extends BomRuntimeCancellableEvent
      ? 'cancellable' | 'defaultPrevented' | 'preventDefault'
      : never)
>;

export type BomEventListener<
  TFields extends BomFields,
  K extends keyof BomEventMap<TFields>,
> = (event: Readonly<BomEventMap<TFields>[K]>) => void;

export interface BomEventDispatchError {
  readonly code:
    | 'BOM_EVENT_REENTRANT_DISPATCH'
    | 'BOM_EVENT_SEQUENCE_EXHAUSTED';
  readonly eventType: BomRuntimeEventType;
}

export type BomEventDispatchResult<TEvent extends BomRuntimeEvent> =
  | { readonly ok: true; readonly event: Readonly<TEvent> }
  | { readonly ok: false; readonly error: BomEventDispatchError };
