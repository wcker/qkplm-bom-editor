import type {
  BomError,
  BomErrorCategory,
  BomResult,
  BomSafeContext,
} from '@bom-editor/contracts';

export const BOM_EDITOR_ERROR_CODES = Object.freeze({
  configInvalid: 'BOM_EDITOR_CONFIG_INVALID',
  searchRegexInvalid: 'BOM_EDITOR_SEARCH_REGEX_INVALID',
  matchStale: 'BOM_EDITOR_MATCH_STALE',
  materialMatchInvalid: 'BOM_EDITOR_MATERIAL_MATCH_INVALID',
  materialMatchStale: 'BOM_EDITOR_MATERIAL_MATCH_STALE',
  materialMatchDenied: 'BOM_EDITOR_MATERIAL_MATCH_DENIED',
  materialMatchPolicy: 'BOM_EDITOR_MATERIAL_MATCH_POLICY',
  validationStale: 'BOM_EDITOR_VALIDATION_STALE',
  diffViewStale: 'BOM_EDITOR_DIFF_VIEW_STALE',
  destroyed: 'BOM_EDITOR_DESTROYED',
  alreadyMounted: 'BOM_EDITOR_ALREADY_MOUNTED',
  notMounted: 'BOM_EDITOR_NOT_MOUNTED',
  containerInvalid: 'BOM_EDITOR_CONTAINER_INVALID',
  sourceBound: 'BOM_EDITOR_SOURCE_BOUND',
  sourceReadOnly: 'BOM_EDITOR_SOURCE_READ_ONLY',
  transactionEmpty: 'BOM_EDITOR_TRANSACTION_EMPTY',
  transactionBuilderAsync: 'BOM_EDITOR_TRANSACTION_BUILDER_ASYNC',
  transactionNestedOptions: 'BOM_EDITOR_TRANSACTION_NESTED_OPTIONS',
  dataSourceQueryUnavailable: 'BOM_EDITOR_DATASOURCE_QUERY_UNAVAILABLE',
  dataSourceQueryInvalid: 'BOM_EDITOR_DATASOURCE_QUERY_INVALID',
  dataSourceQueryStale: 'BOM_EDITOR_DATASOURCE_QUERY_STALE',
  dataSourcePageInvalid: 'BOM_EDITOR_DATASOURCE_PAGE_INVALID',
  persistenceSuspended: 'BOM_EDITOR_PERSISTENCE_SUSPENDED',
  remoteProtocolViolation: 'BOM_EDITOR_REMOTE_PROTOCOL_VIOLATION',
  remoteResyncRequired: 'BOM_EDITOR_REMOTE_RESYNC_REQUIRED',
  aborted: 'BOM_EDITOR_ABORTED',
  eventDispatchFailed: 'BOM_EDITOR_EVENT_DISPATCH_FAILED',
  editInvalid: 'BOM_EDITOR_EDIT_INVALID',
  pasteInvalid: 'BOM_EDITOR_PASTE_INVALID',
  pasteLimit: 'BOM_EDITOR_PASTE_LIMIT',
  pasteTarget: 'BOM_EDITOR_PASTE_TARGET',
  pasteReadOnly: 'BOM_EDITOR_PASTE_READ_ONLY',
  pastePolicy: 'BOM_EDITOR_PASTE_POLICY',
  pasteConflict: 'BOM_EDITOR_PASTE_CONFLICT',
  importInvalid: 'BOM_EDITOR_IMPORT_INVALID',
  importLimit: 'BOM_EDITOR_IMPORT_LIMIT',
  importUnsupported: 'BOM_EDITOR_IMPORT_UNSUPPORTED',
  importConflict: 'BOM_EDITOR_IMPORT_CONFLICT',
  exportInvalid: 'BOM_EDITOR_EXPORT_INVALID',
  exportAuthRequired: 'BOM_EDITOR_EXPORT_AUTH_REQUIRED',
  exportUnsupported: 'BOM_EDITOR_EXPORT_UNSUPPORTED',
  exportPolicy: 'BOM_EDITOR_EXPORT_POLICY',
  exportLimit: 'BOM_EDITOR_EXPORT_LIMIT',
  pluginInvalid: 'BOM_EDITOR_PLUGIN_INVALID',
  pluginDenied: 'BOM_EDITOR_PLUGIN_PERMISSION_DENIED',
  pluginConflict: 'BOM_EDITOR_PLUGIN_CONFLICT',
  pluginDependency: 'BOM_EDITOR_PLUGIN_DEPENDENCY',
  pluginNotFound: 'BOM_EDITOR_PLUGIN_NOT_FOUND',
  pluginFailed: 'BOM_EDITOR_PLUGIN_FAILED',
  pluginTimeout: 'BOM_EDITOR_PLUGIN_TIMEOUT',
  fixInvalid: 'BOM_EDITOR_FIX_INVALID',
  fixStale: 'BOM_EDITOR_FIX_STALE',
  fixConflict: 'BOM_EDITOR_FIX_CONFLICT',
  branchInvalid: 'BOM_EDITOR_BRANCH_INVALID',
  branchCutConflict: 'BOM_EDITOR_BRANCH_CUT_CONFLICT',
  structureMoveInvalid: 'BOM_EDITOR_STRUCTURE_MOVE_INVALID',
  structureMoveStale: 'BOM_EDITOR_STRUCTURE_MOVE_STALE',
  cutConflict: 'BOM_EDITOR_CUT_CONFLICT',
  deleteInvalid: 'BOM_EDITOR_DELETE_INVALID',
  deleteConflict: 'BOM_EDITOR_DELETE_CONFLICT',
  fillDownInvalid: 'BOM_EDITOR_FILL_DOWN_INVALID',
  fillDownConflict: 'BOM_EDITOR_FILL_DOWN_CONFLICT',
  fillSelectionInvalid: 'BOM_EDITOR_FILL_SELECTION_INVALID',
  fillSelectionConflict: 'BOM_EDITOR_FILL_SELECTION_CONFLICT',
  rendererFailed: 'BOM_EDITOR_RENDERER_FAILED',
  internal: 'BOM_EDITOR_INTERNAL',
} as const);

export type BomEditorErrorCode =
  (typeof BOM_EDITOR_ERROR_CODES)[keyof typeof BOM_EDITOR_ERROR_CODES];

export function editorError(
  code: BomEditorErrorCode,
  category: BomErrorCategory,
  context?: BomSafeContext,
): BomError {
  return Object.freeze({
    code,
    category,
    messageKey: 'bom.editor.' + code.toLowerCase(),
    recoverable: category !== 'INTERNAL',
    ...(context === undefined
      ? {}
      : { safeContext: Object.freeze({ ...context }) }),
  });
}

export function editorSuccess<T>(value: T): BomResult<T> {
  return Object.freeze({ ok: true, value });
}

export function editorFailure<T>(error: BomError): BomResult<T> {
  return Object.freeze({ ok: false, error });
}

export class BomEditorConfigurationError extends Error {
  readonly error: BomError;

  public constructor(error: BomError) {
    super(error.code);
    this.name = 'BomEditorConfigurationError';
    this.error = error;
  }
}
