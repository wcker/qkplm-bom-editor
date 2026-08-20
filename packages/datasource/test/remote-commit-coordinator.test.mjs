import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOM_DATASOURCE_ERROR_CODES,
  createBomRemoteCommitCoordinator,
} from '../dist/index.js';

const context = Object.freeze({
  protocolVersion: '1.0.0',
  documentId: 'document-a',
  documentGeneration: 1,
  schemaVersion: '1.0.0',
  positionKeyCodecVersion: 'lexicographic-ascii-v1',
  sourceRevision: 'source-0',
});

function error(code = 'TEST_REJECTED', category = 'VALIDATION') {
  return Object.freeze({
    code,
    category,
    messageKey: `test.${code.toLowerCase()}`,
    recoverable: true,
  });
}

function submission(
  transactionId,
  previousRevision,
  revision,
  idempotencyKey,
  value,
  options = {},
) {
  const documentId = options.documentId ?? context.documentId;
  const documentGeneration =
    options.documentGeneration ?? context.documentGeneration;
  const patch = {
    protocolVersion: '1.0.0',
    documentId,
    baseRevision: previousRevision,
    transactionId,
    ...(options.dependsOnTransactionId === undefined
      ? {}
      : { dependsOnTransactionId: options.dependsOnTransactionId }),
    origin: 'test',
    timestamp: '2026-07-19T00:00:00.000Z',
    idempotencyKey,
    operations: [
      {
        op: 'updateField',
        occurrenceId: 'root',
        fieldPath: ['name'],
        value,
      },
    ],
  };
  return {
    documentId,
    documentGeneration,
    commit: {
      transactionId,
      previousRevision,
      revision,
      patch,
      inversePatch: {
        protocolVersion: '1.0.0',
        documentId,
        baseRevision: revision,
        transactionId: `${transactionId}:inverse`,
        origin: 'inverse:test',
        timestamp: '2026-07-19T00:00:00.000Z',
        operations: [
          {
            op: 'updateField',
            occurrenceId: 'root',
            fieldPath: ['name'],
            value: `before-${value}`,
          },
        ],
      },
      warnings: [],
    },
    commands: [
      {
        type: 'setField',
        occurrenceId: 'root',
        fieldPath: ['name'],
        value,
      },
    ],
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function harness(overrides = {}) {
  const requests = [];
  const audits = [];
  const rollbacks = [];
  const replays = [];
  let current = true;
  let recoverySequence = 0;
  let coordinator;
  const dataSource = {
    capabilities: {
      streaming: false,
      lazyChildren: false,
      remoteQuery: false,
      writable: true,
      remoteChanges: false,
      cancelPendingCommit: false,
      queryExecution: {
        search: 'local',
        filter: 'local',
        sort: 'local',
        pagination: 'local',
      },
      ...overrides.capabilities,
    },
    async loadDocument() {
      throw new Error('not used');
    },
    commit(request) {
      const pending = deferred();
      requests.push({ request, pending });
      return pending.promise;
    },
    ...overrides.dataSource,
  };
  const hooks = {
    async rollbackAtomically(request) {
      rollbacks.push(request);
      return { ok: true, value: { revision: 'rollback-revision' } };
    },
    async replayInIsolation(request) {
      replays.push(request);
      return {
        ok: false,
        failedTransactionId:
          request.descendants[0]?.commit.transactionId ??
          request.failedTransaction.commit.transactionId,
        error: error('TEST_REPLAY_FAILED', 'CONFLICT'),
      };
    },
    ...overrides.hooks,
  };
  const created = createBomRemoteCommitCoordinator({
    dataSource,
    context: overrides.context ?? context,
    hooks,
    isCurrentDocument(activeContext) {
      return overrides.isCurrentDocument === undefined
        ? current
        : overrides.isCurrentDocument(activeContext, coordinator);
    },
    audit(event) {
      audits.push(event);
      overrides.audit?.(event, coordinator);
    },
    now: overrides.now === undefined
      ? () => '2026-07-19T01:02:03.000Z'
      : () => overrides.now(coordinator),
    idFactory:
      overrides.idFactory === undefined
        ? () => `recovery-${++recoverySequence}`
        : () => overrides.idFactory(coordinator),
  });
  assert.equal(created.ok, true);
  coordinator = created.value;
  return {
    coordinator,
    requests,
    audits,
    rollbacks,
    replays,
    setCurrent(value) {
      current = value;
    },
  };
}

function mustEnqueue(coordinator, value) {
  const result = coordinator.enqueue(value);
  assert.equal(result.ok, true);
  return result.value;
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('serializes commits, owns patches, and rewrites the pending dependency', async () => {
  const state = harness();
  const firstInput = submission(
    'tx-1', 'local-0', 'local-1', 'global-key-1', 'first-value',
    { dependsOnTransactionId: 'caller-value-must-be-removed' },
  );
  const first = mustEnqueue(state.coordinator, firstInput);
  const second = mustEnqueue(
    state.coordinator,
    submission(
      'tx-2', 'local-1', 'local-2', 'global-key-2', 'second-value',
      { dependsOnTransactionId: 'wrong-parent' },
    ),
  );
  firstInput.commit.patch.operations[0].value = 'mutated-after-enqueue';

  assert.equal(first.submission.commit.patch.dependsOnTransactionId, undefined);
  assert.equal(
    second.submission.commit.patch.dependsOnTransactionId,
    'tx-1',
  );
  assert.equal(
    first.submission.commit.patch.operations[0].value,
    'first-value',
  );
  assert.equal(Object.isFrozen(first.submission.commit.patch), true);

  await turn();
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].request.expectedSourceRevision, 'source-0');
  state.requests[0].pending.resolve({
    status: 'acknowledged',
    sourceRevision: 'source-1',
  });
  await turn();
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[1].request.expectedSourceRevision, 'source-1');
  state.requests[1].pending.resolve({
    status: 'acknowledged',
    sourceRevision: 'source-2',
  });

  assert.deepEqual(await first.outcome, {
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  assert.deepEqual(await second.outcome, {
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  assert.equal((await state.coordinator.whenIdle()).status, 'idle');
  assert.equal(state.coordinator.sourceRevision, 'source-2');
  assert.equal(state.coordinator.context.sourceRevision, 'source-2');
  assert.equal(state.rollbacks.length, 0);

  const reused = state.coordinator.enqueue(
    submission('tx-3', 'local-2', 'local-3', 'global-key-1', 'other'),
  );
  assert.equal(reused.ok, false);
  assert.equal(reused.error.code, BOM_DATASOURCE_ERROR_CODES.idempotencyReused);
  const duplicateTransaction = state.coordinator.enqueue(
    submission('tx-1', 'local-2', 'local-3', 'global-key-3', 'other'),
  );
  assert.equal(duplicateTransaction.ok, false);
  assert.equal(
    duplicateTransaction.error.code,
    BOM_DATASOURCE_ERROR_CODES.coordinatorTransactionDuplicate,
  );
  assert.equal(JSON.stringify(state.audits).includes('first-value'), false);
  assert.equal(JSON.stringify(state.audits).includes('second-value'), false);
});

test('cancels only the dependency-free queue tail before dispatch', async () => {
  const state = harness();
  const first = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  const second = mustEnqueue(
    state.coordinator,
    submission('tx-2', 'local-1', 'local-2', 'key-2', 'two'),
  );

  const cancelled = await state.coordinator.cancelPending('tx-2');
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.value.cancelled, true);
  assert.deepEqual(await second.outcome, {
    status: 'cancelled', sourceRevision: 'source-0',
  });

  await turn();
  assert.equal(state.requests.length, 1);
  state.requests[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  assert.equal((await first.outcome).status, 'acknowledged');
  assert.equal((await state.coordinator.whenIdle()).status, 'idle');
});

test('confirmed in-flight cancellation invalidates the late commit response', async () => {
  const cancellation = deferred();
  const cancelRequests = [];
  const state = harness({
    capabilities: { cancelPendingCommit: true },
    dataSource: {
      cancelCommit(request) {
        cancelRequests.push(request);
        return cancellation.promise;
      },
    },
  });
  const receipt = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  await turn();
  const cancelling = state.coordinator.cancelPending('tx-1');
  assert.equal(cancelRequests.length, 1);
  cancellation.resolve({ cancelled: true, sourceRevision: 'source-0' });
  const cancelled = await cancelling;
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.value.cancelled, true);
  assert.equal((await receipt.outcome).status, 'cancelled');

  state.requests[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'late-source',
  });
  await turn();
  assert.equal(state.coordinator.sourceRevision, 'source-0');
  assert.equal(
    state.audits.some((event) => event.action === 'acknowledged'),
    false,
  );
  assert.deepEqual(
    state.audits
      .filter((event) => event.action.startsWith('cancel'))
      .map((event) => event.action),
    ['cancelStarted', 'cancelled'],
  );
});

test('an explicit dependency survives when a compensation enters an empty queue', async () => {
  const state = harness();
  const original = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  await turn();
  state.requests[0].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  assert.equal((await original.outcome).status, 'acknowledged');

  const compensation = mustEnqueue(
    state.coordinator,
    submission('tx-undo', 'local-1', 'local-2', 'key-undo', 'before-one', {
      dependsOnTransactionId: 'tx-1',
    }),
  );
  assert.equal(
    compensation.submission.commit.patch.dependsOnTransactionId,
    'tx-1',
  );
  await turn();
  assert.equal(
    state.requests[1].request.patch.dependsOnTransactionId,
    'tx-1',
  );
  state.requests[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  assert.equal((await compensation.outcome).status, 'acknowledged');
});

test('explicit rejection rolls back descendants in reverse order and atomically replays them', async () => {
  const rollbackGate = deferred();
  const replayGate = deferred();
  const state = harness({
    hooks: {
      async rollbackAtomically(request) {
        state.rollbacks.push(request);
        return rollbackGate.promise;
      },
      async replayInIsolation(request) {
        state.replays.push(request);
        return replayGate.promise;
      },
    },
  });
  const first = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  const second = mustEnqueue(
    state.coordinator,
    submission('tx-2', 'local-1', 'local-2', 'key-2', 'two'),
  );
  const third = mustEnqueue(
    state.coordinator,
    submission('tx-3', 'local-2', 'local-3', 'key-3', 'three'),
  );
  await turn();
  state.requests[0].pending.resolve({
    status: 'rejected', error: error('PARENT_REJECTED'),
  });
  await turn();
  assert.equal(state.requests.length, 1);
  assert.deepEqual(
    state.rollbacks[0].rollbackOrder.map((item) => item.commit.transactionId),
    ['tx-3', 'tx-2', 'tx-1'],
  );
  assert.equal(
    state.audits.find((event) => event.action === 'rejected').errorCode,
    BOM_DATASOURCE_ERROR_CODES.externalFailure,
  );
  rollbackGate.resolve({ ok: true, value: { revision: 'rolled-local' } });
  await turn();
  assert.equal(state.replays.length, 1);
  replayGate.resolve({
    ok: true,
    revision: 'rebased-3',
    transactions: [
      submission('tx-2', 'rolled-local', 'rebased-2', 'key-2', 'two-rebased'),
      submission('tx-3', 'rebased-2', 'rebased-3', 'key-3', 'three-rebased'),
    ],
  });
  await turn();
  assert.equal(state.requests.length, 2);
  assert.equal(
    state.requests[1].request.patch.dependsOnTransactionId,
    undefined,
  );
  state.requests[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  await turn();
  assert.equal(state.requests.length, 3);
  assert.equal(state.requests[2].request.patch.dependsOnTransactionId, 'tx-2');
  state.requests[2].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-3',
  });

  assert.equal((await first.outcome).status, 'rejected');
  assert.equal((await second.outcome).status, 'acknowledged');
  assert.equal((await third.outcome).status, 'acknowledged');
  assert.equal((await state.coordinator.whenIdle()).status, 'idle');
  assert.deepEqual(
    state.audits
      .filter((event) => event.action === 'rollbackStarted')
      .map((event) => event.transactionId),
    ['tx-3', 'tx-2', 'tx-1'],
  );
});

test('conflict is passed intact to recovery and replay failure preserves descendants', async () => {
  let conflictSeenByRollback;
  let conflictSeenByReplay;
  const state = harness({
    hooks: {
      async rollbackAtomically(request) {
        conflictSeenByRollback = request.failure;
        state.rollbacks.push(request);
        return { ok: true, value: { revision: 'rolled-local' } };
      },
      async replayInIsolation(request) {
        conflictSeenByReplay = request.failure;
        state.replays.push(request);
        return {
          ok: false,
          failedTransactionId: 'tx-2',
          error: error('FIELD_CONFLICT', 'CONFLICT'),
        };
      },
    },
  });
  const first = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'secret-parent'),
  );
  const second = mustEnqueue(
    state.coordinator,
    submission('tx-2', 'local-1', 'local-2', 'key-2', 'secret-child'),
  );
  const conflict = {
    status: 'conflicted',
    sourceRevision: 'remote-current',
    remoteOperations: [
      {
        op: 'updateField',
        occurrenceId: 'root',
        fieldPath: ['name'],
        value: 'remote-secret',
      },
    ],
  };
  await turn();
  state.requests[0].pending.resolve(conflict);

  assert.equal((await first.outcome).status, 'conflicted');
  const descendantOutcome = await second.outcome;
  assert.equal(descendantOutcome.status, 'reloadRequired');
  assert.deepEqual(conflictSeenByRollback, conflict);
  assert.deepEqual(conflictSeenByReplay, conflict);
  assert.equal(state.coordinator.sourceRevision, 'source-0');
  assert.equal(descendantOutcome.recoveryId, 'recovery-1');
  assert.equal(descendantOutcome.retryable, false);
  assert.equal(
    descendantOutcome.bundle.createdAt,
    '2026-07-19T01:02:03.000Z',
  );
  assert.equal(descendantOutcome.bundle.baseRevision, 'rolled-local');
  assert.equal(
    descendantOutcome.bundle.reportedSourceRevision,
    'remote-current',
  );
  assert.deepEqual(
    descendantOutcome.bundle.transactions.map((item) => ({
      transactionId: item.transactionId,
      idempotencyKey: item.patch.idempotencyKey,
    })),
    [{ transactionId: 'tx-2', idempotencyKey: 'key-2' }],
  );
  assert.equal(
    state.coordinator.retryIndeterminate(descendantOutcome.recoveryId).ok,
    false,
  );
  assert.equal(
    state.coordinator.resolveAfterResync({
      recoveryId: descendantOutcome.recoveryId,
      documentId: 'document-a',
      documentGeneration: 99,
      sourceRevision: 'must-not-apply',
    }).ok,
    false,
  );
  assert.equal(state.coordinator.mode, 'reloadRequired');
  assert.equal(JSON.stringify(state.audits).includes('remote-secret'), false);
  assert.equal(
    state.coordinator.resolveAfterResync({
      recoveryId: descendantOutcome.recoveryId,
      documentId: 'document-a',
      documentGeneration: 1,
      sourceRevision: 'source-resynced',
    }).ok,
    true,
  );
  assert.equal(state.coordinator.sourceRevision, 'source-resynced');
  assert.equal(
    state.audits.findLast((event) => event.action === 'resynced')
      .sourceRevision,
    'source-resynced',
  );
});

test('resync resolution fails closed after the active context is invalidated', async () => {
  const state = harness();
  const receipt = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  await turn();
  state.requests[0].pending.reject(new Error('unknown result'));
  const unknown = await receipt.outcome;
  state.setCurrent(false);
  const resolution = state.coordinator.resolveAfterResync({
    recoveryId: unknown.recoveryId,
    documentId: 'document-a',
    documentGeneration: 1,
    sourceRevision: 'must-not-apply',
  });
  assert.equal(resolution.ok, false);
  assert.equal(
    resolution.error.code,
    BOM_DATASOURCE_ERROR_CODES.coordinatorContextMismatch,
  );
  assert.equal(state.coordinator.mode, 'stale');
  assert.equal(state.coordinator.sourceRevision, 'source-0');
});

test('successfully handled conflict adopts its reported source revision', async () => {
  const state = harness();
  const first = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  const conflict = {
    status: 'conflicted',
    sourceRevision: 'remote-current',
    remoteOperations: [{
      op: 'unsetField',
      occurrenceId: 'root',
      fieldPath: ['legacyName'],
    }],
  };
  await turn();
  state.requests[0].pending.resolve(conflict);
  assert.equal((await first.outcome).status, 'conflicted');
  assert.deepEqual(state.rollbacks[0].failure, conflict);
  assert.equal(state.replays.length, 0);
  assert.equal(state.coordinator.sourceRevision, 'remote-current');
  assert.equal(state.coordinator.context.sourceRevision, 'remote-current');

  const second = mustEnqueue(
    state.coordinator,
    submission(
      'tx-2', 'rollback-revision', 'local-2', 'key-2', 'two',
    ),
  );
  await turn();
  assert.equal(
    state.requests[1].request.expectedSourceRevision,
    'remote-current',
  );
  state.requests[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  assert.equal((await second.outcome).status, 'acknowledged');
});

test('transport ambiguity settles all outcomes and explicit retry reuses the same keys', async () => {
  const state = harness();
  const first = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  const second = mustEnqueue(
    state.coordinator,
    submission('tx-2', 'local-1', 'local-2', 'key-2', 'two'),
  );
  await turn();
  const firstAttemptPatch = state.requests[0].request.patch;
  state.requests[0].pending.reject(new Error('connection reset after send'));

  const firstUnknown = await first.outcome;
  const secondUnknown = await second.outcome;
  assert.equal(firstUnknown.status, 'reloadRequired');
  assert.equal(secondUnknown.status, 'reloadRequired');
  assert.equal(firstUnknown.retryable, true);
  assert.equal(firstUnknown.bundle.transactions.length, 2);
  assert.equal(state.rollbacks.length, 0);
  assert.equal(state.replays.length, 0);
  assert.equal((await state.coordinator.whenIdle()).status, 'reloadRequired');

  const retry = state.coordinator.retryIndeterminate(firstUnknown.recoveryId);
  assert.equal(retry.ok, true);
  assert.equal(retry.value.length, 2);
  await turn();
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[1].request.patch, firstAttemptPatch);
  assert.equal(state.requests[1].request.patch.idempotencyKey, 'key-1');
  state.requests[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-1',
  });
  await turn();
  assert.equal(state.requests.length, 3);
  assert.equal(state.requests[2].request.patch.idempotencyKey, 'key-2');
  state.requests[2].pending.resolve({
    status: 'acknowledged', sourceRevision: 'source-2',
  });
  assert.equal((await retry.value[0].outcome).status, 'acknowledged');
  assert.equal((await retry.value[1].outcome).status, 'acknowledged');
  assert.deepEqual(await state.coordinator.whenIdle(), {
    status: 'idle', sourceRevision: 'source-2',
  });
});

test('retry receipts expose reload, rejected, and conflicted terminal outcomes', async () => {
  const state = harness({ idFactory: () => 'fixed-recovery' });
  const initial = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  await turn();
  state.requests[0].pending.reject(new Error('unknown result'));
  const firstUnknown = await initial.outcome;
  assert.equal(firstUnknown.recoveryId, 'fixed-recovery');

  const firstRetry = state.coordinator.retryIndeterminate(
    firstUnknown.recoveryId,
  );
  assert.equal(firstRetry.ok, true);
  await turn();
  state.requests[1].pending.reject(new Error('unknown again'));
  const secondUnknown = await firstRetry.value[0].outcome;
  assert.equal(secondUnknown.status, 'reloadRequired');
  assert.equal(secondUnknown.recoveryId, 'fixed-recovery-2');

  const secondRetry = state.coordinator.retryIndeterminate(
    secondUnknown.recoveryId,
  );
  assert.equal(secondRetry.ok, true);
  await turn();
  state.requests[2].pending.resolve({
    status: 'rejected', error: error('REMOTE_REJECTED'),
  });
  assert.equal((await secondRetry.value[0].outcome).status, 'rejected');

  const conflictedState = harness();
  const conflictedInitial = mustEnqueue(
    conflictedState.coordinator,
    submission('tx-c', 'local-0', 'local-1', 'key-c', 'value'),
  );
  await turn();
  conflictedState.requests[0].pending.reject(new Error('unknown result'));
  const conflictedUnknown = await conflictedInitial.outcome;
  const conflictedRetry = conflictedState.coordinator.retryIndeterminate(
    conflictedUnknown.recoveryId,
  );
  assert.equal(conflictedRetry.ok, true);
  await turn();
  conflictedState.requests[1].pending.resolve({
    status: 'conflicted',
    sourceRevision: 'remote-current',
    remoteOperations: [],
  });
  assert.equal(
    (await conflictedRetry.value[0].outcome).status,
    'conflicted',
  );
});

test('malformed commit responses fail closed without rollback', async (t) => {
  const malformed = [
    { status: 'acknowledged', sourceRevision: '' },
    { status: 'unknown', sourceRevision: 'source-1' },
    {
      status: 'rejected',
      error: { code: 'BAD', category: 'DATA', messageKey: 'bad' },
    },
    {
      status: 'conflicted',
      sourceRevision: 'source-1',
      remoteOperations: [{ op: 'executeAnything', payload: 'secret' }],
    },
  ];
  for (const [index, response] of malformed.entries()) {
    await t.test(`case ${index + 1}`, async () => {
      const state = harness();
      const receipt = mustEnqueue(
        state.coordinator,
        submission('tx-1', 'local-0', 'local-1', `key-${index}`, 'value'),
      );
      await turn();
      state.requests[0].pending.resolve(response);
      const outcome = await receipt.outcome;
      assert.equal(outcome.status, 'reloadRequired');
      assert.equal(outcome.retryable, false);
      assert.equal(
        outcome.error.code,
        BOM_DATASOURCE_ERROR_CODES.protocolViolation,
      );
      assert.equal(state.rollbacks.length, 0);
      assert.equal(state.replays.length, 0);
      assert.equal((await state.coordinator.whenIdle()).status, 'reloadRequired');
    });
  }
});

test('generation replacement, current-context loss, and destroy isolate late responses', async () => {
  const state = harness();
  const staleReceipt = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  const staleIdle = state.coordinator.whenIdle();
  await turn();
  state.setCurrent(false);
  state.requests[0].pending.resolve({
    status: 'rejected', error: error('LATE_REJECTION'),
  });
  assert.deepEqual(await staleReceipt.outcome, {
    status: 'stale', reason: 'contextInvalidated',
  });
  assert.equal((await staleIdle).status, 'stale');
  assert.equal(state.rollbacks.length, 0);

  state.setCurrent(true);
  const nextContext = {
    ...context,
    documentId: 'document-b',
    documentGeneration: 2,
    sourceRevision: 'source-b0',
  };
  assert.equal(state.coordinator.replaceDocument(nextContext).ok, true);
  const reusedAcrossGeneration = state.coordinator.enqueue(
    submission('tx-new', 'local-b0', 'local-b1', 'key-1', 'new', {
      documentId: 'document-b', documentGeneration: 2,
    }),
  );
  assert.equal(reusedAcrossGeneration.ok, false);
  assert.equal(
    reusedAcrossGeneration.error.code,
    BOM_DATASOURCE_ERROR_CODES.idempotencyReused,
  );
  const destroyedReceipt = mustEnqueue(
    state.coordinator,
    submission('tx-2', 'local-b0', 'local-b1', 'key-2', 'two', {
      documentId: 'document-b', documentGeneration: 2,
    }),
  );
  await turn();
  assert.equal(state.requests.length, 2);
  state.coordinator.destroy();
  state.coordinator.destroy();
  assert.deepEqual(await destroyedReceipt.outcome, {
    status: 'aborted', reason: 'destroyed',
  });
  assert.equal((await state.coordinator.whenIdle()).status, 'destroyed');
  state.requests[1].pending.resolve({
    status: 'acknowledged', sourceRevision: 'late-source',
  });
  await turn();
  assert.equal(state.coordinator.sourceRevision, 'source-b0');
  assert.equal(
    state.audits.some(
      (event) => event.transactionId === 'tx-2' &&
        event.action === 'acknowledged',
    ),
    false,
  );
});

test('audit reentrancy cannot dispatch or recover work from a replaced generation', async (t) => {
  const nextContext = {
    ...context,
    documentId: 'document-b',
    documentGeneration: 2,
    sourceRevision: 'source-b0',
  };

  await t.test('dispatchStarted', async () => {
    let switched = false;
    let replacement;
    const state = harness({
      audit(event, coordinator) {
        if (event.action !== 'dispatchStarted' || switched) return;
        switched = true;
        assert.equal(coordinator.replaceDocument(nextContext).ok, true);
        replacement = mustEnqueue(
          coordinator,
          submission('tx-new', 'local-b0', 'local-b1', 'key-new', 'new', {
            documentId: 'document-b', documentGeneration: 2,
          }),
        );
      },
    });
    const stale = mustEnqueue(
      state.coordinator,
      submission('tx-old', 'local-0', 'local-1', 'key-old', 'old'),
    );
    await turn();
    assert.equal((await stale.outcome).status, 'stale');
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].request.patch.transactionId, 'tx-new');
    state.requests[0].pending.resolve({
      status: 'acknowledged', sourceRevision: 'source-b1',
    });
    assert.equal((await replacement.outcome).status, 'acknowledged');
  });

  await t.test('rollbackStarted', async () => {
    let switched = false;
    let replacement;
    const state = harness({
      audit(event, coordinator) {
        if (event.action !== 'rollbackStarted' || switched) return;
        switched = true;
        assert.equal(coordinator.replaceDocument(nextContext).ok, true);
        replacement = mustEnqueue(
          coordinator,
          submission('tx-new', 'local-b0', 'local-b1', 'key-new', 'new', {
            documentId: 'document-b', documentGeneration: 2,
          }),
        );
      },
    });
    const parent = mustEnqueue(
      state.coordinator,
      submission('tx-parent', 'local-0', 'local-1', 'key-parent', 'parent'),
    );
    const child = mustEnqueue(
      state.coordinator,
      submission('tx-child', 'local-1', 'local-2', 'key-child', 'child'),
    );
    await turn();
    state.requests[0].pending.resolve({
      status: 'rejected', error: error('REMOTE_REJECTED'),
    });
    assert.equal((await parent.outcome).status, 'stale');
    assert.equal((await child.outcome).status, 'stale');
    assert.equal(state.rollbacks.length, 0);
    await turn();
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].request.patch.transactionId, 'tx-new');
    state.requests[1].pending.resolve({
      status: 'acknowledged', sourceRevision: 'source-b1',
    });
    assert.equal((await replacement.outcome).status, 'acknowledged');
  });

  await t.test('replayStarted', async () => {
    let switched = false;
    let replacement;
    const state = harness({
      audit(event, coordinator) {
        if (event.action !== 'replayStarted' || switched) return;
        switched = true;
        assert.equal(coordinator.replaceDocument(nextContext).ok, true);
        replacement = mustEnqueue(
          coordinator,
          submission('tx-new', 'local-b0', 'local-b1', 'key-new', 'new', {
            documentId: 'document-b', documentGeneration: 2,
          }),
        );
      },
    });
    const parent = mustEnqueue(
      state.coordinator,
      submission('tx-parent', 'local-0', 'local-1', 'key-parent', 'parent'),
    );
    const child = mustEnqueue(
      state.coordinator,
      submission('tx-child', 'local-1', 'local-2', 'key-child', 'child'),
    );
    await turn();
    state.requests[0].pending.resolve({
      status: 'rejected', error: error('REMOTE_REJECTED'),
    });
    assert.equal((await parent.outcome).status, 'stale');
    assert.equal((await child.outcome).status, 'stale');
    assert.equal(state.rollbacks.length, 1);
    assert.equal(state.replays.length, 0);
    await turn();
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].request.patch.transactionId, 'tx-new');
    state.requests[1].pending.resolve({
      status: 'acknowledged', sourceRevision: 'source-b1',
    });
    assert.equal((await replacement.outcome).status, 'acknowledged');
  });
});

test('host predicate and recovery factories cannot overwrite reentrant queue changes', async (t) => {
  const nextContext = {
    ...context,
    documentId: 'document-b',
    documentGeneration: 2,
    sourceRevision: 'source-b0',
  };

  await t.test('isCurrentDocument replaces after dispatch audit', async () => {
    let checks = 0;
    let replacement;
    const state = harness({
      isCurrentDocument(_activeContext, coordinator) {
        checks += 1;
        if (checks === 3) {
          assert.equal(coordinator.replaceDocument(nextContext).ok, true);
          replacement = mustEnqueue(
            coordinator,
            submission('tx-new', 'local-b0', 'local-b1', 'key-new', 'new', {
              documentId: 'document-b', documentGeneration: 2,
            }),
          );
        }
        return true;
      },
    });
    const stale = mustEnqueue(
      state.coordinator,
      submission('tx-old', 'local-0', 'local-1', 'key-old', 'old'),
    );
    await turn();
    assert.equal((await stale.outcome).status, 'stale');
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].request.patch.transactionId, 'tx-new');
    state.requests[0].pending.resolve({
      status: 'acknowledged', sourceRevision: 'source-b1',
    });
    assert.equal((await replacement.outcome).status, 'acknowledged');
  });

  await t.test('isCurrentDocument replaces while ack is being handled', async () => {
    let checks = 0;
    let replacement;
    const state = harness({
      isCurrentDocument(_activeContext, coordinator) {
        checks += 1;
        if (checks === 4) {
          assert.equal(coordinator.replaceDocument(nextContext).ok, true);
          replacement = mustEnqueue(
            coordinator,
            submission('tx-new', 'local-b0', 'local-b1', 'key-new', 'new', {
              documentId: 'document-b', documentGeneration: 2,
            }),
          );
        }
        return true;
      },
    });
    const stale = mustEnqueue(
      state.coordinator,
      submission('tx-old', 'local-0', 'local-1', 'key-old', 'old'),
    );
    await turn();
    state.requests[0].pending.resolve({
      status: 'acknowledged', sourceRevision: 'old-source-must-not-apply',
    });
    assert.equal((await stale.outcome).status, 'stale');
    await turn();
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].request.patch.transactionId, 'tx-new');
    assert.equal(state.coordinator.sourceRevision, 'source-b0');
    state.requests[1].pending.resolve({
      status: 'acknowledged', sourceRevision: 'source-b1',
    });
    assert.equal((await replacement.outcome).status, 'acknowledged');
  });

  for (const responseKind of ['rejected', 'thrown']) {
    await t.test(`predicate false after ${responseKind} response`, async () => {
      let active = true;
      const state = harness({
        isCurrentDocument() {
          return active;
        },
      });
      const stale = mustEnqueue(
        state.coordinator,
        submission('tx-old', 'local-0', 'local-1', 'key-old', 'old'),
      );
      await turn();
      active = false;
      if (responseKind === 'rejected') {
        state.requests[0].pending.resolve({
          status: 'rejected', error: error('REMOTE_REJECTED'),
        });
      } else {
        state.requests[0].pending.reject(new Error('unknown result'));
      }
      assert.deepEqual(await stale.outcome, {
        status: 'stale', reason: 'contextInvalidated',
      });
      assert.equal(state.rollbacks.length, 0);
      assert.equal(state.coordinator.mode, 'stale');
      assert.equal((await state.coordinator.whenIdle()).status, 'stale');
    });
  }

  await t.test('idFactory appends and all receipts enter one recovery bundle', async () => {
    let appended;
    let injected = false;
    const state = harness({
      idFactory(coordinator) {
        if (!injected) {
          injected = true;
          appended = mustEnqueue(
            coordinator,
            submission('tx-2', 'local-1', 'local-2', 'key-2', 'two'),
          );
        }
        return 'factory-recovery';
      },
    });
    const first = mustEnqueue(
      state.coordinator,
      submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
    );
    await turn();
    state.requests[0].pending.reject(new Error('unknown result'));
    const firstOutcome = await first.outcome;
    const appendedOutcome = await appended.outcome;
    assert.equal(firstOutcome.status, 'reloadRequired');
    assert.equal(appendedOutcome.status, 'reloadRequired');
    assert.deepEqual(
      firstOutcome.bundle.transactions.map((item) => item.transactionId),
      ['tx-1', 'tx-2'],
    );
    assert.equal(state.requests.length, 1);
  });

  await t.test('now replaces context without publishing a mixed bundle', async () => {
    let trigger = false;
    let injected = false;
    let replacement;
    const state = harness({
      now(coordinator) {
        if (trigger && !injected) {
          injected = true;
          assert.equal(coordinator.replaceDocument(nextContext).ok, true);
          replacement = mustEnqueue(
            coordinator,
            submission('tx-new', 'local-b0', 'local-b1', 'key-new', 'new', {
              documentId: 'document-b', documentGeneration: 2,
            }),
          );
        }
        return '2026-07-19T01:02:03.000Z';
      },
    });
    const stale = mustEnqueue(
      state.coordinator,
      submission('tx-old', 'local-0', 'local-1', 'key-old', 'old'),
    );
    await turn();
    trigger = true;
    state.requests[0].pending.reject(new Error('unknown result'));
    assert.equal((await stale.outcome).status, 'stale');
    await turn();
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].request.patch.transactionId, 'tx-new');
    assert.equal(
      state.audits.some(
        (event) => event.action === 'reloadRequired' &&
          event.documentId === 'document-b' &&
          event.transactionId === 'tx-old',
      ),
      false,
    );
    state.requests[1].pending.resolve({
      status: 'acknowledged', sourceRevision: 'source-b1',
    });
    assert.equal((await replacement.outcome).status, 'acknowledged');
  });
});

test('rollback hook failure settles parent and descendants as recovery-required', async () => {
  const state = harness({
    hooks: {
      async rollbackAtomically() {
        throw new Error('host rollback failed');
      },
    },
  });
  const first = mustEnqueue(
    state.coordinator,
    submission('tx-1', 'local-0', 'local-1', 'key-1', 'one'),
  );
  const second = mustEnqueue(
    state.coordinator,
    submission('tx-2', 'local-1', 'local-2', 'key-2', 'two'),
  );
  await turn();
  state.requests[0].pending.resolve({
    status: 'rejected', error: error('PARENT_REJECTED'),
  });
  const [firstOutcome, secondOutcome, idle] = await Promise.all([
    first.outcome,
    second.outcome,
    state.coordinator.whenIdle(),
  ]);
  assert.equal(firstOutcome.status, 'reloadRequired');
  assert.equal(secondOutcome.status, 'reloadRequired');
  assert.equal(idle.status, 'reloadRequired');
  assert.equal(firstOutcome.bundle.transactions.length, 2);
  assert.equal(state.replays.length, 0);
});
