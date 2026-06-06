import path from 'node:path'
import { defineConfig } from 'vite'

const dirname = import.meta.dirname

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
  },
})
