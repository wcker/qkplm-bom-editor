import type {
  BomDocumentId,
  OccurrenceId,
  RevisionToken,
} from './identifiers.js';
import type { BomNode } from './snapshot.js';
import type { BomFields, BomValue } from './value.js';

export type BomDiffValueState =
  | { readonly present: false }
  | { readonly present: true; readonly value: BomValue };

export interface BomMaterialReference {
  readonly materialId?: string;
  readonly materialRevision?: string;
  readonly materialCode?: string;
}

export interface BomSnapshotInsertChange<
  TFields extends BomFields = BomFields,
> {
  readonly type: 'insert';
  readonly node: BomNode<TFields>;
}

export interface BomSnapshotDeleteChange<
  TFields extends BomFields = BomFields,
> {
  readonly type: 'delete';
  readonly node: BomNode<TFields>;
}

export interface BomSnapshotMoveChange {
  readonly type: 'move';
  readonly occurrenceId: OccurrenceId;
  readonly beforeParentId: OccurrenceId | null;
  readonly afterParentId: OccurrenceId | null;
  readonly beforePositionKey: string;
  readonly afterPositionKey: string;
}

export interface BomSnapshotReorderChange {
  readonly type: 'reorder';
  readonly occurrenceId: OccurrenceId;
  readonly parentId: OccurrenceId | null;
  readonly beforePositionKey: string;
  readonly afterPositionKey: string;
}

export interface BomSnapshotMaterialChange {
  readonly type: 'material';
  readonly occurrenceId: OccurrenceId;
  readonly before: BomMaterialReference;
  readonly after: BomMaterialReference;
}

export interface BomSnapshotFieldChange {
  readonly type: 'field';
  readonly occurrenceId: OccurrenceId;
  readonly fieldId?: string;
  readonly fieldPath: readonly string[];
  readonly before: BomDiffValueState;
  readonly after: BomDiffValueState;
}

export type BomSnapshotDiffChange<TFields extends BomFields = BomFields> =
  | BomSnapshotInsertChange<TFields>
  | BomSnapshotDeleteChange<TFields>
  | BomSnapshotMoveChange
  | BomSnapshotReorderChange
  | BomSnapshotMaterialChange
  | BomSnapshotFieldChange;

export interface BomSnapshotDiff<TFields extends BomFields = BomFields> {
  readonly schemaVersion: string;
  readonly documentId: BomDocumentId;
  readonly sourceRevision: RevisionToken;
  readonly targetRevision: RevisionToken;
  readonly positionKeyCodecVersion: string;
  readonly changes: readonly BomSnapshotDiffChange<TFields>[];
}
