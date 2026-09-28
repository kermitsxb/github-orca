#!/usr/bin/env bash
# Builds the project and registers the native messaging host for Chrome and Arc.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_NAME="com.stocki.github_orca"
cd "$ROOT"

for tool in node orca gh git; do
  command -v "$tool" >/dev/null || { echo "Introuvable dans le PATH : $tool" >&2; exit 1; }
done
[ -f extension/extension-id.txt ] || { echo "Lance d'abord : npm run gen-key" >&2; exit 1; }

npm run build

# Browsers start the host without the shell PATH: pin absolute paths (Volta shims resolve through node itself).
NODE_BIN="$(node -p 'process.execPath')"
TOOL_PATH="$(dirname "$(command -v orca)"):$(dirname "$(command -v gh)"):$(dirname "$(command -v git)"):$(dirname "$NODE_BIN"):/usr/bin:/bin"
EXT_ID="$(tr -d '[:space:]' < extension/extension-id.txt)"
WRAPPER="$ROOT/host/dist/github-orca-host"

cat > "$WRAPPER" <<EOF
#!/bin/bash
export PATH="$TOOL_PATH"
export GITHUB_ORCA_HOST_MAIN=1
exec "$NODE_BIN" "$ROOT/host/dist/host.cjs" "\$@"
EOF
chmod +x "$WRAPPER"

MANIFEST="$(node -e 'console.log(JSON.stringify({
  name: process.argv[1],
  description: "GitHub → Orca bridge",
  path: process.argv[2],
  type: "stdio",
  allowed_origins: [`chrome-extension://${process.argv[3]}/`],
}, null, 2))' "$HOST_NAME" "$WRAPPER" "$EXT_ID")"

installed=0
for browser_dir in \
  "$HOME/Library/Application Support/Google/Chrome" \
  "$HOME/Library/Application Support/Arc/User Data"; do
  if [ -d "$browser_dir" ]; then
    mkdir -p "$browser_dir/NativeMessagingHosts"
    printf '%s\n' "$MANIFEST" > "$browser_dir/NativeMessagingHosts/$HOST_NAME.json"
    echo "Installé : $browser_dir/NativeMessagingHosts/$HOST_NAME.json"
    installed=1
  fi
done
[ "$installed" = 1 ] || { echo "Ni Chrome ni Arc trouvés" >&2; exit 1; }
echo "Extension ID attendu : $EXT_ID"
