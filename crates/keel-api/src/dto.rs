//! Wire DTOs for the HTTP surface (SPEC §3.5).
//!
//! These are the JSON shapes the Hub sees. The mocked catalog itself lives in
//! [`keel_core::catalog`]; an [`InitializeBody`] maps to a [`keel_core::Selection`] for resolution.

use serde::{Deserialize, Serialize};

use keel_core::{RepoLayout, Selection, ServiceSelection};

/// `GET /api/departments` item (department without its user list).
#[derive(Debug, Clone, Serialize)]
pub struct DepartmentDto {
    pub id: String,
    pub name: String,
    pub team_slug: String,
}

/// `GET /api/service-catalog`: one language option of a service type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServiceLangDto {
    /// Language slug (e.g. `"python"`) — the `lang` half of a [`ServiceSelection`].
    pub id: String,
    /// Display name (e.g. `"Node.js"`, `".NET"`).
    pub name: String,
    /// Whether the `blueprints/services/{tag}-{id}` blueprint exists on disk.
    pub available: bool,
}

/// `GET /api/service-catalog` item: one of the 5 service types, in design card order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServiceTypeDto {
    /// Lowercase type id (`"fe"` … `"inf"`) — the `type` half of a [`ServiceSelection`].
    pub id: String,
    /// Uppercase design chip tag (`"FE"` … `"INF"`).
    pub tag: String,
    /// Human label from [`keel_core::ServiceType::label`] (e.g. `"Frontend"`).
    pub label: String,
    pub langs: Vec<ServiceLangDto>,
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
///
/// The v3 fields (`layout`, `services`) are strictly additive (`serde(default)`): a legacy v2 body
/// deserializes to `layout: None` + `services: []`, which [`Self::try_to_selection`] maps onto the
/// exact v2 [`Selection`] (default layout, empty services) — legacy behavior is byte-identical.
#[derive(Debug, Clone, Deserialize)]
pub struct InitializeBody {
    pub project_name: String,
    pub blueprint: String,
    pub department_id: String,
    pub user_ids: Vec<String>,
    pub service_kind: String,
    pub description: String,
    pub author: String,
    /// v3: repo layout token, `"multi-repo"` (default) or `"monolith"` (SPEC §13).
    #[serde(default)]
    pub layout: Option<String>,
    /// v3: chosen service components, e.g. `[{"type":"api","lang":"python"}]`. Empty ⇒ legacy path.
    #[serde(default)]
    pub services: Vec<ServiceSelection>,
}

impl InitializeBody {
    /// Map the HTTP body onto the neutral [`Selection`] resolved by [`keel_core::MockCatalog::resolve`].
    ///
    /// # Errors
    /// [`keel_core::KeelError::Validation`] if `layout` is present but not a valid
    /// [`RepoLayout`] token (the caller maps this to HTTP 400).
    pub fn try_to_selection(&self) -> keel_core::Result<Selection> {
        let layout = match self.layout.as_deref() {
            Some(token) => token.parse::<RepoLayout>()?,
            None => RepoLayout::default(),
        };
        Ok(Selection {
            project_name: self.project_name.clone(),
            blueprint: self.blueprint.clone(),
            department_id: self.department_id.clone(),
            user_ids: self.user_ids.clone(),
            service_kind: self.service_kind.clone(),
            description: self.description.clone(),
            author: self.author.clone(),
            layout,
            services: self.services.clone(),
        })
    }
}

/// `POST /api/initialize` response.
#[derive(Debug, Clone, Serialize)]
pub struct InitializeResponse {
    pub events: Vec<keel_core::ProgressEvent>,
    pub outcome: keel_core::InitOutcome,
}
