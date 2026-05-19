#!/bin/bash
#
# Discord Webhook Testing Script
#
# Tests Discord webhook connectivity with various payload formats:
# 1. Simple text message
# 2. Rich embed with metadata
# 3. Embed with image URL (snapshot)
# 4. Batch testing multiple webhooks
#
# Usage:
#   ./discord-webhook-test.sh <webhook_url>
#   ./discord-webhook-test.sh "https://discord.com/api/webhooks/ID/TOKEN"
#   ./discord-webhook-test.sh --all  (test all webhooks in config)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# CONFIGURATION
# ============================================================================

WEBHOOK_URL="${1:-}"
FRIGATE_PUBLIC_URL="${FRIGATE_PUBLIC_URL:-https://your-machine-name.ts.net}"
TIMEOUT=10

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_header() {
  echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

validate_url() {
  if [[ ! $1 =~ ^https?:// ]]; then
    print_error "Invalid URL format: $1"
    print_info "Expected: https://discord.com/api/webhooks/ID/TOKEN"
    return 1
  fi
  return 0
}

test_webhook() {
  local webhook_url="$1"
  local test_name="$2"
  local payload="$3"

  print_info "Testing: $test_name"

  # Execute curl with timeout
  local http_code
  http_code=$(curl \
    --silent \
    --show-error \
    --max-time "$TIMEOUT" \
    --write-out "%{http_code}" \
    --output /tmp/discord_response.txt \
    -X POST "$webhook_url" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    2>&1) || {
      print_error "Curl failed or timed out"
      cat /tmp/discord_response.txt 2>/dev/null || true
      return 1
    }

  # Read response
  local response
  response=$(cat /tmp/discord_response.txt 2>/dev/null || echo "")

  # Evaluate result
  if [[ "$http_code" == "204" ]]; then
    print_success "HTTP $http_code - Message posted successfully"
    return 0
  elif [[ "$http_code" == "429" ]]; then
    print_warning "HTTP $http_code - Rate limited by Discord"
    if [[ -n "$response" ]]; then
      print_info "Response: $response"
    fi
    return 1
  elif [[ "$http_code" == "401" ]]; then
    print_error "HTTP $http_code - Webhook token invalid or expired"
    print_info "Action: Regenerate webhook in Discord"
    return 1
  elif [[ "$http_code" == "404" ]]; then
    print_error "HTTP $http_code - Webhook not found"
    print_info "Action: Verify webhook URL is correct and not deleted"
    return 1
  elif [[ "$http_code" == "400" ]]; then
    print_error "HTTP $http_code - Invalid payload"
    print_info "Response: $response"
    return 1
  else
    print_error "HTTP $http_code - Unexpected response"
    print_info "Response: $response"
    return 1
  fi
}

# ============================================================================
# TEST 1: Simple Text Message
# ============================================================================

test_simple_message() {
  local webhook_url="$1"

  print_header "Test 1: Simple Text Message"

  local payload=$(cat <<'EOF'
{
  "content": "Frigate test message",
  "username": "Frigate Test Bot"
}
EOF
)

  test_webhook "$webhook_url" "Simple text message" "$payload"
}

# ============================================================================
# TEST 2: Rich Embed (No Image)
# ============================================================================

test_embed_metadata() {
  local webhook_url="$1"

  print_header "Test 2: Rich Embed with Metadata"

  local payload=$(cat <<'EOF'
{
  "username": "Frigate Motion Detection",
  "avatar_url": "https://frigate.video/favicon.ico",
  "embeds": [
    {
      "title": "🚨 Motion Detected: Person",
      "description": "Front Door Camera",
      "color": 16711680,
      "fields": [
        {
          "name": "Confidence",
          "value": "92%",
          "inline": true
        },
        {
          "name": "Object Type",
          "value": "person",
          "inline": true
        },
        {
          "name": "Timestamp",
          "value": "2024-01-15 14:23:45 UTC",
          "inline": true
        },
        {
          "name": "Camera Name",
          "value": "front_door",
          "inline": true
        },
        {
          "name": "Event Duration",
          "value": "4.5 seconds",
          "inline": true
        }
      ],
      "footer": {
        "text": "Frigate NVR • Event ID: abc123def456"
      },
      "timestamp": "2024-01-15T14:23:45Z"
    }
  ]
}
EOF
)

  test_webhook "$webhook_url" "Rich embed with metadata" "$payload"
}

# ============================================================================
# TEST 3: Embed with Image (Snapshot)
# ============================================================================

test_embed_with_image() {
  local webhook_url="$1"
  local image_url="$2"

  print_header "Test 3: Embed with Image URL"

  if [[ ! $image_url =~ ^https?:// ]]; then
    print_warning "Skipping image test - invalid URL: $image_url"
    print_info "Provide image URL as second parameter or set FRIGATE_PUBLIC_URL env var"
    return 1
  fi

  print_info "Using image URL: $image_url"

  local payload=$(cat <<EOF
{
  "username": "Frigate Motion Detection",
  "embeds": [
    {
      "title": "🚨 Person Detected - Front Door",
      "color": 16711680,
      "fields": [
        {
          "name": "Confidence",
          "value": "94%",
          "inline": true
        },
        {
          "name": "Time",
          "value": "2024-01-15 14:23:45",
          "inline": true
        }
      ],
      "image": {
        "url": "$image_url"
      },
      "footer": {
        "text": "Frigate NVR"
      }
    }
  ]
}
EOF
)

  test_webhook "$webhook_url" "Embed with image snapshot" "$payload"
}

# ============================================================================
# TEST 4: Multiple Embeds (Event Series)
# ============================================================================

test_multiple_embeds() {
  local webhook_url="$1"

  print_header "Test 4: Multiple Embeds (Event Series)"

  local payload=$(cat <<'EOF'
{
  "username": "Frigate Motion Detection",
  "content": "Multiple detections in last 10 seconds",
  "embeds": [
    {
      "title": "Detection #1: Person",
      "color": 16711680,
      "fields": [
        { "name": "Confidence", "value": "91%", "inline": true },
        { "name": "Time", "value": "14:23:45", "inline": true }
      ]
    },
    {
      "title": "Detection #2: Car",
      "color": 255,
      "fields": [
        { "name": "Confidence", "value": "78%", "inline": true },
        { "name": "Time", "value": "14:23:48", "inline": true }
      ]
    }
  ]
}
EOF
)

  test_webhook "$webhook_url" "Multiple embeds" "$payload"
}

# ============================================================================
# TEST 5: Embed Color Variations (Object Types)
# ============================================================================

test_color_variations() {
  local webhook_url="$1"

  print_header "Test 5: Embed Color Variations (by Object Type)"

  # Red for person
  local person_payload=$(cat <<'EOF'
{
  "username": "Frigate",
  "embeds": [
    {
      "title": "Person Detected",
      "color": 16711680,
      "fields": [
        { "name": "Confidence", "value": "89%", "inline": true }
      ]
    }
  ]
}
EOF
)

  test_webhook "$webhook_url" "Person detection (RED)" "$person_payload"

  # Green for car
  local car_payload=$(cat <<'EOF'
{
  "username": "Frigate",
  "embeds": [
    {
      "title": "Car Detected",
      "color": 65280,
      "fields": [
        { "name": "Confidence", "value": "82%", "inline": true }
      ]
    }
  ]
}
EOF
)

  test_webhook "$webhook_url" "Car detection (GREEN)" "$car_payload"

  # Blue for other
  local other_payload=$(cat <<'EOF'
{
  "username": "Frigate",
  "embeds": [
    {
      "title": "Other Detection",
      "color": 255,
      "fields": [
        { "name": "Confidence", "value": "45%", "inline": true }
      ]
    }
  ]
}
EOF
)

  test_webhook "$webhook_url" "Other detection (BLUE)" "$other_payload"
}

# ============================================================================
# BATCH TEST: Multiple Webhooks
# ============================================================================

test_batch_webhooks() {
  print_header "Batch Test: Multiple Webhooks"

  if [[ ! -f ~/.frigate/webhooks.conf ]]; then
    print_error "Webhook config not found: ~/.frigate/webhooks.conf"
    print_info "Create a config file with one webhook URL per line:"
    print_info ""
    echo '  cat > ~/.frigate/webhooks.conf << EOF'
    echo '  https://discord.com/api/webhooks/ID1/TOKEN1'
    echo '  https://discord.com/api/webhooks/ID2/TOKEN2'
    echo '  EOF'
    return 1
  fi

  local webhook_count=0
  local success_count=0

  while IFS= read -r webhook_url; do
    # Skip empty lines and comments
    [[ -z "$webhook_url" || "$webhook_url" =~ ^# ]] && continue

    webhook_count=$((webhook_count + 1))
    print_info "Testing webhook $webhook_count: ${webhook_url:0:50}..."

    local payload=$(cat <<EOF
{
  "content": "Batch test #$webhook_count - $(date +%s)"
}
EOF
)

    if test_webhook "$webhook_url" "Batch test $webhook_count" "$payload"; then
      success_count=$((success_count + 1))
    fi

    # Rate limit: wait 1 second between tests
    sleep 1
  done < ~/.frigate/webhooks.conf

  print_header "Batch Summary"
  print_info "Tested: $webhook_count webhooks"
  print_success "Successful: $success_count webhooks"
}

# ============================================================================
# CONNECTIVITY TEST
# ============================================================================

test_connectivity() {
  local webhook_url="$1"

  print_header "Connectivity Check"

  # Extract hostname from URL
  local hostname
  hostname=$(echo "$webhook_url" | sed -n 's/https\?:\/\/\([^\/]*\).*/\1/p')

  print_info "Webhook hostname: $hostname"

  # DNS lookup
  if ! host "$hostname" &>/dev/null; then
    print_error "Cannot resolve hostname: $hostname"
    return 1
  fi
  print_success "DNS resolution OK"

  # HTTPS connectivity
  if ! timeout 5 bash -c "echo >/dev/tcp/$hostname/443" 2>/dev/null; then
    print_error "Cannot connect to $hostname:443 (HTTPS)"
    return 1
  fi
  print_success "HTTPS port (443) is reachable"
}

# ============================================================================
# IMAGE URL VALIDATION
# ============================================================================

test_image_accessibility() {
  local image_url="$1"

  print_header "Image URL Accessibility Check"

  if [[ ! $image_url =~ ^https?:// ]]; then
    print_warning "Invalid image URL: $image_url"
    return 1
  fi

  print_info "Testing image URL: $image_url"

  # Check if URL is reachable
  local http_code
  http_code=$(curl \
    --silent \
    --head \
    --max-time "$TIMEOUT" \
    --write-out "%{http_code}" \
    --output /dev/null \
    "$image_url" \
    2>&1) || {
      print_error "Image URL unreachable (timeout or connection error)"
      return 1
    }

  case "$http_code" in
  200)
    print_success "Image URL is accessible (HTTP 200)"
    return 0
    ;;
  301 | 302 | 303)
    print_warning "Image URL redirects (HTTP $http_code)"
    print_info "Discord may or may not follow redirect"
    return 0
    ;;
  403)
    print_error "Access denied to image URL (HTTP 403)"
    print_info "Check file permissions and firewall rules"
    return 1
    ;;
  404)
    print_error "Image not found (HTTP 404)"
    print_info "Verify file path and event ID"
    return 1
    ;;
  *)
    print_warning "Unexpected HTTP response: $http_code"
    return 1
    ;;
  esac
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
  echo -e "${BLUE}"
  cat <<'EOF'
  ╔════════════════════════════════════════╗
  ║  Discord Webhook Testing Script        ║
  ║  Frigate Integration Test Suite        ║
  ╚════════════════════════════════════════╝
EOF
  echo -e "${NC}"

  # Handle --all flag
  if [[ "$WEBHOOK_URL" == "--all" ]]; then
    test_batch_webhooks
    exit $?
  fi

  # Validate input
  if [[ -z "$WEBHOOK_URL" ]]; then
    print_error "No webhook URL provided"
    echo ""
    echo "Usage:"
    echo "  $0 <webhook_url>"
    echo "  $0 'https://discord.com/api/webhooks/ID/TOKEN'"
    echo "  $0 --all  (test all webhooks in ~/.frigate/webhooks.conf)"
    echo ""
    echo "Examples:"
    echo "  FRIGATE_PUBLIC_URL=https://frigate.ts.net $0 'https://discord.com/api/webhooks/123/abc'"
    echo ""
    exit 1
  fi

  if ! validate_url "$WEBHOOK_URL"; then
    exit 1
  fi

  # Run all tests
  print_info "Webhook: ${WEBHOOK_URL:0:50}..."
  print_info "Public URL: $FRIGATE_PUBLIC_URL"

  # Connectivity check first
  if ! test_connectivity "$WEBHOOK_URL"; then
    print_error "Cannot reach Discord API. Check network connectivity."
    exit 1
  fi

  # Main tests
  test_simple_message "$WEBHOOK_URL" || true
  sleep 1

  test_embed_metadata "$WEBHOOK_URL" || true
  sleep 1

  test_embed_with_image "$WEBHOOK_URL" "$FRIGATE_PUBLIC_URL/api/events/test/snapshot.jpg" || true
  sleep 1

  test_multiple_embeds "$WEBHOOK_URL" || true
  sleep 1

  test_color_variations "$WEBHOOK_URL" || true
  sleep 1

  # Image test (separate)
  test_image_accessibility "$FRIGATE_PUBLIC_URL/api/events/test/snapshot.jpg" || true

  print_header "Test Suite Complete"
  print_success "All basic tests executed"
  print_info "Check Discord channel for messages"
}

# Run main
main "$@"
