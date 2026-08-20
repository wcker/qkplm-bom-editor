import type { BomDocumentSnapshot, BomFields } from '@bom-editor/contracts';
import type { BomBaseIndexes } from './indexes.js';

const NORMALIZED_SNAPSHOTS = new WeakSet<object>();
const INDEXES_BY_NORMALIZED_SNAPSHOT = new WeakMap<object, BomBaseIndexes>();

export function markNormalizedSnapshot(snapshot: object): void {
  NORMALIZED_SNAPSHOTS.add(snapshot);
}

export function getCachedNormalizedSnapshotIndexes<TFields extends BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
): BomBaseIndexes<TFields> | undefined {
  if (!NORMALIZED_SNAPSHOTS.has(snapshot)) {
    return undefined;
  }
  return INDEXES_BY_NORMALIZED_SNAPSHOT.get(snapshot) as
    | BomBaseIndexes<TFields>
    | undefined;
}

export function cacheNormalizedSnapshotIndexes<TFields extends BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
  indexes: BomBaseIndexes<TFields>,
): void {
  if (NORMALIZED_SNAPSHOTS.has(snapshot)) {
    INDEXES_BY_NORMALIZED_SNAPSHOT.set(snapshot, indexes);
  }
}
