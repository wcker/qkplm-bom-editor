# `@bom-editor/transaction`

`@bom-editor/transaction` is the DOM-free local transaction engine described by
the repository's
[v2 technical whitepaper](../../现代化高性能可复用BOM编辑器组件.md). It depends on
`@bom-editor/contracts` for public wire types and delegates all Snapshot,
Schema, structure, hashing, position-key, and base-index correctness to
`@bom-editor/model`.

## First-stage scope

- Own an immutable in-memory Snapshot and its model-built base indexes.
- Serialize `execute`, `executeBatch`, `applyPatch`, `undo`, and `redo` through
  one FIFO queue.
- Compile built-in insert, delete, move, set, unset, and material-reference
  Commands into versioned Patches.
- Generate `lexicographic-ascii-v1` position keys and emit an explicit
  `rebalancePositions` operation only when no valid gap remains.
- Validate protocol, document, generation, and base revision before applying.
- Allow field and material edits on loaded partial Snapshots while rejecting all
  structural operations until the full structure is available.
- Build a candidate in isolation, generate a new revision and inverse Patch,
  derive the required indexes, then atomically publish the complete state
  bundle.
- For a field-only Patch, revalidate only the changed rows because ID, parent,
  root, order, and child-count invariants are inherited from the previous
  normalized Snapshot. Its row index uses an immutable flattened override map
  while children and material indexes retain their previous references.
  Structural and material-reference Patches keep the full model normalization
  and index-build fallback.
- Retain Undo/Redo entries under both entry-count and estimated UTF-8 byte
  budgets.
- Reconcile a rejected history suffix, optional conflict operations, and all
  descendant replays in one FIFO work item with one final atomic publication.

Remote DataSource confirmation, pending queue policy, and `RecoveryBundle`
ownership remain outside this package. The transaction engine supplies the
atomic history-backed primitive used by that coordinator.

## Usage

```ts
import { createBomTransactionEngine } from '@bom-editor/transaction';

const created = createBomTransactionEngine({
  snapshot,
  schema,
  protocolVersion: '1.0.0',
  history: { maxEntries: 100, maxBytes: 16 * 1024 * 1024 },
});

if (!created.ok) throw new Error(created.errors[0]?.code);

const result = await created.value.execute({
  type: 'setField',
  occurrenceId: 'occurrence-1',
  fieldPath: ['quantity'],
  value: { $type: 'decimal', value: '2.000', unit: 'pcs' },
});
```

Expected data, validation, and conflict failures are returned as
`BomTransactionResult`; they do not reject the Promise. Snapshot and index
getters always expose the last fully committed immutable state.

## Complexity and derived hashes

For `n` loaded nodes, `a` affected rows, `u` distinct rows overridden by
prior field commits, and `m` Schema fields, a field-only commit is currently
`O(n + u + a*m)`. The `O(n)` term creates the immutable Snapshot node array
while sharing unchanged node records; `O(u)` flattens row overrides onto the
original base map so repeated commits never form a lookup chain. It does not
rebuild structural or material indexes. A structural commit retains the
full-normalization fallback and its sibling sorting costs.

`contentHash` remains the exact canonical SHA-256 required by the whitepaper,
but is derived lazily. The default opaque revision does not require it.
`getContentHash()`, a custom revision factory, or reading
`prepared.contentHash` computes and caches the full `O(B)` canonical hash,
where `B` is encoded document size. Undo correctness is unchanged; callers
should not put an uncached full-document hash read on an input-feedback path.

## Remote persistence metadata

`execute()` and `executeBatch()` can inject an `idempotencyKey` and
`dependsOnTransactionId` before the local Patch is prepared. The same owned
Patch is therefore visible to pre-apply hooks, local commit events, and a
remote DataSource; the persistence layer does not rewrite an already published
Patch after local commit.

`acknowledgeSourceRevision()` is serialized on the engine FIFO. It checks the
expected local revision and optional prior source revision, then changes only
the immutable Snapshot envelope's `sourceRevision`. Domain content, local
revision, indexes, canonical content hash, history, and pre-apply hooks remain
unchanged. Dependency rollback and isolated descendant replay remain the
responsibility of the remote coordinator and its atomic host hooks.

`reconcileHistorySuffix()` requires `failedTransactionId` to identify an exact
contiguous suffix of the active Undo history. Every requested descendant must
match the engine-owned transaction identity, metadata, and original Command or
Patch semantics. The engine forks an isolated candidate, rolls the suffix back
in reverse order, applies optional conflict operations, and replays descendants
in their original order with rewritten local bases and dependencies. Only a
fully valid candidate reaches the live `beforeApply` hook and is published.
Failure, cancellation, eviction, or suffix mismatch leaves the live Snapshot,
indexes, content hash, history, and revision counters unchanged. The result
includes the rollback baseline revision, rollback order, aggregate publication
Commit, and original-to-replayed Commit mappings for persistence coordination.

`undo()` and `redo()` accept optional `dependsOnTransactionId` and
`idempotencyKey` metadata. These values are present on the generated replay
Patch before `beforeApply`, allowing a writable host to persist an Undo as a
dependent compensation without rewriting an already published Commit.

## Synchronous pre-apply gate

Hosts that must publish a synchronous cancellable `beforeTransaction` event can
provide `beforeApply(prepared)`. The hook runs after the final Patch, inverse,
revision, candidate Snapshot, and indexes exist, but before any engine state
changes. `prepared.contentHash` is an exact lazy getter. Returning `false`
cancels atomically. Throwing produces a structured failure. Mutating operations
called reentrantly from the hook return
`BOM_TRANSACTION_REENTRANT_EXECUTE`.

The hook must not return a Promise. There is deliberately no cross-await
prepared token, so a prepared transaction cannot become stale while waiting for
host code.

## Development

```sh
pnpm --filter @bom-editor/transaction typecheck
pnpm --filter @bom-editor/transaction test
```

Tests use Node's built-in runner and do not load DOM
or WebWorker libraries. The default suite includes five fixed PRNG seeds with
256 mixed operations each. Every successful checkpoint compares all three
incremental base indexes with `buildBomIndexes()`, recomputes the canonical
content hash, and fully undoes each seed. Set
`BOM_INDEX_EQUIVALENCE_SEED=<uint32>` to replay one failing seed.

