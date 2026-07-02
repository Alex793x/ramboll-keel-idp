//! Integration + property tests for the v3 multi-repo and monolith workflows (SPEC §12).
//!
//! Hermetic: they run against the fixture blueprints under `tests/fixtures/` —
//! `services/api-python`, `services/fe-react` (mini keel/v2 service blueprints) and
//! `monolith-root/` — with `FakeProvider` (in-memory) or `LocalDirProvider` (real local git
//! repo, no network). They do NOT depend on the real `blueprints/` content, which is authored
//! by parallel agents.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use keel_core::{
    service_dirs, service_repo_names, Department, InitRequest, ProgressEvent, RepoLayout,
    ServiceKind, ServiceSelection, ServicesManifest, Status, User, WORKFLOW_STEPS,
};
use keel_engine::Engine;
use keel_github::{FakeProvider, LocalDirProvider};
use tempfile::TempDir;

const OWNER: &str = "Alex793x";

/// Absolute path to the fixtures directory (used as the blueprints search path).
fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

/// Parse `"type:lang"` selections (panicking is fine in tests).
fn selections(specs: &[&str]) -> Vec<ServiceSelection> {
    specs
        .iter()
        .map(|s| ServiceSelection::parse(s).expect("valid selection"))
        .collect()
}

fn v3_request(project: &str, layout: RepoLayout, services: Vec<ServiceSelection>) -> InitRequest {
    InitRequest {
        project_name: project.to_owned(),
        blueprint: "multi-service".to_owned(), // unused on the v3 paths
        department: Department {
            id: "energy".into(),
            name: "Energy".into(),
            team_slug: "energy".into(),
        },
        users: vec![User {
            id: "u-alex".into(),
            name: "Alex Holmberg".into(),
            email: "alex.holmberg@ramboll.com".into(),
            github_login: "Alex793x".into(),
        }],
        service_kind: ServiceKind::RestApi,
        description: "A v3 multi-service test project.".into(),
        author: "Alex Holmberg".into(),
        layout,
        services,
    }
}

/// A fresh engine whose blueprints dir is the fixtures dir and whose catalog is inside `tmp`.
fn engine_in(tmp: &TempDir) -> Engine {
    Engine::with_catalog(
        fixtures_dir(),
        OWNER.to_owned(),
        tmp.path().join(".keel").join("catalog.json"),
    )
}

/// Assert that `events` contains exactly the 8 canonical keys, in order, once each.
fn assert_canonical_order(events: &[ProgressEvent]) {
    let keys: Vec<&str> = events.iter().map(|e| e.key.as_str()).collect();
    assert_eq!(
        keys, WORKFLOW_STEPS,
        "events must be the 8 canonical keys in order"
    );
    let steps: Vec<u8> = events.iter().map(|e| e.step).collect();
    assert_eq!(steps, vec![1, 2, 3, 4, 5, 6, 7, 8]);
}

fn status_of(events: &[ProgressEvent], key: &str) -> Status {
    events
        .iter()
        .find(|e| e.key == key)
        .unwrap_or_else(|| panic!("missing event {key}"))
        .status
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-repo
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn multi_repo_creates_one_repo_per_service_with_ordinal_names() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = v3_request(
        "demo",
        RepoLayout::MultiRepo,
        selections(&["api:python", "fe:react"]),
    );

    let mut events = Vec::new();
    let outcome = engine
        .initialize(&req, &provider, &mut |e| events.push(e.clone()))
        .expect("multi-repo initialize succeeds");

    assert_canonical_order(&events);
    assert_canonical_order(&outcome.events);
    assert!(events.iter().all(|e| e.status != Status::Skipped));

    // Two repos, ordinal-rule names, selection order.
    let created = provider.created();
    assert_eq!(created.len(), 2);
    let names: Vec<&str> = created.iter().map(|r| r.name.as_str()).collect();
    assert_eq!(names, vec!["demo-api", "demo-fe"]);

    // Outcome: repos = all (selection order), repo = first, version = FIRST service's manifest.
    assert_eq!(outcome.repos.len(), 2);
    assert_eq!(outcome.repo, outcome.repos[0]);
    assert_eq!(outcome.repos[0].name, "demo-api");
    assert_eq!(outcome.repos[1].name, "demo-fe");
    assert_eq!(outcome.blueprint_version, "0.3.0"); // api-python fixture version
    assert_eq!(outcome.docs_path, "demo-api/docs");

    // Steps 4/6 aggregate across repos in their details.
    let create = events.iter().find(|e| e.key == "create_repo").unwrap();
    assert!(create.detail.contains("created 2 repo(s)"), "{create:?}");
    assert!(create.detail.contains("demo-api") && create.detail.contains("demo-fe"));
    let branches = events.iter().find(|e| e.key == "branches").unwrap();
    assert!(branches.detail.contains("2 repo(s)"), "{branches:?}");

    // Each repo got its own per-service render + the committed governance record.
    for (repo, marker) in [("demo-api", "api/python"), ("demo-fe", "fe/react")] {
        let files = provider.files_for(OWNER, repo);
        assert!(
            files.iter().any(|f| f.path == "branch-protection.json"),
            "{repo} must commit branch-protection.json"
        );
        let readme = files
            .iter()
            .find(|f| f.path == "README.md")
            .unwrap_or_else(|| panic!("{repo} README.md missing"));
        let text = String::from_utf8_lossy(&readme.contents);
        assert!(text.contains(repo), "README must use service.repo_name");
        assert!(text.contains(marker), "README must use the service ctx");
        assert!(text.contains("multi-repo"), "README must see `layout`");
    }
    // Verbatim GH expressions survive per repo.
    let ci = provider
        .files_for(OWNER, "demo-api")
        .into_iter()
        .find(|f| f.path == ".github/workflows/ci.yml")
        .expect("service CI present in multi-repo");
    assert!(String::from_utf8_lossy(&ci.contents).contains("${{ github.ref }}"));

    // Each repo has the full branch model.
    for repo in &outcome.repos {
        for b in ["main", "dev", "staging"] {
            assert!(
                repo.branches.contains(&b.to_string()),
                "{repo:?} missing {b}"
            );
        }
    }
}

#[test]
fn multi_repo_repeated_type_gets_ordinals() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = v3_request(
        "demo",
        RepoLayout::MultiRepo,
        selections(&["api:python", "fe:react", "api:python"]),
    );

    let outcome = engine.initialize(&req, &provider, &mut |_| {}).unwrap();
    let names: Vec<&str> = outcome.repos.iter().map(|r| r.name.as_str()).collect();
    assert_eq!(names, vec!["demo-api-1", "demo-fe", "demo-api-2"]);
}

#[test]
fn multi_repo_rerun_is_idempotent() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = v3_request(
        "demo",
        RepoLayout::MultiRepo,
        selections(&["api:python", "fe:react"]),
    );

    let first = engine.initialize(&req, &provider, &mut |_| {}).unwrap();
    let mut second_events = Vec::new();
    let second = engine
        .initialize(&req, &provider, &mut |e| second_events.push(e.clone()))
        .unwrap();

    assert_canonical_order(&second_events);
    // Still exactly one repo per service (one commit-equivalent each: file sets unchanged).
    assert_eq!(provider.created().len(), 2);
    assert_eq!(status_of(&second_events, "create_repo"), Status::Skipped);
    assert_eq!(status_of(&second_events, "commit"), Status::Skipped);
    assert_eq!(status_of(&second_events, "register"), Status::Done);
    assert_eq!(status_of(&first.events, "create_repo"), Status::Done);
    let skip = second_events
        .iter()
        .find(|e| e.key == "create_repo")
        .unwrap();
    assert!(
        skip.detail.contains("all 2 repo(s) already exist"),
        "{skip:?}"
    );

    // One catalog row per PROJECT, replaced not duplicated.
    let projects = engine.list_projects().unwrap();
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0], second);
    assert_eq!(first.catalog_id, second.catalog_id);
    assert_eq!(second.repos.len(), 2);
    assert_eq!(second.repo, second.repos[0]);
}

#[test]
fn multi_repo_missing_combo_lists_available_blueprints() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = v3_request("demo", RepoLayout::MultiRepo, selections(&["wk:go"]));

    let err = engine
        .initialize(&req, &provider, &mut |_| {})
        .expect_err("unknown combo must fail validation");
    let msg = err.to_string();
    assert!(
        msg.contains("validation"),
        "must be a Validation error: {msg}"
    );
    assert!(msg.contains("wk:go"), "must name the missing combo: {msg}");
    assert!(
        msg.contains("api-python") && msg.contains("fe-react"),
        "must list available combos: {msg}"
    );
    // Nothing was created.
    assert!(provider.created().is_empty());
}

// ─────────────────────────────────────────────────────────────────────────────
// Monolith
// ─────────────────────────────────────────────────────────────────────────────

/// Recursively collect all file paths under `dir`, relative to `dir`, forward-slashed.
fn walk_files(dir: &Path) -> Vec<String> {
    fn inner(root: &Path, dir: &Path, acc: &mut Vec<String>) {
        for entry in std::fs::read_dir(dir).expect("readable dir") {
            let entry = entry.expect("dir entry");
            let path = entry.path();
            if path.is_dir() {
                inner(root, &path, acc);
            } else {
                let rel = path.strip_prefix(root).expect("under root");
                acc.push(
                    rel.components()
                        .map(|c| c.as_os_str().to_string_lossy().into_owned())
                        .collect::<Vec<_>>()
                        .join("/"),
                );
            }
        }
    }
    let mut acc = Vec::new();
    inner(dir, dir, &mut acc);
    acc.sort();
    acc
}

#[test]
fn monolith_local_dir_materializes_composed_tree() {
    let tmp = TempDir::new().unwrap();
    let repos_root = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = LocalDirProvider::new(repos_root.path().to_path_buf());
    let sels = selections(&["api:python", "fe:react"]);
    let req = v3_request("monodemo", RepoLayout::Monolith, sels.clone());

    let mut events = Vec::new();
    let outcome = engine
        .initialize(&req, &provider, &mut |e| events.push(e.clone()))
        .expect("monolith initialize succeeds");

    assert_canonical_order(&events);
    assert_eq!(outcome.repos.len(), 1);
    assert_eq!(outcome.repo, outcome.repos[0]);
    assert_eq!(outcome.repo.name, "monodemo");
    assert_eq!(outcome.blueprint_version, "0.9.0"); // monolith-root fixture version
    assert!(outcome.repo.html_url.starts_with("file://"));

    let repo_dir = repos_root.path().join("monodemo");
    assert!(repo_dir.is_dir(), "repo dir must exist on disk");

    // Root files from the monolith-root fixture are present at the repo root.
    assert!(repo_dir.join("README.md").is_file());
    assert!(repo_dir.join("CODEOWNERS").is_file());
    assert!(repo_dir.join("docs/index.md").is_file());
    assert!(repo_dir.join("branch-protection.json").is_file());
    let root_ci =
        std::fs::read_to_string(repo_dir.join(".github/workflows/ci.yml")).expect("root CI");
    assert!(root_ci.contains("${{ github.sha }}"), "verbatim GH expr");

    // The root README rendered against the populated `services` array.
    let root_readme = std::fs::read_to_string(repo_dir.join("README.md")).unwrap();
    assert!(root_readme.contains("monodemo"));
    assert!(root_readme.contains("services/api"));
    assert!(root_readme.contains("services/fe"));

    // Per-service trees under services/{dir}/ with per-service contexts.
    let api_readme =
        std::fs::read_to_string(repo_dir.join("services/api/README.md")).expect("api README");
    assert!(api_readme.contains("monodemo-api"));
    assert!(api_readme.contains("monolith"));
    assert!(repo_dir.join("services/api/src/monodemo/main.py").is_file());
    assert!(repo_dir.join("services/fe/README.md").is_file());
    assert!(repo_dir.join("services/fe/package.json").is_file());

    // keel.services.json parses back to a ServicesManifest whose dirs match service_dirs.
    let manifest_json = std::fs::read(repo_dir.join("keel.services.json")).expect("manifest");
    let parsed: ServicesManifest = serde_json::from_slice(&manifest_json).expect("valid JSON");
    assert_eq!(parsed.project, "monodemo");
    assert_eq!(parsed.version, 1);
    let dirs: Vec<&str> = parsed.services.iter().map(|s| s.dir.as_str()).collect();
    assert_eq!(dirs, service_dirs(&sels).expect("valid selections"));

    // NO root-owned files anywhere under services/*.
    let service_files = walk_files(&repo_dir.join("services"));
    for path in &service_files {
        assert!(
            !path.contains(".github/"),
            "no .github under services/: {path}"
        );
        assert!(
            !path.contains(".claude/"),
            "no .claude under services/: {path}"
        );
        for stripped in ["LICENSE", "SECURITY.md", "CODEOWNERS", "CONTRIBUTING.md"] {
            assert!(
                *path != format!("api/{stripped}") && *path != format!("fe/{stripped}"),
                "root-owned {stripped} must be dropped from services/: {path}"
            );
        }
    }

    // Exactly one commit and the full branch model (real local git repo).
    let git = |args: &[&str]| {
        let out = std::process::Command::new("git")
            .args(args)
            .current_dir(&repo_dir)
            .output()
            .expect("git runs");
        String::from_utf8_lossy(&out.stdout).into_owned()
    };
    let log = git(&["log", "--oneline"]);
    assert_eq!(
        log.lines().filter(|l| !l.trim().is_empty()).count(),
        1,
        "exactly one clean commit: {log:?}"
    );
    let branches = git(&["branch", "--format=%(refname:short)"]);
    for b in ["main", "dev", "staging"] {
        assert!(branches.contains(b), "missing branch {b}: {branches:?}");
    }
}

#[test]
fn monolith_rerun_is_idempotent() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = v3_request(
        "monodemo",
        RepoLayout::Monolith,
        selections(&["api:python", "fe:react"]),
    );

    engine.initialize(&req, &provider, &mut |_| {}).unwrap();
    let mut second = Vec::new();
    engine
        .initialize(&req, &provider, &mut |e| second.push(e.clone()))
        .unwrap();

    assert_canonical_order(&second);
    assert_eq!(provider.created().len(), 1, "still ONE monolith repo");
    assert_eq!(status_of(&second, "create_repo"), Status::Skipped);
    assert_eq!(status_of(&second, "commit"), Status::Skipped);
    assert_eq!(engine.list_projects().unwrap().len(), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Properties
// ─────────────────────────────────────────────────────────────────────────────

/// Selections restricted to the two fixture blueprints so every combo resolves.
fn arb_selection() -> impl proptest::strategy::Strategy<Value = ServiceSelection> {
    use proptest::prelude::*;
    prop_oneof![
        Just(ServiceSelection::parse("api:python").expect("valid")),
        Just(ServiceSelection::parse("fe:react").expect("valid")),
    ]
}

proptest::proptest! {
    /// For arbitrary service vecs (1..8), the event keys are always exactly WORKFLOW_STEPS in
    /// order for BOTH layouts, and multi-repo creates exactly the ordinal-rule repo names.
    #[test]
    fn events_always_canonical_for_both_layouts(
        services in proptest::collection::vec(arb_selection(), 1..8),
        name in "[a-z][a-z0-9-]{2,20}",
    ) {
        for layout in [RepoLayout::MultiRepo, RepoLayout::Monolith] {
            let tmp = TempDir::new().unwrap();
            let engine = engine_in(&tmp);
            let provider = FakeProvider::new();
            let req = v3_request(&name, layout, services.clone());

            let mut events = Vec::new();
            let outcome = engine
                .initialize(&req, &provider, &mut |e| events.push(e.clone()))
                .expect("initialize succeeds");

            let keys: Vec<&str> = events.iter().map(|e| e.key.as_str()).collect();
            proptest::prop_assert_eq!(keys, WORKFLOW_STEPS.to_vec());

            match layout {
                RepoLayout::MultiRepo => {
                    let created: Vec<String> =
                        provider.created().iter().map(|r| r.name.clone()).collect();
                    proptest::prop_assert_eq!(
                        created,
                        service_repo_names(&name, &services).expect("valid selections")
                    );
                    proptest::prop_assert_eq!(outcome.repos.len(), services.len());
                    proptest::prop_assert_eq!(&outcome.repo, &outcome.repos[0]);
                }
                RepoLayout::Monolith => {
                    proptest::prop_assert_eq!(provider.created().len(), 1);
                    proptest::prop_assert_eq!(outcome.repos.len(), 1);
                }
            }
        }
    }

    /// The monolith file set never contains a root-owned file under services/, and every
    /// service-rendered path is prefixed by one of the ordinal-rule service dirs.
    #[test]
    fn monolith_composition_respects_strip_and_prefix_rules(
        services in proptest::collection::vec(arb_selection(), 1..8),
        name in "[a-z][a-z0-9-]{2,20}",
    ) {
        let tmp = TempDir::new().unwrap();
        let engine = engine_in(&tmp);
        let provider = FakeProvider::new();
        let req = v3_request(&name, RepoLayout::Monolith, services.clone());
        engine.initialize(&req, &provider, &mut |_| {}).expect("initialize succeeds");

        let files = provider.files_for(OWNER, &name);
        proptest::prop_assert!(!files.is_empty());

        let dirs: BTreeSet<String> =
            service_dirs(&services).expect("valid selections").into_iter().collect();
        let mut seen_dirs: BTreeSet<String> = BTreeSet::new();

        for f in &files {
            let path = &f.path;
            if let Some(rest) = path.strip_prefix("services/") {
                // Never a stripped (root-owned) filename under services/.
                for stripped in ["LICENSE", "SECURITY.md", "CODEOWNERS", "CONTRIBUTING.md"] {
                    proptest::prop_assert!(
                        !path.ends_with(&format!("/{stripped}")),
                        "root-owned {} leaked into {}", stripped, path
                    );
                }
                proptest::prop_assert!(
                    !rest.contains(".github/") && !rest.contains(".claude/"),
                    "root-owned tree leaked into {}", path
                );
                // Prefixed by exactly one of the ordinal-rule service dirs.
                let Some((dir, _)) = rest.split_once('/') else {
                    proptest::prop_assert!(false, "no dir prefix in {}", path);
                    continue;
                };
                proptest::prop_assert!(
                    dirs.contains(dir),
                    "path {} not under a known service dir {:?}", path, dirs
                );
                seen_dirs.insert(dir.to_owned());
            }
        }
        // Every service materialized at least one file under its dir.
        proptest::prop_assert_eq!(seen_dirs, dirs);
        // The engine-serialized manifest is always present and structurally valid.
        let manifest = files.iter().find(|f| f.path == "keel.services.json");
        proptest::prop_assert!(manifest.is_some());
        if let Some(m) = manifest {
            let parsed: ServicesManifest =
                serde_json::from_slice(&m.contents).expect("manifest parses");
            proptest::prop_assert_eq!(parsed.services.len(), services.len());
        }
    }
}
