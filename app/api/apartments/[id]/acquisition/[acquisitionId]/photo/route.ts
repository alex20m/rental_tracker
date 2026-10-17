import { imageResponse, json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { receiptSchema } from '@/lib/domain/schemas';

/** The photo of an acquisition cost, served only to the owner whose cost it is. */
export async function GET(request: Request, { params }: Params<'id' | 'acquisitionId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, acquisitionId } = await params;
    return imageResponse(await store.getAcquisitionPhoto(session.userId, id, acquisitionId));
  });
}

export async function PUT(request: Request, { params }: Params<'id' | 'acquisitionId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, acquisitionId } = await params;
    const body = await parseBody(request, receiptSchema);
    if (!body.ok) return body.response;
    return (await store.putAcquisitionPhoto(session.userId, id, acquisitionId, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id' | 'acquisitionId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, acquisitionId } = await params;
    return (await store.deleteAcquisitionPhoto(session.userId, id, acquisitionId)) ? json({ ok: true }) : notFound();
  });
}
