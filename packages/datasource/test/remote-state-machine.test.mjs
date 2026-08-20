import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOM_DATASOURCE_ERROR_CODES,
  createBomRemoteCommitCoordinator,
} from '../dist/index.js';

const BASE_CONTEXT = Object.freeze({
  protocolVersion: '1.0.0',
  documentId: 'state-machine-document',
  documentGeneration: 1,
  schemaVersion: '1.0.0',
  positionKeyCodecVersion: 'lexicographic-ascii-v1',
  sourceRevision: 'source-0',
});

const SEED_MATRIX = Object.freeze(Array.from({ length: 30 }, (_, index) =>
  (0x9e3779b9 + Math.imul(index + 1, 0x6d2b79f5)) >>> 0));
const SEEDS = process.env.BOM_STATE_SEED === undefined
  ? SEED_MATRIX
  : Object.freeze([Number(process.env.BOM_STATE_SEED)]);

test('remote coordinator deterministic state machine preserves F2 invariants', async () => {
  for (const seed of SEEDS) {
    process.stdout.write(`[remote-state-machine] seed=${seedHex(seed)} scenario=${seed % 6}\n`);
    await runSeed(seed);
  }
});

async function runSeed(seed) {
  const scenario = seed % 6;
  switch (scenario) {
    case 0:
      await runAcknowledgementScenario(seed);
      break;
    case 1:
      await runCancellationScenario(seed);
      break;
    case 2:
      await runRejectedReplayScenario(seed);
      break;
    case 3:
      await runIndeterminateRetryScenario(seed);
      break;
    case 4:
      await runConflictResyncScenario(seed);
      break;
    default:
      await runReplacementDestroyScenario(seed);
      break;
  }
}

async function runAcknowledgementScenario(seed) {
  const state = createHarness(seed);
  const count = 2 + (seed % 3);
  const receipts = enqueueChain(state, count, BASE_CONTEXT);

  for (let index = 0; index < count; index += 1) {
    await turn();
    assertSingleFlight(state, `ack seed=${seedHex(seed)} index=${index}`);
    respond(state, state.requests[index], {
      status: 'acknowledged',
      sourceRevision: `source-${index + 1}`,
    });
  }

  const outcomes = await Promise.all(receipts.map((receipt) => receipt.outcome));
  assert.ok(outcomes.every((outcome) => outcome.status === 'acknowledged'));
  assert.equal((await state.coordinator.whenIdle()).status, 'idle');
  assertInvariants(state, `ack seed=${seedHex(seed)}`);
}

async function runCancellationScenario(seed) {
  const state = createHarness(seed);
  const receipts = enqueueChain(state, 3, BASE_CONTEXT);
  const tail = receipts.at(-1);
  const cancelled = await state.coordinator.cancelPending(
    tail.submission.commit.transactionId,
  );
  assert.equal(cancelled.ok, true, `cancel seed=${seedHex(seed)}`);
  assert.equal(cancelled.value.cancelled, true);
  assert.equal((await tail.outcome).status, 'cancelled');

  for (let index = 0; index < 2; index += 1) {
    await turn();
    assertSingleFlight(state, `cancel seed=${seedHex(seed)} index=${index}`);
    respond(state, state.requests[index], {
      status: 'acknowledged',
      sourceRevision: `source-${index + 1}`,
    });
  }

  const outcomes = await Promise.all(receipts.slice(0, 2).map((receipt) => receipt.outcome));
  assert.ok(outcomes.every((outcome) => outcome.status === 'acknowledged'));
  assert.equal((await state.coordinator.whenIdle()).status, 'idle');
  assertInvariants(state, `cancel seed=${seedHex(seed)}`);
}

async function runRejectedReplayScenario(seed) {
  const state = createHarness(seed, { replay: 'success' });
  const receipts = enqueueChain(state, 3, BASE_CONTEXT);
  await turn();
  assertSingleFlight(state, `reject seed=${seedHex(seed)}`);
  respond(state, state.requests[0], {
    status: 'rejected',
    error: error('REMOTE_REJECTED'),
  });

  const parent = await receipts[0].outcome;
  assert.equal(parent.status, 'rejected');
  await waitFor(() => state.requests.length >= 2, state);
  for (let index = 1; index <= receipts.length - 1; index += 1) {
    await waitFor(() => state.requests.length > index, state);
    assertSingleFlight(state, `replay seed=${seedHex(seed)} index=${index}`);
    respond(state, state.requests[index], {
      status: 'acknowledged',
      sourceRevision: `replay-source-${index}`,
    });
  }

  const descendants = await Promise.all(receipts.slice(1).map((receipt) => receipt.outcome));
  assert.ok(descendants.every((outcome) => outcome.status === 'acknowledged'));
  assert.equal((await state.coordinator.whenIdle()).status, 'idle');
  assertInvariants(state, `replay seed=${seedHex(seed)}`);
}

async function runIndeterminateRetryScenario(seed) {
  const state = createHarness(seed);
  const initial = enqueueChain(state, 2, BASE_CONTEXT);
  await turn();
  respond(state, state.requests[0], undefined, new Error('connection reset'));

  const initialOutcomes = await Promise.all(initial.map((receipt) => receipt.outcome));
  assert.ok(initialOutcomes.every((outcome) => outcome.status === 'reloadRequired'));
  const recoveryId = initialOutcomes[0].recoveryId;
  const retry = state.coordinator.retryIndeterminate(recoveryId);
  assert.equal(retry.ok, true, `retry seed=${seedHex(seed)}`);

  for (let index = 1; index <= retry.value.length; index += 1) {
    await waitFor(() => state.requests.length > index, state);
    assertSingleFlight(state, `retry seed=${seedHex(seed)} index=${index}`);
    respond(state, state.requests[index], {
      status: 'acknowledged',
      sourceRevision: `retry-source-${index}`,
    });
  }

  const retried = await Promise.all(retry.value.map((receipt) => receipt.outcome));
  assert.ok(retried.every((outcome) => outcome.status === 'acknowledged'));
  assert.equal((await state.coordinator.whenIdle()).status, 'idle');
  assertInvariants(state, `retry seed=${seedHex(seed)}`);
}

async function runConflictResyncScenario(seed) {
  const state = createHarness(seed, { replay: 'failure' });
  const receipts = enqueueChain(state, 2, BASE_CONTEXT);
  await turn();
  respond(state, state.requests[0], {
    status: 'conflicted',
    sourceRevision: 'remote-source',
    remoteOperations: [],
  });

  assert.equal((await receipts[0].outcome).status, 'conflicted');
  const descendant = await receipts[1].outcome;
  assert.equal(descendant.status, 'reloadRequired');
  assert.equal(state.coordinator.mode, 'reloadRequired');
  const resolved = state.coordinator.resolveAfterResync({
    recoveryId: descendant.recoveryId,
    documentId: BASE_CONTEXT.documentId,
    documentGeneration: BASE_CONTEXT.documentGeneration,
    sourceRevision: 'resynced-source',
  });
  assert.equal(resolved.ok, true, `resync seed=${seedHex(seed)}`);
  assert.equal(state.coordinator.sourceRevision, 'resynced-source');
  assert.equal((await state.coordinator.whenIdle()).status, 'idle');
  assertInvariants(state, `resync seed=${seedHex(seed)}`);
}

async function runReplacementDestroyScenario(seed) {
  const state = createHarness(seed);
  const receipts = enqueueChain(state, 2, BASE_CONTEXT);
  await turn();
  const nextContext = Object.freeze({
    ...BASE_CONTEXT,
    documentId: `replacement-${seedHex(seed)}`,
    documentGeneration: 2,
    sourceRevision: 'replacement-source-0',
  });
  assert.equal(state.coordinator.replaceDocument(nextContext).ok, true);
  respond(state, state.requests[0], {
    status: 'acknowledged',
    sourceRevision: 'late-source-must-not-apply',
  });
  assert.ok((await receipts[0].outcome).status === 'stale');
  assert.ok((await receipts[1].outcome).status === 'stale');

  const replacement = mustEnqueue(
    state,
    submission('replacement-tx', 'local-0', 'local-1', 'replacement-key', 'replacement', nextContext),
  );
  await turn();
  respond(state, state.requests.at(-1), {
    status: 'acknowledged',
    sourceRevision: 'replacement-source-1',
  });
  assert.equal((await replacement.outcome).status, 'acknowledged');
  state.coordinator.destroy();
  assert.equal(state.coordinator.mode, 'destroyed');
  const afterDestroy = state.coordinator.enqueue(
    submission('after-destroy', 'local-1', 'local-2', 'after-destroy-key', 'ignored', nextContext),
  );
  assert.equal(afterDestroy.ok, false);
  assert.equal(afterDestroy.error.code, BOM_DATASOURCE_ERROR_CODES.destroyed);
  assertInvariants(state, `replacement seed=${seedHex(seed)}`);
}

function createHarness(seed, options = {}) {
  const requests = [];
  const audits = [];
  const rollbacks = [];
  const replays = [];
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
    },
    async loadDocument() {
      throw new Error('not used');
    },
    commit(request) {
      const pending = deferred();
      requests.push({ request, pending, settled: false });
      return pending.promise;
    },
  };
  const hooks = {
    async rollbackAtomically(request) {
      rollbacks.push(request);
      return { ok: true, value: { revision: `rollback-${seedHex(seed)}` } };
    },
    async replayInIsolation(request) {
      replays.push(request);
      if (options.replay !== 'success') {
        return {
          ok: false,
          failedTransactionId: request.descendants[0]?.commit.transactionId ??
            request.failedTransaction.commit.transactionId,
          error: error('REPLAY_FAILED', 'CONFLICT'),
        };
      }
      let previousRevision = request.baseRevision;
      const transactions = request.descendants.map((descendant, index) => {
        const revision = `rebased-${seedHex(seed)}-${index}`;
        const replayed = submission(
          descendant.commit.transactionId,
          previousRevision,
          revision,
          descendant.commit.patch.idempotencyKey,
          `replayed-${index}`,
        );
        previousRevision = revision;
        return replayed;
      });
      return { ok: true, revision: previousRevision, transactions };
    },
  };
  const created = createBomRemoteCommitCoordinator({
    dataSource,
    context: BASE_CONTEXT,
    hooks,
    audit(event) {
      audits.push(event);
    },
    now: () => '2026-08-05T00:00:00.000Z',
    idFactory: () => `recovery-${++recoverySequence}`,
  });
  assert.equal(created.ok, true);
  coordinator = created.value;
  return { coordinator, requests, audits, rollbacks, replays };
}

function enqueueChain(state, count, context) {
  const receipts = [];
  for (let index = 0; index < count; index += 1) {
    receipts.push(mustEnqueue(state, submission(
      `tx-${index + 1}`,
      `local-${index}`,
      `local-${index + 1}`,
      `key-${index + 1}`,
      `value-${index + 1}`,
      context,
    )));
  }
  return receipts;
}

function mustEnqueue(state, value) {
  const result = state.coordinator.enqueue(value);
  assert.equal(result.ok, true, result.ok ? undefined : result.error.code);
  return result.value;
}

function respond(state, record, value, rejection) {
  assert.ok(record, 'state machine response has no request');
  assert.equal(record.settled, false, 'state machine responded twice');
  record.settled = true;
  if (rejection !== undefined) {
    record.pending.reject(rejection);
  } else {
    record.pending.resolve(value);
  }
}

function assertSingleFlight(state, label) {
  const active = state.requests.filter((request) => !request.settled);
  assert.ok(active.length <= 1, `${label}: more than one commit in flight`);
}

function assertInvariants(state, label) {
  const sequences = state.audits.map((event) => event.sequence);
  assert.deepEqual(sequences, sequences.map((_, index) => index + 1), `${label}: audit sequence gap`);
  assert.equal(JSON.stringify(state.audits).includes('value-'), false, `${label}: raw value leaked into audit`);
  for (const request of state.requests) {
    const dependency = request.request.patch.dependsOnTransactionId;
    if (dependency !== undefined) {
      assert.notEqual(dependency, request.request.patch.transactionId, `${label}: self dependency`);
    }
  }
  assert.ok(
    [
      'active',
      'recovering',
      'reloadRequired',
      'stale',
      'destroyed',
    ].includes(state.coordinator.mode),
    `${label}: unknown coordinator mode`,
  );
  assert.equal(state.rollbacks.some((request) => request.descendants.length < 0), false);
  assert.equal(state.replays.some((request) => request.descendants.length < 0), false);
}

function submission(transactionId, previousRevision, revision, idempotencyKey, value, context = BASE_CONTEXT) {
  const patch = {
    protocolVersion: context.protocolVersion,
    documentId: context.documentId,
    baseRevision: previousRevision,
    transactionId,
    origin: 'test:state-machine',
    timestamp: '2026-08-05T00:00:00.000Z',
    idempotencyKey,
    operations: [{
      op: 'updateField',
      occurrenceId: 'root',
      fieldPath: ['name'],
      value,
    }],
  };
  return {
    documentId: context.documentId,
    documentGeneration: context.documentGeneration,
    commit: {
      transactionId,
      previousRevision,
      revision,
      patch,
      inversePatch: (() => {
        const { idempotencyKey: _ignored, ...inverseBase } = patch;
        return {
        ...inverseBase,
        baseRevision: revision,
        transactionId: `${transactionId}:inverse`,
        origin: 'inverse:test:state-machine',
        operations: [{
          op: 'updateField',
          occurrenceId: 'root',
          fieldPath: ['name'],
          value: `before-${value}`,
        }],
        };
      })(),
      warnings: [],
    },
    commands: [{
      type: 'setField',
      occurrenceId: 'root',
      fieldPath: ['name'],
      value,
    }],
  };
}

function error(code, category = 'VALIDATION') {
  return Object.freeze({
    code,
    category,
    messageKey: `test.${code.toLowerCase()}`,
    recoverable: true,
  });
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

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, state) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.equal(
    predicate(),
    true,
    `state machine did not reach the expected phase requests=${state?.requests.length ?? 'n/a'} mode=${state?.coordinator.mode ?? 'n/a'} replays=${state?.replays.length ?? 'n/a'} audits=${JSON.stringify(state?.audits?.slice(-4) ?? [])}`,
  );
}

function seedHex(seed) {
  return `0x${(seed >>> 0).toString(16).padStart(8, '0')}`;
}
