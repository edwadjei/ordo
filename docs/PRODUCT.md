# Personal AI Workspace — Product Requirements

**Version:** 1.0 (MVP specification)  
**Status:** Ready for design and implementation planning  
**Product principle:** **Spend more time completing work than organizing work.**

## 1. Product vision

A **lightweight, Mac-first, AI-native personal productivity workspace** that converts everyday inputs—typed thoughts, informal conversations, voice recordings, meeting transcripts, pasted emails, and document excerpts—into **clear notes, actionable tasks, subtasks, follow-ups, and editable drafts** in the right workspace and project.

The experience must be substantially simpler than a general-purpose knowledge base or enterprise project management suite:

> **Open → Choose a workspace (or stay in My Day) → Capture → Review → Done.**

The app is **personal-first**, not a collaboration platform. Agents may act on the user's behalf through authenticated APIs and MCP tools. A team-management product is not the objective of v1.

## 2. Who this is for and what success looks like

The primary user manages multiple independent portfolios with different contexts. Example workspaces include **MTN** (20+ projects), **DAMSYN**, **Dorsh**, and **Personal**. A project contains tasks, nested subtasks, notes, conversation records, follow-ups, and drafts. A single day may involve meetings, ad-hoc discussions with a manager, vendor follow-ups, and ideas for unrelated products.

**Jobs to be done**

1. Capture a commitment before forgetting it—even between meetings.
2. Turn messy conversation notes or a transcript into actionable items without manually restructuring them.
3. See the right priorities across *all* workspaces and quickly drill into any project.
4. Record who owes what, by when, and what is waiting on someone else.
5. Generate/refine an email or other message from rough input while retaining editorial control.
6. Let Claude, ChatGPT, or another authorized agent create and maintain work items without navigating the UI.
7. Keep sensitive contexts separate, with explicit controls over AI processing and data access.

**MVP success criteria (targets, not claims)**

- An ordinary new task can be created in **one or two interactions** from the home screen.
- A user can reach a visible workspace in **one click/tap** and its project in one more.
- The home screen is useful **without an AI provider configured**.
- Every AI-derived task can be traced to a source note, conversation, or transcript.
- The user can preview/edit/reject AI suggestions before saving; no automatic sending of emails.
- For warmed, local UI interactions on a modern Mac: aim for **<100 ms feedback**, **<300 ms navigation** at the 95th percentile; AI completion is asynchronous and not subject to this UI budget.

## 3. The design direction: airy, calm, and fast

The reference home-screen UI shared by the user is the **visual direction**, not a requirement to clone a particular design. Preserve its appeal while making the workflow unmistakably personal and action-driven.

### Home screen: required layout

**Desktop / Mac:**

- **Left sidebar:** My Day, Inbox, Upcoming, then clear, collapsible Workspaces (MTN, DAMSYN, Dorsh, Personal). Projects appear beneath the active workspace; long lists support filtering and favorites.
- **Top bar:** universal search/command menu (`⌘K`), a visible **Quick Capture** control, current workspace scope, and discreet settings.
- **Main content:** a welcoming but compact header; **large, immediately visible quick actions**; prioritized tasks; waiting-on items; and recent project activity.
- **Optional detail pane:** opening a task/note reveals a side panel instead of losing the current list.

**Quick actions, above the fold, available on Home:**

1. **Add Task** — opens a lightweight inline composer; typing and Enter creates the task.
2. **Record** — begins a clearly indicated audio recording after microphone permission; Stop → transcript → AI suggestions.
3. **Quick Note** — immediate autosaving scratch note; optionally process with AI.
4. **Upload Transcript** — drag-and-drop or file picker; review the source before extraction.
5. **AI Capture** — one free-form text box for raw thoughts, emails, meeting summaries, pasted conversations, and instructions.

Do not hide the everyday actions behind a chatbot, a multi-step wizard, or a plus menu. A compact **single universal capture surface** may power these actions behind the scenes, but the entry points must be obvious.

**Visual language:** generous whitespace, restrained color, crisp typography, gentle dividers, subtle cards, minimal iconography, light/dark modes, polished empty states, keyboard focus indicators, and no dashboard clutter. Use animations sparingly and never let them delay input.

**Mobile:** a simple Home with prominent Add Task / Record / Note actions, a workspace switcher, and responsive lists. Do not replicate a cramped three-column desktop layout.

### Non-negotiable UX rules

- No mandatory forms for quick capture; extra fields are optional and progressive.
- A note/task is always usable while AI runs, fails, or has not been configured.
- Fast workspace switching, preserved list scroll position, and keyboard-first navigation.
- Clearly show **Saving / Saved / Offline / Needs sync**; do not pretend a failed write succeeded.
- Support drag-and-drop transcript uploads on web/Mac and standard file selection on mobile.
- Avoid noisy notification badges, charts, complex statuses, and excessive settings.
- Use user-friendly, plain-language actions: **Add**, **Record**, **Save**, **Review**, **Follow up**, **Done**.

## 4. Information architecture

```text
Account
├── My Day                    # Aggregate across permitted workspaces
├── Inbox                     # Unprocessed captures and unsorted tasks
├── Upcoming                  # Due dates and follow-up dates
├── Waiting On                # Delegated / pending responses
├── Search / Command Menu
└── Workspaces
    ├── MTN
    │   ├── SIM Registration
    │   ├── Self-Service SIM Swap
    │   ├── MTN One TV
    │   └── ...20+ projects
    ├── DAMSYN
    ├── Dorsh
    └── Personal

Project
├── Overview
├── Tasks → Subtasks (nested)
├── Notes
├── Conversations / Recordings
├── Drafts
└── Files / source attachments
```

**Workspace** = an independent portfolio/context. **Project** = a container within one workspace. **Task** may live in a project or in the workspace Inbox. **Subtask** belongs to a parent task. **Conversation** is a source record whether it came from a formal meeting, hallway chat, manager discussion, or dictated recollection.

## 5. MVP screens

### A. Home / My Day

- **Quick Actions row**, visible without scrolling on a typical Mac laptop display.
- Today, Overdue, Upcoming (seven-day outlook), Waiting On, and Inbox counts.
- Each item shows title, workspace/project chip, due/follow-up date, priority only when set, and one-click completion.
- Filter by **All Workspaces** or one workspace; preserve choice per session.
- Recent projects and recently accessed conversations available without browsing deep menus.
- Empty state invites a quick capture rather than showing useless charts.

### B. Inbox / Capture

- Capture as plain text, recording, pasted email, transcript file, or quick note.
- Explicit **workspace** and optional **project** selectors; use active project as initial context.
- Global capture suggests a destination based on visible names, previous user-confirmed associations, and input content; uncertain matches stay unassigned until confirmed.
- AI preview groups output into **Summary / Tasks / Follow-ups / Drafts / Suggested destinations**.
- Per-item edit, remove, merge and reassignment; **Save Selected** and **Save All**.
- Source is retained with its timestamp and linked to created items.
- If AI is unavailable, retain the capture intact and offer **Process later**.

### C. Workspaces

- Simple grid/list of workspaces, no organizational admin console.
- Within a workspace: searchable project list, favorites, recently opened, active/archive filters, counts of open and waiting tasks.
- Create and rename project quickly, including optional project description and aliases to help AI routing.

### D. Project detail

- Tabs: **Overview · Tasks · Notes · Conversations · Drafts**.
- Project-local **Add Task / Note / Record / Upload** commands.
- Overview shows high-signal active work, blockers, waiting-on, recent notes and conversation-derived actions.
- Tasks support inline editing, checkboxes, nested subtasks (at least two visible levels), and basic list filters; avoid mandatory Kanban or timeline views.

### E. Task detail side panel

- Title, rich/plain description, status, priority, due date, follow-up date, workspace, project, responsible person, waiting-on person, parent task, subtasks, related notes/drafts/conversations.
- Simple statuses: **To Do / In Progress / Waiting / Done**. Overdue is calculated, not another status.
- Provenance: **Created manually / From capture / By agent**, with source link and creation time.
- Completion does not delete the source or associated notes.

### F. Notes, conversations, and drafts

- Note editor: headings, bullets, checklists, links, autosave, and lightweight attachments.
- Conversations: title, date/time, people, source type, raw input or transcript, AI summary, extracted actions; keep source distinct from edited summary.
- Drafts: email or message body, optional recipients/subject, copy to clipboard, mark as used; **never auto-send in MVP**.

### G. Universal search + command menu

- `⌘K` opens search across visible workspaces: project, task, note, conversation, draft.
- Results show workspace/project labels and type; filter by type/scope.
- Commands: Add Task, Quick Note, Record, switch workspace/project, open My Day.
- Mac global shortcut to open Quick Capture is desirable, but user-configurable and subject to OS permission/conflict handling; **not an MVP blocker**.

## 6. Critical end-to-end journeys

### Journey 1: Quick task in less than five seconds

Home → **Add Task** → type “Follow up with QA on UAT readiness” → Enter. Created in current workspace/project if scoped, otherwise Inbox. Details can be set later.

### Journey 2: Informal discussion with a manager

User types or dictates: “Spoke to Danny about SIM Swap. Review the API issue, update requirements, and email QA asking for test readiness.” Choose MTN / SIM Swap or let the app suggest it. AI returns a compact summary, three actions, and an editable email draft. User confirms only the desired suggestions. Tasks are linked to this conversation source.

### Journey 3: Meeting transcript

Home → **Upload Transcript** → select `.txt`, `.md`, `.docx`, or text-based `.pdf` (supported types can roll out progressively) → view extracted text → AI suggestions → approve. Where the original transcript lacks clear owners, dates, or projects, mark these as **Needs confirmation**, not fabricated facts.

### Journey 4: Record anywhere

Home → **Record** → speak → Stop → recording saved locally/pending upload where applicable → transcription → suggested project and actions → review → save. Give progress and retry affordances. Obtain clear recording consent/permission; do not promise background call recording or automatic meeting interception.

### Journey 5: Agent adds a task

An authenticated MCP client creates a task in workspace **DAMSYN**, project **API v2**, with source metadata “Claude agent”. The task appears in the project and My Day without a separate manual import. The agent must explicitly identify or securely resolve an allowed destination.

### Journey 6: Waiting on someone

User creates “Vendor to confirm API readiness”, sets status **Waiting**, responsible person, and follow-up date. It appears in Waiting On and upcoming follow-ups. At the due time, it is surfaced without changing its status automatically.

## 7. AI behavior and guardrails

**AI must enhance data entry, not replace reliable task storage.** Use AI for extraction/classification/drafting; deterministic backend services own validation, permissions, saving, status, and date logic.

- **Workspace context first:** active workspace/project is authoritative unless user changes it; never silently move content to another workspace.
- **Unscoped input:** recommend destination and confidence; allow Unassigned/Inbox if ambiguous.
- **No invented actions:** distinguish explicit commitments, suggested follow-ups, and contextual notes. Mark inferred details.
- **No invented deadlines:** resolve relative dates only with capture date and timezone (`Africa/Accra` default configurable); present assumptions for review.
- **No invented assignees:** preserve names as text when the person cannot be matched reliably.
- **Review before commit:** AI outputs staged suggestions; no irreversible writes without confirmation, except separately authorized agent actions.
- **Show source:** each generated action links to the specific source, optionally an excerpt/timecode.
- **Provider choice:** OpenAI / Anthropic with user-provided keys; optional local models for supported extraction/transcription. Manual mode always available.
- **Privacy:** per-workspace AI allowance and model/provider settings; do not transmit sensitive workspace content to a provider without appropriate user authorization. No cross-workspace retrieval by default.
- **Cost controls:** show estimated usage when possible; configure model, size limits, processing retries, and retention.

### AI output schema (conceptual)

```json
{
  "summary": "Discussion about API readiness and UAT",
  "workspace_suggestion": { "id": "workspace-id", "confidence": 0.94 },
  "project_suggestion": { "id": "project-id", "confidence": 0.87 },
  "tasks": [
    {
      "title": "Request QA test readiness confirmation",
      "description": "Send QA the latest test scope and ask for readiness",
      "owner": null,
      "due_at": null,
      "needs_confirmation": ["owner", "due_at"],
      "source_excerpt": "send an email to QA asking for test readiness"
    }
  ],
  "drafts": [
    { "type": "email", "subject": "UAT readiness confirmation", "content": "..." }
  ]
}
```

## 8. Functional scope and priorities

| Capability | MVP | Later |
|---|---|---|
| Multi-workspace + project hierarchy | Yes | Shared teams/permissions |
| Task, subtask, notes, source-linked conversations | Yes | Advanced dependencies / automation |
| Home quick action tiles | Yes | Customizable action layouts |
| Quick voice capture + transcription | Yes, supported devices/browsers | Call capture/integrations |
| Transcript import + AI extraction | Yes, phased file formats | Live meeting integrations |
| AI context routing and review | Yes | Proactive reclassification |
| Draft emails/messages | Yes | Sending through connected email |
| Global search + fast navigation | Yes | Semantic cross-document search |
| API + MCP create/read/update | Yes | Multi-agent orchestration |
| Web + Mac desktop + mobile-friendly PWA | Yes | Native iOS/Android apps |
| Offline-first | Basic local capture and queued sync | Full offline multi-device editing |
| Calendar, Slack, Jira, Gmail sync | No | Opt-in connectors |
| Team collaboration / approvals | No | If actually needed |

## 9. Accessibility, performance, and reliability

- Full keyboard navigation, visible focus, screen-reader labels, scalable text, reduced-motion support, sufficient contrast.
- Target fast cold starts and small initial bundles; lazy-load heavy rich editing, transcription, and AI interfaces.
- Always respond immediately to click/tap, even if saving occurs in the background; reconcile failed saves visibly.
- Graceful handling of long transcripts: file size limits, progress states, cancel/retry, and recoverable drafts.
- Autosave user-entered text and avoid losing a recording when the network drops.
- Sync state should be legible and conflicts handled, not overwritten invisibly.
- Telemetry should be opt-in or privacy-conscious; never log raw transcripts, API keys, or confidential task content.

## 10. Out of scope for v1

Enterprise collaboration, organization-wide user directories, resource planning, Gantt charts, complex workflow builders, internal email clients, auto-sending communications, passive meeting surveillance, autonomous cross-workspace research, and heavyweight BI dashboards.

## 11. MVP acceptance scenarios

1. From Home, create and complete an ordinary task without ever opening AI.
2. Open MTN, choose one of 20+ projects, and capture a note without misfiling it.
3. Start/stop a recording and see accurate processing states, including permission-denied and failure cases.
4. Import a transcript, reject one AI suggestion, edit another, and save selected results linked to the source.
5. Capture something in DAMSYN without pulling in MTN project context.
6. Use `⌘K` to find a task and open its detail pane.
7. View Today and Waiting On across several workspaces; change a task status instantly.
8. Create a task through authenticated MCP/API and find it in the correct project.
9. Turn off provider AI and continue to use tasks, notes, and manual captures.
10. Use the PWA on a phone to add a quick task, record where supported, and switch workspaces.

## 12. Suggested release slices

- **Slice 1 — Delightful core:** Home, quick actions, workspaces/projects, tasks/subtasks, notes, search, local optimistic UI.
- **Slice 2 — Intelligent capture:** inbox/capture, file import, recordings/transcription, staging and approval, linked sources and drafts.
- **Slice 3 — Agent-ready and polished:** REST/MCP, audit/provenance, hardened access control, Tauri Mac packaging, resilient sync and cross-device QA.

**Launch bar:** A lightweight, attractive and usable personal productivity app is better than an impressive AI demo with slow navigation or unreliable task storage.
