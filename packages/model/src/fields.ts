import type {
  BomError,
  BomFieldSchema,
  BomFields,
  BomSchema,
  BomValue,
} from '@bom-editor/contracts';
import {
  BOM_MODEL_ERROR_CODES,
  modelError,
  modelFailure,
  modelSuccess,
  type BomModelResult,
} from './errors.js';
import {
  resolveModelLimits,
  type BomModelLimits,
} from './limits.js';
import { validateNormalizedFieldValue } from './schema.js';
import {
  deepFreezeBomValue,
  isPlainBomObject,
  normalizeBomValue,
} from './value.js';

interface FieldPathLookup {
  readonly present: boolean;
  readonly value?: BomValue;
}

interface FieldTrieNode {
  readonly children: Map<string, FieldTrieNode>;
  field?: BomFieldSchema;
}

const FIELD_TRIE_CACHE = new WeakMap<BomSchema, FieldTrieNode>();
const FLAT_FIELD_CACHE = new WeakMap<
  BomSchema,
  ReadonlyMap<string, BomFieldSchema> | null
>();

export interface NormalizeBomFieldsOptions {
  readonly limits?: Partial<BomModelLimits>;
  readonly path?: readonly (string | number)[];
}

export function normalizeBomFields<TFields extends BomFields = BomFields>(
  input: unknown,
  schema: BomSchema,
  options: NormalizeBomFieldsOptions = {},
): BomModelResult<TFields> {
  const limits = resolveModelLimits(options.limits);
  const rootPath = options.path ?? ['fields'];
  const normalizedInput = normalizeBomValue(input, { limits, path: rootPath });
  if (!normalizedInput.ok) {
    return normalizedInput;
  }
  return normalizeOwnedBomFields<TFields>(
    normalizedInput.value,
    schema,
    { limits, path: rootPath },
  );
}

/**
 * Internal fast path for values already captured by normalizeBomValue.
 * Callers must not expose this function as a public package export.
 */
export function normalizeOwnedBomFields<
  TFields extends BomFields = BomFields,
>(
  input: BomValue | undefined,
  schema: BomSchema,
  options: NormalizeBomFieldsOptions = {},
): BomModelResult<TFields> {
  const rootPath = options.path ?? ['fields'];
  if (!isPlainBomObject(input)) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.fieldTypeMismatch, 'VALIDATION', rootPath, {
        expected: 'object',
      }),
    );
  }

  const flatFields = flatFieldsForSchema(schema);
  if (flatFields !== undefined) {
    return normalizeFlatOwnedBomFields<TFields>(
      input,
      schema,
      flatFields,
      rootPath,
    );
  }

  let output: Readonly<Record<string, BomValue>> = input;
  const errors: BomError[] = [];
  for (const field of schema.fields) {
    let lookup = getFieldPath(output, field.path);
    if (!lookup.present && field.defaultValue !== undefined) {
      const conflictingPrefix = findNonObjectFieldPathPrefix(output, field.path);
      if (conflictingPrefix !== undefined) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.fieldTypeMismatch,
            'VALIDATION',
            [...rootPath, ...conflictingPrefix],
            { expected: 'object', fieldId: field.fieldId },
          ),
        );
        continue;
      }
      output = setFieldPath(output, field.path, field.defaultValue);
      lookup = { present: true, value: field.defaultValue };
    }

    if (!lookup.present) {
      if (field.required) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.fieldRequired,
            'VALIDATION',
            [...rootPath, ...field.path],
            { fieldId: field.fieldId },
          ),
        );
      }
      continue;
    }

    const fieldResult = validateNormalizedFieldValue(
      lookup.value!,
      field,
      [...rootPath, ...field.path],
    );
    if (!fieldResult.ok) {
      errors.push(...fieldResult.errors);
      continue;
    }
    if (fieldResult.value !== lookup.value) {
      output = setFieldPath(output, field.path, fieldResult.value);
    }
  }

  if (!schema.allowAdditionalFields) {
    validateNoAdditionalFields(
      output,
      fieldTrieForSchema(schema),
      rootPath,
      errors,
    );
  }
  if (errors.length > 0) {
    return modelFailure(errors);
  }

  return modelSuccess(deepFreezeBomValue(output) as TFields);
}

function normalizeFlatOwnedBomFields<TFields extends BomFields>(
  input: Readonly<Record<string, BomValue>>,
  schema: BomSchema,
  fieldsByKey: ReadonlyMap<string, BomFieldSchema>,
  rootPath: readonly (string | number)[],
): BomModelResult<TFields> {
  if (!schema.allowAdditionalFields && hasExactFlatFieldKeys(input, schema)) {
    return normalizeExactFlatOwnedBomFields<TFields>(input, schema, rootPath);
  }

  let output = input;
  let presentFieldCount = 0;
  const errors: BomError[] = [];

  for (const [key, value] of Object.entries(input)) {
    const field = fieldsByKey.get(key);
    if (field === undefined) {
      if (!schema.allowAdditionalFields) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.fieldAdditional,
            'VALIDATION',
            [...rootPath, key],
          ),
        );
      }
      continue;
    }
    presentFieldCount += 1;
    const fieldResult = validateNormalizedFieldValue(
      value,
      field,
      rootPath,
      key,
    );
    if (!fieldResult.ok) {
      errors.push(...fieldResult.errors);
    } else if (fieldResult.value !== value) {
      output = { ...output, [key]: fieldResult.value };
    }
  }

  if (presentFieldCount !== schema.fields.length) {
    for (const field of schema.fields) {
      const key = field.path[0]!;
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        continue;
      }
      if (field.defaultValue !== undefined) {
        output = { ...output, [key]: field.defaultValue };
      } else if (field.required) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.fieldRequired,
            'VALIDATION',
            [...rootPath, key],
            { fieldId: field.fieldId },
          ),
        );
      }
    }
  }

  if (errors.length > 0) {
    return modelFailure(errors);
  }
  return modelSuccess(deepFreezeBomValue(output) as TFields);
}

function normalizeExactFlatOwnedBomFields<TFields extends BomFields>(
  input: Readonly<Record<string, BomValue>>,
  schema: BomSchema,
  rootPath: readonly (string | number)[],
): BomModelResult<TFields> {
  let output = input;
  const errors: BomError[] = [];

  for (const field of schema.fields) {
    const key = field.path[0]!;
    const value = input[key]!;
    const fieldResult = validateNormalizedFieldValue(value, field, rootPath, key);
    if (!fieldResult.ok) {
      errors.push(...fieldResult.errors);
    } else if (fieldResult.value !== value) {
      output = { ...output, [key]: fieldResult.value };
    }
  }

  if (errors.length > 0) {
    return modelFailure(errors);
  }
  return modelSuccess(deepFreezeBomValue(output) as TFields);
}

function hasExactFlatFieldKeys(
  input: Readonly<Record<string, BomValue>>,
  schema: BomSchema,
): boolean {
  if (Object.keys(input).length !== schema.fields.length) {
    return false;
  }
  return schema.fields.every((field) =>
    Object.prototype.hasOwnProperty.call(input, field.path[0]!),
  );
}

function flatFieldsForSchema(
  schema: BomSchema,
): ReadonlyMap<string, BomFieldSchema> | undefined {
  const cached = FLAT_FIELD_CACHE.get(schema);
  if (cached !== undefined) {
    return cached === null ? undefined : cached;
  }
  if (schema.fields.some((field) => field.path.length !== 1)) {
    FLAT_FIELD_CACHE.set(schema, null);
    return undefined;
  }
  const fields = new Map<string, BomFieldSchema>();
  for (const field of schema.fields) {
    fields.set(field.path[0]!, field);
  }
  FLAT_FIELD_CACHE.set(schema, fields);
  return fields;
}

function getFieldPath(
  root: Readonly<Record<string, BomValue>>,
  path: readonly string[],
): FieldPathLookup {
  let current: BomValue = root;
  for (const segment of path) {
    if (
      !isPlainBomObject(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { present: false };
    }
    current = current[segment]!;
  }
  return { present: true, value: current };
}

function findNonObjectFieldPathPrefix(
  root: Readonly<Record<string, BomValue>>,
  path: readonly string[],
): readonly string[] | undefined {
  let current: Readonly<Record<string, BomValue>> = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]!;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    const next = current[segment]!;
    if (!isPlainBomObject(next)) {
      return path.slice(0, index + 1);
    }
    current = next as Readonly<Record<string, BomValue>>;
  }
  return undefined;
}

function setFieldPath(
  root: Readonly<Record<string, BomValue>>,
  path: readonly string[],
  value: BomValue,
): Readonly<Record<string, BomValue>> {
  const ancestors: Readonly<Record<string, BomValue>>[] = [];
  let current: Readonly<Record<string, BomValue>> = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    ancestors.push(current);
    const next = current[path[index]!];
    current = isPlainBomObject(next) ? next : {};
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
  return updated;
}

function validateNoAdditionalFields(
  fields: Readonly<Record<string, BomValue>>,
  trieRoot: FieldTrieNode,
  rootPath: readonly (string | number)[],
  errors: BomError[],
): void {
  const stack: {
    readonly value: Readonly<Record<string, BomValue>>;
    readonly trie: FieldTrieNode;
    readonly path: readonly (string | number)[];
  }[] = [{ value: fields, trie: trieRoot, path: rootPath }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const [key, value] of Object.entries(current.value)) {
      const nextTrie = current.trie.children.get(key);
      if (nextTrie === undefined) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.fieldAdditional,
            'VALIDATION',
            [...current.path, key],
          ),
        );
        continue;
      }
      if (nextTrie.field !== undefined) {
        continue;
      }
      if (!isPlainBomObject(value)) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.fieldTypeMismatch,
            'VALIDATION',
            [...current.path, key],
            { expected: 'object' },
          ),
        );
        continue;
      }
      stack.push({
        value,
        trie: nextTrie,
        path: [...current.path, key],
      });
    }
  }
}

function fieldTrieForSchema(schema: BomSchema): FieldTrieNode {
  const cached = FIELD_TRIE_CACHE.get(schema);
  if (cached !== undefined) {
    return cached;
  }
  const created = createFieldTrie(schema.fields);
  FIELD_TRIE_CACHE.set(schema, created);
  return created;
}

function createFieldTrie(fields: readonly BomFieldSchema[]): FieldTrieNode {
  const root: FieldTrieNode = { children: new Map() };
  for (const field of fields) {
    let current = root;
    for (const segment of field.path) {
      let child = current.children.get(segment);
      if (child === undefined) {
        child = { children: new Map() };
        current.children.set(segment, child);
      }
      current = child;
    }
    current.field = field;
  }
  return root;
}
