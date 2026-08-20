import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MINIMUM_IDLE_UA_MEMORY_SAMPLES,
  UA_MEMORY_IDLE_NOISE_PROTOCOL,
  UA_MEMORY_NOISE_ADJUSTMENT_SCHEMA,
  UA_MEMORY_NOISE_CALIBRATION_SCHEMA,
  applyUaMemoryNoiseThreshold,
  calibrateUaMemoryIdleNoise,
} from '../scripts/lib/memory-noise.mjs';

test('calibration uses adjacent absolute differences and nearest-rank P95', () => {
  const differences = Array.from({ length: 20 }, (_, index) => index + 1);
  const calibration = calibrateUaMemoryIdleNoise(samplesFromDifferences(differences));

  assert.equal(calibration.schema, UA_MEMORY_NOISE_CALIBRATION_SCHEMA);
  assert.equal(calibration.protocol.id, UA_MEMORY_IDLE_NOISE_PROTOCOL);
  assert.equal(calibration.protocol.percentileMethod, 'nearest-rank');
  assert.equal(calibration.protocol.percentile, 0.95);
  assert.equal(calibration.status, 'qualified');
  assert.equal(calibration.calibrated, true);
  assert.equal(calibration.sampleCount, 21);
  assert.equal(calibration.adjacentDifferenceCount, 20);
  assert.deepEqual(calibration.adjacentAbsoluteDifferencesBytes, differences);
  assert.equal(calibration.noiseThresholdBytes, 19);
  assert.equal(calibration.blocker, null);
  assert.equal(Object.isFrozen(calibration), true);
  assert.equal(Object.isFrozen(calibration.adjacentAbsoluteDifferencesBytes), true);
});

test('exactly ten idle samples satisfy the normative sample floor', () => {
  const calibration = calibrateUaMemoryIdleNoise(samplesFromDifferences(
    Array.from({ length: MINIMUM_IDLE_UA_MEMORY_SAMPLES - 1 }, (_, index) => index + 1),
  ));

  assert.equal(calibration.status, 'qualified');
  assert.equal(calibration.sampleCount, MINIMUM_IDLE_UA_MEMORY_SAMPLES);
  assert.equal(calibration.adjacentDifferenceCount, 9);
  assert.equal(calibration.noiseThresholdBytes, 9);
});

test('sample input and sample floor failures remain unqualified without a threshold', () => {
  const malformed = calibrateUaMemoryIdleNoise(null);
  const insufficient = calibrateUaMemoryIdleNoise(
    samplesFromDifferences(Array.from({ length: 8 }, () => 1)),
  );

  assertFailure(malformed, 'INVALID_SAMPLE_INPUT', 0);
  assertFailure(insufficient, 'INSUFFICIENT_IDLE_SAMPLES', 9);
});

test('unsupported and invalid byte measurements fail closed at their sample index', () => {
  for (const [replacement, expectedCode] of [
    [{ supported: false, timestampMs: 4, bytes: null }, 'UA_MEMORY_UNSUPPORTED'],
    [{ supported: true, timestampMs: 4, bytes: Number.NaN }, 'NON_FINITE_SAMPLE_BYTES'],
    [{ supported: true, timestampMs: 4, bytes: Number.POSITIVE_INFINITY }, 'NON_FINITE_SAMPLE_BYTES'],
    [{ supported: true, timestampMs: 4, bytes: -1 }, 'NEGATIVE_SAMPLE_BYTES'],
  ]) {
    const samples = validSamples();
    samples[4] = replacement;
    const calibration = calibrateUaMemoryIdleNoise(samples);

    assertFailure(calibration, expectedCode, samples.length, 4);
  }
});

test('non-finite, negative, duplicate, and decreasing timestamps fail closed', () => {
  for (const [timestampMs, expectedCode] of [
    [Number.NaN, 'NON_FINITE_SAMPLE_TIMESTAMP'],
    [Number.POSITIVE_INFINITY, 'NON_FINITE_SAMPLE_TIMESTAMP'],
    [-1, 'NEGATIVE_SAMPLE_TIMESTAMP'],
    [3, 'NON_MONOTONIC_SAMPLE_TIMESTAMPS'],
    [2, 'NON_MONOTONIC_SAMPLE_TIMESTAMPS'],
  ]) {
    const samples = validSamples();
    samples[4] = { ...samples[4], timestampMs };
    const calibration = calibrateUaMemoryIdleNoise(samples);

    assertFailure(calibration, expectedCode, samples.length, 4);
  }
});

test('absolute changes at the threshold are zero and changes above it retain sign', () => {
  const calibration = calibrateUaMemoryIdleNoise(samplesFromDifferences(
    Array.from({ length: 9 }, () => 7),
  ));

  assert.deepEqual(applyUaMemoryNoiseThreshold({ deltaBytes: 7, calibration }), {
    schema: UA_MEMORY_NOISE_ADJUSTMENT_SCHEMA,
    protocolId: UA_MEMORY_IDLE_NOISE_PROTOCOL,
    status: 'qualified',
    applied: true,
    blocker: null,
    rawDeltaBytes: 7,
    absoluteDeltaBytes: 7,
    noiseThresholdBytes: 7,
    withinNoiseThreshold: true,
    adjustedDeltaBytes: 0,
  });
  assert.equal(
    applyUaMemoryNoiseThreshold({ deltaBytes: -7, calibration }).adjustedDeltaBytes,
    0,
  );
  assert.equal(
    applyUaMemoryNoiseThreshold({ deltaBytes: 7.000_001, calibration }).adjustedDeltaBytes,
    7.000_001,
  );
  assert.equal(
    applyUaMemoryNoiseThreshold({ deltaBytes: -8, calibration }).adjustedDeltaBytes,
    -8,
  );
});

test('invalid deltas and unqualified, incompatible, or forged calibrations fail closed', () => {
  const qualified = calibrateUaMemoryIdleNoise(samplesFromDifferences(
    Array.from({ length: 9 }, () => 2),
  ));
  const unqualified = calibrateUaMemoryIdleNoise(validSamples().slice(0, 9));
  const incompatible = {
    ...qualified,
    protocol: { ...qualified.protocol, id: 'ua-memory-idle-noise/v2' },
  };
  const forgedThreshold = { ...qualified, noiseThresholdBytes: 1 };

  assertAdjustmentFailure(
    applyUaMemoryNoiseThreshold({ deltaBytes: Number.NaN, calibration: qualified }),
    'NON_FINITE_DELTA_BYTES',
  );
  assertAdjustmentFailure(
    applyUaMemoryNoiseThreshold({ deltaBytes: 1, calibration: unqualified }),
    'UNQUALIFIED_NOISE_CALIBRATION',
  );
  assertAdjustmentFailure(
    applyUaMemoryNoiseThreshold({ deltaBytes: 1, calibration: incompatible }),
    'INCOMPATIBLE_NOISE_PROTOCOL',
  );
  assertAdjustmentFailure(
    applyUaMemoryNoiseThreshold({ deltaBytes: 1, calibration: forgedThreshold }),
    'INVALID_NOISE_THRESHOLD',
  );
});

function validSamples() {
  return Array.from({ length: 10 }, (_, index) => ({
    supported: true,
    timestampMs: index,
    bytes: 1_000 + index,
  }));
}

function samplesFromDifferences(differences) {
  let bytes = 1_000;
  return [
    { supported: true, timestampMs: 0, bytes },
    ...differences.map((difference, index) => {
      bytes += difference;
      return { supported: true, timestampMs: index + 1, bytes };
    }),
  ];
}

function assertFailure(result, code, sampleCount, sampleIndex = null) {
  assert.equal(result.schema, UA_MEMORY_NOISE_CALIBRATION_SCHEMA);
  assert.equal(result.protocol.id, UA_MEMORY_IDLE_NOISE_PROTOCOL);
  assert.equal(result.status, 'unqualified');
  assert.equal(result.calibrated, false);
  assert.equal(result.blocker.code, code);
  assert.equal(result.blocker.sampleIndex, sampleIndex);
  assert.equal(result.sampleCount, sampleCount);
  assert.equal(result.adjacentDifferenceCount, 0);
  assert.deepEqual(result.adjacentAbsoluteDifferencesBytes, []);
  assert.equal(result.noiseThresholdBytes, null);
}

function assertAdjustmentFailure(result, code) {
  assert.equal(result.schema, UA_MEMORY_NOISE_ADJUSTMENT_SCHEMA);
  assert.equal(result.protocolId, UA_MEMORY_IDLE_NOISE_PROTOCOL);
  assert.equal(result.status, 'unqualified');
  assert.equal(result.applied, false);
  assert.equal(result.blocker.code, code);
  assert.equal(result.rawDeltaBytes, null);
  assert.equal(result.noiseThresholdBytes, null);
  assert.equal(result.adjustedDeltaBytes, null);
}
