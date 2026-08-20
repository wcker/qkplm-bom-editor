# @bom-editor/visible-projection

DOM-free visible-preorder and row-position index for a normalized BOM snapshot.
The package implements the projection and vertical virtualization contracts in
sections 5.2, 5.3, and 6.1 of the BOM editor whitepaper.

## Preconditions

- The snapshot must be the immutable result of
  `normalizeBomDocumentSnapshot`. In particular, `nodes` must be normalized
  preorder and sibling order must use `lexicographic-ascii-v1`.
- Optional `indexes` must be the `buildBomIndexes` result for that exact
  snapshot. The factory validates row coverage, parent relations, sibling
  order, roots, and normalized preorder before accepting it.
- The structural metadata and supplied indexes must not change during a
  projection's lifetime. Field-only and material-reference-only revisions may
  reuse the projection inside a newly published runtime state bundle. Recreate
  it after parent, position, root order, loaded-child, filter, or sort changes.
- Only loaded occurrences can be projected. Expanding a `partial` node shows
  its loaded children; expanding an `unloaded` node records expansion state
  but cannot invent rows for data that has not arrived.

Without `expandedIds` or `expandAll`, all loaded roots are visible and
collapsed. `rowHeight` defaults to 28 CSS pixels. A per-row height must be
finite, positive, and no greater than `MAX_ROW_HEIGHT_PX`.

## API

```ts
import { createVisibleProjection } from '@bom-editor/visible-projection';

const result = createVisibleProjection(snapshot, {
  indexes,
  rowHeight: 28,
  expandedIds: ['assembly-root'],
});

if (!result.ok) {
  // Stable BOM_VISIBLE_PROJECTION_* codes; no exception-based control flow.
  console.error(result.errors[0]?.code);
} else {
  const projection = result.value;
  const window = projection.windowByOffset(scrollTop, viewportHeight, 160);
}
```

The stable-ID operations are:

- `occurrenceAt(index)` and `indexOf(occurrenceId)`;
- `depthOf(occurrenceId)` for stable Canvas tree indentation;
- `occurrenceAtOffset(y)` and `offsetOf(occurrenceId)`;
- `windowByOffset(scrollTop, viewportHeight, overscanPx)`;
- `setExpanded(occurrenceId, expanded)`;
- `setRowHeight(occurrenceId, rowHeight)`.

Rows use half-open pixel ranges `[offset, offset + rowHeight)`. A window
contains rows intersecting its clamped viewport-plus-overscan range. Its
`endIndex` is exclusive. A valid index or offset beyond the current content
returns a successful `undefined`; malformed parameters and unknown stable IDs
return a frozen error Result.

Arrays, windows, change summaries, error arrays, error paths, and error details
returned by the public API are frozen snapshots. No mutable collection or rope
node is exposed.

## Data structure and complexity

The visible sequence is an implicit AVL rope. Each rope node maintains AVL
height, visible row count, and subtree pixel sum. A separate ID map points to
visible rope nodes, while every loaded BOM node has expansion state and a
visible-subtree-size entry. Bulk expansion builds one balanced rope fragment
and joins it locally; it never copies the unaffected visible sequence.

All BOM hierarchy walks, rope construction, split, join, window enumeration,
and detached-range cleanup are iterative. AVL height remains `O(log v)`.

Here `n` is loaded node count, `v` visible count, `s` the visible loaded
descendants inserted or removed, `d` ancestor depth, and `w` returned window
rows.

| Operation | Preconditions | Average time | Worst time | Extra space | Degradation path |
| --- | --- | ---: | ---: | ---: | --- |
| Factory/index validation | Normalized immutable Snapshot | `O(n+v)` | `O(n+v)` | `O(n+v)` | `expandAll` makes `v=n` |
| `occurrenceAt` | Non-negative safe integer | `O(log v)` | `O(log v)` | `O(1)` | None; AVL bound is deterministic |
| `occurrenceAtOffset` | Finite non-negative pixel offset | `O(log v)` | `O(log v)` | `O(1)` | None; subtree pixel sums are maintained eagerly |
| `indexOf`, `offsetOf` | ID belongs to Snapshot | `O(log v)` | `O(n+log v)` | `O(1)` | ECMAScript Map has implementation-dependent adversarial worst case |
| `windowByOffset` | Finite non-negative viewport inputs | `O(log v+w)` | `O(log v+w)` | `O(w)` | Large overscan can make `w=v` |
| `setRowHeight` | Valid known ID and bounded height | `O(log v)` visible, expected `O(1)` hidden | `O(n+log v)` | `O(1)` | Adversarial Map behavior; hidden override is applied on later expansion |
| `setExpanded` | Valid known ID | `O(log v+s+d)` | `O(n+log v+s+d)` | `O(s)` transient | Expanding/collapsing the whole loaded tree makes `s=O(n)`; adversarial Map lookup adds `O(n)` |
| `toArray` | None | `O(v)` | `O(v)` | `O(v)` | Intended for diagnostics/tests, not render frames |
| `expandedOccurrenceIds` | None | `O(n)` | `O(n)` | `O(e)` | Scans Snapshot order to return a deterministic frozen result |

Persistent space is `O(n+v)`: base indexes and expansion/subtree metadata are
`O(n)`; visible rope nodes and the visible ID map are `O(v)`. Per-row height
overrides add `O(h)`, where `h <= n`.

The primary unavoidable degradation is a full-tree visibility change:
`s` approaches `n`, so linear work and a fragment allocation are correct.
No full visible-array copy occurs. Snapshot structure changes, view-level
filter changes, and sort changes are separate invalidation boundaries and
currently require creating a projection against the corresponding normalized
indexes.
