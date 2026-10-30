# Rules for agents in this repository

## Ordo keys and MCP config

- Never print, echo, `cat` or quote an Ordo key (`ordo_pat_…`), `~/.claude.json` (or its backups), `claude_desktop_config.json`, `claude mcp get` output, or any `Authorization` header. This holds in commands, logs, test output, PRs, screenshots and messages to other sessions.
- When debugging an MCP connection, report only the connection status and HTTP status code, for example from `claude mcp list` or `/mcp`. The steps are in [agent access](apps/api/src/domains/agent-access/agent-access.md#if-it-fails).
- Mask any key that must be mentioned as `ordo_pat_xxxx…`. In tests and screenshots, use fake keys that start `ordo_pat_FAKE`.
- Never write a key into a command line or a config file. Connect with the Keychain or `${ORDO_KEY}` setup in the agent access note.
- If a key was printed anyway, say so plainly and recommend revoking it in Settings.
