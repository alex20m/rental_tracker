'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAuthError } from '@neondatabase/auth/next';
import { authClient } from '@/lib/client/authClient';
import { useI18n } from '@/components/I18nProvider';
import LanguagePicker from '@/components/LanguagePicker';
import { ErrorNote, OtpInput } from '@/components/ui';

type Mode = 'sign-in' | 'sign-up' | 'verify';

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

  const sendCode = async () => {
    await auth.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'email-verification' });
    setInfo(t('auth.codeSent', { email: email.trim() }));
  };

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
      // Verification required before the first sign-in; the code is sent on sign-up.
      setMode('verify');
      setInfo(t('auth.codeSentSignUp', { email: email.trim() }));
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

  const title =
    mode === 'sign-in' ? t('auth.signIn') : mode === 'sign-up' ? t('auth.createTitle') : t('auth.checkEmail');

  return (
    <div className="app auth">
      <div className="welcome">
        <h1>{title}</h1>
        {mode !== 'verify' && <p className="lead">{t('auth.tagline')}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // No submit control renders in 'verify' mode (see the button
            // below), so reaching here at all means 'sign-in' or 'sign-up'.
            if (mode === 'sign-in') void signIn();
            else void signUp();
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
          {mode !== 'verify' && (
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
          {mode !== 'verify' ? (
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
          ) : (
            <>
              <label>{t('auth.code')}</label>
              <OtpInput
                label={t('auth.code')}
                digitLabel={(n) => t('auth.codeDigit', { n })}
                value={code}
                onChange={setCode}
                onComplete={(otp) => void verify(otp)}
                disabled={busy}
              />
            </>
          )}

          <ErrorNote message={error} />
          {mode !== 'verify' && (
            <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>
              {busy ? t('auth.wait') : mode === 'sign-in' ? t('auth.signIn') : t('auth.create')}
            </button>
          )}

          <div style={{ display: 'flex', gap: 18, marginTop: 16 }}>
            {mode === 'sign-in' && (
              <button type="button" className="link" onClick={() => setMode('sign-up')}>
                {t('auth.toSignUp')}
              </button>
            )}
            {mode === 'sign-up' && (
              <button type="button" className="link" onClick={() => setMode('sign-in')}>
                {t('auth.toSignIn')}
              </button>
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
