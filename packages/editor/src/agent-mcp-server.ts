import type { BomEditorMcpAdapter } from './agent-mcp.js';

/** Default MCP revision supported by the transport-neutral session dispatcher. */
export const BOM_MCP_PROTOCOL_VERSION = '2025-03-26';

export type BomMcpJsonRpcId = string | number | null;

export interface BomMcpJsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface BomMcpJsonRpcSuccessResponse {
  readonly jsonrpc: '2.0';
  readonly id: BomMcpJsonRpcId;
  readonly result: unknown;
}

export interface BomMcpJsonRpcErrorResponse {
  readonly jsonrpc: '2.0';
  readonly id: BomMcpJsonRpcId;
  readonly error: BomMcpJsonRpcError;
}

export type BomMcpJsonRpcResponse =
  | BomMcpJsonRpcSuccessResponse
  | BomMcpJsonRpcErrorResponse;

export interface BomMcpServerInfo {
  readonly name: string;
  readonly version: string;
}

export interface BomEditorMcpProtocolServerOptions {
  /** MCP revision advertised in the initialize result. */
  readonly protocolVersion?: string;
  /** Identity advertised to the connected MCP client. */
  readonly serverInfo?: Readonly<BomMcpServerInfo>;
  /** Optional, host-provided operating guidance for the connected client. */
  readonly instructions?: string;
}

/**
 * A single, transport-neutral MCP JSON-RPC session. Instantiate one for each
 * stdio, Streamable HTTP, MessagePort, or WebSocket connection.
 */
export interface BomEditorMcpProtocolServer {
  readonly initialized: boolean;
  handle(message: unknown): Promise<BomMcpJsonRpcResponse | null>;
  dispose(): void;
}

/**
 * Creates the standard MCP JSON-RPC dispatcher. It deliberately owns neither
 * a network listener nor caller authentication; those belong to the host.
 */
export function createBomEditorMcpProtocolServer(
  adapter: BomEditorMcpAdapter,
  options: Readonly<BomEditorMcpProtocolServerOptions> = {},
): BomEditorMcpProtocolServer {
  return new BomEditorMcpProtocolServerImpl(adapter, options);
}

class BomEditorMcpProtocolServerImpl implements BomEditorMcpProtocolServer {
  readonly #adapter: BomEditorMcpAdapter;
  readonly #protocolVersion: string;
  readonly #serverInfo: Readonly<BomMcpServerInfo>;
  readonly #instructions: string | undefined;
  readonly #activeCalls = new Map<BomMcpJsonRpcId, AbortController>();
  readonly #controllers = new Set<AbortController>();
  #initialized = false;
  #disposed = false;

  public constructor(
    adapter: BomEditorMcpAdapter,
    options: Readonly<BomEditorMcpProtocolServerOptions>,
  ) {
    this.#adapter = adapter;
    this.#protocolVersion = nonEmptyString(options.protocolVersion)
      ? options.protocolVersion
      : BOM_MCP_PROTOCOL_VERSION;
    this.#serverInfo = Object.freeze({
      name: nonEmptyString(options.serverInfo?.name)
        ? options.serverInfo.name
        : 'bom-editor',
      version: nonEmptyString(options.serverInfo?.version)
        ? options.serverInfo.version
        : '0.0.0',
    });
    this.#instructions = nonEmptyString(options.instructions)
      ? options.instructions
      : undefined;
  }

  public get initialized(): boolean {
    return this.#initialized;
  }

  public async handle(message: unknown): Promise<BomMcpJsonRpcResponse | null> {
    const parsed = parseRequest(message);
    if (!parsed.ok) return errorResponse(parsed.id, -32600, parsed.message);
    const request = parsed.value;
    if (this.#disposed) return this.#respond(request, errorResponse(request.id, -32600, 'MCP session is closed.'));

    try {
      const response = await this.#dispatch(request);
      return this.#respond(request, response);
    } catch {
      return this.#respond(request, errorResponse(request.id, -32603, 'Internal error.'));
    }
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const controller of this.#controllers) controller.abort();
    this.#controllers.clear();
    this.#activeCalls.clear();
  }

  async #dispatch(request: ParsedRequest): Promise<BomMcpJsonRpcResponse> {
    switch (request.method) {
      case 'initialize':
        return this.#initialize(request);
      case 'notifications/initialized':
        return this.#initialized
          ? successResponse(request.id, {})
          : errorResponse(request.id, -32600, 'MCP session must be initialized before this notification.');
      case 'notifications/cancelled':
        return this.#cancel(request);
      case 'ping':
        return successResponse(request.id, {});
      case 'tools/list':
        return this.#listTools(request);
      case 'tools/call':
        return this.#callTool(request);
      case 'resources/list':
        return this.#listResources(request);
      case 'resources/read':
        return this.#readResource(request);
      default:
        return errorResponse(request.id, -32601, `Method not found: ${request.method}`);
    }
  }

  #initialize(request: ParsedRequest): BomMcpJsonRpcResponse {
    if (request.notification) {
      return errorResponse(request.id, -32600, 'initialize must be a JSON-RPC request with an id.');
    }
    if (this.#initialized) {
      return errorResponse(request.id, -32600, 'MCP session has already been initialized.');
    }
    const params = requiredRecordParams(request);
    if (!params.ok) return params.error;
    if (!nonEmptyString(params.value['protocolVersion'])) {
      return errorResponse(request.id, -32602, 'initialize.params.protocolVersion must be a non-empty string.');
    }
    this.#initialized = true;
    return successResponse(request.id, Object.freeze({
      protocolVersion: this.#protocolVersion,
      capabilities: Object.freeze({
        tools: Object.freeze({ listChanged: false }),
        resources: Object.freeze({ listChanged: false }),
      }),
      serverInfo: this.#serverInfo,
      ...(this.#instructions === undefined ? {} : { instructions: this.#instructions }),
    }));
  }

  #cancel(request: ParsedRequest): BomMcpJsonRpcResponse {
    const params = requiredRecordParams(request);
    if (!params.ok) return params.error;
    const requestId = params.value['requestId'];
    if (!isJsonRpcId(requestId) || requestId === null) {
      return errorResponse(request.id, -32602, 'notifications/cancelled.params.requestId must be a string or number.');
    }
    this.#activeCalls.get(requestId)?.abort();
    return successResponse(request.id, {});
  }

  #listTools(request: ParsedRequest): BomMcpJsonRpcResponse {
    const ready = this.#requireInitialized(request);
    if (ready !== undefined) return ready;
    const params = emptyObjectParams(request);
    if (!params.ok) return params.error;
    return successResponse(request.id, Object.freeze({ tools: this.#adapter.listTools() }));
  }

  async #callTool(request: ParsedRequest): Promise<BomMcpJsonRpcResponse> {
    const ready = this.#requireInitialized(request);
    if (ready !== undefined) return ready;
    const params = requiredRecordParams(request);
    if (!params.ok) return params.error;
    const name = params.value['name'];
    if (!nonEmptyString(name)) {
      return errorResponse(request.id, -32602, 'tools/call.params.name must be a non-empty string.');
    }
    const argumentsValue = params.value['arguments'];
    if (argumentsValue !== undefined && !isPlainRecord(argumentsValue)) {
      return errorResponse(request.id, -32602, 'tools/call.params.arguments must be an object.');
    }
    if (!request.notification && this.#activeCalls.has(request.id)) {
      return errorResponse(request.id, -32600, 'A request with this JSON-RPC id is already active.');
    }

    const controller = new AbortController();
    this.#controllers.add(controller);
    if (!request.notification) this.#activeCalls.set(request.id, controller);
    try {
      const result = await this.#adapter.callTool(name, argumentsValue ?? {}, {
        signal: controller.signal,
      });
      return successResponse(request.id, result);
    } finally {
      this.#controllers.delete(controller);
      if (!request.notification && this.#activeCalls.get(request.id) === controller) {
        this.#activeCalls.delete(request.id);
      }
    }
  }

  #listResources(request: ParsedRequest): BomMcpJsonRpcResponse {
    const ready = this.#requireInitialized(request);
    if (ready !== undefined) return ready;
    const params = emptyObjectParams(request);
    if (!params.ok) return params.error;
    return successResponse(request.id, Object.freeze({ resources: this.#adapter.listResources() }));
  }

  #readResource(request: ParsedRequest): BomMcpJsonRpcResponse {
    const ready = this.#requireInitialized(request);
    if (ready !== undefined) return ready;
    const params = requiredRecordParams(request);
    if (!params.ok) return params.error;
    const uri = params.value['uri'];
    if (!nonEmptyString(uri)) {
      return errorResponse(request.id, -32602, 'resources/read.params.uri must be a non-empty string.');
    }
    const resource = this.#adapter.readResource(uri);
    if (resource === null) {
      return errorResponse(request.id, -32602, 'The requested resource does not exist.', { uri });
    }
    return successResponse(request.id, Object.freeze({
      contents: Object.freeze([resource]),
    }));
  }

  #requireInitialized(request: ParsedRequest): BomMcpJsonRpcErrorResponse | undefined {
    return this.#initialized
      ? undefined
      : errorResponse(request.id, -32600, 'MCP session must be initialized before this method can be used.');
  }

  #respond(
    request: ParsedRequest,
    response: BomMcpJsonRpcResponse,
  ): BomMcpJsonRpcResponse | null {
    return request.notification ? null : response;
  }
}

interface ParsedRequest {
  readonly id: BomMcpJsonRpcId;
  readonly method: string;
  readonly notification: boolean;
  readonly params: unknown;
}

function parseRequest(message: unknown):
  | { readonly ok: true; readonly value: ParsedRequest }
  | { readonly ok: false; readonly id: BomMcpJsonRpcId; readonly message: string } {
  if (!isPlainRecord(message)) return invalidRequest('Invalid JSON-RPC request.');
  if (message['jsonrpc'] !== '2.0') return invalidRequest('jsonrpc must equal "2.0".', message);
  if (!nonEmptyString(message['method'])) return invalidRequest('method must be a non-empty string.', message);
  const hasId = Object.hasOwn(message, 'id');
  const id = hasId ? message['id'] : null;
  if (hasId && !isJsonRpcId(id)) return invalidRequest('id must be a string, number, or null.', message);
  const requestId: BomMcpJsonRpcId = hasId ? id as BomMcpJsonRpcId : null;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      id: requestId,
      method: message['method'],
      notification: !hasId,
      ...(Object.hasOwn(message, 'params') ? { params: message['params'] } : { params: undefined }),
    }),
  });
}

function invalidRequest(
  message: string,
  source?: Readonly<Record<string, unknown>>,
): { readonly ok: false; readonly id: BomMcpJsonRpcId; readonly message: string } {
  const candidate = source?.['id'];
  return Object.freeze({
    ok: false,
    id: isJsonRpcId(candidate) ? candidate : null,
    message,
  });
}

function requiredRecordParams(request: ParsedRequest):
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly error: BomMcpJsonRpcErrorResponse } {
  return isPlainRecord(request.params)
    ? Object.freeze({ ok: true, value: request.params })
    : Object.freeze({
      ok: false,
      error: errorResponse(request.id, -32602, `${request.method}.params must be an object.`),
    });
}

function emptyObjectParams(request: ParsedRequest):
  | { readonly ok: true }
  | { readonly ok: false; readonly error: BomMcpJsonRpcErrorResponse } {
  if (request.params === undefined) return Object.freeze({ ok: true });
  if (!isPlainRecord(request.params) || Object.keys(request.params).length > 0) {
    return Object.freeze({
      ok: false,
      error: errorResponse(request.id, -32602, `${request.method}.params must be omitted or an empty object.`),
    });
  }
  return Object.freeze({ ok: true });
}

function successResponse(id: BomMcpJsonRpcId, result: unknown): BomMcpJsonRpcSuccessResponse {
  return Object.freeze({ jsonrpc: '2.0', id, result });
}

function errorResponse(
  id: BomMcpJsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): BomMcpJsonRpcErrorResponse {
  return Object.freeze({
    jsonrpc: '2.0',
    id,
    error: Object.freeze({
      code,
      message,
      ...(data === undefined ? {} : { data }),
    }),
  });
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isJsonRpcId(value: unknown): value is BomMcpJsonRpcId {
  return value === null || typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value));
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
