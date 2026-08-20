import type {
  BomDocumentGeneration,
  BomDocumentId,
  BomProtocolVersion,
  BomTransactionId,
  OccurrenceId,
  RevisionToken,
} from './identifiers.js';
import type { BomNode } from './snapshot.js';
import type { BomFields, BomValue } from './value.js';

export type BomPlacement =
  | { readonly at: 'first' | 'last' }
  | { readonly beforeOccurrenceId: OccurrenceId }
  | { readonly afterOccurrenceId: OccurrenceId };

export type BomCommand<TFields extends BomFields = BomFields> =
  | {
      readonly type: 'insertNode';
      readonly parentId: OccurrenceId | null;
      readonly placement: BomPlacement;
      readonly node: Omit<BomNode<TFields>, 'parentId' | 'positionKey'>;
    }
  | {
      readonly type: 'deleteSubtree';
      readonly occurrenceId: OccurrenceId;
    }
  | {
      readonly type: 'moveSubtree';
      readonly occurrenceId: OccurrenceId;
      readonly newParentId: OccurrenceId | null;
      readonly placement: BomPlacement;
    }
  | {
      readonly type: 'setField';
      readonly occurrenceId: OccurrenceId;
      readonly fieldPath: readonly string[];
      readonly value: BomValue;
      readonly expectedValueHash?: string;
    }
  | {
      readonly type: 'unsetField';
      readonly occurrenceId: OccurrenceId;
      readonly fieldPath: readonly string[];
      readonly expectedPresent?: boolean;
      readonly expectedValueHash?: string;
    }
  | {
      readonly type: 'setMaterialRef';
      readonly occurrenceId: OccurrenceId;
      readonly materialId?: string;
      readonly materialRevision?: string;
      readonly materialCode?: string;
    }
  | {
      readonly type: `plugin:${string}`;
      readonly payload: BomValue;
    };

export interface BomCommandBatch<TFields extends BomFields = BomFields> {
  readonly protocolVersion: BomProtocolVersion;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly baseRevision: RevisionToken;
  readonly transactionId: BomTransactionId;
  readonly dependsOnTransactionId?: BomTransactionId;
  readonly origin: string;
  readonly timestamp: string;
  readonly idempotencyKey?: string;
  readonly label?: string;
  readonly commands: readonly BomCommand<TFields>[];
}
