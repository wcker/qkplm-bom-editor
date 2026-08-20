import type {
  BomFields,
  BomInstanceId,
} from '@bom-editor/contracts';
import type {
  BomEventDetail,
  BomEventDispatchResult,
  BomEventListener,
  BomEventMap,
  BomRuntimeCancellableEvent,
  BomRuntimeCancellableEventType,
  BomRuntimeEvent,
  BomRuntimeEventType,
} from './events.js';
import type { BomRuntimeDiagnosticSink } from './types.js';

const CANCELLABLE_TYPES: ReadonlySet<BomRuntimeCancellableEventType> =
  new Set<BomRuntimeCancellableEventType>([
    'beforeTransaction',
    'beforeDocumentReplace',
    'beforeEdit',
    'beforeCommit',
    'beforeImport',
    'beforeExport',
    'beforeCopy',
  ]);

type ErasedEventListener = (event: Readonly<BomRuntimeEvent>) => unknown;

export interface EventHubOptions {
  readonly instanceId: BomInstanceId;
  readonly now?: () => number;
  readonly diagnosticSink?: BomRuntimeDiagnosticSink;
}

function isCancellableType(
  type: BomRuntimeEventType,
): type is BomRuntimeCancellableEventType {
  return CANCELLABLE_TYPES.has(type as BomRuntimeCancellableEventType);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null
  ) {
    return false;
  }
  try {
    return typeof (value as { readonly then?: unknown }).then === 'function';
  } catch {
    return false;
  }
}

export class EventHub<TFields extends BomFields = BomFields> {
  readonly #instanceId: BomInstanceId;
  readonly #now: () => number;
  readonly #diagnosticSink: BomRuntimeDiagnosticSink | undefined;
  readonly #listeners = new Map<
    BomRuntimeEventType,
    Set<ErasedEventListener>
  >();
  #sequence = 0;
  #dispatching = false;
  #registeredListenerCount = 0;
  #removedListenerCount = 0;
  #pendingAsyncListenerCount = 0;

  public constructor(options: EventHubOptions) {
    this.#instanceId = options.instanceId;
    this.#now = options.now ?? Date.now;
    this.#diagnosticSink = options.diagnosticSink;
  }

  public get sequence(): number {
    return this.#sequence;
  }

  public get listenerCount(): number {
    let count = 0;
    for (const listeners of this.#listeners.values()) {
      count += listeners.size;
    }
    return count;
  }

  public get registeredListenerCount(): number {
    return this.#registeredListenerCount;
  }

  public get removedListenerCount(): number {
    return this.#removedListenerCount;
  }

  public get pendingAsyncListenerCount(): number {
    return this.#pendingAsyncListenerCount;
  }

  public on<K extends keyof BomEventMap<TFields>>(
    type: K,
    listener: BomEventListener<TFields, K>,
  ): () => void {
    const eventType = type as BomRuntimeEventType;
    const erasedListener = listener as unknown as ErasedEventListener;
    let listeners = this.#listeners.get(eventType);
    if (listeners === undefined) {
      listeners = new Set<ErasedEventListener>();
      this.#listeners.set(eventType, listeners);
    }
    const previousSize = listeners.size;
    listeners.add(erasedListener);
    if (listeners.size !== previousSize) {
      this.#registeredListenerCount += 1;
    }

    let active = true;
    return (): void => {
      if (!active) {
        return;
      }
      active = false;
      this.off(type, listener);
    };
  }

  public off<K extends keyof BomEventMap<TFields>>(
    type: K,
    listener: BomEventListener<TFields, K>,
  ): void {
    const eventType = type as BomRuntimeEventType;
    const listeners = this.#listeners.get(eventType);
    if (listeners === undefined) {
      return;
    }
    const removed = listeners.delete(
      listener as unknown as ErasedEventListener,
    );
    if (removed) {
      this.#removedListenerCount += 1;
    }
    if (listeners.size === 0) {
      this.#listeners.delete(eventType);
    }
  }

  public dispatch<K extends keyof BomEventMap<TFields>>(
    type: K,
    detail: BomEventDetail<BomEventMap<TFields>[K]>,
  ): BomEventDispatchResult<BomEventMap<TFields>[K]> {
    const eventType = type as BomRuntimeEventType;
    if (this.#dispatching) {
      return {
        ok: false,
        error: {
          code: 'BOM_EVENT_REENTRANT_DISPATCH',
          eventType,
        },
      };
    }
    if (this.#sequence >= Number.MAX_SAFE_INTEGER) {
      return {
        ok: false,
        error: {
          code: 'BOM_EVENT_SEQUENCE_EXHAUSTED',
          eventType,
        },
      };
    }

    this.#sequence += 1;
    const eventSequence = this.#sequence;
    let cancellationOpen = true;
    let defaultPrevented = false;
    const base = Object.assign({}, detail, {
      type: eventType,
      instanceId: this.#instanceId,
      sequence: eventSequence,
      timestamp: this.#now(),
    });

    if (isCancellableType(eventType)) {
      Object.defineProperties(base, {
        cancellable: {
          configurable: false,
          enumerable: true,
          value: true,
          writable: false,
        },
        defaultPrevented: {
          configurable: false,
          enumerable: true,
          get: (): boolean => defaultPrevented,
        },
        preventDefault: {
          configurable: false,
          enumerable: false,
          value: (): void => {
            if (cancellationOpen) {
              defaultPrevented = true;
            }
          },
          writable: false,
        },
      });
    }

    const event = Object.freeze(base) as unknown as Readonly<
      BomEventMap<TFields>[K]
    >;
    const listeners = this.#listeners.get(eventType);
    const dispatchSnapshot =
      listeners === undefined ? [] : Array.from(listeners);

    this.#dispatching = true;
    try {
      for (let index = 0; index < dispatchSnapshot.length; index += 1) {
        const listener = dispatchSnapshot[index];
        if (listener === undefined || !listeners?.has(listener)) {
          continue;
        }
        try {
          const listenerResult = listener(
            event as unknown as Readonly<BomRuntimeEvent>,
          );
          if (isPromiseLike(listenerResult)) {
            this.#pendingAsyncListenerCount += 1;
            void Promise.resolve(listenerResult)
              .catch((cause: unknown) => {
                this.#reportListenerFailure(
                  eventType,
                  eventSequence,
                  index,
                  cause,
                );
              })
              .finally(() => {
                this.#pendingAsyncListenerCount -= 1;
              });
          }
        } catch (cause) {
          this.#reportListenerFailure(eventType, eventSequence, index, cause);
        }
      }
    } finally {
      cancellationOpen = false;
      this.#dispatching = false;
    }

    return { ok: true, event };
  }

  public clear(): void {
    this.#removedListenerCount += this.listenerCount;
    this.#listeners.clear();
  }

  #reportListenerFailure(
    eventType: BomRuntimeEventType,
    sequence: number,
    listenerIndex: number,
    cause: unknown,
  ): void {
    if (this.#diagnosticSink === undefined) {
      return;
    }
    try {
      this.#diagnosticSink({
        code: 'BOM_EVENT_LISTENER_FAILED',
        source: 'event',
        instanceId: this.#instanceId,
        eventType,
        sequence,
        listenerIndex,
        cause,
      });
    } catch {
      // Diagnostic reporting must not join the editor's failure path.
    }
  }
}

export function isBomRuntimeCancellableEvent(
  event: Readonly<BomRuntimeEvent>,
): event is Readonly<
  Extract<BomRuntimeEvent, BomRuntimeCancellableEvent>
> {
  return isCancellableType(event.type);
}
