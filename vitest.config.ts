import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias from tsconfig so tests import the same way
    // the app does.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  // e2e/ is Playwright's (npm run test:e2e), not vitest's.
  test: { environment: 'node', exclude: ['**/node_modules/**', 'e2e/**'] },
});
