import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOM_10K_D6,
  F3_10K_EDIT_SCENARIO,
  createBenchmarkScenarioManifestEntry,
  createFixtureSchema,
  validateBenchmarkScenario,
} from '../dist/index.js';

test('F3 10K scenario fixes the complete rendering and editing conditions', () => {
  const schema = createFixtureSchema(BOM_10K_D6);
  assert.deepEqual(
    validateBenchmarkScenario(F3_10K_EDIT_SCENARIO, BOM_10K_D6, schema),
    [],
  );
  assert.equal(F3_10K_EDIT_SCENARIO.expansion.strategy, 'all');
  assert.ok(F3_10K_EDIT_SCENARIO.columns.some((column) => column.frozen));
  assert.ok(F3_10K_EDIT_SCENARIO.columns.some((column) => column.editable));
  assert.equal(Object.isFrozen(F3_10K_EDIT_SCENARIO.columns), true);
  assert.equal(F3_10K_EDIT_SCENARIO.scenarioVersion, '1.1.0');
  assert.equal(F3_10K_EDIT_SCENARIO.measurement.refreshRateHz, 60);
  assert.equal(F3_10K_EDIT_SCENARIO.measurement.scrollDurationMs, 30_000);
  assert.deepEqual(F3_10K_EDIT_SCENARIO.scrollTrajectory, {
    protocol: 'bom-f3-scroll-trajectory/v1',
    axis: 'vertical',
    waveform: 'triangle',
    direction: 'forward-then-reverse',
    easing: 'linear',
    driver: 'requestAnimationFrame',
    cycles: 1,
    durationMs: 30_000,
  });
  assert.equal(Object.isFrozen(F3_10K_EDIT_SCENARIO.scrollTrajectory), true);
  assert.equal(
    F3_10K_EDIT_SCENARIO.scrollTrajectory.durationMs,
    F3_10K_EDIT_SCENARIO.measurement.scrollDurationMs,
  );

  const bytes =
    F3_10K_EDIT_SCENARIO.viewport.width *
    F3_10K_EDIT_SCENARIO.viewport.height *
    F3_10K_EDIT_SCENARIO.viewport.devicePixelRatio ** 2 *
    4 *
    F3_10K_EDIT_SCENARIO.layout.canvasLayerCount;
  assert.ok(bytes <= F3_10K_EDIT_SCENARIO.layout.maxBackingStoreBytes);
});

test('scenario manifest is deterministic and validation rejects drift', () => {
  assert.deepEqual(
    createBenchmarkScenarioManifestEntry(F3_10K_EDIT_SCENARIO),
    createBenchmarkScenarioManifestEntry(F3_10K_EDIT_SCENARIO),
  );

  const invalid = {
    ...F3_10K_EDIT_SCENARIO,
    fixtureId: 'wrong-fixture',
    columns: [
      ...F3_10K_EDIT_SCENARIO.columns,
      F3_10K_EDIT_SCENARIO.columns[0],
      {
        ...F3_10K_EDIT_SCENARIO.columns[1],
        columnId: 'unknown-field',
        source: { kind: 'field', fieldId: 'not-in-schema' },
      },
    ],
  };
  const errors = validateBenchmarkScenario(
    invalid,
    BOM_10K_D6,
    createFixtureSchema(BOM_10K_D6),
  );
  assert.ok(errors.some((error) => error.startsWith('fixtureId')));
  assert.ok(errors.some((error) => error.startsWith('duplicate columnId')));
  assert.ok(errors.some((error) => error.startsWith('unknown fieldId')));
});

test('scenario validation rejects scroll trajectory protocol drift', () => {
  const schema = createFixtureSchema(BOM_10K_D6);
  const invalidValues = [
    ['protocol', 'bom-f3-scroll-trajectory/v2', 'unsupported scrollTrajectory protocol'],
    ['axis', 'horizontal', 'unsupported scrollTrajectory axis'],
    ['waveform', 'sawtooth', 'unsupported scrollTrajectory waveform'],
    ['direction', 'forward', 'unsupported scrollTrajectory direction'],
    ['easing', 'ease-in-out', 'unsupported scrollTrajectory easing'],
    ['driver', 'setInterval', 'unsupported scrollTrajectory driver'],
    ['cycles', 2, 'scrollTrajectory cycles must equal 1'],
    ['durationMs', 29_999, 'scrollTrajectory durationMs must equal 30000'],
  ];

  for (const [property, value, expectedError] of invalidValues) {
    const invalid = {
      ...F3_10K_EDIT_SCENARIO,
      scrollTrajectory: {
        ...F3_10K_EDIT_SCENARIO.scrollTrajectory,
        [property]: value,
      },
    };
    const errors = validateBenchmarkScenario(invalid, BOM_10K_D6, schema);
    assert.ok(errors.includes(expectedError), property + ': ' + errors.join(', '));
  }

  const { scrollTrajectory: _scrollTrajectory, ...missingTrajectory } =
    F3_10K_EDIT_SCENARIO;
  assert.ok(
    validateBenchmarkScenario(missingTrajectory, BOM_10K_D6, schema).includes(
      'scrollTrajectory is required',
    ),
  );

  const mismatchedDuration = {
    ...F3_10K_EDIT_SCENARIO,
    measurement: {
      ...F3_10K_EDIT_SCENARIO.measurement,
      scrollDurationMs: 30_001,
    },
  };
  assert.ok(
    validateBenchmarkScenario(mismatchedDuration, BOM_10K_D6, schema).includes(
      'scrollTrajectory durationMs must match measurement.scrollDurationMs',
    ),
  );

  const oldVersion = {
    ...F3_10K_EDIT_SCENARIO,
    scenarioVersion: '1.0.0',
  };
  assert.ok(
    validateBenchmarkScenario(oldVersion, BOM_10K_D6, schema).includes(
      'unsupported scenarioVersion',
    ),
  );
});
