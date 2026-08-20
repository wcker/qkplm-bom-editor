import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { diffBomDocumentSnapshots } from '../../../packages/model/dist/index.js';

const fixtureDirectory = new URL('../fixtures/', import.meta.url);

test('versioned stable-key Diff fixture matches its complete golden output', async () => {
  const fixture = await readJson(new URL('stable-key-diff.v1.json', fixtureDirectory));
  assert.equal(fixture.fixtureVersion, 'bom-stable-key-diff/v1');
  assert.ok(fixture.source !== undefined);
  assert.ok(fixture.target !== undefined);
  assert.ok(fixture.schema !== undefined);
  assert.ok(fixture.expected !== undefined);

  const actual = diffBomDocumentSnapshots(
    fixture.source,
    fixture.target,
    fixture.schema,
  );
  assert.equal(actual.ok, true, formatErrors(actual));
  assert.deepEqual(actual.value, fixture.expected);

  const reordered = diffBomDocumentSnapshots(
    { ...fixture.source, nodes: [...fixture.source.nodes].reverse() },
    { ...fixture.target, nodes: [...fixture.target.nodes].reverse() },
    fixture.schema,
  );
  assert.equal(reordered.ok, true, formatErrors(reordered));
  assert.deepEqual(reordered.value, fixture.expected);
});

test('fixture manifest is complete and every payload SHA-256 is reproducible', async () => {
  const manifest = await readJson(new URL('manifest.json', fixtureDirectory));
  assert.equal(manifest.manifestVersion, 'bom-property-fixtures/v1');
  assert.equal(manifest.hashAlgorithm, 'SHA-256');
  assert.ok(Array.isArray(manifest.files));

  const declaredPaths = manifest.files.map((entry) => entry.path);
  assert.equal(new Set(declaredPaths).size, declaredPaths.length, 'manifest has duplicate paths');
  const onDisk = (await readdir(fileURLToPath(fixtureDirectory)))
    .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
    .sort();
  assert.deepEqual([...declaredPaths].sort(), onDisk, 'manifest coverage differs from fixture directory');

  for (const entry of manifest.files) {
    assert.match(entry.path, /^[a-z0-9][a-z0-9.-]*\.json$/);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    const bytes = await readFile(new URL(entry.path, fixtureDirectory));
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, entry.sha256, `fixture hash mismatch path=${entry.path}`);
  }
});

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function formatErrors(result) {
  return result.ok ? '' : result.errors.map((error) => error.code).join(', ');
}
