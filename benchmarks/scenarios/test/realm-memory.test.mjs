import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DISPOSABLE_REALM_MEMORY_PROTOCOL,
  FORMAL_MEMORY_SAMPLE_TIMING,
  REQUIRED_DISPOSABLE_REALM_RESOURCES,
  assessRealmMemoryScenario,
  summarizeRealmMemoryQualification,
} from '../scripts/lib/realm-memory.mjs';

const MIB = 1024 * 1024;
const FORMAL_TIMING = Object.freeze({ ...FORMAL_MEMORY_SAMPLE_TIMING });
const SMOKE_TIMING = Object.freeze({
  quietBeforeGcMs: 100,
  cdpGcCycles: 2,
  quietAfterGcMs: 100,
});

test('formal 1/3/5 evidence qualifies only with exact timing and complete Realm proof', () => {
  const result = summarizeRealmMemoryQualification(validPackage());

  assert.equal(result.protocolId, DISPOSABLE_REALM_MEMORY_PROTOCOL);
  assert.equal(result.status, 'qualified');
  assert.equal(result.qualified, true);
  assert.equal(result.normativeWithinLimit, true);
  assert.deepEqual(result.requiredInstanceCounts, [1, 3, 5]);
  assert.equal(result.noiseCalibration.status, 'qualified');
  assert.equal(result.noiseCalibration.noiseThresholdBytes, 100);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(
    result.scenarios.map((scenario) => scenario.instanceCount),
    [1, 3, 5],
  );
  assert.equal(result.scenarios.every((scenario) => scenario.qualified), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.scenarios), true);
});

test('smoke evidence remains unqualified even when every diagnostic check passes', () => {
  const input = validPackage({ mode: 'smoke', timing: SMOKE_TIMING });
  const result = summarizeRealmMemoryQualification(input);

  assert.equal(result.status, 'unqualified');
  assert.equal(result.qualified, false);
  assert.equal(result.normativeWithinLimit, null);
  assertBlocker(result, 'SMOKE_MODE_NOT_QUALIFYING', 'unqualified');
  assert.equal(
    result.blockers.some((entry) => entry.code === 'FORMAL_MEMORY_TIMING_MISMATCH'),
    false,
  );
});

test('formal mode validates the full timing tuple on every idle and lifecycle sample', () => {
  const idleMismatch = validPackage();
  idleMismatch.idleSamples[4].timing = {
    ...FORMAL_TIMING,
    quietBeforeGcMs: 29_999,
  };
  const idleResult = summarizeRealmMemoryQualification(idleMismatch);
  assert.equal(idleResult.status, 'unqualified');
  assertBlocker(
    idleResult,
    'FORMAL_MEMORY_TIMING_MISMATCH',
    'unqualified',
    { phase: 'idle-noise', sampleIndex: 4 },
  );

  const lifecycleMismatch = validPackage();
  lifecycleMismatch.scenarios[1].measurement.afterRemoval.timing = {
    ...FORMAL_TIMING,
    cdpGcCycles: 1,
  };
  const lifecycleResult = summarizeRealmMemoryQualification(lifecycleMismatch);
  assert.equal(lifecycleResult.status, 'unqualified');
  assertBlocker(
    lifecycleResult.scenarios[1],
    'FORMAL_MEMORY_TIMING_MISMATCH',
    'unqualified',
    { phase: 'measurement.afterRemoval' },
  );
});

test('fewer than ten idle samples cannot produce a retention verdict', () => {
  const input = validPackage();
  input.idleSamples = input.idleSamples.slice(0, 9);
  const result = summarizeRealmMemoryQualification(input);

  assert.equal(result.status, 'unqualified');
  assert.equal(result.normativeWithinLimit, null);
  assertBlocker(result, 'INSUFFICIENT_IDLE_SAMPLES', 'unqualified');
  assert.equal(
    result.scenarios.every(
      (scenario) => scenario.measurement.normativeWithinLimit === null,
    ),
    true,
  );
});

test('warmup must match instance count, viewport, DPR, and Canvas layer count', () => {
  const input = validPackage();
  input.scenarios[0].matchedWarmup.configuration.devicePixelRatio = 1;
  const result = summarizeRealmMemoryQualification(input);

  assert.equal(result.status, 'unqualified');
  assertBlocker(
    result.scenarios[0],
    'MATCHED_WARMUP_CONFIGURATION_MISMATCH',
    'unqualified',
  );
});

test('an empty control Realm delta outside calibrated noise is unqualified, not failed', () => {
  const input = validPackage();
  input.scenarios[2].control.rawDeltaBytes = 101;
  const result = summarizeRealmMemoryQualification(input);
  const scenario = result.scenarios[2];

  assert.equal(result.status, 'unqualified');
  assert.equal(scenario.status, 'unqualified');
  assert.equal(scenario.control.noiseAdjustment.adjustedDeltaBytes, 101);
  assertBlocker(
    scenario,
    'CONTROL_REALM_DELTA_EXCEEDS_NOISE',
    'unqualified',
  );
  assert.equal(scenario.measurement.normativeWithinLimit, null);
});

test('warmup and control ready counts must describe the instances actually created', () => {
  const input = validPackage();
  input.scenarios[0].matchedWarmup.ready.instanceCount = 3;
  input.scenarios[0].control.ready.instanceCount = 1;
  const result = summarizeRealmMemoryQualification(input);

  assert.equal(result.status, 'unqualified');
  assertBlocker(
    result.scenarios[0],
    'MATCHED_WARMUP_READY_INSTANCE_COUNT_MISMATCH',
    'unqualified',
  );
  assertBlocker(
    result.scenarios[0],
    'CONTROL_REALM_READY_INSTANCE_COUNT_MISMATCH',
    'unqualified',
  );
});

test('remaining child attribution after removal is an observed hard failure', () => {
  const input = validPackage();
  input.scenarios[0].measurement.afterRemoval.childAttributionPresent = true;
  const result = summarizeRealmMemoryQualification(input);

  assert.equal(result.status, 'failed');
  assert.equal(result.normativeWithinLimit, null);
  assertBlocker(
    result.scenarios[0],
    'CHILD_REALM_ATTRIBUTION_REMAINS',
    'failed',
    { phase: 'measurement.afterRemoval' },
  );
});

test('non-zero resources fail while unavailable typed ledgers stay unqualified', () => {
  const leaked = validPackage();
  const leakedWorker = leaked.scenarios[1].measurement.destroy
    .resourceAssertions.find((entry) => entry.resource === 'worker');
  leakedWorker.status = 'failed';
  leakedWorker.outstanding = 1;
  const leakedResult = summarizeRealmMemoryQualification(leaked);

  assert.equal(leakedResult.status, 'failed');
  assertBlocker(
    leakedResult.scenarios[1],
    'RESOURCE_NOT_RELEASED',
    'failed',
    { resource: 'worker' },
  );

  const unavailable = validPackage();
  const listener = unavailable.scenarios[1].measurement.destroy
    .resourceAssertions.find((entry) => entry.resource === 'dom-listener');
  listener.status = 'unavailable';
  listener.supported = false;
  listener.outstanding = null;
  const unavailableResult = summarizeRealmMemoryQualification(unavailable);

  assert.equal(unavailableResult.status, 'unqualified');
  assertBlocker(
    unavailableResult.scenarios[1],
    'RESOURCE_LEDGER_UNAVAILABLE',
    'unqualified',
    { resource: 'dom-listener' },
  );
});

test('noise-adjusted retention above 5 MiB is a hard failure', () => {
  const input = validPackage();
  input.scenarios[2].measurement.rawDeltaBytes = 5 * MIB + 1;
  const result = summarizeRealmMemoryQualification(input);
  const scenario = result.scenarios[2];

  assert.equal(result.status, 'failed');
  assert.equal(result.normativeWithinLimit, false);
  assert.equal(scenario.status, 'failed');
  assert.equal(scenario.measurement.retainedBytes, 5 * MIB + 1);
  assert.equal(scenario.measurement.normativeWithinLimit, false);
  assertBlocker(
    scenario,
    'DESTROY_RETENTION_LIMIT_EXCEEDED',
    'failed',
  );
});

test('changes exactly at the noise and retention limits remain within the gates', () => {
  const input = validPackage();
  input.scenarios[0].control.rawDeltaBytes = -100;
  input.scenarios[0].measurement.rawDeltaBytes = 100;
  input.scenarios[2].measurement.rawDeltaBytes = 5 * MIB;
  const result = summarizeRealmMemoryQualification(input);

  assert.equal(result.status, 'qualified');
  assert.equal(
    result.scenarios[0].control.noiseAdjustment.adjustedDeltaBytes,
    0,
  );
  assert.equal(
    result.scenarios[0].measurement.noiseAdjustment.adjustedDeltaBytes,
    0,
  );
  assert.equal(result.scenarios[2].measurement.retainedBytes, 5 * MIB);
  assert.equal(result.normativeWithinLimit, true);
});

test('exactly one scenario for each of 1, 3, and 5 instances is mandatory', () => {
  const missing = validPackage();
  missing.scenarios = missing.scenarios.filter(
    (scenario) => scenario.instanceCount !== 3,
  );
  const missingResult = summarizeRealmMemoryQualification(missing);
  assert.equal(missingResult.status, 'unqualified');
  assertBlocker(
    missingResult,
    'MISSING_INSTANCE_COUNT_SCENARIO',
    'unqualified',
    { instanceCount: 3 },
  );

  const duplicate = validPackage();
  duplicate.scenarios.push(validScenario(3));
  const duplicateResult = summarizeRealmMemoryQualification(duplicate);
  assert.equal(duplicateResult.status, 'unqualified');
  assertBlocker(
    duplicateResult,
    'DUPLICATE_INSTANCE_COUNT_SCENARIO',
    'unqualified',
    { instanceCount: 3 },
  );
});

test('missing ready attribution and malformed resource coverage fail closed', () => {
  const input = validPackage();
  input.scenarios[0].measurement.ready.childAttributionPresent = false;
  input.scenarios[0].measurement.destroy.resourceAssertions.pop();
  const result = summarizeRealmMemoryQualification(input);

  assert.equal(result.status, 'unqualified');
  assertBlocker(
    result.scenarios[0],
    'READY_CHILD_ATTRIBUTION_MISSING',
    'unqualified',
  );
  assertBlocker(
    result.scenarios[0],
    'RESOURCE_ASSERTION_MISSING',
    'unqualified',
    { resource: 'interval' },
  );
});

test('unavailable UA-memory measurements are unqualified rather than hard failures', () => {
  const input = validPackage();
  input.scenarios[0].measurement.ready.measured = false;
  input.scenarios[0].measurement.afterRemoval.measured = false;
  const result = summarizeRealmMemoryQualification(input);

  assert.equal(result.status, 'unqualified');
  assertBlocker(
    result.scenarios[0],
    'REALM_READY_MEMORY_UNAVAILABLE',
    'unqualified',
  );
  assertBlocker(
    result.scenarios[0],
    'AFTER_REMOVAL_MEMORY_UNAVAILABLE',
    'unqualified',
  );
});

test('the single-scenario API preserves failed-over-unqualified precedence', () => {
  const input = validPackage();
  const calibration = summarizeRealmMemoryQualification(input).noiseCalibration;
  const scenario = validScenario(1);
  scenario.control.rawDeltaBytes = 101;
  scenario.measurement.afterRemoval.childAttributionPresent = true;

  const result = assessRealmMemoryScenario({
    mode: 'formal',
    noiseCalibration: calibration,
    scenario,
  });

  assert.equal(result.status, 'failed');
  assertBlocker(
    result,
    'CONTROL_REALM_DELTA_EXCEEDS_NOISE',
    'unqualified',
  );
  assertBlocker(
    result,
    'CHILD_REALM_ATTRIBUTION_REMAINS',
    'failed',
  );
});

function validPackage({ mode = 'formal', timing = FORMAL_TIMING } = {}) {
  return {
    mode,
    idleSamples: idleSamples(timing),
    scenarios: [1, 3, 5].map((count) => validScenario(count, timing)),
  };
}

function idleSamples(timing) {
  return Array.from({ length: 10 }, (_, index) => ({
    supported: true,
    timestampMs: index + 1,
    bytes: 10 * MIB + index * 100,
    timing: { ...timing },
  }));
}

function validScenario(instanceCount, timing = FORMAL_TIMING) {
  const configuration = realmConfiguration(instanceCount);
  return {
    instanceCount,
    configuration,
    matchedWarmup: {
      performed: true,
      configuration: clone(configuration),
      ready: readyEvidence(instanceCount),
      destroy: {
        passed: true,
        resourceAssertions: resourceAssertions(),
      },
      release: releaseEvidence(),
      afterRemoval: afterRemovalEvidence(timing),
    },
    control: {
      instanceCount: 0,
      ready: readyEvidence(0),
      release: releaseEvidence(),
      afterRemoval: afterRemovalEvidence(timing),
      rawDeltaBytes: 50,
    },
    measurement: {
      ready: readyEvidence(instanceCount),
      destroy: {
        passed: true,
        resourceAssertions: resourceAssertions(),
      },
      release: releaseEvidence(),
      afterRemoval: afterRemovalEvidence(timing),
      rawDeltaBytes: MIB,
    },
  };
}

function realmConfiguration(instanceCount) {
  return {
    instanceCount,
    viewport: { width: 1440, height: 900 },
    devicePixelRatio: 2,
    canvasLayerCount: 3,
  };
}

function readyEvidence(instanceCount) {
  return {
    passed: true,
    measured: true,
    childAttributionPresent: true,
    instanceCount,
  };
}

function releaseEvidence() {
  return {
    released: true,
    frameRemoved: true,
    parentReferencesReleased: true,
  };
}

function afterRemovalEvidence(timing) {
  return {
    measured: true,
    childAttributionPresent: false,
    timing: { ...timing },
  };
}

function resourceAssertions() {
  return REQUIRED_DISPOSABLE_REALM_RESOURCES.map((resource) => ({
    resource,
    status: 'passed',
    supported: true,
    outstanding: 0,
  }));
}

function assertBlocker(
  result,
  code,
  classification,
  expected = {},
) {
  const blocker = result.blockers.find(
    (entry) =>
      entry.code === code &&
      entry.classification === classification &&
      (expected.phase === undefined || entry.phase === expected.phase) &&
      (expected.instanceCount === undefined ||
        entry.instanceCount === expected.instanceCount) &&
      (expected.resource === undefined || entry.resource === expected.resource) &&
      (expected.sampleIndex === undefined ||
        entry.sampleIndex === expected.sampleIndex),
  );
  assert.notEqual(
    blocker,
    undefined,
    `Missing ${classification} blocker ${code}: ${JSON.stringify(result.blockers)}`,
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
