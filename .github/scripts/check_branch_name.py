#!/usr/bin/env python3
"""Branch-name governance check for the Ramboll Developer Platform (Keel).

Implements the single branch-naming rule shared by the reusable ``validate``
workflow and any agent following the ``git-ci-governance`` skill (SPEC §8 #3):

* Working branches MUST be named exactly ``feature/<...>``, ``bug/<...>`` or
  ``hotfix/<...>`` (a non-empty descriptor must follow the prefix).
* The protected long-lived branches ``main`` / ``dev`` / ``staging`` are always
  allowed (CI may run on them directly, e.g. on push).

The module is pure and typed so it is unit-testable. The CLI reads a branch name
from ``argv[1]`` or, failing that, the ``GITHUB_HEAD_REF`` environment variable
(set by GitHub on ``pull_request`` events), and exits non-zero with a helpful
message on a violation.
"""

from __future__ import annotations

import os
import re
import sys

#: Short-lived working branches must start with one of these prefixes.
ALLOWED_PREFIXES: tuple[str, ...] = ("feature/", "bug/", "hotfix/")

#: Long-lived protected branches that are always valid.
PROTECTED_BRANCHES: frozenset[str] = frozenset({"main", "dev", "staging"})

#: A working branch is ``<prefix>/<non-empty descriptor>``.
_WORKING_BRANCH_RE = re.compile(r"^(feature|bug|hotfix)/.+$")


def is_valid_branch_name(branch: str) -> bool:
    """Return ``True`` iff *branch* satisfies the Keel branch-naming policy.

    A branch is valid when it is a protected branch (``main``/``dev``/``staging``)
    or a working branch matching ``^(feature|bug|hotfix)/.+$``.
    """
    if branch in PROTECTED_BRANCHES:
        return True
    return _WORKING_BRANCH_RE.match(branch) is not None


def violation_message(branch: str) -> str:
    """Return a human-readable explanation of why *branch* is rejected."""
    prefixes = ", ".join(ALLOWED_PREFIXES)
    protected = ", ".join(sorted(PROTECTED_BRANCHES))
    return (
        f"Branch name {branch!r} violates the Keel git governance policy.\n"
        f"  Working branches must be named: {prefixes}<ticket>-<slug> "
        f"(e.g. feature/ABC-123-add-widget).\n"
        f"  Protected branches allowed as-is: {protected}.\n"
        f"  Rename your branch to conform before opening a pull request."
    )


def resolve_branch_name(argv: list[str], env: dict[str, str]) -> str | None:
    """Resolve the branch name from CLI args or the environment.

    Prefers ``argv[1]``; falls back to ``GITHUB_HEAD_REF``. Returns ``None`` when
    no branch name can be determined.
    """
    if len(argv) > 1 and argv[1].strip():
        return argv[1].strip()
    head_ref = env.get("GITHUB_HEAD_REF", "").strip()
    return head_ref or None


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns a process exit code (0 = ok, non-zero = error)."""
    argv = list(sys.argv if argv is None else argv)
    branch = resolve_branch_name(argv, dict(os.environ))

    if branch is None:
        print(
            "No branch name supplied. Pass one as an argument or set "
            "GITHUB_HEAD_REF.",
            file=sys.stderr,
        )
        return 2

    if is_valid_branch_name(branch):
        print(f"Branch name {branch!r} is valid.")
        return 0

    print(violation_message(branch), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
