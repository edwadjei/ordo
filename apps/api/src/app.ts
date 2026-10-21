import Fastify, { type FastifyRequest } from 'fastify';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import {
  registration,
  userCredentials,
  workspaceInput,
  workspacePatch,
  projectInput,
  projectPatch,
  taskInput,
  taskPatch,
  noteInput,
  notePatch,
  revisionInput,
} from '@ordo/core';
import {
  users,
  sessions,
  workspaces,
  projects,
  tasks,
  notes,
  idempotencyKeys,
  type DatabaseConnection,
} from '@ordo/db';
import {
  ApiFailure,
  fail,
  publicUser,
  publicRecord,
  ownedWorkspace,
  ownedProject,
  ownedTask,
  ownedNote,
  validateScope,
  validateParent,
  withOwnerLock,
  assertRevision,
} from './domain.js';
import {
  hashPassword,
  verifyPassword,
  readSession,
  hashToken,
  newToken,
  sessionCookie,
} from './auth.js';
import { seedDemo } from './seed.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor: typeof users.$inferSelect | null;
  }
}
export interface AppOptions {
  connection: DatabaseConnection;
  trustedOrigins?: string[];
  secureCookies?: boolean;
  closeConnection?: boolean;
}
const parameters = z.object({ id: z.uuid() });
const entityId = (request: FastifyRequest) =>
  parameters.parse(request.params).id;
const actorId = (request: FastifyRequest) =>
  request.actor?.id ?? fail(401, 'UNAUTHORIZED', 'Sign in to continue.');

export async function buildApp(options: AppOptions) {
  const { db } = options.connection;
  const app = Fastify({ logger: false, bodyLimit: 150000, trustProxy: false });
  const origins = new Set(
    options.trustedOrigins ?? [
      'http://localhost:3318',
      'http://127.0.0.1:3318',
    ],
  );
  const secure = options.secureCookies ?? false;
  const dummyPasswordHash = await hashPassword('not-an-account-password');
  const rate = new Map<string, { count: number; reset: number }>();
  app.decorateRequest('actor', null);
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff');
    const pathname = request.url.split('?')[0];
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!request.headers.origin || !origins.has(request.headers.origin))
        fail(
          403,
          'ORIGIN_REJECTED',
          'This request did not come from an allowed app origin.',
        );
      if (pathname === '/v1/auth/register' || pathname === '/v1/auth/login') {
        const now = Date.now();
        if (rate.size > 10000)
          for (const [key, bucket] of rate)
            if (bucket.reset < now) rate.delete(key);
        const key = request.ip;
        let bucket = rate.get(key);
        if (!bucket || bucket.reset < now) {
          bucket = { count: 0, reset: now + 60000 };
          rate.set(key, bucket);
        }
        bucket.count++;
        if (bucket.count > 12) {
          reply.header('Retry-After', '60');
          fail(
            429,
            'RATE_LIMITED',
            'Too many sign-in attempts. Try again in a minute.',
          );
        }
      }
    }
    if (
      pathname === '/health' ||
      pathname === '/v1/auth/register' ||
      pathname === '/v1/auth/login'
    )
      return;
    const token = readSession(request.headers.cookie);
    if (!token) fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
    const [session] = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token!)),
          gt(sessions.expiresAt, new Date().toISOString()),
        ),
      );
    request.actor = session?.user ?? null;
    actorId(request);
    const expectedAccount = request.headers['x-ordo-account'];
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      expectedAccount &&
      expectedAccount !== request.actor!.id
    ) {
      fail(
        409,
        'SESSION_CHANGED',
        'The signed-in account changed. Return to the account that owns this saved capture.',
      );
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiFailure)
      return reply
        .code(error.status)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: 'Check the required fields and their formats.',
        },
      });
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 413)
      return reply.code(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'The request is too large.',
        },
      });
    if (statusCode === 400)
      return reply.code(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: 'The request body is invalid.',
        },
      });
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed. Please retry.',
      },
    });
  });
  if (options.closeConnection !== false)
    app.addHook('onClose', async () => options.connection.close());
  app.get('/health', async () => ({ status: 'ok' }));
  async function createSession(userId: string) {
    const token = newToken();
    await db.insert(sessions).values({
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    return sessionCookie(token, secure);
  }
  app.post('/v1/auth/register', async (request, reply) => {
    const input = registration.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const [user] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email: input.email,
        displayName: input.displayName,
        passwordHash,
      })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!user)
      fail(409, 'ACCOUNT_EXISTS', 'An account with this email already exists.');
    reply.header('Set-Cookie', await createSession(user.id));
    return reply.code(201).send({ user: publicUser(user) });
  });
  app.post('/v1/auth/login', async (request, reply) => {
    const input = userCredentials.parse(request.body);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email));
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ?? dummyPasswordHash,
    );
    if (!user || !valid)
      fail(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    reply.header('Set-Cookie', await createSession(user.id));
    return { user: publicUser(user) };
  });
  app.get('/v1/auth/me', async (request) => ({
    user: publicUser(request.actor!),
  }));
  app.post('/v1/auth/logout', async (request, reply) => {
    const token = readSession(request.headers.cookie)!;
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    reply.header('Set-Cookie', sessionCookie('', secure, true));
    return { ok: true };
  });
  async function snapshot(user: typeof users.$inferSelect) {
    const [workspaceRows, projectRows, taskRows, noteRows] = await Promise.all([
      db
        .select()
        .from(workspaces)
        .where(eq(workspaces.ownerUserId, user.id))
        .orderBy(asc(workspaces.createdAt)),
      db
        .select()
        .from(projects)
        .where(eq(projects.ownerUserId, user.id))
        .orderBy(asc(projects.name)),
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.ownerUserId, user.id), isNull(tasks.deletedAt)))
        .orderBy(asc(tasks.createdAt)),
      db
        .select()
        .from(notes)
        .where(and(eq(notes.ownerUserId, user.id), isNull(notes.deletedAt)))
        .orderBy(asc(notes.createdAt)),
    ]);
    return {
      user: publicUser(user),
      workspaces: workspaceRows.map(publicRecord),
      projects: projectRows.map(publicRecord),
      tasks: taskRows.map(publicRecord),
      notes: noteRows.map(publicRecord),
    };
  }
  app.get('/v1/home', async (request) => snapshot(request.actor!));
  app.post('/v1/demo', async (request) => {
    await seedDemo(db, actorId(request));
    return snapshot(request.actor!);
  });
  app.get('/v1/workspaces', async (request) =>
    (
      await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.ownerUserId, actorId(request)))
    ).map(publicRecord),
  );
  app.post('/v1/workspaces', async (request, reply) => {
    const input = workspaceInput.parse(request.body);
    const [workspace] = await db
      .insert(workspaces)
      .values({ id: randomUUID(), ownerUserId: actorId(request), ...input })
      .returning();
    return reply.code(201).send(publicRecord(workspace));
  });
  app.get('/v1/workspaces/:id', async (request) =>
    publicRecord(await ownedWorkspace(db, actorId(request), entityId(request))),
  );
  app.patch('/v1/workspaces/:id', async (request) => {
    const input = workspacePatch.parse(request.body);
    const id = entityId(request);
    const userId = actorId(request);
    return withOwnerLock(db, userId, async (tx) => {
      const row = await ownedWorkspace(tx, userId, id);
      assertRevision(row.revision, input.expectedRevision);
      const { expectedRevision: _revision, ...patch } = input;
      const [updated] = await tx
        .update(workspaces)
        .set({
          ...patch,
          revision: row.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(workspaces.id, id))
        .returning();
      return publicRecord(updated);
    });
  });
  app.get('/v1/workspaces/:id/projects', async (request) => {
    const id = entityId(request);
    const userId = actorId(request);
    await ownedWorkspace(db, userId, id);
    return (
      await db
        .select()
        .from(projects)
        .where(
          and(eq(projects.workspaceId, id), eq(projects.ownerUserId, userId)),
        )
    ).map(publicRecord);
  });
  async function createProject(request: FastifyRequest, workspaceId?: string) {
    const input = projectInput.parse(
      workspaceId ? { ...(request.body as object), workspaceId } : request.body,
    );
    const userId = actorId(request);
    await ownedWorkspace(db, userId, input.workspaceId);
    const [project] = await db
      .insert(projects)
      .values({ id: randomUUID(), ownerUserId: userId, ...input })
      .returning();
    return publicRecord(project);
  }
  app.post('/v1/projects', async (request, reply) =>
    reply.code(201).send(await createProject(request)),
  );
  app.post('/v1/workspaces/:id/projects', async (request, reply) =>
    reply.code(201).send(await createProject(request, entityId(request))),
  );
  app.get('/v1/projects/:id', async (request) =>
    publicRecord(await ownedProject(db, actorId(request), entityId(request))),
  );
  app.patch('/v1/projects/:id', async (request) => {
    const input = projectPatch.parse(request.body);
    const id = entityId(request);
    const userId = actorId(request);
    return withOwnerLock(db, userId, async (tx) => {
      const row = await ownedProject(tx, userId, id);
      assertRevision(row.revision, input.expectedRevision);
      const { expectedRevision: _revision, ...patch } = input;
      const [updated] = await tx
        .update(projects)
        .set({
          ...patch,
          revision: row.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(projects.id, id))
        .returning();
      return publicRecord(updated);
    });
  });
  app.get('/v1/tasks', async (request) =>
    (
      await db
        .select()
        .from(tasks)
        .where(
          and(eq(tasks.ownerUserId, actorId(request)), isNull(tasks.deletedAt)),
        )
    ).map(publicRecord),
  );
  app.get('/v1/tasks/:id', async (request) =>
    publicRecord(await ownedTask(db, actorId(request), entityId(request))),
  );
  app.post('/v1/tasks', async (request, reply) => {
    const input = taskInput.parse(request.body);
    const userId = actorId(request);
    const key = z
      .string()
      .min(1)
      .max(128)
      .parse(request.headers['idempotency-key']);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    const result = await withOwnerLock(db, userId, async (tx) => {
      const [previous] = await tx
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.ownerUserId, userId),
            eq(idempotencyKeys.key, key),
          ),
        );
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          fail(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This retry key was already used for a different task.',
          );
        const [oldTask] = await tx
          .select()
          .from(tasks)
          .where(
            and(eq(tasks.id, previous.taskId), eq(tasks.ownerUserId, userId)),
          );
        if (!oldTask || oldTask.deletedAt)
          fail(410, 'TASK_ARCHIVED', 'This task was already archived.');
        return { task: oldTask, created: false };
      }
      await validateScope(tx, userId, input);
      const id = randomUUID();
      await validateParent(tx, userId, { ...input, id });
      const [task] = await tx
        .insert(tasks)
        .values({
          id,
          ownerUserId: userId,
          ...input,
          completedAt:
            input.status === 'done' ? new Date().toISOString() : null,
        })
        .returning();
      await tx.insert(idempotencyKeys).values({
        id: randomUUID(),
        ownerUserId: userId,
        key,
        fingerprint,
        taskId: task.id,
      });
      return { task, created: true };
    });
    return reply
      .code(result.created ? 201 : 200)
      .send(publicRecord(result.task));
  });
  app.patch('/v1/tasks/:id', async (request) => {
    const input = taskPatch.parse(request.body);
    const userId = actorId(request);
    const id = entityId(request);
    return withOwnerLock(db, userId, async (tx) => {
      const row = await ownedTask(tx, userId, id);
      assertRevision(row.revision, input.expectedRevision);
      const { expectedRevision: _revision, ...patch } = input;
      const merged = { ...row, ...patch };
      await validateScope(tx, userId, merged);
      await validateParent(tx, userId, merged);
      if (
        row.workspaceId !== merged.workspaceId ||
        row.projectId !== merged.projectId
      ) {
        const [child] = await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.parentId, id),
              eq(tasks.ownerUserId, userId),
              isNull(tasks.deletedAt),
            ),
          )
          .limit(1);
        if (child)
          fail(
            409,
            'HAS_SUBTASKS',
            'Move or archive subtasks before changing this task’s destination.',
          );
      }
      const [updated] = await tx
        .update(tasks)
        .set({
          ...patch,
          revision: row.revision + 1,
          updatedAt: new Date().toISOString(),
          completedAt:
            merged.status === 'done'
              ? (row.completedAt ?? new Date().toISOString())
              : null,
        })
        .where(eq(tasks.id, id))
        .returning();
      return publicRecord(updated);
    });
  });
  app.delete('/v1/tasks/:id', async (request) => {
    const input = revisionInput.parse(request.body);
    const userId = actorId(request);
    const id = entityId(request);
    return withOwnerLock(db, userId, async (tx) => {
      const row = await ownedTask(tx, userId, id);
      assertRevision(row.revision, input.expectedRevision);
      const [child] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.parentId, id),
            eq(tasks.ownerUserId, userId),
            isNull(tasks.deletedAt),
          ),
        )
        .limit(1);
      if (child)
        fail(
          409,
          'HAS_SUBTASKS',
          'Archive or move subtasks before archiving the parent.',
        );
      const [updated] = await tx
        .update(tasks)
        .set({
          deletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          revision: row.revision + 1,
        })
        .where(eq(tasks.id, id))
        .returning();
      return publicRecord(updated);
    });
  });
  app.get('/v1/notes', async (request) =>
    (
      await db
        .select()
        .from(notes)
        .where(
          and(eq(notes.ownerUserId, actorId(request)), isNull(notes.deletedAt)),
        )
    ).map(publicRecord),
  );
  app.get('/v1/notes/:id', async (request) =>
    publicRecord(await ownedNote(db, actorId(request), entityId(request))),
  );
  app.post('/v1/notes', async (request, reply) => {
    const input = noteInput.parse(request.body);
    const userId = actorId(request);
    await validateScope(db, userId, input);
    const [note] = await db
      .insert(notes)
      .values({ id: randomUUID(), ownerUserId: userId, ...input })
      .returning();
    return reply.code(201).send(publicRecord(note));
  });
  app.patch('/v1/notes/:id', async (request) => {
    const input = notePatch.parse(request.body);
    const userId = actorId(request);
    const id = entityId(request);
    return withOwnerLock(db, userId, async (tx) => {
      const row = await ownedNote(tx, userId, id);
      assertRevision(row.revision, input.expectedRevision);
      const { expectedRevision: _revision, ...patch } = input;
      await validateScope(tx, userId, { ...row, ...patch });
      const [note] = await tx
        .update(notes)
        .set({
          ...patch,
          revision: row.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(notes.id, id))
        .returning();
      return publicRecord(note);
    });
  });
  app.delete('/v1/notes/:id', async (request) => {
    const input = revisionInput.parse(request.body);
    const userId = actorId(request);
    const id = entityId(request);
    return withOwnerLock(db, userId, async (tx) => {
      const row = await ownedNote(tx, userId, id);
      assertRevision(row.revision, input.expectedRevision);
      const [note] = await tx
        .update(notes)
        .set({
          deletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          revision: row.revision + 1,
        })
        .where(eq(notes.id, id))
        .returning();
      return publicRecord(note);
    });
  });
  return app;
}
