# Clawdbot OAuth Fix Guide

**Created:** 2026-01-07

## Problem

Error: `agent failed before reply. oauth token refresh failed for anthropic. Failed to refresh oauth token.`

This happens when:
- OAuth refresh token expires or gets invalidated
- You re-authenticate on Anthropic's website (invalidates old tokens)
- Extended period without using clawdbot

## File Locations

| File | Purpose |
|------|---------|
| `~/.clawdbot/agent/auth-profiles.json` | OAuth tokens storage |
| `~/.clawdbot/clawdbot.json` | Main config file |
| `~/.claude/.credentials.json` | Claude Code OAuth tokens |
| `/home/admin/clawdbot/scripts/check-auth.sh` | Token health check script |
| `/home/admin/clawdbot/scripts/sync-claude-code-auth.sh` | Claude Code → Clawdbot token sync |
| `/tmp/clawdbot/clawdbot.log` | Log file |
| `/tmp/clawdbot-auth-sync.log` | Token sync cron log |

## Script: check-auth.sh

**Location:** `/home/admin/clawdbot/scripts/check-auth.sh`

What it does:
- Reads token expiry from auth-profiles.json
- Shows time remaining until expiry
- Shows service running status
- Warns if token is expiring soon or already expired

## Fix Steps

### Step 1: Check Status
```bash
clawd-check
```

If it shows "TOKEN EXPIRED!" proceed to Step 2.

### Step 2: Re-authenticate
```bash
clawd-reauth
```

Navigate through the menu:
1. **Local (this machine)**
2. **Model/auth**
3. **Anthropic OAuth (Claude Pro/Max)**

### Step 3: Complete Browser Auth

1. Copy the URL shown
2. Open in browser (where you're logged into Anthropic Max)
3. Click **Authorize**
4. Copy the code (format: `code#state`)
5. Paste back in terminal **within 30 seconds**

### Step 4: Restart Service
```bash
clawd-restart
```

### Step 5: Verify
```bash
clawd-check
clawd-status
```

## Token Lifecycle

- **Access token:** ~8 hours validity (Anthropic's current setting)
- **Refresh token:** Longer validity, but can be invalidated by other OAuth clients
- **Auto-refresh:** Happens automatically when access token expires
- **Manual refresh needed:** Only when refresh token itself is invalidated

## Why Tokens Get Invalidated

1. Re-authenticating on claude.ai or console.anthropic.com
2. Subscription renewal/changes on Anthropic's side
3. Extended inactivity (refresh token expiry)
4. Security events on your Anthropic account
5. **Claude Code token collision** (see below)

---

## Claude Code Token Collision

### The Problem

If you run **both Clawdbot and Claude Code** on the same machine with the same Anthropic Max account, tokens will repeatedly fail.

**Root cause:** Both tools use the **same OAuth client_id** (`9d1c250a-e61b-44d9-88ed-5944d1962f5e`). When Claude Code refreshes its token, Anthropic invalidates Clawdbot's refresh token (and vice versa).

**Symptoms:**
- Token works for a few hours after re-auth, then fails
- `invalid_grant` error: "Refresh token not found or invalid"
- Claude Code continues working fine while Clawdbot fails

### Diagnosis

Test if refresh token is valid:
```bash
# Get your refresh token
REFRESH=$(jq -r '.profiles["anthropic:default"].refresh' ~/.clawdbot/agent/auth-profiles.json)

# Test it against Anthropic's endpoint
curl -s -X POST https://console.anthropic.com/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"refresh_token\",\"client_id\":\"9d1c250a-e61b-44d9-88ed-5944d1962f5e\",\"refresh_token\":\"$REFRESH\"}"
```

If you see `{"error": "invalid_grant", ...}` - Claude Code has invalidated your token.

### Solution: Token Sync Script

Since Claude Code successfully refreshes (and Clawdbot's tokens get invalidated), we sync Claude Code's valid tokens TO Clawdbot.

**Script location:** `/home/admin/clawdbot/scripts/sync-claude-code-auth.sh`

**Manual sync:**
```bash
/home/admin/clawdbot/scripts/sync-claude-code-auth.sh
```

**Automatic sync (cron):**
A cron job runs every 30 minutes to keep tokens in sync:
```
*/30 * * * * /home/admin/clawdbot/scripts/sync-claude-code-auth.sh --cron >> /tmp/clawdbot-auth-sync.log 2>&1
```

**How it works:**
1. Claude Code refreshes its token → gets new access + refresh tokens
2. Cron job (every 30 min) copies Claude Code's tokens to Clawdbot
3. Clawdbot uses the valid tokens from Claude Code

**File locations:**
| File | Purpose |
|------|---------|
| `~/.claude/.credentials.json` | Claude Code's OAuth tokens |
| `~/.clawdbot/agent/auth-profiles.json` | Clawdbot's OAuth tokens |
| `/home/admin/clawdbot/scripts/sync-claude-code-auth.sh` | Sync script |
| `/tmp/clawdbot-auth-sync.log` | Sync cron log |

### Alternative Solutions

1. **Use API key for Clawdbot** - If you have Anthropic API credits, use `api_key` mode instead of OAuth (avoids collision entirely)

2. **Run on separate machines** - Keep Clawdbot and Claude Code on different servers

3. **Manual re-auth** - Run `clawd-reauth` after heavy Claude Code usage (not recommended - tedious)

---

## Prevention

- Use clawdbot regularly (keeps tokens refreshed)
- After any Anthropic website authentication, re-auth clawdbot too
- Monitor with `clawd-check` periodically
- **If running Claude Code:** Ensure the sync cron job is active (see Claude Code Token Collision section)

## Service Management

```bash
# Check if running
systemctl --user status clawdbot

# Restart
systemctl --user restart clawdbot

# View logs
journalctl --user -u clawdbot -f

# Stop
systemctl --user stop clawdbot

# Start
systemctl --user start clawdbot
```

## Config Structure

**auth-profiles.json:**
```json
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "oauth",
      "provider": "anthropic",
      "access": "sk-ant-oat01-...",
      "refresh": "sk-ant-ort01-...",
      "expires": 1767757329694
    }
  }
}
```

The `expires` field is milliseconds since epoch. The check-auth.sh script converts this to human-readable time remaining.
