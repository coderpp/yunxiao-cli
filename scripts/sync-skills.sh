#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/.agents/skills"

TARGET_DIRS=(
  "${HOME}/pp-note/.agents/skills"
  "${HOME}/pp-note/.claude/skills"
  "${HOME}/.hermes/skills"
)

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Source skills directory does not exist: ${SOURCE_DIR}" >&2
  exit 1
fi

shopt -s nullglob
skill_dirs=("${SOURCE_DIR}"/*)

if [[ ${#skill_dirs[@]} -eq 0 ]]; then
  echo "No skills found in: ${SOURCE_DIR}" >&2
  exit 1
fi

for target_dir in "${TARGET_DIRS[@]}"; do
  mkdir -p "${target_dir}"
done

for skill_dir in "${skill_dirs[@]}"; do
  [[ -d "${skill_dir}" ]] || continue

  skill_name="$(basename "${skill_dir}")"
  for target_dir in "${TARGET_DIRS[@]}"; do
    rm -rf "${target_dir:?}/${skill_name}"
    cp -R "${skill_dir}" "${target_dir}/"
    echo "Synced ${skill_name} -> ${target_dir}/${skill_name}"
  done
done
