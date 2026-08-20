import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const input = 'dist/index.js';
const output = {
  format: 'umd',
  name: 'QkplmBomEditor',
  sourcemap: true,
};

export default [
  {
    input,
    plugins: [nodeResolve({ browser: true })],
    treeshake: {
      moduleSideEffects: false,
    },
    output: {
      ...output,
      file: 'dist/bom-editor.umd.js',
    },
  },
  {
    input,
    plugins: [nodeResolve({ browser: true }), terser()],
    treeshake: {
      moduleSideEffects: false,
    },
    output: {
      ...output,
      file: 'dist/bom-editor.umd.min.js',
    },
  },
];
