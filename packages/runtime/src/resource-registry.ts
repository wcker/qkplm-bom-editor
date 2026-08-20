import type { BomRuntimeDiagnosticSink } from './types.js';

export type BomResourceCleanup = () => void;

export interface BomDisconnectableResource {
  disconnect(): void;
}

export interface BomTerminableResource {
  terminate(): void;
}

export type BomObserverResourceKind =
  | 'observer'
  | 'resize-observer'
  | 'mutation-observer'
  | 'intersection-observer';

export type BomTaskResourceKind = 'task' | 'worker-task';

export interface BomResourceKindDeclaration {
  readonly kind: string;
  /** Whether every component-owned resource of this kind enters this registry. */
  readonly tracked: boolean;
  /** Whether the required primitive is available in the current runtime. */
  readonly supported: boolean;
}

export interface BomResourceKindDiagnostics
  extends BomResourceKindDeclaration {
  readonly registeredCount: number | null;
  readonly activeCount: number | null;
  readonly cleanupAttemptCount: number | null;
  readonly cleanupFailureCount: number | null;
}

export interface BomResourceRegistryDiagnostics {
  readonly protocol: typeof BOM_RESOURCE_REGISTRY_LEDGER_PROTOCOL;
  readonly disposed: boolean;
  readonly registeredCount: number;
  readonly activeCount: number;
  readonly cleanupAttemptCount: number;
  readonly cleanupFailureCount: number;
  readonly kinds: readonly Readonly<BomResourceKindDiagnostics>[];
}

export const BOM_RESOURCE_REGISTRY_LEDGER_PROTOCOL =
  'bom-resource-registry-ledger/v1';

interface ResourceKindState {
  readonly kind: string;
  tracked: boolean;
  supported: boolean;
  registeredCount: number;
  activeCount: number;
  cleanupAttemptCount: number;
  cleanupFailureCount: number;
}

interface ResourceEntry {
  readonly cleanup: BomResourceCleanup;
  readonly kind: ResourceKindState;
  active: boolean;
  linked: boolean;
  previous: ResourceEntry | null;
  next: ResourceEntry | null;
}

export interface ResourceRegistryOptions {
  readonly diagnosticSink?: BomRuntimeDiagnosticSink;
  readonly kinds?: readonly Readonly<BomResourceKindDeclaration>[];
}

export class ResourceRegistry {
  readonly #diagnosticSink: BomRuntimeDiagnosticSink | undefined;
  readonly #kinds = new Map<string, ResourceKindState>();
  #tail: ResourceEntry | null = null;
  #size = 0;
  #registeredCount = 0;
  #cleanupAttemptCount = 0;
  #cleanupFailureCount = 0;
  #disposed = false;

  public constructor(options: ResourceRegistryOptions = {}) {
    this.#diagnosticSink = options.diagnosticSink;
    for (const declaration of options.kinds ?? []) {
      const kind = validateKind(declaration.kind);
      if (this.#kinds.has(kind)) {
        throw new TypeError(`Duplicate resource kind declaration: ${kind}`);
      }
      this.#kinds.set(kind, {
        kind,
        tracked: declaration.tracked,
        supported: declaration.supported,
        registeredCount: 0,
        activeCount: 0,
        cleanupAttemptCount: 0,
        cleanupFailureCount: 0,
      });
    }
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get size(): number {
    return this.#size;
  }

  public getDiagnostics(): Readonly<BomResourceRegistryDiagnostics> {
    const kinds = [...this.#kinds.values()]
      .sort((left, right) =>
        left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0,
      )
      .map((state) => Object.freeze({
        kind: state.kind,
        tracked: state.tracked,
        supported: state.supported,
        registeredCount: state.tracked ? state.registeredCount : null,
        activeCount: state.tracked ? state.activeCount : null,
        cleanupAttemptCount: state.tracked
          ? state.cleanupAttemptCount
          : null,
        cleanupFailureCount: state.tracked
          ? state.cleanupFailureCount
          : null,
      }));
    return Object.freeze({
      protocol: BOM_RESOURCE_REGISTRY_LEDGER_PROTOCOL,
      disposed: this.#disposed,
      registeredCount: this.#registeredCount,
      activeCount: this.#size,
      cleanupAttemptCount: this.#cleanupAttemptCount,
      cleanupFailureCount: this.#cleanupFailureCount,
      kinds: Object.freeze(kinds),
    });
  }

  public register(
    cleanup: BomResourceCleanup,
    kind = 'custom',
  ): () => void {
    if (typeof cleanup !== 'function') {
      throw new TypeError('Resource cleanup must be a function.');
    }
    const kindState = this.#registeredKind(kind);
    const entry: ResourceEntry = {
      cleanup,
      kind: kindState,
      active: true,
      linked: false,
      previous: null,
      next: null,
    };
    kindState.registeredCount += 1;
    kindState.activeCount += 1;
    this.#registeredCount += 1;
    if (this.#disposed) {
      this.#disposeEntry(entry);
      return (): void => {};
    }

    entry.linked = true;
    entry.previous = this.#tail;
    if (this.#tail !== null) {
      this.#tail.next = entry;
    }
    this.#tail = entry;
    this.#size += 1;
    return (): void => {
      this.#disposeEntry(entry);
    };
  }

  public trackEvent(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): () => void {
    if (options === undefined) {
      target.addEventListener(type, listener);
    } else {
      target.addEventListener(type, listener, options);
    }
    const capture =
      typeof options === 'boolean' ? options : (options?.capture ?? false);
    return this.register((): void => {
      target.removeEventListener(type, listener, capture);
    }, 'event-listener');
  }

  public trackObserver<TObserver extends BomDisconnectableResource>(
    observer: TObserver,
    kind: BomObserverResourceKind = 'observer',
  ): () => void {
    return this.register((): void => {
      observer.disconnect();
    }, kind);
  }

  public trackAnimationFrame(
    requestId: number,
    cancel: (requestId: number) => void,
  ): () => void {
    return this.register((): void => {
      cancel(requestId);
    }, 'animation-frame');
  }

  public trackTimeout<THandle>(
    handle: THandle,
    clear: (handle: THandle) => void,
  ): () => void {
    return this.register((): void => {
      clear(handle);
    }, 'timeout');
  }

  public trackInterval<THandle>(
    handle: THandle,
    clear: (handle: THandle) => void,
  ): () => void {
    return this.register((): void => {
      clear(handle);
    }, 'interval');
  }

  public trackWorker<TWorker extends BomTerminableResource>(
    worker: TWorker,
  ): () => void {
    return this.register((): void => {
      worker.terminate();
    }, 'worker');
  }

  public trackTask(
    cancel: BomResourceCleanup,
    kind: BomTaskResourceKind = 'task',
  ): () => void {
    return this.register(cancel, kind);
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    while (this.#tail !== null) {
      this.#disposeEntry(this.#tail);
    }
  }

  #disposeEntry(entry: ResourceEntry): void {
    if (!entry.active) {
      return;
    }
    entry.active = false;
    if (entry.linked) {
      if (entry.previous !== null) {
        entry.previous.next = entry.next;
      }
      if (entry.next !== null) {
        entry.next.previous = entry.previous;
      } else {
        this.#tail = entry.previous;
      }
      entry.linked = false;
      entry.previous = null;
      entry.next = null;
      this.#size -= 1;
    }
    entry.kind.activeCount -= 1;
    entry.kind.cleanupAttemptCount += 1;
    this.#cleanupAttemptCount += 1;
    try {
      entry.cleanup();
    } catch (cause) {
      entry.kind.cleanupFailureCount += 1;
      this.#cleanupFailureCount += 1;
      this.#reportFailure(entry.kind.kind, cause);
    }
  }

  #registeredKind(input: string): ResourceKindState {
    const kind = validateKind(input);
    const existing = this.#kinds.get(kind);
    if (existing !== undefined) {
      existing.tracked = true;
      existing.supported = true;
      return existing;
    }
    const created: ResourceKindState = {
      kind,
      tracked: true,
      supported: true,
      registeredCount: 0,
      activeCount: 0,
      cleanupAttemptCount: 0,
      cleanupFailureCount: 0,
    };
    this.#kinds.set(kind, created);
    return created;
  }

  #reportFailure(resourceKind: string, cause: unknown): void {
    if (this.#diagnosticSink === undefined) {
      return;
    }
    try {
      this.#diagnosticSink({
        code: 'BOM_RESOURCE_DISPOSE_FAILED',
        source: 'resource',
        resourceKind,
        cause,
      });
    } catch {
      // Resource teardown continues even when the diagnostic sink fails.
    }
  }
}

function validateKind(kind: string): string {
  if (typeof kind !== 'string' || kind.trim().length === 0) {
    throw new TypeError('Resource kind must be a non-empty string.');
  }
  return kind;
}
