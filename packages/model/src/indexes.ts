import type {
  BomDocumentSnapshot,
  BomFields,
  BomNode,
  OccurrenceId,
} from '@bom-editor/contracts';
import {
  BOM_MODEL_ERROR_CODES,
  modelError,
  modelFailure,
  modelSuccess,
  type BomModelResult,
} from './errors.js';
import {
  cacheNormalizedSnapshotIndexes,
  getCachedNormalizedSnapshotIndexes,
} from './normalized-snapshot-cache.js';
import { comparePositionKeys } from './position.js';

export interface BomBaseIndexes<TFields extends BomFields = BomFields> {
  readonly rowById: ReadonlyMap<OccurrenceId, BomNode<TFields>>;
  readonly childrenByParent: ReadonlyMap<OccurrenceId | null, readonly OccurrenceId[]>;
  readonly rowsByMaterialCode: ReadonlyMap<string, readonly OccurrenceId[]>;
}

export function buildBomIndexes<TFields extends BomFields = BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
): BomModelResult<BomBaseIndexes<TFields>> {
  const cached = getCachedNormalizedSnapshotIndexes(snapshot);
  if (cached !== undefined) {
    return modelSuccess(cached);
  }
  const rowById = new Map<OccurrenceId, BomNode<TFields>>();
  const mutableChildren = new Map<OccurrenceId | null, BomNode<TFields>[]>();
  const mutableMaterials = new Map<string, OccurrenceId[]>();
  mutableChildren.set(null, []);

  for (const node of snapshot.nodes) {
    if (rowById.has(node.occurrenceId)) {
      return modelFailure(
        modelError(
          BOM_MODEL_ERROR_CODES.snapshotDuplicateId,
          'DATA',
          ['snapshot', 'nodes'],
          { occurrenceId: node.occurrenceId },
        ),
      );
    }
    rowById.set(node.occurrenceId, node);
    const siblings = mutableChildren.get(node.parentId) ?? [];
    siblings.push(node);
    mutableChildren.set(node.parentId, siblings);

    if (node.kind === 'material' && node.materialCode !== undefined) {
      const occurrences = mutableMaterials.get(node.materialCode) ?? [];
      occurrences.push(node.occurrenceId);
      mutableMaterials.set(node.materialCode, occurrences);
    }
  }

  for (const node of snapshot.nodes) {
    if (node.parentId !== null && !rowById.has(node.parentId)) {
      return modelFailure(
        modelError(
          BOM_MODEL_ERROR_CODES.snapshotParentNotFound,
          'DATA',
          ['snapshot', 'nodes'],
          { occurrenceId: node.occurrenceId, parentId: node.parentId },
        ),
      );
    }
  }

  const childrenByParent = new Map<OccurrenceId | null, readonly OccurrenceId[]>();
  for (const [parentId, children] of mutableChildren) {
    children.sort((left, right) => comparePositionKeys(left.positionKey, right.positionKey));
    childrenByParent.set(
      parentId,
      Object.freeze(children.map((node) => node.occurrenceId)),
    );
  }
  const rowsByMaterialCode = new Map<string, readonly OccurrenceId[]>();
  for (const [materialCode, occurrences] of mutableMaterials) {
    rowsByMaterialCode.set(materialCode, Object.freeze([...occurrences]));
  }

  const indexes = Object.freeze({
    rowById: new ImmutableReadonlyMap(rowById),
    childrenByParent: new ImmutableReadonlyMap(childrenByParent),
    rowsByMaterialCode: new ImmutableReadonlyMap(rowsByMaterialCode),
  });
  cacheNormalizedSnapshotIndexes(snapshot, indexes);
  return modelSuccess(indexes);
}

class ImmutableReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  readonly #map: ReadonlyMap<K, V>;

  constructor(source: ReadonlyMap<K, V>) {
    this.#map = new Map(source);
    Object.freeze(this);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    return this.#map.get(key);
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }

  keys(): MapIterator<K> {
    return this.#map.keys();
  }

  values(): MapIterator<V> {
    return this.#map.values();
  }

  forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.#map) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }

  get [Symbol.toStringTag](): string {
    return 'ImmutableReadonlyMap';
  }
}
