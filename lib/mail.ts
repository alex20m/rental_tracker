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

type Message = { to: string; subject: string; text: string; html: string };

/** One Resend call for every email the app sends, so they share a sender and a failure policy. */
async function sendViaResend(message: Message, config: AppConfig, what: string): Promise<SendResult> {
  if (!config.resendApiKey || !config.mailFrom) return 'not_configured';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: config.mailFrom,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      console.error(`Resend refused the ${what} email: ${res.status}`);
      return 'failed';
    }
    return 'sent';
  } catch (error) {
    console.error('Could not reach Resend', error);
    return 'failed';
  }
}

export async function sendInviteEmail(mail: InviteMail, config: AppConfig = readConfig()): Promise<SendResult> {
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

  return sendViaResend(
    { to: mail.to, subject: `${mail.inviterEmail} shared "${mail.apartmentName}" with you`, text, html },
    config,
    'invite',
  );
}

/** The kinds of one-time code Neon Auth asks us to deliver. */
export type AuthCodeType = 'sign-in' | 'email-verification' | 'forget-password';

export type AuthCodeMail = { to: string; code: string; type: AuthCodeType };

const AUTH_CODE_WORDING: Record<AuthCodeType, { subject: string; lead: string }> = {
  'email-verification': { subject: 'Your Rental Tracker verification code', lead: 'Use this code to verify your email address' },
  'sign-in': { subject: 'Your Rental Tracker sign-in code', lead: 'Use this code to sign in' },
  'forget-password': { subject: 'Your Rental Tracker password reset code', lead: 'Use this code to reset your password' },
};

/**
 * The one-time code Neon Auth hands us through its `send.otp` webhook. Neon
 * skips its own email when that webhook is on, so this is the whole message.
 */
export async function sendAuthCodeEmail(mail: AuthCodeMail, config: AppConfig = readConfig()): Promise<SendResult> {
  const { subject, lead } = AUTH_CODE_WORDING[mail.type];
  const text = `${lead} in Rental Tracker:\n\n${mail.code}\n\nIt expires shortly. If you did not ask for it, you can ignore this email.`;
  const html =
    `<p>${lead} in Rental Tracker:</p>` +
    `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(mail.code)}</p>` +
    `<p>It expires shortly. If you did not ask for it, you can ignore this email.</p>`;

  return sendViaResend({ to: mail.to, subject, text, html }, config, 'sign-in code');
}

type Mailer = (mail: InviteMail) => Promise<SendResult>;
let mailer: Mailer | undefined;

/** What routes call; tests replace it so no request leaves the process. */
export const sendInvite: Mailer = (mail) => (mailer ?? sendInviteEmail)(mail);

export function setMailerForTesting(fake: Mailer | undefined): void {
  mailer = fake;
}

type AuthCodeMailer = (mail: AuthCodeMail) => Promise<SendResult>;
let authCodeMailer: AuthCodeMailer | undefined;

/** What the webhook route calls; tests replace it so no request leaves the process. */
export const sendAuthCode: AuthCodeMailer = (mail) => (authCodeMailer ?? sendAuthCodeEmail)(mail);

export function setAuthCodeMailerForTesting(fake: AuthCodeMailer | undefined): void {
  authCodeMailer = fake;
}
