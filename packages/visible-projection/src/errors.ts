export const VISIBLE_PROJECTION_ERROR_CODES = Object.freeze({
  invalidArgument: 'BOM_VISIBLE_PROJECTION_INVALID_ARGUMENT',
  invalidSnapshot: 'BOM_VISIBLE_PROJECTION_INVALID_SNAPSHOT',
  invalidIndexes: 'BOM_VISIBLE_PROJECTION_INVALID_INDEXES',
  indexBuildFailed: 'BOM_VISIBLE_PROJECTION_INDEX_BUILD_FAILED',
  unknownOccurrence: 'BOM_VISIBLE_PROJECTION_UNKNOWN_OCCURRENCE',
  pixelRangeExceeded: 'BOM_VISIBLE_PROJECTION_PIXEL_RANGE_EXCEEDED',
  invariantViolation: 'BOM_VISIBLE_PROJECTION_INVARIANT_VIOLATION',
} as const);

export type VisibleProjectionErrorCode =
  (typeof VISIBLE_PROJECTION_ERROR_CODES)[keyof typeof VISIBLE_PROJECTION_ERROR_CODES];

export type VisibleProjectionErrorDetail = string | number | boolean | null;

export interface VisibleProjectionError {
  readonly code: VisibleProjectionErrorCode;
  readonly path: readonly (string | number)[];
  readonly details?: Readonly<Record<string, VisibleProjectionErrorDetail>>;
}

export type VisibleProjectionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly VisibleProjectionError[] };

export function projectionSuccess<T>(value: T): VisibleProjectionResult<T> {
  return Object.freeze({ ok: true, value });
}

export function projectionFailure<T = never>(
  code: VisibleProjectionErrorCode,
  path: readonly (string | number)[],
  details?: Readonly<Record<string, VisibleProjectionErrorDetail>>,
): VisibleProjectionResult<T> {
  const error: VisibleProjectionError = Object.freeze({
    code,
    path: Object.freeze([...path]),
    ...(details === undefined
      ? {}
      : { details: Object.freeze({ ...details }) }),
  });
  return Object.freeze({ ok: false, errors: Object.freeze([error]) });
}
