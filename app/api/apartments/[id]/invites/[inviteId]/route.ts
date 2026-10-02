import { json, notFound, withUser, type Params } from '@/lib/api';

export async function DELETE(request: Request, { params }: Params<'id' | 'inviteId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, inviteId } = await params;
    return (await store.revokeInvite(session.userId, id, inviteId)) ? json({ ok: true }) : notFound();
  });
}
