export type ClipboardTextFormat = 'tsv' | 'csv' | 'text';

export interface ClipboardTextParseLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxCellBytes: number;
}

/** A value-free source location emitted when parsing rejects one candidate. */
export interface ClipboardParseDiagnostic {
  readonly sourceRow: number;
  readonly sourceColumn: number;
  readonly code: string;
}

export type ClipboardTextParseFailureReason =
  | 'input-too-large'
  | 'too-many-rows'
  | 'too-many-columns'
  | 'too-many-cells'
  | 'cell-too-large'
  | 'malformed';

export interface ClipboardTextParseSuccess {
  readonly ok: true;
  readonly format: ClipboardTextFormat;
  readonly rows: readonly (readonly string[])[];
}

export interface ClipboardTextParseFailure {
  readonly ok: false;
  readonly reason: ClipboardTextParseFailureReason;
  readonly diagnostics?: readonly ClipboardParseDiagnostic[];
}

export type ClipboardTextParseResult =
  | ClipboardTextParseSuccess
  | ClipboardTextParseFailure;

export type ClipboardTextParsePhase = 'measure' | 'detect' | 'parse';

export interface ClipboardTextParseCheckpoint {
  readonly phase: ClipboardTextParsePhase;
  /** UTF-16 offset consumed by the current parser pass. */
  readonly offset: number;
}

/** Scheduling controls for the internal cooperative plain-text parser. */
export interface ClipboardTextParseAsyncOptions {
  readonly signal?: AbortSignal;
  /** UTF-16 code units processed before the parser cooperatively yields. */
  readonly maxUnitsPerSlice?: number;
  /** Replaces the default macrotask yield and is primarily useful in tests. */
  readonly checkpoint?: (
    checkpoint: Readonly<ClipboardTextParseCheckpoint>,
  ) => void | Promise<void>;
}

/**
 * An aborted result reports the UTF-8 bytes observed before cancellation. It is
 * exact once measurement has completed and is otherwise a safe lower bound.
 */
export type ClipboardTextParseAsyncResult =
  | {
      readonly status: 'parsed';
      readonly inputBytes: number;
      readonly parsed: ClipboardTextParseResult;
    }
  | {
      readonly status: 'aborted';
      readonly inputBytes: number;
    };

interface NormalizedClipboardTextParseLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxCellBytes: number;
}

interface ClipboardTextFormatDetection {
  readonly format: ClipboardTextFormat;
  readonly hasLineBreak: boolean;
}

interface ClipboardTextParseProgress {
  inputBytes: number;
  phase: ClipboardTextParsePhase;
  offset: number;
}

interface ClipboardTextParseStepper {
  readonly maxUnitsPerSlice: number;
  readonly progress: ClipboardTextParseProgress;
  unitsSinceYield: number;
}

type ClipboardTextParseGenerator<T> = Generator<void, T, void>;

type DelimitedParseState =
  | 'field-start'
  | 'unquoted'
  | 'quoted'
  | 'quote-closed';

const DEFAULT_MAX_UNITS_PER_PARSE_SLICE = 8 * 1024;

/**
 * Parses a clipboard plain-text payload without allocating an encoded copy of
 * the full input. Delimited formats use RFC-style quotes. A plain single-line
 * value remains untouched, while line-oriented text is treated as TSV rows.
 */
export function parseClipboardText(
  text: string,
  limits: Readonly<ClipboardTextParseLimits>,
): ClipboardTextParseResult {
  const progress = createClipboardTextParseProgress();
  return runClipboardTextParseSynchronously(
    createClipboardTextParseGenerator(
      text,
      limits,
      Number.MAX_SAFE_INTEGER,
      progress,
    ),
  );
}

/**
 * Cooperatively parses the same grammar as `parseClipboardText()`. The result
 * intentionally nests the synchronous result so cancellation cannot be
 * confused with a malformed or limit failure.
 */
export async function parseClipboardTextAsync(
  text: string,
  limits: Readonly<ClipboardTextParseLimits>,
  options: Readonly<ClipboardTextParseAsyncOptions> = {},
): Promise<ClipboardTextParseAsyncResult> {
  const progress = createClipboardTextParseProgress();
  if (options.signal?.aborted) {
    return abortedClipboardTextParse(progress);
  }

  const parser = createClipboardTextParseGenerator(
    text,
    limits,
    normalizeMaxUnitsPerSlice(options.maxUnitsPerSlice),
    progress,
  );
  for (;;) {
    if (options.signal?.aborted) {
      return abortedClipboardTextParse(progress);
    }
    const next = parser.next();
    if (next.done) {
      if (options.signal?.aborted) {
        return abortedClipboardTextParse(progress);
      }
      return {
        status: 'parsed',
        inputBytes: progress.inputBytes,
        parsed: next.value,
      };
    }

    // Check before scheduling and again after the scheduler returns. The
    // latter observes an AbortController triggered by a test checkpoint too.
    if (options.signal?.aborted) {
      return abortedClipboardTextParse(progress);
    }
    const continued = await awaitClipboardTextParseCheckpoint(
      options.checkpoint,
      clipboardTextParseCheckpoint(progress),
      options.signal,
    );
    if (!continued || options.signal?.aborted) {
      return abortedClipboardTextParse(progress);
    }
  }
}

function* createClipboardTextParseGenerator(
  text: string,
  limits: Readonly<ClipboardTextParseLimits>,
  maxUnitsPerSlice: number,
  progress: ClipboardTextParseProgress,
): ClipboardTextParseGenerator<ClipboardTextParseResult> {
  const normalizedLimits = normalizeLimits(limits);
  const stepper: ClipboardTextParseStepper = {
    maxUnitsPerSlice,
    progress,
    unitsSinceYield: 0,
  };
  const byteLength = yield* measureUtf8ByteLength(
    text,
    normalizedLimits.maxBytes,
    progress,
    stepper,
  );
  if (byteLength === undefined) {
    return failure('input-too-large', diagnostic('input-too-large'));
  }

  beginClipboardTextParsePhase(stepper, 'detect');
  const detection = yield* detectClipboardTextFormat(text, stepper);
  beginClipboardTextParsePhase(stepper, 'parse');
  if (detection.format === 'text') {
    if (detection.hasLineBreak) {
      return yield* parseSingleColumnTextRows(text, normalizedLimits, stepper);
    }
    return parseSingleTextCell(text, byteLength, normalizedLimits);
  }
  return yield* parseDelimitedText(
    text,
    detection.format,
    normalizedLimits,
    stepper,
  );
}

function runClipboardTextParseSynchronously(
  parser: ClipboardTextParseGenerator<ClipboardTextParseResult>,
): ClipboardTextParseResult {
  for (;;) {
    const next = parser.next();
    if (next.done) {
      return next.value;
    }
  }
}

function parseSingleTextCell(
  text: string,
  byteLength: number,
  limits: NormalizedClipboardTextParseLimits,
): ClipboardTextParseResult {
  if (limits.maxRows < 1) {
    return failure('too-many-rows', diagnostic('too-many-rows'));
  }
  if (limits.maxColumns < 1) {
    return failure('too-many-columns', diagnostic('too-many-columns'));
  }
  if (limits.maxCells < 1) {
    return failure('too-many-cells', diagnostic('too-many-cells'));
  }
  if (byteLength > limits.maxCellBytes) {
    return failure('cell-too-large', diagnostic('cell-too-large'));
  }
  return {
    ok: true,
    format: 'text',
    rows: [[text]],
  };
}

/**
 * No column separator is present, so line-oriented text is a one-column TSV
 * range. Keep quote characters literal here: a complete quoted TSV payload is
 * recognized before this fallback and goes through the RFC-style parser.
 */
function* parseSingleColumnTextRows(
  text: string,
  limits: NormalizedClipboardTextParseLimits,
  stepper: ClipboardTextParseStepper,
): ClipboardTextParseGenerator<ClipboardTextParseResult> {
  if (limits.maxRows < 1) {
    return failure('too-many-rows', diagnostic('too-many-rows'));
  }
  if (limits.maxColumns < 1) {
    return failure('too-many-columns', diagnostic('too-many-columns'));
  }
  if (limits.maxCells < 1) {
    return failure('too-many-cells', diagnostic('too-many-cells'));
  }

  const rows: string[][] = [];
  let rowStart = 0;
  let cellByteLength = 0;

  const finishRow = (
    rowEnd: number,
  ): ClipboardTextParseFailureReason | undefined => {
    if (rows.length >= limits.maxRows) {
      return 'too-many-rows';
    }
    if (rows.length >= limits.maxCells) {
      return 'too-many-cells';
    }
    rows.push([text.slice(rowStart, rowEnd)]);
    return undefined;
  };

  for (let index = 0; index < text.length; ) {
    const lineBreakWidth = lineBreakWidthAt(text, index);
    if (lineBreakWidth > 0) {
      const reason = finishRow(index);
    if (reason !== undefined) {
        return failure(reason, diagnostic(reason, rows.length, 0));
      }
      rowStart = index + lineBreakWidth;
      cellByteLength = 0;
      index += lineBreakWidth;
      if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
        yield;
      }
      continue;
    }

    const utf8 = utf8CharacterAt(text, index);
    if (cellByteLength > limits.maxCellBytes - utf8.bytes) {
      return failure('cell-too-large', diagnostic('cell-too-large', rows.length, 0));
    }
    cellByteLength += utf8.bytes;
    index += utf8.width;
    if (consumeClipboardTextParseUnits(stepper, utf8.width)) {
      yield;
    }
  }

  if (rowStart < text.length) {
    const reason = finishRow(text.length);
    if (reason !== undefined) {
      return failure(reason, diagnostic(reason, rows.length, 0));
    }
  }

  return {
    ok: true,
    format: 'tsv',
    rows,
  };
}

function* parseDelimitedText(
  text: string,
  format: Extract<ClipboardTextFormat, 'tsv' | 'csv'>,
  limits: NormalizedClipboardTextParseLimits,
  stepper: ClipboardTextParseStepper,
): ClipboardTextParseGenerator<ClipboardTextParseResult> {
  const delimiter = format === 'tsv' ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let startedRows = 0;
  let startedCells = 0;
  let cellActive = false;
  let cellByteLength = 0;
  let state: DelimitedParseState = 'field-start';
  let unquotedStart = -1;
  let quotedContentStart = -1;
  let quotedEnd = -1;
  let escapedSegmentStart = -1;
  let escapedSegments: string[] | undefined;

  const beginCell = (): ClipboardTextParseFailureReason | undefined => {
    if (row.length >= limits.maxColumns) {
      return 'too-many-columns';
    }
    if (startedCells >= limits.maxCells) {
      return 'too-many-cells';
    }

    startedCells += 1;
    cellActive = true;
    cellByteLength = 0;
    state = 'field-start';
    unquotedStart = -1;
    quotedContentStart = -1;
    quotedEnd = -1;
    escapedSegmentStart = -1;
    escapedSegments = undefined;
    return undefined;
  };

  const beginRowAndCell = (): ClipboardTextParseFailureReason | undefined => {
    if (startedRows >= limits.maxRows) {
      return 'too-many-rows';
    }

    startedRows += 1;
    row = [];
    return beginCell();
  };

  const appendCellBytes = (bytes: number): boolean => {
    if (cellByteLength > limits.maxCellBytes - bytes) {
      return false;
    }
    cellByteLength += bytes;
    return true;
  };

  const finishCell = (): void => {
    let value = '';
    if (state === 'unquoted') {
      value = text.slice(unquotedStart, index);
    } else if (state === 'quote-closed') {
      if (escapedSegments === undefined) {
        value = text.slice(quotedContentStart, quotedEnd);
      } else {
        escapedSegments.push(text.slice(escapedSegmentStart, quotedEnd));
        value = escapedSegments.join('');
      }
    }
    row.push(value);
    cellActive = false;
  };

  const finishRow = (): void => {
    rows.push(row);
    row = [];
    state = 'field-start';
  };

  let reason = beginRowAndCell();
  if (reason !== undefined) {
    return failure(
      reason,
      diagnostic(reason, reason === 'too-many-rows' ? startedRows : 0, 0),
    );
  }

  let index = 0;
  while (index < text.length) {
    if (state === 'field-start') {
      if (!cellActive) {
        reason = beginRowAndCell();
        if (reason !== undefined) {
          return failure(
            reason,
            diagnostic(
              reason,
              reason === 'too-many-rows' ? startedRows : startedRows - 1,
              0,
            ),
          );
        }
      }

      const lineBreakWidth = lineBreakWidthAt(text, index);
      if (lineBreakWidth > 0) {
        finishCell();
        finishRow();
        index += lineBreakWidth;
        if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
          yield;
        }
        continue;
      }

      const character = text.charAt(index);
      if (character === delimiter) {
        finishCell();
        reason = beginCell();
        if (reason !== undefined) {
          return failure(reason, diagnostic(reason, startedRows - 1, row.length));
        }
        index += 1;
        if (consumeClipboardTextParseUnits(stepper, 1)) {
          yield;
        }
        continue;
      }
      if (character === '"') {
        state = 'quoted';
        quotedContentStart = index + 1;
        escapedSegmentStart = index + 1;
        index += 1;
        if (consumeClipboardTextParseUnits(stepper, 1)) {
          yield;
        }
        continue;
      }

      state = 'unquoted';
      unquotedStart = index;
      const utf8 = utf8CharacterAt(text, index);
      if (!appendCellBytes(utf8.bytes)) {
        return failure('cell-too-large', diagnostic('cell-too-large', startedRows - 1, row.length));
      }
      index += utf8.width;
      if (consumeClipboardTextParseUnits(stepper, utf8.width)) {
        yield;
      }
      continue;
    }

    if (state === 'unquoted') {
      const lineBreakWidth = lineBreakWidthAt(text, index);
      if (lineBreakWidth > 0) {
        finishCell();
        finishRow();
        index += lineBreakWidth;
        if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
          yield;
        }
        continue;
      }

      const character = text.charAt(index);
      if (character === delimiter) {
        finishCell();
        reason = beginCell();
        if (reason !== undefined) {
          return failure(reason, diagnostic(reason, startedRows - 1, row.length));
        }
        index += 1;
        if (consumeClipboardTextParseUnits(stepper, 1)) {
          yield;
        }
        continue;
      }
      if (character === '"') {
        return failure(
          'malformed',
          diagnostic('malformed-quote', startedRows - 1, row.length),
        );
      }

      const utf8 = utf8CharacterAt(text, index);
      if (!appendCellBytes(utf8.bytes)) {
        return failure('cell-too-large', diagnostic('cell-too-large', startedRows - 1, row.length));
      }
      index += utf8.width;
      if (consumeClipboardTextParseUnits(stepper, utf8.width)) {
        yield;
      }
      continue;
    }

    if (state === 'quoted') {
      const character = text.charAt(index);
      if (character === '"') {
        if (text.charAt(index + 1) === '"') {
          if (!appendCellBytes(1)) {
            return failure('cell-too-large', diagnostic('cell-too-large', startedRows - 1, row.length));
          }
          if (escapedSegments === undefined) {
            escapedSegments = [];
          }
          escapedSegments.push(text.slice(escapedSegmentStart, index));
          escapedSegments.push('"');
          escapedSegmentStart = index + 2;
          index += 2;
          if (consumeClipboardTextParseUnits(stepper, 2)) {
            yield;
          }
          continue;
        }

        quotedEnd = index;
        state = 'quote-closed';
        index += 1;
        if (consumeClipboardTextParseUnits(stepper, 1)) {
          yield;
        }
        continue;
      }

      const utf8 = utf8CharacterAt(text, index);
      if (!appendCellBytes(utf8.bytes)) {
        return failure('cell-too-large', diagnostic('cell-too-large', startedRows - 1, row.length));
      }
      index += utf8.width;
      if (consumeClipboardTextParseUnits(stepper, utf8.width)) {
        yield;
      }
      continue;
    }

    const lineBreakWidth = lineBreakWidthAt(text, index);
    if (lineBreakWidth > 0) {
      finishCell();
      finishRow();
      index += lineBreakWidth;
      if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
        yield;
      }
      continue;
    }

    if (text.charAt(index) === delimiter) {
      finishCell();
      reason = beginCell();
      if (reason !== undefined) {
        return failure(reason, diagnostic(reason, startedRows - 1, row.length));
      }
      index += 1;
      if (consumeClipboardTextParseUnits(stepper, 1)) {
        yield;
      }
      continue;
    }

    return failure(
      'malformed',
      diagnostic('malformed-quote', startedRows - 1, row.length),
    );
  }

  if (state === 'quoted') {
    return failure(
      'malformed',
      diagnostic('malformed-quote', startedRows - 1, row.length),
    );
  }
  if (cellActive) {
    finishCell();
    finishRow();
  }

  return {
    ok: true,
    format,
    rows,
  };
}

function* detectClipboardTextFormat(
  text: string,
  stepper: ClipboardTextParseStepper,
): ClipboardTextParseGenerator<ClipboardTextFormatDetection> {
  let hasUnquotedTab = false;
  let hasUnquotedComma = false;
  let hasLineBreak = false;
  let atFieldStart = true;
  let quoted = false;

  for (let index = 0; index < text.length; ) {
    const character = text.charAt(index);
    if (quoted) {
      if (character === '\r' || character === '\n') {
        hasLineBreak = true;
      }
      if (character === '"') {
        if (text.charAt(index + 1) === '"') {
          index += 2;
          if (consumeClipboardTextParseUnits(stepper, 2)) {
            yield;
          }
          continue;
        }
        quoted = false;
      }
      index += 1;
      if (consumeClipboardTextParseUnits(stepper, 1)) {
        yield;
      }
      continue;
    }

    if (character === '\t') {
      hasUnquotedTab = true;
      atFieldStart = true;
      index += 1;
      if (consumeClipboardTextParseUnits(stepper, 1)) {
        yield;
      }
      continue;
    }
    if (character === ',') {
      hasUnquotedComma = true;
      atFieldStart = true;
      index += 1;
      if (consumeClipboardTextParseUnits(stepper, 1)) {
        yield;
      }
      continue;
    }

    const lineBreakWidth = lineBreakWidthAt(text, index);
    if (lineBreakWidth > 0) {
      hasLineBreak = true;
      atFieldStart = true;
      index += lineBreakWidth;
      if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
        yield;
      }
      continue;
    }
    if (character === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      index += 1;
      if (consumeClipboardTextParseUnits(stepper, 1)) {
        yield;
      }
      continue;
    }

    atFieldStart = false;
    index += 1;
    if (consumeClipboardTextParseUnits(stepper, 1)) {
      yield;
    }
  }

  if (hasUnquotedTab) {
    return { format: 'tsv', hasLineBreak };
  }
  if (hasUnquotedComma) {
    return { format: 'csv', hasLineBreak };
  }
  beginClipboardTextParsePhase(stepper, 'detect');
  if (yield* isEscapedTsvText(text, stepper)) {
    return { format: 'tsv', hasLineBreak };
  }
  return { format: 'text', hasLineBreak };
}

/**
 * A copied TSV cell only needs quotes for a tab, line ending, or an escaped
 * quote. Recognize a complete quoted TSV payload only when at least one cell
 * has one of those escapes, so ordinary literal quotes stay intact.
 */
function* isEscapedTsvText(
  text: string,
  stepper: ClipboardTextParseStepper,
): ClipboardTextParseGenerator<boolean> {
  let state: DelimitedParseState = 'field-start';
  let hasEscapedCell = false;
  let currentQuotedCellEscaped = false;

  for (let index = 0; index < text.length; ) {
    if (state === 'field-start') {
      const lineBreakWidth = lineBreakWidthAt(text, index);
      if (lineBreakWidth > 0) {
        index += lineBreakWidth;
        if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
          yield;
        }
        continue;
      }
      if (text.charAt(index) === '"') {
        state = 'quoted';
        currentQuotedCellEscaped = false;
        index += 1;
        if (consumeClipboardTextParseUnits(stepper, 1)) {
          yield;
        }
        continue;
      }
      state = 'unquoted';
      continue;
    }

    if (state === 'unquoted') {
      const lineBreakWidth = lineBreakWidthAt(text, index);
      if (lineBreakWidth > 0) {
        state = 'field-start';
        index += lineBreakWidth;
        if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
          yield;
        }
        continue;
      }
      if (text.charAt(index) === '"') {
        return false;
      }
      const utf8 = utf8CharacterAt(text, index);
      index += utf8.width;
      if (consumeClipboardTextParseUnits(stepper, utf8.width)) {
        yield;
      }
      continue;
    }

    if (state === 'quoted') {
      const lineBreakWidth = lineBreakWidthAt(text, index);
      if (lineBreakWidth > 0) {
        currentQuotedCellEscaped = true;
        index += lineBreakWidth;
        if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
          yield;
        }
        continue;
      }
      const character = text.charAt(index);
      if (character === '\t') {
        currentQuotedCellEscaped = true;
        index += 1;
        if (consumeClipboardTextParseUnits(stepper, 1)) {
          yield;
        }
        continue;
      }
      if (character === '"') {
        if (text.charAt(index + 1) === '"') {
          currentQuotedCellEscaped = true;
          index += 2;
          if (consumeClipboardTextParseUnits(stepper, 2)) {
            yield;
          }
          continue;
        }
        state = 'quote-closed';
        index += 1;
        if (consumeClipboardTextParseUnits(stepper, 1)) {
          yield;
        }
        continue;
      }
      const utf8 = utf8CharacterAt(text, index);
      index += utf8.width;
      if (consumeClipboardTextParseUnits(stepper, utf8.width)) {
        yield;
      }
      continue;
    }

    const lineBreakWidth = lineBreakWidthAt(text, index);
    if (lineBreakWidth === 0) {
      return false;
    }
    hasEscapedCell ||= currentQuotedCellEscaped;
    state = 'field-start';
    index += lineBreakWidth;
    if (consumeClipboardTextParseUnits(stepper, lineBreakWidth)) {
      yield;
    }
  }

  if (state === 'quote-closed') {
    hasEscapedCell ||= currentQuotedCellEscaped;
    return hasEscapedCell;
  }
  return state !== 'quoted' && hasEscapedCell;
}

function* measureUtf8ByteLength(
  text: string,
  maxBytes: number,
  progress: ClipboardTextParseProgress,
  stepper: ClipboardTextParseStepper,
): ClipboardTextParseGenerator<number | undefined> {
  let bytes = 0;
  progress.inputBytes = 0;
  for (let index = 0; index < text.length; ) {
    const character = utf8CharacterAt(text, index);
    if (bytes > maxBytes - character.bytes) {
      progress.inputBytes = boundedInputBytesAtLimit(maxBytes);
      return undefined;
    }
    bytes += character.bytes;
    progress.inputBytes = bytes;
    index += character.width;
    if (consumeClipboardTextParseUnits(stepper, character.width)) {
      yield;
    }
  }
  return bytes;
}

function consumeClipboardTextParseUnits(
  stepper: ClipboardTextParseStepper,
  units: number,
): boolean {
  stepper.progress.offset += units;
  stepper.unitsSinceYield += units;
  if (stepper.unitsSinceYield < stepper.maxUnitsPerSlice) {
    return false;
  }
  stepper.unitsSinceYield = 0;
  return true;
}

function createClipboardTextParseProgress(): ClipboardTextParseProgress {
  return {
    inputBytes: 0,
    phase: 'measure',
    offset: 0,
  };
}

function beginClipboardTextParsePhase(
  stepper: ClipboardTextParseStepper,
  phase: ClipboardTextParsePhase,
): void {
  stepper.progress.phase = phase;
  stepper.progress.offset = 0;
  stepper.unitsSinceYield = 0;
}

function clipboardTextParseCheckpoint(
  progress: ClipboardTextParseProgress,
): Readonly<ClipboardTextParseCheckpoint> {
  return Object.freeze({
    phase: progress.phase,
    offset: progress.offset,
  });
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

function abortedClipboardTextParse(
  progress: ClipboardTextParseProgress,
): ClipboardTextParseAsyncResult {
  return {
    status: 'aborted',
    inputBytes: progress.inputBytes,
  };
}

async function awaitClipboardTextParseCheckpoint(
  checkpoint: ((
    checkpoint: Readonly<ClipboardTextParseCheckpoint>,
  ) => void | Promise<void>) | undefined,
  detail: Readonly<ClipboardTextParseCheckpoint>,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal?.aborted) {
    return false;
  }
  if (checkpoint === undefined) {
    return yieldClipboardTextParse(signal);
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

function yieldClipboardTextParse(signal: AbortSignal | undefined): Promise<boolean> {
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

function utf8CharacterAt(
  text: string,
  index: number,
): { readonly bytes: number; readonly width: number } {
  const codeUnit = text.charCodeAt(index);
  if (codeUnit <= 0x7f) {
    return { bytes: 1, width: 1 };
  }
  if (codeUnit <= 0x7ff) {
    return { bytes: 2, width: 1 };
  }
  if (
    codeUnit >= 0xd800 &&
    codeUnit <= 0xdbff &&
    index + 1 < text.length
  ) {
    const nextCodeUnit = text.charCodeAt(index + 1);
    if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
      return { bytes: 4, width: 2 };
    }
  }
  // TextEncoder serializes an unpaired surrogate as U+FFFD, also three bytes.
  return { bytes: 3, width: 1 };
}

function lineBreakWidthAt(text: string, index: number): 0 | 1 | 2 {
  const character = text.charAt(index);
  if (character === '\n') {
    return 1;
  }
  if (character === '\r') {
    return text.charAt(index + 1) === '\n' ? 2 : 1;
  }
  return 0;
}

function normalizeLimits(
  limits: Readonly<ClipboardTextParseLimits>,
): NormalizedClipboardTextParseLimits {
  return {
    maxBytes: normalizeLimit(limits.maxBytes),
    maxRows: normalizeLimit(limits.maxRows),
    maxColumns: normalizeLimit(limits.maxColumns),
    maxCells: normalizeLimit(limits.maxCells),
    maxCellBytes: normalizeLimit(limits.maxCellBytes),
  };
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

function failure(
  reason: ClipboardTextParseFailureReason,
  detail?: ClipboardParseDiagnostic,
): ClipboardTextParseFailure {
  return detail === undefined
    ? { ok: false, reason }
    : { ok: false, reason, diagnostics: Object.freeze([Object.freeze(detail)]) };
}

function diagnostic(
  code: string,
  sourceRow = 0,
  sourceColumn = 0,
): ClipboardParseDiagnostic {
  return {
    sourceRow: Math.max(0, sourceRow),
    sourceColumn: Math.max(0, sourceColumn),
    code,
  };
}
