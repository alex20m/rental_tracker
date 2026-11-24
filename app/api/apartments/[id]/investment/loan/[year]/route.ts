import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { loanYearParam, loanYearSchema } from '@/lib/domain/schemas';

/** One year of the signed-in owner's own loan; saving it empty removes it. */
export async function PUT(request: Request, { params }: Params<'id' | 'year'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, year } = await params;
    const y = loanYearParam.safeParse(year);
    if (!y.success) return json({ error: 'Year must be four digits' }, 400);
    const body = await parseBody(request, loanYearSchema);
    if (!body.ok) return body.response;
    return (await store.putLoanYear(session.userId, id, y.data, body.value)) ? json({ ok: true }) : notFound();
  });
}
