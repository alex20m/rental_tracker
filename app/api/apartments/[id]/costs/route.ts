import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { costSchema } from '@/lib/domain/schemas';

export async function POST(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, costSchema);
    if (!body.ok) return body.response;
    const costId = await store.createCost(session.userId, id, body.value);
    return costId ? json({ id: costId }, 201) : notFound();
  });
}
