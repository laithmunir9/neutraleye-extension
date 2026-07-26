#!/bin/bash
# PostToolUse hook: run lint+test after edits to the extension's runtime/test
# code, since this repo has no CI to catch regressions otherwise.
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')

case "$file_path" in
  */popup.js|popup.js|*/content.js|content.js|*/scripts/*.mjs) ;;
  *) exit 0 ;;
esac

if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  cd "$CLAUDE_PROJECT_DIR"
fi
npm run lint && npm run test
