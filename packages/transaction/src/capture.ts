import type {
  BomCommand,
  BomCommandBatch,
  BomFields,
  BomNode,
  BomOperation,
  BomPatch,
  BomPlacement,
  BomValue,
} from '@bom-editor/contracts';
import { normalizeBomValue } from '@bom-editor/model';
import {
  BOM_TRANSACTION_ERROR_CODES,
  transactionError,
  transactionFailure,
  transactionSuccess,
} from './errors.js';
import type { BomTransactionResult } from './types.js';

export function captureCommand<TFields extends BomFields>(
  command: BomCommand<TFields>,
): BomTransactionResult<BomCommand<TFields>> {
  switch (command.type) {
    case 'insertNode': {
      const node = captureInsertNode(command.node);
      if (!node.ok) return node;
      return transactionSuccess(
        Object.freeze({
          type: command.type,
          parentId: command.parentId,
          placement: capturePlacement(command.placement),
          node: node.value,
        }),
      );
    }
    case 'deleteSubtree':
      return transactionSuccess(
        Object.freeze({ type: command.type, occurrenceId: command.occurrenceId }),
      );
    case 'moveSubtree':
      return transactionSuccess(
        Object.freeze({
          type: command.type,
          occurrenceId: command.occurrenceId,
          newParentId: command.newParentId,
          placement: capturePlacement(command.placement),
        }),
      );
    case 'setField': {
      const value = normalizeBomValue(command.value, { path: ['command', 'value'] });
      if (!value.ok) return transactionFailure(value.errors);
      return transactionSuccess(
        Object.freeze({
          type: command.type,
          occurrenceId: command.occurrenceId,
          fieldPath: Object.freeze([...command.fieldPath]),
          value: value.value,
          ...(command.expectedValueHash === undefined
            ? {}
            : { expectedValueHash: command.expectedValueHash }),
        }),
      );
    }
    case 'unsetField':
      return transactionSuccess(
        Object.freeze({
          type: command.type,
          occurrenceId: command.occurrenceId,
          fieldPath: Object.freeze([...command.fieldPath]),
          ...(command.expectedPresent === undefined
            ? {}
            : { expectedPresent: command.expectedPresent }),
          ...(command.expectedValueHash === undefined
            ? {}
            : { expectedValueHash: command.expectedValueHash }),
        }),
      );
    case 'setMaterialRef':
      return transactionSuccess(
        Object.freeze({
          type: command.type,
          occurrenceId: command.occurrenceId,
          ...(command.materialId === undefined ? {} : { materialId: command.materialId }),
          ...(command.materialRevision === undefined
            ? {}
            : { materialRevision: command.materialRevision }),
          ...(command.materialCode === undefined
            ? {}
            : { materialCode: command.materialCode }),
        }),
      );
    default: {
      const payload = normalizeBomValue(command.payload, {
        path: ['command', 'payload'],
      });
      if (!payload.ok) return transactionFailure(payload.errors);
      return transactionSuccess(
        Object.freeze({ type: command.type, payload: payload.value }),
      );
    }
  }
}

export function captureCommandBatch<TFields extends BomFields>(
  batch: BomCommandBatch<TFields>,
): BomTransactionResult<BomCommandBatch<TFields>> {
  const commands: BomCommand<TFields>[] = [];
  for (const command of batch.commands) {
    const captured = captureCommand(command);
    if (!captured.ok) return captured;
    commands.push(captured.value);
  }
  return transactionSuccess(
    Object.freeze({
      protocolVersion: batch.protocolVersion,
      documentId: batch.documentId,
      documentGeneration: batch.documentGeneration,
      baseRevision: batch.baseRevision,
      transactionId: batch.transactionId,
      ...(batch.dependsOnTransactionId === undefined
        ? {}
        : { dependsOnTransactionId: batch.dependsOnTransactionId }),
      origin: batch.origin,
      timestamp: batch.timestamp,
      ...(batch.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: batch.idempotencyKey }),
      ...(batch.label === undefined ? {} : { label: batch.label }),
      commands: Object.freeze(commands),
    }),
  );
}

export function capturePatch<TFields extends BomFields>(
  patch: BomPatch<TFields>,
): BomTransactionResult<BomPatch<TFields>> {
  const operations: BomOperation<TFields>[] = [];
  for (const operation of patch.operations) {
    const captured = captureOperation(operation);
    if (!captured.ok) return captured;
    operations.push(captured.value);
  }
  return transactionSuccess(
    Object.freeze({
      protocolVersion: patch.protocolVersion,
      documentId: patch.documentId,
      baseRevision: patch.baseRevision,
      transactionId: patch.transactionId,
      ...(patch.dependsOnTransactionId === undefined
        ? {}
        : { dependsOnTransactionId: patch.dependsOnTransactionId }),
      origin: patch.origin,
      timestamp: patch.timestamp,
      ...(patch.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: patch.idempotencyKey }),
      operations: Object.freeze(operations),
    }),
  );
}

function captureOperation<TFields extends BomFields>(
  operation: BomOperation<TFields>,
): BomTransactionResult<BomOperation<TFields>> {
  switch (operation.op) {
    case 'insertNode': {
      const node = captureFullNode(operation.node);
      return node.ok
        ? transactionSuccess(Object.freeze({ op: operation.op, node: node.value }))
        : node;
    }
    case 'deleteSubtree':
      return transactionSuccess(
        Object.freeze({ op: operation.op, occurrenceId: operation.occurrenceId }),
      );
    case 'moveSubtree':
      return transactionSuccess(
        Object.freeze({
          op: operation.op,
          occurrenceId: operation.occurrenceId,
          newParentId: operation.newParentId,
          positionKey: operation.positionKey,
        }),
      );
    case 'updateField': {
      const value = normalizeBomValue(operation.value, {
        path: ['patch', 'operations', 'value'],
      });
      if (!value.ok) return transactionFailure(value.errors);
      return transactionSuccess(
        Object.freeze({
          op: operation.op,
          occurrenceId: operation.occurrenceId,
          fieldPath: Object.freeze([...operation.fieldPath]),
          value: value.value,
          ...(operation.expectedValueHash === undefined
            ? {}
            : { expectedValueHash: operation.expectedValueHash }),
        }),
      );
    }
    case 'unsetField':
      return transactionSuccess(
        Object.freeze({
          op: operation.op,
          occurrenceId: operation.occurrenceId,
          fieldPath: Object.freeze([...operation.fieldPath]),
          ...(operation.expectedValueHash === undefined
            ? {}
            : { expectedValueHash: operation.expectedValueHash }),
        }),
      );
    case 'setMaterialRef':
      return transactionSuccess(
        Object.freeze({
          op: operation.op,
          occurrenceId: operation.occurrenceId,
          ...(operation.materialId === undefined
            ? {}
            : { materialId: operation.materialId }),
          ...(operation.materialRevision === undefined
            ? {}
            : { materialRevision: operation.materialRevision }),
          ...(operation.materialCode === undefined
            ? {}
            : { materialCode: operation.materialCode }),
        }),
      );
    case 'reorder':
      return transactionSuccess(
        Object.freeze({
          op: operation.op,
          occurrenceId: operation.occurrenceId,
          positionKey: operation.positionKey,
        }),
      );
    case 'rebalancePositions':
      return transactionSuccess(
        Object.freeze({
          op: operation.op,
          parentId: operation.parentId,
          positions: Object.freeze(
            operation.positions.map((position) =>
              Object.freeze({
                occurrenceId: position.occurrenceId,
                positionKey: position.positionKey,
              }),
            ),
          ),
        }),
      );
    default:
      return transactionFailure(
        transactionError(
          BOM_TRANSACTION_ERROR_CODES.operationUnsupported,
          'VALIDATION',
        ),
      );
  }
}

function captureInsertNode<TFields extends BomFields>(
  node: Omit<BomNode<TFields>, 'parentId' | 'positionKey'>,
): BomTransactionResult<Omit<BomNode<TFields>, 'parentId' | 'positionKey'>> {
  const fields = captureFields<TFields>(node.fields);
  if (!fields.ok) return fields;
  return transactionSuccess(
    Object.freeze({
      occurrenceId: node.occurrenceId,
      kind: node.kind,
      ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
      ...(node.materialRevision === undefined
        ? {}
        : { materialRevision: node.materialRevision }),
      ...(node.materialCode === undefined ? {} : { materialCode: node.materialCode }),
      ...(node.childrenState === undefined
        ? {}
        : { childrenState: node.childrenState }),
      ...(node.knownChildCount === undefined
        ? {}
        : { knownChildCount: node.knownChildCount }),
      fields: fields.value,
    }),
  );
}

function captureFullNode<TFields extends BomFields>(
  node: BomNode<TFields>,
): BomTransactionResult<BomNode<TFields>> {
  const captured = captureInsertNode(node);
  if (!captured.ok) return captured;
  return transactionSuccess(
    Object.freeze({
      ...captured.value,
      parentId: node.parentId,
      positionKey: node.positionKey,
    }),
  );
}

function captureFields<TFields extends BomFields>(
  fields: TFields,
): BomTransactionResult<TFields> {
  const normalized = normalizeBomValue(fields, { path: ['fields'] });
  return normalized.ok
    ? transactionSuccess(normalized.value as TFields)
    : transactionFailure(normalized.errors);
}

function capturePlacement(
  placement: BomPlacement,
): BomPlacement {
  if ('at' in placement) {
    return Object.freeze({ at: placement.at });
  }
  if ('beforeOccurrenceId' in placement) {
    return Object.freeze({ beforeOccurrenceId: placement.beforeOccurrenceId });
  }
  return Object.freeze({ afterOccurrenceId: placement.afterOccurrenceId });
}

export function captureOperationList<TFields extends BomFields>(
  operations: readonly BomOperation<TFields>[],
): BomTransactionResult<readonly BomOperation<TFields>[]> {
  const captured: BomOperation<TFields>[] = [];
  for (const operation of operations) {
    const result = captureOperation(operation);
    if (!result.ok) return result;
    captured.push(result.value);
  }
  return transactionSuccess(Object.freeze(captured));
}


