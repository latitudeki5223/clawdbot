#!/bin/bash
# Clawdbot Startup Script
# Location: /home/admin/clawdbot/
#
# Usage:
#   ./start-clawdbot.sh          # Start via systemd (recommended)
#   ./start-clawdbot.sh --direct # Run directly in foreground (for debugging)
#   ./start-clawdbot.sh --restart # Safe restart with cleanup

# Color variables
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ "$1" = "--restart" ]; then
    # Restart mode - use the dedicated restart script
    if [ -f "/home/admin/clawdbot/restart-clawdbot.sh" ]; then
        exec /home/admin/clawdbot/restart-clawdbot.sh "$2"
    else
        echo -e "${YELLOW}⚠️  restart-clawdbot.sh not found, performing basic restart...${NC}"
        systemctl --user restart clawdbot
        sleep 3
        systemctl --user status clawdbot --no-pager
    fi
elif [ "$1" = "--direct" ]; then
    # Direct mode - run in foreground (for debugging)
    echo "Starting Clawdbot in direct mode..."

    # Load NVM for Node 22+
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # Set up PATH for pnpm and bun
    export PNPM_HOME="/home/admin/.local/share/pnpm"
    export PATH="$PNPM_HOME:/home/admin/.bun/bin:$PATH"

    # Force IPv4 for Node.js (IPv6 route to Telegram is broken)
    export NODE_OPTIONS="--dns-result-order=ipv4first -r /home/admin/clawdbot/preload-ipv4.cjs"

    # Source vault exports (for MINIMAX_API_KEY and other secrets)
    if [ -f "/home/admin/l36/security/scripts/vault/export-from-vault.sh" ]; then
        source /home/admin/l36/security/scripts/vault/export-from-vault.sh
    fi

    # Unset ALL L36 Telegram env vars so ClawdBot uses its own config (channels.telegram.botToken)
    unset TELEGRAM_BOT_TOKEN
    unset TELEGRAM_SECRET_TOKEN
    unset TELEGRAM_ENABLED
    unset TELEGRAM_GROUP_CHAT_ID
    unset TELEGRAM_ADMIN_CHAT_ID

    # Change to clawdbot directory
    cd /home/admin/clawdbot

    # Run clawdbot gateway
    clawdbot gateway "${@:2}"
else
    # Systemd mode (recommended)
    echo "Starting Clawdbot via systemd..."
    systemctl --user start clawdbot
    sleep 2
    systemctl --user status clawdbot --no-pager
fi
