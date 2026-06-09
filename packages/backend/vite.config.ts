import path from 'node:path'
import { defineConfig } from 'vite'

const dirname = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      '@5dcol/core': path.resolve(dirname, '../core/src'),
      '@5dcol/shared': path.resolve(dirname, '../shared/src'),
    },
  },
  build: {
    ssr: true,
    lib: {
      entry: path.resolve(dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'main',
    },
  },
})
