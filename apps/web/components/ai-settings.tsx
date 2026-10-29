'use client';
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { AiSettings, TextProvider } from '@ordo/client/capture';
import { api } from '../lib/workspace';

const labels: Record<TextProvider, string> = {
  workers_ai: 'Built-in AI',
  openai: 'OpenAI (your key)',
  anthropic: 'Anthropic (your key)',
};
const details: Record<TextProvider, string> = {
  workers_ai:
    'Included with Ordo, with nothing to set up. It runs on Ordo’s hosting provider, Cloudflare (Workers AI), and shares the free daily allowance with transcription.',
  openai:
    'Uses your own OpenAI API key, the same one transcription uses. Captures you process are sent to OpenAI and billed to your account.',
  anthropic:
    'Uses your own Anthropic API key. Captures you process are sent to Anthropic and billed to your account.',
};

/**
 * Settings › AI capture: which provider reads captures when you choose
 * Process with AI. Nothing is sent until you do.
 */
export function AiSettingsSection({
  initial,
  onChange,
}: {
  initial: AiSettings | null;
  onChange: (settings: AiSettings) => void;
}) {
  const [saved, setSaved] = useState<AiSettings | null>(initial);
  const [provider, setProvider] = useState<TextProvider>(
    initial?.textProvider || 'workers_ai',
  );
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const control = new AbortController();
    api
      .aiSettings(control.signal)
      .then((result) => {
        if (!active.current) return;
        setSaved(result);
        setProvider(result.textProvider);
        onChange(result);
      })
      .catch((cause) => {
        if (active.current && !control.signal.aborted)
          setError((cause as Error).message);
      })
      .finally(() => {
        if (active.current && !control.signal.aborted) setLoading(false);
      });
    return () => {
      active.current = false;
      control.abort();
    };
  }, []);
  const hasKey =
    provider === 'openai'
      ? saved?.hasOpenAiKey
      : provider === 'anthropic'
        ? saved?.hasAnthropicKey
        : false;
  async function save(removeApiKey = false) {
    if (!removeApiKey && apiKey.trim() && !window.isSecureContext) {
      setError('Use HTTPS to add an API key.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const key = apiKey.trim();
      const result = await api.saveAiSettings({
        textProvider: provider,
        ...(provider !== 'workers_ai' && (removeApiKey || key)
          ? {
              keyProvider: provider,
              ...(removeApiKey ? { removeApiKey: true } : { apiKey: key }),
            }
          : {}),
      });
      if (!active.current) return;
      setSaved(result);
      setProvider(result.textProvider);
      setApiKey('');
      onChange(result);
      setMessage(removeApiKey ? 'API key removed.' : 'AI settings saved.');
    } catch (cause) {
      if (active.current) setError((cause as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const dirty = provider !== saved?.textProvider || !!apiKey.trim();
  return (
    <section className="ai-settings" aria-labelledby="ai-settings-heading">
      <h3 className="settings-heading" id="ai-settings-heading">
        AI capture
      </h3>
      <p className="muted">
        Used only when you choose Process with AI on a capture. Ordo shows you
        its suggestions to review; nothing is saved until you do.
      </p>
      {loading ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : (
        <fieldset disabled={busy}>
          <label>
            AI provider
            <select
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value as TextProvider);
                setApiKey('');
                setMessage('');
              }}
            >
              {(Object.keys(labels) as TextProvider[]).map((key) => (
                <option key={key} value={key}>
                  {labels[key]}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">{details[provider]}</p>
          {provider === 'workers_ai' && saved && !saved.workersAiAvailable && (
            <p className="callout">
              Built-in AI isn’t available on this server. Choose OpenAI or
              Anthropic and add your key to process captures here.
            </p>
          )}
          {provider !== 'workers_ai' && (
            <label>
              {hasKey ? 'Replace API key' : 'API key'}
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  hasKey
                    ? provider === 'openai'
                      ? 'Your saved OpenAI key is used (also for transcription)'
                      : 'A key is saved'
                    : 'Paste your key'
                }
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={!dirty}
              onClick={() => void save()}
            >
              Save AI settings
            </button>
            {provider !== 'workers_ai' && hasKey && (
              <button
                type="button"
                className="text-button"
                onClick={() => void save(true)}
              >
                Remove key
              </button>
            )}
            {message && (
              <span className="saved" role="status">
                <Check size={13} aria-hidden="true" /> {message}
              </span>
            )}
          </div>
        </fieldset>
      )}
    </section>
  );
}
