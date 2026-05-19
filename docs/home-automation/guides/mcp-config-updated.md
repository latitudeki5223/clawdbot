# Frigate MCP Server Configuration Updated

## Summary

The Frigate MCP server has been successfully added to your `.mcp.json` configuration files:
- `/home/admin/.clawdbot/mcp.json`
- `/home/admin/clawdbot/.mcp.json`

The new server configuration has been added with placeholder values that you need to customize.

## Configuration Added

```json
"frigate": {
  "command": "node",
  "args": ["/home/admin/l36/mcp-services/frigate-mcp/dist/index.js"],
  "env": {
    "FRIGATE_URL": "http://frigate.tailscale-name.ts.net:5000",
    "FRIGATE_API_KEY": ""
  }
}
```

## Required Actions

### 1. Update FRIGATE_URL
Replace the placeholder `http://frigate.tailscale-name.ts.net:5000` with your actual Frigate instance URL.

**Example with real Tailscale hostname:**
```json
"FRIGATE_URL": "http://frigate.example-ts-name.ts.net:5000"
```

### 2. Configure FRIGATE_API_KEY (Optional)
The `FRIGATE_API_KEY` is currently set to an empty string.

- **If your Frigate instance has authentication enabled:** Replace the empty string with your actual API key
  ```json
  "FRIGATE_API_KEY": "your-actual-api-key-here"
  ```

- **If your Frigate instance has no authentication:** Leave the value as an empty string `""`

## Important: Restart Gateway

After updating the configuration values, you **must restart the gateway** for the changes to take effect.

On macOS, you can restart via:
- The Clawdbot Mac app menu
- Or run: `scripts/restart-mac.sh`

On other platforms, restart your gateway service to load the new MCP configuration.

## Verification

Once restarted, you should be able to access Frigate MCP functionality alongside your existing MCP servers:
- productivity
- builds
- products
- images
- **frigate** (newly added)

Verify the connection by checking the gateway logs or testing Frigate-related operations through your Claude Code interface.
