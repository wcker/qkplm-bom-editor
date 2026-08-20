import type { BomDocumentSnapshot, BomFields, BomValue, OccurrenceId } from '@bom-editor/contracts';
import type { BomBaseIndexes } from '@bom-editor/model';

export type VisibleQueryOperator = 'contains' | 'equals' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte';

export interface VisibleQueryFilter {
  readonly fieldPath: readonly string[];
  readonly operator: VisibleQueryOperator;
  readonly value: BomValue;
}

export interface VisibleQuerySort {
  readonly fieldPath: readonly string[];
  readonly direction: 'asc' | 'desc';
}

export interface VisibleQueryOptions {
  readonly filters?: readonly VisibleQueryFilter[];
  readonly sort?: readonly VisibleQuerySort[];
}

/** Builds a view-only sibling map. It never mutates the snapshot or indexes. */
export function buildViewChildrenByParent<TFields extends BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
  indexes: BomBaseIndexes<TFields>,
  options: VisibleQueryOptions = {},
): ReadonlyMap<OccurrenceId | null, readonly OccurrenceId[]> {
  const filters = options.filters ?? [];
  const matched = new Set<OccurrenceId>();
  for (const node of snapshot.nodes) {
    if (filters.every((filter) => matchesFilter(node.fields, filter))) {
      matched.add(node.occurrenceId);
    }
  }
  const included = filters.length === 0 ? new Set(indexes.rowById.keys()) : includeAncestors(matched, indexes);
  const result = new Map<OccurrenceId | null, readonly OccurrenceId[]>();
  for (const [parentId, children] of indexes.childrenByParent) {
    const visible = children.filter((id) => included.has(id));
    visible.sort((left, right) => compareNodes(indexes, left, right, options.sort ?? []));
    result.set(parentId, Object.freeze(visible));
  }
  return result;
}

function includeAncestors<TFields extends BomFields>(
  matched: ReadonlySet<OccurrenceId>,
  indexes: BomBaseIndexes<TFields>,
): Set<OccurrenceId> {
  const included = new Set(matched);
  for (const id of matched) {
    let node = indexes.rowById.get(id);
    while (node?.parentId !== null && node?.parentId !== undefined) {
      included.add(node.parentId);
      node = indexes.rowById.get(node.parentId);
    }
  }
  return included;
}

function fieldValue(fields: BomFields, path: readonly string[]): BomValue | undefined {
  let value: BomValue | undefined = fields;
  for (const key of path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as { readonly [key: string]: BomValue })[key];
  }
  return value;
}

function scalar(value: BomValue | undefined): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('$type' in value && 'value' in value) return String(value.value);
    return JSON.stringify(value);
  }
  return value;
}

function matchesFilter(fields: BomFields, filter: VisibleQueryFilter): boolean {
  const left = scalar(fieldValue(fields, filter.fieldPath));
  const right = scalar(filter.value);
  if (filter.operator === 'contains') return String(left).toLocaleLowerCase().includes(String(right).toLocaleLowerCase());
  if (filter.operator === 'startsWith') return String(left).toLocaleLowerCase().startsWith(String(right).toLocaleLowerCase());
  if (filter.operator === 'equals') return left === right || String(left) === String(right);
  const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
  return filter.operator === 'gt' ? comparison > 0 : filter.operator === 'gte' ? comparison >= 0 : filter.operator === 'lt' ? comparison < 0 : comparison <= 0;
}

function compareNodes<TFields extends BomFields>(indexes: BomBaseIndexes<TFields>, leftId: OccurrenceId, rightId: OccurrenceId, sort: readonly VisibleQuerySort[]): number {
  const left = indexes.rowById.get(leftId);
  const right = indexes.rowById.get(rightId);
  for (const rule of sort) {
    const a = scalar(left === undefined ? undefined : fieldValue(left.fields, rule.fieldPath));
    const b = scalar(right === undefined ? undefined : fieldValue(right.fields, rule.fieldPath));
    const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    if (comparison !== 0) return rule.direction === 'desc' ? -comparison : comparison;
  }
  return 0;
}
