import { imageResponse, json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { receiptSchema } from '@/lib/domain/schemas';

/** The photo itself, served only to the apartment's owners. */
export async function GET(request: Request, { params }: Params<'id' | 'costId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, costId } = await params;
    return imageResponse(await store.getReceipt(session.userId, id, costId));
  });
}

export async function PUT(request: Request, { params }: Params<'id' | 'costId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, costId } = await params;
    const body = await parseBody(request, receiptSchema);
    if (!body.ok) return body.response;
    return (await store.putReceipt(session.userId, id, costId, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id' | 'costId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, costId } = await params;
    return (await store.deleteReceipt(session.userId, id, costId)) ? json({ ok: true }) : notFound();
  });
}
