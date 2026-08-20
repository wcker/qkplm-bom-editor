import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BomShortcutRegistry,
  defaultBomShortcutBindings,
  validateBomShortcutOptions,
} from '../dist/index.js';

function keyEvent(key, options = {}) {
  return {
    key,
    code: options.code ?? `Key${key.toUpperCase()}`,
    ctrlKey: options.ctrlKey === true,
    metaKey: options.metaKey === true,
    altKey: options.altKey === true,
    shiftKey: options.shiftKey === true,
    repeat: options.repeat === true,
    isComposing: options.isComposing === true,
    keyCode: options.keyCode ?? 0,
    getModifierState(name) {
      return name === 'AltGraph' && options.altGraph === true;
    },
  };
}

test('default shortcut definitions are stable and configuration is atomic', () => {
  const defaults = defaultBomShortcutBindings();
  assert.ok(defaults.some((binding) => binding.id === 'grid.fill-down'));
  const registry = new BomShortcutRegistry();
  const invalid = registry.configure({
    bindings: [
      { id: 'grid.fill-down', keys: 'Primary+D', command: 'fill-down' },
      { id: 'grid.other', keys: 'Primary+D', command: 'other' },
    ],
  });
  assert.equal(invalid.ok, false);
  assert.equal(registry.isDefaultEnabled('grid.fill-down'), true);
  const valid = registry.configure({
    bindings: [
      { id: 'grid.fill-down', keys: 'Primary+Shift+D', command: 'fill-down' },
      { id: 'grid.other', keys: 'Primary+D', command: 'other', priority: 1 },
    ],
  });
  assert.equal(valid.ok, true);
  assert.equal(registry.isDefaultEnabled('grid.fill-down'), false);
  const shifted = registry.consume(keyEvent('D', { ctrlKey: true, shiftKey: true }), 'focused');
  assert.equal(shifted?.kind, 'matched');
  assert.equal(shifted?.value.command, 'fill-down');
  const custom = registry.consume(keyEvent('d', { ctrlKey: true }), 'focused');
  assert.equal(custom?.kind, 'matched');
  assert.equal(custom?.value.command, 'other');
});

test('disabled defaults leave browser behavior available and reset atomically', () => {
  const registry = new BomShortcutRegistry({
    bindings: [
      { id: 'grid.fill-down', keys: 'Primary+D', command: 'fill-down', enabled: false },
    ],
  });
  assert.equal(registry.isDefaultEnabled('grid.fill-down'), false);
  assert.equal(registry.consume(keyEvent('d', { ctrlKey: true }), 'focused'), null);
  const reset = registry.reset();
  assert.equal(reset.ok, true);
  assert.equal(registry.isDefaultEnabled('grid.fill-down'), true);
});

test('sequence bindings consume a prefix and then dispatch the complete command', () => {
  const registry = new BomShortcutRegistry({
    bindings: [
      { id: 'custom.sequence', keys: 'Primary+K Primary+C', command: 'custom:comment' },
    ],
  });
  const pending = registry.consume(keyEvent('k', { ctrlKey: true }), 'focused');
  assert.deepEqual(pending, { kind: 'pending' });
  const matched = registry.consume(keyEvent('c', { ctrlKey: true }), 'focused');
  assert.equal(matched?.kind, 'matched');
  assert.equal(matched?.value.command, 'custom:comment');
  assert.deepEqual(matched?.value.sequence, ['Primary+K', 'Primary+C']);
});

test('scope, composition, AltGraph and repeat gates are enforced', () => {
  const registry = new BomShortcutRegistry({
    bindings: [
      { id: 'edit.only', keys: 'Primary+E', command: 'edit', scope: 'editing' },
      { id: 'repeat.ok', keys: 'Primary+R', command: 'repeat', allowRepeat: true },
    ],
  });
  assert.equal(registry.consume(keyEvent('e', { ctrlKey: true }), 'focused'), null);
  assert.equal(registry.consume(keyEvent('e', { ctrlKey: true }), 'editing')?.kind, 'matched');
  assert.equal(registry.consume(keyEvent('r', { ctrlKey: true, repeat: true }), 'focused')?.kind, 'matched');
  assert.equal(registry.consume(keyEvent('e', { ctrlKey: true, altGraph: true }), 'editing'), null);
  assert.equal(registry.consume(keyEvent('e', { ctrlKey: true, isComposing: true }), 'editing'), null);
});

test('reserved shortcuts are warnings while malformed options fail closed', () => {
  const reserved = validateBomShortcutOptions({
    bindings: [{ id: 'custom.reload', keys: 'F5', command: 'reload' }],
  });
  assert.equal(reserved.ok, true);
  assert.equal(reserved.diagnostics[0]?.code, 'reserved-key');
  const malformed = validateBomShortcutOptions({
    bindings: [{ id: 'bad', keys: 'Primary+', command: 'bad' }],
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.diagnostics[0]?.code, 'invalid-stroke');
});
