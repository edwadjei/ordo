# Agent access and MCP brief (release slice 3, part 1)

**Owner request (29 October 2026):** on agents and MCP: "So isn't that the next logical next step?". The [product requirements](../PRODUCT.md) journey 5 ("Agent adds a task"), section 8 ("API + MCP create/read/update") and acceptance scenario 8 are the source of truth.

**What it is:** an AI assistant (Claude Desktop, Claude Code or another MCP client) connects to Ordo with an access key that the owner creates and can revoke. It reads and adds work through Ordo's MCP server, or through the REST API with the same key. Everything it creates shows **By agent**, and every action is logged.

**Coordinator decisions (Edward may redirect):**
- **Keys, not passwords:** personal access tokens created in Settings, shown once, stored only as a hash, each with a name, scopes and an optional expiry, and revocable at once.
- **No deleting through agents:** agents get no delete or permanent-delete tools in this slice. Archiving a task (complete or archive) is allowed only with the write scope.
- **MCP over Streamable HTTP** at `/api/mcp` on the same Worker, with the token as `Authorization: Bearer`. OAuth sign-in for claude.ai connectors is a later step.

**Branches:** API on `edw/agent-access-tokens-and-mcp-api`, web on `edw/agent-access-settings-web`, both from `main` once the related-items PRs have merged. One PR each. The web specialist merges the API branch in once it is pushed. No AI attribution in commits or PRs. Never merge or deploy. Do not run prettier on Markdown. Keep each request inside the 10 ms CPU budget, and measure the bundle size before and after any new dependency.

## Shared contract

| Change | Shape | Rule |
|---|---|---|
| Access tokens | `POST /v1/settings/agent-tokens` with `{ name, scopes: ("read" \| "write")[], expiresAt? }` → `{ token, record }`, where `token` (`ordo_pat_…`) is shown only once; `GET` lists records `{ id, name, scopes, createdAt, expiresAt, lastUsedAt, revokedAt }`; `DELETE /v1/settings/agent-tokens/:id` revokes | Session-only routes: a token can never create or revoke tokens. The secret comes from `getRandomValues` and is stored as an HMAC-SHA256 under a Worker secret (reuse `OTP_HMAC_KEY` or add `AGENT_TOKEN_HMAC_KEY`; say which), compared in constant time. At most 20 active tokens. `lastUsedAt` is written at most once a minute |
| Token auth on REST | `/v1/*` accepts `Authorization: Bearer ordo_pat_…` | `read` allows GET routes; `write` adds create, edit, complete and archive for tasks and notes, and capture save. Never allowed: settings, keys, sign-in, deleting workspaces or projects, or delete of any kind. Token requests skip the same-origin check but keep idempotency and check-on-save |
| Provenance | Tasks and notes created with a token get `origin: "agent"` and `createdByTokenId`; notes gain `origin` too if they lack it | Set by the server only |
| Activity log | `agent_activity (id, owner, token_id, action, entity_type, entity_id, created_at)`; `GET /v1/settings/agent-activity?tokenId=` (newest first, 100 per page) | Never stores content, only what kind of thing happened to which id. Kept 90 days |
| MCP | `POST /api/mcp` (Streamable HTTP, JSON-RPC 2.0), bearer token required | Tools: `get_my_day`, `search`, `list_workspaces`, `list_projects`, `list_tasks` (filters: workspace, project, status, due before or after, waiting), `get_task`, `create_task`, `update_task` (status, dates, times, people, title, description, project), `complete_task`, `create_note`, `get_note`. Each tool checks its scope, validates with the shared Zod schemas, returns compact JSON, and logs to the activity log. Errors are MCP tool errors with Ordo's codes. No tool reads another owner's data |

## API specialist (`apps/api`, `packages/core`, `packages/db`)

1. Migration `0007_agent_access.sql`: `agent_tokens`, `agent_activity`, `tasks.created_by_token_id`, and note origin if needed. Mirror it in `schema.ts`.
2. Token service, bearer auth middleware with scopes, and provenance.
3. MCP endpoint. Check the current MCP specification and the TypeScript SDK with Context7. Prefer a small hand-written JSON-RPC handler for the Streamable HTTP POST path if the SDK adds much to the bundle or to cold CPU. Report both sizes. Support `initialize`, `tools/list` and `tools/call`; no server-sent streaming needed.
4. Tests:
   - a token is shown once and stored hashed;
   - revoked and expired tokens get 401;
   - a read token is refused on writes, and no token reaches settings, keys or deletes;
   - origin is agent;
   - the activity log holds no content;
   - every MCP tool, success and failure;
   - another owner's ids;
   - idempotency through MCP create.
5. Docs: an agent-access concept note; how to connect Claude Code (`claude mcp add --transport http ordo <url>/api/mcp --header "Authorization: Bearer <token>"`, written so the reader fills in the token themselves) and Claude Desktop; the API README and TECHNICAL.md. Add this brief to the PR.

## Web specialist (`apps/web`, `packages/client`)

1. **Settings › Connected assistants:**
   - create a key (name, Read or Read and write, optional expiry); show it once with Copy and a clear "you won't see this again";
   - list keys with last used, and Revoke with a confirmation;
   - show the MCP address and a copyable connect command for Claude Code.
2. **Activity:** per key, a list of what it did ("Created task …", "Completed task …"), each linking to the item.
3. **"By agent"** on tasks and notes the agent created, naming the key ("By agent · Claude Code").
4. Signed-in journey on your own ports:
   - create a key;
   - use it from a script to create a task through MCP;
   - see it in My Day with By agent and in Activity;
   - revoke it and see the next call refused.
   Screenshots go under `design/evidence/agent-access/`.

## Done criteria

- Acceptance scenario 8 passes locally: a task created through authenticated MCP appears in the correct project, marked By agent.
- Both PRs pass format, typecheck, tests, build and docs checks; the web PR carries screenshots.
- One real connection from Claude Code to the hosted Worker after a deploy, with Edward's OK.
- Not in this brief: OAuth for claude.ai connectors, agents deleting things, multi-agent orchestration, and webhooks.
