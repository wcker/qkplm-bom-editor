import {
  BOM_MODEL_ERROR_CODES,
  modelError,
  modelFailure,
  modelSuccess,
  type BomModelResult,
} from './errors.js';

export const LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION =
  'lexicographic-ascii-v1' as const;

const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7e]+$/;

export function validatePositionKey(
  value: unknown,
  path: readonly (string | number)[],
  maxBytes = 128,
): BomModelResult<string> {
  if (typeof value !== 'string' || !PRINTABLE_ASCII_PATTERN.test(value)) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.positionKeyInvalid, 'DATA', path),
    );
  }
  if (value.length > Math.min(128, maxBytes)) {
    return modelFailure(
      modelError(
        BOM_MODEL_ERROR_CODES.positionKeyTooLong,
        'SECURITY_LIMIT',
        path,
        { limit: Math.min(128, maxBytes) },
      ),
    );
  }
  return modelSuccess(value);
}

export function comparePositionKeys(left: string, right: string): number {
  const commonLength = Math.min(left.length, right.length);
  for (let index = 0; index < commonLength; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}
