import type {
  BomError,
  BomRecoveryBundle,
} from '@bom-editor/contracts';
import {
  BomEditStateMachine,
  EventHub,
  ResourceRegistry,
  type BomCellAddress,
  type BomCellRange,
  type BomClipboardPolicy,
  type BomClipboardRequest,
  type BomColumnDefinition,
  type BomEventMap,
  type BomPasteInput,
  type BomPastePolicy,
  type BomSelectionState,
} from '../src/index.js';

const column: BomColumnDefinition = {
  columnId: 'quantity',
  fieldName: 'quantity',
  fieldPath: ['quantity'],
  label: 'Quantity',
  width: 120,
  minWidth: 72,
  maxWidth: 320,
  editable: true,
  frozen: 'start',
  a11y: { required: true },
};

const address: BomCellAddress = {
  occurrenceId: 'occurrence-1',
  columnId: column.columnId,
};

const selection: BomSelectionState = { activeCell: address, range: null };
void selection;

const clipboardPolicy: BomClipboardPolicy = {
  authorize(request: Readonly<BomClipboardRequest>) {
    request.formats[0] satisfies
      | 'text/plain'
      | 'text/html'
      | 'internal'
      | undefined;
    return { decisionId: 'fixture-copy', allowed: true };
  },
};
void clipboardPolicy;

const pastePolicy: BomPastePolicy = {
  authorize(request) {
    request.operation satisfies 'paste';
    request.cells[0]?.address.columnId satisfies string | undefined;
    return { decisionId: 'fixture-paste', allowed: true };
  },
};
void pastePolicy;

const pasteInput: BomPasteInput = {
  internal: '{"version":1}',
  html: '<table></table>',
  text: 'Part',
};
void pasteInput;

const streamedPasteInput: BomPasteInput = {
  textStream: (async function* (): AsyncGenerator<string> {
    yield 'Part';
  })(),
};
void streamedPasteInput;

const range: BomCellRange = { anchor: address, focus: address };
const rangedSelection: BomSelectionState = { activeCell: address, range };
void rangedSelection;

// @ts-expect-error range is required so single-cell selection stays explicit.
const incompleteSelection: BomSelectionState = { activeCell: address };
void incompleteSelection;

const hub = new EventHub({ instanceId: 'instance-1' });
hub.on('beforeEdit', (event) => {
  const inferredAddress: BomCellAddress = event.address;
  event.preventDefault();
  void inferredAddress;
});
hub.on('selectionChanged', (event) => {
  const inferredSelection: BomSelectionState = event.selection;
  void inferredSelection;
});
hub.on('clipboardOperation', (event) => {
  event.operation satisfies 'copy' | 'cut' | 'copy-branch' | 'cut-branch';
  event.outcome satisfies 'written' | 'denied' | 'failed';
  event.method satisfies 'async' | 'event-fallback' | undefined;
});
hub.on('pasteOperation', (event) => {
  event.source satisfies 'api' | 'event';
  event.outcome satisfies 'committed' | 'denied' | 'failed';
  event.format satisfies 'internal' | 'html' | 'tsv' | 'csv' | 'text' | undefined;
  event.inputBytes satisfies number;
});
hub.on('metric', (event) => {
  const inferredValue: number = event.value;
  // @ts-expect-error ordinary runtime events are not cancellable
  event.preventDefault();
  void inferredValue;
});

hub.dispatch('beforeEdit', {
  documentId: 'document-1',
  documentGeneration: 1,
  address,
  initialValue: null,
  trigger: 'api',
});
hub.dispatch('clipboardOperation', {
  documentId: 'document-1',
  documentGeneration: 1,
  operation: 'copy',
  outcome: 'written',
  method: 'event-fallback',
  decisionId: 'fixture-copy',
  occurrenceCount: 1,
  fieldIds: ['quantity'],
  formats: ['text/plain'],
});
hub.dispatch('pasteOperation', {
  documentId: 'document-1',
  documentGeneration: 1,
  source: 'api',
  outcome: 'committed',
  inputBytes: 12,
  format: 'tsv',
  rowCount: 1,
  columnCount: 1,
  targetCellCount: 1,
  diagnosticCount: 0,
  decisionId: 'fixture-paste',
  transactionId: 'transaction-paste',
});

declare const recoveryBundle: BomRecoveryBundle;
hub.dispatch('transactionPersistenceChanged', {
  documentId: 'document-1',
  documentGeneration: 1,
  transactionId: 'transaction-1',
  origin: 'persistence:recovery',
  previousRevision: 'local-1',
  revision: 'local-2',
  patch: {
    protocolVersion: '1.0.0',
    documentId: 'document-1',
    baseRevision: 'local-1',
    transactionId: 'transaction-1',
    origin: 'persistence:recovery',
    timestamp: '2026-07-20T00:00:00.000Z',
    operations: [],
  },
  state: 'reloadRequired',
  sourceRevision: 'source-1',
  recoveryId: 'recovery-1',
  retryable: true,
  recoveryBundle,
});
hub.on('transactionPersistenceChanged', (event) => {
  event.recoveryId satisfies string | undefined;
  event.retryable satisfies boolean | undefined;
  event.recoveryBundle satisfies BomRecoveryBundle | undefined;
});

type BeforeCommit = BomEventMap['beforeCommit'];
declare const beforeCommit: BeforeCommit;
beforeCommit.preventDefault();

const editMachine = new BomEditStateMachine();
const error: BomError = {
  code: 'BOM_TEST',
  category: 'VALIDATION',
  messageKey: 'bom.test',
  recoverable: true,
};
editMachine.transition({ type: 'reject', error });

declare const eventTarget: EventTarget;
declare const eventListener: EventListener;
const resources = new ResourceRegistry();
resources.trackEvent(eventTarget, 'click', eventListener);
resources.trackObserver({ disconnect() {} }, 'resize-observer');
resources.trackTimeout(1, () => {});
resources.trackInterval(1, () => {});
resources.trackWorker({ terminate() {} });
resources.trackTask(() => {}, 'worker-task');
const resourceKind = resources.getDiagnostics().kinds[0];
if (resourceKind !== undefined) {
  resourceKind.tracked satisfies boolean;
}
resources.getDiagnostics().cleanupFailureCount satisfies number;
hub.listenerCount satisfies number;
hub.registeredListenerCount satisfies number;
hub.removedListenerCount satisfies number;
hub.pendingAsyncListenerCount satisfies number;
