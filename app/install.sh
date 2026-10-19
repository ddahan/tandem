#!/bin/sh
# Installs (or updates) Tandem from this repository's app/ folder, without Docker or admin
# rights. Tandem is JavaScript (app/tandem/), run by Node 22.16 or later (not 23): the computer's
# own, when it has one (then no network is needed); otherwise the installer offers to download
# one for Tandem only (app/node.env: version and checksums). Download the repository (GitHub:
# Code › Download ZIP), unzip it, then run:
#   sh ~/Downloads/tandem-main/app/install.sh
#
# It copies the app into your home folder, writes the `tandem` command (the app run by this
# Node), asks where your notes live, and starts Tandem at login (macOS: a LaunchAgent; Linux: a
# systemd user service). Update: the same with a newer download, or after changing Node.
# Uninstall (your notes stay): sh install.sh --uninstall
#
# Options (environment): TANDEM_NODE (the Node to use), TANDEM_INSTALL_NODE (1: download Node
# without asking when none fits, e.g. for an agent with no terminal; 0: never), TANDEM_NODE_MIRROR
# (a copy of nodejs.org/dist), TANDEM_DATA_DIR (notes folder), TANDEM_PORT (default 3000),
# TANDEM_BIN_DIR (default ~/.local/bin), TANDEM_HOME (the app's own folder), TANDEM_SERVICE_LABEL
# (the login item's name, default app.tandem), TANDEM_NO_OPEN=1 (don't open the browser).
set -eu

REPO="ddahan/tandem"
# The login item's name (another one runs a second Tandem, e.g. TANDEM_HOME + TANDEM_PORT).
LABEL="${TANDEM_SERVICE_LABEL:-app.tandem}"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'Tandem: %s\n' "$*" >&2
  exit 1
}

# --- Where things go ------------------------------------------------------------------------
os="$(uname -s)"
case "$os" in
  Darwin)
    platform=darwin
    app_dir="${TANDEM_HOME:-$HOME/Library/Application Support/Tandem}"
    service_file="$HOME/Library/LaunchAgents/$LABEL.plist"
    log_file="$HOME/Library/Logs/Tandem.log"
    [ "$LABEL" = app.tandem ] || log_file="$HOME/Library/Logs/$LABEL.log"
    ;;
  Linux)
    platform=linux
    app_dir="${TANDEM_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/tandem}"
    service_file="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/tandem.service"
    log_file=""
    ;;
  *) fail "this installer supports macOS and Linux (found $os)." ;;
esac
bin_dir="${TANDEM_BIN_DIR:-$HOME/.local/bin}"
bin="$bin_dir/tandem"
settings="$app_dir/install.env"
# The repository's app/ folder: this file's. The app is its tandem/ folder.
here="$(cd "$(dirname "$0")" && pwd)"

stop_service() {
  if [ "$platform" = darwin ]; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2> /dev/null || true
    # bootout returns before the service is gone: registering it again too early fails.
    i=0
    while launchctl print "gui/$(id -u)/$LABEL" > /dev/null 2>&1 && [ "$i" -lt 20 ]; do
      i=$((i + 1))
      sleep 0.5
    done
  elif command -v systemctl > /dev/null 2>&1; then
    systemctl --user disable --now tandem.service 2> /dev/null || true
  fi
}

# --- Uninstall ------------------------------------------------------------------------------
if [ "${1:-}" = --uninstall ]; then
  stop_service
  rm -f "$service_file" "$bin"
  rm -rf "$app_dir/app" "$app_dir/node"
  [ "$platform" = linux ] && command -v systemctl > /dev/null 2>&1 && systemctl --user daemon-reload || true
  say "Tandem is uninstalled. Your notes are untouched; the app's own folder (database copy,"
  say "settings) is kept in: $app_dir"
  exit 0
fi

# --- The app and Node -----------------------------------------------------------------------
if [ ! -f "$here/tandem/tandem.mjs" ]; then
  fail "no app next to this installer (app/tandem/): download the whole repository again
(https://github.com/$REPO: Code › Download ZIP), unzip it, then run sh <its folder>/app/install.sh."
fi
# Tandem needs node:sqlite with setReturnArrays: Node 22.16 or later, never 23 (the app's
# nodeSupported says the same). The first that fits: TANDEM_NODE (only it, when set), the one
# the installed version runs on (an update), `node` on the PATH, Tandem's own (downloaded by an
# earlier install). None: Tandem's own is downloaded, if the user agrees (see below).
node_fits() {
  node_version="$("$1" -p process.versions.node 2> /dev/null || true)"
  major="${node_version%%.*}"
  minor="${node_version#*.}"
  minor="${minor%%.*}"
  [ -n "$node_version" ] && { [ "$major" -ge 24 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 16 ]; }; }
}
# A terminal to ask in (none for an agent running the installer, or in the background).
has_terminal() { [ -r /dev/tty ] && { : < /dev/tty; } 2> /dev/null; }
ask() {
  # Read from the terminal (standard input may not be one: an agent running the installer).
  if has_terminal; then
    printf '%s' "$1" > /dev/tty
    # Ctrl-D (the input ends): no answer, unlike Enter (the default).
    read -r answer < /dev/tty || answer="-"
  else
    answer=""
  fi
  printf '%s' "$answer"
}
own_node="$app_dir/node/bin/node"
node_help="Install Node 22.16 or later (not 23) yourself: https://nodejs.org (its .tar.gz needs no
admin rights: unpack it anywhere), nvm, Volta or Homebrew. Then run this installer again, with
TANDEM_NODE=/path/to/node in front if it isn't on your PATH:
  TANDEM_NODE=/path/to/node sh \"$here/install.sh\""

# Downloads Tandem's own Node (app/node.env: version and checksums) into the app folder: only
# the node program, never on the PATH (other Node setups are untouched).
download_node() {
  # shellcheck disable=SC1091
  . "$here/node.env"
  case "$platform-$(uname -m)" in
    darwin-arm64) build=darwin-arm64 ;;
    darwin-x86_64) build=darwin-x64 ;;
    linux-x86_64) build=linux-x64 ;;
    linux-aarch64 | linux-arm64) build=linux-arm64 ;;
    *) return 1 ;;
  esac
  expected=""
  eval "expected=\${NODE_SHA256_$(echo "$build" | tr - _)}"
  # shellcheck disable=SC2153 # NODE_VERSION: from node.env.
  name="node-v$NODE_VERSION-$build"
  # TANDEM_NODE_MIRROR: a copy of nodejs.org/dist (some companies have one).
  url="${TANDEM_NODE_MIRROR:-https://nodejs.org/dist}/v$NODE_VERSION/$name.tar.gz"
  say "Downloading Node $NODE_VERSION ($url)…"
  tmp="$(mktemp -d)"
  if ! curl -fL --progress-bar --connect-timeout 15 -o "$tmp/node.tar.gz" "$url"; then
    rm -rf "$tmp"
    say "The download failed (no network, or a proxy blocks it)."
    return 1
  fi
  if command -v shasum > /dev/null 2>&1; then
    actual="$(shasum -a 256 "$tmp/node.tar.gz" | cut -d ' ' -f 1)"
  else
    actual="$(sha256sum "$tmp/node.tar.gz" | cut -d ' ' -f 1)"
  fi
  if [ "$actual" != "$expected" ]; then
    rm -rf "$tmp"
    say "The download isn't Node $NODE_VERSION as published by nodejs.org (its checksum differs):"
    say "refused. A proxy may have changed it."
    return 1
  fi
  tar -xzf "$tmp/node.tar.gz" -C "$tmp" "$name/bin/node" "$name/LICENSE" || {
    rm -rf "$tmp"
    return 1
  }
  mkdir -p "$app_dir"
  rm -rf "$app_dir/node"
  mv "$tmp/$name" "$app_dir/node"
  rm -rf "$tmp"
}

node_bin=""
if [ -n "${TANDEM_NODE:-}" ]; then
  node_fits "$TANDEM_NODE" || fail "TANDEM_NODE=$TANDEM_NODE isn't Node 22.16 or later (not 23)${node_version:+: it is $node_version}."
  node_bin="$TANDEM_NODE"
else
  previous=""
  [ -f "$bin" ] && previous="$(sed -n 's/^exec "\([^"]*\)".*/\1/p' "$bin" | head -n 1)"
  for candidate in "$previous" "$(command -v node || true)" "$own_node"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ] && node_fits "$candidate"; then
      node_bin="$candidate"
      break
    fi
  done
fi
if [ -z "$node_bin" ]; then
  # Tandem's own Node, too old for this version: replaced without asking (it is Tandem's).
  # Otherwise asked (no terminal: TANDEM_INSTALL_NODE=1 says yes).
  if [ -x "$own_node" ] || [ "${TANDEM_INSTALL_NODE:-}" = 1 ]; then
    answer=y
  elif [ "${TANDEM_INSTALL_NODE:-}" = 0 ]; then
    answer=n
  else
    say "Tandem runs on Node (22.16 or later, not 23), which this computer doesn't have."
    answer="$(ask "Download it now, for Tandem only (about 50 MB from nodejs.org, no admin rights)? [Y/n] ")"
    has_terminal || answer=n
  fi
  case "$answer" in
    "" | y | Y | yes | Yes | o | O | oui) download_node && node_fits "$own_node" && node_bin="$own_node" ;;
  esac
  [ -n "$node_bin" ] || fail "no Node to run on. $node_help
(Or let this installer download it: TANDEM_INSTALL_NODE=1 sh \"$here/install.sh\")"
fi
# Its full path: the login item doesn't get your shell's PATH (nvm, Volta…).
node_bin="$(cd "$(dirname "$node_bin")" && pwd)/$(basename "$node_bin")"

# --- Settings: from the environment, the previous install, or questions -------------------
data_dir=""
port=""
if [ -f "$settings" ]; then
  # shellcheck disable=SC1090
  . "$settings"
fi
data_dir="${TANDEM_DATA_DIR:-$data_dir}"
# Chosen (TANDEM_PORT, or the previous install's), or the default, which may move if taken.
port_chosen="${TANDEM_PORT:-$port}"
port="${port_chosen:-3000}"

# --- The port: free, or this very Tandem's (an update) ------------------------------------
# Something answers on it (curl's 7: nothing listens).
port_used() {
  code=0
  curl -s -o /dev/null -m 2 "http://127.0.0.1:$1/" || code=$?
  [ "$code" -ne 7 ]
}
service_running() {
  if [ "$platform" = darwin ]; then
    launchctl print "gui/$(id -u)/$LABEL" > /dev/null 2>&1
  else
    command -v systemctl > /dev/null 2>&1 && systemctl --user is-active --quiet tandem.service
  fi
}
# Which app listens on it, when the system says.
port_user() {
  name="$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -Fc 2> /dev/null | sed -n 's/^c//p' | head -n 1)"
  printf '%s' "${name:-another app}"
}
if port_used "$port" && ! { service_running && curl -fs -m 2 "http://127.0.0.1:$port/health" > /dev/null 2>&1; }; then
  if [ -n "$port_chosen" ]; then
    # Not moved silently: the installed app (PWA) and agents' settings use this address.
    fail "port $port is used by $(port_user "$port"). Stop it, or choose another port:
TANDEM_PORT=$((port + 1)) sh \"$here/install.sh\" (then open Tandem at its new address, and install the app again from there)."
  fi
  taken="$port"
  while port_used "$port"; do
    port=$((port + 1))
    [ "$port" -gt $((taken + 20)) ] && fail "ports $taken to $port are all used: choose one with TANDEM_PORT=…"
  done
  say "Port $taken is used by $(port_user "$taken"): Tandem will use $port."
fi


if [ -z "$data_dir" ]; then
  say "Where should your notes live? Any folder works, also a synced one (OneDrive, iCloud…)."
  answer="$(ask "Notes folder [$HOME/Tandem]: ")"
  [ "$answer" = - ] && answer=""
  data_dir="${answer:-$HOME/Tandem}"
fi
case "$data_dir" in
  "~"*) data_dir="$HOME${data_dir#\~}" ;;
esac
mkdir -p "$data_dir"
data_dir="$(cd "$data_dir" && pwd)"

# --- The app --------------------------------------------------------------------------------
say "Installing Tandem $(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$here/tandem/manifest.json") (Node $node_version)…"
mkdir -p "$bin_dir" "$app_dir"
# Copied next to the installed one first: the running version keeps its files until it stops.
rm -rf "$app_dir/app.new"
cp -R "$here/tandem" "$app_dir/app.new"
"$node_bin" "$app_dir/app.new/tandem.mjs" version > /dev/null || fail "the app doesn't run with Node $node_version ($node_bin)."

# Stop the running version (update), then put the new one in place.
stop_service
rm -rf "$app_dir/app" "$app_dir/runtime"
mv "$app_dir/app.new" "$app_dir/app"
# The `tandem` command: the app, run by this Node (SQLite's "experimental" warning silenced on
# Node 22).
cat > "$bin" << LAUNCHER
#!/bin/sh
# Tandem, written by its installer (app/install.sh): the app run by Node $node_version.
exec "$node_bin" --disable-warning=ExperimentalWarning "$app_dir/app/tandem.mjs" "\$@"
LAUNCHER
chmod +x "$bin"
# The login item runs `tandem serve`, which reads the folder and port from this file (also
# written by Settings › Notes folder).
printf 'data_dir=%s\nport=%s\n' "'$(printf '%s' "$data_dir" | sed "s/'/'\\\\''/g")'" "$port" > "$settings"

# --- Start at login -------------------------------------------------------------------------
home_env=""
if [ "$platform" = darwin ]; then
  env_entries=""
  [ -n "${TANDEM_HOME:-}" ] && env_entries="$env_entries<key>TANDEM_HOME</key><string>$TANDEM_HOME</string>"
  [ "$LABEL" = app.tandem ] || env_entries="$env_entries<key>TANDEM_SERVICE_LABEL</key><string>$LABEL</string>"
  [ -n "$env_entries" ] && home_env="<key>EnvironmentVariables</key><dict>$env_entries</dict>"
  mkdir -p "$(dirname "$service_file")" "$(dirname "$log_file")"
  cat > "$service_file" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$bin</string><string>serve</string></array>
  $home_env
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <!-- Restarted 2 s after it stops (launchd's default is 10): switching folders restarts it. -->
  <key>ThrottleInterval</key><integer>2</integer>
  <key>StandardOutPath</key><string>$log_file</string>
  <key>StandardErrorPath</key><string>$log_file</string>
</dict>
</plist>
PLIST
  launchctl bootstrap "gui/$(id -u)" "$service_file"
elif command -v systemctl > /dev/null 2>&1; then
  [ -n "${TANDEM_HOME:-}" ] && home_env="Environment=TANDEM_HOME=$TANDEM_HOME"
  mkdir -p "$(dirname "$service_file")"
  cat > "$service_file" << UNIT
[Unit]
Description=Tandem notes

[Service]
ExecStart="$bin" serve
$home_env
Restart=on-failure

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now tandem.service
else
  say "No systemd: start Tandem yourself with: $bin serve --data \"$data_dir\" --port $port"
fi

# --- Done -----------------------------------------------------------------------------------
url="http://localhost:$port"
i=0
until curl -fs -m 2 "$url/health" > /dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && fail "Tandem didn't start. ${log_file:+See $log_file}"
  sleep 1
done

say ""
say "Tandem $("$bin" version) runs at $url (notes in $data_dir)."
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) say "Add $bin_dir to your PATH to use the tandem command (e.g. in ~/.zshrc)." ;;
esac
say ""
say "From a terminal:  tandem search \"…\", tandem --help"
say "For Claude:       claude mcp add --transport http tandem $url/mcp --header \"X-Tandem-Author: claude\""
say "Update:           download the repository again and run its app/install.sh (also after"
say "                  changing or removing this Node: $node_bin)"
say "Uninstall:        sh \"$here/install.sh\" --uninstall"

if [ -z "${TANDEM_NO_OPEN:-}" ]; then
  if [ "$platform" = darwin ]; then open "$url"; elif command -v xdg-open > /dev/null 2>&1; then xdg-open "$url" > /dev/null 2>&1 || true; fi
fi
