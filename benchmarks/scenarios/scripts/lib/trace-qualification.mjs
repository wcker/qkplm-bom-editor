import {
  CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID,
  COMPOSITOR_TRACE_EVIDENCE_SCHEMA_VERSION,
  COMPOSITOR_TRACE_EXTRACTOR_ID,
  CompositorTraceExtractionError,
  extractCompositorPresentedFrameEvidence,
  getCompositorTraceProfileId,
} from './trace.mjs';
import {
  APPLICATION_PIXEL_FRAME_CORRELATION_SCHEMA_VERSION,
  APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION,
  correlateApplicationPixelFrames,
} from './application-pixel-scroll.mjs';
import { summarizeSamples, thresholdVerdict } from './statistics.mjs';

export const F3_SCROLL_TRACE_WINDOW_ID = 'f3-10k-scroll-30s';
export const F3_SCROLL_P99_MINIMUM_INTERVALS = 1_000;

export function evaluateCompositorTrace({
  traceInput,
  browserVersion,
  browserRevision,
  refreshPeriodUs,
  windowId = F3_SCROLL_TRACE_WINDOW_ID,
  thresholds,
  applicationPixelEvidence = null,
  applicationPixelCorrelationOptions = {},
}) {
  const profileId =
    getCompositorTraceProfileId(browserVersion) ??
    CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID;
  try {
    const evidence = extractCompositorPresentedFrameEvidence(traceInput, {
      browserVersion,
      browserRevision,
      refreshPeriodUs,
      windowId,
      profileId,
    });
    const applicationPixelCorrelation = correlateApplicationPixelFrames(
      evidence,
      applicationPixelEvidence,
      applicationPixelCorrelationOptions,
    );
    const summary = summarizeCompositorTraceEvidence(
      evidence,
      thresholds,
      applicationPixelCorrelation,
    );
    return Object.freeze({
      extraction: createExtraction({
        status: 'succeeded',
        certified: true,
        windowId,
        profileId,
        error: null,
      }),
      evidence,
      applicationPixelCorrelation,
      metric: summary.metric,
      gate: summary.gate,
    });
  } catch (error) {
    const serialized = serializeExtractionError(error);
    return Object.freeze({
      extraction: createExtraction({
        status: 'failed',
        certified: false,
        windowId,
        profileId,
        error: serialized,
      }),
      evidence: null,
      applicationPixelCorrelation: null,
      metric: null,
      gate: Object.freeze({
        status: 'unqualified',
        checks: null,
        blockers: Object.freeze([
          'compositor trace extraction failed: ' + serialized.code,
        ]),
      }),
    });
  }
}

export function createUnattemptedCompositorTraceEvaluation({
  windowId = F3_SCROLL_TRACE_WINDOW_ID,
  profileId,
  code,
  message,
}) {
  if (typeof code !== 'string' || code.length === 0) {
    throw new TypeError('A non-empty trace extraction reason code is required.');
  }
  if (typeof message !== 'string' || message.length === 0) {
    throw new TypeError('A non-empty trace extraction reason message is required.');
  }
  return Object.freeze({
    extraction: createExtraction({
      status: 'not-attempted',
      certified: false,
      windowId,
      profileId,
      error: Object.freeze({
        name: 'CompositorTraceExtractionUnavailable',
        code,
        message,
        diagnostics: null,
      }),
    }),
    evidence: null,
    applicationPixelCorrelation: null,
    metric: null,
    gate: Object.freeze({
      status: 'unqualified',
      checks: null,
      blockers: Object.freeze([message]),
    }),
  });
}

export function summarizeCompositorTraceEvidence(
  evidence,
  thresholds,
  applicationPixelCorrelation = null,
) {
  validateThresholds(thresholds);
  const intervals = evidence?.presentedFrames?.intervalsMs;
  if (!Array.isArray(intervals) || intervals.length === 0) {
    throw new TypeError('Certified trace evidence must contain presented-frame intervals.');
  }
  const statistics = summarizeSamples(intervals, {
    p99MinimumSamples:
      thresholds.p99MinimumIntervals ?? F3_SCROLL_P99_MINIMUM_INTERVALS,
  });
  const p95 = thresholdVerdict(statistics.p95Ms, thresholds.frameP95Ms);
  const p99 = statistics.p99Ms === null
    ? Object.freeze({
        value: null,
        maximum: thresholds.frameP99Ms,
        passed: null,
      })
    : thresholdVerdict(statistics.p99Ms, thresholds.frameP99Ms);
  const intervalSampleFloor = Object.freeze({
    value: statistics.count,
    minimum:
      thresholds.p99MinimumIntervals ?? F3_SCROLL_P99_MINIMUM_INTERVALS,
    passed:
      statistics.count >=
      (thresholds.p99MinimumIntervals ?? F3_SCROLL_P99_MINIMUM_INTERVALS),
  });
  const duration = Object.freeze({
    valueMs: evidence.window.durationUs / 1_000,
    minimumMs: thresholds.scrollDurationMs,
    passed: evidence.window.durationUs / 1_000 >= thresholds.scrollDurationMs,
  });
  const compositorMissingOrCheckerboard = Object.freeze({
    value: evidence.missingOrCheckerboardFrames.count,
    maximum: 0,
    passed: evidence.missingOrCheckerboardFrames.count === 0,
    semantics: evidence.missingOrCheckerboardFrames.semantics,
  });
  const applicationPixelBlankValue =
    qualifiedApplicationPixelBlankFrameCount(
      evidence,
      applicationPixelCorrelation,
    );
  const applicationPixelBlank = Object.freeze({
    value: applicationPixelBlankValue,
    maximum: 0,
    passed: applicationPixelBlankValue !== null
      ? applicationPixelBlankValue === 0
      : null,
    correlationQualified: applicationPixelBlankValue !== null,
    evidenceSource: 'independent-application-pixel-correlation',
  });
  const checks = Object.freeze({
    duration,
    intervalSampleFloor,
    frameP95: p95,
    frameP99: p99,
    compositorMissingOrCheckerboard,
    applicationPixelBlank,
  });
  const hardFailure = [
    duration,
    p95,
    p99,
    compositorMissingOrCheckerboard,
    applicationPixelBlank,
  ].some((check) => check.passed === false);
  const incomplete = [
    intervalSampleFloor,
    p99,
    applicationPixelBlank,
  ].some((check) => check.passed !== true);
  const status = hardFailure ? 'failed' : incomplete ? 'unqualified' : 'passed';
  const blockers = [];
  if (!duration.passed) {
    blockers.push('scripted scroll window is shorter than the scenario minimum');
  }
  if (!p95.passed) {
    blockers.push('presented-frame P95 exceeds the scenario threshold');
  }
  if (p99.passed === false) {
    blockers.push('presented-frame P99 exceeds the scenario threshold');
  }
  if (!compositorMissingOrCheckerboard.passed) {
    blockers.push('compositor missing/checkerboard frames were observed');
  }
  if (applicationPixelBlank.passed === false) {
    blockers.push('application Canvas pixel blank frames were observed');
  }
  if (!intervalSampleFloor.passed) {
    blockers.push(
      'presented-frame interval count is below the 1000-sample P99 floor',
    );
  }
  if (p99.passed === null) {
    blockers.push('presented-frame P99 is unavailable');
  }
  if (applicationPixelBlank.passed === null) {
    blockers.push(
      'application Canvas pixel blank-frame evidence is not available',
    );
  }

  return Object.freeze({
    metric: Object.freeze({
      endpoint:
        'adjacent compositor presented frames inside the marked scripted scroll window',
      authoritativeSource: evidence.presentedFrames.authoritativeEvent,
      windowDurationMs: evidence.window.durationUs / 1_000,
      presentedFrameCount: evidence.presentedFrames.count,
      statistics,
      missedVsyncCount: evidence.missedVsync.count,
      compositorMissingOrCheckerboardFrameCount:
        evidence.missingOrCheckerboardFrames.count,
      applicationPixelCorrelationQualified:
        applicationPixelBlank.correlationQualified,
      applicationPixelBlankFrameCount: applicationPixelBlank.value,
    }),
    gate: Object.freeze({
      status,
      checks,
      blockers: Object.freeze(blockers),
    }),
  });
}

function qualifiedApplicationPixelBlankFrameCount(evidence, correlation) {
  if (
    correlation === null ||
    typeof correlation !== 'object' ||
    correlation.schemaVersion !==
      APPLICATION_PIXEL_FRAME_CORRELATION_SCHEMA_VERSION ||
    correlation.evidenceSchemaVersion !==
      APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA_VERSION ||
    correlation.qualified !== true ||
    !Number.isSafeInteger(correlation.frameCount) ||
    correlation.frameCount !== evidence.presentedFrames.count ||
    !Number.isSafeInteger(correlation.blankFrameCount) ||
    correlation.blankFrameCount < 0 ||
    correlation.blankFrameCount > correlation.frameCount ||
    correlation.passed !== (correlation.blankFrameCount === 0) ||
    correlation.status !==
      (correlation.blankFrameCount === 0 ? 'passed' : 'failed')
  ) {
    return null;
  }
  return correlation.blankFrameCount;
}

function createExtraction({
  status,
  certified,
  windowId,
  profileId = CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID,
  error,
}) {
  return Object.freeze({
    status,
    certified,
    windowId,
    extractorId: COMPOSITOR_TRACE_EXTRACTOR_ID,
    profileId,
    evidenceSchemaVersion: COMPOSITOR_TRACE_EVIDENCE_SCHEMA_VERSION,
    evidenceArtifact: null,
    error,
  });
}

function validateThresholds(thresholds) {
  if (
    thresholds === null ||
    typeof thresholds !== 'object' ||
    !Number.isFinite(thresholds.scrollDurationMs) ||
    thresholds.scrollDurationMs <= 0 ||
    !Number.isFinite(thresholds.frameP95Ms) ||
    thresholds.frameP95Ms < 0 ||
    !Number.isFinite(thresholds.frameP99Ms) ||
    thresholds.frameP99Ms < 0 ||
    (thresholds.p99MinimumIntervals !== undefined &&
      (!Number.isSafeInteger(thresholds.p99MinimumIntervals) ||
        thresholds.p99MinimumIntervals < 1))
  ) {
    throw new TypeError('Trace qualification thresholds are invalid.');
  }
}

function serializeExtractionError(error) {
  if (error instanceof CompositorTraceExtractionError) {
    return Object.freeze({
      name: error.name,
      code: error.code,
      message: error.message,
      diagnostics: sanitizeDiagnostics(error.diagnostics),
    });
  }
  return Object.freeze({
    name: error instanceof Error ? error.name : 'UnknownError',
    code: 'BOM_F3_TRACE_EXTRACTION_UNEXPECTED_ERROR',
    message: error instanceof Error ? error.message : String(error),
    diagnostics: null,
  });
}

function sanitizeDiagnostics(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) {
    return Object.freeze(
      value.slice(0, 64).map((entry) => sanitizeDiagnostics(entry, depth + 1)),
    );
  }
  if (typeof value !== 'object') return String(value).slice(0, 500);
  const result = {};
  for (const key of Object.keys(value).sort().slice(0, 64)) {
    if (key === 'rawEvent' || key === 'args' || key === 'data') continue;
    result[key] = sanitizeDiagnostics(value[key], depth + 1);
  }
  return Object.freeze(result);
}
