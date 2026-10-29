'use client';
import { ThemeSelector } from './theme-selector';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Leaf } from 'lucide-react';
import type { AppCapabilities } from '@ordo/client';
import { api } from '../lib/workspace';
import {
  normalizeSignInCode,
  signInCodeLength,
  signInCodeProblem,
} from '../lib/sign-in-code';
export function Auth({
  onSuccess,
  initialError,
}: {
  onSuccess: () => Promise<unknown>;
  initialError: string;
}) {
  const [contact, setContact] = useState('');
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    retryAt: number;
    expiresAt: number;
  } | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);
  const [capabilities, setCapabilities] = useState<AppCapabilities | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    api
      .capabilities()
      .then((value) => {
        if (active) setCapabilities(value);
      })
      .catch(() => {
        if (active)
          setError(
            'Could not check sign-in availability. Reload to try again.',
          );
      });
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(clock);
    };
  }, []);
  const channelAvailable = contact.includes('@')
    ? capabilities?.otp.email
    : capabilities?.otp.sms;
  const seconds = challenge
    ? Math.max(0, Math.ceil((challenge.retryAt - now) / 1000))
    : 0;
  const expired = challenge && now >= challenge.expiresAt;
  async function sendCode() {
    const result = await api.requestOtp(contact.trim());
    const time = Date.now();
    setNow(time);
    setCode('');
    setCodeError('');
    setChallenge({
      challengeId: result.challengeId,
      retryAt: time + result.retryAfterSeconds * 1000,
      expiresAt: time + result.expiresInSeconds * 1000,
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setError('');
    if (challenge) {
      const problem = signInCodeProblem(code);
      setCodeError(problem);
      if (problem) {
        codeInput.current?.focus();
        return;
      }
    }
    setBusy(true);
    try {
      if (challenge) {
        await api.verifyOtp({
          challengeId: challenge.challengeId,
          code,
          displayName: String(fields.get('name') || '').trim() || undefined,
        });
      } else {
        await sendCode();
        return;
      }
      form.reset();
      await onSuccess();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-art">
        <div className="brand">
          ordo<span>.</span>
        </div>
        <div>
          <Leaf size={28} strokeWidth={1.3} />
          <h1>
            Make room for <br />
            what matters.
          </h1>
          <p>
            A little less organizing.
            <br />A little more getting things done.
          </p>
        </div>
        <small>Your thoughts. Your space. Your next step.</small>
      </div>
      <section className="auth-form">
        <ThemeSelector />
        <div className="eyebrow">FROM THOUGHT TO DONE</div>
        <h2>{challenge ? 'Check your messages.' : 'A calmer way in.'}</h2>
        <p className="muted">
          {challenge
            ? `Enter the six-digit code sent to ${contact}.`
            : 'Enter your email or Ghana phone number. We’ll send a sign-in code.'}
        </p>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {challenge ? (
              <>
                <label>
                  Sign-in code
                  <input
                    key={challenge.challengeId}
                    ref={codeInput}
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => {
                      const next = normalizeSignInCode(event.target.value);
                      setCode(next);
                      if (codeError && next.length === signInCodeLength)
                        setCodeError('');
                    }}
                    autoFocus
                    placeholder="000000"
                    aria-invalid={codeError ? true : undefined}
                    aria-describedby={
                      codeError ? 'otp-error otp-help' : 'otp-help'
                    }
                  />
                </label>
                {codeError && (
                  <p className="error" id="otp-error" role="alert">
                    {codeError}
                  </p>
                )}
                <p className="muted small" id="otp-help">
                  {expired
                    ? 'This code has expired. Request another below.'
                    : 'Your code can be used once.'}
                </p>
                <label>
                  Your name{' '}
                  <span className="small">Optional for a new account</span>
                  <input name="name" autoComplete="name" maxLength={80} />
                </label>
              </>
            ) : (
              <label>
                Email or Ghana phone number
                <input
                  name="contact"
                  type="text"
                  autoComplete="username"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  maxLength={254}
                  required
                  placeholder="you@example.com or +233…"
                />
              </label>
            )}
            {(error || initialError) && (
              <p className="error" role="alert">
                {error || initialError}
              </p>
            )}
            {!challenge &&
              capabilities &&
              contact.trim() &&
              !channelAvailable && (
                <p className="muted" role="status">
                  {contact.includes('@') ? 'Email' : 'SMS'} sign-in: Coming
                  soon.
                </p>
              )}
            <button
              className="primary wide"
              disabled={
                busy ||
                (!challenge ? !contact.trim() || !channelAvailable : !!expired)
              }
            >
              {busy
                ? 'Please wait…'
                : challenge
                  ? 'Verify and continue'
                  : 'Send sign-in code'}
              <ArrowRight size={16} />
            </button>
          </fieldset>
        </form>
        {challenge && (
          <div className="auth-switch">
            <button
              disabled={busy || seconds > 0}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await sendCode();
                } catch (cause) {
                  setError((cause as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {seconds > 0 ? `Resend in ${seconds}s` : 'Send another code'}
            </button>
            <br />
            <button
              disabled={busy}
              onClick={() => {
                setChallenge(null);
                setCode('');
                setCodeError('');
                setError('');
              }}
            >
              Use a different email or phone
            </button>
          </div>
        )}
        <p className="privacy-note">
          Your tasks and notes, in one personal workspace.
        </p>
      </section>
    </main>
  );
}
