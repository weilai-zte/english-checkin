#!/bin/bash
# SPARV Workflow Script for English Checkin
# Wraps sparv skill scripts with git integration

set -e

SCRIPT_DIR="$HOME/.claude/skills/sparv/scripts"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load state
load_state() {
    if [ -f ".sparv/plan/*/state.yaml" ]; then
        STATE_FILE=$(ls -t .sparv/plan/*/state.yaml 2>/dev/null | head -1)
        SESSION_ID=$(basename "$(dirname "$STATE_FILE")")
        CURRENT_PHASE=$(grep '^current_phase:' "$STATE_FILE" 2>/dev/null | cut -d' ' -f2)
        ACTION_COUNT=$(grep '^action_count:' "$STATE_FILE" 2>/dev/null | cut -d' ' -f2)
    else
        SESSION_ID="none"
        CURRENT_PHASE="none"
        ACTION_COUNT=0
    fi
}

show_status() {
    load_state

    echo -e "${BLUE}=== SPARV + Git Status ===${NC}"
    echo ""
    echo -e "Session:  ${GREEN}$SESSION_ID${NC}"
    echo -e "Phase:    ${YELLOW}$CURRENT_PHASE${NC}"
    echo -e "Actions:  $ACTION_COUNT"
    echo ""

    # Git status
    if git rev-parse --git-dir >/dev/null 2>&1; then
        echo -e "${BLUE}Git Status:${NC}"
        git status --short 2>/dev/null | head -10
        echo ""

        # Last commit
        LAST_COMMIT=$(git log --oneline -1 --format="%h %s" 2>/dev/null || echo "none")
        echo -e "Last commit: ${GREEN}$LAST_COMMIT${NC}"
    else
        echo -e "${RED}Not a git repository${NC}"
    fi
    echo ""
}

new_session() {
    echo -e "${BLUE}Initializing new SPARV session...${NC}"
    "$SCRIPT_DIR/init-session.sh" --force 2>/dev/null || echo "Session initialized"
    show_status
}

save_progress() {
    load_state
    if [ "$SESSION_ID" != "none" ] && [ "$ACTION_COUNT" -gt 0 ]; then
        "$SCRIPT_DIR/save-progress.sh" 2>/dev/null || true
    fi
}

commit() {
    load_state
    if [ "$SESSION_ID" == "none" ]; then
        echo -e "${RED}No active SPARV session. Run '$0 new' first.${NC}"
        exit 1
    fi

    local msg="$1"
    if [ -z "$msg" ]; then
        echo -e "${YELLOW}Usage: $0 commit <message>${NC}"
        echo -e "Current phase: $CURRENT_PHASE"
        exit 1
    fi

    # Auto-save progress
    save_progress

    # Make commit with SPARV metadata
    git add -A
    git commit -m "[SPARV:$CURRENT_PHASE] $msg" -m "Session: $SESSION_ID" 2>/dev/null
    echo -e "${GREEN}Committed with SPARV phase: $CURRENT_PHASE${NC}"
}

show_help() {
    echo -e "${BLUE}SPARV Workflow for English Checkin${NC}"
    echo ""
    echo -e "${GREEN}Commands:${NC}"
    echo "  $0 status      Show SPARV + git status"
    echo "  $0 new         Start new SPARV session"
    echo "  $0 commit <m>  Commit with SPARV phase tag"
    echo "  $0 save        Save SPARV progress"
    echo "  $0 log         Show recent commits"
    echo "  $0 diff        Show uncommitted changes"
    echo "  $0 help        Show this help"
    echo ""
    echo -e "${GREEN}SPARV Phases:${NC}"
    echo "  specify → plan → act → review → vault"
    echo ""
    echo -e "${GREEN}Workflow:${NC}"
    echo "  1. $0 new              # Start new session"
    echo "  2. Work on your task"
    echo "  3. $0 commit <message> # Save progress"
    echo "  4. Repeat step 2-3"
    echo "  5. Run 'sparv' skill for full workflow"
}

case "${1:-help}" in
    status) show_status ;;
    new) new_session ;;
    commit) commit "$2" ;;
    save) save_progress ;;
    log) git log --oneline -10 ;;
    diff) git diff ;;
    *) show_help ;;
esac