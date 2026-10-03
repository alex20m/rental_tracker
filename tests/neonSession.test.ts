import { describe, expect, it } from 'vitest';
import { neonAuthConfig, sessionFromNeon } from '@/lib/neonSession';

describe('mapping a Neon session', () => {
  it('is anonymous when Neon reports no user', () => {
    // An anonymous caller arrives as an explicit null user, not as an absent
    // field.
    expect(sessionFromNeon({ user: null })).toBeNull();
  });

  it('is anonymous when there is no session data at all', () => {
    expect(sessionFromNeon(null)).toBeNull();
    expect(sessionFromNeon(undefined)).toBeNull();
  });

  it('carries the account through', () => {
    expect(
      sessionFromNeon({
        user: { id: 'usr_abc', name: 'Maija Meikäläinen', email: 'someone@example.test', emailVerified: true },
      }),
    ).toEqual({
      userId: 'usr_abc',
      name: 'Maija Meikäläinen',
      email: 'someone@example.test',
      emailVerified: true,
    });
  });

  it('trims the name, which becomes the name printed on the declaration', () => {
    const session = sessionFromNeon({
      user: { id: 'usr_abc', name: '  Maija Meikäläinen ', email: 'someone@example.test' },
    });

    expect(session?.name).toBe('Maija Meikäläinen');
  });

  it('falls back to the email when the provider has no usable name', () => {
    // Accounts made before the name was required may have none; the menu's
    // avatar and the printed declaration must never be handed an empty string.
    const missing = sessionFromNeon({ user: { id: 'usr_abc', email: 'someone@example.test' } });
    const blank = sessionFromNeon({ user: { id: 'usr_abc', name: '  ', email: 'someone@example.test' } });

    expect(missing?.name).toBe('someone@example.test');
    expect(blank?.name).toBe('someone@example.test');
  });

  it('reports an unverified email as unverified', () => {
    // Anyone can type any address at sign-up. Whatever is matched by email —
    // an invite, a share — must not be handed to an address nobody proved.
    const session = sessionFromNeon({
      user: { id: 'usr_abc', email: 'someone@example.test', emailVerified: false },
    });

    expect(session?.emailVerified).toBe(false);
  });

  it('treats a missing verification flag as unverified', () => {
    // Fails closed: a provider response without the flag must not read as proof.
    const session = sessionFromNeon({ user: { id: 'usr_abc', email: 'someone@example.test' } });

    expect(session?.emailVerified).toBe(false);
  });

  it('identifies the account by id, not by email', () => {
    // Emails change; a session keyed on one silently becomes a different
    // account's when it does.
    const session = sessionFromNeon({
      user: { id: 'usr_abc', email: 'renamed@example.test', emailVerified: true },
    });

    expect(session?.userId).toBe('usr_abc');
  });
});

describe('reading the Neon Auth variables', () => {
  const secret = 'x'.repeat(32);

  it('needs both, or auth is off', () => {
    // One without the other cannot sign anyone in, and the SDK throws on a
    // missing or short secret — so an incomplete pair must read as unconfigured
    // rather than as something to attempt.
    expect(neonAuthConfig({})).toBeUndefined();
    expect(neonAuthConfig({ NEON_AUTH_BASE_URL: 'https://x.neon.tech' })).toBeUndefined();
    expect(neonAuthConfig({ NEON_AUTH_COOKIE_SECRET: secret })).toBeUndefined();
  });

  it('treats a blank variable as unset', () => {
    expect(
      neonAuthConfig({ NEON_AUTH_BASE_URL: '   ', NEON_AUTH_COOKIE_SECRET: secret }),
    ).toBeUndefined();
  });

  it('reads both when they are present', () => {
    expect(
      neonAuthConfig({ NEON_AUTH_BASE_URL: 'https://x.neon.tech', NEON_AUTH_COOKIE_SECRET: secret }),
    ).toEqual({ baseUrl: 'https://x.neon.tech', secret });
  });
});
