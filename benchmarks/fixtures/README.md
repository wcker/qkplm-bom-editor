# `@bom-editor/benchmark-fixtures`

Deterministic fixture definitions for the BOM editor performance and correctness suites.

The module exports definitions only. A 10K or 100K snapshot is allocated only when
`generateFixture()` is called explicitly, so ordinary imports and CI discovery stay
small and predictable.

Standard definitions:

- `BOM-10K-D6`: 10,000 nodes with a guaranteed six-level path.
- `BOM-100K-D6`: 100,000 nodes with a guaranteed six-level path.
- `BOM-100K-FLAT`: 100,000 root-level nodes.

Each definition fixes its generator version, seed, field count, duplicate-material
ratio, hierarchy mode, and intended validation-error ratio. Release benchmark
reports must record the definition fingerprint and the generated Snapshot digest;
the latter is produced by `@bom-editor/model`, not by this package.

Tests use scaled definitions and never instantiate the standard 100K fixtures.

The package also exports the versioned F3-10K-EDIT scenario. It fixes the
reference viewport, DPR, font hash, columns, full expansion state, edit target,
measurement sample counts, and performance thresholds so Demo and benchmark
runners execute the same workload.
