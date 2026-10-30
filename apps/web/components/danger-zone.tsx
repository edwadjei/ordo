'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react';
import { RequestError, type Container, type DeletePreview } from '@ordo/client';
import { api } from '../lib/workspace';
import { confirmsName, deleteSummary } from '../lib/organize';
import { Dialog } from './dialog';

/**
 * Delete permanently, kept apart from everything else: it shows what will
 * go, asks for the exact name, and only then enables the button. There is
 * no undo; archiving is the reversible choice.
 */
export function DangerZone({
  kind,
  item,
  blocked,
  onDeleted,
  startOpen = false,
  onCancel,
}: {
  kind: Container;
  item: { id: string; name: string; revision: number };
  /** Why deleting isn't possible here (the last workspace), if so. */
  blocked?: string;
  onDeleted: () => Promise<unknown> | void;
  /** Go straight to the preview and the name to type. */
  startOpen?: boolean;
  /** Cancel leaves instead of folding the section back. */
  onCancel?: () => void;
}) {
  const noun = kind === 'workspaces' ? 'workspace' : 'project';
  const [open, setOpen] = useState(startOpen);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || blocked) return;
    const control = new AbortController();
    setPreview(null);
    api
      .deletePreview(kind, item.id, control.signal)
      .then((result) => {
        if (!control.signal.aborted) setPreview(result);
      })
      .catch((cause) => {
        if (!control.signal.aborted) setError((cause as Error).message);
      });
    return () => control.abort();
  }, [open, kind, item.id, blocked]);
  const ready = !!preview && confirmsName(typed, item.name) && !busy;
  async function remove() {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await api.deletePermanently(kind, item.id, {
        confirmName: typed,
        expectedRevision: item.revision,
      });
      await onDeleted();
    } catch (cause) {
      const code = cause instanceof RequestError ? cause.code : '';
      setError(
        code === 'CONFIRM_NAME_MISMATCH'
          ? `Type the ${noun}’s name exactly as shown.`
          : code === 'LAST_WORKSPACE'
            ? 'This is your only workspace, so it can’t be deleted.'
            : cause instanceof RequestError && cause.status === 409
              ? `This ${noun} changed elsewhere. Close this and open it again before deleting.`
              : (cause as Error).message,
      );
      setBusy(false);
    }
  }
  const confirmId = `confirm-${kind}-${item.id}`;
  return (
    <section className="danger-zone" aria-labelledby={`${confirmId}-title`}>
      <h3 id={`${confirmId}-title`}>
        <AlertTriangle size={14} aria-hidden="true" /> Delete permanently
      </h3>
      {blocked ? (
        <p className="muted">{blocked}</p>
      ) : !open ? (
        <>
          <p className="muted">
            Removes this {noun} and everything in it for good. To keep things
            but hide them, archive instead.
          </p>
          <button
            type="button"
            className="danger-button"
            onClick={() => setOpen(true)}
          >
            Delete {noun}…
          </button>
        </>
      ) : (
        <>
          {preview ? (
            <p className="delete-summary" role="status">
              <strong>{deleteSummary(preview)}</strong> This can’t be undone.
            </p>
          ) : (
            !error && (
              <p className="muted" role="status">
                <LoaderCircle size={12} className="spin" aria-hidden="true" />{' '}
                Counting what would be deleted…
              </p>
            )
          )}
          <label htmlFor={confirmId}>
            Type <strong className="confirm-name">{item.name}</strong> to
            confirm
          </label>
          <input
            id={confirmId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={
              typed !== '' && !confirmsName(typed, item.name) ? true : undefined
            }
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="danger-button solid"
              disabled={!ready}
              onClick={() => void remove()}
            >
              <Trash2 size={14} aria-hidden="true" />
              {busy ? 'Deleting…' : `Delete ${noun} permanently`}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (onCancel) return onCancel();
                setOpen(false);
                setTyped('');
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Delete permanently…, opened from an options menu: straight to the confirmation. */
export function DeletePlaceDialog({
  kind,
  item,
  blocked,
  onClose,
  onDeleted,
}: {
  kind: Container;
  item: { id: string; name: string; revision: number };
  blocked?: string;
  onClose: () => void;
  onDeleted: () => Promise<unknown> | void;
}) {
  return (
    <Dialog
      title={item.name}
      eyebrow={kind === 'workspaces' ? 'DELETE WORKSPACE' : 'DELETE PROJECT'}
      onClose={onClose}
    >
      <DangerZone
        kind={kind}
        item={item}
        blocked={blocked}
        onDeleted={onDeleted}
        startOpen
        onCancel={onClose}
      />
    </Dialog>
  );
}
