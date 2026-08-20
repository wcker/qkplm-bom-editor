import type {
  BomCommand,
  BomCommandBatch,
  BomCommit,
  BomDocumentGeneration,
  BomDocumentId,
  BomDocumentSnapshot,
  BomFields,
  BomOperation,
  BomPatch,
  BomProtocolVersion,
  BomSchema,
  BomTransactionId,
  RevisionToken,
} from '@bom-editor/contracts';
import type { BomBaseIndexes } from '@bom-editor/model';
import type { BomError } from '@bom-editor/contracts';

export type BomTransactionResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly errors: readonly BomError[];
    };

export interface BomHistoryBudget {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export interface BomHistoryState extends BomHistoryBudget {
  readonly undoEntries: number;
  readonly redoEntries: number;
  readonly bytes: number;
  readonly evictedEntries: number;
}

export interface BomRevisionFactoryContext {
  readonly documentId: BomDocumentId;
  readonly previousRevision: RevisionToken;
  readonly transactionId: BomTransactionId;
  readonly contentHash: string;
  readonly sequence: number;
}

export interface BomTransactionIdFactoryContext {
  readonly documentId: BomDocumentId;
  readonly sequence: number;
  readonly purpose: 'execute' | 'undo' | 'redo';
}

export interface BomPreparedTransaction<TFields extends BomFields = BomFields> {
  readonly patch: BomPatch<TFields>;
  readonly inversePatch: BomPatch<TFields>;
  readonly previousSnapshot: BomDocumentSnapshot<TFields>;
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly indexes: BomBaseIndexes<TFields>;
  readonly previousRevision: RevisionToken;
  readonly revision: RevisionToken;
  readonly contentHash: string;
}

export type BomBeforeApplyHook<TFields extends BomFields = BomFields> = (
  prepared: BomPreparedTransaction<TFields>,
) => boolean | void;

export interface BomTransactionEngineOptions<TFields extends BomFields = BomFields> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly schema: BomSchema;
  readonly protocolVersion: BomProtocolVersion;
  readonly documentGeneration?: BomDocumentGeneration;
  readonly history?: Partial<BomHistoryBudget>;
  readonly positionKeyMaxBytes?: number;
  readonly beforeApply?: BomBeforeApplyHook<TFields>;
  readonly revisionFactory?: (context: BomRevisionFactoryContext) => RevisionToken;
  readonly transactionIdFactory?: (
    context: BomTransactionIdFactoryContext,
  ) => BomTransactionId;
  readonly timestampFactory?: () => string;
}

export interface BomExecuteOptions {
  readonly baseRevision?: RevisionToken;
  readonly transactionId?: BomTransactionId;
  readonly dependsOnTransactionId?: BomTransactionId;
  readonly origin?: string;
  readonly timestamp?: string;
  readonly idempotencyKey?: string;
}

export interface BomAcknowledgeSourceRevisionRequest {
  readonly sourceRevision: RevisionToken;
  readonly expectedLocalRevision: RevisionToken;
  readonly expectedPriorSourceRevision?: RevisionToken;
}

export interface BomHistoryActionOptions {
  readonly transactionId?: BomTransactionId;
  readonly dependsOnTransactionId?: BomTransactionId;
  readonly origin?: string;
  readonly timestamp?: string;
  readonly idempotencyKey?: string;
}

export interface BomHistorySuffixCommandReplay<
  TFields extends BomFields = BomFields,
> {
  readonly kind: 'commands';
  readonly batch: BomCommandBatch<TFields>;
}

export interface BomHistorySuffixPatchReplay<
  TFields extends BomFields = BomFields,
> {
  readonly kind: 'patch';
  readonly patch: BomPatch<TFields>;
}

export type BomHistorySuffixReplay<
  TFields extends BomFields = BomFields,
> =
  | BomHistorySuffixCommandReplay<TFields>
  | BomHistorySuffixPatchReplay<TFields>;

export interface BomHistorySuffixReconcileRequest<
  TFields extends BomFields = BomFields,
> {
  readonly failedTransactionId: BomTransactionId;
  readonly transactionId: BomTransactionId;
  readonly origin: string;
  readonly timestamp: string;
  readonly descendants: readonly BomHistorySuffixReplay<TFields>[];
  readonly remoteOperations?: readonly BomOperation<TFields>[];
}

export interface BomHistorySuffixReplayMapping<
  TFields extends BomFields = BomFields,
> {
  readonly originalTransactionId: BomTransactionId;
  readonly replayedTransactionId: BomTransactionId;
  readonly commit: BomCommit<TFields>;
}

export interface BomHistorySuffixReconcileResult<
  TFields extends BomFields = BomFields,
> {
  readonly commit: BomCommit<TFields>;
  readonly rollbackRevision: RevisionToken;
  readonly removedTransactionIds: readonly BomTransactionId[];
  readonly rollbackOrder: readonly BomTransactionId[];
  readonly replayed: readonly BomHistorySuffixReplayMapping<TFields>[];
}

export interface BomTransactionEngineApi<TFields extends BomFields = BomFields> {
  getSnapshot(): BomDocumentSnapshot<TFields>;
  getIndexes(): BomBaseIndexes<TFields>;
  getContentHash(): string;
  getHistoryState(): BomHistoryState;
  acknowledgeSourceRevision(
    request: BomAcknowledgeSourceRevisionRequest,
  ): Promise<BomTransactionResult<BomDocumentSnapshot<TFields>>>;
  execute(
    command: BomCommand<TFields>,
    options?: BomExecuteOptions,
  ): Promise<BomTransactionResult<BomCommit<TFields>>>;
  executeBatch(
    batch: BomCommandBatch<TFields>,
  ): Promise<BomTransactionResult<BomCommit<TFields>>>;
  applyPatch(
    patch: BomPatch<TFields>,
  ): Promise<BomTransactionResult<BomCommit<TFields>>>;
  undo(
    options?: BomHistoryActionOptions,
  ): Promise<BomTransactionResult<BomCommit<TFields>>>;
  redo(
    options?: BomHistoryActionOptions,
  ): Promise<BomTransactionResult<BomCommit<TFields>>>;
  reconcileHistorySuffix(
    request: BomHistorySuffixReconcileRequest<TFields>,
  ): Promise<BomTransactionResult<BomHistorySuffixReconcileResult<TFields>>>;
}



