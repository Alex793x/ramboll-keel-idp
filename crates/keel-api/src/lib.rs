//! # keel-api
//!
//! The axum HTTP server that fronts the Keel engine and serves the mocked department/user
//! catalog the Hub consumes (SPEC §3.5).
//!
//! Routes:
//! - `GET  /api/health` → `{ "status": "ok" }`
//! - `GET  /api/departments` → `[{ id, name, team_slug }]`
//! - `GET  /api/departments/:id/users` → `[{ id, name, email, github_login }]` (404 if unknown)
//! - `GET  /api/blueprints` → `[{ name, title, description, version, parameters }]`
//! - `POST /api/initialize` → `{ events: [ProgressEvent], outcome: InitOutcome }`
//! - `GET  /api/projects` → `[InitOutcome]`
//!
//! Design notes:
//! - The mocked dept/user data is embedded with `include_str!` and parsed once at startup.
//! - Request → [`keel_core::InitRequest`] resolution lives in the **pure** [`resolve_init_request`]
//!   function so it can be unit-tested without a server or a provider.
//! - No [`keel_core::RepoProvider`] is stored in shared state (`FakeProvider` isn't `Sync`). The
//!   `/api/initialize` handler constructs a [`keel_github::GhCliProvider`] *inside* the handler and
//!   runs the blocking engine on `spawn_blocking`.

#![forbid(unsafe_code)]

use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tower_http::cors::CorsLayer;

use keel_core::{Department, InitRequest, ServiceKind, User};
use keel_engine::Engine;

/// The canonical mocked department/user catalog (single source of truth shared with the Hub).
const MOCK_DATA: &str = include_str!("../../../fixtures/mock-data.json");

/// Default GitHub owner new repos are created under (overridable via `KEEL_OWNER`).
pub const DEFAULT_OWNER: &str = "Alex793x";

/// Default blueprints directory (overridable via `KEEL_BLUEPRINTS_DIR`).
pub const DEFAULT_BLUEPRINTS_DIR: &str = "blueprints";

/// Default bind address (overridable via `KEEL_API_ADDR`).
pub const DEFAULT_ADDR: &str = "0.0.0.0:8787";

// ─────────────────────────────────────────────────────────────────────────────
// Mock data model (mirrors fixtures/mock-data.json)
// ─────────────────────────────────────────────────────────────────────────────

/// A department plus its users, as stored in `fixtures/mock-data.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentRecord {
    pub id: String,
    pub name: String,
    pub team_slug: String,
    #[serde(default)]
    pub users: Vec<User>,
}

impl DepartmentRecord {
    /// The department without its users (the public [`keel_core::Department`] shape).
    #[must_use]
    pub fn department(&self) -> Department {
        Department {
            id: self.id.clone(),
            name: self.name.clone(),
            team_slug: self.team_slug.clone(),
        }
    }
}

/// The parsed `fixtures/mock-data.json` document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockData {
    pub departments: Vec<DepartmentRecord>,
}

impl MockData {
    /// Parse the embedded mock data. Panics only on a corrupt build-time fixture.
    #[must_use]
    pub fn load() -> Self {
        serde_json::from_str(MOCK_DATA).expect("fixtures/mock-data.json is valid")
    }

    /// Parse mock data from an arbitrary JSON string (used by tests).
    ///
    /// # Errors
    /// Returns the underlying `serde_json` error on malformed input.
    pub fn parse_json(raw: &str) -> serde_json::Result<Self> {
        serde_json::from_str(raw)
    }

    /// Find a department by id.
    #[must_use]
    pub fn department(&self, id: &str) -> Option<&DepartmentRecord> {
        self.departments.iter().find(|d| d.id == id)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire DTOs
// ─────────────────────────────────────────────────────────────────────────────

/// `GET /api/departments` item.
#[derive(Debug, Clone, Serialize)]
pub struct DepartmentDto {
    pub id: String,
    pub name: String,
    pub team_slug: String,
}

/// `GET /api/blueprints` item.
#[derive(Debug, Clone, Serialize)]
pub struct BlueprintDto {
    pub name: String,
    pub title: String,
    pub description: String,
    pub version: String,
    pub parameters: Vec<keel_blueprint::Parameter>,
}

/// `POST /api/initialize` request body (SPEC §3.5).
#[derive(Debug, Clone, Deserialize)]
pub struct InitializeBody {
    pub project_name: String,
    pub blueprint: String,
    pub department_id: String,
    pub user_ids: Vec<String>,
    pub service_kind: String,
    pub description: String,
    pub author: String,
}

/// `POST /api/initialize` response (SPEC §3.5).
#[derive(Debug, Clone, Serialize)]
pub struct InitializeResponse {
    pub events: Vec<keel_core::ProgressEvent>,
    pub outcome: keel_core::InitOutcome,
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure request resolution (the unit-tested core)
// ─────────────────────────────────────────────────────────────────────────────

/// Resolve an [`InitializeBody`] against the mocked catalog into a [`keel_core::InitRequest`].
///
/// This is a **pure** function: no I/O, no engine, no provider — just data resolution and
/// validation, so it can be exhaustively unit-tested.
///
/// # Errors
/// - [`keel_core::KeelError::Validation`] if the department is unknown, a user id is unknown,
///   no users are selected, the `service_kind` is invalid, or the request fails basic validation.
pub fn resolve_init_request(
    data: &MockData,
    body: &InitializeBody,
) -> keel_core::Result<InitRequest> {
    let dept_record = data.department(&body.department_id).ok_or_else(|| {
        keel_core::KeelError::Validation(format!("unknown department_id: {:?}", body.department_id))
    })?;

    if body.user_ids.is_empty() {
        return Err(keel_core::KeelError::Validation(
            "at least one user_id must be selected".to_owned(),
        ));
    }

    let mut users: Vec<User> = Vec::with_capacity(body.user_ids.len());
    for uid in &body.user_ids {
        let user = dept_record
            .users
            .iter()
            .find(|u| &u.id == uid)
            .cloned()
            .ok_or_else(|| {
                keel_core::KeelError::Validation(format!(
                    "unknown user_id {uid:?} for department {:?}",
                    body.department_id
                ))
            })?;
        users.push(user);
    }

    let service_kind: ServiceKind = body.service_kind.parse()?;

    let req = InitRequest {
        project_name: body.project_name.clone(),
        blueprint: body.blueprint.clone(),
        department: dept_record.department(),
        users,
        service_kind,
        description: body.description.clone(),
        author: body.author.clone(),
    };

    req.validate_basic()?;
    Ok(req)
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared state + router
// ─────────────────────────────────────────────────────────────────────────────

/// Application state shared by every handler.
///
/// Intentionally holds **no** [`keel_core::RepoProvider`] — providers (e.g. `FakeProvider`) are not
/// `Sync`, and the `gh`-backed provider must be created per request anyway.
#[derive(Clone)]
pub struct AppState {
    pub data: Arc<MockData>,
    pub engine: Arc<Engine>,
    pub blueprints_dir: PathBuf,
    pub owner: String,
}

impl AppState {
    /// Build the default state from environment overrides (`KEEL_BLUEPRINTS_DIR`, `KEEL_OWNER`).
    #[must_use]
    pub fn from_env() -> Self {
        let blueprints_dir = std::env::var("KEEL_BLUEPRINTS_DIR")
            .unwrap_or_else(|_| DEFAULT_BLUEPRINTS_DIR.to_owned());
        let owner = std::env::var("KEEL_OWNER").unwrap_or_else(|_| DEFAULT_OWNER.to_owned());
        Self::new(PathBuf::from(blueprints_dir), owner)
    }

    /// Build state from an explicit blueprints dir + owner.
    #[must_use]
    pub fn new(blueprints_dir: PathBuf, owner: String) -> Self {
        let engine = Engine::new(blueprints_dir.clone(), owner.clone());
        Self {
            data: Arc::new(MockData::load()),
            engine: Arc::new(engine),
            blueprints_dir,
            owner,
        }
    }
}

/// Build the full application router with permissive CORS for the Hub dev origin.
pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/departments", get(departments))
        .route("/api/departments/:id/users", get(department_users))
        .route("/api/blueprints", get(blueprints))
        .route("/api/initialize", post(initialize))
        .route("/api/projects", get(projects))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

// ─────────────────────────────────────────────────────────────────────────────
// Error → response mapping
// ─────────────────────────────────────────────────────────────────────────────

/// Map a [`keel_core::KeelError`] to an HTTP status + JSON `{ "error": "…" }` body.
fn error_response(err: &keel_core::KeelError) -> Response {
    let status = match err {
        keel_core::KeelError::Validation(_) => StatusCode::BAD_REQUEST,
        keel_core::KeelError::Conflict(_) => StatusCode::CONFLICT,
        keel_core::KeelError::Render(_)
        | keel_core::KeelError::Github(_)
        | keel_core::KeelError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (status, Json(json!({ "error": err.to_string() }))).into_response()
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers (thin)
// ─────────────────────────────────────────────────────────────────────────────

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

async fn departments(State(state): State<AppState>) -> Json<Vec<DepartmentDto>> {
    let list = state
        .data
        .departments
        .iter()
        .map(|d| DepartmentDto {
            id: d.id.clone(),
            name: d.name.clone(),
            team_slug: d.team_slug.clone(),
        })
        .collect();
    Json(list)
}

async fn department_users(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.data.department(&id) {
        Some(dept) => Json(dept.users.clone()).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("unknown department: {id:?}") })),
        )
            .into_response(),
    }
}

async fn blueprints(State(state): State<AppState>) -> Response {
    match scan_blueprints(&state.blueprints_dir) {
        Ok(list) => Json(list).into_response(),
        Err(e) => error_response(&e),
    }
}

/// Scan the blueprints directory, loading each subdir's manifest into a [`BlueprintDto`].
///
/// Subdirectories that fail to load (missing/invalid `blueprint.yaml`) are skipped rather than
/// failing the whole request. A missing blueprints directory yields an empty list.
///
/// # Errors
/// [`keel_core::KeelError::Io`] only on an unexpected read error of the directory itself.
pub fn scan_blueprints(blueprints_dir: &std::path::Path) -> keel_core::Result<Vec<BlueprintDto>> {
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(blueprints_dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => {
            return Err(keel_core::KeelError::Io(format!(
                "reading blueprints dir {}: {e}",
                blueprints_dir.display()
            )))
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // Best-effort: skip subdirs without a loadable manifest.
        if let Ok(m) = keel_blueprint::load_manifest(&path) {
            out.push(BlueprintDto {
                name: m.name,
                title: m.title,
                description: m.description,
                version: m.version,
                parameters: m.parameters,
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

async fn initialize(State(state): State<AppState>, Json(body): Json<InitializeBody>) -> Response {
    // 1. Pure resolution (validation happens here, returns 400 on bad input).
    let req = match resolve_init_request(&state.data, &body) {
        Ok(r) => r,
        Err(e) => return error_response(&e),
    };

    // 2. Run the (blocking, subprocess-heavy) engine off the async runtime.
    let engine = state.engine.clone();
    let owner = state.owner.clone();
    let result = tokio::task::spawn_blocking(move || {
        // Build the gh provider INSIDE the blocking task (it is not Sync, so it can't live in
        // shared state).
        let provider = keel_github::GhCliProvider::new(owner);
        let mut events: Vec<keel_core::ProgressEvent> = Vec::new();
        let outcome = engine.initialize(&req, &provider, &mut |ev| events.push(ev.clone()))?;
        Ok::<_, keel_core::KeelError>((events, outcome))
    })
    .await;

    match result {
        Ok(Ok((events, outcome))) => Json(InitializeResponse { events, outcome }).into_response(),
        Ok(Err(e)) => error_response(&e),
        Err(join_err) => error_response(&keel_core::KeelError::Io(format!(
            "engine task panicked: {join_err}"
        ))),
    }
}

async fn projects(State(state): State<AppState>) -> Response {
    match state.engine.list_projects() {
        Ok(list) => Json(list).into_response(),
        Err(e) => error_response(&e),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt; // for `oneshot`

    fn test_state() -> AppState {
        // Use the repo-root blueprints dir relative to the workspace; tests that exercise the
        // server don't depend on the blueprint contents existing.
        AppState::new(PathBuf::from("../../blueprints"), "test-owner".to_owned())
    }

    async fn body_json(resp: Response) -> serde_json::Value {
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn health_ok() {
        let app = app(test_state());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(v, json!({ "status": "ok" }));
    }

    #[tokio::test]
    async fn departments_lists_mock_divisions() {
        let app = app(test_state());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/departments")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        let arr = v.as_array().expect("array");
        assert!(!arr.is_empty());
        // Each item has exactly the three fields (no leaked users).
        let first = &arr[0];
        assert!(first.get("id").is_some());
        assert!(first.get("name").is_some());
        assert!(first.get("team_slug").is_some());
        assert!(first.get("users").is_none());
        // Platform Engineering must be present (the E2E owner lives there).
        assert!(arr.iter().any(|d| d["id"] == "platform-engineering"));
    }

    #[tokio::test]
    async fn department_users_ok() {
        let app = app(test_state());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/departments/platform-engineering/users")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        let arr = v.as_array().expect("array");
        // Alex793x is the real test account in this department.
        assert!(arr.iter().any(|u| u["github_login"] == "Alex793x"));
        let first = &arr[0];
        for k in ["id", "name", "email", "github_login"] {
            assert!(first.get(k).is_some(), "user missing {k}");
        }
    }

    #[tokio::test]
    async fn department_users_404_unknown() {
        let app = app(test_state());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/departments/does-not-exist/users")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let v = body_json(resp).await;
        assert!(v.get("error").is_some());
    }

    #[tokio::test]
    async fn blueprints_returns_array() {
        let app = app(test_state());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/blueprints")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert!(v.is_array());
        // The python-service blueprint should be discoverable.
        let arr = v.as_array().unwrap();
        assert!(arr.iter().any(|b| b["name"] == "python-service"));
    }

    #[test]
    fn mock_data_loads() {
        let data = MockData::load();
        assert!(!data.departments.is_empty());
        // Every department has at least one user.
        assert!(data.departments.iter().all(|d| !d.users.is_empty()));
    }

    #[test]
    fn resolve_valid_request() {
        let data = MockData::load();
        let body = InitializeBody {
            project_name: "invoicing-api".into(),
            blueprint: "python-service".into(),
            department_id: "platform-engineering".into(),
            user_ids: vec!["u-alex".into()],
            service_kind: "rest-api".into(),
            description: "An invoicing service.".into(),
            author: "Alex Holmberg".into(),
        };
        let req = resolve_init_request(&data, &body).expect("valid");
        assert_eq!(req.project_name, "invoicing-api");
        assert_eq!(req.department.id, "platform-engineering");
        assert_eq!(req.users.len(), 1);
        assert_eq!(req.users[0].github_login, "Alex793x");
        assert_eq!(req.service_kind, ServiceKind::RestApi);
    }

    #[test]
    fn resolve_multiple_users() {
        let data = MockData::load();
        let body = InitializeBody {
            project_name: "data-pipeline".into(),
            blueprint: "python-service".into(),
            department_id: "platform-engineering".into(),
            user_ids: vec!["u-alex".into(), "u-bo".into()],
            service_kind: "worker".into(),
            description: "A worker.".into(),
            author: "Bo".into(),
        };
        let req = resolve_init_request(&data, &body).expect("valid");
        assert_eq!(req.users.len(), 2);
        assert_eq!(req.service_kind, ServiceKind::Worker);
    }

    #[test]
    fn resolve_unknown_department_errors() {
        let data = MockData::load();
        let body = InitializeBody {
            project_name: "abc".into(),
            blueprint: "python-service".into(),
            department_id: "nope".into(),
            user_ids: vec!["u-alex".into()],
            service_kind: "rest-api".into(),
            description: "d".into(),
            author: "a".into(),
        };
        let err = resolve_init_request(&data, &body).unwrap_err();
        assert!(matches!(err, keel_core::KeelError::Validation(_)));
        assert!(err.to_string().contains("department"));
    }

    #[test]
    fn resolve_unknown_user_errors() {
        let data = MockData::load();
        let body = InitializeBody {
            project_name: "abc".into(),
            blueprint: "python-service".into(),
            department_id: "platform-engineering".into(),
            user_ids: vec!["u-ghost".into()],
            service_kind: "rest-api".into(),
            description: "d".into(),
            author: "a".into(),
        };
        let err = resolve_init_request(&data, &body).unwrap_err();
        assert!(matches!(err, keel_core::KeelError::Validation(_)));
        assert!(err.to_string().contains("user_id"));
    }

    #[test]
    fn resolve_user_from_other_department_errors() {
        // u-anya belongs to "buildings", not "platform-engineering".
        let data = MockData::load();
        let body = InitializeBody {
            project_name: "abc".into(),
            blueprint: "python-service".into(),
            department_id: "platform-engineering".into(),
            user_ids: vec!["u-anya".into()],
            service_kind: "rest-api".into(),
            description: "d".into(),
            author: "a".into(),
        };
        let err = resolve_init_request(&data, &body).unwrap_err();
        assert!(matches!(err, keel_core::KeelError::Validation(_)));
    }

    #[test]
    fn resolve_empty_users_errors() {
        let data = MockData::load();
        let body = InitializeBody {
            project_name: "abc".into(),
            blueprint: "python-service".into(),
            department_id: "platform-engineering".into(),
            user_ids: vec![],
            service_kind: "rest-api".into(),
            description: "d".into(),
            author: "a".into(),
        };
        let err = resolve_init_request(&data, &body).unwrap_err();
        assert!(matches!(err, keel_core::KeelError::Validation(_)));
    }

    #[test]
    fn resolve_bad_service_kind_errors() {
        let data = MockData::load();
        let body = InitializeBody {
            project_name: "abc".into(),
            blueprint: "python-service".into(),
            department_id: "platform-engineering".into(),
            user_ids: vec!["u-alex".into()],
            service_kind: "frontend".into(),
            description: "d".into(),
            author: "a".into(),
        };
        let err = resolve_init_request(&data, &body).unwrap_err();
        assert!(matches!(err, keel_core::KeelError::Validation(_)));
    }

    #[test]
    fn resolve_bad_project_name_errors() {
        let data = MockData::load();
        let body = InitializeBody {
            project_name: "Bad_Name".into(),
            blueprint: "python-service".into(),
            department_id: "platform-engineering".into(),
            user_ids: vec!["u-alex".into()],
            service_kind: "rest-api".into(),
            description: "d".into(),
            author: "a".into(),
        };
        let err = resolve_init_request(&data, &body).unwrap_err();
        assert!(matches!(err, keel_core::KeelError::Validation(_)));
    }
}
