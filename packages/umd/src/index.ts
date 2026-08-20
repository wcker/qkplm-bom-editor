import {
  createBomEditor,
  createBomEditorComponent,
} from '@qkplm/bom-editor';

export { createBomEditor, createBomEditorComponent };

export const BOM_EDITOR_UMD_PROTOCOL = 'bom-editor-umd/v1';
export const QKPLM_BOM_EDITOR_VERSION = '1.0.0-rc.1';
/** Properties exposed directly by the `QkplmBomEditor` UMD global. */
export const protocol = BOM_EDITOR_UMD_PROTOCOL;
export const version = QKPLM_BOM_EDITOR_VERSION;

export interface BomEditorUmdNamespace {
  readonly protocol: typeof BOM_EDITOR_UMD_PROTOCOL;
  readonly version: string;
  readonly createBomEditor: typeof createBomEditor;
  readonly createBomEditorComponent: typeof createBomEditorComponent;
}

/** Public namespace used by a bundler's UMD wrapper or a script-tag host. */
export function createBomEditorUmdNamespace(
  version = QKPLM_BOM_EDITOR_VERSION,
): BomEditorUmdNamespace {
  if (typeof version !== 'string' || version.length === 0) {
    throw new TypeError('BOM_EDITOR_UMD_INVALID_VERSION');
  }
  return Object.freeze({
    protocol,
    version,
    createBomEditor,
    createBomEditorComponent,
  });
}

/** Installs the namespace exactly once on an explicitly supplied global. */
export function installBomEditorUmd(
  target: Record<string, unknown>,
  options: Readonly<{ readonly globalName?: string; readonly version?: string }> = {},
): BomEditorUmdNamespace {
  if (target === null || typeof target !== 'object') {
    throw new TypeError('BOM_EDITOR_UMD_INVALID_TARGET');
  }
  const globalName = options.globalName ?? 'QkplmBomEditor';
  if (globalName.length === 0) {
    throw new TypeError('BOM_EDITOR_UMD_INVALID_NAME');
  }
  const existing = target[globalName];
  if (existing !== undefined) {
    if (isNamespace(existing)) return existing;
    throw new TypeError('BOM_EDITOR_UMD_GLOBAL_CONFLICT');
  }
  const namespace = createBomEditorUmdNamespace(options.version);
  Object.defineProperty(target, globalName, {
    configurable: false,
    enumerable: true,
    value: namespace,
    writable: false,
  });
  return namespace;
}

export type {
  BomEditor,
  BomEditorComponent,
  BomEditorComponentProps,
  BomEditorComponentUpdate,
} from '@qkplm/bom-editor';

function isNamespace(value: unknown): value is BomEditorUmdNamespace {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<BomEditorUmdNamespace>;
  return candidate.protocol === BOM_EDITOR_UMD_PROTOCOL &&
    typeof candidate.version === 'string' &&
    typeof candidate.createBomEditor === 'function' &&
    typeof candidate.createBomEditorComponent === 'function';
}
