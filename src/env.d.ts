/** Ambient types: the Vite client types and the module shim that lets TypeScript import `*.vue` files. */
/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
