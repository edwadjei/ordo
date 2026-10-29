'use client';
import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import type { User } from '@ordo/client';
import { api } from '../lib/workspace';
import { nameProblem } from '../lib/views';

/** "Your name" in Settings: used by My Day's greeting and the avatar. */
export function NameSettings({
  user,
  onSaved,
}: {
  user: User;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(user.displayName),
    [saved, setSaved] = useState(user.displayName),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const problem = nameProblem(name);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.updateMe({ displayName: name.trim() || null });
      setName(result.user.displayName);
      setSaved(result.user.displayName);
      setMessage(result.user.displayName ? 'Name saved.' : 'Name cleared.');
      await onSaved().catch(() => {});
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="name-settings" onSubmit={submit}>
      <label>
        Your name
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setMessage('');
            setError('');
          }}
          maxLength={80}
          autoComplete="name"
          placeholder="What should Ordo call you?"
          aria-describedby="name-hint"
          aria-invalid={!!error || undefined}
        />
      </label>
      <p id="name-hint" className="field-hint">
        Used for your greeting on My Day. Leave it empty to be greeted without a
        name. Never a phone number or email.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          className="secondary"
          disabled={busy || name.trim() === saved.trim()}
        >
          {busy ? 'Saving…' : 'Save name'}
        </button>
        {message && (
          <span className="saved" role="status">
            <Check size={13} aria-hidden="true" /> {message}
          </span>
        )}
      </div>
    </form>
  );
}
