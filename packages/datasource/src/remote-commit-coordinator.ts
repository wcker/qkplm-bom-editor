import type {
  BomCommand,
  BomCommit,
  BomCommitResponse,
  BomDocumentGeneration,
  BomDocumentId,
  BomError,
  BomFields,
  BomOperation,
  BomPatch,
  BomRecoveryBundle,
  BomResult,
  BomTransactionId,
  BomTransactionPersistenceState,
  RevisionToken,
} from '@bom-editor/contracts';
import { normalizeBomValue } from '@bom-editor/model';
import {
  BOM_DATASOURCE_ERROR_CODES,
  dataSourceError,
  dataSourceFailure,
  dataSourceSuccess,
} from './errors.js';
import type { BomDataSource } from './types.js';

export interface BomRemoteDocumentContext {
  readonly protocolVersion: string;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly schemaVersion: string;
  readonly positionKeyCodecVersion: string;
  readonly sourceRevision: RevisionToken;
}

export interface BomRemoteCommitSubmission<
  TFields extends BomFields = BomFields,
> {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly commit: BomCommit<TFields>;
  readonly commands: readonly BomCommand<TFields>[];
}

export type BomRemoteCommitFailure<TFields extends BomFields = BomFields> =
  | Extract<BomCommitResponse<TFields>, { readonly status: 'rejected' }>
  | Extract<BomCommitResponse<TFields>, { readonly status: 'conflicted' }>;

export interface BomAtomicRollbackRequest<
  TFields extends BomFields = BomFields,
> {
  readonly context: BomRemoteDocumentContext;
  readonly sourceRevision: RevisionToken;
  readonly failedTransaction: BomRemoteCommitSubmission<TFields>;
  readonly descendants: readonly BomRemoteCommitSubmission<TFields>[];
  readonly rollbackOrder: readonly BomRemoteCommitSubmission<TFields>[];
  readonly failure: BomRemoteCommitFailure<TFields>;
}

export type BomAtomicRollbackResult = BomResult<{
  readonly revision: RevisionToken;
}>;

export interface BomIsolatedReplayRequest<
  TFields extends BomFields = BomFields,
> {
  readonly context: BomRemoteDocumentContext;
  readonly sourceRevision: RevisionToken;
  readonly baseRevision: RevisionToken;
  readonly failedTransaction: BomRemoteCommitSubmission<TFields>;
  readonly descendants: readonly BomRemoteCommitSubmission<TFields>[];
  readonly failure: BomRemoteCommitFailure<TFields>;
}

export interface BomIsolatedReplaySuccess<
  TFields extends BomFields = BomFields,
> {
  readonly ok: true;
  readonly revision: RevisionToken;
  readonly transactions: readonly BomRemoteCommitSubmission<TFields>[];
}

export interface BomIsolatedReplayFailure {
  readonly ok: false;
  readonly failedTransactionId: BomTransactionId;
  readonly error: BomError;
}

export type BomIsolatedReplayResult<TFields extends BomFields = BomFields> =
  | BomIsolatedReplaySuccess<TFields>
  | BomIsolatedReplayFailure;

export interface BomRemoteCommitCoordinatorHooks<
  TFields extends BomFields = BomFields,
> {
  /**
   * For a conflict, this atomic step must first reconcile the reported
   * remoteOperations (or fail and require reload) before returning success.
   */
  rollbackAtomically(
    request: BomAtomicRollbackRequest<TFields>,
  ): Promise<BomAtomicRollbackResult>;
  /** Replays all descendants on the already reconciled rollback baseline. */
  replayInIsolation(
    request: BomIsolatedReplayRequest<TFields>,
  ): Promise<BomIsolatedReplayResult<TFields>>;
}

export type BomRemoteCommitAuditAction =
  | 'enqueued'
  | 'dispatchStarted'
  | 'cancelStarted'
  | 'cancelled'
  | 'cancelDeclined'
  | 'acknowledged'
  | 'rejected'
  | 'conflicted'
  | 'rollbackStarted'
  | 'rolledBack'
  | 'replayStarted'
  | 'rebased'
  | 'requeued'
  | 'reloadRequired'
  | 'retryScheduled'
  | 'resynced'
  | 'stale'
  | 'aborted';

export interface BomRemoteCommitAuditEvent {
  readonly sequence: number;
  readonly timestamp: string;
  readonly action: BomRemoteCommitAuditAction;
  readonly persistenceState?: BomTransactionPersistenceState;
  readonly protocolVersion: string;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly transactionId: BomTransactionId;
  readonly dependsOnTransactionId?: BomTransactionId;
  readonly revision: RevisionToken;
  readonly sourceRevision: RevisionToken;
  readonly reportedSourceRevision?: RevisionToken;
  readonly failedTransactionId?: BomTransactionId;
  readonly descendantCount: number;
  readonly queueDepth: number;
  readonly attempt: number;
  readonly errorCode?: string;
  readonly errorCategory?: BomError['category'];
  readonly recoveryId?: string;
}

export interface BomRemoteRecoveryState<
  TFields extends BomFields = BomFields,
> {
  readonly recoveryId: string;
  readonly retryable: boolean;
  readonly bundle: BomRecoveryBundle<TFields>;
  readonly error: BomError;
}

export type BomRemoteCommitOutcome<TFields extends BomFields = BomFields> =
  | {
      readonly status: 'acknowledged';
      readonly sourceRevision: RevisionToken;
    }
  | {
      readonly status: 'rejected';
      readonly response: Extract<
        BomCommitResponse<TFields>,
        { readonly status: 'rejected' }
      >;
    }
  | {
      readonly status: 'conflicted';
      readonly response: Extract<
        BomCommitResponse<TFields>,
        { readonly status: 'conflicted' }
      >;
    }
  | ({ readonly status: 'reloadRequired' } & BomRemoteRecoveryState<TFields>)
  | {
      readonly status: 'cancelled';
      readonly sourceRevision: RevisionToken;
    }
  | {
      readonly status: 'stale';
      readonly reason: 'documentReplaced' | 'contextInvalidated';
    }
  | {
      readonly status: 'aborted';
      readonly reason: 'destroyed';
    };

export interface BomRemoteCommitReceipt<
  TFields extends BomFields = BomFields,
> {
  readonly submission: BomRemoteCommitSubmission<TFields>;
  readonly outcome: Promise<BomRemoteCommitOutcome<TFields>>;
}

export interface BomRemoteResyncResolution {
  readonly recoveryId: string;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly sourceRevision: RevisionToken;
}

export interface BomRemoteCommitCancelResult {
  readonly cancelled: boolean;
  readonly sourceRevision: RevisionToken;
}

export type BomRemoteCommitCoordinatorMode =
  | 'active'
  | 'recovering'
  | 'reloadRequired'
  | 'stale'
  | 'destroyed';

export type BomRemoteCommitCoordinatorIdleResult<
  TFields extends BomFields = BomFields,
> =
  | {
      readonly status: 'idle';
      readonly sourceRevision: RevisionToken;
    }
  | ({ readonly status: 'reloadRequired' } & BomRemoteRecoveryState<TFields>)
  | {
      readonly status: 'stale';
      readonly context: BomRemoteDocumentContext;
    }
  | { readonly status: 'destroyed' };

export interface BomRemoteCommitCoordinatorOptions<
  TFields extends BomFields = BomFields,
> {
  readonly dataSource: BomDataSource<TFields>;
  readonly context: BomRemoteDocumentContext;
  readonly hooks: BomRemoteCommitCoordinatorHooks<TFields>;
  readonly isCurrentDocument?: (context: BomRemoteDocumentContext) => boolean;
  readonly audit?: (event: BomRemoteCommitAuditEvent) => void;
  readonly now?: () => string;
  readonly idFactory?: () => string;
}

export interface BomRemoteCommitCoordinator<
  TFields extends BomFields = BomFields,
> {
  readonly context: BomRemoteDocumentContext;
  readonly sourceRevision: RevisionToken;
  readonly pendingCount: number;
  readonly mode: BomRemoteCommitCoordinatorMode;
  enqueue(
    submission: BomRemoteCommitSubmission<TFields>,
  ): BomResult<BomRemoteCommitReceipt<TFields>>;
  whenIdle(): Promise<BomRemoteCommitCoordinatorIdleResult<TFields>>;
  retryIndeterminate(
    recoveryId: string,
  ): BomResult<readonly BomRemoteCommitReceipt<TFields>[]>;
  cancelPending(
    transactionId: BomTransactionId,
  ): Promise<BomResult<BomRemoteCommitCancelResult>>;
  resolveAfterResync(request: BomRemoteResyncResolution): BomResult<true>;
  replaceDocument(context: BomRemoteDocumentContext): BomResult<true>;
  destroy(): void;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

interface PendingRecord<TFields extends BomFields> {
  submission: BomRemoteCommitSubmission<TFields>;
  readonly deferred: Deferred<BomRemoteCommitOutcome<TFields>>;
  settled: boolean;
  attempt: number;
}

interface SuspendedState<TFields extends BomFields> {
  readonly recovery: BomRemoteRecoveryState<TFields>;
  readonly records: readonly PendingRecord<TFields>[];
}

const ERROR_CATEGORIES = new Set<BomError['category']>([
  'CONFIG', 'DATA', 'VALIDATION', 'CONFLICT', 'ABORTED', 'IO', 'PLUGIN',
  'WORKER', 'RENDER', 'SECURITY_LIMIT', 'INTERNAL',
]);

const LOCAL_AUDIT_ERROR_CODES: ReadonlySet<string> = new Set(
  Object.values(BOM_DATASOURCE_ERROR_CODES),
);

let fallbackRecoverySequence = 0;

export function createBomRemoteCommitCoordinator<
  TFields extends BomFields = BomFields,
>(
  options: BomRemoteCommitCoordinatorOptions<TFields>,
): BomResult<BomRemoteCommitCoordinator<TFields>> {
  try {
    const context = captureContext(options.context);
    if (
      context === undefined ||
      !isRecord(options.dataSource) ||
      options.dataSource.capabilities?.writable !== true ||
      typeof options.dataSource.commit !== 'function' ||
      !isRecord(options.hooks) ||
      typeof options.hooks.rollbackAtomically !== 'function' ||
      typeof options.hooks.replayInIsolation !== 'function' ||
      (options.isCurrentDocument !== undefined &&
        typeof options.isCurrentDocument !== 'function') ||
      (options.audit !== undefined && typeof options.audit !== 'function') ||
      (options.now !== undefined && typeof options.now !== 'function') ||
      (options.idFactory !== undefined && typeof options.idFactory !== 'function')
    ) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorConfigInvalid,
          'CONFIG',
        ),
      );
    }
    return dataSourceSuccess(
      new RemoteCommitCoordinatorImpl<TFields>(options, context),
    );
  } catch {
    return dataSourceFailure(
      coordinatorError(
        BOM_DATASOURCE_ERROR_CODES.coordinatorConfigInvalid,
        'CONFIG',
      ),
    );
  }
}

class RemoteCommitCoordinatorImpl<TFields extends BomFields>
  implements BomRemoteCommitCoordinator<TFields>
{
  readonly #dataSource: BomDataSource<TFields>;
  readonly #hooks: BomRemoteCommitCoordinatorHooks<TFields>;
  readonly #isCurrentDocument:
    | ((context: BomRemoteDocumentContext) => boolean)
    | undefined;
  readonly #audit: ((event: BomRemoteCommitAuditEvent) => void) | undefined;
  readonly #nowFactory: (() => string) | undefined;
  readonly #idFactory: (() => string) | undefined;
  readonly #transactionIds = new Set<BomTransactionId>();
  readonly #idempotencyKeys = new Set<string>();
  readonly #recoveryIds = new Set<string>();
  readonly #idleWaiters: Deferred<
    BomRemoteCommitCoordinatorIdleResult<TFields>
  >[] = [];
  #context: BomRemoteDocumentContext;
  #sourceRevision: RevisionToken;
  #queue: PendingRecord<TFields>[] = [];
  #mode: BomRemoteCommitCoordinatorMode = 'active';
  #inFlight: PendingRecord<TFields> | undefined;
  #activeController: AbortController | undefined;
  #cancelController: AbortController | undefined;
  #cancellingRecord: PendingRecord<TFields> | undefined;
  #suspended: SuspendedState<TFields> | undefined;
  #auditSequence = 0;
  #epoch = 0;
  #queueVersion = 0;
  #drainScheduled = false;

  public constructor(
    options: BomRemoteCommitCoordinatorOptions<TFields>,
    context: BomRemoteDocumentContext,
  ) {
    this.#dataSource = options.dataSource;
    this.#hooks = options.hooks;
    this.#isCurrentDocument = options.isCurrentDocument;
    this.#audit = options.audit;
    this.#nowFactory = options.now;
    this.#idFactory = options.idFactory;
    this.#context = context;
    this.#sourceRevision = context.sourceRevision;
    Object.seal(this);
  }

  public get context(): BomRemoteDocumentContext { return this.#context; }
  public get sourceRevision(): RevisionToken { return this.#sourceRevision; }
  public get pendingCount(): number { return this.#queue.length; }
  public get mode(): BomRemoteCommitCoordinatorMode { return this.#mode; }

  public enqueue(
    input: BomRemoteCommitSubmission<TFields>,
  ): BomResult<BomRemoteCommitReceipt<TFields>> {
    if (this.#mode === 'destroyed') {
      return dataSourceFailure(
        coordinatorError(BOM_DATASOURCE_ERROR_CODES.destroyed, 'CONFIG'),
      );
    }
    if (this.#mode !== 'active' || this.#cancellingRecord !== undefined) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorSuspended,
          'CONFLICT',
        ),
      );
    }
    const currentEpoch = this.#epoch;
    const currentContext = this.#context;
    const currentQueueVersion = this.#queueVersion;
    const currentHead = this.#queue[0];
    const isCurrent = this.#isCurrent();
    if (
      currentEpoch !== this.#epoch || currentContext !== this.#context ||
      currentQueueVersion !== this.#queueVersion ||
      currentHead !== this.#queue[0] || this.#mode !== 'active'
    ) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch, 'CONFLICT',
        ),
      );
    }
    if (!isCurrent) {
      this.#invalidateCurrentContext();
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch,
          'CONFLICT',
        ),
      );
    }
    const captured = captureSubmission<TFields>(input, this.#context);
    if (!captured.ok) return captured;
    const transactionId = captured.value.commit.transactionId;
    const idempotencyKey = captured.value.commit.patch.idempotencyKey!;
    if (this.#transactionIds.has(transactionId)) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorTransactionDuplicate,
          'CONFLICT', { transactionId },
        ),
      );
    }
    if (this.#idempotencyKeys.has(idempotencyKey)) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.idempotencyReused,
          'CONFLICT', { transactionId },
        ),
      );
    }
    const predecessor = this.#queue.at(-1);
    if (
      predecessor !== undefined &&
      captured.value.commit.previousRevision !==
        predecessor.submission.commit.revision
    ) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorDependencyMismatch,
          'CONFLICT', { transactionId },
        ),
      );
    }
    const submission = withDependency(
      captured.value,
      predecessor?.submission.commit.transactionId ??
        (captured.value.commit.patch.dependsOnTransactionId !== undefined &&
        this.#transactionIds.has(
          captured.value.commit.patch.dependsOnTransactionId,
        )
          ? captured.value.commit.patch.dependsOnTransactionId
          : undefined),
    );
    const pending: PendingRecord<TFields> = {
      submission,
      deferred: createDeferred<BomRemoteCommitOutcome<TFields>>(),
      settled: false,
      attempt: 0,
    };
    this.#transactionIds.add(transactionId);
    this.#idempotencyKeys.add(idempotencyKey);
    this.#queue.push(pending);
    this.#queueVersion += 1;
    this.#emit('enqueued', pending, 'pending');
    this.#scheduleDrain();
    return dataSourceSuccess(
      Object.freeze({ submission, outcome: pending.deferred.promise }),
    );
  }

  public whenIdle(): Promise<BomRemoteCommitCoordinatorIdleResult<TFields>> {
    const current = this.#idleResult();
    if (current !== undefined) return Promise.resolve(current);
    const deferred = createDeferred<
      BomRemoteCommitCoordinatorIdleResult<TFields>
    >();
    this.#idleWaiters.push(deferred);
    return deferred.promise;
  }

  public retryIndeterminate(
    recoveryId: string,
  ): BomResult<readonly BomRemoteCommitReceipt<TFields>[]> {
    const suspended = this.#suspended;
    if (
      this.#mode !== 'reloadRequired' || suspended === undefined ||
      !suspended.recovery.retryable ||
      suspended.recovery.recoveryId !== recoveryId
    ) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorSuspended, 'CONFLICT',
        ),
      );
    }
    const retryEpoch = this.#epoch;
    const retryContext = this.#context;
    const retryQueueVersion = this.#queueVersion;
    const retryIsCurrent = this.#isCurrent();
    if (
      retryEpoch !== this.#epoch || retryContext !== this.#context ||
      retryQueueVersion !== this.#queueVersion ||
      this.#mode !== 'reloadRequired' || this.#suspended !== suspended
    ) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch, 'CONFLICT',
        ),
      );
    }
    if (!retryIsCurrent) {
      this.#invalidateCurrentContext();
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch, 'CONFLICT',
        ),
      );
    }
    const retryRecords = this.#queue.map((record): PendingRecord<TFields> => ({
      submission: record.submission,
      deferred: createDeferred<BomRemoteCommitOutcome<TFields>>(),
      settled: false,
      attempt: record.attempt,
    }));
    this.#queue = retryRecords;
    this.#queueVersion += 1;
    this.#suspended = undefined;
    this.#mode = 'active';
    const epoch = this.#epoch;
    for (const record of this.#queue) {
      this.#emit('retryScheduled', record, 'pending', {
        failedTransactionId: this.#queue[0]!.submission.commit.transactionId,
      });
      if (epoch !== this.#epoch || this.#mode !== 'active') break;
    }
    this.#scheduleDrain();
    return dataSourceSuccess(Object.freeze(retryRecords.map((record) =>
      Object.freeze({
        submission: record.submission,
        outcome: record.deferred.promise,
      }),
    )));
  }

  public cancelPending(
    transactionId: BomTransactionId,
  ): Promise<BomResult<BomRemoteCommitCancelResult>> {
    if (!isNonEmptyString(transactionId)) {
      return Promise.resolve(dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorTransactionInvalid,
          'VALIDATION',
        ),
      ));
    }
    if (this.#mode === 'destroyed') {
      return Promise.resolve(dataSourceFailure(
        coordinatorError(BOM_DATASOURCE_ERROR_CODES.destroyed, 'CONFIG'),
      ));
    }
    if (this.#mode !== 'active' || this.#cancellingRecord !== undefined) {
      return Promise.resolve(dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorSuspended, 'CONFLICT',
          { transactionId },
        ),
      ));
    }
    const record = this.#queue.at(-1);
    if (
      record === undefined ||
      record.submission.commit.transactionId !== transactionId
    ) {
      return Promise.resolve(dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorDependencyMismatch,
          'CONFLICT', { transactionId },
        ),
      ));
    }
    if (this.#inFlight !== record) {
      this.#queue.pop();
      this.#queueVersion += 1;
      this.#settleOutcome(record, {
        status: 'cancelled', sourceRevision: this.#sourceRevision,
      });
      this.#emit('cancelled', record, undefined);
      this.#continueOrSettle();
      return Promise.resolve(dataSourceSuccess(Object.freeze({
        cancelled: true,
        sourceRevision: this.#sourceRevision,
      })));
    }
    if (
      this.#dataSource.capabilities.cancelPendingCommit !== true ||
      typeof this.#dataSource.cancelCommit !== 'function'
    ) {
      this.#emit('cancelDeclined', record, undefined);
      return Promise.resolve(dataSourceSuccess(Object.freeze({
        cancelled: false,
        sourceRevision: this.#sourceRevision,
      })));
    }
    const epoch = this.#epoch;
    const context = this.#context;
    const queueVersion = this.#queueVersion;
    const controller = new AbortController();
    this.#cancellingRecord = record;
    this.#cancelController = controller;
    this.#emit('cancelStarted', record, undefined);
    if (
      epoch !== this.#epoch || context !== this.#context ||
      queueVersion !== this.#queueVersion || !this.#ownsResponse(epoch, record) ||
      this.#cancellingRecord !== record
    ) {
      this.#clearCancellation(record);
      return Promise.resolve(dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch,
          'CONFLICT', { transactionId },
        ),
      ));
    }
    return this.#cancelInFlight(record, controller, epoch, context);
  }

  public resolveAfterResync(input: BomRemoteResyncResolution): BomResult<true> {
    const request = captureResyncResolution(input);
    if (request === undefined) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorTransactionInvalid,
          'VALIDATION',
        ),
      );
    }
    const suspended = this.#suspended;
    if (
      this.#mode !== 'reloadRequired' || suspended === undefined ||
      suspended.recovery.recoveryId !== request.recoveryId ||
      request.documentId !== this.#context.documentId ||
      request.documentGeneration !== this.#context.documentGeneration ||
      !isNonEmptyString(request.sourceRevision)
    ) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorSuspended, 'CONFLICT',
        ),
      );
    }
    const resyncEpoch = this.#epoch;
    const resyncContext = this.#context;
    const resyncQueueVersion = this.#queueVersion;
    const resyncIsCurrent = this.#isCurrent();
    if (
      resyncEpoch !== this.#epoch || resyncContext !== this.#context ||
      resyncQueueVersion !== this.#queueVersion ||
      this.#mode !== 'reloadRequired' || this.#suspended !== suspended
    ) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch, 'CONFLICT',
        ),
      );
    }
    if (!resyncIsCurrent) {
      this.#invalidateCurrentContext();
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch, 'CONFLICT',
        ),
      );
    }
    const records = [...this.#queue];
    this.#queue = [];
    this.#queueVersion += 1;
    this.#suspended = undefined;
    this.#advanceSourceRevision(request.sourceRevision);
    this.#mode = 'active';
    this.#settleIdle(Object.freeze({
      status: 'idle', sourceRevision: this.#sourceRevision,
    }));
    const epoch = this.#epoch;
    for (const record of records) {
      this.#emit('resynced', record, 'reloadRequired', {
        failedTransactionId: suspended.recovery.bundle.failedTransactionId,
        recoveryId: request.recoveryId,
      });
      if (epoch !== this.#epoch || this.#mode !== 'active') break;
    }
    return dataSourceSuccess(true);
  }

  public replaceDocument(contextInput: BomRemoteDocumentContext): BomResult<true> {
    if (this.#mode === 'destroyed') {
      return dataSourceFailure(
        coordinatorError(BOM_DATASOURCE_ERROR_CODES.destroyed, 'CONFIG'),
      );
    }
    const context = captureContext(contextInput);
    if (context === undefined) {
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.coordinatorConfigInvalid, 'CONFIG',
        ),
      );
    }
    const previousContext = this.#context;
    const records = [...this.#queue];
    this.#epoch += 1;
    const epoch = this.#epoch;
    this.#activeController?.abort();
    this.#cancelController?.abort();
    this.#cancelController = undefined;
    this.#cancellingRecord = undefined;
    this.#activeController = undefined;
    this.#inFlight = undefined;
    this.#queue = [];
    this.#queueVersion += 1;
    this.#suspended = undefined;
    this.#mode = 'stale';
    for (const record of records) {
      this.#settleOutcome(record, {
        status: 'stale', reason: 'documentReplaced',
      });
    }
    this.#settleIdle(Object.freeze({
      status: 'stale', context: previousContext,
    }));
    for (const record of records) {
      this.#emit('stale', record, undefined);
      if (epoch !== this.#epoch || this.#mode !== 'stale') {
        return dataSourceSuccess(true);
      }
    }
    this.#context = context;
    this.#sourceRevision = context.sourceRevision;
    this.#mode = 'active';
    return dataSourceSuccess(true);
  }

  public destroy(): void {
    if (this.#mode === 'destroyed') return;
    const records = [...this.#queue];
    this.#epoch += 1;
    this.#activeController?.abort();
    this.#cancelController?.abort();
    this.#cancelController = undefined;
    this.#cancellingRecord = undefined;
    this.#activeController = undefined;
    this.#inFlight = undefined;
    this.#queue = [];
    this.#queueVersion += 1;
    this.#suspended = undefined;
    this.#mode = 'destroyed';
    for (const record of records) {
      this.#settleOutcome(record, { status: 'aborted', reason: 'destroyed' });
    }
    this.#settleIdle(Object.freeze({ status: 'destroyed' }));
    for (const record of records) {
      this.#emit('aborted', record, undefined);
    }
  }

  #scheduleDrain(): void {
    if (this.#drainScheduled || this.#mode !== 'active') return;
    this.#drainScheduled = true;
    queueMicrotask(() => {
      this.#drainScheduled = false;
      void this.#drain();
    });
  }

  async #drain(): Promise<void> {
    if (
      this.#mode !== 'active' || this.#inFlight !== undefined ||
      this.#queue.length === 0
    ) return;
    const initialEpoch = this.#epoch;
    const initialContext = this.#context;
    const initialQueueVersion = this.#queueVersion;
    const initialHead = this.#queue[0];
    const isCurrent = this.#isCurrent();
    if (
      initialEpoch !== this.#epoch || initialContext !== this.#context ||
      initialQueueVersion !== this.#queueVersion ||
      initialHead !== this.#queue[0] || this.#mode !== 'active'
    ) return;
    if (!isCurrent) {
      this.#invalidateCurrentContext();
      return;
    }
    const record = this.#queue[0]!;
    const epoch = this.#epoch;
    const controller = new AbortController();
    this.#inFlight = record;
    this.#activeController = controller;
    record.attempt += 1;
    this.#emit('dispatchStarted', record, 'pending');
    if (!this.#ownsResponse(epoch, record)) return;
    const stillCurrent = this.#isCurrent();
    if (!this.#ownsResponse(epoch, record)) return;
    if (!stillCurrent) {
      this.#invalidateCurrentContext();
      return;
    }
    let rawResponse: unknown;
    try {
      rawResponse = await this.#dataSource.commit!({
        patch: record.submission.commit.patch,
        expectedSourceRevision: this.#sourceRevision,
        signal: controller.signal,
      });
    } catch {
      if (!this.#ownsResponse(epoch, record)) return;
      this.#clearCancellation(record, true);
      const catchContextCurrent = this.#isCurrent();
      if (!this.#ownsResponse(epoch, record)) return;
      if (!catchContextCurrent) {
        this.#invalidateCurrentContext();
        return;
      }
      this.#inFlight = undefined;
      this.#activeController = undefined;
      this.#suspend(
        [...this.#queue],
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.commitIndeterminate, 'IO',
          { transactionId: record.submission.commit.transactionId },
        ),
        true,
        record.submission.commit.transactionId,
      );
      return;
    }
    if (!this.#ownsResponse(epoch, record)) return;
    this.#clearCancellation(record, true);
    const responseContextCurrent = this.#isCurrent();
    if (!this.#ownsResponse(epoch, record)) return;
    if (!responseContextCurrent) {
      this.#invalidateCurrentContext();
      return;
    }
    this.#inFlight = undefined;
    this.#activeController = undefined;
    const response = captureCommitResponse<TFields>(rawResponse);
    if (response === undefined) {
      this.#suspend(
        [...this.#queue],
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.protocolViolation, 'DATA',
          { transactionId: record.submission.commit.transactionId },
        ),
        false,
        record.submission.commit.transactionId,
      );
      return;
    }
    if (response.status === 'acknowledged') {
      this.#advanceSourceRevision(response.sourceRevision);
      this.#queue.shift();
      this.#queueVersion += 1;
      this.#settleOutcome(record, {
        status: 'acknowledged', sourceRevision: response.sourceRevision,
      });
      this.#emit('acknowledged', record, 'acknowledged');
      if (epoch !== this.#epoch) return;
      this.#continueOrSettle();
      return;
    }
    await this.#recoverExplicitFailure(record, response, epoch);
  }

  async #cancelInFlight(
    record: PendingRecord<TFields>,
    controller: AbortController,
    epoch: number,
    context: BomRemoteDocumentContext,
  ): Promise<BomResult<BomRemoteCommitCancelResult>> {
    const transactionId = record.submission.commit.transactionId;
    const idempotencyKey = record.submission.commit.patch.idempotencyKey!;
    let response: unknown;
    try {
      response = await this.#dataSource.cancelCommit!({
        transactionId, idempotencyKey, signal: controller.signal,
      });
    } catch {
      this.#clearCancellation(record);
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.externalFailure, 'IO', { transactionId },
        ),
      );
    }
    if (
      epoch !== this.#epoch || context !== this.#context ||
      this.#cancellingRecord !== record || !this.#ownsResponse(epoch, record)
    ) {
      this.#clearCancellation(record);
      return dataSourceSuccess(Object.freeze({
        cancelled: false,
        sourceRevision: this.#sourceRevision,
      }));
    }
    if (
      !isRecord(response) || typeof response['cancelled'] !== 'boolean' ||
      (response['sourceRevision'] !== undefined &&
        !isNonEmptyString(response['sourceRevision']))
    ) {
      this.#clearCancellation(record);
      return dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.protocolViolation, 'DATA', { transactionId },
        ),
      );
    }
    if (response['cancelled'] !== true) {
      this.#clearCancellation(record);
      this.#emit('cancelDeclined', record, undefined);
      return dataSourceSuccess(Object.freeze({
        cancelled: false,
        sourceRevision: this.#sourceRevision,
      }));
    }
    const reportedSourceRevision = response['sourceRevision'];
    if (isNonEmptyString(reportedSourceRevision)) {
      this.#advanceSourceRevision(reportedSourceRevision);
    }
    this.#activeController?.abort();
    this.#activeController = undefined;
    this.#inFlight = undefined;
    this.#queue.pop();
    this.#queueVersion += 1;
    this.#clearCancellation(record);
    this.#settleOutcome(record, {
      status: 'cancelled', sourceRevision: this.#sourceRevision,
    });
    this.#emit('cancelled', record, undefined);
    this.#continueOrSettle();
    return dataSourceSuccess(Object.freeze({
      cancelled: true,
      sourceRevision: this.#sourceRevision,
    }));
  }

  #clearCancellation(
    record: PendingRecord<TFields>,
    abort = false,
  ): void {
    if (this.#cancellingRecord !== record) return;
    if (abort) this.#cancelController?.abort();
    this.#cancelController = undefined;
    this.#cancellingRecord = undefined;
  }

  async #recoverExplicitFailure(
    failedRecord: PendingRecord<TFields>,
    failure: BomRemoteCommitFailure<TFields>,
    epoch: number,
  ): Promise<void> {
    this.#mode = 'recovering';
    const records = [...this.#queue];
    const descendants = records.slice(1);
    const failureError =
      failure.status === 'rejected' ? failure.error : undefined;
    this.#emit(failure.status, failedRecord, failure.status, {
      ...(failure.status === 'conflicted'
        ? { reportedSourceRevision: failure.sourceRevision }
        : {}),
      ...(failureError === undefined ? {} : { error: failureError }),
    });
    if (!this.#ownsRecovery(epoch, failedRecord)) return;

    const rollbackOrder = [...records].reverse();
    for (const record of rollbackOrder) {
      this.#emit('rollbackStarted', record, undefined, {
        failedTransactionId: failedRecord.submission.commit.transactionId,
      });
      if (!this.#ownsRecovery(epoch, failedRecord)) return;
    }
    let rollback: BomAtomicRollbackResult;
    try {
      rollback = await this.#hooks.rollbackAtomically(Object.freeze({
        context: this.#context,
        sourceRevision: this.#sourceRevision,
        failedTransaction: failedRecord.submission,
        descendants: Object.freeze(
          descendants.map((record) => record.submission),
        ),
        rollbackOrder: Object.freeze(
          rollbackOrder.map((record) => record.submission),
        ),
        failure,
      }));
    } catch {
      rollback = dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.recoveryFailed, 'INTERNAL',
          { transactionId: failedRecord.submission.commit.transactionId },
        ),
      );
    }
    if (!this.#ownsRecovery(epoch, failedRecord)) return;
    if (!isRollbackResult(rollback)) {
      rollback = dataSourceFailure(
        coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.recoveryFailed, 'INTERNAL',
          { transactionId: failedRecord.submission.commit.transactionId },
        ),
      );
    }
    if (!rollback.ok) {
      this.#suspend(
        records, rollback.error, false,
        failedRecord.submission.commit.transactionId,
        undefined,
        failure.status === 'conflicted'
          ? failure.sourceRevision
          : undefined,
      );
      return;
    }
    for (const record of rollbackOrder) {
      this.#emit('rolledBack', record, 'rolledBack', {
        failedTransactionId: failedRecord.submission.commit.transactionId,
      });
      if (!this.#ownsRecovery(epoch, failedRecord)) return;
    }
    if (descendants.length === 0) {
      this.#queue.shift();
      this.#queueVersion += 1;
      this.#acceptConflictSourceRevision(failure);
      this.#settleExplicitFailure(failedRecord, failure);
      this.#mode = 'active';
      this.#continueOrSettle();
      return;
    }

    for (const record of descendants) {
      this.#emit('replayStarted', record, 'rolledBack', {
        failedTransactionId: failedRecord.submission.commit.transactionId,
      });
      if (!this.#ownsRecovery(epoch, failedRecord)) return;
    }
    let replay: BomIsolatedReplayResult<TFields>;
    try {
      replay = await this.#hooks.replayInIsolation(Object.freeze({
        context: this.#context,
        sourceRevision: this.#sourceRevision,
        baseRevision: rollback.value.revision,
        failedTransaction: failedRecord.submission,
        descendants: Object.freeze(
          descendants.map((record) => record.submission),
        ),
        failure,
      }));
    } catch {
      replay = Object.freeze({
        ok: false,
        failedTransactionId:
          descendants[0]!.submission.commit.transactionId,
        error: coordinatorError(
          BOM_DATASOURCE_ERROR_CODES.recoveryFailed, 'INTERNAL',
          { transactionId: descendants[0]!.submission.commit.transactionId },
        ),
      });
    }
    if (!this.#ownsRecovery(epoch, failedRecord)) return;
    const capturedReplay = captureReplayResult(
      replay, descendants, rollback.value.revision, this.#context,
    );
    if (!capturedReplay.ok) {
      this.#queue.shift();
      this.#queueVersion += 1;
      this.#settleExplicitFailure(failedRecord, failure);
      this.#suspend(
        descendants, capturedReplay.error, false,
        capturedReplay.failedTransactionId,
        rollback.value.revision,
        failure.status === 'conflicted'
          ? failure.sourceRevision
          : undefined,
      );
      return;
    }
    this.#acceptConflictSourceRevision(failure);
    for (let index = 0; index < descendants.length; index += 1) {
      const record = descendants[index]!;
      record.submission = capturedReplay.transactions[index]!;
    }
    for (const record of descendants) {
      this.#emit('rebased', record, 'rebased', {
        failedTransactionId: failedRecord.submission.commit.transactionId,
      });
      if (!this.#ownsRecovery(epoch, failedRecord)) return;
      this.#emit('requeued', record, 'pending', {
        failedTransactionId: failedRecord.submission.commit.transactionId,
      });
      if (!this.#ownsRecovery(epoch, failedRecord)) return;
    }
    this.#queue = descendants;
    this.#queueVersion += 1;
    this.#settleExplicitFailure(failedRecord, failure);
    this.#mode = 'active';
    this.#continueOrSettle();
  }

  #suspend(
    records: readonly PendingRecord<TFields>[],
    error: BomError,
    retryable: boolean,
    failedTransactionId: BomTransactionId,
    recoveryBaseRevision?: RevisionToken,
    reportedSourceRevision?: RevisionToken,
  ): void {
    const epoch = this.#epoch;
    const context = this.#context;
    const mode = this.#mode;
    const head = this.#queue[0];
    const sourceRevision = this.#sourceRevision;
    let queueVersion = this.#queueVersion;
    let ownedRecords = [...records];
    const refreshOwnership = (): boolean => {
      if (
        epoch !== this.#epoch || context !== this.#context ||
        mode !== this.#mode || head !== this.#queue[0] ||
        sourceRevision !== this.#sourceRevision
      ) return false;
      if (queueVersion !== this.#queueVersion) {
        queueVersion = this.#queueVersion;
        ownedRecords = [...this.#queue];
      }
      return true;
    };
    const recoveryId = this.#nextRecoveryId();
    if (!refreshOwnership()) return;
    const createdAt = this.#now();
    if (!refreshOwnership()) return;
    const bundle = createRecoveryBundle(
      context, sourceRevision, ownedRecords, failedTransactionId,
      error, createdAt, recoveryBaseRevision, reportedSourceRevision,
    );
    const recovery: BomRemoteRecoveryState<TFields> = Object.freeze({
      recoveryId, retryable, bundle, error,
    });
    this.#inFlight = undefined;
    this.#activeController = undefined;
    this.#queue = ownedRecords;
    this.#queueVersion += 1;
    this.#mode = 'reloadRequired';
    this.#suspended = Object.freeze({ recovery, records: ownedRecords });
    for (const record of ownedRecords) {
      this.#settleOutcome(record, { status: 'reloadRequired', ...recovery });
    }
    this.#settleIdle(Object.freeze({ status: 'reloadRequired', ...recovery }));
    const auditEpoch = this.#epoch;
    const suspended = this.#suspended;
    for (const record of ownedRecords) {
      this.#emit('reloadRequired', record, 'reloadRequired', {
        failedTransactionId, error, recoveryId,
      });
      if (
        auditEpoch !== this.#epoch || this.#mode !== 'reloadRequired' ||
        this.#suspended !== suspended
      ) return;
    }
  }

  #settleExplicitFailure(
    record: PendingRecord<TFields>,
    failure: BomRemoteCommitFailure<TFields>,
  ): void {
    this.#settleOutcome(
      record,
      failure.status === 'rejected'
        ? { status: 'rejected', response: failure }
        : { status: 'conflicted', response: failure },
    );
  }

  #acceptConflictSourceRevision(
    failure: BomRemoteCommitFailure<TFields>,
  ): void {
    if (failure.status === 'conflicted') {
      this.#advanceSourceRevision(failure.sourceRevision);
    }
  }

  #advanceSourceRevision(sourceRevision: RevisionToken): void {
    this.#sourceRevision = sourceRevision;
    this.#context = Object.freeze({ ...this.#context, sourceRevision });
  }

  #continueOrSettle(): void {
    if (this.#queue.length === 0) {
      this.#settleIdle(Object.freeze({
        status: 'idle', sourceRevision: this.#sourceRevision,
      }));
      return;
    }
    this.#scheduleDrain();
  }

  #ownsResponse(epoch: number, record: PendingRecord<TFields>): boolean {
    return (
      epoch === this.#epoch && this.#mode === 'active' &&
      this.#inFlight === record && this.#queue[0] === record
    );
  }

  #ownsRecovery(epoch: number, record: PendingRecord<TFields>): boolean {
    if (
      epoch !== this.#epoch || this.#mode !== 'recovering' ||
      this.#queue[0] !== record
    ) return false;
    const context = this.#context;
    const queueVersion = this.#queueVersion;
    const isCurrent = this.#isCurrent();
    if (
      epoch !== this.#epoch || context !== this.#context ||
      queueVersion !== this.#queueVersion || this.#mode !== 'recovering' ||
      this.#queue[0] !== record
    ) return false;
    if (!isCurrent) {
      this.#invalidateCurrentContext();
      return false;
    }
    return true;
  }

  #isCurrent(): boolean {
    if (this.#isCurrentDocument === undefined) return true;
    try {
      return this.#isCurrentDocument(this.#context) === true;
    } catch {
      return false;
    }
  }

  #invalidateCurrentContext(): void {
    if (this.#mode === 'destroyed' || this.#mode === 'stale') return;
    const staleContext = this.#context;
    const records = [...this.#queue];
    this.#epoch += 1;
    const epoch = this.#epoch;
    this.#activeController?.abort();
    this.#activeController = undefined;
    this.#inFlight = undefined;
    this.#queue = [];
    this.#queueVersion += 1;
    this.#suspended = undefined;
    this.#mode = 'stale';
    for (const record of records) {
      this.#settleOutcome(record, {
        status: 'stale', reason: 'contextInvalidated',
      });
    }
    this.#settleIdle(Object.freeze({
      status: 'stale', context: staleContext,
    }));
    for (const record of records) {
      this.#emit('stale', record, undefined);
      if (epoch !== this.#epoch || this.#mode !== 'stale') return;
    }
  }

  #settleOutcome(
    record: PendingRecord<TFields>,
    outcome: BomRemoteCommitOutcome<TFields>,
  ): void {
    if (record.settled) return;
    record.settled = true;
    record.deferred.resolve(Object.freeze(outcome));
  }

  #idleResult(): BomRemoteCommitCoordinatorIdleResult<TFields> | undefined {
    if (this.#mode === 'destroyed') {
      return Object.freeze({ status: 'destroyed' });
    }
    if (this.#mode === 'stale') {
      return Object.freeze({ status: 'stale', context: this.#context });
    }
    if (this.#mode === 'reloadRequired' && this.#suspended !== undefined) {
      return Object.freeze({
        status: 'reloadRequired', ...this.#suspended.recovery,
      });
    }
    if (
      this.#mode === 'active' && this.#queue.length === 0 &&
      this.#inFlight === undefined
    ) {
      return Object.freeze({
        status: 'idle', sourceRevision: this.#sourceRevision,
      });
    }
    return undefined;
  }

  #settleIdle(result: BomRemoteCommitCoordinatorIdleResult<TFields>): void {
    const waiters = this.#idleWaiters.splice(0);
    for (const waiter of waiters) waiter.resolve(result);
  }

  #emit(
    action: BomRemoteCommitAuditAction,
    record: PendingRecord<TFields>,
    persistenceState: BomTransactionPersistenceState | undefined,
    details: {
      readonly reportedSourceRevision?: RevisionToken;
      readonly failedTransactionId?: BomTransactionId;
      readonly error?: BomError;
      readonly recoveryId?: string;
    } = {},
  ): void {
    if (this.#audit === undefined) return;
    const epoch = this.#epoch;
    const context = this.#context;
    const mode = this.#mode;
    const queueVersion = this.#queueVersion;
    const sourceRevision = this.#sourceRevision;
    const descendantCount = Math.max(0, this.#queue.length - 1);
    const queueDepth = this.#queue.length;
    const timestamp = this.#now();
    if (
      epoch !== this.#epoch || context !== this.#context ||
      mode !== this.#mode || queueVersion !== this.#queueVersion ||
      sourceRevision !== this.#sourceRevision
    ) return;
    this.#auditSequence += 1;
    const submission = record.submission;
    const dependency = submission.commit.patch.dependsOnTransactionId;
    const event: BomRemoteCommitAuditEvent = Object.freeze({
      sequence: this.#auditSequence,
      timestamp,
      action,
      ...(persistenceState === undefined ? {} : { persistenceState }),
      protocolVersion: context.protocolVersion,
      documentId: context.documentId,
      documentGeneration: context.documentGeneration,
      transactionId: submission.commit.transactionId,
      ...(dependency === undefined
        ? {} : { dependsOnTransactionId: dependency }),
      revision: submission.commit.revision,
      sourceRevision,
      ...(details.reportedSourceRevision === undefined
        ? {} : { reportedSourceRevision: details.reportedSourceRevision }),
      ...(details.failedTransactionId === undefined
        ? {} : { failedTransactionId: details.failedTransactionId }),
      descendantCount,
      queueDepth,
      attempt: record.attempt,
      ...(details.error === undefined ? {} : {
        errorCode: LOCAL_AUDIT_ERROR_CODES.has(details.error.code)
          ? details.error.code
          : BOM_DATASOURCE_ERROR_CODES.externalFailure,
        errorCategory: details.error.category,
      }),
      ...(details.recoveryId === undefined
        ? {} : { recoveryId: details.recoveryId }),
    });
    try {
      this.#audit(event);
    } catch {
      // Audit consumers cannot perturb persistence state transitions.
    }
  }

  #now(): string {
    if (this.#nowFactory !== undefined) {
      try {
        const value = this.#nowFactory();
        if (isNonEmptyString(value)) return value;
      } catch {
        // Fall through to a valid host timestamp.
      }
    }
    return new Date().toISOString();
  }

  #nextRecoveryId(): string {
    let base: string | undefined;
    if (this.#idFactory !== undefined) {
      try {
        const value = this.#idFactory();
        if (isNonEmptyString(value)) base = value;
      } catch {
        // Fall through to the process-local unique fallback.
      }
    }
    if (base === undefined) {
      fallbackRecoverySequence += 1;
      base = `recovery-${this.#now()}-${fallbackRecoverySequence}`;
    }
    let candidate = base;
    let suffix = 2;
    while (this.#recoveryIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    this.#recoveryIds.add(candidate);
    return candidate;
  }
}

function captureContext(
  input: BomRemoteDocumentContext,
): BomRemoteDocumentContext | undefined {
  if (
    !isRecord(input) || !isNonEmptyString(input.protocolVersion) ||
    !isNonEmptyString(input.documentId) ||
    !Number.isSafeInteger(input.documentGeneration) ||
    input.documentGeneration < 0 ||
    !isNonEmptyString(input.schemaVersion) ||
    !isNonEmptyString(input.positionKeyCodecVersion) ||
    !isNonEmptyString(input.sourceRevision)
  ) return undefined;
  return Object.freeze({
    protocolVersion: input.protocolVersion,
    documentId: input.documentId,
    documentGeneration: input.documentGeneration,
    schemaVersion: input.schemaVersion,
    positionKeyCodecVersion: input.positionKeyCodecVersion,
    sourceRevision: input.sourceRevision,
  });
}

function captureResyncResolution(
  input: BomRemoteResyncResolution,
): BomRemoteResyncResolution | undefined {
  const normalized = normalizeBomValue(input, {
    path: ['dataSource', 'coordinator', 'resyncResolution'],
  });
  if (!normalized.ok || !isRecord(normalized.value)) return undefined;
  const value = normalized.value;
  if (
    !isNonEmptyString(value['recoveryId']) ||
    !isNonEmptyString(value['documentId']) ||
    !Number.isSafeInteger(value['documentGeneration']) ||
    (value['documentGeneration'] as number) < 0 ||
    !isNonEmptyString(value['sourceRevision'])
  ) return undefined;
  return Object.freeze({
    recoveryId: value['recoveryId'],
    documentId: value['documentId'],
    documentGeneration: value['documentGeneration'] as number,
    sourceRevision: value['sourceRevision'],
  });
}

function captureSubmission<TFields extends BomFields>(
  input: BomRemoteCommitSubmission<TFields>,
  context: BomRemoteDocumentContext,
): BomResult<BomRemoteCommitSubmission<TFields>> {
  const normalized = normalizeBomValue(input, {
    path: ['dataSource', 'coordinator', 'submission'],
  });
  if (!normalized.ok) {
    return dataSourceFailure(normalized.errors[0]!);
  }
  const submission =
    normalized.value as unknown as BomRemoteCommitSubmission<TFields>;
  if (!isSubmission(submission, context)) {
    const contextMismatch =
      isRecord(submission) &&
      (submission.documentId !== context.documentId ||
        submission.documentGeneration !== context.documentGeneration);
    return dataSourceFailure(
      coordinatorError(
        contextMismatch
          ? BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch
          : BOM_DATASOURCE_ERROR_CODES.coordinatorTransactionInvalid,
        'VALIDATION',
      ),
    );
  }
  return dataSourceSuccess(submission);
}

function isSubmission<TFields extends BomFields>(
  value: BomRemoteCommitSubmission<TFields>,
  context: BomRemoteDocumentContext,
): boolean {
  if (
    !isRecord(value) || value.documentId !== context.documentId ||
    value.documentGeneration !== context.documentGeneration ||
    !isRecord(value.commit) || !Array.isArray(value.commands)
  ) return false;
  const commit = value.commit;
  if (
    !isNonEmptyString(commit.transactionId) ||
    !isNonEmptyString(commit.previousRevision) ||
    !isNonEmptyString(commit.revision) ||
    !Array.isArray(commit.warnings) || !commit.warnings.every(isBomError) ||
    !isPatch(commit.patch, context, true) ||
    commit.patch.transactionId !== commit.transactionId ||
    commit.patch.baseRevision !== commit.previousRevision ||
    (commit.inversePatch !== undefined &&
      !isPatch(commit.inversePatch, context, false))
  ) return false;
  return value.commands.every(isCommand);
}

function withDependency<TFields extends BomFields>(
  submission: BomRemoteCommitSubmission<TFields>,
  dependency: BomTransactionId | undefined,
): BomRemoteCommitSubmission<TFields> {
  const patch = submission.commit.patch;
  const { dependsOnTransactionId: ignored, ...withoutDependency } = patch;
  void ignored;
  const ownedPatch: BomPatch<TFields> = Object.freeze({
    ...withoutDependency,
    ...(dependency === undefined
      ? {} : { dependsOnTransactionId: dependency }),
  });
  const commit: BomCommit<TFields> = Object.freeze({
    ...submission.commit, patch: ownedPatch,
  });
  return Object.freeze({ ...submission, commit });
}

function captureCommitResponse<TFields extends BomFields>(
  input: unknown,
): BomCommitResponse<TFields> | undefined {
  const normalized = normalizeBomValue(input, {
    path: ['dataSource', 'coordinator', 'commitResponse'],
  });
  if (!normalized.ok || !isRecord(normalized.value)) return undefined;
  const value = normalized.value;
  if (value['status'] === 'acknowledged') {
    return isNonEmptyString(value['sourceRevision'])
      ? value as unknown as BomCommitResponse<TFields>
      : undefined;
  }
  if (value['status'] === 'rejected') {
    return isBomError(value['error'])
      ? value as unknown as BomCommitResponse<TFields>
      : undefined;
  }
  if (value['status'] === 'conflicted') {
    if (!isNonEmptyString(value['sourceRevision'])) return undefined;
    const operations = value['remoteOperations'];
    if (
      operations !== undefined &&
      (!Array.isArray(operations) || !operations.every(isOperation))
    ) return undefined;
    return value as unknown as BomCommitResponse<TFields>;
  }
  return undefined;
}

function captureReplayResult<TFields extends BomFields>(
  input: BomIsolatedReplayResult<TFields>,
  originals: readonly PendingRecord<TFields>[],
  baseRevision: RevisionToken,
  context: BomRemoteDocumentContext,
):
  | {
      readonly ok: true;
      readonly transactions: readonly BomRemoteCommitSubmission<TFields>[];
    }
  | {
      readonly ok: false;
      readonly failedTransactionId: BomTransactionId;
      readonly error: BomError;
    } {
  if (!isRecord(input) || input.ok !== true) {
    if (
      isRecord(input) && input.ok === false &&
      isNonEmptyString(input.failedTransactionId) && isBomError(input.error)
    ) {
      return Object.freeze({
        ok: false,
        failedTransactionId: input.failedTransactionId,
        error: input.error,
      });
    }
    return replayFailure(originals[0]!.submission.commit.transactionId);
  }
  if (
    !isNonEmptyString(input.revision) || !Array.isArray(input.transactions) ||
    input.transactions.length !== originals.length
  ) return replayFailure(originals[0]!.submission.commit.transactionId);
  const output: BomRemoteCommitSubmission<TFields>[] = [];
  let previousRevision = baseRevision;
  for (let index = 0; index < originals.length; index += 1) {
    const original = originals[index]!;
    const captured = captureSubmission<TFields>(
      input.transactions[index]!,
      context,
    );
    if (!captured.ok) {
      return replayFailure(original.submission.commit.transactionId);
    }
    const candidate = captured.value;
    if (
      candidate.commit.transactionId !==
        original.submission.commit.transactionId ||
      candidate.commit.patch.idempotencyKey !==
        original.submission.commit.patch.idempotencyKey ||
      candidate.commit.previousRevision !== previousRevision
    ) return replayFailure(original.submission.commit.transactionId);
    const dependency = output.at(-1)?.commit.transactionId;
    const rewritten = withDependency(candidate, dependency);
    output.push(rewritten);
    previousRevision = rewritten.commit.revision;
  }
  if (previousRevision !== input.revision) {
    return replayFailure(output.at(-1)!.commit.transactionId);
  }
  return Object.freeze({ ok: true, transactions: Object.freeze(output) });
}

function replayFailure(
  transactionId: BomTransactionId,
): {
  readonly ok: false;
  readonly failedTransactionId: BomTransactionId;
  readonly error: BomError;
} {
  return Object.freeze({
    ok: false,
    failedTransactionId: transactionId,
    error: coordinatorError(
      BOM_DATASOURCE_ERROR_CODES.recoveryFailed, 'INTERNAL',
      { transactionId },
    ),
  });
}

function createRecoveryBundle<TFields extends BomFields>(
  context: BomRemoteDocumentContext,
  sourceRevision: RevisionToken,
  records: readonly PendingRecord<TFields>[],
  failedTransactionId: BomTransactionId,
  reason: BomError,
  createdAt: string,
  recoveryBaseRevision?: RevisionToken,
  reportedSourceRevision?: RevisionToken,
): BomRecoveryBundle<TFields> {
  return Object.freeze({
    protocolVersion: context.protocolVersion,
    documentId: context.documentId,
    schemaVersion: context.schemaVersion,
    positionKeyCodecVersion: context.positionKeyCodecVersion,
    baseRevision:
      recoveryBaseRevision ?? records[0]!.submission.commit.previousRevision,
    sourceRevision,
    ...(reportedSourceRevision === undefined
      ? {} : { reportedSourceRevision }),
    failedTransactionId,
    createdAt,
    transactions: Object.freeze(records.map(({ submission }) =>
      Object.freeze({
        transactionId: submission.commit.transactionId,
        ...(submission.commit.patch.dependsOnTransactionId === undefined
          ? {} : {
            dependsOnTransactionId:
              submission.commit.patch.dependsOnTransactionId,
          }),
        commands: submission.commands,
        patch: submission.commit.patch,
        ...(submission.commit.inversePatch === undefined
          ? {} : { inversePatch: submission.commit.inversePatch }),
      }),
    )),
    reason,
  });
}

function isPatch(
  value: unknown,
  context: BomRemoteDocumentContext,
  requireIdempotency: boolean,
): value is BomPatch {
  if (!isRecord(value)) return false;
  if (
    value['protocolVersion'] !== context.protocolVersion ||
    value['documentId'] !== context.documentId ||
    !isNonEmptyString(value['baseRevision']) ||
    !isNonEmptyString(value['transactionId']) ||
    !isNonEmptyString(value['origin']) ||
    !isNonEmptyString(value['timestamp']) ||
    !Array.isArray(value['operations']) ||
    !value['operations'].every(isOperation)
  ) return false;
  const dependency = value['dependsOnTransactionId'];
  if (dependency !== undefined && !isNonEmptyString(dependency)) return false;
  const idempotencyKey = value['idempotencyKey'];
  return requireIdempotency
    ? isNonEmptyString(idempotencyKey)
    : idempotencyKey === undefined || isNonEmptyString(idempotencyKey);
}

function isOperation(value: unknown): value is BomOperation {
  if (!isRecord(value) || !isNonEmptyString(value['op'])) return false;
  switch (value['op']) {
    case 'insertNode':
      return isNode(value['node']);
    case 'deleteSubtree':
      return isNonEmptyString(value['occurrenceId']);
    case 'moveSubtree':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        (value['newParentId'] === null ||
          isNonEmptyString(value['newParentId'])) &&
        isNonEmptyString(value['positionKey'])
      );
    case 'updateField':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        isFieldPath(value['fieldPath']) &&
        Object.prototype.hasOwnProperty.call(value, 'value') &&
        optionalString(value['expectedValueHash'])
      );
    case 'unsetField':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        isFieldPath(value['fieldPath']) &&
        optionalString(value['expectedValueHash'])
      );
    case 'setMaterialRef':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        optionalString(value['materialId']) &&
        optionalString(value['materialRevision']) &&
        optionalString(value['materialCode'])
      );
    case 'reorder':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        isNonEmptyString(value['positionKey'])
      );
    case 'rebalancePositions':
      return (
        (value['parentId'] === null || isNonEmptyString(value['parentId'])) &&
        Array.isArray(value['positions']) &&
        value['positions'].every((position) =>
          isRecord(position) &&
          isNonEmptyString(position['occurrenceId']) &&
          isNonEmptyString(position['positionKey']),
        )
      );
    default:
      return false;
  }
}

function isCommand(value: unknown): value is BomCommand {
  if (!isRecord(value) || !isNonEmptyString(value['type'])) return false;
  switch (value['type']) {
    case 'insertNode':
      return (
        (value['parentId'] === null || isNonEmptyString(value['parentId'])) &&
        isPlacement(value['placement']) && isRecord(value['node'])
      );
    case 'deleteSubtree':
      return isNonEmptyString(value['occurrenceId']);
    case 'moveSubtree':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        (value['newParentId'] === null ||
          isNonEmptyString(value['newParentId'])) &&
        isPlacement(value['placement'])
      );
    case 'setField':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        isFieldPath(value['fieldPath']) &&
        Object.prototype.hasOwnProperty.call(value, 'value') &&
        optionalString(value['expectedValueHash'])
      );
    case 'unsetField':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        isFieldPath(value['fieldPath']) &&
        (value['expectedPresent'] === undefined ||
          typeof value['expectedPresent'] === 'boolean') &&
        optionalString(value['expectedValueHash'])
      );
    case 'setMaterialRef':
      return (
        isNonEmptyString(value['occurrenceId']) &&
        optionalString(value['materialId']) &&
        optionalString(value['materialRevision']) &&
        optionalString(value['materialCode'])
      );
    default:
      return value['type'].startsWith('plugin:') &&
        Object.prototype.hasOwnProperty.call(value, 'payload');
  }
}

function isNode(value: unknown): boolean {
  return (
    isRecord(value) && isNonEmptyString(value['occurrenceId']) &&
    (value['kind'] === 'material' || value['kind'] === 'group') &&
    (value['parentId'] === null || isNonEmptyString(value['parentId'])) &&
    isNonEmptyString(value['positionKey']) && isRecord(value['fields']) &&
    optionalString(value['materialId']) &&
    optionalString(value['materialRevision']) &&
    optionalString(value['materialCode']) &&
    (value['childrenState'] === undefined ||
      value['childrenState'] === 'complete' ||
      value['childrenState'] === 'partial' ||
      value['childrenState'] === 'unloaded') &&
    (value['knownChildCount'] === undefined ||
      (Number.isSafeInteger(value['knownChildCount']) &&
        (value['knownChildCount'] as number) >= 0))
  );
}

function isPlacement(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['at'] === 'first' || value['at'] === 'last' ||
      isNonEmptyString(value['beforeOccurrenceId']) ||
      isNonEmptyString(value['afterOccurrenceId']))
  );
}

function isFieldPath(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((segment) => isNonEmptyString(segment));
}

function isBomError(value: unknown): value is BomError {
  if (
    !isRecord(value) || !isNonEmptyString(value['code']) ||
    !ERROR_CATEGORIES.has(value['category'] as BomError['category']) ||
    !isNonEmptyString(value['messageKey']) ||
    typeof value['recoverable'] !== 'boolean'
  ) return false;
  const messageParams = value['messageParams'];
  if (
    messageParams !== undefined &&
    (!isRecord(messageParams) ||
      !Object.values(messageParams).every(
        (item) => typeof item === 'string' || typeof item === 'number',
      ))
  ) return false;
  const safeContext = value['safeContext'];
  return safeContext === undefined || isRecord(safeContext);
}

function isRollbackResult(value: unknown): value is BomAtomicRollbackResult {
  return isRecord(value) && (
    (value['ok'] === true && isRecord(value['value']) &&
      isNonEmptyString(value['value']['revision'])) ||
    (value['ok'] === false && isBomError(value['error']))
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return Object.freeze({ promise, resolve });
}

function coordinatorError(
  code: Parameters<typeof dataSourceError>[0],
  category: Parameters<typeof dataSourceError>[1],
  context?: Readonly<Record<string, string | number>>,
): BomError {
  return dataSourceError(code, category, context);
}
