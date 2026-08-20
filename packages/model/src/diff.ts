import type {
  BomDiffValueState,
  BomDocumentSnapshot,
  BomFields,
  BomMaterialReference,
  BomNode,
  BomSchema,
  BomSnapshotDiff,
  BomSnapshotDiffChange,
  BomSnapshotFieldChange,
  BomValue,
  OccurrenceId,
} from '@bom-editor/contracts';
import {
  BOM_MODEL_ERROR_CODES,
  modelError,
  modelFailure,
  modelSuccess,
  type BomModelResult,
} from './errors.js';
import {
  normalizeBomDocumentSnapshot,
  type BomSnapshotValidationOptions,
} from './snapshot.js';
import { normalizeBomSchema } from './schema.js';
import { encodeUtf8 } from './utf8.js';
import { isPlainBomObject } from './value.js';

interface SchemaPathNode {
  readonly children: Map<string, SchemaPathNode>;
  fieldId?: string;
}

interface ComparableField {
  readonly path: readonly string[];
  readonly fieldId?: string;
  readonly value: BomValue;
}

interface OrderedComparableField {
  readonly field: ComparableField;
  readonly orderKey: Uint16Array;
}

const ABSENT_DIFF_VALUE: BomDiffValueState = Object.freeze({
  present: false,
});

export function diffBomDocumentSnapshots<
  TFields extends BomFields = BomFields,
>(
  sourceInput: unknown,
  targetInput: unknown,
  schemaInput: BomSchema,
  options: BomSnapshotValidationOptions = {},
): BomModelResult<BomSnapshotDiff<TFields>> {
  const schemaResult = normalizeBomSchema(schemaInput, options);
  if (!schemaResult.ok) {
    return schemaResult;
  }
  const schema = schemaResult.value;
  const sourceResult = normalizeBomDocumentSnapshot<TFields>(
    sourceInput,
    schema,
    options,
  );
  if (!sourceResult.ok) {
    return sourceResult;
  }
  const targetResult = normalizeBomDocumentSnapshot<TFields>(
    targetInput,
    schema,
    options,
  );
  if (!targetResult.ok) {
    return targetResult;
  }

  const source = sourceResult.value;
  const target = targetResult.value;
  if (source.completeness !== 'complete' || target.completeness !== 'complete') {
    return modelFailure(
      modelError(
        BOM_MODEL_ERROR_CODES.diffRequiresCompleteSnapshots,
        'DATA',
        ['diff'],
        {
          sourceCompleteness: source.completeness,
          targetCompleteness: target.completeness,
        },
      ),
    );
  }
  if (source.documentId !== target.documentId) {
    return modelFailure(
      modelError(
        BOM_MODEL_ERROR_CODES.diffDocumentMismatch,
        'DATA',
        ['diff', 'documentId'],
        {
          sourceDocumentId: source.documentId,
          targetDocumentId: target.documentId,
        },
      ),
    );
  }

  const sourceById = indexNodes(source);
  const targetById = indexNodes(target);
  const kindErrors = [];
  for (const targetNode of target.nodes) {
    const sourceNode = sourceById.get(targetNode.occurrenceId);
    if (sourceNode !== undefined && sourceNode.kind !== targetNode.kind) {
      kindErrors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.diffNodeKindChanged,
          'DATA',
          ['diff', 'nodes'],
          {
            occurrenceId: targetNode.occurrenceId,
            sourceKind: sourceNode.kind,
            targetKind: targetNode.kind,
          },
        ),
      );
    }
  }
  if (kindErrors.length > 0) {
    return modelFailure(kindErrors);
  }

  const changes: BomSnapshotDiffChange<TFields>[] = [];

  for (const node of source.nodes) {
    if (!targetById.has(node.occurrenceId)) {
      changes.push(Object.freeze({ type: 'delete', node }));
    }
  }
  for (const node of target.nodes) {
    if (!sourceById.has(node.occurrenceId)) {
      changes.push(Object.freeze({ type: 'insert', node }));
    }
  }
  for (const targetNode of target.nodes) {
    const sourceNode = sourceById.get(targetNode.occurrenceId);
    if (sourceNode === undefined) {
      continue;
    }
    if (sourceNode.parentId !== targetNode.parentId) {
      changes.push(
        Object.freeze({
          type: 'move',
          occurrenceId: targetNode.occurrenceId,
          beforeParentId: sourceNode.parentId,
          afterParentId: targetNode.parentId,
          beforePositionKey: sourceNode.positionKey,
          afterPositionKey: targetNode.positionKey,
        }),
      );
    }
  }
  for (const targetNode of target.nodes) {
    const sourceNode = sourceById.get(targetNode.occurrenceId);
    if (
      sourceNode !== undefined &&
      sourceNode.parentId === targetNode.parentId &&
      sourceNode.positionKey !== targetNode.positionKey
    ) {
      changes.push(
        Object.freeze({
          type: 'reorder',
          occurrenceId: targetNode.occurrenceId,
          parentId: targetNode.parentId,
          beforePositionKey: sourceNode.positionKey,
          afterPositionKey: targetNode.positionKey,
        }),
      );
    }
  }
  for (const targetNode of target.nodes) {
    const sourceNode = sourceById.get(targetNode.occurrenceId);
    if (
      sourceNode !== undefined &&
      !materialReferencesEqual(sourceNode, targetNode)
    ) {
      changes.push(
        Object.freeze({
          type: 'material',
          occurrenceId: targetNode.occurrenceId,
          before: materialReference(sourceNode),
          after: materialReference(targetNode),
        }),
      );
    }
  }

  const schemaPaths = buildSchemaPathTree(schema);
  for (const targetNode of target.nodes) {
    const sourceNode = sourceById.get(targetNode.occurrenceId);
    if (sourceNode === undefined || sourceNode.fields === targetNode.fields) {
      continue;
    }
    changes.push(
      ...diffFields(
        targetNode.occurrenceId,
        sourceNode.fields,
        targetNode.fields,
        schemaPaths,
      ),
    );
  }

  return modelSuccess(
    Object.freeze({
      schemaVersion: source.schemaVersion,
      documentId: source.documentId,
      sourceRevision: source.revision,
      targetRevision: target.revision,
      positionKeyCodecVersion: source.positionKeyCodecVersion,
      changes: Object.freeze(changes),
    }),
  );
}

function indexNodes<TFields extends BomFields>(
  snapshot: BomDocumentSnapshot<TFields>,
): ReadonlyMap<OccurrenceId, BomNode<TFields>> {
  return new Map(snapshot.nodes.map((node) => [node.occurrenceId, node]));
}

function materialReferencesEqual<TFields extends BomFields>(
  source: BomNode<TFields>,
  target: BomNode<TFields>,
): boolean {
  return (
    source.materialId === target.materialId &&
    source.materialRevision === target.materialRevision &&
    source.materialCode === target.materialCode
  );
}

function materialReference<TFields extends BomFields>(
  node: BomNode<TFields>,
): BomMaterialReference {
  return Object.freeze({
    ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
    ...(node.materialRevision === undefined
      ? {}
      : { materialRevision: node.materialRevision }),
    ...(node.materialCode === undefined ? {} : { materialCode: node.materialCode }),
  });
}

function buildSchemaPathTree(schema: BomSchema): SchemaPathNode {
  const root: SchemaPathNode = { children: new Map() };
  for (const field of schema.fields) {
    let current = root;
    for (const segment of field.path) {
      let child = current.children.get(segment);
      if (child === undefined) {
        child = { children: new Map() };
        current.children.set(segment, child);
      }
      current = child;
    }
    current.fieldId = field.fieldId;
  }
  return root;
}

function diffFields(
  occurrenceId: OccurrenceId,
  source: BomFields,
  target: BomFields,
  schemaPaths: SchemaPathNode,
): readonly BomSnapshotFieldChange[] {
  const sourceFields = collectComparableFields(source, schemaPaths);
  const targetFields = collectComparableFields(target, schemaPaths);
  const paths = new Map<string, ComparableField>();
  for (const [key, field] of sourceFields) {
    paths.set(key, field);
  }
  for (const [key, field] of targetFields) {
    paths.set(key, field);
  }

  const orderedPaths = orderComparableFields([...paths.values()]);
  const changes: BomSnapshotFieldChange[] = [];
  for (const descriptor of orderedPaths) {
    const key = JSON.stringify(descriptor.path);
    const before = sourceFields.get(key);
    const after = targetFields.get(key);
    if (
      before !== undefined &&
      after !== undefined &&
      bomValuesEqual(before.value, after.value)
    ) {
      continue;
    }
    changes.push(
      Object.freeze({
        type: 'field',
        occurrenceId,
        ...(descriptor.fieldId === undefined
          ? {}
          : { fieldId: descriptor.fieldId }),
        fieldPath: descriptor.path,
        before: diffValueState(before),
        after: diffValueState(after),
      }),
    );
  }
  return changes;
}

function collectComparableFields(
  fields: BomFields,
  schemaPaths: SchemaPathNode,
): ReadonlyMap<string, ComparableField> {
  const collected = new Map<string, ComparableField>();
  const stack: {
    readonly value: Readonly<Record<string, BomValue>>;
    readonly schemaPath: SchemaPathNode;
    readonly path: readonly string[];
  }[] = [{ value: fields, schemaPath: schemaPaths, path: [] }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = Object.entries(current.value);
    if (current.path.length > 0 && entries.length === 0) {
      addComparableField(collected, current.path, undefined, current.value);
      continue;
    }
    for (const [key, value] of entries) {
      const path = Object.freeze([...current.path, key]);
      const schemaPath = current.schemaPath.children.get(key);
      if (schemaPath === undefined || schemaPath.fieldId !== undefined) {
        addComparableField(collected, path, schemaPath?.fieldId, value);
        continue;
      }
      if (!isPlainBomObject(value)) {
        addComparableField(collected, path, undefined, value);
        continue;
      }
      stack.push({ value, schemaPath, path });
    }
  }
  return collected;
}

function addComparableField(
  fields: Map<string, ComparableField>,
  path: readonly string[],
  fieldId: string | undefined,
  value: BomValue,
): void {
  fields.set(
    JSON.stringify(path),
    Object.freeze({
      path,
      ...(fieldId === undefined ? {} : { fieldId }),
      value,
    }),
  );
}

function diffValueState(
  field: ComparableField | undefined,
): BomDiffValueState {
  return field === undefined
    ? ABSENT_DIFF_VALUE
    : Object.freeze({ present: true, value: field.value });
}

function bomValuesEqual(left: BomValue, right: BomValue): boolean {
  const pending: [BomValue, BomValue][] = [[left, right]];
  while (pending.length > 0) {
    const [currentLeft, currentRight] = pending.pop()!;
    if (Object.is(currentLeft, currentRight)) {
      continue;
    }
    if (Array.isArray(currentLeft)) {
      if (
        !Array.isArray(currentRight) ||
        currentLeft.length !== currentRight.length
      ) {
        return false;
      }
      for (let index = 0; index < currentLeft.length; index += 1) {
        pending.push([currentLeft[index]!, currentRight[index]!]);
      }
      continue;
    }
    if (!isPlainBomObject(currentLeft) || !isPlainBomObject(currentRight)) {
      return false;
    }
    const leftKeys = Object.keys(currentLeft);
    if (leftKeys.length !== Object.keys(currentRight).length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(currentRight, key)) {
        return false;
      }
      pending.push([currentLeft[key]!, currentRight[key]!]);
    }
  }
  return true;
}

function orderComparableFields(
  fields: readonly ComparableField[],
): readonly ComparableField[] {
  if (fields.length < 2) {
    return fields;
  }
  const entries: OrderedComparableField[] = fields.map((field) => ({
    field,
    orderKey: encodeFieldPathOrderKey(field.path),
  }));
  const ordered: ComparableField[] = [];
  const pending: {
    readonly entries: readonly OrderedComparableField[];
    readonly offset: number;
  }[] = [{ entries, offset: 0 }];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.entries.length === 1) {
      ordered.push(current.entries[0]!.field);
      continue;
    }
    const buckets: (OrderedComparableField[] | undefined)[] = new Array(258);
    for (const entry of current.entries) {
      const token = entry.orderKey[current.offset] ?? 0;
      const bucket = buckets[token];
      if (bucket === undefined) {
        buckets[token] = [entry];
      } else {
        bucket.push(entry);
      }
    }
    for (let token = buckets.length - 1; token >= 0; token -= 1) {
      const bucket = buckets[token];
      if (bucket === undefined) {
        continue;
      }
      if (token === 0) {
        for (const entry of bucket) {
          ordered.push(entry.field);
        }
      } else {
        pending.push({ entries: bucket, offset: current.offset + 1 });
      }
    }
  }
  return ordered;
}

function encodeFieldPathOrderKey(path: readonly string[]): Uint16Array {
  const segments = path.map(encodeUtf8);
  const length = segments.reduce(
    (total, segment) => total + segment.length + 1,
    0,
  );
  const encoded = new Uint16Array(length);
  let offset = 0;
  for (const segment of segments) {
    for (const byte of segment) {
      encoded[offset] = byte + 2;
      offset += 1;
    }
    encoded[offset] = 1;
    offset += 1;
  }
  return encoded;
}
