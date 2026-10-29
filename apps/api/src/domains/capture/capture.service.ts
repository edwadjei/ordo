import type { z } from 'zod';
import type {
  CaptureRun,
  User,
  captureProcessInput,
  captureSaveInput,
} from '@ordo/core';
import type {
  CaptureRunRecord,
  DraftRecord,
  TaskRecord,
} from '../../adapters/database/database.adapter.js';
import type { ContentHasher } from '../../capabilities/content-hasher.contract.js';
import type { TextModel } from '../../capabilities/text-model.contract.js';
import { ApiFailure, fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import { newId } from '../../platform/identifiers/new-id.js';
import { isoNow } from '../../platform/time/iso-now.js';
import { localToday } from '../../platform/time/local-today.js';
import type { AiSettingsService } from '../ai-settings/ai-settings.service.js';
import { publicDraft } from '../drafts/drafts.service.js';
import type { NotesService } from '../notes/notes.service.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import {
  captureOutputSchema,
  capturePrompt,
  captureSystemPrompt,
  readSuggestions,
  type CapturePromptInput,
} from './capture.prompt.js';
import type { CaptureRepository, SavedRow } from './capture.repository.js';

/** Reply budget: enough for 50 short tasks, 10 drafts and a summary. */
const MAX_OUTPUT_TOKENS = 2000;

export function publicRun(row: CaptureRunRecord): CaptureRun {
  const used =
    row.inputTokens !== null ||
    row.outputTokens !== null ||
    row.neurons !== null;
  return {
    id: row.id,
    noteId: row.noteId,
    noteRevision: row.noteRevision,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    status: row.status,
    provider: row.provider,
    model: row.model,
    suggestions: (row.suggestions as CaptureRun['suggestions']) ?? null,
    errorCode: row.errorCode,
    usage: used
      ? {
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          neurons: row.neurons,
        }
      : null,
    saved: row.savedResult ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * "Process with AI" on a note and saving what the person keeps. AI runs only
 * when asked; nothing is created until the save. Note text, prompts, model
 * output and keys are never logged.
 */
export class CaptureService {
  constructor(
    private readonly repository: CaptureRepository,
    private readonly notes: NotesService,
    private readonly workspaces: WorkspacesService,
    private readonly ai: AiSettingsService,
    private readonly hasher: ContentHasher,
  ) {}

  async process(
    user: User,
    noteId: string,
    input: z.infer<typeof captureProcessInput>,
    signal?: AbortSignal,
  ) {
    const owner = user.id;
    const note = await this.notes.get(owner, noteId);
    if (!note.body.trim())
      fail(400, 'CAPTURE_EMPTY', 'This capture has no text to process.');
    await this.workspaces.validateScope(owner, input);
    const [workspace, projects] = await Promise.all([
      this.workspaces.getWorkspace(owner, input.workspaceId),
      this.workspaces.listProjects(owner, input.workspaceId),
    ]);
    const base = {
      id: newId(),
      ownerUserId: owner,
      noteId,
      noteRevision: note.revision,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    };
    const settings = await this.ai.status(owner);
    let model: TextModel;
    try {
      model = await this.ai.resolve(owner);
    } catch (error) {
      if (!isUnavailable(error)) throw error;
      return publicRun(
        await this.repository.insert({
          ...base,
          status: 'pending',
          provider: settings.textProvider,
          model: null,
          errorCode: error.code,
        }),
      );
    }
    if (note.body.length > model.maxInputCharacters)
      fail(
        413,
        'CAPTURE_TOO_LONG',
        `This capture is too long for the selected AI (${model.maxInputCharacters.toLocaleString('en')} characters). Split it into shorter notes, or choose your own OpenAI or Anthropic key in Settings.`,
      );
    const promptInput: CapturePromptInput = {
      note: { title: note.title, body: note.body, source: note.source },
      workspace: { id: workspace.id, name: workspace.name },
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        aliases: project.aliases,
      })),
      chosenProjectId: input.projectId,
      today: localToday(user.timezone),
    };
    const run = { ...base, provider: model.provider, model: model.model };
    let result;
    try {
      result = await model.generate({
        system: captureSystemPrompt,
        prompt: capturePrompt(promptInput),
        schema: captureOutputSchema,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        signal,
      });
    } catch (error) {
      return publicRun(
        await this.repository.insert({
          ...run,
          status: isUnavailable(error) ? 'pending' : 'failed',
          errorCode:
            error instanceof ApiFailure
              ? error.code
              : error instanceof SyntaxError
                ? 'INVALID_OUTPUT'
                : 'AI_FAILED',
        }),
      );
    }
    const suggestions = readSuggestions(result.output, promptInput);
    return publicRun(
      await this.repository.insert({
        ...run,
        status: suggestions ? 'ready' : 'failed',
        suggestions: suggestions ?? null,
        errorCode: suggestions ? null : 'INVALID_OUTPUT',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        neurons: result.usage.neurons,
      }),
    );
  }

  async get(owner: string, id: string) {
    return publicRun(await this.requireRun(owner, id));
  }

  async listForNote(owner: string, noteId: string) {
    await this.notes.get(owner, noteId);
    return (await this.repository.listForNote(owner, noteId)).map(publicRun);
  }

  /**
   * Creates the edited tasks and drafts in one batch, linked to the source
   * note. A retry with the same key and body returns the first result; any
   * other save of a saved run is refused.
   */
  async save(
    owner: string,
    id: string,
    input: z.infer<typeof captureSaveInput>,
    key: string,
  ) {
    const fingerprint = await this.hasher.digest(JSON.stringify(input));
    const run = await this.requireRun(owner, id);
    if (run.status === 'saved')
      return this.savedBefore(owner, run, key, fingerprint);
    if (run.status !== 'ready')
      fail(
        409,
        'RUN_NOT_READY',
        'This capture has no suggestions to save. Process it again.',
      );
    const scopeOf = (item: {
      workspaceId?: string;
      projectId?: string | null;
    }) => {
      const workspaceId = item.workspaceId ?? input.workspaceId;
      const projectId =
        item.projectId !== undefined
          ? item.projectId
          : workspaceId === input.workspaceId
            ? input.projectId
            : null;
      return { workspaceId, projectId };
    };
    const scopes = new Map<string, ReturnType<typeof scopeOf>>();
    for (const item of [input, ...input.tasks, ...input.drafts]) {
      const scope = scopeOf(item);
      scopes.set(`${scope.workspaceId}/${scope.projectId}`, scope);
    }
    for (const scope of scopes.values())
      await this.workspaces.validateScope(owner, scope);
    for (const task of input.tasks) {
      if (task.dueTime !== null && task.dueDate === null)
        fail(400, 'INVALID_INPUT', 'A due time needs a due date.');
      if (task.followUpTime !== null && task.followUpDate === null)
        fail(400, 'INVALID_INPUT', 'A follow-up time needs a follow-up date.');
    }
    const now = isoNow();
    const taskRows: SavedRow[] = input.tasks.map((task) => ({
      id: newId(),
      ownerUserId: owner,
      ...scopeOf(task),
      parentId: null,
      title: task.title,
      description: '',
      // A follow-up on someone else waits for them.
      status: task.isFollowUp && task.waitingOn ? 'waiting' : 'todo',
      priority: task.priority,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      followUpDate: task.followUpDate,
      followUpTime: task.followUpTime,
      responsiblePerson: task.responsiblePerson,
      waitingOn: task.waitingOn,
      origin: 'capture',
      sourceNoteId: run.noteId,
      createdAt: now,
      updatedAt: now,
    }));
    const draftRows: SavedRow[] = input.drafts.map((draft) => ({
      id: newId(),
      ownerUserId: owner,
      ...scopeOf(draft),
      sourceNoteId: run.noteId,
      kind: draft.kind,
      recipient: draft.to,
      subject: draft.subject,
      body: draft.body,
      createdAt: now,
      updatedAt: now,
    }));
    const claim = newId();
    const saved = await this.repository.save(
      owner,
      id,
      {
        key,
        fingerprint,
        claim,
        result: {
          taskIds: taskRows.map((row) => row.id),
          draftIds: draftRows.map((row) => row.id),
        },
        now,
      },
      taskRows,
      draftRows,
    );
    // Another save won between the read and the batch.
    if (saved.saveClaim !== claim)
      return this.savedBefore(owner, saved, key, fingerprint);
    return { ...(await this.result(owner, saved)), created: true };
  }

  private async savedBefore(
    owner: string,
    run: CaptureRunRecord,
    key: string,
    fingerprint: string,
  ) {
    if (run.saveKey !== key)
      fail(409, 'RUN_ALREADY_SAVED', 'This capture was already saved.');
    if (run.saveFingerprint !== fingerprint)
      fail(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This retry key was already used for a different save.',
      );
    return { ...(await this.result(owner, run)), created: false };
  }

  private async result(owner: string, run: CaptureRunRecord) {
    const ids = run.savedResult ?? { taskIds: [], draftIds: [] };
    const [tasks, drafts] = await Promise.all([
      this.repository.tasksByIds(owner, ids.taskIds),
      this.repository.draftsByIds(owner, ids.draftIds),
    ]);
    return {
      run: publicRun(run),
      tasks: tasks.map((task: TaskRecord) => publicRecord(task)),
      drafts: drafts.map((draft: DraftRecord) => publicDraft(draft)),
    };
  }

  private async requireRun(owner: string, id: string) {
    return (
      (await this.repository.find(owner, id)) ??
      fail(404, 'NOT_FOUND', 'Capture run not found.')
    );
  }
}

/** AI is off, out of allowance, busy or missing a key: keep it for later. */
function isUnavailable(error: unknown): error is ApiFailure {
  return (
    error instanceof ApiFailure &&
    (error.status === 429 || error.status === 503)
  );
}
