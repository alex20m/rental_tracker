import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { costSchema } from '@/lib/domain/schemas';

export async function PUT(request: Request, { params }: Params<'id' | 'costId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, costId } = await params;
    const body = await parseBody(request, costSchema);
    if (!body.ok) return body.response;
    return (await store.updateCost(session.userId, id, costId, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id' | 'costId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, costId } = await params;
    return (await store.deleteCost(session.userId, id, costId)) ? json({ ok: true }) : notFound();
  });
}
