//! keel-api — axum HTTP API fronting the Keel engine.
//!
//! Phase-0 stub: a health endpoint only. `Fleet-Api-RS` adds `/api/departments`,
//! `/api/departments/:id/users`, `/api/blueprints`, `POST /api/initialize`, `/api/projects`,
//! CORS, and engine wiring (see SPEC §3.5).

use axum::{routing::get, Json, Router};

#[tokio::main]
async fn main() {
    let app = Router::new().route("/api/health", get(health));
    let addr = "0.0.0.0:8787";
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind keel-api");
    println!("keel-api listening on http://{addr}");
    axum::serve(listener, app).await.expect("serve keel-api");
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}
