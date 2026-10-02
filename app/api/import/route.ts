import { json, parseBody, withUser } from '@/lib/api';
import { importSchema } from '@/lib/domain/schemas';

/**
 * Brings in one apartment from a backup of the browser-only first version, as
 * a new apartment owned by the importer alone. Receipt photos follow as
 * separate uploads to each cost.
 */
export async function POST(request: Request): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const body = await parseBody(request, importSchema);
    if (!body.ok) return body.response;
    const id = await store.importLedger(session, body.value);
    return json({ id }, 201);
  });
}
