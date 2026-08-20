import type { ClipboardParseDiagnostic } from './paste.js';

export interface XlsxLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxCellBytes: number;
  readonly maxEntries: number;
  readonly maxSheets: number;
  readonly maxUncompressedBytes: number;
}

export type XlsxParseResult =
  | {
      readonly ok: true;
      readonly rows: readonly (readonly string[])[];
      readonly sheetName?: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'input-too-large'
        | 'zip-invalid'
        | 'zip-limit'
        | 'zip-unsupported'
        | 'xml-invalid'
        | 'workbook-invalid'
        | 'relationships-invalid'
        | 'too-many-sheets'
        | 'sheet-name-missing'
        | 'macro-present'
        | 'external-link-present'
        | 'formula-present'
        | 'sheet-missing'
        | 'too-many-rows'
        | 'too-many-columns'
        | 'too-many-cells'
        | 'cell-too-large'
        | 'aborted';
      readonly sheetName?: string;
      readonly availableSheetNames?: readonly string[];
      readonly diagnostics?: readonly ClipboardParseDiagnostic[];
    };

export interface XlsxWriterLimits {
  readonly maxBytes: number;
  readonly maxCellBytes: number;
}

export type XlsxWriteResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: 'output-too-large' | 'cell-too-large' };

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;

export async function parseXlsx(
  bytes: Uint8Array,
  limits: Readonly<XlsxLimits>,
  signal?: AbortSignal,
  requestedSheetName?: string,
): Promise<XlsxParseResult> {
  if (signal?.aborted) return { ok: false, reason: 'aborted' };
  if (bytes.byteLength > limits.maxBytes) return { ok: false, reason: 'input-too-large' };
  const archive = readCentralDirectory(bytes, limits);
  if (!archive.ok) return archive;
  const entries = archive.entries;
  if (entries.some((entry) => entry.name.toLowerCase() === 'xl/vbaproject.bin')) {
    return { ok: false, reason: 'macro-present' };
  }
  if (entries.some((entry) => /^xl\/externallinks(?:\/|$)/iu.test(entry.name))) {
    return { ok: false, reason: 'external-link-present' };
  }
  const workbookEntry = entries.find((entry) => entry.name === 'xl/workbook.xml');
  const relationshipsEntry = entries.find((entry) => entry.name === 'xl/_rels/workbook.xml.rels');
  if (workbookEntry === undefined) return { ok: false, reason: 'workbook-invalid' };
  if (relationshipsEntry === undefined) return { ok: false, reason: 'relationships-invalid' };
  const sharedStringsEntry = entries.find((entry) => entry.name === 'xl/sharedStrings.xml');
  const [workbookBytes, relationshipsBytes, sharedStringsBytes] = await Promise.all([
    extractEntry(bytes, workbookEntry, signal),
    extractEntry(bytes, relationshipsEntry, signal),
    sharedStringsEntry === undefined
      ? Promise.resolve<Uint8Array | null>(null)
      : extractEntry(bytes, sharedStringsEntry, signal),
  ]);
  if (signal?.aborted) return { ok: false, reason: 'aborted' };
  if (
    workbookBytes === null ||
    relationshipsBytes === null ||
    (sharedStringsEntry !== undefined && sharedStringsBytes === null)
  ) {
    return { ok: false, reason: 'zip-invalid' };
  }
  let workbook: string;
  let relationships: string;
  try {
    workbook = new TextDecoder('utf-8', { fatal: true }).decode(workbookBytes);
    relationships = new TextDecoder('utf-8', { fatal: true }).decode(relationshipsBytes);
  } catch {
    return { ok: false, reason: 'xml-invalid' };
  }
  if (hasUnsafeXml(workbook) || hasUnsafeXml(relationships)) {
    return { ok: false, reason: 'xml-invalid' };
  }
  const sheets = parseWorkbookSheets(workbook, limits.maxSheets);
  if (sheets === null) return { ok: false, reason: 'workbook-invalid' };
  if (sheets.length > limits.maxSheets) return { ok: false, reason: 'too-many-sheets' };
  const relationshipsMap = parseWorkbookRelationships(relationships);
  if (relationshipsMap === null) return { ok: false, reason: 'relationships-invalid' };
  const selectedSheet = requestedSheetName === undefined
    ? sheets[0]
    : sheets.find((sheet) => sheet.name === requestedSheetName);
  if (selectedSheet === undefined) {
    return {
      ok: false,
      reason: 'sheet-name-missing',
      ...(requestedSheetName === undefined ? {} : { sheetName: requestedSheetName }),
      availableSheetNames: Object.freeze(sheets.map((sheet) => sheet.name)),
    };
  }
  const worksheetPath = relationshipsMap.get(selectedSheet.relationshipId);
  if (worksheetPath === undefined) {
    return { ok: false, reason: 'relationships-invalid', sheetName: selectedSheet.name };
  }
  const worksheetEntry = entries.find((entry) => entry.name === worksheetPath);
  if (worksheetEntry === undefined) {
    return { ok: false, reason: 'sheet-missing', sheetName: selectedSheet.name };
  }
  const worksheetBytes = await extractEntry(bytes, worksheetEntry, signal);
  if (signal?.aborted) return { ok: false, reason: 'aborted' };
  if (worksheetBytes === null) return { ok: false, reason: 'zip-invalid', sheetName: selectedSheet.name };
  let worksheet: string;
  try {
    worksheet = new TextDecoder('utf-8', { fatal: true }).decode(worksheetBytes);
  } catch {
    return { ok: false, reason: 'xml-invalid', sheetName: selectedSheet.name };
  }
  if (hasUnsafeXml(worksheet)) return { ok: false, reason: 'xml-invalid', sheetName: selectedSheet.name };
  const sharedStrings = sharedStringsBytes === null
    ? []
    : parseSharedStrings(sharedStringsBytes);
  if (sharedStrings === null) return { ok: false, reason: 'xml-invalid', sheetName: selectedSheet.name };
  const parsed = parseWorksheet(worksheet, sharedStrings, limits, signal);
  return parsed.ok
    ? { ...parsed, sheetName: selectedSheet.name }
    : { ...parsed, sheetName: selectedSheet.name };
}

export function createXlsxWorkbook(
  rows: readonly (readonly string[])[],
  limits: Readonly<XlsxWriterLimits>,
): XlsxWriteResult {
  for (const row of rows) {
    for (const cell of row) {
      if (utf8Length(cell) > limits.maxCellBytes) return { ok: false, reason: 'cell-too-large' };
    }
  }
  const worksheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) =>
      '<c r="' + cellReference(rowIndex + 1, columnIndex) + '" t="inlineStr"><is><t>' +
      escapeXml(cell) +
      '</t></is></c>',
    ).join('');
    return '<row r="' + String(rowIndex + 1) + '">' + cells + '</row>';
  }).join('');
  const entries: readonly ZipEntryInput[] = [
    {
      name: '[Content_Types].xml',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="BOM" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
        worksheetRows +
        '</sheetData></worksheet>',
    },
  ];
  const bytes = createStoredZip(entries);
  return bytes.byteLength > limits.maxBytes
    ? { ok: false, reason: 'output-too-large' }
    : { ok: true, bytes };
}

interface ZipEntry {
  readonly name: string;
  readonly compression: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly crc: number;
  readonly localOffset: number;
}

interface ZipEntryInput {
  readonly name: string;
  readonly text: string;
}

interface ZipArchive {
  readonly ok: true;
  readonly entries: readonly ZipEntry[];
}

type ZipArchiveResult = ZipArchive | { readonly ok: false; readonly reason: 'zip-invalid' | 'zip-limit' | 'zip-unsupported' };

function readCentralDirectory(
  bytes: Uint8Array,
  limits: Readonly<XlsxLimits>,
): ZipArchiveResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (offset >= 0 && view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || eocd + 22 > bytes.byteLength) return { ok: false, reason: 'zip-invalid' };
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || centralDisk !== 0 || count > limits.maxEntries || centralOffset + centralSize > bytes.byteLength) {
    return { ok: false, reason: count > limits.maxEntries ? 'zip-limit' : 'zip-invalid' };
  }
  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) return { ok: false, reason: 'zip-invalid' };
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if ((flags & 0x1) !== 0 || (flags & 0x8) !== 0 || (compression !== 0 && compression !== 8)) {
      return { ok: false, reason: 'zip-unsupported' };
    }
    if (offset + 46 + nameLength + extraLength + commentLength > bytes.byteLength) return { ok: false, reason: 'zip-invalid' };
    let name: string;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    } catch {
      return { ok: false, reason: 'zip-invalid' };
    }
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) return { ok: false, reason: 'zip-invalid' };
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > limits.maxUncompressedBytes) return { ok: false, reason: 'zip-limit' };
    entries.push(Object.freeze({ name, compression, compressedSize, uncompressedSize, crc, localOffset }));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { ok: true, entries: Object.freeze(entries) };
}

async function extractEntry(
  bytes: Uint8Array,
  entry: Readonly<ZipEntry>,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (signal?.aborted) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.localOffset + 30 > bytes.byteLength || view.getUint32(entry.localOffset, true) !== LOCAL_SIGNATURE) return null;
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (start < 0 || end > bytes.byteLength) return null;
  const compressed = bytes.subarray(start, end);
  let output: Uint8Array;
  if (entry.compression === 0) {
    output = new Uint8Array(compressed);
  } else {
    try {
      const compressedBuffer = compressed.buffer.slice(
        compressed.byteOffset,
        compressed.byteOffset + compressed.byteLength,
      ) as ArrayBuffer;
      const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      output = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      return null;
    }
  }
  if (signal?.aborted || output.byteLength !== entry.uncompressedSize || crc32(output) !== entry.crc) return null;
  return output;
}

interface WorkbookSheet {
  readonly name: string;
  readonly relationshipId: string;
}

function parseWorkbookSheets(
  xml: string,
  maxSheets: number,
): readonly WorkbookSheet[] | null {
  if (!/<workbook\b[^>]*>/iu.test(xml) || !/<sheets\b[^>]*>/iu.test(xml)) {
    return null;
  }
  const result: WorkbookSheet[] = [];
  const names = new Set<string>();
  const sheetPattern = /<sheet\b([^>]*?)(?:\/>|>)/gu;
  let match: RegExpExecArray | null;
  while ((match = sheetPattern.exec(xml)) !== null) {
    const attributes = match[1]!;
    const name = decodeXml(attribute(attributes, 'name') ?? '');
    const relationshipId = attribute(attributes, 'r:id') ?? attribute(attributes, 'id') ?? '';
    if (name.length === 0 || relationshipId.length === 0 || names.has(name)) return null;
    names.add(name);
    result.push(Object.freeze({ name, relationshipId }));
    if (result.length > maxSheets) return Object.freeze(result);
  }
  return result.length === 0 ? null : Object.freeze(result);
}

function parseWorkbookRelationships(xml: string): Map<string, string> | null {
  if (!/<Relationships\b[^>]*>/iu.test(xml)) return null;
  const result = new Map<string, string>();
  const relationshipPattern = /<Relationship\b([^>]*?)(?:\/>|>)/gu;
  let match: RegExpExecArray | null;
  while ((match = relationshipPattern.exec(xml)) !== null) {
    const attributes = match[1]!;
    const id = attribute(attributes, 'Id');
    const type = decodeXml(attribute(attributes, 'Type') ?? '');
    const targetMode = decodeXml(attribute(attributes, 'TargetMode') ?? '');
    const target = decodeXml(attribute(attributes, 'Target') ?? '');
    if (
      id === undefined ||
      target.length === 0 ||
      targetMode.toLowerCase() === 'external' ||
      !type.endsWith('/worksheet')
    ) {
      continue;
    }
    const normalized = normalizeRelationshipTarget(target);
    if (normalized === null || result.has(id)) return null;
    result.set(id, normalized);
  }
  return result;
}

function normalizeRelationshipTarget(target: string): string | null {
  if (
    target.startsWith('/') ||
    target.includes('\\') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target)
  ) {
    return null;
  }
  const segments = ['xl'];
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length <= 1) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 1 ? segments.join('/') : null;
}

function parseSharedStrings(bytes: Uint8Array): string[] | null {
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (hasUnsafeXml(xml)) return null;
  const values: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/gu;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml)) !== null) {
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/gu;
    let text = '';
    let textMatch: RegExpExecArray | null;
    while ((textMatch = textPattern.exec(match[1]!)) !== null) text += decodeXml(textMatch[1]!);
    values.push(text);
  }
  return values;
}

function parseWorksheet(
  xml: string,
  sharedStrings: readonly string[],
  limits: Readonly<XlsxLimits>,
  signal?: AbortSignal,
): XlsxParseResult {
  if (hasUnsafeXml(xml)) return { ok: false, reason: 'xml-invalid' };
  const rows = new Map<number, string[]>();
  const rowPattern = /<row\b([^>]*)>([\s\S]*?)<\/row>/gu;
  let rowMatch: RegExpExecArray | null;
  let cellCount = 0;
  let maxColumn = 0;
  let maxRowNumber = 0;
  let stopAfterRow = false;
  const diagnostics: ClipboardParseDiagnostic[] = [];
  let failureReason: Extract<XlsxParseResult, { readonly ok: false }>['reason'] | undefined;
  const fail = (
    reason: Extract<XlsxParseResult, { readonly ok: false }>['reason'],
    sourceRow = 0,
    sourceColumn = 0,
  ): void => {
    failureReason ??= reason;
    if (diagnostics.length < MAX_XLSX_CELL_DIAGNOSTICS) {
      diagnostics.push(xlsxDiagnostic(reason, sourceRow, sourceColumn));
    }
  };
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    if (signal?.aborted) return { ok: false, reason: 'aborted' };
    const declaredRow = Number.parseInt(
      attribute(rowMatch[1]!, 'r') ?? String(rows.size + 1),
      10,
    );
    const rowNumber = Number.isSafeInteger(declaredRow) && declaredRow >= 1
      ? declaredRow
      : rows.size + 1;
    if (rowNumber !== declaredRow) {
      fail('xml-invalid', rows.size, 0);
    }
    if (rowNumber > limits.maxRows || rows.size >= limits.maxRows) {
      fail('too-many-rows', Math.max(0, rowNumber - 1), 0);
      break;
    }
    maxRowNumber = Math.max(maxRowNumber, rowNumber);
    const values: string[] = [];
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[2]!)) !== null) {
      cellCount += 1;
      if (cellCount > limits.maxCells) {
        fail('too-many-cells', rowNumber - 1, values.length);
        stopAfterRow = true;
        break;
      }
      const ref = attribute(cellMatch[1]!, 'r');
      const column = ref === undefined ? values.length : columnFromReference(ref);
      if (column < 0 || column >= limits.maxColumns) {
        fail('too-many-columns', rowNumber - 1, Math.max(0, column));
        continue;
      }
      maxColumn = Math.max(maxColumn, column + 1);
      while (values.length <= column) values.push('');
      const type = attribute(cellMatch[1]!, 't');
      const body = cellMatch[2] ?? '';
      if (/<f\b/iu.test(body)) {
        fail('formula-present', rowNumber - 1, column);
      }
      let value: string;
      if (type === 'inlineStr') {
        value = parseInlineString(body);
      } else {
        const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1] ?? '';
        if (type === 's') {
          const index = Number.parseInt(raw, 10);
          if (!Number.isSafeInteger(index) || index < 0 || index >= sharedStrings.length) {
            fail('xml-invalid', rowNumber - 1, column);
            value = '';
          } else {
            value = sharedStrings[index]!;
          }
        } else if (type === 'b') {
          value = raw === '1' ? 'true' : raw === '0' ? 'false' : raw;
        } else if (type === 'e') {
          fail('xml-invalid', rowNumber - 1, column);
          value = '';
        } else {
          value = decodeXml(raw);
        }
      }
      if (utf8Length(value) > limits.maxCellBytes) {
        fail('cell-too-large', rowNumber - 1, column);
        value = '';
      }
      values[column] = value;
    }
    rows.set(rowNumber - 1, values);
    if (stopAfterRow) break;
  }
  if (failureReason !== undefined) {
    return {
      ok: false,
      reason: failureReason,
      diagnostics: Object.freeze(diagnostics),
    };
  }
  if (rows.size > limits.maxRows) return { ok: false, reason: 'too-many-rows' };
  const output: string[][] = [];
  for (let rowIndex = 0; rowIndex < maxRowNumber; rowIndex += 1) {
    const row = rows.get(rowIndex) ?? [];
    while (row.length < maxColumn) row.push('');
    output.push(row);
  }
  return { ok: true, rows: Object.freeze(output.map((row) => Object.freeze(row))) };
}

const MAX_XLSX_CELL_DIAGNOSTICS = 256;

function xlsxDiagnostic(
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

function parseInlineString(body: string): string {
  const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/gu;
  let value = '';
  let match: RegExpExecArray | null;
  while ((match = textPattern.exec(body)) !== null) value += decodeXml(match[1]!);
  return value;
}

function hasUnsafeXml(xml: string): boolean {
  return /<!DOCTYPE|<!ENTITY|<script\b|<iframe\b|<object\b|<embed\b/iu.test(xml);
}

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = `\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`;
  const match = attributes.match(new RegExp(pattern, 'u'));
  return match?.[1] ?? match?.[2];
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/giu, (match, entity: string) => {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    const code = entity.startsWith('#x') || entity.startsWith('#X')
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : match;
  });
}

function columnFromReference(reference: string): number {
  const letters = reference.match(/^[A-Za-z]+/u)?.[0];
  if (letters === undefined) return -1;
  let value = 0;
  for (const character of letters.toUpperCase()) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function cellReference(row: number, column: number): string {
  let value = column + 1;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters + String(row);
}

function createStoredZip(entries: readonly ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.byteLength + data.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_SIGNATURE, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.byteLength);
    localParts.push(local);
    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL_SIGNATURE, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.byteLength;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const part of localParts) { output.set(part, cursor); cursor += part.byteLength; }
  const centralOffset = cursor;
  for (const part of centralParts) { output.set(part, cursor); cursor += part.byteLength; }
  const view = new DataView(output.buffer);
  view.setUint32(cursor, EOCD_SIGNATURE, true);
  view.setUint16(cursor + 8, entries.length, true);
  view.setUint16(cursor + 10, entries.length, true);
  view.setUint32(cursor + 12, centralSize, true);
  view.setUint32(cursor + 16, centralOffset, true);
  return output;
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
