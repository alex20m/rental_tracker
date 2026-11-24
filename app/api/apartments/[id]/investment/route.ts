import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { investmentSchema } from '@/lib/domain/schemas';

/** The signed-in owner's own loan at the purchase and estimated value of their part. Nobody else's is read or written here. */
export async function PUT(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, investmentSchema);
    if (!body.ok) return body.response;
    return (await store.putInvestment(session.userId, id, body.value)) ? json({ ok: true }) : notFound();
  });
}
