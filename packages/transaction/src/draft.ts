import type {
  BomDocumentSnapshot,
  BomFields,
  BomNode,
  OccurrenceId,
  RevisionToken,
} from '@bom-editor/contracts';
import {
  comparePositionKeys,
  type BomBaseIndexes,
} from '@bom-editor/model';

export class BomTransactionDraft<TFields extends BomFields> {
  readonly #source: BomDocumentSnapshot<TFields>;
  readonly #sourceIndexes: BomBaseIndexes<TFields>;
  readonly #changedNodes = new Map<OccurrenceId, BomNode<TFields>>();
  #nodes: Map<OccurrenceId, BomNode<TFields>> | undefined;
  #children: Map<OccurrenceId | null, OccurrenceId[]> | undefined;

  constructor(
    snapshot: BomDocumentSnapshot<TFields>,
    indexes: BomBaseIndexes<TFields>,
  ) {
    this.#source = snapshot;
    this.#sourceIndexes = indexes;
  }

  get completeness(): BomDocumentSnapshot<TFields>['completeness'] {
    return this.#source.completeness;
  }

  getNode(occurrenceId: OccurrenceId): BomNode<TFields> | undefined {
    if (this.#nodes !== undefined) {
      return this.#nodes.get(occurrenceId);
    }
    return (
      this.#changedNodes.get(occurrenceId) ??
      this.#sourceIndexes.rowById.get(occurrenceId)
    );
  }

  hasNode(occurrenceId: OccurrenceId): boolean {
    return this.#nodes?.has(occurrenceId) ??
      this.#sourceIndexes.rowById.has(occurrenceId);
  }

  getChildren(parentId: OccurrenceId | null): readonly OccurrenceId[] {
    if (this.#children !== undefined) {
      return this.#children.get(parentId) ?? [];
    }
    return this.#sourceIndexes.childrenByParent.get(parentId) ?? [];
  }

  insertNode(node: BomNode<TFields>): void {
    this.#materializeStructure();
    const nodes = this.#nodes!;
    const children = this.#children!;
    nodes.set(node.occurrenceId, node);
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node.occurrenceId);
    children.set(node.parentId, siblings);
    if (!children.has(node.occurrenceId)) {
      children.set(node.occurrenceId, []);
    }
    this.#sortChildren(node.parentId);
  }

  deleteSubtree(occurrenceId: OccurrenceId): readonly BomNode<TFields>[] {
    this.#materializeStructure();
    const nodes = this.#nodes!;
    const childrenByParent = this.#children!;
    const root = nodes.get(occurrenceId);
    if (root === undefined) {
      return [];
    }

    const removed: BomNode<TFields>[] = [];
    const visited = new Set<OccurrenceId>();
    const stack: OccurrenceId[] = [occurrenceId];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      const current = nodes.get(currentId);
      if (current === undefined) {
        continue;
      }
      removed.push(current);
      const children = childrenByParent.get(currentId) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]!);
      }
    }

    this.#removeChild(root.parentId, occurrenceId);
    for (const node of removed) {
      nodes.delete(node.occurrenceId);
      childrenByParent.delete(node.occurrenceId);
      this.#changedNodes.delete(node.occurrenceId);
    }
    return Object.freeze(removed);
  }

  moveNode(
    occurrenceId: OccurrenceId,
    newParentId: OccurrenceId | null,
    positionKey: string,
  ): void {
    this.#materializeStructure();
    const nodes = this.#nodes!;
    const children = this.#children!;
    const current = nodes.get(occurrenceId);
    if (current === undefined) {
      return;
    }
    this.#removeChild(current.parentId, occurrenceId);
    const updated = Object.freeze({
      ...current,
      parentId: newParentId,
      positionKey,
    });
    nodes.set(occurrenceId, updated);
    const siblings = children.get(newParentId) ?? [];
    siblings.push(occurrenceId);
    children.set(newParentId, siblings);
    this.#sortChildren(newParentId);
  }

  replaceNode(node: BomNode<TFields>): void {
    this.#changedNodes.set(node.occurrenceId, node);
    this.#nodes?.set(node.occurrenceId, node);
  }

  setPosition(occurrenceId: OccurrenceId, positionKey: string): void {
    this.#materializeStructure();
    const current = this.#nodes!.get(occurrenceId);
    if (current === undefined) {
      return;
    }
    this.#nodes!.set(
      occurrenceId,
      Object.freeze({ ...current, positionKey }),
    );
    this.#sortChildren(current.parentId);
  }

  setPositions(
    parentId: OccurrenceId | null,
    positions: readonly {
      readonly occurrenceId: OccurrenceId;
      readonly positionKey: string;
    }[],
  ): void {
    this.#materializeStructure();
    for (const position of positions) {
      const current = this.#nodes!.get(position.occurrenceId);
      if (current !== undefined) {
        this.#nodes!.set(
          position.occurrenceId,
          Object.freeze({ ...current, positionKey: position.positionKey }),
        );
      }
    }
    this.#sortChildren(parentId);
  }

  toSnapshot(revision: RevisionToken): BomDocumentSnapshot<TFields> {
    const roots = Object.freeze([...this.getChildren(null)]);
    const draftNodes = this.#nodes === undefined
      ? this.#source.nodes.map(
          (node) => this.#changedNodes.get(node.occurrenceId) ?? node,
        )
      : [...this.#nodes.values()];
    const nodes = draftNodes.map((node) =>
      this.#source.completeness === 'complete'
        ? this.#completeNode(node)
        : node,
    );

    return {
      schemaVersion: this.#source.schemaVersion,
      documentId: this.#source.documentId,
      revision,
      ...(this.#source.sourceRevision === undefined
        ? {}
        : { sourceRevision: this.#source.sourceRevision }),
      positionKeyCodecVersion: this.#source.positionKeyCodecVersion,
      completeness: this.#source.completeness,
      ...(this.#source.completeness === 'complete'
        ? { knownRootCount: roots.length }
        : this.#source.knownRootCount === undefined
          ? {}
          : { knownRootCount: this.#source.knownRootCount }),
      roots,
      nodes,
    };
  }

  changedOccurrenceIds(): readonly OccurrenceId[] {
    return Object.freeze([...this.#changedNodes.keys()]);
  }

  toFieldSnapshot(revision: RevisionToken): BomDocumentSnapshot<TFields> {
    const nodes = Object.freeze(
      this.#source.nodes.map(
        (node) => this.getNode(node.occurrenceId) ?? node,
      ),
    );
    return Object.freeze({
      ...this.#source,
      revision,
      nodes,
    });
  }

  toFieldIndexes(): BomBaseIndexes<TFields> {
    return Object.freeze({
      rowById: overlayReadonlyMap(
        this.#sourceIndexes.rowById,
        this.#changedNodes,
      ),
      childrenByParent: this.#sourceIndexes.childrenByParent,
      rowsByMaterialCode: this.#sourceIndexes.rowsByMaterialCode,
    });
  }

  #completeNode(node: BomNode<TFields>): BomNode<TFields> {
    return {
      occurrenceId: node.occurrenceId,
      kind: node.kind,
      ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
      ...(node.materialRevision === undefined
        ? {}
        : { materialRevision: node.materialRevision }),
      ...(node.materialCode === undefined ? {} : { materialCode: node.materialCode }),
      parentId: node.parentId,
      positionKey: node.positionKey,
      childrenState: 'complete',
      knownChildCount: this.getChildren(node.occurrenceId).length,
      fields: node.fields,
    };
  }

  #removeChild(parentId: OccurrenceId | null, occurrenceId: OccurrenceId): void {
    const siblings = this.#children?.get(parentId);
    if (siblings === undefined) {
      return;
    }
    const index = siblings.indexOf(occurrenceId);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
  }

  #sortChildren(parentId: OccurrenceId | null): void {
    const siblings = this.#children?.get(parentId);
    if (siblings === undefined) {
      return;
    }
    siblings.sort((leftId, rightId) => {
      const left = this.#nodes!.get(leftId);
      const right = this.#nodes!.get(rightId);
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      return comparePositionKeys(left.positionKey, right.positionKey);
    });
  }

  #materializeStructure(): void {
    if (this.#nodes !== undefined) {
      return;
    }
    this.#nodes = new Map(this.#sourceIndexes.rowById);
    for (const [occurrenceId, node] of this.#changedNodes) {
      this.#nodes.set(occurrenceId, node);
    }
    this.#children = new Map();
    for (const [parentId, children] of this.#sourceIndexes.childrenByParent) {
      this.#children.set(parentId, [...children]);
    }
    if (!this.#children.has(null)) {
      this.#children.set(null, []);
    }
  }
}

class ImmutableOverlayReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  readonly #base: ReadonlyMap<K, V>;
  readonly #overrides: ReadonlyMap<K, V>;

  constructor(base: ReadonlyMap<K, V>, overrides: ReadonlyMap<K, V>) {
    this.#base = base;
    this.#overrides = new Map(overrides);
    Object.freeze(this);
  }

  withOverrides(overrides: ReadonlyMap<K, V>): ImmutableOverlayReadonlyMap<K, V> {
    const merged = new Map(this.#overrides);
    for (const [key, value] of overrides) {
      merged.set(key, value);
    }
    return new ImmutableOverlayReadonlyMap(this.#base, merged);
  }

  get size(): number {
    return this.#base.size;
  }

  get(key: K): V | undefined {
    return this.#overrides.has(key)
      ? this.#overrides.get(key)
      : this.#base.get(key);
  }

  has(key: K): boolean {
    return this.#base.has(key);
  }

  *entries(): MapIterator<[K, V]> {
    for (const [key, value] of this.#base) {
      yield [key, this.#overrides.has(key) ? this.#overrides.get(key)! : value];
    }
  }

  keys(): MapIterator<K> {
    return this.#base.keys();
  }

  *values(): MapIterator<V> {
    for (const [, value] of this.entries()) {
      yield value;
    }
  }

  forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.entries()) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }

  get [Symbol.toStringTag](): string {
    return 'ImmutableOverlayReadonlyMap';
  }
}

function overlayReadonlyMap<K, V>(
  base: ReadonlyMap<K, V>,
  overrides: ReadonlyMap<K, V>,
): ImmutableOverlayReadonlyMap<K, V> {
  return base instanceof ImmutableOverlayReadonlyMap
    ? base.withOverrides(overrides)
    : new ImmutableOverlayReadonlyMap(base, overrides);
}

