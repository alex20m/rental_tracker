import { json, notFound, withUser, type Params } from '@/lib/api';

/** Removes an owner whose share is already 0 % — or yourself, to leave. */
export async function DELETE(request: Request, { params }: Params<'id' | 'userId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, userId } = await params;
    const result = await store.removeOwner(session.userId, id, userId);
    if (result === 'not_found') return notFound();
    if (result === 'has_share') return json({ error: 'Give their share to someone else first (set it to 0 %).' }, 409);
    if (result === 'last_owner') return json({ error: 'The last owner cannot leave. Delete the apartment instead.' }, 409);
    return json({ ok: true });
  });
}
