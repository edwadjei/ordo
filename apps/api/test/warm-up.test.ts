import assert from 'node:assert/strict';
import { test } from 'node:test';
import { warmUp } from '../src/warm-up.js';
import { newId } from '../src/platform/identifiers/new-id.js';
import { randomBytes } from '../src/adapters/cryptography/encoding.js';

// The startup warm-up compiles the main request paths while an isolate
// starts. It must keep running through them, and its fixed randomness must
// never reach anything outside it.

test('the warm-up runs every main request path through', async () => {
  assert.deepEqual(await warmUp(), [
    200, // GET /v1/auth/me
    200, // GET /v1/home
    200, // GET /v1/capabilities
    200, // GET /v1/search
    201, // POST /v1/tasks
    200, // PATCH /v1/tasks/:id
    201, // POST /v1/notes
    200, // PATCH /v1/notes/:id
    202, // POST /v1/auth/otp/request
    200, // POST /v1/auth/otp/verify
    201, // POST /v1/notes/:id/process
    // The save's batch runs; the made-up run then reads as saved elsewhere.
    409, // POST /v1/capture-runs/:id/save
    200, // GET /v1/drafts
    200, // GET /v1/tasks/:id/related
    200, // GET /v1/home with an access token
    200, // MCP tools/list
    200, // MCP tools/call list_tasks
    200, // MCP tools/call create_task
    201, // POST /v1/workspaces with an access token
    201, // POST /v1/workspaces/:id/projects with an access token
    200, // MCP tools/call create_workspace
    200, // MCP tools/call create_project
    200, // MCP tools/call update_project
  ]);
});

test('fixed ids and bytes stay inside the warm-up, even while it runs', async () => {
  const running = warmUp();
  // This code runs while the warm-up is in flight, outside its scope.
  const ids = new Set([newId(), newId(), newId()]);
  assert.equal(ids.size, 3);
  assert.ok(![...ids].includes('00000000-0000-4000-8000-000000000000'));
  assert.ok(randomBytes(32).some((byte) => byte !== 0));
  await running;
  assert.notEqual(newId(), newId());
  assert.ok(randomBytes(32).some((byte) => byte !== 0));
});

test('a failing warm-up is swallowed: it never stops the Worker from starting', async () => {
  assert.deepEqual(
    await warmUp(() => {
      throw new Error('composition failed');
    }),
    [],
  );
});
