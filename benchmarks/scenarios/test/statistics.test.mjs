import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nearestRank,
  summarizeSamples,
  thresholdVerdict,
} from '../scripts/lib/statistics.mjs';

test('statistics use nearest-rank percentiles and population deviation', () => {
  const samples = Array.from({ length: 30 }, (_, index) => index + 1);
  const report = summarizeSamples(samples, { p99MinimumSamples: 200 });

  assert.equal(report.count, 30);
  assert.equal(report.p50Ms, 15);
  assert.equal(report.p95Ms, 29);
  assert.equal(report.p99Ms, null);
  assert.equal(report.p99Status, 'N/A: insufficient samples');
  assert.equal(report.p99ObservedSamples, 30);
  assert.equal(report.p99RequiredSamples, 200);
  assert.equal(report.maxMs, 30);
  assert.equal(report.meanMs, 15.5);
  assert.equal(report.standardDeviationMs, 8.655);
});

test('P99 is exposed only after its normative sample floor', () => {
  const samples = Array.from({ length: 1_000 }, (_, index) => index + 1);
  const report = summarizeSamples(samples, { p99MinimumSamples: 1_000 });

  assert.equal(report.p99Ms, 990);
  assert.equal(report.p99Status, 'available');
});

test('statistics reject invalid samples and thresholds', () => {
  assert.equal(nearestRank([3, 1, 2], 0.5), 2);
  assert.throws(() => summarizeSamples([]), /non-empty/u);
  assert.throws(() => summarizeSamples([1, Number.NaN]), /finite/u);
  assert.deepEqual(thresholdVerdict(30, 30), {
    value: 30,
    maximum: 30,
    passed: true,
  });
});
