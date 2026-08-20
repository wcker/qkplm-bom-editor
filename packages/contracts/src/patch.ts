import type {
  BomDocumentId,
  BomProtocolVersion,
  BomTransactionId,
  OccurrenceId,
  RevisionToken,
} from './identifiers.js';
import type { BomNode } from './snapshot.js';
import type { BomFields, BomValue } from './value.js';

export type BomOperation<TFields extends BomFields = BomFields> =
  | {
      readonly op: 'insertNode';
      readonly node: BomNode<TFields>;
    }
  | {
      readonly op: 'deleteSubtree';
      readonly occurrenceId: OccurrenceId;
    }
  | {
      readonly op: 'moveSubtree';
      readonly occurrenceId: OccurrenceId;
      readonly newParentId: OccurrenceId | null;
      readonly positionKey: string;
    }
  | {
      readonly op: 'updateField';
      readonly occurrenceId: OccurrenceId;
      readonly fieldPath: readonly string[];
      readonly value: BomValue;
      readonly expectedValueHash?: string;
    }
  | {
      readonly op: 'unsetField';
      readonly occurrenceId: OccurrenceId;
      readonly fieldPath: readonly string[];
      readonly expectedValueHash?: string;
    }
  | {
      readonly op: 'setMaterialRef';
      readonly occurrenceId: OccurrenceId;
      readonly materialId?: string;
      readonly materialRevision?: string;
      readonly materialCode?: string;
    }
  | {
      readonly op: 'reorder';
      readonly occurrenceId: OccurrenceId;
      readonly positionKey: string;
    }
  | {
      readonly op: 'rebalancePositions';
      readonly parentId: OccurrenceId | null;
      readonly positions: readonly {
        readonly occurrenceId: OccurrenceId;
        readonly positionKey: string;
      }[];
    };

export interface BomPatch<TFields extends BomFields = BomFields> {
  readonly protocolVersion: BomProtocolVersion;
  readonly documentId: BomDocumentId;
  readonly baseRevision: RevisionToken;
  readonly transactionId: BomTransactionId;
  readonly dependsOnTransactionId?: BomTransactionId;
  readonly origin: string;
  readonly timestamp: string;
  readonly idempotencyKey?: string;
  readonly operations: readonly BomOperation<TFields>[];
}
