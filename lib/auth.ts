/**
 * The authentication seam.
 *
 * Everything downstream (route handlers, tests) is written against
 * `AuthProvider`, never against an SDK, so the provider can be swapped — or
 * faked in a test — by touching one file.
 *
 * The default provider is Neon Auth, activated by its own variables: until both
 * `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` exist it resolves every
 * request to anonymous, so a half-finished setup denies rather than exposes.
 * It is activated here rather than by a `setAuthProvider` call "at startup"
 * because a Next app has no startup hook that every route's module graph is
 * guaranteed to share; a provider set from one entry point can be invisible to
 * another, and that fails open-looking-closed — every request anonymous on a
 * deployment that is configured.
 *
 * The SDK is imported lazily, and only once the variables exist, because it
 * pulls in `next/headers`, which only resolves inside a Next runtime. Tests,
 * which have no Neon variables, therefore never load it.
 */

import { neonAuthConfig } from '@/lib/neonSession';

export type Session = {
  /** Stable identifier for the account. Never an email — those change. */
  userId: string;
  /** The name given at sign-up; printed on the declaration. Never empty. */
  name: string;
  email: string;
  /**
   * Whether the provider has proved this person controls `email`. Anything
   * granted by email address — an invite, a share — must require it, because
   * anyone can type anyone's address at sign-up.
   */
  emailVerified: boolean;
};

export interface AuthProvider {
  /**
   * The session for this request, or null when the caller is anonymous.
   *
   * Takes the Request rather than reading cookies globally so it is callable
   * from route handlers, middleware and tests alike without a request-scoped
   * global.
   */
  getSession(request: Request): Promise<Session | null>;
}

/** Everyone is anonymous. Fails closed — routes deny rather than admit. */
export const unconfiguredAuth: AuthProvider = {
  getSession: async () => null,
};

/** Neon Auth when its variables are set, anonymous otherwise. */
export const defaultAuth: AuthProvider = {
  async getSession(request) {
    if (!neonAuthConfig()) return null;
    const { neonAuthProvider } = await import('@/lib/neonAuth');
    return neonAuthProvider.getSession(request);
  },
};

let provider: AuthProvider = defaultAuth;

export function authProvider(): AuthProvider {
  return provider;
}

/** For tests, and for swapping in a different provider. */
export function setAuthProvider(next: AuthProvider): void {
  provider = next;
}

/** Convenience for route handlers: `const session = await sessionFor(request);` */
export async function sessionFor(request: Request): Promise<Session | null> {
  return provider.getSession(request);
}
