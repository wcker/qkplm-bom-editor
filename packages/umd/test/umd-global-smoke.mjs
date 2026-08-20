import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const bundle = readFileSync(
  resolve(import.meta.dirname, '../dist/bom-editor.umd.js'),
  'utf8',
);
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(bundle, sandbox, {
  filename: 'bom-editor.umd.js',
  timeout: 5_000,
});

const api = sandbox.QkplmBomEditor;
assert.equal(api.protocol, 'bom-editor-umd/v1');
assert.equal(api.version, '1.0.0-rc.1');
assert.equal(typeof api.createBomEditor, 'function');
assert.equal(typeof api.createBomEditorComponent, 'function');
assert.equal(typeof api.installBomEditorUmd, 'function');
assert.equal(api.installBomEditorUmd(sandbox), api);
assert.equal(/(?:@qkplm|@bom-editor)\//u.test(bundle), false);

console.log('UMD global smoke passed.');
