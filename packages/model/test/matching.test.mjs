import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOM_MATCH_ALGORITHM_VERSION,
  matchBomMaterials,
} from '../dist/index.js';

function createSnapshot(nodes) {
  return {
    revision: 'matching-revision-1',
    nodes,
  };
}

function material(occurrenceId, {
  materialCode,
  materialId,
  fields = {},
} = {}) {
  return {
    occurrenceId,
    kind: 'material',
    ...(materialCode === undefined ? {} : { materialCode }),
    ...(materialId === undefined ? {} : { materialId }),
    fields,
  };
}

test('material matching covers exact codes, prefixes, aliases, and field tokens', () => {
  const exact = matchBomMaterials(createSnapshot([
    material('exact', { materialCode: 'RES-100' }),
  ]), { query: 'res-100' });
  assert.equal(exact.algorithmVersion, BOM_MATCH_ALGORITHM_VERSION);
  assert.equal(exact.indexRevision, 'matching-revision-1');
  assert.equal(exact.matches[0].occurrenceId, 'exact');
  assert.deepEqual(exact.matches[0].sources, ['materialCode']);
  assert.equal(exact.matches[0].componentScores.exact, 1);
  assert.ok(exact.matches[0].reasons.includes('materialCode:exact'));

  const prefix = matchBomMaterials(createSnapshot([
    material('prefix', { materialCode: 'RES-1000' }),
  ]), { query: 'res-10' });
  assert.equal(prefix.matches[0].occurrenceId, 'prefix');
  assert.ok(prefix.matches[0].componentScores.prefix > 0);
  assert.ok(prefix.matches[0].reasons.includes('materialCode:prefix'));

  const alias = matchBomMaterials(createSnapshot([
    material('alias', { materialCode: 'UNRELATED' }),
  ]), {
    query: 'r100',
    aliasesByOccurrenceId: { alias: ['R100'] },
  });
  assert.equal(alias.matches[0].occurrenceId, 'alias');
  assert.deepEqual(alias.matches[0].sources, ['alias']);
  assert.equal(alias.matches[0].componentScores.exact, 1);
  assert.ok(alias.matches[0].reasons.includes('alias:exact'));

  const token = matchBomMaterials(createSnapshot([
    material('field', {
      materialCode: 'UNRELATED',
      fields: { name: 'Precision resistor 100 ohm' },
    }),
  ]), { query: 'resistor 100' });
  assert.equal(token.matches[0].occurrenceId, 'field');
  assert.deepEqual(token.matches[0].sources, ['field']);
  assert.equal(token.matches[0].componentScores.token, 1);
  assert.ok(token.matches[0].reasons.includes('field:name:token'));
});

test('material matching accepts deterministic pinyin injection', () => {
  const result = matchBomMaterials(createSnapshot([
    material('resistor', {
      materialCode: 'UNRELATED',
      fields: { name: '\u7535\u963b' },
    }),
  ]), {
    query: 'dianzu',
    pinyin: (value) => value === '\u7535\u963b' ? 'dianzu' : value,
  });

  assert.equal(result.matches[0].occurrenceId, 'resistor');
  assert.deepEqual(result.matches[0].sources, ['field']);
  assert.equal(result.matches[0].componentScores.pinyin, 1);
  assert.ok(result.matches[0].reasons.includes('field:name:pinyin'));
});

test('material matching exposes edit-distance signals for near material codes', () => {
  const result = matchBomMaterials(createSnapshot([
    material('near', { materialCode: 'CAP-100F' }),
  ]), { query: 'CAP-100N' });

  assert.equal(result.matches[0].occurrenceId, 'near');
  assert.equal(result.matches[0].componentScores.exact, 0);
  assert.equal(result.matches[0].componentScores.prefix, 0);
  assert.ok(result.matches[0].componentScores.editDistance > 0);
  assert.ok(result.matches[0].reasons.includes('materialCode:edit-distance'));
});

test('material matching honors pinyin and edit-distance weight opt-outs', () => {
  const withoutPinyin = matchBomMaterials(createSnapshot([
    material('resistor', {
      fields: { name: '电阻' },
    }),
  ]), {
    query: 'dianzu',
    pinyin: (value) => value === '电阻' ? 'dianzu' : value,
    weights: { pinyin: 0, editDistance: 0 },
  });
  assert.equal(withoutPinyin.totalCandidates, 0);

  const withoutEditDistance = matchBomMaterials(createSnapshot([
    material('near', { materialCode: 'ABCDEF' }),
  ]), {
    query: 'ABXDEF',
    weights: { editDistance: 0 },
  });
  assert.equal(withoutEditDistance.totalCandidates, 0);
});

test('specification weights can promote explicitly weighted specification fields', () => {
  const result = matchBomMaterials(createSnapshot([
    material('generic', {
      materialCode: 'GENERIC',
      fields: { name: '0603 capacitor x7r' },
    }),
    material('specification', {
      materialCode: 'SPEC',
      fields: { specification: '0603 capacitor' },
    }),
  ]), {
    query: '0603 capacitor',
    fieldWeights: { specification: 0.5 },
    specificationPaths: [['specification']],
    weights: {
      materialCode: 0,
      materialId: 0,
      alias: 0,
      field: 1,
      pinyin: 0,
      editDistance: 0,
      specification: 2,
    },
  });

  assert.equal(result.matches[0].occurrenceId, 'specification');
  assert.ok(result.matches[0].componentScores.specification > 0);
  assert.ok(result.matches[0].reasons.includes('field:specification:specification'));
});

test('material matching sorts equal candidates deterministically by occurrence ID', () => {
  const result = matchBomMaterials(createSnapshot([
    material('occ-b', { materialCode: 'TIE' }),
    material('occ-a', { materialCode: 'TIE' }),
  ]), { query: 'tie' });

  assert.equal(result.totalCandidates, 2);
  assert.deepEqual(result.matches.map((match) => match.occurrenceId), ['occ-a', 'occ-b']);
});

test('material matching applies confidence and score-delta selection thresholds', () => {
  const single = matchBomMaterials(createSnapshot([
    material('single', { materialCode: 'SELECT-ME' }),
  ]), {
    query: 'select-me',
    selection: { minConfidence: 0.5, minScoreDelta: 0.1 },
  });
  assert.equal(single.selectionStatus, 'selected');
  assert.equal(single.selectedOccurrenceId, 'single');

  const tied = matchBomMaterials(createSnapshot([
    material('first', { materialCode: 'SELECT-ME' }),
    material('second', { materialCode: 'SELECT-ME' }),
  ]), {
    query: 'select-me',
    selection: { minConfidence: 0.5, minScoreDelta: 0.01 },
  });
  assert.equal(tied.selectionStatus, 'ambiguous');
  assert.equal(tied.selectedOccurrenceId, undefined);

  const lowConfidence = matchBomMaterials(createSnapshot([
    material('near', { materialCode: 'CAP-100F' }),
  ]), {
    query: 'CAP-100N',
    selection: { minConfidence: 0.99, minScoreDelta: 0 },
  });
  assert.ok(lowConfidence.matches[0].confidence < 0.99);
  assert.equal(lowConfidence.selectionStatus, 'ambiguous');
});

test('material matching ignores empty values and bounds long or unmatched input', () => {
  const emptyValues = matchBomMaterials(createSnapshot([
    material('empty', {
      materialCode: '',
      materialId: '',
      fields: { name: null, blank: '   ' },
    }),
  ]), { query: 'populated' });
  assert.equal(emptyValues.totalCandidates, 0);
  assert.deepEqual(emptyValues.matches, []);
  assert.equal(emptyValues.selectionStatus, 'none');

  const emptyQuery = matchBomMaterials(createSnapshot([
    material('value', { materialCode: 'VALUE' }),
  ]), { query: '   ' });
  assert.equal(emptyQuery.totalCandidates, 0);
  assert.deepEqual(emptyQuery.matches, []);

  const unmatched = matchBomMaterials(createSnapshot([
    material('value', { materialCode: 'AAAAAAAAAAAA' }),
  ]), { query: 'zzzzzzzzzzzz' });
  assert.equal(unmatched.totalCandidates, 0);
  assert.deepEqual(unmatched.matches, []);

  const longResult = matchBomMaterials(createSnapshot([
    material('long', { materialCode: 'y'.repeat(300) }),
  ]), { query: 'x'.repeat(300) });
  assert.equal(longResult.totalCandidates, 0);
  assert.deepEqual(longResult.matches, []);
});
