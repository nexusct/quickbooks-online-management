"""Immutable snapshot registry with mutation detection.

Snapshots are the only thing that catches a source record altered after we
looked. Rules:
- A snapshot file is NEVER overwritten. Registering the same label with
  identical content is a no-op; identical label with different content
  stores a new copy and records a MUTATION event.
- The manifest is append-only JSONL. snapshots/ is gitignored and blocked
  by the pre-commit hook.
"""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone

from .util import sha256_file

DEFAULT_DIR = "snapshots"
MANIFEST = "manifest.jsonl"


class SnapshotError(RuntimeError):
    pass


def _manifest_path(snap_dir: str) -> str:
    return os.path.join(snap_dir, MANIFEST)


def read_manifest(snap_dir: str = DEFAULT_DIR) -> list[dict]:
    path = _manifest_path(snap_dir)
    if not os.path.exists(path):
        return []
    entries = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries


def register(src_path: str, label: str, snap_dir: str = DEFAULT_DIR) -> dict:
    """Copy src_path into the snapshot store under `label`.

    Returns the manifest entry. entry["mutation_of"] is set when this label
    was seen before with a DIFFERENT hash — that is the mutation signal.
    """
    if not os.path.isfile(src_path):
        raise SnapshotError(f"no such file: {src_path}")
    os.makedirs(snap_dir, exist_ok=True)
    digest = sha256_file(src_path)
    prior = [e for e in read_manifest(snap_dir) if e["label"] == label]
    if prior and prior[-1]["sha256"] == digest:
        return prior[-1]  # identical content already preserved

    dest = os.path.join(snap_dir, f"{digest[:16]}_{os.path.basename(src_path)}")
    if os.path.exists(dest):
        if sha256_file(dest) != digest:
            raise SnapshotError(
                f"refusing to overwrite existing snapshot {dest}: "
                "snapshots are immutable"
            )
    else:
        shutil.copy2(src_path, dest)

    entry = {
        "label": label,
        "sha256": digest,
        "stored_as": dest,
        "source_path": os.path.abspath(src_path),
        "registered_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mutation_of": prior[-1]["sha256"] if prior else None,
    }
    with open(_manifest_path(snap_dir), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, sort_keys=True) + "\n")
    return entry


def mutations(snap_dir: str = DEFAULT_DIR) -> list[dict]:
    """All manifest entries that superseded a prior hash for the same label.

    Each one means: the same logical export changed content between two
    registrations. That is an exception requiring investigation (it may be
    a legitimate re-export with a wider date range — corroborate first).
    """
    return [e for e in read_manifest(snap_dir) if e.get("mutation_of")]


def verify(snap_dir: str = DEFAULT_DIR) -> list[str]:
    """Check every stored snapshot still matches its recorded hash."""
    problems = []
    for e in read_manifest(snap_dir):
        if not os.path.exists(e["stored_as"]):
            problems.append(f"missing snapshot file: {e['stored_as']}")
        elif sha256_file(e["stored_as"]) != e["sha256"]:
            problems.append(f"snapshot content altered on disk: {e['stored_as']}")
    return problems
