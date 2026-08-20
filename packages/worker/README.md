# @bom-editor/worker

The Worker runtime is a browser-independent protocol and scheduler layer for
the BOM editor. It keeps the main thread authoritative: workers only return
derived results and can never commit a Snapshot.

`createBomWorkerPool()` provides a bounded shared pool with protocol
handshakes, priority aging, per-instance fairness, queue backpressure,
cooperative cancellation, timeouts, stale-result rejection, crash recovery,
and an optional cancellable main-thread fallback. `attachBomWorkerRuntime()`
is used by an externally deployed module Worker and accepts only host-provided
task handlers.

The module is side-effect free. A Worker is created only after the host calls
the factory or submits a task, so Node and SSR imports do not access browser
globals.
