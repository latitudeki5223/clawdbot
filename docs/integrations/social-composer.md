# L36 Social Composer — ClawdBot Integration

> Canonical plan / source of truth: `/home/admin/.claude/plans/we-are-working-on-cosmic-dahl.md` on the L36 host. Read it for full background, decision log, and design rationale.

## Overview

The L36 Social Composer is a single backend endpoint (`POST /api/social/compose-and-queue`) that lets ClawdBot trigger a social media post **without invoking Claude or the Pi SDK from ClawdBot's side**. ClawdBot sends a topic/tone/target; the L36 backend orchestrates the LLM call to LangGraph server-side, drafts the post, persists it via the existing `social_posts` machinery, and submits it for human approval through the established Telegram flow (`src/telegram/social-approval.ts`).

ClawdBot is the **scheduler / trigger**. L36 is the **content factory + approval queue**. The two never overlap — ClawdBot does not own copy, hashtags, captions, or image selection. That keeps tenant safety, secret handling, and brand voice consistent inside L36.

## Auth setup

- ClawdBot uses its admin-role agent key (`L36_AGENT_ADMIN_KEY`), the same key already used for approval callbacks. Composer is wrapped in `@require_admin_or_agent` server-side.
- Suggested env var name: `L36_AGENT_ADMIN_KEY` (already set up in ClawdBot's `.env`).
- Send on every request: `X-API-Key: <raw_key>`.
- Send on every request: `X-Context-ID: 1` (Latitude36 main tenant).
- Base URLs:
  - Dev / on-host: `http://localhost:5050`
  - Production: `https://l36.com.au`
- All paths below are relative to `<base>/api/social`.
- Rotation: same lifecycle as the kanban runner key — revoke via `agent_api_keys` row, issue a new one, re-read `.env`. ClawdBot must handle 401s by reloading its secret store.

## Endpoint reference

### POST /api/social/compose-and-queue

Generate copy via LangGraph, create a draft post, and submit for approval.

- Headers: `X-API-Key`, `X-Context-ID`, `Content-Type: application/json`
- Body:

```json
{
  "topic": "Carolina Reaper season — drop announcement for Kangaroo Kick",
  "tone": "playful",
  "target_account": "latitude_36",
  "platform": "instagram",
  "schedule_at": "2026-05-25T09:00:00+10:00"
}
```

- Response 201:

```json
{
  "success": true,
  "data": {
    "post_id": 1234,
    "platform": "instagram",
    "social_account_id": 7,
    "status": "pending_approval",
    "scheduled_for": "2026-05-25T09:00:00+10:00",
    "preview": {
      "caption": "First Carolina Reapers of the season...",
      "hashtags": ["#hotsauce", "#carolinareaper"]
    }
  }
}
```

- Errors:
  - 400 — missing `topic`/`tone`/`target_account`, invalid `platform`, malformed `schedule_at`
  - 401 — bad/missing key
  - 403 — admin token rejected (only agent-role keys with `admin` role)
  - 404 — `target_account` did not resolve to a social account in this context
  - 502 — LangGraph upstream failed
  - 500 — unexpected error

## Validation rules

- `topic` — required, free-form string, max 500 chars. The seed for LangGraph generation.
- `tone` — required, one of `playful`, `informative`, `urgent`, `educational`, `promotional`. Maps to LangGraph prompt template.
- `target_account` — required. Resolved by lookup against `social_media_accounts.account_handle` (preferred) or `account_name` in the current `context_id`. Strip leading `@` before sending.
- `platform` — optional. One of `instagram`, `facebook`, `tiktok`, `linkedin`, `x`, `pinterest`, `youtube`. Required as a disambiguator if `target_account` matches more than one account.
- `schedule_at` — optional ISO 8601 timestamp with timezone. If omitted, post lands as `draft` (no auto-publish). If provided, `auto_publish=true` is set on the post row.
- Server-controlled (do not send): `content_id`, `social_account_ids`, `channel_specific_data`, `caption`, `hashtags`, `created_by`, `assigned_agent`.

## Common ClawdBot flows

Replace `<KEY>` with the raw admin key, `<BASE>` with `http://localhost:5050` (dev) or `https://l36.com.au` (prod).

### 1. Trigger a post (immediate draft, approval-gated)

```bash
curl -X POST "<BASE>/api/social/compose-and-queue" \
  -H "X-API-Key: <KEY>" \
  -H "X-Context-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Friday tasting session at the markets",
    "tone": "playful",
    "target_account": "latitude_36",
    "platform": "instagram"
  }'
# → {"success":true,"data":{"post_id":1234,"status":"pending_approval",...}}
```

Tony approves or rejects from Telegram. ClawdBot does not need to poll the post — the existing approval flow (`src/telegram/social-approval.ts:21+`) hits `/api/social/posts/{id}/approval-action` when the inline button fires.

### 2. Schedule a post for a specific time

```bash
curl -X POST "<BASE>/api/social/compose-and-queue" \
  -H "X-API-Key: <KEY>" \
  -H "X-Context-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "New product drop teaser",
    "tone": "urgent",
    "target_account": "latitude_36",
    "platform": "instagram",
    "schedule_at": "2026-05-25T09:00:00+10:00"
  }'
# → {"success":true,"data":{"post_id":1234,"scheduled_for":"2026-05-25T09:00:00+10:00",...}}
```

### 3. Handle 404 (account not found)

If `target_account` does not resolve, server returns 404 with the list of valid handles in this context. ClawdBot should surface this to Tony (Telegram) rather than retry — it means the social account row is missing, not a transient failure.

### 4. Handle 502 (LangGraph upstream failure)

LangGraph generation can fail (rate limit, model timeout, prompt rejection). On 502:

- Do not retry automatically more than once.
- Surface the error to Tony with the original `topic`/`tone`/`target_account` so he can re-trigger or pick up the work manually.
- The composer service logs the LangGraph error for backend triage.

## Pitfalls

- **Never call `langgraph-agent` (port 8000) directly.** This endpoint is the *only* sanctioned path. The langgraph-agent service is Docker-internal, unauthenticated, and behind no public proxy.
- **Never invent a sibling endpoint.** If you need a feature this endpoint doesn't have (e.g. carousel, video, alt-tenant), surface it to Tony — do not add an L36-side route from the outside.
- **Do not send `caption` or `hashtags` in the body.** They are server-generated. If you send them, they are ignored. Brand voice is enforced inside the composer service, not by callers.
- **`X-Context-ID: 1`** — Latitude36 main tenant. Other contexts exist for sibling tenants — confirm with Tony before sending a different context.
- **Single-platform per call.** This endpoint creates one post for one (account, platform) pair. To post the same topic to multiple platforms, issue multiple calls. The composer regenerates per-call so each platform gets a platform-appropriate version.
- **`schedule_at` must be timezone-aware.** Naive timestamps return 400. Use `+10:00` (AEST) or `Z` (UTC).
- **No idempotency key today.** Two identical calls produce two draft posts. ClawdBot is responsible for not double-firing the same cron job. Track the `post_id` from the response to detect duplicates client-side.

## Out of scope (for now)

- **Multi-platform fan-out** — one post per call. Multi-platform broadcasting deferred to V2.
- **Carousels, video, multi-image** — first cut is text + auto-selected image. Custom media uploads deferred.
- **Direct publish (skip approval)** — composer always lands in `pending_approval`. Bypass would require a new endpoint and a new auth gate.
- **Webhooks for post status** — ClawdBot must rely on the existing Telegram approval flow for state change signals. Polling `/api/social/posts/{id}` is allowed but not required for the standard flow.
- **Listening on ClawdBot for "post done" callbacks** — the approval callback lives at `/api/social/posts/{id}/approval-action` server-side. ClawdBot's role ends at trigger + Telegram confirm.
- **Cross-tenant composing** — context is pinned per call. No batch-across-contexts.
