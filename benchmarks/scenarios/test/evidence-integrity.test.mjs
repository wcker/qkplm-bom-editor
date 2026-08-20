import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVIDENCE_INTEGRITY_PROTOCOL,
  assessEvidenceIntegrity,
  createEvidenceIntegrityUnavailable,
} from '../scripts/lib/evidence-integrity.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

test('input manifests remain verified only when both aggregate hashes are unchanged', () => {
  const result = assessEvidenceIntegrity({
    buildBefore: manifest(HASH_A),
    buildAfter: manifest(HASH_A),
    evidenceToolingBefore: manifest(HASH_B),
    evidenceToolingAfter: manifest(HASH_B),
    checkedAt: '2026-07-21T00:00:00.000Z',
  });

  assert.equal(result.protocol, EVIDENCE_INTEGRITY_PROTOCOL);
  assert.equal(result.status, 'verified');
  assert.equal(result.verified, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.build.stable, true);
  assert.equal(result.evidenceTooling.stable, true);
});

test('either changed input manifest fails closed with a specific mutation blocker', () => {
  const result = assessEvidenceIntegrity({
    buildBefore: manifest(HASH_A),
    buildAfter: manifest(HASH_C),
    evidenceToolingBefore: manifest(HASH_B),
    evidenceToolingAfter: manifest(HASH_C),
    checkedAt: '2026-07-21T00:00:00.000Z',
  });

  assert.equal(result.status, 'mutated');
  assert.equal(result.verified, false);
  assert.equal(result.build.stable, false);
  assert.equal(result.evidenceTooling.stable, false);
  assert.deepEqual(result.blockers, [
    'BOM_F3_BUILD_MUTATED_DURING_RUN',
    'BOM_F3_EVIDENCE_TOOLING_MUTATED_DURING_RUN',
  ]);
});

test('an unavailable recheck cannot produce a qualified input-integrity result', () => {
  const result = createEvidenceIntegrityUnavailable({
    buildBefore: manifest(HASH_A),
    evidenceToolingBefore: manifest(HASH_B),
    code: 'BOM_F3_EVIDENCE_INTEGRITY_RECHECK_FAILED',
    error: { name: 'Error', message: 'read failed' },
    checkedAt: '2026-07-21T00:00:00.000Z',
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.verified, false);
  assert.equal(result.build.stable, null);
  assert.equal(result.evidenceTooling.stable, null);
  assert.deepEqual(result.blockers, [
    'BOM_F3_EVIDENCE_INTEGRITY_RECHECK_FAILED',
  ]);
});

function manifest(aggregateSha256) {
  return Object.freeze({ aggregateSha256 });
}
