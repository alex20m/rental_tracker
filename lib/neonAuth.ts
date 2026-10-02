/**
 * Neon Auth, plugged into the `AuthProvider` seam in lib/auth.ts.
 *
 * Neon Auth is **managed Better Auth**: identity lives in your own database, so
 * users are queryable in SQL and a database branch carries its own accounts. It
 * is *not* the older Stack Auth integration (`@stackframe/stack`, the
 * `NEXT_PUBLIC_STACK_*` variables) that most tutorials still describe — that
 * product is closed to new projects.
 *
 * Verified against `@neondatabase/auth@0.5.0-beta` (published 2026-08-11), which
 * is pre-1.0 and beta-tagged; the dependency is pinned exactly for that reason.
 * Read the package's own `llms.txt` before upgrading — this surface has moved
 * before.
 *
 * Nothing here is unit-tested, by design: importing the SDK pulls in
 * `next/headers`, which exists only inside a Next runtime. All the logic worth
 * testing lives in lib/neonSession.ts, which this file wires up.
 */

import { createNeonAuth } from '@neondatabase/auth/next/server';
import type { AuthProvider, Session } from '@/lib/auth';
import { neonAuthConfig, sessionFromNeon, type NeonSessionData } from '@/lib/neonSession';

type NeonAuthInstance = ReturnType<typeof createNeonAuth>;

let cached: NeonAuthInstance | undefined;

/**
 * The auth instance, or undefined when the project has not been provisioned.
 *
 * Built on first use rather than at module load: `createNeonAuth` throws on a
 * cookie secret under 32 characters, and at module scope that would fail the
 * *build* of a project that has not set auth up yet — the state a fresh
 * skeleton is in.
 */
export function neonAuth(): NeonAuthInstance | undefined {
  const config = neonAuthConfig();
  if (!config) return undefined;

  cached ??= createNeonAuth({
    baseUrl: config.baseUrl,
    cookies: { secret: config.secret },
  });
  return cached;
}

/**
 * Loaded lazily by `defaultAuth` in lib/auth.ts once both variables exist —
 * nothing needs to register it. Should it be reached without them, it resolves
 * every request to anonymous, the same fail-closed behaviour as the default.
 */
export const neonAuthProvider: AuthProvider = {
  async getSession(): Promise<Session | null> {
    const auth = neonAuth();
    if (!auth) return null;

    const { data } = await auth.getSession();
    return sessionFromNeon(data as NeonSessionData);
  },
};
