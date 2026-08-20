import type {
  BomDocumentSnapshot,
  BomError,
  BomFields,
  BomNode,
  BomSchema,
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
import { normalizeOwnedBomFields } from './fields.js';
import {
  resolveModelLimits,
  type BomModelLimits,
} from './limits.js';
import {
  comparePositionKeys,
  LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
  validatePositionKey,
} from './position.js';
import {
  normalizeBomSchema,
  type BomSchemaValidationOptions,
} from './schema.js';
import {
  isPlainBomObject,
  normalizeBomValueWithMetadata,
} from './value.js';
import { markNormalizedSnapshot } from './normalized-snapshot-cache.js';
import { utf8ByteLength } from './utf8.js';

interface ParsedNode<TFields extends BomFields> {
  readonly occurrenceId: OccurrenceId;
  readonly kind: 'material' | 'group';
  readonly materialId?: string;
  readonly materialRevision?: string;
  readonly materialCode?: string;
  readonly parentId: OccurrenceId | null;
  readonly positionKey: string;
  readonly childrenState?: 'complete' | 'partial' | 'unloaded';
  readonly knownChildCount?: number;
  readonly fields: TFields;
}

const NORMALIZED_SNAPSHOTS = new WeakMap<object, BomSchema>();
const NORMALIZED_SNAPSHOT_SOURCES = new WeakMap<
  object,
  WeakMap<BomSchema, BomDocumentSnapshot>
>();

export interface BomSnapshotValidationOptions extends BomSchemaValidationOptions {
  readonly limits?: Partial<BomModelLimits>;
}

export function normalizeBomDocumentSnapshot<
  TFields extends BomFields = BomFields,
>(
  input: unknown,
  schemaInput: BomSchema,
  options: BomSnapshotValidationOptions = {},
): BomModelResult<BomDocumentSnapshot<TFields>> {
  const limits = resolveModelLimits(options.limits);
  const schemaResult = normalizeBomSchema(schemaInput, options);
  if (!schemaResult.ok) {
    return schemaResult;
  }
  const schema = schemaResult.value;
  if (
    options.limits === undefined &&
    options.roundingModes === undefined &&
    typeof input === 'object' &&
    input !== null &&
    NORMALIZED_SNAPSHOTS.get(input) === schema
  ) {
    return modelSuccess(input as BomDocumentSnapshot<TFields>);
  }
  if (
    options.limits === undefined &&
    options.roundingModes === undefined &&
    typeof input === 'object' &&
    input !== null
  ) {
    const cached = NORMALIZED_SNAPSHOT_SOURCES.get(input)?.get(schema);
    if (cached !== undefined) {
      return modelSuccess(cached as BomDocumentSnapshot<TFields>);
    }
  }
  const normalizedInputWithMetadata = normalizeBomValueWithMetadata(input, {
    limits,
    path: ['snapshot'],
  });
  const normalizedInput = normalizedInputWithMetadata.result;
  if (!normalizedInput.ok) {
    return normalizedInput;
  }
  if (!isPlainBomObject(normalizedInput.value)) {
    return modelFailure(
      modelError(BOM_MODEL_ERROR_CODES.snapshotInvalid, 'DATA', ['snapshot']),
    );
  }

  const source = normalizedInput.value;
  const errors: BomError[] = [];
  checkSnapshotKeys(source, errors);

  const schemaVersion = readIdentifier(
    source['schemaVersion'],
    ['snapshot', 'schemaVersion'],
    limits,
    errors,
  );
  if (schemaVersion !== undefined && schemaVersion !== schema.schemaVersion) {
    errors.push(
      modelError(
        BOM_MODEL_ERROR_CODES.schemaVersionMismatch,
        'CONFIG',
        ['snapshot', 'schemaVersion'],
      ),
    );
  }
  const documentId = readIdentifier(
    source['documentId'],
    ['snapshot', 'documentId'],
    limits,
    errors,
  );
  const revision = readIdentifier(
    source['revision'],
    ['snapshot', 'revision'],
    limits,
    errors,
  );
  const sourceRevision = readOptionalIdentifier(
    source['sourceRevision'],
    ['snapshot', 'sourceRevision'],
    limits,
    errors,
  );

  const codecVersion = source['positionKeyCodecVersion'];
  if (codecVersion !== LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION) {
    errors.push(
      modelError(
        BOM_MODEL_ERROR_CODES.positionCodecUnsupported,
        'CONFIG',
        ['snapshot', 'positionKeyCodecVersion'],
        { expected: LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION },
      ),
    );
  }
  const completenessValue = source['completeness'];
  const completeness =
    completenessValue === 'complete' || completenessValue === 'partial'
      ? completenessValue
      : undefined;
  if (completeness === undefined) {
    errors.push(
      modelError(
        BOM_MODEL_ERROR_CODES.snapshotInvalid,
        'DATA',
        ['snapshot', 'completeness'],
      ),
    );
  }

  const roots = normalizeRoots(source['roots'], limits, errors);
  const knownRootCount = readOptionalNonNegativeSafeInteger(
    source['knownRootCount'],
    ['snapshot', 'knownRootCount'],
    errors,
  );
  const parsedNodes = normalizeNodes<TFields>(source['nodes'], schema, limits, errors);

  if (errors.length > 0 || completeness === undefined) {
    return modelFailure(errors);
  }
  const structural = validateAndOrderStructure(
    parsedNodes,
    roots,
    completeness,
    knownRootCount,
    schema.maximumDepth,
    errors,
  );
  if (errors.length > 0 || structural === undefined) {
    return modelFailure(errors);
  }

  const snapshot: BomDocumentSnapshot<TFields> = {
    schemaVersion: schemaVersion!,
    documentId: documentId!,
    revision: revision!,
    ...(sourceRevision === undefined ? {} : { sourceRevision }),
    positionKeyCodecVersion: LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
    completeness,
    knownRootCount: structural.knownRootCount,
    roots: structural.roots,
    nodes: structural.nodes,
  };
  const normalized = Object.freeze(snapshot);
  markNormalizedSnapshot(normalized);
  if (options.limits === undefined && options.roundingModes === undefined) {
    NORMALIZED_SNAPSHOTS.set(normalized, schema);
    if (
      normalizedInputWithMetadata.sourceDeeplyFrozen &&
      typeof input === 'object' &&
      input !== null
    ) {
      const bySchema = NORMALIZED_SNAPSHOT_SOURCES.get(input) ?? new WeakMap();
      bySchema.set(schema, normalized);
      NORMALIZED_SNAPSHOT_SOURCES.set(input, bySchema);
    }
  }
  return modelSuccess(normalized);
}

export function validateBomDocumentSnapshot(
  input: unknown,
  schema: BomSchema,
  options: BomSnapshotValidationOptions = {},
): BomModelResult<true> {
  const normalized = normalizeBomDocumentSnapshot(input, schema, options);
  return normalized.ok ? modelSuccess(true) : normalized;
}

function normalizeRoots(
  input: BomValue | undefined,
  limits: Readonly<BomModelLimits>,
  errors: BomError[],
): readonly OccurrenceId[] {
  if (!Array.isArray(input)) {
    errors.push(
      modelError(BOM_MODEL_ERROR_CODES.snapshotInvalid, 'DATA', ['snapshot', 'roots']),
    );
    return [];
  }
  const roots: OccurrenceId[] = [];
  const seen = new Set<OccurrenceId>();
  for (let index = 0; index < input.length; index += 1) {
    const root = readIdentifier(
      input[index],
      ['snapshot', 'roots', index],
      limits,
      errors,
    );
    if (root === undefined) {
      continue;
    }
    if (seen.has(root)) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.snapshotRootsMismatch,
          'DATA',
          ['snapshot', 'roots', index],
        ),
      );
      continue;
    }
    seen.add(root);
    roots.push(root);
  }
  return Object.freeze(roots);
}

function normalizeNodes<TFields extends BomFields>(
  input: BomValue | undefined,
  schema: BomSchema,
  limits: Readonly<BomModelLimits>,
  errors: BomError[],
): readonly ParsedNode<TFields>[] {
  if (!Array.isArray(input)) {
    errors.push(
      modelError(BOM_MODEL_ERROR_CODES.snapshotInvalid, 'DATA', ['snapshot', 'nodes']),
    );
    return [];
  }
  if (input.length > limits.maxNodes) {
    errors.push(
      modelError(
        BOM_MODEL_ERROR_CODES.nodeLimitExceeded,
        'SECURITY_LIMIT',
        ['snapshot', 'nodes'],
        { limit: limits.maxNodes },
      ),
    );
    return [];
  }

  const nodes: ParsedNode<TFields>[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const path = ['snapshot', 'nodes', index] as const;
    const nodeInput = input[index];
    if (!isPlainBomObject(nodeInput)) {
      errors.push(modelError(BOM_MODEL_ERROR_CODES.snapshotInvalid, 'DATA', path));
      continue;
    }
    const source =
      nodeInput as unknown as Readonly<Record<string, BomValue>>;
    checkNodeKeys(source, path, errors);
    const occurrenceId = readIdentifier(
      source['occurrenceId'],
      [...path, 'occurrenceId'],
      limits,
      errors,
    );
    const kindValue = source['kind'];
    const kind =
      kindValue === 'material' || kindValue === 'group' ? kindValue : undefined;
    if (kind === undefined) {
      errors.push(
        modelError(BOM_MODEL_ERROR_CODES.snapshotInvalid, 'DATA', [...path, 'kind']),
      );
    }
    const materialId = readOptionalIdentifier(
      source['materialId'],
      [...path, 'materialId'],
      limits,
      errors,
    );
    const materialRevision = readOptionalIdentifier(
      source['materialRevision'],
      [...path, 'materialRevision'],
      limits,
      errors,
    );
    const materialCode = readOptionalIdentifier(
      source['materialCode'],
      [...path, 'materialCode'],
      limits,
      errors,
    );

    const parentValue = source['parentId'];
    let parentId: OccurrenceId | null | undefined;
    if (parentValue === null) {
      parentId = null;
    } else {
      parentId = readIdentifier(parentValue, [...path, 'parentId'], limits, errors);
    }
    const positionResult = validatePositionKey(
      source['positionKey'],
      [...path, 'positionKey'],
      limits.maxPositionKeyBytes,
    );
    if (!positionResult.ok) {
      errors.push(...positionResult.errors);
    }

    const childrenStateValue = source['childrenState'];
    const childrenState =
      childrenStateValue === 'complete' ||
      childrenStateValue === 'partial' ||
      childrenStateValue === 'unloaded'
        ? childrenStateValue
        : undefined;
    if (childrenStateValue !== undefined && childrenState === undefined) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.childrenStateInvalid,
          'DATA',
          [...path, 'childrenState'],
        ),
      );
    }
    const knownChildCount = readOptionalNonNegativeSafeInteger(
      source['knownChildCount'],
      [...path, 'knownChildCount'],
      errors,
    );
    const fieldsResult = normalizeOwnedBomFields<TFields>(source['fields'], schema, {
      limits,
      path: [...path, 'fields'],
    });
    if (!fieldsResult.ok) {
      errors.push(...fieldsResult.errors);
    }
    if (kind === 'material' && materialId === undefined && materialCode === undefined) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.materialRefRequired,
          'DATA',
          path,
          occurrenceId === undefined ? undefined : { occurrenceId },
        ),
      );
    }

    if (
      occurrenceId === undefined ||
      kind === undefined ||
      parentId === undefined ||
      !positionResult.ok ||
      !fieldsResult.ok
    ) {
      continue;
    }
    if (fieldsResult.value === source['fields']) {
      nodes.push(source as unknown as ParsedNode<TFields>);
    } else {
      nodes.push({
        occurrenceId,
        kind,
        ...(materialId === undefined ? {} : { materialId }),
        ...(materialRevision === undefined ? {} : { materialRevision }),
        ...(materialCode === undefined ? {} : { materialCode }),
        parentId,
        positionKey: positionResult.value,
        ...(childrenState === undefined ? {} : { childrenState }),
        ...(knownChildCount === undefined ? {} : { knownChildCount }),
        fields: fieldsResult.value,
      });
    }
  }
  return nodes;
}

function validateAndOrderStructure<TFields extends BomFields>(
  nodes: readonly ParsedNode<TFields>[],
  roots: readonly OccurrenceId[],
  completeness: 'complete' | 'partial',
  knownRootCount: number | undefined,
  maximumDepth: number,
  errors: BomError[],
):
  | {
      readonly knownRootCount: number;
      readonly roots: readonly OccurrenceId[];
      readonly nodes: readonly BomNode<TFields>[];
    }
  | undefined {
  const rowById = new Map<OccurrenceId, ParsedNode<TFields>>();
  for (const node of nodes) {
    if (rowById.has(node.occurrenceId)) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.snapshotDuplicateId,
          'DATA',
          ['snapshot', 'nodes'],
          { occurrenceId: node.occurrenceId },
        ),
      );
    } else {
      rowById.set(node.occurrenceId, node);
    }
  }
  if (errors.length > 0) {
    return undefined;
  }

  const childrenByParent = new Map<OccurrenceId | null, ParsedNode<TFields>[]>();
  childrenByParent.set(null, []);
  for (const node of nodes) {
    if (node.parentId !== null && !rowById.has(node.parentId)) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.snapshotParentNotFound,
          'DATA',
          ['snapshot', 'nodes'],
          { occurrenceId: node.occurrenceId, parentId: node.parentId },
        ),
      );
      continue;
    }
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }
  if (errors.length > 0) {
    return undefined;
  }

  for (const [parentId, children] of childrenByParent) {
    children.sort((left, right) => comparePositionKeys(left.positionKey, right.positionKey));
    for (let index = 1; index < children.length; index += 1) {
      if (children[index - 1]!.positionKey === children[index]!.positionKey) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.positionKeyDuplicate,
            'DATA',
            ['snapshot', 'nodes'],
            parentId === null ? {} : { parentId },
          ),
        );
      }
    }
  }

  const structuralRoots = childrenByParent.get(null) ?? [];
  if (
    roots.length !== structuralRoots.length ||
    roots.some((root, index) => structuralRoots[index]?.occurrenceId !== root)
  ) {
    const rootSet = new Set(roots);
    const structuralSet = new Set(structuralRoots.map((node) => node.occurrenceId));
    const sameSet =
      rootSet.size === structuralSet.size &&
      [...rootSet].every((root) => structuralSet.has(root));
    errors.push(
      modelError(
        sameSet
          ? BOM_MODEL_ERROR_CODES.snapshotRootOrderMismatch
          : BOM_MODEL_ERROR_CODES.snapshotRootsMismatch,
        'DATA',
        ['snapshot', 'roots'],
      ),
    );
  }

  detectCycles(nodes, rowById, errors);
  if (errors.length > 0) {
    return undefined;
  }

  const normalizedRootCount = validateKnownRootCount(
    completeness,
    knownRootCount,
    roots.length,
    errors,
  );
  const orderedNodes: BomNode<TFields>[] = [];
  const stack: { readonly node: ParsedNode<TFields>; readonly depth: number }[] = [];
  for (let index = structuralRoots.length - 1; index >= 0; index -= 1) {
    stack.push({ node: structuralRoots[index]!, depth: 1 });
  }

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > maximumDepth) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.depthLimitExceeded,
          'SECURITY_LIMIT',
          ['snapshot', 'nodes'],
          { occurrenceId: node.occurrenceId, limit: maximumDepth },
        ),
      );
      continue;
    }
    const children = childrenByParent.get(node.occurrenceId) ?? [];
    const childState = normalizeChildState(
      node,
      children.length,
      completeness,
      errors,
    );
    if (childState !== undefined) {
      if (
        Object.isFrozen(node) &&
        node.childrenState === childState.state &&
        node.knownChildCount === childState.knownCount
      ) {
        orderedNodes.push(node as BomNode<TFields>);
      } else {
        orderedNodes.push(
          Object.freeze({
          occurrenceId: node.occurrenceId,
          kind: node.kind,
          ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
          ...(node.materialRevision === undefined
            ? {}
            : { materialRevision: node.materialRevision }),
          ...(node.materialCode === undefined ? {} : { materialCode: node.materialCode }),
          parentId: node.parentId,
          positionKey: node.positionKey,
          childrenState: childState.state,
          knownChildCount: childState.knownCount,
          fields: node.fields,
          }),
        );
      }
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index]!, depth: depth + 1 });
    }
  }

  if (errors.length > 0 || normalizedRootCount === undefined) {
    return undefined;
  }
  return {
    knownRootCount: normalizedRootCount,
    roots: Object.freeze(structuralRoots.map((node) => node.occurrenceId)),
    nodes: Object.freeze(orderedNodes),
  };
}

function detectCycles<TFields extends BomFields>(
  nodes: readonly ParsedNode<TFields>[],
  rowById: ReadonlyMap<OccurrenceId, ParsedNode<TFields>>,
  errors: BomError[],
): void {
  const state = new Map<OccurrenceId, 1 | 2>();
  for (const startingNode of nodes) {
    if (state.get(startingNode.occurrenceId) === 2) {
      continue;
    }
    const path: ParsedNode<TFields>[] = [];
    let current: ParsedNode<TFields> | undefined = startingNode;
    while (current !== undefined) {
      const currentState = state.get(current.occurrenceId);
      if (currentState === 1) {
        errors.push(
          modelError(
            BOM_MODEL_ERROR_CODES.snapshotCycle,
            'DATA',
            ['snapshot', 'nodes'],
            { occurrenceId: current.occurrenceId },
          ),
        );
        return;
      }
      if (currentState === 2) {
        break;
      }
      state.set(current.occurrenceId, 1);
      path.push(current);
      current =
        current.parentId === null ? undefined : rowById.get(current.parentId);
    }
    for (const visited of path) {
      state.set(visited.occurrenceId, 2);
    }
  }
}

function validateKnownRootCount(
  completeness: 'complete' | 'partial',
  knownRootCount: number | undefined,
  loadedRootCount: number,
  errors: BomError[],
): number | undefined {
  if (completeness === 'complete') {
    if (knownRootCount !== undefined && knownRootCount !== loadedRootCount) {
      errors.push(
        modelError(
          BOM_MODEL_ERROR_CODES.childCountMismatch,
          'DATA',
          ['snapshot', 'knownRootCount'],
        ),
      );
    }
    return loadedRootCount;
  }
  if (knownRootCount === undefined || knownRootCount < loadedRootCount) {
    errors.push(
      modelError(
        BOM_MODEL_ERROR_CODES.childCountMismatch,
        'DATA',
        ['snapshot', 'knownRootCount'],
      ),
    );
    return undefined;
  }
  return knownRootCount;
}

function normalizeChildState<TFields extends BomFields>(
  node: ParsedNode<TFields>,
  loadedChildCount: number,
  completeness: 'complete' | 'partial',
  errors: BomError[],
): { readonly state: 'complete' | 'partial' | 'unloaded'; readonly knownCount: number } | undefined {
  if (completeness === 'complete') {
    if (node.childrenState !== undefined && node.childrenState !== 'complete') {
      errors.push(childStateError(node.occurrenceId));
      return undefined;
    }
    if (node.knownChildCount !== undefined && node.knownChildCount !== loadedChildCount) {
      errors.push(childCountError(node.occurrenceId));
      return undefined;
    }
    return { state: 'complete', knownCount: loadedChildCount };
  }

  if (node.childrenState === undefined) {
    errors.push(childStateError(node.occurrenceId));
    return undefined;
  }
  if (node.childrenState === 'unloaded') {
    if (loadedChildCount !== 0) {
      errors.push(childCountError(node.occurrenceId));
      return undefined;
    }
    return { state: 'unloaded', knownCount: node.knownChildCount ?? 0 };
  }
  if (node.childrenState === 'partial') {
    if (
      node.knownChildCount === undefined ||
      node.knownChildCount < loadedChildCount
    ) {
      errors.push(childCountError(node.occurrenceId));
      return undefined;
    }
    return { state: 'partial', knownCount: node.knownChildCount };
  }
  if (node.knownChildCount !== undefined && node.knownChildCount !== loadedChildCount) {
    errors.push(childCountError(node.occurrenceId));
    return undefined;
  }
  return { state: 'complete', knownCount: loadedChildCount };
}

function childStateError(occurrenceId: OccurrenceId): BomError {
  return modelError(
    BOM_MODEL_ERROR_CODES.childrenStateInvalid,
    'DATA',
    ['snapshot', 'nodes'],
    { occurrenceId },
  );
}

function childCountError(occurrenceId: OccurrenceId): BomError {
  return modelError(
    BOM_MODEL_ERROR_CODES.childCountMismatch,
    'DATA',
    ['snapshot', 'nodes'],
    { occurrenceId },
  );
}

function readIdentifier(
  value: BomValue | undefined,
  path: readonly (string | number)[],
  limits: Readonly<BomModelLimits>,
  errors: BomError[],
): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    utf8ByteLength(value) > limits.maxIdentifierBytes
  ) {
    errors.push(modelError(BOM_MODEL_ERROR_CODES.snapshotInvalid, 'DATA', path));
    return undefined;
  }
  return value;
}

function readOptionalIdentifier(
  value: BomValue | undefined,
  path: readonly (string | number)[],
  limits: Readonly<BomModelLimits>,
  errors: BomError[],
): string | undefined {
  return value === undefined ? undefined : readIdentifier(value, path, limits, errors);
}

function readOptionalNonNegativeSafeInteger(
  value: BomValue | undefined,
  path: readonly (string | number)[],
  errors: BomError[],
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(modelError(BOM_MODEL_ERROR_CODES.snapshotInvalid, 'DATA', path));
    return undefined;
  }
  return value;
}

function checkSnapshotKeys(
  input: Readonly<Record<string, BomValue>>,
  errors: BomError[],
): void {
  checkAllowedKeys(
    input,
    [
      'schemaVersion',
      'documentId',
      'revision',
      'sourceRevision',
      'positionKeyCodecVersion',
      'completeness',
      'knownRootCount',
      'roots',
      'nodes',
    ],
    ['snapshot'],
    errors,
  );
}

function checkNodeKeys(
  input: Readonly<Record<string, BomValue>>,
  path: readonly (string | number)[],
  errors: BomError[],
): void {
  checkAllowedKeys(
    input,
    [
      'occurrenceId',
      'kind',
      'materialId',
      'materialRevision',
      'materialCode',
      'parentId',
      'positionKey',
      'childrenState',
      'knownChildCount',
      'fields',
    ],
    path,
    errors,
  );
}

function checkAllowedKeys(
  input: Readonly<Record<string, BomValue>>,
  allowed: readonly string[],
  path: readonly (string | number)[],
  errors: BomError[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!allowedSet.has(key)) {
      errors.push(
        modelError(BOM_MODEL_ERROR_CODES.snapshotInvalid, 'DATA', [...path, key]),
      );
    }
  }
}
