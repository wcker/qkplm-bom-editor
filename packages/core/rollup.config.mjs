import { nodeResolve } from '@rollup/plugin-node-resolve';

const entries = Object.freeze({
  index: '.build/index.js',
  contracts: '.build/contracts.js',
  model: '.build/model.js',
  transaction: '.build/transaction.js',
  datasource: '.build/datasource.js',
  runtime: '.build/runtime.js',
  'renderer/canvas': '.build/renderer/canvas.js',
  worker: '.build/worker.js',
});

export default {
  input: entries,
  plugins: [nodeResolve({ preferBuiltins: true })],
  treeshake: {
    moduleSideEffects: false,
  },
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
  },
};
