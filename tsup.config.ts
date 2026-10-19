import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['server/index.ts'], format: ['esm'], platform: 'node', target: 'node22.13', outDir: 'dist-server',
  clean: true, sourcemap: true, removeNodeProtocol: false,
  external: ['node:sqlite', 'express', 'zod', 'pdf-parse', 'mammoth'],
});
