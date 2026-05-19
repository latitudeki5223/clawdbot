# Frigate MCP Server Setup Guide

## Overview

The Frigate MCP server provides camera monitoring integration for Frigate NVR through the Model Context Protocol (MCP). It exposes 9 tools for managing cameras, querying events, configuring settings, and monitoring system statistics.

**Important**: This server handles metadata only - NO image fetching. Images are sent directly from Frigate to Discord webhooks.

## Installation

### Prerequisites

- Node.js 18+ or Bun
- Frigate NVR running and accessible via HTTP
- Frigate API key (optional, if authentication is enabled)

### Install Dependencies

```bash
cd /home/admin/l36/mcp-services/frigate-mcp
npm install
npm run build
```

### Test the Server

```bash
# Start the server directly (will wait for stdio input)
node dist/index.js

# Or use npm script
npm start
```

## Configuration

### Environment Variables

Configure these in your `.mcp.json` or Claude config:

```json
{
  "mcpServers": {
    "frigate": {
      "command": "node",
      "args": ["/home/admin/l36/mcp-services/frigate-mcp/dist/index.js"],
      "env": {
        "FRIGATE_URL": "http://localhost:5000",
        "FRIGATE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Environment Variables:**

- `FRIGATE_URL` - Frigate API base URL (default: `http://localhost:5000`)
- `FRIGATE_API_KEY` - Optional API key for authenticated endpoints

### Example .mcp.json Configuration

Add this to your `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "frigate": {
      "command": "node",
      "args": ["/home/admin/l36/mcp-services/frigate-mcp/dist/index.js"],
      "env": {
        "FRIGATE_URL": "http://192.168.1.100:5000",
        "FRIGATE_API_KEY": ""
      }
    }
  }
}
```

## Available Tools

### Camera Tools (2)

#### `mcp__frigate__camera_list`
List all cameras with current status.

**Parameters:** None

**Returns:**
- Camera name
- Online/offline status
- Current FPS (camera, detection, process)
- Feature status (detection, recording, snapshots)

**Example:**
```
Found 3 camera(s):

🟢 Online front_door:
  - Camera FPS: 5.0
  - Detection FPS: 4.8
  - ✓ Detection
  - Recording: Enabled
  - Snapshots: Enabled

🟢 Online backyard:
  - Camera FPS: 5.0
  - Detection FPS: 4.9
  - ✓ Detection
  - Recording: Enabled
  - Snapshots: Enabled
```

---

#### `mcp__frigate__camera_status`
Get detailed status for a specific camera.

**Parameters:**
- `camera` (string, required) - Camera name

**Returns:**
- Detailed performance metrics
- Process IDs (FFmpeg, capture, detect)
- Feature configuration

---

### Event Tools (3)

#### `mcp__frigate__event_query`
Query events with filters (metadata only).

**Parameters:**
- `camera` (string, optional) - Filter by camera name
- `label` (string, optional) - Filter by object label (person, car, dog, etc.)
- `zone` (string, optional) - Filter by zone name
- `hours` (number, default: 24) - Show events from last N hours
- `limit` (number, default: 50) - Maximum events to return
- `has_clip` (boolean, optional) - Only events with clips
- `has_snapshot` (boolean, optional) - Only events with snapshots

**Returns:**
- Event ID
- Camera and label
- Confidence score
- Duration
- Zones triggered
- Media availability (clips, snapshots)

**Example:**
```
Found 12 event(s) in the last 24 hour(s):

🎥📷 [a8f3b2c1] front_door - person
  Score: 92% | Duration: 2.3m
  Time: 1/11/2026, 3:45:23 PM
  Zones: entrance, driveway

🎥📷 [d9e4c5f2] backyard - cat
  Score: 87% | Duration: 1.1m
  Time: 1/11/2026, 2:12:44 PM
  Zones: no zones
```

---

#### `mcp__frigate__event_get`
Get detailed information about a specific event.

**Parameters:**
- `event_id` (string, required) - Event ID

**Returns:**
- Complete event metadata
- Timeline (start, end, duration)
- Confidence scores
- Media availability
- Zone information

---

#### `mcp__frigate__event_summary`
Get summary of recent events grouped by camera and label.

**Parameters:**
- `hours` (number, default: 24) - Summarize last N hours

**Returns:**
- Total event count
- Events grouped by camera
- Breakdown by object label

**Example:**
```
Event Summary (last 24 hour(s)):

Total Events: 47

📹 front_door (28 events):
  - person: 22
  - car: 4
  - package: 2

📹 backyard (19 events):
  - cat: 12
  - person: 5
  - dog: 2
```

---

### Config Tools (3)

#### `mcp__frigate__camera_config_get`
Get camera configuration including zones and filters.

**Parameters:**
- `camera` (string, required) - Camera name

**Returns:**
- Detection settings (enabled, FPS)
- Object tracking configuration
- Zone definitions
- Recording and snapshot settings

---

#### `mcp__frigate__camera_config_update`
Update camera configuration (requires Frigate restart).

**Parameters:**
- `camera` (string, required) - Camera name
- `detect_enabled` (boolean, optional) - Enable/disable detection
- `detect_fps` (number, optional) - Detection FPS (1-10)
- `snapshot_enabled` (boolean, optional) - Enable/disable snapshots
- `record_enabled` (boolean, optional) - Enable/disable recording

**Returns:** Confirmation message with restart warning

**Warning:** Changes require Frigate restart to take effect.

---

#### `mcp__frigate__config_get`
Get full Frigate configuration (advanced).

**Parameters:** None

**Returns:**
- All cameras
- Detector configuration
- MQTT settings
- Global settings

---

### Stats Tools (1)

#### `mcp__frigate__stats_get`
Get Frigate system statistics.

**Parameters:** None

**Returns:**
- Service info (version, uptime)
- Storage usage (clips, recordings, cache)
- Detector performance (inference speed)
- System temperatures
- Camera summary (online count, total FPS)

**Example:**
```
Frigate System Statistics:

Service:
  - Version: 0.13.2
  - Uptime: 2d 14h 32m
  - Temperatures:
    coral: 42.5°C
    cpu: 38.2°C

Storage:
  - /media/frigate/clips:
    Total: 500.00 GB
    Used: 127.45 GB (25.5%)
    Free: 372.55 GB
    Type: ext4

Detectors:
  - coral:
    Inference Speed: 11.3ms
    PID: 1234

Cameras: 3 total
  - Online: 3
  - Total Camera FPS: 15.0
  - Total Detection FPS: 14.5
```

---

## Testing Commands

### Test Camera List
```bash
# Using clawdbot CLI
clawdbot message send --message "List all Frigate cameras"
```

### Test Event Query
```bash
# Query recent person detections
clawdbot message send --message "Show me person detection events from the last 6 hours"

# Query specific camera
clawdbot message send --message "Show me events from front_door camera"

# Get event summary
clawdbot message send --message "Give me a summary of detection events today"
```

### Test System Stats
```bash
clawdbot message send --message "Show me Frigate system statistics"
```

### Test Camera Config
```bash
# Get camera config
clawdbot message send --message "Show me the configuration for front_door camera"

# Update camera config (be careful - requires restart!)
clawdbot message send --message "Disable detection on backyard camera"
```

## Architecture

### Component Overview

```
frigate-mcp/
├── src/
│   ├── index.ts              # MCP server entry (stdio transport)
│   ├── requestHandler.ts     # MCP protocol handlers
│   ├── types.ts              # TypeScript type definitions
│   ├── clients/
│   │   └── frigateClient.ts  # Frigate REST API client
│   └── tools/
│       ├── index.ts          # Tool registry
│       ├── camera-tools.ts   # Camera management (2 tools)
│       ├── event-tools.ts    # Event queries (3 tools)
│       ├── config-tools.ts   # Configuration (3 tools)
│       └── stats-tools.ts    # System stats (1 tool)
└── dist/                     # Built JavaScript
```

### Data Flow

1. **Claude Code** calls MCP tool via stdio protocol
2. **MCP Server** receives request, routes to appropriate handler
3. **Handler** calls Frigate API client
4. **Frigate Client** makes HTTP request to Frigate NVR
5. **Response** flows back through handler → MCP → Claude Code

### Image Handling Architecture

**Important**: This MCP server does NOT handle images. The image flow is:

```
Frigate NVR → Discord Webhook (direct)
          ↓
       (snapshots stored on disk)
```

The MCP server only provides event metadata (camera, label, score, timestamp, zones) that Claude Code can use for:
- Monitoring camera status
- Querying detection events
- Generating reports
- Alerting on specific events

## Troubleshooting

### Server Won't Start

**Check Node version:**
```bash
node --version  # Should be 18.0.0 or higher
```

**Check build output:**
```bash
ls -l /home/admin/l36/mcp-services/frigate-mcp/dist/
# Should see index.js and other compiled files
```

### Connection Issues

**Verify Frigate is running:**
```bash
curl http://localhost:5000/api/version
# Should return Frigate version
```

**Check environment variables:**
```bash
echo $FRIGATE_URL
# Should show your Frigate URL
```

**Test API directly:**
```bash
curl http://localhost:5000/api/stats
# Should return JSON with camera stats
```

### API Errors

**403 Forbidden:**
- Check if `FRIGATE_API_KEY` is set correctly
- Verify API key in Frigate config

**404 Not Found:**
- Check `FRIGATE_URL` is correct
- Verify Frigate API is accessible

**Camera not found:**
- Use `mcp__frigate__camera_list` to see available cameras
- Check camera name spelling (case-sensitive)

### Debug Mode

Enable debug logging by checking stderr output:

```bash
node dist/index.js 2>frigate-mcp.log
# Check frigate-mcp.log for startup messages and errors
```

## Integration with Discord Webhooks

While the MCP server doesn't handle images, you can use it to:

1. **Monitor events** - Query recent detections
2. **Generate summaries** - Create daily/weekly reports
3. **Alert on patterns** - Detect unusual activity
4. **Camera health** - Monitor FPS, storage, uptime

Images are sent directly from Frigate to Discord via webhooks configured in Frigate's MQTT settings.

## API Reference

### Frigate REST API

This server uses the following Frigate API endpoints:

- `GET /api/stats` - System and camera statistics
- `GET /api/config` - Full configuration
- `GET /api/events` - Query events with filters
- `GET /api/events/{id}` - Get specific event
- `POST /api/config/save` - Update configuration (requires restart)

Full API docs: https://docs.frigate.video/integrations/api

## Development

### Project Structure

- **clients/** - API client code (HTTP requests)
- **tools/** - MCP tool definitions and handlers
- **types.ts** - TypeScript interfaces
- **requestHandler.ts** - MCP protocol implementation
- **index.ts** - Server entry point

### Adding New Tools

1. Create tool definition in appropriate file under `tools/`
2. Add tool handler function
3. Register in `tools/index.ts`
4. Export from handler mapping
5. Rebuild: `npm run build`

### Testing Changes

```bash
# Watch mode for development
npm run watch

# Build and test
npm run build
npm start
```

## Version History

- **1.0.0** (2026-01-11) - Initial release
  - 9 MCP tools across 4 categories
  - Camera monitoring and status
  - Event queries (metadata only)
  - Configuration management
  - System statistics

## License

Part of the L36 MCP services suite.

## Support

For issues or questions:
- Check Frigate docs: https://docs.frigate.video
- Verify MCP server logs (stderr)
- Test Frigate API directly with curl
- Check camera names and configuration
