import { imageResponse, json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { receiptSchema } from '@/lib/domain/schemas';

/** The photo of the signed-in owner's own purchase. Nobody else's is read or written here. */
export async function GET(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    return imageResponse(await store.getPurchasePhoto(session.userId, id));
  });
}

export async function PUT(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, receiptSchema);
    if (!body.ok) return body.response;
    return (await store.putPurchasePhoto(session.userId, id, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    return (await store.deletePurchasePhoto(session.userId, id)) ? json({ ok: true }) : notFound();
  });
}
