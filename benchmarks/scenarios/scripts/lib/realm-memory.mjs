import {
  applyUaMemoryNoiseThreshold,
  calibrateUaMemoryIdleNoise,
} from './memory-noise.mjs';
import { DESTROY_RETENTION_LIMIT_BYTES } from './memory.mjs';

export const DISPOSABLE_REALM_MEMORY_PROTOCOL =
  'bom-disposable-realm-memory/v1';

export const FORMAL_MEMORY_SAMPLE_TIMING = Object.freeze({
  quietBeforeGcMs: 30_000,
  cdpGcCycles: 2,
  quietAfterGcMs: 5_000,
});

export const REQUIRED_DISPOSABLE_REALM_RESOURCES = Object.freeze([
  'dom',
  'canvas',
  'portal',
  'worker',
  'dom-listener',
  'resize-observer',
  'mutation-observer',
  'intersection-observer',
  'animation-frame',
  'timeout',
  'interval',
]);

const REQUIRED_INSTANCE_COUNTS = Object.freeze([1, 3, 5]);

/**
 * Produces one fail-closed verdict for the complete 1/3/5 disposable-Realm
 * package. Inputs are normalized evidence; this function does not perform GC,
 * memory measurement, or Realm removal.
 */
export function summarizeRealmMemoryQualification(input = {}) {
  const blockers = createBlockerCollector();
  const mode = input?.mode;
  validateMode(mode, blockers);
  if (mode === 'smoke') {
    blockers.add(
      'SMOKE_MODE_NOT_QUALIFYING',
      'unqualified',
      'mode',
      'Smoke timing can provide diagnostics but cannot qualify retention.',
    );
  }

  const idleSamples = Array.isArray(input?.idleSamples)
    ? input.idleSamples
    : input?.idleSamples;
  const noiseCalibration = calibrateUaMemoryIdleNoise(idleSamples);
  if (noiseCalibration.status !== 'qualified') {
    blockers.add(
      noiseCalibration.blocker?.code ?? 'IDLE_NOISE_CALIBRATION_FAILED',
      'unqualified',
      'idle-noise',
      noiseCalibration.blocker?.message ??
        'Idle UA-memory noise calibration is unavailable.',
      {
        sampleIndex: noiseCalibration.blocker?.sampleIndex ?? null,
      },
    );
  }
  validateIdleSampleTimings(idleSamples, mode, blockers);

  const rawScenarios = Array.isArray(input?.scenarios)
    ? input.scenarios
    : [];
  if (!Array.isArray(input?.scenarios)) {
    blockers.add(
      'INVALID_REALM_SCENARIOS',
      'unqualified',
      'summary',
      'Disposable-Realm scenarios must be an array.',
    );
  }
  validateScenarioCounts(rawScenarios, blockers);

  const scenarios = rawScenarios.map((scenario, index) =>
    assessRealmMemoryScenario({
      mode,
      noiseCalibration,
      scenario,
      scenarioIndex: index,
    }));
  for (const scenario of scenarios) {
    blockers.merge(scenario.blockers);
  }

  const status = statusFromBlockers(blockers.values());
  const normativeWithinLimit = status === 'qualified'
    ? true
    : blockers.hasCode('DESTROY_RETENTION_LIMIT_EXCEEDED')
      ? false
      : null;

  return Object.freeze({
    schema: 'bom-disposable-realm-memory-summary/v1',
    protocolId: DISPOSABLE_REALM_MEMORY_PROTOCOL,
    mode: isKnownMode(mode) ? mode : null,
    status,
    qualified: status === 'qualified',
    requiredInstanceCounts: REQUIRED_INSTANCE_COUNTS,
    noiseCalibration,
    scenarios: Object.freeze(scenarios),
    normativeWithinLimit,
    limitBytes: DESTROY_RETENTION_LIMIT_BYTES,
    blockers: blockers.values(),
  });
}

/** Assess one normalized 1, 3, or 5 instance lifecycle package. */
export function assessRealmMemoryScenario({
  mode,
  noiseCalibration,
  scenario,
  scenarioIndex = null,
} = {}) {
  const blockers = createBlockerCollector();
  validateMode(mode, blockers);
  if (mode === 'smoke') {
    blockers.add(
      'SMOKE_MODE_NOT_QUALIFYING',
      'unqualified',
      'mode',
      'Smoke timing can provide diagnostics but cannot qualify retention.',
    );
  }

  const instanceCount = scenario?.instanceCount;
  if (!REQUIRED_INSTANCE_COUNTS.includes(instanceCount)) {
    blockers.add(
      'INVALID_INSTANCE_COUNT',
      'unqualified',
      'scenario',
      'The scenario instance count must be 1, 3, or 5.',
      { scenarioIndex },
    );
  }

  const configuration = validateConfiguration(
    scenario?.configuration,
    instanceCount,
    blockers,
    'measurement.configuration',
  );
  const warmup = assessMatchedWarmup({
    warmup: scenario?.matchedWarmup,
    configuration,
    instanceCount,
    mode,
  });
  blockers.merge(warmup.blockers);

  const control = assessControlRealm({
    control: scenario?.control,
    noiseCalibration,
    mode,
  });
  blockers.merge(control.blockers);

  const measurement = assessMeasurementRealm({
    measurement: scenario?.measurement,
    noiseCalibration,
    instanceCount,
    mode,
  });
  blockers.merge(measurement.blockers);

  const status = statusFromBlockers(blockers.values());
  const retentionExceeded = blockers.hasCode(
    'DESTROY_RETENTION_LIMIT_EXCEEDED',
  );
  const normativeWithinLimit = retentionExceeded
    ? false
    : status === 'qualified'
      ? true
      : null;

  return Object.freeze({
    schema: 'bom-disposable-realm-memory-scenario/v1',
    protocolId: DISPOSABLE_REALM_MEMORY_PROTOCOL,
    instanceCount: REQUIRED_INSTANCE_COUNTS.includes(instanceCount)
      ? instanceCount
      : null,
    status,
    qualified: status === 'qualified',
    warmup,
    control,
    measurement: Object.freeze({
      ...measurement,
      normativeWithinLimit,
    }),
    blockers: blockers.values(),
  });
}

function assessMatchedWarmup({
  warmup,
  configuration,
  instanceCount,
  mode,
}) {
  const blockers = createBlockerCollector();
  if (warmup?.performed !== true) {
    blockers.add(
      'MATCHED_WARMUP_MISSING',
      'unqualified',
      'warmup',
      'A completed, count-matched Canvas warmup Realm is required.',
    );
  }

  const warmupConfiguration = validateConfiguration(
    warmup?.configuration,
    warmup?.configuration?.instanceCount,
    blockers,
    'warmup.configuration',
  );
  if (
    configuration !== null &&
    warmupConfiguration !== null &&
    !sameConfiguration(configuration, warmupConfiguration)
  ) {
    blockers.add(
      'MATCHED_WARMUP_CONFIGURATION_MISMATCH',
      'unqualified',
      'warmup.configuration',
      'Warmup and measurement must use the same count, viewport, DPR, and Canvas layer count.',
    );
  }
  if (
    Number.isInteger(instanceCount) &&
    warmupConfiguration !== null &&
    warmupConfiguration.instanceCount !== instanceCount
  ) {
    blockers.add(
      'MATCHED_WARMUP_INSTANCE_COUNT_MISMATCH',
      'unqualified',
      'warmup.configuration',
      'Warmup instance count does not match the measured scenario.',
    );
  }
  if (warmup?.ready?.instanceCount !== instanceCount) {
    blockers.add(
      'MATCHED_WARMUP_READY_INSTANCE_COUNT_MISMATCH',
      'unqualified',
      'warmup.ready',
      'The warmup Realm did not become ready with the measured instance count.',
    );
  }

  assessReadyEvidence(warmup?.ready, blockers, 'warmup.ready', {
    requireMemoryAttribution: false,
  });
  const resources = assessResourceAssertions(
    warmup?.destroy?.resourceAssertions,
    'warmup.destroy',
  );
  blockers.merge(resources.blockers);
  assessBooleanSuccess(
    warmup?.destroy?.passed,
    blockers,
    'WARMUP_DESTROY_FAILED',
    'WARMUP_DESTROY_EVIDENCE_MISSING',
    'warmup.destroy',
  );
  assessReleaseEvidence(warmup?.release, blockers, 'warmup.release');
  assessAfterRemovalEvidence(
    warmup?.afterRemoval,
    mode,
    blockers,
    'warmup.afterRemoval',
  );

  return Object.freeze({
    status: statusFromBlockers(blockers.values()),
    configurationMatched:
      configuration !== null &&
      warmupConfiguration !== null &&
      sameConfiguration(configuration, warmupConfiguration),
    resources,
    blockers: blockers.values(),
  });
}

function assessControlRealm({ control, noiseCalibration, mode }) {
  const blockers = createBlockerCollector();
  if (control?.instanceCount !== 0) {
    blockers.add(
      'CONTROL_REALM_NOT_EMPTY',
      'unqualified',
      'control',
      'The allocator control Realm must contain zero editor instances.',
    );
  }
  if (control?.ready?.instanceCount !== 0) {
    blockers.add(
      'CONTROL_REALM_READY_INSTANCE_COUNT_MISMATCH',
      'unqualified',
      'control.ready',
      'The control Realm ready evidence must report zero editor instances.',
    );
  }
  assessReadyEvidence(control?.ready, blockers, 'control.ready');
  assessReleaseEvidence(control?.release, blockers, 'control.release');
  assessAfterRemovalEvidence(
    control?.afterRemoval,
    mode,
    blockers,
    'control.afterRemoval',
  );

  const noiseAdjustment = applyUaMemoryNoiseThreshold({
    deltaBytes: control?.rawDeltaBytes,
    calibration: noiseCalibration,
  });
  if (noiseAdjustment.status !== 'qualified') {
    blockers.add(
      noiseAdjustment.blocker?.code ?? 'CONTROL_DELTA_UNAVAILABLE',
      'unqualified',
      'control.memory',
      noiseAdjustment.blocker?.message ??
        'The control Realm delta cannot be noise-adjusted.',
    );
  } else if (noiseAdjustment.adjustedDeltaBytes !== 0) {
    blockers.add(
      'CONTROL_REALM_DELTA_EXCEEDS_NOISE',
      'unqualified',
      'control.memory',
      'The empty control Realm changed total UA memory beyond the calibrated noise threshold.',
    );
  }

  const status = statusFromBlockers(blockers.values());
  return Object.freeze({
    status,
    stable: status === 'qualified',
    rawDeltaBytes: Number.isFinite(control?.rawDeltaBytes)
      ? control.rawDeltaBytes
      : null,
    noiseAdjustment,
    blockers: blockers.values(),
  });
}

function assessMeasurementRealm({
  measurement,
  noiseCalibration,
  instanceCount,
  mode,
}) {
  const blockers = createBlockerCollector();
  if (measurement?.ready?.instanceCount !== instanceCount) {
    blockers.add(
      'MEASUREMENT_INSTANCE_COUNT_MISMATCH',
      'unqualified',
      'measurement.ready',
      'The ready Realm does not report the requested instance count.',
    );
  }
  assessReadyEvidence(measurement?.ready, blockers, 'measurement.ready');
  assessBooleanSuccess(
    measurement?.destroy?.passed,
    blockers,
    'MEASUREMENT_DESTROY_FAILED',
    'MEASUREMENT_DESTROY_EVIDENCE_MISSING',
    'measurement.destroy',
  );
  const resources = assessResourceAssertions(
    measurement?.destroy?.resourceAssertions,
    'measurement.destroy',
  );
  blockers.merge(resources.blockers);
  assessReleaseEvidence(
    measurement?.release,
    blockers,
    'measurement.release',
  );
  assessAfterRemovalEvidence(
    measurement?.afterRemoval,
    mode,
    blockers,
    'measurement.afterRemoval',
  );

  const noiseAdjustment = applyUaMemoryNoiseThreshold({
    deltaBytes: measurement?.rawDeltaBytes,
    calibration: noiseCalibration,
  });
  let retainedBytes = null;
  if (noiseAdjustment.status !== 'qualified') {
    blockers.add(
      noiseAdjustment.blocker?.code ?? 'RETENTION_DELTA_UNAVAILABLE',
      'unqualified',
      'measurement.memory',
      noiseAdjustment.blocker?.message ??
        'The measured retention delta cannot be noise-adjusted.',
    );
  } else {
    retainedBytes = Math.max(0, noiseAdjustment.adjustedDeltaBytes);
    if (retainedBytes > DESTROY_RETENTION_LIMIT_BYTES) {
      blockers.add(
        'DESTROY_RETENTION_LIMIT_EXCEEDED',
        'failed',
        'measurement.memory',
        'Noise-adjusted retained memory exceeds the 5 MiB destroy limit.',
      );
    }
  }

  return Object.freeze({
    status: statusFromBlockers(blockers.values()),
    rawDeltaBytes: Number.isFinite(measurement?.rawDeltaBytes)
      ? measurement.rawDeltaBytes
      : null,
    noiseAdjustment,
    retainedBytes,
    limitBytes: DESTROY_RETENTION_LIMIT_BYTES,
    resources,
    blockers: blockers.values(),
  });
}

function assessResourceAssertions(assertions, phase) {
  const blockers = createBlockerCollector();
  const byResource = new Map();
  if (!Array.isArray(assertions)) {
    blockers.add(
      'RESOURCE_ASSERTIONS_MISSING',
      'unqualified',
      phase,
      'Typed resource assertions are required before Realm removal.',
    );
  } else {
    for (const assertion of assertions) {
      const resource = assertion?.resource;
      if (!REQUIRED_DISPOSABLE_REALM_RESOURCES.includes(resource)) {
        blockers.add(
          'UNKNOWN_RESOURCE_ASSERTION',
          'unqualified',
          phase,
          'The resource assertion contains an unknown resource kind.',
          { resource: typeof resource === 'string' ? resource : null },
        );
        continue;
      }
      if (byResource.has(resource)) {
        blockers.add(
          'DUPLICATE_RESOURCE_ASSERTION',
          'unqualified',
          phase,
          'Each required resource kind must appear exactly once.',
          { resource },
        );
        continue;
      }
      byResource.set(resource, assertion);
    }
  }

  for (const resource of REQUIRED_DISPOSABLE_REALM_RESOURCES) {
    const assertion = byResource.get(resource);
    if (assertion === undefined) {
      blockers.add(
        'RESOURCE_ASSERTION_MISSING',
        'unqualified',
        phase,
        'A required resource assertion is missing.',
        { resource },
      );
      continue;
    }
    if (
      assertion.status === 'failed' ||
      (Number.isFinite(assertion.outstanding) && assertion.outstanding > 0)
    ) {
      blockers.add(
        'RESOURCE_NOT_RELEASED',
        'failed',
        phase,
        'An instance-owned resource remains active after destroy.',
        { resource },
      );
      continue;
    }
    if (
      assertion.status === 'unavailable' ||
      assertion.supported === false ||
      assertion.outstanding === null
    ) {
      blockers.add(
        'RESOURCE_LEDGER_UNAVAILABLE',
        'unqualified',
        phase,
        'A typed resource ledger is unavailable.',
        { resource },
      );
      continue;
    }
    if (
      assertion.status !== 'passed' ||
      assertion.supported !== true ||
      assertion.outstanding !== 0
    ) {
      blockers.add(
        'RESOURCE_ASSERTION_MALFORMED',
        'unqualified',
        phase,
        'A passing resource assertion must be supported with exactly zero outstanding resources.',
        { resource },
      );
    }
  }

  return Object.freeze({
    status: statusFromBlockers(blockers.values()),
    requiredResources: REQUIRED_DISPOSABLE_REALM_RESOURCES,
    blockers: blockers.values(),
  });
}

function assessReadyEvidence(
  ready,
  blockers,
  phase,
  { requireMemoryAttribution = true } = {},
) {
  assessBooleanSuccess(
    ready?.passed,
    blockers,
    'REALM_READY_FAILED',
    'REALM_READY_EVIDENCE_MISSING',
    phase,
  );
  if (!requireMemoryAttribution) {
    return;
  }
  assessEvidenceAvailability(
    ready?.measured,
    blockers,
    'REALM_READY_MEMORY_UNAVAILABLE',
    'REALM_READY_MEMORY_EVIDENCE_MISSING',
    phase,
  );
  if (ready?.childAttributionPresent !== true) {
    blockers.add(
      'READY_CHILD_ATTRIBUTION_MISSING',
      'unqualified',
      phase,
      'Ready UA-memory evidence must include the uniquely identified child Realm.',
    );
  }
}

function assessReleaseEvidence(release, blockers, phase) {
  assessBooleanSuccess(
    release?.released,
    blockers,
    'REALM_RELEASE_FAILED',
    'REALM_RELEASE_EVIDENCE_MISSING',
    phase,
  );
  assessBooleanSuccess(
    release?.frameRemoved,
    blockers,
    'REALM_FRAME_REMOVE_FAILED',
    'REALM_FRAME_REMOVE_EVIDENCE_MISSING',
    phase,
  );
  assessBooleanSuccess(
    release?.parentReferencesReleased,
    blockers,
    'PARENT_REALM_REFERENCE_RELEASE_FAILED',
    'PARENT_REALM_REFERENCE_EVIDENCE_MISSING',
    phase,
  );
}

function assessAfterRemovalEvidence(afterRemoval, mode, blockers, phase) {
  assessEvidenceAvailability(
    afterRemoval?.measured,
    blockers,
    'AFTER_REMOVAL_MEMORY_UNAVAILABLE',
    'AFTER_REMOVAL_MEMORY_EVIDENCE_MISSING',
    phase,
  );
  validateTiming(afterRemoval?.timing, mode, blockers, phase);
  if (afterRemoval?.childAttributionPresent === true) {
    blockers.add(
      'CHILD_REALM_ATTRIBUTION_REMAINS',
      'failed',
      phase,
      'UA-memory attribution still contains the removed child Realm.',
    );
  } else if (afterRemoval?.childAttributionPresent !== false) {
    blockers.add(
      'AFTER_REMOVAL_ATTRIBUTION_EVIDENCE_MISSING',
      'unqualified',
      phase,
      'After-removal evidence must explicitly show that child attribution is absent.',
    );
  }
}

function validateScenarioCounts(scenarios, blockers) {
  const counts = new Map();
  for (const scenario of scenarios) {
    const count = scenario?.instanceCount;
    counts.set(count, (counts.get(count) ?? 0) + 1);
  }
  for (const required of REQUIRED_INSTANCE_COUNTS) {
    if (counts.get(required) !== 1) {
      blockers.add(
        counts.has(required)
          ? 'DUPLICATE_INSTANCE_COUNT_SCENARIO'
          : 'MISSING_INSTANCE_COUNT_SCENARIO',
        'unqualified',
        'summary',
        'Exactly one scenario is required for each of 1, 3, and 5 instances.',
        { instanceCount: required },
      );
    }
  }
  for (const count of counts.keys()) {
    if (!REQUIRED_INSTANCE_COUNTS.includes(count)) {
      blockers.add(
        'UNEXPECTED_INSTANCE_COUNT_SCENARIO',
        'unqualified',
        'summary',
        'Only 1, 3, and 5 instance scenarios are allowed.',
        { instanceCount: Number.isFinite(count) ? count : null },
      );
    }
  }
}

function validateIdleSampleTimings(samples, mode, blockers) {
  if (!Array.isArray(samples)) {
    return;
  }
  for (let index = 0; index < samples.length; index += 1) {
    validateTiming(
      samples[index]?.timing,
      mode,
      blockers,
      'idle-noise',
      index,
    );
  }
}

function validateTiming(timing, mode, blockers, phase, sampleIndex = null) {
  const shapeValid =
    Number.isInteger(timing?.quietBeforeGcMs) &&
    timing.quietBeforeGcMs >= 0 &&
    Number.isInteger(timing?.cdpGcCycles) &&
    timing.cdpGcCycles >= 0 &&
    Number.isInteger(timing?.quietAfterGcMs) &&
    timing.quietAfterGcMs >= 0;
  if (!shapeValid) {
    blockers.add(
      'MEMORY_TIMING_EVIDENCE_INVALID',
      'unqualified',
      phase,
      'Memory timing evidence must contain non-negative integer waits and GC cycles.',
      { sampleIndex },
    );
    return;
  }
  if (
    mode === 'formal' &&
    !sameTiming(timing, FORMAL_MEMORY_SAMPLE_TIMING)
  ) {
    blockers.add(
      'FORMAL_MEMORY_TIMING_MISMATCH',
      'unqualified',
      phase,
      'Every formal sample must use exactly 30 seconds quiet, two CDP GC cycles, and five seconds post-GC.',
      { sampleIndex },
    );
  }
}

function validateConfiguration(value, expectedInstanceCount, blockers, phase) {
  const valid =
    Number.isInteger(value?.instanceCount) &&
    value.instanceCount >= 0 &&
    Number.isInteger(value?.viewport?.width) &&
    value.viewport.width > 0 &&
    Number.isInteger(value?.viewport?.height) &&
    value.viewport.height > 0 &&
    Number.isFinite(value?.devicePixelRatio) &&
    value.devicePixelRatio > 0 &&
    Number.isInteger(value?.canvasLayerCount) &&
    value.canvasLayerCount > 0;
  if (!valid) {
    blockers.add(
      'REALM_CONFIGURATION_INVALID',
      'unqualified',
      phase,
      'Realm configuration must identify count, viewport, DPR, and Canvas layer count.',
    );
    return null;
  }
  if (
    Number.isInteger(expectedInstanceCount) &&
    value.instanceCount !== expectedInstanceCount
  ) {
    blockers.add(
      'REALM_CONFIGURATION_INSTANCE_COUNT_MISMATCH',
      'unqualified',
      phase,
      'Realm configuration does not match its scenario instance count.',
    );
  }
  return Object.freeze({
    instanceCount: value.instanceCount,
    viewport: Object.freeze({
      width: value.viewport.width,
      height: value.viewport.height,
    }),
    devicePixelRatio: value.devicePixelRatio,
    canvasLayerCount: value.canvasLayerCount,
  });
}

function sameConfiguration(left, right) {
  return (
    left.instanceCount === right.instanceCount &&
    left.viewport.width === right.viewport.width &&
    left.viewport.height === right.viewport.height &&
    left.devicePixelRatio === right.devicePixelRatio &&
    left.canvasLayerCount === right.canvasLayerCount
  );
}

function assessBooleanSuccess(
  value,
  blockers,
  falseCode,
  missingCode,
  phase,
) {
  if (value === false) {
    blockers.add(
      falseCode,
      'failed',
      phase,
      'The operation explicitly reported failure.',
    );
  } else if (value !== true) {
    blockers.add(
      missingCode,
      'unqualified',
      phase,
      'Required boolean evidence is missing.',
    );
  }
}

function assessEvidenceAvailability(
  value,
  blockers,
  falseCode,
  missingCode,
  phase,
) {
  if (value === false) {
    blockers.add(
      falseCode,
      'unqualified',
      phase,
      'The required measurement is unavailable.',
    );
  } else if (value !== true) {
    blockers.add(
      missingCode,
      'unqualified',
      phase,
      'Required measurement evidence is missing.',
    );
  }
}

function validateMode(mode, blockers) {
  if (!isKnownMode(mode)) {
    blockers.add(
      'INVALID_MEMORY_EVIDENCE_MODE',
      'unqualified',
      'mode',
      'Memory evidence mode must be formal or smoke.',
    );
  }
}

function isKnownMode(mode) {
  return mode === 'formal' || mode === 'smoke';
}

function sameTiming(left, right) {
  return (
    left.quietBeforeGcMs === right.quietBeforeGcMs &&
    left.cdpGcCycles === right.cdpGcCycles &&
    left.quietAfterGcMs === right.quietAfterGcMs
  );
}

function statusFromBlockers(blockers) {
  if (blockers.some((entry) => entry.classification === 'failed')) {
    return 'failed';
  }
  return blockers.length === 0 ? 'qualified' : 'unqualified';
}

function createBlockerCollector() {
  const entries = [];
  const keys = new Set();
  return Object.freeze({
    add(code, classification, phase, message, context = {}) {
      const entry = Object.freeze({
        code,
        classification,
        phase,
        message,
        instanceCount: context.instanceCount ?? null,
        resource: context.resource ?? null,
        sampleIndex: context.sampleIndex ?? null,
      });
      const key = [
        entry.code,
        entry.classification,
        entry.phase,
        entry.instanceCount,
        entry.resource,
        entry.sampleIndex,
      ].join('|');
      if (!keys.has(key)) {
        keys.add(key);
        entries.push(entry);
      }
    },
    merge(source) {
      if (!Array.isArray(source)) {
        return;
      }
      for (const entry of source) {
        this.add(
          entry.code,
          entry.classification,
          entry.phase,
          entry.message,
          entry,
        );
      }
    },
    hasCode(code) {
      return entries.some((entry) => entry.code === code);
    },
    values() {
      return Object.freeze([...entries]);
    },
  });
}
