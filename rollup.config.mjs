import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';

const tsMain = {
  tsconfig: './tsconfig.json',
  declaration: true,
  declarationDir: 'dist',
};

const tsSide = {
  tsconfig: './tsconfig.json',
  declaration: false,
};

export default [
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.mjs', format: 'es', sourcemap: true },
      { file: 'dist/index.cjs', format: 'cjs', sourcemap: true },
    ],
    plugins: [
      resolve(),
      typescript(tsMain),
      copy({ targets: [{ src: 'wasm/out/*', dest: 'dist/wasm' }] }),
    ],
  },
  {
    input: 'src/wasm-runtime.ts',
    output: { file: 'dist/wasm-runtime.mjs', format: 'es', sourcemap: true },
    plugins: [resolve(), typescript(tsSide)],
  },
];
