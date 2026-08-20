import type {
  BomCommit,
  BomRecoveryBundle,
  BomTransactionPersistenceState,
} from './commit.js';
import type { BomError } from './error.js';
import type {
  BomDocumentGeneration,
  BomDocumentId,
  BomInstanceId,
  BomTransactionId,
  OccurrenceId,
  RevisionToken,
} from './identifiers.js';
import type { BomPatch } from './patch.js';
import type { BomFields, BomValue } from './value.js';

export type BomEventType =
  | 'ready'
  | 'destroyed'
  | 'capabilitiesChanged'
  | 'beforeTransaction'
  | 'transactionCommitted'
  | 'transactionRejected'
  | 'transactionPersistenceChanged'
  | 'beforeEdit'
  | 'editStart'
  | 'valueChanged'
  | 'beforeCommit'
  | 'commitRejected'
  | 'editEnd'
  | 'documentChanged'
  | 'selectionChanged'
  | 'viewChanged'
  | 'editStateChanged'
  | 'materialMatchAudit'
  | 'beforeDocumentReplace'
  | 'documentReplaced'
  | 'documentReplaceRejected'
  | 'validationChanged'
  | 'taskProgress'
  | 'beforeImport'
  | 'beforeExport'
  | 'exportCompleted'
  | 'exportRejected'
  | 'beforeCopy'
  | 'clipboardCompleted'
  | 'clipboardRejected'
  | 'error'
  | 'metric';

export interface BomEventBase<TType extends BomEventType = BomEventType> {
  readonly type: TType;
  readonly instanceId: BomInstanceId;
  readonly sequence: number;
  readonly timestamp: number;
  readonly documentId?: BomDocumentId;
  readonly documentGeneration?: BomDocumentGeneration;
}

export interface BomCancellableEventBase<
  TType extends
    | 'beforeTransaction'
    | 'beforeEdit'
    | 'beforeCommit'
    | 'beforeDocumentReplace'
    | 'beforeImport'
    | 'beforeExport'
    | 'beforeCopy',
> extends BomEventBase<TType> {
  readonly cancellable: true;
}

export interface BomTransactionEventBase<
  TType extends
    | 'beforeTransaction'
    | 'transactionCommitted'
    | 'transactionPersistenceChanged'
    | 'documentChanged',
  TFields extends BomFields = BomFields,
> extends BomEventBase<TType> {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly transactionId: BomTransactionId;
  readonly origin: string;
  readonly previousRevision: RevisionToken;
  readonly revision: RevisionToken;
  readonly patch: BomPatch<TFields>;
}

export interface BomBeforeTransactionEvent<
  TFields extends BomFields = BomFields,
> extends BomTransactionEventBase<'beforeTransaction', TFields> {
  readonly cancellable: true;
}

export interface BomTransactionCommittedEvent<
  TFields extends BomFields = BomFields,
> extends BomTransactionEventBase<'transactionCommitted', TFields> {
  readonly commit: BomCommit<TFields>;
}

export interface BomTransactionRejectedEvent<
  TFields extends BomFields = BomFields,
> extends BomEventBase<'transactionRejected'> {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly transactionId: BomTransactionId;
  readonly origin: string;
  readonly baseRevision: RevisionToken;
  readonly patch?: BomPatch<TFields>;
  readonly error: BomError;
}

export interface BomTransactionPersistenceChangedEvent<
  TFields extends BomFields = BomFields,
> extends BomTransactionEventBase<'transactionPersistenceChanged', TFields> {
  readonly state: BomTransactionPersistenceState;
  readonly sourceRevision?: RevisionToken;
  readonly recoveryId?: string;
  readonly retryable?: boolean;
  readonly recoveryBundle?: BomRecoveryBundle<TFields>;
  readonly error?: BomError;
}

export interface BomDocumentChangedEvent<
  TFields extends BomFields = BomFields,
> extends BomTransactionEventBase<'documentChanged', TFields> {}

export type BomDocumentSourceType = 'memory' | 'dataSource';

export interface BomDocumentReference {
  readonly documentId: BomDocumentId;
  readonly revision: RevisionToken;
  readonly sourceRevision?: RevisionToken;
  readonly positionKeyCodecVersion: string;
  readonly sourceType: BomDocumentSourceType;
  readonly generation: BomDocumentGeneration;
}

export type BomDocumentReplaceReason =
  | 'setDocument'
  | 'replaceSource'
  | 'reload'
  | 'resync'
  | 'initialLoad'
  /** A validated lazy-child page was staged and atomically published. */
  | 'loadChildren';

export interface BomDocumentReplaceEventBase<
  TType extends
    | 'beforeDocumentReplace'
    | 'documentReplaced'
    | 'documentReplaceRejected',
> extends BomEventBase<TType> {
  readonly previous?: BomDocumentReference;
  readonly next: BomDocumentReference;
  readonly reason: BomDocumentReplaceReason;
}

export interface BomBeforeDocumentReplaceEvent
  extends BomDocumentReplaceEventBase<'beforeDocumentReplace'> {
  readonly cancellable: true;
}

export interface BomDocumentReplacedEvent
  extends BomDocumentReplaceEventBase<'documentReplaced'> {}

export interface BomDocumentReplaceRejectedEvent
  extends BomDocumentReplaceEventBase<'documentReplaceRejected'> {
  readonly error: BomError;
}

export interface BomTaskProgressEvent extends BomEventBase<'taskProgress'> {
  readonly taskId: string;
  readonly taskType: string;
  readonly completed: number;
  readonly total?: number;
  readonly stage: string;
}

/** Value-free lifecycle metadata for an explicitly adopted material match. */
export type BomMaterialMatchAuditDecision =
  | 'proposed'
  | 'approved'
  | 'denied'
  | 'cancelled'
  | 'applied'
  | 'stale'
  | 'invalid'
  | 'failed';

/**
 * Serializable audit envelope for a material-match proposal. The proposal
 * capability and all material values remain instance-local and are never
 * included in this cross-boundary event.
 */
export interface BomMaterialMatchAuditEvent
  extends BomEventBase<'materialMatchAudit'> {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  /** Revision to which the signed proposal was bound. */
  readonly baseRevision: RevisionToken;
  readonly proposalId: string;
  readonly decision: BomMaterialMatchAuditDecision;
  readonly targetOccurrenceId: OccurrenceId;
  readonly candidateOccurrenceId: OccurrenceId;
  readonly algorithmVersion: string;
  readonly score: number;
  readonly confidence: number;
  readonly decisionId?: string;
  readonly reasonCode?: string;
  readonly transactionId?: BomTransactionId;
}

export interface BomErrorEvent extends BomEventBase<'error'> {
  readonly error: BomError;
}

export interface BomMetricEvent extends BomEventBase<'metric'> {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly labels?: Readonly<Record<string, string>>;
}

export type BomGenericCancellableEventType =
  | 'beforeEdit'
  | 'beforeCommit'
  | 'beforeImport'
  | 'beforeExport'
  | 'beforeCopy';

export type BomGenericEventType = Exclude<
  BomEventType,
  | 'beforeTransaction'
  | 'transactionCommitted'
  | 'transactionRejected'
  | 'transactionPersistenceChanged'
  | 'documentChanged'
  | 'beforeDocumentReplace'
  | 'documentReplaced'
  | 'documentReplaceRejected'
  | 'taskProgress'
  | 'materialMatchAudit'
  | 'error'
  | 'metric'
  | BomGenericCancellableEventType
>;

export interface BomGenericCancellableEvent<
  TType extends BomGenericCancellableEventType = BomGenericCancellableEventType,
> extends BomCancellableEventBase<TType> {
  readonly payload: BomValue;
}

export interface BomGenericEvent<
  TType extends BomGenericEventType = BomGenericEventType,
> extends BomEventBase<TType> {
  readonly payload: BomValue;
}

export type BomCoreEvent<TFields extends BomFields = BomFields> =
  | BomBeforeTransactionEvent<TFields>
  | BomTransactionCommittedEvent<TFields>
  | BomTransactionRejectedEvent<TFields>
  | BomTransactionPersistenceChangedEvent<TFields>
  | BomDocumentChangedEvent<TFields>
  | BomBeforeDocumentReplaceEvent
  | BomDocumentReplacedEvent
  | BomDocumentReplaceRejectedEvent
  | BomTaskProgressEvent
  | BomMaterialMatchAuditEvent
  | BomErrorEvent
  | BomMetricEvent
  | BomGenericCancellableEvent
  | BomGenericEvent;
