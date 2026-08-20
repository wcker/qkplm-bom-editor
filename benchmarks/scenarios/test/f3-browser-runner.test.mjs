import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runner = await readFile(
  new URL('../scripts/f3-browser-evidence.mjs', import.meta.url),
  'utf8',
);
const rawPixelSchema = JSON.parse(await readFile(
  new URL(
    '../schema/application-pixel-frame-evidence-v1.schema.json',
    import.meta.url,
  ),
  'utf8',
));
const correlationSchema = JSON.parse(await readFile(
  new URL(
    '../schema/application-pixel-frame-correlation-v1.schema.json',
    import.meta.url,
  ),
  'utf8',
));
const browserEvidenceSchema = JSON.parse(await readFile(
  new URL('../schema/f3-evidence-v3.schema.json', import.meta.url),
  'utf8',
));

test('browser runner traces only the prepared fixed-scroll interval', () => {
  const cold = runner.indexOf(
    'const coldRaw = await runColdMountSamples',
  );
  const input = runner.indexOf(
    'const inputRaw = await runInputFeedbackSamples',
  );
  const prepare = runner.indexOf(
    'await prepareContinuousScroll(page, acceptance)',
  );
  const traceStart = runner.indexOf(
    'traceController = await startCompositorTrace',
  );
  const scroll = runner.indexOf(
    'applicationPixelEvidence = await runContinuousScroll',
  );
  const traceStop = runner.indexOf(
    'capturedTraceBytes = await activeTraceController.stop()',
  );
  const traceEvaluation = runner.indexOf('traceEvaluation = evaluateCompositorTrace');
  const correctness = runner.indexOf(
    'const correctness = await runCorrectness',
  );
  const realmMemory = runner.indexOf(
    'const realmMemoryEvidence = await runDisposableRealmMemoryProtocol',
  );

  assert.ok(cold >= 0);
  assert.ok(cold < input);
  assert.ok(input < prepare);
  const cadencePrecheck = runner.indexOf(
    'cadencePrecheck = await runCadencePrecheck',
  );
  assert.ok(cadencePrecheck >= 0);
  assert.ok(environmentCollectedBefore(runner, cadencePrecheck));
  assert.ok(cadencePrecheck < cold);
  assert.ok(prepare < traceStart);
  assert.ok(traceStart < scroll);
  assert.ok(scroll < traceStop);
  assert.ok(traceStop < traceEvaluation);
  assert.ok(traceEvaluation < correctness);
  assert.ok(traceEvaluation < realmMemory);
  assert.equal(
    runner.match(/startCompositorTrace\(/gu)?.length,
    2,
  );
});

function environmentCollectedBefore(source, position) {
  return source.indexOf("targetLifecycle.markStage('environment-collected')") < position;
}

test('browser runner archives raw and correlated pixel evidence separately', () => {
  assert.match(runner, /raw\/continuous-scroll\.json/);
  assert.match(
    runner,
    /raw\/application-pixel-frame-correlation\.json/,
  );
  assert.match(
    runner,
    /evaluateCompositorTrace\(\{[\s\S]*applicationPixelEvidence,[\s\S]*\}\)/,
  );
  assert.match(runner, /assessApplicationPixelFrameEvidence/);
  assert.match(runner, /applicationPixelEvidenceArtifact/);
  assert.match(runner, /applicationPixelCorrelationArtifact/);
  assert.doesNotMatch(runner, /screenshotAndPixelReadback/);
});

test('browser runner captures environment and target-loss diagnostics before long evidence', () => {
  const targetTracker = runner.indexOf('createBrowserTargetLifecycleTracker');
  const environmentCollected = runner.indexOf("targetLifecycle.markStage('environment-collected')");
  const coldMount = runner.indexOf('const coldRaw = await runColdMountSamples');

  assert.ok(targetTracker >= 0);
  assert.ok(environmentCollected >= 0);
  assert.ok(environmentCollected < coldMount);
  assert.match(runner, /targetLifecycle: targetLifecycle\?\.snapshot\(\) \?\? null/);
  assert.match(runner, /targetLossBlockers\(error\)/);
  assert.match(runner, /assertTargetActive: \(phase\)/);
});

test('browser runner verifies immutable build and tooling inputs before reporting', () => {
  const initialBuild = runner.indexOf('build = await collectBuildManifest()');
  const initialTooling = runner.indexOf(
    'evidenceTooling = await collectEvidenceToolingManifest()',
  );
  const recheck = runner.indexOf(
    'evidenceIntegrity = await recheckEvidenceIntegrity(build, evidenceTooling)',
  );
  const report = runner.indexOf('report = Object.freeze({');

  assert.ok(initialBuild >= 0);
  assert.ok(initialTooling >= 0);
  assert.ok(recheck > initialTooling);
  assert.ok(recheck < report);
  assert.match(runner, /evidenceIntegrity\.verified !== true/);
  assert.match(runner, /\n    evidenceIntegrity,\n    targetLifecycle/);
});

test('browser evidence schema requires the end-of-run input-integrity result', () => {
  assert.equal(
    browserEvidenceSchema.required.includes('evidenceIntegrity'),
    true,
  );
  assert.equal(
    browserEvidenceSchema.properties.evidenceIntegrity.$ref,
    '#/$defs/evidenceIntegrity',
  );
  assert.equal(
    browserEvidenceSchema.$defs.evidenceIntegrity.properties.protocol.const,
    'bom-f3-evidence-integrity/v1',
  );
});

test('application pixel schemas lock the fixed protocol and fail-closed result', () => {
  assert.equal(
    rawPixelSchema.properties.schemaVersion.const,
    'bom-f3-application-pixel-frame-evidence/v1',
  );
  assert.equal(
    rawPixelSchema.properties.protocolId.const,
    'bom-f3-fixed-scroll-pixel-correlation/v1',
  );
  assert.equal(
    rawPixelSchema.$defs.trajectory.properties.durationMs.const,
    30_000,
  );
  assert.equal(
    rawPixelSchema.$defs.layer.allOf[0].then.properties.sampledPixelCount
      .const,
    2_048,
  );
  assert.equal(
    correlationSchema.properties.schemaVersion.const,
    'bom-f3-application-pixel-frame-correlation/v1',
  );
  assert.equal(
    correlationSchema.allOf[0].else.properties.status.const,
    'unqualified',
  );
  assert.equal(
    correlationSchema.allOf[0].else.properties.blankFrameCount.type,
    'null',
  );
  assert.equal(
    correlationSchema.$defs.layer.properties.rgbaChecksum.pattern,
    '^[0-9a-f]{8}$',
  );
});
