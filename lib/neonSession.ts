/**
 * The parts of the Neon Auth integration that are pure logic: reading its two
 * variables, and mapping its session onto this app's `Session`.
 *
 * Deliberately free of any import from `@neondatabase/auth` — that package
 * reaches for `next/headers`, which only exists inside a Next runtime, so
 * anything importing it cannot be unit-tested. Keeping the decisions here and
 * the wiring in lib/neonAuth.ts means the logic that can be wrong is the logic
 * that is covered.
 */

import type { EnvSource } from '@/lib/env';
import type { Session } from '@/lib/auth';

/** The shape `auth.getSession()` resolves to, narrowed to what is mapped. */
export type NeonSessionData = {
  user: { id: string; email: string; emailVerified?: boolean } | null;
} | null;

export type NeonAuthConfig = {
  baseUrl: string;
  /** Must be at least 32 characters; the SDK throws below that. */
  secret: string;
};

/**
 * Both variables or nothing.
 *
 * One without the other cannot sign anyone in, and `createNeonAuth` throws on a
 * short secret — so an incomplete pair has to read as "not configured" rather
 * than as something to try.
 */
export function neonAuthConfig(env: EnvSource = process.env): NeonAuthConfig | undefined {
  const baseUrl = env.NEON_AUTH_BASE_URL?.trim();
  const secret = env.NEON_AUTH_COOKIE_SECRET?.trim();

  if (!baseUrl || !secret) return undefined;

  return { baseUrl, secret };
}

/**
 * Neon's session to this app's `Session`.
 *
 * An anonymous caller arrives as an explicit `{ session: null, user: null }`,
 * not as an absent field — reading it as "no `user` key means signed out" would
 * make a malformed response indistinguishable from a signed-out visitor.
 */
export function sessionFromNeon(data: NeonSessionData | undefined): Session | null {
  const user = data?.user;
  if (!user) return null;

  // Identified by id, never by email: emails change, and a session keyed on one
  // silently becomes a different account's when it does. Verification is
  // carried separately and only an explicit `true` counts, so a response
  // missing the flag fails closed.
  return { userId: user.id, email: user.email, emailVerified: user.emailVerified === true };
}
