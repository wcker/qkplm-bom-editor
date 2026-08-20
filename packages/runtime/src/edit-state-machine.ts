import type { BomValue } from '@bom-editor/contracts';
import type {
  BomCommittingEditState,
  BomEditAction,
  BomEditDraft,
  BomEditState,
  BomEditTransitionResult,
  BomEditingEditState,
  BomRejectedEditState,
  BomValidatingEditState,
} from './types.js';

const IDLE_STATE: Readonly<BomEditState> = Object.freeze({
  status: 'idle',
  draft: null,
});

const FOCUSED_STATE: Readonly<BomEditState> = Object.freeze({
  status: 'focused',
  draft: null,
});

function ownDraft(draft: Readonly<BomEditDraft>): Readonly<BomEditDraft> {
  return Object.freeze({
    address: Object.freeze({ ...draft.address }),
    originalValue: draft.originalValue,
    value: draft.value,
    dirty: draft.dirty,
  });
}

function updateDraft(
  draft: Readonly<BomEditDraft>,
  value: BomValue,
): Readonly<BomEditDraft> {
  return Object.freeze({
    address: draft.address,
    originalValue: draft.originalValue,
    value,
    dirty: !Object.is(value, draft.originalValue),
  });
}

function editingState(
  draft: Readonly<BomEditDraft>,
): Readonly<BomEditingEditState> {
  return Object.freeze({ status: 'editing', draft });
}

function validatingState(
  draft: Readonly<BomEditDraft>,
  action: Extract<BomEditAction, { readonly type: 'beginValidation' }>,
): Readonly<BomValidatingEditState> {
  if (action.validationId === undefined) {
    return Object.freeze({ status: 'validating', draft });
  }
  return Object.freeze({
    status: 'validating',
    draft,
    validationId: action.validationId,
  });
}

function committingState(
  draft: Readonly<BomEditDraft>,
  action: Extract<BomEditAction, { readonly type: 'beginCommit' }>,
): Readonly<BomCommittingEditState> {
  if (action.transactionId === undefined) {
    return Object.freeze({ status: 'committing', draft });
  }
  return Object.freeze({
    status: 'committing',
    draft,
    transactionId: action.transactionId,
  });
}

function rejectedState(
  state: Readonly<BomValidatingEditState | BomCommittingEditState>,
  action: Extract<BomEditAction, { readonly type: 'reject' }>,
): Readonly<BomRejectedEditState> {
  return Object.freeze({
    status: 'rejected',
    draft: state.draft,
    phase: state.status === 'validating' ? 'validation' : 'commit',
    error: action.error,
  });
}

function reduceEditState(
  state: Readonly<BomEditState>,
  action: Readonly<BomEditAction>,
): Readonly<BomEditState> | undefined {
  switch (state.status) {
    case 'idle':
      return action.type === 'focus' ? FOCUSED_STATE : undefined;

    case 'focused':
      if (action.type === 'blur') {
        return IDLE_STATE;
      }
      if (action.type === 'beginEdit') {
        return editingState(ownDraft(action.draft));
      }
      return undefined;

    case 'editing':
      if (action.type === 'updateDraft') {
        return editingState(updateDraft(state.draft, action.value));
      }
      if (action.type === 'compositionStart') {
        return Object.freeze({ status: 'composing', draft: state.draft });
      }
      if (action.type === 'beginValidation') {
        return validatingState(state.draft, action);
      }
      if (action.type === 'cancel') {
        return FOCUSED_STATE;
      }
      return undefined;

    case 'composing':
      if (action.type === 'updateDraft') {
        return Object.freeze({
          status: 'composing',
          draft: updateDraft(state.draft, action.value),
        });
      }
      if (action.type === 'compositionEnd') {
        return editingState(state.draft);
      }
      return undefined;

    case 'validating':
      if (action.type === 'beginCommit') {
        return committingState(state.draft, action);
      }
      if (action.type === 'reject') {
        return rejectedState(state, action);
      }
      if (action.type === 'cancel') {
        return FOCUSED_STATE;
      }
      return undefined;

    case 'committing':
      if (action.type === 'reject') {
        return rejectedState(state, action);
      }
      if (action.type === 'commitSucceeded') {
        return FOCUSED_STATE;
      }
      return undefined;

    case 'rejected':
      if (action.type === 'updateDraft') {
        return editingState(updateDraft(state.draft, action.value));
      }
      if (action.type === 'beginValidation') {
        return validatingState(state.draft, action);
      }
      if (action.type === 'cancel') {
        return FOCUSED_STATE;
      }
      return undefined;
  }
}

export class BomEditStateMachine {
  #state: Readonly<BomEditState> = IDLE_STATE;

  public get state(): Readonly<BomEditState> {
    return this.#state;
  }

  public canTransition(action: Readonly<BomEditAction>): boolean {
    return reduceEditState(this.#state, action) !== undefined;
  }

  public transition(
    action: Readonly<BomEditAction>,
  ): BomEditTransitionResult {
    const previous = this.#state;
    const next = reduceEditState(previous, action);
    if (next === undefined) {
      return Object.freeze({
        ok: false,
        code: 'BOM_EDIT_INVALID_TRANSITION',
        from: previous.status,
        action: action.type,
      });
    }
    this.#state = next;
    return Object.freeze({ ok: true, previous, state: next });
  }
}

export function createBomEditStateMachine(): BomEditStateMachine {
  return new BomEditStateMachine();
}
