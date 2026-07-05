import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import packageJson from './package.json'

const dirname = import.meta.dirname
const commitHash = process.env.GIT_COMMIT?.trim() || getCommitHash()
const buildDate = process.env.BUILD_DATE?.trim() || new Date().toISOString()

function getCommitHash() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: path.resolve(dirname, '../..'),
      encoding: 'utf8',
    }).trim()
  }
  catch {
    return ''
  }
}

export default defineConfig({
  define: {
    __5DCOL_VERSION__: JSON.stringify(packageJson.version),
    __5DCOL_COMMIT_HASH__: JSON.stringify(commitHash),
    __5DCOL_BUILD_DATE__: JSON.stringify(buildDate),
  },
  resolve: {
    alias: {
      '@5dcol/core/fiveDPGN': path.resolve(dirname, '../core/src/fiveDPGN.ts'),
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
