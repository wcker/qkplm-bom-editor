import type {
  BomError,
  BomErrorCategory,
  BomResult,
  BomSafeContext,
} from '@bom-editor/contracts';

export const BOM_DATASOURCE_ERROR_CODES = Object.freeze({
  capabilityMismatch: 'BOM_DATASOURCE_CAPABILITY_MISMATCH',
  aborted: 'BOM_DATASOURCE_ABORTED',
  readOnly: 'BOM_DATASOURCE_READ_ONLY',
  documentMismatch: 'BOM_DATASOURCE_DOCUMENT_MISMATCH',
  sourceRevisionConflict: 'BOM_DATASOURCE_SOURCE_REVISION_CONFLICT',
  idempotencyRequired: 'BOM_DATASOURCE_IDEMPOTENCY_REQUIRED',
  idempotencyReused: 'BOM_DATASOURCE_IDEMPOTENCY_REUSED',
  coordinatorConfigInvalid: 'BOM_DATASOURCE_COORDINATOR_CONFIG_INVALID',
  coordinatorContextMismatch: 'BOM_DATASOURCE_COORDINATOR_CONTEXT_MISMATCH',
  coordinatorTransactionInvalid: 'BOM_DATASOURCE_COORDINATOR_TRANSACTION_INVALID',
  coordinatorTransactionDuplicate: 'BOM_DATASOURCE_COORDINATOR_TRANSACTION_DUPLICATE',
  coordinatorDependencyMismatch: 'BOM_DATASOURCE_COORDINATOR_DEPENDENCY_MISMATCH',
  coordinatorSuspended: 'BOM_DATASOURCE_COORDINATOR_SUSPENDED',
  commitIndeterminate: 'BOM_DATASOURCE_COMMIT_INDETERMINATE',
  protocolViolation: 'BOM_DATASOURCE_PROTOCOL_VIOLATION',
  recoveryFailed: 'BOM_DATASOURCE_RECOVERY_FAILED',
  externalFailure: 'BOM_DATASOURCE_EXTERNAL_FAILURE',
  destroyed: 'BOM_DATASOURCE_DESTROYED',
  internal: 'BOM_DATASOURCE_INTERNAL',
} as const);

export type BomDataSourceErrorCode =
  (typeof BOM_DATASOURCE_ERROR_CODES)[keyof typeof BOM_DATASOURCE_ERROR_CODES];

export function dataSourceError(
  code: BomDataSourceErrorCode,
  category: BomErrorCategory,
  context?: BomSafeContext,
): BomError {
  return Object.freeze({
    code,
    category,
    messageKey: 'bom.datasource.' + code.toLowerCase(),
    recoverable: category !== 'INTERNAL',
    ...(context === undefined
      ? {}
      : { safeContext: Object.freeze({ ...context }) }),
  });
}

export function dataSourceSuccess<T>(value: T): BomResult<T> {
  return Object.freeze({ ok: true, value });
}

export function dataSourceFailure<T>(error: BomError): BomResult<T> {
  return Object.freeze({ ok: false, error });
}

export class BomDataSourceException extends Error {
  readonly error: BomError;

  public constructor(error: BomError) {
    super(error.code);
    this.name = 'BomDataSourceException';
    this.error = error;
  }
}
