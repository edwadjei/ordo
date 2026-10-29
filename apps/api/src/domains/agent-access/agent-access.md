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
- **write** (read and write): creating, editing, completing and archiving tasks and notes (`DELETE /v1/tasks/:id` and `/v1/notes/:id` archive; they are soft), and saving a capture run.

Everything else is `403 AGENT_NOT_ALLOWED`: settings and keys, sign-in, archiving or deleting workspaces and projects, task links, note processing and the demo. A read token attempting a write gets `403 INSUFFICIENT_SCOPE`.

Tasks and notes a token creates have `origin: "agent"` and `createdByTokenId`, set by the server only. A capture saved with a token keeps `origin: "capture"`.

## Activity log

`agent_activity` records what kind of thing happened to which id, never any content: `{ id, tokenId, action, entityType, entityId, createdAt }`.

- REST actions are named after the route, such as `task.create`, `task.update`, `task.archive`, `note.create`, `task.read` and `capture.save`.
- MCP actions are `mcp.<tool>`.

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

Each tool validates its arguments with the shared Zod schemas, returns compact JSON as `structuredContent` and as text, and is logged. Failures come back as tool errors (`isError: true`, text `CODE: message`) so the assistant can correct itself. An unknown tool is a JSON-RPC `-32602`. No tool can read another owner's data: every service call is scoped to the token's owner.

## Connecting an assistant

Create a key in Settings and copy it; it is shown only once. Use your Ordo address in place of `https://ordo.example`. Below, `$ORDO_KEY` is an environment variable you set yourself, so the key never appears in your shell history.

**Claude Code:**

```bash
claude mcp add --transport http ordo https://ordo.example/api/mcp --header "Authorization: Bearer $ORDO_KEY"
```

This is the form in the Claude Code MCP documentation for a remote HTTP server with a bearer token. Claude Code saves the server without checking the key, so run `/mcp` in Claude Code afterwards: a working connection is listed as connected, and a wrong key shows the HTTP status (`401`).

**Claude Desktop:** until Ordo supports sign-in for connectors (OAuth, a later step), use the [`mcp-remote`](https://github.com/punkpeye/mcp-remote) bridge in `claude_desktop_config.json`. This follows its README:
- `--header` sends the key on every request.
- The value is kept in `env` so the arguments hold no spaces, which avoids a bug in Claude Desktop on Windows where spaces in arguments are not escaped.
- `--transport http-only` stops it falling back to server-sent events, which Ordo does not offer.

```json
{
  "mcpServers": {
    "ordo": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://ordo.example/api/mcp",
        "--transport",
        "http-only",
        "--header",
        "Authorization:${ORDO_AUTH}"
      ],
      "env": { "ORDO_AUTH": "Bearer your-key-from-Settings" }
    }
  }
}
```

Revoking the key in Settings stops the assistant at its next request.
