import type { BomDecimal, BomInteger, BomValue } from '@bom-editor/contracts';
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
import { utf8ByteLength } from './utf8.js';

const INTEGER_PATTERN = /^-?(0|[1-9][0-9]*)$/;
const DECIMAL_PATTERN = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const ARRAY_INDEX_PATTERN = /^(0|[1-9][0-9]*)$/;

export const DANGEROUS_BOM_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

interface NormalizeState {
  readonly limits: Readonly<BomModelLimits>;
  readonly ancestors: WeakSet<object>;
  readonly path: (string | number)[];
  readonly keyMetrics: Map<string, Readonly<KeyMetric>>;
  failure: import('@bom-editor/contracts').BomError | readonly import('@bom-editor/contracts').BomError[] | undefined;
  sourceDeeplyFrozen: boolean;
  valueNodes: number;
  aggregateBytes: number;
}

interface KeyMetric {
  readonly unicodeScalar: boolean;
  readonly bytes: number;
}

export interface NormalizeBomValueOptions {
  readonly limits?: Partial<BomModelLimits>;
  readonly path?: readonly (string | number)[];
}

export interface NormalizeBomValueMetadata {
  readonly result: BomModelResult<BomValue>;
  readonly sourceDeeplyFrozen: boolean;
}

export function isDangerousBomKey(key: string): boolean {
  return DANGEROUS_BOM_KEYS.has(key);
}

export function isUnicodeScalarString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function normalizeBomValue(
  input: unknown,
  options: NormalizeBomValueOptions = {},
): BomModelResult<BomValue> {
  return normalizeBomValueWithMetadata(input, options).result;
}

export function normalizeBomValueWithMetadata(
  input: unknown,
  options: NormalizeBomValueOptions = {},
): NormalizeBomValueMetadata {
  const limits = resolveModelLimits(options.limits);
  const state: NormalizeState = {
    limits,
    ancestors: new WeakSet(),
    path: [...(options.path ?? [])],
    keyMetrics: new Map(),
    failure: undefined,
    sourceDeeplyFrozen: true,
    valueNodes: 0,
    aggregateBytes: 0,
  };
  const value = normalizeValue(input, 0, state);
  const result: BomModelResult<BomValue> = value === undefined
    ? modelFailure(state.failure ?? modelError(
      BOM_MODEL_ERROR_CODES.valueNotWireSafe,
      'DATA',
      state.path,
    ))
    : modelSuccess(value);
  return Object.freeze({ result, sourceDeeplyFrozen: state.sourceDeeplyFrozen });
}

export function validateCanonicalInteger(value: string): boolean {
  return INTEGER_PATTERN.test(value) && value !== '-0';
}

export function validateCanonicalDecimal(value: string): boolean {
  if (!DECIMAL_PATTERN.test(value)) {
    return false;
  }
  if (!value.startsWith('-')) {
    return true;
  }
  const unsigned = value.slice(1).replace('.', '');
  return /[1-9]/.test(unsigned);
}

export function decimalScale(value: string): number {
  const decimalPoint = value.indexOf('.');
  return decimalPoint === -1 ? 0 : value.length - decimalPoint - 1;
}

export function compareCanonicalIntegers(left: string, right: string): number {
  const leftNegative = left.startsWith('-');
  const rightNegative = right.startsWith('-');
  if (leftNegative !== rightNegative) {
    return leftNegative ? -1 : 1;
  }

  const leftDigits = leftNegative ? left.slice(1) : left;
  const rightDigits = rightNegative ? right.slice(1) : right;
  const lengthComparison = leftDigits.length - rightDigits.length;
  if (lengthComparison !== 0) {
    return leftNegative ? -lengthComparison : lengthComparison;
  }
  if (leftDigits === rightDigits) {
    return 0;
  }
  const lexicalComparison = leftDigits < rightDigits ? -1 : 1;
  return leftNegative ? -lexicalComparison : lexicalComparison;
}

export function countUnicodeCodePoints(value: string): number {
  let count = 0;
  for (const ignored of value) {
    void ignored;
    count += 1;
  }
  return count;
}

export function isPlainBomObject(
  input: unknown,
): input is Readonly<Record<string, unknown>> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

const DEEPLY_FROZEN_VALUES = new WeakSet<object>();

export function deepFreezeBomValue<T extends BomValue>(value: T): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (DEEPLY_FROZEN_VALUES.has(value)) {
    return value;
  }

  const stack: object[] = [value];
  const visited = new WeakSet<object>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const child of Object.values(current)) {
      if (typeof child === 'object' && child !== null) {
        stack.push(child);
      }
    }
    Object.freeze(current);
    DEEPLY_FROZEN_VALUES.add(current);
  }
  return value;
}

function normalizeValue(
  input: unknown,
  depth: number,
  state: NormalizeState,
): BomValue | undefined {
  state.valueNodes += 1;
  if (state.valueNodes > state.limits.maxValueNodes) {
    return failNormalization(
      state,
      modelError(
        BOM_MODEL_ERROR_CODES.valueNodeLimitExceeded,
        'SECURITY_LIMIT',
        state.path,
        { limit: state.limits.maxValueNodes },
      ),
    );
  }
  if (depth > state.limits.maxValueDepth) {
    return failNormalization(
      state,
      modelError(
        BOM_MODEL_ERROR_CODES.valueDepthExceeded,
        'SECURITY_LIMIT',
        state.path,
        { limit: state.limits.maxValueDepth },
      ),
    );
  }

  if (input === null) {
    return consumeBytesAndReturn(null, 1, state);
  }
  if (typeof input === 'boolean') {
    return consumeBytesAndReturn(input, 1, state);
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return failNormalization(
        state,
        modelError(BOM_MODEL_ERROR_CODES.numberNotFinite, 'DATA', state.path),
      );
    }
    return consumeBytesAndReturn(Object.is(input, -0) ? 0 : input, 8, state);
  }
  if (typeof input === 'string') {
    if (!isUnicodeScalarString(input)) {
      return failNormalization(
        state,
        modelError(BOM_MODEL_ERROR_CODES.valueNotWireSafe, 'DATA', state.path),
      );
    }
    return consumeBytesAndReturn(input, utf8ByteLength(input), state);
  }
  if (typeof input !== 'object') {
    return failNormalization(
      state,
      modelError(BOM_MODEL_ERROR_CODES.valueNotWireSafe, 'DATA', state.path),
    );
  }

  const objectInput = input;
  if (!Object.isFrozen(objectInput)) {
    state.sourceDeeplyFrozen = false;
  }
  if (state.ancestors.has(objectInput)) {
    return failNormalization(
      state,
      modelError(BOM_MODEL_ERROR_CODES.valueCycle, 'DATA', state.path),
    );
  }
  state.ancestors.add(objectInput);
  try {
    if (Array.isArray(objectInput)) {
      return normalizeArray(objectInput, depth, state);
    }
    return normalizeObject(objectInput, depth, state);
  } catch {
    return failNormalization(
      state,
      modelError(BOM_MODEL_ERROR_CODES.valueNotWireSafe, 'DATA', state.path),
    );
  } finally {
    state.ancestors.delete(objectInput);
  }
}

function normalizeArray(
  input: readonly unknown[],
  depth: number,
  state: NormalizeState,
): BomValue | undefined {
  const keys = Reflect.ownKeys(input);
  for (const key of keys) {
    if (key === 'length') {
      continue;
    }
    if (typeof key !== 'string' || !ARRAY_INDEX_PATTERN.test(key)) {
      return failNormalization(
        state,
        modelError(BOM_MODEL_ERROR_CODES.valueNotWireSafe, 'DATA', state.path),
      );
    }
    const numericKey = Number(key);
    if (!Number.isSafeInteger(numericKey) || numericKey >= input.length) {
      return failNormalization(
        state,
        modelError(BOM_MODEL_ERROR_CODES.valueNotWireSafe, 'DATA', state.path),
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failNormalization(
        state,
        modelError(
          BOM_MODEL_ERROR_CODES.valueNotWireSafe,
          'DATA',
          [...state.path, numericKey],
        ),
      );
    }
  }

  const canReuseInput = Object.isFrozen(input);
  let output: BomValue[] | undefined = canReuseInput ? undefined : [];
  for (let index = 0; index < input.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(input, index)) {
      return failNormalization(
        state,
        modelError(
          BOM_MODEL_ERROR_CODES.valueNotWireSafe,
          'DATA',
          [...state.path, index],
        ),
      );
    }
    const normalized = normalizeChild(input[index], index, depth + 1, state);
    if (normalized === undefined) {
      return undefined;
    }
    if (output === undefined && !Object.is(normalized, input[index])) {
      output = [];
      for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
        output.push(input[previousIndex] as BomValue);
      }
    }
    output?.push(normalized);
  }
  return consumeBytesAndReturn(
    output === undefined
      ? reuseDeeplyFrozenValue(input as BomValue)
      : Object.freeze(output),
    2,
    state,
  );
}

function normalizeObject(
  input: object,
  depth: number,
  state: NormalizeState,
): BomValue | undefined {
  if (!isPlainBomObject(input)) {
    return failNormalization(
      state,
      modelError(BOM_MODEL_ERROR_CODES.valueNotWireSafe, 'DATA', state.path),
    );
  }

  const canReuseInput = Object.isFrozen(input);
  let output: Record<string, BomValue> | undefined = canReuseInput ? undefined : {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') {
      return failNormalization(
        state,
        modelError(BOM_MODEL_ERROR_CODES.valueNotWireSafe, 'DATA', state.path),
      );
    }
    const keyMetric = measureKey(key, state);
    if (!keyMetric.unicodeScalar) {
      return failNormalization(
        state,
        modelError(
          BOM_MODEL_ERROR_CODES.valueNotWireSafe,
          'DATA',
          [...state.path, key],
        ),
      );
    }
    if (isDangerousBomKey(key)) {
      return failNormalization(
        state,
        modelError(
          BOM_MODEL_ERROR_CODES.valueDangerousKey,
          'DATA',
          [...state.path, key],
        ),
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failNormalization(
        state,
        modelError(
          BOM_MODEL_ERROR_CODES.valueNotWireSafe,
          'DATA',
          [...state.path, key],
        ),
      );
    }
    let normalized: BomValue | undefined;
    state.path.push(key);
    try {
      const byteResult = consumeBytes(keyMetric.bytes, state);
      if (byteResult !== undefined) {
        return failNormalization(state, byteResult);
      }
      normalized = normalizeValue(descriptor.value, depth + 1, state);
    } finally {
      state.path.pop();
    }
    if (normalized === undefined) {
      return undefined;
    }
    if (output === undefined && !Object.is(normalized, descriptor.value)) {
      output = {};
      for (const previousKey of Object.keys(input)) {
        if (previousKey === key) {
          break;
        }
        output[previousKey] = (
          Object.getOwnPropertyDescriptor(input, previousKey)!.value as BomValue
        );
      }
    }
    if (output !== undefined) {
      output[key] = normalized;
    }
  }

  const normalizedObject = output ?? input as Record<string, BomValue>;
  const taggedResult = validateTaggedNumber(normalizedObject, state.path);
  if (!taggedResult.ok) {
    state.failure = taggedResult.errors;
    return undefined;
  }
  return consumeBytesAndReturn(
    output === undefined
      ? reuseDeeplyFrozenValue(taggedResult.value)
      : Object.freeze(taggedResult.value),
    2,
    state,
  );
}

function validateTaggedNumber(
  value: Readonly<Record<string, BomValue>>,
  path: readonly (string | number)[],
): BomModelResult<BomValue> {
  const tag = value['$type'];
  if (tag !== 'integer' && tag !== 'decimal') {
    return modelSuccess(value);
  }

  const keys = Object.keys(value);
  if (tag === 'integer') {
    if (keys.length !== 2 || !keys.includes('value')) {
      return modelFailure(
        modelError(BOM_MODEL_ERROR_CODES.integerNotCanonical, 'DATA', path),
      );
    }
    const integerValue = value['value'];
    if (typeof integerValue !== 'string' || !validateCanonicalInteger(integerValue)) {
      return modelFailure(
        modelError(BOM_MODEL_ERROR_CODES.integerNotCanonical, 'DATA', [...path, 'value']),
      );
    }
    return modelSuccess(value as unknown as BomInteger);
  }

  if (keys.length < 2 || keys.length > 3 || !keys.includes('value')) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.decimalNotCanonical, 'DATA', path),
    );
  }
  if (keys.length === 3 && !keys.includes('unit')) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.decimalNotCanonical, 'DATA', path),
    );
  }
  const decimalValue = value['value'];
  if (typeof decimalValue !== 'string' || !DECIMAL_PATTERN.test(decimalValue)) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.decimalNotCanonical, 'DATA', [...path, 'value']),
    );
  }
  if (!validateCanonicalDecimal(decimalValue)) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.decimalNegativeZero, 'DATA', [...path, 'value']),
    );
  }
  const unit = value['unit'];
  if (unit !== undefined && typeof unit !== 'string') {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.decimalNotCanonical, 'DATA', [...path, 'unit']),
    );
  }
  return modelSuccess(value as unknown as BomDecimal);
}

function consumeBytesAndReturn<T extends BomValue>(
  value: T,
  bytes: number,
  state: NormalizeState,
): T | undefined {
  const error = consumeBytes(bytes, state);
  return error === undefined ? value : failNormalization(state, error);
}

function failNormalization(
  state: NormalizeState,
  error: import('@bom-editor/contracts').BomError | readonly import('@bom-editor/contracts').BomError[],
): undefined {
  state.failure ??= error;
  return undefined;
}

function reuseDeeplyFrozenValue<T extends BomValue>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    DEEPLY_FROZEN_VALUES.add(value);
  }
  return value;
}

function consumeBytes(
  bytes: number,
  state: NormalizeState,
): import('@bom-editor/contracts').BomError | undefined {
  state.aggregateBytes += bytes;
  if (state.aggregateBytes <= state.limits.maxAggregateBytes) {
    return undefined;
  }
  return modelError(
    BOM_MODEL_ERROR_CODES.aggregateBytesExceeded,
    'SECURITY_LIMIT',
    state.path,
    { limit: state.limits.maxAggregateBytes },
  );
}

function normalizeChild(
  input: unknown,
  segment: string | number,
  depth: number,
  state: NormalizeState,
): BomValue | undefined {
  state.path.push(segment);
  try {
    return normalizeValue(input, depth, state);
  } finally {
    state.path.pop();
  }
}

function measureKey(key: string, state: NormalizeState): Readonly<KeyMetric> {
  return measureString(key, state.keyMetrics);
}

function measureString(
  value: string,
  cache: Map<string, Readonly<KeyMetric>>,
): Readonly<KeyMetric> {
  const cached = cache.get(value);
  if (cached !== undefined) {
    return cached;
  }
  if (cache.size >= 1_024) {
    cache.clear();
  }
  const metric = Object.freeze({
    unicodeScalar: isUnicodeScalarString(value),
    bytes: utf8ByteLength(value),
  });
  cache.set(value, metric);
  return metric;
}
