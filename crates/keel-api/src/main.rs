//! keel-api binary — wires [`keel_api::app`] to a TCP listener.
//!
//! Environment overrides:
//! - `KEEL_API_ADDR`        bind address (default `0.0.0.0:8787`)
//! - `KEEL_BLUEPRINTS_DIR`  blueprints directory (default `blueprints`)
//! - `KEEL_OWNER`           GitHub owner for new repos (default `Alex793x`)

use keel_api::{app, AppState, DEFAULT_ADDR};

#[tokio::main]
async fn main() {
    // Honor RUST_LOG; fall back to a sensible default.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "keel_api=info,tower_http=info".into()),
        )
        .init();

    let state = AppState::from_env();
    tracing::info!(
        owner = %state.owner,
        blueprints_dir = %state.blueprints_dir.display(),
        "keel-api state initialized"
    );

    let app = app(state);

    let addr = std::env::var("KEEL_API_ADDR").unwrap_or_else(|_| DEFAULT_ADDR.to_owned());
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("bind keel-api");
    tracing::info!("keel-api listening on http://{addr}");
    axum::serve(listener, app).await.expect("serve keel-api");
}
