import type {
  ClipboardParseDiagnostic,
  ClipboardTextParseAsyncOptions,
  ClipboardTextParseLimits,
} from './paste.js';

export type HtmlClipboardParseFailureReason =
  | 'input-too-large'
  | 'too-many-rows'
  | 'too-many-columns'
  | 'too-many-cells'
  | 'cell-too-large'
  | 'malformed';

export type HtmlClipboardParseResult =
  | {
      readonly ok: true;
      readonly rows: readonly (readonly string[])[];
    }
  | {
      readonly ok: false;
      readonly reason: HtmlClipboardParseFailureReason;
      readonly diagnostics?: readonly ClipboardParseDiagnostic[];
    };

export type HtmlClipboardParseAsyncResult =
  | {
      readonly status: 'parsed';
      readonly inputBytes: number;
      readonly parsed: HtmlClipboardParseResult;
    }
  | {
      readonly status: 'aborted';
      readonly inputBytes: number;
    };

const DEFAULT_MAX_UNITS_PER_PARSE_SLICE = 8 * 1024;
const ABORTED = Symbol('html-clipboard-aborted');

class HtmlClipboardParseError extends Error {
  public constructor(
    readonly reason: HtmlClipboardParseFailureReason,
    readonly diagnostic?: ClipboardParseDiagnostic,
  ) {
    super(reason);
  }
}

interface HtmlTag {
  readonly name: string;
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly attributes: ReadonlyMap<string, string>;
}

interface ActiveCell {
  text: string;
  bytes: number;
  readonly colspan: number;
  readonly rowspan: number;
}

interface RowSpan {
  remaining: number;
}

interface NormalizedLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxCellBytes: number;
}

/**
 * Parses only table text from untrusted clipboard HTML. No browser DOM is
 * consulted, so the parser remains usable by the headless editor package.
 * Merged cells are expanded to a rectangle: the source value occupies the
 * top-left cell and covered cells are empty strings.
 */
export async function parseHtmlClipboardAsync(
  input: string,
  limits: Readonly<ClipboardTextParseLimits>,
  options: Readonly<ClipboardTextParseAsyncOptions> = {},
): Promise<HtmlClipboardParseAsyncResult> {
  const parser = new HtmlClipboardParser(input, normalizeLimits(limits), options);
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
    if (error instanceof HtmlClipboardParseError) {
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

class HtmlClipboardParser {
  readonly #input: string;
  readonly #limits: Readonly<NormalizedLimits>;
  readonly #options: Readonly<ClipboardTextParseAsyncOptions>;
  readonly #rows: string[][] = [];
  readonly #rowSpans = new Map<number, RowSpan>();
  #offset = 0;
  #inputBytes = 0;
  #unitsSinceYield = 0;
  #cellCount = 0;
  #tableDepth = 0;
  #tableSeen = false;
  #tableDone = false;
  #currentRow: string[] | null = null;
  #column = 0;
  #activeCell: ActiveCell | null = null;
  #skipUntil: string | null = null;
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
    while (this.#offset < this.#input.length) {
      if (this.#options.signal?.aborted) {
        throw ABORTED;
      }
      if (this.#input.startsWith('<!--', this.#offset)) {
        const end = this.#input.indexOf('-->', this.#offset + 4);
        if (end < 0) {
          this.#fail('malformed');
        }
        await this.#consumeTo(end + 3);
        continue;
      }
      if (this.#input.charAt(this.#offset) === '<') {
        const end = this.#tagEnd(this.#offset + 1);
        if (end < 0) {
          this.#fail('malformed');
        }
        const raw = this.#input.slice(this.#offset, end + 1);
        await this.#consumeTo(end + 1);
        const tag = parseTag(raw);
        if (tag === null) {
          this.#fail('malformed');
        }
        this.#handleTag(tag);
        continue;
      }
      const end = this.#input.indexOf('<', this.#offset);
      const textEnd = end < 0 ? this.#input.length : end;
      const raw = this.#input.slice(this.#offset, textEnd);
      await this.#consumeTo(textEnd);
      if (this.#skipUntil === null && this.#activeCell !== null) {
        this.#appendText(decodeEntities(raw));
      }
    }

    if (this.#activeCell !== null) {
      this.#finishCell();
    }
    if (this.#currentRow !== null) {
      this.#finishRow();
    }
    if (this.#rows.length === 0 || !this.#tableSeen) {
      this.#fail('malformed');
    }
    const width = this.#rows.reduce(
      (maximum, row) => Math.max(maximum, row.length),
      0,
    );
    if (width === 0) {
      this.#fail('malformed');
    }
    return Object.freeze(
      this.#rows.map((row) =>
        Object.freeze(
          Array.from({ length: width }, (_, index) => row[index] ?? ''),
        ),
      ),
    );
  }

  #tagEnd(start: number): number {
    let quote = '';
    for (let index = start; index < this.#input.length; index += 1) {
      const character = this.#input.charAt(index);
      if (quote !== '') {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        return index;
      }
    }
    return -1;
  }

  #handleTag(tag: HtmlTag): void {
    if (this.#skipUntil !== null) {
      if (tag.closing && tag.name === this.#skipUntil) {
        this.#skipUntil = null;
      }
      return;
    }
    if (!tag.closing && UNSAFE_CONTENT_TAGS.has(tag.name)) {
      if (!tag.selfClosing) this.#skipUntil = tag.name;
      return;
    }
    if (tag.name === '') {
      return;
    }
    if (tag.name === 'table') {
      if (tag.closing) {
        if (this.#tableDepth > 0) {
          if (this.#tableDepth === 1) {
            this.#finishRow();
            this.#tableDone = true;
          }
          this.#tableDepth -= 1;
        }
      } else if (!this.#tableDone) {
        this.#tableSeen = true;
        this.#tableDepth += 1;
      }
      return;
    }
    if (this.#tableDepth !== 1 || this.#tableDone) {
      return;
    }
    if (tag.name === 'tr') {
      if (tag.closing) {
        this.#finishRow();
      } else {
        this.#finishRow();
        if (this.#rows.length >= this.#limits.maxRows) {
          this.#fail('too-many-rows', this.#rows.length, 0);
        }
        this.#currentRow = [];
        this.#column = 0;
        this.#sourceRow = this.#rows.length;
        this.#sourceColumn = 0;
      }
      return;
    }
    if (tag.name === 'td' || tag.name === 'th') {
      if (this.#currentRow === null) {
        this.#fail('malformed');
      }
      if (tag.closing) {
        this.#finishCell();
        return;
      }
      this.#finishCell();
      if (this.#cellCount >= this.#limits.maxCells) {
        this.#fail('too-many-cells', this.#sourceRow, this.#column);
      }
      this.#cellCount += 1;
      const colspan = parseSpan(tag.attributes.get('colspan'));
      const rowspan = parseSpan(tag.attributes.get('rowspan'));
      if (colspan === null || rowspan === null) {
        this.#fail('malformed');
      }
      if (colspan > this.#limits.maxColumns) {
        this.#fail('too-many-columns', this.#sourceRow, this.#column);
      }
      if (rowspan > this.#limits.maxRows) {
        this.#fail('too-many-rows', this.#sourceRow, this.#column);
      }
      this.#sourceColumn = this.#column;
      this.#activeCell = {
        text: '',
        bytes: 0,
        colspan,
        rowspan,
      };
      return;
    }
    if (this.#activeCell !== null && tag.name === 'br' && !tag.closing) {
      this.#appendText('\n');
    } else if (
      this.#activeCell !== null &&
      !tag.closing &&
      (tag.name === 'div' || tag.name === 'p' || tag.name === 'li')
    ) {
      this.#appendText('\n');
    }
  }

  #appendText(text: string): void {
    if (text.length === 0 || this.#activeCell === null) return;
    const normalized = text.replace(/\r\n?/gu, '\n');
    const bytes = utf8ByteLength(normalized);
    if (this.#activeCell.bytes > this.#limits.maxCellBytes - bytes) {
      this.#fail('cell-too-large', this.#sourceRow, this.#sourceColumn);
    }
    this.#activeCell.text += normalized;
    this.#activeCell.bytes += bytes;
  }

  #finishCell(): void {
    const cell = this.#activeCell;
    if (cell === null) return;
    if (this.#currentRow === null) {
      this.#fail('malformed');
    }
    this.#skipCoveredColumns();
    for (let index = 0; index < cell.colspan; index += 1) {
      this.#assertColumn(this.#column);
      this.#currentRow![this.#column] = index === 0
        ? cell.text.trim()
        : '';
      if (cell.rowspan > 1) {
        this.#rowSpans.set(this.#column, { remaining: cell.rowspan });
      }
      this.#column += 1;
    }
    this.#activeCell = null;
  }

  #finishRow(): void {
    if (this.#currentRow === null) return;
    this.#finishCell();
    let highestSpanColumn = -1;
    for (const column of this.#rowSpans.keys()) {
      highestSpanColumn = Math.max(highestSpanColumn, column);
    }
    while (this.#column <= highestSpanColumn) {
      this.#skipCoveredColumns();
      if (this.#column <= highestSpanColumn) {
        this.#assertColumn(this.#column);
        this.#currentRow[this.#column] = '';
        this.#column += 1;
      }
    }
    if (this.#currentRow.length === 0) {
      this.#fail('malformed');
    }
    if (this.#rows.length >= this.#limits.maxRows) {
      this.#fail('too-many-rows', this.#sourceRow, 0);
    }
    this.#rows.push(this.#currentRow);
    for (const [column, span] of this.#rowSpans) {
      if (span.remaining <= 1) {
        this.#rowSpans.delete(column);
      } else {
        span.remaining -= 1;
      }
    }
    this.#currentRow = null;
    this.#column = 0;
  }

  #skipCoveredColumns(): void {
    while (this.#rowSpans.has(this.#column)) {
      this.#assertColumn(this.#column);
      this.#currentRow![this.#column] = '';
      this.#column += 1;
    }
  }

  #assertColumn(column: number): void {
    if (column >= this.#limits.maxColumns) {
      this.#fail('too-many-columns');
    }
  }

  async #consumeTo(target: number): Promise<void> {
    while (this.#offset < target) {
      const character = utf8CharacterAt(this.#input, this.#offset);
      if (this.#inputBytes > this.#limits.maxBytes - character.bytes) {
      this.#inputBytes = boundedInputBytesAtLimit(this.#limits.maxBytes);
        this.#fail('input-too-large', this.#sourceRow, this.#sourceColumn);
      }
      this.#inputBytes += character.bytes;
      this.#offset += character.width;
      this.#unitsSinceYield += character.width;
      if (this.#unitsSinceYield >= normalizeMaxUnitsPerSlice(
        this.#options.maxUnitsPerSlice,
      )) {
        this.#unitsSinceYield = 0;
        await this.#yieldCheckpoint();
      }
    }
  }

  async #yieldCheckpoint(): Promise<void> {
    if (this.#options.signal?.aborted) throw ABORTED;
    const checkpoint = Object.freeze({
      phase: 'parse' as const,
      offset: this.#offset,
    });
    const continued = await awaitHtmlCheckpoint(
      this.#options.checkpoint,
      checkpoint,
      this.#options.signal,
    );
    if (!continued) throw ABORTED;
  }

  #fail(
    reason: HtmlClipboardParseFailureReason,
    sourceRow = this.#sourceRow,
    sourceColumn = this.#sourceColumn,
  ): never {
    throw new HtmlClipboardParseError(reason, {
      sourceRow: Math.max(0, sourceRow),
      sourceColumn: Math.max(0, sourceColumn),
      code: reason === 'malformed' ? 'malformed-html' : reason,
    });
  }
}

const UNSAFE_CONTENT_TAGS = new Set([
  'embed',
  'iframe',
  'object',
  'script',
  'style',
  'template',
  'svg',
]);

function parseTag(raw: string): HtmlTag | null {
  const body = raw.slice(1, -1).trim();
  if (body.startsWith('!') || body.startsWith('?')) {
    return {
      name: '',
      closing: false,
      selfClosing: true,
      attributes: new Map(),
    };
  }
  const closing = body.startsWith('/');
  const content = (closing ? body.slice(1) : body).trim();
  const match = /^([A-Za-z][A-Za-z0-9:-]*)/u.exec(content);
  if (match === null) return null;
  const name = match[1]!.toLowerCase();
  const rest = content.slice(match[0].length);
  const selfClosing = /\/\s*$/u.test(rest);
  return {
    name,
    closing,
    selfClosing,
    attributes: parseAttributes(rest),
  };
}

function parseAttributes(input: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu;
  for (const match of input.matchAll(pattern)) {
    const key = match[1]!.toLowerCase();
    if (!attributes.has(key)) {
      attributes.set(key, match[2] ?? match[3] ?? match[4] ?? '');
    }
  }
  return attributes;
}

function parseSpan(value: string | undefined): number | null {
  if (value === undefined) return 1;
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function decodeEntities(input: string): string {
  return input.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/giu,
    (entity) => {
      const lower = entity.toLowerCase();
      if (lower === '&amp;') return '&';
      if (lower === '&lt;') return '<';
      if (lower === '&gt;') return '>';
      if (lower === '&quot;') return '"';
      if (lower === '&apos;') return "'";
      if (lower === '&nbsp;') return ' ';
      const hexadecimal = /^&#x([\da-f]+);$/iu.exec(entity);
      const decimal = /^&#(\d+);$/u.exec(entity);
      const codePoint = hexadecimal === null
        ? decimal === null ? NaN : Number(decimal[1])
        : Number.parseInt(hexadecimal[1]!, 16);
      return Number.isSafeInteger(codePoint) &&
          codePoint > 0 &&
          codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : '';
    },
  );
}

function normalizeLimits(
  limits: Readonly<ClipboardTextParseLimits>,
): Readonly<NormalizedLimits> {
  return Object.freeze({
    maxBytes: positiveLimit(limits.maxBytes),
    maxRows: positiveLimit(limits.maxRows),
    maxColumns: positiveLimit(limits.maxColumns),
    maxCells: positiveLimit(limits.maxCells),
    maxCellBytes: positiveLimit(limits.maxCellBytes),
  });
}

function positiveLimit(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function normalizeMaxUnitsPerSlice(value: number | undefined): number {
  return typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0
    ? value
    : DEFAULT_MAX_UNITS_PER_PARSE_SLICE;
}

function utf8ByteLength(input: string): number {
  let bytes = 0;
  for (let index = 0; index < input.length; ) {
    const character = utf8CharacterAt(input, index);
    bytes += character.bytes;
    index += character.width;
  }
  return bytes;
}

function utf8CharacterAt(
  input: string,
  index: number,
): Readonly<{ readonly width: number; readonly bytes: number }> {
  const code = input.charCodeAt(index);
  if (code >= 0xd800 && code <= 0xdbff && index + 1 < input.length) {
    const next = input.charCodeAt(index + 1);
    if (next >= 0xdc00 && next <= 0xdfff) {
      return { width: 2, bytes: 4 };
    }
  }
  return { width: 1, bytes: code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3 };
}

function boundedInputBytesAtLimit(maxBytes: number): number {
  return maxBytes === Number.MAX_SAFE_INTEGER ? maxBytes : maxBytes + 1;
}

async function awaitHtmlCheckpoint(
  checkpoint: ClipboardTextParseAsyncOptions['checkpoint'],
  detail: Readonly<{ readonly phase: 'parse'; readonly offset: number }>,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal?.aborted) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiting = checkpoint === undefined
    ? new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 0);
      })
    : Promise.resolve(checkpoint(detail));
  if (signal === undefined) {
    await waiting;
    return true;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (continued: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
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
