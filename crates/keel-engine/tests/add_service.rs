//! Integration + property tests for the v5 add-service workflow (SPEC §19.3).
//!
//! Hermetic: fixture blueprints under `tests/fixtures/` + `FakeProvider` (in-memory) — no
//! network, no dependence on the real `blueprints/` content.

use std::path::PathBuf;

use keel_core::{
    resolve_service_names, Department, InitRequest, KeelError, ProgressEvent, RepoLayout,
    ServiceKind, ServiceSelection, ServicesManifest, Status, User,
};
use keel_engine::{AddServiceSpec, Engine};
use keel_github::FakeProvider;
use tempfile::TempDir;

const OWNER: &str = "Alex793x";

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

fn selections(specs: &[&str]) -> Vec<ServiceSelection> {
    specs
        .iter()
        .map(|s| ServiceSelection::parse(s).expect("valid selection"))
        .collect()
}

fn request(project: &str, layout: RepoLayout, services: Vec<ServiceSelection>) -> InitRequest {
    InitRequest {
        project_name: project.to_owned(),
        blueprint: "multi-service".to_owned(),
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
        description: "A v5 add-service test project.".into(),
        author: "Alex Holmberg".into(),
        layout,
        services,
    }
}

fn engine_in(tmp: &TempDir) -> Engine {
    Engine::with_catalog(
        fixtures_dir(),
        OWNER.to_owned(),
        tmp.path().join(".keel").join("catalog.json"),
    )
}

/// Assert the four add-service events: `form, render, {step3}, register` in order.
fn assert_add_events(events: &[ProgressEvent], step3: &str) {
    let keys: Vec<&str> = events.iter().map(|e| e.key.as_str()).collect();
    assert_eq!(keys, vec!["form", "render", step3, "register"]);
    let steps: Vec<u8> = events.iter().map(|e| e.step).collect();
    assert_eq!(steps, vec![1, 2, 3, 4]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-repo
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn multi_add_creates_exactly_one_new_repo_named_right() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    // Initialize a real multi-repo project first (api:python).
    let init_req = request("demo", RepoLayout::MultiRepo, selections(&["api:python"]));
    engine
        .initialize(&init_req, &provider, &mut |_| {})
        .unwrap();
    assert_eq!(provider.created().len(), 1);

    // Add fe:react named "portal".
    let selection = ServiceSelection::parse("fe:react:portal").unwrap();
    let existing = vec!["api".to_owned()];
    let mut events = Vec::new();
    let outcome = engine
        .add_service(
            &AddServiceSpec {
                project_slug: "demo",
                layout: RepoLayout::MultiRepo,
                selection: &selection,
                existing_names: &existing,
                base_repo: None,
                request: &init_req,
            },
            &provider,
            &mut |e| events.push(e.clone()),
        )
        .expect("multi add succeeds");

    assert_eq!(outcome.name, "portal");
    assert_eq!(outcome.dir, "portal");
    assert_add_events(&events, "create_repo");
    assert_eq!(events, outcome.events);
    assert!(events.iter().all(|e| e.status == Status::Done));

    // Exactly ONE new repo, named {project}-{name}, with the full branch model.
    let created = provider.created();
    assert_eq!(created.len(), 2, "init repo + the one new repo");
    let new_repo = outcome.repo.expect("multi add returns the new repo");
    assert_eq!(new_repo.name, "demo-portal");
    for b in ["main", "dev", "staging"] {
        assert!(new_repo.branches.contains(&b.to_string()), "missing {b}");
    }
    // Rendered with the service's own context + the governance record.
    let files = provider.files_for(OWNER, "demo-portal");
    assert!(files.iter().any(|f| f.path == "branch-protection.json"));
    let readme = files
        .iter()
        .find(|f| f.path == "README.md")
        .expect("README");
    let text = String::from_utf8_lossy(&readme.contents);
    assert!(
        text.contains("demo-portal"),
        "README uses service.repo_name: {text}"
    );

    // The catalog row now carries the new repo (appended, not replacing).
    let rows = engine.list_projects().unwrap();
    assert_eq!(rows.len(), 1);
    let names: Vec<&str> = rows[0].repos.iter().map(|r| r.name.as_str()).collect();
    assert_eq!(names, vec!["demo-api", "demo-portal"]);
    // Audit trail: the add-service events were appended to the row.
    assert!(rows[0]
        .events
        .iter()
        .any(|e| e.key == "create_repo" && e.detail.contains("demo-portal")));
}

#[test]
fn multi_add_unnamed_defaults_to_the_type_tag() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = request("demo", RepoLayout::MultiRepo, selections(&["api:python"]));
    engine.initialize(&req, &provider, &mut |_| {}).unwrap();

    let selection = ServiceSelection::parse("fe:react").unwrap();
    let outcome = engine
        .add_service(
            &AddServiceSpec {
                project_slug: "demo",
                layout: RepoLayout::MultiRepo,
                selection: &selection,
                existing_names: &["api".to_owned()],
                base_repo: None,
                request: &req,
            },
            &provider,
            &mut |_| {},
        )
        .expect("unnamed add succeeds");
    assert_eq!(outcome.name, "fe");
    assert_eq!(outcome.repo.expect("repo").name, "demo-fe");
}

// ─────────────────────────────────────────────────────────────────────────────
// Monolith
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn mono_add_pushes_one_commit_to_dev_with_tree_and_updated_manifest() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let sels = selections(&["api:python"]);
    let init_req = request("monodemo", RepoLayout::Monolith, sels);
    let init = engine
        .initialize(&init_req, &provider, &mut |_| {})
        .unwrap();

    let selection = ServiceSelection::parse("fe:react:portal").unwrap();
    let mut events = Vec::new();
    let outcome = engine
        .add_service(
            &AddServiceSpec {
                project_slug: "monodemo",
                layout: RepoLayout::Monolith,
                selection: &selection,
                existing_names: &["api".to_owned()],
                base_repo: Some(&init.repo),
                request: &init_req,
            },
            &provider,
            &mut |e| events.push(e.clone()),
        )
        .expect("mono add succeeds");

    assert_eq!(outcome.name, "portal");
    assert!(outcome.repo.is_none(), "monolith add creates no repo");
    assert_add_events(&events, "commit");

    // Exactly ONE push, to dev, with the SPEC commit message.
    assert_eq!(
        provider.pushed(),
        vec![(
            format!("{OWNER}/monodemo"),
            "dev".to_owned(),
            "feat: add service portal (fe:react)".to_owned()
        )]
    );
    // No second repo was created.
    assert_eq!(provider.created().len(), 1);

    // The dev tree carries the composed service files AND the updated manifest.
    let dev = provider.files_on(OWNER, "monodemo", "dev");
    assert!(
        dev.iter().any(|f| f.path.starts_with("services/portal/")),
        "services/portal/… files pushed"
    );
    // Root-owned files never leak under services/portal/ (fe-react fixture ships some).
    for f in &dev {
        if let Some(rest) = f.path.strip_prefix("services/portal/") {
            assert!(!rest.contains(".github/") && !rest.contains(".claude/"));
            for stripped in ["LICENSE", "SECURITY.md", "CODEOWNERS", "CONTRIBUTING.md"] {
                assert_ne!(rest, stripped, "root-owned {stripped} leaked");
            }
        }
    }
    let manifest_file = dev
        .iter()
        .find(|f| f.path == "keel.services.json")
        .expect("updated manifest pushed");
    let manifest: ServicesManifest =
        serde_json::from_slice(&manifest_file.contents).expect("manifest parses back");
    let dirs: Vec<&str> = manifest.services.iter().map(|s| s.dir.as_str()).collect();
    assert_eq!(
        dirs,
        vec!["api", "portal"],
        "entry appended, existing preserved"
    );
    let portal = &manifest.services[1];
    assert_eq!(portal.language, "react");
    assert_eq!(portal.name, "Frontend");

    // main still has the ORIGINAL manifest (the commit landed on dev only).
    let main = provider.files_on(OWNER, "monodemo", "main");
    let original: ServicesManifest = serde_json::from_slice(
        &main
            .iter()
            .find(|f| f.path == "keel.services.json")
            .expect("original manifest")
            .contents,
    )
    .expect("parses");
    assert_eq!(original.services.len(), 1);
}

#[test]
fn mono_add_compounds_across_successive_adds() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let init_req = request(
        "monodemo",
        RepoLayout::Monolith,
        selections(&["api:python"]),
    );
    let init = engine
        .initialize(&init_req, &provider, &mut |_| {})
        .unwrap();

    for (entry, existing) in [
        ("fe:react:portal", vec!["api".to_owned()]),
        (
            "api:python:ingest",
            vec!["api".to_owned(), "portal".to_owned()],
        ),
    ] {
        let selection = ServiceSelection::parse(entry).unwrap();
        engine
            .add_service(
                &AddServiceSpec {
                    project_slug: "monodemo",
                    layout: RepoLayout::Monolith,
                    selection: &selection,
                    existing_names: &existing,
                    base_repo: Some(&init.repo),
                    request: &init_req,
                },
                &provider,
                &mut |_| {},
            )
            .unwrap_or_else(|e| panic!("add {entry} fails: {e}"));
    }

    // The second add read the manifest from dev, so both additions compound.
    let dev = provider.files_on(OWNER, "monodemo", "dev");
    let manifest: ServicesManifest = serde_json::from_slice(
        &dev.iter()
            .find(|f| f.path == "keel.services.json")
            .expect("manifest")
            .contents,
    )
    .expect("parses");
    let dirs: Vec<&str> = manifest.services.iter().map(|s| s.dir.as_str()).collect();
    assert_eq!(dirs, vec!["api", "portal", "ingest"]);
    assert_eq!(provider.pushed().len(), 2);
}

#[test]
fn mono_add_without_base_repo_is_a_validation_error() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = request(
        "monodemo",
        RepoLayout::Monolith,
        selections(&["api:python"]),
    );
    let selection = ServiceSelection::parse("fe:react").unwrap();
    let err = engine
        .add_service(
            &AddServiceSpec {
                project_slug: "monodemo",
                layout: RepoLayout::Monolith,
                selection: &selection,
                existing_names: &[],
                base_repo: None,
                request: &req,
            },
            &provider,
            &mut |_| {},
        )
        .expect_err("no base_repo must fail");
    assert!(matches!(err, KeelError::Validation(_)), "got {err:?}");
}

// ─────────────────────────────────────────────────────────────────────────────
// Collisions
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn collisions_error_cleanly_for_both_layouts() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let init_req = request("demo", RepoLayout::MultiRepo, selections(&["api:python"]));
    engine
        .initialize(&init_req, &provider, &mut |_| {})
        .unwrap();

    // Unnamed api against existing "api" ⇒ the ordinal default collides.
    let unnamed = ServiceSelection::parse("api:python").unwrap();
    let err = engine
        .add_service(
            &AddServiceSpec {
                project_slug: "demo",
                layout: RepoLayout::MultiRepo,
                selection: &unnamed,
                existing_names: &["api".to_owned()],
                base_repo: None,
                request: &init_req,
            },
            &provider,
            &mut |_| {},
        )
        .expect_err("default name collides");
    assert!(matches!(err, KeelError::Validation(_)), "got {err:?}");
    assert!(err.to_string().contains("api"), "{err}");

    // Explicit name colliding with an existing name.
    let named = ServiceSelection::parse("fe:react:api").unwrap();
    let err = engine
        .add_service(
            &AddServiceSpec {
                project_slug: "demo",
                layout: RepoLayout::MultiRepo,
                selection: &named,
                existing_names: &["api".to_owned()],
                base_repo: None,
                request: &init_req,
            },
            &provider,
            &mut |_| {},
        )
        .expect_err("explicit name collides");
    assert!(matches!(err, KeelError::Validation(_)), "got {err:?}");

    // Nothing was created beyond the initial repo, nothing pushed.
    assert_eq!(provider.created().len(), 1);
    assert!(provider.pushed().is_empty());
}

#[test]
fn mono_add_collides_on_a_manifest_dir_even_if_caller_omits_it() {
    // Defense in depth: existing_names is caller-supplied, but keel.services.json is the
    // monolith's source of truth — a dir already present there must also collide.
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let init_req = request(
        "monodemo",
        RepoLayout::Monolith,
        selections(&["api:python"]),
    );
    let init = engine
        .initialize(&init_req, &provider, &mut |_| {})
        .unwrap();

    let selection = ServiceSelection::parse("api:python:api").unwrap();
    let err = engine
        .add_service(
            &AddServiceSpec {
                project_slug: "monodemo",
                layout: RepoLayout::Monolith,
                selection: &selection,
                existing_names: &[], // caller "forgot" the existing api service
                base_repo: Some(&init.repo),
                request: &init_req,
            },
            &provider,
            &mut |_| {},
        )
        .expect_err("manifest dir collision");
    assert!(matches!(err, KeelError::Validation(_)), "got {err:?}");
    assert!(provider.pushed().is_empty(), "nothing pushed on collision");
}

// ─────────────────────────────────────────────────────────────────────────────
// Property: outcome name == resolve over (existing ∪ new) tail, never collides
// ─────────────────────────────────────────────────────────────────────────────

proptest::proptest! {
    #![proptest_config(proptest::prelude::ProptestConfig::with_cases(32))]

    #[test]
    fn add_name_matches_resolution_tail_and_never_collides(
        existing_raw in proptest::collection::btree_set("[a-z][a-z0-9]{1,8}", 0..5),
        entry_idx in 0usize..2,
        explicit in proptest::option::of("nm-[a-z0-9]{1,10}"),
    ) {
        let existing: Vec<String> = existing_raw.into_iter().collect();
        let base = ["api:python", "fe:react"][entry_idx];
        let mut selection = ServiceSelection::parse(base).expect("valid");
        selection.name = explicit;

        let tmp = TempDir::new().unwrap();
        let engine = engine_in(&tmp);
        let provider = FakeProvider::new();
        let req = request("demo", RepoLayout::MultiRepo, vec![selection.clone()]);

        let result = engine.add_service(
            &AddServiceSpec {
                project_slug: "demo",
                layout: RepoLayout::MultiRepo,
                selection: &selection,
                existing_names: &existing,
                base_repo: None,
                request: &req,
            },
            &provider,
            &mut |_| {},
        );

        // Oracle: resolve over existing (as explicit entries) ∪ the new selection at the tail.
        let mut combined: Vec<ServiceSelection> = existing
            .iter()
            .map(|n| ServiceSelection {
                service_type: selection.service_type,
                language: selection.language.clone(),
                name: Some(n.clone()),
            })
            .collect();
        combined.push(selection.clone());
        let oracle = resolve_service_names(&combined);

        match (result, oracle) {
            (Ok(outcome), Ok(names)) => {
                let expected = names.last().expect("tail");
                proptest::prop_assert_eq!(&outcome.name, expected);
                proptest::prop_assert!(
                    !existing.contains(&outcome.name),
                    "outcome name {} collides with existing set", outcome.name
                );
                proptest::prop_assert_eq!(
                    outcome.repo.map(|r| r.name),
                    Some(format!("demo-{}", outcome.name))
                );
            }
            (Err(KeelError::Validation(_)), Err(KeelError::Validation(_))) => {
                // Collision (or invalid existing name): both sides agree it is invalid.
            }
            (r, o) => {
                let dbg = format!("engine = {r:?} vs oracle = {o:?}");
                proptest::prop_assert!(false, "engine/oracle disagree: {}", dbg);
            }
        }
    }
}
