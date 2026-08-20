# `@bom-editor/model`

`@bom-editor/model` owns the DOM-free correctness boundary for BOM data. It
validates untrusted runtime input, copies it into canonical immutable snapshots,
computes deterministic hashes, and builds read-only base indexes.

The package depends only on `@bom-editor/contracts`. It does not read browser or
Worker globals and does not retain caller-owned mutable objects.

## Protocol decisions

- Tree depth is one-based: roots have depth `1`.
- Position keys use the `lexicographic-ascii-v1` codec: 1-128 printable ASCII
  bytes compared lexicographically by ASCII byte value.
  They are never compared with locale-sensitive APIs.
- A complete snapshot permits only complete children. A partial snapshot must
  state `childrenState` on every node. `unloaded` has no loaded children;
  `partial` has `knownChildCount >= loadedChildCount`; `complete` has
  `knownChildCount === loadedChildCount` after normalization.
- Decimal and integer strings are validated, never silently rounded or trimmed.
- Material codes are indexed exactly as stored. Locale folding and aliases are
  separate, versioned search-index concerns.
- Content hashes exclude document/revision envelope metadata. Envelope hashes
  include it. Both bind schema and canonicalization versions through domain
  separation.

## Normalization hot path

Snapshot capture owns and freezes the wire graph in one bottom-up traversal.
Flat Schema fields use a compiled key-to-validator plan; nested fields use a
cached path Trie. A Snapshot produced by this package may be reused by identity
only when the exact normalized Schema object and default limits are reused.
External objects, a different Schema, or custom limits always execute the full
boundary validation.

This cache is an implementation optimization, not a public trust flag. No
caller can mark an arbitrary object as normalized.

## Stable-key Snapshot Diff

`diffBomDocumentSnapshots(source, target, schema)` compares two complete
Snapshots by stable `occurrenceId`. Both inputs pass the normal Snapshot and
Schema boundary first. The operation fails closed when either Snapshot is
partial, the document IDs differ, an ID is duplicated, or a retained ID changes
node kind. A missing node in a partial Snapshot cannot be distinguished from an
unloaded node, and a kind change would reuse an identity for a different node
shape.

The result uses the neutral `BomSnapshotDiff` contract shared with Worker
messages. It binds the Schema and position-key codec versions and distinguishes
`delete`, `insert`, `move`, `reorder`, `material`, and `field`
changes. Field absence is represented as `{ present: false }`; it is never
conflated with an omitted JavaScript property. Complete-Snapshot
`childrenState` and `knownChildCount` are loading envelope data normalized
from structure, so they are not emitted as domain changes.
An empty object that exists only as a declared-path container is emitted as a
field change at that container path because its presence affects the canonical
content hash.

Output order is deterministic:

1. deletes in source position preorder;
2. inserts in target position preorder;
3. moves, reorders, and material changes in target position preorder;
4. field changes in target position preorder and UTF-8 field-path order.

A same-parent `positionKey` change is reported as `reorder`, including a
deterministic position rebalance. A parent change is reported only as `move`
and carries both position keys. Declared Schema leaves are compared atomically;
additional-field branches are compared at the first path outside the Schema.
Field values are compared structurally without depending on object insertion
order. Comparable paths use a linear UTF-8 radix order rather than a
comparison sort.

The Diff is descriptive and must not be passed to `applyPatch()`. A future
transaction-layer compiler must separately choose maximal subtree deletes,
parent-before-child inserts, cycle-safe move ordering, and final
reorder/material/field operations before producing one validated atomic Patch.

Including input normalization, expected time is `O(n + B)` when sibling input
is already normalized. Worst-case time is `O(n log n + B)` because Snapshot
normalization may sort siblings; structural value comparison and deterministic
field-path radix ordering are linear in the bytes they inspect. Working space
is `O(n + B)` beyond normalized inputs and the returned changes. Malformed,
partial, cross-document, or identity-reusing inputs return `BomModelResult`
errors rather than a partial Diff or heuristic match.

## Material matching

`matchBomMaterials(snapshot, options)` is a DOM-free, read-only suggestion
engine. It ranks material occurrences through exact code/ID matching, prefix,
host aliases, host-provided transliteration and tokenization, bounded edit
distance, and explicit specification-field weighting. The host owns locale
rules and dictionaries through the `pinyin` and `tokenizer` callbacks; this
package does not embed an enterprise dictionary or locale-specific algorithm.

Results are immutable and include normalized values, component scores, reasons,
confidence, and a deterministic `occurrenceId` tie-break. Supplying both
`selection.minConfidence` and `selection.minScoreDelta` can yield a selected
suggestion, but the function never changes the Snapshot or performs a write.
