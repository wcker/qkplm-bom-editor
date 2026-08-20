import type { BomError, BomResult } from './error.js';
import type {
  BomDocumentGeneration,
  BomDocumentId,
  BomProtocolVersion,
  BomRequestId,
  BomTransactionId,
  OccurrenceId,
  RevisionToken,
} from './identifiers.js';
import type { BomOperation, BomPatch } from './patch.js';
import type {
  BomDocumentSnapshot,
  BomNode,
  BomSnapshotCompleteness,
} from './snapshot.js';
import type { BomFields, BomValue } from './value.js';

export type BomDataSourceExecutionLocation = 'local' | 'remote';

export interface BomDataSourceCapabilities {
  readonly streaming: boolean;
  readonly lazyChildren: boolean;
  readonly remoteQuery: boolean;
  readonly writable: boolean;
  readonly remoteChanges: boolean;
  readonly cancelPendingCommit: boolean;
  readonly queryExecution: Readonly<{
    readonly search: BomDataSourceExecutionLocation;
    readonly filter: BomDataSourceExecutionLocation;
    readonly sort: BomDataSourceExecutionLocation;
    readonly pagination: BomDataSourceExecutionLocation;
  }>;
}

export interface BomDocumentChunk<TFields extends BomFields = BomFields> {
  readonly protocolVersion: BomProtocolVersion;
  readonly documentId: BomDocumentId;
  readonly schemaVersion: string;
  readonly positionKeyCodecVersion: string;
  readonly completeness: BomSnapshotCompleteness;
  readonly knownRootCount: number;
  readonly sequence: number;
  readonly sourceRevision: RevisionToken;
  readonly nodes: readonly BomNode<TFields>[];
  readonly roots?: readonly OccurrenceId[];
  readonly nextCursor?: string;
  readonly done: boolean;
}

export interface BomPage<TFields extends BomFields = BomFields> {
  readonly items: readonly BomNode<TFields>[];
  readonly nextCursor?: string;
  readonly sourceRevision: RevisionToken;
  readonly complete: boolean;
}

export type BomQueryExpression =
  | {
      readonly op: 'and' | 'or';
      readonly items: readonly BomQueryExpression[];
    }
  | {
      readonly op: 'not';
      readonly item: BomQueryExpression;
    }
  | {
      readonly op:
        | 'eq'
        | 'contains'
        | 'startsWith'
        | 'gt'
        | 'gte'
        | 'lt'
        | 'lte';
      readonly fieldId: string;
      readonly value: BomValue;
    };

export interface BomQuerySort {
  readonly fieldId: string;
  readonly direction: 'asc' | 'desc';
}

export interface BomQueryRequest {
  readonly expression?: BomQueryExpression;
  readonly sort?: readonly BomQuerySort[];
  readonly cursor?: string;
  readonly limit: number;
  /**
   * Source consistency token captured before the query begins. A result for a
   * different revision cannot be applied to the current editor view.
   */
  readonly expectedSourceRevision?: RevisionToken;
}

export interface BomQueryResult {
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly nextCursor?: string;
  readonly sourceRevision: RevisionToken;
}

export type BomCommitResponse<TFields extends BomFields = BomFields> =
  | {
      readonly status: 'acknowledged';
      readonly sourceRevision: RevisionToken;
    }
  | {
      readonly status: 'rejected';
      readonly error: BomError;
    }
  | {
      readonly status: 'conflicted';
      readonly sourceRevision: RevisionToken;
      readonly remoteOperations?: readonly BomOperation<TFields>[];
    };

export interface BomRemotePatchEnvelope<
  TFields extends BomFields = BomFields,
> {
  readonly protocolVersion: BomProtocolVersion;
  readonly documentId: BomDocumentId;
  readonly sourceTransactionId: BomTransactionId;
  readonly sequence: number;
  readonly previousSourceRevision: RevisionToken;
  readonly sourceRevision: RevisionToken;
  readonly operations: readonly BomOperation<TFields>[];
}

export interface BomDataSourceMessageBase<TType extends string> {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: TType;
}

export interface BomDataSourceRequestBase<TType extends string>
  extends BomDataSourceMessageBase<TType> {
  readonly requestId: BomRequestId;
  readonly documentGeneration: BomDocumentGeneration;
}

export interface BomDataSourceHandshakeRequest
  extends BomDataSourceRequestBase<'handshake'> {
  readonly supportedProtocolVersions: readonly BomProtocolVersion[];
}

export interface BomLoadDocumentRequest
  extends BomDataSourceRequestBase<'loadDocument'> {}

export interface BomStreamDocumentRequest
  extends BomDataSourceRequestBase<'streamDocument'> {}

export interface BomLoadChildrenRequest
  extends BomDataSourceRequestBase<'loadChildren'> {
  readonly documentId: BomDocumentId;
  readonly parentId: OccurrenceId;
  readonly cursor?: string;
  readonly expectedSourceRevision?: RevisionToken;
}

export interface BomRemoteQueryRequest
  extends BomDataSourceRequestBase<'query'> {
  readonly documentId: BomDocumentId;
  readonly query: BomQueryRequest;
  readonly expectedSourceRevision?: RevisionToken;
}

export interface BomDataSourceCommitRequest<
  TFields extends BomFields = BomFields,
> extends BomDataSourceRequestBase<'commit'> {
  readonly documentId: BomDocumentId;
  readonly patch: BomPatch<TFields>;
  readonly expectedSourceRevision?: RevisionToken;
}

export interface BomCancelCommitRequest
  extends BomDataSourceRequestBase<'cancelCommit'> {
  readonly documentId: BomDocumentId;
  readonly transactionId: BomTransactionId;
  readonly idempotencyKey: string;
}

export interface BomSubscribeRemoteRequest
  extends BomDataSourceRequestBase<'subscribeRemote'> {
  readonly documentId: BomDocumentId;
  readonly afterSequence?: number;
  readonly expectedSourceRevision?: RevisionToken;
}

export interface BomUnsubscribeRemoteRequest
  extends BomDataSourceRequestBase<'unsubscribeRemote'> {
  readonly subscriptionId: string;
}

export interface BomCancelDataSourceRequest
  extends BomDataSourceRequestBase<'cancelRequest'> {
  readonly targetRequestId: BomRequestId;
}

export type BomDataSourceRequest<TFields extends BomFields = BomFields> =
  | BomDataSourceHandshakeRequest
  | BomLoadDocumentRequest
  | BomStreamDocumentRequest
  | BomLoadChildrenRequest
  | BomRemoteQueryRequest
  | BomDataSourceCommitRequest<TFields>
  | BomCancelCommitRequest
  | BomSubscribeRemoteRequest
  | BomUnsubscribeRemoteRequest
  | BomCancelDataSourceRequest;

export interface BomDataSourceResponseBase<TType extends string>
  extends BomDataSourceMessageBase<TType> {
  readonly requestId: BomRequestId;
  readonly documentGeneration: BomDocumentGeneration;
}

export interface BomDataSourceHandshakeResponse
  extends BomDataSourceResponseBase<'handshakeResult'> {
  readonly result: BomResult<{
    readonly protocolVersion: BomProtocolVersion;
    readonly capabilities: BomDataSourceCapabilities;
  }>;
}

export interface BomLoadDocumentResponse<TFields extends BomFields = BomFields>
  extends BomDataSourceResponseBase<'loadDocumentResult'> {
  readonly result: BomResult<BomDocumentSnapshot<TFields>>;
}

export interface BomDocumentChunkMessage<TFields extends BomFields = BomFields>
  extends BomDataSourceResponseBase<'documentChunk'> {
  readonly chunk: BomDocumentChunk<TFields>;
}

export interface BomStreamDocumentCompletedMessage
  extends BomDataSourceResponseBase<'streamDocumentCompleted'> {
  readonly result: BomResult<{
    readonly documentId: BomDocumentId;
    readonly sourceRevision: RevisionToken;
    readonly lastSequence: number;
  }>;
}

export interface BomLoadChildrenResponse<TFields extends BomFields = BomFields>
  extends BomDataSourceResponseBase<'loadChildrenResult'> {
  readonly result: BomResult<BomPage<TFields>>;
}

export interface BomRemoteQueryResponse
  extends BomDataSourceResponseBase<'queryResult'> {
  readonly result: BomResult<BomQueryResult>;
}

export interface BomDataSourceCommitResponse<
  TFields extends BomFields = BomFields,
> extends BomDataSourceResponseBase<'commitResult'> {
  readonly result: BomResult<BomCommitResponse<TFields>>;
}

export interface BomCancelCommitResponse
  extends BomDataSourceResponseBase<'cancelCommitResult'> {
  readonly result: BomResult<{
    readonly cancelled: boolean;
    readonly sourceRevision?: RevisionToken;
  }>;
}

export interface BomSubscribeRemoteResponse
  extends BomDataSourceResponseBase<'subscribeRemoteResult'> {
  readonly result: BomResult<{
    readonly subscriptionId: string;
    readonly sourceRevision: RevisionToken;
    readonly lastSequence: number;
  }>;
}

export interface BomUnsubscribeRemoteResponse
  extends BomDataSourceResponseBase<'unsubscribeRemoteResult'> {
  readonly result: BomResult<{
    readonly unsubscribed: boolean;
  }>;
}

export interface BomDataSourceCancellationResponse
  extends BomDataSourceResponseBase<'cancelRequestResult'> {
  readonly targetRequestId: BomRequestId;
  readonly cancelled: boolean;
}

export interface BomRemotePatchMessage<TFields extends BomFields = BomFields>
  extends BomDataSourceMessageBase<'remotePatch'> {
  readonly subscriptionId: string;
  readonly documentGeneration: BomDocumentGeneration;
  readonly envelope: BomRemotePatchEnvelope<TFields>;
}

export type BomResyncReason =
  | 'sequenceGap'
  | 'revisionMismatch'
  | 'protocolMismatch'
  | 'subscriptionLost'
  | 'sourceRequested';

export interface BomResyncRequiredMessage
  extends BomDataSourceMessageBase<'resyncRequired'> {
  readonly subscriptionId: string;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly reason: BomResyncReason;
  readonly actualSourceRevision?: RevisionToken;
}

export interface BomRemoteSubscriptionErrorMessage
  extends BomDataSourceMessageBase<'remoteSubscriptionError'> {
  readonly subscriptionId: string;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly error: BomError;
}

export type BomDataSourceResponse<TFields extends BomFields = BomFields> =
  | BomDataSourceHandshakeResponse
  | BomLoadDocumentResponse<TFields>
  | BomDocumentChunkMessage<TFields>
  | BomStreamDocumentCompletedMessage
  | BomLoadChildrenResponse<TFields>
  | BomRemoteQueryResponse
  | BomDataSourceCommitResponse<TFields>
  | BomCancelCommitResponse
  | BomSubscribeRemoteResponse
  | BomUnsubscribeRemoteResponse
  | BomDataSourceCancellationResponse
  | BomRemotePatchMessage<TFields>
  | BomResyncRequiredMessage
  | BomRemoteSubscriptionErrorMessage;
