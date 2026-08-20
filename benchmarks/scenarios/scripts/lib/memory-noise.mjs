import { nearestRank } from './statistics.mjs';

export const UA_MEMORY_IDLE_NOISE_PROTOCOL =
  'ua-memory-idle-noise/v1';
export const UA_MEMORY_NOISE_CALIBRATION_SCHEMA =
  'bom-memory-noise-calibration/v1';
export const UA_MEMORY_NOISE_ADJUSTMENT_SCHEMA =
  'bom-memory-noise-adjustment/v1';
export const MINIMUM_IDLE_UA_MEMORY_SAMPLES = 10;

const P95 = 0.95;
const PROTOCOL = Object.freeze({
  id: UA_MEMORY_IDLE_NOISE_PROTOCOL,
  measurement: 'Performance.measureUserAgentSpecificMemory',
  sampleKind: 'idle',
  minimumSampleCount: MINIMUM_IDLE_UA_MEMORY_SAMPLES,
  timestampOrder: 'strictly-increasing',
  adjacentDifference: 'absolute-bytes',
  percentileMethod: 'nearest-rank',
  percentile: P95,
  thresholdRule: 'absolute-change-less-than-or-equal-to-threshold-becomes-zero',
});

/**
 * Calibrates the idle UA-memory noise floor from time-ordered measurements.
 * Invalid evidence is represented as an unqualified result so callers cannot
 * accidentally continue with a permissive numeric threshold.
 */
export function calibrateUaMemoryIdleNoise(samples) {
  const sampleCount = Array.isArray(samples) ? samples.length : 0;
  const invalidInput = validateCalibrationSamples(samples);
  if (invalidInput !== null) {
    return calibrationFailure(sampleCount, invalidInput);
  }

  const adjacentAbsoluteDifferencesBytes = [];
  for (let index = 1; index < samples.length; index += 1) {
    adjacentAbsoluteDifferencesBytes.push(
      Math.abs(samples[index].bytes - samples[index - 1].bytes),
    );
  }
  const frozenDifferences = Object.freeze(adjacentAbsoluteDifferencesBytes);
  const noiseThresholdBytes = nearestRank(frozenDifferences, P95);

  return Object.freeze({
    schema: UA_MEMORY_NOISE_CALIBRATION_SCHEMA,
    protocol: PROTOCOL,
    status: 'qualified',
    calibrated: true,
    blocker: null,
    sampleCount,
    adjacentDifferenceCount: frozenDifferences.length,
    adjacentAbsoluteDifferencesBytes: frozenDifferences,
    noiseThresholdBytes,
  });
}

/**
 * Applies a qualified calibration to a signed memory delta. Changes at or
 * below the calibrated absolute threshold are normalized to zero.
 */
export function applyUaMemoryNoiseThreshold({ deltaBytes, calibration } = {}) {
  const calibrationBlocker = validateCalibration(calibration);
  if (calibrationBlocker !== null) {
    return adjustmentFailure(calibrationBlocker);
  }
  if (!Number.isFinite(deltaBytes)) {
    return adjustmentFailure(blocker(
      'NON_FINITE_DELTA_BYTES',
      'Memory delta must be a finite number.',
    ));
  }

  const absoluteDeltaBytes = Math.abs(deltaBytes);
  const withinNoiseThreshold =
    absoluteDeltaBytes <= calibration.noiseThresholdBytes;

  return Object.freeze({
    schema: UA_MEMORY_NOISE_ADJUSTMENT_SCHEMA,
    protocolId: UA_MEMORY_IDLE_NOISE_PROTOCOL,
    status: 'qualified',
    applied: true,
    blocker: null,
    rawDeltaBytes: deltaBytes,
    absoluteDeltaBytes,
    noiseThresholdBytes: calibration.noiseThresholdBytes,
    withinNoiseThreshold,
    adjustedDeltaBytes: withinNoiseThreshold ? 0 : deltaBytes,
  });
}

function validateCalibrationSamples(samples) {
  if (!Array.isArray(samples)) {
    return blocker(
      'INVALID_SAMPLE_INPUT',
      'Idle UA-memory samples must be an array.',
    );
  }
  if (samples.length < MINIMUM_IDLE_UA_MEMORY_SAMPLES) {
    return blocker(
      'INSUFFICIENT_IDLE_SAMPLES',
      `At least ${MINIMUM_IDLE_UA_MEMORY_SAMPLES} idle UA-memory samples are required.`,
    );
  }

  let previousTimestampMs = null;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample?.supported !== true) {
      return blocker(
        'UA_MEMORY_UNSUPPORTED',
        'Every idle sample must contain a supported UA-memory measurement.',
        index,
      );
    }
    if (!Number.isFinite(sample.bytes)) {
      return blocker(
        'NON_FINITE_SAMPLE_BYTES',
        'Idle UA-memory bytes must be finite.',
        index,
      );
    }
    if (sample.bytes < 0) {
      return blocker(
        'NEGATIVE_SAMPLE_BYTES',
        'Idle UA-memory bytes must be non-negative.',
        index,
      );
    }
    if (!Number.isFinite(sample.timestampMs)) {
      return blocker(
        'NON_FINITE_SAMPLE_TIMESTAMP',
        'Idle UA-memory timestamps must be finite.',
        index,
      );
    }
    if (sample.timestampMs < 0) {
      return blocker(
        'NEGATIVE_SAMPLE_TIMESTAMP',
        'Idle UA-memory timestamps must be non-negative.',
        index,
      );
    }
    if (previousTimestampMs !== null && sample.timestampMs <= previousTimestampMs) {
      return blocker(
        'NON_MONOTONIC_SAMPLE_TIMESTAMPS',
        'Idle UA-memory timestamps must be strictly increasing.',
        index,
      );
    }
    previousTimestampMs = sample.timestampMs;
  }
  return null;
}

function validateCalibration(calibration) {
  if (
    calibration?.status !== 'qualified' ||
    calibration?.calibrated !== true
  ) {
    return blocker(
      'UNQUALIFIED_NOISE_CALIBRATION',
      'A qualified, version-compatible UA-memory noise calibration is required.',
    );
  }
  if (
    calibration.schema !== UA_MEMORY_NOISE_CALIBRATION_SCHEMA ||
    calibration.protocol?.id !== UA_MEMORY_IDLE_NOISE_PROTOCOL ||
    calibration.protocol.measurement !== PROTOCOL.measurement ||
    calibration.protocol.sampleKind !== PROTOCOL.sampleKind ||
    calibration.protocol.minimumSampleCount !== MINIMUM_IDLE_UA_MEMORY_SAMPLES ||
    calibration.protocol.timestampOrder !== PROTOCOL.timestampOrder ||
    calibration.protocol.adjacentDifference !== PROTOCOL.adjacentDifference ||
    calibration.protocol.percentileMethod !== PROTOCOL.percentileMethod ||
    calibration.protocol.percentile !== P95 ||
    calibration.protocol.thresholdRule !== PROTOCOL.thresholdRule
  ) {
    return blocker(
      'INCOMPATIBLE_NOISE_PROTOCOL',
      'The UA-memory calibration protocol does not match this implementation.',
    );
  }
  if (
    !Number.isSafeInteger(calibration.sampleCount) ||
    calibration.sampleCount < MINIMUM_IDLE_UA_MEMORY_SAMPLES ||
    calibration.adjacentDifferenceCount !== calibration.sampleCount - 1 ||
    !Array.isArray(calibration.adjacentAbsoluteDifferencesBytes) ||
    calibration.adjacentAbsoluteDifferencesBytes.length !==
      calibration.adjacentDifferenceCount
  ) {
    return blocker(
      'INVALID_NOISE_CALIBRATION_SHAPE',
      'The UA-memory calibration sample and adjacent-difference counts are inconsistent.',
    );
  }
  if (
    calibration.adjacentAbsoluteDifferencesBytes.some(
      (value) => !Number.isFinite(value) || value < 0,
    ) ||
    !Number.isFinite(calibration.noiseThresholdBytes) ||
    calibration.noiseThresholdBytes < 0 ||
    nearestRank(calibration.adjacentAbsoluteDifferencesBytes, P95) !==
      calibration.noiseThresholdBytes
  ) {
    return blocker(
      'INVALID_NOISE_THRESHOLD',
      'The UA-memory noise threshold must be the nearest-rank P95 of finite adjacent differences.',
    );
  }
  return null;
}

function calibrationFailure(sampleCount, failureBlocker) {
  return Object.freeze({
    schema: UA_MEMORY_NOISE_CALIBRATION_SCHEMA,
    protocol: PROTOCOL,
    status: 'unqualified',
    calibrated: false,
    blocker: failureBlocker,
    sampleCount,
    adjacentDifferenceCount: 0,
    adjacentAbsoluteDifferencesBytes: Object.freeze([]),
    noiseThresholdBytes: null,
  });
}

function adjustmentFailure(failureBlocker) {
  return Object.freeze({
    schema: UA_MEMORY_NOISE_ADJUSTMENT_SCHEMA,
    protocolId: UA_MEMORY_IDLE_NOISE_PROTOCOL,
    status: 'unqualified',
    applied: false,
    blocker: failureBlocker,
    rawDeltaBytes: null,
    absoluteDeltaBytes: null,
    noiseThresholdBytes: null,
    withinNoiseThreshold: null,
    adjustedDeltaBytes: null,
  });
}

function blocker(code, message, sampleIndex) {
  return Object.freeze({
    code,
    message,
    sampleIndex: sampleIndex ?? null,
  });
}
