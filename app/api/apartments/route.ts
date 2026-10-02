import { json, parseBody, withUser } from '@/lib/api';
import { newApartmentSchema } from '@/lib/domain/schemas';

/**
 * The caller's portfolio. Apartments shared with their email are claimed
 * first — but only once the auth provider has verified that email, or anyone
 * could sign up with somebody else's address and take what was shared with
 * them.
 */
export async function GET(request: Request): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    if (session.emailVerified) await store.claimInvites(session);
    return json({ apartments: await store.list(session.userId), emailVerified: session.emailVerified });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const body = await parseBody(request, newApartmentSchema);
    if (!body.ok) return body.response;
    const id = await store.create(session, body.value);
    return json({ id }, 201);
  });
}
