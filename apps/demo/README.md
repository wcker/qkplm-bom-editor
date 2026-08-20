# F3 Vanilla Demo

This browser workbench mounts the public `@qkplm/bom-editor` editor with the
deterministic `BOM-10K-D6` fixture and `F3-10K-EDIT` scenario definition.

```powershell
pnpm --filter @bom-editor/demo dev
```

The status strip reports only the current document and individual wall-clock
action timings. It is not a benchmark percentile report.

The server exposes separate product and evidence surfaces:

- `/` is the ordinary interactive workbench for mouse, keyboard, scroll, edit,
  Undo/Redo, and responsive-layout checks.
- `/examples.html` is the independent example center. It contains five
  public-API examples. Each example has overview, editable JSON input, generated
  protocol output, and TypeScript usage tabs.
- `/help.html` is the independent Chinese user guide with searchable topics for
  editing, selection, fill handle, row/column operations, find, formatting,
  clipboard, shortcuts, Props/Outputs, performance boundaries, and diagnosis.
- `/acceptance.html` is an independent lifecycle and measurement surface driven
  through `window.__BOM_F3_ACCEPTANCE__`. It does not install the workbench's
  toolbar or `beforeunload` closures, so destroy measurements are not retained by
  unrelated Demo handlers.

Both pages are served with COOP `same-origin`, COEP `require-corp`, and CORP
`same-origin`. This makes the acceptance page cross-origin isolated so supported
Chromium builds can use `performance.measureUserAgentSpecificMemory()`. Editor
ready is observed only after the first Canvas and semantic DOM synchronization,
not merely after renderer construction.

The regular build and static tests do not rebuild shared workspace packages:

```powershell
pnpm --filter @bom-editor/demo test
```

For a browser smoke check, start the Demo, open it in a Chrome instance with a
remote-debugging port, and run:

```powershell
pnpm --filter @bom-editor/demo test:cdp
```

The CDP smoke checks nonblank pixels in all three Canvas layers, visible column
and row headers, native scrollability, the active treegrid descendant, the
single edit Portal, scenario revision publication, button sizing, and 390 CSS px
reflow. It is an interaction/correctness check, not the locked performance
runner.

The repository-level browser evidence commands build production output and
start their own server and system Chrome:

```powershell
pnpm test:e2e:f3
pnpm benchmark:f3:browser
```

The first command is a 1-warmup/3-sample smoke. The second uses the normative
5-warmup/30-sample shape, but remains formally unqualified and exits nonzero
until the locked environment and all other release evidence are approved. The
runner writes to `benchmarks/reports/f3/<run-id>/`; opening the acceptance page
manually is not equivalent to producing that evidence package.
