import type { BomFixtureDefinition } from './types.js';

export const BOM_10K_D6 = Object.freeze({
  id: 'BOM-10K-D6',
  generatorVersion: '1.0.0',
  seed: 10_006,
  nodeCount: 10_000,
  maxDepth: 6,
  hierarchy: 'nested',
  fieldCount: 30,
  duplicateMaterialRatio: 0.15,
  validationErrorRate: 0,
} as const satisfies BomFixtureDefinition);

export const BOM_100K_D6 = Object.freeze({
  id: 'BOM-100K-D6',
  generatorVersion: '1.0.0',
  seed: 100_006,
  nodeCount: 100_000,
  maxDepth: 6,
  hierarchy: 'nested',
  fieldCount: 30,
  duplicateMaterialRatio: 0.15,
  validationErrorRate: 0,
} as const satisfies BomFixtureDefinition);

export const BOM_100K_FLAT = Object.freeze({
  id: 'BOM-100K-FLAT',
  generatorVersion: '1.0.0',
  seed: 100_000,
  nodeCount: 100_000,
  maxDepth: 1,
  hierarchy: 'flat',
  fieldCount: 30,
  duplicateMaterialRatio: 0.15,
  validationErrorRate: 0,
} as const satisfies BomFixtureDefinition);

export const BOM_10K_D6_INVALID = Object.freeze({
  ...BOM_10K_D6,
  id: 'BOM-10K-D6-INVALID',
  seed: 21_006,
  validationErrorRate: 0.02,
} as const satisfies BomFixtureDefinition);

export const STANDARD_FIXTURE_DEFINITIONS = Object.freeze([
  BOM_10K_D6,
  BOM_100K_D6,
  BOM_100K_FLAT,
] as const satisfies readonly BomFixtureDefinition[]);

export const VALIDATION_FIXTURE_DEFINITIONS = Object.freeze([
  BOM_10K_D6_INVALID,
] as const satisfies readonly BomFixtureDefinition[]);

export const ALL_FIXTURE_DEFINITIONS = Object.freeze([
  ...STANDARD_FIXTURE_DEFINITIONS,
  ...VALIDATION_FIXTURE_DEFINITIONS,
] as const satisfies readonly BomFixtureDefinition[]);
