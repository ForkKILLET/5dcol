import path from 'node:path'
import { defineConfig } from 'vite'

const dirname = import.meta.dirname

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve(dirname, 'src/index.ts'),
        protocol: path.resolve(dirname, 'src/protocol.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
  },
})
