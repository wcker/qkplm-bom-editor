import {
  BOM_MODEL_ERROR_CODES,
  modelError,
  modelFailure,
  modelSuccess,
  type BomModelResult,
} from './errors.js';
import {
  comparePositionKeys,
  validatePositionKey,
} from './position.js';

const FIRST_PRINTABLE_ASCII = 0x20;
const LAST_PRINTABLE_ASCII = 0x7e;
const POSITION_RADIX = BigInt(LAST_PRINTABLE_ASCII - FIRST_PRINTABLE_ASCII + 1);
const DEFAULT_MIDDLE_CHARACTER = String.fromCharCode(
  Math.floor((FIRST_PRINTABLE_ASCII + LAST_PRINTABLE_ASCII) / 2),
);

export interface PositionKeyGenerationOptions {
  readonly maxBytes?: number;
}

export function createPositionKeyBetween(
  left: string | null,
  right: string | null,
  options: PositionKeyGenerationOptions = {},
): BomModelResult<string> {
  const maxBytes = Math.min(128, options.maxBytes ?? 128);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    return positionFailure();
  }
  if (left !== null) {
    const validation = validatePositionKey(left, ['left'], maxBytes);
    if (!validation.ok) {
      return validation;
    }
  }
  if (right !== null) {
    const validation = validatePositionKey(right, ['right'], maxBytes);
    if (!validation.ok) {
      return validation;
    }
  }
  if (left !== null && right !== null && comparePositionKeys(left, right) >= 0) {
    return positionFailure();
  }

  let candidate: string | undefined;
  if (left === null && right === null) {
    candidate = DEFAULT_MIDDLE_CHARACTER;
  } else if (right === null) {
    candidate = appendMiddle(left!);
  } else if (left === null) {
    candidate = createBefore(right);
  } else {
    candidate = createBetween(left, right);
  }

  if (
    candidate === undefined ||
    candidate.length > maxBytes ||
    (left !== null && comparePositionKeys(left, candidate) >= 0) ||
    (right !== null && comparePositionKeys(candidate, right) >= 0)
  ) {
    return positionFailure();
  }
  return modelSuccess(candidate);
}

export function rebalancePositionKeys(
  count: number,
  options: PositionKeyGenerationOptions = {},
): BomModelResult<readonly string[]> {
  const maxBytes = Math.min(128, options.maxBytes ?? 128);
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    return positionFailure();
  }
  if (count === 0) {
    return modelSuccess(Object.freeze([]));
  }

  const requiredSlots = BigInt(count + 1);
  let width = 1;
  let capacity = POSITION_RADIX;
  while (capacity <= requiredSlots && width < maxBytes) {
    capacity *= POSITION_RADIX;
    width += 1;
  }
  if (capacity <= requiredSlots) {
    return modelFailure(
      modelError(
        BOM_MODEL_ERROR_CODES.positionKeyTooLong,
        'SECURITY_LIMIT',
        ['count'],
        { limit: maxBytes },
      ),
    );
  }

  const denominator = BigInt(count + 1);
  const output: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const numericPosition = (BigInt(index) * capacity) / denominator;
    output.push(encodeFixedWidthPosition(numericPosition, width));
  }
  return modelSuccess(Object.freeze(output));
}

function createBefore(right: string): string | undefined {
  const firstCode = right.charCodeAt(0);
  if (firstCode > FIRST_PRINTABLE_ASCII) {
    return String.fromCharCode(
      Math.floor((FIRST_PRINTABLE_ASCII - 1 + firstCode) / 2),
    );
  }
  return right.length > 1 ? right[0] : undefined;
}

function createBetween(left: string, right: string): string | undefined {
  let commonLength = 0;
  while (
    commonLength < left.length &&
    commonLength < right.length &&
    left.charCodeAt(commonLength) === right.charCodeAt(commonLength)
  ) {
    commonLength += 1;
  }

  if (commonLength === left.length) {
    const nextRightCode = right.charCodeAt(commonLength);
    if (nextRightCode > FIRST_PRINTABLE_ASCII) {
      const middle = Math.floor((FIRST_PRINTABLE_ASCII - 1 + nextRightCode) / 2);
      return left + String.fromCharCode(middle);
    }
    return right.length > commonLength + 1
      ? right.slice(0, commonLength + 1)
      : undefined;
  }

  const leftCode = left.charCodeAt(commonLength);
  const rightCode = right.charCodeAt(commonLength);
  if (rightCode - leftCode > 1) {
    return (
      left.slice(0, commonLength) +
      String.fromCharCode(Math.floor((leftCode + rightCode) / 2))
    );
  }
  return appendMiddle(left);
}

function appendMiddle(value: string): string {
  return value + DEFAULT_MIDDLE_CHARACTER;
}

function encodeFixedWidthPosition(value: bigint, width: number): string {
  const characters = new Array<string>(width);
  let remaining = value;
  for (let index = width - 1; index >= 0; index -= 1) {
    const digit = Number(remaining % POSITION_RADIX);
    characters[index] = String.fromCharCode(FIRST_PRINTABLE_ASCII + digit);
    remaining /= POSITION_RADIX;
  }
  return characters.join('');
}

function positionFailure<T>(): BomModelResult<T> {
  return modelFailure(
    modelError(BOM_MODEL_ERROR_CODES.positionKeyInvalid, 'DATA', ['positionKey']),
  );
}
