//! HTTP router, handlers, and the blueprint scan. Handlers stay thin: they map state + DTOs to
//! [`keel_core`] calls and translate [`keel_core::KeelError`] into HTTP responses.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::dto::{
    BlueprintDto, DepartmentDto, InitializeBody, InitializeResponse, ServiceLangDto, ServiceTypeDto,
};
use crate::state::AppState;

/// Build the full application router with permissive CORS for the Hub dev origin.
pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/departments", get(departments))
        .route("/api/departments/:id/users", get(department_users))
        .route("/api/users", get(users))
        .route("/api/service-catalog", get(service_catalog))
        .route("/api/blueprints", get(blueprints))
        .route("/api/initialize", post(initialize))
        .route("/api/projects", get(projects))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

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
        // v3: contributors are org-global (SPEC §11). A department's "users" are the global
        // people (mapped to the plain User shape); legacy fixtures fall back to per-dept users.
        Some(dept) => {
            if state.data.people.is_empty() {
                Json(dept.users.clone()).into_response()
            } else {
                let users: Vec<keel_core::User> = state
                    .data
                    .people
                    .iter()
                    .map(keel_core::Person::user)
                    .collect();
                Json(users).into_response()
            }
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("unknown department: {id:?}") })),
        )
            .into_response(),
    }
}

/// `GET /api/users` — the global v3 contributors (SPEC §13), serialized [`keel_core::Person`]s.
async fn users(State(state): State<AppState>) -> Json<Vec<keel_core::Person>> {
    Json(state.data.people.clone())
}

/// `GET /api/service-catalog` — the 5 service types with per-language availability (SPEC §13).
async fn service_catalog(State(state): State<AppState>) -> Json<Vec<ServiceTypeDto>> {
    Json(scan_service_catalog(&state.blueprints_dir))
}

/// The `(slug, display name)` language options per service type, in design order (SPEC §13).
fn languages_for(t: keel_core::ServiceType) -> &'static [(&'static str, &'static str)] {
    use keel_core::ServiceType;
    match t {
        ServiceType::Fe => &[("react", "React"), ("vue", "Vue"), ("blazor", "Blazor")],
        ServiceType::Api => &[
            ("dotnet", ".NET"),
            ("python", "Python"),
            ("node", "Node.js"),
        ],
        ServiceType::Wk => &[("dotnet", ".NET"), ("python", "Python"), ("go", "Go")],
        ServiceType::Dp => &[("python", "Python"), ("dbt", "dbt"), ("spark", "Spark")],
        ServiceType::Inf => &[("terraform", "Terraform"), ("bicep", "Bicep")],
    }
}

/// Build the service catalog for a blueprints base dir (pure given the filesystem — no state).
///
/// A `{type}:{lang}` combo is `available` iff the blueprint directory
/// `{blueprints_dir}/services/{tag}-{lang}` exists at request time. Types come from
/// [`keel_core::ServiceType::all`] so the catalog can never drift from the core contract.
#[must_use]
pub fn scan_service_catalog(blueprints_dir: &std::path::Path) -> Vec<ServiceTypeDto> {
    let services_dir = blueprints_dir.join("services");
    keel_core::ServiceType::all()
        .into_iter()
        .map(|t| {
            let tag = t.tag();
            let langs = languages_for(t)
                .iter()
                .map(|(id, name)| ServiceLangDto {
                    id: (*id).to_owned(),
                    name: (*name).to_owned(),
                    available: services_dir.join(format!("{tag}-{id}")).is_dir(),
                })
                .collect();
            ServiceTypeDto {
                id: tag.to_owned(),
                tag: tag.to_uppercase(),
                label: t.label().to_owned(),
                langs,
            }
        })
        .collect()
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
    let entries = match std::fs::read_dir(blueprints_dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => {
            return Err(keel_core::KeelError::Io(format!(
                "reading blueprints dir {}: {e}",
                blueprints_dir.display()
            )))
        }
    };
    let mut out = Vec::new();
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

async fn initialize(State(state): State<AppState>, Json(raw): Json<serde_json::Value>) -> Response {
    // 1. Body → DTO. Deserialized from a raw Value so shape errors (e.g. an unknown v3 service
    //    type) surface as our uniform 400 `{ "error": … }` instead of axum's default rejection.
    let body: InitializeBody = match serde_json::from_value(raw) {
        Ok(b) => b,
        Err(e) => {
            return error_response(&keel_core::KeelError::Validation(format!(
                "invalid request body: {e}"
            )))
        }
    };

    // 2. DTO → Selection (fallible: an invalid v3 `layout` token is a 400)…
    let selection = match body.try_to_selection() {
        Ok(s) => s,
        Err(e) => return error_response(&e),
    };

    // …then pure resolution against the shared catalog (validation → 400 on bad input).
    let req = match state.data.resolve(&selection) {
        Ok(r) => r,
        Err(e) => return error_response(&e),
    };

    // 3. Run the (blocking, subprocess-heavy) engine off the async runtime. The gh provider is built
    //    INSIDE the blocking task — it is not `Sync`, so it cannot live in shared state.
    let engine = state.engine.clone();
    let owner = state.owner.clone();
    let result = tokio::task::spawn_blocking(move || {
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use std::path::PathBuf;
    use tower::ServiceExt; // for `oneshot`

    fn test_state() -> AppState {
        AppState::new(PathBuf::from("../../blueprints"), "test-owner".to_owned())
    }

    async fn body_json(resp: Response) -> serde_json::Value {
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .expect("read body");
        serde_json::from_slice(&bytes).expect("json body")
    }

    async fn get(uri: &str) -> Response {
        app(test_state())
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(Body::empty())
                    .expect("req"),
            )
            .await
            .expect("response")
    }

    #[tokio::test]
    async fn health_ok() {
        let resp = get("/api/health").await;
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(body_json(resp).await, json!({ "status": "ok" }));
    }

    #[tokio::test]
    async fn departments_lists_divisions_without_users() {
        let resp = get("/api/departments").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let arr = body_json(resp).await;
        let arr = arr.as_array().expect("array");
        assert!(!arr.is_empty());
        let first = &arr[0];
        assert!(first.get("id").is_some() && first.get("team_slug").is_some());
        assert!(first.get("users").is_none(), "users must not leak");
        assert!(arr.iter().any(|d| d["id"] == "energy"));
        assert_eq!(arr.len(), 7, "the 7 design GBAs");
    }

    #[tokio::test]
    async fn department_users_ok() {
        let resp = get("/api/departments/energy/users").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let arr = body_json(resp).await;
        let arr = arr.as_array().expect("array");
        assert!(arr.iter().any(|u| u["github_login"] == "Alex793x"));
    }

    #[tokio::test]
    async fn department_users_404_unknown() {
        let resp = get("/api/departments/does-not-exist/users").await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        assert!(body_json(resp).await.get("error").is_some());
    }

    #[tokio::test]
    async fn blueprints_returns_python_service() {
        let resp = get("/api/blueprints").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let arr = body_json(resp).await;
        assert!(arr
            .as_array()
            .expect("array")
            .iter()
            .any(|b| b["name"] == "python-service"));
    }

    async fn post_initialize(state: AppState, body: serde_json::Value) -> Response {
        app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/initialize")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .expect("req"),
            )
            .await
            .expect("response")
    }

    /// A valid v2 (legacy) initialize body — no `layout`, no `services`.
    fn legacy_body() -> serde_json::Value {
        json!({
            "project_name": "abc-svc", "blueprint": "python-service",
            "department_id": "energy", "user_ids": ["u-alex"],
            "service_kind": "rest-api", "description": "d", "author": "a"
        })
    }

    /// A scratch dir under the system temp root, wiped clean per test.
    fn scratch_blueprints_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("keel-api-test-{}-{name}", std::process::id()));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("wipe scratch dir");
        }
        std::fs::create_dir_all(&dir).expect("create scratch dir");
        dir
    }

    #[tokio::test]
    async fn initialize_rejects_unknown_department_with_400() {
        // Exercises body → Selection → catalog.resolve error mapping without any network.
        let mut body = legacy_body();
        body["department_id"] = json!("nope");
        let resp = post_initialize(test_state(), body).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        assert!(body_json(resp).await["error"]
            .as_str()
            .unwrap_or_default()
            .contains("department"));
    }

    // ── v3: /api/users ────────────────────────────────────────────────────────

    #[tokio::test]
    async fn users_lists_the_eleven_global_people() {
        let resp = get("/api/users").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let arr = body_json(resp).await;
        let arr = arr.as_array().expect("array");
        assert_eq!(arr.len(), 11, "10 design PEOPLE + the real E2E account");
        assert!(arr.iter().any(|p| p["github_login"] == "Alex793x"));
        for p in arr {
            for field in ["id", "name", "email", "github_login", "chapter"] {
                assert!(p[field].is_string(), "person missing {field}: {p}");
            }
        }
    }

    // ── v3: /api/service-catalog ─────────────────────────────────────────────

    #[tokio::test]
    async fn service_catalog_lists_the_five_types_in_design_order() {
        let resp = get("/api/service-catalog").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let arr = body_json(resp).await;
        let arr = arr.as_array().expect("array");
        let ids: Vec<&str> = arr.iter().filter_map(|t| t["id"].as_str()).collect();
        assert_eq!(ids, vec!["fe", "api", "wk", "dp", "inf"]);
        let tags: Vec<&str> = arr.iter().filter_map(|t| t["tag"].as_str()).collect();
        assert_eq!(tags, vec!["FE", "API", "WK", "DP", "INF"]);
        assert_eq!(arr[0]["label"], "Frontend");

        // Full language sets, in design order, with display names (SPEC §13).
        let langs = |i: usize| -> Vec<(String, String)> {
            arr[i]["langs"]
                .as_array()
                .expect("langs")
                .iter()
                .map(|l| {
                    assert!(l["available"].is_boolean(), "available must be bool: {l}");
                    (
                        l["id"].as_str().expect("id").to_owned(),
                        l["name"].as_str().expect("name").to_owned(),
                    )
                })
                .collect()
        };
        let pairs = |xs: &[(&str, &str)]| -> Vec<(String, String)> {
            xs.iter()
                .map(|(a, b)| ((*a).to_owned(), (*b).to_owned()))
                .collect()
        };
        assert_eq!(
            langs(0),
            pairs(&[("react", "React"), ("vue", "Vue"), ("blazor", "Blazor")])
        );
        assert_eq!(
            langs(1),
            pairs(&[
                ("dotnet", ".NET"),
                ("python", "Python"),
                ("node", "Node.js")
            ])
        );
        assert_eq!(
            langs(2),
            pairs(&[("dotnet", ".NET"), ("python", "Python"), ("go", "Go")])
        );
        assert_eq!(
            langs(3),
            pairs(&[("python", "Python"), ("dbt", "dbt"), ("spark", "Spark")])
        );
        assert_eq!(
            langs(4),
            pairs(&[("terraform", "Terraform"), ("bicep", "Bicep")])
        );
    }

    /// Availability is computed at request time from dir existence under `{blueprints}/services/`.
    #[tokio::test]
    async fn service_catalog_availability_flips_on_blueprint_dir_existence() {
        let dir = scratch_blueprints_dir("catalog-flip");
        let state = AppState::new(dir.clone(), "test-owner".to_owned());

        let api_python = |v: &serde_json::Value| -> bool {
            v.as_array()
                .expect("array")
                .iter()
                .find(|t| t["id"] == "api")
                .expect("api type")["langs"]
                .as_array()
                .expect("langs")
                .iter()
                .find(|l| l["id"] == "python")
                .expect("python lang")["available"]
                .as_bool()
                .expect("bool")
        };

        // No services/api-python dir ⇒ unavailable.
        let resp = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri("/api/service-catalog")
                    .body(Body::empty())
                    .expect("req"),
            )
            .await
            .expect("response");
        assert!(!api_python(&body_json(resp).await));

        // Create the blueprint dir ⇒ available on the next request (no restart needed).
        std::fs::create_dir_all(dir.join("services/api-python")).expect("mk blueprint dir");
        let resp = app(state)
            .oneshot(
                Request::builder()
                    .uri("/api/service-catalog")
                    .body(Body::empty())
                    .expect("req"),
            )
            .await
            .expect("response");
        assert!(api_python(&body_json(resp).await));

        std::fs::remove_dir_all(&dir).expect("cleanup scratch dir");
    }

    // ── v3: initialize body (additive fields) ────────────────────────────────

    #[test]
    fn legacy_initialize_body_maps_to_the_exact_v2_selection() {
        let body: InitializeBody = serde_json::from_value(legacy_body()).expect("legacy body");
        assert!(body.layout.is_none());
        assert!(body.services.is_empty());
        let sel = body.try_to_selection().expect("legacy is always valid");
        // Byte-identical legacy behavior: the exact Selection the v2 code path produced.
        assert_eq!(
            sel,
            keel_core::Selection {
                project_name: "abc-svc".to_owned(),
                blueprint: "python-service".to_owned(),
                department_id: "energy".to_owned(),
                user_ids: vec!["u-alex".to_owned()],
                service_kind: "rest-api".to_owned(),
                description: "d".to_owned(),
                author: "a".to_owned(),
                layout: keel_core::RepoLayout::default(),
                services: vec![],
            }
        );
    }

    #[test]
    fn v3_initialize_body_deserializes_layout_and_services() {
        let mut raw = legacy_body();
        raw["layout"] = json!("monolith");
        raw["services"] = json!([
            { "type": "api", "lang": "python" },
            { "type": "fe", "lang": "react" }
        ]);
        let body: InitializeBody = serde_json::from_value(raw).expect("v3 body");
        let sel = body.try_to_selection().expect("valid layout");
        assert_eq!(sel.layout, keel_core::RepoLayout::Monolith);
        assert_eq!(sel.services.len(), 2);
        assert_eq!(sel.services[0].service_type, keel_core::ServiceType::Api);
        assert_eq!(sel.services[0].language, "python");
        assert_eq!(sel.services[1].service_type, keel_core::ServiceType::Fe);
        assert_eq!(sel.services[1].language, "react");
    }

    #[tokio::test]
    async fn initialize_rejects_invalid_layout_with_400() {
        let mut body = legacy_body();
        body["layout"] = json!("solo");
        let resp = post_initialize(test_state(), body).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        assert!(body_json(resp).await["error"]
            .as_str()
            .unwrap_or_default()
            .contains("layout"));
    }

    #[tokio::test]
    async fn initialize_rejects_unknown_service_type_with_400() {
        let mut body = legacy_body();
        body["services"] = json!([{ "type": "gpu", "lang": "python" }]);
        let resp = post_initialize(test_state(), body).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        assert!(body_json(resp).await.get("error").is_some());
    }

    // ── v3: scan_service_catalog (pure, given a base dir) ────────────────────

    #[test]
    fn scan_service_catalog_reads_availability_from_the_base_dir() {
        let dir = scratch_blueprints_dir("scan-pure");
        std::fs::create_dir_all(dir.join("services/fe-react")).expect("mk blueprint dir");
        // A file (not a dir) must NOT count as available.
        std::fs::write(dir.join("services/wk-go"), b"not a dir").expect("write file");

        let catalog = scan_service_catalog(&dir);
        assert_eq!(catalog.len(), 5);
        let avail = |type_id: &str, lang: &str| -> bool {
            catalog
                .iter()
                .find(|t| t.id == type_id)
                .expect("type")
                .langs
                .iter()
                .find(|l| l.id == lang)
                .expect("lang")
                .available
        };
        assert!(avail("fe", "react"));
        assert!(!avail("api", "python"));
        assert!(!avail("wk", "go"), "plain file must not count as blueprint");

        std::fs::remove_dir_all(&dir).expect("cleanup scratch dir");
    }
}
