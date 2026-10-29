'use client';
import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import type { Project } from '@ordo/client';
import { api } from '../lib/workspace';
import { Dialog } from './dialog';
import { ArchiveControl } from './archive-control';
import { DangerZone } from './danger-zone';
import { parseAliases, projectAliases } from '../lib/capture';

/**
 * A project's description and other names. AI capture uses them (and only
 * them, from the chosen workspace) to suggest where a capture belongs.
 */
export function ProjectSettingsDialog({
  project,
  onClose,
  onSaved,
  onArchived,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onArchived: (archived: boolean) => Promise<unknown> | void;
  onDeleted: () => Promise<unknown> | void;
}) {
  const [description, setDescription] = useState(project.description || ''),
    [aliases, setAliases] = useState(projectAliases(project).join(', ')),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const parsed = parseAliases(aliases);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed.problem) {
      setError(parsed.problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.updateProject(project.id, {
        description: description.trim(),
        aliases: parsed.aliases,
        expectedRevision: project.revision,
      });
      await onSaved();
      setSaved(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={project.name} eyebrow="PROJECT SETTINGS" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          Description
          <textarea
            rows={3}
            maxLength={5000}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setSaved(false);
            }}
            placeholder="What this project is about, in a sentence or two."
            aria-describedby="project-description-hint"
          />
        </label>
        <p id="project-description-hint" className="field-hint">
          {description.length}/5,000 · Shown on the project and used by AI
          capture to tell projects apart.
        </p>
        <label>
          Other names
          <input
            value={aliases}
            onChange={(event) => {
              setAliases(event.target.value);
              setSaved(false);
              setError('');
            }}
            placeholder="SIM reg, KYC, registration"
            aria-describedby="project-aliases-hint"
            aria-invalid={!!parsed.problem || undefined}
          />
        </label>
        <p id="project-aliases-hint" className="field-hint">
          Separate with commas. Up to 10, each up to 60 characters: the names
          people use for this project in meetings and emails.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span className="saved" role="status">
              <Check size={13} aria-hidden="true" /> Saved
            </span>
          )}
        </div>
        <p className="privacy-note">
          When you process a capture, only this workspace’s project names,
          descriptions and other names go with it, never their tasks or notes.
        </p>
      </form>
      <ArchiveControl kind="projects" item={project} onDone={onArchived} />
      <DangerZone kind="projects" item={project} onDeleted={onDeleted} />
    </Dialog>
  );
}
