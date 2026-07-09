import path from 'node:path'
import { defineConfig } from 'vite'

const dirname = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      '@5dcol/core/fiveDPGN': path.resolve(dirname, '../core/src/fiveDPGN.ts'),
      '@5dcol/core': path.resolve(dirname, '../core/src'),
    },
  },
  build: {
    lib: {
      entry: {
        index: path.resolve(dirname, 'src/index.ts'),
        protocol: path.resolve(dirname, 'src/protocol.ts'),
        studyDocument: path.resolve(dirname, 'src/studyDocument.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
  },
})
