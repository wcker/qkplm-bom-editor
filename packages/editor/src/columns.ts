import type { BomSchema } from '@bom-editor/contracts';
import type { BomColumnDefinition } from '@bom-editor/runtime';
import {
  BOM_EDITOR_ERROR_CODES,
  editorError,
  editorFailure,
  editorSuccess,
} from './errors.js';

export function normalizeEditorColumns(
  input: readonly BomColumnDefinition[],
  schema: BomSchema,
): import('@bom-editor/contracts').BomResult<
  readonly Readonly<BomColumnDefinition>[]
> {
  if (!Array.isArray(input) || input.length === 0) {
    return editorFailure(
      editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
        option: 'columns',
      }),
    );
  }
  const schemaFieldsByPath = new Map(
    schema.fields.map((field) => [
      field.path.map(pathSegment).join('/'),
      field,
    ]),
  );
  const ids = new Set<string>();
  const columns: Readonly<BomColumnDefinition>[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const column = input[index]!;
    const field = Array.isArray(column.fieldPath)
      ? schemaFieldsByPath.get(column.fieldPath.map(pathSegment).join('/'))
      : undefined;
    const fieldName = field?.fieldId;
    if (
      typeof column.columnId !== 'string' ||
      column.columnId.length === 0 ||
      ids.has(column.columnId) ||
      typeof column.label !== 'string' ||
      (column.headerGroup !== undefined && (!Array.isArray(column.headerGroup) || column.headerGroup.some((label: string) => typeof label !== 'string' || label.length === 0))) ||
      !Array.isArray(column.fieldPath) ||
      column.fieldPath.length === 0 ||
      field === undefined ||
      (column.fieldName !== undefined &&
        (typeof column.fieldName !== 'string' || column.fieldName !== fieldName)) ||
      !Number.isFinite(column.width) ||
      column.width <= 0 ||
      (column.minWidth !== undefined &&
        (!Number.isFinite(column.minWidth) || column.minWidth <= 0)) ||
      (column.maxWidth !== undefined &&
        (!Number.isFinite(column.maxWidth) ||
          column.maxWidth < (column.minWidth ?? 0))) ||
      (column.minWidth !== undefined && column.width < column.minWidth) ||
      (column.maxWidth !== undefined && column.width > column.maxWidth) ||
      (column.visible !== undefined && typeof column.visible !== 'boolean') ||
      (index === 0 && column.visible === false) ||
      typeof column.editable !== 'boolean' ||
      !isColumnFormat(column.format) ||
      (column.alignment !== undefined &&
        column.alignment !== 'start' &&
        column.alignment !== 'center' &&
        column.alignment !== 'end') ||
      (column.wrapText !== undefined && typeof column.wrapText !== 'boolean') ||
      (column.frozen !== false &&
        column.frozen !== 'start' &&
        column.frozen !== 'end')
    ) {
      return editorFailure(
        editorError(BOM_EDITOR_ERROR_CODES.configInvalid, 'CONFIG', {
          option: 'columns',
          columnId:
            typeof column.columnId === 'string'
              ? column.columnId
              : '<invalid>',
        }),
      );
    }
    ids.add(column.columnId);
    columns.push(
      Object.freeze({
        columnId: column.columnId,
        fieldName: fieldName!,
        fieldPath: Object.freeze([...column.fieldPath]),
        label: column.label,
        ...(column.headerGroup === undefined ? {} : { headerGroup: Object.freeze([...column.headerGroup]) }),
        width: column.width,
        ...(column.minWidth === undefined
          ? {}
          : { minWidth: column.minWidth }),
        ...(column.maxWidth === undefined
          ? {}
          : { maxWidth: column.maxWidth }),
        visible: column.visible !== false,
        editable: column.editable,
        frozen: column.frozen,
        ...(column.format === undefined
          ? {}
          : { format: Object.freeze({ ...column.format }) }),
        ...(column.alignment === undefined
          ? {}
          : { alignment: column.alignment }),
        ...(column.wrapText === undefined ? {} : { wrapText: column.wrapText }),
        ...(column.a11y === undefined
          ? {}
          : { a11y: Object.freeze({ ...column.a11y }) }),
      }),
    );
  }
  return editorSuccess(Object.freeze(columns));
}

function isColumnFormat(
  format: BomColumnDefinition['format'],
): boolean {
  if (format === undefined) return true;
  if (typeof format !== 'object' || format === null) return false;
  const fractionDigitsValid = (value: number | undefined): boolean =>
    value === undefined ||
    (Number.isSafeInteger(value) && value >= 0 && value <= 20);
  const maximumDenominatorValid = (value: number | undefined): boolean =>
    value === undefined ||
    (Number.isSafeInteger(value) && value >= 2 && value <= 1000);
  const dateStyleValid = (value: unknown): boolean =>
    value === undefined || value === 'short' || value === 'medium' || value === 'long' || value === 'full';
  const timeStyleValid = (value: unknown): boolean =>
    value === undefined || value === 'short' || value === 'medium' || value === 'long';
  switch (format.kind) {
    case 'text':
      return true;
    case 'integer':
      return format.useGrouping === undefined || typeof format.useGrouping === 'boolean';
    case 'decimal':
      return (
        fractionDigitsValid(format.minimumFractionDigits) &&
        fractionDigitsValid(format.maximumFractionDigits) &&
        (format.minimumFractionDigits === undefined ||
          format.maximumFractionDigits === undefined ||
          format.minimumFractionDigits <= format.maximumFractionDigits) &&
        (format.useGrouping === undefined || typeof format.useGrouping === 'boolean') &&
        (format.unit === undefined ||
          format.unit === 'preserve' ||
          format.unit === 'hidden')
      );
    case 'percent':
      return (
        fractionDigitsValid(format.minimumFractionDigits) &&
        fractionDigitsValid(format.maximumFractionDigits) &&
        (format.minimumFractionDigits === undefined ||
          format.maximumFractionDigits === undefined ||
          format.minimumFractionDigits <= format.maximumFractionDigits)
      );
    case 'currency':
      return (
        typeof format.currency === 'string' &&
        /^[A-Z]{3}$/u.test(format.currency) &&
        fractionDigitsValid(format.minimumFractionDigits) &&
        fractionDigitsValid(format.maximumFractionDigits) &&
        (format.minimumFractionDigits === undefined ||
          format.maximumFractionDigits === undefined ||
          format.minimumFractionDigits <= format.maximumFractionDigits)
      );
    case 'accounting':
      return (
        typeof format.currency === 'string' &&
        /^[A-Z]{3}$/u.test(format.currency) &&
        fractionDigitsValid(format.minimumFractionDigits) &&
        fractionDigitsValid(format.maximumFractionDigits) &&
        (format.minimumFractionDigits === undefined ||
          format.maximumFractionDigits === undefined ||
          format.minimumFractionDigits <= format.maximumFractionDigits) &&
        (format.useGrouping === undefined || typeof format.useGrouping === 'boolean')
      );
    case 'scientific':
      return (
        fractionDigitsValid(format.minimumFractionDigits) &&
        fractionDigitsValid(format.maximumFractionDigits) &&
        (format.minimumFractionDigits === undefined ||
          format.maximumFractionDigits === undefined ||
          format.minimumFractionDigits <= format.maximumFractionDigits)
      );
    case 'fraction':
      return maximumDenominatorValid(format.maximumDenominator) &&
        (format.useGrouping === undefined || typeof format.useGrouping === 'boolean');
    case 'date':
      return dateStyleValid(format.dateStyle);
    case 'datetime':
      return dateStyleValid(format.dateStyle) && timeStyleValid(format.timeStyle);
    default:
      return false;
  }
}

function pathSegment(value: string): string {
  return String(value.length) + ':' + value;
}
