import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { sharesSchema } from '@/lib/domain/schemas';

export async function PUT(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, sharesSchema);
    if (!body.ok) return body.response;
    const result = await store.setShares(session.userId, id, body.value);
    if (result === 'not_found') return notFound();
    if (result === 'bad_total') return json({ error: 'Shares must add up to exactly 100 %.' }, 400);
    if (result === 'stale') {
      return json({ error: 'The owners changed while you were editing. Reload and try again.' }, 409);
    }
    return json({ ok: true });
  });
}
