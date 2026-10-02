import { json, notFound, parseBody, withUser, type Params } from '@/lib/api';
import { receiptSchema } from '@/lib/domain/schemas';

/**
 * The photo itself, served only to the apartment's owners. `nosniff` and a
 * private cache keep a browser from reinterpreting it or a shared cache from
 * keeping a copy.
 */
export async function GET(request: Request, { params }: Params<'id' | 'costId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, costId } = await params;
    const receipt = await store.getReceipt(session.userId, id, costId);
    if (!receipt) return notFound();
    return new Response(Buffer.from(receipt.base64, 'base64'), {
      headers: {
        'Content-Type': receipt.contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}

export async function PUT(request: Request, { params }: Params<'id' | 'costId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, costId } = await params;
    const body = await parseBody(request, receiptSchema);
    if (!body.ok) return body.response;
    return (await store.putReceipt(session.userId, id, costId, body.value)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, { params }: Params<'id' | 'costId'>): Promise<Response> {
  return withUser(request, async ({ session, store }) => {
    const { id, costId } = await params;
    return (await store.deleteReceipt(session.userId, id, costId)) ? json({ ok: true }) : notFound();
  });
}
