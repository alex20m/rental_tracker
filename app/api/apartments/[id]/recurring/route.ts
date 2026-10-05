import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { recurringSchema } from '@/lib/domain/schemas';

export async function POST(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, recurringSchema);
    if (!body.ok) return body.response;
    const entryId = await store.createRecurring(session.userId, id, body.value);
    if (entryId === null) return notFound();
    if (entryId === 'rent_exists') return json({ error: 'The rent already repeats every month. Change that one instead.' }, 409);
    return json({ id: entryId }, 201);
  });
}
