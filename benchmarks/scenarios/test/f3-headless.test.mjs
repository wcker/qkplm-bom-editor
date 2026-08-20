import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';

import {
  BOM_10K_D6,
  F3_10K_EDIT_SCENARIO,
  generateFixture,
} from '@bom-editor/benchmark-fixtures';
import { createBomEditor } from '@qkplm/bom-editor';

const PRECHECK_CREATE_P95_MS = 1_000;
const PRECHECK_FIELD_COMMIT_P95_MS = 100;

test('F3 10K headless precheck prevents second-scale startup and field commits', async () => {
  const fixture = generateFixture(BOM_10K_D6);
  const fieldById = new Map(
    fixture.schema.fields.map((field) => [field.fieldId, field]),
  );
  const columns = Object.freeze(
    F3_10K_EDIT_SCENARIO.columns.flatMap((column) => {
      if (column.source.kind !== 'field') {
        return [];
      }
      const field = fieldById.get(column.source.fieldId);
      assert.notEqual(field, undefined);
      return [
        Object.freeze({
          columnId: column.columnId,
          fieldPath: field.path,
          label: column.label,
          width: column.width,
          editable: column.editable,
          frozen: column.frozen ? 'start' : false,
        }),
      ];
    }),
  );
  const target =
    fixture.snapshot.nodes[
      F3_10K_EDIT_SCENARIO.interaction.targetOccurrenceOrdinal
    ];
  assert.notEqual(target, undefined);

  const createSamples = [];
  const fieldCommitSamples = [];
  const warmups = F3_10K_EDIT_SCENARIO.measurement.warmupRuns;
  const samples = F3_10K_EDIT_SCENARIO.measurement.sampleRuns;

  for (let run = 0; run < warmups + samples; run += 1) {
    const createStarted = performance.now();
    const editor = createBomEditor({
      schema: fixture.schema,
      columns,
      initialDocument: fixture.snapshot,
      rowHeight: F3_10K_EDIT_SCENARIO.layout.rowHeight,
      expandAll: true,
    });
    const created = performance.now();
    const result = await editor.execute({
      type: 'setField',
      occurrenceId: target.occurrenceId,
      fieldPath: ['name'],
      value:
        F3_10K_EDIT_SCENARIO.interaction.replacementText +
        ' ' +
        String(run),
    });
    const committed = performance.now();
    assert.equal(result.ok, true);
    if (run >= warmups) {
      createSamples.push(created - createStarted);
      fieldCommitSamples.push(committed - created);
    }
    editor.destroy();
  }

  const report = Object.freeze({
    kind: 'headless-node-precheck',
    runtime: process.version,
    fixtureId: BOM_10K_D6.id,
    scenarioId: F3_10K_EDIT_SCENARIO.id,
    create: statistics(createSamples),
    fieldCommit: statistics(fieldCommitSamples),
  });
  process.stdout.write(JSON.stringify(report) + '\n');

  assert.ok(
    report.create.p95 <= PRECHECK_CREATE_P95_MS,
    'Headless create P95 regressed to a second-scale path.',
  );
  assert.ok(
    report.fieldCommit.p95 <= PRECHECK_FIELD_COMMIT_P95_MS,
    'Field commit P95 regressed to a full-document path.',
  );
});

function statistics(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (value) =>
    sorted[Math.ceil(value * sorted.length) - 1];
  return Object.freeze({
    samples: sorted.length,
    p50: round(percentile(0.5)),
    p95: round(percentile(0.95)),
    max: round(sorted.at(-1)),
    mean: round(
      sorted.reduce((sum, sample) => sum + sample, 0) / sorted.length,
    ),
  });
}

function round(value) {
  return Number(value.toFixed(2));
}
