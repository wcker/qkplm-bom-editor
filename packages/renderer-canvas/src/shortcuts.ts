import type {
  BomShortcutBinding,
  BomShortcutConfigurationResult,
  BomShortcutContext,
  BomShortcutDiagnostic,
  BomShortcutDiagnosticCode,
  BomShortcutRegistryOptions,
  BomShortcutScope,
} from './types.js';

const DEFAULT_SEQUENCE_TIMEOUT_MS = 1_000;
const MIN_SEQUENCE_TIMEOUT_MS = 100;
const MAX_SEQUENCE_TIMEOUT_MS = 10_000;
const MAX_BINDINGS = 256;
const MAX_SEQUENCE_LENGTH = 4;

interface ParsedStroke {
  readonly raw: string;
  readonly key: string | undefined;
  readonly code: string | undefined;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly primary: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly repeat: boolean;
}

interface NormalizedBinding {
  readonly id: string;
  readonly command: string;
  readonly strokes: readonly ParsedStroke[];
  readonly scopes: readonly BomShortcutScope[];
  readonly priority: number;
  readonly enabled: boolean;
  readonly preventDefault: boolean;
  readonly allowRepeat: boolean;
  readonly source: 'default' | 'configured';
}

export interface BomShortcutMatch {
  readonly binding: Readonly<BomShortcutBinding>;
  readonly command: string;
  readonly sequence: readonly string[];
}

interface PendingSequence {
  readonly startedAt: number;
  readonly strokes: readonly ParsedStroke[];
}

type ShortcutDiagnostic = Readonly<BomShortcutDiagnostic>;
type ShortcutFailure = {
  readonly ok: false;
  readonly diagnostics: readonly ShortcutDiagnostic[];
};

function shortcutFailure(
  diagnostics: readonly ShortcutDiagnostic[],
): ShortcutFailure {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function diagnostic(
  code: BomShortcutDiagnosticCode,
  extra: Omit<BomShortcutDiagnostic, 'code' | 'severity'> = {},
): ShortcutDiagnostic {
  return Object.freeze({ code, severity: 'error', ...extra });
}

const DEFAULT_BINDINGS: readonly BomShortcutBinding[] = Object.freeze([
  binding('grid.copy', 'Primary+C', 'copy'),
  binding('grid.cut', 'Primary+X', 'cut'),
  binding('tree.copy-branch', 'Primary+Shift+B', 'copy-branch'),
  binding('tree.cut-branch', 'Primary+Shift+K', 'cut-branch'),
  binding('tree.delete-subtree', 'Shift+Delete', 'delete-subtree'),
  binding('tree.insert-sibling', 'Insert', 'insert-sibling'),
  binding('tree.insert-child', 'Primary+Insert', 'insert-child'),
  binding('tree.expand-all', 'Primary+Shift+ArrowDown', 'expand-all'),
  binding('tree.collapse-all', 'Primary+Shift+ArrowUp', 'collapse-all'),
  binding('tree.move-up', 'Alt+ArrowUp', 'move-up'),
  binding('tree.move-down', 'Alt+ArrowDown', 'move-down'),
  binding('tree.outdent', 'Alt+ArrowLeft', 'outdent'),
  binding('tree.indent', 'Alt+ArrowRight', 'indent'),
  binding(
    'grid.resize-column-left',
    'Primary+Alt+ArrowLeft',
    'resize-column-left',
  ),
  binding(
    'grid.resize-column-right',
    'Primary+Alt+ArrowRight',
    'resize-column-right',
  ),
  binding(
    'grid.reorder-column-left',
    'Primary+Shift+ArrowLeft',
    'reorder-column-left',
  ),
  binding(
    'grid.reorder-column-right',
    'Primary+Shift+ArrowRight',
    'reorder-column-right',
  ),
  binding('grid.hide-column', 'Primary+Shift+H', 'hide-column'),
  binding(
    'grid.show-all-columns',
    'Primary+Shift+Alt+H',
    'show-all-columns',
  ),
  binding('grid.insert-column', 'Primary+Shift+Code:Equal', 'insert-column'),
  binding('grid.delete-column', 'Primary+-', 'delete-column'),
  binding('grid.hide-column-excel', 'Primary+0', 'hide-column'),
  binding('grid.show-all-columns-excel', 'Primary+Shift+0', 'show-all-columns'),
  binding(
    'grid.freeze-column-start',
    'Primary+Alt+Shift+ArrowLeft',
    'freeze-column-start',
  ),
  binding(
    'grid.freeze-column-end',
    'Primary+Alt+Shift+ArrowRight',
    'freeze-column-end',
  ),
  binding(
    'grid.unfreeze-column',
    'Primary+Alt+Shift+ArrowUp',
    'unfreeze-column',
  ),
  binding('grid.select-all', 'Primary+A', 'select-all'),
  binding('grid.undo', 'Primary+Z', 'undo'),
  binding('grid.redo', 'Primary+Y', 'redo'),
  binding('grid.redo-shift', 'Primary+Shift+Z', 'redo'),
  binding('grid.axis-row', 'Shift+Space', 'select-row'),
  binding('grid.axis-column', 'Primary+Space', 'select-column'),
  binding('grid.clear', 'Delete', 'clear-selection'),
  binding('grid.clear-backspace', 'Backspace', 'clear-selection'),
  binding('grid.fill-down', 'Primary+D', 'fill-down'),
  binding('grid.fill-series', 'Primary+Alt+Shift+D', 'fill-series'),
  binding('grid.request-edit-enter', 'Enter', 'request-edit'),
  binding('grid.request-edit-f2', 'F2', 'request-edit'),
  binding('portal.cancel', 'Escape', 'cancel-edit', 'editing'),
  binding('portal.fill-selection', 'Primary+Enter', 'fill-selection', 'editing'),
  binding('portal.commit-enter', 'Enter', 'commit-enter', 'editing'),
  binding('portal.commit-tab', 'Tab', 'commit-tab', 'editing'),
  binding('portal.commit-shift-tab', 'Shift+Tab', 'commit-shift-tab', 'editing'),
]);

function binding(
  id: string,
  keys: string,
  command: string,
  scope: BomShortcutScope = 'focused',
): BomShortcutBinding {
  return Object.freeze({ id, keys, command, scope });
}

/**
 * Small, deterministic registry used by the browser renderer. Defaults are
 * intentionally kept here instead of in the event handlers so a configured
 * binding can replace or disable one atomically.
 */
export class BomShortcutRegistry {
  readonly #defaults: readonly NormalizedBinding[];
  #configured = new Map<string, NormalizedBinding>();
  #timeoutMs = DEFAULT_SEQUENCE_TIMEOUT_MS;
  #pending: PendingSequence | null = null;

  public constructor(options?: Readonly<BomShortcutRegistryOptions>) {
    const defaults = DEFAULT_BINDINGS.map((candidate) =>
      normalizeBinding(candidate, 'default'),
    );
    const validDefaults = defaults.filter(
      (
        candidate,
      ): candidate is Extract<ReturnType<typeof normalizeBinding>, { readonly ok: true }> =>
        candidate.ok,
    );
    if (validDefaults.length !== defaults.length) {
      throw new RangeError('BOM_RENDERER_DEFAULT_SHORTCUT_INVALID');
    }
    this.#defaults = Object.freeze(
      validDefaults.map((candidate) => candidate.value),
    );
    const result = this.configure(options);
    if (!result.ok) {
      throw new RangeError('BOM_RENDERER_SHORTCUT_INVALID');
    }
  }

  public configure(
    options?: Readonly<BomShortcutRegistryOptions>,
  ): BomShortcutConfigurationResult {
    let candidate: ReturnType<typeof normalizeOptions>;
    try {
      candidate = normalizeOptions(options);
    } catch {
      return shortcutFailure([diagnostic('invalid-options')]);
    }
    if (!candidate.ok) {
      return candidate;
    }
    const next = new Map<string, NormalizedBinding>();
    const diagnostics = [...candidate.diagnostics];
    for (const binding of candidate.bindings) {
      if (next.has(binding.id)) {
        diagnostics.push({
          code: 'duplicate-id',
          severity: 'error',
          id: binding.id,
        });
        continue;
      }
      next.set(binding.id, binding);
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return shortcutFailure(diagnostics);
    }
    const conflicts = detectConflicts(this.#defaults, next);
    diagnostics.push(...conflicts);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return shortcutFailure(diagnostics);
    }
    this.#configured = next;
    this.#timeoutMs = candidate.timeoutMs;
    this.#pending = null;
    return Object.freeze({
      ok: true,
      state: Object.freeze({
        bindings: Object.freeze(
          [...next.values()].map((entry) => publicBinding(entry)),
        ),
        sequenceTimeoutMs: this.#timeoutMs,
      }),
      diagnostics: Object.freeze(diagnostics),
    });
  }

  public reset(): BomShortcutConfigurationResult {
    this.#configured = new Map();
    this.#timeoutMs = DEFAULT_SEQUENCE_TIMEOUT_MS;
    this.#pending = null;
    return Object.freeze({
      ok: true,
      state: Object.freeze({
        bindings: Object.freeze([]),
        sequenceTimeoutMs: this.#timeoutMs,
      }),
      diagnostics: Object.freeze([]),
    });
  }

  public isDefaultEnabled(id: string): boolean {
    const override = this.#configured.get(id);
    // Any configured entry with a default id owns that id's binding. This
    // suppresses the old default stroke even when the replacement moved it to
    // another key; `enabled: false` therefore behaves as an explicit unbind.
    return override === undefined;
  }

  public consume(
    event: KeyboardEvent,
    scope: BomShortcutContext,
  ): Readonly<
    | { readonly kind: 'matched'; readonly value: BomShortcutMatch }
    | { readonly kind: 'pending' }
  > | null {
    if (
      event.isComposing ||
      event.keyCode === 229 ||
      (typeof event.getModifierState === 'function' &&
        event.getModifierState('AltGraph'))
    ) {
      this.#pending = null;
      return null;
    }
    const now = Date.now();
    const pending = this.#pending;
    if (pending !== null && now - pending.startedAt > this.#timeoutMs) {
      this.#pending = null;
    }
    const current = parseEventStroke(event);
    if (current === null) {
      this.#pending = null;
      return null;
    }
    const prefix = this.#pending === null
      ? [current]
      : [...this.#pending.strokes, current];
    const candidates = this.#configuredEntries(scope).filter((entry) =>
      (entry.allowRepeat || !current.repeat) &&
      entry.strokes.length >= prefix.length &&
      prefix.every((stroke, index) => strokeMatches(stroke, entry.strokes[index]!)),
    );
    if (candidates.length === 0 && this.#pending !== null) {
      this.#pending = null;
      return this.consume(event, scope);
    }
    if (candidates.length === 0) {
      return null;
    }
    const complete = candidates.filter((entry) => entry.strokes.length === prefix.length);
    const winner = chooseWinner(complete);
    if (winner !== null) {
      this.#pending = null;
      return Object.freeze({
        kind: 'matched',
        value: Object.freeze({
          binding: publicBinding(winner),
          command: winner.command,
          sequence: Object.freeze(winner.strokes.map((stroke) => stroke.raw)),
        }),
      });
    }
    this.#pending = Object.freeze({ startedAt: now, strokes: Object.freeze(prefix) });
    return Object.freeze({ kind: 'pending' });
  }

  public clearPending(): void {
    this.#pending = null;
  }

  public get state(): Readonly<BomShortcutRegistryOptions> {
    return Object.freeze({
      bindings: Object.freeze(
        [...this.#configured.values()].map((entry) => publicBinding(entry)),
      ),
      sequenceTimeoutMs: this.#timeoutMs,
    });
  }

  #configuredEntries(scope: BomShortcutContext): readonly NormalizedBinding[] {
    return [...this.#configured.values()].filter(
      (entry) => entry.enabled && entry.scopes.includes(scope),
    );
  }
}

export function validateBomShortcutOptions(
  options?: Readonly<BomShortcutRegistryOptions>,
): BomShortcutConfigurationResult {
  try {
    const registry = new BomShortcutRegistry();
    return registry.configure(options);
  } catch {
      return shortcutFailure([diagnostic('invalid-options')]);
  }
}

function normalizeOptions(
  options?: Readonly<BomShortcutRegistryOptions>,
):
  | {
      readonly ok: true;
      readonly bindings: readonly NormalizedBinding[];
      readonly timeoutMs: number;
      readonly diagnostics: readonly ShortcutDiagnostic[];
    }
  | ShortcutFailure {
  if (options === undefined) {
    return Object.freeze({
      ok: true,
      bindings: Object.freeze([]),
      timeoutMs: DEFAULT_SEQUENCE_TIMEOUT_MS,
      diagnostics: Object.freeze([]),
    });
  }
  if (typeof options !== 'object' || options === null) {
    return shortcutFailure([diagnostic('invalid-options')]);
  }
  const inputBindings = options.bindings ?? [];
  if (!Array.isArray(inputBindings) || inputBindings.length > MAX_BINDINGS) {
    return shortcutFailure([diagnostic('invalid-options')]);
  }
  const timeoutMs = options.sequenceTimeoutMs ?? DEFAULT_SEQUENCE_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < MIN_SEQUENCE_TIMEOUT_MS ||
    timeoutMs > MAX_SEQUENCE_TIMEOUT_MS
  ) {
    return shortcutFailure([diagnostic('invalid-timeout')]);
  }
  const bindings: NormalizedBinding[] = [];
  const diagnostics: ShortcutDiagnostic[] = [];
  for (const input of inputBindings) {
    const result = normalizeBinding(input, 'configured');
    if (!result.ok) {
      diagnostics.push(...result.diagnostics);
    } else {
      bindings.push(result.value);
      diagnostics.push(...result.diagnostics);
    }
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return shortcutFailure(diagnostics);
  }
  return Object.freeze({
    ok: true,
    bindings: Object.freeze(bindings),
    timeoutMs,
    diagnostics: Object.freeze(diagnostics),
  });
}

function normalizeBinding(
  input: BomShortcutBinding,
  source: 'default' | 'configured',
):
  | {
      readonly ok: true;
      readonly value: NormalizedBinding;
      readonly diagnostics: readonly ShortcutDiagnostic[];
    }
  | ShortcutFailure {
  if (
    typeof input !== 'object' ||
    input === null ||
    typeof input.id !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u.test(input.id) ||
    typeof input.command !== 'string' ||
    input.command.length === 0 ||
    input.command.length > 96
  ) {
    return shortcutFailure([diagnostic(
      'invalid-binding',
      typeof input?.id === 'string' ? { id: input.id } : {},
    )]);
  }
  const keys = typeof input.keys === 'string'
    ? input.keys.trim().split(/\s+/u)
    : input.keys;
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.length > MAX_SEQUENCE_LENGTH ||
    keys.some((key) => typeof key !== 'string' || key.trim().length === 0)
  ) {
    return shortcutFailure([diagnostic('invalid-stroke', { id: input.id })]);
  }
  const parsed: ParsedStroke[] = [];
  for (const key of keys) {
    const stroke = parseStroke(key);
    if (stroke === null) {
      return shortcutFailure([diagnostic('invalid-stroke', {
        id: input.id,
        stroke: key,
      })]);
    }
    parsed.push(stroke);
  }
  const scopes = normalizeScopes(input.scope);
  if (scopes === null) {
    return shortcutFailure([diagnostic('invalid-scope', { id: input.id })]);
  }
  const priority = input.priority ?? 0;
  if (!Number.isSafeInteger(priority) || priority < -1000 || priority > 1000) {
    return shortcutFailure([diagnostic('invalid-priority', { id: input.id })]);
  }
  const diagnostics: ShortcutDiagnostic[] = [];
  if (isReserved(parsed)) {
    diagnostics.push({
      code: 'reserved-key',
      severity: 'warning',
      id: input.id,
      stroke: parsed.map((stroke) => stroke.raw).join(' '),
    });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      id: input.id,
      command: input.command,
      strokes: Object.freeze(parsed),
      scopes,
      priority,
      enabled: input.enabled !== false,
      preventDefault: input.preventDefault !== false,
      allowRepeat: input.allowRepeat === true,
      source,
    }),
    diagnostics: Object.freeze(diagnostics),
  });
}

function normalizeScopes(
  input: BomShortcutBinding['scope'],
): readonly BomShortcutScope[] | null {
  const scopes = input === undefined
    ? ['focused']
    : typeof input === 'string'
      ? [input]
      : input;
  if (!Array.isArray(scopes) || scopes.length === 0) return null;
  const result: BomShortcutScope[] = [];
  for (const scope of scopes) {
    if (
      scope !== 'focused' &&
      scope !== 'editing' &&
      scope !== 'dragging'
    ) return null;
    if (!result.includes(scope)) result.push(scope);
  }
  return Object.freeze(result);
}

function parseStroke(input: string): ParsedStroke | null {
  const parts = input.trim().split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 6) return null;
  let ctrl = false;
  let meta = false;
  let primary = false;
  let alt = false;
  let shift = false;
  let key: string | undefined;
  let code: string | undefined;
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === 'ctrl' || normalized === 'control') {
      if (ctrl || primary) return null;
      ctrl = true;
    } else if (normalized === 'meta' || normalized === 'cmd' || normalized === 'command') {
      if (meta || primary) return null;
      meta = true;
    } else if (normalized === 'primary' || normalized === 'mod') {
      if (ctrl || meta || primary) return null;
      primary = true;
    } else if (normalized === 'alt' || normalized === 'option') {
      if (alt) return null;
      alt = true;
    } else if (normalized === 'shift') {
      if (shift) return null;
      shift = true;
    } else if (normalized.startsWith('code:')) {
      if (code !== undefined || part.length <= 5) return null;
      code = part.slice(5);
    } else {
      if (key !== undefined || part.length === 0) return null;
      key = canonicalKey(part);
    }
  }
  if (key === undefined && code === undefined) return null;
  if (key !== undefined && key.length > 64) return null;
  if (code !== undefined && !/^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(code)) return null;
  return Object.freeze({
    raw: input.trim(),
    key,
    code,
    ctrl,
    meta,
    primary,
    alt,
    shift,
    repeat: false,
  });
}

function canonicalKey(input: string): string {
  const normalized = input.toLowerCase();
  if (normalized === 'space' || normalized === 'spacebar') return ' ';
  if (normalized === 'esc') return 'escape';
  if (normalized === 'del') return 'delete';
  if (normalized === 'return') return 'enter';
  return normalized.length === 1 ? normalized : normalized;
}

function parseEventStroke(event: KeyboardEvent): ParsedStroke | null {
  const key = typeof event.key === 'string' ? canonicalKey(event.key) : '';
  if (key === '' && typeof event.code !== 'string') return null;
  return Object.freeze({
    raw: event.code || event.key,
    key: key === '' ? undefined : key,
    code: typeof event.code === 'string' && event.code !== '' ? event.code : undefined,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    primary: event.ctrlKey || event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
    repeat: event.repeat,
  });
}

function strokeMatches(event: ParsedStroke, expected: ParsedStroke): boolean {
  if (
    event.alt !== expected.alt ||
    event.shift !== expected.shift
  ) {
    return false;
  }
  if (expected.primary) {
    if (!event.primary) return false;
  } else {
    if (expected.ctrl !== event.ctrl || expected.meta !== event.meta) {
      return false;
    }
    if (!expected.ctrl && !expected.meta && event.primary) {
      return false;
    }
  }
  if (expected.code !== undefined && event.code !== expected.code) return false;
  if (expected.key !== undefined && event.key !== expected.key) return false;
  return true;
}

function chooseWinner(
  candidates: readonly NormalizedBinding[],
): NormalizedBinding | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((winner, candidate) =>
    candidate.priority > winner.priority ? candidate : winner,
  );
}

function detectConflicts(
  defaults: readonly NormalizedBinding[],
  configured: ReadonlyMap<string, NormalizedBinding>,
): BomShortcutConfigurationResult['diagnostics'] {
  const effective = [
    ...defaults.filter((entry) => {
      const override = configured.get(entry.id);
      return override === undefined;
    }),
    ...configured.values(),
  ].filter((entry) => entry.enabled);
  const diagnostics: BomShortcutConfigurationResult['diagnostics'][number][] = [];
  for (let left = 0; left < effective.length; left += 1) {
    const first = effective[left]!;
    for (let right = left + 1; right < effective.length; right += 1) {
      const second = effective[right]!;
      if (!scopesOverlap(first.scopes, second.scopes) || !sameStrokes(first.strokes, second.strokes)) {
        continue;
      }
      const configuredPriorityWins =
        first.source !== second.source && second.priority > first.priority;
      const allowedPriorityOverride =
        first.source !== second.source && first.priority < second.priority;
      if (!allowedPriorityOverride &&
          (first.priority === second.priority || !configuredPriorityWins)) {
        diagnostics.push({
          code: 'conflict',
          severity: 'error',
          id: second.id,
          conflictingId: first.id,
          stroke: second.strokes.map((stroke) => stroke.raw).join(' '),
        });
      }
    }
  }
  return Object.freeze(diagnostics);
}

function scopesOverlap(
  first: readonly BomShortcutScope[],
  second: readonly BomShortcutScope[],
): boolean {
  return first.some((scope) => second.includes(scope));
}

function sameStrokes(
  first: readonly ParsedStroke[],
  second: readonly ParsedStroke[],
): boolean {
  return first.length === second.length && first.every((stroke, index) =>
    strokeMatches(stroke, second[index]!) && strokeMatches(second[index]!, stroke),
  );
}

function isReserved(strokes: readonly ParsedStroke[]): boolean {
  if (strokes.length !== 1) return false;
  const stroke = strokes[0]!;
  return (
    stroke.key === 'f5' ||
    (stroke.primary && ['l', 't', 'w', 'n'].includes(stroke.key ?? '')) ||
    (stroke.alt && stroke.key === 'f4')
  );
}

function publicBinding(binding: NormalizedBinding): Readonly<BomShortcutBinding> {
  return Object.freeze({
    id: binding.id,
    keys: Object.freeze(binding.strokes.map((stroke) => stroke.raw)),
    command: binding.command,
    scope: Object.freeze([...binding.scopes]),
    priority: binding.priority,
    enabled: binding.enabled,
    preventDefault: binding.preventDefault,
    allowRepeat: binding.allowRepeat,
  });
}

export function defaultBomShortcutBindings(): readonly Readonly<BomShortcutBinding>[] {
  return Object.freeze(DEFAULT_BINDINGS.map((binding) => Object.freeze({ ...binding })));
}
