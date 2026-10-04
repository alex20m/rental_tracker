'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAuthError } from '@neondatabase/auth/next';
import { authClient } from '@/lib/client/authClient';
import { useI18n } from '@/components/I18nProvider';
import LanguagePicker from '@/components/LanguagePicker';
import { ErrorNote, OtpInput } from '@/components/ui';

type Mode = 'sign-in' | 'sign-up' | 'verify' | 'forgot' | 'reset';

/**
 * Neon's client does not hand back Better Auth's `{ data, error }` on failure:
 * its fetch wrapper throws a normalised AuthError instead, with its own codes —
 * Better Auth's EMAIL_NOT_VERIFIED arrives as `email_not_confirmed`. (Read from
 * @neondatabase/auth@0.5.0-beta's adapter; a check on `result.error` never
 * fires.) So every failure is handled as an exception, in `step`.
 */
const isUnverified = (e: unknown) => isAuthError(e) && e.code === 'email_not_confirmed';

/**
 * Email + password accounts through Neon Auth. Email ownership is proved with a
 * one-time code typed into this page (not a link), so verification is a plain
 * POST through the auth proxy: nothing redirects, and no session cookie can be
 * lost on a redirect hop — see the cli-first-provisioning skill.
 */
export default function SignIn() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useSearchParams();
  const verifyEmail = params.get('verify');

  const [mode, setMode] = useState<Mode>(verifyEmail ? 'verify' : 'sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(verifyEmail ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(verifyEmail ? t('auth.pressSend') : '');

  const newPasswordInput = useRef<HTMLInputElement>(null);

  const auth = authClient();

  const step = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const sendCode = async (message: 'auth.codeSent' | 'auth.codeSentSignUp' = 'auth.codeSent') => {
    await auth.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'email-verification' });
    setInfo(t(message, { email: email.trim() }));
  };

  // A forgotten password is reset with an emailed code, like verification: a
  // plain POST through the auth proxy, so nothing redirects.
  const requestReset = async () => {
    await auth.emailOtp.requestPasswordReset({ email: email.trim() });
    setInfo(t('auth.codeSent', { email: email.trim() }));
  };

  const forgot = () =>
    step(async () => {
      await requestReset();
      setPassword('');
      setMode('reset');
    });

  const reset = () =>
    step(async () => {
      await auth.emailOtp.resetPassword({ email: email.trim(), otp: code, password });
      setCode('');
      setPassword('');
      setMode('sign-in');
      setInfo(t('auth.passwordChanged'));
    });

  const enter = () => {
    router.replace('/');
    router.refresh();
  };

  const signIn = () =>
    step(async () => {
      try {
        await auth.signIn.email({ email: email.trim(), password });
      } catch (e) {
        if (!isUnverified(e)) throw e;
        setMode('verify');
        return sendCode();
      }
      enter();
    });

  const signUp = () =>
    step(async () => {
      // The name is printed on the declaration, so there is no signing up without one.
      if (!name.trim()) throw new Error(t('auth.nameRequired'));
      const { data } = await auth.signUp.email({ name: name.trim(), email: email.trim(), password });
      if (data?.token) return enter();
      // Verification is required before the first sign-in. The code is asked for
      // here rather than left to Neon's send-on-sign-up: with the email webhook
      // on, that path neither sends nor calls the webhook. Switching to the code
      // step first means a failed request still lands where "Send a new code" is.
      setMode('verify');
      return sendCode('auth.codeSentSignUp');
    });

  const verify = (otp: string) =>
    step(async () => {
      try {
        await auth.emailOtp.verifyEmail({ email: email.trim(), otp });
      } catch (e) {
        setCode('');
        throw e;
      }
      const session = await auth.getSession();
      if (session.data?.user) return enter();
      setMode('sign-in');
      setInfo(t('auth.verified'));
    });

  const titles: Record<Mode, string> = {
    'sign-in': t('auth.signIn'),
    'sign-up': t('auth.createTitle'),
    verify: t('auth.checkEmail'),
    forgot: t('auth.resetTitle'),
    reset: t('auth.resetTitle'),
  };
  const title = titles[mode];
  const submitLabel: Record<Exclude<Mode, 'verify'>, string> = {
    'sign-in': t('auth.signIn'),
    'sign-up': t('auth.create'),
    forgot: t('auth.sendResetCode'),
    reset: t('auth.resetPassword'),
  };
  const askEmail = mode === 'sign-in' || mode === 'sign-up' || mode === 'forgot';
  const askPassword = mode === 'sign-in' || mode === 'sign-up';
  const askCode = mode === 'verify' || mode === 'reset';

  return (
    <div className="app auth">
      <div className="welcome">
        <h1>{title}</h1>
        {(mode === 'sign-in' || mode === 'sign-up') && <p className="lead">{t('auth.tagline')}</p>}
        {mode === 'forgot' && <p className="lead">{t('auth.resetLead')}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // No submit control renders in 'verify' mode (see the button
            // below), so reaching here at all means one of the other four.
            if (mode === 'sign-in') void signIn();
            else if (mode === 'sign-up') void signUp();
            else if (mode === 'forgot') void forgot();
            else void reset();
          }}
        >
          {info && (
            <div className="notice" style={{ marginBottom: 6 }}>
              {info}
            </div>
          )}

          {mode === 'sign-up' && (
            <>
              <label htmlFor="name">{t('auth.name')}</label>
              <input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </>
          )}
          {askEmail && (
            <>
              <label htmlFor="email">{t('auth.email')}</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </>
          )}
          {askPassword && (
            <>
              <label htmlFor="password">{t('auth.password')}</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}
          {askCode && (
            <>
              <label>{t('auth.code')}</label>
              <OtpInput
                label={t('auth.code')}
                digitLabel={(n) => t('auth.codeDigit', { n })}
                value={code}
                onChange={setCode}
                onComplete={(otp) => (mode === 'verify' ? void verify(otp) : newPasswordInput.current?.focus())}
                disabled={busy}
              />
            </>
          )}
          {mode === 'reset' && (
            <>
              <label htmlFor="new-password">{t('auth.newPassword')}</label>
              <input
                id="new-password"
                ref={newPasswordInput}
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}

          <ErrorNote message={error} />
          {mode !== 'verify' && (
            <button
              className="btn primary block"
              style={{ marginTop: 18 }}
              disabled={busy || (mode === 'reset' && code.length < 6)}
            >
              {busy ? t('auth.wait') : submitLabel[mode]}
            </button>
          )}

          <div style={{ display: 'flex', gap: 18, marginTop: 16 }}>
            {mode === 'sign-in' && (
              <>
                <button type="button" className="link" onClick={() => setMode('sign-up')}>
                  {t('auth.toSignUp')}
                </button>
                <button type="button" className="link" onClick={() => setMode('forgot')}>
                  {t('auth.forgot')}
                </button>
              </>
            )}
            {mode === 'sign-up' && (
              <button type="button" className="link" onClick={() => setMode('sign-in')}>
                {t('auth.toSignIn')}
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" className="link" onClick={() => setMode('sign-in')}>
                {t('common.back')}
              </button>
            )}
            {mode === 'reset' && (
              <>
                <button type="button" className="link" disabled={busy} onClick={() => step(requestReset)}>
                  {t('auth.sendCode')}
                </button>
                <button type="button" className="link" onClick={() => setMode('forgot')}>
                  {t('common.back')}
                </button>
              </>
            )}
            {mode === 'verify' && (
              <>
                <button type="button" className="link" disabled={busy || !email.trim()} onClick={() => step(sendCode)}>
                  {t('auth.sendCode')}
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => (verifyEmail ? router.replace('/') : setMode('sign-in'))}
                >
                  {t('common.back')}
                </button>
              </>
            )}
          </div>
        </form>
        <LanguagePicker />
      </div>
    </div>
  );
}
