# L36 Social Post Approval via Telegram

ClawdBot handles interactive approval of L36 social media posts through Telegram inline buttons.

## How It Works

```
L36 Backend                        Telegram                     ClawdBot
    |                                  |                            |
    |-- sendMessage (inline buttons) ->|                            |
    |   via @TonyClawdBot token        |                            |
    |                                  |-- Tony taps button ------->|
    |                                  |                            |
    |<---- POST /api/social/posts/{id}/approval-action ------------|
    |                                  |                            |
    |                                  |<-- editMessageText --------|
    |                                  |   "Approved" or "Rejected" |
```

1. When a social post is submitted for approval, the L36 backend sends a Telegram message with **[Approve & Publish]** and **[Reject]** buttons
2. The message is sent via `@TonyClawdBot`'s bot token so ClawdBot receives callbacks
3. When Tony taps a button, ClawdBot intercepts the `callback_query`
4. ClawdBot calls the L36 backend API directly at `http://127.0.0.1:5050`
5. The original Telegram message is edited to show the result

## Files

| File | Location | Purpose |
|------|----------|---------|
| `social-approval.ts` | `clawdbot/src/telegram/` | Callback handler — parses button data, calls L36 API |
| `bot.ts` | `clawdbot/src/telegram/` | Early-return intercept for `social_*` callbacks |
| `telegram_approval_sender.py` | `l36/backend/app/utils/` | Sends notification with inline buttons |
| `social_post_approval_service.py` | `l36/backend/app/services/` | Calls sender after `submit_for_approval()` |
| `approval_routes.py` | `l36/backend/app/routes/social/` | `/approval-action` endpoint (approve/delete) |

## Callback Data Format

```
social_approve:{postId}    e.g. social_approve:123
social_reject:{postId}     e.g. social_reject:456
```

Telegram `callback_data` max is 64 chars. These are well under that limit.

## Authentication

- **Telegram -> ClawdBot**: ClawdBot's `allowFrom` restricts to Tony's chat ID (`7893917576`)
- **ClawdBot -> L36 API**: `X-Admin-Token` header using `ADMIN_TOKEN_MAIN` from Vault
- **L36 API is called at localhost:5050**: Bypasses oauth2-proxy on the public URL

## Environment Variables

### ClawdBot
- `ADMIN_TOKEN_MAIN` — from Vault, used in `X-Admin-Token` header to L36 API
- `L36_API_BASE` — defaults to `http://127.0.0.1:5050` (optional override)

### L36 Backend
- `CLAWDBOT_BOT_TOKEN` — `@TonyClawdBot`'s token, used to send approval messages
- `TELEGRAM_ADMIN_CHAT_ID` — Tony's Telegram user ID (`7893917576`)

Both are loaded from Vault (`secret/telegram` → `clawdbot_bot_token`, `admin_chat_id`).

## Two Bots

| Bot | Username | Role |
|-----|----------|------|
| Tony's Assistant | `@TonyClawdBot` | Chat + approval callbacks (long-polling) |
| L36 Notifications | `@l36_notifications_bot` | Passive L36 notifications (API only) |

Approval messages go through `@TonyClawdBot` so ClawdBot receives the button callbacks. `@l36_notifications_bot` is available for non-interactive notifications.

## Troubleshooting

**ClawdBot not responding to messages:**
- Check `systemctl --user status clawdbot`
- Ensure startup script unsets `TELEGRAM_BOT_TOKEN` after Vault sourcing (otherwise ClawdBot uses the wrong bot)
- Config token is in `/home/admin/.clawdbot/clawdbot.json` → `telegram.botToken`

**Button tap shows "Error contacting L36":**
- Check L36 backend is running: `docker ps | grep backend`
- Check `ADMIN_TOKEN_MAIN` is set in ClawdBot's env

**Button tap shows "Failed: ...":**
- The L36 API responded but the operation failed (e.g. no pending review, post not found)
- Check backend logs: `docker logs backend --tail 20`

**getUpdates conflict:**
- Another process is polling the same bot token
- Check for duplicate ClawdBot processes or a webhook set on the bot
- Clear webhook: `curl "https://api.telegram.org/bot{TOKEN}/deleteWebhook"`
