# BOM Property Gate

This directory is a deterministic gate and a member of the repository's pnpm
workspace. The root scripts expose it without mixing its fixtures or oracle
implementation into production packages.

## Run

From the repository root:

```powershell
pnpm run test:property
```

The equivalent directory-level entry is:

```powershell
pnpm --dir tests/property test
```

The `test` script first builds the exact production dependency closure for
`@bom-editor/transaction` and `@bom-editor/visible-projection` (contracts,
model, transaction, and visible-projection), then runs both gate files.
`test:gate` only runs the tests and assumes those build outputs already exist.

The default property matrix uses these fixed uint32 seeds:

- `0x13579bdf`
- `0x5eedc0de`
- `0xc001d00d`

Each seed executes 192 state transitions, for 576 transitions per default run.
Every test name and run banner prints the active seed. Replay one seed in
PowerShell with:

```powershell
$env:BOM_PROPERTY_SEED = '0x5eedc0de'
pnpm --dir tests/property test
Remove-Item Env:BOM_PROPERTY_SEED
```

## Oracle Boundary

The reference model does not call production snapshot normalization, position
comparison, index construction, or visible traversal to compute expected
state. It independently applies field updates/removals, inserts, subtree
moves/deletes, material-reference changes, reorders, Undo, and Redo. Its own
ASCII position ordering produces row, child, material-code, depth, and visible
preorder expectations.

Every transition compares that expected state with all of the following:

- the transaction snapshot and transaction-owned incremental indexes;
- a fresh `@bom-editor/model` index rebuild;
- `@bom-editor/visible-projection` preorder, row lookup, depth, and offsets.

The Diff gate reads a versioned fixture containing source, target, schema, and
the complete expected result. A separate manifest proves fixture coverage and
recomputes every payload SHA-256 before accepting it.

## Non-Goals

This is a deterministic model-equivalence and golden-contract gate. It is not
a claim of 95% line, branch, mutation, or state-space coverage. It also does
not replace randomized long-running fuzzing, browser interaction tests,
performance qualification, accessibility review, or soak testing.
