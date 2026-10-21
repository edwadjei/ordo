'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Leaf } from 'lucide-react';
import { api } from '../lib/workspace';
export function Auth({
  onSuccess,
  initialError,
}: {
  onSuccess: () => Promise<unknown>;
  initialError: string;
}) {
  const [register, setRegister] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const credentials = {
        email: String(data.get('email')),
        password: String(data.get('password')),
      };
      if (register)
        await api.register({
          ...credentials,
          displayName: String(data.get('name')),
        });
      else await api.login(credentials);
      form.reset();
      await onSuccess();
    } catch (error) {
      setError((error as Error).message);
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
            Make room for
            <br />
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
        <div className="eyebrow">FROM THOUGHT TO DONE</div>
        <h2>{register ? 'A calmer place to start.' : 'Welcome back.'}</h2>
        <p className="muted">
          {register
            ? 'Create your personal workspace. No AI key needed.'
            : 'Pick up where you left off.'}
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                placeholder="Edward Adjei"
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={12}
              maxLength={128}
              placeholder="At least 12 characters"
            />
          </label>
          {(error || initialError) && (
            <p className="error" role="alert">
              {error || initialError}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy
              ? 'Opening your workspace…'
              : register
                ? 'Create workspace'
                : 'Sign in'}
            <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? 'Already have an account?' : 'New to Ordo?'}{' '}
          <button
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {register ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <p className="privacy-note">
          A personal workspace for tasks and notes.
          <br />
          AI processing is not enabled in this first build.
        </p>
      </section>
    </main>
  );
}
