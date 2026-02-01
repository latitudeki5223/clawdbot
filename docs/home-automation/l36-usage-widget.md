# L36 API Usage Widget Integration

This document describes the integration between Clawdbot and the L36 dashboard for tracking API token usage and costs.

## Overview

Clawdbot logs token usage data to the L36 backend after each agent response. This data is aggregated and displayed in a compact widget on the L36 dashboard sidebar.

```
┌───────────────────────────────────────────────────────────────┐
│                       Data Flow                                │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  Clawdbot Agent  ──POST──►  L36 Backend  ──INSERT──►  Postgres │
│  (after response)           /api/clawdbot/usage/log   api_usage_log │
│                                                                │
│  Frontend Widget  ◄──GET──  L36 Backend  ◄──SELECT──  Postgres │
│  (auto-refresh 5m)          /api/clawdbot/usage       (aggregated) │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

## Configuration

### Clawdbot Environment Variables

The L36 API key should be loaded from Vault, not stored in plaintext files.

**Option 1: Source from L36 Vault (recommended for same-host deployments)**
```bash
# In your shell or service startup script
source /home/admin/l36/security/scripts/vault/export-from-vault.sh
# This exports CLAWDBOT_API_KEY which Clawdbot reads as L36_API_KEY
export L36_API_KEY="$CLAWDBOT_API_KEY"
```

**Option 2: Add to Clawdbot's own Vault path**
```bash
# Store in a Clawdbot-specific Vault path
vault kv put secret/clawdbot/l36 api_key="<key>"
```

**Environment variables used:**
```bash
L36_API_KEY     # Required: API key for authentication
L36_API_URL     # Optional: Defaults to https://l36.com.au
```

### L36 Backend Configuration

The API key is stored in HashiCorp Vault and exported via:

```bash
# In export-from-vault.sh
export CLAWDBOT_API_KEY=$(get_secret "clawdbot" "api_key")
```

Docker Compose passes this to the backend container:

```yaml
# docker-compose.yml
backend:
  environment:
    - CLAWDBOT_API_KEY=${CLAWDBOT_API_KEY}
```

### Traefik Configuration

The clawdbot routes use split authentication:
- POST `/api/clawdbot/usage/log` - bypasses OAuth2 (uses API key auth from Clawdbot)
- GET `/api/clawdbot/usage` - uses OAuth2 (requires admin session in dashboard)

```yaml
# traefik/config/dynamic.yml

# POST endpoint for Clawdbot agent (API key auth)
clawdbot-log-router:
  rule: "(Host(`l36.com.au`) || Host(`www.l36.com.au`)) && Path(`/api/clawdbot/usage/log`)"
  service: "backend"
  priority: 96  # Higher priority, bypasses OAuth2

# GET endpoints for dashboard widget (OAuth2 session auth)
clawdbot-router:
  rule: "(Host(`l36.com.au`) || Host(`www.l36.com.au`)) && PathPrefix(`/api/clawdbot`)"
  service: "backend"
  middlewares:
    - "oauth2-auth"
    - "oauth2-errors"
  priority: 95
```

## API Endpoints

### POST /api/clawdbot/usage/log

Log token usage after an agent response.

**Authentication:** X-API-Key header

**Request:**
```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "input_tokens": 1000,
  "output_tokens": 500,
  "cache_read_tokens": 0,
  "cache_write_tokens": 0,
  "estimated_cost": 0.015,
  "session_key": "whatsapp:+1234567890",
  "complexity_level": "medium"
}
```

**Response:**
```json
{"status": "ok"}
```

### GET /api/clawdbot/usage

Get aggregated usage summary for the dashboard widget.

**Authentication:** Admin session (OAuth2)

**Response:**
```json
{
  "today": {
    "inputTokens": 12345,
    "outputTokens": 6789,
    "totalTokens": 19134,
    "estimatedCost": 0.45,
    "requestCount": 25
  },
  "thisMonth": {
    "inputTokens": 456789,
    "outputTokens": 123456,
    "totalTokens": 580245,
    "estimatedCost": 15.67,
    "requestCount": 850
  },
  "generatedAt": "2026-02-01T12:34:56.789Z"
}
```

### GET /api/clawdbot/usage/breakdown

Get detailed usage breakdown by model and complexity.

**Authentication:** Admin session (OAuth2)

**Query Parameters:**
- `days`: Number of days to look back (default: 7)

**Response:**
```json
{
  "byModel": [
    {"model": "claude-sonnet-4-5", "tokens": 12345, "cost": 0.45, "count": 25}
  ],
  "byComplexity": [
    {"level": "simple", "tokens": 5000, "cost": 0.10, "count": 15}
  ],
  "dailyTrend": [
    {"date": "2026-01-31", "tokens": 10000, "cost": 0.30}
  ]
}
```

## Database Schema

```sql
CREATE TABLE api_usage_log (
    id SERIAL PRIMARY KEY,
    context_id INTEGER NOT NULL REFERENCES business_contexts(id),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost NUMERIC(10,6) NOT NULL DEFAULT 0,
    session_key VARCHAR(255),
    complexity_level VARCHAR(20),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_usage_context ON api_usage_log(context_id);
CREATE INDEX idx_api_usage_created ON api_usage_log(created_at);
CREATE INDEX idx_api_usage_context_date ON api_usage_log(context_id, created_at);
CREATE INDEX idx_api_usage_provider ON api_usage_log(provider);
```

## Widget Design

The widget displays in the L36 dashboard sidebar above the MYOB Financial section:

```
┌─────────────────────────────┐
│ 🦞 API Usage                │
├─────────────────────────────┤
│ Today:     45.2K  ·  $0.12  │
│ Month:     1.2M   ·  $3.45  │
├─────────────────────────────┤
│ 25 req today · 850 this mo  │
└─────────────────────────────┘
```

## Files

### Clawdbot
- `src/auto-reply/reply/agent-runner.ts` - Logs usage to L36 API after each response
- `src/agents/usage.ts` - Cost calculation utilities

### L36 Backend
- `database/migrations/versions/v162_add_api_usage_log.py` - Database migration
- `backend/app/models/api_usage_log.py` - SQLAlchemy model
- `backend/app/routes/clawdbot_routes.py` - API endpoints
- `backend/app/__init__.py` - Blueprint registration

### L36 Frontend
- `frontend-vite/src/components/ClawdbotUsageWidget.tsx` - Widget component
- `frontend-vite/src/components/MYOBFinancialSidebar.tsx` - Sidebar integration

### L36 Infrastructure
- `traefik/config/dynamic.yml` - Route bypass for OAuth2
- `security/scripts/vault/export-from-vault.sh` - Vault secret export
- `docker-compose.yml` - Environment variable passing

## Troubleshooting

### "Unauthorized" response from logging endpoint

1. Check that Traefik has the clawdbot-router configured
2. Verify the API key matches between Clawdbot and L36
3. Restart Traefik after config changes: `docker restart traefik`

### No data appearing in widget

1. Check that L36_API_KEY is set in Clawdbot environment
2. Verify the backend container has CLAWDBOT_API_KEY
3. Check backend logs: `docker logs backend | grep clawdbot`

### Cost calculations are zero

The `calculateCost` function in `src/agents/usage.ts` only recognizes specific model names. Ensure the model name matches one of the defined cost rates.
