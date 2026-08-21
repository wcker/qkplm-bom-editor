import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import test from 'node:test';

import {
  CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID,
  CHROMIUM_151_COMPOSITOR_TRACE_PROFILE_ID,
  COMPOSITOR_TRACE_EVIDENCE_SCHEMA_VERSION,
  COMPOSITOR_TRACE_EXTRACTOR_ID,
  CompositorTraceExtractionError,
  createScrollTraceWindowNames,
  extractCompositorPresentedFrameEvidence,
  inspectCompositorTraceCadence,
  listCompositorTraceSchemaProfiles,
  startCompositorTrace,
} from '../scripts/lib/trace.mjs';

const fixtureUrl = new URL(
  './fixtures/chromium-150-presented-frames.json',
  import.meta.url,
);
const fixtureText = await readFile(fixtureUrl, 'utf8');
const fixture = JSON.parse(fixtureText);
const options = Object.freeze({
  browserVersion: 'Chrome/150.0.7871.127',
  browserRevision: '@86e682ff10b168a25994de599ae5794936efe46a',
  refreshPeriodUs: 1_000_000 / 60,
  windowId: 'fixture-window',
});

test('trace capture uses an explicit non-ring-buffer CDP TraceConfig', async () => {
  class FakeBrowserSession extends EventEmitter {
    calls = [];

    async send(method, params) {
      this.calls.push({ method, params });
      if (method === 'Tracing.end') {
        queueMicrotask(() => {
          this.emit('Tracing.tracingComplete', { stream: 'trace-stream' });
        });
      }
      if (method === 'IO.read') return { data: '{}', eof: true };
      return {};
    }
  }

  const session = new FakeBrowserSession();
  const controller = await startCompositorTrace(session);
  const start = session.calls.find((call) => call.method === 'Tracing.start');
  assert.ok(start);
  assert.equal('categories' in start.params, false);
  assert.equal('options' in start.params, false);
  assert.equal(start.params.transferMode, 'ReturnAsStream');
  assert.deepEqual(start.params.traceConfig, {
    recordMode: 'recordUntilFull',
    includedCategories: [
      'blink.user_timing',
      'viz',
      'disabled-by-default-display.framedisplayed',
      'disabled-by-default-devtools.timeline.frame',
    ],
    traceBufferSizeInKb: 65_536,
  });
  await controller.stop();
});

test('Chrome 150 profile extracts deduplicated presented frames from a closed 30s window', () => {
  const evidence = extractCompositorPresentedFrameEvidence(fixture, options);

  assert.equal(evidence.schemaVersion, COMPOSITOR_TRACE_EVIDENCE_SCHEMA_VERSION);
  assert.deepEqual(evidence.extractor, {
    id: COMPOSITOR_TRACE_EXTRACTOR_ID,
    profileId: CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID,
    certified: true,
  });
  assert.equal(evidence.window.durationUs, 30_000_000);
  assert.equal(evidence.window.boundary, 'closed');
  assert.equal(evidence.window.presentationCoverage.startBoundaryGapUs, 0);
  assert.equal(evidence.window.presentationCoverage.endBoundaryGapUs, 0);
  assert.deepEqual(evidence.presentedFrames.timestampsUs, [
    1_000_000,
    1_016_667,
    1_050_001,
    1_066_668,
    31_000_000,
  ]);
  assert.deepEqual(evidence.presentedFrames.intervalsUs, [
    16_667,
    33_334,
    16_667,
    29_933_332,
  ]);
  assert.equal(evidence.presentedFrames.duplicateEventCount, 2);
  assert.equal(evidence.missedVsync.count, 1_796);
  assert.equal(evidence.missingOrCheckerboardFrames.count, 1);
  assert.deepEqual(evidence.missingOrCheckerboardFrames.timestampsUs, [1_050_001]);
  assert.equal(
    'applicationPixelBlankFrameCount' in
      evidence.missingOrCheckerboardFrames,
    false,
  );
  assert.equal(
    evidence.missingOrCheckerboardFrames.evidence[1].reporterCount,
    2,
  );
  assert.equal(evidence.refresh.traceCadence.sampleCount, 2);
  assert.deepEqual(evidence.refresh.traceCadence.observedIntervalUs, [16_667]);
  assert.equal(
    evidence.diagnostics.nonAuthoritativeFrameEvents.FireAnimationFrame,
    1,
  );
  assert.equal(
    evidence.diagnostics.nonAuthoritativeFrameEvents.usedAsPresentationFallback,
    false,
  );
});

test('Chrome 151 profile accepts the current browser revision with the same event schema', () => {
  const chrome151Fixture = structuredClone(fixture);
  chrome151Fixture.metadata.revision =
    '4744b886309d987d292e43232776d2206cccb13d-refs/branch-heads/7922@{#2606}';
  chrome151Fixture.metadata['user-agent'] =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36';
  const evidence = extractCompositorPresentedFrameEvidence(chrome151Fixture, {
    ...options,
    browserVersion: 'Chrome/151.0.7922.108',
    browserRevision: '@4744b886309d987d292e43232776d2206cccb13d',
  });

  assert.equal(
    evidence.extractor.profileId,
    CHROMIUM_151_COMPOSITOR_TRACE_PROFILE_ID,
  );
  assert.equal(evidence.source.browserProduct, 'Chrome/151.0.7922.108');
  assert.equal(evidence.presentedFrames.count, 5);
});

test('extractor accepts JSON and gzip bytes without changing fixture evidence', () => {
  const fromJson = extractCompositorPresentedFrameEvidence(fixtureText, options);
  const fromGzip = extractCompositorPresentedFrameEvidence(
    gzipSync(Buffer.from(fixtureText, 'utf8')),
    options,
  );

  assert.deepEqual(fromGzip.presentedFrames, fromJson.presentedFrames);
  assert.deepEqual(fromGzip.missedVsync, fromJson.missedVsync);
});

test('cadence precheck validates profile and refresh lock without scroll markers', () => {
  const precheck = inspectCompositorTraceCadence({
    traceInput: gzipSync(Buffer.from(fixtureText, 'utf8')),
    browserVersion: options.browserVersion,
    browserRevision: options.browserRevision,
    refreshPeriodUs: options.refreshPeriodUs,
  });

  assert.equal(precheck.profileId, CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID);
  assert.equal(precheck.traceEventCount, fixture.traceEvents.length);
  assert.deepEqual(precheck.cadence.observedIntervalUs, [16_667]);
  assert.equal(precheck.traceIntegrity.status, 'complete');
});

test('cadence precheck rejects a refresh mismatch before marker extraction', () => {
  const wrongCadence = structuredClone(fixture);
  wrongCadence.traceEvents.find(
    (event) => event.name === 'ExternalBeginFrameSource::OnBeginFrame',
  ).args.begin_frame_args.interval_delta_us = 33_334;
  expectCode(
    () => inspectCompositorTraceCadence({
      traceInput: wrongCadence,
      browserVersion: options.browserVersion,
      browserRevision: options.browserRevision,
      refreshPeriodUs: options.refreshPeriodUs,
    }),
    'BOM_F3_TRACE_REFRESH_CADENCE_MISMATCH',
  );
});

test('complete reporter pairs outside the marker window do not poison window evidence', () => {
  const withPreWindowReporter = structuredClone(fixture);
  const template = withPreWindowReporter.traceEvents.filter(
    (event) => event.name === 'PipelineReporter',
  ).slice(0, 2);
  const begin = structuredClone(template[0]);
  const end = structuredClone(template[1]);
  begin.id2.local = '0xoutside';
  end.id2.local = '0xoutside';
  begin.ts = 500_000;
  end.ts = 510_000;
  withPreWindowReporter.traceEvents.push(begin, end);

  const evidence = extractCompositorPresentedFrameEvidence(
    withPreWindowReporter,
    options,
  );
  assert.equal(evidence.presentedFrames.count, 5);
  assert.equal(evidence.window.startTimestampUs, 1_000_000);
});

test('profile identity and trace schema changes fail closed', () => {
  expectCode(
    () => extractCompositorPresentedFrameEvidence(fixture, {
      ...options,
      browserVersion: 'Chrome/152.0.8000.0',
    }),
    'BOM_F3_TRACE_PROFILE_UNSUPPORTED',
  );
  expectCode(
    () => extractCompositorPresentedFrameEvidence(fixture, {
      ...options,
      browserRevision: '@different',
    }),
    'BOM_F3_TRACE_BROWSER_BUILD_UNSUPPORTED',
  );

  const wrongMetadataRevision = structuredClone(fixture);
  wrongMetadataRevision.metadata.revision = 'different';
  expectCode(
    () => extractCompositorPresentedFrameEvidence(wrongMetadataRevision, options),
    'BOM_F3_TRACE_METADATA_REVISION_MISMATCH',
  );

  const missingBlankField = structuredClone(fixture);
  const reporter = missingBlankField.traceEvents.find(
    (event) => event.name === 'PipelineReporter' && event.ph === 'b',
  );
  delete reporter.args.frame_reporter.has_missing_content;
  expectCode(
    () => extractCompositorPresentedFrameEvidence(missingBlankField, options),
    'BOM_F3_TRACE_PIPELINE_REPORTER_SCHEMA_MISMATCH',
  );

  const missingPresentedTimestamp = structuredClone(fixture);
  const displayed = missingPresentedTimestamp.traceEvents.find(
    (event) => event.name === 'Display::FrameDisplayed',
  );
  delete displayed.ts;
  expectCode(
    () => extractCompositorPresentedFrameEvidence(missingPresentedTimestamp, options),
    'BOM_F3_TRACE_PRESENTED_EVENT_SCHEMA_MISMATCH',
  );
});

test('refresh lock, cadence, trace loss, pairing, and boundary coverage fail closed', () => {
  expectCode(
    () => extractCompositorPresentedFrameEvidence(fixture, {
      ...options,
      refreshPeriodUs: (1_000_000 / 60) * 2,
    }),
    'BOM_F3_TRACE_REFRESH_PERIOD_PROFILE_MISMATCH',
  );

  const wrongCadence = structuredClone(fixture);
  wrongCadence.traceEvents.find(
    (event) => event.name === 'ExternalBeginFrameSource::OnBeginFrame',
  ).args.begin_frame_args.interval_delta_us = 33_334;
  expectCode(
    () => extractCompositorPresentedFrameEvidence(wrongCadence, options),
    'BOM_F3_TRACE_REFRESH_CADENCE_MISMATCH',
  );

  const lossy = structuredClone(fixture);
  lossy.metadata.trace_processor_stats.traced_buf[0].bytes_overwritten = 1;
  expectCode(
    () => extractCompositorPresentedFrameEvidence(lossy, options),
    'BOM_F3_TRACE_DATA_LOSS',
  );

  const unpaired = structuredClone(fixture);
  unpaired.traceEvents = unpaired.traceEvents.filter(
    (event) => !(
      event.name === 'PipelineReporter' &&
      event.ph === 'e' &&
      event.id2?.local === '0x4'
    ),
  );
  expectCode(
    () => extractCompositorPresentedFrameEvidence(unpaired, options),
    'BOM_F3_TRACE_PIPELINE_REPORTER_UNPAIRED',
  );

  const uncoveredEnd = structuredClone(fixture);
  uncoveredEnd.traceEvents = uncoveredEnd.traceEvents.filter((event) => {
    if (event.name === 'Display::FrameDisplayed' && event.ts === 31_000_000) {
      return false;
    }
    if (event.name !== 'PipelineReporter') return true;
    return event.args?.frame_reporter?.frame_sequence !== 5 &&
      event.ts !== 31_000_000;
  });
  expectCode(
    () => extractCompositorPresentedFrameEvidence(uncoveredEnd, options),
    'BOM_F3_TRACE_WINDOW_PRESENTATION_COVERAGE_INCOMPLETE',
  );
});

test('nested PipelineReporter IDs pair in original-order LIFO semantics', () => {
  const nested = structuredClone(fixture);
  const records = nested.traceEvents.filter(
    (event) =>
      event.name === 'PipelineReporter' &&
      event.id2?.local === '0x2',
  );
  records[1].args.frame_reporter.state = 'STATE_DROPPED';
  records[2].ts = 1_010_000;

  const evidence = extractCompositorPresentedFrameEvidence(nested, options);
  const frame = evidence.missingOrCheckerboardFrames.evidence.find(
    (candidate) => candidate.timestampUs === 1_016_667,
  );
  assert.equal(frame.reporterCount, 1);
  assert.equal(frame.reporters[0].frameSequence, 20);
  assert.equal(frame.reporters[0].state, 'STATE_PRESENTED_ALL');
});

test('RAF-only traces cannot substitute for compositor displayed frames', () => {
  const rafOnly = structuredClone(fixture);
  rafOnly.traceEvents = rafOnly.traceEvents.filter(
    (event) => event.name !== 'Display::FrameDisplayed',
  );
  expectCode(
    () => extractCompositorPresentedFrameEvidence(rafOnly, options),
    'BOM_F3_TRACE_PRESENTED_EVENT_MISSING',
  );
});

test('the versioned Chrome 150 gzip fixture is parsed and rejected for missing scroll markers', async () => {
  const artifact = await readFile(new URL(
    './fixtures/chromium-150-missing-scroll-markers.json.gz',
    import.meta.url,
  ));
  expectCode(
    () => extractCompositorPresentedFrameEvidence(artifact, {
      ...options,
      windowId: 'formal-scroll-window',
    }),
    'BOM_F3_TRACE_SCROLL_WINDOW_MARKER_COUNT_INVALID',
  );
});

test('profile registry and scroll marker names are versioned and deterministic', () => {
  assert.deepEqual(createScrollTraceWindowNames('run-001'), {
    id: 'run-001',
    start: 'bom:f3:scroll:run-001:start',
    end: 'bom:f3:scroll:run-001:end',
  });
  const profiles = listCompositorTraceSchemaProfiles();
  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].id, CHROMIUM_150_COMPOSITOR_TRACE_PROFILE_ID);
  assert.equal(profiles[0].browserProduct, options.browserVersion);
  assert.equal(profiles[0].browserRevision, options.browserRevision);
  assert.equal(profiles[1].id, CHROMIUM_151_COMPOSITOR_TRACE_PROFILE_ID);
  assert.equal(profiles[1].browserProduct, 'Chrome/151.0.7922.108');
});

function expectCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof CompositorTraceExtractionError);
    assert.equal(error.code, code);
    assert.equal(typeof error.diagnostics, 'object');
    return true;
  });
}
