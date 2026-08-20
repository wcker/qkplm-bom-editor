import type {
  BomError,
  BomFields,
  BomResult,
  BomWorkerCapabilities,
  BomWorkerPriority,
  BomWorkerRuntimeMessage,
  BomWorkerTaskDescriptor,
  BomWorkerTaskId,
  BomWorkerTaskMessage,
  BomWorkerTaskResult,
  BomWorkerTaskType,
} from '@bom-editor/contracts';

export const BOM_WORKER_RUNTIME_PROTOCOL = 'bom-editor-worker-runtime/v1';
export const BOM_WORKER_PROTOCOL_VERSION = 'bom-worker/v1';

export interface BomWorkerTransport {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown, transfer?: readonly Transferable[]): void;
  terminate(): void;
}

export type BomWorkerFactory = () => BomWorkerTransport;

export type BomWorkerTaskInput<
  TFields extends BomFields = BomFields,
> = BomWorkerTaskDescriptor<TFields> & {
  readonly instanceId: string;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly documentRevision: string;
  readonly priority?: BomWorkerPriority;
  readonly replayable?: boolean;
  readonly timeoutMs?: number;
  readonly cancellationKey?: string;
  /** Tasks sharing a key are superseded before dispatch. */
  readonly mergeKey?: string;
  readonly signal?: AbortSignal;
};

export interface BomWorkerTaskAccepted {
  readonly taskId: BomWorkerTaskId;
  readonly queuePosition: number;
}

export interface BomWorkerTaskHandle<
  TFields extends BomFields = BomFields,
> {
  readonly taskId: BomWorkerTaskId;
  readonly accepted: Promise<BomResult<Readonly<BomWorkerTaskAccepted>>>;
  readonly result: Promise<BomResult<Readonly<BomWorkerTaskResult<TFields>>>>;
  cancel(reason?: BomWorkerCancelReason): void;
}

export type BomWorkerCancelReason =
  | 'caller'
  | 'timeout'
  | 'superseded'
  | 'instanceDestroyed';

export interface BomWorkerFallbackContext<
  TFields extends BomFields = BomFields,
> {
  readonly signal: AbortSignal;
  readonly reportProgress: (
    completed: number,
    total: number | undefined,
    stage: string,
  ) => void;
  readonly task: Readonly<BomWorkerTaskMessage<TFields>>;
}

export type BomWorkerFallback<
  TFields extends BomFields = BomFields,
> = (
  task: Readonly<BomWorkerTaskMessage<TFields>>,
  context: Readonly<BomWorkerFallbackContext<TFields>>,
) => BomWorkerTaskResult<TFields> | Promise<BomWorkerTaskResult<TFields>>;

export interface BomWorkerPoolOptions<
  TFields extends BomFields = BomFields,
> {
  /** Preferred for CSP-safe deployment and deterministic tests. */
  readonly workerFactory?: BomWorkerFactory;
  /** Used only when `workerFactory` is omitted. */
  readonly workerUrl?: string | URL;
  readonly workerOptions?: WorkerOptions;
  readonly poolSize?: number;
  readonly maxQueuedTasks?: number;
  readonly maxTasksPerInstance?: number;
  readonly maxRestarts?: number;
  readonly defaultTimeoutMs?: number;
  readonly agingIntervalMs?: number;
  readonly engineVersion?: string;
  readonly protocolVersion?: string;
  readonly supportedTaskTypes?: readonly BomWorkerTaskType[];
  readonly fallback?: BomWorkerFallback<TFields>;
  readonly diagnosticSink?: (diagnostic: Readonly<BomWorkerDiagnostic>) => void;
}

export type BomWorkerDiagnostic =
  | {
      readonly code: 'BOM_WORKER_UNAVAILABLE';
      readonly cause?: unknown;
    }
  | {
      readonly code: 'BOM_WORKER_PROTOCOL_MISMATCH';
      readonly taskId?: BomWorkerTaskId;
      readonly cause?: unknown;
    }
  | {
      readonly code: 'BOM_WORKER_CRASHED';
      readonly slot: number;
      readonly taskId?: BomWorkerTaskId;
      readonly restarted: boolean;
      readonly cause?: unknown;
    }
  | {
      readonly code: 'BOM_WORKER_STALE_RESULT';
      readonly taskId: BomWorkerTaskId;
    }
  | {
      readonly code: 'BOM_WORKER_BACKPRESSURE';
      readonly instanceId: string;
    }
  | {
      readonly code: 'BOM_WORKER_TASK_FAILED';
      readonly taskId: BomWorkerTaskId;
      readonly cause?: unknown;
    };

export interface BomWorkerPoolDiagnostics {
  readonly destroyed: boolean;
  readonly workerCount: number;
  readonly readyWorkerCount: number;
  readonly queuedCount: number;
  readonly runningCount: number;
  readonly fallbackRunningCount: number;
  readonly restartCount: number;
  readonly cancelledCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly droppedCount: number;
  readonly perInstance: readonly Readonly<{
    readonly instanceId: string;
    readonly queuedCount: number;
    readonly runningCount: number;
    readonly completedCount: number;
  }>[];
}

export interface BomWorkerPool<
  TFields extends BomFields = BomFields,
> {
  readonly capabilities: Readonly<BomWorkerCapabilities>;
  submit(input: Readonly<BomWorkerTaskInput<TFields>>): BomWorkerTaskHandle<TFields>;
  cancel(taskId: BomWorkerTaskId, reason?: BomWorkerCancelReason): boolean;
  disposeInstance(instanceId: string): void;
  getDiagnostics(): Readonly<BomWorkerPoolDiagnostics>;
  destroy(): void;
}

export interface BomWorkerRuntimeScope<
  TFields extends BomFields = BomFields,
> {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: BomWorkerRuntimeMessage<TFields>): void;
}

export interface BomWorkerRuntimeTaskContext<
  TFields extends BomFields = BomFields,
> {
  readonly signal: AbortSignal;
  readonly task: Readonly<BomWorkerTaskMessage<TFields>>;
  readonly reportProgress: (
    completed: number,
    total: number | undefined,
    stage: string,
  ) => void;
}

export type BomWorkerRuntimeTaskHandler<
  TFields extends BomFields = BomFields,
> = (
  payload: BomWorkerTaskDescriptor<TFields>['payload'],
  context: Readonly<BomWorkerRuntimeTaskContext<TFields>>,
) => BomWorkerTaskResult<TFields> | Promise<BomWorkerTaskResult<TFields>>;

export interface BomWorkerRuntimeOptions<
  TFields extends BomFields = BomFields,
> {
  readonly engineVersion?: string;
  readonly protocolVersion?: string;
  readonly supportedTaskTypes: readonly BomWorkerTaskType[];
  readonly maxMessageBytes?: number;
  readonly supportsBinaryTransfer?: boolean;
  readonly handlers: Readonly<Partial<Record<BomWorkerTaskType, BomWorkerRuntimeTaskHandler<TFields>>>>;
}

export interface BomWorkerRuntimeController {
  dispose(): void;
}

export function workerError(
  code: string,
  category: BomError['category'],
  recoverable: boolean,
  params?: Readonly<Record<string, string | number>>,
): BomError {
  return Object.freeze({
    code,
    category,
    messageKey: 'bom.worker.' + code.toLowerCase(),
    recoverable,
    ...(params === undefined ? {} : { messageParams: Object.freeze({ ...params }) }),
  });
}
