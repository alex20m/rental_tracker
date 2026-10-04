import { CoverageReport } from 'monocart-coverage-reports';
import { PROJECTS, browserModules, coverageOptions, shortfalls } from './coverage';

/**
 * Merges the coverage every test added and fails the run unless every
 * browser module is covered completely — separately for each project, so the
 * phone and the desktop layout each have to be exercised in full. The reports
 * are in coverage-e2e/<project>/.
 */
export default async function globalTeardown() {
  const failures: string[] = [];
  for (const project of PROJECTS) {
    const results = await new CoverageReport(coverageOptions(project)).generate();
    const problems = shortfalls((results?.files ?? []) as Parameters<typeof shortfalls>[0], browserModules());
    if (problems.length) {
      failures.push(`${project} (report: coverage-e2e/${project}/index.html):\n  ${problems.join('\n  ')}`);
    }
  }
  if (failures.length) throw new Error(`End-to-end UI coverage is below 100 %:\n${failures.join('\n')}`);
}
