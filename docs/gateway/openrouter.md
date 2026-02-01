---
summary: "OpenRouter integration for cost-effective AI models"
read_when:
  - Setting up alternative model providers
  - Configuring free tier models
  - Reducing API costs
---

# OpenRouter Integration

Use OpenRouter as an alternative to direct Anthropic OAuth for cost-effective AI models.

## Why OpenRouter?

**Problem:** Anthropic Claude Code OAuth credentials are now restricted to Claude Code only and cannot be used for other API requests.

**Solution:** OpenRouter provides:
- Access to 100+ models through a single API
- Free tier models (Llama 3.3 70B, DeepSeek R1)
- Unified billing across providers
- Easy model switching
- Automatic fallbacks

## Cost Comparison

| Model | Provider | Input Cost | Output Cost | Use Case |
|-------|----------|------------|-------------|----------|
| **Llama 3.3 70B** | OpenRouter | FREE | FREE | Default for 90% of tasks |
| **DeepSeek R1** | OpenRouter | FREE | FREE | Complex reasoning, council |
| **DeepSeek Chat** | OpenRouter | $0.27/1M | $1.10/1M | Backup when free unavailable |
| **Claude Opus 4.5** | Anthropic | $15/1M | $75/1M | Emergency only |

**Estimated cost:** $0-8/month vs $50-100+ with direct Claude Opus usage.

## Setup

### 1. Get OpenRouter API Key

```bash
# Visit https://openrouter.ai/
# Sign up for account
# Generate API key from dashboard
# Add payment method (optional, for paid tier)
```

### 2. Configure Clawdbot

Add to `~/.clawdbot/clawdbot.json`:

```json
{
  "env": {
    "OPENROUTER_API_KEY": "sk-or-v1-YOUR_KEY_HERE"
  },
  "agent": {
    "model": {
      "primary": "openrouter/meta-llama/llama-3.3-70b-instruct:free",
      "fallbacks": [
        "openrouter/deepseek/deepseek-chat"
      ]
    },
    "models": {
      "openrouter/meta-llama/llama-3.3-70b-instruct:free": {
        "alias": "llama"
      },
      "openrouter/deepseek/deepseek-r1:free": {
        "alias": "r1"
      },
      "openrouter/deepseek/deepseek-chat": {
        "alias": "deepseek"
      },
      "anthropic/claude-opus-4-5": {
        "alias": "opus"
      }
    }
  }
}
```

### 3. Restart Gateway

```bash
clawdbot gateway stop
clawdbot gateway --force
```

### 4. Verify

```bash
clawdbot models status
```

Should show:
```
Default       : openrouter/meta-llama/llama-3.3-70b-instruct:free
Fallbacks (1) : openrouter/deepseek/deepseek-chat
Aliases (4)   : llama -> openrouter/meta-llama/llama-3.3-70b-instruct:free, ...

- openrouter effective=env:sk-or-v1...YOUR_KEY | source=env: OPENROUTER_API_KEY
```

## Model Switching

### Via Messages

```
/model llama      # Llama 3.3 70B (free, default)
/model r1         # DeepSeek R1 (free, reasoning)
/model deepseek   # DeepSeek Chat (paid backup)
/model opus       # Claude Opus (expensive emergency)
```

### Via Configuration

Set different defaults per channel or provider:

```json
{
  "discord": {
    "guilds": {
      "YOUR_GUILD_ID": {
        "channels": {
          "council-main": {
            "model": "openrouter/deepseek/deepseek-r1:free"
          }
        }
      }
    }
  }
}
```

## Model Usage Strategy

### Default (90% of tasks)
**Llama 3.3 70B** (FREE) for:
- Knowledge capture
- Inbox processing
- General questions
- Daily/weekly reviews
- Simple commands

### Auto-Switch for Reasoning
**DeepSeek R1** (FREE) for:
- Council deliberations
- Multi-perspective analysis
- Complex decision-making
- Strategic planning

### Paid Fallback
**DeepSeek Chat** ($0.27/$1.10 per 1M tokens) when:
- Free tier rate limited
- High availability needed
- Extra capacity required

### Emergency Only
**Claude Opus 4.5** ($15/$75 per 1M tokens) for:
- Critical tasks requiring highest quality
- Complex code generation
- When other models fail

## Free Tier Limits

OpenRouter free tier models have rate limits. When exceeded:

1. **Automatic fallback** to paid DeepSeek Chat (~$0.27/1M)
2. **Very cheap** compared to Claude Opus (~$15/1M)
3. **Monitor usage** at https://openrouter.ai/activity

## Auto-Switching Skills

Configure skills to auto-switch models for specific tasks:

**Example: Council Deliberation**

```markdown
## /council

Before running council:
1. Switch to reasoning model: `/model r1`
2. Run multi-perspective analysis
3. Generate CFO, CMO, CSO, COO perspectives
4. Synthesize final recommendation
```

Add to skill SKILL.md:
```markdown
0. SWITCH TO REASONING MODEL:
   Use /model r1 command to switch to DeepSeek R1
   (Superior reasoning for multi-perspective analysis)
```

## Monitoring Usage

### OpenRouter Dashboard
```
https://openrouter.ai/activity
```

View:
- API calls by model
- Cost breakdown
- Rate limit status
- Token usage

### Check via CLI
```bash
clawdbot models status
```

### Gateway Logs
```bash
tail -f /tmp/clawdbot/clawdbot.log | grep -i "model\|openrouter"
```

## Troubleshooting

### "No OpenRouter API key found"

**Check config:**
```bash
cat ~/.clawdbot/clawdbot.json | grep OPENROUTER_API_KEY
```

**Should show:**
```json
"OPENROUTER_API_KEY": "sk-or-v1-..."
```

**Fix:** Add `env.OPENROUTER_API_KEY` to config and restart gateway.

### Rate limit errors

**Symptoms:**
```
Rate limit exceeded for model llama-3.3-70b
```

**Automatic fix:** OpenRouter auto-falls back to paid DeepSeek Chat.

**Manual fix:** Switch model:
```
/model deepseek
```

**Monitor usage:**
```
https://openrouter.ai/activity
```

### High costs

**Check usage:**
```
https://openrouter.ai/activity
```

**Common causes:**
- Using `/model opus` frequently
- Rate limits hitting paid fallback
- Large message volumes

**Fix:**
- Stay on free tier models (llama, r1)
- Monitor rate limits
- Add credits for paid tier

### Model not available

**Symptoms:**
```
Model openrouter/meta-llama/llama-3.3-70b-instruct:free not found
```

**Check available models:**
```bash
clawdbot models list --all | grep openrouter
```

**Fix:** Update model ID in config to match available models.

## Environment Variables

OpenRouter API key can be set via environment:

```bash
export OPENROUTER_API_KEY="sk-or-v1-YOUR_KEY"
clawdbot gateway
```

Or in config:

```json
{
  "env": {
    "OPENROUTER_API_KEY": "sk-or-v1-YOUR_KEY"
  }
}
```

Config takes precedence over environment.

## Multiple Providers

Mix OpenRouter with other providers:

```json
{
  "env": {
    "OPENROUTER_API_KEY": "sk-or-v1-...",
    "OPENAI_API_KEY": "sk-..."
  },
  "agent": {
    "model": {
      "primary": "openrouter/meta-llama/llama-3.3-70b-instruct:free",
      "fallbacks": [
        "openrouter/deepseek/deepseek-chat",
        "openai/gpt-4o"
      ]
    }
  }
}
```

## Best Practices

1. **Start with free tier** - Llama 3.3 70B handles 90% of tasks
2. **Use R1 for reasoning** - Auto-switch for complex analysis
3. **Monitor usage** - Check OpenRouter dashboard regularly
4. **Set fallbacks** - Configure paid backup for high availability
5. **Track costs** - Review monthly spend, adjust strategy
6. **Test thoroughly** - Ensure quality meets needs before full deployment

## See Also

- [Configuration](/gateway/configuration) - General Clawdbot configuration
- [Authentication](/gateway/authentication) - Model authentication setup
- [Models](/concepts/models) - Model selection and configuration

## Links

- OpenRouter: https://openrouter.ai/
- OpenRouter Docs: https://openrouter.ai/docs
- Model Pricing: https://openrouter.ai/models
- Usage Dashboard: https://openrouter.ai/activity
