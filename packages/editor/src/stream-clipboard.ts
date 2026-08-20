import {
  parseClipboardTextAsync,
  type ClipboardParseDiagnostic,
  type ClipboardTextParseAsyncResult,
  type ClipboardTextParseFailureReason,
  type ClipboardTextParseLimits,
  type ClipboardTextParseResult,
} from './paste.js';

/**
 * Incremental text-stream adapter used by the paste pipeline.
 *
 * The two candidate parsers consume the source once and retain only their
 * decoded rows. This avoids joining the complete input before parsing while
 * preserving the existing precedence rule: an unquoted tab selects TSV,
 * otherwise an unquoted comma selects CSV, otherwise the source is plain text
 * (with quoted TSV escapes as the one structured single-cell exception).
 */
export async function parseClipboardTextStreamAsync(
  stream: AsyncIterable<string>,
  limits: Readonly<ClipboardTextParseLimits>,
  signal?: AbortSignal,
): Promise<ClipboardTextParseAsyncResult> {
  const normalized = normalizeLimits(limits);
  const detection = new FormatDetectionScanner();
  const tsv = new IncrementalDelimitedParser('\t', normalized);
  let csv: IncrementalDelimitedParser | undefined =
    new IncrementalDelimitedParser(',', normalized);
  const rawChunks: string[] = [];
  let keepRaw = true;
  let inputBytes = 0;
  let pendingHighSurrogate = '';
  let iterator: AsyncIterator<string> | undefined;
  try {
    iterator = stream[Symbol.asyncIterator]();
    for (;;) {
      const next = await nextStreamChunk(iterator, signal);
      if (next === undefined) {
        closeStream(iterator);
        return { status: 'aborted', inputBytes };
      }
      if (next.done) break;
      const chunk = next.value;
      if (signal?.aborted) {
        closeStream(iterator);
        return { status: 'aborted', inputBytes };
      }
      if (typeof chunk !== 'string') {
        closeStream(iterator);
        return {
          status: 'parsed',
          inputBytes,
          parsed: {
            ok: false,
            reason: 'malformed',
            diagnostics: Object.freeze([diagnostic('malformed-stream')]),
          },
        };
      }
      if (keepRaw) rawChunks.push(chunk);

      // A source may deliver a very large individual chunk. Slice it at a
      // cooperative boundary so the parser never monopolizes the event loop.
      for (let offset = 0; offset < chunk.length; ) {
        const end = Math.min(offset + MAX_UNITS_PER_STREAM_SLICE, chunk.length);
        const fed = feedCodeUnits(
          chunk.slice(offset, end),
          (unit, bytes) => {
            if (inputBytes > normalized.maxBytes - bytes) {
              inputBytes = normalized.maxBytes + 1;
              return false;
            }
            inputBytes += bytes;
            detection.push(unit);
            tsv.push(unit);
            csv?.push(unit);
            if (detection.hasUnquotedTab && csv !== undefined) {
              // TSV has precedence permanently once an unquoted tab exists.
              csv.releaseRows();
              csv = undefined;
            }
            if (
              keepRaw &&
              (detection.hasUnquotedTab || detection.hasUnquotedComma)
            ) {
              rawChunks.length = 0;
              keepRaw = false;
            }
            return true;
          },
          pendingHighSurrogate,
        );
        pendingHighSurrogate = fed.pendingHighSurrogate;
        if (!fed.ok) {
          closeStream(iterator);
          return {
            status: 'parsed',
            inputBytes,
            parsed: {
              ok: false,
              reason: 'input-too-large',
              diagnostics: Object.freeze([diagnostic('input-too-large')]),
            },
          };
        }
        offset = end;
        if (!(await yieldStreamCheckpoint(signal))) {
          closeStream(iterator);
          return { status: 'aborted', inputBytes };
        }
      }
    }
  } catch {
    if (iterator !== undefined) closeStream(iterator);
    if (signal?.aborted) return { status: 'aborted', inputBytes };
    return {
      status: 'parsed',
      inputBytes,
      parsed: {
        ok: false,
        reason: 'malformed',
        diagnostics: Object.freeze([diagnostic('malformed-stream')]),
      },
    };
  }

  if (pendingHighSurrogate !== '') {
    if (inputBytes > normalized.maxBytes - 3) {
      return {
        status: 'parsed',
        inputBytes: normalized.maxBytes + 1,
        parsed: {
          ok: false,
          reason: 'input-too-large',
          diagnostics: Object.freeze([diagnostic('input-too-large')]),
        },
      };
    }
    inputBytes += 3;
    detection.push(pendingHighSurrogate);
    tsv.push(pendingHighSurrogate);
    csv?.push(pendingHighSurrogate);
  }
  if (signal?.aborted) return { status: 'aborted', inputBytes };

  const hasTab = detection.hasUnquotedTab;
  const hasComma = detection.hasUnquotedComma;
  if (hasTab) {
    return parsedStreamResult(inputBytes, tsv.finish());
  }
  if (hasComma && csv !== undefined) {
    return parsedStreamResult(inputBytes, csv.finish());
  }
  if (tsv.hasEscapedTsvCell) {
    return parsedStreamResult(inputBytes, tsv.finish());
  }

  // Without a structural delimiter, quote characters remain literal for
  // ordinary text. Reuse the canonical parser for that fallback only; this is
  // also the path that preserves one-column line-oriented text exactly.
  const raw = rawChunks.join('');
  const parsed = signal === undefined
    ? await parseClipboardTextAsync(raw, limits)
    : await parseClipboardTextAsync(raw, limits, { signal });
  if (parsed.status === 'aborted') {
    return { status: 'aborted', inputBytes };
  }
  return { status: 'parsed', inputBytes, parsed: parsed.parsed };
}

interface NormalizedStreamLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxCellBytes: number;
}

interface FeedResult {
  readonly ok: boolean;
  readonly pendingHighSurrogate: string;
}

const MAX_UNITS_PER_STREAM_SLICE = 8 * 1024;

function parsedStreamResult(
  inputBytes: number,
  result: ClipboardTextParseResult,
): ClipboardTextParseAsyncResult {
  return { status: 'parsed', inputBytes, parsed: result };
}

function feedCodeUnits(
  text: string,
  consume: (unit: string, bytes: number) => boolean,
  previousHighSurrogate: string,
): FeedResult {
  let offset = 0;
  let pendingHighSurrogate = previousHighSurrogate;
  if (pendingHighSurrogate !== '') {
    const first = text.charCodeAt(0);
    if (first >= 0xdc00 && first <= 0xdfff) {
      if (!consume(pendingHighSurrogate + text.charAt(0), 4)) {
        return { ok: false, pendingHighSurrogate: '' };
      }
      pendingHighSurrogate = '';
      offset = 1;
    } else {
      if (!consume(pendingHighSurrogate, 3)) {
        return { ok: false, pendingHighSurrogate: '' };
      }
      pendingHighSurrogate = '';
    }
  }
  while (offset < text.length) {
    const codeUnit = text.charCodeAt(offset);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (offset + 1 === text.length) {
        pendingHighSurrogate = text.charAt(offset);
        offset += 1;
        break;
      }
      const next = text.charCodeAt(offset + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        if (!consume(text.slice(offset, offset + 2), 4)) {
          return { ok: false, pendingHighSurrogate: '' };
        }
        offset += 2;
        continue;
      }
      if (!consume(text.charAt(offset), 3)) {
        return { ok: false, pendingHighSurrogate: '' };
      }
      offset += 1;
      continue;
    }
    const bytes = codeUnit <= 0x7f ? 1 : codeUnit <= 0x7ff ? 2 : 3;
    if (!consume(text.charAt(offset), bytes)) {
      return { ok: false, pendingHighSurrogate: '' };
    }
    offset += 1;
  }
  return { ok: true, pendingHighSurrogate };
}

type DelimitedState =
  | 'field-start'
  | 'unquoted'
  | 'quoted'
  | 'quote-closed';

class IncrementalDelimitedParser {
  readonly delimiter: '\t' | ',';
  readonly limits: NormalizedStreamLimits;
  private rows: string[][] = [];
  private row: string[] = [];
  private cellParts: string[] = [];
  private cellBytes = 0;
  private totalCells = 0;
  private state: DelimitedState = 'field-start';
  private cellActive = true;
  private rowActive = true;
  private quotedCell = false;
  private quotedCellEscaped = false;
  private pendingQuote = false;
  private skipLf = false;
  private invalid = false;
  private failureReason: ClipboardTextParseFailureReason | undefined;
  private failureDiagnostic: ClipboardParseDiagnostic | undefined;
  private _hasEscapedTsvCell = false;

  constructor(delimiter: '\t' | ',', limits: NormalizedStreamLimits) {
    this.delimiter = delimiter;
    this.limits = limits;
    this.beginCell();
  }

  get hasEscapedTsvCell(): boolean {
    return (
      this._hasEscapedTsvCell &&
      this.invalid === false &&
      this.failureReason === undefined &&
      this.state !== 'quoted'
    );
  }

  push(unit: string): void {
    if (this.failureReason !== undefined) return;
    if (this.pendingQuote) {
      this.pendingQuote = false;
      if (unit === '"') {
        this.quotedCellEscaped = true;
        this.appendValue('"');
        this.state = 'quoted';
        return;
      }
      this.state = 'quote-closed';
      this.consume(unit);
      return;
    }
    this.consume(unit);
  }

  finish(): ClipboardTextParseResult {
    if (this.failureReason !== undefined) {
      return this.failureResult();
    }
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.state = 'quote-closed';
    }
    if (this.state === 'quoted' || this.invalid) {
      return {
        ok: false,
        reason: 'malformed',
        diagnostics: Object.freeze([
          this.failureDiagnostic ?? diagnostic('malformed-quote', this.rows.length, this.row.length),
        ]),
      };
    }
    if (this.rowActive && this.cellActive) {
      this.finishCell();
      this.finishRow();
    }
    return { ok: true, format: this.delimiter === '\t' ? 'tsv' : 'csv', rows: this.rows };
  }

  releaseRows(): void {
    this.rows = [];
    this.row = [];
  }

  private consume(unit: string): void {
    if (this.skipLf) {
      this.skipLf = false;
      if (unit === '\n') return;
    }
    if (!this.rowActive) {
      if (!this.beginRow()) return;
    }
    if (this.state === 'field-start') {
      if (unit === this.delimiter) {
        this.finishCell();
        this.beginCell();
        return;
      }
      if (unit === '\r' || unit === '\n') {
        this.finishCell();
        this.finishRow();
        if (unit === '\r') this.skipLf = true;
        return;
      }
      if (unit === '"') {
        this.quotedCell = true;
        this.quotedCellEscaped = false;
        this.state = 'quoted';
        return;
      }
      this.state = 'unquoted';
      this.appendValue(unit);
      return;
    }
    if (this.state === 'unquoted') {
      if (unit === this.delimiter) {
        this.finishCell();
        this.beginCell();
        return;
      }
      if (unit === '\r' || unit === '\n') {
        this.finishCell();
        this.finishRow();
        if (unit === '\r') this.skipLf = true;
        return;
      }
      if (unit === '"') {
        this.invalid = true;
        this.failureDiagnostic ??= diagnostic('malformed-quote', this.rows.length, this.row.length);
      }
      this.appendValue(unit);
      return;
    }
    if (this.state === 'quoted') {
      if (unit === '"') {
        this.pendingQuote = true;
        return;
      }
      if (unit === '\t' || unit === '\r' || unit === '\n') {
        this.quotedCellEscaped = true;
      }
      this.appendValue(unit);
      return;
    }

    // A quote-closed field may only be followed by the selected delimiter or
    // a record boundary. Keep scanning so the text fallback can still treat
    // malformed quote syntax as literal text when no delimiter is selected.
    if (unit === this.delimiter) {
      this.finishCell();
      this.beginCell();
      return;
    }
    if (unit === '\r' || unit === '\n') {
      this.finishCell();
      this.finishRow();
      if (unit === '\r') this.skipLf = true;
      return;
    }
    this.invalid = true;
    this.failureDiagnostic ??= diagnostic('malformed-quote', this.rows.length, this.row.length);
    this.state = 'unquoted';
    this.appendValue(unit);
  }

  private beginRow(): boolean {
    if (this.rows.length >= this.limits.maxRows) {
      this.setFailure('too-many-rows', this.rows.length, 0);
      return false;
    }
    this.row = [];
    this.rowActive = true;
    return this.beginCell();
  }

  private beginCell(): boolean {
    if (this.row.length >= this.limits.maxColumns) {
      this.setFailure('too-many-columns', this.rows.length, this.row.length);
      return false;
    }
    if (this.totalCells >= this.limits.maxCells) {
      this.setFailure('too-many-cells', this.rows.length, this.row.length);
      return false;
    }
    this.totalCells += 1;
    this.cellParts = [];
    this.cellBytes = 0;
    this.cellActive = true;
    this.state = 'field-start';
    this.quotedCell = false;
    this.quotedCellEscaped = false;
    this.pendingQuote = false;
    return true;
  }

  private appendValue(value: string): void {
    const bytes = utf8ByteLength(value);
    if (this.cellBytes > this.limits.maxCellBytes - bytes) {
      this.setFailure('cell-too-large', this.rows.length, this.row.length);
      return;
    }
    this.cellBytes += bytes;
    this.cellParts.push(value);
  }

  private finishCell(): void {
    if (!this.cellActive) return;
    if (!this.invalid && this.quotedCell && this.quotedCellEscaped) {
      this._hasEscapedTsvCell = true;
    }
    this.row.push(this.cellParts.join(''));
    this.cellActive = false;
  }

  private finishRow(): void {
    if (!this.rowActive) return;
    this.rows.push(this.row);
    this.row = [];
    this.rowActive = false;
    this.cellActive = false;
    this.state = 'field-start';
    this.quotedCell = false;
    this.quotedCellEscaped = false;
    this.pendingQuote = false;
  }

  private setFailure(
    reason: ClipboardTextParseFailureReason,
    sourceRow: number,
    sourceColumn: number,
  ): void {
    if (this.failureReason !== undefined) return;
    this.failureReason = reason;
    this.failureDiagnostic = diagnostic(reason, sourceRow, sourceColumn);
  }

  private failureResult(): ClipboardTextParseResult {
    return {
      ok: false,
      reason: this.failureReason!,
      diagnostics: Object.freeze([
        this.failureDiagnostic ?? diagnostic(this.failureReason!),
      ]),
    };
  }
}

/** Mirrors the canonical format detector while consuming one code point at a time. */
class FormatDetectionScanner {
  private quoted = false;
  private atFieldStart = true;
  private pendingQuote = false;
  private _hasUnquotedTab = false;
  private _hasUnquotedComma = false;

  get hasUnquotedTab(): boolean {
    return this._hasUnquotedTab;
  }

  get hasUnquotedComma(): boolean {
    return this._hasUnquotedComma;
  }

  push(unit: string): void {
    if (this.pendingQuote) {
      this.pendingQuote = false;
      if (unit === '"') return;
      this.quoted = false;
      this.consumeOutside(unit);
      return;
    }
    if (this.quoted) {
      if (unit === '"') {
        this.pendingQuote = true;
      }
      return;
    }
    this.consumeOutside(unit);
  }

  private consumeOutside(unit: string): void {
    if (unit === '\t') {
      this._hasUnquotedTab = true;
      this.atFieldStart = true;
      return;
    }
    if (unit === ',') {
      this._hasUnquotedComma = true;
      this.atFieldStart = true;
      return;
    }
    if (unit === '\r' || unit === '\n') {
      this.atFieldStart = true;
      return;
    }
    if (unit === '"' && this.atFieldStart) {
      this.quoted = true;
      this.atFieldStart = false;
      return;
    }
    this.atFieldStart = false;
  }
}

function normalizeLimits(
  limits: Readonly<ClipboardTextParseLimits>,
): NormalizedStreamLimits {
  return {
    maxBytes: normalizeLimit(limits.maxBytes),
    maxRows: normalizeLimit(limits.maxRows),
    maxColumns: normalizeLimit(limits.maxColumns),
    maxCells: normalizeLimit(limits.maxCells),
    maxCellBytes: normalizeLimit(limits.maxCellBytes),
  };
}

function normalizeLimit(value: number): number {
  if (value === Number.POSITIVE_INFINITY) return Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

function diagnostic(
  code: string,
  sourceRow = 0,
  sourceColumn = 0,
): ClipboardParseDiagnostic {
  return Object.freeze({
    sourceRow: Math.max(0, sourceRow),
    sourceColumn: Math.max(0, sourceColumn),
    code,
  });
}

function utf8ByteLength(value: string): number {
  const codeUnit = value.charCodeAt(0);
  if (value.length === 2 && codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
    const next = value.charCodeAt(1);
    if (next >= 0xdc00 && next <= 0xdfff) return 4;
  }
  if (codeUnit <= 0x7f) return 1;
  if (codeUnit <= 0x7ff) return 2;
  return 3;
}

async function nextStreamChunk(
  iterator: AsyncIterator<string>,
  signal?: AbortSignal,
): Promise<IteratorResult<string> | undefined> {
  if (signal === undefined) return iterator.next();
  if (signal.aborted) return undefined;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<undefined>((resolve) => {
    onAbort = (): void => resolve(undefined);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([iterator.next(), aborted]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
  }
}

function closeStream(iterator: AsyncIterator<string>): void {
  try {
    const close = iterator.return?.();
    if (close !== undefined && typeof close.then === 'function') {
      void close.catch(() => undefined);
    }
  } catch {
    // Source cleanup is best effort; the paste remains fail-closed.
  }
}

function yieldStreamCheckpoint(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (continued: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(continued);
    };
    const onAbort = (): void => finish(false);
    timer = setTimeout(() => finish(true), 0);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
