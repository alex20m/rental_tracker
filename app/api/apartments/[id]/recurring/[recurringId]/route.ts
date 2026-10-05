import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { recurringPatchSchema } from '@/lib/domain/schemas';

export async function PUT(request: Request, { params }: Params<'id' | 'recurringId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, recurringId } = await params;
    const body = await parseBody(request, recurringPatchSchema);
    if (!body.ok) return body.response;
    return (await store.updateRecurring(session.userId, id, recurringId, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id' | 'recurringId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, recurringId } = await params;
    return (await store.deleteRecurring(session.userId, id, recurringId)) ? json({ ok: true }) : notFound();
  });
}
