import type {
  BomError,
  BomFields,
  BomResult,
  BomWorkerCancelTaskMessage,
  BomWorkerHandshakeRequest,
  BomWorkerRuntimeMessage,
  BomWorkerTaskMessage,
  BomWorkerTaskResult,
  BomWorkerTaskType,
} from '@bom-editor/contracts';
import {
  BOM_WORKER_PROTOCOL_VERSION,
  type BomWorkerRuntimeController,
  type BomWorkerRuntimeOptions,
  type BomWorkerRuntimeScope,
  type BomWorkerRuntimeTaskContext,
} from './types.js';
import { workerError } from './types.js';

interface RunningTask<TFields extends BomFields> {
  readonly task: BomWorkerTaskMessage<TFields>;
  readonly controller: AbortController;
  readonly onAbort: () => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  lastProgress: number;
  cancelReason: 'caller' | 'timeout' | 'superseded' | 'instanceDestroyed' | null;
}

export function attachBomWorkerRuntime<
  TFields extends BomFields = BomFields,
>(
  scope: BomWorkerRuntimeScope<TFields>,
  options: Readonly<BomWorkerRuntimeOptions<TFields>>,
): BomWorkerRuntimeController {
  const protocolVersion = options.protocolVersion ?? BOM_WORKER_PROTOCOL_VERSION;
  const engineVersion = options.engineVersion ?? 'bom-editor';
  const running = new Map<string, RunningTask<TFields>>();
  let disposed = false;
  let handshaken = false;

  const post = (message: BomWorkerRuntimeMessage<TFields>): void => {
    if (disposed) return;
    try {
      scope.postMessage(message);
    } catch {
      // A detached Worker global cannot be repaired from the handler.
    }
  };

  const handleMessage = (value: unknown): void => {
    if (disposed || !isRecord(value) || typeof value['type'] !== 'string') return;
    if (value['type'] === 'handshake') {
      handleHandshake<TFields>(value, protocolVersion, engineVersion, options, post, () => {
        handshaken = true;
      });
      return;
    }
    if (value['type'] === 'cancelTask') {
      if (isCancelMessage(value, protocolVersion)) {
        const task = running.get(value.taskId);
        if (task !== undefined) {
          task.cancelReason = value.reason;
          task.controller.abort(value.reason);
        }
      }
      return;
    }
    if (!handshaken || value['type'] !== 'task') return;
    if (!isTaskMessage<TFields>(value, protocolVersion, options.supportedTaskTypes)) return;
    if (running.has(value.taskId)) {
      postTaskFailure<TFields>(post, value, workerError('BOM_WORKER_DUPLICATE_TASK', 'WORKER', false));
      return;
    }
    const handler = resolveHandler<TFields>(options.handlers, value.taskType);
    if (handler === undefined) {
      postTaskFailure<TFields>(post, value, workerError('BOM_WORKER_TASK_UNSUPPORTED', 'WORKER', true));
      return;
    }
    const controller = new AbortController();
    const runningTask: RunningTask<TFields> = {
      task: value,
      controller,
      onAbort: (): void => {},
      timeoutHandle: null,
      lastProgress: 0,
      cancelReason: null,
    };
    running.set(value.taskId, runningTask);
    post({
      protocolVersion,
      type: 'taskAccepted',
      instanceId: value.instanceId,
      taskId: value.taskId,
      queuePosition: 0,
    });
    const timeoutMs = value.timeoutMs;
    if (timeoutMs !== undefined && Number.isSafeInteger(timeoutMs) && timeoutMs > 0) {
      runningTask.timeoutHandle = setTimeout(() => {
        runningTask.cancelReason = 'timeout';
        controller.abort('timeout');
      }, timeoutMs);
    }
    const context: BomWorkerRuntimeTaskContext<TFields> = Object.freeze({
      signal: controller.signal,
      task: value,
      reportProgress: (
        completed: number,
        total: number | undefined,
        stage: string,
      ): void => {
        if (running.get(value.taskId) !== runningTask || controller.signal.aborted) return;
        const boundedCompleted = Number.isSafeInteger(completed)
          ? Math.max(runningTask.lastProgress, completed)
          : runningTask.lastProgress;
        const boundedTotal = total === undefined || !Number.isSafeInteger(total) || total < 0
          ? undefined
          : total;
        runningTask.lastProgress = boundedCompleted;
        post({
          protocolVersion,
          type: 'taskProgress',
          instanceId: value.instanceId,
          taskId: value.taskId,
          documentId: value.documentId,
          documentGeneration: value.documentGeneration,
          documentRevision: value.documentRevision,
          completed: boundedCompleted,
          ...(boundedTotal === undefined ? {} : { total: boundedTotal }),
          stage: safeStage(stage),
        });
      },
    });
    void Promise.resolve(handler(value.payload, context)).then(
      (result) => {
        if (running.get(value.taskId) !== runningTask) return;
        cleanupRunning(value.taskId, runningTask);
        if (controller.signal.aborted) {
          postTaskCancelled<TFields>(post, value, runningTask.cancelReason ?? 'caller');
          return;
        }
        if (!isTaskResult(result, value.taskType)) {
          postTaskFailure<TFields>(post, value, workerError('BOM_WORKER_RESULT_INVALID', 'WORKER', true));
          return;
        }
        post({
          protocolVersion,
          type: 'taskSucceeded',
          instanceId: value.instanceId,
          taskId: value.taskId,
          documentId: value.documentId,
          documentGeneration: value.documentGeneration,
          documentRevision: value.documentRevision,
          result,
        });
      },
      (cause: unknown) => {
        if (running.get(value.taskId) !== runningTask) return;
        cleanupRunning(value.taskId, runningTask);
        if (controller.signal.aborted) {
          postTaskCancelled<TFields>(post, value, runningTask.cancelReason ?? 'caller');
          return;
        }
        postTaskFailure<TFields>(post, value, workerError('BOM_WORKER_TASK_FAILED', 'WORKER', true));
        void cause;
      },
    );
  };

  scope.onmessage = (event): void => {
    handleMessage(event.data);
  };

  return Object.freeze({
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      for (const [taskId, task] of running) {
        task.cancelReason = 'instanceDestroyed';
        task.controller.abort('instanceDestroyed');
        cleanupRunning(taskId, task);
      }
      scope.onmessage = null;
    },
  });

  function cleanupRunning(taskId: string, task: RunningTask<TFields>): void {
    if (task.timeoutHandle !== null) clearTimeout(task.timeoutHandle);
    task.controller.signal.removeEventListener('abort', task.onAbort);
    running.delete(taskId);
  }
}

function handleHandshake<TFields extends BomFields>(
  value: Record<string, unknown>,
  protocolVersion: string,
  engineVersion: string,
  options: Readonly<BomWorkerRuntimeOptions<TFields>>,
  post: (message: BomWorkerRuntimeMessage<TFields>) => void,
  accepted: () => void,
): void {
  const request = value as Partial<BomWorkerHandshakeRequest>;
  const result: BomResult<Readonly<import('@bom-editor/contracts').BomWorkerCapabilities>> =
    request.protocolVersion !== protocolVersion ||
      request.type !== 'handshake' ||
      !Array.isArray(request.supportedProtocolVersions) ||
      !request.supportedProtocolVersions.includes(protocolVersion)
      ? Object.freeze({
          ok: false,
          error: workerError('BOM_WORKER_PROTOCOL_MISMATCH', 'WORKER', false),
        })
      : Object.freeze({
          ok: true,
          value: Object.freeze({
            protocolVersion,
            taskTypes: Object.freeze([...options.supportedTaskTypes]),
            maxMessageBytes: options.maxMessageBytes ?? 16 * 1024 * 1024,
            supportsBinaryTransfer: options.supportsBinaryTransfer ?? true,
          }),
        });
  post({
    protocolVersion,
    type: 'handshakeResult',
    requestId: typeof request.requestId === 'string' ? request.requestId : '',
    result,
  });
  if (result.ok) accepted();
  void engineVersion;
}

function resolveHandler<TFields extends BomFields>(
  handlers: Readonly<Partial<Record<BomWorkerTaskType, import('./types.js').BomWorkerRuntimeTaskHandler<TFields>>>>,
  taskType: BomWorkerTaskType,
): import('./types.js').BomWorkerRuntimeTaskHandler<TFields> | undefined {
  return handlers[taskType];
}

function postTaskFailure<TFields extends BomFields>(
  post: (message: BomWorkerRuntimeMessage<TFields>) => void,
  task: Readonly<BomWorkerTaskMessage<TFields>>,
  error: BomError,
): void {
  post({
    protocolVersion: task.protocolVersion,
    type: 'taskFailed',
    instanceId: task.instanceId,
    taskId: task.taskId,
    documentId: task.documentId,
    documentGeneration: task.documentGeneration,
    documentRevision: task.documentRevision,
    error,
    retryable: error.recoverable,
  });
}

function postTaskCancelled<TFields extends BomFields>(
  post: (message: BomWorkerRuntimeMessage<TFields>) => void,
  task: Readonly<BomWorkerTaskMessage<TFields>>,
  reason: 'caller' | 'timeout' | 'superseded' | 'instanceDestroyed',
): void {
  post({
    protocolVersion: task.protocolVersion,
    type: 'taskCancelled',
    instanceId: task.instanceId,
    taskId: task.taskId,
    documentId: task.documentId,
    documentGeneration: task.documentGeneration,
    documentRevision: task.documentRevision,
    reason,
  });
}

function isCancelMessage(
  value: Record<string, unknown>,
  protocolVersion: string,
): value is Record<string, unknown> & BomWorkerCancelTaskMessage {
  return value['protocolVersion'] === protocolVersion &&
    value['type'] === 'cancelTask' &&
    typeof value['taskId'] === 'string' &&
    (value['reason'] === 'caller' ||
      value['reason'] === 'timeout' ||
      value['reason'] === 'superseded' ||
      value['reason'] === 'instanceDestroyed');
}

function isTaskMessage<TFields extends BomFields>(
  value: Record<string, unknown>,
  protocolVersion: string,
  supportedTaskTypes: readonly BomWorkerTaskType[],
): value is Record<string, unknown> & BomWorkerTaskMessage<TFields> {
  return value['protocolVersion'] === protocolVersion &&
    value['type'] === 'task' &&
    typeof value['instanceId'] === 'string' &&
    typeof value['taskId'] === 'string' &&
    typeof value['documentId'] === 'string' &&
    Number.isSafeInteger(value['documentGeneration']) &&
    typeof value['documentRevision'] === 'string' &&
    supportedTaskTypes.includes(value['taskType'] as BomWorkerTaskType);
}

function isTaskResult<TFields extends BomFields>(
  value: unknown,
  taskType: BomWorkerTaskType,
): value is BomWorkerTaskResult<TFields> {
  return isRecord(value) && value['taskType'] === taskType;
}

function safeStage(value: string): string {
  return typeof value === 'string' && value.length <= 128 ? value : 'progress';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
