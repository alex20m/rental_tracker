import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { inviteSchema } from '@/lib/domain/schemas';

const REFUSED = {
  self: 'You already own this apartment.',
  already_owner: 'That person already owns part of this apartment.',
  already_invited: 'That email has already been invited.',
  insufficient_share: "You can't give away more than your own share.",
} as const;

/**
 * Shares this one apartment with an email address. Nothing else in the
 * inviter's portfolio is shared. The invitee gets it the next time they load
 * their portfolio while signed in with that email, verified.
 */
export async function POST(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, inviteSchema);
    if (!body.ok) return body.response;
    const result = await store.invite(session, id, body.value);
    if (result.ok) return json({ id: result.id }, 201);
    if (result.reason === 'not_found') return notFound();
    return json({ error: REFUSED[result.reason] }, 409);
  });
}
