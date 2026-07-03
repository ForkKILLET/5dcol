/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string
  readonly DEV: boolean
  readonly MODE: string
  readonly PROD: boolean
  readonly SSR: boolean
  readonly VITE_ASSET_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  // biome-ignore lint/complexity/noBannedTypes: reason
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module '*.yaml' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.yml' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.css' {}

declare module '*?raw' {
  const content: string
  export default content
}
