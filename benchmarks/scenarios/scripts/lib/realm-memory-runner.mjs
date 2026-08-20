import {
  callAcceptance,
  FORMAL_UA_MEMORY_TIMEOUT_MS,
  measureUaMemory,
  SMOKE_UA_MEMORY_TIMEOUT_MS,
} from './acceptance.mjs';
import {
  DISPOSABLE_REALM_MEMORY_PROTOCOL,
  FORMAL_MEMORY_SAMPLE_TIMING,
  REQUIRED_DISPOSABLE_REALM_RESOURCES,
  summarizeRealmMemoryQualification,
} from './realm-memory.mjs';

export const DISPOSABLE_REALM_MEMORY_RAW_EVIDENCE_SCHEMA =
  'bom-disposable-realm-memory-evidence/v1';
export const BOM_F3_ACCEPTANCE_TARGET_LOST =
  'BOM_F3_ACCEPTANCE_TARGET_LOST';
export const BOM_F3_REALM_MEMORY_PROTOCOL_TIMEOUT =
  'BOM_F3_REALM_MEMORY_PROTOCOL_TIMEOUT';
export const BOM_F3_REALM_MEMORY_UNAVAILABLE =
  'BOM_F3_REALM_MEMORY_UNAVAILABLE';

// Formal evidence intentionally takes many 30-second quiet windows. The
// protocol budget is generous enough for a healthy run, while the per-
// operation budget prevents a stalled browser promise from hanging forever.
export const FORMAL_REALM_MEMORY_PROTOCOL_TIMEOUT_MS = 30 * 60 * 1_000;
export const SMOKE_REALM_MEMORY_PROTOCOL_TIMEOUT_MS = 3 * 60 * 1_000;
export const REALM_MEMORY_OPERATION_TIMEOUT_MS = 60 * 1_000;

export const SMOKE_MEMORY_SAMPLE_TIMING = Object.freeze({
  quietBeforeGcMs: 100,
  cdpGcCycles: 2,
  quietAfterGcMs: 100,
});

const FORMAL_IDLE_SAMPLE_COUNT = 10;
const SMOKE_IDLE_SAMPLE_COUNT = 3;
const INSTANCE_COUNTS = Object.freeze([1, 3, 5]);
const CHILD_REALM_ID_QUERY_KEY = 'bom-disposable-realm-id';

export class AcceptanceTargetLostError extends Error {
  constructor(phase, cause = undefined) {
    super(BOM_F3_ACCEPTANCE_TARGET_LOST + ':' + phase, { cause });
    this.name = 'AcceptanceTargetLostError';
    this.code = BOM_F3_ACCEPTANCE_TARGET_LOST;
    this.phase = phase;
  }
}

export class RealmMemoryProtocolTimeoutError extends Error {
  constructor({ phase, timeoutMs, elapsedMs, diagnostics }) {
    super(BOM_F3_REALM_MEMORY_PROTOCOL_TIMEOUT + ':' + phase);
    this.name = 'RealmMemoryProtocolTimeoutError';
    this.code = BOM_F3_REALM_MEMORY_PROTOCOL_TIMEOUT;
    this.phase = phase;
    this.stage = phase;
    this.timeoutMs = timeoutMs;
    this.elapsedMs = elapsedMs;
    this.diagnostics = diagnostics;
  }
}

export class RealmMemoryUnavailableError extends Error {
  constructor({ phase, reason, diagnostics }) {
    super(BOM_F3_REALM_MEMORY_UNAVAILABLE + ':' + phase);
    this.name = 'RealmMemoryUnavailableError';
    this.code = BOM_F3_REALM_MEMORY_UNAVAILABLE;
    this.phase = phase;
    this.stage = phase;
    this.diagnostics = Object.freeze({
      reason,
      ...diagnostics,
    });
  }
}

export async function runDisposableRealmMemoryProtocol({
  page,
  pageSession,
  description,
  mode,
  runId,
  viewport,
  canvasLayerCount,
  dependencies = {},
}) {
  if (mode !== 'formal' && mode !== 'smoke') {
    throw new RangeError('Disposable Realm memory mode must be formal or smoke.');
  }
  assertConfiguration(viewport, canvasLayerCount);

  const timing = mode === 'formal'
    ? FORMAL_MEMORY_SAMPLE_TIMING
    : SMOKE_MEMORY_SAMPLE_TIMING;
  const idleSampleCount = mode === 'formal'
    ? FORMAL_IDLE_SAMPLE_COUNT
    : SMOKE_IDLE_SAMPLE_COUNT;
  const invoke = dependencies.callAcceptance ?? callAcceptance;
  const measure = dependencies.measureUaMemory ??
    ((targetPage) => measureUaMemory(
      targetPage,
      mode === 'formal'
        ? FORMAL_UA_MEMORY_TIMEOUT_MS
        : SMOKE_UA_MEMORY_TIMEOUT_MS,
    ));
  const wait = dependencies.delay ?? delay;
  const collect = dependencies.collectGarbage ?? collectGarbageCycles;
  const waitForDetach = dependencies.waitForFrameDetach ?? waitForFrameDetach;
  const assertTargetActive = dependencies.assertTargetActive ??
    ((phase) => assertPageOpen(page, phase));
  const protocolTimeoutMs = dependencies.protocolTimeoutMs ??
    (mode === 'formal'
      ? FORMAL_REALM_MEMORY_PROTOCOL_TIMEOUT_MS
      : SMOKE_REALM_MEMORY_PROTOCOL_TIMEOUT_MS);
  const operationTimeoutMs = dependencies.operationTimeoutMs ??
    REALM_MEMORY_OPERATION_TIMEOUT_MS;
  assertTimeoutConfiguration(protocolTimeoutMs, operationTimeoutMs);
  const protocolStartedAtMs = Date.now();
  const protocolDeadlineMs = protocolStartedAtMs + protocolTimeoutMs;
  let currentPhase = 'initializing';
  let completedIdleSamples = 0;
  let completedScenarios = 0;
  let activeScenario = null;
  const progress = () => Object.freeze({
    currentPhase,
    completedIdleSamples,
    totalIdleSamples: idleSampleCount,
    completedScenarios,
    totalScenarios: INSTANCE_COUNTS.length,
    activeScenario,
    elapsedMs: Date.now() - protocolStartedAtMs,
    deadlineMs: protocolDeadlineMs,
  });
  const runBounded = (phase, operation) =>
    runWithProtocolDeadline({
      phase,
      operation,
      startedAtMs: protocolStartedAtMs,
      deadlineMs: protocolDeadlineMs,
      operationTimeoutMs,
      progress,
    });
  const boundedInvoke = (...arguments_) => runBounded(
    `acceptance:${arguments_[2] ?? 'unknown'}`,
    () => invoke(...arguments_),
  );
  const boundedWaitForDetach = (targetPage, realmId) => runBounded(
    `frame-detach:${realmId}`,
    () => waitForDetach(targetPage, realmId),
  );
  const realmPrefix = normalizeRealmPrefix(runId);
  let realmSequence = 0;

  const sampleMemory = async (phase) => {
    currentPhase = phase;
    const startedAtMs = Date.now();
    let measurement;
    try {
      await runBounded(phase + ':before-wait', () =>
        assertTargetActive(phase + ':before-wait'));
      await runBounded(phase + ':quiet-before-gc', () =>
        wait(timing.quietBeforeGcMs));
      await runBounded(phase + ':before-gc', () =>
        assertTargetActive(phase + ':before-gc'));
      await runBounded(phase + ':collect-garbage', () =>
        collect(pageSession, timing.cdpGcCycles));
      await runBounded(phase + ':quiet-after-gc', () =>
        wait(timing.quietAfterGcMs));
      await runBounded(phase + ':before-measure', () =>
        assertTargetActive(phase + ':before-measure'));
      measurement = await runBounded(phase + ':measure', () => measure(page));
      await runBounded(phase + ':after-measure', () =>
        assertTargetActive(phase + ':after-measure'));
      if (measurement?.hostTimedOut === true) {
        throw new RealmMemoryUnavailableError({
          phase,
          reason: measurement.reason ?? 'UA memory page evaluation timed out',
          diagnostics: {
            hostTimedOut: true,
            sampleTiming: Object.freeze({ ...timing }),
            measurementTimestampMs: measurement.timestampMs ?? null,
          },
        });
      }
      if (mode === 'formal' && measurement?.supported !== true) {
        throw new RealmMemoryUnavailableError({
          phase,
          reason: measurement?.reason ?? 'UA memory measurement is unavailable',
          diagnostics: {
            sampleTiming: Object.freeze({ ...timing }),
            measurementTimestampMs: measurement?.timestampMs ?? null,
          },
        });
      }
    } catch (error) {
      if (isTargetLost(error)) {
        throw error;
      }
      if (isProtocolTimeout(error)) {
        throw error;
      }
      if (isRealmMemoryUnavailable(error)) {
        throw error;
      }
      if (isTargetLossFailure(error)) {
        throw new AcceptanceTargetLostError(phase, error);
      }
      measurement = {
        supported: false,
        reason: error instanceof Error ? error.message : String(error),
        bytes: null,
        breakdown: null,
        timestampMs: Date.now(),
        error: serializeError(error, phase),
      };
    }
    return Object.freeze({
      phase,
      ...measurement,
      timing: Object.freeze({ ...timing }),
      startedAtMs,
      completedAtMs: Date.now(),
    });
  };

  const idleSamples = [];
  for (let index = 0; index < idleSampleCount; index += 1) {
    idleSamples.push(await sampleMemory(`idle-noise-${index}`));
    completedIdleSamples += 1;
  }

  const scenarios = [];
  for (const instanceCount of INSTANCE_COUNTS) {
    activeScenario = instanceCount;
    currentPhase = `scenario-${instanceCount}:starting`;
    const configuration = createConfiguration(
      instanceCount,
      viewport,
      canvasLayerCount,
    );
    const nextRealmId = (purpose) =>
      `${realmPrefix}-memory-${instanceCount}-${purpose}-${++realmSequence}`;

    currentPhase = `scenario-${instanceCount}:matched-warmup`;
    const matchedWarmupLifecycle = await runRealmLifecycle({
      page,
      description,
      instanceCount,
      realmId: nextRealmId('warmup'),
      purpose: 'matched-warmup',
      sampleMemory,
      invoke: boundedInvoke,
      waitForDetach: boundedWaitForDetach,
      measureBaseline: false,
      measureReady: false,
    });
    currentPhase = `scenario-${instanceCount}:zero-instance-control`;
    const controlLifecycle = await runRealmLifecycle({
      page,
      description,
      instanceCount: 0,
      realmId: nextRealmId('control'),
      purpose: 'zero-instance-control',
      sampleMemory,
      invoke: boundedInvoke,
      waitForDetach: boundedWaitForDetach,
      measureBaseline: true,
      measureReady: true,
    });
    currentPhase = `scenario-${instanceCount}:measurement`;
    const measurementLifecycle = await runRealmLifecycle({
      page,
      description,
      instanceCount,
      realmId: nextRealmId('measurement'),
      purpose: 'measurement',
      sampleMemory,
      invoke: boundedInvoke,
      waitForDetach: boundedWaitForDetach,
      measureBaseline: true,
      measureReady: true,
    });

    scenarios.push(Object.freeze({
      instanceCount,
      configuration,
      matchedWarmup: Object.freeze({
        performed: matchedWarmupLifecycle.completed,
        configuration,
        ready: matchedWarmupLifecycle.ready,
        destroy: matchedWarmupLifecycle.destroy,
        release: matchedWarmupLifecycle.release,
        afterRemoval: matchedWarmupLifecycle.afterRemoval,
        raw: matchedWarmupLifecycle,
      }),
      control: Object.freeze({
        instanceCount: 0,
        ready: controlLifecycle.ready,
        destroy: controlLifecycle.destroy,
        release: controlLifecycle.release,
        afterRemoval: controlLifecycle.afterRemoval,
        rawDeltaBytes: qualifiedRawDelta(controlLifecycle),
        diagnosticRawDeltaBytes: diagnosticRawDelta(controlLifecycle),
        raw: controlLifecycle,
      }),
      measurement: Object.freeze({
        ready: measurementLifecycle.ready,
        destroy: measurementLifecycle.destroy,
        release: measurementLifecycle.release,
        afterRemoval: measurementLifecycle.afterRemoval,
        rawDeltaBytes: qualifiedRawDelta(measurementLifecycle),
        diagnosticRawDeltaBytes: diagnosticRawDelta(measurementLifecycle),
        raw: measurementLifecycle,
      }),
    }));
    completedScenarios += 1;
    activeScenario = null;
  }

  const qualification = summarizeRealmMemoryQualification({
    mode,
    idleSamples,
    scenarios,
  });
  const diagnosticChecksPassed = realmMemoryDiagnosticChecksPassed({
    idleSamples,
    scenarios,
  });
  return Object.freeze({
    schemaVersion: DISPOSABLE_REALM_MEMORY_RAW_EVIDENCE_SCHEMA,
    protocolId: DISPOSABLE_REALM_MEMORY_PROTOCOL,
    mode,
    timing: Object.freeze({ ...timing }),
    idleSampleCount,
    idleSamples: Object.freeze(idleSamples),
    scenarios: Object.freeze(scenarios),
    diagnosticChecksPassed,
    qualification,
  });
}

export function realmMemoryDiagnosticChecksPassed({
  idleSamples,
  scenarios,
} = {}) {
  return (
    Array.isArray(idleSamples) &&
    idleSamples.length > 0 &&
    idleSamples.every((sample) => sample?.supported === true) &&
    Array.isArray(scenarios) &&
    scenarios.length === INSTANCE_COUNTS.length &&
    scenarios.every((scenario, index) => {
      const count = INSTANCE_COUNTS[index];
      const warmup = scenario?.matchedWarmup?.raw;
      const control = scenario?.control?.raw;
      const measurement = scenario?.measurement?.raw;
      return (
        scenario?.instanceCount === count &&
        lifecycleReleasedWithoutChild(warmup, false) &&
        lifecycleReleasedWithoutChild(control, true) &&
        lifecycleReleasedWithoutChild(measurement, true) &&
        measurement.destroy.resourceAssertions.every(
          (assertion) =>
            assertion.status === 'passed' &&
            assertion.supported === true &&
            assertion.outstanding === 0,
        )
      );
    })
  );
}

async function runRealmLifecycle({
  page,
  description,
  instanceCount,
  realmId,
  purpose,
  sampleMemory,
  invoke,
  waitForDetach,
  measureBaseline,
  measureReady,
}) {
  const errors = [];
  let baselineMemory = null;
  let readyMemory = null;
  let afterRemovalMemory = null;
  let created = null;
  let destroyed = null;
  let releaseOperation = null;
  let discardOperation = null;
  let frameDetached = false;

  if (measureBaseline) {
    baselineMemory = await captureSample(
      () => sampleMemory(`${purpose}-baseline`),
      errors,
      'baseline-memory',
    );
  }

  created = await captureOperation(
    () => invoke(page, description, 'createDisposableRealm', {
      realmId,
      instanceCount,
    }),
    errors,
    'create',
  );

  if (created !== null && measureReady) {
    readyMemory = await captureSample(
      () => sampleMemory(`${purpose}-ready`),
      errors,
      'ready-memory',
    );
  }

  if (created !== null) {
    destroyed = await captureOperation(
      () => invoke(page, description, 'destroyDisposableRealm', { realmId }),
      errors,
      'destroy',
    );
    if (destroyed !== null) {
      releaseOperation = await captureOperation(
        () => invoke(page, description, 'releaseDisposableRealm', { realmId }),
        errors,
        'release',
      );
    }
    if (releaseOperation?.frameRemoved !== true) {
      discardOperation = await captureOperation(
        () => invoke(page, description, 'discardDisposableRealm', { realmId }),
        errors,
        'discard',
      );
    }
    if (
      releaseOperation?.frameRemoved === true ||
      discardOperation?.frameRemoved === true
    ) {
      frameDetached = await captureDetach(
        () => waitForDetach(page, realmId),
        errors,
      );
    }
  }

  if (frameDetached) {
    afterRemovalMemory = await captureSample(
      () => sampleMemory(`${purpose}-after-removal`),
      errors,
      'after-removal-memory',
    );
  }

  const readyAttribution = analyzeDisposableRealmAttribution(
    readyMemory,
    realmId,
  );
  const afterAttribution = analyzeDisposableRealmAttribution(
    afterRemovalMemory,
    realmId,
  );
  const releaseQualified =
    releaseOperation?.released === true &&
    releaseOperation.frameRemoved === true &&
    releaseOperation.parentReferencesReleased === true &&
    frameDetached;
  const resourceAssertions = normalizeDisposableRealmResourceAssertions(
    destroyed?.assertions,
  );

  return Object.freeze({
    schemaVersion: 'bom-disposable-realm-lifecycle-evidence/v1',
    realmId,
    purpose,
    instanceCount,
    completed: frameDetached,
    baselineMemory,
    readyMemory,
    afterRemovalMemory,
    readyAttribution,
    afterRemovalAttribution: afterAttribution,
    created,
    destroyed,
    releaseOperation,
    discardOperation,
    frameDetached,
    releaseQualified,
    ready: Object.freeze({
      passed:
        created?.phase === 'ready' &&
        created?.instanceCount === instanceCount,
      measured: readyMemory?.supported === true,
      childAttributionPresent:
        readyMemory?.supported === true
          ? readyAttribution.exactlyOneChildUrl
          : null,
      instanceCount,
    }),
    destroy: Object.freeze({
      passed: destroyed?.destroyed?.passed === true,
      removalAuthorized: destroyed?.removalAuthorized === true,
      resourceAssertions,
    }),
    release: Object.freeze({
      released: releaseQualified ? true : undefined,
      frameRemoved: releaseQualified ? true : undefined,
      parentReferencesReleased: releaseQualified ? true : undefined,
      evidenceKind: releaseQualified ? 'qualified-release' : 'none',
    }),
    afterRemoval: Object.freeze({
      measured: afterRemovalMemory?.supported === true,
      childAttributionPresent:
        afterRemovalMemory?.supported === true
          ? afterAttribution.matchingAttributionCount > 0
          : null,
      timing: afterRemovalMemory?.timing ?? null,
    }),
    errors: Object.freeze(errors),
  });
}

export function analyzeDisposableRealmAttribution(measurement, realmId) {
  const matchingUrls = [];
  let matchingAttributionCount = 0;
  if (Array.isArray(measurement?.breakdown)) {
    for (const entry of measurement.breakdown) {
      if (!Array.isArray(entry?.attribution)) {
        continue;
      }
      for (const attribution of entry.attribution) {
        const url = disposableRealmUrl(attribution?.url, realmId);
        if (url !== null) {
          matchingAttributionCount += 1;
          matchingUrls.push(url);
        }
      }
    }
  }
  const distinctChildUrls = Object.freeze([...new Set(matchingUrls)].sort());
  return Object.freeze({
    realmId,
    measurementSupported: measurement?.supported === true,
    matchingAttributionCount,
    distinctChildUrls,
    exactlyOneChildUrl: distinctChildUrls.length === 1,
  });
}

export function normalizeDisposableRealmResourceAssertions(assertions) {
  const source = Array.isArray(assertions) ? assertions : [];
  return Object.freeze(REQUIRED_DISPOSABLE_REALM_RESOURCES.map((resource) => {
    const matches = source.filter((assertion) => assertion?.resource === resource);
    if (matches.length !== 1) {
      return Object.freeze({
        resource,
        status: 'unavailable',
        supported: false,
        outstanding: null,
        before: null,
        after: null,
        evidence: null,
        blocker: matches.length === 0
          ? 'BOM_F3_RESOURCE_ASSERTION_MISSING'
          : 'BOM_F3_RESOURCE_ASSERTION_DUPLICATE',
      });
    }
    const assertion = matches[0];
    const supported = assertion.instrumentationSupported === true;
    const knownStatus =
      assertion.status === 'passed' ||
      assertion.status === 'failed' ||
      assertion.status === 'unavailable';
    return Object.freeze({
      resource,
      status: supported && knownStatus ? assertion.status : 'unavailable',
      supported,
      outstanding:
        Number.isInteger(assertion.outstanding) && assertion.outstanding >= 0
          ? assertion.outstanding
          : null,
      before:
        Number.isInteger(assertion.before) && assertion.before >= 0
          ? assertion.before
          : null,
      after:
        Number.isInteger(assertion.after) && assertion.after >= 0
          ? assertion.after
          : null,
      evidence: typeof assertion.evidence === 'string'
        ? assertion.evidence
        : null,
      blocker: typeof assertion.blocker === 'string'
        ? assertion.blocker
        : null,
    });
  }));
}

export async function collectGarbageCycles(pageSession, cycles = 2) {
  if (!Number.isInteger(cycles) || cycles < 0) {
    throw new RangeError('CDP GC cycles must be a non-negative integer.');
  }
  await pageSession.send('HeapProfiler.enable').catch(() => undefined);
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    await pageSession.send('HeapProfiler.collectGarbage');
  }
}

async function waitForFrameDetach(page, realmId) {
  await page.waitForFunction(
    (expectedRealmId) =>
      Array.from(
        document.querySelectorAll('iframe[data-bom-disposable-realm]'),
      ).every(
        (frame) => frame.getAttribute('data-bom-disposable-realm') !== expectedRealmId,
      ),
    realmId,
    { timeout: 5_000 },
  );
  return true;
}

function qualifiedRawDelta(lifecycle) {
  if (!lifecycle.releaseQualified) {
    return null;
  }
  return diagnosticRawDelta(lifecycle);
}

function lifecycleReleasedWithoutChild(lifecycle, requireReadyMemory) {
  return (
    lifecycle?.completed === true &&
    lifecycle.destroy?.passed === true &&
    lifecycle.destroy?.removalAuthorized === true &&
    lifecycle.releaseQualified === true &&
    lifecycle.frameDetached === true &&
    lifecycle.afterRemoval?.measured === true &&
    lifecycle.afterRemoval.childAttributionPresent === false &&
    (!requireReadyMemory ||
      (lifecycle.ready?.measured === true &&
        lifecycle.ready.childAttributionPresent === true))
  );
}

function diagnosticRawDelta(lifecycle) {
  const baseline = lifecycle.baselineMemory?.bytes;
  const afterRemoval = lifecycle.afterRemovalMemory?.bytes;
  return Number.isFinite(baseline) && Number.isFinite(afterRemoval)
    ? afterRemoval - baseline
    : null;
}

function disposableRealmUrl(value, realmId) {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const url = new URL(value);
    return url.searchParams.get(CHILD_REALM_ID_QUERY_KEY) === realmId
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function createConfiguration(instanceCount, viewport, canvasLayerCount) {
  return Object.freeze({
    instanceCount,
    viewport: Object.freeze({
      width: viewport.width,
      height: viewport.height,
    }),
    devicePixelRatio: viewport.devicePixelRatio,
    canvasLayerCount,
  });
}

function assertConfiguration(viewport, canvasLayerCount) {
  if (
    !Number.isInteger(viewport?.width) ||
    viewport.width <= 0 ||
    !Number.isInteger(viewport?.height) ||
    viewport.height <= 0 ||
    !Number.isFinite(viewport?.devicePixelRatio) ||
    viewport.devicePixelRatio <= 0 ||
    !Number.isInteger(canvasLayerCount) ||
    canvasLayerCount <= 0
  ) {
    throw new TypeError('Disposable Realm memory configuration is invalid.');
  }
}

function normalizeRealmPrefix(runId) {
  const value = typeof runId === 'string' ? runId : 'f3';
  const normalized = value.replaceAll(/[^A-Za-z0-9._-]/gu, '-');
  return normalized.slice(0, 40) || 'f3';
}

function assertTimeoutConfiguration(protocolTimeoutMs, operationTimeoutMs) {
  if (
    !Number.isInteger(protocolTimeoutMs) ||
    protocolTimeoutMs <= 0 ||
    !Number.isInteger(operationTimeoutMs) ||
    operationTimeoutMs <= 0
  ) {
    throw new RangeError(
      'Realm memory protocol and operation timeouts must be positive integers.',
    );
  }
}

function runWithProtocolDeadline({
  phase,
  operation,
  startedAtMs,
  deadlineMs,
  operationTimeoutMs,
  progress,
}) {
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) {
    return Promise.reject(createProtocolTimeoutError({
      phase,
      timeoutMs: 0,
      startedAtMs,
      progress,
    }));
  }
  const timeoutMs = Math.min(operationTimeoutMs, remainingMs);
  let timeoutId;
  const work = Promise.resolve().then(operation);
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createProtocolTimeoutError({
        phase,
        timeoutMs,
        startedAtMs,
        progress,
      }));
    }, timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

function createProtocolTimeoutError({
  phase,
  timeoutMs,
  startedAtMs,
  progress,
}) {
  return new RealmMemoryProtocolTimeoutError({
    phase,
    timeoutMs,
    elapsedMs: Date.now() - startedAtMs,
    diagnostics: progress(),
  });
}

async function captureOperation(operation, errors, phase) {
  try {
    return await operation();
  } catch (error) {
    if (isProtocolTimeout(error)) {
      throw error;
    }
    errors.push(serializeError(error, phase));
    return null;
  }
}

async function captureSample(operation, errors, phase) {
  return captureOperation(operation, errors, phase);
}

async function captureDetach(operation, errors) {
  const result = await captureOperation(operation, errors, 'frame-detach');
  return result === true;
}

function serializeError(error, phase) {
  return Object.freeze({
    phase,
    name: error instanceof Error ? error.name : 'UnknownError',
    code: typeof error?.code === 'string' ? error.code : null,
    message: error instanceof Error ? error.message : String(error),
    diagnostics: error?.diagnostics ?? null,
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertPageOpen(page, phase) {
  if (page?.isClosed?.() === true) {
    throw new AcceptanceTargetLostError(phase);
  }
}

function isTargetLost(error) {
  return error !== null && typeof error === 'object' &&
    error.code === BOM_F3_ACCEPTANCE_TARGET_LOST;
}

function isTargetLossFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:Target page, context or browser has been closed|Execution context was destroyed)/u.test(
    message,
  );
}

function isProtocolTimeout(error) {
  return error !== null && typeof error === 'object' &&
    error.code === BOM_F3_REALM_MEMORY_PROTOCOL_TIMEOUT;
}

function isRealmMemoryUnavailable(error) {
  return error !== null && typeof error === 'object' &&
    error.code === BOM_F3_REALM_MEMORY_UNAVAILABLE;
}
