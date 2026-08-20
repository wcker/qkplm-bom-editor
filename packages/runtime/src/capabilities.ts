import type {
  BomCapabilities,
  BomClipboardCapability,
} from './types.js';

export interface BomClipboardLike {
  readonly readText?: unknown;
  readonly writeText?: unknown;
  readonly write?: unknown;
}

export interface BomNavigatorLike {
  readonly clipboard?: BomClipboardLike;
  readonly hardwareConcurrency?: unknown;
  readonly deviceMemory?: unknown;
}

export interface BomDocumentLike {
  readonly addEventListener?: unknown;
  readonly removeEventListener?: unknown;
}

/** Minimal injectable browser surface; detection never requires a real Window. */
export interface BomWindowLike {
  readonly Worker?: unknown;
  readonly OffscreenCanvas?: unknown;
  readonly PointerEvent?: unknown;
  readonly ResizeObserver?: unknown;
  readonly ClipboardEvent?: unknown;
  readonly Intl?: unknown;
  readonly isSecureContext?: unknown;
  readonly navigator?: BomNavigatorLike;
  readonly document?: BomDocumentLike;
}

function defaultWindowLike(): BomWindowLike | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window as unknown as BomWindowLike;
}

function safelyRead<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

function positiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function detectClipboard(
  source: BomWindowLike | undefined,
  secureContext: boolean,
): BomClipboardCapability {
  const clipboard = safelyRead(() => source?.navigator?.clipboard);
  const hasAsyncClipboard =
    secureContext &&
    typeof safelyRead(() => clipboard?.readText) === 'function' &&
    typeof safelyRead(() => clipboard?.writeText) === 'function';
  if (hasAsyncClipboard) {
    return 'async';
  }

  const documentLike = safelyRead(() => source?.document);
  const hasEventTarget =
    typeof safelyRead(() => documentLike?.addEventListener) === 'function' &&
    typeof safelyRead(() => documentLike?.removeEventListener) === 'function';
  const hasClipboardEvent =
    typeof safelyRead(() => source?.ClipboardEvent) === 'function';
  return hasEventTarget || hasClipboardEvent
    ? 'event-fallback'
    : 'unavailable';
}

export function detectBomCapabilities(
  windowLike: BomWindowLike | null | undefined = defaultWindowLike(),
): Readonly<BomCapabilities> {
  const source = windowLike ?? undefined;
  const secureContext =
    safelyRead(() => source?.isSecureContext) === true;
  const hardwareConcurrencyValue = positiveFiniteNumber(
    safelyRead(() => source?.navigator?.hardwareConcurrency),
  );
  const hardwareConcurrency =
    hardwareConcurrencyValue === undefined
      ? undefined
      : Math.max(1, Math.floor(hardwareConcurrencyValue));
  const deviceMemoryGiB = positiveFiniteNumber(
    safelyRead(() => source?.navigator?.deviceMemory),
  );

  const base: BomCapabilities = {
    worker: typeof safelyRead(() => source?.Worker) === 'function',
    offscreenCanvas:
      typeof safelyRead(() => source?.OffscreenCanvas) === 'function',
    clipboard: detectClipboard(source, secureContext),
    pointerEvents:
      typeof safelyRead(() => source?.PointerEvent) === 'function',
    resizeObserver:
      typeof safelyRead(() => source?.ResizeObserver) === 'function',
    intl: typeof safelyRead(() => source?.Intl) === 'object',
    secureContext,
    ...(hardwareConcurrency === undefined ? {} : { hardwareConcurrency }),
    ...(deviceMemoryGiB === undefined ? {} : { deviceMemoryGiB }),
  };
  return Object.freeze(base);
}
