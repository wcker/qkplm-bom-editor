import type {
  BomError,
  BomErrorCategory,
  BomSafeContext,
} from '@bom-editor/contracts';

export const BOM_MODEL_ERROR_CODES = {
  schemaInvalid: 'BOM_SCHEMA_INVALID',
  schemaDuplicateFieldId: 'BOM_SCHEMA_DUPLICATE_FIELD_ID',
  schemaDuplicateFieldPath: 'BOM_SCHEMA_DUPLICATE_FIELD_PATH',
  schemaPathPrefixConflict: 'BOM_SCHEMA_PATH_PREFIX_CONFLICT',
  schemaDangerousPath: 'BOM_SCHEMA_DANGEROUS_PATH',
  schemaInvalidConstraint: 'BOM_SCHEMA_INVALID_CONSTRAINT',
  schemaInvalidDefault: 'BOM_SCHEMA_INVALID_DEFAULT',
  schemaVersionMismatch: 'BOM_SCHEMA_VERSION_MISMATCH',
  valueNotWireSafe: 'BOM_VALUE_NOT_WIRE_SAFE',
  valueCycle: 'BOM_VALUE_CYCLE',
  valueDangerousKey: 'BOM_VALUE_DANGEROUS_KEY',
  numberNotFinite: 'BOM_NUMBER_NOT_FINITE',
  integerNotCanonical: 'BOM_INTEGER_NOT_CANONICAL',
  decimalNotCanonical: 'BOM_DECIMAL_NOT_CANONICAL',
  decimalNegativeZero: 'BOM_DECIMAL_NEGATIVE_ZERO',
  fieldRequired: 'BOM_FIELD_REQUIRED',
  fieldNullNotAllowed: 'BOM_FIELD_NULL_NOT_ALLOWED',
  fieldTypeMismatch: 'BOM_FIELD_TYPE_MISMATCH',
  fieldAdditional: 'BOM_FIELD_ADDITIONAL',
  stringTooLong: 'BOM_STRING_TOO_LONG',
  integerOutOfRange: 'BOM_INTEGER_OUT_OF_RANGE',
  decimalScaleExceeded: 'BOM_DECIMAL_SCALE_EXCEEDED',
  enumValueInvalid: 'BOM_ENUM_VALUE_INVALID',
  dateInvalid: 'BOM_DATE_INVALID',
  datetimeInvalid: 'BOM_DATETIME_INVALID',
  jsonTooLarge: 'BOM_JSON_TOO_LARGE',
  snapshotInvalid: 'BOM_SNAPSHOT_INVALID',
  snapshotDuplicateId: 'BOM_SNAPSHOT_DUPLICATE_ID',
  snapshotParentNotFound: 'BOM_SNAPSHOT_PARENT_NOT_FOUND',
  snapshotCycle: 'BOM_SNAPSHOT_CYCLE',
  snapshotRootsMismatch: 'BOM_SNAPSHOT_ROOTS_MISMATCH',
  snapshotRootOrderMismatch: 'BOM_SNAPSHOT_ROOT_ORDER_MISMATCH',
  positionCodecUnsupported: 'BOM_POSITION_CODEC_UNSUPPORTED',
  positionKeyInvalid: 'BOM_POSITION_KEY_INVALID',
  positionKeyDuplicate: 'BOM_POSITION_KEY_DUPLICATE',
  childrenStateInvalid: 'BOM_CHILDREN_STATE_INVALID',
  childCountMismatch: 'BOM_CHILD_COUNT_MISMATCH',
  materialRefRequired: 'BOM_MATERIAL_REF_REQUIRED',
  nodeLimitExceeded: 'BOM_NODE_LIMIT_EXCEEDED',
  depthLimitExceeded: 'BOM_DEPTH_LIMIT_EXCEEDED',
  valueDepthExceeded: 'BOM_VALUE_DEPTH_EXCEEDED',
  valueNodeLimitExceeded: 'BOM_VALUE_NODE_LIMIT_EXCEEDED',
  aggregateBytesExceeded: 'BOM_AGGREGATE_BYTES_EXCEEDED',
  positionKeyTooLong: 'BOM_POSITION_KEY_TOO_LONG',
  canonicalizationFailed: 'BOM_CANONICALIZATION_FAILED',
  diffDocumentMismatch: 'BOM_DIFF_DOCUMENT_MISMATCH',
  diffRequiresCompleteSnapshots: 'BOM_DIFF_REQUIRES_COMPLETE_SNAPSHOTS',
  diffNodeKindChanged: 'BOM_DIFF_NODE_KIND_CHANGED',
} as const;

export type BomModelErrorCode =
  (typeof BOM_MODEL_ERROR_CODES)[keyof typeof BOM_MODEL_ERROR_CODES];

export type BomModelResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly errors: readonly BomError[];
    };

export function modelSuccess<T>(value: T): BomModelResult<T> {
  return { ok: true, value };
}

export function modelFailure<T>(
  error: BomError | readonly BomError[],
): BomModelResult<T> {
  return {
    ok: false,
    errors: Object.freeze(Array.isArray(error) ? [...error] : [error]),
  };
}

export function modelError(
  code: BomModelErrorCode,
  category: BomErrorCategory,
  path: readonly (string | number)[],
  context?: BomSafeContext,
): BomError {
  const pathText = formatModelPath(path);
  const safeContext: Record<string, import('@bom-editor/contracts').BomValue> = {
    path: pathText,
    ...(context ?? {}),
  };

  return Object.freeze({
    code,
    category,
    messageKey: `bom.model.${code.toLowerCase()}`,
    messageParams: Object.freeze({ path: pathText }),
    recoverable: true,
    safeContext: Object.freeze(safeContext),
  });
}

export function formatModelPath(path: readonly (string | number)[]): string {
  if (path.length === 0) {
    return '$';
  }

  let result = '$';
  for (const segment of path) {
    if (typeof segment === 'number') {
      result += `[${segment}]`;
      continue;
    }
    result += /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)
      ? `.${segment}`
      : `[${JSON.stringify(segment)}]`;
  }
  return result;
}
