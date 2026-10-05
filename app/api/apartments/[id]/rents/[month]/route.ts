import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { pastOrCurrentMonth as monthSchema, newRentSchema } from '@/lib/domain/schemas';

export async function PUT(request: Request, { params }: Params<'id' | 'month'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, month } = await params;
    if (!monthSchema.safeParse(month).success) return json({ error: 'Month must be YYYY-MM and not in the future' }, 400);
    const body = await parseBody(request, newRentSchema);
    if (!body.ok) return body.response;
    return (await store.putRent(session.userId, id, month, body.value, { repeat: body.value.repeatMonthly })) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id' | 'month'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, month } = await params;
    if (!monthSchema.safeParse(month).success) return json({ error: 'Month must be YYYY-MM and not in the future' }, 400);
    return (await store.deleteRent(session.userId, id, month)) ? json({ ok: true }) : notFound();
  });
}
