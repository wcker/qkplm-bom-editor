import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createUnattemptedCompositorTraceEvaluation,
  evaluateCompositorTrace,
  summarizeCompositorTraceEvidence,
} from '../scripts/lib/trace-qualification.mjs';
import {
  APPLICATION_PIXEL_FRAME_CORRELATION_SCHEMA_VERSION,
  APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
} from '../scripts/lib/application-pixel-scroll.mjs';

const fixture = JSON.parse(await readFile(
  new URL('./fixtures/chromium-150-presented-frames.json', import.meta.url),
  'utf8',
));
const evidenceSchemaV2 = JSON.parse(await readFile(
  new URL('../schema/f3-evidence-v2.schema.json', import.meta.url),
  'utf8',
));
const evidenceSchemaV3 = JSON.parse(await readFile(
  new URL('../schema/f3-evidence-v3.schema.json', import.meta.url),
  'utf8',
));
const browser = Object.freeze({
  browserVersion: 'Chrome/150.0.7871.127',
  browserRevision: '@86e682ff10b168a25994de599ae5794936efe46a',
  refreshPeriodUs: 1_000_000 / 60,
});
const thresholds = Object.freeze({
  scrollDurationMs: 30_000,
  frameP95Ms: 16.7,
  frameP99Ms: 33.3,
});

test('trace evaluation separates certified extraction from a failed performance gate', () => {
  const result = evaluateCompositorTrace({
    traceInput: fixture,
    ...browser,
    windowId: 'fixture-window',
    thresholds,
  });

  assert.equal(result.extraction.status, 'succeeded');
  assert.equal(result.extraction.certified, true);
  assert.equal(result.evidence.extractor.certified, true);
  assert.equal(result.applicationPixelCorrelation.qualified, false);
  assert.equal(result.metric.statistics.count, 4);
  assert.equal(result.gate.status, 'failed');
  assert.equal(result.gate.checks.frameP95.passed, false);
  assert.equal(result.gate.checks.applicationPixelBlank.passed, null);
  assert.equal(
    'applicationPixelBlankFrameCount' in
      result.evidence.missingOrCheckerboardFrames,
    false,
  );
});

test('evaluation correlates independent application evidence without mutating trace evidence', () => {
  const extractionOnly = evaluateCompositorTrace({
    traceInput: fixture,
    ...browser,
    windowId: 'fixture-window',
    thresholds,
  });
  const result = evaluateCompositorTrace({
    traceInput: fixture,
    ...browser,
    windowId: 'fixture-window',
    thresholds,
    applicationPixelEvidence: applicationEvidence(extractionOnly.evidence),
  });

  assert.equal(result.applicationPixelCorrelation.qualified, true);
  assert.equal(result.applicationPixelCorrelation.blankFrameCount, 0);
  assert.equal(result.gate.checks.applicationPixelBlank.passed, true);
  assert.equal(result.metric.applicationPixelCorrelationQualified, true);
  assert.equal(result.metric.applicationPixelBlankFrameCount, 0);
  assert.equal(
    'applicationPixelBlankFrameCount' in
      result.evidence.missingOrCheckerboardFrames,
    false,
  );
});

test('missing markers become structured unqualified extraction evidence', () => {
  const withoutMarkers = structuredClone(fixture);
  withoutMarkers.traceEvents = withoutMarkers.traceEvents.filter(
    (event) => !event.name.startsWith('bom:f3:scroll:'),
  );
  const result = evaluateCompositorTrace({
    traceInput: withoutMarkers,
    ...browser,
    windowId: 'fixture-window',
    thresholds,
  });

  assert.equal(result.extraction.status, 'failed');
  assert.equal(result.extraction.certified, false);
  assert.equal(
    result.extraction.error.code,
    'BOM_F3_TRACE_SCROLL_WINDOW_MARKER_COUNT_INVALID',
  );
  assert.equal(result.metric, null);
  assert.equal(result.gate.status, 'unqualified');
});

test('P99 sample floor and application pixel evidence stay fail closed', () => {
  const insufficientEvidence = evidence({ intervalCount: 999 });
  const insufficient = summarizeCompositorTraceEvidence(
    insufficientEvidence,
    thresholds,
    correlation({
      frameCount: insufficientEvidence.presentedFrames.count,
      blankFrameCount: 0,
    }),
  );
  assert.equal(insufficient.metric.statistics.p99Ms, null);
  assert.equal(insufficient.gate.status, 'unqualified');
  assert.equal(insufficient.gate.checks.intervalSampleFloor.passed, false);
  assert.equal(insufficient.gate.checks.applicationPixelBlank.passed, true);

  const completeEvidence = evidence({ intervalCount: 1_000 });
  const pixelUnknown = summarizeCompositorTraceEvidence(
    completeEvidence,
    thresholds,
    correlation({
      frameCount: completeEvidence.presentedFrames.count,
      blankFrameCount: 0,
      qualified: false,
    }),
  );
  assert.notEqual(pixelUnknown.metric.statistics.p99Ms, null);
  assert.equal(pixelUnknown.gate.status, 'unqualified');
  assert.equal(pixelUnknown.gate.checks.applicationPixelBlank.passed, null);

  const complete = summarizeCompositorTraceEvidence(
    completeEvidence,
    thresholds,
    correlation({
      frameCount: completeEvidence.presentedFrames.count,
      blankFrameCount: 0,
    }),
  );
  assert.equal(complete.gate.status, 'passed');
});

test('only a strictly valid qualified correlation can supply blank-frame counts', () => {
  const traceEvidence = evidence({ intervalCount: 1_000 });
  traceEvidence.missingOrCheckerboardFrames.applicationPixelBlankFrameCount = 0;
  const embeddedValue = summarizeCompositorTraceEvidence(
    traceEvidence,
    thresholds,
  );
  assert.equal(embeddedValue.metric.applicationPixelBlankFrameCount, null);
  assert.equal(embeddedValue.gate.status, 'unqualified');

  const wrongFrameCount = summarizeCompositorTraceEvidence(
    traceEvidence,
    thresholds,
    correlation({
      frameCount: traceEvidence.presentedFrames.count - 1,
      blankFrameCount: 0,
    }),
  );
  assert.equal(wrongFrameCount.metric.applicationPixelBlankFrameCount, null);
  assert.equal(
    wrongFrameCount.metric.applicationPixelCorrelationQualified,
    false,
  );
  assert.equal(wrongFrameCount.gate.status, 'unqualified');

  const wrongSchema = summarizeCompositorTraceEvidence(
    traceEvidence,
    thresholds,
    {
      ...correlation({
        frameCount: traceEvidence.presentedFrames.count,
        blankFrameCount: 0,
      }),
      schemaVersion: 'unknown-correlation/v1',
    },
  );
  assert.equal(wrongSchema.metric.applicationPixelBlankFrameCount, null);
  assert.equal(wrongSchema.gate.status, 'unqualified');
});

test('definite compositor or application blank evidence is a hard failure', () => {
  const compositorEvidence = evidence({
    intervalCount: 1_000,
    missingOrCheckerboardFrameCount: 1,
  });
  const compositorMissing = summarizeCompositorTraceEvidence(
    compositorEvidence,
    thresholds,
    correlation({
      frameCount: compositorEvidence.presentedFrames.count,
      blankFrameCount: 0,
    }),
  );
  assert.equal(compositorMissing.gate.status, 'failed');

  const applicationEvidence = evidence({ intervalCount: 1_000 });
  const applicationBlank = summarizeCompositorTraceEvidence(
    applicationEvidence,
    thresholds,
    correlation({
      frameCount: applicationEvidence.presentedFrames.count,
      blankFrameCount: 1,
    }),
  );
  assert.equal(applicationBlank.gate.status, 'failed');
});

test('capture failures are represented as not-attempted and uncertified', () => {
  const result = createUnattemptedCompositorTraceEvaluation({
    code: 'BOM_F3_TRACE_CAPTURE_MISSING',
    message: 'compositor trace was not captured',
  });
  assert.equal(result.extraction.status, 'not-attempted');
  assert.equal(result.extraction.certified, false);
  assert.equal(result.extraction.error.code, 'BOM_F3_TRACE_CAPTURE_MISSING');
  assert.equal(result.applicationPixelCorrelation, null);
  assert.equal(result.metric, null);
  assert.equal(result.gate.status, 'unqualified');
});

test('browser evidence v2 locks trace extraction states and remains fail closed', () => {
  assert.equal(
    evidenceSchemaV2.properties.schemaVersion.const,
    'bom-f3-browser-evidence/v2',
  );
  assert.equal(evidenceSchemaV2.properties.f3Pass.const, false);
  assert.equal(
    evidenceSchemaV2.properties.qualification.properties.releaseQualified.const,
    false,
  );
  assert.deepEqual(
    evidenceSchemaV2.$defs.traceExtraction.properties.status.enum,
    ['not-attempted', 'succeeded', 'failed'],
  );
  assert.equal(
    evidenceSchemaV2.$defs.traceExtraction.properties.extractorId.const,
    'bom-f3-chromium-compositor-presented-frame/v1',
  );
  assert.equal(
    evidenceSchemaV2.$defs.traceExtraction.allOf[0].then.properties.certified.const,
    true,
  );
  assert.equal(
    evidenceSchemaV2.$defs.traceExtraction.allOf[0].else.properties.certified.const,
    false,
  );
  assert.equal(
    'applicationPixelCorrelationQualified' in
      evidenceSchemaV2.$defs.scrollMetric.properties,
    false,
  );
  assert.deepEqual(
    evidenceSchemaV3.properties.evidence.required,
    [
      'realmMemoryArtifact',
      'applicationPixelEvidenceArtifact',
      'applicationPixelCorrelationArtifact',
    ],
  );
  assert.equal(
    evidenceSchemaV3.properties.metrics.properties
      .continuousScrollPresentation.anyOf[0].$ref,
    '#/$defs/scrollMetric',
  );
  assert.equal(
    evidenceSchemaV3.$defs.scrollMetric.properties
      .applicationPixelCorrelationQualified.type,
    'boolean',
  );
  assert.equal(
    evidenceSchemaV3.$defs.scrollMetric.required.includes(
      'applicationPixelCorrelationQualified',
    ),
    true,
  );
  assert.equal(
    'applicationPixelEvidenceArtifact' in
      evidenceSchemaV2.$defs.trace.properties,
    false,
  );
});

function evidence({
  intervalCount,
  missingOrCheckerboardFrameCount = 0,
}) {
  return {
    window: { durationUs: 30_000_000 },
    presentedFrames: {
      authoritativeEvent: 'Display::FrameDisplayed',
      count: intervalCount + 1,
      intervalsMs: Array.from({ length: intervalCount }, () => 16.667),
    },
    missedVsync: { count: 0 },
    missingOrCheckerboardFrames: {
      count: missingOrCheckerboardFrameCount,
      semantics: 'compositor missing/checkerboard only',
    },
  };
}

function correlation({
  frameCount,
  blankFrameCount,
  qualified = true,
}) {
  return {
    schemaVersion: APPLICATION_PIXEL_FRAME_CORRELATION_SCHEMA_VERSION,
    evidenceSchemaVersion: APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
    status: qualified
      ? (blankFrameCount === 0 ? 'passed' : 'failed')
      : 'unqualified',
    qualified,
    passed: qualified ? blankFrameCount === 0 : null,
    blankFrameCount: qualified ? blankFrameCount : null,
    frameCount,
  };
}

function applicationEvidence(traceEvidence) {
  const durationMs = traceEvidence.window.durationUs / 1_000;
  const startTimeMs = 100;
  const endTimeMs = startTimeMs + durationMs;
  const layer = (name) => ({
    layer: name,
    readbackSucceeded: true,
    sampledPixelCount: 2_048,
    nonTransparentPixelCount: 1_024,
    rgbaChecksum: '1234abcd',
  });
  const sampleIntervalMs = 250;
  const sampleCount = durationMs / sampleIntervalMs + 1;
  const samples = Array.from({ length: sampleCount }, (_, sequence) => {
    const elapsedMs = sequence * sampleIntervalMs;
    const progress = elapsedMs / durationMs;
    return {
      sequence,
      timeMs: startTimeMs + elapsedMs,
      scrollTop: 100 * (progress <= 0.5
        ? progress * 2
        : (1 - progress) * 2),
    };
  });
  const scrollStates = samples.map(({ sequence, timeMs, scrollTop }) => ({
    sequence,
    changedAtMs: timeMs,
    requestedScrollTop: scrollTop,
    observedScrollTop: scrollTop,
  }));
  const paintState = (sequence, completedAtMs, scrollTop) => ({
    sequence,
    completedAtMs,
    revision: 'fixture-revision',
    scrollTop,
    scrollLeft: 0,
    viewport: { width: 100, height: 100 },
    surface: { x: 0, y: 0, width: 100, height: 100 },
    layers: [layer('background'), layer('content')],
  });
  const paintStates = samples.map(({ sequence, timeMs, scrollTop }) =>
    paintState(sequence, timeMs, scrollTop));
  return {
    schemaVersion: APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
    protocolId: 'bom-f3-fixed-scroll-pixel-correlation/v1',
    window: {
      id: traceEvidence.window.id,
      startMark: traceEvidence.window.startMark,
      endMark: traceEvidence.window.endMark,
      startTimeMs,
      endTimeMs,
      durationMs,
    },
    expectedRevision: 'fixture-revision',
    trajectory: {
      protocol: 'bom-f3-scroll-trajectory/v1',
      axis: 'vertical',
      waveform: 'triangle',
      direction: 'forward-then-reverse',
      easing: 'linear',
      driver: 'requestAnimationFrame',
      cycles: 1,
      durationMs: 30_000,
      minimumScrollTop: 0,
      maximumScrollTop: 100,
      finalObservedScrollTop: 0,
    },
    scrollStates,
    paintStates,
    completeness: {
      scrollStateCount: scrollStates.length,
      paintStateCount: paintStates.length,
      paintStatesInsideWindow: paintStates.length,
      readbackFailureCount: 0,
    },
  };
}
