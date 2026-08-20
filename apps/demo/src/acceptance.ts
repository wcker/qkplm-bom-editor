import {
  createBomEditor,
  type BomEditor,
  type BomEditorResourceDiagnostics,
  type BomFields,
  type BomResult,
} from '@qkplm/bom-editor';
import { hashBomDocumentContent } from '@qkplm/bom-editor/model';
import type { BomCanvasFrameCommit } from '@qkplm/bom-editor/renderer/canvas';
import {
  BOM_10K_D6,
  F3_10K_EDIT_SCENARIO,
  createBenchmarkScenarioManifestEntry,
  generateFixture,
  validateBenchmarkScenario,
} from '@bom-editor/benchmark-fixtures';

type AcceptanceInstanceCount = 1 | 3 | 5;
type DisposableRealmInstanceCount = 0 | AcceptanceInstanceCount;
type AcceptancePhase =
  | 'idle'
  | 'running'
  | 'mounted'
  | 'destroyed'
  | 'blocked'
  | 'released'
  | 'error';

type DisposableRealmPhase = 'ready' | 'destroyed' | 'blocked';
type DisposableRealmResource =
  | 'dom'
  | 'canvas'
  | 'portal'
  | 'worker'
  | 'dom-listener'
  | 'resize-observer'
  | 'mutation-observer'
  | 'intersection-observer'
  | 'animation-frame'
  | 'timeout'
  | 'interval';
type DisposableRealmAssertionStatus = 'passed' | 'failed' | 'unavailable';

interface AcceptancePoint {
  readonly x: number;
  readonly y: number;
}

interface HostInspection {
  readonly hostId: string;
  readonly rendererRootCount: number;
  readonly treegridCount: number;
  readonly canvasCount: number;
  readonly nonEmptyCanvasCount: number;
  readonly paintedCanvasCount: number;
  readonly canvasBackingBytes: number;
  readonly portalCount: number;
  readonly columnHeaderCount: number;
  readonly rowHeaderCount: number;
  readonly ariaRowCount: number | null;
  readonly ariaColumnCount: number | null;
  readonly activeDescendant: string | null;
  readonly activeDescendantExists: boolean;
  readonly hitPoint: AcceptancePoint;
  readonly hitTargetRole: string | null;
  readonly hittable: boolean;
  readonly interactive: boolean;
}

interface AcceptanceInstanceState extends HostInspection {
  readonly instanceId: string;
  readonly lifecycle: string;
  readonly revision: string;
  readonly contentHash: string;
  readonly mountedResources: number;
  readonly readyEventCount: number;
  readonly destroyedEventCount: number;
  readonly interactiveVerified: boolean;
}

interface AcceptanceState {
  readonly apiVersion: 1;
  readonly phase: AcceptancePhase;
  readonly lastOperation: string;
  readonly lastError: string | null;
  readonly instanceCount: number;
  readonly focusedInstanceId: string | null;
  readonly rendererRootCount: number;
  readonly canvasCount: number;
  readonly portalCount: number;
  readonly instances: readonly AcceptanceInstanceState[];
}

interface AcceptanceMetadata {
  readonly apiVersion: 1;
  readonly fixture: Readonly<{
    readonly id: string;
    readonly definitionFingerprint: string;
    readonly seed: number;
    readonly nodeCount: number;
    readonly schemaVersion: string;
    readonly contentHash: string;
    readonly snapshotContentSha256: string;
  }>;
  readonly scenario: Readonly<{
    readonly id: string;
    readonly version: string;
    readonly fingerprint: string;
    readonly fixtureId: string;
  }>;
  readonly fixtureId: string;
  readonly fixtureFingerprint: string;
  readonly fixtureSeed: number;
  readonly fixtureNodeCount: number;
  readonly fixtureContentHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioFingerprint: string;
  readonly schemaVersion: string;
  readonly viewport: Readonly<{
    readonly width: number;
    readonly height: number;
    readonly devicePixelRatio: number;
  }>;
  readonly font: Readonly<{
    readonly family: string;
    readonly sizePx: number;
    readonly weight: number;
    readonly sha256: string;
  }>;
  readonly crossOriginIsolated: boolean;
  readonly secureContext: boolean;
  readonly userAgent: string;
  readonly userAgentMemoryAvailable: boolean;
}

interface ColdMountResult {
  readonly sampleId: string;
  readonly instanceId: string;
  readonly endpoint: 'interactive-ready';
  readonly startedAt: number;
  readonly durationMs: number;
  readonly createDurationMs: number;
  readonly mountReadyDurationMs: number;
  readonly interactiveReadyDurationMs: number;
  readonly correctnessDurationMs: number;
  readonly revision: string;
  readonly contentHash: string;
  readonly readyEventCount: number;
  readonly inspection: HostInspection;
}

interface MultiInstanceResult {
  readonly passed: boolean;
  readonly requestedCount: AcceptanceInstanceCount;
  readonly instanceIds: readonly string[];
  readonly allInteractive: boolean;
  readonly state: AcceptanceState;
}

interface DisposableRealmCreatedResult {
  readonly passed: boolean;
  readonly requestedCount: DisposableRealmInstanceCount;
  readonly instanceIds: readonly string[];
  readonly allInteractive: boolean;
  readonly state: AcceptanceState;
}

interface UnmountRemountResult {
  readonly instanceId: string;
  readonly oldHostId: string;
  readonly newHostId: string;
  readonly firstUnmountOk: boolean;
  readonly secondUnmountOk: boolean;
  readonly oldHostRendererRootCount: number;
  readonly oldHostCanvasCount: number;
  readonly beforeRevision: string;
  readonly afterRevision: string;
  readonly beforeContentHash: string;
  readonly afterContentHash: string;
  readonly modelPreserved: boolean;
  readonly readyEventCount: number;
  readonly inspection: HostInspection;
}

interface DestroyedInstanceResult {
  readonly instanceId: string;
  readonly lifecycle: string;
  readonly queuedTasks: number;
  readonly activeTasks: number;
  readonly mountedResources: number;
  readonly destroyedEventCount: number;
  readonly rendererRootCount: number;
  readonly canvasCount: number;
  readonly portalCount: number;
  readonly revision: string;
  readonly contentHash: string;
  readonly idempotent: boolean;
  readonly resourceLedgerBefore: Readonly<BomEditorResourceDiagnostics>;
  readonly resourceLedgerAfter: Readonly<BomEditorResourceDiagnostics>;
}

interface DestroyInstancesResult {
  readonly passed: boolean;
  readonly requestedCount: AcceptanceInstanceCount | null;
  readonly destroyedCount: number;
  readonly instances: readonly DestroyedInstanceResult[];
  readonly remainingRendererRootCount: number;
  readonly remainingCanvasCount: number;
  readonly remainingPortalCount: number;
  readonly state: AcceptanceState;
}

interface DisposableRealmResourceAssertion {
  readonly resource: DisposableRealmResource;
  readonly status: DisposableRealmAssertionStatus;
  readonly instrumentationSupported: boolean;
  /** Canonical field consumed by the Realm-memory qualification reducer. */
  readonly supported: boolean;
  readonly tracked: boolean;
  readonly before: number | null;
  readonly after: number | null;
  readonly outstanding: number | null;
  readonly ledgerKinds: readonly string[];
  readonly evidence:
    | 'same-origin-retained-reference'
    | 'same-origin-retained-reference+typed-resource-ledger'
    | 'typed-resource-ledger'
    | 'zero-instance-control-no-component-construction'
    | 'public-diagnostics-unavailable';
  readonly blocker: string | null;
}

interface DisposableRealmReadyResult {
  readonly protocolVersion: 'bom-disposable-realm/v1';
  readonly realmId: string;
  readonly phase: 'ready';
  readonly sameOrigin: true;
  readonly frameAttached: true;
  readonly frameRemoved: false;
  readonly childApiVersion: 1;
  readonly instanceCount: DisposableRealmInstanceCount;
  readonly childUrl: string;
  readonly childOrigin: string;
  readonly created: DisposableRealmCreatedResult;
}

interface DisposableRealmDestroyResult {
  readonly protocolVersion: 'bom-disposable-realm/v1';
  readonly realmId: string;
  readonly phase: 'destroyed' | 'blocked';
  readonly passed: boolean;
  readonly sameOrigin: true;
  readonly frameAttached: true;
  readonly frameRemoved: false;
  readonly removalAuthorized: boolean;
  readonly publicDiagnosticsTypedLedgersRequired: boolean;
  readonly publicDiagnosticsTypedLedgersAvailable: boolean;
  readonly publicDiagnosticsTypedLedgerCount: number;
  readonly publicDiagnosticsMountedResourcesAfter: number;
  readonly assertions: readonly DisposableRealmResourceAssertion[];
  readonly blockers: readonly string[];
  readonly destroyed: DestroyInstancesResult;
}

interface DisposableRealmReleaseResult {
  readonly protocolVersion: 'bom-disposable-realm/v1';
  readonly realmId: string;
  readonly released: boolean;
  readonly phase: 'released' | 'blocked';
  readonly frameRemoved: boolean;
  /** Persistent coordinator references only; the call-frame local dies on return. */
  readonly parentReferencesReleased: boolean;
  readonly parentReferenceScope: 'persistent-coordinator-state-after-detach';
  readonly qualified: boolean;
  readonly blockers: readonly string[];
}

interface DisposableRealmDiscardResult {
  readonly protocolVersion: 'bom-disposable-realm/v1';
  readonly realmId: string;
  readonly discarded: true;
  readonly frameRemoved: true;
  readonly qualified: false;
  readonly reason: 'non-evidence-cleanup';
}

interface TransactionEventTrace {
  readonly type: string;
  readonly instanceId: string;
  readonly sequence: number;
  readonly transactionId: string;
  readonly origin: string;
  readonly previousRevision: string | null;
  readonly revision: string | null;
  readonly operationCount: number | null;
}

interface CorrectnessResult {
  readonly passed: boolean;
  readonly instanceId: string;
  readonly targetOccurrenceId: string;
  readonly targetColumnId: string;
  readonly contentHashBefore: string;
  readonly contentHashAfterEdit: string;
  readonly contentHashAfterUndo: string;
  readonly revisionBefore: string;
  readonly revisionAfterEdit: string;
  readonly revisionAfterUndo: string;
  readonly setFieldTransactionCount: number;
  readonly setFieldOperationCount: number;
  readonly eventSequenceMatches: boolean;
  readonly eventEnvelopeMatches: boolean;
  readonly undoHashRestored: boolean;
  readonly otherInstancesUnchanged: boolean;
  readonly events: readonly TransactionEventTrace[];
}

interface PreparedInputResult {
  readonly sampleId: string;
  readonly instanceId: string;
  readonly selector: string;
  readonly position: AcceptancePoint;
  readonly point: AcceptancePoint;
  readonly replacementText: string;
  readonly originalValue: string;
  readonly targetOccurrenceId: string;
  readonly targetColumnId: string;
  readonly visibleIndex: number;
  readonly ariaRowIndex: number;
}

interface ArmedInputResult {
  readonly sampleId: string;
  readonly armed: true;
  readonly revisionBefore: string;
  readonly expectedValue: string;
}

interface InputFeedbackResult {
  readonly sampleId: string;
  readonly endpoint: 'aria-mutation-after-canvas-draw-render-commit-candidate';
  readonly inputStartMs: number;
  readonly captureObservedMs: number;
  readonly captureDelayMs: number;
  readonly transactionCommittedMs: number;
  readonly transactionDurationMs: number;
  readonly renderCommitCandidateMs: number;
  readonly renderAfterTransactionMs: number;
  readonly durationMs: number;
  readonly transactionCount: number;
  readonly revisionBefore: string;
  readonly revisionAfter: string;
  readonly expectedValue: string;
  readonly semanticValueMatched: boolean;
  readonly compositorPresentationQualified: false;
}

interface ResetInputResult {
  readonly sampleId: string;
  readonly passed: boolean;
  readonly undoApplied: boolean;
  readonly contentHashRestored: boolean;
  readonly revision: string;
  readonly contentHash: string;
}

interface ApplicationPixelLayerSample {
  readonly layer: 'background' | 'content';
  readonly readbackSucceeded: boolean;
  readonly sampledPixelCount: number;
  readonly nonTransparentPixelCount: number;
  readonly rgbaChecksum: string | null;
}

interface ApplicationPixelPaintState {
  readonly sequence: number;
  readonly completedAtMs: number;
  readonly revision: string;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly viewport: Readonly<{
    readonly width: number;
    readonly height: number;
  }>;
  readonly surface: Readonly<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }>;
  readonly layers: readonly ApplicationPixelLayerSample[];
}

interface ApplicationPixelScrollState {
  readonly sequence: number;
  readonly changedAtMs: number;
  readonly requestedScrollTop: number;
  readonly observedScrollTop: number;
}

interface ContinuousScrollEvidence {
  readonly schemaVersion: 'bom-f3-application-pixel-frame-evidence/v1';
  readonly protocolId: 'bom-f3-fixed-scroll-pixel-correlation/v1';
  readonly window: Readonly<{
    readonly id: 'f3-10k-scroll-30s';
    readonly startMark: string;
    readonly endMark: string;
    readonly startTimeMs: number;
    readonly endTimeMs: number;
    readonly durationMs: number;
  }>;
  readonly expectedRevision: string;
  readonly trajectory: Readonly<{
    readonly protocol: 'bom-f3-scroll-trajectory/v1';
    readonly axis: 'vertical';
    readonly waveform: 'triangle';
    readonly direction: 'forward-then-reverse';
    readonly easing: 'linear';
    readonly driver: 'requestAnimationFrame';
    readonly cycles: 1;
    readonly durationMs: number;
    readonly minimumScrollTop: 0;
    readonly maximumScrollTop: number;
    readonly finalObservedScrollTop: number;
  }>;
  readonly scrollStates: readonly ApplicationPixelScrollState[];
  readonly paintStates: readonly ApplicationPixelPaintState[];
  readonly completeness: Readonly<{
    readonly scrollStateCount: number;
    readonly paintStateCount: number;
    readonly paintStatesInsideWindow: number;
    readonly readbackFailureCount: number;
  }>;
}

interface BomF3AcceptanceApiV1 {
  readonly version: 1;
  readonly ready: Promise<AcceptanceMetadata>;
  metadata(): AcceptanceMetadata;
  coldMount(
    input: string | Readonly<{ readonly sampleId: string }>,
  ): Promise<ColdMountResult>;
  prepareInput(
    input: string | Readonly<{ readonly sampleId: string }>,
  ): Promise<PreparedInputResult>;
  armInput(
    input: Readonly<{
      readonly sampleId: string;
      readonly expectedValue: string;
    }>,
  ): Promise<ArmedInputResult>;
  waitForInput(
    input: string | Readonly<{ readonly sampleId: string }>,
  ): Promise<InputFeedbackResult>;
  resetInput(
    input: string | Readonly<{ readonly sampleId: string }>,
  ): Promise<ResetInputResult>;
  runContinuousScroll(): Promise<ContinuousScrollEvidence>;
  reset(): Promise<AcceptanceState>;
  release(): Promise<AcceptanceState>;
  createInstances(
    input:
      | AcceptanceInstanceCount
      | Readonly<{ readonly instanceCount: AcceptanceInstanceCount }>,
  ): Promise<MultiInstanceResult>;
  unmountRemountPrimary(): Promise<UnmountRemountResult>;
  destroyInstances(
    input?:
      | AcceptanceInstanceCount
      | Readonly<{ readonly instanceCount: AcceptanceInstanceCount }>,
  ): Promise<DestroyInstancesResult>;
  createDisposableRealm(
    input: Readonly<{
      readonly realmId: string;
      readonly instanceCount: DisposableRealmInstanceCount;
    }>,
  ): Promise<DisposableRealmReadyResult>;
  destroyDisposableRealm(
    input: string | Readonly<{ readonly realmId: string }>,
  ): Promise<DisposableRealmDestroyResult>;
  releaseDisposableRealm(
    input: string | Readonly<{ readonly realmId: string }>,
  ): Promise<DisposableRealmReleaseResult>;
  discardDisposableRealm(
    input: string | Readonly<{ readonly realmId: string }>,
  ): Promise<DisposableRealmDiscardResult>;
  runCorrectness(): Promise<CorrectnessResult>;
  state(): AcceptanceState;
}

declare global {
  interface Window {
    __BOM_F3_ACCEPTANCE__?: Readonly<BomF3AcceptanceApiV1>;
  }
}

interface InstanceCounters {
  ready: number;
  destroyed: number;
}

interface ActiveInstance {
  readonly instanceId: string;
  readonly panel: HTMLElement;
  readonly editor: BomEditor<BomFields>;
  readonly counters: InstanceCounters;
  readonly unsubscribers: Array<() => void>;
  hostId: string;
  host: HTMLDivElement;
  interactiveVerified: boolean;
  cachedRevision: string;
  cachedContentHash: string;
  remountCount: number;
}

interface ActiveDisposableRealm {
  readonly realmId: string;
  readonly instanceCount: DisposableRealmInstanceCount;
  readonly childUrl: string;
  readonly frame: HTMLIFrameElement;
  readonly api: Readonly<BomF3AcceptanceApiV1>;
  phase: DisposableRealmPhase;
  destroyResult: DisposableRealmDestroyResult | null;
}

interface ActiveScrollCapture {
  readonly instanceId: string;
  readonly scratchCanvas: HTMLCanvasElement;
  readonly scratchContext: CanvasRenderingContext2D;
  readonly paintStates: ApplicationPixelPaintState[];
}

interface DisposableRealmDomCapture {
  readonly rendererRoots: readonly HTMLElement[];
  readonly canvases: readonly HTMLCanvasElement[];
  readonly portals: readonly HTMLInputElement[];
}

interface PreparedInputSession {
  readonly sampleId: string;
  readonly instanceId: string;
  readonly originalValue: string;
  readonly replacementText: string;
  readonly revisionBefore: string;
  readonly contentHashBefore: string;
}

interface ArmedInputSession extends PreparedInputSession {
  readonly expectedValue: string;
  readonly result: Promise<InputFeedbackResult>;
  readonly resolveResult: (result: InputFeedbackResult) => void;
  readonly rejectResult: (failure: Error) => void;
  readonly unsubscribeTransaction: () => void;
  readonly unsubscribeKeydown: () => void;
  readonly observer: MutationObserver;
  readonly timeoutId: number;
  inputStartMs: number | null;
  captureObservedMs: number | null;
  transactionCommittedMs: number | null;
  renderCommitCandidateMs: number | null;
  transactionCount: number;
  revisionAfter: string | null;
  settled: boolean;
}

const fixture = generateFixture(BOM_10K_D6);
const scenario = F3_10K_EDIT_SCENARIO;
const scenarioErrors = validateBenchmarkScenario(
  scenario,
  fixture.definition,
  fixture.schema,
);
if (scenarioErrors.length > 0) {
  throw new Error('BOM_ACCEPTANCE_SCENARIO_INVALID:' + scenarioErrors.join(','));
}

const fixtureContentHash = hashSnapshot(fixture.snapshot);
const scenarioManifest = createBenchmarkScenarioManifestEntry(scenario);
const materialCodeByOccurrence = new Map(
  fixture.snapshot.nodes.map((node) => [
    node.occurrenceId,
    node.materialCode ?? '',
  ]),
);
const schemaFieldById = new Map(
  fixture.schema.fields.map((field) => [field.fieldId, field]),
);
const fallbackField = schemaFieldById.get('name');
if (fallbackField === undefined) {
  throw new Error('BOM_ACCEPTANCE_NAME_FIELD_MISSING');
}
const columns = Object.freeze(
  scenario.columns.map((column) => {
    const field =
      column.source.kind === 'field'
        ? schemaFieldById.get(column.source.fieldId)
        : fallbackField;
    if (field === undefined) {
      throw new Error('BOM_ACCEPTANCE_COLUMN_FIELD_MISSING:' + column.columnId);
    }
    return Object.freeze({
      columnId: column.columnId,
      fieldPath: field.path,
      label: column.label,
      width: column.width,
      editable: column.source.kind === 'field' && column.editable,
      frozen: column.frozen ? ('start' as const) : (false as const),
      a11y: Object.freeze({ label: column.label }),
    });
  }),
);
const targetNode =
  fixture.snapshot.nodes[scenario.interaction.targetOccurrenceOrdinal] ??
  acceptanceFailure('BOM_ACCEPTANCE_TARGET_NODE_MISSING');
const targetColumn = scenario.columns.find(
  (column) => column.columnId === scenario.interaction.targetColumnId,
);
if (targetColumn?.source.kind !== 'field') {
  throw new Error('BOM_ACCEPTANCE_TARGET_MISSING');
}
const targetField =
  schemaFieldById.get(targetColumn.source.fieldId) ??
  acceptanceFailure('BOM_ACCEPTANCE_TARGET_FIELD_MISSING');
const inputTargetOriginalValue = targetNode.fields['name'];
if (typeof inputTargetOriginalValue !== 'string') {
  throw new Error('BOM_ACCEPTANCE_INPUT_TARGET_VALUE_INVALID');
}

const hostGrid = requiredElement<HTMLElement>('acceptance-host-grid');
const statusOutput = requiredElement<HTMLOutputElement>('acceptance-status');
const APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA =
  'bom-f3-application-pixel-frame-evidence/v1' as const;
const APPLICATION_PIXEL_SCROLL_PROTOCOL =
  'bom-f3-fixed-scroll-pixel-correlation/v1' as const;
const F3_SCROLL_TRACE_WINDOW_ID = 'f3-10k-scroll-30s' as const;
const APPLICATION_PIXEL_SAMPLE_WIDTH = 64;
const APPLICATION_PIXEL_SAMPLE_HEIGHT = 32;
const APPLICATION_PIXEL_SAMPLE_CSS_WIDTH = 512;
const APPLICATION_PIXEL_SAMPLE_CSS_HEIGHT = 256;
const DISPOSABLE_REALM_PROTOCOL_VERSION =
  'bom-disposable-realm/v1' as const;
const DISPOSABLE_REALM_QUERY_KEY = 'bom-disposable-realm';
const DISPOSABLE_REALM_ID_QUERY_KEY = 'bom-disposable-realm-id';
const EDITOR_RESOURCE_LEDGER_PROTOCOL = 'bom-editor-resource-ledger/v1';
const EDITOR_TASK_LEDGER_PROTOCOL = 'bom-editor-task-ledger/v1';
const EDITOR_WORKER_TASK_LEDGER_PROTOCOL =
  'bom-editor-worker-task-ledger/v1';
const RENDERER_RESOURCE_LEDGER_PROTOCOL =
  'bom-resource-registry-ledger/v1';
const EXPECTED_RENDERER_RESOURCE_KINDS = Object.freeze([
  'animation-frame',
  'canvas',
  'custom-cell-renderer',
  'event-listener',
  'font-ready',
  'intersection-observer',
  'interval',
  'mutation-observer',
  'portal',
  'renderer-dom-state',
  'renderer-root',
  'resize-observer',
  'timeout',
  'worker',
  'worker-task',
]);
const DISPOSABLE_REALM_LEDGER_KINDS: Readonly<
  Record<DisposableRealmResource, readonly string[]>
> = Object.freeze({
  dom: Object.freeze(['renderer-root', 'renderer-dom-state']),
  canvas: Object.freeze(['canvas']),
  portal: Object.freeze(['portal']),
  worker: Object.freeze([
    'worker',
    'worker-task',
    'editor-worker-task',
  ]),
  'dom-listener': Object.freeze([
    'event-listener',
    'event-hub-listener',
  ]),
  'resize-observer': Object.freeze(['resize-observer']),
  'mutation-observer': Object.freeze(['mutation-observer']),
  'intersection-observer': Object.freeze(['intersection-observer']),
  'animation-frame': Object.freeze(['animation-frame']),
  timeout: Object.freeze(['timeout']),
  interval: Object.freeze(['interval']),
});
const DISPOSABLE_REALM_UNAVAILABLE_BLOCKERS: Readonly<
  Record<DisposableRealmResource, string>
> = Object.freeze({
  dom: 'BOM_ACCEPTANCE_REALM_DOM_LEDGER_UNAVAILABLE',
  canvas: 'BOM_ACCEPTANCE_REALM_CANVAS_LEDGER_UNAVAILABLE',
  portal: 'BOM_ACCEPTANCE_REALM_PORTAL_LEDGER_UNAVAILABLE',
  worker: 'BOM_ACCEPTANCE_WORKER_LEDGER_UNAVAILABLE',
  'dom-listener': 'BOM_ACCEPTANCE_DOM_LISTENER_LEDGER_UNAVAILABLE',
  'resize-observer': 'BOM_ACCEPTANCE_RESIZE_OBSERVER_LEDGER_UNAVAILABLE',
  'mutation-observer':
    'BOM_ACCEPTANCE_MUTATION_OBSERVER_LEDGER_UNAVAILABLE',
  'intersection-observer':
    'BOM_ACCEPTANCE_INTERSECTION_OBSERVER_LEDGER_UNAVAILABLE',
  'animation-frame': 'BOM_ACCEPTANCE_RAF_LEDGER_UNAVAILABLE',
  timeout: 'BOM_ACCEPTANCE_TIMEOUT_LEDGER_UNAVAILABLE',
  interval: 'BOM_ACCEPTANCE_INTERVAL_LEDGER_UNAVAILABLE',
});
const DISPOSABLE_REALM_RELEASE_BLOCKERS: Readonly<
  Record<DisposableRealmResource, string>
> = Object.freeze({
  dom: 'BOM_ACCEPTANCE_REALM_DOM_RELEASE_FAILED',
  canvas: 'BOM_ACCEPTANCE_REALM_CANVAS_BACKING_RELEASE_FAILED',
  portal: 'BOM_ACCEPTANCE_REALM_PORTAL_RELEASE_FAILED',
  worker: 'BOM_ACCEPTANCE_WORKER_RELEASE_FAILED',
  'dom-listener': 'BOM_ACCEPTANCE_DOM_LISTENER_RELEASE_FAILED',
  'resize-observer': 'BOM_ACCEPTANCE_RESIZE_OBSERVER_RELEASE_FAILED',
  'mutation-observer':
    'BOM_ACCEPTANCE_MUTATION_OBSERVER_RELEASE_FAILED',
  'intersection-observer':
    'BOM_ACCEPTANCE_INTERSECTION_OBSERVER_RELEASE_FAILED',
  'animation-frame': 'BOM_ACCEPTANCE_RAF_RELEASE_FAILED',
  timeout: 'BOM_ACCEPTANCE_TIMEOUT_RELEASE_FAILED',
  interval: 'BOM_ACCEPTANCE_INTERVAL_RELEASE_FAILED',
});
let activeInstances: ActiveInstance[] = [];
let activeDisposableRealm: ActiveDisposableRealm | null = null;
let activeScrollCapture: ActiveScrollCapture | null = null;
let phase: AcceptancePhase = 'idle';
let lastOperation = 'initialize';
let lastError: string | null = null;
let runSequence = 0;
let operationTail: Promise<void> = Promise.resolve();
let inputSession: PreparedInputSession | ArmedInputSession | null = null;
const activeTimingMarks = new Set<string>();

const metadataValue = createMetadata();
const ready = Promise.resolve(metadataValue);
const api: Readonly<BomF3AcceptanceApiV1> = Object.freeze({
  version: 1,
  ready,
  metadata: (): AcceptanceMetadata => createMetadata(),
  coldMount: (
    input: string | Readonly<{ readonly sampleId: string }>,
  ): Promise<ColdMountResult> =>
    enqueueOperation('coldMount', () =>
      coldMountInternal(sampleIdFromInput(input)),
    ),
  prepareInput: (
    input: string | Readonly<{ readonly sampleId: string }>,
  ): Promise<PreparedInputResult> =>
    enqueueOperation('prepareInput', () =>
      prepareInputInternal(sampleIdFromInput(input)),
    ),
  armInput: (
    input: Readonly<{
      readonly sampleId: string;
      readonly expectedValue: string;
    }>,
  ): Promise<ArmedInputResult> =>
    enqueueOperation('armInput', () => armInputInternal(input)),
  waitForInput: (
    input: string | Readonly<{ readonly sampleId: string }>,
  ): Promise<InputFeedbackResult> =>
    enqueueOperation('waitForInput', () =>
      waitForInputInternal(sampleIdFromInput(input)),
    ),
  resetInput: (
    input: string | Readonly<{ readonly sampleId: string }>,
  ): Promise<ResetInputResult> =>
    enqueueOperation('resetInput', () =>
      resetInputInternal(sampleIdFromInput(input)),
    ),
  runContinuousScroll: (): Promise<ContinuousScrollEvidence> =>
    enqueueOperation('runContinuousScroll', runContinuousScrollInternal),
  reset: (): Promise<AcceptanceState> =>
    enqueueOperation('reset', resetInternal),
  release: (): Promise<AcceptanceState> =>
    enqueueOperation('release', releaseInternal),
  createInstances: (
    input:
      | AcceptanceInstanceCount
      | Readonly<{ readonly instanceCount: AcceptanceInstanceCount }>,
  ): Promise<MultiInstanceResult> =>
    enqueueOperation('createInstances', () =>
      createInstancesInternal(instanceCountFromInput(input)),
    ),
  unmountRemountPrimary: (): Promise<UnmountRemountResult> =>
    enqueueOperation('unmountRemountPrimary', unmountRemountPrimaryInternal),
  destroyInstances: (
    input?:
      | AcceptanceInstanceCount
      | Readonly<{ readonly instanceCount: AcceptanceInstanceCount }>,
  ): Promise<DestroyInstancesResult> =>
    enqueueOperation('destroyInstances', () =>
      destroyInstancesInternal(optionalInstanceCountFromInput(input)),
    ),
  createDisposableRealm: (
    input: Readonly<{
      readonly realmId: string;
      readonly instanceCount: DisposableRealmInstanceCount;
    }>,
  ): Promise<DisposableRealmReadyResult> =>
    enqueueOperation('createDisposableRealm', () =>
      createDisposableRealmInternal(input),
    ),
  destroyDisposableRealm: (
    input: string | Readonly<{ readonly realmId: string }>,
  ): Promise<DisposableRealmDestroyResult> =>
    enqueueOperation('destroyDisposableRealm', () =>
      destroyDisposableRealmInternal(realmIdFromInput(input)),
    ),
  releaseDisposableRealm: (
    input: string | Readonly<{ readonly realmId: string }>,
  ): Promise<DisposableRealmReleaseResult> =>
    enqueueOperation('releaseDisposableRealm', () =>
      releaseDisposableRealmInternal(realmIdFromInput(input)),
    ),
  discardDisposableRealm: (
    input: string | Readonly<{ readonly realmId: string }>,
  ): Promise<DisposableRealmDiscardResult> =>
    enqueueOperation('discardDisposableRealm', () =>
      discardDisposableRealmInternal(realmIdFromInput(input)),
    ),
  runCorrectness: (): Promise<CorrectnessResult> =>
    enqueueOperation('runCorrectness', runCorrectnessInternal),
  state: (): AcceptanceState => currentState(),
});

window.__BOM_F3_ACCEPTANCE__ = api;
updateStatus();

function createMetadata(): AcceptanceMetadata {
  return Object.freeze({
    apiVersion: 1,
    fixture: Object.freeze({
      id: fixture.manifest.id,
      definitionFingerprint: fixture.manifest.definitionFingerprint,
      seed: fixture.manifest.seed,
      nodeCount: fixture.manifest.nodeCount,
      schemaVersion: fixture.manifest.schemaVersion,
      contentHash: fixtureContentHash,
      snapshotContentSha256: fixtureContentHash,
    }),
    scenario: Object.freeze({
      id: scenario.id,
      version: scenario.scenarioVersion,
      fingerprint: scenarioManifest.scenarioFingerprint,
      fixtureId: scenario.fixtureId,
    }),
    fixtureId: fixture.manifest.id,
    fixtureFingerprint: fixture.manifest.definitionFingerprint,
    fixtureSeed: fixture.manifest.seed,
    fixtureNodeCount: fixture.manifest.nodeCount,
    fixtureContentHash,
    scenarioId: scenario.id,
    scenarioVersion: scenario.scenarioVersion,
    scenarioFingerprint: scenarioManifest.scenarioFingerprint,
    schemaVersion: fixture.schema.schemaVersion,
    viewport: Object.freeze({ ...scenario.viewport }),
    font: Object.freeze({ ...scenario.font }),
    crossOriginIsolated: window.crossOriginIsolated,
    secureContext: window.isSecureContext,
    userAgent: navigator.userAgent,
    userAgentMemoryAvailable:
      'measureUserAgentSpecificMemory' in performance,
  });
}

function enqueueOperation<T>(
  operation: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const result = operationTail.then(async (): Promise<T> => {
    lastOperation = operation;
    lastError = null;
    phase = 'running';
    updateStatus();
    try {
      assertOperationCompatibleWithDisposableRealm(operation);
      const value = await work();
      updateStatus();
      return value;
    } catch (failure) {
      phase = 'error';
      lastError = safeErrorMessage(failure);
      updateStatus();
      throw failure;
    }
  });
  operationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function coldMountInternal(sampleIdInput: string): Promise<ColdMountResult> {
  await clearInstances();
  const sampleId = normalizeSampleId(sampleIdInput);
  const instanceId = 'bom-f3-cold-' + sampleId;
  const panel = appendPanel(instanceId, 0);
  const host = panel.querySelector<HTMLDivElement>('.acceptance-host');
  if (host === null) {
    throw new Error('BOM_ACCEPTANCE_HOST_MISSING');
  }
  hostGrid.dataset['count'] = '1';
  await document.fonts.ready;

  const startedAt = performance.now();
  writeTimingMark('bom:f3:cold:' + sampleId + ':start', startedAt);
  const entry = createEntry(instanceId, panel, host);
  activeInstances = [entry];
  const createdAt = performance.now();
  const mounted = await entry.editor.mount(entry.host);
  const readyAt = performance.now();
  writeTimingMark(
    'bom:f3:cold:' + sampleId + ':interactive-ready',
    readyAt,
  );
  requireOk(mounted, 'mount');
  requireOk(await entry.editor.ready, 'ready');
  const inspection = await verifyInteractive(entry);
  const completedAt = performance.now();
  const durationMs = readyAt - startedAt;
  phase = 'mounted';

  return Object.freeze({
    sampleId,
    instanceId,
    endpoint: 'interactive-ready',
    startedAt,
    durationMs,
    createDurationMs: createdAt - startedAt,
    mountReadyDurationMs: durationMs,
    interactiveReadyDurationMs: durationMs,
    correctnessDurationMs: completedAt - readyAt,
    revision: entry.editor.getSnapshot().revision,
    contentHash: contentHashForEntry(entry),
    readyEventCount: entry.counters.ready,
    inspection,
  });
}

async function createInstancesInternal(
  countInput: AcceptanceInstanceCount,
): Promise<MultiInstanceResult> {
  const count = normalizeInstanceCount(countInput);
  await clearInstances();
  runSequence += 1;
  hostGrid.dataset['count'] = String(count);

  const entries: ActiveInstance[] = [];
  for (let index = 0; index < count; index += 1) {
    const instanceId =
      'bom-f3-multi-' + String(runSequence) + '-' + String(index + 1);
    const panel = appendPanel(instanceId, index);
    const host = panel.querySelector<HTMLDivElement>('.acceptance-host');
    if (host === null) {
      throw new Error('BOM_ACCEPTANCE_HOST_MISSING');
    }
    entries.push(createEntry(instanceId, panel, host));
  }
  activeInstances = entries;

  await Promise.all(entries.map((entry) => mountEditor(entry)));
  const inspections: HostInspection[] = [];
  for (const entry of entries) {
    inspections.push(await verifyInteractive(entry));
  }
  phase = 'mounted';

  return Object.freeze({
    passed:
      entries.length === count &&
      inspections.every((inspection) => inspection.interactive),
    requestedCount: count,
    instanceIds: Object.freeze(entries.map((entry) => entry.instanceId)),
    allInteractive: inspections.every((inspection) => inspection.interactive),
    state: currentState(),
  });
}

async function runContinuousScrollInternal(): Promise<ContinuousScrollEvidence> {
  if (activeScrollCapture !== null) {
    throw new Error('BOM_ACCEPTANCE_SCROLL_CAPTURE_ALREADY_ACTIVE');
  }
  discardInputSession();
  clearTimingMarks();
  const entry = requirePrimaryInstance();
  const treegrid = entry.host.querySelector<HTMLElement>('[role="treegrid"]');
  if (treegrid === null) {
    throw new Error('BOM_ACCEPTANCE_SCROLL_TREEGRID_MISSING');
  }
  const maximumScrollTop = Math.max(
    0,
    treegrid.scrollHeight - treegrid.clientHeight,
  );
  if (maximumScrollTop <= 0) {
    throw new Error('BOM_ACCEPTANCE_SCROLL_RANGE_MISSING');
  }
  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = APPLICATION_PIXEL_SAMPLE_WIDTH;
  scratchCanvas.height = APPLICATION_PIXEL_SAMPLE_HEIGHT;
  const scratchContext = scratchCanvas.getContext('2d', {
    willReadFrequently: true,
  });
  if (scratchContext === null) {
    throw new Error('BOM_ACCEPTANCE_PIXEL_READBACK_CONTEXT_MISSING');
  }
  const capture: ActiveScrollCapture = {
    instanceId: entry.instanceId,
    scratchCanvas,
    scratchContext,
    paintStates: [],
  };
  activeScrollCapture = capture;
  const scrollStates: ApplicationPixelScrollState[] = [];
  const startMark =
    'bom:f3:scroll:' + F3_SCROLL_TRACE_WINDOW_ID + ':start';
  const endMark =
    'bom:f3:scroll:' + F3_SCROLL_TRACE_WINDOW_ID + ':end';
  let startTimeMs = 0;
  let endTimeMs = 0;
  let scrollSequence = 0;
  try {
    treegrid.scrollTop = 0;
    treegrid.scrollLeft = 0;
    treegrid.dispatchEvent(new Event('scroll'));
    await nextAnimationFrame();
    await nextTask();

    startTimeMs = performance.now();
    writeTimingMark(startMark, startTimeMs);
    scrollStates.push(Object.freeze({
      sequence: scrollSequence,
      changedAtMs: startTimeMs,
      requestedScrollTop: 0,
      observedScrollTop: treegrid.scrollTop,
    }));
    const scheduledDurationMs = scenario.scrollTrajectory.durationMs;
    const scheduledEndTimeMs = startTimeMs + scheduledDurationMs;
    for (;;) {
      const now = performance.now();
      const elapsedMs = now - startTimeMs;
      if (elapsedMs >= scheduledDurationMs) {
        endTimeMs = scheduledEndTimeMs;
        writeTimingMark(endMark, endTimeMs);
        break;
      }
      const progress = elapsedMs / scheduledDurationMs;
      const triangle = progress <= 0.5
        ? progress * 2
        : (1 - progress) * 2;
      const requestedScrollTop = Math.round(maximumScrollTop * triangle);
      treegrid.scrollTop = requestedScrollTop;
      treegrid.dispatchEvent(new Event('scroll'));
      scrollSequence += 1;
      scrollStates.push(Object.freeze({
        sequence: scrollSequence,
        changedAtMs: now,
        requestedScrollTop,
        observedScrollTop: treegrid.scrollTop,
      }));
      await nextAnimationFrame();
      await nextTask();
    }
  } finally {
    activeScrollCapture = null;
  }

  const paintStates = Object.freeze(
    capture.paintStates.filter((paint) => paint.completedAtMs <= endTimeMs),
  );
  const frozenScrollStates = Object.freeze([...scrollStates]);
  const durationMs = endTimeMs - startTimeMs;
  const readbackFailureCount = paintStates.reduce(
    (count, paint) =>
      count + paint.layers.filter((layer) => !layer.readbackSucceeded).length,
    0,
  );
  const result: ContinuousScrollEvidence = Object.freeze({
    schemaVersion: APPLICATION_PIXEL_FRAME_EVIDENCE_SCHEMA,
    protocolId: APPLICATION_PIXEL_SCROLL_PROTOCOL,
    window: Object.freeze({
      id: F3_SCROLL_TRACE_WINDOW_ID,
      startMark,
      endMark,
      startTimeMs,
      endTimeMs,
      durationMs,
    }),
    expectedRevision: entry.editor.getSnapshot().revision,
    trajectory: Object.freeze({
      ...scenario.scrollTrajectory,
      minimumScrollTop: 0 as const,
      maximumScrollTop,
      finalObservedScrollTop: treegrid.scrollTop,
    }),
    scrollStates: frozenScrollStates,
    paintStates,
    completeness: Object.freeze({
      scrollStateCount: frozenScrollStates.length,
      paintStateCount: paintStates.length,
      paintStatesInsideWindow: paintStates.filter(
        (paint) =>
          paint.completedAtMs >= startTimeMs &&
          paint.completedAtMs <= endTimeMs,
      ).length,
      readbackFailureCount,
    }),
  });

  treegrid.scrollTop = 0;
  treegrid.dispatchEvent(new Event('scroll'));
  await nextAnimationFrame();
  phase = 'mounted';
  return result;
}

async function unmountRemountPrimaryInternal(): Promise<UnmountRemountResult> {
  const entry = requirePrimaryInstance();
  const beforeRevision = entry.editor.getSnapshot().revision;
  const beforeContentHash = contentHashForEntry(entry);
  const oldHost = entry.host;
  const oldHostId = entry.hostId;
  const firstUnmount = entry.editor.unmount();
  const secondUnmount = entry.editor.unmount();
  const oldHostRendererRootCount = oldHost.querySelectorAll(
    '[data-bom-canvas-renderer]',
  ).length;
  const oldHostCanvasCount = oldHost.querySelectorAll('canvas').length;

  entry.remountCount += 1;
  const newHostId = oldHostId + '-remount-' + String(entry.remountCount);
  const newHost = createHostElement(newHostId);
  oldHost.replaceWith(newHost);
  entry.hostId = newHostId;
  entry.host = newHost;
  entry.interactiveVerified = false;

  await mountEditor(entry);
  const inspection = await verifyInteractive(entry);
  const afterRevision = entry.editor.getSnapshot().revision;
  const afterContentHash = contentHashForEntry(entry);
  phase = 'mounted';

  return Object.freeze({
    instanceId: entry.instanceId,
    oldHostId,
    newHostId,
    firstUnmountOk: firstUnmount.ok,
    secondUnmountOk: secondUnmount.ok,
    oldHostRendererRootCount,
    oldHostCanvasCount,
    beforeRevision,
    afterRevision,
    beforeContentHash,
    afterContentHash,
    modelPreserved:
      beforeRevision === afterRevision &&
      beforeContentHash === afterContentHash,
    readyEventCount: entry.counters.ready,
    inspection,
  });
}

async function prepareInputInternal(
  sampleIdInput: string,
): Promise<PreparedInputResult> {
  if (inputSession !== null) {
    throw new Error('BOM_ACCEPTANCE_INPUT_RESET_REQUIRED');
  }
  const sampleId = normalizeSampleId(sampleIdInput);
  clearTimingMarks();
  const entry = requirePrimaryInstance();
  if (entry.editor.getDiagnostics().lifecycle !== 'ready') {
    throw new Error('BOM_ACCEPTANCE_INPUT_INSTANCE_NOT_READY');
  }
  const treegrid = entry.host.querySelector<HTMLElement>('[role="treegrid"]');
  if (treegrid === null) {
    throw new Error('BOM_ACCEPTANCE_INPUT_TREEGRID_MISSING');
  }
  const visibleIndex = entry.editor
    .getSnapshot()
    .nodes.findIndex(
      (candidate) => candidate.occurrenceId === targetNode.occurrenceId,
    );
  if (visibleIndex < 0) {
    throw new Error('BOM_ACCEPTANCE_INPUT_TARGET_NOT_VISIBLE');
  }
  treegrid.scrollTop = visibleIndex * scenario.layout.rowHeight;
  treegrid.scrollLeft = 0;
  treegrid.dispatchEvent(new Event('scroll'));
  entry.panel.scrollIntoView({ block: 'center', inline: 'nearest' });

  const originalValue = readInputTargetValue(entry);
  const ariaRowIndex = visibleIndex + 2;
  await waitForTargetSemanticCell(
    entry,
    ariaRowIndex,
    originalValue,
  );
  const replacementText =
    originalValue === scenario.interaction.replacementText
      ? scenario.interaction.replacementText + ' ' + sampleId
      : scenario.interaction.replacementText;
  const position = inputCellPosition();
  const rect = treegrid.getBoundingClientRect();
  const point = Object.freeze({
    x: rect.left + position.x,
    y: rect.top + position.y,
  });
  inputSession = Object.freeze({
    sampleId,
    instanceId: entry.instanceId,
    originalValue,
    replacementText,
    revisionBefore: entry.editor.getSnapshot().revision,
    contentHashBefore: contentHashForEntry(entry),
  });
  phase = 'mounted';

  return Object.freeze({
    sampleId,
    instanceId: entry.instanceId,
    selector: '#' + entry.hostId + ' [role="treegrid"]',
    position,
    point,
    replacementText,
    originalValue,
    targetOccurrenceId: targetNode.occurrenceId,
    targetColumnId: scenario.interaction.targetColumnId,
    visibleIndex,
    ariaRowIndex,
  });
}

function armInputInternal(
  input: Readonly<{
    readonly sampleId: string;
    readonly expectedValue: string;
  }>,
): ArmedInputResult {
  const prepared = requirePreparedInput(input.sampleId);
  if (isArmedInputSession(prepared)) {
    throw new Error('BOM_ACCEPTANCE_INPUT_ALREADY_ARMED');
  }
  if (
    typeof input.expectedValue !== 'string' ||
    input.expectedValue !== prepared.replacementText
  ) {
    throw new Error('BOM_ACCEPTANCE_INPUT_EXPECTED_VALUE_MISMATCH');
  }
  const entry = requireInputEntry(prepared);
  const portal = entry.host.querySelector<HTMLInputElement>(
    '[data-bom-editor-portal]',
  );
  if (
    portal === null ||
    portal.hidden ||
    portal.value !== input.expectedValue
  ) {
    throw new Error('BOM_ACCEPTANCE_INPUT_PORTAL_NOT_PREPARED');
  }
  const semanticWindow = entry.host.querySelector<HTMLElement>(
    '[data-bom-semantic-window]',
  );
  if (semanticWindow === null) {
    throw new Error('BOM_ACCEPTANCE_INPUT_SEMANTICS_MISSING');
  }

  let resolveResult: (result: InputFeedbackResult) => void = () => undefined;
  let rejectResult: (failure: Error) => void = () => undefined;
  const result = new Promise<InputFeedbackResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  let armed: ArmedInputSession;
  const keydownListener = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (
      keyboardEvent.key === 'Enter' &&
      keyboardEvent.target === portal &&
      armed.inputStartMs === null
    ) {
      armed.inputStartMs = keyboardEvent.timeStamp;
      armed.captureObservedMs = performance.now();
      writeTimingMark(
        'bom:f3:input:' + armed.sampleId + ':keydown',
        keyboardEvent.timeStamp,
      );
    }
  };
  entry.host.addEventListener('keydown', keydownListener, true);
  const unsubscribeKeydown = (): void => {
    entry.host.removeEventListener('keydown', keydownListener, true);
  };
  const unsubscribeTransaction = entry.editor.on(
    'transactionCommitted',
    (event) => {
      if (event.origin !== 'editor:cell') {
        return;
      }
      armed.transactionCount += 1;
      armed.revisionAfter = event.revision;
      if (armed.transactionCommittedMs === null) {
        armed.transactionCommittedMs = performance.now();
        writeTimingMark(
          'bom:f3:input:' + armed.sampleId + ':transaction-committed',
          armed.transactionCommittedMs,
        );
      }
    },
  );
  const observer = new MutationObserver(() => {
    completeInputIfRendered(armed, entry, semanticWindow);
  });
  observer.observe(semanticWindow, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  const timeoutId = window.setTimeout(() => {
    failArmedInput(
      armed,
      new Error('BOM_ACCEPTANCE_INPUT_RENDER_TIMEOUT'),
    );
  }, 5_000);
  armed = {
    ...prepared,
    expectedValue: input.expectedValue,
    result,
    resolveResult,
    rejectResult,
    unsubscribeTransaction,
    unsubscribeKeydown,
    observer,
    timeoutId,
    inputStartMs: null,
    captureObservedMs: null,
    transactionCommittedMs: null,
    renderCommitCandidateMs: null,
    transactionCount: 0,
    revisionAfter: null,
    settled: false,
  };
  inputSession = armed;
  phase = 'mounted';

  return Object.freeze({
    sampleId: armed.sampleId,
    armed: true,
    revisionBefore: armed.revisionBefore,
    expectedValue: armed.expectedValue,
  });
}

async function waitForInputInternal(
  sampleIdInput: string,
): Promise<InputFeedbackResult> {
  const session = requirePreparedInput(sampleIdInput);
  if (!isArmedInputSession(session)) {
    throw new Error('BOM_ACCEPTANCE_INPUT_NOT_ARMED');
  }
  const result = await session.result;
  phase = 'mounted';
  return result;
}

async function resetInputInternal(
  sampleIdInput: string,
): Promise<ResetInputResult> {
  const session = requirePreparedInput(sampleIdInput);
  const entry = requireInputEntry(session);
  let undoApplied = false;
  if (isArmedInputSession(session)) {
    cleanupArmedInput(session);
    if (session.transactionCount > 0) {
      requireOk(
        await entry.editor.undo({ origin: 'acceptance:input:reset' }),
        'inputUndo',
      );
      undoApplied = true;
      await nextAnimationFrame();
    }
  }
  const contentHash = contentHashForEntry(entry);
  const contentHashRestored = contentHash === session.contentHashBefore;
  inputSession = null;
  clearTimingMarks();
  phase = 'mounted';
  return Object.freeze({
    sampleId: session.sampleId,
    passed: contentHashRestored,
    undoApplied,
    contentHashRestored,
    revision: entry.editor.getSnapshot().revision,
    contentHash,
  });
}

function completeInputIfRendered(
  session: ArmedInputSession,
  entry: ActiveInstance,
  semanticWindow: HTMLElement,
): void {
  if (
    session.settled ||
    session.inputStartMs === null ||
    session.captureObservedMs === null ||
    session.transactionCommittedMs === null ||
    session.transactionCount < 1 ||
    session.revisionAfter === null ||
    readInputTargetValue(entry) !== session.expectedValue ||
    !semanticWindow.textContent?.includes(session.expectedValue)
  ) {
    return;
  }
  session.renderCommitCandidateMs = performance.now();
  writeTimingMark(
    'bom:f3:input:' +
      session.sampleId +
      ':render-commit-candidate',
    session.renderCommitCandidateMs,
  );
  const result: InputFeedbackResult = Object.freeze({
    sampleId: session.sampleId,
    endpoint: 'aria-mutation-after-canvas-draw-render-commit-candidate',
    inputStartMs: session.inputStartMs,
    captureObservedMs: session.captureObservedMs,
    captureDelayMs: session.captureObservedMs - session.inputStartMs,
    transactionCommittedMs: session.transactionCommittedMs,
    transactionDurationMs:
      session.transactionCommittedMs - session.inputStartMs,
    renderCommitCandidateMs: session.renderCommitCandidateMs,
    renderAfterTransactionMs:
      session.renderCommitCandidateMs - session.transactionCommittedMs,
    durationMs: session.renderCommitCandidateMs - session.inputStartMs,
    transactionCount: session.transactionCount,
    revisionBefore: session.revisionBefore,
    revisionAfter: session.revisionAfter,
    expectedValue: session.expectedValue,
    semanticValueMatched: true,
    compositorPresentationQualified: false,
  });
  session.settled = true;
  cleanupArmedInput(session);
  session.resolveResult(result);
}

function failArmedInput(
  session: ArmedInputSession,
  failure: Error,
): void {
  if (session.settled) {
    return;
  }
  session.settled = true;
  cleanupArmedInput(session);
  session.rejectResult(failure);
}

function cleanupArmedInput(session: ArmedInputSession): void {
  window.clearTimeout(session.timeoutId);
  session.observer.disconnect();
  session.unsubscribeTransaction();
  session.unsubscribeKeydown();
}

function requirePreparedInput(sampleIdInput: string): PreparedInputSession {
  const sampleId = normalizeSampleId(sampleIdInput);
  const session = inputSession;
  if (session === null || session.sampleId !== sampleId) {
    throw new Error('BOM_ACCEPTANCE_INPUT_SAMPLE_MISMATCH');
  }
  return session;
}

function requireInputEntry(session: PreparedInputSession): ActiveInstance {
  const entry = activeInstances.find(
    (candidate) => candidate.instanceId === session.instanceId,
  );
  if (entry === undefined) {
    throw new Error('BOM_ACCEPTANCE_INPUT_INSTANCE_MISSING');
  }
  return entry;
}

function isArmedInputSession(
  session: PreparedInputSession,
): session is ArmedInputSession {
  return 'result' in session;
}

async function runCorrectnessInternal(): Promise<CorrectnessResult> {
  if (activeInstances.length === 0) {
    await createInstancesInternal(1);
  }
  const entry = requirePrimaryInstance();
  const otherBefore = activeInstances.slice(1).map((candidate) => ({
    instanceId: candidate.instanceId,
    revision: candidate.editor.getSnapshot().revision,
    contentHash: contentHashForEntry(candidate),
  }));
  const contentHashBefore = contentHashForEntry(entry);
  const revisionBefore = entry.editor.getSnapshot().revision;
  const events: TransactionEventTrace[] = [];
  const unsubscribers = [
    entry.editor.on('beforeTransaction', (event) => {
      events.push(transactionTrace(event));
    }),
    entry.editor.on('transactionCommitted', (event) => {
      events.push(transactionTrace(event));
    }),
    entry.editor.on('transactionRejected', (event) => {
      events.push(Object.freeze({
        type: event.type,
        instanceId: event.instanceId,
        sequence: event.sequence,
        transactionId: event.transactionId,
        origin: event.origin,
        previousRevision: event.baseRevision,
        revision: null,
        operationCount: event.patch?.operations.length ?? null,
      }));
    }),
    entry.editor.on('documentChanged', (event) => {
      events.push(transactionTrace(event));
    }),
  ];

  try {
    const edit = requireOk(
      await entry.editor.execute(
        {
          type: 'setField',
          occurrenceId: targetNode.occurrenceId,
          fieldPath: targetField.path,
          value: scenario.interaction.replacementText,
        },
        { origin: 'acceptance:correctness:setField' },
      ),
      'setField',
    );
    const contentHashAfterEdit = contentHashForEntry(entry);
    const revisionAfterEdit = entry.editor.getSnapshot().revision;
    const editEventCount = events.length;
    requireOk(
      await entry.editor.undo({ origin: 'acceptance:correctness:undo' }),
      'undo',
    );
    const contentHashAfterUndo = contentHashForEntry(entry);
    const revisionAfterUndo = entry.editor.getSnapshot().revision;
    const expectedTypes = [
      'beforeTransaction',
      'transactionCommitted',
      'documentChanged',
      'beforeTransaction',
      'transactionCommitted',
      'documentChanged',
    ];
    const eventSequenceMatches =
      events.length === expectedTypes.length &&
      events.every((event, index) => event.type === expectedTypes[index]);
    const eventEnvelopeMatches =
      events.every(
        (event, index) =>
          event.instanceId === entry.instanceId &&
          (index === 0 || event.sequence > events[index - 1]!.sequence),
      ) &&
      sameTransaction(events.slice(0, 3)) &&
      sameTransaction(events.slice(3, 6));
    const setFieldEvents = events.slice(0, editEventCount);
    const setFieldTransactionCount = new Set(
      setFieldEvents
        .filter((event) => event.type === 'transactionCommitted')
        .map((event) => event.transactionId),
    ).size;
    const setFieldOperationCount =
      setFieldEvents.find((event) => event.type === 'transactionCommitted')
        ?.operationCount ?? 0;
    const otherInstancesUnchanged = otherBefore.every((before) => {
      const candidate = activeInstances.find(
        (instance) => instance.instanceId === before.instanceId,
      );
      return (
        candidate !== undefined &&
        candidate.editor.getSnapshot().revision === before.revision &&
        contentHashForEntry(candidate) === before.contentHash
      );
    });
    const undoHashRestored = contentHashAfterUndo === contentHashBefore;
    const passed =
      edit.transactionId === setFieldEvents[0]?.transactionId &&
      contentHashAfterEdit !== contentHashBefore &&
      setFieldTransactionCount === 1 &&
      setFieldOperationCount === 1 &&
      eventSequenceMatches &&
      eventEnvelopeMatches &&
      undoHashRestored &&
      otherInstancesUnchanged;
    phase = 'mounted';

    return Object.freeze({
      passed,
      instanceId: entry.instanceId,
      targetOccurrenceId: targetNode.occurrenceId,
      targetColumnId: scenario.interaction.targetColumnId,
      contentHashBefore,
      contentHashAfterEdit,
      contentHashAfterUndo,
      revisionBefore,
      revisionAfterEdit,
      revisionAfterUndo,
      setFieldTransactionCount,
      setFieldOperationCount,
      eventSequenceMatches,
      eventEnvelopeMatches,
      undoHashRestored,
      otherInstancesUnchanged,
      events: Object.freeze([...events]),
    });
  } finally {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  }
}

function transactionTrace(event: {
  readonly type: string;
  readonly instanceId: string;
  readonly sequence: number;
  readonly transactionId: string;
  readonly origin: string;
  readonly previousRevision: string;
  readonly revision: string;
  readonly patch: { readonly operations: readonly unknown[] };
}): TransactionEventTrace {
  return Object.freeze({
    type: event.type,
    instanceId: event.instanceId,
    sequence: event.sequence,
    transactionId: event.transactionId,
    origin: event.origin,
    previousRevision: event.previousRevision,
    revision: event.revision,
    operationCount: event.patch.operations.length,
  });
}

function sameTransaction(events: readonly TransactionEventTrace[]): boolean {
  return (
    events.length === 3 &&
    events.every(
      (event) =>
        event.transactionId === events[0]!.transactionId &&
        event.previousRevision === events[0]!.previousRevision &&
        event.revision === events[0]!.revision,
    )
  );
}

async function destroyInstancesInternal(
  requestedCount: AcceptanceInstanceCount | null,
): Promise<DestroyInstancesResult> {
  const activeCount = activeInstances.length;
  const instances = destroyActiveInstances();
  hostGrid.replaceChildren();
  hostGrid.dataset['count'] = '0';
  phase = 'destroyed';
  const typedResourcesReleased = instances.every(
    (instance) =>
      hasCompleteTypedResourceLedgers(instance) &&
      terminalResourceLedgerBlockers([instance], 1).length === 0,
  );
  const resourcesReleased = instances.every(
    (instance) =>
      instance.lifecycle === 'destroyed' &&
      instance.queuedTasks === 0 &&
      instance.activeTasks === 0 &&
      instance.mountedResources === 0 &&
      instance.destroyedEventCount === 1 &&
      instance.rendererRootCount === 0 &&
      instance.canvasCount === 0 &&
      instance.portalCount === 0 &&
      instance.idempotent,
  ) && typedResourcesReleased;
  return Object.freeze({
    passed:
      resourcesReleased &&
      instances.length === activeCount &&
      (requestedCount === null || requestedCount === activeCount),
    requestedCount,
    destroyedCount: instances.length,
    instances,
    remainingRendererRootCount: hostGrid.querySelectorAll(
      '[data-bom-canvas-renderer]',
    ).length,
    remainingCanvasCount: hostGrid.querySelectorAll('canvas').length,
    remainingPortalCount: hostGrid.querySelectorAll(
      '[data-bom-editor-portal]',
    ).length,
    state: currentState(),
  });
}

async function createDisposableRealmInternal(
  input: Readonly<{
    readonly realmId: string;
    readonly instanceCount: DisposableRealmInstanceCount;
  }>,
): Promise<DisposableRealmReadyResult> {
  assertDisposableRealmCoordinator();
  if (activeDisposableRealm !== null) {
    throw new Error(
      'BOM_ACCEPTANCE_DISPOSABLE_REALM_ACTIVE:' +
        activeDisposableRealm.realmId,
    );
  }
  if (activeInstances.length !== 0) {
    throw new Error('BOM_ACCEPTANCE_LOCAL_INSTANCES_ACTIVE');
  }
  if (
    document.querySelector('.acceptance-disposable-realm') !== null
  ) {
    throw new Error('BOM_ACCEPTANCE_UNMANAGED_DISPOSABLE_REALM_PRESENT');
  }

  const realmId = normalizeRealmId(input.realmId);
  const instanceCount = normalizeDisposableRealmInstanceCount(
    input.instanceCount,
  );
  const source = new URL('./acceptance.html', window.location.href);
  source.search = '';
  source.hash = '';
  source.searchParams.set(DISPOSABLE_REALM_QUERY_KEY, '1');
  source.searchParams.set(DISPOSABLE_REALM_ID_QUERY_KEY, realmId);
  if (
    window.location.origin === 'null' ||
    source.origin !== window.location.origin
  ) {
    throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_NOT_SAME_ORIGIN');
  }

  const frame = document.createElement('iframe');
  frame.className = 'acceptance-disposable-realm';
  frame.dataset['bomDisposableRealm'] = realmId;
  frame.title = 'BOM editor disposable acceptance realm ' + realmId;
  frame.setAttribute('tabindex', '-1');
  frame.setAttribute('loading', 'eager');
  frame.width = String(scenario.viewport.width);
  frame.height = String(scenario.viewport.height);
  frame.style.width = String(scenario.viewport.width) + 'px';
  frame.style.height = String(scenario.viewport.height) + 'px';
  frame.src = source.href;

  let childApi: Readonly<BomF3AcceptanceApiV1> | null = null;
  try {
    const loaded = waitForDisposableRealmLoad(frame);
    document.body.appendChild(frame);
    await loaded;
    const childWindow = frame.contentWindow;
    const childDocument = frame.contentDocument;
    if (
      childWindow === null ||
      childDocument === null ||
      childWindow.parent !== window ||
      childWindow.location.origin !== window.location.origin ||
      childWindow.location.search.length === 0 ||
      new URLSearchParams(childWindow.location.search).get(
        DISPOSABLE_REALM_ID_QUERY_KEY,
      ) !== realmId
    ) {
      throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_NOT_SAME_ORIGIN');
    }
    if (
      childWindow.innerWidth !== scenario.viewport.width ||
      childWindow.innerHeight !== scenario.viewport.height ||
      (childWindow.devicePixelRatio !== scenario.viewport.devicePixelRatio &&
        !approximatelyEqualDevicePixelRatio(
          childWindow.devicePixelRatio,
          scenario.viewport.devicePixelRatio,
        ))
    ) {
      throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_ENVIRONMENT_MISMATCH');
    }
    childApi = childWindow.__BOM_F3_ACCEPTANCE__ ?? null;
    if (childApi === null || childApi.version !== 1 || childApi === api) {
      throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_API_MISSING');
    }
    await childApi.ready;
    const created: DisposableRealmCreatedResult =
      instanceCount === 0
        ? Object.freeze({
            passed: childApi.state().instanceCount === 0,
            requestedCount: 0,
            instanceIds: Object.freeze([]),
            allInteractive: true,
            state: cloneIntoCoordinatorRealm(childApi.state()),
          })
        : cloneIntoCoordinatorRealm(
            await childApi.createInstances({ instanceCount }),
          );
    if (
      created.passed !== true ||
      created.requestedCount !== instanceCount ||
      created.state.instanceCount !== instanceCount
    ) {
      throw new Error(
        'BOM_ACCEPTANCE_DISPOSABLE_REALM_CREATE_FAILED:' +
          JSON.stringify(created),
      );
    }
    activeDisposableRealm = {
      realmId,
      instanceCount,
      childUrl: childWindow.location.href,
      frame,
      api: childApi,
      phase: 'ready',
      destroyResult: null,
    };
    phase = 'mounted';
    return Object.freeze({
      protocolVersion: DISPOSABLE_REALM_PROTOCOL_VERSION,
      realmId,
      phase: 'ready',
      sameOrigin: true,
      frameAttached: true,
      frameRemoved: false,
      childApiVersion: 1,
      instanceCount,
      childUrl: childWindow.location.href,
      childOrigin: childWindow.location.origin,
      created,
    });
  } catch (failure) {
    if (childApi !== null) {
      try {
        await childApi.release();
      } catch {
        // The frame is discarded below; this path never produces evidence.
      }
    }
    frame.remove();
    throw failure;
  }
}

async function destroyDisposableRealmInternal(
  realmId: string,
): Promise<DisposableRealmDestroyResult> {
  const active = requireDisposableRealm(realmId);
  if (active.destroyResult !== null) {
    return active.destroyResult;
  }
  const childDocument = requireSameOriginRealmDocument(active);
  const capture = captureDisposableRealmDom(childDocument);
  const destroyed = cloneIntoCoordinatorRealm(
    active.instanceCount === 0
      ? await active.api.destroyInstances()
      : await active.api.destroyInstances({
          instanceCount: active.instanceCount,
        }),
  );
  const assertions = inspectDisposableRealmRelease(
    active,
    childDocument,
    capture,
    destroyed,
  );
  const blockers = new Set<string>();
  for (const assertion of assertions) {
    if (assertion.blocker !== null) {
      blockers.add(assertion.blocker);
    }
  }
  if (destroyed.passed !== true) {
    blockers.add('BOM_ACCEPTANCE_DISPOSABLE_REALM_DESTROY_FAILED');
  }
  if (
    destroyed.destroyedCount !== active.instanceCount ||
    destroyed.instances.length !== active.instanceCount ||
    (active.instanceCount === 0
      ? destroyed.requestedCount !== null
      : destroyed.requestedCount !== active.instanceCount)
  ) {
    blockers.add('BOM_ACCEPTANCE_DISPOSABLE_REALM_INSTANCE_COUNT_MISMATCH');
  }
  if (
    destroyed.instances.some(
      (instance) =>
        instance.queuedTasks !== 0 ||
        instance.activeTasks !== 0 ||
        instance.lifecycle !== 'destroyed',
    )
  ) {
    blockers.add('BOM_ACCEPTANCE_ASYNC_TASKS_OUTSTANDING');
  }
  const publicDiagnosticsMountedResourcesAfter = destroyed.instances.reduce(
    (total, instance) => total + instance.mountedResources,
    0,
  );
  if (publicDiagnosticsMountedResourcesAfter !== 0) {
    blockers.add('BOM_ACCEPTANCE_AGGREGATE_RESOURCE_LEDGER_NOT_ZERO');
  }
  for (const blocker of terminalResourceLedgerBlockers(
    destroyed.instances,
    active.instanceCount,
  )) {
    blockers.add(blocker);
  }

  const publicDiagnosticsTypedLedgersRequired =
    active.instanceCount > 0;
  const publicDiagnosticsTypedLedgersAvailable =
    destroyed.instances.length > 0 &&
    destroyed.instances.every((instance) =>
      hasCompleteTypedResourceLedgers(instance),
    );
  if (
    publicDiagnosticsTypedLedgersRequired &&
    !publicDiagnosticsTypedLedgersAvailable
  ) {
    blockers.add('BOM_ACCEPTANCE_TYPED_RESOURCE_LEDGER_UNAVAILABLE');
  }

  const passed =
    destroyed.passed === true &&
    blockers.size === 0 &&
    assertions.every((assertion) => assertion.status === 'passed');
  const result: DisposableRealmDestroyResult = Object.freeze({
    protocolVersion: DISPOSABLE_REALM_PROTOCOL_VERSION,
    realmId,
    phase: passed ? 'destroyed' : 'blocked',
    passed,
    sameOrigin: true,
    frameAttached: true,
    frameRemoved: false,
    removalAuthorized: passed,
    publicDiagnosticsTypedLedgersRequired,
    publicDiagnosticsTypedLedgersAvailable,
    publicDiagnosticsTypedLedgerCount: destroyed.instances.length,
    publicDiagnosticsMountedResourcesAfter,
    assertions,
    blockers: Object.freeze([...blockers]),
    destroyed,
  });
  active.phase = result.phase;
  active.destroyResult = result;
  phase = passed ? 'destroyed' : 'blocked';
  return result;
}

async function releaseDisposableRealmInternal(
  realmId: string,
): Promise<DisposableRealmReleaseResult> {
  const active = requireDisposableRealm(realmId);
  const destroyResult = active.destroyResult;
  if (destroyResult?.removalAuthorized !== true) {
    const blockers =
      destroyResult?.blockers ??
      Object.freeze([
        'BOM_ACCEPTANCE_DISPOSABLE_REALM_IN_PLACE_DESTROY_REQUIRED',
      ]);
    active.phase = 'blocked';
    phase = 'blocked';
    return Object.freeze({
      protocolVersion: DISPOSABLE_REALM_PROTOCOL_VERSION,
      realmId,
      released: false,
      phase: 'blocked',
      frameRemoved: false,
      parentReferencesReleased: false,
      parentReferenceScope:
        'persistent-coordinator-state-after-detach',
      qualified: false,
      blockers,
    });
  }

  const frame = active.frame;
  await active.api.release();
  active.destroyResult = null;
  activeDisposableRealm = null;
  frame.remove();
  if (frame.isConnected) {
    throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_REMOVE_FAILED');
  }
  phase = 'released';
  const parentReferencesReleased =
    activeDisposableRealm === null && !frame.isConnected;
  return Object.freeze({
    protocolVersion: DISPOSABLE_REALM_PROTOCOL_VERSION,
    realmId,
    released: true,
    phase: 'released',
    frameRemoved: true,
    parentReferencesReleased,
    parentReferenceScope:
      'persistent-coordinator-state-after-detach',
    qualified: true,
    blockers: Object.freeze([]),
  });
}

async function discardDisposableRealmInternal(
  realmId: string,
): Promise<DisposableRealmDiscardResult> {
  const active = requireDisposableRealm(realmId);
  try {
    await active.api.release();
  } catch {
    // Explicit discard is cleanup only and cannot become acceptance evidence.
  }
  const frame = active.frame;
  activeDisposableRealm = null;
  frame.remove();
  if (frame.isConnected) {
    throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_DISCARD_FAILED');
  }
  phase = 'released';
  return Object.freeze({
    protocolVersion: DISPOSABLE_REALM_PROTOCOL_VERSION,
    realmId,
    discarded: true,
    frameRemoved: true,
    qualified: false,
    reason: 'non-evidence-cleanup',
  });
}

function captureDisposableRealmDom(
  childDocument: Document,
): DisposableRealmDomCapture {
  return Object.freeze({
    rendererRoots: Object.freeze(
      Array.from(
        childDocument.querySelectorAll<HTMLElement>(
          '[data-bom-canvas-renderer]',
        ),
      ),
    ),
    canvases: Object.freeze(
      Array.from(
        childDocument.querySelectorAll<HTMLCanvasElement>('canvas'),
      ),
    ),
    portals: Object.freeze(
      Array.from(
        childDocument.querySelectorAll<HTMLInputElement>(
          '[data-bom-editor-portal]',
        ),
      ),
    ),
  });
}

function inspectDisposableRealmRelease(
  active: ActiveDisposableRealm,
  childDocument: Document,
  capture: DisposableRealmDomCapture,
  destroyed: DestroyInstancesResult,
): readonly DisposableRealmResourceAssertion[] {
  const liveRendererRoots = new Set<Element>(
    Array.from(
      childDocument.querySelectorAll('[data-bom-canvas-renderer]'),
    ),
  );
  for (const root of capture.rendererRoots) {
    if (root.isConnected) {
      liveRendererRoots.add(root);
    }
  }

  const liveCanvases = new Set<HTMLCanvasElement>(
    Array.from(
      childDocument.querySelectorAll<HTMLCanvasElement>('canvas'),
    ),
  );
  for (const canvas of capture.canvases) {
    if (canvas.isConnected || canvas.width !== 0 || canvas.height !== 0) {
      liveCanvases.add(canvas);
    }
  }

  const livePortals = new Set<HTMLInputElement>(
    Array.from(
      childDocument.querySelectorAll<HTMLInputElement>(
        '[data-bom-editor-portal]',
      ),
    ),
  );
  for (const portal of capture.portals) {
    if (portal.isConnected || portal.value !== '') {
      livePortals.add(portal);
    }
  }

  const retainedEvidence: Readonly<
    Partial<
      Record<
        DisposableRealmResource,
        Readonly<{
          before: number;
          expectedBefore: number;
          outstanding: number;
        }>
      >
    >
  > = Object.freeze({
    dom: Object.freeze({
      before: capture.rendererRoots.length,
      expectedBefore: active.instanceCount,
      outstanding: liveRendererRoots.size,
    }),
    canvas: Object.freeze({
      before: capture.canvases.length,
      expectedBefore: active.instanceCount * 3,
      outstanding: liveCanvases.size,
    }),
    portal: Object.freeze({
      before: capture.portals.length,
      expectedBefore: active.instanceCount,
      outstanding: livePortals.size,
    }),
  });

  const resources = Object.keys(
    DISPOSABLE_REALM_LEDGER_KINDS,
  ) as DisposableRealmResource[];
  if (active.instanceCount === 0) {
    const childWindow = childDocument.defaultView;
    return Object.freeze(
      resources.map((resource) =>
        zeroInstanceControlAssertion(
          resource,
          childWindow,
          retainedEvidence[resource],
        ),
      ),
    );
  }
  return Object.freeze(
    resources.map((resource) =>
      typedLedgerAssertion(
        resource,
        destroyed.instances,
        retainedEvidence[resource],
      ),
    ),
  );
}

function typedLedgerAssertion(
  resource: DisposableRealmResource,
  instances: readonly DestroyedInstanceResult[],
  retained:
    | Readonly<{
        before: number;
        expectedBefore: number;
        outstanding: number;
      }>
    | undefined,
): DisposableRealmResourceAssertion {
  const ledgerKinds = DISPOSABLE_REALM_LEDGER_KINDS[resource];
  let before = 0;
  let after = 0;
  let cleanupFailures = 0;
  let available = true;
  let primitivesSupported = true;
  let fullyTracked = true;

  for (const instance of instances) {
    for (const kind of ledgerKinds) {
      const beforeCounter = resourceCounter(
        instance.resourceLedgerBefore,
        kind,
      );
      const afterCounter = resourceCounter(
        instance.resourceLedgerAfter,
        kind,
      );
      if (beforeCounter === null || afterCounter === null) {
        available = false;
        continue;
      }
      primitivesSupported =
        primitivesSupported &&
        beforeCounter.supported === true &&
        afterCounter.supported === true;
      fullyTracked =
        fullyTracked &&
        beforeCounter.tracked === true &&
        afterCounter.tracked === true;
      if (
        !isNonNegativeInteger(beforeCounter.activeCount) ||
        !isNonNegativeInteger(afterCounter.activeCount) ||
        !isNonNegativeInteger(afterCounter.cleanupFailureCount)
      ) {
        available = false;
        continue;
      }
      before += beforeCounter.activeCount;
      after += afterCounter.activeCount;
      cleanupFailures += afterCounter.cleanupFailureCount;
    }
  }

  const instrumentationSupported =
    available && primitivesSupported && fullyTracked;
  const retainedFailed =
    retained !== undefined &&
    (retained.before !== retained.expectedBefore ||
      retained.outstanding !== 0);
  const outstanding =
    instrumentationSupported
      ? after + (retained?.outstanding ?? 0)
      : null;
  const failed =
    instrumentationSupported &&
    (retainedFailed || outstanding !== 0 || cleanupFailures !== 0);
  const status: DisposableRealmAssertionStatus =
    !instrumentationSupported
      ? 'unavailable'
      : failed
        ? 'failed'
        : 'passed';

  return Object.freeze({
    resource,
    status,
    instrumentationSupported,
    supported: instrumentationSupported,
    tracked: instrumentationSupported,
    before: instrumentationSupported
      ? (retained?.before ?? before)
      : null,
    after: outstanding,
    outstanding,
    ledgerKinds,
    evidence:
      retained === undefined
        ? 'typed-resource-ledger'
        : 'same-origin-retained-reference+typed-resource-ledger',
    blocker:
      status === 'passed'
        ? null
        : status === 'unavailable'
          ? DISPOSABLE_REALM_UNAVAILABLE_BLOCKERS[resource]
          : DISPOSABLE_REALM_RELEASE_BLOCKERS[resource],
  });
}

function zeroInstanceControlAssertion(
  resource: DisposableRealmResource,
  childWindow: Window | null,
  retained:
    | Readonly<{
        before: number;
        expectedBefore: number;
        outstanding: number;
      }>
    | undefined,
): DisposableRealmResourceAssertion {
  const supported = disposableRealmPrimitiveSupported(
    resource,
    childWindow,
  );
  const retainedFailed =
    retained !== undefined &&
    (retained.before !== 0 ||
      retained.expectedBefore !== 0 ||
      retained.outstanding !== 0);
  const status: DisposableRealmAssertionStatus = !supported
    ? 'unavailable'
    : retainedFailed
      ? 'failed'
      : 'passed';
  return Object.freeze({
    resource,
    status,
    instrumentationSupported: supported,
    supported,
    tracked: supported,
    before: supported ? (retained?.before ?? 0) : null,
    after: supported ? (retained?.outstanding ?? 0) : null,
    outstanding: supported ? (retained?.outstanding ?? 0) : null,
    ledgerKinds: DISPOSABLE_REALM_LEDGER_KINDS[resource],
    evidence: 'zero-instance-control-no-component-construction',
    blocker:
      status === 'passed'
        ? null
        : status === 'unavailable'
          ? DISPOSABLE_REALM_UNAVAILABLE_BLOCKERS[resource]
          : DISPOSABLE_REALM_RELEASE_BLOCKERS[resource],
  });
}

function disposableRealmPrimitiveSupported(
  resource: DisposableRealmResource,
  childWindow: Window | null,
): boolean {
  if (
    resource === 'dom' ||
    resource === 'canvas' ||
    resource === 'portal'
  ) {
    return childWindow !== null;
  }
  if (childWindow === null) {
    return false;
  }
  const runtime = childWindow as unknown as Readonly<{
    Worker?: unknown;
    ResizeObserver?: unknown;
    MutationObserver?: unknown;
    IntersectionObserver?: unknown;
  }>;
  switch (resource) {
    case 'worker':
      return typeof runtime.Worker === 'function';
    case 'dom-listener':
      return (
        typeof childWindow.addEventListener === 'function' &&
        typeof childWindow.removeEventListener === 'function'
      );
    case 'resize-observer':
      return typeof runtime.ResizeObserver === 'function';
    case 'mutation-observer':
      return typeof runtime.MutationObserver === 'function';
    case 'intersection-observer':
      return typeof runtime.IntersectionObserver === 'function';
    case 'animation-frame':
      return (
        typeof childWindow.requestAnimationFrame === 'function' &&
        typeof childWindow.cancelAnimationFrame === 'function'
      );
    case 'timeout':
      return (
        typeof childWindow.setTimeout === 'function' &&
        typeof childWindow.clearTimeout === 'function'
      );
    case 'interval':
      return (
        typeof childWindow.setInterval === 'function' &&
        typeof childWindow.clearInterval === 'function'
      );
  }
}

function resourceCounter(
  ledger: Readonly<BomEditorResourceDiagnostics>,
  kind: string,
): Readonly<{
  tracked: boolean;
  supported: boolean;
  activeCount: number;
  cleanupFailureCount: number;
}> | null {
  if (kind === 'event-hub-listener') {
    const eventHub = ledger.eventHub;
    if (
      eventHub.kind !== kind ||
      eventHub.tracked !== true ||
      eventHub.supported !== true ||
      !isNonNegativeInteger(eventHub.outstandingCount) ||
      !isNonNegativeInteger(eventHub.cleanupFailureCount)
    ) {
      return null;
    }
    return Object.freeze({
      tracked: eventHub.tracked,
      supported: eventHub.supported,
      activeCount: eventHub.outstandingCount,
      cleanupFailureCount: eventHub.cleanupFailureCount,
    });
  }
  if (kind === 'editor-worker-task') {
    const workerTasks = ledger.workerTasks;
    if (
      workerTasks.protocol !== EDITOR_WORKER_TASK_LEDGER_PROTOCOL ||
      workerTasks.kind !== 'worker-task' ||
      typeof workerTasks.tracked !== 'boolean' ||
      typeof workerTasks.supported !== 'boolean' ||
      !isNonNegativeInteger(workerTasks.outstandingCount) ||
      !isNonNegativeInteger(workerTasks.cleanupFailureCount)
    ) {
      return null;
    }
    return Object.freeze({
      tracked: workerTasks.tracked,
      supported: workerTasks.supported,
      activeCount: workerTasks.outstandingCount,
      cleanupFailureCount: workerTasks.cleanupFailureCount,
    });
  }
  const renderer = ledger.renderer;
  if (renderer === null) {
    return null;
  }
  const matches = renderer.kinds.filter(
    (candidate) => candidate.kind === kind,
  );
  const match = matches.length === 1 ? matches[0] : undefined;
  if (
    match === undefined ||
    typeof match.tracked !== 'boolean' ||
    typeof match.supported !== 'boolean' ||
    !isNonNegativeInteger(match.activeCount) ||
    !isNonNegativeInteger(match.cleanupFailureCount)
  ) {
    return null;
  }
  return Object.freeze({
    tracked: match.tracked,
    supported: match.supported,
    activeCount: match.activeCount,
    cleanupFailureCount: match.cleanupFailureCount,
  });
}

function hasCompleteTypedResourceLedgers(
  instance: DestroyedInstanceResult,
): boolean {
  return (
    editorResourceLedgerStructurallyComplete(
      instance.resourceLedgerBefore,
    ) &&
    editorResourceLedgerStructurallyComplete(
      instance.resourceLedgerAfter,
    )
  );
}

function editorResourceLedgerStructurallyComplete(
  ledger: Readonly<BomEditorResourceDiagnostics>,
): boolean {
  const renderer = ledger.renderer;
  if (
    ledger.protocol !== EDITOR_RESOURCE_LEDGER_PROTOCOL ||
    renderer === null ||
    renderer.protocol !== RENDERER_RESOURCE_LEDGER_PROTOCOL ||
    !isNonNegativeInteger(renderer.registeredCount) ||
    !isNonNegativeInteger(renderer.activeCount) ||
    !isNonNegativeInteger(renderer.cleanupAttemptCount) ||
    !isNonNegativeInteger(renderer.cleanupFailureCount) ||
    !hasExactRendererResourceKinds(renderer.kinds)
  ) {
    return false;
  }
  for (const kind of renderer.kinds) {
    if (
      kind.tracked !== true ||
      kind.supported !== true ||
      !isNonNegativeInteger(kind.registeredCount) ||
      !isNonNegativeInteger(kind.activeCount) ||
      !isNonNegativeInteger(kind.cleanupAttemptCount) ||
      !isNonNegativeInteger(kind.cleanupFailureCount)
    ) {
      return false;
    }
  }
  const registeredCount = renderer.kinds.reduce(
    (total, kind) =>
      total + (kind.registeredCount ?? Number.NaN),
    0,
  );
  const activeCount = renderer.kinds.reduce(
    (total, kind) => total + (kind.activeCount ?? Number.NaN),
    0,
  );
  const cleanupAttemptCount = renderer.kinds.reduce(
    (total, kind) =>
      total + (kind.cleanupAttemptCount ?? Number.NaN),
    0,
  );
  const cleanupFailureCount = renderer.kinds.reduce(
    (total, kind) =>
      total + (kind.cleanupFailureCount ?? Number.NaN),
    0,
  );
  if (
    renderer.registeredCount !== registeredCount ||
    renderer.activeCount !== activeCount ||
    renderer.cleanupAttemptCount !== cleanupAttemptCount ||
    renderer.cleanupFailureCount !== cleanupFailureCount
  ) {
    return false;
  }

  const eventHub = ledger.eventHub;
  const tasks = ledger.tasks;
  const workerTasks = ledger.workerTasks;
  return (
    eventHub.kind === 'event-hub-listener' &&
    eventHub.tracked === true &&
    eventHub.supported === true &&
    isNonNegativeInteger(eventHub.registeredCount) &&
    isNonNegativeInteger(eventHub.removedCount) &&
    isNonNegativeInteger(eventHub.activeCount) &&
    isNonNegativeInteger(eventHub.pendingAsyncCount) &&
    isNonNegativeInteger(eventHub.outstandingCount) &&
    isNonNegativeInteger(eventHub.cleanupFailureCount) &&
    tasks.protocol === EDITOR_TASK_LEDGER_PROTOCOL &&
    tasks.kind === 'editor-task' &&
    tasks.tracked === true &&
    tasks.supported === true &&
    isNonNegativeInteger(tasks.queuedCount) &&
    isNonNegativeInteger(tasks.runningCount) &&
    isNonNegativeInteger(tasks.outstandingCount) &&
    isNonNegativeInteger(tasks.cleanupFailureCount) &&
    workerTasks.protocol === EDITOR_WORKER_TASK_LEDGER_PROTOCOL &&
    workerTasks.kind === 'worker-task' &&
    workerTasks.tracked === true &&
    workerTasks.supported === true &&
    isNonNegativeInteger(workerTasks.queuedCount) &&
    isNonNegativeInteger(workerTasks.runningCount) &&
    isNonNegativeInteger(workerTasks.outstandingCount) &&
    isNonNegativeInteger(workerTasks.cleanupFailureCount) &&
    isNonNegativeInteger(ledger.activeCount) &&
    isNonNegativeInteger(ledger.cleanupFailureCount) &&
    eventHub.outstandingCount ===
      eventHub.activeCount + eventHub.pendingAsyncCount &&
    tasks.outstandingCount ===
      tasks.queuedCount + tasks.runningCount &&
    workerTasks.outstandingCount ===
      workerTasks.queuedCount + workerTasks.runningCount &&
    ledger.activeCount ===
      renderer.activeCount +
        eventHub.outstandingCount +
        tasks.outstandingCount &&
    ledger.cleanupFailureCount ===
      renderer.cleanupFailureCount +
        eventHub.cleanupFailureCount +
        tasks.cleanupFailureCount &&
    typeof ledger.fullyTracked === 'boolean' &&
    typeof ledger.trackedResourcesReleased === 'boolean'
  );
}

function hasExactRendererResourceKinds(
  kinds: readonly Readonly<{ readonly kind: string }>[],
): boolean {
  if (!Array.isArray(kinds)) {
    return false;
  }
  const names = kinds.map((kind) => kind.kind);
  return (
    names.length === EXPECTED_RENDERER_RESOURCE_KINDS.length &&
    new Set(names).size === names.length &&
    EXPECTED_RENDERER_RESOURCE_KINDS.every((kind) =>
      names.includes(kind),
    )
  );
}

function terminalResourceLedgerBlockers(
  instances: readonly DestroyedInstanceResult[],
  expectedCount: DisposableRealmInstanceCount,
): readonly string[] {
  if (expectedCount === 0) {
    return instances.length === 0
      ? Object.freeze([])
      : Object.freeze([
          'BOM_ACCEPTANCE_ZERO_INSTANCE_CONTROL_CREATED_COMPONENT',
        ]);
  }
  const blockers = new Set<string>();
  for (const instance of instances) {
    if (!hasCompleteTypedResourceLedgers(instance)) {
      blockers.add('BOM_ACCEPTANCE_TYPED_RESOURCE_LEDGER_UNAVAILABLE');
      continue;
    }
    const before = instance.resourceLedgerBefore;
    const after = instance.resourceLedgerAfter;
    const rendererBefore = before.renderer;
    const rendererAfter = after.renderer;
    if (
      rendererBefore === null ||
      rendererAfter === null ||
      rendererBefore.disposed !== false ||
      rendererAfter.disposed !== true
    ) {
      blockers.add('BOM_ACCEPTANCE_RENDERER_LEDGER_LIFECYCLE_INVALID');
      continue;
    }
    if (
      rendererAfter.activeCount !== 0 ||
      rendererAfter.cleanupFailureCount !== 0 ||
      rendererAfter.cleanupAttemptCount !==
        rendererAfter.registeredCount ||
      rendererAfter.kinds.some(
        (kind) =>
          kind.activeCount !== 0 ||
          kind.cleanupFailureCount !== 0 ||
          kind.cleanupAttemptCount !== kind.registeredCount,
      )
    ) {
      blockers.add('BOM_ACCEPTANCE_RENDERER_RESOURCE_LEDGER_NOT_ZERO');
    }
    if (
      after.eventHub.activeCount !== 0 ||
      after.eventHub.pendingAsyncCount !== 0 ||
      after.eventHub.outstandingCount !== 0 ||
      after.eventHub.cleanupFailureCount !== 0 ||
      after.eventHub.removedCount !== after.eventHub.registeredCount
    ) {
      blockers.add('BOM_ACCEPTANCE_EVENT_HUB_LEDGER_NOT_ZERO');
    }
    if (
      after.tasks.queuedCount !== 0 ||
      after.tasks.runningCount !== 0 ||
      after.tasks.outstandingCount !== 0 ||
      after.tasks.cleanupFailureCount !== 0
    ) {
      blockers.add('BOM_ACCEPTANCE_EDITOR_TASK_LEDGER_NOT_ZERO');
    }
    if (
      after.workerTasks.queuedCount !== 0 ||
      after.workerTasks.runningCount !== 0 ||
      after.workerTasks.outstandingCount !== 0 ||
      after.workerTasks.cleanupFailureCount !== 0
    ) {
      blockers.add('BOM_ACCEPTANCE_WORKER_TASK_LEDGER_NOT_ZERO');
    }
    if (
      after.activeCount !== 0 ||
      after.cleanupFailureCount !== 0 ||
      after.fullyTracked !== true ||
      after.trackedResourcesReleased !== true
    ) {
      blockers.add('BOM_ACCEPTANCE_EDITOR_RESOURCE_LEDGER_NOT_RELEASED');
    }
  }
  return Object.freeze([...blockers]);
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

async function resetInternal(): Promise<AcceptanceState> {
  assertNoDisposableRealm('reset');
  await clearInstances();
  phase = 'idle';
  return currentState();
}

async function releaseInternal(): Promise<AcceptanceState> {
  assertNoDisposableRealm('release');
  await clearInstances();
  phase = 'released';
  return currentState();
}

async function clearInstances(): Promise<void> {
  destroyActiveInstances();
  hostGrid.replaceChildren();
  hostGrid.dataset['count'] = '0';
  clearTimingMarks();
  await Promise.resolve();
}

function destroyActiveInstances(): readonly DestroyedInstanceResult[] {
  discardInputSession();
  const entries = activeInstances;
  const results = entries.map((entry) => {
    const diagnosticsBefore = entry.editor.getDiagnostics();
    entry.editor.destroy();
    entry.editor.destroy();
    const diagnostics = entry.editor.getDiagnostics();
    const result: DestroyedInstanceResult = Object.freeze({
      instanceId: entry.instanceId,
      lifecycle: diagnostics.lifecycle,
      queuedTasks: diagnostics.queuedTasks,
      activeTasks: diagnostics.activeTasks,
      mountedResources: diagnostics.mountedResources,
      destroyedEventCount: entry.counters.destroyed,
      rendererRootCount: entry.host.querySelectorAll(
        '[data-bom-canvas-renderer]',
      ).length,
      canvasCount: entry.host.querySelectorAll('canvas').length,
      portalCount: entry.host.querySelectorAll(
        '[data-bom-editor-portal]',
      ).length,
      revision: entry.editor.getSnapshot().revision,
      contentHash: contentHashForEntry(entry),
      idempotent: entry.counters.destroyed === 1,
      resourceLedgerBefore: diagnosticsBefore.resources,
      resourceLedgerAfter: diagnostics.resources,
    });
    for (const unsubscribe of entry.unsubscribers) {
      unsubscribe();
    }
    entry.unsubscribers.length = 0;
    return result;
  });
  activeInstances = [];
  return Object.freeze(results);
}

function createEntry(
  instanceId: string,
  panel: HTMLElement,
  host: HTMLDivElement,
): ActiveInstance {
  const counters: InstanceCounters = { ready: 0, destroyed: 0 };
  const editor = createBomEditor<BomFields>({
    schema: fixture.schema,
    columns,
    initialDocument: fixture.snapshot,
    instanceId,
    rowHeight: scenario.layout.rowHeight,
    expandAll: scenario.expansion.strategy === 'all',
    renderer: {
      headerHeight: scenario.layout.headerHeight,
      overscanX: scenario.layout.overscanPx,
      overscanY: scenario.layout.overscanPx,
      maxDpr: scenario.viewport.devicePixelRatio,
      maxBackingStoreBytes: scenario.layout.maxBackingStoreBytes,
      labels: {
        treegridLabel: '10K BOM acceptance editor ' + instanceId,
        editorLabel: 'BOM cell value',
      },
      theme: {
        font:
          String(scenario.font.weight) +
          ' ' +
          String(scenario.font.sizePx) +
          'px ' +
          scenario.font.family,
      },
      formatCellText(context): string {
        if (context.column.columnId === 'materialCode') {
          return materialCodeByOccurrence.get(context.occurrenceId) ?? '';
        }
        return formatBomValue(context.value);
      },
      frameCommitSink(frame): void {
        recordApplicationPixelPaint(instanceId, frame);
      },
    },
  });
  const unsubscribers = [
    editor.on('ready', () => {
      counters.ready += 1;
    }),
    editor.on('destroyed', () => {
      counters.destroyed += 1;
    }),
  ];
  return {
    instanceId,
    panel,
    editor,
    counters,
    unsubscribers,
    hostId: host.id,
    host,
    interactiveVerified: false,
    cachedRevision: fixture.snapshot.revision,
    cachedContentHash: fixtureContentHash,
    remountCount: 0,
  };
}

async function mountEditor(entry: ActiveInstance): Promise<void> {
  requireOk(await entry.editor.mount(entry.host), 'mount');
  requireOk(await entry.editor.ready, 'ready');
  await document.fonts.ready;
}

async function verifyInteractive(
  entry: ActiveInstance,
): Promise<HostInspection> {
  if (!pointIsInViewport(interactionPoint(entry.host))) {
    entry.panel.scrollIntoView({ block: 'center', inline: 'nearest' });
    await nextAnimationFrame();
  }
  const deadline = performance.now() + 10_000;
  let inspection = inspectHost(entry.host);
  while (!inspection.interactive && performance.now() < deadline) {
    await nextAnimationFrame();
    inspection = inspectHost(entry.host);
  }
  if (!inspection.interactive) {
    throw new Error(
      'BOM_ACCEPTANCE_INTERACTIVE_TIMEOUT:' + JSON.stringify(inspection),
    );
  }
  inspection = inspectHost(entry.host);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await nextAnimationFrame();
    inspection = inspectHost(entry.host);
    if (inspection.interactive) {
      break;
    }
  }
  if (!inspection.interactive) {
    throw new Error('BOM_ACCEPTANCE_INTERACTIVE_UNSTABLE');
  }
  entry.interactiveVerified = true;
  return inspection;
}

function inspectHost(host: HTMLDivElement): HostInspection {
  const rendererRootCount = host.querySelectorAll(
    '[data-bom-canvas-renderer]',
  ).length;
  const treegrids = host.querySelectorAll<HTMLElement>('[role="treegrid"]');
  const treegrid = treegrids[0] ?? null;
  const canvases = Array.from(
    host.querySelectorAll<HTMLCanvasElement>('canvas'),
  );
  const nonEmptyCanvasCount = canvases.filter(
    (canvas) => canvas.width > 0 && canvas.height > 0,
  ).length;
  const paintedCanvasCount = canvases.filter(canvasHasPaint).length;
  const canvasBackingBytes = canvases.reduce(
    (total, canvas) => total + canvas.width * canvas.height * 4,
    0,
  );
  const activeDescendant = treegrid?.getAttribute('aria-activedescendant') ?? null;
  const activeElement =
    activeDescendant === null ? null : document.getElementById(activeDescendant);
  const hitPoint = interactionPoint(host);
  const hitTarget = pointIsInViewport(hitPoint)
    ? document.elementFromPoint(hitPoint.x, hitPoint.y)
    : null;
  const hitTreegrid = hitTarget?.closest('[role="treegrid"]') ?? null;
  const hittable = treegrid !== null && hitTreegrid === treegrid;
  const columnHeaderCount = host.querySelectorAll('[role="columnheader"]').length;
  const rowHeaderCount = host.querySelectorAll('[role="rowheader"]').length;
  const ariaRowCount = readIntegerAttribute(treegrid, 'aria-rowcount');
  const ariaColumnCount = readIntegerAttribute(treegrid, 'aria-colcount');
  const activeDescendantExists =
    activeElement !== null && host.contains(activeElement);
  const interactive =
    rendererRootCount === 1 &&
    treegrids.length === 1 &&
    canvases.length === scenario.layout.canvasLayerCount &&
    nonEmptyCanvasCount === canvases.length &&
    paintedCanvasCount === canvases.length &&
    activeDescendantExists &&
    columnHeaderCount > 0 &&
    rowHeaderCount > 0 &&
    ariaRowCount === fixture.snapshot.nodes.length + 1 &&
    ariaColumnCount === columns.length + 1 &&
    hittable;

  return Object.freeze({
    hostId: host.id,
    rendererRootCount,
    treegridCount: treegrids.length,
    canvasCount: canvases.length,
    nonEmptyCanvasCount,
    paintedCanvasCount,
    canvasBackingBytes,
    portalCount: host.querySelectorAll('[data-bom-editor-portal]').length,
    columnHeaderCount,
    rowHeaderCount,
    ariaRowCount,
    ariaColumnCount,
    activeDescendant,
    activeDescendantExists,
    hitPoint,
    hitTargetRole: hitTarget?.getAttribute('role') ?? null,
    hittable,
    interactive,
  });
}

function canvasHasPaint(canvas: HTMLCanvasElement): boolean {
  if (canvas.width === 0 || canvas.height === 0) {
    return false;
  }
  const context = canvas.getContext('2d');
  const rendererRoot = canvas.closest<HTMLElement>(
    '[data-bom-canvas-renderer]',
  );
  if (context === null || rendererRoot === null) {
    return false;
  }
  const canvasRect = canvas.getBoundingClientRect();
  const rootRect = rendererRoot.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) {
    return false;
  }
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  const sampleX = Math.max(
    0,
    Math.floor((rootRect.left - canvasRect.left) * scaleX),
  );
  const sampleY = Math.max(
    0,
    Math.floor((rootRect.top - canvasRect.top) * scaleY),
  );
  const sampleWidth = Math.min(
    canvas.width - sampleX,
    Math.ceil(Math.min(rootRect.width, 512) * scaleX),
  );
  const sampleHeight = Math.min(
    canvas.height - sampleY,
    Math.ceil(Math.min(rootRect.height, 256) * scaleY),
  );
  if (sampleWidth <= 0 || sampleHeight <= 0) {
    return false;
  }
  try {
    const pixels = context.getImageData(
      sampleX,
      sampleY,
      sampleWidth,
      sampleHeight,
    ).data;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] !== 0) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function recordApplicationPixelPaint(
  instanceId: string,
  frame: Readonly<BomCanvasFrameCommit>,
): void {
  const capture = activeScrollCapture;
  if (
    capture === null ||
    capture.instanceId !== instanceId ||
    frame.protocol !== 'bom-canvas-frame-commit/v1'
  ) {
    return;
  }
  const entry = activeInstances.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (entry === undefined) {
    return;
  }
  const layers = Object.freeze(
    (['background', 'content'] as const).map((layer) =>
      sampleApplicationPixelLayer(entry.host, frame, capture, layer),
    ),
  );
  capture.paintStates.push(Object.freeze({
    sequence: frame.sequence,
    completedAtMs: frame.completedAtMs,
    revision: frame.revision,
    scrollLeft: frame.scrollLeft,
    scrollTop: frame.scrollTop,
    viewport: Object.freeze({ ...frame.viewport }),
    surface: Object.freeze({
      x: frame.surface.x,
      y: frame.surface.y,
      width: frame.surface.width,
      height: frame.surface.height,
    }),
    layers,
  }));
}

function sampleApplicationPixelLayer(
  host: HTMLDivElement,
  frame: Readonly<BomCanvasFrameCommit>,
  capture: ActiveScrollCapture,
  layer: 'background' | 'content',
): ApplicationPixelLayerSample {
  const failed = (): ApplicationPixelLayerSample => Object.freeze({
    layer,
    readbackSucceeded: false,
    sampledPixelCount: 0,
    nonTransparentPixelCount: 0,
    rgbaChecksum: null,
  });
  const canvas = host.querySelector<HTMLCanvasElement>(
    'canvas[data-bom-canvas-layer="' + layer + '"]',
  );
  if (
    canvas === null ||
    canvas.width <= 0 ||
    canvas.height <= 0 ||
    frame.surface.width <= 0 ||
    frame.surface.height <= 0
  ) {
    return failed();
  }
  const visibleSurfaceX = Math.max(0, -frame.surface.x);
  const visibleSurfaceY = Math.max(0, -frame.surface.y);
  const sampleCssWidth = Math.min(
    APPLICATION_PIXEL_SAMPLE_CSS_WIDTH,
    frame.viewport.width,
    frame.surface.width - visibleSurfaceX,
  );
  const sampleCssHeight = Math.min(
    APPLICATION_PIXEL_SAMPLE_CSS_HEIGHT,
    frame.viewport.height,
    frame.surface.height - visibleSurfaceY,
  );
  if (sampleCssWidth <= 0 || sampleCssHeight <= 0) {
    return failed();
  }
  const scaleX = canvas.width / frame.surface.width;
  const scaleY = canvas.height / frame.surface.height;
  const sourceX = Math.max(0, Math.floor(visibleSurfaceX * scaleX));
  const sourceY = Math.max(0, Math.floor(visibleSurfaceY * scaleY));
  const sourceWidth = Math.min(
    canvas.width - sourceX,
    Math.max(1, Math.ceil(sampleCssWidth * scaleX)),
  );
  const sourceHeight = Math.min(
    canvas.height - sourceY,
    Math.max(1, Math.ceil(sampleCssHeight * scaleY)),
  );
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return failed();
  }
  try {
    const context = capture.scratchContext;
    context.clearRect(
      0,
      0,
      APPLICATION_PIXEL_SAMPLE_WIDTH,
      APPLICATION_PIXEL_SAMPLE_HEIGHT,
    );
    context.drawImage(
      canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      APPLICATION_PIXEL_SAMPLE_WIDTH,
      APPLICATION_PIXEL_SAMPLE_HEIGHT,
    );
    const pixels = context.getImageData(
      0,
      0,
      APPLICATION_PIXEL_SAMPLE_WIDTH,
      APPLICATION_PIXEL_SAMPLE_HEIGHT,
    ).data;
    let nonTransparentPixelCount = 0;
    let checksum = 0x811c9dc5;
    for (let offset = 0; offset < pixels.length; offset += 1) {
      checksum ^= pixels[offset]!;
      checksum = Math.imul(checksum, 0x01000193) >>> 0;
      if (offset % 4 === 3 && pixels[offset] !== 0) {
        nonTransparentPixelCount += 1;
      }
    }
    return Object.freeze({
      layer,
      readbackSucceeded: true,
      sampledPixelCount:
        APPLICATION_PIXEL_SAMPLE_WIDTH * APPLICATION_PIXEL_SAMPLE_HEIGHT,
      nonTransparentPixelCount,
      rgbaChecksum: checksum.toString(16).padStart(8, '0'),
    });
  } catch {
    return failed();
  }
}

function currentState(): AcceptanceState {
  const instances = activeInstances.map(instanceState);
  const focused = activeInstances.find((entry) =>
    entry.host.contains(document.activeElement),
  );
  return Object.freeze({
    apiVersion: 1,
    phase,
    lastOperation,
    lastError,
    instanceCount: instances.length,
    focusedInstanceId: focused?.instanceId ?? null,
    rendererRootCount: hostGrid.querySelectorAll(
      '[data-bom-canvas-renderer]',
    ).length,
    canvasCount: hostGrid.querySelectorAll('canvas').length,
    portalCount: hostGrid.querySelectorAll(
      '[data-bom-editor-portal]',
    ).length,
    instances: Object.freeze(instances),
  });
}

function instanceState(entry: ActiveInstance): AcceptanceInstanceState {
  const inspection = inspectHost(entry.host);
  const diagnostics = entry.editor.getDiagnostics();
  return Object.freeze({
    ...inspection,
    instanceId: entry.instanceId,
    lifecycle: diagnostics.lifecycle,
    revision: entry.editor.getSnapshot().revision,
    contentHash: contentHashForEntry(entry),
    mountedResources: diagnostics.mountedResources,
    readyEventCount: entry.counters.ready,
    destroyedEventCount: entry.counters.destroyed,
    interactiveVerified: entry.interactiveVerified,
  });
}

function appendPanel(instanceId: string, index: number): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'acceptance-instance';
  panel.dataset['instanceId'] = instanceId;
  const heading = document.createElement('h2');
  heading.textContent = 'Instance ' + String(index + 1) + ' / ' + instanceId;
  const host = createHostElement('acceptance-host-' + encodeIdPart(instanceId));
  panel.append(heading, host);
  hostGrid.appendChild(panel);
  return panel;
}

function createHostElement(hostId: string): HTMLDivElement {
  const host = document.createElement('div');
  host.id = hostId;
  host.className = 'acceptance-host';
  host.setAttribute('aria-label', hostId);
  return host;
}

function interactionPoint(host: HTMLElement): AcceptancePoint {
  const rect = host.getBoundingClientRect();
  const rowHeaderWidth = 48;
  const firstColumnWidth = scenario.columns[0]?.width ?? 120;
  const availableDataWidth = Math.max(1, rect.width - rowHeaderWidth - 2);
  const cellOffset = Math.min(firstColumnWidth / 2, availableDataWidth / 2);
  return Object.freeze({
    x: rect.left + rowHeaderWidth + cellOffset,
    y:
      rect.top +
      scenario.layout.headerHeight +
      scenario.layout.rowHeight / 2,
  });
}

function inputCellPosition(): AcceptancePoint {
  const targetIndex = scenario.columns.findIndex(
    (column) => column.columnId === scenario.interaction.targetColumnId,
  );
  if (targetIndex < 0) {
    throw new Error('BOM_ACCEPTANCE_INPUT_COLUMN_MISSING');
  }
  let x = 48;
  for (let index = 0; index < targetIndex; index += 1) {
    x += scenario.columns[index]?.width ?? 0;
  }
  x += (scenario.columns[targetIndex]?.width ?? 0) / 2;
  return Object.freeze({
    x,
    y:
      scenario.layout.headerHeight +
      scenario.layout.rowHeight / 2,
  });
}

async function waitForTargetSemanticCell(
  entry: ActiveInstance,
  ariaRowIndex: number,
  expectedValue: string,
): Promise<void> {
  const targetColumnIndex = scenario.columns.findIndex(
    (column) => column.columnId === scenario.interaction.targetColumnId,
  );
  if (targetColumnIndex < 0) {
    throw new Error('BOM_ACCEPTANCE_INPUT_COLUMN_MISSING');
  }
  const ariaColumnIndex = targetColumnIndex + 2;
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const row = entry.host.querySelector<HTMLElement>(
      '[role="row"][aria-rowindex="' + String(ariaRowIndex) + '"]',
    );
    const cell = row?.querySelector<HTMLElement>(
      '[role="gridcell"][aria-colindex="' +
        String(ariaColumnIndex) +
        '"]',
    );
    if (cell?.textContent === expectedValue) {
      return;
    }
    await nextAnimationFrame();
  }
  throw new Error('BOM_ACCEPTANCE_INPUT_TARGET_SEMANTICS_TIMEOUT');
}

function readInputTargetValue(entry: ActiveInstance): string {
  const node = entry.editor
    .getSnapshot()
    .nodes.find(
      (candidate) =>
        candidate.occurrenceId === targetNode.occurrenceId,
    );
  const value = node?.fields['name'];
  if (typeof value !== 'string') {
    throw new Error('BOM_ACCEPTANCE_INPUT_TARGET_VALUE_INVALID');
  }
  return value;
}

function pointIsInViewport(point: AcceptancePoint): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < window.innerWidth &&
    point.y < window.innerHeight
  );
}

function readIntegerAttribute(
  element: Element | null,
  name: string,
): number | null {
  const value = element?.getAttribute(name);
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function contentHashForEntry(entry: ActiveInstance): string {
  const snapshot = entry.editor.getSnapshot();
  if (snapshot.revision !== entry.cachedRevision) {
    entry.cachedContentHash = hashSnapshot(snapshot);
    entry.cachedRevision = snapshot.revision;
  }
  return entry.cachedContentHash;
}

function hashSnapshot(snapshot: unknown): string {
  const result = hashBomDocumentContent(snapshot, fixture.schema);
  if (!result.ok) {
    throw new Error(
      'BOM_ACCEPTANCE_HASH_FAILED:' +
        result.errors.map((error) => error.code).join(','),
    );
  }
  return result.value;
}

function requirePrimaryInstance(): ActiveInstance {
  const entry = activeInstances[0];
  if (entry === undefined) {
    throw new Error('BOM_ACCEPTANCE_INSTANCE_REQUIRED');
  }
  return entry;
}

function assertDisposableRealmCoordinator(): void {
  if (
    new URLSearchParams(window.location.search).get(
      DISPOSABLE_REALM_QUERY_KEY,
    ) === '1'
  ) {
    throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_NESTING_FORBIDDEN');
  }
}

function assertNoDisposableRealm(operation: string): void {
  if (activeDisposableRealm !== null) {
    throw new Error(
      'BOM_ACCEPTANCE_DISPOSABLE_REALM_EXPLICIT_DISCARD_REQUIRED:' +
        operation +
        ':' +
        activeDisposableRealm.realmId,
    );
  }
}

function assertOperationCompatibleWithDisposableRealm(
  operation: string,
): void {
  if (
    activeDisposableRealm !== null &&
    operation !== 'destroyDisposableRealm' &&
    operation !== 'releaseDisposableRealm' &&
    operation !== 'discardDisposableRealm'
  ) {
    throw new Error(
      'BOM_ACCEPTANCE_DISPOSABLE_REALM_OPERATION_BLOCKED:' +
        operation +
        ':' +
        activeDisposableRealm.realmId,
    );
  }
}

function requireDisposableRealm(realmId: string): ActiveDisposableRealm {
  const active = activeDisposableRealm;
  if (active === null) {
    throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_REQUIRED:' + realmId);
  }
  if (active.realmId !== realmId) {
    throw new Error(
      'BOM_ACCEPTANCE_DISPOSABLE_REALM_ID_MISMATCH:' +
        realmId +
        ':' +
        active.realmId,
    );
  }
  return active;
}

function requireSameOriginRealmDocument(
  active: ActiveDisposableRealm,
): Document {
  if (!active.frame.isConnected) {
    throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_DETACHED_EARLY');
  }
  try {
    const childWindow = active.frame.contentWindow;
    const childDocument = active.frame.contentDocument;
    if (
      childWindow === null ||
      childDocument === null ||
      childWindow.parent !== window ||
      childWindow.location.origin !== window.location.origin ||
      childWindow.location.href !== active.childUrl ||
      new URLSearchParams(childWindow.location.search).get(
        DISPOSABLE_REALM_ID_QUERY_KEY,
      ) !== active.realmId
    ) {
      throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_NOT_SAME_ORIGIN');
    }
    return childDocument;
  } catch {
    throw new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_NOT_SAME_ORIGIN');
  }
}

function approximatelyEqualDevicePixelRatio(
  actual: number,
  expected: number,
): boolean {
  return Number.isFinite(actual) &&
    Number.isFinite(expected) &&
    Math.abs(actual - expected) <= 0.001;
}

function waitForDisposableRealmLoad(
  frame: HTMLIFrameElement,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      frame.removeEventListener('load', onLoad);
      frame.removeEventListener('error', onError);
      window.clearTimeout(timeoutId);
    };
    const settle = (failure?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (failure === undefined) {
        resolve();
      } else {
        reject(failure);
      }
    };
    const onLoad = (): void => {
      settle();
    };
    const onError = (): void => {
      settle(new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_LOAD_FAILED'));
    };
    const timeoutId = window.setTimeout(() => {
      settle(new Error('BOM_ACCEPTANCE_DISPOSABLE_REALM_LOAD_TIMEOUT'));
    }, 30_000);
    frame.addEventListener('load', onLoad);
    frame.addEventListener('error', onError);
  });
}

function cloneIntoCoordinatorRealm<T>(value: T): T {
  return window.structuredClone(value);
}

function requireOk<T>(result: BomResult<T>, operation: string): T {
  if (!result.ok) {
    throw new Error(
      'BOM_ACCEPTANCE_' + operation.toUpperCase() + '_FAILED:' + result.error.code,
    );
  }
  return result.value;
}

function normalizeInstanceCount(value: unknown): AcceptanceInstanceCount {
  if (value === 1 || value === 3 || value === 5) {
    return value;
  }
  throw new RangeError('BOM_ACCEPTANCE_INSTANCE_COUNT_INVALID');
}

function normalizeDisposableRealmInstanceCount(
  value: unknown,
): DisposableRealmInstanceCount {
  return value === 0 ? 0 : normalizeInstanceCount(value);
}

function instanceCountFromInput(value: unknown): AcceptanceInstanceCount {
  if (
    typeof value === 'object' &&
    value !== null &&
    'instanceCount' in value
  ) {
    return normalizeInstanceCount(
      (value as Readonly<{ instanceCount: unknown }>).instanceCount,
    );
  }
  return normalizeInstanceCount(value);
}

function optionalInstanceCountFromInput(
  value: unknown,
): AcceptanceInstanceCount | null {
  return value === undefined ? null : instanceCountFromInput(value);
}

function realmIdFromInput(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'realmId' in value
  ) {
    return normalizeRealmId(
      (value as Readonly<{ realmId: unknown }>).realmId,
    );
  }
  return normalizeRealmId(value);
}

function normalizeRealmId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('BOM_ACCEPTANCE_DISPOSABLE_REALM_ID_INVALID');
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 96 ||
    !/^[A-Za-z0-9._-]+$/.test(normalized)
  ) {
    throw new RangeError('BOM_ACCEPTANCE_DISPOSABLE_REALM_ID_INVALID');
  }
  return normalized;
}

function sampleIdFromInput(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'sampleId' in value
  ) {
    return normalizeSampleId(
      (value as Readonly<{ sampleId: unknown }>).sampleId,
    );
  }
  return normalizeSampleId(value);
}

function normalizeSampleId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('BOM_ACCEPTANCE_SAMPLE_ID_INVALID');
  }
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-');
  if (normalized.length === 0 || normalized.length > 96) {
    throw new RangeError('BOM_ACCEPTANCE_SAMPLE_ID_INVALID');
  }
  return normalized;
}

function encodeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function safeErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'BOM_ACCEPTANCE_UNKNOWN_FAILURE';
}

function acceptanceFailure(message: string): never {
  throw new Error(message);
}

function discardInputSession(): void {
  const session = inputSession;
  if (session !== null && isArmedInputSession(session)) {
    cleanupArmedInput(session);
  }
  inputSession = null;
}

function writeTimingMark(name: string, startTime: number): void {
  performance.mark(name, { startTime });
  activeTimingMarks.add(name);
}

function clearTimingMarks(): void {
  for (const name of activeTimingMarks) {
    performance.clearMarks(name);
  }
  activeTimingMarks.clear();
}

function updateStatus(): void {
  statusOutput.value =
    phase +
    ' / ' +
    lastOperation +
    ' / instances ' +
    String(activeInstances.length) +
    (lastError === null ? '' : ' / ' + lastError);
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error('BOM_ACCEPTANCE_ELEMENT_MISSING:' + id);
  }
  return element as T;
}

function formatBomValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    if (
      (record['$type'] === 'decimal' || record['$type'] === 'integer') &&
      typeof record['value'] === 'string'
    ) {
      return record['$type'] === 'decimal' &&
        typeof record['unit'] === 'string'
        ? record['value'] + ' ' + record['unit']
        : record['value'];
    }
    return JSON.stringify(value) ?? '';
  }
  return '';
}
