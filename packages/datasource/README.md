# @bom-editor/datasource

Callable DataSource objects live in this package because their Promise and
AbortSignal methods are runtime behavior. The neutral contracts package remains
limited to serializable request, response, chunk, Patch, and capability types.

The bundled memory source:

- normalizes and owns an immutable Snapshot;
- validates capability and optional-method consistency;
- applies writable Patches through @bom-editor/transaction;
- serializes commits and checks expected source revision;
- requires an idempotency key for every writable commit;
- publishes ordered remote envelopes to in-process observers;
- reports cancellation, conflict, read-only, and destroyed states without
  exposing BOM field values in errors.

It intentionally does not emulate remote latency, lazy children, streaming, or
server-side query execution. Those capabilities remain false and Runtime must
not call their optional methods.

## Remote commit coordination

`createBomRemoteCommitCoordinator()` is a headless FIFO persistence state
machine for a single active document generation. It captures every local
commit, requires a lifecycle-unique idempotency key, rebuilds the immediate
pending dependency chain, and permits only one DataSource `commit()` in flight.

An acknowledgement advances only the confirmed source revision. Explicit
rejection or conflict is delegated to host-provided atomic rollback and
isolated replay hooks. For a conflict, `rollbackAtomically` must reconcile its
`remoteOperations` on the atomic rollback baseline (or fail and require a
reload); `replayInIsolation` then replays all descendants on that reconciled
baseline. A successfully handled conflict adopts its reported source revision,
while failed replay produces a versioned `BomRecoveryBundle`.
Thrown, aborted-with-unknown-outcome, or malformed remote responses fail closed
as `reloadRequired` and never trigger speculative rollback. The same captured
idempotency key can only be resent through the explicit indeterminate retry API.

`documentId + documentGeneration` is checked before dispatch, after every
remote response, and around recovery hooks. Replacing or destroying the active
context settles all outstanding outcomes and isolates late responses. Audit
events contain identifiers, revisions, state, counts, and error codes only;
Patch, Command, and field values are intentionally excluded.

`cancelPending(transactionId)` is intentionally tail-only. A queued tail is
removed locally; an in-flight tail requires the source to declare
`cancelPendingCommit` and confirm `cancelCommit`. Callers that need to replace
a source must cancel the complete dependency chain from tail to head, then
perform their own atomic local history rollback. A declined or indeterminate
cancellation is not a successful rollback and must remain recoverable rather
than being treated as a local no-op.
