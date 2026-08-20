import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOM_F3_ACCEPTANCE_CALL_TIMEOUT,
  FORMAL_UA_MEMORY_TIMEOUT_MS,
  SMOKE_UA_MEMORY_TIMEOUT_MS,
  callAcceptance,
  measureUaMemory,
} from '../scripts/lib/acceptance.mjs';

test('UA-memory timeout is passed into the page and rejects invalid values', async () => {
  const received = [];
  const page = {
    async evaluate(callback, timeoutMs) {
      received.push(timeoutMs);
      return callback(timeoutMs);
    },
  };

  const smoke = await measureUaMemory(page, SMOKE_UA_MEMORY_TIMEOUT_MS);
  assert.equal(received.at(-1), SMOKE_UA_MEMORY_TIMEOUT_MS);
  assert.equal(smoke.supported, false);

  const formal = await measureUaMemory(page, FORMAL_UA_MEMORY_TIMEOUT_MS);
  assert.equal(received.at(-1), FORMAL_UA_MEMORY_TIMEOUT_MS);
  assert.equal(formal.supported, false);

  await assert.rejects(
    measureUaMemory(page, 0),
    /UA memory measurement timeout must be positive/u,
  );
});

test('UA-memory host timeout converts a stalled page evaluation to unsupported evidence', async () => {
  const startedAt = Date.now();
  const page = {
    evaluate() {
      return new Promise(() => {});
    },
  };

  const result = await measureUaMemory(page, 10);

  assert.equal(result.supported, false);
  assert.equal(result.reason, 'UA memory page evaluation timed out');
  assert.ok(Date.now() - startedAt < 1_500);
});

test('acceptance calls fail closed when the page evaluation never settles', async () => {
  const page = {
    evaluate() {
      return new Promise(() => {});
    },
  };
  const description = { methods: { resetAcceptance: 'reset' } };

  await assert.rejects(
    callAcceptance(page, description, 'resetAcceptance', undefined, 10),
    (error) => {
      assert.equal(error.code, BOM_F3_ACCEPTANCE_CALL_TIMEOUT);
      assert.equal(error.phase, 'resetAcceptance');
      assert.equal(error.diagnostics.timeoutMs, 10);
      return true;
    },
  );
});

test('acceptance calls reject invalid timeouts before starting page evaluation', async () => {
  let evaluations = 0;
  const page = {
    evaluate() {
      evaluations += 1;
      return Promise.resolve();
    },
  };
  const description = { methods: { resetAcceptance: 'reset' } };

  await assert.rejects(
    callAcceptance(page, description, 'resetAcceptance', undefined, 0),
    /Acceptance call timeout must be a positive integer/u,
  );
  assert.equal(evaluations, 0);
});
