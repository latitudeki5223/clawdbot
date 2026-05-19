# Clawdbot Restart & Cleanup Guide

## Quick Commands

### Safe Restart (Recommended)
```bash
./restart-clawdbot.sh
```
Performs a clean restart with:
- Process health checks
- Cron configuration validation
- Safe service restart
- Status verification

### Restart with Cleanup
```bash
./restart-clawdbot.sh --cleanup
```
Same as above, but also:
- Forces termination of any stale gateway processes
- Cleans up zombie processes

### Alternative Methods
```bash
# Via start script
./start-clawdbot.sh --restart

# Direct systemd commands
systemctl --user restart clawdbot
systemctl --user status clawdbot
```

## What the Restart Script Does

### Safety Inspired by l36/set-env.sh
The restart script follows the same safety principles as your L36 Docker cleanup:

1. **Protected Resources**
   - ✅ Never removes volumes (no data loss)
   - ✅ Validates configuration before restart
   - ✅ Checks for zombie processes
   - ✅ Verifies services come back online

2. **Clean Shutdown**
   - Stops service gracefully via systemd
   - Waits for processes to terminate
   - Force-kills only if requested with `--cleanup`

3. **Verification Steps**
   - Cron jobs file integrity (JSON validation)
   - Adelaide timezone configuration (8/8 jobs)
   - Provider status (Discord + Telegram)
   - Cron scheduler status

## Current Configuration

### Timezone: Australia/Adelaide ✅
All 8 cron jobs now use Adelaide timezone

### Discord Jobs (6am Adelaide)
- **Daily Review Nudge**: Every day at 6am → #daily-review
  - Posts `/quick-daily` digest
  - Next run: Tomorrow at 6:00 AM

- **Weekly Review Nudge**: Wednesdays at 6am → #weekly-review
  - Posts `/quick-weekly` summary

- **Weekly Finance Report**: Wednesdays at 6am → #financial-reports
  - Posts finance analysis

### Coaching Jobs (Main Session)
- **Monday Motivation**: Mondays at 8am
- **Needs-Review Nudge**: Daily at 8pm
- **Inbox Processing**: Daily at 8pm
- **Friday Rock Check**: Fridays at 3pm
- **Win Streak Celebration**: Fridays at 5pm

## Monitoring Commands

```bash
# Service status
systemctl --user status clawdbot

# Live logs (follow mode)
journalctl --user -u clawdbot -f

# Recent logs (last 50 lines)
journalctl --user -u clawdbot --no-pager -n 50

# Cron jobs list
clawdbot cron list

# Provider status
clawdbot gateway call providers.status --params '{}'

# Cron scheduler status
clawdbot gateway call cron.status --params '{}'
```

## Troubleshooting

### Multiple Gateway Processes
If you see warnings about multiple processes:
```bash
./restart-clawdbot.sh --cleanup
```

### Cron Jobs Not Running
1. Check timezone: `clawdbot cron list` (should show Australia/Adelaide)
2. Verify jobs file: `cat ~/.clawdbot/cron/jobs.json | jq`
3. Check gateway is running: `systemctl --user status clawdbot`

### Providers Offline
1. Restart with cleanup: `./restart-clawdbot.sh --cleanup`
2. Check config: `cat ~/.clawdbot/clawdbot.json | jq '.discord, .telegram'`
3. Verify tokens are present

### Gateway Won't Start
1. Check logs: `journalctl --user -u clawdbot --no-pager -n 100`
2. Test direct mode: `./start-clawdbot.sh --direct`
3. Validate config: `clawdbot doctor`

## Differences from L36 Docker Cleanup

Clawdbot runs as a **native Node.js process**, not in Docker, so:

- ❌ No Docker containers to clean up
- ❌ No Docker images to prune
- ❌ No Docker networks to manage
- ❌ No volume cleanup needed

The restart script focuses on:
- ✅ Process management (not container management)
- ✅ Configuration validation
- ✅ Service health checks
- ✅ Systemd integration

## Comparison Table

| Feature | L36 set-env.sh | Clawdbot restart-clawdbot.sh |
|---------|----------------|------------------------------|
| **Runtime** | Docker containers | Native Node.js process |
| **Protected Resources** | cvps-service, postgres, redis, vault | N/A (no containers) |
| **Cleanup Strategy** | Stop non-protected containers, prune images | Kill stale gateway processes |
| **Volume Safety** | Never prunes volumes | N/A (no volumes) |
| **Network Cleanup** | Keeps segmented networks | N/A (no networks) |
| **Configuration Check** | Vault credentials | Cron jobs JSON validation |
| **Service Manager** | docker-compose | systemd --user |
| **Startup Time** | ~30-60 seconds | ~5-10 seconds |

## Best Practices

1. **Regular Restarts**: Once a week or after config changes
2. **Use --cleanup**: When you see multiple gateway processes
3. **Check Logs**: After every restart to verify clean startup
4. **Monitor Cron**: Verify jobs run on schedule (check Discord channels)
5. **Test Providers**: Send test messages after restart

## Files Created

- `/home/admin/clawdbot/restart-clawdbot.sh` - Safe restart script
- `/home/admin/clawdbot/start-clawdbot.sh` - Updated with --restart option
- `/home/admin/clawdbot/docs/RESTART-GUIDE.md` - This guide

## Next Steps

1. ✅ All cron jobs using Adelaide timezone
2. ✅ Daily Review runs every day at 6am (including weekends)
3. ✅ Safe restart script available
4. ✅ Discord and Telegram verified online

Tomorrow at 6:00 AM, you should see your first Daily Review post in Discord!
