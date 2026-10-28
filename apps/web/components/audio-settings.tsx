'use client';
import { useEffect, useRef, useState } from 'react';
import type { AudioSettings } from '@ordo/client';
import { api } from '../lib/workspace';
import { Dialog } from './dialog';
import {
  defaultProvider,
  providerLabels,
  settingsStatus,
} from '../lib/transcription';
export function AudioSettingsDialog({
  initial,
  onChange,
  onClose,
}: {
  initial: AudioSettings | null;
  onChange: (settings: AudioSettings) => void;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<AudioSettings | null>(initial);
  const [provider, setProvider] = useState<AudioSettings['provider']>(
    initial?.provider || defaultProvider,
  );
  const [apiKey, setApiKey] = useState('');
  const [secure, setSecure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    setSecure(window.isSecureContext);
    const control = new AbortController();
    api
      .audioSettings(control.signal)
      .then((result) => {
        if (!active.current) return;
        setSaved(result);
        setProvider(result.provider);
        onChange(result);
      })
      .catch((cause) => {
        // An aborted load (closing, or React re-running this effect) is not
        // an error to show; `active` alone can't tell, as it is shared.
        if (active.current && !control.signal.aborted)
          setError((cause as Error).message);
      })
      .finally(() => {
        if (active.current && !control.signal.aborted) setLoading(false);
      });
    return () => {
      active.current = false;
      control.abort();
      controller.current?.abort();
    };
  }, []);
  function close() {
    setApiKey('');
    onClose();
  }
  function apply(result: AudioSettings) {
    setSaved(result);
    setProvider(result.provider);
    setApiKey('');
    onChange(result);
  }
  async function save(removeApiKey = false) {
    if (!removeApiKey && apiKey.trim() && !secure) {
      setError('Use HTTPS to add an API key.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    const control = new AbortController();
    controller.current = control;
    try {
      const result = await api.saveAudioSettings(
        {
          provider,
          ...(removeApiKey
            ? { removeApiKey: true }
            : apiKey.trim()
              ? { apiKey: apiKey.trim() }
              : {}),
        },
        control.signal,
      );
      if (active.current) {
        apply(result);
        setMessage(removeApiKey ? 'API key removed.' : 'Audio settings saved.');
      }
    } catch (cause) {
      if (active.current) setError((cause as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function testConnection() {
    setBusy(true);
    setError('');
    setMessage('');
    const control = new AbortController();
    controller.current = control;
    try {
      const result = await api.testAudioSettings(control.signal);
      if (active.current) {
        if (result.ok) setMessage(result.message);
        else setError(result.message);
      }
    } catch (cause) {
      if (active.current) setError((cause as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const dirty = provider !== saved?.provider || !!apiKey;
  return (
    <Dialog title="Make voice work for you." eyebrow="SETTINGS" onClose={close}>
      <div className="audio-settings">
        <p className="muted">
          Choose how Ordo turns your voice into text. Audio is used to
          transcribe, then discarded by Ordo.
        </p>
        {loading ? (
          <p className="muted" role="status">
            Loading your settings…
          </p>
        ) : (
          <fieldset disabled={busy}>
            <label>
              Transcription provider
              <select
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value as AudioSettings['provider']);
                  setApiKey('');
                  setMessage('');
                  setError('');
                }}
              >
                <option value="workers_ai">{providerLabels.workers_ai}</option>
                <option value="openai">{providerLabels.openai}</option>
              </select>
            </label>
            {provider === 'workers_ai' ? (
              <>
                <p className="muted">
                  Nothing to set up. Your audio stays within Cloudflare, which
                  runs Whisper to transcribe it.
                </p>
                <p className="muted small">
                  Free for about 214 minutes of audio a day. If that runs out,
                  transcription pauses until midnight UTC; you are never
                  charged.
                </p>
                {saved && !saved.workersAiAvailable && (
                  <p className="notice small" role="status">
                    Cloudflare transcription isn’t available on this server.
                    Choose OpenAI and add your key to transcribe here.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="muted">
                  Your audio is sent to OpenAI to transcribe, and OpenAI’s
                  charges and data policy apply. Your API key is encrypted on
                  the Ordo server and never stored in this browser.
                </p>
                <p className="muted small">
                  About $0.003 a minute (~$0.18 an hour), billed to your own
                  OpenAI account.{' '}
                  <a
                    href="https://developers.openai.com/api/docs/pricing"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Current pricing
                  </a>
                </p>
                <label>
                  OpenAI API key
                  <input
                    type="password"
                    disabled={!secure}
                    name="audio-provider-api-key"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="none"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setMessage('');
                    }}
                    placeholder={
                      saved?.hasApiKey
                        ? 'A key is saved. Enter a replacement.'
                        : 'Enter your API key'
                    }
                    maxLength={512}
                  />
                </label>
                {!secure && (
                  <p className="muted small">Use HTTPS to add an API key.</p>
                )}
                {saved?.hasApiKey && (
                  <button
                    type="button"
                    className="danger-link"
                    disabled={busy}
                    onClick={() => void save(true)}
                  >
                    Remove saved API key
                  </button>
                )}
              </>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="primary"
                disabled={busy || !saved || (!secure && !!apiKey.trim())}
                onClick={() => void save()}
              >
                {busy ? 'Please wait…' : 'Save audio settings'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || !saved?.configured || dirty}
                onClick={() => void testConnection()}
              >
                Test connection
              </button>
            </div>
            {dirty && (
              <p className="muted small">Save your choice before testing it.</p>
            )}
            {saved && !dirty && (
              <p className="saved" role="status">
                {settingsStatus(saved)}
              </p>
            )}
          </fieldset>
        )}
        {message && (
          <p className="saved" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="privacy-note">
          On-device transcription for native iOS and Android: Coming soon. Tasks
          and notes work without configuring voice.
        </p>
      </div>
    </Dialog>
  );
}
