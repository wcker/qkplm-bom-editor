import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);
const scriptsRoot = new URL('../scripts/', import.meta.url);

test('the first screen is the editor workbench with stable status surfaces', async () => {
  const html = await readFile(new URL('index.html', sourceRoot), 'utf8');

  assert.match(html, /id="editor-host"/);
  assert.match(html, /class="workspace-tabs" role="tablist"/);
  assert.match(html, /href="\/examples\.html"/);
  assert.match(html, /href="\/help\.html"/);
  assert.match(html, /id="undo-button"/);
  assert.match(html, /id="redo-button"/);
  assert.match(html, /id="column-settings-button"/);
  assert.match(html, /id="column-settings-panel"/);
  assert.match(html, /id="column-label-input"/);
  assert.match(html, /id="column-field-name-input"/);
  assert.match(html, /id="column-field-name-list"/);
  assert.match(html, /id="column-field-path"/);
  assert.match(html, /id="find-previous-button"/);
  assert.match(html, /id="find-next-button"/);
  assert.match(html, /id="find-counter"/);
  assert.match(html, /value="regex"/);
  assert.match(html, /value="accounting"/);
  assert.match(html, /value="scientific"/);
  assert.match(html, /value="fraction"/);
  assert.match(html, /id="column-fraction-options"/);
  assert.doesNotMatch(html, /id="find-results"/);
  assert.match(html, /id="column-date-options"/);
  assert.match(html, /id="column-date-style-select"/);
  assert.match(html, /id="column-time-style-select"/);
  assert.match(html, /id="column-format-preview"/);
  assert.match(html, /id="reload-button"/);
  assert.match(html, /id="scenario-button"/);
  assert.match(html, /id="revision-value"/);
  assert.match(html, /id="visible-count-value"/);
  assert.match(html, /id="capabilities-value"/);
  assert.doesNotMatch(html, /hero|pricing|testimonial/i);
});

test('application code consumes only the Core root and benchmark fixture API', async () => {
  const main = await readFile(new URL('main.ts', sourceRoot), 'utf8');

  assert.match(main, /from '@qkplm\/bom-editor'/);
  assert.match(main, /BOM_10K_D6/);
  assert.match(main, /F3_10K_EDIT_SCENARIO/);
  assert.match(main, /generateFixture/);
  assert.match(main, /validateBenchmarkScenario/);
  assert.doesNotMatch(
    main,
    /from '@bom-editor\/(?:editor|model|runtime|transaction|renderer-canvas|visible-projection|datasource|contracts)'/,
  );
});

test('responsive editor dimensions and the single-run timing disclaimer are explicit', async () => {
  const [styles, main] = await Promise.all([
    readFile(new URL('styles.css', sourceRoot), 'utf8'),
    readFile(new URL('main.ts', sourceRoot), 'utf8'),
  ]);

  assert.match(styles, /grid-template-rows:[^;]*minmax\(360px, 1fr\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /\.editor-frame[\s\S]*min-height: 340px/);
  assert.match(main, /不代表 P95 或 P99/);
});

test('the isolated acceptance surface is built and served independently', async () => {
  const [html, acceptance, copyScript, serveScript] = await Promise.all([
    readFile(new URL('acceptance.html', sourceRoot), 'utf8'),
    readFile(new URL('acceptance.ts', sourceRoot), 'utf8'),
    readFile(new URL('copy-static.mjs', scriptsRoot), 'utf8'),
    readFile(new URL('serve.mjs', scriptsRoot), 'utf8'),
  ]);

  assert.match(html, /src="\/acceptance\.js"/);
  assert.match(acceptance, /__BOM_F3_ACCEPTANCE__/);
  assert.match(acceptance, /version:\s*1/);
  assert.doesNotMatch(acceptance, /beforeunload/);
  assert.match(copyScript, /acceptance\.html/);
  assert.match(serveScript, /\/acceptance\.html/);
  assert.match(serveScript, /Cross-Origin-Opener-Policy/);
  assert.match(serveScript, /Cross-Origin-Embedder-Policy/);
  assert.match(serveScript, /Cross-Origin-Resource-Policy/);
  assert.match(serveScript, /require-corp/);
});

test('the interactive example and help surfaces are built and served independently', async () => {
  const [examples, help, examplesScript, helpScript, guide, copyScript, serveScript] = await Promise.all([
    readFile(new URL('examples.html', sourceRoot), 'utf8'),
    readFile(new URL('help.html', sourceRoot), 'utf8'),
    readFile(new URL('examples.ts', sourceRoot), 'utf8'),
    readFile(new URL('help.ts', sourceRoot), 'utf8'),
    readFile(new URL('guide.css', sourceRoot), 'utf8'),
    readFile(new URL('copy-static.mjs', scriptsRoot), 'utf8'),
    readFile(new URL('serve.mjs', scriptsRoot), 'utf8'),
  ]);

  assert.match(examples, /BOM 编辑器示例中心/);
  assert.match(examples, /<script type="importmap">/);
  assert.match(examples, /"@qkplm\/bom-editor": "\/packages\/core\/dist\/index\.js"/);
  assert.match(examples, /"@qkplm\/bom-editor-react": "\/packages\/react\/dist\/index\.js"/);
  assert.match(examples, /"@qkplm\/bom-editor-vue": "\/packages\/vue\/dist\/index\.js"/);
  assert.match(examples, /"@qkplm\/bom-editor-umd": "\/packages\/umd\/dist\/index\.js"/);
  assert.match(examples, /role="tablist"/);
  assert.match(examples, /data-tab-target="[^"]+-input"/);
  assert.match(examples, /data-tab-target="[^"]+-output"/);
  assert.match(examples, /data-tab-target="[^"]+-code"/);
  assert.match(examplesScript, /data-example/);
  assert.match(examplesScript, /JSON\.parse/);
  assert.match(examplesScript, /normalizeSearchRows/);
  assert.match(examplesScript, /searchScoreFor/);
  assert.match(examplesScript, /incrementRevision/);
  assert.match(examplesScript, /targetCellCount/);
  assert.match(examplesScript, /resolveDemoClipboardRepresentations/);
  assert.match(examplesScript, /candidateFormat/);
  assert.match(examplesScript, /INVALID_SEARCH_REGEX/);
  assert.match(examples, /"schema":\s*\{/);
  assert.match(examples, /"document":\s*\{/);
  assert.match(examples, /"editable": true/);
  assert.match(examples, /"fieldName": "materialCode"/);
  assert.match(examples, /"onSelectionChange"/);
  assert.match(examples, /data-example-editor-host="mount"/);
  assert.match(examples, /data-example-editor-host="edit"/);
  assert.match(examples, /data-example-editor-host="view"/);
  assert.match(examples, /data-example-editor-host="search"/);
  assert.match(examples, /data-example-editor-host="clipboard"/);
  assert.match(examplesScript, /normalizeMountSchema/);
  assert.match(examplesScript, /normalizeMountDocument/);
  assert.match(examplesScript, /COMPONENT_OUTPUT_KEYS/);
  assert.match(examplesScript, /createBomEditorComponent/);
  assert.match(examplesScript, /mountEmbeddedEditor/);
  assert.match(examplesScript, /runLiveScenarioAction/);
  assert.match(examplesScript, /importPreviewAndAllExports/);
  assert.match(examplesScript, /currentView/);
  assert.match(examplesScript, /completeData/);
  assert.match(examplesScript, /roundTripTemplate/);
  assert.match(examplesScript, /DEMO_HIGH_CONTRAST_THEME/);
  assert.match(examplesScript, /applyDemoPresentationZoom/);
  assert.match(examplesScript, /id: 'lifecycle'/);
  assert.match(examplesScript, /mountMultiInstanceExampleNow/);
  assert.match(examplesScript, /destroyActiveEmbeddedEditors/);
  assert.match(examplesScript, /id: 'frameworks'/);
  assert.match(examplesScript, /createBomEditorReactAdapter/);
  assert.match(examplesScript, /createBomEditorVueAdapter/);
  assert.match(examplesScript, /installBomEditorUmd/);
  assert.match(examplesScript, /mountFrameworkIntegrationExampleNow/);
  assert.match(examplesScript, /runFrameworkIntegrationScenario/);
  assert.match(examplesScript, /captureUpdateResult/);
  assert.match(guide, /\.example-multi-instance-layout/);
  assert.doesNotMatch(examples, /onSelectionChanged/);
  assert.doesNotMatch(examplesScript, /count:\s*query\.length === 0 \? 0 : 3/);
  assert.doesNotMatch(examplesScript, /revision:\s*42/);
  assert.match(help, /BOM 编辑器使用帮助/);
  assert.match(help, /event\.view\.columns/);
  assert.match(help, /schema,\s*document: snapshot/);
  assert.match(help, /roundTripTemplate/);
  assert.match(help, /多实例与销毁/);
  assert.match(help, /configurePresentation\(\)/);
  assert.match(help, /fieldName/);
  assert.match(help, /candidateFormat/);
  assert.doesNotMatch(help, /event\.columns/);
  assert.match(help, /help-search/);
  assert.match(helpScript, /help-section/);
  assert.match(guide, /\.docs-page/);
  assert.match(guide, /width: min\(1920px, 100%\)/);
  assert.match(guide, /\.example-editor-host/);
  assert.match(copyScript, /examples\.html/);
  assert.match(copyScript, /help\.html/);
  assert.match(serveScript, /\/examples\.html/);
  assert.match(serveScript, /\/help\.html/);
});

test('public onboarding documentation and browser smoke cover inputs, outputs, recovery, and destruction', async () => {
  const [reactReadme, vueReadme, umdReadme, browserSmoke] = await Promise.all([
    readFile(new URL('../../../packages/react/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/vue/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/umd/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/onboarding-browser-smoke.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(reactReadme, /createBomEditorReactAdapter/);
  assert.match(reactReadme, /onDocumentChange/);
  assert.match(reactReadme, /adapter\.update/);
  assert.match(reactReadme, /adapter\.destroy/);
  assert.match(vueReadme, /createBomEditorVueAdapter/);
  assert.match(vueReadme, /onDocumentChange/);
  assert.match(vueReadme, /adapter\.update/);
  assert.match(vueReadme, /adapter\?\.destroy/);
  assert.match(umdReadme, /installBomEditorUmd/);
  assert.match(umdReadme, /createBomEditorComponent/);
  assert.match(umdReadme, /component\.update/);
  assert.match(umdReadme, /component\.destroy/);
  assert.match(browserSmoke, /http:\/\/127\.0\.0\.1:4173\/examples\.html/);
  assert.match(browserSmoke, /resolveChromeExecutable/);
  assert.match(browserSmoke, /BOM_EDITOR_CHROME_EXECUTABLE/);
  assert.match(browserSmoke, /\['native', 'react', 'vue', 'umd'\]/);
  assert.match(browserSmoke, /publicSdkLifecycle/);
  assert.match(browserSmoke, /browser\.close/);
});

test('normative component facade documents the complete initialization and output surface', async () => {
  const whitepaper = await readFile(
    new URL('../../../现代化高性能可复用BOM编辑器组件.md', import.meta.url),
    'utf8',
  );

  for (const option of [
    'exportPolicy',
    'pasteLimits',
    'editNavigation',
    'shortcuts',
    'plugins',
    'pluginGrantPolicy',
    'pluginHostConfiguration',
    'logger',
  ]) {
    assert.match(whitepaper, new RegExp(`readonly ${option}\\??`));
  }
  for (const output of [
    'onStructureMoveRequest',
    'onValidationChange',
    'onMaterialMatchAudit',
    'onClipboardCompleted',
    'onClipboardRejected',
  ]) {
    assert.match(whitepaper, new RegExp(`readonly ${output}\\??`));
  }
  assert.match(whitepaper, /fieldName/);
});

test('disposable Realm teardown is same-origin, typed, and fails closed', async () => {
  const [html, acceptance] = await Promise.all([
    readFile(new URL('acceptance.html', sourceRoot), 'utf8'),
    readFile(new URL('acceptance.ts', sourceRoot), 'utf8'),
  ]);

  assert.match(acceptance, /bom-disposable-realm\/v1/);
  assert.match(acceptance, /createDisposableRealm/);
  assert.match(acceptance, /destroyDisposableRealm/);
  assert.match(acceptance, /releaseDisposableRealm/);
  assert.match(acceptance, /discardDisposableRealm/);
  assert.match(acceptance, /source\.origin !== window\.location\.origin/);
  assert.match(acceptance, /childWindow\.innerWidth !== scenario\.viewport\.width/);
  assert.match(acceptance, /childWindow\.devicePixelRatio !== scenario\.viewport\.devicePixelRatio/);
  assert.match(acceptance, /canvas\.width !== 0 \|\| canvas\.height !== 0/);
  assert.match(acceptance, /portal\.isConnected \|\| portal\.value !== ''/);
  assert.match(acceptance, /destroyResult\?\.removalAuthorized !== true/);
  assert.match(acceptance, /resourceLedgerBefore/);
  assert.match(acceptance, /resourceLedgerAfter/);
  assert.match(acceptance, /bom-editor-resource-ledger\/v1/);
  assert.match(acceptance, /bom-resource-registry-ledger\/v1/);
  assert.match(acceptance, /bom-editor-task-ledger\/v1/);
  assert.match(acceptance, /bom-editor-worker-task-ledger\/v1/);
  assert.match(acceptance, /publicDiagnosticsTypedLedgersAvailable/);
  assert.match(acceptance, /supported: instrumentationSupported/);
  assert.match(acceptance, /tracked: instrumentationSupported/);
  assert.match(acceptance, /cleanupAttemptCount !==[\s\S]*registeredCount/);
  assert.match(acceptance, /trackedResourcesReleased !== true/);
  assert.match(acceptance, /BOM_ACCEPTANCE_WORKER_LEDGER_UNAVAILABLE/);
  assert.match(acceptance, /BOM_ACCEPTANCE_DOM_LISTENER_LEDGER_UNAVAILABLE/);
  assert.match(acceptance, /BOM_ACCEPTANCE_RESIZE_OBSERVER_LEDGER_UNAVAILABLE/);
  assert.match(acceptance, /BOM_ACCEPTANCE_MUTATION_OBSERVER_LEDGER_UNAVAILABLE/);
  assert.match(acceptance, /BOM_ACCEPTANCE_INTERSECTION_OBSERVER_LEDGER_UNAVAILABLE/);
  assert.match(acceptance, /BOM_ACCEPTANCE_RAF_LEDGER_UNAVAILABLE/);
  assert.match(acceptance, /BOM_ACCEPTANCE_TIMEOUT_LEDGER_UNAVAILABLE/);
  assert.match(acceptance, /BOM_ACCEPTANCE_INTERVAL_LEDGER_UNAVAILABLE/);
  assert.match(acceptance, /instanceCount === 0/);
  assert.match(
    acceptance,
    /zero-instance-control-no-component-construction/,
  );
  assert.match(acceptance, /parentReferencesReleased/);
  assert.match(
    acceptance,
    /persistent-coordinator-state-after-detach/,
  );
  assert.match(acceptance, /reason: 'non-evidence-cleanup'/);
  assert.match(
    html,
    /\.acceptance-disposable-realm\s*\{[\s\S]*display:\s*block[\s\S]*border:\s*0/,
  );
});

test('continuous scroll exposes fixed markers and complete Canvas paint samples', async () => {
  const acceptance = await readFile(
    new URL('acceptance.ts', sourceRoot),
    'utf8',
  );

  assert.match(
    acceptance,
    /bom-f3-application-pixel-frame-evidence\/v1/,
  );
  assert.match(
    acceptance,
    /bom-f3-fixed-scroll-pixel-correlation\/v1/,
  );
  assert.match(acceptance, /runContinuousScroll/);
  assert.match(acceptance, /scenario\.scrollTrajectory\.durationMs/);
  assert.match(
    acceptance,
    /const scheduledEndTimeMs = startTimeMs \+ scheduledDurationMs/,
  );
  assert.match(acceptance, /endTimeMs = scheduledEndTimeMs/);
  assert.match(
    acceptance,
    /Math\.round\(maximumScrollTop \* triangle\)/,
  );
  assert.match(acceptance, /changedAtMs: now/);
  assert.match(
    acceptance,
    /paint\.completedAtMs <= endTimeMs/,
  );
  assert.match(acceptance, /bom:f3:scroll:/);
  assert.match(acceptance, /performance\.mark\(name, \{ startTime \}\)/);
  assert.match(acceptance, /frameCommitSink\(frame\)/);
  assert.match(acceptance, /APPLICATION_PIXEL_SAMPLE_WIDTH = 64/);
  assert.match(acceptance, /APPLICATION_PIXEL_SAMPLE_HEIGHT = 32/);
  assert.match(
    acceptance,
    /await nextAnimationFrame\(\);\s*await nextTask\(\);/,
  );
  assert.match(acceptance, /readbackFailureCount/);
  assert.match(acceptance, /paintStatesInsideWindow/);
});
