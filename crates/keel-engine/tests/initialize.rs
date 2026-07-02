//! Integration + property tests for the 8-step initialization workflow, single-service path.
//!
//! These run against `keel_github::FakeProvider` (no network). A bare init (no explicit `services`)
//! defaults to a single `api:python` service (SPEC §12), which the engine renders from the hermetic
//! fixture blueprint at `tests/fixtures/services/api-python/`. The blueprints dir is the fixtures
//! dir; the resulting single repo is named `<project>-api`. (The `blueprint` field on the request is
//! vestigial for this path and no longer selects the blueprint.)

use std::path::PathBuf;

use keel_core::{
    Department, InitRequest, ProgressEvent, ServiceKind, Status, User, WORKFLOW_STEPS,
};
use keel_engine::Engine;
use keel_github::FakeProvider;
use tempfile::TempDir;

const OWNER: &str = "Alex793x";

/// Absolute path to the fixtures directory (used as the blueprints search path).
fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

fn sample_request(project: &str, kind: ServiceKind) -> InitRequest {
    InitRequest {
        project_name: project.to_owned(),
        blueprint: "api-python".to_owned(),
        department: Department {
            id: "buildings".into(),
            name: "Buildings".into(),
            team_slug: "buildings".into(),
        },
        users: vec![User {
            id: "u1".into(),
            name: "Alex".into(),
            email: "alex@ramboll.com".into(),
            github_login: "Alex793x".into(),
        }],
        service_kind: kind,
        description: "A fixture service for tests.".into(),
        author: "Alex <alex@ramboll.com>".into(),
        layout: keel_core::RepoLayout::default(),
        services: vec![],
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

/// Collect events into a vec via the on_event callback.
fn collect(engine: &Engine, req: &InitRequest, provider: &FakeProvider) -> Vec<ProgressEvent> {
    let mut events = Vec::new();
    engine
        .initialize(req, provider, &mut |e| events.push(e.clone()))
        .expect("initialize should succeed");
    events
}

/// Assert that `events` contains exactly the 8 canonical keys, in order, once each.
fn assert_canonical_order(events: &[ProgressEvent]) {
    let keys: Vec<&str> = events.iter().map(|e| e.key.as_str()).collect();
    assert_eq!(
        keys, WORKFLOW_STEPS,
        "events must be the 8 canonical keys in order"
    );
    let steps: Vec<u8> = events.iter().map(|e| e.step).collect();
    assert_eq!(
        steps,
        vec![1, 2, 3, 4, 5, 6, 7, 8],
        "step numbers must be 1..=8 in order"
    );
}

#[test]
fn initialize_emits_all_eight_steps_in_order() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = sample_request("invoicing-api", ServiceKind::RestApi);

    let events = collect(&engine, &req, &provider);
    assert_canonical_order(&events);
    // First run: nothing skipped.
    assert!(events.iter().all(|e| e.status != Status::Skipped));
    // Exactly one repo created.
    assert_eq!(provider.created().len(), 1);
}

#[test]
fn initialize_twice_is_idempotent() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = sample_request("invoicing-api", ServiceKind::RestApi);

    let first = collect(&engine, &req, &provider);
    let second = collect(&engine, &req, &provider);

    // Both runs emit all 8 keys in canonical order.
    assert_canonical_order(&first);
    assert_canonical_order(&second);

    // Exactly ONE repo created across both runs.
    assert_eq!(
        provider.created().len(),
        1,
        "second run must not create a 2nd repo"
    );

    // Exactly ONE catalog row.
    let projects = engine.list_projects().unwrap();
    assert_eq!(
        projects.len(),
        1,
        "second run must not duplicate the catalog row"
    );

    // The second run skips create_repo + commit (idempotent), everything else Done.
    let by_key = |events: &[ProgressEvent], key: &str| -> Status {
        events.iter().find(|e| e.key == key).unwrap().status
    };
    assert_eq!(by_key(&second, "create_repo"), Status::Skipped);
    assert_eq!(by_key(&second, "commit"), Status::Skipped);
    assert_eq!(by_key(&second, "register"), Status::Done);

    // First run did NOT skip create_repo.
    assert_eq!(by_key(&first, "create_repo"), Status::Done);
}

#[test]
fn list_projects_roundtrips_what_initialize_registered() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();

    // Empty before anything is registered.
    assert!(engine.list_projects().unwrap().is_empty());

    let req_a = sample_request("alpha-svc", ServiceKind::RestApi);
    let req_b = sample_request("beta-svc", ServiceKind::RestApi);
    let out_a = engine.initialize(&req_a, &provider, &mut |_| {}).unwrap();
    let out_b = engine.initialize(&req_b, &provider, &mut |_| {}).unwrap();

    let projects = engine.list_projects().unwrap();
    assert_eq!(projects.len(), 2);

    let names: Vec<&str> = projects.iter().map(|p| p.project.as_str()).collect();
    assert!(names.contains(&"alpha-svc"));
    assert!(names.contains(&"beta-svc"));

    // The persisted rows equal the returned outcomes (full round-trip incl. events).
    let stored_a = projects.iter().find(|p| p.project == "alpha-svc").unwrap();
    let stored_b = projects.iter().find(|p| p.project == "beta-svc").unwrap();
    assert_eq!(stored_a, &out_a);
    assert_eq!(stored_b, &out_b);
}

#[test]
fn outcome_carries_complete_event_audit_trail() {
    let tmp = TempDir::new().unwrap();
    let engine = engine_in(&tmp);
    let provider = FakeProvider::new();
    let req = sample_request("audit-svc", ServiceKind::RestApi);

    let outcome = engine.initialize(&req, &provider, &mut |_| {}).unwrap();
    assert_canonical_order(&outcome.events);
    // The default single service renders the `api-python` fixture blueprint (version 0.3.0); its
    // repo takes the multi-repo `{project}-{tag}` name.
    assert_eq!(outcome.blueprint_version, "0.3.0");
    assert_eq!(outcome.repo.owner, OWNER);
    assert_eq!(outcome.repo.name, "audit-svc-api");
    // dev + staging were ensured.
    assert!(outcome.repo.branches.contains(&"dev".to_string()));
    assert!(outcome.repo.branches.contains(&"staging".to_string()));
}

proptest::proptest! {
    /// Regardless of project name / service kind, the 8 events come out in canonical order, and
    /// exactly one repo + one catalog row exist after a single run.
    #[test]
    fn events_always_canonical_order(
        name in "[a-z][a-z0-9-]{2,40}",
    ) {
        let tmp = TempDir::new().unwrap();
        let engine = engine_in(&tmp);
        let provider = FakeProvider::new();
        let req = sample_request(&name, ServiceKind::RestApi);

        let mut events = Vec::new();
        engine.initialize(&req, &provider, &mut |e| events.push(e.clone())).unwrap();

        let keys: Vec<&str> = events.iter().map(|e| e.key.as_str()).collect();
        proptest::prop_assert_eq!(keys, WORKFLOW_STEPS.to_vec());
        proptest::prop_assert_eq!(provider.created().len(), 1);
        proptest::prop_assert_eq!(engine.list_projects().unwrap().len(), 1);
    }

    /// Re-running with the same request never creates a 2nd repo nor a 2nd catalog row, and still
    /// emits all 8 events on the second run.
    #[test]
    fn idempotent_under_repeat(name in "[a-z][a-z0-9-]{2,40}") {
        let tmp = TempDir::new().unwrap();
        let engine = engine_in(&tmp);
        let provider = FakeProvider::new();
        let req = sample_request(&name, ServiceKind::RestApi);

        let mut second = Vec::new();
        engine.initialize(&req, &provider, &mut |_| {}).unwrap();
        engine.initialize(&req, &provider, &mut |e| second.push(e.clone())).unwrap();

        proptest::prop_assert_eq!(provider.created().len(), 1);
        proptest::prop_assert_eq!(engine.list_projects().unwrap().len(), 1);
        let keys: Vec<&str> = second.iter().map(|e| e.key.as_str()).collect();
        proptest::prop_assert_eq!(keys, WORKFLOW_STEPS.to_vec());
    }
}
