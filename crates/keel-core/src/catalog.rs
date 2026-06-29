//! Mocked department/user catalog (MVP) + selection→request resolution.
//!
//! The MVP mocks the organisation's departments and users (real SSO/SCIM directory integration is a
//! later step). This module is the **single source of truth** for that catalog and for the pure
//! resolution of a user's [`Selection`] into a validated [`InitRequest`]. Both `keel-api` (HTTP) and
//! `keel-cli` (headless) build a [`Selection`] and call [`MockCatalog::resolve`], so the two entry
//! points can never drift.

use serde::{Deserialize, Serialize};

use crate::{Department, InitRequest, KeelError, Result, ServiceKind, User};

/// The canonical mocked catalog, embedded at build time (shared with the Hub and CLI).
const EMBEDDED: &str = include_str!("../../../fixtures/mock-data.json");

/// A department plus its users, as stored in `fixtures/mock-data.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DepartmentRecord {
    pub id: String,
    pub name: String,
    pub team_slug: String,
    #[serde(default)]
    pub users: Vec<User>,
}

impl DepartmentRecord {
    /// The public [`Department`] view (without the user list).
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MockCatalog {
    pub departments: Vec<DepartmentRecord>,
}

impl MockCatalog {
    /// Parse the build-time embedded catalog. Panics only on a corrupt compiled-in fixture.
    #[must_use]
    pub fn embedded() -> Self {
        serde_json::from_str(EMBEDDED).expect("embedded fixtures/mock-data.json is valid")
    }

    /// Load the catalog, preferring `fixtures/mock-data.json` relative to the CWD, then the embedded
    /// copy. Use this from headless entry points (the CLI) that may run against a working tree.
    #[must_use]
    pub fn load() -> Self {
        if let Ok(raw) = std::fs::read_to_string("fixtures/mock-data.json") {
            if let Ok(parsed) = serde_json::from_str(&raw) {
                return parsed;
            }
        }
        Self::embedded()
    }

    /// Parse a catalog from raw JSON (tests).
    ///
    /// # Errors
    /// Surfaces the underlying `serde_json` error on malformed input.
    pub fn parse_json(raw: &str) -> serde_json::Result<Self> {
        serde_json::from_str(raw)
    }

    /// Find a department by id.
    #[must_use]
    pub fn department(&self, id: &str) -> Option<&DepartmentRecord> {
        self.departments.iter().find(|d| d.id == id)
    }

    /// Resolve a [`Selection`] against the catalog into a validated [`InitRequest`].
    ///
    /// Pure (no I/O) and the single shared resolution path for the API and the CLI.
    ///
    /// # Errors
    /// [`KeelError::Validation`] if the department or any user id is unknown, no users are selected,
    /// the `service_kind` is invalid, or the request fails basic validation.
    pub fn resolve(&self, sel: &Selection) -> Result<InitRequest> {
        let dept = self.department(&sel.department_id).ok_or_else(|| {
            KeelError::Validation(format!("unknown department_id: {:?}", sel.department_id))
        })?;

        if sel.user_ids.is_empty() {
            return Err(KeelError::Validation(
                "at least one user must be selected".to_owned(),
            ));
        }

        let mut users: Vec<User> = Vec::with_capacity(sel.user_ids.len());
        for uid in &sel.user_ids {
            let user = dept
                .users
                .iter()
                .find(|u| &u.id == uid)
                .cloned()
                .ok_or_else(|| {
                    KeelError::Validation(format!(
                        "unknown user_id {uid:?} for department {:?}",
                        sel.department_id
                    ))
                })?;
            users.push(user);
        }

        let service_kind: ServiceKind = sel.service_kind.parse()?;

        let req = InitRequest {
            project_name: sel.project_name.clone(),
            blueprint: sel.blueprint.clone(),
            department: dept.department(),
            users,
            service_kind,
            description: sel.description.clone(),
            author: sel.author.clone(),
        };
        req.validate_basic()?;
        Ok(req)
    }
}

/// A user's project selection — the neutral input to [`MockCatalog::resolve`]. The API builds one
/// from its request body; the CLI builds one from its flags.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Selection {
    pub project_name: String,
    pub blueprint: String,
    pub department_id: String,
    pub user_ids: Vec<String>,
    pub service_kind: String,
    pub description: String,
    pub author: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A valid selection against the embedded catalog (platform-engineering / u-alex).
    fn valid_selection() -> Selection {
        Selection {
            project_name: "invoicing-api".to_owned(),
            blueprint: "python-service".to_owned(),
            department_id: "platform-engineering".to_owned(),
            user_ids: vec!["u-alex".to_owned()],
            service_kind: "rest-api".to_owned(),
            description: "An invoicing service.".to_owned(),
            author: "Alex Holmberg".to_owned(),
        }
    }

    #[test]
    fn embedded_catalog_loads_and_is_populated() {
        let cat = MockCatalog::embedded();
        assert!(!cat.departments.is_empty());
        assert!(cat.departments.iter().all(|d| !d.users.is_empty()));
        assert!(cat.department("platform-engineering").is_some());
    }

    #[test]
    fn resolves_a_valid_selection() {
        let cat = MockCatalog::embedded();
        let req = cat.resolve(&valid_selection()).expect("valid");
        assert_eq!(req.project_name, "invoicing-api");
        assert_eq!(req.department.id, "platform-engineering");
        assert_eq!(req.users.len(), 1);
        assert_eq!(req.users[0].github_login, "Alex793x");
        assert_eq!(req.service_kind, ServiceKind::RestApi);
    }

    #[test]
    fn resolves_multiple_users_in_order() {
        let cat = MockCatalog::embedded();
        let sel = Selection {
            user_ids: vec!["u-alex".to_owned(), "u-bo".to_owned()],
            service_kind: "worker".to_owned(),
            ..valid_selection()
        };
        let req = cat.resolve(&sel).expect("valid");
        assert_eq!(req.users.len(), 2);
        assert_eq!(req.service_kind, ServiceKind::Worker);
    }

    #[test]
    fn unknown_department_is_validation_error() {
        let cat = MockCatalog::embedded();
        let sel = Selection {
            department_id: "nope".to_owned(),
            ..valid_selection()
        };
        let err = cat.resolve(&sel).unwrap_err();
        assert!(matches!(err, KeelError::Validation(_)));
        assert!(err.to_string().contains("department"));
    }

    #[test]
    fn unknown_user_is_validation_error() {
        let cat = MockCatalog::embedded();
        let sel = Selection {
            user_ids: vec!["u-ghost".to_owned()],
            ..valid_selection()
        };
        let err = cat.resolve(&sel).unwrap_err();
        assert!(matches!(err, KeelError::Validation(_)));
        assert!(err.to_string().contains("user_id"));
    }

    #[test]
    fn user_from_other_department_is_rejected() {
        // u-anya belongs to "buildings", not "platform-engineering".
        let cat = MockCatalog::embedded();
        let sel = Selection {
            user_ids: vec!["u-anya".to_owned()],
            ..valid_selection()
        };
        assert!(matches!(
            cat.resolve(&sel).unwrap_err(),
            KeelError::Validation(_)
        ));
    }

    #[test]
    fn empty_users_is_rejected() {
        let cat = MockCatalog::embedded();
        let sel = Selection {
            user_ids: vec![],
            ..valid_selection()
        };
        assert!(matches!(
            cat.resolve(&sel).unwrap_err(),
            KeelError::Validation(_)
        ));
    }

    #[test]
    fn bad_service_kind_is_rejected() {
        let cat = MockCatalog::embedded();
        let sel = Selection {
            service_kind: "frontend".to_owned(),
            ..valid_selection()
        };
        assert!(matches!(
            cat.resolve(&sel).unwrap_err(),
            KeelError::Validation(_)
        ));
    }

    #[test]
    fn bad_project_name_is_rejected() {
        let cat = MockCatalog::embedded();
        let sel = Selection {
            project_name: "Bad_Name".to_owned(),
            ..valid_selection()
        };
        assert!(matches!(
            cat.resolve(&sel).unwrap_err(),
            KeelError::Validation(_)
        ));
    }

    #[test]
    fn parse_json_round_trips() {
        let raw = r#"{"departments":[{"id":"x","name":"X","team_slug":"x","users":[]}]}"#;
        let cat = MockCatalog::parse_json(raw).expect("parse");
        assert_eq!(cat.departments.len(), 1);
        assert_eq!(cat.department("x").unwrap().name, "X");
    }
}
