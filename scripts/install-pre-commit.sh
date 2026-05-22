#!/usr/bin/env bash
#
# Install the shared pre-commit safety check hook.
# Run once after cloning, or after the hook gets removed.
#
# The canonical check script lives in the parent monorepo dir at
# Transcriber/scripts/check-sensitive.sh and is symlinked into .git/hooks.
# This keeps both repos (cloud + local OSS) using the same patterns.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
SHARED="$REPO_ROOT/../scripts/check-sensitive.sh"
HOOK="$REPO_ROOT/.git/hooks/pre-commit"

if [ ! -f "$SHARED" ]; then
  echo "ERROR: shared script not found at $SHARED"
  echo "Expected this repo to live under the Transcriber monorepo parent dir."
  exit 1
fi

if [ -e "$HOOK" ] && [ ! -L "$HOOK" ]; then
  echo "Existing non-symlink hook at $HOOK — backing up to .bak"
  mv "$HOOK" "$HOOK.bak"
fi

ln -sfn "$SHARED" "$HOOK"
chmod +x "$SHARED"
echo "Installed: $HOOK -> $(readlink "$HOOK")"
