//! HTTP router, handlers, and the blueprint scan. Handlers stay thin: they map state + DTOs to
//! [`keel_core`] calls and translate [`keel_core::KeelError`] into HTTP responses.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::dto::{BlueprintDto, DepartmentDto, InitializeBody, InitializeResponse};
use crate::state::AppState;

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

async fn initialize(State(state): State<AppState>, Json(body): Json<InitializeBody>) -> Response {
    // 1. Pure resolution against the shared catalog (validation → 400 on bad input).
    let req = match state.data.resolve(&body.to_selection()) {
        Ok(r) => r,
        Err(e) => return error_response(&e),
    };

    // 2. Run the (blocking, subprocess-heavy) engine off the async runtime. The gh provider is built
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

    #[tokio::test]
    async fn initialize_rejects_unknown_department_with_400() {
        // Exercises body → Selection → catalog.resolve error mapping without any network.
        let body = json!({
            "project_name": "abc-svc", "blueprint": "python-service",
            "department_id": "nope", "user_ids": ["u-alex"],
            "service_kind": "rest-api", "description": "d", "author": "a"
        });
        let resp = app(test_state())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/initialize")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .expect("req"),
            )
            .await
            .expect("response");
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        assert!(body_json(resp).await["error"]
            .as_str()
            .unwrap_or_default()
            .contains("department"));
    }
}
