# Home Assistant Skill Setup Guide

## Installation Status

✅ **Installation Complete** - The Home Assistant skill has been successfully installed and configured.

### What Was Done

1. **Skill Installation**: Downloaded and installed the `homeassistant` skill from ClawdHub
   - Location: `/home/admin/gen2-tony/skills/homeassistant/`
   - Version: 1.0.0
   - Source: https://clawdhub.com/dbhurley/homeassistant

2. **Configuration Added**: Updated `/home/admin/.clawdbot/clawdbot.json` with:
   - **HA_URL**: Placeholder set to `http://homeassistant.tailscale-name.ts.net:8123`
   - **HA_TOKEN**: Placeholder set to `YOUR_HA_LONG_LIVED_TOKEN_HERE`
   - **Skill Enabled**: `homeassistant` entry added to `skills.entries` with `enabled: true`

3. **Existing Integration**: The system already has a Discord channel configured for home automation:
   - Channel: `home-control` (in the l36-command-center guild)
   - System prompt configured to use the homeassistant skill for device operations

---

## Next Steps: Configuration

### 1. Get Your Home Assistant Long-Lived Access Token

1. Open your Home Assistant instance
2. Navigate to **Profile** (click your user icon in the sidebar)
3. Scroll down to **Long-Lived Access Tokens** section
4. Click "Create Token"
5. Give it a name like "Clawdbot Gateway" for easy identification
6. Copy the generated token (it's a long string starting with `eyJ...`)
7. Store it securely - you'll need it in the next step

### 2. Update the Home Assistant URL

Replace the placeholder URL in `/home/admin/.clawdbot/clawdbot.json`:

**Before:**
```json
"HA_URL": "http://homeassistant.tailscale-name.ts.net:8123"
```

**After** (example with actual Tailscale hostname):
```json
"HA_URL": "http://homeassistant.your-actual-tailscale.ts.net:8123"
```

Or if you're using a local IP:
```json
"HA_URL": "http://192.168.1.100:8123"
```

Or if you have a domain name:
```json
"HA_URL": "https://homeassistant.yourdomain.com"
```

### 3. Update the Home Assistant Token

Replace the placeholder token in `/home/admin/.clawdbot/clawdbot.json`:

**Before:**
```json
"HA_TOKEN": "YOUR_HA_LONG_LIVED_TOKEN_HERE"
```

**After** (replace with the actual token from step 1):
```json
"HA_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 4. Restart the Gateway

After updating the configuration, restart the Clawdbot gateway to pick up the new environment variables:

```bash
# Kill any running Clawdbot processes
pkill -f clawdbot

# Restart via the Clawdbot Mac app (if running on macOS)
# Or restart manually:
pnpm clawdbot agent --thinking low
```

---

## Supported Device Types & Commands

The Home Assistant skill supports control of various entity domains:

### Switches & Smart Plugs
```bash
# List all switches
curl -s "$HA_URL/api/states" -H "Authorization: Bearer $HA_TOKEN" | \
  jq -r '.[] | select(.entity_id | startswith("switch.")) | .entity_id'

# Turn on a switch
curl -s -X POST "$HA_URL/api/services/switch/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "switch.office_lamp"}'

# Turn off a switch
curl -s -X POST "$HA_URL/api/services/switch/turn_off" \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "switch.office_lamp"}'
```

### Lights
```bash
# Turn on with brightness
curl -s -X POST "$HA_URL/api/services/light/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "light.living_room", "brightness_pct": 80}'

# Turn off
curl -s -X POST "$HA_URL/api/services/light/turn_off" \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "light.living_room"}'
```

### Scenes
```bash
# Trigger a scene (e.g., "movie time" scene)
curl -s -X POST "$HA_URL/api/services/scene/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "scene.movie_time"}'
```

### Other Supported Domains
- `light.*` — Lights (Hue, LIFX, etc.)
- `switch.*` — Smart plugs, generic switches
- `scene.*` — Pre-configured scenes
- `automation.*` — Automations
- `climate.*` — Thermostats
- `cover.*` — Blinds, garage doors
- `media_player.*` — TVs, speakers
- `sensor.*` — Temperature, humidity, etc.

---

## Verification & Testing

### Quick Test Commands

Once configured and restarted, you can verify the setup with these curl commands:

**1. Test API Connectivity:**
```bash
export HA_URL="http://homeassistant.your-actual-url.ts.net:8123"
export HA_TOKEN="your_actual_token_here"

curl -s "$HA_URL/api/" -H "Authorization: Bearer $HA_TOKEN" | jq .
```

**2. List All Entities:**
```bash
curl -s "$HA_URL/api/states" \
  -H "Authorization: Bearer $HA_TOKEN" | jq -r '.[] | .entity_id' | head -20
```

**3. Get State of Specific Entity:**
```bash
curl -s "$HA_URL/api/states/light.living_room" \
  -H "Authorization: Bearer $HA_TOKEN" | jq .
```

**4. Test a Simple Action (turn on a light):**
```bash
curl -s -X POST "$HA_URL/api/services/light/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "light.living_room"}'
```

### Discord Integration Test

Once the gateway is restarted, test the skill from Discord:

1. Go to the **#home-control** channel
2. Send a message like:
   - "Turn on the living room light"
   - "What lights are on right now?"
   - "Turn off all switches"

The system prompt in the #home-control channel instructs the agent to use the homeassistant skill for device operations.

---

## Configuration Files Modified

### `/home/admin/.clawdbot/clawdbot.json`

**Environment Variables Added:**
```json
"env": {
  "HA_URL": "http://homeassistant.tailscale-name.ts.net:8123",
  "HA_TOKEN": "YOUR_HA_LONG_LIVED_TOKEN_HERE",
  ...
}
```

**Skill Enabled:**
```json
"skills": {
  "entries": {
    "homeassistant": {
      "enabled": true
    },
    ...
  }
}
```

---

## Troubleshooting

### Token Not Working
- Verify the token is a **Long-Lived Access Token** (not a session token)
- Check that the token hasn't expired (long-lived tokens don't expire, but you may have created a session token by mistake)
- Generate a new token following the "Get Your Home Assistant Long-Lived Access Token" section above

### URL Not Reachable
- If using Tailscale: Verify Tailscale is running on both machines
- If using IP address: Ensure the IP is correct and on the same network
- If using domain: Check DNS resolution with `nslookup` or `dig`
- Test with: `curl -v "$HA_URL/api/"` to see detailed connection info

### Skill Not Loading
- After updating config, ensure you **restarted the Clawdbot gateway**
- Check that the skill is in the correct location: `/home/admin/gen2-tony/skills/homeassistant/`
- Verify JSON syntax in clawdbot.json is valid (no trailing commas, proper quotes)

### Commands Not Working from Discord
- Verify configuration is correct with test curl commands first
- Check the #home-control channel system prompt is properly configured
- Ensure the homeassistant skill is enabled in clawdbot.json
- Restart the gateway after any changes

---

## Security Notes

- **Long-Lived Tokens**: These tokens don't expire by default. Store them securely.
- **API Access**: The token has full API access to your Home Assistant instance.
- **Network**: Use HTTPS in production if exposing Home Assistant to the internet.
- **Tailscale**: Using Tailscale is recommended for secure remote access.

---

## Additional Resources

- Home Assistant Official Docs: https://www.home-assistant.io/
- Home Assistant API Documentation: https://developers.home-assistant.io/docs/api/rest/
- ClawdHub Skill Registry: https://clawdhub.com/dbhurley/homeassistant
- Clawdbot Skills Guide: /docs/tools/skills
- ClawdHub CLI Guide: /docs/tools/clawdhub

---

## Quick Reference: Configuration Checklist

- [ ] Retrieved Long-Lived Access Token from Home Assistant Profile
- [ ] Updated `HA_URL` with actual Home Assistant URL/IP
- [ ] Updated `HA_TOKEN` with actual long-lived token
- [ ] Verified JSON syntax in `/home/admin/.clawdbot/clawdbot.json`
- [ ] Restarted Clawdbot gateway
- [ ] Tested API connectivity with curl command
- [ ] Tested from Discord #home-control channel
- [ ] Verified lights/switches respond to commands

---

**Setup completed on**: 2026-01-11
**Skill version**: 1.0.0
**Installation method**: ClawdHub CLI
