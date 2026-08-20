import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOM_WORKER_PROTOCOL_VERSION,
  attachBomWorkerRuntime,
  createBomWorkerPool,
} from '../dist/index.js';

function task(instanceId, value, overrides = {}) {
  return {
    instanceId,
    documentId: 'doc-1',
    documentGeneration: 0,
    documentRevision: 'rev-1',
    taskType: 'plugin:test',
    payload: value,
    priority: 'normal',
    replayable: true,
    ...overrides,
  };
}

class FakeWorker {
  onmessage = null;
  onerror = null;
  onmessageerror = null;
  terminated = false;
  running = new Map();
  calls = [];
  failNext = false;

  postMessage(message) {
    if (this.terminated) throw new Error('terminated');
    this.calls.push(message);
    if (message.type === 'handshake') {
      queueMicrotask(() => this.onmessage?.({
        data: {
          protocolVersion: BOM_WORKER_PROTOCOL_VERSION,
          type: 'handshakeResult',
          requestId: message.requestId,
          result: {
            ok: true,
            value: {
              protocolVersion: BOM_WORKER_PROTOCOL_VERSION,
              taskTypes: ['plugin:test'],
              maxMessageBytes: 1024 * 1024,
              supportsBinaryTransfer: true,
            },
          },
        },
      }));
      return;
    }
    if (message.type === 'cancelTask') {
      queueMicrotask(() => this.onmessage?.({
        data: {
          protocolVersion: BOM_WORKER_PROTOCOL_VERSION,
          type: 'taskCancelled',
          instanceId: message.instanceId,
          taskId: message.taskId,
          documentId: 'doc-1',
          documentGeneration: 0,
          documentRevision: 'rev-1',
          reason: message.reason,
        },
      }));
      return;
    }
    if (message.type !== 'task') return;
    this.running.set(message.taskId, message);
    queueMicrotask(() => this.onmessage?.({
      data: {
        protocolVersion: BOM_WORKER_PROTOCOL_VERSION,
        type: 'taskAccepted',
        instanceId: message.instanceId,
        taskId: message.taskId,
        queuePosition: 0,
      },
    }));
    if (this.failNext) {
      this.failNext = false;
      queueMicrotask(() => this.onerror?.({
        error: new Error('worker failed'),
        message: 'worker failed',
      }));
      return;
    }
    const delay = message.payload === 'slow' ? 25 : 0;
    setTimeout(() => {
      if (!this.running.has(message.taskId)) return;
      this.running.delete(message.taskId);
      this.onmessage?.({
        data: {
          protocolVersion: BOM_WORKER_PROTOCOL_VERSION,
          type: 'taskSucceeded',
          instanceId: message.instanceId,
          taskId: message.taskId,
          documentId: message.documentId,
          documentGeneration: message.documentGeneration,
          documentRevision: message.documentRevision,
          result: { taskType: message.taskType, value: message.payload },
        },
      });
    }, delay);
  }

  terminate() {
    this.terminated = true;
    this.running.clear();
  }
}

test('shared pool handshakes, preserves task context, and reports completion', async () => {
  const workers = [];
  const pool = createBomWorkerPool({
    poolSize: 1,
    supportedTaskTypes: ['plugin:test'],
    workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  const handle = pool.submit(task('one', 'value'));
  assert.deepEqual(await handle.accepted, {
    ok: true,
    value: { taskId: handle.taskId, queuePosition: 0 },
  });
  assert.deepEqual(await handle.result, {
    ok: true,
    value: { taskType: 'plugin:test', value: 'value' },
  });
  assert.equal(workers.length, 1);
  assert.equal(pool.getDiagnostics().completedCount, 1);
  pool.destroy();
});

test('queue backpressure and merge keys fail closed without running a partial task', async () => {
  const pool = createBomWorkerPool({
    poolSize: 1,
    maxQueuedTasks: 1,
    supportedTaskTypes: ['plugin:test'],
    workerFactory: () => new FakeWorker(),
  });
  const first = pool.submit(task('one', 'slow'));
  await first.accepted;
  const second = pool.submit(task('one', 'new', { mergeKey: 'search' }));
  const third = pool.submit(task('one', 'overflow'));
  const merged = pool.submit(task('one', 'latest', { mergeKey: 'search' }));
  assert.equal((await third.result).ok, false);
  assert.equal((await second.result).ok, false);
  assert.equal((await first.result).ok, true);
  assert.deepEqual((await merged.result).value, {
    taskType: 'plugin:test',
    value: 'latest',
  });
  pool.destroy();
});

test('cancellation and timeout return aborted results and release the queue', async () => {
  const pool = createBomWorkerPool({
    poolSize: 1,
    supportedTaskTypes: ['plugin:test'],
    workerFactory: () => new FakeWorker(),
  });
  const cancelled = pool.submit(task('one', 'slow'));
  cancelled.cancel();
  const cancelledResult = await cancelled.result;
  assert.equal(cancelledResult.ok, false);
  if (!cancelledResult.ok) assert.equal(cancelledResult.error.category, 'ABORTED');
  const timed = pool.submit(task('one', 'slow', { timeoutMs: 1 }));
  const timedResult = await timed.result;
  assert.equal(timedResult.ok, false);
  if (!timedResult.ok) assert.equal(timedResult.error.code, 'BOM_WORKER_TIMEOUT');
  pool.destroy();
});

test('replayable task is requeued after a Worker crash', async () => {
  const workers = [];
  const pool = createBomWorkerPool({
    poolSize: 1,
    maxRestarts: 1,
    supportedTaskTypes: ['plugin:test'],
    workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      if (workers.length === 1) worker.failNext = true;
      return worker;
    },
  });
  const result = await pool.submit(task('one', 'replay')).result;
  assert.deepEqual(result, {
    ok: true,
    value: { taskType: 'plugin:test', value: 'replay' },
  });
  assert.equal(workers.length, 2);
  assert.equal(pool.getDiagnostics().restartCount, 1);
  pool.destroy();
});

test('main-thread fallback is cancellable and does not require Worker globals', async () => {
  const pool = createBomWorkerPool({
    poolSize: 1,
    supportedTaskTypes: ['plugin:test'],
    fallback: async (input, context) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (context.signal.aborted) throw new Error('aborted');
      return { taskType: input.taskType, value: input.payload };
    },
  });
  const result = await pool.submit(task('one', 'fallback')).result;
  assert.deepEqual(result, {
    ok: true,
    value: { taskType: 'plugin:test', value: 'fallback' },
  });
  pool.destroy();
});

test('Worker runtime negotiates protocol, cancels tasks, and calls registered handlers', async () => {
  const messages = [];
  const scope = {
    onmessage: null,
    postMessage(message) {
      messages.push(message);
    },
  };
  const controller = attachBomWorkerRuntime(scope, {
    supportedTaskTypes: ['plugin:test'],
    handlers: {
      'plugin:test': (payload) => ({ taskType: 'plugin:test', value: payload }),
    },
  });
  scope.onmessage({ data: {
    protocolVersion: BOM_WORKER_PROTOCOL_VERSION,
    type: 'handshake',
    requestId: 'h1',
    engineVersion: 'test',
    supportedProtocolVersions: [BOM_WORKER_PROTOCOL_VERSION],
    requiredTaskTypes: ['plugin:test'],
  }});
  assert.equal(messages.at(-1).type, 'handshakeResult');
  scope.onmessage({ data: {
    ...task('one', 'runtime'),
    protocolVersion: BOM_WORKER_PROTOCOL_VERSION,
    type: 'task',
    taskId: 't1',
    cancellationKey: 'one:t1',
    cancellable: true,
    replayable: false,
  }});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(messages.some((message) => message.type === 'taskSucceeded'), true);
  controller.dispose();
});
