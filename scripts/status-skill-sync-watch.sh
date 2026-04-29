#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="${REPO_ROOT}/.git/skill-sync-watch.pid"
LOG_FILE="${REPO_ROOT}/.git/skill-sync-watch.log"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "Skill sync watcher is not running."
  exit 1
fi

pid="$(cat "${PID_FILE}")"
if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
  echo "Skill sync watcher is running: pid ${pid}"
  echo "Log: ${LOG_FILE}"
else
  echo "Skill sync watcher pid file exists, but process is not running: ${pid}"
  exit 1
fi
