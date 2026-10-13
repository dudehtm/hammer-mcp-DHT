"""Disposable name index. TypeScript owns persistence; Python only reads and proposes it.

Directory mtimes invalidate additions/removals, including nested loose content. Details
are always read live. Archive metadata and mount order also participate in the key.
Unknown filesystem types disable caching instead of assuming they never change.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

VERSION = 1


def signature(fsys: Any, game_dir: str) -> str | None:
    from srctools.filesys import RawFileSystem, VPKFileSystem

    records: list[Any] = []

    def metadata(path: str) -> None:
        try:
            stat = os.stat(path)
            records.append((os.path.realpath(path), stat.st_mtime_ns, stat.st_size))
        except FileNotFoundError:
            records.append((os.path.realpath(path), None, None))

    def failed(error: OSError) -> None:
        raise error

    try:
        metadata(os.path.join(game_dir, 'gameinfo.txt'))
        for system, prefix in fsys.systems:
            records.append((type(system).__name__, os.path.realpath(system.path), prefix))
            metadata(system.path)
            if isinstance(system, RawFileSystem):
                for folder in ('materials', 'models'):
                    root = os.path.join(system.path, prefix, folder)
                    metadata(root)
                    if not os.path.isdir(root):
                        continue
                    for directory, children, _files in os.walk(root, onerror=failed):
                        children.sort()
                        metadata(directory)
            elif isinstance(system, VPKFileSystem):
                archive = Path(system.path)
                stem = archive.stem.removesuffix('_dir')
                for part in sorted(archive.parent.glob(stem + '_*.vpk')):
                    metadata(str(part))
            else:
                return None
    except OSError:
        return None
    return hashlib.sha256(json.dumps(records, ensure_ascii=True).encode()).hexdigest()


def read_index(path: str | None, identity: dict[str, Any]) -> list[str] | None:
    if not path:
        return None
    try:
        with open(path, encoding='utf8') as stream:
            cached = json.load(stream)
        if any(cached.get(key) != value for key, value in identity.items()):
            return None
        paths = cached['paths']
        if not isinstance(paths, list) or any(not isinstance(item, str) for item in paths):
            return None
        if paths != sorted(set(paths)):
            return None
        if any(not ((p.lower().startswith('materials/') and p.lower().endswith('.vmt')) or
                    (p.lower().startswith('models/') and p.lower().endswith('.mdl'))) for p in paths):
            return None
        return paths
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
