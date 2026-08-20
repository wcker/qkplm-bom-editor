# `@bom-editor/contracts`

This package is the neutral protocol and data-contract layer for the BOM editor.
It contains no runtime implementation and has no framework or DOM dependency.

The public `@qkplm/bom-editor/contracts` subpath must re-export this package. Code
that only handles snapshots, patches, remote messages, Worker messages, or
headless plugin negotiation can depend on `@bom-editor/contracts` directly.

Snapshot Diff results are also defined here so main-thread and Worker
implementations exchange one wire-safe shape. A Diff is descriptive evidence,
not an executable Patch: compiling changes into an atomic, dependency-safe
`BomOperation` sequence belongs to the transaction layer. Worker Diff tasks
carry their `BomSchema` explicitly; the protocol has no implicit Schema
registry whose state could vary between instances or execution realms.

Plugin repair follows the same separation. A fixer returns a
`BomPluginFixDraft`; the editor host, not the plugin, derives the formal
`BomPluginFixProposal` document binding, impact scope, preview Diff, and active
proposal conflicts. Proposal fields can be serialized for display and audit,
but approval is instance-local: an application must return the exact proposal
object to the issuing editor's `applyFix()` rather than recreate its shape from
stored data. Its Diff is an isolated dry-run preview; applications must take
the authoritative resulting revision from the returned `BomCommit`, not from
the preview Diff's `targetRevision`.

Business-rule findings use the same host-owned boundary. Validators require a
runtime `document:read` grant, and `schema` is optional in every plugin hook
that reads the document. `BomPluginValidationFinding` contains only the
diagnostic location and value-free message data; the host stamps the registered
rule ID, rule version, severity, and issue ID after validating the finding.

## Boundary

- Types are immutable and contain only JSON-compatible values or explicitly
  structured-clone-compatible binary data (`Uint8Array`).
- Functions, classes, `AbortSignal`, `HTMLElement`, `Blob`, Canvas types, URLs,
  and host runtime objects do not belong in this package.
- Cancellation crosses process boundaries through request/task IDs and explicit
  cancellation messages. Runtime adapters translate local `AbortSignal` values
  into those messages.
- Strings such as revisions, position keys, hashes, and protocol versions are
  opaque. Consumers must not parse or synthesize them unless a protocol grants
  that responsibility.
- Runtime packages own validation. A TypeScript type does not replace checks for
  finite numbers, safe integers, canonical decimals, limits, or untrusted input.

The package deliberately exposes no mutable registries, callbacks, renderers,
editors, or event listener APIs. Those belong to headless or browser runtime
packages built on top of these wire-safe contracts.
