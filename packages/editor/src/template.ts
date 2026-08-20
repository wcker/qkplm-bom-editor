import type { BomValue } from '@bom-editor/contracts';
import type { BomViewTemplate } from './types.js';

export const BOM_VIEW_TEMPLATE_PROTOCOL = 'bom-view-template/v1';

export interface BomViewTemplateEnvelope {
  readonly protocol: typeof BOM_VIEW_TEMPLATE_PROTOCOL;
  readonly schemaVersion: string;
  readonly template: Readonly<BomViewTemplate>;
  readonly metadata?: Readonly<Record<string, BomValue>>;
}

/** A deterministic, pure template migration supplied by the host. */
export type BomViewTemplateMigration = (
  template: Readonly<BomViewTemplate>,
  fromSchemaVersion: string,
  toSchemaVersion: string,
) => Readonly<BomViewTemplate> | null | undefined;

export type BomViewTemplateCodecResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error:
        | 'invalid-template'
        | 'invalid-json'
        | 'unsupported-protocol'
        | 'migration-failed';
    };

export function serializeBomViewTemplate(
  template: Readonly<BomViewTemplate>,
  schemaVersion: string,
  metadata?: Readonly<Record<string, BomValue>>,
): BomViewTemplateCodecResult<string> {
  if (!isTemplate(template) || typeof schemaVersion !== 'string' || schemaVersion.length === 0) {
    return { ok: false, error: 'invalid-template' };
  }
  const envelope: BomViewTemplateEnvelope = Object.freeze({
    protocol: BOM_VIEW_TEMPLATE_PROTOCOL,
    schemaVersion,
    template: Object.freeze({
      columns: Object.freeze(template.columns.map((column) => Object.freeze({ ...column }))),
      ...(template.query === undefined ? {} : { query: Object.freeze({ ...template.query }) }),
    }),
    ...(metadata === undefined ? {} : { metadata: Object.freeze({ ...metadata }) }),
  });
  try {
    return { ok: true, value: JSON.stringify(envelope) };
  } catch {
    return { ok: false, error: 'invalid-template' };
  }
}

export function parseBomViewTemplate(input: string): BomViewTemplateCodecResult<Readonly<BomViewTemplateEnvelope>> {
  if (typeof input !== 'string') return { ok: false, error: 'invalid-json' };
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { return { ok: false, error: 'invalid-json' }; }
  if (!isRecord(parsed) || parsed['protocol'] !== BOM_VIEW_TEMPLATE_PROTOCOL) return { ok: false, error: 'unsupported-protocol' };
  if (typeof parsed['schemaVersion'] !== 'string' || !isTemplate(parsed['template'])) return { ok: false, error: 'invalid-template' };
  return { ok: true, value: Object.freeze(parsed as unknown as BomViewTemplateEnvelope) };
}

/**
 * Applies one host-provided migration without mutating the source envelope.
 * The migrated result is re-encoded and parsed so the returned value has the
 * same validation and freezing guarantees as a normal decode.
 */
export function migrateBomViewTemplate(
  envelope: Readonly<BomViewTemplateEnvelope>,
  targetSchemaVersion: string,
  migration?: BomViewTemplateMigration,
): BomViewTemplateCodecResult<Readonly<BomViewTemplateEnvelope>> {
  if (
    !isEnvelope(envelope) ||
    typeof targetSchemaVersion !== 'string' ||
    targetSchemaVersion.length === 0
  ) {
    return { ok: false, error: 'invalid-template' };
  }
  if (envelope.schemaVersion === targetSchemaVersion) {
    return { ok: true, value: envelope };
  }
  if (migration === undefined) {
    return { ok: false, error: 'migration-failed' };
  }
  let migrated: Readonly<BomViewTemplate> | null | undefined;
  try {
    migrated = migration(
      envelope.template,
      envelope.schemaVersion,
      targetSchemaVersion,
    );
  } catch {
    return { ok: false, error: 'migration-failed' };
  }
  if (migrated === null || migrated === undefined || !isTemplate(migrated)) {
    return { ok: false, error: 'migration-failed' };
  }
  const encoded = serializeBomViewTemplate(
    migrated,
    targetSchemaVersion,
    envelope.metadata,
  );
  if (!encoded.ok) return { ok: false, error: 'migration-failed' };
  const decoded = parseBomViewTemplate(encoded.value);
  return decoded.ok
    ? decoded
    : { ok: false, error: 'migration-failed' };
}

function isTemplate(value: unknown): value is BomViewTemplate {
  if (!isRecord(value) || !Array.isArray(value['columns']) || value['columns'].length === 0) {
    return false;
  }
  const ids = new Set<string>();
  return value['columns'].every((column) => {
    if (
      !isRecord(column) ||
      typeof column['columnId'] !== 'string' ||
      column['columnId'].length === 0 ||
      ids.has(column['columnId']) ||
      typeof column['label'] !== 'string' ||
      column['label'].length === 0 ||
      (column['fieldName'] !== undefined &&
        (typeof column['fieldName'] !== 'string' || column['fieldName'].length === 0)) ||
      !Array.isArray(column['fieldPath']) ||
      column['fieldPath'].length === 0 ||
      column['fieldPath'].some((part) => typeof part !== 'string' || part.length === 0) ||
      typeof column['width'] !== 'number' ||
      !Number.isFinite(column['width']) ||
      column['width'] <= 0 ||
      typeof column['editable'] !== 'boolean' ||
      (column['frozen'] !== false && column['frozen'] !== 'start' && column['frozen'] !== 'end') ||
      (column['headerGroup'] !== undefined &&
        (!Array.isArray(column['headerGroup']) ||
          column['headerGroup'].some((part) => typeof part !== 'string')))
    ) {
      return false;
    }
    ids.add(column['columnId']);
    return true;
  });
}

function isEnvelope(value: unknown): value is BomViewTemplateEnvelope {
  return isRecord(value) &&
    value['protocol'] === BOM_VIEW_TEMPLATE_PROTOCOL &&
    typeof value['schemaVersion'] === 'string' &&
    value['schemaVersion'].length > 0 &&
    isTemplate(value['template']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
