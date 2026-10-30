# Agent key handling brief

**Owner request (30 October 2026):** "we keep printing our ordo keys on this.. can you check? for MCP connections and failures especially"; on the fix: "Yes, brief it".

**Edward's decision (30 October 2026), after the first API PR:** "i want the existing setup I just don't want my MCP agent print my keys, what we already have is perfect". The connect command stays as it is (the key in `--header`). The Keychain and `${ORDO_KEY}` setups were dropped, and the Claude Desktop instructions are unchanged. This brief keeps only the agent rule against printing keys and a short "If it fails" section; the goal and per-specialist steps below are superseded where they say otherwise.

**What the coordinator found:** Ordo's API never logs or echoes a key (the 401 shows only `ordo_pat_…`), and no real key is in any session transcript, Claude Code log or shell history. The leak is in how the key is connected:

- The connect command in Settings › Connected assistants (`connectCommand` in `apps/web/lib/agents.ts`) puts the real key inside `--header "Authorization: Bearer <key>"`. Pasting it anywhere (terminal, a Claude chat) carries the key, and Claude Code saves it in plain text in `~/.claude.json` (and its automatic backups).
- When a connection fails, sessions debugging it read the saved MCP config (for example `claude mcp get`, or reading `~/.claude.json`), which prints the key.

**Goal:** the key is never part of a command, a config file Claude Code saves, or anything an agent prints. It lives in one place the owner controls, and Claude Code reads it at connect time.

**Branches:** API on `edw/agent-keys-stay-out-of-config-api`, web on `edw/agent-keys-stay-out-of-config-web`, both from `main` (`acc50d4` or later). One PR each. No AI attribution in commits or PRs. Never merge or deploy. Do not run prettier on Markdown. Never print a real key: in tests and screenshots use `ordo_pat_FAKE…` only. Don't touch ports 8788/3358.

## API specialist (docs and verification; owns the recommended setup)

1. **Verify with Context7 (Claude Code docs) which setups keep the key out of saved config,** and say which you tested on your own ports with a fake local key:
   - environment variable expansion, `"Authorization": "Bearer ${ORDO_KEY}"`, in a user-level or project `.mcp.json`, and whether it also works for a server added with `claude mcp add --scope user` (where it is saved literally in `~/.claude.json`);
   - `headersHelper` reading the key from the macOS Keychain (`security find-generic-password -s ordo-mcp -w`), so the key is in no file at all.
   Recommend one default (Keychain via `headersHelper` on macOS if it works, environment variable otherwise), with the exact steps.
2. **Rewrite the connection section of `agent-access.md`** (and the API README if it repeats it): the recommended setup, the steps to store the key, how to check a connection without printing it (`claude mcp list` or `/mcp` show status only; say so only after checking that they don't show headers), and a short "if it fails" list that never asks the reader to show the config or the key.
3. **A rule for agents in this repo** (in `CLAUDE.md` / `AGENTS.md`, whichever the repo uses, or create `CLAUDE.md`): never print, echo, cat or quote an Ordo key, `~/.claude.json`, `claude mcp get` output or any `Authorization` header. When debugging an MCP connection, report only the connection status and HTTP status code. Mask any key as `ordo_pat_xxxx…`.
4. Tell the coordinator the exact command or config the web should show, so both PRs match.

## Web specialist (Settings › Connected assistants)

1. Wait for the API specialist's recommended setup, then show it instead of the command with the key in it. **The key on the one-time screen is shown on its own with Copy,** and the steps say where to put it (Keychain or environment variable). No command on the page ever contains the key.
2. Under the steps: "Never paste your key into a chat or a command. To check a connection, run `/mcp` in Claude Code."
3. Update `connectCommand` and its tests; a test asserts no generated command contains `ordo_pat_` followed by key characters.
4. Desktop and 390 px screenshots under `design/evidence/agent-key-handling/`, with a fake key only.

## Done criteria

- No command, doc or screen asks to put the key in a command line or in a config file that Claude Code saves.
- The repo has an agent rule against printing keys and MCP config.
- Both PRs pass format, typecheck, tests, build and docs checks.
- After a deploy and with Edward's OK: Edward revokes the current key, creates a new one, stores it the recommended way, and `/mcp` shows Ordo connected with all 14 tools (this needs PR #40 deployed).
- Not in this brief: OAuth sign-in for MCP (the later fix that removes long-lived keys).
