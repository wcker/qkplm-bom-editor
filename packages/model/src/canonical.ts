import type {
  BomFieldSchema,
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
import { normalizeFieldValue } from './schema.js';
import { sha256Hex } from './sha256.js';
import {
  isPlainBomObject,
  normalizeBomValue,
} from './value.js';
import { compareUtf8, utf8ByteLength } from './utf8.js';

export interface CanonicalBomValueOptions {
  readonly limits?: Partial<BomModelLimits>;
  readonly path?: readonly (string | number)[];
}

export function canonicalSerializeBomValue(
  input: unknown,
  options: CanonicalBomValueOptions = {},
): BomModelResult<string> {
  const normalized = normalizeBomValue(input, options);
  if (!normalized.ok) {
    return normalized;
  }
  try {
    return modelSuccess(encodeCanonicalValue(normalized.value));
  } catch {
    return modelFailure(
      modelError(
        BOM_MODEL_ERROR_CODES.canonicalizationFailed,
        'DATA',
        options.path ?? [],
      ),
    );
  }
}

export function hashBomFieldValue(
  input: unknown,
  schema: BomSchema,
  field: BomFieldSchema,
  options: CanonicalBomValueOptions = {},
): BomModelResult<string> {
  const limits = resolveModelLimits(options.limits);
  const normalized = normalizeFieldValue(
    input,
    field,
    options.path ?? ['fields', ...field.path],
    limits,
  );
  if (!normalized.ok) {
    return normalized;
  }

  const envelope: BomValue = {
    domain: 'bom:value-hash:v1',
    schemaVersion: schema.schemaVersion,
    canonicalizationVersion: schema.canonicalizationVersion,
    fieldId: field.fieldId,
    fieldPath: field.path,
    fieldType: field.type as unknown as BomValue,
    value: normalized.value,
  };
  return modelSuccess(sha256Hex(encodeCanonicalValue(envelope)));
}

export function encodeCanonicalValue(value: BomValue): string {
  if (value === null) {
    return 'n;';
  }
  if (typeof value === 'boolean') {
    return value ? 'b1;' : 'b0;';
  }
  if (typeof value === 'number') {
    const canonicalNumber = Object.is(value, -0) ? '0' : String(value);
    return lengthPrefixed('f', canonicalNumber);
  }
  if (typeof value === 'string') {
    return lengthPrefixed('s', value);
  }
  if (Array.isArray(value)) {
    let output = `a${value.length}:`;
    for (const item of value) {
      output += encodeCanonicalValue(item);
    }
    return `${output};`;
  }
  if (isPlainBomObject(value) && value['$type'] === 'integer') {
    return lengthPrefixed('i', String(value['value']));
  }
  if (isPlainBomObject(value) && value['$type'] === 'decimal') {
    const decimalValue = lengthPrefixed('v', String(value['value']));
    const unit = value['unit'];
    const encodedUnit =
      typeof unit === 'string' ? lengthPrefixed('u', unit) : 'u-;';
    return `d:${decimalValue}${encodedUnit};`;
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    compareUtf8(left, right),
  );
  let output = `o${entries.length}:`;
  for (const [key, item] of entries) {
    output += lengthPrefixed('k', key);
    output += encodeCanonicalValue(item);
  }
  return `${output};`;
}

function lengthPrefixed(tag: string, value: string): string {
  return `${tag}${utf8ByteLength(value)}:${value};`;
}
