'use client';
import type { Workspace } from '@ordo/client';
import { Dialog } from './dialog';
import { ArchiveControl } from './archive-control';
import { DangerZone } from './danger-zone';

/** A workspace's settings: archive or restore it, or delete it permanently. */
export function WorkspaceSettingsDialog({
  workspace,
  lastWorkspace,
  onClose,
  onArchived,
  onDeleted,
}: {
  workspace: Workspace;
  lastWorkspace: boolean;
  onClose: () => void;
  onArchived: (archived: boolean) => Promise<unknown> | void;
  onDeleted: () => Promise<unknown> | void;
}) {
  return (
    <Dialog
      title={workspace.name}
      eyebrow="WORKSPACE SETTINGS"
      onClose={onClose}
    >
      <ArchiveControl kind="workspaces" item={workspace} onDone={onArchived} />
      <DangerZone
        kind="workspaces"
        item={workspace}
        blocked={
          lastWorkspace
            ? 'This is your only workspace, so it can’t be deleted. Create another first if you want to remove this one.'
            : undefined
        }
        onDeleted={onDeleted}
      />
    </Dialog>
  );
}
