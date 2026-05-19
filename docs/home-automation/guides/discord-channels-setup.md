# Discord Home Automation Integration Setup

## Configuration Status: COMPLETED

The following 5 channels have been added to `~/.clawdbot/clawdbot.json` under guild `1458983535896559658`:

### Channels Added

1. **camera-alerts**
   - Purpose: HIGH PRIORITY security alerts from Frigate person detections
   - System Prompt: Configured to format alerts as 🚨 with camera name, time, confidence
   - Images: Sent via direct webhook (not through AI)

2. **home-control**
   - Purpose: Home automation device control and operations
   - System Prompt: Uses homeassistant skill for device operations
   - Requires: State confirmation for all actions

3. **frigate-events**
   - Purpose: General Frigate monitoring events (motion, pets, vehicles)
   - System Prompt: Uses frigate-monitor skill with emoji formatting
   - Types: 📹 motion, 🐕 pets, 🚗 vehicles
   - Images: Sent via direct webhook

4. **camera-snapshots**
   - Purpose: On-demand camera status queries and recent events
   - System Prompt: Text metadata only (no images to be sent)
   - Usage: Answer questions about camera status

5. **automation-logs**
   - Purpose: Home Assistant automation execution logs
   - System Prompt: Formatted log output [Time] Automation triggered: <name>
   - Usage: Track automation execution and triggers

## Next Steps: Manual Discord Setup

### 1. Create Discord Channels

You must manually create these channels in Discord within your guild (l36-command-center):

- `#camera-alerts`
- `#home-control`
- `#frigate-events`
- `#camera-snapshots`
- `#automation-logs`

**Instructions:**
1. Open Discord and go to your server "l36-command-center"
2. Click the "+" icon next to channel categories (or use the dropdown menu)
3. Select "Create Channel"
4. Name the channel (use the exact names listed above)
5. Set Category: Optional (organize under "Home Automation" category if desired)
6. Ensure the channel is set to Text Channel
7. Click Create

### 2. Get Channel IDs

After creating each channel in Discord, you need to get its Discord Channel ID:

**Method A: Enable Developer Mode (Recommended)**
1. Go to Discord Settings > Advanced > Developer Mode (toggle ON)
2. Right-click each channel name
3. Select "Copy channel ID"

**Method B: Via URL**
1. Click the channel
2. Look at the Discord URL: `https://discord.com/channels/[GUILD_ID]/[CHANNEL_ID]`
3. The last number is the Channel ID

### 3. Update Channel ID Mapping (Optional but Recommended)

Create or update `~/.clawdbot/channel-ids.json` to map friendly names to Discord Channel IDs:

```json
{
  "camera-alerts": "YOUR_CHANNEL_ID_HERE",
  "home-control": "YOUR_CHANNEL_ID_HERE",
  "frigate-events": "YOUR_CHANNEL_ID_HERE",
  "camera-snapshots": "YOUR_CHANNEL_ID_HERE",
  "automation-logs": "YOUR_CHANNEL_ID_HERE"
}
```

**How to use:**
1. Create the file if it doesn't exist
2. Replace `YOUR_CHANNEL_ID_HERE` with the actual Discord Channel IDs from step 2
3. Save the file
4. Use in skills/code via `const channelIds = JSON.parse(fs.readFileSync(expandPath('~/.clawdbot/channel-ids.json'), 'utf-8'))`

### 4. Verify Configuration

Test the setup:
```bash
# View the updated configuration
cat ~/.clawdbot/clawdbot.json | jq '.discord.guilds."1458983535896559658".channels'

# Check if channel-ids.json exists
cat ~/.clawdbot/channel-ids.json 2>/dev/null || echo "File not yet created"
```

### 5. Restart Clawdbot

After manual Discord channel creation:

```bash
# Stop the bot
clawdbot stop

# Restart with the updated config
clawdbot start
# or use: pnpm dev
```

## Integration Points

- **Frigate Webhooks**: Configure Frigate to send alerts to `#camera-alerts` and events to `#frigate-events`
- **Home Assistant**: Set up automations to log to `#automation-logs`
- **Skill Dependencies**: Ensure `homeassistant` and `frigate-monitor` skills are installed and enabled
- **Discord Permissions**: Verify the bot has permissions to read/write in all 5 channels

## Configuration File Location

Updated: `/home/admin/.clawdbot/clawdbot.json`

All 5 channels are now configured in:
```
discord.guilds.1458983535896559658.channels
```

Each channel has:
- `"allow": true` (enabled)
- `"requireMention": false` (responds without mention)
- `systemPrompt` (specific instructions for each channel's purpose)
