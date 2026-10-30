'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import {
  RequestError,
  type AgentActivity,
  type AgentScope,
  type AgentTokenRecord,
  type HomeSnapshot,
} from '@ordo/client';
import { api } from '../lib/workspace';
import {
  activityTarget,
  activityText,
  agentCan,
  agentCannot,
  expiresAt,
  expiryChoices,
  keySafetyLine,
  keyStatus,
  mcpAddress,
  scopeLabel,
  setupSteps,
  type ExpiryChoice,
} from '../lib/agents';
import { Dialog } from './dialog';

const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="secondary copy-button"
      aria-label={label}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 2500);
        })
      }
    >
      {done ? (
        <>
          <Check size={13} aria-hidden="true" /> Copied
        </>
      ) : (
        <>
          <Copy size={13} aria-hidden="true" /> Copy
        </>
      )}
    </button>
  );
}

/** A read-only value with its own label and a Copy button beside it. */
function CopyField({
  id,
  label,
  value,
  copyLabel,
}: {
  id: string;
  label: string;
  value: string;
  copyLabel: string;
}) {
  return (
    <div className="copy-block">
      <label htmlFor={id}>{label}</label>
      <div className="copy-field">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
          spellCheck={false}
          autoComplete="off"
        />
        <CopyButton text={value} label={copyLabel} />
      </div>
    </div>
  );
}

/**
 * The setup steps, each command with its own Copy. No command holds the
 * key, so nothing here can leak it into a terminal or saved settings.
 */
function SetupSteps({ origin }: { origin: string }) {
  return (
    <section className="assistants-connect" aria-label="Connect Claude Code">
      <h3>Connect Claude Code</h3>
      <ol className="setup-steps">
        {setupSteps(origin).map((step, index) => (
          <li key={index}>
            <p>{step.text}</p>
            {step.command && (
              <div className="command-block">
                <pre tabIndex={0} aria-label={`Step ${index + 1} command`}>
                  <code>{step.command}</code>
                </pre>
                <CopyButton
                  text={step.command}
                  label={`Copy the step ${index + 1} command`}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="key-safety">
        <ShieldAlert size={13} aria-hidden="true" />
        <span>{keySafetyLine}</span>
      </p>
    </section>
  );
}

/**
 * Settings › Connected assistants: access keys for AI assistants that use
 * Ordo through MCP or the API. A new key is shown once, here, and kept only
 * in this screen's memory; Ordo stores just a fingerprint of it.
 */
export function AssistantsDialog({
  data,
  onClose,
  onTokens,
  onOpenTask,
  onOpenNote,
  onOpenPlace,
}: {
  data: HomeSnapshot;
  onClose: () => void;
  /** The key list changed (for "By agent" names elsewhere). */
  onTokens: (tokens: AgentTokenRecord[]) => void;
  onOpenTask: (id: string) => void;
  onOpenNote: (id: string) => void;
  /** Opens a workspace or project an assistant created. */
  onOpenPlace: (type: 'workspace' | 'project', id: string) => void;
}) {
  const origin = typeof location === 'undefined' ? '' : location.origin;
  const [tokens, setTokens] = useState<AgentTokenRecord[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<{ token: string; name: string } | null>(
    null,
  );
  const [activityFor, setActivityFor] = useState<string | null>(null);
  async function load() {
    try {
      const list = await api.agentTokens();
      setTokens(list);
      onTokens(list);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const close = () => {
    // The key exists only in this state: closing forgets it.
    setShown(null);
    onClose();
  };
  if (shown)
    return (
      <Dialog
        title="Your new key"
        eyebrow="CONNECTED ASSISTANTS"
        onClose={close}
      >
        <p className="key-once" role="alert">
          <ShieldAlert size={15} aria-hidden="true" />
          <span>
            Copy it now. <strong>You won’t see this key again</strong>; Ordo
            keeps only a fingerprint of it. Anyone with it can use Ordo as “
            {shown.name}” until you revoke it.
          </span>
        </p>
        <CopyField
          id="new-key"
          label={`Access key for ${shown.name}`}
          value={shown.token}
          copyLabel="Copy the key"
        />
        <p className="field-hint">
          Paste it only where step 1 asks for a password.
        </p>
        <SetupSteps origin={origin} />
        <div className="form-actions">
          <button className="primary" onClick={() => setShown(null)}>
            I’ve copied it
          </button>
        </div>
      </Dialog>
    );
  const activeCount = tokens?.filter((t) => keyStatus(t) === 'active').length;
  return (
    <Dialog title="Connected assistants" eyebrow="SETTINGS" onClose={close}>
      <p className="muted">
        Let an AI assistant such as Claude Code or Claude Desktop read and add
        to your Ordo through MCP. Each assistant gets its own key, which you can
        revoke at any time, and everything it does is listed under Activity.
      </p>
      <div className="agent-abilities">
        <div>
          <h4>An assistant can</h4>
          <ul>
            {agentCan.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>It can’t</h4>
          <ul>
            {agentCannot.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <CopyField
        id="mcp-address"
        label="MCP address"
        value={mcpAddress(origin)}
        copyLabel="Copy the MCP address"
      />
      <SetupSteps origin={origin} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="assistant-keys" aria-label="Access keys">
        <div className="section-heading">
          <h3>Access keys</h3>
          {!creating && (
            <button
              className="text-button"
              onClick={() => setCreating(true)}
              disabled={activeCount !== undefined && activeCount >= 20}
            >
              <Plus size={12} aria-hidden="true" /> Create a key
            </button>
          )}
        </div>
        {creating && (
          <CreateKey
            onCancel={() => setCreating(false)}
            onCreated={async (token, name) => {
              setCreating(false);
              setShown({ token, name });
              await load();
            }}
          />
        )}
        {!tokens ? (
          <p className="muted small" role="status">
            <LoaderCircle size={12} className="spin" aria-hidden="true" />{' '}
            Loading keys…
          </p>
        ) : tokens.length ? (
          <ul className="key-list">
            {tokens.map((token) => (
              <KeyRow
                key={token.id}
                token={token}
                data={data}
                open={activityFor === token.id}
                onToggleActivity={() =>
                  setActivityFor(activityFor === token.id ? null : token.id)
                }
                onRevoked={load}
                onOpenTask={onOpenTask}
                onOpenNote={onOpenNote}
                onOpenPlace={onOpenPlace}
              />
            ))}
          </ul>
        ) : (
          <p className="section-empty">
            No keys yet. Create one for each assistant you connect.
          </p>
        )}
      </section>
    </Dialog>
  );
}

function CreateKey({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (token: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [access, setAccess] = useState<'read' | 'write'>('write');
  const [expiry, setExpiry] = useState<ExpiryChoice>('90');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const scopes: AgentScope[] =
        access === 'write' ? ['read', 'write'] : ['read'];
      const created = await api.createAgentToken({
        name: name.trim(),
        scopes,
        expiresAt: expiresAt(expiry),
      });
      await onCreated(created.token, created.record.name);
    } catch (cause) {
      setError(
        cause instanceof RequestError && cause.code === 'TOKEN_LIMIT'
          ? 'You have 20 active keys, the most allowed. Revoke one you no longer use first.'
          : (cause as Error).message,
      );
      setBusy(false);
    }
  }
  return (
    <form className="create-key" onSubmit={submit}>
      <label>
        Name
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Claude Code on my laptop"
          required
        />
      </label>
      <fieldset className="segmented-field">
        <legend>Access</legend>
        <label className="inline-check">
          <input
            type="radio"
            name="key-access"
            checked={access === 'read'}
            onChange={() => setAccess('read')}
          />
          Read only
        </label>
        <label className="inline-check">
          <input
            type="radio"
            name="key-access"
            checked={access === 'write'}
            onChange={() => setAccess('write')}
          />
          Read and write (add, edit and complete tasks and notes)
        </label>
      </fieldset>
      <label>
        Expires
        <select
          value={expiry}
          onChange={(event) => setExpiry(event.target.value as ExpiryChoice)}
        >
          {expiryChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={busy || !name.trim()}>
          <KeyRound size={14} aria-hidden="true" />
          {busy ? 'Creating…' : 'Create key'}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function KeyRow({
  token,
  data,
  open,
  onToggleActivity,
  onRevoked,
  onOpenTask,
  onOpenNote,
  onOpenPlace,
}: {
  token: AgentTokenRecord;
  data: HomeSnapshot;
  open: boolean;
  onToggleActivity: () => void;
  onRevoked: () => Promise<void>;
  onOpenTask: (id: string) => void;
  onOpenNote: (id: string) => void;
  /** Opens a workspace or project an assistant created. */
  onOpenPlace: (type: 'workspace' | 'project', id: string) => void;
}) {
  const status = keyStatus(token);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function revoke() {
    if (
      !window.confirm(
        `Revoke “${token.name}”? Any assistant using it stops working at once. This can’t be undone; you can create a new key later.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api.revokeAgentToken(token.id);
      await onRevoked();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={`key-row is-${status}`}>
      <div className="key-head">
        <Bot size={15} aria-hidden="true" />
        <strong>{token.name}</strong>
        <span className={`key-status is-${status}`}>
          {status === 'active'
            ? scopeLabel(token)
            : status === 'revoked'
              ? 'Revoked'
              : 'Expired'}
        </span>
      </div>
      <small>
        Created {when(token.createdAt)} ·{' '}
        {token.lastUsedAt
          ? `last used ${when(token.lastUsedAt)}`
          : 'never used'}
        {token.expiresAt && status === 'active'
          ? ` · expires ${when(token.expiresAt)}`
          : ''}
        {token.revokedAt ? ` · revoked ${when(token.revokedAt)}` : ''}
      </small>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="key-actions">
        <button
          className="text-button"
          aria-expanded={open}
          onClick={onToggleActivity}
        >
          {open ? 'Hide activity' : 'Activity'}
        </button>
        {status === 'active' && (
          <button
            className="text-button danger-text"
            disabled={busy}
            onClick={() => void revoke()}
          >
            {busy ? 'Revoking…' : 'Revoke'}
          </button>
        )}
      </div>
      {open && (
        <ActivityList
          tokenId={token.id}
          data={data}
          onOpenTask={onOpenTask}
          onOpenNote={onOpenNote}
          onOpenPlace={onOpenPlace}
        />
      )}
    </li>
  );
}

function ActivityList({
  tokenId,
  data,
  onOpenTask,
  onOpenNote,
  onOpenPlace,
}: {
  tokenId: string;
  data: HomeSnapshot;
  onOpenTask: (id: string) => void;
  onOpenNote: (id: string) => void;
  /** Opens a workspace or project an assistant created. */
  onOpenPlace: (type: 'workspace' | 'project', id: string) => void;
}) {
  const [entries, setEntries] = useState<AgentActivity[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  async function page(before?: string) {
    try {
      const next = await api.agentActivity({ tokenId, before });
      setEntries((current) => [...(before ? (current ?? []) : []), ...next]);
      setMore(next.length === 100);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  useEffect(() => {
    void page();
  }, [tokenId]);
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!entries)
    return (
      <p className="muted small" role="status">
        Loading activity…
      </p>
    );
  if (!entries.length) return <p className="section-empty">Nothing yet.</p>;
  return (
    <div className="activity">
      <ol aria-label="Activity, newest first">
        {entries.map((entry) => {
          const target = activityTarget(entry, data);
          const text = activityText(entry, data);
          return (
            <li key={entry.id}>
              <time dateTime={entry.createdAt}>{when(entry.createdAt)}</time>
              {target ? (
                <button
                  className="text-button inline"
                  onClick={() =>
                    target.type === 'task'
                      ? onOpenTask(target.id)
                      : target.type === 'note'
                        ? onOpenNote(target.id)
                        : onOpenPlace(target.type, target.id)
                  }
                >
                  {text}
                </button>
              ) : (
                <span>{text}</span>
              )}
            </li>
          );
        })}
      </ol>
      {more && (
        <button
          className="text-button"
          onClick={() => void page(entries.at(-1)!.createdAt)}
        >
          Show older
        </button>
      )}
    </div>
  );
}
