import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { salePatchSchema } from '@/lib/domain/schemas';

/**
 * The signed-in owner's own purchase, or their own sale, of their part: one
 * whole or the other per request. Nobody else's is read or written here.
 */
export async function PATCH(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, salePatchSchema);
    if (!body.ok) return body.response;
    return (await store.patchSale(session.userId, id, body.value)) ? json({ ok: true }) : notFound();
  });
}
