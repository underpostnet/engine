#!/usr/bin/env bash
set -euo pipefail

BASHRC="$HOME/.bashrc"

# Check whether a "ports" function is already defined
if grep -Eq '^\s*(function\s+ports|ports\s*\(\))' "$BASHRC"; then
  echo "The 'ports' function already exists in $BASHRC. Nothing was changed."
  exit 0
fi

# Append the function to the end of ~/.bashrc
cat >> "$BASHRC" <<'EOF'

# >>> ports function added by script >>>
ports() {
  # no arguments: show listening TCP+UDP sockets
  if [ -z "$1" ]; then
    sudo ss -ltnup
    return
  fi

  # with an argument: print the header and lines that exactly match the given port
  local p="$1"
  sudo ss -tunap | awk -v p="$p" 'NR==1 || $0 ~ (":"p"($| )")'
}
# <<< ports function added by script <<<
EOF

echo "Function 'ports' was added to $BASHRC."
echo "Load it now with: source ~/.bashrc  (or open a new terminal)."
