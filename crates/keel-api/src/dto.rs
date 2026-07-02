//! Wire DTOs for the HTTP surface (SPEC §3.5).
//!
//! These are the JSON shapes the Hub sees. The mocked catalog itself lives in
//! [`keel_core::catalog`]; an [`InitializeBody`] maps to a [`keel_core::Selection`] for resolution.

use serde::{Deserialize, Serialize};

use keel_core::Selection;

/// `GET /api/departments` item (department without its user list).
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

/// `POST /api/initialize` request body.
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

impl InitializeBody {
    /// Map the HTTP body onto the neutral [`Selection`] resolved by [`keel_core::MockCatalog::resolve`].
    #[must_use]
    pub fn to_selection(&self) -> Selection {
        Selection {
            project_name: self.project_name.clone(),
            blueprint: self.blueprint.clone(),
            department_id: self.department_id.clone(),
            user_ids: self.user_ids.clone(),
            service_kind: self.service_kind.clone(),
            description: self.description.clone(),
            author: self.author.clone(),
            // v3 body fields (`layout`, `services`) are wired by the API fleet area (SPEC §13);
            // legacy bodies keep byte-identical behavior meanwhile.
            layout: keel_core::RepoLayout::default(),
            services: vec![],
        }
    }
}

/// `POST /api/initialize` response.
#[derive(Debug, Clone, Serialize)]
pub struct InitializeResponse {
    pub events: Vec<keel_core::ProgressEvent>,
    pub outcome: keel_core::InitOutcome,
}
