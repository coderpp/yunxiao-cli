#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# 只复制五个云效技能到 SYJC，不操作其他技能。
python3 - "${REPO_ROOT}" "$@" <<'PY'
import argparse
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile

source_root = Path(sys.argv[1]).resolve() / '.agents/skills'
parser = argparse.ArgumentParser(description='将五个云效技能复制到 SYJC；替换前备份现有内容。')
parser.add_argument('--check', action='store_true', help='只检查实体副本与源是否一致，不修改文件')
parser.add_argument('workspace', nargs='?', default=str(Path.home() / 'repos/syjc'))
args = parser.parse_args(sys.argv[2:])
workspace = Path(args.workspace).expanduser().resolve()
names = (
    'manage-yunxiao-workitems', 'yunxiao-workitem-stats',
    'check-software-merge-requests', 'release-software-version',
    'retry-failed-yunxiao-pipelines',
)

def manifest(directory):
    result = {}
    for path in directory.rglob('*'):
        key = str(path.relative_to(directory))
        if path.is_symlink():
            result[key] = ('link', os.readlink(path))
        elif path.is_file():
            result[key] = ('file', path.read_bytes())
        elif path.is_dir():
            result[key] = ('dir',)
        else:
            raise ValueError(f'不支持的文件类型：{path}')
    return result

try:
    git_dir = Path(subprocess.check_output(
        ['git', '-C', str(workspace), 'rev-parse', '--absolute-git-dir'],
        text=True, stderr=subprocess.PIPE,
    ).strip())
    top = Path(subprocess.check_output(
        ['git', '-C', str(workspace), 'rev-parse', '--show-toplevel'], text=True,
    ).strip()).resolve()
    if top != workspace:
        raise ValueError('目标必须是工作区 Git 根目录')
    target_root = workspace / '.agents/skills'
    if target_root.resolve() == source_root:
        raise ValueError('目标不能是技能源目录')
    pending = []
    errors = []
    # 全部预检通过后才执行任何迁移。
    for name in names:
        source = source_root / name
        target = target_root / name
        if not (source / 'SKILL.md').is_file():
            errors.append(f'源技能不可读：{source}')
        elif source.is_symlink() or any(p.is_symlink() for p in source.rglob('*')):
            errors.append(f'源技能包含软链接，需先整理为实体文件：{source}')
        elif target.is_symlink():
            if target.resolve() != source.resolve():
                errors.append(f'链接指向其他位置，保留现场：{target}')
            else:
                pending.append((source, target, True))
        elif target.exists():
            if not target.is_dir():
                errors.append(f'目标不是技能目录，保留现场：{target}')
            elif manifest(target) != manifest(source):
                pending.append((source, target, True))
        else:
            pending.append((source, target, False))
    if errors:
        raise ValueError('\n'.join(errors))
    if args.check:
        if pending:
            raise ValueError('实体副本缺失、仍为软链接或内容不同：' + ', '.join(t.name for _, t, _ in pending))
        print(f'检查通过：{len(names)} 个技能均为实体副本，内容与源一致。')
    else:
        backup = None
        for source, target, existing in pending:
            target.parent.mkdir(parents=True, exist_ok=True)
            # 先复制成功，再替换入口；避免中途复制失败损坏现有副本。
            with tempfile.TemporaryDirectory(prefix='.skills-copy-', dir=target.parent) as temp:
                staged = Path(temp) / target.name
                shutil.copytree(source, staged)
                saved = None
                if existing:
                    if backup is None:
                        backup = Path(tempfile.mkdtemp(prefix='skills-copy-backup-', dir=git_dir))
                        print(f'原内容保留在：{backup}')
                    saved = backup / target.name
                    target.rename(saved)
                try:
                    staged.rename(target)
                except OSError:
                    if saved is not None:
                        saved.rename(target)
                    raise
            print(f'已复制：{source} -> {target}')
        if not pending:
            print('无需修改：五个云效技能的实体副本与源一致。')
except (ValueError, OSError, subprocess.CalledProcessError) as exc:
    print(f'技能复制未完成：{exc}', file=sys.stderr)
    sys.exit(1)
PY
