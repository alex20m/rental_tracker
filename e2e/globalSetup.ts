import { CoverageReport } from 'monocart-coverage-reports';
import { PROJECTS, coverageOptions } from './coverage';

/** Start from an empty coverage cache, so a previous run cannot fill this run's gaps. */
export default async function globalSetup() {
  for (const project of PROJECTS) await new CoverageReport(coverageOptions(project)).cleanCache();
}
