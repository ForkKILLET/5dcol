import { defineConfig } from '@rsbuild/core'
import { pluginVue } from '@rsbuild/plugin-vue'
import { pluginYaml } from '@rsbuild/plugin-yaml'

export default defineConfig({
  plugins: [pluginVue(), pluginYaml()],

  html: {
    title: '5D Chess Online',
  },

  output: {
    assetPrefix: './',
  },
})
