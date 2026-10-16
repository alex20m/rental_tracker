import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { checklistSchema } from '@/lib/domain/schemas';

/** Any owner may change the checklist: it is theirs together. */
export async function PUT(request: Request, { params }: Params<'id'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id } = await params;
    const body = await parseBody(request, checklistSchema);
    if (!body.ok) return body.response;
    return (await store.setChecklist(session.userId, id, body.value.text)) ? json({ ok: true }) : notFound();
  });
}
