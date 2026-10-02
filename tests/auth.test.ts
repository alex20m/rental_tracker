import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/me/route';
import { defaultAuth, setAuthProvider, type Session } from '@/lib/auth';

const original = { ...process.env };

beforeEach(() => {
  // The default provider is Neon Auth once its variables exist; without them
  // it fails closed, which is the state these tests start from.
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.NEON_AUTH_COOKIE_SECRET;
});

afterEach(() => {
  setAuthProvider(defaultAuth);
  process.env = { ...original };
});

function request(): Request {
  return new Request('https://example.test/api/me');
}

function providerReturning(session: Session | null) {
  return { getSession: async () => session };
}

describe('an authenticated route', () => {
  it('refuses an anonymous request', async () => {
    // The default provider fails closed, so a project that has not set its
    // auth variables yet denies rather than exposing the route.
    const response = await GET(request());

    expect(response.status).toBe(401);
  });

  it('tells an anonymous caller nothing about any account', async () => {
    const body = await (await GET(request())).text();

    expect(body).not.toContain('@');
  });

  it('answers with the signed-in account', async () => {
    setAuthProvider(
      providerReturning({ userId: 'user_123', email: 'someone@example.test', emailVerified: true }),
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: 'user_123',
      email: 'someone@example.test',
      emailVerified: true,
    });
  });
});
