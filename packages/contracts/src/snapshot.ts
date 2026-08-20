import type {
  BomDocumentId,
  OccurrenceId,
  RevisionToken,
} from './identifiers.js';
import type { BomFields } from './value.js';

export type BomNodeKind = 'material' | 'group';
export type BomChildrenState = 'complete' | 'partial' | 'unloaded';
export type BomSnapshotCompleteness = 'complete' | 'partial';

export interface BomNode<TFields extends BomFields = BomFields> {
  readonly occurrenceId: OccurrenceId;
  readonly kind: BomNodeKind;
  readonly materialId?: string;
  readonly materialRevision?: string;
  readonly materialCode?: string;
  readonly parentId: OccurrenceId | null;
  readonly positionKey: string;
  readonly childrenState?: BomChildrenState;
  readonly knownChildCount?: number;
  readonly fields: TFields;
}

export interface BomDocumentSnapshot<TFields extends BomFields = BomFields> {
  readonly schemaVersion: string;
  readonly documentId: BomDocumentId;
  readonly revision: RevisionToken;
  readonly sourceRevision?: RevisionToken;
  readonly positionKeyCodecVersion: string;
  readonly completeness: BomSnapshotCompleteness;
  readonly knownRootCount?: number;
  readonly roots: readonly OccurrenceId[];
  readonly nodes: readonly BomNode<TFields>[];
}
