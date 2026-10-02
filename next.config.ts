import type { NextConfig } from 'next';

/**
 * `npm run test:e2e` builds with E2E_COVERAGE=1: browser source maps on, so
 * coverage collected from the bundle maps back to our source files, and a
 * separate output directory, so it never overwrites the real build in `.next`.
 */
const e2eCoverage = process.env.E2E_COVERAGE === '1';

const nextConfig: NextConfig = {
  // Surfacing type errors at build time is the point of using TypeScript here:
  // a deploy that silently ships a type error would defeat it.
  typescript: { ignoreBuildErrors: false },
  productionBrowserSourceMaps: e2eCoverage,
  distDir: e2eCoverage ? '.next-e2e' : '.next',
};

export default nextConfig;
