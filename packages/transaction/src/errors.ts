import type {
  BomError,
  BomErrorCategory,
  BomSafeContext,
} from '@bom-editor/contracts';
import type { BomTransactionResult } from './types.js';

export const BOM_TRANSACTION_ERROR_CODES = {
  configInvalid: 'BOM_TRANSACTION_CONFIG_INVALID',
  protocolMismatch: 'BOM_TRANSACTION_PROTOCOL_MISMATCH',
  documentMismatch: 'BOM_TRANSACTION_DOCUMENT_MISMATCH',
  generationMismatch: 'BOM_TRANSACTION_GENERATION_MISMATCH',
  baseRevisionMismatch: 'BOM_TRANSACTION_BASE_REVISION_MISMATCH',
  sourceRevisionInvalid: 'BOM_TRANSACTION_SOURCE_REVISION_INVALID',
  sourceRevisionLocalRevisionMismatch:
    'BOM_TRANSACTION_SOURCE_REVISION_LOCAL_REVISION_MISMATCH',
  sourceRevisionMismatch: 'BOM_TRANSACTION_SOURCE_REVISION_MISMATCH',
  metadataInvalid: 'BOM_TRANSACTION_METADATA_INVALID',
  commandUnsupported: 'BOM_TRANSACTION_COMMAND_UNSUPPORTED',
  operationUnsupported: 'BOM_TRANSACTION_OPERATION_UNSUPPORTED',
  nodeNotFound: 'BOM_TRANSACTION_NODE_NOT_FOUND',
  nodeAlreadyExists: 'BOM_TRANSACTION_NODE_ALREADY_EXISTS',
  placementInvalid: 'BOM_TRANSACTION_PLACEMENT_INVALID',
  fieldPathInvalid: 'BOM_TRANSACTION_FIELD_PATH_INVALID',
  fieldPreconditionFailed: 'BOM_TRANSACTION_FIELD_PRECONDITION_FAILED',
  partialStructureUnsupported: 'BOM_TRANSACTION_PARTIAL_STRUCTURE_UNSUPPORTED',
  historyEmpty: 'BOM_TRANSACTION_HISTORY_EMPTY',
  historySuffixEvicted: 'BOM_TRANSACTION_HISTORY_SUFFIX_EVICTED',
  historySuffixMismatch: 'BOM_TRANSACTION_HISTORY_SUFFIX_MISMATCH',
  historyReplayInvalid: 'BOM_TRANSACTION_HISTORY_REPLAY_INVALID',
  beforeApplyRejected: 'BOM_TRANSACTION_BEFORE_APPLY_REJECTED',
  beforeApplyFailed: 'BOM_TRANSACTION_BEFORE_APPLY_FAILED',
  reentrantExecute: 'BOM_TRANSACTION_REENTRANT_EXECUTE',
  internal: 'BOM_TRANSACTION_INTERNAL',
} as const;

export type BomTransactionErrorCode =
  (typeof BOM_TRANSACTION_ERROR_CODES)[keyof typeof BOM_TRANSACTION_ERROR_CODES];

export function transactionError(
  code: BomTransactionErrorCode,
  category: BomErrorCategory,
  context?: BomSafeContext,
): BomError {
  return Object.freeze({
    code,
    category,
    messageKey: `bom.transaction.${code.toLowerCase()}`,
    recoverable: category !== 'INTERNAL',
    ...(context === undefined ? {} : { safeContext: Object.freeze({ ...context }) }),
  });
}

export function transactionSuccess<T>(value: T): BomTransactionResult<T> {
  return Object.freeze({ ok: true, value });
}

export function transactionFailure<T>(
  error: BomError | readonly BomError[],
): BomTransactionResult<T> {
  return Object.freeze({
    ok: false,
    errors: Object.freeze(Array.isArray(error) ? [...error] : [error]),
  });
}

