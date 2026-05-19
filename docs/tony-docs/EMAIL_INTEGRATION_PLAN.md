# Email Integration for Clawdbot

**Status:** Design Document
**Goal:** Enable full bidirectional email capabilities (view, reply, compose, delete) within Telegram and Discord
**Author:** Technical Analysis
**Date:** 2026-01-10

---

## Executive Summary

This document outlines a comprehensive plan to integrate email as a first-class messaging provider in Clawdbot, enabling users to manage their email inbox directly from Telegram and Discord. The integration will transform email from a CLI-only skill into a fully interactive chat interface.

### Current State

1. **Himalaya Skill** - CLI-based email client supporting IMAP/SMTP operations
2. **Gmail Pub/Sub Hook** - Incoming notification support (Gmail only)
3. **No Provider Integration** - Email is not a messaging provider

### Desired State

Users can:
- View email inbox as formatted messages in Telegram/Discord
- Reply to emails directly from chat
- Compose new emails via chat commands
- Delete/archive emails
- Search and filter emails
- Handle attachments
- Manage multiple email accounts

---

## Architecture Overview

### Current Provider Architecture

Clawdbot has 7 messaging providers (from `src/config/types.ts`):
- WhatsApp (`WhatsAppConfig`)
- Telegram (`TelegramConfig`)
- Discord (`DiscordConfig`)
- Slack (`SlackConfig`)
- Signal (`SignalConfig`)
- iMessage (`IMessageConfig`)
- MS Teams (`MSTeamsConfig`)

Each provider:
1. Has dedicated config types in `src/config/types.ts`
2. Implements account resolution in `src/<provider>/accounts.ts`
3. Has a monitor/runtime in `src/<provider>/index.ts` or `monitor.ts`
4. Registers in `src/gateway/server-providers.ts` (`ProviderManager`)
5. Appears in `src/config/provider-capabilities.ts`

### Email Provider Gap Analysis

**Missing Components:**
- `EmailConfig` type in `src/config/types.ts`
- `EmailAccountConfig` type
- `src/email/accounts.ts` (account resolution)
- `src/email/monitor.ts` (IMAP watch/polling)
- `src/email/index.ts` (provider entry point)
- Email runtime status in `ProviderRuntimeSnapshot`
- Email case in `resolveProviderCapabilities()`
- Email methods in `ProviderManager`

---

## Integration Strategy

### Option 1: Native Email Provider (Recommended)

Build a full-featured email provider that mirrors WhatsApp/Telegram architecture.

**Pros:**
- First-class email integration
- Consistent with other providers
- Native UI in Control Panel
- Best user experience
- Enables email-specific features (folders, labels, filters)

**Cons:**
- Significant implementation effort
- Requires IMAP watch/polling infrastructure
- More complex than hook-based approach

**Implementation Scope:**
- 15-20 new source files
- Config schema updates
- Provider manager integration
- UI updates (macOS app, web control UI)
- Documentation updates

### Option 2: Enhanced Hook + Bridge Layer (Faster)

Build a bridge that translates email operations into a chat-like interface using existing hooks.

**Pros:**
- Faster to implement
- Reuses existing Gmail Pub/Sub infrastructure
- Can extend to non-Gmail accounts via IMAP polling
- No core provider changes needed

**Cons:**
- Not a true "provider" in the architecture
- Less consistent with other messaging platforms
- Limited by hook capabilities
- No native UI representation

---

## Detailed Design: Native Email Provider (Option 1)

### 1. Configuration Schema

Add to `src/config/types.ts`:

```typescript
export type EmailAccountConfig = {
  /** Optional display name for this account */
  name?: string;
  /** Email address for this account */
  email: string;
  /** If false, do not start this email account. Default: true. */
  enabled?: boolean;

  /** IMAP configuration */
  imap: {
    host: string;
    port: number;
    encryption: "tls" | "starttls" | "none";
    username: string;
    /** Command to retrieve password (e.g., "pass show email/imap") */
    passwordCommand?: string;
    /** Direct password (not recommended; use passwordCommand) */
    password?: string;
  };

  /** SMTP configuration */
  smtp: {
    host: string;
    port: number;
    encryption: "tls" | "starttls" | "none";
    username: string;
    /** Command to retrieve password (e.g., "pass show email/smtp") */
    passwordCommand?: string;
    /** Direct password (not recommended; use passwordCommand) */
    password?: string;
  };

  /** Polling configuration */
  polling?: {
    /** Poll interval in seconds (default: 60) */
    intervalSeconds?: number;
    /** Folders to watch (default: ["INBOX"]) */
    folders?: string[];
  };

  /** Direct message access policy (default: pairing) */
  dmPolicy?: DmPolicy;
  /** Allowlist for email senders */
  allowFrom?: string[];
  /** Outbound text chunk size (chars). Default: 4000. */
  textChunkLimit?: number;
  /** Maximum media file size in MB. Default: 25. */
  mediaMaxMb?: number;
};

export type EmailConfig = {
  /** Optional per-account email configuration (multi-account). */
  accounts?: Record<string, EmailAccountConfig>;
} & EmailAccountConfig;
```

Add to `ClawdbotConfig`:
```typescript
export type ClawdbotConfig = {
  // ... existing fields
  email?: EmailConfig;
};
```

### 2. Email Message Formatting

Design a consistent format for displaying emails in chat:

```
📧 [#42] New message from john@example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From: John Doe <john@example.com>
To: you@example.com
Subject: Q4 Planning Meeting
Date: 2026-01-10 14:23

Hey team,

Can we schedule a meeting next week to discuss
Q4 planning? I have some ideas to share.

Thanks,
John

📎 Attachments: Q4_Draft.pdf (245 KB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reply: /email reply 42
Delete: /email delete 42
Archive: /email archive 42
```

**Format Features:**
- Message ID (for reference in commands)
- Visual separators (Unicode box drawing)
- Emoji indicators (📧 inbox, 📤 sent, 📎 attachments)
- Action hints at bottom
- Truncate long messages with "Read more" link
- Thread context for replies

### 3. Command Interface

Extend the command system with email operations:

```bash
# View inbox
/email list                    # Show recent emails
/email list --folder Sent      # List specific folder
/email list --unread           # Show only unread
/email search "meeting"        # Search emails

# Read email
/email read 42                 # Read email #42
/email show 42                 # Alias for read

# Compose/Reply
/email compose                 # Start new email (interactive)
/email reply 42                # Reply to email #42
/email reply 42 --all          # Reply-all
/email forward 42              # Forward email

# Manage
/email delete 42               # Delete email
/email archive 42              # Archive email
/email mark-read 42            # Mark as read
/email mark-unread 42          # Mark as unread
/email move 42 Archive         # Move to folder

# Attachments
/email download 42             # Download attachments
/email attach <file>           # Attach to compose session

# Multi-account
/email --account work list     # Use specific account
/email accounts                # List configured accounts
```

### 4. Interactive Composition

Use Telegram/Discord's native features for email composition:

**Telegram:**
- Use inline keyboards for action buttons
- Multi-step conversation flow:
  1. `/email compose` → "Enter recipient:"
  2. User types: `john@example.com`
  3. Bot: "Enter subject:"
  4. User types: `Meeting Follow-up`
  5. Bot: "Enter message (or /cancel):"
  6. User types message (multiline supported)
  7. Bot: "Preview:" (shows formatted email)
  8. Inline keyboard: [Send] [Edit] [Cancel]

**Discord:**
- Similar flow with Discord buttons/embeds
- Use embeds for rich email preview
- Support slash commands for compose

### 5. Notification Flow

When new email arrives:

1. **IMAP Poll Detects New Message**
   - Email provider polls IMAP every N seconds
   - Detects new message in watched folders

2. **Format Email for Chat**
   - Parse email headers
   - Extract text body (prefer plain text, fall back to HTML→text)
   - Truncate long messages
   - Note attachments

3. **Route to Delivery Target**
   - Check `allowFrom` policy
   - Check `dmPolicy` for unknown senders
   - Route to last-used chat or configured delivery target
   - Deliver formatted message

4. **Store Reference**
   - Map chat message ID to email UID
   - Enable future reply/delete operations

### 6. Architecture Components

**New Files Required:**

```
src/email/
├── accounts.ts              # Account resolution helpers
├── config.ts                # Email config utilities
├── imap-client.ts           # IMAP connection wrapper
├── smtp-client.ts           # SMTP send wrapper
├── monitor.ts               # Email provider monitor
├── index.ts                 # Provider entry point
├── parser.ts                # Email parsing utilities
├── formatter.ts             # Email→chat formatting
├── composer.ts              # Interactive composition
├── commands.ts              # Email command handlers
└── storage.ts               # Email metadata storage

src/email/imap/
├── connection.ts            # IMAP connection pool
├── watch.ts                 # IMAP IDLE/polling
├── fetch.ts                 # Message fetching
└── operations.ts            # IMAP operations (delete, move, flag)

src/email/smtp/
├── connection.ts            # SMTP connection
└── send.ts                  # Email sending

src/email/protocols/
├── himalaya.ts              # Himalaya CLI wrapper (fallback)
└── native.ts                # Native IMAP/SMTP (future)
```

**Updated Files:**

- `src/config/types.ts` - Add EmailConfig
- `src/config/provider-capabilities.ts` - Add email case
- `src/gateway/server-providers.ts` - Add email provider management
- `src/commands/index.ts` - Register email commands
- UI files (macOS app, web control UI) - Add email connection settings

### 7. IMAP Implementation Options

**Option A: Use Himalaya CLI (Fastest)**
- Wrap existing Himalaya commands
- Minimal custom implementation
- Mature IMAP/SMTP handling
- Cons: CLI overhead, less control

**Option B: Native Node.js IMAP Client (Best Long-term)**
- Use `node-imap` or `imap-simple` libraries
- Direct control over connections
- Better performance
- Cons: More implementation work

**Recommended:** Start with Himalaya wrapper (Option A), migrate to native (Option B) later.

### 8. Storage Requirements

Store email metadata for chat integration:

```typescript
// ~/.clawdbot/email/metadata.db (SQLite)
CREATE TABLE email_messages (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL,
  message_uid TEXT NOT NULL,
  folder TEXT NOT NULL,
  message_id TEXT,
  from_addr TEXT,
  to_addr TEXT,
  subject TEXT,
  date INTEGER,
  chat_provider TEXT,
  chat_id TEXT,
  chat_message_id TEXT,
  last_updated INTEGER,
  UNIQUE(account_id, message_uid)
);

CREATE TABLE compose_sessions (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL,
  chat_provider TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  state TEXT NOT NULL, -- 'to', 'subject', 'body', 'preview'
  to_addr TEXT,
  cc_addr TEXT,
  subject TEXT,
  body TEXT,
  attachments TEXT, -- JSON array
  created_at INTEGER,
  updated_at INTEGER
);
```

---

## Detailed Design: Enhanced Hook + Bridge (Option 2)

### 1. Email Hook Expansion

Extend existing Gmail Pub/Sub hook to support generic IMAP:

```typescript
// src/hooks/email.ts
export type EmailHookConfig = {
  /** Email account to watch */
  account: string;
  /** Watch method: 'pubsub' (Gmail) or 'imap' (generic) */
  method: 'pubsub' | 'imap';
  /** For IMAP: poll interval in seconds */
  pollIntervalSeconds?: number;
  /** For IMAP: folders to watch */
  folders?: string[];
  /** Include email body in webhook payload */
  includeBody?: boolean;
  /** Max body size in bytes */
  maxBytes?: number;
  /** Hook URL to POST new messages */
  hookUrl?: string;
};
```

### 2. IMAP Watcher Daemon

Create a new daemon for IMAP polling:

```bash
# Start IMAP watcher
clawdbot hooks email run --account personal

# Setup wizard
clawdbot hooks email setup --account personal@example.com
```

**Implementation:**
- Similar to `src/hooks/gmail-watcher.ts`
- Poll IMAP INBOX using Himalaya or node-imap
- POST new messages to webhook endpoint
- Handle incremental UID tracking

### 3. Email Bridge Agent

Create a specialized agent that handles email operations:

```
~/.clawdbot/agents/email/
├── SYSTEM.md              # Email bridge agent instructions
├── tools/
│   ├── email-list.ts      # List emails tool
│   ├── email-read.ts      # Read email tool
│   ├── email-reply.ts     # Reply tool
│   ├── email-send.ts      # Send new email tool
│   └── email-delete.ts    # Delete tool
└── sessions/
```

**Agent System Prompt:**
```markdown
You are an email management assistant. When users interact with emails:

1. Format emails clearly with headers, body, and actions
2. Support natural language commands ("reply to John" → find John's email → compose reply)
3. Confirm destructive operations (delete, send)
4. Handle multi-step composition flows
5. Support attachment handling

Available tools:
- email_list: List emails in inbox
- email_read: Read specific email
- email_reply: Reply to email
- email_send: Send new email
- email_delete: Delete email

Format emails using:
[Template from Section 2 above]
```

### 4. Hook Mapping

Configure hook to trigger email agent:

```json5
{
  hooks: {
    enabled: true,
    token: "HOOK_TOKEN",
    presets: ["email"],
    mappings: [
      {
        match: { path: "email" },
        action: "agent",
        wakeMode: "now",
        name: "Email",
        sessionKey: "hook:email:{{messages[0].id}}",
        messageTemplate: `📧 New email from {{messages[0].from}}
Subject: {{messages[0].subject}}
Date: {{messages[0].date}}

{{messages[0].snippet}}

[Use email tools to read, reply, or manage this message]`,
        deliver: true,
        provider: "last"
      }
    ]
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Native Provider Path:**
1. Add `EmailConfig` types to `src/config/types.ts`
2. Create `src/email/accounts.ts` (account resolution)
3. Create `src/email/imap-client.ts` (Himalaya wrapper)
4. Create `src/email/smtp-client.ts` (Himalaya wrapper)
5. Create `src/email/formatter.ts` (email→chat formatting)
6. Write tests for formatters

**Hook/Bridge Path:**
1. Create `src/hooks/email.ts` (IMAP watch config)
2. Create `src/hooks/email-watcher.ts` (IMAP polling daemon)
3. Create email bridge agent system prompt
4. Create basic email tools (list, read)

### Phase 2: Core Operations (Week 3-4)

**Native Provider Path:**
1. Create `src/email/monitor.ts` (IMAP watcher)
2. Integrate into `ProviderManager`
3. Add to `provider-capabilities.ts`
4. Implement inbox polling
5. Implement new message delivery to chat
6. Create storage layer (SQLite metadata)

**Hook/Bridge Path:**
1. Implement IMAP watcher daemon
2. Create reply/send tools
3. Create delete/archive tools
4. Test hook→agent→delivery flow

### Phase 3: Interactive Features (Week 5-6)

**Both Paths:**
1. Implement `/email` command handlers
2. Add interactive composition flow
3. Implement attachment handling
4. Add multi-account support
5. Create inbox pagination
6. Add search functionality

### Phase 4: UI Integration (Week 7)

1. Update macOS app connection settings
2. Update web Control UI
3. Add email status indicators
4. Create setup wizard (`clawdbot email setup`)
5. Document configuration

### Phase 5: Testing & Refinement (Week 8)

1. Test with Gmail, iCloud, generic IMAP
2. Test with Telegram and Discord
3. Handle edge cases (large emails, malformed, attachments)
4. Performance optimization
5. Documentation completion

---

## Technical Considerations

### IMAP Connection Management

**Challenge:** IMAP connections can be expensive/slow
**Solutions:**
- Use IDLE when supported (push notifications)
- Fall back to polling (60s default)
- Connection pooling for read operations
- Lazy connection (don't connect until needed)

### Email Body Parsing

**Challenge:** Emails have complex MIME structure
**Solutions:**
- Prefer plain text parts
- Convert HTML→text using existing libraries
- Truncate very long emails (>4000 chars)
- Store full email, deliver summary to chat
- Provide "Read full email" action

### Attachment Handling

**Challenge:** Attachments don't fit in chat messages
**Solutions:**
- List attachments with size
- Provide download command
- Upload to temp storage for Telegram/Discord file sharing
- Or provide web link via gateway

### Security & Privacy

**Considerations:**
- Never log passwords (use passwordCommand)
- Encrypt stored credentials
- Respect dmPolicy for unknown senders
- Sanitize email content (strip scripts, tracking pixels)
- Rate-limit operations

### Performance

**Optimizations:**
- Cache frequently accessed emails
- Batch IMAP operations
- Use incremental UID fetch
- Compress large messages
- Lazy-load attachments

---

## Dependencies

### Required Libraries

**Option 1: Native Provider**
```json
{
  "node-imap": "^0.9.6",           // IMAP client
  "mailparser": "^3.6.5",          // Email parsing
  "nodemailer": "^6.9.7",          // SMTP sending
  "html-to-text": "^9.0.5",        // HTML email conversion
  "better-sqlite3": "^9.2.2"       // Metadata storage
}
```

**Option 2: Hook/Bridge (Lighter)**
```json
{
  "mailparser": "^3.6.5",          // Email parsing
  "html-to-text": "^9.0.5"         // HTML conversion
}
// + Rely on Himalaya CLI for IMAP/SMTP
```

### External Tools

- **Himalaya CLI** - Already required by Himalaya skill
- **Pass** or keychain - For secure password storage

---

## Migration Path

### For Existing Gmail Pub/Sub Users

1. **No Breaking Changes**
   - Gmail Pub/Sub hook continues to work
   - Can run alongside email provider

2. **Migration Steps**
   - Configure email provider for same Gmail account
   - Disable Gmail Pub/Sub hook
   - Test email provider delivery
   - Remove Gmail hook config

3. **Fallback**
   - Keep Gmail Pub/Sub as fallback for push notifications
   - Use email provider for interactive operations

### For Himalaya Skill Users

1. **Coexistence**
   - Email provider can use Himalaya as backend
   - Skill remains available for manual operations

2. **Enhancement**
   - Provider adds chat interface
   - Skill handles advanced operations
   - Both use same Himalaya config

---

## Open Questions

1. **Provider vs Hook?**
   - Recommendation: Start with Native Provider for best UX
   - Fallback: Enhanced Hook if timeline is critical

2. **IMAP Library?**
   - Recommendation: Start with Himalaya wrapper, migrate to native
   - Reason: Faster initial implementation, proven IMAP handling

3. **Attachment Storage?**
   - Option A: Temp files + cleanup
   - Option B: Gateway file serving
   - Option C: External storage (S3-compatible)
   - Recommendation: Start with A, add B for remote gateway

4. **Metadata Storage?**
   - SQLite (recommended) - Simple, proven
   - JSON files - Simpler but doesn't scale
   - PostgreSQL - Overkill for now

5. **Push vs Poll?**
   - Gmail: Use Pub/Sub (push) when available
   - Others: IMAP IDLE when supported, else poll
   - Recommendation: Hybrid approach

---

## Success Metrics

1. **Functional:**
   - [ ] List inbox emails in Telegram/Discord
   - [ ] Read individual emails
   - [ ] Reply to emails from chat
   - [ ] Compose new emails via chat
   - [ ] Delete/archive emails
   - [ ] Handle attachments (download)
   - [ ] Multi-account support

2. **Performance:**
   - New email notification latency < 60s (polling) or < 5s (IDLE)
   - List inbox operation < 3s
   - Read email < 2s
   - Send email < 5s

3. **Usability:**
   - Setup wizard completes in < 5 minutes
   - Email format readable on mobile
   - Commands intuitive for users
   - Errors handled gracefully

4. **Compatibility:**
   - Works with Gmail, iCloud, generic IMAP
   - Works in Telegram and Discord
   - Supports multi-account setups
   - Coexists with existing hooks

---

## References

### Current Implementation Files

- `src/config/types.ts` - Config schema (lines 1-1451)
- `src/config/provider-capabilities.ts` - Provider registration (lines 46-91)
- `src/gateway/server-providers.ts` - Provider manager (lines 99-153)
- `skills/himalaya/SKILL.md` - Himalaya skill documentation
- `src/hooks/gmail.ts` - Gmail hook configuration
- `docs/automation/gmail-pubsub.md` - Gmail Pub/Sub setup guide

### Related Documentation

- `/docs/providers/` - Provider setup guides
- `/docs/automation/webhook.md` - Webhook system
- `/docs/gateway/configuration.md` - Gateway config reference
- Himalaya docs: https://pimalaya.org/himalaya/
- IMAP RFC: https://tools.ietf.org/html/rfc3501

---

## Appendix: Example Workflows

### Workflow 1: Receiving Email in Telegram

```
[Telegram Chat]

📧 New message from john@example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From: John Doe <john@example.com>
To: you@example.com
Subject: Q4 Planning Meeting
Date: 2026-01-10 14:23

Hey team,

Can we schedule a meeting next week to discuss
Q4 planning?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Reply] [Archive] [Delete] [Read Full]

User: (clicks Reply)

Bot: Composing reply to john@example.com
Re: Q4 Planning Meeting

Enter your message (or /cancel):

User: Yes, how about Tuesday at 2pm?

Bot: Preview:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: john@example.com
Subject: Re: Q4 Planning Meeting

Yes, how about Tuesday at 2pm?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Send] [Edit] [Cancel]

User: (clicks Send)

Bot: ✅ Email sent to john@example.com
```

### Workflow 2: Composing Email in Discord

```
[Discord DM]

User: /email compose

Bot: 📝 New Email

Enter recipient address:

User: jane@company.com

Bot: To: jane@company.com

Enter subject:

User: Project Update

Bot: To: jane@company.com
Subject: Project Update

Enter message body (type "done" when finished):

User: Hi Jane,

User: Just wanted to update you on the project status.
We're on track for next week's deadline.

User: done

Bot:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**Email Preview**

To: jane@company.com
Subject: Project Update

Hi Jane,

Just wanted to update you on the project status.
We're on track for next week's deadline.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

React with ✅ to send, ❌ to cancel, ✏️ to edit

User: (reacts with ✅)

Bot: ✅ Email sent successfully!
```

### Workflow 3: Managing Inbox

```
[Telegram Chat]

User: /email list --unread

Bot:
📬 Unread Messages (3)

📧 [#127] sarah@example.com
Subject: Budget Approval Request
2026-01-10 15:30

📧 [#126] team@company.com
Subject: Weekly Standup Notes
2026-01-10 14:15

📧 [#125] newsletter@tech.com
Subject: This Week in Tech
2026-01-10 10:00

Use "/email read <id>" to view

User: /email read 127

Bot:
📧 [#127] sarah@example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From: Sarah Johnson <sarah@example.com>
To: you@example.com
Cc: finance@company.com
Subject: Budget Approval Request
Date: 2026-01-10 15:30

Hi,

I need approval for the Q1 marketing budget.
Attached is the detailed breakdown.

Please review and approve by EOD tomorrow.

Thanks,
Sarah

📎 Attachments: Q1_Budget.xlsx (124 KB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Actions:
/email reply 127
/email forward 127
/email archive 127
/email download 127
```

---

## Conclusion

This document provides a comprehensive roadmap for integrating email into Clawdbot as a first-class messaging provider. The recommended approach is to implement a **Native Email Provider** that mirrors the architecture of existing providers (WhatsApp, Telegram, Discord), providing the best user experience and most flexible foundation for future enhancements.

Key implementation phases:
1. Foundation (config, accounts, Himalaya wrapper)
2. Core operations (IMAP watch, delivery, storage)
3. Interactive features (commands, composition, attachments)
4. UI integration (macOS app, web UI, docs)
5. Testing & refinement

The alternative **Enhanced Hook + Bridge** approach offers a faster time-to-market but with reduced functionality and consistency. This could serve as an interim solution while the native provider is being developed.

Both approaches leverage existing Clawdbot infrastructure (hooks, agents, skills) and can coexist with the current Gmail Pub/Sub integration.
