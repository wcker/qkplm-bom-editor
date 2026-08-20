import type {
  BomCommitResponse,
  BomDataSourceCapabilities,
  BomDocumentSnapshot,
  BomFields,
  BomPatch,
  BomRemotePatchEnvelope,
  BomResult,
  BomSchema,
  RevisionToken,
} from '@bom-editor/contracts';
import {
  encodeCanonicalValue,
  normalizeBomDocumentSnapshot,
  normalizeBomSchema,
  normalizeBomValue,
} from '@bom-editor/model';
import {
  BOM_TRANSACTION_ERROR_CODES,
  createBomTransactionEngine,
  type BomPreparedTransaction,
  type BomTransactionEngineApi,
} from '@bom-editor/transaction';
import {
  BOM_DATASOURCE_ERROR_CODES,
  BomDataSourceException,
  dataSourceError,
  dataSourceFailure,
  dataSourceSuccess,
} from './errors.js';
import type {
  BomMemoryDataSource,
  BomMemoryDataSourceOptions,
  BomRemoteObserver,
} from './types.js';

interface IdempotencyRecord<TFields extends BomFields> {
  readonly fingerprint: string;
  readonly response: Extract<
    BomCommitResponse<TFields>,
    { readonly status: 'acknowledged' }
  >;
}

const MEMORY_CAPABILITIES_BASE = Object.freeze({
  streaming: false,
  lazyChildren: false,
  remoteQuery: false,
  remoteChanges: true,
  cancelPendingCommit: false,
  queryExecution: Object.freeze({
    search: 'local',
    filter: 'local',
    sort: 'local',
    pagination: 'local',
  }),
} as const);

export function createMemoryDataSource<
  TFields extends BomFields = BomFields,
>(
  options: BomMemoryDataSourceOptions<TFields>,
): BomResult<BomMemoryDataSource<TFields>> {
  const schema = normalizeBomSchema(options.schema);
  if (!schema.ok) {
    return dataSourceFailure(schema.errors[0]!);
  }
  const snapshot = normalizeBomDocumentSnapshot<TFields>(
    options.snapshot,
    schema.value,
  );
  if (!snapshot.ok) {
    return dataSourceFailure(snapshot.errors[0]!);
  }
  if (
    typeof options.protocolVersion !== 'string' ||
    options.protocolVersion.length === 0 ||
    (options.writable !== undefined && typeof options.writable !== 'boolean')
  ) {
    return dataSourceFailure(
      dataSourceError(BOM_DATASOURCE_ERROR_CODES.capabilityMismatch, 'CONFIG'),
    );
  }
  try {
    return dataSourceSuccess(
      new MemoryDataSourceImpl(
        snapshot.value,
        schema.value,
        options.protocolVersion,
        options.writable ?? true,
      ),
    );
  } catch {
    return dataSourceFailure(
      dataSourceError(BOM_DATASOURCE_ERROR_CODES.internal, 'INTERNAL'),
    );
  }
}

class MemoryDataSourceImpl<TFields extends BomFields>
  implements BomMemoryDataSource<TFields> {
  readonly capabilities: Readonly<BomDataSourceCapabilities>;
  readonly #schema: BomSchema;
  readonly #protocolVersion: string;
  readonly #observers = new Set<BomRemoteObserver<TFields>>();
  readonly #idempotency = new Map<string, IdempotencyRecord<TFields>>();
  #engine: BomTransactionEngineApi<TFields>;
  #snapshot: BomDocumentSnapshot<TFields>;
  #sourceRevision: RevisionToken;
  #remoteSequence = 0;
  #tail: Promise<void> = Promise.resolve();
  #destroyed = false;
  #preparedSnapshot: BomDocumentSnapshot<TFields> | undefined;
  #preparedError: import('@bom-editor/contracts').BomError | undefined;

  public constructor(
    snapshot: BomDocumentSnapshot<TFields>,
    schema: BomSchema,
    protocolVersion: string,
    writable: boolean,
  ) {
    this.#schema = schema;
    this.#protocolVersion = protocolVersion;
    this.#sourceRevision = snapshot.sourceRevision ?? snapshot.revision;
    const published = normalizeBomDocumentSnapshot<TFields>(
      { ...snapshot, sourceRevision: this.#sourceRevision },
      schema,
    );
    if (!published.ok) {
      throw new Error('Failed to establish memory source ownership.');
    }
    this.#snapshot = published.value;
    this.capabilities = Object.freeze({
      ...MEMORY_CAPABILITIES_BASE,
      writable,
    });
    const engine = createBomTransactionEngine<TFields>({
      snapshot: this.#snapshot,
      schema,
      protocolVersion,
      history: { maxEntries: 0, maxBytes: 0 },
      beforeApply: (prepared): boolean => this.#preparePublishedSnapshot(prepared),
    });
    if (!engine.ok) {
      throw new Error('Failed to initialize memory transaction engine.');
    }
    this.#engine = engine.value;
    Object.seal(this);
  }

  public get destroyed(): boolean {
    return this.#destroyed;
  }

  public getSnapshot(): BomDocumentSnapshot<TFields> {
    return this.#snapshot;
  }

  public async loadDocument(options: {
    readonly signal: AbortSignal;
  }): Promise<BomDocumentSnapshot<TFields>> {
    if (this.#destroyed) {
      throw new BomDataSourceException(
        dataSourceError(BOM_DATASOURCE_ERROR_CODES.destroyed, 'CONFIG'),
      );
    }
    if (options.signal.aborted) {
      throw new BomDataSourceException(
        dataSourceError(BOM_DATASOURCE_ERROR_CODES.aborted, 'ABORTED'),
      );
    }
    return this.#snapshot;
  }

  public async commit(request: {
    readonly patch: BomPatch<TFields>;
    readonly expectedSourceRevision?: RevisionToken;
    readonly signal: AbortSignal;
  }): Promise<BomCommitResponse<TFields>> {
    const captured = normalizeBomValue(request.patch, {
      path: ['dataSource', 'commit', 'patch'],
    });
    if (!captured.ok) {
      return Object.freeze({
        status: 'rejected',
        error: captured.errors[0]!,
      });
    }
    const patch = captured.value as unknown as BomPatch<TFields>;
    const expectedSourceRevision = request.expectedSourceRevision;
    const signal = request.signal;
    return this.#enqueueCommit(() =>
      this.#commitCaptured(patch, expectedSourceRevision, signal),
    );
  }

  public subscribeRemote(observer: BomRemoteObserver<TFields>): () => void {
    if (this.#destroyed) {
      return (): void => {};
    }
    this.#observers.add(observer);
    let active = true;
    return (): void => {
      if (!active) {
        return;
      }
      active = false;
      this.#observers.delete(observer);
    };
  }

  public destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#observers.clear();
    this.#idempotency.clear();
  }

  async #commitCaptured(
    patch: BomPatch<TFields>,
    expectedSourceRevision: RevisionToken | undefined,
    signal: AbortSignal,
  ): Promise<BomCommitResponse<TFields>> {
    if (this.#destroyed) {
      return rejected(BOM_DATASOURCE_ERROR_CODES.destroyed, 'CONFIG');
    }
    if (signal.aborted) {
      return rejected(BOM_DATASOURCE_ERROR_CODES.aborted, 'ABORTED');
    }
    if (!this.capabilities.writable) {
      return rejected(BOM_DATASOURCE_ERROR_CODES.readOnly, 'CONFIG');
    }
    if (patch.documentId !== this.#snapshot.documentId) {
      return rejected(BOM_DATASOURCE_ERROR_CODES.documentMismatch, 'CONFLICT');
    }
    const idempotencyKey = patch.idempotencyKey;
    if (idempotencyKey === undefined || idempotencyKey.length === 0) {
      return rejected(BOM_DATASOURCE_ERROR_CODES.idempotencyRequired, 'VALIDATION');
    }
    const fingerprint = encodeCanonicalValue(
      patch as unknown as import('@bom-editor/contracts').BomValue,
    );
    const previousRecord = this.#idempotency.get(idempotencyKey);
    if (previousRecord !== undefined) {
      return previousRecord.fingerprint === fingerprint
        ? previousRecord.response
        : rejected(BOM_DATASOURCE_ERROR_CODES.idempotencyReused, 'CONFLICT');
    }
    if (
      expectedSourceRevision !== undefined &&
      expectedSourceRevision !== this.#sourceRevision
    ) {
      return Object.freeze({
        status: 'conflicted',
        sourceRevision: this.#sourceRevision,
      });
    }

    this.#preparedSnapshot = undefined;
    this.#preparedError = undefined;
    const previousSourceRevision = this.#sourceRevision;
    const applied = await this.#engine.applyPatch(patch);
    if (!applied.ok) {
      const first = applied.errors[0]!;
      if (
        first.code === BOM_TRANSACTION_ERROR_CODES.baseRevisionMismatch
      ) {
        return Object.freeze({
          status: 'conflicted',
          sourceRevision: this.#sourceRevision,
        });
      }
      return Object.freeze({
        status: 'rejected',
        error: this.#preparedError ?? first,
      });
    }
    if (this.#preparedSnapshot === undefined) {
      return rejected(BOM_DATASOURCE_ERROR_CODES.internal, 'INTERNAL');
    }

    this.#snapshot = this.#preparedSnapshot;
    this.#preparedSnapshot = undefined;
    this.#sourceRevision = applied.value.revision;
    const response = Object.freeze({
      status: 'acknowledged' as const,
      sourceRevision: this.#sourceRevision,
    });
    this.#idempotency.set(
      idempotencyKey,
      Object.freeze({ fingerprint, response }),
    );
    this.#remoteSequence += 1;
    const envelope: BomRemotePatchEnvelope<TFields> = Object.freeze({
      protocolVersion: this.#protocolVersion,
      documentId: this.#snapshot.documentId,
      sourceTransactionId: patch.transactionId,
      sequence: this.#remoteSequence,
      previousSourceRevision,
      sourceRevision: this.#sourceRevision,
      operations: patch.operations,
    });
    this.#notify(envelope);
    return response;
  }

  #preparePublishedSnapshot(
    prepared: BomPreparedTransaction<TFields>,
  ): boolean {
    const result = normalizeBomDocumentSnapshot<TFields>(
      {
        ...prepared.snapshot,
        sourceRevision: prepared.revision,
      },
      this.#schema,
    );
    if (!result.ok) {
      this.#preparedError = result.errors[0]!;
      return false;
    }
    this.#preparedSnapshot = result.value;
    return true;
  }

  #enqueueCommit<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(work);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #notify(envelope: BomRemotePatchEnvelope<TFields>): void {
    for (const observer of [...this.#observers]) {
      if (!this.#observers.has(observer)) {
        continue;
      }
      try {
        observer.next(envelope);
      } catch {
        // One consumer cannot interrupt source publication or later observers.
      }
    }
  }
}

function rejected<TFields extends BomFields>(
  code: Parameters<typeof dataSourceError>[0],
  category: Parameters<typeof dataSourceError>[1],
): BomCommitResponse<TFields> {
  return Object.freeze({
    status: 'rejected',
    error: dataSourceError(code, category),
  });
}
