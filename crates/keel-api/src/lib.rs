//! # keel-api
//!
//! The axum HTTP server that fronts the Keel engine and serves the mocked department/user catalog
//! the Hub consumes (SPEC §3.5).
//!
//! Routes:
//! - `GET  /api/health` → `{ "status": "ok" }`
//! - `GET  /api/departments` → `[{ id, name, team_slug }]`
//! - `GET  /api/departments/:id/users` → `[{ id, name, email, github_login }]` (404 if unknown)
//! - `GET  /api/blueprints` → `[{ name, title, description, version, parameters }]`
//! - `POST /api/initialize` → `{ events: [ProgressEvent], outcome: InitOutcome }`
//! - `GET  /api/projects` → `[InitOutcome]`
//!
//! Layout (each module has one job, keeping coupling low):
//! - [`state`] — [`AppState`] + config defaults.
//! - [`dto`] — the JSON wire shapes; [`dto::InitializeBody::to_selection`] bridges to the engine.
//! - [`routes`] — the router + thin handlers + the blueprint scan.
//!
//! The mocked catalog and the body→[`keel_core::InitRequest`] resolution live in
//! [`keel_core::catalog`] (shared with `keel-cli`), so the two entry points never drift.

#![forbid(unsafe_code)]

mod dto;
mod routes;
mod state;

pub use dto::{BlueprintDto, DepartmentDto, InitializeBody, InitializeResponse};
pub use routes::{app, scan_blueprints};
pub use state::{AppState, DEFAULT_ADDR, DEFAULT_BLUEPRINTS_DIR, DEFAULT_OWNER};

/// Re-exported for convenience: the mocked catalog the server is built around.
pub use keel_core::MockCatalog;
