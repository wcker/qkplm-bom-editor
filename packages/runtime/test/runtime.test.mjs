import assert from 'node:assert/strict';
import test from 'node:test';

let windowAccesses = 0;
const previousWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'window',
);
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  get() {
    windowAccesses += 1;
    throw new Error('window must not be read during module import');
  },
});

const runtime = await import('../dist/index.js?dom-import-boundary');
assert.equal(windowAccesses, 0);

if (previousWindowDescriptor === undefined) {
  delete globalThis.window;
} else {
  Object.defineProperty(globalThis, 'window', previousWindowDescriptor);
}

const {
  EventHub,
  ResourceRegistry,
  createBomEditStateMachine,
  detectBomCapabilities,
  isBomRuntimeCancellableEvent,
} = runtime;

const capabilities = Object.freeze({
  worker: false,
  offscreenCanvas: false,
  clipboard: 'unavailable',
  pointerEvents: false,
  resizeObserver: false,
  intl: false,
  secureContext: false,
});

const diagnostics = Object.freeze({
  lifecycle: 'ready',
  queuedTasks: 0,
  activeTasks: 0,
});

const editDetail = Object.freeze({
  documentId: 'document-1',
  documentGeneration: 1,
  address: Object.freeze({ occurrenceId: 'row-1', columnId: 'quantity' }),
  initialValue: '1',
  trigger: 'keyboard',
});

const commitDetail = Object.freeze({
  documentId: 'document-1',
  documentGeneration: 1,
  draft: Object.freeze({
    address: editDetail.address,
    originalValue: '1',
    value: '2',
    dirty: true,
  }),
  reason: 'enter',
});

const validationError = Object.freeze({
  code: 'BOM_EDIT_VALUE_INVALID',
  category: 'VALIDATION',
  messageKey: 'bom.edit.valueInvalid',
  recoverable: true,
});

test('module import does not access DOM globals and capability detection is injectable', () => {
  const Constructor = class {};
  const detected = detectBomCapabilities({
    Worker: Constructor,
    OffscreenCanvas: Constructor,
    PointerEvent: Constructor,
    ResizeObserver: Constructor,
    ClipboardEvent: Constructor,
    Intl: Object.freeze({}),
    isSecureContext: true,
    navigator: {
      clipboard: {
        readText() {},
        writeText() {},
      },
      hardwareConcurrency: 8.9,
      deviceMemory: 16,
    },
    document: {
      addEventListener() {},
      removeEventListener() {},
    },
  });

  assert.deepEqual(detected, {
    worker: true,
    offscreenCanvas: true,
    clipboard: 'async',
    pointerEvents: true,
    resizeObserver: true,
    intl: true,
    secureContext: true,
    hardwareConcurrency: 8,
    deviceMemoryGiB: 16,
  });
  assert.equal(Object.isFrozen(detected), true);

  const fallback = detectBomCapabilities({
    isSecureContext: false,
    document: {
      addEventListener() {},
      removeEventListener() {},
    },
  });
  assert.equal(fallback.clipboard, 'event-fallback');
  assert.equal(detectBomCapabilities(null).clipboard, 'unavailable');
});

test('EventHub supplies a monotonic envelope and synchronous cancellation', () => {
  const reported = [];
  let storedPreventDefault;
  const hub = new EventHub({
    instanceId: 'instance-1',
    now: () => 1234,
    diagnosticSink: (diagnostic) => reported.push(diagnostic),
  });

  hub.on('beforeEdit', (event) => {
    storedPreventDefault = event.preventDefault;
    throw new Error('isolated listener failure');
  });
  let secondListenerCalls = 0;
  hub.on('beforeEdit', (event) => {
    secondListenerCalls += 1;
    assert.equal(isBomRuntimeCancellableEvent(event), true);
    event.preventDefault();
  });
  assert.equal(hub.listenerCount, 2);

  const result = hub.dispatch('beforeEdit', editDetail);
  assert.equal(result.ok, true);
  assert.equal(result.event.type, 'beforeEdit');
  assert.equal(result.event.instanceId, 'instance-1');
  assert.equal(result.event.sequence, 1);
  assert.equal(result.event.timestamp, 1234);
  assert.equal(result.event.defaultPrevented, true);
  assert.equal(Object.isFrozen(result.event), true);
  assert.equal(secondListenerCalls, 1);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].code, 'BOM_EVENT_LISTENER_FAILED');

  storedPreventDefault();
  assert.equal(result.event.defaultPrevented, true);

  const metric = hub.dispatch('metric', {
    name: 'frame.duration',
    value: 4,
    unit: 'ms',
  });
  assert.equal(metric.ok, true);
  assert.equal(metric.event.sequence, 2);
  assert.equal(isBomRuntimeCancellableEvent(metric.event), false);
  assert.equal('preventDefault' in metric.event, false);
  hub.clear();
  assert.equal(hub.listenerCount, 0);
});

test('EventHub preserves persistence recovery metadata in its frozen envelope', () => {
  const recoveryReason = Object.freeze({
    code: 'BOM_DATASOURCE_RECOVERY_FAILED',
    category: 'IO',
    messageKey: 'bom.datasource.recoveryFailed',
    recoverable: true,
  });
  const recoveryBundle = Object.freeze({
    protocolVersion: '1.0.0',
    documentId: 'document-1',
    schemaVersion: '1.0.0',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    baseRevision: 'local-1',
    sourceRevision: 'source-1',
    failedTransactionId: 'transaction-1',
    createdAt: '2026-07-20T00:00:00.000Z',
    transactions: Object.freeze([]),
    reason: recoveryReason,
  });
  const patch = Object.freeze({
    protocolVersion: '1.0.0',
    documentId: 'document-1',
    baseRevision: 'local-1',
    transactionId: 'transaction-1',
    origin: 'persistence:recovery',
    timestamp: '2026-07-20T00:00:00.000Z',
    operations: Object.freeze([]),
  });
  const hub = new EventHub({
    instanceId: 'instance-recovery',
    now: () => 1235,
  });
  let observed;
  hub.on('transactionPersistenceChanged', (event) => {
    observed = event;
  });

  const result = hub.dispatch('transactionPersistenceChanged', {
    documentId: 'document-1',
    documentGeneration: 2,
    transactionId: 'transaction-1',
    origin: 'persistence:recovery',
    previousRevision: 'local-1',
    revision: 'local-2',
    patch,
    state: 'reloadRequired',
    sourceRevision: 'source-1',
    recoveryId: 'recovery-1',
    retryable: true,
    recoveryBundle,
    error: recoveryReason,
  });

  assert.equal(result.ok, true);
  assert.strictEqual(observed, result.event);
  assert.equal(result.event.recoveryId, 'recovery-1');
  assert.equal(result.event.retryable, true);
  assert.strictEqual(result.event.recoveryBundle, recoveryBundle);
  assert.strictEqual(result.event.error, recoveryReason);
  assert.equal(Object.isFrozen(result.event), true);
  assert.equal(Object.isFrozen(result.event.recoveryBundle), true);
  assert.deepEqual(structuredClone(result.event), {
    documentId: 'document-1',
    documentGeneration: 2,
    transactionId: 'transaction-1',
    origin: 'persistence:recovery',
    previousRevision: 'local-1',
    revision: 'local-2',
    patch,
    state: 'reloadRequired',
    sourceRevision: 'source-1',
    recoveryId: 'recovery-1',
    retryable: true,
    recoveryBundle,
    error: recoveryReason,
    type: 'transactionPersistenceChanged',
    instanceId: 'instance-recovery',
    sequence: 1,
    timestamp: 1235,
  });
});

test('EventHub publishes a serializable material-match audit envelope', () => {
  const hub = new EventHub({
    instanceId: 'instance-material-match',
    now: () => 1236,
  });
  const result = hub.dispatch('materialMatchAudit', {
    documentId: 'document-1',
    documentGeneration: 2,
    baseRevision: 'local-4',
    proposalId: 'material-match:1',
    decision: 'applied',
    targetOccurrenceId: 'row-2',
    candidateOccurrenceId: 'row-1',
    algorithmVersion: 'bom-match/v1',
    score: 0.99,
    confidence: 0.98,
    decisionId: 'manual-review',
    transactionId: 'transaction-4',
  });

  assert.equal(result.ok, true);
  assert.equal(Object.isFrozen(result.event), true);
  assert.deepEqual(structuredClone(result.event), {
    documentId: 'document-1',
    documentGeneration: 2,
    baseRevision: 'local-4',
    proposalId: 'material-match:1',
    decision: 'applied',
    targetOccurrenceId: 'row-2',
    candidateOccurrenceId: 'row-1',
    algorithmVersion: 'bom-match/v1',
    score: 0.99,
    confidence: 0.98,
    decisionId: 'manual-review',
    transactionId: 'transaction-4',
    type: 'materialMatchAudit',
    instanceId: 'instance-material-match',
    sequence: 1,
    timestamp: 1236,
  });
});

test('late preventDefault is inert, including after an await', async () => {
  const hub = new EventHub({ instanceId: 'instance-late' });
  let storedEvent;
  hub.on('beforeCommit', async (event) => {
    storedEvent = event;
    await Promise.resolve();
    event.preventDefault();
  });

  const result = hub.dispatch('beforeCommit', commitDetail);
  assert.equal(result.ok, true);
  assert.equal(result.event.defaultPrevented, false);
  await Promise.resolve();
  assert.equal(storedEvent.defaultPrevented, false);
});

test('async listener rejection is observed without blocking later listeners', async () => {
  let resolveDiagnostic;
  const diagnosticReceived = new Promise((resolve) => {
    resolveDiagnostic = resolve;
  });
  const hub = new EventHub({
    instanceId: 'instance-async-failure',
    diagnosticSink: resolveDiagnostic,
  });
  let laterCalls = 0;
  hub.on('metric', async () => {
    await Promise.resolve();
    throw new Error('async listener failure');
  });
  hub.on('metric', () => {
    laterCalls += 1;
  });

  const result = hub.dispatch('metric', {
    name: 'async-listener',
    value: 1,
    unit: 'count',
  });
  assert.equal(result.ok, true);
  assert.equal(laterCalls, 1);
  const reported = await diagnosticReceived;
  assert.equal(reported.code, 'BOM_EVENT_LISTENER_FAILED');
  assert.equal(reported.sequence, 1);
});

test('EventHub rejects listener reentrancy without disturbing the outer dispatch', () => {
  const hub = new EventHub({ instanceId: 'instance-reentrant' });
  let nestedResult;
  let metricCalls = 0;
  let laterReadyCalls = 0;

  hub.on('metric', () => {
    metricCalls += 1;
  });
  hub.on('ready', () => {
    nestedResult = hub.dispatch('metric', {
      name: 'nested',
      value: 1,
      unit: 'count',
    });
  });
  hub.on('ready', () => {
    laterReadyCalls += 1;
  });

  const outer = hub.dispatch('ready', { capabilities, diagnostics });
  assert.equal(outer.ok, true);
  assert.deepEqual(nestedResult, {
    ok: false,
    error: {
      code: 'BOM_EVENT_REENTRANT_DISPATCH',
      eventType: 'metric',
    },
  });
  assert.equal(metricCalls, 0);
  assert.equal(laterReadyCalls, 1);
  assert.equal(hub.sequence, 1);
});

test('EventHub on/off is idempotent and removal is effective mid-dispatch', () => {
  const hub = new EventHub({ instanceId: 'instance-off' });
  let removedCalls = 0;
  const removed = () => {
    removedCalls += 1;
  };
  let unsubscribeRemoved = () => {};
  hub.on('ready', () => unsubscribeRemoved());
  unsubscribeRemoved = hub.on('ready', removed);

  const result = hub.dispatch('ready', { capabilities, diagnostics });
  unsubscribeRemoved();
  assert.equal(result.ok, true);
  assert.equal(removedCalls, 0);
});

test('edit state machine enforces IME and commit transitions', () => {
  const machine = createBomEditStateMachine();
  assert.equal(machine.state.status, 'idle');
  assert.equal(machine.transition({ type: 'focus' }).ok, true);
  assert.equal(
    machine.transition({
      type: 'beginEdit',
      draft: commitDetail.draft,
    }).ok,
    true,
  );
  assert.equal(machine.transition({ type: 'compositionStart' }).ok, true);
  assert.equal(machine.state.status, 'composing');

  const blockedCommit = machine.transition({ type: 'beginValidation' });
  assert.deepEqual(blockedCommit, {
    ok: false,
    code: 'BOM_EDIT_INVALID_TRANSITION',
    from: 'composing',
    action: 'beginValidation',
  });
  assert.equal(machine.state.status, 'composing');

  assert.equal(
    machine.transition({ type: 'updateDraft', value: 'IME value' }).ok,
    true,
  );
  assert.equal(machine.transition({ type: 'compositionEnd' }).ok, true);
  assert.equal(
    machine.transition({ type: 'beginValidation', validationId: 'v-1' }).ok,
    true,
  );
  assert.equal(machine.transition({ type: 'reject', error: validationError }).ok, true);
  assert.equal(machine.state.status, 'rejected');
  assert.equal(machine.state.phase, 'validation');
  assert.equal(machine.state.draft.value, 'IME value');

  assert.equal(machine.transition({ type: 'beginValidation' }).ok, true);
  assert.equal(
    machine.transition({ type: 'beginCommit', transactionId: 'tx-1' }).ok,
    true,
  );
  assert.equal(machine.transition({ type: 'reject', error: validationError }).ok, true);
  assert.equal(machine.state.status, 'rejected');
  assert.equal(machine.state.phase, 'commit');
  assert.equal(machine.state.draft.value, 'IME value');

  assert.equal(machine.transition({ type: 'updateDraft', value: 'fixed' }).ok, true);
  assert.equal(machine.state.status, 'editing');
  assert.equal(machine.transition({ type: 'beginValidation' }).ok, true);
  assert.equal(machine.transition({ type: 'beginCommit' }).ok, true);
  assert.equal(machine.transition({ type: 'commitSucceeded' }).ok, true);
  assert.equal(machine.state.status, 'focused');
  assert.equal(machine.state.draft, null);
});

test('ResourceRegistry disposes LIFO once and isolates cleanup failures', () => {
  const order = [];
  const reported = [];
  const registry = new ResourceRegistry({
    diagnosticSink: (diagnostic) => reported.push(diagnostic),
  });
  registry.register(() => order.push('first'), 'first');
  registry.register(() => {
    order.push('second');
    throw new Error('cleanup failure');
  }, 'second');
  registry.register(() => order.push('third'), 'third');
  const disposeEarly = registry.register(() => order.push('early'), 'early');

  assert.equal(registry.size, 4);
  disposeEarly();
  disposeEarly();
  assert.equal(registry.size, 3);
  registry.dispose();
  registry.dispose();
  assert.deepEqual(order, ['early', 'third', 'second', 'first']);
  assert.equal(registry.size, 0);
  assert.equal(registry.disposed, true);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].resourceKind, 'second');

  registry.register(() => order.push('late'), 'late');
  assert.deepEqual(order, ['early', 'third', 'second', 'first', 'late']);
  const ledger = registry.getDiagnostics();
  assert.equal(ledger.protocol, 'bom-resource-registry-ledger/v1');
  assert.equal(ledger.disposed, true);
  assert.equal(ledger.registeredCount, 5);
  assert.equal(ledger.activeCount, 0);
  assert.equal(ledger.cleanupAttemptCount, 5);
  assert.equal(ledger.cleanupFailureCount, 1);
  assert.equal(Object.isFrozen(ledger), true);
  assert.equal(Object.isFrozen(ledger.kinds), true);
  assert.deepEqual(
    ledger.kinds.find((entry) => entry.kind === 'second'),
    {
      kind: 'second',
      tracked: true,
      supported: true,
      registeredCount: 1,
      activeCount: 0,
      cleanupAttemptCount: 1,
      cleanupFailureCount: 1,
    },
  );
});

test('ResourceRegistry browser ownership helpers clean up by typed kind', () => {
  const removals = [];
  const target = {
    addEventListener(type, listener, options) {
      this.added = { type, listener, options };
    },
    removeEventListener(type, listener, capture) {
      removals.push({ type, listener, capture });
    },
  };
  const observer = {
    disconnected: 0,
    disconnect() {
      this.disconnected += 1;
    },
  };
  const cancelledFrames = [];
  const clearedTimeouts = [];
  const clearedIntervals = [];
  const worker = {
    terminated: 0,
    terminate() {
      this.terminated += 1;
    },
  };
  let cancelledTasks = 0;
  const listener = () => {};
  const registry = new ResourceRegistry();

  registry.trackEvent(target, 'resize', listener, { capture: true });
  registry.trackObserver(observer, 'resize-observer');
  registry.trackAnimationFrame(42, (requestId) => cancelledFrames.push(requestId));
  registry.trackTimeout(7, (handle) => clearedTimeouts.push(handle));
  registry.trackInterval(9, (handle) => clearedIntervals.push(handle));
  registry.trackWorker(worker);
  registry.trackTask(() => {
    cancelledTasks += 1;
  }, 'worker-task');
  assert.deepEqual(
    registry.getDiagnostics().kinds.map((entry) => entry.kind),
    [
      'animation-frame',
      'event-listener',
      'interval',
      'resize-observer',
      'timeout',
      'worker',
      'worker-task',
    ],
  );
  registry.dispose();

  assert.deepEqual(cancelledFrames, [42]);
  assert.deepEqual(clearedTimeouts, [7]);
  assert.deepEqual(clearedIntervals, [9]);
  assert.equal(worker.terminated, 1);
  assert.equal(cancelledTasks, 1);
  assert.equal(observer.disconnected, 1);
  assert.deepEqual(removals, [
    { type: 'resize', listener, capture: true },
  ]);
  assert.deepEqual(
    registry.getDiagnostics().kinds.map((entry) => [
      entry.kind,
      entry.activeCount,
      entry.cleanupAttemptCount,
    ]),
    [
      ['animation-frame', 0, 1],
      ['event-listener', 0, 1],
      ['interval', 0, 1],
      ['resize-observer', 0, 1],
      ['timeout', 0, 1],
      ['worker', 0, 1],
      ['worker-task', 0, 1],
    ],
  );
});

test('EventHub exposes listener and pending async-listener ownership', async () => {
  const hub = new EventHub({ instanceId: 'instance-ledger' });
  let settle;
  const pending = new Promise((resolve) => {
    settle = resolve;
  });
  const unsubscribe = hub.on('metric', () => pending);

  hub.dispatch('metric', {
    name: 'listener.pending',
    value: 1,
    unit: 'count',
  });
  assert.equal(hub.registeredListenerCount, 1);
  assert.equal(hub.listenerCount, 1);
  assert.equal(hub.pendingAsyncListenerCount, 1);

  unsubscribe();
  unsubscribe();
  assert.equal(hub.listenerCount, 0);
  assert.equal(hub.removedListenerCount, 1);
  assert.equal(hub.pendingAsyncListenerCount, 1);

  settle();
  await pending;
  await Promise.resolve();
  assert.equal(hub.pendingAsyncListenerCount, 0);
});

test('ResourceRegistry distinguishes unsupported and untracked zero claims', () => {
  const registry = new ResourceRegistry({
    kinds: [
      { kind: 'observer', tracked: true, supported: false },
      { kind: 'worker', tracked: false, supported: true },
      { kind: 'timeout', tracked: false, supported: true },
      { kind: 'interval', tracked: false, supported: false },
    ],
  });

  assert.deepEqual(registry.getDiagnostics().kinds, [
    {
      kind: 'interval',
      tracked: false,
      supported: false,
      registeredCount: null,
      activeCount: null,
      cleanupAttemptCount: null,
      cleanupFailureCount: null,
    },
    {
      kind: 'observer',
      tracked: true,
      supported: false,
      registeredCount: 0,
      activeCount: 0,
      cleanupAttemptCount: 0,
      cleanupFailureCount: 0,
    },
    {
      kind: 'timeout',
      tracked: false,
      supported: true,
      registeredCount: null,
      activeCount: null,
      cleanupAttemptCount: null,
      cleanupFailureCount: null,
    },
    {
      kind: 'worker',
      tracked: false,
      supported: true,
      registeredCount: null,
      activeCount: null,
      cleanupAttemptCount: null,
      cleanupFailureCount: null,
    },
  ]);
});
