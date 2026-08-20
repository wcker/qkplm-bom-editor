import assert from 'node:assert/strict';

const forbiddenGlobals = [
  'window',
  'document',
  'navigator',
  'Worker',
  'SharedWorker',
  'OffscreenCanvas',
  'HTMLCanvasElement',
];
const originalDescriptors = new Map();

for (const name of forbiddenGlobals) {
  originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      throw new Error(`@qkplm/bom-editor accessed forbidden global: ${name}`);
    },
  });
}

function runtimeExportNames(moduleNamespace) {
  return Object.getOwnPropertyNames(moduleNamespace).sort();
}

function assertRuntimeParity(facade, physical, subpath) {
  assert.deepEqual(
    runtimeExportNames(facade),
    runtimeExportNames(physical),
    `${subpath} must preserve every physical-package runtime export.`,
  );
}

try {
  const [
    rootEntry,
    editorPhysical,
    contractsEntry,
    modelEntry,
    modelPhysical,
    transactionEntry,
    transactionPhysical,
    datasourceEntry,
    datasourcePhysical,
    runtimeEntry,
    runtimePhysical,
    canvasEntry,
    canvasPhysical,
  ] = await Promise.all([
    import('@qkplm/bom-editor'),
    import('@bom-editor/editor'),
    import('@qkplm/bom-editor/contracts'),
    import('@qkplm/bom-editor/model'),
    import('@bom-editor/model'),
    import('@qkplm/bom-editor/transaction'),
    import('@bom-editor/transaction'),
    import('@qkplm/bom-editor/datasource'),
    import('@bom-editor/datasource'),
    import('@qkplm/bom-editor/runtime'),
    import('@bom-editor/runtime'),
    import('@qkplm/bom-editor/renderer/canvas'),
    import('@bom-editor/renderer-canvas'),
  ]);

  assertRuntimeParity(rootEntry, editorPhysical, '.');
  assert.deepEqual(
    runtimeExportNames(contractsEntry),
    [],
    'The contracts facade must not expose runtime values.',
  );
  assertRuntimeParity(modelEntry, modelPhysical, './model');
  assertRuntimeParity(transactionEntry, transactionPhysical, './transaction');
  assertRuntimeParity(datasourceEntry, datasourcePhysical, './datasource');
  assertRuntimeParity(runtimeEntry, runtimePhysical, './runtime');
  assertRuntimeParity(canvasEntry, canvasPhysical, './renderer/canvas');
} finally {
  for (const [name, descriptor] of originalDescriptors) {
    if (descriptor === undefined) {
      delete globalThis[name];
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
}

console.log(
  'Core root and all stable subpaths imported without DOM or Worker access.',
);
