#!/bin/bash
# Clawdbot Status Check Script
# Quick status overview of Clawdbot gateway

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🦞 Clawdbot Status${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Service Status
echo -e "\n${BLUE}Service Status:${NC}"
if systemctl --user is-active clawdbot >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Active${NC}"
    UPTIME=$(systemctl --user show clawdbot --property=ActiveEnterTimestamp --value)
    echo -e "  Started: $UPTIME"
else
    echo -e "  ${RED}✗ Inactive${NC}"
fi

# Process Count
PROC_COUNT=$(pgrep -f "clawdbot.*gateway" | wc -l)
if [ "$PROC_COUNT" -eq 1 ]; then
    echo -e "  ${GREEN}✓ 1 gateway process${NC}"
elif [ "$PROC_COUNT" -gt 1 ]; then
    echo -e "  ${YELLOW}⚠️  $PROC_COUNT gateway processes (expected 1)${NC}"
    echo -e "  ${YELLOW}Run: ./restart-clawdbot.sh --cleanup${NC}"
elif [ "$PROC_COUNT" -eq 0 ]; then
    echo -e "  ${RED}✗ No gateway process running${NC}"
fi

# Provider Status
echo -e "\n${BLUE}Providers:${NC}"
STATUS=$(clawdbot gateway call providers.status --params '{}' 2>/dev/null)
if [ -n "$STATUS" ]; then
    DISCORD=$(echo "$STATUS" | jq -r 'if .discord.running then "✓ Online" else "✗ Offline" end' 2>/dev/null)
    TELEGRAM=$(echo "$STATUS" | jq -r 'if .telegram.running then "✓ Online" else "✗ Offline" end' 2>/dev/null)

    if [[ "$DISCORD" == *"Online"* ]]; then
        echo -e "  Discord:  ${GREEN}$DISCORD${NC}"
    else
        echo -e "  Discord:  ${RED}$DISCORD${NC}"
    fi

    if [[ "$TELEGRAM" == *"Online"* ]]; then
        echo -e "  Telegram: ${GREEN}$TELEGRAM${NC}"
    else
        echo -e "  Telegram: ${RED}$TELEGRAM${NC}"
    fi
else
    echo -e "  ${YELLOW}Unable to fetch provider status${NC}"
fi

# Cron Status
echo -e "\n${BLUE}Cron Scheduler:${NC}"
CRON=$(clawdbot gateway call cron.status --params '{}' 2>/dev/null)
if [ -n "$CRON" ]; then
    ENABLED=$(echo "$CRON" | jq -r '.enabled' 2>/dev/null)
    JOBS=$(echo "$CRON" | jq -r '.jobs' 2>/dev/null)

    if [ "$ENABLED" = "true" ]; then
        echo -e "  ${GREEN}✓ Enabled${NC}"
        echo -e "  Jobs configured: $JOBS"
    else
        echo -e "  ${RED}✗ Disabled${NC}"
    fi
else
    echo -e "  ${YELLOW}Unable to fetch cron status${NC}"
fi

# Next Scheduled Jobs
echo -e "\n${BLUE}Next 3 Scheduled Jobs:${NC}"
clawdbot cron list 2>/dev/null | head -4 | tail -3

# Recent Activity
echo -e "\n${BLUE}Recent Activity (last 3 lines):${NC}"
journalctl --user -u clawdbot --no-pager -n 3 --output=cat 2>/dev/null | sed 's/^/  /'

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Commands:${NC}"
echo -e "  Restart:  ./restart-clawdbot.sh"
echo -e "  Logs:     journalctl --user -u clawdbot -f"
echo -e "  Full status: systemctl --user status clawdbot"
echo ""
