export const APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION =
  'bom-f3-application-pixel-frame-evidence/v1';
export const APPLICATION_PIXEL_FRAME_CORRELATION_SCHEMA_VERSION =
  'bom-f3-application-pixel-frame-correlation/v1';

const TRACE_EVIDENCE_SCHEMA_VERSION =
  'bom-f3-compositor-presented-frame-evidence/v1';
const AUTHORITATIVE_FRAME_EVENT = 'Display::FrameDisplayed';
const APPLICATION_PIXEL_PROTOCOL_ID =
  'bom-f3-fixed-scroll-pixel-correlation/v1';
const SCROLL_TRAJECTORY_PROTOCOL_ID = 'bom-f3-scroll-trajectory/v1';
const SCROLL_TRAJECTORY_DURATION_MS = 30_000;
const F3_SCROLL_WINDOW_ID = 'f3-10k-scroll-30s';
const F3_SCROLL_WINDOW_START_MARK =
  'bom:f3:scroll:f3-10k-scroll-30s:start';
const F3_SCROLL_WINDOW_END_MARK =
  'bom:f3:scroll:f3-10k-scroll-30s:end';
const F3_SCROLL_WINDOW_MAXIMUM_DURATION_MS = 30_033.334;
const TRAJECTORY_ENDPOINT_TOLERANCE_RATIO = 0.01;
const TRAJECTORY_LINEAR_OFFSET_TOLERANCE_RATIO = 0.005;
const TRAJECTORY_MAX_SAMPLE_GAP_RATIO = 0.01;
const TRAJECTORY_WINDOW_COVERAGE_TOLERANCE_RATIO = 0.01;
const APPLICATION_PIXEL_SAMPLE_PIXEL_COUNT = 64 * 32;
const REQUIRED_LAYERS = Object.freeze(['background', 'content']);
const DEFAULT_OPTIONS = Object.freeze({
  scrollOffsetTolerancePx: 0.5,
  surfaceCoverageTolerancePx: 0.5,
  windowDurationToleranceMs: 1,
});
const TIME_EPSILON_MS = 1e-6;

export function assessApplicationPixelFrameEvidence(
  applicationEvidence,
  options = {},
) {
  let resolvedOptions = DEFAULT_OPTIONS;
  try {
    resolvedOptions = resolveOptions(options);
    const evidence = validateApplicationEvidence(
      applicationEvidence,
      resolvedOptions,
    );
    validateStandaloneApplicationWindow(evidence.window);
    return deepFreeze({
      valid: true,
      evidenceSchemaVersion:
        APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
      protocolId: APPLICATION_PIXEL_PROTOCOL_ID,
      windowId: evidence.window.id,
      expectedRevision: evidence.expectedRevision,
      scrollStateCount: evidence.scrollStates.length,
      paintStateCount: evidence.paintStates.length,
      options: resolvedOptions,
      blockers: [],
    });
  } catch (error) {
    const failure = normalizeValidationFailure(
      error,
      'APPLICATION_PIXEL_EVIDENCE_ASSESSMENT_INTERNAL_ERROR',
      'Application pixel evidence could not be assessed.',
    );
    return deepFreeze({
      valid: false,
      evidenceSchemaVersion:
        APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
      protocolId: APPLICATION_PIXEL_PROTOCOL_ID,
      windowId: null,
      expectedRevision: null,
      scrollStateCount: 0,
      paintStateCount: 0,
      options: resolvedOptions,
      blockers: [blocker(failure.code, failure.message, failure.path)],
    });
  }
}

/**
 * Correlates certified compositor frames with independently sampled Canvas
 * paint states. Evidence completeness is distinct from a complete, failing
 * blank-frame result.
 */
export function correlateApplicationPixelFrames(
  traceEvidence,
  applicationEvidence,
  options = {},
) {
  let resolvedOptions = DEFAULT_OPTIONS;
  try {
    resolvedOptions = resolveOptions(options);
    const trace = validateTraceEvidence(traceEvidence);
    const application = validateApplicationEvidence(
      applicationEvidence,
      resolvedOptions,
    );
    const window = correlateWindows(trace.window, application.window, resolvedOptions);
    const clockMapping = createClockMapping(window);
    const frames = correlateFrames({
      trace,
      application,
      clockMapping,
      options: resolvedOptions,
    });
    const unmappedFrameCount = frames.reduce(
      (count, frame) => count + (frame.mapped ? 0 : 1),
      0,
    );
    if (unmappedFrameCount > 0) {
      return freezeResult({
        status: 'unqualified',
        qualified: false,
        passed: null,
        blankFrameCount: null,
        expectedRevision: application.expectedRevision,
        frameCount: trace.timestampsUs.length,
        window,
        clockMapping,
        options: resolvedOptions,
        completeness: summarizeCompleteness(frames, null),
        frames,
        blockers: [blocker(
          'APPLICATION_PIXEL_FRAME_MAPPING_INCOMPLETE',
          'At least one presented frame has no preceding scroll state or complete paint state.',
          'presentedFrames',
        )],
      });
    }

    const blankFrameCount = frames.reduce(
      (count, frame) => count + (frame.failed ? 1 : 0),
      0,
    );
    return freezeResult({
      status: blankFrameCount === 0 ? 'passed' : 'failed',
      qualified: true,
      passed: blankFrameCount === 0,
      blankFrameCount,
      expectedRevision: application.expectedRevision,
      frameCount: trace.timestampsUs.length,
      window,
      clockMapping,
      options: resolvedOptions,
      completeness: summarizeCompleteness(frames, blankFrameCount),
      frames,
      blockers: [],
    });
  } catch (error) {
    const failure = normalizeValidationFailure(
      error,
      'APPLICATION_PIXEL_REDUCER_INTERNAL_ERROR',
      'Application pixel evidence could not be reduced.',
    );
    return freezeResult({
      status: 'unqualified',
      qualified: false,
      passed: null,
      blankFrameCount: null,
      expectedRevision: null,
      frameCount: 0,
      window: null,
      clockMapping: null,
      options: resolvedOptions,
      completeness: emptyCompleteness(),
      frames: [],
      blockers: [blocker(failure.code, failure.message, failure.path)],
    });
  }
}

function validateStandaloneApplicationWindow(window) {
  if (
    window.id !== F3_SCROLL_WINDOW_ID ||
    window.startMark !== F3_SCROLL_WINDOW_START_MARK ||
    window.endMark !== F3_SCROLL_WINDOW_END_MARK
  ) {
    reject(
      'APPLICATION_PIXEL_WINDOW_IDENTITY_INVALID',
      'Raw application evidence must use the fixed F3 marker identity.',
      'applicationEvidence.window',
    );
  }
  if (window.durationMs > F3_SCROLL_WINDOW_MAXIMUM_DURATION_MS) {
    reject(
      'APPLICATION_PIXEL_WINDOW_DURATION_INVALID',
      'Raw application evidence exceeds the fixed F3 marker-window tolerance.',
      'applicationEvidence.window.durationMs',
    );
  }
}

function validateTraceEvidence(input) {
  const evidence = record(
    input,
    'APPLICATION_PIXEL_TRACE_EVIDENCE_INVALID',
    'Trace evidence must be an object.',
    'traceEvidence',
  );
  if (evidence.schemaVersion !== TRACE_EVIDENCE_SCHEMA_VERSION) {
    reject(
      'APPLICATION_PIXEL_TRACE_SCHEMA_UNSUPPORTED',
      'Trace evidence must use the certified compositor evidence schema.',
      'traceEvidence.schemaVersion',
    );
  }
  if (evidence.extractor?.certified !== true) {
    reject(
      'APPLICATION_PIXEL_TRACE_NOT_CERTIFIED',
      'Trace evidence must come from a certified extractor.',
      'traceEvidence.extractor.certified',
    );
  }
  const window = validateTraceWindow(evidence.window);
  const presented = record(
    evidence.presentedFrames,
    'APPLICATION_PIXEL_TRACE_FRAMES_INVALID',
    'Presented-frame evidence must be an object.',
    'traceEvidence.presentedFrames',
  );
  if (presented.authoritativeEvent !== AUTHORITATIVE_FRAME_EVENT) {
    reject(
      'APPLICATION_PIXEL_TRACE_SOURCE_INVALID',
      'Only Display::FrameDisplayed timestamps are authoritative.',
      'traceEvidence.presentedFrames.authoritativeEvent',
    );
  }
  const count = nonNegativeSafeInteger(
    presented.count,
    'APPLICATION_PIXEL_TRACE_FRAME_COUNT_INVALID',
    'Presented-frame count must be a non-negative safe integer.',
    'traceEvidence.presentedFrames.count',
  );
  if (!Array.isArray(presented.timestampsUs) || presented.timestampsUs.length === 0) {
    reject(
      'APPLICATION_PIXEL_TRACE_TIMESTAMPS_INVALID',
      'At least one presented-frame timestamp is required.',
      'traceEvidence.presentedFrames.timestampsUs',
    );
  }
  if (presented.timestampsUs.length !== count) {
    reject(
      'APPLICATION_PIXEL_TRACE_FRAME_COUNT_MISMATCH',
      'Presented-frame count must equal the timestamp count.',
      'traceEvidence.presentedFrames.count',
    );
  }
  const timestampsUs = presented.timestampsUs.map((value, index) =>
    nonNegativeSafeInteger(
      value,
      'APPLICATION_PIXEL_TRACE_TIMESTAMP_INVALID',
      'Presented-frame timestamps must be non-negative safe integers.',
      `traceEvidence.presentedFrames.timestampsUs[${index}]`,
    ));
  validateStrictOrder(
    timestampsUs,
    'APPLICATION_PIXEL_TRACE_TIMESTAMP_ORDER_INVALID',
    'Presented-frame timestamps must be strictly increasing.',
    'traceEvidence.presentedFrames.timestampsUs',
  );
  if (
    timestampsUs.some(
      (timestampUs) =>
        timestampUs < window.startTimestampUs ||
        timestampUs > window.endTimestampUs,
    )
  ) {
    reject(
      'APPLICATION_PIXEL_TRACE_FRAME_OUTSIDE_WINDOW',
      'Every presented frame must be inside the closed trace marker window.',
      'traceEvidence.presentedFrames.timestampsUs',
    );
  }
  return Object.freeze({ window, timestampsUs: Object.freeze(timestampsUs) });
}

function validateTraceWindow(input) {
  const window = record(
    input,
    'APPLICATION_PIXEL_TRACE_WINDOW_INVALID',
    'Trace marker window must be an object.',
    'traceEvidence.window',
  );
  const startTimestampUs = nonNegativeSafeInteger(
    window.startTimestampUs,
    'APPLICATION_PIXEL_TRACE_WINDOW_INVALID',
    'Trace startTimestampUs must be a non-negative safe integer.',
    'traceEvidence.window.startTimestampUs',
  );
  const endTimestampUs = nonNegativeSafeInteger(
    window.endTimestampUs,
    'APPLICATION_PIXEL_TRACE_WINDOW_INVALID',
    'Trace endTimestampUs must be a non-negative safe integer.',
    'traceEvidence.window.endTimestampUs',
  );
  const durationUs = positiveSafeInteger(
    window.durationUs,
    'APPLICATION_PIXEL_TRACE_WINDOW_INVALID',
    'Trace durationUs must be a positive safe integer.',
    'traceEvidence.window.durationUs',
  );
  if (
    endTimestampUs <= startTimestampUs ||
    endTimestampUs - startTimestampUs !== durationUs
  ) {
    reject(
      'APPLICATION_PIXEL_TRACE_WINDOW_DURATION_INVALID',
      'Trace duration must exactly equal its marker timestamp difference.',
      'traceEvidence.window.durationUs',
    );
  }
  return Object.freeze({
    id: nonEmptyString(window.id, 'traceEvidence.window.id'),
    startMark: nonEmptyString(window.startMark, 'traceEvidence.window.startMark'),
    endMark: nonEmptyString(window.endMark, 'traceEvidence.window.endMark'),
    startTimestampUs,
    endTimestampUs,
    durationUs,
  });
}

function validateApplicationEvidence(input, options) {
  const evidence = record(
    input,
    'APPLICATION_PIXEL_EVIDENCE_INVALID',
    'Application pixel evidence must be an object.',
    'applicationEvidence',
  );
  if (evidence.schemaVersion !== APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION) {
    reject(
      'APPLICATION_PIXEL_EVIDENCE_SCHEMA_UNSUPPORTED',
      'Application pixel evidence schemaVersion is unsupported.',
      'applicationEvidence.schemaVersion',
    );
  }
  if (evidence.protocolId !== APPLICATION_PIXEL_PROTOCOL_ID) {
    reject(
      'APPLICATION_PIXEL_PROTOCOL_UNSUPPORTED',
      'Application pixel evidence protocolId is unsupported.',
      'applicationEvidence.protocolId',
    );
  }
  const window = validateApplicationWindow(evidence.window);
  const expectedRevision = nonEmptyString(
    evidence.expectedRevision,
    'applicationEvidence.expectedRevision',
  );
  const trajectory = validateTrajectory(evidence.trajectory, window, options);
  const scrollStates = validateScrollStates(evidence.scrollStates);
  const paintStates = validatePaintStates(evidence.paintStates);
  const completeness = validateApplicationCompleteness(
    evidence.completeness,
    window,
    scrollStates,
    paintStates,
  );
  validateTrajectoryCoverage({
    window,
    trajectory,
    scrollStates,
    paintStates,
    options,
  });
  return Object.freeze({
    window,
    expectedRevision,
    trajectory,
    scrollStates,
    paintStates,
    completeness,
  });
}

function validateApplicationWindow(input) {
  const window = record(
    input,
    'APPLICATION_PIXEL_WINDOW_INVALID',
    'Application marker window must be an object.',
    'applicationEvidence.window',
  );
  const startTimeMs = nonNegativeFinite(
    window.startTimeMs,
    'APPLICATION_PIXEL_WINDOW_INVALID',
    'Application startTimeMs must be finite and non-negative.',
    'applicationEvidence.window.startTimeMs',
  );
  const endTimeMs = nonNegativeFinite(
    window.endTimeMs,
    'APPLICATION_PIXEL_WINDOW_INVALID',
    'Application endTimeMs must be finite and non-negative.',
    'applicationEvidence.window.endTimeMs',
  );
  const durationMs = positiveFinite(
    window.durationMs,
    'APPLICATION_PIXEL_WINDOW_INVALID',
    'Application durationMs must be finite and positive.',
    'applicationEvidence.window.durationMs',
  );
  if (
    endTimeMs <= startTimeMs ||
    Math.abs(endTimeMs - startTimeMs - durationMs) > TIME_EPSILON_MS
  ) {
    reject(
      'APPLICATION_PIXEL_WINDOW_DURATION_INVALID',
      'Application duration must equal its marker timestamp difference.',
      'applicationEvidence.window.durationMs',
    );
  }
  return Object.freeze({
    id: nonEmptyString(window.id, 'applicationEvidence.window.id'),
    startMark: nonEmptyString(window.startMark, 'applicationEvidence.window.startMark'),
    endMark: nonEmptyString(window.endMark, 'applicationEvidence.window.endMark'),
    startTimeMs,
    endTimeMs,
    durationMs,
  });
}

function validateTrajectory(input, window, options) {
  const path = 'applicationEvidence.trajectory';
  const trajectory = record(
    input,
    'APPLICATION_PIXEL_TRAJECTORY_INVALID',
    'Application scroll trajectory must be an object.',
    path,
  );
  const lockedFields = Object.freeze({
    protocol: SCROLL_TRAJECTORY_PROTOCOL_ID,
    axis: 'vertical',
    waveform: 'triangle',
    direction: 'forward-then-reverse',
    easing: 'linear',
    driver: 'requestAnimationFrame',
    cycles: 1,
    durationMs: SCROLL_TRAJECTORY_DURATION_MS,
    minimumScrollTop: 0,
  });
  for (const [field, expected] of Object.entries(lockedFields)) {
    if (trajectory[field] !== expected) {
      reject(
        'APPLICATION_PIXEL_TRAJECTORY_INVALID',
        'Application scroll trajectory does not match the fixed F3 protocol.',
        path + '.' + field,
      );
    }
  }
  const maximumScrollTop = positiveFinite(
    trajectory.maximumScrollTop,
    'APPLICATION_PIXEL_TRAJECTORY_INVALID',
    'Trajectory maximumScrollTop must be finite and positive.',
    path + '.maximumScrollTop',
  );
  const finalObservedScrollTop = nonNegativeFinite(
    trajectory.finalObservedScrollTop,
    'APPLICATION_PIXEL_TRAJECTORY_INVALID',
    'Trajectory finalObservedScrollTop must be finite and non-negative.',
    path + '.finalObservedScrollTop',
  );
  if (
    finalObservedScrollTop >
      maximumScrollTop + options.scrollOffsetTolerancePx
  ) {
    reject(
      'APPLICATION_PIXEL_TRAJECTORY_INVALID',
      'Trajectory finalObservedScrollTop exceeds the locked scroll range.',
      path + '.finalObservedScrollTop',
    );
  }
  if (
    SCROLL_TRAJECTORY_DURATION_MS >
      window.durationMs + TIME_EPSILON_MS
  ) {
    reject(
      'APPLICATION_PIXEL_TRAJECTORY_WINDOW_INVALID',
      'Application marker window is shorter than the fixed trajectory.',
      'applicationEvidence.window.durationMs',
    );
  }
  return Object.freeze({
    ...lockedFields,
    maximumScrollTop,
    finalObservedScrollTop,
  });
}

function validateTrajectoryCoverage({
  window,
  trajectory,
  scrollStates,
  paintStates,
  options,
}) {
  const code = 'APPLICATION_PIXEL_TRAJECTORY_COVERAGE_INCOMPLETE';
  const message =
    'Application states do not cover the fixed forward-and-reverse trajectory.';
  if (scrollStates.length < 3) {
    reject(code, message, 'applicationEvidence.scrollStates');
  }
  const timeToleranceMs =
    trajectory.durationMs * TRAJECTORY_WINDOW_COVERAGE_TOLERANCE_RATIO;
  const maximumSampleGapMs =
    trajectory.durationMs * TRAJECTORY_MAX_SAMPLE_GAP_RATIO;
  if (
    scrollStates.some(
      (state) =>
        state.changedAtMs < window.startTimeMs - TIME_EPSILON_MS ||
        state.changedAtMs > window.endTimeMs + TIME_EPSILON_MS,
    )
  ) {
    reject(code, message, 'applicationEvidence.scrollStates');
  }
  const firstScroll = scrollStates[0];
  const lastScroll = scrollStates[scrollStates.length - 1];
  if (
    firstScroll.changedAtMs - window.startTimeMs > timeToleranceMs ||
    window.endTimeMs - lastScroll.changedAtMs > timeToleranceMs
  ) {
    reject(code, message, 'applicationEvidence.scrollStates');
  }
  validateMaximumTimestampGap(
    scrollStates,
    'changedAtMs',
    maximumSampleGapMs,
    'applicationEvidence.scrollStates',
  );

  validateTriangleSeries(
    scrollStates,
    'requestedScrollTop',
    window,
    trajectory,
    options,
    'applicationEvidence.scrollStates',
  );
  validateTriangleSeries(
    scrollStates,
    'observedScrollTop',
    window,
    trajectory,
    options,
    'applicationEvidence.scrollStates',
  );
  for (let index = 0; index < scrollStates.length; index += 1) {
    if (
      !withinTolerance(
        scrollStates[index].requestedScrollTop,
        scrollStates[index].observedScrollTop,
        options.scrollOffsetTolerancePx,
      )
    ) {
      reject(
        code,
        message,
        'applicationEvidence.scrollStates[' +
          String(index) +
          '].observedScrollTop',
      );
    }
  }
  if (
    !withinTolerance(
      trajectory.finalObservedScrollTop,
      lastScroll.observedScrollTop,
      options.scrollOffsetTolerancePx,
    )
  ) {
    reject(
      code,
      message,
      'applicationEvidence.trajectory.finalObservedScrollTop',
    );
  }

  if (
    paintStates.some(
      (state) => state.completedAtMs > window.endTimeMs + TIME_EPSILON_MS,
    )
  ) {
    reject(code, message, 'applicationEvidence.paintStates');
  }
  if (
    paintStates.some(
      (state) => state.scrollLeft > options.scrollOffsetTolerancePx,
    )
  ) {
    reject(code, message, 'applicationEvidence.paintStates');
  }
  const inWindowPaintStates = paintStates.filter(
    (state) =>
      state.completedAtMs >= window.startTimeMs &&
      state.completedAtMs <= window.endTimeMs,
  );
  if (inWindowPaintStates.length < 3) {
    reject(code, message, 'applicationEvidence.paintStates');
  }
  validateMaximumTimestampGap(
    inWindowPaintStates,
    'completedAtMs',
    maximumSampleGapMs,
    'applicationEvidence.paintStates',
  );
  const firstPaint = inWindowPaintStates[0];
  const lastPaint = inWindowPaintStates[inWindowPaintStates.length - 1];
  if (
    firstPaint.completedAtMs - window.startTimeMs > timeToleranceMs ||
    window.endTimeMs - lastPaint.completedAtMs > timeToleranceMs
  ) {
    reject(code, message, 'applicationEvidence.paintStates');
  }
}

function validateTriangleSeries(
  states,
  field,
  window,
  trajectory,
  options,
  path,
) {
  const code = 'APPLICATION_PIXEL_TRAJECTORY_COVERAGE_INCOMPLETE';
  const message =
    'Application states do not cover the fixed forward-and-reverse trajectory.';
  const values = states.map((state) => state[field]);
  const maximum = trajectory.maximumScrollTop;
  if (
    values.some(
      (value) =>
        value < trajectory.minimumScrollTop ||
        value > maximum + options.scrollOffsetTolerancePx,
    )
  ) {
    reject(code, message, path);
  }
  const peakValue = Math.max(...values);
  const peakIndex = values.indexOf(peakValue);
  const peakTolerance =
    maximum * TRAJECTORY_ENDPOINT_TOLERANCE_RATIO +
    options.scrollOffsetTolerancePx;
  const returnTolerance = peakTolerance;
  if (
    values[0] > options.scrollOffsetTolerancePx ||
    peakValue < maximum - peakTolerance ||
    peakIndex === 0 ||
    peakIndex === values.length - 1 ||
    values[values.length - 1] > returnTolerance
  ) {
    reject(code, message, path);
  }

  let movedForward = false;
  for (let index = 1; index <= peakIndex; index += 1) {
    if (values[index] < values[index - 1] - options.scrollOffsetTolerancePx) {
      reject(code, message, path + '[' + String(index) + '].' + field);
    }
    if (values[index] > values[index - 1] + options.scrollOffsetTolerancePx) {
      movedForward = true;
    }
  }
  let movedBackward = false;
  for (let index = peakIndex + 1; index < values.length; index += 1) {
    if (values[index] > values[index - 1] + options.scrollOffsetTolerancePx) {
      reject(code, message, path + '[' + String(index) + '].' + field);
    }
    if (values[index] < values[index - 1] - options.scrollOffsetTolerancePx) {
      movedBackward = true;
    }
  }
  if (!movedForward || !movedBackward) {
    reject(code, message, path);
  }
  if (field === 'requestedScrollTop') {
    const linearTolerance =
      maximum * TRAJECTORY_LINEAR_OFFSET_TOLERANCE_RATIO +
      options.scrollOffsetTolerancePx;
    for (let index = 0; index < states.length; index += 1) {
      const elapsedMs = Math.min(
        trajectory.durationMs,
        Math.max(0, states[index].changedAtMs - window.startTimeMs),
      );
      const progress = elapsedMs / trajectory.durationMs;
      const triangle = progress <= 0.5
        ? progress * 2
        : (1 - progress) * 2;
      const expectedScrollTop = maximum * triangle;
      if (
        !withinTolerance(values[index], expectedScrollTop, linearTolerance)
      ) {
        reject(
          code,
          message,
          path + '[' + String(index) + '].requestedScrollTop',
        );
      }
    }
  }
}

function validateMaximumTimestampGap(states, field, maximumGap, path) {
  for (let index = 1; index < states.length; index += 1) {
    if (states[index][field] - states[index - 1][field] > maximumGap) {
      reject(
        'APPLICATION_PIXEL_TRAJECTORY_COVERAGE_INCOMPLETE',
        'Application states do not cover the fixed forward-and-reverse trajectory.',
        path + '[' + String(index) + '].' + field,
      );
    }
  }
}

function validateApplicationCompleteness(
  input,
  window,
  scrollStates,
  paintStates,
) {
  const path = 'applicationEvidence.completeness';
  const completeness = record(
    input,
    'APPLICATION_PIXEL_COMPLETENESS_INVALID',
    'Application evidence completeness must be an object.',
    path,
  );
  const normalized = Object.freeze({
    scrollStateCount: nonNegativeSafeInteger(
      completeness.scrollStateCount,
      'APPLICATION_PIXEL_COMPLETENESS_INVALID',
      'scrollStateCount must be a non-negative safe integer.',
      path + '.scrollStateCount',
    ),
    paintStateCount: nonNegativeSafeInteger(
      completeness.paintStateCount,
      'APPLICATION_PIXEL_COMPLETENESS_INVALID',
      'paintStateCount must be a non-negative safe integer.',
      path + '.paintStateCount',
    ),
    paintStatesInsideWindow: nonNegativeSafeInteger(
      completeness.paintStatesInsideWindow,
      'APPLICATION_PIXEL_COMPLETENESS_INVALID',
      'paintStatesInsideWindow must be a non-negative safe integer.',
      path + '.paintStatesInsideWindow',
    ),
    readbackFailureCount: nonNegativeSafeInteger(
      completeness.readbackFailureCount,
      'APPLICATION_PIXEL_COMPLETENESS_INVALID',
      'readbackFailureCount must be a non-negative safe integer.',
      path + '.readbackFailureCount',
    ),
  });
  const expected = {
    scrollStateCount: scrollStates.length,
    paintStateCount: paintStates.length,
    paintStatesInsideWindow: paintStates.filter(
      (paint) =>
        paint.completedAtMs >= window.startTimeMs &&
        paint.completedAtMs <= window.endTimeMs,
    ).length,
    readbackFailureCount: paintStates.reduce(
      (count, paint) =>
        count +
        paint.layers.filter((layer) => !layer.readbackSucceeded).length,
      0,
    ),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (normalized[field] !== value) {
      reject(
        'APPLICATION_PIXEL_COMPLETENESS_MISMATCH',
        'Application evidence completeness does not match its state arrays.',
        path + '.' + field,
      );
    }
  }
  return normalized;
}

function validateScrollStates(input) {
  if (!Array.isArray(input) || input.length === 0) {
    reject(
      'APPLICATION_PIXEL_SCROLL_STATES_INVALID',
      'At least one scroll state is required.',
      'applicationEvidence.scrollStates',
    );
  }
  const states = input.map((value, index) => {
    const path = `applicationEvidence.scrollStates[${index}]`;
    const state = record(
      value,
      'APPLICATION_PIXEL_SCROLL_STATE_INVALID',
      'Each scroll state must be an object.',
      path,
    );
    return Object.freeze({
      sequence: nonNegativeSafeInteger(
        state.sequence,
        'APPLICATION_PIXEL_SCROLL_STATE_INVALID',
        'Scroll sequence must be a non-negative safe integer.',
        `${path}.sequence`,
      ),
      changedAtMs: nonNegativeFinite(
        state.changedAtMs,
        'APPLICATION_PIXEL_SCROLL_STATE_INVALID',
        'Scroll changedAtMs must be finite and non-negative.',
        `${path}.changedAtMs`,
      ),
      requestedScrollTop: nonNegativeFinite(
        state.requestedScrollTop,
        'APPLICATION_PIXEL_SCROLL_STATE_INVALID',
        'Requested scrollTop must be finite and non-negative.',
        `${path}.requestedScrollTop`,
      ),
      observedScrollTop: nonNegativeFinite(
        state.observedScrollTop,
        'APPLICATION_PIXEL_SCROLL_STATE_INVALID',
        'Observed scrollTop must be finite and non-negative.',
        `${path}.observedScrollTop`,
      ),
    });
  });
  validateStateOrder(
    states,
    'changedAtMs',
    'APPLICATION_PIXEL_SCROLL_STATE_ORDER_INVALID',
    'Scroll state sequences and timestamps must be strictly increasing.',
    'applicationEvidence.scrollStates',
  );
  return Object.freeze(states);
}

function validatePaintStates(input) {
  if (!Array.isArray(input) || input.length === 0) {
    reject(
      'APPLICATION_PIXEL_PAINT_STATES_INVALID',
      'At least one complete paint state is required.',
      'applicationEvidence.paintStates',
    );
  }
  const states = input.map((value, index) => {
    const path = `applicationEvidence.paintStates[${index}]`;
    const state = record(
      value,
      'APPLICATION_PIXEL_PAINT_STATE_INVALID',
      'Each paint state must be an object.',
      path,
    );
    return Object.freeze({
      sequence: nonNegativeSafeInteger(
        state.sequence,
        'APPLICATION_PIXEL_PAINT_STATE_INVALID',
        'Paint sequence must be a non-negative safe integer.',
        `${path}.sequence`,
      ),
      completedAtMs: nonNegativeFinite(
        state.completedAtMs,
        'APPLICATION_PIXEL_PAINT_STATE_INVALID',
        'Paint completedAtMs must be finite and non-negative.',
        `${path}.completedAtMs`,
      ),
      revision: nonEmptyString(state.revision, `${path}.revision`),
      scrollTop: nonNegativeFinite(
        state.scrollTop,
        'APPLICATION_PIXEL_PAINT_STATE_INVALID',
        'Paint scrollTop must be finite and non-negative.',
        `${path}.scrollTop`,
      ),
      scrollLeft: nonNegativeFinite(
        state.scrollLeft,
        'APPLICATION_PIXEL_PAINT_STATE_INVALID',
        'Paint scrollLeft must be finite and non-negative.',
        `${path}.scrollLeft`,
      ),
      viewport: validateViewport(state.viewport, `${path}.viewport`),
      surface: validateSurface(state.surface, `${path}.surface`),
      layers: validateLayers(state.layers, `${path}.layers`),
    });
  });
  validateStateOrder(
    states,
    'completedAtMs',
    'APPLICATION_PIXEL_PAINT_STATE_ORDER_INVALID',
    'Paint state sequences and timestamps must be strictly increasing.',
    'applicationEvidence.paintStates',
  );
  return Object.freeze(states);
}

function validateViewport(input, path) {
  const viewport = record(
    input,
    'APPLICATION_PIXEL_VIEWPORT_INVALID',
    'Paint viewport must be an object.',
    path,
  );
  return Object.freeze({
    width: positiveFinite(
      viewport.width,
      'APPLICATION_PIXEL_VIEWPORT_INVALID',
      'Viewport width must be finite and positive.',
      `${path}.width`,
    ),
    height: positiveFinite(
      viewport.height,
      'APPLICATION_PIXEL_VIEWPORT_INVALID',
      'Viewport height must be finite and positive.',
      `${path}.height`,
    ),
  });
}

function validateSurface(input, path) {
  const surface = record(
    input,
    'APPLICATION_PIXEL_SURFACE_INVALID',
    'Paint surface must be an object.',
    path,
  );
  return Object.freeze({
    x: finite(
      surface.x,
      'APPLICATION_PIXEL_SURFACE_INVALID',
      'Surface x must be finite.',
      `${path}.x`,
    ),
    y: finite(
      surface.y,
      'APPLICATION_PIXEL_SURFACE_INVALID',
      'Surface y must be finite.',
      `${path}.y`,
    ),
    width: positiveFinite(
      surface.width,
      'APPLICATION_PIXEL_SURFACE_INVALID',
      'Surface width must be finite and positive.',
      `${path}.width`,
    ),
    height: positiveFinite(
      surface.height,
      'APPLICATION_PIXEL_SURFACE_INVALID',
      'Surface height must be finite and positive.',
      `${path}.height`,
    ),
  });
}

function validateLayers(input, path) {
  if (!Array.isArray(input) || input.length !== REQUIRED_LAYERS.length) {
    reject(
      'APPLICATION_PIXEL_LAYER_SET_INVALID',
      'Every paint state must contain exactly background and content layers.',
      path,
    );
  }
  const byLayer = new Map();
  for (let index = 0; index < input.length; index += 1) {
    const layerPath = `${path}[${index}]`;
    const value = record(
      input[index],
      'APPLICATION_PIXEL_LAYER_INVALID',
      'Each layer sample must be an object.',
      layerPath,
    );
    if (!REQUIRED_LAYERS.includes(value.layer) || byLayer.has(value.layer)) {
      reject(
        'APPLICATION_PIXEL_LAYER_SET_INVALID',
        'Layer names must contain background and content exactly once.',
        `${layerPath}.layer`,
      );
    }
    if (typeof value.readbackSucceeded !== 'boolean') {
      reject(
        'APPLICATION_PIXEL_LAYER_INVALID',
        'Layer readbackSucceeded must be boolean.',
        `${layerPath}.readbackSucceeded`,
      );
    }
    const rgbaChecksum = value.rgbaChecksum;
    if (
      value.readbackSucceeded
        ? typeof rgbaChecksum !== 'string' ||
          !/^[0-9a-f]{8}$/.test(rgbaChecksum)
        : rgbaChecksum !== null
    ) {
      reject(
        'APPLICATION_PIXEL_LAYER_CHECKSUM_INVALID',
        'Successful readback requires an eight-character lowercase hexadecimal checksum; failed readback requires null.',
        `${layerPath}.rgbaChecksum`,
      );
    }
    const sampledPixelCount = nonNegativeSafeInteger(
      value.sampledPixelCount,
      'APPLICATION_PIXEL_LAYER_COUNT_INVALID',
      'sampledPixelCount must be a non-negative safe integer.',
      `${layerPath}.sampledPixelCount`,
    );
    const nonTransparentPixelCount = nonNegativeSafeInteger(
      value.nonTransparentPixelCount,
      'APPLICATION_PIXEL_LAYER_COUNT_INVALID',
      'nonTransparentPixelCount must be a non-negative safe integer.',
      `${layerPath}.nonTransparentPixelCount`,
    );
    if (nonTransparentPixelCount > sampledPixelCount) {
      reject(
        'APPLICATION_PIXEL_LAYER_COUNT_MISMATCH',
        'Non-transparent pixel count cannot exceed sampled pixel count.',
        `${layerPath}.nonTransparentPixelCount`,
      );
    }
    if (
      value.readbackSucceeded &&
      sampledPixelCount !== APPLICATION_PIXEL_SAMPLE_PIXEL_COUNT
    ) {
      reject(
        'APPLICATION_PIXEL_LAYER_COUNT_MISMATCH',
        'Successful layer readback must contain the fixed 64 by 32 sample.',
        `${layerPath}.sampledPixelCount`,
      );
    }
    if (
      !value.readbackSucceeded &&
      (sampledPixelCount !== 0 || nonTransparentPixelCount !== 0)
    ) {
      reject(
        'APPLICATION_PIXEL_LAYER_COUNT_MISMATCH',
        'Failed layer readback must not report sampled pixel counts.',
        layerPath,
      );
    }
    byLayer.set(value.layer, Object.freeze({
      layer: value.layer,
      readbackSucceeded: value.readbackSucceeded,
      sampledPixelCount,
      nonTransparentPixelCount,
      rgbaChecksum,
    }));
  }
  return Object.freeze(
    REQUIRED_LAYERS.map((layer) => byLayer.get(layer)),
  );
}

function correlateWindows(trace, application, options) {
  if (
    trace.id !== application.id ||
    trace.startMark !== application.startMark ||
    trace.endMark !== application.endMark
  ) {
    reject(
      'APPLICATION_PIXEL_WINDOW_IDENTITY_MISMATCH',
      'Trace and application evidence must use the same window ID and marker names.',
      'applicationEvidence.window',
    );
  }
  const traceDurationMs = trace.durationUs / 1_000;
  if (
    Math.abs(traceDurationMs - application.durationMs) >
      options.windowDurationToleranceMs
  ) {
    reject(
      'APPLICATION_PIXEL_WINDOW_DURATION_MISMATCH',
      'Trace and application marker-window durations differ beyond tolerance.',
      'applicationEvidence.window.durationMs',
    );
  }
  return Object.freeze({
    id: trace.id,
    startMark: trace.startMark,
    endMark: trace.endMark,
    traceStartTimestampUs: trace.startTimestampUs,
    traceEndTimestampUs: trace.endTimestampUs,
    traceDurationMs,
    applicationStartTimeMs: application.startTimeMs,
    applicationEndTimeMs: application.endTimeMs,
    applicationDurationMs: application.durationMs,
    durationDifferenceMs: application.durationMs - traceDurationMs,
  });
}

function createClockMapping(window) {
  const traceDurationUs =
    window.traceEndTimestampUs - window.traceStartTimestampUs;
  const pageMsPerTraceUs =
    window.applicationDurationMs / traceDurationUs;
  return Object.freeze({
    method: 'affine-marker-endpoint-mapping',
    traceStartTimestampUs: window.traceStartTimestampUs,
    traceEndTimestampUs: window.traceEndTimestampUs,
    pageStartTimeMs: window.applicationStartTimeMs,
    pageEndTimeMs: window.applicationEndTimeMs,
    pageMsPerTraceUs,
  });
}

function correlateFrames({ trace, application, clockMapping, options }) {
  const frames = [];
  let scrollIndex = -1;
  let paintIndex = -1;
  for (let ordinal = 0; ordinal < trace.timestampsUs.length; ordinal += 1) {
    const traceTimestampUs = trace.timestampsUs[ordinal];
    const pageTimeMs = mapTraceTimeToPageTime(traceTimestampUs, clockMapping);
    while (
      scrollIndex + 1 < application.scrollStates.length &&
      application.scrollStates[scrollIndex + 1].changedAtMs <=
        pageTimeMs + TIME_EPSILON_MS
    ) {
      scrollIndex += 1;
    }
    while (
      paintIndex + 1 < application.paintStates.length &&
      application.paintStates[paintIndex + 1].completedAtMs <=
        pageTimeMs + TIME_EPSILON_MS
    ) {
      paintIndex += 1;
    }
    const scroll = application.scrollStates[scrollIndex] ?? null;
    const paint = application.paintStates[paintIndex] ?? null;
    if (scroll === null || paint === null) {
      const reasons = [];
      if (scroll === null) {
        reasons.push(frameReason(
          'APPLICATION_PIXEL_SCROLL_STATE_UNAVAILABLE_FOR_FRAME',
          'No scroll state precedes this presented frame.',
          'mapping',
        ));
      }
      if (paint === null) {
        reasons.push(frameReason(
          'APPLICATION_PIXEL_PAINT_STATE_UNAVAILABLE_FOR_FRAME',
          'No complete paint state precedes this presented frame.',
          'mapping',
        ));
      }
      frames.push(Object.freeze({
        ordinal,
        traceTimestampUs,
        pageTimeMs,
        mapped: false,
        failed: null,
        stale: null,
        scrollStateSequence: scroll?.sequence ?? null,
        paintStateSequence: paint?.sequence ?? null,
        requestedScrollTop: scroll?.requestedScrollTop ?? null,
        observedScrollTop: scroll?.observedScrollTop ?? null,
        paintedScrollTop: paint?.scrollTop ?? null,
        paintRevision: paint?.revision ?? null,
        revisionMatched: null,
        scrollMatched: null,
        surfaceCovered: null,
        layers: paint?.layers ?? Object.freeze([]),
        reasons: Object.freeze(reasons),
      }));
      continue;
    }
    frames.push(classifyFrame({
      ordinal,
      traceTimestampUs,
      pageTimeMs,
      scroll,
      paint,
      expectedRevision: application.expectedRevision,
      options,
    }));
  }
  return Object.freeze(frames);
}

function classifyFrame({
  ordinal,
  traceTimestampUs,
  pageTimeMs,
  scroll,
  paint,
  expectedRevision,
  options,
}) {
  const reasons = [];
  const revisionMatched = paint.revision === expectedRevision;
  if (!revisionMatched) {
    reasons.push(frameReason(
      'APPLICATION_PIXEL_PAINT_REVISION_MISMATCH',
      'The last paint revision does not match the locked scroll revision.',
      'stale',
    ));
  }
  const paintCompletedAfterScroll =
    paint.completedAtMs + TIME_EPSILON_MS >= scroll.changedAtMs;
  const requestedScrollObserved = withinTolerance(
    scroll.requestedScrollTop,
    scroll.observedScrollTop,
    options.scrollOffsetTolerancePx,
  );
  if (!requestedScrollObserved) {
    reasons.push(frameReason(
      'APPLICATION_PIXEL_REQUESTED_SCROLL_NOT_OBSERVED',
      'Observed scrollTop differs from the requested trajectory offset.',
      'stale',
    ));
  }
  const paintScrollMatched = withinTolerance(
    paint.scrollTop,
    scroll.observedScrollTop,
    options.scrollOffsetTolerancePx,
  );
  if (!paintScrollMatched) {
    reasons.push(frameReason(
      'APPLICATION_PIXEL_PAINT_SCROLL_OFFSET_MISMATCH',
      'The last complete paint does not cover the active scroll offset.',
      'stale',
    ));
  }
  const visuallyEquivalentPrepaint =
    !paintCompletedAfterScroll &&
    revisionMatched &&
    requestedScrollObserved &&
    paintScrollMatched;
  const paintTemporallyCompatible =
    paintCompletedAfterScroll || visuallyEquivalentPrepaint;
  if (!paintTemporallyCompatible) {
    reasons.push(frameReason(
      'APPLICATION_PIXEL_PAINT_PRECEDES_SCROLL_STATE',
      'The last complete paint predates and does not match the active visual state.',
      'stale',
    ));
  }
  const surfaceCovered = surfaceCoversViewport(
    paint.surface,
    paint.viewport,
    options.surfaceCoverageTolerancePx,
  );
  if (!surfaceCovered) {
    reasons.push(frameReason(
      'APPLICATION_PIXEL_SURFACE_DOES_NOT_COVER_VIEWPORT',
      'The painted Canvas surface does not geometrically cover the viewport.',
      'geometry',
    ));
  }
  for (const layer of paint.layers) {
    if (!layer.readbackSucceeded) {
      reasons.push(frameReason(
        `APPLICATION_PIXEL_${layer.layer.toUpperCase()}_READBACK_FAILED`,
        `The ${layer.layer} Canvas layer could not be read back.`,
        'pixel',
      ));
    } else if (layer.sampledPixelCount === 0) {
      reasons.push(frameReason(
        `APPLICATION_PIXEL_${layer.layer.toUpperCase()}_SAMPLE_EMPTY`,
        `The ${layer.layer} Canvas layer has no sampled pixels.`,
        'pixel',
      ));
    } else if (layer.nonTransparentPixelCount === 0) {
      reasons.push(frameReason(
        `APPLICATION_PIXEL_${layer.layer.toUpperCase()}_TRANSPARENT`,
        `The ${layer.layer} Canvas layer has no non-transparent sampled pixels.`,
        'pixel',
      ));
    }
  }
  const frozenReasons = Object.freeze(reasons);
  return Object.freeze({
    ordinal,
    traceTimestampUs,
    pageTimeMs,
    mapped: true,
    failed: reasons.length > 0,
    stale: reasons.some((reason) => reason.category === 'stale'),
    scrollStateSequence: scroll.sequence,
    paintStateSequence: paint.sequence,
    requestedScrollTop: scroll.requestedScrollTop,
    observedScrollTop: scroll.observedScrollTop,
    paintedScrollTop: paint.scrollTop,
    paintRevision: paint.revision,
    revisionMatched,
    scrollMatched:
      paintTemporallyCompatible &&
      requestedScrollObserved &&
      paintScrollMatched,
    surfaceCovered,
    layers: paint.layers,
    reasons: frozenReasons,
  });
}

function summarizeCompleteness(frames, blankFrameCount) {
  const mapped = frames.filter((frame) => frame.mapped);
  return Object.freeze({
    presentedFrameCount: frames.length,
    mappedFrameCount: mapped.length,
    unmappedFrameCount: frames.length - mapped.length,
    classifiedFrameCount: mapped.length,
    revisionMatchedFrameCount: mapped.filter((frame) => frame.revisionMatched).length,
    scrollMatchedFrameCount: mapped.filter((frame) => frame.scrollMatched).length,
    surfaceCoveredFrameCount: mapped.filter((frame) => frame.surfaceCovered).length,
    staleFrameCount: mapped.filter((frame) => frame.stale).length,
    geometryFailureFrameCount: categoryFailureCount(mapped, 'geometry'),
    pixelFailureFrameCount: categoryFailureCount(mapped, 'pixel'),
    blankFrameCount,
  });
}

function emptyCompleteness() {
  return Object.freeze({
    presentedFrameCount: 0,
    mappedFrameCount: 0,
    unmappedFrameCount: 0,
    classifiedFrameCount: 0,
    revisionMatchedFrameCount: 0,
    scrollMatchedFrameCount: 0,
    surfaceCoveredFrameCount: 0,
    staleFrameCount: 0,
    geometryFailureFrameCount: 0,
    pixelFailureFrameCount: 0,
    blankFrameCount: null,
  });
}

function categoryFailureCount(frames, category) {
  return frames.filter((frame) =>
    frame.reasons.some((reason) => reason.category === category)).length;
}

function resolveOptions(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    reject(
      'APPLICATION_PIXEL_OPTIONS_INVALID',
      'Correlation options must be an object.',
      'options',
    );
  }
  return Object.freeze({
    scrollOffsetTolerancePx: optionTolerance(
      input.scrollOffsetTolerancePx,
      DEFAULT_OPTIONS.scrollOffsetTolerancePx,
      'options.scrollOffsetTolerancePx',
    ),
    surfaceCoverageTolerancePx: optionTolerance(
      input.surfaceCoverageTolerancePx,
      DEFAULT_OPTIONS.surfaceCoverageTolerancePx,
      'options.surfaceCoverageTolerancePx',
    ),
    windowDurationToleranceMs: optionTolerance(
      input.windowDurationToleranceMs,
      DEFAULT_OPTIONS.windowDurationToleranceMs,
      'options.windowDurationToleranceMs',
    ),
  });
}

function optionTolerance(value, fallback, path) {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    reject(
      'APPLICATION_PIXEL_OPTIONS_INVALID',
      'Correlation tolerances must be finite and non-negative.',
      path,
    );
  }
  return resolved;
}

function validateStateOrder(states, timestampField, code, message, path) {
  for (let index = 1; index < states.length; index += 1) {
    if (
      states[index].sequence <= states[index - 1].sequence ||
      states[index][timestampField] <= states[index - 1][timestampField]
    ) {
      reject(code, message, `${path}[${index}]`);
    }
  }
}

function validateStrictOrder(values, code, message, path) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] <= values[index - 1]) {
      reject(code, message, `${path}[${index}]`);
    }
  }
}

function mapTraceTimeToPageTime(timestampUs, mapping) {
  return mapping.pageStartTimeMs +
    (timestampUs - mapping.traceStartTimestampUs) *
      mapping.pageMsPerTraceUs;
}

function surfaceCoversViewport(surface, viewport, tolerance) {
  return (
    surface.x <= tolerance &&
    surface.y <= tolerance &&
    surface.x + surface.width >= viewport.width - tolerance &&
    surface.y + surface.height >= viewport.height - tolerance
  );
}

function withinTolerance(left, right, tolerance) {
  return Math.abs(left - right) <= tolerance;
}

function record(value, code, message, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    reject(code, message, path);
  }
  return value;
}

function nonEmptyString(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    reject(
      'APPLICATION_PIXEL_STRING_FIELD_INVALID',
      'Required evidence strings must be non-empty.',
      path,
    );
  }
  return value;
}

function finite(value, code, message, path) {
  if (!Number.isFinite(value)) {
    reject(code, message, path);
  }
  return value;
}

function nonNegativeFinite(value, code, message, path) {
  finite(value, code, message, path);
  if (value < 0) reject(code, message, path);
  return value;
}

function positiveFinite(value, code, message, path) {
  finite(value, code, message, path);
  if (value <= 0) reject(code, message, path);
  return value;
}

function nonNegativeSafeInteger(value, code, message, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    reject(code, message, path);
  }
  return value;
}

function positiveSafeInteger(value, code, message, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    reject(code, message, path);
  }
  return value;
}

function frameReason(code, message, category) {
  return Object.freeze({ code, message, category });
}

function blocker(code, message, path) {
  return Object.freeze({ code, message, path });
}

function freezeResult(result) {
  return deepFreeze({
    schemaVersion: APPLICATION_PIXEL_FRAME_CORRELATION_SCHEMA_VERSION,
    evidenceSchemaVersion: APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
    ...result,
  });
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function reject(code, message, path) {
  throw new EvidenceValidationError(code, message, path);
}

function normalizeValidationFailure(error, code, message) {
  return error instanceof EvidenceValidationError
    ? error
    : new EvidenceValidationError(code, message, null);
}

class EvidenceValidationError extends Error {
  constructor(code, message, path) {
    super(message);
    this.name = 'EvidenceValidationError';
    this.code = code;
    this.path = path;
  }
}
