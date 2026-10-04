import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAuthCodeEmail, sendInviteEmail } from '@/lib/mail';
import { readConfig } from '@/lib/env';

const invite = { to: 'bob@example.test', inviterEmail: 'alice@example.test', apartmentName: 'Flat <1>', sharePct: 25 };
const configured = readConfig({ RESEND_API_KEY: 're_key', MAIL_FROM: 'Rentals <rentals@example.test>', APP_URL: 'https://app.test' });

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('the invite email', () => {
  it('posts to Resend with the key, sender, recipient and a link to the app', async () => {
    const fetchMock = stubFetch(Response.json({ id: 'msg_1' }));

    expect(await sendInviteEmail(invite, configured)).toBe('sent');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_key');
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('Rentals <rentals@example.test>');
    expect(body.to).toEqual(['bob@example.test']);
    expect(body.text).toContain('alice@example.test');
    expect(body.text).toContain('25 %');
    expect(body.text).toContain('https://app.test');
  });

  it('escapes the apartment name in the HTML body', async () => {
    const fetchMock = stubFetch(Response.json({ id: 'msg_1' }));
    await sendInviteEmail(invite, configured);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.html).toContain('Flat &lt;1&gt;');
    expect(body.html).not.toContain('Flat <1>');
  });

  it('sends nothing when Resend is not configured', async () => {
    const fetchMock = stubFetch(Response.json({}));
    expect(await sendInviteEmail(invite, readConfig({ APP_URL: 'https://app.test' }))).toBe('not_configured');
    expect(await sendInviteEmail(invite, readConfig({ RESEND_API_KEY: 'k', APP_URL: 'https://app.test' }))).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports failure rather than throwing when Resend refuses or is unreachable', async () => {
    stubFetch(new Response('{"message":"bad"}', { status: 422 }));
    expect(await sendInviteEmail(invite, configured)).toBe('failed');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await sendInviteEmail(invite, configured)).toBe('failed');
  });
});

describe('the sign-in code email', () => {
  const code = { to: 'bob@example.test', code: '482913', type: 'email-verification' as const };

  it('sends the code from the same sender as the invite, with the code in the text and HTML bodies but not the subject', async () => {
    const fetchMock = stubFetch(Response.json({ id: 'msg_2' }));

    expect(await sendAuthCodeEmail(code, configured)).toBe('sent');

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.from).toBe('Rentals <rentals@example.test>');
    expect(body.to).toEqual(['bob@example.test']);
    expect(body.subject).toBe('Your Rental Tracker verification code');
    expect(body.text).toContain('482913');
    expect(body.html).toContain('482913');
    expect(body.subject).not.toContain('482913');
  });

  it('words the subject for the kind of code', async () => {
    const subjects: string[] = [];
    for (const type of ['sign-in', 'forget-password'] as const) {
      const fetchMock = stubFetch(Response.json({ id: 'm' }));
      await sendAuthCodeEmail({ ...code, type }, configured);
      subjects.push(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).subject);
    }
    expect(subjects).toEqual(['Your Rental Tracker sign-in code', 'Your Rental Tracker password reset code']);
  });

  it('is not configured, and sends nothing, without a Resend key and sender', async () => {
    const fetchMock = stubFetch(Response.json({}));
    expect(await sendAuthCodeEmail(code, readConfig({}))).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports failure when Resend refuses or is unreachable', async () => {
    stubFetch(new Response('{}', { status: 403 }));
    expect(await sendAuthCodeEmail(code, configured)).toBe('failed');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await sendAuthCodeEmail(code, configured)).toBe('failed');
  });
});
