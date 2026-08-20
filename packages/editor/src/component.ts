import type {
  BomDocumentSnapshot,
  BomFields,
  BomResult,
  BomSchema,
} from '@bom-editor/contracts';
import {
  normalizeBomDocumentSnapshot,
  normalizeBomSchema,
} from '@bom-editor/model';
import type { BomColumnDefinition } from '@bom-editor/runtime';
import { normalizeEditorColumns } from './columns.js';
import { createBomEditor, normalizeEditorDiffView } from './editor.js';
import {
  BOM_EDITOR_ERROR_CODES,
  BomEditorConfigurationError,
  editorError,
  editorFailure,
  editorSuccess,
} from './errors.js';
import type {
  BomEditor,
  BomEditorComponent,
  BomEditorComponentOutputs,
  BomEditorComponentProps,
  BomEditorComponentUpdate,
  BomEditorOptions,
  BomCanvasDiffView,
  BomStructureMoveRequest,
  BomExportOptions,
  BomImportOptions,
  BomImportSource,
  BomViewTemplate,
  VisibleQueryOptions,
} from './types.js';

const EMPTY_OUTPUTS: Readonly<BomEditorComponentOutputs> = Object.freeze({});
const COMPONENT_OUTPUT_KEYS = Object.freeze([
  'onDocumentChange',
  'onDocumentReplaced',
  'onStructureMoveRequest',
  'onSelectionChange',
  'onViewChange',
  'onEditStart',
  'onDraftChange',
  'onEditEnd',
  'onEditRejected',
  'onPaste',
  'onValidationChange',
  'onMaterialMatchAudit',
  'onClipboardCompleted',
  'onClipboardRejected',
  'onTaskProgress',
  'onError',
] as const);
const COMPONENT_PROP_KEYS = new Set<PropertyKey>([
  'schema',
  'columns',
  'document',
  'diffView',
  'outputs',
  'instanceId',
  'protocolVersion',
  'initialView',
  'rowHeight',
  'expandedIds',
  'expandAll',
  'history',
  'clipboardPolicy',
  'exportPolicy',
  'pastePolicy',
  'pasteLimits',
  'editNavigation',
  'shortcuts',
  'plugins',
  'pluginGrantPolicy',
  'pluginHostConfiguration',
  'matchApprovalPolicy',
  'logger',
  'renderer',
]);
const COMPONENT_UPDATE_KEYS = new Set<PropertyKey>([
  'document',
  'structureMoveRequestId',
  'columns',
  'diffView',
  'outputs',
]);
const COMPONENT_OUTPUT_KEY_SET = new Set<PropertyKey>(COMPONENT_OUTPUT_KEYS);

/**
 * Creates the browser-facing Props/Outputs facade without exposing a
 * DataSource. The underlying editor retains its normal local interaction
 * state; `update()` only adopts a different externally supplied document.
 */
export function createBomEditorComponent<
  TFields extends BomFields = BomFields,
>(
  props: Readonly<BomEditorComponentProps<TFields>>,
): BomEditorComponent<TFields> {
  const normalized = normalizeComponentProps<TFields>(props);
  if (!normalized.ok) {
    throw new BomEditorConfigurationError(normalized.error);
  }
  const editor = createBomEditor<TFields>(normalized.value.editorOptions);
  if (normalized.value.diffView !== undefined) {
    const configured = editor.setDiffView(normalized.value.diffView);
    if (!configured.ok) {
      editor.destroy();
      throw new BomEditorConfigurationError(configured.error);
    }
  }
  return new BomEditorComponentImpl(
    editor,
    normalized.value.schema,
    normalized.value.outputs,
  );
}

class BomEditorComponentImpl<TFields extends BomFields>
  implements BomEditorComponent<TFields> {
  public readonly instanceId: string;
  public readonly ready: Promise<BomResult<void>>;

  readonly #editor: BomEditor<TFields>;
  readonly #schema: BomSchema;
  readonly #unsubscribe: readonly (() => void)[];
  #outputs: Readonly<BomEditorComponentOutputs<TFields>>;
  #updateTail: Promise<void> = Promise.resolve();
  #pendingOutputs: (() => void)[] = [];
  readonly #pendingStructureMoveRequests = new Map<
    string,
    Readonly<BomStructureMoveRequest>
  >();
  #outputDrainScheduled = false;
  #destroyed = false;

  public constructor(
    editor: BomEditor<TFields>,
    schema: BomSchema,
    outputs: Readonly<BomEditorComponentOutputs<TFields>>,
  ) {
    this.#editor = editor;
    this.#schema = schema;
    this.instanceId = editor.instanceId;
    this.ready = editor.ready;
    this.#outputs = outputs;
    this.#unsubscribe = Object.freeze([
      editor.on('documentReplaced', (event) => {
        const listener = this.#outputs.onDocumentReplaced;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('structureMoveRequested', (event) => {
        this.#pendingStructureMoveRequests.set(
          event.request.requestId,
          event.request,
        );
        const listener = this.#outputs.onStructureMoveRequest;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('transactionCommitted', (event) => {
        const listener = this.#outputs.onDocumentChange;
        if (listener === undefined) return;
        const change = Object.freeze({
          snapshot: this.#editor.getSnapshot(),
          commit: event.commit,
          patch: event.patch,
          origin: event.origin,
        });
        this.#enqueueOutput(() => listener(change));
      }),
      editor.on('selectionChanged', (event) => {
        const listener = this.#outputs.onSelectionChange;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('viewChanged', (event) => {
        const listener = this.#outputs.onViewChange;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('editStart', (event) => {
        const listener = this.#outputs.onEditStart;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('valueChanged', (event) => {
        const listener = this.#outputs.onDraftChange;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('editEnd', (event) => {
        const listener = this.#outputs.onEditEnd;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('commitRejected', (event) => {
        const listener = this.#outputs.onEditRejected;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('pasteOperation', (event) => {
        const listener = this.#outputs.onPaste;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('validationChanged', (event) => {
        const listener = this.#outputs.onValidationChange;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('materialMatchAudit', (event) => {
        const listener = this.#outputs.onMaterialMatchAudit;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('clipboardCompleted', (event) => {
        const listener = this.#outputs.onClipboardCompleted;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('clipboardRejected', (event) => {
        const listener = this.#outputs.onClipboardRejected;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('taskProgress', (event) => {
        const listener = this.#outputs.onTaskProgress;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
      editor.on('error', (event) => {
        const listener = this.#outputs.onError;
        if (listener !== undefined) {
          this.#enqueueOutput(() => listener(event));
        }
      }),
    ]);
  }

  public mount(container: HTMLElement): Promise<BomResult<void>> {
    return this.#editor.mount(container);
  }

  public unmount(): BomResult<void> {
    return this.#editor.unmount();
  }

  public update(
    input: Readonly<BomEditorComponentUpdate<TFields>>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BomResult<void>> {
    if (this.#destroyed) {
      return Promise.resolve(
        editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'),
        ),
      );
    }
    const normalized = normalizeComponentUpdate<TFields>(input, this.#schema);
    if (!normalized.ok) {
      return Promise.resolve(editorFailure(normalized.error));
    }
    if (options.signal?.aborted) {
      return Promise.resolve(
        editorFailure(editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED')),
      );
    }
    return this.#enqueueUpdate(normalized.value, options);
  }

  public focus(): BomResult<void> {
    return this.#editor.focus();
  }

  public blur(): BomResult<void> {
    return this.#editor.blur();
  }

  public configureShortcuts(
    options: Parameters<BomEditor<TFields>['configureShortcuts']>[0],
  ): ReturnType<BomEditor<TFields>['configureShortcuts']> {
    return this.#editor.configureShortcuts(options);
  }

  public resetShortcuts(): ReturnType<BomEditor<TFields>['resetShortcuts']> {
    return this.#editor.resetShortcuts();
  }

  public configurePresentation(
    options: Parameters<BomEditor<TFields>['configurePresentation']>[0],
  ): ReturnType<BomEditor<TFields>['configurePresentation']> {
    return this.#editor.configurePresentation(options);
  }

  public getPresentation(): ReturnType<BomEditor<TFields>['getPresentation']> {
    return this.#editor.getPresentation();
  }

  public announce(
    announcement: Parameters<BomEditor<TFields>['announce']>[0],
  ): ReturnType<BomEditor<TFields>['announce']> {
    return this.#editor.announce(announcement);
  }

  public setDiffView(
    diffView: Readonly<BomCanvasDiffView> | null,
  ): ReturnType<BomEditor<TFields>['setDiffView']> {
    return this.#editor.setDiffView(diffView);
  }

  public installPlugin(
    plugin: Parameters<BomEditor<TFields>['installPlugin']>[0],
    options?: Parameters<BomEditor<TFields>['installPlugin']>[1],
  ): ReturnType<BomEditor<TFields>['installPlugin']> {
    return this.#editor.installPlugin(plugin, options);
  }

  public uninstallPlugin(
    pluginId: string,
  ): ReturnType<BomEditor<TFields>['uninstallPlugin']> {
    return this.#editor.uninstallPlugin(pluginId);
  }

  public reloadPlugin(
    pluginId: string,
    replacement: Parameters<BomEditor<TFields>['reloadPlugin']>[1],
    options?: Parameters<BomEditor<TFields>['reloadPlugin']>[2],
  ): ReturnType<BomEditor<TFields>['reloadPlugin']> {
    return this.#editor.reloadPlugin(pluginId, replacement, options);
  }

  public getPlugins(): ReturnType<BomEditor<TFields>['getPlugins']> {
    return this.#editor.getPlugins();
  }

  public proposeFix(
    pluginId: string,
    issue: Parameters<BomEditor<TFields>['proposeFix']>[1],
    options?: Parameters<BomEditor<TFields>['proposeFix']>[2],
  ): ReturnType<BomEditor<TFields>['proposeFix']> {
    return this.#editor.proposeFix(pluginId, issue, options);
  }

  public applyFix(
    proposal: Parameters<BomEditor<TFields>['applyFix']>[0],
    options?: Parameters<BomEditor<TFields>['applyFix']>[1],
  ): ReturnType<BomEditor<TFields>['applyFix']> {
    return this.#editor.applyFix(proposal, options);
  }

  public executePluginCommand(
    pluginId: string,
    commandId: string,
    payload?: unknown,
    options?: Parameters<BomEditor<TFields>['executePluginCommand']>[3],
  ): ReturnType<BomEditor<TFields>['executePluginCommand']> {
    return this.#editor.executePluginCommand(pluginId, commandId, payload, options);
  }

  public setColumns(
    columns: readonly BomColumnDefinition[],
  ): ReturnType<BomEditor<TFields>['setColumns']> {
    return this.#editor.setColumns(columns);
  }

  public setRowHeight(
    occurrenceId: Parameters<BomEditor<TFields>['setRowHeight']>[0],
    rowHeight: Parameters<BomEditor<TFields>['setRowHeight']>[1],
  ): ReturnType<BomEditor<TFields>['setRowHeight']> {
    return this.#editor.setRowHeight(occurrenceId, rowHeight);
  }

  public setViewQuery(
    options?: Readonly<VisibleQueryOptions>,
  ): ReturnType<BomEditor<TFields>['setViewQuery']> {
    return this.#editor.setViewQuery(options);
  }

  public getViewTemplate(): Readonly<BomViewTemplate> {
    return this.#editor.getViewTemplate();
  }

  public applyViewTemplate(template: Readonly<BomViewTemplate>): ReturnType<BomEditor<TFields>['applyViewTemplate']> {
    return this.#editor.applyViewTemplate(template);
  }

  public fillSeries(): void {
    this.#editor.fillSeries();
  }

  public setColumnFrozen(
    columnId: string,
    frozen: Parameters<BomEditor<TFields>['setColumnFrozen']>[1],
  ): ReturnType<BomEditor<TFields>['setColumnFrozen']> {
    return this.#editor.setColumnFrozen(columnId, frozen);
  }

  public insertColumn(
    referenceColumnId: string,
    position?: Parameters<BomEditor<TFields>['insertColumn']>[1],
    count?: Parameters<BomEditor<TFields>['insertColumn']>[2],
  ): ReturnType<BomEditor<TFields>['insertColumn']> {
    return this.#editor.insertColumn(referenceColumnId, position, count);
  }

  public deleteColumns(
    columnIds: readonly string[],
  ): ReturnType<BomEditor<TFields>['deleteColumns']> {
    return this.#editor.deleteColumns(columnIds);
  }

  public search(
    request: Parameters<BomEditor<TFields>['search']>[0],
    options?: Parameters<BomEditor<TFields>['search']>[1],
  ): ReturnType<BomEditor<TFields>['search']> {
    return this.#editor.search(request, options);
  }

  public matchMaterials(
    request: Parameters<BomEditor<TFields>['matchMaterials']>[0],
    options?: Parameters<BomEditor<TFields>['matchMaterials']>[1],
  ): ReturnType<BomEditor<TFields>['matchMaterials']> {
    return this.#editor.matchMaterials(request, options);
  }

  public proposeMaterialMatch(
    targetOccurrenceId: Parameters<BomEditor<TFields>['proposeMaterialMatch']>[0],
    candidate: Parameters<BomEditor<TFields>['proposeMaterialMatch']>[1],
  ): ReturnType<BomEditor<TFields>['proposeMaterialMatch']> {
    return this.#editor.proposeMaterialMatch(targetOccurrenceId, candidate);
  }

  public applyMaterialMatch(
    proposal: Parameters<BomEditor<TFields>['applyMaterialMatch']>[0],
    options?: Parameters<BomEditor<TFields>['applyMaterialMatch']>[1],
  ): ReturnType<BomEditor<TFields>['applyMaterialMatch']> {
    return this.#editor.applyMaterialMatch(proposal, options);
  }

  public validate(
    options?: Parameters<BomEditor<TFields>['validate']>[0],
  ): ReturnType<BomEditor<TFields>['validate']> {
    return this.#editor.validate(options);
  }

  public focusCell(
    address: Parameters<BomEditor<TFields>['focusCell']>[0],
  ): ReturnType<BomEditor<TFields>['focusCell']> {
    return this.#editor.focusCell(address);
  }

  public previewPaste(
    input: Parameters<BomEditor<TFields>['previewPaste']>[0],
    options?: Parameters<BomEditor<TFields>['previewPaste']>[1],
  ): ReturnType<BomEditor<TFields>['previewPaste']> {
    return this.#editor.previewPaste(input, options);
  }

  public importData(
    source: BomImportSource,
    options: Readonly<BomImportOptions>,
  ): ReturnType<BomEditor<TFields>['importData']> {
    return this.#editor.importData(source, options);
  }

  public exportData(
    options: Readonly<BomExportOptions>,
  ): ReturnType<BomEditor<TFields>['exportData']> {
    return this.#editor.exportData(options);
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#outputs = EMPTY_OUTPUTS as Readonly<BomEditorComponentOutputs<TFields>>;
    this.#pendingOutputs.length = 0;
    this.#pendingStructureMoveRequests.clear();
    this.#outputDrainScheduled = false;
    for (const unsubscribe of this.#unsubscribe) {
      unsubscribe();
    }
    this.#editor.destroy();
  }

  #enqueueOutput(callback: () => void): void {
    if (this.#destroyed) return;
    this.#pendingOutputs.push(callback);
    this.#scheduleOutputDrain();
  }

  #enqueueUpdate(
    update: Readonly<NormalizedComponentUpdate<TFields>>,
    options: { readonly signal?: AbortSignal },
  ): Promise<BomResult<void>> {
    const result = this.#updateTail.then(async (): Promise<BomResult<void>> => {
      if (this.#destroyed) {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.destroyed, 'CONFIG'),
        );
      }
      if (options.signal?.aborted) {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.aborted, 'ABORTED'),
        );
      }
      const requestId = update.structureMoveRequestId;
      if (requestId !== undefined) {
        const request = this.#pendingStructureMoveRequests.get(requestId);
        const current = this.#editor.getSnapshot();
        if (
          request === undefined ||
          current.documentId !== request.documentId ||
          current.revision !== request.baseRevision ||
          update.document.documentId !== request.documentId ||
          update.document.revision === request.baseRevision
        ) {
          return editorFailure(
            editorError(BOM_EDITOR_ERROR_CODES.structureMoveStale, 'CONFLICT'),
          );
        }
      }
      if (update.outputs !== undefined) {
        this.#outputs = update.outputs;
      }
      if (!sameDocumentVersion(this.#editor.getSnapshot(), update.document)) {
        const document = await this.#editor.setDocument(update.document, options);
        if (!document.ok) {
          return document;
        }
        if (requestId === undefined) {
          this.#pendingStructureMoveRequests.clear();
        } else {
          this.#pendingStructureMoveRequests.delete(requestId);
        }
      }
      if (update.columns !== undefined) {
        const columns = this.#editor.setColumns(update.columns);
        if (!columns.ok) {
          return columns;
        }
      }
      if (update.diffView !== undefined) {
        const diffView = this.#editor.setDiffView(update.diffView);
        if (!diffView.ok) {
          return diffView;
        }
      }
      return editorSuccess(undefined);
    });
    this.#updateTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #scheduleOutputDrain(): void {
    if (
      this.#destroyed ||
      this.#outputDrainScheduled ||
      this.#pendingOutputs.length === 0
    ) return;
    this.#outputDrainScheduled = true;
    queueMicrotask(() => this.#drainOutputs());
  }

  #drainOutputs(): void {
    this.#outputDrainScheduled = false;
    if (this.#destroyed) {
      this.#pendingOutputs.length = 0;
      return;
    }
    const pending = this.#pendingOutputs;
    this.#pendingOutputs = [];
    for (const callback of pending) {
      if (this.#destroyed) {
        this.#pendingOutputs.length = 0;
        return;
      }
      invokeOutput(callback);
    }
    this.#scheduleOutputDrain();
  }
}

interface NormalizedComponentProps<TFields extends BomFields> {
  readonly editorOptions: BomEditorOptions<TFields>;
  readonly outputs: Readonly<BomEditorComponentOutputs<TFields>>;
  readonly schema: BomSchema;
  readonly diffView?: Readonly<BomCanvasDiffView> | null;
}

interface NormalizedComponentUpdate<TFields extends BomFields> {
  readonly document: BomDocumentSnapshot<TFields>;
  readonly structureMoveRequestId?: string;
  readonly columns?: readonly Readonly<BomColumnDefinition>[];
  readonly diffView?: Readonly<BomCanvasDiffView> | null;
  readonly outputs?: Readonly<BomEditorComponentOutputs<TFields>>;
}

function normalizeComponentProps<TFields extends BomFields>(
  input: unknown,
): BomResult<Readonly<NormalizedComponentProps<TFields>>> {
  try {
    if (!isObjectRecord(input)) {
      return componentConfigurationFailure('componentProps');
    }
    if ('dataSource' in input) {
      return componentConfigurationFailure('dataSource');
    }
    if (!hasOnlyKeys(input, COMPONENT_PROP_KEYS)) {
      return componentConfigurationFailure('componentProps');
    }
    const props = input as Readonly<BomEditorComponentProps<TFields>>;
    const schema = normalizeBomSchema(props.schema);
    if (!schema.ok) {
      return editorFailure(schema.errors[0]!);
    }
    const document = normalizeBomDocumentSnapshot<TFields>(
      props.document,
      schema.value,
    );
    if (!document.ok) {
      return editorFailure(document.errors[0]!);
    }
    const outputs = normalizeOutputs<TFields>(props.outputs);
    if (outputs === null) {
      return componentConfigurationFailure('outputs');
    }
    const editorOptions = createComponentEditorOptions(
      props,
      schema.value,
      document.value,
    );
    return editorSuccess(Object.freeze({
      editorOptions,
      outputs,
      schema: schema.value,
      ...(hasOwn(input, 'diffView')
        ? { diffView: props.diffView ?? null }
        : {}),
    }));
  } catch {
    return componentConfigurationFailure('componentProps');
  }
}

function createComponentEditorOptions<TFields extends BomFields>(
  props: Readonly<BomEditorComponentProps<TFields>>,
  schema: BomSchema,
  document: BomDocumentSnapshot<TFields>,
): BomEditorOptions<TFields> {
  return {
    schema,
    columns: props.columns,
    initialDocument: document,
    ...(props.instanceId === undefined ? {} : { instanceId: props.instanceId }),
    ...(props.protocolVersion === undefined
      ? {}
      : { protocolVersion: props.protocolVersion }),
    ...(props.initialView === undefined
      ? {}
      : { initialView: props.initialView }),
    ...(props.rowHeight === undefined ? {} : { rowHeight: props.rowHeight }),
    ...(props.expandedIds === undefined
      ? {}
      : { expandedIds: props.expandedIds }),
    ...(props.expandAll === undefined ? {} : { expandAll: props.expandAll }),
    ...(props.history === undefined ? {} : { history: props.history }),
    ...(props.clipboardPolicy === undefined
      ? {}
      : { clipboardPolicy: props.clipboardPolicy }),
    ...(props.exportPolicy === undefined
      ? {}
      : { exportPolicy: props.exportPolicy }),
    ...(props.pastePolicy === undefined
      ? {}
      : { pastePolicy: props.pastePolicy }),
    ...(props.pasteLimits === undefined
      ? {}
      : { pasteLimits: props.pasteLimits }),
    ...(props.editNavigation === undefined
      ? {}
      : { editNavigation: props.editNavigation }),
    ...(props.shortcuts === undefined
      ? {}
      : { shortcuts: props.shortcuts }),
    ...(props.plugins === undefined ? {} : { plugins: props.plugins }),
    ...(props.pluginGrantPolicy === undefined
      ? {}
      : { pluginGrantPolicy: props.pluginGrantPolicy }),
    ...(props.pluginHostConfiguration === undefined
      ? {}
      : { pluginHostConfiguration: props.pluginHostConfiguration }),
    ...(props.matchApprovalPolicy === undefined
      ? {}
      : { matchApprovalPolicy: props.matchApprovalPolicy }),
    ...(props.logger === undefined ? {} : { logger: props.logger }),
    ...(props.renderer === undefined ? {} : { renderer: props.renderer }),
  };
}

function normalizeComponentUpdate<TFields extends BomFields>(
  input: unknown,
  schema: BomSchema,
): BomResult<Readonly<NormalizedComponentUpdate<TFields>>> {
  try {
    if (
      !isObjectRecord(input) ||
      !hasOwn(input, 'document') ||
      !hasOnlyKeys(input, COMPONENT_UPDATE_KEYS)
    ) {
      return componentConfigurationFailure('componentUpdate');
    }
    const candidate = input as {
      readonly document: unknown;
      readonly structureMoveRequestId?: unknown;
      readonly columns?: unknown;
      readonly diffView?: unknown;
      readonly outputs?: unknown;
    };
    const document = normalizeBomDocumentSnapshot<TFields>(
      candidate.document,
      schema,
    );
    if (!document.ok) {
      return editorFailure(document.errors[0]!);
    }
    let structureMoveRequestId: string | undefined;
    if (hasOwn(input, 'structureMoveRequestId')) {
      if (
        typeof candidate.structureMoveRequestId !== 'string' ||
        candidate.structureMoveRequestId.length === 0
      ) {
        return editorFailure(
          editorError(BOM_EDITOR_ERROR_CODES.structureMoveInvalid, 'CONFIG', {
            option: 'structureMoveRequestId',
          }),
        );
      }
      structureMoveRequestId = candidate.structureMoveRequestId;
    }
    let columns: readonly Readonly<BomColumnDefinition>[] | undefined;
    if (hasOwn(input, 'columns')) {
      const normalizedColumns = normalizeEditorColumns(
        candidate.columns as readonly BomColumnDefinition[],
        schema,
      );
      if (!normalizedColumns.ok) {
        return editorFailure(normalizedColumns.error);
      }
      columns = normalizedColumns.value;
    }
    let diffView: Readonly<BomCanvasDiffView> | null | undefined;
    if (hasOwn(input, 'diffView')) {
      const rawDiffView = (candidate.diffView ?? null) as Readonly<BomCanvasDiffView> | null;
      diffView = normalizeEditorDiffView(rawDiffView);
      if (diffView === null && rawDiffView !== null) {
        return componentConfigurationFailure('diffView');
      }
    }
    if (!hasOwn(input, 'outputs')) {
      return editorSuccess(Object.freeze({
        document: document.value,
        ...(structureMoveRequestId === undefined ? {} : { structureMoveRequestId }),
        ...(columns === undefined ? {} : { columns }),
        ...(diffView === undefined ? {} : { diffView }),
      }));
    }
    const outputs = normalizeOutputs<TFields>(candidate.outputs);
    if (outputs === null) {
      return componentConfigurationFailure('outputs');
    }
    return editorSuccess(Object.freeze({
      document: document.value,
      ...(structureMoveRequestId === undefined ? {} : { structureMoveRequestId }),
      ...(columns === undefined ? {} : { columns }),
      ...(diffView === undefined ? {} : { diffView }),
      outputs,
    }));
  } catch {
    return componentConfigurationFailure('componentUpdate');
  }
}

function normalizeOutputs<TFields extends BomFields>(
  input: unknown,
): Readonly<BomEditorComponentOutputs<TFields>> | null {
  if (input === undefined) {
    return EMPTY_OUTPUTS as Readonly<BomEditorComponentOutputs<TFields>>;
  }
  if (!isObjectRecord(input)) {
    return null;
  }
  try {
    if (!hasOnlyKeys(input, COMPONENT_OUTPUT_KEY_SET)) {
      return null;
    }
    const candidate = input as Readonly<Record<string, unknown>>;
    const outputs: Record<string, unknown> = {};
    for (const key of COMPONENT_OUTPUT_KEYS) {
      if (!hasOwn(candidate, key)) continue;
      const listener = candidate[key];
      if (listener === undefined) continue;
      if (typeof listener !== 'function') return null;
      outputs[key] = listener;
    }
    return Object.freeze(outputs) as Readonly<BomEditorComponentOutputs<TFields>>;
  } catch {
    return null;
  }
}

function sameDocumentVersion<TFields extends BomFields>(
  left: Readonly<BomDocumentSnapshot<TFields>>,
  right: Readonly<BomDocumentSnapshot<TFields>>,
): boolean {
  return left === right || (
    left.documentId === right.documentId && left.revision === right.revision
  );
}

function isObjectRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKeys(
  input: object,
  allowed: ReadonlySet<PropertyKey>,
): boolean {
  return Reflect.ownKeys(input).every((key) => allowed.has(key));
}

function invokeOutput(callback: () => void): void {
  try {
    const result = callback() as unknown;
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(() => undefined);
    }
  } catch {
    // Component output failures must not interrupt the editor or other outputs.
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  try {
    return (
      (typeof value === 'object' || typeof value === 'function') &&
      value !== null &&
      typeof (value as { readonly then?: unknown }).then === 'function'
    );
  } catch {
    return false;
  }
}

function componentConfigurationFailure<T>(option: string): BomResult<T> {
  return editorFailure(
    editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', { option }),
  );
}
