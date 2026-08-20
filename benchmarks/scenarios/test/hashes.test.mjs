import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  canonicalJson,
  createArtifactManifest,
  hashCanonicalJson,
  sha256,
} from '../scripts/lib/hashes.mjs';

test('canonical JSON and its hash are independent of object key order', () => {
  const left = { z: [3, { b: true, a: null }], a: 'value' };
  const right = { a: 'value', z: [3, { a: null, b: true }] };

  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(hashCanonicalJson(left), hashCanonicalJson(right));
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('artifact manifests use normalized paths and deterministic ordering', async () => {
  const root = join(tmpdir(), `bom-f3-hash-${process.pid}-${Date.now()}`);
  await mkdir(join(root, 'dist', 'nested'), { recursive: true });
  await Promise.all([
    writeFile(join(root, 'dist', 'z.js'), 'z', 'utf8'),
    writeFile(join(root, 'dist', 'nested', 'a.js'), 'a', 'utf8'),
  ]);

  const first = await createArtifactManifest(root, ['dist']);
  const second = await createArtifactManifest(root, ['dist']);
  assert.deepEqual(first, second);
  assert.deepEqual(first.files.map((entry) => entry.path), [
    'dist/nested/a.js',
    'dist/z.js',
  ]);
  assert.match(first.aggregateSha256, /^[a-f0-9]{64}$/u);
});

test('canonical JSON rejects values that JSON would silently discard', () => {
  assert.throws(() => canonicalJson({ value: undefined }), /undefined/u);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /cycles/u);
});
