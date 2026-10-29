'use client';
import { useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import type { Container } from '@ordo/client';
import { api } from '../lib/workspace';
import { isArchived } from '../lib/organize';

/** Archive (hide, keep everything) or Restore a workspace or project. */
export function ArchiveControl({
  kind,
  item,
  onDone,
}: {
  kind: Container;
  item: { id: string; name: string; revision: number };
  onDone: (archived: boolean) => Promise<unknown> | void;
}) {
  const noun = kind === 'workspaces' ? 'workspace' : 'project';
  const archived = isArchived(item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      const data = { archived: !archived, expectedRevision: item.revision };
      if (kind === 'workspaces') await api.updateWorkspace(item.id, data);
      else await api.updateProject(item.id, data);
      await onDone(!archived);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="archive-control">
      <h3 className="settings-heading">{archived ? 'Archived' : 'Archive'}</h3>
      <p className="muted">
        {archived
          ? `This ${noun} is hidden from My Day, Inbox and pickers. Restoring brings it and everything in it back.`
          : `Hides this ${noun} and everything in it from My Day, Inbox and pickers. Nothing is lost, and you can restore it from Archived.`}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void toggle()}
      >
        {archived ? (
          <>
            <ArchiveRestore size={14} aria-hidden="true" /> Restore {noun}
          </>
        ) : (
          <>
            <Archive size={14} aria-hidden="true" /> Archive {noun}
          </>
        )}
      </button>
    </section>
  );
}
