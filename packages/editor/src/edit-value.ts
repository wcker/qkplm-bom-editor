import type {
  BomDecimal,
  BomFieldSchema,
  BomInteger,
  BomValue,
} from '@bom-editor/contracts';
import {
  normalizeFieldValue,
  type BomModelLimits,
  type BomModelResult,
} from '@bom-editor/model';

export function formatEditorValue(value: BomValue | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isTaggedInteger(value)) {
    return value.value;
  }
  if (isTaggedDecimal(value)) {
    return value.value;
  }
  return JSON.stringify(value);
}

export function parseEditorValue(
  text: string,
  originalValue: BomValue | undefined,
  field: BomFieldSchema,
  limits?: Readonly<BomModelLimits>,
): BomModelResult<BomValue> {
  let candidate: unknown = text;
  switch (field.type.kind) {
    case 'boolean':
      candidate =
        text === 'true'
          ? true
          : text === 'false'
            ? false
            : text;
      break;
    case 'integer':
      candidate = { $type: 'integer', value: text };
      break;
    case 'decimal': {
      const unit =
        isTaggedDecimal(originalValue) &&
        typeof originalValue.unit === 'string'
          ? originalValue.unit
          : undefined;
      candidate = {
        $type: 'decimal',
        value: text,
        ...(unit === undefined ? {} : { unit }),
      };
      break;
    }
    case 'json':
      try {
        candidate = JSON.parse(text);
      } catch {
        candidate = text;
      }
      break;
    default:
      candidate = text;
  }
  return normalizeFieldValue(
    candidate,
    field,
    ['fields', ...field.path],
    limits,
  );
}

function isTaggedDecimal(
  value: BomValue | undefined,
): value is BomDecimal {
  const candidate = taggedNumberCandidate(value);
  return (
    candidate !== undefined &&
    candidate.$type === 'decimal' &&
    typeof candidate.value === 'string'
  );
}

function isTaggedInteger(
  value: BomValue | undefined,
): value is BomInteger {
  const candidate = taggedNumberCandidate(value);
  return (
    candidate !== undefined &&
    candidate.$type === 'integer' &&
    typeof candidate.value === 'string'
  );
}

function taggedNumberCandidate(
  value: BomValue | undefined,
): { readonly $type?: unknown; readonly value?: unknown } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as { readonly $type?: unknown; readonly value?: unknown };
}
