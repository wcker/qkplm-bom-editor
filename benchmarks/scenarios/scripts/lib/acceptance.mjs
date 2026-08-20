import { assessSameDocumentLifecycleMemory } from './memory.mjs';

export const FORMAL_UA_MEMORY_TIMEOUT_MS = 30_000;
export const SMOKE_UA_MEMORY_TIMEOUT_MS = 2_000;
export const BOM_F3_UA_MEMORY_EVALUATION_TIMEOUT =
  'BOM_F3_UA_MEMORY_EVALUATION_TIMEOUT';
export const BOM_F3_UA_MEMORY_UNAVAILABLE =
  'BOM_F3_UA_MEMORY_UNAVAILABLE';
export const BOM_F3_ACCEPTANCE_CALL_TIMEOUT =
  'BOM_F3_ACCEPTANCE_CALL_TIMEOUT';
export const DEFAULT_ACCEPTANCE_CALL_TIMEOUT_MS = 30_000;
export const CONTINUOUS_SCROLL_ACCEPTANCE_CALL_TIMEOUT_MS = 60_000;

const METHOD_ALIASES = Object.freeze({
  metadata: ['metadata', 'getMetadata'],
  coldMount: ['coldMount', 'runColdMountSample'],
  prepareInput: ['prepareInput', 'prepareInputSample'],
  armInput: ['armInput', 'armInputSample'],
  waitForInput: ['waitForInput', 'waitForInputSample'],
  resetInput: ['resetInput', 'resetInputSample'],
  continuousScroll: ['runContinuousScroll'],
  resetAcceptance: ['reset'],
  correctness: ['correctness', 'runCorrectness'],
  createInstances: ['createInstances', 'createLifecycleInstances'],
  unmountRemount: ['unmountRemountPrimary'],
  destroyInstances: ['destroyInstances', 'destroyLifecycleInstances'],
  createDisposableRealm: ['createDisposableRealm'],
  destroyDisposableRealm: ['destroyDisposableRealm'],
  releaseDisposableRealm: ['releaseDisposableRealm'],
  discardDisposableRealm: ['discardDisposableRealm'],
});

export async function waitForAcceptanceApi(page) {
  await page.waitForFunction(
    () => {
      const api = globalThis.__BOM_F3_ACCEPTANCE__;
      return api !== undefined && /^1(?:\\.|$)/u.test(String(api.version));
    },
    undefined,
    { timeout: 30_000 },
  );
  const description = await page.evaluate((aliases) => {
    const api = globalThis.__BOM_F3_ACCEPTANCE__;
    const methods = {};
    for (const [capability, candidates] of Object.entries(aliases)) {
      methods[capability] = candidates.find((name) => typeof api[name] === 'function') ?? null;
    }
    return { version: api.version, methods };
  }, METHOD_ALIASES);
  for (const capability of Object.keys(METHOD_ALIASES)) {
    if (description.methods[capability] === null) {
      throw new Error(`BOM_F3_ACCEPTANCE_METHOD_MISSING:${capability}`);
    }
  }
  return Object.freeze(description);
}

export async function callAcceptance(
  page,
  description,
  capability,
  argument = undefined,
  timeoutMs = undefined,
) {
  const method = description.methods[capability];
  if (typeof method !== 'string') {
    throw new Error(`BOM_F3_ACCEPTANCE_METHOD_MISSING:${capability}`);
  }
  const effectiveTimeoutMs = timeoutMs ?? (
    capability === 'continuousScroll'
      ? CONTINUOUS_SCROLL_ACCEPTANCE_CALL_TIMEOUT_MS
      : DEFAULT_ACCEPTANCE_CALL_TIMEOUT_MS
  );
  if (!Number.isInteger(effectiveTimeoutMs) || effectiveTimeoutMs <= 0) {
    throw new RangeError('Acceptance call timeout must be a positive integer.');
  }
  const evaluation = page.evaluate(
    async ({ methodName, value }) => {
      const api = globalThis.__BOM_F3_ACCEPTANCE__;
      return api[methodName](value);
    },
    { methodName: method, value: argument },
  );
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(
        BOM_F3_ACCEPTANCE_CALL_TIMEOUT + ':' + capability,
      );
      error.name = 'AcceptanceCallTimeoutError';
      error.code = BOM_F3_ACCEPTANCE_CALL_TIMEOUT;
      error.phase = capability;
      error.stage = capability;
      error.diagnostics = Object.freeze({
        capability,
        timeoutMs: effectiveTimeoutMs,
      });
      reject(error);
    }, effectiveTimeoutMs);
  });
  try {
    return await Promise.race([evaluation, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function runColdMountSamples(page, description, counts) {
  const raw = [];
  const total = counts.warmup + counts.measured;
  for (let index = 0; index < total; index += 1) {
    const phase = index < counts.warmup ? 'warmup' : 'measured';
    const sampleId = `cold-${phase}-${String(index).padStart(3, '0')}`;
    const result = await callAcceptance(page, description, 'coldMount', { sampleId });
    assertDuration(result?.durationMs, `cold mount ${sampleId}`);
    if (
      result.endpoint !== 'interactive-ready' ||
      result.readyEventCount !== 1 ||
      result.inspection?.interactive !== true
    ) {
      throw new Error(`BOM_F3_COLD_MOUNT_FAILED:${sampleId}:${JSON.stringify(result)}`);
    }
    raw.push(Object.freeze({
      sampleId,
      phase,
      ordinal: index,
      endpoint: 'editor-ready-after-initial-canvas-semantic-portal-sync',
      ...result,
      durationMs: result.durationMs,
    }));
  }
  return Object.freeze(raw);
}

export async function runInputFeedbackSamples(page, description, counts) {
  const raw = [];
  const total = counts.warmup + counts.measured;
  for (let index = 0; index < total; index += 1) {
    const phase = index < counts.warmup ? 'warmup' : 'measured';
    const sampleId = `input-${phase}-${String(index).padStart(3, '0')}`;
    const prepared = await callAcceptance(page, description, 'prepareInput', { sampleId });
    if (typeof prepared?.replacementText !== 'string') {
      throw new Error('BOM_F3_INPUT_REPLACEMENT_TEXT_MISSING');
    }
    await performRealPointerEntry(page, prepared);
    const portal = page.locator('[data-bom-editor-portal]:visible');
    await portal.waitFor({ state: 'visible', timeout: 5_000 });
    if (!(await portal.evaluate((element) => document.activeElement === element))) {
      throw new Error('BOM_F3_INPUT_PORTAL_FOCUS_FAILED');
    }
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(prepared.replacementText);
    await callAcceptance(page, description, 'armInput', {
      sampleId,
      expectedValue: prepared.replacementText,
    });
    await page.keyboard.press('Enter');
    const result = await callAcceptance(page, description, 'waitForInput', { sampleId });
    const durationMs = result.durationMs ??
      result.renderCommitCandidateMs - result.inputStartMs;
    const captureToTransactionCommittedMs =
      result.transactionCommittedMs - result.captureObservedMs;
    assertDuration(durationMs, `input feedback ${sampleId}`);
    assertDuration(
      result.captureDelayMs,
      `input dispatch to capture listener ${sampleId}`,
    );
    assertDuration(
      captureToTransactionCommittedMs,
      `capture listener to transaction committed ${sampleId}`,
    );
    assertDuration(
      result.transactionDurationMs,
      `input to transaction committed ${sampleId}`,
    );
    assertDuration(
      result.renderAfterTransactionMs,
      `transaction committed to render candidate ${sampleId}`,
    );
    if (
      Math.abs(
        result.transactionDurationMs +
          result.renderAfterTransactionMs -
          durationMs,
      ) > 0.01 ||
      Math.abs(
        result.captureDelayMs +
          captureToTransactionCommittedMs -
          result.transactionDurationMs,
      ) > 0.01
    ) {
      throw new Error(`BOM_F3_INPUT_SEGMENT_MISMATCH:${sampleId}`);
    }
    const reset = await callAcceptance(page, description, 'resetInput', { sampleId });
    if (
      result.semanticValueMatched !== true ||
      result.transactionCount !== 1 ||
      result.revisionAfter === result.revisionBefore ||
      reset?.passed !== true ||
      reset.contentHashRestored !== true
    ) {
      throw new Error(
        `BOM_F3_INPUT_FEEDBACK_FAILED:${sampleId}:${JSON.stringify({
          semanticValueMatched: result.semanticValueMatched,
          transactionCount: result.transactionCount,
          revisionChanged: result.revisionAfter !== result.revisionBefore,
          resetPassed: reset?.passed,
          contentHashRestored: reset?.contentHashRestored,
        })}`,
      );
    }
    const { expectedValue: _redactedExpectedValue, ...safeResult } = result;
    raw.push(Object.freeze({
      sampleId,
      phase,
      ordinal: index,
      endpoint: 'aria-mutation-after-canvas-draw-render-commit-candidate',
      ...safeResult,
      captureToTransactionCommittedMs,
      durationMs,
      reset,
    }));
  }
  return Object.freeze(raw);
}

export async function runCorrectness(page, description) {
  const result = await callAcceptance(page, description, 'correctness', {});
  if (result?.passed !== true) {
    throw new Error(`BOM_F3_CORRECTNESS_FAILED:${JSON.stringify(result)}`);
  }
  return Object.freeze(result);
}

export async function prepareContinuousScroll(page, description) {
  const reset = await callAcceptance(
    page,
    description,
    'resetAcceptance',
  );
  assertLifecycleReset(reset, 1, 'continuous-scroll');
  const created = await callAcceptance(
    page,
    description,
    'createInstances',
    { instanceCount: 1 },
  );
  if (
    created?.passed !== true ||
    created.requestedCount !== 1 ||
    created.allInteractive !== true ||
    created.state?.instanceCount !== 1
  ) {
    throw new Error(
      `BOM_F3_SCROLL_PREPARE_FAILED:${JSON.stringify(created)}`,
    );
  }
  return Object.freeze({ reset, created });
}

export async function runContinuousScroll(page, description) {
  const result = await callAcceptance(
    page,
    description,
    'continuousScroll',
  );
  if (
    result?.schemaVersion !==
      'bom-f3-application-pixel-frame-evidence/v1' ||
    result.protocolId !== 'bom-f3-fixed-scroll-pixel-correlation/v1' ||
    result.window?.id !== 'f3-10k-scroll-30s' ||
    !Number.isFinite(result.window.durationMs) ||
    result.window.durationMs < 30_000 ||
    !Array.isArray(result.scrollStates) ||
    !Array.isArray(result.paintStates)
  ) {
    throw new Error(
      `BOM_F3_SCROLL_EVIDENCE_INVALID:${JSON.stringify({
        schemaVersion: result?.schemaVersion,
        protocolId: result?.protocolId,
        window: result?.window,
        scrollStateCount: result?.scrollStates?.length,
        paintStateCount: result?.paintStates?.length,
      })}`,
    );
  }
  return Object.freeze(result);
}

export async function runLifecycleScenarios({
  page,
  pageSession,
  description,
  mode,
}) {
  const results = [];
  for (const instanceCount of [1, 3, 5]) {
    const initialReset = await callAcceptance(page, description, 'resetAcceptance');
    assertLifecycleReset(initialReset, instanceCount, 'initial');
    await collectGarbage(pageSession);

    // This reduces first-use allocator bias only. A shared Document cannot
    // qualify a normative destroy-retention measurement, even with formal waits.
    const warmupCreated = await callAcceptance(
      page,
      description,
      'createInstances',
      { instanceCount },
    );
    if (warmupCreated?.passed !== true) {
      throw new Error(
        `BOM_F3_LIFECYCLE_ALLOCATOR_WARMUP_CREATE_FAILED:${instanceCount}:${JSON.stringify(warmupCreated)}`,
      );
    }
    const warmupDestroyed = await callAcceptance(
      page,
      description,
      'destroyInstances',
      { instanceCount },
    );
    assertLifecycleDestroyed(warmupDestroyed, instanceCount, 'allocator-warmup');
    const allocatorWarmupQuietMs = mode === 'formal' ? 30_000 : 100;
    const allocatorWarmupPostGcMs = mode === 'formal' ? 5_000 : 100;
    await delay(allocatorWarmupQuietMs);
    await collectGarbage(pageSession);
    await delay(allocatorWarmupPostGcMs);

    const resetState = await callAcceptance(page, description, 'resetAcceptance');
    assertLifecycleReset(resetState, instanceCount, 'post-warmup');
    const memoryTimeoutMs = mode === 'formal'
      ? FORMAL_UA_MEMORY_TIMEOUT_MS
      : SMOKE_UA_MEMORY_TIMEOUT_MS;
    const baselineMemory = await measureUaMemory(page, memoryTimeoutMs);
    assertUaMemoryEvaluationReturned(
      baselineMemory,
      `lifecycle-${instanceCount}-baseline`,
      mode,
    );
    const created = await callAcceptance(page, description, 'createInstances', { instanceCount });
    if (created?.passed !== true) {
      throw new Error(`BOM_F3_LIFECYCLE_CREATE_FAILED:${instanceCount}:${JSON.stringify(created)}`);
    }
    if (
      created.requestedCount !== instanceCount ||
      created.allInteractive !== true ||
      new Set(created.instanceIds).size !== instanceCount ||
      created.state?.instanceCount !== instanceCount ||
      created.state?.rendererRootCount !== instanceCount ||
      created.state?.canvasCount !== instanceCount * 3 ||
      created.state?.portalCount !== instanceCount
    ) {
      throw new Error(
        `BOM_F3_LIFECYCLE_ISOLATION_FAILED:${instanceCount}:${JSON.stringify(created)}`,
      );
    }
    const unmountRemount = instanceCount === 1
      ? await callAcceptance(page, description, 'unmountRemount')
      : null;
    if (
      unmountRemount !== null &&
      !(
        unmountRemount.modelPreserved === true &&
        unmountRemount.firstUnmountOk === true &&
        unmountRemount.secondUnmountOk === true &&
        unmountRemount.oldHostRendererRootCount === 0 &&
        unmountRemount.oldHostCanvasCount === 0 &&
        unmountRemount.inspection?.interactive === true
      )
    ) {
      throw new Error(
        `BOM_F3_LIFECYCLE_UNMOUNT_REMOUNT_FAILED:${JSON.stringify(unmountRemount)}`,
      );
    }
    const isolationCorrectness = instanceCount === 3
      ? await callAcceptance(page, description, 'correctness', {})
      : null;
    if (
      isolationCorrectness !== null &&
      !(isolationCorrectness.passed === true && isolationCorrectness.otherInstancesUnchanged === true)
    ) {
      throw new Error(
        `BOM_F3_LIFECYCLE_ISOLATION_EDIT_FAILED:${JSON.stringify(isolationCorrectness)}`,
      );
    }
    const readyMemory = await measureUaMemory(page, memoryTimeoutMs);
    assertUaMemoryEvaluationReturned(
      readyMemory,
      `lifecycle-${instanceCount}-ready`,
      mode,
    );
    const destroyed = await callAcceptance(page, description, 'destroyInstances', { instanceCount });
    assertLifecycleDestroyed(destroyed, instanceCount, 'measured');
    const retentionQuietMs = mode === 'formal' ? 30_000 : 100;
    const retentionPostGcMs = mode === 'formal' ? 5_000 : 100;
    await delay(retentionQuietMs);
    await collectGarbage(pageSession);
    await delay(retentionPostGcMs);
    const afterDestroyMemory = await measureUaMemory(page, memoryTimeoutMs);
    assertUaMemoryEvaluationReturned(
      afterDestroyMemory,
      `lifecycle-${instanceCount}-after-destroy`,
      mode,
    );
    const protocol = Object.freeze({
      allocatorWarmup: Object.freeze({
        strategy: 'matched-instance-count-create-destroy',
        instanceCount,
        quietBeforeGcMs: allocatorWarmupQuietMs,
        cdpGcCycles: 2,
        quietAfterGcMs: allocatorWarmupPostGcMs,
        normative: false,
        normativeQuietTimingApplied: mode === 'formal',
        purpose: 'reduce first-use allocator bias only',
      }),
      retentionSample: Object.freeze({
        mode,
        quietBeforeGcMs: retentionQuietMs,
        cdpGcCycles: 2,
        quietAfterGcMs: retentionPostGcMs,
        normative: false,
        normativeQuietTimingApplied: mode === 'formal',
      }),
    });
    const memoryAssessment = assessSameDocumentLifecycleMemory({
      baselineMemory,
      readyMemory,
      afterDestroyMemory,
      destroyed,
      protocol,
    });
    results.push(Object.freeze({
      instanceCount,
      allocatorWarmup: Object.freeze({
        created: summarizeLifecycleOperation(warmupCreated),
        destroyed: summarizeLifecycleOperation(warmupDestroyed),
      }),
      resetState,
      created,
      unmountRemount,
      isolationCorrectness,
      destroyed,
      baselineMemory,
      readyMemory,
      afterDestroyMemory,
      memoryAssessment,
    }));
  }
  return Object.freeze(results);
}

export async function measureUaMemory(
  page,
  timeoutMs = FORMAL_UA_MEMORY_TIMEOUT_MS,
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('UA memory measurement timeout must be positive.');
  }
  const evaluation = page.evaluate(async (timeoutMs) => {
    const timestampMs = () => performance.timeOrigin + performance.now();
    if (globalThis.crossOriginIsolated !== true) {
      return {
        supported: false,
        reason: 'crossOriginIsolated is false',
        bytes: null,
        breakdown: null,
        timestampMs: timestampMs(),
      };
    }
    if (typeof performance.measureUserAgentSpecificMemory !== 'function') {
      return {
        supported: false,
        reason: 'measureUserAgentSpecificMemory is unavailable',
        bytes: null,
        breakdown: null,
        timestampMs: timestampMs(),
      };
    }
    let timeoutId;
    try {
      const measurement = await Promise.race([
        performance.measureUserAgentSpecificMemory(),
        new Promise((_, reject) =>
          timeoutId = setTimeout(
            () => reject(new Error('UA memory measurement timed out')),
            timeoutMs,
          ),
        ),
      ]);
      return {
        supported: true,
        reason: null,
        bytes: measurement.bytes,
        breakdown: measurement.breakdown.map((entry) => ({
          bytes: entry.bytes,
          types: entry.types,
          scopeCount: entry.attribution.length,
          attribution: entry.attribution.map((item) => ({
            scope: typeof item.scope === 'string' ? item.scope : null,
            url: typeof item.url === 'string' ? item.url : null,
          })),
        })),
        timestampMs: timestampMs(),
      };
    } catch (error) {
      return {
        supported: false,
        reason: String(error),
        bytes: null,
        breakdown: null,
        timestampMs: timestampMs(),
      };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }, timeoutMs);
  let timeoutId;
  const hostTimeoutMs = timeoutMs + 1_000;
  const hostTimeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        supported: false,
        reason: 'UA memory page evaluation timed out',
        hostTimedOut: true,
        bytes: null,
        breakdown: null,
        timestampMs: Date.now(),
      });
    }, hostTimeoutMs);
  });
  try {
    return await Promise.race([evaluation, hostTimeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function assertUaMemoryEvaluationReturned(measurement, phase, mode) {
  const hostTimedOut = measurement?.hostTimedOut === true;
  const formalUnavailable = mode === 'formal' && measurement?.supported !== true;
  if (!hostTimedOut && !formalUnavailable) {
    return;
  }
  const code = hostTimedOut
    ? BOM_F3_UA_MEMORY_EVALUATION_TIMEOUT
    : BOM_F3_UA_MEMORY_UNAVAILABLE;
  const error = new Error(code + ':' + phase);
  error.name = hostTimedOut
    ? 'UaMemoryEvaluationTimeoutError'
    : 'UaMemoryUnavailableError';
  error.code = code;
  error.phase = phase;
  error.stage = phase;
  error.diagnostics = Object.freeze({
    reason: measurement.reason ?? 'UA memory page evaluation timed out',
    timestampMs: measurement.timestampMs ?? null,
  });
  throw error;
}

async function performRealPointerEntry(page, prepared) {
  if (typeof prepared?.selector === 'string') {
    await page.locator(prepared.selector).dblclick({ position: prepared.position });
    return;
  }
  const point = prepared?.point ?? prepared?.interactionPoint;
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    throw new Error('BOM_F3_INPUT_POINTER_TARGET_MISSING');
  }
  await page.mouse.dblclick(point.x, point.y, { button: 'left', delay: 20 });
}

async function collectGarbage(pageSession) {
  await pageSession.send('HeapProfiler.enable').catch(() => undefined);
  await pageSession.send('HeapProfiler.collectGarbage');
  await pageSession.send('HeapProfiler.collectGarbage');
}

function assertLifecycleReset(state, instanceCount, phase) {
  if (
    state?.instanceCount !== 0 ||
    state?.rendererRootCount !== 0 ||
    state?.canvasCount !== 0 ||
    state?.portalCount !== 0
  ) {
    throw new Error(
      `BOM_F3_LIFECYCLE_RESET_FAILED:${instanceCount}:${phase}:${JSON.stringify(state)}`,
    );
  }
}

function assertLifecycleDestroyed(result, instanceCount, phase) {
  if (
    result?.passed !== true ||
    result.requestedCount !== instanceCount ||
    result.destroyedCount !== instanceCount ||
    result.remainingRendererRootCount !== 0 ||
    result.remainingCanvasCount !== 0 ||
    result.remainingPortalCount !== 0
  ) {
    throw new Error(
      `BOM_F3_LIFECYCLE_DESTROY_FAILED:${instanceCount}:${phase}:${JSON.stringify(result)}`,
    );
  }
}

function summarizeLifecycleOperation(result) {
  return Object.freeze({
    passed: result?.passed === true,
    requestedCount: finiteOrNull(result?.requestedCount),
    destroyedCount: finiteOrNull(result?.destroyedCount),
    rendererRootCount: finiteOrNull(
      result?.state?.rendererRootCount ?? result?.remainingRendererRootCount,
    ),
    canvasCount: finiteOrNull(result?.state?.canvasCount ?? result?.remainingCanvasCount),
    portalCount: finiteOrNull(result?.state?.portalCount ?? result?.remainingPortalCount),
  });
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function assertDuration(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`BOM_F3_INVALID_DURATION:${label}`);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
