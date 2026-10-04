import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/webhooks/neon-auth/route';
import * as neonWebhook from '@/lib/neonWebhook';
import { setAuthCodeMailerForTesting } from '@/lib/mail';

const event = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    event_type: 'send.otp',
    user: { email: 'bob@example.test' },
    event_data: { otp_code: '482913', otp_type: 'email-verification' },
    ...over,
  });
const request = (body: string) => new Request('https://app.test/api/webhooks/neon-auth', { method: 'POST', body });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setAuthCodeMailerForTesting(undefined);
});

function setup(opts: { valid?: boolean; send?: 'sent' | 'not_configured' | 'failed' } = {}) {
  vi.stubEnv('NEON_AUTH_BASE_URL', 'https://auth.test/neondb/auth');
  vi.spyOn(neonWebhook, 'verifyNeonWebhook').mockResolvedValue(opts.valid ?? true);
  const sent: unknown[] = [];
  setAuthCodeMailerForTesting(async (mail) => { sent.push(mail); return opts.send ?? 'sent'; });
  return sent;
}

describe('the Neon Auth send.otp webhook', () => {
  it('emails the code to the user and answers 200', async () => {
    const sent = setup();
    const res = await POST(request(event()));
    expect(res.status).toBe(200);
    expect(sent).toEqual([{ to: 'bob@example.test', code: '482913', type: 'email-verification' }]);
  });

  it('answers 401 and sends nothing when the signature is not valid', async () => {
    const sent = setup({ valid: false });
    expect((await POST(request(event()))).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('answers 500 when the email could not be sent, so Neon retries and the sign-up fails visibly', async () => {
    setup({ send: 'failed' });
    expect((await POST(request(event()))).status).toBe(500);
    setup({ send: 'not_configured' });
    expect((await POST(request(event()))).status).toBe(500);
  });

  it('answers 400, without retries, to an event it does not handle or a body it cannot read', async () => {
    const sent = setup();
    expect((await POST(request(event({ event_type: 'user.created' })))).status).toBe(400);
    expect((await POST(request(event({ event_data: { otp_code: '1', otp_type: 'sms-magic' } })))).status).toBe(400);
    expect((await POST(request('not json'))).status).toBe(400);
    expect(sent).toEqual([]);
  });

  it('answers 503 when auth is not configured, since nothing can be verified', async () => {
    vi.stubEnv('NEON_AUTH_BASE_URL', '');
    expect((await POST(request(event()))).status).toBe(503);
  });
});
