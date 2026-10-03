/**
 * The smallest possible authenticated endpoint — and the template for every
 * other one: resolve the session first, deny before touching any data.
 *
 * Keep this shape when you add routes. The mistake it exists to prevent is a
 * handler that queries first and checks the session afterwards, which leaks
 * through timing and through error messages even when it returns 401.
 */

import { sessionFor } from '@/lib/auth';
import { json, withUser } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  const session = await sessionFor(request);

  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  return Response.json({
    userId: session.userId,
    name: session.name,
    email: session.email,
    emailVerified: session.emailVerified,
  });
}

/** Deletes the caller's account and the data that is only theirs. */
export async function DELETE(request: Request): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    await store.deleteAccount(session);
    return json({ ok: true });
  });
}
