#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER=$(node bin config get --plain DEFAULT_SSH_USER)
REMOTE_HOST=$(node bin config get --plain DEFAULT_SSH_HOST)
SSH_KEY=$(node bin config get --plain DEFAULT_SSH_KEY_PATH)

chmod 600 "$SSH_KEY"

ssh -i "$SSH_KEY" -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}" sh <<EOF
cd /home/dd/engine
node bin deploy dd production --status
kubectl get pods -A
EOF
