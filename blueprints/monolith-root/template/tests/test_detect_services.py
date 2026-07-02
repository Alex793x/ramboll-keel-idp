"""Property + example tests for the selective-CI resolver.

The generated monolith tests its OWN pipeline logic — the ``gate`` CI job runs
this suite on every push, so the repo is green from birth and the resolver is
proven, not assumed. Properties covered (SPEC §15):

- fallback:      empty/None diff  => ALL services.
- shared => all: any shared-path change rebuilds everything.
- isolation:     paths only under service X => exactly closure(X).
- closure:       idempotent, transitive, and a superset of its seed.
- monotonicity:  more changes never rebuild fewer services (non-empty diffs).
- determinism:   input order/duplication never changes the output.
- totality:      arbitrary junk paths never raise.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from hypothesis import example, given
from hypothesis import strategies as st

_SCRIPT = Path(__file__).resolve().parents[1] / ".github" / "scripts" / "detect_services.py"
_spec = importlib.util.spec_from_file_location("detect_services", _SCRIPT)
assert _spec is not None and _spec.loader is not None
detect_services = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(detect_services)

affected = detect_services.affected
dependency_closure = detect_services.dependency_closure

SHARED_PATHS = [".github/", "keel.services.json", "libs/"]
_LANGS = ["python", "node", "react", "go", "dotnet", "terraform"]
_TYPES = ["fe", "api", "wk", "dp", "inf"]
_SAFE_SEGMENT = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789_.-", min_size=1, max_size=12
)


@st.composite
def manifests(draw: st.DrawFn) -> dict[str, Any]:
    """A valid manifest with 2–8 services and a random DAG of depends_on edges."""
    count = draw(st.integers(min_value=2, max_value=8))
    dirs = [f"svc{i}" for i in range(count)]
    services = []
    for i, directory in enumerate(dirs):
        depends_on = draw(
            st.lists(st.sampled_from(dirs[:i]), unique=True, max_size=min(i, 3))
        ) if i else []
        services.append(
            {
                "dir": directory,
                "type": draw(st.sampled_from(_TYPES)),
                "lang": draw(st.sampled_from(_LANGS)),
                "name": f"Service {directory}",
                "depends_on": depends_on,
            }
        )
    return {
        "version": 1,
        "project": "demo",
        "shared_paths": list(SHARED_PATHS),
        "services": services,
    }


def _dirs(result: dict[str, Any]) -> list[str]:
    return [service["dir"] for service in result["services"]]


def _service_path(draw: st.DrawFn, manifest: dict[str, Any]) -> str:
    directory = draw(st.sampled_from([s["dir"] for s in manifest["services"]]))
    return f"services/{directory}/{draw(_SAFE_SEGMENT)}"


@st.composite
def manifest_and_changed(draw: st.DrawFn) -> tuple[dict[str, Any], list[str]]:
    """A manifest plus a non-empty mixed diff (service, root, shared paths)."""
    manifest = draw(manifests())
    kinds: list[str] = draw(
        st.lists(st.sampled_from(["service", "root", "shared"]), min_size=1, max_size=8)
    )
    changed = []
    for kind in kinds:
        if kind == "service":
            changed.append(_service_path(draw, manifest))
        elif kind == "shared":
            changed.append(draw(st.sampled_from(SHARED_PATHS)) + draw(_SAFE_SEGMENT))
        else:
            changed.append(draw(_SAFE_SEGMENT))
    return manifest, changed


@given(manifests())
def test_fallback_empty_or_none_diff_selects_all(manifest: dict[str, Any]) -> None:
    for changed in (None, [], ["   ", ""]):
        result = affected(manifest, changed)
        assert result["all"] is True
        assert result["reason"] == "fallback"
        assert _dirs(result) == [s["dir"] for s in manifest["services"]]


@given(manifest_and_changed(), st.sampled_from(SHARED_PATHS))
def test_shared_path_change_selects_all(
    pair: tuple[dict[str, Any], list[str]], shared: str
) -> None:
    manifest, changed = pair
    result = affected(manifest, [*changed, shared + "anything"])
    assert result["all"] is True
    assert result["reason"].startswith("shared:")
    assert _dirs(result) == [s["dir"] for s in manifest["services"]]


@given(manifests(), st.data())
def test_isolation_paths_under_one_service_yield_exactly_its_closure(
    manifest: dict[str, Any], data: st.DataObject
) -> None:
    target = data.draw(st.sampled_from([s["dir"] for s in manifest["services"]]))
    suffixes = data.draw(st.lists(_SAFE_SEGMENT, min_size=1, max_size=5))
    changed = [f"services/{target}/{suffix}" for suffix in suffixes]
    result = affected(manifest, changed)
    expected = dependency_closure({target}, manifest["services"])
    assert result["all"] is False
    assert set(_dirs(result)) == expected


@given(manifests(), st.data())
def test_closure_is_idempotent_transitive_and_inflationary(
    manifest: dict[str, Any], data: st.DataObject
) -> None:
    entries = manifest["services"]
    dirs = [s["dir"] for s in entries]
    seed = set(data.draw(st.lists(st.sampled_from(dirs), max_size=len(dirs))))
    closed = dependency_closure(seed, entries)
    assert seed <= closed  # inflationary
    assert dependency_closure(closed, entries) == closed  # idempotent
    for entry in entries:  # transitive: any dependent of a closed dir is closed
        if any(dep in closed for dep in entry["depends_on"]):
            assert entry["dir"] in closed


@given(manifest_and_changed(), st.data())
def test_monotonicity_more_changes_never_shrink_the_selection(
    pair: tuple[dict[str, Any], list[str]], data: st.DataObject
) -> None:
    manifest, larger = pair
    subset_mask = data.draw(
        st.lists(st.booleans(), min_size=len(larger), max_size=len(larger))
    )
    smaller = [p for p, keep in zip(larger, subset_mask) if keep]
    if not smaller:  # empty diff means "unknown diff" (fallback), not "no changes"
        smaller = [larger[0]]
    assert set(_dirs(affected(manifest, smaller))) <= set(_dirs(affected(manifest, larger)))


@given(manifest_and_changed(), st.randoms(use_true_random=False))
def test_determinism_shuffled_and_duplicated_input_same_output(
    pair: tuple[dict[str, Any], list[str]], rng: Any
) -> None:
    manifest, changed = pair
    shuffled = list(changed) + [changed[0]]
    rng.shuffle(shuffled)
    assert affected(manifest, shuffled) == affected(manifest, changed)


@given(manifests(), st.lists(st.text(max_size=40), max_size=12))
@example({"version": 1, "project": "x", "shared_paths": [], "services": []}, ["services/"])
def test_totality_arbitrary_junk_paths_never_raise(
    manifest: dict[str, Any], junk: list[str]
) -> None:
    result = affected(manifest, junk)
    assert set(result) == {"all", "reason", "services"}
    assert isinstance(result["services"], list)


# --- Example-based tests -----------------------------------------------------

_EXAMPLE_MANIFEST: dict[str, Any] = {
    "version": 1,
    "project": "demo",
    "shared_paths": list(SHARED_PATHS),
    "services": [
        {"dir": "api", "type": "api", "lang": "python", "name": "Backend API", "depends_on": []},
        {"dir": "fe", "type": "fe", "lang": "react", "name": "Frontend", "depends_on": ["api"]},
        {"dir": "wk", "type": "wk", "lang": "python", "name": "Worker", "depends_on": []},
        {"dir": "api-2", "type": "api", "lang": "go", "name": "Edge API", "depends_on": []},
    ],
}


def test_root_readme_change_affects_no_services() -> None:
    result = affected(_EXAMPLE_MANIFEST, ["README.md", "docs/ci.md"])
    assert result == {"all": False, "reason": "selective", "services": []}


def test_service_change_pulls_in_transitive_dependents() -> None:
    result = affected(_EXAMPLE_MANIFEST, ["services/api/src/app.py"])
    assert _dirs(result) == ["api", "fe"]  # fe depends_on api; manifest order kept


def test_shared_workflow_change_rebuilds_everything() -> None:
    result = affected(_EXAMPLE_MANIFEST, [".github/workflows/ci.yml"])
    assert result["all"] is True and _dirs(result) == ["api", "fe", "wk", "api-2"]


def test_dir_prefix_collision_does_not_leak() -> None:
    result = affected(_EXAMPLE_MANIFEST, ["services/api-2/main.go"])
    assert _dirs(result) == ["api-2"]  # "api" must NOT match the "api-2" prefix


def test_cli_round_trip_writes_github_output_file(tmp_path: Path) -> None:
    manifest_file = tmp_path / "keel.services.json"
    manifest_file.write_text(json.dumps(_EXAMPLE_MANIFEST), encoding="utf-8")
    changed_file = tmp_path / "changed.txt"
    changed_file.write_text("services/wk/tasks.py\n", encoding="utf-8")
    output_file = tmp_path / "github_output.txt"
    completed = subprocess.run(
        [
            sys.executable,
            str(_SCRIPT),
            "--manifest",
            str(manifest_file),
            "--changed",
            str(changed_file),
            "--github-output",
            str(output_file),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    stdout = json.loads(completed.stdout)
    assert _dirs(stdout) == ["wk"]
    lines = output_file.read_text(encoding="utf-8").splitlines()
    assert lines[1] == "any=true"
    assert json.loads(lines[0].removeprefix("services="))[0]["dir"] == "wk"


def test_cli_malformed_manifest_falls_back_to_all_and_exits_zero(tmp_path: Path) -> None:
    manifest_file = tmp_path / "keel.services.json"
    manifest_file.write_text("{not json", encoding="utf-8")
    changed_file = tmp_path / "changed.txt"
    changed_file.write_text("services/api/x.py\n", encoding="utf-8")
    completed = subprocess.run(
        [sys.executable, str(_SCRIPT), "--manifest", str(manifest_file), "--changed", str(changed_file)],
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0
    assert json.loads(completed.stdout)["reason"] == "error-fallback"
