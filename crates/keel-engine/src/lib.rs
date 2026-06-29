//! # keel-engine
//!
//! The orchestration plane: [`Engine::initialize`] runs the 8 ordered, idempotent steps
//! (`signin → form → render → create_repo → commit → branches → seed_ci → register`), emitting a
//! [`keel_core::ProgressEvent`] per step and persisting the result to a JSON catalog/audit file.
//!
//! All GitHub I/O goes through an injected [`keel_core::RepoProvider`], so the workflow is
//! unit/property-tested with `keel_github::FakeProvider` — no network required.
//!
//! > Phase-0 stub: signatures frozen; `Fleet-Engine-RS` fills `initialize` + `list_projects` + tests.

#![forbid(unsafe_code)]

mod catalog;
mod workflow;

use std::path::{Path, PathBuf};

use keel_core::{InitOutcome, InitRequest, ProgressEvent, RepoProvider, Result};

/// The initialization engine. Holds the blueprint search path, the GitHub owner that new repos are
/// created under, and the catalog location.
#[derive(Debug, Clone)]
pub struct Engine {
    blueprints_dir: PathBuf,
    owner: String,
    catalog_path: PathBuf,
}

impl Engine {
    /// Create an engine that reads blueprints from `blueprints_dir`, creates repos under `owner`,
    /// and writes the catalog to `<blueprints_dir>/../.keel/catalog.json`.
    #[must_use]
    pub fn new(blueprints_dir: PathBuf, owner: String) -> Self {
        let catalog_path = blueprints_dir
            .parent()
            .unwrap_or(Path::new("."))
            .join(".keel")
            .join("catalog.json");
        Self {
            blueprints_dir,
            owner,
            catalog_path,
        }
    }

    /// Create an engine with an explicit catalog path (used by tests).
    #[must_use]
    pub fn with_catalog(blueprints_dir: PathBuf, owner: String, catalog_path: PathBuf) -> Self {
        Self {
            blueprints_dir,
            owner,
            catalog_path,
        }
    }

    /// The GitHub owner (account/org) new repositories are created under.
    #[must_use]
    pub fn owner(&self) -> &str {
        &self.owner
    }

    /// Directory blueprints are loaded from.
    #[must_use]
    pub fn blueprints_dir(&self) -> &Path {
        &self.blueprints_dir
    }

    /// Path of the JSON catalog/audit file.
    #[must_use]
    pub fn catalog_path(&self) -> &Path {
        &self.catalog_path
    }

    /// Run the full 8-step workflow. Idempotent: re-running for an existing repo does not create a
    /// second repository or duplicate the catalog entry.
    ///
    /// # Errors
    /// Propagates validation, render, and provider errors as [`keel_core::KeelError`].
    pub fn initialize(
        &self,
        req: &InitRequest,
        provider: &dyn RepoProvider,
        on_event: &mut dyn FnMut(&ProgressEvent),
    ) -> Result<InitOutcome> {
        workflow::run(
            req,
            &self.owner,
            &self.blueprints_dir,
            &self.catalog_path,
            provider,
            on_event,
        )
    }

    /// All projects recorded in the catalog.
    ///
    /// # Errors
    /// [`keel_core::KeelError::Io`] if the catalog cannot be read/parsed.
    pub fn list_projects(&self) -> Result<Vec<InitOutcome>> {
        catalog::read(&self.catalog_path)
    }
}
