#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/.agents/skills"
SYNC_SCRIPT="${SCRIPT_DIR}/sync-skills.sh"
INTERVAL_SECONDS="${SKILL_SYNC_INTERVAL:-2}"

if [[ ! -x "${SYNC_SCRIPT}" ]]; then
  echo "Sync script is not executable: ${SYNC_SCRIPT}" >&2
  exit 1
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Source skills directory does not exist: ${SOURCE_DIR}" >&2
  exit 1
fi

signature() {
  find "${SOURCE_DIR}" -type f -print \
    | LC_ALL=C sort \
    | while IFS= read -r file; do
        shasum "${file}"
      done \
    | shasum \
    | awk '{print $1}'
}

sync_now() {
  echo "Syncing skills at $(date '+%Y-%m-%d %H:%M:%S')"
  "${SYNC_SCRIPT}"
}

echo "Watching ${SOURCE_DIR}"
echo "Sync interval: ${INTERVAL_SECONDS}s"
echo "Press Ctrl+C to stop."

sync_now
last_signature="$(signature)"

while true; do
  sleep "${INTERVAL_SECONDS}"
  current_signature="$(signature)"

  if [[ "${current_signature}" != "${last_signature}" ]]; then
    sleep 0.5
    current_signature="$(signature)"
    sync_now
    last_signature="${current_signature}"
  fi
done
