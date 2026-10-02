'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAuthError } from '@neondatabase/auth/next';
import { authClient } from '@/lib/client/authClient';
import { ErrorNote } from '@/components/ui';

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
  const params = useSearchParams();
  const verifyEmail = params.get('verify');

  const [mode, setMode] = useState<Mode>(verifyEmail ? 'verify' : 'sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(verifyEmail ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(verifyEmail ? 'Press “Send a new code”, then enter the code from the email.' : '');

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
    setInfo(`We sent a code to ${email.trim()}.`);
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
      const { data } = await auth.signUp.email({ name: name.trim() || email.trim(), email: email.trim(), password });
      if (data?.token) return enter();
      // Verification required before the first sign-in; the code is sent on sign-up.
      setMode('verify');
      setInfo(`We sent a code to ${email.trim()}. Enter it to finish creating your account.`);
    });

  const verify = () =>
    step(async () => {
      await auth.emailOtp.verifyEmail({ email: email.trim(), otp: code.trim() });
      const session = await auth.getSession();
      if (session.data?.user) return enter();
      setMode('sign-in');
      setInfo('Email verified. Sign in to continue.');
    });

  return (
    <div className="app auth">
      <header className="topbar">
        <div>
          <h1>Rental Tracker</h1>
          <div className="sub">Rent, costs and tax declarations for your rental apartments</div>
        </div>
      </header>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void (mode === 'sign-in' ? signIn() : mode === 'sign-up' ? signUp() : verify());
        }}
      >
        <h2>{mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create an account' : 'Verify your email'}</h2>
        {info && <div className="note">{info}</div>}

        {mode === 'sign-up' && (
          <>
            <label htmlFor="name">Name</label>
            <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          readOnly={mode === 'verify' && !!verifyEmail}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== 'verify' ? (
          <>
            <label htmlFor="password">Password</label>
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
            <label htmlFor="code">Code from the email</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        )}

        <ErrorNote message={error} />
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy}>
          {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Verify'}
        </button>

        <div className="row" style={{ marginTop: 10 }}>
          {mode === 'sign-in' && (
            <button type="button" className="btn" onClick={() => setMode('sign-up')}>
              New here? Create an account
            </button>
          )}
          {mode === 'sign-up' && (
            <button type="button" className="btn" onClick={() => setMode('sign-in')}>
              Have an account? Sign in
            </button>
          )}
          {mode === 'verify' && (
            <>
              <button type="button" className="btn" disabled={busy || !email.trim()} onClick={() => step(sendCode)}>
                Send a new code
              </button>
              <button type="button" className="btn" onClick={() => (verifyEmail ? router.replace('/') : setMode('sign-in'))}>
                Back
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
