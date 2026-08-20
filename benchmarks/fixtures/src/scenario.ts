import type { BomSchema } from '@bom-editor/contracts';

import { BOM_10K_D6 } from './definitions.js';
import type {
  BomBenchmarkScenarioDefinition,
  BomBenchmarkScenarioManifestEntry,
  BomFixtureDefinition,
} from './types.js';

const MIB = 1024 * 1024;

export const F3_10K_EDIT_SCENARIO = deepFreezeScenario({
  id: 'F3-10K-EDIT',
  scenarioVersion: '1.1.0',
  fixtureId: BOM_10K_D6.id,
  viewport: {
    width: 1920,
    height: 1080,
    devicePixelRatio: 2,
  },
  font: {
    family: 'Arial',
    sizePx: 13,
    weight: 400,
    sha256: 'b3658eadae55e682b5f69eb64c439c1ecc8f196c0bb8d4756d145d13bc86476a',
  },
  layout: {
    headerHeight: 36,
    rowHeight: 28,
    overscanPx: 280,
    canvasLayerCount: 3,
    maxBackingStoreBytes: 128 * MIB,
  },
  expansion: {
    strategy: 'all',
  },
  columns: [
    {
      columnId: 'materialCode',
      label: 'Material code',
      source: { kind: 'node', property: 'materialCode' },
      width: 300,
      frozen: true,
      editable: false,
    },
    {
      columnId: 'name',
      label: 'Name',
      source: { kind: 'field', fieldId: 'name' },
      width: 220,
      frozen: false,
      editable: true,
    },
    {
      columnId: 'quantity',
      label: 'Quantity',
      source: { kind: 'field', fieldId: 'quantity' },
      width: 120,
      frozen: false,
      editable: true,
    },
    {
      columnId: 'category',
      label: 'Category',
      source: { kind: 'field', fieldId: 'category' },
      width: 120,
      frozen: false,
      editable: true,
    },
    {
      columnId: 'description',
      label: 'Description',
      source: { kind: 'field', fieldId: 'description' },
      width: 360,
      frozen: false,
      editable: true,
    },
    {
      columnId: 'custom05',
      label: 'Custom 05',
      source: { kind: 'field', fieldId: 'custom05' },
      width: 140,
      frozen: false,
      editable: true,
    },
    {
      columnId: 'custom06',
      label: 'Custom 06',
      source: { kind: 'field', fieldId: 'custom06' },
      width: 140,
      frozen: false,
      editable: true,
    },
    {
      columnId: 'custom07',
      label: 'Custom 07',
      source: { kind: 'field', fieldId: 'custom07' },
      width: 140,
      frozen: false,
      editable: true,
    },
    {
      columnId: 'custom08',
      label: 'Custom 08',
      source: { kind: 'field', fieldId: 'custom08' },
      width: 140,
      frozen: false,
      editable: true,
    },
    {
      columnId: 'custom09',
      label: 'Custom 09',
      source: { kind: 'field', fieldId: 'custom09' },
      width: 140,
      frozen: false,
      editable: true,
    },
  ],
  interaction: {
    targetOccurrenceOrdinal: 1234,
    targetColumnId: 'name',
    replacementText: 'Material 001234 revised',
    commitKey: 'Enter',
  },
  scrollTrajectory: {
    protocol: 'bom-f3-scroll-trajectory/v1',
    axis: 'vertical',
    waveform: 'triangle',
    direction: 'forward-then-reverse',
    easing: 'linear',
    driver: 'requestAnimationFrame',
    cycles: 1,
    durationMs: 30_000,
  },
  measurement: {
    warmupRuns: 5,
    sampleRuns: 30,
    refreshRateHz: 60,
    scrollDurationMs: 30_000,
    startupP95Ms: 250,
    inputP95Ms: 30,
    inputP99Ms: 50,
    frameP95Ms: 16.7,
    frameP99Ms: 33.3,
  },
} satisfies BomBenchmarkScenarioDefinition);

export function validateBenchmarkScenario(
  scenario: BomBenchmarkScenarioDefinition,
  fixture: BomFixtureDefinition,
  schema: BomSchema,
): readonly string[] {
  const errors: string[] = [];
  if (scenario.scenarioVersion !== '1.1.0') {
    errors.push('unsupported scenarioVersion');
  }
  if (scenario.fixtureId !== fixture.id) {
    errors.push('fixtureId does not match fixture');
  }
  if (
    scenario.viewport.width <= 0 ||
    scenario.viewport.height <= 0 ||
    scenario.viewport.devicePixelRatio <= 0
  ) {
    errors.push('viewport dimensions and DPR must be positive');
  }
  if (
    scenario.layout.headerHeight <= 0 ||
    scenario.layout.rowHeight <= 0 ||
    scenario.layout.overscanPx < 0 ||
    scenario.layout.canvasLayerCount < 1 ||
    scenario.layout.maxBackingStoreBytes < 1
  ) {
    errors.push('layout values are outside their valid ranges');
  }

  const fieldIds = new Set(schema.fields.map((field) => field.fieldId));
  const columnIds = new Set<string>();
  for (const column of scenario.columns) {
    if (columnIds.has(column.columnId)) {
      errors.push('duplicate columnId: ' + column.columnId);
    }
    columnIds.add(column.columnId);
    if (column.width <= 0) {
      errors.push('column width must be positive: ' + column.columnId);
    }
    if (column.source.kind === 'field' && !fieldIds.has(column.source.fieldId)) {
      errors.push('unknown fieldId: ' + column.source.fieldId);
    }
  }

  if (!columnIds.has(scenario.interaction.targetColumnId)) {
    errors.push('interaction target column is missing');
  }
  if (
    scenario.interaction.targetOccurrenceOrdinal < 0 ||
    scenario.interaction.targetOccurrenceOrdinal >= fixture.nodeCount
  ) {
    errors.push('interaction target occurrence is outside the fixture');
  }
  validateScrollTrajectory(scenario, errors);
  if (
    scenario.measurement.warmupRuns < 5 ||
    scenario.measurement.sampleRuns < 30 ||
    scenario.measurement.refreshRateHz !== 60 ||
    scenario.measurement.scrollDurationMs < 30_000
  ) {
    errors.push('measurement sample counts are below the normative minimum');
  }
  if (estimateBackingStoreBytes(scenario) > scenario.layout.maxBackingStoreBytes) {
    errors.push('canvas backing store exceeds the scenario budget');
  }
  return Object.freeze(errors);
}

function validateScrollTrajectory(
  scenario: BomBenchmarkScenarioDefinition,
  errors: string[],
): void {
  const trajectory = scenario.scrollTrajectory;
  if (trajectory === null || typeof trajectory !== 'object') {
    errors.push('scrollTrajectory is required');
    return;
  }
  if (trajectory.protocol !== 'bom-f3-scroll-trajectory/v1') {
    errors.push('unsupported scrollTrajectory protocol');
  }
  if (trajectory.axis !== 'vertical') {
    errors.push('unsupported scrollTrajectory axis');
  }
  if (trajectory.waveform !== 'triangle') {
    errors.push('unsupported scrollTrajectory waveform');
  }
  if (trajectory.direction !== 'forward-then-reverse') {
    errors.push('unsupported scrollTrajectory direction');
  }
  if (trajectory.easing !== 'linear') {
    errors.push('unsupported scrollTrajectory easing');
  }
  if (trajectory.driver !== 'requestAnimationFrame') {
    errors.push('unsupported scrollTrajectory driver');
  }
  if (trajectory.cycles !== 1) {
    errors.push('scrollTrajectory cycles must equal 1');
  }
  if (trajectory.durationMs !== 30_000) {
    errors.push('scrollTrajectory durationMs must equal 30000');
  }
  if (trajectory.durationMs !== scenario.measurement.scrollDurationMs) {
    errors.push('scrollTrajectory durationMs must match measurement.scrollDurationMs');
  }
}

export function createBenchmarkScenarioManifestEntry(
  scenario: BomBenchmarkScenarioDefinition,
): BomBenchmarkScenarioManifestEntry {
  return Object.freeze({
    id: scenario.id,
    scenarioVersion: scenario.scenarioVersion,
    fixtureId: scenario.fixtureId,
    scenarioFingerprint: fingerprint(JSON.stringify(scenario)),
  });
}

function estimateBackingStoreBytes(
  scenario: BomBenchmarkScenarioDefinition,
): number {
  return (
    scenario.viewport.width *
    scenario.viewport.height *
    scenario.viewport.devicePixelRatio ** 2 *
    4 *
    scenario.layout.canvasLayerCount
  );
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return 'fnv1a32:' + (hash >>> 0).toString(16).padStart(8, '0');
}

function deepFreezeScenario<T extends BomBenchmarkScenarioDefinition>(
  scenario: T,
): T {
  for (const column of scenario.columns) {
    Object.freeze(column.source);
    Object.freeze(column);
  }
  Object.freeze(scenario.columns);
  Object.freeze(scenario.viewport);
  Object.freeze(scenario.font);
  Object.freeze(scenario.layout);
  Object.freeze(scenario.expansion);
  Object.freeze(scenario.interaction);
  Object.freeze(scenario.scrollTrajectory);
  Object.freeze(scenario.measurement);
  return Object.freeze(scenario);
}
