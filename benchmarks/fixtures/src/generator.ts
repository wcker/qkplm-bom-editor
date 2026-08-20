import type {
  BomDecimal,
  BomDocumentSnapshot,
  BomFields,
  BomNode,
  BomValue,
  OccurrenceId,
} from '@bom-editor/contracts';

import type {
  BomFixtureDefinition,
  BomFixtureManifestEntry,
  GeneratedBomFixture,
} from './types.js';
import { createFixtureSchema } from './schema.js';

const GENERATOR_VERSION = '1.0.0' as const;
const MIN_BASE_FIELD_COUNT = 4;

interface MutableNodePlan {
  readonly occurrenceId: OccurrenceId;
  readonly parentId: OccurrenceId | null;
  readonly depth: number;
  readonly positionKey: string;
  readonly materialId?: string;
  readonly materialCode?: string;
  readonly fields: Readonly<Record<string, BomValue>>;
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function assertDefinition(definition: BomFixtureDefinition): void {
  if (definition.generatorVersion !== GENERATOR_VERSION) {
    throw new RangeError(`Unsupported fixture generator: ${definition.generatorVersion}`);
  }
  if (!Number.isSafeInteger(definition.seed) || definition.seed < 0) {
    throw new RangeError('Fixture seed must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(definition.nodeCount) || definition.nodeCount < 1) {
    throw new RangeError('Fixture nodeCount must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(definition.maxDepth) || definition.maxDepth < 1) {
    throw new RangeError('Fixture maxDepth must be a positive safe integer.');
  }
  if (definition.hierarchy === 'flat' && definition.maxDepth !== 1) {
    throw new RangeError('Flat fixture maxDepth must equal 1.');
  }
  if (definition.hierarchy === 'nested' && definition.maxDepth > definition.nodeCount) {
    throw new RangeError('Nested fixture maxDepth cannot exceed nodeCount.');
  }
  if (!Number.isSafeInteger(definition.fieldCount) || definition.fieldCount < MIN_BASE_FIELD_COUNT) {
    throw new RangeError(`Fixture fieldCount must be at least ${MIN_BASE_FIELD_COUNT}.`);
  }
  if (definition.duplicateMaterialRatio < 0 || definition.duplicateMaterialRatio >= 1) {
    throw new RangeError('duplicateMaterialRatio must be in [0, 1).');
  }
  if (definition.validationErrorRate < 0 || definition.validationErrorRate > 1) {
    throw new RangeError('validationErrorRate must be in [0, 1].');
  }
}

function createFields(
  definition: BomFixtureDefinition,
  index: number,
  invalid: boolean,
): Readonly<Record<string, BomValue>> {
  const quantity: BomDecimal = Object.freeze({
    $type: 'decimal',
    value: invalid ? 'NaN' : `${(index % 997) + 1}.000`,
    unit: 'pcs',
  });
  const fields: Record<string, BomValue> = {
    name: `Material ${index.toString().padStart(6, '0')}`,
    quantity,
    category: `C${index % 12}`,
    description: `Fixture row ${index}`,
  };

  for (let field = MIN_BASE_FIELD_COUNT; field < definition.fieldCount; field += 1) {
    const fieldId = `custom${String(field + 1).padStart(2, '0')}`;
    fields[fieldId] = field % 3 === 0 ? index % 10_000 : `V${field}-${index % 101}`;
  }

  return Object.freeze(fields);
}

function fingerprintDefinition(definition: BomFixtureDefinition): string {
  const canonical = [
    definition.id,
    definition.generatorVersion,
    definition.seed,
    definition.nodeCount,
    definition.maxDepth,
    definition.hierarchy,
    definition.fieldCount,
    definition.duplicateMaterialRatio,
    definition.validationErrorRate,
  ].join('|');
  let hash = 0x811c9dc5;

  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createFixtureManifestEntry(
  definition: BomFixtureDefinition,
): BomFixtureManifestEntry {
  assertDefinition(definition);
  return Object.freeze({
    id: definition.id,
    definitionFingerprint: fingerprintDefinition(definition),
    generatorVersion: definition.generatorVersion,
    schemaVersion: createFixtureSchema(definition).schemaVersion,
    seed: definition.seed,
    nodeCount: definition.nodeCount,
    maxDepth: definition.maxDepth,
    hierarchy: definition.hierarchy,
    fieldCount: definition.fieldCount,
    duplicateMaterialRatio: definition.duplicateMaterialRatio,
    validationErrorRate: definition.validationErrorRate,
  });
}

export function generateFixture(
  definition: BomFixtureDefinition,
): GeneratedBomFixture<BomFields> {
  assertDefinition(definition);
  const hierarchyRandom = createPrng(definition.seed ^ 0x1357_9bdf);
  const materialRandom = createPrng(definition.seed ^ 0x2468_ace0);
  const errorRandom = createPrng(definition.seed ^ 0x55aa_55aa);
  const plans: MutableNodePlan[] = [];
  const eligibleParents: number[] = [];
  const childCounts = new Map<OccurrenceId | null, number>();
  const materialPoolSize = Math.max(
    1,
    Math.floor(definition.nodeCount * (1 - definition.duplicateMaterialRatio)),
  );
  const schema = createFixtureSchema(definition);

  for (let index = 0; index < definition.nodeCount; index += 1) {
    let parentIndex: number | null = null;

    if (definition.hierarchy === 'nested' && index > 0) {
      if (index < definition.maxDepth) {
        parentIndex = index - 1;
      } else {
        parentIndex = eligibleParents[Math.floor(hierarchyRandom() * eligibleParents.length)] ?? 0;
      }
    }

    const parent = parentIndex === null ? undefined : plans[parentIndex];
    const parentId = parent?.occurrenceId ?? null;
    const depth = parent === undefined ? 1 : parent.depth + 1;
    const siblingOrdinal = childCounts.get(parentId) ?? 0;
    childCounts.set(parentId, siblingOrdinal + 1);
    const occurrenceId = `occ-${definition.id}-${index.toString(36).padStart(8, '0')}`;
    const materialIndex =
      index < materialPoolSize
        ? index
        : Math.floor(materialRandom() * materialPoolSize);
    const invalid = errorRandom() < definition.validationErrorRate;
    const materialId = invalid ? undefined : `mat-${materialIndex.toString(36).padStart(7, '0')}`;
    const materialCode = invalid ? undefined : `MAT-${materialIndex.toString().padStart(7, '0')}`;
    const plan: MutableNodePlan = {
      occurrenceId,
      parentId,
      depth,
      positionKey: `p${siblingOrdinal.toString(36).padStart(8, '0')}`,
      ...(materialId === undefined ? {} : { materialId }),
      ...(materialCode === undefined ? {} : { materialCode }),
      fields: createFields(definition, index, invalid),
    };
    plans.push(plan);

    if (definition.hierarchy === 'nested' && depth < definition.maxDepth) {
      eligibleParents.push(index);
    }
  }

  const roots: OccurrenceId[] = [];
  const nodes: BomNode<BomFields>[] = plans.map((plan) => {
    if (plan.parentId === null) roots.push(plan.occurrenceId);

    return Object.freeze({
      occurrenceId: plan.occurrenceId,
      kind: 'material',
      ...(plan.materialId === undefined ? {} : { materialId: plan.materialId }),
      ...(plan.materialCode === undefined ? {} : { materialCode: plan.materialCode }),
      parentId: plan.parentId,
      positionKey: plan.positionKey,
      childrenState: 'complete',
      knownChildCount: childCounts.get(plan.occurrenceId) ?? 0,
      fields: plan.fields,
    });
  });
  const snapshot: BomDocumentSnapshot<BomFields> = Object.freeze({
    schemaVersion: schema.schemaVersion,
    documentId: `fixture:${definition.id}`,
    revision: `fixture:${definition.generatorVersion}:${definition.seed}`,
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: roots.length,
    roots: Object.freeze(roots),
    nodes: Object.freeze(nodes),
  });

  return Object.freeze({
    definition: Object.freeze({ ...definition }),
    manifest: createFixtureManifestEntry(definition),
    schema,
    snapshot,
  });
}
