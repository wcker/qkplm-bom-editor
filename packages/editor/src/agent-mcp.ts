import {
  BOM_AGENT_CAPABILITY_PROTOCOL,
  agentCapabilityError,
  type BomAgentCapability,
  type BomAgentCapabilityDescriptor,
  type BomAgentJsonSchema,
  type BomAgentRequest,
  type BomAgentResponse,
  type BomValue,
} from '@bom-editor/contracts';
import {
  BOM_EDITOR_AGENT_CAPABILITIES,
  type BomAgentCallOptions,
  type BomEditorAgentCapabilityAdapter,
} from './agent.js';

const MCP_TOOL_PREFIX = 'bom_';

/** Minimal MCP 2025 tool definition with no dependency on a server SDK. */
export interface BomMcpToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: BomAgentJsonSchema;
  readonly annotations: Readonly<{
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly idempotentHint: boolean;
  }>;
}

export interface BomMcpResourceDefinition {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: 'application/json';
}

export interface BomMcpResourceContent {
  readonly uri: string;
  readonly mimeType: 'application/json';
  readonly text: string;
}

/** Shape returned from an MCP `tools/call` handler. */
export interface BomMcpToolCallResult {
  readonly content: readonly Readonly<{
    readonly type: 'text';
    readonly text: string;
  }>[];
  readonly structuredContent: Readonly<BomAgentResponse>;
  readonly isError: boolean;
}

export interface BomEditorMcpAdapter {
  readonly instanceId: string;
  listTools(): readonly BomMcpToolDefinition[];
  callTool(
    name: string,
    argumentsValue: unknown,
    options?: Readonly<BomAgentCallOptions>,
  ): Promise<BomMcpToolCallResult>;
  listResources(): readonly BomMcpResourceDefinition[];
  readResource(uri: string): BomMcpResourceContent | null;
}

/**
 * Converts the transport-neutral capability adapter into MCP tool and resource
 * handlers. The embedding application still owns authentication and transport.
 */
export function createBomEditorMcpAdapter(
  adapter: BomEditorAgentCapabilityAdapter,
): BomEditorMcpAdapter {
  return new BomEditorMcpAdapterImpl(adapter);
}

class BomEditorMcpAdapterImpl implements BomEditorMcpAdapter {
  public readonly instanceId: string;

  readonly #adapter: BomEditorAgentCapabilityAdapter;
  readonly #tools: readonly BomMcpToolDefinition[];
  readonly #capabilitiesResource: BomMcpResourceDefinition;

  public constructor(adapter: BomEditorAgentCapabilityAdapter) {
    this.#adapter = adapter;
    this.instanceId = adapter.instanceId;
    this.#tools = Object.freeze(BOM_EDITOR_AGENT_CAPABILITIES.map((capability) =>
      Object.freeze({
        name: toolName(capability.id),
        title: capability.id,
        description: toolDescription(capability),
        inputSchema: mcpInputSchema(capability),
        annotations: Object.freeze({
          readOnlyHint: capability.access === 'read',
          destructiveHint: isDestructive(capability.id),
          idempotentHint: capability.requiresIdempotencyKey,
        }),
      }),
    ));
    this.#capabilitiesResource = Object.freeze({
      uri: capabilitiesResourceUri(this.instanceId),
      name: 'BOM editor capability catalog',
      description: 'The complete bom-editor-capabilities/v1 catalog for this editor instance.',
      mimeType: 'application/json',
    });
  }

  public listTools(): readonly BomMcpToolDefinition[] {
    return this.#tools;
  }

  public async callTool(
    name: string,
    argumentsValue: unknown,
    options: Readonly<BomAgentCallOptions> = {},
  ): Promise<BomMcpToolCallResult> {
    const capability = capabilityFromToolName(name);
    if (capability === undefined) {
      return mcpResult(Object.freeze({
        protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
        requestId: requestIdFromArguments(argumentsValue),
        ok: false,
        error: agentCapabilityError('BOM_AGENT_CAPABILITY_UNSUPPORTED', 'CONFIG', {
          tool: name,
        }),
      }));
    }
    const request = requestFromMcpArguments(
      this.instanceId,
      capability,
      argumentsValue,
    );
    return mcpResult(await this.#adapter.call(request, options));
  }

  public listResources(): readonly BomMcpResourceDefinition[] {
    return Object.freeze([this.#capabilitiesResource]);
  }

  public readResource(uri: string): BomMcpResourceContent | null {
    if (uri !== this.#capabilitiesResource.uri) return null;
    return Object.freeze({
      uri,
      mimeType: 'application/json',
      text: JSON.stringify({
        protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
        instanceId: this.instanceId,
        capabilities: this.#adapter.describeCapabilities(),
      }),
    });
  }
}

function mcpInputSchema(
  capability: Readonly<BomAgentCapabilityDescriptor>,
): BomAgentJsonSchema {
  const required = ['requestId', 'origin'];
  if (capability.requiresDocumentTarget) {
    required.push('documentId', 'documentGeneration');
  }
  if (capability.requiresBaseRevision) required.push('baseRevision');
  if (capability.requiresIdempotencyKey) required.push('idempotencyKey');
  return Object.freeze({
    type: 'object',
    description: `Arguments for ${capability.id}.`,
    properties: Object.freeze({
      requestId: Object.freeze({ type: 'string' }),
      origin: Object.freeze({ type: 'string' }),
      documentId: Object.freeze({ type: 'string' }),
      documentGeneration: Object.freeze({ type: 'integer' }),
      baseRevision: Object.freeze({ type: 'string' }),
      idempotencyKey: Object.freeze({ type: 'string' }),
      dryRun: Object.freeze({ type: 'boolean' }),
      input: capability.inputSchema,
    }),
    required: Object.freeze(required),
    additionalProperties: false,
  });
}

function toolDescription(capability: Readonly<BomAgentCapabilityDescriptor>): string {
  const mode = capability.access === 'read' ? 'Read-only' : 'State-changing';
  const target = capability.requiresDocumentTarget
    ? ' Requires the active document identity.'
    : '';
  const revision = capability.requiresBaseRevision
    ? ' Requires the current baseRevision.'
    : '';
  const idempotency = capability.requiresIdempotencyKey
    ? ' Requires an idempotencyKey.'
    : '';
  const attachment = capability.requiresHostAttachment === true
    ? ' Requires the host attachment bridge for binary data.'
    : '';
  return `${mode} BOM editor capability ${capability.id}.${target}${revision}${idempotency}${attachment}`;
}

function requestFromMcpArguments(
  instanceId: string,
  capability: BomAgentCapability,
  value: unknown,
): BomAgentRequest {
  const record: Readonly<Record<string, BomValue>> = isPlainRecord(value)
    ? value
    : Object.freeze({});
  const input = record['input'];
  return Object.freeze({
    protocol: BOM_AGENT_CAPABILITY_PROTOCOL,
    requestId: record['requestId'] as string,
    instanceId,
    capability,
    origin: record['origin'] as string,
    ...(input === undefined ? {} : { input }),
    ...(record['documentId'] === undefined ? {} : { documentId: record['documentId'] as string }),
    ...(record['documentGeneration'] === undefined
      ? {}
      : { documentGeneration: record['documentGeneration'] as number }),
    ...(record['baseRevision'] === undefined ? {} : { baseRevision: record['baseRevision'] as string }),
    ...(record['dryRun'] === undefined ? {} : { dryRun: record['dryRun'] as boolean }),
    ...(record['idempotencyKey'] === undefined
      ? {}
      : { idempotencyKey: record['idempotencyKey'] as string }),
  });
}

function mcpResult(response: Readonly<BomAgentResponse>): BomMcpToolCallResult {
  return Object.freeze({
    content: Object.freeze([Object.freeze({
      type: 'text' as const,
      text: JSON.stringify(response),
    })]),
    structuredContent: response,
    isError: !response.ok,
  });
}

function toolName(capability: BomAgentCapability): string {
  return MCP_TOOL_PREFIX + capability;
}

function capabilityFromToolName(name: string): BomAgentCapability | undefined {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return undefined;
  const candidate = name.slice(MCP_TOOL_PREFIX.length) as BomAgentCapability;
  return BOM_EDITOR_AGENT_CAPABILITIES.some((entry) => entry.id === candidate)
    ? candidate
    : undefined;
}

function capabilitiesResourceUri(instanceId: string): string {
  return 'bom://editor/' + encodeURIComponent(instanceId) + '/capabilities';
}

function requestIdFromArguments(value: unknown): string {
  return isPlainRecord(value) && typeof value['requestId'] === 'string'
    ? value['requestId']
    : 'invalid-request';
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, BomValue>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isDestructive(capability: BomAgentCapability): boolean {
  return capability === 'executeCommand' ||
    capability === 'executeTransaction' ||
    capability === 'applyPatch' ||
    capability === 'setDocument' ||
    capability === 'paste' ||
    capability === 'importData' ||
    capability === 'applyMaterialMatch';
}
