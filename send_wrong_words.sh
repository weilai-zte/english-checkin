#!/bin/bash
# send_wrong_words.sh — 每日 20:00 推送今日错词
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
export FEISHU_WEBHOOK="${FEISHU_WEBHOOK:-}"
export HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
exec python3 "$SCRIPT_DIR/send_wrong_words.py"