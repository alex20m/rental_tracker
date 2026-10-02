'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/client/authClient';
import { ErrorNote, Icon } from '@/components/ui';

type Mode = 'sign-in' | 'sign-up' | 'verify';

type AuthResult = { data?: unknown; error?: { message?: string; status?: number; code?: string } | null };

const messageOf = (r: AuthResult, fallback: string) => r.error?.message || fallback;

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
      setError((e as Error).message || 'Something went wrong.');
    }
    setBusy(false);
  };

  const sendCode = async () => {
    const r = (await auth.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'email-verification' })) as AuthResult;
    if (r.error) throw new Error(messageOf(r, 'Could not send a code.'));
    setInfo(`We sent a code to ${email.trim()}.`);
  };

  const enter = () => {
    router.replace('/');
    router.refresh();
  };

  const signIn = () =>
    step(async () => {
      const r = (await auth.signIn.email({ email: email.trim(), password })) as AuthResult;
      if (r.error?.code === 'EMAIL_NOT_VERIFIED' || r.error?.status === 403) {
        setMode('verify');
        await sendCode();
        return;
      }
      if (r.error) throw new Error(messageOf(r, 'Could not sign in.'));
      enter();
    });

  const signUp = () =>
    step(async () => {
      const r = (await auth.signUp.email({ name: name.trim() || email.trim(), email: email.trim(), password })) as AuthResult & {
        data?: { token?: string | null } | null;
      };
      if (r.error) throw new Error(messageOf(r, 'Could not create the account.'));
      if (r.data?.token) return enter();
      // Verification required before the first sign-in; the code is sent on sign-up.
      setMode('verify');
      setInfo(`We sent a code to ${email.trim()}. Enter it to finish creating your account.`);
    });

  const verify = () =>
    step(async () => {
      const r = (await auth.emailOtp.verifyEmail({ email: email.trim(), otp: code.trim() })) as AuthResult;
      if (r.error) throw new Error(messageOf(r, 'That code did not work.'));
      const session = (await auth.getSession()) as AuthResult & { data?: { user?: unknown } | null };
      if (session.data?.user) return enter();
      setMode('sign-in');
      setInfo('Email verified. Sign in to continue.');
    });

  const title = mode === 'sign-in' ? 'Welcome back' : mode === 'sign-up' ? 'Create your account' : 'Check your email';

  return (
    <div className="app auth">
      <div className="welcome">
        <div className="logo">{Icon.building}</div>
        <div>
          <h1>{title}</h1>
          <p className="lead" style={{ marginTop: 8 }}>
            Rent, costs and tax declarations for your rental apartments.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (mode === 'sign-in' ? signIn() : mode === 'sign-up' ? signUp() : verify());
          }}
        >
          {info && (
            <div className="notice" style={{ marginBottom: 6 }}>
              {info}
            </div>
          )}

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
          <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Verify'}
          </button>

          <div style={{ display: 'flex', gap: 18, marginTop: 16 }}>
            {mode === 'sign-in' && (
              <button type="button" className="link" onClick={() => setMode('sign-up')}>
                New here? Create an account
              </button>
            )}
            {mode === 'sign-up' && (
              <button type="button" className="link" onClick={() => setMode('sign-in')}>
                Have an account? Sign in
              </button>
            )}
            {mode === 'verify' && (
              <>
                <button type="button" className="link" disabled={busy || !email.trim()} onClick={() => step(sendCode)}>
                  Send a new code
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => (verifyEmail ? router.replace('/') : setMode('sign-in'))}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
