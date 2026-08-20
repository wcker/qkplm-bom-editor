import type {
  ClipboardTextParseAsyncResult,
  ClipboardTextParseLimits,
} from './paste.js';
import { BOM_CLIPBOARD_WORKER_PROTOCOL } from './clipboard-worker-protocol.js';

interface ClipboardWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

interface ClipboardWorkerConstructor {
  new (scriptURL: string | URL, options?: WorkerOptions): ClipboardWorkerLike;
}

interface ClipboardWorkerParseContext {
  readonly taskId: string;
  readonly documentId: string;
  readonly documentGeneration: number;
}

interface ClipboardWorkerParseResultMessage {
  readonly protocol: typeof BOM_CLIPBOARD_WORKER_PROTOCOL;
  readonly type: 'parseResult';
  readonly taskId: string;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly result: ClipboardTextParseAsyncResult;
}

interface ClipboardWorkerErrorMessage {
  readonly protocol: typeof BOM_CLIPBOARD_WORKER_PROTOCOL;
  readonly type: 'parseError';
  readonly taskId: string;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly code: 'invalid-request' | 'worker-error';
}

type ClipboardWorkerResponse =
  | ClipboardWorkerParseResultMessage
  | ClipboardWorkerErrorMessage;

interface PendingParse {
  readonly context: ClipboardWorkerParseContext;
  readonly limits: Readonly<ClipboardTextParseLimits>;
  readonly resolve: (result: ClipboardTextParseAsyncResult) => void;
  readonly reject: (error: Error) => void;
  readonly onAbort: () => void;
  readonly signal: AbortSignal | undefined;
}

export class ClipboardWorkerUnavailableError extends Error {
  public constructor(message = 'Clipboard parser Worker is unavailable.') {
    super(message);
    this.name = 'ClipboardWorkerUnavailableError';
  }
}

/**
 * Small one-instance Worker client. It intentionally has no retry or queue:
 * the editor FIFO owns ordering, while this client owns only transport and
 * cancellation for one derived parse task at a time.
 */
export class ClipboardParseWorkerClient {
  readonly #worker: ClipboardWorkerLike;
  readonly #pending = new Map<string, PendingParse>();
  #sequence = 0;
  #disposed = false;

  public get pendingCount(): number {
    return this.#pending.size;
  }

  public constructor(worker: ClipboardWorkerLike) {
    this.#worker = worker;
    worker.onmessage = (event): void => {
      this.#handleMessage(event.data);
    };
    worker.onerror = (): void => {
      this.#failPending(new ClipboardWorkerUnavailableError('Clipboard parser Worker failed.'));
    };
  }

  public parseText(
    text: string,
    limits: Readonly<ClipboardTextParseLimits>,
    context: Readonly<{
      readonly documentId: string;
      readonly documentGeneration: number;
    }>,
    signal?: AbortSignal,
  ): Promise<ClipboardTextParseAsyncResult> {
    if (this.#disposed || signal?.aborted) {
      return Promise.resolve({ status: 'aborted', inputBytes: 0 });
    }
    const taskId = 'clipboard-parse-' + String(++this.#sequence);
    const parseContext: ClipboardWorkerParseContext = {
      taskId,
      documentId: context.documentId,
      documentGeneration: context.documentGeneration,
    };
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        const pending = this.#pending.get(taskId);
        if (pending === undefined) return;
        this.#pending.delete(taskId);
        try {
          this.#worker.postMessage({
            protocol: BOM_CLIPBOARD_WORKER_PROTOCOL,
            type: 'cancel',
            taskId,
          });
        } catch {
          // The local result is already cancelled; a dead Worker is harmless.
        }
        resolve({ status: 'aborted', inputBytes: 0 });
      };
      this.#pending.set(taskId, {
        context: parseContext,
        limits,
        resolve,
        reject,
        onAbort,
        signal,
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        this.#worker.postMessage({
          protocol: BOM_CLIPBOARD_WORKER_PROTOCOL,
          type: 'parseText',
          taskId,
          documentId: context.documentId,
          documentGeneration: context.documentGeneration,
          text,
          limits,
        });
      } catch {
        this.#settleFailure(taskId, new ClipboardWorkerUnavailableError());
      }
    });
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#failPending(new ClipboardWorkerUnavailableError('Clipboard parser Worker was disposed.'));
    this.#worker.onmessage = null;
    this.#worker.onerror = null;
    this.#worker.terminate();
  }

  #handleMessage(value: unknown): void {
    if (!isClipboardWorkerResponse(value)) return;
    const pending = this.#pending.get(value.taskId);
    if (pending === undefined) return;
    if (
      pending.context.documentId !== value.documentId ||
      pending.context.documentGeneration !== value.documentGeneration
    ) {
      this.#settleFailure(
        value.taskId,
        new ClipboardWorkerUnavailableError('Clipboard parser Worker returned a stale context.'),
      );
      return;
    }
    if (value.type === 'parseError') {
      this.#settleFailure(
        value.taskId,
        new ClipboardWorkerUnavailableError('Clipboard parser Worker rejected the task.'),
      );
      return;
    }
    if (!isParseResult(value.result, pending.limits)) {
      this.#settleFailure(
        value.taskId,
        new ClipboardWorkerUnavailableError('Clipboard parser Worker returned an invalid result.'),
      );
      return;
    }
    this.#settleResult(value.taskId, value.result);
  }

  #settleResult(taskId: string, result: ClipboardTextParseAsyncResult): void {
    const pending = this.#pending.get(taskId);
    if (pending === undefined) return;
    this.#pending.delete(taskId);
    pending.signal?.removeEventListener('abort', pending.onAbort);
    pending.resolve(result);
  }

  #settleFailure(taskId: string, error: Error): void {
    const pending = this.#pending.get(taskId);
    if (pending === undefined) return;
    this.#pending.delete(taskId);
    pending.signal?.removeEventListener('abort', pending.onAbort);
    pending.reject(error);
  }

  #failPending(error: Error): void {
    for (const taskId of this.#pending.keys()) {
      this.#settleFailure(taskId, error);
    }
  }
}

export function createClipboardParseWorkerClient(
  workerConstructor: unknown,
): ClipboardParseWorkerClient | undefined {
  if (typeof workerConstructor !== 'function') {
    return undefined;
  }
  try {
    const worker = new (workerConstructor as ClipboardWorkerConstructor)(
      new URL('./clipboard-worker.js', import.meta.url),
      { type: 'module' },
    );
    return new ClipboardParseWorkerClient(worker);
  } catch {
    return undefined;
  }
}

function isClipboardWorkerResponse(
  value: unknown,
): value is ClipboardWorkerResponse {
  if (!isRecord(value) || value['protocol'] !== BOM_CLIPBOARD_WORKER_PROTOCOL) {
    return false;
  }
  if (
    !isBoundedString(value['taskId'], 128) ||
    !isBoundedString(value['documentId'], 512) ||
    typeof value['documentGeneration'] !== 'number' ||
    !Number.isSafeInteger(value['documentGeneration']) ||
    value['documentGeneration'] < 0
  ) {
    return false;
  }
  if (value['type'] === 'parseError') {
    return value['code'] === 'invalid-request' || value['code'] === 'worker-error';
  }
  return value['type'] === 'parseResult';
}

function isParseResult(
  value: unknown,
  limits: Readonly<ClipboardTextParseLimits>,
): value is ClipboardTextParseAsyncResult {
  if (!isRecord(value) || typeof value['inputBytes'] !== 'number') return false;
  if (
    !Number.isSafeInteger(value['inputBytes']) ||
    value['inputBytes'] < 0 ||
    value['inputBytes'] > boundedInputBytesAtLimit(limits.maxBytes)
  ) {
    return false;
  }
  if (value['status'] === 'aborted') return true;
  if (value['status'] !== 'parsed' || !isRecord(value['parsed'])) return false;
  const parsed = value['parsed'];
  if (parsed['ok'] === false) {
    return (
      isClipboardFailureReason(parsed['reason']) &&
      isClipboardDiagnostics(parsed['diagnostics'], limits)
    );
  }
  if (
    parsed['ok'] !== true ||
    !isClipboardFormat(parsed['format']) ||
    !Array.isArray(parsed['rows']) ||
    parsed['rows'].length === 0 ||
    parsed['rows'].length > limits.maxRows
  ) {
    return false;
  }
  let cellCount = 0;
  for (const row of parsed['rows']) {
    if (
      !Array.isArray(row) ||
      row.length === 0 ||
      row.length > limits.maxColumns
    ) {
      return false;
    }
    cellCount += row.length;
    if (cellCount > limits.maxCells) return false;
    for (const cell of row) {
      if (typeof cell !== 'string' || cell.length > limits.maxCellBytes) {
        return false;
      }
    }
  }
  return true;
}

function boundedInputBytesAtLimit(maxBytes: number): number {
  return maxBytes === Number.MAX_SAFE_INTEGER ? maxBytes : maxBytes + 1;
}

function isClipboardFailureReason(value: unknown): boolean {
  return (
    value === 'input-too-large' ||
    value === 'too-many-rows' ||
    value === 'too-many-columns' ||
    value === 'too-many-cells' ||
    value === 'cell-too-large' ||
    value === 'malformed'
  );
}

function isClipboardFormat(value: unknown): value is 'tsv' | 'csv' | 'text' {
  return value === 'tsv' || value === 'csv' || value === 'text';
}

function isClipboardDiagnostics(
  value: unknown,
  limits: Readonly<ClipboardTextParseLimits>,
): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 256) return false;
  return value.every((entry) =>
    isRecord(entry) &&
    Number.isSafeInteger(entry['sourceRow']) &&
    (entry['sourceRow'] as number) >= 0 &&
    (entry['sourceRow'] as number) <= limits.maxRows &&
    Number.isSafeInteger(entry['sourceColumn']) &&
    (entry['sourceColumn'] as number) >= 0 &&
    (entry['sourceColumn'] as number) <= limits.maxColumns &&
    isDiagnosticCode(entry['code']),
  );
}

function isDiagnosticCode(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
