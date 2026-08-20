import type {
  BomCommand,
  BomCommandBatch,
  BomCommit,
  BomFieldSchema,
  BomFields,
  BomNode,
  BomOperation,
  BomPatch,
  BomPlacement,
  BomSchema,
  BomTransactionId,
  OccurrenceId,
  RevisionToken,
} from '@bom-editor/contracts';
import {
  buildBomIndexes,
  comparePositionKeys,
  createPositionKeyBetween,
  hashBomDocumentContent,
  hashBomFieldValue,
  normalizeBomFields,
  normalizeBomDocumentSnapshot,
  normalizeBomSchema,
  rebalancePositionKeys,
  sha256Hex,
  utf8ByteLength,
  validatePositionKey,
  type BomBaseIndexes,
} from '@bom-editor/model';
import {
  captureCommand,
  captureCommandBatch,
  captureOperationList,
  capturePatch,
} from './capture.js';
import { BomTransactionDraft } from './draft.js';
import {
  BOM_TRANSACTION_ERROR_CODES,
  transactionError,
  transactionFailure,
  transactionSuccess,
} from './errors.js';
import {
  findFirstMissingBomFieldPathPrefix,
  getBomFieldPath,
  hasBomFieldPathTypeConflict,
  setBomFieldPath,
  unsetBomFieldPath,
} from './field-path.js';
import { requireResultValue } from './invariants.js';
import type {
  BomAcknowledgeSourceRevisionRequest,
  BomExecuteOptions,
  BomHistoryActionOptions,
  BomHistoryBudget,
  BomHistorySuffixReconcileRequest,
  BomHistorySuffixReconcileResult,
  BomHistorySuffixReplay,
  BomHistorySuffixReplayMapping,
  BomHistoryState,
  BomPreparedTransaction,
  BomTransactionEngineApi,
  BomTransactionEngineOptions,
  BomTransactionResult,
} from './types.js';

const DEFAULT_HISTORY_BUDGET: Readonly<BomHistoryBudget> = Object.freeze({
  maxEntries: 100,
  maxBytes: 16 * 1024 * 1024,
});

interface BomHistoryEntry<TFields extends BomFields> {
  readonly transactionId: BomTransactionId;
  readonly previousRevision: RevisionToken;
  readonly revision: RevisionToken;
  readonly patch: BomPatch<TFields>;
  readonly inverseOperations: readonly BomOperation<TFields>[];
  readonly replaySource:
    | {
        readonly kind: 'commands';
        readonly commands: readonly BomCommand<TFields>[];
      }
    | { readonly kind: 'patch' };
  readonly bytes: number;
}

type BomHistoryEntryReplaySource<TFields extends BomFields> =
  BomHistoryEntry<TFields>['replaySource'];

interface CapturedHistorySuffixReconcileRequest<
  TFields extends BomFields,
> {
  readonly failedTransactionId: BomTransactionId;
  readonly transactionId: BomTransactionId;
  readonly origin: string;
  readonly timestamp: string;
  readonly descendants: readonly BomHistorySuffixReplay<TFields>[];
  readonly remoteOperations: readonly BomOperation<TFields>[];
}

interface GeneratedMetadata {
  readonly transactionId: BomTransactionId;
  readonly timestamp: string;
}

interface AllocatedPosition<TFields extends BomFields> {
  readonly beforeOperations: readonly BomOperation<TFields>[];
  readonly positionKey: string;
}

interface PreparedFieldApplication<TFields extends BomFields> {
  readonly draft: BomTransactionDraft<TFields>;
  readonly inverseOperations: readonly BomOperation<TFields>[];
}

export function createBomTransactionEngine<
  TFields extends BomFields = BomFields,
>(
  options: BomTransactionEngineOptions<TFields>,
): BomTransactionResult<BomTransactionEngine<TFields>> {
  return BomTransactionEngine.create(options);
}

export class BomTransactionEngine<TFields extends BomFields = BomFields>
  implements BomTransactionEngineApi<TFields>
{
  #snapshot: import('@bom-editor/contracts').BomDocumentSnapshot<TFields>;
  #indexes: BomBaseIndexes<TFields>;
  #contentHash: string | undefined;
  readonly #schema: BomSchema;
  readonly #protocolVersion: string;
  readonly #documentGeneration: number;
  readonly #historyBudget: Readonly<BomHistoryBudget>;
  readonly #positionKeyMaxBytes: number;
  readonly #revisionFactory: NonNullable<
    BomTransactionEngineOptions<TFields>['revisionFactory']
  >;
  readonly #transactionIdFactory: NonNullable<
    BomTransactionEngineOptions<TFields>['transactionIdFactory']
  >;
  readonly #timestampFactory: NonNullable<
    BomTransactionEngineOptions<TFields>['timestampFactory']
  >;
  readonly #beforeApply:
    | NonNullable<BomTransactionEngineOptions<TFields>['beforeApply']>
    | undefined;
  readonly #revisionUsesContentHash: boolean;
  #insideBeforeApply = false;
  #tail: Promise<void> = Promise.resolve();
  #revisionSequence = 0;
  #transactionSequence = 0;
  readonly #undo: BomHistoryEntry<TFields>[] = [];
  readonly #redo: BomHistoryEntry<TFields>[] = [];
  #historyBytes = 0;
  #evictedEntries = 0;

  private constructor(
    options: BomTransactionEngineOptions<TFields>,
    snapshot: import('@bom-editor/contracts').BomDocumentSnapshot<TFields>,
    indexes: BomBaseIndexes<TFields>,
    contentHash: string | undefined,
    historyBudget: Readonly<BomHistoryBudget>,
    positionKeyMaxBytes: number,
    revisionUsesContentHash = options.revisionFactory !== undefined,
  ) {
    this.#snapshot = snapshot;
    this.#indexes = indexes;
    this.#contentHash = contentHash;
    this.#schema = options.schema;
    this.#protocolVersion = options.protocolVersion;
    this.#documentGeneration = options.documentGeneration ?? 0;
    this.#historyBudget = historyBudget;
    this.#positionKeyMaxBytes = positionKeyMaxBytes;
    this.#revisionFactory =
      options.revisionFactory ??
      ((context) =>
        `local-${context.sequence}-${sha256Hex(
          [
            'bom:revision:v2',
            context.documentId,
            context.previousRevision,
            context.transactionId,
            String(context.sequence),
          ].join('\0'),
        ).slice(0, 32)}`);
    this.#revisionUsesContentHash = revisionUsesContentHash;
    this.#transactionIdFactory =
      options.transactionIdFactory ??
      ((context) => `tx-${context.purpose}-${context.sequence}`);
    this.#timestampFactory =
      options.timestampFactory ?? (() => new Date().toISOString());
    this.#beforeApply = options.beforeApply;
  }

  static create<TFields extends BomFields = BomFields>(
    options: BomTransactionEngineOptions<TFields>,
  ): BomTransactionResult<BomTransactionEngine<TFields>> {
    try {
      const config = validateEngineOptions(options);
      if (!config.ok) return config;

      const schema = normalizeBomSchema(options.schema);
      if (!schema.ok) return transactionFailure(schema.errors);
      const snapshot = normalizeBomDocumentSnapshot<TFields>(
        options.snapshot,
        schema.value,
      );
      if (!snapshot.ok) return transactionFailure(snapshot.errors);
      const indexes = buildBomIndexes(snapshot.value);
      if (!indexes.ok) return transactionFailure(indexes.errors);
      return transactionSuccess(
        new BomTransactionEngine(
          Object.freeze({ ...options, schema: schema.value }),
          snapshot.value,
          indexes.value,
          undefined,
          config.value.history,
          config.value.positionKeyMaxBytes,
        ),
      );
    } catch {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.internal, 'INTERNAL'),
      );
    }
  }

  getSnapshot(): import('@bom-editor/contracts').BomDocumentSnapshot<TFields> {
    return this.#snapshot;
  }

  getIndexes(): BomBaseIndexes<TFields> {
    return this.#indexes;
  }

  getContentHash(): string {
    if (this.#contentHash === undefined) {
      this.#contentHash = requireResultValue(hashBomDocumentContent<TFields>(
        this.#snapshot,
        this.#schema,
      ));
    }
    return this.#contentHash;
  }

  getHistoryState(): BomHistoryState {
    return Object.freeze({
      ...this.#historyBudget,
      undoEntries: this.#undo.length,
      redoEntries: this.#redo.length,
      bytes: this.#historyBytes,
      evictedEntries: this.#evictedEntries,
    });
  }

  acknowledgeSourceRevision(
    request: BomAcknowledgeSourceRevisionRequest,
  ): Promise<
    BomTransactionResult<
      import('@bom-editor/contracts').BomDocumentSnapshot<TFields>
    >
  > {
    const captured = Object.freeze({ ...request });
    return this.#enqueue(() => {
      if (
        typeof captured.sourceRevision !== 'string' ||
        captured.sourceRevision.length === 0 ||
        typeof captured.expectedLocalRevision !== 'string' ||
        captured.expectedLocalRevision.length === 0 ||
        (captured.expectedPriorSourceRevision !== undefined &&
          (typeof captured.expectedPriorSourceRevision !== 'string' ||
            captured.expectedPriorSourceRevision.length === 0))
      ) {
        return transactionFailure(
          transactionError(
            BOM_TRANSACTION_ERROR_CODES.sourceRevisionInvalid,
            'VALIDATION',
          ),
        );
      }
      if (captured.expectedLocalRevision !== this.#snapshot.revision) {
        return transactionFailure(
          transactionError(
            BOM_TRANSACTION_ERROR_CODES.sourceRevisionLocalRevisionMismatch,
            'CONFLICT',
          ),
        );
      }
      if (
        captured.expectedPriorSourceRevision !== undefined &&
        captured.expectedPriorSourceRevision !== this.#snapshot.sourceRevision
      ) {
        return transactionFailure(
          transactionError(
            BOM_TRANSACTION_ERROR_CODES.sourceRevisionMismatch,
            'CONFLICT',
          ),
        );
      }
      if (captured.sourceRevision === this.#snapshot.sourceRevision) {
        return transactionSuccess(this.#snapshot);
      }
      this.#snapshot = Object.freeze({
        ...this.#snapshot,
        sourceRevision: captured.sourceRevision,
      });
      return transactionSuccess(this.#snapshot);
    });
  }

  execute(
    command: BomCommand<TFields>,
    options: BomExecuteOptions = {},
  ): Promise<BomTransactionResult<BomCommit<TFields>>> {
    if (this.#insideBeforeApply) return reentrantFailure();
    const captured = captureSafely(() => captureCommand(command));
    const capturedOptions = Object.freeze({ ...options });
    return this.#enqueue(() => {
      if (!captured.ok) return transactionFailure(captured.errors);
      const metadata = this.#createMetadata(
        'execute',
        capturedOptions.transactionId,
        capturedOptions.timestamp,
      );
      const batch: BomCommandBatch<TFields> = Object.freeze({
        protocolVersion: this.#protocolVersion,
        documentId: this.#snapshot.documentId,
        documentGeneration: this.#documentGeneration,
        baseRevision: capturedOptions.baseRevision ?? this.#snapshot.revision,
        transactionId: metadata.transactionId,
        ...(capturedOptions.dependsOnTransactionId === undefined
          ? {}
          : {
              dependsOnTransactionId:
                capturedOptions.dependsOnTransactionId,
            }),
        origin: capturedOptions.origin ?? 'local',
        timestamp: metadata.timestamp,
        ...(capturedOptions.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: capturedOptions.idempotencyKey }),
        commands: Object.freeze([captured.value]),
      });
      return this.#executeCapturedBatch(batch);
    });
  }

  executeBatch(
    batch: BomCommandBatch<TFields>,
  ): Promise<BomTransactionResult<BomCommit<TFields>>> {
    if (this.#insideBeforeApply) return reentrantFailure();
    const captured = captureSafely(() => captureCommandBatch(batch));
    return this.#enqueue(() =>
      captured.ok
        ? this.#executeCapturedBatch(captured.value)
        : transactionFailure(captured.errors),
    );
  }

  applyPatch(
    patch: BomPatch<TFields>,
  ): Promise<BomTransactionResult<BomCommit<TFields>>> {
    if (this.#insideBeforeApply) return reentrantFailure();
    const captured = captureSafely(() => capturePatch(patch));
    return this.#enqueue(() =>
      captured.ok
        ? this.#commitPatch(
            captured.value,
            true,
            undefined,
            Object.freeze({ kind: 'patch' }),
          )
        : transactionFailure(captured.errors),
    );
  }

  undo(
    options: BomHistoryActionOptions = {},
  ): Promise<BomTransactionResult<BomCommit<TFields>>> {
    if (this.#insideBeforeApply) return reentrantFailure();
    const capturedOptions = Object.freeze({ ...options });
    return this.#enqueue(() => {
      const entry = this.#undo[this.#undo.length - 1];
      if (entry === undefined) {
        return transactionFailure(
          transactionError(BOM_TRANSACTION_ERROR_CODES.historyEmpty, 'VALIDATION'),
        );
      }
      const metadata = this.#createMetadata(
        'undo',
        capturedOptions.transactionId,
        capturedOptions.timestamp,
      );
      const patch = this.#createReplayPatch(
        entry.inverseOperations,
        metadata,
        capturedOptions.origin ?? 'history:undo',
        capturedOptions.dependsOnTransactionId,
        capturedOptions.idempotencyKey,
      );
      const result = this.#commitPatch(patch, false);
      if (!result.ok) return result;
      this.#undo.pop();
      this.#redo.push(entry);
      return result;
    });
  }

  redo(
    options: BomHistoryActionOptions = {},
  ): Promise<BomTransactionResult<BomCommit<TFields>>> {
    if (this.#insideBeforeApply) return reentrantFailure();
    const capturedOptions = Object.freeze({ ...options });
    return this.#enqueue(() => {
      const entry = this.#redo[this.#redo.length - 1];
      if (entry === undefined) {
        return transactionFailure(
          transactionError(BOM_TRANSACTION_ERROR_CODES.historyEmpty, 'VALIDATION'),
        );
      }
      const metadata = this.#createMetadata(
        'redo',
        capturedOptions.transactionId,
        capturedOptions.timestamp,
      );
      const patch = this.#createReplayPatch(
        entry.patch.operations,
        metadata,
        capturedOptions.origin ?? 'history:redo',
        capturedOptions.dependsOnTransactionId,
        capturedOptions.idempotencyKey,
      );
      const result = this.#commitPatch(patch, false);
      if (!result.ok) return result;
      this.#redo.pop();
      this.#undo.push(entry);
      return result;
    });
  }

  reconcileHistorySuffix(
    request: BomHistorySuffixReconcileRequest<TFields>,
  ): Promise<
    BomTransactionResult<BomHistorySuffixReconcileResult<TFields>>
  > {
    if (this.#insideBeforeApply) return reentrantFailure();
    const captured = captureSafely(() =>
      captureHistorySuffixReconcileRequest(request),
    );
    return this.#enqueue(() =>
      captured.ok
        ? this.#reconcileCapturedHistorySuffix(captured.value)
        : transactionFailure(captured.errors),
    );
  }

  #reconcileCapturedHistorySuffix(
    request: CapturedHistorySuffixReconcileRequest<TFields>,
  ): BomTransactionResult<BomHistorySuffixReconcileResult<TFields>> {
    const metadata = validateMetadata(
      request.transactionId,
      request.origin,
      request.timestamp,
    );
    if (!metadata.ok) return metadata;
    if (
      typeof request.failedTransactionId !== 'string' ||
      request.failedTransactionId.length === 0 ||
      this.#redo.length > 0
    ) {
      return historySuffixMismatch();
    }

    const descendantTransactionIds = request.descendants.map((replay) =>
      replay.kind === 'commands'
        ? replay.batch.transactionId
        : replay.patch.transactionId,
    );
    const expectedTransactionIds = Object.freeze([
      request.failedTransactionId,
      ...descendantTransactionIds,
    ]);
    if (
      new Set(expectedTransactionIds).size !== expectedTransactionIds.length ||
      expectedTransactionIds.includes(request.transactionId)
    ) {
      return historyReplayInvalid();
    }

    const matchingIndexes: number[] = [];
    for (let index = 0; index < this.#undo.length; index += 1) {
      if (this.#undo[index]!.transactionId === request.failedTransactionId) {
        matchingIndexes.push(index);
      }
    }
    if (matchingIndexes.length === 0) {
      return this.#evictedEntries > 0
        ? historySuffixEvicted()
        : historySuffixMismatch();
    }
    if (matchingIndexes.length !== 1) return historySuffixMismatch();

    const suffixStart = matchingIndexes[0]!;
    const suffix = this.#undo.slice(suffixStart);
    if (
      suffix.length !== expectedTransactionIds.length ||
      suffix.some(
        (entry, index) =>
          entry.transactionId !== expectedTransactionIds[index],
      )
    ) {
      return historySuffixMismatch();
    }
    for (let index = 0; index < request.descendants.length; index += 1) {
      if (
        !this.#matchesHistoryReplay(
          suffix[index + 1]!,
          request.descendants[index]!,
        )
      ) {
        return historyReplayInvalid();
      }
    }

    const candidate = this.#forkForHistoryReconcile();
    const removed = candidate.#undo.splice(suffixStart);
    for (const entry of removed) candidate.#historyBytes -= entry.bytes;

    const aggregateOperations: BomOperation<TFields>[] = [];
    const aggregateInverseOperations: BomOperation<TFields>[] = [];
    const appendStep = (commit: BomCommit<TFields>): void => {
      aggregateOperations.push(...commit.patch.operations);
      aggregateInverseOperations.unshift(
        ...(commit.inversePatch?.operations ?? []),
      );
    };

    const rollbackOrder = [...removed].reverse();
    for (let index = 0; index < rollbackOrder.length; index += 1) {
      const entry = rollbackOrder[index]!;
      const rollback = candidate.#commitPatch(
        Object.freeze({
          protocolVersion: this.#protocolVersion,
          documentId: this.#snapshot.documentId,
          baseRevision: candidate.#snapshot.revision,
          transactionId: `${request.transactionId}:rollback:${index + 1}`,
          origin: `${request.origin}:rollback`,
          timestamp: request.timestamp,
          operations: entry.inverseOperations,
        }),
        false,
      );
      if (!rollback.ok) return rollback;
      appendStep(rollback.value);
    }

    if (request.remoteOperations.length > 0) {
      const remote = candidate.#commitPatch(
        Object.freeze({
          protocolVersion: this.#protocolVersion,
          documentId: this.#snapshot.documentId,
          baseRevision: candidate.#snapshot.revision,
          transactionId: `${request.transactionId}:remote`,
          origin: `${request.origin}:remote`,
          timestamp: request.timestamp,
          operations: request.remoteOperations,
        }),
        false,
      );
      if (!remote.ok) return remote;
      appendStep(remote.value);
    }
    const rollbackRevision = candidate.#snapshot.revision;

    const replayed: BomHistorySuffixReplayMapping<TFields>[] = [];
    for (const replay of request.descendants) {
      const dependency = replayed.at(-1)?.commit.transactionId;
      let result: BomTransactionResult<BomCommit<TFields>>;
      if (replay.kind === 'commands') {
        const batch = replay.batch;
        result = candidate.#executeCapturedBatch(Object.freeze({
          protocolVersion: batch.protocolVersion,
          documentId: batch.documentId,
          documentGeneration: batch.documentGeneration,
          baseRevision: candidate.#snapshot.revision,
          transactionId: batch.transactionId,
          ...(dependency === undefined
            ? {}
            : { dependsOnTransactionId: dependency }),
          origin: batch.origin,
          timestamp: batch.timestamp,
          ...(batch.idempotencyKey === undefined
            ? {}
            : { idempotencyKey: batch.idempotencyKey }),
          ...(batch.label === undefined ? {} : { label: batch.label }),
          commands: batch.commands,
        }));
      } else {
        const patch = replay.patch;
        result = candidate.#commitPatch(
          Object.freeze({
            protocolVersion: patch.protocolVersion,
            documentId: patch.documentId,
            baseRevision: candidate.#snapshot.revision,
            transactionId: patch.transactionId,
            ...(dependency === undefined
              ? {}
              : { dependsOnTransactionId: dependency }),
            origin: patch.origin,
            timestamp: patch.timestamp,
            ...(patch.idempotencyKey === undefined
              ? {}
              : { idempotencyKey: patch.idempotencyKey }),
            operations: patch.operations,
          }),
          true,
          undefined,
          Object.freeze({ kind: 'patch' }),
        );
      }
      if (!result.ok) return result;
      appendStep(result.value);
      replayed.push(Object.freeze({
        originalTransactionId:
          replay.kind === 'commands'
            ? replay.batch.transactionId
            : replay.patch.transactionId,
        replayedTransactionId: result.value.transactionId,
        commit: result.value,
      }));
    }

    const capturedOperations = requireResultValue(
      captureOperationList(aggregateOperations),
    );
    const capturedInverse = requireResultValue(
      captureOperationList(aggregateInverseOperations),
    );
    const patch: BomPatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#snapshot.documentId,
      baseRevision: this.#snapshot.revision,
      transactionId: request.transactionId,
      origin: request.origin,
      timestamp: request.timestamp,
      operations: capturedOperations,
    });
    const inversePatch: BomPatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#snapshot.documentId,
      baseRevision: candidate.#snapshot.revision,
      transactionId: `${request.transactionId}:inverse`,
      origin: `inverse:${request.origin}`,
      timestamp: request.timestamp,
      operations: capturedInverse,
    });
    const commit: BomCommit<TFields> = Object.freeze({
      transactionId: request.transactionId,
      previousRevision: this.#snapshot.revision,
      revision: candidate.#snapshot.revision,
      patch,
      inversePatch,
      warnings: Object.freeze([]),
    });

    const approved = this.#approveReconciledCandidate(
      candidate,
      patch,
      inversePatch,
    );
    if (!approved.ok) return approved;

    this.#snapshot = candidate.#snapshot;
    this.#indexes = candidate.#indexes;
    this.#contentHash = candidate.#contentHash;
    this.#revisionSequence = candidate.#revisionSequence;
    this.#transactionSequence = candidate.#transactionSequence;
    this.#undo.splice(0, this.#undo.length, ...candidate.#undo);
    this.#redo.splice(0, this.#redo.length, ...candidate.#redo);
    this.#historyBytes = candidate.#historyBytes;
    this.#evictedEntries = candidate.#evictedEntries;

    return transactionSuccess(Object.freeze({
      commit,
      rollbackRevision,
      removedTransactionIds: Object.freeze(
        removed.map((entry) => entry.transactionId),
      ),
      rollbackOrder: Object.freeze(
        rollbackOrder.map((entry) => entry.transactionId),
      ),
      replayed: Object.freeze(replayed),
    }));
  }

  #forkForHistoryReconcile(): BomTransactionEngine<TFields> {
    const candidate = new BomTransactionEngine<TFields>(
      Object.freeze({
        snapshot: this.#snapshot,
        schema: this.#schema,
        protocolVersion: this.#protocolVersion,
        documentGeneration: this.#documentGeneration,
        history: this.#historyBudget,
        positionKeyMaxBytes: this.#positionKeyMaxBytes,
        revisionFactory: this.#revisionFactory,
        transactionIdFactory: this.#transactionIdFactory,
        timestampFactory: this.#timestampFactory,
      }),
      this.#snapshot,
      this.#indexes,
      this.#contentHash,
      this.#historyBudget,
      this.#positionKeyMaxBytes,
      this.#revisionUsesContentHash,
    );
    candidate.#revisionSequence = this.#revisionSequence;
    candidate.#transactionSequence = this.#transactionSequence;
    candidate.#undo.push(...this.#undo);
    candidate.#redo.push(...this.#redo);
    candidate.#historyBytes = this.#historyBytes;
    candidate.#evictedEntries = this.#evictedEntries;
    return candidate;
  }

  #matchesHistoryReplay(
    entry: BomHistoryEntry<TFields>,
    replay: BomHistorySuffixReplay<TFields>,
  ): boolean {
    const source = replay.kind === 'commands' ? replay.batch : replay.patch;
    if (
      replay.kind !== entry.replaySource.kind ||
      source.protocolVersion !== entry.patch.protocolVersion ||
      source.documentId !== entry.patch.documentId ||
      source.baseRevision !== entry.patch.baseRevision ||
      source.transactionId !== entry.transactionId ||
      source.origin !== entry.patch.origin ||
      source.timestamp !== entry.patch.timestamp ||
      source.dependsOnTransactionId !== entry.patch.dependsOnTransactionId ||
      source.idempotencyKey !== entry.patch.idempotencyKey
    ) {
      return false;
    }
    if (replay.kind === 'commands') {
      return (
        replay.batch.documentGeneration === this.#documentGeneration &&
        entry.replaySource.kind === 'commands' &&
        JSON.stringify(replay.batch.commands) ===
          JSON.stringify(entry.replaySource.commands)
      );
    }
    return JSON.stringify(replay.patch.operations) ===
      JSON.stringify(entry.patch.operations);
  }

  #approveReconciledCandidate(
    candidate: BomTransactionEngine<TFields>,
    patch: BomPatch<TFields>,
    inversePatch: BomPatch<TFields>,
  ): BomTransactionResult<true> {
    if (this.#beforeApply === undefined) return transactionSuccess(true);
    let candidateContentHash = candidate.#contentHash;
    const requireContentHash = (): string => {
      if (candidateContentHash === undefined) {
        candidateContentHash = requireResultValue(
          hashBomDocumentContent<TFields>(candidate.#snapshot, this.#schema),
        );
      }
      return candidateContentHash;
    };
    const prepared: BomPreparedTransaction<TFields> = Object.freeze({
      patch,
      inversePatch,
      previousSnapshot: this.#snapshot,
      snapshot: candidate.#snapshot,
      indexes: candidate.#indexes,
      previousRevision: this.#snapshot.revision,
      revision: candidate.#snapshot.revision,
      get contentHash(): string {
        return requireContentHash();
      },
    });
    let decision: boolean | void;
    this.#insideBeforeApply = true;
    try {
      decision = this.#beforeApply(prepared);
    } catch {
      return transactionFailure(
        transactionError(
          BOM_TRANSACTION_ERROR_CODES.beforeApplyFailed,
          'INTERNAL',
        ),
      );
    } finally {
      this.#insideBeforeApply = false;
    }
    if (decision !== undefined && typeof decision !== 'boolean') {
      return transactionFailure(
        transactionError(
          BOM_TRANSACTION_ERROR_CODES.beforeApplyFailed,
          'VALIDATION',
        ),
      );
    }
    if (decision === false) {
      return transactionFailure(
        transactionError(
          BOM_TRANSACTION_ERROR_CODES.beforeApplyRejected,
          'ABORTED',
        ),
      );
    }
    candidate.#contentHash = candidateContentHash;
    return transactionSuccess(true);
  }

  #executeCapturedBatch(
    batch: BomCommandBatch<TFields>,
  ): BomTransactionResult<BomCommit<TFields>> {
    const metadata = this.#validateBatch(batch);
    if (!metadata.ok) return metadata;
    if (batch.commands.length === 0) {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.metadataInvalid, 'VALIDATION'),
      );
    }

    const draft = new BomTransactionDraft(this.#snapshot, this.#indexes);
    const operations: BomOperation<TFields>[] = [];
    const inverseOperations: BomOperation<TFields>[] = [];
    for (const command of batch.commands) {
      const compiled = this.#compileCommand(draft, command);
      if (!compiled.ok) return compiled;
      for (const operation of compiled.value) {
        const applied = this.#applyOperation(draft, operation);
        if (!applied.ok) return applied;
        operations.push(operation);
        inverseOperations.unshift(...applied.value);
      }
    }
    const capturedOperations = requireResultValue(captureOperationList(operations));

    const patch: BomPatch<TFields> = Object.freeze({
      protocolVersion: batch.protocolVersion,
      documentId: batch.documentId,
      baseRevision: batch.baseRevision,
      transactionId: batch.transactionId,
      ...(batch.dependsOnTransactionId === undefined
        ? {}
        : { dependsOnTransactionId: batch.dependsOnTransactionId }),
      origin: batch.origin,
      timestamp: batch.timestamp,
      ...(batch.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: batch.idempotencyKey }),
      operations: capturedOperations,
    });
    const prepared = patch.operations.every(isFieldOperation)
      ? { draft, inverseOperations }
      : undefined;
    return this.#commitPatch(
      patch,
      true,
      prepared,
      Object.freeze({
        kind: 'commands',
        commands: batch.commands,
      }),
    );
  }

  #compileCommand(
    draft: BomTransactionDraft<TFields>,
    command: BomCommand<TFields>,
  ): BomTransactionResult<readonly BomOperation<TFields>[]> {
    switch (command.type) {
      case 'insertNode': {
        if (draft.completeness === 'partial') return partialStructureFailure();
        if (draft.hasNode(command.node.occurrenceId)) {
          return transactionFailure(
            transactionError(BOM_TRANSACTION_ERROR_CODES.nodeAlreadyExists, 'DATA', {
              occurrenceId: command.node.occurrenceId,
            }),
          );
        }
        const parent = this.#requireParent(draft, command.parentId);
        if (!parent.ok) return parent;
        const allocated = this.#allocatePosition(
          draft,
          command.parentId,
          command.placement,
        );
        if (!allocated.ok) return allocated;
        const node: BomNode<TFields> = Object.freeze({
          ...command.node,
          parentId: command.parentId,
          positionKey: allocated.value.positionKey,
        });
        return transactionSuccess(
          Object.freeze([
            ...allocated.value.beforeOperations,
            Object.freeze({ op: 'insertNode', node }),
          ]),
        );
      }
      case 'deleteSubtree':
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'deleteSubtree',
              occurrenceId: command.occurrenceId,
            }),
          ]),
        );
      case 'moveSubtree': {
        if (draft.completeness === 'partial') return partialStructureFailure();
        if (!draft.hasNode(command.occurrenceId)) {
          return nodeNotFound(command.occurrenceId);
        }
        const parent = this.#requireParent(draft, command.newParentId);
        if (!parent.ok) return parent;
        const allocated = this.#allocatePosition(
          draft,
          command.newParentId,
          command.placement,
          command.occurrenceId,
        );
        if (!allocated.ok) return allocated;
        return transactionSuccess(
          Object.freeze([
            ...allocated.value.beforeOperations,
            Object.freeze({
              op: 'moveSubtree',
              occurrenceId: command.occurrenceId,
              newParentId: command.newParentId,
              positionKey: allocated.value.positionKey,
            }),
          ]),
        );
      }
      case 'setField':
        if (command.fieldPath.length === 0) return fieldPathFailure();
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'updateField',
              occurrenceId: command.occurrenceId,
              fieldPath: command.fieldPath,
              value: command.value,
              ...(command.expectedValueHash === undefined
                ? {}
                : { expectedValueHash: command.expectedValueHash }),
            }),
          ]),
        );
      case 'unsetField': {
        if (command.fieldPath.length === 0) return fieldPathFailure();
        const node = draft.getNode(command.occurrenceId);
        if (node === undefined) return nodeNotFound(command.occurrenceId);
        if (hasBomFieldPathTypeConflict(node.fields, command.fieldPath)) {
          return fieldPathFailure();
        }
        const lookup = getBomFieldPath(node.fields, command.fieldPath);
        if (
          command.expectedPresent !== undefined &&
          command.expectedPresent !== lookup.present
        ) {
          return fieldPreconditionFailure(command.occurrenceId);
        }
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'unsetField',
              occurrenceId: command.occurrenceId,
              fieldPath: command.fieldPath,
              ...(command.expectedValueHash === undefined
                ? {}
                : { expectedValueHash: command.expectedValueHash }),
            }),
          ]),
        );
      }
      case 'setMaterialRef':
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'setMaterialRef',
              occurrenceId: command.occurrenceId,
              ...(command.materialId === undefined
                ? {}
                : { materialId: command.materialId }),
              ...(command.materialRevision === undefined
                ? {}
                : { materialRevision: command.materialRevision }),
              ...(command.materialCode === undefined
                ? {}
                : { materialCode: command.materialCode }),
            }),
          ]),
        );
      default:
        return transactionFailure(
          transactionError(BOM_TRANSACTION_ERROR_CODES.commandUnsupported, 'PLUGIN'),
        );
    }
  }

  #allocatePosition(
    draft: BomTransactionDraft<TFields>,
    parentId: OccurrenceId | null,
    placement: BomPlacement,
    movingOccurrenceId?: OccurrenceId,
  ): BomTransactionResult<AllocatedPosition<TFields>> {
    const siblings = draft
      .getChildren(parentId)
      .filter((occurrenceId) => occurrenceId !== movingOccurrenceId);
    const insertionIndex = resolvePlacementIndex(
      siblings,
      placement,
      movingOccurrenceId,
    );
    if (!insertionIndex.ok) return insertionIndex;

    const left =
      insertionIndex.value === 0
        ? null
        : draft.getNode(siblings[insertionIndex.value - 1]!)?.positionKey ?? null;
    const right =
      insertionIndex.value === siblings.length
        ? null
        : draft.getNode(siblings[insertionIndex.value]!)?.positionKey ?? null;
    const direct = createPositionKeyBetween(left, right, {
      maxBytes: this.#positionKeyMaxBytes,
    });
    if (direct.ok) {
      return transactionSuccess({ beforeOperations: [], positionKey: direct.value });
    }

    const movingNode =
      movingOccurrenceId === undefined
        ? undefined
        : draft.getNode(movingOccurrenceId);
    const rebalanceSiblings =
      movingNode?.parentId === parentId
        ? draft.getChildren(parentId)
        : siblings;
    const rebalanced = rebalancePositionKeys(rebalanceSiblings.length, {
      maxBytes: this.#positionKeyMaxBytes,
    });
    if (!rebalanced.ok) return transactionFailure(rebalanced.errors);
    const positions = Object.freeze(
      rebalanceSiblings.map((occurrenceId, index) =>
        Object.freeze({
          occurrenceId,
          positionKey: rebalanced.value[index]!,
        }),
      ),
    );
    const positionById = new Map(
      positions.map((position) => [position.occurrenceId, position.positionKey]),
    );
    const rebalancedLeft =
      insertionIndex.value === 0
        ? null
        : positionById.get(siblings[insertionIndex.value - 1]!) ?? null;
    const rebalancedRight =
      insertionIndex.value === siblings.length
        ? null
        : positionById.get(siblings[insertionIndex.value]!) ?? null;
    const afterRebalance = createPositionKeyBetween(
      rebalancedLeft,
      rebalancedRight,
      { maxBytes: this.#positionKeyMaxBytes },
    );
    if (!afterRebalance.ok) return transactionFailure(afterRebalance.errors);

    return transactionSuccess({
      beforeOperations: Object.freeze([
        Object.freeze({ op: 'rebalancePositions', parentId, positions }),
      ]),
      positionKey: afterRebalance.value,
    });
  }

  #applyOperation(
    draft: BomTransactionDraft<TFields>,
    operation: BomOperation<TFields>,
  ): BomTransactionResult<readonly BomOperation<TFields>[]> {
    if (
      draft.completeness === 'partial' &&
      (operation.op === 'insertNode' ||
        operation.op === 'deleteSubtree' ||
        operation.op === 'moveSubtree' ||
        operation.op === 'reorder' ||
        operation.op === 'rebalancePositions')
    ) {
      return partialStructureFailure();
    }

    switch (operation.op) {
      case 'insertNode': {
        if (draft.hasNode(operation.node.occurrenceId)) {
          return transactionFailure(
            transactionError(BOM_TRANSACTION_ERROR_CODES.nodeAlreadyExists, 'DATA', {
              occurrenceId: operation.node.occurrenceId,
            }),
          );
        }
        const parent = this.#requireParent(draft, operation.node.parentId);
        if (!parent.ok) return parent;
        const key = validatePositionKey(
          operation.node.positionKey,
          ['patch', 'positionKey'],
          this.#positionKeyMaxBytes,
        );
        if (!key.ok) return transactionFailure(key.errors);
        draft.insertNode(operation.node);
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'deleteSubtree',
              occurrenceId: operation.node.occurrenceId,
            }),
          ]),
        );
      }
      case 'deleteSubtree': {
        if (!draft.hasNode(operation.occurrenceId)) {
          return nodeNotFound(operation.occurrenceId);
        }
        const removed = draft.deleteSubtree(operation.occurrenceId);
        return transactionSuccess(
          Object.freeze(
            removed.map((node) => Object.freeze({ op: 'insertNode', node })),
          ),
        );
      }
      case 'moveSubtree': {
        const node = draft.getNode(operation.occurrenceId);
        if (node === undefined) return nodeNotFound(operation.occurrenceId);
        const parent = this.#requireParent(draft, operation.newParentId);
        if (!parent.ok) return parent;
        const key = validatePositionKey(
          operation.positionKey,
          ['patch', 'positionKey'],
          this.#positionKeyMaxBytes,
        );
        if (!key.ok) return transactionFailure(key.errors);
        draft.moveNode(
          operation.occurrenceId,
          operation.newParentId,
          operation.positionKey,
        );
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'moveSubtree',
              occurrenceId: operation.occurrenceId,
              newParentId: node.parentId,
              positionKey: node.positionKey,
            }),
          ]),
        );
      }
      case 'updateField': {
        if (operation.fieldPath.length === 0) return fieldPathFailure();
        const node = draft.getNode(operation.occurrenceId);
        if (node === undefined) return nodeNotFound(operation.occurrenceId);
        if (hasBomFieldPathTypeConflict(node.fields, operation.fieldPath)) {
          return fieldPathFailure();
        }
        const lookup = getBomFieldPath(node.fields, operation.fieldPath);
        const precondition = this.#checkFieldHash(
          operation.occurrenceId,
          operation.fieldPath,
          lookup,
          operation.expectedValueHash,
        );
        if (!precondition.ok) return precondition;
        const inverseUnsetPath = lookup.present
          ? undefined
          : findFirstMissingBomFieldPathPrefix(
              node.fields,
              operation.fieldPath,
            ) ?? operation.fieldPath;
        draft.replaceNode(
          Object.freeze({
            ...node,
            fields: setBomFieldPath(node.fields, operation.fieldPath, operation.value),
          }),
        );
        const inverse: BomOperation<TFields> = lookup.present
          ? Object.freeze({
              op: 'updateField',
              occurrenceId: operation.occurrenceId,
              fieldPath: operation.fieldPath,
              value: lookup.value!,
            })
          : Object.freeze({
              op: 'unsetField',
              occurrenceId: operation.occurrenceId,
              fieldPath: inverseUnsetPath ?? operation.fieldPath,
            });
        return transactionSuccess(Object.freeze([inverse]));
      }
      case 'unsetField': {
        if (operation.fieldPath.length === 0) return fieldPathFailure();
        const node = draft.getNode(operation.occurrenceId);
        if (node === undefined) return nodeNotFound(operation.occurrenceId);
        if (hasBomFieldPathTypeConflict(node.fields, operation.fieldPath)) {
          return fieldPathFailure();
        }
        const lookup = getBomFieldPath(node.fields, operation.fieldPath);
        const precondition = this.#checkFieldHash(
          operation.occurrenceId,
          operation.fieldPath,
          lookup,
          operation.expectedValueHash,
        );
        if (!precondition.ok) return precondition;
        draft.replaceNode(
          Object.freeze({
            ...node,
            fields: unsetBomFieldPath(node.fields, operation.fieldPath),
          }),
        );
        const inverse: BomOperation<TFields> = lookup.present
          ? Object.freeze({
              op: 'updateField',
              occurrenceId: operation.occurrenceId,
              fieldPath: operation.fieldPath,
              value: lookup.value!,
            })
          : Object.freeze({
              op: 'unsetField',
              occurrenceId: operation.occurrenceId,
              fieldPath: operation.fieldPath,
            });
        return transactionSuccess(Object.freeze([inverse]));
      }
      case 'setMaterialRef': {
        const node = draft.getNode(operation.occurrenceId);
        if (node === undefined) return nodeNotFound(operation.occurrenceId);
        const updated = replaceMaterialReference(node, operation);
        draft.replaceNode(updated);
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'setMaterialRef',
              occurrenceId: operation.occurrenceId,
              ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
              ...(node.materialRevision === undefined
                ? {}
                : { materialRevision: node.materialRevision }),
              ...(node.materialCode === undefined
                ? {}
                : { materialCode: node.materialCode }),
            }),
          ]),
        );
      }
      case 'reorder': {
        const node = draft.getNode(operation.occurrenceId);
        if (node === undefined) return nodeNotFound(operation.occurrenceId);
        const key = validatePositionKey(
          operation.positionKey,
          ['patch', 'positionKey'],
          this.#positionKeyMaxBytes,
        );
        if (!key.ok) return transactionFailure(key.errors);
        draft.setPosition(operation.occurrenceId, operation.positionKey);
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'reorder',
              occurrenceId: operation.occurrenceId,
              positionKey: node.positionKey,
            }),
          ]),
        );
      }
      case 'rebalancePositions': {
        const validated = this.#validateRebalance(draft, operation);
        if (!validated.ok) return validated;
        const inverse = Object.freeze(
          draft.getChildren(operation.parentId).map((occurrenceId) =>
            Object.freeze({
              occurrenceId,
              positionKey: draft.getNode(occurrenceId)!.positionKey,
            }),
          ),
        );
        draft.setPositions(operation.parentId, operation.positions);
        return transactionSuccess(
          Object.freeze([
            Object.freeze({
              op: 'rebalancePositions',
              parentId: operation.parentId,
              positions: inverse,
            }),
          ]),
        );
      }
    }
  }

  #commitPatch(
    patch: BomPatch<TFields>,
    recordHistory: boolean,
    preparedFieldApplication?: PreparedFieldApplication<TFields>,
    historyReplaySource?: BomHistoryEntryReplaySource<TFields>,
  ): BomTransactionResult<BomCommit<TFields>> {
    const metadata = this.#validatePatch(patch);
    if (!metadata.ok) return metadata;
    if (patch.operations.length === 0) {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.metadataInvalid, 'VALIDATION'),
      );
    }

    const fieldOnly = patch.operations.every(isFieldOperation);
    const draft =
      preparedFieldApplication?.draft ??
      new BomTransactionDraft(this.#snapshot, this.#indexes);
    const inverseOperations: BomOperation<TFields>[] =
      preparedFieldApplication === undefined
        ? []
        : [...preparedFieldApplication.inverseOperations];
    if (preparedFieldApplication === undefined) {
      for (const operation of patch.operations) {
        const applied = this.#applyOperation(draft, operation);
        if (!applied.ok) return applied;
        inverseOperations.unshift(...applied.value);
      }
    }

    let provisionalSnapshot: import('@bom-editor/contracts').BomDocumentSnapshot<TFields>;
    if (fieldOnly) {
      for (const occurrenceId of draft.changedOccurrenceIds()) {
        const node = draft.getNode(occurrenceId)!;
        const fields = normalizeBomFields<TFields>(node.fields, this.#schema);
        if (!fields.ok) {
          return transactionFailure(fields.errors);
        }
        draft.replaceNode(
          Object.freeze({
            ...node,
            fields: fields.value,
          }),
        );
      }
      provisionalSnapshot = draft.toFieldSnapshot(this.#snapshot.revision);
    } else {
      const provisional = normalizeBomDocumentSnapshot<TFields>(
        draft.toSnapshot(this.#snapshot.revision),
        this.#schema,
      );
      if (!provisional.ok) return transactionFailure(provisional.errors);
      provisionalSnapshot = provisional.value;
    }
    let candidateContentHash: string | undefined;
    if (this.#revisionUsesContentHash) {
      candidateContentHash = requireResultValue(hashBomDocumentContent<TFields>(
        provisionalSnapshot,
        this.#schema,
      ));
    }

    const revisionSequence = this.#revisionSequence + 1;
    const revision = this.#revisionFactory({
      documentId: this.#snapshot.documentId,
      previousRevision: this.#snapshot.revision,
      transactionId: patch.transactionId,
      contentHash: candidateContentHash ?? '',
      sequence: revisionSequence,
    });
    if (
      typeof revision !== 'string' ||
      revision.length === 0 ||
      revision === this.#snapshot.revision
    ) {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.configInvalid, 'CONFIG'),
      );
    }

    const normalized = Object.freeze({
      ...provisionalSnapshot,
      revision,
    });
    let indexes: BomBaseIndexes<TFields>;
    if (fieldOnly) {
      indexes = draft.toFieldIndexes();
    } else {
      const builtIndexes = buildBomIndexes(normalized);
      if (!builtIndexes.ok) return transactionFailure(builtIndexes.errors);
      indexes = builtIndexes.value;
    }
    const capturedInverse = requireResultValue(captureOperationList(inverseOperations));

    const inversePatch: BomPatch<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#snapshot.documentId,
      baseRevision: revision,
      transactionId: `${patch.transactionId}:inverse`,
      origin: `inverse:${patch.origin}`,
      timestamp: patch.timestamp,
      operations: capturedInverse,
    });
    const commit: BomCommit<TFields> = Object.freeze({
      transactionId: patch.transactionId,
      previousRevision: this.#snapshot.revision,
      revision,
      patch,
      inversePatch,
      warnings: Object.freeze([]),
    });
    const historyEntry = recordHistory
      ? createHistoryEntry(
          commit,
          inversePatch.operations,
          historyReplaySource ?? Object.freeze({ kind: 'patch' }),
        )
      : undefined;

    if (this.#beforeApply !== undefined) {
      const requireContentHash = (): string => {
        if (candidateContentHash === undefined) {
          candidateContentHash = requireResultValue(hashBomDocumentContent<TFields>(
            normalized,
            this.#schema,
          ));
        }
        return candidateContentHash;
      };
      const prepared: BomPreparedTransaction<TFields> = Object.freeze({
        patch,
        inversePatch,
        previousSnapshot: this.#snapshot,
        snapshot: normalized,
        indexes,
        previousRevision: this.#snapshot.revision,
        revision,
        get contentHash(): string {
          return requireContentHash();
        },
      });
      let decision: boolean | void;
      this.#insideBeforeApply = true;
      try {
        decision = this.#beforeApply(prepared);
      } catch {
        return transactionFailure(
          transactionError(
            BOM_TRANSACTION_ERROR_CODES.beforeApplyFailed,
            'INTERNAL',
          ),
        );
      } finally {
        this.#insideBeforeApply = false;
      }
      if (decision !== undefined && typeof decision !== 'boolean') {
        return transactionFailure(
          transactionError(
            BOM_TRANSACTION_ERROR_CODES.beforeApplyFailed,
            'VALIDATION',
          ),
        );
      }
      if (decision === false) {
        return transactionFailure(
          transactionError(
            BOM_TRANSACTION_ERROR_CODES.beforeApplyRejected,
            'ABORTED',
          ),
        );
      }
    }
    this.#snapshot = normalized;
    this.#indexes = indexes;
    this.#contentHash = candidateContentHash;
    this.#revisionSequence = revisionSequence;
    if (historyEntry !== undefined) {
      this.#recordHistory(historyEntry);
    }
    return transactionSuccess(commit);
  }

  #checkFieldHash(
    occurrenceId: OccurrenceId,
    fieldPath: readonly string[],
    lookup: ReturnType<typeof getBomFieldPath>,
    expectedValueHash: string | undefined,
  ): BomTransactionResult<true> {
    if (expectedValueHash === undefined) return transactionSuccess(true);
    if (!lookup.present) return fieldPreconditionFailure(occurrenceId);
    const field = findSchemaField(this.#schema, fieldPath);
    if (field === undefined) return fieldPathFailure();
    const actual = hashBomFieldValue(lookup.value, this.#schema, field);
    if (!actual.ok) return transactionFailure(actual.errors);
    return actual.value === expectedValueHash
      ? transactionSuccess(true)
      : fieldPreconditionFailure(occurrenceId);
  }

  #validateRebalance(
    draft: BomTransactionDraft<TFields>,
    operation: Extract<BomOperation<TFields>, { readonly op: 'rebalancePositions' }>,
  ): BomTransactionResult<true> {
    const parent = this.#requireParent(draft, operation.parentId);
    if (!parent.ok) return parent;
    const siblings = draft.getChildren(operation.parentId);
    if (siblings.length !== operation.positions.length) {
      return placementFailure();
    }
    const expected = new Set(siblings);
    const seenIds = new Set<OccurrenceId>();
    const seenKeys = new Set<string>();
    for (const position of operation.positions) {
      if (
        !expected.has(position.occurrenceId) ||
        seenIds.has(position.occurrenceId) ||
        seenKeys.has(position.positionKey)
      ) {
        return placementFailure();
      }
      const key = validatePositionKey(
        position.positionKey,
        ['patch', 'positions'],
        this.#positionKeyMaxBytes,
      );
      if (!key.ok) return transactionFailure(key.errors);
      seenIds.add(position.occurrenceId);
      seenKeys.add(position.positionKey);
    }
    const ordered = [...operation.positions].sort((left, right) =>
      comparePositionKeys(left.positionKey, right.positionKey),
    );
    if (
      ordered.some(
        (position, index) => position.occurrenceId !== siblings[index],
      )
    ) {
      return placementFailure();
    }
    return transactionSuccess(true);
  }

  #requireParent(
    draft: BomTransactionDraft<TFields>,
    parentId: OccurrenceId | null,
  ): BomTransactionResult<true> {
    return parentId === null || draft.hasNode(parentId)
      ? transactionSuccess(true)
      : nodeNotFound(parentId);
  }

  #validateBatch(
    batch: BomCommandBatch<TFields>,
  ): BomTransactionResult<true> {
    if (batch.protocolVersion !== this.#protocolVersion) {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.protocolMismatch, 'CONFIG'),
      );
    }
    if (batch.documentId !== this.#snapshot.documentId) {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.documentMismatch, 'CONFLICT'),
      );
    }
    if (batch.documentGeneration !== this.#documentGeneration) {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.generationMismatch, 'CONFLICT'),
      );
    }
    if (batch.baseRevision !== this.#snapshot.revision) {
      return baseRevisionFailure();
    }
    return validateMetadata(
      batch.transactionId,
      batch.origin,
      batch.timestamp,
      batch.dependsOnTransactionId,
      batch.idempotencyKey,
    );
  }

  #validatePatch(patch: BomPatch<TFields>): BomTransactionResult<true> {
    if (patch.protocolVersion !== this.#protocolVersion) {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.protocolMismatch, 'CONFIG'),
      );
    }
    if (patch.documentId !== this.#snapshot.documentId) {
      return transactionFailure(
        transactionError(BOM_TRANSACTION_ERROR_CODES.documentMismatch, 'CONFLICT'),
      );
    }
    if (patch.baseRevision !== this.#snapshot.revision) {
      return baseRevisionFailure();
    }
    return validateMetadata(
      patch.transactionId,
      patch.origin,
      patch.timestamp,
      patch.dependsOnTransactionId,
      patch.idempotencyKey,
    );
  }

  #createMetadata(
    purpose: 'execute' | 'undo' | 'redo',
    transactionId: BomTransactionId | undefined,
    timestamp: string | undefined,
  ): GeneratedMetadata {
    const sequence = this.#transactionSequence + 1;
    this.#transactionSequence = sequence;
    return {
      transactionId:
        transactionId ??
        this.#transactionIdFactory({
          documentId: this.#snapshot.documentId,
          sequence,
          purpose,
        }),
      timestamp: timestamp ?? this.#timestampFactory(),
    };
  }

  #createReplayPatch(
    operations: readonly BomOperation<TFields>[],
    metadata: GeneratedMetadata,
    origin: string,
    dependsOnTransactionId?: BomTransactionId,
    idempotencyKey?: string,
  ): BomPatch<TFields> {
    return Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#snapshot.documentId,
      baseRevision: this.#snapshot.revision,
      transactionId: metadata.transactionId,
      ...(dependsOnTransactionId === undefined
        ? {}
        : { dependsOnTransactionId }),
      origin,
      timestamp: metadata.timestamp,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      operations,
    });
  }

  #recordHistory(entry: BomHistoryEntry<TFields>): void {
    while (this.#redo.length > 0) {
      this.#historyBytes -= this.#redo.pop()!.bytes;
    }
    this.#undo.push(entry);
    this.#historyBytes += entry.bytes;

    while (
      this.#undo.length > this.#historyBudget.maxEntries ||
      this.#historyBytes > this.#historyBudget.maxBytes
    ) {
      const evicted = this.#undo.shift();
      if (evicted === undefined) break;
      this.#historyBytes -= evicted.bytes;
      this.#evictedEntries += 1;
    }
  }

  #enqueue<T>(
    work: () => BomTransactionResult<T>,
  ): Promise<BomTransactionResult<T>> {
    const result = this.#tail.then(() => {
      try {
        return work();
      } catch {
        return transactionFailure<T>(
          transactionError(BOM_TRANSACTION_ERROR_CODES.internal, 'INTERNAL'),
        );
      }
    });
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function captureSafely<T>(
  capture: () => BomTransactionResult<T>,
): BomTransactionResult<T> {
  try {
    return capture();
  } catch {
    return transactionFailure(
      transactionError(
        BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
        'VALIDATION',
      ),
    );
  }
}

function captureHistorySuffixReconcileRequest<
  TFields extends BomFields,
>(
  request: BomHistorySuffixReconcileRequest<TFields>,
): BomTransactionResult<CapturedHistorySuffixReconcileRequest<TFields>> {
  if (
    typeof request !== 'object' ||
    request === null ||
    !Array.isArray(request.descendants) ||
    (request.remoteOperations !== undefined &&
      !Array.isArray(request.remoteOperations))
  ) {
    return historyReplayInvalid();
  }
  const descendants: BomHistorySuffixReplay<TFields>[] = [];
  for (const replay of request.descendants) {
    if (typeof replay !== 'object' || replay === null) {
      return historyReplayInvalid();
    }
    if (replay.kind === 'commands') {
      const batch = captureCommandBatch<TFields>(replay.batch);
      if (!batch.ok) return historyReplayInvalid();
      descendants.push(Object.freeze({ kind: 'commands', batch: batch.value }));
      continue;
    }
    if (replay.kind === 'patch') {
      const patch = capturePatch<TFields>(replay.patch);
      if (!patch.ok) return historyReplayInvalid();
      descendants.push(Object.freeze({ kind: 'patch', patch: patch.value }));
      continue;
    }
    return historyReplayInvalid();
  }
  const remoteOperations = captureOperationList<TFields>(
    request.remoteOperations ?? Object.freeze([]),
  );
  if (!remoteOperations.ok) return historyReplayInvalid();
  return transactionSuccess(Object.freeze({
    failedTransactionId: request.failedTransactionId,
    transactionId: request.transactionId,
    origin: request.origin,
    timestamp: request.timestamp,
    descendants: Object.freeze(descendants),
    remoteOperations: remoteOperations.value,
  }));
}

function validateEngineOptions<TFields extends BomFields>(
  options: BomTransactionEngineOptions<TFields>,
): BomTransactionResult<{
  readonly history: Readonly<BomHistoryBudget>;
  readonly positionKeyMaxBytes: number;
}> {
  const history = {
    maxEntries: options.history?.maxEntries ?? DEFAULT_HISTORY_BUDGET.maxEntries,
    maxBytes: options.history?.maxBytes ?? DEFAULT_HISTORY_BUDGET.maxBytes,
  };
  const positionKeyMaxBytes = options.positionKeyMaxBytes ?? 128;
  if (
    typeof options.protocolVersion !== 'string' ||
    options.protocolVersion.length === 0 ||
    !Number.isSafeInteger(options.documentGeneration ?? 0) ||
    (options.documentGeneration ?? 0) < 0 ||
    !Number.isSafeInteger(history.maxEntries) ||
    history.maxEntries < 0 ||
    !Number.isSafeInteger(history.maxBytes) ||
    history.maxBytes < 0 ||
    !Number.isSafeInteger(positionKeyMaxBytes) ||
    positionKeyMaxBytes <= 0 ||
    positionKeyMaxBytes > 128
  ) {
    return transactionFailure(
      transactionError(BOM_TRANSACTION_ERROR_CODES.configInvalid, 'CONFIG'),
    );
  }
  return transactionSuccess({
    history: Object.freeze(history),
    positionKeyMaxBytes,
  });
}

function validateMetadata(
  transactionId: string,
  origin: string,
  timestamp: string,
  dependsOnTransactionId?: string,
  idempotencyKey?: string,
): BomTransactionResult<true> {
  return (
    typeof transactionId === 'string' &&
    transactionId.length > 0 &&
    typeof origin === 'string' &&
    origin.length > 0 &&
    typeof timestamp === 'string' &&
    timestamp.length > 0 &&
    (dependsOnTransactionId === undefined ||
      (typeof dependsOnTransactionId === 'string' &&
        dependsOnTransactionId.length > 0 &&
        dependsOnTransactionId !== transactionId)) &&
    (idempotencyKey === undefined ||
      (typeof idempotencyKey === 'string' && idempotencyKey.length > 0))
      ? transactionSuccess(true)
      : transactionFailure(
          transactionError(
            BOM_TRANSACTION_ERROR_CODES.metadataInvalid,
            'VALIDATION',
          ),
        )
  );
}

function resolvePlacementIndex(
  siblings: readonly OccurrenceId[],
  placement: BomPlacement,
  movingOccurrenceId?: OccurrenceId,
): BomTransactionResult<number> {
  if ('at' in placement) {
    return transactionSuccess(placement.at === 'first' ? 0 : siblings.length);
  }
  const reference =
    'beforeOccurrenceId' in placement
      ? placement.beforeOccurrenceId
      : placement.afterOccurrenceId;
  if (reference === movingOccurrenceId) return placementFailure();
  const index = siblings.indexOf(reference);
  if (index < 0) return placementFailure();
  return transactionSuccess(
    'beforeOccurrenceId' in placement ? index : index + 1,
  );
}

function replaceMaterialReference<TFields extends BomFields>(
  node: BomNode<TFields>,
  operation: Extract<BomOperation<TFields>, { readonly op: 'setMaterialRef' }>,
): BomNode<TFields> {
  return Object.freeze({
    occurrenceId: node.occurrenceId,
    kind: node.kind,
    ...(operation.materialId === undefined
      ? {}
      : { materialId: operation.materialId }),
    ...(operation.materialRevision === undefined
      ? {}
      : { materialRevision: operation.materialRevision }),
    ...(operation.materialCode === undefined
      ? {}
      : { materialCode: operation.materialCode }),
    parentId: node.parentId,
    positionKey: node.positionKey,
    ...(node.childrenState === undefined
      ? {}
      : { childrenState: node.childrenState }),
    ...(node.knownChildCount === undefined
      ? {}
      : { knownChildCount: node.knownChildCount }),
    fields: node.fields,
  });
}

function findSchemaField(
  schema: BomSchema,
  path: readonly string[],
): BomFieldSchema | undefined {
  return schema.fields.find(
    (field) =>
      field.path.length === path.length &&
      field.path.every((segment, index) => segment === path[index]),
  );
}

function isFieldOperation(
  operation: BomOperation,
): operation is Extract<
  BomOperation,
  { readonly op: 'updateField' | 'unsetField' }
> {
  return operation.op === 'updateField' || operation.op === 'unsetField';
}

function createHistoryEntry<TFields extends BomFields>(
  commit: BomCommit<TFields>,
  inverseOperations: readonly BomOperation<TFields>[],
  replaySource: BomHistoryEntryReplaySource<TFields>,
): BomHistoryEntry<TFields> {
  const serialized = JSON.stringify({
    patch: commit.patch,
    inverseOperations,
    replaySource,
  });
  return Object.freeze({
    transactionId: commit.transactionId,
    previousRevision: commit.previousRevision,
    revision: commit.revision,
    patch: commit.patch,
    inverseOperations,
    replaySource,
    bytes: utf8ByteLength(serialized),
  });
}

function nodeNotFound<T>(occurrenceId: OccurrenceId): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(BOM_TRANSACTION_ERROR_CODES.nodeNotFound, 'DATA', {
      occurrenceId,
    }),
  );
}

function placementFailure<T>(): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(BOM_TRANSACTION_ERROR_CODES.placementInvalid, 'VALIDATION'),
  );
}

function fieldPathFailure<T>(): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(BOM_TRANSACTION_ERROR_CODES.fieldPathInvalid, 'VALIDATION'),
  );
}

function fieldPreconditionFailure<T>(
  occurrenceId: OccurrenceId,
): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(
      BOM_TRANSACTION_ERROR_CODES.fieldPreconditionFailed,
      'CONFLICT',
      { occurrenceId },
    ),
  );
}

function partialStructureFailure<T>(): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(
      BOM_TRANSACTION_ERROR_CODES.partialStructureUnsupported,
      'VALIDATION',
    ),
  );
}

function reentrantFailure<T>(): Promise<BomTransactionResult<T>> {
  return Promise.resolve(
    transactionFailure(
      transactionError(
        BOM_TRANSACTION_ERROR_CODES.reentrantExecute,
        'VALIDATION',
      ),
    ),
  );
}

function historySuffixEvicted<T>(): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(
      BOM_TRANSACTION_ERROR_CODES.historySuffixEvicted,
      'CONFLICT',
    ),
  );
}

function historySuffixMismatch<T>(): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(
      BOM_TRANSACTION_ERROR_CODES.historySuffixMismatch,
      'CONFLICT',
    ),
  );
}

function historyReplayInvalid<T>(): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(
      BOM_TRANSACTION_ERROR_CODES.historyReplayInvalid,
      'VALIDATION',
    ),
  );
}

function baseRevisionFailure<T>(): BomTransactionResult<T> {
  return transactionFailure(
    transactionError(
      BOM_TRANSACTION_ERROR_CODES.baseRevisionMismatch,
      'CONFLICT',
    ),
  );
}










