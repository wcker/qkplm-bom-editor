import type {
  BomCommitResponse,
  BomDataSourceCapabilities,
  BomDocumentChunk,
  BomDocumentSnapshot,
  BomFields,
  BomPage,
  BomPatch,
  BomQueryRequest,
  BomQueryResult,
  BomRemotePatchEnvelope,
  OccurrenceId,
  RevisionToken,
} from '@bom-editor/contracts';
import type { BomSchema } from '@bom-editor/contracts';

export interface BomRemoteObserver<TFields extends BomFields = BomFields> {
  next(envelope: BomRemotePatchEnvelope<TFields>): void;
  error(error: import('@bom-editor/contracts').BomError): void;
  resyncRequired(actualSourceRevision?: RevisionToken): void;
}

export interface BomDataSource<TFields extends BomFields = BomFields> {
  readonly capabilities: Readonly<BomDataSourceCapabilities>;

  loadDocument(options: {
    readonly signal: AbortSignal;
  }): Promise<BomDocumentSnapshot<TFields>>;

  streamDocument?(options: {
    readonly signal: AbortSignal;
  }): AsyncIterable<BomDocumentChunk<TFields>>;

  loadChildren?(options: {
    readonly parentId: OccurrenceId;
    readonly cursor?: string;
    /** Revision captured before dispatch; the source must not mix page revisions. */
    readonly expectedSourceRevision?: RevisionToken;
    readonly signal: AbortSignal;
  }): Promise<BomPage<TFields>>;

  query?(
    request: BomQueryRequest & { readonly signal: AbortSignal },
  ): Promise<BomQueryResult>;

  commit?(request: {
    readonly patch: BomPatch<TFields>;
    readonly expectedSourceRevision?: RevisionToken;
    readonly signal: AbortSignal;
  }): Promise<BomCommitResponse<TFields>>;

  cancelCommit?(request: {
    readonly transactionId: string;
    readonly idempotencyKey: string;
    readonly signal: AbortSignal;
  }): Promise<{
    readonly cancelled: boolean;
    readonly sourceRevision?: RevisionToken;
  }>;

  subscribeRemote?(observer: BomRemoteObserver<TFields>): () => void;
}

export interface BomMemoryDataSourceOptions<
  TFields extends BomFields = BomFields,
> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly schema: BomSchema;
  readonly protocolVersion: string;
  readonly writable?: boolean;
}

export interface BomMemoryDataSource<TFields extends BomFields = BomFields>
  extends BomDataSource<TFields> {
  readonly destroyed: boolean;
  getSnapshot(): BomDocumentSnapshot<TFields>;
  destroy(): void;
}
