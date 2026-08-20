import {
  parseClipboardTextAsync,
  type ClipboardTextParseAsyncResult,
  type ClipboardTextParseLimits,
} from './paste.js';
import { BOM_CLIPBOARD_WORKER_PROTOCOL } from './clipboard-worker-protocol.js';

/**
 * The parser Worker is deliberately a derived-data service. It never receives
 * a Snapshot and has no protocol message that can submit a transaction.
 */
interface ClipboardWorkerParseRequest {
  readonly protocol: typeof BOM_CLIPBOARD_WORKER_PROTOCOL;
  readonly type: 'parseText';
  readonly taskId: string;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly text: string;
  readonly limits: Readonly<ClipboardTextParseLimits>;
}

interface ClipboardWorkerCancelRequest {
  readonly protocol: typeof BOM_CLIPBOARD_WORKER_PROTOCOL;
  readonly type: 'cancel';
  readonly taskId: string;
}

type ClipboardWorkerRequest =
  | ClipboardWorkerParseRequest
  | ClipboardWorkerCancelRequest;

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

interface ClipboardWorkerScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: ClipboardWorkerResponse): void;
}

const scope = globalThis as unknown as ClipboardWorkerScope;
const controllers = new Map<string, AbortController>();

scope.onmessage = (event): void => {
  const request = event.data;
  if (!isClipboardWorkerRequest(request)) {
    return;
  }
  if (request.type === 'cancel') {
    controllers.get(request.taskId)?.abort();
    return;
  }
  void runParse(request);
};

async function runParse(request: ClipboardWorkerParseRequest): Promise<void> {
  if (controllers.has(request.taskId)) {
    postError(request, 'invalid-request');
    return;
  }
  const controller = new AbortController();
  controllers.set(request.taskId, controller);
  try {
    const result = await parseClipboardTextAsync(request.text, request.limits, {
      signal: controller.signal,
      // The checkpoint is important: it gives a cancel message a chance to
      // enter the Worker event loop while a large input is being parsed.
      maxUnitsPerSlice: 8 * 1024,
    });
    if (controllers.get(request.taskId) !== controller) {
      return;
    }
    scope.postMessage({
      protocol: BOM_CLIPBOARD_WORKER_PROTOCOL,
      type: 'parseResult',
      taskId: request.taskId,
      documentId: request.documentId,
      documentGeneration: request.documentGeneration,
      result,
    });
  } catch {
    if (controllers.get(request.taskId) === controller) {
      postError(request, 'worker-error');
    }
  } finally {
    if (controllers.get(request.taskId) === controller) {
      controllers.delete(request.taskId);
    }
  }
}

function postError(
  request: ClipboardWorkerParseRequest,
  code: ClipboardWorkerErrorMessage['code'],
): void {
  scope.postMessage({
    protocol: BOM_CLIPBOARD_WORKER_PROTOCOL,
    type: 'parseError',
    taskId: request.taskId,
    documentId: request.documentId,
    documentGeneration: request.documentGeneration,
    code,
  });
}

function isClipboardWorkerRequest(
  value: unknown,
): value is ClipboardWorkerRequest {
  if (!isRecord(value) || value['protocol'] !== BOM_CLIPBOARD_WORKER_PROTOCOL) {
    return false;
  }
  if (value['type'] === 'cancel') {
    return isBoundedString(value['taskId'], 128);
  }
  if (value['type'] !== 'parseText') {
    return false;
  }
  return (
    isBoundedString(value['taskId'], 128) &&
    isBoundedString(value['documentId'], 512) &&
    typeof value['documentGeneration'] === 'number' &&
    Number.isSafeInteger(value['documentGeneration']) &&
    value['documentGeneration'] >= 0 &&
    typeof value['text'] === 'string' &&
    isClipboardTextParseLimits(value['limits'])
  );
}

function isClipboardTextParseLimits(
  value: unknown,
): value is ClipboardTextParseLimits {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isPositiveSafeInteger(value['maxBytes']) &&
    isPositiveSafeInteger(value['maxRows']) &&
    isPositiveSafeInteger(value['maxColumns']) &&
    isPositiveSafeInteger(value['maxCells']) &&
    isPositiveSafeInteger(value['maxCellBytes'])
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
