import type {
  BomDocumentSnapshot,
  BomFieldSchema,
  BomFields,
  BomNode,
  BomSchema,
  BomValue,
} from '@bom-editor/contracts';
import { encodeCanonicalValue } from './canonical.js';
import {
  modelSuccess,
  type BomModelResult,
} from './errors.js';
import { normalizeFieldValue } from './schema.js';
import {
  normalizeBomDocumentSnapshot,
  type BomSnapshotValidationOptions,
} from './snapshot.js';
import { resolveModelLimits } from './limits.js';
import { sha256Hex } from './sha256.js';

const VALUE_HASH_DOMAIN = 'bom:value:v1\0';
const CONTENT_HASH_DOMAIN = 'bom:content:v1\0';
const ENVELOPE_HASH_DOMAIN = 'bom:envelope:v1\0';

export function hashBomFieldValue(
  input: unknown,
  schema: BomSchema,
  field: BomFieldSchema,
  options: BomSnapshotValidationOptions = {},
): BomModelResult<string> {
  const normalized = normalizeFieldValue(
    input,
    field,
    ['fields', ...field.path],
    resolveModelLimits(options.limits),
  );
  if (!normalized.ok) {
    return normalized;
  }
  const payload: BomValue = {
    schemaVersion: schema.schemaVersion,
    canonicalizationVersion: schema.canonicalizationVersion,
    fieldId: field.fieldId,
    fieldPath: field.path,
    fieldType: field.type as unknown as BomValue,
    value: normalized.value,
  };
  return modelSuccess(
    sha256Hex(VALUE_HASH_DOMAIN + encodeCanonicalValue(payload)),
  );
}

export function hashBomDocumentContent<TFields extends BomFields = BomFields>(
  input: unknown,
  schema: BomSchema,
  options: BomSnapshotValidationOptions = {},
): BomModelResult<string> {
  const normalized = normalizeBomDocumentSnapshot<TFields>(input, schema, options);
  if (!normalized.ok) {
    return normalized;
  }
  return modelSuccess(hashNormalizedContent(normalized.value, schema));
}

export function hashBomDocumentEnvelope<TFields extends BomFields = BomFields>(
  input: unknown,
  schema: BomSchema,
  options: BomSnapshotValidationOptions = {},
): BomModelResult<string> {
  const normalized = normalizeBomDocumentSnapshot<TFields>(input, schema, options);
  if (!normalized.ok) {
    return normalized;
  }
  const snapshot = normalized.value;
  const contentHash = hashNormalizedContent(snapshot, schema);
  const envelope: BomValue = {
    schemaVersion: snapshot.schemaVersion,
    canonicalizationVersion: schema.canonicalizationVersion,
    documentId: snapshot.documentId,
    revision: snapshot.revision,
    sourceRevision: snapshot.sourceRevision ?? null,
    positionKeyCodecVersion: snapshot.positionKeyCodecVersion,
    completeness: snapshot.completeness,
    knownRootCount: snapshot.knownRootCount ?? null,
    nodeLoadingState: snapshot.nodes.map((node) => ({
      occurrenceId: node.occurrenceId,
      childrenState: node.childrenState ?? null,
      knownChildCount: node.knownChildCount ?? null,
    })),
    contentHash,
  };
  return modelSuccess(
    sha256Hex(ENVELOPE_HASH_DOMAIN + encodeCanonicalValue(envelope)),
  );
}

function hashNormalizedContent<TFields extends BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
  schema: BomSchema,
): string {
  const content: BomValue = {
    schemaVersion: snapshot.schemaVersion,
    canonicalizationVersion: schema.canonicalizationVersion,
    positionKeyCodecVersion: snapshot.positionKeyCodecVersion,
    roots: snapshot.roots,
    nodes: snapshot.nodes.map(nodeContentValue),
  };
  return sha256Hex(CONTENT_HASH_DOMAIN + encodeCanonicalValue(content));
}

function nodeContentValue<TFields extends BomFields>(
  node: BomNode<TFields>,
): BomValue {
  return {
    occurrenceId: node.occurrenceId,
    kind: node.kind,
    materialId: node.materialId ?? null,
    materialRevision: node.materialRevision ?? null,
    materialCode: node.materialCode ?? null,
    parentId: node.parentId,
    positionKey: node.positionKey,
    fields: node.fields,
  };
}
