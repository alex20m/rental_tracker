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

const SESSION_TOKEN_COOKIE = '__Secure-neon-auth.session_token';
const SESSION_CACHE_COOKIE = '__Secure-neon-auth.local.session_data';

const hasCookie = (request: Request, name: string): boolean =>
  (request.headers.get('cookie') ?? '').split(';').some((pair) => pair.trim().startsWith(`${name}=`));

const isGetSession = (path: string[]): boolean => path.length === 1 && path[0] === 'get-session';

/** A response the handler's own upstream call reported as a blip, not an answer. */
const isTransientFailure = (response: Response): boolean => response.status >= 500;

/**
 * Lets a session check that has to go upstream anyway bring the renewed
 * session cookie back with it, so a signed-in browser stays signed in for as
 * long as the app is used.
 *
 * Better Auth keeps a session alive by answering `get-session` with the
 * session-token cookie re-issued on a fresh expiry. Neon Auth's handler,
 * though, answers `get-session` from its own short-lived signed cache cookie,
 * and once that has lapsed it re-fetches the session upstream through a path
 * that keeps only the body and throws the `Set-Cookie` away. The browser's
 * cookie therefore kept the expiry it was first given, and everyone was
 * signed out a fixed time after signing in, however often they used the app.
 *
 * `disableCookieCache=true` sends the check down the handler's ordinary proxy
 * path instead, which forwards upstream cookies (re-signed onto this origin)
 * and re-mints the cache cookie from the same answer. It is only added when
 * the cache cookie is gone — which is exactly when the handler would have
 * gone upstream regardless — so a fresh cache is still answered locally and
 * a successful check makes no more upstream calls than before.
 *
 * A blip is the exception. The cache path makes a second upstream call of its
 * own when the first fails, so it absorbs a blip the single renewal call does
 * not. A renewal attempt that comes back as a transient failure therefore
 * falls back to the cache path: the check is never less tolerant of a flaky
 * upstream than it was, and only that one answer goes without the renewed
 * cookie. The next check renews it.
 */
async function getSessionRenewing(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  if (
    !isGetSession(path) ||
    !hasCookie(request, SESSION_TOKEN_COOKIE) ||
    hasCookie(request, SESSION_CACHE_COOKIE)
  ) {
    return proxy(request, context, 'GET');
  }
  const url = new URL(request.url);
  url.searchParams.set('disableCookieCache', 'true');
  const renewed = await proxy(new Request(url, request), context, 'GET');
  if (!isTransientFailure(renewed)) return renewed;
  return proxy(request, context, 'GET');
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return getSessionRenewing(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context, 'POST');
}
