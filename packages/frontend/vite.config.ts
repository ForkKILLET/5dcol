import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import yaml from '@modyfi/vite-plugin-yaml'
import { defineConfig } from 'vite'

const dirname = import.meta.dirname

export default defineConfig({
  base: './',
  plugins: [vue(), yaml()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@5dcol/backend/protocol': path.resolve(dirname, '../backend/src/protocol.ts'),
      '@5dcol/core': path.resolve(dirname, '../core/src/index.ts'),
      '@comp': path.resolve(dirname, 'src/components'),
      '@engine': path.resolve(dirname, 'src/engine'),
    },
  },
  server: {
    port: 5160
  },
})
