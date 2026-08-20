# @bom-editor/runtime

Browser-facing foundations for the BOM editor runtime. This package owns the
typed browser event surface, synchronous cancellation wrapper, seven-state edit
machine, browser capability detection, and deterministic resource teardown.

## Boundary

- `@bom-editor/contracts` remains the DOM-free, serializable protocol source.
  Runtime cancellable events are short-lived wrappers and must never cross a
  Worker, DataSource, persistence, or structured-log boundary.
- This package is compiled with `ES2022` and `DOM`, but importing it does not
  read `window`, `document`, or any browser constructor. Capability detection
  happens only when `detectBomCapabilities()` is called and accepts a minimal
  injected window-like object for SSR and tests.
- `EventHub` rejects reentrant dispatch with
  `BOM_EVENT_REENTRANT_DISPATCH`. A listener exception is isolated, reported to
  the diagnostic sink, and does not stop later listeners.
- `EventHub` exposes current and cumulative listener ownership plus pending
  asynchronous listener invocations. Clearing subscriptions therefore cannot
  hide an invocation whose returned Promise has not settled.
- `preventDefault()` only changes state while the synchronous dispatch stack is
  active. Calls made after dispatch, including after an `await`, are inert.
- `ResourceRegistry` disposes active resources once in reverse registration
  order. DOM events, typed observer families, animation frames, timeouts,
  intervals, Workers, and cancellable tasks all use the same cleanup stack.
  Its versioned diagnostics keep registered, active, cleanup-attempt, and
  cleanup-failure counts per kind. An explicitly untracked kind reports
  `null` counts, so consumers cannot mistake missing instrumentation for zero.

This F3 package deliberately does not create or mount an editor and contains no
projection or rendering implementation.

The runtime also defines the value-free `structureMoveRequested` event and its
`bom-structure-move-request/v1` request protocol. Editors emit it when a
keyboard or pointer structural move cannot be proven from a partial Snapshot;
the request is bound to document generation/revision and stable occurrence IDs
so a host can load the missing structure and publish an authoritative Snapshot
through the controlled component update path.
