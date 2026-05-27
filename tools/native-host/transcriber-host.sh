#!/bin/sh
# Resolve node from PATH (requires Node 22+) and the host script relative
# to this wrapper's location, so the checked-in file works on any machine.
# `npm run install-native-host` regenerates this file with the absolute
# Node path used during install — but this fallback keeps the repo portable
# even if a contributor opens it before running the installer.
SCRIPT_DIR="$(cd "$(dirname "${0}")" && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
if [ -z "$NODE_BIN" ]; then
  echo "transcriber-host: 'node' not found on PATH. Install Node 22+ or set NODE_BIN." >&2
  exit 127
fi
exec "$NODE_BIN" "$SCRIPT_DIR/transcriber-host.js" "$@"
