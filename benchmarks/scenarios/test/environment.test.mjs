import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertFormalEnvironmentApproved,
  loadEnvironmentApproval,
} from '../scripts/lib/environment.mjs';

const observed = Object.freeze({
  operatingSystem: { platform: 'win32' },
  cpu: { logicalCoreCount: 8 },
  memory: { totalBytes: 16_000 },
  node: { version: 'v22.0.0' },
  playwright: { version: '1.61.1' },
  chrome: { product: 'Chrome/1' },
  gpu: { devices: [{ deviceString: 'GPU' }] },
  page: { devicePixelRatio: 2 },
});

test('environment approval rejects pending, contradictory, and empty locks', async () => {
  const pendingRoot = await createRoot({
    schemaVersion: 'bom-f3-environment-approval/v1',
    approved: false,
    approval: { status: 'pending', approvedBy: null, approvedAt: null },
    expected: {},
  });
  const pending = await loadEnvironmentApproval(pendingRoot, observed);
  assert.equal(pending.approved, false);
  assert.ok(pending.reasons.some((reason) => reason.includes('operatingSystem')));

  const contradictoryRoot = await createRoot({
    schemaVersion: 'bom-f3-environment-approval/v1',
    approved: true,
    approval: { status: 'pending', approvedBy: 'reviewer', approvedAt: new Date().toISOString() },
    expected: observed,
  });
  const contradictory = await loadEnvironmentApproval(contradictoryRoot, observed);
  assert.equal(contradictory.approved, false);
  assert.ok(contradictory.reasons.some((reason) => reason.includes('approved=true')));
});

test('environment approval requires and compares all eight locked categories', async () => {
  const root = await createRoot({
    schemaVersion: 'bom-f3-environment-approval/v1',
    approved: true,
    approval: {
      status: 'approved',
      approvedBy: 'benchmark-owner',
      approvedAt: '2026-07-19T00:00:00.000Z',
    },
    expected: observed,
  });
  const result = await loadEnvironmentApproval(root, observed);
  assert.equal(result.approved, true);
  assert.deepEqual(result.reasons, []);
});

test('formal environment preflight fails closed with every lock mismatch', async () => {
  let error;
  try {
    assertFormalEnvironmentApproved({
      approved: false,
      reasons: ['environment.chrome.product differs', 'environment.gpu differs'],
    });
  } catch (cause) {
    error = cause;
  }
  assert.ok(error instanceof Error);
  assert.match(error.message, /BOM_F3_FORMAL_ENVIRONMENT_NOT_APPROVED/u);
  assert.equal(error.code, 'BOM_F3_FORMAL_ENVIRONMENT_NOT_APPROVED');
  assert.deepEqual(error.reasons, [
    'environment.chrome.product differs',
    'environment.gpu differs',
  ]);

  assert.doesNotThrow(() =>
    assertFormalEnvironmentApproved({ approved: true, reasons: [] }),
  );
});

async function createRoot(value) {
  const root = join(tmpdir(), `bom-f3-environment-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(join(root, 'benchmark'), { recursive: true });
  await writeFile(
    join(root, 'benchmark', 'environment.json'),
    JSON.stringify(value),
    'utf8',
  );
  return root;
}
