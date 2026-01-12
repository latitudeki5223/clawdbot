---
name: clawdrepo
description: "Check status of your PRs and contributions to the clawdbot/clawdbot repository. Shows PR status, reviews, comments, CI checks, and latest releases."
---

# Clawdbot Repository Status

When the user runs `/clawdrepo`, check the status of their contributions to the clawdbot/clawdbot repository.

## What to Check

### 1. List User's PRs

First, get all open PRs authored by the user:

```bash
gh pr list --repo clawdbot/clawdbot --author @me --json number,title,state,updatedAt,isDraft
```

### 2. Get Detailed Status for Each PR

For each PR found, get detailed information:

```bash
gh pr view <PR_NUMBER> --repo clawdbot/clawdbot --json number,title,state,author,createdAt,updatedAt,reviews,comments,statusCheckRollup,mergeable,url
```

### 3. Check Latest Release

Show the latest release to see if any of the user's PRs were included:

```bash
gh release view --repo clawdbot/clawdbot --json tagName,name,publishedAt,url
```

### 4. Check for Merged PRs (Optional)

If user wants to see their merged contributions:

```bash
gh pr list --repo clawdbot/clawdbot --author @me --state merged --limit 10 --json number,title,mergedAt,url
```

## Output Format

Present the information clearly:

```
=== Clawdbot Repository Status ===

Open PRs:
  #809: fix(minimax): strip tool invocation XML from assistant text
    Status: ⏳ Open (awaiting review)
    Updated: 15 minutes ago
    Reviews: None yet
    Comments: 0
    CI: ✅ All checks passing
    URL: https://github.com/clawdbot/clawdbot/pull/809

Latest Release:
  v2026.1.12-2 (published 3 hours ago)
  https://github.com/clawdbot/clawdbot/releases/tag/v2026.1.12-2

Actions Needed:
  • None - waiting for maintainer review on PR #809
```

## Interpreting Results

### PR Status Indicators
- ⏳ **Open (awaiting review)** - No reviews yet
- 👀 **Changes requested** - Maintainer wants changes
- ✅ **Approved** - Ready to merge (waiting for maintainer)
- 🎉 **Merged** - Included in codebase

### Review Status
- **APPROVED** - Maintainer approved the PR
- **CHANGES_REQUESTED** - Need to address feedback
- **COMMENTED** - General feedback without formal approval/rejection
- No reviews - Still waiting for initial review

### CI Status
Check `statusCheckRollup` field:
- **SUCCESS** - ✅ All checks passing
- **PENDING** - ⏳ CI still running
- **FAILURE** - ❌ CI failed
- **null** - No CI configured

## Action Items

Based on the status, suggest what the user should do:

- **Changes requested** → Read comments and push updates
- **CI failing** → Check logs with `gh pr checks <number> --repo clawdbot/clawdbot`
- **Approved** → Wait for maintainer to merge
- **No reviews** → Wait patiently, no action needed
- **Comments** → Read and respond if questions asked

## Examples

### Basic check
```
User: /clawdrepo
Claude: [runs commands above and presents summary]
```

### Check specific PR
```
User: /clawdrepo check 809
Claude: [runs gh pr view 809 --repo clawdbot/clawdbot]
```

### View PR comments
```
User: /clawdrepo comments 809
Claude: [runs gh pr view 809 --repo clawdbot/clawdbot --comments]
```

## Important Notes

- Always use `--repo clawdbot/clawdbot` to specify the repository
- Use `@me` to get user's own PRs (requires authenticated `gh` CLI)
- Keep output concise but informative
- Highlight any actions the user needs to take
- Don't spam - this is manual only, no automatic polling
