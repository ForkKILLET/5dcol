import path from 'node:path'
import { defineConfig } from 'vite'

const dirname = import.meta.dirname

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve(dirname, 'src/index.ts'),
        fiveDPGN: path.resolve(dirname, 'src/fiveDPGN.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => (format === 'es' ? `${entryName}.js` : `${entryName}.cjs`),
    },
  },
})
