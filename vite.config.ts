import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> normal PWA build in dist/
// `npm run build:single` -> one self-contained HTML file (used for quick previews)
export default defineConfig({
  base: './',
  build: { target: "es2022" },
  plugins: [react(), ...(process.env.SINGLE ? [viteSingleFile()] : [])],
  define: { __SINGLE__: JSON.stringify(!!process.env.SINGLE) },
});
