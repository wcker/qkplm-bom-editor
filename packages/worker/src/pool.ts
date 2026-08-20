import type {
  BomFields,
  BomResult,
  BomWorkerCancelTaskMessage,
  BomWorkerCapabilities,
  BomWorkerHandshakeRequest,
  BomWorkerPriority,
  BomWorkerRuntimeMessage,
  BomWorkerTaskAcceptedMessage,
  BomWorkerTaskId,
  BomWorkerTaskMessage,
  BomWorkerTaskType,
} from '@bom-editor/contracts';
import {
  BOM_WORKER_PROTOCOL_VERSION,
  BOM_WORKER_RUNTIME_PROTOCOL,
  type BomWorkerDiagnostic,
  type BomWorkerFactory,
  type BomWorkerFallback,
  type BomWorkerPool,
  type BomWorkerPoolDiagnostics,
  type BomWorkerPoolOptions,
  type BomWorkerTaskAccepted,
  type BomWorkerTaskHandle,
  type BomWorkerCancelReason,
  type BomWorkerTransport,
  workerError,
} from './types.js';

const DEFAULT_POOL_SIZE = 2;
const DEFAULT_MAX_QUEUED = 64;
const DEFAULT_MAX_PER_INSTANCE = 16;
const DEFAULT_MAX_RESTARTS = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_AGING_MS = 250;
const CANCEL_GRACE_MS = 500;

type TaskState = 'queued' | 'running' | 'settled';

interface InternalTask<TFields extends BomFields> {
  readonly taskId: BomWorkerTaskId;
  readonly message: BomWorkerTaskMessage<TFields>;
  readonly mergeKey: string | undefined;
  readonly signal: AbortSignal | undefined;
  readonly onAbort: () => void;
  readonly resolveAccepted: (
    result: BomResult<Readonly<BomWorkerTaskAccepted>>,
  ) => void;
  readonly resolveResult: (result: BomResult<Readonly<import('@bom-editor/contracts').BomWorkerTaskResult<TFields>>>) => void;
  readonly accepted: Promise<BomResult<Readonly<BomWorkerTaskAccepted>>>;
  readonly result: Promise<BomResult<Readonly<import('@bom-editor/contracts').BomWorkerTaskResult<TFields>>>>;
  enqueuedAt: number;
  readonly sequence: number;
  state: TaskState;
  slot: WorkerSlot<TFields> | null;
  fallbackController: AbortController | null;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  cancelGraceHandle: ReturnType<typeof setTimeout> | null;
  cancelReason: BomWorkerCancelReason | null;
  cancellationRequested: boolean;
  acceptedSettled: boolean;
  resultSettled: boolean;
  replayCount: number;
}

interface WorkerSlot<TFields extends BomFields> {
  readonly index: number;
  worker: BomWorkerTransport;
  ready: boolean;
  handshakeRequestId: string;
  busy: InternalTask<TFields> | null;
  restartCount: number;
}

interface InstanceStats {
  readonly instanceId: string;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
}

export function createBomWorkerPool<
  TFields extends BomFields = BomFields,
>(
  options: Readonly<BomWorkerPoolOptions<TFields>> = {},
): BomWorkerPool<TFields> {
  return new WorkerPool(options);
}

class WorkerPool<TFields extends BomFields> implements BomWorkerPool<TFields> {
  readonly #poolSize: number;
  readonly #maxQueuedTasks: number;
  readonly #maxTasksPerInstance: number;
  readonly #maxRestarts: number;
  readonly #defaultTimeoutMs: number;
  readonly #agingIntervalMs: number;
  readonly #engineVersion: string;
  readonly #protocolVersion: string;
  readonly #supportedTaskTypes: readonly BomWorkerTaskType[];
  readonly #fallback: BomWorkerFallback<TFields> | undefined;
  readonly #diagnosticSink:
    | ((diagnostic: Readonly<BomWorkerDiagnostic>) => void)
    | undefined;
  readonly #factory: BomWorkerFactory | undefined;
  readonly #capabilities: Readonly<BomWorkerCapabilities>;
  readonly #tasks = new Map<BomWorkerTaskId, InternalTask<TFields>>();
  readonly #queue: InternalTask<TFields>[] = [];
  readonly #slots: WorkerSlot<TFields>[] = [];
  readonly #stats = new Map<string, InstanceStats>();
  #sequence = 0;
  #taskSequence = 0;
  #destroyed = false;
  #lastInstance: string | null = null;
  #restartCount = 0;
  #cancelledCount = 0;
  #completedCount = 0;
  #failedCount = 0;
  #droppedCount = 0;
  #fallbackRunningCount = 0;

  public constructor(options: Readonly<BomWorkerPoolOptions<TFields>>) {
    this.#poolSize = boundedInteger(options.poolSize, 1, 32, DEFAULT_POOL_SIZE);
    this.#maxQueuedTasks = boundedInteger(
      options.maxQueuedTasks,
      1,
      10_000,
      DEFAULT_MAX_QUEUED,
    );
    this.#maxTasksPerInstance = boundedInteger(
      options.maxTasksPerInstance,
      1,
      1_000,
      DEFAULT_MAX_PER_INSTANCE,
    );
    this.#maxRestarts = boundedInteger(
      options.maxRestarts,
      0,
      32,
      DEFAULT_MAX_RESTARTS,
    );
    this.#defaultTimeoutMs = boundedInteger(
      options.defaultTimeoutMs,
      1,
      86_400_000,
      DEFAULT_TIMEOUT_MS,
    );
    this.#agingIntervalMs = boundedInteger(
      options.agingIntervalMs,
      1,
      60_000,
      DEFAULT_AGING_MS,
    );
    this.#engineVersion = boundedText(options.engineVersion, 'bom-editor');
    this.#protocolVersion = boundedText(
      options.protocolVersion,
      BOM_WORKER_PROTOCOL_VERSION,
    );
    this.#supportedTaskTypes = Object.freeze([
      ...(options.supportedTaskTypes ?? defaultTaskTypes()),
    ]);
    this.#fallback = options.fallback;
    this.#diagnosticSink = options.diagnosticSink;
    this.#factory = resolveFactory(options);
    this.#capabilities = Object.freeze({
      protocolVersion: this.#protocolVersion,
      taskTypes: this.#supportedTaskTypes,
      maxMessageBytes: 16 * 1024 * 1024,
      supportsBinaryTransfer: true,
    });
  }

  public get capabilities(): Readonly<BomWorkerCapabilities> {
    return this.#capabilities;
  }

  public submit(
    input: Readonly<import('./types.js').BomWorkerTaskInput<TFields>>,
  ): BomWorkerTaskHandle<TFields> {
    const taskId = 'worker-task-' + String(++this.#taskSequence);
    let resolveAccepted!: (
      result: BomResult<Readonly<BomWorkerTaskAccepted>>,
    ) => void;
    let resolveResult!: (
      result: BomResult<Readonly<import('@bom-editor/contracts').BomWorkerTaskResult<TFields>>>,
    ) => void;
    const accepted = new Promise<BomResult<Readonly<BomWorkerTaskAccepted>>>(
      (resolve) => {
        resolveAccepted = resolve;
      },
    );
    const result = new Promise<BomResult<Readonly<import('@bom-editor/contracts').BomWorkerTaskResult<TFields>>>>(
      (resolve) => {
        resolveResult = resolve;
      },
    );

    if (this.#destroyed) {
      const error = workerError('BOM_WORKER_DESTROYED', 'WORKER', false);
      resolveAccepted(Object.freeze({ ok: false, error }));
      resolveResult(Object.freeze({ ok: false, error }));
      return Object.freeze({
        taskId,
        accepted,
        result,
        cancel: (): void => {},
      });
    }

    const valid = validateInput(input);
    if (!valid.ok) {
      resolveAccepted(Object.freeze({ ok: false, error: valid.error }));
      resolveResult(Object.freeze({ ok: false, error: valid.error }));
      return Object.freeze({
        taskId,
        accepted,
        result,
        cancel: (): void => {},
      });
    }

    const instanceStats = this.#instanceStats(input.instanceId);
    const mergeCandidates = input.mergeKey === undefined
      ? []
      : [...this.#tasks.values()].filter((candidate) =>
        candidate.message.instanceId === input.instanceId &&
        candidate.mergeKey === input.mergeKey &&
        candidate.state !== 'settled',
      );
    const mergeQueuedCount = mergeCandidates.filter((candidate) => candidate.state === 'queued').length;
    const existingCount = instanceStats.queuedCount + instanceStats.runningCount - mergeCandidates.length;
    if (existingCount >= this.#maxTasksPerInstance) {
      this.#report({ code: 'BOM_WORKER_BACKPRESSURE', instanceId: input.instanceId });
      const error = workerError('BOM_WORKER_BACKPRESSURE', 'WORKER', true, {
        instanceId: input.instanceId,
      });
      resolveAccepted(Object.freeze({ ok: false, error }));
      resolveResult(Object.freeze({ ok: false, error }));
      this.#droppedCount += 1;
      return Object.freeze({
        taskId,
        accepted,
        result,
        cancel: (): void => {},
      });
    }
    if (this.#queue.length - mergeQueuedCount >= this.#maxQueuedTasks) {
      this.#report({ code: 'BOM_WORKER_BACKPRESSURE', instanceId: input.instanceId });
      const error = workerError('BOM_WORKER_QUEUE_FULL', 'WORKER', true);
      resolveAccepted(Object.freeze({ ok: false, error }));
      resolveResult(Object.freeze({ ok: false, error }));
      this.#droppedCount += 1;
      return Object.freeze({
        taskId,
        accepted,
        result,
        cancel: (): void => {},
      });
    }

    const now = monotonicNow();
    const cancellationKey = input.cancellationKey ?? `${input.instanceId}:${taskId}`;
    const message = Object.freeze({
      protocolVersion: this.#protocolVersion,
      type: 'task' as const,
      instanceId: input.instanceId,
      taskId,
      documentId: input.documentId,
      documentGeneration: input.documentGeneration,
      documentRevision: input.documentRevision,
      priority: input.priority ?? 'normal',
      cancellationKey,
      cancellable: true,
      replayable: input.replayable === true,
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      taskType: input.taskType,
      payload: input.payload,
    }) as import('@bom-editor/contracts').BomWorkerTaskMessage<TFields>;

    let task!: InternalTask<TFields>;
    const onAbort = (): void => {
      this.#cancelTask(task, 'caller');
    };
    task = {
      taskId,
      message,
      mergeKey: input.mergeKey,
      signal: input.signal,
      onAbort,
      resolveAccepted,
      resolveResult,
      accepted,
      result,
      enqueuedAt: now,
      sequence: ++this.#sequence,
      state: 'queued',
      slot: null,
      fallbackController: null,
      timeoutHandle: null,
      cancelGraceHandle: null,
      cancelReason: null,
      cancellationRequested: false,
      acceptedSettled: false,
      resultSettled: false,
      replayCount: 0,
    };
    this.#tasks.set(taskId, task);
    input.signal?.addEventListener('abort', onAbort, { once: true });

    if (input.mergeKey !== undefined) {
      for (const candidate of mergeCandidates) {
        this.#cancelTask(candidate, 'superseded');
      }
    }
    this.#queue.push(task);
    instanceStats.queuedCount += 1;
    this.#ensureWorkerSlots();
    this.#schedule();
    return Object.freeze({
      taskId,
      accepted,
      result,
      cancel: (reason: BomWorkerCancelReason = 'caller'): void => {
        this.#cancelTask(task, reason);
      },
    });
  }

  public cancel(taskId: BomWorkerTaskId, reason: BomWorkerCancelReason = 'caller'): boolean {
    const task = this.#tasks.get(taskId);
    if (task === undefined) return false;
    return this.#cancelTask(task, reason);
  }

  public disposeInstance(instanceId: string): void {
    for (const task of [...this.#tasks.values()]) {
      if (task.message.instanceId === instanceId) {
        this.#cancelTask(task, 'instanceDestroyed');
      }
    }
  }

  public getDiagnostics(): Readonly<BomWorkerPoolDiagnostics> {
    const perInstance = [...this.#stats.values()]
      .map((stats) => Object.freeze({ ...stats }))
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
    return Object.freeze({
      destroyed: this.#destroyed,
      workerCount: this.#slots.length,
      readyWorkerCount: this.#slots.filter((slot) => slot.ready).length,
      queuedCount: this.#queue.length,
      runningCount: this.#slots.filter((slot) => slot.busy !== null).length,
      fallbackRunningCount: this.#fallbackRunningCount,
      restartCount: this.#restartCount,
      cancelledCount: this.#cancelledCount,
      completedCount: this.#completedCount,
      failedCount: this.#failedCount,
      droppedCount: this.#droppedCount,
      perInstance: Object.freeze(perInstance),
    });
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const task of [...this.#tasks.values()]) {
      this.#cancelTask(task, 'instanceDestroyed');
    }
    for (const slot of this.#slots) {
      this.#detachSlot(slot);
      try {
        slot.worker.terminate();
      } catch (cause) {
        this.#report({
          code: 'BOM_WORKER_CRASHED',
          slot: slot.index,
          restarted: false,
          cause,
        });
      }
    }
    this.#slots.length = 0;
    this.#queue.length = 0;
  }

  #instanceStats(instanceId: string): InstanceStats {
    const existing = this.#stats.get(instanceId);
    if (existing !== undefined) return existing;
    const created: InstanceStats = {
      instanceId,
      queuedCount: 0,
      runningCount: 0,
      completedCount: 0,
    };
    this.#stats.set(instanceId, created);
    return created;
  }

  #ensureWorkerSlots(): void {
    if (this.#factory === undefined || this.#destroyed) return;
    while (this.#slots.length < this.#poolSize) {
      const index = this.#slots.length;
      let worker: BomWorkerTransport;
      try {
        worker = this.#factory();
      } catch (cause) {
        this.#report({ code: 'BOM_WORKER_UNAVAILABLE', cause });
        break;
      }
      const slot: WorkerSlot<TFields> = {
        index,
        worker,
        ready: false,
        handshakeRequestId: 'worker-handshake-' + String(++this.#sequence),
        busy: null,
        restartCount: 0,
      };
      this.#slots.push(slot);
      this.#bindSlot(slot);
      try {
        worker.postMessage({
          protocolVersion: this.#protocolVersion,
          type: 'handshake',
          requestId: slot.handshakeRequestId,
          engineVersion: this.#engineVersion,
          supportedProtocolVersions: [this.#protocolVersion],
          requiredTaskTypes: this.#supportedTaskTypes,
        } satisfies BomWorkerHandshakeRequest);
      } catch (cause) {
        this.#handleSlotFailure(slot, cause);
      }
    }
  }

  #bindSlot(slot: WorkerSlot<TFields>): void {
    slot.worker.onmessage = (event): void => {
      this.#handleMessage(slot, event.data);
    };
    slot.worker.onerror = (event): void => {
      this.#handleSlotFailure(slot, event);
    };
    if ('onmessageerror' in slot.worker) {
      slot.worker.onmessageerror = (event): void => {
        this.#handleSlotFailure(slot, event);
      };
    }
  }

  #detachSlot(slot: WorkerSlot<TFields>): void {
    slot.worker.onmessage = null;
    slot.worker.onerror = null;
    if ('onmessageerror' in slot.worker) slot.worker.onmessageerror = null;
  }

  #handleMessage(slot: WorkerSlot<TFields>, value: unknown): void {
    if (!isRecord(value) || typeof value['type'] !== 'string') return;
    if (value['type'] === 'handshakeResult') {
      if (value['requestId'] !== slot.handshakeRequestId) return;
      const result = value['result'];
      if (!isRecord(result) || result['ok'] !== true || !isWorkerCapabilities(result['value'])) {
        this.#report({ code: 'BOM_WORKER_PROTOCOL_MISMATCH', cause: value });
        this.#handleSlotFailure(slot, value);
        return;
      }
      if (result['value']['protocolVersion'] !== this.#protocolVersion) {
        this.#report({ code: 'BOM_WORKER_PROTOCOL_MISMATCH', cause: result['value'] });
        this.#handleSlotFailure(slot, result['value']);
        return;
      }
      slot.ready = true;
      this.#schedule();
      return;
    }
    if (!isWorkerRuntimeMessage<TFields>(value)) return;
    const task = slot.busy;
    if (task === null || value['taskId'] !== task.taskId) return;
    if (!sameContext<TFields>(task.message, value)) {
      this.#report({ code: 'BOM_WORKER_STALE_RESULT', taskId: task.taskId });
      this.#finishTask(task, Object.freeze({
        ok: false,
        error: workerError('BOM_WORKER_STALE_RESULT', 'WORKER', true),
      }));
      return;
    }
    switch (value['type']) {
      case 'taskAccepted':
        this.#acceptTask(task, value);
        break;
      case 'taskProgress':
        break;
      case 'taskSucceeded':
        this.#finishTask(task, Object.freeze({ ok: true, value: value.result }));
        break;
      case 'taskFailed':
        this.#finishTask(task, Object.freeze({ ok: false, error: value.error }));
        break;
      case 'taskCancelled':
        {
          const cancellationCode = value.reason === 'timeout'
            ? 'BOM_WORKER_TIMEOUT'
            : 'BOM_WORKER_TASK_CANCELLED';
        this.#finishTask(task, Object.freeze({
          ok: false,
          error: workerError(
            cancellationCode,
            'ABORTED',
            true,
            { reason: value.reason },
          ),
        }));
        }
        break;
      default:
        break;
    }
  }

  #acceptTask(
    task: InternalTask<TFields>,
    message: BomWorkerTaskAcceptedMessage,
  ): void {
    if (task.acceptedSettled) return;
    task.acceptedSettled = true;
    task.resolveAccepted(Object.freeze({
      ok: true,
      value: Object.freeze({
        taskId: message.taskId,
        queuePosition: message.queuePosition ?? 0,
      }),
    }));
  }

  #schedule(): void {
    if (this.#destroyed) return;
    this.#ensureWorkerSlots();
    while (true) {
      const slot = this.#slots.find((candidate) => candidate.ready && candidate.busy === null);
      if (slot !== undefined) {
        const task = this.#takeNextTask();
        if (task === null) break;
        this.#dispatchWorker(slot, task);
        continue;
      }
      if (
        this.#fallback !== undefined &&
        (this.#factory === undefined || this.#slots.length === 0) &&
        this.#fallbackRunningCount < this.#poolSize
      ) {
        const task = this.#takeNextTask();
        if (task === null) break;
        this.#dispatchFallback(task);
        continue;
      }
      break;
    }
    if (
      this.#factory === undefined &&
      this.#fallback === undefined &&
      this.#queue.length > 0
    ) {
      for (const task of [...this.#queue]) {
        this.#finishTask(task, Object.freeze({
          ok: false,
          error: workerError('BOM_WORKER_UNAVAILABLE', 'WORKER', true),
        }));
      }
    }
  }

  #takeNextTask(): InternalTask<TFields> | null {
    if (this.#queue.length === 0) return null;
    const now = monotonicNow();
    let bestIndex = 0;
    for (let index = 1; index < this.#queue.length; index += 1) {
      const candidate = this.#queue[index]!;
      const best = this.#queue[bestIndex]!;
      const candidateScore = taskScore(candidate, now, this.#agingIntervalMs);
      const bestScore = taskScore(best, now, this.#agingIntervalMs);
      if (
        candidateScore > bestScore ||
        (candidateScore === bestScore &&
          this.#lastInstance === best.message.instanceId &&
          this.#lastInstance !== candidate.message.instanceId) ||
        (candidateScore === bestScore &&
          candidate.sequence < best.sequence &&
          this.#lastInstance !== best.message.instanceId)
      ) {
        bestIndex = index;
      }
    }
    const [task] = this.#queue.splice(bestIndex, 1);
    if (task === undefined) return null;
    const stats = this.#instanceStats(task.message.instanceId);
    stats.queuedCount = Math.max(0, stats.queuedCount - 1);
    return task;
  }

  #dispatchWorker(slot: WorkerSlot<TFields>, task: InternalTask<TFields>): void {
    task.state = 'running';
    task.slot = slot;
    slot.busy = task;
    const stats = this.#instanceStats(task.message.instanceId);
    stats.runningCount += 1;
    this.#lastInstance = task.message.instanceId;
    this.#armTimeout(task);
    try {
      slot.worker.postMessage(task.message);
    } catch (cause) {
      this.#handleSlotFailure(slot, cause);
    }
  }

  #dispatchFallback(task: InternalTask<TFields>): void {
    const fallback = this.#fallback;
    if (fallback === undefined) return;
    task.state = 'running';
    task.slot = null;
    task.fallbackController = new AbortController();
    this.#fallbackRunningCount += 1;
    const stats = this.#instanceStats(task.message.instanceId);
    stats.runningCount += 1;
    this.#lastInstance = task.message.instanceId;
    this.#armTimeout(task);
    this.#acceptTask(task, {
      protocolVersion: this.#protocolVersion,
      type: 'taskAccepted',
      instanceId: task.message.instanceId,
      taskId: task.taskId,
      queuePosition: 0,
    });
    const context = Object.freeze({
      signal: task.fallbackController.signal,
      task: task.message,
      reportProgress: (_completed: number, _total: number | undefined, _stage: string): void => {},
    });
    void Promise.resolve(fallback(task.message, context)).then(
      (value) => {
        if (task.state === 'settled') return;
        this.#finishTask(task, Object.freeze({ ok: true, value }));
      },
      (cause: unknown) => {
        if (task.state === 'settled') return;
        this.#report({ code: 'BOM_WORKER_TASK_FAILED', taskId: task.taskId, cause });
        this.#finishTask(task, Object.freeze({
          ok: false,
          error: workerError('BOM_WORKER_TASK_FAILED', 'WORKER', true),
        }));
      },
    );
  }

  #armTimeout(task: InternalTask<TFields>): void {
    const timeout = task.message.timeoutMs ?? this.#defaultTimeoutMs;
    if (!Number.isSafeInteger(timeout) || timeout <= 0) return;
    task.timeoutHandle = setTimeout(() => {
      this.#cancelTask(task, 'timeout');
    }, timeout);
  }

  #cancelTask(task: InternalTask<TFields>, reason: BomWorkerCancelReason): boolean {
    if (task.state === 'settled') return false;
    if (task.state === 'queued') {
      const index = this.#queue.indexOf(task);
      if (index >= 0) this.#queue.splice(index, 1);
      const stats = this.#instanceStats(task.message.instanceId);
      stats.queuedCount = Math.max(0, stats.queuedCount - 1);
      this.#finishTask(task, Object.freeze({
        ok: false,
        error: workerError(
          reason === 'timeout' ? 'BOM_WORKER_TIMEOUT' : 'BOM_WORKER_TASK_CANCELLED',
          'ABORTED',
          true,
          { reason },
        ),
      }));
      return true;
    }
    if (task.cancellationRequested) return true;
    task.cancellationRequested = true;
    task.cancelReason = reason;
    if (task.fallbackController !== null) {
      task.fallbackController.abort(reason);
    }
    if (task.slot !== null) {
      const message: BomWorkerCancelTaskMessage = {
        protocolVersion: this.#protocolVersion,
        type: 'cancelTask',
        instanceId: task.message.instanceId,
        taskId: task.taskId,
        cancellationKey: task.message.cancellationKey,
        reason,
      };
      try {
        task.slot.worker.postMessage(message);
      } catch (cause) {
        this.#handleSlotFailure(task.slot, cause);
      }
    }
    task.cancelGraceHandle = setTimeout(() => {
      if (task.state !== 'running') return;
      const slot = task.slot;
      if (slot !== null) {
        this.#handleSlotFailure(slot, new Error('BOM_WORKER_CANCEL_TIMEOUT'));
      } else {
        this.#finishTask(task, Object.freeze({
          ok: false,
          error: workerError(
            reason === 'timeout' ? 'BOM_WORKER_TIMEOUT' : 'BOM_WORKER_TASK_CANCELLED',
            'ABORTED',
            true,
            { reason },
          ),
        }));
      }
    }, CANCEL_GRACE_MS);
    return true;
  }

  #finishTask(
    task: InternalTask<TFields>,
    result: BomResult<Readonly<import('@bom-editor/contracts').BomWorkerTaskResult<TFields>>>,
  ): void {
    if (task.state === 'settled') return;
    const wasRunning = task.state === 'running';
    task.state = 'settled';
    if (task.timeoutHandle !== null) clearTimeout(task.timeoutHandle);
    if (task.cancelGraceHandle !== null) clearTimeout(task.cancelGraceHandle);
    task.signal?.removeEventListener('abort', task.onAbort);
    if (task.slot !== null && task.slot.busy === task) {
      task.slot.busy = null;
    }
    if (task.fallbackController !== null) {
      this.#fallbackRunningCount = Math.max(0, this.#fallbackRunningCount - 1);
    }
    const stats = this.#instanceStats(task.message.instanceId);
    if (wasRunning) {
      stats.runningCount = Math.max(0, stats.runningCount - 1);
    }
    if (result.ok) {
      this.#completedCount += 1;
      stats.completedCount += 1;
    } else if (task.cancellationRequested || result.error.category === 'ABORTED') {
      this.#cancelledCount += 1;
    } else {
      this.#failedCount += 1;
    }
    if (!task.acceptedSettled) {
      task.acceptedSettled = true;
      task.resolveAccepted(Object.freeze({ ok: false, error: result.ok ? workerError('BOM_WORKER_ACCEPTANCE_MISSING', 'WORKER', true) : result.error }));
    }
    if (!task.resultSettled) {
      task.resultSettled = true;
      task.resolveResult(result);
    }
    this.#tasks.delete(task.taskId);
    this.#schedule();
  }

  #handleSlotFailure(slot: WorkerSlot<TFields>, cause: unknown): void {
    if (this.#destroyed) return;
    const task = slot.busy;
    slot.busy = null;
    slot.ready = false;
    const shouldRestart = slot.restartCount < this.#maxRestarts;
    this.#report({
      code: 'BOM_WORKER_CRASHED',
      slot: slot.index,
      ...(task === null ? {} : { taskId: task.taskId }),
      restarted: shouldRestart,
      cause,
    });
    this.#detachSlot(slot);
    try {
      slot.worker.terminate();
    } catch {
      // The transport is already unusable.
    }
    if (task !== null && task.state !== 'settled') {
      if (
        task.message.replayable &&
        !task.cancellationRequested &&
        task.replayCount < this.#maxRestarts
      ) {
        if (task.timeoutHandle !== null) {
          clearTimeout(task.timeoutHandle);
          task.timeoutHandle = null;
        }
        if (task.cancelGraceHandle !== null) {
          clearTimeout(task.cancelGraceHandle);
          task.cancelGraceHandle = null;
        }
        task.replayCount += 1;
        task.state = 'queued';
        task.slot = null;
        task.enqueuedAt = monotonicNow();
        this.#queue.push(task);
        this.#instanceStats(task.message.instanceId).runningCount = Math.max(
          0,
          this.#instanceStats(task.message.instanceId).runningCount - 1,
        );
      } else {
        this.#finishTask(task, Object.freeze({
          ok: false,
          error: workerError('BOM_WORKER_CRASHED', 'WORKER', true),
        }));
      }
    }
    const slotIndex = this.#slots.indexOf(slot);
    if (slotIndex >= 0) this.#slots.splice(slotIndex, 1);
    if (shouldRestart) {
      this.#restartCount += 1;
      this.#ensureWorkerSlots();
    }
    this.#schedule();
  }

  #report(diagnostic: BomWorkerDiagnostic): void {
    try {
      this.#diagnosticSink?.(Object.freeze(diagnostic));
    } catch {
      // Diagnostics are observational and never affect task scheduling.
    }
  }
}

function resolveFactory<TFields extends BomFields>(
  options: Readonly<BomWorkerPoolOptions<TFields>>,
): BomWorkerFactory | undefined {
  if (options.workerFactory !== undefined) return options.workerFactory;
  if (options.workerUrl === undefined) return undefined;
  const candidate = (globalThis as unknown as { readonly Worker?: unknown }).Worker;
  if (typeof candidate !== 'function') return undefined;
  return (): BomWorkerTransport => {
    const WorkerConstructor = candidate as new (
      scriptURL: string | URL,
      options?: WorkerOptions,
    ) => BomWorkerTransport;
    return new WorkerConstructor(options.workerUrl!, {
      type: 'module',
      ...(options.workerOptions ?? {}),
    });
  };
}

function validateInput<TFields extends BomFields>(
  input: Readonly<import('./types.js').BomWorkerTaskInput<TFields>>,
): BomResult<void> {
  if (
    input === null ||
    typeof input !== 'object' ||
    !nonEmptyText(input.instanceId, 256) ||
    !nonEmptyText(input.documentId, 512) ||
    !nonEmptyText(input.documentRevision, 512) ||
    !Number.isSafeInteger(input.documentGeneration) ||
    input.documentGeneration < 0 ||
    !isTaskType(input.taskType) ||
    (input.priority !== undefined && !isPriority(input.priority)) ||
    (input.timeoutMs !== undefined &&
      (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0))
  ) {
    return Object.freeze({
      ok: false,
      error: workerError('BOM_WORKER_TASK_INVALID', 'CONFIG', false),
    });
  }
  return Object.freeze({ ok: true, value: undefined });
}

function taskScore<TFields extends BomFields>(
  task: InternalTask<TFields>,
  now: number,
  agingIntervalMs: number,
): number {
  const priority = taskPriority(task.message.priority);
  const age = Math.floor(Math.max(0, now - task.enqueuedAt) / agingIntervalMs);
  return priority * 1_000_000 + age;
}

function taskPriority(priority: BomWorkerPriority): number {
  return priority === 'high' ? 2 : priority === 'normal' ? 1 : 0;
}

function boundedInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return value !== undefined && Number.isSafeInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function boundedText(value: string | undefined, fallback: string): string {
  return value !== undefined && value.length > 0 && value.length <= 128
    ? value
    : fallback;
}

function nonEmptyText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function defaultTaskTypes(): readonly BomWorkerTaskType[] {
  return Object.freeze([
    'buildSearchIndex',
    'search',
    'validate',
    'diff',
    'calculate',
    'parseImport',
  ]);
}

function isPriority(value: unknown): value is BomWorkerPriority {
  return value === 'high' || value === 'normal' || value === 'low';
}

function isTaskType(value: unknown): value is BomWorkerTaskType {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWorkerRuntimeMessage<TFields extends BomFields>(
  value: unknown,
): value is BomWorkerRuntimeMessage<TFields> {
  return isRecord(value) &&
    typeof value['protocolVersion'] === 'string' &&
    typeof value['type'] === 'string' &&
    (value['type'] === 'taskAccepted' ||
      value['type'] === 'taskProgress' ||
      value['type'] === 'taskSucceeded' ||
      value['type'] === 'taskFailed' ||
      value['type'] === 'taskCancelled');
}

function isWorkerCapabilities(value: unknown): value is BomWorkerCapabilities {
  return isRecord(value) &&
    typeof value['protocolVersion'] === 'string' &&
    Array.isArray(value['taskTypes']) &&
    typeof value['maxMessageBytes'] === 'number' &&
    typeof value['supportsBinaryTransfer'] === 'boolean';
}

function sameContext<TFields extends BomFields>(
  task: Readonly<BomWorkerTaskMessage<TFields>>,
  message: Readonly<BomWorkerRuntimeMessage<TFields>>,
): boolean {
  if (!('instanceId' in message) || !('taskId' in message)) return false;
  if (message.instanceId !== task.instanceId || message.taskId !== task.taskId) {
    return false;
  }
  // Acceptance acknowledgements intentionally carry only routing context. The
  // document snapshot context is required on progress and terminal messages,
  // where accepting a stale result could corrupt the caller's state.
  if (message.type === 'taskAccepted') return true;
  if (!('documentId' in message)) return false;
  return message.documentId === task.documentId &&
    message.documentGeneration === task.documentGeneration &&
    message.documentRevision === task.documentRevision;
}
