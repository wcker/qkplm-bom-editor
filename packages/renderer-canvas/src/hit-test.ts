import type { BomCellAddress } from '@bom-editor/runtime';
import type {
  BomCanvasColumnLayout,
  BomCanvasColumnWindow,
  BomCanvasRowLayout,
} from './layout.js';
import type { BomCanvasRect, BomCanvasTextDirection } from './types.js';

export interface BomCanvasHitTestInput {
  readonly x: number;
  readonly y: number;
  readonly rows: readonly Readonly<BomCanvasRowLayout>[];
  readonly columnWindow: Readonly<BomCanvasColumnWindow>;
  readonly treeColumnId: string | undefined;
  readonly indentWidth: number;
  readonly cellPadding: number;
  readonly expanderSize: number;
  readonly bodyTop?: number;
  /** Width of the row-number gutter; defaults to zero for data-only callers. */
  readonly rowHeaderWidth?: number;
  /** Physical viewport width; required for exact RTL row-gutter hit testing. */
  readonly viewportWidth?: number;
  /** Defaults to the direction recorded by the column window. */
  readonly direction?: BomCanvasTextDirection;
}

export type BomCanvasCellHitTarget =
  | 'cell'
  | 'expander'
  | 'row-header'
  | 'column-header';

export interface BomCanvasCellHit {
  readonly address: Readonly<BomCellAddress>;
  readonly target: BomCanvasCellHitTarget;
  readonly rect: Readonly<BomCanvasRect>;
}

export function hitTestCanvasCell(
  input: Readonly<BomCanvasHitTestInput>,
): Readonly<BomCanvasCellHit> | null {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return null;
  }
  const bodyTop = nonNegative(input.bodyTop ?? 0);
  const rowHeaderWidth = nonNegative(input.rowHeaderWidth ?? 0);
  const direction = input.direction ?? input.columnWindow.direction ?? 'ltr';
  const viewportWidth = resolvedViewportWidth(input, rowHeaderWidth);
  const rowHeaderStart = direction === 'rtl'
    ? Math.max(0, viewportWidth - rowHeaderWidth)
    : 0;
  const firstRow = input.rows[0];
  const firstColumn = firstLogicalColumn(input.columnWindow.columns);
  if (input.y < bodyTop) {
    if (
      (
        input.x >= rowHeaderStart &&
        input.x < rowHeaderStart + rowHeaderWidth
      ) ||
      firstRow === undefined
    ) {
      return null;
    }
    const column = findColumn(
      input.columnWindow.columns,
      input.columnWindow,
      input.x,
      viewportWidth,
      direction,
    );
    if (column === undefined) {
      return null;
    }
    return Object.freeze({
      address: Object.freeze({
        occurrenceId: firstRow.occurrenceId,
        columnId: column.columnId,
      }),
      target: 'column-header' as const,
      rect: Object.freeze({
        x: column.x,
        y: 0,
        width: column.width,
        height: bodyTop,
      }),
    });
  }
  const row = findRow(input.rows, input.y);
  if (row === undefined) {
    return null;
  }
  if (
    input.x >= rowHeaderStart &&
    input.x < rowHeaderStart + rowHeaderWidth
  ) {
    if (firstColumn === undefined) {
      return null;
    }
    return Object.freeze({
      address: Object.freeze({
        occurrenceId: row.occurrenceId,
        columnId: firstColumn.columnId,
      }),
      target: 'row-header' as const,
      rect: Object.freeze({
        x: rowHeaderStart,
        y: row.y,
        width: rowHeaderWidth,
        height: row.height,
      }),
    });
  }
  const column = findColumn(
    input.columnWindow.columns,
    input.columnWindow,
    input.x,
    viewportWidth,
    direction,
  );
  if (column === undefined) {
    return null;
  }
  const address = Object.freeze({
    occurrenceId: row.occurrenceId,
    columnId: column.columnId,
  });
  const rect = Object.freeze({
    x: column.x,
    y: row.y,
    width: column.width,
    height: row.height,
  });
  if (
    row.expandable &&
    column.columnId === input.treeColumnId &&
    pointInExpander(input.x, input.y, row, column, input)
  ) {
    return Object.freeze({ address, target: 'expander', rect });
  }
  return Object.freeze({ address, target: 'cell', rect });
}

function findRow(
  rows: readonly Readonly<BomCanvasRowLayout>[],
  y: number,
): Readonly<BomCanvasRowLayout> | undefined {
  let low = 0;
  let high = rows.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const row = rows[middle]!;
    if (y < row.y) {
      high = middle - 1;
    } else if (y >= row.y + row.height) {
      low = middle + 1;
    } else {
      return row;
    }
  }
  return undefined;
}

function findColumn(
  columns: readonly Readonly<BomCanvasColumnLayout>[],
  columnWindow: Readonly<BomCanvasColumnWindow>,
  x: number,
  viewportWidth: number,
  direction: BomCanvasTextDirection,
): Readonly<BomCanvasColumnLayout> | undefined {
  const contains = (column: Readonly<BomCanvasColumnLayout>): boolean =>
    x >= column.x && x < column.x + column.width;
  const startFrozen = columns.find(
    (column) => column.column.frozen === 'start' && contains(column),
  );
  if (startFrozen !== undefined) return startFrozen;
  const endFrozen = columns.find(
    (column) => column.column.frozen === 'end' && contains(column),
  );
  if (endFrozen !== undefined) return endFrozen;
  const scrollableStart = direction === 'rtl'
    ? columnWindow.trailingFrozenWidth
    : columnWindow.frozenWidth;
  const scrollableEnd = direction === 'rtl'
    ? viewportWidth - columnWindow.frozenWidth
    : viewportWidth - columnWindow.trailingFrozenWidth;
  if (x < scrollableStart || x >= scrollableEnd) return undefined;
  return columns.find(
    (column) => column.column.frozen === false && contains(column),
  );
}

function pointInExpander(
  x: number,
  y: number,
  row: Readonly<BomCanvasRowLayout>,
  column: Readonly<BomCanvasColumnLayout>,
  input: Readonly<BomCanvasHitTestInput>,
): boolean {
  const size = positive(input.expanderSize);
  const indent = positive(input.indentWidth);
  const padding = nonNegative(input.cellPadding);
  const direction = input.direction ?? input.columnWindow.direction ?? 'ltr';
  const left = direction === 'rtl'
    ? column.x + column.width - padding - Math.max(0, row.depth - 1) * indent - size
    : column.x + padding + Math.max(0, row.depth - 1) * indent;
  const top = row.y + (row.height - size) / 2;
  return x >= left && x < left + size && y >= top && y < top + size;
}

function firstLogicalColumn(
  columns: readonly Readonly<BomCanvasColumnLayout>[],
): Readonly<BomCanvasColumnLayout> | undefined {
  return columns.reduce<Readonly<BomCanvasColumnLayout> | undefined>(
    (first, column) =>
      first === undefined || column.columnIndex < first.columnIndex
        ? column
        : first,
    undefined,
  );
}

function resolvedViewportWidth(
  input: Readonly<BomCanvasHitTestInput>,
  rowHeaderWidth: number,
): number {
  if (Number.isFinite(input.viewportWidth) && input.viewportWidth! >= 0) {
    return input.viewportWidth!;
  }
  return Math.max(
    rowHeaderWidth,
    ...input.columnWindow.columns.map((column) => column.x + column.width),
  );
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
