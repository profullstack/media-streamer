#!/bin/bash

# Torrent search aggregator using torge
# Searches across multiple torrent providers and returns JSON results
#
# Usage: ./torge-all.sh "search query" [-s sort_option]
# Sort options: date, size, seeders, leechers

# Array of providers to search
providers=(thepiratebay limetorrents 1337x rarbg nyaa libgen)

# Per-provider timeout in seconds (20 seconds per provider)
# This ensures slow providers don't block the entire search
PROVIDER_TIMEOUT=20

# Temporary file to collect results
temp_results=$(mktemp)

# Log to stderr so it doesn't interfere with JSON output
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

log "Starting torrent search across ${#providers[@]} providers..."
log "Search query: $*"
log "Per-provider timeout: ${PROVIDER_TIMEOUT}s"

# Search each provider
for provider in "${providers[@]}"; do
    log "Searching provider: $provider"
    
    # Run torge with timeout and capture output and errors separately
    error_file=$(mktemp)
    result=$(timeout "${PROVIDER_TIMEOUT}s" torge "$provider" --no-prompt --link-conv -s date --json "$@" 2>"$error_file")
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        # Check if result is valid JSON and has results
        result_count=$(echo "$result" | jq -r '.results | length' 2>/dev/null || echo "0")
        log "  ✓ $provider completed: $result_count results"
        echo "$result" >> "$temp_results"
    elif [ $exit_code -eq 124 ]; then
        # Timeout exit code - provider took too long
        log "  ⏱ $provider timed out after ${PROVIDER_TIMEOUT}s (skipping)"
    else
        # Show the actual error message
        error_msg=$(cat "$error_file" | head -3 | tr '\n' ' ')
        if [ -n "$error_msg" ]; then
            log "  ✗ $provider failed: $error_msg"
        else
            log "  ✗ $provider failed with exit code $exit_code (no error message)"
        fi
    fi
    rm -f "$error_file"
done

log "Aggregating results..."

# Combine and format all results
jq -rcs '. | map(select(.site != null and .results != null) | {"provider":(.site // "unknown"),"results":.results})' "$temp_results"

# Cleanup
rm -f "$temp_results"

log "Search complete"
