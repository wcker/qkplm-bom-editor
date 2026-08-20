import { BOM_TRANSACTION_ERROR_CODES } from './errors.js';

export type ResultLike<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly unknown[] };

/** Converts a model/transaction invariant violation into the engine's internal failure. */
export function requireResultValue<T>(result: ResultLike<T>): T {
  if (!result.ok) {
    throw new Error(BOM_TRANSACTION_ERROR_CODES.internal);
  }
  return result.value;
}
