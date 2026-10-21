'use client';
import { useEffect, useRef, useState } from 'react';
import type { AudioSettings } from '@ordo/client';
import { api } from '../lib/workspace';
import { Dialog } from './dialog';
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
    initial?.provider || 'local_whisper',
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
        if (active.current) setError((cause as Error).message);
      })
      .finally(() => {
        if (active.current) setLoading(false);
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
                <option value="local_whisper">
                  Local Whisper — this Mac / server
                </option>
                <option value="openai">OpenAI — my API key</option>
              </select>
            </label>
            {provider === 'local_whisper' ? (
              <p className="muted">
                {saved?.localAvailable
                  ? 'Local Whisper is ready on this Mac / server. Audio is processed here, including when you use Ordo from your phone.'
                  : 'Local Whisper is not available on this Mac / server yet.'}{' '}
                This does not run on your phone.
              </p>
            ) : (
              <>
                <p className="muted">
                  Your audio is sent to OpenAI to transcribe. Your API key is
                  encrypted on the Ordo server and never stored in this browser.
                </p>
                <p className="muted small">
                  Estimated $0.003/minute (~$0.18/hour), billed to your OpenAI
                  account.{' '}
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
                {saved.configured
                  ? 'Voice transcription is configured.'
                  : 'Voice transcription: Coming soon until configured.'}
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
