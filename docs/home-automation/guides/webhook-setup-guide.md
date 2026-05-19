# Dual-Webhook Architecture: Frigate → Discord Direct for Images

## Overview

This guide documents a cost-effective architecture for delivering Frigate security camera events to Discord:

- **Webhook Path 1 (Primary)**: Frigate → Discord Webhooks (Direct Image Delivery)
  - Direct HTTP POST from Frigate to Discord webhooks in specific channels
  - Images embedded directly in Discord messages
  - No token cost (Discord native webhooks)
  - Fastest delivery with rich formatting

- **Webhook Path 2 (Optional)**: Frigate → Clawdbot Webhook (Text Analysis)
  - Route specific events (low confidence, unknown objects) to Clawdbot for AI analysis
  - Optional text generation, filtering, or enrichment
  - Clawdbot delivers analysis results back to Discord or other platforms
  - Saves on API costs by being selective about which events get analyzed

### Architecture Diagram

```
Frigate Events
    │
    ├─ Person Detected (high conf)
    │  └─> Discord Webhook (Direct)
    │      └─> Channel: #motion-person
    │          └─ Image + Embed + Timestamp
    │
    └─ Unknown Object / Low Confidence
       └─> Clawdbot Webhook (Analysis)
           └─ AI Analysis (optional)
             └─> Discord via Clawdbot
                 └─ Text summary + image reference
```

---

## Part A: Discord Webhook Setup (Direct Image Delivery)

Discord webhooks allow Frigate to post messages directly to channels without requiring a bot user. This is the **primary path** for immediate, cost-free image delivery.

### Step 1: Create Discord Webhook in Each Channel

#### In Discord Desktop/Web:

1. Go to the channel where you want Frigate to post (e.g., `#motion-detection`)
2. **Channel Settings** → **Integrations** → **Webhooks** → **New Webhook**
3. Name it (e.g., `Frigate Motion` or `Frigate Front Door`)
4. Click **Copy Webhook URL**

Example webhook URL:
```
https://discord.com/api/webhooks/1234567890123456789/abcdefghijklmnopqrstuvwxyz_1234567890ABCDEFGHIJ_KlmnopQRstuvWxyzABCDef1234567890
```

**Save this URL securely** — it acts like a password for posting to that channel.

#### Create Multiple Webhooks (Recommended):

- `#motion-person` — high-confidence person detections
- `#motion-other` — cars, animals, packages
- `#motion-unknown` — low-confidence or unclassified objects

### Step 2: Frigate Configuration

In your Frigate `config.yml`, configure the `notifications` section to send webhooks to Discord:

```yaml
notifications:
  # Define discord service
  service:
    type: webhook
    enabled: true

  # Detect triggers map to Discord webhooks
  detections:
    # High-confidence person → #motion-person
    person:
      webhook: "https://discord.com/api/webhooks/WEBHOOK_ID_1/WEBHOOK_TOKEN_1"
      format: "discord_embed"

    # Vehicle detections → #motion-other
    car:
      webhook: "https://discord.com/api/webhooks/WEBHOOK_ID_2/WEBHOOK_TOKEN_2"
      format: "discord_embed"

    # Low-confidence / unknown → Clawdbot for analysis
    unknown:
      webhook: "https://YOUR_CLAWDBOT_GATEWAY/hooks/frigate"
      format: "json"
      # Will be handled by Part B mapping
```

### Step 3: JSON Payload Format with Discord Embeds

When Frigate sends to a Discord webhook, use this embed format for rich messages:

```json
{
  "username": "Frigate Motion Detection",
  "avatar_url": "https://frigate.example.com/static/images/logo.png",
  "embeds": [
    {
      "title": "🚨 Motion Detected: Person",
      "description": "Front Door Camera",
      "color": 16711680,
      "fields": [
        {
          "name": "Confidence",
          "value": "95%",
          "inline": true
        },
        {
          "name": "Time",
          "value": "2024-01-15 14:23:45",
          "inline": true
        },
        {
          "name": "Camera",
          "value": "front_door",
          "inline": false
        }
      ],
      "image": {
        "url": "https://frigate.example.com/api/events/abc123/snapshot.jpg"
      },
      "footer": {
        "text": "Frigate NVR • Event ID: abc123"
      }
    }
  ]
}
```

**Key fields**:
- `username`: Shows as sender in Discord
- `avatar_url`: Custom icon for webhook (optional)
- `embeds[0].image.url`: **CRITICAL** — must be publicly accessible
- `embeds[0].color`: Hex color (16711680 = red, 65280 = green, 255 = blue)
- `embeds[0].fields`: Metadata (confidence, timestamp, camera name)

### Step 4: Image Access — Frigate Snapshots Must Be Public

For Discord to display the snapshot image in the embed, it **must reach the Frigate snapshot URL** from the internet.

#### Option A: Tailscale Funnel (Recommended)

Tailscale Funnel exposes a local service to the public internet securely:

```bash
# 1. Enable Funnel on your Frigate machine
tailscale funnel on

# 2. Expose Frigate on port 5000 to the public
tailscale funnel 5000

# 3. Get your public URL
tailscale funnel status
# Output: https://your-machine-name.ts.net/
```

Your Frigate snapshot URL becomes:
```
https://your-machine-name.ts.net/api/events/{event_id}/snapshot.jpg
```

Update webhook payloads to use this public URL.

#### Option B: Reverse Proxy (Alternative)

Set up a reverse proxy (nginx, Caddy) with a public domain:

```nginx
server {
    server_name frigate.example.com;

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
    }
}
```

**Security Note**: Use TLS (HTTPS) and consider IP allowlisting if possible.

#### Option C: Disable Images in Embeds

If you can't expose Frigate publicly, omit the `image` field from the embed. Discord will still post text metadata without the snapshot.

---

## Part B: Clawdbot Webhook (Optional Text Analysis)

For events that need additional processing (AI analysis, filtering, enrichment), route them to Clawdbot instead of Discord directly.

### When to Use Clawdbot Analysis

- **Low-confidence detections** (< 70% confidence)
- **Unknown object types** (no matching trained class)
- **Specific scenarios** (late night motion, repeated alerts)
- **Context enrichment** (check if person is known, correlate with other sensors)

### Hook Mapping Configuration

In your Clawdbot config (`~/.clawdbot/clawdbot.json`):

```json5
{
  hooks: {
    enabled: true,
    token: "your-secure-frigate-token",
    path: "/hooks",

    mappings: [
      {
        // Route low-confidence detections to analysis
        id: "frigate-unknown",
        match: {
          path: "frigate",
          source: "motion"  // optional source check
        },
        action: "agent",
        name: "Frigate Motion",
        messageTemplate: `Motion detected: {{object_type}}
Confidence: {{confidence}}%
Camera: {{camera}}
Time: {{timestamp}}
Image: {{snapshot_url}}`,
        // Route analysis result to Discord
        deliver: true,
        provider: "discord",
        to: "channel:motion-analysis",
        model: "anthropic/claude-3-5-sonnet",
        thinking: "low",
        wakeMode: "now"
      },
      {
        // High-confidence person → go straight to Discord
        id: "frigate-person",
        match: {
          path: "frigate",
          source: "person_high_conf"
        },
        action: "wake",
        wakeMode: "next-heartbeat"
      }
    ]
  }
}
```

### Event Routing Rules

Route events based on object type and confidence:

```yaml
frigate_config.yml (pseudocode):

detections:
  person:
    # High confidence → direct Discord
    high_conf:
      webhook: "https://discord.com/api/webhooks/.../..."
      condition: "confidence > 80"

    # Low confidence → Clawdbot analysis
    low_conf:
      webhook: "https://your-clawdbot.example.com/hooks/frigate"
      condition: "confidence < 70"

  unknown:
    # Always analyze unknowns
    webhook: "https://your-clawdbot.example.com/hooks/frigate"
    format: "json"
```

### Clawdbot Hook Payload from Frigate

Send raw Frigate event data to Clawdbot:

```json
{
  "source": "motion",
  "event_id": "abc123def456",
  "camera": "front_door",
  "object_type": "person",
  "confidence": 45,
  "timestamp": "2024-01-15T14:23:45Z",
  "snapshot_url": "https://your-machine-name.ts.net/api/events/abc123/snapshot.jpg",
  "description": "Low confidence person detection on front_door"
}
```

Clawdbot's agent will:
1. Receive the webhook payload
2. Generate a prompt from `messageTemplate`
3. Run the AI analysis
4. Post results to the specified Discord channel

---

## Token Generation & Security

### Generate Secure Frigate Hook Token

Use OpenSSL to create a cryptographically strong token:

```bash
# 32-byte hex token (256-bit security)
openssl rand -hex 32

# Example output:
# a3f7e2c1b9d8f4a6c7e9f1d2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1

# Or use shorter variant (16 bytes / 128-bit)
openssl rand -hex 16
# Example: 8a7f3e2c1d9b4a6f
```

### Store Tokens Securely

**Do NOT commit tokens to git or environment files.**

```bash
# Option 1: Environment variable (on server with `set -a`)
export FRIGATE_WEBHOOK_TOKEN="a3f7e2c1b9d8f4a6c7e9f1d2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"

# Option 2: Separate credentials file (600 permissions)
cat > ~/.frigate/webhooks.env << 'EOF'
FRIGATE_WEBHOOK_TOKEN=a3f7e2c1b9d8f4a6c7e9f1d2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
FRIGATE_ANALYSIS_TOKEN=b4g8f3d2c1a9e7f5c3d1b9a7f5e3d1b9a7f5e3d1b9a7f5e3d1b9a7f5e3d1
EOF
chmod 600 ~/.frigate/webhooks.env

# Option 3: Key management service (HashiCorp Vault, AWS Secrets Manager)
# Recommended for production
```

### Token Rotation

Rotate tokens periodically (quarterly or after staff changes):

```bash
# 1. Generate new token
NEW_TOKEN=$(openssl rand -hex 32)

# 2. Update Clawdbot config
# Edit ~/.clawdbot/clawdbot.json, update hooks.token

# 3. Update Frigate config (if hardcoded)
# Edit Frigate config.yml notification webhook URLs

# 4. Test with new token (see Testing section)

# 5. Document rotation in audit log
echo "$(date): Rotated Frigate webhook token" >> ~/.frigate/audit.log
```

---

## Testing Procedures

### Test 1: Discord Webhook Connectivity

```bash
# Simple POST to Discord webhook
curl -X POST "https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Frigate test message",
    "username": "Frigate Test"
  }'

# Expected: Discord posts the message
```

### Test 2: Discord Webhook with Embed

```bash
curl -X POST "https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "Frigate Motion Detection",
    "embeds": [
      {
        "title": "Test: Motion Detected",
        "description": "Front Door Camera",
        "color": 16711680,
        "fields": [
          {
            "name": "Confidence",
            "value": "92%",
            "inline": true
          },
          {
            "name": "Object",
            "value": "person",
            "inline": true
          }
        ]
      }
    ]
  }'
```

### Test 3: Discord Webhook with Image

```bash
curl -X POST "https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "Frigate Motion Detection",
    "embeds": [
      {
        "title": "Motion: Person Detected",
        "image": {
          "url": "https://your-machine-name.ts.net/api/events/test123/snapshot.jpg"
        }
      }
    ]
  }'

# If image doesn't load:
# - Check Frigate public URL is accessible
# - Verify image file exists
# - Test URL directly in browser
```

### Test 4: Clawdbot Webhook Auth

```bash
# Test hook with Bearer token auth
curl -X POST "http://your-clawdbot.example.com/hooks/frigate" \
  -H "Authorization: Bearer your-secure-frigate-token" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "motion",
    "camera": "front_door",
    "object_type": "person",
    "confidence": 45,
    "timestamp": "2024-01-15T14:23:45Z"
  }'

# Expected responses:
# - 202 Accepted: Hook processed, agent run started
# - 401 Unauthorized: Token invalid or missing
# - 400 Bad Request: Payload invalid
```

### Test 5: Clawdbot Webhook with Query Param Token

```bash
# Alternative: token as query parameter
curl -X POST "http://your-clawdbot.example.com/hooks/frigate?token=your-secure-frigate-token" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "motion",
    "camera": "front_door",
    "object_type": "car",
    "confidence": 78
  }'
```

### Test 6: End-to-End Flow

```bash
# Simulate Frigate event → Clawdbot → Discord

# 1. Send webhook to Clawdbot
curl -X POST "http://your-clawdbot.example.com/hooks/frigate" \
  -H "x-clawdbot-token: your-secure-frigate-token" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "motion",
    "camera": "driveway",
    "object_type": "unknown",
    "confidence": 35,
    "timestamp": "2024-01-15T14:23:45Z",
    "snapshot_url": "https://your-machine-name.ts.net/api/events/xyz789/snapshot.jpg"
  }'

# 2. Wait ~5-10 seconds for agent processing
sleep 10

# 3. Check Discord for:
#    - Agent analysis posted to #motion-analysis
#    - Timestamp, confidence, object type visible
#    - Optional: image reference or snapshot link

# 4. Check Clawdbot logs for any errors
tail -f ~/.clawdbot/gateway.log
```

---

## Troubleshooting Common Webhook Issues

### Issue: Discord Webhook Returns 404 Not Found

**Cause**: Webhook URL is invalid or deleted.

**Fix**:
1. Verify webhook URL is complete (includes `/webhooks/ID/TOKEN`)
2. Regenerate webhook in Discord (Channel Settings → Integrations → Webhooks)
3. Update all references in config

### Issue: Image Not Loading in Discord Embed

**Cause**: Frigate snapshot URL not publicly accessible.

**Fix**:
1. Test URL directly:
   ```bash
   curl -I "https://your-machine-name.ts.net/api/events/abc123/snapshot.jpg"
   ```
   Should return `200 OK`, not `403 Forbidden` or `404 Not Found`.

2. If using Tailscale Funnel:
   ```bash
   tailscale funnel status
   # Should show: funnel listening on port 5000
   ```

3. If using reverse proxy, test endpoint:
   ```bash
   curl "http://localhost:5000/api/events/abc123/snapshot.jpg" -v
   ```

4. Whitelist Discord CDN in firewall (if applicable):
   - Discord image downloads from `images.discordapp.net`
   - Allow HTTPS (443) for this domain

### Issue: Clawdbot Webhook Returns 401 Unauthorized

**Cause**: Token missing, invalid, or using wrong auth header.

**Fix**:
1. Verify token in request matches `hooks.token` in config
2. Check auth header format:
   ```bash
   # Any of these work:
   -H "Authorization: Bearer TOKEN"
   -H "x-clawdbot-token: TOKEN"
   "?token=TOKEN"
   ```
3. Restart Clawdbot gateway after config changes:
   ```bash
   clawdbot gateway --force
   ```

### Issue: Webhook Timeout or No Response

**Cause**: Clawdbot gateway not running, network unreachable, or firewall blocking.

**Fix**:
1. Verify Clawdbot running:
   ```bash
   clawdbot providers status
   ```

2. Check connectivity:
   ```bash
   curl -v "http://your-clawdbot.example.com/hooks/frigate" \
     -H "x-clawdbot-token: token"
   ```

3. Check firewall/NAT:
   - If Frigate and Clawdbot on same network, use `localhost:18789`
   - If remote, ensure gateway is publicly reachable or use Tailscale

4. Monitor logs:
   ```bash
   tail -f ~/.clawdbot/gateway.log | grep "hook\|webhook"
   ```

### Issue: High-Confidence Detections Not Appearing

**Cause**: Frigate condition logic not matching, or webhook URL misconfigured.

**Fix**:
1. Check Frigate event log for detection:
   ```bash
   tail -f /path/to/frigate/logs/frigate.log | grep "person\|detect"
   ```

2. Verify condition in Frigate config:
   ```yaml
   detections:
     person:
       webhook: "https://discord.com/api/webhooks/..."
       condition: "confidence > 80"  # Adjust threshold
   ```

3. Test webhook manually with fake event data

4. Check Discord webhook logs (GitHub → Settings → Integrations → Webhooks, look for recent deliveries)

---

## Cost Savings Calculation

Using dual webhooks saves significantly on API costs:

### Baseline: 100 daily events, all sent to Claude for analysis

```
Events/day: 100
Claude calls: 100
Cost per call: $0.003 (input) + $0.015 (output) = $0.018
Daily cost: 100 × $0.018 = $1.80
Monthly: $54.00
Yearly: $648.00
```

### Optimized: Direct Discord (90 events) + Selective Analysis (10 events)

```
Direct Discord events: 90 × $0.00 = $0.00
Analyzed events: 10
Claude calls: 10 × $0.018 = $0.18
Daily cost: $0.18
Monthly: $5.40
Yearly: $64.80

Savings: $583.20/year (90% reduction)
```

### Key savings drivers:

1. **Direct image delivery**: Discord native, zero API cost
2. **Event filtering**: Only analyze low-confidence or unknown objects
3. **Selective routing**: High-confidence detections skip analysis entirely

---

## Summary: Quick Reference

| Component | Purpose | Cost | Auth |
|-----------|---------|------|------|
| Discord Webhook | Direct image delivery | Free | URL (webhook token embedded) |
| Tailscale Funnel | Public snapshot access | Free | Tailscale auth |
| Clawdbot Hook | Optional text analysis | ~$0.018/event | Bearer token |
| Frigate Config | Event routing rules | N/A | N/A |

**Next steps**:
1. Create Discord webhooks in each channel (Part A)
2. Configure Frigate notifications with embed format
3. Set up Tailscale Funnel for image access
4. (Optional) Add Clawdbot hook mapping for analysis
5. Test each webhook path independently
6. Monitor deliveries and adjust event routing

---

## Additional Resources

- [Discord Webhooks API](https://discord.com/developers/docs/resources/webhook)
- [Clawdbot Webhooks](/automation/webhook)
- [Tailscale Funnel Docs](https://tailscale.com/kb/1223/funnel)
- [Frigate Documentation](https://frigate.video/docs/)
