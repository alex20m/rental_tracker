import { CoverageReport } from 'monocart-coverage-reports';
import { browserModules, coverageOptions, shortfalls } from './coverage';

/**
 * Merges the coverage every test added and fails the run unless every
 * browser module is covered completely. The report is in coverage-e2e/.
 */
export default async function globalTeardown() {
  const results = await new CoverageReport(coverageOptions).generate();
  const problems = shortfalls((results?.files ?? []) as Parameters<typeof shortfalls>[0], browserModules());
  if (problems.length) {
    throw new Error(
      `End-to-end UI coverage is below 100 % (report: coverage-e2e/index.html):\n  ${problems.join('\n  ')}`,
    );
  }
}
