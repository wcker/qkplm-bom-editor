import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  BOM_10K_D6,
  F3_10K_EDIT_SCENARIO,
  createBenchmarkScenarioManifestEntry,
  createFixtureManifestEntry,
} from '@bom-editor/benchmark-fixtures';

import {
  prepareContinuousScroll,
  runColdMountSamples,
  runContinuousScroll,
  runCorrectness,
  runInputFeedbackSamples,
  runLifecycleScenarios,
  waitForAcceptanceApi,
} from './lib/acceptance.mjs';
import { EvidenceArtifacts } from './lib/artifacts.mjs';
import {
  assessApplicationPixelFrameEvidence,
} from './lib/application-pixel-scroll.mjs';
import {
  CHROME_LAUNCH_ARGS,
  launchChrome,
  startDemoServer,
} from './lib/browser-runtime.mjs';
import {
  assertFormalEnvironmentApproved,
  collectEnvironment,
  findSystemChrome,
  loadEnvironmentApproval,
} from './lib/environment.mjs';
import { runDemoFunctionalGate } from './lib/functional.mjs';
import { createArtifactManifest, hashCanonicalJson } from './lib/hashes.mjs';
import {
  assessEvidenceIntegrity,
  createEvidenceIntegrityUnavailable,
} from './lib/evidence-integrity.mjs';
import {
  summarizeLifecycleMemoryQualification,
} from './lib/memory.mjs';
import { runDisposableRealmMemoryProtocol } from './lib/realm-memory-runner.mjs';
import {
  createBrowserTargetLifecycleTracker,
} from './lib/target-lifecycle.mjs';
import {
  summarizeSamples,
  thresholdVerdict,
} from './lib/statistics.mjs';
import {
  getCompositorTraceProfileId,
  inspectCompositorTraceCadence,
  startCompositorTrace,
} from './lib/trace.mjs';
import {
  F3_SCROLL_TRACE_WINDOW_ID,
  createUnattemptedCompositorTraceEvaluation,
  evaluateCompositorTrace,
} from './lib/trace-qualification.mjs';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const options = parseArguments(process.argv.slice(2));
const counts = options.mode === 'formal'
  ? Object.freeze({ warmup: 5, measured: 30 })
  : Object.freeze({ warmup: 1, measured: 3 });
const cacheState = Object.freeze({
  browserProfile: 'fresh-isolated-per-run',
  ordinaryDemoFunctionalGateBeforeAcceptance: true,
  acceptanceModuleGraph: 'loaded-once-before-samples',
  httpAndModuleCacheDuringSamples: 'warm',
  fixtureGeneration: 'acceptance-module-initialization-before-cold-timing',
  editorInstancePerColdSample: 'fresh',
});
const runId = options.runId ?? createRunId(options.mode);
const artifacts = new EvidenceArtifacts(workspaceRoot, runId);
await artifacts.initialize();

let server = null;
let chrome = null;
let report = null;
let traceController = null;
let traceCaptured = false;
let traceCaptureError = null;
let traceCategories = null;
let capturedTraceBytes = null;
let traceArtifact = null;
let cadencePrecheck = null;
let realmMemoryArtifact = null;
let applicationPixelEvidence = null;
let applicationPixelAssessment = null;
let applicationPixelEvidenceArtifact = null;
let applicationPixelCorrelationArtifact = null;
let environment = null;
let environmentApproval = null;
let targetLifecycle = null;
let build = null;
let evidenceTooling = null;
let evidenceIntegrity = createEvidenceIntegrityUnavailable({
  code: 'BOM_F3_EVIDENCE_INTEGRITY_NOT_RECHECKED',
});
let traceEvaluation = createUnattemptedCompositorTraceEvaluation({
  code: 'BOM_F3_TRACE_CAPTURE_MISSING',
  message: 'compositor trace was not captured',
});
let traceExtractionForReport = traceEvaluation.extraction;

try {
  build = await collectBuildManifest();
  if (build.files.length === 0) {
    throw new Error('BOM_F3_PRODUCTION_BUILD_MISSING');
  }
  assertManifestContains(build, [
    'apps/demo/dist/index.html',
    'apps/demo/dist/main.js',
    'apps/demo/dist/acceptance.html',
    'apps/demo/dist/acceptance.js',
    'packages/core/dist/index.js',
  ], 'production build');
  evidenceTooling = await collectEvidenceToolingManifest();
  assertManifestContains(evidenceTooling, [
    'benchmark/environment.json',
    'benchmark/schemas/',
    'benchmarks/scenarios/scripts/f3-browser-evidence.mjs',
    'benchmarks/scenarios/schema/application-pixel-frame-evidence-v1.schema.json',
    'benchmarks/scenarios/schema/application-pixel-frame-correlation-v1.schema.json',
    'benchmarks/scenarios/schema/f3-evidence-v3.schema.json',
    'benchmarks/scenarios/package.json',
    'apps/demo/scripts/serve.mjs',
    'packages/core/etc/api/',
    'package.json',
    'pnpm-lock.yaml',
  ], 'evidence tooling');
  const chromePath = await findSystemChrome(options.chromePath);
  server = await startDemoServer(workspaceRoot);
  chrome = await launchChrome({
    chromePath,
    headless: options.headless,
    viewport: F3_10K_EDIT_SCENARIO.viewport,
  });

  const normalPage = chrome.context.pages()[0] ?? await chrome.context.newPage();
  const functional = await runDemoFunctionalGate({
    page: normalPage,
    baseUrl: server.baseUrl,
    artifacts,
    desktopViewport: F3_10K_EDIT_SCENARIO.viewport,
  }).catch((cause) => {
    throw new Error('BOM_F3_FUNCTIONAL_GATE_FAILED', { cause });
  });
  await normalPage.close();

  const page = await chrome.context.newPage();
  await page.goto(server.baseUrl + '/acceptance.html', { waitUntil: 'load' });
  const acceptance = await waitForAcceptanceApi(page);
  const metadata = await page.evaluate(async (methodName) => {
    return globalThis.__BOM_F3_ACCEPTANCE__[methodName]();
  }, acceptance.methods.metadata);
  validateMetadata(metadata);
  const pageSession = await chrome.context.newCDPSession(page);
  targetLifecycle = createBrowserTargetLifecycleTracker({
    page,
    context: chrome.context,
    browser: chrome.browser,
  });
  targetLifecycle.markStage('acceptance-ready');
  environment = await collectEnvironment({
    browserSession: chrome.browserSession,
    browser: chrome.browser,
    chromePath,
    launchArgs: CHROME_LAUNCH_ARGS,
    page,
    mode: options.mode,
    headless: options.headless,
    cacheState,
  });
  environmentApproval = await loadEnvironmentApproval(workspaceRoot, environment);
  targetLifecycle.markStage('environment-collected');
  if (options.mode === 'formal') {
    assertFormalEnvironmentApproved(environmentApproval);
  }

  cadencePrecheck = await runCadencePrecheck({
    page,
    browserSession: chrome.browserSession,
    environment,
    artifacts,
  });
  if (options.mode === 'formal' && cadencePrecheck.status !== 'passed') {
    const precheckError = new Error('BOM_F3_TRACE_CADENCE_PRECHECK_FAILED');
    precheckError.code = 'BOM_F3_TRACE_CADENCE_PRECHECK_FAILED';
    const cause = new Error(cadencePrecheck.error?.message ?? 'cadence precheck failed');
    cause.name = cadencePrecheck.error?.name ?? 'CadencePrecheckError';
    cause.code = cadencePrecheck.error?.code ?? null;
    cause.diagnostics = cadencePrecheck.error?.diagnostics ?? null;
    precheckError.cause = cause;
    throw precheckError;
  }

  targetLifecycle.markStage('cold-mount:starting');
  const coldRaw = await runColdMountSamples(page, acceptance, counts);
  targetLifecycle.markStage('cold-mount:completed');
  targetLifecycle.markStage('input-feedback:starting');
  const inputRaw = await runInputFeedbackSamples(page, acceptance, counts);
  targetLifecycle.markStage('input-feedback:completed');
  targetLifecycle.markStage('continuous-scroll:preparing');
  await prepareContinuousScroll(page, acceptance);
  try {
    traceController = await startCompositorTrace(chrome.browserSession);
    traceCategories = traceController.categories;
  } catch (error) {
    traceCaptureError = serializeError(error);
  }
  try {
    applicationPixelEvidence = await runContinuousScroll(page, acceptance);
    applicationPixelAssessment =
      assessApplicationPixelFrameEvidence(applicationPixelEvidence);
    applicationPixelEvidenceArtifact = 'raw/continuous-scroll.json';
    await artifacts.writeJson(
      applicationPixelEvidenceArtifact,
      applicationPixelEvidence,
    );
  } finally {
    if (traceController !== null) {
      const activeTraceController = traceController;
      traceController = null;
      try {
        capturedTraceBytes = await activeTraceController.stop();
        traceArtifact = 'traces/chromium-compositor.json.gz';
        await artifacts.writeCompressedTrace(traceArtifact, capturedTraceBytes);
        traceCaptured = true;
      } catch (error) {
        traceCaptureError = serializeError(error);
      }
    }
  }

  targetLifecycle.markStage('continuous-scroll:completed');
  if (traceCaptured && capturedTraceBytes !== null) {
    traceEvaluation = evaluateCompositorTrace({
      traceInput: capturedTraceBytes,
      browserVersion: environment.chrome.product,
      browserRevision: environment.chrome.revision,
      refreshPeriodUs:
        1_000_000 / F3_10K_EDIT_SCENARIO.measurement.refreshRateHz,
      windowId: F3_SCROLL_TRACE_WINDOW_ID,
      thresholds: {
        scrollDurationMs:
          F3_10K_EDIT_SCENARIO.measurement.scrollDurationMs,
        frameP95Ms: F3_10K_EDIT_SCENARIO.measurement.frameP95Ms,
        frameP99Ms: F3_10K_EDIT_SCENARIO.measurement.frameP99Ms,
      },
      applicationPixelEvidence,
    });
    if (traceEvaluation.applicationPixelCorrelation !== null) {
      applicationPixelCorrelationArtifact =
        'raw/application-pixel-frame-correlation.json';
      await artifacts.writeJson(
        applicationPixelCorrelationArtifact,
        traceEvaluation.applicationPixelCorrelation,
      );
    }
    let evidenceArtifact = null;
    if (traceEvaluation.evidence !== null) {
      evidenceArtifact =
        'traces/chromium-compositor-presented-frame-evidence.json';
      await artifacts.writeJson(evidenceArtifact, traceEvaluation.evidence);
    }
    traceExtractionForReport = Object.freeze({
      ...traceEvaluation.extraction,
      evidenceArtifact,
    });
  }
  targetLifecycle.markStage('correctness:starting');
  const correctness = await runCorrectness(page, acceptance);
  targetLifecycle.markStage('correctness:completed');
  targetLifecycle.markStage('lifecycle:starting');
  const lifecycle = await runLifecycleScenarios({
    page,
    pageSession,
    description: acceptance,
    mode: options.mode,
  });
  targetLifecycle.markStage('lifecycle:completed');
  targetLifecycle.markStage('realm-memory:starting');
  const realmMemoryEvidence = await runDisposableRealmMemoryProtocol({
    page,
    pageSession,
    description: acceptance,
    mode: options.mode,
    runId,
    viewport: F3_10K_EDIT_SCENARIO.viewport,
    canvasLayerCount: F3_10K_EDIT_SCENARIO.layout.canvasLayerCount,
    dependencies: {
      assertTargetActive: (phase) =>
        targetLifecycle.assertActive('realm-memory:' + phase),
    },
  });
  targetLifecycle.markStage('realm-memory:completed');
  realmMemoryArtifact = 'raw/disposable-realm-memory.json';
  await artifacts.writeJson(realmMemoryArtifact, realmMemoryEvidence);
  targetLifecycle.markStage('acceptance-screenshot:starting');
  await page.screenshot({
    path: artifacts.path('screenshots/acceptance-desktop.png'),
    fullPage: false,
  });
  targetLifecycle.markStage('acceptance-screenshot:completed');
  const coldMeasured = coldRaw.filter((sample) => sample.phase === 'measured');
  const inputMeasured = inputRaw.filter((sample) => sample.phase === 'measured');
  const coldStatistics = summarizeSamples(
    coldMeasured.map((sample) => sample.durationMs),
    { p99MinimumSamples: 200 },
  );
  const inputStatistics = summarizeSamples(
    inputMeasured.map((sample) => sample.durationMs),
    { p99MinimumSamples: 1_000 },
  );
  const inputTransactionStatistics = summarizeSamples(
    inputMeasured.map((sample) => sample.transactionDurationMs),
    { p99MinimumSamples: 1_000 },
  );
  const inputCaptureDelayStatistics = summarizeSamples(
    inputMeasured.map((sample) => sample.captureDelayMs),
    { p99MinimumSamples: 1_000 },
  );
  const inputApplicationTransactionStatistics = summarizeSamples(
    inputMeasured.map((sample) => sample.captureToTransactionCommittedMs),
    { p99MinimumSamples: 1_000 },
  );
  const inputRenderAfterTransactionStatistics = summarizeSamples(
    inputMeasured.map((sample) => sample.renderAfterTransactionMs),
    { p99MinimumSamples: 1_000 },
  );
  const performanceGate = Object.freeze({
    coldInteractiveReadyCandidate: thresholdVerdict(
      coldStatistics.p95Ms,
      F3_10K_EDIT_SCENARIO.measurement.startupP95Ms,
    ),
    inputFeedbackRenderCommitCandidate: thresholdVerdict(
      inputStatistics.p95Ms,
      F3_10K_EDIT_SCENARIO.measurement.inputP95Ms,
    ),
    continuousScrollPresentation: traceEvaluation.gate,
  });
  const memoryQualification = summarizeLifecycleMemoryQualification(lifecycle);
  const realmMemoryQualification = realmMemoryEvidence.qualification;
  const nonMemoryChecksPassed =
    functional.passed &&
    correctness.passed &&
    performanceGate.coldInteractiveReadyCandidate.passed &&
    performanceGate.inputFeedbackRenderCommitCandidate.passed;
  const smokeChecksPassedBeforeIntegrity =
    nonMemoryChecksPassed &&
    memoryQualification.uaMemorySupported &&
    memoryQualification.observableResourceReleasePassed &&
    realmMemoryEvidence.diagnosticChecksPassed &&
    applicationPixelAssessment?.valid === true;

  await Promise.all([
    artifacts.writeJsonLines('raw/cold-mount.jsonl', coldRaw),
    artifacts.writeJsonLines('raw/input-feedback.jsonl', inputRaw),
    artifacts.writeJson('raw/lifecycle.json', lifecycle),
  ]);
  evidenceIntegrity = await recheckEvidenceIntegrity(build, evidenceTooling);
  const smokeChecksPassed =
    smokeChecksPassedBeforeIntegrity && evidenceIntegrity.verified === true;
  const qualificationBlockers = [
    ...(options.mode === 'formal' ? [] : ['smoke mode is never release-qualifying']),
    ...(options.headless ? ['headless Chrome is not the approved reference presentation environment'] : []),
    ...(environmentApproval.approved ? [] : environmentApproval.reasons),
    ...(traceCaptured ? [] : ['compositor trace was not captured']),
    ...(traceEvaluation.gate.status === 'passed'
      ? []
      : traceEvaluation.gate.blockers),
    ...(cadencePrecheck?.status === 'passed'
      ? []
      : [
          'cadence precheck failed: ' +
            (cadencePrecheck?.error?.code ?? 'unavailable'),
        ]),
    ...evidenceIntegrity.blockers,
    ...formatRealmMemoryBlockers(realmMemoryQualification),
    ...formatApplicationPixelBlockers(
      traceEvaluation.applicationPixelCorrelation,
    ),
    ...formatApplicationPixelAssessmentBlockers(
      applicationPixelAssessment,
    ),
    'manual WCAG 2.2 AA and screen-reader task evidence is not part of this run',
    'the complete two-hour soak evidence package is not part of this run',
    ...(memoryQualification.uaMemorySupported
      ? []
      : ['UA-specific memory is unsupported for at least one lifecycle sample']),
    ...(hasFixtureSnapshotHash(metadata) ? [] : ['fixture Snapshot content/envelope SHA-256 is missing']),
    ...(environment.font?.sha256 === metadata.font?.sha256
      ? []
      : ['system font bytes do not match the scenario font SHA-256']),
  ];
  const hardGateFailed =
    !nonMemoryChecksPassed ||
    evidenceIntegrity.verified !== true ||
    traceEvaluation.gate.status === 'failed' ||
    !memoryQualification.observableResourceReleasePassed ||
    memoryQualification.normativeRetainedWithinLimit === false ||
    realmMemoryQualification.status === 'failed';
  const applicationPixelProtocolFailed =
    applicationPixelAssessment?.valid !== true;
  const overall =
    hardGateFailed || applicationPixelProtocolFailed
      ? 'failed'
      : 'unqualified';

  report = Object.freeze({
    schemaVersion: 'bom-f3-browser-evidence/v3',
    runId,
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    overall,
    f3Pass: false,
    qualification: {
      releaseQualified: false,
      environmentApproved: environmentApproval.approved,
      compositorTraceCaptured: traceCaptured,
      certifiedTraceExtractor: traceExtractionForReport.certified,
      destroyRetentionQualified: realmMemoryQualification.qualified,
      applicationPixelEvidenceQualified:
        applicationPixelAssessment?.valid === true,
      blockers: qualificationBlockers,
    },
    environment,
    environmentApproval,
    evidenceIntegrity,
    targetLifecycle: targetLifecycle?.snapshot() ?? null,
    build,
    evidenceTooling,
    evidence: {
      realmMemoryArtifact,
      applicationPixelEvidenceArtifact,
      applicationPixelCorrelationArtifact,
    },
    fixture: {
      manifest: createFixtureManifestEntry(BOM_10K_D6),
      definitionSha256: hashCanonicalJson(BOM_10K_D6),
      acceptance: metadata.fixture,
    },
    scenario: {
      manifest: createBenchmarkScenarioManifestEntry(F3_10K_EDIT_SCENARIO),
      definitionSha256: hashCanonicalJson(F3_10K_EDIT_SCENARIO),
      acceptance: metadata.scenario,
    },
    sampling: {
      ...counts,
      cacheState,
    },
    measurementConditions: {
      input: 'pre-generated parsed Snapshot',
      httpCache: 'page and modules loaded once before samples',
      editorState: 'fresh editor instance per cold sample',
      screenshot: 'outside measured intervals',
      applicationPixelReadback:
        '64x32 background/content Canvas samples after complete renderer paints inside the marked scroll window',
    },
    metrics: {
      coldInteractiveReadyCandidate: {
        endpoint: 'immediately before createBomEditor to editor ready after initial Canvas, semantic DOM, and Portal sync',
        statistics: coldStatistics,
      },
      inputFeedbackCandidate: {
        endpoint: 'capture-phase keydown to aria mutation after Canvas draw; not compositor presentation',
        statistics: inputStatistics,
        segments: {
          inputDispatchToCaptureCandidate: {
            endpoint: 'input event timestamp to capture-phase listener entry',
            statistics: inputCaptureDelayStatistics,
          },
          captureToTransactionCommittedCandidate: {
            endpoint: 'capture-phase listener entry to transactionCommitted after renderer update scheduling',
            statistics: inputApplicationTransactionStatistics,
          },
          inputToTransactionCommittedCandidate: {
            endpoint: 'capture-phase keydown to transactionCommitted after renderer update scheduling',
            statistics: inputTransactionStatistics,
          },
          transactionCommittedToRenderCommitCandidate: {
            endpoint: 'transactionCommitted to aria mutation after Canvas draw; not compositor presentation',
            statistics: inputRenderAfterTransactionStatistics,
          },
        },
      },
      continuousScrollPresentation: traceEvaluation.metric,
    },
    gates: {
      functional,
      correctness,
      lifecycle,
      performance: performanceGate,
      memory: memoryQualification,
      realmMemory: realmMemoryQualification,
      memorySupported: memoryQualification.uaMemorySupported,
      memoryWithinLimit: memoryQualification.normativeRetainedWithinLimit,
      smokeChecksPassed,
    },
    trace: {
      captured: traceCaptured,
      certifiedExtractor: traceExtractionForReport.certified,
      categories: traceCategories,
      captureError: traceCaptureError,
      artifact: traceArtifact,
      extraction: traceExtractionForReport,
    },
    cadencePrecheck,
  });
  await artifacts.writeJson('report.json', report);
  process.exitCode =
    options.mode === 'smoke' &&
    smokeChecksPassed &&
    evidenceIntegrity.verified === true &&
    applicationPixelAssessment?.valid === true &&
    traceEvaluation.gate.status !== 'failed' &&
    realmMemoryQualification.status !== 'failed'
      ? 0
      : 1;
} catch (error) {
  if (traceController !== null) {
    try {
      capturedTraceBytes = await traceController.stop();
      traceArtifact = 'traces/chromium-compositor-partial.json.gz';
      await artifacts.writeCompressedTrace(traceArtifact, capturedTraceBytes);
      traceCaptured = true;
    } catch (traceStopError) {
      traceCaptureError = serializeError(traceStopError);
    }
  }
  if (traceEvaluation.extraction.status === 'not-attempted') {
    traceEvaluation = createUnattemptedCompositorTraceEvaluation({
      code: 'BOM_F3_TRACE_RUNNER_ABORTED',
      message:
        'runner aborted before a complete compositor trace could be evaluated',
      profileId:
        getCompositorTraceProfileId(environment?.chrome?.product) ?? undefined,
    });
    traceExtractionForReport = traceEvaluation.extraction;
  }
  evidenceIntegrity = await recheckEvidenceIntegrity(build, evidenceTooling);
  const gateFailure =
    error instanceof Error &&
    /(?:BOM_F3_FORMAL_ENVIRONMENT_NOT_APPROVED|BOM_F3_TRACE_CADENCE_PRECHECK_FAILED|BOM_F3_ACCEPTANCE_CALL_TIMEOUT|BOM_F3_UA_MEMORY_(?:EVALUATION_TIMEOUT|UNAVAILABLE)|BOM_F3_REALM_MEMORY_(?:PROTOCOL_TIMEOUT|UNAVAILABLE)|BOM_F3_(?:COLD_MOUNT|CORRECTNESS|FUNCTIONAL|INPUT|LIFECYCLE|SCROLL)_.*FAILED|BOM_ACCEPTANCE_(?:SCROLL|PIXEL)_[A-Z_]+)/u.test(
      error.message,
    );
  report = Object.freeze({
    schemaVersion: 'bom-f3-browser-evidence/v3',
    runId,
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    overall:
      gateFailure || evidenceIntegrity.verified !== true
        ? 'failed'
        : 'unqualified',
    f3Pass: false,
    qualification: {
      releaseQualified: false,
      environmentApproved: environmentApproval?.approved ?? false,
      compositorTraceCaptured: traceCaptured,
      certifiedTraceExtractor: traceExtractionForReport.certified,
      destroyRetentionQualified: false,
      applicationPixelEvidenceQualified: false,
      blockers: [
        'runner did not complete',
        ...(error?.reasons ?? environmentApproval?.reasons ?? []),
        ...targetLossBlockers(error),
        ...(cadencePrecheck?.status === 'passed'
          ? []
          : [
              'cadence precheck failed: ' +
                (cadencePrecheck?.error?.code ?? 'unavailable'),
            ]),
        ...evidenceIntegrity.blockers,
        ...traceEvaluation.gate.blockers,
      ],
    },
    environment,
    environmentApproval,
    evidenceIntegrity,
    targetLifecycle: targetLifecycle?.snapshot() ?? null,
    evidence: {
      realmMemoryArtifact,
      applicationPixelEvidenceArtifact,
      applicationPixelCorrelationArtifact,
    },
    trace: {
      captured: traceCaptured,
      certifiedExtractor: traceExtractionForReport.certified,
      categories: traceCategories,
      captureError: traceCaptureError,
      artifact: traceArtifact,
      extraction: traceExtractionForReport,
    },
    cadencePrecheck,
    error: serializeError(error),
  });
  await artifacts.writeJson('report.json', report);
  process.exitCode = 1;
} finally {
  targetLifecycle?.dispose();
  await chrome?.close();
  await server?.close();
  await artifacts.finalizeManifest({
    runId,
    reportStatus: report?.overall ?? 'unqualified',
    f3Pass: false,
  });
}

process.stdout.write(JSON.stringify({
  runId,
  report: artifacts.path('report.json'),
  manifest: artifacts.path('manifest.json'),
  overall: report?.overall,
  f3Pass: false,
}) + '\n');

async function collectBuildManifest() {
  return createArtifactManifest(workspaceRoot, [
    'apps/demo/dist',
    'benchmarks/fixtures/dist',
    'packages/contracts/dist',
    'packages/core/dist',
    'packages/datasource/dist',
    'packages/editor/dist',
    'packages/model/dist',
    'packages/renderer-canvas/dist',
    'packages/runtime/dist',
    'packages/transaction/dist',
    'packages/visible-projection/dist',
    'pnpm-lock.yaml',
  ]);
}

async function collectEvidenceToolingManifest() {
  return createArtifactManifest(workspaceRoot, [
    'benchmark/environment.json',
    'benchmark/schemas',
    'benchmarks/scenarios/scripts',
    'benchmarks/scenarios/schema',
    'benchmarks/scenarios/test',
    'benchmarks/scenarios/package.json',
    'apps/demo/scripts/serve.mjs',
    'packages/core/etc/api',
    'package.json',
    'pnpm-lock.yaml',
  ]);
}

async function recheckEvidenceIntegrity(buildBefore, evidenceToolingBefore) {
  if (buildBefore === null || evidenceToolingBefore === null) {
    return createEvidenceIntegrityUnavailable({
      buildBefore,
      evidenceToolingBefore,
      code: 'BOM_F3_EVIDENCE_INTEGRITY_BASELINE_UNAVAILABLE',
    });
  }
  try {
    const [buildAfter, evidenceToolingAfter] = await Promise.all([
      collectBuildManifest(),
      collectEvidenceToolingManifest(),
    ]);
    return assessEvidenceIntegrity({
      buildBefore,
      buildAfter,
      evidenceToolingBefore,
      evidenceToolingAfter,
    });
  } catch (error) {
    return createEvidenceIntegrityUnavailable({
      buildBefore,
      evidenceToolingBefore,
      error: serializeError(error),
    });
  }
}

function validateMetadata(metadata) {
  if (metadata === null || typeof metadata !== 'object') {
    throw new Error('BOM_F3_ACCEPTANCE_METADATA_INVALID');
  }
  if (metadata.fixture?.id !== BOM_10K_D6.id && metadata.fixture?.manifest?.id !== BOM_10K_D6.id) {
    throw new Error('BOM_F3_ACCEPTANCE_FIXTURE_MISMATCH');
  }
  if (
    metadata.scenario?.id !== F3_10K_EDIT_SCENARIO.id &&
    metadata.scenario?.manifest?.id !== F3_10K_EDIT_SCENARIO.id
  ) {
    throw new Error('BOM_F3_ACCEPTANCE_SCENARIO_MISMATCH');
  }
}

function hasFixtureSnapshotHash(metadata) {
  const values = [
    metadata.fixture?.contentHash,
    metadata.fixture?.envelopeHash,
    metadata.fixture?.snapshotContentSha256,
    metadata.fixture?.snapshotEnvelopeSha256,
  ];
  return values.some((value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value));
}

function formatRealmMemoryBlockers(qualification) {
  if (qualification?.qualified === true) {
    return [];
  }
  const messages = new Set();
  for (const blocker of qualification?.blockers ?? []) {
    messages.add(
      `disposable Realm memory ${blocker.code}: ${blocker.message}`,
    );
  }
  if (messages.size === 0) {
    messages.add('disposable Realm memory evidence is unavailable');
  }
  return [...messages];
}

function formatApplicationPixelBlockers(correlation) {
  if (correlation?.qualified === true) {
    return [];
  }
  return (correlation?.blockers ?? []).map(
    (blocker) =>
      'application pixel correlation ' +
      blocker.code +
      ': ' +
      blocker.message,
  );
}

function formatApplicationPixelAssessmentBlockers(assessment) {
  if (assessment?.valid === true) {
    return [];
  }
  const blockers = assessment?.blockers ?? [];
  if (blockers.length === 0) {
    return ['application pixel raw evidence assessment is unavailable'];
  }
  return blockers.map(
    (blocker) =>
      'application pixel raw evidence ' +
      blocker.code +
      ': ' +
      blocker.message,
  );
}

async function runCadencePrecheck({ page, browserSession, environment, artifacts }) {
  const artifact = 'traces/chromium-compositor-cadence-precheck.json.gz';
  const startedAt = Date.now();
  let controller = null;
  let traceBytes = null;
  let artifactWritten = false;
  try {
    controller = await startCompositorTrace(browserSession);
    await page.evaluate(async (durationMs) => {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const timeout = setTimeout(finish, durationMs);
        const started = performance.now();
        const tick = (now) => {
          if (now - started >= durationMs) {
            clearTimeout(timeout);
            finish();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, 1_200);
    traceBytes = await controller.stop();
    controller = null;
    await artifacts.writeCompressedTrace(artifact, traceBytes);
    artifactWritten = true;
    const cadence = inspectCompositorTraceCadence({
      traceInput: traceBytes,
      browserVersion: environment.chrome.product,
      browserRevision: environment.chrome.revision,
      refreshPeriodUs:
        1_000_000 / F3_10K_EDIT_SCENARIO.measurement.refreshRateHz,
    });
    return Object.freeze({
      status: 'passed',
      durationMs: Date.now() - startedAt,
      artifact,
      cadence,
      error: null,
    });
  } catch (error) {
    if (controller !== null) {
      try {
        traceBytes = await controller.stop();
      } catch (stopError) {
        error = new AggregateError([error, stopError], 'cadence precheck trace capture failed');
      }
      controller = null;
    }
    if (traceBytes !== null && !artifactWritten) {
      try {
        await artifacts.writeCompressedTrace(artifact, traceBytes);
        artifactWritten = true;
      } catch {
        // The structured error below is sufficient when the partial artifact cannot be saved.
      }
    }
    return Object.freeze({
      status: 'failed',
      durationMs: Date.now() - startedAt,
      artifact: artifactWritten ? artifact : null,
      cadence: null,
      error: serializeError(error),
    });
  }
}

function assertManifestContains(manifest, requiredPaths, label) {
  const paths = manifest.files.map((entry) => entry.path);
  for (const requiredPath of requiredPaths) {
    const found = requiredPath.endsWith('/')
      ? paths.some((path) => path.startsWith(requiredPath))
      : paths.includes(requiredPath);
    if (!found) {
      throw new Error(
        `BOM_F3_MANIFEST_REQUIRED_PATH_MISSING:${label}:${requiredPath}`,
      );
    }
  }
}

function targetLossBlockers(error) {
  if (
    error === null || typeof error !== 'object' ||
    error.code !== 'BOM_F3_ACCEPTANCE_TARGET_LOST'
  ) {
    return [];
  }
  return [
    'acceptance target was lost at ' +
      (typeof error.stage === 'string' ? error.stage : 'an unknown stage'),
  ];
}

function parseArguments(arguments_) {
  let mode = 'smoke';
  let headless = process.env.BOM_F3_HEADLESS === '1';
  let chromePath;
  let runId;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--headless') {
      headless = true;
    } else if (argument === '--headed') {
      headless = false;
    } else if (argument.startsWith('--mode=')) {
      mode = argument.slice('--mode='.length);
    } else if (argument === '--mode') {
      mode = arguments_[++index];
    } else if (argument.startsWith('--chrome=')) {
      chromePath = argument.slice('--chrome='.length);
    } else if (argument.startsWith('--run-id=')) {
      runId = argument.slice('--run-id='.length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (mode !== 'smoke' && mode !== 'formal') {
    throw new RangeError('--mode must be smoke or formal.');
  }
  return Object.freeze({ mode, headless, chromePath, runId });
}

function createRunId(mode) {
  return new Date().toISOString().replaceAll(/[-:.]/gu, '').replace('Z', 'Z-') + mode + '-' + randomBytes(4).toString('hex');
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      code: typeof error.code === 'string' ? error.code : null,
      stage: typeof error.stage === 'string' ? error.stage : null,
      message: error.message,
      stack: error.stack,
      cause: error.cause === undefined ? null : serializeError(error.cause),
      diagnostics: error.diagnostics === undefined ? null : error.diagnostics,
    };
  }
  return { name: 'UnknownError', message: String(error), stack: null };
}
