#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="${REPO_ROOT}/.git/skill-sync-watch.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "Skill sync watcher is not running."
  exit 0
fi

pid="$(cat "${PID_FILE}")"
if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
  kill "${pid}"
  echo "Stopped skill sync watcher: pid ${pid}"
else
  echo "Skill sync watcher was not running: pid ${pid}"
fi

rm -f "${PID_FILE}"
