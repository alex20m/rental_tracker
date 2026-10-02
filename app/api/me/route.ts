/**
 * The smallest possible authenticated endpoint — and the template for every
 * other one: resolve the session first, deny before touching any data.
 *
 * Keep this shape when you add routes. The mistake it exists to prevent is a
 * handler that queries first and checks the session afterwards, which leaks
 * through timing and through error messages even when it returns 401.
 */

import { sessionFor } from '@/lib/auth';

export async function GET(request: Request): Promise<Response> {
  const session = await sessionFor(request);

  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  return Response.json({
    userId: session.userId,
    email: session.email,
    emailVerified: session.emailVerified,
  });
}
