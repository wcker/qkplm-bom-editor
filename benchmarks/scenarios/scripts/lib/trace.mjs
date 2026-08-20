import { gunzipSync } from 'node:zlib';

const TRACE_CATEGORIES = [
  'blink.user_timing',
  'viz',
  'disabled-by-default-display.framedisplayed',
  'disabled-by-default-devtools.timeline.frame',
].join(',');
const TRACE_CATEGORY_LIST = Object.freeze(TRACE_CATEGORIES.split(','));
const TRACE_CONFIG = Object.freeze({
  recordMode: 'recordUntilFull',
  includedCategories: TRACE_CATEGORY_LIST,
  // Keep the evidence window comfortably below the recorder capacity. The
  // strict extractor still rejects every trace-processor loss counter.
  traceBufferSizeInKb: 65_536,
});

export const COMPOSITOR_TRACE_EXTRACTOR_ID =
  'bom-f3-chromium-compositor-presented-frame/v1';
export const COMPOSITOR_TRACE_EVIDENCE_SCHEMA_VERSION =
  'bom-f3-compositor-presented-frame-evidence/v1';
export const CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID =
  'chromium-150-display-frame/v1';
export const CHROMIUM_151_COMPOSITOR_TRACE_PROFILE_ID =
  'chromium-151-display-frame/v1';

const SCROLL_MARK_PREFIX = 'bom:f3:scroll';
const CHROMIUM_150_PROFILE = Object.freeze({
  id: CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID,
  browserMajor: 150,
  browserProduct: 'Chrome/150.0.7871.127',
  browserRevision: '@86e682ff10b168a25994de599ae5794936efe46a',
  traceMetadataRevision:
    '86e682ff10b168a25994de599ae5794936efe46a-refs/branch-heads/7871@{#3362}',
  timestampUnit: 'microseconds',
  clockDomain: 'WIN_QPC',
  refreshPeriodUs: 1_000_000 / 60,
  traceRefreshIntervalUs: 16_667,
  minimumScrollWindowDurationUs: 30_000_000,
  maximumScrollWindowDurationUs: 30_033_334,
  maximumBoundaryPresentationGapPeriods: 1.1,
  maximumVsyncQuantizationErrorRatio: 0.05,
  presented: Object.freeze({
    category: 'benchmark,viz,disabled-by-default-display.framedisplayed',
    name: 'Display::FrameDisplayed',
    phase: 'I',
  }),
  pipelineReporter: Object.freeze({
    category: 'cc,benchmark,disabled-by-default-devtools.timeline.frame',
    name: 'PipelineReporter',
    beginPhase: 'b',
    endPhase: 'e',
    states: Object.freeze([
      'STATE_DROPPED',
      'STATE_NO_UPDATE_DESIRED',
      'STATE_PRESENTED_ALL',
      'STATE_PRESENTED_PARTIAL',
    ]),
    presentedStates: Object.freeze([
      'STATE_PRESENTED_ALL',
      'STATE_PRESENTED_PARTIAL',
    ]),
  }),
  marker: Object.freeze({
    category: 'blink.user_timing',
    phase: 'I',
  }),
  beginFrameSource: Object.freeze({
    category: 'viz,input.scrolling',
    name: 'ExternalBeginFrameSource::OnBeginFrame',
    phase: 'X',
  }),
});

const CHROMIUM_151_PROFILE = Object.freeze({
  ...CHROMIUM_150_PROFILE,
  id: CHROMIUM_151_COMPOSITOR_TRACE_PROFILE_ID,
  browserMajor: 151,
  browserProduct: 'Chrome/151.0.7922.108',
  browserRevision: '@4744b886309d987d292e43232776d2206cccb13d',
  traceMetadataRevision:
    '4744b886309d987d292e43232776d2206cccb13d-refs/branch-heads/7922@{#2606}',
});

const TRACE_SCHEMA_PROFILES = Object.freeze([
  CHROMIUM_150_PROFILE,
  CHROMIUM_151_PROFILE,
]);
const TRACE_BUFFER_ZERO_FIELDS = Object.freeze([
  'abi_violations',
  'bytes_overwritten',
  'chunks_discarded',
  'chunks_overwritten',
  'incremental_sequences_dropped',
  'patches_failed',
  'sequence_packet_loss',
  'trace_writer_packet_loss',
]);
const TRACE_STATS_ZERO_FIELDS = Object.freeze([
  'interned_data_skipped_incremental_state_invalid',
  'json_parser_failure',
  'json_tokenizer_failure',
  'packet_skipped_seq_needs_incremental_state_invalid',
  'previous_packet_dropped_missing_sequence_id',
  'tokenizer_skipped_packets',
  'trace_packet_defaults_missing_sequence_id',
  'trace_sorter_negative_timestamp_dropped',
  'traced_chunks_discarded',
  'traced_final_flush_failed',
  'traced_patches_discarded',
  'track_event_dropped_packets_outside_of_range_of_interest',
  'track_event_missing_sequence_id',
  'track_event_missing_timestamp',
  'track_event_parser_errors',
  'track_event_tokenizer_errors',
]);

export class CompositorTraceExtractionError extends Error {
  constructor(code, message, diagnostics = {}) {
    super(message);
    this.name = 'CompositorTraceExtractionError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export function listCompositorTraceSchemaProfiles() {
  return Object.freeze(TRACE_SCHEMA_PROFILES.map((profile) => Object.freeze({
    id: profile.id,
    browserMajor: profile.browserMajor,
    browserProduct: profile.browserProduct,
    browserRevision: profile.browserRevision,
    traceMetadataRevision: profile.traceMetadataRevision,
    timestampUnit: profile.timestampUnit,
    authoritativePresentationEvent: profile.presented.name,
  })));
}

export function createScrollTraceWindowNames(windowId) {
  if (typeof windowId !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(windowId)) {
    throw new TypeError('windowId must contain only ASCII letters, digits, dot, underscore, or hyphen.');
  }
  return Object.freeze({
    id: windowId,
    start: [SCROLL_MARK_PREFIX, windowId, 'start'].join(':'),
    end: [SCROLL_MARK_PREFIX, windowId, 'end'].join(':'),
  });
}

/**
 * Extracts authoritative compositor presentation evidence from one marked
 * scrolling window. A schema mismatch throws; RAF and renderer-side frame
 * events are retained only as diagnostics and are never used as a fallback.
 */
export function extractCompositorPresentedFrameEvidence(traceInput, options) {
  const configuration = validateExtractionOptions(options);
  const trace = parseTraceInput(traceInput);
  const profile = selectTraceProfile(configuration);
  const root = validateTraceRoot(trace);
  const source = validateTraceMetadata(root.metadata, configuration, profile);
  const traceIntegrity = validateTraceIntegrity(root.metadata);
  const indexedEvents = root.traceEvents.map((event, index) => ({ event, index }));
  const markerWindow = extractMarkerWindow(
    indexedEvents,
    profile,
    configuration.windowId,
  );
  const displayFrames = extractDisplayFrames(indexedEvents, profile);
  const pipeline = extractPipelineReporterPairs(indexedEvents, profile);
  const refreshCadence = validateRefreshCadence(
    indexedEvents,
    profile,
    configuration.refreshPeriodUs,
  );

  const selectedFrames = displayFrames.unique.filter(
    (frame) => frame.timestampUs >= markerWindow.startTimestampUs &&
      frame.timestampUs <= markerWindow.endTimestampUs,
  );
  const selectedPresentedByEndTimestamp = new Map(
    [...pipeline.presentedByEndTimestamp].filter(
      ([timestampUs]) =>
        timestampUs >= markerWindow.startTimestampUs &&
        timestampUs <= markerWindow.endTimestampUs,
    ),
  );
  validateDisplayReporterSet(
    selectedFrames,
    selectedPresentedByEndTimestamp,
  );
  if (selectedFrames.length < 2) {
    reject(
      'BOM_F3_TRACE_WINDOW_INSUFFICIENT_PRESENTED_FRAMES',
      'The marked scrolling window contains fewer than two compositor presented frames.',
      {
        window: markerWindow,
        presentedFrameCount: selectedFrames.length,
        authoritativePresentationEvent: profile.presented,
      },
    );
  }
  const maximumBoundaryGapUs =
    configuration.refreshPeriodUs * profile.maximumBoundaryPresentationGapPeriods;
  const startBoundaryGapUs =
    selectedFrames[0].timestampUs - markerWindow.startTimestampUs;
  const endBoundaryGapUs =
    markerWindow.endTimestampUs - selectedFrames.at(-1).timestampUs;
  if (
    startBoundaryGapUs > maximumBoundaryGapUs ||
    endBoundaryGapUs > maximumBoundaryGapUs
  ) {
    reject(
      'BOM_F3_TRACE_WINDOW_PRESENTATION_COVERAGE_INCOMPLETE',
      'Presented-frame evidence does not cover both boundaries of the scrolling window.',
      {
        startBoundaryGapUs,
        endBoundaryGapUs,
        maximumBoundaryGapUs,
        firstPresentedTimestampUs: selectedFrames[0].timestampUs,
        lastPresentedTimestampUs: selectedFrames.at(-1).timestampUs,
        window: markerWindow,
      },
    );
  }

  const presentedTimestampsUs = selectedFrames.map((frame) => frame.timestampUs);
  const intervalsUs = adjacentDifferences(presentedTimestampsUs);
  const intervalEvidence = intervalsUs.map((intervalUs, index) => {
    const elapsedRefreshPeriods = Math.max(
      1,
      Math.round(intervalUs / configuration.refreshPeriodUs),
    );
    const quantizedIntervalUs = elapsedRefreshPeriods * configuration.refreshPeriodUs;
    const quantizationErrorUs = Math.abs(intervalUs - quantizedIntervalUs);
    const maximumQuantizationErrorUs =
      configuration.refreshPeriodUs * profile.maximumVsyncQuantizationErrorRatio;
    if (quantizationErrorUs > maximumQuantizationErrorUs) {
      reject(
        'BOM_F3_TRACE_VSYNC_QUANTIZATION_MISMATCH',
        'A presented-frame interval is not quantized to the caller-supplied locked refresh period.',
        {
          fromTimestampUs: presentedTimestampsUs[index],
          toTimestampUs: presentedTimestampsUs[index + 1],
          intervalUs,
          refreshPeriodUs: configuration.refreshPeriodUs,
          elapsedRefreshPeriods,
          quantizationErrorUs,
          maximumQuantizationErrorUs,
        },
      );
    }
    return Object.freeze({
      fromTimestampUs: presentedTimestampsUs[index],
      toTimestampUs: presentedTimestampsUs[index + 1],
      intervalUs,
      intervalMs: intervalUs / 1_000,
      elapsedRefreshPeriods,
      quantizationErrorUs,
      maximumQuantizationErrorUs,
      missedVsync: Math.max(0, elapsedRefreshPeriods - 1),
    });
  });
  const frameContentEvidence = selectedFrames.map((frame) => {
    const reporters = selectedPresentedByEndTimestamp.get(frame.timestampUs);
    const normalizedReporters = reporters.map(normalizeReporterEvidence);
    const missingOrCheckerboard = normalizedReporters.some(
      (reporter) => reporter.hasMissingContent ||
        reporter.checkerboardedNeedsRaster ||
        reporter.checkerboardedNeedsRecord,
    );
    return Object.freeze({
      timestampUs: frame.timestampUs,
      missingOrCheckerboard,
      reporterCount: normalizedReporters.length,
      reporters: normalizedReporters,
    });
  });
  const missingOrCheckerboardEvidence = frameContentEvidence.filter(
    (frame) => frame.missingOrCheckerboard,
  );
  const nonAuthoritativeCounts = countNonAuthoritativeFrameEvents(indexedEvents);

  return Object.freeze({
    schemaVersion: COMPOSITOR_TRACE_EVIDENCE_SCHEMA_VERSION,
    extractor: Object.freeze({
      id: COMPOSITOR_TRACE_EXTRACTOR_ID,
      profileId: profile.id,
      certified: true,
    }),
    source: Object.freeze(source),
    window: Object.freeze({
      ...markerWindow,
      boundary: 'closed',
      presentationCoverage: Object.freeze({
        startBoundaryGapUs,
        endBoundaryGapUs,
        maximumBoundaryGapUs,
      }),
    }),
    refresh: Object.freeze({
      periodUs: configuration.refreshPeriodUs,
      frequencyHz: 1_000_000 / configuration.refreshPeriodUs,
      source: 'certified-profile-and-caller-supplied-scenario-lock',
      traceCadence: refreshCadence,
    }),
    presentedFrames: Object.freeze({
      authoritativeEvent: profile.presented.name,
      count: selectedFrames.length,
      timestampsUs: Object.freeze(presentedTimestampsUs),
      intervalCount: intervalsUs.length,
      intervalsUs: Object.freeze(intervalsUs),
      intervalsMs: Object.freeze(intervalsUs.map((value) => value / 1_000)),
      rawEventCount: selectedFrames.reduce(
        (total, frame) => total + frame.rawEventIndexes.length,
        0,
      ),
      duplicateEventCount: selectedFrames.reduce(
        (total, frame) => total + frame.rawEventIndexes.length - 1,
        0,
      ),
    }),
    missedVsync: Object.freeze({
      count: intervalEvidence.reduce((total, entry) => total + entry.missedVsync, 0),
      intervals: Object.freeze(intervalEvidence),
    }),
    missingOrCheckerboardFrames: Object.freeze({
      count: missingOrCheckerboardEvidence.length,
      timestampsUs: Object.freeze(
        missingOrCheckerboardEvidence.map((frame) => frame.timestampUs),
      ),
      evidence: Object.freeze(frameContentEvidence),
      semantics:
        'A displayed timestamp is flagged when any paired presented PipelineReporter reports missing or checkerboarded compositor content; this does not prove whether application Canvas pixels were visually blank.',
    }),
    diagnostics: Object.freeze({
      traceIntegrity,
      traceEventCount: indexedEvents.length,
      displayFrameEventCount: displayFrames.rawCount,
      uniqueDisplayTimestampCount: displayFrames.unique.length,
      duplicateDisplayFrameEventCount: displayFrames.duplicateCount,
      pairedPipelineReporterCount: pipeline.pairCount,
      presentedPipelineReporterCount: pipeline.presentedPairCount,
      observedMedianPresentedIntervalUs: median(intervalsUs),
      observedMedianIsRefreshBaseline: false,
      nonAuthoritativeFrameEvents: nonAuthoritativeCounts,
      rawTraceRetainedSeparately: true,
    }),
  });
}

function validateExtractionOptions(options) {
  if (!isRecord(options)) {
    reject(
      'BOM_F3_TRACE_EXTRACTION_OPTIONS_INVALID',
      'Compositor trace extraction options are required.',
    );
  }
  if (typeof options.browserVersion !== 'string' || options.browserVersion.length === 0) {
    reject(
      'BOM_F3_TRACE_BROWSER_VERSION_REQUIRED',
      'The exact Browser.getVersion product is required for profile selection.',
    );
  }
  if (typeof options.browserRevision !== 'string' || options.browserRevision.length === 0) {
    reject(
      'BOM_F3_TRACE_BROWSER_REVISION_REQUIRED',
      'The exact Browser.getVersion revision is required for profile selection.',
    );
  }
  if (!Number.isFinite(options.refreshPeriodUs) || options.refreshPeriodUs <= 0) {
    reject(
      'BOM_F3_TRACE_REFRESH_PERIOD_REQUIRED',
      'A positive locked-environment refreshPeriodUs must be supplied by the caller.',
      { refreshPeriodUs: options.refreshPeriodUs ?? null },
    );
  }
  try {
    createScrollTraceWindowNames(options.windowId);
  } catch (error) {
    reject(
      'BOM_F3_TRACE_WINDOW_ID_INVALID',
      error instanceof Error ? error.message : String(error),
      { windowId: options.windowId ?? null },
    );
  }
  if (
    options.profileId !== undefined &&
    (typeof options.profileId !== 'string' || options.profileId.length === 0)
  ) {
    reject(
      'BOM_F3_TRACE_PROFILE_ID_INVALID',
      'profileId must be a non-empty string when provided.',
    );
  }
  return Object.freeze({
    browserVersion: options.browserVersion,
    browserRevision: options.browserRevision,
    refreshPeriodUs: options.refreshPeriodUs,
    windowId: options.windowId,
    profileId: options.profileId,
  });
}

function parseTraceInput(input) {
  let bytes;
  if (typeof input === 'string') {
    bytes = Buffer.from(input, 'utf8');
  } else if (Buffer.isBuffer(input)) {
    bytes = input;
  } else if (ArrayBuffer.isView(input)) {
    bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  } else if (input instanceof ArrayBuffer) {
    bytes = Buffer.from(input);
  } else if (isRecord(input)) {
    return input;
  } else {
    reject(
      'BOM_F3_TRACE_INPUT_INVALID',
      'Trace input must be a parsed object, JSON string, Buffer, or ArrayBuffer view.',
      { inputType: input === null ? 'null' : typeof input },
    );
  }
  try {
    const decoded = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes)
      : bytes;
    return JSON.parse(decoded.toString('utf8'));
  } catch (error) {
    reject(
      'BOM_F3_TRACE_JSON_INVALID',
      'Trace input is not valid Chromium trace JSON.',
      {
        error: error instanceof Error ? error.message : String(error),
        compressed: bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b,
      },
    );
  }
}

export function getCompositorTraceProfileId(browserVersion) {
  const browserMajor = parseBrowserMajor(browserVersion);
  return TRACE_SCHEMA_PROFILES.find((profile) => profile.browserMajor === browserMajor)?.id ?? null;
}

/**
 * Performs the inexpensive part of compositor qualification without requiring
 * a marked scroll window or presented-frame pairing. Formal runners use this
 * before the long evidence sequence to reject a refresh-lock mismatch early.
 */
export function inspectCompositorTraceCadence({
  traceInput,
  browserVersion,
  browserRevision,
  refreshPeriodUs,
  profileId,
}) {
  const configuration = validateExtractionOptions({
    traceInput,
    browserVersion,
    browserRevision,
    refreshPeriodUs,
    profileId,
    windowId: 'cadence-precheck',
  });
  const trace = parseTraceInput(traceInput);
  const profile = selectTraceProfile(configuration);
  const root = validateTraceRoot(trace);
  const source = validateTraceMetadata(root.metadata, configuration, profile);
  const traceIntegrity = validateTraceIntegrity(root.metadata);
  const indexedEvents = root.traceEvents.map((event, index) => ({ event, index }));
  const cadence = validateRefreshCadence(
    indexedEvents,
    profile,
    configuration.refreshPeriodUs,
  );
  return Object.freeze({
    profileId: profile.id,
    browserProduct: source.browserProduct,
    browserRevision: source.browserRevision,
    traceRevision: source.traceRevision,
    traceEventCount: indexedEvents.length,
    traceIntegrity,
    cadence,
  });
}

function selectTraceProfile(configuration) {
  const browserMajor = parseBrowserMajor(configuration.browserVersion);
  if (browserMajor === null) {
    reject(
      'BOM_F3_TRACE_BROWSER_VERSION_INVALID',
      'Browser version must be Browser.getVersion product syntax.',
      { browserVersion: configuration.browserVersion },
    );
  }
  const selected = configuration.profileId === undefined
    ? TRACE_SCHEMA_PROFILES.find((profile) => profile.browserMajor === browserMajor)
    : TRACE_SCHEMA_PROFILES.find((profile) => profile.id === configuration.profileId);
  if (selected === undefined) {
    reject(
      'BOM_F3_TRACE_PROFILE_UNSUPPORTED',
      'No certified compositor trace schema profile matches this browser build.',
      {
        requestedProfileId: configuration.profileId ?? null,
        browserVersion: configuration.browserVersion,
        browserRevision: configuration.browserRevision,
        supportedProfiles: listCompositorTraceSchemaProfiles(),
      },
    );
  }
  if (
    selected.browserProduct !== configuration.browserVersion ||
    selected.browserRevision !== configuration.browserRevision
  ) {
    reject(
      'BOM_F3_TRACE_BROWSER_BUILD_UNSUPPORTED',
      'The browser product or revision does not exactly match the selected certified profile.',
      {
        profileId: selected.id,
        expectedBrowserProduct: selected.browserProduct,
        observedBrowserProduct: configuration.browserVersion,
        expectedBrowserRevision: selected.browserRevision,
        observedBrowserRevision: configuration.browserRevision,
      },
    );
  }
  if (Math.abs(configuration.refreshPeriodUs - selected.refreshPeriodUs) > 0.001) {
    reject(
      'BOM_F3_TRACE_REFRESH_PERIOD_PROFILE_MISMATCH',
      'The caller-supplied refresh period does not match the certified profile lock.',
      {
        profileId: selected.id,
        expectedRefreshPeriodUs: selected.refreshPeriodUs,
        observedRefreshPeriodUs: configuration.refreshPeriodUs,
      },
    );
  }
  return selected;
}

function validateTraceRoot(trace) {
  if (!isRecord(trace)) {
    reject('BOM_F3_TRACE_ROOT_INVALID', 'Chromium trace root must be an object.');
  }
  if (!Array.isArray(trace.traceEvents)) {
    reject(
      'BOM_F3_TRACE_EVENTS_MISSING',
      'Chromium trace root must contain a traceEvents array.',
      { rootKeys: Object.keys(trace) },
    );
  }
  if (!isRecord(trace.metadata)) {
    reject(
      'BOM_F3_TRACE_METADATA_MISSING',
      'Chromium trace root must contain metadata.',
      { rootKeys: Object.keys(trace) },
    );
  }
  return trace;
}

function validateTraceMetadata(metadata, configuration, profile) {
  const userAgent = metadata['user-agent'];
  const clockDomain = metadata['clock-domain'];
  const traceRevision = metadata.revision;
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    reject(
      'BOM_F3_TRACE_METADATA_SCHEMA_MISMATCH',
      'Trace metadata user-agent is missing.',
      { metadataKeys: Object.keys(metadata) },
    );
  }
  if (clockDomain !== profile.clockDomain) {
    reject(
      'BOM_F3_TRACE_METADATA_SCHEMA_MISMATCH',
      'Trace metadata clock-domain does not match the selected certified profile.',
      { expectedClockDomain: profile.clockDomain, observedClockDomain: clockDomain ?? null },
    );
  }
  if (
    typeof traceRevision !== 'string' ||
    traceRevision !== profile.traceMetadataRevision
  ) {
    reject(
      'BOM_F3_TRACE_METADATA_REVISION_MISMATCH',
      'Trace metadata revision does not match the selected certified profile.',
      {
        expectedRevision: profile.traceMetadataRevision,
        observedRevision: traceRevision ?? null,
      },
    );
  }
  const userAgentMajor = parseChromiumUserAgentMajor(userAgent);
  if (userAgentMajor !== profile.browserMajor) {
    reject(
      'BOM_F3_TRACE_METADATA_BROWSER_MISMATCH',
      'Trace user-agent does not match the selected schema profile.',
      {
        userAgent,
        observedMajor: userAgentMajor,
        expectedMajor: profile.browserMajor,
      },
    );
  }
  return {
    browserProduct: configuration.browserVersion,
    browserRevision: configuration.browserRevision,
    traceUserAgent: userAgent,
    traceClockDomain: clockDomain,
    traceRevision,
    timestampUnit: profile.timestampUnit,
  };
}

function validateTraceIntegrity(metadata) {
  const stats = metadata.trace_processor_stats;
  if (!isRecord(stats)) {
    reject(
      'BOM_F3_TRACE_INTEGRITY_SCHEMA_MISMATCH',
      'Trace processor integrity statistics are missing.',
      { metadataKeys: Object.keys(metadata) },
    );
  }
  const checked = {};
  for (const field of TRACE_STATS_ZERO_FIELDS) {
    const value = stats[field];
    if (!Number.isSafeInteger(value) || value < 0) {
      reject(
        'BOM_F3_TRACE_INTEGRITY_SCHEMA_MISMATCH',
        'A required trace integrity counter is missing or invalid.',
        { field: 'metadata.trace_processor_stats.' + field, value: value ?? null },
      );
    }
    checked[field] = value;
    if (value !== 0) {
      reject(
        'BOM_F3_TRACE_DATA_LOSS',
        'Trace integrity statistics report lost, skipped, or malformed data.',
        { field: 'metadata.trace_processor_stats.' + field, value },
      );
    }
  }
  if (!Array.isArray(stats.traced_buf) || stats.traced_buf.length === 0) {
    reject(
      'BOM_F3_TRACE_INTEGRITY_SCHEMA_MISMATCH',
      'Trace buffer integrity statistics are missing.',
      { field: 'metadata.trace_processor_stats.traced_buf' },
    );
  }
  const buffers = stats.traced_buf.map((buffer, index) => {
    if (!isRecord(buffer)) {
      reject(
        'BOM_F3_TRACE_INTEGRITY_SCHEMA_MISMATCH',
        'A trace buffer integrity entry is invalid.',
        { index, value: buffer ?? null },
      );
    }
    const normalized = {};
    for (const field of TRACE_BUFFER_ZERO_FIELDS) {
      const value = buffer[field];
      if (!Number.isSafeInteger(value) || value < 0) {
        reject(
          'BOM_F3_TRACE_INTEGRITY_SCHEMA_MISMATCH',
          'A required trace buffer integrity counter is missing or invalid.',
          {
            field: 'metadata.trace_processor_stats.traced_buf[' + index + '].' + field,
            value: value ?? null,
          },
        );
      }
      normalized[field] = value;
      if (value !== 0) {
        reject(
          'BOM_F3_TRACE_DATA_LOSS',
          'A trace buffer reports overwritten, discarded, or lost data.',
          {
            field: 'metadata.trace_processor_stats.traced_buf[' + index + '].' + field,
            value,
          },
        );
      }
    }
    return Object.freeze(normalized);
  });
  return Object.freeze({
    status: 'complete',
    counters: Object.freeze(checked),
    buffers: Object.freeze(buffers),
  });
}

function extractMarkerWindow(indexedEvents, profile, windowId) {
  const names = createScrollTraceWindowNames(windowId);
  const starts = indexedEvents.filter(({ event }) => event?.name === names.start);
  const ends = indexedEvents.filter(({ event }) => event?.name === names.end);
  if (starts.length !== 1 || ends.length !== 1) {
    reject(
      'BOM_F3_TRACE_SCROLL_WINDOW_MARKER_COUNT_INVALID',
      'The trace must contain exactly one start and one end marker for the scrolling window.',
      {
        windowId,
        startMarker: names.start,
        endMarker: names.end,
        startCount: starts.length,
        endCount: ends.length,
        startRawEventIndexes: starts.map((entry) => entry.index),
        endRawEventIndexes: ends.map((entry) => entry.index),
      },
    );
  }
  const start = validateMarkerEvent(starts[0], profile, names.start);
  const end = validateMarkerEvent(ends[0], profile, names.end);
  if (
    start.pid !== end.pid ||
    start.tid !== end.tid ||
    start.navigationId !== end.navigationId
  ) {
    reject(
      'BOM_F3_TRACE_SCROLL_WINDOW_MARKER_REALM_MISMATCH',
      'Scrolling window markers must originate from the same renderer track and navigation.',
      { start, end },
    );
  }
  if (start.timestampUs >= end.timestampUs) {
    reject(
      'BOM_F3_TRACE_SCROLL_WINDOW_INVALID',
      'Scrolling window start must precede its end.',
      { startTimestampUs: start.timestampUs, endTimestampUs: end.timestampUs },
    );
  }
  if (end.timestampUs - start.timestampUs < profile.minimumScrollWindowDurationUs) {
    reject(
      'BOM_F3_TRACE_SCROLL_WINDOW_TOO_SHORT',
      'The marked scrolling window is shorter than the certified F3 duration.',
      {
        durationUs: end.timestampUs - start.timestampUs,
        minimumDurationUs: profile.minimumScrollWindowDurationUs,
      },
    );
  }
  if (end.timestampUs - start.timestampUs > profile.maximumScrollWindowDurationUs) {
    reject(
      'BOM_F3_TRACE_SCROLL_WINDOW_TOO_LONG',
      'The marked scrolling window exceeds the certified F3 duration tolerance.',
      {
        durationUs: end.timestampUs - start.timestampUs,
        maximumDurationUs: profile.maximumScrollWindowDurationUs,
      },
    );
  }
  return Object.freeze({
    id: windowId,
    startMark: names.start,
    endMark: names.end,
    startTimestampUs: start.timestampUs,
    endTimestampUs: end.timestampUs,
    durationUs: end.timestampUs - start.timestampUs,
    markerPid: start.pid,
    markerTid: start.tid,
    navigationId: start.navigationId,
    rawEventIndexes: Object.freeze([start.rawEventIndex, end.rawEventIndex]),
  });
}

function validateMarkerEvent(indexed, profile, expectedName) {
  const event = validateCommonTraceEvent(
    indexed,
    'BOM_F3_TRACE_SCROLL_WINDOW_MARKER_SCHEMA_MISMATCH',
  );
  if (
    event.name !== expectedName ||
    event.cat !== profile.marker.category ||
    event.ph !== profile.marker.phase ||
    event.s !== 't' ||
    !isRecord(event.args) ||
    !isRecord(event.args.data)
  ) {
    rejectEventSchema(
      'BOM_F3_TRACE_SCROLL_WINDOW_MARKER_SCHEMA_MISMATCH',
      'A scrolling User Timing marker does not match the selected profile.',
      indexed,
    );
  }
  const data = event.args.data;
  if (
    !Number.isFinite(data.callTime) ||
    !Number.isFinite(data.startTime) ||
    !Number.isFinite(data.sampleTraceId) ||
    typeof data.navigationId !== 'string' ||
    data.navigationId.length === 0
  ) {
    rejectEventSchema(
      'BOM_F3_TRACE_SCROLL_WINDOW_MARKER_SCHEMA_MISMATCH',
      'A scrolling User Timing marker is missing required data fields.',
      indexed,
    );
  }
  return Object.freeze({
    timestampUs: event.ts,
    pid: event.pid,
    tid: event.tid,
    navigationId: data.navigationId,
    rawEventIndex: indexed.index,
  });
}

function extractDisplayFrames(indexedEvents, profile) {
  const candidates = indexedEvents.filter(
    ({ event }) => event?.name === profile.presented.name,
  );
  if (candidates.length === 0) {
    reject(
      'BOM_F3_TRACE_PRESENTED_EVENT_MISSING',
      'No authoritative compositor displayed-frame events were found; RAF fallback is forbidden.',
      {
        expectedEvent: profile.presented,
        nonAuthoritativeFrameEvents: countNonAuthoritativeFrameEvents(indexedEvents),
      },
    );
  }
  const byTimestamp = new Map();
  const tracks = new Set();
  for (const indexed of candidates) {
    const event = validateCommonTraceEvent(
      indexed,
      'BOM_F3_TRACE_PRESENTED_EVENT_SCHEMA_MISMATCH',
    );
    if (
      event.cat !== profile.presented.category ||
      event.ph !== profile.presented.phase ||
      event.s !== 't' ||
      !isRecord(event.args) ||
      Object.keys(event.args).length !== 0
    ) {
      rejectEventSchema(
        'BOM_F3_TRACE_PRESENTED_EVENT_SCHEMA_MISMATCH',
        'A displayed-frame event does not match the selected profile.',
        indexed,
      );
    }
    tracks.add(event.pid + ':' + event.tid);
    const entries = byTimestamp.get(event.ts) ?? [];
    entries.push(indexed.index);
    byTimestamp.set(event.ts, entries);
  }
  if (tracks.size !== 1) {
    reject(
      'BOM_F3_TRACE_DISPLAY_TRACK_AMBIGUOUS',
      'Displayed-frame events span multiple compositor tracks.',
      { tracks: [...tracks].sort(), rawEventCount: candidates.length },
    );
  }
  const unique = [...byTimestamp.entries()]
    .sort(([left], [right]) => left - right)
    .map(([timestampUs, rawEventIndexes]) => Object.freeze({
      timestampUs,
      rawEventIndexes: Object.freeze([...rawEventIndexes].sort((left, right) => left - right)),
    }));
  return Object.freeze({
    rawCount: candidates.length,
    duplicateCount: candidates.length - unique.length,
    unique: Object.freeze(unique),
  });
}

function validateRefreshCadence(indexedEvents, profile, refreshPeriodUs) {
  const candidates = indexedEvents.filter(
    ({ event }) => event?.name === profile.beginFrameSource.name,
  );
  if (candidates.length === 0) {
    reject(
      'BOM_F3_TRACE_REFRESH_CADENCE_MISSING',
      'The trace has no ExternalBeginFrameSource cadence evidence.',
      { expectedEvent: profile.beginFrameSource },
    );
  }
  const observedIntervals = new Set();
  for (const indexed of candidates) {
    const event = validateCommonTraceEvent(
      indexed,
      'BOM_F3_TRACE_REFRESH_CADENCE_SCHEMA_MISMATCH',
    );
    const beginFrameArgs = event.args?.begin_frame_args;
    if (
      event.cat !== profile.beginFrameSource.category ||
      event.ph !== profile.beginFrameSource.phase ||
      !Number.isSafeInteger(event.dur) ||
      event.dur < 0 ||
      !isRecord(beginFrameArgs) ||
      !Number.isSafeInteger(beginFrameArgs.frame_time_us) ||
      !Number.isSafeInteger(beginFrameArgs.interval_delta_us)
    ) {
      rejectEventSchema(
        'BOM_F3_TRACE_REFRESH_CADENCE_SCHEMA_MISMATCH',
        'An ExternalBeginFrameSource event does not match the selected profile.',
        indexed,
      );
    }
    observedIntervals.add(beginFrameArgs.interval_delta_us);
    if (beginFrameArgs.interval_delta_us !== profile.traceRefreshIntervalUs) {
      reject(
        'BOM_F3_TRACE_REFRESH_CADENCE_MISMATCH',
        'Trace begin-frame cadence differs from the certified refresh lock.',
        {
          rawEventIndex: indexed.index,
          observedIntervalUs: beginFrameArgs.interval_delta_us,
          expectedTraceIntervalUs: profile.traceRefreshIntervalUs,
          callerRefreshPeriodUs: refreshPeriodUs,
        },
      );
    }
  }
  return Object.freeze({
    event: profile.beginFrameSource.name,
    sampleCount: candidates.length,
    observedIntervalUs: Object.freeze([...observedIntervals].sort((left, right) => left - right)),
    expectedTraceIntervalUs: profile.traceRefreshIntervalUs,
    profileRefreshPeriodUs: profile.refreshPeriodUs,
  });
}

function extractPipelineReporterPairs(indexedEvents, profile) {
  const candidates = indexedEvents.filter(
    ({ event }) => event?.name === profile.pipelineReporter.name,
  );
  if (candidates.length === 0) {
    reject(
      'BOM_F3_TRACE_PIPELINE_REPORTER_MISSING',
      'PipelineReporter evidence required for blank-frame classification is missing.',
    );
  }
  const groups = new Map();
  for (const indexed of candidates) {
    const event = validateCommonTraceEvent(
      indexed,
      'BOM_F3_TRACE_PIPELINE_REPORTER_SCHEMA_MISMATCH',
    );
    if (
      event.cat !== profile.pipelineReporter.category ||
      (event.ph !== profile.pipelineReporter.beginPhase &&
        event.ph !== profile.pipelineReporter.endPhase) ||
      !isRecord(event.id2) ||
      typeof event.id2.local !== 'string' ||
      event.id2.local.length === 0 ||
      !isRecord(event.args)
    ) {
      rejectEventSchema(
        'BOM_F3_TRACE_PIPELINE_REPORTER_SCHEMA_MISMATCH',
        'A PipelineReporter event does not match the selected profile.',
        indexed,
      );
    }
    let reporter = null;
    if (event.ph === profile.pipelineReporter.beginPhase) {
      reporter = validatePipelineReporterPayload(indexed, profile);
    } else if (Object.keys(event.args).length !== 0) {
      rejectEventSchema(
        'BOM_F3_TRACE_PIPELINE_REPORTER_SCHEMA_MISMATCH',
        'A PipelineReporter end event has unexpected payload fields.',
        indexed,
      );
    }
    const key = event.pid + ':' + event.id2.local;
    const group = groups.get(key) ?? [];
    group.push(Object.freeze({ indexed, reporter }));
    groups.set(key, group);
  }

  const pairs = [];
  const unmatchedBegins = [];
  const unmatchedEnds = [];
  for (const [key, records] of groups) {
    const stack = [];
    for (const record of records) {
      if (record.indexed.event.ph === profile.pipelineReporter.beginPhase) {
        stack.push(record);
      } else {
        const begin = stack.pop();
        if (begin === undefined) {
          unmatchedEnds.push(record.indexed.index);
        } else {
          pairs.push(Object.freeze({
            key,
            beginEvent: begin.indexed.event,
            beginEventIndex: begin.indexed.index,
            endEvent: record.indexed.event,
            endEventIndex: record.indexed.index,
            reporter: begin.reporter,
          }));
        }
      }
    }
    unmatchedBegins.push(...stack.map((record) => record.indexed.index));
  }
  if (unmatchedBegins.length > 0 || unmatchedEnds.length > 0) {
    reject(
      'BOM_F3_TRACE_PIPELINE_REPORTER_UNPAIRED',
      'PipelineReporter begin/end events are incomplete; blank-frame evidence is uncertifiable.',
      {
        unmatchedBeginRawEventIndexes: unmatchedBegins.sort((left, right) => left - right),
        unmatchedEndRawEventIndexes: unmatchedEnds.sort((left, right) => left - right),
      },
    );
  }

  const presentedPairs = pairs.filter((pair) =>
    profile.pipelineReporter.presentedStates.includes(pair.reporter.state));
  const presentedByEndTimestamp = new Map();
  for (const pair of presentedPairs) {
    const timestampUs = pair.endEvent.ts;
    const entries = presentedByEndTimestamp.get(timestampUs) ?? [];
    entries.push(pair);
    presentedByEndTimestamp.set(timestampUs, entries);
  }
  return Object.freeze({
    pairCount: pairs.length,
    presentedPairCount: presentedPairs.length,
    presentedByEndTimestamp,
  });
}

function validatePipelineReporterPayload(indexed, profile) {
  const reporter = indexed.event.args.frame_reporter;
  if (!isRecord(reporter)) {
    rejectEventSchema(
      'BOM_F3_TRACE_PIPELINE_REPORTER_SCHEMA_MISMATCH',
      'PipelineReporter begin payload is missing frame_reporter.',
      indexed,
    );
  }
  const booleanFields = [
    'checkerboarded_needs_raster',
    'checkerboarded_needs_record',
    'has_missing_content',
  ];
  const numericFields = [
    'frame_sequence',
    'frame_source',
    'layer_tree_host_id',
    'surface_frame_trace_id',
  ];
  if (
    !booleanFields.every((field) => typeof reporter[field] === 'boolean') ||
    !numericFields.every((field) => Number.isFinite(reporter[field])) ||
    typeof reporter.scroll_state !== 'string' ||
    !profile.pipelineReporter.states.includes(reporter.state)
  ) {
    rejectEventSchema(
      'BOM_F3_TRACE_PIPELINE_REPORTER_SCHEMA_MISMATCH',
      'PipelineReporter payload fields or state do not match the selected profile.',
      indexed,
    );
  }
  if (
    profile.pipelineReporter.presentedStates.includes(reporter.state) &&
    !Number.isFinite(reporter.display_trace_id)
  ) {
    rejectEventSchema(
      'BOM_F3_TRACE_PIPELINE_REPORTER_SCHEMA_MISMATCH',
      'A presented PipelineReporter is missing display_trace_id.',
      indexed,
    );
  }
  return reporter;
}

function validateDisplayReporterSet(displayFrames, presentedByEndTimestamp) {
  const displayTimestamps = displayFrames.map((frame) => frame.timestampUs);
  const reporterTimestamps = [...presentedByEndTimestamp.keys()].sort((left, right) => left - right);
  const reporterSet = new Set(reporterTimestamps);
  const displaySet = new Set(displayTimestamps);
  const missingReporterTimestampsUs = displayTimestamps.filter(
    (timestamp) => !reporterSet.has(timestamp),
  );
  const missingDisplayTimestampsUs = reporterTimestamps.filter(
    (timestamp) => !displaySet.has(timestamp),
  );
  if (missingReporterTimestampsUs.length > 0 || missingDisplayTimestampsUs.length > 0) {
    reject(
      'BOM_F3_TRACE_DISPLAY_REPORTER_SET_MISMATCH',
      'Displayed timestamps and paired presented PipelineReporter end timestamps differ.',
      {
        displayTimestampCount: displayTimestamps.length,
        reporterTimestampCount: reporterTimestamps.length,
        missingReporterTimestampsUs,
        missingDisplayTimestampsUs,
      },
    );
  }
}

function normalizeReporterEvidence(pair) {
  const reporter = pair.reporter;
  return Object.freeze({
    state: reporter.state,
    frameSequence: reporter.frame_sequence,
    frameSource: reporter.frame_source,
    layerTreeHostId: reporter.layer_tree_host_id,
    hasMissingContent: reporter.has_missing_content,
    checkerboardedNeedsRaster: reporter.checkerboarded_needs_raster,
    checkerboardedNeedsRecord: reporter.checkerboarded_needs_record,
    beginTimestampUs: pair.beginEvent.ts,
    endTimestampUs: pair.endEvent.ts,
    beginRawEventIndex: pair.beginEventIndex,
    endRawEventIndex: pair.endEventIndex,
  });
}

function countNonAuthoritativeFrameEvents(indexedEvents) {
  const names = [
    'AnimationFrame',
    'AnimationFrame::Presentation',
    'BeginFrame',
    'FireAnimationFrame',
    'FramePresented',
    'RequestAnimationFrame',
  ];
  const counts = Object.fromEntries(names.map((name) => [name, 0]));
  for (const { event } of indexedEvents) {
    if (isRecord(event) && Object.hasOwn(counts, event.name)) {
      counts[event.name] += 1;
    }
  }
  return Object.freeze({
    ...counts,
    usedAsPresentationFallback: false,
  });
}

function validateCommonTraceEvent(indexed, code) {
  const event = indexed.event;
  if (
    !isRecord(event) ||
    typeof event.name !== 'string' ||
    typeof event.cat !== 'string' ||
    typeof event.ph !== 'string' ||
    !Number.isSafeInteger(event.ts) ||
    event.ts < 0 ||
    !Number.isSafeInteger(event.pid) ||
    event.pid < 0 ||
    !Number.isSafeInteger(event.tid) ||
    event.tid < 0
  ) {
    rejectEventSchema(
      code,
      'A recognized trace event is missing required common fields.',
      indexed,
    );
  }
  return event;
}

function rejectEventSchema(code, message, indexed) {
  reject(code, message, {
    rawEventIndex: indexed.index,
    rawEvent: indexed.event,
  });
}

function parseBrowserMajor(value) {
  const match = /^(?:Chrome\/)?([0-9]+)\./u.exec(value);
  return match === null ? null : Number(match[1]);
}

function parseChromiumUserAgentMajor(value) {
  const match = /(?:HeadlessChrome|Chrome)\/([0-9]+)\./u.exec(value);
  return match === null ? null : Number(match[1]);
}

function adjacentDifferences(values) {
  return values.slice(1).map((value, index) => value - values[index]);
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function reject(code, message, diagnostics = {}) {
  throw new CompositorTraceExtractionError(code, message, diagnostics);
}

export async function startCompositorTrace(browserSession) {
  let completionResolve;
  let completionReject;
  const completion = new Promise((resolve, reject) => {
    completionResolve = resolve;
    completionReject = reject;
  });
  const onComplete = (event) => completionResolve(event);
  const onError = (error) => completionReject(error);
  browserSession.once('Tracing.tracingComplete', onComplete);
  browserSession.once('error', onError);
  try {
    await browserSession.send('Tracing.start', {
      // TraceConfig is the current CDP configuration surface. Do not combine
      // it with the legacy categories/options parameters: Chrome rejects that
      // ambiguous request.
      traceConfig: TRACE_CONFIG,
      transferMode: 'ReturnAsStream',
    });
  } catch (error) {
    browserSession.off('Tracing.tracingComplete', onComplete);
    browserSession.off('error', onError);
    throw error;
  }
  let stopped = false;
  return Object.freeze({
    categories: TRACE_CATEGORIES,
    async stop() {
      if (stopped) throw new Error('BOM_F3_TRACE_ALREADY_STOPPED');
      stopped = true;
      await browserSession.send('Tracing.end');
      const event = await withTimeout(completion, 30_000, 'Tracing.tracingComplete');
      if (typeof event.stream !== 'string') {
        throw new Error('BOM_F3_TRACE_STREAM_MISSING');
      }
      const chunks = [];
      try {
        for (;;) {
          const result = await browserSession.send('IO.read', { handle: event.stream });
          chunks.push(
            result.base64Encoded === true
              ? Buffer.from(result.data, 'base64')
              : Buffer.from(result.data, 'utf8'),
          );
          if (result.eof === true) break;
        }
      } finally {
        await browserSession.send('IO.close', { handle: event.stream }).catch(() => undefined);
        browserSession.off('error', onError);
      }
      return Buffer.concat(chunks);
    },
  });
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
