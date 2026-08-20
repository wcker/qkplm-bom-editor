import type { BomViewTemplateEnvelope } from './template.js';
import {
  migrateBomViewTemplate,
  parseBomViewTemplate,
  serializeBomViewTemplate,
  type BomViewTemplateMigration,
  type BomViewTemplateCodecResult,
} from './template.js';
import type { BomViewTemplate } from './types.js';

export interface BomViewTemplateStorageBackend {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
  /** Optional cross-context key notification. The payload is the local key. */
  readonly subscribe?: (
    listener: (key: string | null) => void,
  ) => () => void;
}

export interface BomViewTemplateStorageChange {
  readonly name: string;
  readonly source: 'local' | 'remote';
}

export interface BomViewTemplateStorage {
  readonly save: (
    name: string,
    template: Readonly<BomViewTemplate>,
    schemaVersion: string,
  ) => BomViewTemplateCodecResult<void>;
  readonly load: (
    name: string,
  ) => BomViewTemplateCodecResult<Readonly<BomViewTemplateEnvelope>>;
  /**
   * Loads a template for a target schema version. Invalid, unknown, or
   * un-migratable storage values never get overwritten; when provided, the
   * default template is returned as an explicit fallback.
   */
  readonly loadResolved: (
    name: string,
    options: Readonly<BomViewTemplateStorageLoadOptions>,
  ) => BomViewTemplateCodecResult<Readonly<BomViewTemplateStorageValue>>;
  readonly remove: (name: string) => void;
  /**
   * Subscribes to local or cross-context changes for one template name.
   * Notifications never contain template values; call `load()` to read.
   */
  readonly onChange: (
    name: string,
    listener: (change: Readonly<BomViewTemplateStorageChange>) => void,
  ) => () => void;
}

/** Minimal storage contract so SSR and test hosts do not need DOM lib types. */
export interface BomLocalStorageLike extends BomViewTemplateStorageBackend {}

/** Minimal subset of a Window-like storage event source. */
export interface BomStorageEventSource {
  readonly addEventListener: (
    type: 'storage',
    listener: (event: Readonly<BomStorageEvent>) => void,
  ) => void;
  readonly removeEventListener: (
    type: 'storage',
    listener: (event: Readonly<BomStorageEvent>) => void,
  ) => void;
}

export interface BomStorageEvent {
  readonly key: string | null;
  readonly storageArea?: BomLocalStorageLike | null;
}

export interface BomLocalStorageTemplateScope {
  readonly appId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly schemaVersion: string;
}

export interface BomViewTemplateStorageLoadOptions {
  readonly targetSchemaVersion: string;
  readonly defaultTemplate?: Readonly<BomViewTemplate>;
  readonly migrate?: BomViewTemplateMigration;
  /** Persist only a successfully validated migration result. */
  readonly persistMigrated?: boolean;
}

export interface BomViewTemplateStorageValue {
  readonly envelope: Readonly<BomViewTemplateEnvelope>;
  readonly source: 'stored' | 'migrated' | 'default';
  readonly persisted: boolean;
}

export function createBomViewTemplateStorage(
  backend: BomViewTemplateStorageBackend,
  namespace: string,
): BomViewTemplateStorage {
  const keyFor = (name: string): string => `bom-view-template:${namespace}:${name}`;
  const listeners = new Map<
    string,
    Set<(change: Readonly<BomViewTemplateStorageChange>) => void>
  >();
  const backendSubscriptions = new Map<string, () => void>();
  const notify = (
    name: string,
    source: 'local' | 'remote',
  ): void => {
    const registered = listeners.get(name);
    if (registered === undefined) return;
    const change = Object.freeze({ name, source });
    for (const listener of [...registered]) {
      try {
        listener(change);
      } catch {
        // Host notifications are advisory and must not break storage writes.
      }
    }
  };
  return Object.freeze({
    save: (name: string, template: Readonly<BomViewTemplate>, schemaVersion: string): BomViewTemplateCodecResult<void> => {
      if (name.length === 0 || namespace.length === 0) return { ok: false, error: 'invalid-template' as const };
      const encoded = serializeBomViewTemplate(template, schemaVersion);
      if (!encoded.ok) return encoded;
      try {
        backend.setItem(keyFor(name), encoded.value);
        notify(name, 'local');
        return { ok: true as const, value: undefined };
      } catch {
        return { ok: false, error: 'invalid-template' as const };
      }
    },
    load: (name: string): BomViewTemplateCodecResult<Readonly<BomViewTemplateEnvelope>> => {
      if (name.length === 0 || namespace.length === 0) return { ok: false, error: 'invalid-template' as const };
      let raw: string | null;
      try { raw = backend.getItem(keyFor(name)); } catch { return { ok: false, error: 'invalid-template' as const }; }
      return raw === null ? { ok: false, error: 'invalid-template' as const } : parseBomViewTemplate(raw);
    },
    loadResolved: (
      name: string,
      options: Readonly<BomViewTemplateStorageLoadOptions>,
    ): BomViewTemplateCodecResult<Readonly<BomViewTemplateStorageValue>> => {
      if (
        name.length === 0 ||
        namespace.length === 0 ||
        options === null ||
        typeof options !== 'object' ||
        typeof options.targetSchemaVersion !== 'string' ||
        options.targetSchemaVersion.length === 0
      ) {
        return { ok: false, error: 'invalid-template' as const };
      }
      const fallback = (): BomViewTemplateCodecResult<Readonly<BomViewTemplateStorageValue>> => {
        if (options.defaultTemplate === undefined) {
          return { ok: false, error: 'invalid-template' as const };
        }
        const encoded = serializeBomViewTemplate(
          options.defaultTemplate,
          options.targetSchemaVersion,
        );
        if (!encoded.ok) return encoded;
        const envelope = parseBomViewTemplate(encoded.value);
        if (!envelope.ok) return envelope;
        return {
          ok: true,
          value: Object.freeze({
            envelope: envelope.value,
            source: 'default',
            persisted: false,
          }),
        };
      };
      let raw: string | null;
      try {
        raw = backend.getItem(keyFor(name));
      } catch {
        return fallback();
      }
      if (raw === null) return fallback();
      const decoded = parseBomViewTemplate(raw);
      if (!decoded.ok) return fallback();
      if (decoded.value.schemaVersion === options.targetSchemaVersion) {
        return {
          ok: true,
          value: Object.freeze({
            envelope: decoded.value,
            source: 'stored',
            persisted: true,
          }),
        };
      }
      const migrated = migrateBomViewTemplate(
        decoded.value,
        options.targetSchemaVersion,
        options.migrate,
      );
      if (!migrated.ok) return fallback();
      let persisted = false;
      if (options.persistMigrated === true) {
        const encoded = serializeBomViewTemplate(
          migrated.value.template,
          migrated.value.schemaVersion,
          migrated.value.metadata,
        );
        if (encoded.ok) {
          try {
            backend.setItem(keyFor(name), encoded.value);
            persisted = true;
          } catch {
            // Keep the original value intact when storage cannot be updated.
          }
        }
      }
      return {
        ok: true,
        value: Object.freeze({
          envelope: migrated.value,
          source: 'migrated',
          persisted,
        }),
      };
    },
    remove: (name: string): void => {
      if (name.length === 0 || namespace.length === 0) return;
      try {
        backend.removeItem(keyFor(name));
        notify(name, 'local');
      } catch {
        /* Storage quota/access errors do not break the editor. */
      }
    },
    onChange: (
      name: string,
      listener: (change: Readonly<BomViewTemplateStorageChange>) => void,
    ): (() => void) => {
      if (
        name.length === 0 ||
        namespace.length === 0 ||
        typeof listener !== 'function'
      ) {
        return () => {};
      }
      let registered = listeners.get(name);
      if (registered === undefined) {
        registered = new Set();
        listeners.set(name, registered);
        if (backend.subscribe !== undefined) {
          const subscription = backend.subscribe((changedKey) => {
            if (changedKey === keyFor(name)) notify(name, 'remote');
          });
          backendSubscriptions.set(name, subscription);
        }
      }
      registered.add(listener);
      let active = true;
      return (): void => {
        if (!active) return;
        active = false;
        const current = listeners.get(name);
        if (current === undefined) return;
        current.delete(listener);
        if (current.size !== 0) return;
        listeners.delete(name);
        backendSubscriptions.get(name)?.();
        backendSubscriptions.delete(name);
      };
    },
  });
}

/**
 * Creates a namespaced localStorage-backed template store. The key contains
 * every ownership boundary required by the public contract, and storage
 * access/quota errors retain the generic store's fail-closed behavior.
 */
export function createBomLocalStorageTemplateStorage(
  storage: BomLocalStorageLike,
  scope: Readonly<BomLocalStorageTemplateScope>,
  eventSource?: BomStorageEventSource,
): BomViewTemplateStorage {
  if (!isStorageLike(storage)) {
    throw new TypeError('BOM_TEMPLATE_STORAGE_INVALID_BACKEND');
  }
  const values = [
    scope?.appId,
    scope?.tenantId,
    scope?.userId,
    scope?.schemaVersion,
  ];
  if (values.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new TypeError('BOM_TEMPLATE_STORAGE_INVALID_SCOPE');
  }
  const prefix = [
    'bom-editor',
    'view-template',
    'v1',
    ...values.map((value) => encodeURIComponent(value)),
  ].join(':') + ':';
  const backend: BomViewTemplateStorageBackend = {
    getItem: (name: string): string | null =>
      storage.getItem(prefix + encodeURIComponent(name)),
    setItem: (name: string, value: string): void =>
      storage.setItem(prefix + encodeURIComponent(name), value),
    removeItem: (name: string): void =>
      storage.removeItem(prefix + encodeURIComponent(name)),
    ...(eventSource === undefined
      ? {}
      : {
          subscribe: (listener: (key: string | null) => void): (() => void) => {
            const onStorage = (event: Readonly<BomStorageEvent>): void => {
              if (
                event.storageArea !== undefined &&
                event.storageArea !== null &&
                event.storageArea !== storage
              ) {
                return;
              }
              if (event.key === null || event.key.startsWith(prefix)) {
                if (event.key === null) {
                  listener(null);
                } else {
                  const encodedKey = event.key.slice(prefix.length);
                  try {
                    listener(decodeURIComponent(encodedKey));
                  } catch {
                    // Malformed keys are foreign storage entries.
                  }
                }
              }
            };
            eventSource.addEventListener('storage', onStorage);
            return (): void => {
              eventSource.removeEventListener('storage', onStorage);
            };
          },
        }),
  };
  return createBomViewTemplateStorage(backend, 'default');
}

function isStorageLike(value: unknown): value is BomLocalStorageLike {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<BomLocalStorageLike>;
  return typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function';
}
