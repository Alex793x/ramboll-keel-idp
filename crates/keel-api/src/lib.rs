//! # keel-api
//!
//! The axum HTTP server that fronts the Keel engine and serves the mocked department/user catalog
//! the Hub consumes (SPEC §3.5).
//!
//! Routes:
//! - `GET  /api/health` → `{ "status": "ok" }`
//! - `GET  /api/departments` → `[{ id, name, team_slug }]`
//! - `GET  /api/departments/:id/users` → `[{ id, name, email, github_login }]` (404 if unknown)
//! - `GET  /api/users` → `[{ id, name, email, github_login, chapter }]` (v3 global contributors)
//! - `GET  /api/service-catalog` → `[{ id, tag, label, langs: [{ id, name, available }] }]`
//! - `GET  /api/blueprints` → `[{ name, title, description, version, parameters }]`
//! - `POST /api/initialize` → `{ events: [ProgressEvent], outcome: InitOutcome }` — the body
//!   optionally carries v3 `layout` + `services`; legacy v2 bodies behave byte-identically
//! - `GET  /api/projects` → `[InitOutcome]`
//! - `GET  /api/projects/:id/overview` → the SPEC §18 project-dashboard document (200 | 404)
//! - `POST /api/projects/:id/services` → the SPEC §19.4 add-service document (200 | 400 | 404)
//!
//! Layout (each module has one job, keeping coupling low):
//! - [`state`] — [`AppState`] + config defaults.
//! - [`dto`] — the JSON wire shapes; [`dto::InitializeBody::try_to_selection`] bridges to the engine.
//! - [`routes`] — the router + thin handlers + the blueprint/service-catalog scans.
//! - [`additions`] — the v5 `keel.additions.json` overlay store (SPEC §19.4).
//!
//! The mocked catalog and the body→[`keel_core::InitRequest`] resolution live in
//! [`keel_core::catalog`] (shared with `keel-cli`), so the two entry points never drift.

#![forbid(unsafe_code)]

mod additions;
mod dto;
mod overview;
mod routes;
mod state;

pub use dto::{
    BlueprintDto, DepartmentDto, InitializeBody, InitializeResponse, ServiceLangDto, ServiceTypeDto,
};
pub use overview::{
    overview, AddServiceBody, AddServiceResponseDto, AuthorDto, BranchCommitDto, BranchDto,
    FeedCommitDto, PersonDto, PrDto, ProjectInfoDto, ProjectOverviewDto, RepoDto, RunDto,
    ServiceDto, TeamMemberDto, TipDto,
};
pub use routes::{app, scan_blueprints, scan_service_catalog};
pub use state::{AppState, DEFAULT_ADDR, DEFAULT_BLUEPRINTS_DIR, DEFAULT_OWNER};

/// Re-exported for convenience: the mocked catalog the server is built around.
pub use keel_core::MockCatalog;
