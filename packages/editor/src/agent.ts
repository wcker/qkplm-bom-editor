import {
  BOM_AGENT_CAPABILITY_PROTOCOL,
  agentCapabilityError,
  type BomAgentAuthorizationPolicy,
  type BomAgentCapability,
  type BomAgentCapabilityDescriptor,
  type BomAgentDocumentTarget,
  type BomAgentJsonSchema,
  type BomAgentPermission,
  type BomAgentRequest,
  type BomAgentResponse,
  type BomError,
  type BomFields,
  type BomResult,
  type BomValue,
} from '@bom-editor/contracts';
import type {
  BomCommand,
  BomCommit,
  BomDocumentSnapshot,
  BomPatch,
} from '@bom-editor/contracts';
import type {
  BomCanvasDiffView,
  BomCanvasLiveAnnouncement,
  BomCanvasPresentationOptions,
  BomEditor,
  BomEditorDataSourceQueryOptions,
  BomExportOptions,
  BomImportOptions,
  BomImportSource,
  BomMaterialMatchCandidate,
  BomMaterialMatchProposal,
  BomMaterialMatchRequest,
  BomSearchRequest,
  BomShortcutRegistryOptions,
  BomValidationOptions,
  BomViewTemplate,
  VisibleQueryOptions,
} from './types.js';
import type {
  BomCellAddress,
  BomColumnDefinition,
  BomFrozenColumnPosition,
  BomPasteInput,
} from '@bom-editor/runtime';

const EMPTY_INPUT_SCHEMA: BomAgentJsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
});
const OPEN_OBJECT_SCHEMA: BomAgentJsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: true,
});

function objectSchema(
  properties: Readonly<Record<string, BomAgentJsonSchema>>,
  required: readonly string[] = [],
): BomAgentJsonSchema {
  return Object.freeze({
    type: 'object',
    properties: Object.freeze({ ...properties }),
    ...(required.length === 0 ? {} : { required: Object.freeze([...required]) }),
    additionalProperties: false,
  });
}

function descriptor(
  id: BomAgentCapability,
  access: 'read' | 'write',
  requiredPermissions: readonly BomAgentPermission[],
  inputSchema: BomAgentJsonSchema,
  options: Readonly<{
    requiresDocumentTarget?: boolean;
    requiresBaseRevision?: boolean;
    requiresIdempotencyKey?: boolean;
    supportsDryRun?: boolean;
    requiresHostAttachment?: boolean;
  }> = {},
): BomAgentCapabilityDescriptor {
  return Object.freeze({
    id,
    access,
    requiredPermissions: Object.freeze([...requiredPermissions]),
    requiresDocumentTarget: options.requiresDocumentTarget ?? false,
    requiresBaseRevision: options.requiresBaseRevision ?? false,
    requiresIdempotencyKey: options.requiresIdempotencyKey ?? false,
    supportsDryRun: options.supportsDryRun ?? false,
    ...(options.requiresHostAttachment === true
      ? { requiresHostAttachment: true }
      : {}),
    inputSchema,
  });
}

/**
 * Tool catalog for `bom-editor-capabilities/v1`. It intentionally exposes
 * semantic operations and stable IDs, never canvas coordinates or DOM events.
 */
export const BOM_EDITOR_AGENT_CAPABILITIES = Object.freeze([
  descriptor('describeCapabilities', 'read', [], EMPTY_INPUT_SCHEMA),
  descriptor('readSnapshot', 'read', ['document:read'], EMPTY_INPUT_SCHEMA),
  descriptor('readDiagnostics', 'read', ['diagnostics:read'], EMPTY_INPUT_SCHEMA),
  descriptor('queryDataSource', 'read', ['datasource:read'], objectSchema({ options: OPEN_OBJECT_SCHEMA }, ['options']), { requiresDocumentTarget: true }),
  descriptor('loadDataSourceChildren', 'write', ['datasource:read', 'document:write'], objectSchema({ parentId: Object.freeze({ type: 'string' }), options: OPEN_OBJECT_SCHEMA }, ['parentId']), { requiresDocumentTarget: true, requiresIdempotencyKey: true }),
  descriptor('executeCommand', 'write', ['document:write'], objectSchema({ command: OPEN_OBJECT_SCHEMA }, ['command']), { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('executeTransaction', 'write', ['document:write'], objectSchema({ commands: Object.freeze({ type: 'array', items: OPEN_OBJECT_SCHEMA }), label: Object.freeze({ type: 'string' }) }, ['commands']), { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('applyPatch', 'write', ['document:write'], objectSchema({ patch: OPEN_OBJECT_SCHEMA }, ['patch']), { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('undo', 'write', ['history:write'], EMPTY_INPUT_SCHEMA, { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('redo', 'write', ['history:write'], EMPTY_INPUT_SCHEMA, { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('setDocument', 'write', ['document:write'], objectSchema({ snapshot: OPEN_OBJECT_SCHEMA }, ['snapshot']), { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('recoverPersistence', 'write', ['document:write'], EMPTY_INPUT_SCHEMA, { requiresDocumentTarget: true, requiresIdempotencyKey: true }),
  descriptor('configureShortcuts', 'write', ['view:write'], objectSchema({ options: OPEN_OBJECT_SCHEMA }, ['options'])),
  descriptor('resetShortcuts', 'write', ['view:write'], EMPTY_INPUT_SCHEMA),
  descriptor('getPresentation', 'read', ['view:read'], EMPTY_INPUT_SCHEMA),
  descriptor('configurePresentation', 'write', ['view:write'], objectSchema({ options: OPEN_OBJECT_SCHEMA }, ['options'])),
  descriptor('announce', 'write', ['accessibility:write'], objectSchema({ announcement: OPEN_OBJECT_SCHEMA }, ['announcement'])),
  descriptor('getPlugins', 'read', ['plugin:execute'], EMPTY_INPUT_SCHEMA),
  descriptor('setColumns', 'write', ['view:write'], objectSchema({ columns: Object.freeze({ type: 'array', items: OPEN_OBJECT_SCHEMA }) }, ['columns'])),
  descriptor('setRowHeight', 'write', ['view:write'], objectSchema({ occurrenceId: Object.freeze({ type: 'string' }), rowHeight: Object.freeze({ type: 'number' }) }, ['occurrenceId', 'rowHeight'])),
  descriptor('setViewQuery', 'write', ['view:write'], objectSchema({ query: OPEN_OBJECT_SCHEMA })),
  descriptor('getViewTemplate', 'read', ['view:read'], EMPTY_INPUT_SCHEMA),
  descriptor('applyViewTemplate', 'write', ['view:write'], objectSchema({ template: OPEN_OBJECT_SCHEMA }, ['template'])),
  descriptor('setColumnFrozen', 'write', ['view:write'], objectSchema({ columnId: Object.freeze({ type: 'string' }), frozen: Object.freeze({ enum: [false, 'start', 'end'] }) }, ['columnId', 'frozen'])),
  descriptor('insertColumn', 'write', ['view:write'], objectSchema({ referenceColumnId: Object.freeze({ type: 'string' }), position: Object.freeze({ enum: ['before', 'after'] }), count: Object.freeze({ type: 'integer' }) }, ['referenceColumnId'])),
  descriptor('deleteColumns', 'write', ['view:write'], objectSchema({ columnIds: Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) }) }, ['columnIds'])),
  descriptor('setDiffView', 'write', ['view:write'], objectSchema({ diffView: Object.freeze({ oneOf: [OPEN_OBJECT_SCHEMA, Object.freeze({ type: 'null' })] }) }, ['diffView'])),
  descriptor('focusCell', 'write', ['view:write'], objectSchema({ address: OPEN_OBJECT_SCHEMA }, ['address'])),
  descriptor('search', 'read', ['search:read'], objectSchema({ request: OPEN_OBJECT_SCHEMA }, ['request']), { requiresDocumentTarget: true }),
  descriptor('validate', 'read', ['validation:read'], objectSchema({ options: OPEN_OBJECT_SCHEMA }), { requiresDocumentTarget: true }),
  descriptor('matchMaterials', 'read', ['document:read'], objectSchema({ request: OPEN_OBJECT_SCHEMA }, ['request']), { requiresDocumentTarget: true }),
  descriptor('proposeMaterialMatch', 'read', ['document:read'], objectSchema({ targetOccurrenceId: Object.freeze({ type: 'string' }), candidate: OPEN_OBJECT_SCHEMA }, ['targetOccurrenceId', 'candidate']), { requiresDocumentTarget: true, requiresBaseRevision: true }),
  descriptor('applyMaterialMatch', 'write', ['document:write'], objectSchema({ proposal: OPEN_OBJECT_SCHEMA }, ['proposal']), { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('executePluginCommand', 'write', ['plugin:execute', 'document:write'], objectSchema({ pluginId: Object.freeze({ type: 'string' }), commandId: Object.freeze({ type: 'string' }), payload: true }, ['pluginId', 'commandId']), { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('previewPaste', 'read', ['clipboard:write'], objectSchema({ input: OPEN_OBJECT_SCHEMA }, ['input']), { requiresDocumentTarget: true, supportsDryRun: true }),
  descriptor('paste', 'write', ['clipboard:write', 'document:write'], objectSchema({ input: OPEN_OBJECT_SCHEMA }, ['input']), { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true }),
  descriptor('exportData', 'read', ['document:read', 'file:write'], objectSchema({ options: OPEN_OBJECT_SCHEMA }, ['options']), { requiresDocumentTarget: true, requiresHostAttachment: true }),
  descriptor('importData', 'write', ['document:write', 'file:read'], objectSchema({ attachment: true, options: OPEN_OBJECT_SCHEMA }, ['attachment', 'options']), { requiresDocumentTarget: true, requiresBaseRevision: true, requiresIdempotencyKey: true, requiresHostAttachment: true }),
] as const satisfies readonly BomAgentCapabilityDescriptor[]);

const CAPABILITY_BY_ID = new Map<BomAgentCapability, BomAgentCapabilityDescriptor>(
  BOM_EDITOR_AGENT_CAPABILITIES.map((entry) => [entry.id, entry]),
);
const MAX_IDEMPOTENCY_RECORDS = 256;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface BomAgentAttachmentBridge {
  readImport(
    input: Readonly<{
      readonly attachment: BomValue;
      readonly signal?: AbortSignal;
    }>,
  ): Promise<BomImportSource>;
  writeExport(
    input: Readonly<{
      readonly blob: Blob;
      readonly taskId: string;
      readonly format: string;
      readonly signal?: AbortSignal;
    }>,
  ): Promise<BomValue>;
}

export interface BomEditorAgentCapabilityAdapterOptions {
  /** Static permissions for a trusted local caller. Omit when using a policy. */
  readonly grantedPermissions?: readonly BomAgentPermission[];
  /** Dynamic host authorization for a remote or third-party caller. */
  readonly authorizationPolicy?: BomAgentAuthorizationPolicy;
  /** Required to bridge binary import and export payloads. */
  readonly attachments?: BomAgentAttachmentBridge;
}

export interface BomAgentCallOptions {
  readonly signal?: AbortSignal;
}

export interface BomEditorAgentCapabilityAdapter<
  TFields extends BomFields = BomFields,
> {
  readonly instanceId: string;
  describeCapabilities(): readonly BomAgentCapabilityDescriptor[];
  call(
    request: Readonly<BomAgentRequest>,
    options?: Readonly<BomAgentCallOptions>,
  ): Promise<BomAgentResponse>;
}

export function createBomEditorAgentCapabilityAdapter<
  TFields extends BomFields = BomFields,
>(
  editor: BomEditor<TFields>,
  options: Readonly<BomEditorAgentCapabilityAdapterOptions> = {},
): BomEditorAgentCapabilityAdapter<TFields> {
  return new BomEditorAgentCapabilityAdapterImpl(editor, options);
}

type DispatchResult =
  | { readonly ok: true; readonly value: BomValue }
  | { readonly ok: false; readonly error: BomError };

type CachedResponse = Readonly<{
  readonly fingerprint: string;
  readonly result: DispatchResult;
  readonly document: BomAgentDocumentTarget;
}>;

class BomEditorAgentCapabilityAdapterImpl<
  TFields extends BomFields,
> implements BomEditorAgentCapabilityAdapter<TFields> {
  public readonly instanceId: string;

  readonly #editor: BomEditor<TFields>;
  readonly #options: Readonly<BomEditorAgentCapabilityAdapterOptions>;
  readonly #idempotency = new Map<string, CachedResponse>();

  public constructor(
    editor: BomEditor<TFields>,
    options: Readonly<BomEditorAgentCapabilityAdapterOptions>,
  ) {
    this.#editor = editor;
    this.#options = options;
    this.instanceId = editor.instanceId;
  }

  public describeCapabilities(): readonly BomAgentCapabilityDescriptor[] {
    return BOM_EDITOR_AGENT_CAPABILITIES;
  }

  public async call(
    request: Readonly<BomAgentRequest>,
    options: Readonly<BomAgentCallOptions> = {},
  ): Promise<BomAgentResponse> {
    const requestId = requestIdOf(request);
    const invalid = validateRequest(request);
    if (invalid !== undefined) return this.#failure(requestId, invalid);
    if (request.instanceId !== this.instanceId) {
      return this.#failure(requestId, agentCapabilityError('BOM_AGENT_TARGET_MISMATCH', 'CONFLICT', {
        expectedInstanceId: this.instanceId,
      }));
    }
    const capability = CAPABILITY_BY_ID.get(request.capability);
    if (capability === undefined) {
      return this.#failure(requestId, agentCapabilityError('BOM_AGENT_CAPABILITY_UNSUPPORTED', 'CONFIG', {
        capability: request.capability,
      }));
    }
    if (request.dryRun === true && !capability.supportsDryRun) {
      return this.#failure(requestId, agentCapabilityError('BOM_AGENT_DRY_RUN_UNSUPPORTED', 'CONFIG', {
        capability: capability.id,
      }));
    }
    if (capability.requiresIdempotencyKey && request.idempotencyKey === undefined) {
      return this.#failure(requestId, agentCapabilityError('BOM_AGENT_IDEMPOTENCY_REQUIRED', 'VALIDATION', {
        capability: capability.id,
      }));
    }
    const authorized = await this.#authorize(request, capability, options.signal);
    if (!authorized.ok) return this.#failure(requestId, authorized.error);

    const idempotencyKey = capability.requiresIdempotencyKey
      ? request.idempotencyKey!
      : undefined;
    const fingerprint = idempotencyKey === undefined ? undefined : requestFingerprint(request);
    if (idempotencyKey !== undefined && fingerprint !== undefined) {
      const cached = this.#idempotency.get(idempotencyKey);
      if (cached !== undefined) {
        if (cached.fingerprint !== fingerprint) {
          return this.#failure(requestId, agentCapabilityError('BOM_AGENT_IDEMPOTENCY_CONFLICT', 'CONFLICT', {
            idempotencyKey,
          }));
        }
        return responseFromDispatch(requestId, cached.result, cached.document);
      }
    }

    const targetFailure = validateTarget(
      request,
      capability,
      this.#documentTarget(),
    );
    if (targetFailure !== undefined) return this.#failure(requestId, targetFailure);

    const result = await this.#dispatch(request, options.signal);
    const document = this.#documentTarget();
    if (idempotencyKey !== undefined && fingerprint !== undefined) {
      this.#remember(idempotencyKey, Object.freeze({ fingerprint, result, document }));
    }
    return responseFromDispatch(requestId, result, document);
  }

  async #authorize(
    request: Readonly<BomAgentRequest>,
    capability: Readonly<BomAgentCapabilityDescriptor>,
    signal: AbortSignal | undefined,
  ): Promise<DispatchResult> {
    if (capability.requiredPermissions.length === 0) {
      return dispatchSuccess(undefined);
    }
    const grants = this.#options.grantedPermissions;
    const policy = this.#options.authorizationPolicy;
    const staticallyAllowed = grants === undefined || capability.requiredPermissions.every(
      (permission) => grants.includes(permission),
    );
    if (!staticallyAllowed || (grants === undefined && policy === undefined)) {
      return dispatchFailure(agentCapabilityError('BOM_AGENT_PERMISSION_DENIED', 'SECURITY_LIMIT', {
        capability: capability.id,
      }));
    }
    if (policy === undefined) return dispatchSuccess(undefined);
    try {
      const decision = await policy.authorize(Object.freeze({
        request,
        capability,
        requiredPermissions: capability.requiredPermissions,
      }), Object.freeze({ signal: signal ?? NEVER_ABORTED_SIGNAL }));
      if (decision.allowed) return dispatchSuccess(undefined);
      return dispatchFailure(agentCapabilityError('BOM_AGENT_PERMISSION_DENIED', 'SECURITY_LIMIT', {
        capability: capability.id,
        ...(decision.reasonCode === undefined ? {} : { reasonCode: decision.reasonCode }),
      }));
    } catch {
      return dispatchFailure(agentCapabilityError('BOM_AGENT_PERMISSION_DENIED', 'SECURITY_LIMIT', {
        capability: capability.id,
      }));
    }
  }

  async #dispatch(
    request: Readonly<BomAgentRequest>,
    signal: AbortSignal | undefined,
  ): Promise<DispatchResult> {
    const origin = 'agent:' + request.origin;
    switch (request.capability) {
      case 'describeCapabilities':
        return dispatchSuccess(this.describeCapabilities() as unknown as BomValue);
      case 'readSnapshot':
        return dispatchSuccess(this.#editor.getSnapshot() as unknown as BomValue);
      case 'readDiagnostics':
        return dispatchSuccess(this.#editor.getDiagnostics() as unknown as BomValue);
      case 'queryDataSource': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const rawOptions = input.value['options'];
        if (!isPlainRecord(rawOptions)) return invalidInput('options');
        return resultValue(await this.#editor.queryDataSource(rawOptions as unknown as BomEditorDataSourceQueryOptions));
      }
      case 'loadDataSourceChildren': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const parentId = requiredString(input.value, 'parentId');
        if (!parentId.ok) return parentId;
        const rawOptions = input.value['options'];
        if (rawOptions !== undefined && !isPlainRecord(rawOptions)) return invalidInput('options');
        return resultValue(await this.#editor.loadDataSourceChildren(parentId.value, withSignal(rawOptions as unknown as Record<string, never> | undefined, signal)));
      }
      case 'executeCommand': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const command = input.value['command'];
        if (!isPlainRecord(command)) return invalidInput('command');
        return resultValue(await this.#editor.execute(command as unknown as BomCommand<TFields>, operationOptions(origin, signal, request.idempotencyKey)));
      }
      case 'executeTransaction': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const commands = input.value['commands'];
        if (!Array.isArray(commands) || commands.some((command) => !isPlainRecord(command))) return invalidInput('commands');
        const label = optionalString(input.value, 'label');
        if (!label.ok) return label;
        return resultValue(await this.#editor.transaction((transaction) => {
          for (const command of commands) {
            transaction.execute(command as unknown as BomCommand<TFields>);
          }
        }, transactionOptions(origin, signal, request.idempotencyKey, label.value)));
      }
      case 'applyPatch': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const patch = input.value['patch'];
        if (!isPlainRecord(patch)) return invalidInput('patch');
        return resultValue(await this.#editor.applyPatch(patch as unknown as BomPatch<TFields>, operationOptions(origin, signal)));
      }
      case 'undo':
        return resultValue(await this.#editor.undo(operationOptions(origin, signal)));
      case 'redo':
        return resultValue(await this.#editor.redo(operationOptions(origin, signal)));
      case 'setDocument': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const snapshot = input.value['snapshot'];
        if (!isPlainRecord(snapshot)) return invalidInput('snapshot');
        return resultValue(await this.#editor.setDocument(snapshot as unknown as BomDocumentSnapshot<TFields>, signal === undefined ? {} : { signal }));
      }
      case 'recoverPersistence':
        return resultValue(await this.#editor.recoverPersistence(signal === undefined ? {} : { signal }));
      case 'configureShortcuts': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const shortcutOptions = input.value['options'];
        if (!isPlainRecord(shortcutOptions)) return invalidInput('options');
        return dispatchSuccess(this.#editor.configureShortcuts(shortcutOptions as unknown as BomShortcutRegistryOptions) as unknown as BomValue);
      }
      case 'resetShortcuts':
        return dispatchSuccess(this.#editor.resetShortcuts() as unknown as BomValue);
      case 'getPresentation':
        return dispatchSuccess(this.#editor.getPresentation() as unknown as BomValue);
      case 'configurePresentation': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const presentationOptions = input.value['options'];
        if (!isPlainRecord(presentationOptions)) return invalidInput('options');
        return dispatchSuccess(this.#editor.configurePresentation(presentationOptions as unknown as BomCanvasPresentationOptions) as unknown as BomValue);
      }
      case 'announce': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const announcement = input.value['announcement'];
        if (!isPlainRecord(announcement)) return invalidInput('announcement');
        return dispatchSuccess(this.#editor.announce(announcement as unknown as BomCanvasLiveAnnouncement) as unknown as BomValue);
      }
      case 'getPlugins':
        return dispatchSuccess(this.#editor.getPlugins() as unknown as BomValue);
      case 'setColumns': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const columns = input.value['columns'];
        if (!Array.isArray(columns) || columns.some((column) => !isPlainRecord(column))) return invalidInput('columns');
        return resultValue(this.#editor.setColumns(columns as unknown as readonly BomColumnDefinition[]));
      }
      case 'setRowHeight': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const occurrenceId = requiredString(input.value, 'occurrenceId');
        if (!occurrenceId.ok) return occurrenceId;
        const rowHeight = input.value['rowHeight'];
        if (typeof rowHeight !== 'number') return invalidInput('rowHeight');
        return resultValue(this.#editor.setRowHeight(occurrenceId.value, rowHeight));
      }
      case 'setViewQuery': {
        const input = optionalObjectInput(request.input);
        if (!input.ok) return input;
        const query = input.value?.['query'];
        if (query !== undefined && !isPlainRecord(query)) return invalidInput('query');
        return resultValue(this.#editor.setViewQuery(query as unknown as VisibleQueryOptions | undefined));
      }
      case 'getViewTemplate':
        return dispatchSuccess(this.#editor.getViewTemplate() as unknown as BomValue);
      case 'applyViewTemplate': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const template = input.value['template'];
        if (!isPlainRecord(template)) return invalidInput('template');
        return resultValue(this.#editor.applyViewTemplate(template as unknown as BomViewTemplate));
      }
      case 'setColumnFrozen': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const columnId = requiredString(input.value, 'columnId');
        if (!columnId.ok) return columnId;
        const frozen = input.value['frozen'];
        if (frozen !== false && frozen !== 'start' && frozen !== 'end') return invalidInput('frozen');
        return resultValue(this.#editor.setColumnFrozen(columnId.value, frozen as BomFrozenColumnPosition));
      }
      case 'insertColumn': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const referenceColumnId = requiredString(input.value, 'referenceColumnId');
        if (!referenceColumnId.ok) return referenceColumnId;
        const position = input.value['position'];
        if (position !== undefined && position !== 'before' && position !== 'after') return invalidInput('position');
        const count = input.value['count'];
        if (count !== undefined && typeof count !== 'number') return invalidInput('count');
        return resultValue(this.#editor.insertColumn(referenceColumnId.value, position, count));
      }
      case 'deleteColumns': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const columnIds = input.value['columnIds'];
        if (!Array.isArray(columnIds) || columnIds.some((id) => typeof id !== 'string')) return invalidInput('columnIds');
        return resultValue(this.#editor.deleteColumns(columnIds));
      }
      case 'setDiffView': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const diffView = input.value['diffView'];
        if (diffView !== null && !isPlainRecord(diffView)) return invalidInput('diffView');
        return resultValue(this.#editor.setDiffView(diffView as unknown as BomCanvasDiffView | null));
      }
      case 'focusCell': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const address = input.value['address'];
        if (!isPlainRecord(address)) return invalidInput('address');
        return resultValue(this.#editor.focusCell(address as unknown as BomCellAddress));
      }
      case 'search': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const searchRequest = input.value['request'];
        if (!isPlainRecord(searchRequest)) return invalidInput('request');
        return resultValue(await this.#editor.search(searchRequest as unknown as BomSearchRequest, signal === undefined ? {} : { signal }));
      }
      case 'validate': {
        const input = optionalObjectInput(request.input);
        if (!input.ok) return input;
        const validationOptions = input.value?.['options'];
        if (validationOptions !== undefined && !isPlainRecord(validationOptions)) return invalidInput('options');
        return resultValue(await this.#editor.validate(withSignal(validationOptions as unknown as Record<string, never> | undefined, signal) as BomValidationOptions | undefined));
      }
      case 'matchMaterials': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const matchRequest = input.value['request'];
        if (!isPlainRecord(matchRequest)) return invalidInput('request');
        return resultValue(await this.#editor.matchMaterials(matchRequest as unknown as BomMaterialMatchRequest<TFields>, signal === undefined ? {} : { signal }));
      }
      case 'proposeMaterialMatch': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const targetOccurrenceId = requiredString(input.value, 'targetOccurrenceId');
        if (!targetOccurrenceId.ok) return targetOccurrenceId;
        const candidate = input.value['candidate'];
        if (!isPlainRecord(candidate)) return invalidInput('candidate');
        return resultValue(this.#editor.proposeMaterialMatch(targetOccurrenceId.value, candidate as unknown as BomMaterialMatchCandidate));
      }
      case 'applyMaterialMatch': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const proposal = input.value['proposal'];
        if (!isPlainRecord(proposal)) return invalidInput('proposal');
        return resultValue(await this.#editor.applyMaterialMatch(proposal as unknown as BomMaterialMatchProposal, operationOptions(origin, signal)));
      }
      case 'executePluginCommand': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const pluginId = requiredString(input.value, 'pluginId');
        if (!pluginId.ok) return pluginId;
        const commandId = requiredString(input.value, 'commandId');
        if (!commandId.ok) return commandId;
        return resultValue(await this.#editor.executePluginCommand(pluginId.value, commandId.value, input.value['payload'], operationOptions(origin, signal)));
      }
      case 'previewPaste': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const pasteInput = input.value['input'];
        if (!isPlainRecord(pasteInput)) return invalidInput('input');
        return resultValue(await this.#editor.previewPaste(pasteInput as unknown as BomPasteInput, signal === undefined ? {} : { signal }));
      }
      case 'paste': {
        const input = requiredObjectInput(request.input);
        if (!input.ok) return input;
        const pasteInput = input.value['input'];
        if (!isPlainRecord(pasteInput)) return invalidInput('input');
        return resultValue(await this.#editor.paste(pasteInput as unknown as BomPasteInput, signal === undefined ? {} : { signal }));
      }
      case 'exportData':
        return this.#exportData(request, signal);
      case 'importData':
        return this.#importData(request, signal);
      default:
        return dispatchFailure(agentCapabilityError('BOM_AGENT_CAPABILITY_UNSUPPORTED', 'CONFIG', {
          capability: request.capability,
        }));
    }
  }

  async #exportData(
    request: Readonly<BomAgentRequest>,
    signal: AbortSignal | undefined,
  ): Promise<DispatchResult> {
    const attachments = this.#options.attachments;
    if (attachments === undefined) {
      return dispatchFailure(agentCapabilityError('BOM_AGENT_ATTACHMENT_UNSUPPORTED', 'CONFIG', {
        capability: request.capability,
      }));
    }
    const input = requiredObjectInput(request.input);
    if (!input.ok) return input;
    const exportOptions = input.value['options'];
    if (!isPlainRecord(exportOptions)) return invalidInput('options');
    const exported = await this.#editor.exportData(withSignal(exportOptions as unknown as Record<string, never>, signal) as BomExportOptions);
    if (!exported.ok) return dispatchFailure(exported.error);
    try {
      const attachment = await attachments.writeExport({
        blob: exported.value.blob,
        taskId: exported.value.taskId,
        format: exported.value.blob.type,
        ...(signal === undefined ? {} : { signal }),
      });
      const { blob: _blob, ...metadata } = exported.value;
      return dispatchSuccess(Object.freeze({
        ...metadata,
        attachment,
      }) as unknown as BomValue);
    } catch {
      return dispatchFailure(agentCapabilityError('BOM_AGENT_ATTACHMENT_UNSUPPORTED', 'IO', {
        capability: request.capability,
      }));
    }
  }

  async #importData(
    request: Readonly<BomAgentRequest>,
    signal: AbortSignal | undefined,
  ): Promise<DispatchResult> {
    const attachments = this.#options.attachments;
    if (attachments === undefined) {
      return dispatchFailure(agentCapabilityError('BOM_AGENT_ATTACHMENT_UNSUPPORTED', 'CONFIG', {
        capability: request.capability,
      }));
    }
    const input = requiredObjectInput(request.input);
    if (!input.ok) return input;
    const attachment = input.value['attachment'];
    const importOptions = input.value['options'];
    if (attachment === undefined) return invalidInput('attachment');
    if (!isPlainRecord(importOptions)) return invalidInput('options');
    try {
      const source = await attachments.readImport({
        attachment,
        ...(signal === undefined ? {} : { signal }),
      });
      return resultValue(await this.#editor.importData(source, withSignal(importOptions as unknown as Record<string, never>, signal) as BomImportOptions));
    } catch {
      return dispatchFailure(agentCapabilityError('BOM_AGENT_ATTACHMENT_UNSUPPORTED', 'IO', {
        capability: request.capability,
      }));
    }
  }

  #documentTarget(): BomAgentDocumentTarget {
    const snapshot = this.#editor.getSnapshot();
    return Object.freeze({
      documentId: snapshot.documentId,
      documentGeneration: this.#editor.getDiagnostics().documentGeneration,
      revision: snapshot.revision,
    });
  }

  #remember(key: string, cached: CachedResponse): void {
    this.#idempotency.set(key, cached);
    if (this.#idempotency.size <= MAX_IDEMPOTENCY_RECORDS) return;
    const oldest = this.#idempotency.keys().next().value;
    if (oldest !== undefined) this.#idempotency.delete(oldest);
  }

  #failure(requestId: string, error: BomError): BomAgentResponse {
    return Object.freeze({
      protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
      requestId,
      ok: false,
      error,
      document: this.#documentTarget(),
    });
  }
}

const NEVER_ABORTED_SIGNAL = Object.freeze({ aborted: false });

function validateRequest(request: Readonly<BomAgentRequest>): BomError | undefined {
  if (!isPlainRecord(request)) return agentCapabilityError('BOM_AGENT_REQUEST_INVALID', 'VALIDATION');
  if (request.protocol !== BOM_AGENT_CAPABILITY_PROTOCOL) return agentCapabilityError('BOM_AGENT_PROTOCOL_INVALID', 'CONFIG');
  if (!isSafeToken(request.requestId) || !isSafeToken(request.instanceId) || !isSafeToken(request.origin)) {
    return agentCapabilityError('BOM_AGENT_REQUEST_INVALID', 'VALIDATION');
  }
  if (typeof request.capability !== 'string' || !CAPABILITY_BY_ID.has(request.capability as BomAgentCapability)) {
    return agentCapabilityError('BOM_AGENT_CAPABILITY_UNSUPPORTED', 'CONFIG');
  }
  if (request.documentId !== undefined && !isSafeToken(request.documentId)) return agentCapabilityError('BOM_AGENT_REQUEST_INVALID', 'VALIDATION');
  if (request.documentGeneration !== undefined && (!Number.isSafeInteger(request.documentGeneration) || request.documentGeneration < 0)) return agentCapabilityError('BOM_AGENT_REQUEST_INVALID', 'VALIDATION');
  if (request.baseRevision !== undefined && !isSafeToken(request.baseRevision)) return agentCapabilityError('BOM_AGENT_REQUEST_INVALID', 'VALIDATION');
  if (request.idempotencyKey !== undefined && !isSafeToken(request.idempotencyKey)) return agentCapabilityError('BOM_AGENT_REQUEST_INVALID', 'VALIDATION');
  if (request.input !== undefined && !isBomValue(request.input)) return agentCapabilityError('BOM_AGENT_INPUT_INVALID', 'VALIDATION');
  return undefined;
}

function validateTarget(
  request: Readonly<BomAgentRequest>,
  capability: Readonly<BomAgentCapabilityDescriptor>,
  current: Readonly<BomAgentDocumentTarget>,
): BomError | undefined {
  if (capability.requiresDocumentTarget && (request.documentId === undefined || request.documentGeneration === undefined)) {
    return agentCapabilityError('BOM_AGENT_REQUEST_INVALID', 'VALIDATION', { capability: capability.id });
  }
  if (request.documentId !== undefined && request.documentId !== current.documentId) {
    return agentCapabilityError('BOM_AGENT_DOCUMENT_STALE', 'CONFLICT', { documentId: request.documentId });
  }
  if (request.documentGeneration !== undefined && request.documentGeneration !== current.documentGeneration) {
    return agentCapabilityError('BOM_AGENT_DOCUMENT_STALE', 'CONFLICT', { documentGeneration: request.documentGeneration });
  }
  if (capability.requiresBaseRevision && request.baseRevision === undefined) {
    return agentCapabilityError('BOM_AGENT_REQUEST_INVALID', 'VALIDATION', { capability: capability.id });
  }
  if (request.baseRevision !== undefined && request.baseRevision !== current.revision) {
    return agentCapabilityError('BOM_AGENT_REVISION_STALE', 'CONFLICT', { baseRevision: request.baseRevision });
  }
  return undefined;
}

function requestIdOf(request: Readonly<BomAgentRequest>): string {
  return typeof request.requestId === 'string' && request.requestId.length > 0
    ? request.requestId
    : 'invalid-request';
}

function responseFromDispatch(
  requestId: string,
  result: DispatchResult,
  document: BomAgentDocumentTarget,
): BomAgentResponse {
  return result.ok
    ? Object.freeze({ protocol: BOM_AGENT_CAPABILITY_PROTOCOL, requestId, ok: true, value: result.value, document })
    : Object.freeze({ protocol: BOM_AGENT_CAPABILITY_PROTOCOL, requestId, ok: false, error: result.error, document });
}

function dispatchSuccess(value: BomValue | undefined): DispatchResult {
  return Object.freeze({ ok: true, value: value ?? null });
}

function dispatchFailure(error: BomError): DispatchResult {
  return Object.freeze({ ok: false, error });
}

function resultValue<T>(result: BomResult<T>): DispatchResult {
  return result.ok
    ? dispatchSuccess(result.value as unknown as BomValue)
    : dispatchFailure(result.error);
}

function invalidInput(field: string): { readonly ok: false; readonly error: BomError } {
  return Object.freeze({
    ok: false,
    error: agentCapabilityError('BOM_AGENT_INPUT_INVALID', 'VALIDATION', { field }),
  });
}

function requiredObjectInput(input: BomValue | undefined):
  | { readonly ok: true; readonly value: Readonly<Record<string, BomValue>> }
  | { readonly ok: false; readonly error: BomError } {
  return isPlainRecord(input)
    ? Object.freeze({ ok: true, value: input })
    : invalidInput('input');
}

function optionalObjectInput(input: BomValue | undefined):
  | { readonly ok: true; readonly value: Readonly<Record<string, BomValue>> | undefined }
  | { readonly ok: false; readonly error: BomError } {
  if (input === undefined) return Object.freeze({ ok: true, value: undefined });
  return isPlainRecord(input)
    ? Object.freeze({ ok: true, value: input })
    : invalidInput('input');
}

function requiredString(
  input: Readonly<Record<string, BomValue>>,
  key: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: BomError } {
  const value = input[key];
  return typeof value === 'string' && value.length > 0
    ? Object.freeze({ ok: true, value })
    : invalidInput(key);
}

function optionalString(
  input: Readonly<Record<string, BomValue>>,
  key: string,
): { readonly ok: true; readonly value: string | undefined } | { readonly ok: false; readonly error: BomError } {
  const value = input[key];
  return value === undefined || typeof value === 'string'
    ? Object.freeze({ ok: true, value })
    : invalidInput(key);
}

function operationOptions(
  origin: string,
  signal: AbortSignal | undefined,
  idempotencyKey?: string,
): { readonly origin: string; readonly signal?: AbortSignal; readonly idempotencyKey?: string } {
  return Object.freeze({
    origin,
    ...(signal === undefined ? {} : { signal }),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  });
}

function transactionOptions(
  origin: string,
  signal: AbortSignal | undefined,
  idempotencyKey: string | undefined,
  label: string | undefined,
): { readonly origin: string; readonly signal?: AbortSignal; readonly idempotencyKey?: string; readonly label?: string } {
  return Object.freeze({
    origin,
    ...(signal === undefined ? {} : { signal }),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(label === undefined ? {} : { label }),
  });
}

function withSignal(
  options: Record<string, never> | undefined,
  signal: AbortSignal | undefined,
): Record<string, never> | Readonly<{ readonly signal: AbortSignal }> {
  if (signal === undefined) return options ?? {};
  return Object.freeze({ ...(options ?? {}), signal });
}

function requestFingerprint(request: Readonly<BomAgentRequest>): string {
  return JSON.stringify({
    capability: request.capability,
    documentId: request.documentId ?? null,
    documentGeneration: request.documentGeneration ?? null,
    baseRevision: request.baseRevision ?? null,
    dryRun: request.dryRun === true,
    input: request.input ?? null,
  });
}

function isSafeToken(value: unknown): value is string {
  return typeof value === 'string' && SAFE_TOKEN.test(value);
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, BomValue>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBomValue(value: unknown, seen = new Set<object>(), depth = 0): value is BomValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth > 64 || typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isBomValue(entry, seen, depth + 1))
    : isPlainRecord(value) && Object.values(value).every((entry) => isBomValue(entry, seen, depth + 1));
  seen.delete(value);
  return valid;
}
