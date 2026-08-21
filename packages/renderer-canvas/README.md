# @bom-editor/renderer-canvas

Browser-only F3 view package for the BOM editor. It paints a vertically and
horizontally virtualized tree grid into three viewport-bounded Canvas layers,
maintains a bounded DOM `treegrid` accessibility window, and owns exactly one
controlled text-input Portal.

The package is a view. It does not execute commands, mutate a Snapshot, own
selection, change expansion state, parse field values, validate drafts, or
commit transactions.

## Controlled boundary

`BomCanvasViewModel` is one atomically published view bundle:

- `revision` and `snapshot` identify the authoritative document revision;
- `documentGeneration` distinguishes a replacement document from an earlier
  document with the same identity or revision token;
- `indexes` and `projection` are derived from that same revision;
- `columns`, `selection`, and `editState` are controlled browser state.

The renderer checks `revision === snapshot.revision`, index coverage, column
identity, and active/draft addresses before rendering. Hosts must replace the
bundle atomically. Structural projection or column changes should be passed as
`{ layoutChanged: true }`; field-only commits can supply stable `dirtyCells`.

Every interaction callback carries a stable `BomCellAddress` where a cell is
involved. The host maps those callbacks to runtime selection/edit state and to
domain commands:

```ts
import { mountBomCanvasRenderer } from '@bom-editor/renderer-canvas';

const renderer = mountBomCanvasRenderer(container, viewModel, {
  select(address, reason, options) {
    runtime.select(address, reason, { extend: options?.extend === true });
  },
  toggleExpansion(address, expanded) {
    runtime.setExpanded(address.occurrenceId, expanded);
  },
  requestEdit(address, trigger) {
    runtime.requestEdit(address, trigger);
  },
  draftInput(address, value, inputType) {
    runtime.updateDraft(address, value, inputType);
  },
  commit(address, reason) {
    runtime.commitEdit(address, reason);
  },
  cancel(address) {
    runtime.cancelEdit(address);
  },
  composition(address, phase) {
    runtime.setComposition(address, phase);
  },
  viewChange(view, reason) {
    runtime.publishView(view, reason);
  },
  resizeColumn(columnId, width, reason) {
    runtime.setColumnWidth(columnId, width, reason);
  },
  reorderColumns(columnIds, reason) {
    runtime.setColumnOrder(columnIds, reason);
  },
  setColumnVisibility(columnIds, visible, reason) {
    runtime.setColumnVisibility(columnIds, visible, reason);
  },
}, {
  instanceId: 'bom-main',
  labels: {
    treegridLabel: 'Bill of materials',
    treegridDescription: 'Use the arrow keys to browse the bill of materials.',
    editorLabel: 'Cell value',
  },
});
```

When `resizeColumn` is provided, a mouse drag on a visible column-header
boundary or `Ctrl/Command+Alt+ArrowLeft/ArrowRight` requests a clamped width.
The host owns the controlled column array; after the callback returns the
renderer emits `viewChange(..., 'columns')`, whose frozen `view.columns`
contains the ordered `{ columnId, width, frozen }` geometry. Touch pointers do
not start a resize gesture. Hosts that need one Undo entry per pointer drag can
also implement the optional `beginColumnResize(columnId, width)` and
`endColumnResize(columnId, width)` callbacks; keyboard resizes do not emit
those gesture callbacks.

When `reorderColumns` is provided, dragging a visible column header past an
adjacent header center or pressing `Ctrl/Command+Shift+ArrowLeft/ArrowRight`
requests an adjacent order swap. The first tree/expander column is immovable,
and swaps stay within the same `frozen: 'start'` or scrollable group. The host
must validate and republish the complete ordered column array; successful
reorders emit the same frozen `viewChange(..., 'columns')` payload and never
create a document transaction. Touch pointers and active Portal edits do not
start a reorder gesture.

When `setColumnVisibility` is provided, `Ctrl/Command+Shift+H` or
`Ctrl/Command+0` requests hiding the focused active column, while
`Ctrl/Command+Shift+Alt+H` or `Ctrl/Command+Shift+0` requests showing all
hidden columns. The renderer sends stable column IDs and the reason
`'keyboard'`; the host owns validation and must republish the complete column
array. The first tree/expander column cannot be hidden, and the host must keep
at least one column visible. Hidden columns are removed from layout, keyboard
navigation, semantic `aria-colcount`, and cell hit targets. Successful changes
emit the same frozen `viewChange(..., 'columns')` payload, including each
column's `visible` state, without creating a document transaction. Portal and
touch input do not enter this shortcut path. `Ctrl/Command+Shift+=` requests
insertion before the selected optional columns, while `Ctrl/Command+-` requests
their deletion through `insertColumn` and `deleteColumns`.

All user-facing renderer labels come from `options.labels`. The exported
defaults are deliberately minimal. Field and column text comes from controlled
data; a host can inject `formatCellText` for locale-aware presentation. A
non-empty `treegridDescription` creates a visually hidden, instance-unique
description node and connects it to the treegrid with `aria-describedby`.

## Value-free Diff overlays

`BomCanvasDiffView` is a separate, controlled presentation projection. Its
protocol is `bom-canvas-diff-view/v1`, exported as
`BOM_CANVAS_DIFF_VIEW_PROTOCOL`. A host creates it from a domain-level Diff or
another reviewed source, then publishes it together with the current view
model:

```ts
import {
  BOM_CANVAS_DIFF_VIEW_PROTOCOL,
  type BomCanvasDiffView,
} from '@bom-editor/renderer-canvas';

const diffView: BomCanvasDiffView = {
  protocol: BOM_CANVAS_DIFF_VIEW_PROTOCOL,
  documentId: snapshot.documentId,
  documentGeneration,
  viewRevision: snapshot.revision,
  rows: [{ occurrenceId, kind: 'changed' }],
  cells: [{ occurrenceId, columnId, kind: 'material' }],
};
```

The exact `documentId + documentGeneration + viewRevision` triple must match
the published `snapshot` and view model. The renderer validates the protocol
and bounded decoration shape, then validates current row/column addresses only
for a current binding. It draws no overlay for a stale binding and clears a
previously indexed overlay when the binding ceases to match.

This is deliberately not `BomSnapshotDiff`: the Diff view contains only stable
occurrence IDs, stable column IDs, and one of `inserted`, `deleted`, `changed`,
`moved`, `reordered`, or `material`. It must not contain `before`/`after`, a
field path, a raw BOM value, validation parameters, or any other domain Diff
payload. The normal Canvas view still receives the controlled current Snapshot
needed to paint cells; this restriction applies specifically to the Diff
overlay, Canvas markers, semantic DOM, and ARIA descriptions.

Row and cell decorations still require addresses in the current Snapshot. A
deleted row can additionally be represented by a value-free `deletedRows`
summary, anchored at a current row boundary (`before`/`after`) or at the
document `start`/`end`. Each summary carries only the deleted stable ID and a
positive row count; it remains a non-interactive `role="note"` and never
changes treegrid row numbering. When the host needs the deleted row to occupy a
real visual/semantic position, `ghostRows` opts into the complete single-row
projection. Each ghost carries a unique deleted ID, a `start`/`end` or anchored
`before`/`after` position, and an optional depth. Ghost rows participate in
layout height, visible row position, `aria-rowindex`, and `aria-rowcount`, but
are explicitly read-only, unselectable, uneditable, non-expandable, and cannot
be transaction targets. Invalid anchors, duplicate IDs, a deleted ID that is
still in the Snapshot, or an invalid depth fail closed.

Diff fills use theme tokens, but every decorated row or cell also has a
kind-specific geometric marker: add, remove, move, reorder, or square marker.
The virtual treegrid publishes localized, value-free Diff text through
`data-bom-diff-kind` and `aria-description`. Row-wide semantics are attached at
the row level so they are not repeated for every cell; cell-only decorations
are attached to their `gridcell`, including an offscreen active-cell proxy.

## Live-region announcements

The renderer root owns separate, visually hidden polite and assertive live
regions outside the virtual semantic window, so a semantic-window refresh
cannot erase or repeat a status. `options.liveRegion` enables the regions by
default and coalesces polite messages to the latest value within a 400ms
interval (configurable with `politeMinIntervalMs`). Assertive messages are
delivered immediately, with duplicate suppression inside the same interval.

`renderer.announce({ message, politeness })` accepts localized, value-reviewed
plain text and returns whether it was delivered, queued, deduplicated, disabled,
or rejected. It never accepts HTML. Hosts must not put raw BOM values into a
message unless their access policy explicitly permits exposing those values to
assistive technology. `labels.liveRegion.validationRejected` and
`labels.liveRegion.commitRejected` localize the built-in value-free edit-failure
announcements; a rejected draft uses the assertive region and clears when the
edit leaves the rejected state. `columnResizeCompleted` and
`columnReorderCompleted` localize polite messages emitted only after a pointer
release successfully reaches the corresponding host callback. Canceled, unchanged,
and failed column operations remain silent. The editor and Props/Outputs component
facade proxy the same method after mounting for operation results and host-managed
background validation.

`labels.liveRegion.columnReorderTarget` is a polite drag-preview message. During
pointer column reordering, the renderer replaces every `{position}` token with the
one-based visible insertion position and emits it only when the proposed column
order changes. Repeated pointer moves within the same target do not write the live
region, and the standard polite-message coalescing still applies. The message never
contains a column label, ID, field value, or ordering payload.

The editor uses `validationCompleted` and `validationIssuesFound` for changed
validation reports after mounting. The latter replaces `{count}` with the issue
count; neither message receives rule IDs, row IDs, field paths, validation text, or
message parameters. Repeating an identical report does not create another live
region mutation.

`treeMoveTarget` is a polite, value-free preview label for pointer tree moves. The
renderer replaces `{position}` with the localized `before`, `after`, or `inside`
position, updates the target row's `data-bom-tree-drop-position` and
`aria-description`, and coalesces repeated targets. `treeMoveCompleted` is emitted
by the editor only after a keyboard, row-menu, or pointer tree move commits
successfully. Both messages exclude occurrence IDs, field values, and command
payloads; self and descendant targets are rejected before the callback.

## Tree Structure Dragging

When the optional `moveSubtree` callback is provided, a mouse drag that starts in
the row-number gutter becomes a controlled tree move. The renderer captures the
pointer, waits for the drag threshold, and renders a row-header shadow plus a
before/after insertion line or inside outline. It emits nothing while the pointer
is moving. On release it sends one frozen, value-free request:

```ts
moveSubtree({
  occurrenceId,
  targetOccurrenceId,
  position: 'before' | 'after' | 'inside',
  // Present for a preserved multi-row selection.
  occurrenceIds?: readonly OccurrenceId[],
});
```

The host owns the structural transaction and must republish the complete view
model. A row-header drag preserves a selected contiguous or disjoint row
contiguous row selection when the pointer starts on one of its rows; the optional
`occurrenceIds` list is ordered by the current visible projection. The editor
compiles that list into one atomic, undoable batch while rejecting duplicate IDs,
ancestor/descendant overlap, and targets inside a selected subtree. Touch
pointers, active Portal edits, partial projections, the source row, and any
descendant of the source are ignored. Pointer cancel, lost capture, and destroy
clear the preview without invoking the callback. Keyboard structural movement
remains available through `moveSelection`.

## Rendering and memory

The scroll host has one spacer representing `headerHeight + total document
height` and `rowHeaderWidth + total column width`. The default 36px column
header and 48px row-number gutter stay fixed while the data body uses the
native scroll offsets. Both dimensions are configurable renderer options.
Canvas CSS and backing-store dimensions are calculated only from:

```text
viewport + configured overscan
```

They never use `projection.totalHeight` as a Canvas dimension. Backing-store
accounting includes all three layers:

```text
ceil(cssWidth * effectiveDpr)
  * ceil(cssHeight * effectiveDpr)
  * 4 bytes
  * 3 layers
```

`effectiveDpr` is the lower of the device DPR, configured maximum, and the DPR
that fits `maxBackingStoreBytes`. Drawing uses a CSS-to-device transform, while
hit testing retains unrounded logical CSS coordinates.

Vertical windows come directly from `VisibleProjection.windowByOffset()`.
Horizontal layout always keeps intersecting `frozen: 'start'` columns and only
mounts intersecting scrollable columns. F3 treats `frozen: 'end'` as scrollable;
end-freezing and RTL mirroring remain later view capabilities.

Background, content, and interaction layers have separate invalidation state.
`invalidateCell()` records logical dirty rectangles; excessive dirty area is
promoted to a full layer redraw. Scroll, resize, projection geometry, column
geometry, font readiness, DPR changes, and restored Canvas contexts cause full
layout repaint.

An update whose selection and revision are unchanged only synchronizes the
semantic DOM and editor Portal; it does not invalidate Canvas. Draft text lives
in the controlled Portal, so typing does not repaint content behind it. A field
commit invalidates the changed content/interaction cell once. Any selection
transition redraws the bounded interaction layer, because a rectangular range
can cross frozen and scrollable column regions.

## Custom cell renderers

`options.cellRenderers` associates one synchronous capability with a stable
visible `columnId`. A capability must provide `measure`, `draw`, and
`getAccessibleText`; it may additionally provide `hitTest` and `dispose`.
Every call receives only a readonly presentation context: revision, stable cell
address, column metadata, current value and fields, CSS-pixel bounds, locale,
direction, and theme. `measure` additionally receives the maximum available
size; `draw`, `hitTest`, and accessibility receive the bounded measured size;
`draw` alone receives a cell-clipped Canvas context. The capability has no
command, transaction, selection, layout, or data-source write handle. It must
not use a custom renderer to change domain state; interactive edits continue to
use the controlled Portal and the normal host callbacks.

The renderer evaluates these hooks synchronously. Promise-like results are
invalid. `cellRendererFrameBudgetMs` is an aggregate custom-renderer budget:
it defaults to `4ms` and is clamped to `16ms` maximum. `measure`, `draw`,
`getAccessibleText`, and `hitTest` consume that budget and report a structured
diagnostic when a callback throws, returns an invalid/async result, or exhausts
the budget. An invalid or over-budget measure/draw falls back to built-in text
painting; an invalid or over-budget accessibility result falls back to the
built-in cell text in the semantic DOM. A failed hit test simply takes the
normal cell-selection path. A draw that overruns after painting is cell-cleared
before the text fallback is painted.

Trusted same-Realm JavaScript cannot be technically prevented from starting
network work or synchronously parsing a large payload. The renderer therefore
does not claim a security sandbox for these capabilities. The enforceable
boundary is the readonly, no-domain-write API; the synchronous contract;
per-frame budget accounting; fallback; and diagnostics. Hosts should admit
only trusted capabilities, keep hook work bounded, and isolate untrusted code
outside this API boundary.

`hitTest` returns either `null` or a named `{ id, consume? }` target. Before
normal pointer selection, `onCellRendererHit` receives the value-free payload
`{ revision, address, target }`: it deliberately excludes cell value and
fields. `consume: true` prevents default selection for that pointer action;
omitting it or setting it to `false` reports the target and then continues with
normal selection. Exceptions from the host hit callback are isolated and
diagnosed.

At `destroy()`, the resource registry invokes `dispose()` exactly once for each
unique registered renderer capability, even when it is registered for several
columns. Destruction is idempotent. A disposal exception is reported as a
renderer diagnostic and does not turn the capability into an unmanaged
resource.

## Accessibility and editing

Only window rows and visible columns are represented in the semantic DOM. A bounded
header exposes `columnheader` roles; when columns declare hierarchical
`headerGroup` labels, contiguous groups are represented by additional header
rows with `aria-colspan` and stable `aria-colindex`. Each mounted data row exposes
its derived row number through `rowheader`; `aria-rowcount` and `aria-colcount`
include the grouped header rows and the row gutter. Stable data identity remains the occurrence ID and
column ID, never the visible row number. The treegrid also reports depth,
expansion, selection, read-only, required, and invalid state and owns browser
focus through `aria-activedescendant`. A rectangular or multi-range selection
exposes `aria-selected="true"` for every mounted cell inside any current
visible bound. If the controlled active cell is outside the mounted row or
column window, a lightweight selected semantic proxy keeps that ID valid.
Controlled selection endpoints must exist in the current visible projection;
hosts must republish a clipped or cleared selection after collapsing or
filtering rows.

The single Portal input is reused for every draft and is positioned from the
same cell rectangle used for Canvas drawing and hit testing. It supports Enter,
Tab, Shift+Tab, Escape, and blur callbacks. Between `compositionstart` and
`compositionend`, commit shortcuts are ignored and draft input is classified as
composition input.

Grid shortcuts run only while the treegrid itself owns focus. F3 supports
pointer selection, mouse-drag range extension, double-click editing, and Arrow,
Home, End, Page Up, Page Down, Enter, and F2 keyboard paths. During an ordinary
mouse range drag, entering the 32px viewport edge band starts a bounded
`requestAnimationFrame` auto-scroll. Each frame moves 4–24px per axis, clamps
to the current projection bounds, and extends the range from the last pointer
position; pointer release/cancel and destroy cancel the pending frame. Touch
drags and Ctrl/Command discrete multi-range clicks do not start this loop.
Fill-handle drags use an independent downward-only loop when the pointer enters
the 32px bottom edge band, clamped to the current projection bounds and stopped
on release, cancel, lost capture, or destroy. A printable key
on a focused editable active cell starts replacement editing; Ctrl/Command+A
selects the current visible projection rectangle. Space toggles an expandable
active tree row as the keyboard equivalent of its Canvas expander.

Column-header and row-number context menus keep their view and tree commands
in the controlled callbacks. A cell context menu also exposes Paste only when
the active window provides `navigator.clipboard.read()` or `readText()`. The
menu reads only the user-requested internal, HTML, and plain-text clipboard
representations and forwards them to the same `paste` callback as the trusted
browser event; it never synthesizes a paste event or bypasses host Policy.

Double-clicking a visible column boundary, or choosing the column-header
context-menu `auto-size` command, measures the header and at most 256 currently
rendered cell values. The bounded measurement truncates each value to 4,096
characters and caps the requested width at 1,200 CSS pixels before calling the
existing `beginColumnResize`/`resizeColumn`/`endColumnResize` callbacks. It is a
view-only change and does not read rows outside the virtualized render window.

When the treegrid has focus, Ctrl/Command+Z delegates to the optional `undo`
callback; Ctrl/Command+Y and Ctrl/Command+Shift+Z delegate to optional `redo`.
No callback means the browser default remains available. These shortcuts do
not run for IME, Alt/AltGraph, repeated keys, or Portal input.

Row-number and column headers, `Shift+Space`, and `Ctrl/Command+Space` are
forwarded as `select` callbacks with `mode: 'row'` or `mode: 'column'`;
Shift+header clicks request contiguous same-axis extension. The bare `Delete`
or `Backspace` key is forwarded only while the treegrid owns focus, no Portal
edit is active, and the key is neither IME/AltGraph/repeated nor modified. The renderer never interprets either key inside the Portal. Its editor
callback must resolve the active cell or one visible rectangular selection,
preflight every target, and either submit one undoable `editor:delete`
transaction or leave the Snapshot unchanged. The current editor semantics are
schema-aware: nullable fields become `null`, non-nullable defaulted fields are
unset and normalized back to their defaults, and optional non-defaulted fields
are unset; read-only targets, required non-nullable fields without defaults,
limit breaches, and stale targets fail the whole request atomically.
Multi-range clearing, copying, pasting, and filling fail closed in the editor
callback layer; the single-range mouse fill handle reuses the editor's
`fillDown` callback and remains inactive for axis or multi-range selections.
Column geometry and order use the same controlled view boundary: the host
updates `columns`, while the renderer reports resulting geometry through
`viewChanged` with reason `columns`. The column-header context menu also
exposes a reset-to-initial-width command; the renderer publishes a columns
view change only when the callback actually changes the width. The renderer
never mutates the Snapshot, revision, or document transaction history; a host
may record these controlled view changes in its own Undo/Redo interaction
history.

Row heights are controlled through `setRowHeight(occurrenceId, rowHeight)` in
the same boundary. The row-number context menu provides explicit, automatic
wrap-content, and reset-to-default commands. The renderer reports frozen
`view.rowHeights` with reason `row-height`; the editor preserves overrides
across projection refreshes, including filtered rows, and records each
effective change as view-only interaction history without changing
Snapshot/revision.
The renderer owns a bounded shortcut registry. `shortcuts` options atomically
replace default ids, disable bindings, add higher-priority commands, and
support focused/editing/dragging scopes plus space-separated key sequences.
`configureShortcuts()` and `resetShortcuts()` hot-update it without touching the
view model. Equal-scope conflicts return structured diagnostics; reserved
browser/OS keys return warnings. Unknown commands are sent to `onShortcut` and
never fall through to another built-in action. A configured `copy` binding is
consumed when Async Clipboard is unavailable instead of falling through to
semantic DOM text. A configured `cut` binding is also consumed because a
renderer cannot safely synthesize the browser's trusted native cut event; keep
the native binding or route a custom command through an explicit host path.

Ctrl/Command-clicking a cell forwards `additive: true` and creates or removes
one stable rectangle in the editor's `selection.ranges` output. A
Ctrl/Command+Shift click adds an extended rectangle. The renderer paints every
controlled range and mirrors all mounted cells through `aria-selected`.

`Ctrl/Command+D` delegates to the optional `fillDown` callback only while the
treegrid owns focus, no Portal edit is active, and the key is not
IME/AltGraph/repeated or modified with Shift or Alt. It is intentionally a
callback because the editor owns selection validation and transactions. When
the callback is absent, the renderer leaves the browser default available;
this matters because the combination can be a browser bookmark shortcut. The
current editor callback slice fills the lower rows of one visible rectangle
from its top row in one atomic undoable transaction. Fill-handle auto-scroll is
renderer-owned, while series, relative references, cross-range behavior, and
fill semantics remain editor-owned; shortcut registration is handled by the
registry described above.

While its Portal is editing, the renderer maps `Ctrl/Command+Enter` to the
existing `commit(address, 'fill-selection')` callback only for a current
visible range that is exactly one column and spans at least two rows. It does
not add a separate callback or mutate data. IME, AltGraph, repeat, Shift, Alt,
and invalid ranges leave the browser default untouched. The editor owns Schema
conversion, transaction construction, and the final target validation.

When the treegrid owns focus, Ctrl/Command+C obtains an already-authorized
payload through `copy()` and uses Async Clipboard when available or a native
event as a fallback. Ctrl/Command+X deliberately keeps the trusted native
`cut` event path, so an Async Clipboard permission rejection cannot suppress
the fallback. Only an `isTrusted === true` native `cut` event may request a cut
payload; a synthetic event is prevented and fails closed before that request.
The renderer reports a successful native write through `clipboardWrite()` only
after `ClipboardEvent.clipboardData` accepts the text. It never deletes data,
so the editor callback layer alone applies its synchronous 10,000-row,
256-column, 10,000-cell, 1 MiB-total, and 64 KiB-per-cell cut limits,
`defaultValue` rejection, and stable `(occurrenceId, fieldId)` deduplication
before it can commit. Native fallback `copy` and `cut` only report success for
trusted browser events; native `copy` and `cut` on the editing Portal are always
prevented, so an uncommitted draft cannot be exported, deleted, or bypass the
Clipboard Policy.

The renderer also exposes independent branch bindings: `Primary+Shift+B` for
`copy-branch` and `Primary+Shift+K` for `cut-branch`. These paths require the
optional `copyBranch`/`cutBranch` callbacks and Async Clipboard; they consume
the key when that capability is unavailable rather than falling through to
semantic DOM text or ordinary cell cut. The editor owns branch scope,
authorization, envelope generation, and the post-write structural transaction.

`scrollToView()` restores bounded `scrollLeft`/`scrollTop` offsets for a mounted
view and reports an `api` view change when the offsets move. It never changes
the Snapshot or selection.

## Lifecycle

One live renderer may mount in an `HTMLElement`. `destroy()` is idempotent and
releases event listeners, `ResizeObserver`, pending animation frames, font-ready
continuations, Canvas/DOM nodes, the semantic proxy, and the Portal through one
`ResourceRegistry`. The same container can be mounted again after destruction.

`getDiagnostics().resources` is the versioned terminal ownership ledger. DOM
listeners, each Canvas layer, the Portal, each observer family, RAF, Worker,
timeout, and interval ownership have separate kinds; cleanup attempts and
failures remain available after destruction. Mutation/Intersection observers,
Workers, Worker tasks, and timers currently have no renderer creation path, so
their tracked zero is an ownership assertion rather than a sampled platform
count. `supported` independently reports whether the corresponding browser
primitive exists. `getDiagnostics().workerTasks` additionally distinguishes
queued and running Worker tasks under
`bom-canvas-worker-task-ledger/v1`.

Importing the package does not read browser globals. DOM access begins only in
`mountBomCanvasRenderer()`.

## Verification

```sh
pnpm --filter @bom-editor/renderer-canvas typecheck
pnpm --filter @bom-editor/renderer-canvas test
pnpm --filter @bom-editor/renderer-canvas build
```

Node tests use the built-in runner. Pure tests cover layout, column
windowing, fractional hit testing, coordinate transforms, and DPR budgeting.
Minimal DOM mocks cover bounded 10K canvases, ARIA active proxies, Portal
singleton behavior, host-injected treegrid descriptions, IME commit isolation,
context restoration, unique mounting, and idempotent cleanup.
