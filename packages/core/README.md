# `@qkplm/bom-editor`

This package is the stable public facade for the BOM editor Core. Its logical
entry points follow the root whitepaper; the workspace packages behind them are
implementation boundaries and are not application-facing compatibility APIs.

## Public entries

| Entry | Purpose | Environment |
| --- | --- | --- |
| `@qkplm/bom-editor` | `createBomEditor`, editor lifecycle types, errors, and neutral contract types | Browser API; safe to evaluate during SSR |
| `@qkplm/bom-editor/contracts` | Serializable, DOM-free protocol types | Node, SSR, Worker, browser |
| `@qkplm/bom-editor/model` | Validation, normalization, indexes, positions, and canonical hashes | Headless |
| `@qkplm/bom-editor/transaction` | FIFO transactions, Patch application, Undo, and Redo | Headless |
| `@qkplm/bom-editor/datasource` | Callable DataSource API and deterministic memory source | Host runtime with `AbortSignal` |
| `@qkplm/bom-editor/runtime` | Browser lifecycle foundations, events, editing state, capabilities, and resources | Browser types; SSR-safe evaluation |
| `@qkplm/bom-editor/renderer/canvas` | Virtualized Canvas renderer, layout, DPR, hit testing, ARIA, and edit Portal | Browser types; SSR-safe evaluation |
| `@qkplm/bom-editor/worker` | Versioned, bounded worker-pool protocol and main-thread fallback | Browser Worker or host-provided worker runtime |

Use the root entry for an editor instance and explicit subpaths for subsystem
APIs:

```ts
import { createBomEditor } from '@qkplm/bom-editor';
import type { BomDocumentSnapshot } from '@qkplm/bom-editor/contracts';
import { hashBomDocumentContent } from '@qkplm/bom-editor/model';
import { matchBomMaterials } from '@qkplm/bom-editor/model';
import { createMemoryDataSource } from '@qkplm/bom-editor/datasource';
```

The root intentionally exports the composition package plus contract types. It
does not flatten every subsystem into one namespace, so headless code can state
its runtime boundary explicitly and new subsystem symbols cannot silently
collide with the main editor API.

## Plugin Repair Approval

Business rules are supplied by plugins. A fixer returns a draft only; the
editor signs the displayable proposal with its current document generation,
revision, impact scope, and preview Diff. Approval is an explicit call on the
same editor instance:

```ts
const report = await editor.validate();
const issue = report.ok
  ? report.value.issues.find((candidate) => candidate.ruleId === 'quality/name-present')
  : undefined;

if (issue !== undefined) {
  const proposed = await editor.proposeFix('quality', issue);
  if (proposed.ok && proposed.value !== null) {
    await editor.applyFix(proposed.value);
  }
}
```

An issued proposal cannot be reconstructed from JSON, applied after its
revision changes, or replayed after approval. Overlapping repairs reject by
default; a host may explicitly choose `{ conflictResolution: 'supersede' }`.
The accepted repair is one normal undoable transaction and is followed by a
fresh document validation pass.

## Compatibility boundary

Applications, demos, and framework adapters must import the Core root or a
declared Core subpath. Names such as `@bom-editor/model` and
`@bom-editor/renderer-canvas` identify current physical packages used to build
the facade; direct application imports from them are outside the stable API
commitment. Moving code between physical packages must not change the logical
Core exports.

The published Core package is a self-contained ESM distribution: its JavaScript
and declarations do not require consumers to resolve internal `@bom-editor/*`
workspace packages. The package has `sideEffects: false`, and browser resources
are created only by explicit editor mount or renderer mount calls. Importing any
declared entry does not read `window`, `document`, Canvas, or Worker globals
during module evaluation.

## Runtime Locale

The component UI includes `zh-CN` by default and `en-US` without network
loading. Let the host own the language control and update an existing component:

```ts
component.configurePresentation({ locale: 'en-US' });
```

Menus, editor prompts, diff descriptions and ARIA/live-region text switch with
the locale. BOM values and host column labels remain unchanged. Label overrides
may use a fixed string or `LocalizedText`; an omitted English value falls back
to `zh-CN`.

## Verification

Run the package gate with:

```sh
pnpm --filter @qkplm/bom-editor test
```

The gate checks exact TypeScript symbol parity for every facade, representative
type and callable equivalence, the complete package `exports` map, dependency
declarations, build output, runtime export parity, and Node/SSR imports with
browser globals guarded. The Core build first builds the editor composition and
its dependency graph, so facade declarations never resolve against stale or
uncompiled source.
