import type { BomError, BomResult } from './error.js';
import type { BomSnapshotDiff } from './diff.js';
import type {
  BomDocumentGeneration,
  BomDocumentId,
  BomInstanceId,
  BomProtocolVersion,
  BomRequestId,
  BomWorkerTaskId,
  OccurrenceId,
  RevisionToken,
} from './identifiers.js';
import type { BomDocumentSnapshot } from './snapshot.js';
import type { BomSchema } from './schema.js';
import type { BomFields, BomValue } from './value.js';

export type BomWorkerPriority = 'high' | 'normal' | 'low';

export type BomWorkerTaskType =
  | 'buildSearchIndex'
  | 'search'
  | 'validate'
  | 'diff'
  | 'calculate'
  | 'parseImport'
  | `plugin:${string}`;

export interface BomWorkerSearchIndexPayload<
  TFields extends BomFields = BomFields,
> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly fieldIds: readonly string[];
  readonly normalizationVersion: string;
}

export interface BomWorkerSearchPayload {
  readonly query: string;
  readonly mode: 'exact' | 'prefix' | 'fuzzy';
  readonly limit: number;
  readonly indexRevision: RevisionToken;
}

export interface BomWorkerValidationPayload<
  TFields extends BomFields = BomFields,
> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly scope: 'document' | 'loaded';
  readonly ruleIds?: readonly string[];
}

export interface BomWorkerDiffPayload<TFields extends BomFields = BomFields> {
  readonly schema: BomSchema;
  readonly source: BomDocumentSnapshot<TFields>;
  readonly target: BomDocumentSnapshot<TFields>;
}

export interface BomWorkerCalculationPayload<
  TFields extends BomFields = BomFields,
> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly calculationIds: readonly string[];
  readonly affectedOccurrenceIds?: readonly OccurrenceId[];
}

export interface BomWorkerImportPayload {
  readonly format: 'csv' | 'xlsx' | 'json';
  readonly content: Uint8Array;
  readonly options: Readonly<Record<string, BomValue>>;
}

export type BomWorkerTaskDescriptor<TFields extends BomFields = BomFields> =
  | {
      readonly taskType: 'buildSearchIndex';
      readonly payload: BomWorkerSearchIndexPayload<TFields>;
    }
  | {
      readonly taskType: 'search';
      readonly payload: BomWorkerSearchPayload;
    }
  | {
      readonly taskType: 'validate';
      readonly payload: BomWorkerValidationPayload<TFields>;
    }
  | {
      readonly taskType: 'diff';
      readonly payload: BomWorkerDiffPayload<TFields>;
    }
  | {
      readonly taskType: 'calculate';
      readonly payload: BomWorkerCalculationPayload<TFields>;
    }
  | {
      readonly taskType: 'parseImport';
      readonly payload: BomWorkerImportPayload;
    }
  | {
      readonly taskType: `plugin:${string}`;
      readonly payload: BomValue;
    };

export interface BomWorkerTaskContext {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'task';
  readonly instanceId: BomInstanceId;
  readonly taskId: BomWorkerTaskId;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly documentRevision: RevisionToken;
  readonly priority: BomWorkerPriority;
  readonly cancellationKey: string;
  readonly cancellable: boolean;
  readonly replayable: boolean;
  readonly timeoutMs?: number;
}

export type BomWorkerTaskMessage<TFields extends BomFields = BomFields> =
  BomWorkerTaskContext & BomWorkerTaskDescriptor<TFields>;

export interface BomWorkerHandshakeRequest {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'handshake';
  readonly requestId: BomRequestId;
  readonly engineVersion: string;
  readonly supportedProtocolVersions: readonly BomProtocolVersion[];
  readonly requiredTaskTypes: readonly BomWorkerTaskType[];
}

export interface BomWorkerCancelTaskMessage {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'cancelTask';
  readonly instanceId: BomInstanceId;
  readonly taskId: BomWorkerTaskId;
  readonly cancellationKey: string;
  readonly reason: 'caller' | 'timeout' | 'superseded' | 'instanceDestroyed';
}

export interface BomWorkerDisposeInstanceMessage {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'disposeInstance';
  readonly instanceId: BomInstanceId;
}

export type BomWorkerHostMessage<TFields extends BomFields = BomFields> =
  | BomWorkerHandshakeRequest
  | BomWorkerTaskMessage<TFields>
  | BomWorkerCancelTaskMessage
  | BomWorkerDisposeInstanceMessage;

export interface BomWorkerCapabilities {
  readonly protocolVersion: BomProtocolVersion;
  readonly taskTypes: readonly BomWorkerTaskType[];
  readonly maxMessageBytes: number;
  readonly supportsBinaryTransfer: boolean;
}

export interface BomWorkerHandshakeResponse {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'handshakeResult';
  readonly requestId: BomRequestId;
  readonly result: BomResult<BomWorkerCapabilities>;
}

export interface BomWorkerTaskAcceptedMessage {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'taskAccepted';
  readonly instanceId: BomInstanceId;
  readonly taskId: BomWorkerTaskId;
  readonly queuePosition?: number;
}

export interface BomWorkerTaskProgressMessage {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'taskProgress';
  readonly instanceId: BomInstanceId;
  readonly taskId: BomWorkerTaskId;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly documentRevision: RevisionToken;
  readonly completed: number;
  readonly total?: number;
  readonly stage: string;
}

export interface BomWorkerSearchIndexResult {
  readonly taskType: 'buildSearchIndex';
  readonly indexRevision: RevisionToken;
  readonly indexedNodeCount: number;
}

export interface BomWorkerSearchResult {
  readonly taskType: 'search';
  readonly indexRevision: RevisionToken;
  readonly matches: readonly {
    readonly occurrenceId: OccurrenceId;
    readonly score: number;
    readonly reasons: readonly string[];
  }[];
}

export interface BomValidationIssue {
  readonly issueId: string;
  readonly ruleId: string;
  /** Host-stamped version for plugin business rules. */
  readonly ruleVersion?: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly occurrenceId?: OccurrenceId;
  readonly fieldPath?: readonly string[];
  readonly messageKey: string;
  readonly messageParams?: Readonly<Record<string, string | number>>;
  readonly valueDigest?: string;
}

export interface BomWorkerValidationResult {
  readonly taskType: 'validate';
  readonly documentRevision: RevisionToken;
  readonly issues: readonly BomValidationIssue[];
}

export interface BomWorkerDiffResult<TFields extends BomFields = BomFields> {
  readonly taskType: 'diff';
  readonly diff: BomSnapshotDiff<TFields>;
}

export interface BomWorkerCalculationResult {
  readonly taskType: 'calculate';
  readonly documentRevision: RevisionToken;
  readonly values: readonly {
    readonly calculationId: string;
    readonly occurrenceId: OccurrenceId;
    readonly value: BomValue;
  }[];
}

export interface BomWorkerImportResult<TFields extends BomFields = BomFields> {
  readonly taskType: 'parseImport';
  readonly snapshot?: BomDocumentSnapshot<TFields>;
  readonly issues: readonly BomValidationIssue[];
}

export interface BomWorkerPluginResult {
  readonly taskType: `plugin:${string}`;
  readonly value: BomValue;
}

export type BomWorkerTaskResult<TFields extends BomFields = BomFields> =
  | BomWorkerSearchIndexResult
  | BomWorkerSearchResult
  | BomWorkerValidationResult
  | BomWorkerDiffResult<TFields>
  | BomWorkerCalculationResult
  | BomWorkerImportResult<TFields>
  | BomWorkerPluginResult;

export interface BomWorkerTaskSucceededMessage<
  TFields extends BomFields = BomFields,
> {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'taskSucceeded';
  readonly instanceId: BomInstanceId;
  readonly taskId: BomWorkerTaskId;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly documentRevision: RevisionToken;
  readonly result: BomWorkerTaskResult<TFields>;
}

export interface BomWorkerTaskFailedMessage {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'taskFailed';
  readonly instanceId: BomInstanceId;
  readonly taskId: BomWorkerTaskId;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly documentRevision: RevisionToken;
  readonly error: BomError;
  readonly retryable: boolean;
}

export interface BomWorkerTaskCancelledMessage {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'taskCancelled';
  readonly instanceId: BomInstanceId;
  readonly taskId: BomWorkerTaskId;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly documentRevision: RevisionToken;
  readonly reason: 'caller' | 'timeout' | 'superseded' | 'instanceDestroyed';
}

export interface BomWorkerDiagnosticMessage {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'workerDiagnostic';
  readonly level: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly instanceId?: BomInstanceId;
  readonly taskId?: BomWorkerTaskId;
  readonly error?: BomError;
}

export type BomWorkerRuntimeMessage<TFields extends BomFields = BomFields> =
  | BomWorkerHandshakeResponse
  | BomWorkerTaskAcceptedMessage
  | BomWorkerTaskProgressMessage
  | BomWorkerTaskSucceededMessage<TFields>
  | BomWorkerTaskFailedMessage
  | BomWorkerTaskCancelledMessage
  | BomWorkerDiagnosticMessage;
