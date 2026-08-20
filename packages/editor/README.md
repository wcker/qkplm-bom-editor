# @bom-editor/editor

This browser composition package owns the F3 public editor lifecycle and joins
the independent transaction, projection, runtime-foundation, DataSource, and
Canvas renderer packages without introducing a dependency cycle.

The implementation is intentionally assembled below the stable
@qkplm/bom-editor facade. Applications should consume the Core root or declared
Core subpaths once the F3 facade is enabled.

## Terminal resource ledger

`getDiagnostics().resources` combines the current renderer registry, or its
last terminal snapshot after unmount, with EventHub listener ownership,
pending asynchronous listener invocations, editor queued/running tasks, and
renderer Worker queued/running tasks. Cleanup failures remain observable after
the renderer reference is dropped.

`trackedResourcesReleased` is fail-closed. It becomes `true` only after the
editor reaches `destroyed`, every declared renderer kind is tracked, the
renderer registry is disposed, all listener/task/resource counts are zero, and
no cleanup failed. A synchronous `destroy()` may therefore initially report
`false` while an already-running task or asynchronous listener settles, then
change to `true` once its real outstanding count reaches zero.

## Live-region announcements

After mounting, `editor.announce({ message, politeness })` and the equivalent
Props/Outputs component method forward localized, value-reviewed plain text to
the renderer's hidden live region. The result distinguishes immediate,
queued, and deduplicated delivery from `not-mounted`, `disabled`, invalid, or
destroyed calls. The renderer coalesces high-frequency polite updates; callers
should use `assertive` only for actionable failures. Built-in edit rejection and
successful pointer column-resize/reorder messages are configured through
`renderer.labels.liveRegion`; they never include the draft value, column identity,
dimensions, order, or error parameters.
`renderer.labels.liveRegion.columnReorderTarget` can additionally describe a
pointer reorder preview with its `{position}` one-based visible insertion slot;
unchanged preview positions are coalesced and do not repeat an announcement.
When a mounted editor publishes a changed validation report, it uses
`validationCompleted` or `validationIssuesFound` in the polite region. The latter
receives only `{count}`; validation rules, issue messages, addresses, field paths,
and message parameters remain out of the announcement.
`treeMoveTarget` describes a pointer tree-drag preview with a localized
`{position}` (`before`, `after`, or `inside`) and never includes row IDs or field
values. `treeMoveCompleted` reports a keyboard, row-menu, or pointer tree
movement only after its atomic transaction succeeds. The renderer and editor
coalesce repeated target announcements and keep canceled or rejected moves
silent.

A row-header drag that starts on an already selected contiguous multi-row range preserves
the selection and emits the optional ordered `occurrenceIds` list. The editor
commits the selected subtrees in one undoable transaction, preserving their
order and rejecting duplicate IDs or ancestor/descendant and target cycles.

## Transaction construction

`editor.transaction(build, options)` captures commands synchronously and
publishes one FIFO, undoable batch. `builder.transaction(nestedBuild)` and a
synchronous nested call to `editor.transaction()` append to the outer batch in
lexical order; they do not create another revision, history entry, persistence
request, or event sequence. Nested calls may not override the outer label,
origin, or cancellation signal. Empty or asynchronous builders, invalid nested
options, and builder exceptions are value-free stable failures delivered as one
`transactionRejected` event, with no Snapshot, index, revision, or history
change. A builder is never allowed to mutate after its callback returns.

## DataSource persistence

Writable DataSources apply edits locally first and persist them through a
single-flight FIFO coordinator. A commit is first accepted by that coordinator
and only then published through `transactionCommitted`; enqueue failure rolls
the unpublished local suffix back atomically. `transactionCommitted` therefore
describes the local atomic commit and `transactionPersistenceChanged` reports
remote progress. Read-only DataSources reject mutations with
`BOM_EDITOR_SOURCE_READ_ONLY`.

Remote subscription gaps, revision discontinuities, protocol mismatches, and
observer failures stop incremental application and trigger one fail-closed
reload for the active document generation. Late load, commit, and observer
results from replaced generations are ignored. In DataSource mode `redo()` is
currently rejected; pending `undo()` uses explicit cancellation when supported
and otherwise persists the generated inverse as a dependent compensation. ACK
source revisions are deliberately separate from the subscription cursor, so
delayed ordered own echoes remain idempotent while cancelled, rejected,
conflicted, or reload-required own echoes fail closed.

`transactionPersistenceChanged` includes `recoveryId`, `retryable`, and a
`recoveryBundle` when persistence enters `reloadRequired`. The host can inspect
that bundle and call `recoverPersistence()` to replace the editor from the
authoritative DataSource; this path never silently retries an indeterminate
queue. `replaceSource()` normally waits for persistence. Its
`pending: 'abortAndRollback'` mode is accepted only when the source supports
in-flight cancellation and the complete local pending history suffix can be
cancelled tail-first and rolled back atomically. All document loads race their
AbortSignal, including non-cooperative DataSources.

Remote read APIs are deliberately separate from local projection state.
`queryDataSource(options)` is available only when the active source declares
`remoteQuery`; it captures the current `sourceRevision`, returns stable IDs with
the active document ID/generation, and fails closed when the source session or
revision changes. It never changes the Snapshot, selection, or local query.
For a partial Snapshot, `loadDataSourceChildren(parentId, { cursor, signal })`
loads one direct-child page only from a `lazyChildren` source. The page is
validated in staging (cursor, parent relationship, duplicate IDs, completeness,
and source revision) and then published in one `documentReplaced` operation;
source changes, recovery, and destruction cancel pending reads and discard late
results.

## Edit navigation

`BomEditorCommonOptions.editNavigation` configures browser-only navigation
after a successful DOM cell commit. It accepts
`{ enter?: 'down' | 'none', tab?: 'next-editable' | 'none' }` and defaults to
`{ enter: 'down', tab: 'next-editable' }`. Enter moves to the next visible row
in the current editable column. Tab and Shift+Tab traverse visible rows in
forward and reverse row-major order, skipping every `editable: false` column.

The editor computes a destination only after the commit has succeeded and only
when the document generation, selected-target epoch, and original active cell
remain unchanged. IME composition, cancellation, validation or commit failure,
document/selection changes, and a traversal boundary leave the selection in
place. A successful move emits the existing `selectionChanged` event before
the committed `editEnd`; no destination emits no additional selection event.

## Initial view

`BomEditorCommonOptions.initialView` is the serializable construction-time
view contract. It groups complete ordered column geometry (`columns`), the
initial row height, expansion (`expandedIds` or `expandAll`), view-only
`query` (sort/filter), stable-ID `selection`, and non-negative
`scrollLeft`/`scrollTop`. `initialView.columns` uses the same
`BomViewColumnState` shape emitted by `viewChanged`; it must cover every
top-level column exactly once and can only change order, width, frozen side,
and visibility. The top-level `columns` definitions retain field paths,
editing behavior, formats, and width constraints. The mounted container owns
viewport width and height, so those values are reported by `viewChanged`
rather than accepted as initialization input. Invalid IDs, conflicting
expansion options, malformed or schema-unknown queries, selections that are
not visible in the initial projection, and invalid scroll offsets reject
editor creation. The legacy top-level `rowHeight`, `expandedIds`, and
`expandAll` fields remain accepted as compatibility fallbacks; a member
present in `initialView` takes precedence.

## Shortcut Registry

`BomEditorCommonOptions.shortcuts` supplies an initial, browser-only override
list. Each binding has a stable `id`, a `command`, and one stroke or a bounded
space-separated sequence such as `Primary+K Primary+C`; `scope` may be
`focused`, `editing`, or `dragging`. A binding with the same id replaces a
default, `enabled: false` unbinds it, and a distinct binding needs a higher
priority to shadow an existing stroke. Configuration is rejected atomically
with structured diagnostics for malformed strokes, duplicate ids, and
ambiguous conflicts; reserved OS/browser keys produce warnings.

`configureShortcuts()` hot-replaces the registry while preserving the current
document and selection. `resetShortcuts()` removes all overrides. Both methods
are synchronous and return a frozen configuration result, including diagnostics;
the same methods are available on the Props/Outputs component facade. Custom
commands are delivered to the optional renderer `onShortcut` callback. The
renderer never consumes shortcuts for an unfocused instance, Portal text input,
IME composition, AltGraph, or repeated keys unless a binding explicitly opts
into repeats.

When a focused active cell is editable, a non-composing printable key starts
editing in replacement mode with that key as the initial draft value. Dead
keys, AltGraph, modifiers, repeated keys, and read-only cells keep their
normal browser/editor behavior. A mouse drag extends the stable-ID rectangular
selection without claiming touch scrolling; `Ctrl/Command+A` selects the
current visible projection rectangle. Row/column selection is stable-ID based,
and Ctrl/Command-click adds or removes disjoint rectangles through the
optional `selection.ranges` output. Multi-range Delete/Backspace is supported
with per-range preflight, stable-ID de-duplication, aggregate limits, and one
undoable `editor:delete` transaction. Keyboard fill-down also supports multiple
same-shape ranges by compiling each range from its own top row into one
undoable `editor:fill-down` transaction; conflicting overlaps fail closed.
Paste supports multiple same-sized disjoint ranges by applying one input
rectangle to every range inside one undoable transaction. Overlapping target
fields that map to different source coordinates, read-only cells, policy or
schema failures, stale selection, and aggregate target-cell limits fail
closed. Copy remains fail closed for multi-range selections. A mouse fill
handle can extend the active range while retaining its multi-range peers when
every range contains at least two rows; it reuses the same atomic
`editor:fill-down` transaction. A mouse fill handle is available when the
renderer supplies the `fillDown` callback; it remains inactive for touch,
axis, invisible targets, or a multi-range selection whose member lacks a
source row. A normal mouse range drag auto-scrolls inside a 32px edge band
with bounded 4–24px animation-frame steps. Fill-handle drags use a separate
downward edge loop, which keeps extending after the pointer leaves the
virtual row window; release/cancel/destroy always clears either loop.
Holding `Alt` while starting a handle drag switches the gesture to
`fillSeries()`: the active range supplies its first two numeric or ISO temporal
rows, and the release still produces one atomic series transaction. A
multi-range series handle is enabled when the active range has at least two
rows and every static peer has at least three rows; the active range extends
while peers retain their original bounds, and each range derives its own step.
Any single-row peer remains fail closed.

When every supplied clipboard representation fails parsing, `paste()` and
`previewPaste()` return one bounded, value-free diagnostic set. Each item has
an optional `candidateFormat` (`internal`, `html`, or `text`) so a host can
explain the failed fallback chain without receiving clipboard values. A single
candidate keeps the existing diagnostic shape. Invalid branch-tree envelopes
also continue to a separately supplied lower-priority HTML or plain-text
candidate; a valid branch envelope still owns precedence.

While the treegrid itself owns focus, `Ctrl/Command+Z` invokes the existing
Undo path; `Ctrl/Command+Y` and `Ctrl/Command+Shift+Z` invoke Redo. The renderer
does not intercept those combinations during IME composition, Alt/AltGraph,
key repeat, or Portal text editing. `configureShortcuts()` can atomically
replace, disable, or add bindings, while `resetShortcuts()` restores defaults.
Bindings support bounded key sequences, focused/editing/dragging scopes,
priority conflict diagnostics, and reserved-key warnings. IME, AltGraph,
repeated keys (unless explicitly allowed), and inactive instances remain
isolated.

The renderer also exposes controlled column-width editing. Dragging a visible
header boundary with the mouse, or pressing `Ctrl/Command+Alt+ArrowLeft` or
`Ctrl/Command+Alt+ArrowRight` with a focused cell, calls the host's
`resizeColumn` callback. The editor clamps the requested width to the column's
`minWidth`/`maxWidth` constraints and refreshes only view geometry. A pointer
drag records one layout-history entry when released, while each keyboard
resize remains an individual entry. These entries participate in Undo/Redo but
do not create a document transaction or change the Snapshot revision. The
resulting frozen ordered geometry is included in the frozen `viewChanged`
payload with reason `columns`; touch pointers and active Portal edits do not
start a resize.

The editor also exposes controlled column-order editing. Dragging a visible
column header past an adjacent header center, or pressing
`Ctrl/Command+Shift+ArrowLeft`/`Ctrl/Command+Shift+ArrowRight` with a focused
cell, calls `reorderColumns` with the complete stable-ID order. The first
tree/expander column cannot move, and pointer or keyboard swaps stay within the
same frozen-start or scrollable group. Validated order changes refresh only
view geometry, publish `viewChanged` with reason `columns`, and create one
Undo/Redo layout-history entry without changing the Snapshot revision; touch
pointers and active Portal edits are ignored.

Column visibility is controlled by the same view boundary. `visible` defaults to
`true`; while the treegrid is focused, `Ctrl/Command+Shift+H` or
`Ctrl/Command+0` hides the active optional column, and
`Ctrl/Command+Shift+Alt+H` or `Ctrl/Command+Shift+0` shows all hidden columns.
The first tree/expander column cannot be hidden and at least one column remains
visible. Hidden columns are omitted from layout, keyboard navigation, semantic
ARIA columns, and clipboard targets. Hiding the active column moves the
selection to the nearest visible column and emits `selectionChanged` with
`reason: 'view-change'`. Visibility, frozen placement, insertion, and deletion
all create view-only layout-history entries: Undo/Redo restores them without
changing the Snapshot, revision, or document transaction history. Portal and
touch input do not trigger these shortcuts. `Ctrl/Command+Shift+=` inserts a
copy of the active column definition before it, and `Ctrl/Command+-` deletes
the selected optional columns.

`getViewTemplate()` and `applyViewTemplate()` keep column layout and local
sort/filter state separate from the document. `serializeBomViewTemplate()` and
`parseBomViewTemplate()` use the versioned `bom-view-template/v1` envelope.
`createBomViewTemplateStorage()` accepts a host-owned backend; its
`loadResolved()` path can apply a pure migration for a target schema version,
optionally persist only a validated migrated value, and return a supplied
default template when storage is missing, corrupt, unknown, or migration fails.
Fallbacks never overwrite the original raw value.

Undo and Redo preserve the interaction context of the corresponding history
entry: stable selection endpoints are restored after a successful action, and
the mounted renderer is asked to restore the recorded scroll offsets within its
current projection bounds. A custom binding for the built-in `cut` command
cannot safely synthesize the browser's trusted native cut event; keep the
native binding or route a custom command through an explicit host authorization
path.

## Tree Structure Editing

When the treegrid owns focus and no Portal edit is active, the structural
shortcuts operate on the single focused row only. `Insert` duplicates it as a
new sibling, while `Ctrl/Command+Insert` duplicates it as the last child and
expands the parent. `Alt+ArrowUp`/`Alt+ArrowDown` move the row among siblings;
`Alt+ArrowLeft` promotes it to the parent's level and `Alt+ArrowRight` indents
it under the previous sibling. `Shift+Delete` deletes the focused subtree.
Each operation on a complete Snapshot is one `insertNode`, `moveSubtree`, or
`deleteSubtree` command, is undoable, and emits the normal
transaction/document-change outputs. New nodes receive a fresh occurrence ID
while preserving the source node's validated fields and material reference.
Ranges, axis selections, IME composition, repeated keys, and active edits fail
closed. On a partial Snapshot, a keyboard move emits the value-free
`structureMoveRequested` runtime event instead of compiling a local transaction;
the event carries the versioned request protocol, document generation/revision,
stable source IDs, and the keyboard direction.

A mouse drag that starts in the row-number gutter supplies the same structural
capability without exposing BOM values to the renderer. The renderer previews a
row shadow and a `before`/`after` insertion line or `inside` outline, rejects the
source row and its descendants, and sends one frozen `moveSubtree` request only
after pointer release:

```ts
moveSubtree({ occurrenceId, targetOccurrenceId, position });
```

The editor validates the stable IDs, maps the position to one atomic
`moveSubtree` transaction, expands a collapsed inside target, and publishes the
normal document/transaction outputs. Undo/Redo restores the structural change
and selection. On a partial Snapshot, the same pointer gesture emits
`structureMoveRequested` with a pointer target/position and leaves the
Snapshot/revision unchanged; the host must load and validate the authoritative
structure before calling `update({ document })`. Touch, active edits, pointer
cancellation, lost capture, and destroy are fail-closed.

While a mouse tree-row drag has passed its movement threshold, the top and
bottom 32px viewport bands auto-scroll vertically in bounded 4–24px animation
frame steps. A captured pointer can remain outside the virtual row window:
the first or last visible row supplies a `before` or `after` preview until
release. The renderer still emits exactly one value-free `moveSubtree` request
only on release; cancellation, lost capture, and destruction stop the loop.

`Ctrl/Command+Shift+ArrowDown` expands all loaded nodes and
`Ctrl/Command+Shift+ArrowUp` collapses them. This is a view-only projection
change: the Snapshot and revision stay unchanged, the stable selection is
sanitized if its row becomes hidden, and one `viewChanged` event is emitted.

## Treegrid Delete and Backspace

An unmodified `Delete` or `Backspace` key clears the active editable cell or the current
single visible rectangular selection only while the treegrid owns focus and no
DOM Portal edit is active. IME composition, AltGraph, key repeat, and every
modifier state leave the shortcut alone; the Portal retains its native text
deletion behavior for both keys.

Row-number and column headers, `Shift+Space`, and `Ctrl/Command+Space` create
stable row or column selections. Their `selectionChanged` payloads include
`mode: 'row'` or `mode: 'column'`; shifted header clicks extend a contiguous
selection on the same axis. The same atomic clear path handles those ranges.

The editor preflights every target before one undoable `editor:delete`
transaction. A nullable field is set to `null`; a non-nullable field with a
`defaultValue` is `unsetField` and normalized back to that default; and an
optional field without a default is `unsetField`. A read-only target, a
required non-nullable field without a default, a limit breach, or a stale
document/selection rejects the entire request without changing the Snapshot.
Multi-range selections use the same all-or-nothing clear path; overlapping
ranges are de-duplicated by stable command address before the single
`editor:delete` transaction. A fill handle remains outside the clear-selection
transaction.

## Treegrid Fill Down

`Ctrl/Command+D` fills each current visible rectangular selection from its top
row into every lower visible row. Multiple ranges are processed in lexical
range order and committed as one transaction; conflicting overlapping targets
fail closed. It is available only while the treegrid owns
focus, no Portal edit is active, and the key is not IME/AltGraph/repeated or
modified with Shift or Alt. A selection without a range, or with only one row,
is a no-op.

All target columns must be editable. A present source value, including `null`,
is copied as a normalized `setField`; an absent source field unsets each
present target. Equivalent targets are skipped. The editor preflights the
entire selection, caps it at 10,000 rows, 256 columns, and 10,000 cells, and
rechecks document and selection generations before and during one atomic,
undoable `editor:fill-down` transaction. Read-only, invalid, stale, or
over-limit requests leave the Snapshot unchanged. Browser `Ctrl/Command+D`
can be reserved for bookmarks, so a renderer with no `fillDown` callback does
not prevent its default behavior. Relative references and full
hidden/filter-aware fill semantics remain future work. A mouse fill handle
extends the active range and retains eligible multi-range peers through the
same transaction, with its own downward edge auto-scroll. `fillSeries()` supports numeric and
ISO temporal sequences across multiple visible ranges, with the same atomic
and overlap-conflict rules; holding `Alt` when starting a single-range handle
drag exposes that same series path through the pointer UI. The default binding can be moved or disabled
through the shortcut registry without changing transaction semantics.
Multi-range `Ctrl/Command+Enter` filling is supported when every selected
rectangle spans at least two visible rows in the same editable column. The
draft is parsed once, overlapping occurrence IDs are de-duplicated, aggregate
limits are enforced, and one undoable `editor:fill-selection` transaction is
committed; axis selections and cross-column ranges remain rejected without
partial changes.

## Portal Fill Selection

While the DOM Portal is editing, `Ctrl/Command+Enter` applies its draft to a
current visible rectangular selection only when that selection is exactly one
editable column and at least two rows, with the active draft inside the range.
The renderer leaves invalid ranges to the browser and does not submit the
draft. IME, AltGraph, repeated keys, Shift, and Alt also leave this path
inactive.

The editor parses and normalizes the draft once, then preflights all selected
rows and applies the same value, including the active cell. Equivalent targets
are skipped. Multi-range selections are accepted when every range is at least
two rows in the same editable column; overlapping occurrence IDs are
de-duplicated before the one transaction.
The operation is capped at 10,000 rows, one column, and 10,000
cells, rechecks document and selection generations before and during its one
undoable `editor:fill-selection` transaction, and preserves the draft and
Snapshot on any invalid, stale, or over-limit request. A successful fill does
not run Enter navigation or change the selection. Axis-selection batch
assignment, hidden/filter-aware, series, relative-reference, and fill-handle
semantics remain outside this slice.

## Component Props/Outputs facade

`createBomEditorComponent(props)` is the browser-facing integration surface for
applications that want a Props/Outputs boundary without constructing or
exposing a `DataSource`. `props.document` is required, the remaining creation
inputs are `BomEditorCommonOptions`, `props.diffView` is optional, and
`props.outputs` is optional.
Runtime `dataSource`, unknown Props, unknown output names, and non-function
output values are rejected rather than ignored.
The facade exposes `mount()`, `unmount()`, `update()`, `focus()`, `blur()`,
`setDiffView()`,
`previewPaste()`, `validate()`, `matchMaterials()`,
`proposeMaterialMatch()`, `applyMaterialMatch()`, `proposeFix()`,
`applyFix()`, import/export operations, and `destroy()`; it does not expose a
DataSource.

`props.diffView`, `update({ diffView })`, and `setDiffView(diffView)` accept a
controlled, value-free `BomCanvasDiffView` or `null` to clear it. Build the
object with the public renderer protocol re-exported by this package:

```ts
import {
  BOM_CANVAS_DIFF_VIEW_PROTOCOL,
  type BomCanvasDiffView,
} from '@bom-editor/editor';

const diffView: BomCanvasDiffView = {
  protocol: BOM_CANVAS_DIFF_VIEW_PROTOCOL,
  documentId: document.documentId,
  documentGeneration: generation,
  viewRevision: document.revision,
  rows: [{ occurrenceId, kind: 'changed' }],
  cells: [],
};
```

The overlay is not a `BomSnapshotDiff` transport. It carries only current
stable row/column addresses and a Diff kind, never `before`/`after`, field
paths, raw BOM values, validation parameters, or a plugin proposal Diff. The
editor normalizes and freezes that limited shape, then requires its
`documentId + documentGeneration + viewRevision` to exactly match the current
published document. A stale binding returns `BOM_EDITOR_DIFF_VIEW_STALE`; an
unknown current row or column is a configuration failure. Neither failure
replaces an already valid overlay.

Deleted rows that are absent from the current Snapshot may use the optional
`deletedRows` summaries. A summary contains a stable deleted ID, a positive
count, and either a current-row `before`/`after` anchor or a `start`/`end`
position. It is rendered as a value-free, non-interactive note and never as a
fake grid row; a present deleted ID or missing anchor is rejected.

For a deleted row that must occupy a visual and semantic grid position, use
the optional `ghostRows` projection. A ghost contains a unique deleted stable
ID, a `start`/`end` position or an anchored `before`/`after` position, and an
optional depth. Ghost rows contribute to layout height, visible row position,
`aria-rowindex`, and `aria-rowcount`, while remaining read-only,
unselectable, uneditable, non-expandable, and invalid as transaction targets.
The editor normalizes and validates the same bounds as the renderer; stale
bindings, duplicate IDs, current Snapshot IDs, missing anchors, or invalid
depths fail closed.

`outputs.onDocumentChange` runs after a local optimistic UI transaction has
committed and receives a frozen `{ snapshot, commit, patch, origin }` payload.
It is an output notification, not a proposal/accept handshake: the component
does not wait for the host to approve it. `outputs.onStructureMoveRequest`
forwards the frozen `structureMoveRequested` event for partial-Snapshot tree
moves. Its request contains only the versioned protocol, document identity and
generation/revision, stable source IDs, and either a keyboard direction or a
pointer target/position. It never changes the local Snapshot; the host must
load and validate the authoritative structure, then call
`update({ document, structureMoveRequestId: request.request.requestId })`.
The other supported outputs forward the frozen runtime events:
`onDocumentReplaced`, `onSelectionChange`,
`onViewChange`, `onEditStart`, `onDraftChange`, `onEditEnd`, `onEditRejected`,
`onPaste`, `onTaskProgress`, `onMaterialMatchAudit`, and `onError`.
`onDocumentReplaced` forwards the value-free document identity in
`event.next`; use `next.documentId`, `next.generation`, and `next.revision` to
construct the next controlled Diff view after a document adoption. Material-match audit output is
value-free and is queued in the same order as the corresponding
document-change output.
Every supplied document is normalized before creation or update. Outputs are
queued in their original order as microtasks rather than running inside the
EventHub dispatch stack, so a callback can safely call a public component
method. Callback failures, including an unexpected rejected Promise, are
isolated and cannot interrupt the editor, sibling outputs, or the
already-committed transaction. `destroy()` discards outputs that have not yet
been delivered.

## Material Match Adoption

`matchMaterials()` is a read-only, revision-bound suggestion pass. Even a
`selected` result never changes the Snapshot or selection. Only an exact
candidate object returned by that editor instance can be passed to
`proposeMaterialMatch(targetOccurrenceId, candidate)`. The resulting frozen
`BomMaterialMatchProposal` is an instance-local capability bound to the
document ID, generation, `baseRevision`, target and candidate occurrence IDs, and
algorithm score/confidence; JSON clones and object spreads are rejected.

`applyMaterialMatch(proposal)` is the explicit adoption action. It rechecks the
capability and both live material nodes inside the editor FIFO, then copies the
candidate's material reference with one `editor:material-match:<proposalId>`
transaction. The transaction participates in normal Undo/Redo. An optional
`matchApprovalPolicy` receives only the proposal metadata and must approve
before any write; denial, cancellation, stale revisions, invalid nodes, or
policy failures leave the Snapshot unchanged. `onMaterialMatchAudit` reports
the proposal `baseRevision`, approval, denial, cancellation, stale, and commit
decisions without material codes, IDs, query text, or field values.

`update({ document, columns?, diffView?, outputs? })` accepts a new document,
optional controlled columns, an optional controlled Diff overlay, and optional
output callbacks. Schema and every other creation option are fixed for the
lifetime of the component facade. After input normalization, a data update is
applied in the order `document -> columns -> diffView`; this lets the overlay
bind to the adopted document generation and final column addresses instead of
the preceding view. A document with the same
`documentId` and `revision` is treated as a host echo and ignored, preserving
an active draft only when no document replacement remains unapplied; otherwise
it is also forwarded through the editor's normal FIFO `setDocument()` path. The
Snapshot is validated before this echo check;
invalid documents, invalid output handlers, and additional update properties
fail without changing the component. Outputs can be replaced independently of
whether a document echo is ignored.

The editor clears the overlay whenever a document replacement, source
replacement, transaction, Undo, or Redo makes its revision binding stale. It
also clears it when a controlled column update removes a column referenced by a
cell decoration. A current-Snapshot overlay never invents a deleted row;
`deletedRows` summaries remain notes rather than editable rows, while
`ghostRows` provides the validated full single-row projection for deleted IDs.

`importData(source, options)` and `exportData(options)` are available on both
the headless editor and this facade. The current bounded I/O slice accepts
UTF-8 CSV/TSV from a `Blob`, `ArrayBuffer`, or byte `ReadableStream`; preview
uses the existing conversion/authorization checks without mutating the
Snapshot, while commit reuses one atomic paste transaction and rechecks the
captured revision. It emits value-free `taskProgress` stages with task types
`import` and `export`, and cancellation or a changed document fails closed.
CSV/TSV export supports visible/filtered/all row scopes, safe formula
protection, and an optional `exportPolicy`; complete-data export requires that
policy and reports any field cropping/masking as `policyTransformed` and
non-lossless. Delimited import supports an optional first-row header, stable
`fieldId` mappings, field reordering, value-free cell diagnostics, and preview
`proposedPatch` output. `roundTripTemplate` export writes the current view as a
versioned JSON envelope; decode it with `parseBomViewTemplate()` and apply it
through `applyViewTemplate()` without exposing BOM values. XLSX now supports a
bounded pure-data worksheet subset through the same mapping and atomic commit
pipeline; formulas, macros, external links, encrypted archives, XLS, and
spill-scale I/O are rejected or remain explicit unsupported capabilities, not
silent fallbacks.

The bounded XLSX parser also returns frozen, value-free worksheet/source-cell
diagnostics (`sheetName`, row, column, and code) for formula cells, invalid
shared-string/type references, cell-byte limits, and row/column/cell resource
limits. The selected worksheet name is retained through later mapping and
conversion failures. Workbook, ZIP/XML, relationship, macro,
external-link, and sheet-selection failures remain top-level `BomError`
contexts. Any parser diagnostic rejects the complete import before mapping or
the atomic paste transaction; parsed valid cells are never partially committed.
Diagnostics are bounded to 256 entries per worksheet and remain in memory; this
is not cross-format aggregation, worker/decompression pooling, or
spill/streaming transaction support.

`validate({ scope, signal })` is a read-only Core validation pass. `scope` is
`document` by default, or `visible`/`selection` to follow the current
projection or stable selection ranges. The frozen report includes the checked
node count, document revision, deterministic value-free `BomValidationIssue`
diagnostics, and a `valid` flag. Long passes yield through `taskProgress` with
`taskType: 'validate'`; an aborted signal or destroy returns the normal
structured failure. This slice covers structural index checks and field Schema
normalization only. Business validators and fixers remain plugin-provided, but
validator registration requires the owning plugin's `document:read` grant and
`schema` is supplied to validator, fixer, and command hooks only with a
separate `schema:read` grant. The host validates and stamps plugin finding rule
metadata, version, severity, deterministic order, and issue IDs; results that
outlive a document or plugin generation return `BOM_EDITOR_VALIDATION_STALE`
without replacing the current report. A post-fix validation pass runs after the
transaction leaves the FIFO, so slow plugin validation cannot block later edits
or Undo/Redo. The editor now turns a `BomPluginFixDraft` into a host-issued immutable proposal
with a revision-bound impact scope and preview Diff. `applyFix()` accepts only
that exact issued object, requires the owning plugin's `document:write` grant,
commits one Undoable `plugin:fix:<proposalId>` transaction, rejects overlapping
repairs unless the host explicitly chooses `conflictResolution: 'supersede'`,
and automatically reruns document validation after commit. Worker validation,
cross-process approvals, and persistent audit storage remain host concerns.

## Clipboard Copy

The editor prepares one policy-authorized payload with `text/plain`, safe
escaped `text/html`, and the exact V1 internal JSON envelope
`bom-editor/clipboard` / `cell-grid-text`. Field cropping, masking, formula
injection protection, and output limits are applied identically to every
representation before any value is read. Copy and cut both cap the visible
selection at 10,000 rows, 256 columns, and 10,000 cells, and cap each
serialized representation at 1 MiB total and 64 KiB per cell. The renderer writes all prepared
types through one `ClipboardItem` when the browser supports rich Async
Clipboard; the trusted native copy fallback calls `setData()` for each type.
The internal MIME is only a bounded cell-text grid and carries no document or
command identity.

## Clipboard Cut

The renderer asks the editor to prepare `copy()` or `cut()` payloads; the editor
is the only layer that reads field values, runs `clipboardPolicy`, or changes a
Snapshot. The current cut slice is deliberately narrow: it accepts only the
visible rectangular selection of editable, non-required fields without a
`defaultValue` that are present in every selected row. Preparation synchronously caps
the selection at 10,000 rows, 256 columns, and 10,000 cells, and caps each
serialized representation at 1 MiB total and 64 KiB per cell. A cut policy must allow
every selected field without cropping or `omit`/`redact`/`hash` masking,
otherwise no Clipboard payload is produced and no field is changed. Command
preparation deduplicates only the unambiguous stable `(occurrenceId, fieldId)`
target, without composing an ambiguous string key.

Only a trusted native renderer `cut` event that successfully writes its payload
can report a completed write to the editor; synthetic `cut` events fail closed
before payload preparation. After that successful write, the editor queues one
`editor:cut` batch of `unsetField` commands. It rechecks the document ID,
generation, revision, and mount generation immediately before commit; stale or
failed work leaves the Snapshot unchanged. `clipboardOperation` with
`outcome: 'written'` confirms the external write only. A committed delete is
identified separately by `transactionCommitted` with `origin: 'editor:cut'`.
The renderer blocks native `copy` and `cut` on its editing Portal, so an
uncommitted draft cannot export, delete, or bypass Clipboard Policy. Writable
DataSources retain their normal local-commit and
`transactionPersistenceChanged` semantics after that transaction.

## Clipboard Branch Cut

Branch copy and cut are independent commands and never reinterpret a cell
selection as `deleteSubtree`. The default renderer bindings are
`Primary+Shift+B` (`copy-branch`) and `Primary+Shift+K` (`cut-branch`). The
active row, or a contiguous row-axis selection, supplies stable branch roots;
the first slice includes every loaded descendant even when the tree is
collapsed and rejects partial Snapshots, nested roots, column selections, and
multi-ranges. The editor requests the complete structural occurrence list and
all Schema field IDs from `clipboardPolicy` before reading any node fields.
Cropping or masking is rejected because deleting a branch without its original
values would lose data.

The outbound internal envelope is versioned as `kind: 'branch-tree'` and is
kept separate from the cell-grid parser. A trusted Async Clipboard write must
complete before one `editor:cut-branch` batch of root `deleteSubtree` commands
is queued; document ID, generation, revision, and mount generation are
rechecked before commit, and Undo restores the branch. `clipboardOperation`
uses `copy-branch`/`cut-branch` with a value-free `branch` scope. V1
`paste()` accepts the internal `branch-tree` envelope, revalidates the full
node structure against the receiving Schema, remaps every occurrence ID, and
inserts the roots relative to the active row (or as children of an active
group). The existing `pastePolicy` authorizes normalized branch field values
before one undoable `editor:paste-branch` insert batch. HTML/text outlines are
never interpreted as branch data, and `previewPaste()` remains cell-grid-only.

## Clipboard Paste

`paste()` accepts raw clipboard representation candidates and `pasteText()` is
the convenience form for `text/plain`. Candidate selection is
`internal -> html -> text`. The inbound V1 internal candidate is deliberately
narrow: it must be the exact `bom-editor/clipboard` / version `1` /
`cell-grid-text` envelope containing one non-empty rectangular `string[][]`.
It cannot carry a document ID, stable row ID, field path, command, Policy,
style, or an extensible unknown property. Duplicate keys, malformed JSON,
unsupported versions, ragged/empty/non-string grids, prototype-related keys,
and every configured size limit fail the internal candidate. A failed internal
candidate can fall back to a simultaneously supplied HTML or plain-text
candidate.

HTML parsing is a headless, bounded table parser. It reads only `table`/`tr`/
`td`/`th` cell text, decodes a small entity allow-list, drops script/style/
embed-like content, expands `rowspan`/`colspan` into an empty-covered-cell
rectangle, and rejects non-table input or limit breaches. Plain text strictly
recognizes TSV/CSV quoting and line endings, including single-column multi-line
values and escaped single-cell round trips.

Plain-text parsing is genuinely cooperative and incremental on the main
thread. Inputs above the bounded Worker threshold use the derived parser
Worker when the mounted runtime exposes one; the task carries the current
`documentId` and `documentGeneration`, and the Worker can only return parsed
data. Worker startup, protocol, crash, and CSP failures destroy that client and
fall back to the same main-thread parser. Both paths yield to the scheduler,
observe `AbortSignal`, and fail before `pastePolicy` authorization or a
transaction.
The call reserves its place in the editor FIFO mutation queue immediately:
parsing, target construction, preparation, and local commit run in that one
queued task, so a later `execute()`, paste, or `setDocument()` cannot overtake
it. At the parser/preparation/commit boundaries, the editor rechecks document
ID, generation, revision, and the selected target version; document or
selection changes fail closed without changing the Snapshot. Target row mapping
also yields every 256 rows and rechecks cancellation and staleness; target
preparation and Schema conversion cooperate every 512 cells. `destroy()` aborts
an in-flight paste that has not locally committed. An `AbortSignal` that fires
before local commit, including from a synchronous `beforeTransaction` listener,
prevents that local transaction and leaves the Snapshot unchanged.

`previewPaste()` runs the same parse, target mapping, Schema conversion, and
`pastePolicy` authorization stages without creating a transaction or changing
the Snapshot. It returns the normalized target cells for a review UI and is
queued with the same FIFO barrier as `paste()`. Both paste and preview emit
value-free `taskProgress` events (and the component forwards them as
`onTaskProgress`) with monotonic phase progress: parse, prepare, authorize,
commit/preview, and complete. Cancellation and stale targets keep the Snapshot
unchanged.

`BomPasteInput.textStream` accepts one async iterable of text chunks (mutually
exclusive with `text`). The adapter checks UTF-8 limits while consuming the
source and incrementally stages TSV and CSV rows with two delimiter candidates,
so a complete input string is not joined for the normal structured path. Quote,
CR/LF, and UTF-16 surrogate boundaries may cross chunks; cancellation or
rejection calls the iterator cleanup path. A delimiter-free plain-text fallback
retains the raw source only when the canonical literal-text semantics require
it. The resulting rows, converted cells, policy request, and command batch are
still bounded in memory so the final write remains one atomic transaction: this
is an incremental bounded staging path, not the future spill-to-disk or
progressive large-data transaction pipeline. The current default 1 MiB,
10,000-row, 256-column, 10,000-cell, and 64 KiB-per-cell limits still apply.

Internal format writing and multi-MIME Clipboard output are implemented. Paste
preparation now reports every target/read-only and type-conversion diagnostic
observed in one atomic request; no valid cells are committed when any
diagnostic exists. Parser failures now add a frozen, value-free first-source
`sourceRow`/`sourceColumn` diagnostic for malformed candidates and resource
limits; the same diagnostic is returned by `paste()` and `previewPaste()`.
Complete spill-to-disk/streaming transaction handling and cross-format full
diagnostic collection remain future work. Column `editable` and the
independent synchronous `pastePolicy` are enforced before one atomic,
Undo-able transaction.
`pasteOperation` records value-free audit metadata only.
