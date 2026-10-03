import { CoverageReport } from 'monocart-coverage-reports';
import { coverageOptions } from './coverage';

/** Start from an empty coverage cache, so a previous run cannot fill this run's gaps. */
export default async function globalSetup() {
  await new CoverageReport(coverageOptions).cleanCache();
}
