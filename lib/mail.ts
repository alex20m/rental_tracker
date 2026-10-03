/**
 * Outgoing email, through Resend's REST API.
 *
 * One endpoint, so a `fetch` rather than an SDK. Sending is best effort and
 * never throws: the caller has already done the thing the email is about (an
 * invite is stored), so a refused or unreachable Resend must not turn that
 * into an error. It returns what happened instead.
 *
 * Needs `RESEND_API_KEY` and `MAIL_FROM` (an address on a domain verified in
 * Resend); with either missing nothing is sent. See SETUP.md.
 */

import { readConfig, type AppConfig } from '@/lib/env';

export type InviteMail = {
  to: string;
  inviterEmail: string;
  apartmentName: string;
  sharePct: number;
};

export type SendResult = 'sent' | 'not_configured' | 'failed';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function sendInviteEmail(mail: InviteMail, config: AppConfig = readConfig()): Promise<SendResult> {
  if (!config.resendApiKey || !config.mailFrom) return 'not_configured';

  const link = config.appUrl ?? '';
  const share = `${mail.sharePct} %`;
  const text =
    `${mail.inviterEmail} shared the apartment "${mail.apartmentName}" with you in Rental Tracker, ` +
    `with a ${share} ownership share.\n\n` +
    `Sign in with this email address (${mail.to}) to see it${link ? `: ${link}` : '.'}`;
  const html =
    `<p>${escapeHtml(mail.inviterEmail)} shared the apartment <strong>${escapeHtml(mail.apartmentName)}</strong> ` +
    `with you in Rental Tracker, with a ${share} ownership share.</p>` +
    `<p>Sign in with this email address (${escapeHtml(mail.to)}) to see it` +
    (link ? `: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>` : '.') +
    `</p>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: config.mailFrom,
        to: [mail.to],
        subject: `${mail.inviterEmail} shared "${mail.apartmentName}" with you`,
        text,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`Resend refused the invite email: ${res.status}`);
      return 'failed';
    }
    return 'sent';
  } catch (error) {
    console.error('Could not reach Resend', error);
    return 'failed';
  }
}

type Mailer = (mail: InviteMail) => Promise<SendResult>;
let mailer: Mailer | undefined;

/** What routes call; tests replace it so no request leaves the process. */
export const sendInvite: Mailer = (mail) => (mailer ?? sendInviteEmail)(mail);

export function setMailerForTesting(fake: Mailer | undefined): void {
  mailer = fake;
}
