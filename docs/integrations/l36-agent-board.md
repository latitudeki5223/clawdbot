# L36 Agent Kanban Board — ClawdBot Integration

> Canonical plan / source of truth: `/home/admin/.claude/plans/please-use-the-dtabase-distributed-fiddle.md` on the L36 host. Read it for full background, decision log, and schema rationale.

## Overview

The L36 Agent Kanban Board is a 6-column workflow board (`inbox`, `research`, `review`, `approved`, `done`, `blocked`) inside the L36 web app. It serves as a shared inbox between Tony and his autonomous agents. ClawdBot (Max) uses it to post research findings, decisions, and asks back to Tony — Tony triages from the same UI he uses for his own work. Max polls the board, claims cards from `inbox`, runs the work, and posts results into `review` for human approval. L36 is the operational source of truth for the board; Max may mirror full research markdown to its own `gen2-tony` vault but L36 holds the canonical record.

## Auth setup

- API key issued by Tony via `scripts/agents/create-agent-key.py` on the L36 host. Raw key is shown **once** at creation; L36 stores only the SHA-256 hash.
- ClawdBot's primary key is bound to `agent_id = max-primary`.
- Store the raw key in ClawdBot's own secret store (Tony's Vault on the ClawdBot host, or `.env`).
- Suggested env var name: `L36_AGENT_API_KEY`.
- Send on every request: `X-API-Key: <raw_key>`.
- Send on every request: `X-Context-ID: 1` (Latitude36 main tenant). Other context IDs exist for sibling tenants — confirm with Tony per use case.
- Base URLs:
  - Dev / on-host: `http://localhost:5050`
  - Production: `https://l36.com.au`
- All paths below are relative to `<base>/api/agent-board`.
- Rotation: revoke a key by setting `revoked_at = NOW()` on the `agent_api_keys` row, then issue a new one with the CLI script. ClawdBot must handle 401s by re-reading its secret store.

## Endpoint reference

### GET /api/agent-board/kanban

Fetch the full board for the current context.

- Headers: `X-API-Key`, `X-Context-ID`
- Body: none
- Response 200:

```json
{
  "success": true,
  "columns": {
    "inbox":    [{"id": "uuid", "title": "...", "version": 1, "...": "..."}],
    "research": [],
    "review":   [],
    "approved": [],
    "done":     [],
    "blocked":  []
  }
}
```

- Errors: 401 (bad/missing key), 400 (missing context header).

### GET /api/agent-board/count

Light-weight counter for "anything new for me?" probes.

- Headers: `X-API-Key`, `X-Context-ID`
- Query: `?status=inbox` (or any valid status)
- Response 200: `{"success": true, "data": {"count": 3}}`
- Errors: 401, 400 (unknown status value).

### GET /api/agent-board/<task_id>

Fetch one task by UUID.

- Headers: `X-API-Key`, `X-Context-ID`
- Body: none
- Response 200: `{"success": true, "data": {"id": "...", "version": <int>, "...": "..."}}`
- Errors: 401, 404 (`{"success": false, "error": "...", "code": "NOT_FOUND"}`).

### POST /api/agent-board

Create a new card. Lands in `inbox` by default.

- Headers: `X-API-Key`, `X-Context-ID`, `Content-Type: application/json`
- Body:

```json
{
  "title": "Research: best Postgres backup strategy for L36",
  "description": "Optional longer text",
  "priority": "normal",
  "autonomy_level": "review"
}
```

- `created_by` is auto-injected server-side from the key's `agent_id` — do not send it.
- Response 201: `{"success": true, "data": {"id": "uuid", "version": 1, "status": "inbox", "...": "..."}}`
- Errors: 401, 400 (missing `title`, invalid `priority`/`autonomy_level`).

### PATCH /api/agent-board/<task_id>/status

Move a card between columns and/or update its position. Optimistic-locked.

- Headers: `X-API-Key`, `X-Context-ID`, `Content-Type: application/json`
- Body:

```json
{
  "status": "research",
  "kanban_position": 0,
  "version": 1
}
```

- Response 200: `{"success": true, "data": {"version": 2}}`
- Errors:
  - 401, 404
  - 400 (`{"code": "INVALID_TRANSITION"}`) — illegal status transition (see state machine)
  - 409 (`{"code": "VERSION_CONFLICT"}`) — `version` did not match current row; re-fetch and retry

### PATCH /api/agent-board/<task_id>/claim

Claim a card for execution. **Agent-key only — admin browser auth is rejected on this route.** `assigned_agent` is taken server-side from the key's `agent_id`.

- Headers: `X-API-Key`, `X-Context-ID`, `Content-Type: application/json`
- Body: `{"version": 1}` (no `assigned_agent` field)
- Response 200: `{"success": true, "data": {"version": 2, "assigned_agent": "max-primary"}}`
- Errors:
  - 401, 404
  - 409 (`{"code": "VERSION_CONFLICT"}`) — version drifted
  - 409 (`{"code": "ALREADY_CLAIMED"}`) — `assigned_agent` was non-null when the atomic update fired

### POST /api/agent-board/<task_id>/result

Post the agent's output. Sets `result`, transitions to `review`, increments `version`. Use this even if the card is currently in `research` — the route forces `review`.

- Headers: `X-API-Key`, `X-Context-ID`, `Content-Type: application/json`
- Body:

```json
{
  "result": "## Findings\n\nFull markdown here — L36 stores the entire document and renders it on the card.",
  "new_status": "review",
  "version": 2
}
```

- Response 200: `{"success": true, "data": {"version": 3, "status": "review"}}`
- Errors: 401, 404, 409 (`VERSION_CONFLICT`).

## Status state machine

Allowed transitions (rejected as 400 `INVALID_TRANSITION` otherwise):

- `inbox` → `research`, `blocked`
- `research` → `review`, `blocked`, `inbox`
- `review` → `approved`, `research`
- `approved` → `done`
- `blocked` → `inbox`, `research`
- `done` → terminal (no outbound transitions)

`POST /result` is the canonical way to land in `review`; it bypasses the explicit transition check and forces `review` regardless of current status.

## Validation rules

- `status`: one of `inbox`, `research`, `review`, `approved`, `done`, `blocked`
- `priority`: one of `urgent`, `high`, `normal`, `low` (default `normal`)
- `autonomy_level`: one of `full`, `review`, `human_only` (default `review`)
- `title`: required on create, non-empty
- `description`: optional text
- `created_by`: never send — server fills from `g.agent_id`
- `assigned_agent`: never send on `/claim` — server fills from `g.agent_id`
- `result`: full markdown on `POST /result`. Renders in the L36 card detail view; not summarised. Tony reads the whole thing inline.
- `version`: required on every write (`PATCH /status`, `PATCH /claim`, `POST /result`). Always send the value most recently observed on that row.

## Common ClawdBot flows

Replace `<KEY>` with the raw API key, `<TASK_ID>` with the card UUID, and `<BASE>` with `http://localhost:5050` (dev) or `https://l36.com.au` (prod).

### 1. Post a research finding (create → claim → post_result)

```bash
# Step 1: create the card
curl -X POST "<BASE>/api/agent-board" \
  -H "X-API-Key: <KEY>" \
  -H "X-Context-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"title":"Research: Postgres backup strategy","priority":"normal","autonomy_level":"review"}'
# → {"success":true,"data":{"id":"<TASK_ID>","version":1,...}}

# Step 2: claim it (so the board shows assigned_agent=max-primary)
curl -X PATCH "<BASE>/api/agent-board/<TASK_ID>/claim" \
  -H "X-API-Key: <KEY>" \
  -H "X-Context-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"version":1}'
# → {"success":true,"data":{"version":2,"assigned_agent":"max-primary"}}

# Step 3: post the result (transitions to review)
curl -X POST "<BASE>/api/agent-board/<TASK_ID>/result" \
  -H "X-API-Key: <KEY>" \
  -H "X-Context-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"result":"## Findings\n\nFull markdown body...","new_status":"review","version":2}'
# → {"success":true,"data":{"version":3,"status":"review"}}
```

### 2. Check inbox count

```bash
curl "<BASE>/api/agent-board/count?status=inbox" \
  -H "X-API-Key: <KEY>" \
  -H "X-Context-ID: 1"
# → {"success":true,"data":{"count":3}}
```

### 3. Update an existing task (e.g. move blocked → research)

```bash
# Re-read the current version first
curl "<BASE>/api/agent-board/<TASK_ID>" \
  -H "X-API-Key: <KEY>" -H "X-Context-ID: 1"
# → {"success":true,"data":{"version":5,...}}

# Then patch with the freshly-read version
curl -X PATCH "<BASE>/api/agent-board/<TASK_ID>/status" \
  -H "X-API-Key: <KEY>" \
  -H "X-Context-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"status":"research","kanban_position":0,"version":5}'
# → {"success":true,"data":{"version":6}}
```

### 4. Handle 409 VERSION_CONFLICT

On any 409 with `code: "VERSION_CONFLICT"`:

- Refetch the task: `GET /api/agent-board/<TASK_ID>`
- Read the new `version` from the response
- Retry the original write with the new `version`
- Cap retries at 3; if still failing, log and surface to Tony (a human likely edited the card)

For 409 with `code: "ALREADY_CLAIMED"` on `/claim`: do **not** retry. The card is owned by another agent. Move on to the next inbox card.

## Pitfalls

- Always read the current `version` immediately before any `PATCH` / `POST` — it bumps on every successful write, including writes from other clients.
- `claim` is admin-blocked: it only accepts `X-API-Key` (agent auth). The L36 admin browser session cannot claim. This is intentional — claim is the autonomous-execution signal.
- `POST /result` always transitions the card to `review`, regardless of the current column. Don't expect it to honour `new_status` values other than `review`.
- The `result` field is rendered as Markdown in the L36 UI. Use GFM (tables, fenced code blocks, task lists). Don't HTML-escape.
- Multi-tenant: a card created under `X-Context-ID: 1` is invisible to context `2`. Make sure ClawdBot pins the context per task — switching mid-flow will produce 404s.
- `created_by` and `assigned_agent` are server-controlled. Sending them in the request body is harmless but ignored.
- Polling cadence: 5 minutes is fine for inbox checks. Don't poll the full `/kanban` more often than every 60s in tight loops.

## Out of scope (for now)

- **Webhooks / push notifications** — not implemented yet. ClawdBot must poll. Use `GET /count?status=inbox` as the cheap probe; only fetch `/kanban` when count > 0.
- **Bulk operations** — no batch endpoints. Issue one HTTP call per task.
- **Soft delete** — no `DELETE` endpoint exists. Mark completed work as `status='done'`; the column acts as the archive.
- **Recurring tasks, dependencies, time tracking** — deferred to V2 per spec.
- **Vector indexing of `result` markdown** — deferred to V2; for now ClawdBot is responsible for any semantic indexing it wants on its own side.
