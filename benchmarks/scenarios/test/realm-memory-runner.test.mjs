import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AcceptanceTargetLostError,
  analyzeDisposableRealmAttribution,
  BOM_F3_ACCEPTANCE_TARGET_LOST,
  BOM_F3_REALM_MEMORY_PROTOCOL_TIMEOUT,
  BOM_F3_REALM_MEMORY_UNAVAILABLE,
  runDisposableRealmMemoryProtocol,
} from '../scripts/lib/realm-memory-runner.mjs';
import {
  FORMAL_MEMORY_SAMPLE_TIMING,
  REQUIRED_DISPOSABLE_REALM_RESOURCES,
} from '../scripts/lib/realm-memory.mjs';

const MIB = 1024 * 1024;
const VIEWPORT = Object.freeze({
  width: 1920,
  height: 1080,
  devicePixelRatio: 2,
});
const rawEvidenceSchema = JSON.parse(await readFile(
  new URL(
    '../schema/disposable-realm-memory-evidence-v1.schema.json',
    import.meta.url,
  ),
  'utf8',
));
const browserEvidenceSchemaV3 = JSON.parse(await readFile(
  new URL('../schema/f3-evidence-v3.schema.json', import.meta.url),
  'utf8',
));

test('v3 schemas lock raw Realm evidence while keeping release fail closed', () => {
  assert.equal(
    rawEvidenceSchema.properties.schemaVersion.const,
    'bom-disposable-realm-memory-evidence/v1',
  );
  assert.equal(
    rawEvidenceSchema.allOf[0].then.properties.timing.$ref,
    '#/$defs/formalTiming',
  );
  assert.deepEqual(
    rawEvidenceSchema.$defs.resourceAssertion.properties.resource.enum,
    REQUIRED_DISPOSABLE_REALM_RESOURCES,
  );
  assert.equal(
    browserEvidenceSchemaV3.properties.schemaVersion.const,
    'bom-f3-browser-evidence/v3',
  );
  assert.deepEqual(
    browserEvidenceSchemaV3.properties.overall.enum,
    ['unqualified', 'failed'],
  );
  assert.equal(
    browserEvidenceSchemaV3.properties.qualification.properties.releaseQualified
      .const,
    false,
  );
  assert.equal(
    browserEvidenceSchemaV3.properties.qualification.properties
      .destroyRetentionQualified.type,
    'boolean',
  );
  assert.equal(
    browserEvidenceSchemaV3.properties.qualification.properties
      .applicationPixelEvidenceQualified.type,
    'boolean',
  );
});

test('formal runner captures exact timing and qualifying 0/1/3/5 Realm evidence', async () => {
  const harness = createHarness();
  const result = await runDisposableRealmMemoryProtocol({
    page: {},
    pageSession: {},
    description: {},
    mode: 'formal',
    runId: 'formal-test',
    viewport: VIEWPORT,
    canvasLayerCount: 3,
    dependencies: harness.dependencies,
  });

  assert.equal(result.qualification.status, 'qualified');
  assert.equal(result.diagnosticChecksPassed, true);
  assert.equal(result.idleSamples.length, 10);
  assert.deepEqual(result.timing, FORMAL_MEMORY_SAMPLE_TIMING);
  assert.deepEqual(result.scenarios.map((entry) => entry.instanceCount), [1, 3, 5]);
  assert.equal(
    result.scenarios.every(
      (entry) =>
        entry.control.instanceCount === 0 &&
        entry.control.rawDeltaBytes === 0 &&
        entry.measurement.rawDeltaBytes === 0 &&
        entry.measurement.raw.destroy.resourceAssertions.length === 11,
    ),
    true,
  );
  assert.equal(harness.delays.filter((value) => value === 30_000).length, 31);
  assert.equal(harness.gcCycles.every((value) => value === 2), true);
  assert.equal(harness.calls.filter((entry) => entry.capability === 'discardDisposableRealm').length, 0);
});

test('blocked release is discarded but its memory drop is excluded from retention evidence', async () => {
  const harness = createHarness({ leakResource: 'dom-listener' });
  const result = await runDisposableRealmMemoryProtocol({
    page: {},
    pageSession: {},
    description: {},
    mode: 'smoke',
    runId: 'blocked-test',
    viewport: VIEWPORT,
    canvasLayerCount: 3,
    dependencies: harness.dependencies,
  });
  const measurement = result.scenarios[0].measurement;

  assert.equal(result.qualification.status, 'failed');
  assert.equal(result.diagnosticChecksPassed, false);
  assert.equal(measurement.rawDeltaBytes, null);
  assert.equal(measurement.diagnosticRawDeltaBytes, 0);
  assert.equal(measurement.raw.releaseQualified, false);
  assert.equal(measurement.release.released, undefined);
  assert.equal(measurement.raw.discardOperation.qualified, false);
  assert.equal(
    harness.calls.some((entry) => entry.capability === 'discardDisposableRealm'),
    true,
  );
});

test('target loss stops formal memory evidence at the failing sample', async () => {
  const harness = createHarness();
  let measurementCount = 0;
  const originalMeasure = harness.dependencies.measureUaMemory;
  harness.dependencies.measureUaMemory = async (...arguments_) => {
    measurementCount += 1;
    if (measurementCount === 4) {
      throw new Error('page.evaluate: Execution context was destroyed');
    }
    return originalMeasure(...arguments_);
  };

  await assert.rejects(
    runDisposableRealmMemoryProtocol({
      page: {},
      pageSession: {},
      description: {},
      mode: 'formal',
      runId: 'target-lost-test',
      viewport: VIEWPORT,
      canvasLayerCount: 3,
      dependencies: harness.dependencies,
    }),
    (error) => {
      assert.ok(error instanceof AcceptanceTargetLostError);
      assert.equal(error.code, BOM_F3_ACCEPTANCE_TARGET_LOST);
      assert.equal(error.phase, 'idle-noise-3');
      return true;
    },
  );
  assert.equal(measurementCount, 4);
  assert.equal(harness.calls.length, 0);
});

test('a stalled Realm operation fails closed with phase and progress diagnostics', async () => {
  const harness = createHarness();
  harness.dependencies.delay = () => new Promise(() => {});

  await assert.rejects(
    runDisposableRealmMemoryProtocol({
      page: {},
      pageSession: {},
      description: {},
      mode: 'smoke',
      runId: 'timeout-test',
      viewport: VIEWPORT,
      canvasLayerCount: 3,
      dependencies: {
        ...harness.dependencies,
        protocolTimeoutMs: 100,
        operationTimeoutMs: 10,
      },
    }),
    (error) => {
      assert.equal(error.code, BOM_F3_REALM_MEMORY_PROTOCOL_TIMEOUT);
      assert.equal(error.phase, 'idle-noise-0:quiet-before-gc');
      assert.equal(error.stage, error.phase);
      assert.equal(error.diagnostics.currentPhase, 'idle-noise-0');
      assert.equal(error.diagnostics.completedIdleSamples, 0);
      assert.equal(error.diagnostics.completedScenarios, 0);
      return true;
    },
  );
});

test('formal Realm evidence stops at the first unsupported UA-memory sample', async () => {
  const harness = createHarness();
  harness.dependencies.measureUaMemory = async () => ({
    supported: false,
    reason: 'UA memory measurement timed out',
    bytes: null,
    breakdown: null,
    timestampMs: 42,
  });

  await assert.rejects(
    runDisposableRealmMemoryProtocol({
      page: {},
      pageSession: {},
      description: {},
      mode: 'formal',
      runId: 'unavailable-test',
      viewport: VIEWPORT,
      canvasLayerCount: 3,
      dependencies: {
        ...harness.dependencies,
        protocolTimeoutMs: 1_000,
        operationTimeoutMs: 100,
      },
    }),
    (error) => {
      assert.equal(error.code, BOM_F3_REALM_MEMORY_UNAVAILABLE);
      assert.equal(error.phase, 'idle-noise-0');
      assert.equal(error.diagnostics.reason, 'UA memory measurement timed out');
      assert.deepEqual(error.diagnostics.sampleTiming, FORMAL_MEMORY_SAMPLE_TIMING);
      return true;
    },
  );
  assert.equal(harness.delays.length, 2);
});

test('child attribution requires one exact Realm URL and rejects prefix collisions', () => {
  const measurement = {
    supported: true,
    breakdown: [
      {
        attribution: [
          { url: 'http://127.0.0.1/acceptance.html?bom-disposable-realm=1&bom-disposable-realm-id=realm-1' },
          { url: 'http://127.0.0.1/acceptance.html?bom-disposable-realm=1&bom-disposable-realm-id=realm-10' },
        ],
      },
      {
        attribution: [
          { url: 'http://127.0.0.1/acceptance.html?bom-disposable-realm=1&bom-disposable-realm-id=realm-1' },
        ],
      },
    ],
  };

  const result = analyzeDisposableRealmAttribution(measurement, 'realm-1');
  assert.equal(result.matchingAttributionCount, 2);
  assert.equal(result.distinctChildUrls.length, 1);
  assert.equal(result.exactlyOneChildUrl, true);
});

function createHarness({ leakResource = null } = {}) {
  let activeRealm = null;
  let timestampMs = 0;
  const calls = [];
  const delays = [];
  const gcCycles = [];

  const dependencies = {
    async callAcceptance(_page, _description, capability, argument) {
      calls.push({ capability, argument });
      if (capability === 'createDisposableRealm') {
        activeRealm = { ...argument };
        return {
          phase: 'ready',
          realmId: argument.realmId,
          instanceCount: argument.instanceCount,
        };
      }
      if (capability === 'destroyDisposableRealm') {
        const assertions = resourceAssertions(leakResource);
        const authorized = leakResource === null;
        return {
          passed: authorized,
          removalAuthorized: authorized,
          assertions,
          destroyed: { passed: true },
        };
      }
      if (capability === 'releaseDisposableRealm') {
        if (leakResource !== null) {
          return {
            released: false,
            frameRemoved: false,
            qualified: false,
          };
        }
        activeRealm = null;
        return {
          released: true,
          frameRemoved: true,
          parentReferencesReleased: true,
          qualified: true,
        };
      }
      if (capability === 'discardDisposableRealm') {
        activeRealm = null;
        return {
          discarded: true,
          frameRemoved: true,
          qualified: false,
        };
      }
      throw new Error(`Unexpected capability ${capability}`);
    },
    async measureUaMemory() {
      timestampMs += 1;
      return {
        supported: true,
        bytes: activeRealm === null ? 10 * MIB : 11 * MIB,
        timestampMs,
        breakdown: activeRealm === null
          ? []
          : [{
              bytes: MIB,
              types: ['Window'],
              attribution: [{
                scope: 'Window',
                url: `http://127.0.0.1/acceptance.html?bom-disposable-realm=1&bom-disposable-realm-id=${activeRealm.realmId}`,
              }],
            }],
      };
    },
    async delay(milliseconds) {
      delays.push(milliseconds);
    },
    async collectGarbage(_session, cycles) {
      gcCycles.push(cycles);
    },
    async waitForFrameDetach() {
      return activeRealm === null;
    },
  };
  return { calls, delays, dependencies, gcCycles };
}

function resourceAssertions(leakResource) {
  return REQUIRED_DISPOSABLE_REALM_RESOURCES.map((resource) => ({
    resource,
    status: resource === leakResource ? 'failed' : 'passed',
    instrumentationSupported: true,
    before: 1,
    after: resource === leakResource ? 1 : 0,
    outstanding: resource === leakResource ? 1 : 0,
    evidence: 'typed-public-diagnostics',
    blocker: resource === leakResource ? 'RESOURCE_LEAK' : null,
  }));
}
