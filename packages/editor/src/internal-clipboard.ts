import type {
  ClipboardParseDiagnostic,
  ClipboardTextParseAsyncOptions,
  ClipboardTextParseLimits,
} from './paste.js';

export const BOM_INTERNAL_CLIPBOARD_FORMAT = 'bom-editor/clipboard';
export const BOM_INTERNAL_CLIPBOARD_KIND = 'cell-grid-text';
export const BOM_INTERNAL_BRANCH_CLIPBOARD_KIND = 'branch-tree';
export const BOM_INTERNAL_CLIPBOARD_VERSION = 1;
const DEFAULT_MAX_UNITS_PER_PARSE_SLICE = 8 * 1024;

export interface InternalBranchClipboardNode {
  readonly occurrenceId: string;
  readonly kind: 'material' | 'group';
  readonly materialId?: string;
  readonly materialRevision?: string;
  readonly materialCode?: string;
  readonly parentId: string | null;
  readonly positionKey: string;
  readonly childrenState?: 'complete' | 'partial' | 'unloaded';
  readonly knownChildCount?: number;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface InternalBranchClipboardEnvelope {
  readonly roots: readonly string[];
  readonly includeDescendants: boolean;
  readonly nodes: readonly InternalBranchClipboardNode[];
}

export type BranchClipboardParseFailureReason =
  | 'not-branch'
  | 'input-too-large'
  | 'too-many-nodes'
  | 'node-too-large'
  | 'malformed'
  | 'unsupported';

export type BranchClipboardParseResult =
  | {
      readonly ok: true;
      readonly envelope: Readonly<InternalBranchClipboardEnvelope>;
    }
  | {
      readonly ok: false;
      readonly reason: BranchClipboardParseFailureReason;
    };

export type BranchClipboardParseAsyncResult =
  | {
      readonly status: 'parsed';
      readonly inputBytes: number;
      readonly parsed: BranchClipboardParseResult;
    }
  | {
      readonly status: 'aborted';
      readonly inputBytes: number;
    };

interface BranchClipboardRecord {
  readonly format?: unknown;
  readonly version?: unknown;
  readonly kind?: unknown;
  readonly roots?: unknown;
  readonly includeDescendants?: unknown;
  readonly nodes?: unknown;
  readonly occurrenceId?: unknown;
  readonly materialId?: unknown;
  readonly materialRevision?: unknown;
  readonly materialCode?: unknown;
  readonly parentId?: unknown;
  readonly positionKey?: unknown;
  readonly childrenState?: unknown;
  readonly knownChildCount?: unknown;
  readonly fields?: unknown;
}

export type InternalClipboardParseFailureReason =
  | 'input-too-large'
  | 'too-many-rows'
  | 'too-many-columns'
  | 'too-many-cells'
  | 'cell-too-large'
  | 'malformed'
  | 'branch-unsupported'
  | 'unsupported';

export type InternalClipboardParseResult =
  | {
      readonly ok: true;
      readonly rows: readonly (readonly string[])[];
    }
  | {
      readonly ok: false;
      readonly reason: InternalClipboardParseFailureReason;
      readonly diagnostics?: readonly ClipboardParseDiagnostic[];
    };

export type InternalClipboardParseAsyncResult =
  | {
      readonly status: 'parsed';
      readonly inputBytes: number;
      readonly parsed: InternalClipboardParseResult;
    }
  | {
      readonly status: 'aborted';
      readonly inputBytes: number;
    };

interface NormalizedLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxCellBytes: number;
}

const ABORTED = Symbol('internal-clipboard-aborted');

class InternalClipboardParseError extends Error {
  public constructor(
    readonly reason: InternalClipboardParseFailureReason,
    readonly diagnostic?: ClipboardParseDiagnostic,
  ) {
    super(reason);
  }
}

/**
 * Parses the deliberately narrow V1 same-ecosystem payload. It contains only
 * a rectangular grid of untrusted strings; target identity and field mapping
 * always remain under the receiving editor's current selection and schema.
 */
export async function parseInternalClipboardAsync(
  input: string,
  limits: Readonly<ClipboardTextParseLimits>,
  options: Readonly<ClipboardTextParseAsyncOptions> = {},
): Promise<InternalClipboardParseAsyncResult> {
  const parser = new InternalClipboardParser(input, normalizeLimits(limits), options);
  if (options.signal?.aborted) {
    return { status: 'aborted', inputBytes: 0 };
  }
  try {
    const rows = await parser.parse();
    return {
      status: 'parsed',
      inputBytes: parser.inputBytes,
      parsed: Object.freeze({ ok: true, rows }),
    };
  } catch (error) {
    if (error === ABORTED) {
      return { status: 'aborted', inputBytes: parser.inputBytes };
    }
    if (error instanceof InternalClipboardParseError) {
      return {
        status: 'parsed',
        inputBytes: parser.inputBytes,
        parsed: Object.freeze({
          ok: false,
          reason: error.reason,
          ...(error.diagnostic === undefined
            ? {}
            : { diagnostics: Object.freeze([Object.freeze(error.diagnostic)]) }),
        }),
      };
    }
    throw error;
  }
}

/**
 * Parses the independent branch-tree envelope. The parser deliberately keeps
 * the source IDs and fields untrusted; the receiving editor remaps IDs and
 * validates the complete node set against its current Schema before commit.
 * A non-branch internal candidate is reported as `not-branch` so the normal
 * cell-grid parser can retain its existing precedence and fallback behavior.
 */
export async function parseBranchClipboardAsync(
  input: string,
  limits: Readonly<ClipboardTextParseLimits>,
  options: Readonly<ClipboardTextParseAsyncOptions> = {},
): Promise<BranchClipboardParseAsyncResult> {
  const normalized = normalizeLimits(limits);
  if (options.signal?.aborted) {
    return { status: 'aborted', inputBytes: 0 };
  }
  const inputBytes = utf8ByteLength(input);
  if (inputBytes > normalized.maxBytes) {
    return {
      status: 'parsed',
      inputBytes,
      parsed: Object.freeze({ ok: false, reason: 'input-too-large' }),
    };
  }
  const checkpoint = await branchCheckpoint(options);
  if (!checkpoint) {
    return { status: 'aborted', inputBytes };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(input) as unknown;
  } catch {
    return {
      status: 'parsed',
      inputBytes,
      parsed: Object.freeze({ ok: false, reason: 'not-branch' }),
    };
  }
  if (!isObjectRecord(decoded)) {
    return {
      status: 'parsed',
      inputBytes,
      parsed: Object.freeze({ ok: false, reason: 'not-branch' }),
    };
  }
  const candidate = decoded as BranchClipboardRecord;
  if (candidate.kind !== BOM_INTERNAL_BRANCH_CLIPBOARD_KIND) {
    return {
      status: 'parsed',
      inputBytes,
      parsed: Object.freeze({ ok: false, reason: 'not-branch' }),
    };
  }
  const parsed = validateBranchEnvelope(candidate, normalized);
  return {
    status: 'parsed',
    inputBytes,
    parsed,
  };
}

class InternalClipboardParser {
  readonly #input: string;
  readonly #limits: Readonly<NormalizedLimits>;
  readonly #options: Readonly<ClipboardTextParseAsyncOptions>;
  #offset = 0;
  #inputBytes = 0;
  #unitsSinceYield = 0;
  #cellCount = 0;
  #sourceRow = 0;
  #sourceColumn = 0;

  public constructor(
    input: string,
    limits: Readonly<NormalizedLimits>,
    options: Readonly<ClipboardTextParseAsyncOptions>,
  ) {
    this.#input = input;
    this.#limits = limits;
    this.#options = options;
  }

  public get inputBytes(): number {
    return this.#inputBytes;
  }

  public async parse(): Promise<readonly (readonly string[])[]> {
    await this.#measureInputBytes();
    await this.#skipWhitespace();
    const rows = await this.#parseEnvelope();
    await this.#skipWhitespace();
    if (this.#offset !== this.#input.length) {
      this.#fail('malformed');
    }
    return Object.freeze(rows.map((row) => Object.freeze(row)));
  }

  async #measureInputBytes(): Promise<void> {
    for (let index = 0; index < this.#input.length; ) {
      const character = utf8CharacterAt(this.#input, index);
      if (this.#inputBytes > this.#limits.maxBytes - character.bytes) {
        this.#inputBytes = boundedInputBytesAtLimit(this.#limits.maxBytes);
        this.#fail('input-too-large');
      }
      this.#inputBytes += character.bytes;
      index += character.width;
      const paused = this.#consume('measure', character.width, index);
      if (paused !== undefined) {
        await paused;
      }
    }
  }

  async #parseEnvelope(): Promise<string[][]> {
    await this.#expect('{');
    await this.#skipWhitespace();
    const seen = new Set<string>();
    let format: string | undefined;
    let version: number | undefined;
    let kind: string | undefined;
    let rows: string[][] | undefined;

    if (this.#peek() === '}') {
      this.#fail('malformed');
    }
    for (;;) {
      const key = await this.#parseString();
      if (seen.has(key)) {
        this.#fail('malformed');
      }
      seen.add(key);
      await this.#skipWhitespace();
      await this.#expect(':');
      await this.#skipWhitespace();
      switch (key) {
        case 'format':
          format = await this.#parseString();
          break;
        case 'version':
          version = await this.#parseVersion();
          break;
        case 'kind':
          kind = await this.#parseString();
          if (kind === 'branch-tree') {
            // Branch envelopes are intentionally not cell-grid paste input;
            // make the receiving editor fail closed instead of falling back
            // to the human-readable outline MIME.
            this.#fail('branch-unsupported');
          }
          break;
        case 'rows':
          rows = await this.#parseRows();
          break;
        default:
          this.#fail('malformed');
      }
      await this.#skipWhitespace();
      if (this.#peek() === ',') {
        await this.#advance(1);
        await this.#skipWhitespace();
        continue;
      }
      if (this.#peek() === '}') {
        await this.#advance(1);
        break;
      }
      this.#fail('malformed');
    }

    if (
      seen.size !== 4 ||
      format === undefined ||
      version === undefined ||
      kind === undefined ||
      rows === undefined
    ) {
      this.#fail('malformed');
    }
    if (
      format !== BOM_INTERNAL_CLIPBOARD_FORMAT ||
      version !== BOM_INTERNAL_CLIPBOARD_VERSION ||
      kind !== BOM_INTERNAL_CLIPBOARD_KIND
    ) {
      this.#fail('unsupported');
    }
    return rows;
  }

  async #parseVersion(): Promise<number> {
    const start = this.#offset;
    if (this.#peek() < '0' || this.#peek() > '9') {
      this.#fail('malformed');
    }
    while (this.#peek() >= '0' && this.#peek() <= '9') {
      await this.#advance(1);
    }
    if (this.#peek() === '.' || this.#peek() === 'e' || this.#peek() === 'E') {
      this.#fail('malformed');
    }
    const token = this.#input.slice(start, this.#offset);
    if (token.length > 1 && token.charAt(0) === '0') {
      this.#fail('malformed');
    }
    return token === '1' ? 1 : 0;
  }

  async #parseRows(): Promise<string[][]> {
    await this.#expect('[');
    await this.#skipWhitespace();
    if (this.#peek() === ']') {
      this.#fail('malformed');
    }
    const rows: string[][] = [];
    let expectedColumns: number | undefined;
    for (;;) {
      if (rows.length >= this.#limits.maxRows) {
        this.#fail('too-many-rows', rows.length, 0);
      }
      this.#sourceRow = rows.length;
      this.#sourceColumn = 0;
      const row = await this.#parseRow();
      if (expectedColumns === undefined) {
        expectedColumns = row.length;
      } else if (row.length !== expectedColumns) {
        this.#fail('malformed');
      }
      rows.push(row);
      await this.#skipWhitespace();
      if (this.#peek() === ',') {
        await this.#advance(1);
        await this.#skipWhitespace();
        continue;
      }
      if (this.#peek() === ']') {
        await this.#advance(1);
        break;
      }
      this.#fail('malformed');
    }
    return rows;
  }

  async #parseRow(): Promise<string[]> {
    await this.#expect('[');
    await this.#skipWhitespace();
    if (this.#peek() === ']') {
      this.#fail('malformed');
    }
    const row: string[] = [];
    for (;;) {
      if (row.length >= this.#limits.maxColumns) {
        this.#fail('too-many-columns', this.#sourceRow, row.length);
      }
      if (this.#cellCount >= this.#limits.maxCells) {
        this.#fail('too-many-cells', this.#sourceRow, row.length);
      }
      this.#sourceColumn = row.length;
      if (this.#peek() !== '"') {
        this.#fail('malformed');
      }
      const cell = await this.#parseString();
      if (utf8ByteLength(cell) > this.#limits.maxCellBytes) {
        this.#fail('cell-too-large', this.#sourceRow, this.#sourceColumn);
      }
      row.push(cell);
      this.#cellCount += 1;
      await this.#skipWhitespace();
      if (this.#peek() === ',') {
        await this.#advance(1);
        await this.#skipWhitespace();
        continue;
      }
      if (this.#peek() === ']') {
        await this.#advance(1);
        break;
      }
      this.#fail('malformed');
    }
    return row;
  }

  async #parseString(): Promise<string> {
    await this.#expect('"');
    let segmentStart = this.#offset;
    let segments: string[] | undefined;
    for (;;) {
      const character = this.#peek();
      if (character === '') {
        this.#fail('malformed');
      }
      if (character === '"') {
        const value = segments === undefined
          ? this.#input.slice(segmentStart, this.#offset)
          : (() => {
              segments.push(this.#input.slice(segmentStart, this.#offset));
              return segments.join('');
            })();
        await this.#advance(1);
        return value;
      }
      if (character === '\\') {
        if (segments === undefined) {
          segments = [];
        }
        segments.push(this.#input.slice(segmentStart, this.#offset));
        await this.#advance(1);
        segments.push(await this.#parseEscape());
        segmentStart = this.#offset;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) {
        this.#fail('malformed');
      }
      await this.#advance(1);
    }
  }

  async #parseEscape(): Promise<string> {
    const character = this.#peek();
    switch (character) {
      case '"':
      case '\\':
      case '/':
        await this.#advance(1);
        return character;
      case 'b':
        await this.#advance(1);
        return '\b';
      case 'f':
        await this.#advance(1);
        return '\f';
      case 'n':
        await this.#advance(1);
        return '\n';
      case 'r':
        await this.#advance(1);
        return '\r';
      case 't':
        await this.#advance(1);
        return '\t';
      case 'u': {
        await this.#advance(1);
        const hex = this.#input.slice(this.#offset, this.#offset + 4);
        if (!/^[0-9A-Fa-f]{4}$/u.test(hex)) {
          this.#fail('malformed');
        }
        await this.#advance(4);
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      default:
        this.#fail('malformed');
    }
  }

  async #skipWhitespace(): Promise<void> {
    while (isJsonWhitespace(this.#peek())) {
      await this.#advance(1);
    }
  }

  async #expect(character: string): Promise<void> {
    if (this.#peek() !== character) {
      this.#fail('malformed');
    }
    await this.#advance(1);
  }

  async #advance(units: number): Promise<void> {
    this.#offset += units;
    const paused = this.#consume('parse', units, this.#offset);
    if (paused !== undefined) {
      await paused;
    }
  }

  #peek(): string {
    return this.#input.charAt(this.#offset);
  }

  #consume(
    phase: 'measure' | 'parse',
    units: number,
    offset: number,
  ): Promise<void> | undefined {
    if (this.#options.signal?.aborted) {
      throw ABORTED;
    }
    this.#unitsSinceYield += units;
    if (this.#unitsSinceYield < normalizeMaxUnitsPerSlice(this.#options.maxUnitsPerSlice)) {
      return undefined;
    }
    this.#unitsSinceYield = 0;
    return this.#yield(phase, offset);
  }

  async #yield(phase: 'measure' | 'parse', offset: number): Promise<void> {
    if (this.#options.signal?.aborted) {
      throw ABORTED;
    }
    const detail = Object.freeze({ phase, offset });
    const continued = await awaitCheckpoint(
      this.#options.checkpoint,
      detail,
      this.#options.signal,
    );
    if (!continued || this.#options.signal?.aborted) {
      throw ABORTED;
    }
  }

  #fail(
    reason: InternalClipboardParseFailureReason,
    sourceRow = this.#sourceRow,
    sourceColumn = this.#sourceColumn,
  ): never {
    throw new InternalClipboardParseError(reason, {
      sourceRow: Math.max(0, sourceRow),
      sourceColumn: Math.max(0, sourceColumn),
      code: reason === 'malformed' ? 'malformed-internal' : reason,
    });
  }
}

function normalizeLimits(
  limits: Readonly<ClipboardTextParseLimits>,
): Readonly<NormalizedLimits> {
  return Object.freeze({
    maxBytes: normalizeLimit(limits.maxBytes),
    maxRows: normalizeLimit(limits.maxRows),
    maxColumns: normalizeLimit(limits.maxColumns),
    maxCells: normalizeLimit(limits.maxCells),
    maxCellBytes: normalizeLimit(limits.maxCellBytes),
  });
}

function validateBranchEnvelope(
  input: Readonly<BranchClipboardRecord>,
  limits: Readonly<NormalizedLimits>,
): BranchClipboardParseResult {
  if (!hasOnlyKeys(input, [
    'format',
    'version',
    'kind',
    'roots',
    'includeDescendants',
    'nodes',
  ])) {
    return { ok: false, reason: 'malformed' };
  }
  if (
    input.format !== BOM_INTERNAL_CLIPBOARD_FORMAT ||
    input.version !== BOM_INTERNAL_CLIPBOARD_VERSION ||
    input.kind !== BOM_INTERNAL_BRANCH_CLIPBOARD_KIND
  ) {
    return { ok: false, reason: 'unsupported' };
  }
  if (typeof input.includeDescendants !== 'boolean') {
    return { ok: false, reason: 'malformed' };
  }
  if (!Array.isArray(input.roots) || !Array.isArray(input.nodes)) {
    return { ok: false, reason: 'malformed' };
  }
  if (
    input.roots.length === 0 ||
    input.roots.length > input.nodes.length ||
    input.nodes.length > limits.maxRows
  ) {
    return {
      ok: false,
      reason: input.nodes.length > limits.maxRows
        ? 'too-many-nodes'
        : 'malformed',
    };
  }

  const roots: string[] = [];
  const rootSet = new Set<string>();
  for (const root of input.roots) {
    if (!isIdentifier(root) || rootSet.has(root)) {
      return { ok: false, reason: 'malformed' };
    }
    rootSet.add(root);
    roots.push(root);
  }

  const nodes: InternalBranchClipboardNode[] = [];
  const nodeById = new Map<string, InternalBranchClipboardNode>();
  for (let index = 0; index < input.nodes.length; index += 1) {
    const candidate = input.nodes[index];
    if (!isObjectRecord(candidate)) {
      return { ok: false, reason: 'malformed' };
    }
    const node = readBranchNode(candidate as BranchClipboardRecord);
    if (node === null || nodeById.has(node.occurrenceId)) {
      return { ok: false, reason: 'malformed' };
    }
    if (utf8ByteLength(JSON.stringify(node.fields)) > limits.maxCellBytes) {
      return { ok: false, reason: 'node-too-large' };
    }
    nodeById.set(node.occurrenceId, node);
    nodes.push(node);
  }

  for (const root of roots) {
    const node = nodeById.get(root);
    if (node === undefined || node.parentId !== null) {
      return { ok: false, reason: 'malformed' };
    }
  }
  for (const node of nodes) {
    if (node.parentId !== null && !nodeById.has(node.parentId)) {
      return { ok: false, reason: 'malformed' };
    }
    const seen = new Set<string>();
    let current: InternalBranchClipboardNode | undefined = node;
    while (current !== undefined) {
      if (seen.has(current.occurrenceId)) {
        return { ok: false, reason: 'malformed' };
      }
      seen.add(current.occurrenceId);
      current = current.parentId === null
        ? undefined
        : nodeById.get(current.parentId);
    }
    if (!rootSet.has([...seen].at(-1)!)) {
      return { ok: false, reason: 'malformed' };
    }
  }

  return Object.freeze({
    ok: true,
    envelope: Object.freeze({
      roots: Object.freeze(roots),
      includeDescendants: input.includeDescendants,
      nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
    }),
  });
}

function readBranchNode(
  input: Readonly<BranchClipboardRecord>,
): InternalBranchClipboardNode | null {
  const rawKnownChildCount = input.knownChildCount;
  const knownChildCount = rawKnownChildCount === undefined
    ? undefined
    : typeof rawKnownChildCount === 'number' &&
        Number.isSafeInteger(rawKnownChildCount) &&
        rawKnownChildCount >= 0
      ? rawKnownChildCount
      : null;
  if (!hasOnlyKeys(input, [
    'occurrenceId',
    'kind',
    'materialId',
    'materialRevision',
    'materialCode',
    'parentId',
    'positionKey',
    'childrenState',
    'knownChildCount',
    'fields',
  ])) {
    return null;
  }
  if (
    !isIdentifier(input.occurrenceId) ||
    (input.kind !== 'material' && input.kind !== 'group') ||
    !isIdentifier(input.positionKey) ||
    (input.parentId !== null && !isIdentifier(input.parentId)) ||
    !isObjectRecord(input.fields) ||
    input.childrenState !== undefined &&
      input.childrenState !== 'complete' &&
      input.childrenState !== 'partial' &&
      input.childrenState !== 'unloaded' ||
    knownChildCount === null
  ) {
    return null;
  }
  const optionalString = (
    value: unknown,
  ): string | undefined => value === undefined
    ? undefined
    : isIdentifier(value) ? value : undefined;
  const materialId = optionalString(input.materialId);
  const materialRevision = optionalString(input.materialRevision);
  const materialCode = optionalString(input.materialCode);
  if (
    input.materialId !== undefined && materialId === undefined ||
    input.materialRevision !== undefined && materialRevision === undefined ||
    input.materialCode !== undefined && materialCode === undefined
  ) {
    return null;
  }
  return {
    occurrenceId: input.occurrenceId,
    kind: input.kind,
    ...(materialId === undefined ? {} : { materialId }),
    ...(materialRevision === undefined ? {} : { materialRevision }),
    ...(materialCode === undefined ? {} : { materialCode }),
    parentId: input.parentId,
    positionKey: input.positionKey,
    ...(input.childrenState === undefined ? {} : { childrenState: input.childrenState }),
    ...(knownChildCount === undefined ? {} : { knownChildCount }),
    fields: input.fields as Readonly<Record<string, unknown>>,
  };
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isObjectRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  input: object,
  allowed: readonly string[],
): boolean {
  const keys = new Set(allowed);
  return Object.keys(input).every((key) => keys.has(key));
}

async function branchCheckpoint(
  options: Readonly<ClipboardTextParseAsyncOptions>,
): Promise<boolean> {
  if (options.signal?.aborted) return false;
  if (options.checkpoint === undefined) return true;
  try {
    await options.checkpoint(Object.freeze({ phase: 'parse', offset: 0 }));
    return options.signal?.aborted !== true;
  } catch {
    return false;
  }
}

function normalizeLimit(value: number): number {
  if (value === Number.POSITIVE_INFINITY) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

function normalizeMaxUnitsPerSlice(value: number | undefined): number {
  return typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0
    ? value
    : DEFAULT_MAX_UNITS_PER_PARSE_SLICE;
}

function boundedInputBytesAtLimit(maxBytes: number): number {
  return maxBytes === Number.MAX_SAFE_INTEGER ? maxBytes : maxBytes + 1;
}

function isJsonWhitespace(character: string): boolean {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t';
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; ) {
    const character = utf8CharacterAt(value, index);
    bytes += character.bytes;
    index += character.width;
  }
  return bytes;
}

function utf8CharacterAt(
  value: string,
  index: number,
): { readonly bytes: number; readonly width: number } {
  const codeUnit = value.charCodeAt(index);
  if (codeUnit <= 0x7f) {
    return { bytes: 1, width: 1 };
  }
  if (codeUnit <= 0x7ff) {
    return { bytes: 2, width: 1 };
  }
  if (
    codeUnit >= 0xd800 &&
    codeUnit <= 0xdbff &&
    index + 1 < value.length
  ) {
    const nextCodeUnit = value.charCodeAt(index + 1);
    if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
      return { bytes: 4, width: 2 };
    }
  }
  return { bytes: 3, width: 1 };
}

async function awaitCheckpoint(
  checkpoint: ClipboardTextParseAsyncOptions['checkpoint'],
  detail: Readonly<{ readonly phase: 'measure' | 'parse'; readonly offset: number }>,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal?.aborted) {
    return false;
  }
  if (checkpoint === undefined) {
    return yieldToMacrotask(signal);
  }
  const waiting = Promise.resolve(checkpoint(detail));
  if (signal === undefined) {
    await waiting;
    return true;
  }
  if (signal.aborted) {
    void waiting.then(undefined, () => undefined);
    return false;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (continued: boolean): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(continued);
    };
    const onAbort = (): void => finish(false);
    signal.addEventListener('abort', onAbort, { once: true });
    waiting.then(
      () => finish(true),
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function yieldToMacrotask(signal: AbortSignal | undefined): Promise<boolean> {
  if (signal?.aborted) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (continued: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      signal?.removeEventListener('abort', onAbort);
      resolve(continued);
    };
    const onAbort = (): void => finish(false);
    timer = setTimeout(() => finish(true), 0);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }
  });
}
