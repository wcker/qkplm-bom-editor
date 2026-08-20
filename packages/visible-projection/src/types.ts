import type {
  BomDocumentSnapshot,
  BomFields,
  OccurrenceId,
} from '@bom-editor/contracts';
import type { BomBaseIndexes } from '@bom-editor/model';
import type { VisibleProjectionResult } from './errors.js';

export const DEFAULT_ROW_HEIGHT_PX = 28;
export const MAX_ROW_HEIGHT_PX = 1_000_000;

export interface VisibleProjectionOptions<
  TFields extends BomFields = BomFields,
> {
  readonly indexes?: BomBaseIndexes<TFields>;
  /**
   * Optional view-only sibling order and visibility subset. Every referenced
   * ID must retain its original parent relationship. This never changes the
   * document's position keys or base indexes.
   */
  readonly viewChildrenByParent?: ReadonlyMap<
    OccurrenceId | null,
    readonly OccurrenceId[]
  >;
  readonly rowHeight?: number;
  /** Optional stable per-occurrence height overrides. */
  readonly rowHeightOverrides?: ReadonlyMap<OccurrenceId, number>;
  readonly expandedIds?: readonly OccurrenceId[];
  readonly expandAll?: boolean;
}

export interface VisibleWindow {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly totalHeight: number;
  readonly occurrenceIds: readonly OccurrenceId[];
}

export interface ExpansionChange {
  readonly occurrenceId: OccurrenceId;
  readonly expanded: boolean;
  readonly changed: boolean;
  readonly visibleDelta: number;
  readonly visibleCount: number;
  readonly visibleSubtreeSize: number;
}

export interface RowHeightChange {
  readonly occurrenceId: OccurrenceId;
  readonly visible: boolean;
  readonly previousHeight: number;
  readonly rowHeight: number;
  readonly totalHeight: number;
}

export interface RowHeightOverride {
  readonly occurrenceId: OccurrenceId;
  readonly rowHeight: number;
}

export interface VisibleProjection<
  TFields extends BomFields = BomFields,
> {
  readonly visibleCount: number;
  readonly totalHeight: number;
  readonly defaultRowHeight: number;

  occurrenceAt(index: number): VisibleProjectionResult<OccurrenceId | undefined>;
  indexOf(occurrenceId: OccurrenceId): VisibleProjectionResult<number | undefined>;
  depthOf(occurrenceId: OccurrenceId): VisibleProjectionResult<number>;
  occurrenceAtOffset(y: number): VisibleProjectionResult<OccurrenceId | undefined>;
  offsetOf(occurrenceId: OccurrenceId): VisibleProjectionResult<number | undefined>;
  windowByOffset(
    scrollTop: number,
    viewportHeight: number,
    overscanPx: number,
  ): VisibleProjectionResult<VisibleWindow>;

  setExpanded(
    occurrenceId: OccurrenceId,
    expanded: boolean,
  ): VisibleProjectionResult<ExpansionChange>;
  isExpanded(occurrenceId: OccurrenceId): VisibleProjectionResult<boolean>;
  visibleSubtreeSizeOf(
    occurrenceId: OccurrenceId,
  ): VisibleProjectionResult<number>;
  setRowHeight(
    occurrenceId: OccurrenceId,
    rowHeight: number,
  ): VisibleProjectionResult<RowHeightChange>;
  rowHeightOf(occurrenceId: OccurrenceId): VisibleProjectionResult<number>;
  rowHeightOverrides(): readonly Readonly<RowHeightOverride>[];

  expandedOccurrenceIds(): readonly OccurrenceId[];
  toArray(): readonly OccurrenceId[];
}

export type CreateVisibleProjection = <TFields extends BomFields = BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
  options?: VisibleProjectionOptions<TFields>,
) => VisibleProjectionResult<VisibleProjection<TFields>>;
