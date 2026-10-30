# Agent access concepts

## Keys, not passwords

An AI assistant (Claude Code, Claude Desktop or another MCP client) works in Ordo with a personal access token the owner creates in Settings. A token:

- looks like `ordo_pat_<id>_<secret>` and is shown once, in the `POST /v1/settings/agent-tokens` response;
- is stored only as an HMAC-SHA256 of its secret, under the Worker's `OTP_HMAC_KEY` with its own `agent-token:` label, so no further secret is needed;
- is checked with Web Crypto's HMAC verify, which compares in constant time;
- has a name, scopes (`read`, or `read` and `write`) and an optional expiry;
- can be revoked at once with `DELETE /v1/settings/agent-tokens/:id`.

An owner may have at most 20 active tokens (`409 TOKEN_LIMIT`). Tokens are revoked, never deleted, so the activity log and "By agent" keep their name. Revoked, expired, unknown or altered tokens get `401`. `lastUsedAt` is written at most once a minute.

Creating, listing and revoking tokens, and reading activity, need a signed-in session. A token can never manage tokens.

## What a token may do

Send `Authorization: Bearer ordo_pat_…`. An `Authorization` header never falls back to the session cookie. Token requests skip the browser same-origin rule, but an `Origin` header that is present must still be a trusted one (DNS-rebinding protection). Idempotency keys and check-on-save apply as for any other client.

`platform/http/agent-policy.ts` lists every route a token may use:

- **read:** `GET` on Home, search, workspaces, projects, tasks (and related items), notes, capture runs and drafts.
- **write** (read and write): creating, editing, completing and archiving tasks and notes (`DELETE /v1/tasks/:id` and `/v1/notes/:id` archive; they are soft), saving a capture run, creating workspaces and projects (`POST /v1/workspaces`, `POST /v1/workspaces/:id/projects`, `POST /v1/projects`), and changing a project's name, description and aliases (`PATCH /v1/projects/:id`).

Everything else is `403 AGENT_NOT_ALLOWED`: settings and keys, sign-in, changing, archiving or deleting workspaces, archiving, favouriting or deleting projects (a project `PATCH` with `archived` or `favorite` is refused), task links, note processing and the demo. A read token attempting a write gets `403 INSUFFICIENT_SCOPE`.

Tasks, notes, workspaces and projects a token creates have `origin: "agent"` and `createdByTokenId`, set by the server only. A capture saved with a token keeps `origin: "capture"`.

### Creating workspaces and projects

Assistants retry and repeat themselves, so creates do not make duplicates (this holds for every client, not only tokens):

- An active workspace with the same name, ignoring case and surrounding spaces, is returned instead of a new one: `200` with `existing: true`. A new one is `201` with `existing: false`. For projects the same holds within one workspace. Archived ones do not count, and the existing item is returned unchanged.
- An optional `Idempotency-Key` header (MCP: `idempotencyKey`) returns what that key first made, even if it was renamed since; the same key with a different request is `409 IDEMPOTENCY_CONFLICT`.
- An account has at most 50 active workspaces and 500 active projects (`409 LIMIT_REACHED`). Archiving one makes room.

The limit and the name check are also written into the insert itself, so two creates at once cannot both pass.

## Activity log

`agent_activity` records what kind of thing happened to which id, never any content: `{ id, tokenId, action, entityType, entityId, createdAt }`.

- REST actions are named after the route, such as `task.create`, `task.update`, `task.archive`, `note.create`, `task.read`, `capture.save`, `workspace.create`, `project.create` and `project.update`. A create logs the id of what it created. A workspace or project create that returned an existing one (`existing: true`) created nothing and logs nothing; only the token's use is recorded.
- MCP actions are `mcp.<tool>`, except that `create_workspace` and `create_project` returning an existing one log `workspace.found` or `project.found` with its id.

`GET /v1/settings/agent-activity?tokenId=&before=<createdAt>` lists them newest first, 100 a page. Entries older than 90 days are removed when a token's `lastUsedAt` is written.

## MCP server

`POST /api/mcp` is a Streamable HTTP endpoint (JSON-RPC 2.0) and needs a token; a session cookie is refused. It is a small, stateless, hand-written handler (`domains/mcp`): no server-sent streams and no sessions. GET and DELETE answer `405`. The MCP SDK was measured and not used: its minimal server alone bundles to 1,391 KB, about as much as the rest of the Worker.

It speaks two eras of the protocol:
- **2025-03-26 to 2025-11-25:** the `initialize` handshake. `notifications/initialized` gets `202`.
- **2026-07-28:** `server/discover`, with the version in each request's `_meta`. An `MCP-Protocol-Version`, `Mcp-Method` or `Mcp-Name` header that disagrees with the body is `400` (`-32020`), and an unsupported version is `400` (`-32022`).

`ping`, `tools/list` and `tools/call` work in both. A read token is offered only the read tools.

| Tool | Scope | Does |
|---|---|---|
| `get_my_day` | read | Overdue, due today, follow-ups due and waiting, in the owner's timezone |
| `search` | read | Tasks, notes and projects by words |
| `list_workspaces`, `list_projects` | read | Unarchived workspaces; projects with aliases |
| `list_tasks` | read | Filters: workspace, project, status, `dueBefore`/`dueAfter`, waiting; 50 by default, at most 200 |
| `get_task`, `get_note` | read | One task, or one note with its body |
| `create_task` | write | Optional `idempotencyKey` for safe retries |
| `update_task`, `complete_task` | write | The current revision unless `expectedRevision` is given |
| `create_note` | write | Markdown body |
| `create_workspace` | write | `{ name, color?, idempotencyKey? }`; a same-named active workspace is returned with `existing: true` |
| `create_project` | write | `{ workspaceId, name, description?, aliases?, idempotencyKey? }`; the description and aliases help route captures; a same-named active project in that workspace is returned with `existing: true` |
| `update_project` | write | `{ projectId, name?, description?, aliases?, expectedRevision? }`; aliases replace the list; the current revision unless one is given |

Each tool validates its arguments with the shared Zod schemas, returns compact JSON as `structuredContent` and as text, and is logged. Failures come back as tool errors (`isError: true`, text `CODE: message`) so the assistant can correct itself. An unknown tool is a JSON-RPC `-32602`. No tool can read another owner's data: every service call is scoped to the token's owner.

## Connecting an assistant

Create a key in Settings and copy it; it is shown only once. Use your Ordo address in place of `https://ordo.example`.

**Keep the key out of commands and saved config.** Claude Code saves every server you add in plain text in `~/.claude.json`. A key typed into `claude mcp add --header "Authorization: Bearer ordo_pat_…"` is saved there, and `claude mcp get` prints it back. So the key goes into one place you control, and Claude Code reads it when it connects. Never paste the key into a chat, a command or an issue.

### Claude Code on macOS (recommended): the Keychain

1. Store the key in your login Keychain. With nothing after `-w`, `security` asks for the key twice, so it stays out of your shell history. Paste it at the prompts. `-U` replaces an earlier key.

   ```bash
   security add-generic-password -a "$USER" -s ordo-mcp -U -w
   ```

2. Create a small helper that reads the key and gives Claude Code the header:

   ```bash
   cat > ~/.claude/ordo-mcp-headers.sh <<'EOF'
   #!/bin/sh
   key=$(security find-generic-password -s ordo-mcp -w) || exit 1
   printf '{"Authorization":"Bearer %s"}' "$key"
   EOF
   chmod 700 ~/.claude/ordo-mcp-headers.sh
   ```

3. Add Ordo for all your projects:

   ```bash
   claude mcp add-json --scope user ordo '{"type":"http","url":"https://ordo.example/api/mcp","headersHelper":"$HOME/.claude/ordo-mcp-headers.sh"}'
   ```

Claude Code runs the helper each time it connects (Claude Code [`headersHelper`](https://code.claude.com/docs/en/mcp#use-dynamic-headers-for-custom-authentication)). The key is in no file, and `claude mcp get ordo` shows no headers. To change the key, run step 1 again; to remove it, `security delete-generic-password -s ordo-mcp`.

### Anywhere else: an environment variable

Add the server with a reference to `ORDO_KEY`, in single quotes so the shell does not fill it in:

```bash
claude mcp add --scope user --transport http ordo https://ordo.example/api/mcp --header 'Authorization: Bearer ${ORDO_KEY}'
```

Claude Code saves `Bearer ${ORDO_KEY}` and fills it in at connect time ([variable expansion](https://code.claude.com/docs/en/mcp#environment-variable-expansion-in-mcp-json)). Set `ORDO_KEY` in the environment Claude Code starts from, from a password manager or a secrets file only you can read, never typed into a command. Without it, Claude Code warns `Missing environment variables: ORDO_KEY` and does not connect.

Both setups were checked on 30 October 2026 (Claude Code 2.1.310) against a local Ordo, with a test key and a separate test Keychain. Each connected. No file Claude Code saved held the key, and a wrong key showed only the status.

### Checking a connection

Run `claude mcp list` in a terminal, or `/mcp` in Claude Code. `claude mcp list` shows each server's status only: `✔ Connected`, or `✘ Failed to connect` with the HTTP status and Ordo's error message (checked). According to the Claude Code documentation, `/mcp` shows the same status and issue, and a `${ORDO_KEY}` reference is shown by name, never filled in. Don't use `claude mcp get` for an Ordo key added the old way: it prints the saved header, key and all.

### If it fails

- **401 `UNAUTHORIZED`:** the key is wrong, revoked or expired. Create a new one in Settings, store it as above (step 1, or a new `ORDO_KEY`), and revoke the old one.
- **403 `INSUFFICIENT_SCOPE`:** a read-only key used for a write. Create a read-and-write key.
- **`Missing environment variables: ORDO_KEY`:** the variable isn't set where Claude Code started. Use the Keychain setup on macOS.
- **The helper fails:** run `security find-generic-password -s ordo-mcp > /dev/null && echo found`. It says whether the key is stored without printing it. If it's missing, run step 1.
- **Connected but no tools:** report the status line from `claude mcp list` to the owner; the Ordo server may need an update.

Never paste `~/.claude.json`, `claude mcp get` output, an `Authorization` header or the key into a chat or an issue to debug a connection. The status and HTTP code above are enough. If a key was printed or pasted anywhere, revoke it in Settings and create a new one.

### Moving off a key saved in the command

If you added Ordo with the key in `--header`, remove it with `claude mcp remove ordo -s user` (or `-s local`). Revoke that key in Settings, create a new one, and set it up as above. Claude Code's backups of `~/.claude.json` may still hold the old key; revoking it makes that copy useless.

### Claude Desktop

Claude Desktop keeps a connector's settings in plain text in `claude_desktop_config.json`, so a key there is saved like one in a command. Until Ordo supports sign-in for connectors (OAuth, a later step), connect Ordo through Claude Code instead.

Revoking the key in Settings stops the assistant at its next request.
