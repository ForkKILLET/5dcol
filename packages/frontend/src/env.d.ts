/// <reference types="@rsbuild/core/types" />

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
