#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WATCH_SCRIPT="${SCRIPT_DIR}/watch-skills.sh"
STATE_DIR="${REPO_ROOT}/.git"
PID_FILE="${STATE_DIR}/skill-sync-watch.pid"
LOG_FILE="${STATE_DIR}/skill-sync-watch.log"

if [[ ! -x "${WATCH_SCRIPT}" ]]; then
  echo "Watch script is not executable: ${WATCH_SCRIPT}" >&2
  exit 1
fi

if [[ -f "${PID_FILE}" ]]; then
  existing_pid="$(cat "${PID_FILE}")"
  if [[ -n "${existing_pid}" ]] && kill -0 "${existing_pid}" 2>/dev/null; then
    echo "Skill sync watcher is already running: pid ${existing_pid}"
    echo "Log: ${LOG_FILE}"
    exit 0
  fi
fi

nohup "${WATCH_SCRIPT}" >"${LOG_FILE}" 2>&1 &
pid="$!"
echo "${pid}" >"${PID_FILE}"

echo "Started skill sync watcher: pid ${pid}"
echo "Log: ${LOG_FILE}"
