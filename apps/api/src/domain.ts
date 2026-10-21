import { and, eq, isNull } from 'drizzle-orm';
import {
  users,
  workspaces,
  projects,
  tasks,
  notes,
  type Database,
} from '@ordo/db';
export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, code: string, message: string): never => {
  throw new ApiFailure(status, code, message);
};
export const publicUser = (user: typeof users.$inferSelect) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  timezone: user.timezone,
});
export const publicRecord = <T extends { ownerUserId: string }>(record: T) => {
  const { ownerUserId: _owner, ...result } = record;
  return result;
};
export async function ownedWorkspace(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, id), eq(workspaces.ownerUserId, userId)));
  return row ?? fail(404, 'NOT_FOUND', 'Workspace not found.');
}
export async function ownedProject(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerUserId, userId)));
  return row ?? fail(404, 'NOT_FOUND', 'Project not found.');
}
export async function ownedTask(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, id),
        eq(tasks.ownerUserId, userId),
        isNull(tasks.deletedAt),
      ),
    );
  return row ?? fail(404, 'NOT_FOUND', 'Task not found.');
}
export async function ownedNote(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.id, id),
        eq(notes.ownerUserId, userId),
        isNull(notes.deletedAt),
      ),
    );
  return row ?? fail(404, 'NOT_FOUND', 'Note not found.');
}
export async function validateScope(
  db: Database,
  userId: string,
  scope: { workspaceId: string | null; projectId: string | null },
) {
  if (scope.workspaceId) await ownedWorkspace(db, userId, scope.workspaceId);
  if (scope.projectId) {
    const project = await ownedProject(db, userId, scope.projectId);
    if (project.workspaceId !== scope.workspaceId)
      fail(
        400,
        'SCOPE_MISMATCH',
        'The project must belong to the selected workspace.',
      );
  }
}
export async function validateParent(
  db: Database,
  userId: string,
  task: {
    id: string;
    workspaceId: string | null;
    projectId: string | null;
    parentId: string | null;
  },
) {
  if (!task.parentId) return;
  let cursor: string | null = task.parentId;
  const visited = new Set([task.id]);
  while (cursor) {
    if (visited.has(cursor))
      fail(400, 'TASK_CYCLE', 'A task cannot be its own ancestor.');
    visited.add(cursor);
    if (visited.size > 500)
      fail(400, 'HIERARCHY_LIMIT', 'The task hierarchy is too deep.');
    const parent = await ownedTask(db, userId, cursor);
    if (
      parent.workspaceId !== task.workspaceId ||
      parent.projectId !== task.projectId
    )
      fail(
        400,
        'SCOPE_MISMATCH',
        'Subtasks must share their parent’s workspace and project.',
      );
    cursor = parent.parentId;
  }
}
export async function withOwnerLock<T>(
  db: Database,
  userId: string,
  run: (transaction: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (transaction) => {
    await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    return run(transaction as unknown as Database);
  });
}
export function assertRevision(actual: number, expected: number) {
  if (actual !== expected)
    fail(
      409,
      'REVISION_CONFLICT',
      'This item changed elsewhere. Reload it before saving your changes.',
    );
}
