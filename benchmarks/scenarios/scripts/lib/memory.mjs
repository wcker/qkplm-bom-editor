export const DESTROY_RETENTION_LIMIT_BYTES = 5 * 1024 * 1024;

export const CANVAS_ALLOCATOR_BASELINE_BLOCKER =
  'Canvas allocator baseline is not calibrated for normative destroy-retention attribution';

export const SAME_DOCUMENT_MEMORY_PROTOCOL =
  'same-document-matched-warmup-diagnostic/v1';

/**
 * UA memory is browser accounting, not an ownership graph. In the same
 * Document, Chrome may keep Canvas allocator capacity after every DOM and
 * editor-owned reference has been released. Preserve that delta for diagnosis,
 * but never turn it into a normative component-retention verdict.
 */
export function assessSameDocumentLifecycleMemory({
  baselineMemory,
  readyMemory,
  afterDestroyMemory,
  destroyed,
  protocol,
}) {
  const uaMemorySupported = [baselineMemory, readyMemory, afterDestroyMemory]
    .every((measurement) => measurement?.supported === true);
  const baselineByType = summarizeBreakdown(baselineMemory);
  const readyByType = summarizeBreakdown(readyMemory);
  const afterDestroyByType = summarizeBreakdown(afterDestroyMemory);
  const observableResourceRelease = assessObservableResourceRelease(destroyed);

  return Object.freeze({
    protocol: Object.freeze({
      id: SAME_DOCUMENT_MEMORY_PROTOCOL,
      measurementScope: 'shared-acceptance-document',
      realmReclaimedBetweenBaselineAndAfterDestroy: false,
      allocatorWarmup: Object.freeze({ ...protocol.allocatorWarmup }),
      retentionSample: Object.freeze({ ...protocol.retentionSample }),
      baselineIdleSampleCount: 1,
      normativeRequiredBaselineIdleSampleCount: 10,
    }),
    uaMemorySupported,
    observableResourceRelease,
    diagnostic: Object.freeze({
      semantics: 'same-document UA-memory delta; not component ownership or leak attribution',
      readyMinusBaselineBytes: supportedDelta(readyMemory, baselineMemory),
      afterDestroyMinusBaselineBytes: supportedDelta(afterDestroyMemory, baselineMemory),
      retainedPositivePartBytes: supportedPositiveDelta(afterDestroyMemory, baselineMemory),
      baselineBreakdownBytes: baselineByType,
      readyBreakdownBytes: readyByType,
      afterDestroyBreakdownBytes: afterDestroyByType,
      afterDestroyMinusBaselineBreakdownBytes: subtractBreakdowns(
        afterDestroyByType,
        baselineByType,
        uaMemorySupported,
      ),
    }),
    canvasAllocator: Object.freeze({
      baselineBytes: supportedTypeBytes(baselineByType, uaMemorySupported, 'Canvas'),
      readyBytes: supportedTypeBytes(readyByType, uaMemorySupported, 'Canvas'),
      afterDestroyBytes: supportedTypeBytes(afterDestroyByType, uaMemorySupported, 'Canvas'),
      afterDestroyMinusBaselineBytes: supportedTypeDelta(
        afterDestroyByType,
        baselineByType,
        uaMemorySupported,
        'Canvas',
      ),
      baselineCalibrated: false,
      attribution: 'unqualified: browser allocator capacity and component ownership are not separable in one Document',
    }),
    normativeRetention: Object.freeze({
      status: 'unqualified',
      retainedBytes: null,
      limitBytes: DESTROY_RETENTION_LIMIT_BYTES,
      withinLimit: null,
      blockerCode: 'CANVAS_ALLOCATOR_BASELINE_NOT_CALIBRATED',
      blocker: CANVAS_ALLOCATOR_BASELINE_BLOCKER,
    }),
  });
}

export function summarizeLifecycleMemoryQualification(lifecycle) {
  const assessments = lifecycle.map((entry) => entry.memoryAssessment);
  const uaMemorySupported = assessments.every(
    (assessment) => assessment?.uaMemorySupported === true,
  );
  const observableResourceReleasePassed = assessments.every(
    (assessment) => assessment?.observableResourceRelease?.passed === true,
  );
  const normativeValues = assessments.map(
    (assessment) => assessment?.normativeRetention?.withinLimit ?? null,
  );
  const normativeRetainedWithinLimit = normativeValues.some((value) => value === false)
    ? false
    : normativeValues.length > 0 && normativeValues.every((value) => value === true)
      ? true
      : null;
  const status = normativeRetainedWithinLimit === false
    ? 'failed'
    : normativeRetainedWithinLimit === true
      ? 'qualified'
      : 'unqualified';

  return Object.freeze({
    protocol: SAME_DOCUMENT_MEMORY_PROTOCOL,
    status,
    uaMemorySupported,
    observableResourceReleasePassed,
    normativeRetainedWithinLimit,
    canvasAllocatorBaselineCalibrated: assessments.length > 0 && assessments.every(
      (assessment) => assessment?.canvasAllocator?.baselineCalibrated === true,
    ),
    blocker: status === 'unqualified' ? CANVAS_ALLOCATOR_BASELINE_BLOCKER : null,
  });
}

function assessObservableResourceRelease(destroyed) {
  const instances = Array.isArray(destroyed?.instances) ? destroyed.instances : [];
  const counts = Object.freeze({
    remainingRendererRootCount: finiteOrNull(destroyed?.remainingRendererRootCount),
    remainingCanvasCount: finiteOrNull(destroyed?.remainingCanvasCount),
    remainingPortalCount: finiteOrNull(destroyed?.remainingPortalCount),
    instanceMountedResourceCount: instances.reduce(
      (total, instance) => total + (Number.isFinite(instance?.mountedResources) ? instance.mountedResources : 0),
      0,
    ),
  });
  const passed =
    destroyed?.passed === true &&
    counts.remainingRendererRootCount === 0 &&
    counts.remainingCanvasCount === 0 &&
    counts.remainingPortalCount === 0 &&
    instances.length > 0 &&
    instances.every((instance) =>
      instance?.lifecycle === 'destroyed' &&
      instance?.mountedResources === 0 &&
      instance?.rendererRootCount === 0 &&
      instance?.canvasCount === 0 &&
      instance?.portalCount === 0,
    );

  return Object.freeze({
    passed,
    semantics: 'editor registry and observable DOM/Canvas/Portal counts only; not UA allocator ownership',
    counts,
  });
}

function summarizeBreakdown(measurement) {
  if (measurement?.supported !== true || !Array.isArray(measurement.breakdown)) {
    return null;
  }
  const result = {};
  for (const entry of measurement.breakdown) {
    if (!Number.isFinite(entry?.bytes)) {
      continue;
    }
    const types = Array.isArray(entry.types) && entry.types.length > 0
      ? [...entry.types].sort().join('+')
      : 'Unattributed';
    result[types] = (result[types] ?? 0) + entry.bytes;
  }
  return Object.freeze(result);
}

function subtractBreakdowns(after, before, supported) {
  if (!supported || after === null || before === null) {
    return null;
  }
  const result = {};
  for (const type of new Set([...Object.keys(before), ...Object.keys(after)])) {
    result[type] = (after[type] ?? 0) - (before[type] ?? 0);
  }
  return Object.freeze(result);
}

function supportedDelta(after, before) {
  return after?.supported === true && before?.supported === true
    ? after.bytes - before.bytes
    : null;
}

function supportedPositiveDelta(after, before) {
  const delta = supportedDelta(after, before);
  return delta === null ? null : Math.max(0, delta);
}

function supportedTypeBytes(breakdown, supported, type) {
  return supported && breakdown !== null ? breakdown[type] ?? 0 : null;
}

function supportedTypeDelta(after, before, supported, type) {
  return supported && after !== null && before !== null
    ? (after[type] ?? 0) - (before[type] ?? 0)
    : null;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
