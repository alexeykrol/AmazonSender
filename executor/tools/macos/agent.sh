#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"

LABEL="com.alexeykrol.amazonsender.executor"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/AmazonSender"

EXECUTOR_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
NVMRC_PATH="${EXECUTOR_DIR}/.nvmrc"

usage() {
  cat <<EOF
Usage:
  bash $0 install    # install + start background agent (launchd)
  bash $0 uninstall  # stop + remove background agent
  bash $0 restart    # restart background agent
  bash $0 status     # show launchd + /health status
  bash $0 logs       # tail agent logs
EOF
}

detect_node_bin() {
  # Prefer nvm-managed Node from ~/.nvm to avoid using an older system Node.
  if [[ -f "${NVMRC_PATH}" && -d "${HOME}/.nvm/versions/node" ]]; then
    local wanted
    wanted="$(tr -d ' \t\r\n' < "${NVMRC_PATH}" || true)"

    local candidate=""
    if [[ "${wanted}" == *.* ]]; then
      candidate="${HOME}/.nvm/versions/node/v${wanted}/bin/node"
      if [[ -x "${candidate}" ]]; then
        echo "${candidate}"
        return 0
      fi
    fi

    # Treat as major ("20") and pick the highest installed v20.x.y.
    candidate="$(ls -1d "${HOME}/.nvm/versions/node/v${wanted}."* 2>/dev/null | sort -V | tail -n 1 || true)"
    if [[ -n "${candidate}" && -x "${candidate}/bin/node" ]]; then
      echo "${candidate}/bin/node"
      return 0
    fi
  fi

  # Fallback: whatever is in PATH.
  command -v node || true
}

ensure_node_ok() {
  local node_bin="$1"
  if [[ -z "${node_bin}" || ! -x "${node_bin}" ]]; then
    echo "ERROR: Node.js not found. Install Node 20 (recommended via nvm) and retry." >&2
    exit 1
  fi
  local ver
  ver="$("${node_bin}" -v | tr -d 'v' || true)"
  local major
  major="${ver%%.*}"
  if [[ "${major}" -lt 20 ]]; then
    echo "ERROR: Node.js ${ver} found at ${node_bin}, but executor requires Node.js >= 20." >&2
    echo "Hint: install Node 20 with nvm and set executor/.nvmrc accordingly." >&2
    exit 1
  fi
}

write_plist() {
  local node_bin="$1"
  mkdir -p "${HOME}/Library/LaunchAgents" "${LOG_DIR}"

  cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>WorkingDirectory</key>
    <string>${EXECUTOR_DIR}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${node_bin}</string>
      <string>${EXECUTOR_DIR}/src/server.js</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/executor.out.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/executor.err.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
  </dict>
</plist>
EOF
}

install_agent() {
  local node_bin
  node_bin="$(detect_node_bin)"
  ensure_node_ok "${node_bin}"
  write_plist "${node_bin}"

  # Stop previous instance (if any), then start fresh.
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
  launchctl bootstrap "${DOMAIN}" "${PLIST_PATH}"
  launchctl enable "${DOMAIN}/${LABEL}"
  launchctl kickstart -k "${DOMAIN}/${LABEL}"

  echo "OK: installed launchd agent ${LABEL}"
  echo "Logs: ${LOG_DIR}/executor.out.log"
}

uninstall_agent() {
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
  rm -f "${PLIST_PATH}"
  echo "OK: removed launchd agent ${LABEL}"
}

status_agent() {
  echo "launchd:"
  launchctl print "${DOMAIN}/${LABEL}" 2>/dev/null | head -n 40 || echo "  (not loaded)"
  echo
  echo "health:"
  curl -fsS "http://127.0.0.1:3000/health" || echo "  (not responding on 127.0.0.1:3000)"
  echo
}

logs_agent() {
  echo "==> ${LOG_DIR}/executor.err.log"
  tail -n 80 "${LOG_DIR}/executor.err.log" 2>/dev/null || true
  echo
  echo "==> ${LOG_DIR}/executor.out.log"
  tail -n 120 "${LOG_DIR}/executor.out.log" 2>/dev/null || true
}

case "${CMD}" in
  install) install_agent ;;
  uninstall) uninstall_agent ;;
  restart) uninstall_agent; install_agent ;;
  status) status_agent ;;
  logs) logs_agent ;;
  ""|-h|--help) usage ;;
  *) echo "ERROR: unknown command: ${CMD}" >&2; usage; exit 1 ;;
esac

