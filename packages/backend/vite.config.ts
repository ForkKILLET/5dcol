import path from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const dirname = import.meta.dirname
const packageJson = JSON.parse(readFileSync(path.resolve(dirname, 'package.json'), 'utf8')) as {
  version?: string
}

export default defineConfig({
  define: {
    __5DCOL_VERSION__: JSON.stringify(packageJson.version ?? '0.0.0'),
    __5DCOL_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@5dcol/core': path.resolve(dirname, '../core/src'),
      '@5dcol/shared': path.resolve(dirname, '../shared/src'),
      '@5dcol/shared/protocol': path.resolve(dirname, '../shared/src/protocol.ts'),
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
