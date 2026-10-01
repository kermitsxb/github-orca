#!/usr/bin/env bash
# Builds the project and registers the native messaging host for Chromium-family browsers and Firefox
# (macOS: Chrome, Arc, Firefox; Linux: Chrome, Chromium, Brave, Edge, Firefox). Windows: use scripts/install.ps1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_NAME="com.stocki.github_orca"
cd "$ROOT"

OS="$(uname -s)"
case "$OS" in
  Darwin) ORCA_CMD="orca" ;;
  Linux) ORCA_CMD="orca-ide" ;; # on Linux, `orca` is usually the GNOME screen reader
  *) echo "Unsupported OS: $OS. Use scripts/install.ps1 on Windows" >&2; exit 1 ;;
esac

command -v node >/dev/null || { echo "Not found in PATH: node" >&2; exit 1; }
command -v "$ORCA_CMD" >/dev/null || {
  echo "Not found in PATH: $ORCA_CMD (Orca → Settings → enable the shell command)" >&2
  exit 1
}
for tool in gh git; do
  command -v "$tool" >/dev/null || { echo "Not found in PATH: $tool" >&2; exit 1; }
done
[ -f extension/extension-id.txt ] || { echo "Run first: npm run gen-key" >&2; exit 1; }
[ -f extension/firefox-id.txt ] || { echo "Missing extension/firefox-id.txt" >&2; exit 1; }

if [ "${GITHUB_ORCA_SKIP_BUILD:-}" = 1 ]; then
  echo "Skipping build (GITHUB_ORCA_SKIP_BUILD=1)"
else
  npm run build
fi

# Browsers start the host without the shell PATH: pin absolute paths (Volta shims resolve through node itself).
NODE_BIN="$(node -p 'process.execPath')"
TOOL_PATH="$(dirname "$(command -v "$ORCA_CMD")"):$(dirname "$(command -v gh)"):$(dirname "$(command -v git)"):$(dirname "$NODE_BIN"):/usr/bin:/bin"
EXT_ID="$(tr -d '[:space:]' < extension/extension-id.txt)"
GECKO_ID="$(tr -d '[:space:]' < extension/firefox-id.txt)"
WRAPPER="$ROOT/host/dist/github-orca-host"

mkdir -p "$(dirname "$WRAPPER")"
cat > "$WRAPPER" <<EOF
#!/bin/bash
export PATH="$TOOL_PATH"
export GITHUB_ORCA_HOST_MAIN=1
exec "$NODE_BIN" "$ROOT/host/dist/host.cjs" "\$@"
EOF
chmod +x "$WRAPPER"
echo "Wrapper: $WRAPPER"

MANIFEST="$(node -e 'console.log(JSON.stringify({
  name: process.argv[1],
  description: "GitHub → Orca bridge",
  path: process.argv[2],
  type: "stdio",
  allowed_origins: [`chrome-extension://${process.argv[3]}/`],
}, null, 2))' "$HOST_NAME" "$WRAPPER" "$EXT_ID")"

FIREFOX_MANIFEST="$(node -e 'console.log(JSON.stringify({
  name: process.argv[1],
  description: "GitHub → Orca bridge",
  path: process.argv[2],
  type: "stdio",
  allowed_extensions: [process.argv[3]],
}, null, 2))' "$HOST_NAME" "$WRAPPER" "$GECKO_ID")"

if [ "$OS" = Darwin ]; then
  CHROMIUM_DIRS=(
    "$HOME/Library/Application Support/Google/Chrome"
    "$HOME/Library/Application Support/Arc/User Data"
  )
  # Firefox reads <MOZILLA_DIR>/NativeMessagingHosts on macOS.
  MOZILLA_DIR="$HOME/Library/Application Support/Mozilla"
  FIREFOX_HOSTS_DIR="$MOZILLA_DIR/NativeMessagingHosts"
  BROWSERS="Chrome, Arc or Firefox"
  CHROMIUM_LABEL="Chrome/Arc"
else
  CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
  CHROMIUM_DIRS=(
    "$CONFIG_HOME/google-chrome"
    "$CONFIG_HOME/google-chrome-beta"
    "$CONFIG_HOME/chromium"
    "$CONFIG_HOME/BraveSoftware/Brave-Browser"
    "$CONFIG_HOME/microsoft-edge"
  )
  # Firefox reads ~/.mozilla/native-messaging-hosts on Linux.
  MOZILLA_DIR="$HOME/.mozilla"
  FIREFOX_HOSTS_DIR="$MOZILLA_DIR/native-messaging-hosts"
  BROWSERS="Chrome, Chromium, Brave, Edge or Firefox"
  CHROMIUM_LABEL="Chrome/Chromium/Brave/Edge"

  # Only browser app ids: other flatpak apps (editors, chat…) say nothing about the browser.
  for sandboxed in "$HOME/snap/chromium" "$HOME/snap/firefox" \
    "$HOME/.var/app/org.mozilla.firefox" "$HOME/.var/app/org.chromium.Chromium" \
    "$HOME/.var/app/com.google.Chrome" "$HOME/.var/app/com.brave.Browser" \
    "$HOME/.var/app/com.microsoft.Edge"; do
    if [ -d "$sandboxed" ]; then
      echo "Warning: sandboxed (snap/flatpak) browser detected at $sandboxed: it may block native messaging." >&2
      echo "Use a non-sandboxed (deb/rpm/tarball) browser if the buttons report the host as missing." >&2
      break
    fi
  done
fi

installed=0
for browser_dir in "${CHROMIUM_DIRS[@]}"; do
  if [ -d "$browser_dir" ]; then
    mkdir -p "$browser_dir/NativeMessagingHosts"
    printf '%s\n' "$MANIFEST" > "$browser_dir/NativeMessagingHosts/$HOST_NAME.json"
    echo "Installed: $browser_dir/NativeMessagingHosts/$HOST_NAME.json"
    installed=1
  fi
done

if [ -d "$MOZILLA_DIR" ]; then
  mkdir -p "$FIREFOX_HOSTS_DIR"
  printf '%s\n' "$FIREFOX_MANIFEST" > "$FIREFOX_HOSTS_DIR/$HOST_NAME.json"
  echo "Installed: $FIREFOX_HOSTS_DIR/$HOST_NAME.json"
  installed=1
fi
[ "$installed" = 1 ] || { echo "None of $BROWSERS found" >&2; exit 1; }
echo "Expected extension ID: $EXT_ID ($CHROMIUM_LABEL), $GECKO_ID (Firefox)"
