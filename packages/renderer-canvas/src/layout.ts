import type { OccurrenceId } from '@bom-editor/contracts';
import type { BomColumnDefinition } from '@bom-editor/runtime';
import type { VisibleWindow } from '@bom-editor/visible-projection';
import type { BomCanvasRect, BomCanvasTextDirection } from './types.js';

export interface BomCanvasColumnLayout extends BomCanvasRect {
  readonly column: Readonly<BomColumnDefinition>;
  readonly columnId: string;
  readonly columnIndex: number;
  readonly contentOffset: number;
  readonly frozen: boolean;
}

export interface BomCanvasColumnWindow {
  readonly columns: readonly Readonly<BomCanvasColumnLayout>[];
  /** Width reserved by logical-start columns, including the row gutter. */
  readonly frozenWidth: number;
  /** Width reserved by logical-end columns. */
  readonly trailingFrozenWidth: number;
  readonly scrollableWidth: number;
  readonly totalWidth: number;
  readonly direction: BomCanvasTextDirection;
}

export interface BomCanvasRowMetric {
  readonly occurrenceId: OccurrenceId;
  readonly height: number;
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
}

export interface BomCanvasRowLayout extends BomCanvasRect {
  readonly occurrenceId: OccurrenceId;
  readonly rowIndex: number;
  readonly documentOffset: number;
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
}

export interface BomCanvasSurfaceLayout extends BomCanvasRect {
  readonly left: number;
  readonly top: number;
}

export function calculateColumnWindow(
  columns: readonly Readonly<BomColumnDefinition>[],
  scrollLeft: number,
  viewportWidth: number,
  overscanX: number,
  leadingFrozenWidth = 0,
  direction: BomCanvasTextDirection = 'ltr',
): Readonly<BomCanvasColumnWindow> {
  const logicalScrollLeft = nonNegative(scrollLeft);
  const logicalViewportWidth = nonNegative(viewportWidth);
  const logicalOverscan = nonNegative(overscanX);
  const frozen: Array<{
    readonly column: Readonly<BomColumnDefinition>;
    readonly columnIndex: number;
    readonly offset: number;
  }> = [];
  const trailingFrozen: Array<{
    readonly column: Readonly<BomColumnDefinition>;
    readonly columnIndex: number;
    offset: number;
  }> = [];
  const scrollable: Array<{
    readonly column: Readonly<BomColumnDefinition>;
    readonly columnIndex: number;
    readonly offset: number;
  }> = [];
  let frozenWidth = nonNegative(leadingFrozenWidth);
  let scrollableWidth = 0;

  let visibleColumnIndex = 0;
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex]!;
    if (column.visible === false) {
      continue;
    }
    const width = validWidth(column.width);
    if (column.frozen === 'start') {
      frozen.push({
        column,
        columnIndex: visibleColumnIndex,
        offset: frozenWidth,
      });
      frozenWidth += width;
    } else if (column.frozen === 'end') {
      trailingFrozen.push({
        column,
        columnIndex: visibleColumnIndex,
        offset: 0,
      });
    } else {
      scrollable.push({
        column,
        columnIndex: visibleColumnIndex,
        offset: scrollableWidth,
      });
      scrollableWidth += width;
    }
    visibleColumnIndex += 1;
  }

  let trailingFrozenWidth = 0;
  for (const entry of trailingFrozen) {
    entry.offset = trailingFrozenWidth;
    trailingFrozenWidth += validWidth(entry.column.width);
  }

  const placements: BomCanvasColumnLayout[] = [];
  const minimumX = -logicalOverscan;
  const maximumX = logicalViewportWidth + logicalOverscan;
  for (const entry of frozen) {
    const width = validWidth(entry.column.width);
    const x = direction === 'rtl'
      ? logicalViewportWidth - entry.offset - width
      : entry.offset;
    if (intersects(x, width, minimumX, maximumX)) {
      placements.push(
        freezeColumn(entry, x, width, entry.offset, true),
      );
    }
  }
  const trailingStart = direction === 'rtl'
    ? Math.min(
      logicalViewportWidth - frozenWidth,
      trailingFrozenWidth,
    )
    : Math.max(frozenWidth, logicalViewportWidth - trailingFrozenWidth);
  for (const entry of trailingFrozen) {
    const width = validWidth(entry.column.width);
    const x = direction === 'rtl'
      ? trailingStart - entry.offset - width
      : trailingStart + entry.offset;
    if (intersects(x, width, minimumX, maximumX)) {
      placements.push(
        freezeColumn(entry, x, width, frozenWidth + scrollableWidth + entry.offset, true),
      );
    }
  }
  const scrollableStart = direction === 'rtl'
    ? trailingFrozenWidth
    : frozenWidth;
  const scrollableEnd = direction === 'rtl'
    ? logicalViewportWidth - frozenWidth
    : logicalViewportWidth - trailingFrozenWidth;
  for (const entry of scrollable) {
    const width = validWidth(entry.column.width);
    const x = direction === 'rtl'
      ? logicalViewportWidth - frozenWidth - entry.offset + logicalScrollLeft - width
      : frozenWidth + entry.offset - logicalScrollLeft;
    if (
      x + width > scrollableStart - logicalOverscan &&
      x < scrollableEnd + logicalOverscan &&
      intersects(x, width, minimumX, maximumX)
    ) {
      placements.push(
        freezeColumn(entry, x, width, frozenWidth + entry.offset, false),
      );
    }
  }

  placements.sort((left, right) => left.x - right.x);
  const result: BomCanvasColumnWindow = {
    columns: Object.freeze(placements),
    frozenWidth,
    trailingFrozenWidth,
    scrollableWidth,
    totalWidth: frozenWidth + scrollableWidth + trailingFrozenWidth,
    direction,
  };
  return Object.freeze(result);
}

export function calculateRowLayout(
  window: Readonly<VisibleWindow>,
  metrics: readonly Readonly<BomCanvasRowMetric>[],
  scrollTop: number,
  bodyTop = 0,
): readonly Readonly<BomCanvasRowLayout>[] {
  if (metrics.length !== window.occurrenceIds.length) {
    throw new RangeError('row metrics must match the visible window');
  }
  const rows: BomCanvasRowLayout[] = [];
  let documentOffset = window.startOffset;
  for (let index = 0; index < metrics.length; index += 1) {
    const metric = metrics[index]!;
    const expectedId = window.occurrenceIds[index];
    if (metric.occurrenceId !== expectedId) {
      throw new RangeError('row metric identity must match the visible window');
    }
    const height = validHeight(metric.height);
    rows.push(
      Object.freeze({
        occurrenceId: metric.occurrenceId,
        rowIndex: window.startIndex + index,
        documentOffset,
        x: 0,
        y:
          nonNegative(bodyTop) +
          documentOffset -
          nonNegative(scrollTop),
        width: 0,
        height,
        depth: metric.depth,
        expandable: metric.expandable,
        expanded: metric.expanded,
      }),
    );
    documentOffset += height;
  }
  return Object.freeze(rows);
}

export function calculateCanvasSurfaceLayout(
  viewportWidth: number,
  viewportHeight: number,
  overscanX: number,
  overscanY: number,
): Readonly<BomCanvasSurfaceLayout> {
  const x = nonNegative(overscanX);
  const y = nonNegative(overscanY);
  return Object.freeze({
    x: -x,
    y: -y,
    left: -x,
    top: -y,
    width: nonNegative(viewportWidth) + x * 2,
    height: nonNegative(viewportHeight) + y * 2,
  });
}

function freezeColumn(
  entry: {
    readonly column: Readonly<BomColumnDefinition>;
    readonly columnIndex: number;
  },
  x: number,
  width: number,
  contentOffset: number,
  frozen: boolean,
): Readonly<BomCanvasColumnLayout> {
  return Object.freeze({
    column: entry.column,
    columnId: entry.column.columnId,
    columnIndex: entry.columnIndex,
    contentOffset,
    frozen,
    x,
    y: 0,
    width,
    height: 0,
  });
}

function intersects(
  start: number,
  size: number,
  minimum: number,
  maximum: number,
): boolean {
  return start < maximum && start + size > minimum;
}

function validWidth(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('column width must be a finite positive number');
  }
  return value;
}

function validHeight(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('row height must be a finite positive number');
  }
  return value;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
