import type {
  BomError,
  BomFieldSchema,
  BomFieldType,
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
import {
  compareCanonicalIntegers,
  countUnicodeCodePoints,
  decimalScale,
  isDangerousBomKey,
  isPlainBomObject,
  normalizeBomValue,
  validateCanonicalInteger,
} from './value.js';
import { utf8ByteLength } from './utf8.js';

const DEFAULT_ROUNDING_MODES: ReadonlySet<string> = new Set([
  'up',
  'down',
  'ceiling',
  'floor',
  'halfUp',
  'halfDown',
  'halfEven',
  'unnecessary',
]);
const NORMALIZED_SCHEMAS = new WeakSet<object>();

export interface BomSchemaValidationOptions {
  readonly limits?: Partial<BomModelLimits>;
  readonly roundingModes?: readonly string[];
}

export function normalizeBomSchema(
  input: unknown,
  options: BomSchemaValidationOptions = {},
): BomModelResult<BomSchema> {
  if (
    options.limits === undefined &&
    options.roundingModes === undefined &&
    typeof input === 'object' &&
    input !== null &&
    NORMALIZED_SCHEMAS.has(input)
  ) {
    return modelSuccess(input as BomSchema);
  }
  const limits = resolveModelLimits(options.limits);
  const normalizedInput = normalizeBomValue(input, {
    limits,
    path: ['schema'],
  });
  if (!normalizedInput.ok) {
    return normalizedInput;
  }
  if (!isPlainBomObject(normalizedInput.value)) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', ['schema']),
    );
  }

  const source = normalizedInput.value;
  const errors: BomError[] = [];
  checkAllowedKeys(
    source,
    [
      'schemaVersion',
      'fields',
      'allowAdditionalFields',
      'recommendedDepth',
      'maximumDepth',
      'canonicalizationVersion',
      'contentHashAlgorithm',
    ],
    ['schema'],
    errors,
  );

  const schemaVersion = readNonEmptyString(
    source,
    'schemaVersion',
    ['schema', 'schemaVersion'],
    limits,
    errors,
  );
  const canonicalizationVersion = readNonEmptyString(
    source,
    'canonicalizationVersion',
    ['schema', 'canonicalizationVersion'],
    limits,
    errors,
  );
  const allowAdditionalFields = readBoolean(
    source,
    'allowAdditionalFields',
    ['schema', 'allowAdditionalFields'],
    errors,
  );
  const recommendedDepth = readPositiveSafeInteger(
    source,
    'recommendedDepth',
    ['schema', 'recommendedDepth'],
    errors,
  );
  const maximumDepth = readPositiveSafeInteger(
    source,
    'maximumDepth',
    ['schema', 'maximumDepth'],
    errors,
  );
  if (maximumDepth !== undefined && maximumDepth > limits.maxSchemaDepth) {
    errors.push(
      modelError(
        BOM_MODEL_ERROR_CODES.schemaInvalidConstraint,
        'CONFIG',
        ['schema', 'maximumDepth'],
        { limit: limits.maxSchemaDepth },
      ),
    );
  }
  if (
    recommendedDepth !== undefined &&
    maximumDepth !== undefined &&
    recommendedDepth > maximumDepth
  ) {
    errors.push(
      modelError(
        BOM_MODEL_ERROR_CODES.schemaInvalidConstraint,
        'CONFIG',
        ['schema', 'recommendedDepth'],
      ),
    );
  }

  if (source['contentHashAlgorithm'] !== 'SHA-256') {
    errors.push(
      modelError(
        BOM_MODEL_ERROR_CODES.schemaInvalidConstraint,
        'CONFIG',
        ['schema', 'contentHashAlgorithm'],
      ),
    );
  }

  const roundingModes = new Set(options.roundingModes ?? DEFAULT_ROUNDING_MODES);
  const fieldsValue = source['fields'];
  const fields: BomFieldSchema[] = [];
  if (!Array.isArray(fieldsValue)) {
    errors.push(
      modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', ['schema', 'fields']),
    );
  } else {
    for (let index = 0; index < fieldsValue.length; index += 1) {
      const field = normalizeFieldSchema(
        fieldsValue[index],
        index,
        limits,
        roundingModes,
      );
      if (field.ok) {
        fields.push(field.value);
      } else {
        errors.push(...field.errors);
      }
    }
  }

  validateFieldUniqueness(fields, errors);
  if (errors.length > 0) {
    return modelFailure(errors);
  }

  const schema: BomSchema = {
    schemaVersion: schemaVersion!,
    fields: Object.freeze(fields),
    allowAdditionalFields: allowAdditionalFields!,
    recommendedDepth: recommendedDepth!,
    maximumDepth: maximumDepth!,
    canonicalizationVersion: canonicalizationVersion!,
    contentHashAlgorithm: 'SHA-256',
  };
  const normalized = Object.freeze(schema);
  NORMALIZED_SCHEMAS.add(normalized);
  return modelSuccess(normalized);
}

export function validateBomSchema(
  input: unknown,
  options: BomSchemaValidationOptions = {},
): BomModelResult<true> {
  const result = normalizeBomSchema(input, options);
  return result.ok ? modelSuccess(true) : result;
}

export function normalizeFieldValue(
  input: unknown,
  field: BomFieldSchema,
  path: readonly (string | number)[],
  limits: Readonly<BomModelLimits> = resolveModelLimits(),
): BomModelResult<BomValue> {
  const normalized = normalizeBomValue(input, { limits, path });
  if (!normalized.ok) {
    return normalized;
  }
  return validateNormalizedFieldValue(
    normalized.value,
    field,
    path,
  );
}

export function validateNormalizedFieldValue(
  value: BomValue,
  field: BomFieldSchema,
  path: readonly (string | number)[],
  leafSegment?: string | number,
): BomModelResult<BomValue> {
  const normalized = { ok: true as const, value };
  if (value === null) {
    return field.nullable
      ? normalized
      : modelFailure(
          modelError(
            BOM_MODEL_ERROR_CODES.fieldNullNotAllowed,
            'VALIDATION',
            fieldValidationPath(path, leafSegment),
          ),
        );
  }

  switch (field.type.kind) {
    case 'string':
      if (typeof value !== 'string') {
        return fieldTypeFailure(path, field.type.kind, leafSegment);
      }
      if (
        field.type.maxLength !== undefined &&
        countUnicodeCodePoints(value) > field.type.maxLength
      ) {
        return modelFailure(
          modelError(
            BOM_MODEL_ERROR_CODES.stringTooLong,
            'VALIDATION',
            fieldValidationPath(path, leafSegment),
            { limit: field.type.maxLength },
          ),
        );
      }
      return normalized;
    case 'boolean':
      return typeof value === 'boolean'
        ? normalized
        : fieldTypeFailure(path, field.type.kind, leafSegment);
    case 'integer':
      return validateIntegerField(
        value,
        field.type,
        path,
        normalized,
        leafSegment,
      );
    case 'decimal':
      return validateDecimalField(
        value,
        field.type,
        path,
        normalized,
        leafSegment,
      );
    case 'date':
      if (typeof value !== 'string') {
        return fieldTypeFailure(path, field.type.kind, leafSegment);
      }
      return isStrictIsoDate(value)
        ? normalized
        : modelFailure(
            modelError(
              BOM_MODEL_ERROR_CODES.dateInvalid,
              'VALIDATION',
              fieldValidationPath(path, leafSegment),
            ),
          );
    case 'datetime':
      if (typeof value !== 'string') {
        return fieldTypeFailure(path, field.type.kind, leafSegment);
      }
      return isStrictIsoInstant(value)
        ? normalized
        : modelFailure(
            modelError(
              BOM_MODEL_ERROR_CODES.datetimeInvalid,
              'VALIDATION',
              fieldValidationPath(path, leafSegment),
            ),
          );
    case 'enum':
      if (typeof value !== 'string') {
        return fieldTypeFailure(path, field.type.kind, leafSegment);
      }
      return field.type.values.includes(value)
        ? normalized
        : modelFailure(
            modelError(
              BOM_MODEL_ERROR_CODES.enumValueInvalid,
              'VALIDATION',
              fieldValidationPath(path, leafSegment),
            ),
          );
    case 'json': {
      const canonicalBytes = canonicalJsonByteLength(value);
      return canonicalBytes <= field.type.maxBytes
        ? normalized
        : modelFailure(
            modelError(
              BOM_MODEL_ERROR_CODES.jsonTooLarge,
              'VALIDATION',
              fieldValidationPath(path, leafSegment),
              { limit: field.type.maxBytes },
            ),
          );
    }
  }
}

function normalizeFieldSchema(
  input: BomValue | undefined,
  index: number,
  limits: Readonly<BomModelLimits>,
  roundingModes: ReadonlySet<string>,
): BomModelResult<BomFieldSchema> {
  const path = ['schema', 'fields', index] as const;
  if (!isPlainBomObject(input)) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', path),
    );
  }

  const errors: BomError[] = [];
  checkAllowedKeys(
    input,
    ['fieldId', 'path', 'type', 'required', 'nullable', 'defaultValue'],
    path,
    errors,
  );
  const fieldId = readNonEmptyString(
    input,
    'fieldId',
    [...path, 'fieldId'],
    limits,
    errors,
  );
  const required = readBoolean(input, 'required', [...path, 'required'], errors);
  const nullable = readBoolean(input, 'nullable', [...path, 'nullable'], errors);
  const fieldPath = normalizeFieldPath(input['path'], [...path, 'path'], limits, errors);
  const type = normalizeFieldType(
    input['type'],
    [...path, 'type'],
    roundingModes,
    errors,
  );

  let defaultValue: BomValue | undefined;
  if (Object.prototype.hasOwnProperty.call(input, 'defaultValue') && type !== undefined) {
    const provisionalField: BomFieldSchema = {
      fieldId: fieldId ?? '',
      path: fieldPath ?? [],
      type,
      required: required ?? false,
      nullable: nullable ?? false,
    };
    const defaultResult = normalizeFieldValue(
      input['defaultValue'],
      provisionalField,
      [...path, 'defaultValue'],
      limits,
    );
    if (defaultResult.ok) {
      defaultValue = defaultResult.value;
    } else {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.schemaInvalidDefault,
          'CONFIG',
          [...path, 'defaultValue'],
          fieldId === undefined ? undefined : { fieldId },
        ),
      );
    }
  }

  if (errors.length > 0) {
    return modelFailure(errors);
  }
  const field: BomFieldSchema = {
    fieldId: fieldId!,
    path: fieldPath!,
    type: Object.freeze(type!),
    required: required!,
    nullable: nullable!,
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
  return modelSuccess(Object.freeze(field));
}

function normalizeFieldPath(
  input: BomValue | undefined,
  path: readonly (string | number)[],
  limits: Readonly<BomModelLimits>,
  errors: BomError[],
): readonly string[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push(modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', path));
    return undefined;
  }
  const output: string[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const segment = input[index];
    if (
      typeof segment !== 'string' ||
      segment.length === 0 ||
      utf8ByteLength(segment) > limits.maxIdentifierBytes
    ) {
      errors.push(
        modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', [...path, index]),
      );
      continue;
    }
    if (isDangerousBomKey(segment)) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.schemaDangerousPath,
          'CONFIG',
          [...path, index],
        ),
      );
      continue;
    }
    output.push(segment);
  }
  return output.length === input.length ? Object.freeze(output) : undefined;
}

function normalizeFieldType(
  input: BomValue | undefined,
  path: readonly (string | number)[],
  roundingModes: ReadonlySet<string>,
  errors: BomError[],
): BomFieldType | undefined {
  if (!isPlainBomObject(input) || typeof input['kind'] !== 'string') {
    errors.push(modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', path));
    return undefined;
  }

  const kind = input['kind'];
  switch (kind) {
    case 'string': {
      checkAllowedKeys(input, ['kind', 'maxLength'], path, errors);
      const maxLength = readOptionalNonNegativeSafeInteger(
        input,
        'maxLength',
        [...path, 'maxLength'],
        errors,
      );
      return maxLength === undefined && input['maxLength'] !== undefined
        ? undefined
        : { kind, ...(maxLength === undefined ? {} : { maxLength }) };
    }
    case 'boolean':
      checkAllowedKeys(input, ['kind'], path, errors);
      return { kind };
    case 'integer': {
      checkAllowedKeys(input, ['kind', 'min', 'max'], path, errors);
      const min = readOptionalCanonicalInteger(input, 'min', [...path, 'min'], errors);
      const max = readOptionalCanonicalInteger(input, 'max', [...path, 'max'], errors);
      if (min !== undefined && max !== undefined && compareCanonicalIntegers(min, max) > 0) {
        errors.push(
          modelError(BOM_MODEL_ERROR_CODES.schemaInvalidConstraint, 'CONFIG', path),
        );
      }
      return {
        kind,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      };
    }
    case 'decimal': {
      checkAllowedKeys(
        input,
        ['kind', 'maxScale', 'roundingMode', 'unitFamily'],
        path,
        errors,
      );
      const maxScale = readOptionalNonNegativeSafeInteger(
        input,
        'maxScale',
        [...path, 'maxScale'],
        errors,
      );
      const roundingMode = input['roundingMode'];
      if (typeof roundingMode !== 'string' || !roundingModes.has(roundingMode)) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.schemaInvalidConstraint,
            'CONFIG',
            [...path, 'roundingMode'],
          ),
        );
      }
      const unitFamily = input['unitFamily'];
      if (unitFamily !== undefined && (typeof unitFamily !== 'string' || unitFamily.length === 0)) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.schemaInvalidConstraint,
            'CONFIG',
            [...path, 'unitFamily'],
          ),
        );
      }
      return {
        kind,
        ...(maxScale === undefined ? {} : { maxScale }),
        roundingMode: typeof roundingMode === 'string' ? roundingMode : '',
        ...(typeof unitFamily === 'string' ? { unitFamily } : {}),
      };
    }
    case 'date':
      checkAllowedKeys(input, ['kind', 'representation'], path, errors);
      if (input['representation'] !== 'iso-date') {
        errors.push(
          modelError(BOM_MODEL_ERROR_CODES.schemaInvalidConstraint, 'CONFIG', path),
        );
      }
      return { kind, representation: 'iso-date' };
    case 'datetime':
      checkAllowedKeys(input, ['kind', 'representation'], path, errors);
      if (input['representation'] !== 'iso-instant') {
        errors.push(
          modelError(BOM_MODEL_ERROR_CODES.schemaInvalidConstraint, 'CONFIG', path),
        );
      }
      return { kind, representation: 'iso-instant' };
    case 'enum': {
      checkAllowedKeys(input, ['kind', 'values'], path, errors);
      const values = input['values'];
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        values.some((value) => typeof value !== 'string')
      ) {
        errors.push(modelError(BOM_MODEL_ERROR_CODES.schemaInvalidConstraint, 'CONFIG', path));
        return undefined;
      }
      const stringValues = values as readonly string[];
      if (new Set(stringValues).size !== stringValues.length) {
        errors.push(modelError(BOM_MODEL_ERROR_CODES.schemaInvalidConstraint, 'CONFIG', path));
      }
      return { kind, values: Object.freeze([...stringValues]) };
    }
    case 'json': {
      checkAllowedKeys(input, ['kind', 'maxBytes'], path, errors);
      const maxBytes = readPositiveSafeInteger(input, 'maxBytes', [...path, 'maxBytes'], errors);
      return maxBytes === undefined ? undefined : { kind, maxBytes };
    }
    default:
      errors.push(modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', path));
      return undefined;
  }
}

function validateFieldUniqueness(fields: readonly BomFieldSchema[], errors: BomError[]): void {
  const fieldIds = new Set<string>();
  const paths = new Map<string, BomFieldSchema>();
  for (const field of fields) {
    if (fieldIds.has(field.fieldId)) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.schemaDuplicateFieldId,
          'CONFIG',
          ['schema', 'fields'],
          { fieldId: field.fieldId },
        ),
      );
    }
    fieldIds.add(field.fieldId);

    const pathKey = field.path.map((segment) => `${segment.length}:${segment}`).join('/');
    if (paths.has(pathKey)) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.schemaDuplicateFieldPath,
          'CONFIG',
          ['schema', 'fields'],
          { fieldId: field.fieldId },
        ),
      );
    }
    paths.set(pathKey, field);
  }

  const sortedPaths = [...paths.values()].sort((left, right) => left.path.length - right.path.length);
  for (let index = 0; index < sortedPaths.length; index += 1) {
    const candidate = sortedPaths[index]!;
    for (let otherIndex = index + 1; otherIndex < sortedPaths.length; otherIndex += 1) {
      const other = sortedPaths[otherIndex]!;
      if (
        candidate.path.length < other.path.length &&
        candidate.path.every((segment, pathIndex) => other.path[pathIndex] === segment)
      ) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.schemaPathPrefixConflict,
            'CONFIG',
            ['schema', 'fields'],
            { fieldId: candidate.fieldId },
          ),
        );
      }
    }
  }
}

function validateIntegerField(
  value: BomValue,
  type: Extract<BomFieldType, { readonly kind: 'integer' }>,
  path: readonly (string | number)[],
  normalized: BomModelResult<BomValue> & { readonly ok: true },
  leafSegment?: string | number,
): BomModelResult<BomValue> {
  let canonical: string;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      return modelFailure(
        modelError(
          BOM_MODEL_ERROR_CODES.integerNotCanonical,
          'VALIDATION',
          fieldValidationPath(path, leafSegment),
        ),
      );
    }
    canonical = String(value);
  } else if (
    isPlainBomObject(value) &&
    value['$type'] === 'integer' &&
    typeof value['value'] === 'string'
  ) {
    canonical = value['value'];
  } else {
    return fieldTypeFailure(path, type.kind, leafSegment);
  }

  if (
    (type.min !== undefined && compareCanonicalIntegers(canonical, type.min) < 0) ||
    (type.max !== undefined && compareCanonicalIntegers(canonical, type.max) > 0)
  ) {
    return modelFailure(
      modelError(
        BOM_MODEL_ERROR_CODES.integerOutOfRange,
        'VALIDATION',
        fieldValidationPath(path, leafSegment),
      ),
    );
  }
  return normalized;
}

function validateDecimalField(
  value: BomValue,
  type: Extract<BomFieldType, { readonly kind: 'decimal' }>,
  path: readonly (string | number)[],
  normalized: BomModelResult<BomValue> & { readonly ok: true },
  leafSegment?: string | number,
): BomModelResult<BomValue> {
  if (
    !isPlainBomObject(value) ||
    value['$type'] !== 'decimal' ||
    typeof value['value'] !== 'string'
  ) {
    return fieldTypeFailure(path, type.kind, leafSegment);
  }
  if (type.maxScale !== undefined && decimalScale(value['value']) > type.maxScale) {
    return modelFailure(
      modelError(
        BOM_MODEL_ERROR_CODES.decimalScaleExceeded,
        'VALIDATION',
        fieldValidationPath(path, leafSegment),
        { limit: type.maxScale },
      ),
    );
  }
  return normalized;
}

function fieldTypeFailure(
  path: readonly (string | number)[],
  expected: BomFieldType['kind'],
  leafSegment?: string | number,
): BomModelResult<BomValue> {
  return modelFailure(
    modelError(
      BOM_MODEL_ERROR_CODES.fieldTypeMismatch,
      'VALIDATION',
      fieldValidationPath(path, leafSegment),
      { expected },
    ),
  );
}

function fieldValidationPath(
  path: readonly (string | number)[],
  leafSegment: string | number | undefined,
): readonly (string | number)[] {
  return leafSegment === undefined ? path : [...path, leafSegment];
}

function checkAllowedKeys(
  input: Readonly<Record<string, BomValue>>,
  allowed: readonly string[],
  path: readonly (string | number)[],
  errors: BomError[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!allowedSet.has(key)) {
      errors.push(
        modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', [...path, key]),
      );
    }
  }
}

function readNonEmptyString(
  input: Readonly<Record<string, BomValue>>,
  key: string,
  path: readonly (string | number)[],
  limits: Readonly<BomModelLimits>,
  errors: BomError[],
): string | undefined {
  const value = input[key];
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    utf8ByteLength(value) > limits.maxIdentifierBytes
  ) {
    errors.push(modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', path));
    return undefined;
  }
  return value;
}

function readBoolean(
  input: Readonly<Record<string, BomValue>>,
  key: string,
  path: readonly (string | number)[],
  errors: BomError[],
): boolean | undefined {
  const value = input[key];
  if (typeof value !== 'boolean') {
    errors.push(modelError(BOM_MODEL_ERROR_CODES.schemaInvalid, 'CONFIG', path));
    return undefined;
  }
  return value;
}

function readPositiveSafeInteger(
  input: Readonly<Record<string, BomValue>>,
  key: string,
  path: readonly (string | number)[],
  errors: BomError[],
): number | undefined {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    errors.push(
      modelError(BOM_MODEL_ERROR_CODES.schemaInvalidConstraint, 'CONFIG', path),
    );
    return undefined;
  }
  return value;
}

function readOptionalNonNegativeSafeInteger(
  input: Readonly<Record<string, BomValue>>,
  key: string,
  path: readonly (string | number)[],
  errors: BomError[],
): number | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(
      modelError(BOM_MODEL_ERROR_CODES.schemaInvalidConstraint, 'CONFIG', path),
    );
    return undefined;
  }
  return value;
}

function readOptionalCanonicalInteger(
  input: Readonly<Record<string, BomValue>>,
  key: string,
  path: readonly (string | number)[],
  errors: BomError[],
): string | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !validateCanonicalInteger(value)) {
    errors.push(
      modelError(BOM_MODEL_ERROR_CODES.schemaInvalidConstraint, 'CONFIG', path),
    );
    return undefined;
  }
  return value;
}

function isStrictIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }
  return isGregorianDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isStrictIsoInstant(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/.exec(value);
  if (match === null) {
    return false;
  }
  return (
    isGregorianDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
    Number(match[4]) <= 23 &&
    Number(match[5]) <= 59 &&
    Number(match[6]) <= 59
  );
}

function isGregorianDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}

function canonicalJsonByteLength(value: BomValue): number {
  let bytes = 0;
  const stack: BomValue[] = [value];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === null) {
      bytes += 4;
    } else if (typeof current === 'boolean') {
      bytes += current ? 4 : 5;
    } else if (typeof current === 'number') {
      bytes += utf8ByteLength(String(current));
    } else if (typeof current === 'string') {
      bytes += utf8ByteLength(JSON.stringify(current));
    } else if (Array.isArray(current)) {
      bytes += 2 + Math.max(0, current.length - 1);
      for (const item of current) {
        stack.push(item);
      }
    } else {
      const entries = Object.entries(current);
      bytes += 2 + Math.max(0, entries.length - 1);
      for (const [key, item] of entries) {
        bytes += utf8ByteLength(JSON.stringify(key)) + 1;
        stack.push(item);
      }
    }
  }
  return bytes;
}
