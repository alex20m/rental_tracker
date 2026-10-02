import { json, parseBody, withUser } from '@/lib/api';
import { profileSchema } from '@/lib/domain/schemas';

export async function GET(request: Request): Promise<Response> {
  return withUser(request, async ({ session, store }) => json(await store.profile(session.userId)));
}

export async function PUT(request: Request): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const body = await parseBody(request, profileSchema);
    if (!body.ok) return body.response;
    await store.setProfile(session.userId, body.value);
    return json({ ok: true });
  });
}
