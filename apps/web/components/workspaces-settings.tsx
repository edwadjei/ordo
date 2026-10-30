'use client';
import { useState } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import type { HomeSnapshot, Workspace } from '@ordo/client';
import { isArchived, type PlaceAction } from '../lib/organize';

/**
 * Settings › Workspaces: every workspace, with archived ones under their
 * own filter, each with Archive or Restore and Delete permanently….
 */
export function WorkspacesSettings({
  everything,
  onAction,
}: {
  /** The snapshot with archived workspaces and projects included. */
  everything: HomeSnapshot;
  onAction: (item: Workspace, action: PlaceAction) => void;
}) {
  const [showing, setShowing] = useState<'active' | 'archived'>('active');
  const archived = everything.workspaces.filter(isArchived);
  const active = everything.workspaces.filter((w) => !isArchived(w));
  const list = showing === 'active' ? active : archived;
  const projects = (id: string) => {
    const count = everything.projects.filter(
      (p) => p.workspaceId === id,
    ).length;
    return `${count} ${count === 1 ? 'project' : 'projects'}`;
  };
  return (
    <section className="ai-settings" aria-labelledby="workspaces-heading">
      <h3 className="settings-heading" id="workspaces-heading">
        Workspaces
      </h3>
      <p className="muted">
        Archive hides a workspace and everything in it, and you can restore it
        later. Delete permanently removes it for good.
      </p>
      <div
        className="workspaces-filter"
        role="group"
        aria-label="Show workspaces"
      >
        <button
          type="button"
          aria-pressed={showing === 'active'}
          onClick={() => setShowing('active')}
        >
          Active <small>{active.length}</small>
        </button>
        <button
          type="button"
          aria-pressed={showing === 'archived'}
          onClick={() => setShowing('archived')}
        >
          Archived <small>{archived.length}</small>
        </button>
      </div>
      {list.length ? (
        <ul className="workspaces-list">
          {list.map((item) => {
            const isOld = isArchived(item);
            return (
              <li key={item.id}>
                <span
                  className="workspace-dot"
                  style={{ background: item.color }}
                  aria-hidden="true"
                />
                <span className="workspaces-list-name">
                  <strong>{item.name}</strong>
                  <small>{projects(item.id)}</small>
                </span>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`${isOld ? 'Restore' : 'Archive'} ${item.name}`}
                  onClick={() => onAction(item, isOld ? 'restore' : 'archive')}
                >
                  {isOld ? (
                    <ArchiveRestore size={13} aria-hidden="true" />
                  ) : (
                    <Archive size={13} aria-hidden="true" />
                  )}
                  {isOld ? 'Restore' : 'Archive'}
                </button>
                <button
                  type="button"
                  className="danger-button"
                  aria-label={`Delete ${item.name} permanently…`}
                  onClick={() => onAction(item, 'delete')}
                >
                  <Trash2 size={13} aria-hidden="true" />
                  Delete permanently…
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">
          {showing === 'archived'
            ? 'Nothing is archived.'
            : 'No active workspaces.'}
        </p>
      )}
    </section>
  );
}
