/**
 * Neon Auth's `send.otp` webhook: Neon hands us the one-time code and we email
 * it ourselves, so the message is ours (see lib/mail.ts) and not Neon's default.
 *
 * Neon skips its own email once this webhook is on, so every failure here must
 * be loud. A 2xx means "delivered"; answering one without sending would leave
 * the user waiting for a code that never comes. Non-2xx, except 4xx other than
 * 408/429, is retried by Neon and then fails the sign-up.
 */

import { readConfig } from '@/lib/env';
import { sendAuthCode, type AuthCodeType } from '@/lib/mail';
import { verifyNeonWebhook } from '@/lib/neonWebhook';

export const dynamic = 'force-dynamic';

const CODE_TYPES: readonly string[] = ['sign-in', 'email-verification', 'forget-password'];

type OtpEvent = {
  event_type?: string;
  user?: { email?: string };
  event_data?: { otp_code?: string; otp_type?: string };
};

export async function POST(request: Request): Promise<Response> {
  const { authBaseUrl } = readConfig();
  if (!authBaseUrl) return Response.json({ error: 'auth is not configured' }, { status: 503 });

  const raw = await request.text();
  if (!(await verifyNeonWebhook(raw, request.headers, authBaseUrl))) {
    return Response.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: OtpEvent;
  try {
    event = JSON.parse(raw) as OtpEvent;
  } catch {
    return Response.json({ error: 'unreadable body' }, { status: 400 });
  }

  const to = event.user?.email;
  const code = event.event_data?.otp_code;
  const type = event.event_data?.otp_type;
  if (event.event_type !== 'send.otp' || !to || !code || !type || !CODE_TYPES.includes(type)) {
    return Response.json({ error: 'not an email code event' }, { status: 400 });
  }

  const result = await sendAuthCode({ to, code, type: type as AuthCodeType });
  if (result !== 'sent') return Response.json({ error: `email ${result}` }, { status: 500 });
  return Response.json({});
}
