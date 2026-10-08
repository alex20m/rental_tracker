import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { acquisitionSchema } from '@/lib/domain/schemas';

export async function PUT(request: Request, { params }: Params<'id' | 'acquisitionId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, acquisitionId } = await params;
    const body = await parseBody(request, acquisitionSchema);
    if (!body.ok) return body.response;
    return (await store.updateAcquisition(session.userId, id, acquisitionId, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id' | 'acquisitionId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, acquisitionId } = await params;
    return (await store.deleteAcquisition(session.userId, id, acquisitionId)) ? json({ ok: true }) : notFound();
  });
}
