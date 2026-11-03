/// <reference types="vite/client" />

declare module 'opentype.js' {
  export function parse(buffer: ArrayBuffer): unknown
}
