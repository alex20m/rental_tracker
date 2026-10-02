/**
 * What is configured, as JSON.
 *
 * Worth having from the first commit: it turns "did that setup step actually
 * take?" into one request, and it is what a post-deploy check can assert on
 * beyond "the build exited 0". SETUP.md points at it after almost every step.
 *
 * It reports *configuration*, never values — a health endpoint that echoed a
 * connection string would be a credential leak reachable without auth.
 */

import { readConfig } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const config = readConfig();

  return Response.json({
    ok: true,
    databaseConfigured: config.databaseUrl !== undefined,
    appUrlConfigured: config.appUrl !== undefined,
    // Both or nothing: one without the other cannot sign anybody in, and
    // reporting it as configured would hide a half-finished setup.
    authConfigured:
      config.authBaseUrl !== undefined && config.authCookieSecret !== undefined,
  });
}
