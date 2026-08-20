import type { BomCommand } from './command.js';
import type { BomError } from './error.js';
import type {
  BomDocumentId,
  BomProtocolVersion,
  BomTransactionId,
  RevisionToken,
} from './identifiers.js';
import type { BomPatch } from './patch.js';
import type { BomFields } from './value.js';

export interface BomCommit<TFields extends BomFields = BomFields> {
  readonly transactionId: BomTransactionId;
  readonly previousRevision: RevisionToken;
  readonly revision: RevisionToken;
  readonly patch: BomPatch<TFields>;
  readonly inversePatch?: BomPatch<TFields>;
  readonly warnings: readonly BomError[];
}

export type BomTransactionPersistenceState =
  | 'localApplied'
  | 'pending'
  | 'acknowledged'
  | 'rejected'
  | 'rolledBack'
  | 'conflicted'
  | 'rebased'
  | 'reloadRequired';

export interface BomPartialOperationStatus {
  readonly operationIndex: number;
  readonly status: 'applied' | 'rejected';
  readonly error?: BomError;
}

export interface BomRecoveryTransaction<TFields extends BomFields = BomFields> {
  readonly transactionId: BomTransactionId;
  readonly dependsOnTransactionId?: BomTransactionId;
  readonly commands: readonly BomCommand<TFields>[];
  readonly patch: BomPatch<TFields>;
  readonly inversePatch?: BomPatch<TFields>;
}

export interface BomRecoveryBundle<TFields extends BomFields = BomFields> {
  readonly protocolVersion: BomProtocolVersion;
  readonly documentId: BomDocumentId;
  readonly schemaVersion: string;
  readonly positionKeyCodecVersion: string;
  readonly baseRevision: RevisionToken;
  readonly sourceRevision?: RevisionToken;
  readonly reportedSourceRevision?: RevisionToken;
  readonly failedTransactionId: BomTransactionId;
  readonly createdAt: string;
  readonly transactions: readonly BomRecoveryTransaction<TFields>[];
  readonly reason: BomError;
}
