#!/bin/bash
# PreToolUse hook: ask for confirmation before manifest.json's "permissions"
# field changes, per CLAUDE.md's "Ask Before Doing" rule.
set -euo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

case "$file_path" in
  */manifest.json|manifest.json) ;;
  *) exit 0 ;;
esac

ask() {
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "manifest.json permissions are changing — CLAUDE.md requires confirmation before any permission change."
    }
  }'
  exit 0
}

if [ "$tool_name" = "Write" ]; then
  new_content=$(echo "$input" | jq -r '.tool_input.content // empty')
  new_perms=$(echo "$new_content" | jq -cS '.permissions // empty' 2>/dev/null || echo "")
  old_perms=$(jq -cS '.permissions // empty' "$file_path" 2>/dev/null || echo "")
  if [ "$new_perms" != "$old_perms" ]; then
    ask
  fi
elif [ "$tool_name" = "Edit" ]; then
  old_string=$(echo "$input" | jq -r '.tool_input.old_string // empty')
  new_string=$(echo "$input" | jq -r '.tool_input.new_string // empty')
  if printf '%s%s' "$old_string" "$new_string" | grep -q '"permissions"'; then
    ask
  fi
fi

exit 0
