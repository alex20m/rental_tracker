import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { saleSchema } from '@/lib/domain/schemas';

/** The signed-in owner's own sale of their part: nobody else's is read or written here. */
export async function PUT(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, saleSchema);
    if (!body.ok) return body.response;
    return (await store.putSale(session.userId, id, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    return (await store.deleteSale(session.userId, id)) ? json({ ok: true }) : notFound();
  });
}
