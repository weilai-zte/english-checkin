#!/bin/bash
# send_weekly_wrong_words.sh — 每周日 20:00 推送本周错词汇总
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
export FEISHU_WEBHOOK="${FEISHU_WEBHOOK:-}"
export HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
exec python3 "$SCRIPT_DIR/send_weekly_wrong_words.py"