#!/bin/bash
# Clawdbot Restart Script with Safe Cleanup
# Location: /home/admin/clawdbot/
#
# Usage:
#   ./restart-clawdbot.sh           # Safe restart with status check
#   ./restart-clawdbot.sh --cleanup # Restart + cleanup old processes

set -e

# Color variables for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🦞 Clawdbot Safe Restart${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to cleanup old gateway processes
cleanup_old_processes() {
    echo -e "${BLUE}Checking for stale gateway processes...${NC}"

    # Find any clawdbot gateway processes
    OLD_PIDS=$(pgrep -f "clawdbot.*gateway" || true)

    if [ -n "$OLD_PIDS" ]; then
        echo -e "${YELLOW}Found old gateway processes: $OLD_PIDS${NC}"

        # Count processes
        PROCESS_COUNT=$(echo "$OLD_PIDS" | wc -l)

        if [ "$PROCESS_COUNT" -gt 1 ]; then
            echo -e "${YELLOW}⚠️  Multiple gateway processes found (expected 1)${NC}"
            echo -e "${YELLOW}This may indicate zombie processes${NC}"
        fi

        # Show process details
        echo -e "${BLUE}Process details:${NC}"
        ps aux | grep -E "clawdbot.*gateway" | grep -v grep || true

        if [ "$1" = "--force" ]; then
            echo -e "${YELLOW}Force cleanup requested - terminating old processes...${NC}"
            pkill -f "clawdbot.*gateway" 2>/dev/null || true
            sleep 2
            echo -e "${GREEN}✓ Old processes terminated${NC}"
        else
            echo -e "${BLUE}(Use --cleanup to force terminate old processes)${NC}"
        fi
    else
        echo -e "${GREEN}✓ No stale processes found${NC}"
    fi
}

# Function to check cron jobs file integrity
check_cron_integrity() {
    echo -e "\n${BLUE}Checking cron jobs configuration...${NC}"

    CRON_FILE="$HOME/.clawdbot/cron/jobs.json"

    if [ ! -f "$CRON_FILE" ]; then
        echo -e "${RED}✗ Cron jobs file not found: $CRON_FILE${NC}"
        return 1
    fi

    # Validate JSON
    if ! jq empty "$CRON_FILE" 2>/dev/null; then
        echo -e "${RED}✗ Invalid JSON in cron jobs file${NC}"
        return 1
    fi

    # Count jobs
    JOB_COUNT=$(jq '.jobs | length' "$CRON_FILE" 2>/dev/null || echo "0")
    echo -e "${GREEN}✓ Cron jobs file valid ($JOB_COUNT jobs configured)${NC}"

    # Show Adelaide timezone jobs
    ADELAIDE_JOBS=$(jq -r '.jobs[] | select(.schedule.tz == "Australia/Adelaide") | .name' "$CRON_FILE" 2>/dev/null | wc -l)
    echo -e "${GREEN}✓ Jobs using Adelaide timezone: $ADELAIDE_JOBS${NC}"

    return 0
}

# Function to show gateway status
show_status() {
    echo -e "\n${BLUE}Gateway Status:${NC}"

    if systemctl --user is-active clawdbot >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Service: active${NC}"

        # Show recent log entries
        echo -e "\n${BLUE}Recent activity (last 5 lines):${NC}"
        journalctl --user -u clawdbot --no-pager -n 5 --output=cat 2>/dev/null || true

        # Check provider status
        echo -e "\n${BLUE}Provider Status:${NC}"
        clawdbot gateway call providers.status --params '{}' 2>/dev/null | jq -r '
            "Discord: \(if .discord.running then "✓ Online" else "✗ Offline" end)",
            "Telegram: \(if .telegram.running then "✓ Online" else "✗ Offline" end)"
        ' 2>/dev/null || echo -e "${YELLOW}Providers not yet ready${NC}"

        # Check cron status
        echo -e "\n${BLUE}Cron Scheduler:${NC}"
        clawdbot gateway call cron.status --params '{}' 2>/dev/null | jq -r '
            "Status: \(if .enabled then "✓ Enabled" else "✗ Disabled" end)",
            "Jobs: \(.jobs)"
        ' 2>/dev/null || echo -e "${YELLOW}Cron not yet ready${NC}"
    else
        echo -e "${RED}✗ Service: inactive${NC}"
    fi
}

# Main restart logic
echo -e "${BLUE}Step 1: Pre-restart checks${NC}"

# Check if cleanup was requested
if [ "$1" = "--cleanup" ]; then
    cleanup_old_processes --force
else
    cleanup_old_processes
fi

# Validate cron configuration
if ! check_cron_integrity; then
    echo -e "${RED}❌ Cron configuration invalid - aborting restart${NC}"
    exit 1
fi

# Step 2: Stop the service
echo -e "\n${BLUE}Step 2: Stopping Clawdbot service...${NC}"
if systemctl --user stop clawdbot 2>/dev/null; then
    echo -e "${GREEN}✓ Service stopped${NC}"
else
    echo -e "${YELLOW}⚠️  Service may not have been running${NC}"
fi

# Give it a moment to clean up
sleep 2

# Check for lingering processes after service stop
REMAINING=$(pgrep -f "clawdbot.*gateway" || true)
if [ -n "$REMAINING" ]; then
    echo -e "${YELLOW}⚠️  Gateway processes still running after service stop${NC}"
    echo -e "${YELLOW}Terminating remaining processes...${NC}"
    pkill -f "clawdbot.*gateway" 2>/dev/null || true
    sleep 2
    echo -e "${GREEN}✓ Cleanup complete${NC}"
fi

# Step 3: Start the service
echo -e "\n${BLUE}Step 3: Starting Clawdbot service...${NC}"
if systemctl --user start clawdbot; then
    echo -e "${GREEN}✓ Service started${NC}"
else
    echo -e "${RED}❌ Failed to start service${NC}"
    echo -e "${YELLOW}Check logs: journalctl --user -u clawdbot --no-pager -n 50${NC}"
    exit 1
fi

# Step 4: Wait for service to be ready
echo -e "\n${BLUE}Step 4: Waiting for services to initialize...${NC}"
sleep 5

# Step 5: Verify everything is working
echo -e "\n${BLUE}Step 5: Verification${NC}"
show_status

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Clawdbot restart complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo -e "  Status:       systemctl --user status clawdbot"
echo -e "  Logs (live):  journalctl --user -u clawdbot -f"
echo -e "  Logs (tail):  journalctl --user -u clawdbot --no-pager -n 50"
echo -e "  Cron jobs:    clawdbot cron list"
echo -e "  Stop:         systemctl --user stop clawdbot"
echo ""
