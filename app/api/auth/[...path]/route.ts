/**
 * Neon Auth's own endpoints, proxied.
 *
 * The directory must be `[...path]`: the handler reads `params.path`, so
 * naming the segment anything else gives it nothing to route on. (The package's
 * JSDoc example says `[...all]` while its type says `path` — the type is what
 * runs.)
 *
 * Built per request rather than at module scope so an unprovisioned project
 * still builds: `auth.handler()` needs a cookie secret, and a throw at module
 * scope would fail the build rather than the request.
 */

import { neonAuth } from '@/lib/neonAuth';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(
  request: Request,
  context: RouteContext,
  method: 'GET' | 'POST',
): Promise<Response> {
  const auth = neonAuth();

  if (!auth) {
    return Response.json(
      { error: 'Auth is not configured. See INIT.md.' },
      { status: 503 },
    );
  }

  return auth.handler()[method](request, context);
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context, 'GET');
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context, 'POST');
}
