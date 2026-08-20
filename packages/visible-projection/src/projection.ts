import type {
  BomDocumentSnapshot,
  BomFields,
  BomNode,
  OccurrenceId,
} from '@bom-editor/contracts';
import {
  buildBomIndexes,
  comparePositionKeys,
  type BomBaseIndexes,
} from '@bom-editor/model';
import {
  projectionFailure,
  projectionSuccess,
  VISIBLE_PROJECTION_ERROR_CODES,
  type VisibleProjectionResult,
} from './errors.js';
import { ImplicitAvlRope, type RopeEntry, type RopeNode } from './rope.js';
import {
  DEFAULT_ROW_HEIGHT_PX,
  MAX_ROW_HEIGHT_PX,
  type ExpansionChange,
  type RowHeightChange,
  type RowHeightOverride,
  type VisibleProjection,
  type VisibleProjectionOptions,
  type VisibleWindow,
} from './types.js';

export function createVisibleProjection<
  TFields extends BomFields = BomFields,
>(
  snapshot: BomDocumentSnapshot<TFields>,
  options: VisibleProjectionOptions<TFields> = {},
): VisibleProjectionResult<VisibleProjection<TFields>> {
  try {
    return createVisibleProjectionInternal(snapshot, options);
  } catch {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
      ['snapshotOrOptions'],
      { reason: 'ACCESSOR_OR_MAP_FAILURE' },
    );
  }
}

function createVisibleProjectionInternal<
  TFields extends BomFields = BomFields,
>(
  snapshot: BomDocumentSnapshot<TFields>,
  options: VisibleProjectionOptions<TFields> = {},
): VisibleProjectionResult<VisibleProjection<TFields>> {
  if (!isRecord(options)) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
      ['options'],
    );
  }
  const resolvedOptions = options as VisibleProjectionOptions<TFields>;
  if (!hasSnapshotShape(snapshot)) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidSnapshot,
      ['snapshot'],
    );
  }
  const rowHeight = resolvedOptions.rowHeight ?? DEFAULT_ROW_HEIGHT_PX;
  if (!isValidRowHeight(rowHeight)) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
      ['options', 'rowHeight'],
      { maximum: MAX_ROW_HEIGHT_PX },
    );
  }
  if (
    resolvedOptions.expandAll !== undefined &&
    typeof resolvedOptions.expandAll !== 'boolean'
  ) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
      ['options', 'expandAll'],
    );
  }
  if (
    resolvedOptions.expandedIds !== undefined &&
    !Array.isArray(resolvedOptions.expandedIds)
  ) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
      ['options', 'expandedIds'],
    );
  }
  const rowHeightOverrides = new Map<OccurrenceId, number>();
  if (resolvedOptions.rowHeightOverrides !== undefined) {
    if (!isReadonlyMapLike(resolvedOptions.rowHeightOverrides)) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
        ['options', 'rowHeightOverrides'],
      );
    }
    try {
      for (const [occurrenceId, override] of resolvedOptions.rowHeightOverrides) {
        if (
          typeof occurrenceId !== 'string' ||
          occurrenceId.length === 0 ||
          !isValidRowHeight(override)
        ) {
          return projectionFailure(
            VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
            ['options', 'rowHeightOverrides'],
          );
        }
        rowHeightOverrides.set(occurrenceId, override);
      }
    } catch {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
        ['options', 'rowHeightOverrides'],
      );
    }
  }
  if (
    resolvedOptions.expandAll === true &&
    resolvedOptions.expandedIds !== undefined &&
    resolvedOptions.expandedIds.length > 0
  ) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
      ['options'],
      { reason: 'EXPANSION_OPTIONS_CONFLICT' },
    );
  }

  let indexes: BomBaseIndexes<TFields>;
  if (resolvedOptions.indexes === undefined) {
    const indexResult = buildBomIndexes(snapshot);
    if (!indexResult.ok) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.indexBuildFailed,
        ['snapshot'],
        { modelErrorCode: indexResult.errors[0]?.code ?? 'UNKNOWN' },
      );
    }
    indexes = indexResult.value;
  } else {
    indexes = resolvedOptions.indexes;
  }
  const indexesResult = validateIndexes(snapshot, indexes);
  if (!indexesResult.ok) {
    return indexesResult;
  }
  for (const occurrenceId of rowHeightOverrides.keys()) {
    if (!indexes.rowById.has(occurrenceId)) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.unknownOccurrence,
        ['options', 'rowHeightOverrides'],
        { occurrenceId },
      );
    }
  }

  const expanded = new Set<OccurrenceId>();
  if (resolvedOptions.expandAll === true) {
    for (const node of snapshot.nodes) {
      expanded.add(node.occurrenceId);
    }
  } else {
    for (
      let index = 0;
      index < (resolvedOptions.expandedIds?.length ?? 0);
      index += 1
    ) {
      const occurrenceId = resolvedOptions.expandedIds![index];
      if (
        typeof occurrenceId !== 'string' ||
        occurrenceId.length === 0 ||
        !indexes.rowById.has(occurrenceId)
      ) {
        return projectionFailure(
          VISIBLE_PROJECTION_ERROR_CODES.unknownOccurrence,
          ['options', 'expandedIds', index],
          typeof occurrenceId === 'string' ? { occurrenceId } : undefined,
        );
      }
      expanded.add(occurrenceId);
    }
  }

  try {
    const viewChildren = resolveViewChildren(
      resolvedOptions.viewChildrenByParent,
      indexes,
    );
    if (!viewChildren.ok) return viewChildren;
    return projectionSuccess(
      new VisibleProjectionImpl<TFields>(
        snapshot,
        indexes,
        viewChildren.value,
        rowHeight,
        rowHeightOverrides,
        expanded,
      ),
    );
  } catch {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invariantViolation,
      ['snapshot'],
    );
  }
}

class VisibleProjectionImpl<TFields extends BomFields>
  implements VisibleProjection<TFields> {
  readonly defaultRowHeight: number;
  readonly #indexes: BomBaseIndexes<TFields>;
  readonly #viewChildrenByParent: ReadonlyMap<
    OccurrenceId | null,
    readonly OccurrenceId[]
  >;
  readonly #occurrenceOrder: readonly OccurrenceId[];
  readonly #depthById = new Map<OccurrenceId, number>();
  readonly #expanded: Set<OccurrenceId>;
  readonly #visibleSubtreeSizes = new Map<OccurrenceId, number>();
  readonly #rowHeightOverrides = new Map<OccurrenceId, number>();
  readonly #rope: ImplicitAvlRope;
  readonly #visibleNodeById = new Map<OccurrenceId, RopeNode>();

  constructor(
    snapshot: BomDocumentSnapshot<TFields>,
    indexes: BomBaseIndexes<TFields>,
    viewChildrenByParent: ReadonlyMap<
      OccurrenceId | null,
      readonly OccurrenceId[]
    >,
    defaultRowHeight: number,
    rowHeightOverrides: ReadonlyMap<OccurrenceId, number>,
    expanded: Set<OccurrenceId>,
  ) {
    this.defaultRowHeight = defaultRowHeight;
    this.#indexes = indexes;
    this.#viewChildrenByParent = viewChildrenByParent;
    this.#occurrenceOrder = collectViewPreorder(viewChildrenByParent);
    const included = new Set(this.#occurrenceOrder);
    for (const occurrenceId of this.#occurrenceOrder) {
      const node = indexes.rowById.get(occurrenceId)!;
      const depth =
        node.parentId === null
          ? 1
          : (this.#depthById.get(node.parentId) ?? 0) + 1;
      this.#depthById.set(node.occurrenceId, depth);
    }
    this.#expanded = new Set(
      [...expanded].filter((occurrenceId) => included.has(occurrenceId)),
    );
    for (const [occurrenceId, override] of rowHeightOverrides) {
      if (override !== defaultRowHeight) {
        this.#rowHeightOverrides.set(occurrenceId, override);
      }
    }
    this.#initializeVisibleSubtreeSizes();
    const visibleIds = this.#collectVisiblePreorder();
    const entries = visibleIds.map((occurrenceId) => ({
      occurrenceId,
      rowHeight: this.#rowHeightOverrides.get(occurrenceId) ?? defaultRowHeight,
    }));
    this.#rope = new ImplicitAvlRope(entries);
    for (const node of this.#rope.nodes()) {
      this.#visibleNodeById.set(node.occurrenceId, node);
    }
    Object.freeze(this);
  }

  get visibleCount(): number {
    return this.#rope.rowCount;
  }

  get totalHeight(): number {
    return this.#rope.pixelSum;
  }

  occurrenceAt(
    index: number,
  ): VisibleProjectionResult<OccurrenceId | undefined> {
    if (!Number.isSafeInteger(index) || index < 0) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
        ['index'],
      );
    }
    return projectionSuccess(this.#rope.nodeAt(index)?.occurrenceId);
  }

  indexOf(
    occurrenceId: OccurrenceId,
  ): VisibleProjectionResult<number | undefined> {
    const idResult = this.#validateOccurrenceId(occurrenceId);
    if (!idResult.ok) {
      return idResult;
    }
    const node = this.#visibleNodeById.get(occurrenceId);
    return projectionSuccess(
      node === undefined ? undefined : this.#rope.indexOf(node),
    );
  }

  depthOf(occurrenceId: OccurrenceId): VisibleProjectionResult<number> {
    const idResult = this.#validateOccurrenceId(occurrenceId);
    return idResult.ok
      ? projectionSuccess(this.#depthById.get(occurrenceId)!)
      : idResult;
  }

  occurrenceAtOffset(
    y: number,
  ): VisibleProjectionResult<OccurrenceId | undefined> {
    if (!isValidPixelCoordinate(y)) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
        ['y'],
      );
    }
    return projectionSuccess(this.#rope.nodeAtOffset(y)?.occurrenceId);
  }

  offsetOf(
    occurrenceId: OccurrenceId,
  ): VisibleProjectionResult<number | undefined> {
    const idResult = this.#validateOccurrenceId(occurrenceId);
    if (!idResult.ok) {
      return idResult;
    }
    const node = this.#visibleNodeById.get(occurrenceId);
    return projectionSuccess(
      node === undefined ? undefined : this.#rope.offsetOf(node),
    );
  }

  windowByOffset(
    scrollTop: number,
    viewportHeight: number,
    overscanPx: number,
  ): VisibleProjectionResult<VisibleWindow> {
    const argumentsToValidate = [
      ['scrollTop', scrollTop],
      ['viewportHeight', viewportHeight],
      ['overscanPx', overscanPx],
    ] as const;
    for (const [name, value] of argumentsToValidate) {
      if (!isValidPixelCoordinate(value)) {
        return projectionFailure(
          VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
          [name],
        );
      }
    }

    const totalHeight = this.totalHeight;
    const requestedStart = Math.max(0, scrollTop - overscanPx);
    const requestedEndSum = scrollTop + viewportHeight + overscanPx;
    const requestedEnd = Math.min(
      totalHeight,
      Number.isFinite(requestedEndSum) ? requestedEndSum : totalHeight,
    );
    if (
      totalHeight === 0 ||
      requestedStart >= totalHeight ||
      requestedEnd <= requestedStart
    ) {
      const boundaryIndex =
        requestedStart >= totalHeight
          ? this.visibleCount
          : this.#rope.countStartingBefore(requestedStart);
      const boundaryOffset =
        boundaryIndex >= this.visibleCount
          ? totalHeight
          : this.#rope.offsetOf(this.#rope.nodeAt(boundaryIndex)!);
      return projectionSuccess(
        freezeWindow({
          startIndex: boundaryIndex,
          endIndex: boundaryIndex,
          startOffset: boundaryOffset,
          endOffset: boundaryOffset,
          totalHeight,
          occurrenceIds: Object.freeze([]),
        }),
      );
    }

    const startNode = this.#rope.nodeAtOffset(requestedStart)!;
    const startIndex = this.#rope.indexOf(startNode);
    const endIndex = this.#rope.countStartingBefore(requestedEnd);
    const endBoundary = this.#rope.nodeAt(endIndex);
    const occurrenceIds = this.#rope.idsInRange(startIndex, endIndex);
    return projectionSuccess(
      freezeWindow({
        startIndex,
        endIndex,
        startOffset: this.#rope.offsetOf(startNode),
        endOffset:
          endBoundary === undefined
            ? totalHeight
            : this.#rope.offsetOf(endBoundary),
        totalHeight,
        occurrenceIds,
      }),
    );
  }

  setExpanded(
    occurrenceId: OccurrenceId,
    expanded: boolean,
  ): VisibleProjectionResult<ExpansionChange> {
    const idResult = this.#validateOccurrenceId(occurrenceId);
    if (!idResult.ok) {
      return idResult;
    }
    if (typeof expanded !== 'boolean') {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
        ['expanded'],
      );
    }
    const currentlyExpanded = this.#expanded.has(occurrenceId);
    if (currentlyExpanded === expanded) {
      return projectionSuccess(
        freezeExpansionChange({
          occurrenceId,
          expanded,
          changed: false,
          visibleDelta: 0,
          visibleCount: this.visibleCount,
          visibleSubtreeSize: this.#visibleSubtreeSizes.get(occurrenceId)!,
        }),
      );
    }

    const visibleNode = this.#visibleNodeById.get(occurrenceId);
    if (expanded) {
      const insertedIds = this.#collectVisibleDescendants(occurrenceId);
      const entries: RopeEntry[] = insertedIds.map((id) => ({
        occurrenceId: id,
        rowHeight: this.#rowHeightOverrides.get(id) ?? this.defaultRowHeight,
      }));
      let insertedPixels = 0;
      for (const entry of entries) {
        insertedPixels += entry.rowHeight;
      }
      if (
        visibleNode !== undefined &&
        this.totalHeight + insertedPixels > Number.MAX_SAFE_INTEGER
      ) {
        return projectionFailure(
          VISIBLE_PROJECTION_ERROR_CODES.pixelRangeExceeded,
          ['occurrenceId'],
          { occurrenceId },
        );
      }
      this.#expanded.add(occurrenceId);
      const newSubtreeSize = 1 + insertedIds.length;
      this.#visibleSubtreeSizes.set(occurrenceId, newSubtreeSize);
      this.#adjustExpandedAncestorSizes(occurrenceId, insertedIds.length);
      if (visibleNode !== undefined && entries.length > 0) {
        const insertionIndex = this.#rope.indexOf(visibleNode) + 1;
        for (const node of this.#rope.insert(insertionIndex, entries)) {
          this.#visibleNodeById.set(node.occurrenceId, node);
        }
      }
      return projectionSuccess(
        freezeExpansionChange({
          occurrenceId,
          expanded: true,
          changed: true,
          visibleDelta: visibleNode === undefined ? 0 : insertedIds.length,
          visibleCount: this.visibleCount,
          visibleSubtreeSize: newSubtreeSize,
        }),
      );
    }

    const previousSubtreeSize = this.#visibleSubtreeSizes.get(occurrenceId)!;
    const descendantCount = previousSubtreeSize - 1;
    this.#expanded.delete(occurrenceId);
    this.#visibleSubtreeSizes.set(occurrenceId, 1);
    this.#adjustExpandedAncestorSizes(occurrenceId, -descendantCount);
    if (visibleNode !== undefined && descendantCount > 0) {
      const removalIndex = this.#rope.indexOf(visibleNode) + 1;
      for (const node of this.#rope.remove(removalIndex, descendantCount)) {
        this.#visibleNodeById.delete(node.occurrenceId);
      }
    }
    return projectionSuccess(
      freezeExpansionChange({
        occurrenceId,
        expanded: false,
        changed: true,
        visibleDelta: visibleNode === undefined ? 0 : -descendantCount,
        visibleCount: this.visibleCount,
        visibleSubtreeSize: 1,
      }),
    );
  }

  isExpanded(occurrenceId: OccurrenceId): VisibleProjectionResult<boolean> {
    const idResult = this.#validateOccurrenceId(occurrenceId);
    return idResult.ok
      ? projectionSuccess(this.#expanded.has(occurrenceId))
      : idResult;
  }

  visibleSubtreeSizeOf(
    occurrenceId: OccurrenceId,
  ): VisibleProjectionResult<number> {
    const idResult = this.#validateOccurrenceId(occurrenceId);
    return idResult.ok
      ? projectionSuccess(this.#visibleSubtreeSizes.get(occurrenceId)!)
      : idResult;
  }

  setRowHeight(
    occurrenceId: OccurrenceId,
    rowHeight: number,
  ): VisibleProjectionResult<RowHeightChange> {
    const idResult = this.#validateOccurrenceId(occurrenceId);
    if (!idResult.ok) {
      return idResult;
    }
    if (!isValidRowHeight(rowHeight)) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
        ['rowHeight'],
        { maximum: MAX_ROW_HEIGHT_PX },
      );
    }
    const previousHeight =
      this.#rowHeightOverrides.get(occurrenceId) ?? this.defaultRowHeight;
    const visibleNode = this.#visibleNodeById.get(occurrenceId);
    if (
      visibleNode !== undefined &&
      this.totalHeight - previousHeight + rowHeight > Number.MAX_SAFE_INTEGER
    ) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.pixelRangeExceeded,
        ['rowHeight'],
        { occurrenceId },
      );
    }
    if (rowHeight === this.defaultRowHeight) {
      this.#rowHeightOverrides.delete(occurrenceId);
    } else {
      this.#rowHeightOverrides.set(occurrenceId, rowHeight);
    }
    if (visibleNode !== undefined && rowHeight !== previousHeight) {
      this.#rope.setRowHeight(visibleNode, rowHeight);
    }
    return projectionSuccess(
      freezeRowHeightChange({
        occurrenceId,
        visible: visibleNode !== undefined,
        previousHeight,
        rowHeight,
        totalHeight: this.totalHeight,
      }),
    );
  }

  rowHeightOf(occurrenceId: OccurrenceId): VisibleProjectionResult<number> {
    const idResult = this.#validateOccurrenceId(occurrenceId);
    return idResult.ok
      ? projectionSuccess(
          this.#rowHeightOverrides.get(occurrenceId) ?? this.defaultRowHeight,
        )
      : idResult;
  }

  rowHeightOverrides(): readonly Readonly<RowHeightOverride>[] {
    const result: RowHeightOverride[] = [];
    const emitted = new Set<OccurrenceId>();
    // Keep the published order deterministic: rows that participate in the
    // current projection come first, followed by overrides for rows filtered
    // out of the projection but still present in the snapshot.
    for (const occurrenceId of this.#occurrenceOrder) {
      const rowHeight = this.#rowHeightOverrides.get(occurrenceId);
      if (rowHeight !== undefined) {
        result.push(Object.freeze({ occurrenceId, rowHeight }));
        emitted.add(occurrenceId);
      }
    }
    for (const [occurrenceId, rowHeight] of this.#rowHeightOverrides) {
      if (!emitted.has(occurrenceId)) {
        result.push(Object.freeze({ occurrenceId, rowHeight }));
      }
    }
    return Object.freeze(result);
  }

  expandedOccurrenceIds(): readonly OccurrenceId[] {
    const result: OccurrenceId[] = [];
    for (const occurrenceId of this.#occurrenceOrder) {
      if (this.#expanded.has(occurrenceId)) {
        result.push(occurrenceId);
      }
    }
    return Object.freeze(result);
  }

  toArray(): readonly OccurrenceId[] {
    return this.#rope.idsInRange(0, this.visibleCount);
  }

  #initializeVisibleSubtreeSizes(): void {
    for (let index = this.#occurrenceOrder.length - 1; index >= 0; index -= 1) {
      const occurrenceId = this.#occurrenceOrder[index]!;
      let subtreeSize = 1;
      if (this.#expanded.has(occurrenceId)) {
        for (const childId of this.#childrenOf(occurrenceId)) {
          subtreeSize += this.#visibleSubtreeSizes.get(childId)!;
        }
      }
      this.#visibleSubtreeSizes.set(occurrenceId, subtreeSize);
    }
  }

  #collectVisiblePreorder(): readonly OccurrenceId[] {
    const result: OccurrenceId[] = [];
    const stack: OccurrenceId[] = [];
    pushReversed(stack, this.#viewChildrenByParent.get(null) ?? EMPTY_IDS);
    while (stack.length > 0) {
      const occurrenceId = stack.pop()!;
      result.push(occurrenceId);
      if (this.#expanded.has(occurrenceId)) {
        pushReversed(stack, this.#childrenOf(occurrenceId));
      }
    }
    return result;
  }

  #collectVisibleDescendants(
    occurrenceId: OccurrenceId,
  ): readonly OccurrenceId[] {
    const result: OccurrenceId[] = [];
    const stack: OccurrenceId[] = [];
    pushReversed(stack, this.#childrenOf(occurrenceId));
    while (stack.length > 0) {
      const descendantId = stack.pop()!;
      result.push(descendantId);
      if (this.#expanded.has(descendantId)) {
        pushReversed(stack, this.#childrenOf(descendantId));
      }
    }
    return result;
  }

  #adjustExpandedAncestorSizes(
    occurrenceId: OccurrenceId,
    delta: number,
  ): void {
    let parentId = this.#indexes.rowById.get(occurrenceId)!.parentId;
    while (parentId !== null) {
      if (!this.#expanded.has(parentId)) {
        return;
      }
      this.#visibleSubtreeSizes.set(
        parentId,
        this.#visibleSubtreeSizes.get(parentId)! + delta,
      );
      parentId = this.#indexes.rowById.get(parentId)!.parentId;
    }
  }

  #childrenOf(occurrenceId: OccurrenceId): readonly OccurrenceId[] {
    return this.#viewChildrenByParent.get(occurrenceId) ?? EMPTY_IDS;
  }

  #validateOccurrenceId(
    occurrenceId: OccurrenceId,
  ): VisibleProjectionResult<true> {
    if (
      typeof occurrenceId !== 'string' ||
      occurrenceId.length === 0 ||
      !this.#depthById.has(occurrenceId)
    ) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.unknownOccurrence,
        ['occurrenceId'],
        typeof occurrenceId === 'string' ? { occurrenceId } : undefined,
      );
    }
    return projectionSuccess(true);
  }
}

const EMPTY_IDS: readonly OccurrenceId[] = Object.freeze([]);

function resolveViewChildren<TFields extends BomFields>(
  requested: VisibleProjectionOptions<TFields>['viewChildrenByParent'],
  indexes: BomBaseIndexes<TFields>,
): VisibleProjectionResult<
  ReadonlyMap<OccurrenceId | null, readonly OccurrenceId[]>
> {
  if (requested === undefined) {
    return projectionSuccess(indexes.childrenByParent);
  }
  if (
    typeof requested !== 'object' ||
    requested === null ||
    typeof requested.get !== 'function'
  ) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
      ['options', 'viewChildrenByParent'],
    );
  }
  const resolved = new Map<OccurrenceId | null, readonly OccurrenceId[]>();
  const included = new Set<OccurrenceId>();
  const parentIds: Array<OccurrenceId | null> = [
    null,
    ...indexes.rowById.keys(),
  ];
  for (const parentId of parentIds) {
    const children = requested.get(parentId) ?? EMPTY_IDS;
    if (!Array.isArray(children)) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
        ['options', 'viewChildrenByParent'],
      );
    }
    const allowed = new Set(indexes.childrenByParent.get(parentId) ?? EMPTY_IDS);
    const output: OccurrenceId[] = [];
    for (const occurrenceId of children) {
      if (
        typeof occurrenceId !== 'string' ||
        !allowed.has(occurrenceId) ||
        included.has(occurrenceId)
      ) {
        return projectionFailure(
          VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
          ['options', 'viewChildrenByParent'],
        );
      }
      included.add(occurrenceId);
      output.push(occurrenceId);
    }
    resolved.set(parentId, Object.freeze(output));
  }
  for (const occurrenceId of included) {
    const parentId = indexes.rowById.get(occurrenceId)!.parentId;
    if (parentId !== null && !included.has(parentId)) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidArgument,
        ['options', 'viewChildrenByParent'],
      );
    }
  }
  return projectionSuccess(resolved);
}

function collectViewPreorder(
  childrenByParent: ReadonlyMap<OccurrenceId | null, readonly OccurrenceId[]>,
): readonly OccurrenceId[] {
  const result: OccurrenceId[] = [];
  const stack: OccurrenceId[] = [];
  pushReversed(stack, childrenByParent.get(null) ?? EMPTY_IDS);
  while (stack.length > 0) {
    const occurrenceId = stack.pop()!;
    result.push(occurrenceId);
    pushReversed(stack, childrenByParent.get(occurrenceId) ?? EMPTY_IDS);
  }
  return Object.freeze(result);
}

function validateIndexes<TFields extends BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
  indexes: BomBaseIndexes<TFields>,
): VisibleProjectionResult<true> {
  if (
    !isRecord(indexes) ||
    !isReadonlyMapLike(indexes.rowById) ||
    !isReadonlyMapLike(indexes.childrenByParent) ||
    !isReadonlyMapLike(indexes.rowsByMaterialCode)
  ) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidIndexes,
      ['options', 'indexes'],
    );
  }
  if (indexes.rowById.size !== snapshot.nodes.length) {
    return invalidIndexes('ROW_COUNT_MISMATCH');
  }
  for (const node of snapshot.nodes) {
    const indexed = indexes.rowById.get(node.occurrenceId);
    if (
      indexed === undefined ||
      indexed.parentId !== node.parentId ||
      indexed.positionKey !== node.positionKey
    ) {
      return invalidIndexes('ROW_MISMATCH', node.occurrenceId);
    }
  }

  const seen = new Set<OccurrenceId>();
  const roots = indexes.childrenByParent.get(null) ?? EMPTY_IDS;
  if (!sameIds(roots, snapshot.roots)) {
    return invalidIndexes('ROOT_ORDER_MISMATCH');
  }
  const rootResult = validateChildList(null, roots, indexes, seen);
  if (!rootResult.ok) {
    return rootResult;
  }
  for (const node of snapshot.nodes) {
    const children = indexes.childrenByParent.get(node.occurrenceId) ?? EMPTY_IDS;
    const childResult = validateChildList(
      node.occurrenceId,
      children,
      indexes,
      seen,
    );
    if (!childResult.ok) {
      return childResult;
    }
  }
  if (seen.size !== snapshot.nodes.length) {
    return invalidIndexes('CHILD_COVERAGE_MISMATCH');
  }

  const stack: OccurrenceId[] = [];
  pushReversed(stack, roots);
  let preorderIndex = 0;
  while (stack.length > 0) {
    const occurrenceId = stack.pop()!;
    if (snapshot.nodes[preorderIndex]?.occurrenceId !== occurrenceId) {
      return projectionFailure(
        VISIBLE_PROJECTION_ERROR_CODES.invalidSnapshot,
        ['snapshot', 'nodes', preorderIndex],
        { reason: 'NODES_NOT_NORMALIZED_PREORDER' },
      );
    }
    preorderIndex += 1;
    pushReversed(
      stack,
      indexes.childrenByParent.get(occurrenceId) ?? EMPTY_IDS,
    );
  }
  if (preorderIndex !== snapshot.nodes.length) {
    return projectionFailure(
      VISIBLE_PROJECTION_ERROR_CODES.invalidSnapshot,
      ['snapshot', 'nodes'],
      { reason: 'DISCONNECTED_STRUCTURE' },
    );
  }
  return projectionSuccess(true);
}

function validateChildList<TFields extends BomFields>(
  parentId: OccurrenceId | null,
  children: readonly OccurrenceId[],
  indexes: BomBaseIndexes<TFields>,
  seen: Set<OccurrenceId>,
): VisibleProjectionResult<true> {
  if (!Array.isArray(children)) {
    return invalidIndexes('CHILD_LIST_INVALID');
  }
  let previous: BomNode<TFields> | undefined;
  for (const occurrenceId of children) {
    const child = indexes.rowById.get(occurrenceId);
    if (
      child === undefined ||
      child.parentId !== parentId ||
      seen.has(occurrenceId)
    ) {
      return invalidIndexes('CHILD_RELATION_MISMATCH', occurrenceId);
    }
    if (
      previous !== undefined &&
      comparePositionKeys(previous.positionKey, child.positionKey) >= 0
    ) {
      return invalidIndexes('CHILD_ORDER_MISMATCH', occurrenceId);
    }
    seen.add(occurrenceId);
    previous = child;
  }
  return projectionSuccess(true);
}

function invalidIndexes(
  reason: string,
  occurrenceId?: OccurrenceId,
): VisibleProjectionResult<true> {
  return projectionFailure(
    VISIBLE_PROJECTION_ERROR_CODES.invalidIndexes,
    ['options', 'indexes'],
    occurrenceId === undefined ? { reason } : { reason, occurrenceId },
  );
}

function hasSnapshotShape(value: unknown): value is BomDocumentSnapshot {
  if (!isRecord(value)) {
    return false;
  }
  const roots = value['roots'];
  const nodes = value['nodes'];
  if (!Array.isArray(roots) || !Array.isArray(nodes)) {
    return false;
  }
  for (const root of roots) {
    if (typeof root !== 'string' || root.length === 0) {
      return false;
    }
  }
  for (const node of nodes) {
    if (
      !isRecord(node) ||
      typeof node['occurrenceId'] !== 'string' ||
      node['occurrenceId'].length === 0 ||
      (node['parentId'] !== null && typeof node['parentId'] !== 'string') ||
      typeof node['positionKey'] !== 'string'
    ) {
      return false;
    }
  }
  return true;
}

function isReadonlyMapLike(value: unknown): value is ReadonlyMap<unknown, unknown> {
  return (
    isRecord(value) &&
    typeof value['size'] === 'number' &&
    typeof value['get'] === 'function' &&
    typeof value['has'] === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidRowHeight(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_ROW_HEIGHT_PX;
}

function isValidPixelCoordinate(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function sameIds(
  left: readonly OccurrenceId[],
  right: readonly OccurrenceId[],
): boolean {
  return (
    left.length === right.length &&
    left.every((occurrenceId, index) => occurrenceId === right[index])
  );
}

function pushReversed(
  target: OccurrenceId[],
  values: readonly OccurrenceId[],
): void {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    target.push(values[index]!);
  }
}

function freezeWindow(window: VisibleWindow): VisibleWindow {
  return Object.freeze(window);
}

function freezeExpansionChange(change: ExpansionChange): ExpansionChange {
  return Object.freeze(change);
}

function freezeRowHeightChange(change: RowHeightChange): RowHeightChange {
  return Object.freeze(change);
}
