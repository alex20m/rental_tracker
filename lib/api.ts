/**
 * The shape every API route takes: resolve the session first and deny before
 * touching any data, then parse the body, then act — through lib/portfolio,
 * which checks ownership of the apartment named in the URL.
 */

import type { z } from 'zod';
import { sessionFor, type Session } from '@/lib/auth';
import { queryable } from '@/lib/db';
import { portfolio, type Portfolio } from '@/lib/portfolio';

export type Context = { session: Session; store: Portfolio };

export const json = (body: unknown, status = 200) => Response.json(body, { status });

export const notFound = () => json({ error: 'Not found' }, 404);

/** Runs `handle` for a signed-in caller; anyone else gets 401 and nothing else. */
export async function withUser(request: Request, handle: (ctx: Context) => Promise<Response>): Promise<Response> {
  const session = await sessionFor(request);
  if (!session) return json({ error: 'Not signed in' }, 401);
  return handle({ session, store: portfolio(queryable()) });
}

/** The request body parsed by `schema`, or a 400 response saying what is wrong. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; value: z.output<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: json({ error: 'Body must be JSON' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    return { ok: false, response: json({ error: `${where}${issue?.message ?? 'Invalid body'}` }, 400) };
  }
  return { ok: true, value: parsed.data };
}

/** Next passes dynamic segments as a promise of params. */
export type Params<K extends string> = { params: Promise<Record<K, string>> };
