import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" path alias from tsconfig so tests import the same way
      // the app does.
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `next/headers` and `next/server` have no package "exports" entry, so they
      // resolve fine inside Next's own bundler (which probes extensions) but
      // not under Node's stricter ESM loader. @neondatabase/auth imports both
      // without an extension; point them at the real files so tests can load
      // the real handler.
      'next/headers': 'next/headers.js',
      'next/server': 'next/server.js',
    },
  },
  // e2e/ is Playwright's (npm run test:e2e), not vitest's.
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'e2e/**'],
    // Makes Vite process @neondatabase/auth itself rather than handing it
    // straight to Node's loader, so the aliases above apply inside it.
    server: { deps: { inline: [/@neondatabase\/auth/] } },
  },
});
