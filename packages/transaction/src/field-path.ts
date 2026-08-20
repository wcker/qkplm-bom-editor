import type { BomFields, BomValue } from '@bom-editor/contracts';
import { isPlainBomObject } from '@bom-editor/model';

export interface BomFieldLookup {
  readonly present: boolean;
  readonly value?: BomValue;
}

export function getBomFieldPath(
  fields: BomFields,
  path: readonly string[],
): BomFieldLookup {
  if (path.length === 0) {
    return { present: false };
  }

  let current: BomValue = fields;
  for (const segment of path) {
    if (
      !isPlainBomObject(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { present: false };
    }
    current = current[segment] as BomValue;
  }
  return { present: true, value: current };
}

export function findFirstMissingBomFieldPathPrefix(
  fields: BomFields,
  path: readonly string[],
): readonly string[] | undefined {
  let current: BomValue = fields;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index]!;
    if (
      !isPlainBomObject(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return Object.freeze(path.slice(0, index + 1));
    }
    current = current[segment] as BomValue;
  }
  return undefined;
}

export function setBomFieldPath<TFields extends BomFields>(
  fields: TFields,
  path: readonly string[],
  value: BomValue,
): TFields {
  const ancestors: Readonly<Record<string, BomValue>>[] = [];
  let current: Readonly<Record<string, BomValue>> = fields;
  for (let index = 0; index < path.length - 1; index += 1) {
    ancestors.push(current);
    const next = current[path[index]!];
    current = isPlainBomObject(next)
      ? (next as Readonly<Record<string, BomValue>>)
      : {};
  }

  let updated: Readonly<Record<string, BomValue>> = {
    ...current,
    [path[path.length - 1]!]: value,
  };
  for (let index = path.length - 2; index >= 0; index -= 1) {
    updated = {
      ...ancestors[index]!,
      [path[index]!]: updated,
    };
  }
  return updated as TFields;
}

export function unsetBomFieldPath<TFields extends BomFields>(
  fields: TFields,
  path: readonly string[],
): TFields {
  const lookup = getBomFieldPath(fields, path);
  if (!lookup.present) {
    return fields;
  }

  const ancestors: Readonly<Record<string, BomValue>>[] = [];
  let current: Readonly<Record<string, BomValue>> = fields;
  for (let index = 0; index < path.length - 1; index += 1) {
    ancestors.push(current);
    current = current[path[index]!] as Readonly<Record<string, BomValue>>;
  }

  const leaf = { ...current };
  delete leaf[path[path.length - 1]!];
  let updated: Readonly<Record<string, BomValue>> = leaf;
  for (let index = path.length - 2; index >= 0; index -= 1) {
    updated = {
      ...ancestors[index]!,
      [path[index]!]: updated,
    };
  }
  return updated as TFields;
}
export function hasBomFieldPathTypeConflict(
  fields: BomFields,
  path: readonly string[],
): boolean {
  let current: BomValue = fields;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!isPlainBomObject(current)) {
      return true;
    }
    const segment = path[index]!;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }
    const next = current[segment] as BomValue;
    if (!isPlainBomObject(next)) {
      return true;
    }
    current = next;
  }
  return false;
}

