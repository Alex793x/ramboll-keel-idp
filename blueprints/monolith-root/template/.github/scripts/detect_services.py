#!/usr/bin/env python3
"""Change-aware service detection for the monolith CI.

Pure resolver: ``(keel.services.json manifest, changed paths) -> affected
services``. Rules, applied in order (prefix semantics throughout):

1. Empty/unreadable diff        => ALL services (safe fallback, reason "fallback").
2. Any path under a shared path => ALL services (reason "shared:<path>").
3. ``services/<dir>/...``       => that service is affected.
4. ``depends_on`` closure       => dependents of affected services are affected too.
5. Anything else (root docs...) => no service (the root gate job still runs).

The CLI is a TOTAL function: on any internal error it prints the all-services
result (reason "error-fallback") and exits 0 so the pipeline degrades to a
full rebuild instead of breaking. Output order is deterministic — services
appear in manifest order. Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SERVICES_ROOT = "services/"

Manifest = dict[str, Any]
Result = dict[str, Any]


def _entries(manifest: Manifest) -> list[dict[str, Any]]:
    """Return the manifest's service entries as a list of dicts, in order."""
    services = manifest.get("services") or []
    return [entry for entry in services if isinstance(entry, dict)]


def _service_output(entry: dict[str, Any]) -> dict[str, str]:
    """Project a manifest entry onto the stable ``{dir,type,lang,name}`` shape."""
    return {
        "dir": str(entry.get("dir", "")),
        "type": str(entry.get("type", entry.get("service_type", ""))),
        "lang": str(entry.get("lang", entry.get("language", ""))),
        "name": str(entry.get("name", "")),
    }


def _all_services(manifest: Manifest, reason: str) -> Result:
    """Build the 'rebuild everything' result — used by rules (1), (2) and errors."""
    return {
        "all": True,
        "reason": reason,
        "services": [_service_output(entry) for entry in _entries(manifest)],
    }


def _shared_hit(shared_paths: list[str], paths: list[str]) -> str | None:
    """Return the smallest changed path under a shared prefix, if any (rule 2).

    ``min`` (not "first seen") keeps the reported reason independent of the
    input order — the resolver is deterministic in ALL output fields.
    """
    hits = [
        path
        for path in paths
        if any(prefix and path.startswith(prefix) for prefix in shared_paths)
    ]
    return min(hits) if hits else None


def _directly_affected(dirs: list[str], paths: list[str]) -> set[str]:
    """Service dirs hit by a ``services/<dir>/...`` prefix match (rule 3)."""
    hit: set[str] = set()
    for path in paths:
        for directory in dirs:
            if directory and path.startswith(f"{SERVICES_ROOT}{directory}/"):
                hit.add(directory)
    return hit


def dependency_closure(affected_dirs: set[str], entries: list[dict[str, Any]]) -> set[str]:
    """Close ``affected_dirs`` over reverse dependencies (rule 4).

    If B ``depends_on`` A and A is affected, B is affected — transitively,
    until a fixed point is reached. Pure and deterministic.
    """
    closed = set(affected_dirs)
    grew = True
    while grew:
        grew = False
        for entry in entries:
            directory = str(entry.get("dir", ""))
            depends_on = entry.get("depends_on") or []
            if directory in closed or not isinstance(depends_on, list):
                continue
            if any(str(dep) in closed for dep in depends_on):
                closed.add(directory)
                grew = True
    return closed


def affected(manifest: Manifest, changed: list[str] | None) -> Result:
    """Pure core: resolve the changed paths to the affected services.

    Deterministic: output services are listed in manifest order regardless of
    the order (or duplication) of the input paths.
    """
    paths = [p.strip() for p in (changed or []) if p and p.strip()]
    if not paths:
        return _all_services(manifest, "fallback")

    shared_paths = [str(s) for s in (manifest.get("shared_paths") or [])]
    shared = _shared_hit(shared_paths, paths)
    if shared is not None:
        return _all_services(manifest, f"shared:{shared}")

    entries = _entries(manifest)
    dirs = [str(entry.get("dir", "")) for entry in entries]
    closed = dependency_closure(_directly_affected(dirs, paths), entries)
    return {
        "all": False,
        "reason": "selective",
        "services": [_service_output(e) for e in entries if str(e.get("dir", "")) in closed],
    }


def _read_changed(source: str) -> list[str]:
    """Read newline-separated changed paths from a file, or stdin when ``-``."""
    if source == "-":
        return sys.stdin.read().splitlines()
    return Path(source).read_text(encoding="utf-8").splitlines()


def _write_github_output(output_path: str, result: Result) -> None:
    """Append ``services=<compact json>`` and ``any=<bool>`` for the workflow."""
    services_json = json.dumps(result["services"], separators=(",", ":"))
    any_flag = "true" if result["services"] else "false"
    with open(output_path, "a", encoding="utf-8") as handle:
        handle.write(f"services={services_json}\n")
        handle.write(f"any={any_flag}\n")


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint. Total: any internal error degrades to a full rebuild."""
    parser = argparse.ArgumentParser(description="Resolve changed paths to affected services.")
    parser.add_argument("--manifest", required=True, help="Path to keel.services.json.")
    parser.add_argument("--changed", required=True, help="Newline-separated paths file, or '-'.")
    parser.add_argument("--github-output", default=None, help="Path to $GITHUB_OUTPUT.")
    args = parser.parse_args(argv)

    manifest: Manifest = {}
    try:
        loaded = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            raise TypeError("manifest root must be a JSON object")
        manifest = loaded
        result = affected(manifest, _read_changed(args.changed))
    except Exception as error:  # noqa: BLE001 — totality is the contract here.
        print(f"detect_services: {error}; falling back to ALL services", file=sys.stderr)
        result = _all_services(manifest, "error-fallback")

    print(json.dumps(result, indent=2))
    if args.github_output:
        _write_github_output(args.github_output, result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
