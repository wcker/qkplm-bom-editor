import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CANVAS_ALLOCATOR_BASELINE_BLOCKER,
  assessSameDocumentLifecycleMemory,
  summarizeLifecycleMemoryQualification,
} from '../scripts/lib/memory.mjs';

const protocol = Object.freeze({
  allocatorWarmup: Object.freeze({
    strategy: 'matched-instance-count-create-destroy',
    quietBeforeGcMs: 100,
    cdpGcCycles: 2,
    quietAfterGcMs: 100,
    normative: false,
    normativeQuietTimingApplied: false,
  }),
  retentionSample: Object.freeze({
    mode: 'smoke',
    quietBeforeGcMs: 100,
    cdpGcCycles: 2,
    quietAfterGcMs: 100,
    normative: false,
    normativeQuietTimingApplied: false,
  }),
});

test('same-Document Canvas allocator growth remains diagnostic and unqualified', () => {
  const assessment = assessSameDocumentLifecycleMemory({
    baselineMemory: memory(150, { Canvas: 100, JavaScript: 50 }),
    readyMemory: memory(280, { Canvas: 200, JavaScript: 80 }),
    afterDestroyMemory: memory(230, { Canvas: 180, JavaScript: 50 }),
    destroyed: destroyedResult(),
    protocol,
  });

  assert.equal(assessment.observableResourceRelease.passed, true);
  assert.equal(assessment.diagnostic.afterDestroyMinusBaselineBytes, 80);
  assert.equal(
    assessment.diagnostic.afterDestroyMinusBaselineBreakdownBytes.Canvas,
    80,
  );
  assert.equal(assessment.canvasAllocator.afterDestroyMinusBaselineBytes, 80);
  assert.equal(assessment.canvasAllocator.baselineCalibrated, false);
  assert.equal(assessment.normativeRetention.status, 'unqualified');
  assert.equal(assessment.normativeRetention.retainedBytes, null);
  assert.equal(assessment.normativeRetention.withinLimit, null);
  assert.equal(assessment.normativeRetention.blocker, CANVAS_ALLOCATOR_BASELINE_BLOCKER);

  const summary = summarizeLifecycleMemoryQualification(
    [1, 3, 5].map((instanceCount) => ({ instanceCount, memoryAssessment: assessment })),
  );
  assert.deepEqual(summary, {
    protocol: 'same-document-matched-warmup-diagnostic/v1',
    status: 'unqualified',
    uaMemorySupported: true,
    observableResourceReleasePassed: true,
    normativeRetainedWithinLimit: null,
    canvasAllocatorBaselineCalibrated: false,
    blocker: CANVAS_ALLOCATOR_BASELINE_BLOCKER,
  });
});

test('observable editor resources are a separate hard lifecycle signal', () => {
  const destroyed = destroyedResult();
  destroyed.remainingCanvasCount = 1;
  destroyed.instances[0].canvasCount = 1;
  const assessment = assessSameDocumentLifecycleMemory({
    baselineMemory: memory(100, { JavaScript: 100 }),
    readyMemory: memory(120, { JavaScript: 120 }),
    afterDestroyMemory: memory(100, { JavaScript: 100 }),
    destroyed,
    protocol,
  });

  assert.equal(assessment.observableResourceRelease.passed, false);
  assert.equal(assessment.normativeRetention.withinLimit, null);
});

test('unsupported UA memory cannot accidentally become a retention verdict', () => {
  const unsupported = Object.freeze({
    supported: false,
    reason: 'unavailable',
    bytes: null,
    breakdown: null,
  });
  const assessment = assessSameDocumentLifecycleMemory({
    baselineMemory: unsupported,
    readyMemory: unsupported,
    afterDestroyMemory: unsupported,
    destroyed: destroyedResult(),
    protocol,
  });

  assert.equal(assessment.uaMemorySupported, false);
  assert.equal(assessment.diagnostic.afterDestroyMinusBaselineBytes, null);
  assert.equal(assessment.canvasAllocator.afterDestroyMinusBaselineBytes, null);
  assert.equal(assessment.normativeRetention.withinLimit, null);
});

test('evidence Schema locks the diagnostic/unqualified semantics', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../schema/f3-evidence.schema.json', import.meta.url),
    'utf8',
  ));

  assert.equal(
    schema.$defs.memoryQualification.properties.status.const,
    'unqualified',
  );
  assert.deepEqual(
    schema.$defs.memoryQualification.properties.normativeRetainedWithinLimit,
    { type: 'null' },
  );
  assert.equal(
    schema.$defs.memoryAssessment.properties.canvasAllocator
      .properties.baselineCalibrated.const,
    false,
  );
  assert.equal(
    schema.$defs.memoryAssessment.properties.normativeRetention
      .properties.withinLimit.type,
    'null',
  );
  assert.deepEqual(
    schema.$defs.inputMetric.allOf[1].properties.segments.required,
    [
      'inputDispatchToCaptureCandidate',
      'captureToTransactionCommittedCandidate',
      'inputToTransactionCommittedCandidate',
      'transactionCommittedToRenderCommitCandidate',
    ],
  );
});

function memory(bytes, breakdown) {
  return Object.freeze({
    supported: true,
    reason: null,
    bytes,
    breakdown: Object.entries(breakdown).map(([type, typeBytes]) => ({
      bytes: typeBytes,
      types: [type],
      scopeCount: 1,
    })),
  });
}

function destroyedResult() {
  return {
    passed: true,
    requestedCount: 1,
    destroyedCount: 1,
    remainingRendererRootCount: 0,
    remainingCanvasCount: 0,
    remainingPortalCount: 0,
    instances: [{
      lifecycle: 'destroyed',
      mountedResources: 0,
      rendererRootCount: 0,
      canvasCount: 0,
      portalCount: 0,
    }],
  };
}
