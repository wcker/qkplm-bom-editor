import type { BomError } from './error.js';
import type {
  BomDocumentGeneration,
  BomDocumentId,
  BomInstanceId,
  BomRequestId,
  RevisionToken,
} from './identifiers.js';
import type { BomSafeContext, BomValue } from './value.js';

/**
 * Stable, transport-independent protocol used by an agent bridge before it is
 * mapped to MCP, HTTP, MessagePort, or another host transport.
 */
export const BOM_AGENT_CAPABILITY_PROTOCOL = 'bom-editor-capabilities/v1';

export const BOM_AGENT_CAPABILITY_ERROR_CODES = Object.freeze({
  protocolInvalid: 'BOM_AGENT_PROTOCOL_INVALID',
  requestInvalid: 'BOM_AGENT_REQUEST_INVALID',
  capabilityUnsupported: 'BOM_AGENT_CAPABILITY_UNSUPPORTED',
  permissionDenied: 'BOM_AGENT_PERMISSION_DENIED',
  targetMismatch: 'BOM_AGENT_TARGET_MISMATCH',
  documentStale: 'BOM_AGENT_DOCUMENT_STALE',
  revisionStale: 'BOM_AGENT_REVISION_STALE',
  inputInvalid: 'BOM_AGENT_INPUT_INVALID',
  dryRunUnsupported: 'BOM_AGENT_DRY_RUN_UNSUPPORTED',
  idempotencyRequired: 'BOM_AGENT_IDEMPOTENCY_REQUIRED',
  idempotencyConflict: 'BOM_AGENT_IDEMPOTENCY_CONFLICT',
  attachmentUnsupported: 'BOM_AGENT_ATTACHMENT_UNSUPPORTED',
} as const);

export type BomAgentCapabilityErrorCode =
  (typeof BOM_AGENT_CAPABILITY_ERROR_CODES)[keyof typeof BOM_AGENT_CAPABILITY_ERROR_CODES];

export function agentCapabilityError(
  code: BomAgentCapabilityErrorCode,
  category: BomError['category'],
  context?: BomSafeContext,
): BomError {
  return Object.freeze({
    code,
    category,
    messageKey: 'bom.agent.' + code.toLowerCase(),
    recoverable: category !== 'INTERNAL',
    ...(context === undefined
      ? {}
      : { safeContext: Object.freeze({ ...context }) }),
  });
}

/** Permissions are granted by the embedding host, never inferred from an Agent request. */
export type BomAgentPermission =
  | 'document:read'
  | 'document:write'
  | 'view:read'
  | 'view:write'
  | 'history:write'
  | 'search:read'
  | 'validation:read'
  | 'datasource:read'
  | 'plugin:execute'
  | 'diagnostics:read'
  | 'clipboard:write'
  | 'accessibility:write'
  | 'file:read'
  | 'file:write'
  | `custom:${string}`;

export type BomAgentCapability =
  | 'describeCapabilities'
  | 'readSnapshot'
  | 'readDiagnostics'
  | 'queryDataSource'
  | 'loadDataSourceChildren'
  | 'executeCommand'
  | 'executeTransaction'
  | 'applyPatch'
  | 'undo'
  | 'redo'
  | 'setDocument'
  | 'recoverPersistence'
  | 'configureShortcuts'
  | 'resetShortcuts'
  | 'getPresentation'
  | 'configurePresentation'
  | 'announce'
  | 'getPlugins'
  | 'setColumns'
  | 'setRowHeight'
  | 'setViewQuery'
  | 'getViewTemplate'
  | 'applyViewTemplate'
  | 'setColumnFrozen'
  | 'insertColumn'
  | 'deleteColumns'
  | 'setDiffView'
  | 'focusCell'
  | 'search'
  | 'validate'
  | 'matchMaterials'
  | 'proposeMaterialMatch'
  | 'applyMaterialMatch'
  | 'executePluginCommand'
  | 'previewPaste'
  | 'paste'
  | 'exportData'
  | 'importData';

export type BomAgentCapabilityAccess = 'read' | 'write';

/** A deliberately small JSON Schema subset used for tool discovery. */
export type BomAgentJsonSchema =
  | boolean
  | Readonly<{
      readonly type?:
        | 'object'
        | 'array'
        | 'string'
        | 'number'
        | 'integer'
        | 'boolean'
        | 'null';
      readonly description?: string;
      readonly enum?: readonly BomValue[];
      readonly properties?: Readonly<Record<string, BomAgentJsonSchema>>;
      readonly required?: readonly string[];
      readonly items?: BomAgentJsonSchema;
      readonly additionalProperties?: boolean;
      readonly minItems?: number;
      readonly maxItems?: number;
      readonly oneOf?: readonly BomAgentJsonSchema[];
    }>;

export interface BomAgentCapabilityDescriptor {
  readonly id: BomAgentCapability;
  readonly access: BomAgentCapabilityAccess;
  readonly requiredPermissions: readonly BomAgentPermission[];
  /** A request with this capability must name the active document. */
  readonly requiresDocumentTarget: boolean;
  /** A request with this capability must be bound to the current revision. */
  readonly requiresBaseRevision: boolean;
  /** A mutation with this capability must provide an idempotency key. */
  readonly requiresIdempotencyKey: boolean;
  /** Preview is exposed as a dedicated capability where the editor supports it. */
  readonly supportsDryRun: boolean;
  /** File and binary exchange belongs to the host bridge, not the component. */
  readonly requiresHostAttachment?: boolean;
  readonly inputSchema: BomAgentJsonSchema;
}

export interface BomAgentDocumentTarget {
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly revision: RevisionToken;
}

/**
 * Input and output payloads are JSON-compatible BOM values. A transport can
 * add binary attachments independently without changing this envelope.
 */
export interface BomAgentRequest<TInput extends BomValue = BomValue> {
  readonly protocol: typeof BOM_AGENT_CAPABILITY_PROTOCOL;
  readonly requestId: BomRequestId;
  readonly instanceId: BomInstanceId;
  readonly capability: BomAgentCapability;
  /** Value-free, host-auditable source label. It is not an authorization credential. */
  readonly origin: string;
  readonly input?: TInput;
  readonly documentId?: BomDocumentId;
  readonly documentGeneration?: BomDocumentGeneration;
  readonly baseRevision?: RevisionToken;
  readonly dryRun?: boolean;
  readonly idempotencyKey?: string;
}

export type BomAgentResponse<TValue extends BomValue = BomValue> =
  | {
      readonly protocol: typeof BOM_AGENT_CAPABILITY_PROTOCOL;
      readonly requestId: BomRequestId;
      readonly ok: true;
      readonly value: TValue;
      readonly document?: BomAgentDocumentTarget;
    }
  | {
      readonly protocol: typeof BOM_AGENT_CAPABILITY_PROTOCOL;
      readonly requestId: BomRequestId;
      readonly ok: false;
      readonly error: BomError;
      readonly document?: BomAgentDocumentTarget;
    };

/** DOM-free cancellation shape for host authorization hooks. */
export interface BomAgentSignal {
  readonly aborted: boolean;
}

export interface BomAgentAuthorizationRequest {
  readonly request: Readonly<BomAgentRequest>;
  readonly capability: Readonly<BomAgentCapabilityDescriptor>;
  readonly requiredPermissions: readonly BomAgentPermission[];
}

export interface BomAgentAuthorizationDecision {
  readonly allowed: boolean;
  /** Value-free audit ID assigned by the embedding host. */
  readonly decisionId?: string;
  readonly reasonCode?: string;
}

/**
 * The bridge owns caller identity and policy. The request's `origin` must
 * only be used for attribution, never as proof that a caller is trusted.
 */
export interface BomAgentAuthorizationPolicy {
  authorize(
    request: Readonly<BomAgentAuthorizationRequest>,
    options: Readonly<{ readonly signal: BomAgentSignal }>,
  ):
    | Readonly<BomAgentAuthorizationDecision>
    | Promise<Readonly<BomAgentAuthorizationDecision>>;
}
