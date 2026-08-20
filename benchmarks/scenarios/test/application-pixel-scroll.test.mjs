import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPLICATION_PIXEL_FRAME_CORRELATION_SCHEMA_VERSION,
  APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
  assessApplicationPixelFrameEvidence,
  correlateApplicationPixelFrames,
} from '../scripts/lib/application-pixel-scroll.mjs';

const WINDOW_ID = 'f3-10k-scroll-30s';
const START_MARK = `bom:f3:scroll:${WINDOW_ID}:start`;
const END_MARK = `bom:f3:scroll:${WINDOW_ID}:end`;
const REVISION = 'fixture:1.0.0:10006';

test('standalone assessment validates raw evidence without a trace', () => {
  const complete = assessApplicationPixelFrameEvidence(
    applicationEvidence(),
  );
  assert.equal(complete.valid, true);
  assert.equal(complete.windowId, WINDOW_ID);
  assert.equal(complete.scrollStateCount, 301);
  assert.equal(complete.paintStateCount, 301);
  assert.deepEqual(complete.blockers, []);

  const wrongMarker = applicationEvidence();
  wrongMarker.window = {
    ...wrongMarker.window,
    startMark: 'bom:f3:scroll:wrong:start',
  };
  const invalid = assessApplicationPixelFrameEvidence(wrongMarker);
  assert.equal(invalid.valid, false);
  assert.equal(
    invalid.blockers[0].code,
    'APPLICATION_PIXEL_WINDOW_IDENTITY_INVALID',
  );
  assert.equal(Object.isFrozen(invalid), true);
});

test('affine clock correlation qualifies complete nonblank application frames', () => {
  const result = correlateApplicationPixelFrames(
    traceEvidence(),
    applicationEvidence(),
  );

  assert.equal(
    result.schemaVersion,
    APPLICATION_PIXEL_FRAME_CORRELATION_SCHEMA_VERSION,
  );
  assert.equal(
    result.evidenceSchemaVersion,
    APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
  );
  assert.equal(result.status, 'passed');
  assert.equal(result.qualified, true);
  assert.equal(result.passed, true);
  assert.equal(result.blankFrameCount, 0);
  assert.equal(result.frameCount, 3);
  assert.deepEqual(
    result.frames.map((frame) => frame.pageTimeMs),
    [100, 15_100, 30_100],
  );
  assert.deepEqual(
    result.frames.map((frame) => frame.scrollStateSequence),
    [0, 150, 300],
  );
  assert.deepEqual(result.completeness, {
    presentedFrameCount: 3,
    mappedFrameCount: 3,
    unmappedFrameCount: 0,
    classifiedFrameCount: 3,
    revisionMatchedFrameCount: 3,
    scrollMatchedFrameCount: 3,
    surfaceCoveredFrameCount: 3,
    staleFrameCount: 0,
    geometryFailureFrameCount: 0,
    pixelFailureFrameCount: 0,
    blankFrameCount: 0,
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.frames), true);
  assert.equal(Object.isFrozen(result.frames[0].layers), true);
  assert.equal(Object.isFrozen(result.frames[0].reasons), true);
  assert.equal(result.frames[0].paintStateSequence, 0);
  assert.equal(result.frames[0].scrollMatched, true);
  assert.equal(result.frames[0].stale, false);
  assert.equal(
    result.frames[0].reasons.some(
      (reason) =>
        reason.code === 'APPLICATION_PIXEL_PAINT_PRECEDES_SCROLL_STATE',
    ),
    false,
  );
});

test('complete evidence counts stale, geometry, and pixel failures once per frame', () => {
  const evidence = applicationEvidence();
  evidence.paintStates[150] = {
    ...evidence.paintStates[150],
    completedAtMs: 15_099,
    scrollTop: 0,
  };
  evidence.paintStates[300] = {
    ...evidence.paintStates[300],
    surface: { x: 10, y: 0, width: 80, height: 100 },
    layers: [
      layer('background'),
      layer('content', { nonTransparentPixelCount: 0 }),
    ],
  };

  const result = correlateApplicationPixelFrames(traceEvidence(), evidence);

  assert.equal(result.status, 'failed');
  assert.equal(result.qualified, true);
  assert.equal(result.passed, false);
  assert.equal(result.blankFrameCount, 2);
  assert.equal(result.frames[1].stale, true);
  assert.ok(result.frames[1].reasons.some(
    (reason) =>
      reason.code === 'APPLICATION_PIXEL_PAINT_SCROLL_OFFSET_MISMATCH',
  ));
  assert.equal(result.frames[2].surfaceCovered, false);
  assert.ok(result.frames[2].reasons.some(
    (reason) => reason.code === 'APPLICATION_PIXEL_CONTENT_TRANSPARENT',
  ));
  assert.equal(result.completeness.staleFrameCount, 1);
  assert.equal(result.completeness.geometryFailureFrameCount, 1);
  assert.equal(result.completeness.pixelFailureFrameCount, 1);
  assert.deepEqual(result.blockers, []);
});

test('a presented frame without preceding application state is unqualified', () => {
  const evidence = applicationEvidence();
  evidence.scrollStates[0] = {
    ...evidence.scrollStates[0],
    changedAtMs: evidence.scrollStates[0].changedAtMs + 1,
  };
  evidence.paintStates[0] = {
    ...evidence.paintStates[0],
    completedAtMs: evidence.window.startTimeMs + 1,
  };
  refreshCompleteness(evidence);

  const result = correlateApplicationPixelFrames(traceEvidence(), evidence);

  assert.equal(result.status, 'unqualified');
  assert.equal(result.qualified, false);
  assert.equal(result.passed, null);
  assert.equal(result.blankFrameCount, null);
  assert.equal(result.completeness.unmappedFrameCount, 1);
  assert.equal(
    result.blockers[0].code,
    'APPLICATION_PIXEL_FRAME_MAPPING_INCOMPLETE',
  );
  assert.equal(result.frames[0].mapped, false);
  assert.deepEqual(
    result.frames[0].reasons.map((reason) => reason.code),
    [
      'APPLICATION_PIXEL_SCROLL_STATE_UNAVAILABLE_FOR_FRAME',
      'APPLICATION_PIXEL_PAINT_STATE_UNAVAILABLE_FOR_FRAME',
    ],
  );
});

test('marker identity and duration mismatches fail closed before frame mapping', () => {
  const wrongIdentity = applicationEvidence();
  wrongIdentity.window = { ...wrongIdentity.window, id: 'another-window' };
  const identityResult = correlateApplicationPixelFrames(
    traceEvidence(),
    wrongIdentity,
  );
  assertUnqualified(
    identityResult,
    'APPLICATION_PIXEL_WINDOW_IDENTITY_MISMATCH',
  );

  const wrongDuration = applicationEvidence();
  wrongDuration.window = {
    ...wrongDuration.window,
    endTimeMs: 30_105,
    durationMs: 30_005,
  };
  const durationResult = correlateApplicationPixelFrames(
    traceEvidence(),
    wrongDuration,
  );
  assertUnqualified(
    durationResult,
    'APPLICATION_PIXEL_WINDOW_DURATION_MISMATCH',
  );
});

test('state order, trace counts, finite values, and layer counts are strict', () => {
  const unordered = applicationEvidence();
  unordered.paintStates[1] = {
    ...unordered.paintStates[1],
    sequence: unordered.paintStates[0].sequence,
  };
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), unordered),
    'APPLICATION_PIXEL_PAINT_STATE_ORDER_INVALID',
  );

  const wrongCount = traceEvidence();
  wrongCount.presentedFrames.count += 1;
  assertUnqualified(
    correlateApplicationPixelFrames(wrongCount, applicationEvidence()),
    'APPLICATION_PIXEL_TRACE_FRAME_COUNT_MISMATCH',
  );

  const nonFinite = applicationEvidence();
  nonFinite.scrollStates[1] = {
    ...nonFinite.scrollStates[1],
    observedScrollTop: Number.NaN,
  };
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), nonFinite),
    'APPLICATION_PIXEL_SCROLL_STATE_INVALID',
  );

  const impossibleLayerCount = applicationEvidence();
  impossibleLayerCount.paintStates[1] = {
    ...impossibleLayerCount.paintStates[1],
    layers: [
      layer('background'),
      layer('content', {
        sampledPixelCount: 4,
        nonTransparentPixelCount: 5,
      }),
    ],
  };
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), impossibleLayerCount),
    'APPLICATION_PIXEL_LAYER_COUNT_MISMATCH',
  );
});

test('application protocol and every fixed trajectory field are strict', () => {
  const wrongProtocol = applicationEvidence();
  wrongProtocol.protocolId = 'bom-f3-fixed-scroll-pixel-correlation/v999';
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), wrongProtocol),
    'APPLICATION_PIXEL_PROTOCOL_UNSUPPORTED',
  );

  const invalidFields = [
    ['protocol', 'bom-f3-scroll-trajectory/v999'],
    ['axis', 'horizontal'],
    ['waveform', 'sawtooth'],
    ['direction', 'forward'],
    ['easing', 'ease-in-out'],
    ['driver', 'setInterval'],
    ['cycles', 2],
    ['durationMs', 29_999],
    ['minimumScrollTop', 1],
    ['maximumScrollTop', 0],
    ['finalObservedScrollTop', 101],
  ];
  for (const [field, value] of invalidFields) {
    const evidence = applicationEvidence();
    evidence.trajectory = { ...evidence.trajectory, [field]: value };
    assertUnqualified(
      correlateApplicationPixelFrames(traceEvidence(), evidence),
      'APPLICATION_PIXEL_TRAJECTORY_INVALID',
    );
  }

  const missingTrajectory = applicationEvidence();
  missingTrajectory.trajectory = null;
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), missingTrajectory),
    'APPLICATION_PIXEL_TRAJECTORY_INVALID',
  );
});

test('completeness counts and failed readback pixel counts are self-consistent', () => {
  for (const field of [
    'scrollStateCount',
    'paintStateCount',
    'paintStatesInsideWindow',
    'readbackFailureCount',
  ]) {
    const evidence = applicationEvidence();
    evidence.completeness = {
      ...evidence.completeness,
      [field]: evidence.completeness[field] + 1,
    };
    assertUnqualified(
      correlateApplicationPixelFrames(traceEvidence(), evidence),
      'APPLICATION_PIXEL_COMPLETENESS_MISMATCH',
    );
  }

  const missingCompleteness = applicationEvidence();
  missingCompleteness.completeness = null;
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), missingCompleteness),
    'APPLICATION_PIXEL_COMPLETENESS_INVALID',
  );

  const failedReadback = applicationEvidence();
  failedReadback.paintStates[150] = {
    ...failedReadback.paintStates[150],
    layers: [
      layer('background'),
      layer('content', {
        readbackSucceeded: false,
        sampledPixelCount: 0,
        nonTransparentPixelCount: 0,
        rgbaChecksum: null,
      }),
    ],
  };
  refreshCompleteness(failedReadback);
  const failedResult = correlateApplicationPixelFrames(
    traceEvidence(),
    failedReadback,
  );
  assert.equal(failedResult.qualified, true);
  assert.equal(failedResult.blankFrameCount, 1);
  assert.ok(failedResult.frames[1].reasons.some(
    (reason) => reason.code === 'APPLICATION_PIXEL_CONTENT_READBACK_FAILED',
  ));

  const impossibleReadback = applicationEvidence();
  impossibleReadback.paintStates[150] = {
    ...impossibleReadback.paintStates[150],
    layers: [
      layer('background'),
      layer('content', {
        readbackSucceeded: false,
        rgbaChecksum: null,
      }),
    ],
  };
  refreshCompleteness(impossibleReadback);
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), impossibleReadback),
    'APPLICATION_PIXEL_LAYER_COUNT_MISMATCH',
  );
});

test('layer checksums and fixed sample counts match the producer contract', () => {
  for (const rgbaChecksum of [null, '1234ABCD', '1234abc', '1234abcde']) {
    const evidence = applicationEvidence();
    evidence.paintStates[150] = {
      ...evidence.paintStates[150],
      layers: [
        layer('background'),
        layer('content', { rgbaChecksum }),
      ],
    };
    assertUnqualified(
      correlateApplicationPixelFrames(traceEvidence(), evidence),
      'APPLICATION_PIXEL_LAYER_CHECKSUM_INVALID',
    );
  }

  const failedWithChecksum = applicationEvidence();
  failedWithChecksum.paintStates[150] = {
    ...failedWithChecksum.paintStates[150],
    layers: [
      layer('background'),
      layer('content', {
        readbackSucceeded: false,
        sampledPixelCount: 0,
        nonTransparentPixelCount: 0,
      }),
    ],
  };
  refreshCompleteness(failedWithChecksum);
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), failedWithChecksum),
    'APPLICATION_PIXEL_LAYER_CHECKSUM_INVALID',
  );

  const wrongSampleSize = applicationEvidence();
  wrongSampleSize.paintStates[150] = {
    ...wrongSampleSize.paintStates[150],
    layers: [
      layer('background'),
      layer('content', {
        sampledPixelCount: 2_047,
        nonTransparentPixelCount: 1_000,
      }),
    ],
  };
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), wrongSampleSize),
    'APPLICATION_PIXEL_LAYER_COUNT_MISMATCH',
  );
});

test('static and incomplete trajectories cannot masquerade as fixed scrolling', () => {
  const staticEvidence = applicationEvidence();
  staticEvidence.scrollStates = [scrollState(0, 100, 0)];
  staticEvidence.paintStates = [paintState(0, 100, 0)];
  refreshCompleteness(staticEvidence);
  assertTrajectoryCoverageRejected(staticEvidence);

  const noReverse = applicationEvidence();
  noReverse.scrollStates = [
    scrollState(0, 100, 0),
    scrollState(1, 15_100, 50),
    scrollState(2, 30_100, 100),
  ];
  noReverse.trajectory = {
    ...noReverse.trajectory,
    finalObservedScrollTop: 100,
  };
  assertTrajectoryCoverageRejected(noReverse);

  const peakTooLow = applicationEvidence();
  peakTooLow.scrollStates = [
    scrollState(0, 100, 0),
    scrollState(1, 15_100, 80),
    scrollState(2, 30_100, 0),
  ];
  assertTrajectoryCoverageRejected(peakTooLow);

  const didNotReturn = applicationEvidence();
  didNotReturn.scrollStates = [
    scrollState(0, 100, 0),
    scrollState(1, 15_100, 100),
    scrollState(2, 30_100, 50),
  ];
  didNotReturn.trajectory = {
    ...didNotReturn.trajectory,
    finalObservedScrollTop: 50,
  };
  assertTrajectoryCoverageRejected(didNotReturn);

  const sparseRaf = applicationEvidence();
  sparseRaf.scrollStates = [
    scrollState(0, 100, 0),
    scrollState(1, 15_100, 100),
    scrollState(2, 30_100, 0),
  ];
  assertTrajectoryCoverageRejected(sparseRaf);

  const nonlinear = applicationEvidence();
  nonlinear.scrollStates = nonlinear.scrollStates.map((state) => {
    const progress =
      (state.changedAtMs - nonlinear.window.startTimeMs) /
      nonlinear.trajectory.durationMs;
    const triangle = progress <= 0.5
      ? Math.pow(progress * 2, 2)
      : Math.pow((1 - progress) * 2, 2);
    return scrollState(
      state.sequence,
      state.changedAtMs,
      nonlinear.trajectory.maximumScrollTop * triangle,
    );
  });
  assertTrajectoryCoverageRejected(nonlinear);

  const observedMismatch = applicationEvidence();
  observedMismatch.scrollStates[75] = {
    ...observedMismatch.scrollStates[75],
    observedScrollTop:
      observedMismatch.scrollStates[75].requestedScrollTop + 1,
  };
  assertTrajectoryCoverageRejected(observedMismatch);
});

test('scroll and paint states must cover both ends of the marker window', () => {
  const shortScrollCoverage = applicationEvidence();
  shortScrollCoverage.scrollStates = shortScrollCoverage.scrollStates.filter(
    (state) => state.changedAtMs <= 29_000,
  );
  assertTrajectoryCoverageRejected(shortScrollCoverage);

  const shortPaintCoverage = applicationEvidence();
  shortPaintCoverage.paintStates = shortPaintCoverage.paintStates.filter(
    (state) => state.completedAtMs <= 29_000,
  );
  refreshCompleteness(shortPaintCoverage);
  assertTrajectoryCoverageRejected(shortPaintCoverage);

  const horizontalPaint = applicationEvidence();
  horizontalPaint.paintStates[150] = {
    ...horizontalPaint.paintStates[150],
    scrollLeft: 10,
  };
  assertTrajectoryCoverageRejected(horizontalPaint);
});

function traceEvidence() {
  return {
    schemaVersion: 'bom-f3-compositor-presented-frame-evidence/v1',
    extractor: {
      id: 'bom-f3-chromium-compositor-presented-frame/v1',
      profileId: 'chromium-150-display-frame/v1',
      certified: true,
    },
    window: {
      id: WINDOW_ID,
      startMark: START_MARK,
      endMark: END_MARK,
      startTimestampUs: 1_000_000,
      endTimestampUs: 31_000_000,
      durationUs: 30_000_000,
    },
    presentedFrames: {
      authoritativeEvent: 'Display::FrameDisplayed',
      count: 3,
      timestampsUs: [1_000_000, 16_000_000, 31_000_000],
    },
  };
}

function applicationEvidence() {
  const scrollStates = [];
  const paintStates = [paintState(0, 90, 0)];
  for (let sequence = 0; sequence <= 300; sequence += 1) {
    const progress = sequence / 300;
    const triangle = progress <= 0.5
      ? progress * 2
      : (1 - progress) * 2;
    const scrollTop = 100 * triangle;
    const timestampMs = 100 + sequence * 100;
    scrollStates.push(scrollState(sequence, timestampMs, scrollTop));
    if (sequence > 0) {
      paintStates.push(paintState(sequence, timestampMs, scrollTop));
    }
  }
  const evidence = {
    schemaVersion: APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
    protocolId: 'bom-f3-fixed-scroll-pixel-correlation/v1',
    window: {
      id: WINDOW_ID,
      startMark: START_MARK,
      endMark: END_MARK,
      startTimeMs: 100,
      endTimeMs: 30_100,
      durationMs: 30_000,
    },
    expectedRevision: REVISION,
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
  };
  return refreshCompleteness(evidence);
}

function scrollState(sequence, changedAtMs, scrollTop) {
  return {
    sequence,
    changedAtMs,
    requestedScrollTop: scrollTop,
    observedScrollTop: scrollTop,
  };
}

function paintState(sequence, completedAtMs, scrollTop) {
  return {
    sequence,
    completedAtMs,
    revision: REVISION,
    scrollTop,
    scrollLeft: 0,
    viewport: { width: 100, height: 100 },
    surface: { x: -10, y: -10, width: 120, height: 120 },
    layers: [layer('background'), layer('content')],
  };
}

function layer(name, overrides = {}) {
  return {
    layer: name,
    readbackSucceeded: true,
    sampledPixelCount: 2_048,
    nonTransparentPixelCount: 1_024,
    rgbaChecksum: '1234abcd',
    ...overrides,
  };
}

function refreshCompleteness(evidence) {
  evidence.completeness = {
    scrollStateCount: evidence.scrollStates.length,
    paintStateCount: evidence.paintStates.length,
    paintStatesInsideWindow: evidence.paintStates.filter(
      (paint) =>
        paint.completedAtMs >= evidence.window.startTimeMs &&
        paint.completedAtMs <= evidence.window.endTimeMs,
    ).length,
    readbackFailureCount: evidence.paintStates.reduce(
      (count, paint) =>
        count +
        paint.layers.filter((entry) => !entry.readbackSucceeded).length,
      0,
    ),
  };
  return evidence;
}

function assertTrajectoryCoverageRejected(evidence) {
  refreshCompleteness(evidence);
  assertUnqualified(
    correlateApplicationPixelFrames(traceEvidence(), evidence),
    'APPLICATION_PIXEL_TRAJECTORY_COVERAGE_INCOMPLETE',
  );
}

function assertUnqualified(result, code) {
  assert.equal(result.status, 'unqualified');
  assert.equal(result.qualified, false);
  assert.equal(result.passed, null);
  assert.equal(result.blankFrameCount, null);
  assert.equal(result.blockers.length, 1);
  assert.equal(result.blockers[0].code, code);
  assert.equal(Object.isFrozen(result.blockers[0]), true);
}
