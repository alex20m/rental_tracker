import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { settingsPatchSchema } from '@/lib/domain/schemas';

export async function GET(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const apartment = await store.get(session.userId, (await params).id);
    return apartment ? json(apartment) : notFound();
  });
}

export async function PATCH(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, settingsPatchSchema);
    if (!body.ok) return body.response;
    return (await store.updateSettings(session.userId, id, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const result = await store.remove(session.userId, (await params).id);
    if (result === 'not_found') return notFound();
    if (result === 'has_co_owners') {
      return json({ error: 'Other owners still own part of this apartment. Leave it instead.' }, 409);
    }
    return json({ ok: true });
  });
}
